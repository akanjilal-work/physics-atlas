import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  checkReaction, fmtE, forceStrengths, higgsMass, LAMBDA_PHYS, MASS_FLOOR_GEV, massW, massZ, MU_PHYS,
  PARTICLES, phiMin, potential, radiusAtCap, reactionText, rp, stepBall, tileHeight, vev, vMinDepth,
  type Ball, type Category, type SMParticle, type Verdict,
} from './physics.ts';

type View = 'table' | 'higgs' | 'reactions';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  table: { pos: [-0.3, 7.8, 13.2], target: [-0.6, 1.1, 0.2] },
  higgs: { pos: [0.6, 5.2, 9.8], target: [0.6, -0.9, 0] },
  reactions: { pos: [-1.5, 0.1, 11.2], target: [-1.5, 0, 0] },
};

const CAT_COLOR: Record<Category, number> = {
  quark: PALETTE.violet,
  lepton: PALETTE.green,
  gauge: PALETTE.cyan,
  scalar: PALETTE.amber,
};
const HADRON_COLOR = 0x9aa6bd;

// Higgs scene scales
const S_GEV = 60; // GeV of |φ| per scene unit
const VS = 8e7; // GeV⁴ of V per scene unit of height
const CAP_H = 0.7; // surface is trimmed where V reaches this height
const NR = 48;
const NT = 96;
const BALL_R = 0.2;
const H_STEP = 1 / 600;

const PITCH = 1.25;
const tileX = (p: SMParticle) => (p.col - 2) * PITCH + (p.col >= 3 ? 0.35 : 0);
const tileZ = (p: SMParticle) => (p.row - 1.5) * PITCH;

const frac = (n3: number) => {
  if (n3 % 3 === 0) return String(n3 / 3);
  return `${n3 < 0 ? '−' : '+'}${Math.abs(n3)}/3`;
};

interface Preset { key: string; label: string; ins: string[]; outs: string[]; diagram: DiagramId }
type DiagramId = 'beta' | 'muon' | 'annih' | 'hgg' | 'blob';
const PRESETS: Preset[] = [
  { key: 'beta', label: 'Beta decay', ins: ['n'], outs: ['p', 'e-', 'vebar'], diagram: 'beta' },
  { key: 'muon', label: 'Muon decay', ins: ['mu-'], outs: ['vmu', 'e-', 'vebar'], diagram: 'muon' },
  { key: 'annih', label: 'e⁺e⁻ → γγ', ins: ['e-', 'e+'], outs: ['gamma', 'gamma'], diagram: 'annih' },
  { key: 'hgg', label: 'H → γγ', ins: ['H'], outs: ['gamma', 'gamma'], diagram: 'hgg' },
  { key: 'meg', label: 'μ → eγ', ins: ['mu-'], outs: ['e-', 'gamma'], diagram: 'blob' },
  { key: 'pdecay', label: 'p → e⁺ π⁰', ins: ['p'], outs: ['e+', 'pi0'], diagram: 'blob' },
];

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.table.pos, target: CAM.table.target, fov: 42 });
  const { scene } = stage;
  // Keep CSS2D label z-indices inside their own layer so overlays stay on top.
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  let view: View = 'table';
  const tableG = new THREE.Group();
  const higgsG = new THREE.Group();
  const reactG = new THREE.Group();
  scene.add(tableG, higgsG, reactG);

  // =========================================================================
  // Particle table
  const grid = makeGrid(9, 18);
  grid.position.set(0.3, 0, 0);
  tableG.add(grid);

  const tileGeo = new THREE.BoxGeometry(1, 1, 1);
  const edgeGeo = new THREE.EdgesGeometry(tileGeo);
  interface Tile { p: SMParticle; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edge: THREE.LineSegments; h: number; label: CSS2DObject }
  const tiles: Tile[] = PARTICLES.map((p) => {
    const color = CAT_COLOR[p.category];
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.38, metalness: 0.1, transparent: true, opacity: 0.86 });
    const h = tileHeight(p.massGeV);
    const mesh = new THREE.Mesh(tileGeo, mat);
    mesh.scale.set(1.02, h, 1.02);
    mesh.position.set(tileX(p), h / 2, tileZ(p));
    mesh.userData.id = p.id;
    tableG.add(mesh);
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    edge.scale.copy(mesh.scale);
    edge.position.copy(mesh.position);
    tableG.add(edge);
    const label = stage.label('', [tileX(p), h + 0.32, tileZ(p)], 'big', tableG);
    const mtxt = p.massGeV > 0 ? fmtMass(p.massGeV) : p.category === 'lepton' ? '< 0.45 eV' : '0';
    label.element.innerHTML = `<div style="text-align:center;line-height:1.05"><b style="font-size:15px;color:${css(color)}">${p.symbol}</b><br><span style="font-size:10px;color:#9aa6bd">${mtxt}</span></div>`;
    label.element.style.background = 'transparent';
    return { p, mesh, mat, edge, h, label };
  });

  // Mass scale on the back wall
  {
    const zb = -2.45;
    const x0 = -3.35;
    const x1 = 3.55;
    const pos: number[] = [x1 + 0.1, 0, zb, x1 + 0.1, 4.9, zb];
    const marks: [number, string][] = [[1e-3, '1 MeV'], [1e-2, ''], [1e-1, '100 MeV'], [1, '1 GeV'], [10, '10 GeV'], [100, '100 GeV']];
    for (const [mv, txt] of marks) {
      const y = tileHeight(mv);
      pos.push(x0, y, zb, x1 + 0.2, y, zb);
      if (txt) {
        const l = stage.label(txt, [x1 + 0.75, y, zb], 'muted', tableG);
        l.element.style.fontSize = '11px';
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tableG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a4866, transparent: true, opacity: 0.8 })));
    const t = stage.label('mass (log scale)', [x1 + 0.1, 5.25, zb], 'muted', tableG);
    t.element.style.fontSize = '11px';
    const gens = ['I', 'II', 'III'];
    gens.forEach((gname, i) => stage.label(gname, [(i - 2) * PITCH, 0.02, 2.55], 'muted', tableG));
    stage.label('generations', [-1.25, 0.02, 2.95], 'muted', tableG).element.style.fontSize = '11px';
    const cat = (txt: string, x: number, z: number, col: number) => {
      const l = stage.label(txt, [x, 0.02, z], 'muted', tableG);
      l.element.style.color = css(col);
      l.element.style.fontSize = '11px';
    };
    cat('quarks', -3.35, -1.25, PALETTE.violet);
    cat('leptons', -3.4, 1.25, PALETTE.green);
    cat('gauge bosons', 1.6, 2.55, PALETTE.cyan);
    cat('Higgs', 3.35, -1.1, PALETTE.amber);
  }

  let selected = 'none';
  const selectTile = (id: string) => {
    selected = id;
    for (const t of tiles) {
      const on = t.p.id === id;
      t.mat.emissiveIntensity = on ? 0.85 : 0.28;
      t.mat.opacity = on ? 0.97 : id === 'none' ? 0.86 : 0.62;
    }
    particleCtl.set(id, false);
    writeInfo();
    drawInset();
  };

  // =========================================================================
  // Higgs potential
  let muSigned = MU_PHYS; // μ² = sign·μ²
  let lambda = LAMBDA_PHYS;
  const mu2 = () => Math.sign(muSigned) * muSigned * muSigned;

  const surfGeo = new THREE.BufferGeometry();
  const nV = (NR + 1) * (NT + 1);
  const sPos = new Float32Array(nV * 3);
  const sCol = new Float32Array(nV * 3);
  surfGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  {
    const idx: number[] = [];
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j;
        const b = a + NT + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    surfGeo.setIndex(idx);
  }
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.93 }));
  higgsG.add(surf);
  const wire = new THREE.Mesh(surfGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.07, depthWrite: false }));
  higgsG.add(wire);

  const RING_N = 160;
  const ringPos = new Float32Array(RING_N * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  ring.frustumCulled = false;
  higgsG.add(ring);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: PALETTE.amber, emissiveIntensity: 0.55, roughness: 0.3 }));
  higgsG.add(ball);
  const trail = new Trail(600, PALETTE.amber, 0.9);
  higgsG.add(trail.line);

  const peakLabel = stage.label('φ = 0: symmetric, unstable', [0, 0.45, 0], 'muted', higgsG);
  const rimLabel = stage.label('', [0, 0, 0], '', higgsG);
  rimLabel.element.style.color = css(PALETTE.green);
  const reLabel = stage.label('Re φ', [0, 0, 0], 'muted', higgsG);
  const imLabel = stage.label('Im φ', [0, 0, 0], 'muted', higgsG);
  const axisGeo = new THREE.BufferGeometry();
  const axisPos = new Float32Array(12);
  axisGeo.setAttribute('position', new THREE.BufferAttribute(axisPos, 3));
  const axes = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  axes.frustumCulled = false;
  higgsG.add(axes);

  const hB: Ball = { x: 0, z: 0, vx: 0, vz: 0 };
  let touched = false;
  let demoNudged = false;
  let higgsTime = 0;
  let settledFor = 0;
  let rMaxScene = 4;
  const cLow = new THREE.Color(PALETTE.cyan);
  const cMid = new THREE.Color(PALETTE.violet);
  const cHigh = new THREE.Color(PALETTE.amber);
  const tmpC = new THREE.Color();

  const hScene = (rho: number) => potential(mu2(), lambda, rho * S_GEV) / VS;

  function rebuildSurface(): void {
    const m2 = mu2();
    const capV = CAP_H * VS;
    const rMax = radiusAtCap(m2, lambda, capV) / S_GEV;
    rMaxScene = rMax;
    const hMin = vMinDepth(m2, lambda) / VS;
    let k = 0;
    for (let i = 0; i <= NR; i++) {
      const rho = (rMax * i) / NR;
      const h = hScene(rho);
      const u = Math.max(0, Math.min(1, (h - hMin) / (CAP_H - hMin || 1)));
      if (u < 0.5) tmpC.copy(cLow).lerp(cMid, u * 2);
      else tmpC.copy(cMid).lerp(cHigh, (u - 0.5) * 2);
      for (let j = 0; j <= NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        sPos[k * 3] = rho * Math.cos(th);
        sPos[k * 3 + 1] = h;
        sPos[k * 3 + 2] = rho * Math.sin(th);
        sCol[k * 3] = tmpC.r;
        sCol[k * 3 + 1] = tmpC.g;
        sCol[k * 3 + 2] = tmpC.b;
        k++;
      }
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();
    const r0 = phiMin(m2, lambda) / S_GEV;
    const y0 = hMin + 0.015;
    for (let i = 0; i < RING_N; i++) {
      const th = (i / RING_N) * Math.PI * 2;
      ringPos[i * 3] = r0 * Math.cos(th);
      ringPos[i * 3 + 1] = y0;
      ringPos[i * 3 + 2] = r0 * Math.sin(th);
    }
    ringGeo.attributes.position.needsUpdate = true;
    ring.visible = m2 > 0;
    rimLabel.visible = m2 > 0;
    rimLabel.position.set(r0 * 0.72, y0 + 0.25, r0 * 0.72);
    rimLabel.element.textContent = `vacuum ring |φ| = v/√2 = ${(phiMin(m2, lambda)).toFixed(0)} GeV`;
    peakLabel.element.textContent = m2 > 0 ? 'φ = 0: symmetric, unstable' : 'φ = 0: symmetric and stable';
    const L = rMax + 0.5;
    axisPos.set([-L, CAP_H + 0.05, 0, L, CAP_H + 0.05, 0, 0, CAP_H + 0.05, -L, 0, CAP_H + 0.05, L]);
    axisGeo.attributes.position.needsUpdate = true;
    reLabel.position.set(L + 0.3, CAP_H + 0.05, 0);
    imLabel.position.set(0, CAP_H + 0.05, L + 0.3);
    drawInset();
  }

  function placeBall(): void {
    const rho = Math.hypot(hB.x, hB.z);
    ball.position.set(hB.x, hScene(rho) + BALL_R * 0.9, hB.z);
  }

  function nudge(): void {
    const a = Math.random() * Math.PI * 2;
    hB.x = 0.02 * Math.cos(a);
    hB.z = 0.02 * Math.sin(a);
    hB.vx = 0.12 * Math.cos(a);
    hB.vz = 0.12 * Math.sin(a);
    settledFor = 0;
    trail.clear();
  }
  function kick(radial: boolean): void {
    let rho = Math.hypot(hB.x, hB.z);
    if (rho < 1e-3) { hB.x = 0.01; hB.z = 0; rho = 0.01; }
    const ux = hB.x / rho;
    const uz = hB.z / rho;
    const sp = radial ? 1.1 : 2.4;
    if (radial) { hB.vx += sp * ux; hB.vz += sp * uz; } else { hB.vx += -sp * uz; hB.vz += sp * ux; }
    settledFor = 0;
    touched = true;
  }

  // =========================================================================
  // Reactions: Feynman diagrams
  let ins: string[] = [];
  let outs: string[] = [];
  let custom = false;
  let presetKey = '';
  let diagramId: DiagramId = 'blob';
  let verdict: Verdict = checkReaction([], []);

  const diagG = new THREE.Group();
  reactG.add(diagG);
  const pulseGeo = new THREE.SphereGeometry(0.1, 16, 10);
  const vertGeo = new THREE.SphereGeometry(0.13, 20, 14);
  const coneGeo = new THREE.ConeGeometry(0.12, 0.3, 14);
  reactG.scale.setScalar(0.85);
  const timeArrow = stage.label('time →', [-2.2, -2.45, 0], 'muted', reactG);
  timeArrow.element.style.fontSize = '12px';

  interface DLine { kind: 'fermion' | 'photon' | 'wz' | 'higgs' | 'hadron'; a: [number, number]; b: [number, number]; arrow: 1 | -1 | 0; color: number; t0: number; t1: number; label?: string; labelAt?: 'a' | 'b'; faint?: boolean }
  interface DVert { at: [number, number]; t: number; label?: string; color?: number; off?: [number, number] }
  interface Anim { curve: THREE.Curve<THREE.Vector3>; pulse: THREE.Mesh; t0: number; t1: number }
  const anims: Anim[] = [];
  const verts: { mesh: THREE.Mesh; t: number }[] = [];
  const diagLabels: CSS2DObject[] = [];
  const CYCLE = 3.8;
  let diagT = 0;

  const lineKind = (id: string): DLine['kind'] => {
    const r = rp(id);
    return r.line;
  };
  const lineColor = (id: string): number => {
    const r = rp(id);
    if (r.line === 'hadron') return HADRON_COLOR;
    if (r.line === 'photon' || r.line === 'wz') return PALETTE.cyan;
    if (r.line === 'higgs') return PALETTE.amber;
    if (['t', 'tbar', 'b', 'bbar'].includes(r.id)) return PALETTE.violet;
    return PALETTE.green;
  };

  function clearDiagram(): void {
    for (const l of diagLabels) { l.element.remove(); l.parent?.remove(l); }
    diagLabels.length = 0;
    const kids = [...diagG.children];
    for (const o of kids) {
      diagG.remove(o);
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== pulseGeo && m.geometry !== vertGeo && m.geometry !== coneGeo) m.geometry.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    }
    anims.length = 0;
    verts.length = 0;
  }

  const tmpV = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const upY = new THREE.Vector3(0, 1, 0);

  function addLine(L: DLine): void {
    const a = new THREE.Vector3(L.a[0], L.a[1], 0);
    const b = new THREE.Vector3(L.b[0], L.b[1], 0);
    let curve: THREE.Curve<THREE.Vector3>;
    const opacity = L.faint ? 0.45 : 1;
    const mat = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.color, emissiveIntensity: 0.55, roughness: 0.4, transparent: opacity < 1, opacity });
    if (L.kind === 'photon' || L.kind === 'wz') {
      const d = b.clone().sub(a);
      const len = d.length();
      d.normalize();
      const n = new THREE.Vector3(-d.y, d.x, 0);
      const waves = Math.max(3, Math.round(len * (L.kind === 'wz' ? 2.2 : 3)));
      const amp = L.kind === 'wz' ? 0.16 : 0.12;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 160; i++) {
        const s = i / 160;
        pts.push(a.clone().addScaledVector(d, s * len).addScaledVector(n, amp * Math.sin(2 * Math.PI * waves * s)));
      }
      const wav = new THREE.CatmullRomCurve3(pts);
      diagG.add(new THREE.Mesh(new THREE.TubeGeometry(wav, 320, L.kind === 'wz' ? 0.045 : 0.032, 6, false), mat));
      curve = new THREE.LineCurve3(a, b);
    } else if (L.kind === 'higgs') {
      curve = new THREE.LineCurve3(a, b);
      const nd = 9;
      for (let i = 0; i < nd; i++) {
        const s0 = i / nd;
        const s1 = s0 + 0.55 / nd;
        const seg = new THREE.LineCurve3(a.clone().lerp(b, s0), a.clone().lerp(b, s1));
        diagG.add(new THREE.Mesh(new THREE.TubeGeometry(seg, 1, 0.05, 8, false), mat));
      }
    } else {
      curve = new THREE.LineCurve3(a, b);
      diagG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1, L.kind === 'hadron' ? 0.05 : 0.035, 8, false), mat));
    }
    if (L.arrow !== 0) {
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: L.color, transparent: opacity < 1, opacity }));
      curve.getPointAt(0.55, tmpV);
      curve.getTangentAt(0.55, tmpT).multiplyScalar(L.arrow);
      cone.position.copy(tmpV);
      cone.quaternion.setFromUnitVectors(upY, tmpT.normalize());
      diagG.add(cone);
    }
    const pulse = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    pulse.visible = false;
    diagG.add(pulse);
    anims.push({ curve, pulse, t0: L.t0, t1: L.t1 });
    if (L.label) {
      const at = L.labelAt === 'a' ? L.a : L.b;
      const dx = L.labelAt === 'a' ? -0.35 : 0.35;
      const lab = stage.label(L.label, [at[0] + dx, at[1], 0], 'big', diagG);
      lab.element.style.color = css(L.color);
      diagLabels.push(lab);
    }
  }

  function addVertex(v: DVert): void {
    const mesh = new THREE.Mesh(vertGeo, new THREE.MeshBasicMaterial({ color: v.color ?? 0xffffff }));
    mesh.position.set(v.at[0], v.at[1], 0.02);
    diagG.add(mesh);
    verts.push({ mesh, t: v.t });
    if (v.label) {
      const o = v.off ?? [0, -0.42];
      const lab = stage.label(v.label, [v.at[0] + o[0], v.at[1] + o[1], 0], 'muted', diagG);
      lab.element.style.fontSize = '11.5px';
      lab.element.style.whiteSpace = 'nowrap';
      diagLabels.push(lab);
    }
  }

  function addText(txt: string, at: [number, number], color: number, cls = 'big'): void {
    const lab = stage.label(txt, [at[0], at[1], 0], cls, diagG);
    lab.element.style.color = css(color);
    diagLabels.push(lab);
  }

  function buildDiagram(): void {
    clearDiagram();
    diagT = 0;
    const V = PALETTE.violet;
    const G = PALETTE.green;
    const C = PALETTE.cyan;
    const A = PALETTE.amber;
    if (diagramId === 'beta') {
      addLine({ kind: 'fermion', a: [-3, 2.0], b: [3, 2.0], arrow: 1, color: V, t0: 0, t1: 3, faint: true, label: 'u', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-3, 1.6], b: [3, 1.6], arrow: 1, color: V, t0: 0, t1: 3, faint: true, label: 'd', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-3, 1.2], b: [-0.8, 1.2], arrow: 1, color: V, t0: 0, t1: 1, label: 'd', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-0.8, 1.2], b: [3, 1.2], arrow: 1, color: V, t0: 1, t1: 3, label: 'u', labelAt: 'b' });
      addLine({ kind: 'wz', a: [-0.8, 1.2], b: [0.6, -0.6], arrow: 0, color: C, t0: 1, t1: 1.8 });
      addLine({ kind: 'fermion', a: [0.6, -0.6], b: [3, 0.3], arrow: 1, color: G, t0: 1.8, t1: 3, label: 'e⁻', labelAt: 'b' });
      addLine({ kind: 'fermion', a: [0.6, -0.6], b: [3, -1.5], arrow: -1, color: G, t0: 1.8, t1: 3, label: 'ν̄e', labelAt: 'b' });
      addVertex({ at: [-0.8, 1.2], t: 1, label: 'd → u W⁻:  −⅓ = +⅔ − 1', off: [2.1, -0.35] });
      addVertex({ at: [0.6, -0.6], t: 1.8, label: 'W⁻ → e⁻ ν̄e:  −1 = −1 + 0,  Le: 0 = 1 − 1', off: [-1.5, -0.6] });
      addText('W⁻ (virtual, 80 GeV)', [-1.45, 0.3], C, '');
      addText('n', [-3.8, 1.6], HADRON_COLOR);
      addText('p', [3.8, 1.6], HADRON_COLOR);
    } else if (diagramId === 'muon') {
      addLine({ kind: 'fermion', a: [-3, 0.9], b: [-0.7, 0.9], arrow: 1, color: G, t0: 0, t1: 1, label: 'μ⁻', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-0.7, 0.9], b: [3, 1.7], arrow: 1, color: G, t0: 1, t1: 3, label: 'νμ', labelAt: 'b' });
      addLine({ kind: 'wz', a: [-0.7, 0.9], b: [0.7, -0.6], arrow: 0, color: C, t0: 1, t1: 1.8 });
      addLine({ kind: 'fermion', a: [0.7, -0.6], b: [3, 0.2], arrow: 1, color: G, t0: 1.8, t1: 3, label: 'e⁻', labelAt: 'b' });
      addLine({ kind: 'fermion', a: [0.7, -0.6], b: [3, -1.6], arrow: -1, color: G, t0: 1.8, t1: 3, label: 'ν̄e', labelAt: 'b' });
      addVertex({ at: [-0.7, 0.9], t: 1, label: 'μ⁻ → νμ W⁻:  Lμ 1 = 1', off: [-1.5, -0.45] });
      addVertex({ at: [0.7, -0.6], t: 1.8, label: 'W⁻ → e⁻ ν̄e:  Le 0 = 1 − 1', off: [-1.2, -0.5] });
      addText('W⁻ (virtual)', [-1.3, 0.1], C, '');
    } else if (diagramId === 'annih') {
      addLine({ kind: 'fermion', a: [-3, -1.6], b: [0, -0.9], arrow: 1, color: G, t0: 0, t1: 1, label: 'e⁻', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-3, 1.6], b: [0, 0.9], arrow: -1, color: G, t0: 0, t1: 1, label: 'e⁺', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [0, -0.9], b: [0, 0.9], arrow: 1, color: G, t0: 1, t1: 1.6 });
      addLine({ kind: 'photon', a: [0, -0.9], b: [3, -1.6], arrow: 0, color: A, t0: 1.6, t1: 3, label: 'γ', labelAt: 'b' });
      addLine({ kind: 'photon', a: [0, 0.9], b: [3, 1.6], arrow: 0, color: A, t0: 1.6, t1: 3, label: 'γ', labelAt: 'b' });
      addVertex({ at: [0, -0.9], t: 1, label: 'each vertex: e e γ, charge conserved', off: [0.2, -0.5] });
      addVertex({ at: [0, 0.9], t: 1.6 });
      addText('virtual e', [0.75, 0], G, '');
    } else if (diagramId === 'hgg') {
      addLine({ kind: 'higgs', a: [-3, 0], b: [-1, 0], arrow: 0, color: A, t0: 0, t1: 1, label: 'H', labelAt: 'a' });
      addLine({ kind: 'fermion', a: [-1, 0], b: [0.8, 1.05], arrow: 1, color: V, t0: 1, t1: 1.7 });
      addLine({ kind: 'fermion', a: [0.8, 1.05], b: [0.8, -1.05], arrow: 1, color: V, t0: 1, t1: 1.7 });
      addLine({ kind: 'fermion', a: [0.8, -1.05], b: [-1, 0], arrow: 1, color: V, t0: 1, t1: 1.7 });
      addLine({ kind: 'photon', a: [0.8, 1.05], b: [3, 1.8], arrow: 0, color: A, t0: 1.7, t1: 3, label: 'γ', labelAt: 'b' });
      addLine({ kind: 'photon', a: [0.8, -1.05], b: [3, -1.8], arrow: 0, color: A, t0: 1.7, t1: 3, label: 'γ', labelAt: 'b' });
      addVertex({ at: [-1, 0], t: 1, label: 'H couples ∝ mass' });
      addVertex({ at: [0.8, 1.05], t: 1.7 });
      addVertex({ at: [0.8, -1.05], t: 1.7 });
      addText('top loop', [0.05, 0.05], V, '');
      addText('(a W loop dominates, the top loop partly cancels it)', [0, -2.05], 0x9aa6bd, 'muted');
    } else {
      // Generic blob diagram for any user-built reaction.
      const col = !verdict.complete ? 0x56627c : verdict.allowed ? PALETTE.green : PALETTE.red;
      const place = (n: number, i: number) => (n === 1 ? 0 : 1.7 - (3.4 * i) / (n - 1));
      ins.forEach((id, i) => {
        const y = place(ins.length, i);
        addLine({ kind: lineKind(id), a: [-3, y], b: [-0.5, y * 0.2], arrow: rp(id).line === 'fermion' ? (rp(id).anti ? -1 : 1) : rp(id).line === 'hadron' ? 1 : 0, color: lineColor(id), t0: 0, t1: 1.2, label: rp(id).label, labelAt: 'a' });
      });
      outs.forEach((id, i) => {
        const y = place(outs.length, i);
        addLine({ kind: lineKind(id), a: [0.5, y * 0.2], b: [3, y], arrow: rp(id).line === 'fermion' ? (rp(id).anti ? -1 : 1) : rp(id).line === 'hadron' ? 1 : 0, color: lineColor(id), t0: 1.8, t1: 3, label: rp(id).label, labelAt: 'b' });
      });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 20), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
      diagG.add(blob);
      verts.push({ mesh: blob, t: 1.4 });
      if (verdict.complete) addText(verdict.allowed ? '✓ allowed' : '✗ forbidden', [0, 1.05], col);
      else addText('pick particles', [0, 1.05], 0x9aa6bd, 'muted');
    }
  }

  function setReaction(i: string[], o: string[], diag: DiagramId, isCustom: boolean, key = ''): void {
    ins = i;
    outs = o;
    custom = isCustom;
    presetKey = key;
    verdict = checkReaction(ins, outs);
    diagramId = diag;
    if (diag !== 'blob' && !verdict.allowed) diagramId = 'blob';
    buildDiagram();
    renderChips();
    writeChecks();
    writeInfo();
    drawInset();
  }

  function editReaction(side: 'in' | 'out', id: string, remove = -1): void {
    const a = side === 'in' ? [...ins] : [...outs];
    if (remove >= 0) a.splice(remove, 1);
    else if (a.length < 4) a.push(id);
    const ni = side === 'in' ? a : ins;
    const no = side === 'out' ? a : outs;
    // Use a preset's diagram if the edit happens to land on one.
    const same = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
    const pre = PRESETS.find((p) => same(p.ins, ni) && same(p.outs, no));
    setReaction(ni, no, pre ? pre.diagram : 'blob', true, '');
  }

  // =========================================================================
  // Overlays: info card (top left) and inset canvas (bottom right)
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '270px',
    background: 'rgba(7,10,18,0.93)', borderRadius: '10px', border: '1px solid #243049', padding: '9px 12px',
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

  const light = (ok: boolean) => `<span style="color:${ok ? css(PALETTE.green) : css(PALETTE.red)};font-size:13px">●</span>`;

  function writeInfo(): void {
    let html = '';
    if (view === 'table') {
      const p = PARTICLES.find((x) => x.id === selected);
      if (!p) {
        html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">17 particles, mass as height</div>
<div>Each step up the back wall is ×10 in mass.</div>
<div><span style="color:${css(PALETTE.violet)}">■</span> quarks <span style="color:${css(PALETTE.green)}">■</span> leptons</div>
<div><span style="color:${css(PALETTE.cyan)}">■</span> gauge bosons <span style="color:${css(PALETTE.amber)}">■</span> Higgs</div>
<div style="color:#8391ab">Click a tile for its card.</div>`;
      } else {
        const col = css(CAT_COLOR[p.category]);
        html = `<div style="font:600 15px/1.3 'Space Grotesk',sans-serif;color:${col};margin-bottom:4px">${p.symbol} &nbsp;${p.name}</div>
<div>mass &nbsp;&nbsp;&nbsp;<span style="color:#dfe6f3">${p.massText}</span></div>
<div>charge &nbsp;<span style="color:#dfe6f3">${p.chargeText} e</span></div>
<div>spin &nbsp;&nbsp;&nbsp;<span style="color:#dfe6f3">${p.spin === 0.5 ? '½' : p.spin}</span></div>
<div>colour &nbsp;<span style="color:#dfe6f3">${p.colour}</span></div>
<div>gen. &nbsp;&nbsp;&nbsp;<span style="color:#dfe6f3">${p.generation ?? 'n/a (boson)'}</span></div>
<div>feels &nbsp;&nbsp;<span style="color:#dfe6f3">${p.interactions.join(', ')}</span></div>
<div style="color:#8391ab;margin-top:5px;font-family:'Space Grotesk',sans-serif;font-size:12px">${p.note}</div>`;
      }
    } else if (view === 'higgs') {
      const m2 = mu2();
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">${m2 > 0 ? 'Symmetric laws, lopsided vacuum' : 'Symmetric phase: μ² &lt; 0'}</div>
${m2 > 0 ? `<div>The hat is round, but the ball must pick one spot on the <span style="color:${css(PALETTE.green)}">rim</span>.</div>
<div>Rolling <b>across</b> the rim costs energy: that wobble is the Higgs boson, m_H = √2 μ.</div>
<div>Rolling <b>along</b> the rim is free: those modes are eaten by W⁺, W⁻ and Z and become their mass.</div>` : '<div>The minimum is at φ = 0. No vacuum value, so W, Z and fermions are massless.</div>'}
<div style="color:#8391ab">Surface height = V(φ). Colour: trough cyan, rim amber.</div>`;
    } else {
      const v = verdict;
      const vc = !v.complete ? '#9aa6bd' : v.allowed ? css(PALETTE.green) : css(PALETTE.red);
      const row = (ok: boolean, name: string, val: string) => `<div>${light(ok)} ${name.padEnd(9, ' ')}<span style="color:#dfe6f3">${val}</span></div>`;
      html = `<div style="color:#dfe6f3;font:600 15px/1.3 'Space Grotesk',sans-serif">${reactionText(ins, outs)}</div>
<div style="color:${vc};font:700 13px/1.6 'Space Grotesk',sans-serif">${!v.complete ? 'incomplete' : v.allowed ? 'ALLOWED' : 'FORBIDDEN'}${v.allowed ? ` <span style="font-weight:400;color:#9aa6bd">(${v.force})</span>` : ''}</div>
${row(v.charge.ok, 'charge', `${frac(v.charge.before)} → ${frac(v.charge.after)}`)}
${row(v.baryon.ok, 'baryon', `${frac(v.baryon.before)} → ${frac(v.baryon.after)}`)}
${row(v.le.ok, 'L_e', `${v.le.before} → ${v.le.after}`)}
${row(v.lmu.ok, 'L_μ', `${v.lmu.before} → ${v.lmu.after}`)}
${row(v.ltau.ok, 'L_τ', `${v.ltau.before} → ${v.ltau.after}`)}
${row(v.energy.ok, 'energy', v.energy.text)}
${row(v.spin.ok && v.extra.ok, 'spin', v.extra.ok ? `${v.spin.fermionsIn + v.spin.fermionsOut} spin-½ total` : v.extra.text)}
<div style="color:#8391ab;margin-top:5px;font-family:'Space Grotesk',sans-serif;font-size:12px">${v.explanation}</div>`;
    }
    if (html !== infoHtml) {
      info.innerHTML = html;
      infoHtml = html;
    }
  }

  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = '20px JetBrains Mono, monospace';
    if (view === 'table') {
      c.fillStyle = '#8391ab';
      c.fillText('mass ladder, eV to TeV', 16, 30);
      const lo = -1; // log10 eV
      const hi = 12;
      const x0 = 24;
      const x1 = W - 20;
      const X = (lg: number) => x0 + ((lg - lo) / (hi - lo)) * (x1 - x0);
      const y = 170;
      c.strokeStyle = '#3a4866';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.stroke();
      c.fillStyle = '#56627c';
      c.font = '17px JetBrains Mono, monospace';
      for (const [lg, txt] of [[0, 'eV'], [3, 'keV'], [6, 'MeV'], [9, 'GeV'], [12, 'TeV']] as [number, string][]) {
        c.fillRect(X(lg) - 1, y - 6, 2, 12);
        c.fillText(txt, X(lg) - c.measureText(txt).width / 2, y + 32);
      }
      // neutrino upper limit
      c.strokeStyle = css(PALETTE.green);
      c.fillStyle = css(PALETTE.green);
      c.setLineDash([5, 5]);
      c.beginPath();
      c.moveTo(X(Math.log10(0.45)), y - 10);
      c.lineTo(X(lo), y - 10);
      c.stroke();
      c.setLineDash([]);
      c.fillText('ν < 0.45 eV', X(lo) + 2, y - 20);
      let k = 0;
      for (const p of PARTICLES) {
        if (p.massGeV <= 0) continue;
        const lg = Math.log10(p.massGeV * 1e9);
        const on = p.id === selected;
        c.fillStyle = css(CAT_COLOR[p.category]);
        c.globalAlpha = selected === 'none' || on ? 1 : 0.45;
        c.fillRect(X(lg) - (on ? 2 : 1), y - (on ? 26 : 16), on ? 4 : 2, on ? 26 : 16);
        const row = k % 3;
        c.font = on ? '600 20px JetBrains Mono, monospace' : '17px JetBrains Mono, monospace';
        c.fillText(p.symbol, X(lg) - 5, y - 40 - row * 22 - (on ? 6 : 0));
        k++;
      }
      c.globalAlpha = 1;
      c.fillStyle = '#8391ab';
      c.font = '17px JetBrains Mono, monospace';
      c.fillText('γ and g: massless', 16, H - 20);
    } else if (view === 'higgs') {
      const m2 = mu2();
      c.fillStyle = '#8391ab';
      c.fillText('slice: V along Re φ', 16, 30);
      const R = rMaxScene * S_GEV;
      const hMinV = Math.min(0, vMinDepth(m2, lambda));
      const vTop = CAP_H * VS;
      const x0 = 20;
      const x1 = W - 20;
      const yTop = 50;
      const yBot = H - 42;
      const X = (phi: number) => x0 + ((phi + R) / (2 * R)) * (x1 - x0);
      const Y = (V: number) => yTop + ((vTop - V) / (vTop - hMinV)) * (yBot - yTop);
      c.strokeStyle = '#243049';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0, Y(0));
      c.lineTo(x1, Y(0));
      c.moveTo(X(0), yTop);
      c.lineTo(X(0), yBot);
      c.stroke();
      if (m2 > 0) {
        const pm = phiMin(m2, lambda);
        c.strokeStyle = css(PALETTE.green);
        c.setLineDash([5, 5]);
        c.beginPath();
        c.moveTo(X(pm), yTop);
        c.lineTo(X(pm), yBot);
        c.moveTo(X(-pm), yTop);
        c.lineTo(X(-pm), yBot);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = css(PALETTE.green);
        c.font = '17px JetBrains Mono, monospace';
        c.fillText('±v/√2', X(pm) + 4, yBot + 22);
      }
      c.strokeStyle = css(PALETTE.violet);
      c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i <= 160; i++) {
        const phi = -R + (2 * R * i) / 160;
        const yy = Y(Math.min(vTop, potential(m2, lambda, phi)));
        if (i === 0) c.moveTo(X(phi), yy);
        else c.lineTo(X(phi), yy);
      }
      c.stroke();
      const rb = Math.hypot(hB.x, hB.z) * S_GEV * (hB.x < 0 ? -1 : 1);
      c.fillStyle = css(PALETTE.amber);
      c.beginPath();
      c.arc(X(rb), Y(potential(m2, lambda, rb)) - 7, 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#dfe6f3';
      c.font = '18px JetBrains Mono, monospace';
      c.fillText(`|φ| = ${Math.abs(rb).toFixed(0)} GeV`, W - 190, 30);
    } else {
      c.fillStyle = '#8391ab';
      c.fillText('rest-mass budget', 16, 30);
      const mi = verdict.energy.massIn;
      const mo = verdict.energy.massOut;
      const mx = Math.max(mi, mo, 1e-9);
      const bar = (y: number, v: number, col: string, txt: string) => {
        c.fillStyle = '#1c2436';
        c.fillRect(20, y, W - 40, 34);
        c.fillStyle = col;
        c.fillRect(20, y, Math.max(2, ((W - 40) * v) / mx), 34);
        c.fillStyle = '#dfe6f3';
        c.font = '18px JetBrains Mono, monospace';
        c.fillText(`${txt} ${v > 0 ? fmtE(v) : '0'}`, 26, y + 25);
      };
      bar(52, mi, 'rgba(79,209,232,0.55)', 'in ');
      bar(108, mo, verdict.energy.ok ? 'rgba(94,227,154,0.55)' : 'rgba(255,107,107,0.6)', 'out');
      c.fillStyle = verdict.energy.ok ? css(PALETTE.green) : css(PALETTE.red);
      c.font = '18px JetBrains Mono, monospace';
      c.fillText(verdict.energy.text, 20, 180);
      c.fillStyle = '#8391ab';
      c.font = '16px JetBrains Mono, monospace';
      c.fillText('decays need m_in > Σ m_out', 20, H - 24);
    }
  }

  // =========================================================================
  // Picking tiles
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
  const onUp = (e: PointerEvent) => {
    if (view !== 'table' || Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const hit = ray.intersectObjects(tiles.map((t) => t.mesh), false)[0];
    if (hit) selectTile(hit.object.userData.id as string);
  };
  stage.renderer.domElement.addEventListener('pointerdown', onDown);
  stage.renderer.domElement.addEventListener('pointerup', onUp);

  // =========================================================================
  // Panel
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'table', label: 'Particle table' }, { value: 'higgs', label: 'Higgs' }, { value: 'reactions', label: 'Reactions' }],
    onChange: (v) => setView(v),
  });
  void viewCtl;

  ui.section('Particles');
  const secTable = ui.root.lastElementChild as HTMLElement;
  const particleCtl = ui.select<string>({
    key: 'particle', label: 'Pick a particle', value: 'none',
    options: [{ value: 'none', label: '·' }, ...PARTICLES.map((p) => ({ value: p.id, label: p.symbol }))],
    onChange: (v) => selectTile(v),
  });
  const rSelMass = ui.readout('selMass', 'mass');
  const rSelQ = ui.readout('selQ', 'charge');
  const rSelS = ui.readout('selS', 'spin');
  ui.note('Tile height is log₁₀ of mass, so each step up is ×10. Neutrinos and massless bosons lie flat.');
  ui.section('Force strengths at 91 GeV');
  const secForces = ui.root.lastElementChild as HTMLElement;
  for (const f of forceStrengths()) {
    const set = ui.readout(`f-${f.force}`, f.force);
    set(f.value < 1e-3 ? f.value.toExponential(1) : f.value > 0.05 ? f.value.toFixed(3) : `1/${(1 / f.value).toFixed(1)}`);
  }
  ui.note('Couplings α at the Z mass. Gravity is G m_p²/ħc for two protons. The weak force looks weak at low energy only because the W is heavy.');

  ui.section('Higgs potential');
  const secHiggs = ui.root.lastElementChild as HTMLElement;
  ui.slider({
    key: 'mu2', label: 'μ² (signed)', min: -120, max: 120, step: 0.5, value: muSigned,
    format: (v) => (v >= 0 ? `+(${v.toFixed(1)} GeV)²` : `−(${(-v).toFixed(1)} GeV)²`),
    onInput: (v) => { muSigned = v; touchedParams = true; rebuildSurface(); settledFor = 0; },
  });
  ui.slider({
    key: 'lambda', label: 'λ', min: 0.1, max: 0.5, step: 0.001, value: lambda,
    format: (v) => v.toFixed(3),
    onInput: (v) => { lambda = v; touchedParams = true; rebuildSurface(); settledFor = 0; },
  });
  ui.buttons([
    { label: 'Nudge ball', primary: true, key: 'phi', onClick: () => { nudge(); touched = true; } },
    { label: 'Kick across rim', onClick: () => kick(true) },
    { label: 'Kick along rim', onClick: () => kick(false) },
  ]);
  ui.buttons([{ label: 'Measured values', onClick: () => { muSlider(); } }]);
  const rV = ui.readout('v', 'v = √(μ²/λ)', 'GeV');
  const rPhiMin = ui.readout('phiMin', '|φ| min = v/√2', 'GeV');
  const rMH = ui.readout('mH', 'm_H = √2 μ', 'GeV');
  const rMW = ui.readout('mW', 'm_W = g v/2', 'GeV');
  const rMZ = ui.readout('mZ', 'm_Z', 'GeV');
  const rPhi = ui.readout('phi', 'ball |φ|', 'GeV');
  const rVb = ui.readout('Vball', 'V at ball', 'GeV⁴');
  const rSet = ui.readout('settled', 'ball');
  ui.note('m_W and m_Z use couplings g, g′ fixed so that v = 246.22 GeV gives the measured masses. They scale with v.');

  ui.section('Reactions');
  const secReact = ui.root.lastElementChild as HTMLElement;
  ui.buttons(PRESETS.map((p) => ({ label: p.label, key: 'preset', onClick: () => setReaction([...p.ins], [...p.outs], p.diagram, false, p.key) })));
  const builder = ui.note('');
  const chips = document.createElement('div');
  {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' });
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Particle to add');
    Object.assign(sel.style, { padding: '6px 8px', borderRadius: '8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--line)', font: 'inherit' });
    const groups: [string, string[]][] = [
      ['Leptons', ['e-', 'e+', 'mu-', 'mu+', 'tau-', 'tau+']],
      ['Neutrinos', ['ve', 'vebar', 'vmu', 'vmubar', 'vtau', 'vtaubar']],
      ['Hadrons', ['p', 'pbar', 'n', 'nbar', 'pi+', 'pi-', 'pi0']],
      ['Heavy quarks', ['t', 'tbar', 'b', 'bbar']],
      ['Bosons', ['gamma', 'W+', 'W-', 'Z', 'H']],
    ];
    for (const [gname, ids] of groups) {
      const og = document.createElement('optgroup');
      og.label = gname;
      for (const id of ids) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = rp(id).label;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    const mk = (txt: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = txt;
      b.addEventListener('click', fn);
      return b;
    };
    row.append(sel, mk('+ in', () => editReaction('in', sel.value)), mk('+ out', () => editReaction('out', sel.value)), mk('Clear', () => setReaction([], [], 'blob', true)));
    builder.innerHTML = '<div>Build your own. Click a chip to remove it.</div>';
    builder.append(row, chips);
    builder.dataset.param = 'builder';
  }
  ui.section('Conservation checks');
  const secChecks = ui.root.lastElementChild as HTMLElement;
  const chkKeys = ['chkQ', 'chkB', 'chkLe', 'chkLmu', 'chkLtau', 'chkE'] as const;
  const chkNames = ['charge Q', 'baryon B', 'L_e', 'L_μ', 'L_τ', 'energy'];
  const chkSet = chkKeys.map((k, i) => ui.readout(k, chkNames[i]));
  const rVerdict = ui.readout('verdict', 'verdict');
  const chkEls = [...chkKeys, 'verdict'].map((k) => secChecks.querySelector(`[data-param="${k}"] .readout-val`) as HTMLElement);

  let touchedParams = false;
  function muSlider(): void {
    const sMu = secHiggs.querySelector('[data-param="mu2"] input') as HTMLInputElement;
    const sLa = secHiggs.querySelector('[data-param="lambda"] input') as HTMLInputElement;
    sMu.value = String(MU_PHYS);
    sLa.value = String(LAMBDA_PHYS);
    sMu.dispatchEvent(new Event('input'));
    sLa.dispatchEvent(new Event('input'));
    muSigned = MU_PHYS;
    lambda = LAMBDA_PHYS;
    rebuildSurface();
  }

  function renderChips(): void {
    chips.innerHTML = '';
    Object.assign(chips.style, { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px', font: '13px var(--mono, monospace)' });
    const chip = (side: 'in' | 'out', id: string, i: number) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${rp(id).label} ×`;
      Object.assign(b.style, { padding: '3px 8px', borderRadius: '999px', border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', font: 'inherit' });
      b.addEventListener('click', () => editReaction(side, id, i));
      return b;
    };
    const span = (t: string) => { const s = document.createElement('span'); s.textContent = t; s.style.color = 'var(--text-3)'; return s; };
    if (!ins.length) chips.append(span('(in)'));
    ins.forEach((id, i) => chips.append(chip('in', id, i)));
    chips.append(span('→'));
    if (!outs.length) chips.append(span('(out)'));
    outs.forEach((id, i) => chips.append(chip('out', id, i)));
  }

  function writeChecks(): void {
    const v = verdict;
    const vals: [boolean, string][] = [
      [v.charge.ok, `${frac(v.charge.before)} → ${frac(v.charge.after)}`],
      [v.baryon.ok, `${frac(v.baryon.before)} → ${frac(v.baryon.after)}`],
      [v.le.ok, `${v.le.before} → ${v.le.after}`],
      [v.lmu.ok, `${v.lmu.before} → ${v.lmu.after}`],
      [v.ltau.ok, `${v.ltau.before} → ${v.ltau.after}`],
      [v.energy.ok && v.spin.ok && v.extra.ok, v.energy.ok ? (v.energy.kind === 'decay' ? `Q ${fmtE(v.energy.q)}` : 'ok') : 'fails'],
    ];
    vals.forEach(([ok, s], i) => {
      chkSet[i](`${v.complete ? (ok ? '✓' : '✗') : '·'} ${s}`);
      chkEls[i].style.color = !v.complete ? '' : ok ? css(PALETTE.green) : css(PALETTE.red);
    });
    rVerdict(!v.complete ? 'incomplete' : v.allowed ? 'allowed' : 'forbidden');
    chkEls[6].style.color = !v.complete ? '' : v.allowed ? css(PALETTE.green) : css(PALETTE.red);
  }

  function setView(v: View): void {
    view = v;
    tableG.visible = v === 'table';
    higgsG.visible = v === 'higgs';
    reactG.visible = v === 'reactions';
    secTable.style.display = v === 'table' ? '' : 'none';
    secForces.style.display = v === 'table' ? '' : 'none';
    secHiggs.style.display = v === 'higgs' ? '' : 'none';
    secReact.style.display = v === 'reactions' ? '' : 'none';
    secChecks.style.display = v === 'reactions' ? '' : 'none';
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.0);
    if (v === 'higgs') higgsTime = 0;
    writeInfo();
    drawInset();
  }

  // =========================================================================
  // Frame loop
  let insetTimer = 0;
  let acc = 0;
  stage.onFrame((dt, t) => {
    if (view === 'table') {
      if (selected !== 'none') {
        const tt = tiles.find((x) => x.p.id === selected);
        if (tt) tt.mat.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 4);
      }
      const p = PARTICLES.find((x) => x.id === selected);
      rSelMass(p ? p.massText : '·');
      rSelQ(p ? `${p.chargeText} e` : '·');
      rSelS(p ? (p.spin === 0.5 ? '½' : String(p.spin)) : '·');
    } else if (view === 'higgs') {
      higgsTime += dt;
      if (!demoNudged && higgsTime > 0.4 && Math.hypot(hB.x, hB.z) < 1e-6) { nudge(); demoNudged = true; }
      acc += dt;
      let n = 0;
      const m2 = mu2();
      while (acc >= H_STEP && n < 40) {
        stepBall(hB, m2, lambda, S_GEV, VS, 9, 1.4, H_STEP);
        acc -= H_STEP;
        n++;
      }
      if (n >= 40) acc = 0;
      // keep the ball on the drawn surface
      const rho = Math.hypot(hB.x, hB.z);
      if (rho > rMaxScene) { hB.x *= rMaxScene / rho; hB.z *= rMaxScene / rho; hB.vx *= -0.3; hB.vz *= -0.3; }
      placeBall();
      if (Math.hypot(hB.vx, hB.vz) > 0.02 || rho > 1e-4) trail.push(ball.position.x, ball.position.y - BALL_R * 0.8, ball.position.z);
      const phiB = Math.hypot(hB.x, hB.z) * S_GEV;
      const pm = phiMin(m2, lambda);
      const still = Math.hypot(hB.vx, hB.vz) < 0.03;
      const inTrough = m2 > 0 ? Math.abs(phiB - pm) < 4 : phiB < 4;
      settledFor = still && inTrough && (m2 <= 0 || phiB > 1) ? settledFor + dt : 0;
      const vv = vev(m2, lambda);
      rV(vv.toFixed(1));
      rPhiMin(pm.toFixed(1));
      rMH(higgsMass(m2).toFixed(1));
      rMW(massW(vv).toFixed(1));
      rMZ(massZ(vv).toFixed(1));
      rPhi(phiB.toFixed(1));
      const Vb = potential(m2, lambda, phiB);
      rVb(Math.abs(Vb) < 1 ? '0' : Vb.toExponential(2));
      rSet(settledFor > 0.5 ? (m2 > 0 ? 'in the vacuum' : 'at φ = 0') : phiB < 0.5 ? 'on the peak' : 'rolling');
      insetTimer += dt;
      if (insetTimer > 0.1) { insetTimer = 0; drawInset(); writeInfo(); }
          } else {
      diagT = (diagT + dt) % CYCLE;
      for (const a of anims) {
        const on = diagT >= a.t0 && diagT <= a.t1;
        a.pulse.visible = on;
        if (on) a.curve.getPointAt((diagT - a.t0) / (a.t1 - a.t0 || 1), a.pulse.position);
      }
      for (const v of verts) {
        const d = diagT - v.t;
        const s = d >= 0 && d < 0.5 ? 1 + 0.9 * Math.exp(-d * 6) : 1;
        v.mesh.scale.setScalar(s);
      }
    }
  });

  // Initial state
  rebuildSurface();
  placeBall();
  setReaction(['n'], ['p', 'e-', 'vebar'], 'beta', false, 'beta');
  setView('table');
  stage.camera.position.set(...CAM.table.pos);
  selectTile('none');

  const isBeta = () => ins.length === 1 && ins[0] === 'n' && [...outs].sort().join() === ['e-', 'p', 'vebar'].sort().join();

  return {
    state: () => {
      const m2 = mu2();
      const phiB = Math.hypot(hB.x, hB.z) * S_GEV;
      return {
        view,
        selected,
        selectedMass: PARTICLES.find((p) => p.id === selected)?.massGeV ?? 0,
        reaction: reactionText(ins, outs),
        preset: presetKey,
        complete: verdict.complete,
        allowed: verdict.allowed,
        custom,
        isBeta: isBeta(),
        dQ: (verdict.charge.after - verdict.charge.before) / 3,
        dB: (verdict.baryon.after - verdict.baryon.before) / 3,
        dLe: verdict.le.after - verdict.le.before,
        dLmu: verdict.lmu.after - verdict.lmu.before,
        dLtau: verdict.ltau.after - verdict.ltau.before,
        energyOK: verdict.energy.ok,
        force: verdict.force,
        mu2: m2,
        lambda,
        v: vev(m2, lambda),
        mH: higgsMass(m2),
        ballPhi: phiB,
        settled: settledFor > 0.5,
        touched,
        touchedParams,
        higgsVacuum: touched && m2 > 0 && settledFor > 0.5,
      };
    },
    dispose: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onDown);
      stage.renderer.domElement.removeEventListener('pointerup', onUp);
      clearDiagram();
      pulseGeo.dispose();
      vertGeo.dispose();
      coneGeo.dispose();
      info.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

function fmtMass(gev: number): string {
  if (gev >= 1) return `${gev >= 100 ? gev.toFixed(1) : gev.toFixed(2)} GeV`;
  if (gev >= MASS_FLOOR_GEV * 10) return `${(gev * 1e3).toFixed(gev >= 0.01 ? 1 : 2)} MeV`;
  return `${(gev * 1e3).toFixed(3)} MeV`;
}

const topic: Topic = {
  id: 'standard-model',
  number: 54,
  title: 'The Standard Model',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Seventeen particles and three forces that explain almost everything we measure.',
  content,
  mount,
};

export default topic;
