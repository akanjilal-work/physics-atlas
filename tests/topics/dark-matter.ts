import { assert, close } from '../assert.ts';
import * as dm from '../../src/topics/dark-matter/physics.ts';

type Suite = () => string | void;

const curve = (): dm.Curve => ({ bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 });

export const suites: Record<string, Suite> = {
  'dark matter: point mass gives Keplerian v ∝ r^-1/2, and a Freeman disk tends to it': () => {
    const M = 6e10;
    // v(4r) = v(r) / 2 exactly for a point mass.
    close(dm.vPoint(40, M) / dm.vPoint(10, M), 0.5, 1e-12, 'v(40)/v(10)');
    // Earth check of the unit system: G Msun / 1 AU gives 29.78 km/s.
    const AU_KPC = 1.495979e11 / dm.KPC_M;
    close(dm.vPoint(AU_KPC, 1), 29.78, 0.02, 'Earth orbital speed');
    // Visible-only galaxy: slope d ln v / d ln r at 60 kpc approaches -1/2.
    const s = dm.logSlope(60, dm.MW, 'newton');
    close(s, -0.5, 0.01, 'visible-only slope at 60 kpc');
    return `slope ${s.toFixed(4)}, Earth ${dm.vPoint(AU_KPC, 1).toFixed(2)} km/s`;
  },

  'dark matter: Freeman disk peaks at R = 2.15 Rd with v² = 0.387 GM/Rd, and the series joins smoothly': () => {
    let best = 0;
    let rBest = 0;
    for (let R = 1; R < 4; R += 1e-4) {
      const v2 = dm.vDisk2(R, 1, 1);
      if (v2 > best) {
        best = v2;
        rBest = R;
      }
    }
    // Freeman (1970) exponential disk: the curve peaks near 2.15 Rd with v_max^2 ≈ 0.387 GM/Rd.
    close(rBest, 2.15, 0.01, 'peak radius / Rd');
    close(best / dm.G, 0.387, 0.001, 'v_max^2 / (GM/Rd)');
    // Asymptotic branch versus Bessel branch at the joint y = 12.
    const y = 12;
    const bessel = 4 * y ** 3 * (dm.besselI0(y) * dm.besselK0(y) - dm.besselI1(y) * dm.besselK1(y));
    const q = 1 / (y * y);
    const series = 1 + q * (9 / 8 + (675 / 128) * q);
    close(bessel, series, 2e-5, 'joint (units of GM/R)');
    return `peak ${rBest.toFixed(3)} Rd, v²max ${(best / dm.G).toFixed(4)} GM/Rd`;
  },

  'dark matter: NFW enclosed mass matches direct integration of rho(r) and hits M200 at r200': () => {
    const M200 = 1e12;
    const rs = 20;
    const rhoS = dm.nfwRhoS(M200, rs);
    const R200 = dm.r200(M200);
    close(dm.nfwEnclosed(R200, rhoS, rs) / M200, 1, 1e-12, 'M(<r200)/M200');
    // Simpson integral of 4 pi r^2 rho_s / ((r/rs)(1 + r/rs)^2) out to 3 rs.
    const rho = (r: number) => rhoS / ((r / rs) * (1 + r / rs) ** 2);
    const R = 3 * rs;
    const n = 20000;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const r = (R * i) / n;
      const f = r === 0 ? 0 : 4 * Math.PI * r * r * rho(r);
      sum += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
    }
    const num = (sum * R) / n / 3;
    const ana = dm.nfwEnclosed(R, rhoS, rs);
    close(num / ana, 1, 1e-6, 'integral vs formula');
    // Milky Way check: r200 near 206 kpc for 1e12 Msun and h = 0.7.
    close(R200, 206, 2, 'r200');
    return `M(<3rs) ${ana.toExponential(3)} Msun, r200 ${R200.toFixed(1)} kpc`;
  },

  'dark matter: pseudo-isothermal halo gives a flat curve at sqrt(4 pi G rho0 rc^2)': () => {
    const rho0 = 5e7; // Msun / kpc^3
    const rc = 3;
    const vinf = dm.isoVinf(rho0, rc);
    let worst = 0;
    for (const r of [30, 60, 120, 240]) {
      const v = Math.sqrt((dm.G * dm.isoEnclosed(r, rho0, rc)) / r);
      // Exact: v^2 = vinf^2 (1 - atan(x)/x), so the deviation falls as 1/x.
      const exact = vinf * Math.sqrt(1 - Math.atan(r / rc) / (r / rc));
      close(v, exact, 1e-9, `v at ${r}`);
      if (r >= 60) worst = Math.max(worst, Math.abs(v / vinf - 1));
    }
    assert(worst < 0.04, `not flat: ${worst}`);
    return `v∞ = ${vinf.toFixed(1)} km/s, within ${(worst * 100).toFixed(1)}% beyond 20 rc`;
  },

  'dark matter: MOND deep limit gives v^4 = G M a0, and Newton when g >> a0': () => {
    const M = 6e10;
    const r = 2000; // far outside, gN << a0
    const gN = (dm.G * M) / (r * r);
    const v = Math.sqrt(dm.mondAccel(gN) * r);
    const ratio = v ** 4 / (dm.G * M * dm.A0);
    close(ratio, 1, 0.01, 'v^4 / (G M a0)');
    const gBig = 1e4 * dm.A0;
    close(dm.mondAccel(gBig) / gBig, 1, 2e-4, 'Newtonian regime');
    // a0 in these units: 1.2e-10 m/s^2 = 3703 (km/s)^2 / kpc.
    close(dm.A0, 3703, 1, 'a0 units');
    return `v = ${v.toFixed(1)} km/s, v⁴/GMa0 = ${ratio.toFixed(4)}`;
  },

  'dark matter: Milky Way parameters give 220 to 235 km/s at the Sun (R0 = 8.2 kpc)': () => {
    const c = curve();
    const v = dm.rotation(8.2, dm.MW, 'nfw', c).total;
    // Eilers et al. 2019 measure about 229 km/s at R0 = 8.122 kpc.
    assert(v > 220 && v < 235, `v(8.2) = ${v}`);
    const vis = c.visible;
    assert(vis < 200, 'visible matter alone should fall short');
    return `v(8.2 kpc) = ${v.toFixed(1)} km/s (visible alone ${vis.toFixed(0)})`;
  },

  'dark matter: Bullet collision keeps dark matter ballistic while gas lags and conserves momentum': () => {
    const s = dm.bulletInit();
    const tp = dm.bulletPassage(s);
    const [Mm, Mb] = dm.BULLET.M;
    const X1 = s.X[1];
    const V1 = s.V[1];
    const p0 = Mm * s.v[0] + Mb * s.v[1];
    let pErr = 0;
    while (s.t < tp + 200) {
      dm.bulletStep(s, 0.5);
      // Drag alone conserves gas momentum. The halo pull is an external force,
      // so only check before the gas separates from its halo.
      if (s.t < tp - 200) pErr = Math.max(pErr, Math.abs(Mm * s.v[0] + Mb * s.v[1] - p0));
    }
    close(s.X[1], X1 + V1 * s.t, 1e-6, 'dark matter moves ballistically');
    assert(pErr < 1e-3, `gas momentum drift ${pErr}`);
    const lag = s.X[1] - s.x[1];
    assert(lag > 150, `bullet gas lag ${lag}`);
    return `bullet gas lags its mass by ${lag.toFixed(0)} kpc at +200 Myr`;
  },
};
