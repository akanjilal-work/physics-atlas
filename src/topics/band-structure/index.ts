import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  GAP_ZERO, GRAPHENE, HB2M, KB, NBANDS,
  bandCurvature, bandEdges, bandEnergy, blochWave, diracK, effMassFromCurvature, fermi, fill, grapheneE,
  groupVelocity, intrinsicCarriers, reduceK, type Filling, type KPParams,
} from './physics.ts';

type View = 'lattice' | 'bands';
type Preset = 'metal' | 'semiconductor' | 'insulator' | 'graphene' | 'custom';

// --- Lattice view geometry
const SX = 0.3; // scene units per Å
const SPAN = 40; // Å of crystal shown
const MAXC = 11; // max cells
const SPC = 72; // helix samples per cell
const MAXP = MAXC * SPC + 1;
const Y0 = -1.7; // scene height of E = 0
const HMAX = 4.0; // scene height available for energies
const DZ = 1.1; // half depth of barrier blocks
const RH = 0.8; // helix radius for max |ψ|
const OMEGA = 0.9; // visual phase rotation rate (rad/s), slowed down

// --- Band view geometry
const G = 97; // surface grid
const KSPAN = 3; // half width of the k plane in scene units
const EHEIGHT = 3.6; // scene height of the plotted energy range

const CAM_LAT: [number, number, number] = [-2.4, 3.4, 14.6];
const TGT_LAT: [number, number, number] = [0.6, 0.55, 0];
const CAM_BAND: [number, number, number] = [7.6, 5.4, 9.6];
const TGT_BAND: [number, number, number] = [0, -0.2, 0];

const PRESETS: Record<'metal' | 'semiconductor' | 'insulator', { V0: number; a: number; b: number; N: number }> = {
  metal: { V0: 4, a: 5, b: 1, N: 1 },
  semiconductor: { V0: 3.3, a: 5, b: 1, N: 2 }, // lowest gap 1.11 eV, close to silicon's 1.12 eV
  insulator: { V0: 10.5, a: 4, b: 1.6, N: 2 }, // lowest gap 5.49 eV, close to diamond's ~5.5 eV
};

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

function dynAttr(arr: Float32Array, n: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
}

function fmtE(E: number): string {
  return Math.abs(E) < 0.01 ? E.toExponential(1) : E.toFixed(Math.abs(E) < 10 ? 3 : 2);
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_LAT, target: TGT_LAT, fov: 42 });
  const { scene } = stage;

  // --- State
  const p: KPParams = { V0: PRESETS.semiconductor.V0, a: PRESETS.semiconductor.a, b: PRESETS.semiconductor.b };
  let N = PRESETS.semiconductor.N;
  let T = 300;
  let kSlider = 0.35; // in units of π/a (π/a_graphene in graphene mode)
  let band = 1;
  let view: View = 'lattice';
  let preset: Preset = 'semiconductor';

  let edges: number[] = [];
  let filling: Filling = { band: 1, partial: false, EF: 0, gap: 0, cls: 'metal' };
  let gap1 = 0;
  let E = 0;
  let kRed = 0;
  let resid = 0;
  let mStar = 0;
  let vg = 0;
  let diracE = 99;
  let nCarriers = 0;
  let cells = 7;
  let SY = 1;

  // ===================== Lattice view =====================
  const lat = new THREE.Group();
  scene.add(lat);
  const grid = makeGrid(16, 32);
  grid.position.y = Y0 - 0.02;
  lat.add(grid);

  // Barrier blocks: a pool of unit boxes, scaled in place
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitEdges = new THREE.EdgesGeometry(unitBox);
  const blockMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const blockEdgeMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.85 });
  const blocks: THREE.Mesh[] = [];
  const blockEdges: THREE.LineSegments[] = [];
  for (let i = 0; i <= MAXC; i++) {
    const m = new THREE.Mesh(unitBox, blockMat);
    m.renderOrder = 1;
    lat.add(m);
    blocks.push(m);
    const e = new THREE.LineSegments(unitEdges, blockEdgeMat);
    lat.add(e);
    blockEdges.push(e);
  }
  const vLabel = stage.label('V₀', [0, 0, DZ], 'big', lat);
  vLabel.element.style.color = css(PALETTE.violet);

  // Band shelves on the back wall: 5 bands plus one extra for a split partial band
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const shelves: THREE.Mesh[] = [];
  for (let i = 0; i < NBANDS + 1; i++) {
    const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    m.position.z = -DZ - 0.03;
    lat.add(m);
    shelves.push(m);
  }
  const bandLabels = Array.from({ length: NBANDS }, (_, i) => stage.label(`band ${i + 1}`, [0, 0, -DZ], 'muted', lat));
  const gapLabel = stage.label('', [0, 0, -DZ], '', lat);
  gapLabel.element.style.color = css(PALETTE.amber);

  // Fermi level line on the back wall
  const efGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0], 3));
  const efLine = new THREE.LineSegments(efGeo, new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.02, gapSize: 0.012 }));
  efLine.computeLineDistances();
  efLine.position.z = -DZ - 0.01;
  lat.add(efLine);
  const efLabel = stage.label('E_F', [0, 0, -DZ], '', lat);
  efLabel.element.style.color = css(PALETTE.amber);

  // Lattice-constant bracket
  const brGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, -0.12, 0, 0, 0.12, 0, 1, -0.12, 0, 1, 0.12, 0], 3));
  const bracket = new THREE.LineSegments(brGeo, new THREE.LineBasicMaterial({ color: 0x9aa6bd }));
  bracket.position.set(0, Y0 - 0.45, DZ);
  lat.add(bracket);
  const aLabel = stage.label('a', [0, Y0 - 0.75, DZ], 'muted', lat);

  // Helix: ribbon from the axis out to (Re ψ, Im ψ), plus its bright edge
  const helix = new THREE.Group();
  lat.add(helix);
  const xsA = new Float64Array(MAXP); // physics x (Å)
  const xsS = new Float32Array(MAXP); // scene x
  const psiRe = new Float64Array(MAXP);
  const psiIm = new Float64Array(MAXP);
  const phase = new Float32Array(MAXP);
  const mag = new Float32Array(MAXP);
  const ribPos = new Float32Array(MAXP * 6);
  const ribCol = new Float32Array(MAXP * 6);
  const ribGeo = new THREE.BufferGeometry();
  const ribPosAttr = dynAttr(ribPos, 3);
  const ribColAttr = dynAttr(ribCol, 3);
  ribGeo.setAttribute('position', ribPosAttr);
  ribGeo.setAttribute('color', ribColAttr);
  ribGeo.setIndex(stripIndex(MAXP));
  const ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
  ribbon.frustumCulled = false;
  helix.add(ribbon);
  const edgePos = new Float32Array(MAXP * 3);
  const edgeCol = new Float32Array(MAXP * 3);
  const edgeGeo = new THREE.BufferGeometry();
  const edgePosAttr = dynAttr(edgePos, 3);
  const edgeColAttr = dynAttr(edgeCol, 3);
  edgeGeo.setAttribute('position', edgePosAttr);
  edgeGeo.setAttribute('color', edgeColAttr);
  const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  edge.frustumCulled = false;
  helix.add(edge);
  const axisGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0], 3));
  const axis = new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  lat.add(axis);
  const stateLabel = stage.label('', [0, 0, 0], '', lat);

  // |ψ|² glow on the floor
  const denPos = new Float32Array(MAXP * 6);
  const denCol = new Float32Array(MAXP * 6);
  const denGeo = new THREE.BufferGeometry();
  const denPosAttr = dynAttr(denPos, 3);
  const denColAttr = dynAttr(denCol, 3);
  denGeo.setAttribute('position', denPosAttr);
  denGeo.setAttribute('color', denColAttr);
  denGeo.setIndex(stripIndex(MAXP));
  const density = new THREE.Mesh(denGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  density.position.y = Y0 + 0.005;
  density.frustumCulled = false;
  lat.add(density);
  let nPts = 0;

  const yE = (e: number) => Y0 + e * SY;

  function buildLattice(): void {
    cells = Math.max(7, Math.min(MAXC, Math.floor(SPAN / p.a)));
    if (cells % 2 === 0) cells -= 1;
    const L = cells * p.a;
    const cx = L / 2;
    const w = p.a - p.b;
    // Energy scale: show bands up to the highest one that matters
    const nb = Math.min(NBANDS, Math.max(band, filling.band + 1));
    const eTop = Math.max(p.V0, edges[2 * nb - 1] ?? p.V0) * 1.06;
    SY = HMAX / Math.max(0.5, eTop);
    const hV = Math.max(0.001, p.V0 * SY);
    for (let i = 0; i <= MAXC; i++) {
      const show = i <= cells && p.V0 > 0;
      blocks[i].visible = show;
      blockEdges[i].visible = show;
      if (!show) continue;
      const x0 = (i === 0 ? -p.b : (i - 1) * p.a + w) - cx; // barrier 0 closes the left end
      const xm = (x0 + p.b / 2) * SX;
      blocks[i].scale.set(p.b * SX, hV, 2 * DZ);
      blocks[i].position.set(xm, Y0 + hV / 2, 0);
      blockEdges[i].scale.copy(blocks[i].scale);
      blockEdges[i].position.copy(blocks[i].position);
    }
    vLabel.visible = p.V0 > 0;
    vLabel.position.set((-p.b / 2 - cx) * SX, Y0 + hV + 0.3, DZ);
    vLabel.element.textContent = `V₀ = ${p.V0.toFixed(1)} eV`;
    // Shelves
    const xl = (-p.b - cx) * SX - 0.2;
    const xr = (L - cx) * SX + 0.2;
    const sw = xr - xl;
    let s = 0;
    const fillEdge = (e0: number, e1: number, occ: boolean) => {
      const m = shelves[s++];
      const h = Math.max(0.012, (e1 - e0) * SY);
      m.visible = true;
      m.scale.set(sw, h, 1);
      m.position.set((xl + xr) / 2, yE(e0) + h / 2, -DZ - 0.03);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setHex(occ ? PALETTE.cyan : PALETTE.green);
      mat.opacity = occ ? 0.3 : 0.14;
    };
    for (let n = 1; n <= NBANDS; n++) {
      const e0 = edges[2 * n - 2];
      const e1 = edges[2 * n - 1];
      const lab = bandLabels[n - 1];
      if (n > nb || e0 === undefined) { lab.visible = false; continue; }
      if (n < filling.band || (n === filling.band && !filling.partial)) fillEdge(e0, e1, true);
      else if (n === filling.band) { fillEdge(e0, filling.EF, true); fillEdge(filling.EF, e1, false); }
      else fillEdge(e0, e1, false);
      lab.visible = true;
      lab.position.set(xr + 0.55, yE((e0 + e1) / 2), -DZ);
    }
    for (; s < shelves.length; s++) shelves[s].visible = false;
    // Fermi line and gap label
    efLine.scale.set(sw, 1, 1);
    efLine.position.set((xl + xr) / 2, yE(filling.EF), -DZ - 0.01);
    efLabel.position.set(xl - 0.4, yE(filling.EF), -DZ);
    gapLabel.visible = !filling.partial && filling.gap >= GAP_ZERO;
    gapLabel.position.set(xr + 0.8, yE(filling.EF), -DZ);
    gapLabel.element.textContent = `gap ${filling.gap.toFixed(2)} eV`;
    // Bracket over the first full cell
    bracket.position.x = (-cx) * SX;
    bracket.scale.set(p.a * SX, 1, 1);
    aLabel.position.set((p.a / 2 - cx) * SX, Y0 - 0.72, DZ);
    aLabel.element.textContent = `a = ${p.a.toFixed(1)} Å`;
    // Axis and sample positions
    axis.scale.set((L / 2) * SX + 0.3, 1, 1);
    nPts = cells * SPC + 1;
    for (let j = 0; j < nPts; j++) {
      xsA[j] = (j / (nPts - 1)) * L;
      xsS[j] = (xsA[j] - cx) * SX;
    }
    ribGeo.setDrawRange(0, (nPts - 1) * 6);
    denGeo.setDrawRange(0, (nPts - 1) * 6);
    edgeGeo.setDrawRange(0, nPts);
  }

  function buildWave(): void {
    resid = blochWave(p, E, kRed, xsA, psiRe, psiIm, nPts);
    for (let j = 0; j < nPts; j++) {
      const a = psiRe[j], b = psiIm[j];
      const m = Math.hypot(a, b);
      mag[j] = m;
      phase[j] = Math.atan2(b, a);
      const o = j * 6;
      ribPos[o] = xsS[j]; ribPos[o + 1] = 0; ribPos[o + 2] = 0;
      ribPos[o + 3] = xsS[j]; ribPos[o + 4] = a * RH; ribPos[o + 5] = b * RH;
      edgePos[j * 3] = xsS[j]; edgePos[j * 3 + 1] = a * RH; edgePos[j * 3 + 2] = b * RH;
      const d = m * m;
      const wd = 0.04 + d * 0.5;
      denPos[o] = xsS[j]; denPos[o + 1] = 0; denPos[o + 2] = -wd;
      denPos[o + 3] = xsS[j]; denPos[o + 4] = 0; denPos[o + 5] = wd;
      const c = 0.04 + 0.3 * d;
      denCol[o] = denCol[o + 3] = 0.31 * c;
      denCol[o + 1] = denCol[o + 4] = 0.82 * c;
      denCol[o + 2] = denCol[o + 5] = 0.91 * c;
    }
    ribPosAttr.needsUpdate = true;
    edgePosAttr.needsUpdate = true;
    denPosAttr.needsUpdate = true;
    denColAttr.needsUpdate = true;
    helix.position.y = yE(E);
    axis.position.y = yE(E);
    stateLabel.position.set(xsS[nPts - 1] - 1.8, Y0 - 0.72, DZ);
    stateLabel.element.textContent = `ψ: band ${band}, E = ${E.toFixed(2)} eV`;
    paintHelix(0);
  }

  let phaseT = 0;
  function paintHelix(th: number): void {
    helix.rotation.x = th;
    for (let j = 0; j < nPts; j++) {
      const hue = (phase[j] + th) / (2 * Math.PI) + 1;
      const bright = Math.min(1, 0.3 + mag[j]);
      const o = j * 6;
      hueInto(hue, bright, ribCol, o + 3);
      hueInto(hue, bright * 0.25, ribCol, o);
      hueInto(hue, 1, edgeCol, j * 3);
    }
    ribColAttr.needsUpdate = true;
    edgeColAttr.needsUpdate = true;
  }

  // ===================== Band-surface view =====================
  const bandsG = new THREE.Group();
  scene.add(bandsG);
  const NV = G * G;
  const surfIdx: number[] = [];
  for (let i = 0; i < G - 1; i++) {
    for (let j = 0; j < G - 1; j++) {
      const a = i * G + j, b = a + 1, c = a + G, d = c + 1;
      surfIdx.push(a, c, b, b, c, d);
    }
  }
  interface Surface { mesh: THREE.Mesh; pos: Float32Array; col: Float32Array; en: Float32Array; posAttr: THREE.BufferAttribute; colAttr: THREE.BufferAttribute }
  const makeSurface = (opacity: number): Surface => {
    const pos = new Float32Array(NV * 3);
    const col = new Float32Array(NV * 3);
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const colAttr = new THREE.BufferAttribute(col, 3);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    geo.setIndex(surfIdx);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, transparent: opacity < 1, opacity });
    const mesh = new THREE.Mesh(geo, mat);
    bandsG.add(mesh);
    return { mesh, pos, col, en: new Float32Array(NV), posAttr, colAttr };
  };
  const lower = makeSurface(1);
  const upper = makeSurface(0.92);

  const efPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
  efPlane.rotation.x = -Math.PI / 2;
  efPlane.scale.set(2 * KSPAN + 0.6, 2 * KSPAN + 0.6, 1);
  efPlane.renderOrder = 2;
  bandsG.add(efPlane);
  const efRimGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  const efRim = new THREE.LineLoop(efRimGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8 }));
  efRim.scale.set(KSPAN + 0.3, 1, KSPAN + 0.3);
  bandsG.add(efRim);
  const efBandLabel = stage.label('Fermi level E_F', [KSPAN + 0.3, 0, KSPAN + 0.3], '', bandsG);
  efBandLabel.element.style.color = css(PALETTE.amber);

  // ky = 0 cut lines (the slice shown in the corner plot)
  const cutPos = [new Float32Array(G * 3), new Float32Array(G * 3)];
  const cutLines = cutPos.map((arr) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.85 }));
    l.frustumCulled = false;
    bandsG.add(l);
    return l;
  });

  // Axes
  const axGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    -KSPAN - 0.3, 0, KSPAN + 0.3, KSPAN + 0.7, 0, KSPAN + 0.3,
    -KSPAN - 0.3, 0, KSPAN + 0.3, -KSPAN - 0.3, 0, -KSPAN - 0.7,
    -KSPAN - 0.3, 0, KSPAN + 0.3, -KSPAN - 0.3, EHEIGHT + 0.6, KSPAN + 0.3,
  ], 3));
  const axes = new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  bandsG.add(axes);
  const kxLabel = stage.label('kx', [KSPAN + 0.95, 0, KSPAN + 0.3], 'muted', axes);
  stage.label('ky', [-KSPAN - 0.3, 0, -KSPAN - 0.95], 'muted', axes);
  stage.label('E', [-KSPAN - 0.3, EHEIGHT + 0.85, KSPAN + 0.3], 'muted', axes);
  const gammaLabel = stage.label('Γ', [0, 0, 0], 'muted', bandsG);
  const lowLabel = stage.label('', [0, 0, 0], 'muted', bandsG);
  const upLabel = stage.label('', [0, 0, 0], 'muted', bandsG);
  const kLabel = stage.label('K', [0, 0, 0], '', bandsG);

  // Markers for the current k on the surfaces
  const markerGeo = new THREE.SphereGeometry(0.09, 16, 12);
  const markerA = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: PALETTE.white }));
  const markerB = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: PALETTE.white }));
  bandsG.add(markerA, markerB);

  // Thermal sparkles: electrons (cyan) above the gap, holes (rose) below
  const MAXS = 12;
  const spkPos = new Float32Array(MAXS * 2 * 3);
  const spkCol = new Float32Array(MAXS * 2 * 3);
  const spkBase = new Float32Array(MAXS * 2 * 3);
  const spkPhase = new Float32Array(MAXS * 2);
  const spkGeo = new THREE.BufferGeometry();
  const spkPosAttr = dynAttr(spkPos, 3);
  const spkColAttr = dynAttr(spkCol, 3);
  spkGeo.setAttribute('position', spkPosAttr);
  spkGeo.setAttribute('color', spkColAttr);
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const sparkles = new THREE.Points(spkGeo, new THREE.PointsMaterial({ size: 0.7, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparkles.frustumCulled = false;
  bandsG.add(sparkles);
  let nSpark = 0;

  // Band-surface bookkeeping
  let U = 1; // half range of u = k a / π
  let KS = KSPAN; // scene units per unit u
  let Emid = 0;
  let ES = 1;
  let EF2 = 0;
  let lowN = 1;
  const yB = (e: number) => (e - Emid) * ES;
  interface TB { eps: number; t: number; s: number }
  const tbL: TB = { eps: 0, t: 0, s: 1 };
  const tbU: TB = { eps: 0, t: 0, s: 1 };
  const setTB = (n: number, out: TB) => {
    const e0 = edges[2 * n - 2], e1 = edges[2 * n - 1];
    out.eps = 0.5 * (e0 + e1);
    out.t = (e1 - e0) / 8;
    out.s = n % 2 === 1 ? 1 : -1; // odd bands have their bottom at k = 0
  };
  const tbE = (tb: TB, u: number, v: number) => tb.eps - 2 * tb.s * tb.t * (Math.cos(Math.PI * u) + Math.cos(Math.PI * v));
  const graphK = () => Math.PI / GRAPHENE.a; // unit for u in graphene mode

  function surfaceEnergy(which: 0 | 1, u: number, v: number): number {
    if (preset === 'graphene') {
      const e = grapheneE(u * graphK(), v * graphK());
      return which === 0 ? -e : e;
    }
    return tbE(which === 0 ? tbL : tbU, u, v);
  }

  function buildSurfaces(): void {
    const gr = preset === 'graphene';
    U = gr ? 1.45 : 1;
    KS = KSPAN / U;
    if (gr) {
      Emid = 0;
      ES = EHEIGHT / (6 * GRAPHENE.t);
      EF2 = 0;
    } else {
      lowN = filling.band;
      setTB(lowN, tbL);
      setTB(lowN + 1, tbU);
      const lo = edges[2 * lowN - 2], hi = edges[2 * lowN + 1];
      Emid = 0.5 * (lo + hi);
      ES = EHEIGHT / Math.max(0.2, hi - lo);
      // Square lattice: half filling sits exactly at the band centre. A full band puts E_F mid-gap.
      EF2 = filling.partial ? tbL.eps : filling.EF;
    }
    const surfs = [lower, upper];
    for (let w = 0; w < 2; w++) {
      const S = surfs[w];
      for (let i = 0; i < G; i++) {
        const v = -U + (2 * U * i) / (G - 1);
        for (let j = 0; j < G; j++) {
          const u = -U + (2 * U * j) / (G - 1);
          const e = surfaceEnergy(w as 0 | 1, u, v);
          const q = i * G + j;
          S.en[q] = e;
          S.pos[q * 3] = u * KS;
          S.pos[q * 3 + 1] = yB(e);
          S.pos[q * 3 + 2] = -v * KS;
        }
      }
      S.posAttr.needsUpdate = true;
      S.mesh.geometry.computeVertexNormals();
      S.mesh.geometry.computeBoundingSphere();
      // cut line along v = 0
      const arr = cutPos[w];
      for (let j = 0; j < G; j++) {
        const u = -U + (2 * U * j) / (G - 1);
        const e = surfaceEnergy(w as 0 | 1, u, 0);
        arr[j * 3] = u * KS;
        arr[j * 3 + 1] = yB(e) + 0.02;
        arr[j * 3 + 2] = 0;
      }
      (cutLines[w].geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    efPlane.position.y = yB(EF2);
    efRim.position.y = yB(EF2);
    efBandLabel.position.set(KSPAN + 0.3, yB(EF2), KSPAN + 0.3);
    const yBottom = yB(gr ? -3 * GRAPHENE.t : edges[2 * lowN - 2]) - 0.35;
    axes.position.y = yBottom;
    gammaLabel.position.set(0, yBottom, 0);
    kxLabel.element.textContent = gr ? 'kx' : 'kx (π/a at the edge)';
    lowLabel.element.textContent = gr ? 'π band (filled)' : `band ${lowN}`;
    upLabel.element.textContent = gr ? 'π* band (empty)' : `band ${lowN + 1}`;
    lowLabel.position.set(-KSPAN - 0.4, yB(gr ? -2.5 : tbL.eps), -KSPAN);
    upLabel.position.set(-KSPAN - 0.4, yB(gr ? 2.5 : tbU.eps), -KSPAN);
    kLabel.visible = gr;
    kLabel.position.set((diracK() / graphK()) * KS, yB(0) + 0.45, 0);
    kLabel.element.textContent = 'K (Dirac point)';
    colourSurfaces();
    placeSparkles();
  }

  function colourSurfaces(): void {
    for (const S of [lower, upper]) {
      for (let q = 0; q < NV; q++) {
        const f = fermi(S.en[q], EF2, T);
        const h = Math.max(0, Math.min(1, 0.5 + (S.en[q] - EF2) * ES * 0.25));
        // filled: deep blue to cyan with energy, empty: slate
        const fr = 0.03 + 0.12 * h, fg = 0.22 + 0.45 * h, fb = 0.5 + 0.35 * h;
        const er = 0.16, eg = 0.18, eb = 0.26;
        S.col[q * 3] = f * fr + (1 - f) * er;
        S.col[q * 3 + 1] = f * fg + (1 - f) * eg;
        S.col[q * 3 + 2] = f * fb + (1 - f) * eb;
      }
      S.colAttr.needsUpdate = true;
    }
  }

  function placeSparkles(): void {
    const show = preset !== 'graphene' && !filling.partial && filling.gap >= GAP_ZERO;
    nCarriers = show ? intrinsicCarriers(filling.gap, T) : 0;
    nSpark = show && nCarriers > 0 ? Math.max(0, Math.min(MAXS, Math.round(Math.log10(nCarriers) - 3))) : 0;
    // Deterministic scatter near the conduction minimum and valence maximum
    const cMinAt = tbU.s > 0 ? 0 : 1; // u of the upper band minimum (0 = Γ, 1 = zone corner)
    const vMaxAt = tbL.s > 0 ? 1 : 0;
    for (let i = 0; i < MAXS; i++) {
      for (let w = 0; w < 2; w++) {
        const idx = i * 2 + w;
        const ang = i * 2.39996 + w * 1.3;
        const r = 0.08 + 0.22 * Math.sqrt((i + 0.5) / MAXS);
        const c0 = w === 0 ? cMinAt : vMaxAt;
        let u = c0 + r * Math.cos(ang);
        let v = c0 + r * Math.sin(ang);
        if (c0 === 1) { u = (u > 1 ? 2 - u : u) * (i % 2 ? -1 : 1); v = (v > 1 ? 2 - v : v) * ((i >> 1) % 2 ? -1 : 1); }
        const e = w === 0 ? tbE(tbU, u, v) : tbE(tbL, u, v);
        spkBase[idx * 3] = u * KS;
        spkBase[idx * 3 + 1] = yB(e) + (w === 0 ? 0.08 : -0.08);
        spkBase[idx * 3 + 2] = -v * KS;
        spkPhase[idx] = ang * 1.7;
      }
    }
    spkPos.set(spkBase);
    spkPosAttr.needsUpdate = true;
    spkGeo.setDrawRange(0, nSpark * 2);
  }

  function twinkle(t: number): void {
    for (let i = 0; i < nSpark * 2; i++) {
      const a = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.2 + spkPhase[i]));
      const isE = i % 2 === 0;
      spkCol[i * 3] = (isE ? 0.55 : 0.96) * a;
      spkCol[i * 3 + 1] = (isE ? 0.95 : 0.45) * a;
      spkCol[i * 3 + 2] = (isE ? 1.0 : 0.71) * a;
    }
    spkColAttr.needsUpdate = true;
  }

  function placeMarkers(): void {
    const u = preset === 'graphene' ? kSlider : kRed / (Math.PI / p.a);
    if (preset === 'graphene') {
      const e = grapheneE(u * graphK(), 0);
      diracE = e;
      markerA.visible = markerB.visible = Math.abs(u) <= U;
      markerA.position.set(u * KS, yB(e) + 0.02, 0);
      markerB.position.set(u * KS, yB(-e) - 0.02, 0);
      return;
    }
    diracE = 99;
    markerB.visible = false;
    const which = band === lowN ? tbL : band === lowN + 1 ? tbU : null;
    markerA.visible = which !== null;
    if (which) markerA.position.set(u * KS, yB(tbE(which, u, 0)) + 0.02, 0);
  }

  // ===================== Inset: 1D E(k) =====================
  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 360;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '180px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const NK = 121;
  const curves = new Float64Array(NBANDS * NK);

  function computeCurves(): void {
    for (let n = 1; n <= NBANDS; n++) {
      for (let i = 0; i < NK; i++) {
        const k = (-1 + (2 * i) / (NK - 1)) * (Math.PI / p.a);
        curves[(n - 1) * NK + i] = bandEnergy(p, edges, n, k);
      }
    }
  }

  function drawInset(): void {
    const W = inset.width, H = inset.height;
    const x0 = 58, x1 = W - 20, y0 = 50, y1 = H - 44;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '600 20px JetBrains Mono, monospace';
    ictx.fillStyle = '#b8c3d9';
    const gr = preset === 'graphene';
    ictx.fillText(gr ? 'graphene, cut at ky = 0' : 'E(k), Kronig–Penney', 14, 30);
    const uMax = gr ? U : 1;
    let eLo: number, eHi: number;
    const nb = Math.min(NBANDS, Math.max(band, filling.band + 1));
    if (gr) { eLo = -3 * GRAPHENE.t; eHi = 3 * GRAPHENE.t; } else { eLo = 0; eHi = Math.max(p.V0 * 0.2, edges[2 * nb - 1] ?? 1) * 1.05; }
    const X = (u: number) => x0 + ((u + uMax) / (2 * uMax)) * (x1 - x0);
    const Y = (e: number) => y1 - ((e - eLo) / (eHi - eLo)) * (y1 - y0);
    // frame
    ictx.strokeStyle = '#2c3852';
    ictx.lineWidth = 2;
    ictx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ictx.font = '17px JetBrains Mono, monospace';
    ictx.fillStyle = '#56627c';
    const ticks = gr ? [-1, 0, 1] : [-1, 0, 1];
    for (const t of ticks) {
      ictx.fillRect(X(t) - 1, y1, 2, 7);
      const s = t === 0 ? '0' : `${t < 0 ? '−' : ''}π/a`;
      ictx.fillText(s, X(t) - ictx.measureText(s).width / 2, y1 + 26);
    }
    ictx.fillText('eV', 8, y0 + 14);
    const eStep = (eHi - eLo) > 30 ? 10 : (eHi - eLo) > 12 ? 4 : (eHi - eLo) > 5 ? 2 : (eHi - eLo) > 2 ? 1 : 0.5;
    for (let e = Math.ceil(eLo / eStep) * eStep; e <= eHi; e += eStep) {
      const s = String(Math.round(e * 10) / 10);
      ictx.fillText(s, x0 - 8 - ictx.measureText(s).width, Y(e) + 6);
      ictx.fillRect(x0 - 5, Y(e) - 1, 5, 2);
    }
    ictx.save();
    ictx.beginPath();
    ictx.rect(x0, y0, x1 - x0, y1 - y0);
    ictx.clip();
    if (gr) {
      for (const sgn of [-1, 1]) {
        ictx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const u = -uMax + (2 * uMax * i) / 200;
          const e = sgn * grapheneE(u * graphK(), 0);
          if (i === 0) ictx.moveTo(X(u), Y(e)); else ictx.lineTo(X(u), Y(e));
        }
        ictx.strokeStyle = sgn < 0 ? css(PALETTE.cyan) : '#8391ab';
        ictx.lineWidth = 3;
        ictx.stroke();
      }
    } else {
      // gaps shaded
      for (let n = 1; n < nb; n++) {
        const t = edges[2 * n - 1], b2 = edges[2 * n];
        if (b2 - t < GAP_ZERO) continue;
        ictx.fillStyle = 'rgba(167,139,250,0.10)';
        ictx.fillRect(x0, Y(b2), x1 - x0, Y(t) - Y(b2));
      }
      // free-electron parabolas, folded, for comparison
      ictx.setLineDash([4, 6]);
      ictx.strokeStyle = 'rgba(131,145,171,0.55)';
      ictx.lineWidth = 1.5;
      for (let m = -3; m <= 3; m++) {
        ictx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const u = -1 + (2 * i) / 120;
          const kk = (u + 2 * m) * (Math.PI / p.a);
          const e = HB2M * kk * kk;
          if (i === 0) ictx.moveTo(X(u), Y(e)); else ictx.lineTo(X(u), Y(e));
        }
        ictx.stroke();
      }
      ictx.setLineDash([]);
      // bands, occupied parts in cyan
      for (let n = 1; n <= nb; n++) {
        for (let i = 0; i < NK - 1; i++) {
          const ea = curves[(n - 1) * NK + i], eb = curves[(n - 1) * NK + i + 1];
          const u0 = -1 + (2 * i) / (NK - 1), u1 = -1 + (2 * (i + 1)) / (NK - 1);
          const occ = n < filling.band || (n === filling.band && (!filling.partial || 0.5 * (ea + eb) <= filling.EF));
          ictx.strokeStyle = occ ? css(PALETTE.cyan) : css(PALETTE.green);
          ictx.globalAlpha = occ ? 1 : 0.6;
          ictx.lineWidth = occ ? 4 : 2.5;
          ictx.beginPath();
          ictx.moveTo(X(u0), Y(ea));
          ictx.lineTo(X(u1), Y(eb));
          ictx.stroke();
        }
      }
      ictx.globalAlpha = 1;
    }
    // Fermi level
    const ef = gr ? 0 : filling.EF;
    ictx.setLineDash([10, 7]);
    ictx.strokeStyle = css(PALETTE.amber);
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.moveTo(x0, Y(ef));
    ictx.lineTo(x1, Y(ef));
    ictx.stroke();
    ictx.setLineDash([]);
    // current-k marker
    const u = gr ? kSlider : kRed / (Math.PI / p.a);
    const em = gr ? grapheneE(kSlider * graphK(), 0) : E;
    ictx.strokeStyle = 'rgba(255,255,255,0.35)';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.moveTo(X(u), y0);
    ictx.lineTo(X(u), y1);
    ictx.stroke();
    ictx.fillStyle = '#ffffff';
    for (const e of gr ? [em, -em] : [em]) {
      ictx.beginPath();
      ictx.arc(X(u), Y(e), 7, 0, Math.PI * 2);
      ictx.fill();
    }
    ictx.restore();
    ictx.font = '600 17px JetBrains Mono, monospace';
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('E_F', x0 + 8, Math.max(y0 + 18, Y(ef) - 8));
    if (gr) {
      ictx.fillStyle = '#8391ab';
      ictx.font = '16px JetBrains Mono, monospace';
      ictx.fillText('k in units of π/a, a = 2.46 Å', 14, H - 4);
    }
  }

  // ===================== Overlays =====================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const badge = document.createElement('div');
  badge.className = 'stage-overlay';
  Object.assign(badge.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '6px 10px',
    font: '12px/1.4 JetBrains Mono, monospace', color: '#b8c3d9', textAlign: 'right',
  } as CSSStyleDeclaration);
  viewport.appendChild(badge);

  function drawLegend(): void {
    if (view === 'lattice') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the crystal</div>
<div><span style="color:${css(PALETTE.violet)}">Blocks</span> = barriers V(x), one per cell.</div>
<div>Spiral = Bloch wave ψ. Up is Re ψ, sideways is Im ψ. Colour = phase.</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,hsl(0,85%,55%),hsl(60,85%,55%),hsl(120,85%,55%),hsl(180,85%,55%),hsl(240,85%,55%),hsl(300,85%,55%),hsl(360,85%,55%))"></div>
<div>Floor glow = |ψ|², the same in every cell.</div>
<div>Back wall: <span style="color:${css(PALETTE.cyan)}">filled</span> and <span style="color:${css(PALETTE.green)}">empty</span> bands. <span style="color:${css(PALETTE.amber)}">Dashed</span> = E_F.</div>`;
    } else if (preset === 'graphene') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Graphene bands</div>
<div>Two surfaces E(kx, ky) meet in cones at the zone corners.</div>
<div><span style="color:${css(PALETTE.cyan)}">Blue</span> = filled, slate = empty. <span style="color:${css(PALETTE.amber)}">Sheet</span> = E_F = 0.</div>
<div>White line = the ky = 0 cut in the corner plot. Dots = your k.</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Band surfaces E(kx, ky)</div>
<div>A 2D square lattice with the same band edges as the 1D crystal.</div>
<div><span style="color:${css(PALETTE.cyan)}">Blue</span> = filled, slate = empty. <span style="color:${css(PALETTE.amber)}">Sheet</span> = Fermi level.</div>
<div>Sparkles: thermal <span style="color:#8cf2ff">electrons</span> and <span style="color:${css(PALETTE.rose)}">holes</span>. One more sparkle ≈ 10× more carriers.</div>`;
    }
  }

  function drawBadge(): void {
    if (preset === 'graphene') {
      badge.innerHTML = `<div style="color:#dfe6f3;font:600 15px/1.2 'Space Grotesk',sans-serif">Semimetal (graphene)</div><div>zero gap at the K points</div>`;
      return;
    }
    const name = filling.cls === 'metal' ? 'Metal' : filling.cls === 'semiconductor' ? 'Semiconductor' : 'Insulator';
    const col = filling.cls === 'metal' ? css(PALETTE.amber) : filling.cls === 'semiconductor' ? css(PALETTE.green) : css(PALETTE.violet);
    const kT = KB * T;
    const detail = filling.partial
      ? `band ${filling.band} half full`
      : filling.gap < GAP_ZERO
        ? 'bands touch, no gap'
        : `gap ${filling.gap.toFixed(2)} eV = ${kT > 0 ? `${(filling.gap / kT).toFixed(0)} k<sub>B</sub>T` : '∞ k<sub>B</sub>T'}`;
    badge.innerHTML = `<div style="color:${col};font:600 15px/1.2 'Space Grotesk',sans-serif">${name}</div><div>${detail}</div>`;
  }

  // ===================== Updates =====================
  function recomputeCrystal(): void {
    edges = bandEdges(p);
    filling = fill(p, edges, N);
    gap1 = Math.max(0, (edges[2] ?? 0) - (edges[1] ?? 0));
    computeCurves();
    buildLattice();
    recomputeState();
    buildWave();
    buildSurfaces();
    placeMarkers();
    drawBadge();
    drawInset();
  }

  function recomputeState(): void {
    const kAbs = kSlider * (Math.PI / p.a);
    kRed = reduceK(kAbs, p.a);
    E = bandEnergy(p, edges, band, kRed);
    const d2 = bandCurvature(p, edges, band, kRed);
    mStar = effMassFromCurvature(d2);
    vg = groupVelocity(p, edges, band, kRed);
  }

  function onState(): void {
    // k or band changed
    recomputeState();
    buildLattice();
    buildWave();
    placeMarkers();
    drawInset();
  }

  function applyView(): void {
    lat.visible = view === 'lattice';
    bandsG.visible = view === 'bands';
    drawLegend();
  }

  // ===================== Frame loop =====================
  stage.onFrame((dt, t) => {
    if (view === 'lattice') {
      phaseT -= OMEGA * dt;
      if (phaseT < -2 * Math.PI) phaseT += 2 * Math.PI;
      paintHelix(phaseT);
    } else if (nSpark > 0) {
      twinkle(t);
    }
    updateReadouts();
  });

  // ===================== Controls =====================
  const ui = new Panel(panel);
  ui.section('View and material');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'lattice', label: 'Lattice & Bloch wave' }, { value: 'bands', label: 'Band surface' }],
    onChange: (v) => {
      view = v;
      applyView();
      if (v === 'lattice') stage.flyTo(CAM_LAT, TGT_LAT);
      else stage.flyTo(CAM_BAND, TGT_BAND);
    },
  });
  const presetCtl = ui.select<Preset>({
    key: 'preset', label: 'Material preset', value: preset,
    options: [
      { value: 'metal', label: 'Metal' },
      { value: 'semiconductor', label: 'Semiconductor' },
      { value: 'insulator', label: 'Insulator' },
      { value: 'graphene', label: 'Graphene' },
    ],
    onChange: (v) => applyPreset(v),
  });

  ui.section('Crystal (Kronig–Penney)');
  const V0Ctl = ui.slider({ key: 'V0', label: 'Barrier height V₀', min: 0, max: 15, step: 0.1, value: p.V0, unit: 'eV', format: (v) => v.toFixed(1), onInput: (v) => { p.V0 = v; custom(); } });
  const bCtl = ui.slider({ key: 'b', label: 'Barrier width b', min: 0.2, max: 2.5, step: 0.05, value: p.b, unit: 'Å', format: (v) => v.toFixed(2), onInput: (v) => { p.b = v; custom(); } });
  const aCtl = ui.slider({ key: 'a', label: 'Lattice constant a', min: 3.5, max: 8, step: 0.1, value: p.a, unit: 'Å', format: (v) => v.toFixed(1), onInput: (v) => { p.a = v; custom(); } });

  ui.section('Electron state');
  ui.slider({ key: 'k', label: 'Wavevector k', min: -1.5, max: 1.5, step: 0.005, value: kSlider, unit: 'π/a', format: (v) => v.toFixed(3), onInput: (v) => { kSlider = v; onState(); } });
  const bandCtl = ui.slider({ key: 'band', label: 'Band index n', min: 1, max: NBANDS, step: 1, value: band, onInput: (v) => { band = v; onState(); } });

  ui.section('Filling');
  const NCtl = ui.slider({ key: 'electrons', label: 'Electrons per cell', min: 1, max: 8, step: 1, value: N, onInput: (v) => { N = v; custom(); } });
  ui.slider({
    key: 'T', label: 'Temperature T', min: 0, max: 1500, step: 10, value: T, unit: 'K',
    onInput: (v) => { T = v; colourSurfaces(); placeSparkles(); drawBadge(); },
  });
  ui.note('Units: eV and Å with the free electron mass. Each band holds two electrons per cell (spin up and down). Values of |k| beyond π/a fold back into the first zone. In the graphene preset the crystal sliders do not apply, and k runs along kx in units of π/a with a = 2.46 Å.');

  ui.section('Live readouts');
  const rE = ui.readout('E', 'state energy E', 'eV');
  const rK = ui.readout('kred', 'reduced k', 'π/a');
  const rVg = ui.readout('vg', 'group velocity', 'km/s');
  const rM = ui.readout('mstar', 'effective mass m*/mₑ');
  const rG1 = ui.readout('gap1', 'lowest gap', 'eV');
  const rG = ui.readout('gap', 'gap at E_F', 'eV');
  const rEF = ui.readout('EF', 'Fermi level E_F', 'eV');
  const rCls = ui.readout('cls', 'material');
  const rGkT = ui.readout('gapkT', 'gap / k_BT');
  const rNi = ui.readout('ni', 'thermal carriers', 'cm⁻³');
  const rRes = ui.readout('resid', 'dispersion residual');
  ui.legend([
    { color: css(PALETTE.violet), label: 'potential barriers' },
    { color: css(PALETTE.cyan), label: 'filled states' },
    { color: css(PALETTE.green), label: 'empty band' },
    { color: css(PALETTE.amber), label: 'Fermi level' },
  ]);

  function updateReadouts(): void {
    const gr = preset === 'graphene';
    rE(gr ? `±${grapheneE(kSlider * graphK(), 0).toFixed(3)}` : fmtE(E));
    rK(gr ? `kx = ${kSlider.toFixed(3)}` : (kRed / (Math.PI / p.a)).toFixed(3));
    rVg(gr ? '1e3 (cone)' : Math.abs(vg) < 1 ? '0' : (vg / 1000).toFixed(0));
    rM(gr ? '0 at K' : Math.abs(mStar) > 1e3 ? '∞ (inflection)' : mStar.toFixed(3));
    rG1(gap1.toFixed(3));
    rG(gr ? '0' : filling.partial ? 'none (band part full)' : filling.gap.toFixed(3));
    rEF(gr ? '0' : filling.EF.toFixed(3));
    rCls(gr ? 'semimetal' : filling.cls);
    rGkT(gr || filling.partial || filling.gap < GAP_ZERO ? 'n/a' : T <= 0 ? '∞' : (filling.gap / (KB * T)).toFixed(1));
    rNi(gr || filling.partial || filling.gap < GAP_ZERO ? 'n/a (metal)' : nCarriers < 1e-3 ? '≈ 0' : nCarriers.toExponential(1));
    rRes(resid.toExponential(1));
  }

  // --- Preset handling
  function custom(): void {
    const wasGraphene = preset === 'graphene';
    preset = 'custom';
    presetCtl.set('custom', false);
    recomputeCrystal();
    if (wasGraphene) drawLegend();
  }

  function applyPreset(v: Preset): void {
    preset = v;
    if (v === 'graphene') {
      if (view !== 'bands') viewCtl.set('bands');
      recomputeCrystal();
      drawLegend();
      return;
    }
    if (v !== 'custom') {
      const q = PRESETS[v];
      p.V0 = q.V0; p.a = q.a; p.b = q.b; N = q.N;
      V0Ctl.set(q.V0, false);
      aCtl.set(q.a, false);
      bCtl.set(q.b, false);
      NCtl.set(q.N, false);
      band = Math.min(NBANDS, Math.ceil(q.N / 2));
      bandCtl.set(band, false);
    }
    recomputeCrystal();
    drawLegend();
  }

  recomputeCrystal();
  applyView();

  return {
    state: () => ({
      view,
      preset,
      V0: p.V0,
      a: p.a,
      b: p.b,
      k: kSlider,
      kRed: kRed / (Math.PI / p.a),
      band,
      electrons: N,
      T,
      E,
      EF: filling.EF,
      gap: filling.gap,
      gap1,
      cls: filling.cls,
      halfFilled: filling.partial,
      mStar,
      vg,
      diracE,
      resid,
    }),
    dispose: () => {
      inset.remove();
      legend.remove();
      badge.remove();
      dotTex.dispose();
      unitBox.dispose();
      unitEdges.dispose();
      unitPlane.dispose();
      markerGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'band-structure',
  number: 51,
  title: 'Crystals & Energy Bands',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'Why copper conducts, glass does not, and silicon sits between.',
  content,
  mount,
};

export default topic;
