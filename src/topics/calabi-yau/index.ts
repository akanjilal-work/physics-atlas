import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  buildHansonGrid,
  curveEuler,
  eulerCY3,
  fermatGenus,
  generations,
  gridNormalsInto,
  hodgeDiamond,
  manifoldById,
  MANIFOLDS,
  projectGridInto,
  surfaceName,
  type HansonGrid,
} from './physics.ts';

type View = 'surface' | 'compact';
type V3 = [number, number, number];

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const X_HALF = 1.25; // x ∈ [−a, a] for each patch
// Grid cells per patch. Fewer per patch when there are more patches, so the total stays near 7000 cells.
const mainRes = (n: number): [number, number] => {
  const nx = 2 * Math.round(Math.min(40, Math.max(20, 120 / n)) / 2);
  return [nx, nx / 2];
};
const latRes = (n: number): [number, number] => {
  const nx = 2 * Math.round(Math.min(16, Math.max(8, 48 / n)) / 2);
  return [nx, nx / 2];
};
const TARGET_SIZE = 2.1; // largest projected coordinate after scaling
const LAT_N = 2; // lattice runs −LAT_N..LAT_N on each axis
const LAT_STEP = 3;
const LAT_SCALE = 0.2;
const SPIN = 0.3; // auto-rotate rate of α (rad/s)

const CAM: Record<'surface' | 'far' | 'near', { pos: V3; target: V3 }> = {
  surface: { pos: [5.0, 2.9, 7.0], target: [0.75, 0.05, 0] },
  far: { pos: [15.5, 10.5, 18.5], target: [0, 0, 0] },
  near: { pos: [1.05, 0.62, 1.55], target: [0, 0, 0] },
};

/** Geometry for one Hanson grid, with positions and normals updated in place. */
class HansonMesh {
  readonly grid: HansonGrid;
  readonly geo: THREE.BufferGeometry;
  readonly lineGeo: THREE.BufferGeometry | null;
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  readonly scale: number;

  constructor(n: number, res: [number, number], withLines: boolean) {
    this.grid = buildHansonGrid(n, X_HALF, res[0], res[1], 4);
    const g = this.grid;
    let m = 0;
    for (let i = 0; i < g.z.length; i++) m = Math.max(m, Math.abs(g.z[i]));
    this.scale = TARGET_SIZE / m;
    this.pos = new Float32Array(g.vertexCount * 3);
    this.nrm = new Float32Array(g.vertexCount * 3);
    const col = new Float32Array(g.vertexCount * 3);
    const c = new THREE.Color();
    for (let v = 0; v < g.vertexCount; v++) {
      const u = g.uv[v * 2];
      const w = g.uv[v * 2 + 1];
      const hue = (g.patch[v] / g.patches + 0.58) % 1;
      // Brighter in the middle of each strip, darker where it is cut off toward infinity.
      c.setHSL(hue, 0.66, 0.36 + 0.2 * (1 - u * u) + 0.04 * w);
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
    }
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    const na = new THREE.BufferAttribute(this.nrm, 3);
    na.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('normal', na);
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(new THREE.BufferAttribute(g.index, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), TARGET_SIZE * 1.8);
    if (withLines) {
      this.lineGeo = new THREE.BufferGeometry();
      this.lineGeo.setAttribute('position', pa);
      this.lineGeo.setIndex(new THREE.BufferAttribute(g.lineIndex, 1));
      this.lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), TARGET_SIZE * 1.8);
    } else {
      this.lineGeo = null;
    }
  }

  project(alpha: number): void {
    projectGridInto(this.grid, alpha, this.pos, this.scale);
    gridNormalsInto(this.grid, this.pos, this.nrm);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
  }

  showPatches(single: boolean): void {
    const g = this.grid;
    this.geo.setDrawRange(0, single ? g.indicesPerPatch : g.index.length);
    this.lineGeo?.setDrawRange(0, single ? g.lineIndicesPerPatch : g.lineIndex.length);
  }

  dispose(): void {
    this.geo.dispose();
    this.lineGeo?.dispose();
  }
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.surface.pos, target: CAM.surface.target, fov: 42, near: 0.02, far: 400 });
  const { scene, camera, controls } = stage;
  scene.fog = new THREE.Fog(PALETTE.bg, 26, 60);

  // --- State
  let n = 5;
  let alpha = 35 * DEG;
  let autoRotate = true;
  let single = false;
  let wire = false;
  let view: View = 'surface';
  let manifoldId = 'quintic';
  let alphaSweep = 0;
  let zoomNear = false;
  let zoomedIn = false;
  let zoomReached = false;
  let latticeDirty = true;

  // --- Main surface
  const surfaceGroup = new THREE.Group();
  scene.add(surfaceGroup);
  const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.08 });
  const lineMat = new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.16, depthWrite: false });
  let main = new HansonMesh(n, mainRes(n), true);
  const surf = new THREE.Mesh(main.geo, surfMat);
  const lines = new THREE.LineSegments(main.lineGeo!, lineMat);
  lines.visible = wire;
  surfaceGroup.add(surf, lines);
  const sliceLabel = stage.label('a 2D slice of a 6D shape, projected from 4D to 3D', [0, 2.75, 0], 'muted', surfaceGroup);

  // Soft coloured fill so the underside of the surface is readable.
  const fill = new THREE.PointLight(PALETTE.violet, 6, 20, 1.5);
  fill.position.set(-3, -3, 3);
  scene.add(fill);

  // --- Compactification lattice
  const compactGroup = new THREE.Group();
  compactGroup.visible = false;
  scene.add(compactGroup);
  const LAT_COUNT = (2 * LAT_N + 1) ** 3;
  const latMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.05 });
  let lat = new HansonMesh(n, latRes(n), false);
  const lattice = new THREE.InstancedMesh(lat.geo, latMat, LAT_COUNT);
  lattice.frustumCulled = false;
  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(LAT_SCALE, LAT_SCALE, LAT_SCALE);
    const p = new THREE.Vector3();
    let k = 0;
    for (let i = -LAT_N; i <= LAT_N; i++) {
      for (let j = -LAT_N; j <= LAT_N; j++) {
        for (let l = -LAT_N; l <= LAT_N; l++) {
          m4.compose(p.set(i * LAT_STEP, j * LAT_STEP, l * LAT_STEP), q, s);
          lattice.setMatrixAt(k++, m4);
        }
      }
    }
    lattice.instanceMatrix.needsUpdate = true;
  }
  compactGroup.add(lattice);
  {
    const L = LAT_N * LAT_STEP;
    const segs: number[] = [];
    for (let i = -LAT_N; i <= LAT_N; i++) {
      for (let j = -LAT_N; j <= LAT_N; j++) {
        const a = i * LAT_STEP;
        const b = j * LAT_STEP;
        segs.push(-L, a, b, L, a, b, a, -L, b, a, L, b, a, b, -L, a, b, L);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    compactGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.7 })));
  }
  const farLabel = stage.label('ordinary 3D space: one hidden shape at every point', [0, LAT_N * LAT_STEP + 1.2, 0], '', compactGroup);
  const nearLabel = stage.label('one point of space, magnified about 10³⁴ times', [0, 0.62, 0], '', compactGroup);
  const nearNote = stage.label('drawn: a 2D slice of a 6-real-dimensional shape', [0, -0.62, 0], 'muted', compactGroup);
  nearLabel.visible = false;
  nearNote.visible = false;

  // --- Hodge diamond inset
  const inset = document.createElement('canvas');
  inset.className = 'cy-inset';
  inset.width = 400;
  inset.height = 376;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '200px', height: '188px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const MONO = 'JetBrains Mono, ui-monospace, monospace';

  function drawInset(): void {
    const m = manifoldById(manifoldId);
    const chi = eulerCY3(m.h11, m.h21);
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.textAlign = 'left';
    c.font = `20px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('Hodge diamond', 18, 30);
    c.font = `600 21px ${MONO}`;
    c.fillStyle = '#dfe6f3';
    c.fillText(m.short, 18, 58);
    const rows = hodgeDiamond(m.h11, m.h21);
    const cx = W / 2;
    const top = 92;
    const dy = 30;
    const dx = 58;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    rows.forEach((row, r) => {
      row.forEach((h, i) => {
        const x = cx + (i - (row.length - 1) / 2) * dx;
        const y = top + r * dy;
        const isH11 = (r === 2 || r === 4) && i === 1;
        const isH21 = r === 3 && (i === 1 || i === 2);
        c.font = `${isH11 || isH21 ? 600 : 400} ${isH11 || isH21 ? 24 : 20}px ${MONO}`;
        c.fillStyle = isH11 ? css(PALETTE.cyan) : isH21 ? css(PALETTE.amber) : h === 0 ? '#3d4a66' : '#dfe6f3';
        c.fillText(String(h), x, y);
      });
    });
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = `20px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    const yb = top + 6 * dy + 40;
    c.fillText(`χ = 2(h¹¹ − h²¹) = ${chi}`, 18, yb);
    c.fillStyle = generations(chi) === 3 ? css(PALETTE.green) : '#9aa6bd';
    c.fillText(`generations |χ|/2 = ${generations(chi)}`, 18, yb + 28);
  }

  // --- Geometry updates
  function applyAlpha(): void {
    main.project(alpha);
    if (view === 'compact') {
      lat.project(alpha);
      latticeDirty = false;
    } else {
      latticeDirty = true;
    }
  }

  function rebuild(): void {
    main.dispose();
    lat.dispose();
    main = new HansonMesh(n, mainRes(n), true);
    lat = new HansonMesh(n, latRes(n), false);
    surf.geometry = main.geo;
    lines.geometry = main.lineGeo!;
    lattice.geometry = lat.geo;
    main.showPatches(single);
    lat.showPatches(false);
    applyAlpha();
    updateReadouts();
  }

  // --- Frame loop
  const origin = new THREE.Vector3();
  let sliderTimer = 0;
  stage.onFrame((dt) => {
    if (autoRotate) {
      alpha = (alpha + SPIN * dt) % TAU;
      applyAlpha();
      sliderTimer += dt;
      if (sliderTimer > 0.12) {
        sliderTimer = 0;
        alphaCtl.set(alpha / DEG, false);
      }
    }
    if (view === 'compact') {
      const d = camera.position.distanceTo(origin);
      zoomedIn = d < 2.6;
      if (zoomedIn) zoomReached = true;
      nearLabel.visible = d < 6;
      nearNote.visible = d < 6;
      farLabel.visible = d > 12;
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('The surface z₁ⁿ + z₂ⁿ = 1');
  ui.slider({
    key: 'n', label: 'Degree n', min: 2, max: 6, step: 1, value: n,
    onInput: (v) => {
      if (v === n) return;
      n = v;
      rebuild();
    },
  });
  const alphaCtl = ui.slider({
    key: 'alpha', label: 'Projection angle α', min: 0, max: 360, step: 0.5, value: alpha / DEG, unit: '°',
    format: (v) => v.toFixed(0),
    onInput: (v) => {
      const next = v * DEG;
      // Count only gradual sweeps, not jumps from clicking the track.
      alphaSweep += Math.min(Math.abs(next - alpha), 20 * DEG);
      alpha = next;
      applyAlpha();
    },
  });
  ui.toggle({ key: 'auto', label: 'Auto-rotate α', value: autoRotate, onChange: (v) => (autoRotate = v) });
  ui.toggle({ key: 'single', label: 'One patch only', value: single, onChange: (v) => { single = v; main.showPatches(v); } });
  ui.toggle({ key: 'wire', label: 'Wireframe', value: wire, onChange: (v) => { wire = v; lines.visible = v; } });
  const viewCtl = ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'surface', label: 'Surface' }, { value: 'compact', label: 'Compactification' }],
    onChange: (v) => setView(v),
  });
  ui.buttons([
    {
      label: 'Zoom in and out', primary: true, key: 'view',
      onClick: () => {
        if (view !== 'compact') {
          viewCtl.set('compact', false);
          setView('compact');
          return;
        }
        zoomNear = !zoomNear;
        const c = zoomNear ? CAM.near : CAM.far;
        stage.flyTo(c.pos, c.target, zoomNear ? 3.0 : 2.4);
      },
    },
  ]);
  ui.note('Each colour is one of the n² patches. A patch is one strip of ξ = x + iy, turned by n-th roots of unity. Apparent crossings come from the projection.');

  ui.section('Calabi–Yau threefold');
  ui.select<string>({
    key: 'manifold', label: 'Manifold', value: manifoldId,
    options: MANIFOLDS.map((m) => ({ value: m.id, label: m.short })),
    onChange: (v) => { manifoldId = v; drawInset(); updateReadouts(); },
  });
  const mNote = ui.note('');

  ui.section('Readouts');
  const rGenus = ui.readout('genus', 'genus g of the curve');
  const rChiC = ui.readout('chiCurve', 'χ of the curve');
  const rPatch = ui.readout('patches', 'patches n²');
  const rH11 = ui.readout('h11', 'h¹¹ (sizes)');
  const rH21 = ui.readout('h21', 'h²¹ (shapes)');
  const rChi = ui.readout('chi', 'χ of the threefold');
  const rGen = ui.readout('gens', 'generations |χ|/2');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'h¹¹' },
    { color: css(PALETTE.amber), label: 'h²¹' },
  ]);
  ui.note('The curve is a slice you can draw. The threefold is the full 6D shape, which cannot be drawn. The generation count holds in the simplest heterotic construction only.');

  function updateReadouts(): void {
    const g = fermatGenus(n);
    rGenus(`${g} (${surfaceName(g)})`);
    rChiC(curveEuler(n));
    rPatch(n * n);
    const m = manifoldById(manifoldId);
    const chi = eulerCY3(m.h11, m.h21);
    rH11(m.h11);
    rH21(m.h21);
    rChi(chi);
    rGen(generations(chi));
    mNote.textContent = m.note;
  }

  function setView(v: View): void {
    view = v;
    surfaceGroup.visible = v === 'surface';
    compactGroup.visible = v === 'compact';
    if (v === 'compact') {
      if (latticeDirty) {
        lat.project(alpha);
        latticeDirty = false;
      }
      zoomNear = false;
      stage.flyTo(CAM.far.pos, CAM.far.target, 1.4);
    } else {
      zoomedIn = false;
      stage.flyTo(CAM.surface.pos, CAM.surface.target, 1.4);
    }
  }

  controls.minDistance = 0.4;
  controls.maxDistance = 60;
  sliceLabel.element.style.whiteSpace = 'nowrap';
  applyAlpha();
  updateReadouts();
  drawInset();

  const api = {
    state: () => ({
      n,
      alpha,
      alphaDeg: alpha / DEG,
      alphaSweep,
      autoRotate,
      single,
      wire,
      view,
      manifold: manifoldId,
      genus: fermatGenus(n),
      chiCurve: curveEuler(n),
      patches: n * n,
      h11: manifoldById(manifoldId).h11,
      h21: manifoldById(manifoldId).h21,
      chi: eulerCY3(manifoldById(manifoldId).h11, manifoldById(manifoldId).h21),
      gens: generations(eulerCY3(manifoldById(manifoldId).h11, manifoldById(manifoldId).h21)),
      zoomedIn,
      zoomReached,
    }),
    dispose: () => {
      inset.remove();
      main.dispose();
      lat.dispose();
      stage.dispose();
    },
  };
  return api;
}

const topic: Topic = {
  id: 'calabi-yau',
  number: 19,
  title: 'Calabi–Yau Shapes',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'The hidden geometry that would set the laws of physics.',
  content,
  mount,
};

export default topic;
