import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A_MU_FNAL,
  ASYM,
  eFieldCoefficient,
  betaFromGamma,
  C_LIGHT,
  fitWiggle,
  gammaFromP,
  labLifetime,
  magicMomentum,
  omegaA,
  omegaC,
  orbitRadius,
  rng,
  sampleDecays,
  visibleOscillations,
  wiggle,
  type WiggleFit,
} from './physics.ts';

const R = 7; // drawn ring radius (scene units ~ metres, real ring 7.112 m)
const R_DET = 6.35; // radius where positrons meet the calorimeters
const N_MU = 64; // muons drawn per fill
const N_DET = 24; // calorimeter stations, as in E989
const N_TRK = 32; // positron track pool
const TRK_PTS = 40;
const FILL_RATE = 2.5; // simulated microseconds per real second
const FILL_LEN = 60; // us per drawn fill
const ORBIT_VIS = (2 * Math.PI) / 14; // drawn lap rate, rad/s (slowed)
const BINS = 240;
const E_ILLUS = 1e5; // V/m, illustrative quadrupole field for the E-term readout
const INJ = Math.PI / 2 - 0.35; // injection azimuth

type View = 'ring' | 'close';

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

interface Track {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  pos: Float32Array;
  age: number;
  life: number;
  active: boolean;
  station: number;
  energy: number;
  hit: boolean;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 8.6, 17.5], target: [0, 0.9, 0.4], fov: 45, far: 300 });
  const { scene } = stage;

  // --- Parameters
  let B = 1.45;
  let pGeV = 2.6;
  let a = A_MU_FNAL;
  let rateExp = Math.log10(2000); // log10 decays per second
  let playing = true;
  let touched = false;
  let view: View = 'ring';

  // derived (recomputed by derive())
  let gamma = 1;
  let tauUs = 1; // dilated lifetime, us
  let wA = 1; // omega_a, rad/us
  let binW = 1;
  let window_ = 1;

  // --- Ring furniture
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b3448, metalness: 0.7, roughness: 0.45 });
  const lower = new THREE.Mesh(new THREE.RingGeometry(R - 0.75, R + 0.75, 160, 1), steel);
  lower.rotation.x = -Math.PI / 2;
  lower.position.y = -0.42;
  scene.add(lower);
  const upperMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const upper = new THREE.Mesh(new THREE.RingGeometry(R - 0.75, R + 0.75, 160, 1), upperMat);
  upper.rotation.x = -Math.PI / 2;
  upper.position.y = 0.42;
  scene.add(upper);
  const tube = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.3, 12, 160),
    new THREE.MeshStandardMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.06, depthWrite: false, roughness: 0.9 }),
  );
  tube.rotation.x = Math.PI / 2;
  scene.add(tube);
  // outer yoke wall
  const yoke = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.95, R + 0.95, 0.9, 160, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b2232, metalness: 0.6, roughness: 0.6, side: THREE.DoubleSide }),
  );
  scene.add(yoke);

  // B-field arrows (vertical, up) at a few azimuths, just outside the chamber
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);
  const fieldMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 });
  const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6);
  const headGeo = new THREE.ConeGeometry(0.08, 0.18, 10);
  for (let k = 0; k < 12; k++) {
    const ph = (k / 12) * Math.PI * 2 + 0.13;
    const x = (R + 0.55) * Math.cos(ph);
    const z = (R + 0.55) * Math.sin(ph);
    const s = new THREE.Mesh(shaftGeo, fieldMat);
    s.position.set(x, -0.05, z);
    const h = new THREE.Mesh(headGeo, fieldMat);
    h.position.set(x, 0.38, z);
    fieldGroup.add(s, h);
  }

  // Calorimeter stations on the inner side
  const detGeo = new THREE.BoxGeometry(0.34, 0.5, 0.5);
  const detMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.1 });
  const dets = new THREE.InstancedMesh(detGeo, detMat, N_DET);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const vtmp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const detPhi = new Float32Array(N_DET);
  for (let k = 0; k < N_DET; k++) {
    const ph = ((k + 0.5) / N_DET) * Math.PI * 2;
    detPhi[k] = ph;
    q.setFromAxisAngle(yAxis, -ph);
    m4.compose(vtmp.set((R_DET - 0.2) * Math.cos(ph), 0, (R_DET - 0.2) * Math.sin(ph)), q, one);
    dets.setMatrixAt(k, m4);
    dets.setColorAt(k, new THREE.Color(0x1d3a2c));
  }
  scene.add(dets);
  const detFlash = new Float32Array(N_DET);
  const detCol = new THREE.Color();
  const detBase = new THREE.Color(0x1a3326);
  const detHot = new THREE.Color(PALETTE.green);

  const lblB = stage.label('B up, 1.45 T', [(R + 0.6) * Math.cos(0.13), 0.9, (R + 0.6) * Math.sin(0.13)], 'muted');
  stage.label('calorimeters (24)', [(R_DET - 0.9) * Math.cos(detPhi[3]), 0.5, (R_DET - 0.9) * Math.sin(detPhi[3])], 'muted');
  stage.label('muons enter here', [(R + 1.2) * Math.cos(INJ - 0.25), 1.0, (R + 1.2) * Math.sin(INJ - 0.25)], 'muted');

  // --- Muons: glow points, spin arrows (amber), momentum ticks (cyan)
  const glowTex = glowTexture();
  const muPos = new Float32Array(N_MU * 3);
  const muCol = new Float32Array(N_MU * 3);
  const muGeo = new THREE.BufferGeometry();
  muGeo.setAttribute('position', new THREE.BufferAttribute(muPos, 3).setUsage(THREE.DynamicDrawUsage));
  muGeo.setAttribute('color', new THREE.BufferAttribute(muCol, 3).setUsage(THREE.DynamicDrawUsage));
  const muPts = new THREE.Points(muGeo, new THREE.PointsMaterial({
    size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  muPts.frustumCulled = false;
  scene.add(muPts);

  const spinPos = new Float32Array(N_MU * 6 * 3);
  const spinGeo = new THREE.BufferGeometry();
  spinGeo.setAttribute('position', new THREE.BufferAttribute(spinPos, 3).setUsage(THREE.DynamicDrawUsage));
  const spinLines = new THREE.LineSegments(spinGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.95 }));
  spinLines.frustumCulled = false;
  scene.add(spinLines);

  const momPos = new Float32Array(N_MU * 2 * 3);
  const momGeo = new THREE.BufferGeometry();
  momGeo.setAttribute('position', new THREE.BufferAttribute(momPos, 3).setUsage(THREE.DynamicDrawUsage));
  const momLines = new THREE.LineSegments(momGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 }));
  momLines.frustumCulled = false;
  scene.add(momLines);

  const phi0 = new Float32Array(N_MU);
  const vRel = new Float32Array(N_MU);
  const dr = new Float32Array(N_MU);
  const dy = new Float32Array(N_MU);
  const betaPh = new Float32Array(N_MU);
  const tDecay = new Float32Array(N_MU);
  const alive = new Uint8Array(N_MU);
  let aliveCount = 0;

  // --- Positron tracks
  const tracks: Track[] = [];
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);
  for (let k = 0; k < N_TRK; k++) {
    const pos = new Float32Array(TRK_PTS * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(g, mat);
    line.frustumCulled = false;
    line.visible = false;
    trackGroup.add(line);
    tracks.push({ line, mat, pos, age: 0, life: 1, active: false, station: 0, energy: 0, hit: false });
  }
  let trkNext = 0;

  // --- Overlays: legend (top-left), wiggle inset (top-right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${css(c)}"></i>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">One fill of the storage ring, in slow motion</div>
<div>${sw(0xffffff)}muon</div>
<div>${sw(PALETTE.amber)}spin arrow</div>
<div>${sw(PALETTE.cyan)}direction of travel</div>
<div>${sw(PALETTE.rose)}fast positron (spin forward)</div>
<div>${sw(PALETTE.violet)}slow positron (spin back)</div>
<div>${sw(PALETTE.green)}calorimeter hit</div>
<div class="g2-clock" style="margin-top:4px;color:#dfe6f3"></div>
<div class="g2-note" style="color:#8391ab"></div>`;
  viewport.appendChild(legend);
  const clockEl = legend.querySelector('.g2-clock') as HTMLElement;
  const noteEl = legend.querySelector('.g2-note') as HTMLElement;

  const inset = document.createElement('canvas');
  inset.width = 560;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '280px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // --- Simulation state
  const rand = rng(0x6a2);
  const hist = new Float64Array(BINS);
  let counted = 0;
  let pending = 0;
  let fit: WiggleFit | null = null;
  let fitTimer = 0;
  let fitDirty = false;
  let tFill = 0;
  let tVis = 0;
  let oscill = 0;
  const goodFits: { B: number; w: number }[] = [];
  let bDoubled = false;

  function derive(): void {
    gamma = gammaFromP(pGeV);
    tauUs = labLifetime(gamma) * 1e6;
    wA = omegaA(B, a) * 1e-6;
    const Ta = (2 * Math.PI) / wA;
    window_ = Math.min(400, Math.max(20, 24 * Ta));
    binW = window_ / BINS;
  }

  function clearHist(): void {
    hist.fill(0);
    counted = 0;
    pending = 0;
    fit = null;
    oscill = 0;
    fitDirty = true;
  }

  function newFill(): void {
    tFill = 0;
    aliveCount = N_MU;
    for (let i = 0; i < N_MU; i++) {
      alive[i] = 1;
      phi0[i] = INJ + (rand() - 0.5) * 1.4;
      vRel[i] = 1 + (rand() - 0.5) * 0.06;
      dr[i] = (rand() - 0.5) * 0.3;
      dy[i] = (rand() - 0.5) * 0.18;
      betaPh[i] = rand() * Math.PI * 2;
      tDecay[i] = -tauUs * Math.log(1 - rand());
      muCol[i * 3] = 0.95; muCol[i * 3 + 1] = 0.97; muCol[i * 3 + 2] = 1;
    }
    (muGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function paramsChanged(): void {
    touched = true;
    derive();
    clearHist();
    newFill();
    updateNote();
  }

  function updateNote(): void {
    const laps = 1 / (a * gamma);
    noteEl.textContent = `Laps drawn slowed. A real muon laps ${laps.toFixed(0)}× per spin turn.`;
    lblB.element.textContent = `B up, ${B.toFixed(2)} T`;
  }

  // --- Positron emission
  function emit(i: number, phi: number, theta: number): void {
    // spin forward (theta ~ 0) favours fast positrons
    const fast = rand() * 2 < 1 + ASYM * Math.cos(theta);
    const y = fast ? 0.62 + rand() * 0.3 : 0.12 + rand() * 0.38;
    const re = R * y;
    const r0 = R + dr[i];
    const cx = (r0 - re) * Math.cos(phi);
    const cz = (r0 - re) * Math.sin(phi);
    const d = r0 - re;
    const cs = (R_DET * R_DET - d * d - re * re) / (2 * d * re);
    const sEnd = Math.acos(Math.max(-1, Math.min(1, cs)));
    const tr = tracks[trkNext];
    trkNext = (trkNext + 1) % N_TRK;
    const yy = dy[i];
    for (let k = 0; k < TRK_PTS; k++) {
      const s = (k / (TRK_PTS - 1)) * sEnd;
      tr.pos[k * 3] = cx + re * Math.cos(phi + s);
      tr.pos[k * 3 + 1] = yy;
      tr.pos[k * 3 + 2] = cz + re * Math.sin(phi + s);
    }
    (tr.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    tr.line.geometry.setDrawRange(0, 1);
    tr.mat.color.setHex(fast ? PALETTE.rose : PALETTE.violet);
    tr.mat.opacity = 1;
    tr.age = 0;
    tr.life = 0.25 + 0.35 * y;
    tr.active = true;
    tr.hit = false;
    tr.energy = y;
    const ex = tr.pos[(TRK_PTS - 1) * 3];
    const ez = tr.pos[(TRK_PTS - 1) * 3 + 2];
    let ang = Math.atan2(ez, ex);
    if (ang < 0) ang += Math.PI * 2;
    tr.station = Math.floor((ang / (Math.PI * 2)) * N_DET) % N_DET;
    tr.line.visible = true;
  }

  // --- Drawing the muons
  function drawMuons(): void {
    const th = wA * tFill; // spin angle relative to momentum (true scale on fill clock)
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const L = 1.05;
    const hl = 0.25;
    for (let i = 0; i < N_MU; i++) {
      const o6 = i * 18;
      const o2 = i * 6;
      if (!alive[i]) {
        for (let k = 0; k < 18; k++) spinPos[o6 + k] = 0;
        for (let k = 0; k < 6; k++) momPos[o2 + k] = 0;
        muPos[i * 3 + 1] = -100;
        continue;
      }
      const phi = phi0[i] + ORBIT_VIS * vRel[i] * tVis;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const r = R + dr[i] + 0.06 * Math.sin(betaPh[i] + tVis * 2.3);
      const x = r * cp;
      const z = r * sp;
      const y = dy[i] * Math.cos(betaPh[i] + tVis * 1.7);
      muPos[i * 3] = x; muPos[i * 3 + 1] = y; muPos[i * 3 + 2] = z;
      // tangent t = (-sin, cos), radial rhat = (cos, sin). Spin = cos(th) t - sin(th) rhat.
      const sx = ct * -sp - st * cp;
      const sz = ct * cp - st * sp;
      const tx = x + sx * L;
      const tz = z + sz * L;
      spinPos[o6] = x; spinPos[o6 + 1] = y; spinPos[o6 + 2] = z;
      spinPos[o6 + 3] = tx; spinPos[o6 + 4] = y; spinPos[o6 + 5] = tz;
      // arrow barbs
      const bx1 = tx - hl * (sx * 0.87 - sz * 0.5);
      const bz1 = tz - hl * (sz * 0.87 + sx * 0.5);
      const bx2 = tx - hl * (sx * 0.87 + sz * 0.5);
      const bz2 = tz - hl * (sz * 0.87 - sx * 0.5);
      spinPos[o6 + 6] = tx; spinPos[o6 + 7] = y; spinPos[o6 + 8] = tz;
      spinPos[o6 + 9] = bx1; spinPos[o6 + 10] = y; spinPos[o6 + 11] = bz1;
      spinPos[o6 + 12] = tx; spinPos[o6 + 13] = y; spinPos[o6 + 14] = tz;
      spinPos[o6 + 15] = bx2; spinPos[o6 + 16] = y; spinPos[o6 + 17] = bz2;
      momPos[o2] = x; momPos[o2 + 1] = y; momPos[o2 + 2] = z;
      momPos[o2 + 3] = x - sp * 0.6; momPos[o2 + 4] = y; momPos[o2 + 5] = z + cp * 0.6;
    }
    (muGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (spinGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (momGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Inset wiggle plot
  function drawInset(): void {
    const W = inset.width;
    const Hc = inset.height;
    ictx.clearRect(0, 0, W, Hc);
    const x0 = 16, x1 = W - 14, y0 = 74, y1 = Hc - 40;
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('wiggle plot: fast e⁺ counts', 16, 30);
    let max = 1;
    for (let i = 0; i < BINS; i++) if (hist[i] > max) max = hist[i];
    if (fit && fit.ok) max = Math.max(max, fit.N0 * (1 + fit.A));
    max *= 1.08;
    const xOf = (t: number) => x0 + (t / window_) * (x1 - x0);
    const yOf = (c: number) => y1 - (c / max) * (y1 - y0);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.beginPath();
    ictx.moveTo(x0, y1 + 0.5); ictx.lineTo(x1, y1 + 0.5);
    ictx.stroke();
    // data points
    ictx.fillStyle = css(PALETTE.cyan);
    const bw = Math.max(2, ((x1 - x0) / BINS) * 0.8);
    for (let i = 0; i < BINS; i++) {
      if (hist[i] <= 0) continue;
      const x = xOf((i + 0.5) * binW);
      ictx.fillRect(x - bw / 2, yOf(hist[i]) - 1.5, bw, 3);
    }
    // fit curve
    if (fit && fit.ok) {
      ictx.strokeStyle = css(PALETTE.amber);
      ictx.lineWidth = 2.5;
      ictx.beginPath();
      const steps = 520;
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * window_;
        const y = yOf(wiggle(t, fit.N0, fit.tau, fit.A, fit.omega, fit.phi));
        if (k === 0) ictx.moveTo(xOf(t), y); else ictx.lineTo(xOf(t), y);
      }
      ictx.stroke();
    }
    ictx.fillStyle = '#56627c';
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillText('0', x0, Hc - 12);
    const tl = `${window_.toFixed(0)} μs`;
    ictx.fillText(tl, x1 - ictx.measureText(tl).width, Hc - 12);
    ictx.fillText('time in fill', (x0 + x1) / 2 - 60, Hc - 12);
    ictx.font = '22px JetBrains Mono, monospace';
    if (fit && fit.ok) {
      ictx.fillStyle = css(PALETTE.amber);
      const txt = `fit ω_a = ${fit.omega.toFixed(4)} ± ${fit.sigmaOmega.toFixed(4)} rad/μs`;
      ictx.fillText(txt, 16, 60);
    } else {
      ictx.fillStyle = '#56627c';
      ictx.fillText(counted > 0 ? 'collecting decays…' : '', 16, 60);
    }
  }

  function runFit(): void {
    fit = fitWiggle(hist, binW);
    oscill = fit.ok ? visibleOscillations(fit, window_) : 0;
    if (fit.ok) {
      const err = fit.omega / wA - 1;
      if (Math.abs(err) < 0.02 && counted > 3000) {
        const prev = goodFits.length ? goodFits[goodFits.length - 1] : null;
        if (!prev || Math.abs(prev.B - B) > 1e-6) goodFits.push({ B, w: fit.omega });
        else prev.w = fit.omega;
        if (goodFits.length > 30) goodFits.shift();
        for (const g of goodFits) {
          const rb = B / g.B;
          if (Math.abs(rb - 2) < 0.05 || Math.abs(rb - 0.5) < 0.0125) {
            const rw = fit.omega / g.w;
            if (Math.abs(rw / rb - 1) < 0.03) bDoubled = true;
          }
        }
      }
    }
  }

  // --- Frame loop
  let clockTimer = 0;
  const tmpC = new THREE.Color();
  const camGoal = new THREE.Vector3();
  const tgtGoal = new THREE.Vector3();
  stage.onFrame((dt) => {
    if (playing) {
      tVis += dt;
      tFill += dt * FILL_RATE;
      // decays of drawn muons
      for (let i = 0; i < N_MU; i++) {
        if (alive[i] && tFill >= tDecay[i]) {
          alive[i] = 0;
          aliveCount--;
          const phi = phi0[i] + ORBIT_VIS * vRel[i] * tVis;
          emit(i, phi, wA * tFill);
        }
      }
      if (tFill > FILL_LEN) newFill();
      // histogram decays (many fills overlaid, as in the real experiment)
      pending += Math.pow(10, rateExp) * dt;
      const n = Math.floor(pending);
      if (n > 0) {
        pending -= n;
        counted += sampleDecays(rand, n, hist, binW, tauUs, ASYM, wA, 0);
        fitDirty = true;
      }
      fitTimer += dt;
      if (fitTimer > 0.4 && fitDirty) {
        fitTimer = 0;
        fitDirty = false;
        runFit();
        drawInset();
      }
      drawMuons();
    }
    if (view === 'close') {
      // ride alongside the bunch: camera outside and a little behind, looking at the muons
      const pc = INJ + ORBIT_VIS * tVis;
      const k = 1 - Math.exp(-dt * 3);
      camGoal.set((R + 3.4) * Math.cos(pc - 0.42), 3.1, (R + 3.4) * Math.sin(pc - 0.42));
      tgtGoal.set((R - 0.6) * Math.cos(pc + 0.08), -0.2, (R - 0.6) * Math.sin(pc + 0.08));
      stage.camera.position.lerp(camGoal, k);
      stage.controls.target.lerp(tgtGoal, k);
    }
    // tracks
    for (let k = 0; k < N_TRK; k++) {
      const tr = tracks[k];
      if (!tr.active) continue;
      tr.age += dt;
      const u = tr.age / tr.life;
      if (u < 1) {
        tr.line.geometry.setDrawRange(0, Math.max(2, Math.ceil(u * TRK_PTS)));
      } else {
        tr.line.geometry.setDrawRange(0, TRK_PTS);
        if (!tr.hit) {
          tr.hit = true;
          detFlash[tr.station] = Math.min(1.6, detFlash[tr.station] + 0.6 + tr.energy);
        }
        tr.mat.opacity = Math.max(0, 1 - (u - 1) * 1.2);
        if (tr.mat.opacity <= 0) { tr.active = false; tr.line.visible = false; }
      }
    }
    // calorimeters: flashes plus the aggregate rate, which pulses with the spin
    const agg = 0.28 * Math.exp(-tFill / tauUs) * (1 + ASYM * Math.cos(wA * tFill));
    for (let k = 0; k < N_DET; k++) {
      detFlash[k] *= Math.exp(-dt * 3.5);
      const v = Math.min(1, agg + detFlash[k]);
      tmpC.copy(detBase).lerp(detHot, v);
      detCol.copy(tmpC);
      dets.setColorAt(k, detCol);
    }
    if (dets.instanceColor) dets.instanceColor.needsUpdate = true;
    clockTimer += dt;
    if (clockTimer > 0.1) {
      clockTimer = 0;
      const turns = (wA * tFill) / (2 * Math.PI);
      clockEl.textContent = `fill clock ${tFill.toFixed(1)} μs · spin turns ${turns.toFixed(2)}`;
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Clear plot', onClick: () => { touched = true; clearHist(); drawInset(); } },
    { label: 'New fill', onClick: () => { touched = true; newFill(); } },
  ]);
  ui.slider({
    key: 'rate', label: 'Decays per second', min: 2, max: 4.7, step: 0.05, value: rateExp,
    format: (v) => { const n = Math.pow(10, v); const m = Math.pow(10, Math.floor(Math.log10(n)) - 1); return (Math.round(n / m) * m).toLocaleString('en-US'); },
    onInput: (v) => { rateExp = v; touched = true; },
  });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'ring',
    options: [{ value: 'ring', label: 'Whole ring' }, { value: 'close', label: 'Ride along' }],
    onChange: (v) => {
      view = v;
      if (v === 'ring') stage.flyTo([0, 8.6, 17.5], [0, 0.9, 0.4]);
    },
  });

  ui.section('Storage ring');
  ui.slider({ key: 'B', label: 'Magnetic field B', min: 0.4, max: 3, step: 0.01, value: B, unit: 'T', format: (v) => v.toFixed(2), onInput: (v) => { B = v; paramsChanged(); } });
  const pCtl = ui.slider({ key: 'p', label: 'Muon momentum p', min: 1, max: 5, step: 0.002, value: pGeV, unit: 'GeV/c', format: (v) => v.toFixed(3), onInput: (v) => { pGeV = v; paramsChanged(); } });
  // magic-momentum tick under the slider track
  const pInput = pCtl.el.querySelector('input') as HTMLInputElement;
  const tickWrap = document.createElement('div');
  Object.assign(tickWrap.style, { position: 'relative', height: '14px', margin: '0 8px' } as CSSStyleDeclaration);
  const tick = document.createElement('div');
  Object.assign(tick.style, {
    position: 'absolute', top: '0', transform: 'translateX(-50%)', font: '10px JetBrains Mono, monospace',
    color: css(PALETTE.amber), whiteSpace: 'nowrap', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  tickWrap.appendChild(tick);
  pInput.insertAdjacentElement('afterend', tickWrap);
  function placeTick(): void {
    const pm = magicMomentum(a);
    const f = (pm - 1) / (5 - 1);
    tick.style.left = `${Math.max(0, Math.min(100, f * 100))}%`;
    tick.textContent = f >= 0 && f <= 1 ? `▲ magic ${pm.toFixed(3)}` : `magic ${pm.toFixed(2)} (off scale)`;
  }
  ui.slider({
    key: 'a', label: 'Anomaly a_μ (hypothetical)', min: 0.0005, max: 0.005, step: 0.00001, value: a,
    format: (v) => (Math.abs(v - A_MU_FNAL) < 5e-6 ? `${v.toFixed(6)} (real)` : v.toFixed(5)),
    onInput: (v) => { a = Math.abs(v - A_MU_FNAL) < 5e-6 ? A_MU_FNAL : v; placeTick(); paramsChanged(); },
  });
  ui.note('The real anomaly is 0.00116592. Other values are hypothetical, to show that a bigger anomaly makes a faster wiggle.');

  ui.section('Live readouts');
  const rW = ui.readout('omegaA', 'input ω_a', 'rad/μs');
  const rFa = ui.readout('fa', 'f_a = ω_a/2π', 'kHz');
  const rG = ui.readout('gamma', 'Lorentz γ');
  const rTau = ui.readout('tau', 'lifetime γτ', 'μs');
  const rFc = ui.readout('fc', 'lap rate f_c', 'MHz');
  const rRat = ui.readout('ratio', 'laps per spin turn');
  const rE = ui.readout('eterm', 'E-term (100 kV/m)', 'ppm');
  const rRad = ui.readout('radius', 'orbit p/eB (ring 7.11)', 'm');
  ui.section('Wiggle fit');
  const rN = ui.readout('counts', 'positrons counted');
  const rFit = ui.readout('fitW', 'fit ω_a', 'rad/μs');
  const rErr = ui.readout('fitErr', 'fit − input');
  const rSig = ui.readout('sigma', 'fit σ(ω_a)');
  const rOsc = ui.readout('osc', 'oscillations above noise');
  const rChi = ui.readout('chi2', 'χ²/ndf');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'counts per bin' },
    { color: css(PALETTE.amber), label: '5-parameter fit' },
  ]);

  function updateReadouts(): void {
    rW(wA.toFixed(4));
    rFa((wA * 1e3 / (2 * Math.PI)).toFixed(1));
    rG(gamma.toFixed(2));
    rTau(tauUs.toFixed(1));
    rFc((omegaC(B, gamma) / (2 * Math.PI) / 1e6).toFixed(2));
    rRat((1 / (a * gamma)).toFixed(1));
    const eRel = (eFieldCoefficient(a, gamma) * betaFromGamma(gamma) * (E_ILLUS / C_LIGHT)) / (a * B);
    rE(Math.abs(eRel * 1e6) < 0.05 ? '0.0' : (eRel * 1e6).toFixed(1));
    rRad(orbitRadius(pGeV, B).toFixed(2));
    rN(counted.toLocaleString('en-US'));
    if (fit && fit.ok) {
      rFit(fit.omega.toFixed(4));
      rErr(`${((fit.omega / wA - 1) * 100).toFixed(2)} %`);
      rSig(`${((fit.sigmaOmega / fit.omega) * 100).toFixed(2)} %`);
      rOsc(oscill.toFixed(1));
      rChi(fit.chi2ndf.toFixed(2));
    } else {
      rFit('…'); rErr('…'); rSig('…'); rOsc('0'); rChi('…');
    }
  }

  derive();
  placeTick();
  updateNote();
  newFill();
  drawMuons();
  drawInset();
  updateReadouts();

  return {
    state: () => ({
      B, p: pGeV, a, gamma, touched, playing,
      pMagic: magicMomentum(a),
      magicOff: pGeV / magicMomentum(a) - 1,
      omegaA: wA,
      fitOk: !!(fit && fit.ok),
      fitOmega: fit && fit.ok ? fit.omega : 0,
      fitErr: fit && fit.ok ? fit.omega / wA - 1 : 1,
      oscillations: oscill,
      counts: counted,
      bDoubled,
      tFill,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      tickWrap.remove();
      glowTex.dispose();
      shaftGeo.dispose();
      headGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'muon-g2',
  number: 70,
  title: 'Muon g−2',
  domain: 'particle',
  level: 3,
  status: 'live',
  tagline: 'A wobbling muon that tests everything we know about the vacuum.',
  content,
  mount,
};

export default topic;
