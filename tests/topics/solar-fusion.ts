import { assert, close } from '../assert.ts';
import * as sf from '../../src/topics/solar-fusion/physics.ts';

type Suite = () => string | void;

const T_CORE = 15.7e6;

export const suites: Record<string, Suite> = {
  'solar fusion: 4 ¹H → ⁴He mass defect is 26.73 MeV': () => {
    const q = sf.qFourPToHe();
    // Published value 26.731 MeV (e.g. Adelberger et al. 2011).
    close(q, 26.731, 0.002, 'Q(4p→He)');
    // Independent check with nuclear masses plus two annihilations: 4 m_p - m_α - 2 m_e + 2 × 2 m_e.
    const mp = 938.27208816;
    const mAlpha = 3727.3794066;
    const qNuc = 4 * mp - mAlpha - 2 * sf.ME_MEV + 4 * sf.ME_MEV;
    close(q, qNuc, 0.002, 'nuclear-mass route');
    return `Q = ${q.toFixed(3)} MeV`;
  },
  'solar fusion: pp-I energy bookkeeping sums to Q, neutrinos take about 0.53 MeV': () => {
    const steps = sf.ppIChain();
    close(steps[0].Q, 1.442, 0.001, 'p+p');
    close(steps[1].Q, 5.493, 0.001, 'd+p');
    close(steps[2].Q, 12.860, 0.001, '3He+3He');
    close(sf.qPPKinetic(), 0.420, 0.001, 'pp kinetic (max neutrino energy)');
    const sum = steps.reduce((a, s) => a + s.times * s.Q, 0);
    close(sum, sf.qFourPToHe(), 1e-9, 'sum of steps');
    const nu = steps.reduce((a, s) => a + s.times * s.nu, 0);
    close(nu, 0.53, 0.01, 'neutrino share');
    return `sum ${sum.toFixed(3)} MeV, ν ${nu.toFixed(3)} MeV, heat ${(sum - nu).toFixed(2)} MeV`;
  },
  'solar fusion: pp Coulomb barrier at 2.6 fm is about 550 keV, 400× kT at 15.7 MK': () => {
    // e²/(4π ε0) from SI constants, converted to keV fm.
    const e = 1.602176634e-19;
    const eps0 = 8.8541878128e-12;
    const ke2 = (e * e) / (4 * Math.PI * eps0) / e / 1e3 / 1e-15;
    close(ke2, sf.E2_KEV_FM, 0.01, 'e²/4πε0 in keV fm');
    const V = sf.barrierHeight(sf.PAIRS.pp);
    close(sf.contactRadius(sf.PAIRS.pp), 2.6, 1e-12, 'R');
    close(V, ke2 / 2.6, 0.01, 'V_C');
    const kT = sf.kTkeV(T_CORE);
    close(kT, 1.353, 0.001, 'kT');
    assert(V / kT > 100, `ratio ${V / kT}`);
    return `V_C = ${V.toFixed(0)} keV, kT = ${kT.toFixed(3)} keV, ratio ${(V / kT).toFixed(0)}`;
  },
  'solar fusion: Gamow energy E_G = 2 m_r c² (πα Z1Z2)² gives 493 keV for pp': () => {
    const EG = sf.gamowEnergy(sf.PAIRS.pp);
    // m_r c² = m_p c² / 2 = 469.136 keV × 1000
    const direct = 2 * 469136.04 * (Math.PI / 137.035999084) ** 2;
    close(EG, direct, 0.5, 'E_G');
    close(EG, 493, 1, 'E_G literature ≈ 493 keV');
    // It must match (2πη)² E, the Sommerfeld exponent squared: 2πη = 2π Z1Z2 α c/v.
    const E = 10;
    const v = Math.sqrt((2 * E) / (sf.reducedMassKeV(sf.PAIRS.pp)));
    const twoPiEta = (2 * Math.PI * sf.ALPHA) / v;
    close(Math.sqrt(EG / E), twoPiEta, 1e-9, 'sqrt(E_G/E) = 2πη');
    // WKB integral through a pure Coulomb barrier with a tiny inner radius tends to sqrt(E_G/E).
    const g = sf.wkbExponentNumeric(sf.PAIRS.pp, E, 1e-4, 200000);
    close(g, sf.wkbExponent(sf.PAIRS.pp, E, 1e-4), 1e-4, 'WKB numeric vs closed form, tiny R');
    assert(Math.abs(g / Math.sqrt(EG / E) - 1) < 0.003, `WKB limit ${g} vs ${Math.sqrt(EG / E)}`);
    close(sf.wkbExponent(sf.PAIRS.pp, 6), sf.wkbExponentNumeric(sf.PAIRS.pp, 6), 1e-4, 'WKB closed form with R');
    return `E_G = ${EG.toFixed(1)} keV`;
  },
  'solar fusion: Gamow peak E0 = (E_G (kT)²/4)^(1/3) ≈ 6 keV and matches the numerical maximum': () => {
    const EG = sf.gamowEnergy(sf.PAIRS.pp);
    const kT = sf.kTkeV(T_CORE);
    const E0 = sf.gamowPeak(EG, kT);
    const num = sf.gamowPeakNumeric(EG, kT);
    close(E0, num, 1e-5, 'closed form vs golden search');
    close(E0, 6.1, 0.1, 'E0 at 15.7 MK');
    // Gaussian (steepest descent) estimate of the integral: sqrt(π)/2 Δ e^{-3E0/kT}.
    const est = (Math.sqrt(Math.PI) / 2) * sf.gamowWidth(EG, kT) * Math.exp((-3 * E0) / kT);
    const I = sf.gamowIntegral(EG, kT);
    assert(Math.abs(I / est - 1) < 0.05, `integral ${I} vs Gaussian ${est}`);
    return `E0 = ${E0.toFixed(2)} keV, Δ = ${sf.gamowWidth(EG, kT).toFixed(2)} keV`;
  },
  'solar fusion: rates, steepness, crossover and neutrino flux': () => {
    const life = sf.protonLifetimeYears(T_CORE);
    assert(life > 2e9 && life < 3e10, `proton lifetime ${life}`);
    const e = sf.tempExponents(T_CORE);
    close(e.pp, sf.gamowSteepness(sf.gamowEnergy(sf.PAIRS.pp), sf.kTkeV(T_CORE)), 0.05, 'pp steepness vs τ/3 − 2/3');
    assert(e.pp > 3.5 && e.pp < 4.5, `pp exponent ${e.pp}`);
    assert(e.cno > 16 && e.cno < 22, `CNO exponent ${e.cno}`);
    const r = sf.heatingRates(T_CORE);
    assert(r.cno < r.pp, 'pp should dominate at 15.7 MK');
    const hot = sf.heatingRates(25e6);
    assert(hot.cno > hot.pp, 'CNO should dominate at 25 MK');
    const flux = sf.neutrinoFlux();
    close(flux / 1e10, 6.5, 0.1, 'neutrino flux / 1e10');
    return `τ_p ≈ ${(life / 1e9).toFixed(1)} Gyr, ν_pp ${e.pp.toFixed(2)}, ν_CNO ${e.cno.toFixed(1)}, Φν ${(flux / 1e10).toFixed(2)}e10`;
  },
};
