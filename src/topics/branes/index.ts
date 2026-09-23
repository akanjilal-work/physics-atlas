import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  addForce,
  clusterBranes,
  gaugeGroupOf,
  masslessVectors,
  sectorCount,
  stretchedMass,
  stretchedSectors,
  writeOpenString,
  type Cluster,
  type OpenStringSpec,
} from './physics.ts';

type View = 'stack' | 'world';

const TAU = Math.PI * 2;
const MAXN = 4;
const Y_MIN = -3;
const Y_MAX = 3;
const Y_STEP = 0.05;
const SNAP = 0.12; // slider or drag values this close to another brane snap onto it
const XS = 0.95; // world units per string length along the separation axis
const SHEET_H = 3.2; // sheet extent in y
const SHEET_W = 3.8; // sheet extent in z
const OPEN_PTS = 44;
const LOOP_PTS = 64;
const HEAVY = 0.8; // mass at which a stretched string is drawn at full weight
const BRANE_COLORS = [PALETTE.cyan, PALETTE.amber, PALETTE.rose, PALETTE.green];
const GRAVITON = PALETTE.violet;

const CAM = {
  stack: { pos: [3.7, 2.2, 6.6] as [number, number, number], target: [0, -0.1, 0] as [number, number, number] },
  world: { pos: [0.3, 4.9, 10.9] as [number, number, number], target: [0.3, 0.45, 0] as [number, number, number] },
};

/**
 * A thick glowing curve with per-point colours. Points live in `pts` and are copied into the
 * segment buffer of a LineSegments2 in place, so per-frame updates allocate nothing.
 */
class Glow {
  readonly group = new THREE.Group();
  readonly pts: Float32Array;
  private readonly cols: Float32Array;
  private readonly segs: Float32Array;
  private readonly segCols: Float32Array;
  private readonly geo: LineSegmentsGeometry;
  readonly core: LineMaterial;
  readonly halo: LineMaterial;
  private colorsDirty = true;

  constructor(readonly count: number, readonly closed: boolean, width: number) {
    this.pts = new Float32Array(count * 3);
    this.cols = new Float32Array(count * 3);
    const nseg = closed ? count : count - 1;
    this.segs = new Float32Array(nseg * 6);
    this.segCols = new Float32Array(nseg * 6);
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(this.segs);
    this.geo.setColors(this.segCols);
    this.core = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: width, worldUnits: true, transparent: true, opacity: 1 });
    this.core.toneMapped = false;
    const coreLine = new LineSegments2(this.geo, this.core);
    coreLine.frustumCulled = false;
    this.halo = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: width * 3.4, worldUnits: true, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    this.halo.toneMapped = false;
    const haloLine = new LineSegments2(this.geo, this.halo);
    haloLine.frustumCulled = false;
    haloLine.renderOrder = 2;
    this.group.add(coreLine, haloLine);
  }

  /** Colour gradient from a (σ = 0) to b (σ = π). */
  gradient(a: THREE.Color, b: THREE.Color): void {
    const n = this.count;
    for (let k = 0; k < n; k++) {
      const f = this.closed ? 0 : k / (n - 1);
      this.cols[k * 3] = a.r + (b.r - a.r) * f;
      this.cols[k * 3 + 1] = a.g + (b.g - a.g) * f;
      this.cols[k * 3 + 2] = a.b + (b.b - a.b) * f;
    }
    this.colorsDirty = true;
  }

  look(width: number, opacity: number, haloOpacity: number): void {
    this.core.linewidth = width;
    this.halo.linewidth = width * 3.4;
    this.core.opacity = opacity;
    this.halo.opacity = haloOpacity;
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
    if (this.colorsDirty) {
      const c = this.cols;
      const sc = this.segCols;
      for (let i = 0; i < nseg; i++) {
        const a = i * 3;
        const b = ((i + 1) % n) * 3;
        const o = i * 6;
        sc[o] = c[a];
        sc[o + 1] = c[a + 1];
        sc[o + 2] = c[a + 2];
        sc[o + 3] = c[b];
        sc[o + 4] = c[b + 1];
        sc[o + 5] = c[b + 2];
      }
      (this.geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
      this.colorsDirty = false;
    }
  }
}

/** An open string in the brane-stack view, with its fixed wiring to one or two branes. */
interface StackString {
  glow: Glow;
  spec: OpenStringSpec;
  a: number;
  b: number;
  by: number;
  bz: number;
  ph: number;
  label: CSS2DObject | null;
}

/** A closed string loop that drifts away and fades. */
interface Loop {
  glow: Glow;
  alive: boolean;
  age: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  ph: number;
  r0: number;
  counted: boolean;
}

/** An open string stuck to the brane-world sheet. */
interface WorldString {
  glow: Glow;
  spec: OpenStringSpec;
  cx: number;
  cz: number;
  vx: number;
  vz: number;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.stack.pos, target: CAM.stack.target, fov: 44 });
  const { scene, camera, controls, renderer } = stage;

  // --- State
  let view: View = 'stack';
  let N = 2;
  const pos = [-1.2, 1.2, 0, 2.6];
  const target = [0, 0, 0, 0];
  let animating = false;
  let playing = true;
  let speed = 1;
  let showClosed = true;
  let showLabels = true;
  let nExtra = 2;
  let tt = 0;
  let escaped = false;
  let escapes = 0;

  // Derived (recomputed on geometry change, not every frame)
  let clusters: Cluster[] = [];
  let group = '';
  let vectors = 0;
  let lightest = Infinity;
  let heaviest = 0;
  const clusterOf = [0, 0, 0, 0];

  const colors = BRANE_COLORS.map((c) => new THREE.Color(c));
  const white = new THREE.Color(0xffffff);

  // =========================================================================
  // View 1: brane stack
  // =========================================================================
  const stackGroup = new THREE.Group();
  scene.add(stackGroup);
  const labelGroup = new THREE.Group(); // labels that the label toggle hides
  stackGroup.add(labelGroup);

  const sheetGeo = new THREE.PlaneGeometry(SHEET_W, SHEET_H);
  sheetGeo.rotateY(Math.PI / 2); // sheet spans y and z, normal along x
  const edgeGeo = new THREE.EdgesGeometry(sheetGeo);
  const gridGeo = (() => {
    const v: number[] = [];
    for (let z = -SHEET_W / 2 + 0.4; z < SHEET_W / 2 - 0.01; z += 0.4) v.push(0, -SHEET_H / 2, z, 0, SHEET_H / 2, z);
    for (let y = -SHEET_H / 2 + 0.4; y < SHEET_H / 2 - 0.01; y += 0.4) v.push(0, y, -SHEET_W / 2, 0, y, SHEET_W / 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    return g;
  })();

  const branes = BRANE_COLORS.map((c, i) => {
    const g = new THREE.Group();
    const sheetMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    sheetMat.toneMapped = false;
    const sheet = new THREE.Mesh(sheetGeo, sheetMat);
    sheet.userData.brane = i;
    const edgeMat = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
    edgeMat.toneMapped = false;
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.13, depthWrite: false }));
    g.add(sheet, new THREE.LineSegments(edgeGeo, edgeMat), grid);
    stackGroup.add(g);
    const lab = stage.label('', [0, SHEET_H / 2 + 0.28 + 0.3 * (i % 2), 0], '', g);
    lab.element.style.color = css(c);
    return { g, sheet, sheetMat, lab };
  });

  // Axis showing the separation direction
  {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Y_MIN * XS - 0.3, -SHEET_H / 2 - 0.15, SHEET_W / 2), new THREE.Vector3(Y_MAX * XS + 0.3, -SHEET_H / 2 - 0.15, SHEET_W / 2)]);
    const axis = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }));
    stackGroup.add(axis);
    stage.label('← separation y →', [0.3, -SHEET_H / 2 - 0.42, SHEET_W / 2], 'muted', labelGroup);
  }

  // Strings: two on each brane, one between each pair.
  const strings: StackString[] = [];
  const SELF_BASE: [number, number][] = [[0.55, -0.7], [-0.6, 0.65]];
  for (let i = 0; i < MAXN; i++) {
    for (let k = 0; k < 2; k++) {
      const glow = new Glow(OPEN_PTS, false, 0.045);
      glow.gradient(colors[i], colors[i]);
      glow.look(0.045, 1, 0.2);
      stackGroup.add(glow.group);
      const s = 1 + 0.12 * i;
      strings.push({
        glow, a: i, b: i, by: SELF_BASE[k][0] * (1 - 0.2 * (i % 2)), bz: SELF_BASE[k][1] * (1 - 0.15 * i), ph: i * 1.7 + k * 2.9, label: null,
        spec: {
          xa: 0, xb: 0, yc: 0, zc: 0,
          modes: [
            { n: 1, ax: 0.42 * s, ay: 0.42, az: 0.38, phase: i * 0.9 + k * 2.2 },
            { n: 2, ax: 0.1, ay: 0.12, az: 0.1, phase: 1.3 + i + k },
          ],
        },
      });
    }
  }
  const PAIR_BASE: [number, number][] = [[0.05, 0.1], [-0.95, -0.35], [0.9, 1.25], [0.95, -1.2], [-0.35, 1.2], [-0.9, -1.3]];
  let pi = 0;
  for (let i = 0; i < MAXN; i++) {
    for (let j = i + 1; j < MAXN; j++) {
      const glow = new Glow(OPEN_PTS, false, 0.045);
      glow.gradient(colors[i], colors[j]);
      stackGroup.add(glow.group);
      const label = stage.label('', [0, 0, 0], '', labelGroup);
      strings.push({
        glow, a: i, b: j, by: PAIR_BASE[pi][0], bz: PAIR_BASE[pi][1], ph: pi * 2.3, label,
        spec: {
          xa: 0, xb: 0, yc: 0, zc: 0,
          modes: [
            { n: 1, ax: 0.06, ay: 0.18, az: 0.16, phase: pi * 1.1 },
            { n: 2, ax: 0.04, ay: 0.16, az: 0.12, phase: 0.7 + pi },
            { n: 3, ax: 0.02, ay: 0.08, az: 0.1, phase: 2.1 + pi * 0.5 },
          ],
        },
      });
      pi++;
    }
  }

  // Endpoint beads: two per string, fixed slots.
  const beadGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const beadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  beadMat.toneMapped = false;
  const beads = new THREE.InstancedMesh(beadGeo, beadMat, strings.length * 2);
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  beads.frustumCulled = false;
  {
    const c = new THREE.Color();
    strings.forEach((s, k) => {
      beads.setColorAt(2 * k, c.copy(colors[s.a]).lerp(white, 0.45));
      beads.setColorAt(2 * k + 1, c.copy(colors[s.b]).lerp(white, 0.45));
    });
    if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
  }
  stackGroup.add(beads);

  // Closed strings that detach from the stack
  function makeLoops(n: number, parent: THREE.Object3D): Loop[] {
    const out: Loop[] = [];
    for (let i = 0; i < n; i++) {
      const glow = new Glow(LOOP_PTS, true, 0.035);
      const c = new THREE.Color(GRAVITON);
      glow.gradient(c, c);
      glow.group.visible = false;
      parent.add(glow.group);
      out.push({ glow, alive: false, age: 0, life: 4, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, ph: 0, r0: 0.22, counted: false });
    }
    return out;
  }
  const stackLoops = makeLoops(3, stackGroup);

  // =========================================================================
  // View 2: brane world
  // =========================================================================
  const worldGroup = new THREE.Group();
  worldGroup.visible = false;
  scene.add(worldGroup);
  const worldLabels = new THREE.Group();
  worldGroup.add(worldLabels);
  const WW = 10.5;
  const WD = 6;
  const BULK_H = 2.6;
  {
    const g = new THREE.PlaneGeometry(WW, WD);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    m.toneMapped = false;
    worldGroup.add(new THREE.Mesh(g, m));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.85 }));
    worldGroup.add(e);
    const v: number[] = [];
    for (let x = -WW / 2 + 0.5; x < WW / 2 - 0.01; x += 0.5) v.push(x, 0, -WD / 2, x, 0, WD / 2);
    for (let z = -WD / 2 + 0.5; z < WD / 2 - 0.01; z += 0.5) v.push(-WW / 2, 0, z, WW / 2, 0, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    worldGroup.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.12, depthWrite: false })));
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(WW, 2 * BULK_H, WD)), new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.7 }));
    worldGroup.add(box);
  }
  stage.label('our universe: a 3-brane, drawn as a 2D sheet', [-WW / 2 + 2.6, 0.05, -WD / 2 - 0.35], '', worldLabels).element.style.color = css(PALETTE.cyan);
  stage.label('bulk: extra dimensions', [0, BULK_H + 0.3, -WD / 2], 'muted', worldLabels);
  stage.label('open strings (light, matter): ends stuck to the brane', [-1.6, -0.5, WD / 2 + 0.45], '', worldLabels);
  stage.label('closed strings (gravity): no ends, free to leave', [1.2, BULK_H - 0.2, 0], '', worldLabels).element.style.color = css(GRAVITON);

  const WORLD_COLORS = [PALETTE.cyan, PALETTE.amber, PALETTE.rose, PALETTE.cyan, PALETTE.amber, PALETTE.green, PALETTE.rose, PALETTE.cyan];
  const worldStrings: WorldString[] = WORLD_COLORS.map((c, i) => {
    const glow = new Glow(36, false, 0.05);
    const col = new THREE.Color(c);
    glow.gradient(col, col);
    worldGroup.add(glow.group);
    const a = (i / WORLD_COLORS.length) * TAU;
    return {
      glow,
      cx: -WW / 2 + 0.8 + ((i * 1.37) % 1) * (WW - 1.6),
      cz: -WD / 2 + 0.8 + ((i * 0.61 + 0.2) % 1) * (WD - 1.6),
      vx: 0.35 * Math.cos(a),
      vz: 0.25 * Math.sin(a),
      spec: {
        xa: 0, xb: 0, yc: 0, zc: 0,
        modes: [
          { n: 1, ax: 0.5, ay: 0.42, az: 0.4, phase: i * 1.3 },
          { n: 2, ax: 0.08, ay: 0.1, az: 0.08, phase: i * 0.7 },
        ],
      },
    };
  });
  const worldBeads = new THREE.InstancedMesh(beadGeo, beadMat.clone(), worldStrings.length * 2);
  worldBeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  worldBeads.frustumCulled = false;
  {
    const c = new THREE.Color();
    WORLD_COLORS.forEach((h, i) => {
      c.setHex(h).lerp(white, 0.45);
      worldBeads.setColorAt(2 * i, c);
      worldBeads.setColorAt(2 * i + 1, c);
    });
    if (worldBeads.instanceColor) worldBeads.instanceColor.needsUpdate = true;
  }
  worldGroup.add(worldBeads);
  const worldLoops = makeLoops(5, worldGroup);

  // =========================================================================
  // Overlays: gauge-group banner and the inset canvas
  // =========================================================================
  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', zIndex: '2', pointerEvents: 'none',
    padding: '6px 14px', borderRadius: '10px', background: 'rgba(7,10,18,0.78)', border: '1px solid #243049',
    textAlign: 'center', fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: '#dfe6f3', transition: 'border-color 0.4s, box-shadow 0.4s',
    maxWidth: '90%',
  } as CSSStyleDeclaration);
  const bannerMain = document.createElement('div');
  bannerMain.style.font = '700 17px JetBrains Mono, ui-monospace, monospace';
  const bannerSub = document.createElement('div');
  bannerSub.style.cssText = 'font-size:11.5px;color:#9aa6bd;margin-top:2px';
  banner.append(bannerMain, bannerSub);
  viewport.appendChild(banner);
  let bannerTimer = 0;

  const pNote = document.createElement('div');
  pNote.textContent = 'Each sheet stands for a Dp-brane. Real branes can have any dimension p from 0 to 9.';
  Object.assign(pNote.style, {
    position: 'absolute', left: '12px', bottom: '32px', width: '250px', zIndex: '2', pointerEvents: 'none',
    font: '11.5px/1.4 JetBrains Mono, ui-monospace, monospace', color: '#8391ab',
  } as CSSStyleDeclaration);
  viewport.appendChild(pNote);

  const inset = document.createElement('canvas');
  inset.width = 440;
  inset.height = 400;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '190px', height: '173px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const MONO = 'JetBrains Mono, ui-monospace, monospace';

  function drawChanPaton(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `26px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('Chan–Paton sectors (i, j)', 18, 36);
    const size = Math.min(78, 250 / N);
    const x0 = 70 + (4 * 62 - N * size) / 2;
    const y0 = 76;
    c.font = `600 22px ${MONO}`;
    for (let i = 0; i < N; i++) {
      c.fillStyle = css(BRANE_COLORS[i]);
      c.fillText(String(i + 1), x0 - 28, y0 + i * size + size / 2 + 8);
      c.fillText(String(i + 1), x0 + i * size + size / 2 - 7, y0 - 10);
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = x0 + j * size;
        const y = y0 + i * size;
        const same = clusterOf[i] === clusterOf[j];
        if (same) {
          const g = c.createLinearGradient(x, y, x + size, y + size);
          g.addColorStop(0, css(BRANE_COLORS[i]));
          g.addColorStop(1, css(BRANE_COLORS[j]));
          c.fillStyle = g;
          c.globalAlpha = 0.85;
          c.fillRect(x + 3, y + 3, size - 6, size - 6);
          c.globalAlpha = 1;
        } else {
          c.fillStyle = '#141b2b';
          c.fillRect(x + 3, y + 3, size - 6, size - 6);
          c.fillStyle = '#8391ab';
          c.font = `${size > 60 ? 19 : 16}px ${MONO}`;
          const m = stretchedMass(pos[i] - pos[j]).toFixed(2);
          c.fillText(m, x + size / 2 - c.measureText(m).width / 2, y + size / 2 + 7);
        }
      }
    }
    c.font = `23px ${MONO}`;
    c.fillStyle = '#dfe6f3';
    c.fillText(`lit: massless  ${vectors} of ${sectorCount(N)}`, 18, H - 44);
    c.fillStyle = '#8391ab';
    c.fillText('dark: stretched, mass y/2π', 18, H - 16);
  }

  function drawForceLaw(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `26px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('gravity vs distance (ADD)', 18, 36);
    const x0 = 60;
    const x1 = W - 20;
    const y0 = H - 70;
    const y1 = 64;
    const lr0 = -2;
    const lr1 = 2; // log10(r/R)
    const lf = (r: number) => Math.log10(addForce(r, 1, nExtra));
    const fTop = lf(10 ** lr0);
    const fBot = -4;
    const X = (l: number) => x0 + ((l - lr0) / (lr1 - lr0)) * (x1 - x0);
    const Y = (f: number) => y1 + ((fTop - f) / (fTop - fBot)) * (y0 - y1);
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, y1 - 10);
    c.lineTo(x0, y0);
    c.lineTo(x1, y0);
    c.stroke();
    c.setLineDash([6, 8]);
    c.beginPath();
    c.moveTo(X(0), y1);
    c.lineTo(X(0), y0);
    c.stroke();
    // Newton, dashed
    c.strokeStyle = '#8391ab';
    c.beginPath();
    c.moveTo(X(lr0), Y(-2 * lr0));
    c.lineTo(X(lr1), Y(-2 * lr1));
    c.stroke();
    c.setLineDash([]);
    // ADD
    c.strokeStyle = css(GRAVITON);
    c.lineWidth = 5;
    c.beginPath();
    for (let k = 0; k <= 40; k++) {
      const l = lr0 + ((lr1 - lr0) * k) / 40;
      const x = X(l);
      const y = Math.min(y0, Math.max(y1 - 10, Y(lf(10 ** l))));
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.font = `23px ${MONO}`;
    c.fillStyle = css(GRAVITON);
    c.fillText(`1/r^${2 + nExtra}`, X(-1.1) + 16, Y(lf(10 ** -1.1)));
    c.fillStyle = '#8391ab';
    c.fillText('1/r²', X(0.9), Y(-1.8) - 12);
    c.fillText('r = R', X(0) - 26, y0 + 26);
    c.fillText('log r →', x1 - 84, y0 + 26);
    c.fillStyle = '#dfe6f3';
    c.fillText('tests: 1/r² holds to ~50 μm', 18, H - 14);
  }

  function drawInset(): void {
    if (view === 'stack') drawChanPaton();
    else drawForceLaw();
  }

  // =========================================================================
  // Geometry bookkeeping
  // =========================================================================
  let prevGroup = '';
  let prevVectors = 0;
  let prevN = 0;
  const activePos: number[] = [];

  function recompute(final: boolean): void {
    activePos.length = N;
    for (let i = 0; i < N; i++) activePos[i] = pos[i];
    clusters = clusterBranes(activePos);
    clusters.forEach((cl, ci) => cl.members.forEach((m) => (clusterOf[m] = ci)));
    group = gaugeGroupOf(clusters);
    vectors = masslessVectors(activePos);
    const sectors = stretchedSectors(activePos);
    lightest = sectors.length ? sectors[0].M : Infinity;
    heaviest = sectors.length ? sectors[sectors.length - 1].M : 0;

    // Brane labels: one per stack, on its lowest-numbered member.
    for (let i = 0; i < MAXN; i++) {
      const b = branes[i];
      b.g.visible = i < N;
      if (i >= N) continue;
      const cl = clusters[clusterOf[i]];
      const lead = cl.members[0] === i;
      b.lab.visible = lead && showLabels;
      if (lead) {
        const k = cl.members.length;
        b.lab.element.textContent = k === 1 ? `brane ${i + 1}: U(1)` : `branes ${cl.members.map((m) => m + 1).join('+')}: U(${k})`;
        b.lab.element.style.color = k === 1 ? css(BRANE_COLORS[i]) : '#ffffff';
      }
      b.sheetMat.opacity = 0.1;
    }
    // Stretched-string labels: only between neighbouring stacks, to keep the scene readable.
    for (const s of strings) {
      if (!s.label) continue;
      const on = s.a < N && s.b < N && Math.abs(clusterOf[s.a] - clusterOf[s.b]) === 1 && clusters[clusterOf[s.a]].members[0] === s.a && clusters[clusterOf[s.b]].members[0] === s.b;
      s.label.visible = on;
      if (on) s.label.element.textContent = `M = ${stretchedMass(pos[s.a] - pos[s.b]).toFixed(2)}`;
    }
    for (let k = 0; k < strings.length; k++) {
      const s = strings[k];
      s.glow.group.visible = s.a < N && s.b < N;
    }

    // Banner
    // Celebrate only when branes move. Adding or removing a brane is not a symmetry change.
    if (final && prevGroup && group !== prevGroup && N === prevN) {
      const up = vectors > prevVectors;
      bannerMain.textContent = `${prevGroup} → ${group}`;
      bannerMain.style.color = up ? css(PALETTE.green) : css(PALETTE.amber);
      bannerSub.textContent = up ? 'Symmetry enhanced. Stretched strings shrank to zero length and became massless.' : 'Symmetry broken. Stretched strings now have length, so they gain mass (Higgs).';
      banner.style.borderColor = up ? css(PALETTE.green) : css(PALETTE.amber);
      banner.style.boxShadow = up ? '0 0 24px rgba(94,227,154,0.35)' : '0 0 18px rgba(245,182,66,0.25)';
      bannerTimer = 4.5;
    }
    if (bannerTimer <= 0) plainBanner();
    if (final) {
      prevGroup = group;
      prevVectors = vectors;
      prevN = N;
    }
    updateReadouts();
    if (view === 'stack') drawInset();
  }

  function plainBanner(): void {
    bannerMain.textContent = `gauge group ${group}`;
    bannerMain.style.color = '#dfe6f3';
    bannerSub.textContent = `${vectors} massless vector${vectors === 1 ? '' : 's'} (Σk²) of ${sectorCount(N)} sectors (N²)`;
    banner.style.borderColor = '#243049';
    banner.style.boxShadow = 'none';
  }

  // =========================================================================
  // Per-frame updates
  // =========================================================================
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vS = new THREE.Vector3();
  const vP = new THREE.Vector3();
  const euler = new THREE.Euler();
  const qTmp = new THREE.Quaternion();

  function setBead(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, scale: number): void {
    m4.compose(vP.set(x, y, z), qI, vS.setScalar(scale));
    mesh.setMatrixAt(i, m4);
  }

  function updateStack(t: number): void {
    for (let i = 0; i < MAXN; i++) branes[i].g.position.x = pos[i] * XS;
    for (let k = 0; k < strings.length; k++) {
      const s = strings[k];
      if (!s.glow.group.visible) {
        setBead(beads, 2 * k, 0, 0, 0, 0);
        setBead(beads, 2 * k + 1, 0, 0, 0, 0);
        continue;
      }
      const sp = s.spec;
      sp.xa = pos[s.a] * XS;
      sp.xb = pos[s.b] * XS;
      sp.yc = s.by + 0.3 * Math.sin(0.23 * t + s.ph);
      sp.zc = s.bz + 0.4 * Math.sin(0.17 * t + 1.3 * s.ph);
      writeOpenString(s.glow.pts, OPEN_PTS, t * 1.6, sp);
      if (s.a !== s.b) {
        // Heavier strings are drawn thicker and brighter.
        const M = stretchedMass(pos[s.a] - pos[s.b]);
        const f = Math.min(1, M / HEAVY);
        s.glow.look(0.03 + 0.035 * f, 0.9, 0.1 + 0.22 * f);
        if (s.label && s.label.visible) s.label.position.set((sp.xa + sp.xb) / 2, sp.yc + 0.45, sp.zc);
      }
      s.glow.commit();
      const p = s.glow.pts;
      const e = (OPEN_PTS - 1) * 3;
      setBead(beads, 2 * k, p[0], p[1], p[2], 1);
      setBead(beads, 2 * k + 1, p[e], p[e + 1], p[e + 2], 1);
    }
    beads.instanceMatrix.needsUpdate = true;
  }

  function updateWorld(t: number, dt: number): void {
    const hx = WW / 2 - 0.7;
    const hz = WD / 2 - 0.7;
    for (let i = 0; i < worldStrings.length; i++) {
      const w = worldStrings[i];
      w.cx += w.vx * dt;
      w.cz += w.vz * dt;
      if (w.cx > hx || w.cx < -hx) w.vx = -w.vx;
      if (w.cz > hz || w.cz < -hz) w.vz = -w.vz;
      w.spec.yc = w.cx;
      w.spec.zc = w.cz;
      writeOpenString(w.glow.pts, w.glow.count, t * 1.6, w.spec);
      // Physics x (Dirichlet, transverse) becomes world y. Physics y along the brane becomes world x.
      const p = w.glow.pts;
      for (let k = 0; k < w.glow.count; k++) {
        const o = k * 3;
        const px = p[o];
        p[o] = p[o + 1];
        p[o + 1] = px;
      }
      w.glow.commit();
      const e = (w.glow.count - 1) * 3;
      setBead(worldBeads, 2 * i, p[0], p[1], p[2], 1);
      setBead(worldBeads, 2 * i + 1, p[e], p[e + 1], p[e + 2], 1);
    }
    worldBeads.instanceMatrix.needsUpdate = true;
  }

  function spawnLoop(loops: Loop[], world: boolean): void {
    const L = loops.find((l) => !l.alive);
    if (!L) return;
    L.alive = true;
    L.age = 0;
    L.ph = Math.random() * TAU;
    L.spin = (Math.random() - 0.5) * 1.6;
    if (world) {
      L.pos.set((Math.random() - 0.5) * (WW - 2), 0, (Math.random() - 0.5) * (WD - 2));
      const up = Math.random() < 0.5 ? -1 : 1;
      L.vel.set((Math.random() - 0.5) * 0.4, up * (0.75 + 0.3 * Math.random()), (Math.random() - 0.5) * 0.3);
      L.life = 4.2;
      L.r0 = 0.32;
    } else {
      // Leave from a random brane, heading off into the bulk away from the stack.
      const i = Math.floor(Math.random() * N);
      L.pos.set(pos[i] * XS, (Math.random() - 0.5) * (SHEET_H - 1.2), (Math.random() - 0.5) * (SHEET_W - 1.2));
      const side = pos[i] >= 0 ? 1 : -1;
      L.vel.set(side * (0.25 + 0.3 * Math.random()), 0.45 + 0.3 * Math.random(), (Math.random() - 0.2) * 0.6);
      L.life = 4.5;
      L.r0 = 0.2;
    }
    euler.set(Math.random() * TAU, Math.random() * TAU, 0);
    L.glow.group.quaternion.setFromEuler(euler);
    L.glow.group.visible = true;
  }

  function updateLoops(loops: Loop[], dt: number, t: number, world: boolean): void {
    for (const L of loops) {
      if (!L.alive) continue;
      L.age += dt;
      L.pos.addScaledVector(L.vel, dt);
      L.glow.group.position.copy(L.pos);
      qTmp.setFromAxisAngle(vP.set(0, 1, 0), L.spin * dt);
      L.glow.group.quaternion.multiply(qTmp);
      if (world && !L.counted && Math.abs(L.pos.y) > BULK_H - 1.0) {
        L.counted = true;
        escapes++;
        if (view === 'world') escaped = true;
      }
      const fadeIn = Math.min(1, L.age / 0.4);
      const fadeOut = Math.max(0, Math.min(1, (L.life - L.age) / 1.4));
      const a = fadeIn * fadeOut;
      L.glow.look(0.035, a, 0.22 * a);
      // Closed string: left and right movers ripple around the loop.
      const p = L.glow.pts;
      const w = t * 2.2 + L.ph;
      for (let k = 0; k < LOOP_PTS; k++) {
        const s = (k / LOOP_PTS) * TAU;
        const r = L.r0 * (1 + 0.2 * Math.cos(2 * s - w) + 0.14 * Math.cos(3 * s + w));
        p[k * 3] = r * Math.cos(s);
        p[k * 3 + 1] = r * Math.sin(s);
        p[k * 3 + 2] = 0.07 * Math.sin(2 * s + w);
      }
      L.glow.commit();
      if (L.age >= L.life) {
        L.alive = false;
        L.glow.group.visible = false;
        L.counted = false;
      }
    }
  }

  function hideLoops(loops: Loop[]): void {
    for (const L of loops) {
      L.alive = false;
      L.glow.group.visible = false;
      L.counted = false;
    }
  }

  let spawnStack = 1.5;
  let spawnWorld = 0.4;
  let recomputeTimer = 0;

  stage.onFrame((dt) => {
    // Brane motion from the Stack and Spread buttons
    if (animating) {
      // Ease in, but never slower than a steady glide, so the move always finishes in about a second.
      const k = 1 - Math.exp(-dt * 3.2);
      let done = true;
      for (let i = 0; i < N; i++) {
        const d = target[i] - pos[i];
        const step = Math.min(Math.abs(d), Math.max(Math.abs(d) * k, 1.6 * dt));
        pos[i] += Math.sign(d) * step;
        if (Math.abs(target[i] - pos[i]) > 1e-9) done = false;
      }
      if (done) {
        for (let i = 0; i < N; i++) pos[i] = target[i];
        animating = false;
        syncSliders();
        recompute(true);
      } else {
        recomputeTimer -= dt;
        if (recomputeTimer <= 0) {
          recomputeTimer = 0.15;
          recompute(false);
        }
      }
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) plainBanner();
    }

    const sdt = playing ? dt * speed : 0;
    tt += sdt;
    if (view === 'stack') {
      updateStack(tt);
      if (showClosed && playing) {
        spawnStack -= sdt;
        if (spawnStack <= 0) {
          spawnStack = 2.2 + Math.random() * 1.6;
          spawnLoop(stackLoops, false);
        }
      }
      updateLoops(stackLoops, sdt, tt, false);
    } else {
      updateWorld(tt, sdt);
      if (showClosed && playing) {
        spawnWorld -= sdt;
        if (spawnWorld <= 0) {
          spawnWorld = 0.9 + Math.random() * 0.9;
          spawnLoop(worldLoops, true);
        }
      }
      updateLoops(worldLoops, sdt, tt, true);
    }
  });

  // =========================================================================
  // Dragging branes in the scene
  // =========================================================================
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits: THREE.Intersection[] = [];
  const dragPlane = new THREE.Plane();
  const camDir = new THREE.Vector3();
  const hitPt = new THREE.Vector3();
  const pickable: THREE.Object3D[] = [];
  let dragIdx = -1;

  function pick(ev: PointerEvent): number {
    if (view !== 'stack') return -1;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    pickable.length = 0;
    for (let i = 0; i < N; i++) pickable.push(branes[i].sheet);
    hits.length = 0;
    raycaster.intersectObjects(pickable, false, hits);
    if (!hits.length) return -1;
    hitPt.copy(hits[0].point);
    return hits[0].object.userData.brane as number;
  }

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const i = pick(ev);
    if (i < 0) return;
    dragIdx = i;
    animating = false;
    controls.enabled = false;
    camera.getWorldDirection(camDir);
    camDir.x = 0;
    if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, 1);
    camDir.normalize();
    dragPlane.setFromNormalAndCoplanarPoint(camDir, hitPt);
    renderer.domElement.setPointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (ev: PointerEvent) => {
    if (dragIdx < 0) {
      if (ev.buttons === 0) renderer.domElement.style.cursor = pick(ev) >= 0 ? 'grab' : '';
      return;
    }
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPt)) return;
    setBrane(dragIdx, hitPt.x / XS, true);
  };
  const onUp = (ev: PointerEvent) => {
    if (dragIdx < 0) return;
    dragIdx = -1;
    controls.enabled = true;
    if (renderer.domElement.hasPointerCapture(ev.pointerId)) renderer.domElement.releasePointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = '';
  };
  // Capture phase on the viewport runs before OrbitControls sees the event on the canvas.
  viewport.addEventListener('pointerdown', onDown, { capture: true });
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'stack', label: 'Brane stack' }, { value: 'world', label: 'Brane world' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
  ]);
  ui.slider({ key: 'speed', label: 'Speed', min: 0.1, max: 2, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.toggle({ key: 'closed', label: 'Closed strings (gravitons)', value: showClosed, onChange: (v) => { showClosed = v; if (!v) { hideLoops(stackLoops); hideLoops(worldLoops); } } });
  ui.toggle({ key: 'labels', label: 'Labels', value: showLabels, onChange: (v) => { showLabels = v; applyLabels(); } });

  ui.section('Brane stack');
  const stackCtl = () => { if (view !== 'stack') viewCtl.set('stack'); };
  ui.slider({
    key: 'N', label: 'Number of branes N', min: 1, max: MAXN, step: 1, value: N,
    onInput: (v) => { stackCtl(); N = v; animating = false; snapAll(); showSliders(); recompute(true); },
  });
  const sliders: Control<number>[] = [];
  for (let i = 0; i < MAXN; i++) {
    sliders.push(ui.slider({
      key: `y${i + 1}`, label: `Brane ${i + 1} position y${'₁₂₃₄'[i]}`, min: Y_MIN, max: Y_MAX, step: Y_STEP, value: pos[i],
      format: (v) => v.toFixed(2),
      onInput: (v) => { stackCtl(); setBrane(i, v, false); },
    }));
    (sliders[i].el.querySelector('label') as HTMLElement).style.color = css(BRANE_COLORS[i]);
  }
  ui.buttons([
    { label: 'Stack all', primary: true, onClick: () => stackAll() },
    { label: 'Spread out', onClick: () => spreadOut() },
  ]);

  ui.section('Brane world');
  ui.slider({
    key: 'nx', label: 'Extra dimensions n (inset)', min: 1, max: 6, step: 1, value: nExtra,
    onInput: (v) => { nExtra = v; if (view !== 'world') viewCtl.set('world'); else drawInset(); },
  });

  ui.section('Readouts');
  const rGroup = ui.readout('group', 'gauge group');
  const rVec = ui.readout('vectors', 'massless vectors Σk²');
  const rMW = ui.readout('mW', "lightest stretched M");
  const rSec = ui.readout('sectors', 'sectors N²');
  ui.legend([
    ...BRANE_COLORS.map((c, i) => ({ color: css(c), label: `brane ${i + 1}` })),
    { color: css(GRAVITON), label: 'closed string' },
  ]);
  ui.note("Masses in units of 1/√α′ with α′ = 1. Drag a sheet in the scene or use the sliders. Branes within 0.12 snap together.");

  function updateReadouts(): void {
    rGroup(group);
    rVec(vectors);
    rMW(Number.isFinite(lightest) ? lightest.toFixed(3) : 'none (one stack)');
    rSec(sectorCount(N));
  }

  function showSliders(): void {
    for (let i = 0; i < MAXN; i++) sliders[i].el.style.display = i < N ? '' : 'none';
  }

  function syncSliders(): void {
    for (let i = 0; i < MAXN; i++) sliders[i].set(pos[i], false);
  }

  /** Snap v onto another active brane when close, and quantise to the slider step. */
  function snapValue(i: number, v: number): number {
    v = Math.min(Y_MAX, Math.max(Y_MIN, Math.round(v / Y_STEP) * Y_STEP));
    v = Number(v.toFixed(2));
    for (let j = 0; j < N; j++) if (j !== i && Math.abs(v - pos[j]) < SNAP) return pos[j];
    return v;
  }

  function snapAll(): void {
    for (let i = 1; i < N; i++) pos[i] = snapValue(i, pos[i]);
  }

  function setBrane(i: number, v: number, fromDrag: boolean): void {
    animating = false;
    const s = snapValue(i, v);
    if (s === pos[i] && !fromDrag) {
      sliders[i].set(s, false);
      return;
    }
    if (s === pos[i]) return;
    pos[i] = s;
    sliders[i].set(s, false);
    recompute(true);
  }

  function stackAll(): void {
    stackCtl();
    let m = 0;
    for (let i = 0; i < N; i++) m += pos[i];
    m = Number((Math.round(m / N / Y_STEP) * Y_STEP).toFixed(2));
    for (let i = 0; i < N; i++) target[i] = m;
    animating = true;
  }

  function spreadOut(): void {
    stackCtl();
    const order = [0, 1, 2, 3].slice(0, N).sort((a, b) => pos[a] - pos[b] || a - b);
    order.forEach((b, r) => {
      target[b] = N === 1 ? 0 : Number((-2.4 + (4.8 * r) / (N - 1)).toFixed(2));
    });
    animating = true;
  }

  function applyLabels(): void {
    labelGroup.visible = showLabels;
    worldLabels.visible = showLabels;
    pNote.style.display = view === 'stack' && showLabels ? '' : 'none';
    recompute(false); // brane labels live on the brane groups and are set there
  }

  function setView(v: View): void {
    view = v;
    stackGroup.visible = v === 'stack';
    worldGroup.visible = v === 'world';
    banner.style.display = v === 'stack' ? '' : 'none';
    pNote.style.display = v === 'stack' && showLabels ? '' : 'none';
    hideLoops(v === 'stack' ? worldLoops : stackLoops);
    if (v === 'world') spawnWorld = 0.3;
    const c = CAM[v];
    stage.flyTo(c.pos, c.target, 1.2);
    drawInset();
  }

  showSliders();
  recompute(true);
  plainBanner();
  updateStack(0);

  return {
    state: () => ({
      view, N,
      y1: pos[0], y2: pos[1], y3: pos[2], y4: pos[3],
      group, vectors, sectors: sectorCount(N), clusters: clusters.length,
      lightest: Number.isFinite(lightest) ? lightest : 0,
      heaviest, escaped, escapes, playing, speed, showClosed, nExtra,
    }),
    dispose: () => {
      viewport.removeEventListener('pointerdown', onDown, { capture: true });
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      banner.remove();
      pNote.remove();
      inset.remove();
      stage.dispose();
      // Shared geometries not reached by the scene traversal after removal are disposed explicitly.
      sheetGeo.dispose();
      edgeGeo.dispose();
      gridGeo.dispose();
      beadGeo.dispose();
    },
  };
}

const topic: Topic = {
  id: 'branes',
  number: 20,
  symbol: 'Br',
  title: 'D-Branes',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'Surfaces where open strings end.',
  content,
  mount,
};

export default topic;
