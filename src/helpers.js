export const STORAGE_KEY = "nara_data";

export function toOz(val, unit) {
  const n = parseFloat(val) || 0;
  return unit === "ml" ? n / 29.5735 : n;
}

export function toF(val, unit) {
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return unit === "C" ? Math.round((n * 9 / 5 + 32) * 10) / 10 : n;
}

export function formatEpoch(epoch) {
  const d = new Date(epoch);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${dy} ${hr}:${min}`;
}

export function formatDay(epoch) {
  const d = new Date(epoch);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function formatWindow(start, end) {
  return `${formatDay(start)} – ${formatDay(end)}`;
}

export function aggregateByDay(records) {
  const days = {};

  records.forEach((r) => {
    const dt = r["Start Date/time"];
    if (!dt) return;
    const date = dt.slice(0, 10);

    if (!days[date]) {
      days[date] = {
        date,
        sleep_s: 0,
        feed_count: 0,
        bf_s: 0,
        bottle_oz: 0,
        pump_oz: 0,
        diaper_count: 0,
        dirty_count: 0,
      };
    }

    const d = days[date];
    const t = r["Type"];

    if (t === "Sleep") {
      d.sleep_s += parseFloat(r["[Sleep] Duration (Seconds)"]) || 0;
    } else if (t === "Breastfeed") {
      d.feed_count++;
      d.bf_s +=
        (parseFloat(r["[Breastfeed] Left Duration (Seconds)"]) || 0) +
        (parseFloat(r["[Breastfeed] Right Duration (Seconds)"]) || 0);
    } else if (t === "Bottle Feed") {
      d.feed_count++;
      d.bottle_oz += toOz(r["[Bottle Feed] Volume"], r["[Bottle Feed] Volume Unit"]);
    } else if (t === "Combo Feed") {
      d.feed_count++;
      d.bf_s +=
        (parseFloat(r["[Combo Feed] Left Duration (Seconds)"]) || 0) +
        (parseFloat(r["[Combo Feed] Right Duration (Seconds)"]) || 0);
      if (r["[Combo Feed] Volume"])
        d.bottle_oz += toOz(r["[Combo Feed] Volume"], r["[Combo Feed] Volume Unit"]);
    } else if (t === "Pump") {
      d.pump_oz += toOz(r["[Pump] Total Volume"], r["[Pump] Total Volume Unit"]);
    } else if (t === "Diaper") {
      d.diaper_count++;
      if (r["[Diaper] Type"] === "Dirty" || r["[Diaper] Type"] === "Mixed")
        d.dirty_count++;
    }
  });

  return Object.values(days)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      lbl: d.date.slice(5).replace("-", "/"),
      sleep_hours:    Math.round(d.sleep_s / 360) / 10,
      feed_count:     d.feed_count,
      breastfeed_min: Math.round(d.bf_s / 60),
      bottle_oz:      Math.round(d.bottle_oz * 10) / 10,
      pump_oz:        Math.round(d.pump_oz * 10) / 10,
      diaper_count:   d.diaper_count,
      dirty_count:    d.dirty_count,
    }));
}

const DAY_MS = 24 * 3600 * 1000;

function floorToMidnight(epoch) {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function earliestEpoch(records, now = Infinity) {
  let min = Infinity;
  records.forEach((r) => {
    const e = parseInt(r["Start Date/time (Epoch)"]) || 0;
    if (e > 0 && e <= now && e < min) min = e;
  });
  return min === Infinity ? null : min;
}

export function timeWindow(records, { days = 7, offset = 0, now = Date.now() } = {}) {
  if (days === "all") {
    const anchor = earliestEpoch(records, now) ?? now - 7 * DAY_MS;
    return { start: floorToMidnight(anchor), end: now };
  }
  // Pages tile back to back: page k's end is page k-1's start, each start
  // floored to midnight so windows line up with day boundaries.
  let end = now;
  let start = floorToMidnight(end - days * DAY_MS);
  for (let k = 0; k < offset; k++) {
    end = start;
    start = floorToMidnight(end - days * DAY_MS);
  }
  return { start, end };
}

export function windowTicks(start, end) {
  // Step ticks so long windows stay readable (~10 ticks max): daily for
  // 7d/14d, every 3rd day for 30d, wider for "all".
  const windowDays = Math.ceil((end - start) / DAY_MS);
  const stepMs = Math.max(1, Math.ceil(windowDays / 10)) * DAY_MS;
  const ticks = [];
  for (let t = start; t <= end; t += stepMs) ticks.push(t);
  return ticks;
}

export function fillMissingDays(days, start, end) {
  const byDate = {};
  days.forEach((d) => { byDate[d.date] = d; });

  const filled = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  // Step by calendar day (not 24h) so DST transitions can't skew labels.
  while (cursor.getTime() <= end) {
    const mo = String(cursor.getMonth() + 1).padStart(2, "0");
    const dy = String(cursor.getDate()).padStart(2, "0");
    const date = `${cursor.getFullYear()}-${mo}-${dy}`;
    // null (not 0) for missing days: 0 would read as a measured zero
    filled.push(byDate[date] ?? {
      date,
      lbl: `${mo}/${dy}`,
      sleep_hours: null,
      feed_count: null,
      breastfeed_min: null,
      bottle_oz: null,
      pump_oz: null,
      diaper_count: null,
      dirty_count: null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return filled;
}

// Per-day average of a metric across aggregated day rows, ignoring zero/null
// days; null when the metric has no data at all
export function avgByKey(days, key) {
  const vals = days.map((d) => d[key]).filter((v) => v > 0);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

// Stats over the trailing 24 hours: summed medication dose (doseless entries
// count toward medCount but not the total) and temperature avg/min/max in °F
export function medicalStats(records, { now = Date.now() } = {}) {
  const start = now - DAY_MS;
  let doseTotal = 0;
  let medCount = 0;
  const temps = [];

  records.forEach((r) => {
    if (r["Type"] !== "Medical") return;
    const epoch = parseInt(r["Start Date/time (Epoch)"]) || 0;
    if (epoch < start || epoch > now) return;
    if (r["[Medical] Medication"]) {
      medCount++;
      const { dose } = parseMedication(r["[Medical] Medication"]);
      if (dose != null) doseTotal += dose;
    }
    const rawTemp = r["[Medical] Temperature"];
    if (rawTemp) {
      const f = toF(rawTemp, r["[Medical] Temperature Unit"]);
      if (f !== null) temps.push(f);
    }
  });

  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    medCount,
    doseTotal: round1(doseTotal),
    tempCount: temps.length,
    tempAvg: temps.length ? round1(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
  };
}

// Nara embeds the dose in the medication string: "Children's Tylenol, 1.5 (ML)".
// Greedy name group keeps commas inside the name; only the trailing
// ", <number> (<unit>)" is treated as the dose.
export function parseMedication(raw) {
  const m = /^(.+),\s*(\d*\.?\d+)\s*\(([^)]*)\)\s*$/.exec(raw ?? "");
  if (!m) return { name: (raw ?? "").trim(), dose: null, unit: null };
  return { name: m[1].trim(), dose: parseFloat(m[2]), unit: m[3].trim() };
}

export function aggregateMedical(records, { days = 7, offset = 0, now = Date.now() } = {}) {
  const medicals = records.filter((r) => r["Type"] === "Medical");
  const { start, end } = timeWindow(medicals, { days, offset, now });

  const temps = [];
  const meds = [];

  medicals.forEach((r) => {
    const epoch = parseInt(r["Start Date/time (Epoch)"]) || 0;
    if (epoch < start || epoch > end) return;

    const rawTemp = r["[Medical] Temperature"];
    if (rawTemp) {
      const f = toF(rawTemp, r["[Medical] Temperature Unit"]);
      if (f !== null) temps.push({ x: epoch, y: f, lbl: formatEpoch(epoch) });
    }
    if (r["[Medical] Medication"]) {
      const { name, dose, unit } = parseMedication(r["[Medical] Medication"]);
      // y is the dose in mL (right axis); doseless entries sit on the baseline
      meds.push({ x: epoch, y: dose ?? 0, lbl: formatEpoch(epoch), med_name: name, dose, dose_unit: unit });
    }
  });

  const maxDose = meds.reduce((m, d) => Math.max(m, d.dose ?? 0), 0);
  // Headroom above the tallest triangle; floor of 2 keeps the axis sane when
  // the window has no doses
  const doseDomain = [0, Math.max(2, Math.ceil(maxDose * 1.25))];

  return { temps, meds, domain: [start, end], dayTicks: windowTicks(start, end), doseDomain };
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], meta: null };
    return JSON.parse(raw);
  } catch {
    return { records: [], meta: null };
  }
}

export function saveToStorage(records, meta) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta }));
  } catch (err) {
    console.error("localStorage save failed:", err);
  }
}
