import { assert, close } from '../assert.ts';
import * as de from '../../src/topics/dark-energy/physics.ts';

type Suite = () => string | void;

const DH = de.hubbleDistance(70);

export const suites: Record<string, Suite> = {
  'dark energy: distance modulus μ = 5 log10(d_L/10 pc), with exact empty and Einstein-de Sitter d_L': () => {
    close(de.distanceModulus(1e-5), 0, 1e-12, 'μ at 10 pc');
    close(de.distanceModulus(1), 25, 1e-12, 'μ at 1 Mpc');
    close(de.distanceModulus(1000), 40, 1e-12, 'μ at 1 Gpc');
    let worst = 0;
    for (const z of [0.05, 0.3, 0.8, 1.4]) {
      // Empty (Milne): d_L = (c/H0) z (1 + z/2)
      const dEmpty = de.luminosityDistance(de.lcdm(0, 0), z);
      const exE = DH * z * (1 + z / 2);
      // Einstein-de Sitter: d_L = (2c/H0)(1 + z)(1 − 1/sqrt(1+z))
      const dEds = de.luminosityDistance(de.lcdm(1, 0), z);
      const exM = 2 * DH * (1 + z) * (1 - 1 / Math.sqrt(1 + z));
      worst = Math.max(worst, Math.abs(dEmpty / exE - 1), Math.abs(dEds / exM - 1));
    }
    assert(worst < 1e-9, `relative error ${worst}`);
    // Low-z expansion: d_L ≈ (cz/H0)[1 + (1 − q0) z/2] for flat ΛCDM
    const m = de.lcdm(0.3, 0.7);
    const z = 0.005;
    const approx = DH * z * (1 + ((1 - de.q0(m)) * z) / 2);
    close(de.luminosityDistance(m, z) / approx, 1, 2e-5, 'low-z series');
    return `worst rel. error ${worst.toExponential(1)}`;
  },
  'dark energy: ρ ∝ a^{−3(1+w)} matches RK4 integration of the continuity equation': () => {
    // dρ/da = −3(1 + w(a)) ρ / a, integrated from a = 1 to a = 0.2 and to a = 3.
    let worst = 0;
    const cases: de.Model[] = [
      { Om: 0, Ode: 1, w0: -1, wa: 0 },
      { Om: 0, Ode: 1, w0: 0, wa: 0 },
      { Om: 0, Ode: 1, w0: 1 / 3, wa: 0 },
      { Om: 0, Ode: 1, w0: -1 / 3, wa: 0 },
      { Om: 0, Ode: 1, w0: -1.3, wa: 0 },
      { Om: 0, Ode: 1, w0: -0.75, wa: -0.85 },
    ];
    for (const m of cases) {
      for (const aEnd of [0.2, 3]) {
        const N = 4000;
        const h = (aEnd - 1) / N;
        let a = 1;
        let r = 1;
        const f = (x: number, y: number) => (-3 * (1 + de.wOf(m, x)) * y) / x;
        for (let i = 0; i < N; i++) {
          const k1 = f(a, r);
          const k2 = f(a + h / 2, r + (h / 2) * k1);
          const k3 = f(a + h / 2, r + (h / 2) * k2);
          const k4 = f(a + h, r + h * k3);
          r += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
          a += h;
        }
        worst = Math.max(worst, Math.abs(r / de.deDensity(m, aEnd) - 1));
      }
    }
    assert(worst < 1e-9, `closed form vs RK4 ${worst}`);
    // Named cases: w = −1 constant, w = 0 like matter (a⁻³), w = 1/3 like radiation (a⁻⁴).
    const w = (x: number): de.Model => ({ Om: 0, Ode: 1, w0: x, wa: 0 });
    close(de.deDensity(w(-1), 0.5), 1, 1e-14, 'w=−1 constant');
    close(de.deDensity(w(-1), 7), 1, 1e-14, 'w=−1 constant');
    close(de.deDensity(w(0), 0.5), 8, 1e-12, 'w=0 → a^-3');
    close(de.deDensity(w(1 / 3), 0.5), 16, 1e-12, 'w=1/3 → a^-4');
    close(de.deDensity(w(-1 / 3), 0.5), 4, 1e-12, 'w=−1/3 → a^-2');
    return `worst ${worst.toExponential(1)}`;
  },
  'dark energy: χ² grid fit recovers the input (Ω_m, Ω_Λ) within errors on synthetic data': () => {
    const notes: string[] = [];
    // Noise-free data: the minimum must land on the input to grid precision.
    const clean = de.generateSN(de.lcdm(0.3, 0.7), 120, 0.15, 7);
    clean.mu.set(clean.muTrue);
    const f0 = de.fitGrid(clean);
    close(f0.bestOm, 0.3, 0.02, 'noise-free Ω_m');
    close(f0.bestOl, 0.7, 0.03, 'noise-free Ω_Λ');
    // Noisy data from three universes and several seeds: truth inside the 99.7% contour,
    // and inside the 95% contour in most trials, as expected statistically.
    let inside95 = 0;
    let trials = 0;
    for (const [om, ol] of [[0.3, 0.7], [0.5, 0.3], [1, 0]]) {
      for (const seed of [11, 22, 33, 44]) {
        const d = de.generateSN(de.lcdm(om, ol), 250, 0.15, seed);
        const f = de.fitGrid(d);
        const dTrue = de.chi2Model(d, de.lcdm(om, ol)) - f.chi2Min;
        assert(dTrue < de.DCHI2_LEVELS[2], `truth (${om}, ${ol}) outside 3σ: Δχ² = ${dTrue.toFixed(2)}`);
        if (dTrue < de.DCHI2_LEVELS[1]) inside95++;
        trials++;
      }
      notes.push(`(${om},${ol})`);
    }
    assert(inside95 >= trials - 2, `only ${inside95}/${trials} inside 95%`);
    // Matter-only is rejected by data drawn from a Λ universe.
    const d = de.generateSN(de.lcdm(0.3, 0.7), 150, 0.15, 5);
    const f = de.fitGrid(d);
    const dEds = de.chi2Model(d, de.lcdm(1, 0)) - f.chi2Min;
    assert(dEds > 50, `EdS not rejected: Δχ² ${dEds}`);
    return `${inside95}/${trials} inside 95%, EdS Δχ² = ${dEds.toFixed(0)}`;
  },
  'dark energy: q < 0 exactly when w < −1/3 in a DE-dominated universe (analytic and integrated)': () => {
    for (const w of [-1.5, -1, -0.6, -0.34, -0.32, 0, 1 / 3]) {
      const m: de.Model = { Om: 0, Ode: 1, w0: w, wa: 0 };
      close(de.q0(m), (1 + 3 * w) / 2, 1e-14, 'q0');
      close(de.decel(m, 0.4), (1 + 3 * w) / 2, 1e-12, 'q(a)');
      // Integrated: second derivative of a(t) from the RK4 solution around today.
      const h = de.buildHistory(m, { tPast: 5, tFuture: 5 });
      const dt = 0.2;
      const add = (de.aAtTime(h, dt) - 2 * de.aAtTime(h, 0) + de.aAtTime(h, -dt)) / (dt * dt);
      assert(w < -1 / 3 ? add > 0 : add < 0, `w=${w}: ä=${add}`);
    }
    return 'sign flips between w = −0.34 and −0.32';
  },
  'dark energy: RK4 a(t) gives analytic ages and acceleration redshift, Friedmann check < 1e-9': () => {
    const H = de.h0Gyr(70);
    const eds = de.buildHistory(de.lcdm(1, 0));
    close(eds.age, 2 / (3 * H), 1e-6, 'EdS age 2/(3H0)');
    const m = de.lcdm(0.3, 0.7);
    const h = de.buildHistory(m);
    const exact = (2 / (3 * H * Math.sqrt(0.7))) * Math.asinh(Math.sqrt(0.7 / 0.3));
    close(h.age, exact, 1e-5, 'flat ΛCDM age');
    close(1 / h.aAcc - 1, Math.cbrt((2 * 0.7) / 0.3) - 1, 1e-4, 'z_acc');
    close(de.lookbackFromHistory(h, 1), de.lookbackTime(m, 1), 1e-4, 'lookback to z=1');
    assert(h.maxConstraint < 1e-9, `constraint ${h.maxConstraint}`);
    return `age ${h.age.toFixed(3)} Gyr (exact ${exact.toFixed(3)}), constraint ${h.maxConstraint.toExponential(0)}`;
  },
};
