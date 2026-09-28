/** Axis helpers for the SVG charts — "nice" tick values and linear mapping. Display only. */

export interface Domain {
  min: number;
  max: number;
}

export function extent(values: number[]): Domain | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  return step * mag;
}

/** Expands the domain to round tick boundaries and returns the ticks. */
export function niceTicks(domain: Domain, targetTicks = 4): { domain: Domain; ticks: number[] } {
  const step = niceStep(domain.max - domain.min, targetTicks);
  const min = Math.floor(domain.min / step) * step;
  const max = Math.ceil(domain.max / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { domain: { min, max }, ticks };
}

export function scaleLinear(domain: Domain, range: [number, number]) {
  const span = domain.max - domain.min || 1;
  return (v: number) => range[0] + ((v - domain.min) / span) * (range[1] - range[0]);
}

export function formatTick(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  if (abs >= 10 || abs === 0) return v.toFixed(0);
  return v.toFixed(1);
}
