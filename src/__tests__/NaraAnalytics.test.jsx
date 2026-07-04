import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NaraAnalytics from '../NaraAnalytics.jsx';
import { STORAGE_KEY } from '../helpers.js';

// Mock recharts so ResponsiveContainer doesn't choke without real layout.
// Cloning the chart with fixed dimensions makes charts actually render in
// jsdom, so tests can assert on axes/ticks.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  const React = await vi.importActual('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: 500, height: 220 }),
  };
});

// Mock PapaParse to control what comes back from CSV parsing
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn(),
  },
}));

import Papa from 'papaparse';

const sampleRecord = (overrides = {}) => ({
  '_activityKey': 'key-001',
  'Start Date/time': '2024-05-14 08:00',
  'Start Date/time (Epoch)': String(Date.now() - 1000),
  'Type': 'Sleep',
  '[Sleep] Duration (Seconds)': '3600',
  'Profile Name': 'Baby',
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('NaraAnalytics empty state', () => {
  it('shows the import prompt when no data', () => {
    render(<NaraAnalytics />);
    expect(screen.getByText(/import a nara csv export/i)).toBeInTheDocument();
  });

  it('does not show the clear button when no records', () => {
    render(<NaraAnalytics />);
    expect(screen.queryByText('clear')).not.toBeInTheDocument();
  });

  it('shows the import csv button', () => {
    render(<NaraAnalytics />);
    expect(screen.getByText(/import csv/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LocalStorage persistence
// ---------------------------------------------------------------------------

describe('NaraAnalytics localStorage', () => {
  it('loads records and meta from localStorage on mount', () => {
    const records = [sampleRecord()];
    const meta = { count: 1, lastImport: '5/14/2024, 8:00:00 AM' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta }));

    render(<NaraAnalytics />);

    expect(screen.getByText(/1 records/i)).toBeInTheDocument();
    expect(screen.getByText(/last import/i)).toBeInTheDocument();
  });

  it('shows clear button when records are loaded from storage', () => {
    const records = [sampleRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));

    render(<NaraAnalytics />);

    expect(screen.getByText('clear')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Profile selector
// ---------------------------------------------------------------------------

describe('NaraAnalytics profile selector', () => {
  it('hides profile selector with only one profile', () => {
    const records = [sampleRecord({ 'Profile Name': 'Baby' })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));

    render(<NaraAnalytics />);

    expect(screen.queryByDisplayValue('all profiles')).not.toBeInTheDocument();
  });

  it('shows profile selector with multiple profiles', () => {
    const records = [
      sampleRecord({ '_activityKey': 'k1', 'Profile Name': 'Baby' }),
      sampleRecord({ '_activityKey': 'k2', 'Profile Name': 'Twin' }),
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 2, lastImport: 'now' } }));

    render(<NaraAnalytics />);

    expect(screen.getByDisplayValue('all profiles')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Toggle series pills
// ---------------------------------------------------------------------------

describe('NaraAnalytics series toggles', () => {
  it('toggling a series pill changes its active state', () => {
    const records = [sampleRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));

    render(<NaraAnalytics />);

    const diaperBtn = screen.getByText('Diapers');
    // Diapers is off by default — clicking it should activate it (no error thrown)
    fireEvent.click(diaperBtn);
    // Click again to deactivate
    fireEvent.click(diaperBtn);
  });
});

// ---------------------------------------------------------------------------
// Range buttons
// ---------------------------------------------------------------------------

describe('NaraAnalytics range buttons', () => {
  it('renders all four range buttons', () => {
    render(<NaraAnalytics />);
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('14d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('clicking a range button does not throw', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getByText('7d'));
    fireEvent.click(screen.getByText('All'));
  });
});

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

describe('NaraAnalytics stat cards', () => {
  beforeEach(() => {
    // sleep data only — no feeds, diapers, etc.
    const records = [sampleRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));
  });

  it('shows a card only for active series that have data', () => {
    render(<NaraAnalytics />);
    expect(screen.getByTestId('stat-card-sleep_hours')).toBeInTheDocument();
    // Feeds pill is on by default but there is no feed data
    expect(screen.queryByTestId('stat-card-feed_count')).not.toBeInTheDocument();
    // Diapers pill is off by default
    expect(screen.queryByTestId('stat-card-diaper_count')).not.toBeInTheDocument();
  });

  it('toggling a pill off hides its card, on brings it back', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getByText('Sleep'));
    expect(screen.queryByTestId('stat-card-sleep_hours')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Sleep'));
    expect(screen.getByTestId('stat-card-sleep_hours')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Medical pills and 24h stat cards
// ---------------------------------------------------------------------------

describe('NaraAnalytics medical pills and stats', () => {
  const hoursAgo = (n) => String(Date.now() - n * 3600000);

  beforeEach(() => {
    const records = [
      sampleRecord(),
      sampleRecord({ '_activityKey': 'mt1', 'Type': 'Medical', 'Start Date/time (Epoch)': hoursAgo(1), '[Medical] Temperature': '101', '[Medical] Temperature Unit': 'F' }),
      sampleRecord({ '_activityKey': 'mt2', 'Type': 'Medical', 'Start Date/time (Epoch)': hoursAgo(2), '[Medical] Temperature': '99', '[Medical] Temperature Unit': 'F' }),
      sampleRecord({ '_activityKey': 'mm1', 'Type': 'Medical', 'Start Date/time (Epoch)': hoursAgo(1), '[Medical] Medication': 'Tylenol, 1.5 (ML)' }),
      sampleRecord({ '_activityKey': 'mm2', 'Type': 'Medical', 'Start Date/time (Epoch)': hoursAgo(2), '[Medical] Medication': 'Motrin, 2.5 (ML)' }),
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 5, lastImport: 'now' } }));
  });

  it('renders 24h medical stat cards with totals and avg/min/max', () => {
    render(<NaraAnalytics />);
    const tempCard = screen.getByTestId('stat-card-temp-24h');
    expect(tempCard).toHaveTextContent('100°'); // avg of 101 and 99
    expect(tempCard).toHaveTextContent('min 99° · max 101°');
    const medsCard = screen.getByTestId('stat-card-meds-24h');
    expect(medsCard).toHaveTextContent('4'); // 1.5 + 2.5
    expect(medsCard).toHaveTextContent('2 doses');
  });

  it('Meds pill hides the bars, the mL axis, and the meds card', () => {
    render(<NaraAnalytics />);
    const medChart = () => document.querySelectorAll('.recharts-wrapper')[1];
    expect(document.querySelectorAll('rect[fill="#8b5cf6"]')).toHaveLength(2);
    expect(medChart().querySelectorAll('.recharts-yAxis')).toHaveLength(2);

    fireEvent.click(screen.getByText('Meds'));

    expect(document.querySelectorAll('rect[fill="#8b5cf6"]')).toHaveLength(0);
    expect(medChart().querySelectorAll('.recharts-yAxis')).toHaveLength(1);
    expect(screen.queryByTestId('stat-card-meds-24h')).not.toBeInTheDocument();
    expect(screen.getByTestId('stat-card-temp-24h')).toBeInTheDocument();
  });

  it('Temp pill hides the dots and the temp card', () => {
    render(<NaraAnalytics />);
    expect(document.querySelectorAll('circle[fill="#ef4444"]')).toHaveLength(2);

    fireEvent.click(screen.getByText('Temp'));

    expect(document.querySelectorAll('circle[fill="#ef4444"]')).toHaveLength(0);
    expect(screen.queryByTestId('stat-card-temp-24h')).not.toBeInTheDocument();
    expect(screen.getByTestId('stat-card-meds-24h')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Medical range buttons
// ---------------------------------------------------------------------------

describe('NaraAnalytics medical range buttons', () => {
  const medicalRecord = () => sampleRecord({
    '_activityKey': 'key-med-001',
    'Type': 'Medical',
    '[Medical] Temperature': '99.1',
    '[Medical] Temperature Unit': 'F',
  });

  beforeEach(() => {
    const records = [sampleRecord(), medicalRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 2, lastImport: 'now' } }));
  });

  it('renders a second set of range buttons for the medical chart', () => {
    render(<NaraAnalytics />);
    expect(screen.getByText(/medical · last 7 days/i)).toBeInTheDocument();
    // one per chart: main controls + medical controls
    expect(screen.getAllByText('7d')).toHaveLength(2);
    expect(screen.getAllByText('All')).toHaveLength(2);
  });

  it('clicking a medical range updates the section label', () => {
    render(<NaraAnalytics />);
    // medical buttons render after the main chart's in the DOM
    fireEvent.click(screen.getAllByText('14d')[1]);
    expect(screen.getByText(/medical · last 14 days/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('All')[1]);
    expect(screen.getByText(/medical · all time/i)).toBeInTheDocument();
  });

  it('medical range does not affect the main chart range', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getAllByText('7d')[1]);
    // main chart still renders (default 30d) — no crash, label reflects medical only
    expect(screen.getByText(/medical · last 7 days/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Root container sizing
// ---------------------------------------------------------------------------

describe('NaraAnalytics root container', () => {
  it('has an explicit width so a flex parent cannot shrink-wrap it', () => {
    // #root is a column flexbox; with margin:auto and no width, the app would
    // size to its widest row and re-width on every paging label change.
    const { container } = render(<NaraAnalytics />);
    const root = container.firstChild;
    expect(root.style.width).toBe('100%');
    expect(root.style.boxSizing).toBe('border-box');
    expect(root.style.maxWidth).toBe('900px');
  });
});

// ---------------------------------------------------------------------------
// Window paging
// ---------------------------------------------------------------------------

describe('NaraAnalytics window paging', () => {
  const daysAgo = (n) => String(Date.now() - n * 86400000);
  const medicalAt = (key, epoch) => sampleRecord({
    '_activityKey': key,
    'Type': 'Medical',
    'Start Date/time (Epoch)': epoch,
    '[Medical] Temperature': '99.1',
    '[Medical] Temperature Unit': 'F',
  });

  beforeEach(() => {
    const records = [
      sampleRecord(),                          // Sleep, ~now
      medicalAt('key-med-1', daysAgo(1)),      // inside the current 7d window
      medicalAt('key-med-2', daysAgo(10)),     // one page back
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 3, lastImport: 'now' } }));
  });

  // Arrow order in the DOM: [0] = main chart, [1] = medical chart

  it('forward arrows are disabled at the current window', () => {
    render(<NaraAnalytics />);
    screen.getAllByLabelText('later').forEach((b) => expect(b).toBeDisabled());
  });

  it('main back arrow is disabled when the window already covers all data', () => {
    render(<NaraAnalytics />);
    // default 30d window reaches past the oldest record (10 days ago)
    expect(screen.getAllByLabelText('earlier')[0]).toBeDisabled();
  });

  it('paging the medical chart back shows the window dates, forward returns', () => {
    render(<NaraAnalytics />);
    const medBack = screen.getAllByLabelText('earlier')[1];
    expect(medBack).toBeEnabled(); // data exists 10 days ago
    fireEvent.click(medBack);

    expect(screen.getByText(/medical · \d{2}\/\d{2} – \d{2}\/\d{2}/)).toBeInTheDocument();

    const medFwd = screen.getAllByLabelText('later')[1];
    expect(medFwd).toBeEnabled();
    fireEvent.click(medFwd);
    expect(screen.getByText(/medical · last 7 days/i)).toBeInTheDocument();
  });

  it('selecting a range resets the offset to the current window', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getAllByLabelText('earlier')[1]);
    fireEvent.click(screen.getAllByText('14d')[1]);
    expect(screen.getByText(/medical · last 14 days/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText('later')[1]).toBeDisabled();
  });

  it('"All" disables both arrows', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getAllByText('All')[1]);
    expect(screen.getAllByLabelText('earlier')[1]).toBeDisabled();
    expect(screen.getAllByLabelText('later')[1]).toBeDisabled();
  });

  it('paging the medical chart does not affect the main chart', () => {
    render(<NaraAnalytics />);
    fireEvent.click(screen.getAllByLabelText('earlier')[1]);
    // main chart still at offset 0: its forward arrow stays disabled
    expect(screen.getAllByLabelText('later')[0]).toBeDisabled();
  });

  it('renders the right-side dosage axis in mL and the triangle at its dose', () => {
    const records = [sampleRecord(), sampleRecord({
      '_activityKey': 'key-med-dose',
      'Type': 'Medical',
      'Start Date/time (Epoch)': daysAgo(1),
      '[Medical] Medication': "Children's Tylenol, 1.5 (ML)",
    })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 2, lastImport: 'now' } }));

    render(<NaraAnalytics />);
    // doseDomain floor is [0, 2] → integer ticks 1..2
    expect(screen.getAllByText('2 mL').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('rect[fill="#8b5cf6"]').length).toBe(1);
  });

  it('medical chart keeps its axes on a page with no data', () => {
    // 20-day-old record leaves the 7–14 day page empty but ◀ enabled
    const records = [sampleRecord(), medicalAt('key-med-old', daysAgo(20))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 2, lastImport: 'now' } }));

    render(<NaraAnalytics />);
    fireEvent.click(screen.getAllByLabelText('earlier')[1]);

    expect(screen.getByText(/medical · \d{2}\/\d{2} – \d{2}\/\d{2}/)).toBeInTheDocument();
    // y-axis temperature ticks still render despite zero data points
    expect(screen.getAllByText('97°').length).toBeGreaterThan(0);
    expect(screen.getAllByText('105°').length).toBeGreaterThan(0);
  });

  it('main chart keeps its axes on a page with no data', () => {
    const records = [
      sampleRecord(),
      sampleRecord({ '_activityKey': 'key-old', 'Start Date/time (Epoch)': daysAgo(20) }),
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 2, lastImport: 'now' } }));

    render(<NaraAnalytics />);
    fireEvent.click(screen.getByText('7d')); // no medical section: single button set
    fireEvent.click(screen.getByLabelText('earlier')); // 7–14d page: empty

    expect(screen.queryByText(/no data in this window/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import a nara csv export/i)).not.toBeInTheDocument();
    // the filled window still produces x-axis day ticks
    const ticks = document.querySelectorAll('.recharts-cartesian-axis-tick');
    expect(ticks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Clear data
// ---------------------------------------------------------------------------

describe('NaraAnalytics clearData', () => {
  it('clears records and removes localStorage after confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const records = [sampleRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));

    render(<NaraAnalytics />);
    fireEvent.click(screen.getByText('clear'));

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/import a nara csv export/i)).toBeInTheDocument();
  });

  it('does not clear if confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const records = [sampleRecord()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, meta: { count: 1, lastImport: 'now' } }));

    render(<NaraAnalytics />);
    fireEvent.click(screen.getByText('clear'));

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CSV import / merge
// ---------------------------------------------------------------------------

describe('NaraAnalytics CSV import', () => {
  it('shows toast after successful import', async () => {
    vi.useFakeTimers();
    Papa.parse.mockImplementation((file, { complete }) => {
      complete({ data: [sampleRecord()] });
    });

    render(<NaraAnalytics />);

    const input = document.querySelector('input[type="file"]');
    const file = new File([''], 'test.csv', { type: 'text/csv' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.getByText(/new records added/i)).toBeInTheDocument();

    act(() => { vi.runAllTimers(); });
    expect(screen.queryByText(/new records added/i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('merges new records with existing, deduplicating on _activityKey', async () => {
    const existing = [sampleRecord({ '_activityKey': 'key-001' })];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: existing, meta: { count: 1, lastImport: 'before' } }));

    Papa.parse.mockImplementation((file, { complete }) => {
      complete({ data: [
        sampleRecord({ '_activityKey': 'key-001' }), // duplicate
        sampleRecord({ '_activityKey': 'key-002' }), // new
      ]});
    });

    render(<NaraAnalytics />);

    const input = document.querySelector('input[type="file"]');
    const file = new File([''], 'test.csv', { type: 'text/csv' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // 1 new record added (key-002), key-001 was a dupe
    expect(screen.getByText(/1 new records added/i)).toBeInTheDocument();
  });

  it('refreshes the window reference time on import so newer-than-mount records appear', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-07-03T08:00:00').getTime();
    vi.setSystemTime(t0);

    Papa.parse.mockImplementation((file, { complete }) => {
      complete({ data: [sampleRecord({
        '_activityKey': 'key-future-med',
        'Type': 'Medical',
        'Start Date/time (Epoch)': String(t0 + 3600000), // an hour after mount
        '[Medical] Medication': 'Motrin, 2.5 (ML)',
      })] });
    });

    render(<NaraAnalytics />); // mounts with now = t0
    vi.setSystemTime(t0 + 7200000); // user imports two hours later

    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([''], 't.csv')] } });
    });

    // without setNow on import, the record sits beyond the frozen window end
    // and no bar renders
    expect(document.querySelectorAll('rect[fill="#8b5cf6"]')).toHaveLength(1);

    act(() => { vi.runAllTimers(); }); // flush the toast timeout
    vi.useRealTimers();
  });

  it('skips records missing _activityKey', async () => {
    Papa.parse.mockImplementation((file, { complete }) => {
      complete({ data: [{ Type: 'Sleep', 'Start Date/time': '2024-05-14 08:00' }] }); // no _activityKey
    });

    render(<NaraAnalytics />);

    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([''], 'test.csv')] } });
    });

    expect(screen.getByText(/0 new records added/i)).toBeInTheDocument();
  });
});
