import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  buildCycle,
  carnotCopFridge,
  carnotCopHeatPump,
  copFridge,
  copHeatPump,
  curzonAhlbornEta,
  entropyGenerated,
  gasEntropyChange,
  legPoint,
  loopAreaPV,
  MIN_ISO_RATIO,
  sampleLoop,
  type Cycle,
  type CycleId,
  type GasState,
} from './physics.ts';

type Mode = 'engine' | 'fridge';
type GammaId = 'mono' | 'di';
type Exchange = 'hot' | 'cold' | 'regen' | 'none';

const PER_LEG = 90;
const LEG_T = 1.6; // seconds per leg at speed 1
const NP = 160; // gas particles

// Layout (world units)
const CX = -3.45; // cylinder axis
const BASE = -3.55; // cylinder floor
const HG = 2.0; // gas height at V_max
const RC = 0.6; // cylinder inner radius
const RES_DX = 1.5; // reservoir offset from the axis
const PV_X0 = 0; // P-V plot origin (in the diagram group)
const PV_Y0 = -4.6;
const PV_W = 5.3;
const PV_H = 4.9;
const RIB = 0.32; // ribbon depth

const HOT = 0xff5a4a;
const COLD = 0x3f7ff0;
const ADIA = 0x8391ab;
const REGEN = PALETTE.violet;

const CYCLE_NAMES: Record<CycleId, string> = { carnot: 'Carnot', otto: 'Otto', stirling: 'Stirling', diesel: 'Diesel' };

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Temperature colour ramp: cold blue, cyan, white, amber, hot red. */
function tempLUT(n: number): Float32Array {
  const stops: [number, number][] = [[0, COLD], [0.3, PALETTE.cyan], [0.5, 0xe8eef8], [0.72, PALETTE.amber], [1, PALETTE.red]];
  const out = new Float32Array(n * 3);
  const a = new THREE.Color();
  const b = new THREE.Color();
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    let s = 0;
    while (s < stops.length - 2 && u > stops[s + 1][0]) s++;
    const f = (u - stops[s][0]) / (stops[s + 1][0] - stops[s][0]);
    c.lerpColors(a.setHex(stops[s][1]), b.setHex(stops[s + 1][1]), Math.min(1, Math.max(0, f)));
    out[k * 3] = c.r;
    out[k * 3 + 1] = c.g;
    out[k * 3 + 2] = c.b;
  }
  return out;
}

const exchangeOf = (c: Cycle, i: number): Exchange => {
  const l = c.legs[i];
  if (l.regen) return 'regen';
  const eps = 1e-9 * c.Qin;
  return l.Q > eps ? 'hot' : l.Q < -eps ? 'cold' : 'none';
};
const exColor = (e: Exchange): number => (e === 'hot' ? HOT : e === 'cold' ? COLD : e === 'regen' ? REGEN : ADIA);

/** Name of a leg run backwards. */
const reverseName = (s: string): string =>
  s.replace(/compression|expansion|heating|cooling|from the|into the/g, (m) =>
    ({ compression: 'expansion', expansion: 'compression', heating: 'cooling', cooling: 'heating', 'from the': 'into the', 'into the': 'from the' })[m] ?? m);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [0.4, 0.5, 12.4];
  const TARGET: [number, number, number] = [0.4, -0.9, 0];
  const stage = createStage(viewport, { camera: CAM, target: TARGET, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let cycleId: CycleId = 'otto';
  let mode: Mode = 'engine';
  let gammaId: GammaId = 'di';
  let Th = 1200;
  let Tc = 300;
  let r = 8;
  let regen = true;
  let speed = 1;
  let playing = true;

  const gammaOf = () => (gammaId === 'mono' ? 5 / 3 : 7 / 5);

  // --- Scene furniture
  const grid = makeGrid(20, 40);
  grid.position.y = BASE - 0.76;
  scene.add(grid);
  const glowTex = glowTexture();

  // Cylinder
  const cylGroup = new THREE.Group();
  cylGroup.position.set(CX, BASE, 0);
  scene.add(cylGroup);
  const glassH = HG + 0.4;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(RC + 0.03, RC + 0.03, glassH, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.position.y = glassH / 2;
  cylGroup.add(glass);
  const rimGeo = new THREE.TorusGeometry(RC + 0.03, 0.025, 8, 48);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x6f82a8, metalness: 0.6, roughness: 0.35 });
  const rimTop = new THREE.Mesh(rimGeo, rimMat);
  rimTop.rotation.x = Math.PI / 2;
  rimTop.position.y = glassH;
  cylGroup.add(rimTop);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, metalness: 0.7, roughness: 0.4, emissive: 0x000000 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(RC + 0.14, RC + 0.14, 0.22, 48), plateMat);
  plate.position.y = -0.11;
  cylGroup.add(plate);

  // Regenerator band (Stirling only)
  const regenMat = new THREE.MeshStandardMaterial({ color: 0x3a2f63, emissive: REGEN, emissiveIntensity: 0.15, transparent: true, opacity: 0.8, roughness: 0.6 });
  const regenBand = new THREE.Mesh(new THREE.CylinderGeometry(RC + 0.09, RC + 0.09, 0.28, 48, 1, true), regenMat);
  regenBand.position.y = 0.26;
  cylGroup.add(regenBand);
  const regenLabel = stage.label('regenerator', [RC + 0.55, 0.26, 0], 'muted', cylGroup);

  // Piston
  const piston = new THREE.Group();
  cylGroup.add(piston);
  const pistonMat = new THREE.MeshStandardMaterial({ color: 0xc4cee0, metalness: 0.6, roughness: 0.3, emissive: 0x2a3550 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(RC - 0.01, RC - 0.01, 0.16, 48), pistonMat);
  head.position.y = 0.08;
  piston.add(head);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.5, roughness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RC - 0.005, 0.018, 8, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  piston.add(ring);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16), pistonMat);
  rod.position.y = 0.16 + 0.4;
  piston.add(rod);

  // Gas particles
  const pPos = new Float32Array(NP * 3);
  const pCol = new Float32Array(NP * 3);
  const pVel = new Float32Array(NP * 3);
  const pF = new Float32Array(NP); // per-particle speed factor (Maxwell-like spread)
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  for (let i = 0; i < NP; i++) {
    const vx = gauss(), vy = gauss(), vz = gauss();
    const v = Math.hypot(vx, vy, vz) || 1;
    pF[i] = v / Math.sqrt(3);
    pVel[i * 3] = vx / v;
    pVel[i * 3 + 1] = vy / v;
    pVel[i * 3 + 2] = vz / v;
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * (RC - 0.08);
    pPos[i * 3] = rr * Math.cos(a);
    pPos[i * 3 + 1] = 0.05 + rnd() * HG * 0.9;
    pPos[i * 3 + 2] = rr * Math.sin(a);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  particles.frustumCulled = false;
  cylGroup.add(particles);
  const LUT_N = 64;
  const lut = tempLUT(LUT_N);

  // Reservoirs
  interface Reservoir {
    mat: THREE.MeshStandardMaterial;
    glow: THREE.Sprite;
    glowMat: THREE.SpriteMaterial;
    bridgeMat: THREE.MeshStandardMaterial;
    dots: THREE.Points;
    dotPos: Float32Array;
    label: ReturnType<typeof stage.label>;
    x: number;
    level: number;
  }
  const DOTS = 10;
  function makeReservoir(side: -1 | 1, color: number, deep: number): Reservoir {
    const x = CX + side * RES_DX;
    const mat = new THREE.MeshStandardMaterial({ color: deep, emissive: color, emissiveIntensity: 0.2, roughness: 0.55, metalness: 0.1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), mat);
    box.position.set(x, BASE - 0.38, 0);
    scene.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
    edges.position.copy(box.position);
    scene.add(edges);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(x, BASE - 0.3, 0.1);
    glow.scale.setScalar(1.7);
    scene.add(glow);
    const inner = CX + side * (RC + 0.14);
    const outer = x - side * 0.4;
    const len = Math.abs(outer - inner);
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a3348, emissive: color, emissiveIntensity: 0, metalness: 0.5, roughness: 0.4 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.34), bridgeMat);
    bridge.position.set((inner + outer) / 2, BASE - 0.11, 0);
    scene.add(bridge);
    const dotPos = new Float32Array(DOTS * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dotPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dots = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.2, map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dots.frustumCulled = false;
    scene.add(dots);
    const label = stage.label('', [x, BASE - 1.05, 0.4]);
    label.element.style.color = css(color);
    return { mat, glow, glowMat, bridgeMat, dots, dotPos, label, x, level: 0 };
  }
  const hot = makeReservoir(-1, HOT, 0x4a1512);
  const cold = makeReservoir(1, COLD, 0x0f1f4a);

  // P-V diagram group, turned slightly so the ribbon reads as 3D
  const pv = new THREE.Group();
  pv.position.set(-0.55, 0, 0);
  pv.rotation.y = -0.14;
  scene.add(pv);
  const axisMat = new THREE.LineBasicMaterial({ color: 0x56627c });
  const axes = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      PV_X0, PV_Y0, 0, PV_X0 + PV_W + 0.3, PV_Y0, 0,
      PV_X0, PV_Y0, 0, PV_X0, PV_Y0 + PV_H + 0.3, 0,
    ], 3)),
    axisMat,
  );
  pv.add(axes);
  const arrowGeo = new THREE.ConeGeometry(0.06, 0.18, 12);
  const axArrowMat = new THREE.MeshBasicMaterial({ color: 0x56627c });
  const axX = new THREE.Mesh(arrowGeo, axArrowMat);
  axX.position.set(PV_X0 + PV_W + 0.3, PV_Y0, 0);
  axX.rotation.z = -Math.PI / 2;
  pv.add(axX);
  const axY = new THREE.Mesh(arrowGeo, axArrowMat);
  axY.position.set(PV_X0, PV_Y0 + PV_H + 0.3, 0);
  pv.add(axY);
  stage.label('volume V', [PV_X0 + PV_W * 0.55, PV_Y0 - 0.3, 0], 'muted', pv);
  const pAxisLabel = stage.label('pressure P', [PV_X0 + 1.6, PV_Y0 + PV_H + 0.3, 0], 'muted', pv);
  const vMaxLabel = stage.label('1.0 L', [PV_X0 + PV_W, PV_Y0 - 0.3, 0], 'muted', pv);
  const pvGrid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.8 }));
  pv.add(pvGrid);
  {
    const g: number[] = [];
    for (let k = 1; k <= 4; k++) {
      const x = PV_X0 + (k / 4) * PV_W;
      const y = PV_Y0 + (k / 4) * PV_H;
      g.push(x, PV_Y0, -0.01, x, PV_Y0 + PV_H, -0.01, PV_X0, y, -0.01, PV_X0 + PV_W, y, -0.01);
    }
    pvGrid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
  }

  const ribbonMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.0 });
  const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat);
  pv.add(ribbon);
  const edgeLine = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  pv.add(edgeLine);
  const fillMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat);
  pv.add(fill);
  const dirArrows: THREE.Mesh[] = [];
  const dirMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f3 });
  const dirGeo = new THREE.ConeGeometry(0.1, 0.28, 16);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(dirGeo, dirMat);
    pv.add(m);
    dirArrows.push(m);
  }
  const stateLabels = [0, 1, 2, 3].map((i) => stage.label(String(i + 1), [0, 0, 0], '', pv));
  for (const l of stateLabels) Object.assign(l.element.style, { fontWeight: '700', color: '#dfe6f3' });
  const wLabel = stage.label('', [0, 0, 0], '', pv);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  pv.add(marker);
  const markerGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 });
  const markerGlow = new THREE.Sprite(markerGlowMat);
  markerGlow.scale.setScalar(0.7);
  marker.add(markerGlow);

  // --- Overlays
  // One left-hand column: what is happening now, then the per-leg ledger.
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', width: '252px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9', boxSizing: 'border-box',
  } as CSSStyleDeclaration);
  viewport.appendChild(info);
  const legend = document.createElement('div');
  const ledger = document.createElement('div');
  ledger.style.marginTop = '6px';
  ledger.style.paddingTop = '5px';
  ledger.style.borderTop = '1px solid #243049';
  info.append(legend, ledger);

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // --- Derived cycle data (rebuilt on parameter change only)
  let cyc: Cycle = buildCycle({ cycle: cycleId, Th, Tc, r, gamma: gammaOf(), regen });
  let samples: Float64Array = new Float64Array(0);
  let area = 0;
  let sGen = 0;
  let dSgas = 0;
  let copF = 0;
  let copHP = 0;
  let Pmax = 1;
  let Smin = 0;
  let Smax = 1;
  const exch: Exchange[] = ['none', 'none', 'none', 'none'];
  let tsX = new Float32Array(0);
  let tsY = new Float32Array(0);
  const TS = { x0: 58, x1: 462, y0: 44, y1: 262 };

  const xOfV = (V: number) => PV_X0 + (V / cyc.Vmax) * PV_W;
  const yOfP = (P: number) => PV_Y0 + (P / Pmax) * PV_H;
  const tsTmax = () => Th * 1.1;
  const sxOf = (S: number) => TS.x0 + ((S - Smin) / (Smax - Smin)) * (TS.x1 - TS.x0);
  const tyOf = (T: number) => TS.y1 - (T / tsTmax()) * (TS.y1 - TS.y0);

  function rebuild(): void {
    cyc = buildCycle({ cycle: cycleId, Th, Tc, r, gamma: gammaOf(), regen });
    samples = sampleLoop(cyc, PER_LEG);
    area = loopAreaPV(sampleLoop(cyc, 2000));
    sGen = entropyGenerated(cyc, mode === 'fridge');
    dSgas = gasEntropyChange(cyc);
    copF = copFridge(cyc);
    copHP = copHeatPump(cyc);
    const n = samples.length / 4;
    Pmax = 0;
    Smin = Infinity;
    Smax = -Infinity;
    for (let k = 0; k < n; k++) {
      Pmax = Math.max(Pmax, samples[k * 4]);
      Smin = Math.min(Smin, samples[k * 4 + 3]);
      Smax = Math.max(Smax, samples[k * 4 + 3]);
    }
    Pmax *= 1.04;
    const sPad = 0.12 * (Smax - Smin);
    Smin -= sPad;
    Smax += sPad;
    for (let i = 0; i < 4; i++) exch[i] = exchangeOf(cyc, i);

    // Ribbon: two rows of vertices (front and back) along the closed loop
    const pos = new Float32Array((n + 1) * 2 * 3);
    const col = new Float32Array((n + 1) * 2 * 3);
    const lpos = new Float32Array(n * 3);
    const lcol = new Float32Array(n * 3);
    const c = new THREE.Color();
    const shape = new THREE.Shape();
    for (let k = 0; k <= n; k++) {
      const kk = k % n;
      const x = xOfV(samples[kk * 4 + 1]);
      const y = yOfP(samples[kk * 4]);
      c.setHex(exColor(exch[Math.floor(kk / PER_LEG)]));
      for (let s = 0; s < 2; s++) {
        const o = (k * 2 + s) * 3;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = s === 0 ? RIB / 2 : -RIB / 2;
        col[o] = c.r * (s === 0 ? 1 : 0.55);
        col[o + 1] = c.g * (s === 0 ? 1 : 0.55);
        col[o + 2] = c.b * (s === 0 ? 1 : 0.55);
      }
      if (k < n) {
        lpos[k * 3] = x;
        lpos[k * 3 + 1] = y;
        lpos[k * 3 + 2] = RIB / 2 + 0.002;
        lcol[k * 3] = Math.min(1, c.r * 1.25);
        lcol[k * 3 + 1] = Math.min(1, c.g * 1.25);
        lcol[k * 3 + 2] = Math.min(1, c.b * 1.25);
        if (k === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
    }
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = k * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, c2, b, b, c2, d);
    }
    ribbon.geometry.dispose();
    ribbon.geometry = new THREE.BufferGeometry();
    ribbon.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ribbon.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ribbon.geometry.setIndex(idx);
    ribbon.geometry.computeVertexNormals();
    edgeLine.geometry.dispose();
    edgeLine.geometry = new THREE.BufferGeometry();
    edgeLine.geometry.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    edgeLine.geometry.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    fill.geometry.dispose();
    fill.geometry = new THREE.ShapeGeometry(shape);
    fillMat.color.setHex(mode === 'engine' ? PALETTE.amber : PALETTE.cyan);

    // Direction arrows at mid-leg, and state numbers at the corners
    const g0: GasState = { P: 0, V: 0, T: 0, S: 0 };
    const g1: GasState = { P: 0, V: 0, T: 0, S: 0 };
    const cx = xOfV(0.5 * (cyc.Vmin + cyc.Vmax));
    let cy = 0;
    for (let k = 0; k < n; k++) cy += yOfP(samples[k * 4]);
    cy /= n;
    for (let i = 0; i < 4; i++) {
      legPoint(cyc, i, 0.5, g0);
      legPoint(cyc, i, 0.52, g1);
      const x0 = xOfV(g0.V), y0 = yOfP(g0.P);
      let dx = xOfV(g1.V) - x0, dy = yOfP(g1.P) - y0;
      if (mode === 'fridge') { dx = -dx; dy = -dy; }
      dirArrows[i].position.set(x0, y0, RIB / 2 + 0.05);
      dirArrows[i].rotation.set(0, 0, Math.atan2(dy, dx) - Math.PI / 2);
      const a = cyc.legs[i].a;
      const sx = xOfV(a.V), sy = yOfP(a.P);
      const ox = sx < cx ? -0.22 : 0.22;
      const oy = sy < cy ? -0.2 : 0.2;
      stateLabels[i].position.set(sx + ox, sy + oy, RIB / 2);
    }
    // Work label near the loop's middle
    wLabel.position.set(cx, cy, RIB / 2);
    wLabel.element.textContent = mode === 'engine' ? `W out = ${cyc.W.toFixed(0)} J` : `W in = ${cyc.W.toFixed(0)} J`;
    wLabel.element.style.color = css(mode === 'engine' ? PALETTE.amber : PALETTE.cyan);
    pAxisLabel.element.textContent = `pressure P (max ${(Pmax / 1.04 / 1e5).toFixed(Pmax > 1e7 ? 0 : 1)} bar)`;
    vMaxLabel.element.textContent = `${(cyc.Vmax * 1000).toFixed(1)} L`;

    // T-S inset points
    tsX = new Float32Array(n);
    tsY = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      tsX[k] = sxOf(samples[k * 4 + 3]);
      tsY[k] = tyOf(samples[k * 4 + 2]);
    }

    hot.label.element.textContent = `hot ${Th.toFixed(0)} K`;
    cold.label.element.textContent = `cold ${Tc.toFixed(0)} K`;
    const st = cycleId === 'stirling';
    regenBand.visible = st && regen;
    regenLabel.visible = st && regen;
    lastLeg = -1;
    updateReadouts();
  }

  // --- Animation state
  let phase = 0.02;
  let laps = 0;
  let carnotLaps = 0;
  let lastLeg = -1;
  const gs: GasState = { P: 0, V: 0, T: 0, S: 0 };
  let gasH = HG;

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('T–S diagram  (loop area = W)', 14, 28);
    // Axes
    ictx.strokeStyle = '#2c3852';
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.moveTo(TS.x0, TS.y0 - 6);
    ictx.lineTo(TS.x0, TS.y1);
    ictx.lineTo(TS.x1, TS.y1);
    ictx.stroke();
    ictx.fillStyle = '#56627c';
    ictx.font = '17px JetBrains Mono, monospace';
    ictx.fillText('S →', TS.x1 - 40, TS.y1 + 24);
    ictx.fillText('0', 34, TS.y1 + 4);
    // Th and Tc guides
    const yH = tyOf(Th);
    const yC = tyOf(Tc);
    ictx.setLineDash([6, 6]);
    ictx.lineWidth = 1.5;
    ictx.strokeStyle = 'rgba(255,90,74,0.55)';
    ictx.beginPath();
    ictx.moveTo(TS.x0, yH);
    ictx.lineTo(TS.x1, yH);
    ictx.stroke();
    ictx.strokeStyle = 'rgba(63,127,240,0.7)';
    ictx.beginPath();
    ictx.moveTo(TS.x0, yC);
    ictx.lineTo(TS.x1, yC);
    ictx.stroke();
    // Carnot box spanning the same entropy range
    const pad = 0.12 / 1.24;
    const sA = TS.x0 + pad * (TS.x1 - TS.x0);
    const sB = TS.x1 - pad * (TS.x1 - TS.x0);
    ictx.strokeStyle = 'rgba(223,230,243,0.35)';
    ictx.strokeRect(sA, yH, sB - sA, yC - yH);
    ictx.setLineDash([]);
    ictx.fillStyle = css(HOT);
    ictx.fillText('Th', 20, yH + 6);
    ictx.fillStyle = css(COLD);
    ictx.fillText('Tc', 20, yC + 6);
    // Loop fill
    const n = tsX.length;
    if (n < 2) return;
    ictx.fillStyle = mode === 'engine' ? 'rgba(245,182,66,0.2)' : 'rgba(79,209,232,0.2)';
    ictx.beginPath();
    ictx.moveTo(tsX[0], tsY[0]);
    for (let k = 1; k < n; k++) ictx.lineTo(tsX[k], tsY[k]);
    ictx.closePath();
    ictx.fill();
    // Loop stroke, coloured by leg
    ictx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      ictx.strokeStyle = css(exColor(exch[i]));
      ictx.beginPath();
      const k0 = i * PER_LEG;
      ictx.moveTo(tsX[k0], tsY[k0]);
      for (let k = k0 + 1; k <= k0 + PER_LEG; k++) {
        const kk = k % n;
        ictx.lineTo(tsX[kk], tsY[kk]);
      }
      ictx.stroke();
    }
    // Marker
    ictx.fillStyle = '#ffffff';
    ictx.beginPath();
    ictx.arc(sxOf(gs.S), tyOf(gs.T), 7, 0, Math.PI * 2);
    ictx.fill();
    ictx.fillStyle = '#56627c';
    ictx.fillText(cycleId === 'carnot' ? 'Carnot: a rectangle' : 'dashed: Carnot box', TS.x0 + 6, 290);
  }

  const fmtJ = (v: number) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
  const fmtS = (v: number) => (Math.abs(v) < 5e-5 ? '0' : v.toFixed(3));

  function legText(i: number): string {
    const e = exch[i];
    if (e === 'regen') return 'The regenerator swaps heat inside the engine. No reservoir is involved.';
    if (e === 'none') return 'Insulated. No heat flows, so the temperature changes only through work.';
    if (mode === 'engine') return e === 'hot' ? 'The hot reservoir gives heat to the gas.' : 'The gas gives heat to the cold reservoir.';
    return e === 'hot' ? 'The gas gives heat to the hot reservoir.' : 'The gas takes heat from the cold reservoir.';
  }

  function drawLegend(li: number): void {
    const l = cyc.legs[li];
    const fr = mode === 'fridge';
    const from = fr ? ((li + 1) % 4) + 1 : li + 1;
    const to = fr ? li + 1 : ((li + 1) % 4) + 1;
    const name = fr ? reverseName(l.name) : l.name;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600">${CYCLE_NAMES[cycleId]} ${fr ? 'fridge (run backwards)' : 'engine'}</div>
<div style="margin-top:3px"><span style="color:${css(exColor(exch[li]))};font-weight:600">${from}→${to}</span> ${name}.</div>
<div>${legText(li)}</div>
<div style="margin-top:3px;color:#8391ab">Shaded loop area = ${fr ? 'work put in' : 'work out'}.</div>`;
  }

  function drawLedger(li: number): void {
    const fr = mode === 'fridge';
    const sg = fr ? -1 : 1;
    const order = fr ? [3, 2, 1, 0] : [0, 1, 2, 3];
    const cell = (s: string, w: number, c = '#dfe6f3') => `<span style="display:inline-block;width:${w}px;text-align:right;color:${c}">${s}</span>`;
    let rows = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Per-leg ledger <span style="color:#56627c;font-weight:400">(J, J/K)</span></div>
<div style="color:#56627c">${cell('leg', 36, '#56627c')}${cell('Q in', 60, '#56627c')}${cell('W out', 60, '#56627c')}${cell('ΔS gas', 66, '#56627c')}</div>`;
    let sQ = 0, sW = 0, sS = 0;
    for (const i of order) {
      const l = cyc.legs[i];
      const from = fr ? ((i + 1) % 4) + 1 : i + 1;
      const to = fr ? i + 1 : ((i + 1) % 4) + 1;
      const q = sg * l.Q, w = sg * l.W, s = sg * l.dS;
      sQ += q;
      sW += w;
      sS += s;
      const on = i === li;
      rows += `<div style="${on ? 'background:rgba(79,209,232,0.12);border-radius:4px' : ''}">${cell(`${from}→${to}`, 36, css(exColor(exch[i])))}${cell(fmtJ(q), 60)}${cell(fmtJ(w), 60)}${cell(fmtS(s), 66)}</div>`;
    }
    rows += `<div style="border-top:1px solid #243049;margin-top:2px">${cell('Σ', 36, '#8391ab')}${cell(fmtJ(sQ), 60)}${cell(fmtJ(sW), 60)}${cell(fmtS(sS), 66)}</div>`;
    const a = sg * area;
    const gap = Math.abs(a - sW) / Math.max(1e-12, Math.abs(sW));
    rows += `<div style="margin-top:4px">loop area ∮P dV = <span style="color:#dfe6f3">${a.toFixed(1)} J</span></div>
<div>gap to Σ W: <span style="color:${css(PALETTE.green)}">${gap < 1e-5 ? '✓ ' : ''}${gap.toExponential(0)}</span></div>`;
    ledger.innerHTML = rows;
  }

  function placeReservoirDots(res: Reservoir, t: number, active: boolean, inward: boolean): void {
    res.dots.visible = active;
    if (!active) return;
    const side = res.x < CX ? -1 : 1;
    const inner = CX + side * (RC + 0.05);
    const outer = res.x - side * 0.35;
    for (let k = 0; k < DOTS; k++) {
      let f = (k / DOTS + t * 0.9) % 1;
      if (!inward) f = 1 - f;
      res.dotPos[k * 3] = outer + (inner - outer) * f;
      res.dotPos[k * 3 + 1] = BASE - 0.11 + 0.05 * Math.sin(k * 2.1 + t * 3);
      res.dotPos[k * 3 + 2] = 0.2 * Math.sin(k * 1.7);
    }
    (res.dots.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Frame loop
  let insetTimer = 0;
  let uiTimer = 0;
  const cPlate = new THREE.Color();
  const cHot = new THREE.Color(HOT);
  const cCold = new THREE.Color(COLD);
  const cRegen = new THREE.Color(REGEN);
  const cNone = new THREE.Color(0x000000);
  stage.onFrame((dt, time) => {
    if (playing) {
      const d = (dt * speed) / LEG_T;
      if (mode === 'engine') {
        phase += d;
        if (phase >= 4) {
          phase -= 4;
          laps++;
          if (cycleId === 'carnot') carnotLaps++;
        }
      } else {
        phase -= d;
        if (phase < 0) {
          phase += 4;
          laps++;
          if (cycleId === 'carnot') carnotLaps++;
        }
      }
    }
    const li = Math.min(3, Math.floor(phase));
    legPoint(cyc, li, phase - li, gs);
    if (li !== lastLeg) {
      lastLeg = li;
      drawLegend(li);
      drawLedger(li);
    }

    // Marker on the ribbon
    marker.position.set(xOfV(gs.V), yOfP(gs.P), RIB / 2 + 0.02);

    // Piston
    gasH = HG * (gs.V / cyc.Vmax);
    piston.position.y = gasH;

    // Gas particles: speed follows sqrt(T), colour follows T between Tc and Th
    const vs = 1.1 * Math.sqrt(gs.T / 300) * Math.min(dt, 0.05) * (0.4 + 0.6 * Math.min(speed, 2));
    const top = Math.max(0.02, gasH - 0.04);
    const rMax = RC - 0.06;
    const tu = (gs.T - Tc) / Math.max(1, Th - Tc);
    for (let i = 0; i < NP; i++) {
      const o = i * 3;
      let x = pPos[o] + pVel[o] * pF[i] * vs;
      let y = pPos[o + 1] + pVel[o + 1] * pF[i] * vs;
      let z = pPos[o + 2] + pVel[o + 2] * pF[i] * vs;
      if (y < 0.02) { y = 0.02; pVel[o + 1] = Math.abs(pVel[o + 1]); }
      if (y > top) { y = top - (y > top + 0.05 ? rnd() * Math.min(0.2, top) : 0); pVel[o + 1] = -Math.abs(pVel[o + 1]); }
      const rr = x * x + z * z;
      if (rr > rMax * rMax) {
        const rq = Math.sqrt(rr);
        const nx = x / rq, nz = z / rq;
        const vn = pVel[o] * nx + pVel[o + 2] * nz;
        if (vn > 0) {
          pVel[o] -= 2 * vn * nx;
          pVel[o + 2] -= 2 * vn * nz;
        }
        x = nx * rMax;
        z = nz * rMax;
      }
      pPos[o] = x;
      pPos[o + 1] = Math.max(0.02, y);
      pPos[o + 2] = z;
      const u = Math.min(1, Math.max(0, 0.1 + 0.8 * tu + 0.22 * (pF[i] - 0.92)));
      const k = 3 * Math.round(u * (LUT_N - 1));
      pCol[o] = lut[k];
      pCol[o + 1] = lut[k + 1];
      pCol[o + 2] = lut[k + 2];
    }
    (pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Reservoir contacts
    const e = exch[li];
    const heatIn = (mode === 'engine') === (e === 'hot');
    const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    for (const [res, on] of [[hot, e === 'hot'], [cold, e === 'cold']] as [Reservoir, boolean][]) {
      res.level += ((on ? 1 : 0) - res.level) * Math.min(1, dt * 6);
      res.mat.emissiveIntensity = 0.18 + 0.9 * res.level * pulse;
      res.glowMat.opacity = 0.18 + 0.6 * res.level * pulse;
      res.glow.scale.setScalar(1.8 + 0.8 * res.level);
      res.bridgeMat.emissiveIntensity = 1.1 * res.level * pulse;
      placeReservoirDots(res, time, on && playing, heatIn);
    }
    const target = e === 'hot' ? cHot : e === 'cold' ? cCold : e === 'regen' ? cRegen : cNone;
    cPlate.lerp(target, Math.min(1, dt * 6));
    plateMat.emissive.copy(cPlate);
    plateMat.emissiveIntensity = 0.7;
    regenMat.emissiveIntensity = e === 'regen' ? 0.5 + 0.4 * pulse : 0.12;

    insetTimer += dt;
    if (insetTimer > 0.066) {
      insetTimer = 0;
      drawInset();
    }
    uiTimer += dt;
    if (uiTimer > 0.2) {
      uiTimer = 0;
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Restart cycle', onClick: () => { phase = mode === 'engine' ? 0.001 : 3.999; laps = 0; carnotLaps = 0; lastLeg = -1; } },
  ]);
  ui.slider({ key: 'speed', label: 'Speed', min: 0.2, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Cycle');
  let regenCtl: { el: HTMLElement } | null = null;
  ui.select<CycleId>({
    key: 'cycle', label: 'Cycle', value: cycleId,
    options: [{ value: 'carnot', label: 'Carnot' }, { value: 'otto', label: 'Otto' }, { value: 'stirling', label: 'Stirling' }, { value: 'diesel', label: 'Diesel' }],
    onChange: (v) => {
      cycleId = v;
      carnotLaps = 0;
      if (regenCtl) regenCtl.el.style.opacity = v === 'stirling' ? '1' : '0.45';
      rebuild();
    },
  });
  ui.select<Mode>({
    key: 'mode', label: 'Mode', value: mode,
    options: [{ value: 'engine', label: 'Engine' }, { value: 'fridge', label: 'Fridge / heat pump' }],
    onChange: (v) => { mode = v; rebuild(); },
  });
  regenCtl = ui.toggle({ key: 'regen', label: 'Ideal regenerator (Stirling)', value: regen, onChange: (v) => { regen = v; rebuild(); } });
  regenCtl.el.style.opacity = '0.45';
  ui.select<GammaId>({
    key: 'gamma', label: 'Gas γ', value: gammaId,
    options: [{ value: 'mono', label: 'Monatomic 5/3' }, { value: 'di', label: 'Diatomic 7/5 (air)' }],
    onChange: (v) => { gammaId = v; rebuild(); },
  });
  ui.slider({ key: 'r', label: 'Compression ratio r', min: 1.5, max: 40, step: 0.5, value: r, format: (v) => v.toFixed(1), onInput: (v) => { r = v; rebuild(); } });
  const rNote = ui.note('');

  ui.section('Reservoirs');
  let tcCtl: { set(v: number, emit?: boolean): void } | null = null;
  const thCtl = ui.slider({
    key: 'Th', label: 'Hot Th', min: 300, max: 2000, step: 10, value: Th, unit: 'K',
    onInput: (v) => { Th = v; if (Tc > Th - 20) { Tc = Th - 20; tcCtl?.set(Tc, false); } rebuild(); },
  });
  tcCtl = ui.slider({
    key: 'Tc', label: 'Cold Tc', min: 150, max: 900, step: 10, value: Tc, unit: 'K',
    onInput: (v) => { Tc = v; if (Th < Tc + 20) { Th = Tc + 20; thCtl.set(Th, false); } rebuild(); },
  });

  ui.section('Efficiency');
  const rEta = ui.readout('eta', 'η = W / Q_h');
  const rEtaC = ui.readout('etaC', 'Carnot limit');
  const rEtaCA = ui.readout('etaCA', 'Curzon–Ahlborn');
  const rCop = ui.readout('copF', 'COP fridge');
  const rCopHP = ui.readout('copHP', 'COP heat pump');
  const rCopC = ui.readout('copC', 'Carnot COP');
  ui.section('Energy and entropy per cycle');
  const rW = ui.readout('W', 'net work W', 'J');
  const rArea = ui.readout('area', 'loop area', 'J');
  const rQin = ui.readout('Qin', 'Q_h (hot side)', 'J');
  const rQout = ui.readout('Qout', 'Q_c (cold side)', 'J');
  const rDS = ui.readout('dSgas', 'Σ ΔS gas', 'J/K');
  const rSgen = ui.readout('sgen', 'entropy made', 'J/K');
  ui.section('Gas now');
  const rT = ui.readout('T', 'temperature', 'K');
  const rP = ui.readout('P', 'pressure', 'bar');
  const rV = ui.readout('V', 'volume', 'L');
  const rR = ui.readout('rEff', 'r used');
  ui.legend([
    { color: css(HOT), label: 'hot contact' },
    { color: css(COLD), label: 'cold contact' },
    { color: css(ADIA), label: 'insulated (adiabat)' },
    { color: css(REGEN), label: 'regenerator' },
  ]);

  let noteText = '';
  function updateReadouts(): void {
    const fr = mode === 'fridge';
    rEta(fr ? '–' : cyc.eta.toFixed(3));
    rEtaC(cyc.etaCarnot.toFixed(3));
    rEtaCA(curzonAhlbornEta(Th, Tc).toFixed(3));
    rCop(fr ? copF.toFixed(2) : '–');
    rCopHP(fr ? copHP.toFixed(2) : '–');
    rCopC(fr ? `${carnotCopFridge(Th, Tc).toFixed(2)} / ${carnotCopHeatPump(Th, Tc).toFixed(2)}` : '–');
    rW((fr ? -cyc.W : cyc.W).toFixed(1));
    rArea(((fr ? -1 : 1) * area).toFixed(1));
    rQin(cyc.Qin.toFixed(1));
    rQout(cyc.Qout.toFixed(1));
    rDS(Math.abs(dSgas) < 1e-12 ? '0 (< 1e-12)' : dSgas.toExponential(1));
    rSgen(Math.abs(sGen) < 1e-10 ? '0' : sGen.toFixed(4));
    rT(gs.T.toFixed(0));
    rP((gs.P / 1e5).toFixed(2));
    rV((gs.V * 1000).toFixed(3));
    rR(cyc.rEff.toFixed(2));
    let note: string;
    if (cyc.rRaised) note = `Carnot’s adiabats alone need r = ${(cyc.rEff / MIN_ISO_RATIO).toFixed(1)} here. r is raised to ${cyc.rEff.toFixed(1)} to leave room for the isotherms.`;
    else if (cyc.rCapped) note = `Capped at r = ${cyc.rEff.toFixed(1)}: more compression would heat the gas past 85% of the way to Th before any fuel burns.`;
    else note = cycleId === 'carnot' ? 'r is the full volume ratio. The adiabats use part of it, the isotherms the rest.' : 'r = V_max / V_min, the full stroke.';
    if (note !== noteText) {
      rNote.textContent = note;
      noteText = note;
    }
  }

  rebuild();
  legPoint(cyc, 0, phase, gs);
  drawInset();

  return {
    state: () => ({
      cycle: cycleId,
      mode,
      Th,
      Tc,
      r,
      rEff: cyc.rEff,
      rCapped: cyc.rCapped,
      gamma: gammaOf(),
      regen,
      eta: cyc.eta,
      etaC: cyc.etaCarnot,
      etaCA: curzonAhlbornEta(Th, Tc),
      W: cyc.W,
      area,
      Qin: cyc.Qin,
      Qout: cyc.Qout,
      copF: mode === 'fridge' ? copF : 0,
      copHP: mode === 'fridge' ? copHP : 0,
      dSgas,
      sgen: sGen,
      laps,
      carnotLaps,
      T: gs.T,
      P: gs.P,
      V: gs.V,
    }),
    dispose: () => {
      info.remove();
      inset.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'carnot-engines',
  number: 42,
  title: 'Heat Engines & Carnot',
  domain: 'thermo',
  level: 1,
  status: 'live',
  tagline: 'Why no engine can turn all its heat into work.',
  content,
  mount,
};

export default topic;
