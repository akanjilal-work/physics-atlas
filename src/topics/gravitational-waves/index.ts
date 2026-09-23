import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { GW150914, deform, planChirp, polygonArea, sampleWave, separation, type ChirpPlan, type WaveSample } from './physics.ts';

type Pol = 'plus' | 'cross' | 'circ';

const TWO_PI = Math.PI * 2;
/** Half-width of the ripple grid (scene units) and its segments per side. */
const GR = 4.6;
const NS = 160;
/** Radial lookup bins for the retarded-time table. */
const NB = 360;
const R_MAX = GR * Math.SQRT2;
/** Wavelength of the ripple at the start of the replay, in scene units. */
const LAMBDA0 = 2.0;
/** Every LINE_EVERY-th grid row and column is drawn as a grid line. */
const LINE_EVERY = 6;
/** On-screen wave frequency at the start of the replay (Hz) at time scale 1. */
const DISPLAY_F0 = 0.5;
/** Arm length of the real LIGO detectors (m). */
const LIGO_ARM = 4000;
const RING_N = 32;
const RING_R = 1.25;
const LOOP_N = 128;
const ARM = 1.9;
const H_CLAMP = 0.8;
const CAM: [number, number, number] = [0, 6.4, 11.2];
const TARGET: [number, number, number] = [0, 0.7, 0];
const RING_POS: [number, number, number] = [-5.0, 3.0, -2.6];
const IFO_POS: [number, number, number] = [3.7, 1.25, 2.6];

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Superscript digits for exponents in labels. */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '.': '·' };
const sup = (s: string) => s.split('').map((ch) => SUP[ch] ?? ch).join('');
const expLabel = (e: number) => `10${sup(e.toFixed(1))}`;

function sci(x: number, digits = 2): string {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(digits - 1)}×10${sup(String(e))}`;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: TARGET, fov: 42, near: 0.05, far: 200 });
  const { scene, camera } = stage;

  // --- Parameters
  let m1 = 25;
  let m2 = 15;
  let dMpc = GW150914.dMpc;
  let pol: Pol = 'plus';
  let exag = 20.8;
  let timeScale = 1;
  let playing = true;

  // --- Challenge bookkeeping
  let massTouched = false;
  let dTouched = false;
  let dMin = dMpc;
  let dMax = dMpc;
  let userRun = false;
  let runCounted = false;
  let userMerges = 0;
  let merges = 0;

  let plan: ChirpPlan = planChirp(m1, m2, dMpc);
  let t = 0;
  let rate = 1; // simulated seconds per displayed second
  let waveSpeed = 1; // scene units per simulated second
  let yScale = 1; // chirp plot half-height in strain
  const ws: WaveSample = { h: 0, phase: 0, f: 0, stage: 0 };
  const wr: WaveSample = { h: 0, phase: 0, f: 0, stage: 0 };

  // ===== Ripple grid: a height field z = A(r) h(t_ret)/h_max cos(2φ − Φ(t_ret))
  const NV = (NS + 1) * (NS + 1);
  const gPos = new Float32Array(NV * 3);
  const gCol = new Float32Array(NV * 3);
  const vBin = new Float32Array(NV);
  const vC2 = new Float32Array(NV);
  const vS2 = new Float32Array(NV);
  const vFade = new Float32Array(NV);
  for (let i = 0; i <= NS; i++) {
    for (let j = 0; j <= NS; j++) {
      const k = i * (NS + 1) + j;
      const x = -GR + (2 * GR * j) / NS;
      const z = -GR + (2 * GR * i) / NS;
      gPos[3 * k] = x;
      gPos[3 * k + 2] = z;
      const r = Math.hypot(x, z);
      const phi = Math.atan2(-z, x);
      vBin[k] = (r / R_MAX) * (NB - 1);
      vC2[k] = Math.cos(2 * phi);
      vS2[k] = Math.sin(2 * phi);
      const u = Math.min(1, Math.max(0, (GR - r) / 1.3));
      vFade[k] = u * u * (3 - 2 * u);
    }
  }
  const gIdx = new Uint32Array(NS * NS * 6);
  {
    let n = 0;
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NS; j++) {
        const a = i * (NS + 1) + j;
        const b = a + NS + 1;
        gIdx[n++] = a; gIdx[n++] = b; gIdx[n++] = a + 1;
        gIdx[n++] = a + 1; gIdx[n++] = b; gIdx[n++] = b + 1;
      }
    }
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setIndex(new THREE.BufferAttribute(gIdx, 1));
  const surface = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  surface.frustumCulled = false;
  scene.add(surface);

  // Grid lines that ride on the surface.
  const nLines = Math.floor(NS / LINE_EVERY) + 1;
  const lineMap = new Int32Array(nLines * (NS + 1) * 2);
  {
    let n = 0;
    for (let a = 0; a < nLines; a++) {
      const row = a * LINE_EVERY;
      for (let j = 0; j <= NS; j++) lineMap[n++] = row * (NS + 1) + j;
      for (let i = 0; i <= NS; i++) lineMap[n++] = i * (NS + 1) + row;
    }
  }
  const LV = lineMap.length;
  const lPos = new Float32Array(LV * 3);
  const lCol = new Float32Array(LV * 3);
  const lIdx: number[] = [];
  for (let s = 0; s < nLines * 2; s++) {
    for (let j = 0; j < NS; j++) lIdx.push(s * (NS + 1) + j, s * (NS + 1) + j + 1);
  }
  const lineBase = new THREE.Color(0x3d5286);
  const bg = new THREE.Color(PALETTE.bg);
  for (let v = 0; v < LV; v++) {
    const k = lineMap[v];
    lPos[3 * v] = gPos[3 * k];
    lPos[3 * v + 2] = gPos[3 * k + 2];
    const f = vFade[k];
    lCol[3 * v] = bg.r + (lineBase.r - bg.r) * f;
    lCol[3 * v + 1] = bg.g + (lineBase.g - bg.g) * f;
    lCol[3 * v + 2] = bg.b + (lineBase.b - bg.b) * f;
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
  lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
  lGeo.setIndex(lIdx);
  const gridLines = new THREE.LineSegments(lGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  gridLines.frustumCulled = false;
  scene.add(gridLines);

  // Static radial amplitude profile: rises from zero at the centre, then falls off like 1/r.
  const ampR = new Float32Array(NB);
  for (let i = 0; i < NB; i++) {
    const r = (i / (NB - 1)) * R_MAX;
    const inner = 1 - Math.exp(-(r * r) / 0.35);
    ampR[i] = (0.62 * inner) / (1 + r / 1.6);
  }
  const tabC = new Float32Array(NB);
  const tabS = new Float32Array(NB);
  const cBase = new THREE.Color(0x111a2e);
  const cUp = new THREE.Color(PALETTE.cyan);
  const cDown = new THREE.Color(PALETTE.violet);

  function updateGrid(): void {
    const hN = plan.hEnd;
    for (let i = 0; i < NB; i++) {
      const r = (i / (NB - 1)) * R_MAX;
      sampleWave(plan, t - r / waveSpeed, wr);
      const a = ampR[i] * Math.pow(wr.h / hN, 0.7);
      tabC[i] = a * Math.cos(wr.phase);
      tabS[i] = a * Math.sin(wr.phase);
    }
    for (let k = 0; k < NV; k++) {
      const b = vBin[k];
      const i0 = b | 0;
      const i1 = i0 < NB - 1 ? i0 + 1 : i0;
      const fr = b - i0;
      const C = tabC[i0] + (tabC[i1] - tabC[i0]) * fr;
      const S = tabS[i0] + (tabS[i1] - tabS[i0]) * fr;
      const fd = vFade[k];
      const y = (vC2[k] * C + vS2[k] * S) * fd;
      gPos[3 * k + 1] = y;
      const s = Math.min(1, Math.abs(y) * 3);
      const tc = y >= 0 ? cUp : cDown;
      const r0 = cBase.r + (tc.r - cBase.r) * s * 0.75;
      const g0 = cBase.g + (tc.g - cBase.g) * s * 0.75;
      const b0 = cBase.b + (tc.b - cBase.b) * s * 0.75;
      gCol[3 * k] = bg.r + (r0 - bg.r) * fd;
      gCol[3 * k + 1] = bg.g + (g0 - bg.g) * fd;
      gCol[3 * k + 2] = bg.b + (b0 - bg.b) * fd;
    }
    for (let v = 0; v < LV; v++) lPos[3 * v + 1] = gPos[3 * lineMap[v] + 1] + 0.012;
    (gGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (gGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (lGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // ===== The binary
  const glowTex = glowTexture();
  function makeHole(color: number): { g: THREE.Group; core: THREE.Mesh; glow: THREE.Sprite } {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.4, metalness: 0.2 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    g.add(glow, core);
    scene.add(g);
    return { g, core, glow };
  }
  const hole1 = makeHole(PALETTE.amber);
  const hole2 = makeHole(PALETTE.rose);
  const holeF = makeHole(PALETTE.white);
  holeF.g.visible = false;
  const trail1 = new Trail(260, PALETTE.amber, 0.9);
  const trail2 = new Trail(260, PALETTE.rose, 0.9);
  scene.add(trail1.line, trail2.line);
  const Y_BIN = 0.32;
  const statusLabel = stage.label('', [0, 1.35, 0], 'big');
  statusLabel.visible = false;

  const sizeOf = (m: number) => 0.09 + 0.1 * Math.cbrt(m / 40);
  function setHoleSize(h: typeof hole1, m: number): void {
    const s = sizeOf(m);
    h.core.scale.setScalar(s);
    h.glow.scale.setScalar(s * 5);
  }

  // ===== Ring of free test particles, facing the camera
  const ringGroup = new THREE.Group();
  ringGroup.position.set(...RING_POS);
  scene.add(ringGroup);
  ringGroup.lookAt(camera.position);
  const ringRef: THREE.Vector3[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * TWO_PI;
    ringRef.push(new THREE.Vector3(RING_R * Math.cos(a), RING_R * Math.sin(a), 0));
  }
  const refLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringRef), new THREE.LineDashedMaterial({ color: 0x56627c, dashSize: 0.08, gapSize: 0.06 }));
  refLine.computeLineDistances();
  ringGroup.add(refLine);
  const axes = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.7, 0, 0), new THREE.Vector3(1.7, 0, 0),
      new THREE.Vector3(0, -1.7, 0), new THREE.Vector3(0, 1.7, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0x2c3852 }),
  );
  ringGroup.add(axes);
  const loopPos = new Float32Array(LOOP_N * 3);
  const loopGeo = new THREE.BufferGeometry();
  loopGeo.setAttribute('position', new THREE.BufferAttribute(loopPos, 3).setUsage(THREE.DynamicDrawUsage));
  const loop = new THREE.LineLoop(loopGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.55 }));
  loop.frustumCulled = false;
  ringGroup.add(loop);
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 16, 10), new THREE.MeshStandardMaterial({ color: PALETTE.green, emissive: PALETTE.green, emissiveIntensity: 0.45 }), RING_N);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  ringGroup.add(beads);
  const ringLabel = stage.label('', [RING_POS[0], RING_POS[1] - 1.8, RING_POS[2]], 'muted');
  const loopXY = new Float32Array(LOOP_N * 2);

  // ===== L-shaped interferometer, facing the camera
  const ifo = new THREE.Group();
  ifo.position.set(...IFO_POS);
  scene.add(ifo);
  ifo.lookAt(camera.position);
  ifo.scale.setScalar(0.85);
  const CX = -0.95;
  const CY = -0.95;
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.7, metalness: 0.3, transparent: true, opacity: 0.55 });
  const tubeX = new THREE.Mesh(new THREE.BoxGeometry(ARM, 0.16, 0.16), tubeMat);
  tubeX.position.set(CX + ARM / 2, CY, -0.05);
  const tubeY = new THREE.Mesh(new THREE.BoxGeometry(0.16, ARM, 0.16), tubeMat);
  tubeY.position.set(CX, CY + ARM / 2, -0.05);
  ifo.add(tubeX, tubeY);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.8, roughness: 0.2, emissive: 0x334055 });
  const mirrorX = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.2), mirrorMat);
  const mirrorY = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.2), mirrorMat);
  ifo.add(mirrorX, mirrorY);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.2), mirrorMat);
  splitter.position.set(CX, CY, 0);
  splitter.rotation.z = Math.PI / 4;
  ifo.add(splitter);
  const laser = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.5 }));
  laser.position.set(CX - 0.7, CY, 0);
  ifo.add(laser);
  const out = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
  out.position.set(CX, CY - 0.55, 0);
  ifo.add(out);
  const outGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.red, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  outGlow.scale.setScalar(0.9);
  outGlow.position.copy(out.position);
  ifo.add(outGlow);
  const beamPos = new Float32Array(4 * 3 * 2);
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
  const beams = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0.9 }));
  beams.frustumCulled = false;
  ifo.add(beams);
  // Rest positions of the end mirrors.
  const ticks = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(CX + ARM, CY - 0.32, 0), new THREE.Vector3(CX + ARM, CY + 0.32, 0),
      new THREE.Vector3(CX - 0.32, CY + ARM, 0), new THREE.Vector3(CX + 0.32, CY + ARM, 0),
    ]),
    new THREE.LineDashedMaterial({ color: 0x8391ab, dashSize: 0.05, gapSize: 0.04 }),
  );
  ticks.computeLineDistances();
  ifo.add(ticks);
  function setSeg(i: number, x0: number, y0: number, x1: number, y1: number): void {
    const k = i * 6;
    beamPos[k] = x0;
    beamPos[k + 1] = y0;
    beamPos[k + 2] = 0;
    beamPos[k + 3] = x1;
    beamPos[k + 4] = y1;
    beamPos[k + 5] = 0;
  }
  const ifoLabel = stage.label('', [IFO_POS[0] + 0.1, IFO_POS[1] - 1.75, IFO_POS[2] + 0.4], 'muted');
  const ifoNote = stage.label('× wave: arms do not move', [IFO_POS[0] - 0.4, IFO_POS[1] + 1.35, IFO_POS[2]], '');
  ifoNote.visible = false;
  stage.label('binary black hole and its ripples', [-0.6, 0.05, GR - 0.2], 'muted');

  function paintLabels(): void {
    ringLabel.element.textContent = `free particles, motion ×${expLabel(exag)}`;
    ifoLabel.element.textContent = `detector, arms ×${expLabel(exag)}`;
  }

  // ===== Chirp inset
  const PW = 640;
  const PH = 330;
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
  const PX0 = 16;
  const PX1 = PW - 16;
  const PY0 = 58;
  const PY1 = PH - 66;
  const PYM = (PY0 + PY1) / 2;
  /** Warped time axis: stretches the end of the chirp so the last cycles stay readable. */
  const xOfT = (tt: number) => {
    const u = Math.min(1, Math.max(0, (plan.tStop - tt) / plan.tStop));
    return PX0 + (1 - Math.pow(u, 0.75)) * (PX1 - PX0);
  };
  const tOfX = (x: number) => plan.tStop - plan.tStop * Math.pow(1 - (x - PX0) / (PX1 - PX0), 4 / 3);
  const yOfH = (h: number) => PYM - (h / yScale) * (PY1 - PY0) * 0.5;

  function niceScale(h: number): number {
    const e = Math.floor(Math.log10(h));
    const m = h / Math.pow(10, e);
    const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return n * Math.pow(10, e);
  }

  function drawPlotBackground(): void {
    const c = bctx;
    c.clearRect(0, 0, PW, PH);
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('Chirp h₊(t), face on', 16, 32);
    c.font = '18px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText(`±${sci(yScale, 1)}`, PW - 170, 32);
    // sketch region past ISCO
    const xi = xOfT(plan.tIsco);
    c.fillStyle = 'rgba(167,139,250,0.10)';
    c.fillRect(xi, PY0 - 6, PX1 - xi, PY1 - PY0 + 12);
    c.strokeStyle = 'rgba(167,139,250,0.55)';
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(xi, PY0 - 6);
    c.lineTo(xi, PY1 + 6);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#a78bfa';
    c.fillText('ISCO', xi - 52, PY0 + 12);
    c.fillText('sketch', xi + 6, PY1 + 32);
    // axis
    c.strokeStyle = '#243049';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(PX0, PYM);
    c.lineTo(PX1, PYM);
    c.stroke();
    // time ticks, in seconds before the merger point
    c.fillStyle = '#56627c';
    c.font = '16px JetBrains Mono, monospace';
    const span = plan.tEnd;
    const step = niceScale(span / 4);
    for (let s = step; s < span * 0.98; s += step) {
      const x = xOfT(plan.tEnd - s);
      if (x - PX0 < 30 || xi - x < 40) continue;
      c.fillRect(x - 1, PY1 + 6, 2, 8);
      c.fillText(`−${s < 0.1 ? s.toFixed(2) : s.toFixed(1)} s`, x - 30, PY1 + 32);
    }
    c.fillText('time to merger, axis stretched near the end', PX0, PH - 10);
    // waveform
    c.save();
    c.beginPath();
    c.rect(PX0, PY0 - 8, PX1 - PX0, PY1 - PY0 + 16);
    c.clip();
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 2;
    c.beginPath();
    for (let x = PX0; x <= PX1; x += 0.5) {
      sampleWave(plan, tOfX(x), wr);
      const y = yOfH(wr.h * Math.cos(wr.phase));
      if (x === PX0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.restore();
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    const x = xOfT(Math.min(t, plan.tStop));
    pctx.strokeStyle = 'rgba(245,182,66,0.7)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x, PY0 - 8);
    pctx.lineTo(x, PY1 + 8);
    pctx.stroke();
    pctx.fillStyle = css(PALETTE.amber);
    pctx.beginPath();
    pctx.arc(x, yOfH(t <= plan.tStop ? ws.h * Math.cos(ws.phase) : 0), 7, 0, TWO_PI);
    pctx.fill();
  }

  // ===== Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${css(c)}"></i>`;
  legend.innerHTML = [
    `${sw(PALETTE.cyan)}${sw(PALETTE.violet)}grid height: h₊ up / down`,
    `${sw(PALETTE.amber)}${sw(PALETTE.rose)}black holes`,
    `${sw(PALETTE.green)}free test particles`,
    `${sw(PALETTE.red)}laser light`,
    '<span style="color:#8391ab">motion exaggerated, time slowed</span>',
  ].join('<br>');
  viewport.appendChild(legend);

  // ===== Simulation
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const pt: [number, number] = [0, 0];
  let hp = 0;
  let hx = 0;
  let H = 0;
  let areaChange = 0;

  function retime(): void {
    rate = (timeScale * DISPLAY_F0) / plan.fStart;
    waveSpeed = LAMBDA0 * plan.fStart;
  }

  function rescalePlot(): void {
    yScale = niceScale(plan.hEnd * 1.1);
  }

  function restart(byUser: boolean): void {
    t = 0;
    userRun = byUser;
    runCounted = false;
    trail1.clear();
    trail2.clear();
    retime();
    drawPlotBackground();
    render();
  }

  function newPlan(): void {
    plan = planChirp(m1, m2, dMpc);
    setHoleSize(hole1, m1);
    setHoleSize(hole2, m2);
    setHoleSize(holeF, plan.ring.mf);
  }

  function render(): void {
    sampleWave(plan, Math.min(t, plan.tStop + 1), ws);
    // Detector-side polarization split.
    H = Math.min(H_CLAMP, ws.h * Math.pow(10, exag));
    const c = Math.cos(ws.phase);
    const s = Math.sin(ws.phase);
    if (pol === 'plus') { hp = H * c; hx = 0; }
    else if (pol === 'cross') { hp = 0; hx = H * c; }
    else { hp = H * c; hx = H * s; }

    // Ring of particles
    for (let i = 0; i < RING_N; i++) {
      const a = (i / RING_N) * TWO_PI;
      deform(RING_R * Math.cos(a), RING_R * Math.sin(a), hp, hx, pt);
      m4.compose(tp.set(pt[0], pt[1], 0.02), q.identity(), sc.set(1, 1, 1));
      beads.setMatrixAt(i, m4);
    }
    beads.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < LOOP_N; i++) {
      const a = (i / LOOP_N) * TWO_PI;
      deform(RING_R * Math.cos(a), RING_R * Math.sin(a), hp, hx, pt);
      loopPos[3 * i] = pt[0];
      loopPos[3 * i + 1] = pt[1];
      loopXY[2 * i] = pt[0];
      loopXY[2 * i + 1] = pt[1];
    }
    (loopGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    areaChange = polygonArea(loopXY) / (Math.PI * RING_R * RING_R * (LOOP_N / (2 * Math.PI)) * Math.sin((2 * Math.PI) / LOOP_N)) - 1;

    // Interferometer: arms along the + axes feel only h₊.
    const lx = ARM * (1 + 0.5 * hp);
    const ly = ARM * (1 - 0.5 * hp);
    mirrorX.position.set(CX + lx, CY, 0);
    mirrorY.position.set(CX, CY + ly, 0);
    setSeg(0, CX - 0.45, CY, CX, CY);
    setSeg(1, CX, CY, CX + lx - 0.04, CY);
    setSeg(2, CX, CY, CX, CY + ly - 0.04);
    setSeg(3, CX, CY, CX, CY - 0.5);
    (beamGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (outGlow.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.abs(hp) * 4);
    ifoNote.visible = pol === 'cross' && H > 0.01;

    // Binary
    const merged = t >= plan.tEnd;
    hole1.g.visible = !merged;
    hole2.g.visible = !merged;
    holeF.g.visible = merged;
    if (!merged) {
      const a = 1.05 * Math.pow(ws.f / plan.fStart, -2 / 3);
      const orb = ws.phase / 2;
      const r1 = (a * m2) / (m1 + m2);
      const r2 = (a * m1) / (m1 + m2);
      hole1.g.position.set(r1 * Math.cos(orb), Y_BIN, -r1 * Math.sin(orb));
      hole2.g.position.set(-r2 * Math.cos(orb), Y_BIN, r2 * Math.sin(orb));
    } else {
      holeF.g.position.set(0, Y_BIN, 0);
      const wob = ws.stage === 2 ? 0.12 * (ws.h / plan.hEnd) * Math.cos(ws.phase) : 0;
      const s0 = sizeOf(plan.ring.mf);
      holeF.core.scale.set(s0 * (1 + wob), s0, s0 * (1 - wob));
    }
    statusLabel.visible = ws.stage > 0;
    statusLabel.element.textContent = ws.stage === 1 ? 'plunge (sketch)' : ws.stage === 2 ? 'ringdown (sketch)' : 'one black hole';

    updateGrid();
    drawPlot();
  }

  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      t += dt * rate;
      if (t < plan.tEnd) {
        trail1.push(hole1.g.position.x, Y_BIN - 0.05, hole1.g.position.z);
        trail2.push(hole2.g.position.x, Y_BIN - 0.05, hole2.g.position.z);
      }
      if (t >= plan.tStop && !runCounted) {
        runCounted = true;
        merges++;
        if (userRun) userMerges++;
      }
      // After the last ripple has left the grid, start the demo again.
      if (t > plan.tStop + R_MAX / waveSpeed + 1.5 * rate) restart(false);
      render();
    }
    readoutTimer += dt;
    if (readoutTimer > 0.1) {
      readoutTimer = 0;
      updateReadouts();
    }
  });

  // ===== Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => restart(true) },
    {
      label: 'Merge (GW150914)', key: 'merge', onClick: () => {
        m1 = GW150914.m1;
        m2 = GW150914.m2;
        m1Ctl.set(m1, false);
        m2Ctl.set(m2, false);
        massTouched = false;
        newPlan();
        rescalePlot();
        playing = true;
        playBtn.textContent = 'Pause';
        restart(true);
      },
    },
  ]);
  ui.slider({ key: 'timescale', label: 'Time scale', min: 0.25, max: 4, step: 0.05, value: timeScale, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { timeScale = v; retime(); } });

  ui.section('Binary');
  const onMass = () => {
    massTouched = true;
    newPlan();
    rescalePlot();
    restart(true);
  };
  const m1Ctl = ui.slider({ key: 'm1', label: 'Mass m₁', min: 2, max: 80, step: 0.5, value: m1, unit: 'M☉', format: (v) => v.toFixed(1), onInput: (v) => { m1 = v; onMass(); } });
  const m2Ctl = ui.slider({ key: 'm2', label: 'Mass m₂', min: 2, max: 80, step: 0.5, value: m2, unit: 'M☉', format: (v) => v.toFixed(1), onInput: (v) => { m2 = v; onMass(); } });
  ui.slider({
    key: 'D', label: 'Distance D', min: 40, max: 2000, step: 10, value: dMpc, unit: 'Mpc', format: (v) => v.toFixed(0),
    onInput: (v) => {
      dMpc = v;
      dTouched = true;
      dMin = Math.min(dMin, v);
      dMax = Math.max(dMax, v);
      newPlan();
      if (plan.hEnd * 1.1 > yScale) rescalePlot();
      drawPlotBackground();
      if (!playing) render();
    },
  });
  ui.note('The replay shows the last 20 wave cycles before the innermost stable orbit, then a sketch of the merger and ringdown. Changing a mass restarts it.');

  ui.section('Wave and detector');
  ui.select<Pol>({
    key: 'pol', label: 'Polarization at the detector', value: pol,
    options: [{ value: 'plus', label: '+' }, { value: 'cross', label: '×' }, { value: 'circ', label: 'Circular' }],
    onChange: (v) => { pol = v; if (!playing) render(); },
  });
  ui.slider({ key: 'exag', label: 'Exaggeration', min: 19, max: 22, step: 0.1, value: exag, format: (v) => `×10^${v.toFixed(1)}`, onInput: (v) => { exag = v; paintLabels(); if (!playing) render(); } });

  ui.section('Live readouts');
  const rMc = ui.readout('mc', 'chirp mass 𝓜c');
  const rF = ui.readout('f', 'wave frequency f', 'Hz');
  const rH = ui.readout('strain', 'strain h');
  const rTau = ui.readout('tau', 'time to merger');
  const rDL = ui.readout('dl', 'ΔL on 4 km arms', 'm');
  const rSep = ui.readout('sep', 'separation', 'km');
  const rSlow = ui.readout('slow', 'slow motion');
  const rArea = ui.readout('area', 'ring area change');
  const rStage = ui.readout('stage', 'phase');
  ui.legend([
    { color: css(PALETTE.amber), label: 'm₁' },
    { color: css(PALETTE.rose), label: 'm₂' },
    { color: css(PALETTE.green), label: 'free particles' },
    { color: css(PALETTE.violet), label: 'sketch past ISCO' },
  ]);

  const STAGES = ['inspiral', 'plunge (sketch)', 'ringdown (sketch)', 'merged'];

  function updateReadouts(): void {
    rMc(`${plan.mc.toFixed(2)} M☉`);
    rF(ws.f.toFixed(1));
    rH(sci(ws.h));
    const tau = plan.tEnd - t;
    rTau(tau > 0 ? `${tau < 0.1 ? (tau * 1000).toFixed(1) + ' ms' : tau.toFixed(3) + ' s'}` : '–');
    rDL(sci(ws.h * LIGO_ARM));
    rSep(ws.stage === 0 ? (separation(plan.mTot, ws.f) / 1000).toFixed(0) : '–');
    rSlow(`1/${(1 / rate).toFixed(0)}`);
    rArea(`${(areaChange * 100).toFixed(2)}% (−h²/4: ${(-(H * H) / 4 * 100).toFixed(2)}%)`);
    rStage(STAGES[ws.stage]);
  }

  newPlan();
  rescalePlot();
  paintLabels();
  restart(false);
  updateReadouts();

  return {
    state: () => ({
      t,
      tau: plan.tEnd - t,
      f: ws.f,
      strain: ws.h,
      mc: plan.mc,
      m1,
      m2,
      D: dMpc,
      dMin,
      dMax,
      dTouched,
      massTouched,
      pol,
      ringH: H,
      exag,
      timeScale,
      stage: STAGES[ws.stage],
      merges,
      userMerges,
    }),
    dispose: () => {
      plot.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'gravitational-waves',
  number: 11,
  title: 'Gravitational Waves',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'Ripples that stretch and squeeze space itself.',
  content,
  mount,
};

export default topic;
