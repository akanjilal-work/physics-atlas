import { assert, close } from '../assert.ts';
import * as wk from '../../src/topics/weak-force/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'weak-force: range ħ/(M_W c) ≈ 2.5e-3 fm, infinite for a massless carrier': () => {
    const lam = wk.rangeFm(wk.M_W);
    // ħc = 197.327 MeV fm, M_W = 80.369 GeV → 2.4553e-3 fm
    close(lam, 197.3269804 / 80369.2, 1e-9, 'λ');
    close(lam, 2.455e-3, 0.005e-3, 'λ vs textbook value');
    assert(wk.rangeFm(0) === Infinity, 'massless carrier must have infinite range');
    // A pion-mass carrier (Yukawa's meson, 139.57 MeV) gives the ~1.4 fm nuclear range.
    close(wk.rangeFm(0.13957), 1.414, 0.002, 'pion range');
    // Yukawa: ratio to Coulomb is 1/e at r = λ, and Coulomb is recovered as λ → ∞.
    close(wk.yukawa(lam, lam) / wk.coulomb(lam), Math.exp(-1), 1e-12, 'Yukawa/Coulomb at r = λ');
    close(wk.yukawa(3, 1e12) / wk.coulomb(3), 1, 1e-9, 'λ → ∞ limit');
    return `λ_W = ${lam.toExponential(4)} fm`;
  },

  'weak-force: muon lifetime from G_F within 1% (tree level) and 0.01% (with QED + m_e corrections)': () => {
    const tree = wk.muonLifetime(wk.G_F);
    const full = wk.muonLifetime(wk.G_F, wk.M_MU, true);
    const errTree = Math.abs(tree - wk.TAU_MU_MEASURED) / wk.TAU_MU_MEASURED;
    const errFull = Math.abs(full - wk.TAU_MU_MEASURED) / wk.TAU_MU_MEASURED;
    assert(errTree < 0.01, `tree-level error ${errTree}`);
    assert(errFull < 1e-4, `corrected error ${errFull}`);
    // Sargent rule: rate ∝ m⁵. τ_τ ≈ τ_μ (m_μ/m_τ)⁵ × B(τ → eνν) ≈ 290.3 fs (PDG).
    const tauTau = wk.TAU_MU_MEASURED * (wk.M_MU / 1.77686) ** 5 * 0.1782;
    close(tauTau * 1e15, 290.3, 3, 'tau lifetime via m⁵ scaling (fs)');
    return `τ_tree = ${(tree * 1e6).toFixed(4)} μs (${(errTree * 100).toFixed(2)}% low), τ_corr = ${(full * 1e6).toFixed(5)} μs`;
  },

  'weak-force: neutron spectrum is continuous and ends exactly at Q = 0.782 MeV': () => {
    close(wk.Q_NEUTRON, 0.78233, 2e-5, 'Q = m_n - m_p - m_e');
    const Q = wk.Q_NEUTRON;
    assert(wk.betaSpectrum(Q, Q, 1) === 0 && wk.betaSpectrum(Q + 0.01, Q, 1) === 0, 'N must vanish at and above Q');
    assert(wk.betaSpectrum(0, Q, 1) === 0, 'N must vanish at T = 0 with F = 1 (p → 0)');
    // Near the endpoint N ∝ (Q - T)²: halving the gap quarters N.
    const r = wk.betaSpectrum(Q - 2e-4, Q, 1) / wk.betaSpectrum(Q - 1e-4, Q, 1);
    close(r, 4, 0.01, 'quadratic endpoint');
    const tab = wk.buildSpectrum(Q, 1);
    let max = 0;
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const t = wk.sampleT(tab, (i + 0.5) / N);
      assert(t >= 0 && t <= Q, `sample ${t} out of range`);
      max = Math.max(max, t);
      sum += t;
    }
    assert(Q - max < 0.02, `samples should reach close to Q, max ${max}`);
    close(sum / N, tab.meanT, 1e-3, 'sample mean vs integral');
    // For F = 1 the mean kinetic energy is about 0.303 MeV (numerical integral of pE(Q-T)²).
    close(wk.buildSpectrum(Q, 0).meanT, 0.3028, 0.001, 'mean T with F = 1');
    return `mean T_e = ${tab.meanT.toFixed(3)} MeV, max sampled ${max.toFixed(4)} MeV`;
  },

  'weak-force: G_F/√2 = g²/(8M_W²) is consistent with α and sin²θ_W': () => {
    const g = wk.gFromFermi(wk.G_F, wk.M_W);
    // Round trip
    close(wk.fermiFromG(g, wk.M_W), wk.G_F, 1e-15, 'round trip');
    // g = e / sin θ_W with α(M_Z) = 1/127.951 and sin²θ_W (MS-bar) = 0.23122 (PDG)
    const gEW = Math.sqrt((4 * Math.PI) / 127.951 / 0.23122);
    close(g, gEW, 0.01 * gEW, 'g from G_F vs g from α and θ_W');
    // Tree-level M_W from α(M_Z), sin²θ_W and G_F lands within 0.5% of the measured 80.37 GeV.
    const mw = wk.mWTree(1 / 127.951, 0.23122, wk.G_F);
    close(mw, wk.M_W, 0.005 * wk.M_W, 'tree-level M_W');
    assert(wk.fermiFromG(g, 0) === Infinity, 'massless mediator: contact coupling diverges');
    return `g = ${g.toFixed(4)}, e/sinθ_W = ${gEW.toFixed(4)}, M_W(tree) = ${mw.toFixed(2)} GeV`;
  },

  'weak-force: Wu angular sampler reproduces ⟨cos θ⟩ = a/3 and the hemisphere asymmetry a/2': () => {
    for (const a of [-1, -0.5, 0, 0.7]) {
      const N = 40000;
      let s = 0;
      let up = 0;
      for (let i = 0; i < N; i++) {
        const c = wk.sampleCosTheta(a, (i + 0.5) / N);
        assert(c >= -1 - 1e-12 && c <= 1 + 1e-12, `cos θ ${c} out of range`);
        s += c;
        if (c > 0) up++;
      }
      close(s / N, a / 3, 1e-3, `⟨cos θ⟩ for a = ${a}`);
      close((2 * up - N) / N, wk.hemisphereAsymmetry(a), 1e-3, `asymmetry for a = ${a}`);
    }
    const co = wk.buildSpectrum(wk.Q_CO60, 28);
    // Mean kinetic energy of the Co-60 main branch is about 95.8 keV (ENSDF).
    close(co.meanT * 1000, 95.8, 2, 'Co-60 mean β energy (keV)');
    return `Co-60 ⟨v/c⟩ = ${co.meanBeta.toFixed(3)}`;
  },
};
