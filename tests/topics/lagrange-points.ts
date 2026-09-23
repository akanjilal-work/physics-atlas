import { assert, close } from '../assert.ts';
import * as lp from '../../src/topics/lagrange-points/physics.ts';

type Suite = () => string | void;

const EM = 0.01215;
const SJ = 9.54e-4;

export const suites: Record<string, Suite> = {
  'lagrange points: Earth-Moon positions match published CR3BP values (mu = 0.01215)': () => {
    // Standard rotating-frame values, e.g. Koon, Lo, Marsden and Ross, "Dynamical Systems, the Three-Body Problem and Space Mission Design".
    const p = lp.lagrangePoints(EM);
    close(p.L1[0], 0.83692, 5e-5, 'L1 x');
    close(p.L2[0], 1.15568, 5e-5, 'L2 x');
    close(p.L3[0], -1.00506, 5e-5, 'L3 x');
    close(p.L4[0], 0.5 - EM, 1e-15, 'L4 x');
    close(p.L4[1], Math.sqrt(3) / 2, 1e-15, 'L4 y');
    close(p.L5[1], -Math.sqrt(3) / 2, 1e-15, 'L5 y');
    // Earth-Moon distance 384 400 km: L1 sits about 58 000 km from the Moon, L2 about 64 500 km beyond it.
    const moon = 1 - EM;
    const dL1 = (moon - p.L1[0]) * 384400;
    const dL2 = (p.L2[0] - moon) * 384400;
    close(dL1, 58000, 1000, 'L1 distance from Moon (km)');
    close(dL2, 64500, 1000, 'L2 distance beyond Moon (km)');
    return `L1 ${p.L1[0].toFixed(5)}, L2 ${p.L2[0].toFixed(5)}, L3 ${p.L3[0].toFixed(5)}`;
  },

  'lagrange points: grad Omega = 0 at all five points, and analytic gradient matches finite differences': () => {
    const g = new Float64Array(2);
    let worst = 0;
    for (const mu of [1e-5, SJ, EM, 0.03, 0.1, 0.3, 0.5]) {
      const p = lp.lagrangePoints(mu);
      for (const n of lp.L_NAMES) {
        const [x, y] = p[n];
        lp.gradOmega(mu, x, y, g);
        worst = Math.max(worst, Math.hypot(g[0], g[1]));
      }
    }
    assert(worst < 1e-11, `largest |grad Omega| ${worst}`);
    // Independent check of the gradient formula at an arbitrary point.
    const mu = EM;
    const x = 0.3;
    const y = -0.7;
    const e = 1e-6;
    lp.gradOmega(mu, x, y, g);
    const fx = (lp.omega(mu, x + e, y) - lp.omega(mu, x - e, y)) / (2 * e);
    const fy = (lp.omega(mu, x, y + e) - lp.omega(mu, x, y - e)) / (2 * e);
    close(g[0], fx, 1e-8, 'dOmega/dx');
    close(g[1], fy, 1e-8, 'dOmega/dy');
    return `max |grad Omega| = ${worst.toExponential(1)}`;
  },

  'lagrange points: Jacobi constant conserved (tadpole 20 periods, L1 escape with close lunar pass)': () => {
    const run = (mu: number, which: lp.LName, dr: number, dv: number, T: number) => {
      const s = new Float64Array(4);
      lp.launchState(mu, which, dr, dv, s);
      const c0 = lp.jacobi(mu, s);
      let t = 0;
      let rmin = Infinity;
      while (t < T) {
        const h = lp.stepFor(mu, s);
        lp.rk4Step(mu, s, h);
        t += h;
        rmin = Math.min(rmin, lp.nearestPrimary(mu, s[0], s[1]));
      }
      return { drift: Math.abs((lp.jacobi(mu, s) - c0) / c0), rmin };
    };
    const a = run(SJ, 'L4', 0.008, 0, 20 * lp.PERIOD);
    const b = run(EM, 'L1', 0, 0.01, 5 * lp.PERIOD);
    assert(a.drift < 1e-10, `tadpole drift ${a.drift}`);
    assert(b.drift < 1e-9, `L1 escape drift ${b.drift}`);
    return `tadpole ${a.drift.toExponential(1)}, L1 run ${b.drift.toExponential(1)} (closest pass ${b.rmin.toFixed(3)})`;
  },

  'lagrange points: Routh critical mass ratio from the L4 eigenvalues = 0.03852': () => {
    // Bisect on the numerical stability test of the linearised equations at L4.
    let lo = 1e-4;
    let hi = 0.2;
    const stable = (mu: number) => {
      const p = lp.lagrangePoints(mu).L4;
      return lp.linearStability(mu, p[0], p[1]).stable;
    };
    assert(stable(lo) && !stable(hi), 'bracket');
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (lo + hi);
      if (stable(m)) lo = m;
      else hi = m;
    }
    const exact = (1 - Math.sqrt(23 / 27)) / 2;
    close(lo, exact, 1e-9, 'bisection vs closed form');
    close(lp.ROUTH_MU, 0.0385209, 1e-7, 'published value');
    // Collinear points are unstable for every mass ratio.
    for (const mu of [SJ, EM, 0.3]) {
      const p = lp.lagrangePoints(mu);
      for (const n of ['L1', 'L2', 'L3'] as const) assert(!lp.linearStability(mu, p[n][0], p[n][1]).stable, `${n} stable at mu=${mu}`);
    }
    return `mu_crit = ${lo.toFixed(8)}`;
  },

  'lagrange points: L1 and L2 distances follow the Hill series h(1 -+ h/3), h = (mu/3)^(1/3)': () => {
    for (const mu of [1e-6, 3.0e-6, SJ]) {
      const p = lp.lagrangePoints(mu);
      const h = lp.hillRadius(mu);
      const d1 = 1 - mu - p.L1[0];
      const d2 = p.L2[0] - (1 - mu);
      // Next terms are O(h^3), so the residual must shrink like h^3.
      close(d1, h * (1 - h / 3), 2 * h ** 3, `L1 mu=${mu}`);
      close(d2, h * (1 + h / 3), 2 * h ** 3, `L2 mu=${mu}`);
    }
    const se = lp.lagrangePoints(3.0e-6);
    const km = (se.L2[0] - (1 - 3.0e-6)) * 1.496e8;
    close(km, 1.5e6, 0.02e6, 'Sun-Earth L2 distance (km)');
    return `Sun-Earth L2 ${(km / 1e6).toFixed(2)} million km beyond Earth`;
  },

  'lagrange points: small tadpole libration period near L4 matches 2pi / omega_slow': () => {
    // Linear theory: omega^2 = (1 - sqrt(1 - 27 mu (1 - mu))) / 2 for the slow mode.
    const mu = SJ;
    const wSlow = Math.sqrt((1 - Math.sqrt(1 - 27 * mu * (1 - mu))) / 2);
    const expected = (2 * Math.PI) / wSlow;
    const p = lp.lagrangePoints(mu).L4;
    const s = new Float64Array(4);
    lp.launchState(mu, 'L4', 0.001, 0, s);
    // Track the angle about the barycentre, averaged over each fast epicycle (period near 2 pi).
    const th0 = Math.atan2(p[1], p[0]);
    const h = 1e-3;
    const win = Math.round((2 * Math.PI) / h);
    const buf = new Float64Array(win);
    let sum = 0;
    let prev = NaN;
    const ups: number[] = [];
    for (let n = 0; n < 2.6 * expected / h; n++) {
      lp.rk4Step(mu, s, h);
      const d = Math.atan2(s[1], s[0]) - th0;
      sum += d - buf[n % win];
      buf[n % win] = d;
      if (n >= win) {
        const avg = sum / win;
        if (prev < 0 && avg >= 0) ups.push(n * h);
        prev = avg;
      }
    }
    assert(ups.length >= 2, 'no libration cycle found');
    const period = ups[ups.length - 1] - ups[ups.length - 2];
    close(period, expected, 0.02 * expected, 'libration period');
    return `T = ${period.toFixed(1)} vs ${expected.toFixed(1)} (${(expected / (2 * Math.PI)).toFixed(1)} orbits)`;
  },
  'lagrange points: orbit classifier finds tadpole, horseshoe, L1 escape and post-Routh drift (challenge paths)': () => {
    const fly = (mu: number, which: lp.LName, dr: number, dv: number, T: number) => {
      const s = new Float64Array(4);
      lp.launchState(mu, which, dr, dv, s);
      const trk = new lp.OrbitTracker();
      trk.reset(mu, which, s);
      let t = 0;
      while (t < T) {
        const h = lp.stepFor(mu, s);
        lp.rk4Step(mu, s, h);
        t += h;
        trk.update(s, t);
        if (lp.nearestPrimary(mu, s[0], s[1]) < 0.004) break;
      }
      return trk;
    };
    const tad = fly(SJ, 'L4', 0.008, 0, 20.5 * lp.PERIOD);
    assert(tad.tadpoleT / lp.PERIOD >= 20 && tad.swing >= 10 && !tad.horseshoe, `tadpole ${tad.tadpoleT / lp.PERIOD} orbits, swing ${tad.swing}`);
    const hs = fly(SJ, 'L4', 0.013, 0, 40 * lp.PERIOD);
    assert(hs.horseshoe, 'horseshoe not detected from L4, dr = 0.013');
    const hs3 = fly(SJ, 'L3', 0.003, 0, 30 * lp.PERIOD);
    assert(hs3.horseshoe, 'horseshoe not detected from L3, dr = 0.003');
    const esc = fly(EM, 'L1', 0, 0.01, 3 * lp.PERIOD);
    assert(esc.maxDist >= 0.2, `L1 escape only reached ${esc.maxDist}`);
    const rest = fly(EM, 'L1', 0, 0, 3 * lp.PERIOD);
    assert(rest.maxDist < 1e-6, 'a particle placed exactly on L1 should stay there over 3 orbits');
    const routh = fly(0.05, 'L4', 0.002, 0, 10 * lp.PERIOD);
    const below = fly(0.02, 'L4', 0.002, 0, 10 * lp.PERIOD);
    assert(routh.maxDist >= 0.3 && below.maxDist < 0.3, `mu=0.05 drift ${routh.maxDist}, mu=0.03 drift ${below.maxDist}`);
    return `tadpole swing ${tad.swing.toFixed(0)} deg, mu=0.05 drift ${routh.maxDist.toFixed(2)} vs mu=0.02 ${below.maxDist.toFixed(2)}`;
  },
};
