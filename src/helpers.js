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

export function aggregateMedical(records, { days = 7, now = Date.now() } = {}) {
  const medicals = records.filter((r) => r["Type"] === "Medical");

  let windowStart;
  if (days === "all") {
    const epochs = medicals
      .map((r) => parseInt(r["Start Date/time (Epoch)"]) || 0)
      .filter((e) => e > 0 && e <= now);
    windowStart = epochs.length ? Math.min(...epochs) : now - 7 * DAY_MS;
  } else {
    windowStart = now - days * DAY_MS;
  }
  const startDate = new Date(windowStart);
  startDate.setHours(0, 0, 0, 0);
  const start = startDate.getTime();

  const temps = [];
  const meds = [];

  medicals.forEach((r) => {
    const epoch = parseInt(r["Start Date/time (Epoch)"]) || 0;
    if (epoch < start || epoch > now) return;

    const rawTemp = r["[Medical] Temperature"];
    if (rawTemp) {
      const f = toF(rawTemp, r["[Medical] Temperature Unit"]);
      if (f !== null) temps.push({ x: epoch, y: f, lbl: formatEpoch(epoch) });
    }
    if (r["[Medical] Medication"]) {
      meds.push({ x: epoch, y: 96.5, lbl: formatEpoch(epoch), med_name: r["[Medical] Medication"] });
    }
  });

  // Step ticks so long windows stay readable (~10 ticks max): daily for
  // 7d/14d, every 3rd day for 30d, wider for "all".
  const windowDays = Math.ceil((now - start) / DAY_MS);
  const stepMs = Math.max(1, Math.ceil(windowDays / 10)) * DAY_MS;
  const dayTicks = [];
  for (let t = start; t <= now; t += stepMs) dayTicks.push(t);

  return { temps, meds, domain: [start, now], dayTicks };
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
