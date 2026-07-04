# CLAUDE.md

## Recent changes

- _(uncommitted)_ — Stat cards derive from pills: one card per active main-chart series with data in the 7d window (`avgByKey` in helpers); medical chart gains Temp/Meds pills (`medActive`, hides series + its axis + fever line) and 24h stat cards (`medicalStats` in helpers: total dose mL, temp avg/min/max). Shared `SeriesPill`/`StatCard` components; cards have `data-testid="stat-card-<key>"`
- _(uncommitted)_ — Fix: records newer than page load never appeared (window upper bound used the mount-captured `now`); `now` is state again and `handleFile` refreshes it on import
- `d60bd25` — Medication dosage axis + bars: right-side mL y-axis on the medical chart (`yAxisId="dose"`, purple); meds render as `MedBar` bars from the baseline up to their dose (3px stub when doseless). Nara embeds dose in the medication string ("Children's Tylenol, 1.5 (ML)") — `parseMedication()` in `helpers.js` splits the trailing ", <n> (<unit>)" (commas in names survive); `aggregateMedical` returns `doseDomain` ([0, ceil(1.25×max)], floor 2). Gotchas: all other medical-chart elements (temps, anchor, ReferenceLines) need explicit `yAxisId="temp"`; `MedBar` finds the baseline via recharts' `useYAxisScale("dose")` hook, so it must be passed as an element (`shape={<MedBar />}`) — function-form shapes can't call hooks
- `4ffc043` — Pagination on both charts by window size, empty-page handling, width-flicker fix. Window math consolidated in `helpers.js`: `timeWindow(records, { days, offset, now })` (pages tile back-to-back, midnight-floored; `"all"` anchors at earliest record and ignores offset), `windowTicks`, `earliestEpoch`, `fillMissingDays`, `formatDay`/`formatWindow`. Shared `WindowControls` (◀ range-pills ▶): ◀ gated by earliest record, ▶ by offset 0, both off on "All"; range change resets offset; paged windows show mm/dd – mm/dd labels
- `5874a9f` — Medical chart time-window selector: `aggregateMedical` takes `{ days, offset, now }` options, accepts 7/14/30/`"all"`; day ticks stepped to ~10 max
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
- recharts drops axes/ticks/reference lines when every series in a chart is empty, even with explicit `domain`/`ticks` — the medical chart keeps an invisible anchor `Scatter` point; the main chart pads windowed views with null-valued day rows (`fillMissingDays`), and `ChartTip` skips null entries
- The app root div must keep `width: "100%"` + `boxSizing: "border-box"`: `#root` is a column flexbox, and cross-axis auto margins shrink-wrap the app to its widest row — without an explicit width, the charts re-width whenever the controls row content changes
- Tests: vitest + jsdom + istanbul (not c8); import modules directly. The `ResponsiveContainer` mock clones charts with fixed dimensions so recharts renders real geometry in jsdom
- **Every new feature must include tests.** New pure functions go in `helpers.js` and get a test in `helpers.test.js`; new components get tests in the appropriate `__tests__/` file.

## Planned

- Customize (for my use case and/or in general) the pills shown on the top chart
