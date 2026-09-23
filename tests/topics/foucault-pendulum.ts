import { assert, close } from '../assert.ts';
import * as fp from '../../src/topics/foucault-pendulum/physics.ts';

type Suite = () => string | void;
const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'foucault: Paris period 23.934 h / sin(48.85°) ≈ 31.8 h, and 2π/Ω is one sidereal day': () => {
    const T = fp.precessionPeriodHours(48.85);
    close(T, 31.8, 0.05, 'Paris period (h)');
    close((2 * Math.PI) / fp.OMEGA_EARTH / 3600, fp.SIDEREAL_HOURS, 1e-3, 'sidereal day (h)');
    close(fp.swingPeriod(67), 16.4, 0.05, 'Panthéon swing period (s)');
    return `T_Paris=${T.toFixed(2)} h`;
  },
  'foucault: small-amplitude precession at Paris (real Ω) matches Ω sin φ within 1%': () => {
    const p = { L: 67, g: fp.G, latDeg: 48.85, omega: fp.OMEGA_EARTH };
    const { rate, sim } = fp.measureRate(p, 1 * DEG, 6 * 3600, 0.05);
    const pred = fp.precessionRate(p.omega, p.latDeg);
    const err = Math.abs(rate / pred - 1);
    assert(err < 0.01, `measured ${rate}, predicted ${pred}, error ${err}`);
    const Tmeas = (2 * Math.PI) / Math.abs(rate) / 3600;
    return `rel err ${err.toExponential(1)}, measured period ${Tmeas.toFixed(2)} h after ${(sim.t / 3600).toFixed(0)} h`;
  },
  'foucault: small-amplitude rate with exaggerated Ω (×100, φ=30°) matches Ω sin φ within 1%': () => {
    const p = { L: 5, g: fp.G, latDeg: 30, omega: 100 * fp.OMEGA_EARTH };
    const { rate } = fp.measureRate(p, 1 * DEG, 1500, 0.01);
    const pred = fp.precessionRate(p.omega, p.latDeg);
    const err = Math.abs(rate / pred - 1);
    assert(err < 0.01, `measured ${rate}, predicted ${pred}`);
    return `rel err ${err.toExponential(1)}`;
  },
  'foucault: no precession at the equator (released toward north-east)': () => {
    const p = { L: 67, g: fp.G, latDeg: 0, omega: fp.OMEGA_EARTH };
    const { rate } = fp.measureRate(p, 3 * DEG, 12 * 3600, 0.1, Math.PI / 4);
    const ref = p.omega * Math.sin(48.85 * DEG);
    assert(Math.abs(rate) < 1e-3 * ref, `equator rate ${rate}`);
    return `|rate| = ${(Math.abs(rate) / ref).toExponential(1)} of the Paris rate over 12 h`;
  },
  'foucault: sign reverses in the south (clockwise north, counterclockwise south)': () => {
    const base = { L: 30, g: fp.G, omega: 300 * fp.OMEGA_EARTH };
    const n = fp.measureRate({ ...base, latDeg: 40 }, 2 * DEG, 600, 0.02).rate;
    const s = fp.measureRate({ ...base, latDeg: -40 }, 2 * DEG, 600, 0.02).rate;
    assert(n < 0 && s > 0, `north ${n}, south ${s}`);
    close(s / -n, 1, 0.01, 'south/north magnitude');
    return `north ${n.toExponential(2)}, south ${s.toExponential(2)} rad/s`;
  },
  'foucault: Jacobi integral conserved in the rotating frame (20° swing, Ω×1000)': () => {
    const sim = new fp.FoucaultSim({ L: 10, g: fp.G, latDeg: 60, omega: 1000 * fp.OMEGA_EARTH });
    sim.release(20 * DEG, 0.3);
    const j0 = sim.jacobi();
    const scale = fp.G * 10;
    let worst = 0;
    for (let i = 0; i < 100000; i++) {
      sim.step(0.01);
      if (i % 100 === 0) worst = Math.max(worst, Math.abs(sim.jacobi() - j0) / scale);
    }
    const r = Math.hypot(sim.s[0], sim.s[1], sim.s[2]);
    assert(worst < 1e-8, `Jacobi drift ${worst}`);
    close(r, 10, 1e-6, 'wire length');
    return `drift ${worst.toExponential(1)} over ${sim.t.toFixed(0)} s`;
  },
};
