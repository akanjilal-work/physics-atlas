import { assert, close } from '../assert.ts';
import * as gw from '../../src/topics/gravitational-waves/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'gravitational waves: chirp mass formula (equal masses, symmetry, GW150914)': () => {
    // Equal masses: M_c = m (m^2)^{3/5} / (2m)^{1/5} / m = 2^{-1/5} m.
    close(gw.chirpMass(10, 10), 10 * Math.pow(2, -0.2), 1e-12, 'equal-mass chirp mass');
    close(gw.chirpMass(36, 29), gw.chirpMass(29, 36), 1e-12, 'symmetric in m1, m2');
    // Scales linearly with mass.
    close(gw.chirpMass(72, 58), 2 * gw.chirpMass(36, 29), 1e-9, 'homogeneous of degree 1');
    // GW150914 median masses give about 28 solar masses (published source-frame value about 28).
    const mc = gw.chirpMass(gw.GW150914.m1, gw.GW150914.m2);
    assert(mc > 27.6 && mc < 28.6, `GW150914 chirp mass ${mc}`);
    return `M_c(36, 29) = ${mc.toFixed(2)} M_sun`;
  },
  'gravitational waves: f(τ) follows the −3/8 power law and matches df/dt = (96/5)π^{8/3}(GM_c/c³)^{5/3} f^{11/3}': () => {
    const mc = 28.1;
    const T = mc * gw.T_SUN;
    let worst = 0;
    for (const tau of [1e-3, 0.01, 0.1, 1, 10]) {
      const slope = Math.log(gw.fOfTau(2 * tau, mc) / gw.fOfTau(tau, mc)) / Math.log(2);
      worst = Math.max(worst, Math.abs(slope + 3 / 8));
      close(gw.tauOfF(gw.fOfTau(tau, mc), mc), tau, tau * 1e-12, 'tau(f(tau)) round trip');
      // Chirp rate from the quadrupole energy balance, against a centred finite difference.
      const f = gw.fOfTau(tau, mc);
      const e = tau * 1e-5;
      const dfdt = (gw.fOfTau(tau - e, mc) - gw.fOfTau(tau + e, mc)) / (2 * e);
      const expect = (96 / 5) * Math.pow(Math.PI, 8 / 3) * Math.pow(T, 5 / 3) * Math.pow(f, 11 / 3);
      close(dfdt / expect, 1, 1e-7, 'df/dt');
      // Phase derivative equals 2πf.
      const dphi = (gw.phaseOfTau(tau - e, mc) - gw.phaseOfTau(tau + e, mc)) / (2 * e);
      close(dphi / (2 * Math.PI * f), 1, 1e-7, 'dΦ/dt = 2πf');
    }
    assert(worst < 1e-12, `slope error ${worst}`);
    return `slope −0.375, error ${worst.toExponential(0)}`;
  },
  'gravitational waves: strain scales as 1/D and GW150914 gives h ~ 1e-21': () => {
    const mc = gw.chirpMass(36, 29);
    const h1 = gw.strainAmp(mc, 150, 410);
    const h2 = gw.strainAmp(mc, 150, 820);
    close(h2 / h1, 0.5, 1e-14, 'doubling D halves h');
    close(gw.strainAmp(mc, 150, 41) / h1, 10, 1e-12, 'D/10 gives 10 h');
    // f^{2/3} and M_c^{5/3} scalings.
    close(gw.strainAmp(mc, 300, 410) / h1, Math.pow(2, 2 / 3), 1e-12, 'f^{2/3}');
    close(gw.strainAmp(2 * mc, 150, 410) / h1, Math.pow(2, 5 / 3), 1e-12, 'M_c^{5/3}');
    // Measured peak strain was 1.0e-21. The optimal-orientation estimate should be the same order.
    assert(h1 > 1e-21 && h1 < 4e-21, `h = ${h1}`);
    return `h(150 Hz, 410 Mpc) = ${h1.toExponential(2)}`;
  },
  'gravitational waves: ring deformation preserves area to first order in h': () => {
    const N = 64;
    const pts = new Float64Array(2 * N);
    const out: [number, number] = [0, 0];
    const areaFor = (hp: number, hx: number) => {
      for (let i = 0; i < N; i++) {
        const a = (2 * Math.PI * i) / N;
        gw.deform(Math.cos(a), Math.sin(a), hp, hx, out);
        pts[2 * i] = out[0];
        pts[2 * i + 1] = out[1];
      }
      return gw.polygonArea(pts);
    };
    const a0 = areaFor(0, 0);
    for (const [hp, hx] of [[1e-3, 0], [0, 1e-3], [7e-4, 7e-4], [0.2, -0.1]]) {
      const ratio = areaFor(hp, hx) / a0;
      // The map is I + H/2 with H traceless, so det = 1 − (h₊² + h×²)/4: no first-order term.
      close(ratio, 1 - (hp * hp + hx * hx) / 4, 1e-12, `area ratio for (${hp}, ${hx})`);
    }
    const small = Math.abs(areaFor(1e-3, 0) / a0 - 1);
    assert(small < 1e-6, `first-order area change ${small}`);
    // A plus wave stretches x while squeezing y by the same amount.
    gw.deform(1, 0, 0.01, 0, out);
    close(out[0], 1.005, 1e-15, 'x stretched');
    gw.deform(0, 1, 0.01, 0, out);
    close(out[1], 0.995, 1e-15, 'y squeezed');
    return `ΔA/A at h=1e-3: ${small.toExponential(1)}`;
  },
  'gravitational waves: GW150914 ISCO, ringdown and a continuous replay waveform': () => {
    const p = gw.planChirp(36, 29, 410);
    // f_ISCO = 4.4 kHz / (M/M_sun), about 68 Hz for 65 solar masses.
    close(p.fIsco, 4397 / 65, 1, 'f_ISCO');
    // Remnant: published 62 M_sun and spin 0.67. The ringdown sketch should land near 250 Hz.
    assert(Math.abs(p.ring.mf - 62) < 1.5, `M_f ${p.ring.mf}`);
    assert(Math.abs(p.ring.af - 0.67) < 0.05, `a_f ${p.ring.af}`);
    assert(p.ring.fRing > 230 && p.ring.fRing < 300, `f_ring ${p.ring.fRing}`);
    close(gw.cyclesBetween(p.tauStart, p.tauIsco, p.mc), 20, 1e-9, '20 cycles before ISCO');
    const s: gw.WaveSample = { h: 0, phase: 0, f: 0, stage: 0 };
    const e = 1e-9;
    for (const tj of [p.tIsco, p.tEnd]) {
      const a = gw.sampleWave(p, tj - e, s);
      const [h0, ph0] = [a.h, a.phase];
      gw.sampleWave(p, tj + e, s);
      close(s.h / h0, 1, 1e-4, 'amplitude continuous');
      close(s.phase, ph0, 1e-4, 'phase continuous');
    }
    return `f ${p.fStart.toFixed(1)} → ${p.fIsco.toFixed(1)} Hz, ring ${p.ring.fRing.toFixed(0)} Hz, replay ${p.tStop.toFixed(2)} s`;
  },
};
