import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { DT, GRID_L, GRID_N, KdV, phaseShifts, wrap } from './physics.ts';

type Mode = 'kdv' | 'linear';
type View = 'channel' | 'waterfall' | 'side';

const L = GRID_L;
const SX = 0.15; // scene units per physics unit along the channel
const HS = 0.95; // scene height per unit of u
const W = 1.2; // half width of the water channel
const FLOOR = -1.0; // channel bed
const BANK = 0.28; // height of the towpath bank
const COLS = GRID_N / 2; // waterfall columns
const ROWS = 150; // waterfall rows
const REC_STEPS = 75; // solver steps between waterfall rows
const REC = REC_STEPS * DT; // time units between waterfall rows
const WZ0 = -2.4; // z of the newest waterfall row
const WDZ = 0.075; // z spacing of waterfall rows
const WBASE = -1.0;
const WHS = 0.55; // waterfall height per unit of u
const HIST = 200; // inset samples
const SEP = 14; // physics units: "clearly apart" for two solitons
const MAX_STEPS = 90;

const CAM: Record<View, [number, number, number]> = {
  channel: [-4.2, 8, 15.4],
  waterfall: [0, 15, 3.2],
  side: [0, 0.3, 19.5],
};
const TGT: Record<View, [number, number, number]> = {
  channel: [-0.2, -1.1, -0.6],
  waterfall: [0, -1.2, -7.2],
  side: [0, 0.2, 0],
};

const COL1 = PALETTE.amber;
const COL2 = PALETTE.rose;

function stripIndex(m: number, flip = false): THREE.BufferAttribute {
  const idx = new Uint16Array((m - 1) * 6);
  for (let i = 0; i < m - 1; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.set(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c], i * 6);
  }
  return new THREE.BufferAttribute(idx, 1);
}

/** Height colour ramp for the spacetime surface: deep navy, cyan, white, amber (sRGB in, linear out). */
function ramp(v: number, shade: number, out: Float32Array, o: number): void {
  const s = Math.max(0, Math.min(1, v));
  let r: number, g: number, b: number;
  if (s < 0.3) {
    const f = s / 0.3;
    r = 0.05 + 0.1 * f; g = 0.1 + 0.45 * f; b = 0.22 + 0.5 * f;
  } else if (s < 0.65) {
    const f = (s - 0.3) / 0.35;
    r = 0.15 + 0.7 * f; g = 0.55 + 0.35 * f; b = 0.72 + 0.2 * f;
  } else {
    const f = (s - 0.65) / 0.35;
    r = 0.85 + 0.11 * f; g = 0.9 - 0.2 * f; b = 0.92 - 0.65 * f;
  }
  out[o] = (r * shade) ** 2.2;
  out[o + 1] = (g * shade) ** 2.2;
  out[o + 2] = (b * shade) ** 2.2;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.channel, target: TGT.channel, fov: 40 });
  const { scene } = stage;

  // --- Parameters
  let A1 = 1.2;
  let A2 = 0.3;
  let x1 = -35;
  let x2 = -15;
  let mode: Mode = 'kdv';
  let view: View = 'channel';
  let speed = 2.5;
  let playing = true;
  let touched = false;

  const sim = new KdV();
  const N = sim.n;
  const xs = new Float32Array(N);
  for (let j = 0; j < N; j++) xs[j] = sim.x[j] * SX;
  const halfX = (L / 2) * SX;

  // --- Channel furniture
  const stone = new THREE.MeshStandardMaterial({ color: 0x3a4458, roughness: 0.95, metalness: 0.05 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2 * halfX + 0.6, 0.18, 2 * W + 0.3), stone);
  bed.position.set(0, FLOOR - 0.09, 0);
  scene.add(bed);
  const bank = new THREE.Mesh(new THREE.BoxGeometry(2 * halfX + 0.6, BANK - FLOOR + 0.18, 0.9), stone);
  bank.position.set(0, (BANK + FLOOR - 0.18) / 2, -W - 0.45);
  scene.add(bank);
  const towpath = new THREE.Mesh(new THREE.BoxGeometry(2 * halfX + 0.6, 0.04, 0.9), new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 1 }));
  towpath.position.set(0, BANK + 0.02, -W - 0.45);
  scene.add(towpath);
  // Glass front so the wave profile is visible from the side.
  const glassEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * halfX + 0.6, 2.9, 0.001)),
    new THREE.LineBasicMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.6 }),
  );
  glassEdge.position.set(0, FLOOR + 1.45, W + 0.02);
  scene.add(glassEdge);

  // Water surface: one strip across the channel, updated in place.
  const surfPos = new Float32Array(N * 2 * 3);
  const surfNor = new Float32Array(N * 2 * 3);
  const surfCol = new Float32Array(N * 2 * 3);
  const surfGeo = new THREE.BufferGeometry();
  const surfPosAttr = new THREE.BufferAttribute(surfPos, 3).setUsage(THREE.DynamicDrawUsage);
  const surfNorAttr = new THREE.BufferAttribute(surfNor, 3).setUsage(THREE.DynamicDrawUsage);
  const surfColAttr = new THREE.BufferAttribute(surfCol, 3).setUsage(THREE.DynamicDrawUsage);
  surfGeo.setAttribute('position', surfPosAttr);
  surfGeo.setAttribute('normal', surfNorAttr);
  surfGeo.setAttribute('color', surfColAttr);
  surfGeo.setIndex(stripIndex(N, true));
  const surface = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.95,
  }));
  surface.frustumCulled = false;
  scene.add(surface);
  for (let j = 0; j < N; j++) {
    surfPos[j * 6] = xs[j];
    surfPos[j * 6 + 2] = W;
    surfPos[j * 6 + 3] = xs[j];
    surfPos[j * 6 + 5] = -W;
  }

  // Front face of the water body behind the glass.
  const facePos = new Float32Array(N * 2 * 3);
  const faceGeo = new THREE.BufferGeometry();
  const facePosAttr = new THREE.BufferAttribute(facePos, 3).setUsage(THREE.DynamicDrawUsage);
  faceGeo.setAttribute('position', facePosAttr);
  faceGeo.setIndex(stripIndex(N));
  const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ color: 0x1b6fa8, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
  face.frustumCulled = false;
  scene.add(face);
  const crestPos = new Float32Array(N * 3);
  const crestGeo = new THREE.BufferGeometry();
  const crestAttr = new THREE.BufferAttribute(crestPos, 3).setUsage(THREE.DynamicDrawUsage);
  crestGeo.setAttribute('position', crestAttr);
  const crest = new THREE.Line(crestGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan }));
  crest.frustumCulled = false;
  scene.add(crest);
  for (let j = 0; j < N; j++) {
    facePos[j * 6] = xs[j];
    facePos[j * 6 + 1] = FLOOR;
    facePos[j * 6 + 2] = W;
    facePos[j * 6 + 3] = xs[j];
    facePos[j * 6 + 5] = W;
    crestPos[j * 3] = xs[j];
    crestPos[j * 3 + 2] = W + 0.01;
  }

  // Still-water reference line on the glass.
  const still = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-halfX, 0, W + 0.02, halfX, 0, W + 0.02], 3)),
    new THREE.LineDashedMaterial({ color: 0x56627c, dashSize: 0.2, gapSize: 0.12 }),
  );
  still.computeLineDistances();
  scene.add(still);

  // Free-flight posts: where each soliton would be if it never met the other.
  const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10);
  const posts = [COL1, COL2].map((c) => {
    const m = new THREE.Mesh(postGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 }));
    m.position.set(0, BANK + 0.75, -W - 0.25);
    scene.add(m);
    return m;
  });
  const crestLabels = [COL1, COL2].map((c) => {
    const l = stage.label('', [0, 1, 0]);
    l.element.style.color = css(c);
    return l;
  });
  const dirLabel = stage.label('waves travel this way →', [halfX - 2.2, BANK + 0.25, -W - 0.5], 'muted');

  // --- Waterfall: u(x, t) as a spacetime surface behind the channel
  const wf = new THREE.Group();
  scene.add(wf);
  const wfPos = new Float32Array(ROWS * COLS * 3);
  const wfCol = new Float32Array(ROWS * COLS * 3);
  const wfGeo = new THREE.BufferGeometry();
  const wfPosAttr = new THREE.BufferAttribute(wfPos, 3).setUsage(THREE.DynamicDrawUsage);
  const wfColAttr = new THREE.BufferAttribute(wfCol, 3).setUsage(THREE.DynamicDrawUsage);
  wfGeo.setAttribute('position', wfPosAttr);
  wfGeo.setAttribute('color', wfColAttr);
  {
    const idx = new Uint32Array((ROWS - 1) * (COLS - 1) * 6);
    let o = 0;
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c;
        idx[o++] = a; idx[o++] = a + COLS; idx[o++] = a + 1;
        idx[o++] = a + 1; idx[o++] = a + COLS; idx[o++] = a + COLS + 1;
      }
    }
    wfGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const o = (r * COLS + c) * 3;
      wfPos[o] = xs[c * 2];
      wfPos[o + 1] = WBASE;
      wfPos[o + 2] = WZ0 - r * WDZ;
    }
  }
  const wfMesh = new THREE.Mesh(wfGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  wfMesh.frustumCulled = false;
  wf.add(wfMesh);
  const rowT = new Float64Array(ROWS).fill(NaN);
  // Free-flight lines drawn across the spacetime surface.
  const ffPos = [new Float32Array((ROWS - 1) * 2 * 3), new Float32Array((ROWS - 1) * 2 * 3)];
  const ffAttr = ffPos.map((a) => new THREE.BufferAttribute(a, 3).setUsage(THREE.DynamicDrawUsage));
  const ffLines = [COL1, COL2].map((c, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', ffAttr[i]);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
    l.frustumCulled = false;
    wf.add(l);
    return l;
  });
  const wfEnd = WZ0 - (ROWS - 1) * WDZ;
  const wfLabels = [
    stage.label('now', [halfX + 0.7, WBASE, WZ0], 'muted', wf),
    stage.label(`${(ROWS * REC).toFixed(0)} time units ago`, [halfX + 1.6, WBASE, wfEnd], 'muted', wf),
    stage.label('time ↑', [halfX + 0.8, WBASE, (WZ0 + wfEnd) / 2], 'muted', wf),
  ];
  void wfLabels;

  // --- Legend overlay (top left)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    const lin = mode === 'linear';
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${lin ? 'Linear waves: no 6uu<sub>x</sub>' : 'KdV: two solitons in a canal'}</div>
<div><span style="color:${css(COL1)}">■</span> soliton 1 &nbsp;<span style="color:${css(COL2)}">■</span> soliton 2</div>
${lin ? '<div>Without the steepening term, each hump spreads into ripples and sinks.</div>'
    : '<div>Posts on the bank mark where each hump would be if the other did not exist. After they meet, the tall one is ahead of its post and the small one behind.</div>'}
<div style="margin-top:3px;color:#8391ab">Frame moves with the still-water wave speed √(gh).</div>`;
  }

  // --- Conserved-quantity inset (top right)
  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 220;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '110px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const hM = new Float64Array(HIST);
  const hE = new Float64Array(HIST);
  const hP = new Float64Array(HIST);
  let hCount = 0;

  // --- Simulation bookkeeping
  let m0 = 1, e0 = 1, p0 = 1;
  let massDrift = 0, energyDrift = 0, peakRatio = 1;
  let acc = 0;
  let sinceRec = 0;
  const pk = new Float64Array(4);
  let nPeaks = 0;
  let bigIdx = 0; // which soliton (0 or 1) is the taller
  let cb = 0, cs = 0, xb = 0, xsm = 0, db = 0, ds = 0;
  let collisions = 0;
  let separated = false;
  let shiftBig = 0, shiftSmall = 0, shiftBigPred = 0, shiftSmallPred = 0;
  let survived = false;
  let speedMeas = 0;
  let speedValid = false;
  let prevX = NaN, prevT = 0;
  let ampLo = Infinity, ampHi = -Infinity;
  let everCollided = false;

  const two = () => A2 > 0 && Math.abs(A1 - A2) > 1e-6;

  function reset(): void {
    sim.linear = mode === 'linear';
    const list = [{ A: A1, x0: x1 }];
    if (A2 > 0) list.push({ A: A2, x0: x2 });
    sim.setSolitons(list);
    m0 = sim.mass();
    e0 = sim.energy();
    p0 = sim.maxU();
    acc = 0;
    sinceRec = 0;
    hCount = 0;
    collisions = 0;
    separated = false;
    survived = false;
    everCollided = false;
    speedMeas = 0;
    speedValid = false;
    prevX = NaN;
    shiftBig = shiftSmall = shiftBigPred = shiftSmallPred = 0;
    bigIdx = A2 > A1 ? 1 : 0;
    const Ab = Math.max(A1, A2), As = Math.min(A1, A2);
    cb = 2 * Ab;
    cs = 2 * As;
    xb = bigIdx === 0 ? x1 : x2;
    xsm = bigIdx === 0 ? x2 : x1;
    [db, ds] = two() ? phaseShifts(Ab, As) : [0, 0];
    for (let r = 0; r < ROWS; r++) {
      rowT[r] = NaN;
      for (let c = 0; c < COLS; c++) {
        const o = (r * COLS + c) * 3;
        wfPos[o + 1] = WBASE;
        ramp(0, 0.9, wfCol, o);
      }
    }
    record();
    measure();
    draw();
    paintLegend();
    drawInset();
  }

  function draw(): void {
    const u = sim.u;
    for (let j = 0; j < N; j++) {
      const y = u[j] * HS;
      const o = j * 6;
      surfPos[o + 1] = y;
      surfPos[o + 4] = y;
      const jp = j === N - 1 ? 0 : j + 1;
      const jm = j === 0 ? N - 1 : j - 1;
      const slope = ((u[jp] - u[jm]) * HS) / (2 * sim.dx * SX);
      const inv = 1 / Math.sqrt(1 + slope * slope);
      surfNor[o] = surfNor[o + 3] = -slope * inv;
      surfNor[o + 1] = surfNor[o + 4] = inv;
      surfNor[o + 2] = surfNor[o + 5] = 0;
      // Deep canal blue, whitening toward the crest.
      const f = Math.max(0, Math.min(1, u[j] / 1.6));
      const r = 0.1 + 0.75 * f * f, g = 0.42 + 0.48 * f, b = 0.7 + 0.25 * f;
      surfCol[o] = surfCol[o + 3] = r;
      surfCol[o + 1] = surfCol[o + 4] = g;
      surfCol[o + 2] = surfCol[o + 5] = b;
      facePos[o + 4] = y;
      crestPos[j * 3 + 1] = y;
    }
    surfPosAttr.needsUpdate = true;
    surfNorAttr.needsUpdate = true;
    surfColAttr.needsUpdate = true;
    facePosAttr.needsUpdate = true;
    crestAttr.needsUpdate = true;
  }

  function record(): void {
    // Shift heights and colours one row back, then write the newest row.
    for (let r = ROWS - 1; r > 0; r--) {
      const a = r * COLS * 3;
      const b = (r - 1) * COLS * 3;
      for (let c = 0; c < COLS; c++) wfPos[a + c * 3 + 1] = wfPos[b + c * 3 + 1];
    }
    wfCol.copyWithin(COLS * 3, 0, (ROWS - 1) * COLS * 3);
    rowT.copyWithin(1, 0, ROWS - 1);
    rowT[0] = sim.t;
    const u = sim.u;
    for (let c = 0; c < COLS; c++) {
      const j = c * 2;
      const v = u[j];
      wfPos[c * 3 + 1] = WBASE + v * WHS;
      const jn = (j + 2) % N;
      const shade = Math.max(0.6, Math.min(1.1, 0.92 + (u[jn] - v) * 1.6));
      ramp(v / 1.3, shade, wfCol, c * 3);
    }
    wfPosAttr.needsUpdate = true;
    wfColAttr.needsUpdate = true;
    // Free-flight lines
    const show = mode === 'kdv' && two();
    ffLines.forEach((l) => (l.visible = show));
    if (show) {
      for (let i = 0; i < 2; i++) {
        const A = i === 0 ? A1 : A2;
        const x0 = i === 0 ? x1 : x2;
        const c = 2 * A;
        const y = WBASE + A * WHS + 0.05;
        const a = ffPos[i];
        for (let r = 0; r < ROWS - 1; r++) {
          const o = r * 6;
          const t0 = rowT[r], t1 = rowT[r + 1];
          const X0 = wrap(x0 + c * t0, L) * SX;
          const X1 = wrap(x0 + c * t1, L) * SX;
          const ok = Number.isFinite(t1) && Math.abs(X1 - X0) < halfX;
          a[o] = X0; a[o + 1] = y; a[o + 2] = WZ0 - r * WDZ;
          a[o + 3] = ok ? X1 : X0; a[o + 4] = y; a[o + 5] = ok ? WZ0 - (r + 1) * WDZ : WZ0 - r * WDZ;
          if (!Number.isFinite(t0)) a[o + 3] = a[o] = 0;
        }
        ffAttr[i].needsUpdate = true;
      }
    }
    // Inset history
    if (hCount === HIST) {
      hM.copyWithin(0, 1);
      hE.copyWithin(0, 1);
      hP.copyWithin(0, 1);
      hCount--;
    }
    hM[hCount] = sim.mass() / m0;
    hE[hCount] = sim.energy() / e0;
    hP[hCount] = sim.maxU() / p0;
    hCount++;
  }

  function measure(): void {
    const t = sim.t;
    const mNow = sim.mass();
    const eNow = sim.energy();
    massDrift = Math.abs(mNow / m0 - 1);
    energyDrift = Math.abs(eNow / e0 - 1);
    peakRatio = sim.maxU() / p0;
    const As = Math.min(A1, A2);
    nPeaks = sim.peaks(A2 > 0 ? Math.max(0.05, 0.5 * As) : 0.05, 6, pk);
    const isTwo = mode === 'kdv' && two();
    separated = isTwo && nPeaks === 2 && Math.abs(wrap(pk[0] - pk[2], L)) >= SEP;
    // Collision count from free flight (ignoring the small shifts).
    if (isTwo) {
      const d0 = ((xsm - xb) % L + L) % L;
      const rel = (cb - cs) * t - d0;
      collisions = rel >= SEP ? Math.floor((rel - SEP) / L) + 1 : 0;
      if (collisions > 0) everCollided = true;
      shiftBigPred = wrap(collisions * db, L);
      shiftSmallPred = wrap(collisions * ds, L);
      if (separated) {
        shiftBig = wrap(pk[0] - (xb + cb * t), L);
        shiftSmall = wrap(pk[2] - (xsm + cs * t), L);
        survived = collisions > 0 && Math.abs(pk[1] / Math.max(A1, A2) - 1) < 0.03 && Math.abs(pk[3] / As - 1) < 0.03;
      }
    } else {
      collisions = 0;
    }
    // Crest speed of the tallest hump, when it is on its own.
    const single = mode === 'kdv' && A2 === 0 && nPeaks >= 1;
    if ((single || separated) && Number.isFinite(prevX) && t > prevT) {
      const dtm = t - prevT;
      const v = wrap(pk[0] - prevX, L) / dtm;
      const a = 1 - Math.exp(-dtm / 1.5);
      speedMeas = speedValid ? speedMeas + a * (v - speedMeas) : v;
      speedValid = true;
    } else if (!(single || separated)) {
      speedValid = false;
    }
    prevX = single || separated ? pk[0] : NaN;
    prevT = t;
    if (single && t > 4 && speedValid && Math.abs(speedMeas / (2 * A1) - 1) < 0.03) {
      ampLo = Math.min(ampLo, A1);
      ampHi = Math.max(ampHi, A1);
    }
  }

  function placeMarkers(): void {
    const kdv = mode === 'kdv';
    const isTwo = kdv && two();
    for (let i = 0; i < 2; i++) {
      const A = i === 0 ? A1 : A2;
      const x0 = i === 0 ? x1 : x2;
      posts[i].visible = isTwo && view !== 'waterfall';
      if (posts[i].visible) posts[i].position.x = wrap(x0 + 2 * A * sim.t, L) * SX;
    }
    // Crest labels: the tallest peak belongs to the taller soliton.
    const lab = [crestLabels[bigIdx], crestLabels[1 - bigIdx]];
    const showBoth = isTwo && separated;
    const showOne = kdv && (A2 === 0 || !isTwo) && nPeaks >= 1;
    lab[0].visible = showBoth || showOne;
    lab[1].visible = showBoth;
    if (lab[0].visible) lab[0].position.set(pk[0] * SX, pk[1] * HS + 0.45, 0);
    if (lab[1].visible) lab[1].position.set(pk[2] * SX, pk[3] * HS + 0.45, 0);
    if (!kdv && nPeaks >= 1) {
      lab[0].visible = true;
      lab[0].position.set(pk[0] * SX, pk[1] * HS + 0.45, 0);
    }
  }

  function labelText(): void {
    const lab = [crestLabels[bigIdx], crestLabels[1 - bigIdx]];
    if (mode === 'linear') {
      lab[0].element.textContent = `peak ${(peakRatio * 100).toFixed(0)}% of start`;
      return;
    }
    lab[0].element.textContent = `A ${pk[1].toFixed(2)} · c ${speedValid ? speedMeas.toFixed(2) : '…'}`;
    lab[1].element.textContent = `A ${pk[3].toFixed(2)}`;
  }

  function drawInset(): void {
    const Wc = inset.width;
    const Hc = inset.height;
    ictx.clearRect(0, 0, Wc, Hc);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('each quantity ÷ its start value', 16, 30);
    const top = 74, bot = Hc - 16;
    const yOf = (v: number) => bot - (Math.max(0, Math.min(1.3, v)) / 1.3) * (bot - top);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const v of [0, 0.5, 1]) {
      const y = yOf(v);
      ictx.beginPath();
      ictx.moveTo(12, y);
      ictx.lineTo(Wc - 60, y);
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(v.toFixed(1), Wc - 52, y + 7);
    }
    const series: [Float64Array, string, number][] = [
      [hP, css(PALETTE.rose), 3],
      [hE, css(PALETTE.amber), 3],
      [hM, css(PALETTE.cyan), 3],
    ];
    const n = hCount;
    if (n >= 2) {
      for (const [arr, col, lw] of series) {
        ictx.strokeStyle = col;
        ictx.lineWidth = lw;
        ictx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = 12 + (i / (HIST - 1)) * (Wc - 76);
          const y = yOf(arr[i]);
          if (i === 0) ictx.moveTo(x, y);
          else ictx.lineTo(x, y);
        }
        ictx.stroke();
      }
    }
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = css(PALETTE.cyan);
    ictx.fillText('mass', 16, 58);
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('energy', 90, 58);
    ictx.fillStyle = css(PALETTE.rose);
    ictx.fillText('peak height', 190, 58);
  }

  // --- Frame loop
  let labelTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      acc += dt * speed;
      let steps = Math.floor(acc / DT);
      if (steps > MAX_STEPS) {
        steps = MAX_STEPS;
        acc = 0;
      } else {
        acc -= steps * DT;
      }
      let dirty = false;
      let recorded = false;
      while (steps > 0) {
        const chunk = Math.min(steps, REC_STEPS - sinceRec);
        sim.step(chunk);
        steps -= chunk;
        sinceRec += chunk;
        dirty = true;
        if (sinceRec >= REC_STEPS) {
          sinceRec = 0;
          sim.sync();
          record();
          recorded = true;
        }
      }
      if (recorded) drawInset();
      if (dirty) {
        sim.sync();
        measure();
        draw();
      }
    }
    placeMarkers();
    labelTimer += dt;
    if (labelTimer > 0.25) {
      labelTimer = 0;
      labelText();
      updateReadouts();
    }
  });

  function applyView(fly = true): void {
    wf.visible = view === 'waterfall';
    dirLabel.visible = view !== 'waterfall';
    placeMarkers();
    if (fly) stage.flyTo(CAM[view], TGT[view]);
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.5, max: 6, step: 0.1, value: speed, format: (v) => `${v.toFixed(1)} t/s`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'channel', label: 'Canal' }, { value: 'waterfall', label: 'Waterfall u(x,t)' }, { value: 'side', label: 'Side' }],
    onChange: (v) => { view = v; applyView(); },
  });
  ui.select<Mode>({
    key: 'mode', label: 'Equation', value: mode,
    options: [{ value: 'kdv', label: 'KdV (nonlinear)' }, { value: 'linear', label: 'Linear only' }],
    onChange: (v) => { mode = v; touched = true; reset(); },
  });

  ui.section('Solitons (resets)');
  const fmtA = (v: number) => (v === 0 ? 'off' : v.toFixed(2));
  ui.slider({ key: 'A1', label: 'Height A₁', min: 0.2, max: 1.5, step: 0.05, value: A1, format: fmtA, onInput: (v) => { A1 = v; touched = true; reset(); } });
  ui.slider({ key: 'x1', label: 'Start x₁', min: -50, max: 50, step: 1, value: x1, onInput: (v) => { x1 = v; touched = true; reset(); } });
  ui.slider({ key: 'A2', label: 'Height A₂ (0 = off)', min: 0, max: 1.5, step: 0.05, value: A2, format: fmtA, onInput: (v) => { A2 = v; touched = true; reset(); } });
  ui.slider({ key: 'x2', label: 'Start x₂', min: -50, max: 50, step: 1, value: x2, onInput: (v) => { x2 = v; touched = true; reset(); } });
  ui.note('Units: KdV scaled units. The channel is 100 long and periodic, so a wave leaving on the right comes back on the left. Each soliton starts as the exact shape (A) sech²(√(A/2)(x − x₀)).');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rC = ui.readout('c', 'crest speed c');
  const rC2 = ui.readout('c2A', '2A (predicted c)');
  const rS1 = ui.readout('shift', 'shift, taller');
  const rS2 = ui.readout('shift2', 'shift, smaller');
  const rCol = ui.readout('collisions', 'collisions');
  const rM = ui.readout('mass', 'mass drift');
  const rE = ui.readout('energy', 'energy drift');
  const rP = ui.readout('peak', 'max u / start');
  ui.legend([
    { color: css(COL1), label: 'soliton 1' },
    { color: css(COL2), label: 'soliton 2' },
    { color: css(PALETTE.cyan), label: 'mass ∫u dx' },
    { color: css(PALETTE.amber), label: 'energy ∫u² dx' },
  ]);

  function updateReadouts(): void {
    rT(sim.t.toFixed(1));
    rC(mode === 'kdv' && speedValid ? speedMeas.toFixed(3) : '…');
    rC2((2 * Math.max(A1, A2)).toFixed(3));
    const isTwo = mode === 'kdv' && two();
    if (!isTwo) {
      rS1('n/a');
      rS2('n/a');
    } else if (separated && collisions > 0) {
      rS1(`${shiftBig.toFixed(2)} (pred ${shiftBigPred.toFixed(2)})`);
      rS2(`${shiftSmall.toFixed(2)} (pred ${shiftSmallPred.toFixed(2)})`);
    } else {
      rS1(collisions > 0 ? 'overlapping…' : `pred +${db.toFixed(2)}`);
      rS2(collisions > 0 ? 'overlapping…' : `pred ${ds.toFixed(2)}`);
    }
    rCol(isTwo ? collisions : 'n/a');
    rM(massDrift.toExponential(1));
    rE(energyDrift.toExponential(1));
    rP(peakRatio.toFixed(3));
  }

  reset();
  applyView(false);
  updateReadouts();

  return {
    state: () => ({
      t: sim.t,
      mode,
      view,
      A1,
      A2,
      x1,
      x2,
      touched,
      nPeaks,
      speedMeas: speedValid ? speedMeas : 0,
      speedPred: 2 * Math.max(A1, A2),
      collisions,
      everCollided,
      separated,
      survived,
      shiftBig,
      shiftBigPred,
      shiftSmall,
      shiftSmallPred,
      massDrift,
      energyDrift,
      peakRatio,
      ampLo: Number.isFinite(ampLo) ? ampLo : 0,
      ampHi: Number.isFinite(ampHi) ? ampHi : 0,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'solitons',
  number: 35,
  title: 'Solitons',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'Waves that pass through each other and come out unchanged.',
  content,
  mount,
};

export default topic;
