import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  N_STEPS, STEP_MEASURE, STEP_SEND, STEP_NAMES, bloch, cmat, dephase12, fidelity, outcomeProb, pairFidelity, protocolState,
  randomAngles, reduced, sampleOutcome, teleport, trace, wernerTeleportFidelity, type CMat,
} from './physics.ts';

const DEG = Math.PI / 180;
const R = 1; // Bloch sphere radius
const LAST = N_STEPS - 1;
const SPHERE_Y = -1.95;
const CENTERS: [number, number, number][] = [[-5.5, SPHERE_Y, 0], [-3.0, SPHERE_Y, 0], [4.9, SPHERE_Y, 0]];
const QCOL = [PALETTE.amber, PALETTE.violet, PALETTE.cyan];
const WIRE_Y = [2.35, 1.72, 1.09];
const COL_X = [-4.55, -3.45, -2.35, -1.2, -0.05, 1.1, 2.1, 2.95, 3.95];
const CAM: [number, number, number] = [-0.3, 2.0, 14.6];
const TGT: [number, number, number] = [-0.3, 0.2, 0];
const SHORT = ['ψ', 'H', 'CX', 'CX', 'H', 'M', 'bits', 'X', 'Z'];
const H_AXIS = [Math.SQRT1_2, 0, Math.SQRT1_2];

const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Physics (x, y, z) with z up maps to scene (x, z, -y). */
function toScene(v: ArrayLike<number>, s: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v[0] * s, v[2] * s, -v[1] * s);
}

/** Rotate v about unit axis n by angle a (Rodrigues). out may alias v. */
function rotate(v: ArrayLike<number>, n: ArrayLike<number>, a: number, out: Float64Array): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const cx = n[1] * v[2] - n[2] * v[1];
  const cy = n[2] * v[0] - n[0] * v[2];
  const cz = n[0] * v[1] - n[1] * v[0];
  const x = v[0] * c + cx * s + n[0] * d * (1 - c);
  const y = v[1] * c + cy * s + n[1] * d * (1 - c);
  const z = v[2] * c + cz * s + n[2] * d * (1 - c);
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface VecArrow {
  group: THREE.Group;
  set(dir: THREE.Vector3, len: number): void;
}

function makeVecArrow(color: number, shaftR: number, headR: number, headLen: number, opacity = 1): VecArrow {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.4, roughness: 0.35, metalness: 0.1, transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
  const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, 1, 12);
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 18), mat);
  group.add(shaft, head);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  return {
    group,
    set(dir, len) {
      if (len < 0.02 || dir.lengthSq() < 1e-12) {
        group.visible = false;
        return;
      }
      group.visible = true;
      d.copy(dir).normalize();
      group.quaternion.setFromUnitVectors(up, d);
      const hl = Math.min(headLen, len * 0.55);
      head.scale.setScalar(hl / headLen);
      head.position.y = len - hl / 2;
      shaft.scale.y = Math.max(1e-3, len - hl);
    },
  };
}

interface BlochView {
  group: THREE.Group;
  arrow: VecArrow;
  tip: THREE.Mesh;
  core: THREE.SpriteMaterial;
  flash: THREE.SpriteMaterial;
}

/** Sampled curve for cheap allocation-free lookups. */
class Path {
  readonly pts: Float32Array;
  constructor(curve: THREE.Curve<THREE.Vector3>, readonly n = 64) {
    this.pts = new Float32Array((n + 1) * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      curve.getPointAt(i / n, v);
      this.pts[i * 3] = v.x;
      this.pts[i * 3 + 1] = v.y;
      this.pts[i * 3 + 2] = v.z;
    }
  }
  at(u: number, out: THREE.Vector3): THREE.Vector3 {
    const f = clamp01(u) * this.n;
    const i = Math.min(this.n - 1, Math.floor(f));
    const t = f - i;
    const p = this.pts;
    return out.set(
      p[i * 3] + (p[i * 3 + 3] - p[i * 3]) * t,
      p[i * 3 + 1] + (p[i * 3 + 4] - p[i * 3 + 1]) * t,
      p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * t,
    );
  }
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: TGT, fov: 42 });
  const { scene } = stage;
  const glow = glowTexture();
  const tv = new THREE.Vector3();

  // --- Parameters and protocol state
  let thetaDeg = 60;
  let phiDeg = 45;
  let noise = 0;
  let forget = false;
  let bitSpeed = 1;
  let m1 = 0;
  let m2 = 0;
  let step = 0; // current step (target of the running animation)
  let animU = 1; // 0..1 progress into `step`
  let animDur = 1;
  let running = false;
  let pauseT = 0;
  let touched = false;
  let batchN = 0;
  let batchMean = 0;
  let batchForget = false;
  let batchNoise = 0;

  // Snapshot per step: Bloch vectors of the three displayed states and Bob's fidelity.
  const vecs: Float64Array[][] = [];
  for (let k = 0; k < N_STEPS; k++) vecs.push([new Float64Array(3), new Float64Array(3), new Float64Array(3)]);
  const fid = new Float64Array(N_STEPS);
  let bobRho: CMat = cmat(2);
  let traceErr = 0;
  let fPair = 1;
  let pOutcome = 0.25;
  const cur = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];

  function recompute(): void {
    const th = thetaDeg * DEG;
    const ph = phiDeg * DEG;
    let rho4: CMat | null = null;
    for (let k = 0; k < N_STEPS; k++) {
      const rho = protocolState(th, ph, noise, m1, m2, forget, k);
      if (k === 4) rho4 = rho;
      if (k === 2) fPair = pairFidelity(rho);
      if (k === LAST) traceErr = Math.abs(trace(rho) - 1);
      bloch(reduced(rho, 1), vecs[k][0]);
      bloch(reduced(rho, 2), vecs[k][1]);
      // Bob's own description: before the bits land he must average over Alice's outcomes.
      const bob = k === STEP_MEASURE ? reduced(dephase12(rho4!), 3) : reduced(rho, 3);
      bloch(bob, vecs[k][2]);
      fid[k] = fidelity(bob, th, ph);
      if (k === step) bobRho = bob;
    }
    pOutcome = outcomeProb(rho4!, m1, m2);
  }

  // --- Lab floors
  const floorMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const aliceFloor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), floorMat(PALETTE.amber));
  aliceFloor.rotation.x = -Math.PI / 2;
  aliceFloor.scale.set(1.35, 0.75, 1);
  aliceFloor.position.set(-4.25, SPHERE_Y - 1.25, 0);
  scene.add(aliceFloor);
  const bobFloor = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), floorMat(PALETTE.cyan));
  bobFloor.rotation.x = -Math.PI / 2;
  bobFloor.scale.set(1, 0.8, 1);
  bobFloor.position.set(CENTERS[2][0], SPHERE_Y - 1.25, 0);
  scene.add(bobFloor);
  const aLab = stage.label('ALICE', [-4.25, SPHERE_Y - 1.7, 0.8], 'big');
  aLab.element.style.color = css(PALETTE.amber);
  aLab.element.style.letterSpacing = '0.2em';
  const bLab = stage.label('BOB', [CENTERS[2][0], SPHERE_Y - 1.7, 0.8], 'big');
  bLab.element.style.color = css(PALETTE.cyan);
  bLab.element.style.letterSpacing = '0.2em';
  stage.label('any distance', [0.9, SPHERE_Y - 1.7, 0.8], 'muted');

  // --- Bloch spheres (shared geometry)
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6aa8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor*(0.35+0.9*f), 0.03 + 0.4*f); }`,
    transparent: true,
    depthWrite: false,
  });
  const sphereGeo = new THREE.SphereGeometry(R, 48, 32);
  const ring = new Float32Array(97 * 3);
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ring[i * 3] = Math.cos(a) * R;
    ring[i * 3 + 2] = Math.sin(a) * R;
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ring, 3));
  const ringMat = new THREE.LineBasicMaterial({ color: 0x5a7bb0, transparent: true, opacity: 0.7 });
  const faintMat = new THREE.LineBasicMaterial({ color: 0x33476e, transparent: true, opacity: 0.55 });
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1.2, 0, 0, 1.2, 0, 0, 0, -1.2, 0, 0, 1.2, 0, 0, 0, -1.2, 0, 0, 1.2]), 3));
  const axMat = new THREE.LineBasicMaterial({ color: 0x46587c, transparent: true, opacity: 0.7 });

  const NAMES = ['q₁  |ψ⟩', 'q₂', 'q₃'];
  const views: BlochView[] = CENTERS.map((c, s) => {
    const group = new THREE.Group();
    group.position.set(...c);
    scene.add(group);
    const glass = new THREE.Mesh(sphereGeo, glassMat);
    glass.renderOrder = 2;
    group.add(glass);
    group.add(new THREE.Line(ringGeo, ringMat));
    const mA = new THREE.Line(ringGeo, faintMat);
    mA.rotation.x = Math.PI / 2;
    group.add(mA);
    const mB = new THREE.Line(ringGeo, faintMat);
    mB.rotation.z = Math.PI / 2;
    group.add(mB);
    group.add(new THREE.LineSegments(axGeo, axMat));
    stage.label('|0⟩', [0, R * 1.28, 0], 'muted', group);
    stage.label('|1⟩', [0, -R * 1.28, 0], 'muted', group);
    const nm = stage.label(NAMES[s], [-R * 1.05, R * 0.95, 0], 'big', group);
    nm.element.style.color = css(QCOL[s]);
    const arrow = makeVecArrow(QCOL[s], 0.035, 0.1, 0.24);
    group.add(arrow.group);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: QCOL[s] }));
    group.add(tip);
    const core = new THREE.SpriteMaterial({ map: glow, color: QCOL[s], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const cs = new THREE.Sprite(core);
    cs.scale.setScalar(0.55);
    group.add(cs);
    const flash = new THREE.SpriteMaterial({ map: glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const fs = new THREE.Sprite(flash);
    fs.scale.setScalar(2.8);
    group.add(fs);
    return { group, arrow, tip, core, flash };
  });

  // Target |ψ⟩ ghost on Bob's sphere
  const ghost = makeVecArrow(PALETTE.amber, 0.018, 0.07, 0.18, 0.35);
  views[2].group.add(ghost.group);
  const ghostLab = stage.label('target', [0, 0, 0], 'muted', views[2].group);
  ghostLab.element.style.color = css(PALETTE.amber);
  const mixedLab = stage.label('ρ = I/2  (mixed)', [0, -0.32, 0.2], '', views[2].group);
  mixedLab.element.style.color = css(PALETTE.cyan);
  const psiTarget = new Float64Array(3);

  // --- Entanglement threads
  const threadDefs: [number, number, number][] = [[1, 2, -2.15], [0, 1, -1.9], [0, 2, -2.55]];
  const threads = threadDefs.map(([a, b, sag]) => {
    const pa = new THREE.Vector3(...CENTERS[a]);
    const pb = new THREE.Vector3(...CENTERS[b]);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y += sag;
    mid.z -= 0.9;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.028, 6, false), mat);
    const haloMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.09, 8, false), haloMat);
    scene.add(tube, halo);
    const beadMat = new THREE.SpriteMaterial({ map: glow, color: 0xd6c8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const beads: THREE.Sprite[] = [];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(beadMat);
      sp.scale.setScalar(0.32);
      scene.add(sp);
      beads.push(sp);
    }
    return { path: new Path(curve), mat, haloMat, beadMat, beads, level: 0 };
  });
  const tLab = stage.label('shared entanglement', [0.9, SPHERE_Y - 1.55, -0.9], 'muted');
  tLab.element.style.color = css(PALETTE.violet);

  // --- Classical bit packets
  const packetPaths = [0, 1].map((s) => {
    const pa = new THREE.Vector3(CENTERS[s][0], SPHERE_Y - 0.2, 0.6);
    const pb = new THREE.Vector3(CENTERS[2][0] - 0.3, SPHERE_Y - 0.1, 0.6);
    const mid = new THREE.Vector3((pa.x + pb.x) / 2, SPHERE_Y + (s === 0 ? 1.55 : 0.95), 1.4);
    return new Path(new THREE.QuadraticBezierCurve3(pa, mid, pb));
  });
  const packets = [0, 1].map((s) => {
    const mat = new THREE.SpriteMaterial({ map: glow, color: QCOL[s], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(0.7);
    scene.add(sp);
    const trailSprites: THREE.Sprite[] = [];
    const trailMat = new THREE.SpriteMaterial({ map: glow, color: QCOL[s], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Sprite(trailMat);
      t.scale.setScalar(0.42 - i * 0.05);
      scene.add(t);
      trailSprites.push(t);
    }
    const lab = stage.label('', [0, 0.42, 0], 'big', sp);
    lab.element.style.color = css(QCOL[s]);
    return { sp, mat, trailMat, trailSprites, lab };
  });

  // --- 3D circuit diagram
  const circuit = new THREE.Group();
  circuit.rotation.x = -0.1;
  scene.add(circuit);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(10.6, 2.3),
    new THREE.MeshBasicMaterial({ color: 0x0d1424, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  board.position.set(0.1, WIRE_Y[1], -0.25);
  circuit.add(board);
  const boardEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(10.6, 2.3)), new THREE.LineBasicMaterial({ color: 0x243049 }));
  boardEdge.position.copy(board.position);
  circuit.add(boardEdge);

  const qWirePts: number[] = [];
  qWirePts.push(-4.75, WIRE_Y[0], 0, COL_X[5], WIRE_Y[0], 0);
  qWirePts.push(-4.75, WIRE_Y[1], 0, COL_X[5], WIRE_Y[1], 0);
  qWirePts.push(-4.75, WIRE_Y[2], 0, 4.75, WIRE_Y[2], 0);
  const qWireGeo = new THREE.BufferGeometry();
  qWireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(qWirePts), 3));
  circuit.add(new THREE.LineSegments(qWireGeo, new THREE.LineBasicMaterial({ color: 0x6f7f9f })));
  const inLabs = ['|ψ⟩', '|0⟩', '|0⟩'];
  for (let w = 0; w < 3; w++) {
    const l = stage.label(inLabs[w], [-5.1, WIRE_Y[w], 0], 'big', circuit);
    l.element.style.color = css(QCOL[w]);
  }
  const outLab = stage.label('|ψ⟩', [5.1, WIRE_Y[2], 0], 'big', circuit);
  outLab.element.style.color = css(PALETTE.cyan);

  // Classical double wires: m2 from wire 2 to the X gate, m1 from wire 1 to the Z gate.
  function doubleLine(pts: [number, number][], mat: THREE.LineBasicMaterial): THREE.LineSegments {
    const arr: number[] = [];
    const o = 0.035;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const horiz = Math.abs(y1 - y0) < 1e-6;
      for (const s of [-1, 1]) {
        const dx = horiz ? 0 : s * o;
        const dy = horiz ? s * o : 0;
        arr.push(x0 + dx, y0 + dy, 0, x1 + dx, y1 + dy, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3));
    const ls = new THREE.LineSegments(g, mat);
    circuit.add(ls);
    return ls;
  }
  const cMat = [new THREE.LineBasicMaterial({ color: 0x55627e }), new THREE.LineBasicMaterial({ color: 0x55627e })];
  doubleLine([[COL_X[5] + 0.25, WIRE_Y[0]], [COL_X[8], WIRE_Y[0]], [COL_X[8], WIRE_Y[2] + 0.25]], cMat[0]);
  doubleLine([[COL_X[5] + 0.25, WIRE_Y[1]], [COL_X[7], WIRE_Y[1]], [COL_X[7], WIRE_Y[2] + 0.25]], cMat[1]);
  const cl1 = stage.label('m₁', [COL_X[8] + 0.28, WIRE_Y[0] - 0.3, 0], 'muted', circuit);
  const cl2 = stage.label('m₂', [COL_X[7] + 0.28, WIRE_Y[1] - 0.3, 0], 'muted', circuit);
  cl1.element.style.color = css(PALETTE.amber);
  cl2.element.style.color = css(PALETTE.violet);

  // Gate parts, grouped by step so the current one can glow.
  const stepMats: THREE.MeshStandardMaterial[][] = [];
  for (let k = 0; k < N_STEPS; k++) stepMats.push([]);
  const boxGeo = new THREE.BoxGeometry(0.5, 0.5, 0.18);
  const dotGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const oplusGeo = new THREE.TorusGeometry(0.15, 0.022, 8, 28);
  const barGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6);
  const gateMat = (k: number) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x223050, emissive: 0x000000, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 1 });
    stepMats[k].push(m);
    return m;
  };
  const gateLabels: Record<number, { element: HTMLElement }> = {};
  function box(k: number, w: number, txt: string): void {
    const m = new THREE.Mesh(boxGeo, gateMat(k));
    m.position.set(COL_X[k], WIRE_Y[w], 0);
    circuit.add(m);
    gateLabels[k * 10 + w] = stage.label(txt, [COL_X[k], WIRE_Y[w], 0.12], 'big', circuit);
  }
  function cnotAt(k: number, c: number, t: number): void {
    const mat = gateMat(k);
    const d = new THREE.Mesh(dotGeo, mat);
    d.position.set(COL_X[k], WIRE_Y[c], 0);
    const o = new THREE.Mesh(oplusGeo, mat);
    o.position.set(COL_X[k], WIRE_Y[t], 0);
    const len = Math.abs(WIRE_Y[c] - WIRE_Y[t]) + 0.15;
    const bar = new THREE.Mesh(barGeo, mat);
    bar.scale.y = len;
    bar.position.set(COL_X[k], (WIRE_Y[c] + WIRE_Y[t]) / 2 + (WIRE_Y[t] < WIRE_Y[c] ? -0.075 : 0.075), 0);
    const cross = new THREE.Mesh(barGeo, mat);
    cross.rotation.z = Math.PI / 2;
    cross.scale.y = 0.3;
    cross.position.set(COL_X[k], WIRE_Y[t], 0);
    circuit.add(d, o, bar, cross);
  }
  box(1, 1, 'H');
  cnotAt(2, 1, 2);
  cnotAt(3, 0, 1);
  box(4, 0, 'H');
  box(5, 0, 'M');
  box(5, 1, 'M');
  box(7, 2, 'X');
  box(8, 2, 'Z');
  // Step 0 marker: the input column; step 6: the classical wires (materials handled separately).
  const inMarker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.12), gateMat(0));
  inMarker.position.set(COL_X[0], WIRE_Y[1], -0.05);
  circuit.add(inMarker);
  const bellBrace = stage.label('Bell pair', [(COL_X[1] + COL_X[2]) / 2, WIRE_Y[2] - 0.5, 0], 'muted', circuit);
  bellBrace.element.style.color = css(PALETTE.violet);
  stage.label('Alice’s Bell measurement', [(COL_X[3] + COL_X[5]) / 2, WIRE_Y[0] + 0.52, 0], 'muted', circuit);
  stage.label('Bob’s correction', [(COL_X[7] + COL_X[8]) / 2, WIRE_Y[2] - 0.5, 0], 'muted', circuit);

  // Playhead
  const playMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
  const playhead = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 2.1), playMat);
  playhead.position.set(COL_X[0], WIRE_Y[1], -0.12);
  circuit.add(playhead);

  // --- Narrative overlay (top left)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '235px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '7px 9px',
    font: '10.5px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  let legendHtml = '';

  // --- Fidelity inset (top right)
  const inset = document.createElement('canvas');
  inset.width = 500;
  inset.height = 270;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '250px', height: '135px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  function shownStep(): number {
    // Bars are filled up to the last completed step.
    return animU >= 1 ? step : step - 1;
  }

  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '21px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('Bob’s fidelity F after each step', 16, 30);
    const x0 = 22;
    const x1 = W - 70;
    const yTop = 52;
    const yBot = Hh - 44;
    const yOf = (f: number) => yBot - f * (yBot - yTop);
    ictx.setLineDash([6, 6]);
    ictx.lineWidth = 1.5;
    for (const [f, txt, col] of [[2 / 3, '2/3', '#f5b642'], [0.5, '1/2', '#56627c'], [1, '1', '#56627c']] as [number, string, string][]) {
      ictx.strokeStyle = col;
      ictx.beginPath();
      ictx.moveTo(x0, yOf(f));
      ictx.lineTo(x1, yOf(f));
      ictx.stroke();
      ictx.fillStyle = col;
      ictx.fillText(txt, x1 + 8, yOf(f) + 7);
    }
    ictx.setLineDash([]);
    const done = shownStep();
    const bw = (x1 - x0) / N_STEPS;
    for (let k = 0; k < N_STEPS; k++) {
      const x = x0 + k * bw + 5;
      const w = bw - 10;
      if (k <= done) {
        ictx.fillStyle = k === done ? '#4fd1e8' : 'rgba(79,209,232,0.55)';
        ictx.fillRect(x, yOf(fid[k]), w, yBot - yOf(fid[k]));
      } else {
        ictx.strokeStyle = '#243049';
        ictx.strokeRect(x, yTop, w, yBot - yTop);
      }
      ictx.fillStyle = k === step ? '#f5b642' : '#8391ab';
      ictx.font = '17px JetBrains Mono, monospace';
      const t = SHORT[k];
      ictx.fillText(t, x + w / 2 - ictx.measureText(t).width / 2, Hh - 18);
    }
    if (batchN > 0) {
      ictx.font = '18px JetBrains Mono, monospace';
      ictx.fillStyle = '#dfe6f3';
      const t = `${batchN}-state avg ${batchMean.toFixed(3)}${batchForget ? ' (no fix)' : ''}`;
      ictx.fillText(t, W - 16 - ictx.measureText(t).width, 30);
    }
  }

  // --- Transition rules
  function rotAxis(k: number, s: number): ArrayLike<number> | null {
    if (k === 1 && s === 1) return H_AXIS;
    if (k === 4 && s === 0) return H_AXIS;
    if (k === 7 && s === 2 && m2 === 1 && !forget) return [1, 0, 0];
    if (k === 8 && s === 2 && m1 === 1 && !forget) return [0, 0, 1];
    return null;
  }

  function stepDuration(k: number): number {
    if (k === STEP_SEND) return 1.6 / bitSpeed;
    if (k === STEP_MEASURE) return 0.8;
    return 1.0;
  }

  function goTo(k: number, animate: boolean): void {
    if (k === STEP_MEASURE && step < STEP_MEASURE) {
      const th = thetaDeg * DEG;
      const ph = phiDeg * DEG;
      [m1, m2] = sampleOutcome(protocolState(th, ph, noise, 0, 0, false, 4), Math.random());
    }
    if (k < STEP_MEASURE) { m1 = 0; m2 = 0; }
    step = k;
    packets[0].lab.element.textContent = `m₁=${m1}`;
    packets[1].lab.element.textContent = `m₂=${m2}`;
    recompute();
    if (animate && k > 0) {
      animU = 0;
      animDur = stepDuration(k);
      if (k === STEP_MEASURE) {
        views[0].flash.opacity = 1;
        views[1].flash.opacity = 1;
      }
    } else {
      animU = 1;
    }
    updateDisplay();
    paintLegend();
    paintCircuit();
  }

  function updateDisplay(): void {
    const k = step;
    const u = ease(animU);
    for (let s = 0; s < 3; s++) {
      const to = vecs[k][s];
      if (animU >= 1 || k === 0) {
        cur[s].set(to);
        continue;
      }
      const from = vecs[k - 1][s];
      const ax = rotAxis(k, s);
      if (ax) {
        rotate(from, ax, Math.PI * u, cur[s]);
      } else {
        let w = u;
        if (k === STEP_SEND && s === 2) w = clamp01((animU - 0.92) / 0.08);
        if (k === STEP_MEASURE && s < 2) w = clamp01(animU * 3);
        for (let i = 0; i < 3; i++) cur[s][i] = from[i] + (to[i] - from[i]) * w;
      }
    }
    for (let s = 0; s < 3; s++) {
      const v = views[s];
      const len = Math.hypot(cur[s][0], cur[s][1], cur[s][2]);
      toScene(cur[s], 1, tv);
      v.arrow.set(tv, len * R);
      v.tip.visible = len > 0.02;
      v.tip.position.copy(tv).multiplyScalar(R);
      v.core.opacity = 0.9 * (1 - Math.min(1, len)) ** 2;
    }
    const bLen = Math.hypot(cur[2][0], cur[2][1], cur[2][2]);
    mixedLab.visible = bLen < 0.05 && step >= 2;
  }

  function setPsiGhost(): void {
    const th = thetaDeg * DEG;
    const ph = phiDeg * DEG;
    psiTarget[0] = Math.sin(th) * Math.cos(ph);
    psiTarget[1] = Math.sin(th) * Math.sin(ph);
    psiTarget[2] = Math.cos(th);
    toScene(psiTarget, 1, tv);
    ghost.set(tv, R);
    ghostLab.position.copy(tv).multiplyScalar(R * 1.2);
    ghostLab.position.x += 0.45;
  }

  function paintCircuit(): void {
    const done = shownStep();
    for (let k = 0; k < N_STEPS; k++) {
      const skipped = (k === 7 && (forget || (step >= 7 && m2 === 0))) || (k === 8 && (forget || (step >= 8 && m1 === 0)));
      for (const m of stepMats[k]) {
        if (k === step) {
          m.color.setHex(0x3a3220);
          m.emissive.setHex(PALETTE.amber);
          m.emissiveIntensity = 0.8;
        } else if (k <= done) {
          m.color.setHex(0x1d3a44);
          m.emissive.setHex(PALETTE.cyan);
          m.emissiveIntensity = 0.18;
        } else {
          m.color.setHex(0x223050);
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
        m.opacity = skipped ? 0.3 : 1;
      }
    }
    for (let b = 0; b < 2; b++) {
      const on = step === STEP_SEND ? PALETTE.amber : step > STEP_SEND ? (b === 0 ? PALETTE.amber : PALETTE.violet) : 0x55627e;
      cMat[b].color.setHex(on);
    }
    const xLab = gateLabels[7 * 10 + 2];
    const zLab = gateLabels[8 * 10 + 2];
    xLab.element.style.opacity = forget || (step >= 7 && m2 === 0) ? '0.35' : '1';
    zLab.element.style.opacity = forget || (step >= 8 && m1 === 0) ? '0.35' : '1';
  }

  const hi = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  function paintLegend(): void {
    const F = fid[step];
    const bits = `${m1}${m2}`;
    const lines: string[] = [];
    const head = `<div style="color:#dfe6f3;margin-bottom:3px">Step ${step}/${LAST} · ${STEP_NAMES[step]}</div>`;
    switch (step) {
      case 0: lines.push(`Alice holds an unknown state ${hi(PALETTE.amber, '|ψ⟩')}. Her second qubit and Bob’s start at |0⟩.`); break;
      case 1: lines.push(`H puts ${hi(PALETTE.violet, 'q₂')} on the equator.`); break;
      case 2: lines.push(`CNOT makes a Bell pair shared by Alice and Bob. ${hi(PALETTE.violet, 'The thread')} marks entanglement. Each half alone is random: its arrow shrinks to the centre.`); break;
      case 3: lines.push(`CNOT ties ${hi(PALETTE.amber, '|ψ⟩')} into the pair. All three qubits are now entangled.`); break;
      case 4: lines.push('H finishes Alice’s change of basis. Bob’s qubit is still I/2. Nothing Alice does reaches him.'); break;
      case 5: lines.push(`Alice reads ${hi(PALETTE.amber, `m₁m₂ = ${bits}`)} (P = ${pOutcome.toFixed(2)}). Her spheres snap to poles. The original is gone. Without m, Bob can only say his qubit is I/2.`); break;
      case 6: lines.push(`Two classical bits fly to Bob at ${bitSpeed.toFixed(2)} c. Only when they land does Bob know which flip he holds.`); break;
      case 7: lines.push(forget ? 'Bob forgets the correction.' : m2 ? 'm₂ = 1, so Bob applies X.' : 'm₂ = 0, so no X is needed.'); break;
      case 8: lines.push(forget ? `No correction. Bob keeps σ_m|ψ⟩ with F = ${F.toFixed(3)}.` : `${m1 ? 'm₁ = 1, so Bob applies Z.' : 'm₁ = 0, so no Z is needed.'} Bob now holds ${hi(PALETTE.cyan, '|ψ⟩')} with F = ${F.toFixed(3)}.`); break;
    }
    const html = `${head}<div>${lines.join('')}</div>`;
    if (html !== legendHtml) {
      legend.innerHTML = html;
      legendHtml = html;
    }
  }

  // --- Controls
  const ui = new Panel(panel);
  const touch = () => { touched = true; };
  ui.section('Protocol');
  const [, runBtn] = ui.buttons([
    { label: 'Step', primary: true, key: 'step', onClick: () => { touch(); setRunning(false); doStep(); } },
    { label: 'Run', key: 'step', onClick: () => { touch(); if (running) { setRunning(false); } else { if (step >= LAST) goTo(0, false); setRunning(true); } } },
    { label: 'Reset', key: 'step', onClick: () => { touch(); setRunning(false); goTo(0, false); } },
  ]);
  ui.toggle({ key: 'forget', label: 'Forget the correction', value: forget, onChange: (v) => { touch(); forget = v; recompute(); updateDisplay(); paintLegend(); paintCircuit(); } });
  ui.slider({ key: 'speed', label: 'Bit speed v / c', min: 0.2, max: 1, step: 0.05, value: bitSpeed, format: (v) => `${v.toFixed(2)} c`, onInput: (v) => { touch(); bitSpeed = v; } });

  ui.section('Unknown state |ψ⟩ (Alice does not know it)');
  const thetaCtl = ui.slider({ key: 'theta', label: 'Polar angle θ', min: 0, max: 180, step: 1, value: thetaDeg, unit: '°', onInput: (v) => { touch(); thetaDeg = v; paramsChanged(); } });
  const phiCtl = ui.slider({ key: 'phi', label: 'Phase φ', min: 0, max: 359, step: 1, value: phiDeg, unit: '°', onInput: (v) => { touch(); phiDeg = v; paramsChanged(); } });
  ui.buttons([
    { label: 'Random state', key: 'theta', onClick: () => {
      touch();
      const [th, ph] = randomAngles();
      thetaDeg = Math.round(th / DEG);
      phiDeg = Math.round(ph / DEG) % 360;
      thetaCtl.set(thetaDeg, false);
      phiCtl.set(phiDeg, false);
      setRunning(false);
      goTo(0, false);
      setPsiGhost();
    } },
  ]);

  ui.section('Noisy Bell pair (Werner state)');
  ui.slider({ key: 'noise', label: 'Pair noise λ', min: 0, max: 1, step: 0.01, value: noise, onInput: (v) => { touch(); noise = v; paramsChanged(); } });
  const rFp = ui.readout('noise', 'pair overlap F_pair');
  const rFpred = ui.readout('fpred', 'predicted (1+2F_pair)/3');

  ui.section('Statistics');
  ui.buttons([{ label: 'Average over 50 states', key: 'batch', onClick: () => { touch(); runBatch(); } }]);
  const rBatch = ui.readout('batch', '50-state mean F');

  ui.section('Live readouts');
  const rStep = ui.readout('step', 'step');
  const rBits = ui.readout('bits', 'bits m₁m₂');
  const rF = ui.readout('fidelity', 'Bob’s fidelity F');
  const rLen = ui.readout('bobLen', 'Bob’s |r|');
  const rRho = ui.readout('rhoB', 'Bob’s ρ_B');
  const rTr = ui.readout('trace', 'trace error |Tr ρ − 1|');
  ui.legend([
    { color: css(PALETTE.amber), label: 'q₁ unknown |ψ⟩' },
    { color: css(PALETTE.violet), label: 'q₂ Alice’s half' },
    { color: css(PALETTE.cyan), label: 'q₃ Bob’s half' },
  ]);
  ui.note('The faint amber arrow on Bob’s sphere is the target |ψ⟩. An arrow on the surface is a pure state. A shorter arrow is mixed. A dot at the centre is I/2: a fair coin along every axis.');

  function setRunning(v: boolean): void {
    running = v;
    pauseT = 0.35;
    runBtn.textContent = running ? 'Pause' : 'Run';
  }

  function doStep(): void {
    if (animU < 1) {
      animU = 1;
      updateDisplay();
      paintCircuit();
      return;
    }
    if (step < LAST) goTo(step + 1, true);
  }

  function paramsChanged(): void {
    recompute();
    setPsiGhost();
    updateDisplay();
    paintLegend();
    paintCircuit();
  }

  function runBatch(): void {
    let sum = 0;
    for (let i = 0; i < 50; i++) {
      const [th, ph] = randomAngles();
      const k = Math.min(3, Math.floor(Math.random() * 4)); // every outcome has probability 1/4
      sum += teleport(th, ph, noise, k >> 1, k & 1, forget).F;
    }
    batchN = 50;
    batchMean = sum / 50;
    batchForget = forget;
    batchNoise = noise;
  }

  function updateReadouts(): void {
    rStep(`${step}/${LAST} ${STEP_NAMES[step]}`);
    rBits(step >= STEP_MEASURE ? `${m1}${m2}  (P = ${pOutcome.toFixed(3)})` : '–');
    const F = fid[step];
    rF(F.toFixed(4));
    const bl = Math.hypot(vecs[step][2][0], vecs[step][2][1], vecs[step][2][2]);
    rLen(bl.toFixed(4));
    const off = Math.hypot(bobRho.re[1], bobRho.im[1]);
    rRho(bl < 1e-9 ? 'I/2 exactly' : `ρ₀₀ ${bobRho.re[0].toFixed(3)} |ρ₀₁| ${off.toFixed(3)}`);
    rTr(traceErr.toExponential(1));
    rFp(fPair.toFixed(3));
    rFpred(wernerTeleportFidelity(fPair).toFixed(3));
    rBatch(batchN ? `${batchMean.toFixed(3)}${batchForget ? ' (no fix)' : ''}` : '–');
  }

  // --- Frame loop
  let uiTimer = 0;
  let insetTimer = 0;
  let clock = 0;
  let demoWait = 1.2;
  let demo = true;
  stage.onFrame((dt) => {
    clock += dt;
    if (demo && !touched) {
      demoWait -= dt;
      if (demoWait <= 0) {
        demo = false;
        setRunning(true);
      }
    } else demo = false;

    if (animU < 1) {
      animU = Math.min(1, animU + dt / animDur);
      updateDisplay();
      if (animU >= 1) {
        paintCircuit();
        if (step === STEP_SEND) views[2].flash.opacity = 1;
      }
    } else if (running) {
      pauseT -= dt;
      if (pauseT <= 0) {
        if (step < LAST) {
          goTo(step + 1, true);
          pauseT = 0.45;
        } else setRunning(false);
      }
    }

    // Flash decay
    for (const v of views) if (v.flash.opacity > 0) v.flash.opacity = Math.max(0, v.flash.opacity - dt * 1.6);

    // Threads
    const shown = animU >= 1 ? step : step - 0.5;
    const strength = 1 - noise * 0.75;
    for (let i = 0; i < threads.length; i++) {
      const th = threads[i];
      const on = i === 0 ? shown >= 2 && shown < STEP_MEASURE - 0.5 : shown >= 3 && shown < STEP_MEASURE - 0.5;
      const target = on ? strength : 0;
      th.level += (target - th.level) * Math.min(1, dt * (on ? 3 : 7));
      const pulse = 0.75 + 0.25 * Math.sin(clock * 3 + i);
      th.mat.opacity = 0.75 * th.level * pulse;
      th.haloMat.opacity = 0.16 * th.level * pulse;
      th.beadMat.opacity = 0.9 * th.level;
      if (i === 0) tLab.visible = th.level > 0.1;
      for (let b = 0; b < th.beads.length; b++) {
        const u = (clock * 0.22 + b / th.beads.length + i * 0.13) % 1;
        th.path.at(0.5 + 0.5 * Math.sin(u * Math.PI * 2), th.beads[b].position);
      }
    }

    // Packets
    const flying = step === STEP_SEND && animU < 1;
    for (let b = 0; b < 2; b++) {
      const p = packets[b];
      p.mat.opacity = flying ? 1 : 0;
      p.trailMat.opacity = flying ? 0.45 : 0;
      p.lab.visible = flying;
      if (flying) {
        packetPaths[b].at(animU, p.sp.position);
        for (let i = 0; i < p.trailSprites.length; i++) packetPaths[b].at(animU - (i + 1) * 0.018, p.trailSprites[i].position);
      }
    }

    // Playhead glides to the current column.
    const px = COL_X[step];
    playhead.position.x += (px - playhead.position.x) * Math.min(1, dt * 6);
    playMat.opacity = 0.1 + 0.06 * Math.sin(clock * 4);

    insetTimer += dt;
    if (insetTimer > 0.1) {
      insetTimer = 0;
      drawInset();
    }
    uiTimer += dt;
    if (uiTimer > 0.15) {
      uiTimer = 0;
      updateReadouts();
      paintLegend();
    }
  });

  // --- Init
  setPsiGhost();
  goTo(0, false);
  updateReadouts();
  drawInset();

  return {
    state: () => {
      const bl = Math.hypot(vecs[step][2][0], vecs[step][2][1], vecs[step][2][2]);
      return {
        step,
        stepName: STEP_NAMES[step],
        theta: thetaDeg,
        phi: phiDeg,
        noise,
        forget,
        m1,
        m2,
        fidelity: fid[step],
        bobLen: bl,
        pairFidelity: fPair,
        done: step === LAST && animU >= 1,
        bitsArrived: step > STEP_SEND || (step === STEP_SEND && animU >= 1),
        running,
        touched,
        batchN,
        batchMean,
        batchForget,
        batchNoise,
      };
    },
    dispose: () => {
      legend.remove();
      inset.remove();
      glow.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quantum-teleportation',
  number: 48,
  title: 'Quantum Teleportation',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'Move a quantum state without moving the particle.',
  content,
  mount,
};

export default topic;
