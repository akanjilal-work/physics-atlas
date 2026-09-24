import { assert, close } from '../assert.ts';
import * as wl from '../../src/topics/weak-lensing/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'weak lensing: Kaiser-Squires round trip kappa -> gamma -> kappa recovers the map minus its mean': () => {
    const n = 64;
    const rnd = wl.mulberry32(11);
    const k = new Float64Array(n * n);
    // A few Gaussian blobs plus a constant sheet of 0.07
    for (let b = 0; b < 6; b++) {
      const cx = rnd() * n;
      const cy = rnd() * n;
      const s = 2 + 5 * rnd();
      const a = (rnd() - 0.3) * 0.4;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) k[j * n + i] += a * Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (2 * s * s));
    }
    for (let q = 0; q < n * n; q++) k[q] += 0.07;
    const { g1, g2 } = wl.ksForward(k, n);
    const { kE, kB } = wl.ksInverse(g1, g2, n);
    const ref = Float64Array.from(k);
    wl.removeMean(ref);
    let err = 0;
    let bmax = 0;
    for (let q = 0; q < n * n; q++) {
      err = Math.max(err, Math.abs(kE[q] - ref[q]));
      bmax = Math.max(bmax, Math.abs(kB[q]));
    }
    assert(err < 1e-12, `max E error ${err}`);
    assert(bmax < 1e-12, `max B leak ${bmax}`);
    return `max error ${err.toExponential(1)}, B leak ${bmax.toExponential(1)}`;
  },

  'weak lensing: SIS shear from an FFT grid matches gamma_t = theta_E / (2 theta)': () => {
    // Circularly truncated SIS: mass outside a circle does not shear points inside it,
    // so gamma_t = theta_E/(2 theta) holds exactly for theta < R.
    const thetaE = 0.5;
    const R = 16;
    const n = 512;
    const size = 128;
    const pix = size / n;
    const k = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // Pixel average of kappa. Pixels next to the cusp get 32 x 32 sub-samples.
        const x0 = -size / 2 + i * pix;
        const y0 = -size / 2 + j * pix;
        const S = Math.hypot(x0 + pix / 2, y0 + pix / 2) < 3 * pix ? 32 : 2;
        let s = 0;
        for (let sj = 0; sj < S; sj++) {
          for (let si = 0; si < S; si++) {
            const r = Math.hypot(x0 + ((si + 0.5) / S) * pix, y0 + ((sj + 0.5) / S) * pix);
            if (r < R) s += wl.sisKappa(r, thetaE);
          }
        }
        k[j * n + i] = s / (S * S);
      }
    }
    const { g1, g2 } = wl.ksForward(k, n);
    let worst = 0;
    const notes: string[] = [];
    for (const th of [2, 4, 8]) {
      let gt = 0;
      const M = 64;
      for (let a = 0; a < M; a++) {
        const phi = (2 * Math.PI * (a + 0.5)) / M;
        const x = th * Math.cos(phi);
        const y = th * Math.sin(phi);
        const s1 = wl.sample(g1, n, size, x, y);
        const s2 = wl.sample(g2, n, size, x, y);
        gt += -(s1 * Math.cos(2 * phi) + s2 * Math.sin(2 * phi));
      }
      gt /= M;
      const want = wl.sisGammaT(th, thetaE);
      const rel = Math.abs(gt / want - 1);
      worst = Math.max(worst, rel);
      notes.push(`θ=${th}: ${(rel * 100).toFixed(2)}%`);
    }
    // Analytic route too: mean kappa inside minus kappa at the edge
    const L = wl.makeLens('sis', 5e14, 0, 0, wl.geometry(0.3, 1));
    close(wl.lensGammaT(L, 3), L.thetaE / 6, 1e-12, 'analytic SIS gamma_t');
    assert(worst < 0.02, `worst relative error ${worst} ${notes.join(", ")}`);
    return notes.join(', ');
  },

  'weak lensing: SIS Einstein radius 28.8" for 1000 km/s, and flat LCDM distances': () => {
    const thE = (wl.sisThetaE(1000, 1) * 180 * 3600) / Math.PI;
    close(thE, 28.8, 0.05, 'theta_E arcsec');
    // H0 = 70, Om = 0.3 flat: comoving distance to z = 1 is 3303.8 Mpc, D_A = 1651.9 Mpc
    close(wl.comoving(1), 3303.8, 1, 'comoving distance z=1');
    close(wl.dA(1), 1651.9, 0.5, 'angular diameter distance z=1');
    return `θ_E = ${thE.toFixed(2)}″, D_A(1) = ${wl.dA(1).toFixed(1)} Mpc`;
  },

  'weak lensing: the mean of N noisy ellipticities scatters as sigma_e / sqrt(N)': () => {
    const rnd = wl.mulberry32(5);
    const sigma = 0.26;
    const trials = 800;
    const notes: string[] = [];
    for (const N of [25, 100, 400]) {
      let s2 = 0;
      for (let t = 0; t < trials; t++) {
        let m = 0;
        for (let i = 0; i < N; i++) m += sigma * wl.gaussPair(rnd)[0];
        m /= N;
        s2 += m * m;
      }
      const scatter = Math.sqrt(s2 / trials);
      const want = sigma / Math.sqrt(N);
      assert(Math.abs(scatter / want - 1) < 0.08, `N=${N}: ${scatter} vs ${want}`);
      notes.push(`N=${N}: ${(scatter / want).toFixed(3)}`);
    }
    return `ratio to σ/√N: ${notes.join(', ')}`;
  },

  'weak lensing: reduced shear g = gamma/(1-kappa) is what galaxy shapes measure': () => {
    const [g1, g2] = wl.reducedShear(0.1, 0.05, 0.3);
    close(g1, 0.1 / 0.7, 1e-15, 'g1');
    close(g2, 0.05 / 0.7, 1e-15, 'g2');
    // Mass-sheet degeneracy: kappa -> lam kappa + 1 - lam, gamma -> lam gamma leaves g unchanged
    const lam = 0.8;
    const [h1] = wl.reducedShear(lam * 0.1, lam * 0.05, lam * 0.3 + 1 - lam);
    close(h1, g1, 1e-15, 'mass sheet');
    // The average lensed ellipticity of randomly oriented sources equals g (Seitz & Schneider 1997)
    const rnd = wl.mulberry32(3);
    const N = 200000;
    const out: [number, number] = [0, 0];
    let m1 = 0;
    let m2 = 0;
    for (let i = 0; i < N; i++) {
      let [a, b] = wl.gaussPair(rnd);
      a *= 0.26;
      b *= 0.26;
      const r = Math.hypot(a, b);
      if (r > 0.9) {
        a *= 0.9 / r;
        b *= 0.9 / r;
      }
      wl.lensEllipticity(a, b, g1, g2, out);
      m1 += out[0];
      m2 += out[1];
    }
    m1 /= N;
    m2 /= N;
    const tol = (3 * 0.26) / Math.sqrt(N);
    close(m1, g1, tol, '<eps1>');
    close(m2, g2, tol, '<eps2>');
    assert(Math.abs(m1 - 0.1) > 10 * tol, 'average should differ from gamma');
    return `<ε> = (${m1.toFixed(4)}, ${m2.toFixed(4)}), g = (${g1.toFixed(4)}, ${g2.toFixed(4)})`;
  },

  'weak lensing: NFW mean convergence equals the integral of kappa (Wright & Brainerd forms)': () => {
    const L = wl.makeLens('nfw', 6e14, 0, 0, wl.geometry(0.3, 1));
    let worst = 0;
    for (const X of [0.5, 1.0, 2.0, 5.0]) {
      // 2 pi int_0^X kappa theta dtheta, substituting theta = u^2 to tame the centre
      const M = 20000;
      const U = Math.sqrt(X);
      let s = 0;
      for (let i = 0; i < M; i++) {
        const u = ((i + 0.5) / M) * U;
        const th = u * u;
        s += wl.lensKappa(L, th) * th * 2 * u;
      }
      s *= (2 * Math.PI * U) / M;
      const want = wl.lensMeanKappa(L, X) * Math.PI * X * X;
      worst = Math.max(worst, Math.abs(s / want - 1));
    }
    assert(worst < 1e-4, `worst ${worst}`);
    return `worst relative mismatch ${worst.toExponential(1)}`;
  },

  'weak lensing: reconstruction noise (B mode) falls as 1/sqrt(N)': () => {
    const src = wl.makeSources(32000, 16, 9);
    const field = wl.lensingField([], 16, 16);
    const b: number[] = [];
    for (const N of [4000, 16000]) {
      const o = wl.observe(field, src, N, 0.26);
      const r = wl.reconstruct(N, src.x, src.y, o.e1, o.e2, o.use, 16, 16, 1);
      b.push(wl.rms(r.kB));
    }
    const ratio = b[0] / b[1];
    close(ratio, 2, 0.2, 'noise ratio for 4x more galaxies');
    return `rms(κ_B): ${b[0].toFixed(4)} -> ${b[1].toFixed(4)}, ratio ${ratio.toFixed(2)}`;
  },
};
