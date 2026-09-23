import { assert, close } from '../assert.ts';
import * as sc from '../../src/topics/superconductivity/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'superconductivity: flux quantum h/2e = 2.067833848e-15 Wb (CODATA)': () => {
    close(sc.PHI0, 2.067833848e-15, 1e-24, 'Phi0');
    return `Φ0 = ${sc.PHI0.toExponential(9)} Wb`;
  },
  'superconductivity: London decay e^{-x/λ} integrates to λ and obeys B\'\' = B/λ²': () => {
    const lam = 42e-9;
    const L = 40 * lam;
    const n = 4000;
    const h = L / n;
    let sum = sc.londonField(0, 1, lam) + sc.londonField(L, 1, lam);
    for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * sc.londonField(i * h, 1, lam);
    const integral = (sum * h) / 3;
    close(integral / lam, 1, 1e-9, 'integral / λ');
    const x = 1.3 * lam;
    const d = lam * 1e-3;
    const d2 = (sc.londonField(x + d, 1, lam) - 2 * sc.londonField(x, 1, lam) + sc.londonField(x - d, 1, lam)) / (d * d);
    close(d2 * lam * lam / sc.londonField(x, 1, lam), 1, 1e-5, 'λ² B\'\' / B');
    return `∫B dx / (B0 λ) = ${(integral / lam).toFixed(12)}`;
  },
  'superconductivity: London depth from n_s = 1e28 m^-3 is about 53 nm': () => {
    // λ = sqrt(m / μ0 n e²) = 53.1 nm for n = 1e28 m^-3 (standard textbook estimate).
    const lam = sc.londonDepthFromDensity(1e28);
    close(lam * 1e9, 53.14, 0.05, 'λ (nm)');
    return `λ = ${(lam * 1e9).toFixed(2)} nm`;
  },
  'superconductivity: critical field endpoints B_c(0), B_c(Tc)=0, B_c(Tc/√2)=B_c(0)/2': () => {
    const Bc0 = 0.041;
    const Tc = 4.15;
    close(sc.criticalField(0, Bc0, Tc), Bc0, 1e-15, 'B_c(0)');
    close(sc.criticalField(Tc, Bc0, Tc), 0, 1e-15, 'B_c(Tc)');
    close(sc.criticalField(Tc / Math.SQRT2, Bc0, Tc), Bc0 / 2, 1e-12, 'B_c(Tc/√2)');
    assert(sc.criticalField(5, Bc0, Tc) === 0, 'zero above Tc');
    assert(!Number.isFinite(sc.londonLambda(Tc, 40e-9, Tc)), 'λ diverges at Tc');
  },
  'superconductivity: BCS gap ratio Δ(0)/k_BTc = πe^{-γ} ≈ 1.764, 2Δ/k_BTc ≈ 3.528': () => {
    const Tc = 9.3;
    const ratio = sc.bcsGap0(Tc) / (sc.K_B * Tc);
    close(ratio, 1.764, 5e-4, 'Δ/kTc');
    close(2 * ratio, 3.528, 1e-3, '2Δ/kTc');
    close(sc.bcsGap(1e-3, Tc) / sc.bcsGap0(Tc), 1, 1e-9, 'Δ(T→0)');
    assert(sc.bcsGap(Tc, Tc) === 0, 'Δ(Tc) = 0');
    // Nb: Δ(0) ≈ 1.764 k_B (9.3 K) = 1.41 meV
    const meV = (sc.bcsGap0(Tc) / sc.E_CHARGE) * 1e3;
    close(meV, 1.414, 0.005, 'Δ Nb (meV)');
    return `Δ/kTc = ${ratio.toFixed(5)}, Nb Δ(0) = ${meV.toFixed(3)} meV`;
  },
  'superconductivity: image-dipole force is repulsive, ∝ 1/z⁴, and equals -dU/dz': () => {
    const m = 0.95;
    const z = 0.02;
    const F = sc.imageForce(m, z);
    assert(F > 0, 'force must be repulsive (upward)');
    close(sc.imageForce(m, 2 * z) / F, 1 / 16, 1e-12, 'F(2z)/F(z)');
    close(sc.imageForce(m, 3 * z) / F, 1 / 81, 1e-12, 'F(3z)/F(z)');
    const dz = 1e-7;
    const dUdz = (sc.imageEnergy(m, z + dz) - sc.imageEnergy(m, z - dz)) / (2 * dz);
    close(-dUdz / F, 1, 1e-6, '-dU/dz / F');
    return `F(2 cm) = ${F.toFixed(3)} N`;
  },
  'superconductivity: image dipole cancels B_normal on the plane': () => {
    const out = new Float64Array(2);
    let worst = 0;
    for (const rho of [0.1, 0.5, 1, 2, 5]) {
      sc.meridianField(rho, 0, 2.5, 1, out);
      worst = Math.max(worst, Math.abs(out[1]) / Math.hypot(out[0], out[1]));
    }
    assert(worst < 1e-12, `B_y/|B| on plane ${worst}`);
    // With s = 1, a traced field line never enters the superconductor.
    const buf = new Float32Array(4000);
    let minY = Infinity;
    for (const th of [0.3, 0.5, 0.8]) {
      const n = sc.traceLine(2.5, 1, th, 0.55, 0.03, buf, 2000);
      for (let i = 0; i < n; i++) minY = Math.min(minY, buf[i * 2 + 1]);
    }
    assert(minY > -0.02, `line dipped to y=${minY}`);
    return `min y = ${minY.toFixed(3)}`;
  },
  'superconductivity: simulated magnet settles at the analytic levitation height': () => {
    const m = sc.magnetMoment(1.2, 1e-6);
    const M = 7.5e-3;
    const zeq = sc.levitationHeight(m, M);
    const st = { z: 0.005, v: 0 };
    const p: sc.MagnetParams = { m, M, zRest: 0.005, s: 1, damp: 8, kPin: 0, zPin: 0, dampPin: 0 };
    for (let i = 0; i < 80000; i++) sc.stepMagnet(st, p, 1e-4);
    close(st.z / zeq, 1, 1e-6, 'z / z_eq');
    close(sc.imageForce(m, st.z) / (M * sc.G), 1, 1e-5, 'force balance');
    return `z_eq = ${(zeq * 100).toFixed(3)} cm`;
  },
  'superconductivity: triangular lattice carries one Φ0 per (√3/2)a² cell': () => {
    const B = 0.1;
    const a = sc.vortexSpacing(B);
    const half = 60 * a;
    const buf = new Float32Array(2 * 40000);
    const n = sc.triangularLattice(a, half, 0.123 * a, 0.377 * a, buf, 40000);
    const expected = (B * (2 * half) ** 2) / sc.PHI0;
    close(n / expected, 1, 0.02, 'N / (B A / Φ0)');
    return `a = ${(a * 1e9).toFixed(1)} nm at 0.1 T, N = ${n}, BA/Φ0 = ${expected.toFixed(0)}`;
  },
};
