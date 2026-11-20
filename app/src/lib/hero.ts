import type { Theme } from './theme';

/** Part of the day, in Dhaka time, that the Today header is coloured for. */
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

/** Hour of the day in Dhaka (UTC+6), independent of the device's own zone. */
export const dhakaHour = (now: Date = new Date()) => (now.getUTCHours() + 6) % 24;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** Blends two #RRGGBB colours; `w` is how much of `b` to take. */
export function mix(a: string, b: string, w: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * w).toString(16).padStart(2, '0')).join('')}`;
}

// Each part of the day pulls the accent's own gradient towards a mood: a warm
// sunrise, the plain accent at midday, dusk, and a deep night sky. Every stop
// stays dark enough for white text (checked: at least 4.5:1 for every accent).
const MOOD: Record<DayPart, { to: [string, string, string]; weight: [number, number, number] }> = {
  morning: { to: ['#0F4C81', '#A3418C', '#B4530A'], weight: [0.3, 0.3, 0.72] },
  afternoon: { to: ['#000000', '#000000', '#0A0A2A'], weight: [0, 0.06, 0.28] },
  evening: { to: ['#3B1D6E', '#86246F', '#A8380B'], weight: [0.55, 0.6, 0.75] },
  night: { to: ['#060818', '#101538', '#231D5C'], weight: [0.7, 0.72, 0.7] },
};

/** The Today header's gradient for this accent at this time of day. */
export function heroColors(t: Pick<Theme, 'hero'>, part: DayPart): [string, string, string] {
  const m = MOOD[part];
  return [mix(t.hero[0], m.to[0], m.weight[0]), mix(t.hero[1], m.to[1], m.weight[1]), mix(t.hero[2], m.to[2], m.weight[2])];
}
