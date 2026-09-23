import { assert, close } from '../assert.ts';
import * as h from '../../src/topics/holography/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'holography: Poincaré distance matches 2 artanh r, is Möbius invariant and obeys the triangle inequality': () => {
    for (const r of [0.1, 0.5, 0.9, 0.99]) {
      close(h.poincareDistance({ x: 0, y: 0 }, { x: r, y: 0 }), Math.log((1 + r) / (1 - r)), 1e-12, `d(0, ${r})`);
    }
    // Two points at radius tanh(ρ/2) on opposite sides are 2ρ apart.
    close(h.poincareDistance({ x: h.rhoToRadius(1.5), y: 0 }, { x: -h.rhoToRadius(1.5), y: 0 }), 3, 1e-12, 'opposite points');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pt = () => {
      const r = 0.97 * Math.sqrt(rnd());
      const a = 2 * Math.PI * rnd();
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    };
    let worst = Infinity;
    for (let i = 0; i < 2000; i++) {
      const a = pt();
      const b = pt();
      const c = pt();
      const slack = h.poincareDistance(a, b) + h.poincareDistance(b, c) - h.poincareDistance(a, c);
      worst = Math.min(worst, slack);
      assert(slack > -1e-9, `triangle inequality violated by ${slack}`);
      const m = { x: 0.3, y: -0.5 };
      close(h.poincareDistance(h.mobius(m, a), h.mobius(m, b)), h.poincareDistance(a, b), 1e-8, 'Möbius invariance');
    }
    return `min slack ${worst.toExponential(1)} over 2000 triangles`;
  },
  'holography: boundary geodesics meet the rim at right angles and end at φ ± α': () => {
    for (const [phi, alpha] of [[0, 0.3], [1.2, 1.0], [-2, 1.5], [0.5, 2.4]]) {
      const g = h.boundaryGeodesic(phi, alpha);
      // Orthogonal circles: |centre|² = 1 + r².
      close(g.cx * g.cx + g.cy * g.cy, 1 + g.r * g.r, 1e-9, 'orthogonality |c|² = 1 + r²');
      for (const s of [-1, 1]) {
        const e = h.boundaryGeodesicPoint(phi, alpha, s);
        close(Math.hypot(e.x, e.y), 1, 1e-12, 'endpoint on rim');
        const want = phi + s * alpha;
        close(Math.cos(Math.atan2(e.y, e.x) - want), 1, 1e-12, 'endpoint angle');
        // Meeting the rim at a right angle means the tangent at the endpoint points along the radius.
        const ds = 1e-6;
        const q = h.boundaryGeodesicPoint(phi, alpha, s - s * ds);
        const tx = q.x - e.x;
        const ty = q.y - e.y;
        const cosang = (tx * e.x + ty * e.y) / Math.hypot(tx, ty);
        assert(Math.abs(cosang) > 1 - 1e-6, `|cos| between tangent and radius = ${cosang}`);
      }
      // Sampled points lie on the circle.
      const mid = h.boundaryGeodesicPoint(phi, alpha, 0.37);
      if (!g.line) close(Math.hypot(mid.x - g.cx, mid.y - g.cy), g.r, 1e-9, 'point on circle');
    }
    // Tiling check: {7,3} polygon has interior angle 2π/3, so three meet at each vertex.
    const t = h.buildTiling(7, 3, 0.9);
    const v = t[0].verts;
    close(h.vertexAngle(v[6], v[0], v[1]), (2 * Math.PI) / 3, 1e-4, '{7,3} vertex angle');
    return `{7,3}: ${t.length} tiles to r = 0.9`;
  },
  'holography: RT geodesic length gives the Calabrese–Cardy log formula, S = (c/3) log((L/πε) sin(πℓ/L))': () => {
    // Exact length along the sampled arc equals the closed form cosh L = 1 + 2 sinh²ρc sin²α.
    const rc = 3;
    const r = h.rhoToRadius(rc);
    const a = 1.1;
    const p1 = { x: r * Math.cos(-a), y: r * Math.sin(-a) };
    const p2 = { x: r * Math.cos(a), y: r * Math.sin(a) };
    const pts = new Float64Array(4000);
    h.geodesicSegment(p1, p2, 2000, pts);
    close(h.polylineLength(pts, 2000), h.geodesicLength(a, rc), 1e-6, 'arc length vs closed form');
    // RT with Brown–Henneaux c = 3R/2G against the CFT formula, for a fine cutoff.
    const G = 0.01;
    const c = h.brownHenneaux(1, G);
    const Lc = 2 * Math.PI;
    const eps = 1e-6;
    const rhoC = h.rhoCutoff(Lc, eps);
    let worst = 0;
    for (const f of [0.01, 0.1, 0.25, 0.5, 0.8]) {
      const ell = f * Lc;
      const alpha = (Math.PI * ell) / Lc;
      const sRT = h.rtEntropy(h.geodesicLength(alpha, rhoC), G);
      const sCFT = h.cftEntropy(c, ell, Lc, eps);
      worst = Math.max(worst, Math.abs(sRT - sCFT) / sCFT);
    }
    assert(worst < 1e-9, `RT vs CFT rel. error ${worst}`);
    // Log growth: doubling a small interval adds (c/3) ln 2.
    const d = h.cftEntropy(c, 2e-3, Lc, eps) - h.cftEntropy(c, 1e-3, Lc, eps);
    close(d, (c / 3) * Math.LN2, 1e-4 * c, 'doubling adds (c/3) ln 2');
    // The half-circle geodesic passes through the centre.
    close(h.turningRho(Math.PI / 2), 0, 1e-12, 'half interval reaches the centre');
    return `max rel. error ${worst.toExponential(1)}, c = ${c}`;
  },
  'holography: Bekenstein–Hawking entropy scales as M² and is ~1.05e77 k_B for one solar mass': () => {
    const s1 = h.bhEntropy(h.M_SUN);
    const s2 = h.bhEntropy(2 * h.M_SUN);
    close(s2 / s1, 4, 1e-12, 'S(2M)/S(M)');
    close(h.bhEntropy(10 * h.M_SUN) / s1, 100, 1e-9, 'S(10M)/S(M)');
    // Closed form 4πGM²/(ħc).
    const closed = (4 * Math.PI * h.G_SI * h.M_SUN ** 2) / (h.HBAR * h.C_SI);
    close(s1 / closed, 1, 1e-12, 'A/4 vs 4πGM²/ħc');
    close(h.schwarzschildRadius(h.M_SUN), 2953, 1, 'r_s of the Sun');
    assert(s1 > 1.0e77 && s1 < 1.1e77, `S = ${s1}`);
    return `S☉ = ${s1.toExponential(3)} k_B = ${h.bhBits(h.M_SUN).toExponential(2)} bits`;
  },
};
