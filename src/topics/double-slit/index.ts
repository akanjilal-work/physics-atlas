import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  InverseCdfSampler, binIndex, electronWavelength, fraunhoferPartial, fringeSpacing, huygensIntensity,
  measureVisibility, mulberry32, slitAmplitude, type SlitParams,
} from './physics.ts';

type Mode = 'waves' | 'particles' | 'both';
type Particle = 'photon' | 'electron';
type Open = 'left' | 'right' | 'both';
type View = 'bench' | 'screen' | 'top';

// --- Scene layout (scene units)
const HZ = 2.4; // half-width of the screen and wave field along z (the fringe axis)
const S_L = 5; // scene units per metre of screen distance
const D_SCENE_REF = 1.5; // scene slit separation at the default d
const SRC_X = -2.9;
const Y_BOT = -0.4; // bottom of barrier and screen
const Y_TOP = 3.7; // top of the screen
const Y_BAR = 1.25; // top of the slit plate (kept low so the wave stays in view)
const BAR_Y0 = 0.08; // histogram baseline
const BAR_H = 1.0; // histogram height for the predicted peak
const HIT_Y0 = 1.35;
const HIT_Y1 = 3.55;
const BARRIER_HZ = 2.9;
const FIELD_X0 = 0.06;
const AMP = 0.13; // nominal wave height in the far field
const CREST_SPEED = 0.7; // scene units per second

// --- Resolution
const NX = 220; // wave field segments along the beam
const NZ = 150; // wave field segments across
const NG = 1024; // screen pattern grid
const NB = 120; // histogram bins
const NCURVE = 320;
const CAP = 16000; // dots kept on screen
const SEED_HITS = 600;
const FLASH = 0.55; // seconds a new hit glows

// Ratio of the screen half-width to the default fringe spacing (16 mm / 2.75 mm).
const Y_OVER_S = 16 / 2.75;

interface ParticleCfg {
  dScale: number; // metres per d-slider unit
  aScale: number; // metres per a-slider unit
  dUnit: string;
  aUnit: string;
  yScale: number; // display unit for screen positions
  yUnit: string;
  lamScale: number;
  lamUnit: string;
  color: number;
}

const CFG: Record<Particle, ParticleCfg> = {
  photon: { dScale: 1e-3, aScale: 1e-6, dUnit: 'mm', aUnit: 'µm', yScale: 1e-3, yUnit: 'mm', lamScale: 1e-9, lamUnit: 'nm', color: PALETTE.amber },
  electron: { dScale: 1e-6, aScale: 1e-9, dUnit: 'µm', aUnit: 'nm', yScale: 1e-6, yUnit: 'µm', lamScale: 1e-12, lamUnit: 'pm', color: PALETTE.cyan },
};

const DEF = { lambdaNm: 550, kV: 50, d: 0.2, a: 40, L: 1 };

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

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM_BENCH: [number, number, number] = [-5.1, 5.7, 7.5];
  const TGT_BENCH: [number, number, number] = [1.6, 0.8, 0.2];
  const stage = createStage(viewport, { camera: CAM_BENCH, target: TGT_BENCH, fov: 42 });
  const { scene } = stage;
  const glow = glowTexture();

  // --- Parameters
  let particle: Particle = 'photon';
  let lambdaNm = DEF.lambdaNm;
  let kV = DEF.kV;
  let dVal = DEF.d;
  let aVal = DEF.a;
  let L = DEF.L;
  let open: Open = 'both';
  let detector = false;
  let strength = 0.6;
  let mode: Mode = 'both';
  let showCurve = true;
  let playing = true;
  let rate = 30;
  let view: View = 'bench';

  const cfg = () => CFG[particle];
  const lambda = () => (particle === 'photon' ? lambdaNm * 1e-9 : electronWavelength(kV * 1e3, true));
  const lambdaRef = () => (particle === 'photon' ? DEF.lambdaNm * 1e-9 : electronWavelength(DEF.kV * 1e3, true));
  const dRef = () => DEF.d * cfg().dScale;
  const phys = (): SlitParams => ({ lambda: lambda(), d: dVal * cfg().dScale, a: aVal * cfg().aScale, L });
  const Veff = () => (detector ? 1 - strength : 1);
  const yMax = () => (Y_OVER_S * lambdaRef() * DEF.L) / dRef();
  const Ls = () => L * S_L;

  // Scene geometry derived from the physics (recomputed in applyGeometry)
  let dS = D_SCENE_REF;
  let aS = 0.24;
  let lamS = 0.1;
  let pNow: SlitParams = phys();
  let spacingNow = 0;

  // --- Floor grid for depth
  const grid = makeGrid(16, 32);
  grid.position.set(2.5, Y_BOT - 0.02, 0);
  scene.add(grid);

  // --- Source
  const source = new THREE.Group();
  source.position.set(SRC_X, 0.25, 0);
  scene.add(source);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 24), new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.6, roughness: 0.35 }));
  body.rotation.z = Math.PI / 2;
  body.position.x = -0.45;
  source.add(body);
  const nozzleMat = new THREE.MeshBasicMaterial({ color: CFG.photon.color });
  const nozzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), nozzleMat);
  source.add(nozzle);
  const srcGlowMat = new THREE.SpriteMaterial({ map: glow, color: CFG.photon.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const srcGlow = new THREE.Sprite(srcGlowMat);
  srcGlow.scale.setScalar(0.9);
  source.add(srcGlow);
  stage.label('source', [SRC_X - 0.3, 1.0, 0], 'muted');

  // --- Barrier with two slits
  const barrier = new THREE.Group();
  scene.add(barrier);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.5, roughness: 0.55 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const plates = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(unitBox, plateMat);
    barrier.add(m);
    return m;
  });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x4a2238, metalness: 0.3, roughness: 0.6, emissive: 0x220812 });
  const covers = [0, 1].map(() => {
    const m = new THREE.Mesh(unitBox, coverMat);
    barrier.add(m);
    return m;
  });
  const slitGlowMat = new THREE.MeshBasicMaterial({ color: CFG.photon.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const slitGlows = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), slitGlowMat);
    m.rotation.y = Math.PI / 2;
    barrier.add(m);
    return m;
  });
  stage.label('two slits', [0, Y_BOT - 0.3, BARRIER_HZ], 'muted');

  // --- Which-path detector: a small glowing eye looking at the slits
  const eye = new THREE.Group();
  eye.position.set(0.45, 1.8, -0.9);
  scene.add(eye);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, roughness: 0.35, metalness: 0.1, emissive: 0x000000 });
  eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 20), eyeMat));
  const irisMat = new THREE.MeshBasicMaterial({ color: 0x5a6378, side: THREE.DoubleSide });
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), irisMat);
  iris.position.x = -0.186;
  iris.rotation.y = -Math.PI / 2;
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.048, 20), new THREE.MeshBasicMaterial({ color: 0x05070c, side: THREE.DoubleSide }));
  pupil.position.x = -0.19;
  pupil.rotation.y = -Math.PI / 2;
  eye.add(pupil);
  const eyeHaloMat = new THREE.SpriteMaterial({ map: glow, color: PALETTE.rose, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const eyeHalo = new THREE.Sprite(eyeHaloMat);
  eyeHalo.scale.setScalar(1.1);
  eye.add(eyeHalo);
  const sightPos = new Float32Array(12);
  const sightGeo = new THREE.BufferGeometry();
  sightGeo.setAttribute('position', new THREE.BufferAttribute(sightPos, 3));
  const sightMat = new THREE.LineDashedMaterial({ color: PALETTE.rose, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.8 });
  const sight = new THREE.LineSegments(sightGeo, sightMat);
  sight.visible = false;
  scene.add(sight);
  const eyeLabel = stage.label('which-path detector: off', [0.45, 2.25, -0.9], 'muted');

  // --- Incoming plane wave (source to barrier)
  const inGeo = new THREE.PlaneGeometry(1, 1, 110, 4);
  inGeo.rotateX(-Math.PI / 2);
  const inPos = inGeo.attributes.position as THREE.BufferAttribute;
  const inN = inPos.count;
  const inX = new Float32Array(inN);
  for (let i = 0; i < inN; i++) {
    const u = inPos.getX(i) + 0.5;
    const v = inPos.getZ(i) + 0.5;
    inX[i] = SRC_X + 0.3 + u * (-FIELD_X0 - SRC_X - 0.3);
    inPos.setXYZ(i, inX[i], 0, (v - 0.5) * 2 * 1.5);
  }
  const inCol = new Float32Array(inN * 3);
  inGeo.setAttribute('color', new THREE.BufferAttribute(inCol, 3).setUsage(THREE.DynamicDrawUsage));
  inPos.setUsage(THREE.DynamicDrawUsage);
  const waveMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const inMesh = new THREE.Mesh(inGeo, waveMat);
  inMesh.frustumCulled = false;
  scene.add(inMesh);

  // --- The signature visual: Huygens wave field between slits and screen
  const fGeo = new THREE.PlaneGeometry(1, 1, NX, NZ);
  fGeo.rotateX(-Math.PI / 2);
  const fPos = fGeo.attributes.position as THREE.BufferAttribute;
  fPos.setUsage(THREE.DynamicDrawUsage);
  const nV = fPos.count;
  const fU = new Float32Array(nV); // 0..1 along the beam
  const fX = new Float32Array(nV);
  const fZ = new Float32Array(nV);
  for (let i = 0; i < nV; i++) {
    fU[i] = fPos.getX(i) + 0.5;
    fZ[i] = (fPos.getZ(i) + 0.5 - 0.5) * 2 * HZ;
  }
  const fCol = new Float32Array(nV * 3);
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3).setUsage(THREE.DynamicDrawUsage));
  const field = new THREE.Mesh(fGeo, waveMat);
  field.frustumCulled = false;
  scene.add(field);
  const fPosArr = fPos.array as Float32Array;
  // Cached complex amplitude from each slit at each vertex (time independent)
  const p1r = new Float32Array(nV);
  const p1i = new Float32Array(nV);
  const p2r = new Float32Array(nV);
  const p2i = new Float32Array(nV);
  const bright = new Float32Array(nV);
  const amp2 = new Float64Array(2);

  // --- Screen (a group whose local x runs along world z, local z faces the source)
  const screen = new THREE.Group();
  screen.rotation.y = -Math.PI / 2;
  scene.add(screen);
  const scrW = 2 * HZ + 0.3;
  const scrH = Y_TOP - Y_BOT;
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  panelMesh.position.y = (Y_TOP + Y_BOT) / 2;
  screen.add(panelMesh);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(scrW, scrH)), new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }));
  frame.position.set(0, (Y_TOP + Y_BOT) / 2, 0.005);
  screen.add(frame);
  const sepGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-HZ, BAR_Y0, 0.01), new THREE.Vector3(HZ, BAR_Y0, 0.01), new THREE.Vector3(-HZ, 1.22, 0.01), new THREE.Vector3(HZ, 1.22, 0.01)]);
  screen.add(new THREE.LineSegments(sepGeo, new THREE.LineBasicMaterial({ color: PALETTE.grid })));
  stage.label('screen', [0, Y_TOP + 0.35, 0], 'muted', screen);
  const scaleLabel = stage.label('', [HZ - 0.4, Y_BOT + 0.15, 0.02], 'muted', screen);

  // Histogram bars
  const barMat = new THREE.MeshBasicMaterial({ color: CFG.photon.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), barMat, NB);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  screen.add(bars);
  const counts = new Float64Array(NB);
  const binMass = new Float64Array(NB);
  let pMax = 1;

  // Predicted curve
  const curvePos = new Float32Array(NCURVE * 3);
  const curveGeo = new THREE.BufferGeometry();
  curveGeo.setAttribute('position', new THREE.BufferAttribute(curvePos, 3));
  const curve = new THREE.Line(curveGeo, new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.95 }));
  curve.frustumCulled = false;
  screen.add(curve);

  // Hits
  const hitPos = new Float32Array(CAP * 3);
  const hitCol = new Float32Array(CAP * 3);
  const hitT = new Float32Array(CAP);
  const hitGeo = new THREE.BufferGeometry();
  const hitPosAttr = new THREE.BufferAttribute(hitPos, 3).setUsage(THREE.DynamicDrawUsage);
  const hitColAttr = new THREE.BufferAttribute(hitCol, 3).setUsage(THREE.DynamicDrawUsage);
  hitGeo.setAttribute('position', hitPosAttr);
  hitGeo.setAttribute('color', hitColAttr);
  hitGeo.setDrawRange(0, 0);
  const hitMat = new THREE.PointsMaterial({ size: 0.14, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  const hitPoints = new THREE.Points(hitGeo, hitMat);
  hitPoints.frustumCulled = false;
  screen.add(hitPoints);

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '225px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const paintLegend = () => {
    const pc = css(cfg().color);
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read the bench</div>
<div>Floor: the wave ψ. Height = Re ψ. Brightness = |ψ|², where hits are likely. Colour = phase, from trough to crest</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,${css(PALETTE.violet)},${css(PALETTE.cyan)})"></div>
<div><span style="color:${pc}">Dots</span> = single ${particle === 'photon' ? 'photons' : 'electrons'} detected. <span style="color:${pc}">Bars</span> = hit counts. <span style="color:${css(PALETTE.rose)}">Line</span> = predicted I(y).</div>`;
  };

  // --- Simulation state
  const rnd = mulberry32(1989);
  const ysGrid = new Float64Array(NG);
  const IGrid = new Float64Array(NG);
  const scratch = new Float64Array(4);
  const sampler = new InverseCdfSampler(NG);
  let hits = 0;
  let head = 0; // ring buffer write index
  let shown = 0;
  let seeded = true;
  let visibility = 0;
  let simTime = 0;
  let phaseT = 0;
  let jitter = 0;
  let jitterTimer = 0;
  let acc = 0;
  let fieldDirty = true;
  let brightDirty = true;

  const openL = () => open !== 'right';
  const openR = () => open !== 'left';

  function applyGeometry(): void {
    const p = phys();
    pNow = p;
    spacingNow = fringeSpacing(p.lambda, p.L, p.d);
    const scale = D_SCENE_REF / dRef();
    dS = p.d * scale;
    aS = p.a * scale;
    // Scene angles are the physical angles times M, so the floor wave lines up with the screen.
    const M = HZ / (yMax() * S_L);
    lamS = M * p.lambda * scale;
    const ls = Ls();
    screen.position.x = ls;
    // Barrier plates
    const zIn = dS / 2 - aS / 2;
    const zOut = dS / 2 + aS / 2;
    const h = Y_BAR - Y_BOT;
    const yc = (Y_BAR + Y_BOT) / 2;
    const T = 0.08;
    plates[0].scale.set(T, h, BARRIER_HZ - zOut);
    plates[0].position.set(0, yc, -(zOut + BARRIER_HZ) / 2);
    plates[1].scale.set(T, h, Math.max(0.01, 2 * zIn));
    plates[1].position.set(0, yc, 0);
    plates[2].scale.set(T, h, BARRIER_HZ - zOut);
    plates[2].position.set(0, yc, (zOut + BARRIER_HZ) / 2);
    [-1, 1].forEach((sgn, j) => {
      covers[j].scale.set(T * 1.4, h, aS * 1.02);
      covers[j].position.set(0, yc, (sgn * dS) / 2);
      slitGlows[j].scale.set(aS, h, 1);
      slitGlows[j].position.set(0, yc, (sgn * dS) / 2);
    });
    covers[0].visible = !openL();
    covers[1].visible = !openR();
    slitGlows[0].visible = openL();
    slitGlows[1].visible = openR();
    // Detector sight lines to each slit
    sightPos.set([0.3, 1.72, -0.9, 0.05, 0.5, -dS / 2, 0.3, 1.72, -0.9, 0.05, 0.5, dS / 2]);
    sightGeo.attributes.position.needsUpdate = true;
    sight.computeLineDistances();
    // Wave field x positions
    const x1 = ls - 0.08;
    for (let i = 0; i < nV; i++) {
      fX[i] = FIELD_X0 + fU[i] * (x1 - FIELD_X0);
      fPosArr[3 * i] = fX[i];
      fPosArr[3 * i + 2] = fZ[i];
    }
    fieldDirty = true;
    const u = cfg();
    scaleLabel.element.textContent = `±${(yMax() / u.yScale).toFixed(0)} ${u.yUnit}`;
  }

  /** Huygens sum from each slit at every vertex, in scene units. Runs only when geometry changes. */
  function computeField(): void {
    const k = (2 * Math.PI) / lamS;
    const nSrc = Math.max(2, Math.min(12, Math.ceil((2 * aS) / lamS) + 1));
    let norm = 0;
    const xFar = FIELD_X0 + 0.4 * (Ls() - FIELD_X0);
    for (let i = 0; i < nV; i++) {
      const x = fX[i];
      const z = fZ[i];
      const g = Math.sqrt(x + 0.3); // offsets the 1/√r fall-off for display
      slitAmplitude(x, z, -dS / 2, aS, k, nSrc, amp2, 0.02);
      p1r[i] = amp2[0] * g;
      p1i[i] = amp2[1] * g;
      slitAmplitude(x, z, dS / 2, aS, k, nSrc, amp2, 0.02);
      p2r[i] = amp2[0] * g;
      p2i[i] = amp2[1] * g;
      if (x > xFar) {
        const m = Math.hypot(p1r[i], p1i[i]) + Math.hypot(p2r[i], p2i[i]);
        if (m > norm) norm = m;
      }
    }
    const s = norm > 0 ? AMP / norm : 1;
    for (let i = 0; i < nV; i++) {
      p1r[i] *= s;
      p1i[i] *= s;
      p2r[i] *= s;
      p2i[i] *= s;
    }
    fieldDirty = false;
    brightDirty = true;
  }

  /** Time-averaged brightness √I with partial coherence V. */
  function computeBright(): void {
    const o1 = openL() ? 1 : 0;
    const o2 = openR() ? 1 : 0;
    const V = Veff();
    for (let i = 0; i < nV; i++) {
      const I1 = o1 * (p1r[i] * p1r[i] + p1i[i] * p1i[i]);
      const I2 = o2 * (p2r[i] * p2r[i] + p2i[i] * p2i[i]);
      const cross = o1 * o2 * 2 * V * (p1r[i] * p2r[i] + p1i[i] * p2i[i]);
      bright[i] = Math.min(1.6, Math.max(0, I1 + I2 + cross) / (AMP * AMP));
    }
    brightDirty = false;
  }

  const cA = new THREE.Color(PALETTE.cyan); // crests
  const cB = new THREE.Color(PALETTE.violet); // troughs
  function drawField(): void {
    const o1 = openL() ? 1 : 0;
    const o2 = openR() ? 1 : 0;
    const c = Math.cos(phaseT);
    const s = Math.sin(phaseT);
    const cj = Math.cos(jitter);
    const sj = Math.sin(jitter);
    for (let i = 0; i < nV; i++) {
      const a2r = p2r[i] * cj - p2i[i] * sj;
      const a2i = p2r[i] * sj + p2i[i] * cj;
      const sr = o1 * p1r[i] + o2 * a2r;
      const si = o1 * p1i[i] + o2 * a2i;
      const re = sr * c + si * s;
      const im = si * c - sr * s;
      fPosArr[3 * i + 1] = re > 0.35 ? 0.35 : re < -0.35 ? -0.35 : re;
      const mag = Math.sqrt(re * re + im * im) + 1e-9;
      const t = 0.5 + 0.5 * (re / mag);
      const b = 0.8 * bright[i];
      const j = 3 * i;
      fCol[j] = 0.012 + b * (cB.r + t * (cA.r - cB.r));
      fCol[j + 1] = 0.016 + b * (cB.g + t * (cA.g - cB.g));
      fCol[j + 2] = 0.03 + b * (cB.b + t * (cA.b - cB.b));
    }
    fPos.needsUpdate = true;
    (fGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Incoming plane wave, phase k x − θ, continuous with the slit wavelets at x = 0
    const k = (2 * Math.PI) / lamS;
    const inArr = inPos.array as Float32Array;
    for (let i = 0; i < inN; i++) {
      const ph = k * inX[i] - phaseT;
      const cr = Math.cos(ph);
      inArr[3 * i + 1] = 0.45 * AMP * cr;
      const t = 0.5 + 0.5 * cr;
      const b = 0.35;
      inCol[3 * i] = 0.012 + b * (cB.r + t * (cA.r - cB.r));
      inCol[3 * i + 1] = 0.016 + b * (cB.g + t * (cA.g - cB.g));
      inCol[3 * i + 2] = 0.03 + b * (cB.b + t * (cA.b - cB.b));
    }
    inPos.needsUpdate = true;
    (inGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Screen pattern from the Huygens sum on a fine grid, the sampler, bin masses and the predicted curve. */
  function rebuildPattern(): void {
    const p = phys();
    const Y = yMax();
    const V = Veff();
    const opts = { n: 2, nSrc: 24, V, open: [openL(), openR()] };
    for (let i = 0; i < NG; i++) {
      ysGrid[i] = -Y + (2 * Y * i) / (NG - 1);
      IGrid[i] = huygensIntensity(ysGrid[i], p, opts, scratch);
    }
    sampler.build(ysGrid, IGrid);
    pMax = 1e-12;
    for (let b = 0; b < NB; b++) {
      binMass[b] = sampler.mass(-Y + (2 * Y * b) / NB, -Y + (2 * Y * (b + 1)) / NB);
      if (binMass[b] > pMax) pMax = binMass[b];
    }
    // Predicted curve from the closed-form Fraunhofer formula, on the same scale as the bars
    let tot = 0;
    const dy = (2 * Y) / (NCURVE - 1);
    for (let i = 0; i < NCURVE; i++) {
      const y = -Y + i * dy;
      const I = fraunhoferPartial(y, p, V, openL(), openR());
      curvePos[3 * i] = (y / Y) * HZ;
      curvePos[3 * i + 1] = I; // temporary
      curvePos[3 * i + 2] = 0.03;
      tot += (i === 0 || i === NCURVE - 1 ? 0.5 : 1) * I * dy;
    }
    const w = (2 * Y) / NB;
    for (let i = 0; i < NCURVE; i++) {
      curvePos[3 * i + 1] = BAR_Y0 + ((curvePos[3 * i + 1] / tot) * w * BAR_H) / pMax;
    }
    curveGeo.attributes.position.needsUpdate = true;
  }

  const m4 = new THREE.Matrix4();
  const barBinW = (2 * HZ) / NB;
  function drawBars(): void {
    const N = Math.max(1, hits);
    for (let b = 0; b < NB; b++) {
      const h = Math.min(1.25 * BAR_H, (counts[b] / (N * pMax)) * BAR_H) + 1e-4;
      m4.makeScale(barBinW * 0.82, h, 1);
      m4.setPosition(-HZ + (b + 0.5) * barBinW, BAR_Y0 + h / 2, 0.02);
      bars.setMatrixAt(b, m4);
    }
    bars.instanceMatrix.needsUpdate = true;
  }

  const baseCol = new THREE.Color();
  function clearHits(fromUser: boolean): void {
    hits = 0;
    head = 0;
    shown = 0;
    counts.fill(0);
    hitGeo.setDrawRange(0, 0);
    visibility = 0;
    if (fromUser) seeded = false;
    drawBars();
  }

  function addHit(flash: boolean): void {
    const y = sampler.sample(rnd());
    const Y = yMax();
    const b = binIndex(y, -Y, Y, NB);
    if (b >= 0) counts[b]++;
    hits++;
    const i = head;
    hitPos[3 * i] = (y / Y) * HZ;
    hitPos[3 * i + 1] = HIT_Y0 + rnd() * (HIT_Y1 - HIT_Y0);
    hitPos[3 * i + 2] = 0.04;
    hitT[i] = flash ? simTime : -100;
    hitCol[3 * i] = baseCol.r;
    hitCol[3 * i + 1] = baseCol.g;
    hitCol[3 * i + 2] = baseCol.b;
    head = (head + 1) % CAP;
    if (shown < CAP) shown++;
  }

  function updateFlashes(): void {
    // Walk back from the newest hit while hits are still glowing
    for (let n = 0; n < Math.min(shown, 600); n++) {
      const i = (head - 1 - n + CAP) % CAP;
      const age = simTime - hitT[i];
      if (age > FLASH + 0.1) break;
      const f = Math.max(0, 1 - age / FLASH);
      const boost = 1 + 2.2 * f * f;
      hitCol[3 * i] = Math.min(3, baseCol.r * (1 - f) + f) * boost;
      hitCol[3 * i + 1] = Math.min(3, baseCol.g * (1 - f) + f) * boost;
      hitCol[3 * i + 2] = Math.min(3, baseCol.b * (1 - f) + f) * boost;
    }
  }

  function paintParticleColours(): void {
    const c = cfg().color;
    baseCol.set(c).multiplyScalar(0.95);
    nozzleMat.color.set(c);
    srcGlowMat.color.set(c);
    slitGlowMat.color.set(c);
    barMat.color.set(c);
    paintLegend();
  }

  function applyDetector(): void {
    sight.visible = detector;
    eyeMat.emissive.set(detector ? PALETTE.rose : 0x000000);
    eyeMat.emissiveIntensity = detector ? 0.35 : 0;
    irisMat.color.set(detector ? PALETTE.rose : 0x5a6378);
    eyeLabel.element.textContent = detector ? `which-path detector: on, V = ${Veff().toFixed(2)}` : 'which-path detector: off';
  }

  function applyMode(): void {
    const w = mode !== 'particles';
    const pt = mode !== 'waves';
    field.visible = w;
    inMesh.visible = w;
    hitPoints.visible = pt;
    bars.visible = pt;
    curve.visible = showCurve;
  }

  /** Any change to the physics clears the screen. */
  function setupChanged(): void {
    applyGeometry();
    rebuildPattern();
    brightDirty = true;
    applyDetector();
    clearHits(true);
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    if (fieldDirty) computeField();
    if (brightDirty) computeBright();
    if (playing) {
      simTime += dt;
      phaseT += ((2 * Math.PI * CREST_SPEED) / lamS) * dt;
      if (phaseT > 1e4) phaseT -= 2 * Math.PI * Math.floor(phaseT / (2 * Math.PI));
      // Which-path detector: the relative phase of the two paths is scrambled
      // with probability 1 − V at each tick, so the time-averaged coherence is V.
      jitterTimer += dt;
      if (jitterTimer > 0.12) {
        jitterTimer = 0;
        jitter = detector && rnd() < 1 - Veff() ? rnd() * 2 * Math.PI : 0;
      }
      if (mode !== 'waves') {
        acc += rate * dt;
        let n = 0;
        while (acc >= 1 && n < 80) {
          addHit(true);
          acc -= 1;
          n++;
        }
        if (acc > 5) acc = 0;
        if (n > 0) {
          hitGeo.setDrawRange(0, shown);
          hitPosAttr.needsUpdate = true;
          drawBars();
          visibility = measureVisibility(counts, -yMax(), yMax(), spacingNow);
        }
      }
      updateFlashes();
      hitColAttr.needsUpdate = true;
      if (detector) {
        const pulse = 0.55 + 0.3 * Math.sin(simTime * 5);
        eyeHaloMat.opacity = pulse * (0.3 + 0.7 * strength);
      }
    }
    if (!detector) eyeHaloMat.opacity = 0;
    if (field.visible) drawField();
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Experiment');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Clear screen', key: 'clear', onClick: () => clearHits(true) },
  ]);
  ui.slider({ key: 'rate', label: 'Emission rate', min: 1, max: 300, step: 1, value: rate, format: (v) => `${v} / s`, onInput: (v) => (rate = v) });
  ui.select<Mode>({
    key: 'mode', label: 'Show', value: mode,
    options: [{ value: 'waves', label: 'Waves' }, { value: 'particles', label: 'Particles' }, { value: 'both', label: 'Both' }],
    onChange: (v) => { mode = v; applyMode(); },
  });
  ui.toggle({ key: 'curve', label: 'Predicted curve', value: showCurve, onChange: (v) => { showCurve = v; applyMode(); } });
  ui.select<View>({
    key: 'view', label: 'Camera', value: view,
    options: [{ value: 'bench', label: 'Bench' }, { value: 'screen', label: 'Screen' }, { value: 'top', label: 'Top' }],
    onChange: (v) => { view = v; flyView(); },
  });

  ui.section('Particle');
  let lamCtl: { el: HTMLElement } | null = null;
  let kvCtl: { el: HTMLElement } | null = null;
  const dCtl = { current: null as null | { set(v: number, emit?: boolean): void } };
  const aCtl = { current: null as null | { set(v: number, emit?: boolean): void } };
  ui.select<Particle>({
    key: 'particle', label: 'Particle', value: particle,
    options: [{ value: 'photon', label: 'Photon' }, { value: 'electron', label: 'Electron' }],
    onChange: (v) => {
      particle = v;
      lamCtl!.el.style.display = v === 'photon' ? '' : 'none';
      kvCtl!.el.style.display = v === 'electron' ? '' : 'none';
      dCtl.current?.set(dVal, false);
      aCtl.current?.set(aVal, false);
      paintParticleColours();
      setupChanged();
    },
  });
  lamCtl = ui.slider({ key: 'lambda', label: 'Wavelength λ', min: 400, max: 700, step: 5, value: lambdaNm, format: (v) => `${v} nm`, onInput: (v) => { lambdaNm = v; setupChanged(); } });
  kvCtl = ui.slider({ key: 'voltage', label: 'Accelerating voltage', min: 10, max: 60, step: 1, value: kV, format: (v) => `${v} kV`, onInput: (v) => { kV = v; setupChanged(); } });
  kvCtl.el.style.display = 'none';

  ui.section('Slits and screen');
  dCtl.current = ui.slider({ key: 'd', label: 'Slit separation d', min: 0.08, max: 0.4, step: 0.005, value: dVal, format: (v) => `${v.toFixed(3)} ${cfg().dUnit}`, onInput: (v) => { dVal = v; setupChanged(); } });
  aCtl.current = ui.slider({ key: 'a', label: 'Slit width a', min: 10, max: 60, step: 1, value: aVal, format: (v) => `${v} ${cfg().aUnit}`, onInput: (v) => { aVal = v; setupChanged(); } });
  ui.slider({ key: 'L', label: 'Screen distance L', min: 0.4, max: 1.4, step: 0.02, value: L, format: (v) => `${v.toFixed(2)} m`, onInput: (v) => { L = v; setupChanged(); if (view !== 'bench') flyView(); } });
  ui.select<Open>({
    key: 'open', label: 'Open slits', value: open,
    options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }],
    onChange: (v) => { open = v; setupChanged(); },
  });

  ui.section('Which-path detector');
  ui.toggle({ key: 'detector', label: 'Which-path detector', value: detector, onChange: (v) => { detector = v; setupChanged(); } });
  ui.slider({ key: 'V', label: 'Detector strength (1 − V)', min: 0, max: 1, step: 0.01, value: strength, format: (v) => `${v.toFixed(2)}`, onInput: (v) => { strength = v; if (detector) setupChanged(); } });
  ui.note('At strength 1 the detector keeps a perfect record of the path, so V = 0. The strength does nothing while the detector is off.');

  ui.section('Live readouts');
  const rHits = ui.readout('hits', 'hits');
  const rSp = ui.readout('spacing', 'fringe spacing λL/d');
  const rVis = ui.readout('visibility', 'measured visibility');
  const rLam = ui.readout('lambdaOut', 'wavelength λ');
  const rWp = ui.readout('whichpath', 'which-path info 1 − V');
  ui.legend([
    { color: css(PALETTE.amber), label: 'photon hits' },
    { color: css(PALETTE.cyan), label: 'electron hits' },
    { color: css(PALETTE.rose), label: 'predicted I(y)' },
  ]);

  function updateReadouts(): void {
    const u = cfg();
    const p = pNow;
    rHits(hits);
    rSp(`${(spacingNow / u.yScale).toFixed(3)} ${u.yUnit}`);
    rVis(hits < 30 ? '…' : visibility.toFixed(2));
    rLam(`${(p.lambda / u.lamScale).toFixed(particle === 'photon' ? 0 : 3)} ${u.lamUnit}`);
    rWp((1 - Veff()).toFixed(2));
  }

  function flyView(): void {
    const ls = Ls();
    if (view === 'bench') stage.flyTo(CAM_BENCH, TGT_BENCH);
    if (view === 'screen') stage.flyTo([Math.max(0.8, ls - 4.7), 2.2, 0.001], [ls, 1.7, 0]);
    if (view === 'top') stage.flyTo([ls / 2 - 0.3, 10.5, 0.01], [ls / 2 - 0.3, 0, 0]);
  }

  // --- Initial build, with a few hundred hits already on the screen
  paintParticleColours();
  applyGeometry();
  rebuildPattern();
  applyDetector();
  applyMode();
  computeField();
  computeBright();
  for (let k = 0; k < SEED_HITS; k++) addHit(false);
  hitGeo.setDrawRange(0, shown);
  hitPosAttr.needsUpdate = true;
  hitColAttr.needsUpdate = true;
  drawBars();
  visibility = measureVisibility(counts, -yMax(), yMax(), spacingNow);
  drawField();

  const defaultSpacing = (pt: Particle) =>
    fringeSpacing(pt === 'photon' ? DEF.lambdaNm * 1e-9 : electronWavelength(DEF.kV * 1e3, true), DEF.L, DEF.d * CFG[pt].dScale);

  return {
    state: () => {
      const p = phys();
      const sp = fringeSpacing(p.lambda, p.L, p.d);
      return {
        hits,
        seeded,
        visibility,
        open,
        detector,
        strength,
        V: Veff(),
        whichPath: 1 - Veff(),
        mode,
        particle,
        lambda: p.lambda,
        d: p.d,
        a: p.a,
        L: p.L,
        spacing: sp,
        spacingRatio: sp / defaultSpacing(particle),
        playing,
        rate,
      };
    },
    dispose: () => {
      legend.remove();
      glow.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'double-slit',
  number: 14,
  symbol: 'Ds',
  title: 'The Double Slit',
  domain: 'quantum',
  level: 1,
  status: 'live',
  tagline: 'One particle, two paths, and an interference pattern.',
  content,
  mount,
};

export default topic;
