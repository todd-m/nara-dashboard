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
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  STORAGE_KEY, aggregateByDay, aggregateMedical, loadFromStorage, saveToStorage,
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
// Chart tooltips
// ---------------------------------------------------------------------------

export function ChartTip({ active, payload, label, theme = LIGHT }) {
  if (!active || !payload?.length) return null;
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
      {payload.map((p) => {
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

export function MedDot({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="transparent" pointerEvents="all" />
      <polygon
        points={`${cx},${cy - 6} ${cx - 5},${cy + 4} ${cx + 5},${cy + 4}`}
        fill="#8b5cf6"
        opacity={0.85}
        pointerEvents="none"
      />
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
          <span style={{ fontFamily: "monospace", fontWeight: 500, color: theme.text }}>{d.med_name}</span>
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
  const [profile, setProfile] = useState("all");
  const [importing, setImporting] = useState(false);
  const [toast, setToast]     = useState(null);
  // Reference time for "last N days" filters; fixed at mount so renders stay pure
  const [now] = useState(() => Date.now());
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

  const filtered = useMemo(() => {
    if (range === "all") return byProfile;
    const cutoff = now - parseInt(range) * 86400000;
    return byProfile.filter(
      (r) => parseInt(r["Start Date/time (Epoch)"] || "0") >= cutoff
    );
  }, [byProfile, range, now]);

  const chartData = useMemo(() => aggregateByDay(filtered), [filtered]);

  const hasMedical = useMemo(
    () => byProfile.some((r) => r["Type"] === "Medical"),
    [byProfile]
  );

  const medicalData = useMemo(
    () => hasMedical ? aggregateMedical(byProfile) : { temps: [], meds: [], domain: [now - 7 * 86400000, now], dayTicks: [] },
    [byProfile, hasMedical, now]
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
        setToast(`${added} new records added · ${merged.length} total`);
        setTimeout(() => setToast(null), 4000);
        setImporting(false);
        e.target.value = "";
      },
      error: () => setImporting(false),
    });
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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", background: t.bg, color: t.text, minHeight: "100vh" }}>

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
        <div style={{ display: "flex", gap: 3 }}>
          {RANGES.map((r) => (
            <button key={r.v} onClick={() => setRange(r.v)}
              style={{
                padding: "4px 10px", fontSize: 12, borderRadius: 6,
                border: `1px solid ${t.border}`,
                background: range === r.v ? t.surface : t.btnBg,
                color: range === r.v ? t.text : t.textMuted,
                fontWeight: range === r.v ? 600 : 400,
                cursor: "pointer",
              }}>
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div style={{ border: `1px dashed ${t.borderStrong}`, borderRadius: 12, padding: "3rem", textAlign: "center", color: t.textFaint, fontSize: 14 }}>
          import a nara csv export to get started
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
          <div style={{ fontSize: 12, color: t.textFaint, marginBottom: "0.75rem" }}>
            medical · last 7 days
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
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
                  }}
                  tick={{ fontSize: 11, fill: t.text, fontWeight: 500 }}
                  tickLine={{ stroke: t.textMuted, strokeWidth: 1 }}
                  axisLine={{ stroke: t.axisLine }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  domain={[96, 105]}
                  ticks={[97, 98, 99, 100, 101, 102, 103, 104, 105]}
                  tick={{ fontSize: 11, fill: t.textFaint }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}°`}
                />
                {medicalData.dayTicks.map((tick) => (
                  <ReferenceLine key={tick} x={tick} stroke={t.gridLine} strokeWidth={1} />
                ))}
                <ReferenceLine y={100} stroke={t.refLine100} strokeWidth={1} strokeDasharray="4 3" />
                <Tooltip content={(p) => <MedicalChartTip theme={t} {...p} />} cursor={false} animationDuration={0} />
                <Scatter
                  data={medicalData.temps}
                  shape={(p) => <circle cx={p.cx} cy={p.cy} r={5} fill="#ef4444" stroke={t.surface} strokeWidth={1.5} />}
                  isAnimationActive={false}
                />
                <Scatter
                  data={medicalData.meds}
                  shape={(p) => <MedDot {...p} />}
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
