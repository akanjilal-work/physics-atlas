import { assert, close } from '../assert.ts';
import * as pd from '../../src/topics/particle-detectors/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'detectors: p_T = 0.3 B R matches qBR in SI units': () => {
    // 45 GeV/c muon in 3.8 T. SI: R = p / (eB), p = E[J]/c.
    const e = 1.602176634e-19;
    const c = 299792458;
    const pSI = (45e9 * e) / c;
    const Rsi = pSI / (e * 3.8);
    const R = pd.radiusFromPT(45, 3.8);
    close(R, Rsi, 1e-9 * Rsi, 'radius');
    close(pd.pTFromRadius(3.8, R), 45, 1e-12, 'round trip');
    // Rounded 0.3 rule differs from the exact constant by 0.07%.
    close((0.3 * 3.8 * R) / 45, 1, 1e-3, '0.3 rule');
    assert(!Number.isFinite(pd.radiusFromPT(45, 0)), 'B = 0 must give a straight track');
    return `R(45 GeV, 3.8 T) = ${R.toFixed(2)} m`;
  },
  'detectors: traced helix lies on a circle of radius p_T/(0.3 B)': () => {
    const pt = 1.2;
    const B = 3.8;
    const pa: pd.Particle = { kind: 'hpm', q: 1, p: pd.p4(pt, 0, 0.4, pd.M_PI), soft: true };
    const out = new Float32Array(3 * 2000);
    const res = pd.trace(pa, B, 0.005, out, 2000);
    const R = pd.radiusFromPT(pt, B);
    // Positive charge moving along +x in +z field turns toward -y: centre at (0, -R).
    let worst = 0;
    for (let i = 0; i < res.n; i++) {
      const d = Math.hypot(out[i * 3], out[i * 3 + 1] + R);
      worst = Math.max(worst, Math.abs(d - R));
    }
    assert(worst < 2e-4, `max deviation from circle ${worst} m`);
    return `R=${R.toFixed(3)} m, max deviation ${(worst * 1e6).toFixed(0)} µm over ${res.n} steps`;
  },
  'detectors: invariant mass of a back-to-back pair is 2E, and boost invariant': () => {
    const E = pd.M_Z / 2;
    const p = Math.sqrt(E * E - pd.M_MU * pd.M_MU);
    const a = pd.p4(p, 0, 0, pd.M_MU);
    const b = pd.p4(-p, 0, 0, pd.M_MU);
    close(pd.invMass(a, b), pd.M_Z, 1e-9, 'rest frame');
    const a2 = pd.boost(a, 0.1, -0.3, 0.6);
    const b2 = pd.boost(b, 0.1, -0.3, 0.6);
    close(pd.invMass(a2, b2), pd.M_Z, 1e-9, 'boosted');
    // Two massless photons at opening angle θ: M² = 2 E1 E2 (1 − cos θ).
    const th = 1.1;
    const g1 = pd.p4(60, 0, 0, 0);
    const g2 = pd.p4(80 * Math.cos(th), 80 * Math.sin(th), 0, 0);
    close(pd.invMass(g1, g2), Math.sqrt(2 * 60 * 80 * (1 - Math.cos(th))), 1e-9, 'photon pair');
    return `M = ${pd.invMass(a2, b2).toFixed(4)} GeV after boost`;
  },
  'detectors: Heitler shower maximum t_max = ln(E0/Ec)/ln 2': () => {
    const E0 = 50;
    const Ec = pd.PBWO4.EcGeV;
    const t = pd.heitlerTmax(E0, Ec);
    close(t, Math.log(E0 / Ec) / Math.log(2), 1e-12, 't_max');
    close(pd.heitlerN(t), E0 / Ec, 1e-6 * (E0 / Ec), 'N at t_max equals E0/Ec');
    // Discrete splitting: halve until below Ec. The generation count brackets t_max.
    let e = E0;
    let gen = 0;
    while (e / 2 >= Ec) { e /= 2; gen++; }
    assert(gen <= t && t < gen + 1, `generations ${gen} vs t_max ${t}`);
    return `50 GeV in PbWO4: t_max = ${t.toFixed(2)} X0 = ${(t * pd.PBWO4.X0cm).toFixed(1)} cm (PDG estimate ${pd.pdgTmaxElectron(E0, Ec).toFixed(2)} X0)`;
  },
  'detectors: momentum balance gives the neutrino p_T as missing ET': () => {
    // W at rest: electron and neutrino back to back, MET equals the electron pT.
    const [e, nu] = pd.twoBody(pd.p4(0, 0, 0, pd.M_W), pd.M_W, 0, 0, 0.6, 0.8, 0);
    const m = pd.missingET([e]);
    close(m.met, pd.pT(nu), 1e-9, 'MET at rest');
    close(m.met, pd.M_W / 2, 1e-9, 'Jacobian edge');
    close(pd.transverseMass(pd.pT(e), Math.atan2(e.py, e.px), m.met, m.phi), pd.M_W, 1e-9, 'mT = M_W at the edge');
    // Generated W events: soft recoil balances the boson, so the sum of visible true pT is minus the neutrino pT.
    const r = pd.mulberry32(7);
    let worst = 0;
    for (let k = 0; k < 200; k++) {
      const ev = pd.generateEvent('wen', r);
      const vis = ev.particles.filter((x) => x.kind !== 'nu').map((x) => x.p);
      const nuP = ev.particles.find((x) => x.kind === 'nu')!.p;
      const mm = pd.missingET(vis);
      worst = Math.max(worst, Math.hypot(mm.mex - nuP.px, mm.mey - nuP.py));
    }
    assert(worst < 1e-9, `MET vector off by ${worst} GeV`);
    return `MET matches neutrino to ${worst.toExponential(1)} GeV over 200 events`;
  },
  'detectors: 2000 Z→μμ events reconstruct a peak within 0.5 GeV of 91.19': () => {
    const r = pd.mulberry32(11);
    const bins = new Float64Array(60);
    for (let k = 0; k < 2000; k++) {
      const ev = pd.generateEvent('zmm', r);
      const rec = pd.reconstruct(ev, pd.B_CMS, r);
      const i = Math.floor(rec.mass - 60);
      if (i >= 0 && i < 60) bins[i]++;
    }
    const peak = pd.peakEstimate(bins, 60, 1, 4);
    close(peak, pd.M_Z, 0.5, 'Z peak');
    return `peak ${peak.toFixed(2)} GeV`;
  },
};
