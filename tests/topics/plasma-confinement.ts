import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/plasma-confinement/physics.ts';

type Suite = () => string | void;

const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'plasma: Debye length and plasma frequency match NRL formulary at 1e20 m^-3, 10 keV': () => {
    // NRL: λ_D = 7.43e2 T_eV^1/2 n_cm^-1/2 cm, f_pe = 8.98e3 n_cm^1/2 Hz
    const lD = P.debyeLength(1e20, 1e4);
    close(lD / (7.43e2 * Math.sqrt(1e4 / 1e14) * 1e-2), 1, 2e-3, 'Debye length ratio');
    const f = P.plasmaOmega(1e20) / (2 * Math.PI);
    close(f / (8.98e3 * Math.sqrt(1e14)), 1, 2e-3, 'plasma frequency ratio');
    assert(P.debyeNumber(1e20, 1e4) > 1e8, 'many electrons per Debye sphere');
    return `λD = ${(lD * 1e6).toFixed(1)} µm, f_pe = ${(f / 1e9).toFixed(1)} GHz`;
  },
  'plasma: Bosch-Hale D-T reactivity matches published table (10, 20, 50 keV)': () => {
    // Bosch & Hale (1992) Table VIII, cm^3/s
    const table: [number, number][] = [[10, 1.136e-16], [20, 4.33e-16], [50, 8.649e-16]];
    for (const [T, sv] of table) close(P.sigmaVDT(T) / (sv * 1e-6), 1, 3e-3, `<σv>(${T} keV)`);
    return 'within 0.3%';
  },
  'plasma: ignition triple product minimum is about 3e21 keV s m^-3 near 14 keV': () => {
    const [T, nTt] = P.minIgnitionTriple();
    assert(T > 12 && T < 16, `T_min = ${T}`);
    assert(nTt > 2.5e21 && nTt < 3.2e21, `min nTτ = ${nTt}`);
    // Arithmetic: n = 1e20, T = 14 keV, τ = 2 s gives 2.8e21, and 12T/(Eα<σv>) consistency
    close(1e20 * 14 * 2, 2.8e21, 1, 'triple product arithmetic');
    close(P.ignitionTriple(14), (12 * 14 * 14) / (3520 * P.sigmaVDT(14)), 1e10, 'formula');
    // Q: breakeven at f = 1/6, Q = 10 at f = 2/3
    close(P.gainQ(P.ignitionNTau(14) / 6, 14), 1, 1e-2, 'Q at f=1/6');
    close(P.gainQ((2 / 3) * P.ignitionNTau(14), 14), 10, 2e-2, 'Q at f=2/3');
    return `min ${nTt.toExponential(2)} at ${T.toFixed(1)} keV`;
  },
  'plasma: toroidal field of 18 discrete coils falls as 1/R (Biot-Savart vs Ampere)': () => {
    const N = 18, R0 = 3, c = 1.6, I = 1e6;
    const out = new Float64Array(3);
    let worst = 0;
    for (const R of [2.2, 2.6, 3, 3.4, 3.8]) {
      // Average over one coil period to remove ripple
      let s = 0;
      const M = 12;
      for (let k = 0; k < M; k++) {
        const phi = (2 * Math.PI * k) / (N * M);
        P.coilSetField(N, R0, c, I, 180, R * Math.cos(phi), 0, R * Math.sin(phi), out);
        s += -out[0] * Math.sin(phi) + out[2] * Math.cos(phi);
      }
      const Bphi = s / M;
      worst = Math.max(worst, Math.abs(Bphi / P.toroidalField(N, I, R) - 1));
    }
    assert(worst < 0.01, `worst deviation ${worst}`);
    return `max deviation ${(worst * 100).toFixed(2)}%`;
  },
  'plasma: grad-B + curvature drift from Boris matches (v∥² + v⊥²/2)/(ΩR)': () => {
    const tk: P.Tokamak = { R0: 3, a: 1, B0: 1, iota: 0 };
    const res: string[] = [];
    for (const [qm, v] of [[1, 0.05], [-16, 0.2]] as [number, number][]) {
      const p = P.makeParticle(qm);
      const al = 35 * DEG;
      P.launch(p, tk, 0, 0, 0, v, al, 0.3);
      const dt = (2 * Math.PI) / (Math.abs(qm) * 32);
      let St = 0, Sy = 0, Stt = 0, Sty = 0, N = 0;
      while (p.t < (2 * Math.PI * 100) / Math.abs(qm)) {
        P.borisStep(p, tk, 0, dt);
        St += p.t; Sy += p.s[1]; Stt += p.t * p.t; Sty += p.t * p.s[1]; N++;
      }
      const slope = (N * Sty - St * Sy) / (N * Stt - St * St);
      const pred = P.verticalDrift(v * Math.cos(al), v * Math.sin(al), qm, 1, 3);
      close(slope / pred, 1, 0.02, `drift ratio qm=${qm}`);
      res.push(`${(slope / pred).toFixed(4)}`);
    }
    return `sim/formula = ${res.join(', ')}`;
  },
  'plasma: traced field lines have the analytic q and stay on their flux surface': () => {
    const tk: P.Tokamak = { R0: 3, a: 1, B0: 1, iota: 1 / 2.9 };
    let worst = 0;
    for (const r of [0.3, 0.6, 0.95]) {
      const m = P.measureQ(tk, r, 0.01);
      worst = Math.max(worst, Math.abs(m.q / P.qExact(tk, r) - 1));
      assert(m.drift < 1e-8, `left surface by ${m.drift}`);
    }
    assert(worst < 1e-6, `q mismatch ${worst}`);
    // q_a formula: B = 3.5 T, I = 2 MA, R = 3 m, a = 1 m
    close(P.edgeQ(3.5, 2e6, 3, 1), (2 * Math.PI * 3.5) / (4e-7 * Math.PI * 3 * 2e6), 1e-3, 'q_a');
    return `max |q/q_exact - 1| = ${worst.toExponential(1)}`;
  },
  'plasma: twist confines an ion for 10 transits, pure toroidal field loses it': () => {
    const run = (iota: number) => {
      const tk: P.Tokamak = { R0: 3, a: 1, B0: 1, iota };
      const p = P.makeParticle(1);
      P.launch(p, tk, 0.4, 1, 0, 0.1, 35 * DEG, 0);
      const dt = (2 * Math.PI) / 36;
      let phi = 0, prev = 0;
      while (Math.abs(phi) < 20 * Math.PI) {
        P.borisStep(p, tk, 0, dt);
        const f = Math.atan2(p.s[2], p.s[0]);
        let d = f - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        phi += d;
        prev = f;
        if (P.minorRadius(tk, p.s[0], p.s[1], p.s[2]) > 1.15) return Math.abs(phi) / (2 * Math.PI);
      }
      return Infinity;
    };
    const lostAfter = run(0);
    assert(lostAfter < 3, `no-current ion survived ${lostAfter} transits`);
    assert(run(1 / 2.9) === Infinity, 'twisted-field ion was lost');
    return `untwisted ion lost after ${lostAfter.toFixed(2)} transits`;
  },
};
