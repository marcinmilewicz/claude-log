import { useState } from 'react';
import { dayLabel } from '../core/format';
import type { Series } from '../core/aggregate';
import { useTip, useWidth } from './ui';

const PLOT_H = 220;
const AXIS_H = 22;
const LEFT = 56;
const GAP = 2;

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 0.25 };
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return { max: Math.ceil(v / step) * step, step };
}

// Rectangle rounded only at the top (the data end), flat against the axis.
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function StackedColumns({ days, series, format }: { days: string[]; series: Series[]; format: (v: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const t = useTip();
  if (days.length === 0) return <div className="empty">No data in the selected range.</div>;

  const totals = days.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const { max, step } = niceMax(Math.max(...totals));
  const plotW = Math.max(0, width - LEFT);
  const band = plotW / days.length;
  const barW = Math.max(2, Math.min(24, band * 0.72));
  const y = (v: number) => PLOT_H - (v / max) * PLOT_H;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotW / 64))));

  const tipFor = (i: number) => [
    { name: 'total', value: format(totals[i]) },
    ...series
      .filter((s) => s.values[i] > 0)
      .sort((a, b) => b.values[i] - a.values[i])
      .map((s) => ({ name: s.label, value: format(s.values[i]), color: s.color })),
  ];

  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <span className="sw" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={ref}>
        {width > 0 && (
          <svg height={PLOT_H + AXIS_H} role="img" aria-label="Stacked bar chart by day">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={LEFT} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
                <text className="tick" x={LEFT - 8} y={y(v) + 4} textAnchor="end">
                  {format(v)}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const x0 = LEFT + i * band;
              const bx = x0 + (band - barW) / 2;
              let acc = 0;
              const visible = series.filter((s) => s.values[i] > 0);
              return (
                <g key={d}>
                  {hover === i && <rect x={x0} y={0} width={band} height={PLOT_H} fill="var(--surface-2)" />}
                  {visible.map((s, si) => {
                    const v = s.values[i];
                    const top = y(acc + v);
                    const bottom = y(acc);
                    acc += v;
                    const isTop = si === visible.length - 1;
                    const h = Math.max(0, bottom - top - (si > 0 ? GAP : 0));
                    if (h <= 0) return null;
                    return isTop ? (
                      <path key={s.key} d={topRounded(bx, top, barW, h, 4)} fill={s.color} />
                    ) : (
                      <rect key={s.key} x={bx} y={top} width={barW} height={h} fill={s.color} />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text className="tick" x={x0 + band / 2} y={PLOT_H + 16} textAnchor="middle">
                      {dayLabel(d)}
                    </text>
                  )}
                  <rect
                    x={x0}
                    y={0}
                    width={band}
                    height={PLOT_H}
                    fill="transparent"
                    tabIndex={0}
                    onPointerMove={(e) => {
                      setHover(i);
                      t.show(e, dayLabel(d), tipFor(i));
                    }}
                    onPointerLeave={() => {
                      setHover(null);
                      t.hide();
                    }}
                    onFocus={(e) => {
                      setHover(i);
                      t.showAt(e.currentTarget, dayLabel(d), tipFor(i));
                    }}
                    onBlur={() => {
                      setHover(null);
                      t.hide();
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STEPS = 7;

export function Heatmap({ grid, format, unit }: { grid: number[][]; format: (v: number) => string; unit: string }) {
  const t = useTip();
  const max = Math.max(...grid.flat(), 0);
  // Square-root scale so a few very active hours don't flatten the rest.
  const step = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(STEPS, Math.max(1, Math.ceil(Math.sqrt(v / max) * STEPS))));
  return (
    <div className="chart">
      <div className="heatmap" role="img" aria-label={`Activity map: weekday × hour, ${unit}`}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div className="hm-col" key={h}>
            {h % 3 === 0 ? h : ''}
          </div>
        ))}
        {grid.map((row, d) => (
          <div key={d} style={{ display: 'contents' }}>
            <div className="hm-row">{DAYS[d]}</div>
            {row.map((v, h) => {
              const s = step(v);
              const rows = [{ name: unit, value: format(v) }];
              const title = `${DAYS_FULL[d]}, ${h}:00–${h + 1}:00`;
              return (
                <div
                  key={h}
                  className="hm-cell"
                  tabIndex={0}
                  style={s ? { background: `var(--seq-${s})` } : undefined}
                  onPointerMove={(e) => t.show(e, title, rows)}
                  onPointerLeave={t.hide}
                  onFocus={(e) => t.showAt(e.currentTarget, title, rows)}
                  onBlur={t.hide}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="scale">
        <span>less</span>
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className="swatch" style={{ background: `var(--seq-${i + 1})` }} />
        ))}
        <span>more (max {format(max)})</span>
      </div>
    </div>
  );
}
