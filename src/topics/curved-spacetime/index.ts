import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  energyOf,
  grApsides,
  initGR,
  initN,
  lCircular,
  lForApsides,
  L_ISCO,
  newGR,
  newN,
  PeriapsisTracker,
  potentialExtrema,
  R_HORIZON,
  R_ISCO,
  R_PHOTON,
  R_PLUNGE,
  stepGR,
  stepN,
  timeDilation,
  vGR,
  vN,
  weakFieldPrecession,
} from './physics.ts';

type Preset = 'gentle' | 'rosette' | 'isco' | 'zoom' | 'plunge';
type Status = 'bound' | 'plunged' | 'escaped';

const S = 0.1; // scene units per M
const R_SURF = 45; // outer edge of the embedding surface, in M
const Z_OUT = 2 * Math.sqrt(2 * (R_SURF - 2));
const DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
/** Integrator steps per radial orbit (sets the step from the orbit size). */
const STEPS_PER_ORBIT = 1600;
/** Local cap: steps per local circular period 2π r^1.5, keeps strong-field passes accurate. */
const STEPS_LOCAL = 1200;
const STEPS_PER_FRAME = 20;
const MAX_STEPS_PER_FRAME = 500;
const R_ESCAPE = 150;
const MAX_MARKS = 32;
/** Push a trail point every this many integrator steps, so the curve stays smooth at low frame rates. */
const TRAIL_EVERY = 5;

/** Height of Flamm's paraboloid, shifted so the outer rim sits at y = 0 and the throat hangs below. */
const surfY = (r: number) => S * (2 * Math.sqrt(2 * Math.max(0, r - 2)) - Z_OUT);

const PRESETS: Record<Preset, { r0: number; L: number; cam: [number, number, number]; target: [number, number, number] }> = {
  gentle: { r0: 40, L: lForApsides(40, 30), cam: [0.3, 5.3, 8.9], target: [0.3, -1.0, -0.4] },
  rosette: { r0: 30, L: lForApsides(30, 10), cam: [0.3, 4.1, 6.7], target: [0.3, -1.0, -0.3] },
  isco: { r0: 6, L: L_ISCO, cam: [0, 2.2, 2.9], target: [0, -1.1, 0] },
  zoom: { r0: 20, L: 3.7, cam: [0, 3.0, 3.9], target: [0, -0.9, 0] },
  plunge: { r0: 25, L: 3.3, cam: [0, 3.4, 4.4], target: [0, -0.9, 0] },
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSurface(): THREE.Group {
  const group = new THREE.Group();
  const NR = 70;
  const NT = 120;
  const radii: number[] = [];
  for (let i = 0; i <= NR; i++) {
    const u = i / NR;
    radii.push(2 + (R_SURF - 2) * u * u);
  }
  const pos = new Float32Array((NR + 1) * (NT + 1) * 3);
  const idx: number[] = [];
  for (let i = 0; i <= NR; i++) {
    for (let j = 0; j <= NT; j++) {
      const a = (j / NT) * TWO_PI;
      const k = (i * (NT + 1) + j) * 3;
      pos[k] = radii[i] * S * Math.cos(a);
      pos[k + 1] = surfY(radii[i]);
      pos[k + 2] = -radii[i] * S * Math.sin(a);
      if (i < NR && j < NT) {
        const p = i * (NT + 1) + j;
        const q = p + NT + 1;
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x1a2744, roughness: 0.85, metalness: 0.1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.renderOrder = 0;
  group.add(mesh);

  // Grid: circles of constant r and radial lines of constant φ, drawn on the surface.
  const seg: number[] = [];
  const circles = [2.5, 3, 4, 5, 6, 8, 10, 12.5, 15, 20, 25, 30, 35, 40, 45];
  const CN = 160;
  for (const r of circles) {
    const y = surfY(r) + 0.002;
    for (let j = 0; j < CN; j++) {
      const a0 = (j / CN) * TWO_PI;
      const a1 = ((j + 1) / CN) * TWO_PI;
      seg.push(r * S * Math.cos(a0), y, -r * S * Math.sin(a0), r * S * Math.cos(a1), y, -r * S * Math.sin(a1));
    }
  }
  const NRAD = 24;
  for (let j = 0; j < NRAD; j++) {
    const a = (j / NRAD) * TWO_PI;
    for (let i = 0; i < NR; i++) {
      const r0 = radii[i];
      const r1 = radii[i + 1];
      seg.push(r0 * S * Math.cos(a), surfY(r0) + 0.002, -r0 * S * Math.sin(a), r1 * S * Math.cos(a), surfY(r1) + 0.002, -r1 * S * Math.sin(a));
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a4d78, transparent: true, opacity: 0.55, depthWrite: false }));
  group.add(lines);
  return group;
}

function dashedRing(r: number, color: number): THREE.Line {
  const pts: THREE.Vector3[] = [];
  const y = surfY(r) + 0.006;
  for (let j = 0; j <= 160; j++) {
    const a = (j / 160) * TWO_PI;
    pts.push(new THREE.Vector3(r * S * Math.cos(a), y, -r * S * Math.sin(a)));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.95 }));
  line.computeLineDistances();
  return line;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  let preset: Preset = 'rosette';
  // False until the reader restarts the orbit, so the pre-rolled demo cannot solve challenges.
  let touched = false;
  const P0 = PRESETS[preset];
  const stage = createStage(viewport, { camera: P0.cam, target: P0.target, fov: 45, near: 0.01, far: 100 });
  const { scene } = stage;

  let r0 = P0.r0;
  let L = P0.L;
  let speed = 1;
  let playing = true;
  let showGhost = true;

  // --- Scene furniture
  const surface = buildSurface();
  scene.add(surface);

  const yH = surfY(R_HORIZON);
  const horizon = new THREE.Mesh(new THREE.CircleGeometry(R_HORIZON * S, 64), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = yH - 0.001;
  scene.add(horizon);
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(R_HORIZON * S, R_HORIZON * S * 0.2, 0.5, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }),
  );
  throat.position.y = yH - 0.25;
  scene.add(throat);
  const horizonRing = dashedRing(R_HORIZON + 0.02, PALETTE.red);
  (horizonRing.material as THREE.LineDashedMaterial).dashSize = 1;
  (horizonRing.material as THREE.LineDashedMaterial).gapSize = 0;
  scene.add(horizonRing);
  scene.add(dashedRing(R_ISCO, PALETTE.cyan));
  scene.add(dashedRing(R_PHOTON, PALETTE.rose));

  stage.label('ISCO 6M', [R_ISCO * S * 0.92, surfY(R_ISCO) + 0.12, -R_ISCO * S * 0.4], 'muted');
  stage.label('photon sphere 3M', [-R_PHOTON * S - 0.55, surfY(R_PHOTON) + 0.05, 0], 'muted');
  stage.label('horizon 2M', [0, yH - 0.62, 0], 'muted');
  const statusLabel = stage.label('', [0, yH + 0.75, 0], 'big');
  statusLabel.visible = false;

  // Particle: solid core plus an additive glow sprite.
  const glowTex = glowTexture();
  const particle = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 1.2 }));
  particle.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(0.32);
  particle.add(glow);
  scene.add(particle);

  const ghost = new THREE.Group();
  ghost.add(new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 12), new THREE.MeshBasicMaterial({ color: PALETTE.violet })));
  const ghostGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.violet, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
  ghostGlow.scale.setScalar(0.2);
  ghost.add(ghostGlow);
  scene.add(ghost);

  const trail = new Trail(6000, PALETTE.amber, 1);
  trail.line.renderOrder = 2;
  scene.add(trail.line);
  const ghostTrail = new Trail(2400, PALETTE.violet, 0.95);
  scene.add(ghostTrail.line);

  // Periapsis markers and spokes from the axis, in a ring buffer.
  const marks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.036, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.green }), MAX_MARKS);
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  marks.count = 0;
  marks.frustumCulled = false;
  scene.add(marks);
  const spokePos = new Float32Array(MAX_MARKS * 6);
  const spokeGeo = new THREE.BufferGeometry();
  spokeGeo.setAttribute('position', new THREE.BufferAttribute(spokePos, 3));
  spokeGeo.setDrawRange(0, 0);
  const spokes = new THREE.LineSegments(spokeGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.8 }));
  spokes.frustumCulled = false;
  scene.add(spokes);

  // --- Effective potential inset
  const PW = 600;
  const PH = 380;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const bgPlot = document.createElement('canvas');
  bgPlot.width = PW;
  bgPlot.height = PH;
  const bctx = bgPlot.getContext('2d')!;
  const PX0 = 62;
  const PX1 = PW - 18;
  const PY0 = 58;
  const PY1 = PH - 44;
  const LR0 = Math.log(2);
  const LR1 = Math.log(50);
  let yLo = -0.1;
  let yHi = 0.05;
  const xOf = (r: number) => PX0 + ((Math.log(r) - LR0) / (LR1 - LR0)) * (PX1 - PX0);
  const yOf = (v: number) => PY1 - ((v - yLo) / (yHi - yLo)) * (PY1 - PY0);

  // --- Simulation state
  const gr = newGR();
  const nw = newN();
  const tracker = new PeriapsisTracker();
  let E = 1;
  let levelGR = 0;
  let levelN = 0;
  let hOrbit = 0.1;
  let hOrbitN = 0.1;
  let status: Status = 'bound';
  let ghostDone = false;
  let rMin = Infinity;
  let rMax = 0;
  let apsides: { rp: number; ra: number } | null = null;
  let predicted = NaN;
  let ecc = 1;
  let markHead = 0;
  let markCount = 0;

  function drawPlotBackground(): void {
    const c = bctx;
    c.clearRect(0, 0, PW, PH);
    const ext = potentialExtrema(L);
    const vMinN = -1 / (2 * L * L);
    const vMinGR = ext ? vGR(ext[1], L) : vMinN;
    const lo = Math.min(vMinN, vMinGR, levelGR, levelN, -0.02);
    yLo = lo * 1.45;
    const span = -yLo;
    const peakV = ext ? vGR(ext[0], L) : -Infinity;
    yHi = Math.max(0.35 * span, Math.min(peakV + 0.25 * span, 2.2 * span), levelGR + 0.2 * span);

    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('Effective potential', 16, 32);
    c.font = '19px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    // axes and ticks
    c.strokeStyle = '#243049';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(PX0, yOf(0));
    c.lineTo(PX1, yOf(0));
    c.stroke();
    for (const r of [3, 6, 10, 20, 40]) {
      const x = xOf(r);
      c.beginPath();
      c.moveTo(x, PY0);
      c.lineTo(x, PY1);
      c.strokeStyle = r === 6 ? 'rgba(79,209,232,0.35)' : r === 3 ? 'rgba(244,114,182,0.35)' : '#1a2336';
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(`${r}`, x - (r >= 10 ? 11 : 6), PH - 16);
    }
    c.fillText('r/M', PX0 - 50, PH - 16);
    c.fillText('0', PX0 - 24, yOf(0) + 6);
    // horizon band
    c.fillStyle = 'rgba(255,107,107,0.12)';
    c.fillRect(PX0, PY0, xOf(2.05) - PX0 + 1, PY1 - PY0);

    c.save();
    c.beginPath();
    c.rect(PX0, PY0 - 4, PX1 - PX0, PY1 - PY0 + 8);
    c.clip();
    const curve = (f: (r: number, L: number) => number, color: string, dash: number[], w: number) => {
      c.beginPath();
      for (let i = 0; i <= 220; i++) {
        const r = Math.exp(LR0 + ((LR1 - LR0) * i) / 220);
        const y = Math.max(-1e4, Math.min(1e4, yOf(f(r, L))));
        if (i === 0) c.moveTo(xOf(r), y);
        else c.lineTo(xOf(r), y);
      }
      c.setLineDash(dash);
      c.strokeStyle = color;
      c.lineWidth = w;
      c.stroke();
      c.setLineDash([]);
    };
    if (showGhost) {
      curve(vN, css(PALETTE.violet), [8, 6], 2.5);
      c.beginPath();
      c.moveTo(PX0, yOf(levelN));
      c.lineTo(PX1, yOf(levelN));
      c.setLineDash([4, 6]);
      c.strokeStyle = 'rgba(167,139,250,0.6)';
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
    }
    curve(vGR, css(PALETTE.cyan), [], 3.5);
    // energy level of the GR particle
    c.beginPath();
    c.moveTo(PX0, yOf(levelGR));
    c.lineTo(PX1, yOf(levelGR));
    c.strokeStyle = css(PALETTE.amber);
    c.lineWidth = 2;
    c.stroke();
    // barrier peak
    if (ext && peakV < yHi) {
      const x = xOf(ext[0]);
      const y = yOf(peakV);
      c.fillStyle = css(PALETTE.rose);
      c.beginPath();
      c.moveTo(x, y - 6);
      c.lineTo(x - 9, y - 20);
      c.lineTo(x + 9, y - 20);
      c.closePath();
      c.fill();
      c.font = '18px JetBrains Mono, monospace';
      c.fillText('barrier', x + 12, y - 8);
    }
    c.restore();
    if (ext && peakV >= yHi) {
      c.fillStyle = css(PALETTE.rose);
      c.font = '18px JetBrains Mono, monospace';
      c.fillText('barrier ↑', xOf(ext[0]) + 8, PY0 + 16);
    }
    if (!ext) {
      c.fillStyle = css(PALETTE.rose);
      c.font = '18px JetBrains Mono, monospace';
      c.fillText('no barrier: L < √12 M', PX0 + 8, PY0 + 16);
    }
    // legend
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = css(PALETTE.cyan);
    c.fillText('GR', PW - 196, 32);
    c.fillStyle = css(PALETTE.violet);
    if (showGhost) c.fillText('Newton', PW - 150, 32);
    c.fillStyle = css(PALETTE.amber);
    c.fillText('E', PW - 60, 32);
  }

  const C_VIOLET = css(PALETTE.violet);
  const C_AMBER = css(PALETTE.amber);

  function drawPlot(): void {
    if (plot.style.display === 'none') return;
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    if (showGhost && !ghostDone) {
      pctx.fillStyle = C_VIOLET;
      pctx.beginPath();
      pctx.arc(xOf(Math.min(50, nw[0])), yOf(levelN), 6, 0, TWO_PI);
      pctx.fill();
    }
    const r = Math.min(50, Math.max(2.05, gr[0]));
    const x = xOf(r);
    const y = yOf(levelGR);
    pctx.strokeStyle = 'rgba(245,182,66,0.45)';
    pctx.lineWidth = 1.5;
    pctx.beginPath();
    pctx.moveTo(x, y);
    pctx.lineTo(x, Math.max(PY0, Math.min(PY1, yOf(vGR(r, L)))));
    pctx.stroke();
    pctx.fillStyle = C_AMBER;
    pctx.beginPath();
    pctx.arc(x, y, 8, 0, TWO_PI);
    pctx.fill();
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const tp = new THREE.Vector3();

  function addMark(r: number, phi: number): void {
    const x = r * S * Math.cos(phi);
    const z = -r * S * Math.sin(phi);
    const y = surfY(r) + 0.02;
    m4.compose(tp.set(x, y, z), q, one);
    marks.setMatrixAt(markHead, m4);
    const k = markHead * 6;
    spokePos[k] = 0;
    spokePos[k + 1] = y;
    spokePos[k + 2] = 0;
    spokePos[k + 3] = x;
    spokePos[k + 4] = y;
    spokePos[k + 5] = z;
    markHead = (markHead + 1) % MAX_MARKS;
    markCount = Math.min(MAX_MARKS, markCount + 1);
    marks.count = markCount;
    marks.instanceMatrix.needsUpdate = true;
    spokeGeo.setDrawRange(0, markCount * 2);
    (spokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function place(): void {
    const r = Math.max(R_HORIZON, gr[0]);
    particle.position.set(r * S * Math.cos(gr[2]), surfY(r) + 0.03, -r * S * Math.sin(gr[2]));
    const rn = nw[0];
    ghost.position.set(rn * S * Math.cos(nw[2]), surfY(Math.max(2, rn)) + 0.025, -rn * S * Math.sin(nw[2]));
  }

  function reset(): void {
    touched = true;
    E = initGR(gr, r0, L);
    initN(nw, r0);
    levelGR = (E * E - 1) / 2;
    levelN = vN(r0, L);
    tracker.reset();
    status = 'bound';
    ghostDone = false;
    rMin = r0;
    rMax = r0;
    apsides = grApsides(r0, L);
    predicted = apsides && apsides.ra > apsides.rp * 1.0001 ? weakFieldPrecession(apsides.rp, apsides.ra) : apsides ? weakFieldPrecession(r0, r0) : NaN;
    ecc = apsides ? (apsides.ra - apsides.rp) / (apsides.ra + apsides.rp) : 1;
    const a = apsides ? (apsides.ra + apsides.rp) / 2 : r0;
    hOrbit = (TWO_PI * a * Math.sqrt(a)) / STEPS_PER_ORBIT;
    // Newtonian semi-major axis from its energy (if bound)
    const aN = levelN < 0 ? -1 / (2 * levelN) : r0;
    hOrbitN = (TWO_PI * Math.min(aN, 60) * Math.sqrt(Math.min(aN, 60))) / STEPS_PER_ORBIT;
    trail.clear();
    ghostTrail.clear();
    markHead = 0;
    markCount = 0;
    marks.count = 0;
    spokeGeo.setDrawRange(0, 0);
    statusLabel.visible = false;
    place();
    drawPlotBackground();
    drawPlot();
    updateReadouts(true);
  }

  let trailTick = 0;
  let ghostTick = 0;

  function advance(dt: number): void {
    advanceSteps(Math.min(MAX_STEPS_PER_FRAME, Math.max(1, Math.round(STEPS_PER_FRAME * speed * dt * 60))));
  }

  function advanceSteps(n: number): void {
    if (status !== 'bound') return;
    const swing = apsides && apsides.ra - apsides.rp > 1e-6 * r0 ? 1 : apsides ? 0 : 1;
    for (let k = 0; k < n; k++) {
      const r = gr[0];
      const h = Math.min(hOrbit, (TWO_PI * r * Math.sqrt(r)) / STEPS_LOCAL);
      stepGR(gr, L, E, h);
      const rr = gr[0];
      if (rr < rMin) rMin = rr;
      if (rr > rMax) rMax = rr;
      if (rr < R_PLUNGE) {
        status = 'plunged';
        break;
      }
      if (rr > R_ESCAPE) {
        status = 'escaped';
        break;
      }
      if (tracker.update(rr, gr[1], gr[2], swing)) addMark(tracker.lastR, tracker.lastPhi);
      if (++trailTick % TRAIL_EVERY === 0) trail.push(rr * S * Math.cos(gr[2]), surfY(rr) + 0.018, -rr * S * Math.sin(gr[2]));
    }
    // Newtonian ghost follows in coordinate time t.
    let guard = 0;
    while (!ghostDone && nw[3] < gr[3] && guard < MAX_STEPS_PER_FRAME) {
      const r = nw[0];
      stepN(nw, L, Math.min(hOrbitN, (TWO_PI * r * Math.sqrt(r)) / STEPS_LOCAL));
      guard++;
      const rn = nw[0];
      if (rn > R_ESCAPE || rn < R_PLUNGE) ghostDone = true;
      else if (++ghostTick % TRAIL_EVERY === 0) ghostTrail.push(rn * S * Math.cos(nw[2]), surfY(rn) + 0.014, -rn * S * Math.sin(nw[2]));
    }
    if (status === 'plunged') {
      statusLabel.element.textContent = 'plunged through the horizon';
      statusLabel.visible = true;
    } else if (status === 'escaped') {
      statusLabel.element.textContent = 'escaped to infinity';
      statusLabel.visible = true;
    }
  }

  // --- Frame loop
  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (playing && status === 'bound') {
      advance(dt);
      place();
      drawPlot();
    }
    readoutTimer += dt;
    if (readoutTimer > 0.1) {
      readoutTimer = 0;
      updateReadouts(false);
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<Preset>({
    key: 'preset', label: 'Orbit preset', value: preset,
    options: [
      { value: 'gentle', label: 'Gentle (weak field)' },
      { value: 'rosette', label: 'Rosette' },
      { value: 'isco', label: 'Circular at ISCO' },
      { value: 'zoom', label: 'Zoom-whirl' },
      { value: 'plunge', label: 'Plunge' },
    ],
    onChange: (v) => {
      preset = v;
      const p = PRESETS[v];
      r0 = p.r0;
      L = p.L;
      r0Ctl.set(r0, false);
      lCtl.set(L, false);
      stage.flyTo(p.cam, p.target);
      reset();
    },
  });

  ui.section('Launch (resets)');
  const r0Ctl = ui.slider({ key: 'r0', label: 'Start radius r₀', min: 6, max: 40, step: 0.1, value: r0, unit: 'M', format: (v) => v.toFixed(1), onInput: (v) => { r0 = v; reset(); } });
  const lCtl = ui.slider({ key: 'L', label: 'Angular momentum L', min: 2.5, max: 9, step: 0.005, value: L, unit: 'M', format: (v) => (Math.abs(v - L) < 0.003 ? L : v).toFixed(3), onInput: (v) => { L = v; reset(); } });
  ui.buttons([{ label: 'Make circular', key: 'L', onClick: () => { L = lCircular(r0); lCtl.set(L, false); reset(); } }]);
  ui.note('Launched sideways at r₀ with no radial speed. L sets how fast it swings around. Circular needs L² = Mr²/(r − 3M).');

  ui.section('Show');
  ui.toggle({ key: 'newton', label: 'Newtonian ghost (same r₀ and L)', value: showGhost, onChange: (v) => { showGhost = v; ghost.visible = v; ghostTrail.line.visible = v; drawPlotBackground(); drawPlot(); } });
  ui.toggle({ key: 'surface', label: 'Embedding surface', value: true, onChange: (v) => { surface.visible = v; } });
  ui.toggle({ key: 'plot', label: 'Potential plot', value: true, onChange: (v) => { plot.style.display = v ? '' : 'none'; if (v) drawPlot(); } });
  ui.legend([
    { color: css(PALETTE.amber), label: 'GR orbit' },
    { color: css(PALETTE.violet), label: 'Newtonian ghost' },
    { color: css(PALETTE.green), label: 'periapsis' },
    { color: css(PALETTE.cyan), label: 'ISCO 6M' },
    { color: css(PALETTE.rose), label: 'photon sphere 3M' },
  ]);

  ui.section('Live readouts');
  const rR = ui.readout('r', 'radius r', 'M');
  const rPrec = ui.readout('prec', 'precession / orbit');
  const rPred = ui.readout('pred', 'weak-field 6πM/a(1−e²)');
  const rOrb = ui.readout('orbits', 'orbits completed');
  const rEcc = ui.readout('ecc', 'eccentricity');
  const rDil = ui.readout('dilation', 'clock rate dτ/dt');
  const rStat = ui.readout('status', 'status');
  const rE = ui.readout('energy', 'energy E drift');

  const orbitsDone = () => Math.floor(Math.abs(gr[2]) / TWO_PI);

  function updateReadouts(force: boolean): void {
    if (!force && !playing) return;
    rR(gr[0].toFixed(2));
    rPrec(Number.isFinite(tracker.precession) ? `${(tracker.precession * DEG).toFixed(1)}°` : '…');
    rPred(Number.isFinite(predicted) && apsides ? `${(predicted * DEG).toFixed(1)}°` : '–');
    rOrb(orbitsDone());
    rEcc(apsides ? ecc.toFixed(3) : '–');
    rDil(status === 'bound' ? timeDilation(gr[0], E).toFixed(4) : '–');
    rStat(status);
    const drift = Math.abs(energyOf(gr, L) - E) / E;
    rE(`${drift < 1e-15 ? '0' : drift.toExponential(0)}`);
  }

  reset();
  // Open mid-flight: pre-roll the default orbit so the rosette is visible at first glance.
  for (let i = 0; i < 30; i++) advanceSteps(200);
  touched = false;
  place();
  drawPlot();
  updateReadouts(true);

  return {
    state: () => ({
      r: gr[0],
      r0,
      L,
      preset,
      status,
      orbits: orbitsDone(),
      periCount: tracker.count,
      precDeg: Number.isFinite(tracker.precession) ? tracker.precession * DEG : 0,
      predDeg: Number.isFinite(predicted) ? predicted * DEG : 0,
      ecc,
      rMin,
      rMax,
      dilation: timeDilation(Math.max(2, gr[0]), E),
      ghost: showGhost,
      touched,
    }),
    dispose: () => {
      plot.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'curved-spacetime',
  number: 8,
  title: 'Curved Spacetime & Orbits',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'Gravity is not a force. It is the shape of spacetime.',
  content,
  mount,
};

export default topic;
