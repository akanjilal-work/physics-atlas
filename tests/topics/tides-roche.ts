import { assert, close } from '../assert.ts';
import * as P from '../../src/topics/tides-roche/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'tides: 2GMr/d³ matches the exact field difference, error shrinks like 1.5 r/d': () => {
    const GM = P.G * P.M_MOON;
    const notes: string[] = [];
    for (const q of [1e-2, 1e-3, 1e-4]) {
      const d = P.D_MOON;
      const r = q * d;
      const approx = P.tidalApprox(GM, r, d);
      const near = P.tidalExactNear(GM, r, d);
      const far = P.tidalExactFar(GM, r, d);
      const eNear = (near - approx) / approx;
      const eFar = (far - approx) / approx;
      // Series: near = approx (1 + 3q/2 + ...), far = approx (1 − 3q/2 + ...).
      close(eNear / q, 1.5, 0.05, `near-side error / (r/d) at r/d=${q}`);
      close(eFar / q, -1.5, 0.05, `far-side error / (r/d) at r/d=${q}`);
      notes.push(`r/d=${q}: ${eNear.toExponential(1)}`);
    }
    // Vector field: exact difference on the Earth-Moon axis agrees with the scalar version.
    const out = [0, 0, 0];
    P.tidalField(GM, P.D_MOON, 0, 0, -P.R_EARTH, 0, 0, out);
    close(out[0], -P.tidalExactFar(GM, P.R_EARTH, P.D_MOON), 1e-18, 'far-side vector');
    // Sideways points are squeezed inward by GMr/d³.
    P.tidalField(GM, P.D_MOON, 0, 0, 0, P.R_EARTH, 0, out);
    close(out[1] / (-(GM * P.R_EARTH) / P.D_MOON ** 3), 1, 1e-3, 'side squeeze');
    const a = P.tidalApprox(GM, P.R_EARTH, P.D_MOON);
    return `${notes.join(', ')}; lunar a_tide at Earth's surface ${a.toExponential(2)} m/s²`;
  },
  'tides: Sun-to-Moon tide ratio is about 0.46': () => {
    const k = P.sunMoonRatio();
    close(k, 0.46, 0.01, 'M_sun d_moon³ / (M_moon d_sun³)');
    const ks = P.tideScale(P.M_SUN, P.AU);
    const km = P.tideScale(P.M_MOON, P.D_MOON);
    close(ks / km, k, 1e-12, 'ratio of equilibrium tide scales');
    // Lunar equilibrium bulge ≈ 0.36 m, spring/neap range ratio (1+k)/(1−k) ≈ 2.7.
    close(km, 0.358, 0.005, 'lunar equilibrium tide scale (m)');
    const spring = P.equatorRange(P.D_MOON, 0);
    const neap = P.equatorRange(P.D_MOON, 90);
    close(spring / neap, (1 + k) / (1 - k), 0.01, 'spring/neap range ratio');
    return `ratio ${k.toFixed(4)}, spring ${(spring * 100).toFixed(0)} cm, neap ${(neap * 100).toFixed(0)} cm`;
  },
  'roche: Earth-Moon limits are about 18,400 km (fluid) and 9,500 km (rigid)': () => {
    const f = P.rocheFluid(P.R_EARTH, P.RHO_EARTH, P.RHO_MOON);
    const r = P.rocheRigid(P.R_EARTH, P.RHO_EARTH, P.RHO_MOON);
    // Hand values: 2.44 × 6371 km × (5514/3344)^(1/3) = 18,370 km. 1.26 × ... = 9,490 km.
    close(f / 1e3, 18370, 100, 'fluid limit (km)');
    close(r / 1e3, 9490, 60, 'rigid limit (km)');
    close(P.ROCHE_RIGID, 1.26, 0.001, 'rigid coefficient 2^(1/3)');
    assert(P.D_MOON > 20 * f, 'the Moon sits far outside');
    // Ice around Saturn lands near the outer edge of the main rings (A ring edge ≈ 2.27 R_S).
    const sat = P.rocheFluid(1, P.RHO_SATURN, 900);
    close(sat, 2.23, 0.02, 'Saturn, ice moon (R_S)');
    return `fluid ${(f / 1e3).toFixed(0)} km, rigid ${(r / 1e3).toFixed(0)} km, Saturn ice ${sat.toFixed(2)} R_S`;
  },
  'roche: particle moon stays bound outside the limit (2 seeds, 2 orbits at 1.2 d_R)': () => {
    const p = P.defaultMoonParams(300);
    const par = new Int32Array(p.n);
    const res: string[] = [];
    for (const seed of [1, 2]) {
      const ball = P.relaxedBall(p, seed);
      const sim = P.launchMoon(p, 'rubble', ball, 1.2 * P.DF_SIM, P.planetRadiusSim(1.31));
      const steps = Math.round((2 * 2 * Math.PI) / sim.nOrb / P.MOON_H);
      P.stepMoon(sim, steps);
      const c = P.largestClump(sim, par);
      assert(c > 0.97, `seed ${seed}: largest clump ${c}`);
      res.push(`seed ${seed}: ${(c * 100).toFixed(0)}%`);
    }
    return res.join(', ');
  },
  'roche: particle moon is torn apart well inside the limit (0.75 d_R, 2 orbits)': () => {
    const p = P.defaultMoonParams(300);
    const par = new Int32Array(p.n);
    const ball = P.relaxedBall(p, 1);
    const sim = P.launchMoon(p, 'rubble', ball, 0.75 * P.DF_SIM, P.planetRadiusSim(1.31));
    P.stepMoon(sim, Math.round((2 * 2 * Math.PI) / sim.nOrb / P.MOON_H));
    const c = P.largestClump(sim, par);
    assert(c < 0.5, `largest clump ${c}`);
    return `largest clump ${(c * 100).toFixed(0)}%`;
  },
  'roche: grains on a rigid synchronous moon lift off near 1.44 R(ρ_M/ρ_m)^⅓': () => {
    // Linear theory: lift-off where 3GMr/d³ = Gm/r², i.e. d = 3^(1/3) a (M/m)^(1/3) = 0.59 d_R.
    const p = P.defaultMoonParams(120);
    const ball = new Float64Array(0);
    const run = (f: number) => {
      const sim = P.launchMoon(p, 'rigid', ball, f * P.DF_SIM, P.planetRadiusSim(1));
      P.stepMoon(sim, Math.round((2 * 2 * Math.PI) / sim.nOrb / P.MOON_H));
      return sim.lost;
    };
    const inside = run(0.55);
    const outside = run(0.72);
    assert(outside === 0, `lost ${outside} grains at 0.72 d_R`);
    assert(inside > 20, `only ${inside} grains lost at 0.55 d_R`);
    return `0.72 d_R: ${outside} lost, 0.55 d_R: ${inside} lost (theory ${(P.ROCHE_RIGID_SYNC / P.ROCHE_FLUID).toFixed(2)} d_R)`;
  },
  'locking: angular momentum gives a 21.9 ± 0.4 h day 620 Myr ago (Williams 2000)': () => {
    close(P.solarDay(P.D_MOON) / 3600, 24, 0.01, 'today');
    const day = P.solarDay(P.moonDistanceAt(-620)) / 3600;
    close(day, 21.9, 0.4, 'solar day at 620 Ma');
    const perYear = P.SIDEREAL_YEAR / (day * 3600);
    close(perYear, 400, 7, 'solar days per year');
    // Mean recession since then, cm/yr.
    const rate = ((P.moonDistanceAt(0) - P.moonDistanceAt(-620)) / 620e6) * 100;
    close(rate, 2.17, 0.31, 'mean recession (cm/yr)');
    return `day ${day.toFixed(2)} h, ${perYear.toFixed(0)} days/yr, mean recession ${rate.toFixed(2)} cm/yr`;
  },
  'locking: spin toy settles into synchronous rotation': () => {
    const s: P.SpinState = { theta: 0, omega: 6, phi: 0 };
    const n = 1;
    for (let i = 0; i < 400000; i++) P.spinStep(s, n, 0.3, 0.05, 1e-3);
    close(s.omega / n, 1, 0.01, 'spin / orbit');
    const lag = Math.atan2(Math.sin(2 * (s.theta - s.phi)), Math.cos(2 * (s.theta - s.phi))) / 2;
    close(lag, 0, 0.05, 'long axis points at the planet');
    return `ω/n = ${(s.omega / n).toFixed(4)}`;
  },
};
