import { assert, close } from '../assert.ts';
import * as hy from '../../src/topics/hydrogen-orbitals/physics.ts';

type Suite = () => string | void;

const PAIRS: [number, number][] = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 3], [5, 2], [5, 4], [6, 0], [6, 5]];

export const suites: Record<string, Suite> = {
  'hydrogen: R_nl normalised, integral of r^2 R^2 dr = 1 (to 1e-6)': () => {
    let worst = 0;
    for (const [n, l] of PAIRS) {
      const I = hy.simpson((r) => hy.radialProb(n, l, r), 0, 40 * n * n + 60, 200000);
      worst = Math.max(worst, Math.abs(I - 1));
      close(I, 1, 1e-6, `norm of R_${n}${l}`);
    }
    return `${PAIRS.length} (n,l) pairs, worst |I-1| = ${worst.toExponential(1)}`;
  },
  'hydrogen: <r> by integration matches (3n^2 - l(l+1))/2': () => {
    for (const [n, l] of PAIRS) {
      const I = hy.simpson((r) => r * hy.radialProb(n, l, r), 0, 40 * n * n + 60, 200000);
      close(I, hy.meanRadius(n, l), 1e-6 * hy.meanRadius(n, l), `<r> for ${n},${l}`);
    }
    return `4f: ${hy.meanRadius(4, 3)} a0, 4s: ${hy.meanRadius(4, 0)} a0`;
  },
  'hydrogen: radial sign changes = n - l - 1 for every n <= 6': () => {
    let checked = 0;
    for (let n = 1; n <= hy.N_MAX; n++) {
      for (let l = 0; l < n; l++) {
        let changes = 0;
        let prev = hy.radial(n, l, 1e-6);
        const rMax = 4 * n * n + 20;
        for (let i = 1; i <= 20000; i++) {
          const v = hy.radial(n, l, (i / 20000) * rMax);
          if (v !== 0 && prev !== 0 && Math.sign(v) !== Math.sign(prev)) changes++;
          if (v !== 0) prev = v;
        }
        assert(changes === hy.radialNodes(n, l), `${n},${l}: ${changes} sign changes, expected ${n - l - 1}`);
        checked++;
      }
    }
    return `${checked} orbitals`;
  },
  'hydrogen: Y_lm normalised and real p_x = sqrt(3/4pi) x/r': () => {
    const pts = 400;
    for (const basis of ['real', 'complex'] as const) {
      for (let l = 0; l <= 4; l++) {
        for (let m = -l; m <= l; m++) {
          // midpoint rule in cos(theta) and phi
          let s = 0;
          const c = new Float64Array(2);
          for (let i = 0; i < pts; i++) {
            const ct = -1 + (2 * (i + 0.5)) / pts;
            for (let j = 0; j < 64; j++) {
              const phi = (2 * Math.PI * (j + 0.5)) / 64;
              if (basis === 'real') s += hy.ylmReal(l, m, ct, phi) ** 2;
              else {
                hy.ylmComplex(l, m, ct, phi, c);
                s += c[0] * c[0] + c[1] * c[1];
              }
            }
          }
          s *= (2 / pts) * ((2 * Math.PI) / 64);
          close(s, 1, 2e-4, `|Y_${l}${m}|^2 (${basis})`);
        }
      }
    }
    close(hy.ylmReal(1, 1, 0, 0), Math.sqrt(3 / (4 * Math.PI)), 1e-12, 'p_x on +x');
    close(hy.ylmReal(2, -2, 0, Math.PI / 4), Math.sqrt(15 / (16 * Math.PI)), 1e-12, 'd_xy on the diagonal');
  },
  'hydrogen: H-alpha 3->2 is 656.47 nm (vacuum, reduced mass), 656.28 nm in air, 656.11 nm without correction': () => {
    const vac = hy.transitionWavelengthNm(3, 2, true);
    const inf = hy.transitionWavelengthNm(3, 2, false);
    const air = hy.airWavelengthNm(vac);
    close(vac, 656.3, 0.5, 'reduced-mass vacuum wavelength');
    close(vac, 656.47, 0.01, 'reduced-mass vacuum wavelength (precise)');
    close(air, 656.28, 0.02, 'air wavelength');
    close(inf, 656.11, 0.01, 'infinite nuclear mass');
    close(hy.transitionWavelengthNm(2, 1, true), 121.567, 0.005, 'Lyman alpha');
    close(hy.HC_EV_NM / hy.transitionEnergyEv(3, 2, false), inf, 0.01, 'E = hc / lambda');
    close(hy.energyEv(1) - hy.energyEv(2), -hy.transitionEnergyEv(2, 1, false), 1e-12, 'energy ladder');
    return `vac ${vac.toFixed(3)} nm, air ${air.toFixed(3)} nm, M=inf ${inf.toFixed(3)} nm`;
  },
  'hydrogen: sampler radial histogram matches P(r) = r^2 R^2 (3s, 3d real, 4f complex)': () => {
    const N = 120000;
    const pos = new Float32Array(N * 3);
    const ph = new Float32Array(N);
    const notes: string[] = [];
    for (const o of [
      { n: 3, l: 0, m: 0, basis: 'real' as const },
      { n: 3, l: 2, m: 1, basis: 'real' as const },
      { n: 4, l: 3, m: -2, basis: 'complex' as const },
    ]) {
      hy.sampleOrbital(o, N, hy.mulberry32(7), pos, ph);
      const rMax = 2.5 * o.n * o.n + 10;
      const B = 40;
      const hist = new Float64Array(B);
      for (let i = 0; i < N; i++) {
        const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        const b = Math.floor((r / rMax) * B);
        if (b < B) hist[b]++;
      }
      let worst = 0;
      for (let b = 0; b < B; b++) {
        const expect = hy.simpson((r) => hy.radialProb(o.n, o.l, r), (b * rMax) / B, ((b + 1) * rMax) / B, 200);
        const got = hist[b] / N;
        const sigma = Math.sqrt(Math.max(expect, 1e-6) / N);
        worst = Math.max(worst, Math.abs(got - expect) / sigma);
      }
      assert(worst < 5, `${o.n},${o.l},${o.m}: worst bin off by ${worst.toFixed(1)} sigma`);
      notes.push(`${hy.orbitalName(o.n, o.l, o.m, o.basis)} worst ${worst.toFixed(1)}σ`);
    }
    return notes.join(', ');
  },
  'hydrogen: sampler angles and signs, 2p_z lobes have opposite sign and cos^2 distribution': () => {
    const N = 80000;
    const pos = new Float32Array(N * 3);
    const ph = new Float32Array(N);
    hy.sampleOrbital({ n: 2, l: 1, m: 0, basis: 'real' }, N, hy.mulberry32(3), pos, ph);
    let c2 = 0;
    let wrong = 0;
    for (let i = 0; i < N; i++) {
      const z = pos[i * 3 + 2];
      const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], z);
      c2 += (z / r) ** 2;
      if ((z > 0 && ph[i] !== 0) || (z < 0 && ph[i] === 0)) wrong++;
    }
    close(c2 / N, 3 / 5, 0.01, '<cos^2 theta> for p_z');
    assert(wrong === 0, `${wrong} points with the wrong sign`);
    assert(hy.orbitalName(3, 2, 1) === '3d_xz' && hy.orbitalName(3, 2, 0) === '3d_z2', 'orbital names');
  },
};
