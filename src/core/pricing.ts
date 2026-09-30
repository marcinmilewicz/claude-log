// API pricing in USD per million tokens (as of September 2026).
// Cache write: 5 min = 1.25× input, 1 h = 2× input. Cache read has its
// own per-model rate (Fable 5.1 and Opus 5.5 have a reduced one).
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const FAST_MULTIPLIER = 2;

export function normalizeModel(model: string): string {
  return model.replace(/\[.*?\]$/, '').replace(/-\d{8}$/, '');
}

export function priceFor(model: string): Price | null {
  return PRICES[normalizeModel(model)] ?? null;
}

export interface UsageTokens {
  input: number;
  cw5: number;
  cw1h: number;
  cr: number;
  out: number;
}

export interface CostBreakdown {
  costIn: number;
  costCw: number;
  costCr: number;
  costOut: number;
  cost: number;
}

export function costOf(model: string, u: UsageTokens, fast: boolean): CostBreakdown | null {
  const p = priceFor(model);
  if (!p) return null;
  const m = (fast ? FAST_MULTIPLIER : 1) / 1e6;
  const costIn = u.input * p.input * m;
  const costCw = (u.cw5 * 1.25 + u.cw1h * 2) * p.input * m;
  const costCr = u.cr * p.cacheRead * m;
  const costOut = u.out * p.output * m;
  return { costIn, costCw, costCr, costOut, cost: costIn + costCw + costCr + costOut };
}

export function cacheReadPrice(model: string): number {
  return (priceFor(model)?.cacheRead ?? 0) / 1e6;
}
