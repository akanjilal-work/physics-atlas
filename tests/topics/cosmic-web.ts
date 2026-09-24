import { assert, close } from '../assert.ts';
import * as cw from '../../src/topics/cosmic-web/physics.ts';

type Suite = () => string | void;

/** A single plane-wave density mode along x with Zel'dovich displacement, on an np^3 lattice. */
function planeWaveIC(np: number, A: number, nk: number, c: cw.Cosmo): { x: Float64Array; p: Float64Array; k: number } {
  const n = np ** 3;
  const s = cw.NG / np;
  const off = 0.25 * s;
  const k = (2 * Math.PI * nk) / cw.NG;
  const ai = cw.A_INIT;
  const D = cw.growth(ai, c) / cw.growth(1, c);
  const vf = ai * ai * cw.hubble(ai, c) * cw.growthRate(ai, c) * D;
  const x = new Float64Array(n * 3);
  const p = new Float64Array(n * 3);
  for (let i = 0; i < np; i++)
    for (let j = 0; j < np; j++)
      for (let l = 0; l < np; l++) {
        const q = (i * np + j) * np + l;
        const qx = i * s + off;
        const S = -(A / k) * Math.sin(k * qx); // div S = -A cos(k q)
        x[q * 3] = cw.wrapCoord(qx + D * S, cw.NG);
        x[q * 3 + 1] = j * s + off;
        x[q * 3 + 2] = l * s + off;
        p[q * 3] = vf * S;
      }
  return { x, p, k };
}

/** Cosine amplitude of the x-mode k in the CIC density of the particles. */
function modeAmp(pos: ArrayLike<number>, n: number, k: number): number {
  const mesh = new Float64Array(cw.NG3);
  cw.cicAssign(pos, n, mesh, cw.NG, cw.NG3 / n);
  const plane = cw.NG * cw.NG;
  let sc = 0;
  for (let i = 0; i < cw.NG; i++) {
    let r = 0;
    for (let m = 0; m < plane; m++) r += mesh[i * plane + m];
    sc += (r / plane) * Math.cos(k * i);
  }
  return (2 * sc) / cw.NG;
}

export const suites: Record<string, Suite> = {
  'cosmic web: FFT Poisson solve of a single sinusoidal mode matches the analytic potential': () => {
    const fft = new cw.FFT3(cw.NG);
    const re = new Float64Array(cw.NG3);
    const im = new Float64Array(cw.NG3);
    const n = 3;
    const k = (2 * Math.PI * n) / cw.NG;
    const A = 0.37;
    const Om = 0.31;
    // delta = A cos(k (x + y)) so the mode is diagonal: |k|^2 = 2 k^2
    for (let i = 0; i < cw.NG; i++)
      for (let j = 0; j < cw.NG; j++)
        for (let l = 0; l < cw.NG; l++) re[(i * cw.NG + j) * cw.NG + l] = A * Math.cos(k * (i + j));
    cw.solvePoisson(fft, re, im, Om);
    let err = 0;
    let peak = 0;
    for (let i = 0; i < cw.NG; i++)
      for (let j = 0; j < cw.NG; j++) {
        const exact = (-1.5 * Om * A * Math.cos(k * (i + j))) / (2 * k * k);
        err = Math.max(err, Math.abs(re[(i * cw.NG + j) * cw.NG + 5] - exact));
        peak = Math.max(peak, Math.abs(exact));
      }
    assert(err / peak < 1e-10, `relative error ${err / peak}`);
    return `max relative error ${(err / peak).toExponential(1)}`;
  },
  'cosmic web: small-amplitude mode grows as D = a in Einstein-de Sitter (within 3%)': () => {
    const c = cw.COSMO.eds;
    const np = 32;
    const ic = planeWaveIC(np, 0.02, 1, c);
    const sim = new cw.PMSim({ np, seed: 1, spec: { slope: 1, shape: 'cdm', warm: false }, bg: 'eds', ic: { x: ic.x, p: ic.p } });
    const a0 = modeAmp(sim.x, sim.n, ic.k);
    let checked = '';
    while (!sim.done) {
      sim.advance();
      if (Math.abs(sim.a - 0.2) < 0.01 && !checked) {
        const r = modeAmp(sim.x, sim.n, ic.k) / a0 / (sim.a / cw.A_INIT);
        close(r, 1, 0.03, `growth ratio at a=${sim.a.toFixed(3)}`);
        checked = r.toFixed(4);
      }
    }
    const r1 = modeAmp(sim.x, sim.n, ic.k) / a0 / (1 / cw.A_INIT);
    close(r1, 1, 0.03, 'growth ratio at a=1');
    return `delta/delta_i over a/a_i: ${checked} at a=0.2, ${r1.toFixed(4)} at a=1 (growth factor 51)`;
  },
  'cosmic web: LCDM growth D(1) and f(1) match Carroll-Press-Turner and Om^0.55': () => {
    const c = cw.COSMO.lcdm;
    const g0 = (2.5 * c.Om) / (Math.pow(c.Om, 4 / 7) - c.Ol + (1 + c.Om / 2) * (1 + c.Ol / 70));
    close(cw.growth(1, c), g0, 0.005, 'D(1)');
    close(cw.growthRate(1, c), Math.pow(c.Om, 0.55), 0.01, 'f(1)');
    close(cw.growth(0.3, cw.COSMO.eds), 0.3, 1e-9, 'EdS D(a) = a');
    return `D(1) = ${cw.growth(1, c).toFixed(4)} (CPT ${g0.toFixed(4)}), f = ${cw.growthRate(1, c).toFixed(4)}`;
  },
  'cosmic web: cloud-in-cell assignment conserves mass': () => {
    const rnd = cw.mulberry32(42);
    const n = 5000;
    const pos = new Float64Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = rnd() * cw.NG;
    // some particles right at the periodic edge
    pos[0] = cw.NG - 1e-9;
    pos[4] = 0;
    const mesh = new Float64Array(cw.NG3);
    const m = 0.73;
    cw.cicAssign(pos, n, mesh, cw.NG, m);
    let total = 0;
    for (let i = 0; i < cw.NG3; i++) total += mesh[i];
    close(total, n * m, 1e-9 * n, 'total mass');
    // uniform 32^3 lattice at the simulation offset gives an exactly uniform mesh
    const np = 32;
    const s = cw.NG / np;
    const lat = new Float64Array(np ** 3 * 3);
    for (let i = 0; i < np ** 3; i++) {
      lat[i * 3] = (Math.floor(i / (np * np)) + 0.25) * s;
      lat[i * 3 + 1] = ((Math.floor(i / np) % np) + 0.25) * s;
      lat[i * 3 + 2] = ((i % np) + 0.25) * s;
    }
    cw.cicAssign(lat, np ** 3, mesh, cw.NG, cw.NG3 / np ** 3);
    let dev = 0;
    for (let i = 0; i < cw.NG3; i++) dev = Math.max(dev, Math.abs(mesh[i] - 1));
    assert(dev < 1e-12, `lattice not uniform: ${dev}`);
    return `sum ${total.toFixed(6)} = ${(n * m).toFixed(6)}, lattice max |delta| ${dev.toExponential(0)}`;
  },
  'cosmic web: friends-of-friends finds exactly 2 halos in a synthetic two-cluster set': () => {
    const rnd = cw.mulberry32(7);
    const L = 64;
    const pos: number[] = [];
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
    // cluster A straddles the periodic boundary, cluster B in the middle
    for (let i = 0; i < 300; i++) pos.push(cw.wrapCoord(0.2 + 0.3 * gauss(), L), 10 + 0.3 * gauss(), 10 + 0.3 * gauss());
    for (let i = 0; i < 200; i++) pos.push(40 + 0.3 * gauss(), 40 + 0.3 * gauss(), 30 + 0.3 * gauss());
    // sparse background: 400 random particles
    for (let i = 0; i < 400; i++) pos.push(rnd() * L, rnd() * L, rnd() * L);
    const h = cw.fof(pos, pos.length / 3, L, 0.4, 20);
    assert(h.count === 2, `found ${h.count} halos`);
    assert(h.sizes[0] >= 285 && h.sizes[0] <= 310 && h.sizes[1] >= 190 && h.sizes[1] <= 210, `sizes ${Array.from(h.sizes)}`);
    const cx = h.centres[0] > L / 2 ? h.centres[0] - L : h.centres[0];
    close(cx, 0.2, 0.2, 'wrapped centre of cluster A');
    return `sizes ${h.sizes[0]}, ${h.sizes[1]}, centre A x = ${cx.toFixed(2)}`;
  },
  'cosmic web: Zel’dovich field has the requested sigma_8 in linear theory': () => {
    const spec = { slope: 0.96, shape: 'cdm' as const, warm: false };
    const fft = new cw.FFT3(cw.NG);
    // average over seeds: the rms displacement should match the box-sum prediction
    const np = 32;
    const m = cw.nMax(np);
    const kf = (2 * Math.PI) / cw.BOX;
    const A2 = (cw.SIGMA8 / cw.boxSigma8(spec, np)) ** 2;
    let pred = 0;
    for (let i = -m; i <= m; i++)
      for (let j = -m; j <= m; j++)
        for (let l = -m; l <= m; l++) {
          const n2 = i * i + j * j + l * l;
          if (!n2) continue;
          const k = kf * Math.sqrt(n2);
          pred += (A2 * cw.pShape(k, spec)) / (k * k);
        }
    const predCells = Math.sqrt(pred / cw.BOX ** 3) * (cw.NG / cw.BOX);
    let got = 0;
    const seeds = 3;
    for (let s = 1; s <= seeds; s++) got += cw.zeldovich(np, spec, s, cw.COSMO.eds, fft).sRms ** 2;
    got = Math.sqrt(got / seeds);
    close(got / predCells, 1, 0.1, 'rms displacement ratio');
    return `rms displacement today ${got.toFixed(2)} cells vs ${predCells.toFixed(2)} predicted`;
  },
};
