import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  C, EPS0, MU0, cFromConstants, chargeX, circularity, dipoleDPdOmega, dipoleQ, ellipseTilt, gamma, integrateSphere,
  kinkFieldRatio, kinkLine, kinkRegion, larmorDipoleMean, meanIntensity, planeBFromE, planeE, polKind,
  polarizerTransmission, polFromRatio, type KinkParams, type Pol,
} from './physics.ts';

type View = 'plane' | 'dipole' | 'kink';
type Preset = 'linear' | 'elliptical' | 'circular';

const DEG = Math.PI / 180;
const COL_E = 0xff7a45; // electric field, red-orange
const COL_B = 0x5b9dff; // magnetic field, blue
const LIME = 0xa3e635; // domain accent: energy flow, radiation, polarizer axis
const COL_Q = PALETTE.amber; // charges

// --- Plane wave layout. Physics axes (x, y, z) map to scene (y, z, x): E_x is up, the wave runs along +x.
const X0 = -6;
const X1 = 6;
const XP = 1.6; // polarizer position
const NA = 49; // arrows along the axis
const NT = 420; // points on the E-tip helix
const NS = 12; // Poynting arrows
const CS = 1.4; // on-screen speed of light, scene units per second
const SC = 1.25 / 1000; // scene units per V/m
const LAM_SCALE = 1 / 150; // scene units per nm

// --- Dipole slice
const DX = 7.2;
const DY = 4.8;
const GX = 190;
const GY = 128;
const R_MIN = 0.42;
const LEVELS = [0.12, 0.42, 0.72, 1.02, 1.32, 1.62, 1.92];
const MAXSEG = 26000;
const R_DONUT = 2.4;

// --- Kink view
const NL = 24;
const R_MAX = 8.5;
const TAU = 0.25;

const CAM: Record<View, [number, number, number]> = { plane: [4.2, 3.6, 10.5], dipole: [1.5, 2.2, 13.5], kink: [0.8, 3.2, 13.8] };
const TGT: Record<View, [number, number, number]> = { plane: [0, 0, 0], dipole: [0, 0, 0], kink: [0.6, 0, 0] };

function makeInset(viewport: HTMLElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 400;
  Object.assign(c.style, {
    position: 'absolute', right: '10px', top: '10px', width: '200px', height: '200px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(c);
  return c;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.plane, target: TGT.plane, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'plane';
  let speed = 1;
  let playing = true;
  let lambdaNm = 550;
  let E0 = 1000;
  let ratio = 1;
  let deltaDeg = 0;
  let polarizerOn = true;
  let thetaPDeg = 0;
  let showB = true;
  let showS = true;
  let probeDeg = 60;
  let showPattern = true;
  let beta = 0.6;
  let tStop = 1.5;
  let probeR = 3;

  let tWave = 0;
  let tKink = 0;
  let kinkPassed = false;
  let prevShell = 0;
  let morph: null | { r0: number; d0: number; r1: number; d1: number; u: number } = null;

  const pol = (): Pol => polFromRatio(E0, ratio, deltaDeg * DEG);
  const lamS = () => lambdaNm * LAM_SCALE;
  const kS = () => (2 * Math.PI) / lamS();
  const kinkP = (): KinkParams => ({ beta, tStop, tau: TAU, c: CS });

  const groups: Record<View, THREE.Group> = { plane: new THREE.Group(), dipole: new THREE.Group(), kink: new THREE.Group() };
  Object.values(groups).forEach((g) => scene.add(g));

  // Shared helpers for instanced arrows
  const up = new THREE.Vector3(0, 1, 0);
  const tmpV = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpM = new THREE.Matrix4();
  const shaftGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  shaftGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.ConeGeometry(1, 1, 12);
  headGeo.translate(0, 0.5, 0);

  class Arrows {
    shafts: THREE.InstancedMesh;
    heads: THREE.InstancedMesh;
    constructor(n: number, color: number, parent: THREE.Object3D, readonly r = 0.022, opacity = 1) {
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5, transparent: opacity < 1, opacity });
      this.shafts = new THREE.InstancedMesh(shaftGeo, mat, n);
      this.heads = new THREE.InstancedMesh(headGeo, mat, n);
      for (const m of [this.shafts, this.heads]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        parent.add(m);
      }
    }
    set(i: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): void {
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) {
        tmpM.makeScale(0, 0, 0);
        this.shafts.setMatrixAt(i, tmpM);
        this.heads.setMatrixAt(i, tmpM);
        return;
      }
      tmpV.set(dx / len, dy / len, dz / len);
      tmpQ.setFromUnitVectors(up, tmpV);
      const head = Math.min(0.2, len * 0.4);
      const hr = Math.min(0.075, this.r * 3.4, len * 0.3);
      tmpM.compose(tmpP.set(ox, oy, oz), tmpQ, tmpS.set(this.r, len - head, this.r));
      this.shafts.setMatrixAt(i, tmpM);
      tmpM.compose(tmpP.set(ox + tmpV.x * (len - head), oy + tmpV.y * (len - head), oz + tmpV.z * (len - head)), tmpQ, tmpS.set(hr, head, hr));
      this.heads.setMatrixAt(i, tmpM);
    }
    commit(): void {
      this.shafts.instanceMatrix.needsUpdate = true;
      this.heads.instanceMatrix.needsUpdate = true;
    }
  }

  // =====================================================================
  // View 1: plane wave
  // =====================================================================
  const PG = groups.plane;
  const grid = makeGrid(14, 28);
  grid.position.y = -2.2;
  PG.add(grid);
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X0 - 0.4, 0, 0), new THREE.Vector3(X1 + 0.6, 0, 0)]);
  PG.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor })));
  const kArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(X1 + 0.3, 0, 0), 0.9, PALETTE.text, 0.3, 0.16);
  PG.add(kArrow);
  stage.label('k', [X1 + 1.45, 0.05, 0], '', PG);
  const eArrows = new Arrows(NA, COL_E, PG);
  const bArrows = new Arrows(NA, COL_B, PG, 0.02);
  const sArrows = new Arrows(NS, LIME, PG, 0.03, 0.9);
  const tipPos = new Float32Array(NT * 3);
  const tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute('position', new THREE.BufferAttribute(tipPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tipLine = new THREE.Line(tipGeo, new THREE.LineBasicMaterial({ color: COL_E, transparent: true, opacity: 0.9 }));
  tipLine.frustumCulled = false;
  PG.add(tipLine);
  const btipPos = new Float32Array(NT * 3);
  const btipGeo = new THREE.BufferGeometry();
  btipGeo.setAttribute('position', new THREE.BufferAttribute(btipPos, 3).setUsage(THREE.DynamicDrawUsage));
  const btipLine = new THREE.Line(btipGeo, new THREE.LineBasicMaterial({ color: COL_B, transparent: true, opacity: 0.45 }));
  btipLine.frustumCulled = false;
  PG.add(btipLine);
  const eLabel = stage.label('E', [0, 0, 0], '', PG);
  (eLabel.element as HTMLElement).style.color = css(COL_E);
  const bLabel = stage.label('B', [0, 0, 0], '', PG);
  (bLabel.element as HTMLElement).style.color = css(COL_B);

  // Polarizer sheet: rotates about the propagation axis
  const polG = new THREE.Group();
  polG.position.x = XP;
  PG.add(polG);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x8b98b4, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8 }),
  );
  sheet.rotation.y = Math.PI / 2;
  polG.add(sheet);
  const polFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.6, 3.6)), new THREE.LineBasicMaterial({ color: 0x55627e }));
  polFrame.rotation.y = Math.PI / 2;
  polG.add(polFrame);
  const hatch: THREE.Vector3[] = [];
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const z = i * 0.3;
    const h = 1.7;
    hatch.push(new THREE.Vector3(0, -h, z), new THREE.Vector3(0, h, z));
  }
  polG.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hatch), new THREE.LineBasicMaterial({ color: 0x6f7c99, transparent: true, opacity: 0.45 })));
  const axisBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 10), new THREE.MeshBasicMaterial({ color: LIME }));
  polG.add(axisBar);
  const polLabel = stage.label('polarizer', [0, 2.15, 0], 'muted', polG);
  const transLabel = stage.label('', [XP, -2.2, 0], '', PG);

  // =====================================================================
  // View 2: dipole antenna
  // =====================================================================
  const DG = groups.dipole;
  const dgrid = makeGrid(16, 32);
  dgrid.rotation.x = Math.PI / 2;
  dgrid.position.z = -0.02;
  (dgrid.material as THREE.Material).opacity = 0.25;
  DG.add(dgrid);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x8a96b0, metalness: 0.6, roughness: 0.35 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 12), rodMat);
  DG.add(rod);
  const qMat = new THREE.MeshStandardMaterial({ color: COL_Q, emissive: COL_Q, emissiveIntensity: 0.5, roughness: 0.3 });
  const dCharge = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), qMat);
  DG.add(dCharge);
  const axisPts = [new THREE.Vector3(0, -DY - 0.2, 0), new THREE.Vector3(0, DY + 0.2, 0)];
  const dAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints(axisPts), new THREE.LineDashedMaterial({ color: 0x9aa6bd, dashSize: 0.18, gapSize: 0.12 }));
  dAxis.computeLineDistances();
  DG.add(dAxis);
  stage.label('no radiation along the axis', [0, DY + 0.55, 0], 'muted', DG);
  stage.label('p(t)', [0.45, 0.35, 0], '', DG);

  // Field-line slice (marching squares on the flux function Q)
  const NVX = GX + 1;
  const NVY = GY + 1;
  const qGrid = new Float32Array(NVX * NVY);
  const gxs = new Float32Array(NVX);
  const gys = new Float32Array(NVY);
  const gR = new Float32Array(NVX * NVY);
  const gS2 = new Float32Array(NVX * NVY);
  for (let i = 0; i < NVX; i++) gxs[i] = -DX + (2 * DX * i) / GX;
  for (let j = 0; j < NVY; j++) gys[j] = -DY + (2 * DY * j) / GY;
  for (let j = 0; j < NVY; j++) {
    for (let i = 0; i < NVX; i++) {
      const r = Math.hypot(gxs[i], gys[j]);
      gR[j * NVX + i] = r;
      gS2[j * NVX + i] = r > 0 ? (gxs[i] * gxs[i]) / (r * r) : 0;
    }
  }
  const segPos = new Float32Array(MAXSEG * 6);
  const segCol = new Float32Array(MAXSEG * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setDrawRange(0, 0);
  const segLines = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
  segLines.frustumCulled = false;
  DG.add(segLines);
  const cPos = new THREE.Color(COL_E);
  const cNeg = new THREE.Color(0xffc38a);
  const mc = new Float32Array(8);

  // Radiation doughnut r = R sin²θ, revolved about the dipole axis (scene y)
  const lathePts: THREE.Vector2[] = [];
  for (let i = 0; i <= 64; i++) {
    const th = (Math.PI * i) / 64;
    const r = R_DONUT * Math.sin(th) ** 2;
    lathePts.push(new THREE.Vector2(r * Math.sin(th) + 1e-4, r * Math.cos(th)));
  }
  const donutGeo = new THREE.LatheGeometry(lathePts, 72);
  const donut = new THREE.Mesh(donutGeo, new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 0.15, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, roughness: 0.7 }));
  const donutWire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.LatheGeometry(lathePts.filter((_, i) => i % 4 === 0), 24)), new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.16 }));
  const donutG = new THREE.Group();
  donutG.add(donut, donutWire);
  DG.add(donutG);
  const donutLabel = stage.label('radiated power ∝ sin²θ', [R_DONUT * 1.05, -1.1, 0], 'muted', donutG);
  void donutLabel;

  // Probe direction
  const probeArrow = new Arrows(1, LIME, DG, 0.03);
  const probeDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: LIME }));
  DG.add(probeDot);
  const probeLabel = stage.label('', [0, 0, 0], '', DG);

  // =====================================================================
  // View 3: kinked field lines
  // =====================================================================
  const KG = groups.kink;
  const kgrid = makeGrid(20, 40);
  kgrid.rotation.x = Math.PI / 2;
  kgrid.position.z = -0.02;
  (kgrid.material as THREE.Material).opacity = 0.22;
  KG.add(kgrid);
  const pathGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-R_MAX, 0, 0), new THREE.Vector3(R_MAX, 0, 0)]);
  KG.add(new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor })));
  const kSegPos = new Float32Array(NL * 3 * 6);
  const kSegCol = new Float32Array(NL * 3 * 6);
  const kGeo = new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.BufferAttribute(kSegPos, 3).setUsage(THREE.DynamicDrawUsage));
  kGeo.setAttribute('color', new THREE.BufferAttribute(kSegCol, 3).setUsage(THREE.DynamicDrawUsage));
  const kLines = new THREE.LineSegments(kGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  kLines.frustumCulled = false;
  KG.add(kLines);
  // Two more copies rotated about the motion axis, since the field is axially symmetric
  const ghostMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false });
  for (const a of [Math.PI / 3, (2 * Math.PI) / 3]) {
    const g = new THREE.LineSegments(kGeo, ghostMat);
    g.rotation.x = a;
    g.frustumCulled = false;
    KG.add(g);
  }
  const kCharge = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), qMat);
  KG.add(kCharge);
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), new THREE.MeshBasicMaterial({ color: COL_Q, transparent: true, opacity: 0.28, depthWrite: false }));
  KG.add(ghost);
  const ghostLabel = stage.label('where it would be', [0, 0, 0], 'muted', KG);
  const chargeLabel = stage.label('charge', [0, 0, 0], 'muted', KG);
  const circleGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 161 }, (_, i) => new THREE.Vector3(Math.cos((i / 160) * 2 * Math.PI), Math.sin((i / 160) * 2 * Math.PI), 0)));
  const outerRing = new THREE.Line(circleGeo, new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.55 }));
  const innerRing = new THREE.Line(circleGeo, new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.3 }));
  KG.add(outerRing, innerRing);
  const shellSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.025, depthWrite: false, side: THREE.DoubleSide }),
  );
  KG.add(shellSphere);
  const shellLabel = stage.label('kink: radiation moving at c', [0, 0, 0], '', KG);
  (shellLabel.element as HTMLElement).style.color = css(LIME);
  const probeRing = new THREE.Line(circleGeo, new THREE.LineDashedMaterial({ color: 0xdfe6f3, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.7 }));
  probeRing.computeLineDistances();
  KG.add(probeRing);
  const probeRLabel = stage.label('', [0, 0, 0], 'muted', KG);
  const regionInLabel = stage.label('new static field', [0, 0, 0], 'muted', KG);
  const regionOutLabel = stage.label('old field, still pointing ahead', [0, 0, 0], 'muted', KG);

  // =====================================================================
  // Overlays: legend (left) and inset (right)
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  const paintLegend = () => {
    if (view === 'plane') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Plane wave</div>
<div>${sw(COL_E, '■ E field')} ${sw(COL_B, '■ B field')} (drawn as cB)</div>
<div>${sw(LIME, '■ Poynting S = E×B/μ₀')}, energy flow</div>
<div>The red line traces the E-vector tip. After the sheet only the part along the ${sw(LIME, 'lime axis')} survives.</div>`;
    } else if (view === 'dipole') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Oscillating dipole</div>
<div>${sw(COL_E, '■ E field lines')} in a slice through the axis. Loops pinch off and fly out at c.</div>
<div>${sw(LIME, '■ doughnut')}: power per solid angle ∝ sin²θ</div>
<div>${sw(COL_Q, '●')} the oscillating charge</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Kinked field lines</div>
<div>${sw(COL_Q, '●')} charge moving right, then stopping</div>
<div>${sw(COL_E, '■ field lines')}. Inside the ${sw(LIME, 'shell')} they come from the stopped charge. Outside they point to where it would be.</div>
<div>${sw(LIME, '■ kink')}: the sideways field that carries energy away</div>`;
    }
  };

  const inset = makeInset(viewport);
  const ictx = inset.getContext('2d')!;

  function drawInsetPlane(p: Pol): void {
    const W = inset.width;
    const cx = W / 2;
    const cy = W / 2 + 14;
    const R = 140;
    ictx.clearRect(0, 0, W, W);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('E tip, seen head-on', 16, 32);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.moveTo(cx - R - 10, cy); ictx.lineTo(cx + R + 10, cy);
    ictx.moveTo(cx, cy - R - 10); ictx.lineTo(cx, cy + R + 10);
    ictx.stroke();
    const s = R / Math.max(1e-9, E0);
    // As seen by the receiver: physics x is up, physics y is to the left.
    const hx = (_ex: number, ey: number) => cx - ey * s;
    const vy = (ex: number) => cy - ex * s;
    // polarizer axis
    if (polarizerOn) {
      const th = thetaPDeg * DEG;
      ictx.strokeStyle = css(LIME);
      ictx.setLineDash([10, 8]);
      ictx.lineWidth = 3;
      ictx.beginPath();
      ictx.moveTo(hx(-R / s * Math.cos(th), -R / s * Math.sin(th)), vy(-R / s * Math.cos(th)));
      ictx.lineTo(hx(R / s * Math.cos(th), R / s * Math.sin(th)), vy(R / s * Math.cos(th)));
      ictx.stroke();
      ictx.setLineDash([]);
    }
    // ellipse
    ictx.strokeStyle = css(COL_E);
    ictx.globalAlpha = 0.55;
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const ph = (2 * Math.PI * i) / 96;
      const ex = p.ax * Math.cos(ph);
      const ey = p.ay * Math.cos(ph + p.delta);
      if (i === 0) ictx.moveTo(hx(ex, ey), vy(ex)); else ictx.lineTo(hx(ex, ey), vy(ex));
    }
    ictx.stroke();
    ictx.globalAlpha = 1;
    // current vector at the source end
    planeE(p, kS(), kS() * CS, X0, tWave, e3);
    ictx.lineWidth = 5;
    ictx.beginPath();
    ictx.moveTo(cx, cy);
    ictx.lineTo(hx(e3[0], e3[1]), vy(e3[0]));
    ictx.stroke();
    ictx.fillStyle = css(COL_E);
    ictx.beginPath();
    ictx.arc(hx(e3[0], e3[1]), vy(e3[0]), 8, 0, 2 * Math.PI);
    ictx.fill();
    ictx.fillStyle = '#8391ab';
    ictx.font = '20px JetBrains Mono, monospace';
    const kind = polKind(p);
    const circ = circularity(p);
    const sense = kind === 'linear' ? '' : circ > 0 ? ' ↺' : ' ↻';
    ictx.fillText(`${kind}${sense}`, 16, W - 18);
  }

  function drawInsetDipole(): void {
    const W = inset.width;
    const cx = W / 2;
    const cy = W / 2 + 14;
    const R = 150;
    ictx.clearRect(0, 0, W, W);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('dP/dΩ ∝ sin²θ', 16, 32);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 2;
    for (const f of [0.5, 1]) {
      ictx.beginPath();
      ictx.arc(cx, cy, R * f, 0, 2 * Math.PI);
      ictx.stroke();
    }
    ictx.beginPath();
    ictx.moveTo(cx, cy - R - 8); ictx.lineTo(cx, cy + R + 8);
    ictx.stroke();
    ictx.strokeStyle = css(LIME);
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const th = (2 * Math.PI * i) / 180;
      const r = R * Math.sin(th) ** 2;
      const x = cx + r * Math.sin(th);
      const y = cy - r * Math.cos(th);
      if (i === 0) ictx.moveTo(x, y); else ictx.lineTo(x, y);
    }
    ictx.stroke();
    const th = probeDeg * DEG;
    const r = R * Math.sin(th) ** 2;
    ictx.strokeStyle = '#dfe6f3';
    ictx.setLineDash([8, 6]);
    ictx.beginPath();
    ictx.moveTo(cx, cy);
    ictx.lineTo(cx + R * Math.sin(th), cy - R * Math.cos(th));
    ictx.stroke();
    ictx.setLineDash([]);
    ictx.fillStyle = css(LIME);
    ictx.beginPath();
    ictx.arc(cx + r * Math.sin(th), cy - r * Math.cos(th), 9, 0, 2 * Math.PI);
    ictx.fill();
    ictx.fillStyle = '#8391ab';
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillText(`θ = ${probeDeg.toFixed(0)}°  sin²θ = ${(Math.sin(th) ** 2).toFixed(2)}`, 16, W - 18);
  }

  function drawInsetKink(shell: number): void {
    const W = inset.width;
    ictx.clearRect(0, 0, W, W);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('field vs distance (log)', 16, 32);
    const x0 = 40;
    const x1 = W - 20;
    const y0 = 60;
    const y1 = W - 50;
    const lr0 = Math.log10(0.5);
    const lr1 = Math.log10(R_MAX);
    const kp = kinkP();
    const aOverC2 = (kp.beta * kp.c) / kp.tau / (kp.c * kp.c);
    const fE = (r: number) => 1 / (r * r);
    const fK = (r: number) => aOverC2 / r;
    const lmax = Math.log10(Math.max(fE(0.5), fK(0.5)));
    const lmin = lmax - 3.2;
    const X = (r: number) => x0 + ((Math.log10(r) - lr0) / (lr1 - lr0)) * (x1 - x0);
    const Y = (f: number) => y0 + ((lmax - Math.log10(Math.max(f, 1e-12))) / (lmax - lmin)) * (y1 - y0);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 2;
    ictx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const curve = (f: (r: number) => number, col: string) => {
      ictx.strokeStyle = col;
      ictx.lineWidth = 4;
      ictx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const r = 0.5 * Math.pow(R_MAX / 0.5, i / 60);
        const y = Math.min(y1, Y(f(r)));
        if (i === 0) ictx.moveTo(X(r), y); else ictx.lineTo(X(r), y);
      }
      ictx.stroke();
    };
    ictx.save();
    ictx.beginPath();
    ictx.rect(x0, y0, x1 - x0, y1 - y0);
    ictx.clip();
    curve(fE, css(COL_E));
    curve(fK, css(LIME));
    if (shell > 0.5 && shell < R_MAX) {
      ictx.strokeStyle = '#dfe6f3';
      ictx.setLineDash([6, 6]);
      ictx.beginPath();
      ictx.moveTo(X(shell), y0);
      ictx.lineTo(X(shell), y1);
      ictx.stroke();
      ictx.setLineDash([]);
    }
    ictx.restore();
    ictx.font = '19px JetBrains Mono, monospace';
    ictx.fillStyle = css(COL_E);
    ictx.fillText('Coulomb ∝ 1/r²', x0 + 8, y1 + 24);
    ictx.fillStyle = css(LIME);
    ictx.fillText('kink ∝ a/r', x0 + 8, y1 + 44);
    ictx.fillStyle = '#8391ab';
    ictx.fillText('shell', Math.min(x1 - 60, X(Math.max(0.5, Math.min(R_MAX, shell))) + 6), y0 + 22);
  }

  // =====================================================================
  // Per-frame drawing
  // =====================================================================
  const e3 = new Float64Array(3);
  const b3 = new Float64Array(3);

  let transNow = 0.5;
  function drawPlane(): void {
    const p = pol();
    const k = kS();
    const w = k * CS;
    const th = thetaPDeg * DEG;
    const pc = Math.cos(th);
    const ps = Math.sin(th);
    const project = (x: number) => polarizerOn && x > XP;
    // Arrows
    for (let i = 0; i < NA; i++) {
      const x = X0 + ((X1 - X0) * i) / (NA - 1);
      planeE(p, k, w, x, tWave, e3);
      if (project(x)) {
        const d = e3[0] * pc + e3[1] * ps;
        e3[0] = d * pc;
        e3[1] = d * ps;
      }
      planeBFromE(e3, b3, 1);
      // scene: (x, E_x, E_y)
      eArrows.set(i, x, 0, 0, 0, e3[0] * SC, e3[1] * SC);
      if (showB) bArrows.set(i, x, 0, 0, 0, b3[0] * SC, b3[1] * SC);
    }
    eArrows.commit();
    if (showB) bArrows.commit();
    // Tip curves
    for (let i = 0; i < NT; i++) {
      const x = X0 + ((X1 - X0) * i) / (NT - 1);
      planeE(p, k, w, x, tWave, e3);
      if (project(x)) {
        const d = e3[0] * pc + e3[1] * ps;
        e3[0] = d * pc;
        e3[1] = d * ps;
      }
      tipPos[3 * i] = x;
      tipPos[3 * i + 1] = e3[0] * SC;
      tipPos[3 * i + 2] = e3[1] * SC;
      btipPos[3 * i] = x;
      btipPos[3 * i + 1] = -e3[1] * SC;
      btipPos[3 * i + 2] = e3[0] * SC;
    }
    tipGeo.attributes.position.needsUpdate = true;
    btipGeo.attributes.position.needsUpdate = true;
    // Poynting arrows along the axis: |S| = |E|²/(μ0 c), scaled so the mean for E0 = 1000 V/m is ~0.45
    const sScale = 0.9 / (1000 * 1000);
    for (let i = 0; i < NS; i++) {
      const x = X0 + 0.2 + ((X1 - X0 - 0.9) * i) / (NS - 1);
      planeE(p, k, w, x, tWave, e3);
      if (project(x)) {
        const d = e3[0] * pc + e3[1] * ps;
        e3[0] = d * pc;
        e3[1] = d * ps;
      }
      const s2 = (e3[0] * e3[0] + e3[1] * e3[1]) * sScale;
      if (showS) sArrows.set(i, x, 0, 0, Math.min(0.85, s2), 0, 0);
    }
    if (showS) sArrows.commit();
    // Labels follow the wave near the left end
    planeE(p, k, w, X0 + 1.5, tWave, e3);
    eLabel.position.set(X0 + 1.5, e3[0] * SC * 1.12 + 0.15, e3[1] * SC * 1.12);
    bLabel.position.set(X0 + 1.5, -e3[1] * SC * 1.12, e3[0] * SC * 1.12 + 0.15);
    polG.rotation.x = th;
    transNow = polarizerTransmission(p, th);
    transLabel.element.textContent = polarizerOn ? `I/I₀ = ${(transNow * 100).toFixed(1)}%` : '';
    drawInsetPlane(p);
  }

  function drawDipole(): void {
    const k = kS();
    const wt = k * CS * tWave;
    // charge position: p(t) = p0 cos ωt
    dCharge.position.y = 0.32 * Math.cos(wt);
    // Q on the grid
    for (let j = 0; j < NVY; j++) {
      for (let i = 0; i < NVX; i++) {
        const idx = j * NVX + i;
        const r = gR[idx];
        qGrid[idx] = r < R_MIN ? NaN : dipoleQ(k * r, gS2[idx], wt);
      }
    }
    // Marching squares for each level ±L
    let n = 0;
    const dxc = (2 * DX) / GX;
    const dyc = (2 * DY) / GY;
    for (let j = 0; j < GY && n < MAXSEG - 4; j++) {
      for (let i = 0; i < GX; i++) {
        const a = qGrid[j * NVX + i];
        const b = qGrid[j * NVX + i + 1];
        const c = qGrid[(j + 1) * NVX + i + 1];
        const d = qGrid[(j + 1) * NVX + i];
        if (a !== a || b !== b || c !== c || d !== d) continue;
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        const x0 = gxs[i];
        const y0 = gys[j];
        for (let s = 0; s < 2; s++) {
          for (let l = 0; l < LEVELS.length; l++) {
            const L = s === 0 ? LEVELS[l] : -LEVELS[l];
            if (L < lo || L > hi) continue;
            // Edge crossings: bottom (a-b), right (b-c), top (d-c), left (a-d)
            let m = 0;
            if ((a < L) !== (b < L)) { mc[m++] = x0 + ((L - a) / (b - a)) * dxc; mc[m++] = y0; }
            if ((b < L) !== (c < L)) { mc[m++] = x0 + dxc; mc[m++] = y0 + ((L - b) / (c - b)) * dyc; }
            if ((d < L) !== (c < L)) { mc[m++] = x0 + ((L - d) / (c - d)) * dxc; mc[m++] = y0 + dyc; }
            if ((a < L) !== (d < L)) { mc[m++] = x0; mc[m++] = y0 + ((L - a) / (d - a)) * dyc; }
            m /= 2;
            const col = s === 0 ? cPos : cNeg;
            if (m >= 2) {
              const o = n * 6;
              segPos[o] = mc[0]; segPos[o + 1] = mc[1]; segPos[o + 2] = 0;
              segPos[o + 3] = mc[2]; segPos[o + 4] = mc[3]; segPos[o + 5] = 0;
              segCol[o] = segCol[o + 3] = col.r; segCol[o + 1] = segCol[o + 4] = col.g; segCol[o + 2] = segCol[o + 5] = col.b;
              n++;
            }
            if (m === 4) {
              const o = n * 6;
              segPos[o] = mc[4]; segPos[o + 1] = mc[5]; segPos[o + 2] = 0;
              segPos[o + 3] = mc[6]; segPos[o + 4] = mc[7]; segPos[o + 5] = 0;
              segCol[o] = segCol[o + 3] = col.r; segCol[o + 1] = segCol[o + 4] = col.g; segCol[o + 2] = segCol[o + 5] = col.b;
              n++;
            }
          }
        }
      }
    }
    segGeo.setDrawRange(0, n * 2);
    segGeo.attributes.position.needsUpdate = true;
    segGeo.attributes.color.needsUpdate = true;
    // Probe
    const th = probeDeg * DEG;
    const len = 4.3;
    probeArrow.set(0, 0, 0, 0.001, len * Math.sin(th), len * Math.cos(th), len * 0.0);
    probeArrow.commit();
    const rr = R_DONUT * Math.sin(th) ** 2;
    probeDot.position.set(rr * Math.sin(th), rr * Math.cos(th), 0);
    probeLabel.position.set(rr * Math.sin(th) + 1.1, rr * Math.cos(th) + 0.3, 0);
    probeLabel.element.textContent = `probe  sin²θ = ${(Math.sin(th) ** 2).toFixed(2)}`;
    drawInsetDipole();
  }

  const kLine = new Float64Array(8);
  const cStatic = new THREE.Color(COL_E).multiplyScalar(0.85);
  const cOld = new THREE.Color(COL_E);
  const cKink = new THREE.Color(LIME);
  let shellNow = 0;
  function drawKink(): void {
    const kp = kinkP();
    const t = tKink;
    const xq = chargeX(kp, t);
    kCharge.position.set(xq, 0, 0);
    chargeLabel.position.set(xq, -0.45, 0);
    const s = t - kp.tStop;
    const stopped = s > 0;
    ghost.visible = stopped;
    ghostLabel.visible = stopped && s * kp.c > 1.2 && s * kp.c < R_MAX;
    const xExt = beta * kp.c * Math.max(0, s);
    ghost.position.set(xExt, 0, 0);
    ghostLabel.position.set(xExt, 0.45, 0);
    const R2 = stopped ? kp.c * s : 0;
    const R1 = Math.max(0, kp.c * (s - kp.tau));
    shellNow = R2;
    const showShell = stopped && R2 < R_MAX * 1.2;
    outerRing.visible = showShell;
    innerRing.visible = showShell && R1 > 0;
    shellSphere.visible = showShell;
    shellLabel.visible = showShell && R2 > 0.6;
    regionInLabel.visible = showShell && R1 > 1.6;
    regionOutLabel.visible = stopped && R2 > 1.2 && R2 < R_MAX - 2;
    if (showShell) {
      outerRing.scale.setScalar(Math.max(1e-3, R2));
      innerRing.scale.setScalar(Math.max(1e-3, R1));
      innerRing.position.x = (beta * kp.c * kp.tau) / 2;
      shellSphere.scale.setScalar(Math.max(1e-3, R2));
      shellLabel.position.set(R2 * Math.cos(1.1), R2 * Math.sin(1.1) + 0.3, 0);
      regionInLabel.position.set(-R1 * 0.45, -R1 * 0.5, 0);
      regionOutLabel.position.set(Math.min(R_MAX - 1.5, R2 + 1.7) * Math.cos(-0.5), Math.min(R_MAX - 1.5, R2 + 1.7) * Math.sin(-0.5) - 0.2, 0);
    }
    for (let i = 0; i < NL; i++) {
      const psi0 = ((i + 0.5) * 2 * Math.PI) / NL;
      const n = kinkLine(kp, t, psi0, R_MAX, kLine);
      for (let sgi = 0; sgi < 3; sgi++) {
        const a = Math.min(sgi, n - 1);
        const b = Math.min(sgi + 1, n - 1);
        const o = (i * 3 + sgi) * 6;
        kSegPos[o] = kLine[2 * a]; kSegPos[o + 1] = kLine[2 * a + 1]; kSegPos[o + 2] = 0;
        kSegPos[o + 3] = kLine[2 * b]; kSegPos[o + 4] = kLine[2 * b + 1]; kSegPos[o + 5] = 0;
        // colour: in the 4-point case segment 1 is the kink, in the 3-point case (no inner sphere yet) segment 0 is
        let col = cOld;
        if (stopped) {
          if (n === 4) col = sgi === 0 ? cStatic : sgi === 1 ? cKink : cOld;
          else if (n === 3) col = R1 > 0 ? (sgi === 0 ? cStatic : sgi === 1 ? cKink : cOld) : sgi === 0 ? cKink : cOld;
          else if (n === 2) col = R1 > 0 ? (sgi === 0 ? cStatic : cKink) : cKink;
        }
        kSegCol[o] = kSegCol[o + 3] = col.r; kSegCol[o + 1] = kSegCol[o + 4] = col.g; kSegCol[o + 2] = kSegCol[o + 5] = col.b;
      }
    }
    kGeo.attributes.position.needsUpdate = true;
    kGeo.attributes.color.needsUpdate = true;
    probeRing.scale.setScalar(probeR);
    probeRing.position.x = (beta * kp.c * kp.tau) / 2;
    probeRLabel.position.set(probeR * Math.cos(-2.3), probeR * Math.sin(-2.3) - 0.25, 0);
    probeRLabel.element.textContent = `probe r = ${probeR.toFixed(1)}`;
    drawInsetKink(shellNow);
  }

  // =====================================================================
  // Frame loop
  // =====================================================================
  const kinkLoop = () => tStop + R_MAX / CS + 1.4;
  stage.onFrame((dt) => {
    if (morph) {
      morph.u = Math.min(1, morph.u + dt / 1.2);
      const e = morph.u < 0.5 ? 2 * morph.u * morph.u : 1 - (-2 * morph.u + 2) ** 2 / 2;
      ratio = morph.r0 + (morph.r1 - morph.r0) * e;
      deltaDeg = morph.d0 + (morph.d1 - morph.d0) * e;
      ratioCtl.set(Number(ratio.toFixed(2)), false);
      deltaCtl.set(Math.round(deltaDeg), false);
      if (morph.u >= 1) {
        ratio = morph.r1;
        deltaDeg = morph.d1;
        morph = null;
      }
    }
    if (playing) {
      tWave += dt * speed;
      if (tWave > 1e4) tWave = 0;
      if (view === 'kink') {
        tKink += dt * speed;
        if (tKink > kinkLoop()) {
          tKink = 0;
          prevShell = 0;
        }
      }
    }
    if (view === 'plane') drawPlane();
    else if (view === 'dipole') drawDipole();
    else {
      drawKink();
      if (prevShell < probeR && shellNow >= probeR) kinkPassed = true;
      prevShell = shellNow;
    }
    updateReadouts();
  });

  // =====================================================================
  // Controls
  // =====================================================================
  const ui = new Panel(panel);
  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'plane', label: 'Plane wave' }, { value: 'dipole', label: 'Dipole antenna' }, { value: 'kink', label: 'Kinked field lines' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
  ]);
  ui.slider({ key: 'speed', label: 'Animation speed', min: 0.1, max: 2, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  const secWave = ui.section('Wave');
  const secWaveEl = ui.root.lastElementChild as HTMLElement;
  void secWave;
  ui.slider({ key: 'lambda', label: 'Wavelength λ', min: 400, max: 700, step: 5, value: lambdaNm, format: (v) => `${v} nm`, onInput: (v) => { lambdaNm = v; } });
  const ampCtl = ui.slider({ key: 'amp', label: 'Amplitude E₀', min: 100, max: 1500, step: 10, value: E0, format: (v) => `${v} V/m`, onInput: (v) => { E0 = v; } });

  ui.section('Polarization');
  const secPolEl = ui.root.lastElementChild as HTMLElement;
  const presetCtl = ui.select<Preset>({
    key: 'preset', label: 'Morph to', value: 'linear',
    options: [{ value: 'linear', label: 'Linear' }, { value: 'elliptical', label: 'Elliptical' }, { value: 'circular', label: 'Circular' }],
    onChange: (v) => {
      const target = v === 'linear' ? { r: ratio, d: 0 } : v === 'circular' ? { r: 1, d: deltaDeg < 0 ? -90 : 90 } : { r: 0.55, d: 60 };
      morph = { r0: ratio, d0: deltaDeg, r1: target.r, d1: target.d, u: 0 };
    },
  });
  const deltaCtl = ui.slider({ key: 'delta', label: 'Phase δ (Ey behind Ex)', min: -180, max: 180, step: 1, value: deltaDeg, unit: '°', onInput: (v) => { morph = null; deltaDeg = v; } });
  const ratioCtl = ui.slider({ key: 'ratio', label: 'Amplitude ratio Ey/Ex', min: 0, max: 2, step: 0.01, value: ratio, format: (v) => v.toFixed(2), onInput: (v) => { morph = null; ratio = v; } });
  ui.toggle({ key: 'polarizerOn', label: 'Polarizer in the beam', value: polarizerOn, onChange: (v) => { polarizerOn = v; polG.visible = v; } });
  ui.slider({ key: 'thetaP', label: 'Polarizer angle', min: 0, max: 180, step: 1, value: thetaPDeg, unit: '°', onInput: (v) => { thetaPDeg = v; } });
  ui.toggle({ key: 'showB', label: 'Show B field', value: showB, onChange: (v) => { showB = v; bArrows.shafts.visible = bArrows.heads.visible = btipLine.visible = bLabel.visible = v; } });
  ui.toggle({ key: 'showS', label: 'Show Poynting vector', value: showS, onChange: (v) => { showS = v; sArrows.shafts.visible = sArrows.heads.visible = v; } });

  ui.section('Plane wave readouts');
  const secPolR = ui.root.lastElementChild as HTMLElement;
  const rTrans = ui.readout('trans', 'transmitted I/I₀');
  const rMalus = ui.readout('malus', 'cos²(θ − ψ)');
  const rKind = ui.readout('kind', 'polarization');
  const rBE = ui.readout('bratio', 'c|B| / |E|');
  const rAng = ui.readout('angle', 'angle E to B');
  const rB0 = ui.readout('b0', 'B₀ = E₀/c');
  const rS = ui.readout('S', '⟨S⟩ = ε₀cE₀²/2');
  const rF = ui.readout('freq', 'frequency f = c/λ');

  ui.section('Dipole antenna');
  const secDip = ui.root.lastElementChild as HTMLElement;
  const probeCtl = ui.slider({ key: 'probe', label: 'Probe angle θ from the axis', min: 0, max: 180, step: 1, value: probeDeg, unit: '°', onInput: (v) => { probeDeg = v; } });
  void probeCtl;
  ui.toggle({ key: 'pattern', label: 'Show radiation doughnut', value: showPattern, onChange: (v) => { showPattern = v; donutG.visible = v; } });
  const rSin = ui.readout('sin2', 'dP/dΩ ÷ max = sin²θ');
  const rLarmor = ui.readout('larmor', '∮ dP/dΩ ÷ Larmor');
  ui.note('The power is summed over the whole sphere numerically and compared with the Larmor formula. A value of 1.000000 means they agree.');

  ui.section('Kinked field lines');
  const secKink = ui.root.lastElementChild as HTMLElement;
  ui.slider({ key: 'beta', label: 'Charge speed v/c', min: 0.1, max: 0.95, step: 0.01, value: beta, format: (v) => v.toFixed(2), onInput: (v) => { beta = v; tKink = 0; prevShell = 0; } });
  ui.slider({ key: 'tstop', label: 'Stop time', min: 0.5, max: 4, step: 0.1, value: tStop, format: (v) => `${v.toFixed(1)} s`, onInput: (v) => { tStop = v; tKink = 0; prevShell = 0; } });
  ui.slider({ key: 'probeR', label: 'Probe radius', min: 1, max: 8, step: 0.1, value: probeR, format: (v) => v.toFixed(1), onInput: (v) => { probeR = v; kinkPassed = false; prevShell = shellNow; } });
  ui.buttons([{ label: 'Replay', key: 'replay', onClick: () => { tKink = 0; prevShell = 0; kinkPassed = false; } }]);
  const rShell = ui.readout('shell', 'kink shell radius');
  const rGamma = ui.readout('gamma', 'γ = 1/√(1 − v²/c²)');
  const rRegion = ui.readout('region', 'field at probe');
  const rRatio = ui.readout('kratio', 'E⊥/Eᵣ in kink at probe');

  ui.section('Constants of nature');
  const rEps = ui.readout('eps0', 'ε₀');
  const rMu = ui.readout('mu0', 'μ₀');
  const rC = ui.readout('c', 'c = 1/√(μ₀ε₀)');
  rEps(`${EPS0.toExponential(10)} F/m`);
  rMu(`${MU0.toExponential(11)} N/A²`);
  rC(`${cFromConstants().toFixed(1)} m/s`);
  ui.legend([
    { color: css(COL_E), label: 'electric field E' },
    { color: css(COL_B), label: 'magnetic field B' },
    { color: css(LIME), label: 'energy flow, radiation' },
    { color: css(COL_Q), label: 'charge' },
  ]);

  // The pattern integral is independent of the settings, so compute it once.
  const larmorCheck = (() => {
    const q = 1.602176634e-19;
    const d0 = 1e-10;
    const om = (2 * Math.PI * C) / 550e-9;
    return integrateSphere((th) => dipoleDPdOmega(q * d0, om, th), 200) / larmorDipoleMean(q, d0, om);
  })();

  function updateReadouts(): void {
    if (view === 'plane') {
      const p = pol();
      rTrans(polarizerOn ? `${(transNow * 100).toFixed(2)} %` : 'no polarizer');
      const kind = polKind(p);
      if (kind === 'linear' && polarizerOn) {
        const psi = ellipseTilt(p);
        rMalus(`${(Math.cos(thetaPDeg * DEG - psi) ** 2 * 100).toFixed(2)} %`);
      } else rMalus(kind === 'linear' ? '…' : 'not linear');
      rKind(kind);
      planeE(p, kS(), kS() * CS, 0.3, tWave, e3);
      planeBFromE(e3, b3);
      const e = Math.hypot(e3[0], e3[1]);
      const b = Math.hypot(b3[0], b3[1]);
      if (e > 1e-6 * E0) {
        rBE((b * C / e).toFixed(6));
        rAng(`${(Math.acos(Math.max(-1, Math.min(1, (e3[0] * b3[0] + e3[1] * b3[1]) / (e * b)))) / DEG).toFixed(3)}°`);
      }
      rB0(`${((E0 / C) * 1e6).toFixed(3)} µT`);
      rS(`${meanIntensity(p).toFixed(0)} W/m²`);
      rF(`${(C / (lambdaNm * 1e-9) / 1e12).toFixed(0)} THz`);
    } else if (view === 'dipole') {
      rSin((Math.sin(probeDeg * DEG) ** 2).toFixed(3));
      rLarmor(larmorCheck.toFixed(6));
    } else {
      const kp = kinkP();
      rShell(tKink > tStop ? shellNow.toFixed(2) : 'not yet');
      rGamma(gamma(beta).toFixed(3));
      const reg = kinkRegion(kp, tKink, probeR);
      rRegion(reg === 'moving' ? 'moving charge' : reg === 'old' ? 'old (points ahead)' : reg === 'kink' ? 'kink: radiation' : 'new static');
      rRatio(kinkFieldRatio(kp, probeR, Math.PI / 2).toFixed(1));
    }
  }

  function setView(v: View): void {
    view = v;
    for (const k of Object.keys(groups) as View[]) groups[k].visible = k === v;
    secWaveEl.style.display = v === 'kink' ? 'none' : '';
    ampCtl.el.style.display = v === 'plane' ? '' : 'none';
    secPolEl.style.display = v === 'plane' ? '' : 'none';
    secPolR.style.display = v === 'plane' ? '' : 'none';
    secDip.style.display = v === 'dipole' ? '' : 'none';
    secKink.style.display = v === 'kink' ? '' : 'none';
    if (v === 'kink') {
      tKink = 0;
      prevShell = 0;
    }
    paintLegend();
    stage.flyTo(CAM[v], TGT[v]);
  }

  void presetCtl;
  void polLabel;
  setView('plane');

  return {
    state: () => {
      const p = pol();
      return {
        view,
        delta: deltaDeg,
        ratio,
        circ: circularity(p),
        kind: polKind(p),
        polarizerOn,
        thetaP: thetaPDeg,
        trans: polarizerTransmission(p, thetaPDeg * DEG),
        lambda: lambdaNm,
        amp: E0,
        probeTheta: probeDeg,
        sin2: Math.sin(probeDeg * DEG) ** 2,
        beta,
        tStop,
        probeR,
        shellR: shellNow,
        kinkPassed,
        playing,
      };
    },
    dispose: () => {
      legend.remove();
      inset.remove();
      shaftGeo.dispose();
      headGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'em-waves',
  number: 28,
  title: 'Electromagnetic Waves',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'A shaking charge sends out light that carries itself through empty space.',
  content,
  mount,
};

export default topic;
