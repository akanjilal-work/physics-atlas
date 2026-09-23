import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { GRID_L, GRID_N, Packet, hasWigner, spreadWidth, wigner, type PacketKind, type PacketParams } from './physics.ts';

type View = 'waves' | 'phase';

// --- Wave panels
const XW = 15; // visible half-range in x
const KW = 8; // visible half-range in p
const PW = 5.6; // scene width of each panel
const SX = PW / (2 * XW);
const SK = PW / (2 * KW);
const PX = -3.2; // centre of the position panel
const KX = 3.2; // centre of the momentum panel
const FLOOR = -1.5;
const RH = 1.05; // helix radius at the peak
const RMAX = 1.7;
const DEN_W = 1.0; // max half-depth of the floor glow
const BR_Z = 2.35; // z of the brackets
const RATE = 1.2; // time units per second

// --- Phase-space view
const WX = 8; // x half-range
const WP = 5; // p half-range
const WSX = 3.6 / WX;
const WSP = 3.0 / WP;
const NWX = 161;
const NWP = 121;
const WH = 2.0; // scene height of W = 1/pi
const WFLOOR = -0.6;

const CAM_WAVES: [number, number, number] = [0, 3.0, 12.4];
const TGT_WAVES: [number, number, number] = [0, -0.45, 0.5];
const CAM_PHASE: [number, number, number] = [4.0, 6.6, 6.8];
const TGT_PHASE: [number, number, number] = [0, -0.2, 0];

/** HSV (s = 0.85) to RGB written straight into a Float32Array. */
function hueInto(h: number, v: number, out: Float32Array, o: number): void {
  const s = 0.85;
  const hh = (h - Math.floor(h)) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r = v, g = t, b = p;
  switch (i) {
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  out[o] = r;
  out[o + 1] = g;
  out[o + 2] = b;
}

function stripIndex(m: number): THREE.BufferAttribute {
  const idx = new Uint16Array((m - 1) * 6);
  for (let i = 0; i < m - 1; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.set([a, b, c, b, d, c], i * 6);
  }
  return new THREE.BufferAttribute(idx, 1);
}

function dynAttr(arr: Float32Array): THREE.BufferAttribute {
  return new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage);
}

/** One helix panel: ribbon, bright edge, axis and floor glow, drawn from a list of grid indices. */
class HelixPanel {
  readonly group = new THREE.Group();
  readonly m: number;
  private readonly idx: Int32Array;
  private readonly ribPos: Float32Array;
  private readonly ribCol: Float32Array;
  private readonly edgePos: Float32Array;
  private readonly edgeCol: Float32Array;
  private readonly floorPos: Float32Array;
  private readonly floorCol: Float32Array;
  private readonly attrs: THREE.BufferAttribute[];
  ampScale = 1;
  denScale = 1;

  constructor(idx: Int32Array, xs: Float32Array, glow: THREE.Color) {
    const m = idx.length;
    this.m = m;
    this.idx = idx;
    this.ribPos = new Float32Array(m * 6);
    this.ribCol = new Float32Array(m * 6);
    this.edgePos = new Float32Array(m * 3);
    this.edgeCol = new Float32Array(m * 3);
    this.floorPos = new Float32Array(m * 6);
    this.floorCol = new Float32Array(m * 6);
    for (let j = 0; j < m; j++) {
      this.ribPos[j * 6] = this.ribPos[j * 6 + 3] = xs[j];
      this.edgePos[j * 3] = xs[j];
      this.floorPos[j * 6] = this.floorPos[j * 6 + 3] = xs[j];
      this.floorPos[j * 6 + 1] = this.floorPos[j * 6 + 4] = FLOOR + 0.01;
      // glow colour is fixed, brightness is carried by the width
      this.floorCol[j * 6] = this.floorCol[j * 6 + 3] = glow.r * 0.55;
      this.floorCol[j * 6 + 1] = this.floorCol[j * 6 + 4] = glow.g * 0.55;
      this.floorCol[j * 6 + 2] = this.floorCol[j * 6 + 5] = glow.b * 0.55;
    }
    const rib = new THREE.BufferGeometry();
    const a1 = dynAttr(this.ribPos), a2 = dynAttr(this.ribCol);
    rib.setAttribute('position', a1);
    rib.setAttribute('color', a2);
    rib.setIndex(stripIndex(m));
    const ribbon = new THREE.Mesh(rib, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
    ribbon.frustumCulled = false;
    this.group.add(ribbon);
    const edge = new THREE.BufferGeometry();
    const a3 = dynAttr(this.edgePos), a4 = dynAttr(this.edgeCol);
    edge.setAttribute('position', a3);
    edge.setAttribute('color', a4);
    const line = new THREE.Line(edge, new THREE.LineBasicMaterial({ vertexColors: true }));
    line.frustumCulled = false;
    this.group.add(line);
    const axis = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([xs[0], 0, 0, xs[m - 1], 0, 0], 3));
    this.group.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ color: 0x56627c })));
    const fl = new THREE.BufferGeometry();
    const a5 = dynAttr(this.floorPos);
    fl.setAttribute('position', a5);
    fl.setAttribute('color', new THREE.BufferAttribute(this.floorCol, 3));
    fl.setIndex(stripIndex(m));
    const floor = new THREE.Mesh(fl, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    floor.frustumCulled = false;
    this.group.add(floor);
    this.attrs = [a1, a2, a3, a4, a5];
  }

  draw(re: Float64Array, im: Float64Array): void {
    const { m, idx, ribPos, ribCol, edgePos, edgeCol, floorPos, ampScale, denScale } = this;
    for (let j = 0; j < m; j++) {
      const i = idx[j];
      const a = re[i];
      const b = im[i];
      const mod2 = a * a + b * b;
      const r = Math.sqrt(mod2) * ampScale;
      let y = a * ampScale;
      let z = b * ampScale;
      if (r > RMAX) {
        y *= RMAX / r;
        z *= RMAX / r;
      }
      const o = j * 6;
      ribPos[o + 4] = y;
      ribPos[o + 5] = z;
      edgePos[j * 3 + 1] = y;
      edgePos[j * 3 + 2] = z;
      const hue = Math.atan2(b, a) / (2 * Math.PI) + 1;
      const bright = Math.min(1, 0.2 + r / RH);
      hueInto(hue, bright, ribCol, o + 3);
      hueInto(hue, bright * 0.25, ribCol, o);
      hueInto(hue, Math.min(1, 0.35 + r / RH), edgeCol, j * 3);
      const w = Math.min(DEN_W, mod2 * denScale);
      floorPos[o + 2] = -w;
      floorPos[o + 5] = w;
    }
    for (const at of this.attrs) at.needsUpdate = true;
  }
}

/** A flat bracket on the floor: a bar with two end posts. */
class Bracket {
  readonly group = new THREE.Group();
  private readonly bar: THREE.Mesh;
  private readonly lEnd: THREE.Mesh;
  private readonly rEnd: THREE.Mesh;
  private readonly centre: THREE.Mesh;
  constructor(color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 0.07), mat);
    const post = new THREE.BoxGeometry(0.05, 0.42, 0.05);
    this.lEnd = new THREE.Mesh(post, mat);
    this.rEnd = new THREE.Mesh(post, mat);
    this.centre = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat);
    this.lEnd.position.y = this.rEnd.position.y = 0.19;
    this.group.add(this.bar, this.lEnd, this.rEnd, this.centre);
  }
  /** Span from x0 to x1 in the group's frame. */
  set(x0: number, x1: number, xc: number): void {
    const w = Math.max(0.002, x1 - x0);
    this.bar.scale.x = w;
    this.bar.position.x = (x0 + x1) / 2;
    this.lEnd.position.x = x0;
    this.rEnd.position.x = x1;
    this.centre.position.x = xc;
  }
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_WAVES, target: TGT_WAVES, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  const params: PacketParams = { kind: 'gauss', sigma: 1, k0: 1.5, chirp: 0, nWaves: 5, sep: 6 };
  let view: View = 'waves';
  let playing = true;
  let touched = false;

  const P = new Packet(GRID_N, GRID_L);
  const scrRe = new Float64Array(GRID_N);
  const scrIm = new Float64Array(GRID_N);

  // --- Index maps from the FFT grid to the visible slices
  const i0 = Math.round((GRID_L / 2 - XW) / P.dx);
  const MX = GRID_N - 2 * i0 + 1;
  const idxX = new Int32Array(MX);
  const xsX = new Float32Array(MX);
  for (let j = 0; j < MX; j++) {
    idxX[j] = i0 + j;
    xsX[j] = P.x[i0 + j] * SX;
  }
  const gK = Math.round(KW / P.dk);
  const MK = 2 * gK + 1;
  const idxK = new Int32Array(MK);
  const xsK = new Float32Array(MK);
  for (let j = 0; j < MK; j++) {
    const g = j - gK;
    idxK[j] = (g + GRID_N) % GRID_N;
    xsK[j] = g * P.dk * SK;
  }

  // ======================================================== wave panels
  const waves = new THREE.Group();
  scene.add(waves);

  const posPanel = new HelixPanel(idxX, xsX, new THREE.Color(PALETTE.cyan));
  posPanel.group.position.x = PX;
  waves.add(posPanel.group);
  const momPanel = new HelixPanel(idxK, xsK, new THREE.Color(PALETTE.cyan));
  momPanel.group.position.x = KX;
  waves.add(momPanel.group);

  for (const cx of [PX, KX]) {
    const g = makeGrid(PW, 16);
    g.position.set(cx, FLOOR, 0.3);
    g.scale.z = 0.78;
    waves.add(g);
  }

  const bx = new Bracket(PALETTE.amber);
  bx.group.position.set(PX, FLOOR + 0.02, BR_Z);
  waves.add(bx.group);
  const bp = new Bracket(PALETTE.rose);
  bp.group.position.set(KX, FLOOR + 0.02, BR_Z);
  waves.add(bp.group);
  const bxLabel = stage.label('Δx', [0, -0.05, 0.42], 'big', bx.group);
  bxLabel.element.style.color = css(PALETTE.amber);
  const bpLabel = stage.label('Δp', [0, -0.05, 0.42], 'big', bp.group);
  bpLabel.element.style.color = css(PALETTE.rose);

  const wavesLabels = [
    stage.label('position space  ψ(x)', [PX, 1.75, 0], 'big', waves),
    stage.label('momentum space  φ(p)', [KX, 1.75, 0], 'big', waves),
    stage.label('⇄ Fourier', [0, 0.35, 0], 'muted', waves),
    stage.label('x', [PX + PW / 2 + 0.25, 0, 0], 'muted', waves),
    stage.label('p', [KX + PW / 2 + 0.25, 0, 0], 'muted', waves),
  ];

  // ======================================================== phase space
  const phase = new THREE.Group();
  phase.position.y = WFLOOR;
  phase.visible = false;
  scene.add(phase);

  const NV = NWX * NWP;
  const wPos = new Float32Array(NV * 3);
  const wCol = new Float32Array(NV * 3);
  const wxv = new Float64Array(NWX);
  const wpv = new Float64Array(NWP);
  for (let a = 0; a < NWX; a++) wxv[a] = -WX + (2 * WX * a) / (NWX - 1);
  for (let b = 0; b < NWP; b++) wpv[b] = -WP + (2 * WP * b) / (NWP - 1);
  for (let b = 0; b < NWP; b++) {
    for (let a = 0; a < NWX; a++) {
      const v = b * NWX + a;
      wPos[v * 3] = wxv[a] * WSX;
      wPos[v * 3 + 2] = -wpv[b] * WSP; // p runs away from the viewer
    }
  }
  const wIdx = new Uint32Array((NWX - 1) * (NWP - 1) * 6);
  {
    let o = 0;
    for (let b = 0; b < NWP - 1; b++) {
      for (let a = 0; a < NWX - 1; a++) {
        const v = b * NWX + a;
        wIdx.set([v, v + 1, v + NWX, v + 1, v + NWX + 1, v + NWX], o);
        o += 6;
      }
    }
  }
  const wGeo = new THREE.BufferGeometry();
  const wPosAttr = dynAttr(wPos);
  const wColAttr = dynAttr(wCol);
  wGeo.setAttribute('position', wPosAttr);
  wGeo.setAttribute('color', wColAttr);
  wGeo.setIndex(new THREE.BufferAttribute(wIdx, 1));
  const wSurf = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.88 }));
  wSurf.frustumCulled = false;
  phase.add(wSurf);
  const wWire = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ color: 0x0b1020, wireframe: true, transparent: true, opacity: 0.18 }));
  wWire.frustumCulled = false;
  phase.add(wWire);

  const pFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * WX * WSX, 2 * WP * WSP),
    new THREE.MeshBasicMaterial({ color: 0x1a2438, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  pFloor.rotation.x = -Math.PI / 2;
  pFloor.position.y = -0.005;
  phase.add(pFloor);
  const pGrid = makeGrid(2 * WX * WSX, 16);
  pGrid.scale.z = (WP * WSP) / (WX * WSX);
  phase.add(pGrid);

  // Marginals on the back and left walls
  const backZ = -WP * WSP - 0.05;
  const leftX = -WX * WSX - 0.05;
  const iMx0 = Math.round((GRID_L / 2 - WX) / P.dx);
  const MMX = GRID_N - 2 * iMx0 + 1;
  const margXPos = new Float32Array(MMX * 3);
  for (let j = 0; j < MMX; j++) {
    margXPos[j * 3] = P.x[iMx0 + j] * WSX;
    margXPos[j * 3 + 2] = backZ;
  }
  const gM = Math.round(WP / P.dk);
  const MMP = 2 * gM + 1;
  const margPPos = new Float32Array(MMP * 3);
  for (let j = 0; j < MMP; j++) {
    margPPos[j * 3] = leftX;
    margPPos[j * 3 + 2] = -(j - gM) * P.dk * WSP;
  }
  const mxAttr = dynAttr(margXPos);
  const mpAttr = dynAttr(margPPos);
  const mxLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', mxAttr), new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  const mpLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', mpAttr), new THREE.LineBasicMaterial({ color: PALETTE.rose }));
  mxLine.frustumCulled = mpLine.frustumCulled = false;
  phase.add(mxLine, mpLine);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(2 * WX * WSX, 2.2), new THREE.MeshBasicMaterial({ color: 0x121a2c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  backWall.position.set(0, 1.1, backZ - 0.01);
  phase.add(backWall);
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(2 * WP * WSP, 2.2), new THREE.MeshBasicMaterial({ color: 0x121a2c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(leftX - 0.01, 1.1, 0);
  phase.add(leftWall);

  // Delta x by Delta p box on the floor
  const boxPos = new Float32Array(5 * 3);
  const boxAttr = dynAttr(boxPos);
  const box = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', boxAttr), new THREE.LineBasicMaterial({ color: PALETTE.green, depthTest: false, transparent: true }));
  box.renderOrder = 5;
  box.frustumCulled = false;
  box.position.y = 0.01;
  phase.add(box);

  stage.label('x', [WX * WSX + 0.3, 0, WP * WSP], 'muted', phase);
  stage.label('p', [-WX * WSX, 0, -WP * WSP - 0.35], 'muted', phase);
  stage.label('|ψ(x)|²  (∫W dp)', [WX * WSX * 0.55, 1.9, backZ], 'muted', phase);
  stage.label('|φ(p)|²  (∫W dx)', [leftX, 1.9, WP * WSP * 0.5], 'muted', phase);
  const wTitle = stage.label('Wigner function W(x, p)', [-WX * WSX * 0.45, -0.35, WP * WSP + 0.45], 'big', phase);
  const pos = new THREE.Color(PALETTE.cyan);
  const wNote = stage.label('', [0, 1.0, 0], 'big', phase);
  wNote.element.style.maxWidth = '280px';
  wNote.element.style.textAlign = 'center';
  wNote.element.style.whiteSpace = 'normal';

  // ======================================================== overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const HUE_BAR = '<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,hsl(0,85%,55%),hsl(60,85%,55%),hsl(120,85%,55%),hsl(180,85%,55%),hsl(240,85%,55%),hsl(300,85%,55%),hsl(360,85%,55%))"></div>';
  const LEGEND_WAVES = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Two views of one particle</div>
<div>Each spiral is a complex wave. Radius = size, colour = phase</div>${HUE_BAR}
<div><span style="color:${css(PALETTE.cyan)}">Floor glow</span> = |ψ|² or |φ|².</div>
<div><span style="color:${css(PALETTE.amber)}">Δx</span> and <span style="color:${css(PALETTE.rose)}">Δp</span> brackets span mean ± one standard deviation.</div>`;
  const LEGEND_PHASE = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Phase space</div>
<div>Height = Wigner function W(x, p).</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan</span> above zero, <span style="color:${css(PALETTE.rose)}">rose</span> below zero. A true probability could never go negative.</div>
<div>Walls: its two shadows, <span style="color:${css(PALETTE.amber)}">|ψ(x)|²</span> and <span style="color:${css(PALETTE.rose)}">|φ(p)|²</span>.</div>
<div><span style="color:${css(PALETTE.green)}">Box</span>: 2Δx by 2Δp.</div>`;

  // Heisenberg gauge
  const gauge = document.createElement('canvas');
  gauge.width = 460;
  gauge.height = 200;
  Object.assign(gauge.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '100px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(gauge);
  const gctx = gauge.getContext('2d')!;
  let lastGauge = -1;
  const GMAX = 4;

  function drawGauge(r: number): void {
    if (Math.abs(r - lastGauge) < 5e-4) return;
    lastGauge = r;
    const W = gauge.width;
    const H = gauge.height;
    gctx.clearRect(0, 0, W, H);
    gctx.font = '22px JetBrains Mono, monospace';
    gctx.fillStyle = '#8391ab';
    gctx.fillText('Δx·Δp  ÷  ħ/2', 16, 32);
    gctx.fillStyle = r < 1.01 ? css(PALETTE.green) : '#dfe6f3';
    gctx.font = '600 40px JetBrains Mono, monospace';
    const txt = r >= 100 ? r.toFixed(0) : r.toFixed(3);
    gctx.textAlign = 'right';
    gctx.fillText(txt, W - 16, 40);
    gctx.textAlign = 'left';
    const x0 = 16, x1 = W - 16, y = 78, h = 44;
    const X = (v: number) => x0 + (Math.min(v, GMAX) / GMAX) * (x1 - x0);
    // forbidden zone
    gctx.fillStyle = 'rgba(255,107,107,0.14)';
    gctx.fillRect(x0, y, X(1) - x0, h);
    gctx.strokeStyle = 'rgba(255,107,107,0.4)';
    gctx.lineWidth = 2;
    gctx.save();
    gctx.beginPath();
    gctx.rect(x0, y, X(1) - x0, h);
    gctx.clip();
    for (let s = -h; s < X(1) - x0 + h; s += 14) {
      gctx.beginPath();
      gctx.moveTo(x0 + s, y + h);
      gctx.lineTo(x0 + s + h, y);
      gctx.stroke();
    }
    gctx.restore();
    // track and bar
    gctx.strokeStyle = '#243049';
    gctx.strokeRect(x0, y, x1 - x0, h);
    gctx.fillStyle = css(r < 1.01 ? PALETTE.green : PALETTE.cyan);
    gctx.globalAlpha = 0.85;
    gctx.fillRect(X(1), y + 8, Math.max(2, X(r) - X(1)), h - 16);
    gctx.globalAlpha = 1;
    if (r > GMAX) {
      gctx.fillStyle = css(PALETTE.cyan);
      gctx.beginPath();
      gctx.moveTo(x1 - 2, y + h / 2);
      gctx.lineTo(x1 - 16, y + 6);
      gctx.lineTo(x1 - 16, y + h - 6);
      gctx.fill();
    }
    // the floor
    gctx.strokeStyle = '#ff6b6b';
    gctx.lineWidth = 3;
    gctx.beginPath();
    gctx.moveTo(X(1), y - 6);
    gctx.lineTo(X(1), y + h + 6);
    gctx.stroke();
    gctx.font = '17px JetBrains Mono, monospace';
    gctx.fillStyle = '#ff9a9a';
    gctx.fillText('forbidden', x0 + 6, y + h / 2 + 6);
    gctx.fillStyle = '#56627c';
    for (let v = 1; v <= GMAX; v++) gctx.fillText(String(v), X(v) - 6, y + h + 26);
  }

  // ======================================================== simulation bookkeeping
  let tLoop = 3;
  let dx0 = 1;
  let dpNow = 0.5;
  let dxNow = 1;
  let ratio = 1;
  let wmin = 0;
  let tNow = 0;
  let margScaleX = 1;
  let margScaleP = 1;

  /** Half-length of the time loop: as long as the packet stays mostly inside the visible window. */
  function computeLoop(): void {
    const win = view === 'phase' ? WX : XW;
    const dp = P.mk.sd;
    const cov = params.chirp * dx0 * dx0;
    const v = P.mk.mean;
    let T = 1.5;
    for (let t = 1.5; t <= 8; t += 0.1) {
      const ok = [t, -t].every((tt) => Math.abs(v * tt) + 1.6 * spreadWidth(dx0, dp, cov, tt) <= win);
      if (!ok) break;
      T = t;
    }
    tLoop = T;
  }

  function rebuild(): void {
    P.build(params);
    dx0 = P.mx.sd;
    computeLoop();
    // Helix scale: the tallest the packet gets during the loop, at its focus.
    const dp = P.mk.sd;
    const tFocus = Math.max(-tLoop, Math.min(tLoop, -(params.chirp * dx0 * dx0) / (dp * dp)));
    P.evolve(tFocus);
    let peak = 0;
    for (let i = 0; i < GRID_N; i++) peak = Math.max(peak, P.re[i] * P.re[i] + P.im[i] * P.im[i]);
    posPanel.ampScale = RH / Math.sqrt(peak);
    posPanel.denScale = 0.8 / peak;
    margScaleX = 1.7 / peak;
    let kpeak = 0;
    for (let i = 0; i < GRID_N; i++) kpeak = Math.max(kpeak, P.phi0Re[i] ** 2 + P.phi0Im[i] ** 2);
    momPanel.ampScale = RH / Math.sqrt(kpeak);
    momPanel.denScale = 0.8 / kpeak;
    margScaleP = 1.7 / kpeak;
    tNow = Math.max(-tLoop, Math.min(tLoop, tNow));
    P.evolve(tNow);
    refresh();
  }

  function refresh(): void {
    P.measure(scrRe, scrIm);
    dxNow = P.mx.sd;
    dpNow = P.mk.sd;
    ratio = P.ratio();
    if (view === 'waves') {
      posPanel.draw(P.re, P.im);
      momPanel.draw(P.phiRe, P.phiIm);
      const mx = P.mx.mean;
      const mk = P.mk.mean;
      const clampX = (v: number) => Math.max(-XW, Math.min(XW, v)) * SX;
      const clampK = (v: number) => Math.max(-KW, Math.min(KW, v)) * SK;
      bx.set(clampX(mx - dxNow), clampX(mx + dxNow), clampX(mx));
      bp.set(clampK(mk - dpNow), clampK(mk + dpNow), clampK(mk));
      bxLabel.position.x = clampX(mx);
      bpLabel.position.x = clampK(mk);
      const tx = `Δx = ${dxNow.toFixed(2)}`;
      const tp = `Δp = ${dpNow.toFixed(2)}`;
      if (bxLabel.element.textContent !== tx) bxLabel.element.textContent = tx;
      if (bpLabel.element.textContent !== tp) bpLabel.element.textContent = tp;
    } else {
      drawPhase();
    }
  }

  function drawPhase(): void {
    const ok = hasWigner(params.kind);
    wSurf.visible = wWire.visible = ok;
    wNote.visible = !ok;
    wTitle.visible = ok;
    wmin = 0;
    if (ok) {
      const hs = WH * Math.PI; // the Gaussian peak 1/pi reaches height WH
      let mn = Infinity;
      for (let b = 0; b < NWP; b++) {
        for (let a = 0; a < NWX; a++) {
          const v = b * NWX + a;
          const w = wigner(params, tNow, wxv[a], wpv[b]);
          if (w < mn) mn = w;
          const h = w * hs;
          wPos[v * 3 + 1] = h;
          const g = Math.min(1, Math.abs(h) / 1.2);
          const o = v * 3;
          if (w >= 0) {
            wCol[o] = 0.08 + pos.r * 0.9 * g;
            wCol[o + 1] = 0.1 + pos.g * 0.9 * g;
            wCol[o + 2] = 0.16 + pos.b * 0.85 * g;
          } else {
            const gg = Math.min(1, 0.35 + g * 2);
            wCol[o] = 0.96 * gg;
            wCol[o + 1] = 0.45 * gg;
            wCol[o + 2] = 0.71 * gg;
          }
        }
      }
      wmin = mn;
      wPosAttr.needsUpdate = true;
      wColAttr.needsUpdate = true;
    } else {
      wNote.element.textContent = 'No closed-form Wigner function for this packet. Choose Gaussian or Cat. The walls still show |ψ|² and |φ|².';
    }
    for (let j = 0; j < MMX; j++) {
      const i = iMx0 + j;
      margXPos[j * 3 + 1] = Math.min(2.1, (P.re[i] ** 2 + P.im[i] ** 2) * margScaleX);
    }
    for (let j = 0; j < MMP; j++) {
      const i = (j - gM + GRID_N) % GRID_N;
      margPPos[j * 3 + 1] = Math.min(2.1, (P.phiRe[i] ** 2 + P.phiIm[i] ** 2) * margScaleP);
    }
    mxAttr.needsUpdate = true;
    mpAttr.needsUpdate = true;
    const cx = (v: number) => Math.max(-WX, Math.min(WX, v)) * WSX;
    const cp = (v: number) => -Math.max(-WP, Math.min(WP, v)) * WSP;
    const x0 = cx(P.mx.mean - dxNow), x1 = cx(P.mx.mean + dxNow);
    const p0 = cp(P.mk.mean - dpNow), p1 = cp(P.mk.mean + dpNow);
    boxPos[0] = x0; boxPos[2] = p0;
    boxPos[3] = x1; boxPos[5] = p0;
    boxPos[6] = x1; boxPos[8] = p1;
    boxPos[9] = x0; boxPos[11] = p1;
    boxPos[12] = x0; boxPos[14] = p0;
    boxAttr.needsUpdate = true;
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    if (playing) {
      tNow += dt * RATE;
      if (tNow > tLoop) tNow = -tLoop;
      P.evolve(tNow);
      refresh();
    }
    drawGauge(ratio);
    updateReadouts();
  });

  function applyView(): void {
    waves.visible = view === 'waves';
    phase.visible = view === 'phase';
    for (const l of wavesLabels) l.visible = view === 'waves';
    bxLabel.visible = bpLabel.visible = view === 'waves';
    legend.innerHTML = view === 'waves' ? LEGEND_WAVES : LEGEND_PHASE;
    computeLoop();
    if (Math.abs(tNow) > tLoop) tNow = 0;
    P.evolve(tNow);
    refresh();
  }

  // ======================================================== controls
  const touch = () => { touched = true; };
  const ui = new Panel(panel);
  ui.section('Packet (rebuilds)');
  ui.select<PacketKind>({
    key: 'kind', label: 'Packet', value: params.kind,
    options: [
      { value: 'gauss', label: 'Gaussian' },
      { value: 'square', label: 'Square' },
      { value: 'waves', label: 'Build from waves' },
      { value: 'cat', label: 'Cat (two lumps)' },
    ],
    onChange: (v) => { touch(); params.kind = v; syncEnabled(); tNow = 0; rebuild(); },
  });
  ui.slider({ key: 'sigma', label: 'Width σ (squeeze)', min: 0.4, max: 3, step: 0.01, value: params.sigma, format: (v) => v.toFixed(2), onInput: (v) => { touch(); params.sigma = v; tNow = 0; rebuild(); } });
  ui.slider({ key: 'k0', label: 'Mean momentum p₀', min: -3, max: 3, step: 0.05, value: params.k0, format: (v) => v.toFixed(2), onInput: (v) => { touch(); params.k0 = v; tNow = 0; rebuild(); } });
  const nCtl = ui.slider({ key: 'nwaves', label: 'Plane waves N (build mode)', min: 1, max: 40, step: 1, value: params.nWaves, onInput: (v) => { touch(); params.nWaves = v; tNow = 0; rebuild(); } });
  ui.slider({ key: 'chirp', label: 'Chirp c', min: -0.6, max: 0.6, step: 0.01, value: params.chirp, format: (v) => v.toFixed(2), onInput: (v) => { touch(); params.chirp = v; tNow = 0; rebuild(); } });
  const sepCtl = ui.slider({ key: 'sep', label: 'Lump separation (cat)', min: 2, max: 10, step: 0.1, value: params.sep, format: (v) => v.toFixed(1), onInput: (v) => { touch(); params.sep = v; tNow = 0; rebuild(); } });
  function syncEnabled(): void {
    nCtl.el.style.opacity = params.kind === 'waves' ? '1' : '0.45';
    sepCtl.el.style.opacity = params.kind === 'cat' ? '1' : '0.45';
  }
  syncEnabled();

  ui.section('Free evolution and view');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { touch(); playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Rewind to t = 0', key: 'rewind', onClick: () => { touch(); tNow = 0; P.evolve(0); refresh(); } },
  ]);
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'waves', label: 'Wave panels' }, { value: 'phase', label: 'Phase space' }],
    onChange: (v) => {
      touch();
      view = v;
      applyView();
      if (v === 'waves') stage.flyTo(CAM_WAVES, TGT_WAVES);
      else stage.flyTo(CAM_PHASE, TGT_PHASE);
    },
  });
  ui.note('Units: ħ = m = 1, so momentum p equals wave number k. Free evolution loops from −T to T. The packet is narrowest near t = 0 unless you add chirp.');

  ui.section('Live readouts');
  const rDx = ui.readout('dx', 'Δx');
  const rDp = ui.readout('dp', 'Δp (live FFT)');
  const rRatio = ui.readout('ratio', 'ΔxΔp ÷ (ħ/2)');
  const rT = ui.readout('t', 'time t');
  const rNorm = ui.readout('norm', '∫|ψ|², ∫|φ|²');
  const rW = ui.readout('wmin', 'min W(x, p)');
  ui.legend([
    { color: css(PALETTE.amber), label: 'Δx bracket' },
    { color: css(PALETTE.rose), label: 'Δp bracket' },
    { color: css(PALETTE.cyan), label: 'probability glow' },
  ]);

  function updateReadouts(): void {
    rDx(dxNow.toFixed(4));
    rDp(dpNow.toFixed(4));
    rRatio(ratio.toFixed(4));
    rT(tNow.toFixed(2));
    rNorm(`${P.mx.norm.toFixed(6)}, ${P.mk.norm.toFixed(6)}`);
    rW(view === 'phase' && hasWigner(params.kind) ? wmin.toFixed(4) : 'n/a');
  }

  rebuild();
  applyView();

  return {
    state: () => ({
      kind: params.kind,
      sigma: params.sigma,
      k0: params.k0,
      nWaves: params.nWaves,
      chirp: params.chirp,
      sep: params.sep,
      t: tNow,
      playing,
      view,
      dx: dxNow,
      dp: dpNow,
      dx0,
      ratio,
      wmin: view === 'phase' ? wmin : 0,
      touched,
    }),
    dispose: () => {
      legend.remove();
      gauge.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'uncertainty',
  number: 17,
  title: 'The Uncertainty Principle',
  domain: 'quantum',
  level: 1,
  status: 'live',
  tagline: 'Squeeze a wave in space and it spreads in momentum.',
  content,
  mount,
};

export default topic;
