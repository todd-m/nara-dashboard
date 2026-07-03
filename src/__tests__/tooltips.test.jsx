import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartTip, MedDot, MedicalChartTip } from '../NaraAnalytics.jsx';

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
// MedDot
// ---------------------------------------------------------------------------

describe('MedDot', () => {
  it('renders a transparent hit-area circle', () => {
    const { container } = render(<svg><MedDot cx={50} cy={50} /></svg>);
    const circle = container.querySelector('circle');
    expect(circle).toBeInTheDocument();
    expect(circle).toHaveAttribute('fill', 'transparent');
  });

  it('renders a purple polygon triangle', () => {
    const { container } = render(<svg><MedDot cx={50} cy={50} /></svg>);
    const polygon = container.querySelector('polygon');
    expect(polygon).toBeInTheDocument();
    expect(polygon).toHaveAttribute('fill', '#8b5cf6');
  });

  it('circle has pointerEvents all, polygon has pointerEvents none', () => {
    const { container } = render(<svg><MedDot cx={50} cy={50} /></svg>);
    expect(container.querySelector('circle')).toHaveAttribute('pointer-events', 'all');
    expect(container.querySelector('polygon')).toHaveAttribute('pointer-events', 'none');
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
    const payload = [{ payload: { lbl: '05/14 10:00', y: 96.5, med_name: 'Tylenol' } }];
    render(<MedicalChartTip active={true} payload={payload} />);
    expect(screen.getByText('05/14 10:00')).toBeInTheDocument();
    expect(screen.getByText('Tylenol')).toBeInTheDocument();
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
