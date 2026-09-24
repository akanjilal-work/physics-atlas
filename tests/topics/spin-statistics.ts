import { assert, close } from '../assert.ts';
import * as ss from '../../src/topics/spin-statistics/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'spin-statistics: antisymmetric wavefunction vanishes on the diagonal and flips sign on swap': () => {
    let worst = 0;
    for (const [a, b] of [[1, 2], [1, 3], [2, 5], [3, 4]]) {
      for (let k = 1; k < 50; k++) {
        const x = k / 50;
        worst = Math.max(worst, Math.abs(ss.psi('fermion', a, b, x, x)));
        const y = (k * 0.37) % 1;
        close(ss.psi('fermion', a, b, x, y), -ss.psi('fermion', a, b, y, x), 1e-12, 'antisymmetry');
        close(ss.psi('boson', a, b, x, y), ss.psi('boson', a, b, y, x), 1e-12, 'symmetry');
      }
    }
    assert(worst < 1e-12, `max |psi| on diagonal ${worst}`);
    // Pauli: same state gives no fermion state at all
    assert(ss.pairStats('fermion', 2, 2, 60).norm === 0, 'fermions in the same state should vanish');
    return `max |ψ_A(x,x)| = ${worst.toExponential(1)}`;
  },
  'spin-statistics: boson density is twice the distinguishable density on the diagonal (a ≠ b), norms = 1': () => {
    for (const [a, b] of [[1, 2], [1, 3], [2, 3]]) {
      for (const x of [0.13, 0.31, 0.62, 0.77]) close(ss.diagonalRatio('boson', a, b, x), 2, 1e-12, `ratio ${a},${b} at ${x}`);
      for (const k of ['dist', 'boson', 'fermion'] as const) close(ss.pairStats(k, a, b).norm, 1, 1e-9, `norm ${k} ${a},${b}`);
    }
    // same-state pair: the symmetric state is the product itself, so the ratio is 1
    close(ss.diagonalRatio('boson', 2, 2, 0.3), 1, 1e-12, 'same state ratio');
    return 'ratio 2.000 for n₁ ≠ n₂, 1 for n₁ = n₂';
  },
  'spin-statistics: exchange "force" <(x1-x2)²> matches Griffiths closed form': () => {
    // <1|x|2> on [0,1] is -16/(9π²)
    close(ss.xAB(1, 2), -16 / (9 * Math.PI ** 2), 1e-15, 'x12');
    // numerical matrix element
    let num = 0;
    const M = 20000;
    for (let i = 0; i < M; i++) {
      const x = (i + 0.5) / M;
      num += ss.phi(1, x) * x * ss.phi(2, x) / M;
    }
    close(num, ss.xAB(1, 2), 1e-8, 'x12 numeric');
    const out: string[] = [];
    for (const k of ['dist', 'boson', 'fermion'] as const) {
      const g = ss.pairStats(k, 1, 2, 400).sep2;
      close(g, ss.sep2Analytic(k, 1, 2), 2e-5, `${k} sep2`);
      out.push(`${k} ${Math.sqrt(g).toFixed(3)}`);
    }
    assert(ss.sep2Analytic('boson', 1, 2) < ss.sep2Analytic('dist', 1, 2), 'bosons closer');
    assert(ss.sep2Analytic('fermion', 1, 2) > ss.sep2Analytic('dist', 1, 2), 'fermions farther');
    return `rms separation ${out.join(', ')}`;
  },
  'spin-statistics: FD ≤ 1, BE μ below ground, all three agree when (E-μ)/kT ≫ 1': () => {
    for (let x = -40; x <= 40; x += 0.25) {
      const f = ss.fd(x);
      assert(f >= 0 && f <= 1, `fd(${x}) = ${f}`);
    }
    close(ss.fd(0), 0.5, 1e-15, 'fd(0)');
    for (const x of [8, 12]) {
      close(ss.fd(x) / ss.mb(x), 1, 1e-3, 'fd→mb');
      close(ss.be(x) / ss.mb(x), 1, 1e-3, 'be→mb');
    }
    for (const kT of [0.05, 0.5, 3]) {
      for (const N of [1, 6, 20]) {
        for (const k of ['dist', 'boson', 'fermion'] as const) {
          const { mu, occ } = ss.subshellOcc(k, N, kT);
          close(occ.reduce((s, v) => s + v, 0), N, 1e-6, `sum ${k} N=${N} kT=${kT}`);
          if (k === 'boson') assert(mu < ss.SUBSHELLS[0].E, 'BE mu below ground');
          if (k === 'fermion') ss.SUBSHELLS.forEach((s, i) => assert(occ[i] <= 2 * s.orbitals + 1e-12, 'FD capacity'));
        }
      }
    }
    const cold = ss.subshellOcc('boson', 10, 0.05).occ[0];
    close(cold, 10, 1e-6, 'bosons all in ground state at low T');
    return `10 bosons at kT = 0.05: N₀ = ${cold.toFixed(6)}`;
  },
  'spin-statistics: simple Aufbau gives shell capacities 2, 8, 8 and closed shells at He, Ne, Ar': () => {
    const caps = [1, 2, 3].map(ss.periodCapacity);
    assert(caps.join(',') === '2,8,8', `capacities ${caps}`);
    assert(ss.periodCapacity(4) === 18, 'period 4 block 4s 3d 4p holds 18');
    assert(ss.configString(ss.aufbau(10)) === '1s² 2s² 2p⁶', ss.configString(ss.aufbau(10)));
    assert(ss.configString(ss.aufbau(18)) === '1s² 2s² 2p⁶ 3s² 3p⁶', 'Ar');
    assert(ss.configString(ss.aufbau(19)) === '1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹', 'K goes to 4s, not 3d');
    assert(ss.configString(ss.aufbau(20)).endsWith('4s²'), 'Ca');
    // the cold Fermi–Dirac filling reproduces the Aufbau filling
    for (const Z of [2, 10, 18, 20]) {
      const o = ss.subshellOcc('fermion', Z, 0.02).occ;
      ss.aufbau(Z).forEach((v, i) => close(o[i], v, 1e-6, `FD vs Aufbau Z=${Z} ${ss.SUBSHELLS[i].name}`));
    }
    return `capacities ${caps.join(', ')}. Ne = ${ss.configString(ss.aufbau(10))}`;
  },
  'spin-statistics: HOM coincidence is 0 at zero delay for identical photons': () => {
    close(ss.homCoincidence('boson', 0), 0, 1e-15, 'boson at 0');
    close(ss.homCoincidence('boson', 10), 0.5, 1e-12, 'boson far');
    close(ss.homCoincidence('dist', 0), 0.5, 1e-15, 'distinguishable');
    close(ss.homCoincidence('fermion', 0), 1, 1e-15, 'fermions always split');
    close(ss.homVisibility('boson'), 1, 1e-12, 'V boson');
    // independent operator-algebra route
    for (const k of ['dist', 'boson', 'fermion'] as const) {
      for (const tau of [0, 0.3, 0.8, 1.5, 3]) close(ss.homFromOperators(k, ss.packetOverlap(tau)), ss.homCoincidence(k, tau), 1e-12, `${k} τ=${tau}`);
    }
    return 'P_c(0) = 0, P_c(∞) = ½, V = 1';
  },
};
