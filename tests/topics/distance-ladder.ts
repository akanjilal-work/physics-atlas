import { assert, close } from '../assert.ts';
import * as L from '../../src/topics/distance-ladder/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'distance ladder: parallax d = 1/p and the parsec (206264.806 AU, 3.0857e16 m)': () => {
    close(L.parallaxDistancePc(1), 1, 1e-15, '1 arcsec');
    close(L.PC_AU, 206264.806, 1e-3, 'pc in AU');
    close(L.PC_M / 1e16, 3.0857, 1e-4, 'pc in m');
    // Exact atan geometry agrees with the small-angle formula to ~1e-11 at 1 pc.
    const exactArcsec = (L.parallaxExactRad(1) * 180 * 3600) / Math.PI;
    close(exactArcsec, 1, 1e-9, 'exact vs small-angle');
    // 61 Cygni B, Gaia DR3: 286.0054 mas -> 3.4964 pc.
    const d61 = L.parallaxDistancePc(0.2860054);
    close(d61, 3.4964, 5e-4, '61 Cyg B');
    // Gaia bright-star precision: 1% distances out to ~400 pc.
    close(L.parallaxFracError(2.5, L.GAIA_SIGMA_BRIGHT_MAS), 0.01, 1e-12, 'Gaia 1% at 400 pc');
    return `61 Cyg B d = ${d61.toFixed(4)} pc`;
  },
  'distance ladder: distance modulus round trip and fixed points': () => {
    close(L.distanceModulus(10), 0, 1e-12, '10 pc');
    close(L.distanceModulus(100), 5, 1e-12, '100 pc');
    close(L.distanceModulus(1e6), 25, 1e-12, '1 Mpc');
    let worst = 0;
    for (let lg = -5; lg <= 10; lg += 0.37) {
      const d = Math.pow(10, lg);
      const back = L.distanceFromModulus(L.distanceModulus(d));
      worst = Math.max(worst, Math.abs(back / d - 1));
    }
    assert(worst < 1e-12, `round trip error ${worst}`);
    return `worst relative error ${worst.toExponential(1)}`;
  },
  'distance ladder: 0.1 mag offset -> 10^0.02 = 4.71% in distance and in H0': () => {
    close(L.distanceFactor(0.1), Math.pow(10, 0.02), 1e-15, 'factor');
    close(L.distanceFactor(0.1) - 1, 0.0471, 5e-5, 'percent');
    const h = L.h0WithOffset(70, 0.1);
    close(h / 70 - 1, 0.0471, 5e-5, 'H0 shift');
    // Propagated through the simulated SN sample: refit H0 after recalibrating M_SN by +0.1.
    const sne = L.simulateHubbleSNe(73, 200, 3);
    const d0 = sne.map((s) => L.distanceFromModulus(s.m - L.M_SN_IA) / 1e6);
    const d1 = sne.map((s) => L.distanceFromModulus(s.m - (L.M_SN_IA + 0.1)) / 1e6);
    const v = sne.map((s) => s.v);
    const ratio = L.fitH0(d1, v) / L.fitH0(d0, v);
    close(ratio, Math.pow(10, 0.02), 1e-12, 'refit ratio');
    // Offset needed to take SH0ES to Planck.
    const off = L.offsetForH0(L.H0_SHOES.value, L.H0_PLANCK.value);
    close(off, -0.1752, 1e-3, 'offset SH0ES->Planck');
    return `10^0.02 = ${L.distanceFactor(0.1).toFixed(5)}, SH0ES->Planck needs ${off.toFixed(3)} mag`;
  },
  'distance ladder: Leavitt law monotonic, M_V(10 d) = -4.05, slope -2.43 per dex': () => {
    let prev = Infinity;
    for (let p = 1; p <= 100; p *= 1.05) {
      const m = L.leavittMV(p);
      assert(m < prev, `not monotonic at P=${p}`);
      prev = m;
    }
    close(L.leavittMV(10), -4.05, 1e-12, 'M_V(10 d)');
    close(L.leavittMV(100) - L.leavittMV(10), -2.43, 1e-12, 'slope');
    // A 10% period error gives a ~0.1 mag, ~5% distance error.
    const dm = L.leavittMV(11) - L.leavittMV(10);
    close(L.distanceFactor(-dm) - 1, 0.0482, 1e-3, '10% period error');
    return `M_V(30 d) = ${L.leavittMV(30).toFixed(2)}`;
  },
  'distance ladder: radar echo from Venus gives the AU (~276 s round trip)': () => {
    const t = L.radarEchoTime(L.A_VENUS);
    close(t, 276.2, 0.2, 'echo time');
    close(L.auFromEcho(t, L.A_VENUS), L.AU_M, 1e-3, 'AU recovered');
    return `echo ${t.toFixed(1)} s`;
  },
  'distance ladder: Hubble fit recovers H0, SH0ES vs Planck tension ~4.8 sigma': () => {
    const exactD = [10, 50, 200, 400];
    close(L.fitH0(exactD, exactD.map((d) => 70 * d)), 70, 1e-12, 'noise-free fit');
    const sne = L.simulateHubbleSNe(73, 400, 11);
    const d = sne.map((s) => L.distanceFromModulus(s.m - L.M_SN_IA) / 1e6);
    const h = L.fitH0(d, sne.map((s) => s.v));
    close(h, 73, 1.0, 'noisy fit');
    const sig = L.tensionSigma(L.H0_SHOES.value, L.H0_SHOES.sigma, L.H0_PLANCK.value, L.H0_PLANCK.sigma);
    close(sig, 4.84, 0.05, 'tension');
    return `fit ${h.toFixed(2)}, tension ${sig.toFixed(2)} sigma`;
  },
  'distance ladder: Cepheid light curve has zero mean and the set amplitude': () => {
    let s = 0;
    let lo = Infinity;
    let hi = -Infinity;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const m = L.cepheidDeltaMag(i / N, 0.8);
      s += m;
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
    }
    close(s / N, 0, 1e-3, 'mean');
    close(hi - lo, 0.8, 1e-6, 'amplitude');
    close(L.cepheidDeltaMag(0), lo, 1e-9, 'max light at phase 0');
  },
};
