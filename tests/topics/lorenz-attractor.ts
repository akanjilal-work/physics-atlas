import { assert, close } from '../assert.ts';
import * as L from '../../src/topics/lorenz-attractor/physics.ts';

type Suite = () => string | void;

const C = L.CLASSIC;
const withRho = (rho: number): L.LorenzParams => ({ ...C, rho });

export const suites: Record<string, Suite> = {
  'lorenz: fixed points match (0,0,0) and (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1) and zero the field': () => {
    const out = new Float64Array(3);
    let worst = 0;
    for (const rho of [0.5, 1.5, 13, 28, 99.96, 160]) {
      const p = withRho(rho);
      const fp = L.fixedPoints(p);
      assert(fp.length === (rho > 1 ? 3 : 1), `wrong count at ρ=${rho}`);
      for (const [x, y, z] of fp) {
        L.deriv(x, y, z, p, out);
        worst = Math.max(worst, Math.abs(out[0]), Math.abs(out[1]), Math.abs(out[2]));
      }
    }
    // Classic C+: √(8/3 · 27) = √72 = 6√2.
    const cp = L.fixedPoints(C)[1];
    close(cp[0], 6 * Math.SQRT2, 1e-12, 'C+ x at ρ=28');
    close(cp[2], 27, 1e-12, 'C+ z at ρ=28');
    assert(worst < 1e-10, `residual ${worst}`);
    return `C+ = (${cp[0].toFixed(4)}, ${cp[1].toFixed(4)}, 27), max |f| ${worst.toExponential(1)}`;
  },
  'lorenz: Jacobian eigenvalues put origin pitchfork at ρ=1 and Hopf at ρ_H = σ(σ+β+3)/(σ−β−1) ≈ 24.7368': () => {
    // Origin: stable just below ρ = 1, unstable just above.
    const o: L.Vec3 = [0, 0, 0];
    assert(L.maxRealEig(o, withRho(0.99)) < 0, 'origin should be stable at ρ=0.99');
    assert(L.maxRealEig(o, withRho(1.01)) > 0, 'origin should be unstable at ρ=1.01');
    // Analytic origin eigenvalue: λ = [−(σ+1) + √((σ+1)² + 4σ(ρ−1))]/2.
    const lam28 = (-(11) + Math.sqrt(121 + 4 * 10 * 27)) / 2;
    close(L.maxRealEig(o, C), lam28, 1e-9, 'origin unstable eigenvalue at ρ=28');
    // C±: bisect the sign change of the largest real part and compare with the closed form.
    const re = (rho: number) => L.maxRealEig(L.fixedPoints(withRho(rho))[1], withRho(rho));
    let lo = 2;
    let hi = 40;
    assert(re(lo) < 0 && re(hi) > 0, 'no sign change for C+');
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (lo + hi);
      if (re(m) < 0) lo = m;
      else hi = m;
    }
    const rH = L.hopfRho(10, 8 / 3);
    close(rH, 470 / 19, 1e-12, 'closed form 470/19');
    close(lo, rH, 1e-8, 'Hopf ρ from eigenvalues');
    // At the Hopf point the crossing pair is purely imaginary with ω² = β(σ+ρ_H).
    const ev = L.eigen3(L.jacobian(...L.fixedPoints(withRho(rH))[1], withRho(rH)));
    const w = Math.max(...ev.map((e) => Math.abs(e.im)));
    close(w * w, (8 / 3) * (10 + rH), 1e-6, 'Hopf frequency²');
    return `ρ_H = ${lo.toFixed(6)} (formula ${rH.toFixed(6)})`;
  },
  'lorenz: largest Lyapunov exponent by renormalized twin falls in [0.85, 0.96] (published 0.9056)': () => {
    const lam = L.lyapunov(C, 1000, L.H, [1, 1, 20], 20);
    assert(lam > 0.85 && lam < 0.96, `λ = ${lam}`);
    return `λ = ${lam.toFixed(4)} over T=1000`;
  },
  'lorenz: phase-space volume contracts at −(σ+1+β): trace of J everywhere and a small tetrahedron': () => {
    const div = L.divergence(C);
    close(div, -(10 + 1 + 8 / 3), 1e-12, 'divergence');
    for (const [x, y, z] of [[1, 2, 3], [-7, 4, 30], [12, -9, 5]] as L.Vec3[]) {
      const J = L.jacobian(x, y, z, C);
      close(J[0] + J[4] + J[8], div, 1e-12, 'trace');
    }
    // Evolve a tiny tetrahedron for t = 0.5 and compare its volume ratio with e^{div t}.
    const e = 1e-7;
    const base: L.Vec3 = [-5, 3, 22];
    const pts = [base, [base[0] + e, base[1], base[2]], [base[0], base[1] + e, base[2]], [base[0], base[1], base[2] + e]].map((q) => new Float64Array(q));
    const vol = () => {
      const a = [0, 1, 2].map((k) => pts[1][k] - pts[0][k]);
      const b = [0, 1, 2].map((k) => pts[2][k] - pts[0][k]);
      const c = [0, 1, 2].map((k) => pts[3][k] - pts[0][k]);
      return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    };
    const v0 = vol();
    const t = 0.5;
    const h = 1e-3;
    for (let i = 0; i < t / h; i++) for (const q of pts) L.rk4InPlace(q, 0, C, h);
    const ratio = vol() / v0;
    close(Math.log(ratio) / t, div, 1e-3, 'log volume rate');
    return `ln(V/V0)/t = ${(Math.log(ratio) / t).toFixed(4)} vs ${div.toFixed(4)}`;
  },
  'lorenz: ρ = 99.96 and ρ = 160 are periodic windows (few distinct z maxima, λ ≈ 0), ρ = 28 is not': () => {
    const notes: string[] = [];
    for (const rho of [99.96, 160]) {
      const m = L.zMaxima(withRho(rho), 60, L.H, [1, 1, 20], 300);
      const n = L.distinctCount(m, m.length, 0.01 * rho);
      const lam = L.lyapunov(withRho(rho), 300, 0.002, [1, 1, 20], 200);
      assert(n <= 4, `ρ=${rho}: ${n} distinct maxima`);
      assert(Math.abs(lam) < 0.05, `ρ=${rho}: λ=${lam}`);
      notes.push(`ρ=${rho}: ${n} maxima, λ=${lam.toFixed(3)}`);
    }
    const m28 = L.zMaxima(C, 60, L.H, [1, 1, 20], 50);
    const n28 = L.distinctCount(m28, m28.length, 0.28);
    assert(n28 > 20, `ρ=28 looked periodic: ${n28}`);
    notes.push(`ρ=28: ${n28}/60 distinct`);
    return notes.join(', ');
  },
  'lorenz: Lorenz map is single-humped and all maxima lie above C± height (ρ=28)': () => {
    const m = L.zMaxima(C, 400, L.H, [1, 1, 20], 50);
    // Successive maxima pairs (z_n, z_{n+1}): the map is increasing below the peak (~38.5) and decreasing above it.
    let peakZ = 0;
    let peakNext = -Infinity;
    for (let i = 0; i + 1 < m.length; i++) if (m[i + 1] > peakNext) { peakNext = m[i + 1]; peakZ = m[i]; }
    let bad = 0;
    for (let i = 0; i + 1 < m.length; i++) for (let j = 0; j + 1 < m.length; j++) {
      if (m[i] < m[j] && m[j] < peakZ - 0.5 && m[i + 1] > m[j + 1] + 0.5) bad++;
    }
    assert(Math.min(...m) > 27, 'a maximum below C± height');
    assert(bad === 0, `${bad} non-monotone pairs on the rising branch`);
    return `peak near z_n = ${peakZ.toFixed(2)}, z range ${Math.min(...m).toFixed(1)} to ${Math.max(...m).toFixed(1)}`;
  },
};
