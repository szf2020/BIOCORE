# SCADA Engine Assets

## Shapes (FUXA-imported)

`shapes/*.svg` — 154 SVG icons imported from FUXA.

### Public serving

Next.js serves `packages/web-ui/public/scada-shapes/` at URL path `/scada-shapes/<file>.svg`.

After adding, removing, or renaming any file in `shapes/`:

```bash
# 1. Regenerate the catalog (used by palette ShapePicker)
pnpm -w gen:shape-catalog

# 2. Manually copy SVG to the public dir (Next.js does not auto-mirror)
cp packages/web-ui/src/scada-engine/assets/shapes/*.svg \
   packages/web-ui/public/scada-shapes/
```

(SP-FX-8 may automate the copy step via a build hook.)

### Why two directories?

- `assets/shapes/` is the **source of truth** versioned with the engine code.
- `public/scada-shapes/` is the **served copy** Next.js exposes to browsers (only files under `public/` get a public URL).
- The catalog generator reads from `assets/shapes/`. The runtime `<image href>` resolves from `public/scada-shapes/`.
