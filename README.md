# nara-dashboard

A single-page React dashboard for visualizing [Nara Baby](https://nara.baby) CSV exports.

## What it does

Import a CSV exported from the Nara Baby app and get interactive charts for:

- **Daily activity** — sleep hours, feed count, breastfeed time, bottle/pump oz, diaper count (7d / 14d / 30d / all-time views)
- **Medical** — temperature scatter plot (per-reading, °F) and medication events over the last 7 days

Data is persisted in `localStorage` so imports survive page refreshes. Multiple profiles in a single CSV are supported via a profile selector. Dark mode follows the system `prefers-color-scheme` setting automatically.

## Architecture

| File | Role |
|---|---|
| `src/helpers.js` | Pure functions: `toF`, `toOz`, `formatEpoch`, `aggregateByDay`, `aggregateMedical`, `loadFromStorage`, `saveToStorage` |
| `src/NaraAnalytics.jsx` | React component + tooltip components (`ChartTip`, `MedDot`, `MedicalChartTip`); imports from helpers |
| `src/__tests__/` | vitest + jsdom test suite (68 tests) |

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

## Setup

```bash
npm install
make dev      # or: npm run dev
make test     # or: npm test
```

Open [http://localhost:5173](http://localhost:5173), then import a Nara CSV via the "⬆ import csv" button.
