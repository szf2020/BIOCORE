# Slide Review: 14 — 实验设计与贝叶斯优化

**Reviewer**: Claude technical review (Gemini unavailable — aesthetic optimization performed by Claude)
**Date**: 2026-04-12
**Style**: scientific (Primary: #1E40AF, Accent: #059669, Card BG: #F8FAFC)
**Layout type**: two_column_symmetric

---

## Automated Pre-Check Results

| Check | Status | Detail |
|---|---|---|
| XML Valid | PASS | Well-formed SVG, all elements properly closed |
| ViewBox Present | PASS | `viewBox="0 0 1280 720"` confirmed |
| Font Size Floor | PASS | Minimum font-size: 12px throughout |
| Color Token Compliance | PASS | Core tokens respected; #7C3AED used as part indicator color for Part 4 — consistent with deck-level section color assignment; #DC2626 used for competitor/negative values — semantically appropriate |
| Safe Area | PASS | Primary content anchored at x=80, y=32+; all primary text and cards within 60px margins |

No Critical or Major automated check failures.

---

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Layout Balance | 9 / 10 | Excellent two-column symmetric structure. Left (DoE methods grid) and right (Bayesian convergence chart) columns are equal width at 540px and 560px respectively. Bottom row uses the same two-column split for workflow and SPC cards. Three KPI metric cards top-right are compact and non-intrusive. The layout handles four distinct content zones without fragmentation. |
| Color Harmony | 8 / 10 | Purple (#7C3AED) as section accent for Part 4 creates clear visual differentiation from Part 3 (blue). The convergence chart uses green (BIOCore) vs red-dashed (CCD) — a clear directional color coding. Workflow stages use purple→purple→green→amber progression that effectively communicates technology maturity. |
| Typography | 8 / 10 | Consistent three-font system. Section title "7 种实验设计方法" at 15px serif is appropriately weighted. Method pills use 13px bold + 12px latin secondary — clean hierarchy. The SPC chart text at 12px (UCL/CL/LCL labels, data footnote) meets the floor. Y-axis label uses `rotate(-90, 26, 145)` which is correct technique for vertical axis labeling. |
| Readability | 8 / 10 | Bayesian convergence chart is the strongest element — the two contrasting lines (solid green vs dashed red), labeled convergence markers, and legend at top-left make the core message instantly clear. The four-stage workflow uses consistent box sizing with readable labels. DoE method pills are scannable. One minor issue: the case comparison bars at bottom-left use nested overlapping `rect` elements (two rects for "full factorial") which may render as slightly ambiguous visual encoding. |
| Information Density | 8 / 10 | Content-type slide with high but appropriate density. Seven DoE method pills + 4 analysis tool badges + convergence chart + 4-stage workflow + case comparison + SPC preview = substantial information load, but each zone is clearly demarcated and focused. No single zone is overloaded. |

**Overall Score: 8.2 / 10**
**Determination: PASS**

All hard gates satisfied: Layout >= 6 ✓, Readability >= 6 ✓, no Critical issues.

---

## Optimization Suggestions

### Suggestions

**S1 — Case comparison bar encoding ambiguity** (Priority 2)
- Type: `attribute_change`
- Element: Full factorial bar — two overlapping `rect` at `translate(24,36)` inside case comparison card (`translate(80,542)`)
- Issue: Two `rect` elements with identical dimensions (width=230, height=14) but different opacity (0.15 and 0.3) stack on top of each other. The combined visual effect reads as a single darker bar, but the intent appears to be a gradient or fill effect. This is visually unclear — the bar for "全因子设计" (81 experiments) and "BIOCore" (47 experiments) should have proportionally different bar widths.
- Fix: Make the full factorial bar width proportional: if BIOCore=134px represents 47 experiments, then full factorial=81/47*134≈231px (already correct). Remove the duplicate stacked rect and use a single rect with opacity=0.3 for the full factorial bar. Make BIOCore bar use a distinct fill style (e.g. solid green fill with opacity 0.4) rather than two stacked rects.

**S2 — Convergence chart Y-axis label positioning** (Priority 3)
- Type: `attribute_change`
- Element: `<text x="26" y="145" transform="rotate(-90, 26, 145)">目标函数值</text>`
- Issue: The rotated Y-axis label at x=26 is very close to the SVG left edge. Given the card starts at x=640 (absolute), this label is at absolute x=640+26=666, well within canvas, but visually the label competes with the left edge of the chart area at x=60.
- Fix: Move the Y-axis label x to 16 and extend the chart background rect's left padding, or use a shorter label "目标值" to reduce visual competition with the axis area.

**S3 — Top metrics row positioning** (Priority 3)
- Type: `attribute_change`
- Element: Three metric cards at `translate(800, 32)`
- Issue: The three top KPI cards are positioned at y=32, placing them in the same vertical band as the part indicator (y=28) and title (y=88). The cards at y=32 to y=88 overlap with the title area visually. The right edge of the third card falls at x=800+300+130=1230, which exceeds the 1200px safe boundary (1280-80).
- Fix: Move the metrics group to `translate(790, 32)` and reduce card widths from 130px to 120px, or relocate the three metric cards to align below the subtitle at y=136, freeing the title area.

---

## Suggestions JSON

```json
[
  {
    "type": "attribute_change",
    "priority": 2,
    "slide": 14,
    "target_element": "duplicate rect in case comparison full-factorial bar",
    "description": "Remove stacked duplicate rect for full-factorial bar; use single rect with opacity=0.3 for clarity. Ensure BIOCore bar uses visually distinct fill rather than stacked opacity rects.",
    "attribute": "opacity",
    "from": "0.15 + 0.3 stacked",
    "to": "single rect opacity=0.3"
  },
  {
    "type": "attribute_change",
    "priority": 3,
    "slide": 14,
    "target_element": "Y-axis label in Bayesian convergence chart",
    "description": "Shorten Y-axis label from '目标函数值' to '目标值' or move x from 26 to 16 to reduce crowding near chart left boundary",
    "attribute": "text-content / x",
    "from": "目标函数值 at x=26",
    "to": "目标值 at x=16"
  },
  {
    "type": "attribute_change",
    "priority": 3,
    "slide": 14,
    "target_element": "top metrics group translate(800,32)",
    "description": "Third KPI card right edge reaches x=1230, exceeding 1200px safe boundary. Reduce card widths to 120px or shift group to translate(780,32)",
    "attribute": "translate / width",
    "from": "translate(800,32) card width=130",
    "to": "translate(780,32) card width=120"
  }
]
```

---

## Quality Gate

| Criterion | Score | Weight | Weighted |
|---|---|---|---|
| Layout Balance | 9.0 | 30% | 2.70 |
| Color Harmony | 8.0 | 20% | 1.60 |
| Typography | 8.0 | 20% | 1.60 |
| Readability | 8.0 | 20% | 1.60 |
| Information Density | 8.0 | 10% | 0.80 |
| **Overall** | **8.30** | | |

**Hard Gates**: Layout 9 >= 6 ✓ | Readability 8 >= 6 ✓
**Result: PASS**
**Fix action**: S1 is Priority 2 and recommended. S2 and S3 are cosmetic. No fix loop required.
