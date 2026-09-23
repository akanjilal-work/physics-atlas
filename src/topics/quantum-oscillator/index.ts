import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  Basis, NMAX, NX, XL, activeLevels, classicalDensity, classicalMatch, coefficients, countNodes,
  evolveCoeffs, moments, reconstruct, wigner0, type Moments, type StateKind, type StateParams,
} from './physics.ts';

type View = 'ladder' | 'wigner';

// --- Ladder view geometry
const SX = 0.42; // scene units per unit of x
const SE = 0.25; // scene units per unit of energy (hbar omega)
const XV = 9; // visible half-range of x
const NR = 34; // rungs drawn, n = 0 .. NR-1
const D = 1.5; // trough half-depth in z
const BACK = -D; // back wall z
const RH = 0.8; // helix radius at the peak
const RMAX = 1.3;
const HD = 1.15; // back-wall density height at the peak
const HCAP = 1.9; // cap for the classical curve near the turning points

// --- Wigner view geometry
const RW = 8.5; // phase-space radius shown
const WS = 0.48; // scene units per phase-space unit
const WH = 1.7; // scene height of W = 1/pi
const NRING = 96;
const NSECT = 192;

const CAM_W: [number, number, number] = [0.5, 8.4, 5.6];
const TGT_W: [number, number, number] = [0, 0.1, 0];

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

const dynAttr = (arr: Float32Array): THREE.BufferAttribute => new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage);

function polyline(pts: number[], color: number, opacity = 1): THREE.Line {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [1.8, 3.4, 10.2], target: [0, 1.6, -0.6], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  const params: StateParams = { kind: 'coherent', n: 0, m: 1, alpha: 2, phi: 0, r: 0.5 };
  let view: View = 'ladder';
  let playing = true;
  let speed = 1.2;
  let showClassical = true;
  let touched = false;

  // --- Physics buffers
  const basis = new Basis();
  const N1 = NMAX + 1;
  const c0Re = new Float64Array(N1);
  const c0Im = new Float64Array(N1);
  const cRe = new Float64Array(N1);
  const cIm = new Float64Array(N1);
  const psiRe = new Float64Array(NX);
  const psiIm = new Float64Array(NX);
  const rho = new Float64Array(NX);
  const rho0 = new Float64Array(NX);
  let active: Int32Array = new Int32Array(0);
  const mom: Moments = { x: 0, p: 0, dx: 0, dp: 0, E: 0.5, nbar: 0, norm: 1 };
  const weights = new Float64Array(N1);

  // Visible slice of the grid
  const i0 = Math.round((XL - XV) / basis.dx);
  const i1 = NX - i0;
  const M = i1 - i0;
  const xs = new Float32Array(M);
  for (let j = 0; j < M; j++) xs[j] = basis.x[i0 + j] * SX;

  // ======================================================== ladder view
  const ladder = new THREE.Group();
  scene.add(ladder);

  const grid = makeGrid(12, 24);
  grid.position.y = -0.35;
  ladder.add(grid);

  // Trough, back panel, outlines and contour lines. Rebuilt when the relevant energy range changes.
  const troughGroup = new THREE.Group();
  ladder.add(troughGroup);
  const troughMat = new THREE.MeshStandardMaterial({ color: 0x2a3d66, transparent: true, opacity: 0.3, roughness: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const panelMat = new THREE.MeshBasicMaterial({ color: 0x0c1322, transparent: true, opacity: 0.7, depthWrite: false });
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x8fa3c7 });
  const frontMat = new THREE.LineBasicMaterial({ color: 0x3f5078, transparent: true, opacity: 0.8 });
  const contourMat = new THREE.LineBasicMaterial({ color: 0x2c3a5a, transparent: true, opacity: 0.6 });
  const vLabel = stage.label('V(x) = ½mω²x²', [0, 0, BACK], 'muted', ladder);
  let troughTop = -1;

  function buildTrough(etop: number): void {
    if (etop === troughTop) return;
    troughTop = etop;
    for (const c of [...troughGroup.children]) {
      troughGroup.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    const xt = Math.sqrt(2 * etop);
    const nx = 96, nz = 6;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= nz; k++) {
      for (let i = 0; i <= nx; i++) {
        const x = -xt + (2 * xt * i) / nx;
        pos.push(x * SX, 0.5 * x * x * SE, -D + (2 * D * k) / nz);
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const a = k * (nx + 1) + i;
        idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    troughGroup.add(new THREE.Mesh(g, troughMat));
    const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * xt * SX + 3.6, etop * SE + 0.7), panelMat);
    panelMesh.position.set(0.8, (etop * SE) / 2 - 0.15, BACK - 0.03);
    troughGroup.add(panelMesh);
    for (const z of [BACK, D]) {
      const pts: number[] = [];
      for (let i = 0; i <= 160; i++) {
        const x = -xt + (2 * xt * i) / 160;
        pts.push(x * SX, 0.5 * x * x * SE, z);
      }
      troughGroup.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), z === BACK ? outlineMat : frontMat));
    }
    const cl: number[] = [];
    const nr = Math.min(NR, Math.floor(etop - 0.5) + 1);
    for (let n = 0; n < nr; n++) {
      const xn = Math.sqrt(2 * n + 1) * SX;
      const y = (n + 0.5) * SE;
      cl.push(-xn, y, BACK, -xn, y, D, xn, y, BACK, xn, y, D);
    }
    troughGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cl, 3)), contourMat));
    rungGeo.setDrawRange(0, nr * 2);
    vLabel.position.set(xt * SX * 0.95 + 1.0, etop * SE * 0.95, BACK);
  }

  // Energy rungs on the back wall, coloured by occupation
  const rungPos = new Float32Array(NR * 6);
  const rungCol = new Float32Array(NR * 6);
  for (let n = 0; n < NR; n++) {
    const xn = Math.sqrt(2 * n + 1) * SX;
    const y = (n + 0.5) * SE;
    rungPos.set([-xn, y, BACK + 0.01, xn, y, BACK + 0.01], n * 6);
  }
  const rungGeo = new THREE.BufferGeometry();
  rungGeo.setAttribute('position', new THREE.BufferAttribute(rungPos, 3));
  const rungColAttr = dynAttr(rungCol);
  rungGeo.setAttribute('color', rungColAttr);
  ladder.add(new THREE.LineSegments(rungGeo, new THREE.LineBasicMaterial({ vertexColors: true })));

  // Occupation histogram |c_n|^2 hanging off the right side of each rung
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.85 }), NR);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ladder.add(bars);
  const barLabel = stage.label('|cₙ|² per rung', [0, 0, BACK], 'muted', ladder);
  barLabel.element.style.color = css(PALETTE.cyan);

  // Zero-point marker
  {
    const zp = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5 * SE, 0.02), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
    zp.position.set(0, 0.25 * SE, BACK + 0.02);
    ladder.add(zp);
    ladder.add(polyline([0, 0.25 * SE, BACK + 0.02, -1.5, 0.25 * SE, BACK + 0.02], PALETTE.amber, 0.7));
    const zl = stage.label('zero-point energy ½ħω', [-2.5, 0.25 * SE, BACK + 0.02], 'muted', ladder);
    zl.element.style.color = css(PALETTE.amber);
  }

  // Density on the back wall: filled |psi|^2 and its edge, plus the classical curve
  const denGroup = new THREE.Group();
  ladder.add(denGroup);
  const denPos = new Float32Array(M * 6);
  const denCol = new Float32Array(M * 6);
  const cy = new THREE.Color(PALETTE.cyan);
  for (let j = 0; j < M; j++) {
    denPos[j * 6] = denPos[j * 6 + 3] = xs[j];
    denPos[j * 6 + 2] = denPos[j * 6 + 5] = BACK + 0.04;
    denCol.set([cy.r * 0.08, cy.g * 0.08, cy.b * 0.08, cy.r * 0.5, cy.g * 0.5, cy.b * 0.5], j * 6);
  }
  const denPosAttr = dynAttr(denPos);
  const denGeo = new THREE.BufferGeometry();
  denGeo.setAttribute('position', denPosAttr);
  denGeo.setAttribute('color', new THREE.BufferAttribute(denCol, 3));
  denGeo.setIndex(stripIndex(M));
  const denFill = new THREE.Mesh(denGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  denFill.frustumCulled = false;
  denGroup.add(denFill);
  const denEdgePos = new Float32Array(M * 3);
  for (let j = 0; j < M; j++) {
    denEdgePos[j * 3] = xs[j];
    denEdgePos[j * 3 + 2] = BACK + 0.05;
  }
  const denEdgeAttr = dynAttr(denEdgePos);
  const denEdge = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', denEdgeAttr), new THREE.LineBasicMaterial({ color: PALETTE.cyan }));
  denEdge.frustumCulled = false;
  denGroup.add(denEdge);
  const clPos = new Float32Array(M * 3);
  for (let j = 0; j < M; j++) {
    clPos[j * 3] = xs[j];
    clPos[j * 3 + 2] = BACK + 0.06;
  }
  const clAttr = dynAttr(clPos);
  const clLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', clAttr), new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  clLine.frustumCulled = false;
  denGroup.add(clLine);

  // Helix psi(x, t) along the baseline
  const helix = new THREE.Group();
  ladder.add(helix);
  const ribPos = new Float32Array(M * 6);
  const ribCol = new Float32Array(M * 6);
  const edgePos = new Float32Array(M * 3);
  const edgeCol = new Float32Array(M * 3);
  for (let j = 0; j < M; j++) {
    ribPos[j * 6] = ribPos[j * 6 + 3] = xs[j];
    edgePos[j * 3] = xs[j];
  }
  const ribPosAttr = dynAttr(ribPos);
  const ribColAttr = dynAttr(ribCol);
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', ribPosAttr);
  ribGeo.setAttribute('color', ribColAttr);
  ribGeo.setIndex(stripIndex(M));
  const ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
  ribbon.frustumCulled = false;
  helix.add(ribbon);
  const edgePosAttr = dynAttr(edgePos);
  const edgeColAttr = dynAttr(edgeCol);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', edgePosAttr);
  edgeGeo.setAttribute('color', edgeColAttr);
  const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  edge.frustumCulled = false;
  helix.add(edge);
  const axisLine = polyline([-XV * SX, 0, 0, XV * SX, 0, 0], 0x56627c);
  helix.add(axisLine);
  stage.label('ψ(x, t)', [XV * SX + 0.35, 0, 0], 'big', helix);

  // Mean position marker and classical ball
  const meanDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  helix.add(meanDot);
  const ballMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: 0x5a3a08, roughness: 0.35, metalness: 0.2 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), ballMat);
  ladder.add(ball);

  // ======================================================== Wigner view
  const phase = new THREE.Group();
  phase.visible = false;
  scene.add(phase);
  const wRot = new THREE.Group();
  phase.add(wRot);

  const NV = 1 + NRING * NSECT;
  const wPos = new Float32Array(NV * 3);
  const wCol = new Float32Array(NV * 3);
  const wx = new Float64Array(NV);
  const wp = new Float64Array(NV);
  for (let k = 0; k < NRING; k++) {
    const rr = (RW * (k + 1)) / NRING;
    for (let s = 0; s < NSECT; s++) {
      const a = (2 * Math.PI * s) / NSECT;
      const v = 1 + k * NSECT + s;
      wx[v] = rr * Math.cos(a);
      wp[v] = rr * Math.sin(a);
    }
  }
  for (let v = 0; v < NV; v++) {
    wPos[v * 3] = wx[v] * WS;
    wPos[v * 3 + 2] = -wp[v] * WS; // p points away from the viewer
  }
  const wIdx: number[] = [];
  for (let s = 0; s < NSECT; s++) wIdx.push(0, 1 + s, 1 + ((s + 1) % NSECT));
  for (let k = 0; k < NRING - 1; k++) {
    for (let s = 0; s < NSECT; s++) {
      const a = 1 + k * NSECT + s;
      const b = 1 + k * NSECT + ((s + 1) % NSECT);
      wIdx.push(a, a + NSECT, b, b, a + NSECT, b + NSECT);
    }
  }
  const wGeo = new THREE.BufferGeometry();
  const wPosAttr = dynAttr(wPos);
  const wColAttr = dynAttr(wCol);
  wGeo.setAttribute('position', wPosAttr);
  wGeo.setAttribute('color', wColAttr);
  wGeo.setIndex(wIdx);
  const wSurf = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  wRot.add(wSurf);
  const wWire = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ color: 0x0b1020, wireframe: true, transparent: true, opacity: 0.12 }));
  wRot.add(wWire);
  // A radial spoke fixed to the surface so rotation is visible even for round states
  const spoke = polyline([0, 0.012, 0, RW * WS, 0.012, 0], 0x56627c, 0.8);
  wRot.add(spoke);

  const wFloor = new THREE.Mesh(new THREE.CircleGeometry(RW * WS, 96), new THREE.MeshBasicMaterial({ color: 0x1a2438, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  wFloor.rotation.x = -Math.PI / 2;
  wFloor.position.y = -0.01;
  phase.add(wFloor);
  phase.add(polyline([-RW * WS - 0.3, 0, 0, RW * WS + 0.3, 0, 0], 0x56627c));
  phase.add(polyline([0, 0, RW * WS + 0.3, 0, 0, -RW * WS - 0.3], 0x56627c));
  stage.label('x', [RW * WS + 0.55, 0, 0], 'big', phase);
  stage.label('p', [0, 0, -RW * WS - 0.55], 'big', phase);
  const wTitle = stage.label('Wigner function W(x, p) · rotates clockwise at ω', [0, -0.2, RW * WS + 0.7], 'muted', phase);
  void wTitle;

  const orbitPos = new Float32Array(129 * 3);
  const orbitAttr = dynAttr(orbitPos);
  const orbit = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', orbitAttr), new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9, depthTest: false }));
  orbit.renderOrder = 4;
  orbit.frustumCulled = false;
  phase.add(orbit);
  const orbitLabel = stage.label('classical orbit', [0, 0, 0], 'muted', phase);
  orbitLabel.element.style.color = css(PALETTE.amber);
  const wBall = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), ballMat);
  phase.add(wBall);
  const wMean = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.green, depthTest: false }));
  wMean.renderOrder = 5;
  phase.add(wMean);

  // ======================================================== overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const HUE_BAR = '<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,hsl(0,85%,55%),hsl(60,85%,55%),hsl(120,85%,55%),hsl(180,85%,55%),hsl(240,85%,55%),hsl(300,85%,55%),hsl(360,85%,55%))"></div>';
  const LEGEND_LADDER = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">The energy ladder</div>
<div>Rungs: the only allowed energies, n + ½ in units of ħω. <span style="color:${css(PALETTE.cyan)}">Bars</span>: how much of the state sits on each rung.</div>
<div style="margin-top:4px">Spiral: ψ(x, t). Radius = |ψ|, colour = phase.</div>${HUE_BAR}
<div>Back wall: <span style="color:${css(PALETTE.cyan)}">|ψ|²</span> and the <span style="color:${css(PALETTE.amber)}">classical density</span>.</div>
<div><span style="color:${css(PALETTE.amber)}">Ball</span>: a classical particle. <span style="color:${css(PALETTE.green)}">Dot</span>: ⟨x⟩.</div>`;
  const LEGEND_WIGNER = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Phase space</div>
<div>Height = Wigner function W(x, p). <span style="color:${css(PALETTE.cyan)}">Cyan</span> above zero, <span style="color:${css(PALETTE.rose)}">rose</span> below zero.</div>
<div style="margin-top:4px">Time evolution turns the whole surface rigidly, clockwise, once per period.</div>
<div style="margin-top:4px"><span style="color:${css(PALETTE.amber)}">Ring and ball</span>: the classical orbit. <span style="color:${css(PALETTE.green)}">Dot</span>: (⟨x⟩, ⟨p⟩).</div>`;

  const spark = document.createElement('canvas');
  spark.width = 440;
  spark.height = 180;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '220px', height: '90px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const TRACE = 480;
  const trT = new Float32Array(TRACE);
  const trX = new Float32Array(TRACE);
  const trD = new Float32Array(TRACE);
  let trN = 0;
  let trHead = 0;
  let trScale = 1;

  function drawSpark(): void {
    const W = spark.width;
    const H = spark.height;
    sctx.clearRect(0, 0, W, H);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = css(PALETTE.amber);
    sctx.fillText('⟨x⟩(t)', 16, 30);
    sctx.fillStyle = css(PALETTE.cyan);
    sctx.fillText('Δx(t)', 130, 30);
    sctx.fillStyle = '#8391ab';
    sctx.fillText('last 3 periods', 240, 30);
    const top = 44, bot = H - 12;
    const yOf = (v: number) => top + ((trScale - v) / (2 * trScale)) * (bot - top);
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(10, yOf(0));
    sctx.lineTo(W - 10, yOf(0));
    sctx.stroke();
    if (trN < 2) return;
    const span = 6 * Math.PI;
    const tEnd = trT[(trHead - 1 + TRACE) % TRACE];
    const draw = (arr: Float32Array, col: string) => {
      sctx.strokeStyle = col;
      sctx.lineWidth = 3;
      sctx.beginPath();
      let first = true;
      for (let k = 0; k < trN; k++) {
        const i = (trHead - trN + k + TRACE) % TRACE;
        const age = tEnd - trT[i];
        if (age > span) continue;
        const x = 10 + (1 - age / span) * (W - 20);
        const y = yOf(arr[i]);
        if (first) sctx.moveTo(x, y);
        else sctx.lineTo(x, y);
        first = false;
      }
      sctx.stroke();
    };
    draw(trD, css(PALETTE.cyan));
    draw(trX, css(PALETTE.amber));
  }

  // ======================================================== simulation bookkeeping
  let t = 0;
  let since = 0; // sim time since the last rebuild
  let base = 0; // baseline energy of the helix
  let ampScale = 1;
  let denScale = 1;
  let A = 1; // classical amplitude
  let phi0 = 0; // classical phase
  let wmin = 0;
  let match = 0;
  let nodes = 0;
  let gridNorm = 1;
  let drift = 0;
  let dxMin = Infinity;
  let dxMax = -Infinity;
  let camBase = -1;

  function evolveTo(tt: number): void {
    evolveCoeffs(c0Re, c0Im, tt, cRe, cIm);
    reconstruct(basis, cRe, cIm, active, psiRe, psiIm);
    let s = 0;
    for (let i = 0; i < NX; i++) {
      const r = psiRe[i] * psiRe[i] + psiIm[i] * psiIm[i];
      rho[i] = r;
      s += r;
    }
    gridNorm = s * basis.dx;
    moments(cRe, cIm, mom);
  }

  function rebuild(): void {
    coefficients(params, basis, c0Re, c0Im);
    active = activeLevels(c0Re, c0Im);
    t = 0;
    since = 0;
    dxMin = Infinity;
    dxMax = -Infinity;
    trN = 0;
    trHead = 0;
    // peak |psi|^2 over one period sets the drawing scales
    let peak = 0;
    for (let k = 0; k < 24; k++) {
      evolveTo((2 * Math.PI * k) / 24);
      for (let i = i0; i < i1; i++) if (rho[i] > peak) peak = rho[i];
    }
    ampScale = RH / Math.sqrt(peak);
    denScale = HD / peak;
    evolveTo(0);
    rho0.set(rho);
    base = mom.E;
    // classical partner: same energy for stationary-ish states, same orbit for Gaussian states
    if (params.kind === 'coherent' || params.kind === 'squeezed') {
      A = Math.SQRT2 * params.alpha;
      phi0 = params.phi;
    } else {
      A = Math.sqrt(2 * mom.E);
      phi0 = Math.hypot(mom.x, mom.p) > 1e-9 ? Math.atan2(mom.p, mom.x) : 0;
    }
    trScale = Math.max(1, Math.SQRT2 * Math.hypot(mom.x, mom.p) + 0.3, mom.dx * 2.2);
    if (params.kind === 'squeezed') trScale = Math.max(trScale, Math.SQRT2 * params.alpha + 0.3, Math.exp(params.r) / Math.SQRT2 + 0.3);
    // rung weights and histogram
    let wmax = 0;
    for (let n = 0; n < N1; n++) {
      weights[n] = c0Re[n] * c0Re[n] + c0Im[n] * c0Im[n];
      if (weights[n] > wmax) wmax = weights[n];
    }
    const m4 = new THREE.Matrix4();
    let nHigh = 0;
    for (let n = 0; n < N1; n++) if (weights[n] > 1e-3 * wmax) nHigh = n;
    buildTrough(Math.min(NR, Math.max(9, nHigh + 7)));
    for (let n = 0; n < NR; n++) {
      const w = weights[n] / wmax;
      const lit = weights[n] > 1e-4 ? 0.35 + 0.65 * Math.sqrt(w) : 0;
      const r = 0.2 + 0.75 * lit, g = 0.25 + 0.72 * lit, b = 0.36 + 0.62 * lit;
      rungCol.set([r, g, b, r, g, b], n * 6);
      const len = Math.max(1e-4, 1.4 * w);
      const xn = Math.sqrt(2 * n + 1) * SX;
      m4.makeScale(len, 0.07, 0.03).setPosition(xn + 0.12 + len / 2, (n + 0.5) * SE, BACK + 0.02);
      bars.setMatrixAt(n, m4);
    }
    rungColAttr.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    barLabel.position.set(Math.sqrt(2 * nHigh + 1) * SX + 1.0, (Math.min(NR - 1, nHigh) + 2) * SE, BACK);
    // classical density on the back wall (same normalisation as |psi|^2)
    const Acl = Math.sqrt(2 * mom.E);
    for (let j = 0; j < M; j++) {
      const pc = classicalDensity(Acl, basis.x[i0 + j]);
      clPos[j * 3 + 1] = base * SE + Math.min(HCAP, pc * denScale);
    }
    clAttr.needsUpdate = true;
    match = classicalMatch(basis, rho, Acl);
    buildWigner();
    buildOrbit();
    helix.position.y = base * SE;
    // keep the camera on the baseline
    if (view === 'ladder' && Math.abs(base - camBase) > 0.6) {
      camBase = base;
      const yb = base * SE;
      stage.flyTo([1.8, yb + 2.3, 10.2], [0, yb + 0.5, -0.6], 0.6);
    }
    applyClassical();
    refresh();
  }

  function buildWigner(): void {
    const pos = new THREE.Color(PALETTE.cyan);
    const hs = WH * Math.PI;
    let mn = Infinity;
    for (let v = 0; v < NV; v++) {
      const w = wigner0(params, wx[v], wp[v]);
      if (w < mn) mn = w;
      const h = w * hs;
      wPos[v * 3 + 1] = h;
      const g = Math.min(1, Math.abs(h) / 1.1);
      const o = v * 3;
      if (w >= 0) {
        wCol[o] = 0.025 + pos.r * 0.9 * g;
        wCol[o + 1] = 0.035 + pos.g * 0.9 * g;
        wCol[o + 2] = 0.07 + pos.b * 0.85 * g;
      } else {
        const gg = Math.min(1, 0.35 + g * 2);
        wCol[o] = 0.96 * gg;
        wCol[o + 1] = 0.45 * gg;
        wCol[o + 2] = 0.71 * gg;
      }
    }
    wmin = mn;
    wPosAttr.needsUpdate = true;
    wColAttr.needsUpdate = true;
  }

  function buildOrbit(): void {
    const R = Math.min(A, RW) * WS;
    for (let k = 0; k <= 128; k++) {
      const a = (2 * Math.PI * k) / 128;
      orbitPos.set([R * Math.cos(a), 0.02, R * Math.sin(a)], k * 3);
    }
    orbitAttr.needsUpdate = true;
    orbitLabel.position.set(-R * 0.72, 0.05, R * 0.72 + 0.2);
  }

  function refresh(): void {
    const yb = base * SE;
    // helix
    for (let j = 0; j < M; j++) {
      const i = i0 + j;
      const a = psiRe[i];
      const b = psiIm[i];
      const r = Math.sqrt(rho[i]) * ampScale;
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
      const h = yb + rho[i] * denScale;
      denPos[o + 1] = yb;
      denPos[o + 4] = h;
      denEdgePos[j * 3 + 1] = h;
    }
    ribPosAttr.needsUpdate = true;
    ribColAttr.needsUpdate = true;
    edgePosAttr.needsUpdate = true;
    edgeColAttr.needsUpdate = true;
    denPosAttr.needsUpdate = true;
    denEdgeAttr.needsUpdate = true;
    meanDot.position.x = Math.max(-XV, Math.min(XV, mom.x)) * SX;
    // classical partner
    const xc = A * Math.cos(t - phi0);
    ball.position.set(xc * SX, 0.5 * xc * xc * SE + 0.13, D * 0.6);
    const R = Math.min(A, RW);
    wBall.position.set(R * Math.cos(t - phi0) * WS, 0.22, R * Math.sin(t - phi0) * WS);
    wMean.position.set(mom.x * WS, 0.08, -mom.p * WS);
    wRot.rotation.y = -t;
    nodes = countNodes(rho, i0, i1);
  }

  function applyClassical(): void {
    const stationaryLike = params.kind === 'eigen' || params.kind === 'super';
    clLine.visible = showClassical && stationaryLike;
    ball.visible = showClassical;
    wBall.visible = showClassical;
    orbit.visible = showClassical;
    orbitLabel.visible = showClassical && view === 'wigner';
  }

  // --- Frame loop
  let sparkTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      const h = dt * speed;
      t += h;
      since += h;
      evolveTo(t);
      refresh();
      let d = 0;
      for (let i = i0; i < i1; i++) {
        const e = Math.abs(rho[i] - rho0[i]);
        if (e > d) d = e;
      }
      drift = d;
      if (mom.dx < dxMin) dxMin = mom.dx;
      if (mom.dx > dxMax) dxMax = mom.dx;
      trT[trHead] = t;
      trX[trHead] = mom.x;
      trD[trHead] = mom.dx;
      trHead = (trHead + 1) % TRACE;
      trN = Math.min(TRACE, trN + 1);
    }
    sparkTimer += dt;
    if (sparkTimer > 0.06) {
      sparkTimer = 0;
      drawSpark();
    }
    updateReadouts();
  });

  function applyView(): void {
    ladder.visible = view === 'ladder';
    phase.visible = view === 'wigner';
    legend.innerHTML = view === 'ladder' ? LEGEND_LADDER : LEGEND_WIGNER;
    applyClassical();
    if (view === 'wigner') {
      stage.flyTo(CAM_W, TGT_W);
    } else {
      const yb = base * SE;
      camBase = base;
      stage.flyTo([1.8, yb + 2.3, 10.2], [0, yb + 0.5, -0.6]);
    }
  }

  // ======================================================== controls
  const touch = () => { touched = true; };
  const DEG = Math.PI / 180;
  const ui = new Panel(panel);
  ui.section('State (restarts the clock)');
  ui.select<StateKind>({
    key: 'kind', label: 'State', value: params.kind,
    options: [
      { value: 'eigen', label: 'Eigenstate n' },
      { value: 'super', label: 'Two levels' },
      { value: 'coherent', label: 'Coherent α' },
      { value: 'squeezed', label: 'Squeezed r' },
    ],
    onChange: (v) => { touch(); params.kind = v; syncEnabled(); rebuild(); },
  });
  const nCtl = ui.slider({ key: 'n', label: 'Level n', min: 0, max: 30, step: 1, value: params.n, onInput: (v) => { touch(); params.n = v; rebuild(); } });
  const mCtl = ui.slider({ key: 'm', label: 'Second level m', min: 0, max: 30, step: 1, value: params.m, onInput: (v) => { touch(); params.m = v; rebuild(); } });
  const aCtl = ui.slider({ key: 'alpha', label: 'Amplitude |α|', min: 0, max: 3, step: 0.05, value: params.alpha, format: (v) => v.toFixed(2), onInput: (v) => { touch(); params.alpha = v; rebuild(); } });
  const pCtl = ui.slider({ key: 'phi', label: 'Phase arg α', min: -180, max: 180, step: 5, value: 0, unit: '°', onInput: (v) => { touch(); params.phi = v * DEG; rebuild(); } });
  const rCtl = ui.slider({ key: 'r', label: 'Squeeze r', min: 0, max: 0.8, step: 0.02, value: params.r, format: (v) => v.toFixed(2), onInput: (v) => { touch(); params.r = v; rebuild(); } });
  function syncEnabled(): void {
    const k = params.kind;
    nCtl.el.style.opacity = k === 'eigen' || k === 'super' ? '1' : '0.45';
    mCtl.el.style.opacity = k === 'super' ? '1' : '0.45';
    aCtl.el.style.opacity = pCtl.el.style.opacity = k === 'coherent' || k === 'squeezed' ? '1' : '0.45';
    rCtl.el.style.opacity = k === 'squeezed' ? '1' : '0.45';
  }
  syncEnabled();

  ui.section('Time and view');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { touch(); playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Restart', key: 'restart', onClick: () => { touch(); rebuild(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Speed', min: 0.1, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { touch(); speed = v; } });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'ladder', label: 'Energy ladder' }, { value: 'wigner', label: 'Wigner phase space' }],
    onChange: (v) => { touch(); view = v; applyView(); },
  });
  ui.toggle({ key: 'classical', label: 'Show classical particle', value: showClassical, onChange: (v) => { touch(); showClassical = v; applyClassical(); } });
  ui.note('Units: ħ = m = ω = 1. One period of the classical motion is 2π ≈ 6.28 time units.');

  ui.section('Live readouts');
  const rX = ui.readout('x', '⟨x⟩');
  const rP = ui.readout('p', '⟨p⟩');
  const rDxDp = ui.readout('dxdp', 'Δx·Δp  (≥ ½)');
  const rE = ui.readout('E', '⟨E⟩  (ħω)');
  const rNorm = ui.readout('norm', 'norm ∫|ψ|²dx');
  const rNodes = ui.readout('nodes', 'nodes of |ψ|²');
  const rDx = ui.readout('dx', 'Δx');
  const rT = ui.readout('t', 'periods elapsed');
  const rW = ui.readout('wmin', 'min W(x, p)');
  const rMatch = ui.readout('match', 'match to classical');
  ui.legend([
    { color: css(PALETTE.cyan), label: '|ψ|² and rung weights' },
    { color: css(PALETTE.amber), label: 'classical particle' },
    { color: css(PALETTE.green), label: '⟨x⟩, ⟨p⟩' },
    { color: css(PALETTE.rose), label: 'W < 0' },
  ]);

  const f3 = (v: number) => (Math.abs(v) < 5e-4 ? '0.000' : v.toFixed(3));
  function updateReadouts(): void {
    rX(f3(mom.x));
    rP(f3(mom.p));
    rDxDp((mom.dx * mom.dp).toFixed(4));
    rE(mom.E.toFixed(4));
    rNorm(gridNorm.toFixed(8));
    rNodes(String(nodes));
    rDx(mom.dx.toFixed(4));
    rT((since / (2 * Math.PI)).toFixed(2));
    rW(wmin.toFixed(4));
    rMatch(params.kind === 'eigen' ? `${(match * 100).toFixed(1)} %` : 'eigenstates only');
  }

  rebuild();
  applyView();

  return {
    state: () => ({
      kind: params.kind,
      n: params.n,
      m: params.m,
      alpha: params.alpha,
      phi: params.phi,
      r: params.r,
      view,
      playing,
      showClassical,
      touched,
      t,
      periods: since / (2 * Math.PI),
      drift,
      dxSpread: Number.isFinite(dxMax - dxMin) ? dxMax - dxMin : 0,
      dx: mom.dx,
      x: mom.x,
      p: mom.p,
      E: mom.E,
      dxdp: mom.dx * mom.dp,
      norm: gridNorm,
      nodes,
      wmin,
      match,
    }),
    dispose: () => {
      legend.remove();
      spark.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quantum-oscillator',
  number: 25,
  symbol: 'Qo',
  title: 'The Quantum Oscillator',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'Energy comes in steps, and even the ground state jitters.',
  content,
  mount,
};

export default topic;
