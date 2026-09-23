import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  bhBits,
  bhEntropy,
  boundaryGeodesicPoint,
  buildTiling,
  cftEntropy,
  geodesicLength,
  geodesicSegment,
  horizonArea,
  M_SUN,
  planckArea,
  rhoToRadius,
  schwarzschildRadius,
  turningRadius,
  turningRho,
  type C,
} from './physics.ts';

type View = 'ads' | 'bh';
type V3 = [number, number, number];

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const D = 2.3; // disk radius in world units
const Y0 = -2.2; // cylinder bottom
const Y1 = 2.2; // cylinder top
const TMAX = TAU; // global time range shown, in units of R
const RHO_C = 3.5; // bulk cutoff
const R_C = rhoToRadius(RHO_C);
const LC = TAU; // boundary circumference (R = 1)
const EPS = LC / (Math.PI * Math.exp(RHO_C)); // matching boundary cutoff, e^{ρc} = Lc/(π ε)
const NG = 97; // samples along the RT curve and the interval arc
const GHOST_T = [0.35, 1.9, 4.4, 5.95];
const BH_SCALE = 0.42; // world units of horizon radius per solar mass
const M_MAX = 6; // largest mass on the slider, in solar masses
const CELL = 0.1; // world size of one horizon tile
const MAX_TILES = 9000;
const MONO = 'JetBrains Mono, ui-monospace, monospace';

const CAM: Record<View, { pos: V3; target: V3 }> = {
  ads: { pos: [0.4, 5.3, 7.9], target: [0, -0.2, 0] },
  bh: { pos: [0, 1.5, 7.2], target: [0, -0.1, 0] },
};

const yOfT = (t: number) => Y0 + (t / TMAX) * (Y1 - Y0);

/** A thick line (optionally closed) whose points are updated in place, with a soft additive halo. */
class FatLine {
  readonly group = new THREE.Group();
  readonly pts: Float32Array;
  private readonly segs: Float32Array;
  private readonly geo = new LineSegmentsGeometry();
  readonly core: LineMaterial;
  readonly halo: LineMaterial;

  constructor(readonly count: number, readonly closed: boolean, color: number, width: number, haloOpacity = 0.22) {
    this.pts = new Float32Array(count * 3);
    this.segs = new Float32Array((closed ? count : count - 1) * 6);
    this.geo.setPositions(this.segs);
    this.core = new LineMaterial({ color, linewidth: width, worldUnits: true, transparent: true });
    this.core.toneMapped = false;
    const a = new LineSegments2(this.geo, this.core);
    a.frustumCulled = false;
    this.halo = new LineMaterial({ color, linewidth: width * 3.2, worldUnits: true, transparent: true, opacity: haloOpacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.halo.toneMapped = false;
    const b = new LineSegments2(this.geo, this.halo);
    b.frustumCulled = false;
    b.renderOrder = 3;
    this.group.add(a, b);
  }

  commit(): void {
    const p = this.pts;
    const s = this.segs;
    const n = this.count;
    const nseg = this.closed ? n : n - 1;
    for (let i = 0; i < nseg; i++) {
      const a = i * 3;
      const b = ((i + 1) % n) * 3;
      const o = i * 6;
      s[o] = p[a];
      s[o + 1] = p[a + 1];
      s[o + 2] = p[a + 2];
      s[o + 3] = p[b];
      s[o + 4] = p[b + 1];
      s[o + 5] = p[b + 2];
    }
    (this.geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.core.dispose();
    this.halo.dispose();
  }
}

/** Build the filled {7,3} tiling (2-coloured barycentric triangles) and its edge lines, in disk coordinates on the XZ plane. */
function buildTilingGeometry(): { fill: THREE.BufferGeometry; edges: THREE.BufferGeometry; count: number } {
  const tiles = buildTiling(7, 3, 0.985);
  const colA = new THREE.Color(0x221c48);
  const colB = new THREE.Color(0x0f1631);
  const pos: number[] = [];
  const col: number[] = [];
  const buf = new Float64Array(2 * 16);
  const push = (z: C, c: THREE.Color, fade: number) => {
    pos.push(D * z.x, 0, -D * z.y);
    col.push(c.r * fade, c.g * fade, c.b * fade);
  };
  const tmp: C = { x: 0, y: 0 };
  const tmp2: C = { x: 0, y: 0 };
  for (const t of tiles) {
    const p = t.verts.length;
    const rr = Math.hypot(t.center.x, t.center.y);
    const fade = 1 - 0.35 * rr * rr;
    for (let k = 0; k < p; k++) {
      const v0 = t.verts[k];
      const m = t.mids[k];
      const v1 = t.verts[(k + 1) % p];
      for (let half = 0; half < 2; half++) {
        const a = half === 0 ? v0 : m;
        const b = half === 0 ? m : v1;
        const color = (half ^ t.parity) === 0 ? colA : colB;
        const n = Math.max(2, Math.min(16, Math.round((Math.hypot(a.x - b.x, a.y - b.y) * D) / 0.06) + 1));
        geodesicSegment(a, b, n, buf);
        for (let j = 0; j + 1 < n; j++) {
          tmp.x = buf[2 * j];
          tmp.y = buf[2 * j + 1];
          tmp2.x = buf[2 * j + 2];
          tmp2.y = buf[2 * j + 3];
          push(t.center, color, fade);
          push(tmp, color, fade);
          push(tmp2, color, fade);
        }
      }
    }
  }
  const fill = new THREE.BufferGeometry();
  fill.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fill.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const seen = new Set<string>();
  const e: number[] = [];
  for (const t of tiles) {
    const p = t.verts.length;
    for (let k = 0; k < p; k++) {
      const m = t.mids[k];
      const key = `${Math.round(m.x * 1e5)},${Math.round(m.y * 1e5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = t.verts[k];
      const b = t.verts[(k + 1) % p];
      const n = Math.max(2, Math.min(16, Math.round((Math.hypot(a.x - b.x, a.y - b.y) * D) / 0.05) + 1));
      geodesicSegment(a, b, n, buf);
      for (let j = 0; j + 1 < n; j++) {
        e.push(D * buf[2 * j], 0, -D * buf[2 * j + 1], D * buf[2 * j + 2], 0, -D * buf[2 * j + 3]);
      }
    }
  }
  const edges = new THREE.BufferGeometry();
  edges.setAttribute('position', new THREE.Float32BufferAttribute(e, 3));
  return { fill, edges, count: tiles.length };
}

function fmtSci(x: number, d = 2): string {
  const e = Math.floor(Math.log10(x));
  const m = x / 10 ** e;
  const sup = String(e).replace(/[-0-9]/g, (ch) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(ch)]);
  return `${m.toFixed(d)}×10${sup}`;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.ads.pos, target: CAM.ads.target, fov: 42 });
  const { scene } = stage;

  // --- State
  let view: View = 'ads';
  let size = 0.2; // ℓ / L
  let posDeg = 270; // interval centre angle (270° faces the camera)
  let time = Math.PI; // global time t
  let showTiling = true;
  let mass = 3; // solar masses
  let massRef = 1;
  let sizeMinSeen = size;
  let sizeMaxSeen = size;
  let tMinSeen = time;
  let tMaxSeen = time;

  // Derived
  let length = 0;
  let S = 0; // in units of c
  let Scft = 0;
  let rhoStar = 0;
  let depth = 0;

  // =========================================================================
  // AdS view
  // =========================================================================
  const adsGroup = new THREE.Group();
  scene.add(adsGroup);

  // Cylinder shell: the conformal boundary through time.
  const shellMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(D, D, Y1 - Y0, 96, 1, true), shellMat);
  shell.position.y = (Y0 + Y1) / 2;
  adsGroup.add(shell);
  {
    const v: number[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      v.push(D * Math.cos(a), Y0, -D * Math.sin(a), D * Math.cos(a), Y1, -D * Math.sin(a));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    adsGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c4a6a, transparent: true, opacity: 0.35, depthWrite: false })));
  }
  const circleGeo = (() => {
    const v: number[] = [];
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * TAU;
      v.push(D * Math.cos(a), 0, -D * Math.sin(a));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  })();
  const capMat = new THREE.LineBasicMaterial({ color: 0x3d6a8f, transparent: true, opacity: 0.6 });
  for (const y of [Y0, Y1]) {
    const l = new THREE.Line(circleGeo, capMat);
    l.position.y = y;
    adsGroup.add(l);
  }
  // Time axis arrow
  {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(D + 0.45, Y0, 0), Y1 - Y0 + 0.2, 0x6a7fa6, 0.2, 0.1);
    adsGroup.add(arrow);
    stage.label('global time t ↑', [D + 0.45, Y1 + 0.45, 0], 'muted', adsGroup);
  }

  // Tiling geometry shared by the live slice and ghost slices.
  const tiling = buildTilingGeometry();
  const tileEdgeMat = new THREE.LineBasicMaterial({ color: 0x8b7cf0, transparent: true, opacity: 0.55, depthWrite: false });
  const ghostEdgeMat = new THREE.LineBasicMaterial({ color: 0x8b7cf0, transparent: true, opacity: 0.08, depthWrite: false });
  const ghostRimMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.3, depthWrite: false });
  const ghostGeoMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, depthWrite: false });

  // Ghost RT curve shared by the ghost slices (static state: the same curve at every time).
  const ghostCurvePos = new Float32Array(NG * 3);
  const ghostCurveGeo = new THREE.BufferGeometry();
  ghostCurveGeo.setAttribute('position', new THREE.BufferAttribute(ghostCurvePos, 3));

  const ghosts = GHOST_T.map((t) => {
    const g = new THREE.Group();
    g.position.y = yOfT(t);
    const edges = new THREE.LineSegments(tiling.edges, ghostEdgeMat);
    const rim = new THREE.Line(circleGeo, ghostRimMat);
    const curve = new THREE.Line(ghostCurveGeo, ghostGeoMat);
    curve.frustumCulled = false;
    g.add(edges, rim, curve);
    adsGroup.add(g);
    return { g, edges, t };
  });

  // Interval world-lines on the boundary (the interval exists at every time).
  const wlPos = new Float32Array(12);
  const wlGeo = new THREE.BufferGeometry();
  wlGeo.setAttribute('position', new THREE.BufferAttribute(wlPos, 3));
  const wl = new THREE.LineSegments(wlGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.4, depthWrite: false }));
  wl.frustumCulled = false;
  adsGroup.add(wl);

  // --- The live slice
  const slice = new THREE.Group();
  adsGroup.add(slice);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const base = new THREE.Mesh(new THREE.CircleGeometry(D, 128), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.004;
  slice.add(base);
  const tileFillMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
  const tileFill = new THREE.Mesh(tiling.fill, tileFillMat);
  tileFill.position.y = -0.002;
  slice.add(tileFill);
  const tileEdges = new THREE.LineSegments(tiling.edges, tileEdgeMat);
  slice.add(tileEdges);

  // Cutoff circle ρ = ρc (dashed)
  const cutoff = new THREE.Line(circleGeo, new THREE.LineDashedMaterial({ color: 0x9aa6bd, dashSize: 0.06, gapSize: 0.06, transparent: true, opacity: 0.55 }));
  cutoff.scale.setScalar(R_C);
  cutoff.computeLineDistances();
  cutoff.position.y = 0.004;
  slice.add(cutoff);

  // Rim
  const rim = new FatLine(128, true, PALETTE.cyan, 0.022, 0.14);
  for (let k = 0; k < 128; k++) {
    const a = (k / 128) * TAU;
    rim.pts[k * 3] = D * Math.cos(a);
    rim.pts[k * 3 + 1] = 0;
    rim.pts[k * 3 + 2] = -D * Math.sin(a);
  }
  rim.commit();
  slice.add(rim.group);

  // Entanglement wedge: strip between the boundary interval and the RT curve.
  const wedgePos = new Float32Array(NG * 2 * 3);
  const wedgeIdx: number[] = [];
  for (let k = 0; k + 1 < NG; k++) {
    const a = 2 * k;
    wedgeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const wedgeGeo = new THREE.BufferGeometry();
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(wedgePos, 3));
  wedgeGeo.setIndex(wedgeIdx);
  const wedgeMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  wedgeMat.toneMapped = false;
  const wedge = new THREE.Mesh(wedgeGeo, wedgeMat);
  wedge.frustumCulled = false;
  wedge.position.y = 0.006;
  slice.add(wedge);

  const arc = new FatLine(NG, false, PALETTE.amber, 0.045, 0.18);
  arc.group.position.y = 0.01;
  slice.add(arc.group);
  const geo = new FatLine(NG, false, PALETTE.cyan, 0.04, 0.22);
  geo.group.position.y = 0.02;
  slice.add(geo.group);

  const dotGeo = new THREE.SphereGeometry(1, 20, 14);
  const endMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
  endMat.toneMapped = false;
  const ends = [new THREE.Mesh(dotGeo, endMat), new THREE.Mesh(dotGeo, endMat)];
  ends.forEach((m) => {
    m.scale.setScalar(0.065);
    slice.add(m);
  });
  const turnMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  turnMat.toneMapped = false;
  const turn = new THREE.Mesh(dotGeo, turnMat);
  turn.scale.setScalar(0.055);
  slice.add(turn);
  const centreDot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x9aa6bd }));
  centreDot.scale.setScalar(0.03);
  slice.add(centreDot);

  // Depth marker: dashed line from the interval midpoint on the rim to the deepest point.
  const depthPos = new Float32Array(6);
  const depthGeo = new THREE.BufferGeometry();
  depthGeo.setAttribute('position', new THREE.BufferAttribute(depthPos, 3));
  const depthLine = new THREE.Line(depthGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.07, gapSize: 0.06, transparent: true, opacity: 0.8 }));
  depthLine.frustumCulled = false;
  depthLine.position.y = 0.03;
  slice.add(depthLine);

  const labA = stage.label('interval A', [0, 0, 0], '', slice);
  labA.element.style.color = css(PALETTE.amber);
  const labG = stage.label('RT curve γ_A', [0, 0, 0], '', slice);
  labG.element.style.color = css(PALETTE.cyan);
  const labDepth = stage.label('', [0, 0, 0], 'muted', slice);
  const labBoundary = stage.label('boundary: quantum theory, no gravity', [0, 0, 0], 'muted', slice);
  const labBulk = stage.label('bulk: gravity', [0, 0, 0], 'muted', slice);
  const labCut = stage.label('cutoff ε', [0, 0, 0], 'muted', slice);

  // =========================================================================
  // Black hole view
  // =========================================================================
  const bhGroup = new THREE.Group();
  bhGroup.visible = false;
  scene.add(bhGroup);
  const mainBH = new THREE.Group();
  const refBH = new THREE.Group();
  bhGroup.add(mainBH, refBH);
  const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x020308 });
  const horizon = new THREE.Mesh(sphereGeo, horizonMat);
  mainBH.add(horizon);
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
  glowMat.toneMapped = false;
  const glow = new THREE.Mesh(sphereGeo, glowMat);
  mainBH.add(glow);
  const refHorizon = new THREE.Mesh(sphereGeo, horizonMat);
  refBH.add(refHorizon);
  const cellGeo = new THREE.PlaneGeometry(1, 1);
  const cellMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  cellMat.toneMapped = false;
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, MAX_TILES);
  cells.count = 0;
  cells.frustumCulled = false;
  mainBH.add(cells);
  const refCellMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
  refCellMat.toneMapped = false;
  const refCells = new THREE.InstancedMesh(cellGeo, refCellMat, MAX_TILES);
  refCells.count = 0;
  refCells.frustumCulled = false;
  refBH.add(refCells);
  const bits = new Uint8Array(MAX_TILES);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < MAX_TILES; i++) bits[i] = rnd() < 0.5 ? 1 : 0;
  const bitOn = new THREE.Color(PALETTE.amber);
  const bitOff = new THREE.Color(0x2a5870);
  for (let i = 0; i < MAX_TILES; i++) {
    cells.setColorAt(i, bits[i] ? bitOn : bitOff);
    refCells.setColorAt(i, bits[(i * 7919) % MAX_TILES] ? bitOn : bitOff);
  }
  const labHorizon = stage.label('', [0, 1, 0], '', mainBH);
  labHorizon.element.style.color = css(PALETTE.violet);
  const labTile = stage.label('', [0, -1, 0], 'muted', mainBH);
  const labRef = stage.label('', [0, -1, 0], 'muted', refBH);
  let nTiles = 0;
  let nRefTiles = 0;
  let tileNote = '';

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const nrm = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  /** Cover a sphere of radius Rw with tiles of fixed size CELL (Fibonacci lattice). Tile count ∝ area. */
  function tileSphere(mesh: THREE.InstancedMesh, Rw: number): number {
    const n = Math.min(MAX_TILES, Math.round((4 * Math.PI * Rw * Rw) / (CELL * CELL)));
    sc.set(CELL * 0.84, CELL * 0.84, 1);
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const th = i * GOLDEN;
      nrm.set(r * Math.cos(th), y, r * Math.sin(th));
      q.setFromUnitVectors(zAxis, nrm);
      pv.copy(nrm).multiplyScalar(Rw * 1.004);
      m4.compose(pv, q, sc);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return n;
  }

  function rebuildBH(): void {
    const Rw = BH_SCALE * mass;
    const Rref = BH_SCALE * massRef;
    horizon.scale.setScalar(Rw);
    glow.scale.setScalar(Rw * 1.12);
    refHorizon.scale.setScalar(Rref);
    nTiles = tileSphere(cells, Rw);
    nRefTiles = tileSphere(refCells, Rref);
    // Reference on the left, current black hole on the right, the pair centred.
    const gap = 0.7;
    const left = -(2 * Rref + gap + 2 * Rw) / 2;
    refBH.position.x = left + Rref;
    mainBH.position.x = left + 2 * Rref + gap + Rw;
    const rs = schwarzschildRadius(mass * M_SUN);
    labHorizon.position.set(0, Rw + 0.35, 0);
    labHorizon.element.textContent = `${mass.toFixed(1)} M☉  r_s = ${(rs / 1000).toFixed(1)} km`;
    labTile.position.set(0, -Rw - 0.35, 0);
    const perTile = horizonArea(mass * M_SUN) / planckArea() / nTiles;
    labTile.element.textContent = `${nTiles} tiles, ${(nTiles / Math.max(1, nRefTiles)).toFixed(1)}× the reference`;
    tileNote = `Each tile stands for ~${fmtSci(perTile, 1)} Planck areas.`;
    labRef.position.set(0, Rref + 0.3, 0);
    labRef.element.textContent = `ref ${massRef.toFixed(1)} M☉ · ${nRefTiles} tiles`;
  }

  // =========================================================================
  // Overlays
  // =========================================================================
  const banner = document.createElement('div');
  banner.className = 'stage-overlay';
  Object.assign(banner.style, {
    position: 'absolute', left: '12px', top: '10px', zIndex: '2', pointerEvents: 'none',
    padding: '6px 12px', borderRadius: '10px', background: 'rgba(7,10,18,0.78)', border: '1px solid #243049',
    fontFamily: MONO, color: '#dfe6f3', maxWidth: '46%',
  } as CSSStyleDeclaration);
  const bannerMain = document.createElement('div');
  bannerMain.style.font = `700 15px ${MONO}`;
  const bannerSub = document.createElement('div');
  bannerSub.style.cssText = 'font-size:11.5px;color:#9aa6bd;margin-top:3px;line-height:1.4';
  banner.append(bannerMain, bannerSub);
  viewport.appendChild(banner);

  const inset = document.createElement('canvas');
  inset.width = 440;
  inset.height = 320;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '220px', height: '160px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const sOf = (f: number) => geodesicLength(Math.PI * f, RHO_C) / 6; // S / c = L / (4G c) = L / 6R

  function drawAdsInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `24px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('S / c  vs  interval ℓ / L', 18, 34);
    const x0 = 56;
    const x1 = W - 18;
    const yb = H - 44;
    const yt = 58;
    const sMax = 1.6;
    const X = (f: number) => x0 + f * (x1 - x0);
    const Y = (s: number) => yb - (Math.min(s, sMax) / sMax) * (yb - yt);
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, yt - 8);
    c.lineTo(x0, yb);
    c.lineTo(x1, yb);
    c.stroke();
    c.fillStyle = '#56627c';
    c.font = `19px ${MONO}`;
    c.fillText('0', x0 - 8, yb + 26);
    c.fillText('0.5', X(0.5) - 16, yb + 26);
    c.fillText('1', X(1) - 6, yb + 26);
    c.fillText('1.5', 8, Y(1.5) + 7);
    // Linear growth for comparison, matched at ℓ = 0.05 L.
    const k = sOf(0.05) / 0.05;
    c.setLineDash([7, 7]);
    c.strokeStyle = '#b3bdd1';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(X(0), Y(0));
    const fEnd = Math.min(1, sMax / k);
    c.lineTo(X(fEnd), Y(k * fEnd));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#8391ab';
    c.fillText('if S ∝ ℓ', X(fEnd) + 10, Y(sMax) + 40);
    // RT curve
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 4;
    c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const f = 0.02 + (0.96 * i) / 120;
      const s = sOf(f);
      if (i === 0) c.moveTo(X(f), Y(s));
      else c.lineTo(X(f), Y(s));
    }
    c.stroke();
    // Current point
    c.fillStyle = css(PALETTE.amber);
    c.beginPath();
    c.arc(X(size), Y(S), 8, 0, TAU);
    c.fill();
    c.fillStyle = '#dfe6f3';
    c.font = `20px ${MONO}`;
    c.fillText('RT: log growth', X(0.56), Y(sOf(0.5)) + 34);
  }

  function drawBhInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `24px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('S / S(1 M☉)  vs  M  (log-log)', 18, 34);
    const x0 = 56;
    const x1 = W - 18;
    const yb = H - 44;
    const yt = 58;
    const X = (m: number) => x0 + (Math.log10(m) / Math.log10(M_MAX)) * (x1 - x0);
    const Y = (r: number) => yb - (Math.log10(r) / 2.4) * (yb - yt); // ratio 1 to ~250
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, yt - 8);
    c.lineTo(x0, yb);
    c.lineTo(x1, yb);
    c.stroke();
    c.fillStyle = '#56627c';
    c.font = `19px ${MONO}`;
    c.fillText('1', x0 - 6, yb + 26);
    c.fillText(`${M_MAX} M☉`, X(M_MAX) - 56, yb + 26);
    c.fillText('1', 30, yb + 6);
    c.fillText('10', 18, Y(10) + 7);
    c.fillText('100', 6, Y(100) + 7);
    // Volume law M³ (dashed) and area law M² (solid)
    c.setLineDash([7, 7]);
    c.strokeStyle = '#8391ab';
    c.beginPath();
    c.moveTo(X(1), Y(1));
    c.lineTo(X(M_MAX), Y(M_MAX ** 3));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#8391ab';
    c.fillText('volume ∝ M³', X(2.2), Y(40));
    c.strokeStyle = css(PALETTE.violet);
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(X(1), Y(1));
    c.lineTo(X(M_MAX), Y(M_MAX ** 2));
    c.stroke();
    c.fillStyle = css(PALETTE.violet);
    c.fillText('S ∝ A ∝ M²', X(2.6), Y(3));
    c.fillStyle = css(PALETTE.amber);
    c.beginPath();
    c.arc(X(mass), Y(mass * mass), 8, 0, TAU);
    c.fill();
  }

  // =========================================================================
  // Recompute
  // =========================================================================
  const zp: C = { x: 0, y: 0 };

  function rebuildAds(): void {
    const phi = posDeg * DEG;
    const alpha = Math.PI * size;
    length = geodesicLength(alpha, RHO_C);
    S = length / 6; // c = 3R/2G ⇒ S/c = L / (4G) · 2G/(3R) = L/6 with R = 1
    Scft = cftEntropy(1, size * LC, LC, EPS);
    rhoStar = turningRho(alpha);
    depth = RHO_C - rhoStar;

    for (let k = 0; k < NG; k++) {
      const s = -1 + (2 * k) / (NG - 1);
      // Cluster samples near the ends where the curve bends fastest in the picture.
      const sv = Math.sin((s * Math.PI) / 2);
      boundaryGeodesicPoint(phi, alpha, sv, zp);
      const gx = D * zp.x;
      const gz = -D * zp.y;
      geo.pts[k * 3] = gx;
      geo.pts[k * 3 + 1] = 0;
      geo.pts[k * 3 + 2] = gz;
      ghostCurvePos[k * 3] = gx;
      ghostCurvePos[k * 3 + 1] = 0.01;
      ghostCurvePos[k * 3 + 2] = gz;
      const th = phi - alpha + (2 * alpha * k) / (NG - 1);
      const bx = D * Math.cos(th);
      const bz = -D * Math.sin(th);
      arc.pts[k * 3] = bx;
      arc.pts[k * 3 + 1] = 0;
      arc.pts[k * 3 + 2] = bz;
      wedgePos[k * 6] = bx;
      wedgePos[k * 6 + 1] = 0;
      wedgePos[k * 6 + 2] = bz;
      wedgePos[k * 6 + 3] = gx;
      wedgePos[k * 6 + 4] = 0;
      wedgePos[k * 6 + 5] = gz;
    }
    geo.commit();
    arc.commit();
    (ghostCurveGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (wedgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    wedgeGeo.computeBoundingSphere();

    const a1 = phi - alpha;
    const a2 = phi + alpha;
    ends[0].position.set(D * Math.cos(a1), 0.02, -D * Math.sin(a1));
    ends[1].position.set(D * Math.cos(a2), 0.02, -D * Math.sin(a2));
    wlPos.set([D * Math.cos(a1), Y0, -D * Math.sin(a1), D * Math.cos(a1), Y1, -D * Math.sin(a1), D * Math.cos(a2), Y0, -D * Math.sin(a2), D * Math.cos(a2), Y1, -D * Math.sin(a2)]);
    (wlGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    const r0 = turningRadius(alpha);
    const tx = D * r0 * Math.cos(phi);
    const tz = -D * r0 * Math.sin(phi);
    turn.position.set(tx, 0.03, tz);
    // Depth line from the rim point on the curve's side to the deepest point.
    const side = r0 >= 0 ? phi : phi + Math.PI;
    depthPos.set([D * Math.cos(side), 0, -D * Math.sin(side), tx, 0, tz]);
    (depthGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    depthLine.computeLineDistances();

    labA.position.set((D + 0.42) * Math.cos(phi), 0.05, -(D + 0.42) * Math.sin(phi));
    const lr = Math.max(0.28, Math.abs(r0) - 0.14) * Math.sign(r0 || 1);
    labG.position.set(D * lr * Math.cos(phi) + 0.0, 0.16, -D * lr * Math.sin(phi));
    labDepth.position.set(0.5 * tx + 0.5 * D * Math.cos(side), 0.2, 0.5 * tz - 0.5 * D * Math.sin(side));
    labDepth.element.textContent = `depth ${depth.toFixed(2)}`;
    // Put the static labels on the side away from the interval.
    const away = phi + Math.PI;
    labBoundary.position.set((D + 0.2) * Math.cos(away + 0.5), 0.05, -(D + 0.2) * Math.sin(away + 0.5));
    labBulk.position.set(0.9 * Math.cos(away - 0.5), 0.05, -0.9 * Math.sin(away - 0.5));
    labCut.position.set(D * R_C * Math.cos(away - 1.2) * 0.93, 0.05, -D * R_C * Math.sin(away - 1.2) * 0.93);
  }

  function placeSlice(): void {
    const y = yOfT(time);
    slice.position.y = y;
    for (const g of ghosts) g.g.visible = Math.abs(g.g.position.y - y) > 0.25;
  }

  function updateBanner(): void {
    if (view === 'ads') {
      bannerMain.textContent = `S_A = Length(γ_A)/4G = ${S.toFixed(3)} c`;
      bannerSub.textContent = `ℓ = ${(size * 100).toFixed(0)}% of the boundary · curve reaches depth ${depth.toFixed(2)} R. Bigger interval, deeper curve.`;
    } else {
      bannerMain.textContent = `S = A/4 = ${fmtSci(bhEntropy(mass * M_SUN))} k_B`;
      bannerSub.textContent = `${mass.toFixed(1)} M☉ · ${fmtSci(bhBits(mass * M_SUN))} bits. Double M, four times S. ${tileNote}`;
    }
  }

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'ads', label: 'AdS₃ and RT' }, { value: 'bh', label: 'Black hole entropy' }],
    onChange: (v) => setView(v),
  });

  ui.section('Boundary interval A');
  ui.slider({
    key: 'size', label: 'Interval size ℓ / L', min: 0.03, max: 0.97, step: 0.01, value: size, format: (v) => v.toFixed(2),
    onInput: (v) => { size = v; sizeMinSeen = Math.min(sizeMinSeen, v); sizeMaxSeen = Math.max(sizeMaxSeen, v); refreshAds(); },
  });
  ui.slider({
    key: 'pos', label: 'Interval position', min: 0, max: 360, step: 1, value: posDeg, unit: '°',
    onInput: (v) => { posDeg = v; refreshAds(); },
  });
  ui.slider({
    key: 'time', label: 'Time slice t', min: 0, max: TMAX, step: 0.02, value: time, format: (v) => `${v.toFixed(2)} R`,
    onInput: (v) => { time = v; tMinSeen = Math.min(tMinSeen, v); tMaxSeen = Math.max(tMaxSeen, v); placeSlice(); },
  });
  ui.toggle({
    key: 'tiling', label: 'Show {7,3} tiling', value: showTiling,
    onChange: (v) => { showTiling = v; tileFill.visible = v; tileEdges.visible = v; ghosts.forEach((g) => (g.edges.visible = v)); },
  });
  const rLength = ui.readout('length', 'geodesic length', 'R');
  const rS = ui.readout('S', 'S_RT', 'c');
  const rDepth = ui.readout('depth', 'max bulk depth', 'R');
  const rMatch = ui.readout('match', 'RT vs CFT');
  ui.legend([
    { color: css(PALETTE.amber), label: 'interval A' },
    { color: css(PALETTE.cyan), label: 'RT curve γ_A' },
    { color: '#8b7cf0', label: 'equal-size tiles' },
  ]);

  ui.section('Black hole');
  ui.slider({
    key: 'mass', label: 'Mass', min: 1, max: M_MAX, step: 0.1, value: mass, unit: 'M☉', format: (v) => v.toFixed(1),
    onInput: (v) => { mass = v; refreshBH(); },
  });
  ui.buttons([{ label: 'Pin reference', key: 'ratio', onClick: () => { massRef = mass; refreshBH(); } }]);
  const rSbh = ui.readout('sbh', 'BH entropy', 'k_B');
  const rBits = ui.readout('bits', 'bits');
  const rRs = ui.readout('rs', 'horizon r_s', 'km');
  const rRatio = ui.readout('ratio', 'S / S_ref');
  ui.note('Planck units: S = A / 4 with A in units of ℓ_P² = Għ/c³ ≈ 2.6×10⁻⁷⁰ m².');

  function refreshAds(): void {
    rebuildAds();
    rLength(length.toFixed(3));
    rS(S.toFixed(3));
    rDepth(depth.toFixed(2));
    rMatch(`${(((S - Scft) / Scft) * 100).toFixed(1)} %`);
    if (view === 'ads') {
      drawAdsInset();
      updateBanner();
    }
  }

  function refreshBH(): void {
    rebuildBH();
    const M = mass * M_SUN;
    rSbh(fmtSci(bhEntropy(M)));
    rBits(fmtSci(bhBits(M)));
    rRs((schwarzschildRadius(M) / 1000).toFixed(2));
    rRatio((bhEntropy(M) / bhEntropy(massRef * M_SUN)).toFixed(2));
    if (view === 'bh') {
      drawBhInset();
      updateBanner();
    }
  }

  function setView(v: View): void {
    view = v;
    adsGroup.visible = v === 'ads';
    bhGroup.visible = v === 'bh';
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.3);
    if (v === 'ads') drawAdsInset();
    else drawBhInset();
    updateBanner();
  }

  // =========================================================================
  // Frame loop: gentle pulse on the RT curve and flickering horizon bits.
  // =========================================================================
  let flipTimer = 0;
  stage.onFrame((dt, t) => {
    if (view === 'ads') {
      geo.halo.opacity = 0.16 + 0.08 * Math.sin(t * 2.2);
      wedgeMat.opacity = 0.13 + 0.05 * Math.sin(t * 2.2);
    } else {
      cells.rotation.y += dt * 0.05;
      refCells.rotation.y += dt * 0.05;
      flipTimer += dt;
      if (flipTimer > 0.05 && nTiles > 0) {
        flipTimer = 0;
        const nf = Math.max(1, Math.round(nTiles / 150));
        for (let j = 0; j < nf; j++) {
          const i = Math.floor(rnd() * nTiles);
          bits[i] ^= 1;
          cells.setColorAt(i, bits[i] ? bitOn : bitOff);
        }
        if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
      }
    }
  });

  placeSlice();
  refreshAds();
  refreshBH();
  setView(view);

  return {
    state: () => ({
      view,
      size,
      pos: posDeg,
      time,
      tiling: showTiling,
      mass,
      massRef,
      massRatio: mass / massRef,
      length,
      S,
      depth,
      rhoStar,
      reachedCentre: rhoStar < 0.04,
      sizeMinSeen,
      sizeMaxSeen,
      timeSpan: tMaxSeen - tMinSeen,
      Sbh: bhEntropy(mass * M_SUN),
    }),
    dispose: () => {
      banner.remove();
      inset.remove();
      rim.dispose();
      arc.dispose();
      geo.dispose();
      stage.dispose();
      tiling.fill.dispose();
      tiling.edges.dispose();
      circleGeo.dispose();
      dotGeo.dispose();
      cellGeo.dispose();
      sphereGeo.dispose();
      ghostCurveGeo.dispose();
    },
  };
}

const topic: Topic = {
  id: 'holography',
  number: 21,
  symbol: 'Ho',
  title: 'Holography',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'A universe described by its boundary.',
  content,
  mount,
};

export default topic;
