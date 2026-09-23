import { assert, close } from '../assert.ts';
import * as cy from '../../src/topics/calabi-yau/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'calabi-yau: Hanson patch points satisfy z1^n + z2^n = 1 to 1e-9': () => {
    let worst = 0;
    let count = 0;
    for (let n = 2; n <= 6; n++) {
      const g = cy.buildHansonGrid(n, 1.3, 16, 8);
      for (let v = 0; v < g.vertexCount; v++) {
        worst = Math.max(worst, cy.fermatResidual(n, g.z, v * 4));
        count++;
      }
      // Also some off-grid points, including the edges of the strip.
      for (const [x, y] of [[0, 0], [0, Math.PI / 2], [-1.3, 0.3], [0.77, 1.1], [1.5, Math.PI / 2]]) {
        for (let k1 = 0; k1 < n; k1++) for (let k2 = 0; k2 < n; k2++) worst = Math.max(worst, cy.fermatResidual(n, cy.hansonPoint(n, k1, k2, x, y)));
      }
    }
    assert(worst < 1e-9, `max residual ${worst}`);
    return `${count} points, max |z1^n + z2^n − 1| = ${worst.toExponential(1)}`;
  },
  'calabi-yau: patch count is n² and index buffers are sized per patch': () => {
    for (let n = 2; n <= 6; n++) {
      const g = cy.buildHansonGrid(n, 1.2, 10, 5);
      assert(g.patches === n * n, `n=${n}: ${g.patches} patches`);
      assert(g.index.length === n * n * g.indicesPerPatch, 'index length');
      assert(g.lineIndex.length === n * n * g.lineIndicesPerPatch, 'line index length');
      const ids = new Set(Array.from(g.patch));
      assert(ids.size === n * n, `n=${n}: ${ids.size} distinct patch ids`);
    }
  },
  'calabi-yau: Fermat genus g = (n−1)(n−2)/2 matches the Chern class computation in CP²': () => {
    close(cy.fermatGenus(3), 1, 0, 'n=3 genus');
    close(cy.fermatGenus(4), 3, 0, 'n=4 genus');
    close(cy.fermatGenus(2), 0, 0, 'n=2 genus');
    for (let n = 2; n <= 6; n++) close(cy.hypersurfaceEuler(2, n), cy.curveEuler(n), 0, `χ for n=${n}`);
    assert(cy.surfaceName(1) === 'torus', 'n=3 is a torus');
    return 'n=3 → 1, n=4 → 3, n=5 → 6';
  },
  'calabi-yau: quintic χ = −200 from c(X) = (1+H)^5/(1+5H), with c1 = 0 and h21 = 101': () => {
    const q = cy.chernData({ dims: [4], equations: [[5]] });
    assert(q.dim === 3, 'threefold');
    close(q.c1[0], 0, 0, 'c1');
    close(q.euler, -200, 0, 'χ');
    close(cy.ciComplexModuli(4, 5), 101, 0, 'h21 by counting coefficients');
    close(cy.eulerCY3(1, 101), -200, 0, '2(h11 − h21)');
    close(cy.eulerFromDiamond(cy.hodgeDiamond(1, 101)), -200, 0, 'Hodge diamond sum');
    close(cy.generations(q.euler), 100, 0, 'generations');
    return 'χ = −200, 100 generations';
  },
  'calabi-yau: every table entry agrees with its Chern class χ, and Tian–Yau gives 3 generations': () => {
    const notes: string[] = [];
    for (const m of cy.MANIFOLDS) {
      const chi = cy.eulerCY3(m.h11, m.h21);
      if (m.ambient) {
        const c = cy.chernData(m.ambient);
        assert(c.dim === 3, `${m.id} dim`);
        assert(c.c1.every((x) => x === 0), `${m.id} c1 ≠ 0`);
        close(c.euler, chi, 0, `${m.id} χ`);
        notes.push(`${m.short} ${c.euler}`);
      }
    }
    close(cy.ciComplexModuli(5, 3, 2), 73, 0, 'two cubics h21');
    const cover = cy.chernData(cy.manifoldById('ty-cover').ambient!);
    const ty = cy.manifoldById('tian-yau');
    close(cover.euler / ty.quotient!, cy.eulerCY3(ty.h11, ty.h21), 0, 'χ(TY) = χ(cover)/3');
    close(cy.eulerCY3(ty.h11, ty.h21), -6, 0, 'TY χ');
    close(cy.generations(-6), 3, 0, 'TY generations');
    return notes.join(', ');
  },
  'calabi-yau: mirror swap h11 ↔ h21 flips the sign of χ': () => {
    for (const m of cy.MANIFOLDS) {
      const w = cy.mirror(m);
      assert(w.h11 === m.h21 && w.h21 === m.h11, `${m.id} swap`);
      close(cy.eulerCY3(w.h11, w.h21), -cy.eulerCY3(m.h11, m.h21), 0, `${m.id} χ flip`);
      close(cy.generations(cy.eulerCY3(w.h11, w.h21)), cy.generations(cy.eulerCY3(m.h11, m.h21)), 0, 'generations unchanged');
    }
    const mq = cy.manifoldById('mirror-quintic');
    close(cy.eulerCY3(mq.h11, mq.h21), 200, 0, 'mirror quintic χ');
  },
};
