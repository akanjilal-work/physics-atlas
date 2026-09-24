import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A_NUC, DH_OBS, DH_OBS_SIG, ETA_PLANCK, ETA_PLANCK_SIG, LI_OBS, LI_OBS_SIG, NSP, TAU_N, YP_OBS, YP_OBS_SIG,
  etaGrid, interpCurve, recordTimes, runBBN, type BBNResult, type Schramm,
} from './physics.ts';

type View = 'both' | 'kitchen' | 'ribbons';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  both: { pos: [0.3, 0.9, 13.0], target: [0.3, 0, 0] },
  kitchen: { pos: [-3.2, 0.6, 6.8], target: [-3.2, -0.3, 0] },
  ribbons: { pos: [3.2, -0.6, 7.4], target: [3.2, -1.0, 0] },
};

// Species order matches physics.ts: n, p, D, ³H, ³He, ⁴He, ⁷Li, ⁷Be
const NEUTRON = 0x9aa6bd;
const SP_COLOR = [NEUTRON, PALETTE.red, PALETTE.cyan, PALETTE.violet, PALETTE.rose, PALETTE.amber, PALETTE.green, 0xc6f36b];
const SP_LABEL = ['n', 'p', 'D', '³H', '³He', '⁴He', '⁷Li', '⁷Be'];

// Time axis: log-spaced from 0.1 s to 20 min.
const T_MIN = 0.1;
const T_MAX = 1200;
const NREC = 160;
const REC = recordTimes(NREC, T_MIN, T_MAX);
const PLAY_SECONDS = 26; // real seconds for the whole 20 minutes at speed 1
const LN_SPAN = Math.log(T_MAX / T_MIN);

// Kitchen (the pot of nucleons)
const POT: V3 = [-3.2, 0.35, 0];
const POT_R = 1.8;
const NN = 200; // nucleons drawn
const NUC_R = 0.085;
const NPH = 320; // photon markers

// Ribbon chart
const RX0 = 0.5;
const RX1 = 5.9;
const RY0 = -3.6;
const RY1 = -0.1;
const LOG_MIN = -12;
const LOG_MAX = 0;

const TET: V3[] = [
  [1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1],
];

const fmtSci = (v: number, d = 1): string => {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  const sup = String(e).replace(/-/g, '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]);
  return `${m.toFixed(d)}×10${sup}`;
};
const fmtTime = (t: number): string => {
  if (t < 10) return `${t.toFixed(2)} s`;
  if (t < 60) return `${t.toFixed(1)} s`;
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m} min ${String(s).padStart(2, '0')} s`;
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Colour of a glowing plasma at temperature kT (MeV), purely for mood. */
function plasmaColor(kT: number, out: THREE.Color): THREE.Color {
  // 3 MeV white-blue → 0.3 MeV white-yellow → 0.07 MeV orange → 0.03 MeV deep red
  const x = Math.max(0, Math.min(1, (Math.log10(kT) + 1.6) / 2.1));
  const stops: [number, number, number, number][] = [
    [0, 0.55, 0.12, 0.08],
    [0.35, 1.0, 0.45, 0.12],
    [0.65, 1.0, 0.85, 0.55],
    [1, 0.8, 0.9, 1.0],
  ];
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[i + 1];
  const u = (x - a[0]) / (b[0] - a[0]);
  return out.setRGB(a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2]), a[3] + u * (b[3] - a[3]));
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.both.pos, target: CAM.both.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';
  const tex = glowTexture();

  // --- Parameters and state
  let eta = ETA_PLANCK;
  let Nnu = 3;
  let tau = TAU_N;
  let view: View = 'both';
  let playing = true;
  let speed = 1;
  let u = 0; // playback position 0..1 along log time
  let tNow = T_MIN;
  let userStarted = false;
  let userRun = false;
  let etaTouched = false;
  let sawDHfall = false;
  let dragEta0 = NaN;
  let dragDH0 = NaN;
  let dragEnding = false;

  let res: BBNResult = runBBN({ eta, Nnu, tau }, REC);
  let yp3 = res.Yp;
  let dirty = false;

  // =========================================================================
  // The kitchen: a pot of plasma with nucleons, photons and light nuclei.
  const kitchen = new THREE.Group();
  kitchen.position.set(...POT);
  scene.add(kitchen);

  const glowMat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(POT_R * 4.2, POT_R * 4.2, 1);
  glow.position.z = -1.2;
  kitchen.add(glow);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(POT_R + 0.15, 48, 32), shellMat);
  kitchen.add(shell);
  const rimMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  const rimGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * (POT_R + 0.15), Math.sin((i / 96) * Math.PI * 2) * (POT_R + 0.15), 0)),
  );
  const rim = new THREE.Line(rimGeo, rimMat);
  kitchen.add(rim);

  // Photons
  const phPos = new Float32Array(NPH * 3);
  const phVel = new Float32Array(NPH * 3);
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const randInBall = (r: number, out: Float32Array | number[], o: number) => {
    for (;;) {
      const x = rnd() * 2 - 1;
      const y = rnd() * 2 - 1;
      const z = rnd() * 2 - 1;
      if (x * x + y * y + z * z <= 1) {
        out[o] = x * r;
        out[o + 1] = y * r;
        out[o + 2] = z * r;
        return;
      }
    }
  };
  for (let i = 0; i < NPH; i++) {
    randInBall(POT_R * 0.95, phPos, i * 3);
    randInBall(1, phVel, i * 3);
  }
  const phGeo = new THREE.BufferGeometry();
  phGeo.setAttribute('position', new THREE.BufferAttribute(phPos, 3));
  const phMat = new THREE.PointsMaterial({ color: 0xffe2a0, size: 0.05, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const photons = new THREE.Points(phGeo, phMat);
  photons.frustumCulled = false;
  kitchen.add(photons);

  // Nucleons as one instanced mesh with per-instance colour.
  const nucGeo = new THREE.SphereGeometry(NUC_R, 18, 12);
  const nucMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05, emissive: 0x222222 });
  const nucleons = new THREE.InstancedMesh(nucGeo, nucMat, NN);
  nucleons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nucleons.frustumCulled = false;
  kitchen.add(nucleons);
  const cP = new THREE.Color(PALETTE.red);
  const cN = new THREE.Color(NEUTRON);

  // Bodies: free nucleons or ⁴He clusters.
  const B_FREE = 0;
  const B_HE = 1;
  const bType = new Int8Array(NN).fill(-1); // -1 = unused
  const bPos = new Float32Array(NN * 3);
  const bVel = new Float32Array(NN * 3);
  const bMem = new Int16Array(NN * 4).fill(-1);
  const nPos = new Float32Array(NN * 3);
  const nOff = new Float32Array(NN * 3);
  const nBody = new Int16Array(NN);
  const isN = new Uint8Array(NN);
  const bond = new Int16Array(NN).fill(-1); // bottleneck cartoon: neutron body → proton body
  const bondT = new Float32Array(NN);
  const freeBodies: number[] = [];
  for (let i = NN - 1; i >= 0; i--) freeBodies.push(i);

  const allocBody = (type: number, x: number, y: number, z: number): number => {
    const b = freeBodies.pop()!;
    bType[b] = type;
    bPos[b * 3] = x;
    bPos[b * 3 + 1] = y;
    bPos[b * 3 + 2] = z;
    randInBall(0.3, bVel, b * 3);
    for (let k = 0; k < 4; k++) bMem[b * 4 + k] = -1;
    bond[b] = -1;
    return b;
  };
  const releaseBody = (b: number) => {
    bType[b] = -1;
    bond[b] = -1;
    freeBodies.push(b);
  };
  const setNucleonColor = (i: number) => nucleons.setColorAt(i, isN[i] ? cN : cP);

  // Initial fill: every nucleon a free body.
  for (let i = 0; i < NN; i++) {
    randInBall(POT_R * 0.85, nPos, i * 3);
    const b = allocBody(B_FREE, nPos[i * 3], nPos[i * 3 + 1], nPos[i * 3 + 2]);
    bMem[b * 4] = i;
    nBody[i] = b;
    isN[i] = 0;
    setNucleonColor(i);
  }

  let cntN = 0;
  let cntP = NN;
  let cntHe = 0;

  // Flashes (neutron decay, photodisintegration, fusion)
  interface Flash { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; max: number; size: number }
  const flashes: Flash[] = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    kitchen.add(sprite);
    flashes.push({ sprite, mat, life: 0, max: 1, size: 1 });
  }
  let flashNext = 0;
  const flash = (x: number, y: number, z: number, color: number, size: number, dur = 0.6) => {
    const f = flashes[flashNext];
    flashNext = (flashNext + 1) % flashes.length;
    f.sprite.position.set(x, y, z);
    f.mat.color.setHex(color);
    f.life = f.max = dur;
    f.size = size;
    f.sprite.visible = true;
  };

  // Photon strike streaks for the bottleneck cartoon
  const STREAKS = 6;
  const stPos = new Float32Array(STREAKS * 6);
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
  const stMat = new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9 });
  const streaks = new THREE.LineSegments(stGeo, stMat);
  streaks.frustumCulled = false;
  kitchen.add(streaks);
  const stLife = new Float32Array(STREAKS);
  let stNext = 0;
  const strike = (x: number, y: number, z: number) => {
    const k = stNext;
    stNext = (stNext + 1) % STREAKS;
    const a = rnd() * Math.PI * 2;
    stPos[k * 6] = x + Math.cos(a) * 0.9;
    stPos[k * 6 + 1] = y + Math.sin(a) * 0.9;
    stPos[k * 6 + 2] = z + 0.3;
    stPos[k * 6 + 3] = x;
    stPos[k * 6 + 4] = y;
    stPos[k * 6 + 5] = z;
    stLife[k] = 0.35;
  };

  function nearestFree(x: number, y: number, z: number, wantN: boolean, skip: number): number {
    let best = -1;
    let bd = Infinity;
    for (let b = 0; b < NN; b++) {
      if (bType[b] !== B_FREE || b === skip || bond[b] >= 0) continue;
      const m = bMem[b * 4];
      if (!!isN[m] !== wantN) continue;
      const dx = bPos[b * 3] - x;
      const dy = bPos[b * 3 + 1] - y;
      const dz = bPos[b * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  function randomFree(wantN: boolean): number {
    const start = Math.floor(rnd() * NN);
    for (let k = 0; k < NN; k++) {
      const b = (start + k) % NN;
      if (bType[b] === B_FREE && !!isN[bMem[b * 4]] === wantN) return b;
    }
    return -1;
  }
  function clearBondsTo(b: number) {
    for (let k = 0; k < NN; k++) if (bond[k] === b) bond[k] = -1;
    bond[b] = -1;
  }

  /** Make the pot hold the target counts of free n, free p and ⁴He. */
  function reconcile(tn: number, the: number, animate: boolean): void {
    // Break helium if there is too much (rewind).
    while (cntHe > the) {
      let b = -1;
      for (let k = 0; k < NN; k++) if (bType[k] === B_HE) { b = k; break; }
      if (b < 0) break;
      const cx = bPos[b * 3], cy = bPos[b * 3 + 1], cz = bPos[b * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const m = bMem[b * 4 + k];
        const nb = allocBody(B_FREE, cx + (rnd() - 0.5) * 0.4, cy + (rnd() - 0.5) * 0.4, cz + (rnd() - 0.5) * 0.4);
        bMem[nb * 4] = m;
        nBody[m] = nb;
        nOff[m * 3] = nOff[m * 3 + 1] = nOff[m * 3 + 2] = 0;
      }
      releaseBody(b);
      cntHe--;
      cntN += 2;
      cntP += 2;
    }
    // Build helium: 2 free n + 2 free p.
    while (cntHe < the) {
      if (cntN < 2) {
        const b = randomFree(false);
        if (b < 0) break;
        isN[bMem[b * 4]] = 1;
        setNucleonColor(bMem[b * 4]);
        cntN++;
        cntP--;
      }
      if (cntP < 2) break;
      const n1 = randomFree(true);
      if (n1 < 0) break;
      clearBondsTo(n1);
      const x = bPos[n1 * 3], y = bPos[n1 * 3 + 1], z = bPos[n1 * 3 + 2];
      const n2 = nearestFree(x, y, z, true, n1);
      clearBondsTo(n2);
      const p1 = nearestFree(x, y, z, false, -1);
      clearBondsTo(p1);
      bType[p1] = 99; // reserve
      const p2 = nearestFree(x, y, z, false, -1);
      clearBondsTo(p2);
      bType[p1] = B_FREE;
      const parts = [n1, n2, p1, p2];
      const he = allocBody(B_HE, x, y, z);
      parts.forEach((pb, k) => {
        const m = bMem[pb * 4];
        bMem[he * 4 + k] = m;
        nBody[m] = he;
        const s = NUC_R * 0.95;
        nOff[m * 3] = TET[k][0] * s;
        nOff[m * 3 + 1] = TET[k][1] * s;
        nOff[m * 3 + 2] = TET[k][2] * s;
        releaseBody(pb);
      });
      if (animate) flash(x, y, z, PALETTE.amber, 0.9, 0.5);
      cntHe++;
      cntN -= 2;
      cntP -= 2;
    }
    // Neutron decay (n → p) or, when hot, p → n.
    while (cntN > tn) {
      const b = randomFree(true);
      if (b < 0) break;
      clearBondsTo(b);
      const m = bMem[b * 4];
      isN[m] = 0;
      setNucleonColor(m);
      if (animate) flash(bPos[b * 3], bPos[b * 3 + 1], bPos[b * 3 + 2], PALETTE.cyan, 0.45, 0.45);
      cntN--;
      cntP++;
    }
    while (cntN < tn) {
      const b = randomFree(false);
      if (b < 0) break;
      clearBondsTo(b);
      const m = bMem[b * 4];
      isN[m] = 1;
      setNucleonColor(m);
      cntN++;
      cntP--;
    }
    if (nucleons.instanceColor) nucleons.instanceColor.needsUpdate = true;
  }

  // Spice rack: one model of each trace nucleus, scaled by its abundance.
  const RACK_Y = -2.75;
  const rack = new THREE.Group();
  rack.position.set(POT[0], RACK_Y, 0.4);
  scene.add(rack);
  const rackSpecies = [2, 3, 4, 6, 7]; // D, ³H, ³He, ⁷Li, ⁷Be
  const rackZN: [number, number][] = [[1, 1], [1, 2], [2, 1], [3, 4], [4, 3]];
  const rackGroups: THREE.Group[] = [];
  const rackLabels: CSS2DObject[] = [];
  const pMat = new THREE.MeshStandardMaterial({ color: PALETTE.red, roughness: 0.35, emissive: 0x220000 });
  const nMat = new THREE.MeshStandardMaterial({ color: NEUTRON, roughness: 0.4, emissive: 0x111111 });
  const rackBall = new THREE.SphereGeometry(0.1, 16, 12);
  rackSpecies.forEach((sp, j) => {
    const g = new THREE.Group();
    g.position.set((j - 2) * 1.12, 0, 0);
    const [Z, Nn] = rackZN[j];
    const A = Z + Nn;
    for (let k = 0; k < A; k++) {
      const m = new THREE.Mesh(rackBall, k % 2 === 0 ? (k / 2 < Z ? pMat : nMat) : (Math.floor(k / 2) < Nn ? nMat : pMat));
      // Small packed cluster: centre ball for A = 7, then points on a sphere.
      if (A === 2) m.position.set((k - 0.5) * 0.17, 0, 0);
      else {
        const phi = Math.acos(1 - (2 * (k + 0.5)) / A);
        const th = Math.PI * (1 + Math.sqrt(5)) * k;
        const r = A <= 3 ? 0.11 : 0.15;
        m.position.set(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
      }
      g.add(m);
    }
    rack.add(g);
    rackGroups.push(g);
    const l = stage.label('', [0, -0.5, 0], 'muted', g);
    l.element.style.fontSize = '11px';
    l.element.style.color = css(SP_COLOR[sp]);
    l.element.style.textAlign = 'center';
    l.element.style.lineHeight = '1.25';
    rackLabels.push(l);
  });
  const rackTitle = stage.label('spice rack: trace nuclei per H', [0, 0.5, 0], 'muted', rack);
  rackTitle.element.style.fontSize = '11px';

  const potTitle = stage.label('the pot: 200 nucleons', [0, POT_R + 0.35, 0], 'muted', kitchen);
  potTitle.element.style.fontSize = '12px';
  const stateLabel = stage.label('', [0, -POT_R - 0.25, 0.8], '', kitchen);
  stateLabel.element.style.fontSize = '12px';
  stateLabel.element.style.color = css(PALETTE.amber);

  // =========================================================================
  // Ribbon chart: mass fraction vs log time.
  const chart = new THREE.Group();
  scene.add(chart);
  const xOfT = (t: number) => RX0 + ((RX1 - RX0) * Math.log(t / T_MIN)) / LN_SPAN;
  const yOfX = (x: number) => {
    const l = Math.max(LOG_MIN - 0.6, Math.log10(Math.max(x, 1e-30)));
    return RY0 + ((RY1 - RY0) * (l - LOG_MIN)) / (LOG_MAX - LOG_MIN);
  };
  {
    const pts: number[] = [];
    for (let l = LOG_MIN; l <= LOG_MAX; l += 2) {
      const y = yOfX(10 ** l);
      pts.push(RX0, y, -0.6, RX1, y, -0.6);
    }
    for (const t of [0.1, 1, 10, 60, 180, 600, 1200]) {
      const x = xOfT(t);
      pts.push(x, RY0, -0.6, x, RY1, -0.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    chart.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.8 })));
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(RX1 - RX0 + 0.3, RY1 - RY0 + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x0b1120, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    back.position.set((RX0 + RX1) / 2, (RY0 + RY1) / 2, -0.65);
    chart.add(back);
    for (let l = LOG_MIN; l <= LOG_MAX; l += 4) {
      const lab = stage.label(l === 0 ? '1' : `10${String(l).replace('-', '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c])}`, [RX0 - 0.35, yOfX(10 ** l), -0.6], 'muted', chart);
      lab.element.style.fontSize = '10px';
    }
    const tl: [number, string][] = [[0.1, '0.1 s'], [1, '1 s'], [10, '10 s'], [180, '3 min'], [1200, '20 min']];
    for (const [t, s] of tl) {
      const lab = stage.label(s, [xOfT(t), RY0 - 0.3, -0.6], 'muted', chart);
      lab.element.style.fontSize = '10px';
    }
    const title = stage.label('mass fraction of each species vs time (log-log)', [(RX0 + RX1) / 2, RY1 + 0.3, -0.6], 'muted', chart);
    title.element.style.fontSize = '11px';
  }

  // Ribbons share one position attribute between a faint full copy and a bright "so far" copy.
  const ribPos: Float32Array[] = [];
  const ribNow: THREE.BufferGeometry[] = [];
  const ribEndLabels: CSS2DObject[] = [];
  const RW = 0.025; // ribbon half-thickness (y) and depth (z)
  const ribIndex: number[] = [];
  for (let i = 0; i < NREC - 1; i++) {
    const a = i * 2;
    ribIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let s = 0; s < NSP; s++) {
    const pos = new Float32Array(NREC * 2 * 3);
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    const gFull = new THREE.BufferGeometry();
    gFull.setAttribute('position', attr);
    gFull.setIndex(ribIndex);
    const gNow = new THREE.BufferGeometry();
    gNow.setAttribute('position', attr);
    gNow.setIndex(ribIndex);
    const col = SP_COLOR[s];
    const full = new THREE.Mesh(gFull, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    const now = new THREE.Mesh(gNow, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    full.frustumCulled = false;
    now.frustumCulled = false;
    chart.add(full, now);
    ribPos.push(pos);
    ribNow.push(gNow);
    const l = stage.label(SP_LABEL[s], [0, 0, 0], '', chart);
    l.element.style.color = css(col);
    l.element.style.fontSize = '12px';
    l.element.style.fontWeight = '600';
    ribEndLabels.push(l);
  }
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.03, RY1 - RY0), cursorMat);
  cursor.position.y = (RY0 + RY1) / 2;
  chart.add(cursor);
  const dotGeo = new THREE.SphereGeometry(0.07, 14, 10);
  const dots = SP_COLOR.map((c) => {
    const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: c }));
    chart.add(m);
    return m;
  });
  const bottleneckMark = new THREE.Mesh(
    new THREE.PlaneGeometry(1, RY1 - RY0),
    new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.07, depthWrite: false }),
  );
  bottleneckMark.position.z = -0.62;
  chart.add(bottleneckMark);
  const bnLabel = stage.label('D bottleneck breaks', [0, RY0 + 0.25, -0.6], 'muted', chart);
  bnLabel.element.style.fontSize = '10px';
  bnLabel.element.style.color = css(PALETTE.cyan);

  function buildRibbons(): void {
    const h = res.hist!;
    const zs = [0.35, 0.25, 0.15, 0.05, -0.05, 0.3, -0.15, -0.25];
    for (let s = 0; s < NSP; s++) {
      const pos = ribPos[s];
      for (let k = 0; k < NREC; k++) {
        const x = xOfT(REC[k]);
        const X = h.X[k * NSP + s];
        const y = Math.max(RY0, yOfX(X));
        // Below the floor of the chart the ribbon slips behind the backdrop.
        const z = X < 10 ** LOG_MIN ? -0.8 : zs[s];
        const o = k * 6;
        pos[o] = x;
        pos[o + 1] = y + RW;
        pos[o + 2] = z;
        pos[o + 3] = x;
        pos[o + 4] = y - RW;
        pos[o + 5] = z;
      }
      (ribNow[s].getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const yEnd = yOfX(h.X[(NREC - 1) * NSP + s]);
      ribEndLabels[s].position.set(RX1 + 0.3, yEnd, zs[s]);
      ribEndLabels[s].visible = yEnd > RY0 + 0.05;
    }
    const x0 = xOfT(Math.max(T_MIN, res.tNuc * 0.8));
    const x1 = xOfT(Math.min(T_MAX, res.tNuc * 1.25));
    bottleneckMark.scale.x = x1 - x0;
    bottleneckMark.position.set((x0 + x1) / 2, (RY0 + RY1) / 2, -0.62);
    bnLabel.position.set(x0 - 0.2, RY0 + 0.25, -0.6);
  }
  // Keep the end labels from overlapping: nudge apart after build.
  function spreadEndLabels(): void {
    const order = [...Array(NSP).keys()].filter((s) => ribEndLabels[s].visible).sort((a, b) => ribEndLabels[a].position.y - ribEndLabels[b].position.y);
    for (let i = 1; i < order.length; i++) {
      const a = ribEndLabels[order[i - 1]].position;
      const b = ribEndLabels[order[i]].position;
      if (b.y - a.y < 0.24) b.y = a.y + 0.24;
    }
  }

  // Interpolated mass fractions at time t (log in time and in abundance).
  const Xnow = new Float64Array(NSP);
  let Tnow = 1;
  function sample(t: number): void {
    const h = res.hist!;
    const x = (Math.log(t / T_MIN) / LN_SPAN) * (NREC - 1);
    const k = Math.max(0, Math.min(NREC - 2, Math.floor(x)));
    const w = Math.max(0, Math.min(1, x - k));
    for (let s = 0; s < NSP; s++) {
      const a = Math.max(h.X[k * NSP + s], 1e-40);
      const b = Math.max(h.X[(k + 1) * NSP + s], 1e-40);
      Xnow[s] = Math.exp(Math.log(a) + w * (Math.log(b) - Math.log(a)));
    }
    Tnow = Math.exp(Math.log(h.T[k]) + w * (Math.log(h.T[k + 1]) - Math.log(h.T[k])));
  }

  // =========================================================================
  // Overlays: clock (top left), Schramm plot (top right, draggable), legend.
  const overlayBase: Partial<CSSStyleDeclaration> = {
    position: 'absolute', zIndex: '2', background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049',
  };
  const clock = document.createElement('canvas');
  clock.className = 'stage-overlay';
  clock.width = 420;
  clock.height = 220;
  Object.assign(clock.style, overlayBase, { left: '10px', top: '10px', width: '210px', height: '110px', pointerEvents: 'none' });
  viewport.appendChild(clock);
  const cctx = clock.getContext('2d')!;

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 540;
  inset.height = 430;
  Object.assign(inset.style, overlayBase, { right: '10px', top: '10px', width: '270px', height: '215px', cursor: 'ew-resize', touchAction: 'none' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // --- Schramm curves (computed a few η per frame so the page never stalls)
  const EGRID = etaGrid(26, 1e-10, 1e-9);
  let curves: Schramm = { eta: EGRID, Yp: new Float64Array(26), DH: new Float64Array(26), He3H: new Float64Array(26), Li7H: new Float64Array(26) };
  let curvesDone = 0;
  let curvesKey = '';
  function requestCurves(): void {
    const key = `${Nnu}|${tau}`;
    if (key === curvesKey) return;
    curvesKey = key;
    curvesDone = 0;
    curves = { eta: EGRID, Yp: new Float64Array(26), DH: new Float64Array(26), He3H: new Float64Array(26), Li7H: new Float64Array(26) };
  }
  function stepCurves(): boolean {
    if (curvesDone >= EGRID.length) return false;
    const t0 = performance.now();
    while (curvesDone < EGRID.length && performance.now() - t0 < 8) {
      const r = runBBN({ eta: EGRID[curvesDone], Nnu, tau });
      curves.Yp[curvesDone] = r.Yp;
      curves.DH[curvesDone] = r.DH;
      curves.He3H[curvesDone] = r.He3H;
      curves.Li7H[curvesDone] = r.Li7H;
      curvesDone++;
    }
    return true;
  }

  // Inset geometry (canvas pixels)
  const IX0 = 70;
  const IX1 = 522;
  const TOP0 = 48;
  const TOP1 = 138;
  const BOT0 = 152;
  const BOT1 = 360;
  const YP_LO = 0.22;
  const YP_HI = 0.27;
  const LG_LO = -10.4;
  const LG_HI = -3;
  const ixOf = (e: number) => IX0 + ((IX1 - IX0) * Math.log10(e / 1e-10)) / 1;
  const iyYp = (y: number) => TOP1 - ((TOP1 - TOP0) * (y - YP_LO)) / (YP_HI - YP_LO);
  const iyLg = (v: number) => BOT1 - ((BOT1 - BOT0) * (Math.log10(v) - LG_LO)) / (LG_HI - LG_LO);

  function drawInset(): void {
    const W = inset.width;
    const g = ictx;
    g.clearRect(0, 0, W, inset.height);
    g.font = '600 20px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText('Schramm plot: yields vs η', 14, 30);
    g.font = '16px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText(`N_ν ${Nnu}  τ ${tau.toFixed(0)} s`, W - 170, 30);
    // Planck band (drawn at least 8 px wide so it stays visible)
    const pb0 = ixOf(ETA_PLANCK - ETA_PLANCK_SIG);
    const pb1 = ixOf(ETA_PLANCK + ETA_PLANCK_SIG);
    const pw = Math.max(8, pb1 - pb0);
    g.fillStyle = 'rgba(167,139,250,0.3)';
    g.fillRect((pb0 + pb1) / 2 - pw / 2, TOP0, pw, BOT1 - TOP0);
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    g.strokeRect(IX0, TOP0, IX1 - IX0, TOP1 - TOP0);
    g.strokeRect(IX0, BOT0, IX1 - IX0, BOT1 - BOT0);
    g.fillStyle = '#8391ab';
    g.font = '16px JetBrains Mono, monospace';
    for (const y of [0.23, 0.25]) {
      g.fillText(y.toFixed(2), 16, iyYp(y) + 6);
      g.fillRect(IX0 - 6, iyYp(y), 6, 2);
    }
    for (const l of [-10, -8, -6, -4]) {
      g.fillText(`1e${l}`, 8, iyLg(10 ** l) + 6);
      g.fillRect(IX0 - 6, iyLg(10 ** l), 6, 2);
    }
    for (const e10 of [1, 2, 5, 10]) {
      const x = ixOf(e10 * 1e-10);
      g.fillRect(x - 1, BOT1, 2, 8);
      g.fillText(String(e10), x - (e10 === 10 ? 18 : 5), BOT1 + 26);
    }
    g.fillText('η × 10¹⁰ (baryons per photon)', IX0 + 70, BOT1 + 56);
    // Observed bands
    const band = (y0: number, y1: number, color: string) => {
      g.fillStyle = color;
      g.fillRect(IX0, Math.min(y0, y1), IX1 - IX0, Math.max(4, Math.abs(y1 - y0)));
    };
    band(iyYp(YP_OBS - YP_OBS_SIG), iyYp(YP_OBS + YP_OBS_SIG), 'rgba(245,182,66,0.28)');
    band(iyLg(DH_OBS - DH_OBS_SIG), iyLg(DH_OBS + DH_OBS_SIG), 'rgba(79,209,232,0.4)');
    band(iyLg(LI_OBS - LI_OBS_SIG), iyLg(LI_OBS + LI_OBS_SIG), 'rgba(94,227,154,0.3)');
    // Curves
    const n = curvesDone;
    const curve = (ys: Float64Array, yOf: (v: number) => number, color: string) => {
      if (n < 2) return;
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ixOf(EGRID[i]);
        const y = yOf(ys[i]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    g.save();
    g.beginPath();
    g.rect(IX0, TOP0, IX1 - IX0, TOP1 - TOP0);
    g.rect(IX0, BOT0, IX1 - IX0, BOT1 - BOT0);
    g.clip();
    curve(curves.Yp, iyYp, css(PALETTE.amber));
    curve(curves.DH, iyLg, css(PALETTE.cyan));
    curve(curves.He3H, iyLg, css(PALETTE.rose));
    curve(curves.Li7H, iyLg, css(PALETTE.green));
    g.restore();
    g.font = '17px JetBrains Mono, monospace';
    g.fillStyle = css(PALETTE.amber);
    g.fillText('⁴He Y_p', IX0 + 8, TOP0 + 22);
    if (n === EGRID.length) {
      const lab = (ys: Float64Array, text: string, color: string, at: number, dy: number) => {
        g.fillStyle = color;
        g.fillText(text, ixOf(at) + 4, iyLg(interpCurve(EGRID, ys, at)) + dy);
      };
      lab(curves.DH, 'D/H', css(PALETTE.cyan), 1.15e-10, -8);
      lab(curves.He3H, '³He/H', css(PALETTE.rose), 1.15e-10, 20);
      lab(curves.Li7H, '⁷Li/H', css(PALETTE.green), 1.15e-10, -10);
    } else {
      g.fillStyle = '#8391ab';
      g.fillText(`computing ${n}/${EGRID.length}`, IX0 + 150, BOT0 + 60);
    }
    // η line and handle
    const xe = ixOf(eta);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(xe, TOP0 - 4);
    g.lineTo(xe, BOT1);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(xe, BOT1, 8, 0, Math.PI * 2);
    g.fill();
    const pt = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    };
    pt(xe, iyYp(Math.min(YP_HI, Math.max(YP_LO, res.Yp))), css(PALETTE.amber));
    pt(xe, iyLg(res.DH), css(PALETTE.cyan));
    pt(xe, iyLg(res.He3H), css(PALETTE.rose));
    pt(xe, iyLg(res.Li7H), css(PALETTE.green));
    g.fillStyle = '#dfe6f3';
    g.font = '17px JetBrains Mono, monospace';
    const txt = `η ${(eta * 1e10).toFixed(2)}`;
    const tw = g.measureText(txt).width;
    g.fillText(txt, xe + tw + 16 > IX1 ? xe - tw - 10 : xe + 10, BOT0 + 22);
    g.fillStyle = css(PALETTE.violet);
    g.font = '15px JetBrains Mono, monospace';
    g.fillText('CMB', (pb0 + pb1) / 2 + (xe < (pb0 + pb1) / 2 ? 8 : -42), BOT1 - 8);
  }

  // Dragging the η line on the inset
  let dragging = false;
  const etaFromEvent = (e: PointerEvent): number => {
    const r = inset.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * inset.width;
    const f = Math.max(0, Math.min(1, (px - IX0) / (IX1 - IX0)));
    return 1e-10 * 10 ** f;
  };
  const onDown = (e: PointerEvent) => {
    dragging = true;
    inset.setPointerCapture(e.pointerId);
    beginEtaDrag();
    setEta(etaFromEvent(e), true);
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) setEta(etaFromEvent(e), true);
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (inset.hasPointerCapture(e.pointerId)) inset.releasePointerCapture(e.pointerId);
    endEtaDrag();
  };
  inset.addEventListener('pointerdown', onDown);
  inset.addEventListener('pointermove', onMove);
  inset.addEventListener('pointerup', onUp);
  inset.addEventListener('pointercancel', onUp);

  // --- Clock
  function phaseText(): string {
    if (Tnow > 0.8) return 'weak reactions keep n ⇄ p in balance';
    if (Tnow > 0.25) return 'freeze-out: n/p stops following T';
    if (tNow < res.tNuc * 0.85) return 'deuterium bottleneck: photons win';
    if (tNow < res.tNuc * 1.6) return 'bottleneck breaks: helium forms';
    return 'done: the recipe is set';
  }
  function drawClock(): void {
    const g = cctx;
    const W = clock.width;
    const H = clock.height;
    g.clearRect(0, 0, W, H);
    const cx = 86;
    const cy = 92;
    const R = 62;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    g.lineCap = 'round';
    g.lineWidth = 11;
    g.strokeStyle = '#1c2436';
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.stroke();
    const col = plasmaColor(Tnow, tmpColor);
    g.strokeStyle = `rgb(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0})`;
    g.beginPath();
    g.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.max(0.001, u));
    g.stroke();
    g.fillStyle = '#56627c';
    for (const t of [1, 10, 60, 180, 600]) {
      const a = a0 + ((a1 - a0) * Math.log(t / T_MIN)) / LN_SPAN;
      g.beginPath();
      g.arc(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16), 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#dfe6f3';
    g.font = '600 21px JetBrains Mono, monospace';
    const ts = fmtTime(tNow);
    const parts = ts.includes('min') ? [ts.slice(0, ts.indexOf('min') + 3), ts.slice(ts.indexOf('min') + 4)] : [ts];
    parts.forEach((p, i) => g.fillText(p, cx - g.measureText(p).width / 2, cy + 8 + (parts.length > 1 ? (i - 0.5) * 24 : 0)));
    const x = 172;
    g.font = '600 22px JetBrains Mono, monospace';
    g.fillText(`kT ${Tnow < 0.1 ? Tnow.toFixed(3) : Tnow.toFixed(2)} MeV`, x, 40);
    g.font = '19px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    const TK = Tnow * 11.6045;
    g.fillText(`T ${TK < 1 ? TK.toFixed(2) : TK.toFixed(1)} billion K`, x, 70);
    const np = Xnow[0] / Math.max(1e-30, Xnow[1]);
    g.fillText(`free n/p ${np < 0.002 ? '≈ 0' : `1/${(1 / np).toFixed(1)}`}`, x, 100);
    g.fillStyle = css(PALETTE.amber);
    g.fillText(`⁴He mass ${Xnow[5].toFixed(3)}`, x, 130);
    g.fillStyle = '#b8c3d9';
    g.font = '17px JetBrains Mono, monospace';
    g.fillText(phaseText(), 14, H - 14);
  }
  const tmpColor = new THREE.Color();

  // =========================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('The first 20 minutes');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => {
      if (!playing && u >= 1) u = 0;
      playing = !playing;
      if (playing) userStarted = true;
      playBtn.textContent = playing ? 'Pause' : 'Play';
    } },
    { label: 'Restart', onClick: () => {
      u = 0;
      playing = true;
      userStarted = true;
      userRun = false;
      playBtn.textContent = 'Pause';
    } },
  ]);
  const timeCtl = ui.slider({
    key: 'time', label: 'Clock (log scale)', min: 0, max: 1, step: 0.001, value: 0,
    format: (v) => fmtTime(T_MIN * Math.exp(v * LN_SPAN)),
    onInput: (v) => {
      u = v;
      playing = false;
      playBtn.textContent = 'Play';
    },
  });
  ui.slider({ key: 'speed', label: 'Playback speed', min: 0.25, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'both', label: 'Both' }, { value: 'kitchen', label: 'Kitchen' }, { value: 'ribbons', label: 'Ribbons' }],
    onChange: (v) => {
      view = v;
      stage.flyTo(CAM[v].pos, CAM[v].target);
    },
  });

  ui.section('The universe’s recipe');
  const etaCtl = ui.slider({
    key: 'eta', label: 'Baryons per photon η', min: -10, max: -9, step: 0.002, value: Math.log10(eta),
    format: (v) => `${(10 ** v * 1e10).toFixed(2)}×10⁻¹⁰`,
    onInput: (v) => setEta(10 ** v, false),
  });
  etaCtl.el.addEventListener('pointerdown', () => beginEtaDrag());
  etaCtl.el.addEventListener('pointerup', () => endEtaDrag());
  etaCtl.el.addEventListener('change', () => endEtaDrag());
  ui.select<'2' | '3' | '4' | '5'>({
    key: 'Nnu', label: 'Neutrino species N_ν', value: '3',
    options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }],
    onChange: (v) => {
      Nnu = Number(v);
      dirty = true;
    },
  });
  ui.slider({
    key: 'tau', label: 'Neutron lifetime τ_n', min: 850, max: 910, step: 0.5, value: tau, unit: 's',
    format: (v) => v.toFixed(1),
    onInput: (v) => {
      tau = v;
      dirty = true;
    },
  });
  ui.buttons([
    { label: 'Planck η', onClick: () => { setEta(ETA_PLANCK, true); } },
    { label: 'Reset recipe', onClick: () => {
      setEta(ETA_PLANCK, true);
      tau = TAU_N;
      dirty = true;
    } },
  ]);

  ui.section('Final yields (after 20 min)');
  const rYp = ui.readout('Yp', 'helium Y_p');
  const rNp = ui.readout('np', 'n/p at nucleosynthesis');
  const rDH = ui.readout('DH', 'D/H');
  const rHe3 = ui.readout('He3H', '³He/H');
  const rLi = ui.readout('Li', '⁷Li/H');
  const rLiX = ui.readout('LiX', 'Li: predicted / observed');
  ui.section('Clock now');
  const rT = ui.readout('t', 'time');
  const rkT = ui.readout('kT', 'kT', 'MeV');
  const rTnuc = ui.readout('tNuc', 'D bottleneck breaks at', 's');
  const rCons = ui.readout('cons', 'baryon number drift');
  ui.note('The network tracks n, p, D, ³H, ³He, ⁴He, ⁷Li and ⁷Be through 17 reactions with measured rate fits. ⁷Be later captures an electron and becomes ⁷Li, so the ⁷Li/H readout includes it. Observed: D/H = 2.53×10⁻⁵, Y_p = 0.245 ± 0.003, Li/H ≈ 1.6×10⁻¹⁰.');
  ui.legend(SP_LABEL.map((l, s) => ({ color: css(SP_COLOR[s]), label: l })));

  function setEta(v: number, fromInset: boolean): void {
    eta = Math.max(1e-10, Math.min(1e-9, v));
    etaTouched = true;
    if (fromInset) etaCtl.set(Math.log10(eta), false);
    dirty = true;
  }
  function beginEtaDrag(): void {
    dragEta0 = eta;
    dragDH0 = res.DH;
    dragEnding = false;
  }
  function endEtaDrag(): void {
    // The last recompute of a drag may still be pending, so finish after it.
    if (dirty) dragEnding = true;
    else dragEta0 = NaN;
  }

  function recompute(): void {
    res = runBBN({ eta, Nnu, tau }, REC);
    yp3 = Nnu === 3 ? res.Yp : runBBN({ eta, Nnu: 3, tau }).Yp;
    buildRibbons();
    spreadEndLabels();
    requestCurves();
    if (!Number.isNaN(dragEta0) && eta >= dragEta0 * 2 && res.DH < dragDH0 / 2) sawDHfall = true;
    if (dragEnding) {
      dragEnding = false;
      dragEta0 = NaN;
    }
    rYp(res.Yp.toFixed(4));
    rNp(`1/${(1 / res.npNuc).toFixed(2)}`);
    rDH(fmtSci(res.DH, 2));
    rHe3(fmtSci(res.He3H, 2));
    rLi(fmtSci(res.Li7H, 2));
    rLiX(`${(res.Li7H / LI_OBS).toFixed(1)}×`);
    rTnuc(res.tNuc.toFixed(0));
    rCons(res.baryonErr.toExponential(0));
    drawInset();
  }

  // =========================================================================
  // Frame loop
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vS = new THREE.Vector3(1, 1, 1);
  const vP = new THREE.Vector3();
  let clockTimer = 0;
  let bondTimer = 0;
  let scrubTimer = 0;
  let lastTarget = -1;
  let stateText = '';
  const rackText: string[] = rackSpecies.map(() => '');
  let spin = 0;

  function updatePot(dt: number): void {
    // Target counts from the network at the current time.
    const nHe = Math.round((Xnow[5] * NN) / 4);
    const nN = Math.min(NN - 4 * nHe, Math.round(Xnow[0] * NN));
    const key = nHe * 1000 + nN;
    if (key !== lastTarget) {
      reconcile(nN, nHe, playing);
      lastTarget = key;
    }
    // Thermal jiggle: faster when hotter.
    const vth = 0.35 + 0.9 * Math.sqrt(Math.min(3, Tnow));
    const inBottleneck = Tnow < 1.0 && tNow < res.tNuc * 0.9;
    for (let b = 0; b < NN; b++) {
      if (bType[b] < 0) continue;
      const o = b * 3;
      const heavy = bType[b] === B_HE ? 0.5 : 1;
      for (let k = 0; k < 3; k++) {
        bVel[o + k] += (rnd() - 0.5) * 6 * dt;
        bVel[o + k] *= 1 - 0.8 * dt;
      }
      const sp = Math.hypot(bVel[o], bVel[o + 1], bVel[o + 2]) + 1e-6;
      const f = Math.min(1, vth / sp);
      bPos[o] += bVel[o] * f * heavy * dt;
      bPos[o + 1] += bVel[o + 1] * f * heavy * dt;
      bPos[o + 2] += bVel[o + 2] * f * heavy * dt;
      // A bonded neutron rides next to its proton.
      if (bond[b] >= 0) {
        const pb = bond[b];
        bPos[o] = bPos[pb * 3] + 0.17;
        bPos[o + 1] = bPos[pb * 3 + 1];
        bPos[o + 2] = bPos[pb * 3 + 2];
        bondT[b] -= dt;
        if (bondT[b] <= 0) {
          strike(bPos[o], bPos[o + 1], bPos[o + 2]);
          flash(bPos[o] - 0.08, bPos[o + 1], bPos[o + 2], PALETTE.amber, 0.55, 0.35);
          bond[b] = -1;
          bVel[o] += 1.5;
          bVel[pb * 3] -= 1.5;
        }
      }
      const r = Math.hypot(bPos[o], bPos[o + 1], bPos[o + 2]);
      const lim = POT_R - 0.15;
      if (r > lim) {
        const s = lim / r;
        bPos[o] *= s;
        bPos[o + 1] *= s;
        bPos[o + 2] *= s;
        const d = (bVel[o] * bPos[o] + bVel[o + 1] * bPos[o + 1] + bVel[o + 2] * bPos[o + 2]) / (lim * lim);
        if (d > 0) {
          bVel[o] -= 2 * d * bPos[o];
          bVel[o + 1] -= 2 * d * bPos[o + 1];
          bVel[o + 2] -= 2 * d * bPos[o + 2];
        }
      }
    }
    // Bottleneck cartoon: n and p pair up for a moment, then a photon splits them.
    if (playing && inBottleneck) {
      bondTimer -= dt * speed;
      if (bondTimer <= 0) {
        bondTimer = 0.35 + rnd() * 0.3;
        const nb = randomFree(true);
        if (nb >= 0 && bond[nb] < 0) {
          const pb = nearestFree(bPos[nb * 3], bPos[nb * 3 + 1], bPos[nb * 3 + 2], false, -1);
          if (pb >= 0) {
            bond[nb] = pb;
            bondT[nb] = 0.45;
          }
        }
      }
    }
    // Nucleon positions ease toward body centre + offset.
    const ease = Math.min(1, dt * 8);
    spin += dt * 1.2;
    for (let i = 0; i < NN; i++) {
      const b = nBody[i];
      const o = i * 3;
      const bo = b * 3;
      let ox = nOff[o];
      const oy = nOff[o + 1];
      let oz = nOff[o + 2];
      if (bType[b] === B_HE) {
        const c = Math.cos(spin + b);
        const s = Math.sin(spin + b);
        const x2 = ox * c - oz * s;
        oz = ox * s + oz * c;
        ox = x2;
      }
      nPos[o] += (bPos[bo] + ox - nPos[o]) * ease;
      nPos[o + 1] += (bPos[bo + 1] + oy - nPos[o + 1]) * ease;
      nPos[o + 2] += (bPos[bo + 2] + oz - nPos[o + 2]) * ease;
      m4.compose(vP.set(nPos[o], nPos[o + 1], nPos[o + 2]), qI, vS);
      nucleons.setMatrixAt(i, m4);
    }
    nucleons.instanceMatrix.needsUpdate = true;

    // Photons: speed and brightness follow temperature.
    const pv = 2.5 + 3 * Math.min(1, Tnow);
    for (let i = 0; i < NPH; i++) {
      const o = i * 3;
      phPos[o] += phVel[o] * pv * dt;
      phPos[o + 1] += phVel[o + 1] * pv * dt;
      phPos[o + 2] += phVel[o + 2] * pv * dt;
      const r2 = phPos[o] ** 2 + phPos[o + 1] ** 2 + phPos[o + 2] ** 2;
      if (r2 > POT_R * POT_R) {
        // re-enter on the opposite side
        phPos[o] *= -0.95;
        phPos[o + 1] *= -0.95;
        phPos[o + 2] *= -0.95;
      }
    }
    (phGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    const heat = Math.max(0, Math.min(1, (Math.log10(Tnow) + 1.7) / 2));
    phMat.size = 0.03 + 0.05 * heat;
    phMat.opacity = 0.25 + 0.65 * heat;
    plasmaColor(Tnow, tmpColor);
    glowMat.color.copy(tmpColor);
    glowMat.opacity = 0.18 + 0.45 * heat;
    shellMat.color.copy(tmpColor);
    rimMat.color.copy(tmpColor);

    // Flashes and streaks
    for (const f of flashes) {
      if (!f.sprite.visible) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        continue;
      }
      const a = f.life / f.max;
      f.mat.opacity = a;
      const s = f.size * (1.4 - 0.6 * a);
      f.sprite.scale.set(s, s, 1);
    }
    let anyStreak = false;
    for (let k = 0; k < STREAKS; k++) {
      if (stLife[k] > 0) {
        stLife[k] -= dt;
        anyStreak = true;
        if (stLife[k] <= 0) for (let j = 0; j < 6; j++) stPos[k * 6 + j] = 0;
      }
    }
    if (anyStreak) (stGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    const st = inBottleneck && Tnow < 0.8 ? 'n + p → D + γ, but photons split D at once' : '';
    if (st !== stateText) {
      stateText = st;
      stateLabel.element.textContent = st;
    }
  }

  function updateRack(): void {
    const hyd = Math.max(1e-30, Xnow[1]);
    rackSpecies.forEach((sp, j) => {
      const perH = Xnow[sp] / A_NUC[sp] / hyd;
      const l = Math.log10(Math.max(perH, 1e-30));
      const s = Math.max(0, Math.min(1, (l + 14) / 10));
      rackGroups[j].scale.setScalar(0.25 + 0.95 * s);
      rackGroups[j].visible = s > 0.02;
      const txt = `${SP_LABEL[sp]}<br>${perH < 1e-20 ? 'none yet' : fmtSci(perH, 1)}`;
      if (txt !== rackText[j]) {
        rackText[j] = txt;
        rackLabels[j].element.innerHTML = txt;
      }
    });
  }

  function updateChart(): void {
    const x = xOfT(tNow);
    cursor.position.x = x;
    const k = Math.min(NREC - 1, Math.max(1, Math.ceil((Math.log(tNow / T_MIN) / LN_SPAN) * (NREC - 1))));
    for (let s = 0; s < NSP; s++) {
      ribNow[s].setDrawRange(0, k * 6);
      const y = yOfX(Xnow[s]);
      dots[s].position.set(x, y, [0.35, 0.25, 0.15, 0.05, -0.05, 0.3, -0.15, -0.25][s]);
      dots[s].visible = Xnow[s] >= 10 ** LOG_MIN;
    }
  }

  stage.onFrame((dt) => {
    if (dirty) {
      dirty = false;
      recompute();
    }
    if (stepCurves()) drawInset();
    if (playing) {
      u += (dt * speed) / PLAY_SECONDS;
      if (u >= 1) {
        u = 1;
        if (userStarted) userRun = true;
        playing = false;
        playBtn.textContent = 'Play';
      }
    }
    tNow = T_MIN * Math.exp(u * LN_SPAN);
    sample(tNow);
    updatePot(dt);
    updateRack();
    updateChart();
    clockTimer += dt;
    if (clockTimer > 0.06) {
      clockTimer = 0;
      drawClock();
      rT(fmtTime(tNow));
      rkT(Tnow < 0.1 ? Tnow.toFixed(3) : Tnow.toFixed(2));
    }
    scrubTimer += dt;
    if (playing && scrubTimer > 0.2) {
      scrubTimer = 0;
      timeCtl.set(u, false);
    }
  });

  recompute();
  sample(tNow);
  drawClock();

  return {
    state: () => ({
      eta,
      eta10: eta * 1e10,
      Nnu,
      tau,
      view,
      t: tNow,
      kT: Tnow,
      playing,
      Yp: res.Yp,
      Yp3: yp3,
      DH: res.DH,
      He3H: res.He3H,
      Li7H: res.Li7H,
      npNuc: res.npNuc,
      tNuc: res.tNuc,
      baryonErr: res.baryonErr,
      etaTouched,
      userRun,
      sawDHfall,
    }),
    dispose: () => {
      inset.removeEventListener('pointerdown', onDown);
      inset.removeEventListener('pointermove', onMove);
      inset.removeEventListener('pointerup', onUp);
      inset.removeEventListener('pointercancel', onUp);
      clock.remove();
      inset.remove();
      tex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'big-bang-nucleosynthesis',
  number: 86,
  title: 'The First Three Minutes',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'How the universe cooked its first hydrogen, helium and lithium.',
  content,
  mount,
};

export default topic;
