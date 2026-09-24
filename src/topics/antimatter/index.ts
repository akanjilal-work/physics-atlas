import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  ME_MEV, TRAPPED, annihilationEnergyJ, backproject, detectorIndex, gauss, gyroRadiusM,
  imagePeak, loadTrap, momentumMeV, mulberry32, pairThresholdMeV, rampFraction, ringHitAngle, splitPair,
  trapPotential, trapStep, traceTrack, type TrackSpec, type TrapParams,
} from './physics.ts';

type View = 'chamber' | 'pet' | 'alpha';

const THRESH = pairThresholdMeV();
const POS_COL = PALETTE.rose;
const ELE_COL = PALETTE.cyan;
const GAMMA_COL = PALETTE.amber;
const HBAR_COL = PALETTE.violet;

const CAM: Record<View, [number, number, number]> = { chamber: [0, -2.8, 13.6], pet: [1.4, -4.6, 17.5], alpha: [8.6, 1.2, 10.8] };
const TGT: Record<View, [number, number, number]> = { chamber: [0, 0.1, 0], pet: [0, 0.2, 0], alpha: [0, 0, 0] };

// --- Cloud chamber (1 scene unit = 5 cm)
const U1 = 20; // units per metre
const RCH = 0.205; // chamber radius, m
const CONV_X = -0.13; // conversion point, m
const PLATE_X = -0.06; // lead plate position, m
const PLATE_MM = 0.5;
const DS = 0.001; // track step, m
const PATH_CAP = 1500;
const DROPS_PER = 2;
const LOSS = 2.5; // MeV/m at β = 1, about ten times a real gas
const AIR_X0 = 304; // m
const REVEAL = 0.45; // m of track per second
const GX0 = -6.5; // photon start, units

// --- PET (1 scene unit = 8 cm)
const U2 = 1 / 8;
const RING_CM = 40;
const NDET = 180;
const PHANTOM_CM = 15;
const IMG_N = 64;
const IMG_HALF = 16;
const POOL = 160;
const FLY = 0.14;
const LOR_LIFE = 1.6;
const SPOT_SIGMA = 0.35; // cm
const SPOT_FRAC = 0.7;
const ACOL_SIGMA = (0.5 / 2.355) * (Math.PI / 180); // 0.5° FWHM

// --- ALPHA-g toy
const NATOM = 160;
const ZS = 2.4; // scene units per model half-length
const TUBE_R = 0.75;
const H_TRAP = 0.002;
const NFLASH = 48;
const PIONS = 4;

const glowVert = /* glsl */ `
attribute vec3 color;
attribute float aA;
attribute float aSize;
varying vec3 vC;
varying float vA;
void main() {
  vC = color;
  vA = aA;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const glowFrag = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5 || vA <= 0.0) discard;
  float a = (smoothstep(0.5, 0.0, r) * 0.8 + smoothstep(0.18, 0.0, r) * 0.6) * vA;
  gl_FragColor = vec4(vC * a, 1.0);
}`;
const dropVert = /* glsl */ `
attribute float aS;
attribute float aSeed;
attribute vec3 aCol;
uniform float uS;
uniform float uFade;
uniform float uTint;
uniform float uSize;
varying float vA;
varying vec3 vC;
void main() {
  float shown = step(aS, uS);
  vA = shown * uFade * (0.3 + 0.7 * aSeed);
  vC = mix(vec3(0.82, 0.88, 1.0), aCol, uTint);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.55 + aSeed) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const dropFrag = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5 || vA <= 0.0) discard;
  gl_FragColor = vec4(vC * smoothstep(0.5, 0.05, r) * vA, 1.0);
}`;

interface Glow {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  a: Float32Array;
  size: Float32Array;
  commit(): void;
}

function makeGlow(cap: number): Glow {
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  const a = new Float32Array(cap);
  const size = new Float32Array(cap);
  const g = new THREE.BufferGeometry();
  const attrs = [
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)).getAttribute('position'),
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage)).getAttribute('color'),
    g.setAttribute('aA', new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage)).getAttribute('aA'),
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage)).getAttribute('aSize'),
  ] as THREE.BufferAttribute[];
  const m = new THREE.ShaderMaterial({ vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 5;
  return { points, pos, col, a, size, commit: () => attrs.forEach((x) => (x.needsUpdate = true)) };
}

function lineBuffer(nSeg: number): { mesh: THREE.LineSegments; pos: Float32Array; col: Float32Array; commit(n: number): void } {
  const pos = new Float32Array(nSeg * 6);
  const col = new Float32Array(nSeg * 6);
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa);
  g.setAttribute('color', ca);
  const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.frustumCulled = false;
  return {
    mesh, pos, col,
    commit: (n) => { g.setDrawRange(0, n * 2); pa.needsUpdate = true; ca.needsUpdate = true; },
  };
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.chamber, target: TGT.chamber, fov: 42 });
  const { scene } = stage;
  const rng = mulberry32(20231);
  const cTmp = new THREE.Color();

  let view: View = 'chamber';

  // =====================================================================
  // View 1: cloud chamber
  // =====================================================================
  const g1 = new THREE.Group();
  scene.add(g1);
  let eGamma = 4;
  let bField = 0.08;
  let lead = false;
  let tint = true;
  let armed = false;
  let crossedUp = false;
  let quizActive = false;
  let quizCorrect = false;

  const floor = new THREE.Mesh(new THREE.CircleGeometry(RCH * U1, 96), new THREE.MeshBasicMaterial({ color: 0x0a1120 }));
  floor.position.z = -0.03;
  g1.add(floor);
  const rim = new THREE.Mesh(new THREE.RingGeometry(RCH * U1, RCH * U1 + 0.14, 128), new THREE.MeshBasicMaterial({ color: 0x2c3852 }));
  g1.add(rim);
  stage.label('cloud chamber · 40 cm across', [0, -RCH * U1 - 0.45, 0], 'muted', g1);

  // Field markers: ⊙ for B out of the screen, ⊗ for into it.
  const dotPts: number[] = [];
  const circSeg: number[] = [];
  const crossSeg: number[] = [];
  const RM = 0.1;
  for (let x = -3.5; x <= 3.51; x += 1) {
    for (let y = -3.5; y <= 3.51; y += 1) {
      if (x * x + y * y > 3.7 * 3.7) continue;
      dotPts.push(x, y, -0.01);
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * 2 * Math.PI;
        const a1 = ((k + 1) / 12) * 2 * Math.PI;
        circSeg.push(x + RM * Math.cos(a0), y + RM * Math.sin(a0), -0.01, x + RM * Math.cos(a1), y + RM * Math.sin(a1), -0.01);
      }
      const d = RM * 0.7;
      crossSeg.push(x - d, y - d, -0.01, x + d, y + d, -0.01, x - d, y + d, -0.01, x + d, y - d, -0.01);
    }
  }
  const markMat = new THREE.LineBasicMaterial({ color: 0x4a5a7c, transparent: true, opacity: 0.5 });
  const circG = new THREE.BufferGeometry();
  circG.setAttribute('position', new THREE.Float32BufferAttribute(circSeg, 3));
  const circles = new THREE.LineSegments(circG, markMat);
  g1.add(circles);
  const crossG = new THREE.BufferGeometry();
  crossG.setAttribute('position', new THREE.Float32BufferAttribute(crossSeg, 3));
  const crosses = new THREE.LineSegments(crossG, markMat);
  g1.add(crosses);
  const dotG = new THREE.BufferGeometry();
  dotG.setAttribute('position', new THREE.Float32BufferAttribute(dotPts, 3));
  const dotMat = new THREE.PointsMaterial({ color: 0x4a5a7c, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.8 });
  const dots = new THREE.Points(dotG, dotMat);
  g1.add(dots);
  const bLabel = stage.label('', [0, RCH * U1 + 0.45, 0], '', g1);

  // Lead plate
  const plateH = 2 * Math.sqrt(RCH * RCH - PLATE_X * PLATE_X) * U1;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, plateH, 0.25), new THREE.MeshStandardMaterial({ color: 0x7c8598, metalness: 0.6, roughness: 0.5 }));
  plate.position.set(PLATE_X * U1, 0, 0);
  g1.add(plate);
  const plateLabel = stage.label(`lead ${PLATE_MM} mm`, [PLATE_X * U1, plateH / 2 + 0.25, 0], 'muted', g1);

  // Photon: dashed path plus a moving wave packet
  const gPath = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(GX0, 0, 0), new THREE.Vector3(6.5, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0x5a4a2a, dashSize: 0.18, gapSize: 0.14 }),
  );
  gPath.computeLineDistances();
  g1.add(gPath);
  const WAVE_N = 90;
  const wavePos = new Float32Array(WAVE_N * 3);
  const waveGeo = new THREE.BufferGeometry();
  waveGeo.setAttribute('position', new THREE.BufferAttribute(wavePos, 3).setUsage(THREE.DynamicDrawUsage));
  const wave = new THREE.Line(waveGeo, new THREE.LineBasicMaterial({ color: GAMMA_COL }));
  wave.frustumCulled = false;
  g1.add(wave);
  stage.label('γ: no charge, no trail', [CONV_X * U1 - 1.2, 0.4, 0], 'muted', g1);
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0xdfe6f3 }));
  nucleus.position.set(CONV_X * U1, 0, 0);
  g1.add(nucleus);
  const nucLabel = stage.label('nucleus', [CONV_X * U1, -0.35, 0], 'muted', g1);
  const statusLabel = stage.label('', [0.6, 1.2, 0], 'big', g1);

  // Tracks: vapour droplets
  const pathP = new Float32Array(PATH_CAP * 3);
  const pathM = new Float32Array(PATH_CAP * 3);
  let nP = 0;
  let nM = 0;
  const DCAP = PATH_CAP * DROPS_PER * 2;
  const dPos = new Float32Array(DCAP * 3);
  const dS = new Float32Array(DCAP);
  const dSeed = new Float32Array(DCAP);
  const dCol = new Float32Array(DCAP * 3);
  const dropGeo = new THREE.BufferGeometry();
  const dPosA = new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage);
  const dSA = new THREE.BufferAttribute(dS, 1).setUsage(THREE.DynamicDrawUsage);
  const dSeedA = new THREE.BufferAttribute(dSeed, 1).setUsage(THREE.DynamicDrawUsage);
  const dColA = new THREE.BufferAttribute(dCol, 3).setUsage(THREE.DynamicDrawUsage);
  dropGeo.setAttribute('position', dPosA);
  dropGeo.setAttribute('aS', dSA);
  dropGeo.setAttribute('aSeed', dSeedA);
  dropGeo.setAttribute('aCol', dColA);
  const dropMat = new THREE.ShaderMaterial({
    vertexShader: dropVert, fragmentShader: dropFrag,
    uniforms: { uS: { value: 0 }, uFade: { value: 1 }, uTint: { value: 1 }, uSize: { value: 55 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  g1.add(drops);
  const heads = makeGlow(2);
  g1.add(heads.points);
  const labP = stage.label('e⁺', [0, 0, 0], '', g1);
  const labM = stage.label('e⁻', [0, 0, 0], '', g1);
  (labP.element as HTMLElement).style.color = css(POS_COL);
  (labM.element as HTMLElement).style.color = css(ELE_COL);

  let pair = { tPlus: 0, tMinus: 0 };
  let plateInfo = { before: NaN, after: NaN, who: '' };
  let cyc = 0; // time within the current event
  let hasPair = false;

  function fillDrops(path: Float32Array, n: number, off: number, color: number): number {
    cTmp.set(color);
    let k = off;
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < DROPS_PER; d++) {
        dPos[k * 3] = (path[i * 3] + gauss(rng) * 0.0005) * U1;
        dPos[k * 3 + 1] = (path[i * 3 + 1] + gauss(rng) * 0.0005) * U1;
        dPos[k * 3 + 2] = gauss(rng) * 0.01;
        dS[k] = path[i * 3 + 2];
        dSeed[k] = rng();
        dCol[k * 3] = cTmp.r;
        dCol[k * 3 + 1] = cTmp.g;
        dCol[k * 3 + 2] = cTmp.b;
        k++;
      }
    }
    return k;
  }

  const spec: TrackSpec = {
    q: 1, t0: 1, bz: 0.1, x0: CONV_X, y0: 0, dir0: 0, ds: DS, lossPerM: LOSS, scatterX0: AIR_X0,
    rMax: RCH, plateX: PLATE_X, plateMm: 0, tMin: 0.015,
  };

  function newEvent(): void {
    cyc = 0;
    hasPair = eGamma >= THRESH;
    plateInfo = { before: NaN, after: NaN, who: '' };
    if (!hasPair) {
      nP = nM = 0;
      dropGeo.setDrawRange(0, 0);
      return;
    }
    const f = 0.2 + 0.6 * rng();
    pair = splitPair(eGamma, f);
    const open = Math.min(0.5, ME_MEV / eGamma);
    spec.bz = bField;
    spec.plateMm = lead ? PLATE_MM : 0;
    spec.q = 1; spec.t0 = pair.tPlus; spec.dir0 = (rng() - 0.5) * open;
    const rp = traceTrack(spec, pathP, rng);
    nP = rp.n;
    spec.q = -1; spec.t0 = pair.tMinus; spec.dir0 = (rng() - 0.5) * open;
    const rm = traceTrack(spec, pathM, rng);
    nM = rm.n;
    if (Number.isFinite(rp.tBefore)) plateInfo = { before: rp.tBefore, after: rp.tAfter, who: 'e⁺' };
    else if (Number.isFinite(rm.tBefore)) plateInfo = { before: rm.tBefore, after: rm.tAfter, who: 'e⁻' };
    let k = fillDrops(pathP, nP, 0, POS_COL);
    k = fillDrops(pathM, nM, k, ELE_COL);
    dropGeo.setDrawRange(0, k);
    dPosA.needsUpdate = dSA.needsUpdate = dSeedA.needsUpdate = dColA.needsUpdate = true;
  }

  const tFly = () => ((CONV_X * U1 - GX0) / 9);
  const pathEnd = (path: Float32Array, n: number) => (n > 0 ? path[(n - 1) * 3 + 2] : 0);

  function placeHead(i: number, path: Float32Array, n: number, s: number, color: number, fade: number): void {
    const end = pathEnd(path, n);
    if (n === 0 || s < 0) { heads.a[i] = 0; return; }
    const idx = Math.min(n - 1, Math.floor(s / DS));
    heads.pos[i * 3] = path[idx * 3] * U1;
    heads.pos[i * 3 + 1] = path[idx * 3 + 1] * U1;
    heads.pos[i * 3 + 2] = 0.02;
    cTmp.set(tint ? color : 0xe8eeff);
    heads.col[i * 3] = cTmp.r; heads.col[i * 3 + 1] = cTmp.g; heads.col[i * 3 + 2] = cTmp.b;
    heads.a[i] = s < end ? fade : 0;
    heads.size[i] = 140;
  }

  function placeLabel(lab: THREE.Object3D, path: Float32Array, n: number, s: number, dy: number): void {
    const idx = Math.min(n - 1, 70);
    lab.visible = tint && hasPair && n > 0 && s > idx * DS;
    if (lab.visible) lab.position.set(path[idx * 3] * U1, path[idx * 3 + 1] * U1 + dy, 0);
  }

  function frameChamber(dt: number): void {
    cyc += dt;
    const tf = tFly();
    // Photon wave packet
    const xEnd = hasPair ? CONV_X * U1 : 6.5;
    const xHead = GX0 + 9 * cyc;
    const showWave = xHead < xEnd + 0.9;
    wave.visible = showWave;
    if (showWave) {
      for (let i = 0; i < WAVE_N; i++) {
        const u = i / (WAVE_N - 1);
        let x = xHead - 0.9 * (1 - u);
        const env = Math.sin(Math.PI * u);
        x = Math.min(x, xEnd);
        wavePos[i * 3] = x;
        wavePos[i * 3 + 1] = x >= xEnd ? 0 : 0.12 * env * Math.sin(u * 26 - cyc * 40);
        wavePos[i * 3 + 2] = 0;
      }
      (waveGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (!hasPair) {
      dropMat.uniforms.uS.value = 0;
      heads.a[0] = heads.a[1] = 0;
      heads.commit();
      labP.visible = labM.visible = false;
      if (cyc > (6.5 - GX0) / 9 + 0.8) newEvent();
      return;
    }
    const sMax = Math.max(pathEnd(pathP, nP), pathEnd(pathM, nM));
    const tReveal = sMax / REVEAL;
    const s = Math.max(0, (cyc - tf) * REVEAL);
    const hold = tf + tReveal + 1.8;
    const fade = cyc < hold ? 1 : Math.max(0, 1 - (cyc - hold) / 0.9);
    dropMat.uniforms.uS.value = s;
    dropMat.uniforms.uFade.value = fade;
    dropMat.uniforms.uTint.value = tint ? 1 : 0;
    placeHead(0, pathP, nP, cyc > tf ? s : -1, POS_COL, fade);
    placeHead(1, pathM, nM, cyc > tf ? s : -1, ELE_COL, fade);
    heads.commit();
    placeLabel(labP, pathP, nP, s, -0.3);
    placeLabel(labM, pathM, nM, s, 0.3);
    if (fade <= 0) newEvent();
  }

  function paintChamberStatic(): void {
    const on = Math.abs(bField) > 1e-3;
    circles.visible = on;
    dots.visible = on && bField > 0;
    crosses.visible = on && bField < 0;
    const op = Math.min(0.75, 0.2 + Math.abs(bField) * 2.5);
    markMat.opacity = op;
    dotMat.opacity = op;
    (bLabel.element as HTMLElement).textContent = on
      ? `B = ${Math.abs(bField).toFixed(2)} T ${bField > 0 ? '⊙ out of the screen' : '⊗ into the screen'}`
      : 'B = 0: no bending';
    plate.visible = lead;
    plateLabel.visible = lead;
    const below = eGamma < THRESH;
    statusLabel.visible = below;
    (statusLabel.element as HTMLElement).textContent = `E_γ = ${eGamma.toFixed(2)} MeV < 1.022 MeV: no pair`;
    nucLabel.visible = !below;
  }

  // =====================================================================
  // View 2: PET ring
  // =====================================================================
  const g2 = new THREE.Group();
  scene.add(g2);
  let rate = 60;
  let srcX = 4;
  let srcY = -3;
  let hidden = false;
  let revealed = false;
  let petEvents = 0;
  let guess: { x: number; y: number } | null = null;
  let guessErr = Infinity;
  let rateAcc = 0;
  const img = new Float32Array(IMG_N * IMG_N);

  const detGeo = new THREE.BoxGeometry(0.42, 0.15, 1.3);
  const detMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.2 });
  const dets = new THREE.InstancedMesh(detGeo, detMat, NDET);
  const detHit = new Float32Array(NDET);
  const detBase = new THREE.Color(0x26324c);
  const detHot = new THREE.Color(GAMMA_COL);
  const cDet = new THREE.Color();
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const rr = RING_CM * U2 + 0.23;
    for (let i = 0; i < NDET; i++) {
      const a = (i / NDET) * 2 * Math.PI;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      m4.compose(new THREE.Vector3(rr * Math.cos(a), rr * Math.sin(a), 0), q, new THREE.Vector3(1, 1, 1));
      dets.setMatrixAt(i, m4);
      dets.setColorAt(i, detBase);
    }
  }
  g2.add(dets);
  const phantomR = PHANTOM_CM * U2;
  const phantom = new THREE.Mesh(
    new THREE.CylinderGeometry(phantomR, phantomR, 1.6, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3b6ea8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  );
  phantom.rotation.x = Math.PI / 2;
  g2.add(phantom);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(phantomR, 64), new THREE.MeshBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.35, depthWrite: false }));
  cap.position.z = -0.8;
  g2.add(cap);
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), new THREE.MeshBasicMaterial({ color: POS_COL }));
  g2.add(spot);
  stage.label('patient phantom (30 cm)', [0, -phantomR - 0.35, 0.8], 'muted', g2);
  stage.label('detector ring (80 cm)', [0, RING_CM * U2 + 0.8, 0], 'muted', g2);

  const lor = lineBuffer(POOL * 2);
  g2.add(lor.mesh);
  const emit = makeGlow(POOL);
  g2.add(emit.points);
  const evX = new Float32Array(POOL);
  const evY = new Float32Array(POOL);
  const evH1 = new Float32Array(POOL * 2);
  const evH2 = new Float32Array(POOL * 2);
  const evD1 = new Int32Array(POOL);
  const evD2 = new Int32Array(POOL);
  const evAge = new Float32Array(POOL).fill(1e9);
  let evNext = 0;
  const detXY = new Float32Array(NDET * 2);
  for (let i = 0; i < NDET; i++) {
    const a = (i / NDET) * 2 * Math.PI;
    detXY[i * 2] = RING_CM * Math.cos(a);
    detXY[i * 2 + 1] = RING_CM * Math.sin(a);
  }

  function randomSpot(): void {
    const r = 9 * Math.sqrt(rng());
    const a = rng() * 2 * Math.PI;
    srcX = r * Math.cos(a);
    srcY = r * Math.sin(a);
  }

  function clearImage(): void {
    img.fill(0);
    petEvents = 0;
    guess = null;
    guessErr = Infinity;
    if (hidden) revealed = false;
  }

  function spawnEvent(): void {
    let px: number;
    let py: number;
    if (rng() < SPOT_FRAC) {
      px = srcX + gauss(rng) * SPOT_SIGMA;
      py = srcY + gauss(rng) * SPOT_SIGMA;
    } else {
      const r = PHANTOM_CM * Math.sqrt(rng());
      const a = rng() * 2 * Math.PI;
      px = r * Math.cos(a);
      py = r * Math.sin(a);
    }
    const phi = rng() * 2 * Math.PI;
    const a1 = ringHitAngle(px, py, phi, RING_CM);
    const a2 = ringHitAngle(px, py, phi + Math.PI + gauss(rng) * ACOL_SIGMA, RING_CM);
    const d1 = detectorIndex(a1, NDET);
    const d2 = detectorIndex(a2, NDET);
    backproject(img, IMG_N, IMG_HALF, detXY[d1 * 2], detXY[d1 * 2 + 1], detXY[d2 * 2], detXY[d2 * 2 + 1]);
    petEvents++;
    const k = evNext;
    evNext = (evNext + 1) % POOL;
    evX[k] = px; evY[k] = py;
    evH1[k * 2] = RING_CM * Math.cos(a1); evH1[k * 2 + 1] = RING_CM * Math.sin(a1);
    evH2[k * 2] = RING_CM * Math.cos(a2); evH2[k * 2 + 1] = RING_CM * Math.sin(a2);
    evD1[k] = d1; evD2[k] = d2;
    evAge[k] = 0;
  }

  function frameEventsPet(dt: number): void {
    rateAcc += rate * dt;
    let spawned = 0;
    while (rateAcc >= 1 && spawned < 40) { rateAcc -= 1; spawnEvent(); spawned++; }
    if (rateAcc > 1) rateAcc = 0;
    // Visual pool
    const decay = Math.exp(-dt / 0.25);
    for (let i = 0; i < NDET; i++) detHit[i] *= decay;
    let seg = 0;
    const pos = lor.pos;
    const col = lor.col;
    cTmp.set(GAMMA_COL);
    for (let k = 0; k < POOL; k++) {
      const age = (evAge[k] += dt);
      emit.a[k] = 0;
      if (age > FLY + LOR_LIFE) continue;
      const px = evX[k] * U2;
      const py = evY[k] * U2;
      if (age < FLY) {
        const u = age / FLY;
        for (let side = 0; side < 2; side++) {
          const h = side === 0 ? evH1 : evH2;
          const o = seg * 6;
          const hx = h[k * 2] * U2;
          const hy = h[k * 2 + 1] * U2;
          const bx = px + (hx - px) * u;
          const by = py + (hy - py) * u;
          const tx = px + (hx - px) * Math.max(0, u - 0.25);
          const ty = py + (hy - py) * Math.max(0, u - 0.25);
          pos[o] = tx; pos[o + 1] = ty; pos[o + 2] = 0;
          pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = 0;
          for (let c = 0; c < 2; c++) { col[o + c * 3] = cTmp.r; col[o + c * 3 + 1] = cTmp.g; col[o + c * 3 + 2] = cTmp.b; }
          seg++;
        }
        emit.pos[k * 3] = px; emit.pos[k * 3 + 1] = py; emit.pos[k * 3 + 2] = 0.01;
        emit.col[k * 3] = 1; emit.col[k * 3 + 1] = 0.85; emit.col[k * 3 + 2] = 0.6;
        emit.a[k] = 1 - u;
        emit.size[k] = 260;
      } else {
        if (age - dt < FLY) { detHit[evD1[k]] = 1; detHit[evD2[k]] = 1; }
        const f = 0.55 * Math.pow(1 - (age - FLY) / LOR_LIFE, 2);
        const o = seg * 6;
        pos[o] = detXY[evD1[k] * 2] * U2; pos[o + 1] = detXY[evD1[k] * 2 + 1] * U2; pos[o + 2] = 0;
        pos[o + 3] = detXY[evD2[k] * 2] * U2; pos[o + 4] = detXY[evD2[k] * 2 + 1] * U2; pos[o + 5] = 0;
        for (let c = 0; c < 2; c++) { col[o + c * 3] = cTmp.r * f; col[o + c * 3 + 1] = cTmp.g * f; col[o + c * 3 + 2] = cTmp.b * f * 0.8; }
        seg++;
      }
    }
    lor.commit(seg);
    emit.commit();
    const c = cDet;
    for (let i = 0; i < NDET; i++) {
      c.copy(detBase).lerp(detHot, Math.min(1, detHit[i]));
      dets.setColorAt(i, c);
    }
    if (dets.instanceColor) dets.instanceColor.needsUpdate = true;
  }

  function paintPetStatic(): void {
    spot.visible = !hidden || revealed;
    spot.position.set(srcX * U2, srcY * U2, 0);
  }

  // =====================================================================
  // View 3: ALPHA-g toy model
  // =====================================================================
  const g3 = new THREE.Group();
  scene.add(g3);
  const trap: TrapParams = { depth: 4, width: 0.12, tilt: 0.1, ag: 1, bias: 0 };
  let rampTime = 10;
  let ramping = false;
  let rampT = 0;
  let alphaDone = false;
  let nUp = 0;
  let nDown = 0;
  let trapAcc = 0;
  let sNow = 1;
  const az = new Float64Array(NATOM);
  const av = new Float64Array(NATOM);
  const ast = new Uint8Array(NATOM);
  const aR = new Float32Array(NATOM);
  const aPhi = new Float32Array(NATOM);
  const aW = new Float32Array(NATOM);
  const lostOut = new Int32Array(2);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R, TUBE_R, 2 * ZS + 2.6, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3a4f78, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
  );
  g3.add(tube);
  const tubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(TUBE_R, TUBE_R, 2 * ZS + 2.6, 24, 6, true), 1),
    new THREE.LineBasicMaterial({ color: 0x33456a, transparent: true, opacity: 0.35 }),
  );
  g3.add(tubeEdges);
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xb87333, emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.35 });
  const coilGeo = new THREE.TorusGeometry(1.0, 0.1, 12, 64);
  for (const y of [ZS, -ZS]) {
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.rotation.x = Math.PI / 2;
    coil.position.y = y;
    g3.add(coil);
  }
  const solenoid: number[] = [];
  for (let y = -ZS - 1.2; y <= ZS + 1.21; y += 0.6) {
    for (let k = 0; k < 48; k++) {
      const a0 = (k / 48) * 2 * Math.PI;
      const a1 = ((k + 1) / 48) * 2 * Math.PI;
      solenoid.push(1.45 * Math.cos(a0), y, 1.45 * Math.sin(a0), 1.45 * Math.cos(a1), y, 1.45 * Math.sin(a1));
    }
  }
  const solG = new THREE.BufferGeometry();
  solG.setAttribute('position', new THREE.Float32BufferAttribute(solenoid, 3));
  g3.add(new THREE.LineSegments(solG, new THREE.LineBasicMaterial({ color: 0x2c3852, transparent: true, opacity: 0.6 })));
  stage.label('mirror coil', [1.25, ZS + 0.3, 0], 'muted', g3);
  stage.label('mirror coil', [1.25, -ZS - 0.3, 0], 'muted', g3);
  stage.label('simplified model, not to scale', [0, -ZS - 2.3, 0], 'muted', g3);
  const topLabel = stage.label('', [0, ZS + 1.75, 0], 'big', g3);
  const botLabel = stage.label('', [0, -ZS - 1.75, 0], 'big', g3);
  const gArrow = stage.label('', [-2.1, 0, 0], '', g3);

  const atoms = makeGlow(NATOM);
  g3.add(atoms.points);
  const flashes = lineBuffer(NFLASH * PIONS);
  g3.add(flashes.mesh);
  const flashCore = makeGlow(NFLASH);
  g3.add(flashCore.points);
  const flX = new Float32Array(NFLASH);
  const flY = new Float32Array(NFLASH);
  const flZ = new Float32Array(NFLASH);
  const flDir = new Float32Array(NFLASH * PIONS * 3);
  const flAge = new Float32Array(NFLASH).fill(1e9);
  let flNext = 0;

  function reloadTrap(): void {
    loadTrap(az, av, ast, trap, rng);
    for (let i = 0; i < NATOM; i++) {
      aR[i] = 0.55 * Math.sqrt(rng());
      aPhi[i] = rng() * 2 * Math.PI;
      aW[i] = (rng() - 0.5) * 3;
    }
    ramping = false;
    rampT = 0;
    alphaDone = false;
    nUp = nDown = 0;
    sNow = 1;
    flAge.fill(1e9);
  }

  function spawnFlash(up: boolean): void {
    const k = flNext;
    flNext = (flNext + 1) % NFLASH;
    const a = rng() * 2 * Math.PI;
    flX[k] = TUBE_R * Math.cos(a);
    flZ[k] = TUBE_R * Math.sin(a);
    flY[k] = (up ? 1 : -1) * (ZS + 0.15 + 0.7 * rng());
    for (let p = 0; p < PIONS; p++) {
      // Pions leave roughly outward, in random directions.
      let dx = gauss(rng) + 1.2 * Math.cos(a);
      let dy = gauss(rng) * 0.8;
      let dz = gauss(rng) + 1.2 * Math.sin(a);
      const l = Math.hypot(dx, dy, dz) || 1;
      const L = 1.1 + rng() * 1.2;
      dx *= L / l; dy *= L / l; dz *= L / l;
      flDir[(k * PIONS + p) * 3] = dx;
      flDir[(k * PIONS + p) * 3 + 1] = dy;
      flDir[(k * PIONS + p) * 3 + 2] = dz;
    }
    flAge[k] = 0;
  }

  function frameAlpha(dt: number, t: number): void {
    if (ramping && !alphaDone) {
      trapAcc += Math.min(dt, 0.05);
      while (trapAcc >= H_TRAP) {
        trapAcc -= H_TRAP;
        const s0 = rampFraction(rampT, rampTime);
        rampT += H_TRAP;
        trapStep(az, av, ast, trap, s0, rampFraction(rampT, rampTime), H_TRAP, lostOut);
        for (let i = 0; i < lostOut[0]; i++) spawnFlash(true);
        for (let i = 0; i < lostOut[1]; i++) spawnFlash(false);
        nUp += lostOut[0];
        nDown += lostOut[1];
      }
      sNow = rampFraction(rampT, rampTime);
      if (nUp + nDown >= NATOM) { alphaDone = true; ramping = false; }
    } else if (!ramping && !alphaDone) {
      // Static trap: atoms bounce, nothing escapes.
      trapAcc += Math.min(dt, 0.05);
      while (trapAcc >= H_TRAP) { trapAcc -= H_TRAP; trapStep(az, av, ast, trap, 1, 1, H_TRAP, lostOut); nUp += lostOut[0]; nDown += lostOut[1]; }
    }
    coilMat.emissiveIntensity = 0.05 + 0.75 * sNow;
    cTmp.set(HBAR_COL);
    for (let i = 0; i < NATOM; i++) {
      const on = ast[i] === TRAPPED;
      atoms.a[i] = on ? 0.9 : 0;
      if (!on) continue;
      const ph = aPhi[i] + aW[i] * t;
      atoms.pos[i * 3] = aR[i] * Math.cos(ph);
      atoms.pos[i * 3 + 1] = az[i] * ZS;
      atoms.pos[i * 3 + 2] = aR[i] * Math.sin(ph);
      atoms.col[i * 3] = cTmp.r; atoms.col[i * 3 + 1] = cTmp.g; atoms.col[i * 3 + 2] = cTmp.b;
      atoms.size[i] = 150;
    }
    atoms.commit();
    let seg = 0;
    for (let k = 0; k < NFLASH; k++) {
      const age = (flAge[k] += dt);
      flashCore.a[k] = 0;
      if (age > 1.1) continue;
      const u = Math.min(1, age / 0.18);
      const f = Math.max(0, 1 - age / 1.1);
      for (let p = 0; p < PIONS; p++) {
        const o = seg * 6;
        const d = (k * PIONS + p) * 3;
        flashes.pos[o] = flX[k]; flashes.pos[o + 1] = flY[k]; flashes.pos[o + 2] = flZ[k];
        flashes.pos[o + 3] = flX[k] + flDir[d] * u; flashes.pos[o + 4] = flY[k] + flDir[d + 1] * u; flashes.pos[o + 5] = flZ[k] + flDir[d + 2] * u;
        for (let c = 0; c < 2; c++) { flashes.col[o + c * 3] = 1 * f; flashes.col[o + c * 3 + 1] = 0.75 * f; flashes.col[o + c * 3 + 2] = 0.35 * f; }
        seg++;
      }
      flashCore.pos[k * 3] = flX[k]; flashCore.pos[k * 3 + 1] = flY[k]; flashCore.pos[k * 3 + 2] = flZ[k];
      flashCore.col[k * 3] = 1; flashCore.col[k * 3 + 1] = 0.9; flashCore.col[k * 3 + 2] = 0.7;
      flashCore.a[k] = f;
      flashCore.size[k] = 320;
    }
    flashes.commit(seg);
    flashCore.commit();
    (topLabel.element as HTMLElement).textContent = `top: ${nUp}`;
    (botLabel.element as HTMLElement).textContent = `bottom: ${nDown}`;
  }

  function paintAlphaStatic(): void {
    const a = trap.ag + trap.bias;
    (gArrow.element as HTMLElement).textContent = a === 0 ? 'no net tilt' : a > 0 ? `↓ pull ${a} g` : `↑ pull ${-a} g`;
  }

  // =====================================================================
  // Overlays: legend (left) and inset canvas (right)
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  function paintLegend(): void {
    const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;
    if (view === 'chamber') {
      legend.innerHTML = `${head('Pair production γ → e⁺e⁻')}
<div>${sw(GAMMA_COL, '∿ photon')}: invisible in a real chamber</div>
<div>${sw(POS_COL, '● positron')} e⁺, charge +e</div>
<div>${sw(ELE_COL, '● electron')} e⁻, charge −e</div>
<div>Same mass, opposite charge, so opposite curls in B.</div>`;
    } else if (view === 'pet') {
      legend.innerHTML = `${head('PET: e⁺e⁻ → γγ')}
<div>${sw(0xffd9a0, '●')} annihilation point</div>
<div>${sw(GAMMA_COL, '— 511 keV photons')}, back to back</div>
<div>${sw(GAMMA_COL, '— line of response')} between the two hits</div>
<div>${sw(POS_COL, '●')} true source (when shown)</div>`;
    } else {
      legend.innerHTML = `${head('ALPHA-g idea, simplified')}
<div>${sw(HBAR_COL, '● antihydrogen')} held between two mirror coils</div>
<div>${sw(GAMMA_COL, '✶ annihilation')} on the wall, pions fly out</div>
<div>Ramp the coils down. Gravity tilts the trap, so the bottom exit opens first.</div>`;
    }
  }

  const inset = document.createElement('canvas');
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = imgCanvas.height = IMG_N;
  const imgCtx = imgCanvas.getContext('2d')!;
  const imgData = imgCtx.createImageData(IMG_N, IMG_N);
  // Hot colour map: black → violet → rose → amber → white
  const STOPS: [number, number, number, number][] = [[0, 7, 10, 18], [0.3, 90, 50, 170], [0.55, 230, 80, 150], [0.8, 245, 182, 66], [1, 255, 255, 240]];
  const cmap = (v: number, out: number[]) => {
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0] || i === STOPS.length - 1) {
        const [a, r0, g0, b0] = STOPS[i - 1];
        const [b, r1, g1, b1] = STOPS[i];
        const u = Math.max(0, Math.min(1, (v - a) / (b - a)));
        out[0] = r0 + (r1 - r0) * u; out[1] = g0 + (g1 - g0) * u; out[2] = b0 + (b1 - b0) * u;
        return;
      }
    }
  };
  const rgb = [0, 0, 0];

  function sizeInset(): void {
    const [w, h] = view === 'chamber' ? [240, 120] : view === 'pet' ? [200, 222] : [170, 230];
    inset.width = w * 2;
    inset.height = h * 2;
    inset.style.width = `${w}px`;
    inset.style.height = `${h}px`;
    inset.style.pointerEvents = view === 'pet' ? 'auto' : 'none';
    inset.style.cursor = view === 'pet' ? 'crosshair' : '';
  }

  function drawInsetChamber(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '21px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('energy budget of the photon (MeV)', 16, 30);
    const x0 = 16;
    const x1 = W - 16;
    const eMax = 12;
    const xOf = (e: number) => x0 + (e / eMax) * (x1 - x0);
    const y = 70;
    const h = 56;
    ictx.fillStyle = '#1a2236';
    ictx.fillRect(x0, y, x1 - x0, h);
    if (eGamma >= THRESH) {
      ictx.fillStyle = '#56627c';
      ictx.fillRect(x0, y, xOf(THRESH) - x0, h);
      ictx.fillStyle = css(POS_COL);
      ictx.fillRect(xOf(THRESH), y, xOf(THRESH + pair.tPlus) - xOf(THRESH), h);
      ictx.fillStyle = css(ELE_COL);
      ictx.fillRect(xOf(THRESH + pair.tPlus), y, xOf(eGamma) - xOf(THRESH + pair.tPlus), h);
    } else {
      ictx.fillStyle = 'rgba(245,182,66,0.35)';
      ictx.fillRect(x0, y, xOf(eGamma) - x0, h);
    }
    ictx.strokeStyle = css(GAMMA_COL);
    ictx.lineWidth = 3;
    ictx.beginPath();
    ictx.moveTo(xOf(THRESH), y - 10);
    ictx.lineTo(xOf(THRESH), y + h + 10);
    ictx.stroke();
    ictx.fillStyle = css(GAMMA_COL);
    ictx.fillText('2mc² = 1.022', xOf(THRESH) + 6, y + h + 34);
    ictx.fillStyle = '#dfe6f3';
    ictx.font = '600 21px JetBrains Mono, monospace';
    const txt = eGamma >= THRESH ? 'rest mass | e⁺ KE | e⁻ KE' : 'not enough for two electrons';
    ictx.fillText(txt, x0, H - 16);
    ictx.fillStyle = '#56627c';
    ictx.font = '19px JetBrains Mono, monospace';
    ictx.fillText('12', x1 - 24, y + h + 34);
  }

  const imgPx = () => {
    const pad = 12;
    const size = inset.width - 2 * pad;
    return { pad, size, top: 40 };
  };

  function drawInsetPet(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText(`backprojection · ${petEvents} events`, 12, 28);
    let mx = 0;
    for (let i = 0; i < img.length; i++) if (img[i] > mx) mx = img[i];
    const d = imgData.data;
    for (let j = 0; j < IMG_N; j++) {
      for (let i = 0; i < IMG_N; i++) {
        const v = mx > 0 ? img[j * IMG_N + i] / mx : 0;
        cmap(Math.pow(v, 1.3), rgb);
        const o = ((IMG_N - 1 - j) * IMG_N + i) * 4; // flip so +y is up
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
      }
    }
    imgCtx.putImageData(imgData, 0, 0);
    const { pad, size, top } = imgPx();
    ictx.imageSmoothingEnabled = true;
    ictx.drawImage(imgCanvas, pad, top, size, size);
    const toPx = (x: number, y: number): [number, number] => [pad + ((x + IMG_HALF) / (2 * IMG_HALF)) * size, top + ((IMG_HALF - y) / (2 * IMG_HALF)) * size];
    const [cx, cy] = toPx(0, 0);
    ictx.strokeStyle = 'rgba(120,160,220,0.5)';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.arc(cx, cy, (PHANTOM_CM / (2 * IMG_HALF)) * size, 0, 2 * Math.PI);
    ictx.stroke();
    if (!hidden || revealed) {
      const [sx, sy] = toPx(srcX, srcY);
      ictx.strokeStyle = css(POS_COL);
      ictx.lineWidth = 2.5;
      ictx.beginPath();
      ictx.arc(sx, sy, (1 / (2 * IMG_HALF)) * size, 0, 2 * Math.PI);
      ictx.stroke();
    }
    if (guess) {
      const [gx, gy] = toPx(guess.x, guess.y);
      ictx.strokeStyle = '#ffffff';
      ictx.lineWidth = 2;
      ictx.beginPath();
      ictx.moveTo(gx - 10, gy); ictx.lineTo(gx + 10, gy);
      ictx.moveTo(gx, gy - 10); ictx.lineTo(gx, gy + 10);
      ictx.stroke();
    }
    ictx.fillStyle = '#56627c';
    ictx.font = '17px JetBrains Mono, monospace';
    ictx.fillText(hidden && !revealed ? 'click the hot spot' : '32 × 32 cm slice', 12, H - 10);
  }

  function drawInsetAlpha(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '19px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('energy vs height', 12, 26);
    const x0 = 24;
    const x1 = W - 14;
    const yt = 48;
    const yb = H - 30;
    const uMin = -0.6;
    const uMax = trap.depth + 0.6;
    const xOf = (u: number) => x0 + ((u - uMin) / (uMax - uMin)) * (x1 - x0);
    const yOf = (z: number) => yt + ((1.3 - z) / 2.6) * (yb - yt);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const z of [1, -1]) { ictx.beginPath(); ictx.moveTo(x0, yOf(z)); ictx.lineTo(x1, yOf(z)); ictx.stroke(); }
    ictx.strokeStyle = '#dfe6f3';
    ictx.lineWidth = 2.5;
    ictx.beginPath();
    for (let k = 0; k <= 120; k++) {
      const z = -1.3 + (2.6 * k) / 120;
      const x = xOf(trapPotential(z, sNow, trap));
      if (k === 0) ictx.moveTo(x, yOf(z)); else ictx.lineTo(x, yOf(z));
    }
    ictx.stroke();
    ictx.fillStyle = css(HBAR_COL);
    for (let i = 0; i < NATOM; i++) {
      if (ast[i] !== TRAPPED) continue;
      const e = 0.5 * av[i] * av[i] + trapPotential(az[i], sNow, trap);
      ictx.fillRect(xOf(e) - 2, yOf(az[i]) - 2, 4, 4);
    }
    ictx.fillStyle = '#56627c';
    ictx.font = '16px JetBrains Mono, monospace';
    ictx.fillText('top mirror', x0, yOf(1) - 6);
    ictx.fillText('bottom mirror', x0, yOf(-1) + 20);
    ictx.fillText('energy →', x1 - 92, H - 8);
  }

  const onInsetClick = (ev: MouseEvent) => {
    if (view !== 'pet') return;
    const r = inset.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * inset.width;
    const py = ((ev.clientY - r.top) / r.height) * inset.height;
    const { pad, size, top } = imgPx();
    const x = ((px - pad) / size) * 2 * IMG_HALF - IMG_HALF;
    const y = IMG_HALF - ((py - top) / size) * 2 * IMG_HALF;
    if (Math.abs(x) > IMG_HALF || Math.abs(y) > IMG_HALF) return;
    guess = { x, y };
    const err = Math.hypot(x - srcX, y - srcY);
    guessErr = petEvents >= 150 ? err : Infinity;
    if (hidden && petEvents >= 150 && err <= 1) revealed = true;
    paintPetStatic();
    drawInsetPet();
  };
  inset.addEventListener('click', onInsetClick);

  // =====================================================================
  // Controls
  // =====================================================================
  const ui = new Panel(panel);
  const sections: Record<View | 'all', HTMLElement[]> = { chamber: [], pet: [], alpha: [], all: [] };
  const sec = (title: string, v: View | 'all') => {
    ui.section(title);
    sections[v].push(ui.root.lastElementChild as HTMLElement);
  };

  sec('View', 'all');
  ui.select<View>({
    key: 'view', label: 'Experiment', value: view,
    options: [{ value: 'chamber', label: 'Cloud chamber' }, { value: 'pet', label: 'PET' }, { value: 'alpha', label: 'ALPHA drop' }],
    onChange: (v) => setView(v),
  });

  sec('Cloud chamber', 'chamber');
  const ctlE = ui.slider({
    key: 'egamma', label: 'Photon energy E_γ', min: 0.5, max: 12, step: 0.01, value: eGamma, unit: 'MeV',
    onInput: (v) => {
      eGamma = v;
      if (v < THRESH) armed = true;
      else if (armed) crossedUp = true;
      paintChamberStatic();
      newEvent();
    },
  });
  {
    const pct = (THRESH - 0.5) / (12 - 0.5);
    const tick = document.createElement('div');
    tick.style.cssText = 'position:relative;height:14px;font:600 10.5px JetBrains Mono, monospace;color:#f5b642';
    tick.innerHTML = `<span style="position:absolute;left:calc(${(pct * 100).toFixed(2)}% + ${((0.5 - pct) * 16).toFixed(1)}px);transform:translateX(-4px);white-space:nowrap">▲ threshold 1.022 MeV</span>`;
    ctlE.el.appendChild(tick);
  }
  const ctlB = ui.slider({
    key: 'bfield', label: 'Magnetic field B (+ is out of screen)', min: -0.4, max: 0.4, step: 0.005, value: bField, unit: 'T',
    format: (v) => v.toFixed(3),
    onInput: (v) => { bField = v; paintChamberStatic(); newEvent(); },
  });
  ui.toggle({ key: 'lead', label: `Lead plate (${PLATE_MM} mm), Anderson's trick`, value: lead, onChange: (v) => { lead = v; paintChamberStatic(); newEvent(); } });
  const ctlTint = ui.toggle({ key: 'tint', label: 'Colour trails by charge', value: tint, onChange: (v) => { tint = v; } });
  ui.buttons([
    { label: 'Mystery pair', primary: true, key: 'quiz', onClick: () => startQuiz() },
    { label: 'New event', onClick: () => newEvent() },
  ]);
  ui.buttons([
    { label: 'e⁺ is the upper trail', key: 'quiz', onClick: () => answer('upper') },
    { label: 'e⁺ is the lower trail', key: 'quiz', onClick: () => answer('lower') },
  ]);
  const quizNote = ui.note('Press <b>Mystery pair</b> to test yourself. The field may flip and the colours go.');
  const rEg = ui.readout('egamma', 'photon E_γ', 'MeV');
  const rTh = ui.readout('threshold', 'threshold 2mₑc²', 'MeV');
  const rTp = ui.readout('tplus', 'e⁺ kinetic');
  const rTm = ui.readout('tminus', 'e⁻ kinetic');
  const rRp = ui.readout('rplus', 'e⁺ radius r = p/eB');
  const rRm = ui.readout('rminus', 'e⁻ radius');
  const rBal = ui.readout('balance', 'energy balance');
  const rPlate = ui.readout('plate', 'plate loss');

  sec('PET scanner', 'pet');
  ui.slider({ key: 'rate', label: 'Event rate', min: 5, max: 400, step: 5, value: rate, unit: '/s', onInput: (v) => (rate = v) });
  ui.slider({ key: 'srcx', label: 'Source position x', min: -9, max: 9, step: 0.1, value: srcX, unit: 'cm', onInput: (v) => { srcX = v; manualSource(); } });
  ui.slider({ key: 'srcy', label: 'Source position y', min: -9, max: 9, step: 0.1, value: srcY, unit: 'cm', onInput: (v) => { srcY = v; manualSource(); } });
  ui.buttons([
    { label: 'Hide a random spot', primary: true, onClick: () => { hidden = true; revealed = false; randomSpot(); clearImage(); paintPetStatic(); } },
    { label: 'Clear image', onClick: () => { clearImage(); paintPetStatic(); } },
  ]);
  const rEv = ui.readout('events', 'events');
  const rPeak = ui.readout('peak', 'image peak');
  const rPeakErr = ui.readout('peakErr', 'peak error');
  const rGuess = ui.readout('guessErr', 'your guess error');

  sec('ALPHA drop (simplified)', 'alpha');
  ui.slider({ key: 'ramp', label: 'Trap ramp time', min: 1, max: 20, step: 0.5, value: rampTime, unit: 's', onInput: (v) => { rampTime = v; } });
  ui.select<'1' | '0' | '-1'>({
    key: 'ag', label: 'Gravity on antimatter', value: '1',
    options: [{ value: '1', label: '+g (measured)' }, { value: '0', label: 'none' }, { value: '-1', label: '−g (falls up)' }],
    onChange: (v) => { trap.ag = Number(v); paintAlphaStatic(); },
  });
  ui.slider({ key: 'bias', label: 'Mirror bias (as extra g)', min: -3, max: 3, step: 0.5, value: 0, unit: 'g', onInput: (v) => { trap.bias = v; paintAlphaStatic(); } });
  ui.buttons([
    { label: 'Ramp down', primary: true, key: 'ramp', onClick: () => { if (alphaDone || nUp + nDown > 0) reloadTrap(); ramping = true; rampT = 0; } },
    { label: 'Reload trap', onClick: () => reloadTrap() },
  ]);
  const rCur = ui.readout('current', 'mirror current');
  const rTop = ui.readout('top', 'annihilations top');
  const rBot = ui.readout('bottom', 'annihilations bottom');
  const rPd = ui.readout('pdown', 'fraction down');

  sec('Annihilation', 'all');
  const r511 = ui.readout('e511', 'each photon, mₑc²', 'keV');
  const rGram = ui.readout('gram', '1 g antimatter mc²', 'J');
  const rGram2 = ui.readout('gram2', 'with 1 g matter', 'J');
  r511((ME_MEV * 1000).toFixed(1));
  rGram((annihilationEnergyJ(1e-3) / 2).toExponential(2));
  rGram2(`${annihilationEnergyJ(1e-3).toExponential(2)}`);
  ui.legend([
    { color: css(POS_COL), label: 'positron e⁺' },
    { color: css(ELE_COL), label: 'electron e⁻' },
    { color: css(GAMMA_COL), label: 'photon γ' },
    { color: css(HBAR_COL), label: 'antihydrogen' },
  ]);

  function manualSource(): void {
    if (hidden) { hidden = false; revealed = false; clearImage(); }
    paintPetStatic();
  }

  function startQuiz(): void {
    const mag = Math.max(0.05, Math.abs(bField));
    bField = (rng() < 0.5 ? -1 : 1) * mag;
    ctlB.set(bField, false);
    if (eGamma < 2) { eGamma = 3 + rng() * 4; ctlE.set(eGamma, false); }
    tint = false;
    ctlTint.set(false, false);
    quizActive = true;
    quizNote.innerHTML = 'Look at the field symbol. Which trail is the positron?';
    paintChamberStatic();
    newEvent();
  }

  function answer(which: 'upper' | 'lower'): void {
    if (!quizActive) { quizNote.innerHTML = 'Press <b>Mystery pair</b> first.'; return; }
    const truth = bField > 0 ? 'lower' : 'upper';
    const ok = which === truth;
    if (ok) quizCorrect = true;
    quizActive = false;
    tint = true;
    ctlTint.set(true, false);
    quizNote.innerHTML = ok
      ? `Correct. With B ${bField > 0 ? 'out of' : 'into'} the screen, F = qv × B pushes a positive charge moving right ${truth === 'lower' ? 'down' : 'up'}.`
      : `Not quite. The positron is the ${truth} trail. Point v to the right, B ${bField > 0 ? 'out of' : 'into'} the screen, and apply F = qv × B for positive q.`;
  }

  function updateReadouts(): void {
    rEg(eGamma.toFixed(2));
    rTh(THRESH.toFixed(3));
    if (eGamma >= THRESH) {
      rTp(`${pair.tPlus.toFixed(2)} MeV`);
      rTm(`${pair.tMinus.toFixed(2)} MeV`);
      const b = Math.abs(bField);
      const r = (t: number) => (b < 1e-3 ? '∞' : `${(gyroRadiusM(momentumMeV(t), b) * 100).toFixed(1)} cm`);
      rRp(r(pair.tPlus));
      rRm(r(pair.tMinus));
      const bal = (eGamma - (pair.tPlus + pair.tMinus + 2 * ME_MEV)) * 1000;
      rBal(`${Math.abs(bal) < 1e-9 ? '0.000' : bal.toExponential(1)} keV`);
    } else {
      rTp('none'); rTm('none'); rRp('none'); rRm('none'); rBal('no pair');
    }
    rPlate(Number.isFinite(plateInfo.before) ? `${plateInfo.who} ${plateInfo.before.toFixed(2)} → ${plateInfo.after.toFixed(2)} MeV` : lead ? 'no crossing' : 'plate off');

    rEv(petEvents);
    const pk = imagePeak(img, IMG_N, IMG_HALF);
    const havePeak = petEvents >= 20;
    rPeak(havePeak ? (hidden && !revealed ? 'hidden' : `(${pk.x.toFixed(1)}, ${pk.y.toFixed(1)}) cm`) : '…');
    rPeakErr(havePeak && (!hidden || revealed) ? `${Math.hypot(pk.x - srcX, pk.y - srcY).toFixed(2)} cm` : '…');
    rGuess(Number.isFinite(guessErr) ? `${guessErr.toFixed(2)} cm` : guess ? 'need 150 events' : '…');

    rCur(`${(sNow * 100).toFixed(0)} %`);
    rTop(nUp);
    rBot(nDown);
    rPd(nUp + nDown > 0 ? `${((100 * nDown) / (nUp + nDown)).toFixed(0)} %` : '…');
  }

  function setView(v: View): void {
    view = v;
    g1.visible = v === 'chamber';
    g2.visible = v === 'pet';
    g3.visible = v === 'alpha';
    for (const k of ['chamber', 'pet', 'alpha'] as View[]) for (const el of sections[k]) el.style.display = k === v ? '' : 'none';
    stage.flyTo(CAM[v], TGT[v]);
    sizeInset();
    paintLegend();
    drawInset();
  }

  function drawInset(): void {
    if (view === 'chamber') drawInsetChamber();
    else if (view === 'pet') drawInsetPet();
    else drawInsetAlpha();
  }

  // =====================================================================
  // Frame loop
  // =====================================================================
  let insetTimer = 0;
  let readTimer = 0;
  stage.onFrame((dt, t) => {
    if (view === 'chamber') frameChamber(dt);
    // PET keeps collecting while other views are shown only if it is visible.
    if (view === 'pet') frameEventsPet(dt);
    if (view === 'alpha') frameAlpha(dt, t);
    insetTimer += dt;
    if (insetTimer > (view === 'pet' ? 0.15 : 0.08)) { insetTimer = 0; drawInset(); }
    readTimer += dt;
    if (readTimer > 0.1) { readTimer = 0; updateReadouts(); }
  });

  paintChamberStatic();
  paintPetStatic();
  paintAlphaStatic();
  reloadTrap();
  newEvent();
  setView('chamber');
  updateReadouts();

  return {
    state: () => {
      const pk = imagePeak(img, IMG_N, IMG_HALF);
      return {
        view,
        eGamma,
        bField,
        lead,
        pairMade: eGamma >= THRESH,
        crossedUp,
        quizCorrect,
        rate,
        srcX,
        srcY,
        petHidden: hidden,
        petEvents,
        petGuessErr: Number.isFinite(guessErr) ? guessErr : 999,
        petPeakErr: Math.hypot(pk.x - srcX, pk.y - srcY),
        rampTime,
        ag: trap.ag,
        bias: trap.bias,
        ramping,
        alphaDone,
        top: nUp,
        bottom: nDown,
        pDown: nUp + nDown > 0 ? nDown / (nUp + nDown) : 0,
      };
    },
    dispose: () => {
      inset.removeEventListener('click', onInsetClick);
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'antimatter',
  number: 73,
  title: 'Antimatter',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Mirror particles that annihilate on contact, and still fall down.',
  content,
  mount,
};

export default topic;
