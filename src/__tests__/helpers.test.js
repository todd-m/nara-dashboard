import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toOz, toF, formatEpoch, formatDay, formatWindow,
  aggregateByDay, aggregateMedical, fillMissingDays, parseMedication,
  avgByKey, medicalStats,
  timeWindow, windowTicks, earliestEpoch,
  loadFromStorage, saveToStorage, STORAGE_KEY,
} from '../helpers.js';

// ---------------------------------------------------------------------------
// toOz
// ---------------------------------------------------------------------------

describe('toOz', () => {
  it('converts ml to oz', () => {
    expect(toOz('29.5735', 'ml')).toBeCloseTo(1, 4);
  });

  it('passes through oz unchanged', () => {
    expect(toOz('8', 'oz')).toBe(8);
  });

  it('returns 0 for non-numeric value', () => {
    expect(toOz('', 'oz')).toBe(0);
    expect(toOz(undefined, 'oz')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toF
// ---------------------------------------------------------------------------

describe('toF', () => {
  it('converts 0°C to 32°F', () => {
    expect(toF('0', 'C')).toBe(32);
  });

  it('converts 37°C to 98.6°F', () => {
    expect(toF('37', 'C')).toBe(98.6);
  });

  it('converts 39°C to 102.2°F', () => {
    expect(toF('39', 'C')).toBe(102.2);
  });

  it('passes through °F values unchanged', () => {
    expect(toF('98.6', 'F')).toBe(98.6);
    expect(toF('102.2', 'F')).toBe(102.2);
  });

  it('returns null for non-numeric input', () => {
    expect(toF('', 'C')).toBeNull();
    expect(toF('N/A', 'C')).toBeNull();
    expect(toF(undefined, 'C')).toBeNull();
  });

  it('handles numeric (non-string) input', () => {
    expect(toF(37, 'C')).toBe(98.6);
  });
});

// ---------------------------------------------------------------------------
// formatEpoch
// ---------------------------------------------------------------------------

describe('formatEpoch', () => {
  it('formats a known timestamp correctly', () => {
    // 2024-05-14 08:30 local — construct via Date to stay timezone-agnostic
    const d = new Date(2024, 4, 14, 8, 30); // month is 0-indexed
    expect(formatEpoch(d.getTime())).toBe('05/14 08:30');
  });

  it('zero-pads month, day, hour, minute', () => {
    const d = new Date(2024, 0, 5, 3, 7); // Jan 5, 03:07
    expect(formatEpoch(d.getTime())).toBe('01/05 03:07');
  });
});

// ---------------------------------------------------------------------------
// aggregateByDay
// ---------------------------------------------------------------------------

describe('aggregateByDay', () => {
  it('returns empty array for no records', () => {
    expect(aggregateByDay([])).toEqual([]);
  });

  it('skips records with no Start Date/time', () => {
    expect(aggregateByDay([{ Type: 'Sleep' }])).toEqual([]);
  });

  it('accumulates sleep seconds and converts to hours', () => {
    const records = [
      { 'Start Date/time': '2024-05-14 08:00', Type: 'Sleep', '[Sleep] Duration (Seconds)': '3600' },
      { 'Start Date/time': '2024-05-14 12:00', Type: 'Sleep', '[Sleep] Duration (Seconds)': '3600' },
    ];
    const [day] = aggregateByDay(records);
    expect(day.sleep_hours).toBe(2); // 7200s / 360 / 10 = 2
  });

  it('counts Breastfeed as a feed and accumulates BF minutes', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Breastfeed',
      '[Breastfeed] Left Duration (Seconds)': '600',
      '[Breastfeed] Right Duration (Seconds)': '300',
    }];
    const [day] = aggregateByDay(records);
    expect(day.feed_count).toBe(1);
    expect(day.breastfeed_min).toBe(15); // 900s / 60
  });

  it('counts Bottle Feed as a feed and accumulates oz', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Bottle Feed',
      '[Bottle Feed] Volume': '4',
      '[Bottle Feed] Volume Unit': 'oz',
    }];
    const [day] = aggregateByDay(records);
    expect(day.feed_count).toBe(1);
    expect(day.bottle_oz).toBe(4);
  });

  it('converts bottle volume from ml to oz', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Bottle Feed',
      '[Bottle Feed] Volume': '29.5735',
      '[Bottle Feed] Volume Unit': 'ml',
    }];
    const [day] = aggregateByDay(records);
    expect(day.bottle_oz).toBeCloseTo(1, 1);
  });

  it('counts Combo Feed as a feed, accumulates BF time and optional volume', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Combo Feed',
      '[Combo Feed] Left Duration (Seconds)': '300',
      '[Combo Feed] Right Duration (Seconds)': '300',
      '[Combo Feed] Volume': '2',
      '[Combo Feed] Volume Unit': 'oz',
    }];
    const [day] = aggregateByDay(records);
    expect(day.feed_count).toBe(1);
    expect(day.breastfeed_min).toBe(10);
    expect(day.bottle_oz).toBe(2);
  });

  it('handles Combo Feed with no volume field', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Combo Feed',
      '[Combo Feed] Left Duration (Seconds)': '300',
      '[Combo Feed] Right Duration (Seconds)': '0',
    }];
    const [day] = aggregateByDay(records);
    expect(day.bottle_oz).toBe(0);
  });

  it('accumulates pump oz', () => {
    const records = [{
      'Start Date/time': '2024-05-14 08:00',
      Type: 'Pump',
      '[Pump] Total Volume': '3.5',
      '[Pump] Total Volume Unit': 'oz',
    }];
    const [day] = aggregateByDay(records);
    expect(day.pump_oz).toBe(3.5);
  });

  it('counts all diapers', () => {
    const records = [
      { 'Start Date/time': '2024-05-14 08:00', Type: 'Diaper', '[Diaper] Type': 'Wet' },
      { 'Start Date/time': '2024-05-14 09:00', Type: 'Diaper', '[Diaper] Type': 'Dirty' },
      { 'Start Date/time': '2024-05-14 10:00', Type: 'Diaper', '[Diaper] Type': 'Mixed' },
    ];
    const [day] = aggregateByDay(records);
    expect(day.diaper_count).toBe(3);
    expect(day.dirty_count).toBe(2); // Dirty + Mixed, not Wet
  });

  it('does not count Wet diapers as dirty', () => {
    const records = [{ 'Start Date/time': '2024-05-14 08:00', Type: 'Diaper', '[Diaper] Type': 'Wet' }];
    const [day] = aggregateByDay(records);
    expect(day.dirty_count).toBe(0);
  });

  it('sorts multiple days chronologically', () => {
    const records = [
      { 'Start Date/time': '2024-05-15 08:00', Type: 'Sleep', '[Sleep] Duration (Seconds)': '3600' },
      { 'Start Date/time': '2024-05-14 08:00', Type: 'Sleep', '[Sleep] Duration (Seconds)': '3600' },
    ];
    const days = aggregateByDay(records);
    expect(days[0].date).toBe('2024-05-14');
    expect(days[1].date).toBe('2024-05-15');
  });

  it('accumulates multiple records on the same day', () => {
    const records = [
      { 'Start Date/time': '2024-05-14 08:00', Type: 'Breastfeed', '[Breastfeed] Left Duration (Seconds)': '600', '[Breastfeed] Right Duration (Seconds)': '0' },
      { 'Start Date/time': '2024-05-14 12:00', Type: 'Breastfeed', '[Breastfeed] Left Duration (Seconds)': '600', '[Breastfeed] Right Duration (Seconds)': '0' },
    ];
    const [day] = aggregateByDay(records);
    expect(day.feed_count).toBe(2);
    expect(day.breastfeed_min).toBe(20);
  });

  it('formats lbl as MM/DD', () => {
    const records = [{ 'Start Date/time': '2024-01-07 08:00', Type: 'Diaper', '[Diaper] Type': 'Wet' }];
    const [day] = aggregateByDay(records);
    expect(day.lbl).toBe('01/07');
  });

  it('ignores unknown record types', () => {
    const records = [{ 'Start Date/time': '2024-05-14 08:00', Type: 'Unknown' }];
    const [day] = aggregateByDay(records);
    expect(day.feed_count).toBe(0);
    expect(day.sleep_hours).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatDay / formatWindow
// ---------------------------------------------------------------------------

describe('formatDay / formatWindow', () => {
  const epoch = new Date('2024-05-04T15:30:00').getTime();

  it('formats an epoch as mm/dd', () => {
    expect(formatDay(epoch)).toBe('05/04');
  });

  it('formats a window as mm/dd – mm/dd', () => {
    const end = new Date('2024-05-11T09:00:00').getTime();
    expect(formatWindow(epoch, end)).toBe('05/04 – 05/11');
  });
});

// ---------------------------------------------------------------------------
// avgByKey
// ---------------------------------------------------------------------------

describe('avgByKey', () => {
  const rows = [
    { sleep_hours: 8, feed_count: 0 },
    { sleep_hours: 6, feed_count: 0 },
    { sleep_hours: 0, feed_count: 0 },
  ];

  it('averages nonzero values only', () => {
    expect(avgByKey(rows, 'sleep_hours')).toBe(7);
  });

  it('returns null when the metric has no data', () => {
    expect(avgByKey(rows, 'feed_count')).toBeNull();
    expect(avgByKey([], 'sleep_hours')).toBeNull();
  });

  it('rounds to one decimal', () => {
    expect(avgByKey([{ x: 1 }, { x: 2 }, { x: 2 }], 'x')).toBe(1.7);
  });
});

// ---------------------------------------------------------------------------
// medicalStats
// ---------------------------------------------------------------------------

describe('medicalStats', () => {
  const NOW = new Date('2024-05-14T12:00:00').getTime();
  const HOUR = 3600000;
  const med = (hoursAgo, medStr) => ({
    Type: 'Medical',
    'Start Date/time (Epoch)': String(NOW - hoursAgo * HOUR),
    '[Medical] Medication': medStr,
  });
  const temp = (hoursAgo, f) => ({
    Type: 'Medical',
    'Start Date/time (Epoch)': String(NOW - hoursAgo * HOUR),
    '[Medical] Temperature': String(f),
    '[Medical] Temperature Unit': 'F',
  });

  it('sums doses over the trailing 24h; doseless meds count but add nothing', () => {
    const s = medicalStats(
      [med(2, 'Tylenol, 1.5 (ML)'), med(10, 'Motrin, 2.5 (ML)'), med(5, 'Vitamin D')],
      { now: NOW }
    );
    expect(s.doseTotal).toBe(4);
    expect(s.medCount).toBe(3);
  });

  it('computes temperature avg/min/max', () => {
    const s = medicalStats([temp(1, 99), temp(2, 101), temp(3, 103)], { now: NOW });
    expect(s.tempAvg).toBe(101);
    expect(s.tempMin).toBe(99);
    expect(s.tempMax).toBe(103);
    expect(s.tempCount).toBe(3);
  });

  it('ignores records outside the 24h window and non-Medical rows', () => {
    const s = medicalStats(
      [med(30, 'Tylenol, 5 (ML)'), temp(25, 104), { Type: 'Sleep', 'Start Date/time (Epoch)': String(NOW - HOUR) }],
      { now: NOW }
    );
    expect(s.medCount).toBe(0);
    expect(s.doseTotal).toBe(0);
    expect(s.tempCount).toBe(0);
    expect(s.tempAvg).toBeNull();
    expect(s.tempMin).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseMedication
// ---------------------------------------------------------------------------

describe('parseMedication', () => {
  it('parses the standard "name, dose (UNIT)" format', () => {
    expect(parseMedication("Children's Tylenol, 1.5 (ML)"))
      .toEqual({ name: "Children's Tylenol", dose: 1.5, unit: 'ML' });
  });

  it('keeps commas inside the name; only the trailing dose is split off', () => {
    expect(parseMedication('Tylenol, Extra Strength, 2.5 (ML)'))
      .toEqual({ name: 'Tylenol, Extra Strength', dose: 2.5, unit: 'ML' });
  });

  it('parses integer doses', () => {
    expect(parseMedication('Motrin, 5 (ML)'))
      .toEqual({ name: 'Motrin', dose: 5, unit: 'ML' });
  });

  it('falls back to name-only for strings without a dose', () => {
    expect(parseMedication('Tylenol')).toEqual({ name: 'Tylenol', dose: null, unit: null });
  });

  it('handles empty and missing input', () => {
    expect(parseMedication('')).toEqual({ name: '', dose: null, unit: null });
    expect(parseMedication(undefined)).toEqual({ name: '', dose: null, unit: null });
  });
});

// ---------------------------------------------------------------------------
// earliestEpoch
// ---------------------------------------------------------------------------

describe('earliestEpoch', () => {
  const rec = (epoch) => ({ 'Start Date/time (Epoch)': epoch });

  it('returns the smallest valid epoch', () => {
    expect(earliestEpoch([rec('3000'), rec('1000'), rec('2000')])).toBe(1000);
  });

  it('ignores missing and unparseable epochs', () => {
    expect(earliestEpoch([rec(undefined), rec('nope'), rec('500')])).toBe(500);
  });

  it('ignores epochs after now when a cap is given', () => {
    expect(earliestEpoch([rec('100'), rec('900')], 500)).toBe(100);
    expect(earliestEpoch([rec('900')], 500)).toBeNull();
  });

  it('returns null when nothing is valid', () => {
    expect(earliestEpoch([])).toBeNull();
    expect(earliestEpoch([rec(undefined)])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timeWindow
// ---------------------------------------------------------------------------

describe('timeWindow', () => {
  const NOW = new Date('2024-05-14T12:00:00').getTime();
  const DAY = 86400000;

  it('offset 0 spans from midnight N days ago to now', () => {
    const { start, end } = timeWindow([], { days: 7, now: NOW });
    expect(end).toBe(NOW);
    expect(new Date(start).getHours()).toBe(0);
    const span = (end - start) / DAY;
    expect(span).toBeGreaterThanOrEqual(7);
    expect(span).toBeLessThanOrEqual(8);
  });

  it('pages tile back to back: offset 1 ends where offset 0 starts', () => {
    const w0 = timeWindow([], { days: 7, now: NOW });
    const w1 = timeWindow([], { days: 7, offset: 1, now: NOW });
    expect(w1.end).toBe(w0.start);
    expect(new Date(w1.start).getHours()).toBe(0);
    expect((w1.end - w1.start) / DAY).toBe(7);
  });

  it('deeper offsets keep tiling without gaps', () => {
    const w1 = timeWindow([], { days: 14, offset: 1, now: NOW });
    const w2 = timeWindow([], { days: 14, offset: 2, now: NOW });
    expect(w2.end).toBe(w1.start);
  });

  it('"all" anchors at the earliest record and ignores offset', () => {
    const records = [{ 'Start Date/time (Epoch)': String(NOW - 10 * DAY) }];
    const w = timeWindow(records, { days: 'all', offset: 3, now: NOW });
    expect(w).toEqual(timeWindow(records, { days: 'all', now: NOW }));
    expect(w.end).toBe(NOW);
    expect(NOW - 10 * DAY - w.start).toBeLessThan(DAY);
  });

  it('"all" with no valid records falls back to a 7-day window', () => {
    expect(timeWindow([], { days: 'all', now: NOW }))
      .toEqual(timeWindow([], { days: 7, now: NOW }));
  });
});

// ---------------------------------------------------------------------------
// fillMissingDays
// ---------------------------------------------------------------------------

describe('fillMissingDays', () => {
  const DAY = 86400000;
  const may = (d) => new Date(`2024-05-${String(d).padStart(2, '0')}T00:00:00`).getTime();
  const row = (date) => ({
    date, lbl: date.slice(5).replace('-', '/'),
    sleep_hours: 8, feed_count: 5, breastfeed_min: 30,
    bottle_oz: 4, pump_oz: 0, diaper_count: 6, dirty_count: 2,
  });

  it('returns one row per calendar day across the window', () => {
    const filled = fillMissingDays([], may(1), may(7) + DAY / 2);
    expect(filled).toHaveLength(7);
    expect(filled[0].date).toBe('2024-05-01');
    expect(filled[6].date).toBe('2024-05-07');
  });

  it('preserves existing rows and fills gaps with nulls, not zeros', () => {
    const days = [row('2024-05-02'), row('2024-05-04')];
    const filled = fillMissingDays(days, may(1), may(5));
    expect(filled).toHaveLength(5);
    expect(filled[1]).toBe(days[0]);
    expect(filled[3]).toBe(days[1]);
    expect(filled[2].sleep_hours).toBeNull();
    expect(filled[2].feed_count).toBeNull();
    expect(filled[2].diaper_count).toBeNull();
  });

  it('gives filled days mm/dd labels matching aggregateByDay', () => {
    const filled = fillMissingDays([], may(9), may(9));
    expect(filled).toHaveLength(1);
    expect(filled[0].lbl).toBe('05/09');
  });
});

// ---------------------------------------------------------------------------
// windowTicks
// ---------------------------------------------------------------------------

describe('windowTicks', () => {
  const DAY = 86400000;
  const midnight = new Date('2024-05-07T00:00:00').getTime();

  it('emits daily ticks for a 7-day window', () => {
    const ticks = windowTicks(midnight, midnight + 7 * DAY + DAY / 2);
    expect(ticks).toHaveLength(8);
    expect(ticks[0]).toBe(midnight);
    expect(ticks[1] - ticks[0]).toBe(DAY);
  });

  it('steps wider for long windows, capping around 10 ticks', () => {
    const ticks = windowTicks(midnight - 30 * DAY, midnight);
    expect(ticks.length).toBeLessThanOrEqual(11);
    expect(ticks.length).toBeGreaterThanOrEqual(8);
    ticks.forEach((t) => expect(new Date(t).getHours()).toBe(0));
  });
});

// ---------------------------------------------------------------------------
// aggregateMedical
// ---------------------------------------------------------------------------

describe('aggregateMedical', () => {
  const NOW = new Date('2024-05-14T12:00:00').getTime();

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const withinWindow = NOW - 2 * 24 * 3600 * 1000; // 2 days ago
  const outsideWindow = NOW - 10 * 24 * 3600 * 1000; // 10 days ago

  it('ignores non-Medical records', () => {
    const records = [{ Type: 'Sleep', 'Start Date/time (Epoch)': String(withinWindow) }];
    const result = aggregateMedical(records);
    expect(result.temps).toHaveLength(0);
    expect(result.meds).toHaveLength(0);
  });

  it('ignores records outside the 7-day window', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(outsideWindow),
      '[Medical] Temperature': '37',
      '[Medical] Temperature Unit': 'C',
    }];
    expect(aggregateMedical(records).temps).toHaveLength(0);
  });

  it('converts °C temperature to °F', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Temperature': '39',
      '[Medical] Temperature Unit': 'C',
    }];
    const { temps } = aggregateMedical(records);
    expect(temps).toHaveLength(1);
    expect(temps[0].y).toBe(102.2);
    expect(temps[0].x).toBe(withinWindow);
  });

  it('skips temperature records where toF returns null', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Temperature': 'N/A',
      '[Medical] Temperature Unit': 'C',
    }];
    expect(aggregateMedical(records).temps).toHaveLength(0);
  });

  it('plots medication at its parsed dose on the y (dose) axis', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Medication': "Children's Tylenol, 1.5 (ML)",
    }];
    const { meds } = aggregateMedical(records);
    expect(meds).toHaveLength(1);
    expect(meds[0].y).toBe(1.5);
    expect(meds[0].dose).toBe(1.5);
    expect(meds[0].dose_unit).toBe('ML');
    expect(meds[0].med_name).toBe("Children's Tylenol");
  });

  it('puts doseless medications on the baseline (y=0)', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Medication': 'Tylenol',
    }];
    const { meds } = aggregateMedical(records);
    expect(meds).toHaveLength(1);
    expect(meds[0].y).toBe(0);
    expect(meds[0].dose).toBeNull();
    expect(meds[0].med_name).toBe('Tylenol');
  });

  it('computes doseDomain with headroom over the max dose, floor of 2', () => {
    const med = (dose) => ({
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Medication': `Motrin, ${dose} (ML)`,
    });
    expect(aggregateMedical([med(4)]).doseDomain).toEqual([0, 5]);
    expect(aggregateMedical([med(1)]).doseDomain).toEqual([0, 2]);
    expect(aggregateMedical([]).doseDomain).toEqual([0, 2]);
  });

  it('generates dayTicks at midnight boundaries', () => {
    const { dayTicks } = aggregateMedical([]);
    expect(dayTicks.length).toBeGreaterThanOrEqual(7);
    // Each tick should be at midnight (0 hours local time)
    dayTicks.forEach((t) => {
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });
  });

  it('returns domain as [start, now]', () => {
    const { domain } = aggregateMedical([]);
    expect(domain[1]).toBe(NOW);
    expect(domain[0]).toBeLessThan(NOW);
  });

  it('a record with neither temp nor med contributes nothing', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
    }];
    const { temps, meds } = aggregateMedical(records);
    expect(temps).toHaveLength(0);
    expect(meds).toHaveLength(0);
  });

  const tempRecord = (epoch) => ({
    Type: 'Medical',
    'Start Date/time (Epoch)': String(epoch),
    '[Medical] Temperature': '37',
    '[Medical] Temperature Unit': 'C',
  });

  it('a 14-day window includes records the 7-day window excludes', () => {
    const records = [tempRecord(outsideWindow)]; // 10 days ago
    expect(aggregateMedical(records).temps).toHaveLength(0);
    expect(aggregateMedical(records, { days: 14 }).temps).toHaveLength(1);
  });

  it('a 30-day domain spans about 30 days', () => {
    const { domain } = aggregateMedical([], { days: 30 });
    expect(domain[1]).toBe(NOW);
    const spanDays = (NOW - domain[0]) / 86400000;
    expect(spanDays).toBeGreaterThanOrEqual(30);
    expect(spanDays).toBeLessThanOrEqual(31);
  });

  it('"all" anchors the domain at the earliest medical record\'s midnight', () => {
    const records = [tempRecord(outsideWindow), tempRecord(withinWindow)];
    const { domain, temps } = aggregateMedical(records, { days: 'all' });
    const start = new Date(domain[0]);
    expect(start.getHours()).toBe(0);
    // outsideWindow is NOW - 10d at 12:00, so its midnight is the anchor
    expect(domain[0]).toBeLessThanOrEqual(outsideWindow);
    expect(outsideWindow - domain[0]).toBeLessThan(86400000);
    expect(temps).toHaveLength(2);
  });

  it('"all" ignores records with missing or future epochs when anchoring', () => {
    const records = [
      { Type: 'Medical', '[Medical] Temperature': '37', '[Medical] Temperature Unit': 'C' }, // no epoch → 0
      tempRecord(NOW + 5 * 86400000), // future
      tempRecord(withinWindow),
    ];
    const { domain } = aggregateMedical(records, { days: 'all' });
    expect(withinWindow - domain[0]).toBeLessThan(86400000);
  });

  it('"all" with no medical records falls back to a 7-day window', () => {
    const all = aggregateMedical([], { days: 'all' });
    const week = aggregateMedical([], { days: 7 });
    expect(all.domain).toEqual(week.domain);
  });

  it('steps dayTicks so a 30-day window has at most 11 ticks, still at midnight', () => {
    const { dayTicks } = aggregateMedical([], { days: 30 });
    expect(dayTicks.length).toBeLessThanOrEqual(11);
    expect(dayTicks.length).toBeGreaterThanOrEqual(8);
    dayTicks.forEach((t) => {
      expect(new Date(t).getHours()).toBe(0);
    });
  });

  it('respects an explicit now instead of Date.now()', () => {
    const later = NOW + 86400000;
    const { domain } = aggregateMedical([], { now: later });
    expect(domain[1]).toBe(later);
  });

  it('offset 1 pages the 7-day window back', () => {
    const records = [tempRecord(withinWindow), tempRecord(outsideWindow)]; // 2d and 10d ago
    const page1 = aggregateMedical(records, { offset: 1 });
    // previous window: only the 10-days-ago reading
    expect(page1.temps).toHaveLength(1);
    expect(page1.temps[0].x).toBe(outsideWindow);
    // domain sits entirely in the past and ticks stay inside it
    expect(page1.domain[1]).toBeLessThan(NOW);
    page1.dayTicks.forEach((t) => {
      expect(t).toBeGreaterThanOrEqual(page1.domain[0]);
      expect(t).toBeLessThanOrEqual(page1.domain[1]);
    });
  });
});

// ---------------------------------------------------------------------------
// loadFromStorage / saveToStorage
// ---------------------------------------------------------------------------

describe('loadFromStorage', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty when nothing stored', () => {
    expect(loadFromStorage()).toEqual({ records: [], meta: null });
  });

  it('returns parsed data when stored', () => {
    const data = { records: [{ id: 1 }], meta: { count: 1 } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    expect(loadFromStorage()).toEqual(data);
  });

  it('returns empty on corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(loadFromStorage()).toEqual({ records: [], meta: null });
  });
});

describe('saveToStorage', () => {
  beforeEach(() => localStorage.clear());

  it('writes records and meta to localStorage', () => {
    const records = [{ id: 1 }];
    const meta = { count: 1, lastImport: '5/14/2024' };
    saveToStorage(records, meta);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored).toEqual({ records, meta });
  });

  it('logs error when localStorage.setItem throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    saveToStorage([], null);
    expect(spy).toHaveBeenCalledWith('localStorage save failed:', expect.any(Error));
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});
