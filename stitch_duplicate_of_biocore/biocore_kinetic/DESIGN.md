# Design System Specification

## 1. Overview & Creative North Star: "The Clinical Architect"
This design system is built for the high-stakes, high-precision world of bio-fermentation R&D. We are moving beyond the generic "SaaS dashboard" and toward a **Clinical Architect** aesthetic. This philosophy treats data as the primary inhabitant of the interface, using a sophisticated, layered environment that feels as sterile and precise as a laboratory while remaining as intuitive as a modern editorial layout.

By leveraging intentional asymmetry, high-contrast typography scales, and tonal depth, we break the "template" look. We emphasize the flow of scientific logic over rigid, boxy grids. The interface should feel like a custom-tooled instrument, not a generic software suite.

---

## 2. Colors & Surface Philosophy
The palette is grounded in scientific stability (Deep Teals and Slate Blues) but elevated through a sophisticated Material Design-inspired token system.

### The "No-Line" Rule
Standard 1px solid borders for sectioning are strictly prohibited. Structural boundaries must be defined through **Background Shifts** (e.g., a `surface-container-low` section resting on a `surface` background) or subtle tonal transitions. This creates a seamless, "molded" look rather than a fragmented grid.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of laboratory-grade glass.
- **Base:** `surface` (#FAF8FF) for the main application background.
- **Sectioning:** `surface-container-low` (#F2F3FF) for lateral navigation or secondary sidebars.
- **Actionable Areas:** `surface-container-lowest` (#FFFFFF) for the primary content cards and data tables to maximize contrast.
- **Active Overlays:** `surface-container-highest` (#DAE2FD) for active selections or temporary states.

### The "Glass & Gradient" Rule
To escape the "flat" enterprise trap:
- **Glassmorphism:** Use `surface` colors with 80% opacity and a `20px` backdrop-blur for floating command bars or hover-state tooltips.
- **Signature Textures:** Apply a subtle linear gradient (from `primary` #0F766E to `primary-container` #0F766E) on primary CTAs and progress indicators to provide a "liquid" feel, referencing the biological nature of the work.

---

## 3. Typography
We utilize a dual-font system to separate narrative UI from empirical data.

- **UI & Headings (Inter):** Headlines utilize `headline-sm` to `headline-lg` with `tight` tracking (-0.02em) and `semibold` weights. This creates an authoritative, editorial tone that demands attention without occupying excessive real estate.
- **Data & Metrics (JetBrains Mono):** All fermentation values, timestamps, and sensor readings must use JetBrains Mono. 
- **Tabular Intelligence:** Always implement `font-variant-numeric: tabular-nums` in tables to ensure that fluctuating data points remain vertically aligned, essential for rapid-scanning during R&D cycles.

---

## 4. Elevation & Depth
Hierarchy is achieved through **Tonal Layering** rather than structural scaffolding.

- **The Layering Principle:** Place a `surface-container-lowest` card (the lightest white) onto a `surface-container-low` background. This creates a natural "lift" that mimics ambient laboratory lighting.
- **Ambient Shadows:** For floating elements like Modals, use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(19, 27, 46, 0.06)`. Note the use of `on-surface` (#131B2E) for the shadow tint—never use pure black.
- **The "Ghost Border" Fallback:** If containment is required for accessibility, use the `outline-variant` token at 20% opacity. 100% opaque, high-contrast borders are forbidden.

---

## 5. Components

### Buttons & Interaction
- **Primary:** `primary` (#0F766E) fill with a subtle top-light gradient. `lg` (0.5rem) roundedness.
- **Secondary:** `surface-container-low` fill with a `ghost border`. No solid outline.
- **Interactive States:** Hover states should involve a background shift to the next container tier (e.g., from `low` to `high`) rather than a simple opacity change.

### Data Tables (Compact Logic)
- **Row Height:** Strictly 36px.
- **Dividers:** Forbid the use of horizontal lines. Use 1px of vertical whitespace or a subtle `surface-variant` background on hover to define row boundaries.
- **Typography:** `body-sm` (Inter) for labels, `body-sm` (JetBrains Mono) for values.

### Status Indicators
- **Pill Badges:** High-saturation `success` (#10B981) or `error` (#BA1A1A) text on a 10% opacity background of the same color.
- **Progress Bars:** 4px thin. Use the primary gradient texture. In fermentation phases, use the `tertiary` (#030e36) for "Warning/Incubation" states.

### Contextual Tooltips
- Styled with `inverse-surface` (#283044) and `on-surface-variant` text. High blur backdrop for a "lens" effect over the data.

---

## 6. Do’s and Don’ts

### Do
- **DO** use white space as a structural element. If a section feels cluttered, increase the container-tier gap rather than adding a line.
- **DO** use `secondary` (Slate Blue, #1E40AF) for secondary data visualizations to maintain a cool, clinical temperature.
- **DO** align all JetBrains Mono data points to the right in tables to ensure decimal points align perfectly.

### Don’t
- **DON'T** use 100% opaque borders to separate the sidebar from the main content; use a transition from `surface-container-low` to `surface`.
- **DON'T** use "Drop Shadows" on cards. Use tonal shifting. Shadows are reserved only for elements that physically "float" (Modals, Popovers).
- **DON'T** use pure black (#000000) for text. Always use `on-surface` (#131B2E) to maintain the sophisticated, deep-teal-influenced ink color.

---

## 7. Signature Bio-Components
- **The Phase-Strip:** A top-level horizontal progress bar using 4px height, indicating the current fermentation stage (Inoculation -> Growth -> Harvest). Use `surface-tint` for the active phase.
- **The Metric-Card:** A `surface-container-lowest` card with a `xl` (0.75rem) radius, featuring a `headline-md` JetBrains Mono value and a micro-sparkline using the `primary` color. No borders.