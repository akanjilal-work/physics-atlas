import * as THREE from 'three';
import { createStage, makeArrow, PALETTE } from '../../core/stage.ts';
import { Panel, css, type SliderSpec } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  bcsGap,
  criticalField,
  E_CHARGE,
  imageForce,
  levitationHeight,
  londonLambda,
  magnetMoment,
  MATERIALS,
  PHI0,
  resistanceShape,
  stepMagnet,
  surfaceFieldMax,
  traceLine,
  triangularLattice,
  vortexSpacing,
  G,
  type MagnetParams,
  type MagnetState,
  type Material,
  type MaterialId,
} from './physics.ts';

type View = 'levitate' | 'vortex';

// --- Levitation model (SI). Scene units are centimetres.
const MAG_V = 1e-6; // 1 cm^3 cube
const MAG_M = 7.5e-3; // kg (NdFeB)
const Z_REST = 0.005; // centre height when resting, m
const H_STEP = 1e-4; // integrator step, s
const SLOW = 0.35; // sim seconds per real second
const DISC_R = 4.2;
const DISC_H = 0.6;

// --- Field lines
const THETAS = [0.13, 0.18, 0.25, 0.34, 0.47, 0.66];
const NAZ = 8;
const MAXP = 520;
const R0 = 0.55;
const DS = 0.07;

// --- Vortex view: 1 scene unit = 100 nm
const NM_PER_UNIT = 100;
const PLATE_HALF = 6;
const LATTICE_HALF = 5.7;
const BOX_HALF = 2.5;
const VCAP = 600;
const RING_DOTS = 10;

const VIEW_CAM: Record<View, { cam: [number, number, number]; target: [number, number, number] }> = {
  levitate: { cam: [9.6, 5.6, 13.6], target: [0, 1.0, 0] },
  vortex: { cam: [0, 19, 7.5], target: [0, 0, 0.6] },
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const fmtB = (b: number) => (b >= 1 ? `${b.toFixed(b >= 10 ? 0 : 2)} T` : `${(b * 1e3).toFixed(b < 0.01 ? 2 : 1)} mT`);
const fmtT = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: VIEW_CAM.levitate.cam, target: VIEW_CAM.levitate.target, fov: 40 });
  const { scene } = stage;
  const glowTex = glowTexture();

  // ---------------------------------------------------------------- state
  let matId: MaterialId = 'Hg';
  let mat: Material = MATERIALS[matId];
  let T = 1.25 * mat.Tc;
  let Br = 1.2;
  let view: View = 'levitate';
  let Bin = 0.08; // mean flux density inside, T (vortex view)
  let guess = 0;
  let guessTouched = false;
  let touched = false;

  const mag: MagnetState = { z: Z_REST, v: 0 };
  const prm: MagnetParams = { m: magnetMoment(Br, MAG_V), M: MAG_M, zRest: Z_REST, s: 0, damp: 6, kPin: 0, zPin: 0, dampPin: 30 };
  let sTarget = 0;
  let u = 0; // visual Meissner fraction; the image strength is u^4 so the lift stays gentle
  let meissnerOK = false;
  let pinned = false;
  let settleClock = 0;
  let floating = false;
  let floatTime = 0;
  let groundClock = 0;
  let liftedByUser = false;
  let droppedByUser = false;
  let frost = 0; // visual coldness 0..1
  let nBox = 0;
  let nVort = 0;
  let vortexMsg = '';

  // Temperature glides (intro and buttons)
  // Glides run on wall-clock time so the intro finishes on time even at low frame rates.
  let glide: null | { from: number; to: number; t0: number; dur: number } = { from: T, to: 0.45 * mat.Tc, t0: performance.now() + 800, dur: 2.6 };

  // ---------------------------------------------------------------- levitation scene
  const lev = new THREE.Group();
  scene.add(lev);

  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(DISC_R + 0.55, DISC_R + 0.35, 1.0, 96),
    new THREE.MeshStandardMaterial({ color: 0x1b2334, metalness: 0.7, roughness: 0.35 }),
  );
  dish.position.y = -DISC_H - 0.3;
  lev.add(dish);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x8a93a6, metalness: 0.55, roughness: 0.45, transparent: true, opacity: 0.72, emissive: 0x000000 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 96), discMat);
  disc.position.y = -DISC_H / 2;
  lev.add(disc);
  const rimMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(DISC_R, 0.035, 8, 128), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  lev.add(rim);

  // Frost: fixed sparkles on the top surface
  const FROST_N = 1500;
  const frostPos = new Float32Array(FROST_N * 3);
  for (let i = 0; i < FROST_N; i++) {
    const r = DISC_R * Math.sqrt(Math.random()) * 0.99;
    const a = Math.random() * Math.PI * 2;
    frostPos[i * 3] = r * Math.cos(a);
    frostPos[i * 3 + 1] = 0.015 + Math.random() * 0.03;
    frostPos[i * 3 + 2] = r * Math.sin(a);
  }
  const frostGeo = new THREE.BufferGeometry();
  frostGeo.setAttribute('position', new THREE.BufferAttribute(frostPos, 3));
  const frostMat = new THREE.PointsMaterial({ color: 0xeaf6ff, size: 0.07, map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  lev.add(new THREE.Points(frostGeo, frostMat));

  // Cold mist rolling off the rim
  const MIST_N = 180;
  const mistPos = new Float32Array(MIST_N * 3);
  const mistVel = new Float32Array(MIST_N * 3);
  const mistLife = new Float32Array(MIST_N);
  const spawnMist = (i: number, age: number) => {
    const a = Math.random() * Math.PI * 2;
    const r = DISC_R + 0.1 + Math.random() * 0.4;
    mistPos[i * 3] = r * Math.cos(a);
    mistPos[i * 3 + 1] = -0.05 + Math.random() * 0.15;
    mistPos[i * 3 + 2] = r * Math.sin(a);
    const sp = 0.25 + Math.random() * 0.25;
    mistVel[i * 3] = sp * Math.cos(a);
    mistVel[i * 3 + 1] = -0.12 - Math.random() * 0.1;
    mistVel[i * 3 + 2] = sp * Math.sin(a);
    mistLife[i] = age;
  };
  for (let i = 0; i < MIST_N; i++) spawnMist(i, Math.random() * 4);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistMat = new THREE.PointsMaterial({ color: 0xbfe3ff, size: 0.9, map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const mist = new THREE.Points(mistGeo, mistMat);
  mist.frustumCulled = false;
  lev.add(mist);

  // Magnet
  const magnet = new THREE.Group();
  lev.add(magnet);
  const nMat = new THREE.MeshStandardMaterial({ color: PALETTE.rose, emissive: 0x7a1540, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 });
  const sMat = new THREE.MeshStandardMaterial({ color: 0x6c8cff, emissive: 0x16266e, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.35 });
  const halfBox = new THREE.BoxGeometry(1, 0.5, 1);
  const nBlock = new THREE.Mesh(halfBox, nMat);
  nBlock.position.y = 0.25;
  const sBlock = new THREE.Mesh(halfBox.clone(), sMat);
  sBlock.position.y = -0.25;
  magnet.add(nBlock, sBlock);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb0d0, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(4.2);
  magnet.add(halo);
  const magLight = new THREE.PointLight(0xffc0dc, 2.2, 8, 1.6);
  magLight.position.y = -0.4;
  magnet.add(magLight);
  stage.label('N', [0, 0.25, 0.62], 'muted', magnet);
  stage.label('S', [0, -0.25, 0.62], 'muted', magnet);
  const statusLabel = stage.label('', [1.9, 0.1, 0], '', magnet);

  // Field lines: packed LineSegments, rebuilt when the magnet moves or the Meissner fraction changes
  const MAXV = THETAS.length * NAZ * MAXP * 2;
  const linePos = new Float32Array(MAXV * 3);
  const lineCol = new Float32Array(MAXV * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
  lineGeo.setDrawRange(0, 0);
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
  const fieldLines = new THREE.LineSegments(lineGeo, lineMat);
  fieldLines.frustumCulled = false;
  lev.add(fieldLines);
  const trace = new Float32Array(MAXP * 2);
  const cosAz = new Float32Array(NAZ);
  const sinAz = new Float32Array(NAZ);
  for (let k = 0; k < NAZ; k++) {
    const a = ((k + 0.5) / NAZ) * Math.PI * 2;
    cosAz[k] = Math.cos(a);
    sinAz[k] = Math.sin(a);
  }
  const lineBase = new THREE.Color(PALETTE.cyan);
  const lineInside = new THREE.Color(PALETTE.violet);
  let lastYm = -1;
  let lastS = -1;

  function rebuildLines(): void {
    const ym = mag.z * 100;
    const s = u;
    if (Math.abs(ym - lastYm) < 0.002 && Math.abs(s - lastS) < 0.002) return;
    lastYm = ym;
    lastS = s;
    let v = 0;
    for (const th of THETAS) {
      const n = traceLine(ym, s, th, R0, DS, trace, MAXP);
      for (let k = 0; k < NAZ; k++) {
        const c = cosAz[k];
        const sn = sinAz[k];
        for (let i = 0; i + 1 < n; i++) {
          for (let e = 0; e < 2; e++) {
            const rho = trace[(i + e) * 2];
            const y = trace[(i + e) * 2 + 1];
            const o = v * 3;
            linePos[o] = rho * c;
            linePos[o + 1] = y;
            linePos[o + 2] = rho * sn;
            const d = Math.hypot(rho, y - ym);
            const b = 0.85 / (1 + d * 0.2);
            const col = y < 0 ? lineInside : lineBase;
            lineCol[o] = col.r * b;
            lineCol[o + 1] = col.g * b;
            lineCol[o + 2] = col.b * b;
            v++;
          }
        }
      }
    }
    lineGeo.setDrawRange(0, v);
    (lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // Pinned flux tubes (Type II, schematic)
  const tubeGroup = new THREE.Group();
  lev.add(tubeGroup);
  const tubeMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const tubeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true);
  const tubes: THREE.Mesh[] = [];
  const TUBE_XY: [number, number][] = [[0, 0]];
  for (let k = 0; k < 6; k++) TUBE_XY.push([0.75 * Math.cos((k * Math.PI) / 3), 0.75 * Math.sin((k * Math.PI) / 3)]);
  for (let k = 0; k < 6; k++) TUBE_XY.push([1.35 * Math.cos(((k + 0.5) * Math.PI) / 3), 1.35 * Math.sin(((k + 0.5) * Math.PI) / 3)]);
  for (const [x, z] of TUBE_XY) {
    const t = new THREE.Mesh(tubeGeo, tubeMat);
    t.position.set(x, 0, z);
    tubeGroup.add(t);
    tubes.push(t);
  }
  const tubeLabel = stage.label('pinned flux tubes (schematic)', [2.3, -0.2, 1.6], 'muted', tubeGroup);

  const discLabel = stage.label('', [DISC_R + 0.6, -1.1, 1.2], 'muted', lev);

  // ---------------------------------------------------------------- vortex scene
  const vort = new THREE.Group();
  vort.visible = false;
  scene.add(vort);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xa9c4de, metalness: 0.2, roughness: 0.8, transparent: true, opacity: 0.55, depthWrite: false });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE_HALF * 2, 0.5, PLATE_HALF * 2), plateMat);
  plate.position.y = -0.25;
  vort.add(plate);
  const plateEdges = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), new THREE.LineBasicMaterial({ color: 0x3a4a6a }));
  plateEdges.position.copy(plate.position);
  vort.add(plateEdges);

  const vTubeMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const vTubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true), vTubeMat, VCAP);
  vTubes.count = 0;
  vTubes.frustumCulled = false;
  vort.add(vTubes);
  const vCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const vCores = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), vCoreMat, VCAP);
  vCores.count = 0;
  vCores.frustumCulled = false;
  vort.add(vCores);

  // Swirling supercurrents: points orbit each core in the vertex shader (no per-frame CPU work)
  const SW_N = VCAP * RING_DOTS * 2;
  const swC = new Float32Array(SW_N * 3);
  const swPh = new Float32Array(SW_N);
  const swGeo = new THREE.BufferGeometry();
  swGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SW_N * 3), 3));
  swGeo.setAttribute('aC', new THREE.BufferAttribute(swC, 3));
  swGeo.setAttribute('aPh', new THREE.BufferAttribute(swPh, 1));
  swGeo.setDrawRange(0, 0);
  const swMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uSize: { value: 8 * Math.min(window.devicePixelRatio, 2) }, uColor: { value: new THREE.Color(PALETTE.amber) } },
    vertexShader: `
      attribute vec3 aC; attribute float aPh;
      uniform float uT; uniform float uSize;
      varying float vF;
      void main() {
        float a = aPh + uT * 0.9 / (aC.z * aC.z + 0.08);
        vec3 p = vec3(aC.x + aC.z * cos(a), 0.04, aC.y - aC.z * sin(a));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * 12.0 / -mv.z;
        vF = 0.55 + 0.45 * sin(a * 3.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vF;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, (1.0 - d * 2.0) * vF);
      }`,
  });
  const swirl = new THREE.Points(swGeo, swMat);
  swirl.frustumCulled = false;
  vort.add(swirl);

  const boxPts = new Float32Array([
    -BOX_HALF, 0.03, -BOX_HALF, BOX_HALF, 0.03, -BOX_HALF,
    BOX_HALF, 0.03, -BOX_HALF, BOX_HALF, 0.03, BOX_HALF,
    BOX_HALF, 0.03, BOX_HALF, -BOX_HALF, 0.03, BOX_HALF,
    -BOX_HALF, 0.03, BOX_HALF, -BOX_HALF, 0.03, -BOX_HALF,
  ]);
  const boxGeo = new THREE.BufferGeometry();
  boxGeo.setAttribute('position', new THREE.BufferAttribute(boxPts, 3));
  const box = new THREE.LineSegments(boxGeo, new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.25, gapSize: 0.18 }));
  box.computeLineDistances();
  vort.add(box);
  stage.label('500 nm box: count the vortices', [0, 0.1, -BOX_HALF - 0.45], '', vort).element.style.color = css(PALETTE.amber);
  vort.add(makeArrow(new THREE.Vector3(0, 1, 0), 2.2, PALETTE.cyan, new THREE.Vector3(-PLATE_HALF + 0.6, 0, -PLATE_HALF + 0.6)));
  stage.label('B', [-PLATE_HALF + 0.6, 2.6, -PLATE_HALF + 0.6], 'big', vort);
  const scaleBar = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(3.8, 0.02, PLATE_HALF + 0.5), new THREE.Vector3(4.8, 0.02, PLATE_HALF + 0.5)]),
    new THREE.LineBasicMaterial({ color: 0xdfe6f3 }),
  );
  vort.add(scaleBar);
  stage.label('100 nm', [4.3, 0, PLATE_HALF + 0.95], 'muted', vort);
  const vortexLabel = stage.label('', [0, 1.4, 0], 'big', vort);

  const latt = new Float32Array(VCAP * 2);
  const lattTry = new Float32Array(VCAP * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qFlat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const tp = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  let vortexKey = '';

  function boxMargin(n: number, pts: Float32Array): number {
    let worst = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = Math.abs(Math.abs(pts[i * 2]) - BOX_HALF);
      const dy = Math.abs(Math.abs(pts[i * 2 + 1]) - BOX_HALF);
      const inX = Math.abs(pts[i * 2]) < BOX_HALF + 0.6;
      const inY = Math.abs(pts[i * 2 + 1]) < BOX_HALF + 0.6;
      if (inY) worst = Math.min(worst, dx);
      if (inX) worst = Math.min(worst, dy);
    }
    return worst;
  }

  function rebuildVortices(): void {
    const Tc = mat.Tc;
    const Bc2 = criticalField(T, mat.Bc0, Tc);
    const key = `${matId}|${Bin.toFixed(4)}|${(T / Tc).toFixed(3)}`;
    if (key === vortexKey) return;
    vortexKey = key;
    let n = 0;
    nBox = 0;
    if (mat.type === 1) vortexMsg = 'Hg is Type I: no vortex lattice';
    else if (T >= Tc) vortexMsg = 'T > Tc: normal metal, field passes freely';
    else if (Bin >= Bc2) vortexMsg = `B above B_c2(T) = ${fmtB(Bc2)}: cores overlap, normal`;
    else vortexMsg = '';
    if (!vortexMsg) {
      const a = vortexSpacing(Bin) * 1e9 / NM_PER_UNIT;
      // Choose the lattice offset that keeps every vortex clearly inside or outside the box.
      let best = -1;
      let bx = 0;
      let by = 0;
      const dy = (a * Math.sqrt(3)) / 2;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const ox = (i / 8) * a;
          const oy = (j / 8) * dy * 2;
          const m = triangularLattice(a, LATTICE_HALF, ox, oy, lattTry, VCAP);
          const g = boxMargin(m, lattTry);
          if (g > best) { best = g; bx = ox; by = oy; }
        }
      }
      n = triangularLattice(a, LATTICE_HALF, bx, by, latt, VCAP);
      const r = 1 - T / Tc;
      const xi = (mat.xi0 * 1e9) / NM_PER_UNIT / Math.sqrt(Math.max(r, 1e-3));
      const lam = (londonLambda(T, mat.lambda0, Tc) * 1e9) / NM_PER_UNIT;
      const rc = Math.max(0.08, Math.min(0.3 * a, xi));
      const rs = Math.max(rc + 0.12, Math.min(0.36 * a, lam));
      for (let i = 0; i < n; i++) {
        const x = latt[i * 2];
        const z = latt[i * 2 + 1];
        if (Math.abs(x) < BOX_HALF && Math.abs(z) < BOX_HALF) nBox++;
        m4.compose(tp.set(x, 0.3, z), q.identity(), sc3.set(rc, 1.6, rc));
        vTubes.setMatrixAt(i, m4);
        m4.compose(tp.set(x, 0.035, z), qFlat, sc3.set(rc * 5, rc * 5, 1));
        vCores.setMatrixAt(i, m4);
        for (let ring = 0; ring < 2; ring++) {
          const rr = ring === 0 ? rc + 0.45 * (rs - rc) : rs;
          for (let k = 0; k < RING_DOTS; k++) {
            const idx = (i * 2 + ring) * RING_DOTS + k;
            swC[idx * 3] = x;
            swC[idx * 3 + 1] = z;
            swC[idx * 3 + 2] = rr;
            swPh[idx] = (k / RING_DOTS) * Math.PI * 2 + ring * 0.4;
          }
        }
      }
    }
    nVort = n;
    vTubes.count = n;
    vCores.count = n;
    vTubes.instanceMatrix.needsUpdate = true;
    vCores.instanceMatrix.needsUpdate = true;
    swGeo.setDrawRange(0, n * 2 * RING_DOTS);
    (swGeo.attributes.aC as THREE.BufferAttribute).needsUpdate = true;
    (swGeo.attributes.aPh as THREE.BufferAttribute).needsUpdate = true;
    vortexLabel.element.textContent = vortexMsg;
    vortexLabel.visible = !!vortexMsg;
    plateMat.color.set(T < Tc ? 0xa9c4de : 0x8a93a6);
  }

  // ---------------------------------------------------------------- overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const mkInset = (top: number) => {
    const c = document.createElement('canvas');
    c.width = 440;
    c.height = 180;
    Object.assign(c.style, {
      position: 'absolute', right: '10px', top: `${top}px`, width: '220px', height: '90px',
      background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    } as CSSStyleDeclaration);
    viewport.appendChild(c);
    return c;
  };
  const rInset = mkInset(10);
  const lInset = mkInset(108);
  const rctx = rInset.getContext('2d')!;
  const lctx = lInset.getContext('2d')!;
  let insetKey = '';

  function drawInsets(): void {
    const key = `${matId}|${T.toFixed(3)}`;
    if (key === insetKey) return;
    insetKey = key;
    const W = 440;
    const Hh = 180;
    const Tc = mat.Tc;
    // --- R(T)
    rctx.clearRect(0, 0, W, Hh);
    rctx.font = '22px JetBrains Mono, monospace';
    rctx.fillStyle = '#8391ab';
    rctx.fillText(`resistance R(T), ${matId}`, 16, 30);
    const x0 = 20;
    const x1 = W - 20;
    const yTop = 52;
    const yBot = Hh - 26;
    const xOf = (t: number) => x0 + (t / (1.6 * Tc)) * (x1 - x0);
    const yOf = (r: number) => yBot - r * (yBot - yTop);
    rctx.strokeStyle = '#243049';
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.moveTo(x0, yBot);
    rctx.lineTo(x1, yBot);
    rctx.stroke();
    rctx.setLineDash([6, 6]);
    rctx.beginPath();
    rctx.moveTo(xOf(Tc), yTop - 6);
    rctx.lineTo(xOf(Tc), yBot);
    rctx.stroke();
    rctx.setLineDash([]);
    rctx.fillStyle = '#56627c';
    rctx.fillText(`Tc ${fmtT(Tc)} K`, Math.min(xOf(Tc) + 8, x1 - 150), yBot - 8);
    rctx.fillText('0 K', x0, Hh - 2);
    rctx.strokeStyle = css(PALETTE.cyan);
    rctx.lineWidth = 3;
    rctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * 1.6 * Tc;
      const x = xOf(t);
      const y = yOf(resistanceShape(t, mat));
      if (i === 0) rctx.moveTo(x, y);
      else rctx.lineTo(x, y);
    }
    rctx.stroke();
    const rNow = resistanceShape(T, mat);
    rctx.fillStyle = css(PALETTE.amber);
    rctx.beginPath();
    rctx.arc(xOf(Math.min(T, 1.6 * Tc)), yOf(rNow), 8, 0, Math.PI * 2);
    rctx.fill();
    rctx.font = '600 22px JetBrains Mono, monospace';
    rctx.fillText(T < Tc ? 'R = 0' : 'R > 0', W - 110, 30);

    // --- London decay
    lctx.clearRect(0, 0, W, Hh);
    lctx.font = '22px JetBrains Mono, monospace';
    lctx.fillStyle = '#8391ab';
    lctx.fillText('inside: B = B₀ e^(−x/λ)', 16, 30);
    const lam = londonLambda(T, mat.lambda0, Tc);
    const xmax = 6 * mat.lambda0;
    const lx0 = 30;
    const lx1 = W - 20;
    const ly0 = 48;
    const ly1 = Hh - 26;
    const lxOf = (x: number) => lx0 + (x / xmax) * (lx1 - lx0);
    const lyOf = (b: number) => ly1 - b * (ly1 - ly0);
    // Sample region shading
    lctx.fillStyle = 'rgba(79,209,232,0.08)';
    lctx.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
    lctx.strokeStyle = '#243049';
    lctx.lineWidth = 2;
    lctx.beginPath();
    lctx.moveTo(lx0, ly0 - 4);
    lctx.lineTo(lx0, ly1);
    lctx.lineTo(lx1, ly1);
    lctx.stroke();
    lctx.fillStyle = css(PALETTE.cyan);
    lctx.globalAlpha = 0.25;
    lctx.beginPath();
    lctx.moveTo(lx0, ly1);
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * xmax;
      const b = Number.isFinite(lam) ? Math.exp(-x / lam) : 1;
      lctx.lineTo(lxOf(x), lyOf(b));
    }
    lctx.lineTo(lx1, ly1);
    lctx.closePath();
    lctx.fill();
    lctx.globalAlpha = 1;
    lctx.strokeStyle = css(PALETTE.cyan);
    lctx.lineWidth = 3;
    lctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * xmax;
      const b = Number.isFinite(lam) ? Math.exp(-x / lam) : 1;
      if (i === 0) lctx.moveTo(lxOf(x), lyOf(b));
      else lctx.lineTo(lxOf(x), lyOf(b));
    }
    lctx.stroke();
    lctx.fillStyle = '#56627c';
    lctx.fillText(`depth x → ${Math.round(xmax * 1e9)} nm`, lx1 - 250, Hh - 2);
    if (Number.isFinite(lam) && lam < xmax) {
      lctx.setLineDash([6, 6]);
      lctx.strokeStyle = css(PALETTE.amber);
      lctx.beginPath();
      lctx.moveTo(lxOf(lam), ly0);
      lctx.lineTo(lxOf(lam), ly1);
      lctx.stroke();
      lctx.setLineDash([]);
    }
    lctx.font = '600 22px JetBrains Mono, monospace';
    lctx.fillStyle = css(PALETTE.amber);
    lctx.fillText(Number.isFinite(lam) ? `λ = ${Math.round(lam * 1e9)} nm` : 'field fills metal', W - 230, 72);
  }

  let legendKey = '';
  function drawLegend(): void {
    const key = `${view}|${mat.type}`;
    if (key === legendKey) return;
    legendKey = key;
    const cy = css(PALETTE.cyan);
    const vi = css(PALETTE.violet);
    const am = css(PALETTE.amber);
    if (view === 'levitate') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Meissner levitation</div>
<div><span style="color:${cy}">Cyan lines</span>: the magnet's field. <span style="color:${vi}">Violet</span> where it runs inside the disc.</div>
<div style="margin-top:4px">Below T<sub>c</sub> the disc expels the field. The lines squeeze around it and push the magnet up.</div>
<div style="margin-top:4px">Above T<sub>c</sub> the lines pass straight through and the magnet falls.</div>
${mat.type === 2 ? `<div style="margin-top:4px"><span style="color:${cy}">Thin tubes</span>: pinned flux, which locks the magnet (schematic).</div>` : ''}
<div style="margin-top:4px;color:#8391ab">Motion slowed about 3×.</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Type II vortex lattice</div>
<div><span style="color:${cy}">Each tube</span> carries one flux quantum Φ₀ = h/2e.</div>
<div style="margin-top:4px"><span style="color:${am}">Dots</span>: supercurrent circling each core, out to about λ.</div>
<div style="margin-top:4px">Tubes per area = B/Φ₀, packed in triangles.</div>
<div style="margin-top:4px;color:#8391ab">Top view of a 1.2 µm square. Cores drawn wider than life.</div>`;
    }
  }

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'levitate', label: 'Levitation' }, { value: 'vortex', label: 'Type II vortices' }],
    onChange: (v) => setView(v),
  });
  ui.select<MaterialId>({
    key: 'mat', label: 'Material', value: matId,
    options: [{ value: 'Hg', label: 'Hg 4.15 K' }, { value: 'Nb', label: 'Nb 9.3 K' }, { value: 'YBCO', label: 'YBCO 92 K' }],
    onChange: (v) => setMaterial(v),
  });
  ui.buttons([
    { label: 'Cool to 0.4 Tc', primary: true, key: 'T', onClick: () => { touched = true; glide = { from: T, to: 0.4 * mat.Tc, t0: performance.now(), dur: 1.8 }; } },
    { label: 'Warm to 1.2 Tc', key: 'T', onClick: () => { touched = true; glide = { from: T, to: 1.2 * mat.Tc, t0: performance.now(), dur: 1.8 }; } },
  ]);

  ui.section('Controls');
  const tSpec: SliderSpec = {
    key: 'T', label: 'Temperature T', min: 0, max: 1.6 * mat.Tc, step: mat.Tc / 400, value: T, unit: 'K', format: fmtT,
    onInput: (v) => { touched = true; glide = null; T = v; },
  };
  const tCtl = ui.slider(tSpec);
  const tInput = tCtl.el.querySelector('input') as HTMLInputElement;
  const brCtl = ui.slider({
    key: 'Br', label: 'Magnet strength B_r', min: 0.3, max: 1.4, step: 0.01, value: Br, unit: 'T',
    onInput: (v) => { touched = true; Br = v; prm.m = magnetMoment(Br, MAG_V); },
  });
  const nudgeRow = ui.buttons([{ label: 'Nudge magnet down', key: 'z', onClick: () => { touched = true; mag.v -= 0.22; } }]);
  const binCtl = ui.slider({
    key: 'Bin', label: 'Field inside B', min: 0.02, max: 0.25, step: 0.005, value: Bin, unit: 'T',
    onInput: (v) => { touched = true; Bin = v; },
  });
  const guessCtl = ui.slider({
    key: 'guess', label: 'Your count (vortices in box)', min: 0, max: 40, step: 1, value: guess,
    onInput: (v) => { guess = v; guessTouched = true; },
  });

  ui.section('Live readouts');
  const rPhase = ui.readout('phase', 'state');
  const rTTc = ui.readout('TTc', 'T / Tc');
  const rBc = ui.readout('Bc', 'critical field B_c(T)');
  const rBs = ui.readout('Bsurf', 'peak B at surface');
  const rZ = ui.readout('z', 'gap under magnet', 'cm');
  const rZeq = ui.readout('zcheck', 'height ÷ theory');
  const rLam = ui.readout('lambda', 'London depth λ_L');
  const rGap = ui.readout('gap', 'BCS gap Δ(T)');
  const rPhi = ui.readout('phi0', 'flux per vortex Φ₀');
  const rA = ui.readout('spacing', 'vortex spacing a');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'magnetic field' },
    { color: css(PALETTE.violet), label: 'field inside the disc' },
    { color: css(PALETTE.amber), label: 'supercurrent' },
  ]);
  ui.note('The critical field is the thermodynamic B<sub>c</sub> for Type I (Hg) and the upper field B<sub>c2</sub> for Type II (Nb, YBCO).');

  function showRows(): void {
    const lv = view === 'levitate';
    brCtl.el.style.display = lv ? '' : 'none';
    (nudgeRow[0].parentElement as HTMLElement).style.display = lv ? '' : 'none';
    binCtl.el.style.display = lv ? 'none' : '';
    guessCtl.el.style.display = lv ? 'none' : '';
  }

  function setView(v: View): void {
    view = v;
    lev.visible = v === 'levitate';
    vort.visible = v === 'vortex';
    stage.flyTo(VIEW_CAM[v].cam, VIEW_CAM[v].target, 1.2);
    showRows();
    legendKey = '';
    vortexKey = '';
  }

  function setMaterial(id: MaterialId): void {
    touched = true;
    const oldTc = mat.Tc;
    matId = id;
    mat = MATERIALS[id];
    T = (T / oldTc) * mat.Tc;
    if (glide) glide = { from: T, to: (glide.to / oldTc) * mat.Tc, t0: performance.now(), dur: glide.dur };
    tSpec.max = 1.6 * mat.Tc;
    tSpec.step = mat.Tc / 400;
    tInput.max = String(tSpec.max);
    tInput.step = String(tSpec.step);
    tCtl.set(T, false);
    // A fresh disc: magnet placed on it, new sample state.
    mag.z = Z_REST;
    mag.v = 0;
    prm.s = 0;
    u = 0;
    pinned = false;
    prm.kPin = 0;
    floating = false;
    wasFloating = false;
    floatTime = 0;
    legendKey = '';
    vortexKey = '';
  }

  // ---------------------------------------------------------------- frame loop
  let simT = 0;
  let wasFloating = false;
  stage.onFrame((dt, t) => {
    if (glide) {
      const u = Math.min(1, (performance.now() - glide.t0) / 1000 / glide.dur);
      if (u > 0) {
        const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        T = glide.from + (glide.to - glide.from) * e;
        tCtl.set(T, false);
        if (u >= 1) glide = null;
      }
    }

    const Tc = mat.Tc;
    const sc = T < Tc;
    const zeqFull = levitationHeight(prm.m, MAG_M);
    const Bc = criticalField(T, mat.Bc0, Tc);
    if (mat.type === 1) meissnerOK = sc && surfaceFieldMax(prm.m, zeqFull) < Bc;
    else meissnerOK = sc;
    sTarget = meissnerOK ? 1 : 0;
    // Expulsion is fast in reality. The fade here is only for the eye.
    u = sTarget > u ? Math.min(sTarget, u + dt * 0.8) : Math.max(sTarget, u - dt * 4);
    prm.s = u ** 4;

    // Qualitative flux pinning for Type II: once the magnet settles, lock its height.
    if (mat.type === 2 && sTarget === 1 && prm.s > 0.97) {
      if (!pinned) {
        settleClock = Math.abs(mag.v) < 0.004 && mag.z > Z_REST + 0.001 ? settleClock + dt : 0;
        if (settleClock > 0.4) {
          pinned = true;
          prm.zPin = mag.z;
        }
      }
    } else {
      pinned = false;
      settleClock = 0;
    }
    prm.kPin = pinned ? 25 * (MAG_M * G / zeqFull) * Math.max(0.05, 1 - T / Tc) : 0;

    const simDt = dt * SLOW;
    const steps = Math.max(1, Math.round(simDt / H_STEP));
    const h = simDt / steps;
    for (let k = 0; k < steps; k++) stepMagnet(mag, prm, h);
    simT += simDt;

    floating = mag.z > Z_REST + 0.001;
    if (floating) {
      floatTime += dt;
      groundClock = 0;
    } else {
      floatTime = 0;
      groundClock += dt;
    }
    if (floating && !wasFloating && touched) liftedByUser = true;
    if (!floating && wasFloating && touched && sTarget === 0) droppedByUser = true;
    wasFloating = floating;

    // --- visuals: levitation
    frost += ((sc ? 1 : 0) - frost) * Math.min(1, dt * 2);
    if (lev.visible) {
      magnet.position.y = mag.z * 100;
      rebuildLines();
      discMat.color.setRGB(0.54 + 0.28 * frost, 0.58 + 0.3 * frost, 0.65 + 0.33 * frost);
      discMat.roughness = 0.45 + 0.45 * frost;
      discMat.metalness = 0.55 - 0.4 * frost;
      discMat.emissive.setRGB(0.02 * frost, 0.07 * frost, 0.12 * frost);
      rimMat.opacity = 0.7 * u;
      frostMat.opacity = 0.9 * frost;
      mistMat.opacity = 0.22 * frost;
      for (let i = 0; i < MIST_N; i++) {
        mistLife[i] += dt;
        if (mistLife[i] > 4) spawnMist(i, 0);
        else {
          mistPos[i * 3] += mistVel[i * 3] * dt;
          mistPos[i * 3 + 1] += mistVel[i * 3 + 1] * dt;
          mistPos[i * 3 + 2] += mistVel[i * 3 + 2] * dt;
        }
      }
      (mistGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const tubeOn = mat.type === 2 ? u : 0;
      tubeMat.opacity = 0.75 * tubeOn;
      tubeGroup.visible = tubeOn > 0.01;
      tubeLabel.visible = tubeGroup.visible;
      const yTop = mag.z * 100 - 0.5;
      const yBot = -DISC_H - 0.05;
      for (const tb of tubes) {
        tb.scale.y = yTop - yBot;
        tb.position.y = (yTop + yBot) / 2;
      }
      halo.material.opacity = 0.35 + 0.08 * Math.sin(t * 2.2);
      const gap = (mag.z - Z_REST) * 100;
      let st: string;
      if (!floating) st = sc ? (meissnerOK ? 'lifting…' : 'resting: B above B_c') : 'resting: T > Tc';
      else if (pinned) st = `locked by flux pinning, ${gap.toFixed(1)} cm up`;
      else st = `floating ${gap.toFixed(1)} cm up`;
      if (statusLabel.element.textContent !== st) statusLabel.element.textContent = st;
      const dl = `${mat.name} disc: ${sc ? (meissnerOK ? 'superconducting' : 'field too strong') : 'normal metal'}`;
      if (discLabel.element.textContent !== dl) discLabel.element.textContent = dl;
    }
    // --- visuals: vortices
    if (vort.visible) {
      rebuildVortices();
      swMat.uniforms.uT.value = t;
    }

    drawInsets();
    drawLegend();
    updateReadouts(Bc);
  });

  function updateReadouts(Bc: number): void {
    const Tc = mat.Tc;
    const sc = T < Tc;
    rPhase(!sc ? 'normal' : mat.type === 1 ? (meissnerOK ? 'Meissner' : 'intermediate') : view === 'vortex' && !vortexMsg ? 'mixed (vortices)' : 'superconducting');
    rTTc((T / Tc).toFixed(3));
    rBc(fmtB(Bc));
    rBs(fmtB(surfaceFieldMax(prm.m, mag.z)));
    rZ(((mag.z - Z_REST) * 100).toFixed(2));
    const zeq = levitationHeight(prm.m, MAG_M);
    const settled = floating && prm.s === 1 && !pinned && Math.abs(mag.v) < 0.002;
    rZeq(settled ? (mag.z / zeq).toFixed(5) : '…');
    const lam = londonLambda(T, mat.lambda0, Tc);
    rLam(Number.isFinite(lam) ? `${(lam * 1e9).toFixed(0)} nm` : '∞ (normal)');
    rGap(`${((bcsGap(T, Tc) / E_CHARGE) * 1e3).toFixed(3)} meV`);
    rPhi(`${PHI0.toExponential(4)} Wb`);
    rA(view === 'vortex' && !vortexMsg ? `${(vortexSpacing(Bin) * 1e9).toFixed(0)} nm` : '…');
  }

  showRows();
  drawLegend();

  return {
    state: () => {
      const zeq = levitationHeight(prm.m, MAG_M);
      return {
        T,
        Tc: mat.Tc,
        TTc: T / mat.Tc,
        mat: matId,
        view,
        floating,
        floatTime,
        liftedByUser,
        droppedByUser,
        touched,
        pinned,
        gap: (mag.z - Z_REST) * 100,
        zRatio: mag.z / zeq,
        force: (prm.s * imageForce(prm.m, mag.z)) / (MAG_M * G),
        Bsurf: surfaceFieldMax(prm.m, mag.z),
        Bc: criticalField(T, mat.Bc0, mat.Tc),
        Bin,
        nBox,
        nVort,
        guess,
        guessTouched,
        simT,
        grounded: groundClock,
      };
    },
    dispose: () => {
      legend.remove();
      rInset.remove();
      lInset.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'superconductivity',
  number: 38,
  title: 'Superconductivity',
  domain: 'em',
  level: 3,
  status: 'live',
  tagline: 'Zero resistance, and a magnet that floats locked in place.',
  content,
  mount,
};

export default topic;
