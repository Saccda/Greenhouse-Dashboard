export interface Stats {
  mean:  number;
  min:   number;
  max:   number;
  std:   number;
  count: number;
}

export function calcStats(values: number[]): Stats | null {
  if (!values.length) return null;
  const n    = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min  = Math.min(...values);
  const max  = Math.max(...values);
  const std  = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, min, max, std, count: n };
}

export function fmt(n: number | undefined | null, decimals = 1): string {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(decimals);
}
