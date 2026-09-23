import * as THREE from 'three';
import { createStage, makeArrow, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A_THORNE,
  constraint,
  dropFrom,
  efficiency,
  launch,
  newGeodesic,
  omegaDrag,
  omegaHorizon,
  penroseMaxEfficiency,
  penroseRadius,
  penroseSplit,
  rErgo,
  rIsco,
  rMinus,
  rPlus,
  step,
  stepSize,
  type Geodesic,
  type PenroseSplit,
} from './physics.ts';

type Status = 'falling' | 'captured' | 'escaped';
type Mode = 'drop' | 'penrose';
type PStage = 'in' | 'split' | 'done';

const S = 0.37; // scene units per M
const TWO_PI = Math.PI * 2;
const N_DUST = 1500;
const DUST_RMAX = 11;
/** Far-away time t, in M, per real second for the dust. */
const DUST_RATE = 7;
/** Particle proper time τ, in M, per real second. */
const TAU_RATE = 7;
const MAX_STEPS = 4000;
const R_ESCAPE = 16;
const TRAIL_EVERY = 3;
const MU = 0.1; // Penrose fragment rest mass (parent = 1)
const PSI = 0.15; // Penrose emission angle in the parent frame (rad)
const R_OUT_P = 8.5; // the escaping fragment is followed out to here

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

/** Equatorial circle of radius 1 (scaled by the caller). */
function unitRing(color: number, opacity = 1, dashed = false): THREE.LineLoop {
  const n = 192;
  const pos = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) {
    const a = (j / n) * TWO_PI;
    pos[j * 3] = Math.cos(a);
    pos[j * 3 + 2] = -Math.sin(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.02, gapSize: 0.018, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.LineLoop(g, mat);
  if (dashed) line.computeLineDistances();
  return line;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.3, 2.5, 5.2], target: [0, -0.2, 0], fov: 44, near: 0.02, far: 200 });
  const { scene } = stage;

  let a = 0.7;
  let r0 = 6;
  let L = 0;
  let speed = 1;
  let playing = true;
  let showDust = true;
  let showErgo = true;
  let touched = false;
  let mode: Mode = 'drop';

  // --- Reference rings in the equatorial plane
  const refRings = new THREE.Group();
  for (const r of [4, 6, 8, 10]) {
    const ring = unitRing(PALETTE.gridMajor, 0.55);
    ring.scale.setScalar(r * S);
    refRings.add(ring);
  }
  scene.add(refRings);
  for (const r of [4, 6, 8, 10]) stage.label(`${r}M`, [r * S * 0.72, 0, r * S * 0.72], 'muted');

  // --- Horizon
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.MeshStandardMaterial({ color: 0x020205, roughness: 0.35, metalness: 0.6, emissive: 0x000000 }),
  );
  scene.add(horizon);
  const horizonRing = unitRing(PALETTE.red, 0.9);
  scene.add(horizonRing);

  // --- Ergosphere: unit sphere whose vertices are pushed out to r_E(θ)
  const ergoGeo = new THREE.SphereGeometry(1, 72, 40);
  const ergoPos = ergoGeo.attributes.position as THREE.BufferAttribute;
  const ergoDir = new Float32Array(ergoPos.array as Float32Array);
  const ergoMat = new THREE.MeshStandardMaterial({
    color: PALETTE.rose, emissive: PALETTE.rose, emissiveIntensity: 0.12, transparent: true, opacity: 0.16,
    roughness: 0.6, side: THREE.DoubleSide, depthWrite: false,
  });
  const ergo = new THREE.Mesh(ergoGeo, ergoMat);
  ergo.renderOrder = 3;
  scene.add(ergo);
  const ergoWireGeo = new THREE.BufferGeometry();
  // Meridians and a few latitude circles of the ergosphere surface.
  const NMER = 12;
  const NLAT = 5;
  const NSEG = 64;
  const wireCount = (NMER * NSEG + NLAT * NSEG) * 2;
  const wirePos = new Float32Array(wireCount * 3);
  ergoWireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  const ergoWire = new THREE.LineSegments(ergoWireGeo, new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(ergoWire);

  // --- ISCO rings
  const iscoPro = unitRing(PALETTE.cyan, 0.95, true);
  const iscoRetro = unitRing(PALETTE.violet, 0.95, true);
  scene.add(iscoPro, iscoRetro);

  // --- Spin axis arrow and a curl showing the sense of rotation
  const spinArrow = makeArrow(new THREE.Vector3(0, 1, 0), 1, PALETTE.amber);
  scene.add(spinArrow);
  const curl = new THREE.Group();
  {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 40; j++) {
      const t = (j / 40) * Math.PI * 1.5;
      pts.push(new THREE.Vector3(0.22 * Math.cos(t), 0, -0.22 * Math.sin(t)));
    }
    const cg = new THREE.BufferGeometry().setFromPoints(pts);
    curl.add(new THREE.Line(cg, new THREE.LineBasicMaterial({ color: PALETTE.amber })));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
    head.position.set(0, 0, 0.22);
    head.rotation.z = -Math.PI / 2;
    head.rotation.y = 0;
    curl.add(head);
  }
  scene.add(curl);

  // --- Labels
  const lblSpin = stage.label('spin a', [0, 1, 0], 'muted');
  const lblHor = stage.label('horizon r₊', [0, 0, 0], 'muted');
  const lblErgo = stage.label('ergosphere', [0, 0, 0], 'muted');
  const lblPro = stage.label('ISCO prograde', [0, 0, 0], 'muted');
  const lblRetro = stage.label('ISCO retrograde', [0, 0, 0], 'muted');
  lblPro.element.style.color = css(PALETTE.cyan);
  lblRetro.element.style.color = css(PALETTE.violet);
  lblErgo.element.style.color = css(PALETTE.rose);

  // --- Dust: points plus short streaks whose length shows the local drag rate
  const glowTex = glowTexture();
  const dR = new Float32Array(N_DUST);
  const dTh = new Float32Array(N_DUST);
  const dPhi = new Float32Array(N_DUST);
  const dW = new Float32Array(N_DUST);
  const dU = new Float32Array(N_DUST); // radial fraction, fixed per grain
  const dustPos = new Float32Array(N_DUST * 3);
  const dustCol = new Float32Array(N_DUST * 3);
  const streakPos = new Float32Array(N_DUST * 6);
  const streakCol = new Float32Array(N_DUST * 6);
  let seed = 20260923;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < N_DUST; i++) {
    dU[i] = rnd();
    const u = (rnd() * 2 - 1) ** 3; // concentrated near the equator
    dTh[i] = Math.PI / 2 + u * 0.75;
    dPhi[i] = rnd() * TWO_PI;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.07, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  dust.frustumCulled = false;
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3).setUsage(THREE.DynamicDrawUsage));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
  const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false;
  const dustGroup = new THREE.Group();
  dustGroup.add(dust, streaks);
  scene.add(dustGroup);

  // --- Test particle
  const makeBody = (color: number, r: number, glowSize: number) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 })));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.setScalar(glowSize);
    g.add(sp);
    scene.add(g);
    return g;
  };
  const particle = makeBody(PALETTE.amber, 0.045, 0.34);
  const trail = new Trail(5000, PALETTE.amber, 1);
  trail.line.renderOrder = 4;
  scene.add(trail.line);
  const dropMark = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 24), new THREE.MeshBasicMaterial({ color: PALETTE.amber, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  dropMark.rotation.x = -Math.PI / 2;
  scene.add(dropMark);
  const statusLabel = stage.label('', [0, 0, 0], 'big');
  statusLabel.visible = false;

  // --- Penrose bodies
  const pParent = makeBody(PALETTE.white, 0.04, 0.3);
  const pFrag1 = makeBody(PALETTE.red, 0.03, 0.24);
  const pFrag2 = makeBody(PALETTE.green, 0.03, 0.24);
  const tParent = new Trail(3000, PALETTE.white, 0.9);
  const tFrag1 = new Trail(2000, PALETTE.red, 1);
  const tFrag2 = new Trail(3000, PALETTE.green, 1);
  const penroseGroup = new THREE.Group();
  penroseGroup.add(tParent.line, tFrag1.line, tFrag2.line);
  scene.add(penroseGroup);
  stage.label('E₀ = 1', [0, 0.14, 0], '', pParent);
  const lblF1 = stage.label('', [0, 0.14, 0], '', pFrag1);
  const lblF2 = stage.label('', [0, 0.14, 0], '', pFrag2);
  lblF1.element.style.color = css(PALETTE.red);
  lblF2.element.style.color = css(PALETTE.green);
  const splitFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  splitFlash.scale.setScalar(0.5);
  scene.add(splitFlash);
  const setPenroseVisible = (v: boolean) => {
    pParent.visible = pFrag1.visible = pFrag2.visible = v;
    penroseGroup.visible = v;
    splitFlash.visible = false;
  };
  setPenroseVisible(false);

  // --- ISCO vs spin inset
  const PW = 560;
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
  const PX0 = 58;
  const PX1 = PW - 22;
  const PY0 = 52;
  const PY1 = PH - 46;
  const xOf = (s: number) => PX0 + s * (PX1 - PX0);
  const yOf = (r: number) => PY1 - (r / 10) * (PY1 - PY0);
  const C_CYAN = css(PALETTE.cyan);
  const C_VIOLET = css(PALETTE.violet);
  const C_RED = css(PALETTE.red);
  const C_AMBER = css(PALETTE.amber);
  const C_ROSE = css(PALETTE.rose);
  {
    const c = bctx;
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('ISCO radius vs spin', 16, 32);
    c.font = '18px JetBrains Mono, monospace';
    for (const r of [0, 2, 4, 6, 8, 10]) {
      c.strokeStyle = '#1a2336';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(PX0, yOf(r));
      c.lineTo(PX1, yOf(r));
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(`${r}`, PX0 - (r >= 10 ? 30 : 20), yOf(r) + 6);
    }
    for (const s of [0, 0.5, 1]) {
      c.fillText(`${s}`, xOf(s) - (s === 0.5 ? 14 : 6), PH - 18);
    }
    c.fillText('a/M', PX1 - 36, PH - 18);
    c.fillText('r/M', PX0 + 6, PY0 + 18);
    const curve = (f: (s: number) => number, color: string, dash: number[], w: number) => {
      c.beginPath();
      for (let i = 0; i <= 200; i++) {
        const s = Math.min(0.99999, i / 200);
        const y = yOf(f(s));
        if (i === 0) c.moveTo(xOf(s), y);
        else c.lineTo(xOf(s), y);
      }
      c.setLineDash(dash);
      c.strokeStyle = color;
      c.lineWidth = w;
      c.stroke();
      c.setLineDash([]);
    };
    curve(() => 2, C_ROSE, [6, 6], 2);
    curve(rPlus, C_RED, [4, 5], 2.5);
    curve((s) => rIsco(s, false), C_VIOLET, [], 3.5);
    curve((s) => rIsco(s, true), C_CYAN, [], 3.5);
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = C_VIOLET;
    c.fillText('retro', xOf(0.25), yOf(7.6));
    c.fillStyle = C_CYAN;
    c.fillText('pro', xOf(0.62), yOf(4.1));
    c.fillStyle = C_ROSE;
    c.fillText('r_E', PX0 + 10, yOf(2) - 8);
    c.fillStyle = C_RED;
    c.fillText('r₊', xOf(0.2), yOf(2) + 22);
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    const x = xOf(a);
    pctx.strokeStyle = 'rgba(245,182,66,0.55)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x, PY0);
    pctx.lineTo(x, PY1);
    pctx.stroke();
    const rp = rIsco(a, true);
    const rr = rIsco(a, false);
    pctx.font = '600 18px JetBrains Mono, monospace';
    for (const [r, col] of [[rp, C_CYAN], [rr, C_VIOLET]] as [number, string][]) {
      pctx.fillStyle = col;
      pctx.beginPath();
      pctx.arc(x, yOf(r), 7, 0, TWO_PI);
      pctx.fill();
      const tx = a > 0.7 ? x - 76 : x + 12;
      pctx.fillText(r.toFixed(2), tx, yOf(r) + (r === rp ? 22 : -10));
    }
    pctx.fillStyle = C_AMBER;
    pctx.fillText(`a = ${a.toFixed(3)}`, PW - 170, 32);
  }

  // --- Legend overlay (hidden on phones)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${css(c)}"></i>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the scene</div>
<div>${sw(PALETTE.red)}horizon r₊ (black sphere)</div>
<div>${sw(PALETTE.rose)}ergosphere: nothing can stand still</div>
<div>${sw(PALETTE.cyan)}ISCO, orbiting with the spin</div>
<div>${sw(PALETTE.violet)}ISCO, orbiting against it</div>
<div>${sw(0x9fb4ff)}dust streaks: drag rate Ω, longer = faster</div>
<div>${sw(PALETTE.amber)}test particle, dropped at rest</div>`;
  viewport.appendChild(legend);

  // --- Geometry that depends on spin
  const tmpV = new THREE.Vector3();
  function rebuildSpin(): void {
    const rp = rPlus(a);
    horizon.scale.setScalar(rp * S);
    horizonRing.scale.setScalar(rp * S * 1.004);
    // Ergosphere surface: radius r_E(θ) along each unit direction, θ measured from +y.
    const arr = ergoPos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = ergoDir[i];
      const y = ergoDir[i + 1];
      const z = ergoDir[i + 2];
      const th = Math.acos(Math.max(-1, Math.min(1, y)));
      const k = rErgo(a, th) * S;
      arr[i] = x * k;
      arr[i + 1] = y * k;
      arr[i + 2] = z * k;
    }
    ergoPos.needsUpdate = true;
    ergoGeo.computeVertexNormals();
    let w = 0;
    const put = (th: number, ph: number) => {
      const k = rErgo(a, th) * S * 1.002;
      wirePos[w++] = k * Math.sin(th) * Math.cos(ph);
      wirePos[w++] = k * Math.cos(th);
      wirePos[w++] = -k * Math.sin(th) * Math.sin(ph);
    };
    for (let m = 0; m < NMER; m++) {
      const ph = (m / NMER) * TWO_PI;
      for (let j = 0; j < NSEG; j++) {
        put((j / NSEG) * Math.PI, ph);
        put(((j + 1) / NSEG) * Math.PI, ph);
      }
    }
    for (let l = 0; l < NLAT; l++) {
      const th = ((l + 1) / (NLAT + 1)) * Math.PI;
      for (let j = 0; j < NSEG; j++) {
        put(th, (j / NSEG) * TWO_PI);
        put(th, ((j + 1) / NSEG) * TWO_PI);
      }
    }
    (ergoWireGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    ergoWireGeo.computeBoundingSphere();
    ergoGeo.computeBoundingSphere();

    const rpro = rIsco(a, true);
    const rret = rIsco(a, false);
    iscoPro.scale.setScalar(rpro * S);
    iscoRetro.scale.setScalar(rret * S);
    iscoPro.computeLineDistances();
    iscoRetro.computeLineDistances();
    (iscoPro.material as THREE.LineDashedMaterial).dashSize = 0.02 / (rpro * S);
    (iscoPro.material as THREE.LineDashedMaterial).gapSize = 0.018 / (rpro * S);
    (iscoRetro.material as THREE.LineDashedMaterial).dashSize = 0.02 / (rret * S);
    (iscoRetro.material as THREE.LineDashedMaterial).gapSize = 0.018 / (rret * S);

    const len = 0.3 + 0.75 * a;
    spinArrow.position.set(0, rp * S, 0);
    spinArrow.setLength(len, Math.min(0.2, len * 0.3), 0.1);
    spinArrow.visible = a > 0.005;
    curl.visible = a > 0.005;
    curl.position.set(0, rp * S + len * 0.55, 0);
    lblSpin.position.set(0.12, rp * S + len + 0.12, 0);
    lblSpin.element.textContent = a > 0.005 ? `spin a = ${a.toFixed(3)}` : 'no spin';

    lblHor.position.set(0, -rp * S - 0.12, 0);
    lblErgo.position.set(0, rErgo(a, 0.55) * S * Math.cos(0.55) + 0.1, -rErgo(a, 0.55) * S * Math.sin(0.55) - 0.1);
    lblErgo.visible = showErgo && a > 0.2;
    tmpV.set(Math.cos(-0.5), 0, -Math.sin(-0.5));
    lblPro.position.copy(tmpV).multiplyScalar(rpro * S);
    lblPro.position.y = -0.08;
    lblRetro.position.set(Math.cos(-1.0) * rret * S, 0.08, -Math.sin(-1.0) * rret * S);

    // Dust: radii spread from just outside the horizon to DUST_RMAX, denser near the hole.
    const rin = rp + 0.08;
    for (let i = 0; i < N_DUST; i++) {
      const u = dU[i];
      const r = rin * Math.pow(DUST_RMAX / rin, 0.35 * u * u + 0.65 * u);
      dR[i] = r;
      dW[i] = omegaDrag(r, a, dTh[i]);
    }
    const wH = Math.max(1e-6, omegaHorizon(a));
    for (let i = 0; i < N_DUST; i++) {
      const f = a > 1e-4 ? Math.min(1, Math.pow(dW[i] / wH, 0.45)) : 0;
      const b = 0.12 + 0.6 * f;
      dustCol[i * 3] = b * (0.55 + 0.45 * f);
      dustCol[i * 3 + 1] = b * (0.62 + 0.2 * f);
      dustCol[i * 3 + 2] = b * 1.0;
      streakCol[i * 6] = dustCol[i * 3];
      streakCol[i * 6 + 1] = dustCol[i * 3 + 1];
      streakCol[i * 6 + 2] = dustCol[i * 3 + 2];
      streakCol[i * 6 + 3] = 0;
      streakCol[i * 6 + 4] = 0;
      streakCol[i * 6 + 5] = 0;
    }
    (dustGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (streakGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    placeDust();
    drawPlot();
  }

  /** Streak length: the angle a grain sweeps in this much far-away time. */
  const STREAK_T = 6;
  function placeDust(): void {
    for (let i = 0; i < N_DUST; i++) {
      const r = dR[i] * S;
      const th = dTh[i];
      const st = Math.sin(th);
      const y = r * Math.cos(th);
      const ph = dPhi[i];
      const x = r * st * Math.cos(ph);
      const z = -r * st * Math.sin(ph);
      dustPos[i * 3] = x;
      dustPos[i * 3 + 1] = y;
      dustPos[i * 3 + 2] = z;
      const pt = ph - Math.min(0.9, dW[i] * STREAK_T);
      streakPos[i * 6] = x;
      streakPos[i * 6 + 1] = y;
      streakPos[i * 6 + 2] = z;
      streakPos[i * 6 + 3] = r * st * Math.cos(pt);
      streakPos[i * 6 + 4] = y;
      streakPos[i * 6 + 5] = -r * st * Math.sin(pt);
    }
    (dustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (streakGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  const dustMat = dust.material as THREE.PointsMaterial;
  const streakMat = streaks.material as THREE.LineBasicMaterial;
  function dimDust(dim: boolean): void {
    dustMat.opacity = dim ? 0.3 : 1;
    streakMat.opacity = dim ? 0.3 : 1;
  }

  // --- Simulation state
  const geo: Geodesic = newGeodesic();
  let status: Status = 'falling';
  let dphi = 0;
  let lastDphi = 0;
  let lastStatus: Status = 'falling';
  let driftMax = 0;
  let redropTimer = 0;
  let trailTick = 0;
  let rStop = rPlus(a) + 0.02;

  const gP: Geodesic = newGeodesic();
  const g1: Geodesic = newGeodesic();
  const g2: Geodesic = newGeodesic();
  let pStage: PStage = 'in';
  let split: PenroseSplit | null = null;
  let rSplit = NaN;
  let penroseGain = 0;
  let f1Done = false;
  let f2Done = false;

  const setPos = (obj: THREE.Object3D, r: number, phi: number) => obj.position.set(r * S * Math.cos(phi), 0, -r * S * Math.sin(phi));

  function drop(): void {
    mode = 'drop';
    dimDust(false);
    setPenroseVisible(false);
    particle.visible = true;
    trail.line.visible = true;
    dropMark.visible = true;
    rStop = rPlus(a) + 0.02;
    dropFrom(geo, a, r0, L);
    status = 'falling';
    dphi = 0;
    driftMax = 0;
    redropTimer = 0;
    trail.clear();
    setPos(particle, r0, 0);
    setPos(dropMark, r0, 0);
    statusLabel.visible = false;
  }

  function reset(): void {
    touched = true;
    lastStatus = 'falling';
    lastDphi = 0;
    drop();
    updateReadouts(true);
  }

  function stepGeo(g: Geodesic, tau: number, onStep: (() => boolean) | null): void {
    let left = tau;
    let n = 0;
    while (left > 0 && n < MAX_STEPS) {
      const h = Math.min(left, stepSize(g.s[0], g.a));
      step(g, h);
      left -= h;
      n++;
      if (onStep && onStep()) break;
    }
  }

  const onDropStep = (): boolean => {
    const r = geo.s[0];
    if (++trailTick % TRAIL_EVERY === 0) trail.push(r * S * Math.cos(geo.s[2]), 0, -r * S * Math.sin(geo.s[2]));
    const c = constraint(geo);
    if (c > driftMax) driftMax = c;
    if (r <= rStop) {
      status = 'captured';
      return true;
    }
    if (r >= R_ESCAPE) {
      status = 'escaped';
      return true;
    }
    return false;
  };

  function advanceDrop(dt: number): void {
    if (status === 'falling') {
      stepGeo(geo, dt * TAU_RATE * speed, onDropStep);
      dphi = geo.s[2];
      setPos(particle, geo.s[0], geo.s[2]);
      if (status !== 'falling') {
        lastDphi = dphi;
        lastStatus = status;
        statusLabel.element.textContent = status === 'captured' ? `reached the horizon after turning ${(dphi * 180 / Math.PI).toFixed(0)}°` : 'escaped';
        statusLabel.position.set(0, -1.15, 0);
        statusLabel.visible = true;
      }
    } else {
      redropTimer += dt;
      if (redropTimer > 3) drop();
    }
  }

  // --- Penrose demo
  function startPenrose(): void {
    if (!(penroseSplitGain(a) > 0)) aCtl.set(0.95, true);
    const rs = penroseRadius(a);
    if (!Number.isFinite(rs)) return;
    mode = 'penrose';
    particle.visible = false;
    trail.line.visible = false;
    dropMark.visible = false;
    statusLabel.visible = false;
    rSplit = rs;
    split = penroseSplit(a, rs, MU, PSI);
    launch(gP, a, 8, 1, split.L0, -1, -1.3);
    pStage = 'in';
    f1Done = false;
    f2Done = false;
    tParent.clear();
    tFrag1.clear();
    tFrag2.clear();
    setPenroseVisible(true);
    pFrag1.visible = false;
    pFrag2.visible = false;
    lblF1.element.textContent = `E₁ = ${split.frag1.E.toFixed(3)} (falls in)`;
    lblF2.element.textContent = `E₂ = ${split.frag2.E.toFixed(3)} (escapes)`;
    dimDust(true);
    setPos(pParent, gP.s[0], gP.s[2]);
    updateReadouts(true);
  }

  function penroseSplitGain(spin: number): number {
    const rs = penroseRadius(spin);
    return Number.isFinite(rs) ? penroseSplit(spin, rs, MU, PSI).gain : NaN;
  }

  let pTick = 0;
  function advancePenrose(dt: number): void {
    const tau = dt * TAU_RATE * speed * 0.5;
    if (pStage === 'in' && split) {
      stepGeo(gP, tau, () => {
        if (++pTick % TRAIL_EVERY === 0) tParent.push(gP.s[0] * S * Math.cos(gP.s[2]), 0, -gP.s[0] * S * Math.sin(gP.s[2]));
        return gP.s[1] >= 0 || gP.s[0] <= rSplit;
      });
      setPos(pParent, gP.s[0], gP.s[2]);
      if (gP.s[1] >= 0 || gP.s[0] <= rSplit) {
        pStage = 'split';
        const phi = gP.s[2];
        for (const [g, f] of [[g1, split.frag1], [g2, split.frag2]] as const) {
          g.a = a;
          g.E = f.E / f.mu;
          g.L = f.L / f.mu;
          g.s.fill(0);
          g.s[0] = rSplit;
          g.s[1] = f.rdot;
          g.s[2] = phi;
        }
        pParent.visible = false;
        pFrag1.visible = true;
        pFrag2.visible = true;
        setPos(splitFlash, rSplit, phi);
        splitFlash.visible = true;
      }
      return;
    }
    if (pStage === 'split') {
      const rs = rPlus(a) + 0.01;
      if (!f1Done) {
        stepGeo(g1, tau, () => {
          if (++pTick % TRAIL_EVERY === 0) tFrag1.push(g1.s[0] * S * Math.cos(g1.s[2]), 0, -g1.s[0] * S * Math.sin(g1.s[2]));
          return g1.s[0] <= rs;
        });
        setPos(pFrag1, g1.s[0], g1.s[2]);
        if (g1.s[0] <= rs) f1Done = true;
      }
      if (!f2Done) {
        stepGeo(g2, tau * 1.5, () => {
          if (++pTick % TRAIL_EVERY === 0) tFrag2.push(g2.s[0] * S * Math.cos(g2.s[2]), 0, -g2.s[0] * S * Math.sin(g2.s[2]));
          return g2.s[0] <= rs || g2.s[0] >= R_OUT_P;
        });
        setPos(pFrag2, g2.s[0], g2.s[2]);
        if (g2.s[0] >= R_OUT_P || g2.s[0] <= rs) f2Done = true;
      }
      if (f1Done && f2Done) {
        pStage = 'done';
        // Outbound past R_OUT_P with E/μ > 1: unbound, so it escapes.
        if (g2.s[0] >= R_OUT_P && g2.s[1] > 0 && g2.E > 1) penroseGain = split ? split.gain : 0;
        statusLabel.element.textContent = `escaping piece carries ${(1 + (split?.gain ?? 0)).toFixed(3)}× the energy sent in`;
        statusLabel.position.set(0, -1.15, 0);
        statusLabel.visible = true;
      }
    }
  }

  // --- Frame loop
  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      if (showDust) {
        const k = dt * DUST_RATE * speed;
        for (let i = 0; i < N_DUST; i++) {
          let p = dPhi[i] + dW[i] * k;
          if (p > TWO_PI) p -= TWO_PI;
          dPhi[i] = p;
        }
        placeDust();
      }
      if (mode === 'drop') advanceDrop(dt);
      else advancePenrose(dt);
      if (splitFlash.visible) {
        const m = splitFlash.material as THREE.SpriteMaterial;
        m.opacity = Math.max(0, m.opacity - dt * 0.4);
      }
    }
    readoutTimer += dt;
    if (readoutTimer > 0.12) {
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
    { label: 'Penrose demo', key: 'gain', onClick: () => { (splitFlash.material as THREE.SpriteMaterial).opacity = 1; startPenrose(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Black hole');
  const aCtl = ui.slider({
    key: 'a', label: 'Spin a', min: 0, max: A_THORNE, step: 0.001, value: a, unit: 'M', format: (v) => v.toFixed(3),
    onInput: (v) => { a = v; rebuildSpin(); reset(); },
  });
  ui.note('a = J/M. Capped at 0.998, the Thorne limit for holes spun up by a disc.');

  ui.section('Drop a test particle (resets)');
  ui.slider({ key: 'r0', label: 'Drop radius r₀', min: 3, max: 12, step: 0.1, value: r0, unit: 'M', format: (v) => v.toFixed(1), onInput: (v) => { r0 = v; reset(); } });
  ui.slider({ key: 'L', label: 'Angular momentum L', min: -4, max: 4, step: 0.05, value: L, unit: 'M', format: (v) => (Math.abs(v) < 1e-9 ? '0.00' : v.toFixed(2)), onInput: (v) => { L = v; reset(); } });
  ui.note('Released at rest in r. Positive L orbits with the spin, negative against it. L = 0 means no sideways push at all.');

  ui.section('Show');
  ui.toggle({ key: 'dust', label: 'Dust dragged at Ω(r, θ)', value: showDust, onChange: (v) => { showDust = v; dustGroup.visible = v; } });
  ui.toggle({ key: 'ergo', label: 'Ergosphere', value: showErgo, onChange: (v) => { showErgo = v; ergo.visible = v; ergoWire.visible = v; lblErgo.visible = v && a > 0.2; } });
  ui.legend([
    { color: css(PALETTE.cyan), label: 'ISCO prograde' },
    { color: css(PALETTE.violet), label: 'ISCO retrograde' },
    { color: css(PALETTE.rose), label: 'ergosphere' },
    { color: css(PALETTE.white), label: 'Penrose parent' },
    { color: css(PALETTE.red), label: 'E < 0 piece' },
    { color: css(PALETTE.green), label: 'escaping piece' },
  ]);

  ui.section('Black hole readouts');
  const rRp = ui.readout('rplus', 'outer horizon r₊', 'M');
  const rRm = ui.readout('rminus', 'inner horizon r₋', 'M');
  const rRe = ui.readout('rergo', 'ergosphere r_E at equator', 'M');
  const rIp = ui.readout('iscoPro', 'ISCO prograde', 'M');
  const rIr = ui.readout('iscoRetro', 'ISCO retrograde', 'M');
  const rEta = ui.readout('eta', 'efficiency 1 − E_ISCO');

  ui.section('Particle readouts');
  const rR = ui.readout('r', 'radius r', 'M');
  const rOm = ui.readout('omega', 'drag Ω at particle', '/M');
  const rPhi = ui.readout('dphi', 'angle turned φ');
  const rDrift = ui.readout('drift', 'constraint drift');
  const rGain = ui.readout('gain', 'Penrose gain E₂/E₀ − 1');
  const rMax = ui.readout('gainMax', 'bound ½(√(2M/r₊) − 1)');

  function updateReadouts(force: boolean): void {
    if (!force && !playing) return;
    rRp(rPlus(a).toFixed(4));
    rRm(rMinus(a).toFixed(4));
    rRe(rErgo(a, Math.PI / 2).toFixed(2));
    rIp(rIsco(a, true).toFixed(3));
    rIr(rIsco(a, false).toFixed(3));
    rEta(`${(efficiency(a) * 100).toFixed(2)} %`);
    const g = mode === 'drop' ? geo : pStage === 'in' ? gP : g2;
    rR(g.s[0].toFixed(3));
    rOm(omegaDrag(g.s[0], a).toFixed(4));
    rPhi(mode === 'drop' ? `${((dphi * 180) / Math.PI).toFixed(0)}°` : '–');
    rDrift(mode === 'drop' ? (driftMax < 1e-15 ? '0' : driftMax.toExponential(0)) : '–');
    rGain(split && mode === 'penrose' ? `${(split.gain * 100).toFixed(1)} %` : penroseGain > 0 ? `${(penroseGain * 100).toFixed(1)} %` : '–');
    rMax(`${(penroseMaxEfficiency(a) * 100).toFixed(1)} %`);
  }

  rebuildSpin();
  drop();
  // Pre-roll a little of the default drop so the swirl is visible at first glance.
  for (let i = 0; i < 90; i++) advanceDrop(1 / 60);
  updateReadouts(true);

  return {
    state: () => ({
      a,
      r0,
      L,
      touched,
      mode,
      // Result of the latest finished drop since the reader last touched the controls.
      status: lastStatus,
      dphi: lastDphi,
      r: geo.s[0],
      omega: omegaDrag(geo.s[0], a),
      iscoPro: rIsco(a, true),
      iscoRetro: rIsco(a, false),
      rplus: rPlus(a),
      eta: efficiency(a),
      penroseGain,
      dust: showDust,
      ergo: showErgo,
    }),
    dispose: () => {
      plot.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'kerr-black-hole',
  number: 23,
  title: 'Spinning Black Holes',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'A rotating mass drags space around with it.',
  content,
  mount,
};

export default topic;
