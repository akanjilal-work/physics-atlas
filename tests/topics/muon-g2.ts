import { assert, close } from '../assert.ts';
import * as g2 from '../../src/topics/muon-g2/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'muon g-2: magic gamma = sqrt(1 + 1/a) = 29.3, p = 3.094 GeV/c, E-term vanishes': () => {
    const a = g2.A_MU_FNAL;
    const gm = g2.magicGamma(a);
    close(gm, 29.30, 0.01, 'magic gamma');
    const p = g2.magicMomentum(a);
    close(p, 3.094, 0.001, 'magic momentum (GeV/c)');
    close(g2.gammaFromP(p), gm, 1e-9, 'gamma from magic momentum');
    close(g2.eFieldCoefficient(a, gm), 0, 1e-15, 'E coefficient at magic gamma');
    // Away from magic, a radial E field shifts omega_a. At magic it does nothing.
    const off = g2.omegaAWithE(1.45, a, g2.gammaFromP(2.9), 1e5) / g2.omegaA(1.45, a) - 1;
    const on = g2.omegaAWithE(1.45, a, gm, 1e5) / g2.omegaA(1.45, a) - 1;
    assert(Math.abs(off) > 1e-5 && Math.abs(on) < 1e-12, `off ${off}, on ${on}`);
    return `gamma ${gm.toFixed(3)}, p ${p.toFixed(4)} GeV/c`;
  },
  'muon g-2: omega_s - omega_c = a eB/m for any gamma, f_a = 229 kHz at 1.45 T': () => {
    const a = g2.A_MU_FNAL;
    for (const g of [1.5, 10, 29.3, 100]) {
      const diff = g2.omegaS(1.45, g, a) - g2.omegaC(1.45, g);
      close(diff / g2.omegaA(1.45, a), 1, 1e-9, `gamma ${g}`);
    }
    const fa = g2.omegaA(1.45, a) / (2 * Math.PI);
    close(fa / 1e3, 229, 0.5, 'f_a (kHz)');
    const fc = g2.omegaC(1.45, g2.magicGamma(a)) / (2 * Math.PI);
    close(1e9 / fc, 149, 1, 'cyclotron period (ns)');
    close(g2.orbitRadius(g2.magicMomentum(a), 1.45), 7.112, 0.01, 'orbit radius (m)');
    return `f_a ${(fa / 1e3).toFixed(1)} kHz, T_c ${(1e9 / fc).toFixed(1)} ns`;
  },
  'muon g-2: dilated lifetime gamma tau = 64.4 us at magic momentum': () => {
    const tau = g2.labLifetime(g2.magicGamma(g2.A_MU_FNAL));
    // CERN-III (Bailey et al. 1977) predicted 64.378 us for gamma 29.327 and measured 64.419(58) us.
    close(tau * 1e6, 64.38, 0.05, 'gamma tau (us)');
    return `${(tau * 1e6).toFixed(2)} us`;
  },
  'muon g-2: wiggle fitter recovers omega_a from synthetic Poisson data': () => {
    const r = g2.rng(12345);
    const g = g2.magicGamma(g2.A_MU_FNAL);
    const tau = g2.labLifetime(g) * 1e6;
    const w = g2.omegaA(1.45, g2.A_MU_FNAL) * 1e-6; // rad/us
    const binW = (2 * Math.PI) / w / 10;
    const hist = new Float64Array(240);
    g2.sampleDecays(r, 400000, hist, binW, tau, g2.ASYM, w, 0.3);
    const f = g2.fitWiggle(hist, binW);
    assert(f.ok, 'fit failed');
    close(f.omega / w, 1, 0.002, 'omega ratio');
    close(f.tau / tau, 1, 0.02, 'tau ratio');
    close(f.A, g2.ASYM, 0.02, 'asymmetry');
    assert(f.chi2ndf < 1.4, `chi2/ndf ${f.chi2ndf}`);
    assert(Math.abs(f.omega - w) < 4 * f.sigmaOmega, `pull ${(f.omega - w) / f.sigmaOmega}`);
    // A different frequency and phase is also recovered
    hist.fill(0);
    const w2 = 2 * w;
    g2.sampleDecays(r, 400000, hist, binW, tau, g2.ASYM, w2, -2);
    const f2 = g2.fitWiggle(hist, binW);
    close(f2.omega / w2, 1, 0.002, 'omega ratio at 2 omega_a');
    return `rel err ${((f.omega / w - 1) * 100).toFixed(3)}% (sigma ${((f.sigmaOmega / w) * 100).toFixed(3)}%), chi2/ndf ${f.chi2ndf.toFixed(2)}`;
  },
  'muon g-2: (m_mu/m_e)^2 = 42,750': () => {
    const r = g2.massRatioSquared();
    close(r, 42753, 5, '(m_mu/m_e)^2');
    return r.toFixed(0);
  },
  'muon g-2: quoted tensions 4.2 sigma (2021), 0.6 sigma (2025)': () => {
    const t21 = g2.tension(g2.A_MU_EXP_2021, g2.A_MU_EXP_2021_ERR, g2.A_MU_SM_2020, g2.A_MU_SM_2020_ERR);
    close(t21, 4.2, 0.05, '2021 tension');
    const t25 = g2.tension(g2.A_MU_WORLD, g2.A_MU_WORLD_ERR, g2.A_MU_SM_2025, g2.A_MU_SM_2025_ERR);
    assert(t25 < 1, `2025 tension ${t25}`);
    close((g2.A_MU_WORLD - g2.A_MU_SM_2025) * 1e11, 38.5, 0.1, 'difference (1e-11)');
    close((g2.A_MU_FNAL_ERR / g2.A_MU_FNAL) * 1e9, 127, 1, 'FNAL precision (ppb)');
    return `2021: ${t21.toFixed(2)} sigma, 2025: ${t25.toFixed(2)} sigma`;
  },
};
