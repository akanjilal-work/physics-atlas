import { assert, close } from '../assert.ts';
import * as s from '../../src/topics/shor-algorithm/physics.ts';

type Suite = () => string | void;

/** Carmichael function for N = p*q with distinct odd primes: lcm(p-1, q-1). */
const lcm = (a: number, b: number) => (a / s.gcd(a, b)) * b;

export const suites: Record<string, Suite> = {
  'shor: order finding matches known orders and divides Carmichael lambda(N)': () => {
    // Textbook values: ord_15(7) = 4, ord_21(2) = 6, ord_33(5) = 10, ord_35(2) = 12, ord_15(14) = 2, ord_21(4) = 3.
    const known: [number, number, number][] = [[7, 15, 4], [2, 15, 4], [4, 15, 2], [14, 15, 2], [2, 21, 6], [4, 21, 3], [5, 33, 10], [2, 35, 12], [2, 39, 12]];
    for (const [a, N, r] of known) assert(s.order(a, N) === r, `ord_${N}(${a}) = ${s.order(a, N)}, expected ${r}`);
    const semi: [number, number, number][] = [[15, 3, 5], [21, 3, 7], [33, 3, 11], [35, 5, 7], [39, 3, 13], [77, 7, 11], [143, 11, 13]];
    let count = 0;
    for (const [N, p, q] of semi) {
      const lam = lcm(p - 1, q - 1);
      let maxR = 0;
      for (const a of s.coprimeBases(N)) {
        const r = s.order(a, N);
        assert(r > 0 && s.modPow(a, r, N) === 1, `a^r != 1 for a=${a} N=${N}`);
        assert(lam % r === 0, `ord_${N}(${a}) = ${r} does not divide lambda = ${lam}`);
        for (let d = 1; d < r; d++) assert(s.modPow(a, d, N) !== 1, `smaller period ${d} for a=${a} N=${N}`);
        // the modexp sequence repeats with period r
        const seq = s.modexpSequence(a, N, 3 * r);
        for (let x = 0; x < 2 * r; x++) assert(seq[x] === seq[x + r], `sequence not periodic a=${a} N=${N}`);
        maxR = Math.max(maxR, r);
        count++;
      }
      assert(maxR === lam, `max order ${maxR} != lambda ${lam} for N=${N}`);
    }
    assert(s.order(3, 15) === 0, 'non-coprime base should have no order');
    return `${count} (a, N) pairs`;
  },
  'shor: factor extraction and its failure cases': () => {
    const f1 = s.factorFromOrder(7, 15, 4);
    assert(f1.kind === 'ok' && f1.half === 4 && f1.p === 3 && f1.q === 5, `15 via a=7: ${JSON.stringify(f1)}`);
    const f2 = s.factorFromOrder(2, 21, 6);
    assert(f2.kind === 'ok' && f2.half === 8 && f2.p === 7 && f2.q === 3, `21 via a=2: ${JSON.stringify(f2)}`);
    assert(s.factorFromOrder(14, 15, 2).kind === 'minus-one', '14 = -1 mod 15');
    assert(s.factorFromOrder(4, 21, 3).kind === 'odd', 'ord_21(4) = 3 is odd');
    assert(s.factorFromOrder(7, 15, 2).kind === 'not-a-period', '2 is not a period of 7 mod 15');
    assert(s.factorFromOrder(7, 15, 8).kind === 'trivial', '8 is a multiple of the order');
    // For N = pq (distinct odd primes) at least half of the coprime bases succeed.
    for (const N of [15, 21, 33, 35, 39, 77, 143]) {
      const bases = s.coprimeBases(N);
      let good = 0;
      for (const a of bases) {
        const f = s.factorFromOrder(a, N, s.order(a, N));
        if (f.kind === 'ok') {
          good++;
          assert(f.p * f.q === N && f.p > 1 && f.q > 1, `bad split of ${N}: ${f.p} x ${f.q}`);
        }
      }
      // bases here exclude a = 1, which always fails, so compare against (phi(N)) / 2 - 1.
      assert(good >= (bases.length + 1) / 2 - 1, `N=${N}: only ${good}/${bases.length + 1} bases succeed`);
    }
  },
  'shor: QFT matrix is unitary and the FFT matches it (n = 1..6)': () => {
    let worst = 0;
    for (let n = 1; n <= 6; n++) {
      const Q = 1 << n;
      const F = s.qftMatrix(n);
      for (let i = 0; i < Q; i++)
        for (let j = 0; j < Q; j++) {
          let sr = 0, si = 0;
          for (let k = 0; k < Q; k++) {
            // (F F^dagger)_{ij} = sum_k F_ik conj(F_jk)
            sr += F.re[i * Q + k] * F.re[j * Q + k] + F.im[i * Q + k] * F.im[j * Q + k];
            si += F.im[i * Q + k] * F.re[j * Q + k] - F.re[i * Q + k] * F.im[j * Q + k];
          }
          worst = Math.max(worst, Math.abs(sr - (i === j ? 1 : 0)), Math.abs(si));
        }
      const rnd = s.mulberry32(n);
      const re = new Float64Array(Q).map(() => rnd() - 0.5);
      const im = new Float64Array(Q).map(() => rnd() - 0.5);
      const r2 = re.slice(), i2 = im.slice();
      s.qft(r2, i2, n);
      for (let k = 0; k < Q; k++) {
        let sr = 0, si = 0;
        for (let x = 0; x < Q; x++) {
          sr += F.re[k * Q + x] * re[x] - F.im[k * Q + x] * im[x];
          si += F.re[k * Q + x] * im[x] + F.im[k * Q + x] * re[x];
        }
        close(r2[k], sr, 1e-12, `FFT re n=${n} k=${k}`);
        close(i2[k], si, 1e-12, `FFT im n=${n} k=${k}`);
      }
    }
    assert(worst < 1e-12, `|FF† - I| = ${worst}`);
    return `max |FF† − I| = ${worst.toExponential(1)}`;
  },
  'shor: fractional QFT path is unitary, F^0 = I and F^1 = QFT': () => {
    const n = 6, Q = 64;
    const rnd = s.mulberry32(3);
    const base = [0, 1, 2, 3].map(() => ({ re: new Float64Array(Q), im: new Float64Array(Q) }));
    for (let i = 0; i < Q; i++) { base[0].re[i] = rnd() - 0.5; base[0].im[i] = rnd() - 0.5; }
    const nrm = Math.sqrt(s.norm2(base[0].re, base[0].im, Q));
    for (let i = 0; i < Q; i++) { base[0].re[i] /= nrm; base[0].im[i] /= nrm; }
    for (let m = 1; m < 4; m++) { base[m].re.set(base[m - 1].re); base[m].im.set(base[m - 1].im); s.qft(base[m].re, base[m].im, n); }
    const cR = new Float64Array(4), cI = new Float64Array(4);
    const re = new Float64Array(Q), im = new Float64Array(Q);
    let worst = 0;
    for (const t of [0, 0.13, 0.37, 0.5, 0.81, 1]) {
      s.fracCoeffs(t, cR, cI);
      re.fill(0); im.fill(0);
      for (let m = 0; m < 4; m++)
        for (let i = 0; i < Q; i++) {
          re[i] += cR[m] * base[m].re[i] - cI[m] * base[m].im[i];
          im[i] += cR[m] * base[m].im[i] + cI[m] * base[m].re[i];
        }
      worst = Math.max(worst, Math.abs(s.norm2(re, im, Q) - 1));
      if (t === 0 || t === 1) {
        const tgt = base[t];
        for (let i = 0; i < Q; i++) { close(re[i], tgt.re[i], 1e-12, `t=${t} re`); close(im[i], tgt.im[i], 1e-12, `t=${t} im`); }
      }
    }
    assert(worst < 1e-12, `norm drift ${worst}`);
  },
  'shor: peak distribution sums to 1, exact peaks when r divides 2^n, matches statevector': () => {
    // r = 4, Q = 256: probability 1/4 at k = 0, 64, 128, 192 and zero elsewhere.
    const P = s.peakDistribution(8, 4);
    for (let k = 0; k < 256; k++) close(P[k], k % 64 === 0 ? 0.25 : 0, 1e-12, `P(${k})`);
    let worst = 0;
    for (const [n, r] of [[8, 4], [9, 6], [11, 10], [11, 12], [7, 5], [5, 3]]) {
      const Q = 1 << n;
      const D = s.peakDistribution(n, r);
      let sum = 0;
      for (let k = 0; k < Q; k++) sum += D[k];
      worst = Math.max(worst, Math.abs(sum - 1));
      // Statevector: average |QFT comb|^2 over the work outcome x0 with weight M(x0)/Q.
      const re = new Float64Array(Q), im = new Float64Array(Q), acc = new Float64Array(Q);
      for (let x0 = 0; x0 < r; x0++) {
        s.combState(n, r, x0, re, im);
        s.qft(re, im, n);
        const w = s.combCount(Q, r, x0) / Q;
        for (let k = 0; k < Q; k++) acc[k] += w * (re[k] * re[k] + im[k] * im[k]);
      }
      for (let k = 0; k < Q; k++) close(acc[k], D[k], 1e-12, `statevector vs formula n=${n} r=${r} k=${k}`);
      // Peaks sit at k = j Q / r: the nearest integers carry at least 4/pi^2 of the weight.
      let near = 0;
      for (let j = 0; j < r; j++) near += D[Math.round((j * Q) / r) % Q];
      assert(near >= 4 / Math.PI ** 2, `n=${n} r=${r}: weight near peaks ${near}`);
      if (Q % r === 0) close(near, 1, 1e-12, `exact peaks n=${n} r=${r}`);
      // and each bin at a peak beats both its neighbours
      for (let j = 1; j < r; j++) {
        const k = Math.round((j * Q) / r);
        assert(D[k] > D[k - 1] && D[k] > D[(k + 1) % Q], `peak ${k} not a local max for r=${r}`);
      }
    }
    assert(worst < 1e-12, `sum error ${worst}`);
    return `max |ΣP − 1| = ${worst.toExponential(1)}`;
  },
  'shor: continued fractions and convergents': () => {
    const t = s.continuedFraction(415, 93);
    assert(t.join(',') === '4,2,6,7', `415/93 = [${t}]`);
    const c = s.convergents(t).map((x) => `${x.p}/${x.q}`).join(' ');
    assert(c === '4/1 9/2 58/13 415/93', `convergents ${c}`);
    const pi = s.convergents(s.continuedFraction(3141592653, 1000000000)).map((x) => `${x.p}/${x.q}`);
    assert(pi.slice(0, 4).join(' ') === '3/1 22/7 333/106 355/113', `pi convergents ${pi.slice(0, 4)}`);
    // Nielsen & Chuang, factoring 15 with a = 7, t = 11 qubits: k = 1536 gives 3/4, so r = 4.
    const g = s.recoverOrder(1536, 2048, 7, 15);
    assert(g.ok && g.r === 4, `1536/2048 gave r = ${g.r}`);
    // k = 1024 gives 1/2: a divisor of r, correctly rejected.
    assert(!s.recoverOrder(1024, 2048, 7, 15).ok, '1/2 should fail for a = 7');
    // N = 21, a = 2, r = 6, Q = 512: peak at 512*5/6 = 426.67 -> k = 427 recovers 5/6.
    const h = s.recoverOrder(427, 512, 2, 21);
    assert(h.ok && h.r === 6 && h.chosen!.p === 5, `427/512 gave ${h.chosen?.p}/${h.chosen?.q}`);
    // Every rounded peak k = round(jQ/r) with gcd(j, r) = 1 recovers r when 2^n >= N^2.
    let tried = 0;
    for (const N of [15, 21, 33, 35, 39]) {
      const n = s.recommendedQubits(N);
      const Q = 1 << n;
      for (const a of s.coprimeBases(N)) {
        const r = s.order(a, N);
        for (let j = 1; j < r; j++) {
          if (s.gcd(j, r) !== 1) continue;
          const g2 = s.recoverOrder(Math.round((j * Q) / r), Q, a, N);
          assert(g2.ok && g2.r === r, `N=${N} a=${a} j=${j}: got ${g2.r}, want ${r}`);
          tried++;
        }
      }
    }
    return `${tried} peaks recovered`;
  },
  'shor: sampled shots follow the exact distribution (N=21, a=2, n=9, 4000 shots)': () => {
    const n = 9, Q = 512, r = 6;
    const P = s.peakDistribution(n, r);
    const rnd = s.mulberry32(11);
    const shots = 4000;
    let ok = 0;
    for (let i = 0; i < shots; i++) if (s.recoverOrder(s.sampleIndex(P, rnd()), Q, 2, 21).ok) ok++;
    const p = s.cfSuccessProbability(n, 2, 21, P);
    // At least the phi(6)/6 = 1/3 of peaks with gcd(j, 6) = 1, times the >= 4/pi^2 weight in the nearest bin.
    assert(p > (1 / 3) * (4 / Math.PI ** 2), `success probability ${p}`);
    const sigma = Math.sqrt((p * (1 - p)) / shots);
    close(ok / shots, p, 5 * sigma, 'CF success rate');
    return `rate ${(ok / shots).toFixed(3)} vs exact ${p.toFixed(3)}`;
  },
};
