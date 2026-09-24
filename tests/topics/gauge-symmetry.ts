import { assert, close } from '../assert.ts';
import * as g from '../../src/topics/gauge-symmetry/physics.ts';

type Suite = () => string | void;

// Deterministic PRNG so failures are reproducible.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomLattice(n: number, r: () => number): g.Lattice {
  const L = g.createLattice(n);
  for (let k = 0; k < L.theta.length; k++) L.theta[k] = (r() * 2 - 1) * Math.PI;
  for (let k = 0; k < L.ah.length; k++) L.ah[k] = (r() * 2 - 1) * Math.PI;
  for (let k = 0; k < L.av.length; k++) L.av[k] = (r() * 2 - 1) * Math.PI;
  return L;
}

export const suites: Record<string, Suite> = {
  'gauge: plaquettes invariant under 50 random local gauge transforms (|dU_p| < 1e-12)': () => {
    const r = rng(7);
    const L = randomLattice(9, r);
    const ref = g.plaquetteSnapshot(L);
    const alpha = new Float64Array(L.theta.length);
    for (let rep = 0; rep < 50; rep++) {
      for (let k = 0; k < alpha.length; k++) alpha[k] = (r() * 2 - 1) * Math.PI;
      g.gaugeTransform(L, alpha);
    }
    const drift = g.maxPlaquetteDrift(L, ref);
    assert(drift < 1e-12, `plaquette drift ${drift}`);
    // The sites and links themselves did change.
    const L0 = randomLattice(9, rng(7));
    let moved = 0;
    for (let k = 0; k < L.ah.length; k++) moved = Math.max(moved, Math.abs(g.wrap(L.ah[k] - L0.ah[k])));
    assert(moved > 1, 'links did not change, test is vacuous');
    return `max |ΔU_p| = ${drift.toExponential(1)}`;
  },
  'gauge: covariant difference transforms as D -> e^{i alpha_j} D (complex psi, 1e-12)': () => {
    const r = rng(11);
    const d = [0, 0];
    const d2 = [0, 0];
    let worst = 0;
    for (let t = 0; t < 1000; t++) {
      const [ri, ii, rj, ij] = [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2, r() * 4 - 2];
      const A = (r() * 2 - 1) * 5;
      const ai = (r() * 2 - 1) * 5;
      const aj = (r() * 2 - 1) * 5;
      g.covDiff(ri, ii, rj, ij, A, d);
      // transform psi_i, psi_j and A
      const ri2 = Math.cos(ai) * ri - Math.sin(ai) * ii;
      const ii2 = Math.sin(ai) * ri + Math.cos(ai) * ii;
      const rj2 = Math.cos(aj) * rj - Math.sin(aj) * ij;
      const ij2 = Math.sin(aj) * rj + Math.cos(aj) * ij;
      g.covDiff(ri2, ii2, rj2, ij2, A + aj - ai, d2);
      const er = Math.cos(aj) * d[0] - Math.sin(aj) * d[1];
      const ei = Math.sin(aj) * d[0] + Math.cos(aj) * d[1];
      worst = Math.max(worst, Math.hypot(d2[0] - er, d2[1] - ei));
    }
    assert(worst < 1e-12, `covariance error ${worst}`);
    // Without the link, the plain difference is not covariant.
    g.covDiff(1, 0, 1, 0, 0, d);
    g.covDiff(Math.cos(0.3), Math.sin(0.3), Math.cos(1.1), Math.sin(1.1), 0, d2);
    assert(Math.hypot(d2[0], d2[1]) > 0.5 && Math.hypot(d[0], d[1]) < 1e-15, 'naive difference unexpectedly covariant');
    return `max error ${worst.toExponential(1)}`;
  },
  'gauge: covariant energy invariant, naive energy not, under a local transform': () => {
    const r = rng(3);
    const L = randomLattice(8, r);
    const eCov = g.linkEnergy(L, true);
    const eNaive = g.linkEnergy(L, false);
    const alpha = new Float64Array(L.theta.length).map(() => (r() * 2 - 1) * Math.PI);
    g.gaugeTransform(L, alpha);
    close(g.linkEnergy(L, true), eCov, 1e-10, 'covariant energy');
    const dn = Math.abs(g.linkEnergy(L, false) - eNaive);
    assert(dn > 1, `naive energy changed by only ${dn}`);
    return `ΔE_cov=${Math.abs(g.linkEnergy(L, true) - eCov).toExponential(1)}, ΔE_naive=${dn.toFixed(2)}`;
  },
  'gauge: global rotation leaves covariant, naive and field energies unchanged': () => {
    const L = randomLattice(8, rng(5));
    const e1 = g.linkEnergy(L, true);
    const e2 = g.linkEnergy(L, false);
    const e3 = g.plaquetteEnergy(L);
    let worst = 0;
    for (const beta of [0.1, 1, 2.5, -3, 17]) {
      worst = Math.max(worst, Math.abs(g.linkEnergy(L, true, beta) - e1), Math.abs(g.linkEnergy(L, false, beta) - e2));
      const alpha = new Float64Array(L.theta.length).fill(beta);
      const L2 = g.cloneLattice(L);
      g.gaugeTransform(L2, alpha);
      // A constant alpha leaves every link untouched.
      for (let k = 0; k < L.ah.length; k++) worst = Math.max(worst, Math.abs(g.wrap(L2.ah[k] - L.ah[k])));
      worst = Math.max(worst, Math.abs(g.plaquetteEnergy(L2) - e3));
    }
    assert(worst < 1e-12, `global rotation changed something by ${worst}`);
    return `max change ${worst.toExponential(1)}`;
  },
  'gauge: axial-gauge links reproduce the requested flux, and Stokes sum holds': () => {
    const n = 8;
    const L = g.createLattice(n);
    const phi = 0.7;
    g.setFluxPattern(L, g.fluxPattern(n, 'uniform', phi));
    const F = g.fluxes(L, new Float64Array((n - 1) ** 2));
    for (const f of F) close(f, phi, 1e-12, 'plaquette flux');
    // Stokes: the phase around the whole boundary equals total enclosed flux (mod 2 pi).
    let loop = 0;
    for (let i = 0; i < n - 1; i++) loop += L.ah[g.hIdx(n, i, 0)] - L.ah[g.hIdx(n, i, n - 1)];
    for (let j = 0; j < n - 1; j++) loop += L.av[g.vIdx(n, n - 1, j)] - L.av[g.vIdx(n, 0, j)];
    close(g.wrap(loop - phi * (n - 1) ** 2), 0, 1e-9, 'boundary loop');
    return `49 plaquettes at ${phi} rad, loop = total flux mod 2π`;
  },
  'Aharonov–Bohm: fringe shift is linear in flux with period h/e': () => {
    // A very wide envelope isolates the interference term (the envelope itself never shifts).
    const p = { spacing: 1, envelope: 1e6 };
    // Locate the central maximum numerically for several fluxes.
    const peak = (f: number) => {
      let best = -1;
      let at = 0;
      for (let k = -5000; k <= 5000; k++) {
        const y = k * 1e-4;
        const I = g.abIntensity(y, f, p);
        if (I > best) { best = I; at = y; }
      }
      return at;
    };
    for (const f of [0, 0.1, 0.25, -0.3, 0.45]) close(peak(f), -f * p.spacing, 2e-3, `peak at f=${f}`);
    close(g.fringeShift(0.25, p), -0.25, 1e-12, 'fringeShift helper');
    // One flux quantum restores the pattern exactly, half a quantum swaps bright and dark.
    for (let y = -3; y <= 3; y += 0.037) {
      close(g.abIntensity(y, 1, p), g.abIntensity(y, 0, p), 1e-12, 'period');
      const env = g.abIntensity(y, 0, p) + g.abIntensity(y, 0.5, p);
      const s = Math.sin((Math.PI * y) / p.envelope) / ((Math.PI * y) / p.envelope || 1);
      close(env, Math.abs(y) < 1e-12 ? 1 : s * s, 1e-12, 'half-quantum complement');
    }
    // Physical period: (e/hbar) * (h/e) = 2 pi.
    close(g.abPhase(g.FLUX_QUANTUM_E), 2 * Math.PI, 1e-12, 'phase of one h/e');
    close(g.FLUX_QUANTUM_E, 4.135667696e-15, 1e-23, 'h/e in Wb');
    return `h/e = ${g.FLUX_QUANTUM_E.toExponential(6)} Wb`;
  },
  'Aharonov–Bohm: B is zero outside the solenoid while the loop integral of A equals Phi': () => {
    const R = 0.3;
    const Phi = 2.5;
    for (const r of [0.31, 0.5, 1, 3]) {
      close(g.solenoidB(r, R, Phi), 0, 0, 'B outside');
      close(2 * Math.PI * r * g.solenoidA(r, R, Phi), Phi, 1e-12, `loop of A at r=${r}`);
    }
    close(g.solenoidB(0.1, R, Phi) * Math.PI * R * R, Phi, 1e-12, 'flux inside');
  },
};
