import { assert, close } from '../assert.ts';
import * as N from '../../src/topics/noether-theorem/physics.ts';

type Suite = () => string | void;

const P0 = { pulse: false, field: false, aniso: false };

/** Run n bodies for T time units and return the worst relative drift of E, P and L. */
function drifts(n: number, p: N.Params, T: number): { dE: number; dP: number; dL: number } {
  const s = N.createSys();
  N.initSystem(s, n);
  const sc = N.scales(s, p);
  const E0 = N.energy(s, p);
  const L0 = N.angularMomentum(s);
  const Pv = new Float64Array(2);
  N.momentum(s, Pv);
  const px0 = Pv[0];
  const py0 = Pv[1];
  let dE = 0;
  let dP = 0;
  let dL = 0;
  const steps = Math.round(T / N.STEP);
  for (let k = 1; k <= steps; k++) {
    N.yoshidaStep(s, p, N.STEP);
    if (k % 20 === 0) {
      dE = Math.max(dE, Math.abs(N.energy(s, p) - E0) / sc.E);
      N.momentum(s, Pv);
      dP = Math.max(dP, Math.hypot(Pv[0] - px0, Pv[1] - py0) / sc.P);
      dL = Math.max(dL, Math.abs(N.angularMomentum(s) - L0) / sc.L);
    }
  }
  return { dE, dP, dL };
}

export const suites: Record<string, Suite> = {
  'noether: two-body circular orbit returns after the analytic period 2π/ω, ω² = 2Km/√(d²+a²)': () => {
    const s = N.createSys();
    s.n = 2;
    const m = 1;
    const R = 0.8;
    const d = 2 * R;
    const w = Math.sqrt((2 * N.PAIR_K * m) / Math.sqrt(d * d + N.PAIR_A * N.PAIR_A));
    s.m[0] = m;
    s.m[1] = m;
    s.x.set([R, 0, -R, 0]);
    s.v.set([0, w * R, 0, -w * R]);
    const T = (2 * Math.PI) / w;
    const steps = Math.round(T / N.STEP);
    const h = T / steps;
    for (let k = 0; k < steps; k++) N.yoshidaStep(s, P0, h);
    const err = Math.max(Math.abs(s.x[0] - R), Math.abs(s.x[1]), Math.abs(s.x[2] + R), Math.abs(s.x[3]));
    assert(err < 1e-9, `position error after one period ${err}`);
    return `T=${T.toFixed(4)}, error ${err.toExponential(1)}`;
  },

  'noether: all symmetries hold, so E, P and L are each conserved to 1e-9 (2, 3, 4 bodies, t = 100)': () => {
    const out: string[] = [];
    for (const n of [2, 3, 4]) {
      const { dE, dP, dL } = drifts(n, P0, 100);
      assert(dE < 1e-9 && dP < 1e-9 && dL < 1e-9, `n=${n}: dE ${dE} dP ${dP} dL ${dL}`);
      out.push(`n${n} ${dE.toExponential(0)}/${dP.toExponential(0)}/${dL.toExponential(0)}`);
    }
    return out.join(', ');
  },

  'noether: breaking one symmetry makes exactly its own quantity drift': () => {
    const out: string[] = [];
    for (const n of [2, 3, 4]) {
      const t = drifts(n, { pulse: true, field: false, aniso: false }, 60);
      assert(t.dE > 1e-2 && t.dP < 1e-9 && t.dL < 1e-9, `pulse n=${n}: ${JSON.stringify(t)}`);
      const x = drifts(n, { pulse: false, field: true, aniso: false }, 60);
      assert(x.dP > 1e-2 && x.dE < 1e-9 && x.dL < 1e-9, `field n=${n}: ${JSON.stringify(x)}`);
      const r = drifts(n, { pulse: false, field: false, aniso: true }, 60);
      assert(r.dL > 1e-2 && r.dE < 1e-9 && r.dP < 1e-9, `aniso n=${n}: ${JSON.stringify(r)}`);
      out.push(`n${n}: E ${t.dE.toFixed(2)}, P ${x.dP.toFixed(2)}, L ${r.dL.toFixed(2)}`);
    }
    return out.join('; ');
  },

  'noether: energy budget dE/dt = ∂H/∂t = f′(t) V(q) holds along the pulsed run': () => {
    const p = { pulse: true, field: true, aniso: true };
    const s = N.createSys();
    N.initSystem(s, 3);
    const E0 = N.energy(s, p);
    // Trapezoid rule on f'(t) V(q(t)) sampled every step.
    let prev = N.strengthRate(s.t, p) * N.potential(s, p);
    let integral = 0;
    const h = 1e-3;
    for (let k = 0; k < 40000; k++) {
      N.yoshidaStep(s, p, h);
      const cur = N.strengthRate(s.t, p) * N.potential(s, p);
      integral += 0.5 * h * (prev + cur);
      prev = cur;
    }
    const dE = N.energy(s, p) - E0;
    close(dE, integral, 1e-5 * Math.max(1, Math.abs(dE)), 'energy change vs ∫ f′V dt');
    return `ΔE=${dE.toFixed(6)}, ∫f′V dt=${integral.toFixed(6)}`;
  },

  'noether: ghost equivalence. T(real) and the evolved ghost agree when the symmetry holds, and part when it fails': () => {
    const tmp = new Float64Array(2);
    const run = (mode: N.GhostMode, p: N.Params, T: number) => {
      const s = N.createSys();
      const g = N.createSys();
      N.initSystem(s, 3);
      N.makeGhost(g, s, mode);
      for (let k = 0; k < Math.round(T / N.STEP); k++) {
        N.yoshidaStep(s, p, N.STEP);
        N.yoshidaStep(g, p, N.STEP);
      }
      return N.ghostGap(g, s, mode, tmp);
    };
    // Shift: holds without the well, even with the pulse and anisotropy on.
    const sh = run('space', { pulse: true, field: false, aniso: true }, 40);
    assert(sh < 1e-9, `shift gap ${sh}`);
    const shB = run('space', { pulse: false, field: true, aniso: false }, 40);
    assert(shB > 0.1, `shift gap with well only ${shB}`);
    // Rotation: a central well keeps it. Anisotropy breaks it.
    const ro = run('rotation', { pulse: true, field: true, aniso: false }, 40);
    assert(ro < 1e-9, `rotation gap ${ro}`);
    const roB = run('rotation', { pulse: false, field: true, aniso: true }, 40);
    assert(roB > 0.1, `rotation gap with anisotropy ${roB}`);
    // Time: a later clock only matters when the law changes with time.
    const ti = run('time', { pulse: false, field: true, aniso: true }, 40);
    assert(ti < 1e-9, `time gap ${ti}`);
    const tiB = run('time', { pulse: true, field: false, aniso: false }, 40);
    assert(tiB > 0.01, `time gap with pulse ${tiB}`);
    return `held: ${sh.toExponential(0)}, ${ro.toExponential(0)}, ${ti.toExponential(0)}. broken: ${shB.toFixed(2)}, ${roB.toFixed(2)}, ${tiB.toFixed(2)}`;
  },

  'noether: symplectic energy error stays bounded over 10⁶ steps (no secular growth), and leapfrog error scales as h²': () => {
    const p = { pulse: false, field: true, aniso: true };
    const s = N.createSys();
    N.initSystem(s, 3);
    const sc = N.scales(s, p).E;
    const E0 = N.energy(s, p);
    const steps = 1_000_000;
    let early = 0;
    let late = 0;
    let worst = 0;
    for (let k = 1; k <= steps; k++) {
      N.yoshidaStep(s, p, N.STEP);
      if (k % 50 === 0) {
        const e = Math.abs(N.energy(s, p) - E0) / sc;
        worst = Math.max(worst, e);
        if (k <= steps / 10) early = Math.max(early, e);
        if (k > (9 * steps) / 10) late = Math.max(late, e);
      }
    }
    assert(worst < 1e-9, `worst error ${worst}`);
    assert(late < 10 * early + 1e-12, `energy error grew: early ${early}, late ${late}`);
    // Leapfrog is second order: halving h cuts the bounded error about fourfold.
    const lf = (h: number) => {
      const q = N.createSys();
      N.initSystem(q, 3);
      const e0 = N.energy(q, p);
      let w = 0;
      for (let k = 0; k < Math.round(40 / h); k++) {
        N.leapfrogStep(q, p, h);
        w = Math.max(w, Math.abs(N.energy(q, p) - e0));
      }
      return w;
    };
    const ratio = lf(0.01) / lf(0.005);
    close(ratio, 4, 0.6, 'leapfrog error ratio');
    return `t=${(steps * N.STEP).toFixed(0)}: early ${early.toExponential(1)}, late ${late.toExponential(1)}, leapfrog ratio ${ratio.toFixed(2)}`;
  },
};
