import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  GAMMA_P_MHZ_PER_T, anglesFromBloch, blochFromAngles, gate, probPlus, purity, rabiP1, rk4Bloch, rotateVec,
  type BlochParams, type GateName,
} from './physics.ts';

type Mode = 'gates' | 'larmor' | 'rabi';
type Axis = 'z' | 'x' | 'y' | 'n';

const DEG = Math.PI / 180;
const R = 2; // sphere radius in scene units
const H = 0.002; // integrator step (s of scene time)
/** Scene precession rate: turns per second per tesla. The real proton does 42.58 million. */
const LARMOR_VIS = 0.2;
const SLOWDOWN = (GAMMA_P_MHZ_PER_T * 1e6) / LARMOR_VIS;
const PLOT_N = 420;
const CAM: [number, number, number] = [7.0, 3.5, -3.7];

const KETS: Record<Axis, [string, string]> = {
  z: ['|0⟩', '|1⟩'],
  x: ['|+⟩', '|−⟩'],
  y: ['|+i⟩', '|−i⟩'],
  n: ['+n̂', '−n̂'],
};

const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

/** Physics (x, y, z) with z up maps to scene (x, z, -y). Right-handed both ways. */
function toScene(v: ArrayLike<number>, s: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v[0] * s, v[2] * s, -v[1] * s);
}

interface VecArrow {
  group: THREE.Group;
  set(dir: THREE.Vector3, len: number): void;
}

function makeVecArrow(color: number, shaftR: number, headR: number, headLen: number, opacity = 1): VecArrow {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1,
    transparent: opacity < 1, opacity,
  });
  const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, 1, 14);
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 22), mat);
  group.add(shaft, head);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  return {
    group,
    set(dir, len) {
      if (len < 1e-3 || dir.lengthSq() < 1e-12) {
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

function circlePoints(n: number): Float32Array {
  const a = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    a[i * 3] = Math.cos(t) * R;
    a[i * 3 + 1] = 0;
    a[i * 3 + 2] = Math.sin(t) * R;
  }
  return a;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: [0, 0, 0], fov: 40 });
  const { scene } = stage;

  // --- State
  const r = new Float64Array(3);
  let mode: Mode = 'gates';
  let playing = true;
  let speed = 1;
  let Bmag = 1;
  let Bth = 0;
  let Bph = 0;
  let Om = 1;
  let Del = 0;
  let decoh = false;
  let T1 = 20;
  let T2 = 10;
  let axis: Axis = 'z';
  let mth = 60;
  let mph = 0;
  let alphaDeg = 90;
  const nAx = new Float64Array([0, 0, 1]);
  const bHat = new Float64Array([0, 0, 1]);
  let seq: string[] = [];
  let fromZero = false;
  let tDrive = 0;
  let pulseStop = Infinity;
  let rabiFromZero = false;
  let rabiValid = false;
  let rabiPeak = 0;
  let batchPlus = -1;
  let batchAxis = '';
  let batchPrepX = 0;
  let batchP = 0;
  let lastOutcome = '–';
  let clock = 0;

  const params: BlochParams = { w: new Float64Array(3), eq: new Float64Array([0, 0, 1]), g1: 0, g2: 0 };

  // --- Glass sphere with a Fresnel rim
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6aa8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor*(0.35+0.9*f), 0.035 + 0.42*f); }`,
    transparent: true,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), glassMat);
  glass.renderOrder = 2;
  scene.add(glass);

  // Great circles and latitude rings
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(circlePoints(128), 3));
  const ringMat = new THREE.LineBasicMaterial({ color: 0x5a7bb0, transparent: true, opacity: 0.75 });
  const faintMat = new THREE.LineBasicMaterial({ color: 0x33476e, transparent: true, opacity: 0.55 });
  const equator = new THREE.Line(ringGeo, ringMat);
  scene.add(equator);
  const merA = new THREE.Line(ringGeo, faintMat);
  merA.rotation.x = Math.PI / 2; // xz-physics plane
  scene.add(merA);
  const merB = new THREE.Line(ringGeo, faintMat);
  merB.rotation.z = Math.PI / 2; // yz-physics plane
  scene.add(merB);
  for (const lat of [-45, 45]) {
    const c = new THREE.Line(ringGeo, faintMat);
    const s = Math.cos(lat * DEG);
    c.scale.set(s, 1, s);
    c.position.y = Math.sin(lat * DEG) * R;
    scene.add(c);
  }

  // Axes
  const axPts = new Float32Array([-1.18 * R, 0, 0, 1.18 * R, 0, 0, 0, -1.18 * R, 0, 0, 1.18 * R, 0, 0, 0, -1.18 * R, 0, 0, 1.18 * R]);
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.BufferAttribute(axPts, 3));
  scene.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: 0x46587c, transparent: true, opacity: 0.8 })));

  // Pole labels
  const tv = new THREE.Vector3();
  const poles: [string, [number, number, number]][] = [
    ['|0⟩', [0, 0, 1]], ['|1⟩', [0, 0, -1]], ['|+⟩', [1, 0, 0]], ['|−⟩', [-1, 0, 0]], ['|+i⟩', [0, 1, 0]], ['|−i⟩', [0, -1, 0]],
  ];
  for (const [txt, v] of poles) stage.label(txt, toScene(v, R * 1.27, tv).clone(), 'big');
  stage.label('z', toScene([0, 0, 1], R * 1.27, tv).clone().add(new THREE.Vector3(0, 0.3, 0)), 'muted');
  stage.label('x', toScene([1, 0, 0], R * 1.27, tv).clone().add(new THREE.Vector3(0, -0.3, 0)), 'muted');
  stage.label('y', toScene([0, 1, 0], R * 1.27, tv).clone().add(new THREE.Vector3(0, -0.3, 0)), 'muted');

  // State arrow, tip and trail
  const stateArrow = makeVecArrow(PALETTE.amber, 0.04, 0.12, 0.3);
  scene.add(stateArrow.group);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe2a3 }));
  scene.add(tip);
  const trail = new Trail(900, PALETTE.amber, 0.95);
  scene.add(trail.line);
  let lastTx = 1e9, lastTy = 1e9, lastTz = 1e9;

  // Theta / phi construction lines
  const ARC_N = 40;
  const thetaPos = new Float32Array((ARC_N + 1) * 3);
  const phiPos = new Float32Array((ARC_N + 1) * 3);
  const thetaGeo = new THREE.BufferGeometry();
  thetaGeo.setAttribute('position', new THREE.BufferAttribute(thetaPos, 3));
  const phiGeo = new THREE.BufferGeometry();
  phiGeo.setAttribute('position', new THREE.BufferAttribute(phiPos, 3));
  const thetaArc = new THREE.Line(thetaGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8 }));
  const phiArc = new THREE.Line(phiGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.8 }));
  thetaArc.frustumCulled = false;
  phiArc.frustumCulled = false;
  scene.add(thetaArc, phiArc);
  const projPos = new Float32Array(12);
  const projGeo = new THREE.BufferGeometry();
  projGeo.setAttribute('position', new THREE.BufferAttribute(projPos, 3));
  const proj = new THREE.LineSegments(projGeo, new THREE.LineBasicMaterial({ color: 0x8391ab, transparent: true, opacity: 0.45 }));
  proj.frustumCulled = false;
  scene.add(proj);
  const thetaLab = stage.label('θ', [0, 0, 0], 'muted');
  const phiLab = stage.label('φ', [0, 0, 0], 'muted');
  thetaLab.element.style.color = css(PALETTE.amber);
  phiLab.element.style.color = css(PALETTE.cyan);

  // Measurement axis
  const mPos = new Float32Array(6);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  const mLine = new THREE.Line(mGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.8 }));
  mLine.frustumCulled = false;
  scene.add(mLine);
  const mPlus = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  const mMinus = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshBasicMaterial({ color: 0x2f7a55 }));
  scene.add(mPlus, mMinus);
  const nLab = stage.label('n̂', [0, 0, 0], 'muted');
  nLab.element.style.color = css(PALETTE.green);

  // Collapse flash
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0, depthWrite: false }));
  scene.add(flash);
  let flashT = 0;

  // B field and drive axis
  const bArrow = makeVecArrow(PALETTE.violet, 0.03, 0.1, 0.26, 0.9);
  scene.add(bArrow.group);
  const bLab = stage.label('B', [0, 0, 0], 'big');
  bLab.element.style.color = css(PALETTE.violet);
  bLab.element.style.marginLeft = '26px';
  const dArrow = makeVecArrow(PALETTE.rose, 0.03, 0.1, 0.26, 0.9);
  scene.add(dArrow.group);
  const dLab = stage.label('Ω_eff', [0, 0, 0], '');
  dLab.element.style.color = css(PALETTE.rose);

  // Gate rotation axis
  const gPos = new Float32Array(6);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const gLine = new THREE.Line(gGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.95 }));
  gLine.frustumCulled = false;
  gLine.visible = false;
  scene.add(gLine);
  const gLab = stage.label('', [0, 0, 0], 'big');
  gLab.element.style.color = css(PALETTE.cyan);
  gLab.visible = false;

  // --- Legend overlay (top left)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  let legendHtml = '';

  const insetStyle = {
    position: 'absolute', right: '10px', width: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };

  // --- P1(t) plot (top right)
  const plot = document.createElement('canvas');
  plot.width = 500;
  plot.height = 240;
  Object.assign(plot.style, { ...insetStyle, top: '10px', height: '120px' } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const plotT = new Float64Array(PLOT_N);
  const plotP = new Float64Array(PLOT_N);
  const plotF = new Float64Array(PLOT_N);
  let plotHead = 0;
  let plotCount = 0;

  // --- Histogram (bottom right)
  const hist = document.createElement('canvas');
  hist.width = 500;
  hist.height = 260;
  Object.assign(hist.style, { ...insetStyle, bottom: '10px', height: '130px' } as CSSStyleDeclaration);
  viewport.appendChild(hist);
  const hctx = hist.getContext('2d')!;

  // --- Helpers
  function setAxisVec(): void {
    if (axis === 'z') { nAx[0] = 0; nAx[1] = 0; nAx[2] = 1; }
    if (axis === 'x') { nAx[0] = 1; nAx[1] = 0; nAx[2] = 0; }
    if (axis === 'y') { nAx[0] = 0; nAx[1] = 1; nAx[2] = 0; }
    if (axis === 'n') blochFromAngles(mth * DEG, mph * DEG, nAx);
    toScene(nAx, -1.3 * R, tv);
    mPos[0] = tv.x; mPos[1] = tv.y; mPos[2] = tv.z;
    toScene(nAx, 1.3 * R, tv);
    mPos[3] = tv.x; mPos[4] = tv.y; mPos[5] = tv.z;
    mGeo.attributes.position.needsUpdate = true;
    toScene(nAx, R, tv);
    mPlus.position.copy(tv);
    mMinus.position.copy(tv).negate();
    nLab.visible = axis === 'n';
    toScene(nAx, 1.42 * R, tv);
    nLab.position.copy(tv);
  }

  function setField(): void {
    blochFromAngles(Bth * DEG, Bph * DEG, bHat);
  }

  function clearPlot(): void {
    plotHead = 0;
    plotCount = 0;
  }

  function resetTrail(): void {
    trail.clear();
    lastTx = 1e9;
  }

  /** Set a pure state from angles. Clears the gate history and the Rabi bookkeeping. */
  function prepare(thetaDeg: number, phiDeg: number, clearTrail = true): void {
    blochFromAngles(thetaDeg * DEG, phiDeg * DEG, r);
    afterPrep(clearTrail);
  }

  function afterPrep(clearTrail: boolean): void {
    seq = [];
    fromZero = false;
    anim = null;
    queue.length = 0;
    gLine.visible = false;
    gLab.visible = false;
    tDrive = 0;
    pulseStop = Infinity;
    rabiFromZero = mode === 'rabi' && r[2] > 0.9999;
    rabiValid = rabiFromZero && !decoh;
    rabiPeak = 0;
    clearPlot();
    if (clearTrail) resetTrail();
  }

  // --- Gate animation
  interface Anim { name: string; axis: Float64Array; angle: number; r0: Float64Array; u: number; dur: number }
  let anim: Anim | null = null;
  const queue: { name: string; axis: [number, number, number]; angle: number }[] = [];
  const animAxis = new Float64Array(3);
  const animR0 = new Float64Array(3);

  function enqueue(name: GateName): void {
    const g = gate(name, alphaDeg * DEG);
    const label = name.startsWith('R') ? `${name}(${alphaDeg}°)` : name;
    queue.push({ name: label, axis: g.axis, angle: g.angle });
    if (!anim) startNext();
  }

  function startNext(): void {
    const q = queue.shift();
    if (!q) {
      gLine.visible = false;
      gLab.visible = false;
      return;
    }
    if (seq.length === 0) fromZero = r[2] > 0.999;
    seq.push(q.name);
    rabiFromZero = false;
    rabiValid = false;
    animAxis.set(q.axis);
    animR0.set(r);
    anim = { name: q.name, axis: animAxis, angle: q.angle, r0: animR0, u: 0, dur: 0.45 + (0.4 * Math.abs(q.angle)) / Math.PI };
    toScene(animAxis, -1.35 * R, tv);
    gPos[0] = tv.x; gPos[1] = tv.y; gPos[2] = tv.z;
    toScene(animAxis, 1.35 * R, tv);
    gPos[3] = tv.x; gPos[4] = tv.y; gPos[5] = tv.z;
    gGeo.attributes.position.needsUpdate = true;
    gLine.visible = true;
    gLab.visible = true;
    gLab.element.textContent = q.name;
    toScene(animAxis, 1.5 * R, tv);
    gLab.position.copy(tv);
  }

  /** Finish any running or queued gates at once, so a measurement sees the final state. */
  function flushGates(): void {
    if (anim) {
      rotateVec(anim.r0, anim.axis, anim.angle, r);
      anim = null;
    }
    for (let q = queue.shift(); q; q = queue.shift()) {
      if (seq.length === 0) fromZero = r[2] > 0.999;
      seq.push(q.name);
      rotateVec(r, q.axis, q.angle, r);
    }
    gLine.visible = false;
    gLab.visible = false;
  }

  // --- Measurement
  function measureOnce(): void {
    flushGates();
    const p = probPlus(r, nAx);
    const plus = Math.random() < p;
    const s = plus ? 1 : -1;
    r[0] = s * nAx[0];
    r[1] = s * nAx[1];
    r[2] = s * nAx[2];
    lastOutcome = `${KETS[axis][plus ? 0 : 1]} (p=${(plus ? p : 1 - p).toFixed(2)})`;
    afterPrep(true);
    syncSliders();
    toScene(r, R, tv);
    flash.position.copy(tv);
    flashT = 1;
  }

  function measure100(): void {
    flushGates();
    const p = probPlus(r, nAx);
    let k = 0;
    for (let i = 0; i < 100; i++) if (Math.random() < p) k++;
    batchPlus = k;
    batchAxis = axis;
    batchPrepX = r[0];
    batchP = p;
    drawHist();
  }

  // --- Evolution
  function evolve(simDt: number): void {
    const w = params.w;
    const eq = params.eq;
    eq[0] = 0; eq[1] = 0; eq[2] = 1;
    w[0] = 0; w[1] = 0; w[2] = 0;
    params.g1 = decoh ? 1 / T1 : 0;
    params.g2 = decoh ? 1 / T2 : 0;
    if (mode === 'gates' && !decoh) return;
    if (mode === 'larmor') {
      const wl = 2 * Math.PI * LARMOR_VIS * Bmag;
      // gamma > 0: dr/dt = gamma r x B, i.e. precession vector -gamma B
      w[0] = -wl * bHat[0];
      w[1] = -wl * bHat[1];
      w[2] = -wl * bHat[2];
      if (Bmag > 0) { eq[0] = bHat[0]; eq[1] = bHat[1]; eq[2] = bHat[2]; }
    } else if (mode === 'rabi') {
      w[0] = Om;
      w[2] = Del;
      if (Number.isFinite(pulseStop)) simDt = Math.max(0, Math.min(simDt, pulseStop - tDrive));
    }
    if (simDt <= 0) return;
    const steps = Math.max(1, Math.ceil(simDt / H));
    const h = simDt / steps;
    for (let k = 0; k < steps; k++) rk4Bloch(r, params, h);
    if (mode === 'rabi') {
      tDrive += simDt;
      if (rabiFromZero) rabiPeak = Math.max(rabiPeak, (1 - r[2]) / 2);
      if (Number.isFinite(pulseStop) && tDrive >= pulseStop - 1e-9) {
        pulseStop = Infinity;
        setPlaying(false);
      }
    }
  }

  // --- Drawing
  const dirV = new THREE.Vector3();
  const aV = new THREE.Vector3();

  function drawScene(): void {
    const len = Math.hypot(r[0], r[1], r[2]);
    toScene(r, R, dirV);
    stateArrow.set(dirV, len * R);
    tip.position.copy(dirV);
    tip.visible = len > 0.02;
    const dx = dirV.x - lastTx, dy = dirV.y - lastTy, dz = dirV.z - lastTz;
    if (dx * dx + dy * dy + dz * dz > 1e-4) {
      trail.push(dirV.x, dirV.y, dirV.z);
      lastTx = dirV.x; lastTy = dirV.y; lastTz = dirV.z;
    }
    // theta and phi arcs
    const [th, ph] = anglesFromBloch(r);
    const ux = Math.cos(ph), uy = Math.sin(ph);
    const rt = 0.42 * R;
    for (let i = 0; i <= ARC_N; i++) {
      const s = (th * i) / ARC_N;
      // physics (sin s * u, cos s) -> scene
      thetaPos[i * 3] = Math.sin(s) * ux * rt;
      thetaPos[i * 3 + 1] = Math.cos(s) * rt;
      thetaPos[i * 3 + 2] = -Math.sin(s) * uy * rt;
      const f = (ph * i) / ARC_N;
      const rp = 0.34 * R;
      phiPos[i * 3] = Math.cos(f) * rp;
      phiPos[i * 3 + 1] = 0;
      phiPos[i * 3 + 2] = -Math.sin(f) * rp;
    }
    thetaGeo.attributes.position.needsUpdate = true;
    phiGeo.attributes.position.needsUpdate = true;
    const showArcs = len > 0.05 && th > 0.03;
    thetaArc.visible = showArcs;
    thetaLab.visible = showArcs && th > 0.15;
    phiArc.visible = showArcs && th < Math.PI - 0.03 && ph > 0.03;
    phiLab.visible = phiArc.visible && ph > 0.2;
    const sm = th / 2;
    thetaLab.position.set(Math.sin(sm) * ux * rt * 1.35, Math.cos(sm) * rt * 1.35, -Math.sin(sm) * uy * rt * 1.35);
    const pm = ph / 2;
    phiLab.position.set(Math.cos(pm) * 0.34 * R * 1.4, 0, -Math.sin(pm) * 0.34 * R * 1.4);
    // projection onto the equatorial plane
    projPos[0] = dirV.x; projPos[1] = dirV.y; projPos[2] = dirV.z;
    projPos[3] = dirV.x; projPos[4] = 0; projPos[5] = dirV.z;
    projPos[6] = 0; projPos[7] = 0; projPos[8] = 0;
    projPos[9] = dirV.x; projPos[10] = 0; projPos[11] = dirV.z;
    projGeo.attributes.position.needsUpdate = true;
    proj.visible = showArcs;

    // Field / drive arrows
    bArrow.group.visible = false;
    bLab.visible = mode === 'larmor' && Bmag > 0;
    if (mode === 'larmor' && Bmag > 0) {
      toScene(bHat, 1, aV);
      const L = R * (0.75 + 0.25 * Bmag);
      bArrow.set(aV, L);
      bLab.position.copy(aV).multiplyScalar(L * 0.8);
    }
    dArrow.group.visible = false;
    dLab.visible = mode === 'rabi';
    if (mode === 'rabi') {
      const m = Math.hypot(Om, Del);
      aV.set(Om / m, Del / m, 0); // physics (Om, 0, Del) -> scene (Om, Del, 0)
      const L = R * 1.3;
      dArrow.set(aV, L);
      dLab.position.copy(aV).multiplyScalar(L + 0.3);
    }
    if (flashT > 0) {
      flash.visible = true;
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.7 * flashT;
      flash.scale.setScalar(1 + 2.5 * (1 - flashT));
    } else flash.visible = false;
  }

  function drawPlot(): void {
    const W = plot.width, Hh = plot.height;
    const x0 = 16, x1 = W - 16, y0 = 50, y1 = Hh - 20;
    pctx.clearRect(0, 0, W, Hh);
    pctx.font = '600 20px JetBrains Mono, monospace';
    pctx.fillStyle = '#b8c3d9';
    pctx.fillText('P₁ = (1 − z)/2', 16, 30);
    pctx.font = '18px JetBrains Mono, monospace';
    pctx.fillStyle = '#8391ab';
    const tag = mode === 'rabi' ? (rabiValid ? 'dashed: Rabi formula' : 'vs drive time') : 'vs time';
    pctx.fillText(tag, W - 16 - pctx.measureText(tag).width, 30);
    pctx.strokeStyle = '#243049';
    pctx.lineWidth = 1.5;
    for (const v of [0, 0.5, 1]) {
      const y = y1 - v * (y1 - y0);
      pctx.beginPath();
      pctx.moveTo(x0, y);
      pctx.lineTo(x1, y);
      pctx.stroke();
      pctx.fillStyle = '#56627c';
      pctx.fillText(String(v), x1 - 30, y - 5);
    }
    if (plotCount < 2) {
      pctx.fillStyle = '#8391ab';
      pctx.fillText(mode === 'rabi' ? 'Press Drive or π pulse.' : 'Apply a gate, or try Larmor or Rabi.', x0 + 6, (y0 + y1) / 2 + 20);
      return;
    }
    const first = (plotHead - plotCount + PLOT_N) % PLOT_N;
    const tLast = plotT[(plotHead - 1 + PLOT_N) % PLOT_N];
    const tFirst = plotT[first];
    const span = Math.max(8, tLast - tFirst);
    const X = (t: number) => x0 + ((t - (tLast - span)) / span) * (x1 - x0 - 40);
    const line = (arr: Float64Array, color: string, dash: boolean) => {
      pctx.save();
      pctx.strokeStyle = color;
      pctx.lineWidth = dash ? 2.5 : 3.5;
      if (dash) pctx.setLineDash([10, 8]);
      pctx.beginPath();
      for (let k = 0; k < plotCount; k++) {
        const i = (first + k) % PLOT_N;
        const x = X(plotT[i]);
        const y = y1 - arr[i] * (y1 - y0);
        if (k === 0) pctx.moveTo(x, y);
        else pctx.lineTo(x, y);
      }
      pctx.stroke();
      pctx.restore();
    };
    line(plotP, css(PALETTE.amber), false);
    if (mode === 'rabi' && rabiValid) line(plotF, css(PALETTE.rose), true);
  }

  function drawHist(): void {
    const W = hist.width, Hh = hist.height;
    hctx.clearRect(0, 0, W, Hh);
    hctx.font = '600 20px JetBrains Mono, monospace';
    hctx.fillStyle = '#b8c3d9';
    hctx.fillText('Measure ×100', 16, 30);
    if (batchPlus < 0) {
      hctx.font = '18px JetBrains Mono, monospace';
      hctx.fillStyle = '#8391ab';
      hctx.fillText('100 fresh copies of the state,', 16, 90);
      hctx.fillText('each measured once. Press', 16, 120);
      hctx.fillText('Measure ×100 to fill this in.', 16, 150);
      return;
    }
    hctx.font = '18px JetBrains Mono, monospace';
    hctx.fillStyle = '#8391ab';
    const ax = `along ${batchAxis === 'n' ? 'n̂' : batchAxis}`;
    hctx.fillText(ax, W - 16 - hctx.measureText(ax).width, 30);
    const top = 56, base = Hh - 44, bw = 120;
    const cols: [number, string, string, number][] = [
      [batchPlus, KETS[batchAxis as Axis][0], css(PALETTE.green), batchP],
      [100 - batchPlus, KETS[batchAxis as Axis][1], css(PALETTE.violet), 1 - batchP],
    ];
    cols.forEach(([count, name, color, p], i) => {
      const cx = 110 + i * 200;
      const hgt = (count / 100) * (base - top);
      hctx.fillStyle = color;
      hctx.globalAlpha = 0.85;
      hctx.fillRect(cx - bw / 2, base - hgt, bw, hgt);
      hctx.globalAlpha = 1;
      // Born prediction
      const yp = base - p * (base - top);
      hctx.strokeStyle = '#dfe6f3';
      hctx.setLineDash([8, 6]);
      hctx.lineWidth = 2;
      hctx.beginPath();
      hctx.moveTo(cx - bw / 2 - 10, yp);
      hctx.lineTo(cx + bw / 2 + 10, yp);
      hctx.stroke();
      hctx.setLineDash([]);
      hctx.fillStyle = '#dfe6f3';
      hctx.font = '600 22px JetBrains Mono, monospace';
      const c = String(count);
      hctx.fillText(c, cx - hctx.measureText(c).width / 2, Math.max(top + 18, base - hgt - 10));
      hctx.font = '600 22px JetBrains Mono, monospace';
      hctx.fillStyle = '#b8c3d9';
      hctx.fillText(name, cx - hctx.measureText(name).width / 2, base + 30);
    });
    hctx.font = '16px JetBrains Mono, monospace';
    hctx.fillStyle = '#8391ab';
    hctx.fillText('- - Born rule', W - 150, Hh - 14);
  }

  function updateLegend(): void {
    const len = Math.hypot(r[0], r[1], r[2]);
    const [th, ph] = anglesFromBloch(r);
    let stateLine: string;
    if (len > 0.999) {
      const a = Math.cos(th / 2);
      const b = Math.sin(th / 2);
      stateLine = `|ψ⟩ = ${a.toFixed(2)}|0⟩ + e<sup>i·${Math.round(ph / DEG) % 360}°</sup>${b.toFixed(2)}|1⟩`;
    } else {
      stateLine = `mixed state, |r| = ${len.toFixed(2)}`;
    }
    let body = '';
    if (mode === 'gates') {
      body = `<div>Each gate turns the sphere about its own axis (<span style="color:${css(PALETTE.cyan)}">cyan</span>).</div>`;
    } else if (mode === 'larmor') {
      const f = GAMMA_P_MHZ_PER_T * Bmag;
      body = `<div>The spin precesses about <span style="color:${css(PALETTE.violet)}">B</span> like a top.</div>
<div>A proton at ${Bmag.toFixed(2)} T turns ${f.toFixed(1)} million times a second. Shown ${(SLOWDOWN / 1e8).toFixed(1)}×10⁸ times slower.</div>`;
    } else {
      body = `<div>Rotating frame. The drive turns the spin about <span style="color:${css(PALETTE.rose)}">Ω_eff = (Ω, 0, Δ)</span>.</div>`;
    }
    const html = `<div style="color:#dfe6f3;font:600 15px/1.25 'Space Grotesk',sans-serif;margin-bottom:4px">${stateLine}</div>${body}
<div style="margin-top:3px"><span style="color:${css(PALETTE.amber)}">●</span> state &nbsp;<span style="color:${css(PALETTE.green)}">●</span> measure axis</div>
<div style="color:#8391ab">Opposite points are orthogonal states.</div>`;
    if (html !== legendHtml) {
      legend.innerHTML = html;
      legendHtml = html;
    }
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Mode');
  const modeCtl = ui.select<Mode>({
    key: 'mode', label: 'Mode', value: mode,
    options: [{ value: 'gates', label: 'Gates' }, { value: 'larmor', label: 'Larmor' }, { value: 'rabi', label: 'Rabi' }],
    onChange: (v) => setMode(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => setPlaying(!playing) },
    { label: 'Reset to |0⟩', onClick: () => { prepare(0, 0); syncSliders(); } },
    { label: 'Clear trail', onClick: () => resetTrail() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('State');
  const thetaCtl = ui.slider({ key: 'theta', label: 'Polar angle θ', min: 0, max: 180, step: 1, value: 55, unit: '°', onInput: (v) => prepare(v, phiCtl.get()) });
  const phiCtl: Control<number> = ui.slider({ key: 'phi', label: 'Phase φ', min: 0, max: 359, step: 1, value: 100, unit: '°', onInput: (v) => prepare(thetaCtl.get(), v) });

  ui.section('Gates');
  const gateBtn = (n: GateName) => ({ label: n, key: 'gate', onClick: () => enqueue(n) });
  ui.buttons([gateBtn('X'), gateBtn('Y'), gateBtn('Z'), gateBtn('H'), gateBtn('S'), gateBtn('T')]);
  ui.slider({ key: 'alpha', label: 'Rotation angle α', min: 0, max: 360, step: 5, value: alphaDeg, unit: '°', onInput: (v) => (alphaDeg = v) });
  ui.buttons([
    { label: 'Rx(α)', key: 'alpha', onClick: () => enqueue('Rx') },
    { label: 'Ry(α)', key: 'alpha', onClick: () => enqueue('Ry') },
    { label: 'Rz(α)', key: 'alpha', onClick: () => enqueue('Rz') },
  ]);
  const rSeq = ui.readout('seq', 'gates since last prep');

  ui.section('Larmor precession');
  ui.slider({ key: 'B', label: 'Field strength B', min: 0, max: 3, step: 0.05, value: Bmag, unit: 'T', onInput: (v) => (Bmag = v) });
  ui.slider({ key: 'Bth', label: 'B tilt from z', min: 0, max: 180, step: 1, value: Bth, unit: '°', onInput: (v) => { Bth = v; setField(); } });
  ui.slider({ key: 'Bph', label: 'B azimuth', min: 0, max: 359, step: 1, value: Bph, unit: '°', onInput: (v) => { Bph = v; setField(); } });
  const rFL = ui.readout('fL', 'proton f_L = 42.58 MHz/T × B');

  ui.section('Rabi drive (rotating frame)');
  ui.slider({ key: 'omega', label: 'Drive strength Ω', min: 0.2, max: 3, step: 0.05, value: Om, unit: 'rad/s', onInput: (v) => { Om = v; if (mode === 'rabi') afterPrepKeep(); } });
  ui.slider({ key: 'detuning', label: 'Detuning Δ', min: -3, max: 3, step: 0.05, value: Del, unit: 'rad/s', onInput: (v) => { Del = v; if (mode === 'rabi') afterPrepKeep(); } });
  ui.buttons([
    { label: 'π pulse', key: 'omega', onClick: () => pulse(Math.PI) },
    { label: 'π/2 pulse', key: 'omega', onClick: () => pulse(Math.PI / 2) },
  ]);
  const rArea = ui.readout('area', 'pulse area Ωt');
  const rRabi = ui.readout('rabiErr', '|P₁ − formula|');

  ui.section('Decoherence');
  ui.toggle({ key: 'decoh', label: 'T1 and T2 decay', value: decoh, onChange: (v) => { decoh = v; rabiValid = false; } });
  ui.slider({ key: 'T1', label: 'Relaxation T1', min: 1, max: 60, step: 0.5, value: T1, unit: 's', onInput: (v) => { T1 = v; if (T2 > 2 * T1) { T2 = 2 * T1; t2Ctl.set(T2, false); } } });
  const t2Ctl: Control<number> = ui.slider({ key: 'T2', label: 'Dephasing T2 (≤ 2 T1)', min: 0.5, max: 60, step: 0.5, value: T2, unit: 's', onInput: (v) => { T2 = Math.min(v, 2 * T1); if (T2 !== v) t2Ctl.set(T2, false); } });

  ui.section('Measurement');
  ui.select<Axis>({
    key: 'maxis', label: 'Measurement axis', value: axis,
    options: [{ value: 'z', label: 'z' }, { value: 'x', label: 'x' }, { value: 'y', label: 'y' }, { value: 'n', label: 'custom n̂' }],
    onChange: (v) => { axis = v; setAxisVec(); showAxisSliders(); },
  });
  const mthCtl = ui.slider({ key: 'mth', label: 'n̂ tilt from z', min: 0, max: 180, step: 1, value: mth, unit: '°', onInput: (v) => { mth = v; setAxisVec(); } });
  const mphCtl = ui.slider({ key: 'mph', label: 'n̂ azimuth', min: 0, max: 359, step: 1, value: mph, unit: '°', onInput: (v) => { mph = v; setAxisVec(); } });
  function showAxisSliders(): void {
    mthCtl.el.style.display = axis === 'n' ? '' : 'none';
    mphCtl.el.style.display = axis === 'n' ? '' : 'none';
  }
  ui.buttons([
    { label: 'Measure', primary: true, key: 'maxis', onClick: () => measureOnce() },
    { label: 'Measure ×100', key: 'maxis', onClick: () => measure100() },
  ]);
  const rLast = ui.readout('last', 'last outcome');

  ui.section('Live readouts');
  const rP0 = ui.readout('p0', 'P(0) = cos²(θ/2)');
  const rP1 = ui.readout('p1', 'P(1) = sin²(θ/2)');
  const rPn = ui.readout('pn', 'P(+) along axis');
  const rLen = ui.readout('rlen', 'Bloch length |r|');
  const rPur = ui.readout('purity', 'purity Tr ρ²');
  const rDrift = ui.readout('drift', 'accuracy ||r| − 1|');
  ui.legend([
    { color: css(PALETTE.amber), label: 'state' },
    { color: css(PALETTE.cyan), label: 'gate axis' },
    { color: css(PALETTE.violet), label: 'B field' },
    { color: css(PALETTE.rose), label: 'drive axis' },
    { color: css(PALETTE.green), label: 'measure axis' },
  ]);

  function afterPrepKeep(): void {
    // Changing drive parameters mid-run breaks the single-formula comparison.
    rabiValid = false;
  }

  function pulse(area: number): void {
    if (mode !== 'rabi') setMode('rabi', false);
    if (anim) return;
    pulseStop = tDrive + area / Om;
    setPlaying(true);
  }

  function setPlaying(v: boolean): void {
    playing = v;
    playBtn.textContent = playing ? 'Pause' : mode === 'rabi' ? 'Drive' : 'Play';
  }

  function setMode(v: Mode, reset = true): void {
    mode = v;
    if (modeCtl.get() !== v) modeCtl.set(v, false);
    pulseStop = Infinity;
    if (v === 'rabi') {
      if (reset || r[2] < 0.9999) prepare(0, 0);
      else afterPrep(true);
      setPlaying(false);
    } else if (v === 'larmor') {
      const along = Math.abs(r[0] * bHat[0] + r[1] * bHat[1] + r[2] * bHat[2]);
      if (along > 0.98) prepare(55, 0);
      else resetTrail();
      setPlaying(true);
    } else {
      setPlaying(true);
      resetTrail();
    }
    clearPlot();
    syncSliders();
  }
  function syncSliders(): void {
    const len = Math.hypot(r[0], r[1], r[2]);
    if (len < 1e-6) return;
    const [th, ph] = anglesFromBloch(r);
    thetaCtl.set(Math.round(th / DEG), false);
    phiCtl.set(Math.round(ph / DEG) % 360, false);
  }

  function updateReadouts(): void {
    const len = Math.hypot(r[0], r[1], r[2]);
    rP0(((1 + r[2]) / 2).toFixed(3));
    rP1(((1 - r[2]) / 2).toFixed(3));
    rPn(probPlus(r, nAx).toFixed(3));
    rLen(len.toFixed(4));
    rPur(purity(r).toFixed(4));
    rDrift(decoh ? 'decoherence on' : Math.abs(len - 1).toExponential(1));
    rSeq(seq.length ? seq.join(' ') : '–');
    rFL(`${(GAMMA_P_MHZ_PER_T * Bmag).toFixed(2)} MHz`);
    rArea(mode === 'rabi' ? `${((Om * tDrive) / Math.PI).toFixed(2)} π` : '–');
    rRabi(mode === 'rabi' ? (rabiValid ? Math.abs((1 - r[2]) / 2 - rabiP1(Om, Del, tDrive)).toExponential(1) : (decoh ? 'n/a (decoherence)' : 'n/a (state or drive changed)')) : '–');
    rLast(lastOutcome);
  }

  // --- Frame loop
  let uiTimer = 0;
  let plotTimer = 0;
  let sampleTimer = 0;
  stage.onFrame((dt) => {
    let moving = false;
    if (anim) {
      anim.u = Math.min(1, anim.u + dt / anim.dur);
      rotateVec(anim.r0, anim.axis, anim.angle * ease(anim.u), r);
      moving = true;
      if (anim.u >= 1) {
        anim = null;
        startNext();
      }
    } else if (playing && (mode !== 'gates' || decoh)) {
      evolve(dt * speed);
      moving = true;
    }
    if (moving) clock += dt * speed;
    if (flashT > 0) flashT = Math.max(0, flashT - dt / 0.8);
    drawScene();

    sampleTimer += dt;
    if (moving && sampleTimer > 1 / 30) {
      sampleTimer = 0;
      plotT[plotHead] = mode === 'rabi' ? tDrive : clock;
      plotP[plotHead] = (1 - r[2]) / 2;
      plotF[plotHead] = rabiP1(Om, Del, tDrive);
      plotHead = (plotHead + 1) % PLOT_N;
      plotCount = Math.min(PLOT_N, plotCount + 1);
    }
    plotTimer += dt;
    if (plotTimer > 1 / 15) {
      plotTimer = 0;
      drawPlot();
    }
    uiTimer += dt;
    if (uiTimer > 0.15) {
      uiTimer = 0;
      updateReadouts();
      updateLegend();
      if (moving) syncSliders();
    }
  });

  // --- Init
  setField();
  setAxisVec();
  showAxisSliders();
  prepare(55, 100);
  setPlaying(true);
  drawHist();
  drawPlot();
  updateReadouts();
  updateLegend();

  return {
    state: () => {
      const [th, ph] = anglesFromBloch(r);
      return {
        mode,
        theta: th / DEG,
        phi: ph / DEG,
        rx: r[0],
        ry: r[1],
        rz: r[2],
        rlen: Math.hypot(r[0], r[1], r[2]),
        p1: (1 - r[2]) / 2,
        gateCount: anim || queue.length ? -1 : seq.length,
        seq: seq.join(' '),
        fromZero,
        rabiPeak,
        batchAxis,
        batchPlus,
        batchPrepX,
        decoherence: decoh,
        B: Bmag,
        omega: Om,
        detuning: Del,
        T1,
        T2,
        axis,
      };
    },
    dispose: () => {
      legend.remove();
      plot.remove();
      hist.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'spin-bloch',
  number: 15,
  symbol: 'Bs',
  title: 'Spin & the Bloch Sphere',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'A qubit is a point on a sphere.',
  content,
  mount,
};

export default topic;
