import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  angMomMag,
  boxForInertia,
  customInertia,
  energy,
  flipInterval,
  initialState,
  Integrator,
  massProps,
  newState,
  presetParts,
  sigma as growthRate,
  toWorld,
  type Inertia,
  type Part,
  type PresetId,
  type Vec3,
} from './physics.ts';

type View = 'both' | 'object' | 'sphere';
type AxisSel = '1' | '2' | '3';

const H = 1 / 2000; // integrator step (s)
const TRAIL_DT = 1 / 90; // sim seconds between trail samples
const OBJ_X = -2.35;
const SPH_X = 2.45;
const R = 1.45; // polhode sphere radius
const AX_COL = [PALETTE.cyan, PALETTE.amber, PALETTE.violet];
const HYST = 0.5; // flip counted when L_k/|L| crosses -0.5 or +0.5
const SPARK_N = 480;
const SPARK_WINDOW = 24; // seconds shown in the sparkline

const UP = new THREE.Vector3(0, 1, 0);

/** Solid arrow from the origin: cylinder shaft and cone head. */
class FatArrow {
  readonly group = new THREE.Group();
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private headLen: number;
  private dir = new THREE.Vector3();

  constructor(color: number, radius: number, headLen: number, headRadius: number, emissive = 0.35) {
    this.headLen = headLen;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.45, metalness: 0.1 });
    const sg = new THREE.CylinderGeometry(radius, radius, 1, 14);
    sg.translate(0, 0.5, 0);
    const hg = new THREE.ConeGeometry(headRadius, headLen, 20);
    hg.translate(0, headLen / 2, 0);
    this.shaft = new THREE.Mesh(sg, mat);
    this.head = new THREE.Mesh(hg, mat);
    this.group.add(this.shaft, this.head);
  }

  set(x: number, y: number, z: number, len: number): void {
    this.dir.set(x, y, z);
    const n = this.dir.length();
    if (n < 1e-12) return;
    this.dir.multiplyScalar(1 / n);
    this.group.quaternion.setFromUnitVectors(UP, this.dir);
    this.shaft.scale.y = Math.max(1e-3, len - this.headLen);
    this.head.position.y = len - this.headLen;
  }
}

/** Ellipse in the xy plane, for the racket frame. */
class EllipseCurve3 extends THREE.Curve<THREE.Vector3> {
  ax: number;
  ay: number;
  constructor(ax: number, ay: number) {
    super();
    this.ax = ax;
    this.ay = ay;
  }
  getPoint(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    const th = u * Math.PI * 2;
    return target.set(this.ax * Math.cos(th), this.ay * Math.sin(th), 0);
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/** Build meshes for a list of parts, in the parts' own (shape) frame and units. */
function buildPartMeshes(parts: Part[], preset: PresetId): THREE.Group {
  const g = new THREE.Group();
  const matFor = (color = 0xc9d3e6) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.55 });
  for (const p of parts) {
    if (p.kind === 'box') {
      const geo = new THREE.BoxGeometry(...p.size);
      const mesh = new THREE.Mesh(geo, matFor(p.color));
      mesh.position.set(...p.c);
      g.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x8391ab, transparent: true, opacity: 0.6 }));
      edges.position.set(...p.c);
      g.add(edges);
    } else if (p.kind === 'cyl') {
      const geo = new THREE.CylinderGeometry(p.r, p.r, p.len, 28);
      if (p.axis === 0) geo.rotateZ(Math.PI / 2);
      if (p.axis === 2) geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, matFor(p.color));
      mesh.position.set(...p.c);
      g.add(mesh);
    } else if (p.kind === 'hoop') {
      const geo = new THREE.TubeGeometry(new EllipseCurve3(p.ax, p.ay), 120, p.tube, 10, true);
      const mesh = new THREE.Mesh(geo, matFor(p.color));
      mesh.position.set(...p.c);
      g.add(mesh);
    } else {
      // Strings: a faint membrane plus a grid of lines clipped to the ellipse.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 48),
        new THREE.MeshBasicMaterial({ color: p.color ?? 0xdfe6f3, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
      );
      disc.scale.set(p.ax, p.ay, 1);
      disc.position.set(...p.c);
      g.add(disc);
      const pts: number[] = [];
      const n = 9;
      for (let i = -n; i <= n; i++) {
        const x = (i / (n + 1)) * p.ax;
        const yy = p.ay * Math.sqrt(1 - (x / p.ax) ** 2);
        pts.push(x, -yy, 0, x, yy, 0);
        const y = (i / (n + 1)) * p.ay;
        const xx = p.ax * Math.sqrt(1 - (y / p.ay) ** 2);
        pts.push(-xx, y, 0, xx, y, 0);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdfe6f3, transparent: true, opacity: 0.55 }));
      lines.position.set(...p.c);
      g.add(lines);
    }
  }
  if (preset === 'phone') {
    // Screen on the +z face so the face flip is easy to see (visual only, no mass).
    const box = parts[0] as Extract<Part, { kind: 'box' }>;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(box.size[0] * 0.9, box.size[1] * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x1d3f7a, emissive: 0x2a5bb0, emissiveIntensity: 0.6, roughness: 0.2 }),
    );
    screen.position.set(0, 0, box.size[2] / 2 + 1e-4);
    g.add(screen);
  }
  if (preset === 'wingnut') {
    // Threaded hole, drawn as a dark inner cylinder (the model treats the hub as solid).
    const hub = parts[0] as Extract<Part, { kind: 'cyl' }>;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(hub.r * 0.5, hub.r * 0.5, hub.len * 1.02, 20), new THREE.MeshStandardMaterial({ color: 0x151b28, roughness: 0.9 }));
    g.add(hole);
  }
  return g;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 1.5, 9.6], target: [0, 0.05, 0], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let preset: PresetId = 'thandle';
  let axis: 0 | 1 | 2 = 1;
  let Omega = 6;
  let pertExp = -2;
  let speed = 1;
  let playing = true;
  let showArrows = true;
  let showTrails = true;
  let customR3 = 1.8;
  let customF = 0.5;
  const T_HANDLE_I = massProps(presetParts('thandle')).I;

  let I: Inertia = [1, 2, 3];
  const integ = new Integrator(I);
  const s = newState();
  const tmp = newState();

  // --- Floor grid for depth
  const grid = makeGrid(16, 32);
  grid.position.y = -2.1;
  scene.add(grid);

  // --- The object, in world space
  const objGroup = new THREE.Group();
  objGroup.position.set(OBJ_X, 0, 0);
  scene.add(objGroup);
  const body = new THREE.Group();
  objGroup.add(body);
  let shapeHolder = new THREE.Group();
  body.add(shapeHolder);

  const AXIS_LEN = 1.55;
  const axisArrows = AX_COL.map((c) => new FatArrow(c, 0.028, 0.2, 0.075, 0.45));
  const axisNeg = AX_COL.map((c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.55 }));
  });
  for (let k = 0; k < 3; k++) {
    const d: Vec3 = [0, 0, 0];
    d[k] = 1;
    axisArrows[k].set(d[0], d[1], d[2], AXIS_LEN);
    body.add(axisArrows[k].group);
    const pos = axisNeg[k].geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(1, -d[0] * AXIS_LEN * 0.85, -d[1] * AXIS_LEN * 0.85, -d[2] * AXIS_LEN * 0.85);
    body.add(axisNeg[k]);
    const lab = stage.label(String(k + 1), [d[0] * (AXIS_LEN + 0.18), d[1] * (AXIS_LEN + 0.18), d[2] * (AXIS_LEN + 0.18)], 'big', body);
    lab.element.style.color = css(AX_COL[k]);
  }

  const Larrow = new FatArrow(PALETTE.white, 0.04, 0.26, 0.1, 0.25);
  Larrow.set(0, 1, 0, 2.45);
  objGroup.add(Larrow.group);
  stage.label('L (fixed)', [0, 2.65, 0], '', objGroup);
  const Warrow = new FatArrow(PALETTE.green, 0.022, 0.2, 0.065, 0.5);
  objGroup.add(Warrow.group);
  const wLabel = stage.label('ω', [0, 0, 0], '', objGroup);
  wLabel.element.style.color = css(PALETTE.green);

  // World path of the axis-2 tip (shows each flip as a sweep from top to bottom).
  const tipTrail = new Trail(700, PALETTE.amber, 0.5);
  objGroup.add(tipTrail.line);

  stage.label('the object, spinning in space', [OBJ_X, -2.45, 0], 'muted');

  // --- The angular-momentum sphere, drawn in the body frame
  const sphGroup = new THREE.Group();
  sphGroup.position.set(SPH_X, 0.05, 0);
  sphGroup.rotation.set(0.28, -0.38, 0);
  scene.add(sphGroup);
  const bodyFrame = new THREE.Group();
  // body e1 -> -x, e2 -> +z (toward the viewer), e3 -> +y
  bodyFrame.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  sphGroup.add(bodyFrame);

  bodyFrame.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x1d2a48, transparent: true, opacity: 0.35, roughness: 0.9, depthWrite: false }),
    ),
  );
  bodyFrame.add(
    new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 0.998, 24, 12)), new THREE.LineBasicMaterial({ color: 0x2f4068, transparent: true, opacity: 0.22 })),
  );
  const dotGeo = new THREE.SphereGeometry(0.055, 16, 10);
  for (let k = 0; k < 3; k++) {
    const d = new THREE.Vector3();
    d.setComponent(k, 1);
    const lg = new THREE.BufferGeometry().setFromPoints([d.clone().multiplyScalar(-R * 1.18), d.clone().multiplyScalar(R * 1.18)]);
    bodyFrame.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: AX_COL[k], transparent: true, opacity: 0.5 })));
    for (const sgn of [1, -1]) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: AX_COL[k] }));
      dot.position.copy(d).multiplyScalar(sgn * R);
      bodyFrame.add(dot);
    }
    const name = k === 1 ? '+2 saddle' : k === 0 ? '+1 stable' : '+3 stable';
    const lab = stage.label(name, d.clone().multiplyScalar(R * 1.3), '', bodyFrame);
    lab.element.style.color = css(AX_COL[k]);
    const labN = stage.label(`−${k + 1}`, d.clone().multiplyScalar(-R * 1.25), 'muted', bodyFrame);
    labN.element.style.color = css(AX_COL[k]);
  }
  stage.label('L seen from the object: the polhode', [SPH_X, -2.45, 0], 'muted');

  // Separatrix and reference polhodes depend on the inertia, so they are rebuilt with it.
  let sepGroup = new THREE.Group();
  bodyFrame.add(sepGroup);

  const Ltip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), new THREE.MeshBasicMaterial({ color: PALETTE.white }));
  bodyFrame.add(Ltip);
  const Lbody = new FatArrow(PALETTE.white, 0.02, 0.16, 0.06, 0.25);
  bodyFrame.add(Lbody.group);
  const polTrail = new Trail(1400, PALETTE.rose, 1);
  bodyFrame.add(polTrail.line);
  // Point sprites on the same geometry make the 1-px trail readable.
  const polDots = new THREE.Points(polTrail.line.geometry, new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
  polDots.frustumCulled = false;
  bodyFrame.add(polDots);

  function rebuildSphereCurves(): void {
    bodyFrame.remove(sepGroup);
    disposeTree(sepGroup);
    sepGroup = new THREE.Group();
    bodyFrame.add(sepGroup);
    const [I1, I2, I3] = I;
    // Separatrix: L3 = +-c L1 on the sphere, two great circles through +-axis 2.
    const c = Math.sqrt((1 / I1 - 1 / I2) / (1 / I2 - 1 / I3));
    const sepMat = new THREE.MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0.7 });
    for (const sgn of [1, -1]) {
      const u = new THREE.Vector3(1, 0, sgn * c).normalize();
      const v = new THREE.Vector3(0, 1, 0);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * Math.PI * 2;
        pts.push(u.clone().multiplyScalar(Math.cos(th) * R * 1.004).addScaledVector(v, Math.sin(th) * R * 1.004));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 200, 0.008, 6, true);
      sepGroup.add(new THREE.Mesh(geo, sepMat));
    }
    // Reference polhodes: exact orbits of L on the sphere, integrated over one period.
    const refMat = new THREE.LineBasicMaterial({ color: 0x6b7ca3, transparent: true, opacity: 0.55 });
    const refInteg = new Integrator(I);
    const st = newState();
    const N = 240;
    for (const fam of [0, 2] as const) {
      for (const deg of [16, 34, 52, 68]) {
        const a = (deg * Math.PI) / 180;
        // Start on the great circle through the family axis and axis 2.
        const L: Vec3 = [0, Math.sin(a), 0];
        L[fam] = Math.cos(a);
        st[0] = L[0] / I1; st[1] = L[1] / I2; st[2] = L[2] / I3;
        st[3] = 1; st[4] = st[5] = st[6] = 0;
        const period = 2 * flipInterval(I, st);
        if (!Number.isFinite(period)) continue;
        const sub = 8;
        const h = period / (N * sub);
        const arr = new Float32Array((N + 1) * 3);
        const lm = angMomMag(I, st);
        for (let i = 0; i <= N; i++) {
          arr[i * 3] = ((I1 * st[0]) / lm) * R * 1.002;
          arr[i * 3 + 1] = ((I2 * st[1]) / lm) * R * 1.002;
          arr[i * 3 + 2] = ((I3 * st[2]) / lm) * R * 1.002;
          for (let k = 0; k < sub; k++) refInteg.step(st, h);
        }
        for (const sgn of [1, -1]) {
          const g = new THREE.BufferGeometry();
          const a2 = sgn > 0 ? arr : arr.map((x) => -x);
          g.setAttribute('position', new THREE.BufferAttribute(a2, 3));
          sepGroup.add(new THREE.Line(g, refMat));
        }
      }
    }
  }

  function rebuildShape(): void {
    let parts: Part[];
    if (preset === 'custom') {
      const box = boxForInertia(customInertia(customR3, customF));
      parts = [{ kind: 'box', m: 1, c: [0, 0, 0], size: [Math.max(box[0], 0.06), Math.max(box[1], 0.06), Math.max(box[2], 0.06)], color: 0x55658a }];
      I = customInertia(customR3, customF);
    } else {
      parts = presetParts(preset);
    }
    const mp = massProps(preset === 'custom' ? [{ kind: 'box', m: 1, c: [0, 0, 0], size: boxForInertia(I) }] : parts);
    if (preset !== 'custom') I = mp.I;
    integ.I = I;

    body.remove(shapeHolder);
    disposeTree(shapeHolder);
    shapeHolder = new THREE.Group();
    const meshes = buildPartMeshes(parts, preset);
    // Map shape axes onto body axes 1, 2, 3 (ascending moment), keeping a proper rotation.
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) M[k * 3 + mp.order[k]] = 1;
    const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
    if (det < 0) for (let j = 0; j < 3; j++) M[6 + j] *= -1;
    shapeHolder.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1));
    meshes.position.set(-mp.com[0], -mp.com[1], -mp.com[2]);
    shapeHolder.add(meshes);
    const size = new THREE.Box3().setFromObject(meshes).getSize(new THREE.Vector3());
    const sc = 2.3 / Math.max(size.x, size.y, size.z);
    shapeHolder.scale.setScalar(sc);
    body.add(shapeHolder);
    rebuildSphereCurves();
  }

  // --- Sparkline of L_k / |L| along the spin axis
  const spark = document.createElement('canvas');
  spark.className = 'tr-spark';
  spark.width = 480;
  spark.height = 200;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '100px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const sparkT = new Float32Array(SPARK_N);
  const sparkU = new Float32Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;

  // --- Simulation state
  let t = 0;
  let e0 = 1;
  let l0 = 1;
  let flips = 0;
  let sign = 1;
  let lastFlip = -1;
  let interval = 0;
  let predicted = Infinity;
  let refInterval = Infinity;
  let maxTilt = 0;
  let trailClock = 0;
  let sparkClock = 0;
  const wv: Vec3 = [0, 0, 0];

  function reset(): void {
    const eps = Math.pow(10, pertExp);
    initialState(I, axis, Omega, eps, s);
    e0 = energy(I, s);
    l0 = angMomMag(I, s);
    t = 0;
    flips = 0;
    sign = 1;
    lastFlip = -1;
    interval = 0;
    maxTilt = 0;
    trailClock = 0;
    sparkClock = 0;
    predicted = axis === 1 ? flipInterval(I, s) : Infinity;
    initialState(T_HANDLE_I, 1, Omega, eps, tmp);
    refInterval = flipInterval(T_HANDLE_I, tmp);
    sparkHead = 0;
    sparkCount = 0;
    polTrail.clear();
    tipTrail.clear();
    draw();
    drawSpark();
    updateReadouts();
  }

  function pushTrails(): void {
    const lm = l0;
    const rr = R * 1.025; // just outside the separatrix tube, so the trail is not hidden
    polTrail.push(((I[0] * s[0]) / lm) * rr, ((I[1] * s[1]) / lm) * rr, ((I[2] * s[2]) / lm) * rr);
    toWorld(s, 0, AXIS_LEN, 0, wv);
    tipTrail.push(wv[0], wv[1], wv[2]);
  }

  function draw(): void {
    body.quaternion.set(s[4], s[5], s[6], s[3]);
    toWorld(s, s[0], s[1], s[2], wv);
    const wn = Math.hypot(wv[0], wv[1], wv[2]);
    const wl = 1.95 * (wn / Math.abs(Omega));
    Warrow.set(wv[0], wv[1], wv[2], wl);
    wLabel.position.set((wv[0] / wn) * (wl + 0.22), (wv[1] / wn) * (wl + 0.22), (wv[2] / wn) * (wl + 0.22));
    const lx = (I[0] * s[0]) / l0, ly = (I[1] * s[1]) / l0, lz = (I[2] * s[2]) / l0;
    Ltip.position.set(lx * R, ly * R, lz * R);
    Lbody.set(lx, ly, lz, R);
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText(`L${'₁₂₃'[axis]} / |L| vs time`, 16, 32);
    sctx.fillStyle = css(AX_COL[axis]);
    sctx.font = '600 24px JetBrains Mono, monospace';
    sctx.fillText(`flips ${flips}`, W - 150, 32);
    const top = 50;
    const bot = Hh - 16;
    const yOf = (u: number) => top + ((1 - u) / 2) * (bot - top);
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    sctx.font = '20px JetBrains Mono, monospace';
    for (const u of [1, 0, -1]) {
      sctx.beginPath();
      sctx.moveTo(10, yOf(u));
      sctx.lineTo(W - 50, yOf(u));
      sctx.stroke();
      sctx.fillStyle = '#56627c';
      sctx.fillText(u > 0 ? '+1' : u < 0 ? '−1' : '0', W - 44, yOf(u) + 7);
    }
    if (sparkCount < 2) return;
    const tEnd = sparkT[(sparkHead - 1 + SPARK_N) % SPARK_N];
    const t0 = Math.max(0, tEnd - SPARK_WINDOW);
    sctx.strokeStyle = css(AX_COL[axis]);
    sctx.lineWidth = 3;
    sctx.beginPath();
    let started = false;
    for (let i = 0; i < sparkCount; i++) {
      const j = (sparkHead - sparkCount + i + SPARK_N) % SPARK_N;
      if (sparkT[j] < t0) continue;
      const x = 10 + ((sparkT[j] - t0) / SPARK_WINDOW) * (W - 70);
      const y = yOf(sparkU[j]);
      if (!started) { sctx.moveTo(x, y); started = true; } else sctx.lineTo(x, y);
    }
    sctx.stroke();
  }

  // --- Frame loop
  let readoutClock = 0;
  stage.onFrame((dt) => {
    // The stage can hand over a negative dt right after mount, so clamp it.
    if (playing && dt > 0) {
      const simDt = dt * speed;
      const steps = Math.ceil(simDt / H);
      const h = simDt / steps;
      const Ik = I[axis];
      for (let k = 0; k < steps; k++) {
        integ.step(s, h);
        t += h;
        const u = (Ik * s[axis]) / l0;
        if (sign > 0 && u < -HYST) { sign = -1; onFlip(); }
        else if (sign < 0 && u > HYST) { sign = 1; onFlip(); }
        const tilt = Math.acos(Math.min(1, Math.abs(u)));
        if (tilt > maxTilt) maxTilt = tilt;
        trailClock += h;
        if (trailClock >= TRAIL_DT) {
          trailClock -= TRAIL_DT;
          if (showTrails) pushTrails();
        }
        sparkClock += h;
        if (sparkClock >= SPARK_WINDOW / SPARK_N) {
          sparkClock -= SPARK_WINDOW / SPARK_N;
          sparkT[sparkHead] = t;
          sparkU[sparkHead] = u;
          sparkHead = (sparkHead + 1) % SPARK_N;
          if (sparkCount < SPARK_N) sparkCount++;
        }
      }
      draw();
    }
    readoutClock += dt;
    if (readoutClock > 0.12) {
      readoutClock = 0;
      drawSpark();
      updateReadouts();
    }
  });

  function onFlip(): void {
    flips++;
    if (lastFlip >= 0) interval = t - lastFlip;
    lastFlip = t;
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'both',
    options: [{ value: 'both', label: 'Both' }, { value: 'object', label: 'Object' }, { value: 'sphere', label: 'Sphere' }],
    onChange: (v) => {
      if (v === 'both') stage.flyTo([0, 1.5, 9.6], [0, 0.05, 0]);
      if (v === 'object') stage.flyTo([OBJ_X + 0.4, 1.4, 5.6], [OBJ_X, 0.25, 0]);
      if (v === 'sphere') stage.flyTo([SPH_X, 0.7, 5.0], [SPH_X, 0.05, 0]);
    },
  });
  ui.toggle({ key: 'arrows', label: 'Show L and ω arrows', value: showArrows, onChange: (v) => { showArrows = v; Larrow.group.visible = v; Warrow.group.visible = v; wLabel.visible = v; Lbody.group.visible = v; } });
  ui.toggle({ key: 'trails', label: 'Show polhode trail', value: showTrails, onChange: (v) => { showTrails = v; polTrail.line.visible = v; polDots.visible = v; tipTrail.line.visible = v; if (!v) { polTrail.clear(); tipTrail.clear(); } } });

  ui.section('Spin (resets)');
  ui.select<AxisSel>({
    key: 'axis', label: 'Spin axis', value: '2',
    options: [{ value: '1', label: '1 (smallest I)' }, { value: '2', label: '2 (middle I)' }, { value: '3', label: '3 (largest I)' }],
    onChange: (v) => { axis = (Number(v) - 1) as 0 | 1 | 2; reset(); },
  });
  ui.slider({ key: 'omega', label: 'Spin rate Ω', min: 1, max: 12, step: 0.1, value: Omega, unit: 'rad/s', onInput: (v) => { Omega = v; reset(); } });
  ui.slider({ key: 'pert', label: 'Nudge ε', min: -4, max: -1, step: 0.1, value: pertExp, format: (v) => `${Math.pow(10, v).toExponential(1)}`, onInput: (v) => { pertExp = v; reset(); } });

  ui.section('Shape (resets)');
  const r3Ctl = ui.slider({ key: 'r3', label: 'Custom I₃ / I₁', min: 1.1, max: 2, step: 0.01, value: customR3, onInput: (v) => { customR3 = v; rebuildShape(); reset(); } });
  const fCtl = ui.slider({ key: 'i2pos', label: 'Custom I₂ position (0 = I₁, 1 = I₃)', min: 0.02, max: 0.98, step: 0.01, value: customF, onInput: (v) => { customF = v; rebuildShape(); reset(); } });
  const showCustom = () => {
    r3Ctl.el.style.display = preset === 'custom' ? '' : 'none';
    fCtl.el.style.display = preset === 'custom' ? '' : 'none';
  };
  const presetCtl = ui.select<PresetId>({
    key: 'preset', label: 'Object', value: preset,
    options: [
      { value: 'thandle', label: 'T-handle' },
      { value: 'wingnut', label: 'Wing nut' },
      { value: 'phone', label: 'Phone' },
      { value: 'racket', label: 'Racket' },
      { value: 'custom', label: 'Custom box' },
    ],
    onChange: (v) => { preset = v; showCustom(); rebuildShape(); reset(); },
  });
  // Put the object picker above the custom sliders.
  presetCtl.el.parentElement?.insertBefore(presetCtl.el, r3Ctl.el);
  showCustom();
  ui.legend([
    { color: css(PALETTE.cyan), label: 'axis 1' },
    { color: css(PALETTE.amber), label: 'axis 2' },
    { color: css(PALETTE.violet), label: 'axis 3' },
    { color: css(PALETTE.white), label: 'L' },
    { color: css(PALETTE.green), label: 'ω' },
    { color: css(PALETTE.rose), label: 'polhode' },
    { color: css(PALETTE.red), label: 'separatrix' },
  ]);

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t', 's');
  const rFlips = ui.readout('flips', 'flips');
  const rInt = ui.readout('interval', 'measured flip interval');
  const rPred = ui.readout('predicted', 'predicted flip interval');
  const rSig = ui.readout('sigma', 'growth rate σ (axis 2)');
  const rTau = ui.readout('tau', 'e-folding time 1/σ');
  const rI = ui.readout('ratios', 'I₁ : I₂ : I₃');
  const rE = ui.readout('energy', 'energy drift');
  const rL = ui.readout('lmag', '|L| drift');

  function updateReadouts(): void {
    const sig = growthRate(I, Omega);
    rT(t.toFixed(1));
    rFlips(String(flips));
    rInt(interval > 0 ? `${interval.toFixed(3)} s` : 'waiting');
    rPred(axis === 1 && Number.isFinite(predicted) ? `${predicted.toFixed(3)} s` : 'stable, none');
    rSig(`${sig.toFixed(3)} /s`);
    rTau(sig > 0 ? `${(1 / sig).toFixed(3)} s` : 'infinite');
    rI(`1 : ${(I[1] / I[0]).toFixed(2)} : ${(I[2] / I[0]).toFixed(2)}`);
    rE((energy(I, s) / e0 - 1).toExponential(0));
    rL((angMomMag(I, s) / l0 - 1).toExponential(0));
  }

  rebuildShape();
  reset();

  return {
    state: () => ({
      t,
      axis: axis + 1,
      omega: Omega,
      pert: Math.pow(10, pertExp),
      pertExp,
      preset,
      flips,
      interval,
      refInterval: Number.isFinite(refInterval) ? refInterval : 0,
      predicted: Number.isFinite(predicted) ? predicted : 0,
      sigma: growthRate(I, Omega),
      maxTiltDeg: (maxTilt * 180) / Math.PI,
      I1: I[0],
      I2: I[1],
      I3: I[2],
      energyDrift: energy(I, s) / e0 - 1,
      lDrift: angMomMag(I, s) / l0 - 1,
    }),
    dispose: () => {
      spark.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'tennis-racket',
  number: 2,
  symbol: 'Dz',
  title: 'The Tennis Racket Effect',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'Why a spinning object flips over when you spin it about its middle axis.',
  content,
  mount,
};

export default topic;
