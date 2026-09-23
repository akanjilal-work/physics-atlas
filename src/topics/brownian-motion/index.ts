import * as THREE from 'three';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  KB, NA, KICK_SLOTS, Rng, avogadroFromD, createMicro, initMicro, langevinStep, logSlope, makeCoeffs, meanSq,
  memoryTime, microGasKE, microGrainKE, microStep, msdOrnstein, ouCoeffs, sphereMass, stokesGamma, thermalVelocities,
} from './physics.ts';

type View = 'micro' | 'macro' | 'perrin';

/** Grain density (kg/m³), like a polystyrene bead. */
const RHO = 1050;
/** Macro simulated seconds per real second at 1× speed. */
const RATE = 4;
const MAXG = 200;
const MAX_MOL = 2000;
const TRAIL_CAP = 220;
const PERRIN_DT = 30;
const PERRIN_CAP = 80;
/** Perrin polylines are drawn for this many grains. Every grain counts in the estimate. */
const PERRIN_DRAWN = 12;
const NS = 700;
const SAMPLES_PER_DECADE = 20;
/** Micro model: fixed time step, box half-width, molecule radius. */
const MH = 1 / 240;
const MICRO_L = 6;
const R_MOL = 0.12;
const SPARK_N = 300;
const GRAIN_COLORS = [PALETTE.amber, PALETTE.cyan, PALETTE.rose, PALETTE.green, PALETTE.violet];

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

function fmtTime(t: number): string {
  if (t < 1e-6) return `${(t * 1e9).toPrecision(2)} ns`;
  if (t < 1e-3) return `${(t * 1e6).toPrecision(2)} μs`;
  if (t < 1) return `${(t * 1e3).toPrecision(2)} ms`;
  return `${t < 10 ? t.toFixed(1) : t.toFixed(0)} s`;
}

function fmtSci(x: number, d = 2): string {
  if (!Number.isFinite(x) || x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${m.toFixed(d)}×10${String(e).replace(/-/g, '⁻').replace(/\d/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])}`;
}

function makeInset(w: number, h: number, pos: Partial<CSSStyleDeclaration>, cls = ''): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  if (cls) c.className = cls;
  Object.assign(c.style, {
    position: 'absolute', width: `${w}px`, height: `${h}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    ...pos,
  } as CSSStyleDeclaration);
  return c;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: Record<View, { p: [number, number, number]; t: [number, number, number] }> = {
    micro: { p: [0, 4.5, 16.5], t: [0, -0.4, 0] },
    macro: { p: [0, 13, 36], t: [0, 0, 0] },
    perrin: { p: [0, 46, 0.01], t: [0, 0, 0] },
  };
  const stage = createStage(viewport, { camera: CAM.micro.p, target: CAM.micro.t, fov: 45, far: 1000 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'micro';
  let T = 293;
  let etaMPa = 1.0;
  let aUm = 0.5;
  let nGrains = 50;
  let nMol = 700;
  let speed = 1;
  let probeExp = -7;
  let playing = true;

  const glowTex = glowTexture();
  const rng = new Rng(20260923);

  // =====================================================================
  // Micro view: a heavy grain in a gas of molecules
  const microGroup = new THREE.Group();
  scene.add(microGroup);
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * MICRO_L, 2 * MICRO_L, 2 * MICRO_L)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.8 }),
  );
  microGroup.add(box);

  const molPos = new Float32Array(MAX_MOL * 3);
  const molGeo = new THREE.BufferGeometry();
  molGeo.setAttribute('position', new THREE.BufferAttribute(molPos, 3).setUsage(THREE.DynamicDrawUsage));
  const mols = new THREE.Points(molGeo, new THREE.PointsMaterial({
    color: PALETTE.cyan, size: 0.42, map: glowTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  mols.frustumCulled = false;
  microGroup.add(mols);

  const grainHolder = new THREE.Object3D();
  microGroup.add(grainHolder);
  const grainMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.45, roughness: 0.45, metalness: 0.05 }),
  );
  grainHolder.add(grainMesh);
  const grainGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  grainHolder.add(grainGlow);
  const grainLabel = stage.label('grain', [0, 1.6, 0], 'muted', grainHolder);
  stage.label('molecules (not to scale)', [-MICRO_L + 2.6, -MICRO_L - 0.7, MICRO_L], 'muted', microGroup);
  const microTrail = new Trail(1400, PALETTE.amber, 0.9);
  microGroup.add(microTrail.line);

  // Kick flashes on the grain surface
  const kickPos = new Float32Array(KICK_SLOTS * 3);
  const kickCol = new Float32Array(KICK_SLOTS * 3);
  const kickLevel = new Float32Array(KICK_SLOTS);
  const kickGeo = new THREE.BufferGeometry();
  kickGeo.setAttribute('position', new THREE.BufferAttribute(kickPos, 3).setUsage(THREE.DynamicDrawUsage));
  kickGeo.setAttribute('color', new THREE.BufferAttribute(kickCol, 3).setUsage(THREE.DynamicDrawUsage));
  const kicks = new THREE.Points(kickGeo, new THREE.PointsMaterial({
    size: 1.8, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  kicks.frustumCulled = false;
  microGroup.add(kicks);
  const kickColor = new THREE.Color(PALETTE.white);

  const micro = createMicro(MAX_MOL);
  let microT = 0;
  let microKT = 4;
  let lastKickTotal = 0;
  let kickRate = 0;
  let sumGrainKE = 0;
  let sumMolKE = 0;
  let microSamples = 0;
  const sparkV = new Float32Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;

  function resetMicro(): void {
    microKT = 4 * (T / 293);
    const R = 1.0 + 0.5 * aUm;
    const M = 6 * R ** 3;
    initMicro(micro, nMol, microKT, R, M, R_MOL, rng);
    grainMesh.scale.setScalar(R);
    grainGlow.scale.setScalar(R * 3.4);
    grainLabel.position.set(0, R + 0.5, 0);
    microTrail.clear();
    microT = 0;
    lastKickTotal = 0;
    kickRate = 0;
    sumGrainKE = 0;
    sumMolKE = 0;
    microSamples = 0;
    kickLevel.fill(0);
    sparkHead = 0;
    sparkCount = 0;
    molGeo.setDrawRange(0, nMol);
    drawMicro(0);
  }

  function drawMicro(dt: number): void {
    const n = micro.n;
    for (let j = 0; j < 3 * n; j++) molPos[j] = micro.pos[j];
    (molGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    grainHolder.position.set(micro.G[0], micro.G[1], micro.G[2]);
    // New kicks light up their slot, older ones fade.
    const fresh = Math.min(KICK_SLOTS, micro.kickTotal - lastKickTotal);
    const Jref = 2.2 * Math.sqrt(microKT);
    for (let k = 1; k <= fresh; k++) {
      const s = (micro.kickHead - k + KICK_SLOTS) % KICK_SLOTS;
      kickLevel[s] = Math.min(1.6, 0.6 + micro.kickJ[s] / Jref);
    }
    lastKickTotal = micro.kickTotal;
    const fade = Math.exp(-dt * 3);
    const R = micro.R;
    for (let s = 0; s < KICK_SLOTS; s++) {
      kickLevel[s] *= fade;
      kickPos[3 * s] = micro.G[0] + micro.kickN[3 * s] * R;
      kickPos[3 * s + 1] = micro.G[1] + micro.kickN[3 * s + 1] * R;
      kickPos[3 * s + 2] = micro.G[2] + micro.kickN[3 * s + 2] * R;
      const l = kickLevel[s];
      kickCol[3 * s] = kickColor.r * l;
      kickCol[3 * s + 1] = kickColor.g * l;
      kickCol[3 * s + 2] = kickColor.b * l;
    }
    (kickGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (kickGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function stepMicro(dt: number): void {
    const want = dt * speed;
    const steps = Math.min(40, Math.max(1, Math.round(want / MH)));
    const k0 = micro.kickTotal;
    for (let i = 0; i < steps; i++) microStep(micro, MH);
    const simDt = steps * MH;
    microT += simDt;
    const rateNow = (micro.kickTotal - k0) / simDt;
    kickRate += (rateNow - kickRate) * Math.min(1, simDt / 3);
    sumGrainKE += microGrainKE(micro) * simDt;
    sumMolKE += (microGasKE(micro) / micro.n) * simDt;
    microSamples++;
    microTrail.push(micro.G[0], micro.G[1], micro.G[2]);
    sparkV[sparkHead] = micro.V[0];
    sparkHead = (sparkHead + 1) % SPARK_N;
    sparkCount = Math.min(SPARK_N, sparkCount + 1);
  }

  // =====================================================================
  // Macro view: many grains doing Langevin random walks (units: μm, s)
  const macroGroup = new THREE.Group();
  scene.add(macroGroup);
  const grid = makeGrid(80, 16); // 5 μm squares
  grid.position.y = -14;
  macroGroup.add(grid);
  const gridLabel = stage.label('grid squares: 5 μm', [30, -14, 38], 'muted', macroGroup);

  const grainInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05, emissive: 0x222222 }),
    MAXG,
  );
  grainInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grainInst.frustumCulled = false;
  macroGroup.add(grainInst);
  const gGlowPos = new Float32Array(MAXG * 3);
  const gGlowCol = new Float32Array(MAXG * 3);
  const gGlowGeo = new THREE.BufferGeometry();
  gGlowGeo.setAttribute('position', new THREE.BufferAttribute(gGlowPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGlowGeo.setAttribute('color', new THREE.BufferAttribute(gGlowCol, 3));
  const gGlow = new THREE.Points(gGlowGeo, new THREE.PointsMaterial({
    size: 2.6, map: glowTex, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  gGlow.frustumCulled = false;
  macroGroup.add(gGlow);

  const trailGroup = new THREE.Group();
  macroGroup.add(trailGroup);
  const perrinGroup = new THREE.Group();
  macroGroup.add(perrinGroup);
  const trails: Trail[] = [];
  const pTrails: Trail[] = [];

  // Sphere of radius sqrt(<r²>) ≈ sqrt(6Dt)
  const sphereGroup = new THREE.Group();
  macroGroup.add(sphereGroup);
  sphereGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.07, depthWrite: false }),
  ));
  const ringPts: number[] = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ringPts.push(Math.cos(a), 0, Math.sin(a));
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
  const ringMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.75 });
  for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2]]) {
    const r = new THREE.LineLoop(ringGeo, ringMat);
    r.rotation.set(rot[0], rot[1], rot[2]);
    sphereGroup.add(r);
  }
  stage.label('√⟨r²⟩ = √(6Dt)', [0, 1.08, 0], '', sphereGroup);
  const originMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: PALETTE.white }));
  macroGroup.add(originMark);

  const pos = new Float64Array(3 * MAXG);
  const vel = new Float64Array(3 * MAXG);
  const perrinLast = new Float64Array(3 * MAXG);
  const sampT = new Float64Array(NS);
  const sampY = new Float64Array(NS);
  const coeffs = makeCoeffs();
  let sampN = 0;
  let nextSample = 0;
  let t = 0;
  let tau = 1;
  let kTm = 1; // μm²/s²
  let Dth = 1; // μm²/s
  let msdNow = 0;
  let perrinSum = 0;
  let perrinN = 0;
  let nextPerrin = PERRIN_DT;
  let xlo = 1e-10;
  const xhi = 1e3;
  let ref: null | { T: number; eta: number; a: number; D: number } = null;
  const grainColor = new THREE.Color();
  let prevT = T;
  let prevEta = etaMPa;
  let prevA = aUm;

  function derived(): void {
    const aSI = aUm * 1e-6;
    const etaSI = etaMPa * 1e-3;
    const m = sphereMass(aSI, RHO);
    tau = memoryTime(aSI, RHO, etaSI);
    kTm = ((KB * T) / m) * 1e12;
    Dth = ((KB * T) / stokesGamma(etaSI, aSI)) * 1e12;
  }

  function measuredD(): number {
    return t > 0 ? msdNow / (6 * (t - tau * (1 - Math.exp(-t / tau)))) : 0;
  }

  function buildTrails(): void {
    for (const tr of trails) {
      trailGroup.remove(tr.line);
      tr.line.geometry.dispose();
      (tr.line.material as THREE.Material).dispose();
    }
    for (const tr of pTrails) {
      perrinGroup.remove(tr.line);
      tr.line.geometry.dispose();
      (tr.line.material as THREE.Material).dispose();
    }
    trails.length = 0;
    pTrails.length = 0;
    for (let i = 0; i < nGrains; i++) {
      const c = GRAIN_COLORS[i % GRAIN_COLORS.length];
      const tr = new Trail(TRAIL_CAP, c, 0.55);
      trails.push(tr);
      trailGroup.add(tr.line);
      if (i < PERRIN_DRAWN) {
        const pt = new Trail(PERRIN_CAP, c, 0.95);
        pTrails.push(pt);
        perrinGroup.add(pt.line);
      }
      grainColor.set(c);
      grainInst.setColorAt(i, grainColor);
      gGlowCol[3 * i] = grainColor.r;
      gGlowCol[3 * i + 1] = grainColor.g;
      gGlowCol[3 * i + 2] = grainColor.b;
    }
    if (grainInst.instanceColor) grainInst.instanceColor.needsUpdate = true;
    (gGlowGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    grainInst.count = nGrains;
    gGlowGeo.setDrawRange(0, nGrains);
  }
  let builtFor = -1;

  function resetMacro(): void {
    // Keep the last long run as a reference for the "twice as hot" challenge.
    if (t >= 2 && builtFor === nGrains) ref = { T: prevT, eta: prevEta, a: prevA, D: measuredD() };
    derived();
    prevT = T;
    prevEta = etaMPa;
    prevA = aUm;
    if (builtFor !== nGrains) {
      buildTrails();
      builtFor = nGrains;
    }
    pos.fill(0);
    thermalVelocities(vel, nGrains, kTm, rng);
    perrinLast.fill(0);
    t = 0;
    sampN = 0;
    nextSample = 0;
    msdNow = 0;
    perrinSum = 0;
    perrinN = 0;
    nextPerrin = PERRIN_DT;
    xlo = 10 ** Math.floor(Math.log10(tau / 100));
    for (const tr of trails) tr.clear();
    for (const tr of pTrails) {
      tr.clear();
      tr.push(0, 0, 0);
    }
    drawMacro();
  }
  function perrinSample(): void {
    for (let i = 0; i < nGrains; i++) {
      const b = 3 * i;
      const dx = pos[b] - perrinLast[b];
      const dz = pos[b + 2] - perrinLast[b + 2];
      perrinSum += dx * dx + dz * dz;
      perrinN++;
      perrinLast[b] = pos[b];
      perrinLast[b + 1] = pos[b + 1];
      perrinLast[b + 2] = pos[b + 2];
      if (i < pTrails.length) pTrails[i].push(pos[b], 0, pos[b + 2]);
    }
    nextPerrin += PERRIN_DT;
  }

  function stepMacro(dt: number): void {
    const tTarget = t + dt * speed * RATE;
    const hmin = tau / 100;
    let steps = 0;
    while (tTarget - t > 1e-12 * tTarget && steps < 5000) {
      let h = Math.max(hmin, 0.05 * t);
      h = Math.min(h, tTarget - t, nextPerrin - t);
      if (h <= 0) h = hmin;
      ouCoeffs(h, tau, kTm, coeffs);
      langevinStep(pos, vel, nGrains, coeffs, rng);
      t += h;
      steps++;
      if (t >= nextPerrin - 1e-9) perrinSample();
      if (t >= nextSample && sampN < NS) {
        sampT[sampN] = t;
        sampY[sampN] = meanSq(pos, nGrains);
        sampN++;
        nextSample = t * 10 ** (1 / SAMPLES_PER_DECADE);
      }
    }
    msdNow = meanSq(pos, nGrains);
  }

  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();
  function drawMacro(): void {
    const r = Math.max(aUm, 0.3);
    vs.setScalar(r);
    for (let i = 0; i < nGrains; i++) {
      const b = 3 * i;
      vp.set(pos[b], pos[b + 1], pos[b + 2]);
      m4.compose(vp, qI, vs);
      grainInst.setMatrixAt(i, m4);
      gGlowPos[b] = pos[b];
      gGlowPos[b + 1] = pos[b + 1];
      gGlowPos[b + 2] = pos[b + 2];
    }
    grainInst.instanceMatrix.needsUpdate = true;
    (gGlowGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const R = Math.sqrt(msdOrnstein(t, tau, kTm));
    sphereGroup.scale.setScalar(Math.max(1e-3, R));
    sphereGroup.visible = view === 'macro' && R > 0.4;
  }

  // =====================================================================
  // Overlays
  const caption = document.createElement('div');
  caption.className = 'stage-overlay';
  Object.assign(caption.style, {
    position: 'absolute', left: '12px', top: '10px', maxWidth: 'calc(100% - 340px)', zIndex: '2', pointerEvents: 'none',
    font: '500 13px/1.4 var(--sans, system-ui)', color: '#b8c3d8', textShadow: '0 1px 3px #070a12',
  } as CSSStyleDeclaration);
  viewport.appendChild(caption);

  const msdCv = makeInset(300, 170, { right: '10px', top: '10px' });
  viewport.appendChild(msdCv);
  const mctx = msdCv.getContext('2d')!;
  const histCv = makeInset(190, 104, { right: '10px', bottom: '10px' }, 'stage-overlay');
  viewport.appendChild(histCv);
  const hctx = histCv.getContext('2d')!;
  const sparkCv = makeInset(250, 110, { right: '10px', top: '10px' });
  viewport.appendChild(sparkCv);
  const sctx = sparkCv.getContext('2d')!;
  const hist = new Float64Array(16);

  function slopeAtProbe(): number {
    const tp = 10 ** probeExp;
    if (t < tp * Math.sqrt(10)) return NaN; // need the window [tp/√10, tp·√10]
    return logSlope(sampT, sampY, sampN, tp / Math.sqrt(10), tp * Math.sqrt(10));
  }

  function drawMsd(): void {
    const W = msdCv.width;
    const H = msdCv.height;
    const L = 60;
    const Rr = 14;
    const Tp = 40;
    const B = 40;
    mctx.clearRect(0, 0, W, H);
    const ylo = msdOrnstein(xlo, tau, kTm) / 3;
    const yhi = msdOrnstein(xhi, tau, kTm) * 3;
    const lx0 = Math.log10(xlo);
    const lx1 = Math.log10(xhi);
    const ly0 = Math.log10(ylo);
    const ly1 = Math.log10(yhi);
    const X = (tt: number) => L + ((Math.log10(tt) - lx0) / (lx1 - lx0)) * (W - L - Rr);
    const Y = (y: number) => H - B - ((Math.log10(y) - ly0) / (ly1 - ly0)) * (H - B - Tp);
    mctx.font = '20px JetBrains Mono, monospace';
    mctx.fillStyle = '#8391ab';
    mctx.fillText('⟨r²⟩ vs t  (log–log)', 14, 28);
    // decade grid
    mctx.strokeStyle = '#1c2436';
    mctx.lineWidth = 1;
    for (let e = Math.ceil(lx0); e <= lx1; e++) {
      const x = X(10 ** e);
      mctx.beginPath();
      mctx.moveTo(x, Tp);
      mctx.lineTo(x, H - B);
      mctx.stroke();
    }
    mctx.fillStyle = '#56627c';
    mctx.font = '17px JetBrains Mono, monospace';
    for (const [e, lab] of [[-9, '1ns'], [-6, '1μs'], [-3, '1ms'], [0, '1s']] as const) {
      if (e < lx0 || e > lx1) continue;
      const x = X(10 ** e);
      mctx.fillText(lab, x - 16, H - B + 22);
    }
    mctx.fillText('t', W - 26, H - B + 22);
    mctx.save();
    mctx.translate(22, H / 2 + 30);
    mctx.rotate(-Math.PI / 2);
    mctx.fillText('⟨r²⟩ (μm²)', 0, 0);
    mctx.restore();
    // tau marker
    const xt = X(tau);
    mctx.setLineDash([6, 6]);
    mctx.strokeStyle = '#8391ab';
    mctx.beginPath();
    mctx.moveTo(xt, Tp);
    mctx.lineTo(xt, H - B);
    mctx.stroke();
    mctx.fillStyle = '#9aa6bd';
    mctx.fillText('m/γ', xt + 5, Tp + 16);
    // theory curve (Ornstein)
    mctx.strokeStyle = '#a78bfa';
    mctx.lineWidth = 2;
    mctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const tt = 10 ** (lx0 + ((lx1 - lx0) * i) / 120);
      const x = X(tt);
      const y = Y(msdOrnstein(tt, tau, kTm));
      if (i === 0) mctx.moveTo(x, y);
      else mctx.lineTo(x, y);
    }
    mctx.stroke();
    mctx.setLineDash([]);
    // slope labels
    mctx.fillStyle = '#a78bfa';
    const ts2 = tau / 20;
    if (ts2 > xlo * 3) mctx.fillText('slope 2', X(ts2) - 10, Y(msdOrnstein(ts2, tau, kTm)) - 16);
    mctx.fillText('slope 1', X(tau * 1e5), Y(msdOrnstein(tau * 1e5, tau, kTm)) + 34);
    // measured points
    mctx.fillStyle = '#4fd1e8';
    for (let i = 0; i < sampN; i++) {
      const x = X(sampT[i]);
      if (x > W - Rr) break;
      mctx.fillRect(x - 2.5, Y(sampY[i]) - 2.5, 5, 5);
    }
    // probe
    const tp = 10 ** probeExp;
    const xp = X(tp);
    mctx.strokeStyle = '#f5b642';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(xp, Tp);
    mctx.lineTo(xp, H - B);
    mctx.stroke();
    const s = slopeAtProbe();
    mctx.fillStyle = '#f5b642';
    mctx.font = '600 19px JetBrains Mono, monospace';
    const txt = Number.isFinite(s) ? `slope ${s.toFixed(2)}` : 'slope …';
    const tw = mctx.measureText(txt).width;
    mctx.fillText(txt, Math.min(W - tw - 8, Math.max(L, xp + 6)), H - B - 8);
  }

  function drawHist(): void {
    const W = histCv.width;
    const H = histCv.height;
    hctx.clearRect(0, 0, W, H);
    hctx.font = '19px JetBrains Mono, monospace';
    hctx.fillStyle = '#8391ab';
    hctx.fillText('x,y,z steps vs Gaussian', 14, 26);
    if (t <= 0) return;
    const sig = Math.sqrt(msdOrnstein(t, tau, kTm) / 3);
    hist.fill(0);
    const nb = hist.length;
    for (let j = 0; j < 3 * nGrains; j++) {
      const z = pos[j] / sig;
      const k = Math.floor((z + 4) * 2);
      if (k >= 0 && k < nb) hist[k]++;
    }
    const total = 3 * nGrains;
    const peak = total * 0.5 * 0.3989;
    const x0 = 12;
    const bw = (W - 24) / nb;
    const base = H - 12;
    const sc = (H - 50) / (peak * 1.35);
    hctx.fillStyle = 'rgba(79,209,232,0.75)';
    for (let k = 0; k < nb; k++) {
      const h = hist[k] * sc;
      hctx.fillRect(x0 + k * bw + 1, base - h, bw - 2, h);
    }
    hctx.strokeStyle = '#f5b642';
    hctx.lineWidth = 2.5;
    hctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const z = -4 + (8 * i) / 80;
      const y = total * 0.5 * Math.exp(-0.5 * z * z) * 0.3989;
      const x = x0 + ((z + 4) / 8) * nb * bw;
      if (i === 0) hctx.moveTo(x, base - y * sc);
      else hctx.lineTo(x, base - y * sc);
    }
    hctx.stroke();
  }

  function drawSpark(): void {
    const W = sparkCv.width;
    const H = sparkCv.height;
    sctx.clearRect(0, 0, W, H);
    sctx.font = '20px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText('grain velocity vₓ: one jump per kick', 14, 28);
    const sd = Math.sqrt(microKT / micro.M);
    const mid = (H + 30) / 2;
    const sc = (H - 50) / (2 * 3 * sd);
    sctx.strokeStyle = '#243049';
    sctx.setLineDash([6, 6]);
    for (const k of [-1, 1]) {
      sctx.beginPath();
      sctx.moveTo(10, mid - k * sd * sc);
      sctx.lineTo(W - 10, mid - k * sd * sc);
      sctx.stroke();
    }
    sctx.setLineDash([]);
    sctx.fillStyle = '#56627c';
    sctx.font = '17px JetBrains Mono, monospace';
    sctx.fillText('±√(kT/M)', W - 104, mid - sd * sc - 6);
    if (sparkCount < 2) return;
    sctx.strokeStyle = '#f5b642';
    sctx.lineWidth = 2.5;
    sctx.beginPath();
    for (let i = 0; i < sparkCount; i++) {
      const v = sparkV[(sparkHead - sparkCount + i + SPARK_N) % SPARK_N];
      const x = 10 + (i / (SPARK_N - 1)) * (W - 20);
      const y = Math.max(34, Math.min(H - 6, mid - v * sc));
      if (i === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    }
    sctx.stroke();
  }

  function applyView(): void {
    microGroup.visible = view === 'micro';
    macroGroup.visible = view !== 'micro';
    trailGroup.visible = view === 'macro';
    perrinGroup.visible = view === 'perrin';
    originMark.visible = view === 'macro';
    grid.visible = true;
    gridLabel.visible = view !== 'micro';
    msdCv.style.display = view === 'micro' ? 'none' : 'block';
    histCv.style.display = view === 'macro' ? '' : 'none';
    sparkCv.style.display = view === 'micro' ? 'block' : 'none';
    grid.position.y = view === 'perrin' ? -2 : -14;
    caption.textContent =
      view === 'micro'
        ? 'Micro view (cartoon units). A heavy grain in a gas of fast molecules. Each white flash is one collision, one kick.'
        : view === 'macro'
          ? `Macro view. ${nGrains} grains of radius ${aUm.toFixed(2)} μm start at one point. The violet sphere has radius √(6Dt).`
          : `Perrin view, from above. ${PERRIN_DRAWN} grains are marked every 30 s and the marks joined by straight lines, as in Perrin’s drawings. All ${nGrains} grains feed the estimate.`;
    drawMacro();
  }

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => { resetMicro(); resetMacro(); } },
  ]);
  ui.slider({
    key: 'speed', label: 'Sim speed', min: -1, max: 1.7, step: 0.05, value: 0,
    format: (v) => `${(10 ** v).toFixed(10 ** v < 1 ? 2 : 1)}×`, onInput: (v) => (speed = 10 ** v),
  });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'micro', label: 'Micro' }, { value: 'macro', label: 'Macro' }, { value: 'perrin', label: 'Perrin' }],
    onChange: (v) => { view = v; applyView(); stage.flyTo(CAM[v].p, CAM[v].t); },
  });

  ui.section('Bath and grain (resets)');
  ui.slider({ key: 'T', label: 'Temperature T', min: 150, max: 600, step: 1, value: T, unit: 'K', onInput: (v) => { T = v; resetMicro(); resetMacro(); } });
  ui.slider({ key: 'eta', label: 'Viscosity η', min: 0.5, max: 10, step: 0.1, value: etaMPa, unit: 'mPa·s', format: (v) => v.toFixed(1), onInput: (v) => { etaMPa = v; resetMacro(); } });
  ui.slider({ key: 'a', label: 'Grain radius a', min: 0.2, max: 2, step: 0.05, value: aUm, unit: 'μm', format: (v) => v.toFixed(2), onInput: (v) => { aUm = v; resetMicro(); resetMacro(); applyView(); } });
  ui.slider({ key: 'molecules', label: 'Molecules (micro)', min: 100, max: MAX_MOL, step: 50, value: nMol, onInput: (v) => { nMol = v; resetMicro(); } });
  ui.slider({ key: 'grains', label: 'Grains (macro)', min: 10, max: MAXG, step: 5, value: nGrains, onInput: (v) => { nGrains = v; resetMacro(); applyView(); } });

  ui.section('Measure');
  ui.slider({ key: 'probe', label: 'Slope probe time', min: -10, max: 2, step: 0.1, value: probeExp, format: (v) => fmtTime(10 ** v), onInput: (v) => { probeExp = v; } });
  const rT = ui.readout('t', 'time t');
  const rMsd = ui.readout('msd', '⟨r²⟩', 'μm²');
  const rD = ui.readout('D', 'D Stokes–Einstein', 'μm²/s');
  const rDm = ui.readout('Dmeas', 'D measured', 'μm²/s');
  const rTau = ui.readout('tau', 'memory m/γ');
  const rSlope = ui.readout('slope', 'slope at probe');
  const rEq = ui.readout('equip', '⟨v²⟩ ÷ 3kT/m');
  const rRatio = ui.readout('dRatio', 'D ÷ D before');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'measured ⟨r²⟩' },
    { color: css(PALETTE.violet), label: 'Ornstein theory' },
    { color: css(PALETTE.amber), label: 'probe' },
  ]);

  ui.section('Perrin estimate (teaching reconstruction)');
  const rPN = ui.readout('perrinN', '30 s steps');
  const rNA = ui.readout('NA', 'N_A estimate', '/mol');
  const rNAr = ui.readout('NAratio', '÷ true N_A');
  ui.note('Uses N_A = RT / (6πηa D) with D from the 2D steps. Approximate, and noisy with few steps.');

  ui.section('Micro view');
  const rKick = ui.readout('kicks', 'kicks per unit time');
  const rMEq = ui.readout('microEquip', 'grain KE ÷ molecule KE');

  function perrinD(): number {
    return perrinN > 0 ? perrinSum / (4 * perrinN * PERRIN_DT) : 0;
  }
  function perrinNA(): number {
    const d = perrinD();
    return d > 0 ? avogadroFromD(T, etaMPa * 1e-3, aUm * 1e-6, d * 1e-12) : 0;
  }
  function refSame(): boolean {
    return ref !== null && ref.eta === etaMPa && ref.a === aUm;
  }

  function updateReadouts(): void {
    rT(fmtTime(t));
    rMsd(msdNow < 0.01 ? fmtSci(msdNow, 1) : msdNow.toFixed(2));
    rD(Dth.toFixed(3));
    const dm = measuredD();
    rDm(t >= 2 ? dm.toFixed(3) : '…');
    rTau(fmtTime(tau));
    const s = slopeAtProbe();
    rSlope(Number.isFinite(s) ? s.toFixed(2) : '…');
    let v2 = 0;
    for (let j = 0; j < 3 * nGrains; j++) v2 += vel[j] * vel[j];
    rEq((v2 / nGrains / (3 * kTm)).toFixed(2));
    rRatio(refSame() && t >= 2 && ref ? `${(dm / ref.D).toFixed(2)} (T×${(T / ref.T).toFixed(2)})` : '…');
    rPN(perrinN);
    const na = perrinNA();
    rNA(na > 0 ? fmtSci(na) : '…');
    rNAr(na > 0 ? (na / NA).toFixed(2) : '…');
    rKick(kickRate.toFixed(1));
    rMEq(microSamples > 50 && sumMolKE > 0 ? (sumGrainKE / sumMolKE).toFixed(2) : '…');
  }

  // =====================================================================
  // Frame loop
  let insetTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      stepMacro(dt);
      if (view === 'micro') stepMicro(dt);
      drawMacro();
      if (view === 'macro') for (let i = 0; i < nGrains; i++) trails[i].push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
    }
    if (view === 'micro') drawMicro(playing ? dt : 0);
    insetTimer += dt;
    if (insetTimer > 0.12) {
      insetTimer = 0;
      if (view === 'micro') drawSpark();
      else drawMsd();
      if (view === 'macro') drawHist();
      updateReadouts();
    }
  });

  resetMicro();
  resetMacro();
  applyView();
  updateReadouts();
  drawSpark();

  return {
    state: () => {
      const s = slopeAtProbe();
      const dm = measuredD();
      const na = perrinNA();
      return {
        t,
        view,
        T,
        eta: etaMPa,
        a: aUm,
        grains: nGrains,
        molecules: nMol,
        speed,
        D: Dth,
        Dmeas: dm,
        dValid: t >= 2,
        tau,
        probeT: 10 ** probeExp,
        slope: Number.isFinite(s) ? s : 0,
        slopeValid: Number.isFinite(s),
        refSame: refSame(),
        tRatio: ref ? T / ref.T : 0,
        dRatio: ref && ref.D > 0 ? dm / ref.D : 0,
        perrinN,
        NAest: na,
        NAratio: na / NA,
        microEquip: sumMolKE > 0 ? sumGrainKE / sumMolKE : 0,
      };
    },
    dispose: () => {
      caption.remove();
      msdCv.remove();
      histCv.remove();
      sparkCv.remove();
      glowTex.dispose();
      ringGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'brownian-motion',
  number: 33,
  symbol: 'Bw',
  title: 'Brownian Motion',
  domain: 'thermo',
  level: 1,
  status: 'live',
  tagline: 'A jittering pollen grain that proved atoms are real.',
  content,
  mount,
};

export default topic;
