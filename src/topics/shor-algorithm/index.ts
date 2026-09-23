import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css, type SliderSpec } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  cfSuccessProbability, combCount, combState, coprimeBases, factorFromOrder, fracCoeffs, gcd, MAX_QUBITS, MIN_QUBITS,
  modPow, N_OPTIONS, order, peakDistribution, qft, recommendedQubits, recoverOrder, sampleIndex,
  type FactorResult, type OrderGuess,
} from './physics.ts';

const QMAX = 1 << MAX_QUBITS;
const HS = 2.1; // scene height of amplitude 1/sqrt(r), the ideal peak
const CAP = 1.45 * HS;
const FOOT = 7.2; // width of the bar city
const MAX_MARKERS = 400;
const STEPS = ['Superpose', 'Modexp', 'Measure work', 'QFT', 'Measure', 'Continued fraction'] as const;
const DUR = [0.8, 1.0, 0.9, 2.6, 0.5, 0.4];
const DEFAULT_A: Record<number, number> = { 15: 7, 21: 2, 33: 5, 35: 2, 39: 2 };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (v: number) => String(v).split('').map((c) => SUP[Number(c)]).join('');

type AnimKind = 'lin' | 'sweep' | 'frac' | 'flash';

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 3.9, 9.4], target: [0, 1.0, 0.3], fov: 40 });
  const { scene } = stage;

  // --- Configuration and state
  let N = 15;
  let bases = coprimeBases(N);
  let a = DEFAULT_A[N];
  let n = recommendedQubits(N);
  let nRec = n;
  let Q = 1 << n;
  let r = order(a, N);
  let classical: FactorResult = factorFromOrder(a, N, r);
  const dist = new Float64Array(QMAX);
  let pSucc = 0;
  let peakW = 0;

  let stepDone = 0; // number of completed steps, 0..6
  let x0 = -1;
  let k = -1;
  let guess: OrderGuess | null = null;
  let result: FactorResult | null = null;
  let factored = false;
  let cfOk = false;
  let touched = false;
  let failN = 0;
  let failA = 0;
  let failHandled = false;
  let shots = 0;
  let shotHits = 0;
  let status = '';
  const queue: number[] = [];
  let anim: { kind: AnimKind; step: number; u: number; dur: number } | null = null;

  // Statevector and display buffers
  const re = new Float64Array(QMAX);
  const im = new Float64Array(QMAX);
  const fRe = [0, 1, 2, 3].map(() => new Float64Array(QMAX));
  const fIm = [0, 1, 2, 3].map(() => new Float64Array(QMAX));
  const cR = new Float64Array(4);
  const cI = new Float64Array(4);
  const mag = new Float64Array(QMAX);
  const ph = new Float64Array(QMAX);
  const magFrom = new Float64Array(QMAX);
  const magTo = new Float64Array(QMAX);
  const hitCount = new Uint16Array(QMAX);
  let colourMode: 'phase' | 'residue' = 'phase';
  let sweepU = 1;
  let barsDirty = true;
  let uiDirty = true;
  let normErr = 0;

  // --- Scene furniture
  let grid = makeGrid(8, 16);
  scene.add(grid);
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const barMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.12 });
  const bars = new THREE.InstancedMesh(barGeo, barMat, QMAX);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < QMAX; i++) bars.setColorAt(i, white);
  scene.add(bars);

  // Amber floor tiles at the predicted peak positions j·2ⁿ/r.
  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.02, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.55 }),
    16,
  );
  tiles.count = 0;
  scene.add(tiles);

  // Green markers stacked on bars hit by Measure ×20.
  const markers = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: PALETTE.green, emissive: PALETTE.green, emissiveIntensity: 0.35 }),
    MAX_MARKERS,
  );
  markers.count = 0;
  scene.add(markers);

  // Scale bar on the right: tick at 1/√r.
  const scaleGeo = new THREE.BufferGeometry();
  const scalePos = new Float32Array(12);
  scaleGeo.setAttribute('position', new THREE.BufferAttribute(scalePos, 3));
  const scaleLine = new THREE.LineSegments(scaleGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  scaleLine.frustumCulled = false;
  scene.add(scaleLine);
  const tickLabel = stage.label('1/√r', [0, 0, 0], 'muted');
  const firstLabel = stage.label('|0⟩', [0, 0, 0], 'muted');
  const lastLabel = stage.label('', [0, 0, 0], 'muted');
  const axisLabel = stage.label('', [0, 0, 0], 'muted');

  const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  highlight.visible = false;
  scene.add(highlight);
  const hlLabel = stage.label('', [0, 0, 0], 'big');
  hlLabel.element.style.color = css(PALETTE.green);
  hlLabel.visible = false;

  // --- Layout
  let cols = 32;
  let rows = 8;
  let pitch = 0.2;
  const cellX = (i: number) => ((i % cols) - (cols - 1) / 2) * pitch;
  const cellZ = (i: number) => (Math.floor(i / cols) - (rows - 1) / 2) * pitch;
  const heightOf = (m: number) => Math.min(CAP, (HS * m) * Math.sqrt(r));

  function layout(): void {
    cols = Math.min(Q, 1 << (Math.ceil(n / 2) + 1));
    rows = Q / cols;
    pitch = Math.min(0.55, FOOT / cols);
    const w = cols * pitch;
    const d = rows * pitch;
    scene.remove(grid);
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
    grid = makeGrid(w + 0.6, 24);
    grid.scale.z = (d + 0.6) / (w + 0.6);
    scene.add(grid);
    const x0s = -w / 2 - 0.3;
    const z0s = -d / 2;
    const v = [x0s, 0, z0s, x0s, HS, z0s, x0s - 0.12, HS, z0s, x0s + 0.12, HS, z0s];
    for (let i = 0; i < 12; i++) scalePos[i] = v[i];
    scaleGeo.attributes.position.needsUpdate = true;
    tickLabel.position.set(x0s - 0.35, HS, z0s);
    firstLabel.position.set(cellX(0), 0, cellZ(0) - pitch - 0.1);
    lastLabel.position.set(cellX(Q - 1), 0, cellZ(Q - 1) + pitch + 0.15);
    lastLabel.element.textContent = `|${Q - 1}⟩`;
    axisLabel.position.set(0, 0, d / 2 + 0.55);
    bars.count = Q;
  }

  function placeTiles(show: boolean): void {
    if (!show) { tiles.count = 0; return; }
    const s = pitch * 0.96;
    const cnt = Math.min(r, 16);
    for (let j = 0; j < cnt; j++) {
      const kk = Math.round((j * Q) / r) % Q;
      m4.compose(tp.set(cellX(kk), 0.01, cellZ(kk)), qI, sc.set(s, 1, s));
      tiles.setMatrixAt(j, m4);
    }
    tiles.count = cnt;
    tiles.instanceMatrix.needsUpdate = true;
  }

  // --- Colours: hue wheel shared by phase and by residue class
  const classHue = new Float64Array(64);
  const classCss: string[] = [];
  function setClassColours(): void {
    classCss.length = 0;
    for (let c = 0; c < r; c++) {
      classHue[c] = (0.52 + c / r) % 1;
      classCss.push(`hsl(${Math.round(classHue[c] * 360)}, 75%, 62%)`);
    }
  }
  const tmpC = new THREE.Color();
  const TWO_PI = 2 * Math.PI;

  // --- Drawing the bars
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const tp = new THREE.Vector3();
  const sc = new THREE.Vector3();

  function drawBars(): void {
    const bw = pitch * 0.7;
    const sweepK = sweepU * Q;
    for (let i = 0; i < Q; i++) {
      const h = Math.max(0.004, heightOf(mag[i]));
      m4.compose(tp.set(cellX(i), h / 2, cellZ(i)), qI, sc.set(bw, h, bw));
      bars.setMatrixAt(i, m4);
      let hue: number;
      if (colourMode === 'residue' && i < sweepK) hue = classHue[i % r];
      else hue = (((0.52 + ph[i] / TWO_PI) % 1) + 1) % 1;
      tmpC.setHSL(hue, 0.72, 0.56);
      bars.setColorAt(i, tmpC);
    }
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    if (highlight.visible && k >= 0) {
      const h = Math.max(0.05, heightOf(mag[k])) + 0.08;
      highlight.position.set(cellX(k), h / 2, cellZ(k));
      highlight.scale.set(bw + 0.08, h, bw + 0.08);
      hlLabel.position.set(cellX(k), h + 0.3, cellZ(k));
    }
    drawMarkers();
  }

  function drawMarkers(): void {
    let j = 0;
    const s = Math.min(0.16, Math.max(0.07, pitch * 0.8));
    for (let i = 0; i < Q && j < MAX_MARKERS; i++) {
      const c = hitCount[i];
      if (!c) continue;
      const base = heightOf(mag[i]) + s * 0.9;
      for (let q = 0; q < c && j < MAX_MARKERS; q++) {
        m4.compose(tp.set(cellX(i), base + q * s * 1.05, cellZ(i)), qI, sc.set(s, s, s));
        markers.setMatrixAt(j++, m4);
      }
    }
    markers.count = j;
    markers.instanceMatrix.needsUpdate = true;
  }

  // --- Overlays: legend (top left), clock (top right), pipeline cards (bottom)
  const box = 'background:rgba(7,10,18,0.72);border-radius:10px;border:1px solid #243049;';
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  legend.style.cssText = `position:absolute;left:10px;top:10px;z-index:2;pointer-events:none;max-width:250px;${box}padding:8px 10px;font:11px/1.45 'JetBrains Mono',monospace;color:#b8c3d9`;
  viewport.appendChild(legend);
  let legendHtml = '';

  const clock = document.createElement('canvas');
  clock.className = 'stage-overlay';
  clock.width = 360;
  clock.height = 380;
  clock.style.cssText = `position:absolute;right:10px;top:10px;width:180px;height:190px;z-index:2;pointer-events:none;${box}`;
  viewport.appendChild(clock);
  const cctx = clock.getContext('2d')!;

  const cards = document.createElement('div');
  cards.className = 'stage-overlay';
  cards.style.cssText = 'position:absolute;left:10px;right:10px;bottom:34px;z-index:2;pointer-events:none;display:flex;gap:8px;';
  viewport.appendChild(cards);
  const cardEls = [0, 1, 2].map(() => {
    const c = document.createElement('div');
    c.style.cssText = `flex:1 1 0;min-width:0;${box}padding:6px 9px;font:11px/1.4 'JetBrains Mono',monospace;color:#b8c3d9;transition:opacity .3s`;
    cards.appendChild(c);
    return c;
  });
  const cardHtml = ['', '', ''];

  // Clock state: the hand steps x = 0, 1, 2, ... around the orbit of a^x mod N.
  let clockX = 0;
  let clockT = 0;
  let clockU = 1;
  let clockPrev = 1;
  let clockDirty = true;

  function clockXY(v: number, R: number, cx: number, cy: number, out: Float64Array): void {
    const ang = -Math.PI / 2 + (TWO_PI * v) / N;
    out[0] = cx + R * Math.cos(ang);
    out[1] = cy + R * Math.sin(ang);
  }
  const p0 = new Float64Array(2);
  const p1 = new Float64Array(2);

  function drawClock(): void {
    const c = cctx;
    const W = clock.width;
    const H = clock.height;
    const cx = W / 2;
    const cy = H / 2 + 6;
    const R = W * 0.33;
    c.clearRect(0, 0, W, H);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText(`${a}ˣ mod ${N}`, 16, 32);
    c.fillStyle = css(PALETTE.amber);
    const rt = `r = ${r}`;
    c.fillText(rt, W - 16 - c.measureText(rt).width, 32);
    // dial
    c.strokeStyle = '#2c3852';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, R, 0, TWO_PI);
    c.stroke();
    c.fillStyle = '#3a4660';
    for (let v = 0; v < N; v++) {
      clockXY(v, R, cx, cy, p0);
      c.beginPath();
      c.arc(p0[0], p0[1], 3, 0, TWO_PI);
      c.fill();
    }
    // orbit polygon
    c.lineWidth = 2;
    let v = 1;
    for (let x = 0; x < r; x++) {
      const nv = (v * a) % N;
      clockXY(v, R, cx, cy, p0);
      clockXY(nv, R, cx, cy, p1);
      c.strokeStyle = classCss[x];
      c.globalAlpha = 0.45;
      c.beginPath();
      c.moveTo(p0[0], p0[1]);
      c.lineTo(p1[0], p1[1]);
      c.stroke();
      c.globalAlpha = 1;
      v = nv;
    }
    // orbit points with labels
    c.font = '18px JetBrains Mono, monospace';
    v = 1;
    for (let x = 0; x < r; x++) {
      clockXY(v, R, cx, cy, p0);
      c.fillStyle = classCss[x];
      c.beginPath();
      c.arc(p0[0], p0[1], 8, 0, TWO_PI);
      c.fill();
      clockXY(v, R + 26, cx, cy, p1);
      const s = String(v);
      c.fillText(s, p1[0] - c.measureText(s).width / 2, p1[1] + 6);
      v = (v * a) % N;
    }
    // hand, eased between the previous and current value
    const cur = modPow(a, clockX, N);
    const e = clockU < 0.5 ? 2 * clockU * clockU : 1 - (-2 * clockU + 2) ** 2 / 2;
    clockXY(clockPrev, R - 14, cx, cy, p0);
    clockXY(cur, R - 14, cx, cy, p1);
    const hx = p0[0] + (p1[0] - p0[0]) * e;
    const hy = p0[1] + (p1[1] - p0[1]) * e;
    c.strokeStyle = '#dfe6f3';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(hx, hy);
    c.stroke();
    c.fillStyle = '#dfe6f3';
    c.beginPath();
    c.arc(cx, cy, 6, 0, TWO_PI);
    c.fill();
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = classCss[clockX % r];
    const txt = `x=${clockX}: ${a}${sup(clockX)} ≡ ${cur}`;
    c.fillText(txt, (W - c.measureText(txt).width) / 2, H - 16);
  }

  // --- Legend and cards
  function updateLegend(): void {
    const residue = colourMode === 'residue';
    const key = residue
      ? `<div>colour = value of ${a}ˣ mod ${N} (see clock)</div>`
      : `<div>colour = phase of the amplitude</div>`;
    const html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">${status}</div>
${key}
<div style="color:#8391ab">Bar height = |amplitude| of |x⟩ in the counting register (2ⁿ = ${Q}).</div>
${stepDone >= 4 ? `<div><span style="color:${css(PALETTE.amber)}">■</span> predicted peaks j·2ⁿ/r</div>` : ''}
${shots ? `<div><span style="color:${css(PALETTE.green)}">◆</span> ${shots} shots: CF found r in ${shotHits}</div>` : ''}`;
    if (html !== legendHtml) { legend.innerHTML = html; legendHtml = html; }
  }

  const dim = (on: boolean) => (on ? '1' : '0.7');
  const head = (t: string) => `<div style="color:#8391ab;margin-bottom:2px">${t}</div>`;
  const big = (t: string, col = '#dfe6f3') => `<div style="color:${col};font:600 14px/1.3 'JetBrains Mono',monospace">${t}</div>`;

  function renderCards(): void {
    const html = ['', '', ''];
    if (k >= 0) html[0] = head('① Measure counting register') + big(`k = ${k}`) + `<div>k/2ⁿ = ${k}/${Q} = ${(k / Q).toFixed(4)}</div>`;
    else html[0] = head('① Measure counting register') + '<div>Run to the QFT, then measure.</div>';
    if (guess) {
      const t = guess.terms.length > 7 ? `${guess.terms.slice(0, 7).join(', ')}, …` : guess.terms.join(', ');
      const cv = guess.convs.filter((c) => c.q < N).map((c) => `${c.p}/${c.q}`).slice(-4).join(', ');
      const res = guess.ok
        ? big(`r = ${guess.r} ✓`, css(PALETTE.green)) + `<div>${a}${sup(guess.r)} ≡ 1 (mod ${N})</div>`
        : big('no period ✗', css(PALETTE.red)) + `<div>${guess.reason}</div>`;
      html[1] = head('② Continued fraction') + `<div>[${t.replace(', ', '; ')}]</div><div>convergents: ${cv || '0/1'}</div>` + res;
    } else html[1] = head('② Continued fraction') + '<div>Turns k/2ⁿ into j/r.</div>';
    if (result) {
      let body = '';
      if (result.kind === 'ok') {
        body = `<div>${a}${sup(guess!.r / 2)} ≡ ${result.half} (mod ${N})</div><div>gcd(${result.half - 1}, ${N}) = ${result.p}, gcd(${result.half + 1}, ${N}) = ${result.q}</div>` + big(`${N} = ${result.p} × ${result.q}`, css(PALETTE.green));
      } else if (result.kind === 'odd') {
        body = big(`r = ${guess!.r} is odd ✗`, css(PALETTE.red)) + '<div>No a^(r/2). Pick another base a.</div>';
      } else if (result.kind === 'minus-one') {
        body = big(`${a}${sup(guess!.r / 2)} ≡ −1 ✗`, css(PALETTE.red)) + `<div>gcd gives only 1 and ${N}. Pick another a.</div>`;
      } else {
        body = big('trivial gcd ✗', css(PALETTE.red)) + '<div>Run again.</div>';
      }
      html[2] = head('③ gcd(a^(r/2) ± 1, N)') + body;
    } else if (guess && !guess.ok) {
      html[2] = head('③ gcd(a^(r/2) ± 1, N)') + '<div>Needs a period. Run the circuit again.</div>';
    } else html[2] = head('③ gcd(a^(r/2) ± 1, N)') + '<div>Classical: factors from r.</div>';
    for (let i = 0; i < 3; i++) {
      if (html[i] !== cardHtml[i]) { cardEls[i].innerHTML = html[i]; cardHtml[i] = html[i]; }
    }
    cardEls[0].style.opacity = dim(k >= 0);
    cardEls[1].style.opacity = dim(guess !== null);
    cardEls[2].style.opacity = dim(result !== null);
  }

  // --- Steps
  const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

  function startStep(s: number): void {
    const busy = queue.length > 0;
    const dur = DUR[s] * (busy && s !== 3 ? 0.8 : 1);
    if (s === 0) {
      for (let i = 0; i < Q; i++) { re[i] = 1 / Math.sqrt(Q); im[i] = 0; }
      magFrom.set(mag.subarray(0, Q));
      magTo.fill(1 / Math.sqrt(Q), 0, Q);
      ph.fill(0, 0, Q);
      colourMode = 'phase';
      status = `① H on all ${n} counting qubits: ${Q} equal amplitudes`;
      anim = { kind: 'lin', step: s, u: 0, dur };
    } else if (s === 1) {
      colourMode = 'residue';
      sweepU = 0;
      status = `② Modexp: |x⟩|1⟩ → |x⟩|${a}ˣ mod ${N}⟩. Colours repeat every r = ${r}`;
      anim = { kind: 'sweep', step: s, u: 0, dur };
      clockX = 0; clockPrev = 1; clockU = 1; clockT = 0;
    } else if (s === 2) {
      // Work register outcome a^x0 occurs with probability M(x0)/Q.
      const u = Math.random();
      let c = 0;
      x0 = r - 1;
      for (let j = 0; j < r; j++) { c += combCount(Q, r, j) / Q; if (u < c) { x0 = j; break; } }
      combState(n, r, x0, re, im);
      magFrom.set(mag.subarray(0, Q));
      for (let i = 0; i < Q; i++) magTo[i] = Math.abs(re[i]);
      status = `③ Work register reads ${modPow(a, x0, N)}: a comb with spacing r survives`;
      anim = { kind: 'lin', step: s, u: 0, dur };
    } else if (s === 3) {
      fRe[0].set(re.subarray(0, Q));
      fIm[0].set(im.subarray(0, Q));
      for (let m = 1; m < 4; m++) {
        fRe[m].set(fRe[m - 1].subarray(0, Q));
        fIm[m].set(fIm[m - 1].subarray(0, Q));
        qft(fRe[m], fIm[m], n);
      }
      colourMode = 'phase';
      status = '④ QFT: the spacing becomes position';
      anim = { kind: 'frac', step: s, u: 0, dur };
    } else if (s === 4) {
      re.set(fRe[1].subarray(0, Q));
      im.set(fIm[1].subarray(0, Q));
      for (let i = 0; i < Q; i++) magTo[i] = re[i] * re[i] + im[i] * im[i];
      k = sampleIndex(magTo, Math.random(), Q);
      for (let i = 0; i < Q; i++) magTo[i] = mag[i];
      highlight.visible = true;
      hlLabel.visible = true;
      hlLabel.element.textContent = `k = ${k}`;
      status = `⑤ Measured k = ${k}. Bars show the state just before`;
      anim = { kind: 'flash', step: s, u: 0, dur };
    } else {
      guess = recoverOrder(k, Q, a, N);
      cfOk = guess.ok;
      result = guess.ok ? factorFromOrder(a, N, guess.r) : null;
      if (result) {
        if (result.kind === 'ok') {
          factored = true;
          if (failN === N && failA !== a) failHandled = true;
          status = `⑥ ${N} = ${result.p} × ${result.q}`;
        } else if (result.kind === 'odd' || result.kind === 'minus-one') {
          failN = N; failA = a;
          status = '⑥ Period found, but this base fails';
        } else status = '⑥ Trivial factors. Run again';
      } else status = '⑥ No period from this k. Run again';
      anim = { kind: 'flash', step: s, u: 0, dur };
    }
    uiDirty = true;
    barsDirty = true;
  }

  function finishStep(): void {
    if (!anim) return;
    const s = anim.step;
    if (anim.kind === 'lin') for (let i = 0; i < Q; i++) mag[i] = magTo[i];
    if (anim.kind === 'sweep') sweepU = 1;
    if (anim.kind === 'frac') setFrac(1);
    stepDone = s + 1;
    anim = null;
    if (stepDone >= 4) placeTiles(true);
    barsDirty = true;
    uiDirty = true;
  }

  function setFrac(t: number): void {
    fracCoeffs(t, cR, cI);
    let nrm = 0;
    const a0r = fRe[0], a0i = fIm[0], a1r = fRe[1], a1i = fIm[1], a2r = fRe[2], a2i = fIm[2], a3r = fRe[3], a3i = fIm[3];
    for (let i = 0; i < Q; i++) {
      const xr = cR[0] * a0r[i] - cI[0] * a0i[i] + cR[1] * a1r[i] - cI[1] * a1i[i] + cR[2] * a2r[i] - cI[2] * a2i[i] + cR[3] * a3r[i] - cI[3] * a3i[i];
      const xi = cR[0] * a0i[i] + cI[0] * a0r[i] + cR[1] * a1i[i] + cI[1] * a1r[i] + cR[2] * a2i[i] + cI[2] * a2r[i] + cR[3] * a3i[i] + cI[3] * a3r[i];
      const m2 = xr * xr + xi * xi;
      nrm += m2;
      mag[i] = Math.sqrt(m2);
      ph[i] = m2 > 1e-14 ? Math.atan2(xi, xr) : 0;
    }
    normErr = nrm - 1;
  }

  function flush(): void {
    while (anim || queue.length) {
      if (!anim) startStep(queue.shift()!);
      finishStep();
    }
  }

  function clearRun(): void {
    queue.length = 0;
    anim = null;
    stepDone = 0;
    x0 = -1;
    k = -1;
    guess = null;
    result = null;
    cfOk = false;
    factored = false;
    highlight.visible = false;
    hlLabel.visible = false;
    placeTiles(false);
    mag.fill(0);
    ph.fill(0);
    mag[0] = 1;
    re.fill(0);
    im.fill(0);
    re[0] = 1;
    colourMode = 'phase';
    sweepU = 1;
    normErr = 0;
    status = `Counting register in |0⟩. Next: ${STEPS[0]}`;
    barsDirty = true;
    uiDirty = true;
  }

  function configure(): void {
    Q = 1 << n;
    nRec = recommendedQubits(N);
    r = order(a, N);
    classical = factorFromOrder(a, N, r);
    peakDistribution(n, r, dist);
    pSucc = cfSuccessProbability(n, a, N, dist);
    peakW = 0;
    for (let j = 0; j < r; j++) peakW += dist[Math.round((j * Q) / r) % Q];
    setClassColours();
    hitCount.fill(0);
    shots = 0;
    shotHits = 0;
    layout();
    axisLabel.element.textContent = `counting register: ${n} qubits, 2ⁿ = ${Q} bars`;
    clockX = 0; clockPrev = 1; clockU = 1; clockT = 0;
    clockDirty = true;
    clearRun();
  }

  function next(): void {
    touched = true;
    if (anim || queue.length) flush();
    if (stepDone >= 6) { hitCount.fill(0); shots = 0; shotHits = 0; clearRun(); }
    queue.push(stepDone);
  }

  function runAll(): void {
    touched = true;
    hitCount.fill(0);
    shots = 0;
    shotHits = 0;
    clearRun();
    for (let s = 0; s < 6; s++) queue.push(s);
  }

  function measure20(): void {
    touched = true;
    if (stepDone < 4 || anim || queue.length) {
      flush();
      if (stepDone < 4) { for (let s = stepDone; s < 4; s++) queue.push(s); flush(); }
    }
    for (let s = 0; s < 20; s++) {
      const kk = sampleIndex(dist, Math.random(), Q);
      const g = recoverOrder(kk, Q, a, N);
      shots++;
      if (g.ok) {
        shotHits++;
        const f = factorFromOrder(a, N, g.r);
        if (f.kind === 'odd' || f.kind === 'minus-one') { failN = N; failA = a; }
      }
      hitCount[kk]++;
    }
    barsDirty = true;
    uiDirty = true;
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    if (!anim && queue.length) startStep(queue.shift()!);
    if (anim) {
      anim.u = Math.min(1, anim.u + dt / anim.dur);
      const e = ease(anim.u);
      if (anim.kind === 'lin') for (let i = 0; i < Q; i++) mag[i] = magFrom[i] + (magTo[i] - magFrom[i]) * e;
      else if (anim.kind === 'sweep') sweepU = e;
      else if (anim.kind === 'frac') setFrac(e);
      if (anim.kind !== 'flash') barsDirty = true;
      if (anim.u >= 1) finishStep();
      uiDirty = true;
    }
    // clock: one hop every 0.8 s
    clockT += dt;
    if (clockT > 0.8) {
      clockT = 0;
      clockPrev = modPow(a, clockX, N);
      clockX = (clockX + 1) % Math.max(1, 2 * r);
      if (clockX > 24) clockX = 0;
      clockU = 0;
    }
    if (clockU < 1) { clockU = Math.min(1, clockU + dt / 0.3); clockDirty = true; }
    if (clockDirty) { drawClock(); clockDirty = false; }
    if (barsDirty) { drawBars(); barsDirty = false; }
    if (uiDirty) { updateLegend(); renderCards(); updateReadouts(); uiDirty = false; }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Number to factor (resets)');
  ui.select({
    key: 'N', label: 'N', value: String(N) as string,
    options: N_OPTIONS.map((v) => ({ value: String(v), label: String(v) })),
    onChange: (v) => {
      touched = true;
      N = Number(v);
      bases = coprimeBases(N);
      a = DEFAULT_A[N];
      aSpec.max = bases.length - 1;
      (aCtl.el.querySelector('input') as HTMLInputElement).max = String(bases.length - 1);
      aCtl.set(bases.indexOf(a), false);
      n = recommendedQubits(N);
      nCtl.set(n, false);
      configure();
    },
  });
  const aSpec: SliderSpec = {
    key: 'a', label: 'Base a (coprime to N)', min: 0, max: bases.length - 1, step: 1, value: bases.indexOf(a),
    format: (i) => {
      const av = bases[Math.min(i, bases.length - 1)];
      return `${av}  (r = ${order(av, N)})`;
    },
    onInput: (i) => { touched = true; a = bases[i]; configure(); },
  };
  const aCtl = ui.slider(aSpec);
  ui.buttons([
    {
      label: 'Random a', key: 'a',
      onClick: () => {
        let i = Math.floor(Math.random() * bases.length);
        if (bases[i] === a && bases.length > 1) i = (i + 1) % bases.length;
        aCtl.set(i, true);
      },
    },
  ]);
  const nCtl = ui.slider({
    key: 'n', label: 'Counting qubits n', min: MIN_QUBITS, max: MAX_QUBITS, step: 1, value: n,
    format: (v) => `${v}  (2ⁿ = ${1 << v})`,
    onInput: (v) => { touched = true; n = v; configure(); },
  });
  const nNote = ui.note('');

  ui.section('Circuit');
  const [nextBtn] = ui.buttons([
    { label: 'Next: Superpose', primary: true, key: 'step', onClick: next },
    { label: 'Run all', key: 'step', onClick: runAll },
    { label: 'Reset', onClick: () => { touched = true; hitCount.fill(0); shots = 0; shotHits = 0; clearRun(); } },
  ]);
  ui.buttons([{ label: 'Measure ×20', key: 'shots', onClick: measure20 }]);
  ui.note('Each of the 20 shots re-runs the whole circuit, measures k once, and applies continued fractions.');
  const rStep = ui.readout('step', 'step');
  const rShots = ui.readout('shots', 'CF found r (×20)');
  const rPs = ui.readout('pSucc', 'P(CF finds r) exact');

  ui.section('Quantum run');
  const rY = ui.readout('y', 'work register');
  const rK = ui.readout('k', 'measured k');
  const rKf = ui.readout('kfrac', 'k / 2ⁿ');
  const rCf = ui.readout('rFound', 'period from CF');
  const rRes = ui.readout('result', 'result');
  const rPw = ui.readout('peakW', 'P at j·2ⁿ/r bars');
  const rNorm = ui.readout('norm', '‖ψ‖² − 1');

  ui.section('Classical side');
  const rR = ui.readout('r', 'order r');
  const rHalf = ui.readout('half', `a^(r/2) mod N`);
  const rF = ui.readout('factors', 'gcd(a^(r/2) ± 1, N)');
  ui.legend([
    { color: css(PALETTE.amber), label: 'predicted peak' },
    { color: css(PALETTE.green), label: 'measured shots' },
    { color: 'linear-gradient(90deg,hsl(187,72%,56%),hsl(300,72%,56%),hsl(60,72%,56%))', label: 'phase / residue' },
  ]);

  function updateReadouts(): void {
    nextBtn.textContent = stepDone >= 6 ? 'Run again' : `Next: ${STEPS[stepDone]}`;
    rStep(stepDone >= 6 ? 'done' : `${stepDone} / 6`);
    rShots(shots ? `${shotHits} / ${shots}` : '…');
    rPs(pSucc.toFixed(3));
    rY(x0 >= 0 ? `${modPow(a, x0, N)}  (x₀ = ${x0})` : '…');
    rK(k >= 0 ? String(k) : '…');
    rKf(k >= 0 ? (k / Q).toFixed(5) : '…');
    rCf(guess ? (guess.ok ? `${guess.chosen!.p}/${guess.r} → r = ${guess.r}` : 'failed') : '…');
    rRes(result ? (result.kind === 'ok' ? `${N} = ${result.p} × ${result.q}` : result.kind) : '…');
    rPw(peakW.toFixed(3));
    rNorm(Math.abs(normErr) < 1e-15 ? '0' : normErr.toExponential(0));
    rR(String(r));
    rHalf(classical.half >= 0 ? `${classical.half}${classical.half === N - 1 ? ' ≡ −1' : ''}` : 'r odd');
    rF(classical.kind === 'ok' ? `${classical.p} × ${classical.q}` : classical.kind === 'odd' ? 'fails: r odd' : 'fails: ≡ −1');
    const warn = n < nRec
      ? `<b>Display size.</b> 2ⁿ = ${Q} is below N² = ${N * N}. Shor's guarantee needs n ≥ ${nRec}. Continued fractions may fail more often.`
      : `2ⁿ = ${Q} ≥ N² = ${N * N}, as Shor's analysis requires (n ≥ ${nRec}).`;
    if (nNote.innerHTML !== warn) nNote.innerHTML = warn;
  }

  configure();
  // Opening demo: jump to the comb, then animate the QFT. The challenge state stays untouched.
  for (let s = 0; s < 3; s++) queue.push(s);
  flush();
  queue.push(3);

  return {
    state: () => ({
      N, a, n, nRec, Q, r,
      rPow2: (r & (r - 1)) === 0,
      step: stepDone,
      k, x0,
      cfOk,
      rFound: guess && guess.ok ? guess.r : 0,
      factored,
      failHandled,
      classicalKind: classical.kind,
      shots, shotHits,
      pSucc,
      touched,
      gcdCheck: gcd(a, N),
      animating: anim !== null || queue.length > 0,
    }),
    dispose: () => {
      legend.remove();
      clock.remove();
      cards.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'shor-algorithm',
  number: 49,
  title: 'Shor’s Algorithm',
  domain: 'quantum',
  level: 3,
  status: 'live',
  tagline: 'How a quantum computer would break RSA by finding a rhythm.',
  content,
  mount,
};

export default topic;
