import * as THREE from 'three';
import { createStage, makeArrow, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  addPhi,
  BEAMS,
  cellVelocity,
  clearAcc,
  createFireball,
  KSS,
  lorentzGamma,
  mevToKelvin,
  mulberry32,
  muBFreeze,
  newAcc,
  nuclearRadius,
  overlap,
  sampleHadron,
  sampleOverlap,
  sqrtSNN,
  stepFireball,
  T_FO,
  TAU0,
  TC,
  tcOfMu,
  tempAt,
  tFreeze,
  v2Err,
  v2Of,
  jetStep,
  type Beam,
  type Fireball,
  type Jet,
  type Overlap,
} from './physics.ts';

type View = 'auto' | 'beam' | 'phase';
type Phase = 'approach' | 'hydro' | 'stream';

const S = 0.2; // world units per fm
const NCELL = 3000;
const K_EMIT = 10; // pions sampled per cell at freeze-out
const SIM_RATE = 3; // fm/c per real second
const H = 0.02; // hydro step, fm/c
const APPROACH = 1.7; // s
const Z0 = 6; // world units, start of approach
const MIN_THICK = 0.03; // world units, thinnest pancake drawn
const ETA_MAX = 0.6; // spacetime-rapidity half-width drawn
const SPARK_N = 240;
const PX = 16; // phase-diagram plane position
const NB = 36; // histogram bins

const SIDE_CAM: [[number, number, number], [number, number, number]] = [[11.5, 3.0, 1.2], [0, -0.3, 0]];
const CAMS: Record<View, [[number, number, number], [number, number, number]]> = {
  auto: [[3.6, 2.7, 8.4], [0.3, -0.35, 0]],
  beam: [[0, 0.02, 11.5], [0, 0, 0]],
  phase: [[PX, 0, 8.6], [PX, 0, 0]],
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Temperature ramp for plasma cells: red at T_c through amber to white-hot. */
const RAMP: [number, number][] = [[TC, PALETTE.red], [0.2, PALETTE.amber], [0.26, 0xfff1c8], [0.33, 0xe4f1ff]];
function rampLUT(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const a = new THREE.Color(), b = new THREE.Color(), c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const T = RAMP[0][0] + ((RAMP[RAMP.length - 1][0] - RAMP[0][0]) * k) / (n - 1);
    let s = 0;
    while (s < RAMP.length - 2 && T > RAMP[s + 1][0]) s++;
    const f = Math.min(1, Math.max(0, (T - RAMP[s][0]) / (RAMP[s + 1][0] - RAMP[s][0])));
    c.lerpColors(a.setHex(RAMP[s][1]), b.setHex(RAMP[s + 1][1]), f);
    out[k * 3] = c.r;
    out[k * 3 + 1] = c.g;
    out[k * 3 + 2] = c.b;
  }
  return out;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: SIDE_CAM[0], target: SIDE_CAM[1], fov: 42, far: 200 });
  const { scene } = stage;
  const glow = glowTexture();

  // --- Parameters
  let beam: Beam = 'rhic';
  let b = 7;
  let etaS = 0.12;
  let showJets = true;
  let view: View = 'auto';
  let playing = true;
  let touched = false;
  let seed = 11;

  // --- Scene furniture: beam axis, transverse rings, reaction-plane arrow
  const beamLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -12), new THREE.Vector3(0, 0, 12)]),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.9 }),
  );
  scene.add(beamLine);
  stage.label('beam axis', [0, 0, 7.5], 'muted');
  const ringMat = new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.9 });
  for (const rf of [5, 10, 15]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 96; k++) pts.push(new THREE.Vector3(rf * S * Math.cos((k / 96) * 2 * Math.PI), rf * S * Math.sin((k / 96) * 2 * Math.PI), 0));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  stage.label('10 fm', [0, -10 * S - 0.12, 0], 'muted');
  const rpArrow = makeArrow(new THREE.Vector3(1, 0, 0), 3.4, PALETTE.amber);
  (rpArrow.line.material as THREE.LineBasicMaterial).transparent = true;
  (rpArrow.line.material as THREE.LineBasicMaterial).opacity = 0.6;
  scene.add(rpArrow);
  stage.label('reaction plane (Ψ_R = 0)', [3.35, 0.28, 0], 'muted');

  // Almond outline in the transverse plane
  const ALM = 128;
  const almPos = new Float32Array(ALM * 3);
  const almGeo = new THREE.BufferGeometry();
  almGeo.setAttribute('position', new THREE.BufferAttribute(almPos, 3));
  const almond = new THREE.LineLoop(almGeo, new THREE.LineBasicMaterial({ color: 0xdfe6f3, transparent: true, opacity: 0.55 }));
  scene.add(almond);
  const bLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: PALETTE.violet }));
  scene.add(bLine);
  const bLabel = stage.label('b', [0, 0.25, 0]);
  bLabel.element.style.color = css(PALETTE.violet);

  // --- Nuclei: nucleon points inside a glowing disc
  const AMAX = 208;
  const nucleusUnit = new Float32Array(AMAX * 3);
  {
    const r = mulberry32(4242);
    for (let i = 0; i < AMAX; i++) {
      let x, y, z;
      do {
        x = 2 * r() - 1;
        y = 2 * r() - 1;
        z = 2 * r() - 1;
      } while (x * x + y * y + z * z > 1);
      nucleusUnit.set([x, y, z], i * 3);
    }
  }
  interface Nucleus { group: THREE.Group; pts: THREE.Points; pos: Float32Array; col: Float32Array; disc: THREE.Mesh; part: Uint8Array; label: ReturnType<typeof stage.label>; base: THREE.Color; dir: number }
  const discGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1);
  discGeo.rotateX(Math.PI / 2);
  function makeNucleus(color: number, dir: number): Nucleus {
    const group = new THREE.Group();
    scene.add(group);
    const pos = new Float32Array(AMAX * 3);
    const col = new Float32Array(AMAX * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    group.add(pts);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    group.add(disc);
    const label = stage.label('', [0, 0, 0], '', group);
    label.element.style.color = css(color);
    return { group, pts, pos, col, disc, part: new Uint8Array(AMAX), label, base: new THREE.Color(color), dir };
  }
  const nucA = makeNucleus(PALETTE.amber, 1); // comes from -z, centre at x = -b/2
  const nucB = makeNucleus(PALETTE.rose, -1); // comes from +z, centre at x = +b/2

  // --- Fireball cells (plasma) and emitted hadrons
  function makeCloud(size: number): { pts: THREE.Points; pos: Float32Array; col: Float32Array } {
    const pos = new Float32Array(NCELL * 3);
    const col = new Float32Array(NCELL * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, pos, col };
  }
  const plasma = makeCloud(0.26);
  const hadrons = makeCloud(0.11);
  const lut = rampLUT(64);
  const cViolet = new THREE.Color(PALETTE.violet);
  const cCyan = new THREE.Color(PALETTE.cyan);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.01);
  scene.add(flash);

  // --- Jets
  interface JetVis { line: THREE.Line; pos: Float32Array; head: THREE.Sprite; label: ReturnType<typeof stage.label>; j: Jet; xs: number; ys: number }
  function makeJet(): JetVis {
    const pos = new Float32Array(6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true }));
    line.frustumCulled = false;
    scene.add(line);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: PALETTE.green, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    scene.add(head);
    const label = stage.label('', [0, 0.22, 0], 'muted', head);
    label.element.style.color = css(PALETTE.green);
    return { line, pos, head, label, j: { x: 0, y: 0, dx: 1, dy: 0, E: 0, E0: 0, L: 0 }, xs: 0, ys: 0 };
  }
  const jets = [makeJet(), makeJet()];

  // --- Phase diagram on a plane to the side
  const pcan = document.createElement('canvas');
  pcan.width = 1024;
  pcan.height = 720;
  const pctx = pcan.getContext('2d')!;
  const ptex = new THREE.CanvasTexture(pcan);
  ptex.colorSpace = THREE.SRGBColorSpace;
  ptex.anisotropy = 4;
  const phasePlane = new THREE.Mesh(new THREE.PlaneGeometry(10.24 * 0.78, 7.2 * 0.78), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }));
  phasePlane.position.set(PX, 0, 0);
  scene.add(phasePlane);

  // --- Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:2px">Plasma coloured by temperature</div>
<div style="height:6px;border-radius:3px;margin:4px 0 2px;background:linear-gradient(90deg,${css(PALETTE.red)},${css(PALETTE.amber)},#fff1c8,#e4f1ff)"></div>
<div style="display:flex;justify-content:space-between"><span>155 MeV</span><span>330 MeV</span></div>
<div style="margin-top:4px"><span style="color:${css(PALETTE.violet)}">●</span> hadron gas, below T<sub>c</sub></div>
<div><span style="color:${css(PALETTE.cyan)}">●</span> free hadrons (pions)</div>
<div><span style="color:${css(PALETTE.amber)}">●</span><span style="color:${css(PALETTE.rose)}">●</span> incoming nuclei</div>
<div><span style="color:${css(PALETTE.green)}">━</span> jets losing energy</div>
<div class="qgp-status" style="margin-top:5px;color:#dfe6f3"></div>`;
  viewport.appendChild(legend);
  const statusEl = legend.querySelector('.qgp-status') as HTMLElement;

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // --- Simulation state
  const rng = mulberry32(1);
  const x0 = new Float64Array(NCELL), y0 = new Float64Array(NCELL), w = new Float64Array(NCELL);
  const w4 = new Float64Array(NCELL), etaCell = new Float64Array(NCELL);
  const frozen = new Uint8Array(NCELL);
  const hv = new Float32Array(NCELL * 3);
  const hshade = new Float32Array(NCELL);
  const acc = newAcc(NB);
  const tmp = newAcc(NB);
  const vtmp = new Float64Array(2);
  const ptmp = new Float64Array(4);
  const sparkT = new Float64Array(SPARK_N);
  const sparkV = new Float64Array(SPARK_N);
  let sparkN = 0;
  let nCell = 0;
  let left = 0;
  let geo: Overlap = overlap(b, nuclearRadius(197));
  let fb: Fireball = createFireball({ beam, b, etaS }, geo);
  let phase: Phase = 'approach';
  let tA = 0; // time in approach, s
  let tPost = 0; // real seconds since collision
  let hAcc = 0;
  let done = false;
  let v2Now = 0;
  let sparkTimer = 0;
  let phaseTimer = 0;
  let trailT: number[] = [];

  function buildGeometry(): void {
    const spec = BEAMS[beam];
    const R = nuclearRadius(spec.A);
    geo = overlap(b, R);
    // Almond outline: right arc of nucleus A, then left arc of nucleus B.
    const half = ALM / 2;
    const al = Math.acos(Math.min(1, b / (2 * R)));
    for (let k = 0; k < half; k++) {
      const a = -al + (2 * al * k) / (half - 1);
      almPos[k * 3] = (-b / 2 + R * Math.cos(a)) * S;
      almPos[k * 3 + 1] = R * Math.sin(a) * S;
      almPos[k * 3 + 2] = 0;
      const a2 = al - (2 * al * k) / (half - 1);
      almPos[(half + k) * 3] = (b / 2 - R * Math.cos(a2)) * S;
      almPos[(half + k) * 3 + 1] = R * Math.sin(a2) * S;
      almPos[(half + k) * 3 + 2] = 0;
    }
    almGeo.attributes.position.needsUpdate = true;
    almGeo.computeBoundingSphere();
    const bp = bLine.geometry.attributes.position as THREE.BufferAttribute;
    bp.setXYZ(0, (-b / 2) * S, 0, 0);
    bp.setXYZ(1, (b / 2) * S, 0, 0);
    bp.needsUpdate = true;
    bLabel.position.set(0, -R * S - 0.3, 0);
    bLabel.element.textContent = `b = ${b.toFixed(1)} fm`;
    // Nucleons, with participants flagged by the hard-sphere overlap.
    const gam = lorentzGamma(spec.eN);
    const thick = Math.max((2 * R * S) / gam, MIN_THICK);
    const exag = thick / ((2 * R * S) / gam);
    for (const nu of [nucA, nucB]) {
      const cx = nu === nucA ? -b / 2 : b / 2;
      const ox = nu === nucA ? b / 2 : -b / 2; // other centre
      for (let i = 0; i < AMAX; i++) {
        const inN = i < spec.A;
        const ux = nucleusUnit[i * 3], uy = nucleusUnit[i * 3 + 1], uz = nucleusUnit[i * 3 + 2];
        nu.pos[i * 3] = ux * R * S;
        nu.pos[i * 3 + 1] = uy * R * S;
        nu.pos[i * 3 + 2] = (uz * thick) / 2;
        const gx = cx + ux * R, gy = uy * R;
        nu.part[i] = (gx - ox) ** 2 + gy * gy < R * R ? 1 : 0;
        const k = inN ? 1 : 0;
        nu.col[i * 3] = nu.base.r * k;
        nu.col[i * 3 + 1] = nu.base.g * k;
        nu.col[i * 3 + 2] = nu.base.b * k;
      }
      nu.group.position.x = cx * S;
      nu.disc.scale.set(R * S, R * S, thick);
      nu.pts.geometry.attributes.position.needsUpdate = true;
      nu.pts.geometry.attributes.color.needsUpdate = true;
      nu.label.position.set(0, R * S + 0.3, 0);
      nu.label.element.textContent = `${spec.nucleus}, γ ≈ ${gam < 1000 ? gam.toFixed(0) : (Math.round(gam / 10) * 10).toFixed(0)}${exag > 1.5 ? ` (drawn ${exag.toFixed(0)}× thicker)` : ''}`;
    }
  }

  function reset(): void {
    seed++;
    buildGeometry();
    fb = createFireball({ beam, b, etaS }, geo);
    const r = mulberry32(seed * 7919);
    nCell = sampleOverlap(b, fb.R, r, NCELL, x0, y0, w);
    for (let i = 0; i < nCell; i++) {
      w4[i] = Math.pow(w[i] / geo.wbar, 0.25);
      etaCell[i] = (2 * r() - 1) * ETA_MAX;
      frozen[i] = 0;
    }
    plasma.col.fill(0);
    hadrons.col.fill(0);
    plasma.pts.geometry.attributes.color.needsUpdate = true;
    hadrons.pts.geometry.attributes.color.needsUpdate = true;
    left = nCell;
    clearAcc(acc);
    phase = 'approach';
    tA = 0;
    tPost = 0;
    hAcc = 0;
    done = false;
    v2Now = 0;
    sparkN = 0;
    trailT = [];
    for (const nu of [nucA, nucB]) {
      nu.group.visible = true;
      nu.group.position.z = -nu.dir * Z0;
      (nu.pts.material as THREE.PointsMaterial).opacity = 1;
      (nu.disc.material as THREE.MeshBasicMaterial).opacity = 0.22;
      nu.label.visible = true;
    }
    almond.visible = true;
    for (const jv of jets) {
      jv.line.visible = false;
      jv.head.visible = false;
      jv.label.visible = false;
      jv.j.E = jv.j.E0 = 0;
    }
    flash.scale.setScalar(0.01);
    if (view === 'auto') stage.flyTo(SIDE_CAM[0], SIDE_CAM[1], 0.8);
    drawInset();
    drawPhase();
    updateReadouts();
  }

  function collide(): void {
    phase = 'hydro';
    if (view === 'auto') stage.flyTo(CAMS.auto[0], CAMS.auto[1], 2.2);
    tPost = 0;
    for (const nu of [nucA, nucB]) {
      for (let i = 0; i < AMAX; i++) {
        if (nu.part[i]) nu.col[i * 3] = nu.col[i * 3 + 1] = nu.col[i * 3 + 2] = 0;
      }
      nu.pts.geometry.attributes.color.needsUpdate = true;
      nu.label.visible = false;
    }
    // Jets: a back-to-back pair from a random point inside the almond.
    if (showJets && nCell > 0) {
      const k = Math.floor(rng() * nCell);
      const ph = 2 * Math.PI * rng();
      jets.forEach((jv, i) => {
        const s = i === 0 ? 1 : -1;
        jv.xs = x0[k];
        jv.ys = y0[k];
        jv.j = { x: x0[k], y: y0[k], dx: s * Math.cos(ph), dy: s * Math.sin(ph), E: 60, E0: 60, L: 0 };
        jv.line.visible = jv.head.visible = jv.label.visible = true;
      });
    }
  }

  function freezeCell(i: number): void {
    frozen[i] = 1;
    left--;
    cellVelocity(fb, x0[i], y0[i], vtmp);
    for (let k = 0; k < K_EMIT; k++) {
      sampleHadron(vtmp[0], vtmp[1], T_FO, rng, ptmp);
      addPhi(acc, Math.atan2(ptmp[1], ptmp[0]));
      if (k === 0) {
        // Display velocity: boost the first pion along the beam by the cell's rapidity.
        const ch = Math.cosh(etaCell[i]), sh = Math.sinh(etaCell[i]);
        const E = ptmp[3] * ch + ptmp[2] * sh;
        hv[i * 3] = ptmp[0] / E;
        hv[i * 3 + 1] = ptmp[1] / E;
        hv[i * 3 + 2] = (ptmp[3] * sh + ptmp[2] * ch) / E;
      }
    }
    hadrons.pos[i * 3] = plasma.pos[i * 3];
    hadrons.pos[i * 3 + 1] = plasma.pos[i * 3 + 1];
    hadrons.pos[i * 3 + 2] = plasma.pos[i * 3 + 2];
    hshade[i] = 0.75 + 0.25 * rng();
    plasma.col[i * 3] = plasma.col[i * 3 + 1] = plasma.col[i * 3 + 2] = 0;
  }

  /** v2 if every remaining cell froze out right now, plus the ones already emitted. */
  function instantV2(): number {
    clearAcc(tmp);
    for (let i = 0; i < nCell; i++) {
      if (frozen[i]) continue;
      cellVelocity(fb, x0[i], y0[i], vtmp);
      for (let k = 0; k < 3; k++) {
        sampleHadron(vtmp[0], vtmp[1], T_FO, rng, ptmp);
        addPhi(tmp, Math.atan2(ptmp[1], ptmp[0]));
      }
    }
    const wt = K_EMIT / 3;
    const n = acc.n + tmp.n * wt;
    return n > 0 ? (acc.c2 + tmp.c2 * wt) / n : 0;
  }

  function updateCells(): void {
    const sx = (fb.Rx / fb.Rx0) * S, sy = (fb.Ry / fb.Ry0) * S;
    for (let i = 0; i < nCell; i++) {
      if (frozen[i]) continue;
      const T = fb.T * w4[i];
      if (T < T_FO) {
        freezeCell(i);
        continue;
      }
      plasma.pos[i * 3] = x0[i] * sx;
      plasma.pos[i * 3 + 1] = y0[i] * sy;
      plasma.pos[i * 3 + 2] = fb.tau * Math.sinh(etaCell[i]) * S;
      if (T < TC) {
        const f = 0.25 + 0.3 * ((T - T_FO) / (TC - T_FO));
        plasma.col[i * 3] = cViolet.r * f;
        plasma.col[i * 3 + 1] = cViolet.g * f;
        plasma.col[i * 3 + 2] = cViolet.b * f;
      } else {
        const u = Math.min(63, Math.max(0, Math.round(((T - TC) / (0.33 - TC)) * 63)));
        const br = 0.3;
        plasma.col[i * 3] = lut[u * 3] * br;
        plasma.col[i * 3 + 1] = lut[u * 3 + 1] * br;
        plasma.col[i * 3 + 2] = lut[u * 3 + 2] * br;
      }
    }
    plasma.pts.geometry.attributes.position.needsUpdate = true;
    plasma.pts.geometry.attributes.color.needsUpdate = true;
  }

  function moveHadrons(dt: number): void {
    const d = SIM_RATE * dt * S;
    for (let i = 0; i < nCell; i++) {
      if (!frozen[i]) continue;
      const p = i * 3;
      hadrons.pos[p] += hv[p] * d;
      hadrons.pos[p + 1] += hv[p + 1] * d;
      hadrons.pos[p + 2] += hv[p + 2] * d;
      const r = Math.hypot(hadrons.pos[p], hadrons.pos[p + 1], hadrons.pos[p + 2]);
      const f = hshade[i] * Math.max(0, Math.min(1, 1 - (r - 7) / 5));
      hadrons.col[p] = cCyan.r * f;
      hadrons.col[p + 1] = cCyan.g * f;
      hadrons.col[p + 2] = cCyan.b * f;
    }
    hadrons.pts.geometry.attributes.position.needsUpdate = true;
    hadrons.pts.geometry.attributes.color.needsUpdate = true;
  }

  function updateJets(h: number): void {
    for (const jv of jets) {
      if (!jv.head.visible) continue;
      const j = jv.j;
      if (Math.hypot(j.x, j.y) > 40) continue;
      const T = phase === 'hydro' ? tempAt(fb, j.x, j.y) : 0;
      jetStep(j, h, T);
    }
  }

  function drawJets(): void {
    for (const jv of jets) {
      if (!jv.head.visible) continue;
      const j = jv.j;
      jv.pos[0] = jv.xs * S;
      jv.pos[1] = jv.ys * S;
      jv.pos[3] = j.x * S;
      jv.pos[4] = j.y * S;
      jv.line.geometry.attributes.position.needsUpdate = true;
      const f = j.E0 > 0 ? j.E / j.E0 : 0;
      (jv.line.material as THREE.LineBasicMaterial).opacity = 0.25 + 0.75 * f;
      jv.head.position.set(j.x * S, j.y * S, 0);
      jv.head.scale.setScalar(0.15 + 0.55 * f);
      jv.label.visible = Math.hypot(j.x - jv.xs, j.y - jv.ys) > 4;
      const txt = `${j.E.toFixed(0)} GeV`;
      if (jv.label.element.textContent !== txt) jv.label.element.textContent = txt;
    }
  }

  // --- Inset: polar dN/dphi and v2 vs tau
  function drawInset(): void {
    const W = inset.width, Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('dN/dφ', 14, 30);
    const cx = 128, cy = 168, R0 = 58, gain = 150; // radius at value 1, px per unit
    const rOf = (v: number) => Math.max(4, R0 + (v - 1) * gain);
    // Reference circles at 0.8, 1, 1.2
    ictx.lineWidth = 1.5;
    for (const v of [0.8, 1, 1.2]) {
      ictx.strokeStyle = v === 1 ? '#3a4868' : '#243049';
      ictx.beginPath();
      ictx.arc(cx, cy, rOf(v), 0, 2 * Math.PI);
      ictx.stroke();
    }
    // Reaction-plane axis
    ictx.strokeStyle = 'rgba(245,182,66,0.55)';
    ictx.beginPath();
    ictx.moveTo(cx - 108, cy);
    ictx.lineTo(cx + 108, cy);
    ictx.stroke();
    // Histogram of emitted hadrons as polar bars
    const src = acc.n >= 400 ? acc : null;
    if (src) {
      const mean = src.n / NB;
      ictx.fillStyle = 'rgba(79,209,232,0.28)';
      for (let k = 0; k < NB; k++) {
        const a0 = (k / NB) * 2 * Math.PI, a1 = ((k + 1) / NB) * 2 * Math.PI;
        const r = rOf(src.hist[k] / mean);
        ictx.beginPath();
        ictx.moveTo(cx, cy);
        ictx.arc(cx, cy, r, -a1, -a0);
        ictx.closePath();
        ictx.fill();
      }
    }
    // Curve 1 + 2 v2 cos 2phi
    const v2 = done ? v2Of(acc) : v2Now;
    ictx.strokeStyle = '#4fd1e8';
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * 2 * Math.PI;
      const r = rOf(1 + 2 * v2 * Math.cos(2 * a));
      const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
      if (k === 0) ictx.moveTo(x, y);
      else ictx.lineTo(x, y);
    }
    ictx.stroke();
    ictx.font = '18px JetBrains Mono, monospace';
    ictx.fillStyle = '#56627c';
    ictx.fillText('radial axis 0.8 to 1.2', 14, Hh - 12);
    // v2 vs tau
    const gx = 262, gy0 = 60, gw = W - gx - 16, gh = 180;
    ictx.fillStyle = '#8391ab';
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillText('v₂ vs τ', gx, 30);
    const vmax = 0.12;
    const yOf = (v: number) => gy0 + gh - (Math.max(-0.02, Math.min(vmax, v)) / vmax) * gh;
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.font = '17px JetBrains Mono, monospace';
    for (const v of [0, 0.05, 0.1]) {
      const y = yOf(v);
      ictx.beginPath();
      ictx.moveTo(gx, y);
      ictx.lineTo(gx + gw, y);
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(v.toFixed(2), gx + gw - 44, y - 4);
    }
    if (sparkN > 1) {
      const tmax = Math.max(12, sparkT[sparkN - 1]);
      ictx.strokeStyle = '#4fd1e8';
      ictx.lineWidth = 3;
      ictx.beginPath();
      for (let k = 0; k < sparkN; k++) {
        const x = gx + ((sparkT[k] - TAU0) / (tmax - TAU0)) * gw;
        const y = yOf(sparkV[k]);
        if (k === 0) ictx.moveTo(x, y);
        else ictx.lineTo(x, y);
      }
      ictx.stroke();
    }
    ictx.fillStyle = '#dfe6f3';
    ictx.font = '600 30px JetBrains Mono, monospace';
    ictx.fillText(`v₂ = ${v2.toFixed(3)}`, gx, gy0 + gh + 44);
    ictx.font = '18px JetBrains Mono, monospace';
    ictx.fillStyle = '#56627c';
    ictx.fillText(done ? 'measured' : phase === 'hydro' ? 'if frozen now' : 'waiting', gx, gy0 + gh + 70);
  }

  // --- Phase diagram
  function drawPhase(): void {
    const g = pctx;
    const W = pcan.width, Hh = pcan.height;
    const L = 110, Rr = 990, T = 96, B = 630;
    const MU = 1.5, TM = 0.35; // GeV
    const X = (mu: number) => L + (mu / MU) * (Rr - L);
    const Y = (t: number) => B - (t / TM) * (B - T);
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, W, Hh);
    // Transition line: lattice crossover to mu = 0.45, then a schematic first-order line.
    const cpMu = 0.5, cpT = tcOfMu(0.5);
    const line: [number, number][] = [];
    for (let k = 0; k <= 30; k++) {
      const mu = (cpMu * k) / 30;
      line.push([mu, tcOfMu(mu)]);
    }
    const fo: [number, number][] = [];
    for (let k = 1; k <= 30; k++) {
      const u = k / 30;
      fo.push([cpMu + (1.3 - cpMu) * u, cpT * Math.sqrt(1 - u * u)]);
    }
    // Regions
    const grad = g.createLinearGradient(0, T, 0, B);
    grad.addColorStop(0, 'rgba(245,182,66,0.30)');
    grad.addColorStop(1, 'rgba(255,107,107,0.14)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(X(0), Y(TM));
    for (const [m, t] of line) g.lineTo(X(m), Y(t));
    for (const [m, t] of fo) g.lineTo(X(m), Y(t));
    g.lineTo(X(MU), Y(0));
    g.lineTo(X(MU), Y(TM));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(167,139,250,0.14)';
    g.beginPath();
    g.moveTo(X(0), Y(0));
    for (const [m, t] of line) g.lineTo(X(m), Y(t));
    for (const [m, t] of fo) g.lineTo(X(m), Y(t));
    g.closePath();
    g.fill();
    // Axes
    g.strokeStyle = '#56627c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(L, T);
    g.lineTo(L, B);
    g.lineTo(Rr, B);
    g.stroke();
    g.fillStyle = '#8391ab';
    g.font = '24px JetBrains Mono, monospace';
    for (const t of [0, 0.1, 0.2, 0.3]) {
      g.fillText(`${(t * 1000).toFixed(0)}`, L - 64, Y(t) + 8);
    }
    for (const m of [0, 0.5, 1, 1.5]) g.fillText(`${(m * 1000).toFixed(0)}`, X(m) - 24, B + 34);
    g.fillText('baryon chemical potential μ_B (MeV)', L + 200, B + 74);
    g.save();
    g.translate(34, (T + B) / 2 + 110);
    g.rotate(-Math.PI / 2);
    g.fillText('temperature T (MeV)', 0, 0);
    g.restore();
    // Crossover (solid, from lattice) and conjectured first-order line (dashed)
    g.lineWidth = 4;
    g.strokeStyle = '#f5b642';
    g.setLineDash([]);
    g.beginPath();
    line.forEach(([m, t], i) => (i ? g.lineTo(X(m), Y(t)) : g.moveTo(X(m), Y(t))));
    g.stroke();
    g.strokeStyle = '#8391ab';
    g.setLineDash([14, 10]);
    g.beginPath();
    g.moveTo(X(cpMu), Y(cpT));
    for (const [m, t] of fo) g.lineTo(X(m), Y(t));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#dfe6f3';
    g.beginPath();
    g.arc(X(cpMu), Y(cpT), 9, 0, 2 * Math.PI);
    g.fill();
    g.font = '22px JetBrains Mono, monospace';
    g.fillText('critical point?', X(cpMu) + 16, Y(cpT) - 14);
    g.fillStyle = '#8391ab';
    g.fillText('(conjectured, location unknown)', X(cpMu) + 16, Y(cpT) + 14);
    g.fillStyle = '#f5b642';
    g.fillText('crossover (lattice QCD)', X(0.2), Y(0.19));
    // Region labels
    g.font = '600 34px JetBrains Mono, monospace';
    g.fillStyle = '#ffe2a8';
    g.fillText('quark-gluon plasma', X(0.55), Y(0.25));
    g.fillStyle = '#c9b8ff';
    g.fillText('hadron gas', X(0.17), Y(0.06));
    g.font = '22px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText('colour superconductor?', X(1.08), Y(0.03));
    // Nuclei
    g.fillStyle = '#f472b6';
    g.beginPath();
    g.arc(X(0.92), Y(0), 10, 0, 2 * Math.PI);
    g.fill();
    g.fillText('nuclei', X(0.92) - 34, Y(0) - 18);
    // Chemical freeze-out points for a few collision energies
    g.fillStyle = '#4fd1e8';
    g.font = '19px JetBrains Mono, monospace';
    for (const s of [7.7, 19.6]) {
      const mu = muBFreeze(s);
      g.beginPath();
      g.arc(X(mu), Y(tFreeze(mu)), 6, 0, 2 * Math.PI);
      g.fill();
      g.fillText(`${s} GeV`, X(mu) + 10, Y(tFreeze(mu)) + 26);
    }
    // Early universe
    g.strokeStyle = 'rgba(223,230,243,0.7)';
    g.lineWidth = 2;
    g.setLineDash([6, 8]);
    g.beginPath();
    g.moveTo(X(0) + 3, Y(TM));
    g.lineTo(X(0) + 3, Y(0));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#dfe6f3';
    g.font = '22px JetBrains Mono, monospace';
    g.fillText('early universe, μ_B ≈ 0: it cooled', X(0) + 18, Y(0.33));
    g.fillText('through T_c about 10 μs after the Big Bang', X(0) + 18, Y(0.33) + 28);
    // This collision's path
    const spec = BEAMS[beam];
    const muF = muBFreeze(sqrtSNN(spec.eN));
    const tF = tFreeze(muF);
    const muOf = (t: number) => (muF * t) / tF;
    if (trailT.length > 1) {
      g.strokeStyle = '#ff6b6b';
      g.lineWidth = 6;
      g.beginPath();
      trailT.forEach((t, i) => (i ? g.lineTo(X(muOf(t)), Y(t)) : g.moveTo(X(muOf(t)), Y(t))));
      g.stroke();
    }
    const tNow = phase === 'approach' ? 0 : fb.T;
    if (tNow > 0) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(X(muOf(tNow)), Y(tNow), 11, 0, 2 * Math.PI);
      g.fill();
      g.font = '600 24px JetBrains Mono, monospace';
      g.fillStyle = '#ff9f9f';
      g.fillText(`this collision: T = ${(tNow * 1000).toFixed(0)} MeV`, X(muOf(tNow)) + 22, Y(tNow) + 8);
    }
    g.font = '600 30px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText('The QCD phase diagram', L, 40);
    g.font = '20px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText(`${spec.label}: freeze-out μ_B ≈ ${(muF * 1000).toFixed(muF < 0.01 ? 1 : 0)} MeV. Cyan dots: chemical freeze-out fits.`, L, 74);
    ptex.needsUpdate = true;
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    if (playing) {
      if (phase === 'approach') {
        tA += dt;
        const u = Math.min(1, tA / APPROACH);
        for (const nu of [nucA, nucB]) nu.group.position.z = -nu.dir * Z0 * (1 - u);
        if (u >= 1) collide();
      } else {
        tPost += dt;
        // Spectators fly on and fade.
        for (const nu of [nucA, nucB]) {
          nu.group.position.z = nu.dir * Z0 * (tPost / APPROACH);
          const f = Math.max(0, 1 - tPost / 1.4);
          (nu.pts.material as THREE.PointsMaterial).opacity = f;
          (nu.disc.material as THREE.MeshBasicMaterial).opacity = 0.22 * f;
          if (f === 0) nu.group.visible = false;
        }
        const fl = tPost < 0.5 ? Math.sin((tPost / 0.5) * Math.PI) : 0;
        flash.scale.setScalar(0.01 + 3.2 * fl);
        (flash.material as THREE.SpriteMaterial).opacity = fl;
        // Hydro substeps
        hAcc += dt * SIM_RATE;
        while (hAcc >= H) {
          hAcc -= H;
          if (phase === 'hydro') stepFireball(fb, H);
          updateJets(H);
        }
        if (phase === 'hydro') {
          updateCells();
          if (left === 0 || fb.tau > 40) {
            phase = 'stream';
            done = true;
          }
        }
        moveHadrons(dt);
        drawJets();
        sparkTimer += dt;
        if (sparkTimer > 0.12) {
          sparkTimer = 0;
          if (phase === 'hydro') {
            v2Now = sparkN === 0 ? instantV2() : 0.6 * v2Now + 0.4 * instantV2();
            if (sparkN < SPARK_N) {
              sparkT[sparkN] = fb.tau;
              sparkV[sparkN] = v2Now;
              sparkN++;
            }
            trailT.push(fb.T);
          }
          drawInset();
        }
      }
    }
    phaseTimer += dt;
    if (phaseTimer > 0.2) {
      phaseTimer = 0;
      if (view === 'phase') drawPhase();
    }
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Collision');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Replay', onClick: () => { touched = true; reset(); if (!playing) { playing = true; playBtn.textContent = 'Pause'; } } },
  ]);
  const restart = () => {
    touched = true;
    reset();
  };
  ui.select<Beam>({
    key: 'beam', label: 'Beam energy', value: beam,
    options: [{ value: 'rhic', label: 'RHIC Au+Au 200 GeV' }, { value: 'lhc', label: 'LHC Pb+Pb 5.02 TeV' }],
    onChange: (v) => { beam = v; restart(); },
  });
  ui.slider({ key: 'b', label: 'Impact parameter b', min: 0, max: 13, step: 0.5, value: b, unit: 'fm', format: (v) => v.toFixed(1), onInput: (v) => { b = v; restart(); } });
  ui.slider({
    key: 'etaS', label: 'Viscosity η/s', min: 0.08, max: 0.48, step: 0.01, value: etaS,
    format: (v) => `${v.toFixed(2)} (${(v / KSS).toFixed(1)}× 1/4π)`,
    onInput: (v) => { etaS = v; restart(); },
  });
  ui.toggle({ key: 'jets', label: 'Fire a pair of jets', value: showJets, onChange: (v) => { showJets = v; restart(); } });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'auto', label: 'Follow' }, { value: 'beam', label: 'Along beam' }, { value: 'phase', label: 'Phase diagram' }],
    onChange: (v) => {
      view = v;
      const cam = v === 'auto' && phase === 'approach' ? SIDE_CAM : CAMS[v];
      stage.flyTo(cam[0], cam[1], 1.4);
      legend.style.display = inset.style.display = v === 'phase' ? 'none' : '';
      drawPhase();
    },
  });

  ui.section('Live readouts');
  const rGam = ui.readout('gamma', 'Lorentz γ');
  const rEcc = ui.readout('ecc', 'eccentricity ε₂');
  const rEps = ui.readout('eps', 'Bjorken ε', 'GeV/fm³');
  const rT = ui.readout('T', 'mean T');
  const rTau = ui.readout('tau', 'proper time τ', 'fm/c');
  const rV2 = ui.readout('v2', 'v₂ ± stat');
  const rN = ui.readout('hadrons', 'pions sampled');
  const rJ = ui.readout('jets', 'jet energies');
  ui.legend([
    { color: css(PALETTE.amber), label: 'hot plasma' },
    { color: css(PALETTE.violet), label: 'hadron gas' },
    { color: css(PALETTE.cyan), label: 'free hadrons' },
    { color: css(PALETTE.green), label: 'jets' },
  ]);
  ui.note('The fireball is a toy: hard-sphere almond, self-similar expansion and one freeze-out temperature. v₂ is measured from the sampled pions, not typed in.');

  function updateReadouts(): void {
    const spec = BEAMS[beam];
    const gam = lorentzGamma(spec.eN);
    rGam(gam < 1000 ? gam.toFixed(1) : gam.toFixed(0));
    rEcc(geo.ecc.toFixed(3));
    rEps(fb.eps0.toFixed(1));
    const T = phase === 'approach' ? 0 : fb.T * 1000;
    rT(T > 0 ? `${T.toFixed(0)} MeV (${(mevToKelvin(T) / 1e12).toFixed(1)}e12 K)` : '…');
    rTau(phase === 'approach' ? '…' : fb.tau.toFixed(1));
    const v2 = done ? v2Of(acc) : v2Now;
    rV2(phase === 'approach' ? '…' : `${v2.toFixed(3)} ± ${(done ? v2Err(acc) : 0.004).toFixed(3)}${done ? '' : ' (so far)'}`);
    rN(acc.n);
    rJ(jets[0].head.visible ? `${jets[0].j.E.toFixed(0)} / ${jets[1].j.E.toFixed(0)} GeV` : 'off');
    const st = phase === 'approach'
      ? 'Nuclei approaching'
      : done
        ? `Freeze-out complete. v₂ = ${v2Of(acc).toFixed(3)}`
        : `τ = ${fb.tau.toFixed(1)} fm/c · ${fb.T > TC ? 'plasma' : 'hadronizing'}, T = ${(fb.T * 1000).toFixed(0)} MeV`;
    if (statusEl.textContent !== st) statusEl.textContent = st;
  }

  reset();

  return {
    state: () => ({
      beam, b, etaS, touched, playing, done,
      v2: done ? v2Of(acc) : v2Now,
      v2err: done ? v2Err(acc) : 1,
      ecc: geo.ecc,
      eps: fb.eps0,
      T: phase === 'approach' ? 0 : fb.T * 1000,
      T0: fb.T0 * 1000,
      tau: phase === 'approach' ? 0 : fb.tau,
      hadrons: acc.n,
      jetA: jets[0].j.E,
      jetB: jets[1].j.E,
      phase,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      glow.dispose();
      ptex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quark-gluon-plasma',
  number: 76,
  title: 'Quark–Gluon Plasma',
  domain: 'particle',
  level: 3,
  status: 'live',
  tagline: 'The universe’s first microseconds, recreated as a near-perfect liquid.',
  content,
  mount,
};

export default topic;
