import * as THREE from 'three';
import { createStage, makeArrow, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AME2020, decayMode, fission, fusionQ, isMagic, MAGIC, measured, nuclideName, peakBA, radius, stableList, terms, valleyZ,
  bindingPerA, type Breakdown, type Mode, type Terms,
} from './physics.ts';

type View = 'valley' | 'curve' | 'builder';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  valley: { pos: [0.5, 10.6, 6.4], target: [0.4, 0, -0.6] },
  curve: { pos: [-0.4, 3.6, 9.6], target: [-0.4, 2.2, 0] },
  builder: { pos: [0, 1.2, 6.2], target: [0, 0, 0] },
};

// ---- Valley landscape geometry
const NMAX = 160;
const ZMAX = 110;
const NX = NMAX + 1;
const NZ = ZMAX + 1;
const S = 0.06; // scene units per nucleon step
const CAP = 4; // MeV of B/A deficit where the landscape flattens
const HS = 0.3; // scene units per MeV of B/A deficit
const gx = (N: number) => (N - NMAX / 2) * S;
const gz = (Z: number) => (ZMAX / 2 - Z) * S;

// ---- B/A curve geometry
const AMAX = 270;
const cx = (A: number) => (A - 135) * 0.031;
const cy = (ba: number) => Math.max(0, ba) * 0.5;

// ---- Builder geometry
const FM = 0.22; // scene units per fm
const MAXA = NMAX + ZMAX + 2;

const MODE_COLOR: Record<Mode, number> = {
  'beta-': PALETTE.cyan,
  'beta+': PALETTE.rose,
  alpha: PALETTE.amber,
  fission: PALETTE.green,
  stable: 0xe9eefb,
  unbound: 0x151b2a,
};
const MODE_TEXT: Record<Mode, string> = {
  'beta-': 'β⁻', 'beta+': 'β⁺ / EC', alpha: 'α', fission: 'fission', stable: 'stable', unbound: 'unbound',
};
const TERM_COLOR = { V: PALETTE.green, S: PALETTE.rose, C: PALETTE.amber, A: PALETTE.violet, P: PALETTE.cyan };
const NEUTRON = 0x9aa6bd;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.valley.pos, target: CAM.valley.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  let view: View = 'valley';
  let Z = 92;
  let N = 146;
  let split = 0.4;
  const t: Terms = { volume: true, surface: true, coulomb: true, asymmetry: true, pairing: true };
  let touched = false;
  let peak = peakBA(t);

  const valleyG = new THREE.Group();
  const curveG = new THREE.Group();
  const buildG = new THREE.Group();
  scene.add(valleyG, curveG, buildG);

  // =====================================================================
  // Valley of stability landscape
  const heights = new Float32Array(NX * NZ);
  const modes: Mode[] = new Array(NX * NZ).fill('unbound');
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(NX * NZ * 3);
  const sCol = new Float32Array(NX * NZ * 3);
  for (let z = 0; z < NZ; z++) {
    for (let n = 0; n < NX; n++) {
      const i = z * NX + n;
      sPos[i * 3] = gx(n);
      sPos[i * 3 + 2] = gz(z);
    }
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  {
    const idx: number[] = [];
    for (let z = 0; z < NZ - 1; z++) {
      for (let n = 0; n < NX - 1; n++) {
        const a = z * NX + n;
        idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1);
      }
    }
    sGeo.setIndex(idx);
  }
  const surf = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }));
  valleyG.add(surf);
  const surfWire = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.035, depthWrite: false }));
  valleyG.add(surfWire);
  const floor = makeGrid(11, 22);
  floor.position.y = -0.03;
  valleyG.add(floor);

  // Valley line Z0(A), N = Z line, magic-number lines
  const VL = 280;
  const vlPos = new Float32Array(VL * 3);
  const vlGeo = new THREE.BufferGeometry();
  vlGeo.setAttribute('position', new THREE.BufferAttribute(vlPos, 3));
  const vLine = new THREE.Line(vlGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  vLine.frustumCulled = false;
  valleyG.add(vLine);
  const nzPos = new Float32Array(NZ * 3);
  const nzGeo = new THREE.BufferGeometry();
  nzGeo.setAttribute('position', new THREE.BufferAttribute(nzPos, 3));
  const nzLine = new THREE.Line(nzGeo, new THREE.LineDashedMaterial({ color: 0x8391ab, dashSize: 0.12, gapSize: 0.08 }));
  nzLine.frustumCulled = false;
  valleyG.add(nzLine);
  const magicN = MAGIC.filter((m) => m <= NMAX);
  const magicZ = MAGIC.filter((m) => m <= ZMAX);
  const mgSegs = magicN.length * (NZ - 1) + magicZ.length * (NX - 1);
  const mgPos = new Float32Array(mgSegs * 6);
  const mgGeo = new THREE.BufferGeometry();
  mgGeo.setAttribute('position', new THREE.BufferAttribute(mgPos, 3));
  const mgLines = new THREE.LineSegments(mgGeo, new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.55 }));
  mgLines.frustumCulled = false;
  valleyG.add(mgLines);
  for (const m of magicN) stage.label(String(m), [gx(m), 0.02, gz(0) + 0.28], 'muted', valleyG).element.style.color = css(PALETTE.violet);
  for (const m of magicZ) stage.label(String(m), [gx(NMAX) + 0.3, 0.02, gz(m)], 'muted', valleyG).element.style.color = css(PALETTE.violet);
  stage.label('N (neutrons) →', [gx(100), 0.02, gz(0) + 0.65], 'muted', valleyG);
  stage.label('Z (protons) →', [gx(NMAX) + 0.95, 0.02, gz(70)], 'muted', valleyG);
  const nzLabel = stage.label('N = Z', [0, 0, 0], 'muted', valleyG);
  const vLabel = stage.label('valley floor Z₀(A)', [0, 0, 0], '', valleyG);
  vLabel.element.style.color = css(PALETTE.amber);

  // Stable nuclides as glowing dots
  const STABLE = stableList();
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 });
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), dotMat, STABLE.length);
  valleyG.add(dots);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  const halos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), haloMat, STABLE.length);
  valleyG.add(halos);

  // Selected nucleus marker
  const selMark = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 32), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  selMark.rotation.x = Math.PI / 2;
  valleyG.add(selMark);
  const selStemGeo = new THREE.BufferGeometry();
  const selStemPos = new Float32Array(6);
  selStemGeo.setAttribute('position', new THREE.BufferAttribute(selStemPos, 3));
  const selStem = new THREE.Line(selStemGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan }));
  selStem.frustumCulled = false;
  valleyG.add(selStem);
  const selLabel = stage.label('', [0, 0, 0], 'big', valleyG);
  selLabel.element.style.color = css(PALETTE.cyan);

  const hAt = (n: number, z: number) => heights[z * NX + n];
  const col = new THREE.Color();
  const dark = new THREE.Color(0x0b0f1a);
  const m4 = new THREE.Matrix4();

  function rebuildValley(): void {
    let ref = -Infinity;
    const ba = new Float32Array(NX * NZ);
    for (let z = 0; z < NZ; z++) {
      for (let n = 0; n < NX; n++) {
        const i = z * NX + n;
        const v = z + n > 0 ? bindingPerA(z, n, t) : -Infinity;
        ba[i] = v;
        if (v > ref) ref = v;
      }
    }
    for (let z = 0; z < NZ; z++) {
      for (let n = 0; n < NX; n++) {
        const i = z * NX + n;
        const def = Number.isFinite(ba[i]) ? Math.min(CAP, ref - ba[i]) : CAP;
        const h = def * HS;
        heights[i] = h;
        sPos[i * 3 + 1] = h;
        const md = z + n > 0 ? decayMode(z, n, t) : 'unbound';
        modes[i] = md;
        // Bright near the floor, fading toward the capped plateau.
        const f = md === 'unbound' ? 0 : Math.max(0.12, 1 - def / CAP);
        col.set(MODE_COLOR[md]).lerp(dark, 1 - f * 0.9);
        sCol[i * 3] = col.r;
        sCol[i * 3 + 1] = col.g;
        sCol[i * 3 + 2] = col.b;
      }
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.color.needsUpdate = true;
    sGeo.computeVertexNormals();
    sGeo.computeBoundingSphere();

    // Valley floor line: follow Z0(A) and read the surface height there.
    let k = 0;
    let lastN = 0;
    let lastZ = 0;
    for (let A = 2; A < 2 + VL; A++) {
      const z0 = valleyZ(A, t);
      const n0 = A - z0;
      if (n0 > NMAX || z0 > ZMAX || n0 < 0) break;
      const zi = Math.min(ZMAX, Math.max(0, Math.round(z0)));
      const ni = Math.min(NMAX, Math.max(0, Math.round(n0)));
      vlPos[k * 3] = gx(n0);
      vlPos[k * 3 + 1] = hAt(ni, zi) + 0.06;
      vlPos[k * 3 + 2] = gz(z0);
      if (A === 150) {
        lastN = n0;
        lastZ = z0;
      }
      k++;
    }
    vlGeo.setDrawRange(0, k);
    vlGeo.attributes.position.needsUpdate = true;
    vLabel.position.set(gx(lastN) + 0.9, hAt(Math.round(lastN), Math.round(lastZ)) + 0.1, gz(lastZ) + 0.2);

    for (let z = 0; z < NZ; z++) {
      nzPos[z * 3] = gx(z);
      nzPos[z * 3 + 1] = hAt(z, z) + 0.02;
      nzPos[z * 3 + 2] = gz(z);
    }
    nzGeo.attributes.position.needsUpdate = true;
    nzLine.computeLineDistances();
    nzLabel.position.set(gx(ZMAX) + 0.1, hAt(ZMAX, ZMAX) + 0.25, gz(ZMAX));

    let q = 0;
    const seg = (n1: number, z1: number, n2: number, z2: number) => {
      mgPos.set([gx(n1), hAt(n1, z1) + 0.015, gz(z1), gx(n2), hAt(n2, z2) + 0.015, gz(z2)], q);
      q += 6;
    };
    for (const m of magicN) for (let z = 0; z < NZ - 1; z++) seg(m, z, m, z + 1);
    for (const m of magicZ) for (let n = 0; n < NX - 1; n++) seg(n, m, n + 1, m);
    mgGeo.attributes.position.needsUpdate = true;

    const sc = new THREE.Vector3(1, 1, 1);
    const qq = new THREE.Quaternion();
    const p = new THREE.Vector3();
    STABLE.forEach((s, i) => {
      p.set(gx(s.N), hAt(s.N, s.Z) + 0.04, gz(s.Z));
      m4.compose(p, qq, sc);
      dots.setMatrixAt(i, m4);
      halos.setMatrixAt(i, m4);
    });
    dots.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
  }

  function placeSelection(): void {
    const h = hAt(Math.min(N, NMAX), Math.min(Z, ZMAX));
    selMark.position.set(gx(N), h + 0.05, gz(Z));
    selStemPos.set([gx(N), h + 0.05, gz(Z), gx(N), h + 0.75, gz(Z)]);
    selStemGeo.attributes.position.needsUpdate = true;
    selLabel.position.set(gx(N), h + 0.95, gz(Z));
    selLabel.element.textContent = nuclideName(Z, N);
  }

  // =====================================================================
  // B/A curve as a ribbon
  const rGeo = new THREE.BufferGeometry();
  const rPos = new Float32Array(AMAX * 2 * 3);
  const rCol = new Float32Array(AMAX * 2 * 3);
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  rGeo.setAttribute('color', new THREE.BufferAttribute(rCol, 3));
  {
    const idx: number[] = [];
    for (let i = 0; i < AMAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    rGeo.setIndex(idx);
  }
  const ribbon = new THREE.Mesh(rGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, emissive: 0x111a2a, transparent: true, opacity: 0.92 }));
  curveG.add(ribbon);
  const edgeGeo = new THREE.BufferGeometry();
  const edgePos = new Float32Array(AMAX * 3);
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
  const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  edge.frustumCulled = false;
  curveG.add(edge);
  // Axes and ticks
  {
    const pts: number[] = [cx(0), 0, 0, cx(AMAX), 0, 0, cx(0), 0, 0, cx(0), cy(9.5), 0];
    for (let b = 2; b <= 8; b += 2) {
      pts.push(cx(0), cy(b), 0, cx(AMAX), cy(b), 0);
      stage.label(`${b}`, [cx(0) - 0.3, cy(b), 0], 'muted', curveG);
    }
    for (let A = 50; A <= 250; A += 50) {
      pts.push(cx(A), 0, 0, cx(A), -0.1, 0);
      stage.label(String(A), [cx(A), -0.3, 0], 'muted', curveG);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    curveG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c3852 })));
    stage.label('mass number A →', [cx(215), -0.62, 0], 'muted', curveG);
    stage.label('B/A (MeV)', [cx(0) + 0.1, cy(9.9), 0], 'muted', curveG);
  }
  // Measured check points (AME2020)
  const measGeo = new THREE.SphereGeometry(0.07, 16, 12);
  const measMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
  for (const m of AME2020) {
    const A = m.Z + m.N;
    const mesh = new THREE.Mesh(measGeo, measMat);
    mesh.position.set(cx(A), cy(m.ba), 0.42);
    curveG.add(mesh);
    const up = m.name === '⁶²Ni' ? 0.3 : m.name === '⁵⁶Fe' ? 0.55 : 0.28;
    const l = stage.label(m.name, [cx(A) + (m.name === '⁵⁶Fe' ? -0.25 : 0.1), cy(m.ba) + up, 0.42], 'muted', curveG);
    l.element.style.fontSize = '11px';
  }
  const curveLegend = stage.label('white dots: measured (AME2020)', [cx(200), cy(9.9), 0], 'muted', curveG);
  curveLegend.element.style.fontSize = '11px';

  const cMarker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshStandardMaterial({ color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 0.6 }));
  curveG.add(cMarker);
  const cLabel = stage.label('', [0, 0, 0], 'big', curveG);
  cLabel.element.style.color = css(PALETTE.cyan);
  const fragMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.6 });
  const frag1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), fragMat);
  const frag2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), fragMat);
  curveG.add(frag1, frag2);
  const fusMark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: PALETTE.green, emissive: PALETTE.green, emissiveIntensity: 0.6 }));
  curveG.add(fusMark);
  const arr1 = makeArrow(new THREE.Vector3(1, 0, 0), 1, PALETTE.amber);
  const arr2 = makeArrow(new THREE.Vector3(1, 0, 0), 1, PALETTE.amber);
  const arrF = makeArrow(new THREE.Vector3(1, 0, 0), 1, PALETTE.green);
  curveG.add(arr1, arr2, arrF);
  const fisLabel = stage.label('', [0, 0, 0], '', curveG);
  fisLabel.element.style.color = css(PALETTE.amber);
  const fusLabel = stage.label('', [0, 0, 0], '', curveG);
  fusLabel.element.style.color = css(PALETTE.green);

  function rebuildCurve(): void {
    const pk = peak.A;
    for (let i = 0; i < AMAX; i++) {
      const A = i + 1;
      const z0 = valleyZ(A, t);
      // Smooth curve: continuous Z, no pairing term.
      const ba = terms(z0, A - z0, { ...t, pairing: false }).B / A;
      const x = cx(A);
      const y = cy(ba);
      rPos.set([x, y + 0.14, -0.35, x, y - 0.14, 0.35], i * 6);
      edgePos.set([x, y + 0.145, -0.35], i * 3);
      col.set(A <= pk ? PALETTE.cyan : PALETTE.amber).lerp(dark, 0.35);
      rCol.set([col.r, col.g, col.b, col.r, col.g, col.b], i * 6);
    }
    rGeo.attributes.position.needsUpdate = true;
    rGeo.attributes.color.needsUpdate = true;
    rGeo.computeVertexNormals();
    rGeo.computeBoundingSphere();
    edgeGeo.attributes.position.needsUpdate = true;
  }

  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vd = new THREE.Vector3();
  function pointArrow(arrow: THREE.ArrowHelper, from: THREE.Vector3, to: THREE.Vector3, pad = 0.14): void {
    vd.subVectors(to, from);
    const len = vd.length();
    arrow.visible = len > pad * 2 + 0.05;
    if (!arrow.visible) return;
    vd.normalize();
    arrow.position.copy(from).addScaledVector(vd, pad);
    arrow.setDirection(vd);
    const L = len - pad * 2;
    arrow.setLength(L, Math.min(0.22, L * 0.35), Math.min(0.12, L * 0.2));
  }

  let fis = fission(Z, N, split, t);
  let qFus = fusionQ(Z, N, t);
  function placeCurve(): void {
    const A = Z + N;
    const ba = bindingPerA(Z, N, t);
    cMarker.position.set(cx(A), cy(ba), 0.42);
    cLabel.position.set(cx(A), cy(ba) + 0.45, 0.42);
    cLabel.element.textContent = nuclideName(Z, N);
    // Fission of (Z, N) + n
    fis = fission(Z, N, split, t);
    const A1 = fis.Z1 + fis.N1;
    const A2 = fis.Z2 + fis.N2;
    frag1.position.set(cx(A1), cy(bindingPerA(fis.Z1, fis.N1, t)), 0.42);
    frag2.position.set(cx(A2), cy(bindingPerA(fis.Z2, fis.N2, t)), 0.42);
    va.copy(cMarker.position);
    pointArrow(arr1, va, frag1.position);
    pointArrow(arr2, va, frag2.position);
    const fisOK = A >= 4;
    frag1.visible = frag2.visible = fisOK;
    if (!fisOK) arr1.visible = arr2.visible = false;
    fisLabel.visible = fisOK && view === 'curve';
    fisLabel.position.set((cx(A1) + cx(A)) / 2, Math.max(cy(ba), frag1.position.y) + 0.55, 0.42);
    fisLabel.element.textContent = `fission ${nuclideName(fis.Z1, fis.N1)} + ${nuclideName(fis.Z2, fis.N2)}: ${fis.Q >= 0 ? 'releases' : 'costs'} ${Math.abs(fis.Q).toFixed(0)} MeV`;
    // Fusion of two copies
    qFus = fusionQ(Z, N, t);
    const fusOK = 2 * A <= AMAX;
    fusMark.visible = fusOK;
    fusLabel.visible = fusOK && view === 'curve';
    if (fusOK) {
      vb.set(cx(2 * A), cy(bindingPerA(2 * Z, 2 * N, t)), 0.42);
      fusMark.position.copy(vb);
      pointArrow(arrF, va, vb);
      fusLabel.position.set((cx(A) + cx(2 * A)) / 2, Math.max(va.y, vb.y) - 0.5, 0.42);
      fusLabel.element.textContent = `fusion ${nuclideName(Z, N)} + ${nuclideName(Z, N)} → ${nuclideName(2 * Z, 2 * N)}: ${qFus >= 0 ? 'releases' : 'costs'} ${Math.abs(qFus).toFixed(1)} MeV`;
    } else {
      arrF.visible = false;
    }
  }

  // =====================================================================
  // Nucleus builder: close-packed spheres, R = 1.2 A^{1/3} fm
  // FCC lattice with nuclear-matter density ρ = 3/(4π r0³) ≈ 0.138 fm⁻³.
  const rho = 3 / (4 * Math.PI * 1.2 ** 3);
  const aLat = Math.cbrt(4 / rho);
  const nnDist = aLat / Math.SQRT2;
  const sites: THREE.Vector3[] = [];
  {
    const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    const R = 6;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
      for (const b of basis) sites.push(new THREE.Vector3((i + b[0]) * aLat, (j + b[1]) * aLat, (k + b[2]) * aLat));
    }
    // Tiny deterministic offset breaks shell ties so the cluster grows smoothly.
    const c = new THREE.Vector3(0.11, 0.07, 0.03).multiplyScalar(aLat);
    sites.sort((p, q) => p.distanceToSquared(c) - q.distanceToSquared(c));
    sites.length = MAXA;
    sites.forEach((s) => s.sub(c));
  }
  // Deterministic shuffle order for proton/neutron assignment.
  const order = Array.from({ length: MAXA }, (_, i) => i);
  {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = MAXA - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const nucGeo = new THREE.SphereGeometry(1, 20, 14);
  const nucMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
  const nucleons = new THREE.InstancedMesh(nucGeo, nucMat, MAXA);
  buildG.add(nucleons);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false }));
  buildG.add(shell);
  const bLabel = stage.label('', [0, 0, 0], 'big');
  bLabel.element.style.color = css(PALETTE.cyan);
  const rLabel = stage.label('', [0, 0, 0], 'muted');
  const cRed = new THREE.Color(PALETTE.red);
  const cGrey = new THREE.Color(NEUTRON);

  function rebuildNucleus(): void {
    const A = Z + N;
    // Mark the first Z entries of the shuffled order as protons, among the A innermost sites.
    const idx = order.filter((i) => i < A);
    const isP = new Uint8Array(A);
    for (let k = 0; k < Z; k++) isP[idx[k]] = 1;
    const r = (nnDist / 2) * 0.97 * FM;
    const sc = new THREE.Vector3(r, r, r);
    const qq = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (let i = 0; i < A; i++) {
      p.copy(sites[i]).multiplyScalar(FM);
      m4.compose(p, qq, sc);
      nucleons.setMatrixAt(i, m4);
      nucleons.setColorAt(i, isP[i] ? cRed : cGrey);
    }
    nucleons.count = A;
    nucleons.instanceMatrix.needsUpdate = true;
    if (nucleons.instanceColor) nucleons.instanceColor.needsUpdate = true;
    nucleons.computeBoundingSphere();
    const R = radius(A) * FM;
    shell.scale.setScalar(R);
    bLabel.position.set(0, R + 0.62, 0);
    bLabel.element.textContent = `${nuclideName(Z, N)}  (Z = ${Z}, N = ${N})`;
    rLabel.position.set(0, R + 0.3, 0);
    rLabel.element.textContent = `R = 1.2 A^⅓ = ${radius(A).toFixed(2)} fm${isMagic(Z) && isMagic(N) ? '   · doubly magic' : isMagic(Z) || isMagic(N) ? '   · magic' : ''}`;
  }

  // =====================================================================
  // Overlays: info card (top left) and term-bar inset (bottom right)
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '260px',
    background: 'rgba(7,10,18,0.9)', borderRadius: '10px', border: '1px solid #243049', padding: '9px 12px',
    font: '11.5px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(info);
  let infoHtml = '';

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 560;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '280px', height: '150px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const sw = (c: number, txt: string) => `<div><span style="color:${css(c)}">■</span> ${txt}</div>`;
  function writeInfo(): void {
    let html = '';
    if (view === 'valley') {
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">Valley of stability</div>
<div>Height: how much less bound per nucleon than the best nucleus. Deeper is more stable.</div>
${sw(MODE_COLOR['beta-'], 'β⁻ (too many neutrons)')}${sw(MODE_COLOR['beta+'], 'β⁺ / EC (too many protons)')}${sw(MODE_COLOR.alpha, 'α')}${sw(MODE_COLOR.fission, 'fission')}${sw(MODE_COLOR.stable, 'stable by the formula')}
<div><span style="color:#fff">●</span> 250 measured stable nuclides</div>
<div><span style="color:${css(PALETTE.amber)}">—</span> Z₀(A) &nbsp;<span style="color:${css(PALETTE.violet)}">—</span> magic N, Z</div>
<div style="color:#8391ab">Colours are approximate, from the formula alone.</div>`;
    } else if (view === 'curve') {
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">Binding energy per nucleon</div>
<div>Ribbon: formula along the valley floor.</div>
<div><span style="color:${css(PALETTE.cyan)}">■</span> rising side: fusion pays</div>
<div><span style="color:${css(PALETTE.amber)}">■</span> falling side: fission pays</div>
<div>Arrows: <span style="color:${css(PALETTE.amber)}">${nuclideName(Z, N)} + n splits</span>, <span style="color:${css(PALETTE.green)}">two ${nuclideName(Z, N)} fuse</span>.</div>
<div style="color:#8391ab">Moving up the curve releases energy.</div>`;
    } else {
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">Nucleus builder</div>
<div><span style="color:${css(PALETTE.red)}">●</span> protons &nbsp;<span style="color:${css(NEUTRON)}">●</span> neutrons</div>
<div>Packed at nuclear density, about 0.14 nucleons per fm³.</div>
<div>Wire sphere: R = 1.2 A<sup>1/3</sup> fm.</div>
<div style="color:#8391ab">Magic numbers: ${MAGIC.join(', ')}.</div>`;
    }
    const low = view === 'curve';
    info.style.top = low ? '' : '10px';
    info.style.bottom = low ? '34px' : '';
    if (html !== infoHtml) {
      info.innerHTML = html;
      infoHtml = html;
    }
  }

  const COEF_V_MAX = (A: number) => 15.8 * Math.max(A, 1);
  const bd: Breakdown = { V: 0, S: 0, C: 0, A: 0, P: 0, B: 0 };
  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    terms(Z, N, t, bd);
    const A = Z + N;
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText(`${nuclideName(Z, N)}: terms of B (MeV)`, 16, 30);
    const rows: [string, number, number, boolean][] = [
      ['volume', bd.V, TERM_COLOR.V, t.volume],
      ['surface', bd.S, TERM_COLOR.S, t.surface],
      ['Coulomb', bd.C, TERM_COLOR.C, t.coulomb],
      ['asymm.', bd.A, TERM_COLOR.A, t.asymmetry],
      ['pairing', bd.P, TERM_COLOR.P, t.pairing],
      ['B total', bd.B, 0xdfe6f3, true],
    ];
    const scale = Math.max(1, COEF_V_MAX(A));
    const x0 = 130;
    const x1 = 400;
    const barW = x1 - x0;
    rows.forEach(([name, v, color, on], i) => {
      const y = 50 + i * 34;
      c.fillStyle = on ? '#b8c3d9' : '#56627c';
      c.fillText(name, 16, y + 20);
      const w = (Math.abs(v) / scale) * barW;
      c.fillStyle = on ? css(color) : '#2c3852';
      c.globalAlpha = on ? 0.9 : 0.6;
      c.fillRect(x0, y + 4, Math.max(v !== 0 ? 2 : 0, Math.min(barW, w)), 20);
      c.globalAlpha = 1;
      c.fillStyle = on ? '#dfe6f3' : '#56627c';
      c.fillText(on ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(v !== 0 && Math.abs(v) < 10 ? 2 : 0)}` : 'off', x1 + 12, y + 20);
    });
    // Shrinkage marker from volume to total
    c.strokeStyle = '#243049';
    c.beginPath();
    c.moveTo(x0, 50);
    c.lineTo(x0, 50 + 6 * 34);
    c.stroke();
  }

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'valley', label: 'Valley' }, { value: 'curve', label: 'B/A curve' }, { value: 'builder', label: 'Nucleus' }],
    onChange: (v) => setView(v),
  });
  void viewCtl;

  ui.section('Nucleus');
  const zCtl = ui.slider({ key: 'Z', label: 'Protons Z', min: 1, max: ZMAX, step: 1, value: Z, onInput: (v) => { Z = v; touched = true; changedNucleus(); } });
  const nCtl = ui.slider({ key: 'N', label: 'Neutrons N', min: 0, max: NMAX, step: 1, value: N, onInput: (v) => { N = v; touched = true; changedNucleus(); } });
  ui.buttons([
    { label: 'Snap to valley', key: 'Zv', onClick: () => {
      const A = Z + N;
      const z = Math.max(1, Math.min(ZMAX, Math.round(valleyZ(A, t))));
      if (A - z <= NMAX && A - z >= 0) { zCtl.set(z); nCtl.set(A - z); }
    } },
  ]);

  ui.section('Formula terms');
  const tog = (key: string, label: string, prop: keyof Terms) =>
    ui.toggle({ key, label, value: t[prop], onChange: (v) => { t[prop] = v; touched = true; changedTerms(); } });
  tog('termV', 'Volume  +a_V A', 'volume');
  tog('termS', 'Surface  −a_S A^⅔', 'surface');
  tog('termC', 'Coulomb  −a_C Z(Z−1)/A^⅓', 'coulomb');
  tog('termA', 'Asymmetry  −a_A (A−2Z)²/A', 'asymmetry');
  tog('termP', 'Pairing  ±δ', 'pairing');
  ui.note('Coefficients (MeV): a_V 15.8, a_S 18.3, a_C 0.714, a_A 23.2, a_P 12 with δ = a_P/√A. Least-squares fit (1) in the Wikipedia SEMF table.');

  ui.section('Fission');
  ui.slider({
    key: 'split', label: 'Split: lighter fragment share', min: 0.1, max: 0.5, step: 0.01, value: split,
    format: (v) => `${Math.round(v * 100)} : ${Math.round((1 - v) * 100)}`,
    onInput: (v) => { split = v; touched = true; placeCurve(); writeInfo(); },
  });

  ui.section('Readouts');
  const rA = ui.readout('A', 'mass number A');
  const rB = ui.readout('B', 'B (formula)', 'MeV');
  const rBA = ui.readout('BA', 'B/A (formula)', 'MeV');
  const rMeas = ui.readout('meas', 'B/A AME2020');
  const rZv = ui.readout('Zv', 'valley Z₀(A)');
  const rMode = ui.readout('mode', 'decay (approx.)');
  const rR = ui.readout('R', 'radius R', 'fm');
  const rQf = ui.readout('Qfis', 'Q fission (+n)', 'MeV');
  const rQu = ui.readout('Qfus', 'Q fusion (×2)', 'MeV');
  const rPk = ui.readout('peak', 'formula peak');

  function updateReadouts(): void {
    const A = Z + N;
    const ba = bindingPerA(Z, N, t);
    rA(A);
    rB((ba * A).toFixed(1));
    rBA(ba.toFixed(3));
    const m = measured(Z, N);
    rMeas(m ? `${m.ba.toFixed(3)} MeV (${(((ba - m.ba) / m.ba) * 100).toFixed(1)}%)` : 'not in table');
    rZv(valleyZ(A, t).toFixed(1));
    rMode(MODE_TEXT[decayMode(Z, N, t)]);
    rR(radius(A).toFixed(2));
    rQf(A >= 4 ? fis.Q.toFixed(0) : 'n/a');
    rQu(2 * A <= AMAX ? qFus.toFixed(1) : 'n/a');
    rPk(`${nuclideName(peak.Z, peak.A - peak.Z)} ${peak.ba.toFixed(3)} MeV`);
  }

  function changedNucleus(): void {
    placeSelection();
    placeCurve();
    rebuildNucleus();
    writeInfo();
    drawInset();
    updateReadouts();
  }
  function changedTerms(): void {
    peak = peakBA(t);
    rebuildValley();
    rebuildCurve();
    changedNucleus();
  }
  function setView(v: View): void {
    view = v;
    valleyG.visible = v === 'valley';
    curveG.visible = v === 'curve';
    buildG.visible = v === 'builder';
    bLabel.visible = rLabel.visible = v === 'builder';
    // CSS2D labels inside hidden groups still render in some cases: toggle explicitly.
    for (const [g, on] of [[valleyG, v === 'valley'], [curveG, v === 'curve']] as [THREE.Group, boolean][]) {
      g.traverse((o) => { if ((o as { isCSS2DObject?: boolean }).isCSS2DObject) o.visible = on; });
    }
    if (v === 'curve') placeCurve();
    stage.flyTo(CAM[v].pos, CAM[v].target);
    writeInfo();
  }

  // Frame loop: only light animation, nothing is rebuilt here.
  stage.onFrame((dt, time) => {
    if (view === 'builder') buildG.rotation.y += dt * 0.25;
    if (view === 'valley') {
      haloMat.opacity = 0.14 + 0.08 * Math.sin(time * 2.2);
      selMark.scale.setScalar(1 + 0.12 * Math.sin(time * 3));
    }
  });

  changedTerms();
  setView('valley');

  return {
    state: () => {
      const A = Z + N;
      const allOn = t.volume && t.surface && t.coulomb && t.asymmetry && t.pairing;
      return {
        Z, N, A, view, split, touched,
        volume: t.volume, surface: t.surface, coulomb: t.coulomb, asymmetry: t.asymmetry, pairing: t.pairing,
        allOn,
        ba: bindingPerA(Z, N, t),
        baPeak: peak.ba,
        peakA: peak.A,
        zValley: valleyZ(A, t),
        qFission: fis.Q,
        qFusion: qFus,
        mode: decayMode(Z, N, t),
        magicZ: isMagic(Z),
        magicN: isMagic(N),
        doublyMagic: isMagic(Z) && isMagic(N),
      };
    },
    dispose: () => {
      info.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'nuclear-binding',
  number: 57,
  title: 'Nuclear Binding Energy',
  domain: 'particle',
  level: 1,
  status: 'live',
  tagline: 'Why iron is the most stable nucleus, and where fission and fusion energy come from.',
  content,
  mount,
};

export default topic;
