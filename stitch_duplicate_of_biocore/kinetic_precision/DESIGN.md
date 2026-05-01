```markdown
# Design System Specification: Industrial Precision

## 1. Overview & Creative North Star
**Creative North Star: The Kinetic Laboratory**
This design system moves away from the "software-as-a-service" aesthetic and toward a "software-as-an-instrument" philosophy. It is designed for high-stakes, data-dense environments where clarity is a clinical requirement. We avoid the "template" look by eschewing standard card layouts in favor of **Tonal Layering** and **Intentional Asymmetry**.

The aesthetic is "Industrial High-Precision." It mimics the interface of a high-end surgical laser or a jet turbine monitor—clean, cold, and authoritative, but balanced by the warmth of a new copper accent (#B45309) that suggests mechanical reliability rather than digital alarm.

---

## 2. Colors & Surface Architecture

### The Palette
We utilize a sophisticated interaction between deep teals, technical blues, and an industrial copper.

*   **Primary (`#005c55` / `#0f766e`):** Our foundational "Clinical Teal." It represents the steady hand of the system.
*   **Secondary (`#3755c3` / `#1e40af`):** Used for technical data points and interactive deep-dives.
*   **Tertiary/Accent (`#863b00` / `#b45309`):** The "Industrial Copper." This is reserved for warnings, critical data highlights, and mechanical states. It is purposeful and muted.

### The "No-Line" Rule & Surface Hierarchy
Traditional UI uses borders to separate ideas. We use **Tonal Depth**. To create a high-end feel, sectioning is achieved through background color shifts.
*   **The Nesting Principle:** A dashboard should be a "Surface" (`#f7faf8`). A main data container sits on top as "Surface-Container-Low" (`#f1f4f3`). Individual data units inside that container use "Surface-Container-Lowest" (`#ffffff`).
*   **The Glass Rule:** For floating modals or overlays, use the `surface` color at 80% opacity with a `20px` backdrop blur. This ensures the data-dense background remains visible but non-distracting.
*   **Signature Textures:** Use a subtle linear gradient on primary CTAs (from `primary` to `primary_container`) to give the button a "machined" feel rather than a flat digital fill.

---

## 3. Typography: The Engineering Font
We use **Inter** exclusively. Its neutral, grotesque letterforms provide the "clinical" look required.

*   **Data Dominance:** All numbers must use **Tabular Lining** (`font-variant-numeric: lining-nums tabular-nums`). This ensures columns of data align perfectly, maintaining the engineering aesthetic.
*   **Display (Lg/Md/Sm):** Used for high-level metrics. Keep tracking tight (-0.02em) to look "plotted."
*   **Title & Headline:** Use for section headers. Always paired with `surface_container_highest` background accents to anchor the text.
*   **Label (Md/Sm):** Our most important tier for industrial use. Use for units (e.g., *kg/cm²*). These should often be in all-caps with a +0.05em letter spacing for a "technical spec" look.

---

## 4. Elevation & Depth
In this system, depth is a function of light, not lines.

*   **The Layering Principle:** Avoid shadows for static elements. Instead, "stack" tiers. Place a `surface_container_highest` element on a `surface_container` background to create a physical "inset" look.
*   **Ambient Shadows:** For floating elements (tooltips/dropdowns), use a multi-layered shadow:
    *   `0px 4px 20px rgba(24, 28, 28, 0.04)`
    *   `0px 2px 8px rgba(24, 28, 28, 0.06)`
    *   The color is a tint of `on_surface`, never pure black.
*   **The "Ghost Border" Fallback:** If a border is required for a data table, use `outline_variant` at 20% opacity. It should be felt, not seen.

---

## 5. Components

### Buttons & Inputs
*   **Primary Button:** `primary` fill with a 1px `outline` at 10% opacity to "sharpen" the edges. 0.25rem (4px) corner radius.
*   **Secondary/Tertiary:** `surface_container_high` fills. Interactions should trigger a shift to `surface_container_highest`.
*   **Input Fields:** Use `surface_container_low` as the base fill. On focus, the bottom border only should animate to `primary`. Use `label-sm` for persistent floating labels.

### Data Chips
*   **Warning Chips:** Use `tertiary_fixed_dim` (`#ffb68e`) background with `on_tertiary_fixed` (`#331200`) text. This provides a "Copper/Amber" warning that is high-contrast but "clinical" rather than "panic-inducing."

### Lists & Tables
*   **Dividerless Design:** Do not use horizontal rules (`<hr>`). Separate list items by alternating between `surface` and `surface_container_low` background colors, or by using 12px of vertical white space.
*   **Precision Headers:** Table headers should use `label-md` in `on_surface_variant` with a 1px `outline_variant` bottom-only border at 30% opacity.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use the Spacing Scale religiously. Clinical layouts require "breathable density."
*   **Do** use `tertiary` (#B45309) sparingly. It is a "high-value" color meant to draw the eye to anomalies or warnings.
*   **Do** use 1px borders ONLY when creating a "machined" look for specific data-entry containers.

### Don’t
*   **Don't** use 100% black text. Always use `on_surface` (#181c1c) for better readability on clinical monitors.
*   **Don't** use rounded corners larger than `0.5rem (8px)`. Large radii feel "consumer-grade" and soft; we require "industrial" and sharp.
*   **Don't** use standard drop shadows. If an element doesn't look elevated through color alone, re-evaluate the surface hierarchy.

---

## 7. Implementation Note
When building layouts, think of a physical control panel. Every element should feel like it was "milled" into the interface. Use the `surface_container` tiers to define the "chassis" of the app, and the `primary` and `tertiary` tokens as the "indicators" and "switches."```