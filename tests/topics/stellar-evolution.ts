import { assert, close } from '../assert.ts';
import * as se from '../../src/topics/stellar-evolution/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'stellar evolution: Stefan–Boltzmann with solar R and T_eff gives L_sun (IAU 2015 nominal)': () => {
    const L = se.luminositySI(se.R_SUN, se.T_SUN);
    const rel = Math.abs(L / se.L_SUN - 1);
    assert(rel < 1e-3, `L = ${L.toExponential(4)} W, off by ${rel}`);
    return `L = ${L.toExponential(4)} W`;
  },
  'stellar evolution: lifetime scaling t = 10 Gyr M^-2.5': () => {
    close(se.msLifetime(1), 10, 1e-12, 't(1)');
    close(se.msLifetime(10), 10 * Math.pow(10, -2.5), 1e-12, 't(10)');
    close(se.msLifetime(2) / se.msLifetime(1), Math.pow(2, -2.5), 1e-12, 'ratio');
    // Fuel over burn rate: t ∝ M/L with L = 1.4 M^3.5 above 2 M_sun.
    const r = (se.msLifetime(20) / se.msLifetime(4)) / ((20 / se.msLuminosity(20)) / (4 / se.msLuminosity(4)));
    close(r, 1, 1e-9, 't ∝ M/L');
    return `t(10 M_sun) = ${(se.msLifetime(10) * 1000).toFixed(1)} Myr`;
  },
  'stellar evolution: endpoint classification at the thresholds': () => {
    assert(se.endpoint(7.99) === 'white dwarf', '7.99');
    assert(se.endpoint(8) === 'neutron star', '8');
    assert(se.endpoint(24.99) === 'neutron star', '24.99');
    assert(se.endpoint(25) === 'black hole', '25');
    assert(se.endpoint(0.5) === 'white dwarf' && se.endpoint(40) === 'black hole', 'ends');
    // Every white dwarf from the initial–final mass relation stays below the Chandrasekhar limit.
    assert(se.wdMass(7.99) < se.M_CH, `WD from 7.99 M_sun = ${se.wdMass(7.99)}`);
  },
  'stellar evolution: T_eff from L and R round-trips, and the Sun comes out at 5772 K': () => {
    close(se.teff(1, 1), 5772, 1e-9, 'Sun');
    let worst = 0;
    for (const [L, R] of [[1e-3, 0.01], [0.06, 0.57], [2.3e3, 165], [1e5, 760], [3e5, 20]]) {
      const T = se.teff(L, R);
      worst = Math.max(worst, Math.abs(se.radiusFrom(L, T) / R - 1));
      const Lsi = se.luminositySI(R * se.R_SUN, T) / se.L_SUN;
      worst = Math.max(worst, Math.abs(Lsi / L - 1));
    }
    assert(worst < 2e-3, `worst relative error ${worst}`);
    return `worst ${worst.toExponential(1)}`;
  },
  'stellar evolution: Nauenberg white dwarf radius matches Sirius B (1.02 M_sun, 0.0081 R_sun) within 10%': () => {
    const R = se.wdRadius(1.02);
    close(R / 0.0081, 1, 0.1, 'R/R_obs');
    return `R = ${R.toFixed(5)} R_sun`;
  },
  'stellar evolution: mass–luminosity relation is L=1 at 1 M_sun and nearly continuous at its breaks': () => {
    close(se.msLuminosity(1), 1, 1e-12, 'L(1)');
    for (const m of [0.43, 2, 55]) {
      const lo = se.msLuminosity(m * (1 - 1e-9));
      const hi = se.msLuminosity(m);
      assert(Math.abs(hi / lo - 1) < 0.05, `jump at ${m}: ${lo} -> ${hi}`);
    }
  },
  'stellar evolution: tracks start on the scaling laws and age increases monotonically': () => {
    const tr = se.makeTrack();
    const p = se.makePoint();
    for (const M of [0.5, 1, 3, 5, 8, 15, 25, 40]) {
      se.buildTrack(M, tr);
      se.trackAt(tr, 0, p);
      close(p.logL, Math.log10(se.msLuminosity(M)), 1e-12, `logL0 ${M}`);
      close(10 ** p.logT, se.teff(se.msLuminosity(M), se.msRadius(M)), 1e-6, `T0 ${M}`);
      let prev = -1;
      for (let u = 0; u <= 1; u += 0.01) {
        se.trackAt(tr, u, p);
        assert(p.age >= prev, `age not monotonic at M=${M}, u=${u}`);
        prev = p.age;
      }
      close(se.trackAt(tr, se.U_KEY[1], p).age, se.msLifetime(M), 1e-9, `TAMS age ${M}`);
    }
  },
  'stellar evolution: blackbody colours: 3000 K is red-orange, 5772 K near white, 30 000 K blue-white': () => {
    const c = se.blackbodyRGB(3000);
    assert(c[0] > 0.95 && c[2] < 0.5, `3000 K ${c}`);
    const s = se.blackbodyRGB(5772);
    assert(s[0] > 0.95 && s[1] > 0.85 && s[2] > 0.8, `Sun ${s}`);
    const h = se.blackbodyRGB(30000);
    assert(h[2] > 0.99 && h[0] < 0.75, `30000 K ${h}`);
  },
};
