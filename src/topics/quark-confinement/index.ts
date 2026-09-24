import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content, E_TH } from './content.ts';
import {
  ALPHA_S_MZ,
  alphaS,
  breakingDistance,
  CHARM_FIT,
  cornell,
  HBARC,
  M_DD,
  M_JPSI,
  M_PSI2S,
  MZ,
  quarkoniumMass,
  radialWave,
  tensionTonnes,
  traceDipoleLine,
  tubeProfile,
  type QuarkoniumParams,
} from './physics.ts';

type View = 'tube' | 'levels' | 'jets';
type Quark = 'light' | 'charm';

const S = 3.2; // world units per fm
const JET_T = 5.6; // jets animation loop, s
const LEAD_V = 2.2;
const LEAD_T = 1.9; // after this the leading quarks are inside the fastest hadrons
const R_MIN = 0.1;
const R_MAX = 2.5;
const R0 = 0.8; // default separation, fm
const TUBE_R = 0.2 * S; // visual tube radius
const HEAL = 0.07 * S; // how fast field lines gather into the tube near a quark
const MESON_L = 0.42; // fm, length of each meson's short tube after a break
const TUBE_Y = -1.45; // tube height when the dipole is shown above it
const DIP_Y = 1.55;
const DIP_BOX_Y = 1.15; // half-height of the region the dipole lines are drawn in
const DIP_BOX_X = 4.9;

const CAM: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  tube: { pos: [0, 1.4, 10.6], target: [0, 0, 0] },
  levels: { pos: [-0.9, 0.1, 10.8], target: [-0.9, 0, 0] },
  jets: { pos: [0, 4.2, 11.5], target: [0, 0, 0] },
};

const RED = PALETTE.red;
const ANTIRED = PALETTE.cyan; // anti-red is drawn as cyan, its complementary colour
const TUBE_COL = PALETTE.amber;

const FLAVOURS: Record<Quark, { q: string; qb: string; nq: string; nqb: string; left: string; right: string; size: number }> = {
  light: { q: 'u', qb: 'ū', nq: 'd', nqb: 'd̄', left: 'π⁺ (u d̄)', right: 'π⁻ (d ū)', size: 0.19 },
  charm: { q: 'c', qb: 'c̄', nq: 'u', nqb: 'ū', left: 'D⁰ (c ū)', right: 'D̄⁰ (u c̄)', size: 0.27 },
};

const GLOW_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vX;
void main() {
  vX = position.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
uniform float uGain;
varying vec3 vN;
varying vec3 vV;
varying float vX;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(f, 2.2);
  float flow = 0.85 + 0.15 * sin(vX * uLen * 7.0 - uTime * 6.0);
  float w = min(0.45, 0.35 / max(uLen, 0.01));
  float ends = 1.0 - smoothstep(0.5 - w, 0.5, abs(vX));
  float a = core * flow * ends * uGain;
  gl_FragColor = vec4(uColor * a, a);
}`;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.tube.pos, target: CAM.tube.target, fov: 42 });
  const { scene } = stage;
  const glowTex = glowTexture();

  // --- State
  let r = R0;
  let sigma = 0.9;
  let emCompare = false;
  let quark: Quark = 'light';
  let view: View = 'tube';
  let logQ = Math.log10(2);
  let broken = false;
  let breaks = 0;
  let touched = false;
  let breakU = 1; // 0..1 animation of the new pair moving into place
  let breakX = 0; // where the tube snapped, in fm from the centre
  let flashT = 10;
  let pulling = false;
  const alphaC = CHARM_FIT.alphaS; // coupling used in the potential
  const rb = () => breakingDistance(E_TH, alphaC, sigma);
  const V = () => cornell(r, alphaC, sigma);
  const Q = () => Math.pow(10, logQ);

  // =========================================================================
  // Flux tube view
  // =========================================================================
  const tubeView = new THREE.Group();
  scene.add(tubeView);
  const tubeRoot = new THREE.Group(); // shifted down when the dipole is shown
  tubeView.add(tubeRoot);

  const NL = 14; // field lines inside a tube
  const NP = 72; // points per line
  const lineSpec: { phi: number; rho: number }[] = [];
  for (let k = 0; k < NL; k++) lineSpec.push({ phi: (k * 2.39996) % (Math.PI * 2), rho: TUBE_R * (0.25 + 0.75 * Math.sqrt((k + 0.5) / NL)) });

  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
  cylGeo.rotateZ(Math.PI / 2);

  class FluxTube {
    readonly group = new THREE.Group();
    readonly mat: THREE.ShaderMaterial;
    readonly mesh: THREE.Mesh;
    private readonly pos: Float32Array;
    private readonly geo: THREE.BufferGeometry;
    constructor() {
      this.mat = new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { uColor: { value: new THREE.Color(TUBE_COL) }, uTime: { value: 0 }, uLen: { value: 1 }, uGain: { value: 1.2 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.mesh = new THREE.Mesh(cylGeo, this.mat);
      this.group.add(this.mesh);
      this.pos = new Float32Array(NL * (NP - 1) * 6);
      this.geo = new THREE.BufferGeometry();
      this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      const lines = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      lines.frustumCulled = false;
      this.group.add(lines);
    }
    /** Span from x0 to x1 in world units. */
    set(x0: number, x1: number): void {
      const L = Math.max(1e-3, x1 - x0);
      const xc = 0.5 * (x0 + x1);
      const rVis = TUBE_R * (1 - Math.exp(-(L / 2) / HEAL));
      this.mesh.position.set(xc, 0, 0);
      this.mesh.scale.set(L, Math.max(0.02, rVis), Math.max(0.02, rVis));
      this.mat.uniforms.uLen.value = L;
      const p = this.pos;
      let o = 0;
      for (let k = 0; k < NL; k++) {
        const { phi, rho } = lineSpec[k];
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        for (let j = 0; j < NP - 1; j++) {
          for (let e = 0; e < 2; e++) {
            const x = x0 + ((j + e) / (NP - 1)) * L;
            const rr = tubeProfile(x - xc, L, rho, HEAL);
            p[o++] = x;
            p[o++] = rr * c;
            p[o++] = rr * s;
          }
        }
      }
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  const mainTube = new FluxTube();
  const tubeL = new FluxTube();
  const tubeR = new FluxTube();
  tubeRoot.add(mainTube.group, tubeL.group, tubeR.group);

  // Quarks: q (red) and q-bar (anti-red) at the ends, plus the pair made when the tube snaps.
  const qGeo = new THREE.SphereGeometry(1, 28, 18);
  function makeQuark(color: number): { mesh: THREE.Mesh; halo: THREE.Sprite; group: THREE.Group } {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(qGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(mesh, halo);
    return { mesh, halo, group };
  }
  const qA = makeQuark(RED);
  const qB = makeQuark(ANTIRED);
  const nQb = makeQuark(ANTIRED); // new antiquark, joins the left quark
  const nQ = makeQuark(RED); // new quark, joins the right antiquark
  tubeRoot.add(qA.group, qB.group, nQb.group, nQ.group);
  const labA = stage.label('', [0, 0.5, 0], '', qA.group);
  const labB = stage.label('', [0, 0.5, 0], '', qB.group);
  const labNQb = stage.label('', [0, -0.5, 0], '', nQb.group);
  const labNQ = stage.label('', [0, -0.5, 0], '', nQ.group);
  const tubeCaption = stage.label('', [0, 1.05, 0], 'big', tubeRoot);
  const mesonLabL = stage.label('', [0, -1.05, 0], '', tubeRoot);
  const mesonLabR = stage.label('', [0, -1.05, 0], '', tubeRoot);
  const widthLabel = stage.label('same width everywhere', [0, -0.95, 0], 'muted', tubeRoot);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  tubeRoot.add(flash);

  // --- Electric dipole for comparison
  const dipole = new THREE.Group();
  dipole.position.y = DIP_Y;
  tubeView.add(dipole);
  const eP = makeQuark(PALETTE.rose);
  const eM = makeQuark(PALETTE.violet);
  for (const e of [eP, eM]) e.mesh.scale.setScalar(0.17);
  for (const e of [eP, eM]) e.halo.scale.setScalar(0.8);
  dipole.add(eP.group, eM.group);
  stage.label('+', [0, 0.42, 0], '', eP.group);
  stage.label('−', [0, 0.42, 0], '', eM.group);
  stage.label('electric dipole: field lines spread through space', [0, -DIP_BOX_Y - 0.1, 0], 'big', dipole);
  const DIP_STARTS = 9; // lines per half plane
  const DIP_PLANES = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const DIP_MAXPTS = 420;
  const dipTrace = new Float32Array(DIP_MAXPTS * 2);
  const dipCap = DIP_PLANES.length * 2 * DIP_STARTS * (DIP_MAXPTS - 1) * 2 * 2;
  const dipPos = new Float32Array(dipCap * 3);
  const dipCol = new Float32Array(dipCap * 3);
  const dipGeo = new THREE.BufferGeometry();
  dipGeo.setAttribute('position', new THREE.BufferAttribute(dipPos, 3));
  dipGeo.setAttribute('color', new THREE.BufferAttribute(dipCol, 3));
  const dipLines = new THREE.LineSegments(dipGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  dipLines.frustumCulled = false;
  dipole.add(dipLines);
  const dipC = new THREE.Color(PALETTE.violet);

  function rebuildDipole(): void {
    const d = r * S;
    eP.group.position.set(-d / 2, 0, 0);
    eM.group.position.set(d / 2, 0, 0);
    let v = 0;
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < DIP_STARTS; k++) {
        const th = ((k + 0.5) / DIP_STARTS) * Math.PI * (side === 0 ? 1 : -1);
        const n = traceDipoleLine(d, th, dipTrace, DIP_MAXPTS, 0.03, 0.12, 12);
        // Clip to the drawing box. Lines that leave it are still heading outward.
        let m = n;
        for (let i = 0; i < n; i++) {
          if (Math.abs(dipTrace[2 * i + 1]) > DIP_BOX_Y || Math.abs(dipTrace[2 * i]) > DIP_BOX_X) {
            m = i;
            break;
          }
        }
        // A line that leaves the box never returns inside it. By symmetry its mirror image
        // (x -> -x) is a line arriving at the negative charge, so draw that too.
        const lastX = dipTrace[2 * (n - 1)];
        const lastY = dipTrace[2 * (n - 1) + 1];
        const closedLoop = m === n && Math.hypot(lastX - d / 2, lastY) < 0.3;
        const copies = closedLoop ? 1 : 2;
        for (let cp = 0; cp < copies; cp++)
        for (let pl = 0; pl < DIP_PLANES.length; pl++) {
          const c = Math.cos(DIP_PLANES[pl]);
          const s = Math.sin(DIP_PLANES[pl]);
          const shade = pl === 0 ? 1 : 0.22;
          const sx = cp === 0 ? 1 : -1;
          for (let i = 0; i + 1 < m; i++) {
            for (let e = 0; e < 2; e++) {
              const x = sx * dipTrace[2 * (i + e)];
              const y = dipTrace[2 * (i + e) + 1];
              const fade = shade * (1 - 0.6 * Math.min(1, Math.abs(y) / DIP_BOX_Y));
              dipPos[v * 3] = x;
              dipPos[v * 3 + 1] = y * c;
              dipPos[v * 3 + 2] = y * s;
              dipCol[v * 3] = dipC.r * fade;
              dipCol[v * 3 + 1] = dipC.g * fade;
              dipCol[v * 3 + 2] = dipC.b * fade;
              v++;
            }
          }
        }
      }
    }
    dipGeo.setDrawRange(0, v);
    (dipGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (dipGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Layout of the tube view (runs when a parameter changes)
  function layoutTube(): void {
    const f = FLAVOURS[quark];
    const half = (r * S) / 2;
    const size = f.size;
    for (const qq of [qA, qB, nQb, nQ]) {
      qq.mesh.scale.setScalar(size);
      qq.halo.scale.setScalar(size * 4.2);
    }
    qA.group.position.set(-half, 0, 0);
    qB.group.position.set(half, 0, 0);
    labA.element.textContent = `${f.q}  (red)`;
    labB.element.textContent = `${f.qb}  (anti-red)`;
    labNQb.element.textContent = f.nqb;
    labNQ.element.textContent = f.nq;
    tubeRoot.position.y = emCompare ? TUBE_Y : 0;
    aIn.c.style.display = view === 'levels' || (view === 'tube' && emCompare) ? 'none' : '';
    dipole.visible = emCompare;
    if (emCompare) rebuildDipole();

    mainTube.group.visible = !broken;
    tubeL.group.visible = broken;
    tubeR.group.visible = broken;
    nQb.group.visible = broken;
    nQ.group.visible = broken;
    mesonLabL.visible = broken;
    mesonLabR.visible = broken;
    widthLabel.visible = !broken && r > 0.7;
    if (!broken) {
      mainTube.set(-half, half);
      tubeCaption.element.textContent = emCompare ? 'QCD flux tube: the field stays in a tube' : `gluon flux tube, V = ${V().toFixed(2)} GeV`;
      tubeCaption.position.set(0, 1.05, 0);
    } else {
      placeMesons();
      tubeCaption.element.textContent = 'the tube snapped: two mesons, no free quark';
    }
    // Brighter and whiter as the stored energy nears the threshold.
    const frac = Math.max(0, Math.min(1, V() / E_TH));
    mainTube.mat.uniforms.uGain.value = 0.75 + 0.55 * frac;
    (mainTube.mat.uniforms.uColor.value as THREE.Color).setHex(TUBE_COL).lerp(WHITE, 0.3 * frac * frac);
    drawPotential();
  }
  const WHITE = new THREE.Color(0xffffff);

  function placeMesons(): void {
    const f = FLAVOURS[quark];
    const half = (r * S) / 2;
    const l = Math.min(MESON_L * S, half * 0.9);
    const u = 1 - (1 - breakU) ** 3;
    const bx = breakX * S;
    const xNqb = bx - 0.05 + (-half + l - (bx - 0.05)) * u;
    const xNq = bx + 0.05 + (half - l - (bx + 0.05)) * u;
    nQb.group.position.set(xNqb, 0, 0);
    nQ.group.position.set(xNq, 0, 0);
    const s = 0.25 + 0.75 * u;
    nQb.group.scale.setScalar(s);
    nQ.group.scale.setScalar(s);
    tubeL.set(-half, xNqb);
    tubeR.set(xNq, half);
    mesonLabL.position.set((-half + xNqb) / 2, -1.05, 0);
    mesonLabR.position.set((xNq + half) / 2, -1.05, 0);
    mesonLabL.element.textContent = f.left;
    mesonLabR.element.textContent = f.right;
  }

  function checkBreak(): void {
    const rB = rb();
    if (!broken && r >= rB) {
      broken = true;
      breaks++;
      breakU = 0;
      breakX = (Math.random() - 0.5) * 0.3 * r;
      flashT = 0;
      flash.position.set(breakX * S, 0, 0);
    } else if (broken && r < rB - 0.25) {
      // Push the mesons back together and the new pair can annihilate, re-forming one tube.
      broken = false;
      flashT = 0.25;
      flash.position.set(0, 0, 0);
    }
  }

  // =========================================================================
  // Charmonium levels view
  // =========================================================================
  const levelsView = new THREE.Group();
  levelsView.visible = false;
  scene.add(levelsView);
  const LX0 = -5.2; // x of r = 0
  const LSX = 3.0; // world units per fm
  const LRMAX = 2.0;
  const MLO = 2.85;
  const MHI = 4.35;
  const LY0 = -2.5;
  const LSY = 4.6 / (MHI - MLO);
  const lx = (rr: number) => LX0 + rr * LSX;
  const ly = (m: number) => LY0 + (m - MLO) * LSY;

  const NV = 200;
  const potPos = new Float32Array(NV * 3);
  const potGeo = new THREE.BufferGeometry();
  potGeo.setAttribute('position', new THREE.BufferAttribute(potPos, 3));
  const potLine = new THREE.Line(potGeo, new THREE.LineBasicMaterial({ color: TUBE_COL }));
  potLine.frustumCulled = false;
  levelsView.add(potLine);

  // Axes
  {
    const ax = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lx(0), ly(MLO), 0), new THREE.Vector3(lx(LRMAX), ly(MLO), 0),
      new THREE.Vector3(lx(0), ly(MLO), 0), new THREE.Vector3(lx(0), ly(MHI), 0),
    ]);
    levelsView.add(new THREE.LineSegments(ax, new THREE.LineBasicMaterial({ color: PALETTE.gridMajor })));
    stage.label('r (fm)', [lx(LRMAX) + 0.55, ly(MLO) - 0.3, 0], 'muted', levelsView);
    stage.label('mass (GeV)', [lx(0) - 0.2, ly(MHI) + 0.3, 0], 'muted', levelsView);
    for (const m of [3, 3.5, 4]) stage.label(m.toFixed(1), [lx(0) - 0.45, ly(m), 0], 'muted', levelsView);
    for (const rr of [0.5, 1, 1.5, 2]) stage.label(String(rr), [lx(rr), ly(MLO) - 0.3, 0], 'muted', levelsView);
    // Open-charm threshold
    const th = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(lx(0), ly(M_DD), 0), new THREE.Vector3(lx(LRMAX), ly(M_DD), 0)]);
    const thLine = new THREE.Line(th, new THREE.LineDashedMaterial({ color: PALETTE.red, dashSize: 0.12, gapSize: 0.1 }));
    thLine.computeLineDistances();
    levelsView.add(thLine);
    stage.label(`D D̄ threshold ${M_DD.toFixed(2)} GeV: above it, decays to D mesons`, [lx(0.95), ly(M_DD) + 0.2, 0], 'muted', levelsView);
  }
  const NLEV = 3;
  const NW = 160;
  const levColors = [PALETTE.cyan, PALETTE.green, PALETTE.violet];
  const levels = levColors.map((col) => {
    const lp = new Float32Array(6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const level = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 }));
    const wp = new Float32Array(NW * 3);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    const wave = new THREE.Line(wg, new THREE.LineBasicMaterial({ color: col }));
    level.frustumCulled = false;
    wave.frustumCulled = false;
    levelsView.add(level, wave);
    return { lp, lg, wp, wg };
  });
  const levLabels = [0, 1, 2].map(() => stage.label('', [0, 0, 0], '', levelsView));
  const levTitle = stage.label('', [1.2, ly(MHI) + 0.45, 0], 'big', levelsView);
  const levNote = stage.label('', [1.2, ly(MHI) + 0.05, 0], 'muted', levelsView);
  stage.label('curve on each level: radial wave u(r)', [lx(1.0), ly(MLO) - 0.75, 0], 'muted', levelsView);
  stage.label('model (GeV) | measured (GeV)', [lx(LRMAX) + 1.9, ly(MLO) + 0.1, 0], 'muted', levelsView);
  let levMass = [0, 0, 0];
  let levSigma = NaN;

  function levelParams(): QuarkoniumParams {
    return { ...CHARM_FIT, sigma };
  }

  function rebuildLevels(): void {
    if (levSigma === sigma) return;
    levSigma = sigma;
    const p = levelParams();
    for (let i = 0; i < NV; i++) {
      const rr = 0.04 + (i / (NV - 1)) * (LRMAX - 0.04);
      const m = Math.max(MLO, 2 * p.mq + cornell(rr, p.alphaS, p.sigma));
      potPos[i * 3] = lx(rr);
      potPos[i * 3 + 1] = ly(Math.min(MHI, m));
      potPos[i * 3 + 2] = 0;
    }
    (potGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const names = ['1S', '2S', '3S'];
    const meas = [`J/ψ ${M_JPSI.toFixed(3)}`, `ψ(2S) ${M_PSI2S.toFixed(3)}`, 'ψ(4040) 4.039'];
    for (let n = 0; n < NLEV; n++) {
      const M = quarkoniumMass(n, p);
      levMass[n] = M;
      const L = levels[n];
      // Level line spans out to the classical turning point.
      const rt = breakingDistance(M - 2 * p.mq, p.alphaS, p.sigma);
      L.lp.set([lx(0), ly(M), 0, lx(Math.min(LRMAX, rt)), ly(M), 0]);
      (L.lg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const u = radialWave(n, p, NW, LRMAX);
      let umax = 0;
      for (let i = 0; i < NW; i++) umax = Math.max(umax, Math.abs(u[i]));
      for (let i = 0; i < NW; i++) {
        L.wp[i * 3] = lx((i / (NW - 1)) * LRMAX);
        L.wp[i * 3 + 1] = ly(M) + (0.3 * u[i]) / umax;
        L.wp[i * 3 + 2] = 0.01;
      }
      (L.wg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      levLabels[n].position.set(lx(LRMAX) + 1.9, ly(M), 0);
      levLabels[n].element.textContent = `${names[n]} model ${M.toFixed(3)} | ${meas[n]}`;
    }
    const onFit = Math.abs(sigma - CHARM_FIT.sigma) < 1e-9;
    levTitle.element.textContent = 'charm quark + antiquark in the Cornell potential';
    levNote.element.textContent = onFit
      ? `fitted: αs = ${CHARM_FIT.alphaS}, mc = ${CHARM_FIT.mq} GeV, σ = ${CHARM_FIT.sigma} GeV/fm`
      : `σ moved off the fitted ${CHARM_FIT.sigma} GeV/fm, so levels shift`;
  }

  // =========================================================================
  // Jets view (qualitative)
  // =========================================================================
  const jetsView = new THREE.Group();
  jetsView.visible = false;
  scene.add(jetsView);
  const NH = 44;
  const rand = mulberry32(7);
  const hadrons: { side: number; tau: number; x0: number; dx: number; dy: number; dz: number; v: number }[] = [];
  const hadCols: THREE.Color[] = [];
  const hadPalette = [PALETTE.amber, PALETTE.cyan, PALETTE.violet, PALETTE.green, PALETTE.rose, 0xdfe6f3];
  for (let i = 0; i < NH; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = Math.floor(i / 2);
    const th = Math.pow(rand(), 0.7) * 0.42;
    const ph = rand() * Math.PI * 2;
    // Inside-out: slow hadrons near the middle form first, fast ones near the leading quark last.
    const frac = (k + 0.5) / (NH / 2);
    hadrons.push({ side, tau: 0.3 + (LEAD_T - 0.35) * frac, x0: 0, dx: side * Math.cos(th), dy: Math.sin(th) * Math.cos(ph), dz: Math.sin(th) * Math.sin(ph), v: 0.5 + 1.2 * frac });
    hadCols.push(new THREE.Color(hadPalette[Math.floor(rand() * hadPalette.length)]));
  }
  const hadMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222 }), NH);
  hadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < NH; i++) hadMesh.setColorAt(i, hadCols[i]);
  jetsView.add(hadMesh);
  const jetQ = makeQuark(RED);
  const jetQb = makeQuark(ANTIRED);
  jetQ.mesh.scale.setScalar(0.2);
  jetQb.mesh.scale.setScalar(0.2);
  jetQ.halo.scale.setScalar(0.9);
  jetQb.halo.scale.setScalar(0.9);
  jetsView.add(jetQ.group, jetQb.group);
  const jetTube = new FluxTube();
  jetsView.add(jetTube.group);
  jetTube.group.scale.set(1, 0.45, 0.45);
  const jetLabR = stage.label('jet of hadrons', [3.6, 2.0, 0], 'big', jetsView);
  const jetLabL = stage.label('jet of hadrons', [-3.6, 2.0, 0], 'big', jetsView);
  const jetCap = stage.label('', [0, -2.2, 0], 'big', jetsView);
  const hm = new THREE.Matrix4();
  const hq = new THREE.Quaternion();
  const hs = new THREE.Vector3();
  const hp = new THREE.Vector3();

  function drawJets(t: number): void {
    const tt = t % JET_T;
    const lead = Math.min(tt, LEAD_T) * LEAD_V;
    jetQ.group.position.set(-lead, 0, 0);
    jetQb.group.position.set(lead, 0, 0);
    jetQ.group.visible = tt < LEAD_T;
    jetQb.group.visible = tt < LEAD_T;
    let formed = 0;
    for (let i = 0; i < NH; i++) {
      const h = hadrons[i];
      const age = tt - h.tau;
      if (age < 0) {
        hs.setScalar(0.0001);
        hp.set(0, 0, 0);
      } else {
        formed++;
        const x0 = h.side * Math.min(h.tau, LEAD_T) * LEAD_V * (0.2 + 0.8 * ((i >> 1) / (NH / 2)));
        const d = h.v * age;
        hp.set(x0 + h.dx * d, h.dy * d * 1.6, h.dz * d * 1.6);
        const grow = Math.min(1, age / 0.25);
        hs.setScalar(grow);
      }
      hm.compose(hp, hq, hs);
      hadMesh.setMatrixAt(i, hm);
    }
    hadMesh.instanceMatrix.needsUpdate = true;
    // The string drains as hadrons form.
    const left = 1 - formed / NH;
    jetTube.group.visible = left > 0.02 && lead > 0.05;
    if (jetTube.group.visible) {
      jetTube.set(-lead, lead);
      jetTube.mat.uniforms.uGain.value = 1.6 * left;
    }
    jetCap.element.textContent = tt < 0.35 ? 'a quark and antiquark fly apart at high energy' : left > 0.02 ? 'the string breaks again and again' : 'only colour-neutral hadrons reach the detector';
    const show = tt > 1.2;
    jetLabL.visible = show;
    jetLabR.visible = show;
  }

  // =========================================================================
  // Inset canvases
  // =========================================================================
  const MONO = 'JetBrains Mono, ui-monospace, monospace';
  function makeInset(right: string, top: string | null, bottom: string | null, w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
    const c = document.createElement('canvas');
    c.width = w * 2;
    c.height = h * 2;
    Object.assign(c.style, {
      position: 'absolute', right, width: `${w}px`, height: `${h}px`,
      background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    } as CSSStyleDeclaration);
    if (top) c.style.top = top;
    if (bottom) c.style.bottom = bottom;
    viewport.appendChild(c);
    return { c, g: c.getContext('2d')! };
  }
  const vIn = makeInset('10px', null, '10px', 240, 170);
  const aIn = makeInset('10px', '10px', null, 240, 130);

  function drawPotential(): void {
    const { c, g } = vIn;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.font = `22px ${MONO}`;
    g.fillStyle = '#9aa6bd';
    g.fillText('V(r) in GeV, r in fm', 18, 34);
    const x0 = 64;
    const x1 = W - 16;
    const y0 = H - 46;
    const y1 = 50;
    const VLO = -0.6;
    const VHI = 2.2;
    const X = (rr: number) => x0 + (rr / R_MAX) * (x1 - x0);
    const Y = (v: number) => y0 - ((v - VLO) / (VHI - VLO)) * (y0 - y1);
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    for (const v of [0, 1, 2]) {
      g.beginPath();
      g.moveTo(x0, Y(v));
      g.lineTo(x1, Y(v));
      g.stroke();
      g.fillStyle = '#56627c';
      g.fillText(String(v), 30, Y(v) + 8);
    }
    for (const rr of [0, 1, 2]) {
      g.fillStyle = '#56627c';
      g.fillText(`${rr}`, X(rr) - 6, H - 14);
    }
    const curve = (fn: (rr: number) => number, color: string, dash: number[], width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash);
      g.beginPath();
      let started = false;
      for (let i = 0; i <= 160; i++) {
        const rr = 0.03 + (i / 160) * (R_MAX - 0.03);
        const v = fn(rr);
        if (v < VLO || v > VHI) {
          started = false;
          continue;
        }
        if (!started) g.moveTo(X(rr), Y(v));
        else g.lineTo(X(rr), Y(v));
        started = true;
      }
      g.stroke();
      g.setLineDash([]);
    };
    if (emCompare) curve((rr) => -(4 / 3) * alphaC * HBARC / rr, css(PALETTE.violet), [8, 6], 3);
    curve((rr) => cornell(rr, alphaC, sigma), css(TUBE_COL), [], 4);
    // Threshold
    g.strokeStyle = css(PALETTE.red);
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(x0, Y(E_TH));
    g.lineTo(x1, Y(E_TH));
    g.stroke();
    const rB = rb();
    if (rB < R_MAX) {
      g.beginPath();
      g.moveTo(X(rB), Y(E_TH));
      g.lineTo(X(rB), y0);
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = css(PALETTE.red);
    g.fillText('string breaks', x0 + 6, Y(E_TH) - 10);
    if (emCompare) {
      g.fillStyle = css(PALETTE.violet);
      g.fillText('Coulomb only', X(1.25), Y(-0.28));
    }
    // Current point
    const v = V();
    g.fillStyle = broken ? '#56627c' : '#ffffff';
    g.beginPath();
    g.arc(X(r), Y(Math.max(VLO, Math.min(VHI, v))), 8, 0, Math.PI * 2);
    g.fill();
  }

  function drawAlpha(): void {
    const { c, g } = aIn;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.font = `22px ${MONO}`;
    g.fillStyle = '#9aa6bd';
    g.fillText('αs(Q), one loop, 5 flavours', 18, 34);
    const x0 = 70;
    const x1 = W - 16;
    const y0 = H - 44;
    const y1 = 52;
    const AHI = 0.4;
    const X = (lq: number) => x0 + (lq / 3) * (x1 - x0);
    const Y = (a: number) => y0 - (a / AHI) * (y0 - y1);
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    for (const a of [0.1, 0.2, 0.3]) {
      g.beginPath();
      g.moveTo(x0, Y(a));
      g.lineTo(x1, Y(a));
      g.stroke();
      g.fillStyle = '#56627c';
      g.fillText(a.toFixed(1), 18, Y(a) + 8);
    }
    for (const [lq, s] of [[0, '1'], [1, '10'], [2, '100'], [3, '1000']] as [number, string][]) g.fillText(s, X(lq) - (lq === 3 ? 50 : 6), H - 12);
    g.fillText('GeV', X(1.5) - 10, H - 12);
    g.strokeStyle = css(PALETTE.green);
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const lq = (i / 120) * 3;
      const a = alphaS(Math.pow(10, lq));
      const y = Y(Math.min(AHI, a));
      if (i === 0) g.moveTo(X(lq), y);
      else g.lineTo(X(lq), y);
    }
    g.stroke();
    // Anchor at M_Z
    const lz = Math.log10(MZ);
    g.fillStyle = css(PALETTE.amber);
    g.beginPath();
    g.arc(X(lz), Y(ALPHA_S_MZ), 6, 0, Math.PI * 2);
    g.fill();
    g.fillText('MZ: 0.118', X(lz) - 150, Y(ALPHA_S_MZ) + 34);
    // Current probe
    const a = alphaS(Q());
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(X(logQ), Y(Math.min(AHI, a)), 8, 0, Math.PI * 2);
    g.fill();
    g.fillText(a.toFixed(3), Math.min(X(logQ) + 12, W - 80), Math.max(Y(a) - 12, y1 - 4));
  }

  // --- Legend overlay (top left), hidden on phones
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '200px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '10.5px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    legend.style.display = view === 'levels' ? 'none' : '';
    const dot = (c: number) => `<span style="color:${css(c)}">●</span>`;
    if (view === 'tube') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the scene</div>
<div>${dot(RED)} quark, red colour charge</div>
<div>${dot(ANTIRED)} antiquark, anti-red</div>
<div><span style="color:${css(TUBE_COL)}">━━</span> gluon flux tube</div>
${emCompare ? `<div><span style="color:${css(PALETTE.violet)}">━━</span> electric field lines</div>` : ''}
<div style="margin-top:3px;color:#8391ab">Energy grows with length. Past ${E_TH} GeV the tube snaps.</div>`;
    } else if (view === 'levels') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Charmonium</div>
<div><span style="color:${css(TUBE_COL)}">━━</span> 2m<sub>c</sub> + V(r)</div>
<div><span style="color:${css(PALETTE.cyan)}">━━</span> 1S, <span style="color:${css(PALETTE.green)}">━━</span> 2S, <span style="color:${css(PALETTE.violet)}">━━</span> 3S</div>
<div>wiggles: radial wave u(r)</div>
<div style="margin-top:3px;color:#8391ab">Model levels vs measured masses.</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Hadronization (sketch)</div>
<div>${dot(RED)}${dot(ANTIRED)} leading quark pair</div>
<div><span style="color:${css(TUBE_COL)}">━━</span> string, draining</div>
<div>● hadrons (mesons, baryons)</div>`;
    }
  }

  // =========================================================================
  // Frame loop
  // =========================================================================
  let time = 0;
  stage.onFrame((dt) => {
    time += dt;
    if (view === 'tube') {
      for (const tb of [mainTube, tubeL, tubeR]) tb.mat.uniforms.uTime.value = time;
      if (pulling) {
        const target = Math.min(R_MAX, rb() + 0.12);
        const next = Math.min(target, r + dt * 0.45);
        rCtl.set(next);
        if (next >= target) pulling = false;
      }
      if (broken && breakU < 1) {
        breakU = Math.min(1, breakU + dt / 0.45);
        placeMesons();
      }
      if (flashT < 0.7) {
        flashT += dt;
        const u = Math.min(1, flashT / 0.7);
        flash.scale.setScalar(0.3 + 3.2 * u);
        (flash.material as THREE.SpriteMaterial).opacity = (1 - u) ** 2;
      }
      // Stored energy makes the quarks strain: a small shimmer on the halos.
      const strain = broken ? 0 : Math.max(0, V() / E_TH);
      const k = 1 + 0.08 * strain * Math.sin(time * 18);
      qA.halo.scale.setScalar(FLAVOURS[quark].size * 4.2 * k);
      qB.halo.scale.setScalar(FLAVOURS[quark].size * 4.2 * k);
    } else if (view === 'jets') {
      jetTube.mat.uniforms.uTime.value = time;
      drawJets(time);
    }
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'tube', label: 'Flux tube' }, { value: 'levels', label: 'Charmonium levels' }, { value: 'jets', label: 'Jets' }],
    onChange: (v) => setView(v),
  });
  ui.select<Quark>({
    key: 'quark', label: 'Quark type', value: quark,
    options: [{ value: 'light', label: 'Light (u ū)' }, { value: 'charm', label: 'Charm (c c̄)' }],
    onChange: (v) => { quark = v; layoutTube(); updateReadouts(); },
  });

  ui.section('Pull the quarks apart');
  const rCtl = ui.slider({
    key: 'r', label: 'Separation r', min: R_MIN, max: R_MAX, step: 0.01, value: r, unit: 'fm', format: (v) => v.toFixed(2),
    onInput: (v) => { r = v; touched = true; if (view !== 'tube') setView('tube', true); checkBreak(); layoutTube(); updateReadouts(); },
  });
  ui.slider({
    key: 'sigma', label: 'String tension σ', min: 0.5, max: 1.5, step: 0.01, value: sigma, unit: 'GeV/fm', format: (v) => v.toFixed(2),
    onInput: (v) => { sigma = v; checkBreak(); layoutTube(); if (view === 'levels') rebuildLevels(); updateReadouts(); },
  });
  ui.toggle({ key: 'em', label: 'Compare with electric dipole', value: emCompare, onChange: (v) => { emCompare = v; if (view !== 'tube') setView('tube', true); layoutTube(); paintLegend(); updateReadouts(); } });
  ui.buttons([
    { label: 'Pull until it snaps', primary: true, key: 'r', onClick: () => { if (view !== 'tube') setView('tube', true); if (broken) { broken = false; rCtl.set(R0); } pulling = true; } },
    { label: 'Reset', onClick: () => { pulling = false; broken = false; rCtl.set(R0); touched = false; layoutTube(); updateReadouts(); } },
  ]);

  ui.section('Running coupling');
  ui.slider({
    key: 'Q', label: 'Probe energy Q', min: 0, max: 3, step: 0.01, value: logQ,
    format: (v) => { const q = Math.pow(10, v); return q < 10 ? q.toFixed(2) : q.toFixed(0); }, unit: 'GeV',
    onInput: (v) => { logQ = v; if (view === 'levels') setView('tube', true); drawAlpha(); updateReadouts(); },
  });

  ui.section('Readouts');
  const rR = ui.readout('r', 'separation r', 'fm');
  const rV = ui.readout('V', 'stored energy V(r)', 'GeV');
  const rRb = ui.readout('rb', 'breaks at r_b', 'fm');
  const rF = ui.readout('sigma', 'pull σ', '');
  const rA = ui.readout('alphaS', 'α_s(Q)');
  const rSt = ui.readout('status', 'state');
  const rSplit = ui.readout('split', '2S − 1S (model / data)');
  ui.note(`Breaking threshold E<sub>th</sub> = ${E_TH} GeV. The Coulomb term uses the fitted α<sub>s</sub> = ${alphaC}. Scene scale: the tube is drawn 0.4 fm wide.`);

  function updateReadouts(): void {
    rR(r.toFixed(2));
    rV(V().toFixed(3));
    const rB = rb();
    rRb(rB.toFixed(2));
    rF(`${sigma.toFixed(2)} GeV/fm ≈ ${tensionTonnes(sigma).toFixed(1)} t`);
    rA(alphaS(Q()).toFixed(3));
    const f = FLAVOURS[quark];
    rSt(broken ? `2 mesons: ${f.left.split(' ')[0]} + ${f.right.split(' ')[0]}` : `string intact (${f.q} ${f.qb})`);
    if (Number.isFinite(levMass[0]) && levMass[0] > 0) {
      const m = levMass[1] - levMass[0];
      const d = M_PSI2S - M_JPSI;
      rSplit(`${m.toFixed(3)} / ${d.toFixed(3)} GeV (${(((m - d) / d) * 100).toFixed(1)}%)`);
    }
  }

  function setView(v: View, fromControl = false): void {
    view = v;
    tubeView.visible = v === 'tube';
    levelsView.visible = v === 'levels';
    jetsView.visible = v === 'jets';
    if (v === 'levels') rebuildLevels();
    if (v !== 'tube') pulling = false;
    vIn.c.style.display = v === 'tube' ? '' : 'none';
    aIn.c.style.display = v === 'levels' || (v === 'tube' && emCompare) ? 'none' : '';
    paintLegend();
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.1);
    if (fromControl) viewCtl.set(v, false);
    updateReadouts();
  }
  // Charmonium levels are cheap enough to compute once up front for the readout.
  rebuildLevels();
  layoutTube();
  drawAlpha();
  paintLegend();
  updateReadouts();

  return {
    state: () => ({
      r, sigma, V: V(), rb: rb(), broken, breaks, touched, emCompare, quark, view,
      Q: Q(), alphaS: alphaS(Q()), tonnes: tensionTonnes(sigma),
      split: levMass[1] - levMass[0],
    }),
    dispose: () => {
      vIn.c.remove();
      aIn.c.remove();
      legend.remove();
      glowTex.dispose();
      cylGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quark-confinement',
  number: 67,
  title: 'Quarks & Colour Confinement',
  domain: 'particle',
  level: 3,
  status: 'live',
  tagline: 'Pull two quarks apart and you get new quarks, never a lone one.',
  content,
  mount,
};

export default topic;
