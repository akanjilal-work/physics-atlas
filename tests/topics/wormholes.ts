import { assert, close } from '../assert.ts';
import * as wh from '../../src/topics/wormholes/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'wormholes: embedding satisfies dr² + dz² = dℓ² (radial metric relation)': () => {
    let worst = 0;
    for (const b0 of [0.5, 1, 2.3]) {
      for (let l = -6; l <= 6; l += 0.37) {
        const h = 1e-5;
        const dr = (wh.areal(l + h, b0) - wh.areal(l - h, b0)) / (2 * h);
        const dz = (wh.embedZ(l + h, b0) - wh.embedZ(l - h, b0)) / (2 * h);
        worst = Math.max(worst, Math.abs(dr * dr + dz * dz - 1));
      }
    }
    assert(worst < 1e-8, `max |r'² + z'² − 1| = ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'wormholes: rays with b < b0 cross, b > b0 turn back at ℓ_t = √(b² − b0²)': () => {
    const b0 = 1;
    for (const b of [0, 0.5, 0.9, 0.99]) {
      const r = wh.trace(8, b, b0, 8, 2e-3);
      assert(r.crossed, `b=${b} should cross`);
    }
    for (const b of [1.01, 1.2, 2, 4]) {
      const r = wh.trace(8, b, b0, 8, 2e-3);
      assert(!r.crossed, `b=${b} should turn back`);
      close(r.lMin, wh.turningPoint(b, b0), 2e-3, `turning point for b=${b}`);
    }
    return 'crossing threshold at b = b0 confirmed';
  },
  'wormholes: far-field deflection → π b0²/(4b²), tiny and 1/b² (no mass)': () => {
    const b0 = 1;
    const a20 = wh.deflection(20, b0);
    const w20 = wh.weakDeflection(20, b0);
    close(a20 / w20, 1, 3e-3, 'α/α_weak at b=20 b0');
    assert(a20 < 0.002, `deflection at b=20 b0 is ${a20} rad`);
    // Doubling b cuts the deflection by 4, not 2: a massless lens.
    close(wh.deflection(40, b0) / a20, 0.25, 2e-3, 'α(40)/α(20)');
    // K(k) against a published value: K(1/√2) = 1.8540746773013719.
    close(wh.ellK(Math.SQRT1_2), 1.8540746773013719, 1e-13, 'K(1/√2)');
    return `α(20 b0) = ${a20.toExponential(3)} rad, weak = ${w20.toExponential(3)}`;
  },
  'wormholes: RK4 geodesic conserves b and matches the elliptic-integral sweep': () => {
    const b0 = 1;
    const L = 6;
    let worstB = 0;
    let worstN = 0;
    for (const b of [0.6, 1.5]) {
      const r = wh.trace(L, b, b0, L, 1e-3);
      worstB = Math.max(worstB, r.bDrift / b);
      worstN = Math.max(worstN, r.nullDrift);
      let expected: number;
      if (b < b0) {
        const k = b / b0;
        const a = Math.sqrt(b0 * b0 - b * b);
        expected = 2 * k * wh.ellF(Math.atan(L / a), k);
      } else {
        const R = wh.areal(L, b0);
        const psi = Math.asin(Math.sqrt((R * R - b * b) / (R * R - b0 * b0)));
        expected = 2 * wh.ellF(psi, b0 / b);
      }
      close(r.sweep, expected, 2e-4, `swept angle for b=${b}`);
    }
    assert(worstB < 1e-9, `relative b drift ${worstB}`);
    assert(worstN < 1e-9, `null residual ${worstN}`);
    return `b drift ${worstB.toExponential(1)}, null residual ${worstN.toExponential(1)}`;
  },
  'wormholes: null energy condition violated, ρ + p_r = −b0²/(4π r⁴) from the Einstein tensor': () => {
    const b0 = 1.3;
    for (const l of [0, 0.5, 2, 5]) {
      const { rho, pr } = wh.stressFromShape((x) => wh.areal(x, b0), l);
      const nec = rho + pr;
      assert(nec < 0, `NEC holds at l=${l}?`);
      close(nec / wh.necExact(l, b0), 1, 1e-4, `ρ + p_r at l=${l}`);
    }
    return 'ρ + p_r < 0 everywhere, most negative at the throat';
  },
  'wormholes: throat angular radius sin θ_t = b0 / r_cam, and sky map is flat far away': () => {
    close(wh.throatAngle(0, 1), Math.PI / 2, 1e-12, 'at the throat');
    close(Math.sin(wh.throatAngle(3, 1)), 1 / Math.sqrt(10), 1e-12, 'at ℓ = 3');
    // A ray looking straight outward goes straight out: Φ = 0.
    close(wh.skyAngle(Math.PI, 4, 1), 0, 1e-9, 'outward ray');
    // Far camera, ray well outside the throat: Φ ≈ π − θ (flat space).
    const th = 0.3;
    close(wh.skyAngle(th, 2000, 1), Math.PI - th, 1e-4, 'far camera');
  },
};
