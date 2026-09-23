import { assert, close } from '../assert.ts';
import * as tw from '../../src/topics/twin-paradox/physics.ts';

type Suite = () => string | void;

const base: tw.TripParams = { mode: 'instant', beta: 0.8, D: 4, a: tw.G_LY, coast: true };

export const suites: Record<string, Suite> = {
  'twin paradox: instant turnaround gives τ = T/γ': () => {
    for (const beta of [0.3, 0.6, 0.8, 0.866, 0.99]) {
      const trip = tw.buildTrip({ ...base, beta, D: 7 });
      close(trip.T, (2 * 7) / beta, 1e-12, `T at β=${beta}`);
      close(trip.tau, trip.T / tw.gamma(beta), 1e-12, `τ at β=${beta}`);
    }
    const t = tw.buildTrip(base);
    return `β=0.8, D=4 ly: T=${t.T.toFixed(3)} yr, τ=${t.tau.toFixed(3)} yr`;
  },
  'twin paradox: hyperbolic proper time matches asinh(a t)/a': () => {
    const a = tw.G_LY;
    // Long burn: first phase of a no-coast trip to 100 ly.
    const trip = tw.buildTrip({ ...base, mode: 'accel', a, D: 100, coast: false });
    const ev = tw.wevent();
    let worst = 0;
    for (const t of [0.1, 0.5, 1, 2, 5, trip.segs[0].t1 * 0.999]) {
      tw.eventAtT(trip, t, ev);
      const exact = tw.hyperbolicTau(a, t);
      worst = Math.max(worst, Math.abs(ev.tau - exact));
      close(ev.x, (Math.sqrt(1 + (a * t) ** 2) - 1) / a, 1e-9, `x on hyperbola at t=${t}`);
    }
    assert(worst < 1e-10, `max τ error ${worst}`);
    // Independent route: integrate dτ/dt = 1/sqrt(1 + (a t)²) with Simpson, and invert via eventAtTau.
    const t1 = 3;
    const n = 2000;
    const h = t1 / n;
    let s = 1 + 1 / Math.sqrt(1 + (a * t1) ** 2);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) / Math.sqrt(1 + (a * i * h) ** 2);
    const numeric = (s * h) / 3;
    close(numeric, tw.hyperbolicTau(a, t1), 1e-10, 'Simpson vs asinh');
    tw.eventAtTau(trip, numeric, ev);
    const h1 = tw.hyperbolicEvent(a, numeric);
    close(ev.t, t1, 1e-9, 'eventAtTau inverts');
    close(ev.x, h1.x, 1e-12, 'x = (cosh aτ − 1)/a');
    return `max |τ − asinh(at)/a| = ${worst.toExponential(1)} yr`;
  },
  'twin paradox: pulses received equal the sender’s elapsed years': () => {
    const cases: tw.TripParams[] = [
      base,
      { ...base, beta: 0.6, D: 6.3 },
      { ...base, mode: 'accel', a: tw.G_LY, D: 4.37, coast: false },
      { ...base, mode: 'accel', a: 0.5 * tw.G_LY, beta: 0.9, D: 12, coast: true },
    ];
    for (const p of cases) {
      const trip = tw.buildTrip(p);
      const pt = tw.pulseTable(trip);
      const byTrav = tw.countUpTo(pt.earthRecvTau, trip.tau);
      const byEarth = tw.countUpTo(pt.travRecvT, trip.T);
      assert(byTrav === Math.floor(trip.T + 1e-9), `traveller got ${byTrav}, Earth aged ${trip.T}`);
      assert(byEarth === Math.floor(trip.tau + 1e-9), `Earth got ${byEarth}, traveller aged ${trip.tau}`);
    }
    // Doppler rates on the instant trip, β = 0.8: outbound 1/3, inbound 3.
    const trip = tw.buildTrip(base);
    const pt = tw.pulseTable(trip);
    const half = trip.tau / 2;
    const out = tw.countUpTo(pt.earthRecvTau, half - 1e-9);
    close(out / half, tw.dopplerRecede(0.8), 1 / half, 'outbound receive rate');
    close((pt.earthRecvTau.length - out) / half, tw.dopplerApproach(0.8), 1 / half, 'inbound receive rate');
    return `β=0.8: traveller hears ${out} Earth birthdays out, ${pt.earthRecvTau.length - out} back`;
  },
  'twin paradox: ∫sqrt(1 − v²)dt matches closed form in accel mode': () => {
    let worst = 0;
    for (const p of [
      { ...base, mode: 'accel' as const, a: tw.G_LY, D: 4.37, coast: false },
      { ...base, mode: 'accel' as const, a: 0.3 * tw.G_LY, beta: 0.95, D: 20, coast: true },
      { ...base, mode: 'accel' as const, a: 2 * tw.G_LY, beta: 0.7, D: 3, coast: true },
      { ...base, mode: 'accel' as const, a: tw.G_LY, D: 26700, coast: false },
    ]) {
      const trip = tw.buildTrip(p);
      const num = tw.integrateProperTime(trip);
      worst = Math.max(worst, Math.abs(num - trip.tau) / trip.tau);
    }
    assert(worst < 1e-8, `relative error ${worst}`);
    // 1 g, no coast: τ = (4/a) acosh(1 + aD/2), T = (4/a) sinh(acosh(1 + aD/2)).
    const a = tw.G_LY;
    const trip = tw.buildTrip({ ...base, mode: 'accel', a, D: 4.37, coast: false });
    const eta = Math.acosh(1 + (a * 4.37) / 2);
    close(trip.tau, (4 / a) * eta, 1e-12, 'closed-form τ');
    close(trip.T, (4 / a) * Math.sinh(eta), 1e-12, 'closed-form T');
    return `worst rel. error ${worst.toExponential(1)}; α Cen at 1 g: τ=${trip.tau.toFixed(2)}, T=${trip.T.toFixed(2)} yr`;
  },
  'twin paradox: turnaround sweep is 2βD for the instant trip, and the worldline is continuous': () => {
    const trip = tw.buildTrip(base);
    const s = tw.turnaroundSweep(trip);
    close(s.after - s.before, 2 * 0.8 * 4, 1e-12, 'swept Earth time');
    const acc = tw.buildTrip({ ...base, mode: 'accel', a: 0.4, beta: 0.9, D: 9, coast: true });
    for (let i = 1; i < acc.segs.length; i++) {
      const p = acc.segs[i - 1];
      const q = acc.segs[i];
      close(q.t0, p.t1, 1e-12, 'segment t join');
      close(q.eta0, p.eta1, 1e-12, 'segment η join');
    }
    const last = acc.segs[acc.segs.length - 1];
    close(last.x1, 0, 1e-9, 'returns to Earth');
    close(last.eta1, 0, 1e-12, 'returns at rest');
    const g = tw.gapSplit(acc);
    close(g.cruise + g.burn, acc.T - acc.tau, 1e-9, 'gap split sums');
  },
};
