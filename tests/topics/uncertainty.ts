import { assert, close } from '../assert.ts';
import * as un from '../../src/topics/uncertainty/physics.ts';

type Suite = () => string | void;

const base: un.PacketParams = { kind: 'gauss', sigma: 1, k0: 1.5, chirp: 0, nWaves: 9, sep: 6 };

export const suites: Record<string, Suite> = {
  'uncertainty: FFT matches a direct DFT and the round trip returns the input': () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(0.37 * i * i) + 0.1 * i;
      im[i] = Math.cos(1.3 * i) - 0.05 * i;
    }
    const [dr, di] = un.dft(re, im);
    const fr = re.slice();
    const fi = im.slice();
    un.fft(fr, fi);
    let e1 = 0;
    for (let i = 0; i < n; i++) e1 = Math.max(e1, Math.abs(fr[i] - dr[i]), Math.abs(fi[i] - di[i]));
    assert(e1 < 1e-10, `FFT vs DFT error ${e1}`);
    // Round trip on the live grid size, through the unit-normalised position <-> momentum maps.
    const P = new un.Packet();
    P.build({ ...base, kind: 'square', chirp: 0.3 });
    const r0 = P.re.slice();
    const i0 = P.im.slice();
    P.evolve(0);
    let e2 = 0;
    for (let i = 0; i < P.n; i++) e2 = Math.max(e2, Math.abs(P.re[i] - r0[i]), Math.abs(P.im[i] - i0[i]));
    assert(e2 < 1e-12, `round trip error ${e2}`);
    close(P.mk.norm, 1, 1e-12, 'Parseval: momentum norm');
    return `DFT err ${e1.toExponential(1)}, round trip err ${e2.toExponential(1)}`;
  },
  'uncertainty: Gaussian gives dx = sigma, dp = 1/(2 sigma), product exactly hbar/2': () => {
    const P = new un.Packet();
    let worst = 0;
    for (const sigma of [0.4, 1, 3]) {
      P.build({ ...base, sigma });
      close(P.mx.sd, sigma, 1e-9, `dx at sigma ${sigma}`);
      close(P.mk.sd, 1 / (2 * sigma), 1e-9, `dp at sigma ${sigma}`);
      close(P.mk.mean, base.k0, 1e-9, 'mean momentum');
      worst = Math.max(worst, Math.abs(P.ratio() - 1));
    }
    assert(worst < 1e-9, `product off by ${worst}`);
    return `|dx dp / (hbar/2) - 1| < ${worst.toExponential(1)}`;
  },
  'uncertainty: chirped Gaussian product is (hbar/2) sqrt(1 + 4 c^2 sigma^4)': () => {
    const P = new un.Packet();
    const sigma = 1.2, c = 0.35;
    P.build({ ...base, sigma, chirp: c });
    close(P.mk.sd, un.chirpedDp(sigma, c), 1e-9, 'dp');
    const expected = Math.sqrt(1 + 4 * c * c * sigma ** 4);
    close(P.ratio(), expected, 1e-8, 'product / (hbar/2)');
    return `ratio ${P.ratio().toFixed(6)}`;
  },
  'uncertainty: square packet sits well above hbar/2, independent of its width': () => {
    const P = new un.Packet();
    const r: number[] = [];
    for (const sigma of [0.5, 1, 2]) {
      P.build({ ...base, kind: 'square', sigma });
      r.push(P.ratio());
    }
    assert(r.every((v) => v > 1.5), `ratios ${r}`);
    // A product of widths is scale free, so halving the width doubles dp and leaves the product alone.
    close(r[0], r[2], 1e-3, 'scale invariance');
    // Grid convergence: doubling the resolution changes nothing.
    const F = new un.Packet(8192, 256);
    F.build({ ...base, kind: 'square', sigma: 0.5 });
    close(F.ratio(), r[0], 1e-3, 'grid convergence');
    return `ratio ${r[1].toFixed(4)}`;
  },
  'uncertainty: free evolution keeps dp fixed and spreads dx as sigma sqrt(1 + (t/2sigma^2)^2)': () => {
    const P = new un.Packet();
    const sigma = 0.8;
    P.build({ ...base, sigma });
    const dp0 = P.mk.sd;
    const sr = new Float64Array(P.n);
    const si = new Float64Array(P.n);
    let worst = 0;
    for (const t of [0.5, 2, 5]) {
      P.evolve(t);
      P.measure(sr, si); // fresh FFT of the evolved psi
      worst = Math.max(worst, Math.abs(P.mk.sd - dp0));
      close(P.mx.sd, un.gaussWidth(sigma, t), 1e-8, `dx at t=${t}`);
      close(P.mx.mean, base.k0 * t, 1e-8, `centre at t=${t}`);
      close(P.mx.norm, 1, 1e-10, 'norm');
    }
    assert(worst < 1e-10, `dp drift ${worst}`);
    // A negatively chirped packet focuses to the minimum product at t* = -C / dp^2
    const c = -0.3;
    P.build({ ...base, sigma, chirp: c });
    const tStar = -(c * sigma * sigma) / (P.mk.sd * P.mk.sd);
    P.evolve(tStar);
    P.measure(sr, si);
    close(P.ratio(), 1, 1e-8, 'product at focus');
    return `dp drift ${worst.toExponential(1)}, focus at t=${tStar.toFixed(3)}`;
  },
  'uncertainty: Wigner function integrates to 1 and its marginals match |psi|^2 and |phi|^2': () => {
    const P = new un.Packet();
    const p: un.PacketParams = { ...base, kind: 'cat', sigma: 0.9, sep: 5, chirp: 0.2 };
    P.build(p);
    const t = 1.3;
    P.evolve(t);
    const X = 30, K = 9;
    const nx = 600, nk = 400;
    const hx = (2 * X) / nx, hk = (2 * K) / nk;
    const margX = new Float64Array(nx + 1);
    let total = 0;
    let wmin = Infinity;
    for (let i = 0; i <= nx; i++) {
      const x = -X + i * hx;
      for (let j = 0; j <= nk; j++) {
        const k = -K + j * hk;
        const w = un.wigner(p, t, x, k);
        margX[i] += w * hk;
        total += w * hx * hk;
        wmin = Math.min(wmin, w);
      }
    }
    close(total, 1, 1e-6, 'integral of W');
    // Compare with the grid wavefunction (built and evolved independently by FFT).
    let ex = 0;
    for (let i = 0; i <= nx; i += 5) {
      const x = -X + i * hx;
      const g = Math.round((x + P.L / 2) / P.dx);
      ex = Math.max(ex, Math.abs(margX[i] - (P.re[g] ** 2 + P.im[g] ** 2)));
    }
    let ek = 0;
    for (let g = -300; g <= 300; g += 7) {
      // p marginal evaluated exactly on the FFT grid's wave numbers
      const k = g * P.dk;
      let m = 0;
      for (let i = 0; i <= nx; i++) m += un.wigner(p, t, -X + i * hx, k) * hx;
      const j = (g + P.n) % P.n;
      ek = Math.max(ek, Math.abs(m - (P.phiRe[j] ** 2 + P.phiIm[j] ** 2)));
    }
    assert(ex < 1e-6, `x marginal error ${ex}`);
    assert(ek < 1e-6, `p marginal error ${ek}`);
    assert(wmin < -0.05, `cat should have a negative region, min ${wmin}`);
    assert(wmin >= -1 / Math.PI, 'pure-state bound |W| <= 1/(pi hbar)');
    // The Gaussian Wigner function is positive everywhere.
    let gmin = Infinity;
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) gmin = Math.min(gmin, un.wigner({ ...p, kind: 'gauss' }, t, i * 0.3, j * 0.2));
    assert(gmin >= 0, 'Gaussian W must be non-negative');
    return `marginal errors ${ex.toExponential(1)}, ${ek.toExponential(1)}; W min ${wmin.toFixed(3)}`;
  },
};
