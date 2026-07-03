import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScatterChart, Scatter, XAxis, YAxis } from 'recharts';
import { ChartTip, MedBar, MedicalChartTip } from '../NaraAnalytics.jsx';

// ---------------------------------------------------------------------------
// ChartTip
// ---------------------------------------------------------------------------

describe('ChartTip', () => {
  it('renders nothing when inactive', () => {
    const { container } = render(<ChartTip active={false} payload={[]} label="05/14" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when payload is empty', () => {
    const { container } = render(<ChartTip active={true} payload={[]} label="05/14" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the label', () => {
    const payload = [{ dataKey: 'sleep_hours', value: 8, color: '#4f88c8' }];
    render(<ChartTip active={true} payload={payload} label="05/14" />);
    expect(screen.getByText('05/14')).toBeInTheDocument();
  });

  it('renders series label and value for a known series key', () => {
    const payload = [{ dataKey: 'sleep_hours', value: 7.5, color: '#4f88c8' }];
    render(<ChartTip active={true} payload={payload} label="05/14" />);
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText(/7\.5/)).toBeInTheDocument();
  });

  it('renders multiple payload rows', () => {
    const payload = [
      { dataKey: 'sleep_hours', value: 7.5, color: '#4f88c8' },
      { dataKey: 'feed_count', value: 8, color: '#3aad7e' },
    ];
    render(<ChartTip active={true} payload={payload} label="05/14" />);
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText('Feeds')).toBeInTheDocument();
  });

  it('skips null-valued entries (filled empty days)', () => {
    const payload = [
      { dataKey: 'sleep_hours', value: null, color: '#4f88c8' },
      { dataKey: 'feed_count', value: 8, color: '#3aad7e' },
    ];
    render(<ChartTip active={true} payload={payload} label="05/14" />);
    expect(screen.queryByText('Sleep')).not.toBeInTheDocument();
    expect(screen.getByText('Feeds')).toBeInTheDocument();
  });

  it('renders nothing when every value is null', () => {
    const payload = [{ dataKey: 'sleep_hours', value: null, color: '#4f88c8' }];
    const { container } = render(<ChartTip active={true} payload={payload} label="05/14" />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MedBar
// ---------------------------------------------------------------------------

// MedBar reads the dose axis scale via a recharts hook, so it needs a real
// chart around it
const renderMedBars = (data) => render(
  <ScatterChart width={400} height={200}>
    <XAxis dataKey="x" type="number" domain={[0, 10]} ticks={[0, 5, 10]} />
    <YAxis yAxisId="dose" dataKey="y" type="number" orientation="right" domain={[0, 4]} ticks={[1, 2, 3, 4]} />
    <Scatter yAxisId="dose" data={data} shape={<MedBar />} isAnimationActive={false} />
  </ScatterChart>
);

describe('MedBar', () => {
  const bars = (container) => [...container.querySelectorAll('rect[fill="#8b5cf6"]')];
  const hits = (container) => [...container.querySelectorAll('rect[fill="transparent"]')];

  it('draws a bar from the baseline up to the dose value', () => {
    const { container } = renderMedBars([{ x: 5, y: 2 }, { x: 8, y: 4 }]);
    const [half, full] = bars(container);
    expect(half).toBeDefined();
    expect(full).toBeDefined();
    const bottom = (r) => parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height'));
    // both bars share the baseline; the y=4 bar is twice as tall as the y=2 bar
    expect(bottom(half)).toBeCloseTo(bottom(full), 1);
    expect(parseFloat(full.getAttribute('height')))
      .toBeCloseTo(2 * parseFloat(half.getAttribute('height')), 0);
  });

  it('renders a 3px stub for zero/doseless entries', () => {
    const { container } = renderMedBars([{ x: 5, y: 0 }]);
    const [stub] = bars(container);
    expect(parseFloat(stub.getAttribute('height'))).toBe(3);
  });

  it('renders a transparent hit rect covering the bar', () => {
    const { container } = renderMedBars([{ x: 5, y: 2 }]);
    const [hit] = hits(container);
    const [bar] = bars(container);
    expect(hit).toBeDefined();
    expect(parseFloat(hit.getAttribute('height'))).toBeGreaterThan(parseFloat(bar.getAttribute('height')));
  });

  it('hit rect catches pointer events, visible bar does not', () => {
    const { container } = renderMedBars([{ x: 5, y: 2 }]);
    expect(hits(container)[0]).toHaveAttribute('pointer-events', 'all');
    expect(bars(container)[0]).toHaveAttribute('pointer-events', 'none');
  });
});

// ---------------------------------------------------------------------------
// MedicalChartTip
// ---------------------------------------------------------------------------

describe('MedicalChartTip', () => {
  it('renders nothing when inactive', () => {
    const { container } = render(<MedicalChartTip active={false} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when payload is empty', () => {
    const { container } = render(<MedicalChartTip active={true} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a temperature row with time and °F', () => {
    const payload = [{ payload: { lbl: '05/14 08:30', y: 102.2 } }];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getByText('05/14 08:30')).toBeInTheDocument();
    expect(screen.getByText('102.2°F')).toBeInTheDocument();
  });

  it('renders a medication row with time and name', () => {
    const payload = [{ payload: { lbl: '05/14 10:00', y: 0, med_name: 'Tylenol' } }];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getByText('05/14 10:00')).toBeInTheDocument();
    expect(screen.getByText('Tylenol')).toBeInTheDocument();
  });

  it('appends the dose when present, normalizing ML to mL', () => {
    const payload = [{ payload: { lbl: '05/14 10:00', y: 1.5, med_name: "Children's Tylenol", dose: 1.5, dose_unit: 'ML' } }];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getByText("Children's Tylenol · 1.5 mL")).toBeInTheDocument();
  });

  it('deduplicates identical payload entries', () => {
    const entry = { payload: { lbl: '05/14 08:30', y: 102.2 } };
    const payload = [entry, entry];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getAllByText('05/14 08:30')).toHaveLength(1);
  });

  it('renders both temp and med rows from mixed payload', () => {
    const payload = [
      { payload: { lbl: '05/14 08:30', y: 102.2 } },
      { payload: { lbl: '05/14 08:30', y: 96.5, med_name: 'Tylenol' } },
    ];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getByText('102.2°F')).toBeInTheDocument();
    expect(screen.getByText('Tylenol')).toBeInTheDocument();
  });
});
