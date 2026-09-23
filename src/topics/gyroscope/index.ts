import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  angMomWorld,
  axleWorld,
  energy,
  fastPrecession,
  initialState,
  Integrator,
  Lz,
  L3 as axialMomentum,
  newState,
  precessionRate,
  sleepingThreshold,
  steadyPrecession,
  tilt,
  wheelParams,
  WHEEL_RG,
  type TopParams,
  type Vec3,
} from './physics.ts';

type Preset = 'steady' | 'cusp' | 'wave' | 'loop';
type View = 'angled' | 'side' | 'top';

const DEG = Math.PI / 180;
const H = 1e-4; // integrator step (s)
const S = 25; // scene units per metre
const RV = 0.04 * S; // drawn wheel radius
const PILLAR_R = 0.09;
const FLOOR_Z = -2.6;
const TIP_EXTRA = 0.5; // axle overhang past the wheel
const TRAIL_DT = 1 / 300; // sim seconds between trail samples
const SPARK_N = 400;
const SPARK_WINDOW = 2; // sim seconds shown in the inset
const PRESET_RATIO: Record<Preset, number> = { steady: 1, cusp: 0, wave: 1.6, loop: -0.5 };

const UP = new THREE.Vector3(0, 1, 0);

/** Solid arrow from its group origin: cylinder shaft and cone head. */
class FatArrow {
  readonly group = new THREE.Group();
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private headLen: number;
  private dir = new THREE.Vector3();

  constructor(color: number, radius: number, headLen: number, headRadius: number, emissive = 0.35) {
    this.headLen = headLen;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.45, metalness: 0.1 });
    const sg = new THREE.CylinderGeometry(radius, radius, 1, 12);
    sg.translate(0, 0.5, 0);
    const hg = new THREE.ConeGeometry(headRadius, headLen, 18);
    hg.translate(0, headLen / 2, 0);
    this.shaft = new THREE.Mesh(sg, mat);
    this.head = new THREE.Mesh(hg, mat);
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

/** First tilt (from vertical) at which the wheel rim meets the pillar or the floor. */
function stopAngle(lv: number): number {
  for (let d = 90; d < 150; d += 0.25) {
    const th = d * DEG;
    const pillar = lv * Math.sin(th) + RV * Math.cos(th) < PILLAR_R + 0.08;
    const floor = lv * Math.cos(th) - RV * Math.sin(th) < FLOOR_Z + 0.05;
    if (pillar || floor) return th;
  }
  return 150 * DEG;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [3.9, 2.5, 5.6], target: [0, -0.55, 0], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let spin = 70; // rad/s about the axle
  let noSpin = false;
  let tilt0 = 90; // degrees from vertical
  let phiRatio = PRESET_RATIO.loop;
  let arm = 0.05; // m
  let mass = 0.2; // kg
  let g = 9.81;
  let speed = 0.25;
  let playing = true;
  let touched = false;

  let p: TopParams = wheelParams(mass, arm, g);
  const integ = new Integrator(p);
  const s = newState();

  // Physics is z-up. This group maps it onto the scene's y-up frame.
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  scene.add(world);

  const grid = makeGrid(16, 32);
  grid.position.y = FLOOR_Z;
  scene.add(grid);

  // --- Stand
  const standMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.5, roughness: 0.45 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.16, 48), standMat);
  base.rotation.x = Math.PI / 2;
  base.position.z = FLOOR_Z + 0.08;
  world.add(base);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.3, -FLOOR_Z - 0.12, 20), standMat);
  pillar.rotation.x = Math.PI / 2;
  pillar.position.z = (FLOOR_Z - 0.12) / 2;
  world.add(pillar);
  const pivotBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.7, roughness: 0.25 }));
  world.add(pivotBall);

  // --- The spinning body: axle along local +z, wheel centred at the arm length.
  const body = new THREE.Group();
  world.add(body);
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.65, roughness: 0.3 });
  const axleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 14);
  axleGeo.rotateX(Math.PI / 2);
  axleGeo.translate(0, 0, 0.5);
  const axle = new THREE.Mesh(axleGeo, metal);
  body.add(axle);
  const wheel = new THREE.Group();
  body.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RV, 0.085, 16, 72), new THREE.MeshStandardMaterial({ color: 0x55658a, metalness: 0.6, roughness: 0.35 }));
  wheel.add(rim);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.2, 20);
  hubGeo.rotateX(Math.PI / 2);
  wheel.add(new THREE.Mesh(hubGeo, metal));
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x8a96b0, metalness: 0.5, roughness: 0.4 });
  const markMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.4, roughness: 0.4 });
  for (let k = 0; k < 6; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(RV - 0.12, 0.05, 0.035), k === 0 ? markMat : spokeMat);
    const a = (k / 6) * Math.PI * 2;
    sp.position.set(Math.cos(a) * (RV / 2 + 0.05), Math.sin(a) * (RV / 2 + 0.05), 0);
    sp.rotation.z = a;
    wheel.add(sp);
  }
  // A painted patch on the rim makes the (slowed) spin easy to follow.
  const patch = new THREE.Mesh(new THREE.TorusGeometry(RV, 0.095, 10, 12, 0.45), markMat);
  patch.rotation.z = -0.225;
  wheel.add(patch);
  const tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  body.add(tipBall);

  // --- Arrows (drawn in the physics frame)
  const Larrow = new FatArrow(PALETTE.white, 0.035, 0.24, 0.09, 0.25);
  world.add(Larrow.group);
  const tauArrow = new FatArrow(PALETTE.amber, 0.035, 0.22, 0.09, 0.45);
  world.add(tauArrow.group);
  const dLArrow = new FatArrow(PALETTE.amber, 0.018, 0.14, 0.055, 0.45);
  world.add(dLArrow.group);
  const wArrow = new FatArrow(PALETTE.rose, 0.03, 0.2, 0.08, 0.45);
  world.add(wArrow.group);
  const lLabel = stage.label('L', [0, 0, 0], 'big', world);
  const tauLabel = stage.label('τ = r × mg', [0, 0, 0], '', world);
  tauLabel.element.style.color = css(PALETTE.amber);
  const dLLabel = stage.label('dL/dt', [0, 0, 0], 'muted', world);
  dLLabel.element.style.color = css(PALETTE.amber);
  const wLabel = stage.label('mg', [0, 0, 0], '', world);
  wLabel.element.style.color = css(PALETTE.rose);
  const fellLabel = stage.label('fell onto the stand', [0, 0, 0.9], 'big', world);
  fellLabel.element.style.color = css(PALETTE.red);
  fellLabel.visible = false;

  // Trail of the axle tip: precession plus nutation.
  const trail = new Trail(2400, PALETTE.cyan, 1);
  world.add(trail.line);
  // Point sprites on the same geometry make the 1-px line easier to see.
  const trailDots = new THREE.Points(trail.line.geometry, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 }));
  trailDots.frustumCulled = false;
  world.add(trailDots);

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div><span style="color:${css(PALETTE.white)}">White</span>: angular momentum L, mostly along the axle.</div>
<div><span style="color:${css(PALETTE.rose)}">Pink</span>: the weight mg, pulling down.</div>
<div><span style="color:${css(PALETTE.amber)}">Amber</span>: torque τ. It is sideways, so L's tip moves sideways.</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan</span>: path of the axle tip.</div>
<div style="margin-top:3px;color:#8391ab">Wheel spin is drawn slowed down.</div>`;
  viewport.appendChild(legend);

  // --- Inset: tilt versus time (nutation)
  const spark = document.createElement('canvas');
  spark.className = 'gy-spark';
  spark.width = 460;
  spark.height = 200;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '100px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const sparkT = new Float32Array(SPARK_N);
  const sparkV = new Float32Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;

  // --- Simulation bookkeeping
  let t = 0;
  let e0 = 0;
  let lz0 = 0;
  let l30 = 0;
  let eScale = 1;
  let phiPrev = 0;
  let phiTotal = 0;
  let thMin = Infinity;
  let thMax = -Infinity;
  let rateMin = Infinity;
  let rateMax = -Infinity;
  let fell = false;
  let thStop = stopAngle(arm * S);
  let trailClock = 0;
  let sparkClock = 0;
  let spinVis = 0; // accumulated difference between true and drawn spin angle
  let halved = false;
  let halvedRatio = 0;
  const history: { spin: number; meas: number; tilt: number; arm: number; g: number; ratio: number }[] = [];

  const e3: Vec3 = [0, 0, 0];
  const Lw: Vec3 = [0, 0, 0];
  const qTwist = new THREE.Quaternion();
  const ZAX = new THREE.Vector3(0, 0, 1);

  const spinNow = () => (noSpin ? 0 : spin);
  const lv = () => arm * S;

  function initialPhiDot(): number {
    const w3 = spinNow();
    if (w3 === 0) return 0;
    let unit = steadyPrecession(p, w3, tilt0 * DEG);
    if (!Number.isFinite(unit)) unit = fastPrecession(p, w3);
    return phiRatio * unit;
  }

  function measured(): number {
    return t > 1 ? phiTotal / t : NaN;
  }

  function settled(): boolean {
    return t >= 4 && !fell && spinNow() > 0 && Number.isFinite(measured());
  }

  function recordHistory(): void {
    if (!settled()) return;
    history.push({ spin: spinNow(), meas: measured(), tilt: tilt0, arm, g, ratio: phiRatio });
    if (history.length > 24) history.shift();
  }

  function checkHalved(): void {
    if (halved || !settled()) return;
    const w = spinNow();
    const m = measured();
    for (const h of history) {
      if (h.tilt !== tilt0 || h.arm !== arm || h.g !== g || h.ratio !== phiRatio) continue;
      const sr = w / h.spin;
      const mr = m / h.meas;
      if ((Math.abs(sr - 2) < 0.06 && Math.abs(mr - 0.5) < 0.04) || (Math.abs(sr - 0.5) < 0.015 && Math.abs(mr - 2) < 0.16)) {
        halved = true;
        halvedRatio = sr > 1 ? mr : 1 / mr;
        return;
      }
    }
  }

  function reset(): void {
    recordHistory();
    p = wheelParams(mass, arm, g);
    integ.p = p;
    thStop = stopAngle(lv());
    initialState(tilt0 * DEG, initialPhiDot(), spinNow(), s);
    e0 = energy(p, s);
    lz0 = Lz(p, s);
    l30 = axialMomentum(p, s);
    eScale = Math.max(1e-9, 0.5 * p.I3 * spinNow() * spinNow() + p.m * p.g * p.l);
    axleWorld(s, e3);
    phiPrev = Math.atan2(e3[0], -e3[1]);
    phiTotal = 0;
    t = 0;
    thMin = thMax = tilt(s);
    rateMin = rateMax = precessionRate(s);
    fell = tilt(s) >= thStop;
    trailClock = 0;
    sparkClock = 0;
    sparkHead = 0;
    sparkCount = 0;
    trail.clear();
    axle.scale.z = lv() + TIP_EXTRA;
    wheel.position.z = lv();
    tipBall.position.z = lv() + TIP_EXTRA;
    draw();
    drawSpark();
    updateReadouts();
  }

  /** Called when a user changes a control. */
  function userReset(): void {
    touched = true;
    reset();
  }

  function sampleTrail(): void {
    const r = lv() + TIP_EXTRA;
    trail.push(e3[0] * r, e3[1] * r, e3[2] * r);
  }

  function draw(): void {
    axleWorld(s, e3);
    // Drawn attitude: the true quaternion, with the fast spin about the axle replaced by a slow one.
    body.quaternion.set(s[4], s[5], s[6], s[3]);
    qTwist.setFromAxisAngle(ZAX, -spinVis);
    body.quaternion.multiply(qTwist);

    const lvv = lv();
    // Angular momentum
    angMomWorld(p, s, Lw);
    const Lmag = Math.hypot(Lw[0], Lw[1], Lw[2]);
    const lLen = Math.min(4.2, Lmag * 130);
    Larrow.set(Lw[0], Lw[1], Lw[2], lLen);
    const lk = Lmag > 0 ? (lLen + 0.25) / Lmag : 0;
    lLabel.position.set(Lw[0] * lk, Lw[1] * lk, Lw[2] * lk);
    lLabel.visible = lLen > 0.15;
    // Torque tau = l e3 x (-m g z) = m g l (-e3y, e3x, 0)
    const mgl = p.m * p.g * p.l;
    const tx = -mgl * e3[1];
    const ty = mgl * e3[0];
    const tau = Math.hypot(tx, ty);
    const tLen = Math.min(3.5, tau * 13);
    tauArrow.set(tx, ty, 0, tLen);
    tauLabel.position.set((tx / (tau || 1)) * (tLen + 0.35), (ty / (tau || 1)) * (tLen + 0.35), 0.12);
    tauLabel.visible = tLen > 0.15;
    // dL/dt drawn from the tip of L, same direction as tau
    const Lx = (Lw[0] / (Lmag || 1)) * lLen, Ly = (Lw[1] / (Lmag || 1)) * lLen, Lz0 = (Lw[2] / (Lmag || 1)) * lLen;
    dLArrow.group.position.set(Lx, Ly, Lz0);
    const dLen = Math.min(1.4, tLen * 0.5);
    dLArrow.set(tx, ty, 0, dLen);
    dLArrow.group.visible = dLArrow.group.visible && lLen > 0.3;
    dLLabel.position.set(Lx + (tx / (tau || 1)) * (dLen + 0.3), Ly + (ty / (tau || 1)) * (dLen + 0.3), Lz0 + 0.1);
    dLLabel.visible = lLen > 0.3 && tLen > 0.15;
    // Weight at the centre of mass (the wheel centre)
    const wLen = Math.min(2.2, p.m * p.g * 0.56);
    wArrow.group.position.set(e3[0] * lvv, e3[1] * lvv, e3[2] * lvv);
    wArrow.set(0, 0, -1, wLen);
    wLabel.position.set(e3[0] * lvv + 0.25, e3[1] * lvv, e3[2] * lvv - wLen - 0.2);
    fellLabel.visible = fell;
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText('tilt θ vs time (nutation)', 16, 32);
    const top = 48;
    const bot = Hh - 18;
    if (sparkCount < 2) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < sparkCount; i++) {
      const v = sparkV[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const mid = (lo + hi) / 2;
    const half = Math.max(2, (hi - lo) / 2 + 1);
    lo = mid - half;
    hi = mid + half;
    const yOf = (v: number) => top + ((v - lo) / (hi - lo)) * (bot - top); // larger tilt drawn lower
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 1;
    sctx.font = '19px JetBrains Mono, monospace';
    for (const v of [lo, hi]) {
      sctx.beginPath();
      sctx.moveTo(10, yOf(v));
      sctx.lineTo(W - 70, yOf(v));
      sctx.stroke();
      sctx.fillStyle = '#56627c';
      sctx.fillText(`${v.toFixed(0)}°`, W - 64, yOf(v) + 7);
    }
    const tEnd = sparkT[(sparkHead - 1 + SPARK_N) % SPARK_N];
    const t0 = Math.max(0, tEnd - SPARK_WINDOW);
    sctx.strokeStyle = css(PALETTE.cyan);
    sctx.lineWidth = 3;
    sctx.beginPath();
    let started = false;
    for (let i = 0; i < sparkCount; i++) {
      const j = (sparkHead - sparkCount + i + SPARK_N) % SPARK_N;
      if (sparkT[j] < t0) continue;
      const x = 10 + ((sparkT[j] - t0) / SPARK_WINDOW) * (W - 90);
      const y = yOf(sparkV[j]);
      if (!started) { sctx.moveTo(x, y); started = true; } else sctx.lineTo(x, y);
    }
    sctx.stroke();
  }

  // --- Frame loop
  let readoutClock = 0;
  stage.onFrame((dt) => {
    if (playing && !fell && dt > 0) {
      const simDt = dt * speed;
      const steps = Math.ceil(simDt / H);
      const h = simDt / steps;
      const w3 = s[2];
      const visRate = Math.sign(w3) * Math.min(Math.abs(w3), 5 / speed);
      for (let k = 0; k < steps; k++) {
        integ.step(s, h);
        t += h;
        spinVis = (spinVis + (w3 - visRate) * h) % (2 * Math.PI);
        axleWorld(s, e3);
        const ph = Math.atan2(e3[0], -e3[1]);
        let d = ph - phiPrev;
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        phiTotal += d;
        phiPrev = ph;
        const th = Math.acos(Math.max(-1, Math.min(1, e3[2])));
        if (th < thMin) thMin = th;
        if (th > thMax) thMax = th;
        const r = precessionRate(s);
        if (r < rateMin) rateMin = r;
        if (r > rateMax) rateMax = r;
        trailClock += h;
        if (trailClock >= TRAIL_DT) {
          trailClock -= TRAIL_DT;
          sampleTrail();
        }
        sparkClock += h;
        if (sparkClock >= SPARK_WINDOW / SPARK_N) {
          sparkClock -= SPARK_WINDOW / SPARK_N;
          sparkT[sparkHead] = t;
          sparkV[sparkHead] = th / DEG;
          sparkHead = (sparkHead + 1) % SPARK_N;
          if (sparkCount < SPARK_N) sparkCount++;
        }
        if (th >= thStop) {
          fell = true;
          break;
        }
      }
      draw();
      checkHalved();
    }
    readoutClock += dt;
    if (readoutClock > 0.12) {
      readoutClock = 0;
      drawSpark();
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Slow motion', min: 0.05, max: 1, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'angled',
    options: [{ value: 'angled', label: 'Angled' }, { value: 'side', label: 'Side' }, { value: 'top', label: 'Top' }],
    onChange: (v) => {
      if (v === 'angled') stage.flyTo([3.9, 2.5, 5.6], [0, -0.55, 0]);
      if (v === 'side') stage.flyTo([0.01, 0.2, 9.2], [0, -0.6, 0]);
      if (v === 'top') stage.flyTo([0, 9.5, 0.01], [0, 0, 0]);
    },
  });

  ui.section('Spin and launch (resets)');
  ui.slider({ key: 'spin', label: 'Spin rate ω₃', min: 5, max: 400, step: 1, value: spin, format: (v) => `${v.toFixed(0)} rad/s · ${((v * 60) / (2 * Math.PI)).toFixed(0)} rpm`, onInput: (v) => { spin = v; userReset(); } });
  ui.toggle({ key: 'nospin', label: 'Stop the wheel (ω₃ = 0)', value: noSpin, onChange: (v) => { noSpin = v; userReset(); } });
  ui.slider({ key: 'tilt', label: 'Tilt from vertical θ₀', min: 2, max: 130, step: 1, value: tilt0, unit: '°', onInput: (v) => { tilt0 = v; userReset(); } });
  const phiCtl = ui.slider({ key: 'phi0', label: 'Initial precession φ̇₀ / Ω_steady', min: -1, max: 2, step: 0.05, value: phiRatio, format: (v) => v.toFixed(2), onInput: (v) => { phiRatio = v; userReset(); } });
  ui.select<Preset>({
    key: 'preset', label: 'Launch', value: 'loop',
    options: [{ value: 'steady', label: 'Steady' }, { value: 'cusp', label: 'Cusp' }, { value: 'wave', label: 'Wave' }, { value: 'loop', label: 'Loop' }],
    onChange: (v) => { phiRatio = PRESET_RATIO[v]; phiCtl.set(phiRatio, false); userReset(); },
  });

  ui.section('Physical parameters (resets)');
  ui.slider({ key: 'arm', label: 'Arm length l (pivot to wheel)', min: 0.02, max: 0.1, step: 0.005, value: arm, format: (v) => `${(v * 100).toFixed(1)} cm`, onInput: (v) => { arm = v; userReset(); } });
  ui.slider({ key: 'mass', label: 'Wheel mass m', min: 0.05, max: 0.5, step: 0.01, value: mass, unit: 'kg', format: (v) => v.toFixed(2), onInput: (v) => { mass = v; userReset(); } });
  ui.slider({ key: 'g', label: 'Gravity g', min: 1, max: 25, step: 0.1, value: g, unit: 'm/s²', onInput: (v) => { g = v; userReset(); } });
  ui.note(`Wheel: 4 cm radius, radius of gyration ${(WHEEL_RG * 100).toFixed(1)} cm, massless axle. Mass scales τ and L together, so it cancels out of the motion.`);

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t', 's');
  const rMeas = ui.readout('omegaMeas', 'measured precession');
  const rFast = ui.readout('omegaFast', 'fast-top formula');
  const rErr = ui.readout('omegaErr', 'difference');
  const rNut = ui.readout('nut', 'nutation depth');
  const rShape = ui.readout('shape', 'trail shape');
  const rTau = ui.readout('tau', 'gravity torque');
  const rL3 = ui.readout('L3', 'spin momentum L₃');
  const rI3 = ui.readout('I3', 'I₃');
  const rWc = ui.readout('wc', 'sleeping-top threshold');
  const rE = ui.readout('energy', 'energy drift');
  const rLz = ui.readout('lz', 'L_z drift');
  ui.legend([
    { color: css(PALETTE.white), label: 'L' },
    { color: css(PALETTE.amber), label: 'τ and dL/dt' },
    { color: css(PALETTE.rose), label: 'weight mg' },
    { color: css(PALETTE.cyan), label: 'axle tip path' },
  ]);

  function shape(): string {
    const range = rateMax - rateMin;
    if (t < 0.3 || !(range > 1e-3 * Math.max(1e-9, Math.abs(rateMax)))) return fell ? 'fell' : 'none';
    if (fell) return 'fell';
    const rel = rateMin / range;
    if (rel < -0.04) return 'loop';
    if (rel > 0.04) return 'wave';
    return 'cusp';
  }

  function fastOmega(): number {
    const w3 = spinNow();
    return w3 > 0 ? fastPrecession(p, w3) : NaN;
  }

  function updateReadouts(): void {
    const meas = measured();
    const fast = fastOmega();
    rT(t.toFixed(2));
    rMeas(fell ? 'fell' : Number.isFinite(meas) ? `${meas.toFixed(3)} rad/s` : 'measuring');
    rFast(Number.isFinite(fast) ? `${fast.toFixed(3)} rad/s` : 'no spin');
    rErr(Number.isFinite(meas) && Number.isFinite(fast) && !fell ? `${((meas / fast - 1) * 100).toFixed(1)} %` : '…');
    rNut(`${((thMax - thMin) / DEG).toFixed(1)}°`);
    rShape(shape());
    rTau(`${(p.m * p.g * p.l * Math.sin(tilt(s))).toFixed(3)} N·m`);
    rL3(`${(p.I3 * s[2]).toExponential(2)} N·m·s`);
    rI3(`${p.I3.toExponential(2)} kg·m²`);
    const wc = sleepingThreshold(p);
    rWc(`${wc.toFixed(1)} rad/s ${spinNow() > wc ? '(above)' : '(below)'}`);
    rE(((energy(p, s) - e0) / eScale).toExponential(0));
    rLz(l30 > 0 ? ((Lz(p, s) - lz0) / l30).toExponential(0) : `${(Lz(p, s) - lz0).toExponential(0)}`);
  }

  reset();

  return {
    state: () => {
      const meas = measured();
      const fast = fastOmega();
      return {
        t,
        touched,
        spin: spinNow(),
        spinSlider: spin,
        noSpin,
        tilt: tilt0,
        phi0: phiRatio,
        arm,
        mass,
        g,
        fell,
        measOmega: Number.isFinite(meas) ? meas : 0,
        fastOmega: Number.isFinite(fast) ? fast : 0,
        omegaErr: Number.isFinite(meas) && Number.isFinite(fast) ? Math.abs(meas / fast - 1) : 1,
        nutDepthDeg: (thMax - thMin) / DEG,
        shape: shape(),
        halved,
        halvedRatio,
        sleepThreshold: sleepingThreshold(p),
        energyDrift: (energy(p, s) - e0) / eScale,
        lzDrift: l30 > 0 ? (Lz(p, s) - lz0) / l30 : 0,
      };
    },
    dispose: () => {
      spark.remove();
      legend.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'gyroscope',
  number: 6,
  symbol: 'Gy',
  title: 'Gyroscopic Precession',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'Push down on a spinning wheel and it turns sideways.',
  content,
  mount,
};

export default topic;
