/** FFT radix-2 en place, puis FFT 2D sur tuiles carrées (puissance de 2). Pas de dépendance. */

export function fft1d(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k] as number;
        const ui = im[i + k] as number;
        const vr = (re[i + k + len / 2] as number) * cr - (im[i + k + len / 2] as number) * ci;
        const vi = (re[i + k + len / 2] as number) * ci + (im[i + k + len / 2] as number) * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Spectre d'amplitude 2D d'une tuile n×n (n puissance de 2), fenêtre de Hann, moyenne retirée. */
export function magnitudeSpectrum(tile: ArrayLike<number>, n: number): Float64Array {
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  let mean = 0;
  for (let i = 0; i < n * n; i++) mean += tile[i] as number;
  mean /= n * n;
  for (let y = 0; y < n; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (n - 1));
    for (let x = 0; x < n; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (n - 1));
      re[y * n + x] = ((tile[y * n + x] as number) - mean) * wx * wy;
    }
  }
  const rowRe = new Float64Array(n);
  const rowIm = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    rowRe.set(re.subarray(y * n, y * n + n));
    rowIm.set(im.subarray(y * n, y * n + n));
    fft1d(rowRe, rowIm);
    re.set(rowRe, y * n);
    im.set(rowIm, y * n);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rowRe[y] = re[y * n + x] as number;
      rowIm[y] = im[y * n + x] as number;
    }
    fft1d(rowRe, rowIm);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rowRe[y] as number;
      im[y * n + x] = rowIm[y] as number;
    }
  }
  const mag = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) mag[i] = Math.hypot(re[i] as number, im[i] as number);
  return mag;
}
