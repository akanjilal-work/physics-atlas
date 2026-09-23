import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { Ising, Stats, TC, domainStats, onsagerM, onsagerU, type Algorithm, type DomainStats } from './physics.ts';

const SIZE = 8; // lattice side in scene units
const LMAX = 128;
const NMAX = LMAX * LMAX;
const BOT = -0.42; // column bottom
const LIFT = 0.24; // top of an up tile; a down tile's top sits at -LIFT
const WINDOW = 400; // measurement window (sweeps)
const QUENCH_T = 1.5;
const HEAT_T = 4;
const TRACE_CAP = 360;
const SWEEP_TS: number[] = [];
for (let T = 3.5; T > 1.45; T -= 0.1) SWEEP_TS.push(Math.round(T * 100) / 100);
const SWEEP_EQ = 120;
const SWEEP_MEAS = 250;
const MAXPTS = 256;
const UP_HEX = 0xfb7a4b; // thermo accent, warm
const DOWN_HEX = 0x2f6fd6; // cool
const MONO = 'JetBrains Mono, ui-monospace, monospace';

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [1.25, 13.0, 10.2], target: [1.25, -1.3, 0.55], fov: 42 });
  const { scene } = stage;

  // --- Simulation state
  let L = 128;
  let T = TC;
  let h = 0;
  let algo: Algorithm = 'metropolis';
  let spf = 3;
  let seed = 7;
  let playing = true;
  let touched = false;
  let quenched = false;
  let fieldFlip = false;
  let strongSign = 0;
  let sweeps = 0;
  let eqLeft = 0;
  let lat = new Ising(L, seed);
  const stats = new Stats(WINDOW);
  const dstats: DomainStats = { count: 0, largest: 0, second: 0, octaves: 0 };
  const labelsBuf = new Int32Array(NMAX);
  const queueBuf = new Int32Array(NMAX);
  let energyErr = 0;

  // Sweep mode
  let sweeping = false;
  let sweepIdx = 0;
  let sweepCount = 0;
  let sweepDone = false;

  // Recorded (T, <|m|>) points
  const ptsT = new Float32Array(MAXPTS);
  const ptsM = new Float32Array(MAXPTS);
  const ptsKey = new Int32Array(MAXPTS);
  let nPts = 0;

  // --- Scene: base plate and tile columns
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(SIZE + 0.3, 0.12, SIZE + 0.3),
    new THREE.MeshStandardMaterial({ color: 0x141a28, roughness: 0.9, metalness: 0.1 }),
  );
  plate.position.y = BOT - 0.06;
  scene.add(plate);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE + 0.3, 0.12, SIZE + 0.3)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }),
  );
  edge.position.copy(plate.position);
  scene.add(edge);

  const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tileMat, NMAX);
  tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tiles.setColorAt(0, new THREE.Color(0));
  tiles.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  tiles.frustumCulled = false;
  scene.add(tiles);
  const mArr = tiles.instanceMatrix.array as Float32Array;
  const cArr = tiles.instanceColor!.array as Float32Array;
  const disp = new Float32Array(NMAX);
  const up = new THREE.Color(UP_HEX);
  const dn = new THREE.Color(DOWN_HEX);

  function layoutTiles(): void {
    const cell = SIZE / L;
    const fw = cell * (L <= 32 ? 0.86 : 0.93);
    mArr.fill(0);
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        const i = y * L + x;
        const b = i * 16;
        mArr[b] = fw;
        mArr[b + 10] = fw;
        mArr[b + 12] = (x + 0.5) * cell - SIZE / 2;
        mArr[b + 14] = (y + 0.5) * cell - SIZE / 2;
        mArr[b + 15] = 1;
        disp[i] = lat.s[i];
      }
    }
    tiles.count = L * L;
    paintTiles(1);
  }

  function paintTiles(k: number): void {
    const n = L * L;
    const s = lat.s;
    for (let i = 0; i < n; i++) {
      const d = disp[i] + (s[i] - disp[i]) * k;
      disp[i] = d;
      const top = LIFT * d;
      const b = i * 16;
      mArr[b + 5] = top - BOT;
      mArr[b + 13] = (top + BOT) / 2;
      const u = (d + 1) / 2;
      const c = i * 3;
      cArr[c] = dn.r + (up.r - dn.r) * u;
      cArr[c + 1] = dn.g + (up.g - dn.g) * u;
      cArr[c + 2] = dn.b + (up.b - dn.b) * u;
    }
    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor!.needsUpdate = true;
  }

  // Labels
  const phaseLab = stage.label('', [0, BOT, SIZE / 2 + 0.75], 'big');
  const critLab = stage.label('', [0, BOT, SIZE / 2 + 1.35], 'muted');

  // --- Overlays
  const boxStyle = { background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute' };
  const trace = document.createElement('canvas');
  trace.className = 'is-trace';
  trace.width = 460;
  trace.height = 170;
  Object.assign(trace.style, { ...boxStyle, right: '10px', top: '10px', width: '230px', height: '85px' });
  viewport.appendChild(trace);
  const tctx = trace.getContext('2d')!;

  const inset = document.createElement('canvas');
  inset.className = 'is-mt';
  inset.width = 460;
  inset.height = 340;
  Object.assign(inset.style, { ...boxStyle, right: '10px', bottom: '10px', width: '230px', height: '170px' });
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read it</div>
<div>One tile is one spin. <span style="color:#fb7a4b">Raised orange</span>: up, s = +1. <span style="color:#5b9cf0">Sunken blue</span>: down, s = −1.</div>
<div style="margin-top:3px">Each spin wants to match its 4 neighbours. Temperature T adds random flips.</div>
<div style="margin-top:3px;color:#8391ab">Grid: <span class="is-size"></span> spins, edges wrap around.</div>`;
  const sizeSpan = legend.querySelector('.is-size') as HTMLElement;
  sizeSpan.textContent = `${L} × ${L}`;
  viewport.appendChild(legend);

  // m(t) ring buffer
  const traceBuf = new Float32Array(TRACE_CAP);
  let traceLen = 0;
  let traceHead = 0;

  function drawTrace(): void {
    const W = trace.width;
    const Hh = trace.height;
    const c = tctx;
    c.clearRect(0, 0, W, Hh);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText('magnetization m(t)', 16, 30);
    const top = 44;
    const bot = Hh - 12;
    const yOf = (m: number) => top + ((1 - m) / 2) * (bot - top);
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    for (const m of [-1, 0, 1]) {
      c.beginPath();
      c.moveTo(12, yOf(m));
      c.lineTo(W - 60, yOf(m));
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(m > 0 ? '+1' : m < 0 ? '−1' : ' 0', W - 52, yOf(m) + 8);
    }
    if (traceLen < 2) return;
    c.strokeStyle = '#dfe6f3';
    c.lineWidth = 2.5;
    c.beginPath();
    const x0 = 12;
    const dx = (W - 72 - x0) / (TRACE_CAP - 1);
    for (let k = 0; k < traceLen; k++) {
      const idx = (traceHead - traceLen + k + TRACE_CAP) % TRACE_CAP;
      const x = x0 + (TRACE_CAP - traceLen + k) * dx;
      const y = yOf(traceBuf[idx]);
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }

  const TMAX = 5;
  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, Hh);
    const l = 56;
    const r = W - 18;
    const t = 50;
    const b = Hh - 50;
    const xOf = (x: number) => l + (x / TMAX) * (r - l);
    const yOf = (m: number) => b - m * (b - t);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText('⟨|m|⟩ vs T', 16, 30);
    c.fillStyle = '#56627c';
    c.fillText(h === 0 ? 'line: Onsager' : 'line: Onsager (h = 0)', 190, 30);
    // axes
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(l, t);
    c.lineTo(l, b);
    c.lineTo(r, b);
    c.stroke();
    c.fillStyle = '#56627c';
    for (let x = 0; x <= 5; x++) c.fillText(String(x), xOf(x) - 7, b + 26);
    c.fillText('1', l - 26, yOf(1) + 8);
    c.fillText('0', l - 26, yOf(0) + 8);
    c.fillText('T', r - 14, b - 10);
    // T_c marker
    c.strokeStyle = '#fb7a4b';
    c.setLineDash([6, 6]);
    c.beginPath();
    c.moveTo(xOf(TC), t - 6);
    c.lineTo(xOf(TC), b);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#fb7a4b';
    c.fillText('Tc', xOf(TC) + 6, t + 14);
    // Onsager curve
    c.strokeStyle = 'rgba(223,230,243,0.85)';
    c.lineWidth = 3;
    c.beginPath();
    for (let k = 0; k <= 240; k++) {
      const x = 0.05 + (k / 240) * (TMAX - 0.05);
      const y = yOf(onsagerM(x));
      if (k === 0) c.moveTo(xOf(x), y);
      else c.lineTo(xOf(x), y);
    }
    c.stroke();
    // recorded points
    c.fillStyle = '#f5b642';
    for (let k = 0; k < nPts; k++) {
      c.beginPath();
      c.arc(xOf(ptsT[k]), yOf(ptsM[k]), 5, 0, Math.PI * 2);
      c.fill();
    }
    // live point
    const live = stats.count > 20 ? stats.meanAbsM : Math.abs(lat.M / lat.N);
    c.strokeStyle = '#4fd1e8';
    c.fillStyle = '#4fd1e8';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(xOf(Math.min(TMAX, T)), yOf(live), 9, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(xOf(Math.min(TMAX, T)), yOf(Math.abs(lat.M / lat.N)), 3.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8391ab';
    c.fillText(sweeping ? `sweep ${sweepIdx + 1}/${SWEEP_TS.length}` : nPts ? `${nPts} points` : 'dots: measured', l + 12, b - 14);
  }

  function recordPoint(): void {
    const key = Math.round(T * 50);
    let k = 0;
    while (k < nPts && ptsKey[k] !== key) k++;
    if (k === nPts) {
      if (nPts >= MAXPTS) return;
      nPts++;
    }
    ptsKey[k] = key;
    ptsT[k] = T;
    ptsM[k] = stats.meanAbsM;
  }

  // --- Parameter changes
  function restartMeasure(): void {
    stats.reset();
    eqLeft = algo === 'wolff' ? 40 : 120;
  }

  function setT(v: number, fromUser = true): void {
    const wasAbove = T >= TC;
    T = v;
    lat.setParams(T, h);
    restartMeasure();
    if (fromUser) {
      touched = true;
      if (sweeping) stopSweep();
      if (wasAbove && T < TC) quenched = true;
    }
    if (T >= TC) strongSign = 0;
    tSlider.set(Math.round(T * 100) / 100, false);
  }

  function setH(v: number): void {
    h = v;
    lat.setParams(T, h);
    restartMeasure();
  }

  function rebuild(): void {
    lat = new Ising(L, seed);
    lat.setParams(T, h);
    sweeps = 0;
    restartMeasure();
    strongSign = 0;
    layoutTiles();
    sizeSpan.textContent = `${L} × ${L}`;
  }

  function quench(): void {
    touched = true;
    if (sweeping) stopSweep();
    lat.randomize();
    quenched = true;
    strongSign = 0;
    setT(QUENCH_T, false);
    traceLen = 0;
  }

  function heat(): void {
    touched = true;
    if (sweeping) stopSweep();
    strongSign = 0;
    setT(HEAT_T, false);
  }

  function startSweep(): void {
    touched = true;
    sweeping = true;
    sweepDone = false;
    sweepIdx = 0;
    sweepCount = 0;
    nPts = 0;
    hSlider.set(0, false);
    setH(0);
    lat.randomize();
    setT(SWEEP_TS[0], false);
    sweepBtn.textContent = 'Stop sweep';
  }

  function stopSweep(): void {
    sweeping = false;
    sweepBtn.textContent = 'Start T sweep';
  }

  function sweepTick(): void {
    sweepCount++;
    if (sweepCount < SWEEP_EQ + SWEEP_MEAS) return;
    recordPoint();
    sweepIdx++;
    sweepCount = 0;
    if (sweepIdx >= SWEEP_TS.length) {
      stopSweep();
      sweepDone = true;
      return;
    }
    setT(SWEEP_TS[sweepIdx], false);
  }

  // --- Frame loop
  let slow = 0;
  let domT = 0;
  let checkT = 0;
  stage.onFrame((dt) => {
    if (playing) {
      const t0 = performance.now();
      for (let k = 0; k < spf; k++) {
        lat.sweep(algo);
        sweeps++;
        if (eqLeft > 0) eqLeft--;
        else stats.add(lat.E / lat.N, lat.M / lat.N);
        if (sweeping) sweepTick();
        if (performance.now() - t0 > 14) break;
      }
      const m = lat.M / lat.N;
      traceBuf[traceHead] = m;
      traceHead = (traceHead + 1) % TRACE_CAP;
      if (traceLen < TRACE_CAP) traceLen++;
      // Field-flip bookkeeping (hysteresis challenge)
      if (T < TC && Math.abs(m) > 0.8) {
        const sg = Math.sign(m);
        if (strongSign !== 0 && sg !== strongSign && h !== 0 && Math.sign(h) === sg) fieldFlip = true;
        strongSign = sg;
      }
      if (!sweeping && stats.count >= 300 && Math.abs(h) < 0.005) recordPoint();
    }
    paintTiles(1 - Math.exp(-dt * 16));

    slow += dt;
    domT += dt;
    checkT += dt;
    if (domT > 0.5) {
      domT = 0;
      domainStats(lat.s, lat.nbr, labelsBuf, queueBuf, dstats);
    }
    if (checkT > 1) {
      checkT = 0;
      energyErr = Math.abs(lat.energyFull() - lat.E);
    }
    if (slow > 0.2) {
      slow = 0;
      drawTrace();
      drawInset();
      updateReadouts();
      updatePhaseLabel();
    }
  });

  let lastPhase = '';
  function updatePhaseLabel(): void {
    const m = Math.abs(lat.M / lat.N);
    let p: string;
    let sub = '';
    if (Math.abs(T - TC) < 0.08 && Math.abs(h) < 0.05) {
      p = 'Critical point: domains of every size';
      sub = 'islands inside lakes inside islands, at all scales';
    } else if (T < TC) {
      p = m > 0.8 ? 'Ordered: one direction has won' : 'Below Tc: domains merging';
      sub = m > 0.8 ? 'spontaneous magnetization' : 'walls shrink to cut their energy';
    } else {
      p = 'Disordered: noise beats agreement';
      sub = T > 3 ? 'only small, short-lived patches' : 'patches grow as T nears Tc';
    }
    const key = p + sub;
    if (key === lastPhase) return;
    lastPhase = key;
    phaseLab.element.textContent = p;
    critLab.element.textContent = sub;
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Temperature and field');
  const tSlider = ui.slider({
    key: 'T', label: 'Temperature T', min: 0.5, max: 5, step: 0.01, value: Math.round(TC * 100) / 100,
    format: (v) => `${v.toFixed(2)}${Math.abs(v - TC) < 0.006 ? ' = Tc' : ''}`,
    onInput: (v) => setT(v),
  });
  {
    // T_c tick under the slider track
    const row = tSlider.el;
    const tick = document.createElement('div');
    const pct = (TC - 0.5) / (5 - 0.5);
    Object.assign(tick.style, { position: 'relative', height: '14px', font: '10px JetBrains Mono, monospace', color: 'var(--c-thermo)' } as CSSStyleDeclaration);
    tick.innerHTML = `<span style="position:absolute;left:calc(7px + (100% - 14px) * ${pct.toFixed(4)});transform:translateX(-50%);white-space:nowrap">▲ Tc ≈ 2.269</span>`;
    row.appendChild(tick);
  }
  ui.buttons([
    { label: 'Quench', primary: true, key: 'quench', onClick: quench },
    { label: 'Heat', key: 'heat', onClick: heat },
    { label: 'Go to Tc', key: 'T', onClick: () => { touched = true; if (sweeping) stopSweep(); setT(TC, false); } },
  ]);
  const hSlider = ui.slider({
    key: 'h', label: 'Field h', min: -1, max: 1, step: 0.01, value: 0,
    format: (v) => v.toFixed(2),
    onInput: (v) => { touched = true; setH(v); },
  });

  ui.section('Temperature sweep');
  const [sweepBtn] = ui.buttons([
    { label: 'Start T sweep', key: 'sweep', onClick: () => (sweeping ? stopSweep() : startSweep()) },
    { label: 'Clear points', onClick: () => { nPts = 0; } },
  ]);
  ui.note(`Cools from T = 3.5 to 1.5 in steps of 0.1. At each step it runs ${SWEEP_EQ} sweeps to settle, averages ${SWEEP_MEAS}, and plots a point.`);

  ui.section('Simulation');
  ui.select<Algorithm>({
    key: 'algo', label: 'Algorithm', value: algo,
    options: [{ value: 'metropolis', label: 'Metropolis' }, { value: 'wolff', label: 'Wolff cluster' }],
    onChange: (v) => { algo = v; touched = true; restartMeasure(); },
  });
  ui.slider({ key: 'spf', label: 'Sweeps per frame', min: 1, max: 30, step: 1, value: spf, onInput: (v) => { spf = v; } });
  ui.select<string>({
    key: 'L', label: 'Lattice size L', value: String(L),
    options: [16, 32, 64, 96, 128].map((n) => ({ value: String(n), label: String(n) })),
    onChange: (v) => { L = Number(v); touched = true; if (sweeping) stopSweep(); rebuild(); },
  });
  ui.slider({ key: 'seed', label: 'Random seed', min: 1, max: 99, step: 1, value: seed, onInput: (v) => { seed = v; touched = true; if (sweeping) stopSweep(); rebuild(); } });
  const [playBtn] = ui.buttons([
    { label: 'Pause', onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Random start', onClick: () => { touched = true; lat.randomize(); restartMeasure(); strongSign = 0; } },
    { label: 'All up', onClick: () => { touched = true; lat.fill(1); lat.setParams(T, h); restartMeasure(); } },
  ]);

  ui.section('Measurements');
  const rM = ui.readout('m', 'm now');
  const rAbs = ui.readout('absM', '⟨|m|⟩ window');
  const rOns = ui.readout('onsager', 'Onsager M(T)');
  const rE = ui.readout('energy', 'e = H/N');
  const rU = ui.readout('exactU', 'Onsager u(T)');
  const rC = ui.readout('C', 'specific heat C');
  const rChi = ui.readout('chi', 'susceptibility χ');
  const rDom = ui.readout('domains', 'domains, largest');
  const rAlg = ui.readout('algo', 'acceptance');
  const rChk = ui.readout('check', 'energy check');
  ui.note('Averages use the last 400 sweeps after a short settling period. Onsager values are exact for an infinite grid at h = 0. The energy check compares the running energy with a full recount.');

  function updateReadouts(): void {
    const m = lat.M / lat.N;
    rM(m.toFixed(3));
    const ready = stats.count >= 20;
    rAbs(ready ? `${stats.meanAbsM.toFixed(3)} (${stats.count})` : eqLeft > 0 ? 'settling…' : '…');
    rOns(onsagerM(T).toFixed(3));
    rE(ready ? stats.meanE.toFixed(4) : (lat.E / lat.N).toFixed(4));
    rU(h === 0 ? onsagerU(T).toFixed(4) : 'h ≠ 0');
    rC(ready ? stats.heatCapacity(lat.N, T).toFixed(2) : '…');
    rChi(ready ? stats.susceptibility(lat.N, T).toFixed(2) : '…');
    rDom(`${dstats.count}, ${((100 * dstats.largest) / lat.N).toFixed(0)}%`);
    rAlg(algo === 'wolff' ? `cluster ${lat.lastClusterMean.toFixed(0)} spins` : `${(lat.lastAccept * 100).toFixed(1)}%`);
    rChk(energyErr < 1e-9 ? 'exact (0)' : `|ΔE| ${energyErr.toExponential(0)}`);
  }

  // --- Start: pre-equilibrate at T_c with Wolff so the first view is already critical.
  lat.setParams(T, h);
  for (let k = 0; k < 60; k++) lat.wolffSweep();
  layoutTiles();
  restartMeasure();
  drawTrace();
  drawInset();
  updateReadouts();
  updatePhaseLabel();

  return {
    state: () => ({
      T, h, L, algo, spf, seed, sweeps, touched, quenched, fieldFlip, sweeping, sweepDone,
      m: lat.M / lat.N,
      absM: stats.meanAbsM,
      samples: stats.count,
      e: stats.count ? stats.meanE : lat.E / lat.N,
      C: stats.heatCapacity(lat.N, T),
      chi: stats.susceptibility(lat.N, T),
      domains: dstats.count,
      largest: dstats.largest / lat.N,
      points: nPts,
    }),
    dispose: () => {
      trace.remove();
      inset.remove();
      legend.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'ising-model',
  number: 31,
  symbol: 'Is',
  title: 'Phase Transitions & the Ising Model',
  domain: 'thermo',
  level: 2,
  status: 'live',
  tagline: 'Billions of tiny magnets decide together, all at once.',
  content,
  mount,
};

export default topic;
