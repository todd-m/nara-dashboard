# CLAUDE.md

## Recent changes

- _(uncommitted)_ — Medical chart time-window selector + paging on both charts: window math consolidated in `helpers.js` (`timeWindow(records, { days, offset, now })` — pages tile back-to-back, `"all"` anchors at earliest record's midnight and ignores offset; `windowTicks` steps ticks to ~10 max; `earliestEpoch`, `formatDay`, `formatWindow`). `aggregateMedical` takes `{ days, offset, now }`. Shared `WindowControls` component (◀ range-pills ▶) drives both charts; ◀ gated by earliest record, ▶ by offset 0, both off on "All"; selecting a range resets its offset; paged windows show mm/dd – mm/dd labels. Empty pages keep their axes: main chart pads windowed views via `fillMissingDays` (null-valued rows, one per calendar day; `ChartTip` skips null entries); medical chart carries an invisible anchor `Scatter` point because recharts drops axes/ticks/reference lines when every series is empty, even with explicit `domain`/`ticks`. App root div needs `width: "100%"` + `boxSizing: "border-box"`: `#root` is a column flexbox and cross-axis auto margins shrink-wrap the app to its widest row, so without it the charts re-width whenever the paging label changes
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
