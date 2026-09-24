import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import * as P from './physics.ts';

type View = 'tokamak' | 'drift' | 'stellarator';
type Species = 'both' | 'ions' | 'electrons';

const R0 = 3; // major radius, m
const A = 1; // plasma minor radius, m
const WALL = 1.15; // wall minor radius: particles beyond it are lost
const NI = 12;
const NE = 12;
const NP = NI + NE;
const ME_RATIO = 16; // scaled electron mass ratio
const V_ION = 0.1; // ion speed, sim units
const K_POL = 0.004; // weakened polarisation response
const RATE = 120; // sim time units per real second at speed 1
const B_REF = 3.5; // tesla that maps to unit sim field
const CAP = 1400; // trail segments per particle
const STEP_BUDGET = 60000;
const SEG2 = 0.03 * 0.03;
const CUT = Math.PI / 2; // cutaway gap spans φ in (0, CUT)

const VIEWS: Record<View, { cam: [number, number, number]; target: [number, number, number]; caption: string }> = {
  tokamak: {
    cam: [7.6, 6.6, 10.4], target: [0, -0.7, 0],
    caption: 'Tokamak cutaway. Coil field plus plasma-current field make helical lines on nested surfaces.',
  },
  drift: {
    cam: [3, 0.05, 4.4], target: [3, 0, 0],
    caption: 'Drift demo. All particles projected onto one cross-section. The hole of the torus is to the left.',
  },
  stellarator: {
    cam: [0.5, 8.2, 8.6], target: [0, -0.4, 0],
    caption: 'Stellarator sketch. Twisted coils shape a twisted plasma. The field lines wind with no current in the plasma.',
  },
};

// Approximate historic positions on the Lawson diagram (see Deep Dive for the method).
const MARKERS: { label: string; T: number; nTau: number; dx: number; dy: number }[] = [
  { label: 'T-3 1968', T: 0.3, nTau: 1e17, dx: 10, dy: -8 },
  { label: 'W7-X 2018', T: 3.4, nTau: 5.2e19 / 3.4, dx: -60, dy: 26 },
  { label: 'JT-60U 1996', T: 16, nTau: P.nTauForQ(1.25, 16), dx: -150, dy: 2 },
  { label: 'JET 1997', T: 28, nTau: P.nTauForQ(0.64, 28), dx: 10, dy: -8 },
  { label: 'TFTR 1994', T: 35, nTau: P.nTauForQ(0.27, 35), dx: -40, dy: 26 },
  { label: 'NIF (inertial)', T: 10, nTau: 1.2 * P.ignitionNTau(10), dx: -170, dy: -6 },
];

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fading segment trails for n particles of one colour, in one draw call. */
class SegTrails {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private birth: Float32Array;
  private head: Int32Array;
  private lo: Int32Array;
  private hi: Int32Array;
  private mat: THREE.ShaderMaterial;

  constructor(private n: number, color: number, fade: number) {
    const nv = n * CAP * 2;
    this.pos = new Float32Array(nv * 3);
    this.birth = new Float32Array(nv).fill(-1e9);
    this.head = new Int32Array(n);
    this.lo = new Int32Array(n).fill(-1);
    this.hi = new Int32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('birth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { now: { value: 0 }, fade: { value: fade }, col: { value: new THREE.Color(color) } },
      vertexShader: `attribute float birth; uniform float now; uniform float fade; varying float vA;
        void main() { vA = clamp(1.0 - (now - birth) / fade, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 col; varying float vA;
        void main() { if (vA <= 0.0) discard; gl_FragColor = vec4(col * vA * vA, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  set now(t: number) { this.mat.uniforms.now.value = t; }

  push(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number): void {
    const slot = this.head[i];
    this.head[i] = (slot + 1) % CAP;
    const v = (i * CAP + slot) * 2;
    const p = v * 3;
    this.pos[p] = ax; this.pos[p + 1] = ay; this.pos[p + 2] = az;
    this.pos[p + 3] = bx; this.pos[p + 4] = by; this.pos[p + 5] = bz;
    this.birth[v] = this.birth[v + 1] = t;
    if (this.lo[i] < 0) { this.lo[i] = slot; this.hi[i] = slot; }
    else if (slot < this.lo[i]) { this.lo[i] = 0; this.hi[i] = CAP - 1; }
    else this.hi[i] = slot;
  }

  clearAll(): void {
    this.birth.fill(-1e9);
    this.head.fill(0);
    this.lo.fill(-1);
    const g = this.mesh.geometry;
    for (const name of ['position', 'birth']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.needsUpdate = true;
    }
  }

  flush(): void {
    const g = this.mesh.geometry;
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const ba = g.getAttribute('birth') as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.lo[i] < 0) continue;
      if (!any) { pa.clearUpdateRanges(); ba.clearUpdateRanges(); any = true; }
      const v0 = (i * CAP + this.lo[i]) * 2;
      const nv = (this.hi[i] - this.lo[i] + 1) * 2;
      pa.addUpdateRange(v0 * 3, nv * 3);
      ba.addUpdateRange(v0, nv);
      this.lo[i] = -1;
    }
    if (any) { pa.needsUpdate = true; ba.needsUpdate = true; }
  }
}

/** Glowing lines with pulses that run along them, showing the field direction. */
function flowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute float u; attribute vec3 col; attribute float clip; varying float vU; varying vec3 vC; varying float vClip; varying vec2 vXZ;
      void main() { vU = u; vC = col; vClip = clip; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; varying float vU; varying vec3 vC; varying float vClip; varying vec2 vXZ;
      void main() { if (vClip > 0.5 && vXZ.x > 0.0 && vXZ.y > 0.0) discard;
        float w = fract(vU * 0.22 - time * 0.35); float pulse = pow(1.0 - w, 8.0);
        gl_FragColor = vec4(vC * (0.45 + 1.6 * pulse), 1.0); }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dot {
  p: P.Particle;
  ion: boolean;
  idx: number; // index within its species
  dt: number;
  lost: boolean;
  lx: number; ly: number; lz: number; // last trail point (3D)
  sprite: THREE.Sprite;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: VIEWS.tokamak.cam, target: VIEWS.tokamak.target, fov: 45, far: 300 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'tokamak';
  let species: Species = 'both';
  let Btor = 3.5; // T
  let Ip = 2; // MA
  let eOn = true;
  let simSpeed = 1;
  let playing = true;
  let Tkev = 10;
  let nDens = 1; // 1e20 m^-3
  let tauExp = 0; // log10 τ_E / s
  let touched = false;

  const tk: P.Tokamak = { R0, a: A, B0: 1, iota: 0 };
  let qEdge = Infinity;
  let qTraced = Infinity;

  // =============================================================== tokamak furniture
  const tokGroup = new THREE.Group();
  scene.add(tokGroup);
  const cutGroup = new THREE.Group(); // anything built with TorusGeometry arcs goes here
  cutGroup.rotation.y = -CUT;
  tokGroup.add(cutGroup);

  const torusArc = (radius: number, tube: number, mat: THREE.Material, rs = 40, ts = 120): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, rs, ts, 2 * Math.PI - CUT), mat);
    m.rotation.x = Math.PI / 2;
    cutGroup.add(m);
    return m;
  };

  // Vacuum vessel
  torusArc(R0, WALL + 0.06, new THREE.MeshStandardMaterial({ color: 0x2a3a5c, transparent: true, opacity: 0.22, roughness: 0.6, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  const vesselWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.TorusGeometry(R0, WALL + 0.06, 12, 54, 2 * Math.PI - CUT)),
    new THREE.LineBasicMaterial({ color: 0x3a4d78, transparent: true, opacity: 0.28 }),
  );
  vesselWire.rotation.x = Math.PI / 2;
  cutGroup.add(vesselWire);

  // Nested flux surfaces
  const SURF = [0.3, 0.6, 0.92];
  const surfMats: THREE.MeshBasicMaterial[] = [];
  SURF.forEach((r, i) => {
    const m = new THREE.MeshBasicMaterial({ color: [PALETTE.violet, PALETTE.cyan, 0x6fb8ff][i], transparent: true, opacity: 0.05 + 0.03 * i, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    surfMats.push(m);
    torusArc(R0, r, m, 32, 96);
  });

  // Cross-section rings at both cut faces
  const ringGroup = new THREE.Group();
  tokGroup.add(ringGroup);
  const addRing = (phi: number, r: number, color: number, opacity: number, parent: THREE.Object3D = ringGroup) => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let k = 0; k <= 96; k++) {
      const th = (2 * Math.PI * k) / 96;
      const R = R0 + r * Math.cos(th);
      pts.push(R * Math.cos(phi), r * Math.sin(th), R * Math.sin(phi));
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    parent.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  for (const phi of [0, CUT]) {
    addRing(phi, WALL + 0.06, 0x6a7ea8, 0.7);
    SURF.forEach((r, i) => addRing(phi, r, [PALETTE.violet, PALETTE.cyan, 0x6fb8ff][i], 0.55));
  }

  // D-shaped toroidal field coils
  const dPts: THREE.Vector3[] = [];
  const RIN = 1.42;
  for (let k = 0; k <= 40; k++) {
    const s = -Math.PI / 2 + (Math.PI * k) / 40;
    dPts.push(new THREE.Vector3(RIN + 3.5 * Math.cos(s), 2.1 * Math.sin(s), 0));
  }
  for (let k = 1; k < 8; k++) dPts.push(new THREE.Vector3(RIN, 2.1 - (4.2 * k) / 8, 0));
  const dCurve = new THREE.CatmullRomCurve3(dPts, true, 'centripetal');
  const coilGeo = new THREE.TubeGeometry(dCurve, 160, 0.11, 10, true);
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x7b88a6, metalness: 0.65, roughness: 0.35 });
  const NCOIL = 16;
  for (let k = 0; k < NCOIL; k++) {
    const phi = (2 * Math.PI * (k + 0.5)) / NCOIL;
    if (phi > -0.05 && phi < CUT + 0.05) continue;
    const m = new THREE.Mesh(coilGeo, coilMat);
    m.rotation.y = -phi;
    tokGroup.add(m);
  }

  // Central solenoid
  const csMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.7, roughness: 0.35 });
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 4.0, 40, 1, true), csMat);
  tokGroup.add(cs);
  const csRingGeo = new THREE.TorusGeometry(0.97, 0.035, 8, 48);
  for (let k = 0; k < 11; k++) {
    const m = new THREE.Mesh(csRingGeo, coilMat);
    m.rotation.x = Math.PI / 2;
    m.position.y = -1.8 + (3.6 * k) / 10;
    tokGroup.add(m);
  }
  // Poloidal field coils
  const pfMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, metalness: 0.6, roughness: 0.4 });
  for (const [R, y] of [[5.35, 1.0], [5.35, -1.0], [2.3, 2.45], [2.3, -2.45]]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 10, 120, 2 * Math.PI - CUT), pfMat);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    cutGroup.add(m);
  }

  const tokLabels = new THREE.Group();
  tokGroup.add(tokLabels);
  stage.label('central solenoid', [0, 2.35, 0], 'muted', tokLabels);
  stage.label('toroidal field coil', [-3.2, 2.55, -3.2], 'muted', tokLabels);
  stage.label('vacuum vessel', [-3.3, -1.55, 2.7], 'muted', tokLabels);
  stage.label('nested flux surfaces', [3.2, -1.5, 0.2], 'muted', tokLabels);

  // --- Field lines (retraced when B or I change)
  const LINE_SPEC: { r: number; count: number; col: number }[] = [
    { r: 0.3, count: 2, col: PALETTE.violet },
    { r: 0.6, count: 3, col: PALETTE.cyan },
    { r: 0.92, count: 4, col: 0x9fd4ff },
  ];
  const NL = LINE_SPEC.reduce((s, x) => s + x.count, 0);
  const NPTS = 900;
  const DS = 0.045;
  const flPos = new Float32Array(NL * NPTS * 3);
  const flU = new Float32Array(NL * NPTS);
  const flCol = new Float32Array(NL * NPTS * 3);
  const flClip = new Float32Array(NL * NPTS);
  const flIdx: number[] = [];
  {
    let li = 0;
    const c = new THREE.Color();
    for (const spec of LINE_SPEC) {
      c.set(spec.col);
      for (let j = 0; j < spec.count; j++, li++) {
        for (let k = 0; k < NPTS; k++) {
          const v = li * NPTS + k;
          flU[v] = k * DS;
          flClip[v] = spec.r > 0.8 ? 1 : 0;
          flCol[3 * v] = c.r * 0.8; flCol[3 * v + 1] = c.g * 0.8; flCol[3 * v + 2] = c.b * 0.8;
          if (k < NPTS - 1) flIdx.push(v, v + 1);
        }
      }
    }
  }
  const flGeo = new THREE.BufferGeometry();
  flGeo.setAttribute('position', new THREE.BufferAttribute(flPos, 3));
  flGeo.setAttribute('u', new THREE.BufferAttribute(flU, 1));
  flGeo.setAttribute('col', new THREE.BufferAttribute(flCol, 3));
  flGeo.setAttribute('clip', new THREE.BufferAttribute(flClip, 1));
  flGeo.setIndex(flIdx);
  const flMat = flowMaterial();
  const fieldLines = new THREE.LineSegments(flGeo, flMat);
  fieldLines.frustumCulled = false;
  tokGroup.add(fieldLines);
  const lineBuf = new Float32Array(NPTS * 3);

  function retraceLines(): void {
    let li = 0;
    for (const spec of LINE_SPEC) {
      for (let j = 0; j < spec.count; j++, li++) {
        const th0 = (2 * Math.PI * j) / spec.count + spec.r;
        const ph0 = CUT + 0.3 + (2 * Math.PI * j) / spec.count;
        P.traceFieldLine(tk, spec.r, th0, ph0, DS, NPTS, lineBuf);
        flPos.set(lineBuf, li * NPTS * 3);
      }
    }
    (flGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // =============================================================== drift-view furniture
  const driftGroup = new THREE.Group();
  scene.add(driftGroup);
  const faceDisc = new THREE.Mesh(
    new THREE.CircleGeometry(WALL + 0.06, 64),
    new THREE.MeshBasicMaterial({ color: 0x0c1322, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  faceDisc.position.set(R0, 0, 0.005);
  driftGroup.add(faceDisc);
  addRing(0, WALL + 0.06, 0x6a7ea8, 0.9, driftGroup);
  SURF.forEach((r) => addRing(0, r, 0x2c3852, 0.8, driftGroup));
  {
    const axis = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0x56627c }));
    axis.position.set(R0, 0, 0.008);
    driftGroup.add(axis);
  }
  const dLab = {
    up: stage.label('ions drift up ↑', [R0, 1.45, 0], '', driftGroup),
    down: stage.label('electrons drift down ↓', [R0, -1.45, 0], '', driftGroup),
    strong: stage.label('← strong B (hole side)', [1.35, 0.35, 0], 'muted', driftGroup),
    weak: stage.label('weak B →', [4.55, 0.35, 0], 'muted', driftGroup),
    exb: stage.label('E ↓ and E×B → outward', [4.55, -0.3, 0], '', driftGroup),
  };
  dLab.up.element.style.color = css(PALETTE.amber);
  dLab.down.element.style.color = css(PALETTE.cyan);
  dLab.exb.element.style.color = css(PALETTE.rose);

  // =============================================================== stellarator
  const stelGroup = new THREE.Group();
  stelGroup.visible = false;
  scene.add(stelGroup);
  const NFP = 5;
  const stelCenter = (phi: number, out: THREE.Vector2) => out.set(R0 + 0.28 * Math.cos(NFP * phi), 0.28 * Math.sin(NFP * phi));
  const stelPoint = (phi: number, u: number, sa: number, sb: number, out: THREE.Vector3) => {
    const c = new THREE.Vector2();
    stelCenter(phi, c);
    const al = (NFP * phi) / 2;
    const lx = sa * Math.cos(u), ly = sb * Math.sin(u);
    const dR = lx * Math.cos(al) - ly * Math.sin(al);
    const dy = lx * Math.sin(al) + ly * Math.cos(al);
    const R = c.x + dR;
    return out.set(R * Math.cos(phi), c.y + dy, R * Math.sin(phi));
  };
  {
    // Plasma surface
    const NU = 40, NPH = 240;
    const pos: number[] = [];
    const idx: number[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i <= NPH; i++) {
      const phi = (2 * Math.PI * i) / NPH;
      for (let j = 0; j <= NU; j++) {
        stelPoint(phi, (2 * Math.PI * j) / NU, 0.95, 0.5, v);
        pos.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < NPH; i++) {
      for (let j = 0; j < NU; j++) {
        const a = i * (NU + 1) + j, b = a + NU + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    stelGroup.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5a3aa0, emissive: 0x2a1650, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })));
    // Modular coils: twisted loops around the rotating cross-section
    const NC = 50;
    for (let k = 0; k < NC; k++) {
      const phi0 = (2 * Math.PI * k) / NC;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < 48; j++) {
        const u = (2 * Math.PI * j) / 48;
        const phi = phi0 + 0.07 * Math.sin(u - (NFP * phi0) / 2);
        pts.push(stelPoint(phi, u, 1.55, 1.05, new THREE.Vector3()));
      }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.045, 6, true);
      stelGroup.add(new THREE.Mesh(tg, coilMat));
    }
    // Field lines on the surface (sketch with rotational transform ι ≈ 0.9)
    const NS = 4, NPT = 1400;
    const lp = new Float32Array(NS * NPT * 3);
    const lu = new Float32Array(NS * NPT);
    const lc = new Float32Array(NS * NPT * 3);
    const li: number[] = [];
    const c = new THREE.Color(0xd6b8ff);
    for (let s = 0; s < NS; s++) {
      let arc = 0;
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k < NPT; k++) {
        const phi = (4 * Math.PI * k) / NPT;
        const u = (2 * Math.PI * s) / NS + 0.9 * phi - (NFP * phi) / 2;
        stelPoint(phi, u, 0.97, 0.52, v);
        const w = s * NPT + k;
        if (k > 0) arc += Math.hypot(v.x - px, v.y - py, v.z - pz);
        px = v.x; py = v.y; pz = v.z;
        lp[3 * w] = v.x; lp[3 * w + 1] = v.y; lp[3 * w + 2] = v.z;
        lu[w] = arc;
        lc[3 * w] = c.r; lc[3 * w + 1] = c.g; lc[3 * w + 2] = c.b;
        if (k < NPT - 1) li.push(w, w + 1);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('u', new THREE.BufferAttribute(lu, 1));
    lg.setAttribute('col', new THREE.BufferAttribute(lc, 3));
    lg.setAttribute('clip', new THREE.BufferAttribute(new Float32Array(NS * NPT), 1));
    lg.setIndex(li);
    const ll = new THREE.LineSegments(lg, flMat);
    ll.frustumCulled = false;
    stelGroup.add(ll);
    stage.label('twisted modular coils', [-3.4, 1.9, 2.6], 'muted', stelGroup);
    stage.label('plasma: 5 field periods, no current needed', [0, -2.1, 3.6], 'muted', stelGroup);
  }

  // =============================================================== particles
  const glowTex = glowTexture();
  const dots: Dot[] = [];
  const partGroup = new THREE.Group();
  scene.add(partGroup);
  for (let i = 0; i < NP; i++) {
    const ion = i < NI;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: ion ? PALETTE.amber : PALETTE.cyan, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.scale.setScalar(ion ? 0.34 : 0.24);
    partGroup.add(sprite);
    dots.push({ p: P.makeParticle(ion ? 1 : -ME_RATIO), ion, idx: ion ? i : i - NI, dt: 0.1, lost: false, lx: 0, ly: 0, lz: 0, sprite });
  }
  const tr3I = new SegTrails(NI, PALETTE.amber, 2.5);
  const tr3E = new SegTrails(NE, PALETTE.cyan, 1.2);
  const trPI = new SegTrails(NI, PALETTE.amber, 6);
  const trPE = new SegTrails(NE, PALETTE.cyan, 6);
  const trail3D = new THREE.Group();
  trail3D.add(tr3I.mesh, tr3E.mesh);
  scene.add(trail3D);
  const trailProj = new THREE.Group();
  trailProj.add(trPI.mesh, trPE.mesh);
  trailProj.position.z = 0.012;
  driftGroup.add(trailProj);

  let simT = 0;
  let realT = 0;
  let Ey = 0;
  let lostCount = 0;
  let leadPhi = 0;
  let leadPrev = 0;
  let leadV0 = 1;
  let vdPred = 0;
  // Regression sums for the lead ion's vertical drift
  let St = 0, Sy = 0, Stt = 0, Sty = 0, Sn = 0;

  function relaunch(): void {
    const rnd = mulberry32(7);
    const Bsim = Btor / B_REF;
    const OmMax = (Bsim * R0) / (R0 - WALL);
    const dtIon = (2 * Math.PI) / (OmMax * 28);
    for (const d of dots) {
      const r = 0.25 + 0.3 * rnd();
      const th = 2 * Math.PI * rnd();
      const phi = d.ion && d.idx === 0 ? CUT + 0.4 : 2 * Math.PI * rnd();
      let pitch = (25 + 20 * rnd()) * (Math.PI / 180);
      if (!(d.ion && d.idx === 0) && rnd() < 0.5) pitch = Math.PI - pitch;
      const v = d.ion ? V_ION : V_ION * Math.sqrt(ME_RATIO);
      P.launch(d.p, tk, d.ion && d.idx === 0 ? 0.4 : r, d.ion && d.idx === 0 ? 0.5 : th, phi, v, pitch, 2 * Math.PI * rnd());
      d.dt = d.ion ? dtIon : dtIon / ME_RATIO;
      d.lost = false;
      d.lx = d.p.s[0]; d.ly = d.p.s[1]; d.lz = d.p.s[2];
      (d.sprite.material as THREE.SpriteMaterial).color.set(d.ion ? PALETTE.amber : PALETTE.cyan);
      if (d.ion && d.idx === 0) {
        leadV0 = v;
        vdPred = (v * v * (Math.cos(pitch) ** 2 + 0.5 * Math.sin(pitch) ** 2)) / (Bsim * R0);
      }
    }
    simT = 0;
    Ey = 0;
    lostCount = 0;
    const l = dots[0].p.s;
    leadPrev = Math.atan2(l[2], l[0]);
    leadPhi = 0;
    St = Sy = Stt = Sty = Sn = 0;
    tr3I.clearAll(); tr3E.clearAll(); trPI.clearAll(); trPE.clearAll();
    placeSprites();
  }

  function applyField(): void {
    tk.B0 = Btor / B_REF;
    qEdge = P.edgeQ(Btor, Ip * 1e6, R0, A);
    tk.iota = Number.isFinite(qEdge) ? 1 / qEdge : 0;
    qTraced = Number.isFinite(qEdge) && qEdge < 60 ? P.measureQ(tk, A, 0.02).q : Infinity;
    retraceLines();
    updateKink();
    updateLegend();
  }

  function placeSprites(): void {
    for (const d of dots) {
      const s = d.p.s;
      if (view === 'drift') {
        d.sprite.position.set(Math.hypot(s[0], s[2]), s[1], 0.02);
      } else d.sprite.position.set(s[0], s[1], s[2]);
    }
  }

  function stepParticles(): void {
    let budget = STEP_BUDGET;
    const useE = eOn && tk.iota === 0;
    if (useE) {
      let yi = 0, ye = 0;
      for (const d of dots) {
        if (d.ion) yi += d.p.s[1];
        else ye += d.p.s[1];
      }
      Ey = P.polarisationField(K_POL, yi / NI, ye / NE);
    } else Ey = 0;
    for (const d of dots) {
      if (d.lost) continue;
      const p = d.p;
      const s = p.s;
      const lead = d.ion && d.idx === 0;
      const t3 = d.ion ? tr3I : tr3E;
      const tp = d.ion ? trPI : trPE;
      while (p.t < simT && budget > 0) {
        P.borisStep(p, tk, Ey, d.dt);
        budget--;
        if (lead) {
          St += p.t; Sy += s[1]; Stt += p.t * p.t; Sty += p.t * s[1]; Sn++;
          const f = Math.atan2(s[2], s[0]);
          let df = f - leadPrev;
          if (df > Math.PI) df -= 2 * Math.PI;
          if (df < -Math.PI) df += 2 * Math.PI;
          leadPhi += df;
          leadPrev = f;
        }
        const dx = s[0] - d.lx, dy = s[1] - d.ly, dz = s[2] - d.lz;
        if (dx * dx + dy * dy + dz * dz > SEG2) {
          t3.push(d.idx, d.lx, d.ly, d.lz, s[0], s[1], s[2], realT);
          tp.push(d.idx, Math.hypot(d.lx, d.lz), d.ly, 0, Math.hypot(s[0], s[2]), s[1], 0, realT);
          d.lx = s[0]; d.ly = s[1]; d.lz = s[2];
        }
        if (P.minorRadius(tk, s[0], s[1], s[2]) > WALL) {
          d.lost = true;
          lostCount++;
          (d.sprite.material as THREE.SpriteMaterial).color.set(PALETTE.red);
          break;
        }
      }
    }
    if (budget <= 0) {
      let tmin = simT;
      for (const d of dots) if (!d.lost) tmin = Math.min(tmin, d.p.t);
      simT = tmin;
    }
    tr3I.flush(); tr3E.flush(); trPI.flush(); trPE.flush();
  }

  // =============================================================== overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const kinkBox = document.createElement('div');
  Object.assign(kinkBox.style, {
    position: 'absolute', left: '50%', bottom: '12px', transform: 'translateX(-50%)', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.85)', borderRadius: '10px', padding: '6px 12px', maxWidth: '80%', textAlign: 'center',
    font: '12px/1.4 JetBrains Mono, monospace', display: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(kinkBox);

  const inset = document.createElement('canvas');
  inset.width = 560;
  inset.height = 380;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '280px', height: '190px',
    background: 'rgba(7,10,18,0.8)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const swatch = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(c)};margin-right:6px"></i>`;
  function updateLegend(): void {
    let h = `<div style="margin-bottom:5px;color:#dfe6f3">${VIEWS[view].caption}</div>`;
    if (view !== 'stellarator') {
      h += `<div>${swatch(PALETTE.amber)}ions</div><div>${swatch(PALETTE.cyan)}electrons (mass ×${ME_RATIO}, scaled)</div><div>${swatch(PALETTE.red)}lost to the wall</div>`;
      if (view === 'tokamak') h += `<div>${swatch(0x9fd4ff)}field lines (pulses follow B)</div>`;
    }
    legend.innerHTML = h;
  }

  let kinkWarn = false;
  function updateKink(): void {
    kinkWarn = qEdge < 2;
    if (!kinkWarn || view === 'stellarator') {
      kinkBox.style.display = 'none';
    } else {
      kinkBox.style.display = 'block';
      if (qEdge <= 1) {
        kinkBox.style.color = css(PALETTE.red);
        kinkBox.style.border = `1px solid ${css(PALETTE.red)}`;
        kinkBox.textContent = `Edge q = ${qEdge.toFixed(2)} < 1: the whole column is kink unstable (Kruskal-Shafranov). A real plasma would disrupt.`;
      } else {
        kinkBox.style.color = css(PALETTE.amber);
        kinkBox.style.border = `1px solid ${css(PALETTE.amber)}`;
        kinkBox.textContent = `Edge q = ${qEdge.toFixed(2)}: below about 2, instabilities and disruptions become likely. At q < 1 the kink is unstable.`;
      }
    }
    const bad = qEdge <= 1;
    surfMats[2].color.set(bad ? PALETTE.red : 0x6fb8ff);
    surfMats[2].opacity = bad ? 0.16 : 0.11;
  }

  // --- Lawson inset
  const IX0 = 70, IX1 = 545, IY0 = 328, IY1 = 50;
  const TMIN = 0.2, TMAX = 100, NMIN = 1e16, NMAX = 1e22;
  const xOf = (T: number) => IX0 + ((Math.log10(T) - Math.log10(TMIN)) / (Math.log10(TMAX) - Math.log10(TMIN))) * (IX1 - IX0);
  const yOf = (nt: number) => IY0 - ((Math.log10(nt) - Math.log10(NMIN)) / (Math.log10(NMAX) - Math.log10(NMIN))) * (IY0 - IY1);
  const nTau = () => nDens * 1e20 * Math.pow(10, tauExp);

  function curve(fn: (T: number) => number, color: string, dash: number[]): void {
    ictx.strokeStyle = color;
    ictx.setLineDash(dash);
    ictx.lineWidth = 3;
    ictx.beginPath();
    let started = false;
    for (let i = 0; i <= 200; i++) {
      const T = TMIN * Math.pow(TMAX / TMIN, i / 200);
      const v = fn(T);
      if (v > NMAX * 3) { started = false; continue; }
      const x = xOf(T), y = Math.max(IY1 - 10, yOf(v));
      if (!started) { ictx.moveTo(x, y); started = true; } else ictx.lineTo(x, y);
    }
    ictx.stroke();
    ictx.setLineDash([]);
  }

  function drawInset(): void {
    const W = inset.width, H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.save();
    ictx.beginPath();
    ictx.rect(0, 0, W, H);
    ictx.clip();
    ictx.font = '24px JetBrains Mono, monospace';
    ictx.fillStyle = '#b8c3d9';
    ictx.fillText('Lawson: nτ_E (m⁻³s) vs T', 16, 32);
    // grid
    ictx.strokeStyle = '#1c2436';
    ictx.lineWidth = 1;
    ictx.font = '19px JetBrains Mono, monospace';
    for (let e = 16; e <= 22; e += 2) {
      const y = yOf(Math.pow(10, e));
      ictx.beginPath(); ictx.moveTo(IX0, y); ictx.lineTo(IX1, y); ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(`1e${e}`, 14, y + 6);
    }
    for (const T of [1, 10, 100]) {
      const x = xOf(T);
      ictx.beginPath(); ictx.moveTo(x, IY0); ictx.lineTo(x, IY1); ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(`${T} keV`, x - 26, IY0 + 22);
    }
    ictx.save();
    ictx.beginPath();
    ictx.rect(IX0, IY1 - 12, IX1 - IX0, IY0 - IY1 + 12);
    ictx.clip();
    curve((T) => P.nTauForQ(1, T), css(PALETTE.amber), [8, 6]);
    curve((T) => P.ignitionNTau(T), css(PALETTE.rose), []);
    // historic markers
    ictx.font = '19px JetBrains Mono, monospace';
    for (const m of MARKERS) {
      const x = xOf(m.T), y = yOf(m.nTau);
      ictx.fillStyle = '#b8c3d9';
      ictx.beginPath(); ictx.arc(x, y, 5, 0, 2 * Math.PI); ictx.fill();
      ictx.fillStyle = '#8391ab';
      ictx.fillText(m.label, x + m.dx, y + m.dy);
    }
    // user point
    const ux = xOf(Tkev), uy = yOf(Math.min(NMAX, Math.max(NMIN, nTau())));
    ictx.fillStyle = css(PALETTE.green);
    ictx.shadowColor = css(PALETTE.green);
    ictx.shadowBlur = 12;
    ictx.beginPath(); ictx.arc(ux, uy, 9, 0, 2 * Math.PI); ictx.fill();
    ictx.shadowBlur = 0;
    ictx.restore();
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = css(PALETTE.rose);
    ictx.fillText('ignition', IX1 - 170, 76);
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('Q = 1', IX1 - 66, 76);
    ictx.restore();
  }

  // =============================================================== views
  function setView(v: View, fly = true): void {
    view = v;
    tokGroup.visible = v === 'tokamak';
    driftGroup.visible = v === 'drift';
    stelGroup.visible = v === 'stellarator';
    partGroup.visible = v !== 'stellarator';
    trail3D.visible = v === 'tokamak';
    // The drift view still shows the vessel for context, without field lines and labels.
    applySpecies();
    placeSprites();
    updateLegend();
    updateKink();
    if (fly) stage.flyTo(VIEWS[v].cam, VIEWS[v].target, 1.2);
  }

  function applySpecies(): void {
    const showI = species !== 'electrons';
    const showE = species !== 'ions';
    tr3I.mesh.visible = trPI.mesh.visible = showI;
    tr3E.mesh.visible = trPE.mesh.visible = showE;
    for (const d of dots) d.sprite.visible = d.ion ? showI : showE;
  }

  // =============================================================== frame loop
  let insetDirty = true;
  stage.onFrame((dt, t) => {
    realT = t;
    flMat.uniforms.time.value = t;
    tr3I.now = tr3E.now = trPI.now = trPE.now = t;
    if (playing && view !== 'stellarator') {
      simT += dt * RATE * simSpeed;
      stepParticles();
      placeSprites();
    }
    const showE = view === 'drift' && tk.iota === 0;
    dLab.exb.visible = showE && eOn;
    dLab.up.element.textContent = tk.iota === 0 ? 'ions drift up ↑' : 'twist: up and down drifts cancel';
    dLab.down.element.textContent = tk.iota === 0 ? 'electrons drift down ↓' : 'orbits stay near their surface';
    if (insetDirty) {
      drawInset();
      insetDirty = false;
    }
    updateReadouts();
  });

  // =============================================================== controls
  const ui = new Panel(panel);
  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'tokamak', label: 'Tokamak' }, { value: 'drift', label: 'Drift demo' }, { value: 'stellarator', label: 'Stellarator' }],
    onChange: (v) => setView(v),
  });
  ui.select<Species>({
    key: 'species', label: 'Particle species', value: species,
    options: [{ value: 'both', label: 'Both' }, { value: 'ions', label: 'Ions' }, { value: 'electrons', label: 'Electrons' }],
    onChange: (v) => { species = v; applySpecies(); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Relaunch', key: 'relaunch', onClick: () => { touched = true; relaunch(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 3, step: 0.05, value: simSpeed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (simSpeed = v) });

  ui.section('Magnets (relaunch particles)');
  ui.slider({ key: 'B', label: 'Toroidal field B at R₀', min: 1, max: 8, step: 0.1, value: Btor, unit: 'T', onInput: (v) => { Btor = v; touched = true; applyField(); relaunch(); } });
  ui.slider({ key: 'Ip', label: 'Plasma current I_p', min: 0, max: 8, step: 0.1, value: Ip, unit: 'MA', onInput: (v) => { Ip = v; touched = true; applyField(); relaunch(); } });
  ui.toggle({ key: 'Esep', label: 'Charge-separation E field (no current only)', value: eOn, onChange: (v) => { eOn = v; touched = true; } });

  ui.section('Lawson inset');
  ui.slider({ key: 'T', label: 'Temperature T', min: 1, max: 60, step: 0.5, value: Tkev, unit: 'keV', onInput: (v) => { Tkev = v; insetDirty = true; } });
  ui.slider({ key: 'n', label: 'Density n', min: 0.1, max: 3, step: 0.05, value: nDens, format: (v) => `${v.toFixed(2)}×10²⁰`, unit: 'm⁻³', onInput: (v) => { nDens = v; insetDirty = true; } });
  ui.slider({ key: 'tau', label: 'Confinement time τ_E', min: -2, max: 1, step: 0.02, value: tauExp, format: (v) => { const x = Math.pow(10, v); return x < 1 ? x.toFixed(2) : x.toFixed(1); }, unit: 's', onInput: (v) => { tauExp = v; insetDirty = true; } });

  ui.section('Confinement readouts');
  const rQa = ui.readout('qEdge', 'edge q (formula)');
  const rQt = ui.readout('qTraced', 'edge q (traced line)');
  const rConf = ui.readout('confined', 'confined');
  const rTr = ui.readout('transits', 'lead ion transits');
  const rVd = ui.readout('drift', 'drift: sim / formula');
  const rE = ui.readout('Ey', 'separation E');
  const rV = ui.readout('vdrift', 'Boris |v| error');
  ui.section('Lawson readouts');
  const rTrip = ui.readout('triple', 'n T τ_E', 'keV s/m³');
  const rF = ui.readout('f', 'fraction of ignition');
  const rQ = ui.readout('Q', 'fusion gain Q');
  const rLd = ui.readout('debye', 'Debye length', 'µm');
  const rFp = ui.readout('fpe', 'plasma frequency', 'GHz');
  ui.legend([
    { color: css(PALETTE.rose), label: 'ignition (Q = ∞)' },
    { color: css(PALETTE.amber), label: 'breakeven (Q = 1)' },
    { color: css(PALETTE.green), label: 'your plasma' },
  ]);

  const fmtQ = (q: number) => (Number.isFinite(q) ? q.toFixed(2) : '∞ (no twist)');

  function lawson() {
    const nt = nTau();
    const f = nt / P.ignitionNTau(Tkev);
    return { nt, f, Q: P.gainQ(nt, Tkev), triple: nt * Tkev };
  }

  function driftSim(): number {
    if (Sn < 10) return 0;
    return (Sn * Sty - St * Sy) / (Sn * Stt - St * St);
  }

  function updateReadouts(): void {
    rQa(fmtQ(qEdge));
    rQt(fmtQ(qTraced));
    rConf(`${NP - lostCount} / ${NP}`);
    rTr((Math.abs(leadPhi) / (2 * Math.PI)).toFixed(1) + (dots[0].lost ? ' (lost)' : ''));
    if (tk.iota === 0) rVd(`${(driftSim() * 1e3).toFixed(2)} / ${(vdPred * 1e3).toFixed(2)} ×10⁻³`);
    else rVd('twist: averages out');
    rE(Ey === 0 ? '0' : Ey.toExponential(1));
    const lp = dots[0].p.s;
    rV(Ey === 0 ? (Math.abs(Math.hypot(lp[3], lp[4], lp[5]) / leadV0 - 1)).toExponential(0) : 'E on: not conserved');
    const L = lawson();
    rTrip(L.triple.toExponential(2));
    rF(L.f.toFixed(2));
    rQ(Number.isFinite(L.Q) ? L.Q.toFixed(2) : 'ignited');
    rLd((P.debyeLength(nDens * 1e20, Tkev * 1e3) * 1e6).toFixed(0));
    rFp((P.plasmaOmega(nDens * 1e20) / (2 * Math.PI) / 1e9).toFixed(0));
  }

  applyField();
  relaunch();
  setView('tokamak', false);

  return {
    state: () => {
      const L = lawson();
      return {
        view,
        species,
        touched,
        B: Btor,
        Ip,
        qEdge: Number.isFinite(qEdge) ? qEdge : 1e9,
        qTraced: Number.isFinite(qTraced) ? qTraced : 1e9,
        kinkWarn,
        lost: lostCount,
        lostFrac: lostCount / NP,
        confinedFrac: 1 - lostCount / NP,
        transits: Math.abs(leadPhi) / (2 * Math.PI),
        leadLost: dots[0].lost,
        driftSim: driftSim(),
        driftFormula: vdPred,
        Ey,
        T: Tkev,
        n: nDens * 1e20,
        tau: Math.pow(10, tauExp),
        triple: L.triple,
        f: L.f,
        Q: Number.isFinite(L.Q) ? L.Q : 1e9,
      };
    },
    dispose: () => {
      legend.remove();
      kinkBox.remove();
      inset.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'plasma-confinement',
  number: 98,
  title: 'Plasma & Fusion Confinement',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'Holding a 150 million degree gas with magnetic fields.',
  content,
  mount,
};

export default topic;
