import { assert, close } from '../assert.ts';
import * as bh from '../../src/topics/black-hole-lensing/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'black hole lensing: weak-field deflection → 4M/b at large b (and matches 4M/b + 15πM²/4b²)': () => {
    const out: string[] = [];
    for (const b of [200, 1000, 5000]) {
      const a = bh.deflection(b);
      const first = Math.abs(a / bh.weakDeflection(b) - 1);
      const second = Math.abs(a / bh.weakDeflection2(b) - 1);
      assert(first < 3 / b, `b=${b}: |α/(4M/b) − 1| = ${first}, expected about 15π/16b`);
      // The next term is 128M³/3b³, a relative size of about 10.7/b².
      assert(second < 12 / (b * b) + 1e-6, `b=${b}: second-order mismatch ${second}`);
      out.push(`b=${b}: ${(first * 100).toFixed(3)}%`);
    }
    return out.join(', ');
  },
  'black hole lensing: capture threshold is b_c = 3√3 M': () => {
    close(bh.B_CRIT, Math.sqrt(27), 1e-12, 'b_c');
    for (const eps of [1e-3, 1e-5]) {
      const lo = bh.sweep(bh.B_CRIT * (1 - eps));
      const hi = bh.sweep(bh.B_CRIT * (1 + eps));
      assert(lo.fate === 'captured', `b_c(1 − ${eps}) should be captured, got ${lo.fate}`);
      assert(hi.fate === 'escaped', `b_c(1 + ${eps}) should escape, got ${hi.fate}`);
    }
    // Bisection on the fate finds the threshold numerically.
    let a = 4;
    let c = 7;
    for (let i = 0; i < 40; i++) {
      const m = (a + c) / 2;
      if (bh.sweep(m).fate === 'captured') a = m;
      else c = m;
    }
    close((a + c) / 2, bh.B_CRIT, 1e-6, 'bisected threshold');
    return `threshold ${((a + c) / 2).toFixed(8)} vs 3√3 = ${bh.B_CRIT.toFixed(8)}`;
  },
  'black hole lensing: photon sphere r = 3M is a circular orbit with b = b_c': () => {
    // u = 1/3, du/dφ = 0 must be a fixed point of u'' = −u + 3Mu².
    const st = new Float64Array(2);
    let u = 1 / 3;
    let w = 0;
    let dev = 0;
    for (let i = 0; i < 5000; i++) {
      bh.rk4(u, w, 2e-3, st);
      u = st[0];
      w = st[1];
      dev = Math.max(dev, Math.abs(1 / u - 3));
    }
    assert(dev < 1e-9, `radius drifted by ${dev}`);
    // The first integral gives the impact parameter of that orbit: 1/b² = u² − 2Mu³ = 1/27.
    close(1 / Math.sqrt(bh.invariant(1 / 3, 0)), bh.B_CRIT, 1e-12, 'b of circular photon orbit');
    // Closest approach of near-critical rays tends to 3M.
    close(bh.sweep(bh.B_CRIT + 1e-6).rMin, 3, 2e-3, 'rMin as b → b_c');
    return `held r = 3M over 10 rad to ${dev.toExponential(1)}`;
  },
  'black hole lensing: Sun limb deflection = 1.75 arcsec': () => {
    const a = bh.sunLimbDeflectionArcsec();
    close(a, 1.751, 0.002, 'deflection at the solar limb');
    return `${a.toFixed(4)}″`;
  },
  'black hole lensing: strong-deflection log law near b_c (Bozza 2002)': () => {
    const out: string[] = [];
    for (const d of [1e-3, 1e-5]) {
      const b = bh.B_CRIT * (1 + d);
      const a = bh.deflection(b);
      close(a, bh.strongDeflection(b), 0.01, `α at b = b_c(1 + ${d})`);
      out.push(`${((a * 180) / Math.PI).toFixed(1)}°`);
    }
    return out.join(', ');
  },
  'black hole lensing: sky lookup table is flat-space-correct far off axis and captures inside the shadow': () => {
    const D = 30;
    const lut = bh.buildSkyLut(D, 40, 1024);
    assert(bh.skyDirection([0, 0, -1], lut) === null, 'ray straight at the hole must be captured');
    // Just inside the shadow edge: sin θ = b_c √(1 − 2M/D) / D.
    const th = Math.asin((bh.B_CRIT * Math.sqrt(1 - 2 / D)) / D);
    assert(bh.skyDirection([Math.sin(th * 0.99), 0, -Math.cos(th * 0.99)], lut) === null, 'inside shadow');
    assert(bh.skyDirection([Math.sin(th * 1.01), 0, -Math.cos(th * 1.01)], lut) !== null, 'outside shadow');
    // Einstein ring: the sky point directly behind the hole appears at angle θ_E with Δφ(θ_E) = π.
    // Weak field with source at infinity gives θ_E ≈ √(4M/D). At D = 30 the strong field makes it larger.
    let lo = th * 1.01;
    let hi = 1.2;
    for (let i = 0; i < 50; i++) {
      const m = (lo + hi) / 2;
      const phi = bh.lookupPhi(lut, bh.impactFromAngle(D, m));
      if (phi > Math.PI) lo = m;
      else hi = m;
    }
    const weak = Math.sqrt(4 / D);
    assert(lo > weak && lo < weak * 1.3, `θ_E = ${lo}, weak estimate ${weak}`);
    // Check the direction mapping against a direct sweep at a moderate angle.
    const t = 0.6;
    const n = bh.skyDirection([Math.sin(t), 0, -Math.cos(t)], lut)!;
    const s = bh.sweep(bh.impactFromAngle(D, t), D);
    close(Math.atan2(n[0], n[2]), s.phi, 2e-4, 'sky direction angle');
    return `θ_E = ${((lo * 180) / Math.PI).toFixed(2)}° vs weak ${((weak * 180) / Math.PI).toFixed(2)}°`;
  },
};
