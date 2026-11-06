/** Shared selectors. Panorama and Pedido sugerido read the same functions, so their totals always agree. */
import type { OrderLine, OrderResult } from "./ordering";

export interface OrderSum {
  units: number;
  value: number;
  floorplanMonthly: number;
  lines: number;
}

export function orderSummary(lines: OrderLine[]): OrderSum {
  let units = 0;
  let value = 0;
  let fp = 0;
  let n = 0;
  for (const l of lines) {
    units += l.suggested;
    value += l.value;
    fp += l.floorplanMonthly;
    if (l.suggested > 0) n++;
  }
  return { units, value, floorplanMonthly: fp, lines: n };
}

export function approvedSummary(order: OrderResult, approved: Set<string>): OrderSum {
  return orderSummary(order.lines.filter((l) => approved.has(l.id)));
}
