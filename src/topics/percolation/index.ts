import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { Percolation, pcOf, type Dim, type Mode } from './physics.ts';

const SIZE = 8; // lattice side in scene units
const SIZES: Record<Dim, number[]> = { 2: [32, 64, 128, 200], 3: [12, 20, 30, 40] };
const MAXN = 64000; // 40^3, also >= 200^2
const K = Percolation.CURVE_N;
const MAX_OLD = 6;
const SWEEP_RATE = 0.075; // p per second far from p_c
const HOLD = 1.6; // pause (s) when spanning first forms during a sweep
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const ACCENT = '#fb7a4b'; // thermo accent
const GOLD = '#f5b642';
const CLUSTER_HEX = [0x4fd1e8, 0xa78bfa, 0xf472b6, 0x5ee39a, 0x5b9cf0, 0x7ee0c8, 0xc4a3ff, 0xff8fb8];
const CAM3: [number, number, number] = [12.6, 7.4, 15.4];
const CAM2: [number, number, number] = [0, -0.4, 15.5];

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM3, target: [0, -0.6, 0], fov: 42 });
  const { scene } = stage;

  // --- State
  let dim: Dim = 3;
  let mode: Mode = 'site';
  let sizeIdx = 2;
  let seed = 1;
  let p = 0.25;
  let only = false;
  let touched = false;
  let sweeping = false;
  let hold = 0;
  let span2 = 0;
  let span3 = 0;
  let flash = 0;
  let wasSpanning = false;
  let dirty = true;
  let P = new Percolation(dim, SIZES[dim][sizeIdx], mode, seed);
  const visited = new Uint8Array(K);
  const oldCurves: Float32Array[] = [];
  let pos = new Float32Array(0);

  const L = () => P.L;
  const pc = () => pcOf(dim, mode);

  // --- Scene: instanced cubes for ordinary clusters and for the spanning cluster
  const box = new THREE.BoxGeometry(1, 1, 1);
  const restMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
  const rest = new THREE.InstancedMesh(box, restMat, MAXN);
  rest.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rest.setColorAt(0, new THREE.Color(1, 1, 1));
  rest.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  rest.frustumCulled = false;
  rest.count = 0;
  scene.add(rest);
  const spanMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: PALETTE.amber, emissiveIntensity: 0.5, roughness: 0.35 });
  const span = new THREE.InstancedMesh(box.clone(), spanMat, MAXN);
  span.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  span.frustumCulled = false;
  span.count = 0;
  scene.add(span);
  const rArr = rest.instanceMatrix.array as Float32Array;
  const cArr = rest.instanceColor!.array as Float32Array;
  const sArr = span.instanceMatrix.array as Float32Array;
  const pal = CLUSTER_HEX.map((h) => new THREE.Color(h));

  // Bonds (bond mode only). Geometry is rebuilt when the lattice changes.
  const bondMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  let bonds: THREE.LineSegments | null = null;
  let bPos = new Float32Array(0);
  let bCol = new Float32Array(0);

  // Frame: lattice outline plus top and bottom face slabs
  const frameMat = new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.8 });
  let frame: THREE.LineSegments | null = null;
  const faceMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const topFace = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), faceMat);
  const botFace = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), faceMat);
  scene.add(topFace, botFace);
  const topLab = stage.label('top face', [0, 0, 0], 'muted');
  const botLab = stage.label('bottom face', [0, 0, 0], 'muted');
  const statusLab = stage.label('', [0, 0, 0], 'big');

  function layoutFrame(): void {
    const h = SIZE / 2;
    const gap = 0.18;
    if (frame) {
      scene.remove(frame);
      frame.geometry.dispose();
    }
    const g = dim === 3 ? new THREE.BoxGeometry(SIZE, SIZE, SIZE) : new THREE.PlaneGeometry(SIZE, SIZE);
    frame = new THREE.LineSegments(new THREE.EdgesGeometry(g), frameMat);
    g.dispose();
    scene.add(frame);
    const depth = dim === 3 ? SIZE : 0.5;
    topFace.scale.set(SIZE + 0.3, 0.1, depth + 0.3);
    botFace.scale.set(SIZE + 0.3, 0.1, depth + 0.3);
    topFace.position.set(0, h + gap, 0);
    botFace.position.set(0, -h - gap, 0);
    topLab.position.set(0, h + 0.55, dim === 3 ? -h : 0);
    botLab.position.set(0, -h - 0.6, dim === 3 ? h : 0);
    statusLab.position.set(0, -h - 1.3, dim === 3 ? h : 0);
  }

  function layoutSites(): void {
    const n = P.N;
    const Ls = L();
    const cell = SIZE / Ls;
    pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (P.coord(i, 0) + 0.5) * cell - SIZE / 2;
      pos[i * 3 + 1] = SIZE / 2 - (P.coord(i, 1) + 0.5) * cell;
      pos[i * 3 + 2] = dim === 3 ? (P.coord(i, 2) + 0.5) * cell - SIZE / 2 : 0;
    }
    if (bonds) {
      scene.remove(bonds);
      bonds.geometry.dispose();
      bonds = null;
    }
    if (mode === 'bond') {
      const nb = P.nb;
      bPos = new Float32Array(nb * 6);
      bCol = new Float32Array(nb * 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(bCol, 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      bonds = new THREE.LineSegments(g, bondMat);
      bonds.frustumCulled = false;
      scene.add(bonds);
    }
  }

  const tmp = new THREE.Color();
  function writeMatrix(arr: Float32Array, k: number, i: number, s: number): void {
    const b = k * 16;
    arr[b] = s; arr[b + 1] = 0; arr[b + 2] = 0; arr[b + 3] = 0;
    arr[b + 4] = 0; arr[b + 5] = s; arr[b + 6] = 0; arr[b + 7] = 0;
    arr[b + 8] = 0; arr[b + 9] = 0; arr[b + 10] = s; arr[b + 11] = 0;
    arr[b + 12] = pos[i * 3]; arr[b + 13] = pos[i * 3 + 1]; arr[b + 14] = pos[i * 3 + 2]; arr[b + 15] = 1;
  }

  /** Colour for a non-spanning cluster: hue from its root, brightness from its size. */
  function clusterColor(r: number, size: number): void {
    const c = pal[(Math.imul(r, 2654435761) >>> 29) % pal.length];
    const ref = Math.log(Math.max(8, Math.pow(P.N, 0.55)));
    const f = 0.14 + 0.86 * Math.min(1, Math.log(size) / ref);
    tmp.setRGB(c.r * f, c.g * f, c.b * f);
  }

  function paint(): void {
    const st = P.label(p);
    const n = P.N;
    const cell = SIZE / L();
    const bond = mode === 'bond';
    const s = cell * (bond ? 0.34 : dim === 3 ? 0.8 : 0.88);
    const keep = st.spanning ? -2 : st.largestRoot; // with "only": spanning cluster, else largest
    let nr = 0;
    let ns = 0;
    for (let i = 0; i < n; i++) {
      const r = P.root[i];
      if (r < 0) continue;
      const size = P.uf.size[r];
      if (bond && size < 2) continue;
      const isSpan = P.spanMark[i] === 1;
      if (only && !(keep === -2 ? isSpan : r === keep)) continue;
      if (isSpan) {
        writeMatrix(sArr, ns++, i, s);
      } else {
        writeMatrix(rArr, nr, i, s);
        clusterColor(r, size);
        cArr[nr * 3] = tmp.r;
        cArr[nr * 3 + 1] = tmp.g;
        cArr[nr * 3 + 2] = tmp.b;
        nr++;
      }
    }
    rest.count = nr;
    span.count = ns;
    rest.instanceMatrix.needsUpdate = true;
    rest.instanceColor!.needsUpdate = true;
    span.instanceMatrix.needsUpdate = true;

    if (bonds) {
      const dimN = dim;
      let nbw = 0;
      for (let i = 0; i < n; i++) {
        const r = P.root[i];
        const isSpan = P.spanMark[i] === 1;
        if (only && !(keep === -2 ? isSpan : r === keep)) continue;
        for (let a = 0; a < dimN; a++) {
          const e = i * dimN + a;
          if (!(P.rb[e] < p)) continue;
          const j = i + (a === 0 ? 1 : a === 1 ? L() : L() * L());
          const o = nbw * 6;
          bPos[o] = pos[i * 3]; bPos[o + 1] = pos[i * 3 + 1]; bPos[o + 2] = pos[i * 3 + 2];
          bPos[o + 3] = pos[j * 3]; bPos[o + 4] = pos[j * 3 + 1]; bPos[o + 5] = pos[j * 3 + 2];
          if (isSpan) tmp.setRGB(1.0, 0.8, 0.35);
          else clusterColor(r, P.uf.size[r]);
          bCol[o] = bCol[o + 3] = tmp.r;
          bCol[o + 1] = bCol[o + 4] = tmp.g;
          bCol[o + 2] = bCol[o + 5] = tmp.b;
          nbw++;
        }
      }
      const g = bonds.geometry;
      g.setDrawRange(0, nbw * 2);
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    // Spanning bookkeeping
    if (st.spanning && !wasSpanning) {
      flash = 1;
      if (sweeping) hold = HOLD;
    }
    wasSpanning = st.spanning;
    if (st.spanning && mode === 'site' && touched) {
      if (dim === 2) span2 = P.pSpan;
      else span3 = P.pSpan;
    }
    updateStatus();
  }

  let lastStatus = '';
  function updateStatus(): void {
    const st = P.stats;
    let t: string;
    if (st.spanning) t = `Spanning cluster: top joined to bottom (${(100 * st.spanSites / P.N).toFixed(1)}% of sites)`;
    else t = p < pc() ? 'No path from top to bottom yet' : 'Above the threshold, but this sample has not spanned yet';
    if (t !== lastStatus) {
      statusLab.element.textContent = t;
      statusLab.element.style.color = st.spanning ? GOLD : '';
      lastStatus = t;
    }
  }

  // --- Overlays
  const boxStyle = {
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute',
  };
  const inset = document.createElement('canvas');
  inset.className = 'pc-curve';
  inset.width = 460;
  inset.height = 340;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '230px', height: '170px' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function updateLegend(): void {
    const Ls = L();
    const lat = dim === 3 ? `${Ls}×${Ls}×${Ls} cubic` : `${Ls}×${Ls} square`;
    const what = mode === 'site'
      ? 'One cube is one occupied site. Sites that share a face belong to the same cluster.'
      : 'Lines are open bonds. Cubes are sites with at least one open bond. Linked sites form a cluster.';
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div>${what}</div>
<div style="margin-top:3px">Colour: one hue per cluster, brighter when bigger. <span style="color:${GOLD}">Gold</span>: a cluster joining the top and bottom faces.</div>
<div style="margin-top:3px;color:#8391ab">${lat} lattice, ${mode} percolation, open edges.</div>`;
  }

  function markVisited(a: number, b: number): void {
    const lo = Math.max(0, Math.floor(Math.min(a, b) * (K - 1)));
    const hi = Math.min(K - 1, Math.ceil(Math.max(a, b) * (K - 1)));
    for (let k = lo; k <= hi; k++) visited[k] = 1;
  }

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, H);
    const l = 56;
    const r = W - 18;
    const t = 50;
    const b = H - 50;
    const xOf = (x: number) => l + x * (r - l);
    const yOf = (y: number) => b - y * (b - t);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText('P∞ vs p', 16, 30);
    c.fillStyle = '#56627c';
    c.fillText(sweeping ? 'sweeping…' : oldCurves.length ? `+${oldCurves.length} earlier (grey)` : 'white: this sample', 170, 30);
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(l, t);
    c.lineTo(l, b);
    c.lineTo(r, b);
    c.stroke();
    c.fillStyle = '#56627c';
    for (const x of [0, 0.5, 1]) c.fillText(String(x), xOf(x) - (x === 0.5 ? 18 : 7), b + 26);
    c.fillText('1', l - 26, yOf(1) + 8);
    c.fillText('0', l - 26, yOf(0) + 8);
    c.fillText('p', r - 14, b - 10);
    // Upper bound P_inf <= p for site percolation
    if (mode === 'site') {
      c.strokeStyle = 'rgba(131,145,171,0.35)';
      c.setLineDash([3, 6]);
      c.beginPath();
      c.moveTo(xOf(0), yOf(0));
      c.lineTo(xOf(1), yOf(1));
      c.stroke();
      c.setLineDash([]);
    }
    // p_c marker
    const xc = xOf(pc());
    c.strokeStyle = ACCENT;
    c.setLineDash([6, 6]);
    c.beginPath();
    c.moveTo(xc, t - 6);
    c.lineTo(xc, b);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = ACCENT;
    c.fillText('pc', xc + 6, t + 14);
    // Earlier samples, faint
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(160,172,196,0.28)';
    for (const cv of oldCurves) {
      c.beginPath();
      for (let k = 0; k < K; k++) {
        const x = xOf(k / (K - 1));
        const y = yOf(cv[k]);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    // This sample, revealed where p has been visited
    c.strokeStyle = 'rgba(223,230,243,0.95)';
    c.lineWidth = 3;
    c.beginPath();
    let pen = false;
    for (let k = 0; k < K; k++) {
      if (!visited[k]) {
        pen = false;
        continue;
      }
      const x = xOf(k / (K - 1));
      const y = yOf(P.curve[k]);
      if (!pen) c.moveTo(x, y);
      else c.lineTo(x, y);
      pen = true;
    }
    c.stroke();
    // Spanning point of this sample, once reached
    if (p >= P.pSpan) {
      c.fillStyle = GOLD;
      const xs = xOf(P.pSpan);
      c.beginPath();
      c.moveTo(xs, b - 2);
      c.lineTo(xs - 8, b + 12);
      c.lineTo(xs + 8, b + 12);
      c.fill();
    }
    // Live point
    c.fillStyle = '#4fd1e8';
    c.beginPath();
    c.arc(xOf(p), yOf(P.stats.Pinf), 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8391ab';
  }

  // --- Parameter changes
  function rebuild(keepOld = false): void {
    if (keepOld) {
      oldCurves.push(P.curve.slice());
      if (oldCurves.length > MAX_OLD) oldCurves.shift();
    } else {
      oldCurves.length = 0;
    }
    P = new Percolation(dim, SIZES[dim][sizeIdx], mode, seed);
    visited.fill(0);
    markVisited(p, p);
    wasSpanning = false;
    layoutSites();
    updateLegend();
    dirty = true;
  }

  function setP(v: number, fromUser = true): void {
    markVisited(p, v);
    p = Math.min(1, Math.max(0, v));
    if (fromUser) {
      touched = true;
      if (sweeping) stopSweep();
    }
    pSlider.set(Math.round(p * 1000) / 1000, false);
    dirty = true;
  }

  function startSweep(): void {
    touched = true;
    sweeping = true;
    hold = 0;
    visited.fill(0);
    setP(0, false);
    visited.fill(0);
    sweepBtn.textContent = 'Stop sweep';
  }
  function stopSweep(): void {
    sweeping = false;
    sweepBtn.textContent = 'Sweep p';
  }

  function setDim(d: Dim): void {
    if (d === dim) return;
    dim = d;
    touched = true;
    if (sweeping) stopSweep();
    rebuild();
    layoutFrame();
    sizeSlider.set(sizeIdx, false);
    stage.flyTo(d === 3 ? CAM3 : CAM2, [0, d === 3 ? -0.6 : -0.4, 0], 1.1);
    dirty = true;
  }

  // --- Frame loop
  let slow = 0;
  stage.onFrame((dt) => {
    if (sweeping) {
      if (hold > 0) hold -= dt;
      else {
        const d = Math.abs(p - pc());
        const rate = SWEEP_RATE * (0.3 + 0.7 * Math.min(1, d / 0.07));
        const np = p + rate * dt;
        if (np >= 1) {
          setP(1, false);
          stopSweep();
        } else setP(np, false);
      }
    }
    if (dirty) {
      dirty = false;
      paint();
      updateReadouts();
      drawInset();
    }
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 0.9);
    }
    spanMat.emissiveIntensity = 0.45 + 1.8 * flash * flash;
    slow += dt;
    if (slow > 0.25) {
      slow = 0;
      drawInset();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Occupation probability');
  const pSlider = ui.slider({
    key: 'p', label: 'Probability p', min: 0, max: 1, step: 0.001, value: p,
    format: (v) => v.toFixed(3),
    onInput: (v) => setP(v),
  });
  const tick = document.createElement('div');
  Object.assign(tick.style, { position: 'relative', height: '14px', font: '10px JetBrains Mono, monospace', color: 'var(--c-thermo)' } as CSSStyleDeclaration);
  pSlider.el.appendChild(tick);
  function updateTick(): void {
    const v = pc();
    tick.innerHTML = `<span style="position:absolute;left:calc(7px + (100% - 14px) * ${v.toFixed(4)});transform:translateX(-50%);white-space:nowrap">▲ pc ≈ ${v === 0.5 ? '1/2' : v.toFixed(4)}</span>`;
  }
  updateTick();
  const [sweepBtn] = ui.buttons([
    { label: 'Sweep p', primary: true, key: 'sweep', onClick: () => (sweeping ? stopSweep() : startSweep()) },
    { label: 'Go to pc', key: 'pc', onClick: () => setP(pc()) },
    {
      label: 'Fractal cluster', key: 'only', onClick: () => {
        setP(Math.min(1, P.pSpan + 1e-6));
        onlyToggle.set(true);
      },
    },
  ]);
  const onlyToggle = ui.toggle({
    key: 'only', label: 'Show only the spanning (or largest) cluster', value: only,
    onChange: (v) => { only = v; dirty = true; },
  });
  ui.note('Sweep p fills the lattice slowly. Each site keeps its random number, so clusters only grow. The sweep slows near p<sub>c</sub> and pauses when a cluster first spans.');

  ui.section('Lattice');
  ui.select<'2' | '3'>({
    key: 'dim', label: 'Lattice', value: '3',
    options: [{ value: '2', label: '2D square' }, { value: '3', label: '3D cubic' }],
    onChange: (v) => { setDim(Number(v) as Dim); updateTick(); },
  });
  ui.select<Mode>({
    key: 'mode', label: 'Percolation type', value: mode,
    options: [{ value: 'site', label: 'Site' }, { value: 'bond', label: 'Bond' }],
    onChange: (v) => { mode = v; touched = true; if (sweeping) stopSweep(); rebuild(); updateTick(); },
  });
  const sizeSlider = ui.slider({
    key: 'L', label: 'Size L', min: 0, max: 3, step: 1, value: sizeIdx,
    format: (v) => {
      const n = SIZES[dim][v];
      return dim === 3 ? `${n}³ = ${(n * n * n).toLocaleString('en-US')}` : `${n}² = ${(n * n).toLocaleString('en-US')}`;
    },
    onInput: (v) => { sizeIdx = v; touched = true; if (sweeping) stopSweep(); rebuild(); },
  });
  ui.buttons([
    { label: 'New sample (seed)', key: 'seed', onClick: () => { seed++; touched = true; rebuild(true); } },
  ]);

  ui.section('Measurements');
  const rP = ui.readout('p', 'p');
  const rPc = ui.readout('pc', 'p_c (literature)');
  const rPinf = ui.readout('Pinf', 'P∞ = |C_max|/N');
  const rS = ui.readout('meanSize', 'mean cluster size S');
  const rN = ui.readout('clusters', 'clusters');
  const rSpan = ui.readout('spanning', 'spanning?');
  const rPs = ui.readout('pSpan', 'this sample spans at');
  const rChk = ui.readout('check', 'Σ sizes = occupied');
  ui.note('P∞ counts the largest cluster, spanning or not. S averages the other clusters, weighted by size. "Spans at" is the exact p where this sample first joins top to bottom.');

  function updateReadouts(): void {
    const st = P.stats;
    rP(p.toFixed(3));
    rPc(pc() === 0.5 ? '1/2 exact' : pc().toFixed(4));
    rPinf(st.Pinf.toFixed(4));
    rS(st.meanSize.toFixed(1));
    rN(st.clusters);
    rSpan(st.spanning ? 'yes' : 'no');
    rPs(P.pSpan.toFixed(4));
    rChk(st.sizeSum === st.occupied ? `✓ ${st.occupied}` : `✗ ${st.sizeSum} vs ${st.occupied}`);
  }

  // --- Start
  layoutFrame();
  layoutSites();
  updateLegend();
  markVisited(0, p);
  paint();
  updateReadouts();
  drawInset();
  dirty = false;

  return {
    state: () => ({
      p, dim, mode, L: L(), seed, touched, sweeping, only,
      pc: pc(),
      Pinf: P.stats.Pinf,
      meanSize: P.stats.meanSize,
      clusters: P.stats.clusters,
      spanning: P.stats.spanning,
      pSpan: P.pSpan,
      span2, span3,
    }),
    dispose: () => {
      inset.remove();
      legend.remove();
      tick.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'percolation',
  number: 43,
  title: 'Percolation',
  domain: 'thermo',
  level: 2,
  status: 'live',
  tagline: 'Add one more link and suddenly everything connects.',
  content,
  mount,
};

export default topic;
