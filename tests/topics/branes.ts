import { assert, close } from '../assert.ts';
import * as br from '../../src/topics/branes/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'branes: [0,0,1] clusters into U(2)×U(1), other stacks too': () => {
    assert(br.gaugeGroup([0, 0, 1]) === 'U(2)×U(1)', `got ${br.gaugeGroup([0, 0, 1])}`);
    assert(br.gaugeGroup([1, 0, 0]) === 'U(2)×U(1)', 'order of input should not matter');
    assert(br.gaugeGroup([2, 2, 2]) === 'U(3)', `got ${br.gaugeGroup([2, 2, 2])}`);
    assert(br.gaugeGroup([-1, 0, 1, 2]) === 'U(1)×U(1)×U(1)×U(1)', 'spread branes');
    assert(br.gaugeGroup([0, 0.5e-6, 1], 1e-6) === 'U(2)×U(1)', 'within eps counts as coincident');
    const cl = br.clusterBranes([0.3, -1, 0.3, -1]);
    assert(cl.length === 2 && cl[0].members.join() === '1,3' && cl[1].members.join() === '0,2', `clusters ${JSON.stringify(cl)}`);
    return `${br.gaugeGroup([0, 0, 1])}, ${br.gaugeGroup([5, 5, 5])}`;
  },
  'branes: massless vectors Σk² and N² = massless + stretched sectors': () => {
    const cases: [number[], number][] = [[[0, 0, 1], 5], [[0, 0, 0, 0], 16], [[0, 1, 2, 3], 4], [[0, 0, 1, 1], 8], [[7], 1]];
    for (const [pos, want] of cases) {
      const got = br.masslessVectors(pos);
      assert(got === want, `${JSON.stringify(pos)}: Σk² = ${got}, want ${want}`);
      // Every one of the N² oriented sectors is either massless (same stack) or stretched.
      const stretched = br.stretchedSectors(pos).reduce((s, x) => s + x.count, 0);
      assert(got + stretched === br.sectorCount(pos.length), `${JSON.stringify(pos)}: ${got} + ${stretched} ≠ N²`);
    }
    return 'U(2)×U(1) has 5 massless vectors';
  },
  "branes: M = y/(2πα') is linear with slope 1/(2π), and M² formula agrees at N = 1": () => {
    const ys = [0, 0.1, 0.5, 1, 2.5, 6];
    for (const y of ys) {
      close(br.stretchedMass(y), y / (2 * Math.PI), 1e-15, `M(${y})`);
      close(br.openMass2(y, 1), br.stretchedMass(y) ** 2, 1e-15, `M²(${y}, N=1)`);
    }
    const slope = (br.stretchedMass(3) - br.stretchedMass(1)) / 2;
    close(slope, 1 / (2 * Math.PI), 1e-15, 'slope');
    close(br.stretchedMass(1, 0.5), 1 / Math.PI, 1e-15, "α' = 1/2 doubles the tension");
    close(br.openMass2(0, 0), -1, 1e-15, 'open tachyon at N = 0');
    close(br.openMass2(0, 2), 1, 1e-15, 'first massive level');
    // W masses between clusters
    const w = br.stretchedSectors([0, 0, 1]);
    assert(w.length === 1 && w[0].count === 4, 'U(2)×U(1): one W family of 2·2·1 oriented strings');
    close(w[0].M, 1 / (2 * Math.PI), 1e-15, 'W mass');
    close(br.lightestStretched([0, 3, 1]), 1 / (2 * Math.PI), 1e-15, 'lightest');
    assert(br.lightestStretched([2, 2]) === Infinity, 'single stack has no stretched string');
    return `slope ${slope.toFixed(6)} = 1/2π`;
  },
  'branes: N branes give N² sectors': () => {
    for (let n = 1; n <= 6; n++) {
      assert(br.sectorCount(n) === n * n, `N=${n}`);
      // All coincident: every sector is a massless vector of U(N).
      assert(br.masslessVectors(new Array(n).fill(0)) === n * n, `U(${n}) dimension`);
    }
    return '1, 4, 9, 16, 25, 36';
  },
  'branes: string endpoints sit on the branes (Dirichlet) and slide freely (Neumann)': () => {
    const spec: br.OpenStringSpec = {
      xa: -1.3, xb: 2.1, yc: 0.4, zc: -0.2,
      modes: [
        { n: 1, ax: 0.3, ay: 0.5, az: 0.4, phase: 0.2 },
        { n: 2, ax: 0.2, ay: 0.3, az: 0.1, phase: 1.1 },
        { n: 3, ax: 0.1, ay: 0.1, az: 0.2, phase: 2.0 },
      ],
    };
    const p = { x: 0, y: 0, z: 0 };
    const q = { x: 0, y: 0, z: 0 };
    let worstD = 0;
    let worstN = 0;
    let moved = 0;
    const h = 1e-5;
    for (let t = 0; t < 10; t += 0.37) {
      br.openStringPoint(0, t, spec, p);
      worstD = Math.max(worstD, Math.abs(p.x - spec.xa));
      const y0 = p.y;
      br.openStringPoint(Math.PI, t, spec, p);
      worstD = Math.max(worstD, Math.abs(p.x - spec.xb));
      moved = Math.max(moved, Math.abs(y0 - spec.yc));
      // Neumann: dY/dσ and dZ/dσ vanish at both ends
      for (const s of [0, Math.PI]) {
        const a = s === 0 ? 0 : Math.PI - h;
        br.openStringPoint(a, t, spec, p);
        br.openStringPoint(a + h, t, spec, q);
        worstN = Math.max(worstN, Math.abs(q.y - p.y) / h, Math.abs(q.z - p.z) / h);
      }
    }
    assert(worstD < 1e-12, `endpoint off brane by ${worstD}`);
    assert(worstN < 1e-4, `Neumann slope ${worstN}`);
    assert(moved > 0.1, 'endpoints should slide along the brane');
    // writeOpenString endpoints
    const buf = new Float32Array(40 * 3);
    br.writeOpenString(buf, 40, 1.7, spec);
    close(buf[0], spec.xa, 1e-6, 'first point');
    close(buf[39 * 3], spec.xb, 1e-6, 'last point');
    return `Dirichlet error ${worstD.toExponential(1)}, Neumann slope ${worstN.toExponential(1)}`;
  },
  'branes: ADD force law is Newtonian far away and 1/r^(2+n) close in': () => {
    const R = 1;
    close(br.addForce(10, R, 2) * 100, 1, 1e-12, 'r ≫ R');
    const slope = Math.log(br.addForce(0.01, R, 2) / br.addForce(0.1, R, 2)) / Math.log(10);
    close(slope, 4, 1e-9, 'n = 2 gives 1/r⁴');
    close(br.addForce(R, R, 3), 1, 1e-12, 'continuous at r = R');
  },
};
