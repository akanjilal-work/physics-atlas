import { assert, close } from '../assert.ts';
import * as dp from '../../src/topics/doppler-effect/physics.ts';

type Suite = () => string | void;
const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'doppler: source and observer formulas (c = 343 m/s)': () => {
    const c = dp.MEDIA.air;
    // Source approaching at c/6 raises pitch by exactly 20 %.
    close(dp.dopplerSource(500, c, c / 6), 600, 1e-9, 'source c/6');
    // Receding source: v_s < 0.
    close(dp.dopplerSource(500, c, -c / 6), 500 * 6 / 7, 1e-9, 'receding source');
    // Observer moving toward a still source at c/5 also gives +20 %.
    close(dp.dopplerObserver(500, c, c / 5), 600, 1e-9, 'observer c/5');
    // Same speed, different shift: source 1/(1−M) versus observer 1+M.
    const M = 0.5;
    close(dp.dopplerSource(1, c, M * c), 2, 1e-12, 'source M=0.5');
    close(dp.dopplerObserver(1, c, M * c), 1.5, 1e-12, 'observer M=0.5');
    // Combined formula reduces to both limits and the angle form at 0°.
    close(dp.doppler(440, c, 20, 30), (440 * (c + 20)) / (c - 30), 1e-9, 'combined');
    close(dp.dopplerAngle(440, c, 20, 30, 1, 1), dp.doppler(440, c, 20, 30), 1e-9, 'angle form at 0°');
    close(dp.dopplerAngle(440, c, 20, 30, 0, 0), 440, 1e-9, 'angle form at 90°');
    return 'source c/6 and observer c/5 both give +20 %';
  },
  'doppler: pass-by approach × recede = f²/(1−M²), and M recovered from the ratio': () => {
    const c = 343;
    const M = 0.3;
    const p: dp.PassBy = { c, vs: M * c, vo: 0, d: 10 };
    const out = new Float64Array(2);
    // Far before and far after closest approach, using the retarded-time solver.
    const T = 2000;
    assert(dp.emissionTimes(p, -T, out) === 1, 'one root before');
    const ra = dp.heardRatio(p, -T, out[0]);
    assert(dp.emissionTimes(p, T, out) === 1, 'one root after');
    const rr = dp.heardRatio(p, T, out[0]);
    close(ra, 1 / (1 - M), 1e-6, 'approach ratio');
    close(rr, 1 / (1 + M), 1e-6, 'recede ratio');
    close(ra * rr, 1 / (1 - M * M), 1e-6, 'product');
    close(dp.machFromRatio(ra / rr), M, 1e-6, 'Mach from ratio');
    // Heard pitch falls monotonically through the pass.
    let prev = Infinity;
    for (let t = -5; t <= 5; t += 0.01) {
      dp.emissionTimes(p, t, out);
      const r = dp.heardRatio(p, t, out[0]);
      assert(r < prev + 1e-12, `pitch rose at t=${t.toFixed(2)}`);
      prev = r;
    }
    return `f_a/f = ${ra.toFixed(4)}, f_r/f = ${rr.toFixed(4)}`;
  },
  'doppler: Mach angle sin α = 1/M, and 30° needs Mach 2': () => {
    close(dp.machAngle(2) / DEG, 30, 1e-9, 'M=2');
    close(dp.machAngle(Math.SQRT2) / DEG, 45, 1e-9, 'M=√2');
    close(dp.machAngle(1) / DEG, 90, 1e-9, 'M=1');
    assert(Number.isNaN(dp.machAngle(0.9)), 'subsonic has no cone');
    close(dp.machForAngle(30 * DEG), 2, 1e-12, 'inverse');
    // Boom time equals the moment the listener lies on the cone surface: tan α = d / (x_src − x_listener).
    const c = 343;
    const p: dp.PassBy = { c, vs: 2 * c, vo: 0, d: 50 };
    const tb = dp.boomTime(p);
    close(Math.atan2(p.d, p.vs * tb) / DEG, 30, 1e-9, 'listener on cone at t_b');
    return `t_boom = ${(tb * 1000).toFixed(1)} ms after closest approach at d = 50 m`;
  },
  'doppler: retarded time at closest approach (f/(1−M²)) and at perpendicular emission (exactly f)': () => {
    const c = 343;
    const out = new Float64Array(2);
    for (const M of [0.1, 0.5, 0.9]) {
      const p: dp.PassBy = { c, vs: M * c, vo: 0, d: 20 };
      // Reception at closest approach: the sound left earlier, at te = −d/√(c² − v²), while approaching.
      assert(dp.emissionTimes(p, 0, out) === 1, 'one root');
      close(out[0], -p.d / Math.sqrt(c * c - p.vs * p.vs), 1e-12, `te at t=0, M=${M}`);
      close(dp.heardRatio(p, 0, out[0]), 1 / (1 - M * M), 1e-9, `f'/f at t=0, M=${M}`);
      // Emission at closest approach: heard at t = d/c with no shift at all.
      const t = p.d / c;
      dp.emissionTimes(p, t, out);
      close(out[0], 0, 1e-12, `te = 0 when t = d/c, M=${M}`);
      close(dp.heardRatio(p, t, out[0]), 1, 1e-12, `f'/f = 1 at perpendicular emission, M=${M}`);
      assert(dp.residual(p, t, out[0]) < 1e-12, 'residual');
    }
    // Check dte/dt numerically against the analytic ratio at an arbitrary moment with a moving listener.
    const p: dp.PassBy = { c, vs: 0.4 * c, vo: 0.2 * c, d: 15 };
    const t = 0.013;
    const h = 1e-6;
    dp.emissionTimes(p, t + h, out);
    const a = out[0];
    dp.emissionTimes(p, t - h, out);
    const b = out[0];
    dp.emissionTimes(p, t, out);
    close((a - b) / (2 * h), dp.heardRatio(p, t, out[0]), 1e-6, 'dte/dt equals heard ratio');
    return 'M = 0.1, 0.5, 0.9 all match';
  },
  'doppler: supersonic has silence, then two roots after the cone passes': () => {
    const c = 343;
    const p: dp.PassBy = { c, vs: 1.5 * c, vo: 0, d: 30 };
    const out = new Float64Array(2);
    const tb = dp.boomTime(p);
    assert(dp.emissionTimes(p, 0, out) === 0, 'silent at closest approach');
    assert(dp.emissionTimes(p, tb * 0.99, out) === 0, 'silent just before boom');
    assert(dp.emissionTimes(p, tb * 1.01, out) === 2, 'two roots just after boom');
    dp.emissionTimes(p, tb * 1.5, out);
    const rNew = dp.heardRatio(p, tb * 1.5, out[0]);
    const rOld = dp.heardRatio(p, tb * 1.5, out[1]);
    assert(rOld < 0, 'older root arrives time-reversed');
    assert(rNew > 0, 'newer root plays forward');
    assert(Number.isFinite(rNew) && Number.isFinite(rOld), 'finite');
    return `after the boom: ${rNew.toFixed(2)} f forward, ${Math.abs(rOld).toFixed(2)} f reversed`;
  },
  'doppler: light is symmetric, sound is not (relativistic = geometric mean)': () => {
    const b = 0.5;
    const light = dp.relativisticDoppler(1, b);
    const src = dp.dopplerSource(1, 1, b);
    const obs = dp.dopplerObserver(1, 1, b);
    close(light, Math.sqrt(3), 1e-12, 'sqrt((1+β)/(1−β)) at β=0.5');
    close(light, Math.sqrt(src * obs), 1e-12, 'geometric mean of the two sound cases');
    close(dp.relativisticDoppler(1, b) * dp.relativisticDoppler(1, -b), 1, 1e-12, 'approach × recede = 1 for light');
    return `light ${light.toFixed(4)}, sound source ${src}, sound observer ${obs}`;
  },
};
