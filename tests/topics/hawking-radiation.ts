import { assert, close } from '../assert.ts';
import * as hr from '../../src/topics/hawking-radiation/physics.ts';

type Suite = () => string | void;

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

export const suites: Record<string, Suite> = {
  'hawking: T_H for one solar mass is 6.17e-8 K': () => {
    const T = hr.hawkingT(hr.M_SUN);
    assert(rel(T, 6.17e-8) < 2e-3, `T = ${T}`);
    return `T = ${T.toExponential(3)} K`;
  },
  'hawking: T ∝ 1/M (halving M doubles T), P = σAT⁴': () => {
    for (const M of [1e9, 2e19, 7e22, hr.M_SUN]) {
      close(hr.hawkingT(M / 2) / hr.hawkingT(M), 2, 1e-12, 'T ratio');
      assert(rel(hr.power(M), hr.SIGMA * hr.horizonArea(M) * hr.hawkingT(M) ** 4) < 1e-10, 'P != σAT⁴');
    }
  },
  'hawking: lifetime ∝ M³, solar mass ≈ 2.1e67 yr, dying-today mass (photons only) ≈ 1.7e11 kg': () => {
    const tSun = hr.lifetime(hr.M_SUN) / hr.YEAR;
    assert(rel(tSun, 2.096e67) < 3e-3, `t_sun = ${tSun}`);
    close(hr.lifetime(3e20) / hr.lifetime(1e20), 27, 1e-9, 'cube law');
    const m = hr.massForLifetime(hr.AGE_UNIVERSE_YR * hr.YEAR);
    assert(rel(m, 1.73e11) < 1e-2, `M_today = ${m}`);
    return `t_sun = ${tSun.toExponential(3)} yr, M_today = ${m.toExponential(2)} kg`;
  },
  'hawking: entropy ∝ M², solar mass S ≈ 1.05e77 k_B, equals 4πGM²/(ħc)': () => {
    const S = hr.entropy(hr.M_SUN);
    assert(rel(S, 1.049e77) < 3e-3, `S = ${S}`);
    close(hr.entropy(2e25) / hr.entropy(1e25), 4, 1e-12, 'square law');
    assert(rel(S, (4 * Math.PI * hr.G * hr.M_SUN ** 2) / (hr.HBAR * hr.C)) < 1e-12, 'closed form');
    return `S = ${S.toExponential(3)} k_B`;
  },
  'hawking: CMB-balance mass ≈ 4.50e22 kg, net power flips sign there': () => {
    const m = hr.massForTemperature(hr.T_CMB);
    assert(rel(m, 4.502e22) < 2e-3, `M = ${m}`);
    close(hr.hawkingT(m), hr.T_CMB, 1e-12, 'T at balance');
    assert(hr.netPower(m * 0.9, hr.T_CMB) > 0 && hr.netPower(m * 1.1, hr.T_CMB) < 0, 'sign');
    assert(hr.netPower(hr.M_SUN, hr.T_CMB) < 0, 'stellar holes absorb more than they emit');
    return `M = ${m.toExponential(3)} kg`;
  },
  'hawking: RK4 mass loss matches closed form M(τ) = [3Kτ]^(1/3)': () => {
    const M0 = 1e12;
    const t0 = hr.lifetime(M0);
    const dt = 0.9 * t0;
    const m = hr.evolveMass(M0, dt);
    const exact = hr.massForLifetime(t0 - dt);
    const e = rel(m, exact);
    assert(e < 1e-8, `rel err ${e}`);
    return `rel err ${e.toExponential(1)}`;
  },
  'hawking: heat capacity is negative and equals dMc²/dT': () => {
    const M = 1e20;
    const dM = M * 1e-6;
    const num = ((dM * hr.C ** 2) / (hr.hawkingT(M + dM) - hr.hawkingT(M - dM))) * 2;
    assert(hr.heatCapacity(M) < 0, 'sign');
    assert(rel(num, hr.heatCapacity(M)) < 1e-6, `num ${num} vs ${hr.heatCapacity(M)}`);
  },
};
