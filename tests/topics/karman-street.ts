import { assert, close } from '../assert.ts';
import * as ks from '../../src/topics/karman-street/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'karman street: D2Q9 equilibrium has the right mass and momentum, and BGK conserves both': () => {
    const r = ks.rng(3);
    let worst = 0;
    for (let trial = 0; trial < 200; trial++) {
      const rho = 0.8 + 0.4 * r();
      const ux = 0.3 * (r() - 0.5);
      const uy = 0.3 * (r() - 0.5);
      let m = 0;
      let jx = 0;
      let jy = 0;
      for (let i = 0; i < 9; i++) {
        const fe = ks.feq(i, rho, ux, uy);
        m += fe;
        jx += fe * ks.CX[i];
        jy += fe * ks.CY[i];
      }
      worst = Math.max(worst, Math.abs(m - rho), Math.abs(jx - rho * ux), Math.abs(jy - rho * uy));
    }
    assert(worst < 1e-14, `equilibrium moments off by ${worst}`);
    // A full stream + collide step on a periodic box of random populations.
    const lat = new ks.Lattice({ nx: 16, ny: 12, boundary: 'periodic', tau: 0.7 });
    for (let k = 0; k < lat.n; k++) lat.setCell(k, 1 + 0.1 * (r() - 0.5), 0.05 * (r() - 0.5), 0.05 * (r() - 0.5));
    const tot = () => {
      let m = 0;
      let px = 0;
      let py = 0;
      for (let k = 0; k < lat.n; k++) {
        for (let i = 0; i < 9; i++) {
          const v = lat.f[i * lat.n + k];
          m += v;
          px += v * ks.CX[i];
          py += v * ks.CY[i];
        }
      }
      return [m, px, py];
    };
    const [m0, px0, py0] = tot();
    for (let s = 0; s < 50; s++) lat.step();
    const [m1, px1, py1] = tot();
    close(m1 / m0, 1, 1e-5, 'total mass');
    close(px1, px0, 1e-4, 'x momentum');
    close(py1, py0, 1e-4, 'y momentum');
    return `equilibrium error ${worst.toExponential(0)}, mass drift ${Math.abs(m1 / m0 - 1).toExponential(0)} after 50 steps`;
  },

  'karman street: shear wave decays at rate nu k^2 with nu = (tau - 1/2)/3': () => {
    const out: string[] = [];
    for (const tau of [0.6, 0.9, 1.4]) {
      const L = 64;
      const lat = new ks.Lattice({ nx: 4, ny: L, boundary: 'periodic', tau });
      const A = 0.01;
      const k = (2 * Math.PI) / L;
      for (let y = 0; y < L; y++) for (let x = 0; x < 4; x++) lat.setCell(y * 4 + x, 1, A * Math.sin(k * y), 0);
      const amp = () => {
        let s = 0;
        for (let y = 0; y < L; y++) s += lat.ux[y * 4 + 1] * Math.sin(k * y);
        return (2 * s) / L;
      };
      // Let the non-equilibrium part settle, then time the decay.
      for (let s = 0; s < 20; s++) lat.step();
      const a0 = amp();
      const T = 400;
      for (let s = 0; s < T; s++) lat.step();
      const a1 = amp();
      const nuMeas = Math.log(a0 / a1) / (k * k * T);
      const nu = ks.nuFromTau(tau);
      close(nuMeas / nu, 1, 0.01, `tau=${tau} viscosity ratio`);
      close(ks.tauFromNu(nu), tau, 1e-12, 'tau round trip');
      out.push(`tau ${tau}: ${(nuMeas / nu).toFixed(4)}`);
    }
    return `measured / predicted nu: ${out.join(', ')}`;
  },

  'karman street: body-forced channel matches the Poiseuille parabola within 2%': () => {
    const ny = 34;
    const tau = 0.9;
    const Fx = 1e-5;
    const lat = new ks.Lattice({ nx: 4, ny, boundary: 'periodic', tau, fx: Fx });
    for (let x = 0; x < 4; x++) {
      lat.setSolid(x, true);
      lat.setSolid((ny - 1) * 4 + x, true);
    }
    for (let s = 0; s < 20000; s++) lat.step();
    const nu = ks.nuFromTau(tau);
    // Halfway bounce-back puts the walls half a cell outside the first fluid row.
    const y0 = 0.5;
    const y1 = ny - 1.5;
    const umax = (Fx / (2 * nu)) * ((y1 - y0) / 2) ** 2;
    let worst = 0;
    for (let y = 1; y < ny - 1; y++) {
      const exact = (Fx / (2 * nu)) * (y - y0) * (y1 - y);
      worst = Math.max(worst, Math.abs(lat.ux[y * 4 + 1] - exact) / umax);
    }
    assert(worst < 0.02, `max deviation ${(worst * 100).toFixed(2)}% of u_max`);
    return `max deviation ${(worst * 100).toFixed(2)}% of u_max = ${umax.toExponential(2)}`;
  },

  'karman street: cylinder wake sheds with St in 0.15-0.25 (small grid, seeded)': () => {
    const nx = 170;
    const ny = 54;
    const U = 0.1;
    const lat = new ks.Lattice({ nx, ny, u0: U, tau: 0.6 });
    ks.buildObstacle(lat, 'cylinder', { cx: 34, cy: ny / 2, size: 8, aoa: 0 });
    const ext = ks.solidExtent(lat, { count: 0, xmin: 0, xmax: 0, ymin: 0, ymax: 0 });
    const D = ext.ymax - ext.ymin + 1;
    const Re = 110;
    lat.tau = ks.tauFromNu((U * D) / Re);
    ks.perturb(lat, 0.05, 7);
    const px = ext.xmax + 2 * D;
    const py = Math.round((ext.ymin + ext.ymax) / 2);
    const cap = 1024;
    const sig = new Float64Array(cap);
    let ns = 0;
    const steps = 10000;
    for (let s = 1; s <= steps; s++) {
      lat.step();
      if (s > steps - cap * 5 && s % 5 === 0) sig[ns++ % cap] = lat.uy[py * nx + px];
    }
    const amp = ks.rms(sig, 0, cap, cap) / U;
    assert(amp > 0.05, `no shedding: rms v / U = ${amp}`);
    const spec = new Float32Array(300);
    const f = ks.spectrum(sig, 0, cap, cap, 5, (0.05 * U) / D, (0.5 * U) / D, 300, spec);
    const St = ks.strouhal(f, D, U);
    assert(St > 0.15 && St < 0.25, `St = ${St}`);
    return `Re ${Re}, D ${D}: St = ${St.toFixed(3)} (Williamson fit ${ks.williamsonSt(Re).toFixed(3)}), rms v/U ${amp.toFixed(2)}`;
  },

  'karman street: steady symmetric wake at Re = 25 (no shedding)': () => {
    const nx = 140;
    const ny = 54;
    const U = 0.1;
    const lat = new ks.Lattice({ nx, ny, u0: U, tau: 0.6 });
    ks.buildObstacle(lat, 'cylinder', { cx: 34, cy: ny / 2, size: 8, aoa: 0 });
    const D = 9;
    lat.tau = ks.tauFromNu((U * D) / 25);
    ks.perturb(lat, 0.05, 7);
    const px = 34 + 4 + 2 * D;
    const py = ny / 2;
    const cap = 400;
    const sig = new Float64Array(cap);
    let ns = 0;
    const steps = 5000;
    for (let s = 1; s <= steps; s++) {
      lat.step();
      if (s > steps - cap * 5 && s % 5 === 0) sig[ns++ % cap] = lat.uy[py * nx + px];
    }
    const amp = ks.rms(sig, 0, cap, cap) / U;
    assert(amp < 1e-3, `wake still oscillating: rms v / U = ${amp}`);
    return `rms v / U = ${amp.toExponential(1)}`;
  },
};
