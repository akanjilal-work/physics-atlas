import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css, type SliderSpec } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  analyticP, classicalExpected, diffuse, hadamardAll, MAX_QUBITS, MIN_QUBITS, mean, norm2, optimalK,
  oracle, planeCoords, sample, spreadMarks, successProb, theta as thetaOf, zeroState,
} from './physics.ts';

type Op = 'H' | 'O' | 'D';

const NMAX = 1 << MAX_QUBITS;
const MAX_MARKED = 8;
const HS = 2.7; // scene height of amplitude 1
const FOOT = 4.6; // widest footprint of the bar city
const DEG = 180 / Math.PI;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [1.3, 4.2, 9.4], target: [1.3, 0.9, 0], fov: 42 });
  const { scene } = stage;

  // --- Simulation state
  let n = 4;
  let N = 1 << n;
  let M = 1;
  let first = 11;
  let marks: Uint8Array = new Uint8Array(N);
  let psi: Float64Array = new Float64Array(N);
  const dispBuf = new Float64Array(NMAX);
  const fromBuf = new Float64Array(NMAX);
  let disp: Float64Array = dispBuf.subarray(0, N);
  let from: Float64Array = fromBuf.subarray(0, N);
  let k = 0;
  let half = false; // an oracle has been applied without its diffusion
  let regular = true; // the op sequence so far is H (O D)^k [O]
  let phi = 0; // analytic angle in the Grover plane, tracked through each reflection
  let th = 0;
  let kOpt = 0;
  let shots = 0;
  let hits = 0;
  let lastOutcome = -1;
  let found8 = false;
  const history: number[] = [];
  const queue: Op[] = [];
  let anim: { op: Op; u: number; dur: number } | null = null;
  let barsDirty = true;
  let insetDirty = true;
  let status = '';

  // --- Scene furniture
  let grid = makeGrid(6, 6);
  scene.add(grid);

  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const barMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.12 });
  const bars = new THREE.InstancedMesh(barGeo, barMat, NMAX);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < NMAX; i++) bars.setColorAt(i, white);
  scene.add(bars);

  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.03, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.85 }),
    MAX_MARKED * 2,
  );
  tiles.count = 0;
  scene.add(tiles);
  const markLabels = Array.from({ length: MAX_MARKED }, () => {
    const l = stage.label('', [0, 0, 0], '');
    l.element.style.color = css(PALETTE.amber);
    l.visible = false;
    return l;
  });

  // Mean plane: the mirror for "inversion about the mean".
  const meanGroup = new THREE.Group();
  scene.add(meanGroup);
  const meanPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  meanPlane.rotation.x = -Math.PI / 2;
  meanGroup.add(meanPlane);
  const meanEdgeGeo = new THREE.BufferGeometry();
  meanEdgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
  const meanEdge = new THREE.LineLoop(meanEdgeGeo, new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.9 }));
  meanGroup.add(meanEdge);
  const meanLabel = stage.label('mean ⟨a⟩', [0, 0, 0], 'muted', meanGroup);
  meanLabel.element.style.color = css(PALETTE.violet);

  // Vertical amplitude scale at the back-left corner.
  const scaleGeo = new THREE.BufferGeometry();
  const scalePos = new Float32Array(18);
  scaleGeo.setAttribute('position', new THREE.BufferAttribute(scalePos, 3));
  const scaleLine = new THREE.LineSegments(scaleGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  scaleLine.frustumCulled = false;
  scene.add(scaleLine);
  const tickOne = stage.label('a = +1', [0, 0, 0], 'muted');
  const tickU = stage.label('1/√N', [0, 0, 0], 'muted');

  // Measurement highlight.
  const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  highlight.visible = false;
  scene.add(highlight);
  const hlLabel = stage.label('', [0, 0, 0], 'big');
  hlLabel.visible = false;

  // --- Layout
  let cols = 4;
  let rows = 4;
  let pitch = 1.1;
  const cellX = (i: number) => ((i % cols) - (cols - 1) / 2) * pitch;
  const cellZ = (i: number) => (Math.floor(i / cols) - (rows - 1) / 2) * pitch;
  const ket = (i: number) => `|${i.toString(2).padStart(n, '0')}⟩`;

  function layout(): void {
    cols = 1 << Math.ceil(n / 2);
    rows = N / cols;
    pitch = Math.min(0.85, FOOT / cols);
    const w = cols * pitch;
    const d = rows * pitch;
    scene.remove(grid);
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
    grid = makeGrid(Math.max(w, d) + pitch, Math.max(cols, rows) + 1);
    scene.add(grid);
    meanPlane.scale.set(w + 0.4, d + 0.4, 1);
    meanEdge.scale.set(w + 0.4, 1, d + 0.4);
    meanLabel.position.set(-w / 2 + 0.3, 0, d / 2 + 0.65);
    const x0 = w / 2 + 0.35;
    const z0 = -d / 2 - 0.2;
    const u = HS / Math.sqrt(N);
    const v = [x0, 0, z0, x0, HS, z0, x0 - 0.12, HS, z0, x0 + 0.12, HS, z0, x0 - 0.12, u, z0, x0 + 0.12, u, z0];
    for (let i = 0; i < 18; i++) scalePos[i] = v[i];
    scaleGeo.attributes.position.needsUpdate = true;
    tickOne.position.set(x0 + 0.1, HS + 0.18, z0);
    tickU.position.set(x0 + 0.55, u, z0);
    bars.count = N;
  }

  function placeMarks(): void {
    let j = 0;
    const s = pitch * 0.94;
    for (let i = 0; i < N && j < MAX_MARKED; i++) {
      if (!marks[i]) continue;
      m4.compose(tp.set(cellX(i), 0.016, cellZ(i)), qI, sc.set(s, 1, s));
      tiles.setMatrixAt(j, m4);
      const l = markLabels[j];
      l.element.textContent = `w ${ket(i)}`;
      l.position.set(cellX(i), 0, cellZ(i) + pitch * 0.5 + 0.12);
      l.visible = M <= 4 || N <= 64;
      j++;
    }
    for (let q = j; q < MAX_MARKED; q++) markLabels[q].visible = false;
    tiles.count = j;
    tiles.instanceMatrix.needsUpdate = true;
  }

  // --- Drawing the bars
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const tp = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const cPos = new THREE.Color(PALETTE.cyan);
  const cNeg = new THREE.Color(PALETTE.rose);

  function drawBars(): void {
    const bw = pitch * 0.62;
    for (let i = 0; i < N; i++) {
      const h = disp[i] * HS;
      const ah = Math.max(0.004, Math.abs(h));
      m4.compose(tp.set(cellX(i), h / 2, cellZ(i)), qI, sc.set(bw, ah, bw));
      bars.setMatrixAt(i, m4);
      bars.setColorAt(i, disp[i] >= 0 ? cPos : cNeg);
    }
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    meanGroup.position.y = mean(disp) * HS;
    if (highlight.visible && lastOutcome >= 0) {
      const h = disp[lastOutcome] * HS;
      const ah = Math.max(0.05, Math.abs(h)) + 0.08;
      highlight.position.set(cellX(lastOutcome), h / 2, cellZ(lastOutcome));
      highlight.scale.set(bw + 0.1, ah, bw + 0.1);
      hlLabel.position.set(cellX(lastOutcome), Math.max(h, 0) + 0.35, cellZ(lastOutcome));
    }
  }

  // --- Overlays: legend (top left), Grover-plane circle (top right), P vs k (bottom right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  let legendHtml = '';

  const insetStyle = {
    position: 'absolute', right: '10px', width: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const circ = document.createElement('canvas');
  circ.width = 440;
  circ.height = 440;
  Object.assign(circ.style, { ...insetStyle, top: '10px', height: '220px' } as CSSStyleDeclaration);
  viewport.appendChild(circ);
  const cctx = circ.getContext('2d')!;

  const plot = document.createElement('canvas');
  plot.width = 440;
  plot.height = 250;
  Object.assign(plot.style, { ...insetStyle, bottom: '10px', height: '125px' } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;

  const xy = new Float64Array(2);

  function arrowHead(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size: number): void {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - size * Math.cos(a - 0.4), y1 - size * Math.sin(a - 0.4));
    ctx.lineTo(x1 - size * Math.cos(a + 0.4), y1 - size * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  function drawCircle(): void {
    const W = circ.width;
    const H = circ.height;
    const cx = W / 2;
    const cy = H / 2 + 14;
    const R = W * 0.34;
    const c = cctx;
    c.clearRect(0, 0, W, H);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('Grover plane', 16, 32);
    // unit circle and axes
    c.strokeStyle = '#2c3852';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - R - 12, cy);
    c.lineTo(cx + R + 12, cy);
    c.moveTo(cx, cy + R + 12);
    c.lineTo(cx, cy - R - 12);
    c.stroke();
    c.fillStyle = css(PALETTE.amber);
    c.fillText('|w⟩', cx + 8, cy - R - 2);
    c.fillStyle = '#9aa6bd';
    c.fillText('|r⟩', cx + R - 18, cy + 28);
    // |s> mirror line
    c.setLineDash([6, 6]);
    c.strokeStyle = css(PALETTE.violet);
    c.beginPath();
    c.moveTo(cx - (R + 10) * Math.cos(th), cy + (R + 10) * Math.sin(th));
    c.lineTo(cx + (R + 10) * Math.cos(th), cy - (R + 10) * Math.sin(th));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = css(PALETTE.violet);
    c.fillText('|s⟩', cx + (R + 12) * Math.cos(th) - 4, cy - (R + 12) * Math.sin(th) - 8);
    // history of states after each op
    c.fillStyle = 'rgba(79,209,232,0.55)';
    for (let i = 0; i < history.length; i++) {
      const a = history[i];
      c.beginPath();
      c.arc(cx + R * Math.cos(a), cy - R * Math.sin(a), 4, 0, Math.PI * 2);
      c.fill();
    }
    // current (animated) state
    const ang = planeCoords(disp, marks, xy);
    const px = cx + R * xy[0];
    const py = cy - R * xy[1];
    c.strokeStyle = css(PALETTE.green);
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx, py);
    c.stroke();
    c.setLineDash([3, 5]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(cx, py);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = css(PALETTE.amber);
    c.fillStyle = css(PALETTE.amber);
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(px, py);
    c.stroke();
    if (Math.hypot(px - cx, py - cy) > 12) arrowHead(c, cx, cy, px, py, 18);
    c.fillStyle = '#dfe6f3';
    c.font = '20px JetBrains Mono, monospace';
    c.fillText(`angle ${(ang * DEG).toFixed(1)}°   2θ = ${(2 * th * DEG).toFixed(1)}°`, 16, H - 18);
    c.fillStyle = css(PALETTE.green);
    c.fillText('P = w²', W - 100, 32);
  }

  function drawPlot(): void {
    const W = plot.width;
    const H = plot.height;
    const c = pctx;
    c.clearRect(0, 0, W, H);
    const kMax = Math.min(80, Math.max(6, 2 * kOpt + 2, k + 2));
    const x0 = 22;
    const x1 = W - 16;
    const y0 = H - 34;
    const y1 = 46;
    const X = (kk: number) => x0 + (kk / kMax) * (x1 - x0);
    const Y = (p: number) => y0 - p * (y0 - y1);
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('P(success) vs k', 14, 28);
    c.fillStyle = '#b8c3d9';
    const tally = shots ? `hits ${hits}/${shots}` : 'no shots yet';
    c.fillText(tally, W - 14 - c.measureText(tally).width, 28);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x0, Y(0));
    c.lineTo(x1, Y(0));
    c.moveTo(x0, Y(1));
    c.lineTo(x1, Y(1));
    c.stroke();
    // k_opt marker
    c.strokeStyle = css(PALETTE.green);
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(X(kOpt), Y(0));
    c.lineTo(X(kOpt), Y(1) - 4);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = css(PALETTE.green);
    c.fillText(`k_opt ${kOpt}`, Math.min(X(kOpt) + 6, x1 - 96), y0 + 26);
    // continuous curve
    c.strokeStyle = 'rgba(167,139,250,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    for (let s = 0; s <= 200; s++) {
      const kk = (s / 200) * kMax;
      const p = Math.sin((2 * kk + 1) * th) ** 2;
      if (s === 0) c.moveTo(X(kk), Y(p));
      else c.lineTo(X(kk), Y(p));
    }
    c.stroke();
    // integer k
    c.fillStyle = css(PALETTE.cyan);
    const r = kMax > 40 ? 2.5 : 4;
    for (let kk = 0; kk <= kMax; kk++) {
      c.beginPath();
      c.arc(X(kk), Y(analyticP(kk, N, M)), r, 0, Math.PI * 2);
      c.fill();
    }
    // current state
    const P = successProb(psi, marks);
    c.strokeStyle = css(PALETTE.amber);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(X(half ? k + 0.5 : k), Y(P), 9, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#56627c';
    c.fillText('0', x0 - 6, y0 + 26);
  }

  function updateLegend(): void {
    const html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">${status}</div>
<div><span style="color:${css(PALETTE.cyan)}">■</span> amplitude &gt; 0 &nbsp;<span style="color:${css(PALETTE.rose)}">■</span> &lt; 0</div>
<div><span style="color:${css(PALETTE.amber)}">■</span> marked item |w⟩</div>
<div><span style="color:${css(PALETTE.violet)}">▬</span> mean plane (diffusion mirror)</div>
<div style="color:#8391ab">Bar height = amplitude. P = height².</div>`;
    if (html !== legendHtml) {
      legend.innerHTML = html;
      legendHtml = html;
    }
  }

  // --- Operations
  function applyOp(op: Op): void {
    from.set(disp);
    if (op === 'H') {
      hadamardAll(psi);
      status = `H on all ${n} qubits: ${N} equal amplitudes`;
    } else if (op === 'O') {
      oracle(psi, marks);
      phi = -phi;
      if (half) regular = false;
      half = !half;
      status = 'Oracle: marked amplitudes flip sign';
    } else {
      diffuse(psi);
      phi = 2 * th - phi;
      if (half) k++;
      else regular = false;
      half = false;
      status = 'Diffuse: every bar reflects through the mean';
    }
    if (op !== 'H') history.push(phi);
    if (history.length > 400) history.shift();
    shots = 0;
    hits = 0;
    highlight.visible = false;
    hlLabel.visible = false;
    const busy = queue.length;
    anim = { op, u: 0, dur: op === 'H' ? 0.9 : busy > 8 ? 0.16 : busy > 1 ? 0.32 : 0.7 };
    insetDirty = true;
  }

  function enqueue(...ops: Op[]): void {
    queue.push(...ops);
  }

  function reset(animateH = true, remark = false): void {
    N = 1 << n;
    M = Math.min(M, Math.max(1, N / 2));
    first = Math.min(first, N - 1);
    if (remark || marks.length !== N) marks = spreadMarks(N, M, first);
    psi = zeroState(n);
    disp = dispBuf.subarray(0, N);
    from = fromBuf.subarray(0, N);
    queue.length = 0;
    anim = null;
    th = thetaOf(N, M);
    kOpt = optimalK(N, M);
    phi = th;
    k = 0;
    half = false;
    regular = true;
    shots = 0;
    hits = 0;
    lastOutcome = -1;
    history.length = 0;
    history.push(phi);
    highlight.visible = false;
    hlLabel.visible = false;
    layout();
    placeMarks();
    if (animateH) {
      disp.set(psi);
      enqueue('H');
    } else {
      hadamardAll(psi);
      disp.set(psi);
      status = `H on all ${n} qubits: ${N} equal amplitudes`;
    }
    barsDirty = true;
    insetDirty = true;
  }

  function measure(times: number): void {
    // Finish any animation first so the shot uses the displayed state.
    while (queue.length) applyOp(queue.shift()!);
    if (anim) { disp.set(psi); anim = null; barsDirty = true; }
    for (let s = 0; s < times; s++) {
      const x = sample(psi, Math.random());
      shots++;
      if (marks[x]) hits++;
      lastOutcome = x;
    }
    const hit = marks[lastOutcome] === 1;
    if (hit && n === 8 && M === 1 && k >= 1 && k <= 13 && regular && !half) found8 = true;
    highlight.visible = true;
    hlLabel.visible = true;
    hlLabel.element.textContent = `${ket(lastOutcome)} ${hit ? 'found ✓' : 'miss ✗'}`;
    hlLabel.element.style.color = hit ? css(PALETTE.green) : css(PALETTE.red);
    (highlight.material as THREE.LineBasicMaterial).color.set(hit ? PALETTE.green : PALETTE.red);
    barsDirty = true;
    insetDirty = true;
  }

  // --- Clicking a bar marks it
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPt = new THREE.Vector3();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    bars.computeBoundingSphere();
    const hitsArr = ray.intersectObject(bars, false);
    let id = -1;
    if (hitsArr.length && hitsArr[0].instanceId !== undefined) id = hitsArr[0].instanceId;
    else if (ray.ray.intersectPlane(floor, hitPt)) {
      const c = Math.round(hitPt.x / pitch + (cols - 1) / 2);
      const r = Math.round(hitPt.z / pitch + (rows - 1) / 2);
      if (c >= 0 && c < cols && r >= 0 && r < rows) id = r * cols + c;
    }
    if (id < 0 || id >= N) return;
    if (M === 1) {
      first = id;
      itemCtl.set(first, false);
      reset(true, true);
      return;
    }
    // Several marked items: toggle this one, keeping between 1 and MAX_MARKED.
    if (marks[id] && M > 1) { marks[id] = 0; M--; }
    else if (!marks[id] && M < Math.min(MAX_MARKED, N / 2)) { marks[id] = 1; M++; }
    else return;
    mCtl.set(M, false);
    reset();
  };
  stage.renderer.domElement.addEventListener('pointerdown', onDown);
  stage.renderer.domElement.addEventListener('pointerup', onUp);

  // --- Frame loop
  const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
  stage.onFrame((dt) => {
    if (!anim && queue.length) applyOp(queue.shift()!);
    if (anim) {
      anim.u = Math.min(1, anim.u + dt / anim.dur);
      const e = ease(anim.u);
      for (let i = 0; i < N; i++) disp[i] = from[i] + (psi[i] - from[i]) * e;
      if (anim.u >= 1) { disp.set(psi); anim = null; }
      barsDirty = true;
      insetDirty = true;
    }
    if (barsDirty) { drawBars(); barsDirty = false; }
    if (insetDirty) { drawCircle(); drawPlot(); insetDirty = false; }
    (meanPlane.material as THREE.MeshBasicMaterial).opacity = anim && anim.op === 'D' ? 0.3 : 0.16;
    updateLegend();
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Search space (resets)');
  ui.slider({
    key: 'n', label: 'Qubits n', min: MIN_QUBITS, max: MAX_QUBITS, step: 1, value: n,
    format: (v) => `${v}  (N = ${1 << v})`,
    onInput: (v) => {
      n = v;
      const Nn = 1 << n;
      itemSpec.max = Nn - 1;
      (itemCtl.el.querySelector('input') as HTMLInputElement).max = String(Nn - 1);
      mSpec.max = Math.min(MAX_MARKED, Nn / 2);
      (mCtl.el.querySelector('input') as HTMLInputElement).max = String(mSpec.max);
      first = Math.min(first, Nn - 1);
      M = Math.min(M, mSpec.max);
      itemCtl.set(first, false);
      mCtl.set(M, false);
      reset(true, true);
    },
  });
  const mSpec: SliderSpec = {
    key: 'M', label: 'Marked items M', min: 1, max: Math.min(MAX_MARKED, N / 2), step: 1, value: M,
    onInput: (v) => { M = v; reset(true, true); },
  };
  const mCtl = ui.slider(mSpec);
  const itemSpec: SliderSpec = {
    key: 'item', label: 'Marked item', min: 0, max: N - 1, step: 1, value: first,
    format: (v) => `${v}  ${ket(Math.min(v, N - 1))}`,
    onInput: (v) => { first = v; reset(true, true); },
  };
  const itemCtl = ui.slider(itemSpec);
  ui.note('Click a bar to mark it. With M &gt; 1, clicks add or remove marks.');

  ui.section('Circuit');
  ui.buttons([
    { label: 'Oracle', primary: true, key: 'oracle', onClick: () => enqueue('O') },
    { label: 'Diffuse', primary: true, key: 'diffuse', onClick: () => enqueue('D') },
    { label: 'Reset', onClick: () => reset() },
  ]);
  let runK = 3;
  ui.slider({ key: 'runK', label: 'Iterations to run', min: 1, max: 40, step: 1, value: runK, onInput: (v) => (runK = v) });
  ui.buttons([
    { label: 'Run k iterations', key: 'runK', onClick: () => { for (let i = 0; i < runK; i++) enqueue('O', 'D'); } },
    { label: 'Auto-run optimal', key: 'kOpt', onClick: () => { reset(false); for (let i = 0; i < kOpt; i++) enqueue('O', 'D'); } },
  ]);

  ui.section('Measure');
  ui.buttons([
    { label: 'Measure ×1', key: 'shots', onClick: () => measure(1) },
    { label: 'Measure ×100', key: 'shots', onClick: () => measure(100) },
  ]);
  ui.note('Each shot re-runs the same circuit and measures once. A real measurement collapses the state.');
  const rShots = ui.readout('shots', 'hits / shots');
  const rRate = ui.readout('rate', 'hit rate');

  ui.section('Readouts');
  const rN = ui.readout('N', 'N = 2ⁿ');
  const rTh = ui.readout('theta', 'θ = asin √(M/N)');
  const rK = ui.readout('k', 'iterations k');
  const rKo = ui.readout('kOpt', 'optimal k');
  const rP = ui.readout('P', 'P(success)');
  const rPf = ui.readout('Pform', 'sin²((2k+1)θ)');
  const rNorm = ui.readout('norm', '‖ψ‖² − 1');
  const rCl = ui.readout('classical', 'classical queries');
  const rSp = ui.readout('speedup', 'speedup');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'a > 0' },
    { color: css(PALETTE.rose), label: 'a < 0' },
    { color: css(PALETTE.amber), label: 'marked' },
    { color: css(PALETTE.violet), label: 'mean' },
  ]);

  function updateReadouts(): void {
    rN(`${N}  (M = ${M})`);
    rTh(`${(th * DEG).toFixed(2)}°`);
    rK(half ? `${k} + oracle` : String(k));
    rKo(`${kOpt}  (≈${((Math.PI / 4) * Math.sqrt(N / M)).toFixed(1)})`);
    rP(successProb(psi, marks).toFixed(4));
    rPf(regular && !half ? analyticP(k, N, M).toFixed(4) : `${(Math.sin(phi) ** 2).toFixed(4)} (via φ)`);
    const dn = norm2(psi) - 1;
    rNorm(Math.abs(dn) < 1e-15 ? '0' : dn.toExponential(0));
    const cl = classicalExpected(N, M);
    rCl(cl.toFixed(1));
    rSp(`${(cl / Math.max(1, kOpt)).toFixed(1)}×`);
    rShots(`${hits} / ${shots}`);
    rRate(shots ? (hits / shots).toFixed(2) : '…');
  }

  reset(true, true);

  return {
    state: () => ({
      n, N, M, k, kOpt, half, regular,
      P: successProb(psi, marks),
      Popt: analyticP(kOpt, N, M),
      theta: th,
      shots, hits, found8,
      animating: anim !== null || queue.length > 0,
    }),
    dispose: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onDown);
      stage.renderer.domElement.removeEventListener('pointerup', onUp);
      legend.remove();
      circ.remove();
      plot.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'grover-search',
  number: 26,
  symbol: 'Gv',
  title: 'Qubits & Grover Search',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'Find a needle in N haystacks in about the square root of N looks.',
  content,
  mount,
};

export default topic;
