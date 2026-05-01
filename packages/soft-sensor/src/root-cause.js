"use strict";
// ============================================================
// Root cause analysis for alarms
// Extracts multi-parameter trends around alarm time and
// generates analysis with probable causes
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.RootCauseAnalyzer = void 0;
// Known alarm patterns: code -> { param deviations that typically cause it }
const ALARM_PATTERNS = {
    TEMP_HIGH: [
        { param: 'temperature', direction: 'high', cause: 'Temperature exceeded setpoint — possible cooling system failure or exothermic reaction' },
        { param: 'DO', direction: 'low', cause: 'DO drop often accompanies temperature rise due to increased metabolic activity' },
        { param: 'agitation', direction: 'low', cause: 'Reduced agitation can cause local hot spots' },
    ],
    TEMP_LOW: [
        { param: 'temperature', direction: 'low', cause: 'Temperature below setpoint — possible heater failure or ambient cooling' },
    ],
    DO_LOW: [
        { param: 'DO', direction: 'low', cause: 'Dissolved oxygen critically low — possible high OUR from rapid growth' },
        { param: 'agitation', direction: 'low', cause: 'Agitation drop reduces oxygen transfer rate (kLa)' },
        { param: 'airflow', direction: 'low', cause: 'Reduced airflow decreases oxygen supply' },
        { param: 'feed_rate', direction: 'high', cause: 'Excessive feeding drives high oxygen demand' },
    ],
    PH_HIGH: [
        { param: 'pH', direction: 'high', cause: 'pH rising — possible base pump malfunction or CO2 stripping' },
        { param: 'airflow', direction: 'high', cause: 'High airflow can strip CO2 and raise pH' },
    ],
    PH_LOW: [
        { param: 'pH', direction: 'low', cause: 'pH dropping — possible acid accumulation from overflow metabolism' },
        { param: 'feed_rate', direction: 'high', cause: 'Overfeeding can cause acetate accumulation and pH drop' },
    ],
    FOAM_HIGH: [
        { param: 'agitation', direction: 'high', cause: 'High agitation causes excessive foaming' },
        { param: 'airflow', direction: 'high', cause: 'High airflow contributes to foam generation' },
    ],
};
class RootCauseAnalyzer {
    /**
     * Analyze alarm context by examining parameter trends around
     * the alarm time and matching against known causal patterns.
     */
    analyze(params) {
        const { alarmCode, alarmTime, paramHistory, paramNames, normalRanges } = params;
        const affectedParams = [];
        const probableCauses = [];
        // Step 1: Identify which parameters deviated from normal ranges
        const deviations = {};
        for (const paramName of paramNames) {
            const values = paramHistory[paramName];
            if (!values || values.length === 0)
                continue;
            const range = normalRanges[paramName];
            if (!range)
                continue;
            const [lo, hi] = range;
            const midpoint = values.length > 1 ? Math.floor(values.length / 2) : 0;
            // Look at the most recent 3 values (around alarm trigger time)
            const recentValues = values.slice(-3);
            const avgRecent = recentValues.reduce((s, v) => s + v, 0) / recentValues.length;
            // Check for deviation
            if (avgRecent > hi) {
                const severity = (avgRecent - hi) / (hi - lo || 1);
                deviations[paramName] = { direction: 'high', severity, trend: describeTrend(values) };
                affectedParams.push(paramName);
            }
            else if (avgRecent < lo) {
                const severity = (lo - avgRecent) / (hi - lo || 1);
                deviations[paramName] = { direction: 'low', severity, trend: describeTrend(values) };
                affectedParams.push(paramName);
            }
        }
        // Step 2: Match against known alarm patterns
        const patterns = ALARM_PATTERNS[alarmCode];
        if (patterns) {
            for (const pattern of patterns) {
                const deviation = deviations[pattern.param];
                if (deviation && deviation.direction === pattern.direction) {
                    const confidence = Math.min(0.95, 0.6 + deviation.severity * 0.2);
                    probableCauses.push({
                        cause: pattern.cause,
                        confidence,
                        evidence: `${pattern.param} is ${deviation.direction} (${deviation.trend})`,
                    });
                }
            }
        }
        // Step 3: Add generic deviation-based causes for unmatched params
        for (const [paramName, deviation] of Object.entries(deviations)) {
            const alreadyMatched = probableCauses.some(c => c.evidence.startsWith(paramName));
            if (!alreadyMatched) {
                probableCauses.push({
                    cause: `${paramName} is abnormally ${deviation.direction} — may be contributing to alarm ${alarmCode}`,
                    confidence: Math.min(0.7, 0.3 + deviation.severity * 0.15),
                    evidence: `${paramName} is ${deviation.direction} (${deviation.trend})`,
                });
            }
        }
        // Sort by confidence descending
        probableCauses.sort((a, b) => b.confidence - a.confidence);
        // Step 4: Generate recommendation
        const recommendation = generateRecommendation(alarmCode, probableCauses, deviations);
        // Step 5: Build timeline narrative
        const timelineNarrative = buildNarrative(alarmCode, alarmTime, deviations, paramHistory);
        return {
            probableCauses,
            affectedParams,
            recommendation,
            timelineNarrative,
        };
    }
}
exports.RootCauseAnalyzer = RootCauseAnalyzer;
// ─── Helper functions ───────────────────────────────────────
function describeTrend(values) {
    if (values.length < 3)
        return 'insufficient data';
    const first = values.slice(0, Math.ceil(values.length / 3));
    const last = values.slice(-Math.ceil(values.length / 3));
    const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
    const avgLast = last.reduce((s, v) => s + v, 0) / last.length;
    const change = avgLast - avgFirst;
    const relChange = avgFirst !== 0 ? Math.abs(change / avgFirst) : Math.abs(change);
    if (relChange < 0.02)
        return 'stable';
    if (change > 0)
        return relChange > 0.2 ? 'rapidly increasing' : 'gradually increasing';
    return relChange > 0.2 ? 'rapidly decreasing' : 'gradually decreasing';
}
function generateRecommendation(alarmCode, causes, deviations) {
    if (causes.length === 0) {
        return `No clear root cause identified for ${alarmCode}. Manual inspection recommended.`;
    }
    const topCause = causes[0];
    const parts = [];
    parts.push(`Primary cause (${(topCause.confidence * 100).toFixed(0)}% confidence): ${topCause.cause}.`);
    if (deviations.temperature?.direction === 'high') {
        parts.push('Check cooling water supply and jacket temperature controller.');
    }
    if (deviations.DO?.direction === 'low') {
        parts.push('Consider increasing agitation or airflow. Check for feed overload.');
    }
    if (deviations.pH) {
        parts.push('Verify acid/base pump operation and reagent levels.');
    }
    if (deviations.feed_rate?.direction === 'high') {
        parts.push('Reduce feed rate to prevent overflow metabolism.');
    }
    return parts.join(' ');
}
function buildNarrative(alarmCode, alarmTime, deviations, paramHistory) {
    const timeStr = alarmTime.toISOString();
    const lines = [];
    lines.push(`Alarm ${alarmCode} triggered at ${timeStr}.`);
    const devEntries = Object.entries(deviations);
    if (devEntries.length === 0) {
        lines.push('No significant parameter deviations detected in the observation window.');
    }
    else {
        lines.push('Parameter deviations detected:');
        for (const [param, dev] of devEntries) {
            const values = paramHistory[param];
            const latest = values ? values[values.length - 1] : 'N/A';
            lines.push(`  - ${param}: ${dev.direction}, trend ${dev.trend}, latest value ${latest}`);
        }
    }
    return lines.join(' ');
}
//# sourceMappingURL=root-cause.js.map