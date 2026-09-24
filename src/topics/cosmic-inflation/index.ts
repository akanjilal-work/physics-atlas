import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  calibrate, crossings, Ea, epsH, epsV, H0_GEV, horizonCurve, idxAtN, idxAtT, K_GALAXY, K_PIVOT, lerpAt,
  log10Flatness, MP_GEV, NS_PLANCK, NS_SIGMA, POTENTIALS, powerR, R_BOUND, solve,
  type Calib, type HorizonCurve, type PotId, type Run,
} from './physics.ts';

type View = 'potential' | 'balloon' | 'horizon';
type Phase = 'inflate' | 'reheat' | 'hold';
type V3 = [number, number, number];

const MONO = 'JetBrains Mono, ui-monospace, monospace';
const CAM: Record<View, { pos: V3; target: V3 }> = {
  potential: { pos: [0.4, 8.8, 16.5], target: [0.2, 0.9, 0] },
  balloon: { pos: [0, 4.4, 9.6], target: [0, -0.7, 0] },
  horizon: { pos: [-1.2, 1.4, 17.2], target: [0, 0.3, 0] },
};

/** How each potential is laid out in the scene: field range and height scale. */
const DISP: Record<PotId, { lo: number; hi: number; hs: number; vmax: number }> = {
  starobinsky: { lo: -0.9, hi: 6.3, hs: 2.5, vmax: 1.6 },
  quadratic: { lo: -4, hi: 20.5, hs: 3.4 / 200, vmax: 240 },
};
const XW = 7; // potential spans x in [−XW, XW]
const NX = 180;
const NZ = 22;
const ZW = 2.5;
const PATCH_Z = [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1];
const MAIN = 3;

// Balloon
const BG = 100; // grid cells per side
const BL = 5.5; // half-width of the physical patch shown
const R0 = 1.7;
const LAMBDA_H = 0.8; // Hubble length in scene units
const MAX_MODES = 18;
const SPAWN_DN = 0.3;
const WR = [
  { l: 3, m: 2, a: 0.2 }, { l: 4, m: 3, a: 0.15 }, { l: 5, m: 5, a: 0.12 }, { l: 6, m: 4, a: 0.1 }, { l: 7, m: 3, a: 0.08 },
];

// Horizon ribbon
const RX = 7;
const RY = 4.2;
const MODES = [
  { k: 1, label: 'today’s horizon', color: 0xffffff },
  { k: K_PIVOT, label: 'CMB pivot k★', color: PALETTE.green },
  { k: K_GALAXY, label: 'galaxy scale', color: 0x8fb0ff },
];
const ERA_COL = [PALETTE.amber, PALETTE.rose, PALETTE.violet, PALETTE.cyan];

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace(/[-0-9]/g, (ch) => (ch === '-' ? '⁻' : SUP[Number(ch)]));
/** Format 10^x as m×10ⁿ. */
function fmtPow10(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return 'n/a';
  const e = Math.floor(x);
  const m = 10 ** (x - e);
  if (m.toFixed(digits) === '10.0') return `1.0×10${sup(e + 1)}`;
  return `${m.toFixed(digits)}×10${sup(e)}`;
}
const fmtSci = (v: number, d = 1) => (v === 0 ? '0' : fmtPow10(Math.log10(Math.abs(v)), d));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Deterministic pseudo-random numbers so a replay looks the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.potential.pos, target: CAM.potential.target, fov: 42, far: 800 });
  const { scene } = stage;
  const glowTex = glowTexture();

  // ------------------------------------------------------------------ state
  let view: View = 'potential';
  let potId: PotId = 'starobinsky';
  let phi0 = 4.1;
  let boostLog = 5;
  let speed = 6;
  let playing = true;
  let pot = POTENTIALS[potId];
  let cal: Calib = calibrate(pot);
  let run: Run = solve(pot, phi0);
  let curve: HorizonCurve = horizonCurve(run, cal);
  let phase: Phase = 'inflate';
  let Ncur = 0;
  let tSim = 0;
  let holdT = 0;
  let fi = 0;
  let bestFlat = 0;
  let prodMax = 1;
  const rand = rng(7);
  let gaussSpare = NaN;
  const gauss = () => {
    if (!Number.isNaN(gaussSpare)) {
      const g = gaussSpare;
      gaussSpare = NaN;
      return g;
    }
    const u = Math.max(1e-12, rand());
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    gaussSpare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  const lagT = new Float64Array(PATCH_Z.length); // quantum time lag of each patch

  const xOf = (phi: number) => {
    const d = DISP[potId];
    return -XW + (2 * XW * (phi - d.lo)) / (d.hi - d.lo);
  };
  const yOf = (phi: number) => {
    const d = DISP[potId];
    return d.hs * Math.min(d.vmax, pot.V(Math.max(d.lo, Math.min(d.hi, phi))));
  };

  // ================================================================ View 1: potential
  const potGroup = new THREE.Group();
  scene.add(potGroup);
  const sPos = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const sCol = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const sIdx: number[] = [];
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NX; j++) {
      const a = i * (NX + 1) + j;
      sIdx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  surfGeo.setIndex(sIdx);
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  potGroup.add(surf);

  // Cross lines every few cells, so the surface reads as a sheet.
  const GL = 12;
  const gCount = Math.floor(NX / GL) + 1;
  const gPos = new Float32Array(gCount * 2 * 3 + (NX * 2 * 3) * 2);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const gLines = new THREE.LineSegments(gGeo, new THREE.LineBasicMaterial({ color: 0x6b7fb8, transparent: true, opacity: 0.22, depthWrite: false }));
  potGroup.add(gLines);

  // Bright profile along the front edge.
  const profPos = new Float32Array((NX + 1) * 3);
  const profGeo = new THREE.BufferGeometry();
  profGeo.setAttribute('position', new THREE.BufferAttribute(profPos, 3));
  const profMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.9 });
  potGroup.add(new THREE.Line(profGeo, profMat));

  function markerLine(color: number): THREE.Line {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
    m.toneMapped = false;
    const l = new THREE.Line(g, m);
    l.renderOrder = 4;
    l.frustumCulled = false;
    potGroup.add(l);
    return l;
  }
  const endLine = markerLine(PALETTE.rose);
  const starLine = markerLine(PALETTE.amber);
  const startLine = markerLine(PALETTE.green);
  const endLabel = stage.label('ε = 1: inflation ends', [0, 0, 0], '', potGroup);
  endLabel.element.style.color = css(PALETTE.rose);
  const starLabel = stage.label('', [0, 0, 0], '', potGroup);
  starLabel.element.style.color = css(PALETTE.amber);
  const startLabel = stage.label('start φ₀', [0, 0, 0], '', potGroup);
  startLabel.element.style.color = css(PALETTE.green);
  const vLabel = stage.label('V(φ)', [-XW - 0.3, 3.2, ZW], 'muted', potGroup);
  stage.label('field φ →', [XW - 1.2, -0.4, ZW + 0.5], 'muted', potGroup);
  stage.label('patches of space →', [XW + 0.4, 0.05, -1.2], 'muted', potGroup);

  function setMarker(l: THREE.Line, phi: number, lift = 0.03): void {
    const p = l.geometry.attributes.position as THREE.BufferAttribute;
    const x = xOf(phi);
    const y = yOf(phi) + lift;
    p.setXYZ(0, x, y, -ZW);
    p.setXYZ(1, x, y, ZW);
    p.needsUpdate = true;
    l.visible = phi >= DISP[potId].lo && phi <= DISP[potId].hi;
  }

  function buildSurface(): void {
    const d = DISP[potId];
    const cLow = new THREE.Color(0x10213a);
    const cHigh = new THREE.Color(0x3a2f86);
    const cInf = new THREE.Color(0x6a4a9e);
    const cEnd = new THREE.Color(0x0f4f5c);
    const c = new THREE.Color();
    const dx = (d.hi - d.lo) / NX;
    for (let i = 0; i <= NZ; i++) {
      const z = -ZW + (2 * ZW * i) / NZ;
      for (let j = 0; j <= NX; j++) {
        const phi = d.lo + j * dx;
        const v = i * (NX + 1) + j;
        const y = yOf(phi);
        sPos[v * 3] = xOf(phi);
        sPos[v * 3 + 1] = y;
        sPos[v * 3 + 2] = z;
        const u = Math.min(1, y / (d.hs * Math.min(d.vmax, pot.V(d.hi))));
        const inflating = epsV(pot, phi) < 1;
        c.copy(cLow).lerp(cHigh, Math.pow(u, 0.6));
        if (inflating) c.lerp(cInf, 0.35);
        else c.lerp(cEnd, 0.6);
        // Shade by slope so the plateau reads as flat and the cliff as steep.
        const slope = Math.abs((yOf(phi + dx) - yOf(phi - dx)) / (xOf(phi + dx) - xOf(phi - dx)));
        c.multiplyScalar(1.05 - 0.45 * Math.min(1, slope / 1.5));
        sCol[v * 3] = c.r;
        sCol[v * 3 + 1] = c.g;
        sCol[v * 3 + 2] = c.b;
      }
    }
    (surfGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (surfGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    surfGeo.computeBoundingSphere();
    let k = 0;
    for (let g = 0; g < gCount; g++) {
      const j = g * GL;
      const x = sPos[j * 3];
      const y = sPos[j * 3 + 1] + 0.01;
      gPos[k++] = x; gPos[k++] = y; gPos[k++] = -ZW;
      gPos[k++] = x; gPos[k++] = y; gPos[k++] = ZW;
    }
    for (const zRow of [0, NZ / 2]) {
      for (let j = 0; j < NX; j++) {
        for (const jj of [j, j + 1]) {
          const v = zRow * (NX + 1) + jj;
          gPos[k++] = sPos[v * 3]; gPos[k++] = sPos[v * 3 + 1] + 0.01; gPos[k++] = sPos[v * 3 + 2];
        }
      }
    }
    gGeo.setDrawRange(0, k / 3);
    (gGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let j = 0; j <= NX; j++) {
      const v = NZ * (NX + 1) + j;
      profPos[j * 3] = sPos[v * 3];
      profPos[j * 3 + 1] = sPos[v * 3 + 1] + 0.015;
      profPos[j * 3 + 2] = ZW;
    }
    (profGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    profGeo.computeBoundingSphere();
    vLabel.position.set(-XW - 0.3, potId === 'quadratic' ? 3.4 : 2.6, ZW);
  }

  // Patches: our patch (large) and neighbours (small).
  const ballGeo = new THREE.SphereGeometry(1, 28, 18);
  const mainMat = new THREE.MeshStandardMaterial({ color: PALETTE.green, emissive: PALETTE.green, emissiveIntensity: 0.5, roughness: 0.35 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f3, emissive: 0x8fa3c8, emissiveIntensity: 0.35, roughness: 0.4 });
  const balls = PATCH_Z.map((_, k) => {
    const m = new THREE.Mesh(ballGeo, k === MAIN ? mainMat : sideMat);
    m.scale.setScalar(k === MAIN ? 0.22 : 0.14);
    potGroup.add(m);
    return m;
  });
  const mainGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.green, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  mainGlowMat.toneMapped = false;
  const mainGlow = new THREE.Sprite(mainGlowMat);
  mainGlow.scale.setScalar(5);
  balls[MAIN].add(mainGlow);
  const ballLabel = stage.label('our patch', [0, 2.3, 0], '', balls[MAIN]);
  ballLabel.element.style.color = css(PALETTE.green);
  const trail = new Trail(420, PALETTE.green, 0.9);
  potGroup.add(trail.line);

  // Reheating: a glow in the valley and sparks of new radiation.
  const heatMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffa640, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  heatMat.toneMapped = false;
  const heat = new THREE.Sprite(heatMat);
  heat.scale.set(4, 2, 1);
  potGroup.add(heat);
  const NSPARK = 220;
  const spPos = new Float32Array(NSPARK * 3);
  const spCol = new Float32Array(NSPARK * 3);
  const spVel = new Float32Array(NSPARK * 3);
  const spLife = new Float32Array(NSPARK);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
  const spMat = new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  spMat.toneMapped = false;
  const sparks = new THREE.Points(spGeo, spMat);
  sparks.frustumCulled = false;
  potGroup.add(sparks);
  let spNext = 0;
  let spAcc = 0;

  // ================================================================ View 2: balloon
  const balGroup = new THREE.Group();
  balGroup.visible = false;
  scene.add(balGroup);
  const NVB = (BG + 1) * (BG + 1);
  const bPos = new Float32Array(NVB * 3);
  const bCol = new Float32Array(NVB * 3);
  const bRho = new Float32Array(NVB);
  const bU = new Float32Array(NVB);
  const bV = new Float32Array(NVB);
  const bDx = new Float32Array(NVB);
  const bDz = new Float32Array(NVB);
  const bAng = WR.map(() => new Float32Array(NVB));
  const bRip = new Float32Array(NVB);
  {
    const wr = rng(3);
    const q = WR.map(() => wr() * Math.PI * 2);
    for (let i = 0; i <= BG; i++) {
      for (let j = 0; j <= BG; j++) {
        const v = i * (BG + 1) + j;
        const u = -BL + (2 * BL * j) / BG;
        const w = -BL + (2 * BL * i) / BG;
        const rho = Math.hypot(u, w);
        bU[v] = u;
        bV[v] = w;
        bRho[v] = rho;
        bDx[v] = rho > 1e-9 ? u / rho : 1;
        bDz[v] = rho > 1e-9 ? w / rho : 0;
        const ph = Math.atan2(w, u);
        WR.forEach((t, n) => (bAng[n][v] = t.a * Math.cos(t.m * ph + q[n])));
      }
    }
  }
  const bIdx: number[] = [];
  for (let i = 0; i < BG; i++) {
    for (let j = 0; j < BG; j++) {
      const a = i * (BG + 1) + j;
      bIdx.push(a, a + BG + 1, a + 1, a + 1, a + BG + 1, a + BG + 2);
    }
  }
  const balGeo = new THREE.BufferGeometry();
  balGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  balGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  balGeo.setIndex(bIdx);
  const balMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
  const balloon = new THREE.Mesh(balGeo, balMat);
  balloon.frustumCulled = false;
  balGroup.add(balloon);
  const ringPts: number[] = [];
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    ringPts.push(LAMBDA_H * Math.cos(a), 0, LAMBDA_H * Math.sin(a));
  }
  const hRingGeo = new THREE.BufferGeometry();
  hRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
  const hRingMat = new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.95, depthTest: false });
  hRingMat.toneMapped = false;
  const hRing = new THREE.Line(hRingGeo, hRingMat);
  hRing.renderOrder = 5;
  balGroup.add(hRing);
  const hLabel = stage.label('Hubble radius c/H', [LAMBDA_H + 0.2, 0.4, 0], '', hRing);
  hLabel.element.style.color = css(PALETTE.green);

  interface Mode { on: boolean; Nb: number; c: number; s: number; p: number; a: number }
  const modes: Mode[] = Array.from({ length: MAX_MODES }, () => ({ on: false, Nb: 0, c: 1, s: 0, p: 0, a: 1 }));
  let nextSpawn = 0;
  let spawnSlot = 0;
  let balDirty = true;
  const cBase = new THREE.Color(0x3b3f8f);
  const cHot = new THREE.Color(PALETTE.amber);
  const cCold = new THREE.Color(PALETTE.cyan);
  const cTmp = new THREE.Color();

  const ripAmp = () => (boostLog <= 0 ? 0 : Math.min(0.1, 0.028 * 10 ** ((boostLog - 5) / 2)));

  function updateBalloon(N: number, frozenN: number): void {
    const R = R0 * Math.exp(Math.min(N, 80));
    const A = ripAmp();
    const Nm = Math.min(N, frozenN);
    // Active modes: wavelength grows as e^(N − N_birth).
    for (let v = 0; v < NVB; v++) bRip[v] = 0;
    for (const m of modes) {
      if (!m.on) continue;
      const age = Nm - m.Nb;
      if (age < 0) continue;
      const k = (2 * Math.PI) / (LAMBDA_H * Math.exp(age));
      const w = A * m.a * smooth(0, 0.25, age) * (1 - smooth(3.0, 4.3, age));
      if (w < 1e-5) continue;
      const kc = k * m.c;
      const ks = k * m.s;
      for (let v = 0; v < NVB; v++) bRip[v] += w * Math.cos(kc * bU[v] + ks * bV[v] + m.p);
    }
    // Classical wrinkles keep their physical height while their width grows with R.
    for (let v = 0; v < NVB; v++) {
      const th = Math.min(Math.PI, bRho[v] / R);
      let wr = 0;
      for (let n = 0; n < WR.length; n++) wr += Math.sin(WR[n].l * th) * bAng[n][v];
      const h = wr + bRip[v];
      const st = Math.sin(th);
      const ct = Math.cos(th);
      const sh = Math.sin(th / 2);
      const rs = R * st;
      bPos[v * 3] = (rs + h * st) * bDx[v];
      bPos[v * 3 + 1] = -2 * R * sh * sh + h * ct;
      bPos[v * 3 + 2] = (rs + h * st) * bDz[v];
      const f = A > 0 ? Math.max(-1, Math.min(1, bRip[v] / (A * 3.2))) : 0;
      cTmp.copy(cBase).lerp(f > 0 ? cHot : cCold, Math.abs(f) * 0.7);
      bCol[v * 3] = cTmp.r;
      bCol[v * 3 + 1] = cTmp.g;
      bCol[v * 3 + 2] = cTmp.b;
    }
    (balGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (balGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    balGeo.computeVertexNormals();
    hRing.visible = N < frozenN;
  }

  function spawnModes(N: number): void {
    while (nextSpawn <= N) {
      const m = modes[spawnSlot];
      spawnSlot = (spawnSlot + 1) % MAX_MODES;
      const ang = rand() * Math.PI * 2;
      m.on = true;
      m.Nb = nextSpawn;
      m.c = Math.cos(ang);
      m.s = Math.sin(ang);
      m.p = rand() * Math.PI * 2;
      m.a = 0.6 + 0.8 * rand();
      nextSpawn += SPAWN_DN;
    }
  }

  // ================================================================ View 3: horizon ribbon
  const horGroup = new THREE.Group();
  horGroup.visible = false;
  scene.add(horGroup);
  const NC = curve.x.length;
  const rPos = new Float32Array(NC * 2 * 3);
  const rCol = new Float32Array(NC * 2 * 3);
  const rIdx: number[] = [];
  for (let i = 0; i < NC - 1; i++) {
    const a = i * 2;
    rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  ribGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
  ribGeo.setIndex(rIdx);
  const ribMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  horGroup.add(new THREE.Mesh(ribGeo, ribMat));
  const edgePos = new Float32Array(NC * 3);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const edge = new THREE.Line(edgeGeo, edgeMat);
  edge.frustumCulled = false;
  horGroup.add(edge);

  // Frame: axes and a "today" line.
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.Float32BufferAttribute([-RX, -RY, 0, RX, -RY, 0, -RX, -RY, 0, -RX, 3.2, 0], 3));
  horGroup.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: 0x56627c })));
  const todayGeo = new THREE.BufferGeometry();
  todayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const todayLine = new THREE.Line(todayGeo, new THREE.LineDashedMaterial({ color: 0x9aa6bd, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0.6 }));
  horGroup.add(todayLine);
  stage.label('↑ comoving Hubble radius (aH)⁻¹, log scale', [-RX + 3.2, -RY + 0.4, 0], 'muted', horGroup);
  stage.label('scale factor a, log scale →', [0, -RY - 0.8, 0], 'muted', horGroup);
  const tickLabels = Array.from({ length: 9 }, () => stage.label('', [0, 0, 0], 'muted', horGroup));
  const eraLabels = ['inflation: (aH)⁻¹ shrinks', 'radiation', 'matter', 'Λ'].map((t, i) => {
    const l = stage.label(t, [0, 0, 0], '', horGroup);
    l.element.style.color = css(ERA_COL[i]);
    return l;
  });

  const modeObjs = MODES.map((md) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = new THREE.LineDashedMaterial({ color: md.color, dashSize: 0.22, gapSize: 0.12, transparent: true, opacity: 0.85 });
    m.toneMapped = false;
    const line = new THREE.Line(g, m);
    horGroup.add(line);
    const dm = new THREE.SpriteMaterial({ map: glowTex, color: md.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    dm.toneMapped = false;
    const exitDot = new THREE.Sprite(dm);
    const inDot = new THREE.Sprite(dm);
    exitDot.scale.setScalar(0.55);
    inDot.scale.setScalar(0.55);
    horGroup.add(exitDot, inDot);
    const label = stage.label(md.label, [0, 0, 0], '', horGroup);
    label.element.style.color = css(md.color);
    return { line, mat: m, dm, exitDot, inDot, label };
  });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  headMat.toneMapped = false;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 12), headMat);
  horGroup.add(head);
  const headGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  headGlowMat.toneMapped = false;
  const headGlow = new THREE.Sprite(headGlowMat);
  headGlow.scale.setScalar(1.3);
  head.add(headGlow);

  let hxMin = -60;
  let hyMin = -28;
  let hyMax = 2;
  const hx = (lx: number) => -RX + (2 * RX * (lx - hxMin)) / (0.6 - hxMin);
  const RTOP = 3.0;
  const hy = (ly: number) => -RY + ((RTOP + RY) * (ly - hyMin)) / (hyMax - hyMin);

  function buildRibbon(): void {
    curve = horizonCurve(run, cal);
    hxMin = Math.floor(curve.x[0] - 1);
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let i = 0; i < NC; i++) {
      ymin = Math.min(ymin, curve.y[i]);
      ymax = Math.max(ymax, curve.y[i]);
    }
    hyMin = ymin - 1.5;
    hyMax = Math.max(ymax, 0.5) + 1.5;
    const c = new THREE.Color();
    for (let i = 0; i < NC; i++) {
      const x = hx(curve.x[i]);
      const y = hy(curve.y[i]);
      c.set(ERA_COL[curve.era[i]]);
      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s;
        rPos[v * 3] = x;
        rPos[v * 3 + 1] = y;
        rPos[v * 3 + 2] = s === 0 ? -0.35 : 0.35;
        rCol[v * 3] = c.r * (s === 0 ? 0.45 : 1);
        rCol[v * 3 + 1] = c.g * (s === 0 ? 0.45 : 1);
        rCol[v * 3 + 2] = c.b * (s === 0 ? 0.45 : 1);
      }
      edgePos[i * 3] = x;
      edgePos[i * 3 + 1] = y;
      edgePos[i * 3 + 2] = 0.36;
    }
    (ribGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ribGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    ribGeo.computeBoundingSphere();
    (edgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // Today line.
    const tp = todayGeo.attributes.position as THREE.BufferAttribute;
    tp.setXYZ(0, hx(0), -RY, 0);
    tp.setXYZ(1, hx(0), RTOP + 0.3, 0);
    tp.needsUpdate = true;
    todayLine.computeLineDistances();
    // Ticks every 10 (or 20) decades of a.
    const span = 0.6 - hxMin;
    const stepD = span > 70 ? 20 : 10;
    let t = 0;
    for (let d = 0; d >= hxMin && t < tickLabels.length; d -= stepD) {
      tickLabels[t].position.set(hx(d), -RY - 0.25, 0);
      tickLabels[t].element.textContent = d === 0 ? 'today' : `10${sup(d)}`;
      tickLabels[t].visible = true;
      t++;
    }
    for (; t < tickLabels.length; t++) tickLabels[t].visible = false;
    // Era labels at the midpoint of each era.
    for (let e = 0; e < 4; e++) {
      let lo = -1;
      let hi = -1;
      for (let i = 0; i < NC; i++) {
        if (curve.era[i] === e) {
          if (lo < 0) lo = i;
          hi = i;
        }
      }
      const i = e === 0 ? Math.floor(lo + (hi - lo) * 0.35) : Math.floor((lo + hi) / 2);
      eraLabels[e].visible = lo >= 0;
      if (lo >= 0) eraLabels[e].position.set(hx(curve.x[i]) + (e === 0 ? 0.9 : e === 3 ? 0.3 : -0.2), hy(curve.y[i]) + (e === 0 ? 0.35 : 0.45), 0.4);
    }
    // Modes.
    MODES.forEach((md, n) => {
      const o = modeObjs[n];
      const y = hy(-Math.log10(md.k));
      const p = o.line.geometry.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, -RX, y, 0);
      p.setXYZ(1, RX, y, 0);
      p.needsUpdate = true;
      o.line.computeLineDistances();
      const cr = crossings(curve, md.k);
      o.exitDot.visible = Number.isFinite(cr.exitX);
      o.inDot.visible = Number.isFinite(cr.reentryX);
      if (o.exitDot.visible) o.exitDot.position.set(hx(cr.exitX), y, 0.4);
      if (o.inDot.visible) o.inDot.position.set(hx(cr.reentryX), y, 0.4);
      o.label.position.set(-2.6 + 2.6 * n, y + 0.22, 0);
      o.mat.opacity = o.exitDot.visible ? 0.85 : 0.45;
      o.label.element.textContent = o.exitDot.visible ? md.label : `${md.label}: never inside the horizon`;
    });
  }

  // ================================================================ overlays
  const banner = document.createElement('div');
  banner.className = 'stage-overlay';
  Object.assign(banner.style, {
    position: 'absolute', left: '12px', top: '10px', zIndex: '2', pointerEvents: 'none',
    padding: '6px 12px', borderRadius: '10px', background: 'rgba(7,10,18,0.78)', border: '1px solid #243049',
    fontFamily: MONO, color: '#dfe6f3', maxWidth: '52%',
  } as CSSStyleDeclaration);
  const bannerMain = document.createElement('div');
  bannerMain.style.font = `700 14px ${MONO}`;
  const bannerSub = document.createElement('div');
  bannerSub.style.cssText = 'font-size:11.5px;color:#9aa6bd;margin-top:3px;line-height:1.45';
  banner.append(bannerMain, bannerSub);
  viewport.appendChild(banner);

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '12px', bottom: '34px', zIndex: '2', pointerEvents: 'none',
    padding: '6px 10px', borderRadius: '10px', background: 'rgba(7,10,18,0.72)', border: '1px solid #243049',
    fontFamily: MONO, fontSize: '11px', color: '#9aa6bd', lineHeight: '1.6',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const legendHTML = (items: [number | string, string][], extra = '') =>
    items.map(([c, t]) => `<div><i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;background:${typeof c === 'number' ? css(c) : c}"></i>${t}</div>`).join('') + extra;

  // Inset: ε along the run, numerical versus slow roll.
  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 240;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '120px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const ePts = new Float32Array(400 * 3); // N, log ε_H, log ε_V
  let eCount = 0;
  let eNmax = 1;

  function buildInset(): void {
    const Nmax = run.NEnd + Math.max(0.6, run.NEnd * 0.04);
    eNmax = Math.max(1, Nmax);
    eCount = 0;
    for (let k = 0; k < 400; k++) {
      const N = (k / 399) * eNmax;
      const f = idxAtN(run, N);
      const phi = lerpAt(run.phi, f);
      const eh = epsH(pot, phi, lerpAt(run.dphi, f), lerpAt(run.rhoR, f));
      const ev = epsV(pot, phi);
      ePts[k * 3] = N;
      ePts[k * 3 + 1] = Math.log10(Math.max(1e-6, eh));
      ePts[k * 3 + 2] = Math.log10(Math.max(1e-6, ev));
      eCount++;
      if (lerpAt(run.N, f) >= run.N[run.n - 1] - 1e-9) break;
    }
  }

  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `20px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('ε vs e-folds N', 16, 28);
    const x0 = 46;
    const x1 = W - 14;
    const yT = 46;
    const yB = H - 34;
    const lo = -5;
    const hi = 1;
    const X = (N: number) => x0 + (N / eNmax) * (x1 - x0);
    const Y = (l: number) => yB - ((Math.max(lo, Math.min(hi, l)) - lo) / (hi - lo)) * (yB - yT);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.fillStyle = '#56627c';
    c.font = `17px ${MONO}`;
    for (const l of [-4, -2, 0]) {
      c.beginPath();
      c.moveTo(x0, Y(l));
      c.lineTo(x1, Y(l));
      c.stroke();
      c.fillText(l === 0 ? '1' : `10${sup(l)}`, 6, Y(l) + 6);
    }
    // ε = 1 line.
    c.strokeStyle = css(PALETTE.rose);
    c.setLineDash([6, 5]);
    c.beginPath();
    c.moveTo(x0, Y(0));
    c.lineTo(x1, Y(0));
    c.stroke();
    // Slow-roll ε_V (dashed cyan).
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 2;
    c.beginPath();
    for (let k = 0; k < eCount; k++) {
      if (ePts[k * 3] > run.NEnd) break;
      const x = X(ePts[k * 3]);
      const y = Y(ePts[k * 3 + 2]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.setLineDash([]);
    // Numerical ε_H (solid amber).
    c.strokeStyle = css(PALETTE.amber);
    c.lineWidth = 3;
    c.beginPath();
    for (let k = 0; k < eCount; k++) {
      const x = X(ePts[k * 3]);
      const y = Y(ePts[k * 3 + 1]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    // Playhead.
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    const px = X(Math.min(eNmax, Ncur));
    c.beginPath();
    c.moveTo(px, yT - 6);
    c.lineTo(px, yB);
    c.stroke();
    c.fillStyle = '#56627c';
    c.fillText('0', x0 - 4, yB + 24);
    c.fillText(`N=${run.NEnd.toFixed(0)}`, X(run.NEnd) - 60, yB + 24);
    c.fillStyle = css(PALETTE.amber);
    c.fillText('numeric', W - 196, 28);
    c.fillStyle = css(PALETTE.cyan);
    c.fillText('slow-roll', W - 106, 28);
  }

  // ================================================================ panel
  const ui = new Panel(panel);
  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'potential', label: '1 · Potential' }, { value: 'balloon', label: '2 · Balloon' }, { value: 'horizon', label: '3 · Horizon' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Replay', onClick: () => restart() },
  ]);
  ui.slider({ key: 'speed', label: 'Playback', min: 2, max: 20, step: 1, value: speed, format: (v) => `${v} e-folds/s`, onInput: (v) => (speed = v) });

  ui.section('Inflaton');
  ui.select<PotId>({
    key: 'pot', label: 'Potential V(φ)', value: potId,
    options: [{ value: 'starobinsky', label: 'Starobinsky plateau' }, { value: 'quadratic', label: 'm²φ²/2 (disfavoured)' }],
    onChange: (v) => setPotential(v),
  });
  const phiS = ui.slider({
    key: 'phi0', label: 'Initial field φ₀', min: 1.8, max: 6, step: 0.01, value: 4.1, unit: 'Mₚ', format: (v) => v.toFixed(2),
    onInput: (v) => { phi0 = v; rebuild(); },
  });
  const phiQ = ui.slider({
    key: 'phi0', label: 'Initial field φ₀', min: 2.5, max: 20, step: 0.05, value: 9, unit: 'Mₚ', format: (v) => v.toFixed(2),
    onInput: (v) => { phi0 = v; rebuild(); },
  });
  phiQ.el.style.display = 'none';
  ui.slider({
    key: 'amp', label: 'Fluctuation boost (display only)', min: 0, max: 6, step: 0.5, value: boostLog,
    format: (v) => (v === 0 ? '×1 (true size)' : `×10${sup(v)}`.replace('.5', '½')),
    onInput: (v) => { boostLog = v; balDirty = true; },
  });
  const potNote = ui.note('');

  ui.section('Readouts');
  const rN = ui.readout('N', 'e-folds so far N');
  const rNtot = ui.readout('Ntot', 'total e-folds');
  const rNneed = ui.readout('Nneed', 'needed (horizon)');
  const rPhi = ui.readout('phi', 'field φ', 'Mₚ');
  const rEps = ui.readout('eps', 'slow roll ε');
  const rH = ui.readout('H', 'Hubble rate H', 'GeV');
  const rTime = ui.readout('time', 'time since start', 's');
  const rOm = ui.readout('omega', 'flatness |Ω − 1|');
  ui.section('Predictions at the CMB pivot');
  const rNs = ui.readout('ns', 'spectral index nₛ');
  const rR = ui.readout('r', 'tensor ratio r');
  const rNstar = ui.readout('Nstar', 'pivot exits at N★');
  const rScale = ui.readout('scale', 'energy scale V★^¼', 'GeV');
  const rRatio = ui.readout('ratio', 'quantum / classical step');
  const rCheck = ui.readout('check', 'slow-roll N check');
  ui.note(`Planck 2018: nₛ = ${NS_PLANCK} ± ${NS_SIGMA}. BICEP/Keck 2021: r < ${R_BOUND} (95%). Predictions use first-order slow roll at the pivot k★ = 0.05 Mpc⁻¹, with instant reheating. Field values are in reduced Planck masses Mₚ = 2.4×10¹⁸ GeV.`);

  // ================================================================ logic
  function restart(): void {
    phase = run.NEnd > 0 ? 'inflate' : 'reheat';
    Ncur = 0;
    tSim = 0;
    holdT = 0;
    lagT.fill(0);
    trail.clear();
    for (const m of modes) m.on = false;
    nextSpawn = 0;
    spawnSlot = 0;
    spLife.fill(0);
    spCol.fill(0);
    (spGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    balDirty = true;
  }

  function rebuild(): void {
    run = solve(pot, phi0);
    bestFlat = 0;
    prodMax = 1e-12;
    const gamma = 0.12 * pot.mass;
    for (let i = run.iEnd; i < run.n; i++) prodMax = Math.max(prodMax, gamma * run.dphi[i] * run.dphi[i]);
    buildSurface();
    setMarker(endLine, run.phiEndNum);
    setMarker(starLine, cal.phiStar);
    setMarker(startLine, phi0, 0.05);
    endLabel.position.set(xOf(run.phiEndNum) + 0.2, yOf(run.phiEndNum) + 0.55, ZW + 0.3);
    starLabel.element.textContent = `CMB scales exit (N★ ≈ ${cal.Nstar.toFixed(0)})`;
    starLabel.position.set(xOf(cal.phiStar), yOf(cal.phiStar) + 0.55, -ZW - 0.2);
    starLabel.visible = starLine.visible;
    startLabel.position.set(xOf(phi0), yOf(phi0) - 0.35, ZW + 0.3);
    heat.position.set(xOf(0), 0.25, 0);
    buildRibbon();
    buildInset();
    potNote.innerHTML = potId === 'quadratic'
      ? 'Linde’s chaotic inflation, V = m²φ²/2. Simple, but its r is several times larger than the BICEP/Keck limit, so data now disfavour it.'
      : 'Starobinsky’s model: V = V₀(1 − e<sup>−√(2/3)φ/Mₚ</sup>)². A long flat plateau that still fits the data well.';
    restart();
    updateStatic();
  }

  function setPotential(v: PotId): void {
    if (v === potId) return;
    // Keep the same slow-roll e-fold count when switching.
    const Nwant = Math.max(0.5, pot.Nsr(phi0));
    potId = v;
    pot = POTENTIALS[v];
    cal = calibrate(pot);
    const ctl = v === 'starobinsky' ? phiS : phiQ;
    const other = v === 'starobinsky' ? phiQ : phiS;
    const lo = v === 'starobinsky' ? 1.8 : 2.5;
    const hi = v === 'starobinsky' ? 6 : 20;
    phi0 = Math.max(lo, Math.min(hi, pot.phiAtN(Nwant)));
    ctl.set(phi0, false);
    ctl.el.style.display = '';
    other.el.style.display = 'none';
    rebuild();
  }

  function updateStatic(): void {
    const valid = run.NEnd >= cal.Nstar;
    rNtot(run.NEnd.toFixed(1));
    rNneed(`≈ ${cal.Nneed.toFixed(0)}`);
    rNstar(`${cal.Nstar.toFixed(1)} before end`);
    rNs(valid ? cal.ns.toFixed(4) : 'never exits');
    rR(valid ? (cal.r < 0.01 ? cal.r.toFixed(4) : cal.r.toFixed(3)) : 'n/a');
    rScale(fmtSci(cal.Vq, 1));
    rCheck(`${Math.max(0, pot.Nsr(phi0)).toFixed(1)} vs ${run.NEnd.toFixed(1)}`);
  }

  function setView(v: View): void {
    view = v;
    potGroup.visible = v === 'potential';
    balGroup.visible = v === 'balloon';
    horGroup.visible = v === 'horizon';
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.3);
    legend.style.display = v === 'horizon' ? 'none' : '';
    balDirty = true;
    if (v === 'potential') {
      legend.innerHTML = legendHTML([
        [PALETTE.green, 'our patch of space'],
        ['#dfe6f3', 'neighbouring patches'],
        [PALETTE.amber, 'CMB scales exit here'],
        [PALETTE.rose, 'end of inflation, ε = 1'],
      ]);
    } else if (v === 'balloon') {
      legend.innerHTML = legendHTML([
        [PALETTE.green, 'Hubble radius (fixed during inflation)'],
        [PALETTE.amber, 'ripple crest: denser seed'],
        [PALETTE.cyan, 'ripple trough: thinner seed'],
      ], `<div style="margin-top:4px;pointer-events:auto">Seeds grow into the <a href="#/t/cosmic-web" style="color:${css(PALETTE.cyan)}">cosmic web</a></div>`);
    } else {
      legend.innerHTML = '';
    }
  }

  const horizonVerdict = () => (run.NEnd >= cal.Nneed
    ? `Solved: all of today’s sky was once one causal patch (N ${run.NEnd.toFixed(0)} ≥ ${cal.Nneed.toFixed(0)}).`
    : `Not solved: today’s horizon never fitted inside (N ${run.NEnd.toFixed(0)} < ${cal.Nneed.toFixed(0)}).`);

  const sample = () => {
    fi = phase === 'inflate' ? idxAtN(run, Ncur) : idxAtT(run, tSim);
  };

  function stepPlayback(dt: number): number {
    // Returns the e-folds advanced this frame.
    const N0 = Ncur;
    if (phase === 'inflate') {
      const rate = speed * (0.3 + 0.7 * smooth(0, 5, Ncur));
      Ncur += rate * dt;
      if (Ncur >= run.NEnd) {
        Ncur = run.NEnd;
        tSim = run.tEnd;
        phase = 'reheat';
      } else {
        tSim = lerpAt(run.t, idxAtN(run, Ncur));
      }
    } else if (phase === 'reheat') {
      tSim += dt * pot.mass * 6.3 * (speed / 6) ** 0.5;
      if (tSim >= run.tMax) {
        tSim = run.tMax;
        phase = 'hold';
        holdT = 0;
      }
      Ncur = lerpAt(run.N, idxAtT(run, tSim));
    } else {
      holdT += dt;
      if (holdT > 3.5) restart();
    }
    sample();
    return Math.max(0, Ncur - N0);
  }

  // Per-frame readouts and scene updates.
  let insetTimer = 0;
  stage.onFrame((dt, t) => {
    let dN = 0;
    if (playing) dN = stepPlayback(dt);
    else sample();
    const phi = lerpAt(run.phi, fi);
    const dphi = lerpAt(run.dphi, fi);
    const rr = lerpAt(run.rhoR, fi);
    const Hm = lerpAt(run.H, fi);
    const eH = epsH(pot, phi, dphi, rr);
    const flat = log10Flatness(run, fi);
    if (Ncur > 0) bestFlat = Math.min(bestFlat, flat);
    const HGeV = Hm * Math.sqrt(cal.lam) * MP_GEV;
    const fRad = rr / (3 * Hm * Hm);
    const inflating = phase === 'inflate';

    // Quantum kicks: each patch random-walks by δφ = H/2π per √e-fold (boosted),
    // which shifts it along the same trajectory by a time lag δt = δφ/|φ̇|.
    if (inflating && dN > 0 && boostLog > 0) {
      const dq = (Math.sqrt((cal.lam * (0.5 * dphi * dphi + pot.V(phi))) / 3) / (2 * Math.PI)) * 10 ** boostLog;
      const sd = dq * Math.sqrt(dN);
      const ad = Math.max(1e-9, Math.abs(dphi));
      for (let k = 0; k < lagT.length; k++) {
        lagT[k] += (sd * gauss()) / ad;
        const lim = 0.25 * run.tEnd;
        lagT[k] = Math.max(-lim, Math.min(lim, lagT[k]));
      }
    }

    if (view === 'potential') {
      for (let k = 0; k < balls.length; k++) {
        const fk = idxAtT(run, tSim - lagT[k]);
        const pk = lerpAt(run.phi, fk);
        const r = k === MAIN ? 0.22 : 0.14;
        balls[k].position.set(xOf(pk), yOf(pk) + r, PATCH_Z[k]);
      }
      if (playing && phase !== 'hold') trail.push(balls[MAIN].position.x, balls[MAIN].position.y + 0.02, 0);
      mainGlowMat.opacity = 0.45 + 0.2 * Math.sin(t * 3);
      // Reheating glow and sparks.
      heatMat.opacity = Math.min(1, 2.2 * fRad);
      heat.scale.set(3.5 + 4 * fRad, 2 + 2 * fRad, 1);
      const prod = phase === 'inflate' ? 0 : (0.12 * pot.mass * dphi * dphi) / prodMax;
      if (playing) {
        spAcc += dt * 160 * Math.min(1, Math.sqrt(Math.max(0, prod)));
        while (spAcc >= 1) {
          spAcc -= 1;
          const s = spNext;
          spNext = (spNext + 1) % NSPARK;
          spPos[s * 3] = balls[MAIN].position.x + (rand() - 0.5) * 0.8;
          spPos[s * 3 + 1] = 0.15;
          spPos[s * 3 + 2] = (rand() - 0.5) * 2 * ZW;
          spVel[s * 3] = (rand() - 0.5) * 0.8;
          spVel[s * 3 + 1] = 0.8 + 1.4 * rand();
          spVel[s * 3 + 2] = (rand() - 0.5) * 0.8;
          spLife[s] = 1;
        }
        for (let s = 0; s < NSPARK; s++) {
          if (spLife[s] <= 0) continue;
          spLife[s] -= dt / 1.6;
          spPos[s * 3] += spVel[s * 3] * dt;
          spPos[s * 3 + 1] += spVel[s * 3 + 1] * dt;
          spPos[s * 3 + 2] += spVel[s * 3 + 2] * dt;
          const l = Math.max(0, spLife[s]);
          spCol[s * 3] = 1.0 * l;
          spCol[s * 3 + 1] = 0.62 * l;
          spCol[s * 3 + 2] = 0.3 * l;
        }
        (spGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (spGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      }
    } else if (view === 'balloon') {
      if (inflating) spawnModes(Ncur);
      if ((playing && phase !== 'hold') || balDirty) {
        updateBalloon(Ncur, run.NEnd);
        balDirty = false;
      }
    } else {
      // Playhead on the ribbon.
      let lx: number;
      let ly: number;
      if (phase === 'inflate' || run.tMax <= run.tEnd) {
        lx = (Math.log(cal.aEnd) + (Ncur - run.NEnd)) / Math.LN10;
        ly = Math.log10(H0_GEV / (10 ** lx * HGeV));
      } else {
        const u = Math.min(1, (tSim - run.tEnd) / (run.tMax - run.tEnd));
        lx = Math.log10(cal.aEnd) + (0 - Math.log10(cal.aEnd)) * u;
        const a = 10 ** lx;
        ly = -Math.log10(a * Ea(a));
      }
      head.position.set(hx(lx), hy(ly), 0.45);
      headGlowMat.opacity = 0.6 + 0.25 * Math.sin(t * 4);
    }

    insetTimer += dt;
    if (insetTimer > 0.08) {
      insetTimer = 0;
      drawInset();
    }

    // Readouts.
    rN(Ncur.toFixed(2));
    rPhi(phi.toFixed(3));
    rEps(eH < 0.01 ? eH.toExponential(2) : eH.toFixed(3));
    rH(fmtSci(HGeV, 2));
    rTime(tSim > 0 ? fmtSci((tSim / (Math.sqrt(cal.lam) * MP_GEV)) * 6.582e-25, 1) : '0');
    rOm(`10${sup(Math.round(flat))}`);
    const ratio = inflating ? Math.sqrt(powerR(pot, cal.lam, phi)) : NaN;
    rRatio(Number.isFinite(ratio) ? fmtSci(ratio, 1) : 'after end');

    // Banner.
    if (phase === 'inflate') {
      bannerMain.textContent = `Inflating: N = ${Ncur.toFixed(1)} of ${run.NEnd.toFixed(1)}   ε = ${eH < 0.01 ? eH.toExponential(1) : eH.toFixed(3)}`;
      bannerSub.textContent = view === 'potential'
        ? 'The field rolls slowly, so V stays nearly constant and H barely changes. Space doubles in size every 0.69 e-folds.'
        : view === 'balloon'
          ? `Curvature radius grows as eᴺ. |Ω − 1| is now 10${sup(Math.round(flat))}. New ripples appear at the Hubble size, then get stretched and freeze.`
          : `(aH)⁻¹ shrinks. Dashed lines are fixed comoving scales. Where one crosses the curve (dot) it leaves the horizon and freezes. ${horizonVerdict()}`;
    } else if (phase === 'reheat') {
      bannerMain.textContent = `Inflation over at ε = 1. Reheating: radiation ${(fRad * 100).toFixed(0)}% of energy`;
      bannerSub.textContent = view === 'horizon'
        ? `${horizonVerdict()} Afterwards (aH)⁻¹ grows again. Scales that left during inflation come back inside, smallest first.`
        : 'The inflaton oscillates in the valley and decays into particles. The universe fills with hot radiation: the hot Big Bang begins.';
    } else {
      bannerMain.textContent = `Done: N = ${run.NEnd.toFixed(1)} e-folds, |Ω − 1| reached 10${sup(Math.round(bestFlat))}`;
      bannerSub.textContent = run.NEnd >= cal.Nneed
        ? 'Enough inflation: the whole observable universe grew from one causally connected patch.'
        : `Not enough: about ${cal.Nneed.toFixed(0)} e-folds are needed to cover today’s sky. Raise φ₀.`;
    }
  });

  buildSurface();
  rebuild();
  setView(view);

  return {
    state: () => {
      const valid = run.NEnd >= cal.Nstar;
      return {
        view,
        pot: potId,
        phi0,
        N: Ncur,
        Ntot: run.NEnd,
        Nneed: cal.Nneed,
        Nstar: cal.Nstar,
        eps: epsH(pot, lerpAt(run.phi, fi), lerpAt(run.dphi, fi), lerpAt(run.rhoR, fi)),
        nsValid: valid,
        ns: valid ? cal.ns : 0,
        r: valid ? cal.r : 0,
        logOmega: log10Flatness(run, fi),
        logOmegaBest: bestFlat,
        amp: boostLog,
        phase,
        playing,
      };
    },
    dispose: () => {
      banner.remove();
      legend.remove();
      inset.remove();
      stage.dispose();
      glowTex.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cosmic-inflation',
  number: 85,
  title: 'Cosmic Inflation',
  domain: 'cosmology',
  level: 3,
  status: 'live',
  tagline: 'A burst of expansion that smoothed the universe and seeded galaxies.',
  content,
  mount,
};

export default topic;
