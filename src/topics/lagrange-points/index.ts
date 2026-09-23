import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  contourSegments,
  jacobi,
  lagrangePoints,
  launchState,
  linearStability,
  L_NAMES,
  nearestPrimary,
  omega,
  OrbitTracker,
  PERIOD,
  rk4Step,
  ROUTH_MU,
  stepFor,
  type LName,
} from './physics.ts';

type PresetId = 'sj' | 'em' | 'routh' | 'custom';

const PRESETS: Record<Exclude<PresetId, 'custom'>, { mu: number; big: string; small: string }> = {
  sj: { mu: 9.54e-4, big: 'Sun', small: 'Jupiter' },
  em: { mu: 0.01215, big: 'Earth', small: 'Moon' },
  routh: { mu: 0.05, big: 'M₁', small: 'M₂' },
};

/** World units per simulation length unit. */
const S = 2.1;
/** Radius of the drawn potential surface, in simulation units. */
const R_SURF = 1.6;
/** Height mapping: h = −A ln(1 + d / D0), d = Ω − Ω_min clamped at D_MAX. */
const A = 0.3;
const D0 = 0.004;
const D_MAX = 1.2;
/** Simulation time units per real second at speed 1 (one orbit every 2 s). */
const RATE = PERIOD / 2;
const MAX_STEPS = 6000;
const TRAIL_CAP = 5000;
const TRAIL_DS = 0.012;
const HIT_R = 0.004;
const FAR_R = 4;
const SPARK_N = 2400;
/** Sparkline sample spacing in simulation time (40 per orbit). */
const SPARK_DT = PERIOD / 40;
const CONT_N = 300;
const CONT_MAX = 24000;

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

/** Radii of the surface rings: dense near the co-orbital ring r ≈ 1 where the detail is. */
function ringRadii(): number[] {
  const r: number[] = [];
  for (let x = 0; x < 0.8; x += 0.02) r.push(x);
  for (let x = 0.8; x < 1.2; x += 0.004) r.push(x);
  for (let x = 1.2; x <= R_SURF + 1e-9; x += 0.02) r.push(x);
  return r;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [1.3, 5.0, -4.7];
  const TARGET: [number, number, number] = [0.35, -0.7, -0.35];
  const stage = createStage(viewport, { camera: CAM, target: TARGET, fov: 45 });
  const { scene } = stage;

  // --- Parameters
  let preset: PresetId = 'sj';
  let mu = PRESETS.sj.mu;
  let from: LName = 'L4';
  let dr = 0.008;
  let dv = 0;
  let speed = 2;
  let playing = true;
  let inertial = false;
  let showHill = true;
  let touched = false;

  // Derived per μ
  let omegaMin = 1.5;
  let pts = lagrangePoints(mu);
  const hOf = (om: number) => -A * Math.log(1 + Math.min(D_MAX, Math.max(0, om - omegaMin)) / D0);
  const hFloor = () => -A * Math.log(1 + D_MAX / D0);

  // --- Rotating group: everything that is fixed in the rotating frame
  const rot = new THREE.Group();
  scene.add(rot);

  // Potential surface on a polar mesh
  const radii = ringRadii();
  const NR = radii.length;
  const NT = 480;
  const nVert = NR * NT;
  const sPos = new Float32Array(nVert * 3);
  const sCol = new Float32Array(nVert * 3);
  const sOm = new Float64Array(nVert);
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const k = (i * NT + j) * 3;
      sPos[k] = S * radii[i] * Math.cos(th);
      sPos[k + 2] = -S * radii[i] * Math.sin(th);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < NR - 1; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * NT + j;
      const b = i * NT + ((j + 1) % NT);
      const c = (i + 1) * NT + ((j + 1) % NT);
      const d = (i + 1) * NT + j;
      idx.push(a, d, b, b, d, c);
    }
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  surfGeo.setIndex(idx);
  const surf = new THREE.Mesh(
    surfGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }),
  );
  rot.add(surf);

  // Guide lines on the surface: rings and spokes
  const guideR = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  const guideRi = guideR.map((g) => radii.reduce((best, r, i) => (Math.abs(r - g) < Math.abs(radii[best] - g) ? i : best), 0));
  const SPOKES = 24;
  const spokeStep = NT / SPOKES;
  const nGuideSeg = guideRi.length * NT + SPOKES * (NR - 1);
  const gPos = new Float32Array(nGuideSeg * 6);
  const gSrc = new Uint32Array(nGuideSeg * 2);
  {
    let s = 0;
    for (const i of guideRi) for (let j = 0; j < NT; j++) { gSrc[s++] = i * NT + j; gSrc[s++] = i * NT + ((j + 1) % NT); }
    for (let q = 0; q < SPOKES; q++) for (let i = 0; i < NR - 1; i++) { gSrc[s++] = i * NT + q * spokeStep; gSrc[s++] = (i + 1) * NT + q * spokeStep; }
  }
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const guides = new THREE.LineSegments(guideGeo, new THREE.LineBasicMaterial({ color: 0x5b6b90, transparent: true, opacity: 0.22 }));
  rot.add(guides);

  // Hill (zero-velocity) curves: a flat level set at height h(C/2)
  const contF = new Float64Array((CONT_N + 1) * (CONT_N + 1));
  const contSeg = new Float32Array(CONT_MAX * 4);
  const hillPos = new Float32Array(CONT_MAX * 6);
  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute('position', new THREE.BufferAttribute(hillPos, 3));
  hillGeo.setDrawRange(0, 0);
  const hill = new THREE.LineSegments(hillGeo, new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.95 }));
  hill.frustumCulled = false;
  rot.add(hill);

  // Masses
  const glowTex = glowTexture();
  const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
  const big = new THREE.Group();
  const bigCore = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: PALETTE.amber, emissive: PALETTE.amber, emissiveIntensity: 0.8, roughness: 0.4 }));
  bigCore.scale.setScalar(0.17);
  const bigGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  bigGlow.scale.setScalar(0.9);
  big.add(bigCore, bigGlow);
  rot.add(big);
  const bigLabel = stage.label('Sun', [0, 0.1, -0.5], 'muted', big);
  const small = new THREE.Group();
  const smallCore = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 0.6, roughness: 0.4 }));
  const smallGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.cyan, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  small.add(smallCore, smallGlow);
  rot.add(small);
  const smallLabel = stage.label('Jupiter', [0.05, -0.05, -0.42], 'muted', small);

  // Lagrange point markers
  const lMarkGeo = new THREE.OctahedronGeometry(0.06);
  const lMarks: Record<LName, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; label: HTMLElement; obj: THREE.Object3D }> = {} as never;
  for (const n of L_NAMES) {
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.green });
    const mesh = new THREE.Mesh(lMarkGeo, mat);
    rot.add(mesh);
    const lab = stage.label(n, [n === 'L1' ? -0.16 : n === 'L2' ? 0.16 : 0, 0.2, 0], '', mesh);
    lMarks[n] = { mesh, mat, label: lab.element, obj: lab };
  }

  // Particle and trail (world coordinates, so the trail is honest in either frame)
  const part = new THREE.Group();
  const partCore = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: PALETTE.white, emissive: PALETTE.white, emissiveIntensity: 0.7 }));
  partCore.scale.setScalar(0.05);
  const partGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.white, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
  partGlow.scale.setScalar(0.3);
  part.add(partCore, partGlow);
  scene.add(part);
  const trail = new Trail(TRAIL_CAP, 0xe8eeff, 0.95);
  (trail.line.material as THREE.LineBasicMaterial).depthTest = false;
  trail.line.renderOrder = 2;
  scene.add(trail.line);

  // --- Overlays: legend (top-left) and angle sparkline (top-right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number | string, shape = '50%') => `<i style="display:inline-block;width:9px;height:9px;border-radius:${shape};margin-right:6px;background:${typeof c === 'number' ? css(c) : c}"></i>`;
  const legendStatus = document.createElement('div');
  const paintLegend = () => {
    const p = preset === 'custom' ? { big: 'M₁', small: 'M₂' } : PRESETS[preset];
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${inertial ? 'Inertial view: frame turning' : 'Rotating frame'}: height = −Ω</div>
<div>${sw(PALETTE.amber)}${p.big} ${sw(PALETTE.cyan)}${p.small} ${sw(PALETTE.white)}particle</div>
<div>${sw(PALETTE.green, '2px')}stable ${sw(PALETTE.red, '2px')}unstable L point</div>
<div>${sw(PALETTE.rose, '1px')}Hill curve, shaded = forbidden</div>`;
    legend.appendChild(legendStatus);
  };
  Object.assign(legendStatus.style, { marginTop: '4px', color: '#dfe6f3' } as CSSStyleDeclaration);

  const spark = document.createElement('canvas');
  spark.width = 460;
  spark.height = 220;
  Object.assign(spark.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '110px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(spark);
  const sctx = spark.getContext('2d')!;
  const sparkT = new Float64Array(SPARK_N);
  const sparkA = new Float64Array(SPARK_N);
  let sparkHead = 0;
  let sparkCount = 0;
  let nextSample = 0;

  // --- Simulation state
  const s = new Float64Array(4);
  let t = 0;
  let c0 = 0;
  let cNow = 0;
  let cDrift = 0;
  let stopped: '' | 'big' | 'small' | 'far' = '';
  const trk = new OrbitTracker();
  let lastTrailX = 0;
  let lastTrailZ = 0;

  // --- Rebuild for a new μ
  function rebuildMu(): void {
    pts = lagrangePoints(mu);
    omegaMin = omega(mu, pts.L4[0], pts.L4[1]);
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const v = i * NT + j;
        const th = (j / NT) * Math.PI * 2;
        const x = radii[i] * Math.cos(th);
        const y = radii[i] * Math.sin(th);
        // Keep the vertex off the exact mass positions.
        const om = nearestPrimary(mu, x, y) < 1e-9 ? 1e9 : omega(mu, x, y);
        sOm[v] = om;
        sPos[v * 3 + 1] = hOf(om);
      }
    }
    (surfGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();
    for (let k = 0; k < gSrc.length; k++) {
      const v = gSrc[k];
      gPos[k * 3] = sPos[v * 3];
      gPos[k * 3 + 1] = sPos[v * 3 + 1] + 0.006;
      gPos[k * 3 + 2] = sPos[v * 3 + 2];
    }
    (guideGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    guideGeo.computeBoundingSphere();

    // Contour sample grid
    const dx = (2 * R_SURF) / CONT_N;
    for (let j = 0; j <= CONT_N; j++) {
      for (let i = 0; i <= CONT_N; i++) {
        const x = -R_SURF + i * dx;
        const y = -R_SURF + j * dx;
        contF[j * (CONT_N + 1) + i] = nearestPrimary(mu, x, y) < 1e-9 ? 1e9 : 2 * omega(mu, x, y);
      }
    }

    // Masses and L points
    const fl = hFloor();
    big.position.set(-S * mu, fl + 0.17, 0);
    const rs = 0.06 + 0.2 * Math.cbrt(mu);
    smallCore.scale.setScalar(rs);
    smallGlow.scale.setScalar(rs * 5);
    const hSmall = hOf(omega(mu, 1 - mu + 0.03, 0));
    small.position.set(S * (1 - mu), hSmall + rs * 0.6, 0);
    const l4 = linearStability(mu, pts.L4[0], pts.L4[1]);
    for (const n of L_NAMES) {
      const [x, y] = pts[n];
      const m = lMarks[n];
      m.mesh.position.set(S * x, hOf(omega(mu, x, y)) + 0.07, -S * y);
      const stable = (n === 'L4' || n === 'L5') && l4.stable;
      m.mat.color.setHex(stable ? PALETTE.green : PALETTE.red);
      m.label.style.color = stable ? css(PALETTE.green) : '#ff9a9a';
    }
    const p = preset === 'custom' ? { big: 'M₁', small: 'M₂' } : PRESETS[preset];
    bigLabel.element.textContent = p.big;
    smallLabel.element.textContent = p.small;
    paintLegend();
  }

  // --- Colours and Hill curve for the current Jacobi constant
  const cDeep = new THREE.Color(0x0e1a36);
  const cMid = new THREE.Color(0x35307a);
  const cTop = new THREE.Color(0x3f8fb0);
  const cRidge = new THREE.Color(0x5aa7c0);
  const cForb = new THREE.Color(PALETTE.rose);
  const tmpC = new THREE.Color();
  function recolour(): void {
    const fl = hFloor();
    for (let v = 0; v < nVert; v++) {
      const h = sPos[v * 3 + 1];
      const u = 1 - h / fl; // 0 at floor, 1 at the top
      if (u < 0.55) tmpC.copy(cDeep).lerp(cMid, u / 0.55);
      else if (u < 0.9) tmpC.copy(cMid).lerp(cTop, (u - 0.55) / 0.35);
      else tmpC.copy(cTop).lerp(cRidge, (u - 0.9) / 0.1);
      if (showHill && 2 * sOm[v] < cNow) tmpC.lerp(cForb, 0.55);
      sCol[v * 3] = tmpC.r;
      sCol[v * 3 + 1] = tmpC.g;
      sCol[v * 3 + 2] = tmpC.b;
    }
    (surfGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    const n = contourSegments(contF, CONT_N, CONT_N, cNow, -R_SURF, R_SURF, -R_SURF, R_SURF, contSeg);
    const y = hOf(cNow / 2) + 0.012;
    let m = 0;
    for (let k = 0; k < n; k++) {
      const ax = contSeg[k * 4];
      const ay = contSeg[k * 4 + 1];
      const bx = contSeg[k * 4 + 2];
      const by = contSeg[k * 4 + 3];
      if (Math.hypot(0.5 * (ax + bx), 0.5 * (ay + by)) > R_SURF - 0.01) continue;
      const o = m * 6;
      hillPos[o] = S * ax;
      hillPos[o + 1] = y;
      hillPos[o + 2] = -S * ay;
      hillPos[o + 3] = S * bx;
      hillPos[o + 4] = y;
      hillPos[o + 5] = -S * by;
      m++;
    }
    hillGeo.setDrawRange(0, m * 2);
    (hillGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    hill.visible = showHill;
  }

  // --- Launch
  function launch(): void {
    launchState(mu, from, dr, dv, s);
    trk.reset(mu, from, s);
    t = 0;
    c0 = jacobi(mu, s);
    cNow = c0;
    cDrift = 0;
    stopped = '';
    trail.clear();
    sparkHead = 0;
    sparkCount = 0;
    nextSample = 0;
    recolour();
    place();
    lastTrailX = part.position.x;
    lastTrailZ = part.position.z;
    trail.push(part.position.x, part.position.y, part.position.z);
    sample();
    drawSpark();
    updateReadouts();
  }

  function place(): void {
    const a = inertial ? t : 0;
    rot.rotation.y = a;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const X = s[0] * ca - s[1] * sa;
    const Y = s[0] * sa + s[1] * ca;
    part.position.set(S * X, hOf(omega(mu, s[0], s[1])) + 0.05, -S * Y);
  }

  function sample(): void {
    sparkT[sparkHead] = t;
    sparkA[sparkHead] = (Math.atan2(s[1], s[0]) * 180) / Math.PI;
    sparkHead = (sparkHead + 1) % SPARK_N;
    if (sparkCount < SPARK_N) sparkCount++;
    nextSample = t + SPARK_DT;
  }

  /** Bookkeeping after each integrator step. */
  function track(): void {
    const x = s[0];
    const y = s[1];
    const r = Math.hypot(x, y);
    trk.update(s, t);
    const rp = nearestPrimary(mu, x, y);
    if (rp < HIT_R) stopped = Math.hypot(x + mu, y) < Math.hypot(x - 1 + mu, y) ? 'big' : 'small';
    else if (r > FAR_R) stopped = 'far';
  }

  function advance(simDt: number): void {
    const tEnd = t + simDt;
    let n = 0;
    while (t < tEnd && n < MAX_STEPS && !stopped) {
      const h = Math.min(stepFor(mu, s), tEnd - t);
      rk4Step(mu, s, h);
      t += h;
      n++;
      track();
      if (t >= nextSample) sample();
      if (n % 8 === 0) layTrail();
    }
    layTrail();
  }

  function layTrail(): void {
    place();
    const dx = part.position.x - lastTrailX;
    const dz = part.position.z - lastTrailZ;
    if (dx * dx + dz * dz > TRAIL_DS * TRAIL_DS) {
      lastTrailX = part.position.x;
      lastTrailZ = part.position.z;
      trail.push(part.position.x, part.position.y, part.position.z);
    }
  }

  function status(): string {
    const p = preset === 'custom' ? { big: 'M₁', small: 'M₂' } : PRESETS[preset];
    if (stopped === 'big') return `hit ${p.big}`;
    if (stopped === 'small') return `hit ${p.small}`;
    if (stopped === 'far') return 'left the system';
    if (trk.horseshoe) return 'horseshoe';
    const tri = trk.triangular;
    const maxDist = trk.maxDist;
    if (maxDist < 1e-6) return `resting on ${from}`;
    if (tri && mu > ROUTH_MU && maxDist > 0.05) return `unstable: leaving ${from}`;
    if (tri && trk.sideKept && trk.inRing) return 'tadpole';
    if (!tri && maxDist >= 0.2) return `escaped ${from}`;
    if (!tri && maxDist < 0.2) return `drifting off ${from}`;
    return 'wandering';
  }

  function drawSpark(): void {
    const W = spark.width;
    const Hh = spark.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText(`angle from planet, last ${(sparkCount < 2 ? 10 : Math.max(10, (sparkT[(sparkHead - 1 + SPARK_N) % SPARK_N] - sparkT[(sparkHead - sparkCount + SPARK_N) % SPARK_N]) / PERIOD)).toFixed(0)} orbits`, 16, 30);
    const x0 = 14;
    const x1 = W - 70;
    const top = 46;
    const bot = Hh - 12;
    const yOf = (deg: number) => top + ((180 - deg) / 360) * (bot - top);
    sctx.lineWidth = 1;
    const refs: [number, string, string][] = [
      [180, 'L3', '#56627c'],
      [60, 'L4', css(PALETTE.green)],
      [0, 'M₂', css(PALETTE.cyan)],
      [-60, 'L5', css(PALETTE.green)],
      [-180, 'L3', '#56627c'],
    ];
    for (const [d, name, col] of refs) {
      const y = yOf(d);
      sctx.strokeStyle = d === 0 ? 'rgba(79,209,232,0.45)' : '#243049';
      sctx.beginPath();
      sctx.moveTo(x0, y);
      sctx.lineTo(x1, y);
      sctx.stroke();
      sctx.fillStyle = col;
      sctx.fillText(name, x1 + 8, Math.min(bot, Math.max(top + 14, y + 8)));
    }
    if (sparkCount < 2) return;
    const first = (sparkHead - sparkCount + SPARK_N) % SPARK_N;
    const last = (sparkHead - 1 + SPARK_N) % SPARK_N;
    const tA = sparkT[first];
    const span = Math.max(10 * PERIOD, sparkT[last] - tA);
    sctx.strokeStyle = '#e8eeff';
    sctx.lineWidth = 2.5;
    sctx.beginPath();
    let prev = NaN;
    for (let n = 0; n < sparkCount; n++) {
      const k = (first + n) % SPARK_N;
      const x = x0 + ((sparkT[k] - tA) / span) * (x1 - x0);
      const y = yOf(sparkA[k]);
      if (n === 0 || Math.abs(sparkA[k] - prev) > 180) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
      prev = sparkA[k];
    }
    sctx.stroke();
  }

  // --- Frame loop
  let uiTimer = 0;
  let sparkDrawn = -1;
  stage.onFrame((dt) => {
    if (playing && !stopped) {
      advance(dt * speed * RATE);
      cNow = jacobi(mu, s);
      cDrift = Math.abs((cNow - c0) / c0);
    }
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      updateReadouts();
      const key = sparkHead + sparkCount * SPARK_N;
      if (key !== sparkDrawn) {
        sparkDrawn = key;
        drawSpark();
      }
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Launch', key: 'launch', onClick: () => { touched = true; launch(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 10, step: 0.25, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('System');
  const fmtMu = (lg: number) => {
    const m = 10 ** lg;
    return m < 0.01 ? m.toExponential(2) : m.toFixed(4);
  };
  let muSlider: { set(v: number, emit?: boolean): void } | null = null;
  const presetSel = ui.select<PresetId>({
    key: 'preset', label: 'Two masses', value: preset,
    options: [
      { value: 'sj', label: 'Sun-Jupiter' },
      { value: 'em', label: 'Earth-Moon' },
      { value: 'routh', label: 'Above Routh' },
      { value: 'custom', label: 'Custom' },
    ],
    onChange: (v) => {
      preset = v;
      if (v !== 'custom') {
        mu = PRESETS[v].mu;
        muSlider?.set(Math.log10(mu), false);
      }
      touched = true;
      rebuildMu();
      launch();
    },
  });
  muSlider = ui.slider({
    key: 'mu', label: 'Mass ratio μ', min: -4, max: Math.log10(0.5), step: 0.005, value: Math.log10(mu), format: fmtMu,
    onInput: (v) => {
      mu = Math.min(0.5, 10 ** v);
      preset = 'custom';
      presetSel.set('custom', false);
      touched = true;
      rebuildMu();
      launch();
    },
  });
  ui.note(`L4 and L5 are stable only for μ below Routh’s limit, 0.03852.`);

  ui.section('Launch (relaunches)');
  ui.select<LName>({
    key: 'from', label: 'Start at', value: from,
    options: L_NAMES.map((n) => ({ value: n, label: n })),
    onChange: (v) => { from = v; touched = true; launch(); },
  });
  const fmtD = (v: number) => (v === 0 ? '0' : v.toFixed(3));
  ui.slider({ key: 'dr', label: 'Nudge outward', min: -0.05, max: 0.05, step: 0.001, value: dr, format: fmtD, onInput: (v) => { dr = v; touched = true; launch(); } });
  ui.slider({ key: 'dv', label: 'Kick along orbit', min: -0.05, max: 0.05, step: 0.001, value: dv, format: fmtD, onInput: (v) => { dv = v; touched = true; launch(); } });
  ui.note('Nudge moves the start away from the centre. Kick gives a speed along the direction of orbit, in the rotating frame.');

  ui.section('View');
  ui.toggle({
    key: 'inertial', label: 'Inertial frame (non-rotating)', value: inertial,
    onChange: (v) => {
      inertial = v;
      paintLegend();
      touched = true;
      trail.clear();
      place();
      lastTrailX = part.position.x;
      lastTrailZ = part.position.z;
    },
  });
  ui.toggle({ key: 'hill', label: 'Hill curves and forbidden zone', value: showHill, onChange: (v) => { showHill = v; recolour(); } });

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time', 'orbits');
  const rC = ui.readout('jacobi', 'Jacobi C');
  const rDr = ui.readout('drift', 'C drift');
  const rD = ui.readout('dist', 'distance from start L');
  const rS = ui.readout('status', 'status');
  const rL4 = ui.readout('l4', 'L4 stability');
  ui.legend([
    { color: css(PALETTE.white), label: 'particle and trail' },
    { color: css(PALETTE.green), label: 'stable L point' },
    { color: css(PALETTE.red), label: 'unstable L point' },
    { color: css(PALETTE.rose), label: 'Hill curve' },
  ]);

  function updateReadouts(): void {
    rT((t / PERIOD).toFixed(1));
    rC(cNow.toFixed(5));
    rDr(cDrift < 1e-15 ? '< 1e-15' : cDrift.toExponential(1));
    const dist = trk.dist;
    rD(dist < 1e-3 ? dist.toExponential(1) : dist.toFixed(3));
    const st = status();
    rS(st);
    const l4 = linearStability(mu, pts.L4[0], pts.L4[1]);
    rL4(l4.stable ? 'stable' : `unstable, e-fold ${(1 / (l4.growth * PERIOD)).toFixed(1)} orb`);
    legendStatus.textContent = `μ = ${fmtMu(Math.log10(mu))}   ${from}: ${st}`;
  }

  rebuildMu();
  launch();
  // Open mid-flight: one full tadpole cycle so the loop is already drawn.
  while (t < 80 && !stopped) advance(80 - t);
  cNow = jacobi(mu, s);
  cDrift = Math.abs((cNow - c0) / c0);
  drawSpark();
  updateReadouts();
  touched = false;

  return {
    state: () => ({
      t,
      orbits: t / PERIOD,
      mu,
      preset,
      from,
      dr,
      dv,
      touched,
      inertial,
      jacobi: cNow,
      cDrift,
      dist: trk.dist,
      maxDist: trk.maxDist,
      tadpoleOrbits: trk.tadpoleT / PERIOD,
      swing: trk.swing,
      horseshoe: trk.horseshoe,
      stopped: stopped !== '',
      status: status(),
      l4Stable: mu < ROUTH_MU,
    }),
    dispose: () => {
      legend.remove();
      spark.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'lagrange-points',
  number: 4,
  symbol: 'Lg',
  title: 'Lagrange Points',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'The five parking spots where gravity and orbit balance.',
  content,
  mount,
};

export default topic;
