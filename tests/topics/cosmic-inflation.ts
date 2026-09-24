import { assert, close } from '../assert.ts';
import * as inf from '../../src/topics/cosmic-inflation/physics.ts';

type Suite = () => string | void;

const quad = inf.POTENTIALS.quadratic;
const staro = inf.POTENTIALS.starobinsky;

export const suites: Record<string, Suite> = {
  'inflation: m²φ² slow-roll e-folds N = (φ² − φ_end²)/4 ≈ φ²/4 in reduced Planck units': () => {
    // Direct quadrature of N = ∫ V/V' dφ (M_p = 1) against the closed form.
    const phi = 15.6;
    let N = 0;
    const steps = 20000;
    const h = (phi - quad.phiEnd) / steps;
    for (let i = 0; i < steps; i++) {
      const x = quad.phiEnd + (i + 0.5) * h;
      N += (quad.V(x) / quad.dV(x)) * h;
    }
    close(N, quad.Nsr(phi), 1e-6, 'quadrature vs closed form');
    close(quad.Nsr(phi), (phi * phi) / 4, 0.51, 'N ≈ φ²/4');
    // Same N with the unreduced Planck mass m_Pl = √(8π) M_p: N = 2πφ²/m_Pl².
    const phiPl = phi / Math.sqrt(8 * Math.PI);
    close((2 * Math.PI * phiPl * phiPl), (phi * phi) / 4, 1e-9, 'unit conversion');
    close(quad.phiAtN(60), Math.sqrt(242), 1e-12, 'φ at N = 60');
    return `N(15.6 M_p) = ${N.toFixed(3)}, φ²/4 = ${((phi * phi) / 4).toFixed(3)}`;
  },
  'inflation: ε = 1 at the end of inflation (slow-roll and numerical)': () => {
    close(inf.epsV(quad, quad.phiEnd), 1, 1e-12, 'quadratic ε_V(φ_end)');
    close(inf.epsV(staro, staro.phiEnd), 1, 1e-12, 'Starobinsky ε_V(φ_end)');
    const out: string[] = [];
    for (const [p, phi0] of [[quad, 12], [staro, 5]] as const) {
      const run = inf.solve(p, phi0);
      const i = run.iEnd;
      const e0 = inf.epsH(p, run.phi[i - 1], run.dphi[i - 1], run.rhoR[i - 1]);
      const e1 = inf.epsH(p, run.phi[i], run.dphi[i], run.rhoR[i]);
      assert(e0 < 1 && e1 >= 1, `ε_H does not cross 1 at iEnd (${e0}, ${e1})`);
      // At ε_H = 1 the acceleration ä/a = H²(1 − ε_H) changes sign: φ̇² = V there.
      const w = (1 - e0) / (e1 - e0);
      const dphi = run.dphi[i - 1] + w * (run.dphi[i] - run.dphi[i - 1]);
      close(dphi * dphi / p.V(run.phiEndNum), 1, 2e-3, 'φ̇²/V at the end');
      out.push(`${p.id} φ_end num ${run.phiEndNum.toFixed(3)} vs SR ${p.phiEnd.toFixed(3)}`);
    }
    return out.join(', ');
  },
  'inflation: m²φ² at N = 60 gives n_s ≈ 0.967 and r ≈ 0.13': () => {
    const o = inf.srObs(quad, 60);
    close(o.ns, 1 - 2 / 60.5, 1e-12, 'n_s = 1 − 2/(N + ½)');
    close(o.ns, 0.967, 1e-3, 'n_s');
    close(o.r, 0.132, 1e-3, 'r');
    assert(o.r > inf.R_BOUND, 'r should exceed the BICEP/Keck bound');
    return `n_s = ${o.ns.toFixed(4)}, r = ${o.r.toFixed(4)}`;
  },
  'inflation: Starobinsky matches n_s ≈ 1 − 2/N, r ≈ 12/N² at large N': () => {
    const N = 55;
    const o = inf.srObs(staro, N);
    close(o.ns, 1 - 2 / N, 2e-3, 'n_s');
    close(o.r, 12 / (N * N), 5e-4, 'r');
    assert(Math.abs(o.ns - inf.NS_PLANCK) < inf.NS_SIGMA, 'inside Planck 1σ');
    assert(o.r < inf.R_BOUND, 'below the r bound');
    return `n_s = ${o.ns.toFixed(4)}, r = ${o.r.toFixed(4)}`;
  },
  'inflation: numerical solution tracks slow roll on the plateau': () => {
    const out: string[] = [];
    for (const [p, phi0] of [[staro, 5.45], [quad, 15.6]] as const) {
      const run = inf.solve(p, phi0);
      // Middle of inflation: attractor φ̇ = −V'/(3H) and ε_H ≈ ε_V.
      const i = Math.floor(run.iEnd / 2);
      const phi = run.phi[i];
      const dSR = -p.dV(phi) / (3 * run.H[i]);
      close(run.dphi[i] / dSR, 1, 0.02, `${p.id} φ̇ vs slow roll`); // first-order: corrections ~ (ε − η)/3
      const eH = inf.epsH(p, phi, run.dphi[i], 0);
      // Second-order slow roll (Liddle, Parsons & Barrow 1994): ε_H ≈ ε_V − (4/3)ε_V² + (2/3)ε_V η_V.
      const eV = inf.epsV(p, phi);
      const e2 = eV - (4 / 3) * eV * eV + (2 / 3) * eV * inf.etaV(p, phi);
      close(eH / e2, 1, 0.005, `${p.id} ε_H vs second-order ε_V`);
      // e-folds still to go agree with the slow-roll integral to about one e-fold.
      const left = run.NEnd - run.N[i];
      close(left, p.Nsr(phi), 1.5, `${p.id} remaining N`);
      // Quantum kicks δφ = H/2π per Hubble time give P = (H/φ̇)²(H/2π)² = V/(24π²ε).
      const Pq = ((run.H[i] / run.dphi[i]) * (run.H[i] / (2 * Math.PI))) ** 2;
      close(Pq / inf.powerR(p, 1, phi), 1, 0.03, `${p.id} δφ = H/2π power`);
      out.push(`${p.id}: N left ${left.toFixed(2)} vs SR ${p.Nsr(phi).toFixed(2)}`);
    }
    return out.join(', ');
  },
  'inflation: RK4 step converges (N_total at dt = 0.01 vs 0.0025)': () => {
    const a = inf.solve(staro, 5.45, { dt: 0.01 });
    const b = inf.solve(staro, 5.45, { dt: 0.0025 });
    close(a.NEnd, b.NEnd, 5e-3, 'N_end');
    return `N_end ${a.NEnd.toFixed(4)} vs ${b.NEnd.toFixed(4)}`;
  },
  'inflation: about 60 e-folds needed, pivot ~55, m ≈ 6×10⁻⁶ M_p': () => {
    const n16 = inf.efoldsForScale(1e16);
    assert(n16 > 58 && n16 < 64, `GUT-scale N = ${n16}`);
    const cs = inf.calibrate(staro);
    const cq = inf.calibrate(quad);
    for (const c of [cs, cq]) {
      assert(c.Nneed > 55 && c.Nneed < 66, `N_need ${c.Nneed}`);
      close(c.Nneed - c.Nstar, Math.log(0.05 * 299792.458 / 67.4), 1e-9, 'pivot offset');
      assert(c.Nstar > 50 && c.Nstar < 60, `N★ ${c.Nstar}`);
    }
    // Quadratic mass set by A_s = 2.1e-9: m ≈ 6e-6 M_p (≈ 1.5e13 GeV).
    const m = Math.sqrt(cq.lam);
    close(m / 6e-6, 1, 0.1, 'inflaton mass');
    close(cs.Vq / 8e15, 1, 0.15, 'Starobinsky energy scale');
    return `N(1e16 GeV) = ${n16.toFixed(1)}, N★ = ${cs.Nstar.toFixed(1)} / ${cq.Nstar.toFixed(1)}, m = ${m.toExponential(2)} M_p`;
  },
  'inflation: flatness |Ω−1| ∝ (aH)⁻² falls below 1e-20 after ~25 e-folds': () => {
    const run = inf.solve(staro, 5.45);
    const f = inf.log10Flatness(run, run.iEnd);
    // During near-de Sitter expansion H barely changes, so log10|Ω−1| ≈ −2N/ln10.
    const i = Math.floor(run.iEnd / 2);
    close(inf.log10Flatness(run, i), (-2 * run.N[i]) / Math.LN10, 0.3, 'mid-plateau');
    assert(f < -50, `end value ${f}`);
    return `log10|Ω−1| at end = ${f.toFixed(1)} after N = ${run.NEnd.toFixed(1)}`;
  },
};
