import * as THREE from 'three';
import { createStage, makeArrow, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  DAYS_PER_YEAR, ROI, SCAN, SHM, TPC, XE_A,
  axionMassUeV, budget, cavityResponse, dRdE, dateLabel, earthSpeed, fogSigma, gauss,
  maxRecoilKeV, mNucleus, mulberry32, rateBetween, reducedMass, sampleWallDepth, toyLimit, wallDistance,
  type RateParams,
} from './physics.ts';

type View = 'halo' | 'tpc' | 'axion';
type Inset = 'spectrum' | 'exclusion';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  halo: { pos: [6.2, 3.6, 7.4], target: [0.9, -0.2, 0.3] },
  tpc: { pos: [6.2, 3.4, 16.5], target: [2.0, -0.4, 0] },
  axion: { pos: [7.4, 3.4, 12.6], target: [0.6, 0.4, 0] },
};

const MN = mNucleus(XE_A);
const N_WIND = 2600;
const WIND_BOX = 11; // half-size of the wind box (scene units)
const WIND_SCALE = 3 / SHM.vSun; // scene units per second per km/s
const ORBIT_R = 3;
const COS_G = SHM.cosGamma;
const SIN_G = Math.sqrt(1 - COS_G * COS_G);

// TPC geometry in scene units (1 unit = 20 cm)
const U = 20;
const TR = TPC.R / U;
const TH = TPC.H / U;
const GAS = 0.28; // exaggerated gas gap
const N_SLOTS = 8;
const DRIFT_V = 2.6; // scene units per second (slowed for the eye)
const N_EXCL = 64;

// Axion cavity
const CAV_R = 1.4;
const CAV_H = 4;
const NB = Math.round((SCAN.fHi - SCAN.fLo) / SCAN.bin);

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function overlayBox(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const d = document.createElement('div');
  Object.assign(d.style, {
    position: 'absolute', zIndex: '2', pointerEvents: 'none', background: 'rgba(7,10,18,0.74)', border: '1px solid #243049',
    borderRadius: '10px', padding: '7px 10px', font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
    ...style,
  } as CSSStyleDeclaration);
  return d;
}

function insetCanvas(w: number, h: number, style: Partial<CSSStyleDeclaration>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  Object.assign(c.style, {
    position: 'absolute', width: `${w / 2}px`, height: `${h / 2}px`, background: 'rgba(7,10,18,0.78)',
    borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', ...style,
  } as CSSStyleDeclaration);
  return c;
}

const fmtSig = (s: number) => {
  const e = Math.floor(Math.log10(s));
  const m = s / 10 ** e;
  return `${m.toFixed(1)}e${e}`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.halo.pos, target: CAM.halo.target, fov: 42, far: 300 });
  const { scene } = stage;
  const glow = glowTexture();
  const rng = mulberry32(20240827);

  // ------------------------------------------------------------- parameters
  let view: View = 'halo';
  let inset: Inset = 'spectrum';
  let logM = Math.log10(40);
  let logSigma = -46;
  let exposure = 5;
  let day = 15;
  let cut = 2;
  let scanSpeed = 12;
  let touchedMonth = false;
  let touchedMass = false;

  const mChi = () => 10 ** logM;
  const sigma = () => 10 ** logSigma;

  // ------------------------------------------------------------- derived physics (recomputed on change)
  const rp: RateParams = { mChi: 40, sigma: 1e-46, A: XE_A, halo: { v0: SHM.v0, vesc: SHM.vesc, vE: SHM.vSun } };
  let vE = earthSpeed(day);
  let rateNow = 0;
  let rateAvg = 0;
  let rateMaxYear = 0;
  let modAmp = 0;
  let eMax = 0;
  let emaxRatio = 0;
  let bud = budget(exposure, cut, 0);

  function rateAt(vEarth: number): number {
    rp.mChi = mChi();
    rp.sigma = sigma();
    rp.halo.vE = vEarth;
    return rateBetween(ROI.lo, ROI.hi, rp, 120);
  }

  function recompute(): void {
    vE = earthSpeed(day);
    rateNow = rateAt(vE);
    rateAvg = rateAt(SHM.vSun);
    const rJun = rateAt(earthSpeed(SHM.tPeak));
    const rDec = rateAt(earthSpeed(SHM.tPeak + DAYS_PER_YEAR / 2));
    rateMaxYear = Math.max(rJun, rDec);
    modAmp = (rJun - rDec) / (rJun + rDec);
    const vmax = SHM.vesc + vE;
    eMax = maxRecoilKeV(mChi(), MN, vmax);
    emaxRatio = (reducedMass(mChi(), MN) / MN) ** 2;
    bud = budget(exposure, cut, rateAvg);
  }

  // =====================================================================
  // View 1: the halo wind
  const halo = new THREE.Group();
  scene.add(halo);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  halo.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: PALETTE.amber, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunGlow.scale.setScalar(1.7);
  halo.add(sunGlow);

  const e1 = new THREE.Vector3(1, 0, 0);
  const e2 = new THREE.Vector3(0, SIN_G, COS_G);
  const orbitPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    orbitPts.push(e1.clone().multiplyScalar(ORBIT_R * Math.cos(a)).addScaledVector(e2, ORBIT_R * Math.sin(a)));
  }
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPts), new THREE.LineBasicMaterial({ color: 0x3d5a80, transparent: true, opacity: 0.9 }));
  halo.add(orbit);
  // Galactic plane reference disc (the plane the Sun moves in)
  const gp = new THREE.Mesh(new THREE.RingGeometry(0.6, 6.5, 64), new THREE.MeshBasicMaterial({ color: 0x1c2436, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  gp.rotation.x = -Math.PI / 2;
  halo.add(gp);

  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0x4f9de8, emissive: 0x0d2a4a, roughness: 0.6 }));
  halo.add(earth);
  const earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: PALETTE.cyan, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  earthGlow.scale.setScalar(0.9);
  earth.add(earthGlow);

  const sunArrow = makeArrow(new THREE.Vector3(0, 0, 1), 2.4, PALETTE.amber, new THREE.Vector3(0, 0, 0.5));
  halo.add(sunArrow);
  stage.label('Sun: 232 km/s through the halo', [0, 0.1, 3.3], 'muted', halo);
  const orbArrow = makeArrow(new THREE.Vector3(0, 0, 1), 1, PALETTE.cyan);
  halo.add(orbArrow);
  const windArrow = makeArrow(new THREE.Vector3(0, 0, -1), 1, PALETTE.violet);
  halo.add(windArrow);
  const earthLabel = stage.label('', [0, 0, 0], '', halo);
  const junPos = e1.clone().multiplyScalar(ORBIT_R * 1.18);
  stage.label('2 Jun: fastest', [junPos.x, junPos.y + 0.2, junPos.z], 'muted', halo);
  const decPos = e1.clone().multiplyScalar(-ORBIT_R * 1.18);
  stage.label('2 Dec: slowest', [decPos.x, decPos.y + 0.2, decPos.z], 'muted', halo);
  stage.label('WIMP wind: halo seen from the Sun', [-2.2, -1.6, -2.5], 'muted', halo);

  // Wind particles: galactic-frame Maxwellian velocities, seen in the Sun's frame.
  const wPos = new Float32Array(N_WIND * 3);
  const wVel = new Float32Array(N_WIND * 3);
  const sd = SHM.v0 / Math.SQRT2;
  for (let i = 0; i < N_WIND; i++) {
    let vx = 0, vy = 0, vz = 0;
    do {
      vx = gauss(rng) * sd;
      vy = gauss(rng) * sd;
      vz = gauss(rng) * sd;
    } while (vx * vx + vy * vy + vz * vz > SHM.vesc * SHM.vesc);
    wVel[i * 3] = vx * WIND_SCALE;
    wVel[i * 3 + 1] = vy * WIND_SCALE;
    wVel[i * 3 + 2] = (vz - SHM.vSun) * WIND_SCALE;
    wPos[i * 3] = (rng() * 2 - 1) * WIND_BOX;
    wPos[i * 3 + 1] = (rng() * 2 - 1) * WIND_BOX * 0.6;
    wPos[i * 3 + 2] = (rng() * 2 - 1) * WIND_BOX;
  }
  const windGeo = new THREE.BufferGeometry();
  windGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  const wind = new THREE.Points(windGeo, new THREE.PointsMaterial({ color: PALETTE.violet, size: 0.2, map: glow, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  wind.frustumCulled = false;
  halo.add(wind);

  const ep = new THREE.Vector3();
  const ev = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function drawHalo(): void {
    const ph = (2 * Math.PI * (day - SHM.tPeak)) / DAYS_PER_YEAR;
    ep.copy(e1).multiplyScalar(ORBIT_R * Math.cos(ph)).addScaledVector(e2, ORBIT_R * Math.sin(ph));
    earth.position.copy(ep);
    // Orbital velocity direction (tangent), then Earth's total velocity through the halo.
    ev.copy(e1).multiplyScalar(-Math.sin(ph)).addScaledVector(e2, Math.cos(ph));
    orbArrow.position.copy(ep);
    orbArrow.setDirection(ev);
    orbArrow.setLength(1.0, 0.22, 0.13);
    // Wind felt at Earth: -(v_sun z + v_orb), drawn arriving at the Earth.
    tmp.set(0, 0, SHM.vSun).addScaledVector(ev, SHM.vOrb);
    const speed = tmp.length();
    const len = 0.6 + (speed - 200) * 0.045;
    tmp.normalize();
    windArrow.position.copy(ep).addScaledVector(tmp, len + 0.25);
    windArrow.setDirection(tmp.negate());
    windArrow.setLength(len, 0.3, 0.18);
    earthLabel.position.set(ep.x, ep.y + 0.55, ep.z);
    earthLabel.element.textContent = `Earth ${dateLabel(day)}: v_E = ${vE.toFixed(0)} km/s`;
  }

  // =====================================================================
  // View 2: dual-phase xenon TPC
  const tpc = new THREE.Group();
  scene.add(tpc);
  const gapMid = Math.atan2(CAM.tpc.pos[0], CAM.tpc.pos[2]);
  const th0 = gapMid + Math.PI / 4;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(TR + 0.05, TR + 0.05, TH + GAS + 0.3, 64, 1, true, th0, 1.5 * Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x8a96b0, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  wall.position.y = GAS / 2;
  tpc.add(wall);
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(TR, TR, TH, 64, 1, false, th0, 1.5 * Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3a64b8, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 }),
  );
  tpc.add(liquid);
  const surf = new THREE.Mesh(new THREE.CircleGeometry(TR, 64), new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = TH / 2;
  tpc.add(surf);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x5a6a8c });
  for (const y of [-TH / 2, TH / 2, TH / 2 + GAS]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(TR * Math.sin(a), y, TR * Math.cos(a)));
    }
    tpc.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }

  // PMT arrays: hexagonal packing inside the radius
  const pmtXY: number[] = [];
  const pitch = 0.62;
  for (let i = -8; i <= 8; i++) {
    for (let j = -8; j <= 8; j++) {
      const x = (i + (j % 2 ? 0.5 : 0)) * pitch;
      const z = j * pitch * 0.866;
      if (Math.hypot(x, z) < TR - 0.3) pmtXY.push(x, z);
    }
  }
  const NP = pmtXY.length / 2;
  const pmtGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.12, 20);
  const pmts = new THREE.InstancedMesh(pmtGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), NP * 2);
  const pmtI = new Float32Array(NP * 2);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < NP; k++) {
    m4.makeTranslation(pmtXY[k * 2], TH / 2 + GAS + 0.12, pmtXY[k * 2 + 1]);
    pmts.setMatrixAt(k, m4);
    m4.makeTranslation(pmtXY[k * 2], -TH / 2 - 0.12, pmtXY[k * 2 + 1]);
    pmts.setMatrixAt(NP + k, m4);
  }
  const pmtCol = new THREE.Color();
  const PMT_BASE = new THREE.Color(0x232c40);
  const PMT_HOT = new THREE.Color(0xbfe9ff);
  for (let k = 0; k < NP * 2; k++) pmts.setColorAt(k, PMT_BASE);
  tpc.add(pmts);

  // Fiducial volume: unit cylinder scaled to the cut
  const fidGroup = new THREE.Group();
  const fidSurf = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  const fidWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1, 1, 1, 24, 1)), new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.45 }));
  fidGroup.add(fidSurf, fidWire);
  tpc.add(fidGroup);
  const fidLabel = stage.label('fiducial volume', [0, 0, 0], '', tpc);
  function applyCut(): void {
    const r = Math.max(0.01, (TPC.R - cut) / U);
    const h = Math.max(0.01, (TPC.H - 2 * cut) / U);
    fidGroup.scale.set(r, h, r);
    fidLabel.position.set(r * 0.75, -h / 2 + 0.3, r * 0.75);
  }
  stage.label('top PMT array', [0, TH / 2 + GAS + 0.55, -TR * 0.5], 'muted', tpc);
  stage.label('bottom PMT array', [0, -TH / 2 - 0.5, -TR * 0.5], 'muted', tpc);
  stage.label('gas gap: S2', [TR + 0.6, TH / 2 + GAS / 2 + 0.1, 0], 'muted', tpc);
  stage.label('liquid xenon', [TR + 0.6, -TH / 2 + 0.6, 0], 'muted', tpc);
  const drift = makeArrow(new THREE.Vector3(0, 1, 0), 2.2, 0x8fb4ff, new THREE.Vector3(-TR - 0.7, -1.2, 0));
  tpc.add(drift);
  stage.label('electrons drift up', [-TR - 0.7, 1.3, 0], 'muted', tpc);

  interface Ev {
    on: boolean;
    kind: 'ER' | 'NR';
    x: number; y: number; z: number;
    t: number;
    tDrift: number;
    fid: boolean;
  }
  const evs: Ev[] = [];
  const s1: THREE.Sprite[] = [];
  const s2: THREE.Sprite[] = [];
  const el: THREE.Mesh[] = [];
  const trails: THREE.Line[] = [];
  for (let i = 0; i < N_SLOTS; i++) {
    evs.push({ on: false, kind: 'ER', x: 0, y: 0, z: 0, t: 0, tDrift: 1, fid: false });
    const a = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true }));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x6f8fd8, transparent: true, opacity: 0.5 }));
    ln.frustumCulled = false;
    a.visible = b.visible = c.visible = ln.visible = false;
    tpc.add(a, b, c, ln);
    s1.push(a);
    s2.push(b);
    el.push(c);
    trails.push(ln);
  }
  const nrLabel = stage.label('nuclear recoil: WIMP-like (or a neutron)', [0, 0, 0], '', tpc);
  nrLabel.element.style.color = css(PALETTE.amber);
  nrLabel.visible = false;
  let nrSlot = -1;
  let spawnTimer = 0;
  let spawnCount = 0;
  let nER = 0;
  let nERfid = 0;
  let nNR = 0;

  function spawn(): void {
    const i = evs.findIndex((e) => !e.on);
    if (i < 0) return;
    const e = evs[i];
    spawnCount++;
    const isNR = spawnCount % 11 === 6;
    let rcm = 0;
    let zcm = 0;
    if (isNR) {
      rcm = TPC.R * 0.55 * Math.sqrt(rng());
      zcm = TPC.H * (0.25 + 0.5 * rng());
    } else if (rng() < 0.06) {
      rcm = TPC.R * Math.sqrt(rng());
      zcm = TPC.H * rng();
    } else {
      const d = Math.min(TPC.R * 0.9, sampleWallDepth(rng()));
      const sideArea = 2 * Math.PI * TPC.R * TPC.H;
      const capArea = Math.PI * TPC.R * TPC.R;
      const u = rng() * (sideArea + 2 * capArea);
      if (u < sideArea) {
        rcm = TPC.R - d;
        zcm = TPC.H * rng();
      } else {
        rcm = TPC.R * Math.sqrt(rng());
        zcm = u < sideArea + capArea ? d : TPC.H - d;
      }
    }
    // Keep the event on the visible (back) side of the cutaway most of the time.
    const phi = gapMid + Math.PI / 2 + rng() * Math.PI;
    e.on = true;
    e.kind = isNR ? 'NR' : 'ER';
    e.x = (rcm / U) * Math.sin(phi);
    e.z = (rcm / U) * Math.cos(phi);
    e.y = zcm / U - TH / 2;
    e.t = 0;
    e.tDrift = (TH / 2 - e.y) / DRIFT_V;
    e.fid = wallDistance(rcm, zcm) >= cut;
    if (isNR) {
      nNR++;
      nrSlot = i;
    } else {
      nER++;
      if (e.fid) nERfid++;
    }
    const col = e.kind === 'NR' ? PALETTE.amber : e.fid ? PALETTE.cyan : 0x6c7890;
    (s1[i].material as THREE.SpriteMaterial).color.set(col);
    (s2[i].material as THREE.SpriteMaterial).color.set(e.kind === 'NR' ? 0xffd07a : e.fid ? 0x9fe8ff : 0x7d8aa6);
    s1[i].position.set(e.x, e.y, e.z);
    s2[i].position.set(e.x, TH / 2 + GAS / 2, e.z);
    const pa = trails[i].geometry.attributes.position as THREE.BufferAttribute;
    pa.setXYZ(0, e.x, e.y, e.z);
    pa.setXYZ(1, e.x, e.y, e.z);
    pa.needsUpdate = true;
    // S1: a little light on every PMT, more on the nearer array.
    const up = (e.y + TH / 2) / TH;
    const s1Amp = e.kind === 'NR' ? 0.35 : 0.5;
    for (let k = 0; k < NP; k++) {
      pmtI[k] = Math.max(pmtI[k], s1Amp * (0.3 + 0.7 * up));
      pmtI[NP + k] = Math.max(pmtI[NP + k], s1Amp * (1 - 0.7 * up));
    }
  }

  function stepTPC(dt: number): void {
    spawnTimer += dt;
    if (spawnTimer > 0.55) {
      spawnTimer = 0;
      spawn();
    }
    for (let i = 0; i < N_SLOTS; i++) {
      const e = evs[i];
      if (!e.on) continue;
      e.t += dt;
      const t = e.t;
      // S1 flash
      const a1 = Math.max(0, 1 - t / 0.45);
      s1[i].visible = a1 > 0;
      if (a1 > 0) {
        s1[i].scale.setScalar((e.kind === 'NR' ? 0.9 : 0.7) * (0.4 + 0.6 * a1));
        (s1[i].material as THREE.SpriteMaterial).opacity = a1;
      }
      // Drift
      const td = Math.min(1, t / e.tDrift);
      const yNow = e.y + (TH / 2 - e.y) * td;
      el[i].visible = t < e.tDrift;
      el[i].position.set(e.x, yNow, e.z);
      trails[i].visible = t < e.tDrift + 0.6;
      const pa = trails[i].geometry.attributes.position as THREE.BufferAttribute;
      pa.setY(1, yNow);
      pa.needsUpdate = true;
      // S2 flash
      const t2 = t - e.tDrift;
      if (t2 >= 0) {
        const a2 = Math.max(0, 1 - t2 / 0.7);
        s2[i].visible = a2 > 0;
        s2[i].scale.setScalar(1.6 * (0.5 + 0.5 * a2));
        (s2[i].material as THREE.SpriteMaterial).opacity = a2;
        if (t2 < dt * 1.5) {
          // S2 light pattern on the top array locates x-y. Nuclear recoils give less charge.
          const amp = e.kind === 'NR' ? 0.6 : 1;
          for (let k = 0; k < NP; k++) {
            const dx = pmtXY[k * 2] - e.x;
            const dz = pmtXY[k * 2 + 1] - e.z;
            pmtI[k] = Math.max(pmtI[k], amp * Math.exp(-(dx * dx + dz * dz) / 0.9));
            pmtI[NP + k] = Math.max(pmtI[NP + k], 0.15 * amp);
          }
        }
        if (a2 <= 0) {
          e.on = false;
          s2[i].visible = false;
          trails[i].visible = false;
          if (nrSlot === i) nrSlot = -1;
        }
      }
    }
    if (nrSlot >= 0) {
      const e = evs[nrSlot];
      nrLabel.visible = view === 'tpc';
      nrLabel.position.set(e.x, e.y + 0.45, e.z);
    } else nrLabel.visible = false;
    for (let k = 0; k < NP * 2; k++) {
      pmtI[k] *= Math.exp(-dt * 3.2);
      pmtCol.copy(PMT_BASE).lerp(PMT_HOT, Math.min(1, pmtI[k]));
      pmts.setColorAt(k, pmtCol);
    }
    if (pmts.instanceColor) pmts.instanceColor.needsUpdate = true;
  }

  // =====================================================================
  // View 3: axion haloscope
  const ax = new THREE.Group();
  scene.add(ax);
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x55607e, metalness: 0.6, roughness: 0.4 });
  // Coils are cut away on the camera side so the cavity shows.
  const coilGeo = new THREE.TorusGeometry(2.3, 0.11, 10, 64, 1.5 * Math.PI);
  const coils = new THREE.Group();
  coils.rotation.y = 1.75 * Math.PI - Math.atan2(CAM.axion.pos[2], CAM.axion.pos[0]);
  ax.add(coils);
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Mesh(coilGeo, coilMat);
    c.rotation.x = Math.PI / 2;
    c.position.y = -2.5 + i * 0.5;
    coils.add(c);
  }
  stage.label('superconducting magnet, B ≈ 8 T', [-2.9, 2.9, 0], 'muted', ax);
  const axGap = Math.atan2(CAM.axion.pos[0], CAM.axion.pos[2]);
  const copper = new THREE.MeshStandardMaterial({ color: 0xc27a4a, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
  const cav = new THREE.Mesh(new THREE.CylinderGeometry(CAV_R, CAV_R, CAV_H, 64, 1, true, axGap + Math.PI / 4, 1.5 * Math.PI), copper);
  ax.add(cav);
  const capGeo = new THREE.CircleGeometry(CAV_R, 64);
  const capB = new THREE.Mesh(capGeo, copper);
  capB.rotation.x = -Math.PI / 2;
  capB.position.y = -CAV_H / 2;
  ax.add(capB);
  const cavGlowMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cavGlow = new THREE.Mesh(new THREE.CylinderGeometry(CAV_R * 0.96, CAV_R * 0.96, CAV_H * 0.97, 48, 1, false), cavGlowMat);
  ax.add(cavGlow);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, CAV_H * 0.97, 24), copper);
  ax.add(rod);
  const rodLabel = stage.label('tuning rod', [0, 0, 0], 'muted', ax);
  // Magnetic field lines
  const bPts: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = i % 2 ? 0.6 : 1.9;
    bPts.push(r * Math.sin(a), -2.8, r * Math.cos(a), r * Math.sin(a), 2.8, r * Math.cos(a));
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPts, 3));
  ax.add(new THREE.LineSegments(bGeo, new THREE.LineBasicMaterial({ color: 0x3f6fb8, transparent: true, opacity: 0.45 })));
  // Antenna and amplifier
  const antMat = new THREE.LineBasicMaterial({ color: 0x8391ab });
  ax.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, CAV_H / 2 - 0.5, 0), new THREE.Vector3(0, 3.6, 0)]), antMat));
  const ampMat = new THREE.MeshStandardMaterial({ color: 0x2e3a55, emissive: 0x000000, roughness: 0.5 });
  const amp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), ampMat);
  amp.position.y = 3.8;
  ax.add(amp);
  stage.label('antenna → quantum-limited amplifier', [0.2, 4.35, 0], 'muted', ax);
  const cavLabel = stage.label('', [3.4, -2.3, 1.2], '', ax);
  // Axion "fog" inside the cavity
  const N_AX = 260;
  const aPos = new Float32Array(N_AX * 3);
  const aPh = new Float32Array(N_AX);
  for (let i = 0; i < N_AX; i++) {
    const r = CAV_R * 0.9 * Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    aPos[i * 3] = r * Math.sin(a);
    aPos[i * 3 + 1] = (rng() - 0.5) * CAV_H * 0.9;
    aPos[i * 3 + 2] = r * Math.cos(a);
    aPh[i] = rng() * Math.PI * 2;
  }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  const aMat = new THREE.PointsMaterial({ color: PALETTE.violet, size: 0.09, map: glow, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const axPts = new THREE.Points(aGeo, aMat);
  ax.add(axPts);

  // Scan state
  let fAxion = 0;
  let fCav = SCAN.fLo;
  let scanning = false;
  let scanHi = SCAN.fHi;
  let axionFound = false;
  let foundF = 0;
  let bestSNR = 0;
  let bestBin = -1;
  const dwell = new Float64Array(NB);
  const meas = new Float64Array(NB);
  function hideAxion(): void {
    fAxion = 680 + rng() * 280;
    axionFound = false;
    foundF = 0;
    bestSNR = 0;
    bestBin = -1;
    dwell.fill(0);
    meas.fill(0);
    fCav = SCAN.fLo;
    scanning = false;
  }
  hideAxion();
  const binOf = (f: number) => Math.min(NB - 1, Math.max(0, Math.floor((f - SCAN.fLo) / SCAN.bin)));
  const snrOf = (b: number) => (dwell[b] > 0 ? meas[b] * SCAN.snrK * Math.sqrt(dwell[b]) : 0);

  function stepScan(dt: number): void {
    if (!scanning) return;
    let f = fCav;
    const fEnd = Math.min(scanHi, fCav + scanSpeed * dt);
    while (f < fEnd - 1e-9) {
      const b = binOf(f);
      const edge = Math.min(fEnd, SCAN.fLo + (b + 1) * SCAN.bin);
      const tIn = (edge - f) / scanSpeed;
      if (tIn > 0) {
        const fc = SCAN.fLo + (b + 0.5) * SCAN.bin;
        const sample = cavityResponse(fc, fAxion, SCAN.Qvis) + gauss(rng) / (SCAN.snrK * Math.sqrt(tIn));
        meas[b] = (meas[b] * dwell[b] + sample * tIn) / (dwell[b] + tIn);
        dwell[b] += tIn;
        const s = snrOf(b);
        if (s > bestSNR || b === bestBin) {
          bestSNR = 0;
          for (let k = 0; k < NB; k++) {
            const sk = snrOf(k);
            if (sk > bestSNR) { bestSNR = sk; bestBin = k; }
          }
        }
        if (s >= 5 && Math.abs(fc - fAxion) < 2) {
          axionFound = true;
          foundF = fc;
        }
      }
      f = edge;
    }
    fCav = fEnd;
    if (fCav >= scanHi - 1e-9) scanning = false;
  }

  function drawAxion(t: number): void {
    const u = (fCav - SCAN.fLo) / (SCAN.fHi - SCAN.fLo);
    const rr = 1.0 - 0.95 * u;
    rod.position.set(rr * Math.sin(axGap + Math.PI), 0, rr * Math.cos(axGap + Math.PI));
    rodLabel.position.set(rod.position.x, CAV_H / 2 + 0.25, rod.position.z);
    const resp = cavityResponse(fCav, fAxion, SCAN.Qvis);
    const pulse = 0.5 + 0.5 * Math.sin(t * 9);
    cavGlowMat.opacity = 0.04 + 0.55 * resp * (0.7 + 0.3 * pulse);
    cavGlowMat.color.set(resp > 0.2 ? PALETTE.amber : PALETTE.rose);
    ampMat.emissive.setRGB(0.9 * resp, 0.55 * resp, 0.1 * resp);
    aMat.opacity = 0.35 + 0.4 * resp;
    for (let i = 0; i < N_AX; i++) aPos[i * 3 + 1] += Math.sin(t * 0.8 + aPh[i]) * 0.002;
    (aGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const txt = `cavity tuned to ${fCav.toFixed(1)} MHz (m = ${axionMassUeV(fCav).toFixed(3)} μeV)`;
    if (cavLabel.element.textContent !== txt) cavLabel.element.textContent = txt;
  }

  // =====================================================================
  // Overlays
  const title = overlayBox({ left: '10px', top: '10px', maxWidth: '290px' });
  viewport.appendChild(title);
  const legend = overlayBox({ left: '10px', bottom: '34px', maxWidth: '280px' });
  legend.className = 'stage-overlay';
  viewport.appendChild(legend);
  const PW = 640;
  const PH = 430;
  const plot = insetCanvas(PW, PH, { right: '10px', top: '10px' });
  viewport.appendChild(plot);
  const g = plot.getContext('2d')!;
  const AW = 440;
  const AH = 180;
  const yearC = insetCanvas(AW, AH, { right: '10px', bottom: '34px' });
  yearC.className = 'stage-overlay';
  viewport.appendChild(yearC);
  const yg = yearC.getContext('2d')!;

  const sw = (col: number, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${css(col)}"></i>`;
  const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:2px">${t}</div>`;

  function paintOverlays(): void {
    if (view === 'halo') {
      title.innerHTML = head('The dark matter wind') + `<div>Sun moves at 232 km/s through the halo. Earth adds or subtracts up to 14.6 km/s.</div><div>${dateLabel(day)}: v_E = <b style="color:#dfe6f3">${vE.toFixed(1)} km/s</b></div>`;
      legend.innerHTML = head('In the scene') + [
        `${sw(PALETTE.violet)}halo WIMPs, Maxwellian v₀ = 220 km/s`,
        `${sw(PALETTE.amber, false)}Sun’s motion (toward Cygnus)`,
        `${sw(PALETTE.cyan, false)}Earth’s orbital velocity`,
        `${sw(PALETTE.violet, false)}wind felt on Earth (length ∝ speed)`,
        `<span style="color:#8391ab">Orbit tilted about 60° to the galactic plane</span>`,
      ].join('<br/>');
    } else if (view === 'tpc') {
      title.innerHTML = head('Dual-phase xenon TPC (toy, sped up)') + `<div>S1 light at the hit, electrons drift up, S2 light in the gas.</div><div>Fiducial cut ${cut.toFixed(0)} cm: ${bud.mFid.toFixed(2)} t of ${(7.03).toFixed(2)} t kept</div><div>Seen: ${nER} ER (${nERfid} inside), ${nNR} NR</div>`;
      legend.innerHTML = head('Events') + [
        `${sw(PALETTE.cyan)}electron recoil (gamma) inside the fiducial volume`,
        `${sw(0x6c7890)}electron recoil outside: cut away`,
        `${sw(PALETTE.amber)}nuclear recoil: less charge per light`,
        `${sw(0x9fc4ff)}drifting electrons`,
        `${sw(PALETTE.green, false)}fiducial volume`,
      ].join('<br/>');
    } else {
      title.innerHTML = head('Axion haloscope (toy)') + `<div>Resonance when f = m<sub>a</sub>c²/h. 1 μeV ↔ 241.8 MHz.</div><div>${scanning ? `Scanning at ${scanSpeed.toFixed(0)} MHz/s` : axionFound ? `<b style="color:${css(PALETTE.green)}">Axion found at ${foundF.toFixed(1)} MHz = ${axionMassUeV(foundF).toFixed(3)} μeV</b>` : 'Press Scan to sweep the cavity.'}</div>`;
      legend.innerHTML = head('In the scene') + [
        `${sw(0xc27a4a, false)}copper microwave cavity (cut away)`,
        `${sw(0x3f6fb8, false)}magnetic field lines`,
        `${sw(PALETTE.violet)}axion field (hidden mass)`,
        `${sw(PALETTE.amber)}glow: cavity on resonance, photons made`,
      ].join('<br/>');
    }
  }

  // Precomputed toy limit for 1 tonne-year; limits scale as 1 / exposure.
  const exclM = new Float64Array(N_EXCL);
  const exclS = new Float64Array(N_EXCL);
  for (let i = 0; i < N_EXCL; i++) {
    const m = 10 ** (0.5 + (3.5 * i) / (N_EXCL - 1));
    exclM[i] = m;
    exclS[i] = toyLimit(m, 1);
  }

  const X0 = 78;
  const X1 = PW - 20;
  const Y0 = 70;
  const Y1 = PH - 50;

  function frameTitle(t1: string, t2: string): void {
    g.clearRect(0, 0, PW, PH);
    g.font = '600 22px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText(t1, 16, 30);
    g.font = '16px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText(t2, 16, 54);
  }

  function drawSpectrum(): void {
    frameTitle('Recoil spectrum dR/dE_R (xenon)', `${mChi().toFixed(mChi() < 10 ? 1 : 0)} GeV, σ = ${fmtSig(sigma())} cm², ${dateLabel(day)}`);
    const EMAXP = 100;
    const pts: number[] = [];
    let ymax = 0;
    rp.mChi = mChi();
    rp.sigma = sigma();
    rp.halo.vE = vE;
    for (let i = 0; i <= 100; i++) {
      const E = 0.5 + (i / 100) * (EMAXP - 0.5);
      const r = dRdE(E, rp);
      pts.push(E, r);
      ymax = Math.max(ymax, r);
    }
    if (ymax <= 0) ymax = 1e-12;
    const top = Math.log10(ymax) + 0.4;
    const span = 4.5;
    const px = (E: number) => X0 + (E / EMAXP) * (X1 - X0);
    const py = (r: number) => Y1 - ((Math.log10(Math.max(r, 1e-300)) - (top - span)) / span) * (Y1 - Y0);
    // ROI shading
    g.fillStyle = 'rgba(94,227,154,0.08)';
    g.fillRect(px(ROI.lo), Y0, px(ROI.hi) - px(ROI.lo), Y1 - Y0);
    g.strokeStyle = '#1a2336';
    g.lineWidth = 1.5;
    g.fillStyle = '#8391ab';
    g.font = '16px JetBrains Mono, monospace';
    for (const E of [0, 20, 40, 60, 80, 100]) {
      g.beginPath();
      g.moveTo(px(E), Y0);
      g.lineTo(px(E), Y1);
      g.stroke();
      g.fillText(String(E), px(E) - 8, Y1 + 22);
    }
    g.fillText('E_R (keV)', X1 - 90, Y1 + 42);
    for (let k = Math.ceil(top - span); k <= Math.floor(top); k++) {
      g.beginPath();
      g.moveTo(X0, py(10 ** k));
      g.lineTo(X1, py(10 ** k));
      g.stroke();
      g.fillText(`1e${k}`, 10, py(10 ** k) + 6);
    }
    g.fillText('events / t / yr / keV', X0 + 6, Y0 - 2 + 18);
    g.save();
    g.beginPath();
    g.rect(X0, Y0, X1 - X0, Y1 - Y0);
    g.clip();
    g.strokeStyle = css(PALETTE.cyan);
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = px(pts[i]);
      const y = py(pts[i + 1]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    if (eMax < EMAXP) {
      g.strokeStyle = css(PALETTE.rose);
      g.setLineDash([7, 6]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px(eMax), Y0);
      g.lineTo(px(eMax), Y1);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    g.font = '16px JetBrains Mono, monospace';
    g.fillStyle = css(PALETTE.green);
    g.fillText(`window ${ROI.lo}-${ROI.hi} keV: ${rateNow < 0.01 ? rateNow.toExponential(1) : rateNow.toFixed(2)} /t/yr`, X0 + 10, Y1 - 12);
    g.fillStyle = css(PALETTE.rose);
    const eTxt = eMax < EMAXP ? `E_max ${eMax.toFixed(0)} keV` : `E_max ${eMax.toFixed(0)} keV →`;
    g.fillText(eTxt, Math.min(X1 - g.measureText(eTxt).width - 4, eMax < EMAXP ? px(eMax) + 6 : X1), Y0 + 22);
  }

  function drawExclusion(): void {
    frameTitle('Exclusion plot (illustrative)', `toy: 0 events, 0 background, ${exposure.toFixed(1)} t·yr active`);
    const LM0 = 0.5, LM1 = 4, LS0 = -50, LS1 = -42;
    const px = (m: number) => X0 + ((Math.log10(m) - LM0) / (LM1 - LM0)) * (X1 - X0);
    const py = (s: number) => Y1 - ((Math.log10(s) - LS0) / (LS1 - LS0)) * (Y1 - Y0);
    g.strokeStyle = '#1a2336';
    g.lineWidth = 1.5;
    g.fillStyle = '#8391ab';
    g.font = '16px JetBrains Mono, monospace';
    for (const m of [10, 100, 1000, 10000]) {
      g.beginPath();
      g.moveTo(px(m), Y0);
      g.lineTo(px(m), Y1);
      g.stroke();
      g.fillText(m >= 1000 ? `${m / 1000}k` : String(m), px(m) - 10, Y1 + 22);
    }
    g.fillText('m_χ (GeV)', X1 - 96, Y1 + 42);
    for (let k = LS0; k <= LS1; k += 2) {
      g.beginPath();
      g.moveTo(X0, py(10 ** k));
      g.lineTo(X1, py(10 ** k));
      g.stroke();
      g.fillText(`1e${k}`, 12, py(10 ** k) + 6);
    }
    g.fillText('σ_n (cm²)', X0 + 6, Y0 + 18);
    g.save();
    g.beginPath();
    g.rect(X0, Y0, X1 - X0, Y1 - Y0);
    g.clip();
    // Neutrino fog (schematic)
    g.fillStyle = 'rgba(167,139,250,0.22)';
    g.beginPath();
    g.moveTo(px(3), Y1);
    for (let i = 0; i <= 80; i++) {
      const m = 10 ** (LM0 + ((LM1 - LM0) * i) / 80);
      g.lineTo(px(m), py(fogSigma(m)));
    }
    g.lineTo(X1, Y1);
    g.closePath();
    g.fill();
    // Excluded region above the toy limit
    g.fillStyle = 'rgba(255,107,107,0.10)';
    g.beginPath();
    g.moveTo(px(exclM[0]), Y0);
    for (let i = 0; i < N_EXCL; i++) g.lineTo(px(exclM[i]), py(Math.min(1e-30, exclS[i] / exposure)));
    g.lineTo(X1, Y0);
    g.closePath();
    g.fill();
    g.strokeStyle = css(PALETTE.red);
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < N_EXCL; i++) {
      const y = py(Math.min(1e-30, exclS[i] / exposure));
      if (i === 0) g.moveTo(px(exclM[i]), y);
      else g.lineTo(px(exclM[i]), y);
    }
    g.stroke();
    g.restore();
    // Published best points
    const dot = (m: number, s: number, col: string, txt: string, dy: number) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(px(m), py(s), 6, 0, Math.PI * 2);
      g.fill();
      g.font = '15px JetBrains Mono, monospace';
      g.fillText(txt, px(m) + 10, py(s) + dy);
    };
    dot(40, 2.2e-48, '#ffffff', 'LZ 2024 best', 18);
    dot(30, 1.7e-47, '#b8c3d9', 'XENONnT 2025 best', -8);
    g.font = '15px JetBrains Mono, monospace';
    g.fillStyle = css(PALETTE.violet);
    g.fillText('neutrino fog (schematic)', X0 + 8, Y1 - 10);
    g.fillStyle = css(PALETTE.red);
    g.fillText('excluded by toy run', X1 - 196, Y0 + 20);
    // Current model
    const lim = toyLimitNow();
    const ok = sigma() < lim;
    g.strokeStyle = ok ? css(PALETTE.green) : css(PALETTE.amber);
    g.lineWidth = 3;
    const cx = px(mChi());
    const cy = py(Math.max(1e-50, sigma()));
    g.beginPath();
    g.moveTo(cx - 10, cy);
    g.lineTo(cx + 10, cy);
    g.moveTo(cx, cy - 10);
    g.lineTo(cx, cy + 10);
    g.stroke();
  }

  function toyLimitNow(): number {
    const lm = Math.log10(mChi());
    const f = ((lm - 0.5) / 3.5) * (N_EXCL - 1);
    const i = Math.max(0, Math.min(N_EXCL - 2, Math.floor(f)));
    const u = Math.max(0, Math.min(1, f - i));
    return 10 ** (Math.log10(exclS[i]) * (1 - u) + Math.log10(exclS[i + 1]) * u) / exposure;
  }

  function drawScan(): void {
    frameTitle('Haloscope scan: power excess', `${SCAN.bin} MHz bins, SNR ∝ √(dwell time)`);
    const px = (f: number) => X0 + ((f - SCAN.fLo) / (SCAN.fHi - SCAN.fLo)) * (X1 - X0);
    const SMAX = 10;
    const py = (s: number) => Y1 - ((s + 3) / (SMAX + 3)) * (Y1 - Y0);
    g.strokeStyle = '#1a2336';
    g.lineWidth = 1.5;
    g.fillStyle = '#8391ab';
    g.font = '16px JetBrains Mono, monospace';
    for (let f = 700; f <= 1000; f += 100) {
      g.beginPath();
      g.moveTo(px(f), Y0);
      g.lineTo(px(f), Y1);
      g.stroke();
      g.fillText(String(f), px(f) - 16, Y1 + 22);
      g.fillText(`${axionMassUeV(f).toFixed(2)}`, px(f) - 18, Y0 - 4);
    }
    g.fillText('f (MHz)', X1 - 76, Y1 + 42);
    g.fillText('μeV', X1 - 36, Y0 - 4);
    for (const s of [0, 5, 10]) {
      g.beginPath();
      g.moveTo(X0, py(s));
      g.lineTo(X1, py(s));
      g.stroke();
      g.fillText(`${s}σ`, 24, py(s) + 6);
    }
    g.strokeStyle = css(PALETTE.green);
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(X0, py(5));
    g.lineTo(X1, py(5));
    g.stroke();
    g.setLineDash([]);
    g.save();
    g.beginPath();
    g.rect(X0, Y0, X1 - X0, Y1 - Y0);
    g.clip();
    g.strokeStyle = css(PALETTE.cyan);
    g.lineWidth = 2;
    g.beginPath();
    let started = false;
    for (let b = 0; b < NB; b++) {
      if (dwell[b] <= 0) { started = false; continue; }
      const x = px(SCAN.fLo + (b + 0.5) * SCAN.bin);
      const y = py(Math.max(-3, Math.min(SMAX, snrOf(b))));
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
    // Cursor
    g.strokeStyle = css(PALETTE.amber);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(fCav), Y0);
    g.lineTo(px(fCav), Y1);
    g.stroke();
    if (axionFound) {
      g.fillStyle = css(PALETTE.green);
      g.font = '600 17px JetBrains Mono, monospace';
      const txt = `axion! ${foundF.toFixed(1)} MHz`;
      g.fillText(txt, Math.min(X1 - g.measureText(txt).width, px(foundF) + 8), py(8.6));
    } else if (bestSNR > 2.5 && bestBin >= 0) {
      g.fillStyle = css(PALETTE.amber);
      g.font = '16px JetBrains Mono, monospace';
      const f = SCAN.fLo + (bestBin + 0.5) * SCAN.bin;
      const txt = `bump ${bestSNR.toFixed(1)}σ: rescan?`;
      g.fillText(txt, Math.min(X1 - g.measureText(txt).width, px(f) + 8), py(Math.min(SMAX - 1, bestSNR) + 1));
    }
  }

  function drawPlot(): void {
    if (view === 'axion') drawScan();
    else if (inset === 'spectrum') drawSpectrum();
    else drawExclusion();
  }

  function drawYear(): void {
    yg.clearRect(0, 0, AW, AH);
    yg.font = '20px JetBrains Mono, monospace';
    yg.fillStyle = '#8391ab';
    yg.fillText('v_E over the year', 14, 28);
    const xa = 20, xb = AW - 20, ya = 50, yb = AH - 30;
    const px = (d: number) => xa + (d / 365) * (xb - xa);
    const py = (v: number) => yb - ((v - 214) / 36) * (yb - ya);
    yg.strokeStyle = '#243049';
    yg.lineWidth = 1;
    for (const v of [220, 232, 245]) {
      yg.beginPath();
      yg.moveTo(xa, py(v));
      yg.lineTo(xb, py(v));
      yg.stroke();
    }
    yg.fillStyle = '#56627c';
    yg.font = '16px JetBrains Mono, monospace';
    yg.fillText('Jan', px(0), AH - 8);
    yg.fillText('Jun', px(152) - 14, AH - 8);
    yg.fillText('Dec', px(334) - 20, AH - 8);
    yg.strokeStyle = css(PALETTE.cyan);
    yg.lineWidth = 3;
    yg.beginPath();
    for (let d = 0; d <= 365; d += 5) {
      const x = px(d);
      const y = py(earthSpeed(d));
      if (d === 0) yg.moveTo(x, y);
      else yg.lineTo(x, y);
    }
    yg.stroke();
    yg.fillStyle = css(PALETTE.amber);
    yg.beginPath();
    yg.arc(px(day), py(vE), 7, 0, Math.PI * 2);
    yg.fill();
    yg.fillStyle = '#dfe6f3';
    yg.font = '18px JetBrains Mono, monospace';
    yg.fillText(`${vE.toFixed(0)} km/s`, AW - 110, 28);
  }

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  const viewSel = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'halo', label: 'Halo wind' }, { value: 'tpc', label: 'Xenon TPC' }, { value: 'axion', label: 'Axion cavity' }],
    onChange: (v) => { view = v; applyView(true); },
  });
  const insetSel = ui.select<Inset>({
    key: 'inset', label: 'Corner plot', value: inset,
    options: [{ value: 'spectrum', label: 'Recoil spectrum' }, { value: 'exclusion', label: 'Exclusion plot' }],
    onChange: (v) => { inset = v; drawPlot(); },
  });

  ui.section('WIMP and halo');
  ui.slider({ key: 'mchi', label: 'WIMP mass m_χ', min: 0.5, max: 4, step: 0.01, value: logM, format: (v) => `${(10 ** v).toFixed(10 ** v < 10 ? 1 : 0)} GeV`, onInput: (v) => { logM = v; touchedMass = true; changed(); } });
  ui.slider({ key: 'sigma', label: 'Cross-section σ_n', min: -50, max: -42, step: 0.05, value: logSigma, format: (v) => `${fmtSig(10 ** v)} cm²`, onInput: (v) => { logSigma = v; changed(); } });
  ui.slider({ key: 'month', label: 'Month', min: 1, max: 365, step: 1, value: day, format: (v) => dateLabel(v), onInput: (v) => { day = v; touchedMonth = true; changed(); } });
  const rVE = ui.readout('vE', 'Earth speed v_E', 'km/s');
  const rMN = ui.readout('mN', 'xenon m_N', 'GeV');
  const rEmax = ui.readout('emax', 'E_max (v_esc + v_E)', 'keV');
  const rRatio = ui.readout('emaxRatio', 'E_max / heavy limit');
  const rRate = ui.readout('rate', 'rate 5-50 keV', '/t/yr');
  const rMod = ui.readout('mod', 'June vs Dec');

  ui.section('Detector');
  ui.slider({ key: 'exposure', label: 'Exposure (active mass × time)', min: 0.2, max: 20, step: 0.1, value: exposure, unit: 't·yr', onInput: (v) => { exposure = v; changed(); } });
  ui.slider({ key: 'cut', label: 'Fiducial cut from walls', min: 0, max: 30, step: 0.5, value: cut, unit: 'cm', onInput: (v) => { cut = v; applyCut(); changed(); } });
  const rFid = ui.readout('mFid', 'fiducial mass', 't');
  const rSig = ui.readout('signal', 'expected WIMPs');
  const rBgW = ui.readout('bgWall', 'wall background');
  const rBgU = ui.readout('bgUni', 'uniform background');
  const rLim = ui.readout('limit', 'toy 90% limit', 'cm²');

  ui.section('Axion haloscope');
  ui.slider({ key: 'scan', label: 'Scan speed', min: 1, max: 30, step: 0.5, value: scanSpeed, unit: 'MHz/s', onInput: (v) => { scanSpeed = v; } });
  const [scanBtn] = ui.buttons([
    { label: 'Scan', primary: true, key: 'scan', onClick: () => startScan() },
    { label: 'Rescan bump', key: 'scan', onClick: () => rescan() },
    { label: 'New hidden axion', key: 'hidden', onClick: () => { hideAxion(); drawPlot(); paintOverlays(); } },
  ]);
  const rFc = ui.readout('fc', 'cavity f', 'MHz');
  const rSNR = ui.readout('snr', 'best bump', 'σ');
  const rHid = ui.readout('hidden', 'hidden axion');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'electron recoil / spectrum' },
    { color: css(PALETTE.amber), label: 'nuclear recoil' },
    { color: css(PALETTE.violet), label: 'dark matter' },
  ]);

  function startScan(): void {
    if (view !== 'axion') { view = 'axion'; viewSel.set('axion', false); applyView(true); }
    if (scanning) { scanning = false; scanBtn.textContent = 'Scan'; return; }
    if (fCav >= SCAN.fHi - 1e-6) fCav = SCAN.fLo;
    scanHi = SCAN.fHi;
    scanning = true;
    scanBtn.textContent = 'Stop';
  }
  function rescan(): void {
    if (bestBin < 0) return;
    if (view !== 'axion') { view = 'axion'; viewSel.set('axion', false); applyView(true); }
    const f = SCAN.fLo + (bestBin + 0.5) * SCAN.bin;
    fCav = Math.max(SCAN.fLo, f - 6);
    scanHi = Math.min(SCAN.fHi, f + 6);
    scanning = true;
    scanBtn.textContent = 'Stop';
  }

  function updateReadouts(): void {
    rVE(vE.toFixed(1));
    rMN(MN.toFixed(1));
    rEmax(eMax < 1000 ? eMax.toFixed(1) : eMax.toFixed(0));
    rRatio(emaxRatio.toFixed(3));
    rRate(rateNow < 0.01 ? rateNow.toExponential(2) : rateNow.toFixed(3));
    rMod(`${modAmp >= 0 ? '+' : ''}${(modAmp * 100).toFixed(1)}%`);
    rFid(bud.mFid.toFixed(2));
    rSig(bud.signal < 0.01 ? bud.signal.toExponential(1) : bud.signal.toFixed(2));
    rBgW(bud.bgWall.toFixed(2));
    rBgU(bud.bgUniform.toFixed(2));
    rLim(fmtSig(toyLimitNow()));
    rFc(fCav.toFixed(1));
    rSNR(bestSNR.toFixed(1));
    rHid(axionFound ? `${axionMassUeV(fAxion).toFixed(3)} μeV` : '?');
    if (!scanning && scanBtn.textContent === 'Stop') scanBtn.textContent = 'Scan';
  }

  function changed(): void {
    recompute();
    drawHalo();
    drawPlot();
    drawYear();
    paintOverlays();
    updateReadouts();
  }

  function applyView(fly: boolean): void {
    halo.visible = view === 'halo';
    tpc.visible = view === 'tpc';
    ax.visible = view === 'axion';
    yearC.style.display = view === 'halo' ? '' : 'none';
    insetSel.el.style.opacity = view === 'axion' ? '0.45' : '1';
    if (view !== 'tpc') nrLabel.visible = false;
    if (fly) stage.flyTo(CAM[view].pos, CAM[view].target);
    drawPlot();
    paintOverlays();
  }

  // =====================================================================
  // Frame loop
  let slow = 0;
  stage.onFrame((dt, t) => {
    if (view === 'halo') {
      for (let i = 0; i < N_WIND; i++) {
        const k = i * 3;
        wPos[k] += wVel[k] * dt;
        wPos[k + 1] += wVel[k + 1] * dt;
        wPos[k + 2] += wVel[k + 2] * dt;
        if (wPos[k] > WIND_BOX) wPos[k] -= 2 * WIND_BOX;
        else if (wPos[k] < -WIND_BOX) wPos[k] += 2 * WIND_BOX;
        if (wPos[k + 1] > WIND_BOX * 0.6) wPos[k + 1] -= 1.2 * WIND_BOX;
        else if (wPos[k + 1] < -WIND_BOX * 0.6) wPos[k + 1] += 1.2 * WIND_BOX;
        if (wPos[k + 2] < -WIND_BOX) wPos[k + 2] += 2 * WIND_BOX;
        else if (wPos[k + 2] > WIND_BOX) wPos[k + 2] -= 2 * WIND_BOX;
      }
      (windGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      sunGlow.material.opacity = 0.7 + 0.1 * Math.sin(t * 2);
    } else if (view === 'tpc') {
      stepTPC(dt);
    } else {
      stepScan(dt);
      drawAxion(t);
    }
    slow += dt;
    if (slow > 0.2) {
      slow = 0;
      if (view === 'axion') drawPlot();
      if (view !== 'halo') paintOverlays();
      updateReadouts();
    }
  });

  applyCut();
  changed();
  applyView(false);

  return {
    state: () => ({
      view,
      inset,
      day,
      touchedMonth,
      touchedMass,
      mChi: mChi(),
      sigma: sigma(),
      vE,
      rateNow,
      rateMaxYear,
      modAmp,
      eMax,
      emaxRatio,
      exposure,
      cut,
      mFid: bud.mFid,
      signal: bud.signal,
      bgWall: bud.bgWall,
      bgUniform: bud.bgUniform,
      fCavity: fCav,
      scanning,
      bestSNR,
      axionFound,
    }),
    dispose: () => {
      title.remove();
      legend.remove();
      plot.remove();
      yearC.remove();
      glow.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'hunting-dark-matter',
  number: 80,
  title: 'Hunting Dark Matter',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'Xenon tanks, radio cavities and colliders, and what they have ruled out.',
  content,
  mount,
};

export default topic;
