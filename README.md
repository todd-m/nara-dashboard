# nara-dashboard

A single-page React dashboard for visualizing [Nara Baby](https://nara.baby) CSV exports.

## What it does

Import a CSV exported from the Nara Baby app and get interactive charts for:

- **Daily activity** — sleep hours, feed count, breastfeed time, bottle/pump oz, diaper count (7d / 14d / 30d / all-time views)
- **Medical** — temperature scatter plot (per-reading, °F) on the left axis, and medication doses as bars against a right-side mL axis, with the same selectable time windows

Both charts page backward and forward through time (◀ ▶) in steps of the selected window size, independently of each other.

Data is persisted in `localStorage` so imports survive page refreshes. Multiple profiles in a single CSV are supported via a profile selector. Dark mode follows the system `prefers-color-scheme` setting automatically.

## Architecture

| File | Role |
|---|---|
| `src/helpers.js` | Pure functions — units: `toF`, `toOz`; formatting: `formatEpoch`, `formatDay`, `formatWindow`; aggregation: `aggregateByDay`, `aggregateMedical`, `fillMissingDays`; parsing: `parseMedication`; time windows: `timeWindow`, `windowTicks`, `earliestEpoch`; storage: `loadFromStorage`, `saveToStorage` |
| `src/NaraAnalytics.jsx` | React component + `WindowControls` (range pills with ◀ ▶ pagers) + chart marks/tooltips (`ChartTip`, `MedBar`, `MedicalChartTip`); imports from helpers |
| `src/__tests__/` | vitest + jsdom test suite (106 tests) |

| Layer | Detail |
|---|---|
| Parsing | PapaParse (CSV → JS objects), dedup on `_activityKey` column |
| Aggregation | `aggregateByDay()` — rolls records into per-day totals; `aggregateMedical()` — extracts individual readings |
| Charts | recharts `ComposedChart` (main daily chart), `ScatterChart` (medical — item-mode 2D hover) |
| Persistence | `localStorage` under key `nara_data` |

Key design decisions:
- Medical data uses `ScatterChart` (not `ComposedChart`) so tooltip hover fires on exact 2D point proximity, not x-axis snap
- Temperature readings are plotted individually — no bucketing or averaging, which would misrepresent clinical data
- Time positions on the medical chart use epoch milliseconds on a numeric/time-scaled x-axis
- Paged time windows tile back-to-back (each page ends where the previous one starts, floored to local midnight), so no records fall between pages
- Pages with no data still render full chart frames (axes, ticks, fever line) rather than collapsing to an empty state
- Nara has no dosage column — the dose is parsed from the medication string itself (`"Children's Tylenol, 1.5 (ML)"`), tolerating commas in names and falling back to name-only

## Setup

```bash
npm install
make dev      # or: npm run dev
make test     # or: npm test
```

Open [http://localhost:5173](http://localhost:5173), then import a Nara CSV via the "⬆ import csv" button.
