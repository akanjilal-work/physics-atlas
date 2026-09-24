import { assert, close } from '../assert.ts';
import * as cc from '../../src/topics/cosmological-constant/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'vacuum energy: doubling the cutoff multiplies rho by 2^4 = 16': () => {
    for (const e of [1e-3, 246e9, cc.E_PLANCK / 2]) {
      close(cc.rhoCutoff(2 * e) / cc.rhoCutoff(e), 16, 1e-9, `factor at ${e} eV`);
    }
    const slope = (Math.log10(cc.rhoCutoff(1e20)) - Math.log10(cc.rhoCutoff(1e10))) / 10;
    close(slope, 4, 1e-12, 'log-log slope');
    return 'rho(2E)/rho(E) = 16, slope 4';
  },
  'vacuum energy: brute-force standing-wave mode sum approaches kmax^4 / 16 pi^2': () => {
    const r40 = cc.latticeRatio(40);
    const r160 = cc.latticeRatio(160);
    // The lattice misses the n = 0 planes, a surface effect of order 1/n.
    assert(Math.abs(r160 - 1) < Math.abs(r40 - 1), 'error should shrink with n');
    close(r160, 1, 0.03, 'lattice / continuum at n = 160');
    return `ratio ${r40.toFixed(3)} at n=40, ${r160.toFixed(4)} at n=160`;
  },
  'vacuum energy: Planck cutoff gives rho = rho_Planck / 16 pi^2, about 3e111 J/m^3': () => {
    const rho = cc.rhoCutoff(cc.E_PLANCK);
    close(cc.E_PLANCK / 1e28, 1.22089, 2e-4, 'Planck energy in 1e28 eV');
    close(rho / cc.RHO_PLANCK, 1 / (16 * Math.PI * Math.PI), 1e-12, 'ratio to c^7/(hbar G^2)');
    close(Math.log10(cc.RHO_PLANCK), Math.log10(4.633e113), 2e-3, 'Planck density 4.63e113 J/m^3');
    close(Math.floor(Math.log10(rho)), 111, 0, 'order of magnitude');
    return `rho = ${rho.toExponential(2)} J/m^3`;
  },
  'observed dark energy: Omega_L = 0.6847, H0 = 67.36 gives about 5.3e-10 J/m^3 = (2.2 meV)^4': () => {
    const rc = cc.rhoCritical(67.36);
    // rho_crit = 1.87834e-26 h^2 kg/m^3 (PDG), times c^2
    close(rc, 1.87834e-26 * 0.6736 ** 2 * cc.C ** 2, 1e-3 * rc, 'critical density');
    const rho = cc.RHO_OBS;
    close(rho, 5.25e-10, 0.1e-10, 'rho_Lambda');
    const e = cc.energyScale(rho);
    close(e * 1e3, 2.24, 0.03, 'energy scale in meV');
    // The rounded figure "about 6e-10 J/m^3, (2.3 meV)^4" follows from h = 0.7, Omega_L = 0.7.
    const round = cc.rhoLambda(0.7, 70);
    close(round, 5.8e-10, 0.1e-10, 'round-number rho_Lambda');
    close(cc.energyScale(round) * 1e3, 2.3, 0.03, 'round-number scale');
    return `rho = ${rho.toExponential(3)} J/m^3, E = ${(e * 1e3).toFixed(2)} meV, matching cutoff ${(cc.matchingCutoff(rho) * 1e3).toFixed(1)} meV`;
  },
  'mismatch: Planck-cutoff ratio lies between 1e118 and 1e124 for the scene and the naive countings': () => {
    const counts = {
      '1 dof, Planck': cc.rhoCutoff(cc.E_PLANCK) / cc.RHO_OBS,
      'naive (E_P / E_obs)^4': (cc.E_PLANCK / cc.energyScale(cc.RHO_OBS)) ** 4,
      'naive reduced': (cc.E_PLANCK_RED / cc.energyScale(cc.RHO_OBS)) ** 4,
    };
    const logs = Object.entries(counts).map(([k, v]) => {
      const l = Math.log10(v);
      assert(l > 118 && l < 124, `${k}: 10^${l.toFixed(1)}`);
      return `${k} 10^${l.toFixed(1)}`;
    });
    // The most conservative counting (reduced Planck mass and the 1/16 pi^2) lands just below.
    const low = Math.log10(cc.rhoCutoff(cc.E_PLANCK_RED) / cc.RHO_OBS);
    assert(low > 117 && low < 118, `reduced Planck with 16 pi^2: 10^${low}`);
    logs.push(`reduced Planck with 16π² 10^${low.toFixed(1)}`);
    const ew = Math.log10(cc.rhoCutoff(246.22e9) / cc.RHO_OBS);
    assert(ew > 52 && ew < 57, `electroweak ratio 10^${ew}`);
    return `${logs.join(', ')}, electroweak 10^${ew.toFixed(1)}`;
  },
  'supersymmetry: exact cancellation when unbroken, M^4 ln(L/M) residue when broken': () => {
    assert(cc.susyResidueEV4(1e28, 0) === 0, 'unbroken residue must vanish');
    // Stable remainder matches the direct closed form where cancellation is harmless.
    const L = 3;
    const m = 2;
    const s = Math.sqrt(L * L + m * m);
    const direct = (L * (2 * L * L + m * m) * s) / 8 - (m ** 4 / 8) * Math.asinh(L / m);
    close(cc.integralI(L, m), direct, 1e-12, 'closed form');
    // Simpson check of I(3, 2) = int_0^3 k^2 sqrt(k^2 + 4) dk
    const N = 2000;
    let simp = 0;
    for (let i = 0; i <= N; i++) {
      const k = (L * i) / N;
      const f = k * k * Math.sqrt(k * k + m * m);
      simp += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
    }
    simp *= L / N / 3;
    close(cc.integralI(L, m), simp, 1e-8, 'Simpson');
    // Asymptote for L >> M
    const M = 1e12;
    const ex = cc.susyResidueEV4(1e18 * M, M);
    const as = cc.susyResidueAsymptoticEV4(1e18 * M, M);
    close(ex / as, 1, 1e-9, 'asymptotic residue');
    const gain = Math.log10(cc.rhoModel(cc.E_PLANCK, false, M) / cc.rhoModel(cc.E_PLANCK, true, M));
    assert(gain > 55 && gain < 70, `SUSY at 1 TeV removes 10^${gain}`);
    const left = cc.logRatio(cc.E_PLANCK, true, M);
    assert(left > 50, `gap left 10^${left}`);
    return `1 TeV SUSY removes 10^${gain.toFixed(1)}, leaves 10^${left.toFixed(1)}`;
  },
  'vacuum energy: w = -1 keeps rho constant while matter dilutes as a^-3': () => {
    close(cc.rhoOfA(1, cc.W_VACUUM, 1000), 1, 1e-15, 'vacuum');
    close(cc.rhoOfA(1, 0, 10), 1e-3, 1e-15, 'matter');
    close(cc.rhoOfA(1, 1 / 3, 10), 1e-4, 1e-15, 'radiation');
  },
};
