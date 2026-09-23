import { assert, close } from '../assert.ts';
import * as qo from '../../src/topics/quantum-oscillator/physics.ts';

type Suite = () => string | void;

const B = new qo.Basis();
const N1 = qo.NMAX + 1;

function stateAt(p: qo.StateParams, t: number) {
  const re0 = new Float64Array(N1), im0 = new Float64Array(N1);
  const re = new Float64Array(N1), im = new Float64Array(N1);
  qo.coefficients(p, B, re0, im0);
  qo.evolveCoeffs(re0, im0, t, re, im);
  const pr = new Float64Array(qo.NX), pi = new Float64Array(qo.NX);
  qo.reconstruct(B, re, im, qo.activeLevels(re, im), pr, pi);
  return { re, im, pr, pi };
}

const base = (o: Partial<qo.StateParams>): qo.StateParams => ({ kind: 'eigen', n: 0, m: 1, alpha: 0, phi: 0, r: 0, ...o });

export const suites: Record<string, Suite> = {
  'quantum oscillator: psi_n (n <= 30) are orthonormal on the grid': () => {
    let worst = 0;
    for (let a = 0; a <= 30; a++) {
      for (let b = a; b <= 30; b++) {
        let s = 0;
        for (let i = 0; i < qo.NX; i++) s += B.tab[a * qo.NX + i] * B.tab[b * qo.NX + i];
        s *= B.dx;
        worst = Math.max(worst, Math.abs(s - (a === b ? 1 : 0)));
      }
    }
    assert(worst < 1e-10, `max |<m|n> - delta| = ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'quantum oscillator: <H> of psi_n by finite differences equals n + 1/2': () => {
    let worst = 0;
    for (let n = 0; n <= 20; n++) {
      const { pr, pi } = stateAt(base({ n }), 0);
      const e = qo.energyFD(B, pr, pi);
      // second-order differences carry a relative error of order (2n+1) h^2 / 12
      close(e, n + 0.5, 1e-3 * (n + 0.5), `E_${n}`);
      worst = Math.max(worst, Math.abs(e - n - 0.5));
    }
    return `max |E - (n+1/2)| = ${worst.toExponential(1)} (h = ${B.dx})`;
  },
  'quantum oscillator: eigenstate density is stationary and psi_n has n nodes': () => {
    const p = base({ n: 7 });
    const a = stateAt(p, 0);
    const b = stateAt(p, 2.3);
    let d = 0;
    for (let i = 0; i < qo.NX; i++) d = Math.max(d, Math.abs(a.pr[i] ** 2 + a.pi[i] ** 2 - b.pr[i] ** 2 - b.pi[i] ** 2));
    assert(d < 1e-12, `density changed by ${d}`);
    const rho = new Float64Array(qo.NX);
    for (let n = 0; n <= 30; n++) {
      for (let i = 0; i < qo.NX; i++) rho[i] = B.tab[n * qo.NX + i] ** 2;
      const k = qo.countNodes(rho, 0, qo.NX);
      assert(k === n, `psi_${n} shows ${k} nodes`);
    }
    return `max density change ${d.toExponential(1)}`;
  },
  'quantum oscillator: coherent state keeps Delta x = 1/sqrt2 and <x>(t) = sqrt2 |alpha| cos(t - phi)': () => {
    const alpha = 2.2, phi = 0.9;
    const p = base({ kind: 'coherent', alpha, phi });
    const m = {} as qo.Moments;
    let worstDx = 0, worstX = 0;
    for (let k = 0; k <= 50; k++) {
      const t = (k / 50) * 5 * 2 * Math.PI; // five periods
      const { re, im, pr, pi } = stateAt(p, t);
      const g = qo.gridStats(B, pr, pi); // grid integral, independent of the ladder formulas
      qo.moments(re, im, m);
      worstDx = Math.max(worstDx, Math.abs(g.dx - Math.SQRT1_2), Math.abs(m.dx - Math.SQRT1_2));
      const xa = Math.SQRT2 * alpha * Math.cos(t - phi);
      worstX = Math.max(worstX, Math.abs(g.x - xa), Math.abs(m.x - xa));
      close(m.p, -Math.SQRT2 * alpha * Math.sin(t - phi), 1e-8, '<p>');
      close(m.dx * m.dp, 0.5, 1e-8, 'minimum uncertainty');
    }
    assert(worstDx < 1e-8, `Delta x drifted by ${worstDx}`);
    assert(worstX < 1e-8, `<x> off by ${worstX}`);
    return `|dDx| ${worstDx.toExponential(1)}, |d<x>| ${worstX.toExponential(1)}`;
  },
  'quantum oscillator: squeezed width breathes at 2 omega, Dx^2 = (e^-2r cos^2 t + e^2r sin^2 t)/2': () => {
    const r = 0.6;
    const p = base({ kind: 'squeezed', r, alpha: 1.5, phi: 0.3 });
    const m = {} as qo.Moments;
    for (const t of [0, 0.4, 1.1, Math.PI / 2, 2.6]) {
      const { re, im } = stateAt(p, t);
      qo.moments(re, im, m);
      const want = Math.sqrt((Math.exp(-2 * r) * Math.cos(t) ** 2 + Math.exp(2 * r) * Math.sin(t) ** 2) / 2);
      close(m.dx, want, 1e-6, `Dx(${t})`);
    }
  },
  'quantum oscillator: Wigner of n = 1 is -1/pi at the origin, Laguerre formula matches quadrature': () => {
    close(qo.wignerFock(1, 0, 0), -1 / Math.PI, 1e-14, 'W_1(0,0)');
    // cross term check against direct quadrature for (|1> + |3>)/sqrt2 after some evolution
    const p = base({ kind: 'super', n: 1, m: 3 });
    const t = 0.9;
    const { pr, pi } = stateAt(p, t);
    let worst = 0;
    for (const [xi, q] of [[600, 0.3], [650, -0.7], [700, 1.1], [540, -1.6]] as const) {
      const wn = qo.wignerNumeric(B, pr, pi, xi, q);
      const wa = qo.wigner(p, t, B.x[xi], q);
      worst = Math.max(worst, Math.abs(wn - wa));
    }
    assert(worst < 1e-8, `Wigner mismatch ${worst}`);
    return `W_1(0,0) = ${qo.wignerFock(1, 0, 0).toFixed(5)}, quadrature error ${worst.toExponential(1)}`;
  },
  'quantum oscillator: psi_20 density matches the classical 1/(pi sqrt(A^2 - x^2)) coarse-grained': () => {
    const rho = new Float64Array(qo.NX);
    for (let i = 0; i < qo.NX; i++) rho[i] = B.tab[20 * qo.NX + i] ** 2;
    const s20 = qo.classicalMatch(B, rho, Math.sqrt(41));
    for (let i = 0; i < qo.NX; i++) rho[i] = B.tab[i] ** 2;
    const s0 = qo.classicalMatch(B, rho, 1);
    assert(s20 > 0.93, `n = 20 match ${s20}`);
    assert(s0 < 0.7, `n = 0 match ${s0}`);
    return `match n=20: ${s20.toFixed(3)}, n=0: ${s0.toFixed(3)}`;
  },
};
