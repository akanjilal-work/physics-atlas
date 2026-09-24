import { assert, close } from '../assert.ts';
import * as el from '../../src/topics/the-electron/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'electron: Schwinger term alpha/2pi = 0.0011614097 (CODATA 2018 alpha)': () => {
    const s = el.schwinger();
    close(s, 1.16140973e-3, 1e-11, 'alpha/2pi');
    close(el.qedTerm(1, 1 / el.ALPHA), s, 1e-18, 'first QED term');
    return `alpha/2pi = ${s.toPrecision(10)}`;
  },
  'electron: spin precession 28.0250 GHz/T (CODATA 2018: 28 024.95 MHz/T)': () => {
    const f = el.spinFreq(1);
    close(f / 1e6, 28024.9514242, 0.01, 'gamma_e/2pi in MHz/T');
    close(el.spinOmega(1) / (2 * Math.PI), f, 1e-3, 'omega/2pi');
    close(el.cyclotronFreq(1) / 1e9, 27.99249, 1e-4, 'cyclotron GHz/T');
    close(el.anomalyFreq(1) / el.cyclotronFreq(1), el.AE_EXP, 1e-15, 'nu_a/nu_c = a_e');
    return `${(f / 1e9).toFixed(5)} GHz/T`;
  },
  'electron: Compton wavelength 2.42631023867e-12 m and rest energy 0.51099895 MeV': () => {
    close(el.comptonWavelength(), 2.42631023867e-12, 2e-22, 'lambda_C');
    close(el.restEnergyMeV(), 0.51099895, 1e-9, 'mc^2');
    close(el.MU_B, 9.2740100783e-24, 3e-33, 'mu_B');
    return `lambda_C = ${el.comptonWavelength().toExponential(10)} m`;
  },
  'electron: classical radius 2.8179403262e-15 m and Bohr radius 5.29177210903e-11 m': () => {
    close(el.classicalRadius(), 2.8179403262e-15, 3e-25, 'r_e');
    close(el.bohrRadius(), 5.29177210903e-11, 2e-20, 'a0');
    close(el.classicalRadius() / el.reducedCompton(), el.ALPHA, 1e-15, 'r_e / lambda-bar = alpha');
    return `r_e = ${el.classicalRadius().toExponential(10)} m`;
  },
  'electron: QED partial sums converge on the measured a_e': () => {
    const ia = el.INV_ALPHA_CS;
    let prev = Infinity;
    const diffs: string[] = [];
    for (let n = 0; n <= el.MAX_ORDER; n++) {
      const d = Math.abs(el.aePrediction(n, ia) - el.AE_EXP);
      assert(d < prev, `order ${n} did not improve: ${d} vs ${prev}`);
      prev = d;
      diffs.push(d.toExponential(1));
    }
    assert(Math.abs(el.aePrediction(2, ia) - el.AE_EXP) > 1e-9, 'two loops should miss by more than 1e-9');
    assert(Math.abs(el.aePrediction(3, ia) - el.AE_EXP) < 1e-9, 'three loops should land within 1e-9');
    // Full prediction with alpha(Cs) as published by Aoyama, Kinoshita, Nio (2019): 1 159 652 181.606(230) e-12.
    close(el.aePrediction(el.MAX_ORDER, ia), 1159652181.606e-12, 0.02e-12, 'full a_e with alpha(Cs)');
    // Both alpha values land within ~1.5e-12 of experiment, on opposite sides.
    const dCs = el.aePrediction(el.MAX_ORDER, el.INV_ALPHA_CS) - el.AE_EXP;
    const dRb = el.aePrediction(el.MAX_ORDER, el.INV_ALPHA_RB) - el.AE_EXP;
    assert(dCs > 0.5e-12 && dCs < 1.5e-12, `Cs residual ${dCs}`);
    assert(dRb < 0 && dRb > -0.6e-12, `Rb residual ${dRb}`);
    return `|diff| by order: ${diffs.join(', ')}; Cs ${(dCs * 1e12).toFixed(2)}e-12, Rb ${(dRb * 1e12).toFixed(2)}e-12`;
  },
  'electron: Penning trap invariance theorem nu_c^2 = nu_+^2 + nu_z^2 + nu_-^2': () => {
    const nuC = el.cyclotronFreq(5.36);
    const nuZ = 200e6;
    const { plus, minus } = el.trapFrequencies(nuC, nuZ);
    close((plus * plus + minus * minus + nuZ * nuZ) / (nuC * nuC), 1, 1e-12, 'invariance');
    close(minus, (nuZ * nuZ) / (2 * plus), minus * 1e-6, 'magnetron ~ nu_z^2 / 2 nu_+');
    return `nu_c ${(nuC / 1e9).toFixed(2)} GHz, magnetron ${(minus / 1e3).toFixed(1)} kHz`;
  },
  'electron: Stern-Gerlach deflection scales as G L^2 / v^2': () => {
    const m = 107.8682 * el.U_KG;
    const d = el.sgDeflection(1000, 0.035, 500, m);
    close(d, (el.MU_B * 1000 * 0.035 ** 2) / (2 * m * 500 ** 2), 1e-18, 'formula');
    close(el.sgDeflection(1000, 0.035, 250, m) / d, 4, 1e-12, 'half speed, four times deflection');
    return `silver, 1000 T/m, 3.5 cm, 500 m/s: ${(d * 1e3).toFixed(3)} mm`;
  },
};
