import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  createFly,
  elements,
  energy2B,
  fanArea,
  flybyStart,
  hohmann,
  keplerPeriod,
  keplerState,
  patchedConic,
  runFly,
  sampleOrbit,
  speedAtOrbit,
  step2B,
  helioEnergy,
  TAU,
  type Elements,
  type FlybyParams,
  type PatchedConic,
} from './physics.ts';

type View = 'kepler' | 'hohmann' | 'slingshot';
type Frame = 'both' | 'sun' | 'planet';

const DEG = Math.PI / 180;
/** World units per orbit unit in the Kepler and Hohmann views. */
const S = 2;
/** Equal-time slices per orbit, and triangles per slice. */
const N_SLICE = 12;
const SUB = 64;
const N_PTS = N_SLICE * SUB;
/** Planet/Sun mass ratio (Jupiter is 9.5e-4) and planet radius in orbit units (Jupiter: 9.2e-5). */
const Q = 1e-3;
const R_PLANET = 1e-4;
/** Planet angle at closest approach: top of the Sun-frame panel. */
const PHI = Math.PI / 2;
/** Where the velocity triangle is drawn in the Sun frame (orbit units). */
const VEC_AT: [number, number] = [0.6, -0.5];
const FLY_CAP = 40000;
const ETA = 0.01;
const HMAX = 2e-3;
/** km/s per speed unit if the inner orbit is 1 AU (Earth's orbital speed). */
const KMS = 29.78;
const INSET_N = 900;

const SUN_COL = 0xffd98a;
const PLANET_COL = PALETTE.violet;
const PROBE_COL = PALETTE.amber;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A polyline with fixed capacity whose points are rewritten in place. */
class DynLine {
  readonly line: THREE.Line;
  readonly pos: Float32Array;
  constructor(cap: number, color: number, opacity: number, dashed = false, loop = false) {
    this.pos = new Float32Array(cap * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setDrawRange(0, 0);
    const m = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.08, gapSize: 0.06 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    this.line = loop ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
    this.line.frustumCulled = false;
  }
  /** Set point i from orbit-plane coordinates (x, y) → local (x, 0, −y). */
  set(i: number, x: number, y: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = 0;
    this.pos[i * 3 + 2] = -y;
  }
  commit(n: number): void {
    const g = this.line.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.computeBoundingSphere();
    if (this.line.material instanceof THREE.LineDashedMaterial) this.line.computeLineDistances();
  }
}

function circle(r: number, color: number, opacity: number, dashed = false): DynLine {
  const n = 180;
  const d = new DynLine(n, color, opacity, dashed, true);
  for (let i = 0; i < n; i++) d.set(i, r * Math.cos((i / n) * TAU), r * Math.sin((i / n) * TAU));
  d.commit(n);
  return d;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 9.5, 4.2], target: [0, 0, 0], fov: 45, far: 400 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'kepler';
  let frame: Frame = 'both';
  let speed = 1;
  let playing = true;
  let showTrails = true;
  let touched = false;
  // Kepler
  let kA = 1;
  let kE = 0.5;
  // Hohmann
  let r2 = 1.52;
  let auto = true;
  // Slingshot
  let vInf = 0.35;
  let approach = 90; // degrees from the planet's velocity
  let rpK = 10; // periapsis in planet radii
  let turn: 1 | -1 = -1;

  const glowTex = glowTexture();
  const sphereGeo = new THREE.SphereGeometry(1, 32, 20);

  const grid = makeGrid(40, 40);
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = -0.03;
  scene.add(grid);

  function makeBody(color: number, r: number, glow: number, parent: THREE.Object3D, emissive = 0.5): THREE.Object3D {
    const h = new THREE.Object3D();
    const core = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.4 }));
    core.scale.setScalar(r);
    h.add(core);
    if (glow > 0) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sp.scale.setScalar(glow);
      h.add(sp);
    }
    parent.add(h);
    return h;
  }

  const tmpDir = new THREE.Vector3();
  function makeArrow(color: number, parent: THREE.Object3D): THREE.ArrowHelper {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color, 0.18, 0.1);
    parent.add(a);
    return a;
  }
  /** Point an arrow along orbit-plane vector (vx, vy) with a given world length. */
  function aim(a: THREE.ArrowHelper, vx: number, vy: number, len: number, head = 0.16): void {
    const L = Math.hypot(vx, vy);
    if (L < 1e-12 || len < 1e-4) {
      a.visible = false;
      return;
    }
    a.visible = true;
    tmpDir.set(vx / L, 0, -vy / L);
    a.setDirection(tmpDir);
    const hl = Math.min(head, len * 0.4);
    a.setLength(len, hl, hl * 0.6);
  }

  // =====================================================================
  // Kepler view
  const kGroup = new THREE.Group();
  kGroup.scale.setScalar(S);
  scene.add(kGroup);
  makeBody(SUN_COL, 0.07, 0.6, kGroup, 1.2);
  stage.label('Sun', [0, 0, 0.14], 'muted', kGroup);
  kGroup.add(circle(1, PLANET_COL, 0.35, true).line);
  const kPlanet = makeBody(PLANET_COL, 0.04, 0.22, kGroup);
  stage.label('planet, a = 1', [0, 0, 0.11], 'muted', kPlanet);
  const kProbe = makeBody(PROBE_COL, 0.035, 0.24, kGroup, 0.8);
  const kVel = makeArrow(PROBE_COL, kProbe);
  const kOrbit = new DynLine(N_PTS + 1, PALETTE.text, 0.35);
  kGroup.add(kOrbit.line);
  const kRadius = new DynLine(2, PALETTE.white, 0.7);
  kGroup.add(kRadius.line);
  const kTrail = new Trail(700, PROBE_COL, 0.95);
  kGroup.add(kTrail.line);
  // Wedges: one triangle per sub-step, from the Sun to consecutive orbit points.
  const wedgePos = new Float32Array(N_PTS * 9);
  const wedgeCol = new Float32Array(N_PTS * 9);
  const wedgeGeo = new THREE.BufferGeometry();
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(wedgePos, 3));
  wedgeGeo.setAttribute('color', new THREE.BufferAttribute(wedgeCol, 3));
  const wedges = new THREE.Mesh(wedgeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
  wedges.position.y = -0.005;
  wedges.frustumCulled = false;
  kGroup.add(wedges);
  const labA1 = stage.label('A₁', [0, 0, 0], '', kGroup);
  const labA2 = stage.label('A₂', [0, 0, 0], '', kGroup);
  const labPeri = stage.label('perihelion', [0, 0, 0], 'muted', kGroup);
  const labApo = stage.label('aphelion', [0, 0, 0], 'muted', kGroup);

  const kPts = new Float64Array((N_PTS + 1) * 2);
  const kS = new Float64Array(4);
  let kT = TAU;
  let kt = 0;
  let kE0 = 0;
  let kDrift = 0;
  let area1 = 0;
  let area2 = 0;
  let areaRatio = 1;
  let kPrevY = 0;
  let kLastPeri = NaN;
  let kTmeas = NaN;
  let kPeriCount = 0;

  function resetKepler(): void {
    kT = keplerPeriod(1, kA);
    sampleOrbit(1, kA, kE, N_PTS, 16, N_SLICE, kPts);
    area1 = fanArea(kPts, 0, SUB);
    const h0 = (N_SLICE / 2) * SUB;
    area2 = fanArea(kPts, h0, h0 + SUB);
    areaRatio = area1 / area2;
    for (let i = 0; i <= N_PTS; i++) kOrbit.set(i, kPts[i * 2], kPts[i * 2 + 1]);
    kOrbit.commit(N_PTS + 1);
    const cA = new THREE.Color(PALETTE.cyan);
    const cB = new THREE.Color(PALETTE.rose);
    for (let k = 0; k < N_PTS; k++) {
      const slice = Math.floor(k / SUB);
      const hi = slice === 0 || slice === N_SLICE / 2;
      const c = slice % 2 === 0 ? cA : cB;
      const f = hi ? 0.95 : 0.32;
      const o = k * 9;
      wedgePos[o] = 0;
      wedgePos[o + 1] = 0;
      wedgePos[o + 2] = 0;
      wedgePos[o + 3] = kPts[k * 2];
      wedgePos[o + 4] = 0;
      wedgePos[o + 5] = -kPts[k * 2 + 1];
      wedgePos[o + 6] = kPts[k * 2 + 2];
      wedgePos[o + 7] = 0;
      wedgePos[o + 8] = -kPts[k * 2 + 3];
      for (let j = 0; j < 3; j++) {
        wedgeCol[o + j * 3] = c.r * f;
        wedgeCol[o + j * 3 + 1] = c.g * f;
        wedgeCol[o + j * 3 + 2] = c.b * f;
      }
    }
    (wedgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (wedgeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // Labels at the wedge centroids (2/3 of the way out along the middle ray).
    const mid1 = SUB / 2;
    const mid2 = h0 + SUB / 2;
    labA1.position.set(kPts[mid1 * 2] * 0.62, 0, -kPts[mid1 * 2 + 1] * 0.62);
    labA2.position.set(kPts[mid2 * 2] * 0.62, 0, -kPts[mid2 * 2 + 1] * 0.62);
    labPeri.position.set(kA * (1 - kE) + 0.12, 0, -0.14);
    labApo.position.set(-kA * (1 + kE) - 0.1, 0, 0.12);
    // Probe starts at perihelion, planet at the same angle.
    keplerState(1, kA, kE, 0, kS);
    kE0 = energy2B(kS, 1);
    kt = 0;
    kDrift = 0;
    kPrevY = 0;
    kLastPeri = 0;
    kTmeas = NaN;
    kPeriCount = 0;
    kTrail.clear();
    placeKepler();
    resetInset();
    needFit = true;
  }

  function placeKepler(): void {
    kProbe.position.set(kS[0], 0, -kS[1]);
    kPlanet.position.set(Math.cos(kt), 0, -Math.sin(kt));
    kRadius.set(0, 0, 0);
    kRadius.set(1, kS[0], kS[1]);
    kRadius.commit(2);
    const v = Math.hypot(kS[2], kS[3]);
    aim(kVel, kS[2], kS[3], (0.16 * v) / S + 0.04, 0.08);
  }

  function advanceKepler(simDt: number): void {
    const h = Math.min(2e-3, kT / 20000);
    const n = Math.max(1, Math.ceil(simDt / h));
    const hh = simDt / n;
    for (let i = 0; i < n; i++) {
      kPrevY = kS[1];
      step2B(kS, 1, hh);
      kt += hh;
      if (kPrevY < 0 && kS[1] >= 0 && kS[0] > 0) {
        const tc = kt - (hh * kS[1]) / (kS[1] - kPrevY);
        kPeriCount++;
        kTmeas = tc - kLastPeri;
        kLastPeri = tc;
      }
    }
    kDrift = Math.abs((energy2B(kS, 1) - kE0) / kE0);
    if (showTrails) kTrail.push(kS[0], 0, -kS[1]);
  }

  // =====================================================================
  // Hohmann view
  const hGroup = new THREE.Group();
  hGroup.scale.setScalar(S);
  scene.add(hGroup);
  makeBody(SUN_COL, 0.07, 0.6, hGroup, 1.2);
  hGroup.add(circle(1, PALETTE.cyan, 0.5).line);
  const hOuter = circle(1, PLANET_COL, 0.55);
  hGroup.add(hOuter.line);
  const hTransferHolder = new THREE.Group();
  hGroup.add(hTransferHolder);
  const hTransfer = new DynLine(181, PROBE_COL, 0.75, true);
  hTransferHolder.add(hTransfer.line);
  const hPlanet = makeBody(PLANET_COL, 0.045, 0.25, hGroup);
  stage.label('target planet', [0, 0, 0.11], 'muted', hPlanet);
  const hProbe = makeBody(PROBE_COL, 0.035, 0.24, hGroup, 0.8);
  const hVel = makeArrow(PROBE_COL, hProbe);
  const hTrail = new Trail(900, PROBE_COL, 0.95);
  hGroup.add(hTrail.line);
  const burnMarks: THREE.Object3D[] = [];
  const burnLabels: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) {
    const m = makeBody(PALETTE.green, 0.022, 0.18, hGroup, 1);
    burnMarks.push(m);
    burnLabels.push(stage.label(i === 0 ? 'burn 1' : 'burn 2', [0, 0, 0.1], '', m));
  }
  const labInner = stage.label('start orbit r₁ = 1', [0, 0, 0], 'muted', hGroup);
  const labOuter = stage.label('target orbit r₂', [0, 0, 0], 'muted', hGroup);

  const hS = new Float64Array(4);
  let hm = hohmann(1, 1, r2);
  let ht = 0;
  let hPhase: 'parked' | 'transfer' | 'arrived' = 'parked';
  let hPlanet0 = 0;
  let hPrevRV = 0;
  let hFinal: Elements = { a: 0, e: 0, energy: 0, h: 0, omega: 0 };
  let hDone = false;
  let hGap = NaN;
  let hLead = 0;

  function drawTransfer(): void {
    // Transfer ellipse with periapsis on +x (local frame), rotated to the burn point.
    const aT = hm.aT;
    const e = (r2 - 1) / (r2 + 1);
    const p = aT * (1 - e * e);
    for (let i = 0; i <= 180; i++) {
      const nu = (i / 180) * Math.PI;
      const r = p / (1 + e * Math.cos(nu));
      hTransfer.set(i, r * Math.cos(nu), r * Math.sin(nu));
    }
    hTransfer.commit(181);
  }

  function resetHohmann(): void {
    hm = hohmann(1, 1, r2);
    hOuter.line.scale.setScalar(r2);
    labInner.position.set(0.72, 0, 0.72);
    labOuter.position.set(-r2 * 0.72, 0, r2 * 0.72 + 0.08);
    drawTransfer();
    hS[0] = 1;
    hS[1] = 0;
    hS[2] = 0;
    hS[3] = 1;
    ht = 0;
    hPhase = 'parked';
    // Planet starts a little ahead of the launch window so the wait is short.
    hPlanet0 = hm.phase + 0.6;
    hPrevRV = 0;
    hLead = 0.6;
    fireBtn.textContent = 'Fire burn 1';
    hDone = false;
    hGap = NaN;
    hFinal = { a: 0, e: 0, energy: 0, h: 0, omega: 0 };
    burnMarks.forEach((m) => (m.visible = false));
    hTrail.clear();
    placeHohmann();
    resetInset();
    needFit = true;
  }

  const probeAngle = () => Math.atan2(hS[1], hS[0]);
  const planetAngle = () => hPlanet0 + ht / Math.pow(r2, 1.5);
  const wrapPi = (x: number) => x - TAU * Math.floor((x + Math.PI) / TAU);

  const burnLabel = (): string => (hPhase === 'parked' ? 'Fire burn 1' : hPhase === 'transfer' ? 'Fire burn 2' : 'Arrived');

  function burn(): void {
    if (hPhase === 'arrived') return;
    const v = Math.hypot(hS[2], hS[3]);
    const dv = hPhase === 'parked' ? hm.dv1 : hm.dv2;
    hS[2] *= (v + dv) / v;
    hS[3] *= (v + dv) / v;
    const m = burnMarks[hPhase === 'parked' ? 0 : 1];
    m.visible = true;
    m.position.set(hS[0], 0, -hS[1]);
    if (hPhase === 'parked') {
      hPhase = 'transfer';
      hPrevRV = hS[0] * hS[2] + hS[1] * hS[3];
    } else {
      hPhase = 'arrived';
      elements(1, hS[0], hS[1], hS[2], hS[3], hFinal);
      hDone = hFinal.e < 0.03 && Math.abs(hFinal.a / r2 - 1) < 0.03;
      const pa = planetAngle();
      hGap = Math.hypot(hS[0] - r2 * Math.cos(pa), hS[1] - r2 * Math.sin(pa));
    }
    fireBtn.textContent = burnLabel();
  }

  function advanceHohmann(simDt: number): void {
    const h = 2e-3;
    const n = Math.max(1, Math.ceil(simDt / h));
    const hh = simDt / n;
    for (let i = 0; i < n; i++) {
      step2B(hS, 1, hh);
      ht += hh;
      if (hPhase === 'parked') {
        const lead = wrapPi(planetAngle() - probeAngle() - hm.phase);
        if (auto && hLead > 0 && lead <= 0 && lead > -0.5) burn();
        hLead = lead;
      } else if (hPhase === 'transfer') {
        const rv = hS[0] * hS[2] + hS[1] * hS[3];
        if (auto && hPrevRV > 0 && rv <= 0) burn();
        hPrevRV = rv;
      }
    }
    if (showTrails) hTrail.push(hS[0], 0, -hS[1]);
  }

  function placeHohmann(): void {
    hProbe.position.set(hS[0], 0, -hS[1]);
    const pa = planetAngle();
    hPlanet.position.set(r2 * Math.cos(pa), 0, -r2 * Math.sin(pa));
    if (hPhase === 'parked') hTransferHolder.rotation.y = probeAngle();
    hTransferHolder.visible = hPhase !== 'arrived' || !hDone;
    const v = Math.hypot(hS[2], hS[3]);
    aim(hVel, hS[2], hS[3], 0.18 * v + 0.04, 0.08);
  }

  // =====================================================================
  // Slingshot view: Sun frame (left) and planet frame (right)
  const fGroup = new THREE.Group();
  scene.add(fGroup);
  const sunFrame = new THREE.Group();
  const plFrame = new THREE.Group();
  fGroup.add(sunFrame, plFrame);
  makeBody(SUN_COL, 0.08, 0.7, sunFrame, 1.2);
  stage.label('Sun', [0, 0, 0.16], 'muted', sunFrame);
  sunFrame.add(circle(1, PLANET_COL, 0.35, true).line);
  const sfPlanet = makeBody(PLANET_COL, 0.04, 0.24, sunFrame);
  const sfProbe = makeBody(PROBE_COL, 0.03, 0.2, sunFrame, 0.8);
  const sfPath = new DynLine(FLY_CAP, PROBE_COL, 0.28);
  sunFrame.add(sfPath.line);
  const sfGhost = new DynLine(1200, 0x8391ab, 0.55, true);
  sunFrame.add(sfGhost.line);
  const sfTrail = new Trail(1200, PROBE_COL, 1);
  sunFrame.add(sfTrail.line);
  const sfVel = makeArrow(PROBE_COL, sfProbe);
  // Velocity triangle at the encounter point: V = V_planet + v∞
  const vecGroup = new THREE.Group();
  sunFrame.add(vecGroup);
  const aVp = makeArrow(PALETTE.green, vecGroup);
  const aVin = makeArrow(0xb08a4a, vecGroup);
  const aVout = makeArrow(PROBE_COL, vecGroup);
  const dIn = new DynLine(2, PALETTE.cyan, 0.7, true);
  const dOut = new DynLine(2, PALETTE.cyan, 0.9, true);
  vecGroup.add(dIn.line, dOut.line);
  stage.label('velocities at the flyby', [0.2, 0, 0.2], 'muted', vecGroup);
  const labVin = stage.label('V in', [0, 0, 0], 'muted', vecGroup);
  const labVout = stage.label('V out', [0, 0, 0], '', vecGroup);
  const labSun = stage.label('Sun frame: speed rises', [0, 0, 0], 'big', fGroup);

  const WR = 2.3; // world radius of the planet-frame window
  const pfRing = circle(WR, PALETTE.cyan, 0.4);
  plFrame.add(pfRing.line);
  const pfPlanet = makeBody(PLANET_COL, 1, 0, plFrame, 0.35);
  const pfPlanetCore = pfPlanet.children[0] as THREE.Mesh;
  const pfProbe = makeBody(PALETTE.cyan, 0.05, 0.3, plFrame, 0.8);
  const pfPath = new DynLine(FLY_CAP, PALETTE.cyan, 0.3);
  plFrame.add(pfPath.line);
  const pfTrail = new Trail(1500, PALETTE.cyan, 1);
  plFrame.add(pfTrail.line);
  const pfVel = makeArrow(PALETTE.cyan, pfProbe);
  const pfIn = makeArrow(PALETTE.cyan, plFrame);
  const pfOut = makeArrow(PALETTE.cyan, plFrame);
  const pfPlanetV = makeArrow(PALETTE.green, plFrame);
  pfPlanetV.position.set(WR * 0.95, 0, -WR * 0.9);
  const labPf = stage.label('Planet frame: speed in = speed out', [0, 0, 0], 'big', fGroup);
  stage.label('planet velocity', [WR * 0.95 - 0.35, 0, -WR * 0.9 - 0.22], 'muted', plFrame);
  const labIn = stage.label('in', [0, 0, 0], 'muted', plFrame);
  const labOut = stage.label('out', [0, 0, 0], 'muted', plFrame);

  // Precomputed flyby (every integrator step).
  const fT = new Float64Array(FLY_CAP);
  const fPx = new Float64Array(FLY_CAP);
  const fPy = new Float64Array(FLY_CAP);
  const fQx = new Float64Array(FLY_CAP);
  const fQy = new Float64Array(FLY_CAP);
  const fVx = new Float64Array(FLY_CAP);
  const fVy = new Float64Array(FLY_CAP);
  const fUx = new Float64Array(FLY_CAP);
  const fUy = new Float64Array(FLY_CAP);
  let fN = 0;
  let tau = 0.7;
  let rWin = 0.01;
  let pfScale = 1;
  let pc: PatchedConic = patchedConic(flyParams());
  let E0 = 0;
  let E1 = 0;
  let gain = 0;
  let gainPc = 0;
  let dEerr = 0;
  let uIn = 0;
  let uOut = 0;
  let iEnter = 0;
  let iExit = 0;
  let fIdx = 0;
  let ft = 0;
  let fHold = 0;
  let flyDone = false;
  let fBase = 0.2;
  let relPeak = 1;
  let helioMax = 1;
  const fly = createFly(Q);

  function flyParams(): FlybyParams {
    return { q: Q, vInf, thetaIn: approach * DEG, rp: rpK * R_PLANET, turn, phi: PHI };
  }

  function record(): void {
    if (fN >= FLY_CAP) return;
    const { x, v, t } = fly;
    fT[fN] = t;
    fPx[fN] = x[4] - x[0];
    fPy[fN] = x[5] - x[1];
    fQx[fN] = x[2] - x[0];
    fQy[fN] = x[3] - x[1];
    fVx[fN] = v[4] - v[0];
    fVy[fN] = v[5] - v[1];
    fUx[fN] = v[4] - v[2];
    fUy[fN] = v[5] - v[3];
    fN++;
  }

  function resetSlingshot(): void {
    const p = flyParams();
    pc = patchedConic(p);
    tau = Math.max(0.5, 0.25 / vInf);
    flybyStart(fly, p, pc, tau, ETA, HMAX);
    fN = 0;
    E0 = helioEnergy(fly);
    record();
    runFly(fly, tau, ETA, HMAX, record);
    E1 = helioEnergy(fly);
    gain = speedAtOrbit(E1) / speedAtOrbit(E0) - 1;
    gainPc = Math.hypot(pc.VOut[0], pc.VOut[1]) / Math.hypot(pc.VIn[0], pc.VIn[1]) - 1;
    dEerr = (E1 - E0) / pc.dE - 1;
    // Planet-frame window: big enough to show the bend.
    rWin = Math.min(0.06, 4 * Math.max(p.rp, pc.b));
    pfScale = WR / rWin;
    iEnter = -1;
    iExit = fN - 1;
    relPeak = 0;
    helioMax = 0;
    for (let i = 0; i < fN; i++) {
      const d = Math.hypot(fPx[i] - fQx[i], fPy[i] - fQy[i]);
      if (d < rWin && iEnter < 0) iEnter = i;
      if (d < rWin) iExit = i;
      relPeak = Math.max(relPeak, Math.hypot(fUx[i], fUy[i]));
      helioMax = Math.max(helioMax, Math.hypot(fVx[i], fVy[i]));
    }
    if (iEnter < 0) iEnter = 0;
    uIn = Math.hypot(fUx[iEnter], fUy[iEnter]);
    uOut = Math.hypot(fUx[iExit], fUy[iExit]);
    // Sun-frame full path.
    for (let i = 0; i < fN; i++) sfPath.set(i, fPx[i], fPy[i]);
    sfPath.commit(fN);
    // Path with no planet: Kepler orbit from the start state.
    const g = new Float64Array([fPx[0], fPy[0], fVx[0], fVy[0]]);
    const nG = 1200;
    const hG = (2 * tau) / (nG - 1) / 8;
    for (let i = 0; i < nG; i++) {
      sfGhost.set(i, g[0], g[1]);
      for (let k = 0; k < 8; k++) step2B(g, 1, hG);
    }
    sfGhost.commit(nG);
    // Planet-frame path inside the window.
    let m = 0;
    for (let i = iEnter; i <= iExit; i++) pfPath.set(m++, (fPx[i] - fQx[i]) * pfScale, (fPy[i] - fQy[i]) * pfScale);
    pfPath.commit(m);
    const Rp = Math.min(Math.max(R_PLANET * pfScale, 0.06), 0.7 * p.rp * pfScale);
    pfPlanetCore.scale.setScalar(Rp);
    // Asymptote arrows at the window edge.
    const ex = (fPx[iEnter] - fQx[iEnter]) * pfScale;
    const ey = (fPy[iEnter] - fQy[iEnter]) * pfScale;
    const xx = (fPx[iExit] - fQx[iExit]) * pfScale;
    const xy = (fPy[iExit] - fQy[iExit]) * pfScale;
    pfIn.position.set(ex, 0.01, -ey);
    aim(pfIn, fUx[iEnter], fUy[iEnter], 0.7, 0.2);
    pfOut.position.set(xx, 0.01, -xy);
    aim(pfOut, fUx[iExit], fUy[iExit], 0.7, 0.2);
    labIn.position.set(ex * 1.1, 0, -ey * 1.1);
    labOut.position.set(xx * 1.1, 0, -xy * 1.1);
    aim(pfPlanetV, pc.Vp[0], pc.Vp[1], 0.7, 0.2);
    paintLegend();
    // Velocity triangle at the encounter point.
    const VS = 0.6;
    vecGroup.position.set(VEC_AT[0], 0.01, -VEC_AT[1]);
    aim(aVp, pc.Vp[0], pc.Vp[1], VS * Math.hypot(...pc.Vp), 0.1);
    aim(aVin, pc.VIn[0], pc.VIn[1], VS * Math.hypot(...pc.VIn), 0.1);
    aim(aVout, pc.VOut[0], pc.VOut[1], VS * Math.hypot(...pc.VOut), 0.1);
    dIn.set(0, VS * pc.Vp[0], VS * pc.Vp[1]);
    dIn.set(1, VS * pc.VIn[0], VS * pc.VIn[1]);
    dIn.commit(2);
    dOut.set(0, VS * pc.Vp[0], VS * pc.Vp[1]);
    dOut.set(1, VS * pc.VOut[0], VS * pc.VOut[1]);
    dOut.commit(2);
    labVin.position.set(VS * pc.VIn[0] * 1.2, 0, -VS * pc.VIn[1] * 1.2);
    labVout.position.set(VS * pc.VOut[0] * 1.2, 0, -VS * pc.VOut[1] * 1.2);
    fBase = (2 * tau) / 6;
    restartFly();
    flyDone = false;
    needFit = true;
  }

  function restartFly(): void {
    fIdx = 0;
    ft = fT[0];
    fHold = 0;
    sfTrail.clear();
    pfTrail.clear();
    resetInset();
    placeFly();
  }

  let fPrevX = 0;
  let fPrevY = 0;
  function placeFly(): void {
    const i = fIdx;
    const j = Math.min(fN - 1, i + 1);
    const u = fT[j] > fT[i] ? Math.min(1, Math.max(0, (ft - fT[i]) / (fT[j] - fT[i]))) : 0;
    const px = fPx[i] + (fPx[j] - fPx[i]) * u;
    const py = fPy[i] + (fPy[j] - fPy[i]) * u;
    const qx = fQx[i] + (fQx[j] - fQx[i]) * u;
    const qy = fQy[i] + (fQy[j] - fQy[i]) * u;
    sfProbe.position.set(px, 0, -py);
    sfPlanet.position.set(qx, 0, -qy);
    aim(sfVel, fVx[i], fVy[i], 0.42 * Math.hypot(fVx[i], fVy[i]), 0.1);
    const rx = (px - qx) * pfScale;
    const ry = (py - qy) * pfScale;
    const d = Math.hypot(rx, ry);
    if (d > WR) {
      pfProbe.position.set((rx / d) * WR, 0, (-ry / d) * WR);
      pfProbe.scale.setScalar(0.6);
      pfVel.visible = false;
    } else {
      pfProbe.position.set(rx, 0, -ry);
      pfProbe.scale.setScalar(1);
      const us = Math.hypot(fUx[i], fUy[i]);
      aim(pfVel, fUx[i], fUy[i], Math.min(1.4, (0.55 * us) / vInf), 0.16);
    }
    if (showTrails) {
      const sx = px - fPrevX;
      const sy = py - fPrevY;
      if (sx * sx + sy * sy > 1e-5 || fIdx === 0) {
        sfTrail.push(px, 0, -py);
        fPrevX = px;
        fPrevY = py;
      }
      if (d <= WR) pfTrail.push(rx, 0, -ry);
    }
  }

  function advanceFly(dt: number): void {
    if (ft >= fT[fN - 1]) {
      fHold += dt;
      if (fHold > 2.5) restartFly();
      return;
    }
    const i = fIdx;
    const d = Math.hypot(fPx[i] - fQx[i], fPy[i] - fQy[i]);
    const us = Math.hypot(fUx[i], fUy[i]);
    const rate = Math.min(fBase, (2 * d) / us);
    ft = Math.min(fT[fN - 1], ft + rate * dt * speed);
    while (fIdx < fN - 1 && fT[fIdx + 1] <= ft) fIdx++;
    if (fIdx >= iExit && !flyDone) flyDone = true;
    placeFly();
  }

  // =====================================================================
  // Inset: probe speed over time
  const spark = document.createElement('canvas');
  spark.width = 460;
  spark.height = 200;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '100px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const insA = new Float32Array(INSET_N);
  const insB = new Float32Array(INSET_N);
  let insN = 0;
  let insYmax = 1;
  let insTimer = 0;
  let insDirty = true;

  function resetInset(): void {
    insN = 0;
    insTimer = 0;
    insDirty = true;
    if (view === 'kepler') insYmax = Math.sqrt((1 + kE) / (1 - kE) / kA) * 1.1;
    else if (view === 'hohmann') insYmax = 1.35;
    else insYmax = Math.max(helioMax, Math.min(relPeak, 2.2 * Math.max(vInf, helioMax / 2))) * 1.08;
  }

  function pushInset(a: number, b: number): void {
    if (insN >= INSET_N) {
      insA.copyWithin(0, 1);
      insB.copyWithin(0, 1);
      insN--;
    }
    insA[insN] = a;
    insB[insN] = b;
    insN++;
    insDirty = true;
  }

  function drawInset(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    const title = view === 'slingshot' ? 'speed: Sun frame / planet frame' : 'probe speed |v| vs time';
    sctx.fillText(title, 14, 30);
    const x0 = 14;
    const x1 = W - 60;
    const yOf = (v: number) => Hh - 14 - (Math.min(v, insYmax) / insYmax) * (Hh - 58);
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    const stepV = insYmax > 3 ? 1 : 0.5;
    for (let v = 0; v <= insYmax; v += stepV) {
      const y = yOf(v);
      sctx.beginPath();
      sctx.moveTo(x0, y);
      sctx.lineTo(x1, y);
      sctx.stroke();
      sctx.fillStyle = '#56627c';
      sctx.fillText(v.toFixed(1), x1 + 8, y + 7);
    }
    if (insN < 2) return;
    const span = view === 'slingshot' ? Math.max(insN, 420) : view === 'kepler' ? Math.min(INSET_N, Math.max(120, Math.ceil(1.6 * 30 * (kT / (TAU / 9))))) : INSET_N;
    const line = (arr: Float32Array, col: string) => {
      sctx.strokeStyle = col;
      sctx.lineWidth = 3;
      sctx.beginPath();
      for (let n = 0; n < insN; n++) {
        const x = x0 + (n / (span - 1)) * (x1 - x0);
        const y = yOf(arr[n]);
        if (n === 0) sctx.moveTo(x, y);
        else sctx.lineTo(x, y);
      }
      sctx.stroke();
    };
    if (view === 'slingshot') line(insB, css(PALETTE.cyan));
    line(insA, css(PROBE_COL));
  }

  // =====================================================================
  // Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${css(c)}"></i>`;
  function paintLegend(): void {
    const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;
    if (view === 'kepler') {
      legend.innerHTML = head('Equal areas in equal times') + [
        `${sw(PALETTE.cyan, false)}${sw(PALETTE.rose, false)}wedges: 1/12 of the period each`,
        `${sw(PROBE_COL)}probe, arrow = velocity`,
        `${sw(PLANET_COL)}planet on a circle, a = 1`,
      ].join('<br/>');
    } else if (view === 'hohmann') {
      legend.innerHTML = head('Hohmann transfer') + [
        `${sw(PALETTE.cyan, false)}start orbit`,
        `${sw(PLANET_COL, false)}target orbit and planet`,
        `${sw(PROBE_COL, false)}transfer ellipse (half used)`,
        `${sw(PALETTE.green)}instant burns`,
      ].join('<br/>');
    } else {
      legend.innerHTML = head('One flyby, two frames') + [
        `${sw(PROBE_COL)}probe seen from the Sun`,
        `${sw(PALETTE.cyan)}probe seen from the planet`,
        `${sw(PALETTE.green, false)}planet velocity`,
        `${sw(0x8391ab, false)}path with no planet`,
        `Planet frame radius: ${(rWin / R_PLANET).toFixed(0)} planet radii`,
        'Playback slows near the planet.',
      ].join('<br/>');
    }
  }

  // =====================================================================
  // Layout and camera
  let needFit = true;
  let fitIdle = 0;
  function layout(): void {
    kGroup.visible = view === 'kepler';
    hGroup.visible = view === 'hohmann';
    fGroup.visible = view === 'slingshot';
    if (view === 'slingshot') {
      const both = frame === 'both';
      sunFrame.visible = frame !== 'planet';
      plFrame.visible = frame !== 'sun';
      const ss = both ? 1.9 : 2.3;
      sunFrame.scale.setScalar(ss);
      sunFrame.position.set(both ? -3.4 : 0, 0, both ? 0.5 : 0.6);
      plFrame.position.set(both ? 3.2 : 0, 0, 0);
      plFrame.scale.setScalar(both ? 1 : 1.25);
      labSun.visible = sunFrame.visible;
      labPf.visible = plFrame.visible;
      labSun.position.set(sunFrame.position.x, 0, -ss * 1.55 + sunFrame.position.z);
      labPf.position.set(plFrame.position.x, 0, -WR * plFrame.scale.x - 0.55);
    }
    for (const s of sections) s.el.style.display = s.views.includes(view) ? '' : 'none';
    paintLegend();
    resetInset();
  }

  function fit(): void {
    let cx = 0;
    let cz = 0;
    let half = 3;
    const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
    if (view === 'kepler') {
      const xmin = Math.min(-1, -kA * (1 + kE));
      const xmax = Math.max(1, kA * (1 - kE));
      const bmax = Math.max(1, kA * Math.sqrt(1 - kE * kE));
      cx = ((xmin + xmax) / 2) * S;
      half = Math.max(bmax * S, ((xmax - xmin) / 2) * S / aspect) * 1.12;
    } else if (view === 'hohmann') {
      half = Math.max(r2 * S, (r2 * S) / aspect) * 1.1;
    } else {
      const w = frame === 'both' ? 6.2 : 3.3;
      cx = 0;
      cz = frame === 'both' ? -0.1 : 0;
      half = Math.max(3.1, w / aspect);
    }
    const dist = half / Math.tan(22.5 * DEG);
    const el = 68 * DEG;
    stage.flyTo([cx, dist * Math.sin(el), cz + dist * Math.cos(el)], [cx, 0, cz], 0.9);
  }

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  const sections: { el: HTMLElement; views: View[] }[] = [];
  const sec = (title: string, views: View[]) => {
    ui.section(title);
    sections.push({ el: ui.root.lastElementChild as HTMLElement, views });
  };

  sec('View', ['kepler', 'hohmann', 'slingshot']);
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'kepler', label: 'Kepler' }, { value: 'hohmann', label: 'Hohmann' }, { value: 'slingshot', label: 'Slingshot' }],
    onChange: (v) => {
      view = v;
      layout();
      if (v === 'kepler') resetKepler();
      if (v === 'hohmann') resetHohmann();
      if (v === 'slingshot') resetSlingshot();
      needFit = true;
      fitIdle = 1;
    },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    {
      label: 'Restart', onClick: () => {
        if (view === 'kepler') resetKepler();
        if (view === 'hohmann') resetHohmann();
        if (view === 'slingshot') restartFly();
      },
    },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.2, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.toggle({
    key: 'trails', label: 'Show trails', value: showTrails,
    onChange: (v) => { showTrails = v; kTrail.clear(); hTrail.clear(); sfTrail.clear(); pfTrail.clear(); kTrail.line.visible = hTrail.line.visible = sfTrail.line.visible = pfTrail.line.visible = v; },
  });

  // Kepler controls
  sec('Orbit shape', ['kepler']);
  ui.slider({ key: 'e', label: 'Eccentricity e', min: 0, max: 0.9, step: 0.01, value: kE, onInput: (v) => { kE = v; resetKepler(); } });
  ui.slider({ key: 'a', label: 'Semi-major axis a', min: 0.4, max: 1.6, step: 0.01, value: kA, format: (v) => v.toFixed(2), onInput: (v) => { kA = v; resetKepler(); } });
  ui.note('Lengths are in units of the planet’s orbit radius. Times are in planet years.');
  sec('Kepler readouts', ['kepler']);
  const rV = ui.readout('v', 'speed v');
  const rR = ui.readout('r', 'distance r');
  const rA1 = ui.readout('area1', 'area A₁');
  const rA2 = ui.readout('area2', 'area A₂');
  const rRatio = ui.readout('areaRatio', 'area ratio A₁/A₂');
  const rVpa = ui.readout('vpva', 'v_peri / v_apo');
  const rPeriod = ui.readout('period', 'period T (measured)', 'yr');
  const rT2a3 = ui.readout('t2a3', 'T² / a³');
  const rKdrift = ui.readout('kdrift', 'energy drift');

  // Hohmann controls
  sec('Transfer', ['hohmann']);
  ui.slider({ key: 'r2', label: 'Target radius r₂ / r₁', min: 1.2, max: 3, step: 0.01, value: r2, format: (v) => v.toFixed(2), onInput: (v) => { r2 = v; resetHohmann(); } });
  ui.toggle({ key: 'auto', label: 'Auto burns (on time)', value: auto, onChange: (v) => { auto = v; resetHohmann(); } });
  const [fireBtn] = ui.buttons([{ label: 'Fire burn 1', key: 'dv1', onClick: () => burn() }]);
  ui.note('With auto off, you choose when to fire. Burn 2 only circularises if you fire it at the far end of the ellipse.');
  sec('Hohmann readouts', ['hohmann']);
  const rDv1 = ui.readout('dv1', 'Δv₁');
  const rDv2 = ui.readout('dv2', 'Δv₂');
  const rDvT = ui.readout('dvtotal', 'total Δv');
  const rTt = ui.readout('ttransfer', 'coast time');
  const rLead = ui.readout('lead', 'planet lead (need)');
  const rHstat = ui.readout('hstatus', 'status');
  const rHe = ui.readout('finalEcc', 'final e');
  ui.note('km/s and days assume r₁ = 1 AU around the Sun, like Earth. r₂ = 1.52 is Mars.');

  // Slingshot controls
  sec('Flyby', ['slingshot']);
  ui.select<Frame>({
    key: 'frame', label: 'Frames', value: frame,
    options: [{ value: 'both', label: 'Side by side' }, { value: 'sun', label: 'Sun' }, { value: 'planet', label: 'Planet' }],
    onChange: (v) => { frame = v; layout(); needFit = true; fitIdle = 1; },
  });
  const flyInput = () => { touched = true; resetSlingshot(); };
  ui.slider({ key: 'vinf', label: 'Approach speed v∞', min: 0.2, max: 0.9, step: 0.01, value: vInf, format: (v) => `${v.toFixed(2)} V_p`, onInput: (v) => { vInf = v; flyInput(); } });
  ui.slider({ key: 'approach', label: 'Approach direction', min: 0, max: 359, step: 1, value: approach, unit: '°', onInput: (v) => { approach = v; flyInput(); } });
  ui.slider({ key: 'rp', label: 'Closest approach r_p', min: 1.2, max: 40, step: 0.1, value: rpK, format: (v) => `${v.toFixed(1)} R_planet`, onInput: (v) => { rpK = v; flyInput(); } });
  ui.select<'cw' | 'ccw'>({
    key: 'turn', label: 'Swing around the planet', value: 'cw',
    options: [{ value: 'cw', label: 'Clockwise' }, { value: 'ccw', label: 'Anticlockwise' }],
    onChange: (v) => { turn = v === 'ccw' ? 1 : -1; flyInput(); },
  });
  ui.note('Direction is measured from the planet’s velocity. V_p is the planet’s orbital speed. The planet has Jupiter’s mass ratio to the Sun.');
  sec('Flyby readouts', ['slingshot']);
  const rSide = ui.readout('side', 'closest point is');
  const rDelta = ui.readout('delta', 'turn angle δ');
  const rEcc = ui.readout('hypE', 'hyperbola e');
  const rUio = ui.readout('uio', 'planet-frame speed in / out');
  const rGain = ui.readout('gain', 'speed gain (n-body)');
  const rGainPc = ui.readout('gainPc', 'speed gain (patched)');
  const rDe = ui.readout('deErr', 'ΔE: n-body vs patched');
  const rVh = ui.readout('vhelio', 'Sun-frame speed');
  ui.legend([
    { color: css(PROBE_COL), label: 'Sun frame' },
    { color: css(PALETTE.cyan), label: 'planet frame' },
    { color: css(PALETTE.green), label: 'planet velocity' },
  ]);

  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
  const sci = (x: number) => (x < 1e-15 ? '< 1e-15' : x.toExponential(1));

  function updateReadouts(): void {
    if (view === 'kepler') {
      const r = Math.hypot(kS[0], kS[1]);
      rV(Math.hypot(kS[2], kS[3]).toFixed(3));
      rR(r.toFixed(3));
      rA1(area1.toFixed(4));
      rA2(area2.toFixed(4));
      rRatio(areaRatio.toFixed(4));
      rVpa(((1 + kE) / (1 - kE)).toFixed(2));
      rPeriod(Number.isFinite(kTmeas) ? (kTmeas / TAU).toFixed(4) : `… (${Math.pow(kA, 1.5).toFixed(3)})`);
      rT2a3(Number.isFinite(kTmeas) ? ((kTmeas / TAU) ** 2 / kA ** 3).toFixed(5) : '…');
      rKdrift(sci(kDrift));
    } else if (view === 'hohmann') {
      rDv1(`${(hm.dv1 * KMS).toFixed(2)} km/s`);
      rDv2(`${(hm.dv2 * KMS).toFixed(2)} km/s`);
      rDvT(`${(hm.total * KMS).toFixed(2)} km/s`);
      rTt(`${((hm.tTransfer / TAU) * 365.25).toFixed(0)} d`);
      const lead = wrapPi(planetAngle() - probeAngle());
      rLead(`${(lead / DEG).toFixed(0)}° (${(hm.phase / DEG).toFixed(0)}°)`);
      if (hPhase === 'parked') rHstat(auto ? 'waiting for window' : 'parked');
      else if (hPhase === 'transfer') rHstat('coasting');
      else rHstat(hDone ? (hGap < 0.1 ? 'arrived at planet' : 'circular, planet elsewhere') : 'not circular');
      rHe(hPhase === 'arrived' ? hFinal.e.toFixed(3) : '…');
    } else {
      rSide(pc.behind ? 'behind planet' : 'in front');
      rDelta(`${(pc.delta / DEG).toFixed(1)}°`);
      rEcc(pc.e.toFixed(3));
      rUio(`${uIn.toFixed(3)} / ${uOut.toFixed(3)}`);
      rGain(pct(gain));
      rGainPc(pct(gainPc));
      rDe(`${(dEerr * 100).toFixed(1)}% apart`);
      rVh(Math.hypot(fVx[fIdx], fVy[fIdx]).toFixed(3));
    }
  }

  // =====================================================================
  // Frame loop
  let uiTimer = 0;
  stage.onFrame((dt) => {
    if (needFit) {
      fitIdle += dt;
      if (fitIdle > 0.35) {
        fit();
        needFit = false;
        fitIdle = 0;
      }
    }
    if (playing) {
      if (view === 'kepler') {
        advanceKepler(dt * speed * (TAU / 9));
        placeKepler();
      } else if (view === 'hohmann') {
        advanceHohmann(dt * speed * 1.1);
        placeHohmann();
      } else {
        advanceFly(dt);
      }
      insTimer += dt;
      if (insTimer > 1 / 30) {
        insTimer = 0;
        if (view === 'kepler') pushInset(Math.hypot(kS[2], kS[3]), 0);
        else if (view === 'hohmann') pushInset(Math.hypot(hS[2], hS[3]), 0);
        else if (ft < fT[fN - 1]) pushInset(Math.hypot(fVx[fIdx], fVy[fIdx]), Math.hypot(fUx[fIdx], fUy[fIdx]));
      }
    }
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      updateReadouts();
      if (insDirty) {
        drawInset();
        insDirty = false;
      }
    }
  });

  // Initial state
  resetHohmann();
  resetSlingshot();
  layout();
  resetKepler();
  fitIdle = 1;
  updateReadouts();
  touched = false;

  return {
    state: () => ({
      view,
      frame,
      touched,
      e: kE,
      a: kA,
      areaRatio,
      r2,
      auto,
      hohPhase: hPhase,
      hohDone: hDone,
      finalEcc: hPhase === 'arrived' ? hFinal.e : -1,
      vInf,
      approach,
      rp: rpK,
      turn,
      behind: pc.behind,
      delta: pc.delta / DEG,
      gain,
      gainPatched: gainPc,
      deErr: dEerr,
      flyDone,
    }),
    dispose: () => {
      spark.remove();
      legend.remove();
      glowTex.dispose();
      sphereGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'kepler-slingshot',
  number: 36,
  title: 'Kepler Orbits & Slingshots',
  domain: 'classical',
  level: 1,
  status: 'live',
  tagline: 'Ellipses, and how a spacecraft steals speed from a planet.',
  content,
  mount,
};

export default topic;
