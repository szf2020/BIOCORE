// ============================================================
// ai-suggestion-engine.ts — AI 自动建议生成后台引擎
// 每5分钟分析所有运行中批次, 生成工艺调整建议
// 建议写入 ai_suggestions 表, 通过 WebSocket 推送到前端
// ============================================================

// CUSUMDetector duck-typing 接口 (避免跨包 rootDir 问题)
interface CUSUMDetector {
  detect(value: number): { anomaly: boolean; cumPos: number; cumNeg: number; normalized: number };
  isConfigured(): boolean;
}

// 去重窗口: 同一参数 30 分钟内不重复生成建议
const DEDUP_WINDOW_MS = 30 * 60 * 1000;
const ANALYSIS_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

// 最近生成的建议记录 (用于去重)
const recentSuggestions = new Map<string, number>(); // key: `${batchId}:${targetParam}` → timestamp

function dedupKey(batchId: string, param: string): string {
  return `${batchId}:${param}`;
}

function shouldSkip(batchId: string, param: string): boolean {
  const key = dedupKey(batchId, param);
  const last = recentSuggestions.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return true;
  return false;
}

function markGenerated(batchId: string, param: string): void {
  recentSuggestions.set(dedupKey(batchId, param), Date.now());
  // 清理过期条目
  const now = Date.now();
  for (const [k, t] of recentSuggestions) {
    if (now - t > DEDUP_WINDOW_MS * 2) recentSuggestions.delete(k);
  }
}

// 阈值配置
const THRESHOLDS = {
  DO_LOW: 20,           // DO < 20% 触发
  TEMP_DRIFT: 1.0,      // 温度偏离设定值 > 1°C
  PH_DRIFT: 0.2,        // pH 偏离设定值 > 0.2
  PRESSURE_HIGH: 0.8,   // 罐压 > 0.8 bar
};

// 默认设定值 (将来从配方读取)
const SETPOINTS: Record<string, number> = {
  temperature: 37.0,
  pH: 7.0,
  DO: 30.0,
  pressure: 0.5,
};

interface SuggestionDeps {
  sqlite: {
    createSuggestion: (s: any) => number;
    getPendingSuggestions: (batchId?: string) => any[];
  };
  feedAdvisor: {
    recommend: (params: any) => { suggestedRate: number; reason: string; confidence: number; action: string };
  };
  softSensorEngine: {
    predict?: (modelId: string, features: Record<string, number>) => any;
    listModels?: () => any[];
  };
  cusumDetectors: Map<string, Map<string, CUSUMDetector>>;
  broadcast: (channel: string, payload: any, batchId?: string | null, reactorId?: string | null) => void;
  getRunningBatches: () => Array<{
    batchId: string;
    reactorId: string;
    pv: Record<string, number>; // 当前过程值
  }>;
}

function generateSuggestions(deps: SuggestionDeps): void {
  const batches = deps.getRunningBatches();

  for (const { batchId, reactorId, pv } of batches) {
    const suggestions: Array<{
      suggestion_type: string;
      source_module: string;
      target_param: string;
      current_value?: number;
      suggested_value?: number;
      confidence?: number;
      reasoning: string;
    }> = [];

    // ─── 1. 阈值检查 ──────────────────────────────────
    const temp = pv.temperature ?? pv.TEMP_PV;
    const ph = pv.pH ?? pv.PH_PV;
    const doVal = pv.DO ?? pv.DO_PV;
    const pressure = pv.pressure ?? pv.PRESSURE_PV;

    // DO 过低
    if (doVal !== undefined && doVal < THRESHOLDS.DO_LOW && !shouldSkip(batchId, 'DO')) {
      suggestions.push({
        suggestion_type: 'parameter_adjust',
        source_module: 'threshold-engine',
        target_param: 'DO',
        current_value: doVal,
        suggested_value: SETPOINTS.DO,
        confidence: 0.8,
        reasoning: `溶氧 ${doVal.toFixed(1)}% 低于阈值 ${THRESHOLDS.DO_LOW}%。建议增加搅拌转速或通气量以提升溶氧水平。`,
      });
    }

    // 温度偏移
    if (temp !== undefined && Math.abs(temp - SETPOINTS.temperature) > THRESHOLDS.TEMP_DRIFT && !shouldSkip(batchId, 'temperature')) {
      const direction = temp > SETPOINTS.temperature ? '偏高' : '偏低';
      suggestions.push({
        suggestion_type: 'parameter_adjust',
        source_module: 'threshold-engine',
        target_param: 'temperature',
        current_value: temp,
        suggested_value: SETPOINTS.temperature,
        confidence: 0.75,
        reasoning: `温度 ${temp.toFixed(1)}°C ${direction}, 偏离设定值 ${Math.abs(temp - SETPOINTS.temperature).toFixed(2)}°C。请检查加热/冷却系统。`,
      });
    }

    // pH 偏移
    if (ph !== undefined && Math.abs(ph - SETPOINTS.pH) > THRESHOLDS.PH_DRIFT && !shouldSkip(batchId, 'pH')) {
      const direction = ph > SETPOINTS.pH ? '偏高' : '偏低';
      suggestions.push({
        suggestion_type: 'parameter_adjust',
        source_module: 'threshold-engine',
        target_param: 'pH',
        current_value: ph,
        suggested_value: SETPOINTS.pH,
        confidence: 0.7,
        reasoning: `pH ${ph.toFixed(2)} ${direction}, 偏离设定值 ${Math.abs(ph - SETPOINTS.pH).toFixed(3)}。建议检查酸碱补料泵。`,
      });
    }

    // 罐压过高
    if (pressure !== undefined && pressure > THRESHOLDS.PRESSURE_HIGH && !shouldSkip(batchId, 'pressure')) {
      suggestions.push({
        suggestion_type: 'parameter_adjust',
        source_module: 'threshold-engine',
        target_param: 'pressure',
        current_value: pressure,
        suggested_value: SETPOINTS.pressure,
        confidence: 0.85,
        reasoning: `罐压 ${pressure.toFixed(2)} bar 超过阈值 ${THRESHOLDS.PRESSURE_HIGH} bar。检查排气阀和通气量设置。`,
      });
    }

    // ─── 2. CUSUM 联动建议 ────────────────────────────
    const detMap = deps.cusumDetectors.get(batchId);
    if (detMap) {
      for (const [channel, detector] of detMap) {
        if (!shouldSkip(batchId, `cusum_${channel}`)) {
          const val = pv[channel] ?? pv[channel.toUpperCase() + '_PV'];
          if (val === undefined) continue;
          const result = detector.detect(val);
          if (result.anomaly) {
            const direction = result.cumPos > result.cumNeg ? '持续偏高' : '持续偏低';
            suggestions.push({
              suggestion_type: 'anomaly_alert',
              source_module: 'cusum-engine',
              target_param: channel,
              current_value: val,
              confidence: 0.7,
              reasoning: `CUSUM检测: ${channel} ${direction}, 累积偏差 ${result.normalized.toFixed(1)}σ。建议核查该参数控制环路。`,
            });
          }
        }
      }
    }

    // ─── 3. 写入建议 ──────────────────────────────────
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30分钟过期

    for (const s of suggestions) {
      try {
        const id = deps.sqlite.createSuggestion({
          batch_id: batchId,
          ...s,
          expires_at: expiresAt,
        });

        markGenerated(batchId, s.target_param);

        // WebSocket 推送
        deps.broadcast('ai_suggestion', {
          id,
          batch_id: batchId,
          ...s,
          status: 'pending',
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
        }, batchId, reactorId);
      } catch { /* ignore write errors */ }
    }
  }
}

/**
 * 启动 AI 建议生成后台引擎
 * @returns stop 函数, 用于优雅停机
 */
export function startSuggestionEngine(deps: SuggestionDeps): { stop: () => void } {
  console.log(`[${new Date().toISOString()}] [INFO] [AI Suggestion] 建议生成引擎已启动 (间隔 ${ANALYSIS_INTERVAL_MS / 1000}s)`);

  // 延迟30秒后首次运行 (等待系统稳定)
  const startupTimer = setTimeout(() => {
    generateSuggestions(deps);
  }, 30_000);

  const timer = setInterval(() => {
    try {
      generateSuggestions(deps);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] [ERROR] [AI Suggestion] ${err.message}`);
    }
  }, ANALYSIS_INTERVAL_MS);

  return {
    stop() {
      clearTimeout(startupTimer);
      clearInterval(timer);
      recentSuggestions.clear();
      console.log(`[${new Date().toISOString()}] [INFO] [AI Suggestion] 建议生成引擎已停止`);
    },
  };
}
