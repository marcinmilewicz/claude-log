const nf = (max: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max });
const int = nf(0);

export function usd(v: number): string {
  if (v >= 1000) return `$${nf(1).format(v / 1000)}K`;
  if (v >= 100) return `$${int.format(v)}`;
  if (v >= 1) return `$${nf(2).format(v)}`;
  if (v === 0) return '$0';
  return `$${nf(3).format(v)}`;
}

export function usdExact(v: number): string {
  return `$${nf(2).format(v)}`;
}

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf(2).format(v / 1e9)}B`;
  if (a >= 1e6) return `${nf(1).format(v / 1e6)}M`;
  if (a >= 1e4) return `${nf(1).format(v / 1e3)}K`;
  return int.format(v);
}

export function num(v: number): string {
  return int.format(v);
}

export function pct(v: number, digits = 0): string {
  return `${nf(digits).format(v * 100)}%`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

const dtf = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const dshort = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

export function dateTime(ts: number): string {
  return ts ? dtf.format(ts) : '—';
}

export function date(ts: number): string {
  return ts ? df.format(ts) : '—';
}

export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dshort.format(new Date(y, m - 1, d));
}

export function bytes(v: number): string {
  if (v >= 1e9) return `${nf(2).format(v / 1e9)} GB`;
  if (v >= 1e6) return `${nf(0).format(v / 1e6)} MB`;
  return `${nf(0).format(v / 1e3)} KB`;
}

// A Codex rate limit window: 300 → "5-hour", 10080 → "weekly".
export function windowLabel(minutes: number): string {
  if (minutes === 300) return '5-hour';
  if (minutes === 10080) return 'weekly';
  return minutes % 1440 === 0 ? `${minutes / 1440}-day` : minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
}
