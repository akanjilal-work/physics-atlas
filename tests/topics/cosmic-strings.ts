import { assert, close } from '../assert.ts';
import * as cs from '../../src/topics/cosmic-strings/physics.ts';

type Suite = () => string | void;
const v3 = (): cs.Vec3 => ({ x: 0, y: 0, z: 0 });
const dist = (a: cs.Vec3, b: cs.Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export const suites: Record<string, Suite> = {
  'cosmic strings: deficit Δ = 8πGμ, and the closed cone has circumference 2πr(1 − 4Gμ)': () => {
    const gmu = 1e-6;
    const d = cs.deficitAngle(gmu);
    close(d, 2.5132741e-5, 1e-11, 'Δ(Gμ=1e-6) in rad');
    close(d / cs.ARCSEC, 5.184, 0.001, 'Δ in arcsec');
    // Exaggerated tension so the cone is visibly closed. Measure a circle of paper radius r on the 3D cone.
    const G = 0.02;
    const D = cs.deficitAngle(G);
    const c = cs.foldFactor(D, 1);
    const r = 1.7;
    const hi = Math.PI - D / 2;
    const N = 20000;
    let len = 0;
    const a = v3();
    const b = v3();
    cs.coneEmbed(r, -hi, c, a);
    for (let i = 1; i <= N; i++) {
      cs.coneEmbed(r, -hi + (2 * hi * i) / N, c, b);
      len += dist(a, b);
      a.x = b.x; a.y = b.y; a.z = b.z;
    }
    close(len, 2 * Math.PI * r * (1 - 4 * G), 1e-6, 'circumference');
    // Closed: the two seam edges land on the same 3D point.
    cs.coneEmbed(r, hi, c, a);
    cs.coneEmbed(r, -hi, c, b);
    assert(dist(a, b) < 1e-12, `seam gap ${dist(a, b)}`);
    return `Δ = ${(d / cs.ARCSEC).toFixed(3)}″ for Gμ = 1e-6`;
  },
  'cosmic strings: folding the paper into a cone preserves all paper distances': () => {
    const D = 0.6;
    let worst = 0;
    const p = v3();
    const q = v3();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const s of [0, 0.3, 0.7, 1]) {
      const c = cs.foldFactor(D, s);
      // Local metric check: small steps in random directions keep their length.
      for (let i = 0; i < 200; i++) {
        const r = 0.2 + 3 * rnd();
        const phi = (rnd() * 2 - 1) * (Math.PI - D / 2) * 0.95;
        const ang = rnd() * 2 * Math.PI;
        const e = 1e-6;
        const x = r * Math.cos(phi);
        const y = r * Math.sin(phi);
        const x2 = x + e * Math.cos(ang);
        const y2 = y + e * Math.sin(ang);
        cs.coneEmbed(r, phi, c, p);
        cs.coneEmbed(Math.hypot(x2, y2), Math.atan2(y2, x2), c, q);
        worst = Math.max(worst, Math.abs(dist(p, q) / e - 1));
      }
      // Global check: a straight segment drawn on the paper has the same length on the cone.
      const ax = 2.2, ay = 0.3, bx = -1.1, by = 1.9;
      const N = 4000;
      let len = 0;
      cs.coneEmbed(Math.hypot(ax, ay), Math.atan2(ay, ax), c, p);
      for (let i = 1; i <= N; i++) {
        const x = ax + ((bx - ax) * i) / N;
        const y = ay + ((by - ay) * i) / N;
        cs.coneEmbed(Math.hypot(x, y), Math.atan2(y, x), c, q);
        len += dist(p, q);
        p.x = q.x; p.y = q.y; p.z = q.z;
      }
      close(len, Math.hypot(bx - ax, by - ay), 1e-5, `segment length at fold ${s}`);
    }
    assert(worst < 1e-5, `local stretch ${worst}`);
    return `max local stretch ${worst.toExponential(1)}`;
  },
  'cosmic strings: two images only inside the wedge |s| < 1, separation Δ·D_ls/D_s': () => {
    const rO = 2.2;
    const rS = 1.8;
    for (const D of [0.5, 1e-3, cs.deficitAngle(1e-7)]) {
      for (let s = -3; s <= 3.0001; s += 0.05) {
        if (Math.abs(Math.abs(s) - 1) < 1e-9) continue;
        const n = cs.images(D, rO, rS, cs.sourceAngle(D, s)).length;
        assert(n === (Math.abs(s) < 1 ? 2 : 1), `Δ=${D} s=${s.toFixed(2)}: ${n} images`);
      }
      // Source straight behind the string: exact separation, and the thin-deficit limit.
      const sep = cs.imageSeparation(D, rO, rS, cs.sourceAngle(D, 0));
      close(sep, cs.seamSeparation(D, rO, rS), 1e-12 + 1e-12 * sep, 'exact seam separation');
      if (D < 0.01) close(sep / (D * (rS / (rO + rS))), 1, 1e-6, 'small-Δ separation');
      // Separation is the same anywhere inside the band (for small Δ).
      if (D < 0.01) {
        const sep2 = cs.imageSeparation(D, rO, rS, cs.sourceAngle(D, 0.6));
        close(sep2 / sep, 1, 1e-3, 'separation independent of offset');
      }
    }
    return 'band and separation ok';
  },
  'cosmic strings: sky mapping matches the exact paper geometry for small Δ': () => {
    const D = 1e-5;
    const rO = 1, rS = 3;
    const f = rS / (rO + rS);
    const h = (D / 2) * f;
    const out = [0, 0];
    for (const s of [-1.8, -0.5, 0.2, 0.9, 2.5]) {
      const exact = cs.images(D, rO, rS, cs.sourceAngle(D, s)).map((i) => i.dir).sort((a, b) => b - a);
      const n = cs.skyImages(s * h, h, out);
      assert(n === exact.length, `s=${s}: ${n} vs ${exact.length}`);
      for (let i = 0; i < n; i++) close(out[i] / exact[i], 1, 1e-4, `image ${i} at s=${s}`);
    }
  },
  'cosmic strings: Kaiser–Stebbins step 8πGμγv': () => {
    close(cs.ksStep(1e-7, 0.6), 8 * Math.PI * 1e-7 * 1.25 * 0.6, 1e-18, 'γ=1.25 at v=0.6');
    close(cs.ksStep(1e-7, 0), 0, 0, 'static string');
    const muK = cs.ksStep(cs.GMU_CMB, 0.8) * cs.T_CMB * 1e6;
    return `ΔT = ${muK.toFixed(1)} μK at the CMB bound, v = 0.8c`;
  },
  'cosmic strings: Kibble–Turok loop has |a′| = |b′| = 1 and period L/2': () => {
    const p: cs.LoopParams = { L: 10, alpha: 0.37, phi: 1.1 };
    const a = v3(), b = v3(), x1 = v3(), x2 = v3(), a2 = v3();
    let worst = 0;
    let worstFD = 0;
    for (let i = 0; i < 500; i++) {
      const u = (i / 500) * p.L * 1.3 - 2;
      cs.aPrime(u, p, a);
      cs.bPrime(u, p, b);
      worst = Math.max(worst, Math.abs(Math.hypot(a.x, a.y, a.z) - 1), Math.abs(Math.hypot(b.x, b.y, b.z) - 1));
      // a′ really is the derivative of a
      const e = 1e-5;
      cs.aPos(u + e, p, x1);
      cs.aPos(u - e, p, x2);
      worstFD = Math.max(worstFD, Math.abs((x1.x - x2.x) / (2 * e) - a.x), Math.abs((x1.z - x2.z) / (2 * e) - a.z));
      cs.bPos(u + e, p, x1);
      cs.bPos(u - e, p, x2);
      cs.bPrime(u, p, a2);
      worstFD = Math.max(worstFD, Math.abs((x1.y - x2.y) / (2 * e) - a2.y));
    }
    assert(worst < 1e-12, `|a′|, |b′| deviate by ${worst}`);
    assert(worstFD < 1e-8, `derivative mismatch ${worstFD}`);
    // Period: x(σ + L/2, t + L/2) = x(σ, t), and x(σ, t + L) = x(σ, t).
    let per = 0;
    let notHalf = 0;
    for (let i = 0; i < 100; i++) {
      const sg = (i / 100) * p.L;
      const t = 0.37 * i;
      cs.loopPoint(sg, t, p, x1);
      cs.loopPoint(sg + p.L / 2, t + p.L / 2, p, x2);
      per = Math.max(per, dist(x1, x2));
      cs.loopPoint(sg, t + p.L / 4, p, x2);
      notHalf = Math.max(notHalf, dist(x1, x2));
    }
    assert(per < 1e-12, `period mismatch ${per}`);
    assert(notHalf > 0.1, 'loop should move within a period');
    return `unit-speed error ${worst.toExponential(0)}`;
  },
  'cosmic strings: every loop has a cusp where the string reaches light speed': () => {
    for (const [alpha, phi] of [[0.5, Math.PI / 2], [0.2, 0.7], [0.8, 2.0]]) {
      const p: cs.LoopParams = { L: 2 * Math.PI, alpha, phi };
      const cusps = cs.findCusps(p);
      assert(cusps.length >= 1, `no cusp for α=${alpha}, φ=${phi}`);
      const v = v3();
      for (const c of cusps) {
        cs.loopVelocity(c.sigma, c.t, p, v);
        close(Math.hypot(v.x, v.y, v.z), 1, 1e-9, 'cusp speed');
      }
    }
    return 'cusps found and |ẋ| = 1 there';
  },
};
