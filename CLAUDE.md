# CLAUDE.md

## Recent changes

- `a37b24f` — Switch medical chart from ComposedChart to ScatterChart for item-mode (2D) tooltip hover; disable tooltip fly-in animation
- `6aa55d0` — Initial commit: daily activity chart, medical temperature/medication chart, CSV import, localStorage persistence

## In progress (uncommitted)

- Test infrastructure: `src/helpers.js` (extracted pure functions), `src/__tests__/` (68 tests), vitest+jsdom+istanbul config, `make test`

## Conventions

- Pure data functions live in `src/helpers.js`; React components and chart config stay in `src/NaraAnalytics.jsx`
- Medical chart must use `ScatterChart`, not `ComposedChart` — axis-mode tooltips (ComposedChart) snap to x-position and cause cross-series interference
- Temperature readings are per-reading scatter points — no bucketing or averaging
- Epoch ms on a `type="number" scale="time"` x-axis for the medical chart
- Tests: vitest + jsdom + istanbul (not c8); import modules directly
- **Every new feature must include tests.** New pure functions go in `helpers.js` and get a test in `helpers.test.js`; new components get tests in the appropriate `__tests__/` file.

## Planned / in-progress

- Customize (for my use case and/or in general) the pills shown on the top chart
- Add night mode
