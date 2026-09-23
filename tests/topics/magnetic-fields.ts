import { assert, close } from '../assert.ts';
import * as mf from '../../src/topics/magnetic-fields/physics.ts';

type Suite = () => string | void;

const DEG = Math.PI / 180;
const speedOf = (p: mf.Particle) => Math.hypot(p.s[3], p.s[4], p.s[5]);

/** Run a mirror or dipole particle; return 'lost' or 'trapped' after the given bounces. */
function fate(f: mf.FieldModel, p: mf.Particle, Btop: number, bounces: number, escaped: (p: mf.Particle) => boolean, maxSteps: number): { fate: string; bounces: number; muDev: number } {
  const v = speedOf(p);
  const bc = new mf.BounceCounter(0.3 * Math.abs(mf.vParallel(p, f)));
  const mu0 = mf.magneticMoment(p, f);
  let muDev = 0;
  // Fixed step, as in the scene: 48 steps per turn at the strongest field on the path.
  const dt = mf.fixedDt(p.qm, Btop, 48);
  for (let i = 0; i < maxSteps; i++) {
    mf.stepFixed(p, f, dt);
    bc.feed(mf.vParallel(p, f));
    muDev = Math.max(muDev, Math.abs(mf.magneticMoment(p, f) / mu0 - 1));
    if (escaped(p)) return { fate: 'lost', bounces: bc.count, muDev };
    if (bc.count >= bounces) return { fate: 'trapped', bounces: bc.count, muDev };
  }
  assert(Math.abs(speedOf(p) / v - 1) < 1e-10, 'speed drifted');
  return { fate: 'timeout', bounces: bc.count, muDev };
}

export const suites: Record<string, Suite> = {
  'magnetic fields: elliptic integrals K(1/2), E(1/2) match tabulated values': () => {
    const o = new Float64Array(2);
    mf.ellipKE(0.5, o);
    close(o[0], 1.8540746773013719, 1e-13, 'K(0.5)');
    close(o[1], 1.3506438810476755, 1e-13, 'E(0.5)');
  },
  'magnetic fields: coil field matches a numerical Biot-Savart sum off axis': () => {
    const a = 2;
    const out = new Float64Array(2);
    const rho = 1.3;
    const z = 0.7;
    mf.loopField(a, 0, rho, z, out);
    // Biot-Savart with mu0 I = pi (so that mu0 I / pi = 1), point at (rho, 0, z).
    const N = 20000;
    let bx = 0;
    let bz = 0;
    for (let i = 0; i < N; i++) {
      const ph = ((i + 0.5) / N) * 2 * Math.PI;
      const dl = [(-Math.sin(ph) * 2 * Math.PI * a) / N, (Math.cos(ph) * 2 * Math.PI * a) / N, 0];
      const r = [rho - a * Math.cos(ph), -a * Math.sin(ph), z];
      const rn = Math.hypot(r[0], r[1], r[2]);
      const c = Math.PI / (4 * Math.PI * rn ** 3);
      bx += c * (dl[1] * r[2] - dl[2] * r[1]);
      bz += c * (dl[0] * r[1] - dl[1] * r[0]);
    }
    close(out[0], bx, 1e-9, 'B_rho');
    close(out[1], bz, 1e-9, 'B_z');
    return `B_rho=${out[0].toFixed(6)}, B_z=${out[1].toFixed(6)}`;
  },
  'magnetic fields: Boris keeps |v| constant to 1e-12 in pure B (uniform, mirror, dipole)': () => {
    const fields: mf.FieldModel[] = [mf.uniformField(1.7), mf.mirrorField(4, 10, 1), mf.dipoleField(6, 3, 1)];
    let worst = 0;
    for (const f of fields) {
      const p = mf.makeParticle(1);
      const gc: [number, number, number] = f.kind === 'dipole' ? [18, 0, 0] : [0, 0, 0];
      mf.launch(p, f, gc, 1, 60 * DEG, 0.3, [1, 0, 0]);
      const v0 = speedOf(p);
      for (let i = 0; i < 100000; i++) mf.step(p, f, 16);
      worst = Math.max(worst, Math.abs(speedOf(p) / v0 - 1));
    }
    assert(worst < 1e-12, `relative speed change ${worst}`);
    return `max |Δv|/v = ${worst.toExponential(1)} after 1e5 steps`;
  },
  'magnetic fields: measured gyroradius and period match m v⊥/(qB) and 2πm/(qB)': () => {
    const B = 2;
    const qm = -0.5; // negative charge gyrates the other way, same radius
    const f = mf.uniformField(B);
    const p = mf.makeParticle(qm);
    const v = 1.8;
    const pitch = 56 * DEG;
    mf.launch(p, f, [0, 0, 0], v, pitch, 0, [1, 0, 0]);
    const meter = new mf.GyroMeter();
    while (meter.cycles < 5) {
      mf.step(p, f, 64);
      meter.feed(p.t, p.s[0], p.s[1], p.s[3], true);
    }
    const r = mf.gyroRadius(v * Math.sin(pitch), qm, B);
    const T = mf.gyroPeriod(qm, B);
    close(meter.radius / r, 1, 3e-3, 'radius ratio');
    close(meter.period / T, 1, 1e-3, 'period ratio');
    return `r ${meter.radius.toFixed(4)} vs ${r.toFixed(4)}, T ${meter.period.toFixed(4)} vs ${T.toFixed(4)}`;
  },
  'magnetic fields: guiding centre drifts at E/B in crossed fields, for either charge': () => {
    const E = 0.3;
    const B = 1.5;
    const f = mf.uniformField(B, E);
    const out: string[] = [];
    for (const qm of [1, -2.5]) {
      const p = mf.makeParticle(qm);
      mf.launch(p, f, [0, 0, 0], 0.9, 90 * DEG, 1.1, [1, 0, 0]);
      const meter = new mf.GyroMeter();
      while (meter.cycles < 8) {
        mf.step(p, f, 40);
        meter.feed(p.t, p.s[0], p.s[1], p.s[3] - E / B, true);
      }
      close(meter.drift, E / B, 1e-3 * (E / B), `drift for q/m=${qm}`);
      out.push(meter.drift.toFixed(6));
    }
    // A particle launched at exactly v = E/B, perpendicular, never gyrates.
    const p = mf.makeParticle(1);
    mf.launch(p, f, [0, 0, 0], E / B, 90 * DEG, 0, [1, 0, 0]);
    for (let i = 0; i < 2000; i++) mf.step(p, f, 40);
    close(p.s[4], 0, 1e-12, 'pure drift v_y');
    close(p.s[3], E / B, 1e-12, 'pure drift v_x');
    return `v_d = ${out.join(', ')} (E/B = ${(E / B).toFixed(6)})`;
  },
  'magnetic fields: mirror reflects above the loss cone and leaks below it': () => {
    const f = mf.mirrorField(4, 10, 1);
    close(f.ratio, 4, 1e-6, 'mirror ratio');
    const lc = f.lossCone;
    close(lc, 30 * DEG, 1e-6, 'loss cone for R=4');
    const out = (p: mf.Particle) => Math.abs(p.s[2]) > 1.5 * f.d;
    const run = (pitch: number) => {
      const p = mf.makeParticle(20); // small gyroradius: adiabatic
      mf.launch(p, f, [0, 0, 0], 1, pitch, 0, [1, 0, 0]);
      return fate(f, p, f.Bmax * 1.05, 4, out, 3_000_000).fate;
    };
    const above = run(lc + 2 * DEG);
    const below = run(lc - 2 * DEG);
    assert(above === 'trapped', `α = lc + 2° gave ${above}`);
    assert(below === 'lost', `α = lc - 2° gave ${below}`);
    return `loss cone ${(lc / DEG).toFixed(2)}°: +2° trapped, −2° lost`;
  },
  'magnetic fields: dipole loss cone sin²α = B_eq/B_foot, checked by launching particles': () => {
    const L = 3;
    const RE = 6;
    const f = mf.dipoleField(RE, L, 20);
    // Field magnitude at the foot point from the field function itself.
    const lam = f.footLat;
    const o = new Float64Array(3);
    f.b(RE * Math.cos(lam), 0, RE * Math.sin(lam), o);
    const ratio = 20 / Math.hypot(o[0], o[1], o[2]);
    close(Math.sin(f.lossCone) ** 2, ratio, 1e-12, 'formula vs field');
    const hit = (p: mf.Particle) => Math.hypot(p.s[0], p.s[1], p.s[2]) < RE;
    const run = (pitch: number) => {
      const p = mf.makeParticle(1);
      mf.launch(p, f, [L * RE, 0, 0], 1, pitch, 0, [1, 0, 0]);
      return fate(f, p, 20 * L ** 3 * Math.sqrt(4 - 3 / L) * 1.05, 3, hit, 3_000_000).fate;
    };
    const above = run(f.lossCone + 1.5 * DEG);
    const below = run(f.lossCone - 1.5 * DEG);
    assert(above === 'trapped', `lc + 1.5° gave ${above}`);
    assert(below === 'lost', `lc − 1.5° gave ${below}`);
    return `L=3 loss cone ${(f.lossCone / DEG).toFixed(2)}°`;
  },
  'magnetic fields: magnetic moment μ = mv⊥²/2B conserved in a slowly varying mirror': () => {
    const f = mf.mirrorField(5, 10, 1);
    const p = mf.makeParticle(20);
    mf.launch(p, f, [0, 0, 0], 1, 50 * DEG, 0, [1, 0, 0]);
    const res = fate(f, p, f.Bmax * 1.05, 4, (q) => Math.abs(q.s[2]) > 1.5 * f.d, 3_000_000);
    assert(res.fate === 'trapped', `particle ${res.fate}`);
    assert(res.muDev < 0.02, `μ deviation ${res.muDev}`);
    return `max |Δμ|/μ = ${res.muDev.toExponential(1)} over 4 bounces`;
  },
};
