import { assert, close } from '../assert.ts';
import * as ns from '../../src/topics/neutron-stars/physics.ts';

type Suite = () => string | void;
const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'neutron stars: Crab characteristic age ≈ 1.26 kyr (ATNF)': () => {
    const crab = ns.PRESETS.find((p) => p.id === 'crab')!;
    const tau = ns.charAge(crab.P, crab.Pdot) / ns.YEAR;
    close(tau, 1257, 10, 'Crab τ in years');
    const vela = ns.PRESETS.find((p) => p.id === 'vela')!;
    close(ns.charAge(vela.P, vela.Pdot) / ns.YEAR / 1e4, 1.13, 0.01, 'Vela τ in 10⁴ yr');
    return `Crab τ = ${tau.toFixed(0)} yr`;
  },
  'neutron stars: surface B field matches catalogue (Crab 3.79e12 G, SGR 1935 2.2e14 G)': () => {
    const crab = ns.PRESETS.find((p) => p.id === 'crab')!;
    const mag = ns.PRESETS.find((p) => p.id === 'magnetar')!;
    const b1 = ns.bSurface(crab.P, crab.Pdot);
    const b2 = ns.bSurface(mag.P, mag.Pdot);
    close(b1 / 1e12, 3.79, 0.02, 'Crab B');
    close(b2 / 1e14, 2.2, 0.05, 'SGR 1935+2154 B');
    // Crab spin-down power ≈ 4.5e38 erg/s = 4.5e31 W
    close(ns.spinDownPower(crab.P, crab.Pdot) / 1e31, 4.46, 0.05, 'Crab Ė');
    return `Crab ${b1.toExponential(2)} G, SGR ${b2.toExponential(2)} G`;
  },
  'neutron stars: light cylinder radius c/(2πf)': () => {
    const crab = ns.lightCylinder(0.0333924) / 1e3;
    close(crab, 1593.3, 1, 'Crab R_LC km');
    const msp = ns.lightCylinder(1 / 716.36) / 1e3;
    close(msp, 66.6, 0.1, '716 Hz R_LC km');
    return `Crab ${crab.toFixed(0)} km, 716 Hz ${msp.toFixed(1)} km`;
  },
  'neutron stars: 1.4 M☉ at 12 km escapes above 0.5c, 1 − 2GM/Rc² ≈ 0.655': () => {
    const c = ns.compactness(1.4 * ns.M_SUN, 12e3);
    assert(c.vEsc > 0.5, `v_esc = ${c.vEsc}`);
    close(c.vEsc, 0.587, 0.003, 'v_esc/c');
    close(c.redshiftFactor, 0.655, 0.002, '1 − 2GM/Rc²');
    close(c.gNewton / 1e12, 1.29, 0.01, 'GM/R²');
    // Beloborodov bending: cos ψmax = −u/(1−u) → about 76% of the surface visible
    close(c.visibleFraction, 0.763, 0.005, 'visible fraction');
    // Mean density ≈ 1.4 × nuclear, and ~0.4 billion tonnes per cm³
    close(c.densityRatio, 1.43, 0.05, 'ρ / ρ_nuc');
    close(c.sugarCubeTonnes / 1e8, 3.85, 0.05, 'sugar cube');
    return `v_esc = ${c.vEsc.toFixed(3)} c`;
  },
  'neutron stars: pulse width from geometry agrees with Gil (1984) and with a phase sweep': () => {
    const cases: [number, number, number][] = [[45, 50, 10], [30, 25, 12], [70, 80, 20], [60, 60, 8]];
    for (const [a, z, r] of cases) {
      const al = a * DEG;
      const ze = z * DEG;
      const rho = r * DEG;
      const W = ns.pulseWidth(al, ze, rho);
      const beta = ze - al;
      const gil = 4 * Math.asin(Math.sqrt((Math.sin(rho / 2) ** 2 - Math.sin(beta / 2) ** 2) / (Math.sin(al) * Math.sin(ze))));
      close(W, gil, 1e-9, `Gil formula α=${a} ζ=${z}`);
      let n = 0;
      const N = 200000;
      for (let i = 0; i < N; i++) if (ns.beamAngle(al, ze, -Math.PI + (2 * Math.PI * i) / N, 1) < rho) n++;
      close((n / N) * 2 * Math.PI, W, 1e-3, `sweep α=${a} ζ=${z}`);
    }
    // Observer outside both cones sees nothing. Orthogonal rotator seen from the equator sees both poles.
    assert(!ns.beamSeen(45 * DEG, 70 * DEG, 10 * DEG, 1) && !ns.beamSeen(45 * DEG, 70 * DEG, 10 * DEG, -1), 'should be dark');
    assert(ns.beamSeen(88 * DEG, 90 * DEG, 10 * DEG, 1) && ns.beamSeen(88 * DEG, 90 * DEG, 10 * DEG, -1), 'interpulse expected');
    return 'W matches to 1e-3 rad';
  },
  'neutron stars: TOV with Read et al. (2009) fits reproduces published M_max and R_1.4': () => {
    const out: string[] = [];
    for (const fit of ns.EOS_FITS) {
      const c = ns.massRadius(fit, 60);
      close(c.mMax, fit.mMax, 0.03, `${fit.name} M_max`);
      close(ns.radiusAt(c, 1.4), fit.r14, 0.15, `${fit.name} R_1.4`);
      out.push(`${fit.name} ${c.mMax.toFixed(3)} M☉ / ${ns.radiusAt(c, 1.4).toFixed(2)} km`);
    }
    return out.join(', ');
  },
};
