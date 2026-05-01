# BIOCore 配方JSON规范与示例（修订扩展版）

> 本文档是 [BIOCore产品规划主文档](00_BIOCore_产品规划主文档.md) 的技术子文档
> 配方文件定义了发酵批次的完整工艺Phase组合与参数，Step由batch-engine硬编码执行
> 相关文档：[ISA-88状态机规格](06_ISA-88状态机规格.md) | [工艺控制策略](03_工艺控制策略.md) | [PLC硬件规格](01_PLC硬件规格.md)

---

## 一、配方文件顶层结构

```json
{
  "recipe_id":       "string  — 唯一标识符，大写字母+数字+下划线",
  "name":            "string  — 人类可读名称",
  "version":         "string  — 语义化版本号(semver) x.y.z",
  "author":          "string  — 作者/团队",
  "target_organism": "string  — 目标菌株/细胞系（CIP配方可为null）",
  "description":     "string  — 配方说明（可选）",
  "vessel": {
    "id":                "string  — 反应器编号，如 F01",
    "working_volume_L":  "number  — 工作容积",
    "total_volume_L":    "number  — 全容积",
    "tare_weight_kg":    "number  — 空罐皮重（prepare Phase称重清零基准）",
    "material":          "string  — 材质（可选）",
    "pressure_range_bar":"[number, number] — 压力范围（可选）",
    "agitation_range_rpm":"[number, number] — 转速范围（可选）",
    "airflow_range_NL_min":"[number, number] — 通气范围（可选）"
  },
  "phases": [
    {
      "phase_id": "string  — Phase唯一ID（配方内唯一）",
      "type":     "string  — 14种Phase类型之一",
      "params":   "object  — 该Phase类型所需的参数（Step由代码硬编码，不在此定义）"
    }
  ]
}
```

**Phase类型枚举（14种）：**

`prepare`, `water_fill`, `manual_add`, `heating`, `agitation`, `feeding`, `temp_control`, `ph_control`, `do_control`, `aeration`, `discharge`, `fermentation`, `cip`, `sip`

**配方中只定义Phase组合和参数，不定义Step。** Step序列由batch-engine根据Phase type自动确定（硬编码），详见 [ISA-88状态机规格](06_ISA-88状态机规格.md) 第四节。

**配方编辑方式（v2更新）：** 前端配方编辑器采用 **拖拽模式(@dnd-kit)**：
- 左侧展示14种Phase模板库（按系统操作/温控/过程控制/发酵/清洗灭菌分组）
- 用户从左侧 **拖拽Phase模板** 到右侧配方时间线
- 时间线内Phase可 **拖拽排序**、删除、自定义名称
- 点击Phase卡片展开 **参数表单**（根据Phase类型的param_schema动态渲染）
- 参数表单支持 **条件字段**（如选择指数补料模式才显示μ设定值）
- 支持JSON格式的配方导入/导出

---

## 二、配方示例 1：E.coli BL21 Fed-batch Standard

```json
{
  "recipe_id": "ECOLI_FEDBATCH_V1",
  "name": "E.coli BL21 Fed-batch Standard",
  "version": "1.0.0",
  "author": "工艺开发团队",
  "target_organism": "E.coli BL21(DE3)",
  "description": "大肠杆菌标准补料分批培养，批次期策略一主动调氧，补料期策略二DO-stat防溢流",
  "vessel": {
    "id": "F01",
    "working_volume_L": 5,
    "total_volume_L": 16,
    "tare_weight_kg": 12.5,
    "material": "316L",
    "pressure_range_bar": [-1, 3],
    "agitation_range_rpm": [50, 1200],
    "airflow_range_NL_min": [0, 30]
  },
  "phases": [
    {
      "phase_id": "PREP",
      "type": "prepare"
    },
    {
      "phase_id": "FILL",
      "type": "water_fill",
      "params": {
        "target_weight_kg": 15.5,
        "coarse_offset_kg": 0.3
      }
    },
    {
      "phase_id": "MEDIA_ADD",
      "type": "manual_add",
      "params": {
        "prompt_message": "请加入培养基干粉并搅拌溶解",
        "expected_delta_kg": 0.2,
        "agitation_rpm": 300,
        "timeout_min": 30
      }
    },
    {
      "phase_id": "SIP",
      "type": "sip",
      "params": {
        "target_temp_C": 121,
        "hold_time_min": 20,
        "cool_to_C": 40
      }
    },
    {
      "phase_id": "COOL_TO_CULTURE",
      "type": "temp_control",
      "params": {
        "target_temp_C": 37,
        "deadband": 0.3
      }
    },
    {
      "phase_id": "INOCULATION",
      "type": "manual_add",
      "params": {
        "prompt_message": "请通过火焰接种口完成菌种接种",
        "expected_delta_kg": 0.05,
        "agitation_rpm": 200,
        "timeout_min": 60
      }
    },
    {
      "phase_id": "BATCH_CULTURE",
      "type": "fermentation",
      "params": {
        "duration_h": 8,
        "controls": {
          "temperature": {"sv": 37.0, "deadband": 0.3},
          "pH": {"sv": 7.0, "deadband": 0.05},
          "DO": {
            "strategy": "active_O2",
            "sv": 30,
            "cascade": [
              {"level": 1, "actuator": "agitation", "range_rpm": [200, 1200]},
              {"level": 2, "actuator": "airflow", "range_NL_min": [1, 30]}
            ],
            "feedforward_enabled": true
          }
        },
        "triggers": {
          "do_spike": {
            "condition": {"type": ">=", "channel": "AI-3", "value": 80, "after_below": 20, "within_min": 5},
            "action": "phase_complete"
          }
        }
      }
    },
    {
      "phase_id": "FED_BATCH",
      "type": "fermentation",
      "params": {
        "duration_h": 16,
        "feed_strategy": {
          "pump": "P02",
          "mode": "exponential",
          "initial_rate_mL_h": 2.0,
          "specific_growth_rate": 0.15,
          "max_rate_mL_h": 25.0,
          "substrate": "500g/L葡萄糖母液"
        },
        "controls": {
          "temperature": {"sv": 37.0, "deadband": 0.3},
          "pH": {"sv": 7.0, "deadband": 0.05},
          "DO": {
            "strategy": "active_feed",
            "sv": 30,
            "agitation_fixed_rpm": 1000,
            "airflow_fixed_NL_min": 20
          }
        }
      }
    },
    {
      "phase_id": "HARVEST",
      "type": "discharge",
      "params": {
        "cool_to_C": 8,
        "empty_weight_kg": 12.5
      }
    }
  ]
}
```

---

## 三、配方示例 2：酿酒酵母 Fed-batch（Crabtree效应管理）

```json
{
  "recipe_id": "YEAST_FEDBATCH_V1",
  "name": "S. cerevisiae CEN.PK Fed-batch (Ethanol-free)",
  "version": "1.0.0",
  "author": "工艺开发团队",
  "target_organism": "S. cerevisiae CEN.PK113-7D",
  "description": "酿酒酵母补料培养，采用DO-stat策略二避免Crabtree效应产乙醇，全程30°C低温培养",
  "vessel": {
    "id": "F01",
    "working_volume_L": 5,
    "total_volume_L": 16,
    "tare_weight_kg": 12.5
  },
  "phases": [
    {"phase_id": "PREP", "type": "prepare"},
    {
      "phase_id": "FILL_MEDIA",
      "type": "water_fill",
      "params": {"target_weight_kg": 15.0, "coarse_offset_kg": 0.3}
    },
    {
      "phase_id": "ADD_NUTRIENTS",
      "type": "manual_add",
      "params": {
        "prompt_message": "请加入YPD干粉培养基(100g)并搅拌溶解",
        "expected_delta_kg": 0.1, "agitation_rpm": 400, "timeout_min": 30
      }
    },
    {
      "phase_id": "SIP",
      "type": "sip",
      "params": {"target_temp_C": 121, "hold_time_min": 20, "cool_to_C": 35}
    },
    {
      "phase_id": "ADD_GLUCOSE",
      "type": "manual_add",
      "params": {
        "prompt_message": "请加入灭菌后的葡萄糖母液(50mL, 500g/L)，通过硅胶管无菌转移",
        "expected_delta_kg": 0.05, "agitation_rpm": 300, "timeout_min": 15,
        "note": "葡萄糖与培养基分开灭菌避免Maillard反应"
      }
    },
    {
      "phase_id": "COOL_AND_STABILIZE",
      "type": "temp_control",
      "params": {"target_temp_C": 30.0, "deadband": 0.3}
    },
    {
      "phase_id": "SET_AERATION",
      "type": "aeration",
      "params": {"target_NL_min": 5}
    },
    {
      "phase_id": "INOCULATION",
      "type": "manual_add",
      "params": {
        "prompt_message": "请接种酵母预培养液(OD600≈1.0, 接种量10% v/v)",
        "expected_delta_kg": 0.5, "agitation_rpm": 200, "timeout_min": 30
      }
    },
    {
      "phase_id": "BATCH_CULTURE",
      "type": "fermentation",
      "params": {
        "duration_h": 12,
        "controls": {
          "temperature": {"sv": 30.0, "deadband": 0.3},
          "pH": {"sv": 5.0, "deadband": 0.1, "note": "酵母最适pH 5.0，死区放宽至±0.1"},
          "DO": {
            "strategy": "active_O2", "sv": 30,
            "cascade": [
              {"level": 1, "actuator": "agitation", "range_rpm": [200, 800]},
              {"level": 2, "actuator": "airflow", "range_NL_min": [2, 20]}
            ],
            "note": "酵母搅拌上限800rpm（高于此易产生剪切损伤）"
          }
        },
        "triggers": {
          "do_spike": {
            "condition": {"type": ">=", "channel": "AI-3", "value": 70, "after_below": 25, "within_min": 10},
            "action": "phase_complete"
          }
        }
      }
    },
    {
      "phase_id": "FED_BATCH",
      "type": "fermentation",
      "params": {
        "duration_h": 24,
        "feed_strategy": {
          "pump": "P02", "mode": "constant", "rate_mL_h": 5.0,
          "substrate": "500g/L葡萄糖母液",
          "note": "恒速补料起步，由DO-stat策略自动调速"
        },
        "controls": {
          "temperature": {"sv": 30.0, "deadband": 0.3},
          "pH": {"sv": 5.0, "deadband": 0.1},
          "DO": {
            "strategy": "active_feed", "sv": 20,
            "agitation_fixed_rpm": 600, "airflow_fixed_NL_min": 15,
            "note": "策略二：DO-stat，天然防Crabtree效应"
          }
        }
      }
    },
    {
      "phase_id": "HARVEST",
      "type": "discharge",
      "params": {"cool_to_C": 4, "empty_weight_kg": 12.5}
    }
  ]
}
```

**酵母配方与E.coli配方的关键差异：**

| 维度 | E.coli Fed-batch | 酵母 Fed-batch |
|------|-----------------|----------------|
| 培养温度 | 37°C | 30°C |
| pH设定值 | 7.0 ± 0.05 | 5.0 ± 0.1（死区更宽） |
| 搅拌上限 | 1200 rpm | 800 rpm（剪切敏感） |
| 补料期DO策略 | active_feed | active_feed |
| 补料起始模式 | 指数(μ_set=0.15) | 恒速(5mL/h) |
| 收获温度 | 8°C | 4°C |
| 葡萄糖添加 | 含在培养基中 | 单独灭菌后无菌加入（Maillard反应） |

---

## 四、配方示例 3：CHO细胞悬浮培养

```json
{
  "recipe_id": "CHO_BATCH_V1",
  "name": "CHO-K1 Batch Culture (Suspension)",
  "version": "1.0.0",
  "author": "细胞培养组",
  "target_organism": "CHO-K1 (Suspension adapted)",
  "description": "CHO悬浮培养，无抗生素，低搅拌低通气保护细胞活力，37°C/pH7.2/DO40%",
  "vessel": {
    "id": "F01",
    "working_volume_L": 3,
    "total_volume_L": 16,
    "tare_weight_kg": 12.5
  },
  "phases": [
    {"phase_id": "PREP", "type": "prepare"},
    {
      "phase_id": "FILL_PBS",
      "type": "water_fill",
      "params": {"target_weight_kg": 13.5, "coarse_offset_kg": 0.2, "note": "先加1L PBS"}
    },
    {
      "phase_id": "SIP",
      "type": "sip",
      "params": {"target_temp_C": 121, "hold_time_min": 30, "cool_to_C": 37, "note": "CHO要求30min"}
    },
    {
      "phase_id": "DRAIN_PBS",
      "type": "discharge",
      "params": {"cool_to_C": 37, "empty_weight_kg": 12.5, "note": "排掉灭菌用PBS"}
    },
    {
      "phase_id": "FILL_MEDIUM",
      "type": "water_fill",
      "params": {"target_weight_kg": 15.3, "coarse_offset_kg": 0.2, "note": "无菌转移CD-CHO培养基"}
    },
    {
      "phase_id": "TEMP_STABILIZE",
      "type": "temp_control",
      "params": {"target_temp_C": 37.0, "deadband": 0.2}
    },
    {
      "phase_id": "PH_ADJUST",
      "type": "ph_control",
      "params": {"target_pH": 7.2, "deadband": 0.05}
    },
    {
      "phase_id": "SET_AERATION",
      "type": "aeration",
      "params": {"target_NL_min": 0.5, "note": "CHO极低通气"}
    },
    {
      "phase_id": "SET_AGITATION",
      "type": "agitation",
      "params": {"target_rpm": 80, "note": "CHO剪切极敏感"}
    },
    {
      "phase_id": "INOCULATION",
      "type": "manual_add",
      "params": {
        "prompt_message": "请无菌转移CHO细胞悬液(0.3×10⁶cells/mL)",
        "expected_delta_kg": 0.2, "agitation_rpm": 60, "timeout_min": 45
      }
    },
    {
      "phase_id": "CULTURE",
      "type": "fermentation",
      "params": {
        "duration_h": 168,
        "controls": {
          "temperature": {"sv": 37.0, "deadband": 0.2},
          "pH": {"sv": 7.2, "deadband": 0.05},
          "DO": {
            "strategy": "constant_O2",
            "agitation_fixed_rpm": 80, "airflow_fixed_NL_min": 0.5,
            "note": "策略三：恒定氧气。CHO耗氧低，固定低搅拌低通气足够"
          }
        },
        "note": "CHO批次培养7天(168h)，无补料"
      }
    },
    {
      "phase_id": "HARVEST",
      "type": "discharge",
      "params": {"cool_to_C": 4, "empty_weight_kg": 12.5}
    }
  ]
}
```

---

## 五、配方示例 4：CIP清洗

```json
{
  "recipe_id": "CIP_STANDARD_V1",
  "name": "Standard CIP Cycle (Alkali-Acid-Rinse)",
  "version": "1.0.0",
  "author": "设备维护组",
  "target_organism": null,
  "description": "标准5步CIP清洗循环：预洗→碱洗→水洗→酸洗→终洗",
  "vessel": {
    "id": "F01",
    "working_volume_L": 5,
    "total_volume_L": 16,
    "tare_weight_kg": 12.5
  },
  "phases": [
    {"phase_id": "PREP", "type": "prepare"},
    {
      "phase_id": "PRE_RINSE_FILL",
      "type": "water_fill",
      "params": {"target_weight_kg": 17.5, "coarse_offset_kg": 0.5}
    },
    {"phase_id": "PRE_RINSE_AGITATE", "type": "agitation", "params": {"target_rpm": 300}},
    {"phase_id": "PRE_RINSE_HEAT", "type": "heating", "params": {"target_temp_C": 50}},
    {
      "phase_id": "PRE_RINSE_DRAIN",
      "type": "discharge",
      "params": {"cool_to_C": 50, "empty_weight_kg": 12.5}
    },
    {
      "phase_id": "CIP_CYCLE",
      "type": "cip",
      "params": {
        "alkali_time_min": 30, "acid_time_min": 15, "rinse_time_min": 10,
        "alkali_temp_C": 65, "acid_temp_C": 50, "agitation_rpm": 300
      }
    },
    {
      "phase_id": "FINAL_DRAIN",
      "type": "discharge",
      "params": {"cool_to_C": 30, "empty_weight_kg": 12.5}
    }
  ]
}
```

---

## 六、配方示例 5：DoE实验——恒定补料对照组

```json
{
  "recipe_id": "ECOLI_DOE_CONST_FEED_V1",
  "name": "E.coli DoE - Constant Feed Control Group",
  "version": "1.0.0",
  "author": "工艺开发团队",
  "target_organism": "E.coli BL21(DE3)",
  "description": "DoE对照组：恒速补料+固定搅拌通气(策略四)，全开环最高可重复性",
  "vessel": {"id": "F01", "working_volume_L": 5, "total_volume_L": 16, "tare_weight_kg": 12.5},
  "phases": [
    {"phase_id": "PREP", "type": "prepare"},
    {"phase_id": "FILL", "type": "water_fill", "params": {"target_weight_kg": 15.5, "coarse_offset_kg": 0.3}},
    {"phase_id": "SIP", "type": "sip", "params": {"target_temp_C": 121, "hold_time_min": 20, "cool_to_C": 40}},
    {"phase_id": "COOL_DOWN", "type": "temp_control", "params": {"target_temp_C": 37.0, "deadband": 0.3}},
    {
      "phase_id": "INOCULATION", "type": "manual_add",
      "params": {"prompt_message": "请接种E.coli BL21预培养液", "expected_delta_kg": 0.05, "agitation_rpm": 200, "timeout_min": 60}
    },
    {
      "phase_id": "BATCH_CULTURE", "type": "fermentation",
      "params": {
        "duration_h": 8,
        "controls": {
          "temperature": {"sv": 37.0, "deadband": 0.3},
          "pH": {"sv": 7.0, "deadband": 0.05},
          "DO": {"strategy": "constant_O2", "agitation_fixed_rpm": 500, "airflow_fixed_NL_min": 10, "note": "策略三：DO仅监测"}
        },
        "triggers": {
          "do_spike": {"condition": {"type": ">=", "channel": "AI-3", "value": 80, "after_below": 20, "within_min": 5}, "action": "phase_complete"}
        }
      }
    },
    {
      "phase_id": "FED_BATCH", "type": "fermentation",
      "params": {
        "duration_h": 16,
        "feed_strategy": {"pump": "P02", "mode": "constant", "rate_mL_h": 8.0, "substrate": "500g/L葡萄糖母液", "note": "DoE对照组：恒速8mL/h"},
        "controls": {
          "temperature": {"sv": 37.0, "deadband": 0.3},
          "pH": {"sv": 7.0, "deadband": 0.05},
          "DO": {"strategy": "constant_feed", "agitation_fixed_rpm": 500, "airflow_fixed_NL_min": 10, "note": "策略四：全开环"}
        }
      }
    },
    {"phase_id": "HARVEST", "type": "discharge", "params": {"cool_to_C": 8, "empty_weight_kg": 12.5}}
  ]
}
```

---

## 七、五种配方的策略覆盖总览

| 配方 | Phase数 | DO策略 | 补料模式 | 核心工艺特点 |
|------|---------|--------|---------|-------------|
| E.coli Fed-batch | 9 | 批次:active_O2 → 补料:active_feed | 指数补料 | 标准好氧高密度培养 |
| 酵母 Fed-batch | 11 | 批次:active_O2 → 补料:active_feed | 恒速起步→DO-stat调节 | 防Crabtree效应，低pH低搅拌 |
| CHO Batch | 12 | constant_O2 | 无补料 | 超低搅拌通气，长周期，高pH |
| E.coli DoE对照 | 8 | 批次:constant_O2 → 补料:constant_feed | 恒速固定 | 全开环，最高可重复性 |
| CIP清洗 | 7 | — | — | 碱洗-酸洗循环，无发酵 |

---

## 八、JSON Schema校验规则

以下为配方JSON的完整校验Schema，batch-engine在加载配方时（cmd_start前）强制校验。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://biocore.local/schemas/recipe.v1.json",
  "title": "BIOCore Recipe",
  "description": "BIOCore发酵配方JSON校验规范",
  "type": "object",
  "required": ["recipe_id", "name", "version", "vessel", "phases"],
  "additionalProperties": false,

  "properties": {
    "recipe_id": {
      "type": "string",
      "pattern": "^[A-Z0-9_]{3,50}$",
      "description": "唯一标识符，大写字母+数字+下划线，3~50字符"
    },
    "name": {"type": "string", "minLength": 1, "maxLength": 200},
    "version": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
    "author": {"type": "string"},
    "target_organism": {"type": ["string", "null"]},
    "description": {"type": "string"},

    "vessel": {
      "type": "object",
      "required": ["id", "working_volume_L", "total_volume_L", "tare_weight_kg"],
      "properties": {
        "id": {"type": "string", "pattern": "^F\\d{2}$"},
        "working_volume_L": {"type": "number", "exclusiveMinimum": 0, "maximum": 100},
        "total_volume_L": {"type": "number", "exclusiveMinimum": 0},
        "tare_weight_kg": {"type": "number", "minimum": 0},
        "material": {"type": "string"},
        "pressure_range_bar": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
        "agitation_range_rpm": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
        "airflow_range_NL_min": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}
      },
      "additionalProperties": false
    },

    "phases": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {"$ref": "#/definitions/phase"}
    }
  },

  "definitions": {
    "phase": {
      "type": "object",
      "required": ["phase_id", "type"],
      "properties": {
        "phase_id": {"type": "string", "pattern": "^[A-Z0-9_]{2,30}$"},
        "type": {
          "type": "string",
          "enum": ["prepare","water_fill","manual_add","heating","agitation","feeding","temp_control","ph_control","do_control","aeration","discharge","fermentation","cip","sip"]
        },
        "params": {"type": "object"},
        "note": {"type": "string"}
      },
      "additionalProperties": false
    },

    "do_strategy_config": {
      "type": "object",
      "required": ["strategy"],
      "properties": {
        "strategy": {"type": "string", "enum": ["active_O2","active_feed","constant_O2","constant_feed"]},
        "sv": {"type": "number", "minimum": 0, "maximum": 100},
        "cascade": {"type": "array", "items": {"$ref": "#/definitions/cascade_level"}},
        "feedforward_enabled": {"type": "boolean"},
        "agitation_fixed_rpm": {"type": "number", "minimum": 0, "maximum": 1200},
        "airflow_fixed_NL_min": {"type": "number", "minimum": 0, "maximum": 30},
        "feed_pump": {"type": "string"},
        "feed_min_mL_h": {"type": "number", "minimum": 0},
        "feed_max_mL_h": {"type": "number", "minimum": 0},
        "note": {"type": "string"}
      },
      "allOf": [
        {"if": {"properties": {"strategy": {"const": "active_O2"}}}, "then": {"required": ["sv", "cascade"]}},
        {"if": {"properties": {"strategy": {"const": "active_feed"}}}, "then": {"required": ["sv", "agitation_fixed_rpm", "airflow_fixed_NL_min"]}},
        {"if": {"properties": {"strategy": {"const": "constant_O2"}}}, "then": {"required": ["agitation_fixed_rpm", "airflow_fixed_NL_min"]}},
        {"if": {"properties": {"strategy": {"const": "constant_feed"}}}, "then": {"required": ["agitation_fixed_rpm", "airflow_fixed_NL_min"]}}
      ]
    },

    "cascade_level": {
      "type": "object",
      "required": ["level", "actuator"],
      "properties": {
        "level": {"type": "integer", "minimum": 1, "maximum": 3},
        "actuator": {"type": "string", "enum": ["agitation", "airflow"]},
        "range_rpm": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
        "range_NL_min": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}
      }
    },

    "feed_strategy": {
      "type": "object",
      "required": ["pump", "mode"],
      "properties": {
        "pump": {"type": "string", "enum": ["P01","P02","P03","P04"]},
        "mode": {"type": "string", "enum": ["constant","exponential","pulse"]},
        "rate_mL_h": {"type": "number", "minimum": 0},
        "initial_rate_mL_h": {"type": "number", "minimum": 0},
        "specific_growth_rate": {"type": "number", "minimum": 0, "maximum": 1},
        "max_rate_mL_h": {"type": "number", "minimum": 0, "maximum": 100},
        "target_volume_mL": {"type": "number", "minimum": 0},
        "duration_min": {"type": "number", "minimum": 0},
        "substrate": {"type": "string"},
        "note": {"type": "string"}
      }
    },

    "trigger": {
      "type": "object",
      "required": ["condition", "action"],
      "properties": {
        "condition": {"$ref": "#/definitions/step_condition"},
        "action": {"type": "string", "enum": ["phase_complete"]}
      }
    },

    "step_condition": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {"type": "string", "enum": [">=","<=","in_band","duration","accumulated","delta","and","or"]},
        "channel": {"type": "string"},
        "value": {"type": "number"},
        "seconds": {"type": "number"},
        "sv": {"type": "number"},
        "deadband": {"type": "number"},
        "parameter": {"type": "string"},
        "min_delta_kg": {"type": "number"},
        "stable_seconds": {"type": "number"},
        "after_below": {"type": "number"},
        "within_min": {"type": "number"},
        "conditions": {"type": "array", "items": {"$ref": "#/definitions/step_condition"}},
        "note": {"type": "string"}
      }
    }
  }
}
```

---

## 九、配方校验的业务规则（Schema以外的逻辑校验）

| 编号 | 规则 | 错误处理 |
|------|------|---------|
| BV-01 | `phases`数组中`phase_id`必须全局唯一 | 拒绝加载 |
| BV-02 | `vessel.working_volume_L` < `vessel.total_volume_L` | 拒绝加载 |
| BV-03 | fermentation Phase的`controls.DO.cascade`中level必须从1开始连续递增 | 拒绝加载 |
| BV-04 | active_O2策略的cascade搅拌range_rpm不得超过vessel.agitation_range_rpm | 警告 |
| BV-05 | active_O2策略的cascade通气range_NL_min不得超过vessel.airflow_range_NL_min | 警告 |
| BV-06 | sip Phase的target_temp_C必须≥100 | 拒绝加载 |
| BV-07 | discharge Phase的empty_weight_kg应≈vessel.tare_weight_kg（±2kg） | 警告 |
| BV-08 | manual_add Phase的agitation_rpm不得超过vessel上限 | 拒绝加载 |
| BV-09 | 补料泵编号在同一时间点不能冲突 | 警告 |
| BV-10 | pH的acid_pump和base_pump不能是同一个泵 | 拒绝加载 |
| BV-11 | 版本号递增校验：新版本version必须>当前approved版本 | 拒绝保存 |
| BV-12 | fermentation Phase的duration_h不得为0 | 拒绝加载 |

```typescript
// batch-engine/recipe-validator.ts

interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function validateRecipe(recipe: Recipe): ValidationResult {
  const issues: ValidationIssue[] = [];

  // BV-01: phase_id唯一性
  const ids = recipe.phases.map(p => p.phase_id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicates.length > 0) {
    issues.push({ code: 'BV-01', severity: 'error',
      message: `Phase ID重复: ${[...new Set(duplicates)].join(', ')}` });
  }

  // BV-02: 容积合理性
  if (recipe.vessel.working_volume_L >= recipe.vessel.total_volume_L) {
    issues.push({ code: 'BV-02', severity: 'error',
      message: `工作容积(${recipe.vessel.working_volume_L}L)必须小于全容积(${recipe.vessel.total_volume_L}L)` });
  }

  // ... 其余规则逐项检查

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
  };
}
```

---
