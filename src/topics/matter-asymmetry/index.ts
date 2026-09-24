import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { content } from './content.ts';
import {
  DELTA_L_MEASURED, TAU_S, brLpipiModel, decayTable, deltaL, kaonProbs, kaonRates, makeKaon, sampleDecay,
  toyHistory, visibleCount, yEq, type DecayTable, type Kaon, type KaonProbs, type KaonRates, type ToyHistory,
} from './physics.ts';

type View = 'box' | 'kaon';

// --- Toy box constants
const N_SPARK = 800;
const X0 = 0.1;
const X1 = 1000;
const STEPS = 3000;
const RUN_S = 14; // seconds of animation for the whole cooling history
const LAMBDA0 = 1e13; // annihilation strength at expansion rate 1
const BIAS_ZERO = -13; // slider value that means exactly zero bias
const MAX_FLASH = 420;
const CAM_BOX: [number, number, number] = [4.4, 2.6, 7.6];
const CAM_KAON: [number, number, number] = [0.3, 2.4, 12.2];

// --- Kaon constants
const PIPE_X0 = -6;
const PIPE_X1 = 6;
const LT0 = Math.log10(0.004); // ns at the source end of the pipe
const LT1 = Math.log10(300); // ns at the far end
const BEAM_DOTS = 70;
const KAONS_PER_S = 320;
const MAX_EV = 260;
const EV_LIFE = 0.6;
const LATE_T = 3; // ns. After this the K_S part of the pi pi rate is below e^-33 of its start.
const CURVE_N = 240;
const CURVE_Y = 0.7;
const CURVE_H = 2.1;

const xOfT = (t: number) => PIPE_X0 + ((Math.log10(Math.max(t, 1e-6)) - LT0) / (LT1 - LT0)) * (PIPE_X1 - PIPE_X0);
const tOfX = (x: number) => Math.pow(10, LT0 + ((x - PIPE_X0) / (PIPE_X1 - PIPE_X0)) * (LT1 - LT0));

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const fmtPerBillion = (v: number): string => {
  if (v >= 1e6) return `${(v / 1e9).toPrecision(2)} of all`;
  if (v >= 100) return `${v.toFixed(0)} per 10⁹`;
  if (v >= 0.01) return `${v.toPrecision(2)} per 10⁹`;
  if (v <= 0) return '0';
  return `${v.toExponential(0)} per 10⁹`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_BOX, target: [0, 0, 0], fov: 45 });
  const { scene } = stage;
  const tex = glowTexture();

  // ---------------------------------------------------------------- state
  let view: View = 'box';
  let biasLog = -6;
  let rateLog = 0;
  let cp = true;
  let touched = false;
  let hist: ToyHistory = toyHistory({ bias: 1e-6, lambda: LAMBDA0, x0: X0, x1: X1, steps: STEPS });
  let runT = 0;
  let xNow = X0;
  let yNow = 1;
  let ybNow = 1;
  let cntP = N_SPARK;
  let cntA = N_SPARK;

  const bias = () => (biasLog <= BIAS_ZERO ? 0 : Math.pow(10, biasLog));

  // ---------------------------------------------------------------- box view
  const boxGroup = new THREE.Group();
  scene.add(boxGroup);
  const boxLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
    new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.8 }),
  );
  boxGroup.add(boxLines);
  const boxFill = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.BackSide }),
  );
  boxGroup.add(boxFill);

  const makeSparks = (color: number, size: number, blending: THREE.Blending) => {
    const pos = new Float32Array(N_SPARK * 3);
    const vel = new Float32Array(N_SPARK * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size, map: tex, transparent: true, depthWrite: false, blending, sizeAttenuation: true });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    boxGroup.add(pts);
    return { pos, vel, g, pts };
  };
  const mat = makeSparks(0xffffff, 0.16, THREE.AdditiveBlending);
  const anti = makeSparks(0x8a4dff, 0.15, THREE.AdditiveBlending);

  function scatter(s: { pos: Float32Array; vel: Float32Array }): void {
    for (let i = 0; i < N_SPARK * 3; i++) {
      s.pos[i] = Math.random() * 2 - 1;
      s.vel[i] = (Math.random() * 2 - 1);
    }
  }

  // Annihilation flashes
  const fPos = new Float32Array(MAX_FLASH * 3);
  const fCol = new Float32Array(MAX_FLASH * 3);
  const fAge = new Float32Array(MAX_FLASH).fill(99);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  const flashes = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 0.32, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flashes.frustumCulled = false;
  boxGroup.add(flashes);
  let fHead = 0;
  const spawnFlash = (x: number, y: number, z: number) => {
    const i = fHead;
    fHead = (fHead + 1) % MAX_FLASH;
    fPos[i * 3] = x; fPos[i * 3 + 1] = y; fPos[i * 3 + 2] = z;
    fAge[i] = 0;
  };

  const youLabel = stage.label('', [0, 0, 0], 'big');
  youLabel.element.style.color = '#ffffff';
  const boxTitle = stage.label('', [0, 0, 0], 'muted');
  const boxLabels: CSS2DObject[] = [youLabel, boxTitle];

  // ---------------------------------------------------------------- kaon view
  const kGroup = new THREE.Group();
  scene.add(kGroup);
  const pipeLen = PIPE_X1 - PIPE_X0;
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, pipeLen, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x3a4a6c, transparent: true, opacity: 0.22, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pipe.rotation.z = Math.PI / 2;
  kGroup.add(pipe);
  const src = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0x55607a, metalness: 0.6, roughness: 0.35 }));
  src.rotation.z = Math.PI / 2;
  src.position.x = PIPE_X0 - 0.15;
  kGroup.add(src);

  const kLabels: CSS2DObject[] = [];
  const tickPts: number[] = [];
  for (const [t, txt] of [[0.01, '0.01 ns'], [0.1, '0.1 ns'], [1, '1 ns'], [10, '10 ns'], [100, '100 ns']] as [number, string][]) {
    const x = xOfT(t);
    tickPts.push(x, -0.42, 0, x, -0.62, 0);
    kLabels.push(stage.label(txt, [x, -0.85, 0], 'muted', kGroup));
  }
  const ticks = new THREE.BufferGeometry();
  ticks.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
  kGroup.add(new THREE.LineSegments(ticks, new THREE.LineBasicMaterial({ color: 0x56627c })));
  kLabels.push(stage.label('K⁰ beam', [PIPE_X0 - 0.3, 0.75, 0], 'big', kGroup));
  kLabels.push(stage.label('proper time (log scale) →', [0, -1.3, 0], 'muted', kGroup));

  // Probability curves above the pipe (static per CP setting)
  const makeCurve = (color: number, dashed = false) => {
    const arr = new Float32Array(CURVE_N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.8 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const l = new THREE.Line(g, m);
    l.frustumCulled = false;
    kGroup.add(l);
    return { arr, g, l };
  };
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    PIPE_X0, CURVE_Y, 0, PIPE_X1, CURVE_Y, 0,
    PIPE_X0, CURVE_Y + CURVE_H, 0, PIPE_X1, CURVE_Y + CURVE_H, 0,
    PIPE_X0, CURVE_Y + CURVE_H / 2, 0, PIPE_X1, CURVE_Y + CURVE_H / 2, 0,
  ], 3));
  kGroup.add(new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0x243049 })));
  kLabels.push(stage.label('1', [PIPE_X1 + 0.25, CURVE_Y + CURVE_H, 0], 'muted', kGroup));
  kLabels.push(stage.label('½', [PIPE_X1 + 0.25, CURVE_Y + CURVE_H / 2, 0], 'muted', kGroup));
  const cNorm = makeCurve(0xdfe6f3);
  const cK0 = makeCurve(PALETTE.cyan);
  const cKb = makeCurve(PALETTE.rose);
  const labNorm = stage.label('still undecayed', [0, 0, 0], '', kGroup);
  const labK0 = stage.label('P(K⁰)', [0, 0, 0], '', kGroup);
  const labKb = stage.label('P(K̄⁰)', [0, 0, 0], '', kGroup);
  labK0.element.style.color = css(PALETTE.cyan);
  labKb.element.style.color = css(PALETTE.rose);
  kLabels.push(labNorm, labK0, labKb);
  const labKS = stage.label('K_S part decays away', [xOfT(0.25), CURVE_Y + CURVE_H + 0.35, 0], 'muted', kGroup);
  const labKL = stage.label('K_L part lives on', [xOfT(40), CURVE_Y + CURVE_H * 0.5 + 0.35, 0], 'muted', kGroup);
  kLabels.push(labKS, labKL);

  // Beam dots
  const bPos = new Float32Array(BEAM_DOTS * 3);
  const bCol = new Float32Array(BEAM_DOTS * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const beam = new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 0.42, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.frustumCulled = false;
  kGroup.add(beam);
  const bPhase = new Float32Array(BEAM_DOTS);
  for (let i = 0; i < BEAM_DOTS; i++) {
    bPhase[i] = i / BEAM_DOTS;
    bPos[i * 3 + 1] = (Math.random() - 0.5) * 0.25;
    bPos[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }

  // Decay tracks: up to 3 segments per event
  const ePos = new Float32Array(MAX_EV * 6 * 3);
  const eCol = new Float32Array(MAX_EV * 6 * 3);
  const eBase = new Float32Array(MAX_EV * 3);
  const eAge = new Float32Array(MAX_EV).fill(99);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const tracks = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracks.frustumCulled = false;
  kGroup.add(tracks);
  let eHead = 0;

  // Special flash for late K_L -> pi pi
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: PALETTE.amber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  star.scale.setScalar(1.6);
  star.visible = false;
  kGroup.add(star);
  let starAge = 99;
  const starLab = stage.label('K_L → ππ  (CP violation)', [0, 0, 0], 'big', kGroup);
  starLab.element.style.color = css(PALETTE.amber);
  starLab.visible = false;

  const COL_PIPI = new THREE.Color(PALETTE.amber);
  const COL_LP = new THREE.Color(PALETTE.green);
  const COL_LM = new THREE.Color(PALETTE.red);
  const COL_OTHER = new THREE.Color(0x4a5570);
  const colK0 = new THREE.Color(PALETTE.cyan);
  const colKb = new THREE.Color(PALETTE.rose);
  const tc = new THREE.Color();

  let kaon: Kaon = makeKaon(true);
  let table: DecayTable = decayTable(kaon, 1e-4, 300, 4000);
  const pr: KaonProbs = { pK0: 0, pK0bar: 0, norm: 0 };
  const rr: KaonRates = { pipi: 0, pipiS: 0, pipiL: 0, lplus: 0, lminus: 0, other: 0, total: 0 };
  let kaonsFired = 0;
  let latePipi = 0;
  let latePipiSinceToggle = 0;
  let kaonsSinceToggle = 0;
  let lplusLate = 0;
  let lminusLate = 0;
  let beamAcc = 0;

  function buildCurves(): void {
    for (let i = 0; i < CURVE_N; i++) {
      const x = PIPE_X0 + (i / (CURVE_N - 1)) * pipeLen;
      kaonProbs(kaon, tOfX(x), pr);
      cNorm.arr[i * 3] = x; cNorm.arr[i * 3 + 1] = CURVE_Y + CURVE_H * pr.norm;
      cK0.arr[i * 3] = x; cK0.arr[i * 3 + 1] = CURVE_Y + CURVE_H * pr.pK0 + 0.012;
      cKb.arr[i * 3] = x; cKb.arr[i * 3 + 1] = CURVE_Y + CURVE_H * pr.pK0bar - 0.012;
    }
    for (const c of [cNorm, cK0, cKb]) c.g.attributes.position.needsUpdate = true;
    labNorm.position.set(xOfT(150), CURVE_Y + CURVE_H * 0.5 * Math.exp(-150 / 51.16) + 0.5, 0);
    labK0.position.set(xOfT(0.012), CURVE_Y + CURVE_H + 0.2, 0);
    labKb.position.set(xOfT(0.9), CURVE_Y + 0.35, 0);
  }

  function spawnDecay(t: number): void {
    kaonRates(kaon, t, rr, pr);
    let u = Math.random() * rr.total;
    let col = COL_OTHER;
    let nTr = 3;
    let kind = 0;
    if ((u -= rr.pipi) < 0) { col = COL_PIPI; nTr = 2; kind = 1; }
    else if ((u -= rr.lplus) < 0) { col = COL_LP; nTr = 2; kind = 2; }
    else if ((u -= rr.lminus) < 0) { col = COL_LM; nTr = 2; kind = 3; }
    const late = t > LATE_T;
    if (late && kind === 1) {
      latePipi++;
      latePipiSinceToggle++;
    }
    if (late && kind === 2) lplusLate++;
    if (late && kind === 3) lminusLate++;
    const i = eHead;
    eHead = (eHead + 1) % MAX_EV;
    const x = xOfT(t);
    const y = (Math.random() - 0.5) * 0.3;
    const z = (Math.random() - 0.5) * 0.3;
    eAge[i] = 0;
    const big = kind === 1 && late ? 3 : 1;
    const dim = kind === 1 && late ? 1.4 : 0.55;
    eBase[i * 3] = col.r * dim; eBase[i * 3 + 1] = col.g * dim; eBase[i * 3 + 2] = col.b * dim;
    for (let s = 0; s < 3; s++) {
      const o = (i * 6 + s * 2) * 3;
      if (s >= nTr) {
        ePos[o] = ePos[o + 3] = x; ePos[o + 1] = ePos[o + 4] = y; ePos[o + 2] = ePos[o + 5] = z;
        continue;
      }
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const len = (0.2 + Math.random() * 0.3) * big;
      ePos[o] = x; ePos[o + 1] = y; ePos[o + 2] = z;
      ePos[o + 3] = x + len * (0.6 + 0.4 * Math.abs(Math.cos(ph))); // forward boosted
      ePos[o + 4] = y + len * Math.sin(ph) * Math.cos(th);
      ePos[o + 5] = z + len * Math.sin(ph) * Math.sin(th);
    }
    if (kind === 1 && late) {
      star.position.set(x, y, z);
      starAge = 0;
      starLab.position.set(x, 1.0 + CURVE_Y * 0, 0);
    }
  }

  function resetKaonCounts(): void {
    latePipiSinceToggle = 0;
    kaonsSinceToggle = 0;
    lplusLate = 0;
    lminusLate = 0;
  }

  // ---------------------------------------------------------------- overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: string) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px"></i>`;
  const LEG_BOX = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Early universe (toy model)</div>
<div>${sw('#ffffff')}matter</div><div>${sw('#8a4dff')}antimatter</div><div>${sw('#fff2c7')}annihilation flash</div>
<div style="margin-top:4px">The box grows and cools. Pairs meet and vanish. Only the excess can survive.</div>
<div style="margin-top:4px;color:#8391ab">Spark counts are log-compressed. One survivor in a billion still shows a few sparks. Trust the readouts for numbers.</div>`;
  const LEG_KAON = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Neutral kaon beam</div>
<div>${sw(css(PALETTE.cyan))}K⁰ (d s̄)   ${sw(css(PALETTE.rose))}K̄⁰ (s d̄)</div>
<div style="margin-top:3px">Decay tracks:</div>
<div>${sw(css(PALETTE.amber))}ππ   ${sw(css(PALETTE.green))}π⁻ℓ⁺ν   ${sw(css(PALETTE.red))}π⁺ℓ⁻ν̄   ${sw('#4a5570')}3π</div>
<div style="margin-top:4px">A big amber burst far down the pipe is a K_L decaying to ππ. That decay breaks CP symmetry.</div>`;

  const insetStyle = {
    position: 'absolute', right: '10px', width: '260px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const inset = document.createElement('canvas');
  inset.width = 520;
  inset.height = 300;
  Object.assign(inset.style, { ...insetStyle, top: '10px' } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const bg = document.createElement('canvas');
  bg.width = 520;
  bg.height = 300;
  const bctx = bg.getContext('2d')!;
  const IX0 = 62, IX1 = 504, IY0 = 50, IY1 = 262;

  function axesFrame(g: CanvasRenderingContext2D, title: string): void {
    g.clearRect(0, 0, 520, 300);
    g.font = '22px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText(title, 14, 30);
    g.strokeStyle = '#243049';
    g.lineWidth = 1;
    g.strokeRect(IX0, IY0, IX1 - IX0, IY1 - IY0);
  }

  // Box inset: log Y vs log x
  const BX_L0 = Math.log10(X0), BX_L1 = Math.log10(X1), BY_L0 = -13, BY_L1 = 0.3;
  const bxOf = (x: number) => IX0 + ((Math.log10(x) - BX_L0) / (BX_L1 - BX_L0)) * (IX1 - IX0);
  const byOf = (y: number) => IY1 - ((Math.max(BY_L0, Math.log10(Math.max(y, 1e-30))) - BY_L0) / (BY_L1 - BY_L0)) * (IY1 - IY0);

  function drawBoxBg(): void {
    axesFrame(bctx, 'yield vs cooling  (log–log)');
    bctx.font = '18px JetBrains Mono, monospace';
    for (const e of [0, -3, -6, -9, -12]) {
      const y = byOf(Math.pow(10, e));
      bctx.strokeStyle = e === -9 ? '#3b4a6b' : '#1a2336';
      bctx.beginPath(); bctx.moveTo(IX0, y); bctx.lineTo(IX1, y); bctx.stroke();
      bctx.fillStyle = '#56627c';
      bctx.fillText(`1e${e}`, 4, y + 6);
    }
    bctx.fillStyle = '#56627c';
    bctx.fillText('hot  T ≫ m', IX0 + 4, IY1 + 26);
    bctx.fillText('cold  T ≪ m', IX1 - 118, IY1 + 26);
    // equilibrium curve
    bctx.setLineDash([6, 6]);
    bctx.strokeStyle = '#56627c';
    bctx.lineWidth = 2;
    bctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = Math.pow(10, BX_L0 + (i / 200) * (BX_L1 - BX_L0));
      const px = bxOf(x), py = byOf(yEq(x));
      if (i === 0) bctx.moveTo(px, py); else bctx.lineTo(px, py);
    }
    bctx.stroke();
    bctx.setLineDash([]);
    const n = hist.x.length;
    const line = (arr: Float64Array, color: string, w: number) => {
      bctx.strokeStyle = color;
      bctx.lineWidth = w;
      bctx.beginPath();
      for (let i = 0; i < n; i += 5) {
        const px = bxOf(hist.x[i]), py = byOf(arr[i]);
        if (i === 0) bctx.moveTo(px, py); else bctx.lineTo(px, py);
      }
      bctx.stroke();
    };
    line(hist.Yb, '#8a4dff', 4);
    line(hist.Y, '#ffffff', 2.5);
  }

  function drawBoxInset(): void {
    ictx.clearRect(0, 0, 520, 300);
    ictx.drawImage(bg, 0, 0);
    const px = bxOf(xNow);
    ictx.strokeStyle = 'rgba(245,182,66,0.7)';
    ictx.lineWidth = 2;
    ictx.beginPath(); ictx.moveTo(px, IY0); ictx.lineTo(px, IY1); ictx.stroke();
    ictx.fillStyle = '#ffffff';
    ictx.beginPath(); ictx.arc(px, byOf(yNow), 6, 0, Math.PI * 2); ictx.fill();
    ictx.fillStyle = '#8a4dff';
    ictx.beginPath(); ictx.arc(px, byOf(ybNow), 6, 0, Math.PI * 2); ictx.fill();
  }

  // Kaon inset: pi pi decay rate vs time (log y), the classic interference plot
  const KT1 = 25 * TAU_S;
  const kxOf = (t: number) => IX0 + (t / KT1) * (IX1 - IX0);
  const KY0 = -7.5, KY1 = 0.2;
  const kyOf = (r: number) => IY1 - ((Math.max(KY0, Math.log10(Math.max(r, 1e-30))) - KY0) / (KY1 - KY0)) * (IY1 - IY0);

  function drawKaonBg(): void {
    axesFrame(bctx, 'rate of K⁰ → ππ  vs time');
    bctx.font = '18px JetBrains Mono, monospace';
    for (const e of [0, -2, -4, -6]) {
      const y = kyOf(Math.pow(10, e));
      bctx.strokeStyle = '#1a2336';
      bctx.beginPath(); bctx.moveTo(IX0, y); bctx.lineTo(IX1, y); bctx.stroke();
      bctx.fillStyle = '#56627c';
      bctx.fillText(`1e${e}`, 6, y + 6);
    }
    for (const n of [0, 5, 10, 15, 20]) bctx.fillText(`${n}`, kxOf(n * TAU_S) - 6, IY1 + 24);
    bctx.fillText('τ_S', IX1 - 36, IY1 + 24);
    kaonRates(kaon, 0, rr, pr);
    const norm = rr.pipi;
    const curve = (pick: (r: KaonRates) => number, color: string, w: number, dash: number[]) => {
      bctx.strokeStyle = color;
      bctx.lineWidth = w;
      bctx.setLineDash(dash);
      bctx.beginPath();
      for (let i = 0; i <= 300; i++) {
        const t = (i / 300) * KT1;
        kaonRates(kaon, t, rr, pr);
        const px = kxOf(t), py = kyOf(pick(rr) / norm);
        if (i === 0) bctx.moveTo(px, py); else bctx.lineTo(px, py);
      }
      bctx.stroke();
      bctx.setLineDash([]);
    };
    curve((r) => r.pipiS, css(PALETTE.cyan), 2, [8, 6]);
    if (cp) curve((r) => r.pipiL, css(PALETTE.amber), 2, [8, 6]);
    curve((r) => r.pipi, '#ffffff', 3, []);
    bctx.font = '18px JetBrains Mono, monospace';
    bctx.fillStyle = css(PALETTE.cyan);
    bctx.fillText('K_S part', kxOf(6 * TAU_S), kyOf(2e-2));
    bctx.fillStyle = css(PALETTE.amber);
    if (cp) bctx.fillText('K_L part |ε|²', kxOf(15 * TAU_S), kyOf(5e-6) - 16);
    bctx.fillStyle = '#dfe6f3';
    bctx.fillText(cp ? 'white: total (dip, then flat tail)' : 'CP off: the tail is gone', IX0 + 8, IY1 - 12);
  }

  function drawInset(): void {
    if (view === 'box') drawBoxInset();
    else {
      ictx.clearRect(0, 0, 520, 300);
      ictx.drawImage(bg, 0, 0);
    }
  }
  function rebuildInsetBg(): void {
    if (view === 'box') drawBoxBg();
    else drawKaonBg();
    drawInset();
  }

  // ---------------------------------------------------------------- toy run
  function restartBox(): void {
    hist = toyHistory({ bias: bias(), lambda: LAMBDA0 / Math.pow(10, rateLog), x0: X0, x1: X1, steps: STEPS });
    runT = 0;
    cntP = N_SPARK;
    cntA = N_SPARK;
    scatter(mat);
    scatter(anti);
    mat.g.attributes.position.needsUpdate = true;
    anti.g.attributes.position.needsUpdate = true;
    fAge.fill(99);
    if (view === 'box') rebuildInsetBg();
    else drawBoxBg();
    sampleHist();
  }

  function sampleHist(): void {
    const prog = Math.min(1, runT / RUN_S);
    const f = prog * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(f));
    const w = f - i;
    xNow = hist.x[i] * Math.pow(hist.x[i + 1] / hist.x[i], w);
    const li = (a: Float64Array) => Math.exp(Math.log(Math.max(a[i], 1e-300)) * (1 - w) + Math.log(Math.max(a[i + 1], 1e-300)) * w);
    yNow = li(hist.Y);
    ybNow = li(hist.Yb);
  }

  type Sparks = typeof mat;
  function drift(s: Sparks, sp: number): void {
    const p = s.pos, v = s.vel;
    for (let k = 0; k < N_SPARK * 3; k++) {
      let q = p[k] + v[k] * sp;
      if (q > 1) { q = 2 - q; v[k] = -v[k]; } else if (q < -1) { q = -2 - q; v[k] = -v[k]; }
      p[k] = q;
    }
    s.g.attributes.position.needsUpdate = true;
  }
  function flashVanished(s: Sparks, from: number, to: number, L: number, budget: number): number {
    for (let i = to; i < from && budget > 0; i++, budget--) spawnFlash(s.pos[i * 3] * L, s.pos[i * 3 + 1] * L, s.pos[i * 3 + 2] * L);
    return budget;
  }

  const boxHalf = () => 1 * Math.pow(xNow / X0, 0.05);

  function stepBox(dt: number): void {
    runT += dt;
    sampleHist();
    const L = boxHalf();
    boxGroup.scale.setScalar(1);
    boxLines.scale.setScalar(L);
    boxFill.scale.setScalar(L);
    mat.pts.scale.setScalar(L);
    anti.pts.scale.setScalar(L);
    // Temperature colour: hot orange to cold blue
    const heat = Math.max(0, Math.min(1, 1 - Math.log10(xNow / X0) / 4.5));
    (boxLines.material as THREE.LineBasicMaterial).color.setRGB(0.3 + 0.7 * heat, 0.4 + 0.3 * heat, 0.75 - 0.4 * heat);
    (boxFill.material as THREE.MeshBasicMaterial).opacity = 0.02 + 0.08 * heat;

    // Thermal motion in comoving coordinates; slower as it cools
    const sp = (0.15 + 0.9 / Math.sqrt(1 + xNow)) * dt / L;
    drift(mat, sp);
    drift(anti, sp);

    // Visible counts from the yields, flashes where sparks vanish
    const y0 = hist.Y[0];
    const nP = visibleCount(yNow / y0, N_SPARK);
    const nA = visibleCount(ybNow / hist.Yb[0], N_SPARK);
    const left = flashVanished(mat, cntP, nP, L, 36);
    flashVanished(anti, cntA, nA, L, left);
    cntP = Math.min(cntP, nP);
    cntA = Math.min(cntA, nA);
    mat.g.setDrawRange(0, cntP);
    (mat.pts.material as THREE.PointsMaterial).size = 0.16 + 0.3 * (1 - cntP / N_SPARK) ** 4;
    anti.g.setDrawRange(0, cntA);

    for (let i = 0; i < MAX_FLASH; i++) {
      if (fAge[i] > 1) { fCol[i * 3] = fCol[i * 3 + 1] = fCol[i * 3 + 2] = 0; continue; }
      fAge[i] += dt;
      const a = Math.max(0, 1 - fAge[i] / 0.6);
      fCol[i * 3] = a; fCol[i * 3 + 1] = 0.92 * a; fCol[i * 3 + 2] = 0.72 * a;
    }
    fGeo.attributes.color.needsUpdate = true;
    fGeo.attributes.position.needsUpdate = true;

    const done = runT >= RUN_S;
    youLabel.position.set(0, -L - 0.85, 0);
    if (done && cntP > 0 && cntA === 0) youLabel.element.textContent = 'The survivors: every atom in you';
    else if (done && cntP === 0) youLabel.element.textContent = 'Nothing left but light';
    else if (done) youLabel.element.textContent = 'Both kinds froze out: expansion won';
    else youLabel.element.textContent = '';
    boxTitle.position.set(0, -L - 0.4, 0);
    boxTitle.element.textContent = `T ≈ ${(1 / xNow).toPrecision(2)} m   box size × ${(L).toFixed(2)}`;
  }

  // ---------------------------------------------------------------- kaon step
  let beamPhase = 0;
  function stepKaon(dt: number): void {
    beamPhase = (beamPhase + dt * 0.09) % 1;
    for (let i = 0; i < BEAM_DOTS; i++) {
      const u = (bPhase[i] + beamPhase) % 1;
      const x = PIPE_X0 + u * pipeLen;
      kaonProbs(kaon, tOfX(x), pr);
      const f = pr.pK0bar / Math.max(1e-12, pr.norm);
      tc.copy(colK0).lerp(colKb, f).multiplyScalar(0.25 + 0.75 * pr.norm);
      bPos[i * 3] = x;
      bCol[i * 3] = tc.r; bCol[i * 3 + 1] = tc.g; bCol[i * 3 + 2] = tc.b;
    }
    bGeo.attributes.position.needsUpdate = true;
    bGeo.attributes.color.needsUpdate = true;

    beamAcc += dt * KAONS_PER_S;
    while (beamAcc >= 1) {
      beamAcc -= 1;
      kaonsFired++;
      kaonsSinceToggle++;
      const t = sampleDecay(table, Math.random());
      if (t >= 0) spawnDecay(t);
    }
    for (let i = 0; i < MAX_EV; i++) {
      const o = i * 18;
      if (eAge[i] > EV_LIFE) {
        if (eAge[i] < 50) { eCol.fill(0, o, o + 18); eAge[i] = 99; }
        continue;
      }
      eAge[i] += dt;
      const a = Math.max(0, 1 - eAge[i] / EV_LIFE);
      for (let v = 0; v < 6; v++) {
        const w = v % 2 === 0 ? a : a * 0.35;
        eCol[o + v * 3] = eBase[i * 3] * w;
        eCol[o + v * 3 + 1] = eBase[i * 3 + 1] * w;
        eCol[o + v * 3 + 2] = eBase[i * 3 + 2] * w;
      }
    }
    eGeo.attributes.position.needsUpdate = true;
    eGeo.attributes.color.needsUpdate = true;

    starAge += dt;
    star.visible = starAge < 1.6;
    starLab.visible = view === 'kaon' && starAge < 2.2;
    if (star.visible) {
      const a = 1 - starAge / 1.6;
      star.material.opacity = a;
      star.scale.setScalar(0.8 + 1.4 * (1 - a));
    }
  }

  // ---------------------------------------------------------------- view switching
  function applyView(): void {
    boxGroup.visible = view === 'box';
    kGroup.visible = view === 'kaon';
    for (const l of boxLabels) l.visible = view === 'box';
    for (const l of kLabels) l.visible = view === 'kaon';
    starLab.visible = false;
    legend.innerHTML = view === 'box' ? LEG_BOX : LEG_KAON;
    if (view === 'box') stage.flyTo(CAM_BOX, [0, 0, 0]);
    else stage.flyTo(CAM_KAON, [0, 1.5, 0]);
    rebuildInsetBg();
    boxCtl.forEach((e) => (e.style.opacity = view === 'box' ? '1' : '0.5'));
    kaonCtl.forEach((e) => (e.style.opacity = view === 'kaon' ? '1' : '0.5'));
  }

  function setCP(v: boolean): void {
    cp = v;
    kaon = makeKaon(cp);
    table = decayTable(kaon, 1e-4, 300, 4000);
    resetKaonCounts();
    buildCurves();
    if (view === 'kaon') rebuildInsetBg();
  }

  // ---------------------------------------------------------------- panel
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'box', label: 'Early universe box' }, { value: 'kaon', label: 'Kaon oscillation' }],
    onChange: (v) => { view = v; touched = true; applyView(); },
  });
  ui.buttons([{ label: 'Replay the cooling', primary: true, key: 'replay', onClick: () => { touched = true; restartBox(); } }]);
  void viewCtl;

  ui.section('Early universe (toy model)');
  const bCtl = ui.slider({
    key: 'bias', label: 'Matter bias ε', min: BIAS_ZERO, max: -1, step: 0.1, value: biasLog,
    format: (v) => (v <= BIAS_ZERO ? '0 (symmetric)' : `10^${v.toFixed(1)}`),
    onInput: (v) => { biasLog = v; touched = true; restartBox(); },
  });
  const rCtl = ui.slider({
    key: 'rate', label: 'Expansion rate', min: -2, max: 6, step: 0.1, value: rateLog,
    format: (v) => `×10^${v.toFixed(1)}`,
    onInput: (v) => { rateLog = v; touched = true; restartBox(); },
  });
  const rT = ui.readout('T', 'temperature T/m');
  const rSurv = ui.readout('survivors', 'matter left');
  const rAnti = ui.readout('anti', 'antimatter left');
  const rEta = ui.readout('eta', 'excess per photon η');
  const boxCtl = [bCtl.el, rCtl.el];

  ui.section('Neutral kaons');
  const cpCtl = ui.toggle({ key: 'cp', label: 'CP violation (ε ≈ 2.2×10⁻³)', value: cp, onChange: (v) => { touched = true; setCP(v); } });
  const rPipi = ui.readout('klpipi', 'late K_L → ππ seen');
  const rFired = ui.readout('kaons', 'K⁰ fired');
  const rDL = ui.readout('deltaL', 'charge asym. δ_L');
  const rBR = ui.readout('brpipi', 'BR(K_L → ππ)');
  const rLep = ui.readout('leptons', 'late ℓ⁺ : ℓ⁻');
  const kaonCtl = [cpCtl.el];
  ui.note(`Measured: δ_L = (3.32 ± 0.06)×10⁻³ and BR(K_L → ππ) = 2.83×10⁻³. Counting late ℓ⁺ and ℓ⁻ by hand would need about a million decays to see δ_L.`);

  function updateReadouts(): void {
    const surv = (yNow / hist.Y[0]) * 1e9;
    const antiLeft = (ybNow / hist.Yb[0]) * 1e9;
    rT(xNow > 1e3 ? '≪ 1' : (1 / xNow).toPrecision(2));
    rSurv(fmtPerBillion(surv));
    rAnti(fmtPerBillion(antiLeft));
    rEta(bias() === 0 ? '0' : bias().toExponential(1));
    rPipi(latePipi);
    rFired(kaonsFired);
    const d = deltaL(kaon);
    rDL(d === 0 ? '0' : d.toExponential(2));
    rBR(brLpipiModel(kaon) === 0 ? '0' : brLpipiModel(kaon).toExponential(2));
    rLep(`${lplusLate} : ${lminusLate}`);
  }

  // ---------------------------------------------------------------- frame loop
  let insetTimer = 0;
  stage.onFrame((dt) => {
    if (view === 'box') stepBox(dt);
    else stepKaon(dt);
    insetTimer += dt;
    if (insetTimer > 0.1) {
      insetTimer = 0;
      if (view === 'box') drawInset();
      updateReadouts();
    }
  });

  buildCurves();
  restartBox();
  applyView();
  updateReadouts();

  return {
    state: () => {
      const surv = (yNow / hist.Y[0]) * 1e9;
      return {
        view,
        touched,
        biasLog,
        bias: bias(),
        zeroBias: bias() === 0,
        rateLog,
        runDone: runT >= RUN_S,
        survivorsPerBillion: surv,
        antiPerBillion: (ybNow / hist.Yb[0]) * 1e9,
        T: 1 / xNow,
        cp,
        deltaL: deltaL(kaon),
        brPipi: brLpipiModel(kaon),
        latePipi,
        latePipiSinceToggle,
        kaonsSinceToggle,
        kaonsFired,
        measuredDeltaL: DELTA_L_MEASURED,
      };
    },
    dispose: () => {
      legend.remove();
      inset.remove();
      tex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'matter-asymmetry',
  number: 74,
  title: 'Why Is There Matter?',
  domain: 'particle',
  level: 3,
  status: 'live',
  tagline: 'The tiny imbalance that let anything survive the Big Bang.',
  content,
  mount,
};

export default topic;
