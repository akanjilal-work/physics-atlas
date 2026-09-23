import { assert, close } from '../assert.ts';
import * as st from '../../src/topics/vibrating-strings/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'strings: spectrum invariant under R -> 1/R with n <-> w (1e-12)': () => {
    const opts = { nMax: 6, wMax: 6, NMax: 3 };
    let worst = 0;
    let count = 0;
    for (const R of [0.2, 0.37, 0.8, 1, 1.7, 3.3, 5]) {
      const a = st.spectrum(R, opts).map((s) => s.M2);
      const b = st.spectrum(1 / R, opts).map((s) => s.M2);
      assert(a.length === b.length, `state count differs at R=${R}: ${a.length} vs ${b.length}`);
      for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
      // State by state: the dual state has the same mass.
      for (const s of st.spectrum(R, opts)) {
        const d = st.tDual(s, R);
        worst = Math.max(worst, Math.abs(st.massSquared(d.n, d.w, d.N, d.Nt, d.R) - s.M2));
        count++;
      }
    }
    assert(worst < 1e-12, `max mismatch ${worst}`);
    return `${count} states, max |ΔM²| ${worst.toExponential(1)}`;
  },
  'strings: level matching filters states (N - Ñ = n·w)': () => {
    const all = st.spectrum(1.3, { nMax: 3, wMax: 3, NMax: 3, matchOnly: false });
    const kept = st.spectrum(1.3, { nMax: 3, wMax: 3, NMax: 3 });
    assert(all.length === 7 * 7 * 16, `box size ${all.length}`);
    for (const s of kept) assert(s.N - s.Nt === s.n * s.w, `unmatched state kept ${JSON.stringify(s)}`);
    const expected = all.filter((s) => s.N - s.Nt === s.n * s.w).length;
    assert(kept.length === expected, `kept ${kept.length}, expected ${expected}`);
    assert(st.levelMatched(1, 1, 1, 0) && !st.levelMatched(1, 1, 0, 0) && st.levelMatched(2, -1, 0, 2), 'spot checks');
    // The ground state is the tachyon at M² = −4/α'.
    close(kept[0].M2, -4, 1e-12, 'tachyon');
    return `${kept.length} of ${all.length} states survive`;
  },
  'strings: extra massless states appear only at the self-dual radius': () => {
    const at1 = st.extraMassless(st.selfDualRadius());
    assert(at1.length === 8, `expected 8 extra massless states at R=1, got ${at1.length}`);
    assert(st.extraMassless(1.05).length === 0 && st.extraMassless(0.7).length === 0, 'extra states away from R=1');
    return `${at1.length} extra massless states at R = 1`;
  },
  'strings: KK spacing tends to 0 as R -> infinity': () => {
    let prev = Infinity;
    for (const R of [1, 10, 100, 1e4, 1e8]) {
      const tower = st.kkTower(R, 5);
      const gap = tower[1] - tower[0];
      close(gap, st.kkSpacing(R), 1e-15, 'tower gap');
      assert(gap < prev, 'spacing not decreasing');
      prev = gap;
    }
    assert(prev < 1e-7, `spacing at R=1e8 is ${prev}`);
    close(st.windingSpacing(3), 3, 1e-15, 'winding spacing');
    return `ΔM(R=1e8) = ${prev.toExponential(0)}`;
  },
  'strings: closed-string shape is periodic in σ with period 2π': () => {
    const modes: st.ClosedMode[] = [
      { n: 1, ampR: 0.3, ampL: 0.1, phiR: 0.2, phiL: 1.1, polR: 0.4, polL: 1.3 },
      { n: 4, ampR: 0.2, ampL: 0.25, phiR: -0.7, phiL: 0.5, polR: 1.5, polL: 0.1 },
    ];
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    let worst = 0;
    for (let i = 0; i < 50; i++) {
      const s = i * 0.137;
      const t = i * 0.311;
      st.closedPoint(s, t, modes, 2, a);
      st.closedPoint(s + 2 * Math.PI, t, modes, 2, b);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
    assert(worst < 1e-12, `mismatch ${worst}`);
    return `max gap ${worst.toExponential(1)}`;
  },
  'strings: mode frequency equals the harmonic number': () => {
    const d = [0, 0];
    const notes: string[] = [];
    for (let n = 1; n <= 6; n++) {
      assert(st.modeFrequency(n) === n, 'modeFrequency');
      const closed: st.ClosedMode[] = [{ n, ampR: 0.3, ampL: 0.3, phiR: 0, phiL: 0, polR: Math.PI / 2, polL: Math.PI / 2 }];
      const open: st.OpenMode[] = [{ n, amp: 0.3, phase: 0.3, pol: 0 }];
      // Count sign changes over T = 20π. A frequency ω gives 2·ω·T/(2π) = 20ω crossings.
      const T = 20 * Math.PI;
      const steps = 199999; // not a round number, so no sample lands exactly on a node
      let cClosed = 0;
      let cOpen = 0;
      let pc = NaN;
      let po = NaN;
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * T;
        st.closedDisplacement(0.3, t, closed, d);
        if (pc * d[1] < 0) cClosed++;
        pc = d[1];
        st.openDisplacement(0.4, t, open, 'fixed', d);
        if (po * d[0] < 0) cOpen++;
        po = d[0];
      }
      close(cClosed / 20, n, 0.05, `closed n=${n}`);
      close(cOpen / 20, n, 0.05, `open n=${n}`);
      notes.push(String(cClosed / 20));
    }
    return `measured ω = ${notes.join(', ')}`;
  },
  'strings: open string with fixed ends stays pinned, harmonic 1 is massless': () => {
    const modes: st.OpenMode[] = [{ n: 3, amp: 0.5, phase: 0, pol: 0.7 }];
    const p = { x: 0, y: 0, z: 0 };
    st.openPoint(0, 0.4, modes, 'fixed', 2, p);
    assert(Math.hypot(p.y, p.z) < 1e-12 && Math.abs(p.x + 2) < 1e-12, 'left end moved');
    st.openPoint(Math.PI, 0.4, modes, 'fixed', 2, p);
    assert(Math.hypot(p.y, p.z) < 1e-12 && Math.abs(p.x - 2) < 1e-12, 'right end moved');
    assert(st.harmonicMass2(1, true) === 0 && st.harmonicMass2(1, false) === 0, 'k=1 massless');
    close(st.massSquared(0, 0, 1, 1, 2.3), 0, 1e-15, 'graviton level');
  },
};
