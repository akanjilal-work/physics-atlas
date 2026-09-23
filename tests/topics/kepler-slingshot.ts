import { assert, close } from '../assert.ts';
import * as k from '../../src/topics/kepler-slingshot/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'kepler: integrated speed obeys vis-viva around an e = 0.7 orbit': () => {
    const mu = 1;
    const a = 1.3;
    const e = 0.7;
    const s = k.keplerState(mu, a, e, 0, new Float64Array(4));
    const T = k.keplerPeriod(mu, a);
    const n = 40000;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      k.step2B(s, mu, T / n);
      if (i % 100 === 0) {
        const r = Math.hypot(s[0], s[1]);
        const v = Math.hypot(s[2], s[3]);
        worst = Math.max(worst, Math.abs(v / k.visViva(mu, r, a) - 1));
      }
    }
    assert(worst < 1e-8, `worst relative speed error ${worst}`);
    // Perihelion and aphelion speeds: v_p / v_a = (1 + e) / (1 - e).
    close(k.visViva(mu, a * (1 - e), a) / k.visViva(mu, a * (1 + e), a), (1 + e) / (1 - e), 1e-12, 'vp/va');
    return `max error ${worst.toExponential(1)}`;
  },

  'kepler: period matches 2π√(a³/μ), and Earth year from GM_sun': () => {
    const mu = 1;
    const a = 0.8;
    const e = 0.5;
    const s = k.keplerState(mu, a, e, 0, new Float64Array(4));
    const h = 1e-4;
    let t = 0;
    let prevY = s[1];
    const crossings: number[] = [];
    while (crossings.length < 3) {
      k.step2B(s, mu, h);
      t += h;
      // Periapsis is on +x: crossing y = 0 upward with x > 0.
      if (prevY < 0 && s[1] >= 0 && s[0] > 0) crossings.push(t - (h * s[1]) / (s[1] - prevY));
      prevY = s[1];
    }
    const T = (crossings[2] - crossings[0]) / 2;
    close(T, k.keplerPeriod(mu, a), 1e-6, 'numerical period');
    // Earth: GM_sun = 1.32712440018e20 m³/s², a = 1.495978707e11 m. Sidereal year = 365.256 days.
    const days = k.keplerPeriod(1.32712440018e20, 1.495978707e11) / 86400;
    close(days, 365.256, 0.05, 'Earth year (days)');
    return `T=${T.toFixed(6)}, Earth ${days.toFixed(3)} d`;
  },

  'hohmann: simulated burns reach r2 and circularise with the formula Δv (Earth to Mars 2.95 + 2.65 km/s)': () => {
    const mu = 1;
    const r1 = 1;
    const r2 = 2;
    const hm = k.hohmann(mu, r1, r2);
    const s = new Float64Array([r1, 0, 0, 1]);
    s[3] += hm.dv1;
    const h = 1e-4;
    let t = 0;
    while (t + h <= hm.tTransfer) {
      k.step2B(s, mu, h);
      t += h;
    }
    k.step2B(s, mu, hm.tTransfer - t);
    const r = Math.hypot(s[0], s[1]);
    close(r, r2, 1e-6, 'apoapsis radius');
    const v = Math.hypot(s[2], s[3]);
    close(Math.sqrt(mu / r2) - v, hm.dv2, 1e-6, 'second burn');
    s[2] *= (v + hm.dv2) / v;
    s[3] *= (v + hm.dv2) / v;
    const el = k.elements(mu, s[0], s[1], s[2], s[3], { a: 0, e: 0, energy: 0, h: 0, omega: 0 });
    assert(el.e < 1e-6, `final eccentricity ${el.e}`);
    // Earth (1 AU) to Mars (1.524 AU), circular speed 29.78 km/s at 1 AU.
    const m = k.hohmann(1, 1, 1.524);
    close(m.dv1 * 29.78, 2.95, 0.02, 'Earth-Mars dv1 (km/s)');
    close(m.dv2 * 29.78, 2.65, 0.02, 'Earth-Mars dv2 (km/s)');
    close((m.tTransfer / (2 * Math.PI)) * 365.25, 259, 1, 'transfer days');
    return `Δv1=${hm.dv1.toFixed(4)}, Δv2=${hm.dv2.toFixed(4)}, Mars ${(m.dv1 * 29.78).toFixed(2)}+${(m.dv2 * 29.78).toFixed(2)} km/s`;
  },

  'flyby: numerical two-body deflection matches sin(δ/2) = 1/e': () => {
    const mu = 1;
    const notes: string[] = [];
    for (const [vInf, bOverA] of [[1, 0.5], [0.7, 2], [1.3, 5]]) {
      const aH = mu / (vInf * vInf);
      const b = bOverA * aH;
      // Start far away on a straight line with speed v∞ (the potential there is ~1e-6 of v∞²).
      const R = 1e6 * aH;
      const s = new Float64Array([-R, b, vInf, 0]);
      const E0 = k.energy2B(s, mu);
      let t = 0;
      while (t < (2 * R) / vInf) {
        const r = Math.hypot(s[0], s[1]);
        const h = Math.min(0.002 * Math.min(Math.sqrt((r * r * r) / mu), r / Math.hypot(s[2], s[3])), (2 * R) / vInf - t + 1e-9);
        k.step2B(s, mu, h);
        t += h;
      }
      const turned = Math.abs(Math.atan2(s[3], s[2]));
      // e from impact parameter: e² = 1 + (b v∞² / μ)²
      const e = Math.sqrt(1 + (b / aH) ** 2);
      const rp = aH * (e - 1);
      const fb = k.flybyTurn(mu, vInf, rp);
      close(fb.e, e, 1e-9, 'e from rp');
      close(fb.b, b, 1e-9 * b, 'impact parameter');
      close(turned, fb.delta, 2e-4, `turning angle (b/a=${bOverA})`);
      assert(Math.abs(k.energy2B(s, mu) / E0 - 1) < 1e-6, 'energy drift');
      notes.push(`${((fb.delta * 180) / Math.PI).toFixed(2)}°`);
    }
    return `δ = ${notes.join(', ')}`;
  },

  'flyby: n-body (Sun + planet + probe) energy change matches patched conics within 5%': () => {
    const notes: string[] = [];
    const cases: [number, number, number, 1 | -1][] = [
      [0.5, 6, 120, -1],
      [0.5, 20, 60, -1],
      [0.35, 10, 90, -1],
      [0.8, 2, 120, 1],
    ];
    for (const [vInf, rpk, th, turn] of cases) {
      const p = { q: 1e-3, vInf, thetaIn: (th * Math.PI) / 180, rp: rpk * 1e-4, turn, phi: Math.PI / 2 };
      const pc = k.patchedConic(p);
      const run = k.simulateFlyby(p, Math.max(0.5, 0.25 / vInf));
      const dE = run.E1 - run.E0;
      const err = Math.abs(dE / pc.dE - 1);
      assert(err < 0.05, `v∞=${vInf} rp=${rpk}: n-body ΔE ${dE.toFixed(4)} vs patched ${pc.dE.toFixed(4)}`);
      notes.push(`${(err * 100).toFixed(1)}%`);
    }
    return `errors ${notes.join(', ')}`;
  },

  'kepler: equal areas in equal times (perihelion vs aphelion slice, e = 0.9)': () => {
    const N = 12;
    const SUB = 96;
    const pts = new Float64Array((N * SUB + 1) * 2);
    const drift = k.sampleOrbit(1, 1, 0.9, N * SUB, 16, N, pts);
    const A1 = k.fanArea(pts, 0, SUB);
    const A2 = k.fanArea(pts, (N / 2) * SUB, (N / 2 + 1) * SUB);
    const exact = (Math.PI * Math.sqrt(1 - 0.81)) / N; // πab / N with a = 1
    close(A1 / exact, 1, 2e-3, 'perihelion wedge');
    close(A2 / exact, 1, 2e-3, 'aphelion wedge');
    assert(drift < 1e-9, `energy drift ${drift}`);
    return `A1/A2 = ${(A1 / A2).toFixed(5)}`;
  },
};
