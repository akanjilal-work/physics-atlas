import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  ATM, HBARC, LAMOREAUX, MOHIDEEN, casimir1DExact, casimir1DExp, logSlope, platePressure, sphereForcePFA,
} from './physics.ts';

type Geometry = 'plates' | 'sphere';

// ---------------------------------------------------------------- ranges (log10, SI)
const LD_MIN = -8.3; // about 5 nm
const LD_MAX = Math.log10(10e-6);
const LA_MIN = -10; // 10 um x 10 um
const LA_MAX = 0; // 1 m^2
const LR_MIN = -5; // 10 um
const LR_MAX = Math.log10(0.2); // 20 cm
const LOG2 = Math.log10(2);
const K_CANT = 0.02; // N/m, typical AFM cantilever

// ---------------------------------------------------------------- scene layout
const PTS = 96; // points per wave lane
const MAX_IN = 24;
const OUT_MULT = 3;
const MAX_OUT = MAX_IN * OUT_MULT; // per side
const OUT_LEN = 4.2; // visual extent of the outside region
const PLATE_T = 0.12;
const ARROW_ROWS = 3;

const CAM_PLATES: [number, number, number] = [0.9, 1.5, 10.2];
const TGT_PLATES: [number, number, number] = [0, -0.1, 0];
const CAM_SPHERE: [number, number, number] = [0.6, 1.4, 8.6];
const TGT_SPHERE: [number, number, number] = [-0.9, -0.5, 0];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- formatting
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');
function sci(x: number, dig = 2): string {
  if (x === 0 || !Number.isFinite(x)) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  let m = x / 10 ** e;
  let ee = e;
  if (Math.abs(Number(m.toFixed(dig))) >= 10) { m /= 10; ee += 1; }
  if (ee >= -2 && ee <= 3) return Number(x.toPrecision(dig + 1)).toString();
  return `${m.toFixed(dig)}×10${sup(ee)}`;
}
function fmtLen(m: number): string {
  if (m >= 1e-2 * 0.999999) return `${(m * 1e2).toPrecision(3)} cm`;
  if (m >= 1e-3 * 0.999999) return `${(m * 1e3).toPrecision(3)} mm`;
  if (m >= 1e-6 * 0.999999) return `${(m * 1e6).toPrecision(3)} µm`;
  return `${(m * 1e9).toPrecision(3)} nm`;
}
function fmtArea(a: number): string {
  if (a >= 1e-4 * 0.999999) return `${(a * 1e4).toPrecision(3)} cm²`;
  if (a >= 1e-6 * 0.999999) return `${(a * 1e6).toPrecision(3)} mm²`;
  return `${(a * 1e12).toPrecision(3)} µm²`;
}
function fmtPa(p: number): string {
  if (p >= 1e3 * 0.999999) return `${sci(p)} Pa`;
  if (p >= 1 * 0.999999) return `${p.toPrecision(3)} Pa`;
  if (p >= 1e-3 * 0.999999) return `${(p * 1e3).toPrecision(3)} mPa`;
  if (p >= 1e-6 * 0.999999) return `${(p * 1e6).toPrecision(3)} µPa`;
  return `${sci(p)} Pa`;
}
function fmtN(f: number): string {
  if (f >= 1e-3 * 0.999999) return `${sci(f)} N`;
  if (f >= 1e-6 * 0.999999) return `${(f * 1e6).toPrecision(3)} µN`;
  if (f >= 1e-9 * 0.999999) return `${(f * 1e9).toPrecision(3)} nN`;
  if (f >= 1e-12 * 0.999999) return `${(f * 1e12).toPrecision(3)} pN`;
  return `${sci(f)} N`;
}

// Small seeded PRNG so the continuum looks the same on every load.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_PLATES, target: TGT_PLATES, fov: 42 });
  const { scene } = stage;

  let geometry: Geometry = 'plates';
  let logD = -6; // 1 um
  let logA = -4; // 1 cm^2
  let logR = Math.log10(MOHIDEEN.R);
  let density = 10;
  let halveFactor = 0;
  let halveGeom = '';

  // derived
  let d = 1e-6;
  let P = 0; // magnitude, Pa
  let F = 0; // magnitude, N
  let slope = -4;
  let gv = 1; // visual gap (plates)
  let side = 3.4; // visual plate size

  // ============================================================ plates view
  const plates = new THREE.Group();
  scene.add(plates);

  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xc4ccda, metalness: 0.85, roughness: 0.28, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
  });
  const plateGeo = new THREE.BoxGeometry(PLATE_T, 1, 1);
  const plateL = new THREE.Mesh(plateGeo, plateMat);
  const plateR = new THREE.Mesh(plateGeo, plateMat);
  plates.add(plateL, plateR);
  const edgeGeo = new THREE.EdgesGeometry(plateGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xdfe6f3, transparent: true, opacity: 0.7 });
  const edgeL = new THREE.LineSegments(edgeGeo, edgeMat);
  const edgeR = new THREE.LineSegments(edgeGeo, edgeMat);
  plateL.add(edgeL);
  plateR.add(edgeR);

  // Wave lanes: one LineSegments for the discrete modes, one for the continuum.
  function laneGeometry(lanes: number): { geo: THREE.BufferGeometry; pos: Float32Array; col: Float32Array } {
    const nv = lanes * (PTS - 1) * 2;
    const pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setDrawRange(0, 0);
    return { geo, pos, col };
  }
  const waveMat = () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const inside = laneGeometry(MAX_IN);
  const insideLines = new THREE.LineSegments(inside.geo, waveMat());
  insideLines.frustumCulled = false;
  insideLines.renderOrder = 2;
  plates.add(insideLines);
  const outside = laneGeometry(MAX_OUT * 2);
  const outsideLines = new THREE.LineSegments(outside.geo, waveMat());
  outsideLines.frustumCulled = false;
  outsideLines.renderOrder = 1;
  plates.add(outsideLines);

  // Continuum: fixed random wavenumber fraction, phase and brightness per lane.
  const rnd = rng(1948);
  const outU = new Float32Array(MAX_OUT * 2);
  const outPh = new Float32Array(MAX_OUT * 2);
  for (let i = 0; i < MAX_OUT * 2; i++) {
    outU[i] = 0.04 + 0.96 * rnd();
    outPh[i] = rnd() * Math.PI * 2;
  }
  // lane parameters, rebuilt when density or size changes
  const inY = new Float32Array(MAX_IN);
  const outY = new Float32Array(MAX_OUT * 2);
  let nIn = 0;
  let nOut = 0;
  let amp = 0.1;

  // Glow between the plates: a faint amber sheet that marks the "depleted" region
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.z = -0.02;
  plates.add(glow);

  // Pressure arrows on the outer faces
  const arrows: THREE.ArrowHelper[] = [];
  const arrowCol = PALETTE.rose;
  for (let s = 0; s < 2; s++) {
    for (let r = 0; r < ARROW_ROWS; r++) {
      for (let c = 0; c < 2; c++) {
        const a = new THREE.ArrowHelper(new THREE.Vector3(s === 0 ? 1 : -1, 0, 0), new THREE.Vector3(), 1, arrowCol, 0.22, 0.14);
        plates.add(a);
        arrows.push(a);
      }
    }
  }

  // Gap dimension line
  const dimPos = new Float32Array(6 * 3);
  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute('position', new THREE.BufferAttribute(dimPos, 3));
  const dimLine = new THREE.LineSegments(dimGeo, new THREE.LineBasicMaterial({ color: 0xdfe6f3 }));
  plates.add(dimLine);
  const gapLabel = stage.label('', [0, 0, 0], '', plates);
  gapLabel.element.style.color = '#dfe6f3';
  const inLabel = stage.label('between: only λ = 2d/n fits', [0, 0, 0], 'muted', plates);
  inLabel.element.style.color = css(PALETTE.amber);
  const outLabelL = stage.label('outside: every λ', [0, 0, 0], 'muted', plates);
  outLabelL.element.style.color = css(PALETTE.cyan);
  const outLabelR = stage.label('outside: every λ', [0, 0, 0], 'muted', plates);
  outLabelR.element.style.color = css(PALETTE.cyan);
  const pLabel = stage.label('', [0, 0, 0], 'big', plates);
  pLabel.element.style.color = css(PALETTE.rose);

  // ============================================================ sphere view
  const sph = new THREE.Group();
  sph.visible = false;
  scene.add(sph);
  const FLAT_TOP = -1.6;
  const flat = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.18, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xb9c2d3, metalness: 0.85, roughness: 0.3 }),
  );
  flat.position.set(-0.8, FLAT_TOP - 0.09, 0);
  sph.add(flat);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xe8c068, metalness: 0.45, roughness: 0.3, emissive: 0x2a1c05 }),
  );
  sph.add(ball);
  // Cantilever: a segmented beam bent in place
  const BEAM_L = 4.2;
  const BEAM_X0 = -BEAM_L; // clamped end, tip at x = 0
  const beamGeo = new THREE.BoxGeometry(BEAM_L, 0.07, 0.55, 40, 1, 1);
  beamGeo.translate(BEAM_X0 + BEAM_L / 2, 0, 0);
  const beamBase = Float32Array.from(beamGeo.attributes.position.array as Float32Array);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshStandardMaterial({ color: 0x8fa0bf, metalness: 0.6, roughness: 0.35 }));
  sph.add(beam);
  const chip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.4, roughness: 0.6 }));
  sph.add(chip);
  // Active patch on the flat
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  patch.rotation.x = -Math.PI / 2;
  sph.add(patch);
  // Force arrow on the sphere
  const fArrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, PALETTE.rose, 0.2, 0.13);
  sph.add(fArrow);
  // Laser readout
  const laserPos = new Float32Array(9);
  const laserGeo = new THREE.BufferGeometry();
  laserGeo.setAttribute('position', new THREE.BufferAttribute(laserPos, 3));
  const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0.85 }));
  laser.frustumCulled = false;
  sph.add(laser);
  const LASER_SRC = new THREE.Vector3(-2.4, 1.9, 0);
  const DET_X = 3.0;
  const detector = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x28324a, emissive: 0x0c1220 }));
  sph.add(detector);
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
  sph.add(spot);
  const laserSrc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x3a4660 }));
  sph.add(laserSrc);
  const laserLabel = stage.label('laser', [0, 0, 0], 'muted', sph);
  const detLabel = stage.label('photodiode', [DET_X + 0.1, 0, 0], 'muted', sph);
  const cantLabel = stage.label('cantilever (bend exaggerated)', [-2.4, 0, 0.5], 'muted', sph);
  const sGapLabel = stage.label('', [0, 0, 0], '', sph);
  sGapLabel.element.style.color = '#dfe6f3';
  sGapLabel.center.set(0, 0.5);
  const patchLabel = stage.label('7/8 of the force comes from here', [0, 0, 0], 'muted', sph);
  patchLabel.element.style.color = css(PALETTE.amber);
  patchLabel.center.set(1, 0);
  const fLabel = stage.label('', [0, 0, 0], 'big', sph);
  fLabel.element.style.color = css(PALETTE.rose);
  fLabel.center.set(0, 0.5);

  // ============================================================ overlays
  const boxStyle = {
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute',
  };
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    ...boxStyle, left: '10px', top: '10px', maxWidth: '220px', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    legend.innerHTML = geometry === 'plates'
      ? `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Counting modes</div>
<div><span style="color:${css(PALETTE.amber)}">amber</span>: standing waves that fit between the plates, n = 1, 2, 3…</div>
<div><span style="color:${css(PALETTE.cyan)}">cyan</span>: outside, any wavelength</div>
<div><span style="color:${css(PALETTE.rose)}">arrows</span>: net push, length ∝ log P</div>
<div style="margin-top:3px;color:#8391ab">not to scale</div>`
      : `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Sphere near a plate</div>
<div>The attraction bends the cantilever. The <span style="color:${css(PALETTE.red)}">laser</span> spot moves on the photodiode.</div>
<div><span style="color:${css(PALETTE.amber)}">glow</span>: patch of radius √(2Rd) that gives 7/8 of the force</div>
<div style="margin-top:3px;color:#8391ab">not to scale</div>`;
  }

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 260;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '240px', height: '130px' } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const strip = document.createElement('canvas');
  strip.width = 480;
  strip.height = 170;
  Object.assign(strip.style, { ...boxStyle, right: '10px', top: '10px', width: '240px', height: '85px' } as CSSStyleDeclaration);
  viewport.appendChild(strip);
  const sctx = strip.getContext('2d')!;

  // k axis of the spectrum strip, log10 of k in 1/m
  const LK0 = 5;
  const LK1 = 10;

  function drawStrip(): void {
    const W = strip.width;
    const H = strip.height;
    const L = 16;
    const R = W - 16;
    const xOf = (lk: number) => L + ((lk - LK0) / (LK1 - LK0)) * (R - L);
    sctx.clearRect(0, 0, W, H);
    sctx.font = '20px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText('allowed wavenumbers k (log)', L, 26);
    // outside: continuous band
    const y1 = 44;
    const g = sctx.createLinearGradient(L, 0, R, 0);
    g.addColorStop(0, 'rgba(79,209,232,0.25)');
    g.addColorStop(1, 'rgba(79,209,232,0.8)');
    sctx.fillStyle = g;
    sctx.fillRect(L, y1, R - L, 30);
    sctx.fillStyle = '#dfe6f3';
    sctx.fillText('outside', L + 6, y1 + 22);
    // between: discrete k_n = n pi / d
    const y2 = 88;
    const k1 = Math.PI / d;
    sctx.strokeStyle = css(PALETTE.amber);
    sctx.lineWidth = 2;
    let lastX = -10;
    for (let n = 1; n < 100000; n++) {
      const x = xOf(Math.log10(n * k1));
      if (x > R) break;
      if (x - lastX < 1.2) {
        // modes too dense to resolve: fill the rest as a band
        sctx.fillStyle = 'rgba(245,182,66,0.8)';
        sctx.fillRect(x, y2, R - x, 30);
        break;
      }
      if (x >= L) {
        sctx.beginPath();
        sctx.moveTo(x, y2);
        sctx.lineTo(x, y2 + 30);
        sctx.stroke();
      }
      lastX = x;
    }
    // missing band
    const xm = Math.max(L, Math.min(R, xOf(Math.log10(k1))));
    if (xm > L + 4) {
      sctx.fillStyle = 'rgba(255,107,107,0.12)';
      sctx.fillRect(L, y2, xm - L, 30);
      sctx.fillStyle = '#ff9b9b';
      sctx.fillText(xm - L > 150 ? 'missing: λ > 2d' : '', L + 6, y2 + 22);
    }
    sctx.fillStyle = '#dfe6f3';
    if (R - xm > 120) sctx.fillText('between', Math.min(R - 90, xm + 8), y2 + 50);
    sctx.fillStyle = '#56627c';
    sctx.fillText('λ = 60 µm', L, H - 8);
    sctx.fillText('0.6 nm', R - 70, H - 8);
  }

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    const L = 58;
    const R = W - 16;
    const T = 44;
    const B = H - 34;
    const plateMode = geometry === 'plates';
    const f = (x: number) => (plateMode ? Math.abs(platePressure(x)) : Math.abs(sphereForcePFA(10 ** logR, x)));
    const y0 = Math.log10(f(10 ** LD_MAX));
    const y1 = Math.log10(f(10 ** LD_MIN));
    const xOf = (ld: number) => L + ((ld - LD_MIN) / (LD_MAX - LD_MIN)) * (R - L);
    const yOf = (ly: number) => B - ((ly - y0) / (y1 - y0)) * (B - T);
    ictx.clearRect(0, 0, W, H);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText(plateMode ? 'log P vs log d   slope −4' : 'log F vs log d   slope −3', 16, 28);
    // grid: decades of d
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.fillStyle = '#56627c';
    for (const [ld, lab] of [[-8, '10 nm'], [-7, '100 nm'], [-6, '1 µm'], [-5, '10 µm']] as [number, string][]) {
      const x = xOf(ld);
      ictx.beginPath();
      ictx.moveTo(x, T);
      ictx.lineTo(x, B);
      ictx.stroke();
      ictx.fillText(lab, Math.min(R - 70, x - 20), H - 8);
    }
    // decade ticks on y
    for (let e = Math.ceil(y0 / 3) * 3; e <= y1; e += 3) {
      const y = yOf(e);
      ictx.beginPath();
      ictx.moveTo(L, y);
      ictx.lineTo(R, y);
      ictx.stroke();
      ictx.fillText(String(e), 8, y + 6);
    }
    if (plateMode) {
      const ya = yOf(Math.log10(ATM));
      ictx.setLineDash([8, 6]);
      ictx.strokeStyle = css(PALETTE.cyan);
      ictx.lineWidth = 2;
      ictx.beginPath();
      ictx.moveTo(L, ya);
      ictx.lineTo(R, ya);
      ictx.stroke();
      ictx.setLineDash([]);
      ictx.fillStyle = css(PALETTE.cyan);
      ictx.fillText('1 atm', R - 70, ya - 6);
    } else {
      // experiment ranges
      const bars: [typeof LAMOREAUX, number][] = [[LAMOREAUX, B - 8], [MOHIDEEN, B - 20]];
      ictx.lineWidth = 6;
      for (const [ex, y] of bars) {
        ictx.strokeStyle = ex === LAMOREAUX ? 'rgba(94,227,154,0.7)' : 'rgba(167,139,250,0.7)';
        ictx.beginPath();
        ictx.moveTo(xOf(Math.log10(ex.dMin)), y);
        ictx.lineTo(xOf(Math.log10(ex.dMax)), y);
        ictx.stroke();
      }
      ictx.fillStyle = css(PALETTE.green);
      ictx.fillText('Lamoreaux', xOf(Math.log10(LAMOREAUX.dMin)), B - 16);
      ictx.fillStyle = css(PALETTE.violet);
      ictx.fillText('Mohideen', xOf(Math.log10(MOHIDEEN.dMin)) - 96, B - 26);
    }
    ictx.strokeStyle = css(PALETTE.amber);
    ictx.lineWidth = 3;
    ictx.beginPath();
    ictx.moveTo(xOf(LD_MIN), yOf(y1));
    ictx.lineTo(xOf(LD_MAX), yOf(y0));
    ictx.stroke();
    ictx.fillStyle = css(PALETTE.rose);
    ictx.beginPath();
    ictx.arc(xOf(logD), yOf(Math.log10(f(d))), 8, 0, Math.PI * 2);
    ictx.fill();
  }

  // ============================================================ layout updates
  const tmpV = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  function layoutLanes(): void {
    nIn = density;
    nOut = density * OUT_MULT;
    const H = side * 0.86;
    for (let i = 0; i < nIn; i++) inY[i] = -H / 2 + ((i + 0.5) * H) / nIn;
    for (let i = 0; i < nOut; i++) outY[i] = -H / 2 + ((i + 0.5) * H) / nOut;
    amp = Math.min(0.2, (0.42 * H) / nIn);
    // colours
    const ca = new THREE.Color(PALETTE.amber);
    const cc = new THREE.Color(PALETTE.cyan);
    const per = (PTS - 1) * 2;
    for (let i = 0; i < nIn; i++) {
      const b = 1 - (0.55 * i) / Math.max(1, nIn - 1);
      for (let v = 0; v < per; v++) {
        const o = (i * per + v) * 3;
        inside.col[o] = ca.r * b;
        inside.col[o + 1] = ca.g * b;
        inside.col[o + 2] = ca.b * b;
      }
    }
    for (let j = 0; j < nOut * 2; j++) {
      const b = 0.28 + 0.3 * outPh[j] / (Math.PI * 2);
      for (let v = 0; v < per; v++) {
        const o = (j * per + v) * 3;
        outside.col[o] = cc.r * b;
        outside.col[o + 1] = cc.g * b;
        outside.col[o + 2] = cc.b * b;
      }
    }
    (inside.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (outside.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    inside.geo.setDrawRange(0, nIn * per);
    outside.geo.setDrawRange(0, nOut * 2 * per);
  }

  function layoutPlates(): void {
    const t = clamp01((logD - LD_MIN) / (LD_MAX - LD_MIN));
    gv = 0.7 + 2.5 * t;
    side = 2.4 + 1.6 * clamp01((logA - LA_MIN) / (LA_MAX - LA_MIN));
    const xo = gv / 2 + PLATE_T / 2;
    plateL.position.set(-xo, 0, 0);
    plateR.position.set(xo, 0, 0);
    plateL.scale.set(1, side, side);
    plateR.scale.set(1, side, side);
    glow.scale.set(gv, side * 0.92, 1);
    // arrows: length grows with log P
    const tp = clamp01((Math.log10(P) + 7) / 13.5);
    const len = 0.35 + 1.25 * tp;
    const xOuter = gv / 2 + PLATE_T;
    let k = 0;
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1;
      for (let r = 0; r < ARROW_ROWS; r++) {
        for (let c = 0; c < 2; c++) {
          const a = arrows[k++];
          const y = (r - 1) * side * 0.3;
          const z = c === 0 ? side * 0.3 : -side * 0.3;
          a.position.set(sign * (xOuter + len + 0.04), y, z);
          a.setLength(len, Math.min(0.34, len * 0.4), Math.min(0.22, len * 0.26));
        }
      }
    }
    // dimension line under the plates
    const yb = -side / 2 - 0.25;
    const x0 = -gv / 2;
    const x1 = gv / 2;
    const tick = 0.1;
    dimPos.set([x0, yb, 0, x1, yb, 0, x0, yb - tick, 0, x0, yb + tick, 0, x1, yb - tick, 0, x1, yb + tick, 0]);
    (dimGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    gapLabel.position.set(0, yb - 0.3, 0);
    gapLabel.element.textContent = `d = ${fmtLen(d)}`;
    inLabel.position.set(0, side / 2 + 0.28, 0);
    outLabelL.position.set(-(xOuter + 1.5), -side / 2 - 0.3, 0);
    outLabelR.position.set(xOuter + OUT_LEN * 0.55, side / 2 + 0.28, 0);
    pLabel.position.set(0, side / 2 + 0.72, 0);
    pLabel.element.textContent = `P = ${fmtPa(P)} ${P > 0.05 * ATM ? `≈ ${(P / ATM).toPrecision(2)} atm` : ''}`;
    layoutLanes();
  }

  // cantilever bend: tip deflection delta, shape (3 s^2 - s^3) / 2
  let beamY = 0;
  let tipDefl = 0;
  function layoutSphere(): void {
    const tR = clamp01((logR - LR_MIN) / (LR_MAX - LR_MIN));
    const rv = 0.35 + 0.85 * tR;
    const t = clamp01((logD - LD_MIN) / (LD_MAX - LD_MIN));
    const gsv = 0.05 + 0.75 * t;
    const zReal = F / K_CANT; // metres
    tipDefl = 0.04 + 0.5 * clamp01((Math.log10(zReal) + 13) / 9);
    ball.scale.setScalar(rv);
    const cy = FLAT_TOP + gsv + rv;
    ball.position.set(0, cy, 0);
    const tipY = cy + rv + 0.035;
    beamY = tipY + tipDefl;
    const arr = beamGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = beamBase[i];
      const s = clamp01((x - BEAM_X0) / BEAM_L);
      arr[i] = x;
      arr[i + 1] = beamBase[i + 1] + beamY - (tipDefl * (3 * s * s - s * s * s)) / 2;
      arr[i + 2] = beamBase[i + 2];
    }
    beamGeo.attributes.position.needsUpdate = true;
    beamGeo.computeVertexNormals();
    beamGeo.computeBoundingSphere();
    chip.position.set(BEAM_X0 - 0.45, beamY + 0.1, 0);
    // patch radius sqrt(2 R d) in the drawn geometry
    const pr = Math.min(rv * 0.95, Math.sqrt(2 * rv * gsv));
    patch.scale.setScalar(pr);
    patch.position.set(0, FLAT_TOP + 0.004, 0);
    patchLabel.position.set(-pr - 0.1, FLAT_TOP + 0.02, 1.0);
    // force arrow from sphere centre downward
    const tf = clamp01((Math.log10(F) + 14) / 12);
    const fl = 0.3 + 1.0 * tf;
    fArrow.position.set(rv + 0.35, cy + fl / 2, 0);
    fArrow.setLength(fl, 0.2, 0.13);
    fLabel.position.set(rv + 0.55, cy, 0);
    fLabel.element.textContent = `F = ${fmtN(F)}`;
    sGapLabel.position.set(-rv - 1.3, FLAT_TOP + gsv / 2 + 0.05, 0);
    sGapLabel.element.textContent = `d = ${fmtLen(d)}`;
    cantLabel.position.set(-2.4, beamY + 0.35, 0.3);
    // laser: from source to the top of the beam near the tip, reflected
    LASER_SRC.y = tipY + 1.25;
    laserSrc.position.copy(LASER_SRC);
    laserLabel.position.set(LASER_SRC.x - 0.1, LASER_SRC.y + 0.35, 0);
    const sy = laserTo(beamY, tipDefl, true);
    detector.position.set(DET_X, laserTo(tipY, 0, false), 0);
    spot.position.set(DET_X - 0.07, sy, 0);
    detLabel.position.set(DET_X + 0.2, detector.position.y + 0.95, 0);
  }
  /** Reflect the laser off the bent beam. Returns the height where it meets the photodiode plane. */
  function laserTo(by: number, defl: number, write: boolean): number {
    const hitX = -0.25;
    const sh = clamp01((hitX - BEAM_X0) / BEAM_L);
    const hitY = by + 0.035 - (defl * (3 * sh * sh - sh * sh * sh)) / 2;
    const slopeY = -(defl * (6 * sh - 3 * sh * sh)) / (2 * BEAM_L);
    tmpV.set(hitX - LASER_SRC.x, hitY - LASER_SRC.y, 0).normalize(); // incoming
    tmpD.set(-slopeY, 1, 0).normalize(); // surface normal
    tmpV.addScaledVector(tmpD, -2 * tmpV.dot(tmpD)); // reflected
    const sy = hitY + tmpV.y * ((DET_X - hitX) / tmpV.x);
    if (write) {
      laserPos.set([LASER_SRC.x, LASER_SRC.y - 0.2, 0, hitX, hitY, 0, DET_X - 0.06, sy, 0]);
      (laserGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      laserGeo.computeBoundingSphere();
    }
    return sy;
  }

  function update(): void {
    d = 10 ** logD;
    const R = 10 ** logR;
    const A = 10 ** logA;
    P = Math.abs(platePressure(d));
    if (geometry === 'plates') {
      F = P * A;
      slope = logSlope(platePressure, d);
    } else {
      F = Math.abs(sphereForcePFA(R, d));
      slope = logSlope((x) => sphereForcePFA(R, x), d);
    }
    if (geometry === 'plates') layoutPlates();
    else layoutSphere();
    drawInset();
    drawStrip();
    updateReadouts();
  }

  function setGeometry(g: Geometry): void {
    geometry = g;
    plates.visible = g === 'plates';
    sph.visible = g === 'sphere';
    strip.style.display = g === 'plates' ? '' : 'none';
    halveFactor = 0;
    halveGeom = '';
    if (g === 'plates') stage.flyTo(CAM_PLATES, TGT_PLATES);
    else stage.flyTo(CAM_SPHERE, TGT_SPHERE);
    paintLegend();
    update();
  }

  // ============================================================ frame loop
  stage.onFrame((_dt, t) => {
    if (geometry !== 'plates') return;
    const per = (PTS - 1) * 2;
    // discrete modes: sin(n pi x / g), each oscillating at omega proportional to n
    const x0 = -gv / 2;
    for (let i = 0; i < nIn; i++) {
      const n = i + 1;
      const c = Math.cos((1.2 + 0.35 * n) * t);
      const y = inY[i];
      let o = i * per * 3;
      let px = x0;
      let py = y;
      for (let p = 1; p < PTS; p++) {
        const u = p / (PTS - 1);
        const x = x0 + gv * u;
        const yy = y + amp * c * Math.sin(n * Math.PI * u);
        const arr = inside.pos;
        arr[o] = px; arr[o + 1] = py; arr[o + 2] = 0;
        arr[o + 3] = x; arr[o + 4] = yy; arr[o + 5] = 0;
        o += 6;
        px = x;
        py = yy;
      }
    }
    (inside.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // continuum: any k up to the same top mode, node at the plate surface
    const kmax = (nIn * Math.PI) / gv;
    const xOuter = gv / 2 + PLATE_T;
    for (let j = 0; j < nOut * 2; j++) {
      const sign = j < nOut ? -1 : 1;
      const lane = j % nOut;
      const k = outU[j] * kmax;
      const c = Math.cos((1.2 + 0.35 * (k * gv) / Math.PI) * t + outPh[j]);
      const y = outY[lane];
      const a = amp * 0.75;
      let o = j * per * 3;
      let px = sign * xOuter;
      let py = y;
      for (let p = 1; p < PTS; p++) {
        const s = (p / (PTS - 1)) * OUT_LEN;
        const x = sign * (xOuter + s);
        const yy = y + a * c * Math.sin(k * s);
        const arr = outside.pos;
        arr[o] = px; arr[o + 1] = py; arr[o + 2] = 0;
        arr[o + 3] = x; arr[o + 4] = yy; arr[o + 5] = 0;
        o += 6;
        px = x;
        py = yy;
      }
    }
    (outside.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  // ============================================================ controls
  const ui = new Panel(panel);
  ui.section('Geometry');
  const geoCtl = ui.select<Geometry>({
    key: 'geometry', label: 'Setup', value: geometry,
    options: [{ value: 'plates', label: 'Parallel plates' }, { value: 'sphere', label: 'Sphere and plate' }],
    onChange: (v) => setGeometry(v),
  });

  ui.section('Gap');
  const gapCtl = ui.slider({
    key: 'gap', label: 'Gap d', min: LD_MIN, max: LD_MAX, step: 0.001, value: logD,
    format: (v) => fmtLen(10 ** v),
    onInput: (v) => { logD = v; update(); },
  });
  const setGap = (v: number) => {
    logD = Math.min(LD_MAX, Math.max(LD_MIN, v));
    gapCtl.set(logD, false);
    update();
  };
  ui.buttons([
    {
      label: 'Halve gap', key: 'halve', primary: true,
      onClick: () => {
        if (logD - LOG2 < LD_MIN - 1e-9) { rHalve('at minimum gap'); return; }
        const before = F;
        setGap(logD - LOG2);
        halveFactor = F / before;
        halveGeom = geometry;
        updateReadouts();
      },
    },
    { label: '1 µm', onClick: () => setGap(-6) },
    {
      label: 'Mohideen & Roy', key: 'radius',
      onClick: () => {
        logR = Math.log10(MOHIDEEN.R);
        rCtl.set(logR, false);
        if (geometry !== 'sphere') { geoCtl.set('sphere', false); setGeometry('sphere'); }
        setGap(-7);
      },
    },
  ]);

  ui.section('Size');
  ui.slider({
    key: 'area', label: 'Plate area A', min: LA_MIN, max: LA_MAX, step: 0.01, value: logA,
    format: (v) => fmtArea(10 ** v),
    onInput: (v) => { logA = v; update(); },
  });
  const rCtl = ui.slider({
    key: 'radius', label: 'Sphere radius R', min: LR_MIN, max: Number(LR_MAX.toFixed(3)), step: 0.001, value: logR,
    format: (v) => fmtLen(10 ** v),
    onInput: (v) => { logR = v; update(); },
  });
  ui.slider({
    key: 'density', label: 'Modes drawn between plates', min: 3, max: MAX_IN, step: 1, value: density,
    onInput: (v) => { density = Math.round(v); update(); },
  });
  ui.note('Area only matters for plates. Radius only matters for the sphere. The mode slider changes the picture, not the physics.');

  ui.section('Live readouts');
  const rP = ui.readout('pressure', 'plate pressure |F/A|');
  const rAtm = ui.readout('atm', 'in atmospheres');
  const rF = ui.readout('force', 'attractive force');
  const rSlope = ui.readout('slope', 'slope d ln F / d ln d');
  const rHalve = ui.readout('halve', 'last halving');
  const rLam = ui.readout('lambda', 'longest mode 2d');
  const rDefl = ui.readout('defl', 'tip bend (k = 0.02 N/m)');
  const rPatch = ui.readout('patch', 'patch √(2Rd)');
  const rCheck = ui.readout('check', '1D cutoff sum ÷ (−π/24d)');
  const rHc = ui.readout('hbarc', 'ħc');
  ui.legend([
    { color: css(PALETTE.amber), label: 'modes between plates' },
    { color: css(PALETTE.cyan), label: 'continuum outside' },
    { color: css(PALETTE.rose), label: 'Casimir push' },
  ]);

  // 1D mode-sum check with a small exponential cutoff (hbar = c = 1, d = 1)
  const check1D = casimir1DExp(1, 1e-3) / casimir1DExact(1);

  function updateReadouts(): void {
    rP(fmtPa(P));
    rAtm(sci(P / ATM, 2));
    rF(fmtN(F));
    rSlope(slope.toFixed(3));
    rHalve(halveFactor > 0 ? `F × ${halveFactor.toFixed(2)}` : 'press Halve');
    rLam(fmtLen(2 * d));
    rDefl(geometry === 'sphere' ? fmtLen(F / K_CANT) : 'sphere only');
    rPatch(geometry === 'sphere' ? fmtLen(Math.sqrt(2 * 10 ** logR * d)) : 'sphere only');
    rCheck(check1D.toFixed(6));
    rHc(`${sci(HBARC, 3)} J·m`);
  }

  paintLegend();
  update();

  return {
    state: () => ({
      geometry,
      d,
      logD,
      A: 10 ** logA,
      R: 10 ** logR,
      pressure: P,
      pressureAtm: P / ATM,
      force: F,
      slope,
      halveFactor,
      halveGeom,
      density,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      strip.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'casimir-effect',
  number: 94,
  title: 'The Casimir Effect',
  domain: 'foundations',
  level: 2,
  status: 'live',
  tagline: 'Empty space pushes two plates together.',
  content,
  mount,
};

export default topic;
