import { assert, close } from '../assert.ts';
import * as ck from '../../src/topics/cherenkov/physics.ts';

type Suite = () => string | void;
const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'cherenkov: cos θ = 1/(nβ) (water, β = 0.9 gives 33.34°; glass β = 1 gives 48.19°)': () => {
    const a = ck.cherenkovAngle(1.33, 0.9) / DEG;
    close(a, Math.acos(1 / (1.33 * 0.9)) / DEG, 1e-12, 'water angle');
    close(a, 33.34, 0.01, 'water angle value');
    close(ck.cherenkovAngle(1.5, 1) / DEG, 48.19, 0.01, 'glass max');
    close(ck.wavefrontHalfAngle(1.33, 0.9) + ck.cherenkovAngle(1.33, 0.9), Math.PI / 2, 1e-12, 'θ + φ = 90°');
    return `θ = ${a.toFixed(2)}°`;
  },
  'cherenkov: threshold β = 1/n (water 0.7519, air 0.99970), no light below it': () => {
    close(ck.thresholdBeta(1.33), 0.75188, 1e-5, 'water');
    close(ck.thresholdBeta(1.0003), 0.9997, 1e-6, 'air');
    assert(!ck.isAbove(1.33, 0.75), 'β = 0.75 must be below threshold in water');
    assert(ck.isAbove(1.33, 0.753), 'β = 0.753 must be above threshold in water');
    assert(ck.sin2Theta(1.0003, 0.99) === 0 && ck.photonsPerCm(1.0003, 0.99, 400, 700) === 0, 'air at β = 0.99 must be dark');
  },
  'cherenkov: maximum angle in water arccos(1/1.33) = 41.25°': () => {
    const m = ck.maxAngle(1.33) / DEG;
    close(m, 41.25, 0.01, 'max angle');
    close(ck.cherenkovAngle(1.33, 1 - 1e-12) / DEG, m, 1e-4, 'β → 1 limit');
    assert(ck.cherenkovAngle(1.33, 0.999) < ck.maxAngle(1.33), 'angle grows toward the max');
    return `${m.toFixed(2)}°`;
  },
  'cherenkov: electron threshold in water ≈ 0.264 MeV kinetic, muon ≈ 54.6 MeV': () => {
    // γ_t = 1/sqrt(1 − 1/n²) = 1.5167 for n = 1.33.
    const te = ck.thresholdKinetic(1.33, ck.MASS_MEV.electron);
    const tm = ck.thresholdKinetic(1.33, ck.MASS_MEV.muon);
    close(te, 0.2640, 0.0005, 'electron');
    close(tm, 54.59, 0.05, 'muon');
    close(ck.betaFromKinetic(te, ck.MASS_MEV.electron), 1 / 1.33, 1e-9, 'round trip');
    return `e ${te.toFixed(4)} MeV, μ ${tm.toFixed(2)} MeV`;
  },
  'cherenkov: Frank–Tamm matches PDG (369.8 sin²θ /eV/cm, ≈490 sin²θ /cm in 400–700 nm) and favours blue': () => {
    const n = 1.33, b = 1;
    const s2 = ck.sin2Theta(n, b);
    close(ck.frankTammPerEV(n, b) / s2, 369.81, 0.05, 'per eV coefficient');
    const vis = ck.photonsPerCm(n, b, 400, 700);
    close(vis / s2, 491.2, 0.5, 'visible coefficient');
    // 1/λ²: 400 nm gets (700/400)² = 3.06 times as many photons per nm as 700 nm.
    close(ck.frankTammPerNm(n, b, 400) / ck.frankTammPerNm(n, b, 700), (700 / 400) ** 2, 1e-9, 'ratio');
    // Numerical integral of the per-nm spectrum reproduces the closed form.
    let sum = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) sum += ck.frankTammPerNm(n, b, 400 + (300 * (i + 0.5)) / N) * (300 / N);
    close(sum, vis, vis * 1e-5, 'integral');
    return `${vis.toFixed(0)} photons/cm in water at β → 1`;
  },
  'cherenkov: Huygens wavelet envelope reproduces the formula angle': () => {
    let worst = 0;
    for (const [n, beta] of [[1.33, 0.8], [1.33, 0.95], [1.5, 0.99], [1.33, 0.999]]) {
      const c = 1;
      const phi = ck.simulateEnvelope(beta * c, c / n, 0.002, 4);
      const thetaGeo = Math.PI / 2 - phi;
      const err = Math.abs(thetaGeo - ck.cherenkovAngle(n, beta)) / DEG;
      worst = Math.max(worst, err);
    }
    assert(worst < 0.1, `worst envelope error ${worst}°`);
    // Mach cone: same construction with sound, sin α = 1/M.
    const alpha = ck.simulateEnvelope(2, 1, 0.002, 4);
    close(alpha / DEG, ck.machAngle(2) / DEG, 0.1, 'Mach 2 cone');
    close(ck.machAngle(2) / DEG, 30, 1e-9, 'Mach 2 = 30°');
    return `worst ${worst.toExponential(1)}°`;
  },
};
