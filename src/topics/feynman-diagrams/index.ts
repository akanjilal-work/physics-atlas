import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  ALPHA, activeQuarks, comptonSqrtS, cosRange, dsdo, interferenceShare, kleinNishinaTotal, loopFactor,
  ME_MEV, parts, rRatio, sigmaMuMu, sigmaNumeric, THETA_CUT, THOMSON_BARN, virtuality,
  type Channels, type Process,
} from './physics.ts';

type V2 = [number, number];
type Kind = 'f' | 'g';

interface LineSpec {
  from: string;
  to: string;
  kind: Kind;
  /** Charge-flow arrow relative to from -> to: +1, -1, or 0 for photons. */
  arrow: 1 | -1 | 0;
  color: number;
  label?: string;
  /** Which end carries the label. */
  at?: 'from' | 'to';
}
interface DiagramSpec {
  title: string;
  nodes: Record<string, V2>;
  lines: LineSpec[];
}

const DEG = Math.PI / 180;
const E_COL = PALETTE.green;
const MU_COL = PALETTE.violet;
const G_COL = PALETTE.amber;
const LOOP_COL = PALETTE.rose;

const BOARD_X = -3.45;
const BOARD_W = 7.6;
const BOARD_H = 4.9;
const SLOT_HALF: V2 = [1.3, 1.55];
const NOW_LO = -1.95;
const NOW_HI = 1.95;
const SWEEP = 3.4;
const PAUSE = 0.7;

const PLOT_X = 3.55;
const PLOT_R = 2.15;
const NT = 120;
const NP = 56;

const PROCESS_LABEL: Record<Process, string> = {
  mumu: 'e⁺e⁻ → μ⁺μ⁻',
  bhabha: 'e⁺e⁻ → e⁺e⁻ (Bhabha)',
  moller: 'e⁻e⁻ → e⁻e⁻ (Møller)',
  compton: 'γe⁻ → γe⁻ (Compton)',
};

const CHAN_NAMES: Record<Process, [string, string]> = {
  mumu: ['s-channel (annihilation)', 'no second diagram'],
  bhabha: ['s-channel (annihilation)', 't-channel (exchange)'],
  moller: ['t-channel (exchange)', 'u-channel (swapped)'],
  compton: ['s-channel (absorb first)', 'u-channel (emit first)'],
};

// Base layouts in slot-local coordinates, time running up.
const IN_L: V2 = [-1.15, -1.45];
const IN_R: V2 = [1.15, -1.45];
const OUT_L: V2 = [-1.15, 1.45];
const OUT_R: V2 = [1.15, 1.45];

function sChannel(outCol: number, outM: string, outP: string): DiagramSpec {
  return {
    title: 's-channel: annihilate',
    nodes: { i1: IN_L, i2: IN_R, v1: [0, -0.6], v2: [0, 0.6], o1: OUT_L, o2: OUT_R },
    lines: [
      { from: 'i1', to: 'v1', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'from' },
      { from: 'i2', to: 'v1', kind: 'f', arrow: -1, color: E_COL, label: 'e⁺', at: 'from' },
      { from: 'v1', to: 'v2', kind: 'g', arrow: 0, color: G_COL },
      { from: 'v2', to: 'o1', kind: 'f', arrow: 1, color: outCol, label: outM, at: 'to' },
      { from: 'v2', to: 'o2', kind: 'f', arrow: -1, color: outCol, label: outP, at: 'to' },
    ],
  };
}

function exchange(title: string, rightSign: 1 | -1, crossed: boolean): DiagramSpec {
  const rl = rightSign === 1 ? 'e⁻' : 'e⁺';
  return {
    title,
    nodes: { i1: IN_L, i2: IN_R, v1: [-0.62, 0], v2: [0.62, 0], o1: OUT_L, o2: OUT_R },
    lines: [
      { from: 'i1', to: 'v1', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'from' },
      { from: 'i2', to: 'v2', kind: 'f', arrow: rightSign, color: E_COL, label: rl, at: 'from' },
      { from: 'v1', to: 'v2', kind: 'g', arrow: 0, color: G_COL },
      { from: 'v1', to: crossed ? 'o2' : 'o1', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'to' },
      { from: 'v2', to: crossed ? 'o1' : 'o2', kind: 'f', arrow: rightSign, color: E_COL, label: rl, at: 'to' },
    ],
  };
}

function comptonS(): DiagramSpec {
  return {
    title: 's-channel',
    nodes: { i1: IN_L, i2: IN_R, v1: [-0.42, -0.5], v2: [0.42, 0.5], o1: OUT_L, o2: OUT_R },
    lines: [
      { from: 'i1', to: 'v1', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'from' },
      { from: 'i2', to: 'v1', kind: 'g', arrow: 0, color: G_COL, label: 'γ', at: 'from' },
      { from: 'v1', to: 'v2', kind: 'f', arrow: 1, color: E_COL },
      { from: 'v2', to: 'o1', kind: 'g', arrow: 0, color: G_COL, label: 'γ', at: 'to' },
      { from: 'v2', to: 'o2', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'to' },
    ],
  };
}

function comptonU(): DiagramSpec {
  return {
    title: 'u-channel',
    nodes: { i1: IN_L, i2: IN_R, v1: [-0.42, -0.5], v2: [0.42, 0.5], o1: OUT_L, o2: OUT_R },
    lines: [
      { from: 'i1', to: 'v1', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'from' },
      { from: 'v1', to: 'o1', kind: 'g', arrow: 0, color: G_COL, label: 'γ', at: 'to' },
      { from: 'v1', to: 'v2', kind: 'f', arrow: 1, color: E_COL },
      { from: 'i2', to: 'v2', kind: 'g', arrow: 0, color: G_COL, label: 'γ', at: 'from' },
      { from: 'v2', to: 'o2', kind: 'f', arrow: 1, color: E_COL, label: 'e⁻', at: 'to' },
    ],
  };
}

function diagramsFor(p: Process): DiagramSpec[] {
  if (p === 'mumu') return [sChannel(MU_COL, 'μ⁻', 'μ⁺')];
  if (p === 'bhabha') return [sChannel(E_COL, 'e⁻', 'e⁺'), exchange('t-channel: exchange', -1, false)];
  if (p === 'moller') return [exchange('t-channel: exchange', 1, false), exchange('u-channel: swap', 1, true)];
  return [comptonS(), comptonU()];
}

const isEE = (p: Process) => p !== 'compton';
/** Slider value (25..1000) to process energy: sqrt(s) in GeV, or k = E_gamma/m_e for Compton. */
const energyOf = (p: Process, v: number) => (isEE(p) ? v / 25 : 10 ** (-3 + (5 * (v - 25)) / 975));

function fmtSigma(p: Process, x: number): string {
  if (!isEE(p)) return x >= 0.01 ? `${x.toFixed(3)} b` : `${(x * 1e3).toFixed(2)} mb`;
  if (x >= 1) return `${x.toFixed(2)} nb`;
  if (x >= 1e-3) return `${(x * 1e3).toFixed(1)} pb`;
  return `${(x * 1e6).toFixed(1)} fb`;
}
const sup = (n: number) => String(n).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'['0123456789-'.indexOf(ch)] ?? ch).join('');
const sci = (x: number, d = 1) => {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e <= 3) return x.toFixed(Math.max(0, d + 1 - Math.max(0, e)));
  return `${(x / 10 ** e).toFixed(d)}×10${sup(e)}`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.1, 1.2, 15.2], target: [-0.15, 0.15, 0], fov: 40 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  // ---------------------------------------------------------------- state
  let proc: Process = 'mumu';
  const sliderV: Record<Process, number> = { mumu: 250, bhabha: 250, moller: 250, compton: 610 };
  const chans: Channels = { a: true, b: true };
  let probeDeg = 90;
  let loops = 0;
  let logR = false;
  let playing = true;
  let dragged = false;
  let refE = energyOf('mumu', 250);
  let refSigma = sigmaMuMu(refE);
  let layouts: DiagramSpec[] = diagramsFor(proc);

  // Derived numbers, refreshed on parameter change.
  let E = energyOf(proc, sliderV[proc]);
  let sigma = 0;
  let interf = 0;
  let ratio90 = 1;
  let dsdoProbe = 0;
  let checkErr = 0;

  // ---------------------------------------------------------------- board furniture
  const boardG = new THREE.Group();
  boardG.position.set(BOARD_X, -0.55, 0);
  scene.add(boardG);
  const slab = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W, BOARD_H),
    new THREE.MeshBasicMaterial({ color: 0x0d1424, transparent: true, opacity: 0.9 }),
  );
  slab.position.z = -0.12;
  boardG.add(slab);
  const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(BOARD_W, BOARD_H));
  const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0x2c3852 }));
  frame.position.z = -0.1;
  boardG.add(frame);
  // Faint horizontal time rulings
  {
    const pts: number[] = [];
    for (let y = -2; y <= 2.001; y += 0.5) pts.push(-BOARD_W / 2 + 0.55, y, -0.11, BOARD_W / 2 - 0.1, y, -0.11);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    boardG.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.7 })));
  }
  const timeArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-BOARD_W / 2 + 0.3, -1.9, 0), 3.7, 0x8391ab, 0.25, 0.14);
  boardG.add(timeArrow);
  const timeLab = stage.label('time', [-BOARD_W / 2 + 0.3, 2.1, 0], 'muted', boardG);
  timeLab.element.style.fontSize = '11px';
  const ampLab = stage.label('', [0, BOARD_H / 2 + 0.28, 0], 'big', boardG);
  const loopLab = stage.label('', [0, BOARD_H / 2 + 0.75, 0], 'muted', boardG);
  loopLab.element.style.color = css(LOOP_COL);

  // Sweeping "now" line
  const nowMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const nowLine = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W - 0.8, 0.035), nowMat);
  nowLine.position.set(0.25, 0, -0.05);
  boardG.add(nowLine);

  // Shared geometries
  const pulseGeo = new THREE.SphereGeometry(0.085, 16, 10);
  const glowGeo = new THREE.SphereGeometry(0.2, 16, 10);
  const vertGeo = new THREE.SphereGeometry(0.11, 20, 14);
  const handleGeo = new THREE.SphereGeometry(0.26, 12, 8);
  const coneGeo = new THREE.ConeGeometry(0.1, 0.26, 14);
  const shared = new Set<THREE.BufferGeometry>([pulseGeo, glowGeo, vertGeo, handleGeo, coneGeo]);

  interface ExtAnim { a: THREE.Vector3; b: THREE.Vector3; pulse: THREE.Mesh; glow: THREE.Mesh }
  interface IntAnim { y0: number; y1: number; halo: THREE.MeshBasicMaterial; core: THREE.MeshBasicMaterial; dim: number }
  interface VertAnim { mesh: THREE.Mesh; y: number }
  const extAnims: ExtAnim[] = [];
  const intAnims: IntAnim[] = [];
  const vertAnims: VertAnim[] = [];
  const handles: THREE.Mesh[] = [];
  const diagG = new THREE.Group();
  boardG.add(diagG);
  const diagLabels: CSS2DObject[] = [];

  const slotCenters = (): number[] => (layouts.length === 1 ? [0.2] : [-1.55, 2.05]);

  function clearBoard(): void {
    for (const l of diagLabels) { l.element.remove(); l.parent?.remove(l); }
    diagLabels.length = 0;
    diagG.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    diagG.clear();
    extAnims.length = 0;
    intAnims.length = 0;
    vertAnims.length = 0;
    handles.length = 0;
  }

  const upY = new THREE.Vector3(0, 1, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  /** Points along a quadratic Bezier a -> c -> b, with an optional sinusoidal wiggle for photons. */
  function pathPoints(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3 | null, wavy: boolean, amp = 0.1): THREE.Vector3[] {
    const ctrl = c ?? a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const n = wavy ? 140 : 2;
    const waves = Math.max(2.5, Math.round(len * 3.4 * 2) / 2);
    const pts: THREE.Vector3[] = [];
    const tan = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const p = new THREE.Vector3()
        .addScaledVector(a, (1 - s) * (1 - s))
        .addScaledVector(ctrl, 2 * s * (1 - s))
        .addScaledVector(b, s * s);
      if (wavy) {
        tan.copy(ctrl).sub(a).multiplyScalar(2 * (1 - s)).addScaledVector(tmpB.copy(b).sub(ctrl), 2 * s).normalize();
        p.x += -tan.y * amp * Math.sin(2 * Math.PI * waves * s);
        p.y += tan.x * amp * Math.sin(2 * Math.PI * waves * s);
      }
      pts.push(p);
    }
    return pts;
  }

  function addTube(pts: THREE.Vector3[], color: number, radius: number, opacity: number, internal: boolean): { core: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial } {
    const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts);
    const segs = pts.length === 2 ? 1 : 280;
    const core = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * (internal ? 0.75 : 1) });
    diagG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 6, false), core));
    const halo = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16 * opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    diagG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius * 3.2, 6, false), halo));
    return { core, halo };
  }

  function buildBoard(): void {
    clearBoard();
    const centers = slotCenters();
    const on = [chans.a, layouts.length > 1 ? chans.b : false];
    layouts.forEach((D, di) => {
      const cx = centers[di];
      const active = layouts.length === 1 ? true : on[di];
      const op = active ? 1 : 0.14;
      const P = (k: string) => new THREE.Vector3(cx + D.nodes[k][0], D.nodes[k][1], 0);
      const isVertex = (k: string) => k.startsWith('v');
      for (const L of D.lines) {
        const a = P(L.from);
        const b = P(L.to);
        const internal = isVertex(L.from) && isVertex(L.to);
        const pts = pathPoints(a, b, null, L.kind === 'g', 0.09);
        const { core, halo } = addTube(pts, L.color, L.kind === 'g' ? 0.026 : 0.034, op, internal);
        if (L.arrow !== 0) {
          const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: op }));
          cone.position.lerpVectors(a, b, 0.55);
          tmpA.subVectors(b, a).multiplyScalar(L.arrow).normalize();
          cone.quaternion.setFromUnitVectors(upY, tmpA);
          diagG.add(cone);
        }
        if (internal) {
          intAnims.push({ y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), halo, core, dim: op });
          if (active) {
            const mid = a.clone().lerp(b, 0.5);
            const dx = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? 0.42 : 0;
            const dy = dx === 0 ? 0.3 : 0;
            const nm = L.kind === 'g' ? 'γ*' : 'e*';
            const lab = stage.label(nm, [mid.x + dx, mid.y + dy, 0], 'muted', diagG);
            lab.element.style.color = css(L.color);
            diagLabels.push(lab);
          }
        } else if (active) {
          const pulse = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
          const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: L.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
          pulse.visible = false;
          glow.visible = false;
          diagG.add(pulse, glow);
          extAnims.push({ a, b, pulse, glow });
        }
        if (L.label) {
          const end = L.at === 'to' ? b : a;
          const lab = stage.label(L.label, [end.x + (end.x < cx ? -0.22 : 0.22), end.y + (end.y > 0 ? 0.2 : -0.2), 0], 'big', diagG);
          lab.element.style.color = css(L.color);
          lab.element.style.opacity = String(active ? 1 : 0.35);
          diagLabels.push(lab);
        }
      }
      // Loop corrections: vertex-correction photons, alternating between the two vertices.
      if (active) {
        for (let j = 0; j < loops; j++) {
          const vk = j % 2 === 0 ? 'v1' : 'v2';
          const fl = D.lines.filter((L) => L.kind === 'f' && (L.from === vk || L.to === vk));
          if (fl.length < 2) continue;
          const fr = 0.38 + 0.2 * Math.floor(j / 2);
          const v = P(vk);
          const other = (L: LineSpec) => P(L.from === vk ? L.to : L.from);
          const p1 = v.clone().lerp(other(fl[0]), fr);
          const p2 = v.clone().lerp(other(fl[1]), fr);
          const mid = p1.clone().add(p2).multiplyScalar(0.5);
          const bulge = mid.clone().sub(v).normalize().multiplyScalar(0.38 + 0.12 * Math.floor(j / 2));
          const ctrl = mid.clone().add(bulge);
          const { core, halo } = addTube(pathPoints(p1, p2, ctrl, true, 0.05), LOOP_COL, 0.018, 1, true);
          intAnims.push({ y0: Math.min(p1.y, p2.y, ctrl.y) - 0.1, y1: Math.max(p1.y, p2.y, ctrl.y) + 0.1, halo, core, dim: 1 });
          for (const p of [p1, p2]) {
            const m = new THREE.Mesh(vertGeo, new THREE.MeshBasicMaterial({ color: LOOP_COL }));
            m.scale.setScalar(0.6);
            m.position.copy(p);
            diagG.add(m);
          }
        }
      }
      // Vertices (draggable handles)
      for (const vk of ['v1', 'v2']) {
        const v = P(vk);
        const m = new THREE.Mesh(vertGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op }));
        m.position.set(v.x, v.y, 0.03);
        diagG.add(m);
        vertAnims.push({ mesh: m, y: v.y });
        const h = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ visible: false }));
        h.position.copy(m.position);
        h.userData = { di, vk };
        diagG.add(h);
        handles.push(h);
      }
      // Title under the diagram
      const t = stage.label(active ? D.title : `${D.title} (off)`, [cx, -BOARD_H / 2 + 0.2, 0], 'muted', diagG);
      t.element.style.fontSize = '11px';
      diagLabels.push(t);
    });
    if (layouts.length > 1) {
      const plus = stage.label('+', [(centers[0] + centers[1]) / 2, 0, 0], 'big', diagG);
      plus.element.style.fontSize = '26px';
      plus.element.style.background = 'transparent';
      diagLabels.push(plus);
    }
    loopLab.element.textContent = loops > 0 ? `pink loops: ${loops}-loop correction, size ~ (α/π)${sup(loops)} ≈ ${sci(loopFactor(loops), 1)}` : '';
    loopLab.visible = loops > 0;
    const ampTxt = layouts.length > 1
      ? proc === 'compton' ? '𝓜 = 𝓜ₛ + 𝓜ᵤ, only the sum is physical' : '|𝓜₁ + 𝓜₂|² = |𝓜₁|² + |𝓜₂|² + interference'
      : '|𝓜|²  ∝  e⁴ = (4πα)²';
    ampLab.element.textContent = ampTxt;
  }

  // ---------------------------------------------------------------- polar plot
  const plotG = new THREE.Group();
  plotG.position.set(PLOT_X, 0.55, 0);
  plotG.rotation.set(0.28, -0.5, 0);
  scene.add(plotG);

  const surfPos = new Float32Array((NT + 1) * (NP + 1) * 3);
  const surfCol = new Float32Array((NT + 1) * (NP + 1) * 3);
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(surfPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(surfCol, 3));
  {
    const idx: number[] = [];
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NP; j++) {
        const a = i * (NP + 1) + j;
        const b = a + NP + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    surfGeo.setIndex(idx);
  }
  const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.4, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.1, depthWrite: false });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  plotG.add(surf);
  // Surface wire rings for depth cues
  const RINGS = 9;
  const ringPos = new Float32Array(RINGS * (NP + 1) * 2 * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  const rings = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: 0x6fb6d6, transparent: true, opacity: 0.35 }));
  plotG.add(rings);

  // Profile curves in the plane of the probe: total (white) and no-interference (amber)
  const profPos = new Float32Array((2 * NT + 2) * 3);
  const profGeo = new THREE.BufferGeometry();
  profGeo.setAttribute('position', new THREE.BufferAttribute(profPos, 3));
  const profile = new THREE.Line(profGeo, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  profile.renderOrder = 10;
  plotG.add(profile);
  const incPos = new Float32Array((2 * NT + 2) * 3);
  const incGeo = new THREE.BufferGeometry();
  incGeo.setAttribute('position', new THREE.BufferAttribute(incPos, 3));
  const incMat = new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.09, gapSize: 0.06, depthTest: false, transparent: true });
  const incoherent = new THREE.Line(incGeo, incMat);
  incoherent.renderOrder = 11;
  plotG.add(incoherent);

  // Beam axis and acceptance cones
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-PLOT_R - 0.7, 0, 0, PLOT_R + 0.7, 0, 0], 3));
    plotG.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x56627c })));
  }
  const beamArrowL = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-PLOT_R - 1.3, 0, 0), 0.8, PALETTE.green, 0.22, 0.12);
  const beamArrowR = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(PLOT_R + 1.3, 0, 0), 0.8, PALETTE.green, 0.22, 0.12);
  plotG.add(beamArrowL, beamArrowR);
  const beamLabL = stage.label('e⁻', [-PLOT_R - 1.2, 0.28, 0], 'muted', plotG);
  const beamLabR = stage.label('e⁺', [PLOT_R + 1.2, 0.28, 0], 'muted', plotG);
  const cutPos = new Float32Array(8 * 3);
  const cutGeo = new THREE.BufferGeometry();
  cutGeo.setAttribute('position', new THREE.BufferAttribute(cutPos, 3));
  const cutLines = new THREE.LineSegments(cutGeo, new THREE.LineDashedMaterial({ color: 0x56627c, dashSize: 0.08, gapSize: 0.08 }));
  plotG.add(cutLines);
  {
    const c = Math.cos(THETA_CUT) * (PLOT_R + 0.4);
    const s = Math.sin(THETA_CUT) * (PLOT_R + 0.4);
    cutPos.set([0, 0, 0, c, s, 0, 0, 0, 0, c, -s, 0, 0, 0, 0, -c, s, 0, 0, 0, 0, -c, -s, 0]);
    cutLines.computeLineDistances();
  }
  const cutLab = stage.label('10° cut', [PLOT_R + 0.35, 0.62, 0], 'muted', plotG);
  cutLab.element.style.fontSize = '10.5px';
  const plotTitle = stage.label('dσ/dΩ: where the particles go', [0, -PLOT_R - 0.35, 0], 'muted', plotG);
  plotTitle.element.style.fontSize = '12px';

  // Probe ray and marker
  const probePos = new Float32Array(6);
  const probeGeo = new THREE.BufferGeometry();
  probeGeo.setAttribute('position', new THREE.BufferAttribute(probePos, 3));
  const probeLine = new THREE.Line(probeGeo, new THREE.LineBasicMaterial({ color: PALETTE.rose }));
  plotG.add(probeLine);
  const probeDot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), new THREE.MeshBasicMaterial({ color: PALETTE.rose }));
  plotG.add(probeDot);
  const refDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9aa6bd }));
  plotG.add(refDot);
  const probeLab = stage.label('θ', [0, 0, 0], 'muted', plotG);
  probeLab.element.style.color = css(PALETTE.rose);

  const cA = new THREE.Color(0x1f6f9a);
  const cB = new THREE.Color(PALETTE.cyan);
  const cC = new THREE.Color(PALETTE.amber);
  const tc = new THREE.Color();
  const fvals = new Float64Array(NT + 1);
  const ivals = new Float64Array(NT + 1);
  const thetas = new Float64Array(NT + 1);

  let fMax = 1;
  const radius = (f: number) => {
    if (!(f > 0)) return 0;
    if (!logR) return (PLOT_R * f) / fMax;
    const DEC = 3;
    return PLOT_R * Math.max(0, 1 + Math.log10(f / fMax) / DEC);
  };

  function thetaRange(): [number, number] {
    const [lo, hi] = cosRange(proc);
    return [Math.acos(hi), Math.acos(lo)];
  }

  function probeTheta(): number {
    const th = probeDeg * DEG;
    if (proc === 'bhabha' || proc === 'moller') return Math.min(179 * DEG, Math.max(1 * DEG, th));
    return th;
  }

  function rebuildPlot(): void {
    const [t0, t1] = thetaRange();
    fMax = 0;
    const showInc = layouts.length > 1 && chans.a && chans.b && proc !== 'compton';
    for (let i = 0; i <= NT; i++) {
      const th = t0 + ((t1 - t0) * i) / NT;
      thetas[i] = th;
      const c = Math.cos(th);
      fvals[i] = dsdo(proc, c, E, chans);
      if (showInc) {
        const P = parts(proc, c);
        ivals[i] = fvals[i] * ((P.a + P.b) / (P.a + P.b + P.i));
      }
      fMax = Math.max(fMax, fvals[i], showInc ? ivals[i] : 0);
    }
    if (!(fMax > 0)) fMax = 1;
    for (let i = 0; i <= NT; i++) {
      const th = thetas[i];
      const r = radius(fvals[i]);
      const st = Math.sin(th);
      const ct = Math.cos(th);
      const u = Math.min(1, r / PLOT_R);
      if (u < 0.5) tc.copy(cA).lerp(cB, u * 2);
      else tc.copy(cB).lerp(cC, (u - 0.5) * 2);
      for (let j = 0; j <= NP; j++) {
        const ph = (2 * Math.PI * j) / NP;
        const k = (i * (NP + 1) + j) * 3;
        surfPos[k] = r * ct;
        surfPos[k + 1] = r * st * Math.cos(ph);
        surfPos[k + 2] = r * st * Math.sin(ph);
        surfCol[k] = tc.r;
        surfCol[k + 1] = tc.g;
        surfCol[k + 2] = tc.b;
      }
      // Profile: upper half (phi = 0) forward, lower half filled below
      profPos[i * 3] = r * ct;
      profPos[i * 3 + 1] = r * st;
      profPos[i * 3 + 2] = 0.002;
      const m = 2 * NT + 1 - i;
      profPos[m * 3] = r * ct;
      profPos[m * 3 + 1] = -r * st;
      profPos[m * 3 + 2] = 0.002;
      if (showInc) {
        const ri = radius(ivals[i]);
        incPos[i * 3] = ri * ct;
        incPos[i * 3 + 1] = ri * st;
        incPos[i * 3 + 2] = 0.004;
        incPos[m * 3] = ri * ct;
        incPos[m * 3 + 1] = -ri * st;
        incPos[m * 3 + 2] = 0.004;
      }
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();
    profGeo.attributes.position.needsUpdate = true;
    profGeo.computeBoundingSphere();
    incoherent.visible = showInc;
    if (showInc) {
      incGeo.attributes.position.needsUpdate = true;
      incoherent.computeLineDistances();
      incGeo.computeBoundingSphere();
    }
    // Rings at fixed theta steps
    let w = 0;
    for (let q = 1; q <= RINGS; q++) {
      const i = Math.round((q * NT) / (RINGS + 1));
      for (let j = 0; j < NP; j++) {
        for (const jj of [j, j + 1]) {
          const k = (i * (NP + 1) + jj) * 3;
          ringPos[w++] = surfPos[k];
          ringPos[w++] = surfPos[k + 1];
          ringPos[w++] = surfPos[k + 2];
        }
      }
    }
    ringGeo.setDrawRange(0, RINGS * NP * 2);
    ringGeo.attributes.position.needsUpdate = true;
    ringGeo.computeBoundingSphere();
    const hasCut = proc === 'bhabha' || proc === 'moller';
    cutLines.visible = hasCut;
    cutLab.visible = hasCut;
    plotTitle.element.textContent = `dσ/dΩ: where the particles go${logR ? ' (log radius)' : ''}`;
    // Beam labels
    beamLabL.element.textContent = proc === 'compton' ? 'γ in' : 'e⁻';
    beamLabR.element.textContent = proc === 'moller' ? 'e⁻' : 'e⁺';
    beamLabR.visible = proc !== 'compton';
    beamArrowL.setColor(proc === 'compton' ? G_COL : E_COL);
    beamArrowR.visible = proc !== 'compton';
    placeProbe();
  }

  function placeProbe(): void {
    const th = probeTheta();
    const f = dsdo(proc, Math.cos(th), E, chans);
    const r = Math.min(radius(f), PLOT_R * 1.35);
    const L = PLOT_R + 0.35;
    probePos[0] = 0; probePos[1] = 0; probePos[2] = 0;
    probePos[3] = L * Math.cos(th); probePos[4] = L * Math.sin(th); probePos[5] = 0;
    probeGeo.attributes.position.needsUpdate = true;
    probeGeo.computeBoundingSphere();
    probeDot.position.set(r * Math.cos(th), r * Math.sin(th), 0.01);
    probeLab.position.set((L + 0.2) * Math.cos(th), (L + 0.2) * Math.sin(th), 0);
    probeLab.element.textContent = `θ = ${Math.round(th / DEG)}°`;
    const f90 = dsdo(proc, 0, E, chans);
    const r90 = radius(f90);
    refDot.position.set(0, r90, 0.01);
    dsdoProbe = f;
    ratio90 = f90 > 0 ? f / f90 : 0;
  }

  // ---------------------------------------------------------------- overlays
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '360px',
    background: 'rgba(7,10,18,0.86)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 11px',
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
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  function writeInfo(): void {
    const sw = (c: number, t: string) => `<span style="color:${css(c)}">■</span> ${t}`;
    const q = isEE(proc)
      ? `√s = ${E.toFixed(2)} GeV`
      : `E<sub>γ</sub> = ${sci(E * ME_MEV, 2)} MeV, k = ${sci(E, 2)}`;
    const html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif">${PROCESS_LABEL[proc]}</div>
<div>${q} · σ = <span style="color:#dfe6f3">${fmtSigma(proc, sigma)}</span>${proc === 'bhabha' || proc === 'moller' ? ' <span style="color:#8391ab">(10°–170°)</span>' : ''}</div>
<div>${sw(E_COL, 'e')} ${proc === 'mumu' ? sw(MU_COL, 'μ') : ''} ${sw(G_COL, 'γ')} <span style="color:#8391ab">dot = real, flash = virtual</span></div>`;
    if (html !== infoHtml) { info.innerHTML = html; infoHtml = html; }
  }

  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    const L = 62, R = W - 18, T = 44, B = H - 42;
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    const ee = isEE(proc);
    c.fillText(ee ? 'σ vs √s in GeV (log–log)' : 'σ vs k = Eγ/mₑc² (log–log)', 16, 28);
    const x0 = ee ? Math.log10(1) : -3;
    const x1 = ee ? Math.log10(40) : 2;
    let fn: (x: number) => number;
    let y0: number, y1: number;
    if (ee) {
      const s10 = sigmaNumeric(proc, 10, chans, 400);
      fn = (lx) => s10 * 100 / (10 ** (2 * lx));
      y0 = Math.log10(Math.min(fn(x1), sigmaMuMu(40)) * 0.6);
      y1 = Math.log10(Math.max(fn(x0), proc === 'mumu' ? sigmaMuMu(1) * 4.2 : 0) * 1.6);
    } else {
      fn = (lx) => kleinNishinaTotal(10 ** lx);
      y0 = Math.log10(fn(x1) * 0.6);
      y1 = Math.log10(THOMSON_BARN * 1.6);
    }
    const X = (lx: number) => L + ((lx - x0) / (x1 - x0)) * (R - L);
    const Y = (ly: number) => B - ((ly - y0) / (y1 - y0)) * (B - T);
    c.strokeStyle = '#243049';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(L, T); c.lineTo(L, B); c.lineTo(R, B); c.stroke();
    c.fillStyle = '#56627c';
    c.font = '17px JetBrains Mono, monospace';
    const ticks = ee ? [1, 3, 10, 30] : [-3, -2, -1, 0, 1, 2];
    for (const tk of ticks) {
      const lx = ee ? Math.log10(tk) : tk;
      const x = X(lx);
      c.fillText(ee ? String(tk) : String(10 ** tk), x - 10, B + 22);
    }
    // Hadrons (R ratio) steps for the muon-pair view
    if (proc === 'mumu') {
      c.strokeStyle = css(PALETTE.violet);
      c.lineWidth = 2.5;
      c.beginPath();
      for (let i = 0; i <= 200; i++) {
        const lx = x0 + ((x1 - x0) * i) / 200;
        const e = 10 ** lx;
        const v = rRatio(activeQuarks(e)) * sigmaMuMu(e);
        const x = X(lx);
        const y = Y(Math.log10(v));
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = css(PALETTE.violet);
      c.fillText('R=2', X(Math.log10(1.7)), Y(Math.log10(2 * sigmaMuMu(1.7))) - 10);
      c.fillText('10/3', X(Math.log10(4.6)), Y(Math.log10((10 / 3) * sigmaMuMu(4.6))) - 10);
      c.fillText('11/3', X(Math.log10(15)), Y(Math.log10((11 / 3) * sigmaMuMu(15))) - 10);
      c.fillText('hadrons = R·σμμ', R - 175, T + 18);
    }
    if (!ee) {
      c.setLineDash([8, 6]);
      c.strokeStyle = '#8391ab';
      c.beginPath(); c.moveTo(L, Y(Math.log10(THOMSON_BARN))); c.lineTo(R, Y(Math.log10(THOMSON_BARN))); c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#8391ab';
      c.fillText('Thomson limit 0.665 b', X(-2.9), Y(Math.log10(THOMSON_BARN)) + 24);
    }
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const lx = x0 + ((x1 - x0) * i) / 120;
      const x = X(lx);
      const y = Y(Math.log10(fn(lx)));
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    // Reference and current markers
    const lxNow = Math.log10(E);
    if (ee) {
      const lr = Math.log10(refE);
      c.fillStyle = '#9aa6bd';
      c.beginPath(); c.arc(X(lr), Y(Math.log10(fn(lr))), 5, 0, 2 * Math.PI); c.fill();
    }
    c.fillStyle = css(PALETTE.rose);
    c.beginPath(); c.arc(X(lxNow), Y(Math.log10(fn(lxNow))), 8, 0, 2 * Math.PI); c.fill();
    c.fillStyle = css(PALETTE.cyan);
    c.font = '18px JetBrains Mono, monospace';
    if (ee) c.fillText(proc === 'mumu' ? 'σμμ ∝ 1/s' : 'σ ∝ 1/s', R - 175, T - 4);
    else c.fillText('Klein–Nishina', L + 14, B - 14);
  }

  // ---------------------------------------------------------------- physics refresh
  function refresh(): void {
    E = energyOf(proc, sliderV[proc]);
    const ch: Channels = layouts.length > 1 ? chans : { a: true, b: true };
    sigma = sigmaNumeric(proc, E, ch, 800);
    interf = interferenceShare(proc, ch);
    if (proc === 'mumu') checkErr = Math.abs(sigma / sigmaMuMu(E) - 1);
    else if (proc === 'compton') checkErr = Math.abs(sigma / kleinNishinaTotal(E) - 1);
    else checkErr = Math.abs(sigmaNumeric(proc, E, ch, 400) / sigma - 1);
    rebuildPlot();
    writeInfo();
    drawInset();
  }

  function pinReference(): void {
    refE = E;
    refSigma = sigma;
  }

  // ---------------------------------------------------------------- dragging vertices
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitP = new THREE.Vector3();
  let drag: { di: number; vk: string } | null = null;
  let boardDirty = false;
  const canvas = stage.renderer.domElement;

  const setNdc = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
  };
  const pickHandle = (e: PointerEvent) => {
    setNdc(e);
    const h = ray.intersectObjects(handles, false)[0];
    return h ? (h.object.userData as { di: number; vk: string }) : null;
  };
  const onDown = (e: PointerEvent) => {
    const h = pickHandle(e);
    if (!h) return;
    drag = h;
    stage.controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      canvas.style.cursor = pickHandle(e) ? 'grab' : '';
      return;
    }
    setNdc(e);
    if (!ray.ray.intersectPlane(plane, hitP)) return;
    const cx = slotCenters()[drag.di] + BOARD_X;
    const x = Math.max(-SLOT_HALF[0], Math.min(SLOT_HALF[0], hitP.x - cx));
    const y = Math.max(-SLOT_HALF[1], Math.min(SLOT_HALF[1], hitP.y - boardG.position.y));
    layouts[drag.di].nodes[drag.vk] = [x, y];
    dragged = true;
    boardDirty = true;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    stage.controls.enabled = true;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('Process');
  let energyCtl: Control<number>;
  let chanACtl: Control<boolean>;
  let chanBCtl: Control<boolean>;
  let logCtl: Control<boolean>;
  const setProcess = (p: Process) => {
    proc = p;
    logR = p === 'bhabha' || p === 'moller';
    logCtl.set(logR, false);
    layouts = diagramsFor(p);
    chans.a = true;
    chans.b = true;
    chanACtl.set(true, false);
    chanBCtl.set(true, false);
    energyCtl.set(sliderV[p], false);
    syncChanUi();
    buildBoard();
    refresh();
    pinReference();
  };
  ui.select<Process>({
    key: 'process', label: 'Process', value: proc,
    options: [
      { value: 'mumu', label: 'e⁺e⁻→μ⁺μ⁻' },
      { value: 'bhabha', label: 'Bhabha' },
      { value: 'moller', label: 'Møller' },
      { value: 'compton', label: 'Compton' },
    ],
    onChange: (v) => setProcess(v),
  });
  energyCtl = ui.slider({
    key: 'energy', label: 'Energy', min: 25, max: 1000, step: 1, value: sliderV[proc],
    format: (v) => {
      const e = energyOf(proc, v);
      return isEE(proc) ? `√s = ${e.toFixed(2)} GeV` : `Eγ = ${sci(e * ME_MEV, 2)} MeV`;
    },
    onInput: (v) => { sliderV[proc] = v; refresh(); },
  });
  const btns = ui.buttons([
    { label: 'Pin σ reference', key: 'pin', onClick: () => { pinReference(); drawInset(); } },
    { label: 'Reset layout', onClick: () => { layouts = diagramsFor(proc); buildBoard(); } },
    { label: 'Pause', onClick: () => { playing = !playing; btns[2].textContent = playing ? 'Pause' : 'Play'; } },
  ]);

  ui.section('Diagrams');
  chanACtl = ui.toggle({ key: 'chanA', label: CHAN_NAMES[proc][0], value: true, onChange: (v) => { chans.a = v; buildBoard(); refresh(); } });
  chanBCtl = ui.toggle({ key: 'chanB', label: CHAN_NAMES[proc][1], value: true, onChange: (v) => { chans.b = v; buildBoard(); refresh(); } });
  const chanNote = ui.note('');
  ui.slider({
    key: 'loops', label: 'Loop order (illustrative)', min: 0, max: 4, step: 1, value: loops,
    format: (v) => (v === 0 ? 'tree' : `${v} loop${v > 1 ? 's' : ''}`),
    onInput: (v) => { loops = v; buildBoard(); },
  });

  function syncChanUi(): void {
    const names = CHAN_NAMES[proc];
    const setName = (ctl: Control<boolean>, t: string) => {
      const sp = ctl.el.querySelector('label > span:last-child');
      if (sp) sp.textContent = t;
    };
    setName(chanACtl, names[0]);
    setName(chanBCtl, names[1]);
    const lock = proc === 'mumu' || proc === 'compton';
    for (const ctl of [chanACtl, chanBCtl]) {
      ctl.el.style.opacity = lock ? '0.4' : '';
      ctl.el.style.pointerEvents = lock ? 'none' : '';
    }
    chanNote.textContent = proc === 'mumu'
      ? 'Muon pairs have only one tree diagram: nothing to interfere with.'
      : proc === 'compton'
        ? 'Compton needs both diagrams. Either one alone breaks gauge invariance, so neither is physical by itself.'
        : 'Each diagram alone is gauge invariant here, so you can switch one off and compare.';
  }

  ui.section('Angular distribution');
  ui.slider({ key: 'probe', label: 'Probe angle θ', min: 0, max: 180, step: 1, value: probeDeg, unit: '°', onInput: (v) => { probeDeg = v; placeProbe(); } });
  logCtl = ui.toggle({ key: 'log', label: 'Log radial scale (3 decades)', value: logR, onChange: (v) => { logR = v; rebuildPlot(); } });

  ui.section('Readouts');
  const rSigma = ui.readout('sigma', 'σ (accepted)');
  const rDsdo = ui.readout('dsdo', 'dσ/dΩ at θ');
  const rRatio90 = ui.readout('ratio90', 'dσ/dΩ(θ) ÷ dσ/dΩ(90°)');
  const rInterf = ui.readout('interf', 'interference share');
  const rQ2 = ui.readout('qsq', 'virtual line q²');
  const rAlpha = ui.readout('alpha', 'vertex e = √(4πα)');
  const rLoop = ui.readout('loopsize', 'loop term ~ (α/π)ⁿ');
  const rCheck = ui.readout('check', '∫dΩ accuracy');
  const rR = ui.readout('R', 'R = 3Σq² here');
  const rRef = ui.readout('sigmaRatio', 'σ_ref ÷ σ, √s ÷ √s_ref');

  function updateReadouts(): void {
    rSigma(fmtSigma(proc, sigma));
    rDsdo(`${sci(dsdoProbe, 2)} ${isEE(proc) ? 'nb' : 'b'}/sr`);
    rRatio90(ratio90 >= 100 ? ratio90.toFixed(0) : ratio90.toFixed(3));
    rInterf(layouts.length > 1 && chans.a && chans.b && proc !== 'compton' ? `${(interf * 100).toFixed(2)} %` : proc === 'compton' ? 'inseparable' : '0 (one diagram)');
    const th = probeTheta();
    if (proc === 'compton') {
      const vS = virtuality(proc, 'a', Math.cos(th), E);
      const vU = virtuality(proc, 'b', Math.cos(th), E);
      rQ2(`p²−m²: ${sci(vS, 2)}, ${sci(vU, 2)} m²`);
    } else {
      const q1 = virtuality(proc, 'a', Math.cos(th), E);
      const q2 = virtuality(proc, 'b', Math.cos(th), E);
      rQ2(layouts.length > 1 ? `${sci(q1, 1)}, ${sci(q2, 1)} GeV²` : `+${sci(q1, 1)} GeV²`);
    }
    rAlpha(`${Math.sqrt(4 * Math.PI * ALPHA).toFixed(4)} (α = 1/137.036)`);
    rLoop(loops === 0 ? '1 (tree)' : sci(loopFactor(loops), 1));
    rCheck(checkErr < 1e-14 ? '< 1e-14' : `${checkErr.toExponential(1)} rel.`);
    rR(proc === 'mumu' ? `${rRatio(activeQuarks(E)).toFixed(3)} (${activeQuarks(E)} quarks)` : 'n/a');
    const eRatio = isEE(proc) ? E / refE : comptonSqrtS(E) / comptonSqrtS(refE);
    rRef(`${(refSigma / sigma).toFixed(3)},  ${eRatio.toFixed(3)}`);
  }

  // ---------------------------------------------------------------- frame loop
  let clock = 0;
  let infoTimer = 0;
  stage.onFrame((dt) => {
    if (boardDirty) { boardDirty = false; buildBoard(); }
    if (playing) clock = (clock + dt) % (SWEEP + PAUSE);
    const u = Math.min(1, clock / SWEEP);
    const now = NOW_LO + (NOW_HI - NOW_LO) * u;
    const sweeping = clock < SWEEP;
    nowLine.position.y = now;
    nowMat.opacity = sweeping ? 0.35 : 0.08;
    for (const A of extAnims) {
      const ylo = Math.min(A.a.y, A.b.y);
      const yhi = Math.max(A.a.y, A.b.y);
      const vis = sweeping && now >= ylo && now <= yhi && yhi - ylo > 1e-3;
      A.pulse.visible = vis;
      A.glow.visible = vis;
      if (vis) {
        const f = (now - A.a.y) / (A.b.y - A.a.y);
        A.pulse.position.lerpVectors(A.a, A.b, f);
        A.pulse.position.z = 0.06;
        A.glow.position.copy(A.pulse.position);
      }
    }
    for (const I of intAnims) {
      const on = sweeping && now >= I.y0 - 0.12 && now <= I.y1 + 0.12;
      const target = on ? 0.75 * I.dim : 0.16 * I.dim;
      I.halo.opacity += (target - I.halo.opacity) * Math.min(1, dt * 10);
      I.core.opacity = I.dim * (on ? 1 : 0.7);
    }
    for (const V of vertAnims) {
      const d = now - V.y;
      V.mesh.scale.setScalar(sweeping && d >= 0 && d < 0.5 ? 1 + 1.2 * Math.exp(-d * 8) : 1);
    }
    infoTimer += dt;
    if (infoTimer > 0.2) { infoTimer = 0; updateReadouts(); }
  });

  // ---------------------------------------------------------------- init
  syncChanUi();
  buildBoard();
  refresh();
  pinReference();
  updateReadouts();

  return {
    state: () => {
      const eRatio = isEE(proc) ? E / refE : comptonSqrtS(E) / comptonSqrtS(refE);
      return {
        process: proc,
        energy: E,
        sqrtS: isEE(proc) ? E : comptonSqrtS(E) / 1000,
        chanA: layouts.length > 1 ? chans.a : true,
        chanB: layouts.length > 1 ? chans.b : false,
        probe: probeDeg,
        ratio90,
        sigma,
        interf,
        loops,
        log: logR,
        dragged,
        energyRatio: eRatio,
        sigmaRatio: refSigma / sigma,
        R: rRatio(activeQuarks(isEE(proc) ? E : 0)),
      };
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      clearBoard();
      for (const g of shared) g.dispose();
      info.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'feynman-diagrams',
  number: 72,
  title: 'Feynman Diagrams & QED',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Little pictures that add up to the most precise theory we have.',
  content,
  mount,
};

export default topic;
