import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  criticalRadius,
  FIELD_L,
  FLUX_N,
  fractionNearZero,
  countNearZero,
  findMinima,
  histogramFast,
  histRange,
  LAMBDA0,
  log10Rate,
  makeCharges,
  makeLandscape,
  NEAR_ZERO,
  nearestLower,
  potential,
  projectionAxes,
  shellRadius,
  thinWallB,
  vacuumCount,
  wallSpeed,
  type FluxParams,
  type Landscape,
  type Minimum,
} from './physics.ts';

type View = 'landscape' | 'flux';
type Phase = 'idle' | 'bubble' | 'jump' | 'settle';
type V3 = [number, number, number];

const MONO = 'JetBrains Mono, ui-monospace, monospace';
const SEG = 140; // terrain grid cells per side
const NV = (SEG + 1) * (SEG + 1);
const HS = 1.35; // world height per toy unit of V
const J_MAX = 7;
const MAXV = (2 * FLUX_N + 1) ** J_MAX;
const BIN_COUNT = 64;
const TAU_END = 4; // bubble animation runs to t = 4 R0
const BUBBLE_SECONDS = 2.6;
const JUMP_SECONDS = 1.3;
const FIND_THRESHOLD = 0.01;

const CAM: Record<View, { pos: V3; target: V3 }> = {
  landscape: { pos: [0.3, 9.6, 11.4], target: [0, 0.3, -0.5] },
  flux: { pos: [6.0, 3.4, 7.4], target: [0, 0.3, 0] },
};

const col = (hex: number) => new THREE.Color(hex);

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace(/[-0-9]/g, (ch) => (ch === '-' ? '⁻' : SUP[Number(ch)]));

/** Format 10^x as m×10ⁿ (or just 10ⁿ when the exponent is large). */
function fmtPow10(x: number): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '0';
  const e = Math.floor(x);
  if (Math.abs(e) >= 100) return `10${sup(Math.round(x))}`;
  const m = 10 ** (x - e);
  return `${m.toFixed(1)}×10${sup(e)}`;
}

function fmtNum(x: number, d = 2): string {
  if (!Number.isFinite(x)) return '∞';
  const a = Math.abs(x);
  if (a >= 1e4) return x.toExponential(1);
  return x.toFixed(d).replace('-', '−');
}

/** Soft round sprite used by points and glows. */
function makeDotTexture(soft: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.7, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.landscape.pos, target: CAM.landscape.target, fov: 42 });
  const { scene, camera, renderer } = stage;

  // --- State
  let view: View = 'landscape';
  let seed = 1;
  let nWells = 12;
  let sigma = 0.5;
  let energy = 1;
  let J = 3;
  let qScale = 0.45;
  let tunnels = 0;
  let phase: Phase = 'idle';
  let phaseT = 0;
  let noLowerFlash = 0;

  let land: Landscape = makeLandscape(seed, nWells);
  let mins: Minimum[] = [];
  let cur = 0;
  let target = -1;
  let eps = 0;
  let B = 0;
  let R0 = 0;
  let speedNow = 0;

  const q = makeCharges(seed, qScale);
  const flux: FluxParams = { J, q, lam0: LAMBDA0, N: FLUX_N };
  const selN = new Int8Array(J_MAX);
  let selLam = LAMBDA0;
  let frac = 0;
  let nearCount = 0;
  let minAbs = Infinity;
  let jMaxSeen = J;

  const dotTex = makeDotTexture(false);
  const glowTex = makeDotTexture(true);

  // =========================================================================
  // View 1: the landscape
  // =========================================================================
  const landGroup = new THREE.Group();
  scene.add(landGroup);

  const tPos = new Float32Array(NV * 3);
  const tCol = new Float32Array(NV * 3);
  const vRaw = new Float32Array(NV);
  const tIdx = new Uint32Array(SEG * SEG * 6);
  {
    let k = 0;
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < SEG; j++) {
        const a = i * (SEG + 1) + j;
        const b = a + 1;
        const c = a + (SEG + 1);
        const d = c + 1;
        tIdx.set([a, c, b, b, c, d], k);
        k += 6;
      }
    }
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j <= SEG; j++) {
        const v = i * (SEG + 1) + j;
        tPos[v * 3] = -FIELD_L + (2 * FIELD_L * j) / SEG;
        tPos[v * 3 + 2] = -FIELD_L + (2 * FIELD_L * i) / SEG;
      }
    }
  }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  terrainGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
  const terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  landGroup.add(terrain);

  // Contour-style grid lines draped on the terrain.
  const GSTEP = 7;
  const gLines = Math.floor(SEG / GSTEP) + 1;
  const gridPos = new Float32Array(gLines * 2 * SEG * 2 * 3);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: 0x6b7fb8, transparent: true, opacity: 0.16, depthWrite: false });
  const gridLines = new THREE.LineSegments(gridGeo, gridMat);
  gridLines.frustumCulled = false;
  landGroup.add(gridLines);

  // Sea level V = 0.
  const seaMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2 * FIELD_L + 0.6, 2 * FIELD_L + 0.6), seaMat);
  sea.rotation.x = -Math.PI / 2;
  landGroup.add(sea);
  {
    const e = FIELD_L + 0.3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-e, 0, -e, e, 0, -e, e, 0, e, -e, 0, e, -e, 0, -e], 3));
    landGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.45 })));
  }
  stage.label('sea level V = 0', [FIELD_L + 0.4, 0.05, -FIELD_L + 1], 'muted', landGroup);
  stage.label('field φ₁ →', [0, 0, FIELD_L + 0.9], 'muted', landGroup);
  stage.label('field φ₂ →', [-FIELD_L - 0.9, 0, 0], 'muted', landGroup);

  // Minima markers.
  const markerGroup = new THREE.Group();
  landGroup.add(markerGroup);
  const ringGeo = new THREE.RingGeometry(0.2, 0.27, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMatDS = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const ringMatAdS = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const glowMatDS = new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const glowMatAdS = new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.cyan, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  [ringMatDS, ringMatAdS, glowMatDS, glowMatAdS].forEach((m) => (m.toneMapped = false));

  // The ball: the universe sitting in its current vacuum.
  const ballGeo = new THREE.SphereGeometry(0.2, 32, 20);
  const ballMat = new THREE.MeshStandardMaterial({ color: PALETTE.green, emissive: PALETTE.green, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  landGroup.add(ball);
  const ballGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.green, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  ballGlowMat.toneMapped = false;
  const ballGlow = new THREE.Sprite(ballGlowMat);
  ballGlow.scale.setScalar(1.3);
  ball.add(ballGlow);
  const ballLabel = stage.label('the universe', [0, 0.5, 0], '', ball);
  ballLabel.element.style.color = css(PALETTE.green);

  // Target marker and tunnel path.
  const targetMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  targetMat.toneMapped = false;
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 48).rotateX(-Math.PI / 2), targetMat);
  landGroup.add(targetRing);
  const targetLabel = stage.label('lower vacuum', [0, 0.45, 0], '', targetRing);
  targetLabel.element.style.color = css(PALETTE.rose);

  const NP = 48;
  const pathPos = new Float32Array(NP * 3);
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
  const pathMat = new THREE.LineDashedMaterial({ color: PALETTE.rose, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.85, depthTest: false });
  const path = new THREE.Line(pathGeo, pathMat);
  path.frustumCulled = false;
  path.renderOrder = 5;
  landGroup.add(path);

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  const heightAt = (m: Minimum) => HS * energy * m.V;

  function bezier(s: number, out: THREE.Vector3): THREE.Vector3 {
    const a = (1 - s) * (1 - s);
    const b = 2 * s * (1 - s);
    const c = s * s;
    return out.set(a * p0.x + b * pc.x + c * p1.x, a * p0.y + b * pc.y + c * p1.y, a * p0.z + b * pc.z + c * p1.z);
  }

  function applyHeights(): void {
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let v = 0; v < NV; v++) {
      const V = energy * vRaw[v];
      tPos[v * 3 + 1] = HS * V;
      vmin = Math.min(vmin, V);
      vmax = Math.max(vmax, V);
    }
    const range = Math.max(1e-6, vmax - vmin);
    const ridge = col(0x121829);
    const mid = col(0x3a2f86);
    const deep = col(0x4fd1e8);
    const zero = col(0xdfe6f3);
    const cell = (2 * FIELD_L) / SEG;
    // Valley-floor glow, coloured by the sign of V at each minimum.
    const glowDS = col(PALETTE.amber);
    const glowAdS = col(PALETTE.cyan);
    const lx = 0.45;
    const ly = 0.8;
    const lz = 0.4;
    const ln = Math.hypot(lx, ly, lz);
    const c = new THREE.Color();
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j <= SEG; j++) {
        const v = i * (SEG + 1) + j;
        const yl = tPos[(i * (SEG + 1) + Math.max(0, j - 1)) * 3 + 1];
        const yr = tPos[(i * (SEG + 1) + Math.min(SEG, j + 1)) * 3 + 1];
        const yd = tPos[(Math.max(0, i - 1) * (SEG + 1) + j) * 3 + 1];
        const yu = tPos[(Math.min(SEG, i + 1) * (SEG + 1) + j) * 3 + 1];
        const nx = -(yr - yl) / (2 * cell);
        const nz = -(yu - yd) / (2 * cell);
        const nn = Math.hypot(nx, 1, nz);
        const lam = Math.max(0, (nx * lx + ly + nz * lz) / (nn * ln));
        const V = energy * vRaw[v];
        const u = (V - vmin) / range; // 0 = deepest
        c.copy(ridge).lerp(mid, Math.pow(1 - u, 1.3));
        const shade = 0.3 + 0.75 * lam;
        c.multiplyScalar(shade);
        const glow = 0.35 * Math.pow(1 - u, 3);
        c.r += deep.r * glow;
        c.g += deep.g * glow;
        c.b += deep.b * glow;
        const px = tPos[v * 3];
        const pz = tPos[v * 3 + 2];
        for (const m of mins) {
          const dx = px - m.x;
          const dz = pz - m.y;
          const d2 = dx * dx + dz * dz;
          if (d2 > 1.2) continue;
          const g = 1.1 * Math.exp(-d2 / 0.12);
          const gc = m.V > 0 ? glowDS : glowAdS;
          c.r += gc.r * g;
          c.g += gc.g * g;
          c.b += gc.b * g;
        }
        // Thin bright contour at V = 0.
        const z = Math.abs(V) / (0.012 * range);
        if (z < 1) c.lerp(zero, 0.55 * (1 - z));
        tCol[v * 3] = c.r;
        tCol[v * 3 + 1] = c.g;
        tCol[v * 3 + 2] = c.b;
      }
    }
    (terrainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (terrainGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    terrainGeo.computeBoundingSphere();

    // Grid lines.
    let k = 0;
    for (let g = 0; g < gLines; g++) {
      const line = g * GSTEP;
      for (let s = 0; s < SEG; s++) {
        // Along x at row `line`.
        const a = line * (SEG + 1) + s;
        const b = a + 1;
        // Along z at column `line`.
        const c2 = s * (SEG + 1) + line;
        const d2 = c2 + (SEG + 1);
        for (const idx of [a, b, c2, d2]) {
          gridPos[k++] = tPos[idx * 3];
          gridPos[k++] = tPos[idx * 3 + 1] + 0.012;
          gridPos[k++] = tPos[idx * 3 + 2];
        }
      }
    }
    (gridGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Markers.
    markerGroup.children.forEach((m, i) => {
      const mn = mins[i >> 1];
      if (mn) m.position.set(mn.x, heightAt(mn) + 0.03, mn.y);
    });
    placeBall();
    updateTarget();
  }

  function rebuildLandscape(): void {
    land = makeLandscape(seed, nWells);
    for (let i = 0; i <= SEG; i++) {
      for (let j = 0; j <= SEG; j++) {
        const v = i * (SEG + 1) + j;
        vRaw[v] = potential(land, tPos[v * 3], tPos[v * 3 + 2]);
      }
    }
    mins = findMinima(land);
    markerGroup.clear();
    for (const m of mins) {
      const ds = m.V > 0;
      const r = new THREE.Mesh(ringGeo, ds ? ringMatDS : ringMatAdS);
      const g = new THREE.Sprite(ds ? glowMatDS : glowMatAdS);
      g.scale.setScalar(1.1);
      markerGroup.add(r, g);
    }
    cur = 0;
    phase = 'idle';
    applyHeights();
  }

  function placeBall(): void {
    const m = mins[cur];
    if (!m || phase === 'jump') return;
    ball.position.set(m.x, heightAt(m) + 0.2, m.y);
  }

  function updateTarget(): void {
    target = mins.length ? nearestLower(mins, cur) : -1;
    const m = mins[cur];
    if (target >= 0 && m) {
      const t = mins[target];
      eps = energy * (m.V - t.V);
      targetRing.visible = true;
      targetRing.position.set(t.x, heightAt(t) + 0.05, t.y);
      p0.set(m.x, heightAt(m) + 0.2, m.y);
      p1.set(t.x, heightAt(t) + 0.2, t.y);
      pc.addVectors(p0, p1).multiplyScalar(0.5);
      pc.y = Math.min(p0.y, p1.y) - 1.1 - 0.15 * p0.distanceTo(p1);
      for (let i = 0; i < NP; i++) {
        bezier(i / (NP - 1), tmpV);
        pathPos[i * 3] = tmpV.x;
        pathPos[i * 3 + 1] = tmpV.y;
        pathPos[i * 3 + 2] = tmpV.z;
      }
      (pathGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      path.computeLineDistances();
      path.visible = true;
    } else {
      eps = 0;
      targetRing.visible = false;
      path.visible = false;
    }
    B = eps > 0 ? thinWallB(sigma, eps) : Infinity;
    R0 = eps > 0 ? criticalRadius(sigma, eps) : Infinity;
  }

  // =========================================================================
  // View 2: flux discretuum
  // =========================================================================
  const fluxGroup = new THREE.Group();
  fluxGroup.visible = false;
  scene.add(fluxGroup);
  const rStar = shellRadius(LAMBDA0);
  const WS = 2.1 / rStar; // world units per unit of flux radius

  const fPos = new Float32Array(MAXV * 3);
  const fCol = new Float32Array(MAXV * 3);
  const fLam = new Float32Array(MAXV);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const fMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, map: dotTex, transparent: true, alphaTest: 0.05, depthWrite: false, sizeAttenuation: true });
  const fPoints = new THREE.Points(fGeo, fMat);
  fPoints.frustumCulled = false;
  fluxGroup.add(fPoints);

  const sPos = new Float32Array(MAXV * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sMat = new THREE.PointsMaterial({ size: 0.2, color: PALETTE.green, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  sMat.toneMapped = false;
  const sPoints = new THREE.Points(sGeo, sMat);
  sPoints.frustumCulled = false;
  fluxGroup.add(sPoints);

  // The Λ = 0 shell.
  const shellGeo = new THREE.SphereGeometry(rStar * WS, 64, 40);
  const shellMat = new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
  fluxGroup.add(new THREE.Mesh(shellGeo, shellMat));
  const circleGeo = (() => {
    const v: number[] = [];
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * Math.PI * 2;
      v.push(rStar * WS * Math.cos(a), 0, rStar * WS * Math.sin(a));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  })();
  const circleMat = new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2]]) {
    const l = new THREE.Line(circleGeo, circleMat);
    l.rotation.set(rx, 0, rz);
    fluxGroup.add(l);
  }
  const shellLabel = stage.label('Λ = 0 shell', [0, -rStar * WS - 0.3, 0], '', fluxGroup);
  shellLabel.element.style.color = css(PALETTE.green);

  // Axes for the first three fluxes.
  const axisLen = 3.0;
  const axisMat = new THREE.LineBasicMaterial({ color: 0x56627c, transparent: true, opacity: 0.7 });
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-axisLen, 0, 0, axisLen, 0, 0, 0, -axisLen, 0, 0, axisLen, 0, 0, 0, -axisLen, 0, 0, axisLen], 3));
    fluxGroup.add(new THREE.LineSegments(g, axisMat));
  }
  stage.label('n₁q₁', [axisLen + 0.2, 0, 0], 'muted', fluxGroup);
  stage.label('n₂q₂', [0, axisLen + 0.2, 0], 'muted', fluxGroup);
  stage.label('n₃q₃', [0, 0, axisLen + 0.2], 'muted', fluxGroup);

  // Selected vacuum.
  const selMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  selMat.toneMapped = false;
  const selDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), selMat);
  fluxGroup.add(selDot);
  const selGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  selGlowMat.toneMapped = false;
  const selGlow = new THREE.Sprite(selGlowMat);
  selGlow.scale.setScalar(0.6);
  selDot.add(selGlow);
  const selLabel = stage.label('', [0, 0.28, 0], '', selDot);
  selLabel.element.style.color = '#ffffff';

  const axes = projectionAxes(8);
  const cNeg0 = col(0xa78bfa);
  const cNeg1 = col(0x34488f);
  const cPos0 = col(0xf5b642);
  const cPos1 = col(0x6a3d14);
  const cZero = col(PALETTE.green);
  let shellCount = 0;

  function lamColor(l: number, out: THREE.Color): THREE.Color {
    if (Math.abs(l) < NEAR_ZERO) return out.copy(cZero);
    if (l < 0) return out.copy(cNeg0).lerp(cNeg1, Math.min(1, -l / -LAMBDA0));
    return out.copy(cPos0).lerp(cPos1, Math.min(1, l / 1.2));
  }

  function fluxPosition(n: ArrayLike<number>, idx: number, out: THREE.Vector3): THREE.Vector3 {
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let r2 = 0;
    for (let i = 0; i < flux.J; i++) {
      const w = n[i] * q[i];
      vx += w * axes[i][0];
      vy += w * axes[i][1];
      vz += w * axes[i][2];
      r2 += w * w;
    }
    const r = Math.sqrt(r2);
    const len = Math.hypot(vx, vy, vz);
    if (r === 0) return out.set(0, 0, 0);
    if (len < 1e-6 * r) {
      const a = axes[3 + (idx % 5)];
      return out.set(a[0], a[1], a[2]).multiplyScalar(r * WS);
    }
    return out.set(vx, vy, vz).multiplyScalar((r * WS) / len);
  }

  function rebuildFlux(): void {
    const fresh = makeCharges(seed, qScale);
    for (let i = 0; i < fresh.length; i++) q[i] = fresh[i];
    flux.J = J;
    const total = vacuumCount(flux);
    const n = new Int8Array(J).fill(-FLUX_N);
    const c = new THREE.Color();
    shellCount = 0;
    minAbs = Infinity;
    for (let idx = 0; idx < total; idx++) {
      let s = 0;
      for (let i = 0; i < J; i++) s += n[i] * n[i] * q[i] * q[i];
      const lam = LAMBDA0 + 0.5 * s;
      fLam[idx] = lam;
      minAbs = Math.min(minAbs, Math.abs(lam));
      fluxPosition(n, idx, tmpV);
      fPos[idx * 3] = tmpV.x;
      fPos[idx * 3 + 1] = tmpV.y;
      fPos[idx * 3 + 2] = tmpV.z;
      lamColor(lam, c);
      fCol[idx * 3] = c.r;
      fCol[idx * 3 + 1] = c.g;
      fCol[idx * 3 + 2] = c.b;
      if (Math.abs(lam) < NEAR_ZERO) {
        sPos[shellCount * 3] = tmpV.x;
        sPos[shellCount * 3 + 1] = tmpV.y;
        sPos[shellCount * 3 + 2] = tmpV.z;
        shellCount++;
      }
      for (let i = 0; i < J; i++) {
        if (n[i] < FLUX_N) {
          n[i]++;
          break;
        }
        n[i] = -FLUX_N;
      }
    }
    fGeo.setDrawRange(0, total);
    sGeo.setDrawRange(0, shellCount);
    (fGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (fGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (sGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    fMat.size = [0.2, 0.18, 0.16, 0.11, 0.08, 0.06, 0.045][J - 1];
    fMat.opacity = J >= 5 ? 0.55 : 1;
    sMat.size = J >= 6 ? 0.14 : 0.26;
    nearCount = countNearZero(flux, NEAR_ZERO);
    frac = fractionNearZero(flux, NEAR_ZERO);
    for (let i = J; i < J_MAX; i++) selN[i] = 0;
    updateSelection();
    drawHist();
  }

  function updateSelection(): void {
    let s = 0;
    for (let i = 0; i < J; i++) s += selN[i] * selN[i] * q[i] * q[i];
    selLam = LAMBDA0 + 0.5 * s;
    let idx = 0;
    let mul = 1;
    for (let i = 0; i < J; i++) {
      idx += (selN[i] + FLUX_N) * mul;
      mul *= 2 * FLUX_N + 1;
    }
    fluxPosition(selN, idx, tmpV);
    selDot.position.copy(tmpV);
    const nv = Array.from(selN.slice(0, J)).map((x) => String(x).replace('-', '−')).join(', ');
    selLabel.element.textContent = `n = (${nv})  Λ = ${fmtNum(selLam, Math.abs(selLam) < 0.1 ? 4 : 2)}`;
  }

  // Click to pick a vacuum.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (view !== 'flux') return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.params.Points = { threshold: Math.max(0.04, fMat.size * 0.6) };
    const hits = raycaster.intersectObject(fPoints, false);
    if (!hits.length) return;
    let best = hits[0];
    const near = hits[0].distance;
    for (const h of hits) {
      if (h.distance > near + 0.6) break;
      if ((h.distanceToRay ?? 1) < (best.distanceToRay ?? 1)) best = h;
    }
    const idx = best.index ?? 0;
    let rem = idx;
    for (let i = 0; i < J; i++) {
      selN[i] = (rem % (2 * FLUX_N + 1)) - FLUX_N;
      rem = Math.floor(rem / (2 * FLUX_N + 1));
    }
    updateSelection();
    drawHist();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // =========================================================================
  // Overlays
  // =========================================================================
  const banner = document.createElement('div');
  banner.className = 'stage-overlay';
  Object.assign(banner.style, {
    position: 'absolute', left: '12px', top: '10px', zIndex: '2', pointerEvents: 'none',
    padding: '6px 12px', borderRadius: '10px', background: 'rgba(7,10,18,0.78)', border: '1px solid #243049',
    fontFamily: MONO, color: '#dfe6f3', maxWidth: '56%',
  } as CSSStyleDeclaration);
  const bannerMain = document.createElement('div');
  bannerMain.style.font = `700 15px ${MONO}`;
  const bannerSub = document.createElement('div');
  bannerSub.style.cssText = 'font-size:11.5px;color:#9aa6bd;margin-top:3px;line-height:1.45';
  const bannerTag = document.createElement('div');
  bannerTag.style.cssText = `font-size:10.5px;color:${css(PALETTE.amber)};margin-top:4px;letter-spacing:0.04em`;
  bannerTag.textContent = 'TOY MODEL · toy units';
  banner.append(bannerMain, bannerSub, bannerTag);
  viewport.appendChild(banner);

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '12px', bottom: '34px', zIndex: '2', pointerEvents: 'none',
    padding: '6px 10px', borderRadius: '10px', background: 'rgba(7,10,18,0.72)', border: '1px solid #243049',
    fontFamily: MONO, fontSize: '11px', color: '#9aa6bd', lineHeight: '1.6',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const legendHTML = (items: [number | string, string][]) =>
    items.map(([c, t]) => `<div><i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;background:${typeof c === 'number' ? css(c) : c}"></i>${t}</div>`).join('');

  // Bubble inset: a small separate 3D view of ordinary space.
  const bubbleBox = document.createElement('div');
  Object.assign(bubbleBox.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '220px', height: '160px', overflow: 'hidden',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(bubbleBox);
  const bRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  bRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  bRenderer.setSize(220, 160);
  bRenderer.setClearColor(0x000000, 0);
  bRenderer.outputColorSpace = THREE.SRGBColorSpace;
  bubbleBox.appendChild(bRenderer.domElement);
  const bCaption = document.createElement('div');
  bCaption.style.cssText = `position:absolute;left:10px;top:6px;right:8px;font:11px ${MONO};color:#9aa6bd;line-height:1.35;white-space:pre-line`;
  bubbleBox.appendChild(bCaption);
  const bScene = new THREE.Scene();
  const bCam = new THREE.PerspectiveCamera(38, 220 / 160, 0.1, 50);
  bCam.position.set(3.1, 1.9, 3.6);
  bCam.lookAt(0, -0.15, 0);
  const bBoxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2));
  const bBoxMat = new THREE.LineBasicMaterial({ color: 0x3a4a6e, transparent: true, opacity: 0.8 });
  bScene.add(new THREE.LineSegments(bBoxGeo, bBoxMat));
  const bSphereGeo = new THREE.SphereGeometry(1, 48, 32);
  const bFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.24, depthWrite: false });
  bFillMat.toneMapped = false;
  const bRimMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(PALETTE.rose) }, alpha: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float alpha; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(color, alpha * (0.08 + 0.92*f)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bFill = new THREE.Mesh(bSphereGeo, bFillMat);
  const bRim = new THREE.Mesh(bSphereGeo, bRimMat);
  const bBubble = new THREE.Group();
  bBubble.add(bFill, bRim);
  bBubble.visible = false;
  bScene.add(bBubble);
  const bClipPlanes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 1), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 1), new THREE.Plane(new THREE.Vector3(0, -1, 0), 1),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 1), new THREE.Plane(new THREE.Vector3(0, 0, -1), 1),
  ];
  bFillMat.clippingPlanes = bClipPlanes;
  bRimMat.clippingPlanes = bClipPlanes;
  bRimMat.clipping = true;
  bRenderer.localClippingEnabled = true;
  const bSeedMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bSeed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), bSeedMat);
  bScene.add(bSeed);

  // Histogram inset (flux view).
  const hist = document.createElement('canvas');
  hist.width = 440;
  hist.height = 320;
  Object.assign(hist.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '220px', height: '160px', display: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(hist);
  const hctx = hist.getContext('2d')!;

  function drawHist(): void {
    const c = hctx;
    const W = hist.width;
    const H = hist.height;
    c.clearRect(0, 0, W, H);
    const [lo, hiRaw] = histRange(flux);
    const hi = Math.max(0.6, hiRaw) + 1e-9;
    const h = histogramFast(flux, BIN_COUNT, lo, hi);
    const x0 = 18;
    const x1 = W - 14;
    const yb = H - 40;
    const yt = 74;
    const X = (l: number) => x0 + ((l - lo) / (hi - lo)) * (x1 - x0);
    const maxC = Math.max(1, ...h.counts);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText(`histogram of Λ · ${vacuumCount(flux).toLocaleString('en-US')} vacua`, 16, 30);
    c.fillStyle = css(PALETTE.green);
    c.fillText(`|Λ| < ${NEAR_ZERO}: ${nearCount.toLocaleString('en-US')} (${(frac * 100).toFixed(1)}%)`, 16, 58);
    // Near-zero band.
    c.fillStyle = 'rgba(94,227,154,0.16)';
    c.fillRect(X(-NEAR_ZERO), yt - 6, Math.max(2, X(NEAR_ZERO) - X(-NEAR_ZERO)), yb - yt + 6);
    const bw = (x1 - x0) / BIN_COUNT;
    const cc = new THREE.Color();
    for (let i = 0; i < BIN_COUNT; i++) {
      if (!h.counts[i]) continue;
      const lamMid = lo + ((i + 0.5) / BIN_COUNT) * (hi - lo);
      lamColor(lamMid, cc);
      c.fillStyle = `#${cc.getHexString()}`;
      const bh = Math.max(2, (h.counts[i] / maxC) * (yb - yt));
      c.fillRect(x0 + i * bw + 0.5, yb - bh, Math.max(1, bw - 1), bh);
    }
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, yb);
    c.lineTo(x1, yb);
    c.stroke();
    // Zero line.
    c.strokeStyle = css(PALETTE.green);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(X(0), yt - 8);
    c.lineTo(X(0), yb);
    c.stroke();
    c.fillStyle = '#56627c';
    c.font = `19px ${MONO}`;
    c.fillText(`${lo.toFixed(0).replace('-', '−')}`, x0 - 4, yb + 26);
    c.fillText('0', X(0) - 6, yb + 26);
    c.fillText('Λ', x1 - 14, yb + 26);
    // Selected vacuum.
    c.fillStyle = '#ffffff';
    c.beginPath();
    const sx = X(Math.max(lo, Math.min(hi, selLam)));
    c.moveTo(sx, yb + 4);
    c.lineTo(sx - 8, yb + 16);
    c.lineTo(sx + 8, yb + 16);
    c.fill();
  }

  // =========================================================================
  // Banner and readouts
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'landscape', label: '1 · Landscape' }, { value: 'flux', label: '2 · Flux discretuum' }],
    onChange: (v) => setView(v),
  });
  ui.slider({
    key: 'seed', label: 'Random seed', min: 1, max: 40, step: 1, value: seed,
    onInput: (v) => { seed = v; rebuildLandscape(); rebuildFlux(); refresh(); },
  });

  ui.section('Toy landscape V(φ₁, φ₂)');
  ui.slider({
    key: 'wells', label: 'Number of wells', min: 3, max: 24, step: 1, value: nWells,
    onInput: (v) => { nWells = v; ensureView('landscape'); rebuildLandscape(); refresh(); },
  });
  ui.slider({
    key: 'sigma', label: 'Wall tension σ', min: 0.05, max: 1.5, step: 0.01, value: sigma, format: (v) => v.toFixed(2),
    onInput: (v) => { sigma = v; ensureView('landscape'); updateTarget(); refresh(); },
  });
  ui.slider({
    key: 'energy', label: 'Energy difference scale', min: 0.2, max: 2, step: 0.01, value: energy, format: (v) => `${v.toFixed(2)}×`,
    onInput: (v) => { energy = v; ensureView('landscape'); applyHeights(); refresh(); },
  });
  const [tunnelBtn] = ui.buttons([
    { label: 'Tunnel', primary: true, key: 'tunnels', onClick: () => startTunnel() },
    { label: 'Back to top vacuum', onClick: () => { if (phase === 'jump') return; phase = 'idle'; bBubble.visible = false; cur = 0; placeBall(); updateTarget(); refresh(); } },
  ]);
  const rV = ui.readout('V', 'vacuum energy V');
  const rEps = ui.readout('eps', 'drop ε');
  const rB = ui.readout('B', 'bounce action B');
  const rRate = ui.readout('rate', 'rate Γ ~ e^−B');
  const rR0 = ui.readout('R0', 'bubble radius R₀');
  const rSpeed = ui.readout('speed', 'wall speed', 'c');
  const rVac = ui.readout('vacua', 'vacua found');
  const rTun = ui.readout('tunnels', 'tunnellings');

  ui.section('Flux discretuum');
  ui.slider({
    key: 'J', label: 'Number of fluxes J', min: 1, max: J_MAX, step: 1, value: J,
    onInput: (v) => { J = v; jMaxSeen = Math.max(jMaxSeen, v); ensureView('flux'); rebuildFlux(); refresh(); },
  });
  ui.slider({
    key: 'q', label: 'Charge scale q', min: 0.2, max: 1, step: 0.01, value: qScale, format: (v) => v.toFixed(2),
    onInput: (v) => { qScale = v; ensureView('flux'); rebuildFlux(); refresh(); },
  });
  ui.buttons([
    {
      label: 'Random vacuum', key: 'sel', onClick: () => {
        ensureView('flux');
        for (let i = 0; i < J; i++) selN[i] = Math.floor(Math.random() * (2 * FLUX_N + 1)) - FLUX_N;
        updateSelection();
        drawHist();
        refresh();
      },
    },
    { label: 'Back to n = 0', onClick: () => { selN.fill(0); updateSelection(); drawHist(); refresh(); } },
  ]);
  const rCount = ui.readout('count', 'vacua (5^J)');
  const rLam0 = ui.readout('lam0', 'bare Λ₀');
  const rSel = ui.readout('sel', 'selected n');
  const rLam = ui.readout('lam', 'selected Λ');
  const rFrac = ui.readout('frac', `share |Λ| < ${NEAR_ZERO}`);
  const rMin = ui.readout('minabs', 'smallest |Λ|');
  ui.note('Click a point to select that vacuum. Each flux integer runs from −2 to 2. All numbers are toy units. String theory estimates are often quoted as 10⁵⁰⁰ vacua, from hundreds of fluxes, not seven.');

  function refresh(): void {
    const m = mins[cur];
    const V = m ? energy * m.V : 0;
    rV(fmtNum(V));
    rEps(target >= 0 ? fmtNum(eps, 3) : 'none lower');
    rB(target >= 0 ? fmtNum(B, B < 10 ? 2 : 1) : '—');
    rRate(target >= 0 ? fmtPow10(log10Rate(B)) : '—');
    rR0(target >= 0 ? fmtNum(R0) : '—');
    rSpeed(phase === 'bubble' ? speedNow.toFixed(3) : '—');
    rVac(mins.length);
    rTun(tunnels);
    rCount(vacuumCount(flux).toLocaleString('en-US'));
    rLam0(LAMBDA0);
    rSel(`(${Array.from(selN.slice(0, J)).join(', ')})`);
    rLam(fmtNum(selLam, Math.abs(selLam) < 0.1 ? 4 : 3));
    rFrac(`${(frac * 100).toFixed(1)} %`);
    rMin(fmtNum(minAbs, 4));
    tunnelBtn.disabled = phase !== 'idle' && phase !== 'settle';
    updateBanner();
  }

  function updateBanner(): void {
    if (view === 'landscape') {
      const m = mins[cur];
      const V = m ? energy * m.V : 0;
      bannerMain.textContent = `V = ${fmtNum(V)}  ${V > 0 ? '(Λ > 0, de Sitter-like)' : '(Λ < 0, anti-de Sitter-like)'}`;
      if (noLowerFlash > 0 || target < 0) {
        bannerSub.textContent = 'This is the lowest valley. There is nothing lower to tunnel to, so this vacuum is stable.';
      } else if (phase === 'bubble') {
        bannerSub.textContent = `A bubble of the lower vacuum has nucleated. Its wall accelerates toward the speed of light: v = ${speedNow.toFixed(3)} c.`;
      } else {
        bannerSub.textContent = `B = 27π²σ⁴/2ε³ = ${fmtNum(B, 1)}  →  Γ ~ e⁻ᴮ = ${fmtPow10(log10Rate(B))}. Tunnel skips a wait of ~${fmtPow10(-log10Rate(B))}.`;
      }
    } else {
      bannerMain.textContent = `Λ = Λ₀ + ½Σ nᵢ²qᵢ² = ${fmtNum(selLam, Math.abs(selLam) < 0.1 ? 4 : 2)}`;
      const proj = J > 3 ? ' Points sit at their true flux radius. With J > 3 the direction is a projection.' : '';
      bannerSub.textContent = `${vacuumCount(flux).toLocaleString('en-US')} vacua from J = ${J} fluxes. ${nearCount.toLocaleString('en-US')} lie within ${NEAR_ZERO} of zero, on the green shell.${proj}`;
    }
  }

  function ensureView(v: View): void {
    if (view !== v) {
      viewCtl.set(v, false);
      setView(v);
    }
  }

  function setView(v: View): void {
    view = v;
    landGroup.visible = v === 'landscape';
    fluxGroup.visible = v === 'flux';
    bubbleBox.style.display = v === 'landscape' ? 'block' : 'none';
    hist.style.display = v === 'flux' ? 'block' : 'none';
    legend.innerHTML = v === 'landscape'
      ? legendHTML([[PALETTE.green, 'the universe (current vacuum)'], [PALETTE.rose, 'nearest lower vacuum'], [PALETTE.amber, 'valley with Λ > 0'], [PALETTE.cyan, 'valley with Λ < 0']])
      : legendHTML([[PALETTE.green, `|Λ| < ${NEAR_ZERO}`], [PALETTE.violet, 'Λ < 0'], [PALETTE.amber, 'Λ > 0'], ['#ffffff', 'selected vacuum']]);
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.3);
    if (v === 'flux') drawHist();
    refresh();
  }

  function startTunnel(): void {
    ensureView('landscape');
    if (phase === 'bubble' || phase === 'jump') return;
    if (target < 0) {
      noLowerFlash = 2.5;
      refresh();
      return;
    }
    phase = 'bubble';
    phaseT = 0;
    bBubble.visible = true;
    bRimMat.uniforms.alpha.value = 1;
    bFillMat.opacity = 0.24;
    refresh();
  }

  // =========================================================================
  // Frame loop
  // =========================================================================
  let captionText = '';
  const setCaption = (s: string) => {
    if (s !== captionText) {
      bCaption.textContent = s;
      captionText = s;
    }
  };

  stage.onFrame((dt, t) => {
    if (noLowerFlash > 0) {
      noLowerFlash -= dt;
      if (noLowerFlash <= 0) updateBanner();
    }
    if (view === 'landscape') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      targetMat.opacity = 0.55 + 0.4 * pulse;
      targetRing.scale.setScalar(1 + 0.12 * pulse);
      ballGlowMat.opacity = 0.55 + 0.25 * pulse;

      if (phase === 'bubble') {
        phaseT += dt;
        const tau = (phaseT / BUBBLE_SECONDS) * TAU_END;
        speedNow = wallSpeed(1, tau);
        bBubble.scale.setScalar(0.3 * Math.sqrt(1 + tau * tau));
        setCaption(`bubble of lower vacuum\nt = ${tau.toFixed(1)} R₀   v = ${speedNow.toFixed(3)} c`);
        rSpeed(speedNow.toFixed(3));
        if (phaseT % 0.25 < dt) updateBanner();
        if (phaseT >= BUBBLE_SECONDS) {
          phase = 'jump';
          phaseT = 0;
        }
      } else if (phase === 'jump') {
        phaseT += dt;
        const s = Math.min(1, phaseT / JUMP_SECONDS);
        const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
        bezier(e, tmpV);
        ball.position.copy(tmpV);
        setCaption('the bubble has swallowed this region');
        if (s >= 1) {
          cur = target;
          tunnels++;
          phase = 'settle';
          phaseT = 0;
          placeBall();
          updateTarget();
          refresh();
        }
      } else if (phase === 'settle') {
        phaseT += dt;
        const f = Math.max(0, 1 - phaseT / 1.2);
        bRimMat.uniforms.alpha.value = f;
        bFillMat.opacity = 0.24 * f;
        if (f <= 0) {
          phase = 'idle';
          bBubble.visible = false;
          refresh();
        }
      } else {
        setCaption(target >= 0 ? 'ordinary space, false vacuum\npress Tunnel to nucleate' : 'lowest vacuum: stable');
      }
      bSeed.visible = phase === 'bubble' || phase === 'jump';
      bScene.rotation.y += dt * 0.25;
      bRenderer.render(bScene, bCam);
    } else {
      sMat.opacity = 0.75 + 0.25 * Math.sin(t * 2.4);
      selGlow.scale.setScalar(0.5 + 0.12 * Math.sin(t * 4));
      fluxGroup.rotation.y += dt * 0.04;
    }
  });

  rebuildLandscape();
  rebuildFlux();
  setView(view);

  return {
    state: () => ({
      view,
      seed,
      wells: nWells,
      sigma,
      energy,
      tunnels,
      V: mins[cur] ? energy * mins[cur].V : 0,
      eps,
      B: Number.isFinite(B) ? B : 1e9,
      logRate: Number.isFinite(B) ? log10Rate(B) : -1e9,
      vacua: mins.length,
      J,
      q: qScale,
      jMaxSeen,
      lam: selLam,
      absLam: Math.abs(selLam),
      frac,
      nearCount,
      minAbs,
      threshold: FIND_THRESHOLD,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      banner.remove();
      legend.remove();
      hist.remove();
      bBoxGeo.dispose();
      bBoxMat.dispose();
      bSphereGeo.dispose();
      bFillMat.dispose();
      bRimMat.dispose();
      bSeed.geometry.dispose();
      bSeedMat.dispose();
      bRenderer.dispose();
      bRenderer.forceContextLoss();
      bubbleBox.remove();
      markerGroup.clear();
      ringGeo.dispose();
      [ringMatDS, ringMatAdS, glowMatDS, glowMatAdS].forEach((m) => m.dispose());
      circleGeo.dispose();
      stage.dispose();
      dotTex.dispose();
      glowTex.dispose();
    },
  };
}

const topic: Topic = {
  id: 'string-landscape',
  number: 53,
  title: 'The String Landscape',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'A vast terrain of possible universes, and why it worries physicists.',
  content,
  mount,
};

export default topic;
