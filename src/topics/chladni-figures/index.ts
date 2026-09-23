import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  CIRCLE_RADIUS,
  SQUARE_SIDE,
  STEEL,
  approxOmega,
  bilinear,
  chladniApprox,
  circleModes,
  circleRadial,
  flexuralRigidity,
  hzPerOmega,
  modalResponse,
  nodeConcentration,
  rng32,
  sandStep,
  solveSquareFree,
  squareModeAt,
  squareModeGrid,
  beamTable,
  zeroContour,
  type CircleMode,
  type Edge,
  type SquareMode,
} from './physics.ts';

type Shape = 'square' | 'circle';
type Driver = 'bow' | 'shaker';

const G = 97; // field grid and square mesh resolution
const L = 5; // plate size in scene units (square side, circle diameter)
const FMIN = 40;
const FMAX = 1400;
const ZETA = 0.001; // modal damping ratio (Q = 500)
const H0 = 0.5; // calibrates drive so that hop ratio = plate acceleration / g
const MAX_SAND = 12000;
const VIS_F = 1.6; // slow-motion display frequency, Hz
const VIS_A = 0.38; // exaggerated display amplitude, scene units
const HOP_RATE = 60; // sand hops per second of wall time
const STEP = 0.0045;
const CREEP = 0.35; // sub-threshold rattling, as a fraction of the hop step
const CURVE_N = 520;
const LINE_CAP = 8000;
const RIM_R = 48;
const RIM_S = 144;

interface PlateMode {
  label: string;
  fHz: number;
  Omega: number;
  F: number;
  grid: Float32Array;
  vert: Float32Array;
  /** square: nodal-line pair and sign. circle: a = diameters, b = circles. */
  a: number;
  b: number;
  sign: number;
  src: SquareMode | CircleMode;
}

const fmtHz = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(3)} kHz` : `${f.toFixed(1)} Hz`);
const sToF = (s: number) => FMIN * Math.pow(FMAX / FMIN, s);
const fToS = (f: number) => Math.log(f / FMIN) / Math.log(FMAX / FMIN);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 9.0, 5.9], target: [-0.3, -1.1, 0.45], fov: 40 });
  const { scene } = stage;

  // --- State
  let shape: Shape = 'square';
  let edge: Edge = 'free';
  let driver: Driver = 'bow';
  let fCoarse = 0;
  let fine = 0;
  let freq = 0;
  let drive = 1;
  let sandCount = 6000;
  let showNodal = false;
  let showApprox = false;
  let touched = false;
  let calmTime = 0;
  let nodeRatio = 1;
  let movingFrac = 0;

  // --- Solve the plates once
  const squareSol = solveSquareFree(12, STEEL.nu, (FMAX * 1.03) / hzPerOmega(SQUARE_SIDE));
  const sqTable = beamTable(squareSol.basis, G);
  const hzSq = hzPerOmega(SQUARE_SIDE);
  const hzCi = hzPerOmega(CIRCLE_RADIUS);
  const Dval = flexuralRigidity(STEEL.E, STEEL.h, STEEL.nu);

  // Circle modes are cached per edge.
  const circleCache: Partial<Record<Edge, CircleMode[]>> = {};
  const getCircle = (e: Edge) => (circleCache[e] ??= circleModes(e, STEEL.nu, (FMAX * 1.03) / hzCi, 12));

  // --- Scene scaffolding
  const floor = makeGrid(18, 36);
  floor.position.y = -1.9;
  scene.add(floor);
  const plateGroup = new THREE.Group();
  scene.add(plateGroup);

  const plateMat = new THREE.MeshStandardMaterial({
    vertexColors: true, metalness: 0.45, roughness: 0.42, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  let plateGeo: THREE.BufferGeometry = new THREE.BufferGeometry();
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plateGroup.add(plate);
  let vU = new Float32Array(0);
  let vV = new Float32Array(0);
  let vr = new Float32Array(0);
  let vi = new Float32Array(0);
  let nV = 0;


  // Clamp ring for the clamped circle
  const clampRing = new THREE.Mesh(new THREE.TorusGeometry(L / 2 + 0.05, 0.09, 12, 120), new THREE.MeshStandardMaterial({ color: 0x5b6784, metalness: 0.7, roughness: 0.3 }));
  clampRing.rotation.x = Math.PI / 2;
  plateGroup.add(clampRing);

  // Field grids
  const Wr = new Float32Array(G * G);
  const Wi = new Float32Array(G * G);
  const absW = new Float32Array(G * G);
  const hop = new Float32Array(G * G);
  const mask = new Uint8Array(G * G);
  let modes: PlateMode[] = [];
  let omegas = new Float64Array(0);
  let forces = new Float64Array(0);
  let are = new Float64Array(0);
  let aim = new Float64Array(0);
  let hmax = 0;
  let wmax = 1;
  let domIdx = -1;
  let domShare = 0;
  let onRes = false;

  // Sand
  const sandU = new Float32Array(MAX_SAND);
  const sandV = new Float32Array(MAX_SAND);
  const sandPh = new Float32Array(MAX_SAND);
  const sandPos = new Float32Array(MAX_SAND * 3);
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
  (sandGeo.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const sand = new THREE.Points(sandGeo, new THREE.PointsMaterial({ color: 0xf5e2b8, size: 0.042, sizeAttenuation: true }));
  sand.frustumCulled = false;
  plateGroup.add(sand);
  const rand = rng32(20240923);

  // Nodal line overlays
  const segBuf = new Float32Array(LINE_CAP * 4);
  const makeLines = (color: number, opacity: number) => {
    const pos = new Float32Array(LINE_CAP * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, 0);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: true }));
    l.frustumCulled = false;
    l.visible = false;
    plateGroup.add(l);
    return { l, pos, g };
  };
  const exactLines = makeLines(0xffffff, 0.9);
  const approxLines = makeLines(PALETTE.amber, 0.95);
  const approxGrid = new Float32Array(G * G);

  // Driver: bow and shaker
  const bow = new THREE.Group();
  {
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x8a4b22, metalness: 0.2, roughness: 0.5 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 3.6, 10), stickMat);
    stick.position.set(0.14, 0, 0);
    bow.add(stick);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.012, 3.3, 0.07), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 }));
    hair.position.set(0.02, 0, 0);
    bow.add(hair);
    const frog = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.1), new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.6 }));
    frog.position.set(0.09, -1.62, 0);
    bow.add(frog);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 }));
    tip.position.set(0.08, 1.72, 0);
    bow.add(tip);
  }
  bow.rotation.z = -0.18;
  plateGroup.add(bow);
  const shaker = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x2b3450, metalness: 0.5, roughness: 0.4 }));
    body.position.y = -1.6;
    shaker.add(body);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.12, 0.12, 24), new THREE.MeshStandardMaterial({ color: PALETTE.amber, metalness: 0.3, roughness: 0.5 }));
    cone.position.y = -1.29;
    shaker.add(cone);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10), new THREE.MeshStandardMaterial({ color: 0xc9d2e3, metalness: 0.8, roughness: 0.25 }));
  shaker.add(rod);
  plateGroup.add(shaker);
  const driverLab = stage.label('bow', [0, 0, 0], 'muted', plateGroup);
  const statusLab = stage.label('', [0, 0.1, -L / 2 - 0.4], 'big', plateGroup);
  let driveU = 1;
  let driveV = 0.08;

  // --- Overlays
  const boxStyle = { position: 'absolute', background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none' };
  const inset = document.createElement('canvas');
  inset.className = 'ch-response';
  inset.width = 520;
  inset.height = 300;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '260px', height: '150px' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const MONO = 'JetBrains Mono, ui-monospace, monospace';

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan</span> and <span style="color:${css(PALETTE.rose)}">rose</span> show the plate moving up and down, slowed and exaggerated.</div>
<div style="margin-top:3px"><span style="color:#f5e2b8">Sand</span> is thrown wherever the plate shakes harder than gravity. It comes to rest on the <b style="color:#fff">nodal lines</b>, which stay still.</div>`;
  viewport.appendChild(legend);

  // =========================================================================
  // Building a plate
  // =========================================================================
  const colTmp = new THREE.Color();
  const cBase = new THREE.Color(0x5d6a86);
  const cPos = new THREE.Color(PALETTE.cyan);
  const cNeg = new THREE.Color(PALETTE.rose);

  function buildGeometry(): void {
    plate.geometry.dispose();
    if (shape === 'square') {
      plateGeo = new THREE.PlaneGeometry(L, L, G - 1, G - 1);
      plateGeo.rotateX(-Math.PI / 2);
    } else {
      const pos: number[] = [0, 0, 0];
      const idx: number[] = [];
      for (let i = 1; i <= RIM_R; i++) {
        const r = (i / RIM_R) * (L / 2);
        for (let j = 0; j < RIM_S; j++) {
          const th = (2 * Math.PI * j) / RIM_S;
          pos.push(r * Math.cos(th), 0, r * Math.sin(th));
        }
      }
      for (let j = 0; j < RIM_S; j++) idx.push(0, 1 + ((j + 1) % RIM_S), 1 + j);
      for (let i = 1; i < RIM_R; i++) {
        const a0 = 1 + (i - 1) * RIM_S;
        const b0 = 1 + i * RIM_S;
        for (let j = 0; j < RIM_S; j++) {
          const j1 = (j + 1) % RIM_S;
          idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
        }
      }
      plateGeo = new THREE.BufferGeometry();
      plateGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      plateGeo.setIndex(idx);
    }
    const pa = plateGeo.attributes.position as THREE.BufferAttribute;
    pa.setUsage(THREE.DynamicDrawUsage);
    nV = pa.count;
    plateGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nV * 3), 3));
    plateGeo.computeVertexNormals();
    plate.geometry = plateGeo;
    vU = new Float32Array(nV);
    vV = new Float32Array(nV);
    vr = new Float32Array(nV);
    vi = new Float32Array(nV);
    for (let i = 0; i < nV; i++) {
      vU[i] = Math.min(1, Math.max(0, pa.getX(i) / L + 0.5));
      vV[i] = Math.min(1, Math.max(0, pa.getZ(i) / L + 0.5));
    }
    clampRing.visible = shape === 'circle' && edge === 'clamped';
  }

  function buildModes(): void {
    const list: PlateMode[] = [];
    // mask
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const x = (2 * i) / (G - 1) - 1;
        const y = (2 * j) / (G - 1) - 1;
        mask[i * G + j] = shape === 'square' || x * x + y * y <= 1.0001 ? 1 : 0;
      }
    }
    if (shape === 'square') {
      for (const m of squareSol.modes) {
        const fHz = m.Omega * hzSq;
        if (fHz > FMAX * 1.03) continue;
        const grid = new Float32Array(G * G);
        squareModeGrid(m, squareSol.basis, sqTable, G, grid);
        list.push({ label: m.label, fHz, Omega: m.Omega, F: 0, grid, vert: new Float32Array(nV), a: m.m, b: m.n, sign: m.sign, src: m });
      }
    } else {
      const RT = 1200;
      const rad = new Float32Array(RT + 1);
      for (const m of getCircle(edge)) {
        const fHz = m.Omega * hzCi;
        if (fHz > FMAX * 1.03) continue;
        for (let k = 0; k <= RT; k++) rad[k] = circleRadial(m, (k / RT) * 1.5);
        const grid = new Float32Array(G * G);
        for (let i = 0; i < G; i++) {
          for (let j = 0; j < G; j++) {
            const x = (2 * i) / (G - 1) - 1;
            const y = (2 * j) / (G - 1) - 1;
            const r = Math.min(1.5, Math.hypot(x, y));
            const t = (r / 1.5) * RT;
            const k = Math.min(RT - 1, t | 0);
            const R = rad[k] + (rad[k + 1] - rad[k]) * (t - k);
            grid[i * G + j] = R * Math.cos(m.n * Math.atan2(y, x));
          }
        }
        list.push({ label: m.label, fHz, Omega: m.Omega, F: 0, grid, vert: new Float32Array(nV), a: m.n, b: m.s, sign: 0, src: m });
      }
    }
    for (const m of list) for (let i = 0; i < nV; i++) m.vert[i] = bilinear(m.grid, G, vU[i], vV[i]);
    modes = list;
    omegas = Float64Array.from(list.map((m) => m.fHz));
    forces = new Float64Array(list.length);
    are = new Float64Array(list.length);
    aim = new Float64Array(list.length);
    bowFor = -2;
  }

  /** Value of mode m at plate point (u, v). */
  function modeAt(m: PlateMode, u: number, v: number): number {
    if (m.src.kind === 'square') return squareModeAt(m.src, squareSol.basis, u, v);
    const dx = 2 * u - 1;
    const dy = 2 * v - 1;
    return circleRadial(m.src, Math.hypot(dx, dy)) * Math.cos(m.src.n * Math.atan2(dy, dx));
  }

  /**
   * Put the driver where it excites mode q best, as Chladni did when he chose
   * where to bow. The centre shaker cannot move. Recomputes forces and the curve.
   */
  let bowFor = -2;
  function aimDriver(q: number): void {
    const key = driver === 'shaker' ? -1 : q;
    if (key === bowFor) return;
    bowFor = key;
    if (driver === 'shaker') {
      driveU = 0.5;
      driveV = 0.5;
    } else if (shape === 'circle' && edge === 'free') {
      driveU = 1;
      driveV = 0.5;
    } else if (q >= 0) {
      const m = modes[q];
      let best = -1;
      if (shape === 'square') {
        for (let k = 0; k <= 60; k++) {
          const v = 0.04 + (0.92 * k) / 60;
          const a = Math.abs(modeAt(m, 1, v));
          if (a > best) { best = a; driveU = 1; driveV = v; }
        }
      } else {
        // A clamped rim cannot be bowed, so a point driver sits on the loudest radius.
        for (let k = 0; k <= 40; k++) {
          const r = 0.25 + (0.65 * k) / 40;
          const a = Math.abs(modeAt(m, (r + 1) / 2, 0.5));
          if (a > best) { best = a; driveU = (r + 1) / 2; driveV = 0.5; }
        }
      }
    }
    for (let k = 0; k < modes.length; k++) {
      modes[k].F = modeAt(modes[k], driveU, driveV);
      forces[k] = modes[k].F;
    }
    placeDriver();
    computeCurve();
  }

  function placeDriver(): void {
    const x = (driveU - 0.5) * L;
    const z = (driveV - 0.5) * L;
    const useBow = driver === 'bow' && !(shape === 'circle' && edge === 'clamped');
    bow.visible = useBow;
    shaker.visible = !useBow;
    if (useBow) {
      bow.position.set(x + 0.05, 0, z);
      driverLab.position.set(x + 0.55, 1.5, z);
      driverLab.element.textContent = 'bow';
    } else {
      shaker.position.set(x, 0, z);
      driverLab.position.set(x + 0.6, -1.3, z);
      driverLab.element.textContent = driver === 'shaker' ? 'shaker' : 'point driver';
    }
  }

  // Response curve: peak plate acceleration / g across the plate versus frequency (drive = 1)
  const curveF = new Float64Array(CURVE_N);
  const curveH = new Float64Array(CURVE_N);
  const coarse: number[] = [];
  for (let i = 0; i < G; i += 4) for (let j = 0; j < G; j += 4) coarse.push(i * G + j);
  function computeCurve(): void {
    const K = modes.length;
    const re = new Float64Array(K);
    const im = new Float64Array(K);
    const pts = coarse.filter((k) => mask[k]);
    // Resample exactly at each peak so the curve shows its true height.
    const fs: number[] = [];
    for (let i = 0; i < CURVE_N - K; i++) fs.push(sToF(i / (CURVE_N - K - 1)));
    for (const m of modes) fs.push(Math.min(FMAX, Math.max(FMIN, m.fHz)));
    fs.sort((a, b) => a - b);
    for (let n = 0; n < CURVE_N; n++) {
      const f = fs[n];
      modalResponse(omegas, forces, f, ZETA, re, im);
      let mx = 0;
      for (const k of pts) {
        let a = 0;
        let b = 0;
        for (let q = 0; q < K; q++) {
          a += re[q] * modes[q].grid[k];
          b += im[q] * modes[q].grid[k];
        }
        const w = a * a + b * b;
        if (w > mx) mx = w;
      }
      curveF[n] = f;
      curveH[n] = (2 * ZETA * f * f * Math.sqrt(mx)) / H0;
    }
  }

  // =========================================================================
  // Driven response at the current frequency
  // =========================================================================
  function computeResponse(): void {
    const K = modes.length;
    modalResponse(omegas, forces, freq, ZETA, are, aim);
    Wr.fill(0);
    Wi.fill(0);
    vr.fill(0);
    vi.fill(0);
    let tot = 0;
    let best = -1;
    let bestA = 0;
    for (let q = 0; q < K; q++) {
      const a2 = are[q] * are[q] + aim[q] * aim[q];
      tot += a2;
      if (a2 > bestA) {
        bestA = a2;
        best = q;
      }
      if (a2 < 1e-30) continue;
      const g = modes[q].grid;
      const ar = are[q];
      const ai = aim[q];
      for (let k = 0; k < G * G; k++) {
        Wr[k] += ar * g[k];
        Wi[k] += ai * g[k];
      }
      const vv = modes[q].vert;
      for (let k = 0; k < nV; k++) {
        vr[k] += ar * vv[k];
        vi[k] += ai * vv[k];
      }
    }
    domIdx = best;
    domShare = tot > 0 ? bestA / tot : 0;
    const scale = (drive * 2 * ZETA * freq * freq) / H0;
    let mx = 0;
    let wm = 0;
    for (let k = 0; k < G * G; k++) {
      const w = Math.hypot(Wr[k], Wi[k]);
      absW[k] = mask[k] ? w : 0;
      hop[k] = mask[k] ? w * scale : 0;
      if (mask[k]) {
        if (hop[k] > mx) mx = hop[k];
        if (w > wm) wm = w;
      }
    }
    hmax = mx;
    wmax = wm || 1;
    const dm = domIdx >= 0 ? modes[domIdx] : null;
    onRes = !!dm && hmax > 1 && domShare > 0.6 && Math.abs(freq - dm.fHz) / dm.fHz < 3 * ZETA;
    updateLines();
    updateStatus();
    drawInset();
    updateSound();
  }

  let linesFor = '';
  function updateLines(): void {
    const dm = domIdx >= 0 ? modes[domIdx] : null;
    const key = `${shape}|${edge}|${dm?.label ?? ''}|${showNodal}|${showApprox}`;
    if (key === linesFor) return;
    linesFor = key;
    exactLines.l.visible = showNodal && !!dm;
    approxLines.l.visible = showApprox && shape === 'square' && !!dm && (dm.a > 0 || dm.b > 0);
    if (exactLines.l.visible && dm) fillLines(exactLines, dm.grid, shape === 'circle' ? mask : null, 0.012);
    if (approxLines.l.visible && dm) {
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) approxGrid[i * G + j] = chladniApprox(dm.a, dm.b, dm.sign, i / (G - 1), j / (G - 1));
      fillLines(approxLines, approxGrid, null, 0.02);
    }
  }
  function fillLines(t: { pos: Float32Array; g: THREE.BufferGeometry }, grid: Float32Array, m: Uint8Array | null, y: number): void {
    const n = zeroContour(grid, G, m, segBuf);
    for (let s = 0; s < n; s++) {
      const o = s * 6;
      t.pos[o] = (segBuf[s * 4] - 0.5) * L;
      t.pos[o + 1] = y;
      t.pos[o + 2] = (segBuf[s * 4 + 1] - 0.5) * L;
      t.pos[o + 3] = (segBuf[s * 4 + 2] - 0.5) * L;
      t.pos[o + 4] = y;
      t.pos[o + 5] = (segBuf[s * 4 + 3] - 0.5) * L;
    }
    t.g.setDrawRange(0, n * 2);
    (t.g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function nearestMode(f: number): number {
    let best = -1;
    let bd = Infinity;
    for (let q = 0; q < modes.length; q++) {
      const d = Math.abs(Math.log(modes[q].fHz / f));
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  function modeName(m: PlateMode): string {
    return shape === 'square' ? m.label : `${m.label}: ${m.a} diameter${m.a === 1 ? '' : 's'}, ${m.b} circle${m.b === 1 ? '' : 's'}`;
  }

  function updateStatus(): void {
    const dm = domIdx >= 0 ? modes[domIdx] : null;
    let txt: string;
    if (onRes && dm) txt = `${fmtHz(freq)} · resonance ${shape === 'square' ? dm.label : `(${dm.a}, ${dm.b})`}`;
    else if (hmax > 1 && dm) txt = `${fmtHz(freq)} · near ${shape === 'square' ? dm.label : `(${dm.a}, ${dm.b})`}`;
    else txt = `${fmtHz(freq)} · between resonances: sand stays put`;
    if (statusLab.element.textContent !== txt) statusLab.element.textContent = txt;
  }

  // =========================================================================
  // Response inset
  // =========================================================================
  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, Hh);
    const x0 = 46;
    const x1 = W - 14;
    const yTop = 44;
    const yBot = Hh - 40;
    const LMIN = -2;
    const LMAX = 2;
    const X = (f: number) => x0 + (x1 - x0) * fToS(f);
    const Y = (h: number) => yBot - ((Math.log10(Math.max(1e-6, h)) - LMIN) / (LMAX - LMIN)) * (yBot - yTop);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('peak plate acceleration / g', 14, 28);
    // axes
    c.strokeStyle = '#2c3852';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, yTop - 6);
    c.lineTo(x0, yBot);
    c.lineTo(x1, yBot);
    c.stroke();
    c.font = `17px ${MONO}`;
    c.fillStyle = '#6b7894';
    for (const e of [-2, -1, 0, 1, 2]) {
      const y = Y(10 ** e);
      c.fillText(e === 0 ? '1' : `1e${e}`, 4, y + 6);
    }
    for (const f of [50, 100, 200, 500, 1000]) {
      const x = X(f);
      c.fillText(f >= 1000 ? '1k' : String(f), x - 12, yBot + 24);
      c.strokeStyle = '#1c2436';
      c.beginPath();
      c.moveTo(x, yTop);
      c.lineTo(x, yBot);
      c.stroke();
    }
    c.fillText('Hz', x1 - 26, yBot + 24);
    // threshold
    const yT = Y(1);
    c.strokeStyle = '#8a6a2a';
    c.setLineDash([8, 7]);
    c.beginPath();
    c.moveTo(x0, yT);
    c.lineTo(x1, yT);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = css(PALETTE.amber);
    c.fillText('sand hops above this line', x0 + 8, yT + 22);
    // curve
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 2.5;
    c.beginPath();
    for (let n = 0; n < CURVE_N; n++) {
      const x = X(curveF[n]);
      const y = Math.max(yTop - 4, Y(curveH[n] * drive));
      if (n === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // current frequency
    const xf = X(freq);
    c.strokeStyle = onRes ? css(PALETTE.green) : '#dfe6f3';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(xf, yTop - 6);
    c.lineTo(xf, yBot);
    c.stroke();
    c.fillStyle = onRes ? css(PALETTE.green) : '#dfe6f3';
    c.beginPath();
    c.arc(xf, Math.max(yTop - 4, Math.min(yBot, Y(hmax))), 6, 0, Math.PI * 2);
    c.fill();
  }

  // =========================================================================
  // Sand
  // =========================================================================
  function scatterSand(): void {
    for (let i = 0; i < MAX_SAND; i++) {
      let u: number;
      let v: number;
      do {
        u = rand();
        v = rand();
      } while (shape === 'circle' && (2 * u - 1) ** 2 + (2 * v - 1) ** 2 > 0.985);
      sandU[i] = u;
      sandV[i] = v;
      sandPh[i] = rand() * Math.PI * 2;
    }
    calmTime = 0;
    nodeRatio = 1;
  }

  // =========================================================================
  // Sound
  // =========================================================================
  let audio: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let soundOn = false;
  function setSound(on: boolean): void {
    soundOn = on;
    if (on && !audio) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      audio = new AC();
      osc = audio.createOscillator();
      osc.type = 'sine';
      gain = audio.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(audio.destination);
      osc.start();
    }
    if (audio && on && audio.state === 'suspended') void audio.resume();
    updateSound();
  }
  function updateSound(): void {
    if (!audio || !osc || !gain) return;
    const t = audio.currentTime;
    osc.frequency.setTargetAtTime(freq, t, 0.02);
    const g = soundOn ? 0.02 + 0.13 * Math.min(1, hmax / 3) : 0;
    gain.gain.setTargetAtTime(g, t, 0.05);
  }

  // =========================================================================
  // Rebuild and frequency setters
  // =========================================================================
  function rebuildPlate(): void {
    buildGeometry();
    buildModes();
    linesFor = '';
    scatterSand();
    computeResponse();
  }

  function setFreq(f: number, fromUser: boolean): void {
    freq = Math.min(FMAX, Math.max(FMIN, f));
    if (fromUser) touched = true;
    computeResponse();
    updateReadouts();
  }

  function snapTo(q: number): void {
    if (q < 0) return;
    aimDriver(q);
    const f = Math.min(FMAX, Math.max(FMIN, modes[q].fHz));
    fCoarse = f;
    fine = 0;
    freqCtl.set(fToS(f), false);
    fineCtl.set(0, false);
    setFreq(f, true);
  }

  // =========================================================================
  // Frame loop
  // =========================================================================
  let hopAcc = 0;
  let metricAcc = 0;
  let tVis = 0;
  let stroke = 0;
  stage.onFrame((dt) => {
    tVis += dt;
    const ph = 2 * Math.PI * VIS_F * tVis;
    const cp = Math.cos(ph);
    const sp = Math.sin(ph);
    const vis = (VIS_A * Math.min(1, Math.max(0.03, hmax / 2.5))) / wmax;
    // plate
    const pa = plate.geometry.attributes.position as THREE.BufferAttribute;
    const parr = pa.array as Float32Array;
    const carr = (plate.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const cs = 1 / VIS_A;
    for (let i = 0; i < nV; i++) {
      const y = vis * (vr[i] * cp - vi[i] * sp);
      parr[i * 3 + 1] = y;
      const f = Math.max(-1, Math.min(1, y * cs * 1.3));
      colTmp.copy(cBase).lerp(f >= 0 ? cPos : cNeg, Math.abs(f));
      carr[i * 3] = colTmp.r;
      carr[i * 3 + 1] = colTmp.g;
      carr[i * 3 + 2] = colTmp.b;
    }
    pa.needsUpdate = true;
    (plate.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    plate.geometry.computeVertexNormals();

    // sand hops at a fixed rate
    hopAcc += dt;
    let hops = 0;
    let moved = 0;
    while (hopAcc >= 1 / HOP_RATE && hops < 3) {
      hopAcc -= 1 / HOP_RATE;
      hops++;
      moved = hmax > 1 ? sandStep(sandU, sandV, sandCount, hop, G, shape === 'circle', STEP, rand, CREEP) : 0;
    }
    if (hops >= 3) hopAcc = 0;
    if (hops > 0) movingFrac = moved / sandCount;
    const t9 = tVis * 11;
    for (let i = 0; i < sandCount; i++) {
      const u = sandU[i];
      const v = sandV[i];
      const y = vis * (bilinear(Wr, G, u, v) * cp - bilinear(Wi, G, u, v) * sp);
      let b = 0;
      if (hmax > 1) {
        const h = bilinear(hop, G, u, v);
        if (h > 1) b = 0.035 * Math.min(2.5, h - 1) * Math.abs(Math.sin(t9 + sandPh[i]));
      }
      sandPos[i * 3] = (u - 0.5) * L;
      sandPos[i * 3 + 1] = y + 0.025 + b;
      sandPos[i * 3 + 2] = (v - 0.5) * L;
    }
    sandGeo.setDrawRange(0, sandCount);
    (sandGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // driver animation
    stroke += dt;
    if (bow.visible) bow.position.y = 0.35 * Math.sin(stroke * 1.4);
    else {
      const yd = vis * (bilinear(Wr, G, driveU, driveV) * cp - bilinear(Wi, G, driveU, driveV) * sp);
      const top = yd - 0.02;
      const bot = -1.23;
      rod.scale.y = Math.max(0.01, top - bot);
      rod.position.y = (top + bot) / 2;
    }

    // metrics
    if (hmax < 1) calmTime += dt;
    else calmTime = 0;
    metricAcc += dt;
    if (metricAcc > 0.25) {
      metricAcc = 0;
      nodeRatio = nodeConcentration(sandU, sandV, sandCount, absW, G, shape === "circle" ? mask : null, 0.1);
      updateReadouts();
    }
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('Drive');
  const freqCtl = ui.slider({
    key: 'freq', label: 'Frequency f', min: 0, max: 1, step: 0.00025, value: 0,
    format: (s) => fmtHz(sToF(s)),
    onInput: (s) => { fCoarse = sToF(s); setFreq(fCoarse * (1 + fine / 100), true); },
  });
  const fineCtl = ui.slider({
    key: 'freq', label: 'Fine tune', min: -1.5, max: 1.5, step: 0.01, value: 0, unit: '%',
    format: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
    onInput: (v) => { fine = v; setFreq(fCoarse * (1 + fine / 100), true); },
  });
  ui.buttons([
    { label: 'Snap to nearest mode', primary: true, key: 'freq', onClick: () => snapTo(nearestMode(freq)) },
    { label: '◀ prev', key: 'freq', onClick: () => { let q = -1; modes.forEach((m, i) => { if (m.fHz < freq * (1 - 2 * ZETA)) q = i; }); if (q >= 0) snapTo(q); } },
    { label: 'next ▶', key: 'freq', onClick: () => { const q = modes.findIndex((m) => m.fHz > freq * (1 + 2 * ZETA)); if (q >= 0) snapTo(q); } },
  ]);
  ui.slider({ key: 'drive', label: 'Drive strength', min: 0.3, max: 3, step: 0.05, value: drive, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { drive = v; touched = true; computeResponse(); } });
  const soundCtl = ui.toggle({ key: 'sound', label: 'Sound (sine at f)', value: false, onChange: (v) => setSound(v) });
  void soundCtl;

  ui.section('Plate');
  ui.select<Shape>({
    key: 'shape', label: 'Shape', value: shape,
    options: [{ value: 'square', label: 'Square' }, { value: 'circle', label: 'Circle' }],
    onChange: (v) => { shape = v; touched = true; showModeRows(); rebuildPlate(); snapTo(defaultModeIndex()); updateReadouts(); },
  });
  const edgeCtl = ui.select<Edge>({
    key: 'edge', label: 'Circle edge', value: edge,
    options: [{ value: 'free', label: 'Free' }, { value: 'clamped', label: 'Clamped' }],
    onChange: (v) => { edge = v; touched = true; if (shape === 'circle') { rebuildPlate(); snapTo(defaultModeIndex()); } updateReadouts(); },
  });
  ui.select<Driver>({
    key: 'driver', label: 'Driver', value: driver,
    options: [{ value: 'bow', label: 'Bow at edge' }, { value: 'shaker', label: 'Centre shaker' }],
    onChange: (v) => { driver = v; touched = true; bowFor = -2; aimDriver(nearestMode(freq)); linesFor = ''; computeResponse(); updateReadouts(); },
  });

  ui.section('Mode');
  let selA = 1;
  let selB = 3;
  let selSign = 1;
  let selD = 0;
  let selC = 1;
  const rowA = ui.slider({ key: 'mode', label: 'm (lines one way)', min: 0, max: 6, step: 1, value: selA, onInput: (v) => { selA = v; } });
  const rowB = ui.slider({ key: 'mode', label: 'n (lines the other way)', min: 0, max: 6, step: 1, value: selB, onInput: (v) => { selB = v; } });
  const rowS = ui.select<'+' | '−'>({ key: 'mode', label: 'Combination', value: '+', options: [{ value: '+', label: '(m,n) + (n,m)' }, { value: '−', label: '(m,n) − (n,m)' }], onChange: (v) => { selSign = v === '+' ? 1 : -1; } });
  const rowD = ui.slider({ key: 'mode', label: 'Nodal diameters', min: 0, max: 8, step: 1, value: selD, onInput: (v) => { selD = v; } });
  const rowC = ui.slider({ key: 'mode', label: 'Nodal circles', min: 0, max: 3, step: 1, value: selC, onInput: (v) => { selC = v; } });
  const modeNote = ui.note('');
  ui.buttons([{ label: 'Go to this mode', primary: true, key: 'mode', onClick: () => goToSelected() }]);

  function findSelected(): number {
    if (shape === 'square') {
      const a = Math.min(selA, selB);
      const b = Math.max(selA, selB);
      const sg = a === b ? 0 : selSign;
      return modes.findIndex((m) => m.a === a && m.b === b && m.sign === sg);
    }
    return modes.findIndex((m) => m.a === selD && m.b === selC);
  }
  function goToSelected(): void {
    const q = findSelected();
    if (q < 0) {
      const why = shape === 'square' && selA + selB <= 1 ? 'That is a rigid motion (no bending), so it has no pitch.' : 'That mode is outside the frequency range.';
      modeNote.textContent = why;
      return;
    }
    modeNote.textContent = '';
    snapTo(q);
  }
  function showModeRows(): void {
    const sq = shape === 'square';
    rowA.el.style.display = sq ? '' : 'none';
    rowB.el.style.display = sq ? '' : 'none';
    rowS.el.style.display = sq ? '' : 'none';
    rowD.el.style.display = sq ? 'none' : '';
    rowC.el.style.display = sq ? 'none' : '';
    edgeCtl.el.style.display = sq ? 'none' : '';
    approxCtl.el.style.display = sq ? '' : 'none';
    modeNote.textContent = '';
  }

  ui.section('Sand');
  ui.slider({ key: 'sand', label: 'Amount of sand', min: 1000, max: MAX_SAND, step: 500, value: sandCount, format: (v) => `${v} grains`, onInput: (v) => { sandCount = v; } });
  ui.buttons([{ label: 'Reset sand', key: 'sand', onClick: () => { touched = true; scatterSand(); } }]);
  ui.toggle({ key: 'nodal', label: 'Show computed nodal lines', value: showNodal, onChange: (v) => { showNodal = v; updateLines(); } });
  const approxCtl = ui.toggle({ key: 'approx', label: "Show Chladni's cos ± cos approximation", value: showApprox, onChange: (v) => { showApprox = v; updateLines(); } });

  ui.section('Readouts');
  const rMode = ui.readout('omega', 'nearest mode');
  const rOm = ui.readout('omega', 'Ω = ωa²√(ρh/D)');
  const rApprox = ui.readout('approx', 'cos ± cos estimate Ω');
  const rDet = ui.readout('freq', 'detuning');
  const rAcc = ui.readout('accel', 'peak accel / g');
  const rNode = ui.readout('sandnodes', 'sand at nodes');
  const rMove = ui.readout('sand', 'grains hopping');
  const rD = ui.readout('D', 'D = Eh³/12(1−ν²)');
  const rRho = ui.readout('rhoh', 'ρh');
  ui.note(`Steel plate, 1 mm thick: E = 200 GPa, ν = 0.3, ρ = 7850 kg/m³. Square side 24 cm, circle radius 12 cm. Damping ζ = ${ZETA}. The square uses a Ritz solution with 12 free-free beam functions each way. The circle uses exact Bessel solutions.`);

  function updateReadouts(): void {
    const q = nearestMode(freq);
    const m = q >= 0 ? modes[q] : null;
    rMode(m ? `${modeName(m)} at ${fmtHz(m.fHz)}` : '–');
    rOm(m ? `${m.Omega.toFixed(2)}${shape === 'circle' ? ` (λ = ${Math.sqrt(m.Omega).toFixed(3)})` : ''}` : '–');
    rApprox(m && shape === 'square' ? `${approxOmega(m.a, m.b).toFixed(1)} (${((approxOmega(m.a, m.b) / m.Omega - 1) * 100).toFixed(0)}%)` : 'square only');
    rDet(m ? `${(((freq - m.fHz) / m.fHz) * 100).toFixed(2)}% (width ±${(ZETA * 100).toFixed(1)}%)` : '–');
    rAcc(hmax.toFixed(2));
    rNode(`${nodeRatio.toFixed(2)}× uniform`);
    rMove(`${(movingFrac * 100).toFixed(0)}%`);
    rD(`${Dval.toFixed(1)} N·m`);
    rRho(`${(STEEL.rho * STEEL.h).toFixed(2)} kg/m²`);
  }

  function defaultModeIndex(): number {
    if (shape === 'square') {
      const q = modes.findIndex((m) => m.a === 1 && m.b === 3 && m.sign === 1);
      return q >= 0 ? q : 0;
    }
    return Math.min(modes.length - 1, 3);
  }

  // --- Start
  showModeRows();
  rebuildPlate();
  snapTo(defaultModeIndex());
  touched = false;
  updateReadouts();

  return {
    state: () => {
      const dm = domIdx >= 0 ? modes[domIdx] : null;
      return {
        shape, edge, driver, freq, drive, sandCount, touched, onRes,
        mode: dm ? dm.label : '', modeA: dm ? dm.a : -1, modeB: dm ? dm.b : -1, modeSign: dm ? dm.sign : 0,
        peakAccel: hmax, nodeRatio, calmTime, moving: movingFrac,
      };
    },
    dispose: () => {
      if (osc) {
        try { osc.stop(); } catch { /* already stopped */ }
      }
      if (audio) void audio.close();
      inset.remove();
      legend.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'chladni-figures',
  number: 64,
  title: 'Chladni Figures',
  domain: 'fluids',
  level: 1,
  status: 'live',
  tagline: 'Sand on a vibrating plate draws the shape of sound.',
  content,
  mount,
};

export default topic;
