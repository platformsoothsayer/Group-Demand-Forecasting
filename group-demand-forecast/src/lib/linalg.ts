/** Small dense linear algebra for model fitting. Matrices are row-major number[][]. */
export type Mat = number[][];

export const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array(c).fill(0));

/** Cholesky factor L (lower) of a symmetric positive definite matrix. Adds jitter if needed. */
export function cholesky(A: Mat): Mat {
  const n = A.length;
  for (let attempt = 0; attempt < 6; attempt++) {
    const jitter = attempt === 0 ? 0 : 1e-10 * Math.pow(100, attempt);
    const L = zeros(n, n);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j] + (i === j ? jitter : 0);
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) {
            ok = false;
            break;
          }
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    if (ok) return L;
  }
  throw new Error("cholesky: matrix not positive definite");
}

/** Solve A x = b given the Cholesky factor of A. */
export function cholSolve(L: Mat, b: number[]): number[] {
  const n = L.length;
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

/** Inverse of a symmetric positive definite matrix. */
export function spdInverse(A: Mat): Mat {
  const L = cholesky(A);
  const n = A.length;
  const inv = zeros(n, n);
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const col = cholSolve(L, e);
    for (let i = 0; i < n; i++) inv[i][j] = col[i];
  }
  // symmetrize
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) inv[i][j] = inv[j][i] = 0.5 * (inv[i][j] + inv[j][i]);
  return inv;
}

export const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export const matVec = (A: Mat, x: number[]) => A.map((row) => dot(row, x));

/** L z for a lower triangular L. */
export function lowerMul(L: Mat, z: number[]): number[] {
  const n = L.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += L[i][k] * z[k];
    out[i] = s;
  }
  return out;
}
