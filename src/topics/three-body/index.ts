import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  angularMomentum,
  buildPreset,
  centerOfMass,
  copySys,
  createSys,
  DEFAULT_STEP,
  ejectedBody,
  energy,
  FIG8_PERIOD,
  minPairDist,
  nudge,
  pairDist,
  PRESET_MASSES,
  separation,
  shapeDistortion,
  sizeScale,
  stepSize,
  yoshidaStep,
  type PresetId,
  type Sys,
} from './physics.ts';

interface PresetView {
  label: string;
  /** One-line caption shown over the scene. */
  caption: string;
  /** World units per simulation length unit. */
  scale: number;
  /** Simulation time units per real second at speed 1. */
  rate: number;
}

const PRESETS: Record<PresetId, PresetView> = {
  figure8: { label: 'Figure-8', scale: 2.6, rate: 1.6, caption: 'Figure-eight: a rare periodic orbit. It is stable, so the ghost stays close.' },
  lagrange: { label: 'Lagrange', scale: 2.4, rate: 2.4, caption: 'Lagrange triangle: an exact rotating solution. With equal masses it is unstable.' },
  hierarchical: { label: 'Sun-Earth-Moon', scale: 2.7, rate: 0.7, caption: 'Hierarchical triple: a tight pair far from the third body. Stable for a long time.' },
  pythagorean: { label: 'Pythagorean', scale: 0.95, rate: 2.2, caption: 'Pythagorean problem: masses 3, 4, 5 start at rest. Chaos, then an ejection.' },
  random: { label: 'Random', scale: 2.2, rate: 1.6, caption: 'Random start: the typical three-body story is chaotic.' },
};

const COLORS = [PALETTE.amber, PALETTE.cyan, PALETTE.rose];
const TRAIL_CAP = 1600;
const GHOST_CAP = 900;
/** World distance a body moves before a new trail point is laid down. */
const TRAIL_DS = 0.03;
/** Integrator steps allowed per run per frame. The sim slows down rather than freezing. */
const MAX_STEPS = 30000;
const SPARK_N = 800;
const LG_LO = -12;
const LG_HI = 2;
/** A figure-eight period counts if every body is back within this distance of its start. */
const FIG8_TOL = 1e-2;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [0, 7.2, 4.6];
  const stage = createStage(viewport, { camera: CAM, target: [0, 0, 0], fov: 45, far: 2000 });
  const { scene, camera, controls } = stage;

  // --- Parameters
  let preset: PresetId = 'figure8';
  let seed = 1;
  let lm2 = 0; // log10(m2 / m1)
  let lm3 = 0;
  let tilt = 0;
  let deltaExp = -6;
  let speed = 1;
  let playing = true;
  let showTrails = true;
  let showGhost = true;
  let touched = false;

  // --- Scene furniture
  const grid = makeGrid(28, 56);
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = -0.02;
  scene.add(grid);

  const glowTex = glowTexture();
  const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
  const holders: THREE.Object3D[] = [];
  const cores: THREE.Mesh[] = [];
  const glows: THREE.Sprite[] = [];
  const ghostHolders: THREE.Object3D[] = [];
  const ghostCores: THREE.Mesh[] = [];
  const labels: HTMLElement[] = [];
  const trails: Trail[] = [];
  const ghostTrails: Trail[] = [];
  const trailGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  scene.add(trailGroup, ghostGroup);

  for (let i = 0; i < 3; i++) {
    const h = new THREE.Object3D();
    const core = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshStandardMaterial({ color: COLORS[i], emissive: COLORS[i], emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 }),
    );
    h.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: COLORS[i], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    h.add(glow);
    scene.add(h);
    const lab = stage.label(String(i + 1), [0, 0.26, 0], 'muted', h);
    labels.push(lab.element);
    holders.push(h);
    cores.push(core);
    glows.push(glow);

    const gh = new THREE.Object3D();
    const gcore = new THREE.Mesh(
      sphereGeo,
      new THREE.MeshBasicMaterial({ color: COLORS[i], transparent: true, opacity: 0.28, depthWrite: false }),
    );
    gh.add(gcore);
    ghostGroup.add(gh);
    ghostHolders.push(gh);
    ghostCores.push(gcore);

    const tr = new Trail(TRAIL_CAP, COLORS[i], 1);
    trails.push(tr);
    trailGroup.add(tr.line);
    const gt = new Trail(GHOST_CAP, COLORS[i], 0.4);
    ghostTrails.push(gt);
    ghostGroup.add(gt.line);
  }

  // Centre-of-mass marker: a small white cross.
  const comGeo = new THREE.BufferGeometry();
  const cm = 0.09;
  comGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-cm, 0, 0, cm, 0, 0, 0, -cm, 0, 0, cm, 0, 0, 0, -cm, 0, 0, cm]), 3));
  const comMark = new THREE.LineSegments(comGeo, new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.7 }));
  scene.add(comMark);
  stage.label('centre of mass', [0, 0, 0.3], 'muted', comMark);

  // --- Ghost separation inset (log scale), like the double-pendulum sparkline
  const spark = document.createElement('canvas');
  spark.width = 460;
  spark.height = 200;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '100px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);

  // Caption for the current preset, top-left of the scene.
  const caption = document.createElement('div');
  Object.assign(caption.style, {
    position: 'absolute', left: '12px', top: '10px', maxWidth: 'calc(100% - 270px)', zIndex: '2', pointerEvents: 'none',
    font: '500 13px/1.4 var(--sans, system-ui)', color: '#b8c3d8', textShadow: '0 1px 3px #070a12',
  } as CSSStyleDeclaration);
  viewport.appendChild(caption);
  const sctx = spark.getContext('2d')!;
  const sparkT = new Float64Array(SPARK_N);
  const sparkLg = new Float64Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;
  let nextSample = 0;

  // --- Simulation state
  const sim = createSys();
  const ghost = createSys();
  const lastPos = new Float64Array(9);
  const lastGhostPos = new Float64Array(9);
  const sides0 = new Float64Array(3);
  const vec = new Float64Array(3);
  const L0 = new Float64Array(3);
  const x0 = new Float64Array(9);
  let S = PRESETS[preset].scale;
  let E0 = 1;
  let Lscale = 1;
  let farR = 1;
  let ejected = -1;
  let periods = 0;
  let broken = false;
  let nextPeriod = FIG8_PERIOD;
  let maxDistortion = 0;
  let kicked = false;
  let sep = 0;
  let rmin = 0;
  let eDrift = 0;
  let lDrift = 0;

  const masses = () => {
    const base = PRESET_MASSES[preset][0];
    return [base, base * 10 ** lm2, base * 10 ** lm3];
  };

  function syncGhost(): void {
    copySys(ghost, sim);
    nudge(ghost, 0, 10 ** deltaExp);
    for (const t of ghostTrails) t.clear();
    for (let k = 0; k < 9; k++) lastGhostPos[k] = ghost.x[k];
    sparkCount = 0;
    sparkHead = 0;
    nextSample = sim.t;
    sep = separation(sim, ghost);
  }

  function refreshConserved(): void {
    E0 = energy(sim);
    angularMomentum(sim, L0);
  }

  function reset(): void {
    touched = true;
    const m = masses();
    buildPreset(sim, preset, m, tilt, seed);
    S = PRESETS[preset].scale;
    caption.textContent = PRESETS[preset].caption;
    refreshConserved();
    const size = sizeScale(sim);
    let M = 0;
    for (let i = 0; i < 3; i++) M += sim.m[i];
    Lscale = M * size * Math.sqrt(M / size);
    farR = 4 * size;
    sides0[0] = pairDist(sim, 0, 1);
    sides0[1] = pairDist(sim, 0, 2);
    sides0[2] = pairDist(sim, 1, 2);
    x0.set(sim.x);
    ejected = -1;
    periods = 0;
    broken = false;
    nextPeriod = FIG8_PERIOD;
    maxDistortion = 0;
    kicked = false;
    for (const t of trails) t.clear();
    for (let k = 0; k < 9; k++) lastPos[k] = sim.x[k];
    // Body sizes scale with the cube root of mass.
    const mmax = Math.max(m[0], m[1], m[2]);
    for (let i = 0; i < 3; i++) {
      const r = Math.max(0.022, 0.14 * Math.cbrt(m[i] / mmax));
      cores[i].scale.setScalar(r);
      ghostCores[i].scale.setScalar(r);
      glows[i].scale.setScalar(Math.max(0.16, 4.2 * r));
      labels[i].textContent = String(i + 1);
    }
    syncGhost();
    measure();
    place();
    drawSpark();
    updateReadouts();
    stage.flyTo(CAM, [0, 0, 0], 0.8);
  }

  // Simulation (x, y, z) maps to world (x, z, -y): the orbital plane lies on the grid.
  function placeBody(o: THREE.Object3D, x: Float64Array, i: number): void {
    o.position.set(S * x[i * 3], S * x[i * 3 + 2], -S * x[i * 3 + 1]);
  }

  function place(): void {
    for (let i = 0; i < 3; i++) {
      placeBody(holders[i], sim.x, i);
      placeBody(ghostHolders[i], ghost.x, i);
    }
    centerOfMass(sim, vec);
    comMark.position.set(S * vec[0], S * vec[2], -S * vec[1]);
  }

  /** Lay down trail points for bodies that have moved far enough. */
  function trailPoints(s: Sys, last: Float64Array, tr: Trail[]): void {
    const d2 = (TRAIL_DS / S) * (TRAIL_DS / S);
    for (let i = 0; i < 3; i++) {
      const k = i * 3;
      const dx = s.x[k] - last[k];
      const dy = s.x[k + 1] - last[k + 1];
      const dz = s.x[k + 2] - last[k + 2];
      if (dx * dx + dy * dy + dz * dz > d2) {
        last[k] = s.x[k];
        last[k + 1] = s.x[k + 1];
        last[k + 2] = s.x[k + 2];
        tr[i].push(S * s.x[k], S * s.x[k + 2], -S * s.x[k + 1]);
      }
    }
  }

  /** Advance s to tEnd with adaptive Yoshida steps, laying trail points as it goes. */
  function run(s: Sys, tEnd: number, last: Float64Array, tr: Trail[], budget: number): number {
    let n = 0;
    while (s.t < tEnd && n < budget) {
      const h = Math.min(stepSize(s, DEFAULT_STEP.eta, DEFAULT_STEP.hmax), tEnd - s.t);
      yoshidaStep(s, h);
      n++;
      if (showTrails) trailPoints(s, last, tr);
    }
    if (tEnd - s.t < 1e-12) s.t = tEnd;
    return n;
  }

  function checkPeriod(): void {
    let worst = 0;
    for (let k = 0; k < 9; k += 3) {
      const d = Math.hypot(sim.x[k] - x0[k], sim.x[k + 1] - x0[k + 1], sim.x[k + 2] - x0[k + 2]);
      if (d > worst) worst = d;
    }
    if (!broken && worst < FIG8_TOL) periods++;
    else broken = true;
    nextPeriod += FIG8_PERIOD;
  }

  function sample(): void {
    sparkT[sparkHead] = sim.t;
    sparkLg[sparkHead] = Math.log10(Math.max(1e-15, sep));
    sparkHead = (sparkHead + 1) % SPARK_N;
    if (sparkCount < SPARK_N) sparkCount++;
  }

  function advance(simDt: number): void {
    const tEnd = sim.t + simDt;
    const every = PRESETS[preset].rate * 0.08;
    let budget = MAX_STEPS;
    while (sim.t < tEnd && budget > 0) {
      let target = Math.min(tEnd, nextSample);
      const fig8 = preset === 'figure8';
      if (fig8 && nextPeriod < target) target = nextPeriod;
      budget -= run(sim, target, lastPos, trails, budget);
      if (showGhost) budget -= run(ghost, sim.t, lastGhostPos, ghostTrails, Math.max(1, budget));
      if (sim.t < target) break; // out of budget this frame
      if (fig8 && sim.t >= nextPeriod) checkPeriod();
      if (sim.t >= nextSample) {
        if (showGhost) {
          sep = separation(sim, ghost);
          sample();
        }
        nextSample = sim.t + every;
      }
    }
  }

  function measure(): void {
    rmin = minPairDist(sim);
    const d = shapeDistortion(sim, sides0);
    if (d > maxDistortion) maxDistortion = d;
    if (showGhost) sep = separation(sim, ghost);
    if (ejected < 0) {
      ejected = ejectedBody(sim, farR);
      if (ejected >= 0) {
        labels[ejected].textContent = `${ejected + 1} ejected`;
        caption.textContent = `Body ${ejected + 1} was ejected. The other two leave as a binary. The camera now follows the pair.`;
      }
    }
    eDrift = Math.abs((energy(sim) - E0) / E0);
    angularMomentum(sim, vec);
    lDrift = Math.hypot(vec[0] - L0[0], vec[1] - L0[1], vec[2] - L0[2]) / Math.max(Math.hypot(L0[0], L0[1], L0[2]), Lscale);
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText('log10 |real - ghost|  vs  t', 16, 32);
    if (!showGhost) {
      sctx.fillStyle = '#56627c';
      sctx.fillText('ghost off', 16, 110);
      return;
    }
    const x0p = 14;
    const x1p = W - 64;
    const yOf = (lg: number) => Hh - 16 - ((lg - LG_LO) / (LG_HI - LG_LO)) * (Hh - 60);
    sctx.lineWidth = 1;
    for (const lg of [-12, -8, -4, 0]) {
      const y = yOf(lg);
      sctx.strokeStyle = lg === 0 ? '#3a4a6a' : '#243049';
      sctx.beginPath();
      sctx.moveTo(x0p, y);
      sctx.lineTo(x1p, y);
      sctx.stroke();
      sctx.fillStyle = '#56627c';
      sctx.fillText(String(lg), x1p + 8, y + 7);
    }
    if (sparkCount < 2) return;
    const first = (sparkHead - sparkCount + SPARK_N) % SPARK_N;
    const last = (sparkHead - 1 + SPARK_N) % SPARK_N;
    const tA = sparkT[first];
    const span = Math.max(20, sparkT[last] - tA);
    sctx.strokeStyle = css(PALETTE.violet);
    sctx.lineWidth = 3;
    sctx.beginPath();
    for (let n = 0; n < sparkCount; n++) {
      const k = (first + n) % SPARK_N;
      const x = x0p + ((sparkT[k] - tA) / span) * (x1p - x0p);
      const y = yOf(Math.max(LG_LO, Math.min(LG_HI, sparkLg[k])));
      if (n === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    }
    sctx.stroke();
  }

  // --- Frame loop
  const camOff = new THREE.Vector3();
  const follow = new THREE.Vector3();
  let uiTimer = 0;
  let sparkDrawn = -1;
  stage.onFrame((dt) => {
    if (playing) {
      advance(dt * speed * PRESETS[preset].rate);
      measure();
      place();
    }
    // Camera follows the centre of mass. After an ejection it follows the surviving pair instead.
    if (ejected >= 0) {
      const a = (ejected + 1) % 3;
      const b = (ejected + 2) % 3;
      const ma = sim.m[a];
      const mb = sim.m[b];
      const w = ma + mb > 0 ? 1 / (ma + mb) : 0;
      follow.copy(holders[a].position).multiplyScalar(ma * w).addScaledVector(holders[b].position, mb * w);
    } else {
      follow.copy(comMark.position);
    }
    const k = Math.min(1, dt * 3);
    camOff.copy(follow).sub(controls.target).multiplyScalar(k);
    controls.target.add(camOff);
    camera.position.add(camOff);
    // Zoom out (never in) so the bound bodies stay in view when orbits grow wide.
    let extent = 0;
    for (let i = 0; i < 3; i++) if (i !== ejected) extent = Math.max(extent, holders[i].position.distanceTo(follow));
    camOff.subVectors(camera.position, controls.target);
    const dist = camOff.length();
    const need = Math.min(80, extent * 2.6);
    if (need > dist) camera.position.copy(controls.target).addScaledVector(camOff, (dist + (need - dist) * Math.min(1, dt * 1.5)) / dist);
    // Grid follows the camera target and doubles in size when the view zooms far out.
    const gs = 2 ** Math.max(0, Math.ceil(Math.log2(camera.position.distanceTo(controls.target) / 10)));
    grid.scale.setScalar(gs);
    grid.position.x = gs * Math.round(controls.target.x / gs);
    grid.position.z = gs * Math.round(controls.target.z / gs);
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      updateReadouts();
      if (sparkDrawn !== sparkHead + sparkCount * SPARK_N) {
        sparkDrawn = sparkHead + sparkCount * SPARK_N;
        drawSpark();
      }
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
    {
      label: 'Nudge', key: 'kick', onClick: () => {
        const d = 10 ** deltaExp;
        nudge(sim, 0, d);
        nudge(ghost, 0, d);
        refreshConserved();
        kicked = true;
        touched = true;
      },
    },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  const massSliders: { set(v: number, emit?: boolean): void }[] = [];
  ui.select<PresetId>({
    key: 'preset', label: 'Starting setup', value: preset,
    options: (Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label })),
    onChange: (v) => {
      if (v === 'random' && preset === 'random') seed++;
      preset = v;
      const pm = PRESET_MASSES[v];
      lm2 = Math.log10(pm[1] / pm[0]);
      lm3 = Math.log10(pm[2] / pm[0]);
      massSliders[0].set(lm2, false);
      massSliders[1].set(lm3, false);
      reset();
    },
  });
  ui.note('Nudge moves body 1 by δ in both runs. Click Random again for a new draw.');

  ui.section('Bodies (resets)');
  const fmtMass = (v: number) => {
    const m = 10 ** v;
    return m >= 0.01 ? m.toFixed(m < 1 ? 3 : 2) : m.toExponential(1);
  };
  massSliders.push(ui.slider({ key: 'm2', label: 'Mass m₂ / m₁', min: -4, max: 1, step: 0.01, value: lm2, format: fmtMass, onInput: (v) => { lm2 = v; reset(); } }));
  massSliders.push(ui.slider({ key: 'm3', label: 'Mass m₃ / m₁', min: -4, max: 1, step: 0.01, value: lm3, format: fmtMass, onInput: (v) => { lm3 = v; reset(); } }));
  ui.slider({ key: 'tilt', label: 'Tilt (out-of-plane speed)', min: 0, max: 0.5, step: 0.01, value: tilt, onInput: (v) => { tilt = v; reset(); } });

  ui.section('Ghost twin');
  ui.toggle({
    key: 'ghost', label: 'Show ghost run', value: showGhost,
    onChange: (v) => { showGhost = v; ghostGroup.visible = v; touched = true; if (v) syncGhost(); drawSpark(); },
  });
  ui.slider({ key: 'delta', label: 'Ghost nudge δ', min: -12, max: -2, step: 1, value: deltaExp, format: (v) => `10^${v}`, onInput: (v) => { deltaExp = v; touched = true; syncGhost(); drawSpark(); } });
  ui.toggle({
    key: 'trails', label: 'Show trails', value: showTrails,
    onChange: (v) => {
      showTrails = v;
      trailGroup.visible = v;
      for (const t of ghostTrails) { t.line.visible = v; t.clear(); }
      for (const t of trails) t.clear();
      for (let k = 0; k < 9; k++) { lastPos[k] = sim.x[k]; lastGhostPos[k] = ghost.x[k]; }
    },
  });
  ui.note('The ghost restarts from the current state, δ away, when you change δ or switch it on.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rE = ui.readout('energy', 'energy drift');
  const rL = ui.readout('angmom', 'ang. mom. drift');
  const rSep = ui.readout('sep', 'ghost separation');
  const rMin = ui.readout('rmin', 'closest pair');
  const rStat = ui.readout('status', 'status');
  const rPer = ui.readout('periods', 'periods (fig-8)');
  ui.legend([
    { color: css(PALETTE.amber), label: 'body 1' },
    { color: css(PALETTE.cyan), label: 'body 2' },
    { color: css(PALETTE.rose), label: 'body 3' },
    { color: 'rgba(167,139,250,0.9)', label: 'ghost gap (inset)' },
  ]);

  const sci = (v: number) => (v < 1e-15 ? '< 1e-15' : v.toExponential(1));
  const status = () => (ejected >= 0 ? `body ${ejected + 1} ejected` : 'bound');

  function updateReadouts(): void {
    rT(sim.t.toFixed(2));
    rE(sci(eDrift));
    rL(sci(lDrift));
    rSep(showGhost ? (sep < 1e-3 ? sep.toExponential(1) : sep.toFixed(3)) : 'off');
    rMin(rmin < 1e-2 ? rmin.toExponential(1) : rmin.toFixed(3));
    rStat(status());
    rPer(preset !== 'figure8' ? '–' : broken ? `${periods}, then broke` : String(periods));
  }

  reset();
  // Open mid-flight: one full loop so the figure-eight track is already drawn.
  advance(FIG8_PERIOD);
  measure();
  place();
  drawSpark();
  updateReadouts();
  touched = false;

  return {
    state: () => ({
      t: sim.t,
      preset,
      touched,
      periods,
      broken,
      eDrift,
      lDrift,
      sep: showGhost ? sep : 0,
      ghost: showGhost,
      deltaExp,
      distortion: maxDistortion,
      kicked,
      ejected: ejected + 1,
      status: status(),
      rmin,
      tilt,
      m2: 10 ** lm2,
      m3: 10 ** lm3,
      speed,
    }),
    dispose: () => {
      spark.remove();
      caption.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'three-body',
  number: 3,
  title: 'The Three-Body Problem',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'Two bodies orbit forever. Add a third and all bets are off.',
  content,
  mount,
};

export default topic;
