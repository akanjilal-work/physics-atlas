import { assert, close } from '../assert.ts';
import * as hd from '../../src/topics/hunting-dark-matter/physics.ts';

type Suite = () => string | void;

const mXe = hd.mNucleus(hd.XE_A);

export const suites: Record<string, Suite> = {
  'hunting dm: head-on recoil equals the elastic-collision result 2 mu^2 v^2 / m_N': () => {
    // Lab-frame head-on elastic collision: target leaves with u = 2 m v / (m + M), energy M u^2 / 2.
    for (const m of [10, 50, 100, 1000]) {
      const v = 544 + 232;
      const b = v / hd.C_KMS;
      const u = (2 * m * b) / (m + mXe);
      const lab = 0.5 * mXe * u * u * 1e6;
      close(hd.maxRecoilKeV(m, mXe, v), lab, 1e-9 * lab, `E_max at m=${m}`);
    }
    // Glancing collision gives nothing, and 90 degrees gives half the maximum.
    close(hd.recoilEnergyKeV(100, mXe, 300, 1), 0, 1e-12, 'theta = 0');
    close(hd.recoilEnergyKeV(100, mXe, 300, 0), hd.maxRecoilKeV(100, mXe, 300) / 2, 1e-9, 'theta = 90');
    const e = hd.maxRecoilKeV(100, mXe, 220);
    // 2 (54.9 GeV)^2 (220/c)^2 / 122 GeV = 26.6 keV
    close(e, 26.6, 0.2, 'E_max at 100 GeV, 220 km/s');
    return `E_max(100 GeV, 220 km/s) = ${e.toFixed(1)} keV`;
  },
  'hunting dm: energy transfer is best matched at m_chi = m_N': () => {
    let best = 0;
    let bestM = 0;
    for (let lg = 0; lg <= 4; lg += 0.0005) {
      const m = Math.pow(10, lg);
      const f = hd.transferFraction(m, mXe);
      if (f > best) { best = f; bestM = m; }
    }
    close(bestM / mXe, 1, 0.003, 'argmax m_chi / m_N');
    close(best, 1, 1e-6, 'full transfer at equal mass');
    // Heavy WIMP limit: mu -> m_N, so E_max -> 2 m_N v^2.
    const lim = 2 * mXe * (500 / hd.C_KMS) ** 2 * 1e6;
    close(hd.maxRecoilKeV(1e7, mXe, 500) / lim, 1, 1e-4, 'heavy limit');
    return `peak at ${bestM.toFixed(1)} GeV, m_N = ${mXe.toFixed(1)} GeV`;
  },
  'hunting dm: eta closed form matches direct integration over the boosted Maxwellian': () => {
    const h = { v0: 220, vesc: 544, vE: 232 };
    // Brute-force: integrate f(v_gal) / |v_gal - v_E| over |v_gal| < v_esc in the galactic frame.
    const N = 160;
    const out: string[] = [];
    for (const vmin of [0, 150, 350, 600]) {
      let num = 0;
      let den = 0;
      const dv = h.vesc / N;
      for (let i = 0; i < N; i++) {
        const v = (i + 0.5) * dv;
        const w = v * v * Math.exp(-(v * v) / (h.v0 * h.v0)) * dv;
        for (let j = 0; j < N; j++) {
          const c = -1 + (2 * (j + 0.5)) / N;
          const dw = w * (2 / N);
          const s = Math.sqrt(v * v + h.vE * h.vE - 2 * v * h.vE * c);
          den += dw;
          if (s > vmin) num += dw / s;
        }
      }
      const numeric = num / den;
      const exact = hd.eta(vmin, h);
      close(exact, numeric, 0.01 * numeric + 2e-6, `eta(${vmin})`);
      out.push(`${vmin}:${(exact * 1e3).toFixed(3)}`);
    }
    assert(hd.eta(800, h) === 0, 'no WIMPs above v_esc + v_E');
    return `eta (1e-3 s/km) ${out.join(' ')}`;
  },
  'hunting dm: spectrum is exponential with scale E0 r and integrates to Lewin-Smith R0': () => {
    const p = { mChi: 100, sigma: 1e-46, A: hd.XE_A, halo: { v0: 220, vesc: 1e5, vE: 0 }, formFactor: false };
    const R0 = hd.lewinSmithR0(100, 1e-46, hd.XE_A);
    const tot = hd.rateBetween(0, 400, p, 2000);
    close(tot / R0, 1, 1e-3, 'total rate / R0');
    const scale = hd.spectrumScaleKeV(100, hd.XE_A);
    close(hd.dRdE(10, p) / hd.dRdE(10 + scale, p), Math.E, 1e-6, 'one e-fold per E0 r');
    // Lewin and Smith eq. 3.1: R0 = 361/(m_chi m_N) sigma_A[pb] (rho/0.3)(v0/220) per kg per day.
    const muN = hd.reducedMass(100, hd.M_P);
    const muA = hd.reducedMass(100, mXe);
    const sigmaApb = 1e-46 * hd.XE_A ** 2 * (muA / muN) ** 2 / 1e-36;
    const lsTonneYear = (361 / (100 * mXe)) * sigmaApb * 1000 * 365.25;
    close(R0 / lsTonneYear, 1, 0.01, 'R0 vs Lewin-Smith 361 formula');
    return `R0 = ${R0.toFixed(1)} /t/yr, E0 r = ${scale.toFixed(1)} keV`;
  },
  'hunting dm: annual modulation is a few percent and peaks near June 2': () => {
    const dv = hd.earthSpeed(hd.SHM.tPeak) - hd.earthSpeed(hd.SHM.tPeak + 182.625);
    close(dv / 2, 14.6, 0.2, 'v_E amplitude (km/s)');
    let bestDay = 0;
    let best = 0;
    for (let d = 1; d <= 365; d++) {
      const v = hd.earthSpeed(d);
      if (v > best) { best = v; bestDay = d; }
    }
    assert(Math.abs(bestDay - 153) <= 1, `peak day ${bestDay}`);
    assert(hd.dateLabel(bestDay) === '2 Jun' || hd.dateLabel(bestDay) === '1 Jun' || hd.dateLabel(bestDay) === '3 Jun', `peak date ${hd.dateLabel(bestDay)}`);
    const amp = hd.modulationAmplitude(40);
    assert(amp > 0.01 && amp < 0.1, `amplitude ${amp}`);
    // Below the crossing energy the phase flips: slow WIMPs are fewer in June.
    const at = (E: number, d: number) => hd.dRdE(E, { mChi: 100, sigma: 1e-46, A: hd.XE_A, halo: { v0: 220, vesc: 544, vE: hd.earthSpeed(d) } });
    assert(at(5, 152.5) < at(5, 335) && at(40, 152.5) > at(40, 335), 'phase reversal at low recoil energy');
    return `v_E ${hd.earthSpeed(bestDay).toFixed(0)}/${hd.earthSpeed(bestDay + 183).toFixed(0)} km/s, rate amplitude ${(amp * 100).toFixed(1)}% (40 GeV, 5-50 keV)`;
  },
  'hunting dm: haloscope resonance f = m_a c^2 / h': () => {
    close(hd.axionFreqMHz(1), 241.799, 0.001, '1 micro-eV in MHz');
    close(hd.axionMassUeV(hd.axionFreqMHz(3.3)), 3.3, 1e-12, 'round trip');
    const fa = hd.axionFreqMHz(3.3);
    close(hd.cavityResponse(fa, fa, 400), 1, 1e-12, 'on resonance');
    // Half power at a detuning of half the linewidth f/Q.
    close(hd.cavityResponse(fa, fa + fa / 400 / 2, 400), 0.5, 1e-3, 'half-power point');
    return `3.3 ueV -> ${fa.toFixed(1)} MHz`;
  },
  'hunting dm: fiducial mass and wall background behave': () => {
    close(hd.activeMass(), 7.03, 0.05, 'active mass (t)');
    const b0 = hd.wallBackgroundPerYear(0);
    // Thin-shell estimate: bWall * rho * area * lambda (corners double count slightly).
    const area = 2 * Math.PI * hd.TPC.R * hd.TPC.H + 2 * Math.PI * hd.TPC.R ** 2;
    const est = (hd.TPC.bWall * hd.TPC.rho * area * hd.TPC.lambda) / 1e6;
    close(b0 / est, 1, 0.1, 'shell estimate (curvature and corners lower it slightly)');
    const b15 = hd.wallBackgroundPerYear(15);
    // At depth d the fiducial surface sees the wall rate reduced by e^{-d/lambda}.
    const r = hd.TPC.R - 15;
    const h = hd.TPC.H - 30;
    const est15 = (hd.TPC.bWall * Math.exp(-15 / hd.TPC.lambda) * hd.TPC.rho * (2 * Math.PI * r * h + 2 * Math.PI * r * r) * hd.TPC.lambda) / 1e6;
    close(b15 / est15, 1, 0.1, 'e^{-d/lambda} fall-off');
    return `wall bg ${b0.toFixed(1)} -> ${b15.toFixed(2)} per yr, fiducial ${hd.fiducialMass(15).toFixed(2)} t at 15 cm`;
  },
};
