import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  G, M, T_FLIGHT, X_RANGE, classicalY, discreteAction, descendStep, safeStep, splineSample,
  travelTime, travelTimeSlope, fermatMinimum, rayAngles, snellTheta2, C_LIGHT, type FermatGeom,
  makeEnsemble, wiggleAt, partialExcess, pathSumStats, type Ensemble, type PathSumStats,
  mulberry32, twoSlitIntensity, twoSlitIncoherent, type SlitGeom,
} from './physics.ts';

type View = 'classical' | 'fermat' | 'feynman';

const DEG = 180 / Math.PI;
const TAU = Math.PI * 2;

// --- Classical view
const NSEG = 60;
const NODES = NSEG + 1;
const DT = T_FLIGHT / NSEG;
const KNOTS = 7; // including the two fixed ends
const DEFAULT_KNOTS = [0, 2.05, 2.95, 2.75, 1.85, 0.8, 0];
const ITER_PER_FRAME = 100;
const xOf = (t: number) => (t / T_FLIGHT) * X_RANGE - X_RANGE / 2;

// --- Fermat view
const FG: FermatGeom = { xa: -2.6, ya: 2.2, xb: 2.2, yb: -2.0, n1: 1, n2: 1.33 };
const X_STRAIGHT = FG.xa + ((FG.xb - FG.xa) * FG.ya) / (FG.ya - FG.yb);
const GHOSTS = 15;

// --- Feynman view
const P = 40; // nodes per drawn path
const N_MAX = 800;
const DS_MAX = 2; // J s, largest excess action in the ensemble
const ARROW_T = 3.2; // seconds for the stopwatches to run from A to B
const ARROW_HOLD = 1.6;
const SL: SlitGeom = { L1: 3, L2: 3, d: 0.8, w: 0.08, lambda: 0.16 };
const SLIT_Y = 1.2; // scene height of the slit axis
const LAMBDA_PER_HBAR = 0.08; // toy de Broglie relation lambda = 2 pi hbar / p
const SCREEN_PTS = 360;
const SCREEN_HALF = 2.2;

function mediumName(n: number): string {
  const near = (x: number) => Math.abs(n - x) < 0.02;
  const tag = near(1) ? ' (same as air)' : near(1.33) ? ' (water)' : near(1.5) ? ' (glass)' : near(2.42) || n > 2.39 ? ' (close to diamond)' : '';
  return `lower medium, n₂ = ${n.toFixed(2)}${tag}`;
}

const CAM: Record<View, [[number, number, number], [number, number, number]]> = {
  classical: [[0.3, 1.9, 9.6], [0, 1.25, 0]],
  fermat: [[0.2, 0.3, 9.4], [0, 0.05, 0]],
  feynman: [[-4.6, 3.4, 8.6], [0.4, 1.3, 0]],
};
const CAM_SLITS: [[number, number, number], [number, number, number]] = [[-4.8, 4.4, 10.2], [1.2, 1.2, 0]];

/** Phase colour wheel: 256 RGB entries. */
function phaseLut(): Float32Array {
  const lut = new Float32Array(256 * 3);
  const c = new THREE.Color();
  for (let i = 0; i < 256; i++) {
    c.setHSL(i / 256, 0.85, 0.58);
    lut[i * 3] = c.r;
    lut[i * 3 + 1] = c.g;
    lut[i * 3 + 2] = c.b;
  }
  return lut;
}
const phaseIndex = (ph: number) => {
  let u = (ph / TAU) % 1;
  if (u < 0) u += 1;
  return Math.min(255, Math.floor(u * 256));
};
const phaseCss = (ph: number) => {
  let u = (ph / TAU) % 1;
  if (u < 0) u += 1;
  return `hsl(${(u * 360).toFixed(0)},85%,58%)`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.classical[0], target: CAM.classical[1], fov: 42 });
  const { scene, camera, renderer, controls } = stage;
  const LUT = phaseLut();

  let view: View = 'classical';

  const matStd = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, ...extra });

  // =====================================================================
  // View 1: classical action of a projectile
  // =====================================================================
  const g1 = new THREE.Group();
  scene.add(g1);
  const grid1 = makeGrid(8, 16);
  grid1.rotation.x = Math.PI / 2;
  grid1.position.set(0, 1.5, -0.35);
  g1.add(grid1);
  {
    const ground = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3.8, 0, 0), new THREE.Vector3(3.8, 0, 0)]);
    g1.add(new THREE.Line(ground, new THREE.LineBasicMaterial({ color: 0x51607e })));
    for (let k = 0; k <= 4; k++) {
      const t = (k / 4) * T_FLIGHT;
      stage.label(`${t.toFixed(2)} s`, [xOf(t), -0.3, 0], 'muted', g1);
    }
    stage.label('time →   (the ball moves sideways at a steady speed, so x tracks t)', [0, -0.75, 0], 'muted', g1);
  }

  // Classical ghost path
  const ghostGeo = new THREE.BufferGeometry();
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * T_FLIGHT;
      pts.push(new THREE.Vector3(xOf(t), classicalY(t), -0.01));
    }
    ghostGeo.setFromPoints(pts);
  }
  const ghost = new THREE.Line(ghostGeo, new THREE.LineDashedMaterial({ color: PALETTE.cyan, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 }));
  ghost.computeLineDistances();
  g1.add(ghost);
  const ghostLabel = stage.label('true path (δS = 0)', [xOf(0.5 * T_FLIGHT), classicalY(0.5 * T_FLIGHT) + 0.28, 0], 'muted', g1);
  ghostLabel.element.style.color = css(PALETTE.cyan);

  // Trial path: beads at the discretisation nodes plus a line
  const ys = new Float64Array(NODES);
  const yCl = new Float64Array(NODES);
  for (let i = 0; i < NODES; i++) yCl[i] = classicalY(i * DT);
  const knots = new Float64Array(KNOTS);
  const splineScratch = new Float64Array(3 * KNOTS);
  const grad = new Float64Array(NODES);
  const trialPos = new Float32Array(NODES * 3);
  const trialGeo = new THREE.BufferGeometry();
  const trialAttr = new THREE.BufferAttribute(trialPos, 3).setUsage(THREE.DynamicDrawUsage);
  trialGeo.setAttribute('position', trialAttr);
  const trialLine = new THREE.Line(trialGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  trialLine.frustumCulled = false;
  g1.add(trialLine);
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.amber }), NODES);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  g1.add(beads);

  const handleGeo = new THREE.SphereGeometry(0.12, 24, 16);
  const pickGeo = new THREE.SphereGeometry(0.32, 10, 8);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const handleMat = matStd(PALETTE.rose, { emissive: 0x401024 });
  const handles: THREE.Mesh[] = [];
  const handlePicks: THREE.Mesh[] = [];
  for (let k = 1; k < KNOTS - 1; k++) {
    const h = new THREE.Mesh(handleGeo, handleMat);
    const pk = new THREE.Mesh(pickGeo, pickMat);
    pk.userData.knot = k;
    h.add(pk);
    handles.push(h);
    handlePicks.push(pk);
    g1.add(h);
  }
  const endMat = matStd(0xdfe6f3);
  for (const t of [0, T_FLIGHT]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), endMat);
    e.position.set(xOf(t), 0, 0);
    g1.add(e);
  }
  stage.label('launch (fixed)', [xOf(0) - 0.1, 0.35, 0], 'muted', g1);
  stage.label('landing (fixed)', [xOf(T_FLIGHT) + 0.1, 0.35, 0], 'muted', g1);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), matStd(0xffffff, { emissive: 0x333333 }));
  g1.add(ball);

  let relaxing = false;
  let relaxedOnce = false;
  let compared = false;
  let iter = 0;
  let S = 0;
  const Scl = discreteAction(yCl, DT);
  const hist = new Float32Array(400);
  let histN = 0;
  let histIterMax = 1;
  let ballT = 0;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);

  function pathFromKnots(): void {
    splineSample(knots, ys, splineScratch);
    ys[0] = 0;
    ys[NODES - 1] = 0;
  }
  function knotsFromPath(): void {
    for (let k = 1; k < KNOTS - 1; k++) knots[k] = ys[Math.round((k / (KNOTS - 1)) * NSEG)];
  }
  function drawTrial(): void {
    for (let i = 0; i < NODES; i++) {
      const x = xOf(i * DT);
      trialPos[i * 3] = x;
      trialPos[i * 3 + 1] = ys[i];
      trialPos[i * 3 + 2] = 0;
      m4.makeTranslation(x, ys[i], 0);
      beads.setMatrixAt(i, m4);
    }
    trialAttr.needsUpdate = true;
    beads.instanceMatrix.needsUpdate = true;
    trialGeo.computeBoundingSphere();
    for (let k = 1; k < KNOTS - 1; k++) handles[k - 1].position.set(xOf((k / (KNOTS - 1)) * T_FLIGHT), knots[k], 0.02);
    S = discreteAction(ys, DT);
  }
  function resetPath(): void {
    for (let k = 0; k < KNOTS; k++) knots[k] = DEFAULT_KNOTS[k];
    relaxing = false;
    pathFromKnots();
    drawTrial();
    histN = 0;
    iter = 0;
    insetDirty = true;
  }
  const dSrel = () => (S - Scl) / Math.abs(Scl);

  // =====================================================================
  // View 2: Fermat's principle at an air/water boundary
  // =====================================================================
  const g2 = new THREE.Group();
  scene.add(g2);
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(8, 2.8, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x1f5d9e, transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false }),
  );
  water.position.set(0, -1.4, -0.4);
  g2.add(water);
  {
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(water.geometry), new THREE.LineBasicMaterial({ color: 0x3f7fc0, transparent: true, opacity: 0.5 }));
    edge.position.copy(water.position);
    g2.add(edge);
    const grid2 = makeGrid(8, 16);
    grid2.rotation.x = Math.PI / 2;
    grid2.position.set(0, 0, -1.65);
    g2.add(grid2);
  }
  const labAir = stage.label('air, n₁ = 1.00', [-3.3, 0.35, 0], 'muted', g2);
  const labWater = stage.label('water, n₂ = 1.33', [-3.3, -0.35, 0], 'muted', g2);
  labAir.element.style.color = '#b8c3d9';
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), matStd(PALETTE.amber, { emissive: 0x6a4a10 }));
  lamp.position.set(FG.xa, FG.ya, 0);
  g2.add(lamp);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), matStd(PALETTE.cyan, { emissive: 0x0c3b44 }));
  target.position.set(FG.xb, FG.yb, 0);
  g2.add(target);
  stage.label('A: light source', [FG.xa, FG.ya + 0.35, 0], '', g2);
  stage.label('B: target', [FG.xb, FG.yb - 0.35, 0], '', g2);

  const ghostPos = new Float32Array(GHOSTS * 4 * 3);
  const ghostCol = new Float32Array(GHOSTS * 4 * 3);
  const ghostRays = new THREE.LineSegments(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(ghostPos, 3))
      .setAttribute('color', new THREE.BufferAttribute(ghostCol, 3)),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
  );
  ghostRays.frustumCulled = false;
  g2.add(ghostRays);
  const rayPos = new Float32Array(9);
  const rayAttr = new THREE.BufferAttribute(rayPos, 3).setUsage(THREE.DynamicDrawUsage);
  const ray = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', rayAttr), new THREE.LineBasicMaterial({ color: 0xffe08a }));
  ray.frustumCulled = false;
  g2.add(ray);
  const normalPos = new Float32Array(6);
  const normalAttr = new THREE.BufferAttribute(normalPos, 3);
  const normalLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', normalAttr), new THREE.LineDashedMaterial({ color: 0x9aa6bd, dashSize: 0.1, gapSize: 0.07 }));
  normalLine.frustumCulled = false;
  g2.add(normalLine);
  const crossing = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), handleMat);
  const crossPick = new THREE.Mesh(pickGeo, pickMat);
  crossPick.userData.cross = true;
  crossing.add(crossPick);
  g2.add(crossing);
  const labT1 = stage.label('θ₁', [0, 0.9, 0], '', g2);
  const labT2 = stage.label('θ₂', [0, -0.9, 0], '', g2);
  const labDrag = stage.label('drag me', [0, -0.35, 0], 'muted', g2);

  let xc = X_STRAIGHT;
  let xMin = fermatMinimum(FG);
  let fermatTouched = false;
  let fermatRelaxing = false;

  function drawFermat(): void {
    rayPos[0] = FG.xa; rayPos[1] = FG.ya; rayPos[2] = 0.01;
    rayPos[3] = xc; rayPos[4] = 0; rayPos[5] = 0.01;
    rayPos[6] = FG.xb; rayPos[7] = FG.yb; rayPos[8] = 0.01;
    rayAttr.needsUpdate = true;
    ray.geometry.computeBoundingSphere();
    normalPos[0] = xc; normalPos[1] = 1.6; normalPos[3] = xc; normalPos[4] = -1.6;
    normalAttr.needsUpdate = true;
    normalLine.computeLineDistances();
    crossing.position.set(xc, 0, 0.02);
    const [t1, t2] = rayAngles(xc, FG);
    labT1.position.set(xc + (xc > FG.xa ? -0.32 : 0.32), 0.75, 0);
    labT2.position.set(xc + (FG.xb > xc ? 0.32 : -0.32), -0.75, 0);
    labT1.element.textContent = `θ₁ ${(t1 * DEG).toFixed(1)}°`;
    labT2.element.textContent = `θ₂ ${(t2 * DEG).toFixed(1)}°`;
    labDrag.position.set(xc, -0.32, 0);
    labDrag.visible = !fermatTouched;
    insetDirty = true;
  }
  function buildGhosts(): void {
    const tMin = travelTime(xMin, FG);
    const lo = X_STRAIGHT - 2.6;
    const hi = X_STRAIGHT + 2.6;
    for (let i = 0; i < GHOSTS; i++) {
      const x = lo + ((hi - lo) * i) / (GHOSTS - 1);
      const ex = (travelTime(x, FG) - tMin) / tMin;
      const b = Math.max(0.12, 1 - ex * 18);
      ghostPos.set([FG.xa, FG.ya, -0.02, x, 0, -0.02, x, 0, -0.02, FG.xb, FG.yb, -0.02], i * 12);
      for (let k = 0; k < 4; k++) ghostCol.set([0.96 * b, 0.71 * b, 0.26 * b], i * 12 + k * 3);
    }
    ghostRays.geometry.attributes.position.needsUpdate = true;
    ghostRays.geometry.attributes.color.needsUpdate = true;
  }

  // =====================================================================
  // View 3: Feynman sum over paths
  // =====================================================================
  const g3 = new THREE.Group();
  scene.add(g3);
  const gFan = new THREE.Group();
  g3.add(gFan);
  const gSlit = new THREE.Group();
  g3.add(gSlit);
  {
    const floor = makeGrid(8, 16);
    floor.position.set(0, -0.35, 0);
    gFan.add(floor);
    const axis = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-3.4, -0.34, 1.9), 7, 0x8391ab, 0.25, 0.12);
    gFan.add(axis);
    stage.label('time t →', [3.4, -0.2, 2.1], 'muted', gFan);
    stage.label('height y', [-3.3, 2.9, 0], 'muted', gFan);
    stage.label('sideways z', [-3.2, -0.2, 1.5], 'muted', gFan);
  }
  const fanPos = new Float32Array(N_MAX * (P - 1) * 2 * 3);
  const fanCol = new Float32Array(N_MAX * (P - 1) * 2 * 3);
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute('position', new THREE.BufferAttribute(fanPos, 3));
  fanGeo.setAttribute('color', new THREE.BufferAttribute(fanCol, 3));
  const fan = new THREE.LineSegments(fanGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false }));
  fan.frustumCulled = false;
  gFan.add(fan);
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * T_FLIGHT;
      pts.push(new THREE.Vector3(xOf(t), classicalY(t), 0));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 100, 0.026, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }));
    tube.renderOrder = 3;
    gFan.add(tube);
    stage.label('classical path', [xOf(0.62 * T_FLIGHT), classicalY(0.62 * T_FLIGHT) - 0.35, 0], '', gFan);
    for (const t of [0, T_FLIGHT]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), endMat);
      e.position.set(xOf(t), 0, 0);
      gFan.add(e);
    }
    stage.label('A (t = 0)', [xOf(0) - 0.2, -0.05, 0.3], 'muted', gFan);
    stage.label('B (t = T)', [xOf(T_FLIGHT) + 0.2, -0.05, 0.3], 'muted', gFan);
  }

  // Stopwatch arrows
  const arrowGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6);
    shaft.translate(0, 0.075, 0);
    const head = new THREE.ConeGeometry(0.04, 0.08, 10);
    head.translate(0, 0.19, 0);
    const merged = mergeGeometries([shaft, head])!;
    shaft.dispose();
    head.dispose();
    return merged;
  })();
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial(), N_MAX + 1);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.frustumCulled = false;
  gFan.add(arrows);
  const tmpCol = new THREE.Color();

  // Slit apparatus (fixed geometry)
  {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.85 });
    const top = SLIT_Y + 3;
    const bot = SLIT_Y - 2.2;
    const edges = [bot, SLIT_Y - SL.d / 2 - SL.w / 2, SLIT_Y - SL.d / 2 + SL.w / 2, SLIT_Y + SL.d / 2 - SL.w / 2, SLIT_Y + SL.d / 2 + SL.w / 2, top];
    for (let i = 0; i < 3; i++) {
      const y0 = edges[i * 2];
      const y1 = edges[i * 2 + 1];
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, y1 - y0, 1.6), wallMat);
      b.position.set(0, (y0 + y1) / 2, 0);
      gSlit.add(b);
    }
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2 * SCREEN_HALF + 0.4), new THREE.MeshStandardMaterial({ color: 0x1a2336, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(SL.L2, SLIT_Y, 0);
    gSlit.add(screen);
    const src = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), matStd(PALETTE.amber, { emissive: 0x6a4a10 }));
    src.position.set(-SL.L1, SLIT_Y, 0);
    gSlit.add(src);
    stage.label('source', [-SL.L1, SLIT_Y + 0.35, 0], 'muted', gSlit);
    stage.label('two slits', [0, SLIT_Y + 3.2, 0], 'muted', gSlit);
    stage.label('screen: green curve = |Σ|²', [SL.L2, SLIT_Y - SCREEN_HALF - 0.45, 0], 'muted', gSlit);
  }
  const slitPos = new Float32Array(N_MAX * 4 * 3);
  const slitCol = new Float32Array(N_MAX * 4 * 3);
  const slitGeo = new THREE.BufferGeometry();
  slitGeo.setAttribute('position', new THREE.BufferAttribute(slitPos, 3));
  slitGeo.setAttribute('color', new THREE.BufferAttribute(slitCol, 3));
  const slitLines = new THREE.LineSegments(slitGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
  slitLines.frustumCulled = false;
  gSlit.add(slitLines);
  const curvePos = new Float32Array(SCREEN_PTS * 3);
  const curveAttr = new THREE.BufferAttribute(curvePos, 3);
  const curve = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', curveAttr), new THREE.LineBasicMaterial({ color: PALETTE.green }));
  curve.frustumCulled = false;
  gSlit.add(curve);
  const detector = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), matStd(PALETTE.rose, { emissive: 0x401024 }));
  gSlit.add(detector);
  const labP = stage.label('P', [0, 0, 0], '', detector);
  labP.position.set(0, 0.28, 0);

  let hbarLog = 0;
  let hbarTouched = false;
  let nPaths = 300;
  let seed = 11;
  let slits = false;
  let yP = 0;
  let ens: Ensemble = makeEnsemble(nPaths, seed, DS_MAX);
  let cumRe = new Float64Array(nPaths);
  let cumIm = new Float64Array(nPaths);
  let stats: PathSumStats = { coherence: 1, zone: 1, nearShare: 1, tail: 0.5 };
  const cumPhase = new Float64Array(N_MAX * P); // partial excess action at each node
  const pathXYZ = new Float32Array(N_MAX * P * 3);
  const wig = new Float64Array(2);
  const hbar = () => Math.pow(10, hbarLog);
  const undersampled = () => (2 * DS_MAX) / (nPaths * hbar()) > 1.2;
  let arrowClock = 0;
  // Slit-mode samples
  const slitYs = new Float64Array(N_MAX);
  const slitZs = new Float64Array(N_MAX);
  const slitPh = new Float64Array(N_MAX);
  const slitSc = new Float64Array(2);
  let slitAmp = 0;
  let fringesResolved = true;

  function buildFan(): void {
    ens = makeEnsemble(nPaths, seed, DS_MAX);
    cumRe = new Float64Array(nPaths);
    cumIm = new Float64Array(nPaths);
    for (let j = 0; j < nPaths; j++) {
      for (let p = 0; p < P; p++) {
        const t = (p / (P - 1)) * T_FLIGHT;
        wiggleAt(ens, j, t, wig);
        const o = (j * P + p) * 3;
        pathXYZ[o] = xOf(t);
        pathXYZ[o + 1] = classicalY(t) + wig[0];
        pathXYZ[o + 2] = wig[1];
        cumPhase[j * P + p] = p === P - 1 ? ens.dS[j] : partialExcess(ens, j, t, 24);
      }
    }
    let v = 0;
    for (let j = 0; j < nPaths; j++) {
      for (let p = 0; p < P - 1; p++) {
        const a = (j * P + p) * 3;
        fanPos[v++] = pathXYZ[a];
        fanPos[v++] = pathXYZ[a + 1];
        fanPos[v++] = pathXYZ[a + 2];
        fanPos[v++] = pathXYZ[a + 3];
        fanPos[v++] = pathXYZ[a + 4];
        fanPos[v++] = pathXYZ[a + 5];
      }
    }
    fanGeo.setDrawRange(0, nPaths * (P - 1) * 2);
    fanGeo.attributes.position.needsUpdate = true;
    arrows.count = nPaths;
    colourFan();
  }

  function colourFan(): void {
    const h = hbar();
    stats = pathSumStats(ens, h, cumRe, cumIm);
    const under = undersampled();
    const zone = under ? 1 : stats.zone;
    let v = 0;
    for (let j = 0; j < nPaths; j++) {
      const li = phaseIndex(ens.dS[j] / h) * 3;
      const dim = ens.rho[j] <= zone * 1.02 ? 1 : 0.22;
      const r = LUT[li] * dim;
      const g = LUT[li + 1] * dim;
      const b = LUT[li + 2] * dim;
      for (let k = 0; k < (P - 1) * 2; k++) {
        fanCol[v++] = r;
        fanCol[v++] = g;
        fanCol[v++] = b;
      }
    }
    fanGeo.attributes.color.needsUpdate = true;
    insetDirty = true;
  }

  function buildSlitPaths(): void {
    const rnd = mulberry32(seed * 7 + 3);
    const half = Math.floor(nPaths / 2);
    for (let j = 0; j < nPaths; j++) {
      const top = j < half;
      const i = top ? j : j - half;
      const cnt = top ? half : nPaths - half;
      slitYs[j] = (top ? SL.d / 2 : -SL.d / 2) + ((i + rnd()) / cnt - 0.5) * SL.w;
      slitZs[j] = (rnd() - 0.5) * 1.4;
    }
    let v = 0;
    for (let j = 0; j < nPaths; j++) {
      slitPos.set([-SL.L1, SLIT_Y, 0, 0, SLIT_Y + slitYs[j], slitZs[j], 0, SLIT_Y + slitYs[j], slitZs[j], SL.L2, SLIT_Y + yP, 0], v);
      v += 12;
    }
    slitGeo.setDrawRange(0, nPaths * 4);
    slitGeo.attributes.position.needsUpdate = true;
    colourSlitPaths();
  }

  function colourSlitPaths(): void {
    const k = TAU / SL.lambda;
    let re = 0;
    let im = 0;
    for (let j = 0; j < nPaths; j++) {
      const l1 = Math.hypot(SL.L1, slitYs[j], slitZs[j]);
      const l2 = Math.hypot(SL.L2, yP - slitYs[j], slitZs[j]);
      // Subtract the straight-line phase so colours do not flicker with the absolute path length.
      slitPh[j] = k * (l1 + l2 - SL.L1 - SL.L2);
      re += Math.cos(slitPh[j]);
      im += Math.sin(slitPh[j]);
      const li = phaseIndex(slitPh[j]) * 3;
      for (let q4 = 0; q4 < 4; q4++) {
        const o = j * 12 + q4 * 3;
        slitCol[o] = LUT[li];
        slitCol[o + 1] = LUT[li + 1];
        slitCol[o + 2] = LUT[li + 2];
      }
    }
    slitAmp = Math.hypot(re, im) / nPaths;
    slitGeo.attributes.color.needsUpdate = true;
    // Move the screen end of each path to the detector.
    for (let j = 0; j < nPaths; j++) slitPos[j * 12 + 10] = SLIT_Y + yP;
    slitGeo.attributes.position.needsUpdate = true;
    detector.position.set(SL.L2 - 0.02, SLIT_Y + yP, 0);
    insetDirty = true;
  }

  let curveDirty = true;
  const screenVals = new Float64Array(SCREEN_PTS);
  function buildScreenCurve(): void {
    const dy = (2 * SCREEN_HALF) / (SCREEN_PTS - 1);
    fringesResolved = (SL.lambda * SL.L2) / SL.d > 5 * dy;
    let Imax = 1e-9;
    const vals = screenVals;
    for (let i = 0; i < SCREEN_PTS; i++) {
      const y = -SCREEN_HALF + i * dy;
      vals[i] = fringesResolved ? twoSlitIntensity(y, SL, slitSc) : twoSlitIncoherent(y, SL, slitSc);
      Imax = Math.max(Imax, vals[i]);
    }
    for (let i = 0; i < SCREEN_PTS; i++) {
      curvePos[i * 3] = SL.L2 - 0.03;
      curvePos[i * 3 + 1] = SLIT_Y - SCREEN_HALF + i * dy;
      curvePos[i * 3 + 2] = -0.8 + 1.5 * (vals[i] / Imax);
    }
    curveAttr.needsUpdate = true;
    curveDirty = false;
  }

  function setHbar(): void {
    SL.lambda = LAMBDA_PER_HBAR * hbar(); // lambda = 2 pi hbar / p, with a fixed toy momentum p = 2 pi / 0.08
    colourFan();
    if (slits) {
      colourSlitPaths();
      curveDirty = true;
    }
  }

  function placeArrows(u: number): void {
    const h = hbar();
    const pf = u * (P - 1);
    const p0 = Math.min(P - 2, Math.floor(pf));
    const f = pf - p0;
    for (let j = 0; j < nPaths; j++) {
      const a = (j * P + p0) * 3;
      v3.set(
        pathXYZ[a] + (pathXYZ[a + 3] - pathXYZ[a]) * f,
        pathXYZ[a + 1] + (pathXYZ[a + 4] - pathXYZ[a + 1]) * f,
        pathXYZ[a + 2] + (pathXYZ[a + 5] - pathXYZ[a + 2]) * f,
      );
      const ph = (cumPhase[j * P + p0] + (cumPhase[j * P + p0 + 1] - cumPhase[j * P + p0]) * f) / h;
      q.setFromAxisAngle(xAxis, ph);
      m4.compose(v3, q, sc);
      arrows.setMatrixAt(j, m4);
      const li = phaseIndex(ph) * 3;
      const dim = undersampled() || ens.rho[j] <= stats.zone * 1.02 ? 1 : 0.3;
      tmpCol.setRGB(LUT[li] * dim, LUT[li + 1] * dim, LUT[li + 2] * dim);
      arrows.setColorAt(j, tmpCol);
    }
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  }

  // =====================================================================
  // Corner inset (one canvas, drawn per view)
  // =====================================================================
  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 340;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '170px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ic = inset.getContext('2d')!;
  let insetDirty = true;

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    ic.clearRect(0, 0, W, H);
    ic.font = '22px JetBrains Mono, monospace';
    ic.fillStyle = '#8391ab';
    if (view === 'classical') {
      ic.fillText('excess action ΔS / S_cl (log)', 16, 32);
      const x0 = 16;
      const x1 = W - 70;
      const yOf = (lg: number) => 96 + ((1 - Math.max(-6, Math.min(1, lg))) / 7) * (H - 136);
      ic.strokeStyle = '#243049';
      ic.lineWidth = 1;
      for (const lg of [0, -2, -4, -6]) {
        const y = yOf(lg);
        ic.beginPath();
        ic.moveTo(x0, y);
        ic.lineTo(x1, y);
        ic.stroke();
        ic.fillStyle = lg === -2 ? '#5ee39a' : '#56627c';
        ic.fillText(lg === -2 ? '1%' : `1e${lg}`, x1 + 8, y + 7);
      }
      const cur = Math.log10(Math.max(1e-7, dSrel()));
      if (histN > 1) {
        ic.strokeStyle = css(PALETTE.amber);
        ic.lineWidth = 3;
        ic.beginPath();
        for (let n = 0; n < histN; n++) {
          const x = x0 + (n / Math.max(90, histN - 1)) * (x1 - x0);
          const y = yOf(hist[n]);
          if (n === 0) ic.moveTo(x, y);
          else ic.lineTo(x, y);
        }
        ic.stroke();
        ic.fillStyle = '#8391ab';
        ic.fillText(`${histIterMax} gradient steps`, x0, H - 10);
      } else {
        ic.fillStyle = css(PALETTE.amber);
        ic.beginPath();
        ic.arc(x0 + 10, yOf(cur), 7, 0, TAU);
        ic.fill();
        ic.fillStyle = '#8391ab';
        ic.fillText('press Relax to descend', x0 + 28, yOf(cur) + 8);
      }
      ic.fillStyle = '#dfe6f3';
      ic.font = '600 26px JetBrains Mono, monospace';
      const pct = dSrel() * 100;
      ic.fillText(`now ${pct < 0.01 ? pct.toExponential(1) : pct.toFixed(pct < 10 ? 2 : 0)} %`, 16, 70);
    } else if (view === 'fermat') {
      ic.fillText('travel time vs crossing point', 16, 32);
      const lo = FG.xa;
      const hi = FG.xb;
      const tMin = travelTime(xMin, FG);
      const tMax = Math.max(travelTime(lo, FG), travelTime(hi, FG));
      const x0 = 20;
      const x1 = W - 20;
      const px = (x: number) => x0 + ((x - lo) / (hi - lo)) * (x1 - x0);
      const py = (t: number) => H - 40 - ((t - tMin) / (tMax - tMin)) * (H - 100);
      ic.strokeStyle = '#243049';
      ic.beginPath();
      ic.moveTo(x0, H - 40);
      ic.lineTo(x1, H - 40);
      ic.stroke();
      ic.strokeStyle = css(PALETTE.amber);
      ic.lineWidth = 3;
      ic.beginPath();
      for (let i = 0; i <= 120; i++) {
        const x = lo + ((hi - lo) * i) / 120;
        const y = py(travelTime(x, FG));
        if (i === 0) ic.moveTo(px(x), y);
        else ic.lineTo(px(x), y);
      }
      ic.stroke();
      ic.lineWidth = 2;
      ic.strokeStyle = css(PALETTE.green);
      ic.setLineDash([6, 6]);
      ic.beginPath();
      ic.moveTo(px(xMin), 50);
      ic.lineTo(px(xMin), H - 40);
      ic.stroke();
      ic.setLineDash([]);
      ic.fillStyle = css(PALETTE.green);
      ic.fillText('least time', Math.min(px(xMin) + 8, W - 130), 62);
      ic.fillStyle = css(PALETTE.rose);
      ic.beginPath();
      ic.arc(px(xc), py(travelTime(xc, FG)), 8, 0, TAU);
      ic.fill();
      ic.fillStyle = '#8391ab';
      const extra = (travelTime(xc, FG) - tMin) * 1e12;
      ic.fillText(`you: +${extra.toFixed(1)} ps`, 20, H - 10);
    } else if (!slits) {
      drawSpiral(W, H, nPaths, (j) => ens.dS[j] / hbar(), (j) => ens.rho[j] <= stats.zone * 1.02 || undersampled());
    } else {
      drawSpiral(W, H, nPaths, (j) => slitPh[j], () => true, Math.floor(nPaths / 2));
    }
  }

  /** Arrows tip to tail, one per path, in path order, plus the resultant. */
  function drawSpiral(W: number, H: number, n: number, phase: (j: number) => number, bright: (j: number) => boolean, split = -1): void {
    ic.fillText(slits ? 'arrows: slit 1, then slit 2' : 'phasor sum, closest paths first', 16, 32);
    // Bounds of the chain
    let x = 0;
    let y = 0;
    let xmin = 0;
    let xmax = 0;
    let ymin = 0;
    let ymax = 0;
    for (let j = 0; j < n; j++) {
      const ph = phase(j);
      x += Math.cos(ph);
      y += Math.sin(ph);
      xmin = Math.min(xmin, x);
      xmax = Math.max(xmax, x);
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
    const bx0 = 16;
    const by0 = 46;
    const bw = W - 32;
    const bh = H - 90;
    const s = Math.min(bw / Math.max(1e-6, xmax - xmin), bh / Math.max(1e-6, ymax - ymin)) * 0.92;
    const ox = bx0 + bw / 2 - ((xmin + xmax) / 2) * s;
    const oy = by0 + bh / 2 + ((ymin + ymax) / 2) * s;
    x = 0;
    y = 0;
    ic.lineWidth = 2;
    for (let j = 0; j < n; j++) {
      const ph = phase(j);
      const nx = x + Math.cos(ph);
      const ny = y + Math.sin(ph);
      ic.strokeStyle = split < 0 ? phaseCss(ph) : j < split ? css(PALETTE.cyan) : css(PALETTE.rose);
      ic.globalAlpha = bright(j) ? 1 : 0.35;
      ic.beginPath();
      ic.moveTo(ox + x * s, oy - y * s);
      ic.lineTo(ox + nx * s, oy - ny * s);
      ic.stroke();
      x = nx;
      y = ny;
    }
    ic.globalAlpha = 1;
    ic.strokeStyle = '#ffffff';
    ic.lineWidth = 3;
    ic.beginPath();
    ic.moveTo(ox, oy);
    ic.lineTo(ox + x * s, oy - y * s);
    ic.stroke();
    ic.fillStyle = '#ffffff';
    ic.beginPath();
    ic.arc(ox + x * s, oy - y * s, 6, 0, TAU);
    ic.fill();
    ic.fillStyle = '#8391ab';
    ic.fillText(`|Σ| / N = ${(Math.hypot(x, y) / n).toFixed(3)}   white = total`, 16, H - 10);
  }

  // =====================================================================
  // Legend overlay
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number | string, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${typeof c === 'number' ? css(c) : c}"></i>`;
  const wheel = `<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h},85%,58%)`).join(',')})"></div>`;
  function paintLegend(): void {
    const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;
    if (view === 'classical') {
      legend.innerHTML = head('Action of a thrown ball') + [
        `${sw(PALETTE.amber)}trial path, beads = time steps`,
        `${sw(PALETTE.rose)}handles: drag them up or down`,
        `${sw(PALETTE.cyan, false)}true path, the stationary point`,
        `${sw(0xffffff)}ball timing along the trial path`,
      ].join('<br/>');
    } else if (view === 'fermat') {
      legend.innerHTML = head('Least time, not least distance') + [
        `${sw(0xffe08a, false)}your ray A → boundary → B`,
        `${sw(PALETTE.amber, false)}other rays, bright = faster`,
        `${sw(PALETTE.rose)}crossing point: drag it`,
      ].join('<br/>');
    } else if (!slits) {
      legend.innerHTML = head('Every path, one arrow each') + `Colour = phase S/ħ of each path` + wheel + [
        `${sw(0xffffff, false)}classical path`,
        'Dim paths lie outside the zone where arrows still line up.',
      ].join('<br/>');
    } else {
      legend.innerHTML = head('Two slits as a path sum') + `Colour = phase of each path at P` + wheel + [
        `${sw(PALETTE.green, false)}intensity |Σ|² along the screen`,
        `${sw(PALETTE.rose)}detector point P`,
        `inset: ${sw(PALETTE.cyan, false)}slit 1 arrows ${sw(PALETTE.rose, false)}slit 2 arrows`,
      ].join('<br/>');
    }
  }

  // =====================================================================
  // Dragging
  // =====================================================================
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPt = new THREE.Vector3();
  const hits: THREE.Intersection[] = [];
  let dragKnot = -1;
  let dragCross = false;

  function pick(ev: PointerEvent): THREE.Object3D | null {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    hits.length = 0;
    if (view === 'classical') raycaster.intersectObjects(handlePicks, false, hits);
    else if (view === 'fermat') raycaster.intersectObject(crossPick, false, hits);
    return hits.length ? hits[0].object : null;
  }
  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0 || view === 'feynman') return;
    const o = pick(ev);
    if (!o) return;
    ev.stopPropagation();
    if (o.userData.cross) {
      dragCross = true;
      fermatRelaxing = false;
    } else {
      dragKnot = o.userData.knot as number;
      relaxing = false;
    }
    controls.enabled = false;
    renderer.domElement.setPointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (ev: PointerEvent) => {
    if (dragKnot < 0 && !dragCross) {
      if (ev.buttons === 0 && view !== 'feynman') renderer.domElement.style.cursor = pick(ev) ? 'grab' : '';
      return;
    }
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPt)) return;
    if (dragKnot > 0) {
      knots[dragKnot] = Math.max(-1.5, Math.min(5, hitPt.y));
      pathFromKnots();
      drawTrial();
      insetDirty = true;
      if (relaxedOnce && dSrel() > 0.25) compared = true;
    } else if (dragCross) {
      xc = Math.max(FG.xa + 0.05, Math.min(FG.xb - 0.05, hitPt.x));
      fermatTouched = true;
      drawFermat();
    }
  };
  const onUp = (ev: PointerEvent) => {
    if (dragKnot < 0 && !dragCross) return;
    dragKnot = -1;
    dragCross = false;
    controls.enabled = true;
    if (renderer.domElement.hasPointerCapture(ev.pointerId)) renderer.domElement.releasePointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = '';
  };
  viewport.addEventListener('pointerdown', onDown, { capture: true });
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);

  // =====================================================================
  // Controls
  // =====================================================================
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Principle', value: view,
    options: [{ value: 'classical', label: 'Least action' }, { value: 'fermat', label: 'Fermat' }, { value: 'feynman', label: 'Feynman' }],
    onChange: (v) => setView(v),
  });

  ui.section('Classical path');
  const sec1 = ui.root.lastElementChild as HTMLElement;
  ui.buttons([
    { label: 'Relax', primary: true, key: 'relax', onClick: () => startRelax() },
    { label: 'Reset path', onClick: () => resetPath() },
  ]);
  ui.toggle({ key: 'ghost', label: 'Show true path', value: true, onChange: (v) => { ghost.visible = v; ghostLabel.visible = v; } });
  const rS = ui.readout('S', 'action S', 'J·s');
  const rScl = ui.readout('Scl', 'S of true path', 'J·s');
  const rdS = ui.readout('dS', 'excess ΔS / S_cl');
  const rIter = ui.readout('iter', 'descent steps');
  ui.note('Drag the pink handles. Relax runs plain gradient descent on all 59 free beads at once.');

  ui.section('Fermat: light across a boundary');
  const sec2 = ui.root.lastElementChild as HTMLElement;
  ui.slider({
    key: 'n', label: 'Refractive index n₂', min: 1, max: 2.4, step: 0.01, value: FG.n2,
    onInput: (v) => { FG.n2 = v; xMin = fermatMinimum(FG); labWater.element.textContent = mediumName(v); buildGhosts(); drawFermat(); },
  });
  ui.buttons([
    { label: 'Slide to least time', primary: true, key: 'relaxF', onClick: () => { fermatRelaxing = true; fermatTouched = true; } },
    { label: 'Straight line', onClick: () => { fermatRelaxing = false; xc = X_STRAIGHT; drawFermat(); } },
  ]);
  const rTime = ui.readout('time', 'travel time', 'ns');
  const rSnell1 = ui.readout('snellL', 'n₁ sin θ₁');
  const rSnell2 = ui.readout('snellR', 'n₂ sin θ₂');
  const rSnellErr = ui.readout('snellErr', 'θ₂ vs Snell');

  ui.section('Feynman: sum over paths');
  const sec3 = ui.root.lastElementChild as HTMLElement;
  ui.slider({
    key: 'hbar', label: 'ħ (toy units, log scale)', min: -2, max: 0.5, step: 0.01, value: hbarLog,
    format: (v) => `${Math.pow(10, v).toPrecision(2)} J·s`,
    onInput: (v) => { hbarLog = v; hbarTouched = true; setHbar(); },
  });
  ui.slider({
    key: 'paths', label: 'Number of paths', min: 60, max: N_MAX, step: 20, value: nPaths,
    onInput: (v) => { nPaths = v; buildFan(); if (slits) buildSlitPaths(); },
  });
  ui.toggle({ key: 'slits', label: 'Paths through two slits', value: slits, onChange: (v) => { slits = v; applySlits(); } });
  const yPCtl = ui.slider({
    key: 'yP', label: 'Detector point P on screen', min: -2, max: 2, step: 0.01, value: yP, unit: 'm',
    onInput: (v) => { yP = v; if (slits) colourSlitPaths(); },
  });
  ui.buttons([{ label: 'New random paths', onClick: () => { seed++; buildFan(); if (slits) buildSlitPaths(); } }]);
  const rAmp = ui.readout('amp', '|Σ e^{iS/ħ}| / N');
  const rZone = ui.readout('zone', 'surviving zone ρ*');
  const rFar = ui.readout('far', 'far half share');
  const rSample = ui.readout('sample', 'sampling');
  ui.note(`ρ measures distance from the classical path: ρ = √(ΔS / ${DS_MAX} J·s). The zone ρ* is where the running phasor sum is longest. Beyond it, arrows cancel.`);

  function applySlits(): void {
    gFan.visible = !slits;
    gSlit.visible = slits;
    yPCtl.el.style.display = slits ? '' : 'none';
    if (slits) {
      buildSlitPaths();
      curveDirty = true;
      stage.flyTo(CAM_SLITS[0], CAM_SLITS[1]);
    } else stage.flyTo(CAM.feynman[0], CAM.feynman[1]);
    paintLegend();
    insetDirty = true;
  }

  function setView(v: View): void {
    view = v;
    g1.visible = v === 'classical';
    g2.visible = v === 'fermat';
    g3.visible = v === 'feynman';
    sec1.style.display = v === 'classical' ? '' : 'none';
    sec2.style.display = v === 'fermat' ? '' : 'none';
    sec3.style.display = v === 'feynman' ? '' : 'none';
    const [pos, tgt] = v === 'feynman' && slits ? CAM_SLITS : CAM[v];
    stage.flyTo(pos, tgt);
    renderer.domElement.style.cursor = '';
    paintLegend();
    insetDirty = true;
  }

  function startRelax(): void {
    relaxing = true;
    histN = 0;
    iter = 0;
    histIterMax = 1;
    insetDirty = true;
  }

  // =====================================================================
  // Frame loop
  // =====================================================================
  const eta = safeStep(DT, M);
  let insetTimer = 0;
  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (view === 'classical') {
      if (relaxing) {
        for (let k = 0; k < ITER_PER_FRAME; k++) descendStep(ys, DT, grad, eta, M, G);
        iter += ITER_PER_FRAME;
        knotsFromPath();
        drawTrial();
        if (histN < hist.length) hist[histN++] = Math.log10(Math.max(1e-7, dSrel()));
        histIterMax = iter;
        insetDirty = true;
        if (dSrel() < 1e-6 || histN >= hist.length) {
          relaxing = false;
          relaxedOnce = true;
        }
        if (dSrel() < 0.01) relaxedOnce = true;
      }
      ballT = (ballT + dt) % (T_FLIGHT + 0.5);
      const tb = Math.min(ballT, T_FLIGHT);
      const fi = (tb / T_FLIGHT) * NSEG;
      const i0 = Math.min(NSEG - 1, Math.floor(fi));
      const f = fi - i0;
      ball.position.set(xOf(tb), ys[i0] + (ys[i0 + 1] - ys[i0]) * f, 0.03);
    } else if (view === 'fermat') {
      if (fermatRelaxing) {
        const s = travelTimeSlope(xc, FG) * C_LIGHT;
        xc -= 0.06 * s;
        if (Math.abs(s) < 1e-7) fermatRelaxing = false;
        drawFermat();
      }
    } else if (!slits) {
      arrowClock = (arrowClock + dt) % (ARROW_T + ARROW_HOLD);
      placeArrows(Math.min(1, arrowClock / ARROW_T));
    } else if (curveDirty) {
      buildScreenCurve();
    }
    readoutTimer += dt;
    if (readoutTimer > 0.1) {
      readoutTimer = 0;
      updateReadouts();
    }
    insetTimer += dt;
    if (insetDirty && insetTimer > 0.05) {
      insetTimer = 0;
      insetDirty = false;
      drawInset();
    }
  });

  function updateReadouts(): void {
    rS(S.toFixed(4));
    rScl(Scl.toFixed(4));
    const d = dSrel();
    rdS(`${d < 1e-4 ? (d * 100).toExponential(1) : (d * 100).toFixed(2)} %`);
    rIter(String(iter));
    rTime((travelTime(xc, FG) * 1e9).toFixed(4));
    const [t1, t2] = rayAngles(xc, FG);
    rSnell1((FG.n1 * Math.sin(t1)).toFixed(4));
    rSnell2((FG.n2 * Math.sin(t2)).toFixed(4));
    rSnellErr(`${snellErrDeg().toFixed(2)}° off`);
    if (slits) {
      rAmp(slitAmp.toFixed(3));
      rZone('n/a');
      rFar('n/a');
      rSample(fringesResolved ? 'fringes resolved' : 'fringes too fine, averaged');
    } else {
      rAmp(stats.coherence.toFixed(3));
      rZone(undersampled() ? 'unresolved' : stats.zone.toFixed(2));
      rFar(stats.tail.toFixed(2));
      rSample(undersampled() ? 'too few paths' : 'ok');
    }
  }
  function snellErrDeg(): number {
    const [t1, t2] = rayAngles(xc, FG);
    return Math.abs(t2 - snellTheta2(t1, FG.n1, FG.n2)) * DEG;
  }

  // --- Initial state
  resetPath();
  buildGhosts();
  drawFermat();
  buildFan();
  setHbar();
  applySlits();
  setView('classical');
  labWater.element.textContent = mediumName(FG.n2);
  updateReadouts();
  labAir.element.textContent = 'upper medium, n₁ = 1.00';
  placeArrows(0);

  return {
    state: () => ({
      view,
      S,
      Scl,
      dSrel: dSrel(),
      iter,
      relaxedOnce,
      compared,
      n2: FG.n2,
      snellErr: snellErrDeg(),
      fermatTouched,
      hbar: hbar(),
      hbarTouched,
      paths: nPaths,
      zone: stats.zone,
      coherence: stats.coherence,
      far: stats.tail,
      undersampled: undersampled(),
      slits,
      yP,
    }),
    dispose: () => {
      viewport.removeEventListener('pointerdown', onDown, { capture: true });
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      inset.remove();
      legend.remove();
      pickGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'least-action',
  number: 89,
  title: 'Least Action & Path Integrals',
  domain: 'foundations',
  level: 3,
  status: 'live',
  tagline: 'Nature tries every path, and the right one wins by interference.',
  content,
  mount,
};

export default topic;
