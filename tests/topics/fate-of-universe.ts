import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/fate-of-universe/physics.ts';

type Suite = () => string | void;

const model = (o: Partial<P.Model>): P.Model => ({ H0: 67.4, Om: 0.315, Or: 0, Ode: 0.685, w0: -1, wa: 0, ...o });

export const suites: Record<string, Suite> = {
  'fate: Big Rip time matches Caldwell, Kamionkowski and Weinberg (2003)': () => {
    // Pure phantom energy (Ω_m = 0): the CKW formula is exact. RK4 must reproduce it.
    const pure = model({ H0: 70, Om: 0, Ode: 1, w0: -1.5 });
    const o = P.integrate(pure, { tMax: 1e4, aMax: 1e10 });
    const exact = P.ripTimeFormula(70, -1.5, 0);
    assert(o.end === 'rip', `end ${o.end}`);
    close(o.tEnd, exact, 1e-5 * exact, 'RK4 rip time, Ω_m = 0');
    // CKW's example: w = −3/2, H0 = 70, Ω_m = 0.3 gives "22 Gyr". The formula ignores matter after today,
    // so the true rip comes a little sooner. RK4 and the log-time table must agree with each other.
    const ckw = model({ H0: 70, Om: 0.3, Ode: 0.7, w0: -1.5 });
    const f = P.ripTimeFormula(70, -1.5, 0.3);
    const rk = P.integrate(ckw, { tMax: 1e4, aMax: 1e10 }).tEnd;
    const F = P.buildFuture(ckw);
    const tab = F.tEnd - F.t0;
    close(f, 22, 0.5, 'formula ≈ 22 Gyr');
    assert(rk < f && rk > 0.95 * f, `RK4 ${rk} should be slightly below the formula ${f}`);
    close(tab, rk, 1e-4 * rk, 'table vs RK4');
    return `Ω_m = 0: RK4 ${o.tEnd.toFixed(4)} vs formula ${exact.toFixed(4)} Gyr. Ω_m = 0.3: formula ${f.toFixed(2)}, RK4 ${rk.toFixed(3)}, table ${tab.toFixed(3)} Gyr`;
  },
  'fate: ΛCDM approaches de Sitter with H → H0 √Ω_Λ and never rips': () => {
    const m = model({ Or: P.omegaR(67.4), Ode: 0.685 - P.omegaR(67.4) });
    const o = P.integrate(m, { tMax: 400, aMax: 1e300 });
    const i = o.n - 1;
    const H = o.adot[i] / o.a[i] / P.h0Gyr(67.4);
    close(H, Math.sqrt(m.Ode), 1e-9, 'H/H0 at t0 + 400 Gyr');
    assert(o.end === 'time', `RK4 end ${o.end}`);
    assert(o.maxConstraint < 1e-8, `Friedmann drift ${o.maxConstraint}`);
    const F = P.buildFuture(m);
    assert(F.fate === 'freeze' && F.accelForever, `fate ${F.fate}`);
    close(P.EofN(m, F.N[F.n - 1]), Math.sqrt(m.Ode), 1e-12, 'table H/H0 at 10^111 yr');
    close(F.t0, 13.79, 0.02, 'age (astropy: 13.79 Gyr)');
    close(P.eventHorizonChi(F, P.rowAt(F, F.t0)), 16.7, 0.2, 'comoving event horizon ≈ 16.7 Gly');
    return `H/H0 → ${H.toFixed(10)}, √Ω_Λ = ${Math.sqrt(m.Ode).toFixed(10)}, drift ${o.maxConstraint.toExponential(1)}`;
  },
  'fate: closed matter universe (Ω_m = 3) recollapses at the cycloid time': () => {
    const Om = 3;
    const m = model({ Om, Ode: 0 });
    const tH = 1 / P.h0Gyr(67.4);
    const A = Om / (2 * (Om - 1));
    const B = (Om / (2 * (Om - 1) ** 1.5)) * tH;
    const th0 = Math.acos(1 - 1 / A);
    const t0 = B * (th0 - Math.sin(th0));
    const tCrunch = 2 * Math.PI * B;
    const o = P.integrate(m, { tMax: 1e3, aMin: 1e-4 });
    assert(o.end === 'crunch', `end ${o.end}`);
    close(o.tEnd, tCrunch - t0, 1e-5 * tCrunch, 'RK4 crunch time from now');
    close(o.tTurn, Math.PI * B - t0, 1e-4, 'turnaround');
    const F = P.buildFuture(m);
    assert(F.fate === 'crunch', `fate ${F.fate}`);
    close(F.t0, t0, 1e-6 * t0, 'age');
    close(F.tEnd, tCrunch, 1e-5 * tCrunch, 'table crunch time');
    close(Math.exp(F.Nturn), 2 * A, 1e-9, 'a_max = Ω_m/(Ω_m − 1)');
    return `crunch ${(tCrunch - t0).toFixed(4)} Gyr from now (cycloid), RK4 ${o.tEnd.toFixed(4)}, table ${(F.tEnd - F.t0).toFixed(4)}`;
  },
  'fate: the sign of ρ + 3p decides acceleration, flipping at w = −1/3 (1 + Ω_m/Ω_DE)': () => {
    let checked = 0;
    for (const Om of [0, 0.3]) {
      const Ode = 1 - Om;
      const wCrit = -(1 + Om / Ode) / 3;
      for (let w = -2; w <= 0.001; w += 0.05) {
        const m = model({ Om, Ode, w0: w });
        const q = P.decel(m, 1);
        close(q, (Om + (1 + 3 * w) * Ode) / 2, 1e-12, 'q0 = (ρ + 3p)/(2ρ_c)');
        assert(Math.sign(q) === Math.sign(P.rhoPlus3p(m)), 'sign of q follows ρ + 3p');
        if (Math.abs(w - wCrit) > 0.02) assert(q < 0 === w < wCrit, `w = ${w}: accelerating ${q < 0}`);
        // The integrated a(t) agrees: second difference of a over ±5 Myr.
        const f = P.integrate(m, { tMax: 0.005, eps: 1e-4 });
        const b = P.integrate(m, { tMax: 0.005, eps: 1e-4, backward: true });
        const h = 0.005;
        const af = P.aAtTime(f, h);
        const ab = P.aAtTime(b, -h);
        const add = (af - 2 + ab) / (h * h);
        const H = P.h0Gyr(67.4);
        close(-add / (H * H), q, 2e-3, `q from a(t), w = ${w.toFixed(2)}`);
        checked++;
      }
    }
    return `${checked} models: acceleration starts below w = −1/3 (Ω_m = 0) and below w = −0.476 (Ω_m = 0.3)`;
  },
  'fate: bound systems unbind on CKW schedule, black holes on Hawking schedule': () => {
    // CKW: for w = −3/2 the Milky Way (period ~250 Myr) goes ~60 Myr before the Rip, the Solar System ~3 months.
    const g = P.leadFactor(-1.5);
    close(g, Math.sqrt(7) / (3 * Math.PI), 1e-12, 'lead factor');
    close(250 * g, 60, 15, 'Milky Way lead (Myr)');
    close(12 * g, 3, 0.5, 'Solar System lead (months)');
    // Hawking (photon-only) lifetime: 2.1e67 yr for one solar mass, M³ scaling to ~1e100 yr at 1e11 M_sun.
    close(P.hawkingLifetimeYr(1) / 1e67, 2.1, 0.05, 'solar-mass lifetime / 1e67 yr');
    close(Math.log10(P.hawkingLifetimeYr(1e11)), 100.3, 0.05, 'log10 lifetime at 1e11 M_sun');
    return `Milky Way ${(250 * g).toFixed(0)} Myr, Solar System ${(12 * g).toFixed(1)} months before the Rip, t_H(1 M_sun) = ${P.hawkingLifetimeYr(1).toExponential(2)} yr`;
  },
  'fate: crunch is the Big Bang in reverse for the radiation bath': () => {
    const m = model({ Om: 1.5, Or: P.omegaR(67.4), Ode: -0.5 - P.omegaR(67.4) });
    const F = P.buildFuture(m);
    assert(F.fate === 'crunch', `fate ${F.fate}`);
    // Time left when T = 3000 K on the way in equals the age at recombination on the way out.
    const a = P.aAtTemp(3000);
    const tau = P.ageAt(m, a);
    close(Math.exp(P.NatTau(F, tau)), a, 1e-3 * a, 'a at time-left = age(a)');
    const o = P.integrate(m, { tMax: 1e3, aMin: 1e-3 });
    close(o.tEnd, F.tEnd - F.t0, 2e-4 * o.tEnd, 'RK4 vs table crunch time');
    return `crunch ${(F.tEnd - F.t0).toFixed(3)} Gyr from now; 3000 K reached ${(tau * 1e9 / 1e3).toFixed(0)} kyr before the end`;
  },
};
