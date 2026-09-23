import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  chainAccel,
  chainEnergy,
  chainModes,
  chainOmega,
  chainStep,
  drumOmega,
  drumRatioContinuum,
  drumShape,
  nodalDomains,
  presetShape,
  project,
  trianglePluck,
  type ChainModes,
  type ChainParams,
  type PluckPreset,
} from './physics.ts';

type View = 'chain' | 'drum';
type Display = 'transverse' | 'longitudinal';
type SpringStyle = 'coil' | 'line';
type Excitation =
  | { type: 'modes'; list: { k: number; w: number }[] }
  | { type: 'preset'; name: PluckPreset; seed: number }
  | { type: 'drag'; frac: number; disp: number }
  | { type: 'shape'; data: Float64Array; n: number };

const W0 = 4; // ω0 of the chain (rad/s)
const H = 1 / 1200; // integrator step (s)
const NMAX = 12;
const HALF = 4; // chain runs from −HALF to +HALF
const CHAIN_Y = 1.45;
const S_T = 0.75; // scene units per unit of transverse displacement
const GHOST_Y = [-0.4, -1.4, -2.4];
const GHOST_S = 0.55;
const COIL_PTS = 44;
const TRACE_CAP = 900; // samples, at 30 per simulated second
const DRUM_M = 15; // lattice masses per side
const DRUM_W0 = 8; // gives ω11 ≈ 2.2 rad/s
const DRUM_D = 5.6; // drum side length in scene units
const DRUM_RES = 72; // surface grid segments per side
const SAND = 2600;

const MODE_COLS = [PALETTE.cyan, PALETTE.amber, PALETTE.violet, PALETTE.rose, PALETTE.green, PALETTE.red, 0x7dd3fc, 0xfcd34d, 0xc4b5fd, 0xf9a8d4, 0x86efac, 0xfca5a5];
const modeCol = (k: number) => MODE_COLS[(k - 1) % MODE_COLS.length];

const CAM = {
  chain: { pos: [0, 1.4, 11.8] as [number, number, number], target: [0, 0.3, 0] as [number, number, number] },
  drum: { pos: [0, 4.9, 5.7] as [number, number, number], target: [0, -0.55, 0] as [number, number, number] },
};

/** Fat line segments with a fixed capacity. Positions are written in place and committed. */
class FatSegments {
  readonly line: LineSegments2;
  readonly buf: Float32Array;
  private readonly geo: LineSegmentsGeometry;
  readonly mat: LineMaterial;

  constructor(readonly capacity: number, color: number, width: number, opacity = 1) {
    this.buf = new Float32Array(capacity * 6);
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(this.buf);
    this.mat = new LineMaterial({ color, linewidth: width, worldUnits: true, transparent: opacity < 1, opacity });
    this.mat.toneMapped = false;
    this.line = new LineSegments2(this.geo, this.mat);
    this.line.frustumCulled = false;
  }

  commit(count: number): void {
    (this.geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
    this.geo.instanceCount = count;
  }
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.chain.pos, target: CAM.chain.target, fov: 42 });
  const { scene, camera, renderer, controls } = stage;

  // --- Parameters
  let view: View = 'chain';
  let display: Display = 'transverse';
  let springStyle: SpringStyle = 'coil';
  let playing = true;
  let speed = 1;
  let N = 8;
  let modeK = 3;
  let amp = 1;
  let watch = 2;
  const p: ChainParams = { N, omega0: W0, gamma: 0, beta: 0 };
  let excitation: Excitation = { type: 'modes', list: [{ k: 1, w: 1 }, { k: 3, w: 0.5 }] };
  let plucked = false;

  let dm = 2;
  let dn = 1;
  let mixDeg = 0;
  let sandOn = true;

  // --- Chain state (fixed capacity, no per-frame allocation)
  const x = new Float64Array(NMAX);
  const v = new Float64Array(NMAX);
  const acc = new Float64Array(NMAX);
  const q = new Float64Array(NMAX);
  const qd = new Float64Array(NMAX);
  const E = new Float64Array(NMAX);
  const E0 = new Float64Array(NMAX);
  let E0tot = 0;
  let modes: ChainModes = chainModes(N, W0);
  let eigErr = 0;
  let tSim = 0;
  let accT = 0;
  let totalE = 0;
  let modeDrift = 0;
  let activeModes = 0;
  const frac = new Float64Array(NMAX);
  let beatPair = '';
  let beatClock = 0;
  let beatPeriod = 0;
  let beatDone = false;
  const topIdx = [0, 0, 0];

  // =========================================================================
  // Chain scene
  // =========================================================================
  const chainGroup = new THREE.Group();
  scene.add(chainGroup);
  const floor = makeGrid(16, 32);
  floor.position.y = -3.3;
  chainGroup.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.4, roughness: 0.6 });
  const wallGeo = new THREE.BoxGeometry(0.16, 2.8, 0.9);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(s * (HALF + 0.08), CHAIN_Y, 0);
    chainGroup.add(w);
  }

  // Rest lines for the chain and the ghost rows
  {
    const pts: number[] = [];
    for (const y of [CHAIN_Y, ...GHOST_Y]) pts.push(-HALF, y, 0, HALF, y, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    chainGroup.add(new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0x3a4a6e, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 })).computeLineDistances());
  }

  const springs = new FatSegments((NMAX + 1) * (COIL_PTS - 1), 0x9fb0cc, 0.028);
  chainGroup.add(springs.line);

  const massGeo = new THREE.SphereGeometry(1, 24, 16);
  const massMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.25, emissive: 0x111111 });
  const masses = new THREE.InstancedMesh(massGeo, massMat, NMAX);
  masses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chainGroup.add(masses);

  const ghostGroup = new THREE.Group();
  chainGroup.add(ghostGroup);
  const ghostMat: THREE.MeshBasicMaterial[] = [];
  const ghosts = GHOST_Y.map((y) => {
    const line = new FatSegments(NMAX + 1, 0xffffff, 0.022, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    ghostMat.push(mat);
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 14, 10), mat, NMAX);
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.Group();
    g.add(line.line, dots);
    ghostGroup.add(g);
    const lab = stage.label('', [-HALF + 0.05, y + 0.38, 0], '', g);
    lab.center.set(0, 0.5);
    return { y, line, dots, group: g, lab, k: 0 };
  });
  const sideLab = stage.label('', [-HALF + 0.05, GHOST_Y[2] - 0.7, 0], 'muted', chainGroup);
  sideLab.center.set(0, 0.5);

  const m4 = new THREE.Matrix4();
  const qi = new THREE.Quaternion();
  const tp = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const colTmp = new THREE.Color();

  const spacing = () => (2 * HALF) / (N + 1);
  const restX = (j: number) => -HALF + (j + 1) * spacing();
  const sL = () => 0.3 * spacing();
  const massPos = (j: number, out: THREE.Vector3) =>
    display === 'transverse' ? out.set(restX(j), CHAIN_Y + S_T * x[j], 0) : out.set(restX(j) + sL() * x[j], CHAIN_Y, 0);

  const pa = new THREE.Vector3();

  function writeSpring(seg: number, ax: number, ay: number, bx: number, by: number): number {
    const b = springs.buf;
    if (springStyle === 'line') {
      const o = seg * 6;
      b[o] = ax; b[o + 1] = ay; b[o + 2] = 0;
      b[o + 3] = bx; b[o + 4] = by; b[o + 5] = 0;
      return seg + 1;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular in the plane (−uy, ux) and out of plane (0, 0, 1)
    const r = Math.min(0.13, 0.22 * spacing());
    const turns = 6;
    let px = ax;
    let py = ay;
    let pz = 0;
    for (let i = 1; i < COIL_PTS; i++) {
      const s = i / (COIL_PTS - 1);
      let cx: number;
      let cy: number;
      let cz: number;
      if (s < 0.14 || s > 0.86 || i === COIL_PTS - 1) {
        cx = ax + dx * s;
        cy = ay + dy * s;
        cz = 0;
      } else {
        const u = (s - 0.14) / 0.72;
        const ph = u * turns * Math.PI * 2;
        const rr = r * Math.sin(Math.PI * Math.min(1, u * 8, (1 - u) * 8) / 2);
        cx = ax + dx * s - uy * rr * Math.sin(ph);
        cy = ay + dy * s + ux * rr * Math.sin(ph);
        cz = rr * Math.cos(ph);
      }
      const o = seg * 6;
      b[o] = px; b[o + 1] = py; b[o + 2] = pz;
      b[o + 3] = cx; b[o + 4] = cy; b[o + 5] = cz;
      seg++;
      px = cx;
      py = cy;
      pz = cz;
    }
    return seg;
  }

  function drawChain(): void {
    const rad = Math.min(0.19, 0.3 * spacing());
    let seg = 0;
    let ax = -HALF;
    let ay = CHAIN_Y;
    for (let j = 0; j < N; j++) {
      massPos(j, pa);
      m4.compose(pa, qi, sc.setScalar(rad));
      masses.setMatrixAt(j, m4);
      seg = writeSpring(seg, ax, ay, pa.x - rad * 0.9 * Math.sign(pa.x - ax || 1), pa.y);
      ax = pa.x + rad * 0.9;
      ay = pa.y;
    }
    seg = writeSpring(seg, ax, ay, HALF, CHAIN_Y);
    springs.commit(seg);
    masses.instanceMatrix.needsUpdate = true;

    // Ghost rows: the three strongest modes, each drawn as q_k(t) φ_k
    const sp = spacing();
    for (let r = 0; r < 3; r++) {
      const gh = ghosts[r];
      if (!gh.group.visible) continue;
      const k = gh.k;
      const shape = modes.shapes[k - 1];
      const qk = q[k - 1];
      const b = gh.line.buf;
      let lx = -HALF;
      let ly = gh.y;
      for (let j = 0; j < N; j++) {
        const cx = -HALF + (j + 1) * sp;
        const cy = gh.y + S_T * GHOST_S * qk * shape[j];
        const o = j * 6;
        b[o] = lx; b[o + 1] = ly; b[o + 2] = 0;
        b[o + 3] = cx; b[o + 4] = cy; b[o + 5] = 0;
        m4.compose(tp.set(cx, cy, 0), qi, sc.setScalar(1));
        gh.dots.setMatrixAt(j, m4);
        lx = cx;
        ly = cy;
      }
      const o = N * 6;
      b[o] = lx; b[o + 1] = ly; b[o + 2] = 0;
      b[o + 3] = HALF; b[o + 4] = gh.y; b[o + 5] = 0;
      gh.line.commit(N + 1);
      gh.dots.count = N;
      gh.dots.instanceMatrix.needsUpdate = true;
    }
  }

  function paintMasses(): void {
    for (let j = 0; j < NMAX; j++) {
      colTmp.setHex(j + 1 === watch ? PALETTE.white : PALETTE.amber);
      masses.setColorAt(j, colTmp);
    }
    if (masses.instanceColor) masses.instanceColor.needsUpdate = true;
  }

  function measure(): void {
    project(x, modes.shapes, q);
    project(v, modes.shapes, qd);
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const w = modes.omega[k];
      E[k] = 0.5 * (qd[k] * qd[k] + w * w * q[k] * q[k]);
      sum += E[k];
    }
    totalE = chainEnergy(x, v, p);
    activeModes = 0;
    modeDrift = 0;
    for (let k = 0; k < N; k++) {
      frac[k] = sum > 1e-12 ? E[k] / sum : 0;
      if (frac[k] >= 0.05) activeModes++;
      if (E0tot > 0) modeDrift = Math.max(modeDrift, Math.abs(E[k] - E0[k]) / E0tot);
    }
    // Top three modes by energy
    topIdx[0] = topIdx[1] = topIdx[2] = -1;
    for (let k = 0; k < N; k++) {
      if (topIdx[0] < 0 || frac[k] > frac[topIdx[0]]) {
        topIdx[2] = topIdx[1];
        topIdx[1] = topIdx[0];
        topIdx[0] = k;
      } else if (topIdx[1] < 0 || frac[k] > frac[topIdx[1]]) {
        topIdx[2] = topIdx[1];
        topIdx[1] = k;
      } else if (topIdx[2] < 0 || frac[k] > frac[topIdx[2]]) {
        topIdx[2] = k;
      }
    }
  }

  let ghostKey = '';
  function updateGhostRows(): void {
    let key = '';
    for (let r = 0; r < 3; r++) {
      const i = topIdx[r];
      const on = i >= 0 && frac[i] >= 0.01;
      key += on ? `${i},` : '-,';
    }
    const changed = key !== ghostKey;
    ghostKey = key;
    for (let r = 0; r < 3; r++) {
      const gh = ghosts[r];
      const i = topIdx[r];
      const on = i >= 0 && frac[i] >= 0.01;
      gh.group.visible = on;
      if (!on) continue;
      gh.k = i + 1;
      if (changed) {
        const c = modeCol(gh.k);
        gh.line.mat.color.setHex(c);
        ghostMat[r].color.setHex(c);
        gh.lab.element.style.color = css(c);
      }
      gh.lab.element.textContent = `${r === 0 ? '= ' : '+ '}mode ${gh.k} · ${(frac[i] * 100).toFixed(0)}% of energy`;
    }
  }

  function updateBeats(simDt: number): void {
    const a = topIdx[0];
    const b = topIdx[1];
    if (a < 0 || b < 0) {
      beatClock = 0;
      beatPair = '';
      return;
    }
    const wa = modes.omega[a];
    const wb = modes.omega[b];
    const close = Math.abs(wa - wb) / (0.5 * (wa + wb)) < 0.1;
    const ok = frac[a] >= 0.3 && frac[b] >= 0.3 && close;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    beatPeriod = (2 * Math.PI) / Math.abs(wa - wb);
    if (!ok) {
      beatClock = 0;
      beatPair = '';
      return;
    }
    if (key !== beatPair) {
      beatPair = key;
      beatClock = 0;
    }
    beatClock += simDt;
    if (beatClock >= beatPeriod) beatDone = true;
  }

  // =========================================================================
  // Drum scene
  // =========================================================================
  const drumGroup = new THREE.Group();
  drumGroup.visible = false;
  scene.add(drumGroup);
  const drumFloor = makeGrid(16, 32);
  drumFloor.position.y = -1.8;
  drumGroup.add(drumFloor);

  const surfGeo = new THREE.PlaneGeometry(DRUM_D, DRUM_D, DRUM_RES, DRUM_RES);
  surfGeo.rotateX(-Math.PI / 2);
  const nV = (DRUM_RES + 1) * (DRUM_RES + 1);
  const surfCol = new Float32Array(nV * 3);
  surfGeo.setAttribute('color', new THREE.BufferAttribute(surfCol, 3));
  const surfMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  drumGroup.add(surf);
  const surfPos = surfGeo.attributes.position as THREE.BufferAttribute;
  const phiV = new Float32Array(nV); // static shape at each surface vertex
  const vU = new Float32Array(nV);
  const vV = new Float32Array(nV);
  for (let i = 0; i < nV; i++) {
    vU[i] = surfPos.getX(i) / DRUM_D + 0.5;
    vV[i] = surfPos.getZ(i) / DRUM_D + 0.5;
  }

  // Rim
  {
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x4a5878, metalness: 0.5, roughness: 0.4 });
    const long = new THREE.BoxGeometry(DRUM_D + 0.24, 0.16, 0.12);
    for (const [px, pz, ry] of [[0, DRUM_D / 2 + 0.06, 0], [0, -DRUM_D / 2 - 0.06, 0], [DRUM_D / 2 + 0.06, 0, Math.PI / 2], [-DRUM_D / 2 - 0.06, 0, Math.PI / 2]]) {
      const bar = new THREE.Mesh(long, rimMat);
      bar.position.set(px, 0, pz);
      bar.rotation.y = ry;
      drumGroup.add(bar);
    }
  }

  // Lattice masses
  const latCount = DRUM_M * DRUM_M;
  const lattice = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdfe6f3, roughness: 0.4 }), latCount);
  lattice.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drumGroup.add(lattice);
  const latPhi = new Float32Array(latCount);

  // Nodal lines from marching squares on the static shape
  const NODAL_CAP = 4000;
  const nodal = new FatSegments(NODAL_CAP, 0xffffff, 0.03);
  nodal.line.position.y = 0.012;
  drumGroup.add(nodal.line);

  // Sand
  const sandPos = new Float32Array(SAND * 3);
  const sandU = new Float32Array(SAND);
  const sandV = new Float32Array(SAND);
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
  const sand = new THREE.Points(sandGeo, new THREE.PointsMaterial({ color: 0xf5e2b8, size: 0.045, sizeAttenuation: true }));
  sand.frustumCulled = false;
  drumGroup.add(sand);

  const drumLab = stage.label('', [0, 0.25, -DRUM_D / 2 - 0.5], 'big', drumGroup);
  stage.label('white lines: nodal lines, never move', [0, -0.35, DRUM_D / 2 + 0.55], 'muted', drumGroup);

  let tDrum = 0;
  let drumNorm = 1;
  let drumOmegaNow = 0;
  let domains = 1;
  const theta = () => (mixDeg * Math.PI) / 180;

  function scatterSand(): void {
    for (let i = 0; i < SAND; i++) {
      sandU[i] = 0.02 + 0.96 * Math.random();
      sandV[i] = 0.02 + 0.96 * Math.random();
    }
  }

  function rebuildDrum(): void {
    const th = theta();
    let peak = 0;
    for (let i = 0; i < nV; i++) {
      phiV[i] = drumShape(vU[i], vV[i], dm, dn, th);
      peak = Math.max(peak, Math.abs(phiV[i]));
    }
    peak = peak || 1;
    drumNorm = 1 / peak;
    const cPos = new THREE.Color(PALETTE.cyan);
    const cNeg = new THREE.Color(PALETTE.rose);
    const cMid = new THREE.Color(0x1a2338);
    for (let i = 0; i < nV; i++) {
      phiV[i] /= peak;
      const f = phiV[i];
      colTmp.copy(cMid).lerp(f >= 0 ? cPos : cNeg, Math.min(1, Math.abs(f) * 1.4));
      surfCol[i * 3] = colTmp.r;
      surfCol[i * 3 + 1] = colTmp.g;
      surfCol[i * 3 + 2] = colTmp.b;
    }
    (surfGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < DRUM_M; i++) {
      for (let j = 0; j < DRUM_M; j++) latPhi[i * DRUM_M + j] = drumShape((i + 1) / (DRUM_M + 1), (j + 1) / (DRUM_M + 1), dm, dn, th) / peak;
    }
    // Marching squares for Φ = 0 on a fine grid
    const R = 120;
    const val = new Float32Array((R + 1) * (R + 1));
    for (let i = 0; i <= R; i++) for (let j = 0; j <= R; j++) val[i * (R + 1) + j] = drumShape(i / R, j / R, dm, dn, th);
    const b = nodal.buf;
    let seg = 0;
    const eps = 1e-9 * peak;
    const toX = (u: number) => (u - 0.5) * DRUM_D;
    const emit = (u0: number, v0: number, u1: number, v1: number) => {
      if (seg >= NODAL_CAP) return;
      const o = seg * 6;
      b[o] = toX(u0); b[o + 1] = 0; b[o + 2] = toX(v0);
      b[o + 3] = toX(u1); b[o + 4] = 0; b[o + 5] = toX(v1);
      seg++;
    };
    for (let i = 1; i < R - 1; i++) {
      for (let j = 1; j < R - 1; j++) {
        const f00 = val[i * (R + 1) + j];
        const f10 = val[(i + 1) * (R + 1) + j];
        const f01 = val[i * (R + 1) + j + 1];
        const f11 = val[(i + 1) * (R + 1) + j + 1];
        const pts: number[] = [];
        const edge = (fa: number, fb: number, ua: number, va: number, ub: number, vb: number) => {
          if ((fa > eps) === (fb > eps)) return;
          const t = fa / (fa - fb);
          pts.push(ua + (ub - ua) * t, va + (vb - va) * t);
        };
        const u0 = i / R;
        const u1 = (i + 1) / R;
        const v0 = j / R;
        const v1 = (j + 1) / R;
        edge(f00, f10, u0, v0, u1, v0);
        edge(f10, f11, u1, v0, u1, v1);
        edge(f11, f01, u1, v1, u0, v1);
        edge(f01, f00, u0, v1, u0, v0);
        if (pts.length >= 4) emit(pts[0], pts[1], pts[2], pts[3]);
        if (pts.length >= 8) emit(pts[4], pts[5], pts[6], pts[7]);
      }
    }
    nodal.commit(seg);
    domains = nodalDomains(dm, dn, th);
    drumOmegaNow = drumOmega(dm, dn, DRUM_M, DRUM_W0);
    const mixed = dm !== dn && Math.abs(Math.sin(th)) > 1e-6 && Math.abs(Math.cos(th)) > 1e-6;
    drumLab.element.textContent = mixed
      ? `(${dm},${dn}) and (${dn},${dm}) mixed: same pitch, curved nodal lines`
      : `mode (${Math.abs(Math.sin(th)) > 0.5 ? dn : dm},${Math.abs(Math.sin(th)) > 0.5 ? dm : dn}): ${dm - 1 + dn - 1} nodal line${dm + dn - 2 === 1 ? '' : 's'}`;
    scatterSand();
    drawInset();
  }

  function drawDrum(dt: number): void {
    const A = 0.55 * amp * Math.exp(-0.5 * p.gamma * tDrum) * Math.cos(drumOmegaNow * tDrum);
    for (let i = 0; i < nV; i++) surfPos.setY(i, A * phiV[i]);
    surfPos.needsUpdate = true;
    surfGeo.computeVertexNormals();
    const half = DRUM_D / 2;
    for (let i = 0; i < DRUM_M; i++) {
      for (let j = 0; j < DRUM_M; j++) {
        const u = (i + 1) / (DRUM_M + 1);
        const w = (j + 1) / (DRUM_M + 1);
        m4.compose(tp.set(u * DRUM_D - half, A * latPhi[i * DRUM_M + j] + 0.03, w * DRUM_D - half), qi, sc.setScalar(1));
        lattice.setMatrixAt(i * DRUM_M + j, m4);
      }
    }
    lattice.instanceMatrix.needsUpdate = true;
    if (!sand.visible) return;
    const th = theta();
    const env = Math.exp(-0.5 * p.gamma * tDrum);
    const kick = 0.06 * Math.sqrt(Math.max(0, dt)) * env * Math.min(1.5, amp);
    for (let i = 0; i < SAND; i++) {
      let f = drumShape(sandU[i], sandV[i], dm, dn, th);
      if (kick > 0) {
        const step = kick * Math.abs(f) * drumNorm;
        let u = sandU[i] + step * (Math.random() * 2 - 1) * 1.7;
        let w = sandV[i] + step * (Math.random() * 2 - 1) * 1.7;
        if (u < 0.005) u = 0.01 - u;
        if (u > 0.995) u = 1.99 - u;
        if (w < 0.005) w = 0.01 - w;
        if (w > 0.995) w = 1.99 - w;
        sandU[i] = u;
        sandV[i] = w;
        f = drumShape(u, w, dm, dn, th);
      }
      sandPos[i * 3] = (sandU[i] - 0.5) * DRUM_D;
      sandPos[i * 3 + 1] = A * f * drumNorm + 0.02;
      sandPos[i * 3 + 2] = (sandV[i] - 0.5) * DRUM_D;
    }
    (sandGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // =========================================================================
  // Overlays: trace (top right), spectrum (bottom right), legend (top left)
  // =========================================================================
  const boxStyle = { background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute' };
  const trace = document.createElement('canvas');
  trace.className = 'nm-trace';
  trace.width = 460;
  trace.height = 190;
  Object.assign(trace.style, { ...boxStyle, right: '10px', top: '10px', width: '230px', height: '95px' });
  viewport.appendChild(trace);
  const tctx = trace.getContext('2d')!;

  const inset = document.createElement('canvas');
  inset.className = 'nm-spectrum';
  inset.width = 460;
  inset.height = 320;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '230px', height: '160px' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const MONO = 'JetBrains Mono, ui-monospace, monospace';

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  function paintLegend(): void {
    legend.innerHTML = view === 'chain'
      ? `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div>The rows below the chain are its pure modes. Add them point by point to get the chain.</div>
<div style="margin-top:3px"><span style="color:${css(PALETTE.amber)}">Drag a ball</span> to pluck. The <span style="color:#fff">white one</span> is traced.</div>`
      : `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read the drum</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan</span> and <span style="color:${css(PALETTE.rose)}">rose</span> patches always move in opposite directions.</div>
<div><span style="color:#fff">White lines</span> are nodal lines. They never move, so the <span style="color:#f5e2b8">sand</span> gathers there.</div>`;
  }

  // Trace ring buffer
  const traceBuf = new Float32Array(TRACE_CAP);
  let traceLen = 0;
  let traceHead = 0;
  let traceAcc = 0;
  let traceScale = 1;

  function drawTrace(): void {
    const W = trace.width;
    const Hh = trace.height;
    const c = tctx;
    c.clearRect(0, 0, W, Hh);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText(`mass ${watch}: x(t), last 30 s`, 16, 30);
    const mid = 110;
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(12, mid);
    c.lineTo(W - 12, mid);
    c.stroke();
    if (traceLen < 2) return;
    let mx = 1e-6;
    for (let i = 0; i < traceLen; i++) mx = Math.max(mx, Math.abs(traceBuf[i]));
    traceScale = traceScale * 0.9 + mx * 0.1;
    const s = 64 / Math.max(traceScale, mx * 0.5, 1e-3);
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 3;
    c.beginPath();
    const start = (traceHead - traceLen + TRACE_CAP) % TRACE_CAP;
    for (let i = 0; i < traceLen; i++) {
      const val = traceBuf[(start + i) % TRACE_CAP];
      const px = 12 + ((W - 24) * (TRACE_CAP - traceLen + i)) / (TRACE_CAP - 1);
      const py = mid - val * s;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  }

  function drawSpectrum(): void {
    const W = inset.width;
    const Hh = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, Hh);
    c.font = `24px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('energy in each mode', 18, 36);
    const x0 = 24;
    const x1 = W - 20;
    const y0 = Hh - 52;
    const y1 = 70;
    const slot = (x1 - x0) / N;
    const bw = Math.max(6, slot * 0.7);
    // 5% activity threshold
    const yT = y0 - 0.05 * (y0 - y1);
    c.strokeStyle = '#2c3852';
    c.setLineDash([6, 6]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, yT);
    c.lineTo(x1, yT);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#3a4a6e';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y0);
    c.stroke();
    c.font = `20px ${MONO}`;
    for (let k = 0; k < N; k++) {
      const cx = x0 + slot * (k + 0.5);
      const h = frac[k] * (y0 - y1);
      c.fillStyle = css(modeCol(k + 1));
      c.globalAlpha = frac[k] >= 0.05 ? 1 : 0.55;
      c.fillRect(cx - bw / 2, y0 - h, bw, Math.max(h, 1.5));
      c.globalAlpha = 1;
      c.fillStyle = k + 1 === modeK ? '#ffffff' : '#8391ab';
      const lab = String(k + 1);
      c.fillText(lab, cx - c.measureText(lab).width / 2, y0 + 28);
      if (frac[k] >= 0.08) {
        const pct = `${Math.round(frac[k] * 100)}`;
        c.fillStyle = '#dfe6f3';
        c.fillText(pct, cx - c.measureText(pct).width / 2, y0 - h - 8);
      }
    }
    c.fillStyle = '#56627c';
    c.fillText('k', W - 34, 36);
  }

  function drawDrumTable(): void {
    const W = inset.width;
    const Hh = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, Hh);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('pitch ω_mn / ω_11', 18, 30);
    const G = 5;
    const gx0 = 64;
    const gy0 = 70;
    const cw = (W - gx0 - 14) / G;
    const ch = (Hh - gy0 - 12) / G;
    const w11 = drumOmega(1, 1, DRUM_M, DRUM_W0);
    const th = theta();
    const mixed = dm !== dn && Math.abs(Math.sin(th)) > 1e-6;
    c.font = `18px ${MONO}`;
    for (let n = 1; n <= G; n++) {
      c.fillStyle = '#56627c';
      c.fillText(`n${n}`, 18, gy0 + (n - 0.5) * ch + 6);
      for (let m = 1; m <= G; m++) {
        const xx = gx0 + (m - 1) * cw;
        const yy = gy0 + (n - 1) * ch;
        const main = m === dm && n === dn && (!mixed ? Math.abs(Math.cos(th)) > 0.5 || dm === dn : true);
        const partner = mixed && m === dn && n === dm;
        const pureSwap = !mixed && dm !== dn && Math.abs(Math.sin(th)) > 0.5 && m === dn && n === dm;
        c.fillStyle = main || pureSwap ? 'rgba(79,209,232,0.35)' : partner ? 'rgba(167,139,250,0.35)' : 'rgba(28,36,54,0.8)';
        c.fillRect(xx + 2, yy + 2, cw - 4, ch - 4);
        c.fillStyle = main || partner || pureSwap ? '#ffffff' : '#8391ab';
        const r = (drumOmega(m, n, DRUM_M, DRUM_W0) / w11).toFixed(2);
        c.fillText(r, xx + cw / 2 - c.measureText(r).width / 2, yy + ch / 2 + 6);
      }
    }
    for (let m = 1; m <= G; m++) {
      c.fillStyle = '#56627c';
      const t = `m${m}`;
      c.fillText(t, gx0 + (m - 0.5) * cw - c.measureText(t).width / 2, gy0 - 6);
    }
  }

  function drawInset(): void {
    if (view === 'chain') drawSpectrum();
    else drawDrumTable();
  }

  // =========================================================================
  // Excitation
  // =========================================================================
  function shapePeak(k: number): number {
    const s = modes.shapes[k - 1];
    let mx = 0;
    for (let j = 0; j < N; j++) mx = Math.max(mx, Math.abs(s[j]));
    return mx || 1;
  }

  function applyExcitation(): void {
    x.fill(0);
    v.fill(0);
    const e = excitation;
    if (e.type === 'modes') {
      for (const { k, w } of e.list) {
        if (k > N) continue;
        const s = modes.shapes[k - 1];
        const f = (amp * w) / shapePeak(k);
        for (let j = 0; j < N; j++) x[j] += f * s[j];
      }
    } else if (e.type === 'preset') {
      presetShape(e.name, N, amp, x, e.seed);
    } else if (e.type === 'drag') {
      const j = Math.max(0, Math.min(N - 1, Math.round(e.frac * (N + 1)) - 1));
      trianglePluck(N, j, e.disp, x);
    } else if (e.n === N) {
      x.set(e.data);
    } else {
      excitation = { type: 'modes', list: [{ k: Math.min(modeK, N), w: 1 }] };
      applyExcitation();
      return;
    }
    restart();
  }

  /** Called whenever the state is set by hand. Resets baselines, the clock and the trace. */
  function restart(): void {
    chainAccel(x, p, acc);
    tSim = 0;
    accT = 0;
    traceLen = 0;
    traceHead = 0;
    traceAcc = 0;
    beatClock = 0;
    beatPair = '';
    measure();
    for (let k = 0; k < N; k++) E0[k] = E[k];
    E0tot = 0;
    for (let k = 0; k < N; k++) E0tot += E[k];
    updateGhostRows();
    drawChain();
    drawSpectrum();
    drawTrace();
  }

  function rebuildChain(): void {
    p.N = N;
    modes = chainModes(N, W0);
    eigErr = 0;
    for (let k = 1; k <= N; k++) eigErr = Math.max(eigErr, Math.abs(modes.omega[k - 1] - chainOmega(k, N, W0)) / W0);
    masses.count = N;
    for (let r = 0; r < 3; r++) ghosts[r].dots.count = N;
    if (watch > N) {
      watch = N;
      watchCtl.set(N, false);
    }
    paintMasses();
    applyExcitation();
  }

  // =========================================================================
  // Pluck by dragging a mass
  // =========================================================================
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let dragJ = -1;
  let downX = 0;
  let downY = 0;
  let moved = false;
  const el = renderer.domElement;

  function setNdc(e: PointerEvent): void {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }

  function pickMass(e: PointerEvent): number {
    if (view !== 'chain') return -1;
    setNdc(e);
    const hits = ray.intersectObject(masses, false);
    if (hits.length && hits[0].instanceId !== undefined) return hits[0].instanceId;
    // Forgiving pick: nearest mass within a small screen radius
    let best = -1;
    let bestD = 0.08;
    for (let j = 0; j < N; j++) {
      massPos(j, tp).project(camera);
      const d = Math.hypot(tp.x - ndc.x, tp.y - ndc.y);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return best;
  }

  function dragTo(e: PointerEvent): void {
    setNdc(e);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    let d = display === 'transverse' ? (hit.y - CHAIN_Y) / S_T : (hit.x - restX(dragJ)) / sL();
    d = Math.max(-1.6, Math.min(1.6, d));
    excitation = { type: 'drag', frac: (dragJ + 1) / (N + 1), disp: d };
    trianglePluck(N, dragJ, d, x);
    v.fill(0);
    restart();
  }

  const onDown = (e: PointerEvent) => {
    const j = pickMass(e);
    if (j < 0) return;
    dragJ = j;
    downX = e.clientX;
    downY = e.clientY;
    moved = false;
    controls.enabled = false;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (dragJ >= 0) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 3) moved = true;
      if (moved) dragTo(e);
      return;
    }
    if (e.buttons === 0) el.style.cursor = pickMass(e) >= 0 ? 'grab' : '';
  };
  const onUp = () => {
    if (dragJ < 0) return;
    if (!moved) {
      // A plain click plucks that mass upward by the amplitude setting.
      excitation = { type: 'drag', frac: (dragJ + 1) / (N + 1), disp: display === 'transverse' ? amp : Math.min(amp, 1.2) };
      applyExcitation();
    }
    plucked = true;
    dragJ = -1;
    controls.enabled = true;
    el.style.cursor = '';
  };
  el.addEventListener('pointerdown', onDown, { capture: true });
  el.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // =========================================================================
  // Frame loop
  // =========================================================================
  let insetTimer = 0;
  stage.onFrame((dt) => {
    const simDt = playing ? dt * speed : 0;
    if (view === 'chain') {
      if (dragJ < 0 && simDt > 0) {
        accT += simDt;
        let steps = 0;
        while (accT >= H && steps < 400) {
          chainStep(x, v, acc, p, H);
          accT -= H;
          steps++;
          traceAcc += H;
          if (traceAcc >= 1 / 30) {
            traceAcc -= 1 / 30;
            traceBuf[traceHead] = x[watch - 1];
            traceHead = (traceHead + 1) % TRACE_CAP;
            traceLen = Math.min(TRACE_CAP, traceLen + 1);
          }
        }
        if (steps >= 400) accT = 0;
        tSim += simDt;
        measure();
        updateBeats(simDt);
        updateGhostRows();
        drawChain();
      }
      insetTimer += dt;
      if (insetTimer > 1 / 20) {
        insetTimer = 0;
        drawSpectrum();
        drawTrace();
      }
    } else {
      tDrum += simDt;
      drawDrum(simDt);
    }
    updateReadouts();
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'chain', label: 'Chain' }, { value: 'drum', label: 'Drum' }],
    onChange: (vv) => setView(vv),
  });
  ui.select<Display>({
    key: 'display', label: 'Chain motion', value: display,
    options: [{ value: 'transverse', label: 'Transverse' }, { value: 'longitudinal', label: 'Longitudinal' }],
    onChange: (vv) => { display = vv; toChain(); sideLab.element.textContent = vv === 'longitudinal' ? 'mode rows drawn sideways' : ''; drawChain(); },
  });
  ui.select<SpringStyle>({
    key: 'springs', label: 'Springs', value: springStyle,
    options: [{ value: 'coil', label: 'Coils' }, { value: 'line', label: 'Lines' }],
    onChange: (vv) => { springStyle = vv; drawChain(); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => { if (view === 'chain') applyExcitation(); else tDrum = 0; } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 4, step: 0.05, value: speed, format: (vv) => `${vv.toFixed(2)}×`, onInput: (vv) => (speed = vv) });

  ui.section('Chain');
  const toChain = () => { if (view !== 'chain') viewCtl.set('chain'); };
  ui.slider({ key: 'N', label: 'Masses N', min: 2, max: NMAX, step: 1, value: N, onInput: (vv) => {
    N = vv;
    if (modeK > N) {
      modeK = N;
      modeCtl.set(N, false);
    }
    toChain();
    rebuildChain();
  } });
  const modeCtl = ui.slider({ key: 'mode', label: 'Mode k', min: 1, max: NMAX, step: 1, value: modeK, format: (vv) => (vv > N ? `${vv} (> N)` : String(vv)), onInput: (vv) => {
    modeK = Math.min(vv, N);
    if (vv > N) modeCtl.set(N, false);
    drawSpectrum();
  } });
  ui.buttons([
    { label: 'Excite k purely', primary: true, key: 'mode', onClick: () => { toChain(); excitation = { type: 'modes', list: [{ k: modeK, w: 1 }] }; plucked = false; applyExcitation(); } },
    {
      label: 'Add mode k', key: 'mode',
      onClick: () => {
        toChain();
        const s = modes.shapes[modeK - 1];
        const f = amp / shapePeak(modeK);
        for (let j = 0; j < N; j++) x[j] += f * s[j];
        if (excitation.type === 'modes') excitation = { type: 'modes', list: [...excitation.list, { k: modeK, w: 1 }] };
        else excitation = { type: 'shape', data: Float64Array.from(x), n: N };
        plucked = false;
        restart();
      },
    },
  ]);
  ui.slider({ key: 'amp', label: 'Amplitude', min: 0.1, max: 1.5, step: 0.05, value: amp, onInput: (vv) => { amp = vv; if (view === 'chain') applyExcitation(); } });
  ui.slider({ key: 'damping', label: 'Damping γ', min: 0, max: 0.6, step: 0.01, value: p.gamma, unit: '/s', onInput: (vv) => { p.gamma = vv; } });
  ui.slider({ key: 'beta', label: 'Nonlinearity β (FPU)', min: 0, max: 10, step: 0.1, value: p.beta, onInput: (vv) => { p.beta = vv; chainAccel(x, p, acc); } });
  const watchCtl = ui.slider({ key: 'watch', label: 'Traced mass j', min: 1, max: NMAX, step: 1, value: watch, onInput: (vv) => {
    watch = Math.min(vv, N);
    if (vv > N) watchCtl.set(N, false);
    traceLen = 0;
    paintMasses();
  } });

  ui.section('Pluck');
  ui.note('Drag any ball in the scene to pull it aside, then let go. A plain click plucks it by the amplitude.');
  const preset = (name: PluckPreset) => () => {
    toChain();
    excitation = { type: 'preset', name, seed: (Math.random() * 1e9) | 0 };
    plucked = true;
    applyExcitation();
  };
  ui.buttons([
    { label: 'Centre', key: 'pluck', onClick: preset('centre') },
    { label: 'Quarter', key: 'pluck', onClick: preset('quarter') },
    { label: 'One mass', key: 'pluck', onClick: preset('single') },
    { label: 'Bump', key: 'pluck', onClick: preset('bump') },
    { label: 'Random', key: 'pluck', onClick: preset('random') },
  ]);

  ui.section('Drum');
  const toDrum = () => { if (view !== 'drum') viewCtl.set('drum'); };
  ui.slider({ key: 'm', label: 'm (across)', min: 1, max: 5, step: 1, value: dm, onInput: (vv) => { dm = vv; toDrum(); rebuildDrum(); } });
  ui.slider({ key: 'n', label: 'n (along)', min: 1, max: 5, step: 1, value: dn, onInput: (vv) => { dn = vv; toDrum(); rebuildDrum(); } });
  ui.slider({ key: 'mix', label: 'Mix with (n, m)', min: -90, max: 90, step: 1, value: mixDeg, unit: '°', onInput: (vv) => { mixDeg = vv; toDrum(); rebuildDrum(); } });
  ui.toggle({ key: 'sand', label: 'Sprinkle sand', value: sandOn, onChange: (vv) => { sandOn = vv; sand.visible = vv; toDrum(); } });
  ui.buttons([
    { label: 'Strike again', key: 'amp', onClick: () => { toDrum(); tDrum = 0; } },
    { label: 'Scatter sand', key: 'sand', onClick: () => { toDrum(); scatterSand(); } },
  ]);

  ui.section('Readouts');
  const rOmega = ui.readout('omega', 'ω_k numeric', 'rad/s');
  const rEig = ui.readout('eig', 'eigen error');
  const rActive = ui.readout('active', 'active modes');
  const rDrift = ui.readout('drift', 'mode energy drift');
  const rE = ui.readout('energy', 'total energy');
  const rBeat = ui.readout('beat', 'beat period');
  const rDrum = ui.readout('ratio', 'drum ω_mn / ω_11');
  const rDom = ui.readout('domains', 'nodal domains');
  ui.note('Energy units: mass 1, ω₀ = 4 rad/s. The eigen error compares the Jacobi solver with 2ω₀ sin(kπ/2(N+1)).');

  function updateReadouts(): void {
    rOmega(`${modes.omega[modeK - 1].toFixed(4)} (exact ${chainOmega(modeK, N, W0).toFixed(4)})`);
    rEig(`${eigErr.toExponential(0)} ω₀`);
    rActive(`${activeModes} of ${N}`);
    rDrift(p.beta > 0 ? 'β on: modes trade' : p.gamma > 0 ? 'damping on' : `${modeDrift.toExponential(0)} of E`);
    rE(totalE.toFixed(3));
    const a = topIdx[0];
    const b = topIdx[1];
    if (a >= 0 && b >= 0 && frac[b] >= 0.05) {
      const lab = `${beatPeriod.toFixed(1)} s (modes ${a + 1}, ${b + 1})`;
      rBeat(beatClock > 0 ? `${lab} ${Math.min(100, (beatClock / beatPeriod) * 100).toFixed(0)}%` : lab);
    } else rBeat('one mode');
    const w11 = drumOmega(1, 1, DRUM_M, DRUM_W0);
    rDrum(`${(drumOmegaNow / w11).toFixed(3)} (smooth skin ${drumRatioContinuum(dm, dn).toFixed(3)})`);
    rDom(domains);
  }

  function setView(vv: View): void {
    view = vv;
    chainGroup.visible = vv === 'chain';
    drumGroup.visible = vv === 'drum';
    trace.style.display = vv === 'chain' ? '' : 'none';
    const c = CAM[vv];
    stage.flyTo(c.pos, c.target, 1.2);
    if (vv === 'drum') tDrum = 0;
    paintLegend();
    drawInset();
  }

  // --- Start
  rebuildChain();
  rebuildDrum();
  paintLegend();
  drawDrum(0);

  return {
    state: () => ({
      view, display, N, k: modeK, amp, damping: p.gamma, beta: p.beta, t: tSim,
      frac3: N >= 3 ? frac[2] : 0,
      activeModes, energy: totalE, plucked, beatDone, beatPeriod,
      m: dm, n: dn, mix: mixDeg, nodalDomains: domains,
    }),
    dispose: () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      trace.remove();
      inset.remove();
      legend.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'normal-modes',
  number: 5,
  symbol: 'Nm',
  title: 'Normal Modes',
  domain: 'classical',
  level: 1,
  status: 'live',
  tagline: 'Every vibration is a chord of simpler pure tones.',
  content,
  mount,
};

export default topic;
