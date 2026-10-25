// Contract numbers look like `CN-2026-001`: prefix, year, per-year sequence.

const NUM_RE = /^(.*)-(\d{4})-(\d+)$/;

export function formatNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

export function parseNumber(n: string): { prefix: string; year: number; seq: number } | null {
  const m = NUM_RE.exec(n);
  return m ? { prefix: m[1], year: Number(m[2]), seq: Number(m[3]) } : null;
}

/** Next free number for prefix+year given every number already in use (including deleted contracts). */
export function nextNumber(used: Iterable<string>, prefix: string, year: number): string {
  let max = 0;
  for (const n of used) {
    const p = parseNumber(n);
    if (p && p.prefix === prefix && p.year === year && p.seq > max) max = p.seq;
  }
  return formatNumber(prefix, year, max + 1);
}
