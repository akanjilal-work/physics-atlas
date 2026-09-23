import { assert, close } from '../assert.ts';
import * as L from '../../src/topics/lasers/physics.ts';

type Suite = () => string | void;

const base = (over: Partial<L.LaserParams> = {}): L.LaserParams => ({ ...L.DEFAULTS, ...over });

/** Run from an empty rod (N = 0, one seed photon) for T seconds and return the final state. */
function settle(p: L.LaserParams, T = 4e-3): Float64Array {
  const s = new Float64Array([0, 1, 0]);
  L.advance(s, L.coeffs(p), T);
  return s;
}

export const suites: Record<string, Suite> = {
  'lasers: simulated threshold matches gain = loss (B N_th tau_c = 1)': () => {
    const p0 = base();
    const Pth = L.thresholdPumpW(p0);
    // Two pump levels above threshold, extrapolate output power back to zero.
    const pa = base({ pumpW: 1.5 * Pth });
    const pb = base({ pumpW: 3 * Pth });
    const Pa = L.outputPower(pa, settle(pa)[1]);
    const Pb = L.outputPower(pb, settle(pb)[1]);
    const intercept = pa.pumpW - (Pa * (pb.pumpW - pa.pumpW)) / (Pb - Pa);
    close(intercept / Pth, 1, 2e-3, 'threshold intercept / analytic');
    // Just below threshold N sits at R_p tau and only a trickle of seeded photons remains.
    const pc = base({ pumpW: 0.9 * Pth });
    const sc = settle(pc);
    // Only the spontaneous seed survives: q = beta N tau_c / (tau (1 - N/N_th)).
    const Nsub = L.pumpRate(pc) * pc.tau;
    const qSeed = (pc.beta * Nsub * L.cavityLifetime(pc)) / (pc.tau * (1 - Nsub / L.thresholdN(pc)));
    close(sc[1] / qSeed, 1, 2e-3, 'seeded photons below threshold');
    assert(sc[1] < 1e-6 * L.steadyState(pb).q, 'below threshold output is negligible');
    close(sc[0] / (L.pumpRate(pc) * pc.tau), 1, 1e-3, 'N below threshold');
    return `P_th = ${Pth.toFixed(3)} W, extrapolated ${intercept.toFixed(3)} W`;
  },
  'lasers: output above threshold is linear in pump with the analytic slope efficiency': () => {
    const p0 = base();
    const Pth = L.thresholdPumpW(p0);
    const pumps = [1.5, 2.5, 4, 6].map((k) => k * Pth);
    const outs = pumps.map((w) => {
      const p = base({ pumpW: w });
      const s = settle(p);
      close(s[0] / L.thresholdN(p), 1, 1e-4, 'inversion clamped at N_th');
      return L.outputPower(p, s[1]);
    });
    const eta = L.slopeEfficiency(p0);
    for (let i = 1; i < pumps.length; i++) {
      const slope = (outs[i] - outs[i - 1]) / (pumps[i] - pumps[i - 1]);
      close(slope / eta, 1, 2e-3, `slope segment ${i}`);
    }
    return `slope efficiency ${(eta * 100).toFixed(1)} %`;
  },
  'lasers: relaxation oscillation frequency matches the linearised formula': () => {
    const p = base({ beta: 0, pumpW: 2.5 * L.thresholdPumpW(base()) });
    const ss = L.steadyState(p);
    const s = new Float64Array([ss.N * 1.0001, ss.q, 0]);
    const c = L.coeffs(p);
    const dtS = 5e-9;
    const peaks: number[] = [];
    let q0 = s[1];
    let q1 = s[1];
    let t = 0;
    while (peaks.length < 6 && t < 5e-4) {
      L.advance(s, c, dtS);
      t += dtS;
      const q2 = s[1];
      if (q1 > q0 && q1 >= q2) {
        // Parabolic refinement of the peak time.
        const den = q0 - 2 * q1 + q2;
        peaks.push(t - dtS + (den !== 0 ? (0.5 * (q0 - q2)) / den : 0) * dtS);
      }
      q0 = q1;
      q1 = q2;
    }
    assert(peaks.length === 6, `found ${peaks.length} peaks`);
    const period = (peaks[5] - peaks[0]) / 5;
    const { omegaR } = L.relaxation(p);
    close(period / ((2 * Math.PI) / omegaR), 1, 5e-3, 'period ratio');
    return `f = ${(1 / period / 1e3).toFixed(1)} kHz vs ${(omegaR / 2 / Math.PI / 1e3).toFixed(1)} kHz`;
  },
  'lasers: longitudinal modes are spaced by c/2L and fit whole half-wavelengths': () => {
    for (const len of [0.1, 0.3, 1]) {
      const modes = L.modeFrequencies(len, L.C / 1064e-9, 7);
      for (let i = 1; i < modes.length; i++) close((modes[i].nu - modes[i - 1].nu) / (L.C / (2 * len)), 1, 1e-9, 'spacing');
      for (const m of modes) {
        const halfWaves = (2 * len) / (L.C / m.nu);
        close(halfWaves, m.m, 1e-6, 'standing wave condition');
      }
    }
    close(L.modeSpacing(0.3) / 1e6, 499.654, 1e-3, 'L = 30 cm spacing in MHz');
    return 'c/2L = 499.65 MHz at 30 cm';
  },
  'lasers: Q-switched peak matches N_i - N_th - N_th ln(N_i/N_th)': () => {
    const p = base();
    const s = new Float64Array([0, 1, 0]);
    L.advance(s, L.coeffs(p, 5), 2 * p.tau); // hold: huge loss, inversion builds
    const Ni = s[0];
    const Nth = L.thresholdN(p);
    assert(Ni > 1.5 * Nth, `stored inversion ${Ni / Nth} N_th`);
    s[2] = 0;
    L.advance(s, L.coeffs(p), 3e-6); // open the switch
    const want = L.qSwitchPeak(Ni, Nth);
    close(s[2] / want, 1, 0.02, 'peak ratio');
    const cw = L.steadyState(p).q;
    assert(s[2] / cw > 10, 'giant pulse beats CW by 10x');
    return `peak / CW = ${(s[2] / cw).toFixed(0)}x`;
  },
};
