import { assert, close } from '../assert.ts';
import * as q from '../../src/topics/quark-gluon-plasma/physics.ts';

type Suite = () => string | void;

/** Run the toy fireball to freeze-out and return the measured v2. */
function fullEvent(beam: q.Beam, b: number, etaS: number, n = 3000, K = 10, seed = 3): number {
  const f = q.createFireball({ beam, b, etaS });
  const rng = q.mulberry32(seed);
  const xs = new Float64Array(n), ys = new Float64Array(n), ws = new Float64Array(n);
  const m = q.sampleOverlap(b, f.R, rng, n, xs, ys, ws);
  const frozen = new Uint8Array(m);
  const acc = q.newAcc();
  const v = new Float64Array(2), o = new Float64Array(4);
  let left = m;
  while (left > 0 && f.tau < 40) {
    for (let i = 0; i < m; i++) {
      if (frozen[i] || q.localT(f, ws[i] / f.geo.wbar) >= q.T_FO) continue;
      frozen[i] = 1;
      left--;
      q.cellVelocity(f, xs[i], ys[i], v);
      for (let k = 0; k < K; k++) {
        q.sampleHadron(v[0], v[1], q.T_FO, rng, o);
        q.addPhi(acc, Math.atan2(o[1], o[0]));
      }
    }
    q.stepFireball(f, 0.02);
  }
  return q.v2Of(acc);
}

export const suites: Record<string, Suite> = {
  'QGP: Lorentz factors, RHIC Au 100 GeV/n gives gamma ~ 107, LHC Pb 5.02 TeV gives gamma ~ 2700': () => {
    const gR = q.lorentzGamma(q.BEAMS.rhic.eN);
    const gL = q.lorentzGamma(q.BEAMS.lhc.eN);
    close(gR, 107.35, 0.1, 'RHIC gamma');
    // 6.37 TeV proton-equivalent times Z/A = 2.511 TeV per nucleon, so sqrt(s_NN) = 5.02 TeV
    close(q.sqrtSNN(q.BEAMS.lhc.eN), 5022.6, 1, 'LHC sqrt(s_NN)');
    close(gL, 2696, 3, 'LHC gamma');
    // Beam rapidities quoted in the literature: about 5.36 (RHIC 200 GeV) and 8.6 (LHC 5.02 TeV)
    close(q.beamRapidity(gR), 5.37, 0.02, 'RHIC y_beam');
    close(q.beamRapidity(gL), 8.59, 0.02, 'LHC y_beam');
    // Contracted thickness of a gold nucleus at RHIC
    const d = (2 * q.nuclearRadius(197)) / gR;
    close(d, 0.13, 0.005, 'Au thickness (fm)');
    return `gamma RHIC ${gR.toFixed(1)}, LHC ${gL.toFixed(0)}, Au pancake ${d.toFixed(3)} fm thick`;
  },
  'QGP: v2 extracted from sampled phi recovers the input (N = 200k)': () => {
    const rng = q.mulberry32(99);
    const N = 200000;
    for (const [v2, psi] of [[0.08, 0.3], [0.02, -1.0], [0, 0]] as const) {
      const phis = new Float64Array(N);
      for (let i = 0; i < N; i++) phis[i] = q.samplePhi(v2, psi, rng);
      const fit = q.fitSecondHarmonic(phis);
      const tol = 4 / Math.sqrt(2 * N);
      close(fit.v2, v2, v2 === 0 ? 3 * tol : tol, `v2 for input ${v2}`);
      if (v2 > 0.05) close(fit.psi, psi, 0.02, 'event-plane angle');
      // With the true reaction plane known, <cos 2(phi - psi)> is the same estimator the scene uses.
      const acc = q.newAcc();
      for (let i = 0; i < N; i++) q.addPhi(acc, phis[i] - psi);
      close(q.v2Of(acc), v2, tol, 'reaction-plane v2');
      close(q.v2Err(acc), 1 / Math.sqrt(2 * N), 1e-4, 'stat error 1/sqrt(2N)');
    }
    return `recovered to within 4/sqrt(2N) = ${(4 / Math.sqrt(2 * N)).toFixed(4)}`;
  },
  'QGP: hard-sphere almond eccentricity is 0 at b = 0 and grows with b to near 1': () => {
    const R = q.nuclearRadius(197);
    const e0 = q.overlap(0, R);
    close(e0.ecc, 0, 1e-9, 'central eccentricity');
    // Central moments: weight 2 sqrt(R^2 - r^2) on a disc gives <x^2> = R^2/5, area pi R^2, N_part = 2A
    close(e0.sxx, (R * R) / 5, 0.01 * R * R, '<x^2> at b = 0');
    close(e0.area, Math.PI * R * R, 0.01 * Math.PI * R * R, 'overlap area at b = 0');
    close(e0.npartFrac, 1, 0.01, 'all nucleons participate at b = 0');
    let prev = -1;
    const out: string[] = [];
    for (let b = 1; b <= 13; b += 1) {
      const e = q.overlap(b, R).ecc;
      assert(e > prev, `eccentricity not increasing at b = ${b}: ${e} <= ${prev}`);
      prev = e;
      if (b % 4 === 1) out.push(`b=${b}: ${e.toFixed(2)}`);
    }
    assert(prev > 0.8, `grazing eccentricity only ${prev}`);
    // Monte Carlo sampling of the same weight agrees with the grid integral.
    const n = 60000;
    const xs = new Float64Array(n), ys = new Float64Array(n), ws = new Float64Array(n);
    const got = q.sampleOverlap(8, R, q.mulberry32(5), n, xs, ys, ws);
    close(q.sampledEcc(xs, ys, got), q.overlap(8, R).ecc, 0.01, 'sampled vs integrated at b = 8');
    return out.join(', ');
  },
  'QGP: T_c = 155 MeV is about 1.8e12 K': () => {
    const K = q.mevToKelvin(155);
    close(K / 1e12, 1.7987, 0.001, 'T_c in 1e12 K');
    close(q.mevToKelvin(1), 1.16045e10, 1e6, '1 MeV in K');
    return `${(K / 1e12).toFixed(3)} x 10^12 K`;
  },
  'QGP: Stefan-Boltzmann limit eps/T^4 = 15.6 for gluons + u,d,s and Bjorken estimate at RHIC': () => {
    close(q.G_SB, 47.5, 1e-12, 'degrees of freedom');
    close((Math.PI ** 2 / 30) * q.G_SB, 15.63, 0.01, 'eps/T^4');
    close(q.tempFromEps(q.epsOfT(0.3)), 0.3, 1e-6, 'EOS inversion');
    // Bjorken: 750 GeV per unit rapidity over pi R^2 of gold at tau0 = 1 fm/c is about 5 GeV/fm^3
    const R = q.nuclearRadius(197);
    const eps = q.bjorken(750, Math.PI * R * R);
    close(eps, 4.9, 0.1, 'Bjorken eps (GeV/fm^3)');
    const T = q.tempFromEps(eps);
    assert(T > q.TC, 'central RHIC should start above T_c');
    return `eps = ${eps.toFixed(2)} GeV/fm^3, T0 = ${(T * 1000).toFixed(0)} MeV`;
  },
  'QGP: toy hydro gives v2 ~ 0 at b = 0, v2 growing with b, and shrinking with eta/s': () => {
    const c = fullEvent('rhic', 0, 0.12);
    const mid = fullEvent('rhic', 6, 0.08);
    const per = fullEvent('rhic', 10, 0.08);
    const visc = fullEvent('rhic', 10, 0.4);
    assert(Math.abs(c) < 0.015, `central v2 ${c}`);
    assert(mid > 0.03 && per > mid, `v2 not growing: ${mid}, ${per}`);
    assert(visc < 0.7 * per, `viscosity did not reduce v2: ${visc} vs ${per}`);
    return `v2(b=0)=${c.toFixed(3)}, v2(6)=${mid.toFixed(3)}, v2(10)=${per.toFixed(3)}, v2(10, eta/s=0.4)=${visc.toFixed(3)}`;
  },
  'QGP: jet energy loss scales as L^2 in a uniform medium (BDMPS)': () => {
    const loss = (L: number) => {
      const j: q.Jet = { x: 0, y: 0, dx: 1, dy: 0, E: 1000, E0: 1000, L: 0 };
      const h = 0.001;
      for (let s = 0; s < L / h - 0.5; s++) q.jetStep(j, h, 0.3);
      return j.E0 - j.E;
    };
    const r = loss(6) / loss(3);
    close(r, 4, 0.01, 'loss ratio for doubled path');
    close(loss(3), q.JET_K * 0.027 * 9, 0.05, 'loss = K T^3 L^2');
    return `dE(6 fm)/dE(3 fm) = ${r.toFixed(3)}`;
  },
  'QGP: Cleymans freeze-out curve gives mu_B ~ 24 MeV at RHIC and ~ 1 MeV at the LHC': () => {
    close(q.muBFreeze(200) * 1000, 23.5, 0.5, 'RHIC mu_B (MeV)');
    close(q.muBFreeze(5020) * 1000, 0.95, 0.05, 'LHC mu_B (MeV)');
    close(q.tFreeze(0) * 1000, 156.5, 1e-9, 'T_ch at mu = 0');
    assert(q.tFreeze(q.muBFreeze(7.7)) < q.tcOfMu(q.muBFreeze(7.7)), 'freeze-out below the crossover line');
    close(q.tcOfMu(0), q.TC, 1e-12, 'crossover at mu = 0');
  },
};
