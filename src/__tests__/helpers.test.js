import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toOz, toF, formatEpoch,
  aggregateByDay, aggregateMedical,
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

  it('adds medication records at y=96.5', () => {
    const records = [{
      Type: 'Medical',
      'Start Date/time (Epoch)': String(withinWindow),
      '[Medical] Medication': 'Tylenol',
    }];
    const { meds } = aggregateMedical(records);
    expect(meds).toHaveLength(1);
    expect(meds[0].y).toBe(96.5);
    expect(meds[0].med_name).toBe('Tylenol');
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
