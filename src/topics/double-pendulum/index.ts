import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { energy, positions, rk4, wrap, type DPParams, type DPState } from './physics.ts';

type Mode = 'twin' | 'swarm';
type View = 'both' | 'pendulum' | 'torus';

const DEG = Math.PI / 180;
const H = 1 / 1000; // integrator step (s)
const SWARM = 36;
const TORUS_X = 4.2;
const TR = 1.25; // torus major radius
const Tr = 0.55; // torus minor radius

function torusPoint(t1: number, t2: number, out: THREE.Vector3): THREE.Vector3 {
  const rr = TR + Tr * Math.cos(t2);
  return out.set(rr * Math.cos(t1), Tr * Math.sin(t2), rr * Math.sin(t1));
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [1.6, -0.2, 9.5], target: [1.9, -0.5, 0], fov: 42 });
  const { scene } = stage;

  const p: DPParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 };
  let theta10 = 120;
  let theta20 = 120;
  let deltaExp = -6;
  let mode: Mode = 'twin';
  let speed = 1;
  let playing = true;
  let showTrails = true;

  // --- Scene furniture
  const grid = makeGrid(14, 28);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(1.5, -1, -0.6);
  scene.add(grid);

  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.6, roughness: 0.3 }));
  scene.add(pivot);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.12), new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.4, roughness: 0.6 }));
  beam.position.y = 0.06;
  scene.add(beam);

  // Configuration-space torus, tilted toward the viewer. Everything drawn on it lives in torusGroup.
  const torusGroup = new THREE.Group();
  torusGroup.position.set(TORUS_X, -0.4, 0);
  torusGroup.rotation.x = 0.95;
  scene.add(torusGroup);
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(TR, Tr, 36, 96),
    new THREE.MeshStandardMaterial({ color: 0x223050, transparent: true, opacity: 0.28, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  torus.rotation.x = Math.PI / 2;
  torusGroup.add(torus);
  const torusWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.TorusGeometry(TR, Tr, 12, 36)),
    new THREE.LineBasicMaterial({ color: 0x2f4068, transparent: true, opacity: 0.35 }),
  );
  torusWire.rotation.x = Math.PI / 2;
  torusGroup.add(torusWire);
  stage.label('configuration space: (θ₁, θ₂) lives on a torus', [TORUS_X, -2.0, 0], 'muted');

  // Instanced rods and bobs for up to SWARM pendulums
  const rodGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 10);
  const rodMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
  const rods = new THREE.InstancedMesh(rodGeo, rodMat, SWARM * 2);
  rods.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(rods);
  const bobGeo = new THREE.SphereGeometry(1, 24, 16);
  const bobMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.2, emissive: 0x111111 });
  const bobs = new THREE.InstancedMesh(bobGeo, bobMat, SWARM * 2);
  bobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bobs);

  // Torus markers (current configuration of each pendulum)
  const marks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial(), SWARM);
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  torusGroup.add(marks);

  const trails: Trail[] = [];
  const torusTrails: Trail[] = [];
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  const torusTrailGroup = new THREE.Group();
  torusGroup.add(torusTrailGroup);

  // --- Log-separation sparkline overlay
  const spark = document.createElement('canvas');
  spark.className = 'dp-spark';
  spark.width = 440;
  spark.height = 180;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '220px', height: '90px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const sparkPts: [number, number][] = [];

  // --- Simulation state
  let states: DPState[] = [];
  let colors: THREE.Color[] = [];
  let t = 0;
  let flipped = false;
  let lastLap2 = 0;
  let lyap = NaN;
  let e0 = 0;
  let sep = 0;
  let spread = 0;

  const count = () => (mode === 'twin' ? 2 : SWARM);

  function reset(): void {
    const n = count();
    const d = Math.pow(10, deltaExp);
    states = [];
    colors = [];
    for (let i = 0; i < n; i++) {
      const off = mode === 'twin' ? i * d : (i - (n - 1) / 2) * d;
      states.push([theta10 * DEG, 0, theta20 * DEG + off, 0]);
      colors.push(mode === 'twin' ? new THREE.Color(i === 0 ? PALETTE.amber : PALETTE.cyan) : new THREE.Color().setHSL(0.02 + (0.62 * i) / (n - 1), 0.85, 0.6));
    }
    trails.forEach((tr) => trailGroup.remove(tr.line));
    torusTrails.forEach((tr) => torusTrailGroup.remove(tr.line));
    trails.length = 0;
    torusTrails.length = 0;
    for (let i = 0; i < n; i++) {
      const tr = new Trail(mode === 'twin' ? 900 : 160, colors[i].getHex(), mode === 'twin' ? 0.95 : 0.7);
      trails.push(tr);
      trailGroup.add(tr.line);
      const tt = new Trail(mode === 'twin' ? 2000 : 220, colors[i].getHex(), 0.9);
      torusTrails.push(tt);
      torusTrailGroup.add(tt.line);
    }
    for (let i = 0; i < SWARM * 2; i++) {
      rods.setColorAt(i, new THREE.Color(i < n * 2 ? 0xffffff : 0x000000));
      bobs.setColorAt(i, colors[Math.floor(i / 2)] ?? new THREE.Color(0));
    }
    rods.count = n * 2;
    bobs.count = n * 2;
    marks.count = n;
    for (let i = 0; i < n; i++) marks.setColorAt(i, colors[i]);
    if (rods.instanceColor) rods.instanceColor.needsUpdate = true;
    if (bobs.instanceColor) bobs.instanceColor.needsUpdate = true;
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
    t = 0;
    flipped = false;
    lastLap2 = Math.round(states[0][2] / (2 * Math.PI));
    lyap = NaN;
    e0 = energy(states[0], p);
    sep = mode === 'twin' ? d : 0;
    spread = 0;
    sparkPts.length = 0;
    draw();
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();

  function setRod(i: number, ax: number, ay: number, bx: number, by: number, z: number): void {
    va.set(ax, ay, z);
    vb.set(bx, by, z);
    dir.subVectors(vb, va);
    const len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    sc.set(1, len, 1);
    m4.compose(va.add(vb).multiplyScalar(0.5), q, sc);
    rods.setMatrixAt(i, m4);
  }

  function draw(): void {
    const n = states.length;
    const r1 = 0.09 * Math.cbrt(p.m1);
    const r2 = 0.09 * Math.cbrt(p.m2);
    for (let i = 0; i < n; i++) {
      const [x1, y1, x2, y2] = positions(states[i], p);
      const z = mode === 'twin' ? (i === 0 ? 0.001 : -0.001) : 0;
      setRod(i * 2, 0, 0, x1, y1, z);
      setRod(i * 2 + 1, x1, y1, x2, y2, z);
      m4.compose(tp.set(x1, y1, z), q.identity(), sc.setScalar(r1));
      bobs.setMatrixAt(i * 2, m4);
      m4.compose(tp.set(x2, y2, z), q.identity(), sc.setScalar(r2));
      bobs.setMatrixAt(i * 2 + 1, m4);
      torusPoint(states[i][0], states[i][2], tp);
      m4.compose(tp, q.identity(), sc.setScalar(1));
      marks.setMatrixAt(i, m4);
    }
    rods.instanceMatrix.needsUpdate = true;
    bobs.instanceMatrix.needsUpdate = true;
    marks.instanceMatrix.needsUpdate = true;
  }

  function measure(): void {
    if (mode === 'twin') {
      const a = states[0];
      const b = states[1];
      sep = Math.max(Math.abs(wrap(a[0] - b[0])), Math.abs(wrap(a[2] - b[2])));
      const d0 = Math.pow(10, deltaExp);
      if (t > 1 && sep < 0.05 && sep > d0 * 10) lyap = Math.log(sep / d0) / t;
    } else {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of states) {
        const a = wrap(s[2] - states[0][2]);
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
      }
      spread = hi - lo;
    }
    const lap = Math.round(states[0][2] / (2 * Math.PI));
    if (lap !== lastLap2) flipped = true;
    lastLap2 = lap;
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    if (mode !== 'twin') {
      sctx.fillText('swarm spread (lower arm)', 16, 34);
      sctx.fillStyle = '#dfe6f3';
      sctx.font = '600 44px JetBrains Mono, monospace';
      sctx.fillText(`${(spread / DEG).toFixed(1)}°`, 16, 110);
      return;
    }
    sctx.fillText('log₁₀ separation vs time', 16, 30);
    const yOf = (lg: number) => Hh - 14 - ((lg + 12) / 13) * (Hh - 50);
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    for (const lg of [-12, -8, -4, 0]) {
      const y = yOf(lg);
      sctx.beginPath();
      sctx.moveTo(10, y);
      sctx.lineTo(W - 10, y);
      sctx.stroke();
      sctx.fillStyle = '#56627c';
      sctx.fillText(String(lg), W - 58, y - 4);
    }
    if (sparkPts.length < 2) return;
    const tmax = Math.max(20, sparkPts[sparkPts.length - 1][0]);
    sctx.strokeStyle = '#4fd1e8';
    sctx.lineWidth = 3;
    sctx.beginPath();
    sparkPts.forEach(([tt, lg], i) => {
      const x = 10 + (tt / tmax) * (W - 80);
      const y = yOf(Math.max(-12, Math.min(1, lg)));
      if (i === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    });
    sctx.stroke();
  }

  // --- Frame loop
  let sparkTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      const simDt = dt * speed;
      const steps = Math.max(1, Math.round(simDt / H));
      const h = simDt / steps;
      for (let k = 0; k < steps; k++) {
        for (let i = 0; i < states.length; i++) states[i] = rk4(states[i], p, h);
      }
      t += simDt;
      measure();
      draw();
      if (showTrails) {
        for (let i = 0; i < states.length; i++) {
          const [, , x2, y2] = positions(states[i], p);
          trails[i].push(x2, y2, 0);
          torusPoint(states[i][0], states[i][2], tp);
          torusTrails[i].push(tp.x, tp.y, tp.z);
        }
      }
      sparkTimer += dt;
      if (sparkTimer > 0.1) {
        sparkTimer = 0;
        if (mode === 'twin') sparkPts.push([t, Math.log10(Math.max(1e-15, sep))]);
        if (sparkPts.length > 600) sparkPts.shift();
        drawSpark();
      }
    }
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
    { label: 'Kick', key: 'kick', onClick: () => { states.forEach((s) => (s[3] += 2)); } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 2, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<Mode>({
    key: 'mode', label: 'Experiment', value: mode,
    options: [{ value: 'twin', label: 'Twin (2 pendulums)' }, { value: 'swarm', label: `Swarm (${SWARM})` }],
    onChange: (v) => { mode = v; reset(); },
  });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'both',
    options: [{ value: 'both', label: 'Both' }, { value: 'pendulum', label: 'Pendulum' }, { value: 'torus', label: 'Torus' }],
    onChange: (v) => {
      if (v === 'both') stage.flyTo([1.6, -0.2, 9.5], [1.9, -0.5, 0]);
      if (v === 'pendulum') stage.flyTo([0, -0.6, 6], [0, -0.6, 0]);
      if (v === 'torus') stage.flyTo([TORUS_X, 1.2, 4.6], [TORUS_X, -0.4, 0]);
    },
  });
  ui.toggle({ key: 'trails', label: 'Show trails', value: showTrails, onChange: (v) => { showTrails = v; trailGroup.visible = v; torusTrailGroup.visible = v; if (!v) { trails.forEach((x) => x.clear()); torusTrails.forEach((x) => x.clear()); } } });

  ui.section('Starting conditions (resets)');
  ui.slider({ key: 'theta1', label: 'Upper arm θ₁', min: -180, max: 180, step: 1, value: theta10, unit: '°', onInput: (v) => { theta10 = v; reset(); } });
  ui.slider({ key: 'theta2', label: 'Lower arm θ₂', min: -180, max: 180, step: 1, value: theta20, unit: '°', onInput: (v) => { theta20 = v; reset(); } });
  ui.slider({ key: 'delta', label: 'Nudge δ₀', min: -12, max: -1, step: 1, value: deltaExp, format: (v) => `10^${v} rad`, onInput: (v) => { deltaExp = v; reset(); } });

  ui.section('Physical parameters');
  ui.slider({ key: 'm2', label: 'Lower mass m₂ / m₁', min: 0.1, max: 4, step: 0.05, value: p.m2, onInput: (v) => { p.m2 = v; reset(); } });
  ui.slider({ key: 'l2', label: 'Lower length ℓ₂ / ℓ₁', min: 0.3, max: 1.6, step: 0.05, value: p.l2, onInput: (v) => { p.l2 = v; reset(); } });
  ui.slider({ key: 'g', label: 'Gravity g', min: 1, max: 25, step: 0.1, value: p.g, unit: 'm/s²', onInput: (v) => { p.g = v; reset(); } });
  ui.slider({ key: 'damping', label: 'Friction', min: 0, max: 0.6, step: 0.01, value: p.damping, onInput: (v) => { p.damping = v; } });

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t', 's');
  const rSep = ui.readout('sep', 'separation δ(t)');
  const rLy = ui.readout('lyap', 'Lyapunov λ', '/s');
  const rE = ui.readout('energy', 'energy drift');
  ui.legend([
    { color: css(PALETTE.amber), label: 'pendulum A' },
    { color: css(PALETTE.cyan), label: 'pendulum B (A + δ₀)' },
  ]);

  function updateReadouts(): void {
    rT(t.toFixed(1));
    rSep(mode === 'twin' ? `${sep < 1e-3 ? sep.toExponential(1) : sep.toFixed(3)} rad` : `${(spread / DEG).toFixed(0)}° spread`);
    rLy(Number.isFinite(lyap) ? lyap.toFixed(2) : '…');
    const e = energy(states[0], p);
    rE(p.damping > 0 ? 'friction on' : `${(((e - e0) / Math.max(1, Math.abs(e0))) * 100).toExponential(0)} %`);
  }

  reset();

  return {
    state: () => ({ t, theta10, theta20, deltaExp, mode, sep, spread, flipped, lyap: Number.isFinite(lyap) ? lyap : 0, damping: p.damping }),
    dispose: () => {
      spark.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'double-pendulum',
  number: 1,
  symbol: 'Dp',
  title: 'Chaos & the Double Pendulum',
  domain: 'classical',
  level: 1,
  status: 'live',
  tagline: 'Two linked rods, perfectly deterministic, and still impossible to predict.',
  content,
  mount,
};

export default topic;
