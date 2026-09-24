import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AU,
  DF_SIM,
  equatorRange,
  G,
  largestClump,
  launchMoon,
  defaultMoonParams,
  M_MOON,
  M_SUN,
  MOON_H,
  MOON_R,
  moonDistanceAt,
  orbitsDone,
  planetRadiusSim,
  R_EARTH,
  RHO_SATURN,
  relaxedBall,
  ROCHE_FLUID,
  ROCHE_RIGID,
  ROCHE_RIGID_SYNC,
  SIDEREAL_YEAR,
  solarDay,
  spinStep,
  stepMoon,
  sunMoonRatio,
  T_ROCHE,
  tidalApprox,
  tidalField,
  rawPull,
  tideHeight,
  tideScale,
  type Body,
  type MoonSim,
  type SpinState,
} from './physics.ts';

type View = 'tides' | 'roche' | 'locking';
type Arrows = 'off' | 'raw' | 'tidal';

const DEG = Math.PI / 180;
const GM_MOON = G * M_MOON;
const GM_SUN = G * M_SUN;
/** Pin latitude of the tide gauge. */
const PIN_LAT = 20 * DEG;
/** Real seconds per lunar day at speed 1 in the Tides view. */
const LUNAR_DAY_S = 6;
const LUNAR_DAY_H = 24.84;
/** Roche view: sim time units per real second (one orbit at the fluid limit every 8 s). */
const ROCHE_RATE = T_ROCHE / 8;
const N_PART = 300;
const N_GRAIN = 140;
const SPARK_N = 400;
/** Locking view: display orbit period (s) and geologic clock (Myr per s). */
const LOCK_PERIOD = 6;
const GEO_RATE = 31;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A simple stylised Earth: dark ocean, a few land blobs, and a lat-long grid. */
function earthTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#12284a';
  g.fillRect(0, 0, W, H);
  // Land: rough blobs placed by hand so the texture is deterministic.
  const blobs: [number, number, number, number][] = [
    [0.2, 0.3, 0.07, 0.12], [0.24, 0.62, 0.045, 0.14], [0.52, 0.32, 0.06, 0.08], [0.55, 0.58, 0.05, 0.14],
    [0.7, 0.28, 0.12, 0.09], [0.84, 0.66, 0.05, 0.05], [0.5, 0.93, 0.35, 0.05],
  ];
  g.fillStyle = '#3d5a3a';
  for (const [x, y, rx, ry] of blobs) {
    g.beginPath();
    g.ellipse(x * W, y * H, rx * W, ry * H, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(160,190,230,0.25)';
  g.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    g.beginPath();
    g.moveTo((i / 12) * W, 0);
    g.lineTo((i / 12) * W, H);
    g.stroke();
  }
  for (let j = 1; j < 6; j++) {
    g.beginPath();
    g.moveTo(0, (j / 6) * H);
    g.lineTo(W, (j / 6) * H);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bandTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const cols = ['#c9b48a', '#d8c79f', '#b89f72', '#e2d4b0', '#c2a97c', '#d3bf95'];
  for (let j = 0; j < 128; j++) {
    const k = Math.floor((Math.sin(j * 0.21) * 0.5 + 0.5) * 5.99 + (j % 7 === 0 ? 1 : 0)) % cols.length;
    g.fillStyle = cols[k];
    g.fillRect(0, j, 4, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function circle(radius: number, color: number, opacity: number, dashed = false): THREE.Line {
  const n = 256;
  const pts = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts[i * 3] = Math.cos(a);
    pts[i * 3 + 2] = Math.sin(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.03, gapSize: 0.03 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(g, m);
  if (dashed) l.computeLineDistances();
  l.scale.setScalar(radius);
  return l;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM_TIDES: [number, number, number] = [1.2, 5.2, 7.6];
  const TGT_TIDES: [number, number, number] = [1.3, -0.6, 0.9];
  const CAM_ROCHE: [number, number, number] = [0, 6.6, 4.4];
  const TGT_ROCHE: [number, number, number] = [0, -0.4, 0.3];
  const CAM_LOCK: [number, number, number] = [0, 6.4, 6.2];
  const TGT_LOCK: [number, number, number] = [0, -0.6, 0.6];
  const stage = createStage(viewport, { camera: CAM_TIDES, target: TGT_TIDES, fov: 42 });
  const { scene } = stage;
  const glowTex = glowTexture();
  const earthTex = earthTexture();
  const bandTex = bandTexture();

  // --- Parameters
  let view: View = 'tides';
  let playing = true;
  let speed = 1;
  let moonDistRE = 60.3;
  let sunAngle = 45;
  let exagLog = 6.5;
  let arrows: Arrows = 'tidal';
  let body: Body = 'rubble';
  let density = 0.9;
  let orbitSet = 1.3;
  let touched = false;

  // ======================================================================
  // Shared Earth (Tides and Locking views)
  const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
  const earth = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.85, metalness: 0.05 }));
  scene.add(earth);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  pin.position.set(Math.cos(PIN_LAT), Math.sin(PIN_LAT), 0).multiplyScalar(1.01);
  earth.add(pin);

  // ======================================================================
  // View 1: Tides
  const gTides = new THREE.Group();
  scene.add(gTides);

  // Ocean shell: unit directions stored once, radius rebuilt when parameters change.
  const oceanGeo = new THREE.SphereGeometry(1, 128, 64);
  const oPos = oceanGeo.attributes.position as THREE.BufferAttribute;
  const nOcean = oPos.count;
  const oDir = new Float32Array(nOcean * 3);
  for (let i = 0; i < nOcean; i++) {
    const x = oPos.getX(i), y = oPos.getY(i), z = oPos.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    oDir[i * 3] = x / l;
    oDir[i * 3 + 1] = y / l;
    oDir[i * 3 + 2] = z / l;
  }
  const oCol = new Float32Array(nOcean * 3);
  oceanGeo.setAttribute('color', new THREE.BufferAttribute(oCol, 3));
  const ocean = new THREE.Mesh(
    oceanGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.62, roughness: 0.35, metalness: 0.1, depthWrite: false }),
  );
  ocean.renderOrder = 2;
  gTides.add(ocean);

  // Moon and Sun (positions not to scale)
  const moonT = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: 0xb9bfcc, roughness: 0.9 }));
  moonT.scale.setScalar(0.27);
  gTides.add(moonT);
  stage.label('Moon', [0, 0.45, 0], 'muted', moonT);
  const sun = new THREE.Group();
  const sunCore = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  sunCore.scale.setScalar(0.3);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  sunGlow.scale.setScalar(1.5);
  sun.add(sunCore, sunGlow);
  gTides.add(sun);
  stage.label('Sun (390× farther than the Moon)', [0, 0.5, 0], 'muted', sun);
  const sunLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineDashedMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.45, dashSize: 0.15, gapSize: 0.12 }),
  );
  sunLine.computeLineDistances();
  gTides.add(sunLine);
  const moonLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0xb9bfcc, transparent: true, opacity: 0.4, dashSize: 0.15, gapSize: 0.12 }),
  );
  moonLine.computeLineDistances();
  gTides.add(moonLine);
  stage.label('gauge', [0.12, 0.1, 0], 'muted', pin);

  // Arrow field: shafts as line segments, heads as instanced cones.
  const arrowPts: THREE.Vector3[] = [];
  for (const [lat, count] of [[0, 24], [45, 12]] as [number, number][]) {
    for (let k = 0; k < count; k++) {
      const lon = (k / count) * Math.PI * 2;
      const la = lat * DEG;
      arrowPts.push(new THREE.Vector3(Math.cos(la) * Math.cos(lon), Math.sin(la), -Math.cos(la) * Math.sin(lon)));
    }
  }
  const NA = arrowPts.length + 1; // +1 for the centre arrow
  const shaftPos = new Float32Array(NA * 6);
  const shaftGeo = new THREE.BufferGeometry();
  shaftGeo.setAttribute('position', new THREE.BufferAttribute(shaftPos, 3));
  const shafts = new THREE.LineSegments(shaftGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.95, depthTest: false }));
  shafts.renderOrder = 4;
  shafts.frustumCulled = false;
  gTides.add(shafts);
  const headGeo = new THREE.ConeGeometry(0.035, 0.1, 10);
  headGeo.translate(0, -0.05, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), NA);
  heads.renderOrder = 4;
  heads.frustumCulled = false;
  gTides.add(heads);
  const centreLabel = stage.label('pull at centre', [0, -0.25, 0], 'muted', gTides);

  // ======================================================================
  // View 2: Roche
  const gRoche = new THREE.Group();
  scene.add(gRoche);
  const planet = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.8 }));
  gRoche.add(planet);
  stage.label('planet (Saturn’s density)', [0, 0, 1.3], 'muted', gRoche);
  const ringFluid = circle(1, PALETTE.rose, 0.95);
  const ringRigid = circle(1, PALETTE.violet, 0.9);
  const ringSync = circle(1, PALETTE.violet, 0.55, true);
  const ringOrbit = circle(1, PALETTE.cyan, 0.3, true);
  gRoche.add(ringFluid, ringRigid, ringSync, ringOrbit);
  const lblFluid = stage.label('fluid Roche limit', [0, 0, 0], '', gRoche);
  lblFluid.element.style.color = css(PALETTE.rose);
  const lblRigid = stage.label('rigid 1.26', [0, 0, 0], '', gRoche);
  lblRigid.element.style.color = '#c4b5fd';

  const partPos = new Float32Array(N_PART * 3);
  const partCol = new Float32Array(N_PART * 3);
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3));
  const partMat = new THREE.PointsMaterial({ size: 0.09, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const parts = new THREE.Points(partGeo, partMat);
  parts.frustumCulled = false;
  gRoche.add(parts);
  const rock = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.95 }));
  gRoche.add(rock);
  const rockMark = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  rockMark.position.set(-0.9, 0, 0);
  rock.add(rockMark);

  // ======================================================================
  // View 3: Locking
  const gLock = new THREE.Group();
  scene.add(gLock);
  const bulge = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.4 }));
  bulge.scale.set(1.36, 1.06, 1.06);
  bulge.renderOrder = 2;
  gLock.add(bulge);
  const bulgeAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.6, 0, 0), new THREE.Vector3(1.6, 0, 0)]),
    new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.8 }),
  );
  gLock.add(bulgeAxis);
  const lockOrbit = circle(1, 0x56627c, 0.5, true);
  gLock.add(lockOrbit);
  const moonL = new THREE.Group();
  const moonLBody = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: 0xb9bfcc, roughness: 0.9 }));
  moonLBody.scale.set(0.42, 0.3, 0.3);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  face.position.set(-0.42, 0, 0);
  const moonAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.8, 0, 0), new THREE.Vector3(0.8, 0, 0)]),
    new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9 }),
  );
  moonL.add(moonLBody, face, moonAxis);
  gLock.add(moonL);
  stage.label('Moon (shape exaggerated)', [0, 0.55, 0], 'muted', moonL);
  const pointer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0x9aa6bd, transparent: true, opacity: 0.5, dashSize: 0.1, gapSize: 0.08 }),
  );
  pointer.computeLineDistances();
  gLock.add(pointer);
  stage.label('Earth’s bulge, carried ahead (lag exaggerated)', [0, 0, 1.8], 'muted', gLock);

  // ======================================================================
  // Overlays: legend (top-left) and inset (top-right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number | string, shape = '50%') => `<i style="display:inline-block;width:9px;height:9px;border-radius:${shape};margin-right:6px;background:${typeof c === 'number' ? css(c) : c}"></i>`;
  const legendStatus = document.createElement('div');
  Object.assign(legendStatus.style, { marginTop: '4px', color: '#dfe6f3' } as CSSStyleDeclaration);

  function paintLegend(): void {
    let html = '';
    if (view === 'tides') {
      html = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Equilibrium tide, height ×${fmtExag(10 ** exagLog)}</div>
<div>${sw('#7fe3f5')}ocean high ${sw('#1d3f8a')}ocean low</div>
<div>${sw(PALETTE.green, '1px')}${arrows === 'raw' ? 'Moon’s raw pull' : arrows === 'tidal' ? 'tidal field (Moon + Sun)' : 'arrows off'}</div>
<div>${sw(PALETTE.amber)}tide gauge at 20°N</div>`;
    } else if (view === 'roche') {
      html = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Toy N-body moon, ${body === 'rubble' ? `${N_PART} particles` : `solid core + ${N_GRAIN} grains`}</div>
<div>${sw(PALETTE.rose, '1px')}fluid Roche limit (2.44)</div>
<div>${sw(PALETTE.violet, '1px')}rigid 1.26, dashed: spinning 1.44</div>
${body === 'rubble' ? `<div>${sw(PALETTE.amber)}near side ${sw(PALETTE.violet)}far side at start</div>` : `<div>${sw(0x8a8f9c)}solid core ${sw(0xdfe6f3)}loose grains</div>`}`;
    } else {
      html = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Two clocks</div>
<div>${sw(PALETTE.amber, '1px')}Moon spin: toy time-lapse</div>
<div>${sw(PALETTE.cyan, '1px')}Earth day: geologic clock</div>
<div>Amber dot = the face we see.</div>`;
    }
    legend.innerHTML = html;
    legend.appendChild(legendStatus);
  }

  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 220;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '110px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // ======================================================================
  // Tides view logic
  const fmtExag = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : `${Math.round(v / 1e3)} thousand`);
  let km = 0;
  let ks = 0;
  let rangeNow = 0;
  let tideT = 0; // lunar days since start
  const bodyDir = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4();
  const tmpS = new THREE.Vector3();
  const yUp = new THREE.Vector3(0, 1, 0);
  const tmpScale = new THREE.Vector3();
  const field = new Float64Array(3);
  const field2 = new Float64Array(3);
  const cLow = new THREE.Color(0x1d3f8a);
  const cMid = new THREE.Color(0x2f7fc4);
  const cHigh = new THREE.Color(0x9ff0ff);
  const tmpC = new THREE.Color();

  function sunDir(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(sunAngle * DEG), 0, Math.sin(sunAngle * DEG));
  }

  function rebuildTides(): void {
    const dM = moonDistRE * R_EARTH;
    km = tideScale(M_MOON, dM);
    ks = tideScale(M_SUN, AU);
    rangeNow = equatorRange(dM, sunAngle);
    const exag = 10 ** exagLog;
    const sd = sunDir(bodyDir);
    const sx = sd.x, sz = sd.z;
    const hMax = 1.5 * (km + ks);
    for (let i = 0; i < nOcean; i++) {
      const x = oDir[i * 3], y = oDir[i * 3 + 1], z = oDir[i * 3 + 2];
      const h = tideHeight(x, km) + tideHeight(x * sx + z * sz, ks);
      const r = 1.02 + (h * exag) / R_EARTH;
      oPos.setXYZ(i, x * r, y * r, z * r);
      const u = Math.max(0, Math.min(1, (h / hMax) * 0.5 + 0.5));
      if (u < 0.5) tmpC.copy(cLow).lerp(cMid, u / 0.5);
      else tmpC.copy(cMid).lerp(cHigh, (u - 0.5) / 0.5);
      oCol[i * 3] = tmpC.r;
      oCol[i * 3 + 1] = tmpC.g;
      oCol[i * 3 + 2] = tmpC.b;
    }
    oPos.needsUpdate = true;
    (oceanGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    oceanGeo.computeVertexNormals();

    const md = 2.6 + 0.03 * moonDistRE;
    moonT.position.set(md, 0, 0);
    sun.position.copy(sd).multiplyScalar(4.6);
    const sp = sunLine.geometry.attributes.position as THREE.BufferAttribute;
    sp.setXYZ(1, sd.x * 4.2, 0, sd.z * 4.2);
    sp.needsUpdate = true;
    sunLine.computeLineDistances();
    const mp = moonLine.geometry.attributes.position as THREE.BufferAttribute;
    mp.setXYZ(1, md - 0.3, 0, 0);
    mp.needsUpdate = true;
    moonLine.computeLineDistances();
    rebuildArrows();
    paintLegend();
    drawTideInset();
  }

  function setArrow(i: number, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, len: number): void {
    const l = Math.hypot(vx, vy, vz);
    if (l < 1e-30 || len < 0.02) {
      shaftPos.fill(0, i * 6, i * 6 + 6);
      tmpM.makeScale(0, 0, 0);
      heads.setMatrixAt(i, tmpM);
      return;
    }
    const ux = vx / l, uy = vy / l, uz = vz / l;
    const ex = ox + ux * len, ey = oy + uy * len, ez = oz + uz * len;
    shaftPos[i * 6] = ox;
    shaftPos[i * 6 + 1] = oy;
    shaftPos[i * 6 + 2] = oz;
    shaftPos[i * 6 + 3] = ex - ux * 0.05;
    shaftPos[i * 6 + 4] = ey - uy * 0.05;
    shaftPos[i * 6 + 5] = ez - uz * 0.05;
    tmpQ.setFromUnitVectors(yUp, tmpV.set(ux, uy, uz));
    const s = Math.min(1, 0.4 + len * 1.5);
    tmpM.compose(tmpS.set(ex, ey, ez), tmpQ, tmpScale.set(s, s, s));
    heads.setMatrixAt(i, tmpM);
  }

  function rebuildArrows(): void {
    const show = arrows !== 'off';
    shafts.visible = show;
    heads.visible = show;
    centreLabel.visible = arrows === 'raw';
    if (!show) return;
    const dM = moonDistRE * R_EARTH;
    const sd = sunDir(bodyDir);
    const R = R_EARTH;
    const n = arrowPts.length;
    // Physical vectors (world axes: x toward Moon, y up, z = −sin of sun angle).
    let maxA = 0;
    const vecs = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = arrowPts[i];
      if (arrows === 'raw') {
        rawPull(GM_MOON, dM, 0, 0, p.x * R, p.y * R, p.z * R, field);
        vecs[i * 3] = field[0];
        vecs[i * 3 + 1] = field[1];
        vecs[i * 3 + 2] = field[2];
      } else {
        tidalField(GM_MOON, dM, 0, 0, p.x * R, p.y * R, p.z * R, field);
        tidalField(GM_SUN, sd.x * AU, 0, sd.z * AU, p.x * R, p.y * R, p.z * R, field2);
        vecs[i * 3] = field[0] + field2[0];
        vecs[i * 3 + 1] = field[1] + field2[1];
        vecs[i * 3 + 2] = field[2] + field2[2];
      }
      maxA = Math.max(maxA, Math.hypot(vecs[i * 3], vecs[i * 3 + 1], vecs[i * 3 + 2]));
    }
    const L = arrows === 'raw' ? 0.5 : 0.62;
    for (let i = 0; i < n; i++) {
      const p = arrowPts[i];
      const vx = vecs[i * 3], vy = vecs[i * 3 + 1], vz = vecs[i * 3 + 2];
      const len = (Math.hypot(vx, vy, vz) / maxA) * L;
      setArrow(i, p.x * 1.04, p.y * 1.04, p.z * 1.04, vx, vy, vz, len);
    }
    if (arrows === 'raw') {
      rawPull(GM_MOON, dM, 0, 0, 0, 0, 0, field);
      setArrow(n, 0, 0, 0, field[0], 0, 0, (field[0] / maxA) * L);
    } else {
      setArrow(n, 0, 0, 0, 0, 0, 0, 0);
    }
    (shaftGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  function gaugeHeight(tLunarDays: number): number {
    const lon = tLunarDays * Math.PI * 2;
    const cm = Math.cos(PIN_LAT) * Math.cos(lon);
    const cs = Math.cos(PIN_LAT) * Math.cos(lon - sunAngle * DEG);
    return tideHeight(cm, km) + tideHeight(cs, ks);
  }

  function drawTideInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('tide at the gauge, next 48 h', 16, 30);
    const top = 48;
    const bot = Hh - 14;
    const x0 = 14;
    const x1 = W - 120;
    const hMax = 1.5 * (km + ks) * 0.75 + 1e-9;
    const yOf = (h: number) => top + (0.5 - (0.5 * h) / hMax) * (bot - top);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.beginPath();
    ictx.moveTo(x0, yOf(0));
    ictx.lineTo(x1, yOf(0));
    ictx.stroke();
    ictx.strokeStyle = css(PALETTE.cyan);
    ictx.lineWidth = 3;
    ictx.beginPath();
    const days = 48 / LUNAR_DAY_H;
    for (let k = 0; k <= 160; k++) {
      const u = k / 160;
      const x = x0 + u * (x1 - x0);
      const y = yOf(gaugeHeight(tideT + u * days));
      if (k === 0) ictx.moveTo(x, y);
      else ictx.lineTo(x, y);
    }
    ictx.stroke();
    const h0 = gaugeHeight(tideT);
    ictx.fillStyle = css(PALETTE.amber);
    ictx.beginPath();
    ictx.arc(x0, yOf(h0), 7, 0, Math.PI * 2);
    ictx.fill();
    ictx.fillStyle = '#dfe6f3';
    ictx.font = '600 26px JetBrains Mono, monospace';
    ictx.fillText(`${h0 >= 0 ? '+' : ''}${(h0 * 100).toFixed(0)} cm`, x1 + 6, yOf(h0) + 9);
  }

  // ======================================================================
  // Roche view logic
  const moonP = defaultMoonParams(N_PART);
  const grainP = defaultMoonParams(N_GRAIN);
  const ball = relaxedBall(moonP, 1);
  const clumpScratch = new Int32Array(N_PART);
  let sim: MoonSim | null = null;
  let clump = 1;
  let orbitEff = orbitSet;
  let dfWorld = 1;
  let rocheScale = 1;
  const sparkO = new Float64Array(SPARK_N);
  const sparkC = new Float64Array(SPARK_N);
  let sparkCount = 0;
  let clumpTimer = 0;
  const cNear = new THREE.Color(PALETTE.amber);
  const cFar = new THREE.Color(PALETTE.violet);
  const cGrain = new THREE.Color(0xdfe6f3);

  function rhoRatio(): number {
    return (density * 1000) / RHO_SATURN;
  }

  function launch(): void {
    const ratio = rhoRatio();
    const rpSim = planetRadiusSim(ratio);
    const fMin = (rpSim + 1.5 * MOON_R) / DF_SIM;
    orbitEff = Math.max(orbitSet, fMin);
    dfWorld = ROCHE_FLUID * Math.cbrt(1 / ratio);
    rocheScale = dfWorld / DF_SIM;
    const s = body === 'rubble' ? launchMoon(moonP, 'rubble', ball, orbitEff * DF_SIM, rpSim) : launchMoon(grainP, 'rigid', ball, orbitEff * DF_SIM, rpSim);
    sim = s;
    ringFluid.scale.setScalar(dfWorld);
    ringRigid.scale.setScalar(dfWorld * (ROCHE_RIGID / ROCHE_FLUID));
    ringSync.scale.setScalar(dfWorld * (ROCHE_RIGID_SYNC / ROCHE_FLUID));
    ringOrbit.scale.setScalar(orbitEff * dfWorld);
    lblFluid.position.set(dfWorld * 0.707, 0.08, dfWorld * 0.707);
    lblRigid.position.set(-dfWorld * (ROCHE_RIGID / ROCHE_FLUID) * 0.2, 0.08, dfWorld * (ROCHE_RIGID / ROCHE_FLUID) * 0.98);
    lblRigid.visible = ROCHE_RIGID / ROCHE_FLUID * dfWorld > 1.05;
    partMat.size = Math.max(0.05, moonP.s * rocheScale * 4.2);
    const n = s.n;
    for (let i = 0; i < N_PART; i++) {
      if (i < n) {
        if (body === 'rubble') {
          const u = Math.max(0, Math.min(1, (ball[i * 3] + 1) / 2));
          tmpC.copy(cNear).lerp(cFar, u);
        } else tmpC.copy(cGrain);
        partCol[i * 3] = tmpC.r;
        partCol[i * 3 + 1] = tmpC.g;
        partCol[i * 3 + 2] = tmpC.b;
      } else {
        partCol[i * 3] = partCol[i * 3 + 1] = partCol[i * 3 + 2] = 0;
      }
    }
    (partGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    partGeo.setDrawRange(0, n);
    rock.visible = body === 'rigid';
    rock.scale.setScalar(MOON_R * rocheScale);
    clump = 1;
    sparkCount = 0;
    placeParticles();
    sample();
    paintLegend();
  }

  function placeParticles(): void {
    if (!sim) return;
    const { x, y, z, alive, n } = sim;
    const k = rocheScale;
    for (let i = 0; i < n; i++) {
      if (alive[i]) {
        partPos[i * 3] = x[i] * k;
        partPos[i * 3 + 1] = z[i] * k;
        partPos[i * 3 + 2] = -y[i] * k;
      } else {
        partPos[i * 3] = partPos[i * 3 + 1] = partPos[i * 3 + 2] = 0;
      }
    }
    (partGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (body === 'rigid') {
      const ph = sim.nOrb * sim.t;
      rock.position.set(sim.d * Math.cos(ph) * k, 0, -sim.d * Math.sin(ph) * k);
      rock.rotation.y = ph;
    }
  }

  function sample(): void {
    if (!sim) return;
    if (body === 'rubble') clump = largestClump(sim, clumpScratch);
    else clump = 1 - sim.lost / sim.n;
    if (sparkCount < SPARK_N) {
      sparkO[sparkCount] = orbitsDone(sim);
      sparkC[sparkCount] = clump;
      sparkCount++;
    } else {
      sparkO.copyWithin(0, 1);
      sparkC.copyWithin(0, 1);
      sparkO[SPARK_N - 1] = orbitsDone(sim);
      sparkC[SPARK_N - 1] = clump;
    }
  }

  function drawRocheInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText(body === 'rubble' ? 'largest clump vs orbits' : 'grains still on the surface', 16, 30);
    const top = 48;
    const bot = Hh - 14;
    const x0 = 14;
    const x1 = W - 80;
    const yOf = (c: number) => bot - c * (bot - top);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const c of [0, 0.5, 1]) {
      ictx.beginPath();
      ictx.moveTo(x0, yOf(c));
      ictx.lineTo(x1, yOf(c));
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(`${c * 100}%`, x1 + 8, yOf(c) + 7);
    }
    if (sparkCount < 2) return;
    const oA = sparkO[0];
    const span = Math.max(3, sparkO[sparkCount - 1] - oA);
    ictx.strokeStyle = clump < 0.5 ? css(PALETTE.rose) : css(PALETTE.green);
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let k = 0; k < sparkCount; k++) {
      const x = x0 + ((sparkO[k] - oA) / span) * (x1 - x0);
      const y = yOf(sparkC[k]);
      if (k === 0) ictx.moveTo(x, y);
      else ictx.lineTo(x, y);
    }
    ictx.stroke();
  }

  // ======================================================================
  // Locking view logic
  const spin: SpinState = { theta: 0, omega: 0, phi: 0 };
  const nLock = (2 * Math.PI) / LOCK_PERIOD;
  let geoT = -620;
  let geoHold = 0;
  let spinRatio = 1;
  let lockedFor = 0;
  const DAY_N = 64;
  const dayCurve = new Float64Array(DAY_N);
  for (let i = 0; i < DAY_N; i++) dayCurve[i] = solarDay(moonDistanceAt(-620 + (620 * i) / (DAY_N - 1))) / 3600;
  const aNow = moonDistanceAt(0);

  function spinUp(): void {
    spin.theta = spin.phi + 0.3;
    spin.omega = 6 * nLock;
    lockedFor = 0;
  }

  function placeLock(): void {
    const a = moonDistanceAt(geoT);
    const R = 3.1 * (1 + 4 * (a / aNow - 1));
    lockOrbit.scale.setScalar(R);
    moonL.position.set(R * Math.cos(spin.phi), 0, -R * Math.sin(spin.phi));
    moonL.rotation.y = spin.theta;
    bulge.rotation.y = spin.phi + 12 * DEG;
    bulgeAxis.rotation.y = spin.phi + 12 * DEG;
    const pp = pointer.geometry.attributes.position as THREE.BufferAttribute;
    pp.setXYZ(1, moonL.position.x, 0, moonL.position.z);
    pp.needsUpdate = true;
    pointer.computeLineDistances();
  }

  function drawLockInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('day length (h) since 620 Myr ago', 16, 30);
    const top = 50;
    const bot = Hh - 16;
    const x0 = 20;
    const x1 = W - 70;
    const lo = 21.2;
    const hi = 24.2;
    const yOf = (h: number) => bot - ((h - lo) / (hi - lo)) * (bot - top);
    const xOf = (t: number) => x0 + ((t + 620) / 620) * (x1 - x0);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const h of [22, 23, 24]) {
      ictx.beginPath();
      ictx.moveTo(x0, yOf(h));
      ictx.lineTo(x1, yOf(h));
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(String(h), x1 + 10, yOf(h) + 7);
    }
    // Rhythmite data point (Williams 2000): 21.9 ± 0.4 h at 620 Ma.
    ictx.strokeStyle = css(PALETTE.rose);
    ictx.lineWidth = 3;
    ictx.beginPath();
    ictx.moveTo(x0 + 6, yOf(21.5));
    ictx.lineTo(x0 + 6, yOf(22.3));
    ictx.stroke();
    ictx.fillStyle = css(PALETTE.rose);
    ictx.fillRect(x0 + 1, yOf(21.9) - 3, 10, 6);
    ictx.strokeStyle = css(PALETTE.cyan);
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let i = 0; i < DAY_N; i++) {
      const x = xOf(-620 + (620 * i) / (DAY_N - 1));
      const y = yOf(dayCurve[i]);
      if (i === 0) ictx.moveTo(x, y);
      else ictx.lineTo(x, y);
    }
    ictx.stroke();
    const d = solarDay(moonDistanceAt(geoT)) / 3600;
    ictx.fillStyle = css(PALETTE.amber);
    ictx.beginPath();
    ictx.arc(xOf(geoT), yOf(d), 7, 0, Math.PI * 2);
    ictx.fill();
    ictx.fillStyle = css(PALETTE.rose);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillText('rocks', x0 + 16, yOf(21.9) + 26);
  }

  // ======================================================================
  // Frame loop
  let uiTimer = 0;
  stage.onFrame((dt) => {
    const sdt = playing ? dt * speed : 0;
    if (view === 'tides') {
      if (playing) {
        tideT += sdt / LUNAR_DAY_S;
        earth.rotation.y = tideT * Math.PI * 2;
      }
    } else if (view === 'roche') {
      if (playing && sim) {
        const steps = Math.min(40, Math.max(1, Math.round((sdt * ROCHE_RATE) / MOON_H)));
        stepMoon(sim, steps);
        placeParticles();
        clumpTimer += dt;
        if (clumpTimer > 0.4) {
          clumpTimer = 0;
          sample();
        }
      }
    } else {
      if (playing) {
        const sub = Math.max(1, Math.ceil(sdt / (1 / 240)));
        const h = sdt / sub;
        for (let k = 0; k < sub; k++) spinStep(spin, nLock, 0.35, 0.14, h);
        spinRatio = spinRatio + (spin.omega / nLock - spinRatio) * Math.min(1, dt * 3);
        const lag = Math.atan2(Math.sin(2 * (spin.theta - spin.phi)), Math.cos(2 * (spin.theta - spin.phi))) / 2;
        if (Math.abs(spin.omega / nLock - 1) < 0.03 && Math.abs(lag) < 0.1) lockedFor += sdt;
        else lockedFor = 0;
        earth.rotation.y += sdt * 2.2;
        if (geoHold > 0) {
          geoHold -= sdt;
          if (geoHold <= 0) geoT = -620;
        } else {
          geoT = Math.min(0, geoT + sdt * GEO_RATE);
          if (geoT >= 0) geoHold = 4;
        }
      }
      placeLock();
    }
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      updateReadouts();
      if (view === 'tides') drawTideInset();
      else if (view === 'roche') drawRocheInset();
      else drawLockInset();
    }
  });

  // ======================================================================
  // Controls
  const ui = new Panel(panel);
  const sectionEl = () => ui.root.lastElementChild as HTMLElement;
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'tides', label: 'Tides' }, { value: 'roche', label: 'Roche' }, { value: 'locking', label: 'Locking' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 4, step: 0.25, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Tides');
  const secTides = sectionEl();
  ui.slider({ key: 'moonDist', label: 'Moon distance', min: 30, max: 90, step: 0.1, value: moonDistRE, unit: 'R⊕', format: (v) => v.toFixed(1), onInput: (v) => { moonDistRE = v; touched = true; rebuildTides(); } });
  ui.slider({ key: 'sunAngle', label: 'Sun angle from Moon', min: 0, max: 360, step: 1, value: sunAngle, unit: '°', onInput: (v) => { sunAngle = v; touched = true; rebuildTides(); } });
  ui.slider({ key: 'exag', label: 'Ocean exaggeration', min: 5, max: 7, step: 0.05, value: exagLog, format: (v) => `×${fmtExag(10 ** v)}`, onInput: (v) => { exagLog = v; rebuildTides(); } });
  ui.select<Arrows>({
    key: 'arrows', label: 'Arrows', value: arrows,
    options: [{ value: 'off', label: 'Off' }, { value: 'raw', label: 'Raw pull' }, { value: 'tidal', label: 'Tidal' }],
    onChange: (v) => { arrows = v; rebuildArrows(); paintLegend(); },
  });
  const rA = ui.readout('atide', 'lunar a_tide', 'µm/s²');
  const rRatio = ui.readout('ratio', 'Sun / Moon tide');
  const rRange = ui.readout('range', 'equator range', 'cm');
  const rGauge = ui.readout('gauge', 'gauge now', 'cm');
  ui.note('Moon and Sun sit in the equatorial plane. The clock runs in lunar days of 24 h 50 min.');

  ui.section('Roche');
  const secRoche = sectionEl();
  ui.select<Body>({
    key: 'body', label: 'Moon body', value: body,
    options: [{ value: 'rubble', label: 'Rubble pile' }, { value: 'rigid', label: 'Solid' }],
    onChange: (v) => { body = v; touched = true; launch(); },
  });
  ui.slider({ key: 'density', label: 'Moon density', min: 0.5, max: 5.5, step: 0.1, value: density, unit: 'g/cm³', format: (v) => v.toFixed(1), onInput: (v) => { density = v; touched = true; launch(); } });
  ui.slider({ key: 'orbit', label: 'Orbit radius', min: 0.4, max: 1.6, step: 0.01, value: orbitSet, unit: 'd_R', format: (v) => v.toFixed(2), onInput: (v) => { orbitSet = v; touched = true; launch(); } });
  ui.buttons([{ label: 'Launch', key: 'launch', onClick: () => { touched = true; launch(); } }]);
  const rDR = ui.readout('dR', 'fluid limit d_R', 'R_planet');
  const rOrb = ui.readout('orbitEff', 'orbit', 'd_R');
  const rClump = ui.readout('clump', 'largest clump');
  const rOrbits = ui.readout('orbits', 'orbits done');
  ui.note('Orbit radius is in units of the fluid Roche limit d_R. In these units breakup depends only on the ratio. Density moves d_R in kilometres.');

  ui.section('Locking');
  const secLock = sectionEl();
  ui.buttons([
    { label: 'Spin up Moon', key: 'spinup', onClick: () => { touched = true; spinUp(); } },
    { label: 'Restart clock', key: 'geoT', onClick: () => { geoT = -620; geoHold = 0; } },
  ]);
  const rGeo = ui.readout('geoT', 'time', 'Myr');
  const rDay = ui.readout('day', 'Earth day', 'h');
  const rDpy = ui.readout('dpy', 'days / year');
  const rMoonA = ui.readout('moonA', 'Moon distance', 'R⊕');
  const rSpin = ui.readout('spin', 'Moon spins / orbit');
  const rLock = ui.readout('locked', 'status');

  function updateReadouts(): void {
    if (view === 'tides') {
      const a = tidalApprox(GM_MOON, R_EARTH, moonDistRE * R_EARTH);
      rA((a * 1e6).toFixed(2));
      rRatio(sunMoonRatio(moonDistRE * R_EARTH).toFixed(3));
      rRange((rangeNow * 100).toFixed(0));
      rGauge(`${gaugeHeight(tideT) >= 0 ? '+' : ''}${(gaugeHeight(tideT) * 100).toFixed(0)}`);
      const s = Math.abs(Math.sin(sunAngle * DEG));
      legendStatus.textContent = s < 0.09 ? 'Spring tide: bulges add.' : Math.abs(Math.cos(sunAngle * DEG)) < 0.09 ? 'Neap tide: bulges fight.' : '';
    } else if (view === 'roche') {
      rDR((dfWorld).toFixed(2));
      rOrb(orbitEff > orbitSet + 1e-9 ? `${orbitEff.toFixed(2)} (min)` : orbitEff.toFixed(2));
      rClump(body === 'rubble' ? `${(clump * 100).toFixed(0)}%` : `${sim ? sim.lost : 0} grains lost`);
      rOrbits(sim ? orbitsDone(sim).toFixed(1) : '0');
      const inside = orbitEff < 1;
      let st: string;
      if (body === 'rubble') st = clump < 0.5 ? 'Torn apart: a ring is forming.' : clump < 0.95 ? 'Shedding material.' : inside ? 'Inside the limit: watch it stretch.' : 'Outside the limit: holding together.';
      else st = sim && sim.lost > 0 ? 'Grains are lifting off the surface.' : inside ? 'Inside the fluid limit, still intact.' : 'Outside the fluid limit, intact.';
      legendStatus.textContent = st;
    } else {
      const a = moonDistanceAt(geoT);
      const day = solarDay(a);
      rGeo(geoT <= -0.5 ? `${Math.round(geoT)}` : 'now');
      rDay((day / 3600).toFixed(2));
      rDpy((SIDEREAL_YEAR / day).toFixed(0));
      rMoonA((a / 6.3781e6).toFixed(2));
      rSpin(spinRatio.toFixed(2));
      rLock(lockedFor > 2 ? 'locked' : 'spinning down');
      legendStatus.textContent = `${geoT <= -0.5 ? `${Math.round(-geoT)} Myr ago` : 'Today'}: day ${(day / 3600).toFixed(1)} h`;
    }
  }

  function setView(v: View): void {
    view = v;
    gTides.visible = v === 'tides';
    gRoche.visible = v === 'roche';
    gLock.visible = v === 'locking';
    earth.visible = v !== 'roche';
    pin.visible = v === 'tides';
    secTides.style.display = v === 'tides' ? '' : 'none';
    secRoche.style.display = v === 'roche' ? '' : 'none';
    secLock.style.display = v === 'locking' ? '' : 'none';
    if (v === 'tides') stage.flyTo(CAM_TIDES, TGT_TIDES);
    if (v === 'roche') stage.flyTo(CAM_ROCHE, TGT_ROCHE);
    if (v === 'locking') {
      stage.flyTo(CAM_LOCK, TGT_LOCK);
      earth.rotation.y = 0;
    }
    paintLegend();
    updateReadouts();
    if (v === 'tides') drawTideInset();
    else if (v === 'roche') drawRocheInset();
    else drawLockInset();
  }

  // Initial state
  rebuildTides();
  launch();
  spin.phi = 0;
  spin.theta = 0;
  spin.omega = nLock;
  spinUp();
  placeLock();
  setView('tides');
  touched = false;

  return {
    state: () => {
      const lost = sim ? sim.lost : 0;
      const orb = sim ? orbitsDone(sim) : 0;
      return {
        view,
        sunAngle,
        moonDist: moonDistRE,
        exag: 10 ** exagLog,
        arrows,
        ratio: sunMoonRatio(moonDistRE * R_EARTH),
        range: rangeNow,
        body,
        density,
        orbit: orbitEff,
        clump,
        disrupted: body === 'rubble' && clump < 0.5,
        orbits: orb,
        lost,
        intactOrbits: body === 'rigid' && lost === 0 ? orb : 0,
        geoT,
        dayHours: solarDay(moonDistanceAt(geoT)) / 3600,
        spinRatio,
        locked: lockedFor > 2,
        touched,
      };
    },
    dispose: () => {
      legend.remove();
      inset.remove();
      glowTex.dispose();
      earthTex.dispose();
      bandTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'tides-roche',
  number: 97,
  title: 'Tides & the Roche Limit',
  domain: 'classical',
  level: 1,
  status: 'live',
  tagline: 'Why the Moon shows one face, and how moons become rings.',
  content,
  mount,
};

export default topic;
