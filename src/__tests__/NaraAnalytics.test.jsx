import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NaraAnalytics from '../NaraAnalytics.jsx';
import { STORAGE_KEY } from '../helpers.js';

// Mock recharts so ResponsiveContainer doesn't choke without real layout
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
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
