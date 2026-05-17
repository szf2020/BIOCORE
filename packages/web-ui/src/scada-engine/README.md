# scada-engine

FUXA SCADA editor + gauges + viewer ported to React (Next.js 14). Lives inside `packages/web-ui`; not a separate npm package.

See `docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md` for the parent design spec.

## Subdirectories

| Dir | Owner SP-FX | Purpose |
|---|---|---|
| `assets/` | SP-FX-1 | SVG icons + shapes + fonts copied from FUXA (MIT) |
| `models/` | SP-FX-1 | `Hmi` TypeScript types + zod schemas |
| `api/` | SP-FX-1 | REST client for `/api/v1/fuxa-views` |
| `services/` | SP-FX-2 | TagBinding, ViewStore, ExpressionEval, Selection |
| `editor/` | SP-FX-3/4 | SVG editor canvas + palette + toolbar + property panels |
| `gauges/` | SP-FX-5/6 | 20 widgets + gauge-base + shape categories |
| `runtime/` | SP-FX-7 | View runtime (viewer) + GaugeMount lifecycle |
| `dialogs/` | SP-FX-2/5 | gui-helpers rewrite (confirm, file-upload, treetable, …) |
| `widgets-extras/` | SP-FX-5 | Self-implemented replacements for ngx-* deps |
| `cards-view/` | SP-FX-8 | Multi-view dashboard grid |
| `paginator/` | SP-FX-8 | Table pagination utility |

## Tag ID convention

All tag identifiers follow `<reactor_id>/<tag_path>`, e.g. `Reactor-1/temperature`.
