import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  angularMomentum,
  ANISO_S,
  createSys,
  energy,
  ghostGap,
  GHOST_SHIFT,
  initSystem,
  makeGhost,
  MASSES,
  MAX_BODIES,
  momentum,
  scales,
  STEP,
  strength,
  symmetries,
  transformPoint,
  yoshidaStep,
  type GhostMode,
  type Params,
} from './physics.ts';

const BODY_COLORS = [PALETTE.rose, PALETTE.green, 0x7fa8ff, 0xf3e9d2];
const Q_COLORS = { E: PALETTE.amber, P: PALETTE.cyan, L: PALETTE.violet };
const DIM = 0x2a3246;
/** Simulation time units per real second at speed 1. */
const RATE = 1.5;
const MAX_STEPS = 600;
const TRAIL_CAP = 520;
const GHOST_TRAIL_CAP = 360;
const TRAIL_DS = 0.025;
/** Inset history: samples every SAMPLE_DT, WINDOW time units shown. */
const SAMPLE_DT = 0.05;
const SPARK_N = 600;
/** A drift below this counts as conserved (round-off). */
const FLAT = 1e-9;

const GHOST_LABEL: Record<GhostMode, string> = {
  time: 'Time shift',
  space: 'Space shift',
  rotation: 'Rotation',
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Line segments from a flat list of [x, y] pairs (pairs of points), in the ring's local XY plane. */
function segs(pts: number[], color: number): THREE.LineSegments {
  const arr = new Float32Array((pts.length / 2) * 3);
  for (let i = 0; i < pts.length / 2; i++) {
    arr[i * 3] = pts[i * 2];
    arr[i * 3 + 1] = pts[i * 2 + 1];
    arr[i * 3 + 2] = 0.01;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true }));
}

interface SymRing {
  group: THREE.Group;
  torus: THREE.Mesh;
  glow: THREE.Sprite;
  icon: THREE.Object3D;
  iconMats: THREE.LineBasicMaterial[];
  slash: THREE.LineSegments;
  label: HTMLElement;
  color: number;
  name: string;
  qty: string;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [0, 7.4, 8.2];
  const TARGET: [number, number, number] = [0, 0.3, -1.0];
  const stage = createStage(viewport, { camera: CAM, target: TARGET, fov: 45 });
  const { scene } = stage;

  // --- Parameters
  const p: Params = { pulse: true, field: true, aniso: false };
  let n = 3;
  let ghostMode: GhostMode = 'space';
  let speed = 1;
  let playing = true;

  // --- Arena
  const grid = makeGrid(12, 24);
  grid.position.y = -0.02;
  scene.add(grid);
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(4.3, 4.36, 128),
    new THREE.MeshBasicMaterial({ color: PALETTE.gridMajor, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
  );
  rim.rotation.x = -Math.PI / 2;
  scene.add(rim);

  // --- The external well: glowing level curves around the origin.
  const wellGroup = new THREE.Group();
  scene.add(wellGroup);
  const wellMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5 });
  const wellCore = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.8 }));
  wellCore.rotation.x = -Math.PI / 2;
  wellCore.position.y = 0.005;
  wellGroup.add(wellCore);
  stage.label('well', [0, 0.05, 0.4], 'muted', wellGroup);
  let contours: THREE.LineLoop[] = [];
  function buildContours(): void {
    for (const c of contours) {
      wellGroup.remove(c);
      c.geometry.dispose();
    }
    contours = [];
    const sy = p.aniso ? ANISO_S : 1;
    // Level curves of sqrt(x^2 + s y^2 + b^2): ellipses with semi-axes r and r / sqrt(s).
    for (const r of [0.45, 0.9, 1.5, 2.2, 3.0]) {
      const N = 96;
      const arr = new Float32Array(N * 3);
      for (let k = 0; k < N; k++) {
        const a = (2 * Math.PI * k) / N;
        const x = r * Math.cos(a);
        const y = (r / Math.sqrt(sy)) * Math.sin(a);
        arr[k * 3] = x;
        arr[k * 3 + 1] = 0.004;
        arr[k * 3 + 2] = -y;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const loop = new THREE.LineLoop(g, wellMat);
      wellGroup.add(loop);
      contours.push(loop);
    }
  }

  // --- Symmetry switches: three glowing rings at the back of the arena.
  const glowTex = glowTexture();
  const rings: SymRing[] = [];
  const ringDefs = [
    { name: 'time', qty: 'E', color: Q_COLORS.E, x: -3.3 },
    { name: 'space', qty: 'P', color: Q_COLORS.P, x: 0 },
    { name: 'rotation', qty: 'L', color: Q_COLORS.L, x: 3.3 },
  ];
  for (const d of ringDefs) {
    const group = new THREE.Group();
    group.position.set(d.x, 1.9, -4.4);
    group.rotation.x = -0.35;
    group.scale.setScalar(1.35);
    scene.add(group);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 16, 96), new THREE.MeshBasicMaterial({ color: d.color }));
    group.add(torus);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: d.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    glow.scale.setScalar(2.8);
    glow.position.z = -0.05;
    group.add(glow);
    const icon = new THREE.Group();
    group.add(icon);
    const iconMats: THREE.LineBasicMaterial[] = [];
    if (d.name === 'time') {
      // Clock face: 12 ticks and two hands. The long hand turns while time symmetry holds.
      const t: number[] = [];
      for (let k = 0; k < 12; k++) {
        const a = (2 * Math.PI * k) / 12;
        t.push(0.44 * Math.cos(a), 0.44 * Math.sin(a), 0.5 * Math.cos(a), 0.5 * Math.sin(a));
      }
      const ticks = segs(t, d.color);
      icon.add(ticks);
      const hand = segs([0, 0, 0, 0.4], d.color);
      hand.name = 'spin';
      icon.add(hand);
      const hand2 = segs([0, 0, 0.24, 0], d.color);
      icon.add(hand2);
      iconMats.push(ticks.material as THREE.LineBasicMaterial, hand.material as THREE.LineBasicMaterial, hand2.material as THREE.LineBasicMaterial);
    } else if (d.name === 'space') {
      // Two arrows pointing along the shift.
      const a = segs([-0.4, 0.12, 0.4, 0.12, 0.4, 0.12, 0.28, 0.22, 0.4, 0.12, 0.28, 0.02, -0.4, -0.14, 0.4, -0.14, 0.4, -0.14, 0.28, -0.04, 0.4, -0.14, 0.28, -0.24], d.color);
      a.name = 'slide';
      icon.add(a);
      iconMats.push(a.material as THREE.LineBasicMaterial);
    } else {
      // A circular arrow.
      const pts: number[] = [];
      const N = 30;
      for (let k = 0; k < N; k++) {
        const a0 = 0.3 + (k / N) * 1.6 * Math.PI;
        const a1 = 0.3 + ((k + 1) / N) * 1.6 * Math.PI;
        pts.push(0.36 * Math.cos(a0), 0.36 * Math.sin(a0), 0.36 * Math.cos(a1), 0.36 * Math.sin(a1));
      }
      const end = 0.3 + 1.6 * Math.PI;
      const ex = 0.36 * Math.cos(end);
      const ey = 0.36 * Math.sin(end);
      pts.push(ex, ey, ex + 0.13, ey - 0.02, ex, ey, ex + 0.03, ey + 0.13);
      const arc = segs(pts, d.color);
      arc.name = 'spin';
      icon.add(arc);
      iconMats.push(arc.material as THREE.LineBasicMaterial);
    }
    const slash = segs([-0.5, -0.5, 0.5, 0.5], PALETTE.red);
    slash.position.z = 0.03;
    group.add(slash);
    const lab = stage.label('', [0, -0.92, 0], 'muted', group);
    rings.push({ group, torus, glow, icon, iconMats, slash, label: lab.element, color: d.color, name: d.name, qty: d.qty });
  }

  function paintRings(): void {
    const sym = symmetries(p);
    const holds = [sym.time, sym.space, sym.rotation];
    const qtyName = ['E', 'P', 'L'];
    const symName = ['time shift', 'space shift', 'rotation'];
    rings.forEach((r, i) => {
      const on = holds[i];
      (r.torus.material as THREE.MeshBasicMaterial).color.set(on ? r.color : DIM);
      r.glow.visible = on;
      for (const m of r.iconMats) {
        m.color.set(on ? r.color : DIM);
        m.opacity = on ? 1 : 0.6;
      }
      r.slash.visible = !on;
      r.label.innerHTML = on
        ? `${symName[i]}: symmetric<br><b style="color:${css(r.color)}">${qtyName[i]} conserved</b>`
        : `${symName[i]}: broken<br><b style="color:${css(PALETTE.red)}">${qtyName[i]} not conserved</b>`;
      r.label.style.textAlign = 'center';
    });
  }

  // --- Bodies, ghosts, trails
  const sphereGeo = new THREE.SphereGeometry(1, 28, 18);
  const bodies: THREE.Object3D[] = [];
  const ghosts: THREE.Mesh[] = [];
  const marks: THREE.Mesh[] = [];
  const markMats: THREE.MeshBasicMaterial[] = [];
  const trails: Trail[] = [];
  const ghostTrails: Trail[] = [];
  const trailGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  scene.add(trailGroup, ghostGroup);
  const markGeo = new THREE.RingGeometry(0.2, 0.24, 40);
  for (let i = 0; i < MAX_BODIES; i++) {
    const r = 0.12 * Math.cbrt(MASSES[i]);
    const h = new THREE.Object3D();
    const core = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: BODY_COLORS[i], emissive: BODY_COLORS[i], emissiveIntensity: 0.5, roughness: 0.35 }));
    core.scale.setScalar(r);
    h.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: BODY_COLORS[i], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
    glow.scale.setScalar(r * 5);
    h.add(glow);
    scene.add(h);
    bodies.push(h);

    const g = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: BODY_COLORS[i], transparent: true, opacity: 0.35, depthWrite: false }));
    g.scale.setScalar(r);
    ghostGroup.add(g);
    ghosts.push(g);
    const mm = new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const mk = new THREE.Mesh(markGeo, mm);
    mk.rotation.x = -Math.PI / 2;
    ghostGroup.add(mk);
    marks.push(mk);
    markMats.push(mm);

    const tr = new Trail(TRAIL_CAP, BODY_COLORS[i], 0.95);
    trails.push(tr);
    trailGroup.add(tr.line);
    const gt = new Trail(GHOST_TRAIL_CAP, BODY_COLORS[i], 0.35);
    ghostTrails.push(gt);
    ghostGroup.add(gt.line);
  }
  // Pair "bonds": faint lines whose brightness follows the force strength f(t).
  const bondPos = new Float32Array(6 * 2 * 3);
  const bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute('position', new THREE.BufferAttribute(bondPos, 3));
  const bondMat = new THREE.LineBasicMaterial({ color: 0x9fb0d0, transparent: true, opacity: 0.25 });
  const bonds = new THREE.LineSegments(bondGeo, bondMat);
  bonds.frustumCulled = false;
  scene.add(bonds);

  const realLabel = stage.label('real system', [0, 0.55, 0], 'muted');
  const ghostLabel = stage.label('ghost', [0, 0.55, 0], 'muted');

  // --- Inset: E(t), P(t), L(t)
  const spark = document.createElement('canvas');
  spark.width = 480;
  spark.height = 330;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '240px', height: '165px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const hT = new Float64Array(SPARK_N);
  const hE = new Float64Array(SPARK_N);
  const hPx = new Float64Array(SPARK_N);
  const hPy = new Float64Array(SPARK_N);
  const hL = new Float64Array(SPARK_N);
  let hHead = 0;
  let hCount = 0;
  let nextSample = 0;

  // Legend, bottom-left, hidden on phones.
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '12px', bottom: '12px', zIndex: '2', pointerEvents: 'none',
    font: '500 12px/1.5 var(--sans, system-ui)', color: '#b8c3d8', background: 'rgba(7,10,18,0.72)',
    border: '1px solid #243049', borderRadius: '8px', padding: '6px 10px', maxWidth: '280px',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  // --- Simulation state
  const sim = createSys();
  const ghost = createSys();
  const Pv = new Float64Array(2);
  const tmp = new Float64Array(2);
  const lastPos = new Float64Array(MAX_BODIES * 2);
  const lastGhost = new Float64Array(MAX_BODIES * 2);
  let E0 = 0;
  let Px0 = 0;
  let Py0 = 0;
  let L0 = 0;
  let sc = { E: 1, P: 1, L: 1 };
  let eDrift = 0;
  let pDrift = 0;
  let lDrift = 0;
  let eNow = 0;
  let pxNow = 0;
  let pyNow = 0;
  let lNow = 0;
  let gap = 0;
  let acc = 0;

  function ghostDisplay(i: number, out: THREE.Vector3): THREE.Vector3 {
    let x = ghost.x[2 * i];
    let y = ghost.x[2 * i + 1];
    if (ghostMode === 'time') {
      x += GHOST_SHIFT[0];
      y += GHOST_SHIFT[1];
    }
    return out.set(x, 0, -y);
  }

  function markDisplay(i: number, out: THREE.Vector3): THREE.Vector3 {
    transformPoint(ghostMode, sim.x[2 * i], sim.x[2 * i + 1], tmp);
    let x = tmp[0];
    let y = tmp[1];
    if (ghostMode === 'time') {
      x += GHOST_SHIFT[0];
      y += GHOST_SHIFT[1];
    }
    return out.set(x, 0.003, -y);
  }

  function reset(): void {
    initSystem(sim, n);
    makeGhost(ghost, sim, ghostMode);
    E0 = energy(sim, p);
    momentum(sim, Pv);
    Px0 = Pv[0];
    Py0 = Pv[1];
    L0 = angularMomentum(sim);
    sc = scales(sim, p);
    eDrift = pDrift = lDrift = 0;
    gap = 0;
    acc = 0;
    hHead = hCount = 0;
    nextSample = 0;
    for (let i = 0; i < MAX_BODIES; i++) {
      const on = i < n;
      bodies[i].visible = on;
      ghosts[i].visible = on;
      marks[i].visible = on;
      trails[i].clear();
      ghostTrails[i].clear();
      trails[i].line.visible = on;
      ghostTrails[i].line.visible = on;
    }
    lastPos.set(sim.x);
    for (let i = 0; i < n; i++) {
      ghostDisplay(i, vA);
      lastGhost[2 * i] = vA.x;
      lastGhost[2 * i + 1] = vA.z;
    }
    wellGroup.visible = p.field;
    buildContours();
    paintRings();
    const gl: Record<GhostMode, string> = {
      space: `Faint: a ghost copy shifted ${GHOST_SHIFT[0]} to the right.`,
      rotation: 'Faint: a ghost copy turned 90° about the well centre.',
      time: 'Faint: a ghost copy on a clock started later (drawn shifted right).',
    };
    ghostLabel.element.textContent = ghostMode === 'space' ? 'ghost: shifted copy' : ghostMode === 'rotation' ? 'ghost: turned 90°' : 'ghost: later clock';
    legend.innerHTML =
      `<div>${gl[ghostMode]}</div>` +
      `<div>Small rings: where the symmetry says each ghost body must be.</div>`;
    measure();
    sample();
    place();
    drawSpark();
    updateReadouts();
  }

  function measure(): void {
    eNow = (energy(sim, p) - E0) / sc.E;
    momentum(sim, Pv);
    pxNow = (Pv[0] - Px0) / sc.P;
    pyNow = (Pv[1] - Py0) / sc.P;
    lNow = (angularMomentum(sim) - L0) / sc.L;
    const ae = Math.abs(eNow);
    const ap = Math.hypot(pxNow, pyNow);
    const al = Math.abs(lNow);
    if (ae > eDrift) eDrift = ae;
    if (ap > pDrift) pDrift = ap;
    if (al > lDrift) lDrift = al;
    gap = ghostGap(ghost, sim, ghostMode, tmp);
  }

  function sample(): void {
    hT[hHead] = sim.t;
    hE[hHead] = eNow;
    hPx[hHead] = pxNow;
    hPy[hHead] = pyNow;
    hL[hHead] = lNow;
    hHead = (hHead + 1) % SPARK_N;
    if (hCount < SPARK_N) hCount++;
  }

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  function place(): void {
    let cx = 0;
    let cz = 0;
    let gx = 0;
    let gz = 0;
    for (let i = 0; i < n; i++) {
      bodies[i].position.set(sim.x[2 * i], 0, -sim.x[2 * i + 1]);
      ghosts[i].position.copy(ghostDisplay(i, vA));
      marks[i].position.copy(markDisplay(i, vB));
      const off = vA.distanceTo(vB);
      markMats[i].color.set(off > 0.05 ? PALETTE.red : PALETTE.white);
      cx += sim.x[2 * i];
      cz -= sim.x[2 * i + 1];
      gx += vA.x;
      gz += vA.z;
    }
    realLabel.position.set(cx / n, 0.75, cz / n);
    ghostLabel.position.set(gx / n, 0.75, gz / n);
    // Bonds
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        bondPos[k++] = sim.x[2 * i];
        bondPos[k++] = 0;
        bondPos[k++] = -sim.x[2 * i + 1];
        bondPos[k++] = sim.x[2 * j];
        bondPos[k++] = 0;
        bondPos[k++] = -sim.x[2 * j + 1];
      }
    }
    bondGeo.setDrawRange(0, k / 3);
    (bondGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const f = strength(sim.t, p);
    bondMat.opacity = 0.12 + 0.28 * (f - 0.7) / 0.6;
    wellMat.opacity = 0.2 + 0.45 * (f - 0.7) / 0.6;
  }

  function trailPoints(): void {
    const d2 = TRAIL_DS * TRAIL_DS;
    for (let i = 0; i < n; i++) {
      const x = sim.x[2 * i];
      const y = sim.x[2 * i + 1];
      const dx = x - lastPos[2 * i];
      const dy = y - lastPos[2 * i + 1];
      if (dx * dx + dy * dy > d2) {
        lastPos[2 * i] = x;
        lastPos[2 * i + 1] = y;
        trails[i].push(x, 0.002, -y);
      }
      ghostDisplay(i, vA);
      const gx = vA.x - lastGhost[2 * i];
      const gz = vA.z - lastGhost[2 * i + 1];
      if (gx * gx + gz * gz > d2) {
        lastGhost[2 * i] = vA.x;
        lastGhost[2 * i + 1] = vA.z;
        ghostTrails[i].push(vA.x, 0.002, vA.z);
      }
    }
  }

  function advance(simDt: number): void {
    acc += simDt;
    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      yoshidaStep(sim, p, STEP);
      yoshidaStep(ghost, p, STEP);
      acc -= STEP;
      steps++;
      if ((steps & 3) === 0) trailPoints();
      if (sim.t >= nextSample) {
        measure();
        sample();
        nextSample = sim.t + SAMPLE_DT;
      }
    }
    if (steps === MAX_STEPS) acc = 0;
    trailPoints();
    measure();
  }

  // --- Inset drawing
  const rowsDef: { key: 'E' | 'P' | 'L'; label: string }[] = [
    { key: 'E', label: 'E energy' },
    { key: 'P', label: 'P momentum' },
    { key: 'L', label: 'L ang. mom.' },
  ];
  function drawSpark(): void {
    const W = spark.width;
    const H = spark.height;
    sctx.clearRect(0, 0, W, H);
    const rowH = (H - 10) / 3;
    const x0 = 14;
    const x1 = W - 14;
    const first = (hHead - hCount + SPARK_N) % SPARK_N;
    const tA = hCount > 0 ? hT[first] : 0;
    const tB = hCount > 0 ? hT[(hHead - 1 + SPARK_N) % SPARK_N] : 1;
    const span = Math.max(10, tB - tA);
    rowsDef.forEach((row, r) => {
      const top = 6 + r * rowH;
      const color = css(Q_COLORS[row.key]);
      const series = row.key === 'E' ? [hE] : row.key === 'P' ? [hPx, hPy] : [hL];
      let amp = 0;
      for (const s of series) for (let k = 0; k < hCount; k++) amp = Math.max(amp, Math.abs(s[(first + k) % SPARK_N]));
      const range = Math.max(0.05, amp * 1.15);
      const drift = row.key === 'E' ? eDrift : row.key === 'P' ? pDrift : lDrift;
      const flat = drift < FLAT;
      sctx.font = '600 22px JetBrains Mono, monospace';
      sctx.fillStyle = color;
      sctx.fillText(row.label, x0, top + 24);
      sctx.font = '20px JetBrains Mono, monospace';
      sctx.fillStyle = flat ? '#8391ab' : css(PALETTE.red);
      const txt = flat ? `flat · drift ${drift < 1e-15 ? '<1e-15' : drift.toExponential(0)}` : `changing · ${(drift * 100).toFixed(0)}%`;
      sctx.fillText(txt, x1 - sctx.measureText(txt).width, top + 24);
      const mid = top + 30 + (rowH - 38) / 2;
      const half = (rowH - 40) / 2;
      sctx.strokeStyle = '#243049';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(x0, mid);
      sctx.lineTo(x1, mid);
      sctx.stroke();
      series.forEach((s, si) => {
        if (hCount < 2) return;
        sctx.strokeStyle = color;
        sctx.globalAlpha = si === 0 ? 1 : 0.5;
        sctx.lineWidth = 3;
        sctx.beginPath();
        for (let k = 0; k < hCount; k++) {
          const idx = (first + k) % SPARK_N;
          const x = x0 + ((hT[idx] - tA) / span) * (x1 - x0);
          const y = mid - (s[idx] / range) * half;
          if (k === 0) sctx.moveTo(x, y);
          else sctx.lineTo(x, y);
        }
        sctx.stroke();
        sctx.globalAlpha = 1;
      });
    });
  }

  // --- Frame loop
  let uiTimer = 0;
  let clockAngle = 0;
  stage.onFrame((dt, time) => {
    if (playing) {
      advance(dt * speed * RATE);
      place();
    }
    // Animate the lit switches.
    const sym = symmetries(p);
    clockAngle += dt * 1.6;
    const clockHand = rings[0].icon.getObjectByName('spin');
    if (clockHand && sym.time) clockHand.rotation.z = -clockAngle;
    const slide = rings[1].icon.getObjectByName('slide');
    if (slide) slide.position.x = sym.space ? 0.06 * Math.sin(time * 2.2) : 0;
    const arc = rings[2].icon.getObjectByName('spin');
    if (arc && sym.rotation) arc.rotation.z = clockAngle * 0.7;
    for (const r of rings) if (r.glow.visible) r.glow.material.opacity = 0.45 + 0.15 * Math.sin(time * 2);
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      drawSpark();
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Symmetry breakers (each resets)');
  ui.toggle({ key: 'pulse', label: 'Pulsing strength f(t): breaks time symmetry', value: p.pulse, onChange: (v) => { p.pulse = v; reset(); } });
  ui.toggle({ key: 'field', label: 'Well at the origin: breaks space symmetry', value: p.field, onChange: (v) => { p.field = v; reset(); } });
  ui.toggle({ key: 'aniso', label: 'Squashed forces (non-central): breaks rotation symmetry', value: p.aniso, onChange: (v) => { p.aniso = v; reset(); } });
  ui.note('A round well keeps rotation symmetry about its centre. With squashed forces on, the well turns elliptical.');

  ui.section('System');
  ui.select<'2' | '3' | '4'>({
    key: 'n', label: 'Number of bodies', value: '3',
    options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }],
    onChange: (v) => { n = Number(v); reset(); },
  });
  ui.select<GhostMode>({
    key: 'ghost', label: 'Ghost copy', value: ghostMode,
    options: (Object.keys(GHOST_LABEL) as GhostMode[]).map((m) => ({ value: m, label: GHOST_LABEL[m] })),
    onChange: (v) => { ghostMode = v; reset(); },
  });

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rE = ui.readout('edrift', 'energy drift');
  const rP = ui.readout('pdrift', 'momentum drift');
  const rL = ui.readout('ldrift', 'ang. mom. drift');
  const rG = ui.readout('gap', 'ghost off its rings');
  ui.legend([
    { color: css(Q_COLORS.E), label: 'E, time ring' },
    { color: css(Q_COLORS.P), label: 'P, space ring' },
    { color: css(Q_COLORS.L), label: 'L, rotation ring' },
  ]);
  ui.note('Drifts are the largest change since reset, as a fraction of the natural scale. Below 1e-9 counts as conserved.');

  const sci = (v: number) => (v < 1e-15 ? '< 1e-15' : v < 1e-3 ? v.toExponential(1) : v.toFixed(3));
  function updateReadouts(): void {
    rT(sim.t.toFixed(1));
    rE(sci(eDrift));
    rP(sci(pDrift));
    rL(sci(lDrift));
    rG(sci(gap));
  }

  reset();

  return {
    state: () => ({
      t: sim.t,
      n,
      pulse: p.pulse,
      field: p.field,
      aniso: p.aniso,
      ghost: ghostMode,
      eDrift,
      pDrift,
      lDrift,
      gap,
      timeSym: !p.pulse,
      spaceSym: !p.field,
      rotSym: !p.aniso,
      speed,
    }),
    dispose: () => {
      spark.remove();
      legend.remove();
      markGeo.dispose();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'noether-theorem',
  number: 90,
  title: 'Noether’s Theorem',
  domain: 'foundations',
  level: 2,
  status: 'live',
  tagline: 'Every symmetry hides a conservation law.',
  content,
  mount,
};

export default topic;
