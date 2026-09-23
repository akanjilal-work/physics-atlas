import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  EPS0, MU0, barMagnet, biotSavart, capB, circulation, coilEmf, coilLinkage, coulombField, currentLoop, discFluxY,
  enclosedCharge, enclosedCurrents, fibonacciDirs, inGap, surfaceFlux, surfaceLevel, traceLine,
  type CapParams, type CoilParams, type PointCharge, type Shape, type Surface, type Vec3Fn, type WireSet,
} from './physics.ts';

type View = 'gaussE' | 'gaussB' | 'faraday' | 'ampere';
type Source = 'loop' | 'magnet';
type Motion = 'pass' | 'oscillate';

const COL_E = 0xff7a45; // electric field (same as the EM waves page)
const COL_B = 0x5b9dff; // magnetic field
const COL_POS = PALETTE.amber;
const COL_NEG = PALETTE.cyan;
const COL_SURF = PALETTE.violet;
const COL_OUT = PALETTE.green;
const COL_IN = PALETTE.rose;
const COPPER = 0xd8894a;
const nC = 1e-9;

const CAM: Record<View, [number, number, number]> = {
  gaussE: [0.6, 1.2, 10.5], gaussB: [3.2, 3.6, 9.6], faraday: [2.4, 3.2, 10.2], ampere: [3.6, 3.0, 8.4],
};
const TGT: Record<View, [number, number, number]> = {
  gaussE: [0, 0, 0], gaussB: [0, 0.2, 0], faraday: [0, 0, 0], ampere: [0, 0, 0],
};

const CHARGE_POS: [number, number, number][] = [[-1.6, 0.4, 0], [1.3, 0.7, 0], [-0.1, -1.5, 0]];
const LPN = 6; // field lines drawn per nC
const MAXPTS = 700; // points per traced line
const MAXLINES = 72;

// Faraday geometry (metres)
const COIL_R = 0.6;
const COIL_L = 0.8;
const MAG_HALF = 0.5;
const PASS_X = 4;

// Capacitor geometry
const PLATE_A = 1;
const GAP_D = 0.6;

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

/** Many arrows in two draw calls: a LineSegments for the shafts and an InstancedMesh for the heads. */
class ArrowGrid {
  readonly group = new THREE.Group();
  private pos: Float32Array;
  private col: Float32Array;
  private shafts: THREE.LineSegments;
  private heads: THREE.InstancedMesh;
  private base: THREE.Color;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private d = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();
  private static up = new THREE.Vector3(0, 1, 0);

  constructor(readonly cap: number, color: number) {
    this.base = new THREE.Color(color);
    this.pos = new Float32Array(cap * 6);
    this.col = new Float32Array(cap * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.shafts = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.shafts.frustumCulled = false;
    const cone = new THREE.ConeGeometry(0.045, 0.13, 8);
    this.heads = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.heads.setColorAt(i, this.base);
    this.group.add(this.shafts, this.heads);
  }

  /** Arrow i from (x, y, z) along unit (dx, dy, dz), total length len, brightness b in [0, 1]. */
  set(i: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, b: number): void {
    const head = Math.min(0.13, len * 0.5);
    const o = i * 6;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.pos[o + 3] = x + dx * (len - head);
    this.pos[o + 4] = y + dy * (len - head);
    this.pos[o + 5] = z + dz * (len - head);
    const k = 0.25 + 0.75 * b;
    this.c.copy(this.base).multiplyScalar(k);
    this.col[o] = this.c.r * 0.35;
    this.col[o + 1] = this.c.g * 0.35;
    this.col[o + 2] = this.c.b * 0.35;
    this.col[o + 3] = this.c.r;
    this.col[o + 4] = this.c.g;
    this.col[o + 5] = this.c.b;
    this.d.set(dx, dy, dz);
    this.q.setFromUnitVectors(ArrowGrid.up, this.d);
    this.v.set(x + dx * (len - head * 0.5), y + dy * (len - head * 0.5), z + dz * (len - head * 0.5));
    const sc = head / 0.13;
    this.s.set(sc, sc, sc);
    this.m4.compose(this.v, this.q, this.s);
    this.heads.setMatrixAt(i, this.m4);
    this.heads.setColorAt(i, this.c);
  }

  commit(n: number): void {
    const g = this.shafts.geometry;
    g.setDrawRange(0, n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.heads.count = n;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}

/** Field lines stored as segments in one preallocated buffer. */
class LineSet {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private n = 0;
  constructor(readonly capSegs: number, color: number, opacity = 0.8) {
    this.pos = new Float32Array(capSegs * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    this.mesh.frustumCulled = false;
  }
  begin(): void { this.n = 0; }
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    if (this.n >= this.capSegs) return;
    const o = this.n * 6;
    this.pos[o] = ax; this.pos[o + 1] = ay; this.pos[o + 2] = az;
    this.pos[o + 3] = bx; this.pos[o + 4] = by; this.pos[o + 5] = bz;
    this.n++;
  }
  polyline(pts: Float32Array, off: number, count: number): void {
    for (let i = 0; i + 1 < count; i++) {
      const o = off + i * 3;
      this.seg(pts[o], pts[o + 1], pts[o + 2], pts[o + 3], pts[o + 4], pts[o + 5]);
    }
  }
  end(): void {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

function makeOverlay(viewport: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'stage-overlay';
  Object.assign(d.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(d);
  return d;
}

const fmtSig = (v: number, digits = 3): string => {
  if (!Number.isFinite(v)) return '…';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a < 1e-3 || a >= 1e5) return v.toExponential(digits - 1);
  return v.toPrecision(digits);
};

// ---------------------------------------------------------------------------

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.gaussE, target: TGT.gaussE, fov: 45 });
  const { scene, camera, renderer, controls } = stage;

  let view: View = 'gaussE';
  let showLines = true;
  let showArrows = true;

  const groups: Record<View, THREE.Group> = { gaussE: new THREE.Group(), gaussB: new THREE.Group(), faraday: new THREE.Group(), ampere: new THREE.Group() };
  for (const g of Object.values(groups)) scene.add(g);

  const scratch = new Float32Array(MAXLINES * MAXPTS * 3);
  const lineOff = new Int32Array(MAXLINES);
  const lineCnt = new Int32Array(MAXLINES);
  const lineDir = new Int8Array(MAXLINES);
  const F3 = new Float64Array(3);

  // ===================================================================
  // Gaussian surface (shared visual for the two Gauss views)
  // ===================================================================
  const surf: Record<'gaussE' | 'gaussB', Surface> = {
    gaussE: { shape: 'sphere', cx: -1.6, cy: 0.4, cz: 0, size: 0.8 },
    gaussB: { shape: 'sphere', cx: 2.6, cy: 1.8, cz: 0, size: 0.7 },
  };
  const surfGroup = new THREE.Group();
  scene.add(surfGroup);
  const surfMat = new THREE.MeshBasicMaterial({ color: COL_SURF, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), surfMat);
  const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), surfMat);
  const wireMat = new THREE.LineBasicMaterial({ color: COL_SURF, transparent: true, opacity: 0.55 });
  const sphereWire = (() => {
    const pts: number[] = [];
    const ring = (f: (t: number) => [number, number, number]) => {
      for (let k = 0; k < 64; k++) {
        pts.push(...f((2 * Math.PI * k) / 64), ...f((2 * Math.PI * (k + 1)) / 64));
      }
    };
    for (const lat of [-60, -30, 0, 30, 60]) {
      const y = Math.sin((lat * Math.PI) / 180);
      const r = Math.cos((lat * Math.PI) / 180);
      ring((t) => [r * Math.cos(t), y, r * Math.sin(t)]);
    }
    for (let m = 0; m < 6; m++) {
      const a = (m * Math.PI) / 6;
      ring((t) => [Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, wireMat);
  })();
  const cubeWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), wireMat);
  surfGroup.add(sphereMesh, cubeMesh, sphereWire, cubeWire);
  const surfLabel = stage.label('', [0, 0, 0]);
  (surfLabel.element as HTMLElement).style.color = css(COL_SURF);

  const MAXMARK = 400;
  const marks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXMARK);
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  marks.count = 0;
  marks.frustumCulled = false;
  scene.add(marks);
  const colOut = new THREE.Color(COL_OUT);
  const colIn = new THREE.Color(COL_IN);
  for (let i = 0; i < MAXMARK; i++) marks.setColorAt(i, colOut);

  const activeSurf = (): Surface => (view === 'gaussB' ? surf.gaussB : surf.gaussE);

  function placeSurface(): void {
    const s = activeSurf();
    surfGroup.position.set(s.cx, s.cy, s.cz);
    surfGroup.scale.setScalar(s.size);
    const sph = s.shape === 'sphere';
    sphereMesh.visible = sphereWire.visible = sph;
    cubeMesh.visible = cubeWire.visible = !sph;
    surfLabel.position.set(s.cx, s.cy + s.size + 0.3, s.cz);
  }

  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vS = new THREE.Vector3(1, 1, 1);
  const vP = new THREE.Vector3();

  /** Mark where traced lines cross the surface: green outward along the field, rose inward. */
  function markCrossings(s: Surface, nLines: number): { out: number; inn: number } {
    let n = 0;
    let out = 0;
    let inn = 0;
    for (let L = 0; L < nLines; L++) {
      const off = lineOff[L];
      const cnt = lineCnt[L];
      let prev = surfaceLevel(s, scratch[off], scratch[off + 1], scratch[off + 2]);
      for (let i = 1; i < cnt; i++) {
        const o = off + i * 3;
        const lv = surfaceLevel(s, scratch[o], scratch[o + 1], scratch[o + 2]);
        if ((prev < 0) !== (lv < 0)) {
          const leaving = prev < 0; // along the traced direction
          const outward = leaving === lineDir[L] > 0;
          if (outward) out++;
          else inn++;
          if (n < MAXMARK) {
            const f = prev / (prev - lv);
            vP.set(
              scratch[o - 3] + f * (scratch[o] - scratch[o - 3]),
              scratch[o - 2] + f * (scratch[o + 1] - scratch[o - 2]),
              scratch[o - 1] + f * (scratch[o + 2] - scratch[o - 1]),
            );
            m4.compose(vP, qI, vS);
            marks.setMatrixAt(n, m4);
            marks.setColorAt(n, outward ? colOut : colIn);
            n++;
          }
        }
        prev = lv;
      }
    }
    marks.count = n;
    marks.instanceMatrix.needsUpdate = true;
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
    return { out, inn };
  }

  // ===================================================================
  // View 1: Gauss's law for E
  // ===================================================================
  const gE = groups.gaussE;
  const qVals = [2, -1, 1]; // nC
  const charges: PointCharge[] = CHARGE_POS.map(([x, y, z], i) => ({ x, y, z, q: qVals[i] * nC }));
  const Efield: Vec3Fn = (x, y, z, o) => coulombField(charges, x, y, z, o);
  const chargeMeshes = CHARGE_POS.map(([x, y, z]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: COL_POS, emissive: COL_POS, emissiveIntensity: 0.5, roughness: 0.4 }));
    m.position.set(x, y, z);
    gE.add(m);
    return m;
  });
  const chargeLabels = CHARGE_POS.map(([x, y, z]) => stage.label('', [x + 0.05, y - 0.38, z], '', gE));
  const eLines = new LineSet(MAXLINES * MAXPTS, COL_E, 0.75);
  gE.add(eLines.mesh);
  const eArrows = new ArrowGrid(260, COL_E);
  gE.add(eArrows.group);

  let eDirty = true;
  let eLinesDirty = true;
  let eNLines = 0;
  let fluxE = 0;
  let qEnc = 0;
  let nEnc = 0;
  let minGap = Infinity;
  let eNetLines = 0;

  function paintCharges(): void {
    charges.forEach((c, i) => {
      c.q = qVals[i] * nC;
      const mat = chargeMeshes[i].material as THREE.MeshStandardMaterial;
      const col = qVals[i] > 0 ? COL_POS : qVals[i] < 0 ? COL_NEG : 0x55607a;
      mat.color.setHex(col);
      mat.emissive.setHex(col);
      chargeMeshes[i].scale.setScalar(0.6 + 0.2 * Math.abs(qVals[i]));
      const el = chargeLabels[i].element as HTMLElement;
      el.textContent = `q${i + 1} = ${qVals[i] > 0 ? '+' : ''}${qVals[i]} nC`;
      el.style.color = css(col);
    });
  }

  function traceE(): void {
    let L = 0;
    let off = 0;
    for (let ci = 0; ci < charges.length; ci++) {
      const c = charges[ci];
      if (c.q === 0) continue;
      const nl = Math.round(LPN * Math.abs(qVals[ci]));
      const dirs = fibonacciDirs(nl);
      const sgn = c.q > 0 ? 1 : -1;
      for (let k = 0; k < nl && L < MAXLINES; k++) {
        let endsOnPositive = false;
        const cnt = traceLine(Efield, c.x + 0.15 * dirs[k * 3], c.y + 0.15 * dirs[k * 3 + 1], c.z + 0.15 * dirs[k * 3 + 2], sgn, {
          step: (x, y, z) => {
            let dmin = Infinity;
            for (const o of charges) if (o.q !== 0) dmin = Math.min(dmin, Math.hypot(x - o.x, y - o.y, z - o.z));
            return Math.min(0.25, Math.max(0.03, 0.03 + 0.1 * dmin));
          },
          stop: (x, y, z) => {
            if (Math.abs(x) > 6 || Math.abs(y) > 4.5 || Math.abs(z) > 4.5) return true;
            for (let j = 0; j < charges.length; j++) {
              if (j === ci || charges[j].q === 0) continue;
              if (Math.hypot(x - charges[j].x, y - charges[j].y, z - charges[j].z) < 0.12) {
                if (charges[j].q > 0) endsOnPositive = true;
                return true;
              }
            }
            return false;
          },
          maxSteps: MAXPTS - 1,
        }, scratch, off, MAXPTS);
        // Lines from + to − are already drawn from the + end. Drop their duplicates traced back from −.
        if (sgn < 0 && endsOnPositive) continue;
        lineOff[L] = off;
        lineCnt[L] = cnt;
        lineDir[L] = sgn;
        off += cnt * 3;
        L++;
      }
    }
    eNLines = L;
    eLines.begin();
    for (let i = 0; i < L; i++) eLines.polyline(scratch, lineOff[i], lineCnt[i]);
    eLines.end();
    // Copy to a private buffer so the B view can reuse the scratch space.
    eStore.set(scratch.subarray(0, off));
    eStoreOff.set(lineOff.subarray(0, L));
    eStoreCnt.set(lineCnt.subarray(0, L));
    eStoreDir.set(lineDir.subarray(0, L));
  }
  const eStore = new Float32Array(scratch.length);
  const eStoreOff = new Int32Array(MAXLINES);
  const eStoreCnt = new Int32Array(MAXLINES);
  const eStoreDir = new Int8Array(MAXLINES);

  function arrowsE(): void {
    let n = 0;
    for (let ix = 0; ix < 16; ix++) {
      for (let iy = 0; iy < 11; iy++) {
        const x = -4.5 + ix * 0.6;
        const y = -3 + iy * 0.6;
        let near = false;
        for (const c of charges) if (Math.hypot(x - c.x, y - c.y) < 0.32) near = true;
        if (near) continue;
        Efield(x, y, 0, F3);
        const m = Math.hypot(F3[0], F3[1], F3[2]);
        if (m === 0) continue;
        const s = Math.min(1, Math.max(0.08, Math.log10(m / 0.25) / 2.4));
        eArrows.set(n++, x, y, 0, F3[0] / m, F3[1] / m, F3[2] / m, 0.48 * s, s);
      }
    }
    eArrows.commit(n);
  }

  function updateE(): void {
    const s = surf.gaussE;
    if (eLinesDirty) {
      traceE();
      arrowsE();
      eLinesDirty = false;
    }
    const enc = enclosedCharge(charges, s);
    qEnc = enc.q;
    nEnc = enc.n;
    minGap = enc.minGap;
    fluxE = surfaceFlux(Efield, s, { panels: 12, order: 8, nPhi: 192 }).net;
    if (view === 'gaussE') {
      scratch.set(eStore.subarray(0, scratch.length));
      lineOff.set(eStoreOff);
      lineCnt.set(eStoreCnt);
      lineDir.set(eStoreDir);
      const c = markCrossings(s, eNLines);
      eNetLines = c.out - c.inn;
      (surfLabel.element as HTMLElement).textContent = `flux ∮E·dA = ${fmtSig(fluxE, 4)} V·m`;
    }
    eDirty = false;
  }

  // ===================================================================
  // View 2: Gauss's law for B
  // ===================================================================
  const gB = groups.gaussB;
  let source: Source = 'loop';
  let Iloop = 10;
  let wires: WireSet = currentLoop(1, Iloop, 64);
  const Bfield: Vec3Fn = (x, y, z, o) => biotSavart(wires, x, y, z, o);
  const loopMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 10, 96), new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.5, roughness: 0.35, emissive: 0x3a1c08 }));
  loopMesh.rotation.x = Math.PI / 2;
  gB.add(loopMesh);
  const magnetB = new THREE.Group();
  {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 32), new THREE.MeshStandardMaterial({ color: 0xd9534f, roughness: 0.5 }));
    n.position.y = 0.35;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 32), new THREE.MeshStandardMaterial({ color: 0x3f6fc9, roughness: 0.5 }));
    s.position.y = -0.35;
    magnetB.add(n, s);
    stage.label('N', [0, 0.95, 0], '', magnetB);
    stage.label('S', [0, -0.95, 0], '', magnetB);
  }
  gB.add(magnetB);
  const loopLabel = stage.label('current loop, I', [1.25, -0.25, 0], 'muted', gB);
  const bLines = new LineSet(MAXLINES * MAXPTS, COL_B, 0.75);
  gB.add(bLines.mesh);
  const bArrows = new ArrowGrid(260, COL_B);
  gB.add(bArrows.group);
  // Current direction dots on the loop
  const NDOT = 18;
  const loopDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }), NDOT);
  loopDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gB.add(loopDots);
  let loopPhase = 0;

  let bLinesDirty = true;
  let bNLines = 0;
  let fluxB = { net: 0, out: 0, inn: 0 };
  let bRef = 1;
  let bTouched = false;
  let bCross = { out: 0, inn: 0 };
  const bStore = new Float32Array(scratch.length);
  const bStoreOff = new Int32Array(MAXLINES);
  const bStoreCnt = new Int32Array(MAXLINES);
  const bStoreDir = new Int8Array(MAXLINES);

  function buildWires(): void {
    wires = source === 'loop' ? currentLoop(1, Iloop, 64) : barMagnet(0.35, 1.4, 8, Iloop, 32);
    loopMesh.visible = source === 'loop';
    magnetB.visible = source === 'magnet';
    loopDots.visible = source === 'loop';
    loopLabel.visible = source === 'loop';
    const rr = source === 'loop' ? 0.97 : 0.34;
    bRef = Math.abs(discFluxY(Bfield, rr, 0, 48, 64));
  }

  function traceB(): void {
    const Rw = source === 'loop' ? 1 : 0.35;
    const Lw = source === 'loop' ? 0 : 1.4;
    const dWire = (x: number, y: number, z: number) => {
      const rho = Math.hypot(x, z);
      const dy = Math.max(0, Math.abs(y) - Lw / 2);
      return Math.hypot(rho - Rw, dy);
    };
    const radii = source === 'loop' ? [0.15, 0.35, 0.55, 0.72, 0.87] : [0.08, 0.17, 0.25, 0.31];
    const nAz = 6;
    let L = 0;
    let off = 0;
    for (const r0 of radii) {
      for (let a = 0; a < nAz; a++) {
        const ph = (2 * Math.PI * (a + (r0 * 7) % 1)) / nAz;
        const sx = r0 * Math.cos(ph);
        const sz = r0 * Math.sin(ph);
        for (const dir of [1, -1]) {
          if (L >= MAXLINES) break;
          let closed = false;
          let exited = false;
          const cnt = traceLine(Bfield, sx, 0, sz, dir, {
            step: (x, y, z) => Math.min(0.3, Math.max(0.02, 0.02 + 0.15 * dWire(x, y, z))),
            stop: (x, y, z, tr) => {
              if (Math.abs(x) > 6.5 || Math.abs(y) > 5 || Math.abs(z) > 5) { exited = true; return true; }
              if (tr > 0.6 && Math.hypot(x - sx, y, z - sz) < 0.06) { closed = true; return true; }
              return false;
            },
            maxSteps: MAXPTS - 2,
          }, scratch, off, MAXPTS - 1);
          let c = cnt;
          if (closed) {
            scratch[off + c * 3] = sx;
            scratch[off + c * 3 + 1] = 0;
            scratch[off + c * 3 + 2] = sz;
            c++;
          }
          lineOff[L] = off;
          lineCnt[L] = c;
          lineDir[L] = dir;
          off += c * 3;
          L++;
          if (!exited) break; // closed (or ran out of steps): no need to trace backward
        }
      }
    }
    bNLines = L;
    bLines.begin();
    for (let i = 0; i < L; i++) bLines.polyline(scratch, lineOff[i], lineCnt[i]);
    bLines.end();
    bStore.set(scratch.subarray(0, off));
    bStoreOff.set(lineOff.subarray(0, L));
    bStoreCnt.set(lineCnt.subarray(0, L));
    bStoreDir.set(lineDir.subarray(0, L));
  }

  function arrowsB(): void {
    let n = 0;
    for (let ix = 0; ix < 16; ix++) {
      for (let iy = 0; iy < 11; iy++) {
        const x = -4.5 + ix * 0.6;
        const y = -3 + iy * 0.6;
        Bfield(x, y, 0, F3);
        const m = Math.hypot(F3[0], F3[1], F3[2]);
        if (m === 0) continue;
        const s = Math.min(1, Math.max(0.08, Math.log10(m / 1.5e-8) / 2.8));
        bArrows.set(n++, x, y, 0, F3[0] / m, F3[1] / m, F3[2] / m, 0.48 * s, s);
      }
    }
    bArrows.commit(n);
  }

  function updateB(): void {
    if (bLinesDirty) {
      buildWires();
      traceB();
      arrowsB();
      bLinesDirty = false;
    }
    fluxB = surfaceFlux(Bfield, surf.gaussB, { panels: 6 });
    if (view === 'gaussB') {
      scratch.set(bStore.subarray(0, scratch.length));
      lineOff.set(bStoreOff);
      lineCnt.set(bStoreCnt);
      lineDir.set(bStoreDir);
      bCross = markCrossings(surf.gaussB, bNLines);
      (surfLabel.element as HTMLElement).textContent = `flux ∮B·dA = ${fmtSig(fluxB.net * 1e6, 2)} µWb`;
    }
  }

  // ===================================================================
  // View 3: Faraday's law
  // ===================================================================
  const gF = groups.faraday;
  const coil: CoilParams = { m: 100, R: COIL_R, N: 20, L: COIL_L };
  let mStrength = 100;
  let northPlusX = true;
  let vMag = 1.5;
  let motion: Motion = 'pass';
  let xm = -PASS_X;
  let tMotion = 0;
  let waitT = 0;
  let prevLink = NaN;
  let emf = 0;
  let emfFD = 0;
  let link = 0;
  let emfRef = 1e-3;
  const approachSign: Record<string, number> = {};
  let emfFlipped = false;

  const coilMat = new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.6, roughness: 0.35, emissive: 0x2a1406 });
  let coilMesh: THREE.Mesh | null = null;
  function buildCoil(): void {
    if (coilMesh) {
      gF.remove(coilMesh);
      coilMesh.geometry.dispose();
    }
    const pts: THREE.Vector3[] = [];
    const per = 24;
    const tot = coil.N * per;
    for (let i = 0; i <= tot; i++) {
      const s = i / tot;
      const ph = 2 * Math.PI * coil.N * s;
      pts.push(new THREE.Vector3(-COIL_L / 2 + COIL_L * s, COIL_R * Math.cos(ph), COIL_R * Math.sin(ph)));
    }
    coilMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tot, 0.018, 6, false), coilMat);
    gF.add(coilMesh);
  }
  stage.label('coil', [0, -COIL_R - 0.35, 0], 'muted', gF);

  const magnet = new THREE.Group();
  {
    const nHalf = new THREE.Mesh(new THREE.BoxGeometry(MAG_HALF, 0.28, 0.28), new THREE.MeshStandardMaterial({ color: 0xd9534f, roughness: 0.5 }));
    nHalf.position.x = MAG_HALF / 2;
    const sHalf = new THREE.Mesh(new THREE.BoxGeometry(MAG_HALF, 0.28, 0.28), new THREE.MeshStandardMaterial({ color: 0x3f6fc9, roughness: 0.5 }));
    sHalf.position.x = -MAG_HALF / 2;
    magnet.add(nHalf, sHalf);
    stage.label('N', [MAG_HALF / 2, 0.32, 0], '', magnet);
    stage.label('S', [-MAG_HALF / 2, 0.32, 0], '', magnet);
    // Point-dipole field lines r = C sin²θ, drawn outside the magnet body
    const fl = new LineSet(6000, COL_B, 0.55);
    fl.begin();
    for (const C of [0.9, 1.4, 2.1, 3.1, 4.5]) {
      for (let a = 0; a < 6; a++) {
        const phi = (a * Math.PI) / 3 + 0.3;
        let px = 0;
        let py = 0;
        let pz = 0;
        let have = false;
        for (let i = 0; i <= 160; i++) {
          const th = 0.02 + ((Math.PI - 0.04) * i) / 160;
          const r = C * Math.sin(th) ** 2;
          const x = r * Math.cos(th);
          const rho = r * Math.sin(th);
          const y = rho * Math.cos(phi);
          const z = rho * Math.sin(phi);
          const ok = Math.abs(x) > MAG_HALF + 0.02 || rho > 0.2;
          if (ok && have) fl.seg(px, py, pz, x, y, z);
          px = x; py = y; pz = z;
          have = ok;
        }
      }
    }
    fl.seg(MAG_HALF, 0, 0, 6, 0, 0);
    fl.seg(-MAG_HALF, 0, 0, -6, 0, 0);
    fl.end();
    magnet.add(fl.mesh);
  }
  gF.add(magnet);

  const NCUR = 40;
  const curDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NCUR);
  curDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gF.add(curDots);
  let curPhase = 0;
  const indArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, COL_OUT, 0.18, 0.12);
  gF.add(indArrow);
  const indLabel = stage.label('induced B', [0, 0.25, 0], '', gF);
  (indLabel.element as HTMLElement).style.color = css(COL_OUT);
  const emfLabel = stage.label('', [0, COIL_R + 0.45, 0], '', gF);

  function refreshCoil(): void {
    coil.m = (northPlusX ? 1 : -1) * mStrength;
    magnet.rotation.y = northPlusX ? 0 : Math.PI;
    let pk = 0;
    for (let i = 0; i <= 400; i++) pk = Math.max(pk, Math.abs(coilEmf(coil, -3 + (6 * i) / 400, Math.max(0.3, Math.abs(vMag)))));
    emfRef = pk;
    prevLink = NaN;
  }

  // Inset: EMF vs time
  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 220;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '110px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const NS = 480;
  const sEmf = new Float32Array(NS);
  const sLink = new Float32Array(NS);
  let sHead = 0;
  let sCount = 0;
  let sAcc = 0;
  const SDT = 1 / 60; // sample spacing (s): 8 s window

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('EMF, last 8 s', 16, 30);
    const top = 44;
    const bot = H - 14;
    const mid = (top + bot) / 2;
    const half = (bot - top) / 2;
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.beginPath();
    ictx.moveTo(10, mid);
    ictx.lineTo(W - 10, mid);
    ictx.stroke();
    if (sCount < 2) return;
    const scale = Math.max(emfRef, 1e-9) * 1.1;
    let lmax = 1e-12;
    for (let i = 0; i < sCount; i++) lmax = Math.max(lmax, Math.abs(sLink[i]));
    const plot = (arr: Float32Array, sc: number, color: string, w: number) => {
      ictx.strokeStyle = color;
      ictx.lineWidth = w;
      ictx.beginPath();
      for (let i = 0; i < sCount; i++) {
        const idx = (sHead - sCount + i + NS) % NS;
        const x = 10 + ((W - 20) * (NS - sCount + i)) / (NS - 1);
        const y = mid - (arr[idx] / sc) * half;
        if (i === 0) ictx.moveTo(x, y);
        else ictx.lineTo(x, y);
      }
      ictx.stroke();
    };
    plot(sLink, lmax * 1.1, 'rgba(91,157,255,0.55)', 2);
    plot(sEmf, scale, '#f5b642', 3);
    ictx.fillStyle = '#f5b642';
    ictx.fillText(`${(emf * 1e3).toFixed(2)} mV`, W - 150, 30);
    ictx.fillStyle = 'rgba(91,157,255,0.9)';
    ictx.font = '18px JetBrains Mono, monospace';
    ictx.fillText('NΦ', 16, H - 20);
  }

  // ===================================================================
  // View 4: Ampère–Maxwell
  // ===================================================================
  const gA = groups.ampere;
  const cap: CapParams = { I: 5, a: PLATE_A, d: GAP_D };
  const Bcap: Vec3Fn = (x, y, z, o) => capB(cap, x, y, z, o);
  let loopX = -2;
  let loopR = 0.8;
  let tQ = 0;
  let circ = 0;
  let encl = { Ic: 0, Id: 0 };
  let aDirty = true;

  const wireMatA = new THREE.MeshStandardMaterial({ color: COPPER, metalness: 0.6, roughness: 0.35, emissive: 0x2a1406 });
  const wireLen = 4.5 - GAP_D / 2 - 0.02;
  for (const sgn of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, wireLen, 12), wireMatA);
    w.rotation.z = Math.PI / 2;
    w.position.x = sgn * (GAP_D / 2 + 0.02 + wireLen / 2);
    gA.add(w);
  }
  const plateMats = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: 0x8c96ab, metalness: 0.5, roughness: 0.4, emissive: 0x000000, transparent: true, opacity: 0.75 }));
  [-1, 1].forEach((sgn, i) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_A, PLATE_A, 0.04, 48), plateMats[i]);
    p.rotation.z = Math.PI / 2;
    p.position.x = sgn * (GAP_D / 2 + 0.02);
    gA.add(p);
  });
  stage.label('capacitor gap: no charge crosses', [0, -PLATE_A - 0.35, 0], 'muted', gA);
  const iLabel = stage.label('I →', [-3.4, 0.28, 0], '', gA);
  (iLabel.element as HTMLElement).style.color = css(COPPER);
  // Uniform E between the plates
  const gapE = new LineSet(64, COL_E, 1);
  gapE.begin();
  for (let iy = -3; iy <= 3; iy++) {
    for (let iz = -3; iz <= 3; iz++) {
      const y = iy * 0.27;
      const z = iz * 0.27;
      if (y * y + z * z > 0.85 * 0.85) continue;
      gapE.seg(-GAP_D / 2 + 0.03, y, z, GAP_D / 2 - 0.03, y, z);
    }
  }
  gapE.end();
  gA.add(gapE.mesh);
  const gapLabel = stage.label('E grows: ε₀ ∂E/∂t', [0, PLATE_A + 0.3, 0], '', gA);
  (gapLabel.element as HTMLElement).style.color = css(COL_E);

  // B circles around the axis
  const ringX: number[] = [];
  for (let x = -4; x <= 4.001; x += 0.5) ringX.push(Math.round(x * 100) / 100);
  ringX.push(-0.15, 0.15);
  const ringR = [0.55, 1.45];
  const RSEG = 48;
  const nRings = ringX.length * ringR.length;
  const ringPos = new Float32Array(nRings * RSEG * 6);
  const ringCol = new Float32Array(nRings * RSEG * 6);
  {
    let o = 0;
    for (const x of ringX) {
      for (const r of ringR) {
        for (let k = 0; k < RSEG; k++) {
          const a0 = (2 * Math.PI * k) / RSEG;
          const a1 = (2 * Math.PI * (k + 1)) / RSEG;
          ringPos.set([x, r * Math.cos(a0), r * Math.sin(a0), x, r * Math.cos(a1), r * Math.sin(a1)], o);
          o += 6;
        }
      }
    }
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3));
  const rings = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  gA.add(rings);
  const aArrows = new ArrowGrid(120, COL_B);
  gA.add(aArrows.group);
  const NCD = 36;
  const capDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }), NCD);
  capDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gA.add(capDots);
  let capPhase = 0;

  // Amperian loop and its flat surface
  const aLoop = new THREE.Group();
  let aDisc: THREE.Mesh;
  {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: COL_SURF, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.y = Math.PI / 2;
    aDisc = disc;
    aLoop.add(disc);
  }
  gA.add(aLoop);
  const aRingMat = new THREE.MeshBasicMaterial({ color: COL_SURF });
  let aRing: THREE.Mesh | null = null;
  let aRingR = -1;
  const aLoopLabel = stage.label('', [0, 0, 0], '', gA);
  (aLoopLabel.element as HTMLElement).style.color = css(COL_SURF);

  function paintAmpere(): void {
    const bMax = (MU0 * Math.max(0.5, Math.abs(cap.I))) / (2 * Math.PI * 0.5);
    let o = 0;
    const cB = new THREE.Color(COL_B);
    for (const x of ringX) {
      for (const r of ringR) {
        capB(cap, x, r, 0, F3);
        const b = Math.min(1, Math.hypot(F3[1], F3[2]) / bMax);
        const k = 0.12 + 0.88 * b;
        for (let s = 0; s < RSEG * 2; s++) {
          ringCol[o++] = cB.r * k;
          ringCol[o++] = cB.g * k;
          ringCol[o++] = cB.b * k;
        }
      }
    }
    (ringGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    let n = 0;
    for (const x of [-2.25, 0, 2.25]) {
      for (const r of [0.5, 1.0, 1.6]) {
        for (let k = 0; k < 12; k++) {
          const a = (2 * Math.PI * (k + 0.5)) / 12;
          const y = r * Math.cos(a);
          const z = r * Math.sin(a);
          capB(cap, x, y, z, F3);
          const m = Math.hypot(F3[1], F3[2]);
          if (m < 1e-15) continue;
          const b = Math.min(1, m / bMax);
          aArrows.set(n++, x, y, z, 0, F3[1] / m, F3[2] / m, 0.12 + 0.36 * b, b);
        }
      }
    }
    aArrows.commit(n);
    aLoop.position.x = loopX;
    aDisc.scale.setScalar(loopR);
    if (aRingR !== loopR) {
      if (aRing) { aLoop.remove(aRing); aRing.geometry.dispose(); }
      aRing = new THREE.Mesh(new THREE.TorusGeometry(loopR, 0.028, 8, 96), aRingMat);
      aRing.rotation.y = Math.PI / 2;
      aLoop.add(aRing);
      aRingR = loopR;
    }
    aLoopLabel.position.set(loopX, loopR + 0.3, 0);
    circ = circulation(Bcap, loopX, loopR);
    encl = enclosedCurrents(cap, loopX, loopR);
    (aLoopLabel.element as HTMLElement).textContent = `∮B·dl = ${fmtSig(circ * 1e6, 3)} µT·m`;
    aDirty = false;
  }

  // ===================================================================
  // Overlays
  // ===================================================================
  const legend = makeOverlay(viewport);
  const sw = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  const LEG: Record<View, string> = {
    gaussE: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">∇·E = ρ/ε₀</div>
<div>${sw(COL_E, '■ E field lines')}, ${LPN} per nC, start on ${sw(COL_POS, '+')} and end on ${sw(COL_NEG, '−')}</div>
<div>${sw(COL_SURF, '■ closed surface')}: drag it, or use the sliders</div>
<div>${sw(COL_OUT, '●')} line leaves, ${sw(COL_IN, '●')} line enters</div>`,
    gaussB: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">∇·B = 0</div>
<div>${sw(COL_B, '■ B field lines')} close on themselves. No start, no end.</div>
<div>${sw(COL_SURF, '■ closed surface')}: every line that goes in comes out</div>
<div>${sw(COL_OUT, '●')} out ${sw(COL_IN, '●')} in</div>`,
    faraday: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">∇×E = −∂B/∂t</div>
<div>${sw(COL_B, '■ magnet field lines')} ride along with the magnet</div>
<div>${sw(COPPER, '■ coil')}: dots show the induced current</div>
<div>${sw(COL_OUT, '→ induced B')} always fights the change in flux (Lenz)</div>`,
    ampere: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">∇×B = μ₀J + μ₀ε₀ ∂E/∂t</div>
<div>${sw(COL_B, '■ B circles')}: brighter means stronger</div>
<div>${sw(COL_E, '■ E in the gap')} grows as charge piles up</div>
<div>${sw(COL_SURF, '■ loop')}: slide it into the gap</div>`,
  };

  // ===================================================================
  // Pointer drag of the Gaussian surface
  // ===================================================================
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const grab = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let dragging = false;
  const setNdc = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onDown = (e: PointerEvent) => {
    if (view !== 'gaussE' && view !== 'gaussB') return;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    const s = activeSurf();
    const target = s.shape === 'sphere' ? sphereMesh : cubeMesh;
    const hits = ray.intersectObject(target, false);
    if (!hits.length) return;
    camera.getWorldDirection(camDir);
    const c = new THREE.Vector3(s.cx, s.cy, s.cz);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, c);
    if (!ray.ray.intersectPlane(dragPlane, hit)) return;
    grab.copy(hit).sub(c);
    dragging = true;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    setNdc(e);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(dragPlane, hit)) return;
    hit.sub(grab);
    const s = activeSurf();
    s.cx = Math.max(-4, Math.min(4, hit.x));
    s.cy = Math.max(-3, Math.min(3, hit.y));
    s.cz = Math.max(-2, Math.min(2, hit.z));
    surfaceChanged(true);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // ===================================================================
  // Controls
  // ===================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Equation', value: view,
    options: [
      { value: 'gaussE', label: '∇·E' },
      { value: 'gaussB', label: '∇·B' },
      { value: 'faraday', label: '∇×E' },
      { value: 'ampere', label: '∇×B' },
    ],
    onChange: (v) => setView(v),
  });
  const viewNote = ui.note('');

  ui.section('The four laws, live');
  const rLawE = ui.readout('lawE', 'Gauss E: flux ÷ theory');
  const rQenc = ui.readout('qenc', 'enclosed charge ÷ ε₀', 'V·m');
  const rLawB = ui.readout('lawB', 'Gauss B: net flux', 'µWb');
  const rLawF = ui.readout('lawF', 'Faraday: EMF', 'mV');
  const rLawA = ui.readout('lawA', 'Ampère: circulation', 'µT·m');
  const rIdisp = ui.readout('idisp', 'displacement current', 'A');
  // Each readout doubles as a link: a small button switches to its view.
  const lawView: Record<string, View> = { lawE: 'gaussE', qenc: 'gaussE', lawB: 'gaussB', lawF: 'faraday', lawA: 'ampere', idisp: 'ampere' };
  for (const [key, v] of Object.entries(lawView)) {
    const cell = ui.root.querySelector<HTMLElement>(`.readout[data-param="${key}"]`);
    if (!cell) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'show ›';
    b.setAttribute('aria-label', `Show the ${v} view`);
    Object.assign(b.style, {
      marginTop: '3px', padding: '0 6px', font: '10px JetBrains Mono, monospace', color: '#9aa6bd',
      background: 'transparent', border: '1px solid #2c3852', borderRadius: '6px', cursor: 'pointer',
    } as CSSStyleDeclaration);
    const go = () => { if (view !== v) viewCtl.set(v); };
    b.addEventListener('click', go);
    b.addEventListener('focus', go);
    cell.appendChild(b);
  }

  // --- Gauss E controls
  ui.section('Charges');
  const secCharges = ui.root.lastElementChild as HTMLElement;
  qVals.forEach((q0, i) => {
    ui.slider({
      key: `q${i + 1}`, label: `Charge q${i + 1}`, min: -3, max: 3, step: 0.5, value: q0, unit: 'nC',
      format: (v) => (v > 0 ? `+${v}` : String(v)),
      onInput: (v) => { qVals[i] = v; paintCharges(); eLinesDirty = true; eDirty = true; },
    });
  });
  const rFluxE = ui.readout('fluxE', 'E flux (numerical)', 'V·m');
  const rErrE = ui.readout('errE', 'relative error');
  const rLinesE = ui.readout('linesE', 'net lines out');
  const rNenc = ui.readout('nenc', 'charges inside');

  // --- Surface controls (shared)
  ui.section('Closed surface');
  const secSurf = ui.root.lastElementChild as HTMLElement;
  const shapeCtl = ui.select<Shape>({
    key: 'shape', label: 'Shape', value: 'sphere',
    options: [{ value: 'sphere', label: 'Sphere' }, { value: 'cube', label: 'Cube' }],
    onChange: (v) => { activeSurf().shape = v; surfaceChanged(true); },
  });
  const sizeCtl = ui.slider({ key: 'size', label: 'Size (radius or half-edge)', min: 0.3, max: 3, step: 0.05, value: 0.8, unit: 'm', onInput: (v) => { activeSurf().size = v; surfaceChanged(true); } });
  const sxCtl = ui.slider({ key: 'sx', label: 'Centre x', min: -4, max: 4, step: 0.05, value: -1.6, unit: 'm', onInput: (v) => { activeSurf().cx = v; surfaceChanged(true); } });
  const syCtl = ui.slider({ key: 'sy', label: 'Centre y', min: -3, max: 3, step: 0.05, value: 0.4, unit: 'm', onInput: (v) => { activeSurf().cy = v; surfaceChanged(true); } });
  const szCtl = ui.slider({ key: 'sz', label: 'Centre z (depth)', min: -2, max: 2, step: 0.05, value: 0, unit: 'm', onInput: (v) => { activeSurf().cz = v; surfaceChanged(true); } });
  ui.note('Drag the surface in the scene to move it in the plane facing you.');

  // --- Gauss B controls
  ui.section('Magnetic source');
  const secSource = ui.root.lastElementChild as HTMLElement;
  ui.select<Source>({
    key: 'source', label: 'Source', value: source,
    options: [{ value: 'loop', label: 'Current loop' }, { value: 'magnet', label: 'Bar magnet' }],
    onChange: (v) => { source = v; bLinesDirty = true; },
  });
  ui.slider({ key: 'iloop', label: 'Current I (per turn)', min: 1, max: 20, step: 0.5, value: Iloop, unit: 'A', onInput: (v) => { Iloop = v; bLinesDirty = true; } });
  const rFluxB = ui.readout('fluxB', 'B flux (numerical)', 'µWb');
  const rOutB = ui.readout('outB', 'outward part', 'µWb');
  const rRatioB = ui.readout('ratioB', '|net| ÷ outward');
  const rLinesB = ui.readout('linesB', 'lines out / in');
  const rB0 = ui.readout('b0', 'B at centre ÷ theory');
  ui.note('The bar magnet is modelled by the loops of current that circulate on its surface.');

  // --- Faraday controls
  ui.section('Magnet and coil');
  const secFar = ui.root.lastElementChild as HTMLElement;
  ui.select<Motion>({
    key: 'motion', label: 'Motion', value: motion,
    options: [{ value: 'pass', label: 'Pass through' }, { value: 'oscillate', label: 'Oscillate' }],
    onChange: (v) => { motion = v; tMotion = 0; waitT = 0; xm = v === 'pass' ? -Math.sign(vMag || 1) * PASS_X : 0; prevLink = NaN; },
  });
  ui.slider({
    key: 'speed', label: 'Velocity v (sign = direction)', min: -3, max: 3, step: 0.1, value: vMag, unit: 'm/s',
    onInput: (v) => {
      const flipped = Math.sign(v) !== Math.sign(vMag);
      vMag = v;
      if (motion === 'pass' && flipped && v !== 0) { xm = -Math.sign(v) * PASS_X; waitT = 0; prevLink = NaN; }
      refreshCoil();
    },
  });
  ui.slider({ key: 'moment', label: 'Magnet strength m', min: 20, max: 200, step: 5, value: mStrength, unit: 'A·m²', onInput: (v) => { mStrength = v; refreshCoil(); } });
  ui.slider({ key: 'turns', label: 'Coil turns N', min: 5, max: 40, step: 1, value: coil.N, onInput: (v) => { coil.N = v; buildCoil(); refreshCoil(); } });
  ui.toggle({ key: 'polarity', label: 'North pole faces +x', value: northPlusX, onChange: (v) => { northPlusX = v; refreshCoil(); } });
  const rLink = ui.readout('link', 'flux linkage', 'mWb');
  const rEmf = ui.readout('emf', 'EMF (analytic)', 'mV');
  const rFD = ui.readout('emfFD', 'EMF from flux change', 'mV');
  const rDir = ui.readout('curdir', 'induced current');

  // --- Ampère controls
  ui.section('Wire and capacitor');
  const secAmp = ui.root.lastElementChild as HTMLElement;
  ui.slider({ key: 'current', label: 'Current I', min: -10, max: 10, step: 0.5, value: cap.I, unit: 'A', onInput: (v) => { cap.I = v; aDirty = true; } });
  ui.slider({ key: 'loopX', label: 'Loop position x', min: -3.5, max: 3.5, step: 0.05, value: loopX, unit: 'm', onInput: (v) => { loopX = v; aDirty = true; } });
  ui.slider({ key: 'loopR', label: 'Loop radius r', min: 0.2, max: 2, step: 0.05, value: loopR, unit: 'm', onInput: (v) => { loopR = v; aDirty = true; } });
  const rIc = ui.readout('ic', 'conduction current', 'A');
  const rId = ui.readout('id', 'displacement current', 'A');
  const rCirc = ui.readout('circ', 'circulation (numerical)', 'µT·m');
  const rMuI = ui.readout('mui', 'Ampère–Maxwell value', 'µT·m');
  ui.note(`The gap is ${GAP_D} m wide. The plates have radius ${PLATE_A} m. Try the loop at x = 0 with r above and below 1 m.`);

  ui.section('Display');
  ui.toggle({ key: 'lines', label: 'Field lines', value: showLines, onChange: (v) => { showLines = v; eLines.mesh.visible = v; bLines.mesh.visible = v; } });
  ui.toggle({ key: 'arrows', label: 'Arrow grid', value: showArrows, onChange: (v) => { showArrows = v; eArrows.group.visible = v; bArrows.group.visible = v; aArrows.group.visible = v; } });
  ui.legend([
    { color: css(COL_E), label: 'E' },
    { color: css(COL_B), label: 'B' },
    { color: css(COL_SURF), label: 'surface / loop' },
    { color: css(COL_OUT), label: 'out' },
    { color: css(COL_IN), label: 'in' },
  ]);

  function syncSurfaceSliders(): void {
    const s = activeSurf();
    shapeCtl.set(s.shape, false);
    sizeCtl.set(s.size, false);
    sxCtl.set(s.cx, false);
    syCtl.set(s.cy, false);
    szCtl.set(s.cz, false);
  }

  let bDirty = true;
  function surfaceChanged(fromUser: boolean): void {
    if (view === 'gaussB') {
      bDirty = true;
      if (fromUser) bTouched = true;
    } else eDirty = true;
    if (dragging) syncSurfaceSliders();
    placeSurface();
  }

  const NOTES: Record<View, string> = {
    gaussE: 'Electric flux out of any closed surface equals the charge inside divided by ε₀. Charges outside add nothing.',
    gaussB: 'Magnetic flux out of any closed surface is zero. B lines never start or stop.',
    faraday: 'A changing magnetic flux through the coil drives an electric field around it. That is the EMF.',
    ampere: 'Current makes B circle around it. So does a changing E field, even in empty space.',
  };

  function setView(v: View): void {
    view = v;
    for (const k of Object.keys(groups) as View[]) groups[k].visible = k === v;
    const gauss = v === 'gaussE' || v === 'gaussB';
    surfGroup.visible = gauss;
    surfLabel.visible = gauss;
    marks.visible = gauss;
    secCharges.style.display = v === 'gaussE' ? '' : 'none';
    secSurf.style.display = gauss ? '' : 'none';
    secSource.style.display = v === 'gaussB' ? '' : 'none';
    secFar.style.display = v === 'faraday' ? '' : 'none';
    secAmp.style.display = v === 'ampere' ? '' : 'none';
    inset.style.display = v === 'faraday' ? '' : 'none';
    legend.innerHTML = LEG[v];
    viewNote.textContent = NOTES[v];
    if (gauss) {
      syncSurfaceSliders();
      placeSurface();
      if (v === 'gaussE') eDirty = true;
      else bDirty = true;
    }
    stage.flyTo(CAM[v], TGT[v]);
  }

  // ===================================================================
  // Frame loop
  // ===================================================================
  const colPos = new THREE.Color(COL_OUT);
  const colNeg = new THREE.Color(COL_IN);
  const up = new THREE.Vector3(1, 0, 0);
  const down = new THREE.Vector3(-1, 0, 0);

  function stepFaraday(dt: number): void {
    const v0 = vMag;
    let v = 0;
    if (motion === 'pass') {
      if (v0 === 0) v = 0;
      else if (waitT > 0) {
        waitT -= dt;
        if (waitT <= 0) { xm = -Math.sign(v0) * PASS_X; prevLink = NaN; }
      } else {
        v = v0;
        xm += v * dt;
        if (Math.abs(xm) > PASS_X && Math.sign(xm) === Math.sign(v0)) { waitT = 0.6; v = 0; }
      }
    } else {
      const A = 2.2;
      const w = Math.abs(v0) / A;
      tMotion += dt;
      xm = A * Math.sin(w * tMotion);
      v = A * w * Math.cos(w * tMotion);
    }
    magnet.position.x = xm;
    link = coilLinkage(coil, xm);
    emf = coilEmf(coil, xm, v);
    emfFD = Number.isFinite(prevLink) && dt > 0 ? -(link - prevLink) / dt : emf;
    prevLink = link;
    // Lenz bookkeeping: EMF sign while approaching the coil, for each direction of travel
    if (view === 'faraday' && motion === 'pass' && v !== 0 && xm * v < 0 && Math.abs(xm) < 1.4 && Math.abs(emf) > 0.05 * emfRef) {
      const key = v > 0 ? 'right' : 'left';
      approachSign[key] = Math.sign(emf);
      if (approachSign.right !== undefined && approachSign.left !== undefined && approachSign.right !== approachSign.left) emfFlipped = true;
    }
    // Induced current dots move along the winding (positive EMF: right-handed about +x)
    const rel = emf / Math.max(emfRef, 1e-12);
    curPhase += rel * dt * 0.25;
    curPhase -= Math.floor(curPhase);
    const col = rel >= 0 ? colPos : colNeg;
    const on = Math.abs(rel) > 0.02;
    for (let i = 0; i < NCUR; i++) {
      const s = (i / NCUR + curPhase) % 1;
      const ph = 2 * Math.PI * coil.N * s;
      vP.set(-COIL_L / 2 + COIL_L * s, COIL_R * Math.cos(ph), COIL_R * Math.sin(ph));
      vS.setScalar(on ? 1 : 0.001);
      m4.compose(vP, qI, vS);
      curDots.setMatrixAt(i, m4);
      curDots.setColorAt(i, col);
    }
    vS.setScalar(1);
    curDots.instanceMatrix.needsUpdate = true;
    if (curDots.instanceColor) curDots.instanceColor.needsUpdate = true;
    const len = Math.min(1, Math.abs(rel)) * 0.9;
    indArrow.visible = on;
    indLabel.visible = on;
    if (on) {
      indArrow.setDirection(rel >= 0 ? up : down);
      indArrow.setLength(len + 0.2, 0.18, 0.12);
      indArrow.position.x = rel >= 0 ? -(len + 0.2) / 2 : (len + 0.2) / 2;
      indLabel.position.set((rel >= 0 ? 1 : -1) * ((len + 0.2) / 2 + 0.45), -0.2, 0);
    }
    (emfLabel.element as HTMLElement).textContent = `ε = ${(emf * 1e3).toFixed(2)} mV`;
    sAcc += dt;
    while (sAcc >= SDT) {
      sAcc -= SDT;
      sEmf[sHead] = emf;
      sLink[sHead] = link;
      sHead = (sHead + 1) % NS;
      if (sCount < NS) sCount++;
    }
    if (view === 'faraday') drawInset();
  }

  function stepAmpere(dt: number): void {
    if (aDirty) paintAmpere();
    tQ += dt;
    const frac = cap.I === 0 ? 0 : (tQ % 6) / 6;
    const sg = Math.sign(cap.I);
    (gapE.mesh.material as THREE.LineBasicMaterial).opacity = 0.1 + 0.9 * frac;
    plateMats[0].emissive.setHex(sg > 0 ? COL_POS : COL_NEG).multiplyScalar(0.6 * frac);
    plateMats[1].emissive.setHex(sg > 0 ? COL_NEG : COL_POS).multiplyScalar(0.6 * frac);
    capPhase += cap.I * dt * 0.12;
    capPhase -= Math.floor(capPhase);
    for (let i = 0; i < NCD; i++) {
      const s = (i / NCD + capPhase) % 1;
      let x = -4.5 + 9 * s;
      const hide = Math.abs(x) < GAP_D / 2 + 0.05;
      if (hide) x = 0;
      vP.set(x, 0, 0);
      vS.setScalar(hide || cap.I === 0 ? 0.001 : 1);
      m4.compose(vP, qI, vS);
      capDots.setMatrixAt(i, m4);
    }
    vS.setScalar(1);
    capDots.instanceMatrix.needsUpdate = true;
    (iLabel.element as HTMLElement).textContent = cap.I >= 0 ? `I = ${cap.I} A →` : `← I = ${-cap.I} A`;
  }

  function stepLoopDots(dt: number): void {
    loopPhase += (Iloop / 10) * dt * 0.15;
    loopPhase -= Math.floor(loopPhase);
    for (let i = 0; i < NDOT; i++) {
      const a = 2 * Math.PI * ((i / NDOT + loopPhase) % 1);
      vP.set(Math.cos(a), 0, -Math.sin(a));
      m4.compose(vP, qI, vS);
      loopDots.setMatrixAt(i, m4);
    }
    loopDots.instanceMatrix.needsUpdate = true;
  }

  let roTimer = 0;
  stage.onFrame((dt) => {
    if (eDirty || eLinesDirty) updateE();
    if (bDirty || bLinesDirty) { updateB(); bDirty = false; }
    stepFaraday(dt);
    stepAmpere(dt);
    if (view === 'gaussB' && source === 'loop') stepLoopDots(dt);
    roTimer += dt;
    if (roTimer > 0.1) { roTimer = 0; updateReadouts(); }
  });

  function updateReadouts(): void {
    const qe = qEnc / EPS0;
    const scaleE = Math.max(...charges.map((c) => Math.abs(c.q))) / EPS0;
    const ratioE = Math.abs(qEnc) > 1e-15 ? fluxE / qe : NaN;
    rLawE(Number.isFinite(ratioE) ? ratioE.toFixed(6) : `${fmtSig(fluxE, 2)} ≈ 0`);
    rQenc(fmtSig(qe, 4));
    rLawB(fmtSig(fluxB.net * 1e6, 2));
    rLawF((emf * 1e3).toFixed(3));
    rLawA(fmtSig(circ * 1e6, 4));
    rIdisp(encl.Id.toFixed(3));
    rFluxE(fmtSig(fluxE, 5));
    rErrE(minGap < 0.02 ? 'charge on surface' : (Math.abs(fluxE - qe) / scaleE).toExponential(1));
    rLinesE(`${eNetLines} (ideal ${fmtSig((LPN * qEnc) / nC, 3)})`);
    rNenc(String(nEnc));
    rFluxB(fmtSig(fluxB.net * 1e6, 2));
    rOutB(fmtSig(fluxB.out * 1e6, 4));
    rRatioB(fluxB.out > 0 ? (Math.abs(fluxB.net) / fluxB.out).toExponential(1) : '…');
    rLinesB(`${bCross.out} / ${bCross.inn}`);
    Bfield(0, 0, 0, F3);
    rB0(source === 'loop' ? (F3[1] / ((MU0 * Iloop) / 2)).toFixed(5) : 'loop only');
    rLink((link * 1e3).toFixed(4));
    rEmf((emf * 1e3).toFixed(3));
    rFD((emfFD * 1e3).toFixed(3));
    rDir(Math.abs(emf) < 0.02 * emfRef ? 'none' : emf > 0 ? 'right-handed about +x' : 'left-handed about +x');
    rIc(encl.Ic.toFixed(3));
    rId(encl.Id.toFixed(3));
    rCirc(fmtSig(circ * 1e6, 5));
    rMuI(fmtSig(MU0 * (encl.Ic + encl.Id) * 1e6, 5));
  }

  // ===================================================================
  // Initial state
  // ===================================================================
  paintCharges();
  buildCoil();
  refreshCoil();
  setView('gaussE');
  updateE();
  updateB();
  bDirty = false;
  paintAmpere();
  updateReadouts();

  return {
    state: () => {
      const scaleE = Math.max(...charges.map((c) => Math.abs(c.q))) / EPS0;
      return {
        view,
        nEnc,
        qEnc: qEnc / nC,
        fluxE,
        fluxErrE: Math.abs(fluxE - qEnc / EPS0) / scaleE,
        minGap,
        eNetLines,
        shapeE: surf.gaussE.shape,
        fluxB: fluxB.net,
        fluxBOut: fluxB.out,
        bRef,
        bTouched,
        source,
        emf,
        speed: vMag,
        motion,
        emfFlipped,
        northPlusX,
        current: cap.I,
        loopX,
        loopR,
        loopInGap: inGap(cap, loopX),
        circ,
        circOverMuI: cap.I === 0 ? 0 : circ / (MU0 * Math.abs(cap.I)),
        iDisp: encl.Id,
      };
    },
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'maxwell-fields',
  number: 39,
  title: 'Maxwell’s Equations',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'Four rules for how electric and magnetic fields flow and curl.',
  content,
  mount,
};

export default topic;
