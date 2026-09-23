import { assert, close } from '../assert.ts';
import * as gr from '../../src/topics/curved-spacetime/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'curved spacetime: circular orbit at r=10M with L²=Mr²/(r−3M) holds r within 1e-4 for 5 orbits': () => {
    const r0 = 10;
    const L = gr.lCircular(r0);
    const s = gr.newGR();
    const E = gr.initGR(s, r0, L);
    const h = 0.05;
    let dev = 0;
    while (s[2] < 5 * 2 * Math.PI) {
      gr.stepGR(s, L, E, h);
      dev = Math.max(dev, Math.abs(s[0] - r0));
    }
    assert(dev < 1e-4, `max |r − r0| = ${dev}`);
    return `max deviation ${dev.toExponential(1)} M`;
  },
  'curved spacetime: weak-field precession at a≈200M, e≈0.3 matches 6πM/(a(1−e²)) within 5%': () => {
    const ra = 260;
    const rp = 140;
    const L = gr.lForApsides(ra, rp);
    const { prec } = gr.measurePrecession(ra, L, 3, 1.0);
    const pred = gr.weakFieldPrecession(rp, ra);
    const rel = Math.abs(prec - pred) / pred;
    assert(rel < 0.05, `measured ${prec}, predicted ${pred}, rel ${rel}`);
    return `measured ${prec.toFixed(5)} rad, predicted ${pred.toFixed(5)} rad (${(rel * 100).toFixed(1)}%)`;
  },
  'curved spacetime: L below √12 M from r0=6M plunges': () => {
    const L = gr.L_ISCO * 0.99;
    const s = gr.newGR();
    const E = gr.initGR(s, 6, L);
    let tau = 0;
    while (s[0] > gr.R_PLUNGE && tau < 5000) {
      gr.stepGR(s, L, E, 0.01);
      tau += 0.01;
    }
    assert(s[0] <= gr.R_PLUNGE, `still at r=${s[0]} after τ=${tau}`);
    assert(gr.potentialExtrema(L) === null, 'expected no barrier for L < √12');
    return `plunged at τ=${tau.toFixed(0)} M`;
  },
  'curved spacetime: Newtonian orbit closes (precession ≈ 0)': () => {
    const r0 = 30;
    const L = 4.4;
    const s = gr.newN();
    gr.initN(s, r0);
    const tr = new gr.PeriapsisTracker();
    let first = NaN;
    while (tr.count < 4) {
      gr.stepN(s, L, 0.05);
      if (tr.update(s[0], s[1], s[2], 1) && tr.count === 1) first = tr.lastPhi;
    }
    const prec = (tr.lastPhi - first) / 3 - 2 * Math.PI;
    close(prec, 0, 1e-6, 'Newtonian precession');
    return `precession ${prec.toExponential(1)} rad`;
  },
  'curved spacetime: conserved energy E stays constant on an eccentric strong-field orbit': () => {
    const L = gr.lForApsides(30, 10);
    const s = gr.newGR();
    const E = gr.initGR(s, 30, L);
    let worst = 0;
    for (let i = 0; i < 200000; i++) {
      const r = s[0];
      gr.stepGR(s, L, E, Math.min(0.28, (2 * Math.PI * r * Math.sqrt(r)) / 1200));
      if (i % 100 === 0) worst = Math.max(worst, Math.abs(gr.energyOf(s, L) - E) / E);
    }
    assert(worst < 1e-9, `relative drift ${worst}`);
    return `drift ${worst.toExponential(1)} over ${(s[2] / (2 * Math.PI)).toFixed(0)} laps`;
  },
  'curved spacetime: ISCO sits at 6M with L=√12 M, and circular L matches the potential minimum': () => {
    const ext = gr.potentialExtrema(gr.L_ISCO + 1e-9);
    assert(ext !== null, 'expected extrema at L = √12');
    close(ext![0], 6, 1e-3, 'barrier radius');
    close(ext![1], 6, 1e-3, 'well radius');
    const [, rMin] = gr.potentialExtrema(gr.lCircular(10))!;
    close(rMin, 10, 1e-9, 'circular radius from L');
  },
};
