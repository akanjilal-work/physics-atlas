import { assert, close } from '../assert.ts';
import * as ds from '../../src/topics/double-slit/physics.ts';

type Suite = () => string | void;

const base: ds.SlitParams = { lambda: 550e-9, d: 0.2e-3, a: 0.04e-3, L: 1 };

export const suites: Record<string, Suite> = {
  'double slit: Huygens numeric sum matches the Fraunhofer formula within 2% (far field)': () => {
    let worst = 0;
    for (const L of [1, 5]) {
      const p = { ...base, L };
      const I0 = ds.huygensIntensity(0, p, { nSrc: 64 });
      const ymax = (1.2 * p.lambda * p.L) / p.a; // past the first envelope zero
      for (let i = 0; i <= 600; i++) {
        const y = -ymax + (2 * ymax * i) / 600;
        const num = ds.huygensIntensity(y, p, { nSrc: 64 }) / I0;
        const ana = ds.fraunhofer(y, p);
        worst = Math.max(worst, Math.abs(num - ana));
      }
    }
    assert(worst < 0.02, `max deviation ${worst} of I0`);
    return `max |ΔI|/I0 = ${worst.toExponential(1)}`;
  },
  'double slit: bright fringes are spaced λL/d': () => {
    const p = { ...base, a: 1e-6 }; // thin slits so the envelope does not pull the peaks
    const s = ds.fringeSpacing(p.lambda, p.L, p.d);
    // Find the first bright fringe off-axis by golden-section search near y = s.
    let lo = 0.6 * s;
    let hi = 1.4 * s;
    const f = (y: number) => -ds.huygensIntensity(y, p, { nSrc: 4 });
    for (let k = 0; k < 80; k++) {
      const m1 = hi - (hi - lo) / 1.618;
      const m2 = lo + (hi - lo) / 1.618;
      if (f(m1) < f(m2)) hi = m2;
      else lo = m1;
    }
    const peak = (lo + hi) / 2;
    close(peak / s, 1, 1e-4, 'first-order peak / (λL/d)');
    close(s, 2.75e-3, 1e-12, 'λL/d for 550 nm, 0.2 mm, 1 m');
    return `peak at ${(peak * 1e3).toFixed(4)} mm, λL/d = ${(s * 1e3).toFixed(4)} mm`;
  },
  'double slit: V = 0 removes the interference term': () => {
    const p = base;
    let worst = 0;
    for (let i = 0; i <= 200; i++) {
      const y = -0.016 + (0.032 * i) / 200;
      const both = ds.huygensIntensity(y, p, { V: 0 });
      const l = ds.huygensIntensity(y, p, { open: [true, false] });
      const r = ds.huygensIntensity(y, p, { open: [false, true] });
      worst = Math.max(worst, Math.abs(both - l - r) / (l + r));
    }
    assert(worst < 1e-12, `I(V=0) − I1 − I2 relative ${worst}`);
    close(ds.partialInterference(1, 4, 0, 0.3), 5, 1e-15, 'closed form at V=0');
    close(ds.partialInterference(1, 1, 1, 0), 4, 1e-15, 'closed form at V=1, in phase');
    close(ds.partialInterference(1, 1, 1, Math.PI), 0, 1e-15, 'closed form at V=1, out of phase');
    return `max relative cross term ${worst.toExponential(1)}`;
  },
  'double slit: inverse-CDF sampler histogram matches I(y) (chi-square)': () => {
    const n = 1200;
    const Y = 0.016;
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) ys[i] = -Y + (2 * Y * i) / (n - 1);
    const I = ds.huygensPattern(ys, base, { nSrc: 24 }, new Float64Array(n));
    const smp = new ds.InverseCdfSampler(n);
    smp.build(ys, I);
    const rnd = ds.mulberry32(20260923);
    const N = 200000;
    const nb = 64;
    const counts = new Float64Array(nb);
    for (let k = 0; k < N; k++) {
      const b = ds.binIndex(smp.sample(rnd()), -Y, Y, nb);
      if (b >= 0) counts[b]++;
    }
    let chi2 = 0;
    let dof = 0;
    for (let b = 0; b < nb; b++) {
      const e = N * smp.mass(-Y + (2 * Y * b) / nb, -Y + (2 * Y * (b + 1)) / nb);
      if (e < 5) continue;
      chi2 += (counts[b] - e) ** 2 / e;
      dof++;
    }
    const red = chi2 / (dof - 1);
    assert(red < 1.6, `reduced chi-square ${red}`);
    return `χ²/dof = ${red.toFixed(2)} over ${dof} bins`;
  },
  'double slit: measured visibility is about 1 coherent, about 0 with V = 0': () => {
    const n = 1200;
    const Y = 0.016;
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) ys[i] = -Y + (2 * Y * i) / (n - 1);
    const s = ds.fringeSpacing(base.lambda, base.L, base.d);
    const out: string[] = [];
    for (const V of [1, 0.5, 0]) {
      const I = ds.huygensPattern(ys, base, { nSrc: 24, V }, new Float64Array(n));
      const smp = new ds.InverseCdfSampler(n);
      smp.build(ys, I);
      const rnd = ds.mulberry32(7);
      const counts = new Float64Array(120);
      for (let k = 0; k < 50000; k++) {
        const b = ds.binIndex(smp.sample(rnd()), -Y, Y, 120);
        if (b >= 0) counts[b]++;
      }
      const v = ds.measureVisibility(counts, -Y, Y, s);
      close(v, V, 0.06, `visibility at V=${V}`);
      out.push(v.toFixed(3));
    }
    return `V = 1, 0.5, 0 measured as ${out.join(', ')}`;
  },
  'double slit: electron at 50 kV has λ = 5.485 pm (non-relativistic), 5.355 pm relativistic': () => {
    const nr = ds.electronWavelength(50e3);
    const rel = ds.electronWavelength(50e3, true);
    // Hand calculation: h / √(2 m e U) with CODATA constants.
    const expected = 6.62607015e-34 / Math.sqrt(2 * 9.1093837015e-31 * 1.602176634e-19 * 5e4);
    close(nr, expected, 1e-18, 'formula');
    close(nr * 1e12, 5.4847, 5e-4, 'non-relativistic λ in pm');
    close(rel * 1e12, 5.3553, 5e-4, 'relativistic λ in pm');
    close(ds.photonWavelength(2.2542) * 1e9, 550.0, 0.05, '2.254 eV photon in nm');
    return `λ = ${(nr * 1e12).toFixed(4)} pm (non-rel), ${(rel * 1e12).toFixed(4)} pm (rel)`;
  },
};
