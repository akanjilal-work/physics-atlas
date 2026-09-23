import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  DEFAULT,
  energy,
  growthRates,
  heightFromAttitude,
  initialState,
  Integrator,
  makeBody,
  newState,
  pitchRoll,
  ReversalDetector,
  restFrequencies,
  spin,
  toWorld,
  type Body,
} from './physics.ts';

type View = 'angled' | 'top' | 'side';

const DEG = Math.PI / 180;
const H = 5e-4; // integrator step (s)
const S = 20; // scene units per metre
const B_HALF = 0.02; // half width (m), fixed
const C_DEPTH = 0.02; // depth of the curved bottom (m), fixed
const MU_FRICTION = 3e-5; // viscous couple coefficient when friction is on (N m s)
const WOBBLE = 0.01; // small starting imperfection in pitch and roll rates (rad/s)
const TAP = 1.5; // pitch rate added by one tap (rad/s)
const SPARK_N = 720;
const SPARK_WINDOW = 12; // sim seconds shown in the inset
const TRAIL_DT = 1 / 60;

const UP = new THREE.Vector3(0, 1, 0);

/** Solid arrow from its group origin: cylinder shaft and cone head. */
class FatArrow {
  readonly group = new THREE.Group();
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private headLen: number;
  private dir = new THREE.Vector3();
  readonly mat: THREE.MeshStandardMaterial;

  constructor(color: number, radius: number, headLen: number, headRadius: number, emissive = 0.35) {
    this.headLen = headLen;
    this.mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.45, metalness: 0.1 });
    const sg = new THREE.CylinderGeometry(radius, radius, 1, 12);
    sg.translate(0, 0.5, 0);
    const hg = new THREE.ConeGeometry(headRadius, headLen, 18);
    hg.translate(0, headLen / 2, 0);
    this.shaft = new THREE.Mesh(sg, this.mat);
    this.head = new THREE.Mesh(hg, this.mat);
    this.group.add(this.shaft, this.head);
  }

  set(x: number, y: number, z: number, len: number): void {
    this.dir.set(x, y, z);
    const n = this.dir.length();
    if (n < 1e-12 || len < 1e-3) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.dir.multiplyScalar(1 / n);
    this.group.quaternion.setFromUnitVectors(UP, this.dir);
    const hl = Math.min(this.headLen, len * 0.6);
    this.head.scale.setScalar(hl / this.headLen);
    this.shaft.scale.y = Math.max(1e-3, len - hl);
    this.head.position.y = len - hl;
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/**
 * Rattleback mesh in three.js body axes. Physics body axes (x, y, z) map to three (x, z, -y).
 * The origin is the centre of mass. The curved bottom is half an ellipsoid.
 */
function buildShell(body: Body): THREE.Group {
  const { a, b, c } = body.p;
  const g = new THREE.Group();
  const hc = body.hc * S;
  const shellMat = new THREE.MeshPhysicalMaterial({ color: 0x1b4f8f, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06 });
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
  bottom.scale.set(a * S, c * S, b * S);
  bottom.position.y = hc;
  g.add(bottom);
  const topMat = new THREE.MeshPhysicalMaterial({ color: 0x24609f, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(1, 72), topMat);
  top.rotation.x = -Math.PI / 2;
  top.scale.set(a * S, b * S, 1);
  top.position.y = hc + 1e-3;
  g.add(top);
  // Painted stripe along the length, with a bright tip at the +x end so the heading is readable.
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * a * S * 0.9, b * S * 0.28),
    new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.35, roughness: 0.4 }),
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.y = hc + 3e-3;
  g.add(stripe);
  const tip = new THREE.Mesh(
    new THREE.CircleGeometry(b * S * 0.32, 24),
    new THREE.MeshStandardMaterial({ color: PALETTE.rose, emissive: PALETTE.rose, emissiveIntensity: 0.5 }),
  );
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(a * S * 0.8, hc + 5e-3, 0);
  g.add(tip);
  // Principal inertia axis, turned by the skew delta from the length (curvature) axis.
  const d = body.p.delta;
  const L = a * S * 1.18;
  const ax = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-L * Math.cos(d), hc + 8e-3, L * Math.sin(d)),
    new THREE.Vector3(L * Math.cos(d), hc + 8e-3, -L * Math.sin(d)),
  ]);
  g.add(new THREE.Line(ax, new THREE.LineBasicMaterial({ color: PALETTE.cyan })));
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-L, hc + 8e-3, 0), new THREE.Vector3(L, hc + 8e-3, 0)]);
  g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: PALETTE.text, transparent: true, opacity: 0.45 })));
  return g;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [3.3, 3.1, 5.2], target: [0, 0.1, 0], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let spin0 = -4;
  let deltaDeg = 6;
  let aspect = 5;
  let friction = false;
  let speed = 0.4;
  let playing = true;
  let touched = false;
  let tapped = false;

  const params = () => ({ ...DEFAULT, a: aspect * B_HALF, b: B_HALF, c: C_DEPTH, delta: deltaDeg * DEG, mu: friction ? MU_FRICTION : 0 });
  let body = makeBody(params());
  const integ = new Integrator(body);
  const s = newState();
  const det = new ReversalDetector();

  // --- Table
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(7, 64),
    new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.9, metalness: 0.0 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.002;
  scene.add(table);
  const grid = makeGrid(14, 28);
  grid.position.y = 0.0;
  scene.add(grid);

  // --- The rattleback
  const world = new THREE.Group(); // follows the centre of mass
  scene.add(world);
  const bodyGroup = new THREE.Group();
  world.add(bodyGroup);
  let shell = buildShell(body);
  bodyGroup.add(shell);

  // Contact point marker
  const contactDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  scene.add(contactDot);

  // Spin arrow: vertical, up = counterclockwise seen from above.
  const spinArrow = new FatArrow(PALETTE.green, 0.025, 0.16, 0.065, 0.5);
  scene.add(spinArrow.group);
  const spinLabel = stage.label('spin', [0, 0, 0]);
  spinLabel.element.style.color = css(PALETTE.green);
  const revLabel = stage.label('reversed!', [0, 0, 0], 'big');
  revLabel.element.style.color = css(PALETTE.rose);
  revLabel.visible = false;

  // Trail of the stripe tip: shows the heading turning one way, stopping, and turning back.
  const trail = new Trail(900, PALETTE.rose, 0.9);
  scene.add(trail.line);

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div><span style="color:${css(PALETTE.amber)}">Amber stripe</span>: painted along the length.</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan line</span>: the mass axis, skewed by δ.</div>
<div><span style="color:${css(PALETTE.green)}">Green arrow</span>: spin. Up means counterclockwise from above.</div>
<div><span style="color:${css(PALETTE.rose)}">Pink trail</span>: path of the stripe's tip.</div>
<div style="margin-top:3px;color:#8391ab">Full nonlinear rolling model. Motion is to scale.</div>`;
  viewport.appendChild(legend);

  // --- Inset: spin, pitch and roll against time
  const spark = document.createElement('canvas');
  spark.className = 'rb-spark';
  spark.width = 520;
  spark.height = 280;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '260px', height: '140px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const sparkT = new Float32Array(SPARK_N);
  const sparkW = new Float32Array(SPARK_N);
  const sparkP = new Float32Array(SPARK_N);
  const sparkR = new Float32Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;

  // --- Simulation bookkeeping
  let t = 0;
  let e0 = 1;
  let eRef = 1;
  let trailClock = 0;
  let sparkClock = 0;
  let maxSpinAfterTap = 0;
  let constraintErr = 0;
  let sigP = 0;
  let sigR = 0;
  let lambda = 1;
  const pr = new Float64Array(2);
  const wv = new Float64Array(3);

  function rebuild(): void {
    body = makeBody(params());
    integ.body = body;
    bodyGroup.remove(shell);
    disposeTree(shell);
    shell = buildShell(body);
    bodyGroup.add(shell);
    const f = restFrequencies(body);
    lambda = (f.pitch / f.roll) ** 2;
  }

  function reset(): void {
    initialState(body, spin0, WOBBLE, WOBBLE, s);
    t = 0;
    e0 = energy(body, s);
    eRef = e0 - body.p.m * body.p.g * body.h0;
    det.reset(spin0);
    maxSpinAfterTap = 0;
    tapped = false;
    trailClock = 0;
    sparkClock = 0;
    sparkHead = 0;
    sparkCount = 0;
    constraintErr = 0;
    trail.clear();
    draw();
    drawSpark();
    updateRates();
    updateReadouts();
  }

  function tap(): void {
    // A flick on one end: a sudden pitch rate about the width axis.
    s[1] += TAP;
    e0 = energy(body, s);
    eRef = e0 - body.p.m * body.p.g * body.h0;
    tapped = true;
    maxSpinAfterTap = 0;
    // Restart the reversal clock from the present spin.
    det.reset(Math.abs(det.smooth) > 0.3 ? det.smooth : 0);
    touched = true;
  }

  let spinText = '';
  function draw(): void {
    // Physics (x, y, z) -> three (x, z, -y)
    world.position.set(s[7] * S, s[9] * S, -s[8] * S);
    bodyGroup.quaternion.set(s[4], s[6], -s[5], s[3]);
    const w = spin(s);
    const top = (body.hc + 0.01) * S;
    spinArrow.group.position.set(world.position.x, world.position.y + top + 0.05, world.position.z);
    const len = Math.min(1.6, Math.abs(w) * 0.22);
    spinArrow.set(0, Math.sign(w) || 1, 0, len);
    if (w < 0) spinArrow.group.position.y += len;
    spinLabel.position.set(world.position.x + 0.12, world.position.y + top + 0.05 + len + 0.12, world.position.z);
    const txt = Math.abs(w) < 0.05 ? 'spin ≈ 0' : w > 0 ? 'spin ⟲ (ccw)' : 'spin ⟳ (cw)';
    if (txt !== spinText) { spinLabel.element.textContent = txt; spinText = txt; }
    revLabel.visible = det.reversed && t - det.tReverse < 6;
    revLabel.position.set(world.position.x - 0.9, world.position.y + 0.9, world.position.z);
  }

  /** Tip of the stripe (physics body point (0.8 a, 0, hc)) in scene coordinates. */
  function computeTip(): void {
    toWorld(s, 0.8 * body.p.a, 0, body.hc, wv);
    tipX = (s[7] + wv[0]) * S;
    tipY = (s[9] + wv[2]) * S;
    tipZ = -(s[8] + wv[1]) * S;
  }
  let tipX = 0, tipY = 0, tipZ = 0;

  function updateContactDot(): void {
    // The true contact point: G + R r(up). Computed from the body geometry.
    const qw = s[3], qx = s[4], qy = s[5], qz = s[6];
    const gx = 2 * (qx * qz - qw * qy), gy = 2 * (qy * qz + qw * qx), gz = 1 - 2 * (qx * qx + qy * qy);
    const { a, b, c } = body.p;
    const dx = a * a * gx, dy = b * b * gy, dz = c * c * gz;
    const sq = Math.sqrt(gx * dx + gy * dy + gz * dz);
    toWorld(s, -dx / sq, -dy / sq, body.hc - dz / sq, wv);
    contactDot.position.set((s[7] + wv[0]) * S, 0.012, -(s[8] + wv[1]) * S);
    constraintErr = Math.max(constraintErr, Math.abs(s[9] + wv[2]));
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '21px JetBrains Mono, monospace';
    sctx.fillStyle = css(PALETTE.green);
    sctx.fillText('spin', 16, 30);
    sctx.fillStyle = css(PALETTE.amber);
    sctx.fillText('pitch', 90, 30);
    sctx.fillStyle = css(PALETTE.violet);
    sctx.fillText('roll', 180, 30);
    sctx.fillStyle = '#8391ab';
    sctx.fillText('vs time', 250, 30);
    const x0 = 12;
    const x1 = W - 76;
    // Top panel: spin (rad/s). Bottom panel: pitch and roll (degrees).
    const t1 = 44, b1 = 132, t2 = 170, b2 = Hh - 14;
    let wmax = Math.max(1, Math.abs(spin0));
    let amax = 1;
    for (let i = 0; i < sparkCount; i++) {
      const w = Math.abs(sparkW[i]);
      if (w > wmax) wmax = w;
      const p = Math.max(Math.abs(sparkP[i]), Math.abs(sparkR[i]));
      if (p > amax) amax = p;
    }
    wmax = Math.ceil(wmax);
    amax = Math.ceil(amax);
    const yW = (v: number) => (t1 + b1) / 2 - (v / wmax) * ((b1 - t1) / 2);
    const yA = (v: number) => (t2 + b2) / 2 - (v / amax) * ((b2 - t2) / 2);
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    sctx.font = '18px JetBrains Mono, monospace';
    sctx.fillStyle = '#56627c';
    for (const [y, txt] of [[yW(wmax), `+${wmax}`], [yW(0), '0 r/s'], [yW(-wmax), `−${wmax}`], [yA(amax), `+${amax}°`], [yA(-amax), `−${amax}°`]] as [number, string][]) {
      sctx.beginPath();
      sctx.moveTo(x0, y);
      sctx.lineTo(x1, y);
      sctx.stroke();
      sctx.fillText(txt, x1 + 6, y + 6);
    }
    if (sparkCount < 2) return;
    const tEnd = sparkT[(sparkHead - 1 + SPARK_N) % SPARK_N];
    const tStart = Math.max(0, tEnd - SPARK_WINDOW);
    const series = (arr: Float32Array, color: number, yOf: (v: number) => number, lw: number) => {
      sctx.strokeStyle = css(color);
      sctx.lineWidth = lw;
      sctx.beginPath();
      let started = false;
      for (let i = 0; i < sparkCount; i++) {
        const j = (sparkHead - sparkCount + i + SPARK_N) % SPARK_N;
        if (sparkT[j] < tStart) continue;
        const x = x0 + ((sparkT[j] - tStart) / SPARK_WINDOW) * (x1 - x0);
        const y = yOf(arr[j]);
        if (!started) { sctx.moveTo(x, y); started = true; } else sctx.lineTo(x, y);
      }
      sctx.stroke();
    };
    series(sparkR, PALETTE.violet, yA, 1.5);
    series(sparkP, PALETTE.amber, yA, 1.5);
    series(sparkW, PALETTE.green, yW, 3);
    if (det.reversed && det.tReverse >= tStart) {
      const x = x0 + ((det.tReverse - tStart) / SPARK_WINDOW) * (x1 - x0);
      sctx.strokeStyle = css(PALETTE.rose);
      sctx.setLineDash([6, 6]);
      sctx.beginPath();
      sctx.moveTo(x, t1);
      sctx.lineTo(x, b2);
      sctx.stroke();
      sctx.setLineDash([]);
    }
  }

  // --- Frame loop
  let readoutClock = 0;
  let rateClock = 0;
  const frame = (dt: number) => {
    if (playing && dt > 0) {
      const simDt = dt * speed;
      const steps = Math.max(1, Math.ceil(simDt / H));
      const h = simDt / steps;
      for (let k = 0; k < steps; k++) {
        integ.step(s, h);
        t += h;
        const w = spin(s);
        det.push(w, h, t);
        if (tapped && Math.abs(det.smooth) > maxSpinAfterTap) maxSpinAfterTap = Math.abs(det.smooth);
        sparkClock += h;
        if (sparkClock >= SPARK_WINDOW / SPARK_N) {
          sparkClock -= SPARK_WINDOW / SPARK_N;
          pitchRoll(s, pr);
          sparkT[sparkHead] = t;
          sparkW[sparkHead] = w;
          sparkP[sparkHead] = pr[0] / DEG;
          sparkR[sparkHead] = pr[1] / DEG;
          sparkHead = (sparkHead + 1) % SPARK_N;
          if (sparkCount < SPARK_N) sparkCount++;
        }
        trailClock += h;
        if (trailClock >= TRAIL_DT) {
          trailClock -= TRAIL_DT;
          computeTip();
          trail.push(tipX, tipY + 0.004, tipZ);
        }
      }
      draw();
      updateContactDot();
    }
    readoutClock += dt;
    rateClock += dt;
    if (readoutClock > 0.12) {
      readoutClock = 0;
      drawSpark();
      updateReadouts();
    }
    if (rateClock > 0.3) {
      rateClock = 0;
      updateRates();
    }
  };
  stage.onFrame(frame);

  function updateRates(): void {
    const n = Math.abs(det.smooth) > 0.05 ? det.smooth : spin0 || 1;
    const g = growthRates(body, n);
    sigP = g.pitch;
    sigR = g.roll;
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => { touched = true; reset(); } },
    { label: 'Tap an end', key: 'tap', onClick: () => tap() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 1, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'angled',
    options: [{ value: 'angled', label: 'Angled' }, { value: 'top', label: 'Top' }, { value: 'side', label: 'Side' }],
    onChange: (v) => {
      if (v === 'angled') stage.flyTo([3.3, 3.1, 5.2], [0, 0.1, 0]);
      if (v === 'top') stage.flyTo([0.01, 6.5, 0.5], [0, 0, 0]);
      if (v === 'side') stage.flyTo([0.2, 0.6, 5.6], [0, 0.25, 0]);
    },
  });

  ui.section('Rattleback (resets)');
  ui.slider({
    key: 'spin0', label: 'Initial spin n₀ (+ = counterclockwise)', min: -8, max: 8, step: 0.1, value: spin0, unit: 'rad/s',
    onInput: (v) => { spin0 = v; touched = true; reset(); },
  });
  ui.slider({
    key: 'delta', label: 'Skew angle δ', min: -15, max: 15, step: 0.25, value: deltaDeg, format: (v) => `${v.toFixed(2)}°`,
    onInput: (v) => { deltaDeg = v; touched = true; rebuild(); reset(); },
  });
  ui.slider({
    key: 'shape', label: 'Length / width (a/b)', min: 3, max: 7, step: 0.1, value: aspect, format: (v) => `${v.toFixed(1)}`,
    onInput: (v) => { aspect = v; touched = true; rebuild(); reset(); },
  });
  ui.toggle({ key: 'friction', label: 'Friction (energy loss)', value: friction, onChange: (v) => { friction = v; touched = true; rebuild(); reset(); } });
  ui.note('The body starts with a tiny wobble of 0.01 rad/s in pitch and roll, like any real release. It always rolls without slipping.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t', 's');
  const rSpin = ui.readout('spin', 'spin n (smoothed)', 'rad/s');
  const rPref = ui.readout('preferred', 'preferred direction');
  const rRev = ui.readout('trev', 'spin reversal time');
  const rSP = ui.readout('sigmaP', 'pitch growth σ_P');
  const rSR = ui.readout('sigmaR', 'roll growth σ_R');
  const rLam = ui.readout('lambda', 'λ = (ω_P/ω_R)²');
  const rE = ui.readout('energy', 'energy drift');
  const rC = ui.readout('constraint', 'contact height error');

  const preferredSign = () => Math.sign(deltaDeg);

  function updateReadouts(): void {
    rT(t.toFixed(1));
    rSpin(det.smooth.toFixed(2));
    const ps = preferredSign();
    rPref(ps > 0 ? 'counterclockwise' : ps < 0 ? 'clockwise' : 'none (δ = 0)');
    rRev(det.reversed ? `${det.tReverse.toFixed(2)} s` : det.sign0 === 0 ? 'no spin to reverse' : 'none yet');
    rSP(`${sigP >= 0 ? '+' : ''}${sigP.toFixed(2)} /s`);
    rSR(`${sigR >= 0 ? '+' : ''}${sigR.toFixed(2)} /s`);
    rLam(lambda.toFixed(2));
    const e = energy(body, s) - body.p.m * body.p.g * body.h0;
    if (friction) rE(`${((1 - e / eRef) * 100).toFixed(0)}% lost`);
    else rE((e / eRef - 1).toExponential(0));
    rC(`${(constraintErr * 1e9).toFixed(2)} nm`);
  }

  rebuild();
  reset();

  return {
    state: () => ({
      t,
      touched,
      tapped,
      spin0,
      deltaDeg,
      aspect,
      friction,
      spin: det.smooth,
      reversed: det.reversed,
      tReverse: det.reversed ? det.tReverse : 0,
      preferredSign: preferredSign(),
      maxSpinAfterTap,
      sigmaP: sigP,
      sigmaR: sigR,
      lambda,
      energyDrift: (energy(body, s) - body.p.m * body.p.g * body.h0) / eRef - 1,
      heightErr: Math.abs(s[9] - heightFromAttitude(body, s)),
    }),
    dispose: () => {
      legend.remove();
      spark.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'rattleback',
  number: 37,
  title: 'The Rattleback',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'A spinning stone that stops, shivers and turns back.',
  content,
  mount,
};

export default topic;
