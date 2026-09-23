import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AGE_UNIVERSE_YR,
  band,
  entropy,
  evolveMass,
  hawkingT,
  lifetime,
  massForLifetime,
  massForTemperature,
  M_MOON,
  M_MOUNTAIN,
  M_SUN,
  netPower,
  PAGE_FRACTION_SIMPLE,
  photonRate,
  power,
  schwarzschildRadius,
  T_CMB,
  wienPeak,
  YEAR,
} from './physics.ts';

const LOG_MIN = 9; // slider range, log10 kg
const LOG_MAX = 30.5;
const LOG_R0 = 5; // mass where the drawn radius bottoms out
const R_MIN = 0.2;
const R_MAX = 1.5;
const NP = 44; // pair pool
const NC = 140; // CMB motes
const NSTAR = 700;
const TAU_END = 0.1; // s of remaining life that triggers the flash
const FLASH_DUR = 2.4;
const DEFAULT_LOGM = Math.log10(2e19);
const MONO = 'JetBrains Mono, ui-monospace, monospace';

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const SUP = '⁻⁰¹²³⁴⁵⁶⁷⁸⁹';
function fmtSci(x: number, d = 2): string {
  if (!Number.isFinite(x) || x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 0.01 && ax < 1000) return x.toPrecision(3);
  if (ax >= 1000 && ax < 1e4) return String(Math.round(x));
  const e = Math.floor(Math.log10(ax));
  let m = x / 10 ** e;
  let ee = e;
  if (Math.abs(Number(m.toFixed(d))) >= 10) {
    m /= 10;
    ee += 1;
  }
  const sup = String(ee).replace(/[-0-9]/g, (ch) => SUP['-0123456789'.indexOf(ch)]);
  return `${m.toFixed(d)}×10${sup}`;
}
function fmtTime(sec: number): string {
  if (sec < YEAR) return `${fmtSci(sec)} s`;
  return `${fmtSci(sec / YEAR)} yr`;
}
function fmtLen(m: number): string {
  if (m >= 1000) return `${fmtSci(m / 1000)} km`;
  return `${fmtSci(m)} m`;
}

/** Halo that peaks just outside a disk filling 58% of the sprite radius. */
function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.58, 'rgba(255,255,255,1)');
  grad.addColorStop(0.64, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.9, 'rgba(255,255,255,0.04)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tanner Helland's fit to blackbody colour, valid for roughly 1000 K to 40 000 K. */
function helland(T: number, out: THREE.Color): THREE.Color {
  const t = T / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return out.setRGB(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255, THREE.SRGBColorSpace);
}

const C_FAINT = new THREE.Color(0.1, 0.05, 0.09);
const C_UV = new THREE.Color(0.62, 0.5, 1.0);
const C_XRAY = new THREE.Color(0.42, 0.88, 1.0);
const C_GAMMA = new THREE.Color(1.0, 0.7, 1.0);
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Glow colour for temperature T: blackbody in the visible, false colour beyond. */
function glowColor(T: number, out: THREE.Color): THREE.Color {
  const lt = Math.log10(T);
  if (lt < 2.5) return out.copy(C_FAINT);
  if (lt < 3.1) {
    helland(1260, tmpA).multiplyScalar(0.55);
    return out.copy(C_FAINT).lerp(tmpA, (lt - 2.5) / 0.6);
  }
  if (lt <= 4.6) return helland(T, out);
  if (lt < 5.5) return out.copy(helland(39800, tmpB)).lerp(C_UV, (lt - 4.6) / 0.9);
  if (lt < 6.8) return out.copy(C_UV).lerp(C_XRAY, (lt - 5.5) / 1.3);
  if (lt < 9) return out.copy(C_XRAY).lerp(C_GAMMA, (lt - 6.8) / 2.2);
  return out.copy(C_GAMMA);
}

const radiusOf = (M: number) => R_MIN + (R_MAX - R_MIN) * clamp((Math.log10(M) - LOG_R0) / (LOG_MAX - LOG_R0), 0, 1);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 0.9, 6.6], target: [0, 0.05, 0], fov: 45, lights: false });
  const { scene, camera } = stage;
  const glowTex = glowTexture();
  const haloTex = haloTexture();

  // --- State
  let M = 10 ** DEFAULT_LOGM; // current mass, kg
  let Mslider = M;
  let Mref = M;
  let speed = 5; // decades of remaining lifetime per real second
  let showPairs = true;
  let showCmb = false;
  let touched = false;
  let evaporating = false;
  let paused = false;
  let flashed = false;
  let flashT = -1;
  let M0 = M;
  let tau0 = lifetime(M);
  let tauRem = tau0;
  let rk4Err = 0;
  let R = radiusOf(M);
  const glowCol = new THREE.Color();

  // --- Background stars
  {
    const pos = new Float32Array(NSTAR * 3);
    const col = new Float32Array(NSTAR * 3);
    for (let i = 0; i < NSTAR; i++) {
      const u = Math.random() * 2 - 1;
      const ph = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 45 + Math.random() * 20;
      pos[i * 3] = r * s * Math.cos(ph);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(ph);
      const b = 0.25 + Math.random() * 0.5;
      col[i * 3] = b * 0.85;
      col[i * 3 + 1] = b * 0.9;
      col[i * 3 + 2] = b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  }

  // --- Horizon: black sphere with glow sprites behind it
  const holeGroup = new THREE.Group();
  scene.add(holeGroup);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  horizon.renderOrder = 1;
  holeGroup.add(horizon);
  const spriteMat = (opacity: number, map = glowTex) => {
    const m = new THREE.SpriteMaterial({ map, color: 0xffffff, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    m.toneMapped = false;
    return m;
  };
  const rim = new THREE.Sprite(spriteMat(0.7, haloTex));
  rim.material.color.set(0x2a3a5c);
  const glowIn = new THREE.Sprite(spriteMat(1, haloTex));
  const glowOut = new THREE.Sprite(spriteMat(0.55));
  holeGroup.add(rim, glowIn, glowOut);

  // --- Flash
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  flashMat.toneMapped = false;
  const flashShell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), flashMat);
  flashShell.visible = false;
  scene.add(flashShell);
  const flashSprite = new THREE.Sprite(spriteMat(0));
  flashSprite.visible = false;
  scene.add(flashSprite);

  // --- Pairs (popular heuristic)
  const pAge = new Float32Array(NP);
  const pLife = new Float32Array(NP);
  const pOn = new Uint8Array(NP);
  const pDir = new Float32Array(NP * 3);
  const pTan = new Float32Array(NP * 3);
  const outPos = new Float32Array(NP * 3);
  const outCol = new Float32Array(NP * 3);
  const inPos = new Float32Array(NP * 3);
  const inCol = new Float32Array(NP * 3);
  const linkPos = new Float32Array(NP * 6);
  const linkCol = new Float32Array(NP * 6);
  const mkPoints = (pos: Float32Array, col: Float32Array, size: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.toneMapped = false;
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  };
  const pairGroup = new THREE.Group();
  scene.add(pairGroup);
  const outPts = mkPoints(outPos, outCol, 0.42);
  const inPts = mkPoints(inPos, inCol, 0.34);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkCol, 3));
  const linkMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const links = new THREE.LineSegments(linkGeo, linkMat);
  links.frustumCulled = false;
  pairGroup.add(outPts, inPts, links);
  const inColor = new THREE.Color(PALETTE.violet);
  const pairColor = new THREE.Color();

  // --- CMB motes falling inward
  const cPos = new Float32Array(NC * 3);
  const cCol = new Float32Array(NC * 3);
  const cR = new Float32Array(NC);
  const cDir = new Float32Array(NC * 3);
  const cmbPts = mkPoints(cPos, cCol, 0.16);
  cmbPts.visible = false;
  scene.add(cmbPts);
  const cmbBase = new THREE.Color(0x5f8fc0);
  function spawnMote(i: number, rStart: number): void {
    const u = Math.random() * 2 - 1;
    const ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    cDir[i * 3] = s * Math.cos(ph);
    cDir[i * 3 + 1] = u;
    cDir[i * 3 + 2] = s * Math.sin(ph);
    cR[i] = rStart;
  }
  for (let i = 0; i < NC; i++) spawnMote(i, 2 + Math.random() * 6);

  // --- Labels
  const bandLabel = stage.label('', [0, -1, 0], 'big');
  const horizonLabel = stage.label('event horizon (size: log scale)', [0, 0, 0], 'muted');
  const pairLabel = stage.label('pair picture: a popular heuristic', [0, 0, 0], 'muted');
  const statusLabel = stage.label('', [0, 1, 0], '');
  statusLabel.visible = false;

  // --- Inset: T_H and lifetime against M
  const PW = 560;
  const PH = 420;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const bgPlot = document.createElement('canvas');
  bgPlot.width = PW;
  bgPlot.height = PH;
  const bctx = bgPlot.getContext('2d')!;
  const X0 = 8;
  const X1 = 31;
  const TL0 = -9;
  const TL1 = 16;
  const LL0 = -3;
  const LL1 = 70;
  const PX0 = 64;
  const PX1 = PW - 64;
  const PY0 = 72;
  const PY1 = PH - 50;
  const xOf = (lm: number) => PX0 + ((lm - X0) / (X1 - X0)) * (PX1 - PX0);
  const yT = (lt: number) => PY1 - ((lt - TL0) / (TL1 - TL0)) * (PY1 - PY0);
  const yL = (ll: number) => PY1 - ((ll - LL0) / (LL1 - LL0)) * (PY1 - PY0);
  const C_AMBER = css(PALETTE.amber);
  const C_CYAN = css(PALETTE.cyan);
  const C_ROSE = css(PALETTE.rose);
  const C_GREEN = css(PALETTE.green);
  const logLife = (lm: number) => Math.log10(lifetime(10 ** lm) / YEAR);
  const logT = (lm: number) => Math.log10(hawkingT(10 ** lm));
  const lmPbh = Math.log10(massForLifetime(AGE_UNIVERSE_YR * YEAR));
  const lmBal = Math.log10(massForTemperature(T_CMB));

  function drawPlotBg(): void {
    const c = bctx;
    c.clearRect(0, 0, PW, PH);
    c.font = `600 21px ${MONO}`;
    c.fillStyle = '#dfe6f3';
    c.fillText('T_H and lifetime vs mass', 16, 30);
    c.font = `17px ${MONO}`;
    c.lineWidth = 1;
    for (let lm = 10; lm <= 30; lm += 5) {
      c.strokeStyle = '#1a2336';
      c.beginPath();
      c.moveTo(xOf(lm), PY0);
      c.lineTo(xOf(lm), PY1);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(`10${String(lm).replace(/[0-9]/g, (ch) => SUP['-0123456789'.indexOf(ch)])}`, xOf(lm) - 20, PH - 26);
    }
    c.fillText('M (kg)', PX1 - 60, PH - 6);
    for (const lt of [-5, 0, 5, 10, 15]) {
      c.strokeStyle = '#161e2e';
      c.beginPath();
      c.moveTo(PX0, yT(lt));
      c.lineTo(PX1, yT(lt));
      c.stroke();
      c.fillStyle = C_AMBER;
      c.fillText(`${lt}`, PX0 - (lt < 0 ? 34 : lt >= 10 ? 32 : 20), yT(lt) + 6);
    }
    for (const ll of [0, 20, 40, 60]) {
      c.fillStyle = C_CYAN;
      c.fillText(`${ll}`, PX1 + 8, yL(ll) + 6);
    }
    c.fillStyle = C_AMBER;
    c.fillText('log T (K)', 4, PY0 - 14);
    c.fillStyle = C_CYAN;
    c.fillText('log t (yr)', PW - 106, PY0 - 14);
    // Reference lines
    c.setLineDash([6, 6]);
    c.strokeStyle = 'rgba(79,209,232,0.45)';
    c.beginPath();
    c.moveTo(PX0, yL(Math.log10(AGE_UNIVERSE_YR)));
    c.lineTo(PX1, yL(Math.log10(AGE_UNIVERSE_YR)));
    c.stroke();
    c.strokeStyle = showCmb ? C_ROSE : 'rgba(244,114,182,0.3)';
    c.lineWidth = showCmb ? 2 : 1;
    c.beginPath();
    c.moveTo(PX0, yT(Math.log10(T_CMB)));
    c.lineTo(PX1, yT(Math.log10(T_CMB)));
    c.stroke();
    c.setLineDash([]);
    c.font = `15px ${MONO}`;
    c.fillStyle = 'rgba(79,209,232,0.8)';
    c.fillText('age of universe', PX1 - 150, yL(Math.log10(AGE_UNIVERSE_YR)) + 18);
    c.fillStyle = showCmb ? C_ROSE : 'rgba(244,114,182,0.6)';
    c.fillText('CMB 2.725 K', PX0 + 6, yT(Math.log10(T_CMB)) - 6);
    // Curves
    const curve = (f: (lm: number) => number, y: (v: number) => number, color: string) => {
      c.beginPath();
      c.moveTo(xOf(X0), y(f(X0)));
      c.lineTo(xOf(X1), y(f(X1)));
      c.strokeStyle = color;
      c.lineWidth = 3.5;
      c.stroke();
    };
    c.save();
    c.beginPath();
    c.rect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    c.clip();
    curve(logT, yT, C_AMBER);
    curve(logLife, yL, C_CYAN);
    c.restore();
    c.font = `600 16px ${MONO}`;
    c.fillStyle = C_AMBER;
    c.fillText('T_H ∝ 1/M', xOf(15.5), yT(logT(15.5)) + 30);
    c.fillStyle = C_CYAN;
    c.fillText('t ∝ M³', xOf(24.5) - 70, yL(logLife(24.5)) - 8);
    // Mass markers
    c.font = `15px ${MONO}`;
    const mark = (lm: number, text: string, dx: number) => {
      c.strokeStyle = 'rgba(223,230,243,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(xOf(lm), PY0);
      c.lineTo(xOf(lm), PY0 + 10);
      c.stroke();
      c.fillStyle = '#b8c3d9';
      c.fillText(text, xOf(lm) + dx, PY0 + 28);
    };
    mark(Math.log10(M_MOUNTAIN), 'mountain', -36);
    mark(Math.log10(M_MOON), 'Moon', -18);
    mark(Math.log10(M_SUN), 'Sun', -30);
    // PBH dying today: lifetime line meets the age of the universe
    c.fillStyle = C_GREEN;
    c.beginPath();
    c.arc(xOf(lmPbh), yL(logLife(lmPbh)), 6, 0, Math.PI * 2);
    c.fill();
    c.fillText('PBH ends now', xOf(lmPbh) + 8, yL(logLife(lmPbh)) + 22);
    if (showCmb) {
      c.fillStyle = C_ROSE;
      c.beginPath();
      c.arc(xOf(lmBal), yT(Math.log10(T_CMB)), 6, 0, Math.PI * 2);
      c.fill();
      c.fillText('balance', xOf(lmBal) + 8, yT(Math.log10(T_CMB)) + 20);
    }
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    if (flashed) return;
    const lm = Math.log10(M);
    const x = xOf(clamp(lm, X0, X1));
    pctx.strokeStyle = 'rgba(223,230,243,0.45)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x, PY0);
    pctx.lineTo(x, PY1);
    pctx.stroke();
    if (lm >= X0) {
      pctx.fillStyle = C_AMBER;
      pctx.beginPath();
      pctx.arc(x, clamp(yT(logT(lm)), PY0, PY1), 8, 0, Math.PI * 2);
      pctx.fill();
      pctx.fillStyle = C_CYAN;
      pctx.beginPath();
      pctx.arc(x, clamp(yL(logLife(lm)), PY0, PY1), 8, 0, Math.PI * 2);
      pctx.fill();
    }
  }

  // --- Legend overlay (hidden on phones)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '270px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: string) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${c}"></i>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the scene</div>
<div>${sw('#000;border:1px solid #445')}horizon (radius on log scale)</div>
<div>${sw('linear-gradient(90deg,#ff6a20,#fff4e0,#9fb4ff,#6be0ff,#ffb3ff)')}glow: colour of T_H</div>
<div>${sw('#fff4e0')}escaping quantum (heuristic)</div>
<div>${sw(css(PALETTE.violet))}infalling partner (heuristic)</div>
<div>${sw('#5f8fc0')}CMB photons falling in</div>
<div style="margin-top:3px;color:#8391ab">Beyond ultraviolet the colours are false.</div>`;
  viewport.appendChild(legend);

  // --- Mass-dependent appearance
  let lastApplied = -1;
  function applyMass(): void {
    if (M === lastApplied) return;
    lastApplied = M;
    R = radiusOf(M);
    const T = hawkingT(M);
    const lt = Math.log10(T);
    glowColor(T, glowCol);
    const I = 0.05 + 0.95 * smooth(2.5, 3.8, lt);
    horizon.scale.setScalar(R);
    rim.scale.setScalar(R * 3.3);
    glowIn.scale.setScalar(R * (3.4 + 0.6 * smooth(3, 12, lt)));
    glowOut.scale.setScalar(R * (6 + 4 * smooth(3, 14, lt)));
    glowIn.material.color.copy(glowCol).multiplyScalar(I * 1.1);
    glowOut.material.color.copy(glowCol).multiplyScalar(I * 0.8);
    // Pairs always get a visible colour so the heuristic reads even for cold holes.
    pairColor.copy(glowCol);
    const mx = Math.max(pairColor.r, pairColor.g, pairColor.b, 1e-3);
    pairColor.multiplyScalar(1 / mx);
    if (lt < 3.1) pairColor.set(0xff7a5a).multiplyScalar(0.55 + 0.45 * smooth(1, 3.1, lt));
    bandLabel.position.set(0, -R - 0.55, 0);
    horizonLabel.position.set(-R * 0.75 - 0.9, -R * 0.75 - 0.05, 0);
    pairLabel.position.set(R * 0.8 + 1.6, -R * 0.45 - 0.3, 0);
    const lp = wienPeak(T);
    const lpTxt = lp >= 1e-3 ? `${fmtSci(lp * 100)} cm` : lp >= 1e-6 ? `${fmtSci(lp * 1e6)} µm` : lp >= 1e-9 ? `${fmtSci(lp * 1e9)} nm` : `${fmtSci(lp)} m`;
    const vis = lt < 3 ? ' (invisible)' : '';
    bandLabel.element.textContent = `T_H = ${fmtSci(T)} K · peak ${lpTxt} · ${band(T)}${vis}`;
  }

  // --- Pairs update
  const camDir = new THREE.Vector3();
  function spawnPair(i: number): void {
    let x = Math.random() * 2 - 1;
    let y = (Math.random() * 2 - 1) * 0.8;
    let z = Math.random() * 2 - 1;
    let n = Math.hypot(x, y, z) || 1;
    x /= n;
    y /= n;
    z /= n;
    // Favour the side facing the camera so most pairs are seen.
    const d = x * camDir.x + y * camDir.y + z * camDir.z;
    if (d < -0.1) {
      x -= 1.4 * d * camDir.x;
      y -= 1.4 * d * camDir.y;
      z -= 1.4 * d * camDir.z;
      n = Math.hypot(x, y, z) || 1;
      x /= n;
      y /= n;
      z /= n;
    }
    pDir[i * 3] = x;
    pDir[i * 3 + 1] = y;
    pDir[i * 3 + 2] = z;
    // Tangent: cross with a random vector
    let tx = y * 0.3 - z * 0.9;
    let ty = z * 0.2 - x * 0.3;
    let tz = x * 0.9 - y * 0.2;
    const rx = Math.random() - 0.5;
    tx += rx * y;
    ty -= rx * x;
    const tn = Math.hypot(tx, ty, tz) || 1;
    // Make it perpendicular to dir
    const dot = (tx * x + ty * y + tz * z) / tn;
    tx = tx / tn - dot * x;
    ty = ty / tn - dot * y;
    tz = tz / tn - dot * z;
    const tn2 = Math.hypot(tx, ty, tz) || 1;
    pTan[i * 3] = tx / tn2;
    pTan[i * 3 + 1] = ty / tn2;
    pTan[i * 3 + 2] = tz / tn2;
    pAge[i] = 0;
    pLife[i] = 1.5 + Math.random() * 0.8;
    pOn[i] = 1;
  }

  let spawnAcc = 0;
  function updatePairs(dt: number): void {
    camDir.copy(camera.position).normalize();
    const active = showPairs && !flashed;
    if (active) {
      const lt = Math.log10(hawkingT(M));
      spawnAcc += dt * (3 + 22 * smooth(-8, 14, lt));
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        for (let i = 0; i < NP; i++) {
          if (!pOn[i]) {
            spawnPair(i);
            break;
          }
        }
      }
    }
    const reach = 2.6 + R * 1.2;
    for (let i = 0; i < NP; i++) {
      const o = i * 3;
      if (!pOn[i]) {
        outCol[o] = outCol[o + 1] = outCol[o + 2] = 0;
        inCol[o] = inCol[o + 1] = inCol[o + 2] = 0;
        linkCol.fill(0, i * 6, i * 6 + 6);
        continue;
      }
      pAge[i] += dt;
      const u = pAge[i] / pLife[i];
      if (u >= 1) {
        pOn[i] = 0;
        continue;
      }
      const dx = pDir[o];
      const dy = pDir[o + 1];
      const dz = pDir[o + 2];
      const tx = pTan[o];
      const ty = pTan[o + 1];
      const tz = pTan[o + 2];
      const r0 = R * 1.14 + 0.03;
      const s0 = 0.08 + 0.06 * R;
      let sOut: number;
      let sIn: number;
      let rOut: number;
      let rIn: number;
      let bOut: number;
      let bIn: number;
      let bLink: number;
      if (u < 0.22) {
        const v = u / 0.22;
        const s = s0 * Math.sin((v * Math.PI) / 2);
        sOut = s;
        sIn = s;
        rOut = r0;
        rIn = r0;
        bOut = 0.3 + 0.5 * v;
        bIn = 0.3 + 0.5 * v;
        bLink = 0.5 * v;
      } else {
        const w = (u - 0.22) / 0.78;
        const wi = Math.min(1, w * 2.4);
        sOut = s0;
        sIn = s0 * (1 - wi);
        rOut = r0 + w * w * reach + w * 0.2;
        rIn = r0 - (r0 - R * 0.9) * wi;
        bOut = 0.9 * Math.pow(1 - w, 0.6);
        bIn = 0.8 * (1 - wi);
        bLink = 0.5 * Math.max(0, 1 - w * 5);
      }
      outPos[o] = dx * rOut + tx * sOut;
      outPos[o + 1] = dy * rOut + ty * sOut;
      outPos[o + 2] = dz * rOut + tz * sOut;
      inPos[o] = dx * rIn - tx * sIn;
      inPos[o + 1] = dy * rIn - ty * sIn;
      inPos[o + 2] = dz * rIn - tz * sIn;
      outCol[o] = pairColor.r * bOut;
      outCol[o + 1] = pairColor.g * bOut;
      outCol[o + 2] = pairColor.b * bOut;
      inCol[o] = inColor.r * bIn;
      inCol[o + 1] = inColor.g * bIn;
      inCol[o + 2] = inColor.b * bIn;
      const l = i * 6;
      linkPos[l] = outPos[o];
      linkPos[l + 1] = outPos[o + 1];
      linkPos[l + 2] = outPos[o + 2];
      linkPos[l + 3] = inPos[o];
      linkPos[l + 4] = inPos[o + 1];
      linkPos[l + 5] = inPos[o + 2];
      linkCol[l] = linkCol[l + 3] = 0.8 * bLink;
      linkCol[l + 1] = linkCol[l + 4] = 0.75 * bLink;
      linkCol[l + 2] = linkCol[l + 5] = 1.0 * bLink;
    }
    (outPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (outPts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (inPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (inPts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (linkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (linkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function updateMotes(dt: number): void {
    if (!showCmb) return;
    for (let i = 0; i < NC; i++) {
      cR[i] -= dt * (0.9 + 0.25 * cR[i]);
      if (cR[i] < R * 0.95) spawnMote(i, 6 + Math.random() * 3);
      const o = i * 3;
      const r = cR[i];
      cPos[o] = cDir[o] * r;
      cPos[o + 1] = cDir[o + 1] * r;
      cPos[o + 2] = cDir[o + 2] * r;
      const b = 0.55 * smooth(9, 6.5, r);
      cCol[o] = cmbBase.r * b;
      cCol[o + 1] = cmbBase.g * b;
      cCol[o + 2] = cmbBase.b * b;
    }
    (cmbPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (cmbPts.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Evaporation
  function startEvaporation(): void {
    if (flashed) resetEvaporation();
    if (evaporating) {
      paused = !paused;
      evapBtn.textContent = paused ? 'Resume' : 'Pause';
      return;
    }
    M0 = M;
    tau0 = lifetime(M0);
    tauRem = tau0;
    rk4Err = 0;
    evaporating = true;
    paused = false;
    evapBtn.textContent = 'Pause';
  }

  function resetEvaporation(): void {
    evaporating = false;
    paused = false;
    flashed = false;
    flashT = -1;
    flashShell.visible = false;
    flashSprite.visible = false;
    holeGroup.visible = true;
    horizonLabel.visible = true;
    pairLabel.visible = showPairs;
    bandLabel.visible = true;
    statusLabel.visible = false;
    M = Mslider;
    tauRem = tau0 = lifetime(M);
    rk4Err = 0;
    evapBtn.textContent = 'Evaporate';
    lastApplied = -1;
  }

  function stepEvaporation(dt: number): void {
    if (!evaporating || paused) return;
    const f = Math.pow(10, -speed * dt);
    let target = tauRem * f;
    if (target < TAU_END) target = TAU_END;
    const dtau = tauRem - target;
    if (dtau > 0) {
      // Closed form drives the display. RK4 runs alongside from the same start as a check.
      const mRk4 = evolveMass(M, dtau);
      tauRem = target;
      M = massForLifetime(tauRem);
      rk4Err = Math.max(rk4Err, Math.abs(mRk4 - M) / M);
    }
    massCtl.set(clamp(Math.log10(M), LOG_MIN, LOG_MAX), false);
    if (tauRem <= TAU_END) triggerFlash();
  }

  function triggerFlash(): void {
    evaporating = false;
    flashed = true;
    flashT = 0;
    holeGroup.visible = false;
    pairLabel.visible = false;
    horizonLabel.visible = false;
    bandLabel.visible = false;
    flashShell.visible = true;
    flashSprite.visible = true;
    statusLabel.visible = true;
    statusLabel.position.set(0, 1.9, 0);
    statusLabel.element.textContent = `final flash: last ${TAU_END} s releases ≈ ${fmtSci(M * 8.98755e16)} J`;
    evapBtn.textContent = 'Evaporate again';
  }

  function updateFlash(dt: number): void {
    if (flashT < 0) return;
    flashT += dt;
    const u = flashT / FLASH_DUR;
    if (u >= 1) {
      flashShell.visible = false;
      flashSprite.visible = false;
      flashT = -1;
      statusLabel.element.textContent = 'evaporated: nothing left but radiation';
      return;
    }
    const r = 0.2 + 5.5 * Math.pow(u, 0.6);
    flashShell.scale.setScalar(r);
    flashMat.opacity = 0.55 * Math.pow(1 - u, 2);
    flashMat.color.copy(C_GAMMA).lerp(tmpA.set(0xffffff), 1 - u);
    flashSprite.scale.setScalar(3 + 14 * u);
    flashSprite.material.opacity = Math.pow(1 - u, 1.5);
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Black hole');
  const massCtl = ui.slider({
    key: 'M', label: 'Mass M (log scale)', min: LOG_MIN, max: LOG_MAX, step: 0.005, value: DEFAULT_LOGM,
    format: (v) => `${fmtSci(10 ** v)} kg`,
    onInput: (v) => {
      touched = true;
      Mslider = 10 ** v;
      resetEvaporation();
    },
  });
  const preset = (m: number) => () => massCtl.set(Math.log10(m), true);
  ui.buttons([
    { label: 'Mountain', onClick: preset(M_MOUNTAIN) },
    { label: 'Moon', onClick: preset(M_MOON) },
    { label: 'Sun', onClick: preset(M_SUN) },
  ]);
  ui.buttons([{ label: 'Pin reference', key: 'ratioM', onClick: () => { Mref = M > 0 && !flashed ? M : Mslider; } }]);

  ui.section('Time-lapse');
  const [evapBtn] = ui.buttons([
    { label: 'Evaporate', primary: true, key: 'evap', onClick: startEvaporation },
    { label: 'Reset', onClick: () => resetEvaporation() },
  ]);
  ui.slider({ key: 'speed', label: 'Time-lapse speed', min: 1, max: 15, step: 0.5, value: speed, format: (v) => `${v} decades/s`, onInput: (v) => (speed = v) });

  ui.section('Show');
  ui.toggle({ key: 'pairs', label: 'Show pairs (heuristic)', value: showPairs, onChange: (v) => { showPairs = v; pairLabel.visible = v; } });
  ui.toggle({
    key: 'cmb', label: 'Compare with CMB (2.725 K)', value: showCmb,
    onChange: (v) => { showCmb = v; cmbPts.visible = v; drawPlotBg(); },
  });

  ui.section('Readouts');
  const rT = ui.readout('T', 'T_H');
  const rBand = ui.readout('band', 'glow peaks in');
  const rRs = ui.readout('rs', 'horizon r_s');
  const rP = ui.readout('P', 'power (photons)');
  const rLife = ui.readout('life', 'lifetime');
  const rS = ui.readout('S', 'entropy S');
  const rRate = ui.readout('rate', 'photons per s');
  const rCmb = ui.readout('ratioCmb', 'T / T_CMB');
  const rNet = ui.readout('net', 'vs the CMB');
  const rRM = ui.readout('ratioM', 'M / M_ref');
  const rRT = ui.readout('ratioT', 'T / T_ref');
  ui.section('Time-lapse clock');
  const rEl = ui.readout('elapsed', 'elapsed');
  const rRem = ui.readout('remaining', 'remaining');
  const rPage = ui.readout('page', 'Page time (simple)');
  const rErr = ui.readout('rk4', 'RK4 check (per frame)');
  ui.note('The time-lapse assumes empty space and ignores CMB absorption. Power and lifetime use the photon-only blackbody model.');

  function updateReadouts(): void {
    if (flashed) {
      rT('–');
      rBand('–');
      rRs('0');
      rP('–');
      rLife('0');
      rS('0');
      rRate('–');
      rCmb('–');
      rNet('–');
      rRM('–');
      rRT('–');
      rEl(fmtTime(tau0));
      rRem('0');
      rPage('passed');
      rErr(rk4Err < 1e-15 ? '0' : rk4Err.toExponential(0));
      return;
    }
    const T = hawkingT(M);
    rT(`${fmtSci(T)} K`);
    rBand(band(T));
    rRs(fmtLen(schwarzschildRadius(M)));
    rP(`${fmtSci(power(M))} W`);
    rLife(fmtTime(lifetime(M)));
    rS(`${fmtSci(entropy(M))} k_B`);
    rRate(fmtSci(photonRate(M)));
    rCmb(fmtSci(T / T_CMB));
    rNet(netPower(M, T_CMB) > 0 ? 'net emitter' : 'net absorber');
    rRM((M / Mref).toFixed(3));
    rRT((T / hawkingT(Mref)).toFixed(3));
    if (evaporating) {
      rEl(fmtTime(tau0 - tauRem));
      rRem(fmtTime(tauRem));
      rPage((tau0 - tauRem) / tau0 >= PAGE_FRACTION_SIMPLE ? 'passed' : `at ${fmtTime(PAGE_FRACTION_SIMPLE * tau0)}`);
      rErr(rk4Err < 1e-15 ? '0' : rk4Err.toExponential(0));
    } else {
      rEl('–');
      rRem(fmtTime(lifetime(M)));
      rPage(`at ${fmtTime(PAGE_FRACTION_SIMPLE * lifetime(M))}`);
      rErr('–');
    }
    statusLabel.visible = showCmb;
    if (showCmb) {
      statusLabel.position.set(0, R + 0.55, 0);
      statusLabel.element.textContent = netPower(M, T_CMB) > 0 ? 'hotter than the CMB: shrinks' : 'colder than the CMB: absorbs more than it emits';
    }
  }

  // --- Frame loop
  let plotTimer = 0;
  stage.onFrame((dt) => {
    stepEvaporation(dt);
    if (!flashed) applyMass();
    updatePairs(dt);
    updateMotes(dt);
    updateFlash(dt);
    if (flashed && flashT < 0) statusLabel.visible = true;
    plotTimer += dt;
    if (plotTimer > 0.1) {
      plotTimer = 0;
      drawPlot();
      updateReadouts();
      if (flashed) statusLabel.visible = true;
    }
  });

  drawPlotBg();
  applyMass();
  drawPlot();
  updateReadouts();

  return {
    state: () => {
      const T = flashed ? 0 : hawkingT(M);
      return {
        M: flashed ? 0 : M,
        T,
        lifetimeYr: flashed ? 0 : lifetime(M) / YEAR,
        S: flashed ? 0 : entropy(M),
        ratioCmb: T / T_CMB,
        cmb: showCmb,
        pairs: showPairs,
        evaporating,
        flashed,
        touched,
        Mref,
        ratioM: flashed ? 0 : M / Mref,
        ratioT: flashed ? 0 : T / hawkingT(Mref),
        speed,
        rk4Err,
      };
    },
    dispose: () => {
      plot.remove();
      legend.remove();
      glowTex.dispose();
      haloTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'hawking-radiation',
  number: 46,
  title: 'Hawking Radiation',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'Black holes glow, shrink and one day vanish.',
  content,
  mount,
};

export default topic;
