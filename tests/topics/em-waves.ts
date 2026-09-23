import { assert, close } from '../assert.ts';
import * as em from '../../src/topics/em-waves/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'em waves: c = 1/sqrt(mu0 eps0) from CODATA 2022 gives 299792458 m/s': () => {
    const c = em.cFromConstants();
    const rel = Math.abs(c - 299792458) / 299792458;
    assert(rel < 1e-6, `relative error ${rel}`);
    return `c = ${c.toFixed(3)} m/s, rel err ${rel.toExponential(1)}`;
  },

  'em waves: E ⊥ B ⊥ k and |B| = |E|/c for linear, elliptical and circular waves': () => {
    const E = new Float64Array(3);
    const B = new Float64Array(3);
    const S = new Float64Array(3);
    const k = [0, 0, 1];
    let worst = 0;
    for (const [ratio, delta] of [[0, 0], [1, 0], [0.4, 1.1], [1, Math.PI / 2], [2.5, -2]]) {
      const p = em.polFromRatio(800, ratio, delta);
      for (let i = 0; i < 50; i++) {
        em.planeE(p, 2 * Math.PI / 5e-7, 3.7e15, i * 1.3e-8, i * 2.1e-17, E);
        em.planeBFromE(E, B);
        const e = Math.hypot(E[0], E[1], E[2]);
        if (e < 1e-6) continue;
        const b = Math.hypot(B[0], B[1], B[2]);
        worst = Math.max(worst, Math.abs(em.dot(E, B)) / (e * b), Math.abs(em.dot(E, k)) / e, Math.abs(em.dot(B, k)) / b);
        close(b * em.C / e, 1, 1e-12, '|B|c/|E|');
        em.poynting(E, B, S);
        // S points along k with magnitude |E|²/(μ0 c)
        close(S[2], (e * e) / (em.MU0 * em.C), 1e-9 * S[2], 'S along k');
        assert(Math.abs(S[0]) + Math.abs(S[1]) < 1e-9 * S[2], 'S has transverse part');
      }
    }
    assert(worst < 1e-12, `worst normalized dot product ${worst}`);
    return `max |cos| = ${worst.toExponential(1)}`;
  },

  "em waves: Malus's law I = I0 cos²θ, and circular light passes half": () => {
    for (const psiDeg of [0, 20, 45, 73]) {
      const psi = (psiDeg * Math.PI) / 180;
      const p = em.polFromRatio(1, Math.tan(psi), 0);
      for (let th = 0; th <= Math.PI; th += 0.05) close(em.polarizerTransmission(p, th), em.malus(th - psi), 1e-12, `psi=${psiDeg}`);
    }
    // Brute-force time average of (E·p̂)² agrees with the closed form for elliptical light
    const p = em.polFromRatio(1, 0.7, 0.9);
    const E = new Float64Array(3);
    const th = 0.6;
    let num = 0;
    let den = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      em.planeE(p, 1, 1, 0, (2 * Math.PI * i) / N, E);
      const proj = E[0] * Math.cos(th) + E[1] * Math.sin(th);
      num += proj * proj;
      den += E[0] * E[0] + E[1] * E[1];
    }
    close(em.polarizerTransmission(p, th), num / den, 1e-9, 'elliptical average');
    const circ = em.polFromRatio(1, 1, Math.PI / 2);
    close(em.polarizerTransmission(circ, 1.234), 0.5, 1e-12, 'circular');
    assert(em.polKind(circ) === 'circular' && em.polKind(em.polFromRatio(1, 0.3, 0)) === 'linear', 'kind');
    return 'cos² law holds to 1e-12';
  },

  'em waves: dipole sin²θ pattern integrates to the Larmor power': () => {
    const q = 1.602176634e-19;
    const d0 = 1e-10;
    const omega = 2 * Math.PI * 5.45e14;
    const P = em.integrateSphere((th) => em.dipoleDPdOmega(q * d0, omega, th), 400);
    const L = em.larmorDipoleMean(q, d0, omega);
    close(P / L, 1, 1e-8, 'P / P_Larmor');
    // and the time average of the instantaneous Larmor formula matches too
    let s = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) s += em.larmor(q, omega * omega * d0 * Math.cos((2 * Math.PI * i) / N));
    close(s / N / L, 1, 1e-12, '<Larmor(a(t))>');
    return `P = ${P.toExponential(3)} W, ratio ${(P / L).toFixed(10)}`;
  },

  'em waves: dipole field lines are contours of Q, and the far field is E = q a sinθ/(4πε0c²r)': () => {
    const out = new Float64Array(2);
    const h = 1e-6;
    let worst = 0;
    for (const [x, th, wt] of [[0.7, 0.4, 0.2], [2.3, 1.2, 1.7], [6.1, 2.5, 4.0], [11, 0.9, 2.2]]) {
      const Q = (xx: number, tt: number) => em.dipoleQ(xx, Math.sin(tt) ** 2, wt);
      const dQdth = (Q(x, th + h) - Q(x, th - h)) / (2 * h);
      const dQdx = (Q(x + h, th) - Q(x - h, th)) / (2 * h);
      const Er = dQdth / (x * x * Math.sin(th));
      const Et = -dQdx / (x * Math.sin(th));
      em.dipoleE(x, Math.cos(th), Math.sin(th), wt, out);
      worst = Math.max(worst, Math.abs(Er - out[0]), Math.abs(Et - out[1]));
    }
    assert(worst < 1e-6, `flux function mismatch ${worst}`);
    // Far zone: E_θ amplitude × p0k³/(4πε0) equals the radiation formula with a = ω² d0
    const q = 1e-9;
    const d0 = 1e-3;
    const lam = 3;
    const k = (2 * Math.PI) / lam;
    const omega = k * em.C;
    const r = 5000 * lam;
    const th = 1.1;
    const x = k * r;
    let peak = 0;
    for (let i = 0; i < 400; i++) {
      em.dipoleE(x, Math.cos(th), Math.sin(th), (2 * Math.PI * i) / 400, out);
      peak = Math.max(peak, Math.abs(out[1]));
    }
    const Esi = (peak * q * d0 * k ** 3) / (4 * Math.PI * em.EPS0);
    const Erad = em.radiationE(q, omega * omega * d0, r, th);
    close(Esi / Erad, 1, 1e-4, 'far-field E vs q a sinθ/(4πε0c²r)');
    return `Q-gradient error ${worst.toExponential(1)}`;
  },

  "em waves: kink shell reproduces Purcell's E⊥/Er = a r sinθ / c²": () => {
    const k: em.KinkParams = { beta: 0.01, tStop: 0, tau: 0.001, c: 1 };
    const out = new Float64Array(8);
    for (const psi0Deg of [90, 50]) {
      const psi0 = (psi0Deg * Math.PI) / 180;
      const t = 10;
      const n = em.kinkLine(k, t, psi0, 50, out);
      assert(n === 4, `expected 4 points, got ${n}`);
      const ix = out[2], iy = out[3], ox = out[4], oy = out[5];
      const mx = (ix + ox) / 2, my = (iy + oy) / 2;
      const r = Math.hypot(mx, my);
      const dx = ox - ix, dy = oy - iy;
      const rad = (dx * mx + dy * my) / r;
      const tan = Math.abs(dx * my - dy * mx) / r;
      const expected = em.kinkFieldRatio(k, r, Math.atan2(my, mx));
      close(tan / rad / expected, 1, 0.02, `psi0=${psi0Deg}`);
    }
    // Outside the shell the line points back to the extrapolated position x = v t
    const k2: em.KinkParams = { beta: 0.6, tStop: 1, tau: 0.2, c: 1 };
    const n = em.kinkLine(k2, 4, 1.0, 20, out);
    const ox = out[2 * n - 4], oy = out[2 * n - 3], fx = out[2 * n - 2], fy = out[2 * n - 1];
    const xExt = 0.6 * 3;
    const cr = (ox - xExt) * (fy - oy) - oy * (fx - ox);
    close(cr, 0, 1e-9, 'outer line through extrapolated charge');
    return 'kink slope matches to 2%';
  },
};
