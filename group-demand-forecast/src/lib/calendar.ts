import { START } from "../config";

/** Calendar month (0 = January) and year of month index t (t = 0 is the first history month). */
export function ym(t: number): { year: number; month: number } {
  const k = START.month + t;
  return { year: START.year + Math.floor(k / 12), month: ((k % 12) + 12) % 12 };
}
export const calOf = (t: number) => ym(t).month;

/** Days in month index t. */
export function daysIn(t: number): number {
  const { year, month } = ym(t);
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** ISO date of the first day of month index t. */
export function isoOf(t: number): string {
  const { year, month } = ym(t);
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
