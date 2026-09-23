import { assert, close } from '../assert.ts';
import * as mx from '../../src/topics/maxwell-fields/physics.ts';

type Suite = () => string | void;

const nC = 1e-9;
const out = new Float64Array(3);

export const suites: Record<string, Suite> = {
  'maxwell: Gauss E, numerical flux through sphere and cube equals q_enc/ε0': () => {
    const charges: mx.PointCharge[] = [
      { x: 0.3, y: -0.2, z: 0.1, q: 2 * nC },
      { x: -0.4, y: 0.5, z: -0.2, q: -0.5 * nC },
      { x: 3, y: 0, z: 0, q: 5 * nC }, // outside both surfaces
    ];
    const F: mx.Vec3Fn = (x, y, z, o) => mx.coulombField(charges, x, y, z, o);
    const expected = (1.5 * nC) / mx.EPS0;
    let worst = 0;
    for (const shape of ['sphere', 'cube'] as const) {
      const s: mx.Surface = { shape, cx: 0, cy: 0, cz: 0, size: 1.2 };
      const enc = mx.enclosedCharge(charges, s);
      assert(enc.n === 2, `${shape}: expected 2 enclosed, got ${enc.n}`);
      const f = mx.surfaceFlux(F, s);
      const rel = Math.abs(f.net / expected - 1);
      worst = Math.max(worst, rel);
      close(f.net / expected, 1, 1e-6, `${shape} flux / (q/ε0)`);
    }
    // a surface that encloses nothing has zero net flux
    const empty = mx.surfaceFlux(F, { shape: 'cube', cx: 1.6, cy: 0, cz: 0, size: 0.5 });
    close(empty.net / expected, 0, 1e-6, 'empty cube');
    return `worst rel. error ${worst.toExponential(1)}`;
  },
  'maxwell: Gauss B, net flux of a current loop through closed surfaces ≈ 0': () => {
    const w = mx.currentLoop(1, 10, 64);
    const F: mx.Vec3Fn = (x, y, z, o) => mx.biotSavart(w, x, y, z, o);
    let worst = 0;
    const cases: mx.Surface[] = [
      { shape: 'sphere', cx: 0.2, cy: 0.3, cz: 0, size: 0.6 }, // inside the loop, crossed by strong flux
      { shape: 'cube', cx: 0.9, cy: 0, cz: 0.1, size: 0.45 }, // straddles the wire
      { shape: 'sphere', cx: 0, cy: 0, cz: 0, size: 2 }, // swallows the whole loop
    ];
    for (const s of cases) {
      const f = mx.surfaceFlux(F, s, { panels: 12 });
      const rel = Math.abs(f.net) / f.out;
      worst = Math.max(worst, rel);
      assert(f.out > 0, 'no flux at all');
      assert(rel < 2e-3, `${s.shape} at (${s.cx},${s.cy}) net/out = ${rel}`);
    }
    return `worst |net|/outward ${worst.toExponential(1)}`;
  },
  'maxwell: Biot–Savart loop gives μ0 I/(2R) at the centre and the on-axis law': () => {
    const R = 0.7;
    const I = 3;
    const w = mx.currentLoop(R, I, 512);
    mx.biotSavart(w, 0, 0, 0, out);
    const b0 = (mx.MU0 * I) / (2 * R);
    close(out[1] / b0, 1, 1e-4, 'centre field');
    close(Math.hypot(out[0], out[2]) / b0, 0, 1e-9, 'centre field is axial');
    for (const z of [0.3, 1, 2.5]) {
      mx.biotSavart(w, 0, z, 0, out);
      close(out[1] / mx.loopAxisField(I, R, z), 1, 1e-4, `axis z=${z}`);
    }
    return `B(0)=${(b0 * 1e6).toFixed(3)} μT`;
  },
  'maxwell: Faraday EMF equals −dΦ/dt by finite differences': () => {
    const p: mx.CoilParams = { m: 80, R: 0.6, N: 20, L: 0.8 };
    const x = (t: number) => -3 + 1.5 * t + 0.2 * Math.sin(2 * t);
    const v = (t: number) => 1.5 + 0.4 * Math.cos(2 * t);
    const h = 1e-5;
    let worst = 0;
    let peak = 0;
    for (let t = 0; t <= 4; t += 0.05) {
      const fd = -(mx.coilLinkage(p, x(t + h)) - mx.coilLinkage(p, x(t - h))) / (2 * h);
      const e = mx.coilEmf(p, x(t), v(t));
      peak = Math.max(peak, Math.abs(e));
      worst = Math.max(worst, Math.abs(fd - e));
    }
    assert(worst / peak < 1e-6, `max |FD − EMF| / peak = ${worst / peak}`);
    // Lenz: north pole approaching from −x raises flux along +x, so the EMF is negative.
    assert(mx.coilEmf(p, -1, 1) < 0, 'approaching magnet should give negative EMF');
    assert(mx.coilEmf(p, -1, -1) > 0, 'reversed motion flips the sign');
    return `peak EMF ${(peak * 1e3).toFixed(2)} mV, worst mismatch ${(worst / peak).toExponential(1)}`;
  },
  'maxwell: dipole turn flux Φ = μ0 m R²/(2(R²+z²)^{3/2}) matches a surface integral of B': () => {
    const m = 50;
    const R = 0.5;
    for (const z of [0.4, 1.2]) {
      // integrate B_x over the disc at x = z from a dipole at the origin (reuse discFluxY by rotating axes)
      const F: mx.Vec3Fn = (a, b, c, o) => {
        mx.dipoleFieldX(m, 0, b, a, c, o);
        const bx = o[0];
        o[0] = o[1];
        o[1] = bx;
      };
      const num = mx.discFluxY(F, R, z, 96, 64);
      close(num / mx.dipoleTurnFlux(m, R, z), 1, 1e-6, `z=${z}`);
    }
  },
  'maxwell: Ampère–Maxwell circulation equals μ0 (I_c + I_d) on the wire and in the gap': () => {
    const p: mx.CapParams = { I: 4, a: 1, d: 0.6 };
    const F: mx.Vec3Fn = (x, y, z, o) => mx.capB(p, x, y, z, o);
    for (const [x0, r] of [[-2, 0.5], [-2, 1.7], [0, 0.4], [0.1, 1.5]]) {
      const c = mx.circulation(F, x0, r);
      const e = mx.enclosedCurrents(p, x0, r);
      close(c / (mx.MU0 * (e.Ic + e.Id)), 1, 1e-9, `loop x=${x0} r=${r}`);
    }
  },
};
