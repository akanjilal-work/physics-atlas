import * as THREE from 'three';
import { createStage, makeArrow, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  BounceCounter,
  dipoleDriftPeriod,
  dipoleField,
  fixedDt,
  GyroMeter,
  launch,
  magneticMoment,
  makeParticle,
  mirrorField,
  stepFixed,
  traceFieldLine,
  uniformField,
  vParallel,
  type DipoleField,
  type FieldModel,
  type MirrorField,
  type Particle,
} from './physics.ts';

type View = 'uniform' | 'crossed' | 'mirror' | 'dipole';

const DEG = Math.PI / 180;
const MAX_N = 12;
const CAP = 5000; // trail segments per particle
const MIRROR_D = 10; // coil half-separation, sim units
const DIPOLE_RE = 10; // planet radius, sim units
const DIPOLE_L = 3; // launch shell
const STEP_BUDGET = 60000; // integrator steps per frame, all particles

const VIEW_INFO: Record<View, { label: string; cam: [number, number, number]; target: [number, number, number]; caption: string; fade: number; base: number }> = {
  uniform: {
    label: 'Uniform B', cam: [-3, 4.2, 13], target: [0, 0, 0], fade: 6, base: 0.04,
    caption: 'Uniform B: every particle spirals along the field. Speed along B is untouched.',
  },
  crossed: {
    label: 'Crossed E, B', cam: [2.5, 2.5, 16], target: [0, 0, 0], fade: 7, base: 0.04,
    caption: 'E up, B out of the screen: every orbit drifts sideways at E/B, whatever its charge or mass.',
  },
  mirror: {
    label: 'Mirror', cam: [-3.5, 5, 14.5], target: [0, 0, 0], fade: 6, base: 0.03,
    caption: 'Magnetic mirror: the field squeezes near each coil. Steep spirals bounce back. Shallow ones escape.',
  },
  dipole: {
    label: 'Earth dipole', cam: [5.2, 3.4, 8.4], target: [0, 0, 0], fade: 10, base: 0.015,
    caption: 'Earth dipole, scaled units: gyrate, bounce pole to pole, drift around the planet.',
  },
};

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

/** Fading trails for all particles in one draw call. Old segments fade by age in the shader. */
class SegTrails {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private birth: Float32Array;
  private head = new Int32Array(MAX_N);
  private lo = new Int32Array(MAX_N);
  private hi = new Int32Array(MAX_N);
  private mat: THREE.ShaderMaterial;

  constructor() {
    const nv = MAX_N * CAP * 2;
    this.pos = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3);
    this.birth = new Float32Array(nv).fill(-1e9);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tcol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('birth', new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { now: { value: 0 }, fade: { value: 6 } },
      vertexShader: `attribute vec3 tcol; attribute float birth; uniform float now; uniform float fade;
        varying vec3 vC; varying float vA;
        void main() { vA = clamp(1.0 - (now - birth) / fade, 0.0, 1.0); vC = tcol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main() { if (vA <= 0.0) discard; gl_FragColor = vec4(vC * vA, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.lo.fill(-1);
  }

  set now(t: number) { this.mat.uniforms.now.value = t; }
  set fade(f: number) { this.mat.uniforms.fade.value = f; }
  setCount(n: number): void { this.mesh.geometry.setDrawRange(0, n * CAP * 2); }

  push(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: THREE.Color, t: number): void {
    const slot = this.head[i];
    this.head[i] = (slot + 1) % CAP;
    const v = (i * CAP + slot) * 2;
    const p = v * 3;
    this.pos[p] = ax; this.pos[p + 1] = ay; this.pos[p + 2] = az;
    this.pos[p + 3] = bx; this.pos[p + 4] = by; this.pos[p + 5] = bz;
    this.col[p] = this.col[p + 3] = c.r;
    this.col[p + 1] = this.col[p + 4] = c.g;
    this.col[p + 2] = this.col[p + 5] = c.b;
    this.birth[v] = this.birth[v + 1] = t;
    if (this.lo[i] < 0) { this.lo[i] = slot; this.hi[i] = slot; }
    else if (slot < this.lo[i]) { this.lo[i] = 0; this.hi[i] = CAP - 1; } // wrapped this frame
    else this.hi[i] = slot;
  }

  clearAll(): void {
    this.birth.fill(-1e9);
    this.head.fill(0);
    this.lo.fill(-1);
    const g = this.mesh.geometry;
    for (const name of ['position', 'tcol', 'birth']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.needsUpdate = true;
    }
  }

  flush(): void {
    const g = this.mesh.geometry;
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const ca = g.getAttribute('tcol') as THREE.BufferAttribute;
    const ba = g.getAttribute('birth') as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < MAX_N; i++) {
      if (this.lo[i] < 0) continue;
      if (!any) { pa.clearUpdateRanges(); ca.clearUpdateRanges(); ba.clearUpdateRanges(); any = true; }
      const v0 = (i * CAP + this.lo[i]) * 2;
      const nv = (this.hi[i] - this.lo[i] + 1) * 2;
      pa.addUpdateRange(v0 * 3, nv * 3);
      ca.addUpdateRange(v0 * 3, nv * 3);
      ba.addUpdateRange(v0, nv);
      this.lo[i] = -1;
    }
    if (any) { pa.needsUpdate = true; ca.needsUpdate = true; ba.needsUpdate = true; }
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}

interface Dot {
  p: Particle;
  dt: number;
  pitch: number;
  lost: boolean;
  lostCone: boolean;
  frozen: boolean;
  w0: number;
  key: number;
  has: boolean;
  lx: number; ly: number; lz: number;
  color: THREE.Color;
  holder: THREE.Object3D;
  glow: THREE.Sprite;
  core: THREE.Sprite;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: VIEW_INFO.uniform.cam, target: [0, 0, 0], fov: 45, far: 400 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'uniform';
  let charge = 1;
  let mass = 1;
  let speed = 1;
  let pitchDeg = 60;
  let Bs = 1;
  let Es = 0.5;
  let ratio = 4;
  let n = 6;
  let stepsPerTurn = 32;
  let simSpeed = 1;
  let playing = true;

  // --- Scene furniture (rebuilt per view)
  let furniture = new THREE.Group();
  scene.add(furniture);
  let furnitureLabels: THREE.Object3D[] = [];
  let auroraN: THREE.Mesh[] = [];
  let auroraS: THREE.Mesh[] = [];
  let glowN = 0;
  let glowS = 0;

  const trails = new SegTrails();
  scene.add(trails.mesh);

  const glowTex = glowTexture();
  const dots: Dot[] = [];
  for (let i = 0; i < MAX_N; i++) {
    const holder = new THREE.Object3D();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    holder.add(glow, core);
    scene.add(holder);
    dots.push({
      p: makeParticle(1), dt: 0.01, pitch: 0, lost: false, lostCone: false, frozen: false, w0: 1, key: 0, has: false,
      lx: 0, ly: 0, lz: 0, color: new THREE.Color(), holder, glow, core,
    });
  }

  // --- Overlays: legend (top-left) and inset (top-right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 260;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '130px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const SAMPLES = 320;
  const sampA = new Float32Array(SAMPLES);
  const sampB = new Float32Array(SAMPLES);
  let sampHead = 0;
  let sampCount = 0;
  let sampEvery = 1;
  let sampTick = 0;

  // --- Simulation state
  let field: FieldModel = uniformField(1);
  let mirror: MirrorField | null = null;
  let dipole: DipoleField | null = null;
  let S = 1; // world units per sim unit
  let rScale = 1;
  let Zw = 7;
  let Xw = 8;
  let rate = 1; // sim time per real second at speed 1
  let simT = 0;
  let trailClock = 0;
  let vD = 0;
  let lossCone = NaN;
  let Bfoot = 1;
  const meter = new GyroMeter();
  const bounce = new BounceCounter(0.1);
  let mu0 = 1;
  let muNow = 1;
  let phiUnwrap = 0;
  let phiPrev = 0;
  let eDrift = 0;
  let gyroRes = 1;
  let vParRes = 1;
  let leadVpar = 0;
  let furnitureKey = '';

  const qm = () => charge / mass;
  const Tg = () => (2 * Math.PI) / (Math.abs(qm()) * Bs);
  const count = () => n;

  function disposeFurniture(): void {
    for (const l of furnitureLabels) {
      (l as unknown as { element: HTMLElement }).element.remove();
      l.parent?.remove(l);
    }
    furnitureLabels = [];
    furniture.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    scene.remove(furniture);
    furniture = new THREE.Group();
    scene.add(furniture);
    auroraN = [];
    auroraS = [];
  }

  const label = (text: string, at: [number, number, number], cls = 'muted') => {
    const l = stage.label(text, at, cls, furniture);
    furnitureLabels.push(l);
    return l;
  };

  function linesFrom(segs: number[], color: number, opacity: number): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    furniture.add(l);
    return l;
  }

  /** Append a polyline (flat xyz) as segments. */
  const addPolyline = (out: number[], pts: number[]) => {
    for (let i = 0; i + 5 < pts.length; i += 3) out.push(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]);
  };

  const FIELD_COL = 0x5a86c8;

  function buildFurniture(): void {
    disposeFurniture();
    if (view === 'uniform') {
      const segs: number[] = [];
      for (let a = -4; a <= 4; a += 2) for (let b = -4; b <= 4; b += 2) segs.push(-7.5, a, b, 7.5, a, b);
      linesFrom(segs, FIELD_COL, 0.2);
      furniture.add(makeArrow(new THREE.Vector3(1, 0, 0), 2.4, PALETTE.cyan, new THREE.Vector3(2.2, -4.3, 2)));
      label('B', [3.4, -3.8, 2], 'big');
    } else if (view === 'crossed') {
      const segs: number[] = [];
      for (let x = -8; x <= 8; x += 2) for (let y = -4; y <= 4; y += 2) segs.push(x, y, -4, x, y, 4);
      linesFrom(segs, FIELD_COL, 0.22);
      for (const x of [-8.6, 8.6]) furniture.add(makeArrow(new THREE.Vector3(0, 1, 0), 3.2, PALETTE.rose, new THREE.Vector3(x, -1.6, 0)));
      furniture.add(makeArrow(new THREE.Vector3(0, 0, 1), 2.4, PALETTE.cyan, new THREE.Vector3(7, -4.6, -1)));
      furniture.add(makeArrow(new THREE.Vector3(1, 0, 0), 3.2, PALETTE.green, new THREE.Vector3(-1.6, 5.4, 0)));
      label('E', [-8.6, 2.1, 0], 'big');
      label('B (toward you)', [7, -5.1, 1.6]);
      label('E×B drift', [0, 6.1, 0]);
    } else if (view === 'mirror' && mirror) {
      const m = mirror;
      const segs: number[] = [];
      const stop = (x: number, y: number, z: number) => Math.abs(z) > 1.7 * m.d || Math.hypot(x, y) > 1.6 * m.a;
      for (const fr of [0.12, 0.28, 0.44, 0.6, 0.76]) {
        const pts = traceFieldLine(m, [fr * m.a, 0, 0], 0.15, 800, stop);
        for (let k = 0; k < 6; k++) {
          const ph = (k * Math.PI) / 3;
          const c = Math.cos(ph);
          const sn = Math.sin(ph);
          const w: number[] = [];
          for (let i = 0; i < pts.length; i += 3) {
            const x = pts[i] * c - pts[i + 1] * sn;
            const y = pts[i] * sn + pts[i + 1] * c;
            w.push(S * pts[i + 2], S * y, -S * x);
          }
          addPolyline(segs, w);
        }
      }
      linesFrom(segs, FIELD_COL, 0.35);
      const coilMat = new THREE.MeshStandardMaterial({ color: 0xc87533, emissive: 0x3a1c08, metalness: 0.6, roughness: 0.35 });
      for (const z of [-m.d, m.d]) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(m.a * S, 0.09, 12, 72), coilMat);
        coil.rotation.y = Math.PI / 2;
        coil.position.x = z * S;
        furniture.add(coil);
      }
      // Loss cone drawn as velocity directions from the centre: a cone each way along B.
      const h = 1.6;
      const rad = h * Math.tan(m.lossCone);
      const coneMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      for (const sgn of [1, -1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 40, 1, true), coneMat);
        cone.rotation.z = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
        cone.position.x = (sgn * h) / 2;
        furniture.add(cone);
      }
      label(`coil: B_max = ${m.ratio.toFixed(1)} B_min`, [m.d * S, -m.a * S - 0.55, 0]);
      label('coil', [-m.d * S, -m.a * S - 0.55, 0]);
      label('B_min', [0, -m.a * S - 0.55, 0]);
      label('loss cone', [0, -0.95, 0]);
    } else if (view === 'dipole' && dipole) {
      const d = dipole;
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 32),
        new THREE.MeshStandardMaterial({ color: 0x1f4a86, emissive: 0x081a36, roughness: 0.75, metalness: 0.05 }),
      );
      furniture.add(earth);
      const grid: number[] = [];
      for (const lat of [-60, -30, 0, 30, 60]) {
        const pts: number[] = [];
        for (let k = 0; k <= 72; k++) {
          const ph = (k / 72) * 2 * Math.PI;
          const c = Math.cos(lat * DEG) * 1.003;
          pts.push(c * Math.cos(ph), Math.sin(lat * DEG) * 1.003, c * Math.sin(ph));
        }
        addPolyline(grid, pts);
      }
      linesFrom(grid, 0x6f9ad8, 0.25);
      linesFrom([0, -1.6, 0, 0, 1.6, 0], 0x9aa6bd, 0.5);
      label('N', [0, 1.8, 0]);
      label('Earth (scaled)', [0, -1.25, 1.1]);
      // Dipole field lines r = L cos²λ, in world units of planet radii.
      const segsA: number[] = [];
      const segsB: number[] = [];
      for (const L of [2, 3, 4, 5.5]) {
        const lf = Math.acos(Math.sqrt(1 / L));
        for (let k = 0; k < 8; k++) {
          const ph = (k / 8) * 2 * Math.PI + 0.2;
          const pts: number[] = [];
          for (let j = 0; j <= 80; j++) {
            const lam = -lf + (2 * lf * j) / 80;
            const r = L * Math.cos(lam) ** 2;
            pts.push(r * Math.cos(lam) * Math.cos(ph), r * Math.sin(lam), -r * Math.cos(lam) * Math.sin(ph));
          }
          addPolyline(L === DIPOLE_L ? segsA : segsB, pts);
        }
      }
      linesFrom(segsB, FIELD_COL, 0.2);
      linesFrom(segsA, FIELD_COL, 0.42);
      // Aurora rings where the launch shell meets the ground.
      const lam = d.footLat;
      for (const sgn of [1, -1]) {
        const rings: THREE.Mesh[] = [];
        for (const [tube, op] of [[0.022, 0.5], [0.075, 0.18]] as const) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(Math.cos(lam) * 1.01, tube, 10, 96),
            new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
          ring.rotation.x = Math.PI / 2;
          ring.position.y = sgn * Math.sin(lam) * 1.01;
          ring.userData.base = op;
          furniture.add(ring);
          rings.push(ring);
        }
        if (sgn > 0) auroraN = rings;
        else auroraS = rings;
      }
      label('aurora zone', [-Math.cos(lam) - 0.55, Math.sin(lam) + 0.3, 0]);
      label(`L = ${DIPOLE_L} shell`, [0, -0.4, DIPOLE_L + 0.35]);
    }
  }

  function paintLegend(): void {
    const sw = (c: number | string) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${typeof c === 'number' ? css(c) : c}"></i>`;
    const info = VIEW_INFO[view];
    const others = view === 'uniform' || view === 'crossed' ? 'others, pitch 15° to 90°' : 'others, pitch spread';
    let extra = '';
    if (view === 'mirror' || view === 'dipole') extra = `<div>${sw(PALETTE.red)}lost through the loss cone</div>`;
    if (view === 'dipole') extra += `<div>${sw(PALETTE.green)}aurora ring flashes on each loss</div>`;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${info.caption}</div>
<div>${sw(PALETTE.amber)}lead particle (pitch slider)</div>
<div>${sw(PALETTE.cyan)}${others}</div>${extra}
<div>${sw(FIELD_COL)}magnetic field lines</div>`;
  }

  function pitchFor(i: number): number {
    if (i === 0) return pitchDeg * DEG;
    const k = n > 2 ? (i - 1) / (n - 2) : 0.5;
    if (view === 'uniform' || view === 'crossed') return (15 + 75 * k) * DEG;
    const lo = 0.4 * lossCone;
    const hi = 88 * DEG;
    return lo * Math.pow(hi / lo, k);
  }

  function reset(): void {
    const q = qm();
    // Field model and scales
    mirror = null;
    dipole = null;
    vD = 0;
    if (view === 'uniform') {
      field = uniformField(Bs);
      rScale = speed / (Math.abs(q) * Bs);
      S = 1 / rScale;
      Zw = 7.5 * rScale;
      rate = 1.2 * Tg();
      lossCone = NaN;
    } else if (view === 'crossed') {
      field = uniformField(Bs, Es);
      vD = Es / Bs;
      rScale = (speed + vD) / (Math.abs(q) * Bs);
      S = 1 / rScale;
      Xw = 9 * rScale;
      Zw = 4.5 * rScale;
      rate = 0.8 * Tg();
      lossCone = NaN;
    } else if (view === 'mirror') {
      mirror = mirrorField(ratio, MIRROR_D, Bs);
      field = mirror;
      S = 5 / MIRROR_D;
      lossCone = mirror.lossCone;
      rate = Math.min(40 * Tg(), (4 * MIRROR_D) / speed / 2.5);
    } else {
      dipole = dipoleField(DIPOLE_RE, DIPOLE_L, Bs);
      field = dipole;
      S = 1 / DIPOLE_RE;
      lossCone = dipole.lossCone;
      Bfoot = Bs * DIPOLE_L ** 3 * Math.sqrt(4 - 3 / DIPOLE_L);
      rate = Math.min(150 * Tg(), dipoleDriftPeriod(q, Bs, DIPOLE_L * DIPOLE_RE, speed) / 25);
    }
    const key = `${view}|${view === 'mirror' ? ratio.toFixed(2) : ''}`;
    if (key !== furnitureKey) {
      furnitureKey = key;
      buildFurniture();
    }
    // Particles
    const N = count();
    for (let i = 0; i < MAX_N; i++) {
      const d = dots[i];
      d.holder.visible = i < N;
      if (i >= N) continue;
      const p = d.p;
      p.qm = q;
      const pitch = pitchFor(i);
      d.pitch = pitch;
      const phase = i === 0 ? 0 : i * 2.39996;
      let gc: [number, number, number] = [0, 0, 0];
      let e1: [number, number, number] = [1, 0, 0];
      let Btop = Bs;
      if (view === 'uniform' || view === 'crossed') {
        if (i > 0) {
          const a = ((i - 1) / Math.max(1, N - 1)) * 2 * Math.PI + 0.4;
          gc = [3.3 * rScale * Math.cos(a), 3.3 * rScale * Math.sin(a), 0];
        }
      } else if (view === 'mirror' && mirror) {
        if (i > 0) {
          const a = i * 2.39996;
          const rr = mirror.a * (0.1 + 0.18 * ((i * 0.618) % 1));
          gc = [rr * Math.cos(a), rr * Math.sin(a), 0];
        }
        const s2 = Math.sin(pitch) ** 2;
        Btop = Math.min(mirror.Bmax, s2 > 0 ? Bs / s2 : Infinity) * 1.05;
      } else if (dipole) {
        const a = (i / N) * 2 * Math.PI;
        const r0 = DIPOLE_L * DIPOLE_RE;
        gc = [r0 * Math.cos(a), r0 * Math.sin(a), 0];
        e1 = [Math.cos(a), Math.sin(a), 0];
        const s2 = Math.sin(pitch) ** 2;
        Btop = Math.min(Bfoot, s2 > 0 ? Bs / s2 : Infinity) * 1.05;
      }
      launch(p, field, gc, speed, pitch, phase, e1);
      d.dt = fixedDt(q, Btop, stepsPerTurn);
      d.lost = false;
      d.lostCone = false;
      d.frozen = false;
      d.has = false;
      d.w0 = gyroEnergy(p);
      d.color.set(i === 0 ? PALETTE.amber : PALETTE.cyan);
      setDotLook(d, i === 0);
    }
    // Lead measurements
    const lead = dots[0].p;
    meter.reset();
    const vpar0 = vParallel(lead, field);
    bounce.reset(Math.max(0.3 * Math.abs(vpar0), 0.03 * speed));
    mu0 = magneticMoment(lead, field);
    muNow = mu0;
    phiPrev = Math.atan2(lead.s[1], lead.s[0]);
    phiUnwrap = 0;
    simT = 0;
    eDrift = 0;
    glowN = glowS = 0;
    sampHead = sampCount = 0;
    sampEvery = Math.max(1, Math.round(stepsPerTurn / 40));
    sampTick = 0;
    trails.clearAll();
    trails.setCount(N);
    trails.fade = VIEW_INFO[view].fade;
    paintLegend();
    placeDots();
    measureLead();
    updateReadouts();
    drawInset();
  }

  function setDotLook(d: Dot, lead: boolean): void {
    const big = view === 'dipole' ? 0.55 : 1;
    (d.glow.material as THREE.SpriteMaterial).color.copy(d.color);
    d.glow.scale.setScalar((lead ? 0.75 : 0.55) * big);
    d.core.scale.setScalar((lead ? 0.2 : 0.15) * big);
  }

  /** Kinetic energy per unit mass in the frame drifting at E×B (the lab frame when E = 0). */
  function gyroEnergy(p: Particle): number {
    const ux = p.s[3] - vD;
    return ux * ux + p.s[4] * p.s[4] + p.s[5] * p.s[5];
  }

  // Map a sim position to world coordinates. Returns a wrap key; a change means "do not join".
  const W = new THREE.Vector3();
  const wrapc = (x: number, h: number) => x - 2 * h * Math.floor((x + h) / (2 * h));
  function toWorld(s: Float64Array, out: THREE.Vector3): number {
    if (view === 'uniform') {
      out.set(S * wrapc(s[2], Zw), S * s[1], -S * s[0]);
      return Math.floor((s[2] + Zw) / (2 * Zw));
    }
    if (view === 'crossed') {
      out.set(S * wrapc(s[0], Xw), S * s[1], S * wrapc(s[2], Zw));
      return Math.floor((s[0] + Xw) / (2 * Xw)) * 100003 + Math.floor((s[2] + Zw) / (2 * Zw));
    }
    if (view === 'mirror') {
      out.set(S * s[2], S * s[1], -S * s[0]);
      return 0;
    }
    out.set(S * s[0], S * s[2], -S * s[1]);
    return 0;
  }

  function placeDots(): void {
    for (let i = 0; i < count(); i++) {
      toWorld(dots[i].p.s, W);
      dots[i].holder.position.copy(W);
    }
  }

  function markLost(d: Dot, cone: boolean, idx: number): void {
    d.lost = true;
    d.lostCone = cone;
    d.color.set(PALETTE.red);
    setDotLook(d, idx === 0);
  }

  // --- One integrator step for dot i, with loss checks, lead measurements and trail points.
  const red = new THREE.Color(PALETTE.red);
  let spacing = 0.04;
  function stepDot(i: number): void {
    const d = dots[i];
    const p = d.p;
    const s = p.s;
    stepFixed(p, field, d.dt);
    if (view === 'mirror' && mirror) {
      const az = Math.abs(s[2]);
      if (!d.lost && (az > mirror.zMax * 1.02 && s[2] * s[5] > 0)) markLost(d, true, i);
      if (!d.lost && Math.hypot(s[0], s[1]) > 1.5 * mirror.a) markLost(d, false, i);
      if (az > 1.65 * MIRROR_D || Math.hypot(s[0], s[1]) > 2 * mirror.a) d.frozen = true;
    } else if (view === 'dipole') {
      const r = Math.hypot(s[0], s[1], s[2]);
      if (r < DIPOLE_RE) {
        const k = DIPOLE_RE / r;
        s[0] *= k; s[1] *= k; s[2] *= k;
        markLost(d, true, i);
        d.frozen = true;
        if (s[2] > 0) glowN += 1;
        else glowS += 1;
      } else if (r > 6 * DIPOLE_L * DIPOLE_RE) {
        markLost(d, false, i);
        d.frozen = true;
      }
    }
    if (i === 0) leadStep();
    // Trail
    const key = toWorld(s, W);
    if (!d.has || key !== d.key) {
      d.has = true;
      d.key = key;
      d.lx = W.x; d.ly = W.y; d.lz = W.z;
    } else {
      const dx = W.x - d.lx, dy = W.y - d.ly, dz = W.z - d.lz;
      if (dx * dx + dy * dy + dz * dz > spacing * spacing || d.frozen) {
        trails.push(i, d.lx, d.ly, d.lz, W.x, W.y, W.z, d.lost ? red : d.color, trailClock);
        d.lx = W.x; d.ly = W.y; d.lz = W.z;
      }
    }
  }

  function leadStep(): void {
    const p = dots[0].p;
    const s = p.s;
    if (view === 'uniform' || view === 'crossed') {
      const ux = s[3] - vD;
      const uPerp = Math.hypot(ux, s[4]);
      meter.feed(p.t, s[0], s[1], ux, uPerp > 1e-6 * (speed + vD));
      if (++sampTick >= sampEvery) {
        sampTick = 0;
        sampA[sampHead] = view === 'uniform' ? s[0] : s[3];
        sampB[sampHead] = view === 'uniform' ? s[1] : s[4];
        sampHead = (sampHead + 1) % SAMPLES;
        if (sampCount < SAMPLES) sampCount++;
      }
    } else if (!dots[0].lost) {
      bounce.feed(vParallel(p, field));
      if (view === 'dipole') {
        const ph = Math.atan2(s[1], s[0]);
        let dp = ph - phiPrev;
        if (dp > Math.PI) dp -= 2 * Math.PI;
        if (dp < -Math.PI) dp += 2 * Math.PI;
        phiUnwrap += dp;
        phiPrev = ph;
      }
    }
  }

  function measureLead(): void {
    const p = dots[0].p;
    const s = p.s;
    leadVpar = view === 'uniform' || view === 'crossed' ? s[5] : vParallel(p, field);
    if (view === 'crossed') {
      gyroRes = vD > 0 ? Math.hypot(s[3] - vD, s[4]) / vD : Infinity;
      vParRes = vD > 0 ? Math.abs(s[5]) / vD : Infinity;
    }
    if (view === 'mirror' || view === 'dipole') muNow = dots[0].lost ? muNow : magneticMoment(p, field);
    let worst = 0;
    for (let i = 0; i < count(); i++) {
      const d = dots[i];
      if (d.frozen) continue;
      const e = gyroEnergy(d.p);
      worst = Math.max(worst, Math.abs(e / d.w0 - 1));
    }
    eDrift = worst;
  }

  function advance(simDt: number): void {
    simT += simDt;
    const N = count();
    let budget = STEP_BUDGET;
    for (let i = 0; i < N; i++) {
      const d = dots[i];
      if (d.frozen) continue;
      while (d.p.t < simT && budget > 0 && !d.frozen) {
        stepDot(i);
        budget--;
      }
    }
    if (budget <= 0) {
      // Out of budget: hold the clock at the slowest particle so nobody falls behind for good.
      let tmin = simT;
      for (let i = 0; i < N; i++) if (!dots[i].frozen) tmin = Math.min(tmin, dots[i].p.t);
      simT = tmin;
    }
  }

  // --- Inset
  function drawInset(): void {
    const Wc = inset.width;
    const Hc = inset.height;
    ictx.clearRect(0, 0, Wc, Hc);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    const q = qm();
    if (view === 'uniform' || view === 'crossed') {
      const uniform = view === 'uniform';
      ictx.fillText(uniform ? 'lead orbit, looking along B' : 'lead velocity (vx, vy)', 16, 32);
      const cx = Wc / 2 - 40;
      const cy = Hc / 2 + 18;
      const lead = dots[0];
      let rad: number;
      let ox = 0;
      let oy = 0;
      let unit: number;
      if (uniform) {
        rad = (speed * Math.sin(lead.pitch)) / (Math.abs(q) * Bs);
        unit = 82 / Math.max(1e-9, speed / (Math.abs(q) * Bs));
      } else {
        rad = Math.abs(speed * Math.sin(lead.pitch) - vD);
        unit = 82 / Math.max(1e-9, speed + vD);
        ox = vD;
      }
      // axes
      ictx.strokeStyle = '#243049';
      ictx.lineWidth = 1;
      ictx.beginPath();
      ictx.moveTo(cx - 100, cy); ictx.lineTo(cx + 100, cy);
      ictx.moveTo(cx, cy - 95); ictx.lineTo(cx, cy + 95);
      ictx.stroke();
      // predicted circle (dashed)
      ictx.setLineDash([8, 8]);
      ictx.strokeStyle = '#8391ab';
      ictx.lineWidth = 2;
      ictx.beginPath();
      ictx.arc(cx + ox * unit, cy - oy * unit, Math.max(0.5, rad * unit), 0, 2 * Math.PI);
      ictx.stroke();
      ictx.setLineDash([]);
      // measured samples
      if (sampCount > 1) {
        ictx.strokeStyle = css(PALETTE.amber);
        ictx.lineWidth = 3;
        ictx.beginPath();
        const first = (sampHead - sampCount + SAMPLES) % SAMPLES;
        for (let k = 0; k < sampCount; k++) {
          const j = (first + k) % SAMPLES;
          const x = cx + sampA[j] * unit;
          const y = cy - sampB[j] * unit;
          if (k === 0) ictx.moveTo(x, y);
          else ictx.lineTo(x, y);
        }
        ictx.stroke();
      }
      ictx.fillStyle = '#b8c3d9';
      const tx = Wc - 170;
      if (uniform) {
        ictx.fillText('dashed:', tx, 110);
        ictx.fillText('r = mv⊥/qB', tx, 140);
        ictx.fillText(`amber:`, tx, 180);
        ictx.fillText('measured', tx, 210);
      } else {
        ictx.fillStyle = css(PALETTE.green);
        ictx.beginPath();
        ictx.arc(cx + vD * unit, cy, 6, 0, 2 * Math.PI);
        ictx.fill();
        ictx.fillStyle = '#b8c3d9';
        ictx.fillText('green dot:', tx, 110);
        ictx.fillText('v = E/B', tx, 140);
        ictx.fillText('circle is', tx, 180);
        ictx.fillText('centred there', tx, 210);
      }
      return;
    }
    // Velocity-space loss-cone diagram
    ictx.fillText('launch pitch vs loss cone', 16, 32);
    const cx = Wc / 2;
    const cy = Hc - 26;
    const R = 170;
    ictx.fillStyle = 'rgba(255,107,107,0.22)';
    // Canvas angles run clockwise, so the upper half-plane is [π, 2π].
    for (const [a0, a1] of [[2 * Math.PI - lossCone, 2 * Math.PI], [Math.PI, Math.PI + lossCone]]) {
      ictx.beginPath();
      ictx.moveTo(cx, cy);
      ictx.arc(cx, cy, R, a0, a1);
      ictx.closePath();
      ictx.fill();
    }
    ictx.strokeStyle = '#3a4a6a';
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.arc(cx, cy, R, Math.PI, 2 * Math.PI);
    ictx.moveTo(cx - R - 10, cy);
    ictx.lineTo(cx + R + 10, cy);
    ictx.stroke();
    ictx.fillStyle = '#56627c';
    ictx.fillText('v∥', cx + R - 30, cy - 8);
    ictx.fillText('v⊥', cx + 8, cy - R + 26);
    for (let i = count() - 1; i >= 0; i--) {
      const d = dots[i];
      const a = d.pitch;
      const x = cx + R * Math.cos(a);
      const y = cy - R * Math.sin(a);
      ictx.fillStyle = css(d.lost ? PALETTE.red : i === 0 ? PALETTE.amber : PALETTE.cyan);
      ictx.beginPath();
      ictx.arc(x, y, i === 0 ? 9 : 6, 0, 2 * Math.PI);
      ictx.fill();
    }
    ictx.fillStyle = '#b8c3d9';
    ictx.fillText(`α_loss = ${(lossCone / DEG).toFixed(1)}°`, 16, 64);
  }

  function setRing(rings: THREE.Mesh[], g: number): void {
    for (const r of rings) {
      const m = r.material as THREE.MeshBasicMaterial;
      m.opacity = Math.min(1, (r.userData.base as number) * (1 + 3 * g));
    }
  }

  // --- Frame loop
  let uiTimer = 0;
  let insetTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      trailClock += dt;
      trails.now = trailClock;
      const info = VIEW_INFO[view];
      const vWorld = (speed + vD) * rate * S * simSpeed;
      spacing = Math.max(info.base, (vWorld * info.fade) / (0.9 * CAP));
      advance(dt * simSpeed * rate);
      trails.flush();
      placeDots();
      const k = Math.exp(-dt / 2.5);
      glowN *= k;
      glowS *= k;
    }
    if (view === 'dipole') {
      setRing(auroraN, glowN);
      setRing(auroraS, glowS);
    }
    uiTimer += dt;
    insetTimer += dt;
    if (uiTimer > 0.15) {
      uiTimer = 0;
      measureLead();
      updateReadouts();
    }
    if (insetTimer > 0.2) {
      insetTimer = 0;
      drawInset();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'simSpeed', label: 'Sim speed', min: 0.1, max: 4, step: 0.05, value: simSpeed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (simSpeed = v) });
  ui.select<View>({
    key: 'view', label: 'Field', value: view,
    options: (Object.keys(VIEW_INFO) as View[]).map((v) => ({ value: v, label: VIEW_INFO[v].label })),
    onChange: (v) => {
      view = v;
      reset();
      stage.flyTo(VIEW_INFO[v].cam, VIEW_INFO[v].target, 1.1);
    },
  });

  ui.section('Particles (resets)');
  ui.select<'+' | '-'>({
    key: 'charge', label: 'Charge sign', value: '+',
    options: [{ value: '+', label: 'Positive (ion)' }, { value: '-', label: 'Negative (electron-like)' }],
    onChange: (v) => { charge = v === '+' ? 1 : -1; reset(); },
  });
  ui.slider({ key: 'mass', label: 'Mass m', min: 0.2, max: 5, step: 0.05, value: mass, onInput: (v) => { mass = v; reset(); } });
  ui.slider({ key: 'speed', label: 'Speed v', min: 0.1, max: 3, step: 0.01, value: speed, onInput: (v) => { speed = v; reset(); } });
  ui.slider({ key: 'pitch', label: 'Pitch angle α (lead)', min: 0, max: 90, step: 1, value: pitchDeg, unit: '°', onInput: (v) => { pitchDeg = v; reset(); } });
  ui.slider({ key: 'n', label: 'Number of particles', min: 1, max: MAX_N, step: 1, value: n, onInput: (v) => { n = v; reset(); } });

  ui.section('Fields (resets)');
  ui.slider({ key: 'B', label: 'B strength (at reference point)', min: 0.25, max: 4, step: 0.05, value: Bs, onInput: (v) => { Bs = v; reset(); } });
  ui.slider({ key: 'E', label: 'E strength (crossed view)', min: 0, max: 2, step: 0.01, value: Es, onInput: (v) => { Es = v; reset(); } });
  ui.slider({ key: 'ratio', label: 'Mirror ratio B_max / B_min', min: 1.5, max: 12, step: 0.1, value: ratio, onInput: (v) => { ratio = v; reset(); } });
  ui.slider({ key: 'steps', label: 'Boris steps per gyration', min: 8, max: 128, step: 1, value: stepsPerTurn, onInput: (v) => { stepsPerTurn = v; reset(); } });
  ui.note('Reference point: anywhere for uniform fields, the centre of the mirror, and the equator of the L = 3 shell for the dipole. All units are scaled.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time', 'T_g');
  const rRp = ui.readout('rPred', 'r predicted');
  const rRm = ui.readout('rMeas', 'r measured');
  const rTp = ui.readout('TPred', 'period predicted');
  const rTm = ui.readout('TMeas', 'period measured');
  const rE = ui.readout('eDrift', 'kinetic energy drift');
  const rD = ui.readout('drift', 'drift speed');
  const rLc = ui.readout('lossCone', 'loss-cone angle');
  const rTr = ui.readout('trapped', 'trapped / lost');
  const rB = ui.readout('bounces', 'lead reflections');
  const rMu = ui.readout('mu', 'lead μ / μ₀');

  function rPredVal(): number {
    const lead = dots[0];
    const q = Math.abs(qm());
    if (view === 'crossed') return Math.abs(speed * Math.sin(lead.pitch) - vD) / (q * Bs);
    return (speed * Math.sin(lead.pitch)) / (q * Bs);
  }
  const f3 = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)) : '…');
  const sci = (v: number) => (v < 1e-15 ? '< 1e-15' : v.toExponential(1));
  function counts(): [number, number] {
    let lost = 0;
    for (let i = 0; i < count(); i++) if (dots[i].lost) lost++;
    return [count() - lost, lost];
  }

  function updateReadouts(): void {
    const flat = view === 'uniform' || view === 'crossed';
    rT((simT / Tg()).toFixed(1));
    rRp(f3(rPredVal()));
    rRm(flat ? (meter.cycles > 0 ? f3(meter.radius) : '…') : '–');
    rTp(f3(Tg()));
    rTm(flat ? (meter.cycles > 0 ? f3(meter.period) : '…') : '–');
    rE(`${sci(eDrift)}${view === 'crossed' ? ' (E×B frame)' : ''}`);
    if (view === 'crossed') rD(`${f3(meter.drift)} (E/B ${vD.toFixed(3)})`);
    else if (view === 'uniform') rD(Number.isFinite(meter.drift) ? f3(meter.drift) : '…');
    else if (view === 'dipole') {
      const T = dots[0].p.t;
      const v = T > 0 ? (Math.abs(phiUnwrap) * DIPOLE_L * DIPOLE_RE) / T : 0;
      rD(`${v.toFixed(4)} ${phiUnwrap * charge < 0 ? 'westward' : 'eastward'}`);
    } else rD('–');
    rLc(Number.isFinite(lossCone) ? `${(lossCone / DEG).toFixed(1)}°` : 'none');
    if (flat) rTr('–');
    else {
      const [tr, lo] = counts();
      rTr(`${tr} / ${lo}`);
    }
    rB(flat ? '–' : dots[0].lost ? `${bounce.count} then lost` : String(bounce.count));
    rMu(flat ? '–' : Number.isFinite(muNow / mu0) ? (muNow / mu0).toFixed(3) : '–');
  }

  reset();

  return {
    state: () => {
      const [tr, lo] = counts();
      const rp = rPredVal();
      return {
        view,
        t: simT / Tg(),
        charge,
        mass,
        speed,
        pitch: pitchDeg,
        B: Bs,
        E: Es,
        ratio,
        n,
        steps: stepsPerTurn,
        rPred: rp,
        rMeas: meter.cycles > 0 ? meter.radius : 0,
        rValid: (view === 'uniform' || view === 'crossed') && meter.cycles > 0,
        TPred: Tg(),
        TMeas: meter.cycles > 0 ? meter.period : 0,
        eDrift,
        drift: Number.isFinite(meter.drift) ? meter.drift : 0,
        vD,
        gyroRes: view === 'crossed' ? gyroRes : 1,
        vParRes: view === 'crossed' ? vParRes : 1,
        vPar: leadVpar,
        lossCone: Number.isFinite(lossCone) ? lossCone / DEG : 0,
        trapped: tr,
        lost: lo,
        leadLost: dots[0].lostCone,
        leadBounces: bounce.count,
        mu: mu0 > 0 ? muNow / mu0 : 1,
      };
    },
    dispose: () => {
      for (const l of furnitureLabels) (l as unknown as { element: HTMLElement }).element.remove();
      legend.remove();
      inset.remove();
      trails.dispose();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'magnetic-fields',
  number: 29,
  symbol: 'Mf',
  title: 'Charges in Magnetic Fields',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'Spirals, mirrors and the northern lights.',
  content,
  mount,
};

export default topic;
