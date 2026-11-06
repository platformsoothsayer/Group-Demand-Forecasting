/**
 * Trim and color mix: smoothed multinomial logit with a trend term.
 * share_k(t) = softmax(alpha_k + gamma_k * x_t), x_t = (t - tEnd) / 12, first category is the reference.
 * Priors: alpha ~ N(store-level logit, 0.6^2), gamma ~ N(0, 0.35^2). Recent months weigh more (24 month half life).
 * Fitted by Newton's method on the penalized log likelihood.
 */
import { cholesky, cholSolve } from "./linalg";

export interface MixFit {
  alpha: number[];
  gamma: number[];
}

const softmax = (z: number[]) => {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

export function shareAt(fit: MixFit, x: number): number[] {
  return softmax([0, ...fit.alpha.map((a, k) => a + fit.gamma[k] * x)]);
}

export function fitMix(counts: number[][], ts: number[], tEnd: number, priorShares: number[]): MixFit {
  const K = priorShares.length;
  const J = K - 1;
  const a0 = priorShares.slice(1).map((p) => Math.log(p / priorShares[0]));
  const precA = 1 / 0.36;
  const precG = 1 / (0.35 * 0.35);
  let alpha = a0.slice();
  let gamma = new Array(J).fill(0);
  for (let it = 0; it < 40; it++) {
    const P = 2 * J;
    const g = new Array(P).fill(0);
    const H = Array.from({ length: P }, () => new Array(P).fill(0));
    for (let r = 0; r < counts.length; r++) {
      const c = counts[r];
      const n = c.reduce((a, b) => a + b, 0);
      if (n === 0) continue;
      const x = (ts[r] - tEnd) / 12;
      const w = Math.pow(0.5, (tEnd - ts[r]) / 24);
      const p = shareAt({ alpha, gamma }, x);
      for (let k = 0; k < J; k++) {
        const resid = c[k + 1] - n * p[k + 1];
        g[k] += w * resid;
        g[J + k] += w * resid * x;
        for (let l = 0; l < J; l++) {
          const cov = n * ((k === l ? p[k + 1] : 0) - p[k + 1] * p[l + 1]);
          H[k][l] += w * cov;
          H[k][J + l] += w * cov * x;
          H[J + k][l] += w * cov * x;
          H[J + k][J + l] += w * cov * x * x;
        }
      }
    }
    for (let k = 0; k < J; k++) {
      g[k] -= precA * (alpha[k] - a0[k]);
      g[J + k] -= precG * gamma[k];
      H[k][k] += precA;
      H[J + k][J + k] += precG;
    }
    const step = cholSolve(cholesky(H), g);
    let mx = 0;
    for (let k = 0; k < J; k++) {
      alpha[k] += step[k];
      gamma[k] += step[J + k];
      mx = Math.max(mx, Math.abs(step[k]), Math.abs(step[J + k]));
    }
    alpha = alpha.slice();
    gamma = gamma.slice();
    if (mx < 1e-8) break;
  }
  return { alpha, gamma };
}
