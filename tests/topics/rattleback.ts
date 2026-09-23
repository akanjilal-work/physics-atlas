import { assert, close } from '../assert.ts';
import * as rb from '../../src/topics/rattleback/physics.ts';

type Suite = () => string | void;

// The shape used by the scene at its default settings: a/b = 5, b = c = 2 cm, 200 g.
const base = (delta: number, mu = 0): rb.RBParams => ({ ...rb.DEFAULT, a: 0.1, b: 0.02, c: 0.02, delta, mu });
const DELTA = (6 * Math.PI) / 180;

export const suites: Record<string, Suite> = {
  'rattleback: energy conserved with friction off (20 s, spin reversal included)': () => {
    const body = rb.makeBody(base(DELTA));
    const s = rb.initialState(body, -4, 0.01, 0.01, rb.newState());
    const it = new rb.Integrator(body);
    const e0 = rb.energy(body, s);
    const ex = e0 - body.p.m * body.p.g * body.h0; // energy above rest
    let worst = 0;
    for (let i = 0; i < 40000; i++) {
      it.step(s, 5e-4);
      if (i % 100 === 0) worst = Math.max(worst, Math.abs(rb.energy(body, s) - e0) / ex);
    }
    assert(Math.sign(rb.spin(s)) > 0, 'expected the spin to have reversed within 20 s');
    assert(worst < 1e-7, `energy drift ${worst}`);
    return `max drift ${worst.toExponential(1)} of the excess energy`;
  },
  'rattleback: delta = 0 gives no reversal either way, and zero growth rates': () => {
    const body = rb.makeBody(base(0));
    const out: string[] = [];
    for (const n0 of [4, -4]) {
      const r = rb.reversalTime(body, n0, 0.01, 0.01, 30);
      assert(!Number.isFinite(r.t), `reversed at ${r.t} for n0=${n0}`);
      out.push(`n0=${n0}: min|n|=${Math.min(Math.abs(r.minSpin), Math.abs(r.maxSpin)).toFixed(3)}`);
    }
    const g = rb.growthRates(body, 4);
    assert(Math.abs(g.pitch) < 1e-6 && Math.abs(g.roll) < 1e-6, `rates ${g.pitch} ${g.roll}`);
    return out.join(', ');
  },
  'rattleback: preferred direction flips with the sign of delta': () => {
    const res: string[] = [];
    for (const d of [DELTA, -DELTA]) {
      const body = rb.makeBody(base(d));
      const wrong = rb.reversalTime(body, -4 * Math.sign(d), 0.01, 0.01, 8);
      const right = rb.reversalTime(body, 4 * Math.sign(d), 0.01, 0.01, 8);
      assert(Number.isFinite(wrong.t), `delta ${d}: wrong-way spin did not reverse`);
      assert(!Number.isFinite(right.t), `delta ${d}: right-way spin reversed at ${right.t}`);
      res.push(`δ=${d > 0 ? '+' : '−'}6°: wrong way reverses at ${wrong.t.toFixed(2)} s`);
    }
    // Mirror symmetry of the linearized rates: (n, delta) <-> (-n, -delta).
    const gp = rb.growthRates(rb.makeBody(base(DELTA)), 3);
    const gm = rb.growthRates(rb.makeBody(base(-DELTA)), -3);
    close(gp.pitch, gm.pitch, 1e-6, 'mirror pitch rate');
    close(gp.roll, gm.roll, 1e-6, 'mirror roll rate');
    return res.join(', ');
  },
  'rattleback: rolling constraint holds (integrated height matches attitude, contact at rest)': () => {
    const body = rb.makeBody(base(DELTA));
    const s = rb.initialState(body, -4, 0.8, 0.3, rb.newState());
    const it = new rb.Integrator(body);
    const h = 5e-4;
    let worstZ = 0;
    let worstSlip = 0;
    const r = [0, 0, 0], up = [0, 0, 0], p0 = [0, 0, 0], p1 = [0, 0, 0], w = [0, 0, 0];
    const cp = (st: Float64Array, bodyPt: number[], out: number[]) => {
      rb.toWorld(st, bodyPt[0], bodyPt[1], bodyPt[2], out);
      out[0] += st[7]; out[1] += st[8]; out[2] += st[9];
    };
    for (let i = 0; i < 20000; i++) {
      // Material point currently at the contact: its velocity must vanish.
      rb.upInBody(s, up);
      rb.contactVec(body, up[0], up[1], up[2], r);
      cp(s, r, p0);
      const s1 = Float64Array.from(s);
      it.step(s1, 1e-6);
      cp(s1, r, p1);
      const slip = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) / 1e-6;
      rb.toWorld(s, s[0], s[1], s[2], w);
      const scale = Math.hypot(w[0], w[1], w[2]) * Math.hypot(r[0], r[1], r[2]);
      worstSlip = Math.max(worstSlip, slip / scale);
      it.step(s, h);
      worstZ = Math.max(worstZ, Math.abs(s[9] - rb.heightFromAttitude(body, s)));
    }
    assert(worstZ < 1e-9, `height mismatch ${worstZ} m`);
    assert(worstSlip < 1e-4, `relative contact speed ${worstSlip}`);
    return `height error ${worstZ.toExponential(1)} m, contact speed / (ω r) ${worstSlip.toExponential(1)}`;
  },
  'rattleback: rest frequencies of the linearization match det(K - w^2 J) = 0': () => {
    const body = rb.makeBody(base(DELTA));
    const f = rb.restFrequencies(body);
    const ev = rb.eig4(rb.linearize(body, 0));
    const ims = ev.map((e) => Math.abs(e.im)).sort((a, b) => a - b);
    close(ims[3], Math.max(f.pitch, f.roll), 1e-4 * f.pitch, 'pitch frequency');
    close(ims[0], Math.min(f.pitch, f.roll), 1e-4 * f.roll, 'roll frequency');
    for (const e of ev) assert(Math.abs(e.re) < 1e-6, `nonzero real part ${e.re} at n = 0`);
    return `ω_P=${f.pitch.toFixed(2)}, ω_R=${f.roll.toFixed(2)} rad/s`;
  },
  'rattleback: sigma_P / sigma_R = -lambda (Moffatt and Tokieda 2008), rates linear in n': () => {
    const body = rb.makeBody(base(DELTA));
    const f = rb.restFrequencies(body);
    const lambda = (f.pitch / f.roll) ** 2;
    const g1 = rb.growthRates(body, 0.5);
    const g2 = rb.growthRates(body, 1);
    const ratio = g1.pitch / g1.roll;
    close(ratio / -lambda, 1, 0.08, 'sigma_P/sigma_R vs -lambda');
    close(g2.pitch / g1.pitch, 2, 0.02, 'linear in n');
    assert(g1.pitch < 0 && g1.roll > 0, 'for delta > 0 and n > 0 pitch should decay and roll grow');
    return `ratio ${ratio.toFixed(2)}, −λ = ${(-lambda).toFixed(2)}`;
  },
  'rattleback: tap from rest spins it the preferred way, friction removes energy': () => {
    const body = rb.makeBody(base(DELTA, 3e-5));
    const s = rb.initialState(body, 0, 1.5, 0, rb.newState());
    const it = new rb.Integrator(body);
    const e0 = rb.energy(body, s);
    let maxSpin = -Infinity;
    for (let i = 0; i < 8000; i++) {
      it.step(s, 5e-4);
      maxSpin = Math.max(maxSpin, rb.spin(s));
    }
    assert(maxSpin > 0.5, `max spin ${maxSpin}`);
    assert(rb.energy(body, s) < e0, 'energy should fall with friction on');
    return `peak spin ${maxSpin.toFixed(2)} rad/s (counterclockwise)`;
  },
};
