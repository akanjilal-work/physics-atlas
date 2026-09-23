import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  HBAR, KB, SPECIES, ZETA3, LevelSum, castinDum, criticalT, deBroglie, energyQuantiles, erf, fractionBox,
  fractionHarmonic, g, oscLength, tfMu, thermo, trapFreqs, type SpeciesId, type Thermo,
} from './physics.ts';

type View = 'trap' | 'tof';

// --- Layout (scene units)
const IMG_X = -2.75; // centre of the absorption image
const IMG_Z = 0.2;
const HALF = 2.3; // half-width of the image window
const GRID = 120; // image cells per side
const NV = GRID + 1;
const HMAX = 2.0; // peak height of the image
const CLOUD = new THREE.Vector3(2.85, 1.05, 0);
const SIG = 0.45; // on-screen axial thermal width at T = Tc
const M = 3000; // atoms drawn
const ESC = 256; // escaping-atom pool
const EQ = 512; // energy quantiles
const G2N = 1024; // g2 lookup
const G2S = 40; // g2 lookup range in V / kT
const ETA = 6; // evaporation edge in units of kT

// --- Evaporation ramp (illustrative): T from 1500 nK to 80 nK, N proportional to T^0.45
const RAMP_T0 = 1500;
const RAMP_T1 = 80;
const RAMP_N0 = 3e6;
const RAMP_NU = 0.45;
const DEMO_START = 0.15;
const DEMO_END = 0.5;

const rampT = (p: number) => RAMP_T0 * Math.pow(RAMP_T1 / RAMP_T0, p);
const rampN = (p: number) => RAMP_N0 * Math.pow(rampT(p) / RAMP_T0, RAMP_NU);

/** Colour ramp for column density, u in [0, 1]. */
const STOPS: [number, number, number, number][] = [
  [0.0, 0.05, 0.08, 0.16],
  [0.12, 0.16, 0.17, 0.46],
  [0.32, 0.55, 0.4, 0.92],
  [0.55, 0.96, 0.45, 0.71],
  [0.8, 0.96, 0.71, 0.26],
  [1.0, 1.0, 0.97, 0.86],
];
function rampInto(u: number, out: Float32Array, o: number): void {
  const x = Math.max(0, Math.min(1, u));
  let i = 1;
  while (i < STOPS.length - 1 && STOPS[i][0] < x) i++;
  const a = STOPS[i - 1];
  const b = STOPS[i];
  const f = (x - a[0]) / (b[0] - a[0]);
  out[o] = a[1] + (b[1] - a[1]) * f;
  out[o + 1] = a[2] + (b[2] - a[2]) * f;
  out[o + 2] = a[3] + (b[3] - a[3]) * f;
}

/** Deterministic PRNG so the cloud looks the same on every visit. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function niceLength(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const r = x / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.1, 6.3, 11.2], target: [0.05, 1.05, 0.3], fov: 42 });
  const { scene } = stage;

  // ---------------------------------------------------------------- parameters
  let T = rampT(DEMO_START) * 1e-9; // K
  let N = rampN(DEMO_START);
  let nuBar = 100; // Hz
  let k = 3; // elongation w_perp / w_z
  let species: SpeciesId = 'rb87';
  let view: View = 'trap';
  let interactions = true;
  let tTof = 20e-3; // s
  let progress = DEMO_START;
  let evaporating = true;
  let evapTarget = DEMO_END;
  let touched = false;

  // challenge bookkeeping
  let wasAbove = false;
  let crossed = false;
  let lastCtl = '';
  let nStart = N;
  let tcStart = 0;

  // ---------------------------------------------------------------- derived physics state
  let fr = trapFreqs(nuBar, k);
  let th: Thermo = thermo(N, T, fr.wbar);
  let fExact = NaN;
  let exactStale = true;
  let levels: LevelSum | null = null;
  let levelsKey = '';
  let levelsBmin = Infinity;
  const curveT = new Float64Array(26);
  const curveF = new Float64Array(26);
  for (let i = 0; i < curveT.length; i++) curveT[i] = 0.06 + (1.44 * i) / (curveT.length - 1);
  let curveKey = '';
  let curveN = 0;
  let cd = castinDum(1 / k, 10, 0.01);
  let cdKey = '';
  let mu = 0;
  let useTF = true;
  // widths (m) at the current time of flight
  let sTa = 1, sTr = 1; // thermal
  let cA = 1, cR = 1; // condensate radius (TF) or sigma (Gaussian)
  let L = 1e-6; // metres per scene unit
  let Lshown = 0;
  let tofClock = 0; // s of physical expansion so far
  let tofDone = false;

  const g2tab = new Float64Array(G2N + 1);
  let g2z = -1;
  const eq = new Float64Array(EQ);
  let eqZ = -1;

  function ensureLevels(): void {
    const key = `${nuBar}|${k}`;
    const bMin = (HBAR * fr.wz) / (KB * Math.max(T, 1.5 * th.Tc));
    if (!levels || key !== levelsKey || bMin < levelsBmin) {
      levelsBmin = bMin * 0.7;
      levels = new LevelSum(k, LevelSum.levelsFor(levelsBmin));
      levelsKey = key;
      curveKey = '';
    }
  }

  function computeCurve(): void {
    ensureLevels();
    const key = `${nuBar}|${k}|${species}`;
    if (key === curveKey && Math.abs(Math.log(N / curveN)) < 0.05) return;
    curveKey = key;
    curveN = N;
    for (let i = 0; i < curveT.length; i++) {
      const b = (HBAR * fr.wz) / (KB * th.Tc * curveT[i]);
      curveF[i] = levels!.fraction(N, b);
    }
  }

  function computeCastin(): void {
    const key = `${nuBar}|${k}`;
    if (key === cdKey) return;
    cdKey = key;
    const tauMax = fr.wperp * 0.032;
    cd = castinDum(1 / k, tauMax, tauMax / 2400);
  }

  function scaleAt(t: number): number {
    const sp = SPECIES[species];
    return (Math.sqrt((KB * th.Tc) / sp.m) * Math.sqrt(t * t + 1 / (fr.wz * fr.wz))) / SIG;
  }

  /** Recompute thermodynamics and derived tables after any parameter change. */
  function recompute(): void {
    fr = trapFreqs(nuBar, k);
    th = thermo(N, T, fr.wbar);
    ensureLevels();
    exactStale = true;
    if (!evaporating) computeCurve();
    computeCastin();
    const sp = SPECIES[species];
    mu = th.N0 > 0 ? tfMu(th.N0, sp, fr.wbar) : 0;
    useTF = interactions && mu > 2 * HBAR * fr.wbar;
    if (Math.abs(th.z - g2z) > 1e-5 * th.z || (th.z === 1 && g2z !== 1)) {
      g2z = th.z;
      for (let i = 0; i <= G2N; i++) g2tab[i] = g(2, th.z * Math.exp(-(i / G2N) * G2S));
    }
    if (Math.abs(th.z - eqZ) > 1e-6) {
      eqZ = th.z;
      energyQuantiles(Math.min(th.z, 1 - 1e-12), eq);
    }
    if (touched) {
      if (th.t > 1) wasAbove = true;
      if (wasAbove && th.t < 1 && th.f0 >= 0.2) crossed = true;
    }
    dirty = true;
  }

  function widthsAt(t: number): void {
    const sp = SPECIES[species];
    const vT = Math.sqrt((KB * T) / sp.m);
    sTa = (vT / fr.wz) * Math.sqrt(1 + (fr.wz * t) ** 2);
    sTr = (vT / fr.wperp) * Math.sqrt(1 + (fr.wperp * t) ** 2);
    if (useTF) {
      const tau = fr.wperp * t;
      const x = Math.min(cd.bp.length - 1.001, tau / cd.dtau);
      const i = Math.floor(x);
      const f = x - i;
      const bp = cd.bp[i] + (cd.bp[i + 1] - cd.bp[i]) * f;
      const bz = cd.bz[i] + (cd.bz[i + 1] - cd.bz[i]) * f;
      const v = Math.sqrt((2 * mu) / sp.m);
      cA = (v / fr.wz) * bz;
      cR = (v / fr.wperp) * bp;
    } else {
      cA = (oscLength(sp.m, fr.wz) / Math.SQRT2) * Math.sqrt(1 + (fr.wz * t) ** 2);
      cR = (oscLength(sp.m, fr.wperp) / Math.SQRT2) * Math.sqrt(1 + (fr.wperp * t) ** 2);
    }
  }

  // ---------------------------------------------------------------- absorption image
  const imgGroup = new THREE.Group();
  imgGroup.position.set(IMG_X, 0, IMG_Z);
  scene.add(imgGroup);
  const cell = (2 * HALF) / GRID;
  const imgPos = new Float32Array(NV * NV * 3);
  const imgCol = new Float32Array(NV * NV * 3);
  const colDen = new Float64Array(NV * NV);
  const xs = new Float64Array(NV);
  for (let i = 0; i < NV; i++) xs[i] = -HALF + i * cell;
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NV; i++) {
      const o = (j * NV + i) * 3;
      imgPos[o] = xs[i];
      imgPos[o + 2] = xs[j];
    }
  }
  const idx = new Uint32Array(GRID * GRID * 6);
  {
    let q = 0;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const a = j * NV + i;
        idx[q++] = a; idx[q++] = a + NV; idx[q++] = a + 1;
        idx[q++] = a + 1; idx[q++] = a + NV; idx[q++] = a + NV + 1;
      }
    }
  }
  const imgGeo = new THREE.BufferGeometry();
  const imgPosAttr = new THREE.BufferAttribute(imgPos, 3).setUsage(THREE.DynamicDrawUsage);
  const imgColAttr = new THREE.BufferAttribute(imgCol, 3).setUsage(THREE.DynamicDrawUsage);
  imgGeo.setAttribute('position', imgPosAttr);
  imgGeo.setAttribute('color', imgColAttr);
  imgGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  imgGeo.computeVertexNormals();
  const imgMesh = new THREE.Mesh(imgGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x0b0f1c }));
  imgMesh.frustumCulled = false;
  imgGroup.add(imgMesh);
  // frame and floor
  {
    const h = HALF + 0.08;
    const pts = [-h, 0, -h, h, 0, -h, h, 0, -h, h, 0, h, h, 0, h, -h, 0, h, -h, 0, h, -h, 0, -h];
    imgGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), new THREE.LineBasicMaterial({ color: 0x2c3852 })));
  }
  const imgTitle = stage.label('absorption image · column density', [0, 0, HALF + 0.55], 'muted', imgGroup);
  void imgTitle;
  const axLabel = stage.label('trap axis →', [HALF - 0.45, 0, -HALF - 0.3], 'muted', imgGroup);
  void axLabel;
  const phaseLabel = stage.label('', [0, 0, HALF + 1.05], 'big', imgGroup);

  // scale bar on the image
  const barMat = new THREE.LineBasicMaterial({ color: 0xdfe6f3 });
  const barPos = new Float32Array(6);
  const barAttr = new THREE.BufferAttribute(barPos, 3);
  const bar = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', barAttr), barMat);
  bar.frustumCulled = false;
  imgGroup.add(bar);
  const barLabel = stage.label('', [0, 0, 0], 'muted', imgGroup);

  // lookup helpers for the image (no allocation)
  const pa = new Float64Array(NV); // condensate cell weights, axial
  const pr = new Float64Array(NV); // radial
  function gauss1D(sig: number, out: Float64Array): void {
    const s = Math.SQRT2 * Math.max(sig, 1e-30);
    for (let i = 0; i < NV; i++) {
      const x = xs[i] * L;
      const h = 0.5 * cell * L;
      out[i] = 0.5 * (erf((x + h) / s) - erf((x - h) / s));
    }
  }

  let peakCol = 1;
  function buildImage(): void {
    const cellArea = (cell * L) ** 2;
    const thCoef = th.Nth / (2 * Math.PI * sTa * sTr * g(3, th.z));
    // condensate model for this frame: TF (point sampled) or Gaussian (cell averaged)
    let tfOK = useTF && th.N0 > 0;
    const pix = cell * L;
    if (tfOK && Math.min(cA, cR) < 3 * pix) tfOK = false;
    const gaussC = th.N0 > 0 && !tfOK;
    if (gaussC) {
      const sa = useTF ? cA / Math.sqrt(7) : cA;
      const sr = useTF ? cR / Math.sqrt(7) : cR;
      gauss1D(sa, pa);
      gauss1D(sr, pr);
    }
    const tfCoef = (5 * th.N0) / (2 * Math.PI * cA * cR);
    let peak = 0;
    for (let j = 0; j < NV; j++) {
      const r = xs[j] * L;
      const vr = (r * r) / (2 * sTr * sTr);
      const rr = (r * r) / (cR * cR);
      for (let i = 0; i < NV; i++) {
        const a = xs[i] * L;
        const s = vr + (a * a) / (2 * sTa * sTa);
        let n = 0;
        if (th.Nth > 0 && s < G2S) {
          const x = (s / G2S) * G2N;
          const i0 = Math.floor(x);
          const f = x - i0;
          n = thCoef * (g2tab[i0] + (g2tab[Math.min(G2N, i0 + 1)] - g2tab[i0]) * f);
        }
        if (tfOK) {
          const u = 1 - rr - (a * a) / (cA * cA);
          if (u > 0) n += tfCoef * u * Math.sqrt(u);
        } else if (gaussC) {
          n += (th.N0 * pa[i] * pr[j]) / cellArea;
        }
        colDen[j * NV + i] = n;
        if (n > peak) peak = n;
      }
    }
    peakCol = peak;
    const inv = peak > 0 ? 1 / peak : 0;
    for (let v = 0; v < NV * NV; v++) {
      const u = colDen[v] * inv;
      imgPos[v * 3 + 1] = u * HMAX;
      rampInto(Math.sqrt(u), imgCol, v * 3);
    }
    imgPosAttr.needsUpdate = true;
    imgColAttr.needsUpdate = true;
    imgGeo.computeVertexNormals();
  }

  // ---------------------------------------------------------------- atom cloud
  const cloudGroup = new THREE.Group();
  cloudGroup.position.copy(CLOUD);
  scene.add(cloudGroup);
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const ptPos = new Float32Array(M * 3);
  const ptCol = new Float32Array(M * 3);
  const ptPosAttr = new THREE.BufferAttribute(ptPos, 3).setUsage(THREE.DynamicDrawUsage);
  const ptColAttr = new THREE.BufferAttribute(ptCol, 3).setUsage(THREE.DynamicDrawUsage);
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', ptPosAttr);
  ptGeo.setAttribute('color', ptColAttr);
  const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.075, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  cloudGroup.add(pts);
  stage.label('atoms in the trap · 3000 dots', [0, -1.6, 1.4], 'muted', cloudGroup);

  // per-atom seeds
  const rnd = mulberry(1995);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const dir6 = new Float32Array(M * 6);
  const eRank = new Float32Array(M);
  const cRank = new Float32Array(M);
  const tfU = new Float32Array(M * 3);
  const gU = new Float32Array(M * 3);
  const Earr = new Float32Array(M);
  // inverse CDF of r for a TF ball, density (1 - r^2) r^2
  const tfR = new Float32Array(256);
  {
    const nb = 2000;
    const cdf = new Float64Array(nb + 1);
    for (let i = 1; i <= nb; i++) {
      const r = (i - 0.5) / nb;
      cdf[i] = cdf[i - 1] + r * r * (1 - r * r);
    }
    let j = 0;
    for (let i = 0; i < 256; i++) {
      const target = ((i + 0.5) / 256) * cdf[nb];
      while (j < nb && cdf[j + 1] < target) j++;
      tfR[i] = (j + (target - cdf[j]) / (cdf[j + 1] - cdf[j])) / nb;
    }
  }
  for (let i = 0; i < M; i++) {
    let s = 0;
    for (let d = 0; d < 6; d++) {
      const v = gauss();
      dir6[i * 6 + d] = v;
      s += v * v;
    }
    s = 1 / Math.sqrt(s);
    for (let d = 0; d < 6; d++) dir6[i * 6 + d] *= s;
    eRank[i] = rnd();
    cRank[i] = rnd();
    const a = gauss(), b = gauss(), c = gauss();
    gU[i * 3] = a; gU[i * 3 + 1] = b; gU[i * 3 + 2] = c;
    const n = 1 / Math.hypot(a, b, c);
    const r = tfR[Math.min(255, Math.floor(rnd() * 256))];
    tfU[i * 3] = a * n * r; tfU[i * 3 + 1] = b * n * r; tfU[i * 3 + 2] = c * n * r;
  }

  // escaping atoms
  const escPos = new Float32Array(ESC * 3);
  const escCol = new Float32Array(ESC * 3);
  const escVel = new Float32Array(ESC * 3);
  const escLife = new Float32Array(ESC);
  const escPosAttr = new THREE.BufferAttribute(escPos, 3).setUsage(THREE.DynamicDrawUsage);
  const escColAttr = new THREE.BufferAttribute(escCol, 3).setUsage(THREE.DynamicDrawUsage);
  const escGeo = new THREE.BufferGeometry();
  escGeo.setAttribute('position', escPosAttr);
  escGeo.setAttribute('color', escColAttr);
  const escPts = new THREE.Points(escGeo, new THREE.PointsMaterial({ size: 0.09, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  escPts.frustumCulled = false;
  cloudGroup.add(escPts);
  let escNext = 0;
  let escAcc = 0;

  // trap edge (evaporation knife) and a faint trap outline
  const knife = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  );
  cloudGroup.add(knife);
  const knifeWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 12)),
    new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.25 }),
  );
  knife.add(knifeWire);
  const knifeLabel = stage.label('trap edge, lowered as it cools', [0, 0, 0], 'muted', cloudGroup);
  knifeLabel.element.style.color = css(PALETTE.rose);

  const cloudBarPos = new Float32Array(6);
  const cloudBarAttr = new THREE.BufferAttribute(cloudBarPos, 3);
  const cloudBar = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', cloudBarAttr), barMat);
  cloudBar.frustumCulled = false;
  cloudGroup.add(cloudBar);
  const cloudBarLabel = stage.label('', [0, 0, 0], 'muted', cloudGroup);

  const cyan = new THREE.Color(PALETTE.cyan);
  const amber = new THREE.Color(PALETTE.amber);
  const red = new THREE.Color(PALETTE.red);
  let visT = 0; // visual clock of the thermal orbits
  let relPhase = 0; // orbit phase frozen at release

  function writeColors(): void {
    for (let i = 0; i < M; i++) {
      const c = cRank[i] < th.f0 ? amber : cyan;
      const b = cRank[i] < th.f0 ? 0.95 : 0.55;
      ptCol[i * 3] = c.r * b;
      ptCol[i * 3 + 1] = c.g * b;
      ptCol[i * 3 + 2] = c.b * b;
    }
    ptColAttr.needsUpdate = true;
  }

  function writePoints(t: number): void {
    const inv = 1 / L;
    const sp = SPECIES[species];
    const vT = Math.sqrt((KB * T) / sp.m);
    const s0a = vT / fr.wz; // in-trap thermal widths
    const s0r = vT / fr.wperp;
    const phA = view === 'tof' ? relPhase : visT * 0.6;
    const phR = phA * k;
    const ca = Math.cos(phA), sa = Math.sin(phA), cr = Math.cos(phR), sr = Math.sin(phR);
    const tA = fr.wz * t;
    const tR = fr.wperp * t;
    const tfMode = useTF;
    for (let i = 0; i < M; i++) {
      const o = i * 3;
      if (cRank[i] < th.f0) {
        const u = tfMode ? tfU : gU;
        ptPos[o] = u[o] * cA * inv;
        ptPos[o + 1] = u[o + 1] * cR * inv;
        ptPos[o + 2] = u[o + 2] * cR * inv;
        continue;
      }
      const E = eq[Math.min(EQ - 1, Math.floor(eRank[i] * EQ))];
      Earr[i] = E;
      const R = Math.sqrt(2 * E);
      const d = i * 6;
      // axis 0 axial, axes 1 and 2 radial. Each (x, p) pair turns on its harmonic orbit.
      let X = dir6[d] * R, P = dir6[d + 3] * R;
      let x = X * ca + P * sa, p = -X * sa + P * ca;
      ptPos[o] = s0a * (x + p * tA) * inv;
      X = dir6[d + 1] * R; P = dir6[d + 4] * R;
      x = X * cr + P * sr; p = -X * sr + P * cr;
      ptPos[o + 1] = s0r * (x + p * tR) * inv;
      X = dir6[d + 2] * R; P = dir6[d + 5] * R;
      x = X * cr + P * sr; p = -X * sr + P * cr;
      ptPos[o + 2] = s0r * (x + p * tR) * inv;
    }
    ptPosAttr.needsUpdate = true;
  }

  function emitEscapees(dt: number, rate: number): void {
    escAcc += rate * dt;
    while (escAcc >= 1) {
      escAcc -= 1;
      let pick = -1;
      for (let tries = 0; tries < 24; tries++) {
        const i = Math.floor(Math.random() * M);
        if (cRank[i] >= th.f0 && Earr[i] > 4) { pick = i; break; }
      }
      if (pick < 0) continue;
      const s = escNext;
      escNext = (escNext + 1) % ESC;
      const x = ptPos[pick * 3], y = ptPos[pick * 3 + 1], z = ptPos[pick * 3 + 2];
      const n = Math.hypot(x, y * 2, z * 2) || 1;
      const sp = 1.6 + Math.random();
      escPos[s * 3] = x; escPos[s * 3 + 1] = y; escPos[s * 3 + 2] = z;
      escVel[s * 3] = (x / n) * sp; escVel[s * 3 + 1] = ((y * 2) / n) * sp; escVel[s * 3 + 2] = ((z * 2) / n) * sp;
      escLife[s] = 1.3;
    }
  }

  function stepEscapees(dt: number): void {
    for (let s = 0; s < ESC; s++) {
      const o = s * 3;
      if (escLife[s] <= 0) {
        escCol[o] = escCol[o + 1] = escCol[o + 2] = 0;
        escPos[o] = escPos[o + 1] = escPos[o + 2] = 0;
        continue;
      }
      escLife[s] -= dt;
      escPos[o] += escVel[o] * dt;
      escPos[o + 1] += escVel[o + 1] * dt;
      escPos[o + 2] += escVel[o + 2] * dt;
      const b = Math.max(0, escLife[s] / 1.3);
      escCol[o] = red.r * b;
      escCol[o + 1] = red.g * b;
      escCol[o + 2] = red.b * b;
    }
    escPosAttr.needsUpdate = true;
    escColAttr.needsUpdate = true;
  }

  // ---------------------------------------------------------------- overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Bose–Einstein condensation</div>
<div>Left: shadow of the cloud in a probe laser. Height = atoms per area along the beam, scaled to the peak.</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,#0d1429,#292b75,#8c66eb,#f573b5,#f5b542,#fff7db)"></div>
<div>Right: <span style="color:${css(PALETTE.cyan)}">thermal atoms</span>, <span style="color:${css(PALETTE.amber)}">condensate</span>, <span style="color:${css(PALETTE.red)}">atoms leaving</span> over the <span style="color:${css(PALETTE.rose)}">trap edge</span>.</div>`;
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 320;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '160px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  function drawInset(): void {
    const W = inset.width, Hh = inset.height;
    const x0 = 58, x1 = W - 16, y0 = Hh - 44, y1 = 50;
    const X = (t: number) => x0 + (t / 1.5) * (x1 - x0);
    const Y = (f: number) => y0 - f * (y0 - y1);
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('N₀/N vs T/T_c', 16, 32);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const f of [0, 0.5, 1]) {
      ictx.beginPath(); ictx.moveTo(x0, Y(f)); ictx.lineTo(x1, Y(f)); ictx.stroke();
      ictx.fillStyle = '#56627c';
      if (f > 0) ictx.fillText(f.toFixed(1), 12, Y(f) + 8);
    }
    for (const t of [0, 0.5, 1, 1.5]) {
      ictx.beginPath(); ictx.moveTo(X(t), y0); ictx.lineTo(X(t), y1); ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(t.toFixed(1), X(t) - 16, y0 + 28);
    }
    // uniform box, dashed
    ictx.setLineDash([8, 8]);
    ictx.strokeStyle = '#8391ab';
    ictx.lineWidth = 2;
    ictx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const t = (1.5 * i) / 90;
      const y = Y(fractionBox(t));
      if (i === 0) ictx.moveTo(X(t), y); else ictx.lineTo(X(t), y);
    }
    ictx.stroke();
    ictx.setLineDash([]);
    // harmonic trap
    ictx.strokeStyle = css(PALETTE.amber);
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const t = (1.5 * i) / 90;
      const y = Y(fractionHarmonic(t));
      if (i === 0) ictx.moveTo(X(t), y); else ictx.lineTo(X(t), y);
    }
    ictx.stroke();
    // level sum at this N
    ictx.fillStyle = css(PALETTE.cyan);
    for (let i = 0; i < curveT.length; i++) {
      ictx.beginPath();
      ictx.arc(X(curveT[i]), Y(curveF[i]), 4, 0, 2 * Math.PI);
      ictx.fill();
    }
    // current state
    const tc = Math.min(1.5, th.t);
    ictx.fillStyle = '#ffffff';
    ictx.beginPath();
    ictx.arc(X(tc), Y(th.f0), 8, 0, 2 * Math.PI);
    ictx.fill();
    ictx.font = '18px JetBrains Mono, monospace';
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('trap 1−t³', W - 150, 32);
    ictx.fillStyle = '#8391ab';
    ictx.fillText('box 1−t^1.5', W - 150, 56);
    ictx.fillStyle = css(PALETTE.cyan);
    ictx.fillText('• level sum', W - 150, 80);
  }

  // ---------------------------------------------------------------- per-frame view update
  let dirty = true;
  let colorsDirty = true;

  function placeScaleBars(): void {
    const len = niceLength(1.2 * L);
    const u = len / L;
    const z = HALF - 0.25;
    barPos.set([-HALF + 0.2, 0.01, z, -HALF + 0.2 + u, 0.01, z]);
    barAttr.needsUpdate = true;
    const txt = len >= 1e-3 ? `${(len * 1e3).toFixed(0)} mm` : `${Math.round(len * 1e6)} µm`;
    barLabel.element.textContent = txt;
    barLabel.position.set(-HALF + 0.2 + u / 2, 0.02, z + 0.3);
    cloudBarPos.set([-u / 2, -1.25, 1.2, u / 2, -1.25, 1.2]);
    cloudBarAttr.needsUpdate = true;
    cloudBarLabel.element.textContent = txt;
    cloudBarLabel.position.set(0, -1.25, 1.55);
  }

  function updateScene(dt: number): void {
    // evaporation ramp
    if (evaporating) {
      const before = N;
      progress = Math.min(evapTarget, progress + dt * (touched ? 0.06 : 0.08));
      T = rampT(progress) * 1e-9;
      N = rampN(progress);
      tSlider.set(Math.log10(T * 1e9), false);
      nSlider.set(Math.log10(N), false);
      pSlider.set(progress, false);
      recompute();
      colorsDirty = true;
      const rate = Math.min(140, (M * Math.abs(Math.log(N / before)) * 6) / Math.max(dt, 1e-3));
      emitEscapees(dt, rate);
      if (progress >= evapTarget - 1e-9) {
        evaporating = false;
        evapBtn.textContent = 'Evaporate';
        computeCurve();
      }
    }
    // time of flight clock
    if (view === 'tof' && !tofDone) {
      tofClock = Math.min(tTof, tofClock + dt * (tTof / 2.5));
      if (tofClock >= tTof) tofDone = true;
      dirty = true;
    }
    const t = view === 'tof' ? tofClock : 0;
    // display scale eases toward its target so parameter jumps do not snap the view
    const target = scaleAt(t);
    if (Lshown === 0 || view === 'tof') Lshown = target;
    else {
      const next = Lshown + (target - Lshown) * Math.min(1, dt * 5);
      if (Math.abs(next / target - 1) > 1e-4) dirty = true;
      Lshown = Math.abs(next / target - 1) < 1e-4 ? target : next;
    }
    L = Lshown;
    widthsAt(t);
    if (dirty) {
      buildImage();
      placeScaleBars();
      dirty = false;
    }
    if (colorsDirty) {
      writeColors();
      colorsDirty = false;
    }
    visT += dt;
    writePoints(t);
    stepEscapees(dt);

    // evaporation edge: the surface where V = eta kT
    const sp = SPECIES[species];
    const vc = Math.sqrt((2 * ETA * KB * T) / sp.m);
    const showKnife = view === 'trap' && evaporating;
    const kop = showKnife ? 1 : 0;
    const km = knife.material as THREE.MeshBasicMaterial;
    km.opacity += (0.1 * kop - km.opacity) * Math.min(1, dt * 4);
    knife.visible = km.opacity > 0.005;
    knifeLabel.visible = showKnife;
    knife.scale.set(vc / fr.wz / L, vc / fr.wperp / L, vc / fr.wperp / L);
    knifeLabel.position.set(0, -vc / fr.wperp / L - 0.3, 0.6);
    const txt = th.t >= 1 ? 'T > T_c · thermal cloud only' : `T < T_c · condensate ${(th.f0 * 100).toFixed(0)}%`;
    if (txt !== phaseText) {
      phaseText = txt;
      phaseLabel.element.textContent = txt;
      phaseLabel.element.style.color = th.t >= 1 ? css(PALETTE.cyan) : css(PALETTE.amber);
    }
  }

  let phaseText = '';
  let insetTimer = 1;
  stage.onFrame((dt) => {
    updateScene(dt);
    insetTimer += dt;
    if (insetTimer > 0.1) {
      insetTimer = 0;
      drawInset();
      updateReadouts();
    }
  });

  // ---------------------------------------------------------------- controls
  const touch = (ctl: string) => {
    touched = true;
    if (evaporating && ctl !== 'evap') stopEvap();
    if (ctl !== 'N') lastCtl = ctl;
  };
  function stopEvap(): void {
    evaporating = false;
    evapBtn.textContent = 'Evaporate';
    computeCurve();
  }
  const fmtN = (v: number) => {
    const n = Math.pow(10, v);
    const e = Math.floor(Math.log10(n));
    return `${(n / 10 ** e).toFixed(2)}×10^${e}`;
  };

  const ui = new Panel(panel);
  ui.section('Cloud');
  const tSlider = ui.slider({
    key: 'T', label: 'Temperature T', min: 1, max: 3.3, step: 0.002, value: Math.log10(T * 1e9),
    format: (v) => `${Math.pow(10, v).toFixed(Math.pow(10, v) < 100 ? 1 : 0)} nK`,
    onInput: (v) => { touch('T'); T = Math.pow(10, v) * 1e-9; recompute(); },
  });
  const nSlider = ui.slider({
    key: 'N', label: 'Atom number N', min: 4, max: 7, step: 0.01, value: Math.log10(N), format: fmtN,
    onInput: (v) => {
      if (lastCtl !== 'N') {
        nStart = N;
        tcStart = th.Tc;
        lastCtl = 'N';
      }
      touch('N');
      N = Math.pow(10, v);
      recompute();
      colorsDirty = true;
    },
  });
  ui.slider({
    key: 'nu', label: 'Trap frequency ν̄ = ω̄/2π', min: 20, max: 400, step: 5, value: nuBar, unit: 'Hz',
    onInput: (v) => { touch('nu'); nuBar = v; recompute(); colorsDirty = true; },
  });
  ui.slider({
    key: 'k', label: 'Elongation ω⊥/ω_z', min: 1, max: 6, step: 1, value: k,
    onInput: (v) => { touch('k'); k = v; recompute(); },
  });
  ui.select<SpeciesId>({
    key: 'species', label: 'Species', value: species,
    options: [{ value: 'rb87', label: 'Rubidium-87' }, { value: 'na23', label: 'Sodium-23' }],
    onChange: (v) => { touch('species'); species = v; recompute(); },
  });
  ui.toggle({ key: 'interactions', label: 'Interactions (condensate shape only)', value: interactions, onChange: (v) => { touch('interactions'); interactions = v; recompute(); } });

  ui.section('Evaporative cooling');
  const [evapBtn] = ui.buttons([
    {
      label: 'Pause', primary: true, key: 'evap', onClick: () => {
        touch('evap');
        if (evaporating) { stopEvap(); return; }
        if (progress >= 0.999) progress = 0;
        evapTarget = 1;
        evaporating = true;
        evapBtn.textContent = 'Pause';
      },
    },
    {
      label: 'Reset ramp', key: 'progress', onClick: () => {
        touch('ramp');
        stopEvap();
        progress = 0;
        T = rampT(0) * 1e-9;
        N = rampN(0);
        tSlider.set(Math.log10(T * 1e9), false);
        nSlider.set(Math.log10(N), false);
        pSlider.set(0, false);
        recompute();
        colorsDirty = true;
      },
    },
  ]);
  const pSlider = ui.slider({
    key: 'progress', label: 'Evaporation progress', min: 0, max: 1, step: 0.005, value: progress,
    format: (v) => `${Math.round(v * 100)}%`,
    onInput: (v) => {
      touch('ramp');
      progress = v;
      T = rampT(v) * 1e-9;
      N = rampN(v);
      tSlider.set(Math.log10(T * 1e9), false);
      nSlider.set(Math.log10(N), false);
      recompute();
      colorsDirty = true;
    },
  });
  ui.note(`Illustrative ramp: T falls from ${RAMP_T0} to ${RAMP_T1} nK while N ∝ T^${RAMP_NU}. The trap edge sits at ${ETA} k_BT.`);

  ui.section('Imaging');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'trap', label: 'In the trap' }, { value: 'tof', label: 'Time of flight' }],
    onChange: (v) => { touch('view'); setView(v); },
  });
  ui.slider({
    key: 'tof', label: 'Flight time', min: 2, max: 30, step: 1, value: tTof * 1e3, unit: 'ms',
    onInput: (v) => { touch('tof'); tTof = v * 1e-3; if (view === 'tof') drop(); },
  });
  ui.buttons([{ label: 'Drop again', key: 'tof', onClick: () => { touch('tof'); if (view === 'tof') drop(); else setView('tof'); } }]);

  function drop(): void {
    tofClock = 0;
    tofDone = false;
    relPhase = visT * 0.6;
    dirty = true;
  }
  function setView(v: View): void {
    view = v;
    if (v === 'tof') drop();
    dirty = true;
  }

  ui.section('Live readouts');
  const rTc = ui.readout('Tc', 'T_c', 'nK');
  const rT = ui.readout('tRatio', 'T / T_c');
  const rF = ui.readout('frac', 'N₀/N = 1 − t³');
  const rFx = ui.readout('fracExact', 'N₀/N level sum');
  const rL = ui.readout('lambda', 'λ_dB', 'µm');
  const rD = ui.readout('spacing', 'spacing at peak', 'µm');
  const rP = ui.readout('psd', 'peak nλ³ (thermal)');
  const rMu = ui.readout('mu', 'TF μ / k_B');
  const rAc = ui.readout('aspectC', 'condensate long/short');
  const rAt = ui.readout('aspectT', 'thermal axial/radial');
  const rNr = ui.readout('nRatio', 'N / N before');
  const rTr = ui.readout('tcRatio', 'T_c / T_c before');
  ui.legend([
    { color: css(PALETTE.amber), label: 'condensate · trap curve' },
    { color: css(PALETTE.cyan), label: 'thermal atoms · level sum' },
    { color: css(PALETTE.red), label: 'evaporated atoms' },
  ]);

  const um = (m: number) => (m * 1e6 < 0.1 ? (m * 1e6).toFixed(3) : (m * 1e6).toFixed(2));
  let aspC = 1, aspT = 1;
  function updateReadouts(): void {
    const sp = SPECIES[species];
    if (exactStale && levels) {
      fExact = levels.fraction(N, (HBAR * fr.wz) / (KB * T));
      exactStale = false;
    }
    rTc((th.Tc * 1e9).toFixed(0));
    rT(th.t.toFixed(3));
    rF(th.f0.toFixed(3));
    rFx(Number.isFinite(fExact) ? fExact.toFixed(3) : '…');
    const lam = deBroglie(sp.m, T);
    rL(um(lam));
    const nPeak = th.psd / lam ** 3;
    rD(um(Math.cbrt(1 / nPeak)));
    rP(th.psd.toFixed(3));
    rMu(th.N0 <= 0 ? 'no condensate' : useTF ? `${(mu / KB * 1e9).toFixed(0)} nK` : 'ideal gas');
    aspT = sTa / sTr;
    aspC = th.N0 > 0 ? cA / cR : NaN;
    rAc(Number.isFinite(aspC) ? aspC.toFixed(2) : '—');
    rAt(aspT.toFixed(2));
    const hasBase = tcStart > 0 && lastCtl === 'N';
    rNr(hasBase ? (N / nStart).toFixed(3) : '—');
    rTr(hasBase ? (th.Tc / tcStart).toFixed(3) : '—');
  }

  recompute();
  computeCurve();
  tcStart = 0;

  return {
    state: () => ({
      T: T * 1e9,
      N,
      nu: nuBar,
      k,
      species,
      view,
      interactions,
      touched,
      evaporating,
      progress,
      t: th.t,
      Tc: th.Tc * 1e9,
      f0: th.f0,
      fExact: Number.isFinite(fExact) ? fExact : 0,
      psd: th.psd,
      zeta3: ZETA3,
      crossed,
      nRatio: tcStart > 0 && lastCtl === 'N' ? N / nStart : 0,
      tcRatio: tcStart > 0 && lastCtl === 'N' ? th.Tc / tcStart : 0,
      tofMs: tofClock * 1e3,
      tofDone: view === 'tof' && tofDone,
      aspectC: Number.isFinite(aspC) ? aspC : 0,
      aspectT: aspT,
      hbarOmegaNK: (HBAR * fr.wbar) / KB * 1e9,
      criticalCheck: criticalT(N, fr.wbar) * 1e9,
      peakCol,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      dotTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'bose-einstein',
  number: 44,
  title: 'Bose–Einstein Condensates',
  domain: 'thermo',
  level: 3,
  status: 'live',
  tagline: 'Cool atoms enough and they march as one wave.',
  content,
  mount,
};

export default topic;
