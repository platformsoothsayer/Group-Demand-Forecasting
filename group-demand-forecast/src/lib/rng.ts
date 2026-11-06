/** Deterministic PRNG (mulberry32) with helpers. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  uniform(): number {
    return this.next();
  }
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  exponential(rate: number): number {
    let u = 0;
    while (u === 0) u = this.next();
    return -Math.log(u) / rate;
  }
  /** Gamma(shape, scale) by Marsaglia and Tsang. */
  gamma(shape: number, scale: number): number {
    if (shape < 1) return this.gamma(shape + 1, scale) * Math.pow(this.next() || 1e-12, 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x = 0;
      let v = 0;
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u || 1e-300) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }
  /** Negative binomial with mean mu and size k (Gamma-Poisson). */
  negbin(mu: number, k: number): number {
    if (mu <= 0) return 0;
    return this.poisson(this.gamma(k, mu / k));
  }
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 40) {
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    }
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
  categorical(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
  multinomial(n: number, probs: number[]): number[] {
    const out = probs.map(() => 0);
    for (let i = 0; i < n; i++) out[this.categorical(probs)]++;
    return out;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
