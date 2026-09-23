// Three.js boilerplate shared by every topic: renderer, camera, orbit controls,
// CSS2D labels, a frame loop that pauses when hidden, and clean disposal.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export interface StageOptions {
  camera?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
  /** Add default hemisphere + key light. Default true. */
  lights?: boolean;
  /** Use an orthographic camera (for flat diagrams). */
  orthographic?: boolean;
  /** Visible half-height of the orthographic frustum. */
  orthoSize?: number;
}

export type FrameFn = (dt: number, t: number) => void;

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  onFrame(fn: FrameFn): void;
  /** Glide the camera to a new position and target. */
  flyTo(pos: [number, number, number], target?: [number, number, number], seconds?: number): void;
  /** Attach an HTML label to a 3D position (or parent object). */
  label(text: string, at: THREE.Vector3 | [number, number, number], cls?: string, parent?: THREE.Object3D): CSS2DObject;
  dispose(): void;
}

export const PALETTE = {
  bg: 0x070a12,
  grid: 0x1c2436,
  gridMajor: 0x2c3852,
  text: 0xdfe6f3,
  amber: 0xf5b642,
  cyan: 0x4fd1e8,
  violet: 0xa78bfa,
  rose: 0xf472b6,
  green: 0x5ee39a,
  red: 0xff6b6b,
  white: 0xffffff,
};

export function createStage(host: HTMLElement, opts: StageOptions = {}): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.bg);

  const w = Math.max(1, host.clientWidth);
  const h = Math.max(1, host.clientHeight);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  const orthoSize = opts.orthoSize ?? 5;
  if (opts.orthographic) {
    const a = w / h;
    camera = new THREE.OrthographicCamera(-orthoSize * a, orthoSize * a, orthoSize, -orthoSize, 0.01, 1000);
  } else {
    camera = new THREE.PerspectiveCamera(opts.fov ?? 45, w / h, opts.near ?? 0.05, opts.far ?? 500);
  }
  camera.position.set(...(opts.camera ?? [6, 4, 8]));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);
  renderer.domElement.classList.add('stage-canvas');

  const labels = new CSS2DRenderer();
  labels.setSize(w, h);
  labels.domElement.className = 'stage-labels';
  host.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(...(opts.target ?? [0, 0, 0]));
  controls.update();

  if (opts.lights !== false) {
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1020, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-6, 2, -5);
    scene.add(rim);
  }

  const frameFns: FrameFn[] = [];
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let visible = true;
  let disposed = false;

  let fly: null | { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; u: number; dur: number } = null;

  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!visible || document.hidden) return;
    t += dt;
    if (fly) {
      fly.u = Math.min(1, fly.u + dt / fly.dur);
      const e = fly.u < 0.5 ? 4 * fly.u ** 3 : 1 - (-2 * fly.u + 2) ** 3 / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (fly.u >= 1) fly = null;
    }
    for (const fn of frameFns) fn(dt, t);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const resize = () => {
    const W = Math.max(1, host.clientWidth);
    const H = Math.max(1, host.clientHeight);
    renderer.setSize(W, H);
    labels.setSize(W, H);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = W / H;
    } else {
      const a = W / H;
      camera.left = -orthoSize * a;
      camera.right = orthoSize * a;
      camera.top = orthoSize;
      camera.bottom = -orthoSize;
    }
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    last = performance.now();
  });
  io.observe(host);

  return {
    scene,
    camera,
    renderer,
    controls,
    onFrame(fn) {
      frameFns.push(fn);
    },
    flyTo(pos, target, seconds = 1.2) {
      fly = {
        p0: camera.position.clone(),
        p1: new THREE.Vector3(...pos),
        t0: controls.target.clone(),
        t1: target ? new THREE.Vector3(...target) : controls.target.clone(),
        u: 0,
        dur: seconds,
      };
    },
    label(text, at, cls = '', parent) {
      const div = document.createElement('div');
      div.className = `stage-label ${cls}`.trim();
      div.textContent = text;
      const obj = new CSS2DObject(div);
      if (Array.isArray(at)) obj.position.set(...at);
      else obj.position.copy(at);
      (parent ?? scene).add(obj);
      return obj;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
        if (o instanceof CSS2DObject) o.element.remove();
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

/** A polyline trail with a fixed capacity that fades from head to tail. */
export class Trail {
  readonly line: THREE.Line;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly color: THREE.Color;
  private count = 0;

  constructor(readonly capacity: number, color: number, opacity = 1) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.color = new THREE.Color(color);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity });
    this.line = new THREE.Line(g, m);
    this.line.frustumCulled = false;
  }

  private colorsDirty = true;

  push(x: number, y: number, z: number): void {
    if (this.count < this.capacity) {
      this.count++;
      this.colorsDirty = true;
    } else {
      this.pos.copyWithin(0, 3);
    }
    const i = (this.count - 1) * 3;
    this.pos[i] = x;
    this.pos[i + 1] = y;
    this.pos[i + 2] = z;
    const g = this.line.geometry;
    if (this.colorsDirty) {
      // Fade: older points darker. Gradient only depends on count, so recompute lazily.
      for (let k = 0; k < this.count; k++) {
        const f = (k + 1) / this.count;
        const a = f * f;
        this.col[k * 3] = this.color.r * a;
        this.col[k * 3 + 1] = this.color.g * a;
        this.col[k * 3 + 2] = this.color.b * a;
      }
      (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      this.colorsDirty = false;
    }
    g.setDrawRange(0, this.count);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.line.geometry.setDrawRange(0, 0);
  }

  setColor(color: number): void {
    this.color.set(color);
    this.colorsDirty = true;
  }
}

/** Flat reference grid on the XZ plane (or rotated by the caller). */
export function makeGrid(size = 10, divisions = 20): THREE.GridHelper {
  const g = new THREE.GridHelper(size, divisions, PALETTE.gridMajor, PALETTE.grid);
  (g.material as THREE.Material).transparent = true;
  (g.material as THREE.Material).opacity = 0.6;
  return g;
}

/** Straight arrow from origin along dir with given length. */
export function makeArrow(dir: THREE.Vector3, length: number, color: number, origin = new THREE.Vector3()): THREE.ArrowHelper {
  return new THREE.ArrowHelper(dir.clone().normalize(), origin, length, color, Math.min(0.35, length * 0.25), Math.min(0.2, length * 0.14));
}
