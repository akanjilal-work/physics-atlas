import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  E_PLANCK, HBARC, LANDMARKS, RHO_OBS, energyScale, matchingCutoff, modesPerM3, rhoCutoff, rhoModel,
} from './physics.ts';

type View = 'both' | 'modes' | 'tower';

// ---------------------------------------------------------------- scales
const LOG_MIN = -3; // 1 meV
const LOG_MAX = Math.log10(E_PLANCK); // 28.09
const LOG_MATCH = Math.log10(matchingCutoff(RHO_OBS));
const LOG2 = Math.log10(2);
const logRatioOf = (rho: number) => Math.log10(rho / RHO_OBS);

// Mode counter (k-space octant)
const KX = -9.2; // k-space origin
const KZ = -2.5;
const SIDE = 5;
const NMAX = 22;
const SP = SIDE / (NMAX + 1);
const R0 = 1.8; // lattice radius lit at the lowest cutoff
const R1 = NMAX + 0.4; // lattice radius lit at the Planck cutoff
const tOfLog = (lg: number) => Math.min(1, Math.max(0, (lg - LOG_MIN) / (LOG_MAX - LOG_MIN)));
const rOfLog = (lg: number) => R0 + (R1 - R0) * tOfLog(lg);
const logOfR = (r: number) => LOG_MIN + ((r - R0) / (R1 - R0)) * (LOG_MAX - LOG_MIN);

// Energy tower
const TX = 3.2;
const DH = 0.1; // height per decade
const D_MIN = -4;
const D_MAX = 121;
const NSLAB = D_MAX - D_MIN + 1;
const yOfDec = (d: number) => d * DH;

// Standing waves panel
const WX0 = KX;
const WX1 = KX + SIDE;
const WPTS = 420;
const WROWS = 3;

// ---------------------------------------------------------------- colour map
const STOPS = [new THREE.Color(PALETTE.cyan), new THREE.Color(PALETTE.green), new THREE.Color(PALETTE.amber), new THREE.Color(PALETTE.rose)];
function cmap(t: number, out: THREE.Color): THREE.Color {
  const u = Math.min(0.9999, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.floor(u);
  return out.copy(STOPS[i]).lerp(STOPS[i + 1], u - i);
}

// ---------------------------------------------------------------- formatting
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');
function sci(x: number, dig = 1): string {
  if (x === 0 || !Number.isFinite(x)) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  let m = x / 10 ** e;
  let ee = e;
  if (Math.abs(Number(m.toFixed(dig))) >= 10) { m /= 10; ee += 1; }
  if (ee >= -2 && ee <= 3) return x.toPrecision(dig + 1).replace(/\.?0+$/, (s) => (s.includes('.') ? '' : s));
  return `${m.toFixed(dig)}×10${sup(ee)}`;
}
function fmtE(ev: number): string {
  if (ev < 1) return `${(ev * 1e3).toPrecision(3)} meV`;
  if (ev < 1e3) return `${ev.toPrecision(3)} eV`;
  if (ev < 1e6) return `${(ev / 1e3).toPrecision(3)} keV`;
  if (ev < 1e9) return `${(ev / 1e6).toPrecision(3)} MeV`;
  if (ev < 1e13) return `${(ev / 1e9).toPrecision(3)} GeV`;
  return `${sci(ev / 1e9, 1)} GeV`;
}
function fmtLen(m: number): string {
  if (m >= 1e-3) return `${(m * 1e3).toPrecision(2)} mm`;
  if (m >= 1e-6) return `${(m * 1e6).toPrecision(2)} µm`;
  if (m >= 1e-9) return `${(m * 1e9).toPrecision(2)} nm`;
  return `${sci(m, 1)} m`;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM_BOTH: [number, number, number] = [-0.8, 4.6, 21.5];
  const TGT_BOTH: [number, number, number] = [-0.8, 3.7, 0];
  const stage = createStage(viewport, { camera: CAM_BOTH, target: TGT_BOTH, fov: 45, far: 800 });
  const { scene } = stage;

  let logCut = Math.log10(246.22e9);
  let logMs = 12; // 1 TeV
  let cancel = false;
  let view: View = 'both';
  let doubleFactor = 0;

  // derived
  let ecut = 0;
  let rhoB = 0; // bosons alone
  let rho = 0; // shown model
  let lrOff = 0;
  let lr = 0;

  // ============================================================ mode counter
  const kGroup = new THREE.Group();
  kGroup.position.set(KX, 0, KZ);
  scene.add(kGroup);
  const cube = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SIDE, SIDE, SIDE)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.9 }),
  );
  cube.position.set(SIDE / 2, SIDE / 2, SIDE / 2);
  kGroup.add(cube);
  const axisMat = new THREE.LineBasicMaterial({ color: 0x8391ab });
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(SIDE + 0.5, 0, 0),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, SIDE + 0.5, 0),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, SIDE + 0.5),
  ]);
  kGroup.add(new THREE.LineSegments(axisGeo, axisMat));
  stage.label('kx', [SIDE + 0.8, 0, 0], 'muted', kGroup);
  stage.label('ky', [0, SIDE + 0.8, 0], 'muted', kGroup);
  stage.label('kz', [0, 0, SIDE + 0.8], 'muted', kGroup);
  stage.label('k-space: one dot per standing-wave mode', [SIDE / 2, -0.35, SIDE + 0.3], 'muted', kGroup);

  // Lattice points n_i = 1..NMAX inside the octant sphere
  const pos: number[] = [];
  const rad: number[] = [];
  for (let x = 1; x <= NMAX; x++) for (let y = 1; y <= NMAX; y++) for (let z = 1; z <= NMAX; z++) {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > R1) continue;
    pos.push(x * SP, y * SP, z * SP);
    rad.push(r);
  }
  const NP = rad.length;
  const pRad = new Float32Array(rad);
  const pCol = new Float32Array(NP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.075, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pGeo, pMat);
  kGroup.add(points);

  const octGeo = new THREE.SphereGeometry(1, 28, 14, Math.PI / 2, Math.PI / 2, 0, Math.PI / 2);
  const cutShell = new THREE.Mesh(octGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  const cutWire = new THREE.Mesh(octGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber, wireframe: true, transparent: true, opacity: 0.28 }));
  kGroup.add(cutShell, cutWire);
  const susyWire = new THREE.Mesh(octGeo, new THREE.MeshBasicMaterial({ color: PALETTE.green, wireframe: true, transparent: true, opacity: 0.5 }));
  kGroup.add(susyWire);
  const cutLabel = stage.label('kmax', [0, 0, 0], 'muted', kGroup);
  cutLabel.element.style.color = css(PALETTE.amber);
  const susyLabel = stage.label('Mₛ', [0, 0, 0], 'muted', kGroup);
  susyLabel.element.style.color = css(PALETTE.green);

  // Counter above the cube
  const counter = stage.label('', [KX + SIDE / 2 + 1.2, SIDE + 1.2, 0], 'big');
  counter.element.style.fontSize = '17px';
  counter.element.style.color = css(PALETTE.amber);
  const counterSub = stage.label('', [KX + SIDE / 2 + 1.6, SIDE + 0.75, 0], 'muted');

  // ============================================================ standing waves
  const wGroup = new THREE.Group();
  scene.add(wGroup);
  const WY = [-0.85, -1.45, -2.2];
  const wLines: THREE.Line[] = [];
  const wPos: Float32Array[] = [];
  const wN = [1, 2, 12];
  for (let r = 0; r < WROWS; r++) {
    const arr = new Float32Array(WPTS * 3);
    for (let i = 0; i < WPTS; i++) {
      arr[i * 3] = WX0 + ((WX1 - WX0) * i) / (WPTS - 1);
      arr[i * 3 + 1] = WY[r];
      arr[i * 3 + 2] = 2.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const c = r === WROWS - 1 ? PALETTE.amber : cmap(r * 0.06, new THREE.Color()).getHex();
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }));
    line.frustumCulled = false;
    wGroup.add(line);
    wLines.push(line);
    wPos.push(arr);
  }
  const wallGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(WX0, -0.55, 2.5), new THREE.Vector3(WX0, -2.6, 2.5),
    new THREE.Vector3(WX1, -0.55, 2.5), new THREE.Vector3(WX1, -2.6, 2.5),
  ]);
  wGroup.add(new THREE.LineSegments(wallGeo, new THREE.LineBasicMaterial({ color: 0x8391ab })));
  const wLabel = stage.label('', [WX1 + 0.3, WY[2], 2.5], 'muted');
  wLabel.center.set(0, 0.5);
  wLabel.element.style.color = css(PALETTE.amber);
  const nl = stage.label('standing waves n = 1, 2', [WX1 + 0.3, WY[0] - 0.3, 2.5], 'muted');
  nl.center.set(0, 0.5);

  // ============================================================ energy tower
  const tGroup = new THREE.Group();
  scene.add(tGroup);
  const slabGeo = new THREE.BoxGeometry(1.3, DH * 0.82, 1.3);
  const slabs = new THREE.InstancedMesh(slabGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), NSLAB);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < NSLAB; i++) {
    m4.makeTranslation(TX, yOfDec(D_MIN + i) + DH / 2, 0);
    slabs.setMatrixAt(i, m4);
    slabs.setColorAt(i, new THREE.Color(0x151c2c));
  }
  tGroup.add(slabs);
  const slabBase: THREE.Color[] = [];
  for (let i = 0; i < NSLAB; i++) {
    const d = D_MIN + i;
    const lg = LOG_MATCH + (d + 0.5) / 4;
    slabBase.push(cmap(tOfLog(lg), new THREE.Color()));
  }
  // Observed line
  const obsPlane = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.025, 2.0), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  obsPlane.position.set(TX, 0, 0);
  tGroup.add(obsPlane);
  const obsLabel = stage.label(`observed ρΛ = ${sci(RHO_OBS)} J/m³ ≈ (${(energyScale(RHO_OBS) * 1e3).toFixed(1)} meV)⁴`, [TX + 1.0, -0.22, 0], '');
  obsLabel.center.set(0, 0);
  obsLabel.element.style.color = css(PALETTE.cyan);
  // Landmarks
  const tickPts: THREE.Vector3[] = [];
  for (const lm of LANDMARKS) {
    const y = yOfDec(logRatioOf(rhoCutoff(lm.eEV)));
    tickPts.push(new THREE.Vector3(TX + 0.7, y, 0), new THREE.Vector3(TX + 1.9, y, 0));
    const l = stage.label(lm.label, [TX + 1.95, y, 0], 'muted', tGroup);
    l.center.set(0, 0.5);
    if (lm.speculative) l.element.style.opacity = '0.7';
  }
  tGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), new THREE.LineBasicMaterial({ color: 0x56627c })));
  for (let d = 20; d <= 120; d += 20) {
    const l = stage.label(`10${sup(d)}`, [TX - 0.95, yOfDec(d), 0], 'muted', tGroup);
    l.center.set(1, 0.5);
  }
  // Current marker
  const marker = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 1.9), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  tGroup.add(marker);
  const markerLabel = stage.label('', [0, 0, 0], '', tGroup);
  markerLabel.center.set(1, 0.5);
  markerLabel.element.style.color = css(PALETTE.amber);
  // Boson and fermion columns
  const colGeo = new THREE.BoxGeometry(0.42, 1, 0.42);
  colGeo.translate(0, 0.5, 0);
  const bosCol = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.55 }));
  const ferCol = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.55 }));
  bosCol.position.set(TX - 1.45, yOfDec(D_MIN), 0);
  ferCol.position.set(TX + 1.45, yOfDec(D_MIN), 0);
  tGroup.add(bosCol, ferCol);
  const bosLabel = stage.label('+ bosons', [0, 0, 0], '', tGroup);
  bosLabel.element.style.color = css(PALETTE.amber);
  const ferLabel = stage.label('− fermions', [0, 0, 0], '', tGroup);
  ferLabel.element.style.color = css(PALETTE.violet);
  const resMarker = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 1.9), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  tGroup.add(resMarker);
  const resLabel = stage.label('', [0, 0, 0], '', tGroup);
  resLabel.center.set(1, 0.5);
  resLabel.element.style.color = css(PALETTE.green);
  stage.label('energy tower: one slab per factor of 10', [TX, yOfDec(D_MIN) - 0.45, 0], 'muted');

  // ============================================================ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const GRAD = `<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,${css(PALETTE.cyan)},${css(PALETTE.green)},${css(PALETTE.amber)},${css(PALETTE.rose)})"></div>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Counting the vacuum</div>
<div>Dots: wave modes. Inside the <span style="color:${css(PALETTE.amber)}">amber shell</span> = counted (log radius).</div>
${GRAD}<div>mode energy, meV → Planck</div>
<div style="margin-top:4px">Tower: one slab per ×10 above the <span style="color:${css(PALETTE.cyan)}">observed</span> value.</div>`;
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 240;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '240px', height: '120px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const IY0 = -8;
  const IY1 = 126;

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    const L = 16;
    const R = W - 16;
    const T = 42;
    const B = H - 30;
    const xOf = (lg: number) => L + ((lg - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (R - L);
    const yOf = (v: number) => B - ((Math.min(IY1, Math.max(IY0, v)) - IY0) / (IY1 - IY0)) * (B - T);
    ictx.clearRect(0, 0, W, H);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('log₁₀ ρ/ρΛ vs log cutoff', L, 28);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const v of [60, 120]) {
      ictx.beginPath();
      ictx.moveTo(L, yOf(v));
      ictx.lineTo(R, yOf(v));
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(String(v), L + 4, yOf(v) - 4);
    }
    ictx.fillStyle = '#56627c';
    ictx.fillText('meV', L, H - 6);
    ictx.fillText('Planck', R - 72, H - 6);
    ictx.setLineDash([8, 6]);
    ictx.strokeStyle = css(PALETTE.cyan);
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.moveTo(L, yOf(0));
    ictx.lineTo(R, yOf(0));
    ictx.stroke();
    ictx.setLineDash([]);
    ictx.strokeStyle = css(PALETTE.amber);
    ictx.lineWidth = 3;
    ictx.beginPath();
    ictx.moveTo(xOf(LOG_MIN), yOf(4 * (LOG_MIN - LOG_MATCH)));
    ictx.lineTo(xOf(LOG_MAX), yOf(4 * (LOG_MAX - LOG_MATCH)));
    ictx.stroke();
    if (cancel) {
      const ms = 10 ** logMs;
      ictx.strokeStyle = css(PALETTE.green);
      ictx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const lg = LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / 120;
        const v = logRatioOf(rhoModel(10 ** lg, true, ms));
        if (i === 0) ictx.moveTo(xOf(lg), yOf(v));
        else ictx.lineTo(xOf(lg), yOf(v));
      }
      ictx.stroke();
    }
    ictx.fillStyle = cancel ? css(PALETTE.green) : css(PALETTE.amber);
    ictx.beginPath();
    ictx.arc(xOf(logCut), yOf(lr), 7, 0, Math.PI * 2);
    ictx.fill();
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('slope 4', xOf(8), yOf(4 * (8 - LOG_MATCH)) - 16);
  }

  // ============================================================ update
  const tmpC = new THREE.Color();
  const DIM = new THREE.Color(0x151c2c);
  const CANC = new THREE.Color(PALETTE.violet).multiplyScalar(0.28);

  function update(): void {
    ecut = 10 ** logCut;
    const ms = 10 ** logMs;
    rhoB = rhoCutoff(ecut);
    rho = rhoModel(ecut, cancel, ms);
    lrOff = logRatioOf(rhoB);
    lr = logRatioOf(rho);
    const susyActive = cancel && ms < ecut;

    // mode points
    const rCut = rOfLog(logCut);
    const rS = rOfLog(logMs);
    for (let i = 0; i < NP; i++) {
      const r = pRad[i];
      if (r <= rCut) {
        if (susyActive && r > rS) tmpC.copy(CANC);
        else cmap(tOfLog(logOfR(r)), tmpC);
      } else {
        tmpC.setRGB(0.05, 0.06, 0.09);
      }
      pCol[i * 3] = tmpC.r;
      pCol[i * 3 + 1] = tmpC.g;
      pCol[i * 3 + 2] = tmpC.b;
    }
    (pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    const sc = rCut * SP;
    cutShell.scale.setScalar(sc);
    cutWire.scale.setScalar(sc);
    cutLabel.position.set(sc * 0.72, sc * 0.72, sc * 0.2);
    cutLabel.element.textContent = `kmax ↔ ${fmtE(ecut)}`;
    susyWire.visible = susyActive;
    susyLabel.visible = susyActive;
    if (susyActive) {
      susyWire.scale.setScalar(rS * SP);
      susyLabel.position.set(rS * SP * 0.2, rS * SP * 0.95, rS * SP * 0.2);
      susyLabel.element.textContent = `Mₛ = ${fmtE(ms)}`;
    }

    // counter
    counter.element.textContent = `ρvac = ${sci(rho)} J/m³${susyActive ? ' (residue)' : ''}`;
    counter.element.style.color = susyActive ? css(PALETTE.green) : css(PALETTE.amber);
    counterSub.element.textContent = `${lr >= 0 ? '' : '1/'}10^${Math.abs(lr).toFixed(1)} × observed`;

    // waves: top row has n half-waves, growing with the cutoff (not to scale)
    wN[WROWS - 1] = Math.round(4 + 44 * tOfLog(logCut));
    wLabel.element.textContent = `shortest kept: λ = ${fmtLen((2 * Math.PI * HBARC) / ecut)}`;

    // tower
    const yB = yOfDec(lrOff);
    const yR = yOfDec(lr);
    for (let i = 0; i < NSLAB; i++) {
      const d = D_MIN + i;
      if (d + 0.5 <= lr) slabs.setColorAt(i, slabBase[i]);
      else if (cancel && d + 0.5 <= lrOff) slabs.setColorAt(i, CANC);
      else slabs.setColorAt(i, DIM);
    }
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;
    marker.position.set(TX, yB, 0);
    markerLabel.position.set(TX - 1.9, yB, 0);
    markerLabel.element.textContent = `${fmtE(ecut)} → 10^${lrOff.toFixed(1)}`;
    bosCol.visible = ferCol.visible = cancel;
    resMarker.visible = cancel;
    for (const l of [bosLabel, ferLabel, resLabel]) l.visible = cancel;
    if (cancel) {
      const h = Math.max(0.01, yB - yOfDec(D_MIN));
      bosCol.scale.set(1, h, 1);
      ferCol.scale.set(1, h, 1);
      bosLabel.position.set(TX - 1.45, yB + 0.3, 0);
      ferLabel.position.set(TX + 1.45, yB + 0.3, 0);
      resMarker.position.set(TX, yR, 0);
      resLabel.position.set(TX - 1.9, yR, 0);
      resLabel.element.textContent = `net 10^${lr.toFixed(1)}`;
      markerLabel.position.set(TX - 1.9, yB + 0.28, 0);
    }

    drawInset();
    updateReadouts();
  }

  // ============================================================ frame loop
  let tourU = -1;
  const TOUR_Y0 = yOfDec(D_MIN) + 0.5;
  const TOUR_Y1 = yOfDec(D_MAX) + 0.3;
  stage.onFrame((dt, t) => {
    // standing waves
    for (let r = 0; r < WROWS; r++) {
      const n = wN[r];
      const amp = r === WROWS - 1 ? 0.24 : 0.22;
      const w = Math.min(7, 1.3 * Math.sqrt(n) * 1.6);
      const ct = Math.cos(w * t);
      const arr = wPos[r];
      for (let i = 0; i < WPTS; i++) {
        const u = i / (WPTS - 1);
        arr[i * 3 + 1] = WY[r] + amp * ct * Math.sin(n * Math.PI * u);
      }
      (wLines[r].geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    // tower tour
    if (tourU >= 0) {
      tourU = Math.min(1, tourU + dt / 10);
      const e = tourU < 0.5 ? 2 * tourU * tourU : 1 - (-2 * tourU + 2) ** 2 / 2;
      const y = TOUR_Y0 + (TOUR_Y1 - TOUR_Y0) * e;
      stage.camera.position.set(TX + 5.5, y + 1.6, 11.5);
      stage.controls.target.set(TX + 1.6, y, 0);
      if (tourU >= 1) tourU = -1;
    }
    // pulse marker
    const s = 1 + 0.06 * Math.sin(t * 4);
    marker.scale.set(s, 1, s);
  });

  // ============================================================ controls
  const ui = new Panel(panel);
  ui.section('Cutoff');
  const cutCtl = ui.slider({
    key: 'cutoff', label: 'Cutoff energy E = ħc·kmax', min: LOG_MIN, max: Number(LOG_MAX.toFixed(3)), step: 0.001, value: logCut,
    format: (v) => fmtE(10 ** v),
    onInput: (v) => { logCut = v; update(); },
  });
  const setCut = (v: number) => {
    logCut = Math.min(LOG_MAX, Math.max(LOG_MIN, v));
    cutCtl.set(logCut, false);
    update();
  };
  ui.buttons([
    { label: 'Electroweak', onClick: () => setCut(Math.log10(246.22e9)) },
    { label: 'Planck', onClick: () => setCut(LOG_MAX) },
    {
      label: 'Double cutoff', key: 'double', primary: true,
      onClick: () => {
        if (logCut + LOG2 > LOG_MAX + 1e-9) { doubleFactor = 0; rFactor('beyond Planck'); return; }
        const before = rho;
        setCut(logCut + LOG2);
        doubleFactor = rho / before;
        updateReadouts();
      },
    },
  ]);

  ui.section('Supersymmetry');
  const cancelCtl = ui.toggle({ key: 'cancel', label: 'SUSY cancellation (add fermion partners)', value: cancel, onChange: (v) => { cancel = v; update(); } });
  ui.slider({
    key: 'susy', label: 'SUSY breaking scale Mₛ', min: 0, max: 28, step: 0.01, value: logMs,
    format: (v) => fmtE(10 ** v),
    onInput: (v) => { logMs = v; update(); },
  });
  ui.note('Colliders already exclude many superpartners below about 1 to 2 TeV. Below Mₛ the partners are too heavy to take part, so nothing cancels there.');

  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Camera', value: view,
    options: [{ value: 'both', label: 'Both' }, { value: 'modes', label: 'Mode counter' }, { value: 'tower', label: 'Tower' }],
    onChange: (v) => {
      view = v;
      tourU = -1;
      if (v === 'both') stage.flyTo(CAM_BOTH, TGT_BOTH);
      if (v === 'modes') stage.flyTo([-3.6, 4.2, 10.5], [-6.6, 1.6, 0]);
      if (v === 'tower') {
        const y = Math.max(1, yOfDec(lrOff));
        stage.flyTo([TX + 5.5, y + 1.5, 10], [TX + 0.8, y - 0.5, 0]);
      }
    },
  });
  ui.buttons([{ label: 'Fly up the tower', key: 'view', primary: true, onClick: () => { tourU = 0; } }]);

  ui.section('Live readouts');
  const rRho = ui.readout('rho', 'vacuum energy', 'J/m³');
  const rRatio = ui.readout('ratio', 'model / observed');
  const rModes = ui.readout('modes', 'modes per m³');
  const rEmode = ui.readout('emode', 'top mode ħω/2');
  const rLam = ui.readout('lmin', 'shortest wave');
  const rObs = ui.readout('obs', 'observed dark energy', 'J/m³');
  const rFactor = ui.readout('factor', 'last ×2 of cutoff');
  const rW = ui.readout('w', 'equation of state w');
  ui.legend([
    { color: css(PALETTE.amber), label: 'bosonic zero-point sum' },
    { color: css(PALETTE.violet), label: 'cancelled by fermions' },
    { color: css(PALETTE.green), label: 'SUSY residue' },
    { color: css(PALETTE.cyan), label: 'observed' },
  ]);

  function updateReadouts(): void {
    rRho(sci(rho, 2));
    rRatio(`${lr >= 0 ? '' : '1/'}10^${Math.abs(lr).toFixed(2)}`);
    rModes(sci(modesPerM3(ecut), 2));
    rEmode(fmtE(ecut / 2));
    rLam(fmtLen((2 * Math.PI * HBARC) / ecut));
    rObs(sci(RHO_OBS, 2));
    rFactor(doubleFactor > 0 ? `ρ × ${doubleFactor.toFixed(2)}` : 'press Double');
    rW('−1 (ρ constant)');
  }

  update();
  void cancelCtl;

  return {
    state: () => ({
      logCut,
      cutoffEV: ecut,
      cancel,
      logMs,
      rho,
      logRatio: lr,
      logRatioOff: lrOff,
      gapShrink: lrOff - lr,
      doubleFactor,
      view,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cosmological-constant',
  number: 83,
  title: 'The Vacuum Energy Puzzle',
  domain: 'cosmology',
  level: 3,
  status: 'live',
  tagline: 'A prediction off by a factor of about 10¹²⁰.',
  content,
  mount,
};

export default topic;
