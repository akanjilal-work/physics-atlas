import { assert, close } from '../assert.ts';
import * as gy from '../../src/topics/gyroscope/physics.ts';

type Suite = () => string | void;

const DEG = Math.PI / 180;

/** Integrate from an initial state, calling visit after every step. */
function run(p: gy.TopParams, s: gy.State, h: number, tEnd: number, visit?: (s: gy.State, t: number) => void, renorm = true): gy.State {
  const integ = new gy.Integrator(p);
  integ.renormalize = renorm;
  const n = Math.round(tEnd / h);
  for (let k = 1; k <= n; k++) {
    integ.step(s, h);
    visit?.(s, k * h);
  }
  return s;
}

/** Unwrapped mean azimuth rate of the axle over the run. */
function meanPrecession(p: gy.TopParams, theta: number, phiDot: number, w3: number, tEnd: number, h: number): number {
  const s = gy.initialState(theta, phiDot, w3, gy.newState());
  const e: gy.Vec3 = [0, 0, 0];
  let prev = 0;
  let total = 0;
  run(p, s, h, tEnd, (st) => {
    gy.axleWorld(st, e);
    const a = Math.atan2(e[0], -e[1]);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    prev = a;
  });
  return total / tEnd;
}

export const suites: Record<string, Suite> = {
  'gyroscope: energy, L_z and L_3 conserved over 20 s of cusp nutation (RK4, h=0.1ms)': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const s = gy.initialState(70 * DEG, 0, 120, gy.newState());
    const e0 = gy.energy(p, s);
    const lz0 = gy.Lz(p, s);
    const l30 = gy.L3(p, s);
    let depth = 0;
    run(p, s, 1e-4, 20, (st) => { depth = Math.max(depth, gy.tilt(st) - 70 * DEG); });
    // Scale for relative errors: the kinetic energy and |L| are the natural sizes.
    const eScale = 0.5 * p.I3 * 120 * 120;
    const dE = Math.abs(gy.energy(p, s) - e0) / eScale;
    const dLz = Math.abs(gy.Lz(p, s) - lz0) / l30;
    const dL3 = Math.abs(gy.L3(p, s) - l30) / l30;
    assert(depth > 3 * DEG, `expected visible nutation, depth ${depth / DEG} deg`);
    assert(dE < 1e-9, `energy drift ${dE}`);
    assert(dLz < 1e-9, `L_z drift ${dLz}`);
    assert(dL3 < 1e-12, `L_3 drift ${dL3}`);
    return `dE ${dE.toExponential(1)}, dLz ${dLz.toExponential(1)}, nutation ${(depth / DEG).toFixed(1)}°`;
  },
  'gyroscope: fast-top precession matches mgl/(I3 w3) within 2% (cusp start, w3 = 400 rad/s)': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const w3 = 400;
    const pred = gy.fastPrecession(p, w3);
    const meas = meanPrecession(p, 90 * DEG, 0, w3, 8, 1e-4);
    const err = Math.abs(meas / pred - 1);
    assert(err < 0.02, `measured ${meas}, predicted ${pred}, error ${err}`);
    // Doubling the spin halves the precession.
    const meas2 = meanPrecession(p, 90 * DEG, 0, 2 * w3, 8, 5e-5);
    close(meas2 / meas, 0.5, 0.01, 'precession ratio when spin doubles');
    return `Ω ${meas.toFixed(4)} vs ${pred.toFixed(4)} rad/s (${(err * 100).toFixed(2)}%), ratio at 2ω ${(meas2 / meas).toFixed(4)}`;
  },
  'gyroscope: exact steady precession gives no nutation (theta = 60°, w3 = 90 rad/s)': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const th = 60 * DEG;
    const phiDot = gy.steadyPrecession(p, 90, th);
    const s = gy.initialState(th, phiDot, 90, gy.newState());
    let dev = 0;
    let rate = 0;
    run(p, s, 1e-4, 5, (st) => { dev = Math.max(dev, Math.abs(gy.tilt(st) - th)); rate = gy.precessionRate(st); });
    assert(dev < 1e-6, `tilt wandered by ${dev} rad`);
    close(rate, phiDot, 1e-6 * phiDot, 'instantaneous precession rate');
    return `φ̇ = ${phiDot.toFixed(4)} rad/s, max tilt change ${dev.toExponential(1)} rad`;
  },
  'gyroscope: sleeping-top threshold w3^2 = 4 I1 m g l / I3^2': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const wc = gy.sleepingThreshold(p);
    close(wc * wc, (4 * p.I1 * p.m * p.g * p.l) / (p.I3 * p.I3), 1e-9 * wc * wc, 'threshold formula');
    const th0 = 0.5 * DEG;
    const maxTilt = (w3: number, tEnd: number) => {
      let mx = 0;
      run(p, gy.initialState(th0, 0, w3, gy.newState()), 1e-4, tEnd, (st) => { mx = Math.max(mx, gy.tilt(st)); });
      return mx;
    };
    // Above threshold the linear theory gives max tilt / initial tilt = a / b,
    // with a = I3 w3 / (2 I1) and b = sqrt(a^2 - m g l / I1).
    const w3 = 1.2 * wc;
    const a = (p.I3 * w3) / (2 * p.I1);
    const b = Math.sqrt(a * a - (p.m * p.g * p.l) / p.I1);
    const ratio = maxTilt(w3, 3) / th0;
    close(ratio, a / b, 0.02 * (a / b), 'bounded wobble amplitude above threshold');
    // Just below threshold the upright top falls into a wide wobble (L_z conservation stops it short of flat).
    const fell = maxTilt(0.9 * wc, 6);
    assert(fell > 30 * DEG, `below threshold the top should fall, max tilt ${fell / DEG}°`);
    // Just above threshold it stays close to upright.
    const stays = maxTilt(1.1 * wc, 6);
    assert(stays < 5 * th0, `above threshold the top should sleep, max tilt ${stays / DEG}°`);
    return `ω_c = ${wc.toFixed(1)} rad/s, wobble ratio ${ratio.toFixed(3)} vs ${(a / b).toFixed(3)}, 0.9ω_c reaches ${(fell / DEG).toFixed(0)}°`;
  },
  'gyroscope: quaternion stays unit norm without renormalization (20 s, w3 = 300 rad/s)': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const s = gy.initialState(80 * DEG, -2, 300, gy.newState());
    let worst = 0;
    run(p, s, 1e-4, 20, (st) => { worst = Math.max(worst, Math.abs(Math.hypot(st[3], st[4], st[5], st[6]) - 1)); }, false);
    assert(worst < 5e-8, `norm drift ${worst}`);
    return `max | |q| - 1 | = ${worst.toExponential(1)}`;
  },
  'gyroscope: nutation frequency approaches I3 w3 / I1 at high spin': () => {
    const p = gy.wheelParams(0.2, 0.05, 9.81);
    const w3 = 300;
    const s = gy.initialState(90 * DEG, 0, w3, gy.newState());
    // Count successive minima of the tilt (cusp tops).
    const tops: number[] = [];
    let a = gy.tilt(s), b = a;
    run(p, s, 2e-5, 1, (st, t) => {
      const c = gy.tilt(st);
      if (b < a && b <= c && t > 1e-3) tops.push(t);
      a = b;
      b = c;
    });
    const period = (tops[tops.length - 1] - tops[0]) / (tops.length - 1);
    const pred = (2 * Math.PI) / gy.nutationRate(p, w3);
    close(period, pred, 0.02 * pred, 'nutation period');
    return `T_nut ${(period * 1000).toFixed(2)} ms vs ${(pred * 1000).toFixed(2)} ms`;
  },
};
