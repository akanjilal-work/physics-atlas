import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  CLASSIC,
  distinctCount,
  divergence,
  fixedPoints,
  H,
  hopfRho,
  LyapunovEstimator,
  MaxTracker,
  maxRealEig,
  rk4InPlace,
  speed as flowSpeed,
  type LorenzParams,
} from './physics.ts';

type Preset = 'classic' | 'spiral' | 'w100' | 'w160';

const PRESETS: Record<Preset, { label: string; rho: number }> = {
  classic: { label: 'Classic 28', rho: 28 },
  spiral: { label: 'Spiral 15', rho: 15 },
  w100: { label: 'ρ = 99.96', rho: 99.96 },
  w160: { label: 'ρ = 160', rho: 160 },
};

const N_SWARM = 1200;
const TRAIL_CAP = 6000; // one point per step: 30 time units of history
/** Background run speed (Lorenz time units per real second) for λ and the Lorenz map. */
const FAST_RATE = 40;
const LYAP_TRANSIENT = 20;
const MAP_TRANSIENT = 150;
const MAP_CAP = 700;
const PERIOD_N = 40;
const SETTLE_SPEED = 0.05;

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

/** World scale for a given ρ, so the attractor stays on screen as it grows. */
const scaleFor = (rho: number) => 0.1 * Math.pow(28 / Math.max(28, rho), 0.85);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [3.4, 1.0, 12.2];
  const stage = createStage(viewport, { camera: CAM, target: [0, -0.2, 0], fov: 42, lights: false });
  const { scene, controls } = stage;
  controls.autoRotateSpeed = 0.5;

  const p: LorenzParams = { ...CLASSIC };
  let preset: Preset = 'classic';
  let rate = 1;
  let ballExp = -2;
  let playing = true;
  let touched = false;

  // --- World group: children use Lorenz coordinates. Rotating by −90° about X puts z up.
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;
  scene.add(world);
  let S = scaleFor(p.rho);
  let zc = p.rho - 1;
  const applyWorld = () => {
    world.scale.setScalar(S);
    world.position.set(0, -S * zc, 0);
  };
  applyWorld();

  const grid = makeGrid(12, 24);
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);

  const glowTex = glowTexture();

  // Main trajectory: a long glowing trail plus a bright head.
  const trail = new Trail(TRAIL_CAP, PALETTE.amber, 1);
  const trailMat = trail.line.material as THREE.LineBasicMaterial;
  trailMat.blending = THREE.AdditiveBlending;
  trailMat.depthWrite = false;
  world.add(trail.line);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  scene.add(head);

  // Swarm: one Points object, positions updated in place, colour by starting index.
  const swarm = new Float64Array(N_SWARM * 3);
  const swarmPos = new Float32Array(N_SWARM * 3);
  const swarmCol = new Float32Array(N_SWARM * 3);
  const swarmGeo = new THREE.BufferGeometry();
  const swarmAttr = new THREE.BufferAttribute(swarmPos, 3);
  swarmAttr.setUsage(THREE.DynamicDrawUsage);
  swarmGeo.setAttribute('position', swarmAttr);
  swarmGeo.setAttribute('color', new THREE.BufferAttribute(swarmCol, 3));
  const swarmPts = new THREE.Points(
    swarmGeo,
    new THREE.PointsMaterial({ size: 0.17, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
  );
  swarmPts.frustumCulled = false;
  world.add(swarmPts);
  {
    // Colour runs cyan → violet → rose → amber along the starting index.
    const stops = [new THREE.Color(PALETTE.cyan), new THREE.Color(PALETTE.violet), new THREE.Color(PALETTE.rose), new THREE.Color(PALETTE.amber)];
    const c = new THREE.Color();
    for (let i = 0; i < N_SWARM; i++) {
      const u = (i / (N_SWARM - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(u));
      c.copy(stops[k]).lerp(stops[k + 1], u - k);
      swarmCol[i * 3] = c.r;
      swarmCol[i * 3 + 1] = c.g;
      swarmCol[i * 3 + 2] = c.b;
    }
  }
  // Unit-ball offsets, sorted along x so the colour index maps to a position across the ball.
  const ballOff = new Float64Array(N_SWARM * 3);
  {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pts: [number, number, number][] = [];
    while (pts.length < N_SWARM) {
      const a = 2 * rnd() - 1;
      const b = 2 * rnd() - 1;
      const c = 2 * rnd() - 1;
      if (a * a + b * b + c * c <= 1) pts.push([a, b, c]);
    }
    pts.sort((u, v) => u[0] - v[0]);
    pts.forEach((q, i) => ballOff.set(q, i * 3));
  }

  // Fixed points: origin and C±. Green when linearly stable, red when not.
  const fpGeo = new THREE.SphereGeometry(1, 20, 14);
  const fpMeshes: THREE.Mesh[] = [];
  const fpLabels: HTMLElement[] = [];
  ['O', 'C+', 'C−'].forEach((name) => {
    const m = new THREE.Mesh(fpGeo, new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.9 }));
    world.add(m);
    fpMeshes.push(m);
    fpLabels.push(stage.label(name, [0, 0, 2.6], 'muted', m).element);
  });
  const fpStable = [false, false, false];

  // --- Lorenz map inset (top right), styled like the double-pendulum sparkline.
  const inset = document.createElement('canvas');
  inset.width = 420;
  inset.height = 360;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '210px', height: '180px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // --- Legend overlay (top left), hidden on phones.
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '180px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '10.5px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the scene</div>
<div><span style="color:${css(PALETTE.amber)}">━━</span> one trajectory</div>
<div><span style="display:inline-block;width:40px;height:6px;border-radius:3px;vertical-align:middle;background:linear-gradient(90deg,${css(PALETTE.cyan)},${css(PALETTE.violet)},${css(PALETTE.rose)},${css(PALETTE.amber)})"></span> swarm, by start index</div>
<div><span style="color:${css(PALETTE.green)}">●</span> stable fixed point</div>
<div><span style="color:${css(PALETTE.red)}">●</span> unstable fixed point</div>
<div class="lz-regime" style="margin-top:5px;color:#dfe6f3"></div>`;
  viewport.appendChild(legend);
  const regimeEl = legend.querySelector('.lz-regime') as HTMLElement;

  // --- Simulation state
  const main = new Float64Array([1, 1, 20]);
  let t = 0;
  let acc = 0;
  let swarmT = 0;
  let swarmUser = false;
  let wingMin = 0;
  let swarmSpread = 0;
  let speedNow = 0;
  let settled = false;

  const est = new LyapunovEstimator();
  let fastT = 0;
  let lyapReady = false;
  let lyapManual = false;
  const tracker = new MaxTracker();
  const maps = new Float64Array(MAP_CAP);
  let mapHead = 0;
  let mapCount = 0;
  let periodCount = 0; // maxima recorded after MAP_TRANSIENT
  let periodic = false;
  const lastPeaks = new Float64Array(PERIOD_N);

  function restartFast(): void {
    est.reset(main[0], main[1], main[2]);
    fastT = 0;
    lyapReady = false;
    tracker.reset();
    mapHead = 0;
    mapCount = 0;
    periodCount = 0;
    periodic = false;
  }

  function releaseSwarm(): void {
    const r = 10 ** ballExp;
    for (let i = 0; i < N_SWARM * 3; i++) swarm[i] = main[i % 3] + r * ballOff[i];
    swarmT = 0;
    syncSwarm();
  }

  function syncSwarm(): void {
    for (let i = 0; i < N_SWARM * 3; i++) swarmPos[i] = swarm[i];
    swarmAttr.needsUpdate = true;
  }

  function measureSwarm(): void {
    let pos = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < N_SWARM; i++) {
      const o = i * 3;
      if (swarm[o] > 0) pos++;
      cx += swarm[o];
      cy += swarm[o + 1];
      cz += swarm[o + 2];
    }
    cx /= N_SWARM;
    cy /= N_SWARM;
    cz /= N_SWARM;
    let s2 = 0;
    for (let i = 0; i < N_SWARM; i++) {
      const o = i * 3;
      s2 += (swarm[o] - cx) ** 2 + (swarm[o + 1] - cy) ** 2 + (swarm[o + 2] - cz) ** 2;
    }
    swarmSpread = Math.sqrt(s2 / N_SWARM);
    const f = pos / N_SWARM;
    wingMin = Math.min(f, 1 - f);
  }

  function updateFixedPoints(): void {
    const fps = fixedPoints(p);
    for (let i = 0; i < 3; i++) {
      const m = fpMeshes[i];
      const fp = fps[i];
      m.visible = !!fp;
      fpLabels[i].style.display = fp ? '' : 'none';
      if (!fp) continue;
      m.position.set(fp[0], fp[1], fp[2]);
      fpStable[i] = maxRealEig(fp, p) < 0;
      (m.material as THREE.MeshBasicMaterial).color.setHex(fpStable[i] ? PALETTE.green : PALETTE.red);
      fpLabels[i].textContent = `${['O', 'C+', 'C−'][i]} ${fpStable[i] ? 'stable' : 'unstable'}`;
    }
  }

  /** A state parked exactly on the z-axis can never leave it. Give it the tiniest push, as any real noise would. */
  function unstick(b: Float64Array, o: number, k: number): void {
    if (Math.abs(b[o]) < 1e-9 && Math.abs(b[o + 1]) < 1e-9) b[o] = (k % 2 ? -1 : 1) * 1e-6 * (1 + (k % 7));
  }

  function paramsChanged(): void {
    touched = true;
    unstick(main, 0, 0);
    for (let i = 0; i < N_SWARM; i++) unstick(swarm, i * 3, i);
    updateFixedPoints();
    restartFast();
    lyapManual = false;
    settled = false;
  }

  const isClassic = () => Math.abs(p.sigma - 10) < 0.05 && Math.abs(p.beta - 8 / 3) < 0.01 && Math.abs(p.rho - 28) < 0.05;
  const classicSB = () => Math.abs(p.sigma - 10) < 0.05 && Math.abs(p.beta - 8 / 3) < 0.02;

  function regimeText(): string {
    const rH = p.sigma > p.beta + 1 ? hopfRho(p.sigma, p.beta) : Infinity;
    if (p.rho < 1) return 'ρ < 1: no convection. Every orbit decays to the origin.';
    if (settled) return 'Settled on a fixed point: steady convection rolls.';
    if (classicSB()) {
      if (p.rho < 13.926) return 'Steady rolls: orbits spiral into C+ or C−.';
      if (p.rho < 24.06) return 'Transient chaos, then the orbit spirals into C±.';
      if (p.rho < rH) return 'Chaos coexists with stable C±.';
    } else if (p.rho < rH) {
      return 'C± are stable. Orbits may wander before settling.';
    }
    if (periodic) return 'Periodic window: the orbit locks onto a loop.';
    if (periodCount < PERIOD_N) return 'C± unstable. Sampling the long-run pattern…';
    return 'Chaos: a strange attractor.';
  }

  // --- Integration
  function stepFast(n: number): void {
    for (let k = 0; k < n; k++) {
      est.step(p, H);
      fastT += H;
      if (!lyapReady && fastT >= LYAP_TRANSIENT) {
        est.restartAverage();
        lyapReady = true;
      }
      const m = tracker.push(est.s[2]);
      if (!Number.isNaN(m) && fastT >= LYAP_TRANSIENT) {
        maps[mapHead] = m;
        mapHead = (mapHead + 1) % MAP_CAP;
        if (mapCount < MAP_CAP) mapCount++;
        if (fastT >= MAP_TRANSIENT) periodCount++;
      }
    }
    if (!Number.isFinite(est.s[0]) || !Number.isFinite(est.s[3])) restartFast();
  }

  function stepMain(pushTrail: boolean): void {
    rk4InPlace(main, 0, p, H);
    if (pushTrail) trail.push(main[0], main[1], main[2]);
  }

  function checkPeriodic(): void {
    if (periodCount < PERIOD_N) {
      periodic = false;
      return;
    }
    for (let k = 0; k < PERIOD_N; k++) lastPeaks[k] = maps[(mapHead - 1 - k + MAP_CAP * 2) % MAP_CAP];
    periodic = distinctCount(lastPeaks, PERIOD_N, 0.01 * Math.max(1, p.rho)) <= 6;
  }

  // --- Inset drawing
  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('Lorenz map: z peaks', 16, 32);
    const x0 = 56;
    const x1 = W - 16;
    const y0 = Hh - 44;
    const y1 = 52;
    if (mapCount < 3) {
      ictx.fillStyle = '#56627c';
      ictx.fillText(p.rho < 1 || settled ? 'no peaks: flow settles' : 'collecting…', 16, Hh / 2);
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let n = 0; n < mapCount; n++) {
      const v = maps[(mapHead - 1 - n + MAP_CAP * 2) % MAP_CAP];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const pad = Math.max(1, (hi - lo) * 0.08);
    lo -= pad;
    hi += pad;
    const X = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
    const Y = (v: number) => y0 - ((v - lo) / (hi - lo)) * (y0 - y1);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1.5;
    ictx.strokeRect(x0, y1, x1 - x0, y0 - y1);
    ictx.setLineDash([6, 6]);
    ictx.beginPath();
    ictx.moveTo(x0, y0);
    ictx.lineTo(x1, y1);
    ictx.stroke();
    ictx.setLineDash([]);
    ictx.fillStyle = '#56627c';
    ictx.font = '19px JetBrains Mono, monospace';
    ictx.fillText('zₙ →', x1 - 58, Hh - 14);
    ictx.fillText(lo.toFixed(0), x0, Hh - 14);
    ictx.save();
    ictx.translate(24, y1 + 70);
    ictx.rotate(-Math.PI / 2);
    ictx.fillText('zₙ₊₁ →', 0, 0);
    ictx.restore();
    ictx.fillStyle = css(PALETTE.cyan);
    for (let n = 0; n + 1 < mapCount; n++) {
      const a = maps[(mapHead - 2 - n + MAP_CAP * 2) % MAP_CAP];
      const b = maps[(mapHead - 1 - n + MAP_CAP * 2) % MAP_CAP];
      ictx.globalAlpha = 0.25 + 0.75 * (1 - n / mapCount);
      ictx.fillRect(X(a) - 2.5, Y(b) - 2.5, 5, 5);
    }
    ictx.globalAlpha = 1;
    if (periodic) {
      ictx.fillStyle = css(PALETTE.green);
      ictx.font = '600 20px JetBrains Mono, monospace';
      ictx.fillText('periodic', W - 118, 32);
    }
  }

  // --- Frame loop
  let uiTimer = 0;
  const hv = new THREE.Vector3();
  stage.onFrame((dt) => {
    if (playing) {
      acc += dt * rate;
      let n = 0;
      while (acc >= H && n < 400) {
        stepMain(true);
        for (let i = 0; i < N_SWARM; i++) rk4InPlace(swarm, i * 3, p, H);
        acc -= H;
        t += H;
        swarmT += H;
        n++;
      }
      if (n >= 400) acc = 0;
      if (!Number.isFinite(main[0])) {
        main.set([1, 1, 20]);
        trail.clear();
      }
      if (swarmPts.visible) syncSwarm();
      stepFast(Math.round((dt * FAST_RATE) / H));
    }
    // Ease the world scale toward the target for the current ρ.
    const sT = scaleFor(p.rho);
    const zT = Math.max(0, p.rho - 1);
    const k = Math.min(1, dt * 3);
    if (Math.abs(S - sT) > 1e-6 || Math.abs(zc - zT) > 1e-4) {
      S += (sT - S) * k;
      zc += (zT - zc) * k;
      applyWorld();
    }
    world.updateMatrixWorld();
    hv.set(main[0], main[1], main[2]).applyMatrix4(world.matrixWorld);
    head.position.copy(hv);
    head.scale.setScalar(0.35);
    const fr = 0.07 / S;
    for (const m of fpMeshes) m.scale.setScalar(fr);

    uiTimer += dt;
    if (uiTimer > 0.2) {
      uiTimer = 0;
      speedNow = flowSpeed(main[0], main[1], main[2], p);
      settled = speedNow < SETTLE_SPEED;
      measureSwarm();
      checkPeriodic();
      drawInset();
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Release swarm', key: 'release', onClick: () => { swarmUser = true; touched = true; releaseSwarm(); } },
    { label: 'Measure λ', key: 'lyap', onClick: () => { restartFast(); lyapManual = true; touched = true; } },
  ]);
  ui.slider({ key: 'rate', label: 'Sim speed', min: 0.1, max: 3, step: 0.05, value: rate, format: (v) => `${v.toFixed(2)} t/s`, onInput: (v) => (rate = v) });
  ui.toggle({ key: 'spin', label: 'Slow auto-rotate', value: false, onChange: (v) => (controls.autoRotate = v) });

  ui.section('Parameters');
  const presetCtl = ui.select<Preset>({
    key: 'preset', label: 'Preset ρ (σ = 10, β = 8/3)', value: preset,
    options: (Object.keys(PRESETS) as Preset[]).map((id) => ({ value: id, label: PRESETS[id].label })),
    onChange: (v) => {
      preset = v;
      p.sigma = 10;
      p.beta = 8 / 3;
      p.rho = PRESETS[v].rho;
      sigmaCtl.set(p.sigma, false);
      betaCtl.set(p.beta, false);
      rhoCtl.set(p.rho, false);
      paramsChanged();
    },
  });
  const rhoCtl = ui.slider({
    key: 'rho', label: 'Heating ρ', min: 0, max: 200, step: 0.01, value: p.rho, format: (v) => v.toFixed(2),
    onInput: (v) => { p.rho = v; paramsChanged(); },
  });
  const sigmaCtl = ui.slider({
    key: 'sigma', label: 'Prandtl σ', min: 1, max: 20, step: 0.1, value: p.sigma, format: (v) => v.toFixed(1),
    onInput: (v) => { p.sigma = v; paramsChanged(); },
  });
  const betaCtl = ui.slider({
    key: 'beta', label: 'Geometry β', min: 0.5, max: 5, step: 0.01, value: p.beta, format: (v) => (Math.abs(v - 8 / 3) < 0.006 ? '8/3' : v.toFixed(2)),
    onInput: (v) => { p.beta = Math.abs(v - 8 / 3) < 0.006 ? 8 / 3 : v; paramsChanged(); },
  });
  ui.note('Parameters change the flow under the moving points. The trail and swarm carry on from where they are, so you see the transition.');

  ui.section('Swarm');
  ui.slider({ key: 'ball', label: 'Ball radius', min: -6, max: -1, step: 1, value: ballExp, format: (v) => `10^${v}`, onInput: (v) => { ballExp = v; } });
  ui.toggle({ key: 'showSwarm', label: 'Show swarm', value: true, onChange: (v) => { swarmPts.visible = v; if (v) syncSwarm(); } });
  ui.toggle({ key: 'showTrail', label: 'Show trail', value: true, onChange: (v) => { trail.line.visible = v; } });
  ui.note('Release swarm drops a fresh ball of points, radius set above, at the head of the trail.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rSpeed = ui.readout('speed', 'flow speed |f|');
  const rLy = ui.readout('lyap', 'Lyapunov λ');
  const rLT = ui.readout('lyapT', 'λ averaged over');
  const rWing = ui.readout('wing', 'wing split x>0');
  const rSpread = ui.readout('spread', 'swarm spread');
  const rDiv = ui.readout('div', 'volume rate −(σ+1+β)');
  const rH = ui.readout('rhoH', 'Hopf ρ_H');
  ui.legend([
    { color: css(PALETTE.amber), label: 'trajectory' },
    { color: css(PALETTE.violet), label: 'swarm' },
    { color: css(PALETTE.green), label: 'stable point' },
    { color: css(PALETTE.red), label: 'unstable point' },
    { color: css(PALETTE.cyan), label: 'Lorenz map (inset)' },
  ]);

  function updateReadouts(): void {
    rT(t.toFixed(1));
    rSpeed(speedNow < 0.01 ? speedNow.toExponential(1) : speedNow.toFixed(2));
    rLy(lyapReady && est.T > 1 ? est.value.toFixed(3) : '…');
    rLT(lyapReady ? `${est.T.toFixed(0)} t` : 'transient');
    let pos = 0;
    for (let i = 0; i < N_SWARM; i++) if (swarm[i * 3] > 0) pos++;
    rWing(`${Math.round((100 * pos) / N_SWARM)}% / ${Math.round(100 - (100 * pos) / N_SWARM)}%`);
    rSpread(swarmSpread < 0.01 ? swarmSpread.toExponential(1) : swarmSpread.toFixed(2));
    rDiv(divergence(p).toFixed(3));
    rH(p.sigma > p.beta + 1 ? hopfRho(p.sigma, p.beta).toFixed(2) : 'none');
    regimeEl.textContent = regimeText();
    presetCtl.el.style.opacity = Math.abs(p.rho - PRESETS[preset].rho) < 1e-9 ? '1' : '0.75';
  }

  // --- Start: pre-run so the butterfly is already drawn, then drop a swarm at the head.
  for (let i = 0; i < 2000; i++) stepMain(false);
  for (let i = 0; i < TRAIL_CAP; i++) stepMain(true);
  t = 0;
  updateFixedPoints();
  releaseSwarm();
  // Let the default swarm fly for 4 time units so it already shows as a stretched thread.
  for (let k = 0; k < 800; k++) {
    stepMain(true);
    for (let i = 0; i < N_SWARM; i++) rk4InPlace(swarm, i * 3, p, H);
  }
  syncSwarm();
  restartFast();
  measureSwarm();
  drawInset();
  updateReadouts();
  touched = false;

  return {
    state: () => ({
      t,
      rho: p.rho,
      sigma: p.sigma,
      beta: p.beta,
      classic: isClassic(),
      preset,
      touched,
      speed: speedNow,
      settled,
      periodic,
      lyap: lyapReady && est.T > 1 ? est.value : 0,
      lyapT: lyapReady ? est.T : 0,
      lyapManual,
      swarmUser,
      swarmT,
      wingMin,
      swarmSpread,
      ballExp,
    }),
    dispose: () => {
      inset.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'lorenz-attractor',
  number: 34,
  title: 'The Lorenz Attractor',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'Three simple equations, and a butterfly that never repeats.',
  content,
  mount,
};

export default topic;
