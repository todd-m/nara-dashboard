/**
 * NaraAnalytics.jsx
 * Standalone React component for charting Nara Baby CSV exports.
 *
 * Dependencies (npm install):
 *   recharts papaparse
 *
 * Drop into any React project and render <NaraAnalytics />.
 * Data persists in localStorage under the key "nara_data".
 */

import { useState, useEffect, useRef, useMemo } from "react";
import Papa from "papaparse";
import {
  ComposedChart, ScatterChart, Bar, Line, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, useYAxisScale,
} from "recharts";
import {
  STORAGE_KEY, aggregateByDay, aggregateMedical, loadFromStorage, saveToStorage,
  timeWindow, earliestEpoch, formatDay, formatWindow, fillMissingDays,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERIES = [
  { key: "sleep_hours",    label: "Sleep",   unit: "hrs/day",  color: "#4f88c8", bar: true  },
  { key: "feed_count",     label: "Feeds",   unit: "/day",     color: "#3aad7e", bar: false },
  { key: "breastfeed_min", label: "BF time", unit: "min/day",  color: "#9b72cf", bar: false },
  { key: "bottle_oz",      label: "Bottle",  unit: "oz/day",   color: "#c9a227", bar: false },
  { key: "pump_oz",        label: "Pump",    unit: "oz/day",   color: "#d9638a", bar: false },
  { key: "diaper_count",   label: "Diapers", unit: "/day",     color: "#6a9fb5", bar: false },
  { key: "dirty_count",    label: "Dirty",   unit: "/day",     color: "#c07843", bar: false },
];

const RANGES = [
  { v: "7",   l: "7d"  },
  { v: "14",  l: "14d" },
  { v: "30",  l: "30d" },
  { v: "all", l: "All" },
];

const MED_RANGES = [
  { v: "7",   l: "7d"  },
  { v: "14",  l: "14d" },
  { v: "30",  l: "30d" },
  { v: "all", l: "All" },
];

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const LIGHT = {
  bg:              "#ffffff",
  surface:         "#f9fafb",
  border:          "#e5e7eb",
  borderStrong:    "#d1d5db",
  text:            "#111827",
  textMuted:       "#6b7280",
  textFaint:       "#9ca3af",
  textFaintest:    "#d1d5db",
  gridLine:        "#f0f0f0",
  axisLine:        "#e5e7eb",
  btnBg:           "#ffffff",
  tooltipBg:       "#ffffff",
  tooltipShadow:   "rgba(0,0,0,0.08)",
  refLine100:      "#000000",
  toastBg:         "#f0fdf4",
  toastText:       "#15803d",
  toastBorder:     "#bbf7d0",
};

const DARK = {
  bg:              "#0f172a",
  surface:         "#1e293b",
  border:          "#334155",
  borderStrong:    "#475569",
  text:            "#f1f5f9",
  textMuted:       "#94a3b8",
  textFaint:       "#64748b",
  textFaintest:    "#475569",
  gridLine:        "#243044",
  axisLine:        "#334155",
  btnBg:           "#1e293b",
  tooltipBg:       "#1e293b",
  tooltipShadow:   "rgba(0,0,0,0.4)",
  refLine100:      "#64748b",
  toastBg:         "#14532d",
  toastText:       "#86efac",
  toastBorder:     "#166534",
};

function useDarkMode() {
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}

// ---------------------------------------------------------------------------
// Shared controls
// ---------------------------------------------------------------------------

/**
 * Range pills flanked by ◀/▶ pager arrows. Paging moves the window back and
 * forth by its own length; selecting a range resets to the current window.
 * `minEpoch` (earliest relevant record) gates how far back ◀ can go.
 */
function WindowControls({ ranges, value, onChange, offset, onOffsetChange, windowStart, minEpoch, theme }) {
  const isAll = value === "all";
  const canBack = !isAll && minEpoch != null && windowStart > minEpoch;
  const canFwd  = !isAll && offset > 0;

  const arrowStyle = (enabled) => ({
    padding: "4px 8px", fontSize: 12, borderRadius: 6,
    border: `1px solid ${theme.border}`,
    background: theme.btnBg,
    color: enabled ? theme.textMuted : theme.textFaintest,
    cursor: enabled ? "pointer" : "default",
  });

  return (
    <div style={{ display: "flex", gap: 3 }}>
      <button aria-label="earlier" disabled={!canBack} onClick={() => onOffsetChange(offset + 1)} style={arrowStyle(canBack)}>
        ◀
      </button>
      {ranges.map((r) => (
        <button key={r.v} onClick={() => onChange(r.v)}
          style={{
            padding: "4px 10px", fontSize: 12, borderRadius: 6,
            border: `1px solid ${theme.border}`,
            background: value === r.v ? theme.surface : theme.btnBg,
            color: value === r.v ? theme.text : theme.textMuted,
            fontWeight: value === r.v ? 600 : 400,
            cursor: "pointer",
          }}>
          {r.l}
        </button>
      ))}
      <button aria-label="later" disabled={!canFwd} onClick={() => onOffsetChange(offset - 1)} style={arrowStyle(canFwd)}>
        ▶
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart tooltips
// ---------------------------------------------------------------------------

export function ChartTip({ active, payload, label, theme = LIGHT }) {
  if (!active || !payload?.length) return null;
  // Filled-but-empty days carry null values — show nothing for them
  const rows = payload.filter((p) => p.value != null);
  if (!rows.length) return null;
  return (
    <div style={{
      background: theme.tooltipBg,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: "8px 12px",
      fontSize: 12,
      boxShadow: `0 2px 8px ${theme.tooltipShadow}`,
    }}>
      <div style={{ color: theme.textMuted, marginBottom: 6 }}>{label}</div>
      {rows.map((p) => {
        const s = SERIES.find((s) => s.key === p.dataKey);
        return (
          <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ color: theme.textMuted, width: 72 }}>{s?.label}</span>
            <span style={{ fontFamily: "monospace", fontWeight: 500, color: theme.text }}>
              {p.value} {s?.unit.split("/")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bar from the dose axis baseline up to the dose value. Must be passed to
 * Scatter as an element (`shape={<MedBar />}`) — recharts clones elements,
 * which makes this a real component instance so the hook is legal.
 */
export function MedBar({ cx, cy }) {
  const toPixel = useYAxisScale("dose");
  if (cx == null || cy == null || toPixel == null) return null;
  const baseline = toPixel(0);
  // 3px stub keeps doseless (y=0) meds visible and hoverable
  const height = Math.max(baseline - cy, 3);
  const top = baseline - height;
  return (
    <g>
      <rect x={cx - 8} y={top - 4} width={16} height={height + 8} fill="transparent" pointerEvents="all" />
      <rect x={cx - 3.5} y={top} width={7} height={height} rx={2} fill="#8b5cf6" opacity={0.85} pointerEvents="none" />
    </g>
  );
}

export function MedicalChartTip({ active, payload, theme = LIGHT }) {
  if (!active || !payload?.length) return null;
  const items = payload.map((p) => p.payload).filter(Boolean);
  if (!items.length) return null;

  const seen = new Set();
  const rows = [];
  items.forEach((d) => {
    const key = `${d.lbl}-${d.med_name || "temp"}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(d);
  });

  return (
    <div style={{
      background: theme.tooltipBg, border: `1px solid ${theme.border}`, borderRadius: 8,
      padding: "8px 12px", fontSize: 12, boxShadow: `0 2px 8px ${theme.tooltipShadow}`,
    }}>
      {rows.map((d, i) => d.med_name ? (
        <div key={`m-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8b5cf6", flexShrink: 0 }} />
          <span style={{ color: theme.textMuted, width: 56 }}>{d.lbl}</span>
          <span style={{ fontFamily: "monospace", fontWeight: 500, color: theme.text }}>
            {d.med_name}
            {d.dose != null && ` · ${d.dose} ${d.dose_unit?.toUpperCase() === "ML" ? "mL" : d.dose_unit ?? ""}`}
          </span>
        </div>
      ) : (
        <div key={`t-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 50, background: "#ef4444", flexShrink: 0 }} />
          <span style={{ color: theme.textMuted, width: 56 }}>{d.lbl}</span>
          <span style={{ fontFamily: "monospace", fontWeight: 500, color: theme.text }}>{d.y}°F</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NaraAnalytics() {
  // Persisted data loads via lazy initializers (runs once, before first paint)
  const [persisted] = useState(loadFromStorage);
  const [records, setRecords] = useState(persisted.records);
  const [meta, setMeta]       = useState(persisted.meta);
  const [active, setActive]   = useState(["sleep_hours", "feed_count"]);
  const [range, setRange]     = useState("30");
  const [rangeOffset, setRangeOffset] = useState(0);
  const [medRange, setMedRange] = useState("7");
  const [medOffset, setMedOffset] = useState(0);
  const [profile, setProfile] = useState("all");
  const [importing, setImporting] = useState(false);
  const [toast, setToast]     = useState(null);
  // Reference time for "last N days" filters; captured at mount so renders
  // stay pure, refreshed on import so windows include records newer than mount
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef();

  const t = useDarkMode() ? DARK : LIGHT;

  const profiles = useMemo(
    () => [...new Set(records.map((r) => r["Profile Name"]).filter(Boolean))],
    [records]
  );

  const byProfile = useMemo(
    () => (profile === "all" ? records : records.filter((r) => r["Profile Name"] === profile)),
    [records, profile]
  );

  // "all" is a pass-through (no pagination, and records with missing epochs
  // are kept); every other range filters to the paged window.
  const mainWindow = useMemo(
    () => range === "all"
      ? null
      : timeWindow(byProfile, { days: parseInt(range), offset: rangeOffset, now }),
    [byProfile, range, rangeOffset, now]
  );

  const filtered = useMemo(() => {
    if (!mainWindow) return byProfile;
    return byProfile.filter((r) => {
      const e = parseInt(r["Start Date/time (Epoch)"] || "0");
      return e >= mainWindow.start && e <= mainWindow.end;
    });
  }, [byProfile, mainWindow]);

  // Pad windowed views to one row per calendar day so the x-axis (and its
  // ticks) reflects the full window even when days — or the whole page —
  // have no data. "All" stays data-only.
  const chartData = useMemo(() => {
    const days = aggregateByDay(filtered);
    return mainWindow ? fillMissingDays(days, mainWindow.start, mainWindow.end) : days;
  }, [filtered, mainWindow]);

  const mainMinEpoch = useMemo(() => earliestEpoch(byProfile, now), [byProfile, now]);
  const medMinEpoch = useMemo(
    () => earliestEpoch(byProfile.filter((r) => r["Type"] === "Medical"), now),
    [byProfile, now]
  );

  const hasMedical = useMemo(
    () => byProfile.some((r) => r["Type"] === "Medical"),
    [byProfile]
  );

  const medicalData = useMemo(
    () => hasMedical
      ? aggregateMedical(byProfile, {
          days: medRange === "all" ? "all" : parseInt(medRange),
          offset: medOffset,
          now,
        })
      : { temps: [], meds: [], domain: [now - 7 * 86400000, now], dayTicks: [], doseDomain: [0, 2] },
    [byProfile, hasMedical, medRange, medOffset, now]
  );

  const stats = useMemo(() => {
    const cutoff = now - 7 * 86400000;
    const d = aggregateByDay(
      byProfile.filter((r) => parseInt(r["Start Date/time (Epoch)"] || "0") >= cutoff)
    );
    if (!d.length) return null;
    const avg = (key) => {
      const vals = d.map((x) => x[key]).filter((v) => v > 0);
      return vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : "—";
    };
    return {
      sleep: avg("sleep_hours"),
      feeds: avg("feed_count"),
      diapers: avg("diaper_count"),
      days: d.length,
    };
  }, [byProfile, now]);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const cleaned = data.map((r) => {
          const c = {};
          Object.entries(r).forEach(([k, v]) => { if (v !== "" && v != null) c[k] = v; });
          return c;
        });

        const map = {};
        records.forEach((r) => { if (r["_activityKey"]) map[r["_activityKey"]] = r; });
        let added = 0;
        cleaned.forEach((r) => {
          if (!r["_activityKey"]) return;
          if (!map[r["_activityKey"]]) added++;
          map[r["_activityKey"]] = r;
        });

        const merged = Object.values(map);
        const newMeta = { count: merged.length, lastImport: new Date().toLocaleString() };

        saveToStorage(merged, newMeta);
        setRecords(merged);
        setMeta(newMeta);
        setNow(Date.now());
        setToast(`${added} new records added · ${merged.length} total`);
        setTimeout(() => setToast(null), 4000);
        setImporting(false);
        e.target.value = "";
      },
      error: () => setImporting(false),
    });
  }

  function changeRange(v) {
    setRange(v);
    setRangeOffset(0);
  }

  function changeMedRange(v) {
    setMedRange(v);
    setMedOffset(0);
  }

  function toggleSeries(key) {
    setActive((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function clearData() {
    if (!window.confirm("Clear all stored records?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setRecords([]);
    setMeta(null);
  }

  const activeSeries = SERIES.filter((s) => active.includes(s.key));

  const card = {
    background: t.surface,
    borderRadius: 8,
    padding: "10px 14px",
    border: `1px solid ${t.border}`,
  };

  return (
    // width + border-box are load-bearing: #root is a column flexbox, and a
    // flex item with cross-axis auto margins shrink-wraps to its content
    // width unless given an explicit width — making the whole app (and the
    // ResponsiveContainer charts) re-width whenever the controls row changes.
    <div style={{ fontFamily: "system-ui, sans-serif", width: "100%", boxSizing: "border-box", maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", background: t.bg, color: t.text, minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: t.text }}>baby data</h1>
          {meta && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textMuted }}>
              {meta.count.toLocaleString()} records · last import {meta.lastImport}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {profiles.length > 1 && (
            <select value={profile} onChange={(e) => setProfile(e.target.value)}
              style={{ fontSize: 13, padding: "5px 8px", borderRadius: 6, border: `1px solid ${t.borderStrong}`, background: t.btnBg, color: t.text }}>
              <option value="all">all profiles</option>
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <input type="file" accept=".csv" ref={fileRef} style={{ display: "none" }} onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            style={{ padding: "5px 12px", fontSize: 13, borderRadius: 6, border: `1px solid ${t.borderStrong}`, background: t.btnBg, color: t.text, cursor: "pointer" }}>
            {importing ? "importing…" : "⬆ import csv"}
          </button>
          {records.length > 0 && (
            <button onClick={clearData}
              style={{ padding: "5px 12px", fontSize: 13, borderRadius: 6, border: "1px solid #fca5a5", background: t.btnBg, color: "#dc2626", cursor: "pointer" }}>
              clear
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
          {[
            { label: "avg sleep",   value: stats.sleep,   unit: "hrs/day" },
            { label: "avg feeds",   value: stats.feeds,   unit: "per day" },
            { label: "avg diapers", value: stats.diapers, unit: "per day" },
          ].map((s) => (
            <div key={s.label} style={card}>
              <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 600, lineHeight: 1, color: t.text }}>{s.value}</div>
              <div style={{ fontSize: 11, color: t.textFaintest, marginTop: 4 }}>{s.unit} · {stats.days}d avg</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {SERIES.map((s) => {
            const on = active.includes(s.key);
            return (
              <button key={s.key} onClick={() => toggleSeries(s.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", fontSize: 12, borderRadius: 20,
                  border: `1px solid ${on ? s.color : t.border}`,
                  color: on ? s.color : t.textFaint,
                  background: on ? `${s.color}18` : t.btnBg,
                  cursor: "pointer",
                }}>
                <span style={{ width: 7, height: 7, borderRadius: s.bar ? 1 : 50, background: on ? s.color : t.textFaintest, flexShrink: 0 }} />
                {s.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rangeOffset > 0 && mainWindow && (
            <span style={{ fontSize: 12, color: t.textFaint }}>
              {formatWindow(mainWindow.start, mainWindow.end)}
            </span>
          )}
          <WindowControls
            ranges={RANGES} value={range} onChange={changeRange}
            offset={rangeOffset} onOffsetChange={setRangeOffset}
            windowStart={mainWindow ? mainWindow.start : 0} minEpoch={mainMinEpoch}
            theme={t}
          />
        </div>
      </div>

      {/* Chart */}
      {byProfile.length === 0 || chartData.length === 0 ? (
        <div style={{ border: `1px dashed ${t.borderStrong}`, borderRadius: 12, padding: "3rem", textAlign: "center", color: t.textFaint, fontSize: 14 }}>
          {byProfile.length ? "no data in this window" : "import a nara csv export to get started"}
        </div>
      ) : (
        <div style={{ height: 320, ...card }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} vertical={false} />
              <XAxis dataKey="lbl" tick={{ fontSize: 11, fill: t.textFaint }} tickLine={false} axisLine={{ stroke: t.axisLine }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: t.textFaint }} tickLine={false} axisLine={false} />
              <Tooltip content={(p) => <ChartTip theme={t} {...p} />} />
              {activeSeries.map((s) =>
                s.bar
                  ? <Bar  key={s.key} dataKey={s.key} fill={s.color} fillOpacity={0.45} radius={[2, 2, 0, 0]} maxBarSize={18} />
                  : <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={1.5} dot={false} type="monotone" connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Medical chart */}
      {hasMedical && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
            <div style={{ fontSize: 12, color: t.textFaint }}>
              medical · {
                medRange === "all" ? "all time"
                : medOffset > 0 ? formatWindow(medicalData.domain[0], medicalData.domain[1])
                : `last ${medRange} days`
              }
            </div>
            <WindowControls
              ranges={MED_RANGES} value={medRange} onChange={changeMedRange}
              offset={medOffset} onOffsetChange={setMedOffset}
              windowStart={medicalData.domain[0]} minEpoch={medMinEpoch}
              theme={t}
            />
          </div>
          <div style={{ height: 220, ...card }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.gridLine} vertical={false} />
                <XAxis
                  dataKey="x"
                  type="number"
                  scale="time"
                  domain={medicalData.domain}
                  ticks={medicalData.dayTicks}
                  tickFormatter={formatDay}
                  tick={{ fontSize: 11, fill: t.text, fontWeight: 500 }}
                  tickLine={{ stroke: t.textMuted, strokeWidth: 1 }}
                  axisLine={{ stroke: t.axisLine }}
                />
                <YAxis
                  yAxisId="temp"
                  dataKey="y"
                  type="number"
                  domain={[96, 105]}
                  ticks={[97, 98, 99, 100, 101, 102, 103, 104, 105]}
                  tick={{ fontSize: 11, fill: t.textFaint }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}°`}
                />
                <YAxis
                  yAxisId="dose"
                  dataKey="y"
                  type="number"
                  orientation="right"
                  domain={medicalData.doseDomain}
                  ticks={Array.from({ length: medicalData.doseDomain[1] }, (_, i) => i + 1)}
                  width={52}
                  tick={{ fontSize: 11, fill: "#8b5cf6" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v} mL`}
                />
                {medicalData.dayTicks.map((tick) => (
                  <ReferenceLine key={tick} x={tick} yAxisId="temp" stroke={t.gridLine} strokeWidth={1} />
                ))}
                <ReferenceLine y={100} yAxisId="temp" stroke={t.refLine100} strokeWidth={1} strokeDasharray="4 3" />
                <Tooltip content={(p) => <MedicalChartTip theme={t} {...p} />} cursor={false} animationDuration={0} />
                {/* Invisible anchor: recharts drops axes/ticks/reference lines
                    entirely when every series is empty, so keep one no-op
                    point in-domain (renders nothing, no hover hit-area). */}
                <Scatter
                  yAxisId="temp"
                  data={[{ x: medicalData.domain[0], y: 96 }]}
                  shape={() => null}
                  isAnimationActive={false}
                />
                <Scatter
                  yAxisId="temp"
                  data={medicalData.temps}
                  shape={(p) => <circle cx={p.cx} cy={p.cy} r={5} fill="#ef4444" stroke={t.surface} strokeWidth={1.5} />}
                  isAnimationActive={false}
                />
                <Scatter
                  yAxisId="dose"
                  data={medicalData.meds}
                  shape={<MedBar />}
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ marginTop: "1rem", padding: "10px 14px", background: t.toastBg, color: t.toastText, borderRadius: 8, fontSize: 13, border: `1px solid ${t.toastBorder}` }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
