import { assert, close } from '../assert.ts';
import * as ce from '../../src/topics/cosmic-expansion/physics.ts';

type Suite = () => string | void;

const H0 = 67.4;
const tH = ce.HUBBLE_GYR / H0; // 1/H0 in Gyr
const planck: ce.Cosmo = { H0, Om: 0.315, Or: ce.omegaR(H0), Ol: 1 - 0.315 - ce.omegaR(H0) };

export const suites: Record<string, Suite> = {
  'cosmic expansion: Einstein-de Sitter age from RK4 a(t) equals 2/(3H0)': () => {
    const c: ce.Cosmo = { H0, Om: 1, Ol: 0, Or: 0 };
    const h = ce.buildHistory(c);
    const exact = (2 / 3) * tH;
    close(h.t0, exact, 1e-6 * exact, 'EdS t0 (ODE)');
    close(ce.ageToday(c), exact, 1e-6 * exact, 'EdS t0 (quadrature)');
    return `t0 = ${h.t0.toFixed(5)} Gyr, 2/(3H0) = ${exact.toFixed(5)} Gyr`;
  },
  'cosmic expansion: empty (Milne) universe age equals 1/H0 and a grows linearly': () => {
    const c: ce.Cosmo = { H0, Om: 0, Ol: 0, Or: 0 };
    const h = ce.buildHistory(c);
    close(h.t0, tH, 1e-6 * tH, 'Milne t0');
    const aMid = ce.atTime(h, h.a, 2 * tH);
    close(aMid, 2, 1e-5, 'a(2/H0)');
    return `t0 = ${h.t0.toFixed(5)} Gyr, 1/H0 = ${tH.toFixed(5)} Gyr`;
  },
  'cosmic expansion: Planck 2018 parameters give an age of 13.8 ± 0.1 Gyr': () => {
    const h = ce.buildHistory(planck);
    close(h.t0, 13.8, 0.1, 'age');
    close(h.t0, ce.ageToday(planck), 1e-4, 'ODE vs quadrature');
    assert(h.maxConstraint < 1e-6, `Friedmann constraint drift ${h.maxConstraint}`);
    return `t0 = ${h.t0.toFixed(3)} Gyr (astropy with the same inputs: 13.791), constraint drift ${h.maxConstraint.toExponential(1)}`;
  },
  'cosmic expansion: comoving distance to z = 1 matches astropy within 1%': () => {
    // astropy FlatLambdaCDM(H0=67.4, Om0=0.315): 3401.3 Mpc. Wright calculator defaults (69.6, 0.286), z = 3: 6481.1 Mpc.
    const c: ce.Cosmo = { H0, Om: 0.315, Ol: 0.685, Or: 0 };
    const dc = ce.comovingDistance(c, 1);
    close(dc, 3401.3, 34, 'D_C(z=1)');
    close(ce.luminosityDistance(c, 1), 2 * dc, 1e-9, 'D_L = (1+z) D_C when flat');
    close(ce.angularDiameterDistance(c, 1), dc / 2, 1e-9, 'D_A = D_C/(1+z) when flat');
    const w: ce.Cosmo = { H0: 69.6, Om: 0.286, Ol: 0.714 - ce.omegaR(69.6), Or: ce.omegaR(69.6) };
    const d3 = ce.comovingDistance(w, 3);
    close(d3, 6481.1, 65, 'Wright D_C(z=3)');
    // Open universe checks the sinh curvature correction (astropy LambdaCDM(67.4, 0.3, 0)): D_M(z=1) = 3049.4 Mpc.
    const open: ce.Cosmo = { H0, Om: 0.3, Ol: 0, Or: 0 };
    close(ce.transverse(open, ce.comovingDistance(open, 1)), 3049.4, 30, 'open D_M(z=1)');
    return `D_C(1) = ${dc.toFixed(1)} Mpc, Wright D_C(3) = ${d3.toFixed(1)} Mpc`;
  },
  'cosmic expansion: q0 = Ω_m/2 − Ω_Λ, from formula and from the integrated a(t)': () => {
    const c: ce.Cosmo = { H0, Om: 0.315, Ol: 0.685, Or: 0 };
    const q0 = 0.315 / 2 - 0.685;
    close(ce.decel(c, 1), q0, 1e-12, 'q(a=1)');
    const h = ce.buildHistory(c);
    close(ce.decelFromHistory(h, h.t0), q0, 1e-4, 'q from RK4 solution');
    const zacc = ce.accelerationRedshift(c);
    close(zacc, Math.cbrt((2 * 0.685) / 0.315) - 1, 1e-6, 'z where q = 0');
    return `q0 = ${q0.toFixed(4)}, acceleration began at z = ${zacc.toFixed(3)}`;
  },
  'cosmic expansion: closed matter universe (Ω_m = 3) matches the cycloid solution and recollapses': () => {
    const Om = 3;
    const c: ce.Cosmo = { H0, Om, Ol: 0, Or: 0 };
    const A = Om / (2 * (Om - 1));
    const B = (Om / (2 * (Om - 1) ** 1.5)) * tH;
    const th = Math.acos(1 - 1 / A);
    const t0 = B * (th - Math.sin(th));
    const h = ce.buildHistory(c);
    assert(h.fate === 'crunch', `fate ${h.fate}`);
    close(h.t0, t0, 1e-5 * t0, 'age');
    close(h.tTurn, Math.PI * B, 1e-3, 'turnaround time');
    close(ce.turnaroundA(c), 2 * A, 1e-9, 'a_max');
    const tEnd = h.t[h.n - 1];
    close(tEnd, 2 * Math.PI * B, 0.01, 'crunch time');
    return `t0 = ${h.t0.toFixed(3)} Gyr, crunch at ${tEnd.toFixed(2)} Gyr (cycloid ${(2 * Math.PI * B).toFixed(2)})`;
  },
  'cosmic expansion: light from the RK4 table gives 1 + z = 1/a for an observer today': () => {
    const h = ce.buildHistory(planck);
    const chi = ce.comovingDistance(planck, 2);
    const z = ce.observedZ(h, h.t0, chi);
    close(z, 2, 2e-3, 'z from conformal-time table');
    close(h.eta0, ce.particleHorizon(planck), 0.002 * h.eta0, 'particle horizon');
    return `z = ${z.toFixed(4)}, particle horizon ${(h.eta0 / 1000).toFixed(2)} Gpc`;
  },
};
