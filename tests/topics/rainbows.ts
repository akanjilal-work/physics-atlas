import { assert, close } from '../assert.ts';
import * as rb from '../../src/topics/rainbows/physics.ts';

type Suite = () => string | void;
const DEG = rb.DEG;

export const suites: Record<string, Suite> = {
  'rainbows: water Sellmeier fit gives n_D = 1.3330 and the 400/700 nm values': () => {
    // Accepted n_D for water at 20 °C is 1.3330 (589.3 nm).
    close(rb.nWater(589.3), 1.333, 5e-4, 'n at 589.3 nm');
    close(rb.nWater(700), 1.331, 1e-3, 'n at 700 nm');
    close(rb.nWater(400), 1.343, 1e-3, 'n at 400 nm');
    return `n(400)=${rb.nWater(400).toFixed(4)} n(589)=${rb.nWater(589.3).toFixed(4)} n(700)=${rb.nWater(700).toFixed(4)}`;
  },
  "rainbows: Snell's law holds at entry and exit, and the trace matches D_k(b)": () => {
    const out = new Float64Array(16);
    const n = 1.333;
    let worst = 0;
    for (const k of [1, 2, 3]) {
      for (let j = 1; j < 50; j++) {
        const b = j / 50;
        const m = rb.traceRay(b, n, k, out);
        // Entry: first chord direction versus the normal at the entry point.
        const px = out[0], py = out[1];
        const qx = out[2], qy = out[3];
        const cl = Math.hypot(qx - px, qy - py);
        const tx = (qx - px) / cl, ty = (qy - py) / cl;
        const sinI = Math.abs(py); // incoming (1,0), normal (px,py)
        const sinR = Math.abs(px * ty - py * tx);
        worst = Math.max(worst, Math.abs(sinI - n * sinR));
        // Exit: last chord versus exit direction.
        const ax = out[2 * (m - 2)], ay = out[2 * (m - 2) + 1];
        const ex = out[2 * (m - 1)], ey = out[2 * (m - 1) + 1];
        const el = Math.hypot(ex - ax, ey - ay);
        const ux = (ex - ax) / el, uy = (ey - ay) / el;
        const ox = out[2 * m], oy = out[2 * m + 1];
        const sinIn = Math.abs(ex * uy - ey * ux);
        const sinOut = Math.abs(ex * oy - ey * ox);
        worst = Math.max(worst, Math.abs(sinOut - n * sinIn));
        // Total turn of the traced ray equals the formula (mod 360°).
        const D = rb.deviation(b, n, k);
        worst = Math.max(worst, Math.abs(ox - Math.cos(D)), Math.abs(oy + Math.sin(D)));
      }
    }
    assert(worst < 1e-12, `max residual ${worst}`);
    return `max residual ${worst.toExponential(1)}`;
  },
  "rainbows: numeric minimum of D(b) obeys Descartes' cos^2 i = (n^2-1)/3": () => {
    for (const n of [1.331, 1.333, 1.343]) {
      const num = rb.minDeviationNumeric(n, 1);
      const i = Math.asin(num.b);
      close(Math.cos(i) ** 2, (n * n - 1) / 3, 1e-6, `cos^2 i at n=${n}`);
      close(num.D, rb.descartes(n, 1).D, 1e-12, 'D_min');
    }
    return 'n = 1.331, 1.333, 1.343';
  },
  'rainbows: primary bow at 42.1 deg for n = 1.333 (D_min = 137.9 deg)': () => {
    const d = rb.descartes(1.333, 1);
    close(d.D / DEG, 137.92, 0.01, 'D_min');
    close(d.theta / DEG, 42.08, 0.01, 'bow radius');
    close(d.i / DEG, 59.41, 0.01, 'incidence');
    // Red outside violet, and both near the quoted 42° and 40.5°.
    const red = rb.descartes(rb.nWater(700), 1).theta / DEG;
    const vio = rb.descartes(rb.nWater(400), 1).theta / DEG;
    assert(red > vio, 'red must be outside violet');
    close(red, 42.4, 0.2, 'red bow');
    close(vio, 40.6, 0.2, 'violet bow');
    return `θ(1.333)=${(d.theta / DEG).toFixed(2)}°, red ${red.toFixed(2)}°, violet ${vio.toFixed(2)}°`;
  },
  'rainbows: secondary bow at 50.9 deg for n = 1.333 with reversed colours': () => {
    const n = 1.333;
    const d = rb.descartes(n, 2);
    const num = rb.minDeviationNumeric(n, 2);
    close(num.D, d.D, 1e-12, 'numeric vs closed form');
    close(Math.cos(d.i) ** 2, (n * n - 1) / 8, 1e-12, 'cos^2 i');
    close(d.D / DEG, 230.89, 0.01, 'D_min');
    close(d.theta / DEG, 50.89, 0.01, 'bow radius');
    const red = rb.descartes(rb.nWater(700), 2).theta / DEG;
    const vio = rb.descartes(rb.nWater(400), 2).theta / DEG;
    assert(red < vio, 'red must be inside violet in the secondary');
    const band = red - rb.descartes(rb.nWater(700), 1).theta / DEG;
    assert(band > 7 && band < 9, `dark band width ${band}`);
    return `θ₂=${(d.theta / DEG).toFixed(2)}°, red ${red.toFixed(2)}° < violet ${vio.toFixed(2)}°, band ${band.toFixed(1)}°`;
  },
  'rainbows: Fresnel at normal incidence and the Brewster zero': () => {
    const n = 1.333;
    const f0 = rb.fresnel(0, n);
    const r0 = ((n - 1) / (n + 1)) ** 2;
    close(f0.rs, r0, 1e-12, 'Rs(0)');
    close(f0.rp, r0, 1e-12, 'Rp(0)');
    const fb = rb.fresnel(Math.atan(n), n);
    assert(fb.rp < 1e-20, `Rp at Brewster ${fb.rp}`);
    const w = rb.pathWeight(rb.descartes(n, 1).b, n, 1);
    assert(w.pol > 0.85 && w.pol < 0.97, `polarization ${w.pol}`);
    return `R(0)=${r0.toFixed(4)}, primary polarization ${(w.pol * 100).toFixed(0)}%`;
  },
};
