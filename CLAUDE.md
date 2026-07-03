# CLAUDE.md

## Recent changes

- _(uncommitted)_ — Medical chart time-window selector: `aggregateMedical(records, { days, now })` accepts 7/14/30/`"all"` (`"all"` anchors at earliest medical record's midnight); `dayTicks` stepped to ~10 max; shared `RangeButtons` component used by both charts; `medRange` state + dynamic section label
- `8cf1722` — Standards alignment (`~/Projects/standards/STANDARDS.md`): coverage threshold (80% lines) in `vite.config.js`, Makefile standard verbs (`help/install/lint/clean`; `lint` now part of `make ci`), GitHub Actions CI. React fixes for the react-hooks v7 rules: persisted-data load moved from mount effect to lazy `useState` initializers (no more empty first paint); `Date.now()` calls in render replaced with a `now` captured at mount ("last N days" windows are now fixed at page load — re-derive on import if that ever matters); `useDarkMode` creates its MediaQueryList inside the effect.
- `a3853ee` — Dark mode: `LIGHT`/`DARK` theme tokens, `useDarkMode()` hook tracking `prefers-color-scheme`, theme applied to all inline styles, chart axes/grids, and tooltips
- `a97a000` — Update CLAUDE.md and README to reflect test infrastructure
- `cc76b17` — Add vitest + jsdom + istanbul test suite (68 tests); extract helpers to `src/helpers.js`; add `make test`
- `a37b24f` — Switch medical chart from ComposedChart to ScatterChart for item-mode (2D) tooltip hover; disable tooltip fly-in animation
- `6aa55d0` — Initial commit: daily activity chart, medical temperature/medication chart, CSV import, localStorage persistence

## Conventions

- Pure data functions live in `src/helpers.js`; React components and chart config stay in `src/NaraAnalytics.jsx`
- Medical chart must use `ScatterChart`, not `ComposedChart` — axis-mode tooltips (ComposedChart) snap to x-position and cause cross-series interference
- Temperature readings are per-reading scatter points — no bucketing or averaging
- Epoch ms on a `type="number" scale="time"` x-axis for the medical chart
- Tests: vitest + jsdom + istanbul (not c8); import modules directly
- **Every new feature must include tests.** New pure functions go in `helpers.js` and get a test in `helpers.test.js`; new components get tests in the appropriate `__tests__/` file.

## Planned

- Customize (for my use case and/or in general) the pills shown on the top chart
