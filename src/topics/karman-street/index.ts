import * as THREE from 'three';
import { createStage, makeArrow, PALETTE } from '../../core/stage.ts';
import { Panel } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  Lattice, advect, buildObstacle, nuFromTau, perturb, rms, solidExtent, spectrum, tauFromNu, williamsonSt,
  type Extent, type ObstacleKind,
} from './physics.ts';

const NX = 480;
const NY = 120;
const N = NX * NY;
const SHEET_W = 12;
const CELL = SHEET_W / NX;
const SHEET_H = NY * CELL;
const OB_X = 96; // obstacle centre, cells
const OB_Y = NY / 2;
const TAU_MIN = 0.52; // BGK stability floor on this grid
const RE_MIN = 10;
const RE_MAX = 250;
const SAMPLE = 5; // probe sampling interval, steps
const CAP = 2048; // probe ring buffer
const NF = 220; // spectrum bins
const ST_LO = 0.02;
const ST_HI = 0.5;
const AMP_SHED = 0.03; // rms v / U above which the wake counts as shedding
const AMP_STEADY = 0.003; // below which it counts as steady
const BUDGET_MS = 11;
const NP = 6000; // dye particles
const EMIT = 12; // dye emitters
const MAXPAINT = 4000;
const RELIEF = 0.2;
const MX = NX / 2 + 1; // relief mesh vertices
const MY = NY / 2 + 1;
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const HOME_CAM: [number, number, number] = [-0.25, 10.9, 7.4];
const HOME_TGT: [number, number, number] = [-0.25, -0.2, 1.6];

type Field = 'vorticity' | 'speed';

/** Build a 256-entry RGB lookup table from colour stops. */
function lut(stops: [number, number][]): Uint8Array {
  const out = new Uint8Array(256 * 3);
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [ta, ca] = stops[k];
    const [tb, cb] = stops[k + 1];
    const u = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    c0.setHex(ca);
    c1.setHex(cb);
    c0.lerp(c1, u);
    out[i * 3] = Math.round(c0.r * 255);
    out[i * 3 + 1] = Math.round(c0.g * 255);
    out[i * 3 + 2] = Math.round(c0.b * 255);
  }
  return out;
}

// Vorticity: cyan (clockwise) through a dark core to amber (counter-clockwise).
const VORT_LUT = lut([[0, 0xd8f6ff], [0.18, 0x4fd1e8], [0.36, 0x1d5876], [0.5, 0x1a2542], [0.64, 0x7a521c], [0.82, 0xf5b642], [1, 0xfff1c9]]);
// Speed: still fluid dark, free stream violet, fast cyan-white.
const SPEED_LUT = lut([[0, 0x0a0e1a], [0.3, 0x2a2350], [0.62, 0xa78bfa], [0.8, 0x4fd1e8], [1, 0xf2fbff]]);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: HOME_CAM, target: HOME_TGT, fov: 42 });
  const { scene, camera, renderer, controls } = stage;

  // --- Simulation state
  let U = 0.1;
  let Re = 100;
  let obstacle: ObstacleKind = 'cylinder';
  let field: Field = 'vorticity';
  let relief = true;
  let dye = true;
  let paintMode = false;
  let playing = true;
  let spf = 24;
  let seed = 1;
  let touched = false;
  let painted = 0;
  const lat = new Lattice({ nx: NX, ny: NY, u0: U, tau: 0.6 });
  const ext: Extent = { count: 0, xmin: 0, xmax: 0, ymin: 0, ymax: 0 };
  let D = 17;
  let nu = (U * D) / Re;
  let probeX = 0;
  let probeY = 0;
  let unstable = false;
  let unstableTimer = 0;

  // Probe record
  const sig = new Float64Array(CAP);
  let nSamples = 0;
  let sampleTick = 0;
  let changeStep = 0; // lattice step of the last change that restarts the measurement
  const spec = new Float32Array(NF);
  let St = 0;
  let stValid = false;
  let amp = 0;
  let meanV = 0;
  let specLen = 0;
  let steadyReMax = 0;
  let shedReMin = 0;
  const vort = new Float32Array(N);

  // --- Scene: the flow sheet
  const texData = new Uint8Array(N * 4);
  const tex = new THREE.DataTexture(texData, NX, NY, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const sheetGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(MX * MY * 3);
  const sUv = new Float32Array(MX * MY * 2);
  const cellOfVert = new Int32Array(MX * MY);
  for (let j = 0; j < MY; j++) {
    for (let i = 0; i < MX; i++) {
      const v = j * MX + i;
      const cx = Math.min(NX - 1, i * 2);
      const cy = Math.min(NY - 1, j * 2);
      cellOfVert[v] = cy * NX + cx;
      sPos[v * 3] = wx(cx);
      sPos[v * 3 + 1] = 0;
      sPos[v * 3 + 2] = wz(cy);
      sUv[v * 2] = (cx + 0.5) / NX;
      sUv[v * 2 + 1] = (cy + 0.5) / NY;
    }
  }
  const sIdx = new Uint32Array((MX - 1) * (MY - 1) * 6);
  {
    let q = 0;
    for (let j = 0; j < MY - 1; j++) {
      for (let i = 0; i < MX - 1; i++) {
        const a = j * MX + i;
        const b = a + 1;
        const c = a + MX;
        const d = c + 1;
        sIdx[q++] = a; sIdx[q++] = c; sIdx[q++] = b;
        sIdx[q++] = b; sIdx[q++] = c; sIdx[q++] = d;
      }
    }
  }
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sheetGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
  sheetGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  sheetGeo.computeVertexNormals();
  (sheetGeo.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const sheetMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.62, side: THREE.DoubleSide });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.frustumCulled = false;
  scene.add(sheet);

  // Frame around the tunnel
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SHEET_W, 0.001, SHEET_H)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }),
  );
  frame.position.y = -0.01;
  scene.add(frame);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(SHEET_W + 0.3, 0.08, SHEET_H + 0.3),
    new THREE.MeshStandardMaterial({ color: 0x111726, roughness: 0.9 }),
  );
  base.position.y = -RELIEF - 0.08;
  scene.add(base);

  // Inflow arrows on the left edge
  const inflow = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const z = -SHEET_H / 2 + ((k + 0.5) / 5) * SHEET_H;
    inflow.add(makeArrow(new THREE.Vector3(1, 0, 0), 0.5, PALETTE.white, new THREE.Vector3(-SHEET_W / 2 + 0.05, 0.3, z)));
  }
  scene.add(inflow);
  stage.label('inflow U →', [-SHEET_W / 2 + 0.9, 0.05, SHEET_H / 2 + 0.3], 'muted');

  // Obstacle meshes
  const obMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.55, roughness: 0.35 });
  const obGroup = new THREE.Group();
  scene.add(obGroup);
  const colGeo = new THREE.BoxGeometry(CELL, 0.5, CELL);
  const cols = new THREE.InstancedMesh(colGeo, obMat, MAXPAINT);
  cols.count = 0;
  cols.frustumCulled = false;
  scene.add(cols);

  // Probe marker
  const probe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  scene.add(probe);
  const probeRing = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.115, 32), new THREE.MeshBasicMaterial({ color: PALETTE.green, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  probeRing.rotation.x = -Math.PI / 2;
  scene.add(probeRing);
  const probeLab = stage.label('probe', [0, 0.3, 0], 'muted');

  // Status label under the sheet
  const statusLab = stage.label('', [0, -0.1, SHEET_H / 2 + 0.45], 'big');
  const subLab = stage.label('', [0, -0.1, SHEET_H / 2 + 0.85], 'muted');

  // Dye particles
  const pxA = new Float32Array(NP);
  const pyA = new Float32Array(NP);
  const alive = new Uint8Array(NP);
  const dPos = new Float32Array(NP * 3);
  const dCol = new Float32Array(NP * 3);
  const dyeGeo = new THREE.BufferGeometry();
  dyeGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dyeGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  const dyeMat = new THREE.PointsMaterial({ size: 0.042, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const dyePts = new THREE.Points(dyeGeo, dyeMat);
  dyePts.frustumCulled = false;
  scene.add(dyePts);
  let emitHead = 0;
  for (let j = 0; j < NP; j++) {
    const e = j % EMIT;
    const warm = e % 2 === 0;
    dCol[j * 3] = warm ? 1 : 0.86;
    dCol[j * 3 + 1] = warm ? 0.97 : 0.95;
    dCol[j * 3 + 2] = warm ? 0.9 : 1;
  }

  function wx(x: number): number {
    return (x - (NX - 1) / 2) * CELL;
  }
  function wz(y: number): number {
    return -(y - (NY - 1) / 2) * CELL;
  }

  // --- Overlays
  const boxStyle = { background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute' };
  const inset = document.createElement('canvas');
  inset.className = 'ks-probe';
  inset.width = 500;
  inset.height = 340;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '250px', height: '170px' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: `11px/1.4 ${MONO}`, color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    const top = field === 'vorticity'
      ? `<div><span style="color:#f5b642">Amber</span>: spinning counter-clockwise. <span style="color:#4fd1e8">Cyan</span>: clockwise. Height shows the spin too.</div>`
      : `<div>Colour and height show speed. <span style="color:#a78bfa">Violet</span> is the free stream, <span style="color:#4fd1e8">cyan</span> faster, dark is slow.</div>`;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>${top}
<div style="margin-top:3px">White dots: dye carried by the flow. <span style="color:#5ee39a">Green ring</span>: probe.</div>
<div style="margin-top:3px;color:#8391ab">Grid ${NX} × ${NY} cells, flow left to right.</div>`;
  }
  paintLegend();

  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'absolute', left: '50%', top: '12px', transform: 'translateX(-50%)', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.8)', borderRadius: '8px', border: '1px solid #5ee39a', padding: '5px 10px',
    font: `12px ${MONO}`, color: '#dfe6f3', display: 'none', whiteSpace: 'nowrap',
  } as CSSStyleDeclaration);
  hint.textContent = 'Painting: drag on the sheet. Shift-drag erases.';
  viewport.appendChild(hint);

  // --- Obstacle handling
  function geom() {
    const size = obstacle === 'airfoil' ? 60 : obstacle === 'square' ? 15 : 16;
    return { cx: obstacle === 'airfoil' ? OB_X + 6 : OB_X, cy: OB_Y, size, aoa: (18 * Math.PI) / 180 };
  }

  function rebuildObstacleMesh(): void {
    while (obGroup.children.length) {
      const c = obGroup.children[0] as THREE.Mesh;
      obGroup.remove(c);
      c.geometry.dispose();
    }
    cols.count = 0;
    const g = geom();
    const h = 0.5;
    if (obstacle === 'cylinder') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(((g.size + 1) / 2) * CELL, ((g.size + 1) / 2) * CELL, h, 48), obMat);
      m.position.set(wx(g.cx), h / 2 - RELIEF * 0.6, wz(g.cy));
      obGroup.add(m);
    } else if (obstacle === 'square') {
      const m = new THREE.Mesh(new THREE.BoxGeometry((g.size + 1) * CELL, h, (g.size + 1) * CELL), obMat);
      m.position.set(wx(g.cx), h / 2 - RELIEF * 0.6, wz(g.cy));
      obGroup.add(m);
    } else if (obstacle === 'airfoil') {
      const shape = new THREE.Shape();
      const M = 60;
      const c = Math.cos(g.aoa);
      const s = Math.sin(g.aoa);
      const pts: [number, number][] = [];
      for (let k = 0; k <= M; k++) {
        const t = 0.5 - 0.5 * Math.cos((Math.PI * k) / M);
        pts.push([t, 5 * 0.12 * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4)]);
      }
      const outline: [number, number][] = [];
      for (let k = M; k >= 0; k--) outline.push([pts[k][0], pts[k][1]]);
      for (let k = 1; k <= M; k++) outline.push([pts[k][0], -pts[k][1]]);
      outline.forEach(([t, yh], k) => {
        const xa = (t - 0.5) * g.size;
        const ya = yh * g.size;
        const xl = xa * c - ya * s;
        const yl = xa * s + ya * c;
        if (k === 0) shape.moveTo(xl * CELL, yl * CELL);
        else shape.lineTo(xl * CELL, yl * CELL);
      });
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      const m = new THREE.Mesh(geo, obMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(wx(g.cx), -RELIEF * 0.6, wz(g.cy));
      obGroup.add(m);
    } else {
      rebuildColumns();
    }
  }

  const m4 = new THREE.Matrix4();
  function rebuildColumns(): void {
    let c = 0;
    for (let y = 1; y < NY - 1 && c < MAXPAINT; y++) {
      for (let x = 1; x < NX - 1 && c < MAXPAINT; x++) {
        if (!lat.solid[y * NX + x]) continue;
        m4.makeTranslation(wx(x), 0.25 - RELIEF * 0.6, wz(y));
        cols.setMatrixAt(c++, m4);
      }
    }
    cols.count = c;
    cols.instanceMatrix.needsUpdate = true;
  }

  function measureObstacle(): void {
    solidExtent(lat, ext);
    painted = ext.count;
    D = ext.count > 0 ? ext.ymax - ext.ymin + 1 : 17;
    const cy = ext.count > 0 ? Math.round((ext.ymin + ext.ymax) / 2) : OB_Y;
    const xr = ext.count > 0 ? ext.xmax : OB_X;
    probeX = Math.min(NX - 24, Math.round(xr + 2 * D));
    probeY = Math.max(2, Math.min(NY - 3, cy));
    probe.position.set(wx(probeX), 0.05, wz(probeY));
    probeRing.position.set(wx(probeX), 0.02, wz(probeY));
    probeLab.position.set(wx(probeX), 0.1, wz(probeY) + 0.62);
  }

  // --- Viscosity and Reynolds number
  const nuMin = nuFromTau(TAU_MIN);
  function applyNu(): void {
    lat.tau = tauFromNu(nu);
  }
  function setRe(v: number): void {
    Re = Math.max(RE_MIN, Math.min(RE_MAX, v));
    nu = Math.max(nuMin, (U * D) / Re);
    Re = (U * D) / nu;
    applyNu();
    restartMeasure();
  }
  function setU(v: number): void {
    U = v;
    lat.u0 = U;
    lat.applyInflow();
    // Keep nu fixed, so Re changes with U, but stay within the stable range.
    let r = (U * D) / nu;
    if (r > RE_MAX) nu = (U * D) / RE_MAX;
    if (r < RE_MIN) nu = (U * D) / RE_MIN;
    r = (U * D) / nu;
    Re = r;
    applyNu();
    reSlider.set(Math.round(Re), false);
    inflow.scale.set(U / 0.1, 1, 1);
    inflow.position.x = (-SHEET_W / 2 + 0.05) * (1 - U / 0.1);
    restartMeasure();
  }

  function restartMeasure(): void {
    changeStep = lat.steps;
    stValid = false;
  }

  function resetFlow(): void {
    lat.u0 = U;
    lat.fill(1, U, 0);
    perturb(lat, 0.05, seed);
    lat.applyInflow();
    unstable = false;
    alive.fill(0);
    nSamples = 0;
    restartMeasure();
  }

  function setObstacle(k: ObstacleKind): void {
    obstacle = k;
    if (k !== 'custom') buildObstacle(lat, k, geom());
    measureObstacle();
    // Keep Re, adjust the viscosity to the new width.
    setRe(Re);
    reSlider.set(Math.round(Re), false);
    rebuildObstacleMesh();
    resetFlow();
  }

  // --- Painting
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let painting = false;
  let erase = false;
  let paintDirty = false;
  const cvs = renderer.domElement;

  function paintAt(ev: PointerEvent): void {
    const r = cvs.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const cx = Math.round(hit.x / CELL + (NX - 1) / 2);
    const cy = Math.round(-hit.z / CELL + (NY - 1) / 2);
    const R = 3;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + 1) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 8 || x > NX - 30 || y < 3 || y > NY - 4) continue;
        const k = y * NX + x;
        if (!erase && !lat.solid[k] && painted >= MAXPAINT) continue;
        if (!!lat.solid[k] !== !erase) {
          lat.setSolid(k, !erase);
          if (erase) lat.setCell(k, 1, U, 0);
          painted += erase ? -1 : 1;
          paintDirty = true;
        }
      }
    }
  }
  const onDown = (ev: PointerEvent) => {
    if (!paintMode || ev.button !== 0) return;
    painting = true;
    erase = ev.shiftKey;
    cvs.setPointerCapture(ev.pointerId);
    paintAt(ev);
  };
  const onMove = (ev: PointerEvent) => {
    if (painting) {
      erase = ev.shiftKey;
      paintAt(ev);
    }
  };
  const onUp = (ev: PointerEvent) => {
    if (!painting) return;
    painting = false;
    if (cvs.hasPointerCapture(ev.pointerId)) cvs.releasePointerCapture(ev.pointerId);
  };
  cvs.addEventListener('pointerdown', onDown);
  cvs.addEventListener('pointermove', onMove);
  cvs.addEventListener('pointerup', onUp);
  cvs.addEventListener('pointercancel', onUp);

  function setPaint(on: boolean): void {
    paintMode = on;
    controls.enabled = !on;
    hint.style.display = on ? 'block' : 'none';
    if (on && obstacle !== 'custom') {
      // Start the drawing from an empty tunnel.
      obstacle = 'custom';
      obSelect.set('custom', false);
      clearSolids();
    }
    if (on) stage.flyTo([wx(OB_X + 60), 7.4, 0.9], [wx(OB_X + 60), 0, 0.05], 1);
    else stage.flyTo(HOME_CAM, HOME_TGT, 1);
    cvs.style.cursor = on ? 'crosshair' : '';
  }

  function clearSolids(): void {
    for (let k = 0; k < N; k++) {
      if (lat.solid[k]) {
        lat.setSolid(k, false);
        lat.setCell(k, 1, U, 0);
      }
    }
    painted = 0;
    paintDirty = true;
    rebuildObstacleMesh();
  }

  // --- Rendering the field
  function drawField(): void {
    lat.vorticity(vort);
    const ux = lat.ux;
    const uy = lat.uy;
    const solid = lat.solid;
    const vs = D / U / 1.6; // colour saturates at |omega| D / U = 1.6
    const iU = 1 / U;
    const isV = field === 'vorticity';
    for (let k = 0; k < N; k++) {
      const o = k * 4;
      if (solid[k]) {
        texData[o] = 90; texData[o + 1] = 100; texData[o + 2] = 120; texData[o + 3] = 255;
        continue;
      }
      let idx: number;
      if (isV) {
        let t = vort[k] * vs;
        t = t > 1 ? 1 : t < -1 ? -1 : t;
        idx = ((t + 1) * 127.5) | 0;
      } else {
        let s = Math.sqrt(ux[k] * ux[k] + uy[k] * uy[k]) * iU * 0.625;
        s = s > 1 ? 1 : s;
        idx = (s * 255) | 0;
      }
      const L = isV ? VORT_LUT : SPEED_LUT;
      texData[o] = L[idx * 3];
      texData[o + 1] = L[idx * 3 + 1];
      texData[o + 2] = L[idx * 3 + 2];
      texData[o + 3] = 255;
    }
    tex.needsUpdate = true;
  }

  function heightAt(k: number): number {
    if (!relief) return 0;
    if (field === 'vorticity') {
      let t = (vort[k] * D) / U / 2.5;
      t = t > 1 ? 1 : t < -1 ? -1 : t;
      return t * RELIEF;
    }
    let s = Math.sqrt(lat.ux[k] * lat.ux[k] + lat.uy[k] * lat.uy[k]) / U - 1;
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    return s * RELIEF;
  }

  let reliefWasOn = true;
  let normalTick = 0;
  function drawRelief(): void {
    if (!relief && !reliefWasOn) return;
    for (let v = 0; v < MX * MY; v++) sPos[v * 3 + 1] = heightAt(cellOfVert[v]);
    (sheetGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (++normalTick % 2 === 0 || !relief) sheetGeo.computeVertexNormals();
    reliefWasOn = relief;
  }

  function emitDye(): void {
    if (!dye) return;
    const x0 = Math.max(3, (ext.count > 0 ? ext.xmin : OB_X) - 8);
    const yc = ext.count > 0 ? (ext.ymin + ext.ymax) / 2 : OB_Y;
    const span = Math.max(24, D * 1.6);
    for (let e = 0; e < EMIT; e++) {
      const j = emitHead;
      emitHead = (emitHead + 1) % NP;
      pxA[j] = x0 + (e % 2) * 0.5;
      pyA[j] = yc - span / 2 + ((e + 0.5) / EMIT) * span;
      alive[j] = 1;
    }
  }

  function drawDye(): void {
    dyePts.visible = dye;
    if (!dye) return;
    for (let j = 0; j < NP; j++) {
      const o = j * 3;
      if (!alive[j]) {
        dPos[o] = 0; dPos[o + 1] = -50; dPos[o + 2] = 0;
        continue;
      }
      const x = pxA[j];
      const y = pyA[j];
      const k = Math.round(y) * NX + Math.round(x);
      dPos[o] = wx(x);
      dPos[o + 1] = heightAt(k) + 0.02;
      dPos[o + 2] = wz(y);
    }
    (dyeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Analysis of the probe record
  const settleSteps = () => Math.round((90 * D) / U);
  function analyse(): void {
    const since = lat.steps - changeStep;
    const settled = since >= settleSteps();
    // Use only samples taken after half the settling time.
    const usable = Math.max(0, Math.floor((since - settleSteps() / 2) / SAMPLE));
    const len = Math.min(CAP, nSamples, usable);
    specLen = len;
    const short = Math.min(len, 400);
    if (short >= 40) {
      const st = (nSamples - short) % CAP;
      amp = rms(sig, st, short, CAP) / U;
      let m = 0;
      for (let j = 0; j < short; j++) m += sig[(st + j) % CAP];
      meanV = m / short / U;
    } else {
      const s2 = Math.min(nSamples, 200);
      amp = s2 >= 20 ? rms(sig, (nSamples - s2) % CAP, s2, CAP) / U : 0;
    }
    if (len >= 256) {
      const st = (nSamples - len) % CAP;
      const f = spectrum(sig, st, len, CAP, SAMPLE, (ST_LO * U) / D, (ST_HI * U) / D, NF, spec);
      St = (f * D) / U;
    } else {
      spec.fill(0);
    }
    stValid = settled && len >= 1024 && amp > AMP_SHED;
    if (settled && !unstable) {
      const r = Math.round(Re);
      if (obstacle === 'cylinder') {
        if (amp < AMP_STEADY && Math.abs(meanV) < 0.01) steadyReMax = Math.max(steadyReMax, r);
        if (amp > AMP_SHED) shedReMin = shedReMin === 0 ? r : Math.min(shedReMin, r);
      }
    }
  }
  const isSettled = () => lat.steps - changeStep >= settleSteps();
  const isShedding = () => isSettled() && amp > AMP_SHED && !unstable;
  const isSteady = () => isSettled() && amp < AMP_STEADY && Math.abs(meanV) < 0.01 && !unstable;

  function drawInset(): void {
    const Wd = inset.width;
    const Hh = inset.height;
    const c = ictx;
    c.clearRect(0, 0, Wd, Hh);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText('probe v / U vs time', 16, 30);
    // Trace: last 600 samples (3000 steps).
    const l = 14;
    const r = Wd - 14;
    const top = 44;
    const mid = 100;
    const bot = 156;
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(l, mid);
    c.lineTo(r, mid);
    c.stroke();
    const show = Math.min(nSamples, 600);
    let peak = 0.05;
    for (let j = 0; j < show; j++) peak = Math.max(peak, Math.abs(sig[(nSamples - show + j) % CAP]) / U);
    const sc = (bot - top) / 2 / peak;
    c.strokeStyle = '#5ee39a';
    c.lineWidth = 2.5;
    c.beginPath();
    for (let j = 0; j < show; j++) {
      const x = r - ((show - 1 - j) / 599) * (r - l);
      const y = mid - (sig[(nSamples - show + j) % CAP] / U) * sc;
      if (j === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = '#56627c';
    c.fillText(`±${peak.toFixed(2)}`, r - 100, 30);

    // Spectrum vs St
    const sTop = 200;
    const sBot = Hh - 44;
    const xOf = (s: number) => l + ((s - ST_LO) / (ST_HI - ST_LO)) * (r - l);
    c.fillStyle = '#8391ab';
    c.fillText('spectrum vs St = fD/U', 16, 188);
    c.strokeStyle = '#243049';
    c.beginPath();
    c.moveTo(l, sBot);
    c.lineTo(r, sBot);
    c.stroke();
    c.fillStyle = '#56627c';
    for (const s of [0.1, 0.2, 0.3, 0.4]) c.fillText(s.toFixed(1), xOf(s) - 18, sBot + 28);
    c.setLineDash([6, 6]);
    c.strokeStyle = 'rgba(245,182,66,0.6)';
    c.beginPath();
    c.moveTo(xOf(0.2), sTop);
    c.lineTo(xOf(0.2), sBot);
    c.stroke();
    c.setLineDash([]);
    if (specLen >= 256) {
      let pmax = 0;
      for (let q = 0; q < NF; q++) pmax = Math.max(pmax, spec[q]);
      if (pmax > 0) {
        c.strokeStyle = '#dfe6f3';
        c.lineWidth = 2.5;
        c.beginPath();
        for (let q = 0; q < NF; q++) {
          const s = ST_LO + ((ST_HI - ST_LO) * q) / (NF - 1);
          const y = sBot - (spec[q] / pmax) * (sBot - sTop - 6);
          if (q === 0) c.moveTo(xOf(s), y);
          else c.lineTo(xOf(s), y);
        }
        c.stroke();
        if (amp > AMP_SHED) {
          c.fillStyle = '#5ee39a';
          c.beginPath();
          c.arc(xOf(St), sTop + 6, 7, 0, Math.PI * 2);
          c.fill();
          c.font = `600 24px ${MONO}`;
          const txt = `St ${St.toFixed(3)}`;
          const tx = Math.min(r - 150, Math.max(l, xOf(St) + 12));
          c.fillText(txt, tx, sTop + 14);
        } else {
          c.fillStyle = '#8391ab';
          c.fillText('no clear peak', l + 150, sTop + 30);
        }
      }
    } else {
      c.fillStyle = '#8391ab';
      c.fillText('settling… collecting a record', l + 30, (sTop + sBot) / 2 + 8);
    }
  }

  let lastStatus = '';
  function updateStatus(): void {
    let a: string;
    let b: string;
    if (unstable) {
      a = 'Numerical blow-up';
      b = 'the flow was reset. Try a lower Re or speed.';
    } else if (!isSettled()) {
      const pct = Math.min(99, Math.round(((lat.steps - changeStep) / settleSteps()) * 100));
      a = amp > AMP_SHED ? 'Shedding, settling…' : 'Wake settling…';
      b = `Re = ${Math.round(Re)}, ${pct}% of the settling time`;
    } else if (isShedding()) {
      a = stValid ? `Vortex street: St = ${St.toFixed(3)}` : 'Vortex street';
      b = `Re = ${Math.round(Re)}: swirls peel off each side in turn`;
    } else if (isSteady()) {
      a = 'Steady, symmetric wake';
      b = `Re = ${Math.round(Re)}: two eddies sit behind the obstacle`;
    } else {
      a = 'Weak wobble';
      b = `Re = ${Math.round(Re)}: near the onset, growth and decay are slow`;
    }
    const key = a + b;
    if (key === lastStatus) return;
    lastStatus = key;
    statusLab.element.textContent = a;
    subLab.element.textContent = b;
  }

  // --- Frame loop
  let slow = 0;
  let anaT = 0;
  stage.onFrame((dt) => {
    let done = 0;
    if (playing && !unstable) {
      const t0 = performance.now();
      while (done < spf) {
        lat.step();
        done++;
        if (++sampleTick >= SAMPLE) {
          sampleTick = 0;
          sig[nSamples % CAP] = lat.uy[probeY * NX + probeX];
          nSamples++;
        }
        if ((done & 3) === 0 && performance.now() - t0 > BUDGET_MS) break;
      }
      if (dye) {
        emitDye();
        const h = done / 2;
        advect(lat, pxA, pyA, alive, NP, h);
        advect(lat, pxA, pyA, alive, NP, h);
      }
    }
    if (paintDirty) {
      paintDirty = false;
      rebuildColumns();
      measureObstacle();
      setRe((U * D) / nu);
      reSlider.set(Math.round(Re), false);
      touched = true;
    }
    drawField();
    drawRelief();
    drawDye();

    slow += dt;
    anaT += dt;
    if (anaT > 0.5) {
      anaT = 0;
      analyse();
    }
    if (slow > 0.25) {
      slow = 0;
      const ms = lat.maxSpeed();
      if (!(ms < 0.45)) {
        unstable = true;
        resetFlow();
        unstable = true;
        clearTimeout(unstableTimer);
        unstableTimer = window.setTimeout(() => { unstable = false; }, 1500);
      }
      drawInset();
      updateReadouts();
      updateStatus();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Flow');
  const reSlider = ui.slider({
    key: 'Re', label: 'Reynolds number Re (sets ν)', min: RE_MIN, max: RE_MAX, step: 1, value: Re,
    format: (v) => `${v.toFixed(0)}`,
    onInput: (v) => { touched = true; setRe(v); },
  });
  ui.slider({
    key: 'U', label: 'Inflow speed U (ν fixed)', min: 0.05, max: 0.12, step: 0.005, value: U,
    format: (v) => `${v.toFixed(3)} cells/step`,
    onInput: (v) => { touched = true; setU(v); },
  });
  const obSelect = ui.select<ObstacleKind>({
    key: 'obstacle', label: 'Obstacle', value: obstacle,
    options: [{ value: 'cylinder', label: 'Cylinder' }, { value: 'square', label: 'Square' }, { value: 'airfoil', label: 'Airfoil' }, { value: 'custom', label: 'Painted' }],
    onChange: (v) => {
      touched = true;
      if (v === 'custom') {
        setPaintToggle(true);
        return;
      }
      if (paintMode) setPaintToggle(false);
      setObstacle(v);
    },
  });
  ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; pauseBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset flow', key: 'reset', onClick: () => { touched = true; seed++; resetFlow(); } },
  ]);
  const pauseBtn = ui.root.querySelector('.ctl-buttons .btn.primary') as HTMLButtonElement;
  ui.slider({ key: 'spf', label: 'Sim speed', min: 4, max: 60, step: 1, value: spf, format: (v) => `${v} steps/frame`, onInput: (v) => { spf = v; } });

  ui.section('View');
  ui.select<Field>({
    key: 'field', label: 'Colour shows', value: field,
    options: [{ value: 'vorticity', label: 'Vorticity (spin)' }, { value: 'speed', label: 'Speed' }],
    onChange: (v) => { field = v; paintLegend(); },
  });
  ui.toggle({ key: 'relief', label: 'Height relief', value: relief, onChange: (v) => { relief = v; } });
  ui.toggle({ key: 'dye', label: 'Dye tracer', value: dye, onChange: (v) => { dye = v; if (!v) alive.fill(0); } });
  const paintToggle = ui.toggle({ key: 'paint', label: 'Paint obstacle', value: false, onChange: (v) => { touched = true; if (v) setPaint(true); else setPaint(false); } });
  function setPaintToggle(v: boolean): void {
    paintToggle.set(v, false);
    setPaint(v);
  }
  ui.buttons([
    {
      label: 'Clear obstacle', key: 'paint', onClick: () => {
        touched = true;
        if (!paintMode) setPaintToggle(true);
        clearSolids();
      },
    },
  ]);
  ui.note('Painting fixes the camera. Drag on the sheet to add solid cells, and hold Shift to erase. Turn painting off to orbit again.');

  ui.section('Measurements');
  const rNu = ui.readout('nu', 'ν, τ');
  const rD = ui.readout('obstacle', 'width D', 'cells');
  const rF = ui.readout('f', 'shedding f', '/1000 steps');
  const rSt = ui.readout('St', 'Strouhal St');
  const rRef = ui.readout('StRef', 'St, Williamson fit');
  const rAmp = ui.readout('amp', 'probe rms v / U');
  const rT = ui.readout('tstar', 'time t U / D');
  const rRho = ui.readout('rho', 'max |ρ − 1|');
  ui.note('The Williamson fit, St = 0.2175 − 5.106/Re, is an experimental fit for a free cylinder, 50 < Re < 180. The max |ρ − 1| readout checks the near-incompressible assumption. It should stay at a few percent or less.');

  function updateReadouts(): void {
    rNu(`${nu.toFixed(4)}, ${lat.tau.toFixed(3)}`);
    rD(String(D));
    rF(amp > AMP_SHED && specLen >= 256 ? ((St * U) / D * 1000).toFixed(2) : '…');
    rSt(stValid ? St.toFixed(3) : amp > AMP_SHED && specLen >= 256 ? `${St.toFixed(3)} (settling)` : '…');
    rRef(obstacle === 'cylinder' && Re >= 50 && Re <= 180 ? williamsonSt(Re).toFixed(3) : 'n/a');
    rAmp(amp.toFixed(amp < 0.01 ? 4 : 3));
    rT((((lat.steps - changeStep) * U) / D).toFixed(0));
    let dr = 0;
    for (let k = NX; k < N - NX; k += 3) {
      if (lat.solid[k]) continue;
      const d = Math.abs(lat.rho[k] - 1);
      if (d > dr) dr = d;
    }
    rRho(`${(dr * 100).toFixed(1)} %`);
  }

  // --- Start
  setObstacle('cylinder');
  rebuildObstacleMesh();
  drawField();
  drawRelief();
  drawInset();
  updateReadouts();
  updateStatus();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && paintMode) setPaintToggle(false);
  };
  window.addEventListener('keydown', onKey);

  return {
    state: () => ({
      Re: Math.round(Re), U, nu, D, obstacle, field, relief, dye, paint: paintMode, touched,
      St: stValid ? St : 0,
      stValid,
      amp,
      settled: isSettled(),
      shedding: isShedding(),
      steady: isSteady(),
      steadyReMax,
      shedReMin,
      painted: obstacle === 'custom' ? painted : 0,
      steps: lat.steps,
    }),
    dispose: () => {
      clearTimeout(unstableTimer);
      window.removeEventListener('keydown', onKey);
      cvs.removeEventListener('pointerdown', onDown);
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerup', onUp);
      cvs.removeEventListener('pointercancel', onUp);
      inset.remove();
      legend.remove();
      hint.remove();
      tex.dispose();
      colGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'karman-street',
  number: 63,
  title: 'The Kármán Vortex Street',
  domain: 'fluids',
  level: 2,
  status: 'live',
  tagline: 'Why flags flutter and wires sing in the wind.',
  content,
  mount,
};

export default topic;
