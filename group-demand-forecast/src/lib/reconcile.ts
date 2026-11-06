/**
 * Hierarchy and OLS structural reconciliation.
 * Levels: group, brand, model, dealership x brand, dealership x model (bottom).
 * Reconciled bottom = (S'S)^-1 S' yhat. Every level is then the sum of reconciled bottoms, so it adds up exactly.
 */
import type { Level, World } from "./types";
import { cholesky, cholSolve, type Mat } from "./linalg";

export interface HNode {
  id: string;
  level: Level;
  brand?: string;
  model?: string;
  store?: string;
  /** Indices of bottom series (dealership x model) in this node. */
  bottoms: number[];
  /** True if the node is part of the reconciliation structure S. Dealership totals are extra views. */
  inS: boolean;
}

export interface SeriesKey {
  store: string;
  model: string;
}

export const nodeId = {
  group: () => "G",
  brand: (b: string) => `B:${b}`,
  model: (m: string) => `M:${m}`,
  storeBrand: (s: string, b: string) => `SB:${s}:${b}`,
  storeModel: (s: string, m: string) => `SM:${s}:${m}`,
  store: (s: string) => `S:${s}`,
};

export function buildNodes(world: Pick<World, "models" | "brands" | "stores">, keys: SeriesKey[]): HNode[] {
  const brandOf = Object.fromEntries(world.models.map((m) => [m.id, m.brand]));
  const nodes: HNode[] = [];
  const all = keys.map((_, i) => i);
  nodes.push({ id: nodeId.group(), level: "group", bottoms: all, inS: true });
  for (const b of world.brands) {
    const bot = all.filter((i) => brandOf[keys[i].model] === b.id);
    if (bot.length) nodes.push({ id: nodeId.brand(b.id), level: "brand", brand: b.id, bottoms: bot, inS: true });
  }
  for (const m of world.models) {
    const bot = all.filter((i) => keys[i].model === m.id);
    if (bot.length) nodes.push({ id: nodeId.model(m.id), level: "model", brand: m.brand, model: m.id, bottoms: bot, inS: true });
  }
  for (const s of world.stores) {
    for (const b of s.brands) {
      const bot = all.filter((i) => keys[i].store === s.id && brandOf[keys[i].model] === b);
      if (bot.length) nodes.push({ id: nodeId.storeBrand(s.id, b), level: "storeBrand", store: s.id, brand: b, bottoms: bot, inS: true });
    }
  }
  keys.forEach((k, i) =>
    nodes.push({ id: nodeId.storeModel(k.store, k.model), level: "storeModel", store: k.store, brand: brandOf[k.model], model: k.model, bottoms: [i], inS: true }),
  );
  for (const s of world.stores) {
    const bot = all.filter((i) => keys[i].store === s.id);
    if (bot.length) nodes.push({ id: nodeId.store(s.id), level: "store", store: s.id, bottoms: bot, inS: false });
  }
  return nodes;
}

/** Factor of S'S, computed once per hierarchy. (S'S)_ij = number of nodes in S that contain both i and j. */
export function structureFactor(nodes: HNode[], nBottom: number): Mat {
  const StS: Mat = Array.from({ length: nBottom }, () => new Array(nBottom).fill(0));
  for (const n of nodes) {
    if (!n.inS) continue;
    for (const i of n.bottoms) for (const j of n.bottoms) StS[i][j] += 1;
  }
  return cholesky(StS);
}

/**
 * OLS reconciliation of one month. yhat maps node id to its base forecast (all nodes in S).
 * Returns reconciled bottom values.
 */
export function olsReconcile(nodes: HNode[], L: Mat, yhat: Record<string, number>, nBottom: number): number[] {
  const Sty = new Array(nBottom).fill(0);
  for (const n of nodes) {
    if (!n.inS) continue;
    const v = yhat[n.id];
    if (v === undefined) throw new Error(`olsReconcile: missing base forecast for ${n.id}`);
    for (const i of n.bottoms) Sty[i] += v;
  }
  return cholSolve(L, Sty);
}

/** Parent and child pairs used to check coherence (children sum to parent). */
export function coherencePairs(nodes: HNode[]): { parent: string; children: string[] }[] {
  const byLevel = (lv: string) => nodes.filter((n) => n.level === lv);
  const out: { parent: string; children: string[] }[] = [];
  out.push({ parent: "G", children: byLevel("brand").map((n) => n.id) });
  for (const b of byLevel("brand")) {
    out.push({ parent: b.id, children: byLevel("model").filter((m) => m.brand === b.brand).map((m) => m.id) });
    out.push({ parent: b.id, children: byLevel("storeBrand").filter((m) => m.brand === b.brand).map((m) => m.id) });
  }
  for (const m of byLevel("model")) out.push({ parent: m.id, children: byLevel("storeModel").filter((x) => x.model === m.model).map((x) => x.id) });
  for (const sb of byLevel("storeBrand"))
    out.push({ parent: sb.id, children: byLevel("storeModel").filter((x) => x.store === sb.store && x.brand === sb.brand).map((x) => x.id) });
  for (const s of byLevel("store")) out.push({ parent: s.id, children: byLevel("storeBrand").filter((x) => x.store === s.store).map((x) => x.id) });
  return out;
}
