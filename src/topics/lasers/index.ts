import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  DEFAULTS, advance, cavityLifetime, coeffs, modeSpacing, outputPower, pumpRatio, relaxation, slopeEfficiency,
  steadyState, thresholdN, thresholdPumpW, type Coeffs, type LaserParams,
} from './physics.ts';

type Speed = 'slow' | 'normal' | 'fast';
const SPEEDS: Record<Speed, number> = { slow: 10e-6, normal: 100e-6, fast: 400e-6 }; // sim seconds per real second

// Scene geometry
const ROD_HALF = 2.2;
const ROD_R = 0.55;
const ATOM_R_MAX = 0.44;
const NA = 240; // atoms drawn
const PH = 420; // photon pool
const PH_AX_MAX = 240; // most axial photons on screen
const V_PH = 9; // photon speed on screen (units / s)
const BEAM_LEN = 10;
const UP_FRAC = 0.38; // share of atoms drawn excited when N = N_th
const QS_LOSS = 5; // extra round-trip loss while the Q-switch is closed
const QS_HOLD = 1.5 * DEFAULTS.tau;

// Time trace
const SAMPLE = 0.5e-6;
const TRACE_N = 1200; // 600 us window

// Atom levels: 0 ground, 1 lower laser level, 2 upper laser level, 3 pump band
const LEVEL_COL = [0x28324a, PALETTE.rose, PALETTE.amber, PALETTE.violet];
const LASER_COL = new THREE.Color(0xff4b4b);
const SPONT_COL = new THREE.Color(0xff8a7a);

const mirrorX = (L: number) => 2.75 + (1.65 * (L - 0.1)) / 0.9;

const fmtW = (w: number): string => {
  const a = Math.abs(w);
  if (a >= 1e3) return `${(w / 1e3).toFixed(a >= 1e4 ? 0 : 1)} kW`;
  if (a >= 1) return `${w.toFixed(2)} W`;
  if (a >= 1e-3) return `${(w * 1e3).toFixed(1)} mW`;
  if (a >= 1e-6) return `${(w * 1e6).toFixed(1)} µW`;
  if (a >= 1e-9) return `${(w * 1e9).toFixed(1)} nW`;
  return '≈ 0';
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.9, 3.8, 9.6], target: [0.9, -0.8, 0], fov: 40 });
  const { scene } = stage;

  const p: LaserParams = { ...DEFAULTS };
  let speed: Speed = 'normal';
  let playing = true;

  // ---------- Scene furniture
  const grid = makeGrid(30, 60);
  grid.position.y = -1.9;
  scene.add(grid);

  // Glass rod
  const rodMat = new THREE.MeshPhysicalMaterial({
    color: 0xb9c8ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
  });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD_R, ROD_R, ROD_HALF * 2, 48, 1, true), rodMat);
  rod.rotation.z = Math.PI / 2;
  rod.renderOrder = 3;
  scene.add(rod);
  const capGeo = new THREE.CircleGeometry(ROD_R, 40);
  const capMat = new THREE.MeshBasicMaterial({ color: 0x9fb2e8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.rotation.y = Math.PI / 2;
    cap.position.x = sx * ROD_HALF;
    scene.add(cap);
  }
  const rimGeo = new THREE.TorusGeometry(ROD_R, 0.018, 8, 48);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x6f84c0, transparent: true, opacity: 0.7 });
  for (const sx of [-1, 1]) {
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = sx * ROD_HALF;
    scene.add(rim);
  }
  stage.label('Nd:YAG rod (gain medium)', [0, -ROD_R - 0.35, 0.9], 'muted');

  // Pump diode bars above and below
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x2a2140, emissive: new THREE.Color(PALETTE.violet), emissiveIntensity: 0.6, roughness: 0.5 });
  const pumpGeo = new THREE.BoxGeometry(ROD_HALF * 1.8, 0.14, 0.5);
  const pumpGlowMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  const pumpGlowGeo = new THREE.PlaneGeometry(ROD_HALF * 1.8, 0.5);
  for (const sy of [-1, 1]) {
    const bar = new THREE.Mesh(pumpGeo, pumpMat);
    bar.position.y = sy * (ROD_R + 0.42);
    scene.add(bar);
    const glow = new THREE.Mesh(pumpGlowGeo, pumpGlowMat);
    glow.position.y = sy * (ROD_R + 0.2);
    glow.rotation.x = Math.PI / 2;
    scene.add(glow);
  }
  stage.label('pump diodes (808 nm)', [0.9, ROD_R + 0.75, 0], 'muted');

  // Mirrors
  const mirrorGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.1, 48);
  const mountGeo = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  const mountMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.4, roughness: 0.6 });
  const hrMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.55, roughness: 0.25, emissive: new THREE.Color(0x1c2436) });
  const ocMat = new THREE.MeshStandardMaterial({ color: 0x7fe3f2, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.5, emissive: new THREE.Color(0x0b3a44) });
  const hr = new THREE.Group();
  const oc = new THREE.Group();
  for (const [g, m] of [[hr, hrMat], [oc, ocMat]] as const) {
    const disc = new THREE.Mesh(mirrorGeo, m);
    disc.rotation.z = Math.PI / 2;
    g.add(disc);
    const post = new THREE.Mesh(mountGeo, mountMat);
    post.position.y = -1.35;
    g.add(post);
    scene.add(g);
  }
  stage.label('mirror, R = 100%', [0.5, -1.15, 0.9], 'muted', hr);
  const ocLabel = stage.label('output mirror, R = 95%', [0, 1.2, 0], '', oc);

  // Beam, parented to the output mirror
  const beamGeo = new THREE.CylinderGeometry(1, 1, BEAM_LEN, 24, 1, true);
  beamGeo.rotateZ(Math.PI / 2);
  beamGeo.translate(BEAM_LEN / 2 + 0.06, 0, 0);
  const beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const beamGlow = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  oc.add(beamCore, beamGlow);
  const beamLabel = stage.label('laser beam', [1.3, -0.5, 0.3], 'muted', oc);

  // ---------- Atoms
  const atomGeo = new THREE.SphereGeometry(0.065, 12, 8);
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissive: 0x151515 });
  const atoms = new THREE.InstancedMesh(atomGeo, atomMat, NA);
  atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(atoms);
  const ax = new Float32Array(NA);
  const ay = new Float32Array(NA);
  const az = new Float32Array(NA);
  const level = new Int8Array(NA);
  const aTimer = new Float32Array(NA);
  const aFlash = new Float32Array(NA);
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < NA; i++) {
    ax[i] = (rand() * 2 - 1) * (ROD_HALF - 0.1);
    const rr = ATOM_R_MAX * Math.sqrt(rand());
    const th = rand() * Math.PI * 2;
    ay[i] = rr * Math.cos(th);
    az[i] = rr * Math.sin(th);
  }
  const levelColors = LEVEL_COL.map((c) => new THREE.Color(c));
  const white = new THREE.Color(0xffffff);
  const tmpC = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3();

  // ---------- Photons as glowing points
  const phPos = new Float32Array(PH * 3);
  const phCol = new Float32Array(PH * 3);
  const phSize = new Float32Array(PH);
  const phType = new Int8Array(PH); // 0 dead, 1 axial, 2 leaving, 3 spontaneous
  const phDir = new Float32Array(PH * 3);
  const phLife = new Float32Array(PH);
  const phFlash = new Float32Array(PH);
  const phGeo = new THREE.BufferGeometry();
  phGeo.setAttribute('position', new THREE.BufferAttribute(phPos, 3).setUsage(THREE.DynamicDrawUsage));
  phGeo.setAttribute('aColor', new THREE.BufferAttribute(phCol, 3).setUsage(THREE.DynamicDrawUsage));
  phGeo.setAttribute('aSize', new THREE.BufferAttribute(phSize, 1).setUsage(THREE.DynamicDrawUsage));
  const phMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC;
void main(){ vec2 d = gl_PointCoord - 0.5; float r2 = dot(d,d) * 4.0; if (r2 > 1.0) discard; float a = exp(-r2 * 3.5) + 0.6 * exp(-r2 * 18.0); gl_FragColor = vec4(vC * a, a); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const photons = new THREE.Points(phGeo, phMat);
  photons.frustumCulled = false;
  photons.renderOrder = 5;
  scene.add(photons);
  let nAxial = 0;

  function spawnPhoton(type: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, flash: number): number {
    for (let i = 0; i < PH; i++) {
      if (phType[i] !== 0) continue;
      phType[i] = type;
      phPos[i * 3] = x;
      phPos[i * 3 + 1] = y;
      phPos[i * 3 + 2] = z;
      phDir[i * 3] = dx;
      phDir[i * 3 + 1] = dy;
      phDir[i * 3 + 2] = dz;
      phLife[i] = type === 3 ? 0.55 : 0;
      phFlash[i] = flash;
      if (type === 1) nAxial++;
      return i;
    }
    return -1;
  }
  function killPhoton(i: number): void {
    if (phType[i] === 1) nAxial--;
    phType[i] = 0;
    phSize[i] = 0;
  }

  // ---------- Legend overlay: energy levels (top left)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', width: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049',
  } as CSSStyleDeclaration);
  const lvl = document.createElement('canvas');
  lvl.width = 420;
  lvl.height = 274;
  Object.assign(lvl.style, { width: '210px', height: '137px', display: 'block' } as CSSStyleDeclaration);
  legend.appendChild(lvl);
  viewport.appendChild(legend);
  const lctx = lvl.getContext('2d')!;

  // ---------- Insets (right)
  const insetStyle = {
    position: 'absolute', bottom: '10px', width: '250px', height: '130px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const pi = document.createElement('canvas');
  pi.width = 500;
  pi.height = 260;
  Object.assign(pi.style, { ...insetStyle, left: '10px', bottom: '36px' } as CSSStyleDeclaration);
  viewport.appendChild(pi);
  const pctx = pi.getContext('2d')!;
  const tr = document.createElement('canvas');
  tr.width = 500;
  tr.height = 260;
  Object.assign(tr.style, { ...insetStyle, right: '10px' } as CSSStyleDeclaration);
  viewport.appendChild(tr);
  const tctx = tr.getContext('2d')!;

  // ---------- Simulation state
  const s = new Float64Array(3); // N, q, qmax
  let c: Coeffs = coeffs(p);
  let Nth = thresholdN(p);
  let Pth = thresholdPumpW(p);
  let ratio = pumpRatio(p);
  let Pcw = steadyState(p).P;
  let scale = (UP_FRAC * NA) / Nth; // drawn atoms per real atom
  let t = 0;
  let sampleAcc = 0;
  let sampleMaxQ = 0;
  const trP = new Float64Array(TRACE_N);
  const trN = new Float64Array(TRACE_N);
  let trHead = 0;
  let trCount = 0;
  let pOut = 0;
  let envelope = 0;
  let frameMaxQ = 0;

  // Visual event accumulators
  let evPump = 0;
  let evSpont = 0;
  let evStim = 0;

  // Challenge bookkeeping
  let touched = false;
  let belowSeen = false;
  let crossed = false;
  let spikes = 0;
  let lastPeakT = -1;
  let spikePeriod = 0;
  let qsPhase: 'idle' | 'hold' | 'fire' = 'idle';
  let qsLeft = 0;
  let qsPeakP = 0;
  let qsRatio = 0;
  let qsShownPeak = 0;

  function refresh(): void {
    c = coeffs(p, qsPhase === 'hold' ? QS_LOSS : 0);
    Nth = thresholdN(p);
    Pth = thresholdPumpW(p);
    ratio = pumpRatio(p);
    Pcw = steadyState(p).P;
    scale = (UP_FRAC * NA) / Nth;
    oc.position.x = mirrorX(p.L);
    hr.position.x = -mirrorX(p.L);
    ocLabel.element.textContent = `output mirror, R = ${(p.R * 100).toFixed(1)}%`;
    ocMat.opacity = 0.25 + 0.5 * ((p.R - 0.8) / 0.2);
    pumpMat.emissiveIntensity = 0.15 + 1.4 * (p.pumpW / 10);
    pumpGlowMat.opacity = 0.05 + 0.3 * (p.pumpW / 10);
    drawPI();
  }

  function touch(): void {
    touched = true;
    spikes = 0;
    lastPeakT = -1;
  }

  function reset(): void {
    s[0] = 0;
    s[1] = 0;
    s[2] = 0;
    t = 0;
    sampleAcc = 0;
    sampleMaxQ = 0;
    trHead = 0;
    trCount = 0;
    pOut = 0;
    envelope = 0;
    qsPhase = 'idle';
    qsBtn.disabled = false;
    qsBtn.textContent = 'Q-switch pulse';
    qsShownPeak = 0;
    spikePeriod = 0;
    for (let i = 0; i < NA; i++) {
      level[i] = 0;
      aTimer[i] = 0;
      aFlash[i] = 0;
    }
    for (let i = 0; i < PH; i++) killPhoton(i);
    nAxial = 0;
    refresh();
  }

  // ---------- Drawing helpers
  function drawLevels(nRatio: number): void {
    const W = lvl.width;
    const Hh = lvl.height;
    lctx.clearRect(0, 0, W, Hh);
    lctx.font = '19px JetBrains Mono, monospace';
    lctx.fillStyle = '#8391ab';
    lctx.fillText('four-level scheme', 14, 26);
    const x0 = 20;
    const x1 = 176;
    const yE = [222, 176, 92, 50];
    const names = ['E₀ ground', 'E₁ lower', 'E₂ upper', 'E₃ pump band'];
    for (let k = 0; k < 4; k++) {
      lctx.strokeStyle = css(LEVEL_COL[k] === 0x28324a ? 0x6f7fa3 : LEVEL_COL[k]);
      lctx.lineWidth = k === 3 ? 10 : 4;
      lctx.globalAlpha = k === 3 ? 0.55 : 1;
      lctx.beginPath();
      lctx.moveTo(x0, yE[k]);
      lctx.lineTo(x1, yE[k]);
      lctx.stroke();
      lctx.globalAlpha = 1;
      lctx.fillStyle = css(LEVEL_COL[k] === 0x28324a ? 0x9aa6bd : LEVEL_COL[k]);
      lctx.fillText(names[k], x1 + 12, yE[k] + 7);
    }
    lctx.fillStyle = '#6f7fa3';
    lctx.fillText('τ = 230 µs', x1 + 12, yE[2] + 30);
    const arrow = (x: number, ya: number, yb: number, col: string, dashed: boolean, w: number): void => {
      const dir = yb > ya ? 1 : -1;
      lctx.strokeStyle = col;
      lctx.fillStyle = col;
      lctx.lineWidth = w;
      lctx.setLineDash(dashed ? [5, 5] : []);
      lctx.beginPath();
      lctx.moveTo(x, ya + dir * 4);
      lctx.lineTo(x, yb - dir * 12);
      lctx.stroke();
      lctx.setLineDash([]);
      lctx.beginPath();
      lctx.moveTo(x, yb - dir * 2);
      lctx.lineTo(x - 8, yb - dir * 15);
      lctx.lineTo(x + 8, yb - dir * 15);
      lctx.fill();
    };
    arrow(40, yE[0], yE[3], css(PALETTE.violet), false, 4);
    arrow(70, yE[3], yE[2], '#6f7fa3', true, 2);
    arrow(112, yE[2], yE[1], '#ff5a4a', false, 5);
    arrow(156, yE[1], yE[0], '#6f7fa3', true, 2);
    lctx.fillStyle = '#ff7a6a';
    lctx.fillText('1064 nm', 120, (yE[1] + yE[2]) / 2 + 6);
    // Inversion bar with a tick at threshold
    const bx = 14;
    const bw = W - 28;
    const by = Hh - 16;
    lctx.fillStyle = '#8391ab';
    lctx.fillText(`inversion N/N_th = ${nRatio.toFixed(2)}`, bx, by - 14);
    lctx.fillStyle = '#1a2236';
    lctx.fillRect(bx, by - 4, bw, 8);
    lctx.fillStyle = css(PALETTE.amber);
    lctx.fillRect(bx, by - 4, bw * Math.min(1, nRatio / 3), 8);
    lctx.fillStyle = '#dfe6f3';
    lctx.fillRect(bx + bw / 3 - 1, by - 8, 3, 16);
  }

  function drawPI(): void {
    const W = pi.width;
    const Hh = pi.height;
    pctx.clearRect(0, 0, W, Hh);
    pctx.font = '19px JetBrains Mono, monospace';
    pctx.fillStyle = '#8391ab';
    pctx.fillText('output vs pump', 14, 26);
    const L = 20;
    const Rr = W - 16;
    const T = 50;
    const B = Hh - 34;
    const pMax = 10;
    const eta = slopeEfficiency(p);
    const yMax = Math.max(0.5, eta * pMax * 1.05);
    const X = (w: number) => L + (w / pMax) * (Rr - L);
    const Y = (P: number) => B - (P / yMax) * (B - T);
    pctx.strokeStyle = '#243049';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(L, T - 6);
    pctx.lineTo(L, B);
    pctx.lineTo(Rr, B);
    pctx.stroke();
    pctx.fillStyle = '#56627c';
    pctx.fillText('0', L - 4, B + 24);
    pctx.fillText('pump 10 W', Rr - 100, B + 24);
    pctx.textAlign = 'right';
    pctx.fillText(`out ${yMax.toFixed(1)} W`, Rr, 26);
    pctx.textAlign = 'left';
    if (Pth < pMax) {
      pctx.strokeStyle = '#56627c';
      pctx.setLineDash([6, 6]);
      pctx.beginPath();
      pctx.moveTo(X(Pth), T);
      pctx.lineTo(X(Pth), B);
      pctx.stroke();
      pctx.setLineDash([]);
      pctx.fillStyle = '#9aa6bd';
      pctx.fillText('threshold', Math.min(X(Pth) + 6, Rr - 100), T + 8);
    }
    pctx.strokeStyle = css(PALETTE.amber);
    pctx.lineWidth = 3;
    pctx.beginPath();
    pctx.moveTo(X(0), Y(0));
    pctx.lineTo(X(Math.min(Pth, pMax)), Y(0));
    if (Pth < pMax) pctx.lineTo(X(pMax), Y(eta * (pMax - Pth)));
    pctx.stroke();
    pctx.fillStyle = '#b8c3d9';
    pctx.textAlign = 'right';
    pctx.fillText(`slope ${(eta * 100).toFixed(0)}%`, Rr, B - 12);
    pctx.textAlign = 'left';
    const xo = X(Math.min(p.pumpW, pMax));
    pctx.strokeStyle = '#dfe6f3';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.arc(xo, Y(Pcw), 9, 0, Math.PI * 2);
    pctx.stroke();
    pctx.fillStyle = css(PALETTE.cyan);
    pctx.beginPath();
    pctx.arc(xo, Math.max(T - 10, Y(Math.min(pOut, yMax * 1.1))), 5, 0, Math.PI * 2);
    pctx.fill();
  }

  function drawTrace(): void {
    const W = tr.width;
    const Hh = tr.height;
    tctx.clearRect(0, 0, W, Hh);
    tctx.font = '19px JetBrains Mono, monospace';
    tctx.fillStyle = '#8391ab';
    tctx.fillText('output vs time', 14, 26);
    const L = 14;
    const Rr = W - 14;
    const T = 64;
    const B = Hh - 30;
    let pk = 0;
    for (let k = 0; k < trCount; k++) pk = Math.max(pk, trP[(trHead - trCount + k + TRACE_N) % TRACE_N]);
    const yMax = Math.max(pk * 1.08, Pcw * 1.6, 0.05);
    const X = (k: number) => L + (k / (TRACE_N - 1)) * (Rr - L);
    const Y = (P: number) => B - (P / yMax) * (B - T);
    tctx.strokeStyle = '#243049';
    tctx.lineWidth = 2;
    tctx.beginPath();
    tctx.moveTo(L, B);
    tctx.lineTo(Rr, B);
    tctx.stroke();
    tctx.fillStyle = '#56627c';
    tctx.fillText('← 600 µs', L, B + 24);
    tctx.textAlign = 'right';
    tctx.fillText(`top ${fmtW(yMax)}`, Rr, 26);
    tctx.fillText(`t = ${(t * 1e6).toFixed(0)} µs`, Rr, B + 24);
    tctx.textAlign = 'left';
    if (Pcw > 0) {
      tctx.strokeStyle = '#56627c';
      tctx.setLineDash([6, 6]);
      tctx.beginPath();
      tctx.moveTo(L, Y(Pcw));
      tctx.lineTo(Rr, Y(Pcw));
      tctx.stroke();
      tctx.setLineDash([]);
    }
    const off = TRACE_N - trCount;
    tctx.strokeStyle = 'rgba(245,182,66,0.6)';
    tctx.lineWidth = 2;
    tctx.beginPath();
    for (let k = 0; k < trCount; k++) {
      const v = trN[(trHead - trCount + k + TRACE_N) % TRACE_N];
      const y = B - (Math.min(3, v) / 3) * (B - T);
      if (k === 0) tctx.moveTo(X(off + k), y);
      else tctx.lineTo(X(off + k), y);
    }
    tctx.stroke();
    tctx.strokeStyle = '#ff6a5a';
    tctx.lineWidth = 3;
    tctx.beginPath();
    for (let k = 0; k < trCount; k++) {
      const v = trP[(trHead - trCount + k + TRACE_N) % TRACE_N];
      if (k === 0) tctx.moveTo(X(off + k), Y(v));
      else tctx.lineTo(X(off + k), Y(v));
    }
    tctx.stroke();
    tctx.fillStyle = '#ff7a6a';
    tctx.fillText('P out', L, 50);
    tctx.fillStyle = 'rgba(245,182,66,0.9)';
    tctx.fillText('N/N_th', L + 70, 50);
    tctx.fillStyle = '#8391ab';
    tctx.fillText('- - steady', L + 160, 50);
    if (qsShownPeak > 0) {
      tctx.fillStyle = '#dfe6f3';
      tctx.textAlign = 'right';
      tctx.fillText(`Q peak ${fmtW(qsShownPeak)}`, Rr, 50);
      tctx.textAlign = 'left';
    }
  }

  // ---------- Simulation per sample
  function pushSample(): void {
    const P = outputPower(p, sampleMaxQ);
    trP[trHead] = P;
    trN[trHead] = s[0] / Nth;
    trHead = (trHead + 1) % TRACE_N;
    if (trCount < TRACE_N) trCount++;
    // Spike detection on the previous sample: a local maximum well above the steady level.
    if (trCount >= 3) {
      const a = trP[(trHead - 3 + TRACE_N) % TRACE_N];
      const b = trP[(trHead - 2 + TRACE_N) % TRACE_N];
      if (b > a && b >= P && Pcw > 0 && b > 1.3 * Pcw && qsPhase === 'idle') {
        if (touched) spikes++;
        const tPk = t - SAMPLE;
        if (lastPeakT > 0) spikePeriod = tPk - lastPeakT;
        lastPeakT = tPk;
      }
    }
    sampleMaxQ = 0;
  }

  function simulate(T: number): void {
    let left = T;
    frameMaxQ = s[1];
    while (left > 0) {
      let chunk = Math.min(left, SAMPLE - sampleAcc);
      if (qsPhase === 'hold') chunk = Math.min(chunk, qsLeft);
      const N0 = s[0];
      s[2] = s[1];
      advance(s, c, chunk);
      const N1 = s[0];
      if (s[2] > sampleMaxQ) sampleMaxQ = s[2];
      if (s[2] > frameMaxQ) frameMaxQ = s[2];
      // Visual event bookkeeping, in drawn atoms
      const spont = 0.5 * (N0 + N1) * c.invTau * chunk;
      const stim = Math.max(0, c.Rp * chunk - (N1 - N0) - spont);
      evPump += c.Rp * chunk * scale;
      evSpont += spont * scale;
      evStim += stim * scale;
      if (qsPhase === 'fire') {
        const P = outputPower(p, s[2]);
        if (P > qsPeakP) qsPeakP = P;
      }
      t += chunk;
      left -= chunk;
      sampleAcc += chunk;
      if (sampleAcc >= SAMPLE - 1e-15) {
        sampleAcc = 0;
        pushSample();
      }
      if (qsPhase === 'hold') {
        qsLeft -= chunk;
        if (qsLeft <= 1e-15) {
          qsPhase = 'fire';
          qsLeft = 20e-6;
          qsPeakP = 0;
          c = coeffs(p);
          qsBtn.textContent = 'Firing!';
        }
      } else if (qsPhase === 'fire') {
        qsLeft -= chunk;
        if (qsLeft <= 0) {
          qsPhase = 'idle';
          qsShownPeak = qsPeakP;
          qsRatio = Pcw > 0 ? qsPeakP / Pcw : 0;
          qsBtn.disabled = false;
          qsBtn.textContent = 'Q-switch pulse';
        }
      }
    }
    pOut = outputPower(p, s[1]);
  }

  // ---------- Visual atoms and photons
  function pickAtom(lv: number, nearX: number): number {
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < 10; k++) {
      const i = Math.floor(rand() * NA);
      if (level[i] !== lv) continue;
      const d = Math.abs(ax[i] - nearX);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) return best;
    const start = Math.floor(rand() * NA);
    for (let k = 0; k < NA; k++) {
      const i = (start + k) % NA;
      if (level[i] === lv) return i;
    }
    return -1;
  }

  function doPump(): void {
    const i = pickAtom(0, (rand() * 2 - 1) * ROD_HALF);
    if (i < 0) return;
    level[i] = 3;
    aTimer[i] = 0.18;
    aFlash[i] = 0.6;
  }

  function doSpont(): void {
    const i = pickAtom(2, (rand() * 2 - 1) * ROD_HALF);
    if (i < 0) return;
    level[i] = 1;
    aTimer[i] = 0.18;
    const u = rand() * 2 - 1;
    const ph = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    spawnPhoton(3, ax[i], ay[i], az[i], r * Math.cos(ph), u, r * Math.sin(ph), 0);
  }

  function doStim(targetAx: number): void {
    // Find an axial photon inside the rod and clone it next to an excited atom.
    let src = -1;
    if (nAxial > 0) {
      for (let k = 0; k < 12; k++) {
        const j = Math.floor(rand() * PH);
        if (phType[j] === 1 && Math.abs(phPos[j * 3]) < ROD_HALF) {
          src = j;
          break;
        }
      }
    }
    const i = pickAtom(2, src >= 0 ? phPos[src * 3] : (rand() * 2 - 1) * ROD_HALF);
    if (i < 0) return;
    level[i] = 1;
    aTimer[i] = 0.18;
    aFlash[i] = 1;
    if (nAxial >= targetAx + 10) return;
    if (src >= 0) spawnPhoton(1, phPos[src * 3] + phDir[src * 3] * 0.05, ay[i], az[i], phDir[src * 3], 0, 0, 1);
    else spawnPhoton(1, ax[i], ay[i], az[i], rand() < 0.5 ? -1 : 1, 0, 0, 1);
  }

  function updateVisuals(dt: number): void {
    const M = mirrorX(p.L);
    // Target number of axial photons: logarithmic in q, zero well below threshold.
    const lq = Math.log10(Math.max(1, s[1]));
    const targetAx = Math.round(PH_AX_MAX * Math.max(0, Math.min(1, (lq - 4) / 9.5)));

    // Events from the rate equations, capped per frame so a giant pulse stays readable.
    let n = Math.min(80, Math.floor(evPump));
    evPump -= Math.floor(evPump);
    for (let k = 0; k < n; k++) doPump();
    n = Math.min(40, Math.floor(evSpont));
    evSpont -= Math.floor(evSpont);
    for (let k = 0; k < n; k++) doSpont();
    n = Math.min(160, Math.floor(evStim));
    evStim -= Math.floor(evStim);
    for (let k = 0; k < n; k++) doStim(targetAx);
    evPump = Math.min(evPump, 5);
    evSpont = Math.min(evSpont, 5);
    evStim = Math.min(evStim, 5);

    // Keep the drawn excited count in step with N.
    let up = 0;
    for (let i = 0; i < NA; i++) if (level[i] >= 2) up++;
    const targetUp = Math.round(Math.min(0.94 * NA, s[0] * scale));
    let diff = targetUp - up;
    const lasing = s[1] > 1e6;
    while (diff > 2) {
      doPump();
      diff--;
    }
    while (diff < -2) {
      if (lasing) doStim(targetAx);
      else doSpont();
      diff++;
    }
    // Seed a lasing photon if the cavity should hold some and has none.
    if (targetAx > 0 && nAxial === 0) doStim(targetAx);

    // Atom level timers, colours and flashes
    for (let i = 0; i < NA; i++) {
      if (aTimer[i] > 0) {
        aTimer[i] -= dt;
        if (aTimer[i] <= 0) {
          if (level[i] === 3) level[i] = 2;
          else if (level[i] === 1) level[i] = 0;
        }
      }
      if (aFlash[i] > 0) aFlash[i] = Math.max(0, aFlash[i] - dt * 3);
      const f = aFlash[i];
      tmpC.copy(levelColors[level[i]]).lerp(white, f * 0.8);
      atoms.setColorAt(i, tmpC);
      const sc = level[i] === 0 ? 0.8 : 1 + f * 0.9;
      m4.compose(vP.set(ax[i], ay[i], az[i]), qI, vS.set(sc, sc, sc));
      atoms.setMatrixAt(i, m4);
    }
    atoms.instanceMatrix.needsUpdate = true;
    if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;

    // Photons
    const excess = nAxial - targetAx;
    const pExit = Math.max(0.08, Math.min(1, 0.1 + excess / Math.max(8, targetAx)));
    const qsClosed = qsPhase === 'hold';
    for (let i = 0; i < PH; i++) {
      const ty = phType[i];
      if (ty === 0) continue;
      const o = i * 3;
      const step = (ty === 3 ? 5 : V_PH) * dt;
      phPos[o] += phDir[o] * step;
      phPos[o + 1] += phDir[o + 1] * step;
      phPos[o + 2] += phDir[o + 2] * step;
      if (phFlash[i] > 0) phFlash[i] = Math.max(0, phFlash[i] - dt * 2.2);
      const f = phFlash[i];
      if (ty === 1) {
        if (qsClosed && rand() < dt * 6) {
          killPhoton(i);
          continue;
        }
        if (phPos[o] < -M + 0.08 && phDir[o] < 0) phDir[o] = 1;
        else if (phPos[o] > M - 0.08 && phDir[o] > 0) {
          if (rand() < pExit) {
            phType[i] = 2;
            nAxial--;
            phPos[o + 1] *= 0.25;
            phPos[o + 2] *= 0.25;
          } else phDir[o] = -1;
        }
        tmpC.copy(LASER_COL).lerp(white, f);
        phSize[i] = 0.1 + 0.14 * f;
      } else if (ty === 2) {
        if (phPos[o] > M + BEAM_LEN) {
          killPhoton(i);
          continue;
        }
        tmpC.copy(LASER_COL);
        phSize[i] = 0.09;
      } else {
        phLife[i] -= dt;
        if (phLife[i] <= 0) {
          killPhoton(i);
          continue;
        }
        tmpC.copy(SPONT_COL).multiplyScalar(0.5 * (phLife[i] / 0.55));
        phSize[i] = 0.07;
      }
      phCol[o] = tmpC.r;
      phCol[o + 1] = tmpC.g;
      phCol[o + 2] = tmpC.b;
    }
    // Remove extra axial photons when the cavity should be nearly empty.
    if (targetAx === 0 && nAxial > 0) {
      for (let i = 0; i < PH && nAxial > 0; i++) if (phType[i] === 1 && rand() < dt * 3) killPhoton(i);
    }
    phGeo.attributes.position.needsUpdate = true;
    phGeo.attributes.aColor.needsUpdate = true;
    phGeo.attributes.aSize.needsUpdate = true;
    const cam = stage.camera as THREE.PerspectiveCamera;
    phMat.uniforms.uScale.value = stage.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));

    // Beam: brightness follows output power, with a short peak hold so pulses register.
    envelope = Math.max(outputPower(p, frameMaxQ), envelope * Math.exp(-dt / 0.35));
    const on = envelope > 1e-3;
    beamCore.visible = on;
    beamGlow.visible = on;
    beamLabel.visible = on;
    if (on) {
      const lv = envelope / 2;
      const w = 0.07 * (1 + Math.min(1.6, Math.log10(1 + 4 * lv)));
      beamCore.scale.set(1, w, w);
      beamGlow.scale.set(1, w * 2.4, w * 2.4);
      (beamCore.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, 0.25 + 0.7 * Math.sqrt(Math.min(1, lv)));
      (beamGlow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.5, 0.08 + 0.2 * Math.sqrt(lv));
    }
    ocMat.emissive.setRGB(0.05 + 0.4 * Math.min(1, envelope / 2), 0.1, 0.12);
  }

  // ---------- Frame loop
  let drawTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      simulate(dt * SPEEDS[speed]);
      updateVisuals(dt);
    }
    // Challenge flags
    if (touched && ratio < 0.98) belowSeen = true;
    if (belowSeen && ratio > 1.02 && pOut > 0.5 * Pcw && Pcw > 0) crossed = true;
    drawTimer += dt;
    if (drawTimer > 0.066) {
      drawTimer = 0;
      drawTrace();
      drawPI();
      drawLevels(s[0] / Nth);
      updateReadouts();
    }
  });

  // ---------- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset (pump on)', onClick: () => { touch(); reset(); } },
  ]);
  ui.select<Speed>({
    key: 'speed', label: 'Time scale', value: speed,
    options: [{ value: 'slow', label: '10 µs/s' }, { value: 'normal', label: '100 µs/s' }, { value: 'fast', label: '400 µs/s' }],
    onChange: (v) => { speed = v; },
  });

  ui.section('Laser');
  ui.slider({ key: 'pump', label: 'Pump power (absorbed)', min: 0, max: 10, step: 0.05, value: p.pumpW, unit: 'W', format: (v) => v.toFixed(2), onInput: (v) => { p.pumpW = v; touch(); refresh(); } });
  ui.slider({ key: 'R', label: 'Output mirror reflectivity', min: 0.8, max: 0.999, step: 0.001, value: p.R, format: (v) => `${(v * 100).toFixed(1)}%`, onInput: (v) => { p.R = v; touch(); refresh(); } });
  ui.slider({ key: 'L', label: 'Cavity length', min: 0.1, max: 1, step: 0.01, value: p.L, unit: 'm', format: (v) => v.toFixed(2), onInput: (v) => { p.L = v; touch(); refresh(); } });
  const [qsBtn] = ui.buttons([
    {
      label: 'Q-switch pulse', key: 'qswitch', primary: true,
      onClick: () => {
        if (qsPhase !== 'idle') return;
        touch();
        qsPhase = 'hold';
        qsLeft = QS_HOLD;
        c = coeffs(p, QS_LOSS);
        qsBtn.disabled = true;
        qsBtn.textContent = 'Charging…';
      },
    },
  ]);
  ui.note('The Q-switch blocks the cavity for 345 µs while the pump stores inversion, then opens it at once.');

  ui.section('Live readouts');
  const rPth = ui.readout('Pth', 'threshold pump');
  const rR = ui.readout('r', 'pump / threshold');
  const rP = ui.readout('pout', 'output power');
  const rChk = ui.readout('check', 'sim / theory (CW)');
  const rN = ui.readout('N', 'inversion N/N_th');
  const rQ = ui.readout('q', 'photons in cavity');
  const rTc = ui.readout('tauc', 'photon lifetime τ_c');
  const rFsr = ui.readout('fsr', 'mode spacing c/2L');
  const rFro = ui.readout('fro', 'relaxation f (linear)');
  const rFsp = ui.readout('fspike', 'measured spike rate');
  const rEta = ui.readout('eta', 'slope efficiency');
  const rQs = ui.readout('qsratio', 'Q-switch peak / CW');
  ui.legend([
    { color: css(LEVEL_COL[0]), label: 'ground' },
    { color: css(PALETTE.violet), label: 'pumped' },
    { color: css(PALETTE.amber), label: 'upper laser level' },
    { color: css(PALETTE.rose), label: 'just emitted' },
    { color: '#ff4b4b', label: 'laser photon' },
  ]);

  function updateReadouts(): void {
    rPth(fmtW(Pth));
    rR(ratio.toFixed(2));
    rP(fmtW(pOut));
    if (qsPhase !== 'idle') rChk('Q-switching');
    else if (Pcw <= 0) rChk('below threshold');
    else {
      const x = pOut / Pcw;
      rChk(Math.abs(x - 1) < 0.02 ? x.toFixed(4) : 'settling…');
    }
    rN((s[0] / Nth).toFixed(3));
    rQ(s[1] < 1e4 ? s[1].toFixed(0) : s[1].toExponential(2));
    rTc(`${(cavityLifetime(p) * 1e9).toFixed(1)} ns`);
    rFsr(`${(modeSpacing(p.L) / 1e6).toFixed(0)} MHz`);
    const ro = relaxation(p);
    rFro(ro.fR > 0 ? `${(ro.fR / 1e3).toFixed(1)} kHz` : 'none');
    rFsp(spikePeriod > 0 && t - lastPeakT < 60e-6 ? `${(1 / spikePeriod / 1e3).toFixed(1)} kHz` : '…');
    rEta(`${(slopeEfficiency(p) * 100).toFixed(1)}%`);
    rQs(qsRatio > 0 ? `${qsRatio.toFixed(0)}×` : '…');
  }

  reset();
  drawTrace();
  drawLevels(0);
  updateReadouts();

  return {
    state: () => ({
      t: t * 1e6,
      pump: p.pumpW,
      R: p.R,
      L: p.L,
      r: ratio,
      N: s[0] / Nth,
      q: s[1],
      pout: pOut,
      pcw: Pcw,
      lasing: pOut > 1e-3,
      touched,
      crossed,
      spikes,
      qsRatio,
      qsPhase,
      modeSpacingMHz: modeSpacing(p.L) / 1e6,
    }),
    dispose: () => {
      legend.remove();
      pi.remove();
      tr.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'lasers',
  number: 40,
  title: 'How a Laser Works',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'Light that copies itself, one photon at a time.',
  content,
  mount,
};

export default topic;
