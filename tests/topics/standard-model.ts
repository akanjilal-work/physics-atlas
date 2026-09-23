import { assert, close } from '../assert.ts';
import * as sm from '../../src/topics/standard-model/physics.ts';

type Suite = () => string | void;

const R = (s: string) => s.split(' ').filter(Boolean);

export const suites: Record<string, Suite> = {
  'standard-model: 17 particles with the right spins, charges and families': () => {
    const P = sm.PARTICLES;
    assert(P.length === 17, `expected 17 entries, got ${P.length}`);
    assert(new Set(P.map((p) => p.id)).size === 17, 'ids must be unique');
    const count = (c: string) => P.filter((p) => p.category === c).length;
    assert(count('quark') === 6 && count('lepton') === 6 && count('gauge') === 4 && count('scalar') === 1, 'category counts 6/6/4/1');
    const expect: Record<string, [number, number]> = {
      u: [0.5, 2 / 3], c: [0.5, 2 / 3], t: [0.5, 2 / 3], d: [0.5, -1 / 3], s: [0.5, -1 / 3], b: [0.5, -1 / 3],
      e: [0.5, -1], mu: [0.5, -1], tau: [0.5, -1], ve: [0.5, 0], vmu: [0.5, 0], vtau: [0.5, 0],
      g: [1, 0], gamma: [1, 0], Z: [1, 0], W: [1, 1], H: [0, 0],
    };
    for (const p of P) {
      const [s, q] = expect[p.id];
      assert(p.spin === s, `${p.id} spin ${p.spin}`);
      close(p.charge, q, 1e-12, `${p.id} charge`);
    }
    // Every fermion has a generation, no boson does.
    for (const p of P) assert((p.generation !== null) === (p.spin === 0.5), `${p.id} generation`);
    // Heaviest is the top quark, and the published hierarchy holds.
    const heaviest = P.reduce((a, b) => (b.massGeV > a.massGeV ? b : a));
    assert(heaviest.id === 't', 'top is heaviest');
    const mass = (id: string) => sm.particleById(id)!.massGeV;
    assert(mass('H') > mass('Z') && mass('Z') > mass('W') && mass('d') > mass('u'), 'm_H > m_Z > m_W, m_d > m_u');
    return 'PDG 2026 masses, e.g. m_t = 172.60 GeV';
  },

  'standard-model: conservation checker on 15 known reactions': () => {
    const cases: [string, string, boolean, string][] = [
      ['n', 'p e- vebar', true, 'beta decay'],
      ['mu-', 'e- gamma', false, 'mu -> e gamma'],
      ['p', 'e+ pi0', false, 'proton decay'],
      ['mu-', 'e- vebar vmu', true, 'muon decay'],
      ['pi+', 'mu+ vmu', true, 'pion decay'],
      ['e+ e-', 'gamma gamma', true, 'annihilation'],
      ['p', 'n e+ ve', false, 'free proton beta+'],
      ['n', 'p e- ve', false, 'wrong neutrino'],
      ['H', 'gamma gamma', true, 'H -> gamma gamma'],
      ['Z', 'gamma gamma', false, 'Landau-Yang'],
      ['pi0', 'gamma gamma', true, 'pi0 decay'],
      ['e+ e-', 'gamma', false, 'single photon'],
      ['p p', 'p p pi0', true, 'pion production'],
      ['t', 'b W+', true, 'top decay'],
      ['n', 'p e-', false, 'missing antineutrino'],
    ];
    for (const [a, b, ok, name] of cases) {
      const v = sm.checkReaction(R(a), R(b));
      assert(v.allowed === ok, `${name}: expected ${ok ? 'allowed' : 'forbidden'}, reasons [${v.reasons.join(', ')}]`);
    }
    // The right law must be the one that fails.
    const reasons = (a: string, b: string) => sm.checkReaction(R(a), R(b)).reasons.join(',');
    assert(reasons('p', 'e+ pi0') === 'baryon number,electron number', 'p -> e+ pi0 breaks B and L but keeps B - L');
    assert(reasons('mu-', 'e- gamma') === 'electron number,muon number', 'mu -> e gamma fails on Le and Lmu only');
    assert(reasons('p', 'n e+ ve') === 'energy', 'free p -> n fails on energy only');
    assert(reasons('n', 'p e- ve') === 'electron number', 'n -> p e nu fails on Le only');
    // Beta decay Q value: m_n - m_p - m_e = 0.782 MeV.
    close(sm.checkReaction(R('n'), R('p e- vebar')).energy.q * 1e3, 0.7823, 2e-4, 'neutron Q (MeV)');
    return `${cases.length} reactions`;
  },

  'standard-model: charge sums (hadrons, reactions, anomaly-free generations)': () => {
    const q = (id: string) => sm.particleById(id)!.charge;
    close(2 * q('u') + q('d'), 1, 1e-12, 'proton = uud');
    close(q('u') + 2 * q('d'), 0, 1e-12, 'neutron = udd');
    close(q('u') - q('d'), 1, 1e-12, 'pi+ = u dbar');
    // Per generation: 3 colours of each quark plus the leptons sum to zero charge.
    for (const [up, dn, l, nu] of [['u', 'd', 'e', 've'], ['c', 's', 'mu', 'vmu'], ['t', 'b', 'tau', 'vtau']]) {
      close(3 * (q(up) + q(dn)) + q(l) + q(nu), 0, 1e-12, `generation ${up}${dn}`);
    }
    // Every reaction-builder particle has integer charge in units of e, except bare quarks.
    for (const r of sm.RPARTICLES) if (!['t', 'tbar', 'b', 'bbar'].includes(r.id)) assert(r.q3 % 3 === 0, `${r.id} integer charge`);
    const v = sm.checkReaction(['n'], ['p', 'e-', 'vebar']);
    assert(v.charge.before === 0 && v.charge.after === 0, 'beta decay: 0 → +1 −1 0');
  },

  'standard-model: Higgs minimum at |phi| = v/sqrt2 with v = sqrt(mu^2/lambda)': () => {
    for (const [mu, lam] of [[sm.MU_PHYS, sm.LAMBDA_PHYS], [50, 0.3], [120, 0.1]]) {
      const mu2 = mu * mu;
      const rNum = sm.numericMinimum(mu2, lam, 1000);
      close(rNum, sm.phiMin(mu2, lam), 1e-5, `numeric minimum mu=${mu}`);
      close(Math.SQRT2 * rNum, Math.sqrt(mu2 / lam), 2e-5, `v = sqrt(mu^2/lambda) mu=${mu}`);
      close(sm.potential(mu2, lam, rNum), sm.vMinDepth(mu2, lam), 1e-6 * mu2 * mu2 / lam, 'depth -mu^4/(4 lambda)');
      // Radial curvature: with phi = (v + h)/sqrt2, V''(h) at h = 0 equals m_H^2 = 2 mu^2.
      const v = sm.vev(mu2, lam);
      const Vh = (h: number) => sm.potential(mu2, lam, (v + h) / Math.SQRT2);
      const eps = 1e-3 * v;
      const curv = (Vh(eps) - 2 * Vh(0) + Vh(-eps)) / (eps * eps);
      close(curv, 2 * mu2, 1e-4 * mu2, `m_H^2 = 2 mu^2, mu=${mu}`);
    }
    close(sm.V_EW, 246.22, 0.01, 'v = (sqrt2 G_F)^-1/2');
    close(sm.vev(sm.MU_PHYS ** 2, sm.LAMBDA_PHYS), sm.V_EW, 1e-9, 'physical v');
    close(sm.higgsMass(sm.MU_PHYS ** 2), 125.13, 1e-9, 'm_H');
    close(sm.LAMBDA_PHYS, 0.129, 0.001, 'lambda ≈ 0.129');
    assert(sm.phiMin(-100, 0.2) === 0, 'mu^2 < 0 has its minimum at the origin');
    return `λ = ${sm.LAMBDA_PHYS.toFixed(4)}, μ = ${sm.MU_PHYS.toFixed(2)} GeV`;
  },

  'standard-model: W, Z masses and top Yukawa from v; force strengths': () => {
    close(sm.massW(sm.V_EW), 80.3625, 1e-9, 'm_W = g v / 2');
    close(sm.massZ(sm.V_EW), 91.1879, 1e-9, 'm_Z = sqrt(g^2 + g\'^2) v / 2');
    close(sm.yukawa(172.6), 0.991, 0.002, 'top Yukawa near 1');
    const f = Object.fromEntries(sm.forceStrengths().map((x) => [x.force, x.value]));
    close(f.gravity, 5.906e-39, 0.01e-39, 'G m_p^2 / hbar c');
    close(1 / f.weak, 29.58, 0.05, 'alpha_2 at M_Z');
    assert(f.strong > f.weak && f.weak > f.electromagnetic && f.electromagnetic > 1e30 * f.gravity, 'ordering');
  },

  'standard-model: damped ball rolls off the peak and settles on the rim': () => {
    const S = 60;
    const Vs = 8e7;
    const mu2 = sm.MU_PHYS ** 2;
    const b = { x: 0.01, z: 0.004, vx: 0, vz: 0 };
    for (let i = 0; i < 600 * 30; i++) sm.stepBall(b, mu2, sm.LAMBDA_PHYS, S, Vs, 9, 1.4, 1 / 600);
    close(Math.hypot(b.x, b.z) * S, sm.phiMin(mu2, sm.LAMBDA_PHYS), 0.5, '|phi| of ball (GeV)');
    assert(Math.hypot(b.vx, b.vz) < 1e-3, 'ball at rest');
  },
};
