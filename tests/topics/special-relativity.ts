import { assert, close } from '../assert.ts';
import * as sr from '../../src/topics/special-relativity/physics.ts';

type Suite = () => string | void;

// Small deterministic generator so the checks are repeatable.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const suites: Record<string, Suite> = {
  'special relativity: γ at known β (0, 0.6, 0.8, 0.866, 0.99)': () => {
    close(sr.gamma(0), 1, 1e-15, 'γ(0)');
    close(sr.gamma(0.6), 1.25, 1e-12, 'γ(0.6)');
    close(sr.gamma(0.8), 5 / 3, 1e-12, 'γ(0.8)');
    close(sr.gamma(Math.sqrt(3) / 2), 2, 1e-12, 'γ(√3/2)');
    close(sr.gamma(0.99), 7.088812050083354, 1e-12, 'γ(0.99)');
    close(sr.contraction(0.8), 0.6, 1e-12, 'L/L0 at 0.8');
    return 'γ(0.8)=5/3, γ(0.99)=7.0888';
  },
  'special relativity: interval invariant under boosts to 1e-12': () => {
    const r = rng(7);
    const e = sr.event();
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const t = (r() - 0.5) * 10;
      const x = (r() - 0.5) * 10;
      const y = (r() - 0.5) * 10;
      const beta = (r() - 0.5) * 1.98;
      sr.boost(t, x, y, beta, e);
      const s0 = sr.interval(t, x, y);
      const s1 = sr.interval(e.t, e.x, e.y);
      const scale = Math.max(1, t * t + x * x + y * y);
      worst = Math.max(worst, Math.abs(s1 - s0) / scale);
    }
    assert(worst < 1e-12, `worst relative change ${worst}`);
    return `worst ${worst.toExponential(1)}`;
  },
  'special relativity: inverse boost undoes boost': () => {
    const a = sr.boost(1.3, -0.7, 0.4, 0.73);
    const b = sr.inverseBoost(a.t, a.x, a.y, 0.73);
    close(b.t, 1.3, 1e-12, 't');
    close(b.x, -0.7, 1e-12, 'x');
    close(b.y, 0.4, 1e-12, 'y');
  },
  'special relativity: boost composition equals velocity addition': () => {
    const pairs: [number, number][] = [[0.5, 0.5], [0.9, 0.9], [0.3, -0.8], [0.99, 0.6]];
    let worst = 0;
    for (const [u, v] of pairs) {
      const composed = sr.matMul3(sr.boostMatrix(v), sr.boostMatrix(u));
      const direct = sr.boostMatrix(sr.addVelocities(u, v));
      for (let k = 0; k < 9; k++) worst = Math.max(worst, Math.abs(composed[k] - direct[k]));
      close(sr.rapidity(sr.addVelocities(u, v)), sr.rapidity(u) + sr.rapidity(v), 1e-12, 'rapidities add');
    }
    assert(worst < 1e-12, `matrix mismatch ${worst}`);
    close(sr.addVelocities(0.5, 0.5), 0.8, 1e-15, '0.5 ⊕ 0.5');
    return `0.5 ⊕ 0.5 = 0.8, 0.9 ⊕ 0.9 = ${sr.addVelocities(0.9, 0.9).toFixed(4)}`;
  },
  'special relativity: light-like events stay light-like, light speed stays 1': () => {
    const e = sr.event();
    for (const beta of [-0.95, -0.3, 0.2, 0.7, 0.999]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI;
        sr.boost(2, 2 * Math.cos(a), 2 * Math.sin(a), beta, e);
        const s = sr.interval(e.t, e.x, e.y);
        assert(Math.abs(s) < 1e-11 * Math.max(1, e.t * e.t), `β=${beta} angle ${k}: s²=${s}`);
      }
      close(sr.addVelocities(1, beta), 1, 1e-15, 'c ⊕ v');
    }
  },
  'special relativity: proper time and simultaneity gap': () => {
    const beta = 0.6;
    const g = sr.gamma(beta);
    // Straight worldline to (t, βt): τ = t/γ.
    const tau = sr.properTime([sr.event(0, 0, 0), sr.event(5, 3, 0)]);
    close(tau, 4, 1e-12, 'τ for straight line');
    close(sr.properTimeInertial(5, beta), 4, 1e-12, 'τ inertial');
    // Two strikes at x = ±L, t = 0. Direct boost and the formula must agree.
    const L = 2;
    const front = sr.boost(0, L, 0, beta);
    const rear = sr.boost(0, -L, 0, beta);
    close(front.t - rear.t, sr.simultaneityGap(2 * L, beta), 1e-12, 'gap');
    close(rear.t - front.t, 2 * g * beta * L, 1e-12, 'gap magnitude');
    // Every event on the simultaneity plane has the same t'.
    for (const x of [-3, 0, 1.7]) {
      const ev = sr.boost(sr.simultaneityT(x, beta, 1.5), x, 9, beta);
      close(ev.t, 1.5, 1e-12, `plane at x=${x}`);
    }
    return `front leads rear by ${(rear.t - front.t).toFixed(2)} s at β=0.6`;
  },
};
