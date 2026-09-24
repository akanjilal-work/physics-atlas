import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  DCHI2_LEVELS, GRID, accel, Z_MAX_DATA, buildHistory, chi2Model, chi2Pvalue, comovingTable, deDensity, fitGrid, generateSN,
  gridOl, gridOm, hasBounce, lcdm, lookbackFromHistory, muFromTable, omegaK, q0,
  type GridFit, type History, type Model, type SNData,
} from './physics.ts';

type View = 'hubble' | 'plane' | 'history';
type Source = 'nature' | 'sliders';

const NATURE: Model = { Om: 0.3, Ode: 0.7, w0: -1, wa: 0 };
const MAX_SN = 600;
const NR = 160; // ribbon samples
const NT = 300; // comoving table steps
const H0 = 70;

// ---------------------------------------------------------------- view 1 mapping (Hubble diagram)
const HX0 = -4;
const HX1 = 4;
const HY0 = -2;
const HY1 = 2.2;
const RES_LO = -0.9;
const RES_HI = 0.6;
const MU_LO = 33;
const MU_HI = 46.5;
const hx = (z: number) => HX0 + (z / Z_MAX_DATA) * (HX1 - HX0);
const hyRes = (d: number) => HY0 + ((d - RES_LO) / (RES_HI - RES_LO)) * (HY1 - HY0);
const hyMu = (m: number) => HY0 + ((m - MU_LO) / (MU_HI - MU_LO)) * (HY1 - HY0);
const RIB_W = 0.42;

// ---------------------------------------------------------------- view 2 mapping (Ω plane)
const PX0 = -4;
const PX1 = 4;
const PZ_NEAR = 3.2; // Ω_Λ = −1
const PZ_FAR = -3.2; // Ω_Λ = 3
const HMAX = 2.3;
const px = (om: number) => PX0 + ((om - GRID.omMin) / (GRID.omMax - GRID.omMin)) * (PX1 - PX0);
const pz = (ol: number) => PZ_NEAR + ((ol - GRID.olMin) / (GRID.olMax - GRID.olMin)) * (PZ_FAR - PZ_NEAR);
const LOG_CAP = Math.log(1 + 1000);
const heightOf = (d: number) => (Number.isFinite(d) ? HMAX * Math.min(1, Math.log(1 + Math.max(0, d) / 2) / LOG_CAP) : HMAX);

// ---------------------------------------------------------------- view 3 mapping (a(t))
const T_LO = -15;
const T_HI = 25;
const A_TOP = 3.4;
const tx = (t: number) => -4.5 + ((t - T_LO) / (T_HI - T_LO)) * 9;
const ay = (a: number) => -1.6 + (Math.min(a, A_TOP) / A_TOP) * 4.1;
const W_MIN = -1.4;
const W_MAX = 0;
const NW = 29; // rows of constant w
const NS = 200; // time samples per row
/** Depth of the row with equation of state w: w = −1.4 at the back, w = 0 at the front. */
const zw = (w: number) => -2.4 + ((w - W_MIN) / (W_MAX - W_MIN)) * 4.2;
const Z_USER = 2.5;

const COL = {
  lcdm: PALETTE.amber,
  matter: PALETTE.cyan,
  empty: PALETTE.violet,
  cpl: PALETTE.rose,
  fit: PALETTE.green,
  decel: 0x3aa7c9,
  accel: PALETTE.amber,
};

const CAM: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  hubble: { pos: [1.4, 1.9, 11.6], target: [0.4, 1.1, 0] },
  plane: { pos: [-0.9, 7.4, 7.4], target: [-0.3, 0, 0.3] },
  history: { pos: [-2.0, 2.0, 12.6], target: [-0.1, 0.7, -0.4] },
};

function stripIndex(n: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return idx;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.hubble.pos, target: CAM.hubble.target, fov: 42, near: 0.05, far: 200 });
  const { scene, camera, renderer } = stage;

  // ------------------------------------------------------------ state
  const user: Model = { Om: 0.3, Ode: 0.7, w0: -0.75, wa: -0.85 };
  const userL: Model = lcdm(0.3, 0.7);
  let view: View = 'hubble';
  let source: Source = 'nature';
  let nSN = 120;
  let scatter = 0.15;
  let seed = 1998;
  let residual = true;
  let data: SNData = generateSN(NATURE, nSN, scatter, seed);
  let fit: GridFit | null = null;
  let fitStale = false;
  let fitByUser = false;
  let fitAnim = 1;
  let modelDirty = true;
  let dataDirty = true;
  let touched = false;
  let hist: History = buildHistory(user);
  let chiL = 0;
  let chiW = 0;
  let chiM = 0;
  let chiE = 0;

  const scratch = { tab: new Float64Array(NT + 1), mu: new Float64Array(MAX_SN) };
  const tab = new Float64Array(NT + 1);
  const zR = new Float64Array(NR + 1);
  for (let i = 0; i <= NR; i++) zR[i] = 0.01 + ((Z_MAX_DATA - 0.01) * i) / NR;
  const muR = new Float64Array(NR + 1);
  const muEmpty = new Float64Array(NR + 1);
  {
    comovingTable(lcdm(0, 0), Z_MAX_DATA, NT, tab);
    muFromTable(lcdm(0, 0), tab, Z_MAX_DATA, NT, zR, NR + 1, H0, muEmpty);
  }
  // Empty-universe μ at each supernova redshift (for residuals).
  const muEmptySN = new Float64Array(MAX_SN);

  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // ============================================================ VIEW 1: Hubble diagram
  const gH = new THREE.Group();
  scene.add(gH);
  {
    // back wall and floor grids
    const seg: number[] = [];
    const zb = -1.1;
    for (let z = 0; z <= 1.5001; z += 0.25) seg.push(hx(z), HY0, zb, hx(z), HY1, zb, hx(z), HY0 - 0.001, zb, hx(z), HY0 - 0.001, 1.3);
    for (let k = 0; k <= 8; k++) {
      const y = HY0 + ((HY1 - HY0) * k) / 8;
      seg.push(HX0, y, zb, HX1, y, zb);
    }
    seg.push(HX0, HY0, 1.3, HX1, HY0, 1.3, HX0, HY0, zb, HX0, HY0, 1.3, HX1, HY0, zb, HX1, HY0, 1.3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    gH.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.9 })));
  }
  stage.label('redshift z', [hx(0.75), HY0 - 0.55, 1.3], 'muted', gH);
  for (let z = 0; z <= 1.5001; z += 0.25) stage.label(z.toFixed(2).replace(/0$/, ''), [hx(z), HY0 - 0.25, 1.3], 'muted', gH);
  const yTitle = stage.label('', [HX0 - 0.6, HY1 + 0.2, -1.1], '', gH);
  // Y tick labels: residual set and μ set.
  const resTicks: ReturnType<typeof stage.label>[] = [];
  for (const d of [-0.75, -0.5, -0.25, 0, 0.25, 0.5]) resTicks.push(stage.label(d > 0 ? `+${d}` : String(d), [HX0 - 0.35, hyRes(d), -1.1], 'muted', gH));
  const muTicks: ReturnType<typeof stage.label>[] = [];
  for (let m = 34; m <= 46; m += 2) muTicks.push(stage.label(String(m), [HX0 - 0.35, hyMu(m), -1.1], 'muted', gH));
  // Lookback-time axis along the top of the back wall.
  const LB_T = [2, 4, 6, 8, 10];
  const lbLabels = LB_T.map((t) => stage.label(`${t} Gyr`, [0, HY1 + 0.12, -1.1], 'muted', gH));
  lbLabels.forEach((l) => (l.element.style.color = '#c9b27a'));
  const lbTitle = stage.label('lookback time (your w₀–wₐ universe)', [hx(1.0), HY1 + 0.5, -1.1], 'muted', gH);
  lbTitle.element.style.color = '#c9b27a';
  const lbTickPos = new Float32Array(LB_T.length * 6);
  const lbTickGeo = new THREE.BufferGeometry();
  lbTickGeo.setAttribute('position', new THREE.BufferAttribute(lbTickPos, 3));
  const lbTicks = new THREE.LineSegments(lbTickGeo, new THREE.LineBasicMaterial({ color: 0x8a7a55, transparent: true, opacity: 0.8 }));
  lbTicks.frustumCulled = false;
  gH.add(lbTicks);

  // Ribbons
  interface Ribbon { pos: Float32Array; mesh: THREE.Mesh; line: THREE.Line; linePos: Float32Array; label: ReturnType<typeof stage.label> }
  const ribIdx = stripIndex(NR);
  function makeRibbon(color: number, name: string, z: number): Ribbon {
    const pos = new Float32Array((NR + 1) * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(ribIdx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    mesh.frustumCulled = false;
    gH.add(mesh);
    const linePos = new Float32Array((NR + 1) * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color }));
    line.frustumCulled = false;
    gH.add(line);
    for (let i = 0; i <= NR; i++) {
      pos[i * 6 + 2] = z - RIB_W;
      pos[i * 6 + 5] = z + RIB_W;
      linePos[i * 3 + 2] = z + RIB_W;
    }
    const label = stage.label(name, [0, 0, 0], '', gH);
    label.element.style.color = css(color);
    return { pos, mesh, line, linePos, label };
  }
  const ribEmpty = makeRibbon(COL.empty, 'empty', 0);
  const ribMatter = makeRibbon(COL.matter, 'matter only', 0);
  const ribL = makeRibbon(COL.lcdm, 'ΛCDM', 0);
  const ribW = makeRibbon(COL.cpl, 'w₀–wₐ', 0);

  function fillRibbon(r: Ribbon, m: Model | null): void {
    let ok = true;
    if (m) {
      ok = comovingTable(m, Z_MAX_DATA, NT, tab) && muFromTable(m, tab, Z_MAX_DATA, NT, zR, NR + 1, H0, muR);
    } else muR.set(muEmpty);
    r.mesh.visible = ok;
    r.line.visible = ok;
    r.label.visible = ok;
    if (!ok) return;
    for (let i = 0; i <= NR; i++) {
      const x = hx(zR[i]);
      const y = residual ? hyRes(Math.max(RES_LO - 0.3, Math.min(RES_HI + 0.3, muR[i] - muEmpty[i]))) : hyMu(muR[i]);
      r.pos[i * 6] = x;
      r.pos[i * 6 + 1] = y;
      r.pos[i * 6 + 3] = x;
      r.pos[i * 6 + 4] = y;
      r.linePos[i * 3] = x;
      r.linePos[i * 3 + 1] = y;
    }
    (r.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (r.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    r.label.position.set(HX1 + 0.55, r.linePos[NR * 3 + 1], 0);
  }
  function spreadRibbonLabels(): void {
    const list = [ribEmpty, ribMatter, ribL, ribW].filter((r) => r.label.visible).sort((a, b) => a.label.position.y - b.label.position.y);
    for (let i = 1; i < list.length; i++) {
      const lo = list[i - 1].label.position.y + 0.26;
      if (list[i].label.position.y < lo) list[i].label.position.y = lo;
    }
  }

  // Supernovae: flashing points with a custom shader, plus error bars.
  const snPos = new Float32Array(MAX_SN * 3);
  const snPhase = new Float32Array(MAX_SN);
  const snDepth = new Float32Array(MAX_SN);
  {
    let s = 91;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < MAX_SN; i++) {
      snPhase[i] = r();
      snDepth[i] = (r() - 0.5) * 0.7;
    }
  }
  const snGeo = new THREE.BufferGeometry();
  snGeo.setAttribute('position', new THREE.BufferAttribute(snPos, 3));
  snGeo.setAttribute('aPhase', new THREE.BufferAttribute(snPhase, 1));
  const snUniforms = { uTime: { value: 0 }, uScale: { value: 600 }, uMap: { value: glowTex } };
  const snMat = new THREE.ShaderMaterial({
    uniforms: snUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform float uScale;
      varying float vFlash;
      void main() {
        float f = fract(uTime * 0.16 + aPhase);
        float flash = exp(-f * 9.0) * step(0.0, f);
        vFlash = flash;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.1 + 0.26 * flash) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vFlash;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        vec3 base = vec3(1.0, 0.93, 0.78);
        vec3 col = mix(base * 0.85, vec3(1.0), vFlash);
        gl_FragColor = vec4(col * (0.75 + 1.6 * vFlash), a);
      }`,
  });
  const snPoints = new THREE.Points(snGeo, snMat);
  snPoints.frustumCulled = false;
  gH.add(snPoints);
  const ebPos = new Float32Array(MAX_SN * 6);
  const ebGeo = new THREE.BufferGeometry();
  ebGeo.setAttribute('position', new THREE.BufferAttribute(ebPos, 3));
  const errBars = new THREE.LineSegments(ebGeo, new THREE.LineBasicMaterial({ color: 0xbfae8a, transparent: true, opacity: 0.35, depthWrite: false }));
  errBars.frustumCulled = false;
  gH.add(errBars);

  function placeSN(): void {
    const n = data.n;
    comovingTable(lcdm(0, 0), Z_MAX_DATA, NT, tab);
    muFromTable(lcdm(0, 0), tab, Z_MAX_DATA, NT, data.z, n, H0, muEmptySN);
    for (let i = 0; i < n; i++) {
      const x = hx(data.z[i]);
      const toY = (m: number) => (residual ? hyRes(Math.max(RES_LO - 0.2, Math.min(RES_HI + 0.2, m - muEmptySN[i]))) : hyMu(m));
      const y = toY(data.mu[i]);
      const zz = snDepth[i];
      snPos[i * 3] = x;
      snPos[i * 3 + 1] = y;
      snPos[i * 3 + 2] = zz;
      ebPos[i * 6] = x;
      ebPos[i * 6 + 1] = toY(data.mu[i] - data.sigma[i]);
      ebPos[i * 6 + 2] = zz;
      ebPos[i * 6 + 3] = x;
      ebPos[i * 6 + 4] = toY(data.mu[i] + data.sigma[i]);
      ebPos[i * 6 + 5] = zz;
    }
    snGeo.setDrawRange(0, n);
    ebGeo.setDrawRange(0, n * 2);
    (snGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ebGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function setAxisMode(): void {
    resTicks.forEach((l) => (l.visible = residual));
    muTicks.forEach((l) => (l.visible = !residual));
    yTitle.element.textContent = residual ? 'Δμ = μ − μ(empty)   fainter ↑' : 'distance modulus μ   fainter ↑';
  }

  function updateLookbackAxis(): void {
    for (let k = 0; k < LB_T.length; k++) {
      // Find z whose lookback time is LB_T[k] by bisection on the integrated history.
      let lo = 0;
      let hi = Z_MAX_DATA;
      const lbMax = lookbackFromHistory(hist, Z_MAX_DATA);
      const ok = Number.isFinite(lbMax) && lbMax > LB_T[k];
      lbLabels[k].visible = ok;
      if (!ok) {
        lbTickPos.fill(0, k * 6, k * 6 + 6);
        continue;
      }
      for (let it = 0; it < 40; it++) {
        const mid = 0.5 * (lo + hi);
        if (lookbackFromHistory(hist, mid) < LB_T[k]) lo = mid;
        else hi = mid;
      }
      const x = hx(0.5 * (lo + hi));
      lbLabels[k].position.set(x, HY1 + 0.14, -1.1);
      lbTickPos.set([x, HY1, -1.1, x, HY1 - 0.12, -1.1], k * 6);
    }
    lbTickGeo.attributes.position.needsUpdate = true;
  }

  // ============================================================ VIEW 2: Ω_m–Ω_Λ plane
  const gP = new THREE.Group();
  gP.visible = false;
  scene.add(gP);
  const gSurf = new THREE.Group();
  gP.add(gSurf);
  {
    const seg: number[] = [];
    for (let om = 0; om <= 2.5001; om += 0.5) seg.push(px(om), 0, pz(-1), px(om), 0, pz(3));
    for (let ol = -1; ol <= 3.0001; ol += 0.5) seg.push(px(0), 0, pz(ol), px(2.5), 0, pz(ol));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    gP.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.grid })));
  }
  for (let om = 0; om <= 2.5001; om += 0.5) stage.label(om.toFixed(1), [px(om), 0, pz(-1) + 0.35], 'muted', gP);
  for (let ol = -1; ol <= 3.0001; ol += 1) stage.label(ol.toFixed(0), [px(0) - 0.35, 0, pz(ol)], 'muted', gP);
  stage.label('Ω_m  (matter)', [px(1.25), 0, pz(-1) + 0.8], '', gP);
  stage.label('Ω_Λ (dark energy)', [px(0) - 0.9, 0, pz(2.5)], '', gP);

  const nx = GRID.nx;
  const ny = GRID.ny;
  const surfPos = new Float32Array(nx * ny * 3);
  const surfCol = new Float32Array(nx * ny * 3);
  const bounceMask = new Uint8Array(nx * ny);
  {
    const m = lcdm(0, 0);
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const k = iy * nx + ix;
        surfPos[k * 3] = px(gridOm(GRID, ix));
        surfPos[k * 3 + 2] = pz(gridOl(GRID, iy));
        m.Om = gridOm(GRID, ix);
        m.Ode = gridOl(GRID, iy);
        bounceMask[k] = hasBounce(m) ? 1 : 0;
      }
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(surfPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(surfCol, 3));
  {
    const idx: number[] = [];
    for (let iy = 0; iy < ny - 1; iy++)
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iy * nx + ix;
        idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
      }
    surfGeo.setIndex(idx);
  }
  const surfMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  gSurf.add(surf);
  // Wire lines every 4 cells
  const wireSegs = (Math.floor((nx - 1) / 4) + 1) * (ny - 1) + (Math.floor((ny - 1) / 4) + 1) * (nx - 1);
  const wirePos = new Float32Array(wireSegs * 6);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  const wire = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x0c1220, transparent: true, opacity: 0.55 }));
  wire.frustumCulled = false;
  gSurf.add(wire);

  const dGrid = new Float64Array(nx * ny);
  const hGrid = new Float64Array(nx * ny);

  function surfaceHeightAt(om: number, ol: number): number {
    if (!fit) return 0;
    const fx = ((om - GRID.omMin) / (GRID.omMax - GRID.omMin)) * (nx - 1);
    const fy = ((ol - GRID.olMin) / (GRID.olMax - GRID.olMin)) * (ny - 1);
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const iy = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
    const u = Math.max(0, Math.min(1, fx - ix));
    const v = Math.max(0, Math.min(1, fy - iy));
    const h00 = hGrid[iy * nx + ix];
    const h10 = hGrid[iy * nx + ix + 1];
    const h01 = hGrid[(iy + 1) * nx + ix];
    const h11 = hGrid[(iy + 1) * nx + ix + 1];
    return (1 - v) * ((1 - u) * h00 + u * h10) + v * ((1 - u) * h01 + u * h11);
  }

  // Contours (marching squares), flat rings at the height of their Δχ² level.
  const MAX_CSEG = 6000;
  const conPos = new Float32Array(MAX_CSEG * 6);
  const conCol = new Float32Array(MAX_CSEG * 6);
  const conGeo = new THREE.BufferGeometry();
  conGeo.setAttribute('position', new THREE.BufferAttribute(conPos, 3));
  conGeo.setAttribute('color', new THREE.BufferAttribute(conCol, 3));
  const contours = new THREE.LineSegments(conGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
  contours.renderOrder = 5;
  contours.frustumCulled = false;
  gSurf.add(contours);
  const LEVEL_COL = [new THREE.Color(0xffffff), new THREE.Color(PALETTE.amber), new THREE.Color(PALETTE.rose)];

  // Draped region lines: flat, q0 = 0, and the no-Big-Bang boundary.
  const DR = 80;
  function makeDrape(color: number, dashed = false): { pos: Float32Array; line: THREE.Line; om: Float64Array; ol: Float64Array } {
    const pos = new Float32Array((DR + 1) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.14, gapSize: 0.09, depthTest: false, transparent: true })
      : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    const line = new THREE.Line(g, mat);
    line.renderOrder = 4;
    line.frustumCulled = false;
    gSurf.add(line);
    return { pos, line, om: new Float64Array(DR + 1), ol: new Float64Array(DR + 1) };
  }
  const flatLine = makeDrape(0xdfe6f3, true);
  const accLine = makeDrape(PALETTE.amber);
  const bangLine = makeDrape(0x9aa6bd);
  for (let i = 0; i <= DR; i++) {
    const om = (2.0 * i) / DR;
    flatLine.om[i] = om;
    flatLine.ol[i] = 1 - om;
    const om2 = (2.5 * i) / DR;
    accLine.om[i] = om2;
    accLine.ol[i] = om2 / 2;
  }
  {
    // No-Big-Bang boundary by bisection in Ω_Λ for each Ω_m, while it stays below Ω_Λ = 3.
    const m = lcdm(0, 0);
    for (let i = 0; i <= DR; i++) {
      const om = (0.5 * i) / DR;
      let lo = 0.5;
      let hi = 4.5;
      m.Om = om;
      for (let k = 0; k < 40; k++) {
        m.Ode = 0.5 * (lo + hi);
        if (hasBounce(m)) hi = m.Ode;
        else lo = m.Ode;
      }
      bangLine.om[i] = om;
      bangLine.ol[i] = Math.min(3, lo);
    }
  }
  function drape(d: ReturnType<typeof makeDrape>): void {
    for (let i = 0; i <= DR; i++) {
      d.pos[i * 3] = px(d.om[i]);
      d.pos[i * 3 + 1] = surfaceHeightAt(d.om[i], d.ol[i]) + 0.025;
      d.pos[i * 3 + 2] = pz(d.ol[i]);
    }
    d.line.geometry.attributes.position.needsUpdate = true;
    d.line.computeLineDistances();
  }

  // Region labels
  const regionLabels: { l: ReturnType<typeof stage.label>; om: number; ol: number }[] = [];
  const addRegion = (text: string, om: number, ol: number, color: string) => {
    const l = stage.label(text, [px(om), 0.3, pz(ol)], 'muted', gSurf);
    l.element.style.color = color;
    regionLabels.push({ l, om, ol });
  };
  addRegion('accelerating  q₀ < 0', 1.05, 1.35, css(PALETTE.amber));
  addRegion('decelerating  q₀ > 0', 1.85, 0.25, '#7fb7d8');
  addRegion('flat  Ω_k = 0', 1.8, -0.6, '#dfe6f3');
  addRegion('no Big Bang', 0.25, 2.6, '#9aa6bd');

  // Markers
  const mkMarker = (color: number, text: string) => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.075, 18, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
    s.renderOrder = 6;
    g.add(s);
    const l = stage.label(text, [0, 0.28, 0], '', g);
    l.element.style.color = css(color);
    gSurf.add(g);
    return g;
  };
  const mBest = mkMarker(COL.fit, 'best fit');
  const mUser = mkMarker(COL.cpl, 'your Ω');
  const mTruth = mkMarker(0xffffff, 'truth');
  (mTruth.children[1] as THREE.Object3D).position.set(0.35, -0.05, 0.25);
  const mEds = mkMarker(COL.matter, 'matter only');
  const mEmpty = mkMarker(COL.empty, 'empty');
  const placeMarker = (g: THREE.Group, om: number, ol: number) => {
    g.visible = om >= GRID.omMin && om <= GRID.omMax && ol >= GRID.olMin && ol <= GRID.olMax;
    g.position.set(px(om), surfaceHeightAt(om, ol) + 0.06, pz(ol));
  };

  const cA = new THREE.Color();
  const cValley = new THREE.Color(0x5ee3c0);
  const cLow = new THREE.Color(0x2a6f9a);
  const cHigh = new THREE.Color(0x1b1733);
  const cBang = new THREE.Color(0x3a3440);
  const cFlat = new THREE.Color(0x1a2438);

  function buildSurface(): void {
    const has = fit !== null;
    for (let k = 0; k < nx * ny; k++) {
      const d = has ? fit!.chi2[k] - fit!.chi2Min : Infinity;
      dGrid[k] = d;
      const h = has ? heightOf(d) : 0;
      hGrid[k] = h;
      surfPos[k * 3 + 1] = h;
      if (!has) cA.copy(cFlat);
      else if (d < DCHI2_LEVELS[2]) cA.copy(cValley).lerp(cLow, Math.sqrt(d / DCHI2_LEVELS[2]) * 0.8);
      else cA.copy(cLow).lerp(cHigh, Math.min(1, h / HMAX) ** 0.6);
      if (bounceMask[k]) cA.lerp(cBang, 0.75);
      surfCol[k * 3] = cA.r;
      surfCol[k * 3 + 1] = cA.g;
      surfCol[k * 3 + 2] = cA.b;
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
    surfGeo.computeBoundingSphere();
    // wire
    let w = 0;
    for (let ix = 0; ix < nx; ix += 4)
      for (let iy = 0; iy < ny - 1; iy++) {
        const a = iy * nx + ix;
        const b = a + nx;
        wirePos.set([surfPos[a * 3], surfPos[a * 3 + 1] + 0.004, surfPos[a * 3 + 2], surfPos[b * 3], surfPos[b * 3 + 1] + 0.004, surfPos[b * 3 + 2]], w);
        w += 6;
      }
    for (let iy = 0; iy < ny; iy += 4)
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iy * nx + ix;
        const b = a + 1;
        wirePos.set([surfPos[a * 3], surfPos[a * 3 + 1] + 0.004, surfPos[a * 3 + 2], surfPos[b * 3], surfPos[b * 3 + 1] + 0.004, surfPos[b * 3 + 2]], w);
        w += 6;
      }
    wireGeo.setDrawRange(0, w / 3);
    wireGeo.attributes.position.needsUpdate = true;
    // contours
    let ns = 0;
    if (has) {
      for (let L = 0; L < DCHI2_LEVELS.length; L++) {
        const lev = DCHI2_LEVELS[L];
        const y = heightOf(lev) + 0.02;
        const col = LEVEL_COL[L];
        for (let iy = 0; iy < ny - 1 && ns < MAX_CSEG; iy++)
          for (let ix = 0; ix < nx - 1 && ns < MAX_CSEG; ix++) {
            const k = iy * nx + ix;
            const v = [dGrid[k], dGrid[k + 1], dGrid[k + nx + 1], dGrid[k + nx]].map((x) => (Number.isFinite(x) ? x : 1e9));
            const cx = [ix, ix + 1, ix + 1, ix];
            const cy = [iy, iy, iy + 1, iy + 1];
            const pts: number[] = [];
            for (let e = 0; e < 4; e++) {
              const a = v[e];
              const b = v[(e + 1) % 4];
              if ((a < lev) !== (b < lev)) {
                const f = (lev - a) / (b - a);
                const gx = cx[e] + f * (cx[(e + 1) % 4] - cx[e]);
                const gy = cy[e] + f * (cy[(e + 1) % 4] - cy[e]);
                pts.push(px(GRID.omMin + (gx / (nx - 1)) * (GRID.omMax - GRID.omMin)), pz(GRID.olMin + (gy / (ny - 1)) * (GRID.olMax - GRID.olMin)));
              }
            }
            for (let p = 0; p + 3 < pts.length + 0 && ns < MAX_CSEG; p += 4) {
              conPos.set([pts[p], y, pts[p + 1], pts[p + 2], y, pts[p + 3]], ns * 6);
              conCol.set([col.r, col.g, col.b, col.r, col.g, col.b], ns * 6);
              ns++;
            }
          }
      }
    }
    conGeo.setDrawRange(0, ns * 2);
    conGeo.attributes.position.needsUpdate = true;
    conGeo.attributes.color.needsUpdate = true;
    drape(flatLine);
    drape(accLine);
    drape(bangLine);
    for (const r of regionLabels) r.l.position.set(px(r.om), surfaceHeightAt(r.om, r.ol) + 0.25, pz(r.ol));
    placeMarker(mEds, 1, 0);
    placeMarker(mEmpty, 0, 0);
    placeMarker(mTruth, NATURE.Om, NATURE.Ode);
    mTruth.visible = source === 'nature';
    if (fit) placeMarker(mBest, fit.bestOm, fit.bestOl);
    mBest.visible = fit !== null;
    placeMarker(mUser, user.Om, user.Ode);
  }

  function runFit(byUser: boolean): void {
    fit = fitGrid(data);
    fitStale = false;
    if (byUser) {
      fitByUser = true;
      fitAnim = 0;
    }
    buildSurface();
    surfMat.opacity = 0.92;
  }

  // ============================================================ VIEW 3: expansion history surface a(t, w)
  const gX = new THREE.Group();
  gX.visible = false;
  scene.add(gX);
  const ZB = zw(W_MAX) - 0.1;
  {
    const seg: number[] = [];
    for (let t = -10; t <= 20; t += 10) seg.push(tx(t), ay(0), ZB, tx(t), ay(A_TOP), ZB, tx(t), ay(0), ZB, tx(t), ay(0), Z_USER + 0.3);
    for (let a = 0; a <= 3; a++) seg.push(tx(T_LO), ay(a), ZB, tx(T_HI), ay(a), ZB, tx(T_LO), ay(a), ZB, tx(T_LO), ay(a), Z_USER + 0.3);
    seg.push(tx(T_LO), ay(0), ZB, tx(T_LO), ay(A_TOP), ZB, tx(T_LO), ay(0), Z_USER + 0.3, tx(T_LO), ay(A_TOP), Z_USER + 0.3);
    seg.push(tx(T_LO), ay(0), Z_USER + 0.3, tx(T_HI), ay(0), Z_USER + 0.3, tx(T_LO), ay(0), ZB, tx(T_LO), ay(0), Z_USER + 0.3, tx(T_HI), ay(0), ZB, tx(T_HI), ay(0), Z_USER + 0.3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    gX.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.grid })));
    // today: every universe has a = 1 now
    const edge = new THREE.BufferGeometry();
    edge.setAttribute('position', new THREE.Float32BufferAttribute([tx(0), ay(0), ZB, tx(0), ay(0), Z_USER + 0.3, tx(0), ay(1), ZB, tx(0), ay(1), Z_USER + 0.3], 3));
    gX.add(new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.55 })));
  }
  stage.label('today, a = 1', [tx(0), ay(1) + 0.25, ZB], '', gX);
  stage.label('time from today (Gyr)', [tx(5), ay(0) - 0.6, Z_USER + 0.3], 'muted', gX);
  for (let t = -10; t <= 20; t += 10) stage.label(`${t > 0 ? '+' : ''}${t}`, [tx(t), ay(0) - 0.25, Z_USER + 0.3], 'muted', gX);
  stage.label('scale factor a', [tx(T_LO) - 0.2, ay(A_TOP) + 0.3, Z_USER + 0.3], 'muted', gX);
  for (let a = 0; a <= 3; a++) stage.label(String(a), [tx(T_LO) - 0.3, ay(a), Z_USER + 0.3], 'muted', gX);

  // Surface
  const xPos = new Float32Array(NW * NS * 3);
  const xCol = new Float32Array(NW * NS * 3);
  const xGeo = new THREE.BufferGeometry();
  xGeo.setAttribute('position', new THREE.BufferAttribute(xPos, 3));
  xGeo.setAttribute('color', new THREE.BufferAttribute(xCol, 3));
  {
    const idx: number[] = [];
    for (let r = 0; r < NW - 1; r++)
      for (let j = 0; j < NS - 1; j++) {
        const a = r * NS + j;
        idx.push(a, a + 1, a + NS, a + 1, a + NS + 1, a + NS);
      }
    xGeo.setIndex(idx);
  }
  const xSurf = new THREE.Mesh(xGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
  xSurf.frustumCulled = false;
  gX.add(xSurf);
  // Highlighted rows (w = 0, −1/3, −1) as brighter lines
  const HL = [0, -1 / 3, -1, W_MIN];
  const hlObjs = HL.map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xdfe6f3, transparent: true, opacity: 0.7 }));
    l.frustumCulled = false;
    gX.add(l);
    return l;
  });
  const hlLines = hlObjs.map((l) => l.geometry.attributes.position.array as Float32Array);
  const hlLabels = ['w = 0', 'w = −1/3', 'w = −1', `w = ${W_MIN}`.replace('-', '−')].map((t) => stage.label(t, [0, 0, 0], 'muted', gX));
  // Onset of acceleration across rows
  const onsetPos = new Float32Array(NW * 3);
  const onsetGeo = new THREE.BufferGeometry();
  onsetGeo.setAttribute('position', new THREE.BufferAttribute(onsetPos, 3));
  const onsetLine = new THREE.Line(onsetGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, depthTest: false, transparent: true }));
  onsetLine.renderOrder = 4;
  onsetLine.frustumCulled = false;
  gX.add(onsetLine);
  const onsetLabel = stage.label('acceleration begins', [0, 0, 0], '', gX);
  onsetLabel.element.style.color = css(PALETTE.green);

  // Your w0–wa curve as a ribbon in front
  const uPos = new Float32Array(NS * 2 * 3);
  const uCol = new Float32Array(NS * 2 * 3);
  const uGeo = new THREE.BufferGeometry();
  uGeo.setAttribute('position', new THREE.BufferAttribute(uPos, 3));
  uGeo.setAttribute('color', new THREE.BufferAttribute(uCol, 3));
  uGeo.setIndex(stripIndex(NS - 1));
  const uMesh = new THREE.Mesh(uGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  uMesh.frustumCulled = false;
  gX.add(uMesh);
  const uLinePos = new Float32Array(NS * 3);
  const uLineGeo = new THREE.BufferGeometry();
  uLineGeo.setAttribute('position', new THREE.BufferAttribute(uLinePos, 3));
  const uLine = new THREE.Line(uLineGeo, new THREE.LineBasicMaterial({ color: COL.cpl }));
  uLine.frustumCulled = false;
  gX.add(uLine);
  const uLabel = stage.label('your w₀–wₐ', [0, 0, 0], '', gX);
  uLabel.element.style.color = css(COL.cpl);
  const uDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  gX.add(uDot);

  const cDec = new THREE.Color(COL.decel);
  const cAcc = new THREE.Color(COL.accel);
  const cNone = new THREE.Color(0x0b0f18);
  const famModel: Model = { Om: 0, Ode: 0, w0: -1, wa: 0 };
  const isAcc = (m: Model, a: number) => a > 0 && accel(m, a) > 0;

  /** Samples a(t) of a history on the common time grid. Returns NaN before the Big Bang. */
  function sampleRow(h: History, out: Float64Array): void {
    let j = 0;
    const bang = !h.bounce && Number.isFinite(h.age);
    for (let s = 0; s < NS; s++) {
      const t = T_LO + ((T_HI - T_LO) * s) / (NS - 1);
      if (t < h.t[0]) {
        out[s] = bang ? (t < -h.age ? 0 : h.a[0]) : NaN;
        continue;
      }
      if (t > h.t[h.n - 1]) {
        out[s] = h.a[h.n - 1];
        continue;
      }
      while (j < h.n - 2 && h.t[j + 1] < t) j++;
      const f = Math.max(0, Math.min(1, (t - h.t[j]) / (h.t[j + 1] - h.t[j] || 1)));
      out[s] = h.a[j] + f * (h.a[j + 1] - h.a[j]);
    }
  }
  const rowA = new Float64Array(NS);

  function buildHistories(): void {
    famModel.Om = user.Om;
    famModel.Ode = user.Ode;
    let n = 0;
    for (let r = 0; r < NW; r++) {
      const w = W_MIN + ((W_MAX - W_MIN) * r) / (NW - 1);
      famModel.w0 = w;
      const h = buildHistory(famModel, { tPast: -T_LO + 1, tFuture: T_HI + 1, aMax: A_TOP + 0.5, eps: 0.008 });
      sampleRow(h, rowA);
      const z = zw(w);
      for (let s = 0; s < NS; s++) {
        const t = T_LO + ((T_HI - T_LO) * s) / (NS - 1);
        const a = rowA[s];
        const k = (r * NS + s) * 3;
        const valid = Number.isFinite(a);
        // Before the Big Bang, collapse the row onto its starting point so no curtain is drawn.
        const tB = h.bounce ? h.t[0] : Number.isFinite(h.age) ? -h.age : T_LO;
        xPos[k] = tx(valid && a > 0 ? t : Math.max(T_LO, tB));
        xPos[k + 1] = ay(valid && a > 0 ? a : h.bounce ? h.a[0] : 0);
        xPos[k + 2] = z;
        const c = !valid || a <= 0 ? cNone : isAcc(famModel, a) ? cAcc : cDec;
        const dim = a > A_TOP ? 0.45 : 1;
        xCol[k] = c.r * dim;
        xCol[k + 1] = c.g * dim;
        xCol[k + 2] = c.b * dim;
      }
      const hi = HL.findIndex((x) => Math.abs(x - w) < 1e-9);
      if (hi >= 0) {
        let lastS = 0;
        for (let s = 0; s < NS; s++) {
          hlLines[hi].set([xPos[(r * NS + s) * 3], xPos[(r * NS + s) * 3 + 1] + 0.01, z], s * 3);
          if (rowA[s] <= A_TOP) lastS = s;
        }
        hlLabels[hi].position.set(xPos[(r * NS + lastS) * 3] + 0.5, xPos[(r * NS + lastS) * 3 + 1] + 0.1, z);
      }
      if (Number.isFinite(h.aAcc) && h.tAcc >= T_LO && h.tAcc <= T_HI && h.aAcc <= A_TOP) {
        onsetPos.set([tx(h.tAcc), ay(h.aAcc) + 0.02, z], n * 3);
        n++;
      }
    }
    xGeo.attributes.position.needsUpdate = true;
    xGeo.attributes.color.needsUpdate = true;
    hlObjs.forEach((l) => (l.geometry.attributes.position.needsUpdate = true));
    onsetGeo.setDrawRange(0, n);
    onsetGeo.attributes.position.needsUpdate = true;
    onsetLabel.visible = n > 0;
    if (n > 0) onsetLabel.position.set(onsetPos[(n - 1) * 3] + 0.2, onsetPos[(n - 1) * 3 + 1] + 0.3, onsetPos[(n - 1) * 3 + 2]);
    // your curve
    sampleRow(hist, rowA);
    let last = 0;
    for (let s = 0; s < NS; s++) {
      const t = T_LO + ((T_HI - T_LO) * s) / (NS - 1);
      const a = rowA[s];
      const valid = Number.isFinite(a);
      const tB = hist.bounce ? hist.t[0] : Number.isFinite(hist.age) ? -hist.age : T_LO;
      const y = ay(valid && a > 0 ? a : hist.bounce ? hist.a[0] : 0);
      const x = tx(valid && a > 0 ? t : Math.max(T_LO, tB));
      const c = !valid || a <= 0 ? cNone : isAcc(user, a) ? cAcc : cDec;
      uPos.set([x, y, Z_USER - 0.16, x, y, Z_USER + 0.16], s * 6);
      uCol.set([c.r, c.g, c.b, c.r, c.g, c.b], s * 6);
      uLinePos.set([x, y, Z_USER + 0.16], s * 3);
      if (valid && a > 0 && a <= A_TOP) last = s;
    }
    uGeo.attributes.position.needsUpdate = true;
    uGeo.attributes.color.needsUpdate = true;
    uLineGeo.attributes.position.needsUpdate = true;
    uLabel.position.set(uLinePos[last * 3] + 0.3, uLinePos[last * 3 + 1] + 0.2, Z_USER);
    const has = Number.isFinite(hist.aAcc) && hist.tAcc >= T_LO && hist.tAcc <= T_HI && hist.aAcc <= A_TOP;
    uDot.visible = has;
    if (has) uDot.position.set(tx(hist.tAcc), ay(hist.aAcc), Z_USER + 0.16);
  }

  // ============================================================ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '10.5px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number) => `<i style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;background:${css(c)}"></i>`;
  const LEGENDS: Record<View, string> = {
    hubble: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Type Ia supernova Hubble diagram</div>
<div>Each flash is one supernova (±1σ). Higher = fainter = farther.</div>
<div style="margin-top:4px">${sw(COL.lcdm)}ΛCDM (your Ω_m, Ω_Λ, w = −1)</div>
<div>${sw(COL.cpl)}w₀–wₐ (your Ω_m, Ω_Λ, w₀, wₐ)</div>
<div>${sw(COL.matter)}matter only, Ω_m = 1</div>
<div>${sw(COL.empty)}empty, coasting</div>`,
    plane: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">χ² landscape, the 1998 plot</div>
<div>Height = χ² above the best fit (w = −1). The bright valley is where the data fit.</div>
<div style="margin-top:4px">Contours: <span style="color:#fff">68%</span>, <span style="color:${css(PALETTE.amber)}">95%</span>, <span style="color:${css(PALETTE.rose)}">99.7%</span></div>
<div><span style="color:#dfe6f3">- - -</span> flat space &nbsp;<span style="color:${css(PALETTE.amber)}">──</span> q₀ = 0</div>
<div><span style="color:#9aa6bd">──</span> no Big Bang beyond (greyed)</div>`,
    history: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Expansion history a(t)</div>
<div>Surface: your Ω_m, Ω_Λ with constant w, from −1.4 (back) to 0 (front). Pink-edged ribbon: your w₀–wₐ.</div>
<div style="margin-top:4px">${sw(COL.decel)}slowing down &nbsp;${sw(COL.accel)}speeding up</div>
<div>${sw(PALETTE.green)}acceleration begins</div>`,
  };
  legend.innerHTML = LEGENDS.hubble;

  const IW = 440;
  const IH = 300;
  const inset = document.createElement('canvas');
  inset.width = IW;
  inset.height = IH;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${IW / 2.2}px`, height: `${IH / 2.2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const staleNote = document.createElement('div');
  Object.assign(staleNote.style, {
    position: 'absolute', left: '50%', bottom: '14px', transform: 'translateX(-50%)', zIndex: '3', pointerEvents: 'none', display: 'none',
    background: 'rgba(7,10,18,0.85)', border: '1px solid #3a4a6a', borderRadius: '8px', padding: '6px 12px',
    font: '12px/1.4 JetBrains Mono, monospace', color: '#dfe6f3',
  } as CSSStyleDeclaration);
  staleNote.textContent = 'The data changed. Press Fit to rescan χ².';
  viewport.appendChild(staleNote);

  function drawInset(): void {
    const c = ictx;
    c.clearRect(0, 0, IW, IH);
    const X0 = 58;
    const X1 = IW - 14;
    const Y0 = 58;
    const Y1 = IH - 40;
    const la0 = Math.log10(0.1);
    const la1 = Math.log10(4);
    const lr0 = -2;
    const lr1 = 3;
    const X = (a: number) => X0 + ((Math.log10(a) - la0) / (la1 - la0)) * (X1 - X0);
    const Y = (r: number) => Y1 - ((Math.log10(Math.max(1e-6, r)) - lr0) / (lr1 - lr0)) * (Y1 - Y0);
    c.font = '600 20px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('ρ_DE(a) / ρ_DE today', 14, 28);
    c.font = '16px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('∝ a^−3(1+w)   log–log', 14, 48);
    c.strokeStyle = '#1a2336';
    c.lineWidth = 1.5;
    for (const a of [0.1, 0.3, 1, 3]) {
      c.beginPath();
      c.moveTo(X(a), Y0);
      c.lineTo(X(a), Y1);
      c.strokeStyle = a === 1 ? '#2c3852' : '#1a2336';
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(a === 1 ? 'a=1' : String(a), X(a) - 12, IH - 16);
    }
    for (let r = -2; r <= 3; r++) {
      c.beginPath();
      c.moveTo(X0, Y(10 ** r));
      c.lineTo(X1, Y(10 ** r));
      c.strokeStyle = r === 0 ? '#2c3852' : '#1a2336';
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(r === 0 ? '1' : `10${r < 0 ? '⁻' : ''}${['⁰', '¹', '²', '³'][Math.abs(r)]}`, 12, Y(10 ** r) + 6);
    }
    const line = (m: Model, color: string, w: number, name: string) => {
      c.strokeStyle = color;
      c.lineWidth = w;
      c.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = 10 ** (la0 + ((la1 - la0) * i) / 120);
        const y = Math.max(Y0 - 4, Math.min(Y1 + 4, Y(deDensity(m, a))));
        if (i === 0) c.moveTo(X(a), y);
        else c.lineTo(X(a), y);
      }
      c.stroke();
      if (name) {
        c.fillStyle = color;
        const a = 0.13;
        const y = Math.max(Y0 + 12, Math.min(Y1 - 4, Y(deDensity(m, a)) - 6));
        c.fillText(name, X(a) + 4, y);
      }
    };
    c.save();
    c.beginPath();
    c.rect(X0, Y0 - 6, X1 - X0, Y1 - Y0 + 12);
    c.clip();
    line({ Om: 0, Ode: 1, w0: 0, wa: 0 }, '#56627c', 2, 'w=0 (like matter)');
    line({ Om: 0, Ode: 1, w0: -1 / 3, wa: 0 }, '#7b6bb8', 2, 'w=−1/3');
    line({ Om: 0, Ode: 1, w0: -1, wa: 0 }, css(COL.lcdm), 2.5, '');
    line(user, css(COL.cpl), 4, '');
    c.restore();
    c.fillStyle = css(COL.lcdm);
    c.fillText('w=−1: constant', X(0.13), Y(1) + 20);
    c.fillStyle = css(COL.cpl);
    c.fillText(`yours: w₀=${user.w0.toFixed(2)} wₐ=${user.wa.toFixed(2)}`, X(0.45), Y1 - 8);
  }

  // ============================================================ frame loop
  stage.onFrame((dt, t) => {
    snUniforms.uTime.value = t;
    snUniforms.uScale.value = (renderer.domElement.height / 2) / Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360);
    if (dataDirty) {
      dataDirty = false;
      if (source === 'sliders') data = generateSN(user, nSN, scatter, seed);
      else data = generateSN(NATURE, nSN, scatter, seed);
      placeSN();
      if (fit) {
        fitStale = true;
        surfMat.opacity = 0.45;
      }
      computeChi();
    }
    if (modelDirty) {
      modelDirty = false;
      userL.Om = user.Om;
      userL.Ode = user.Ode;
      hist = buildHistory(user);
      fillRibbon(ribEmpty, null);
      fillRibbon(ribMatter, lcdm(1, 0));
      fillRibbon(ribL, userL);
      fillRibbon(ribW, user);
      spreadRibbonLabels();
      updateLookbackAxis();
      buildHistories();
      placeMarker(mUser, user.Om, user.Ode);
      computeChi();
      drawInset();
      updateReadouts();
    }
    staleNote.style.display = view === 'plane' && fitStale ? '' : 'none';
    if (fitAnim < 1) {
      fitAnim = Math.min(1, fitAnim + dt / 1.2);
      const e = 1 - (1 - fitAnim) ** 3;
      gSurf.scale.y = Math.max(0.001, e);
    }
  });

  function computeChi(): void {
    chiL = chi2Model(data, userL, scratch);
    chiW = chi2Model(data, user, scratch);
    chiM = chi2Model(data, lcdm(1, 0), scratch);
    chiE = chi2Model(data, lcdm(0, 0), scratch);
    updateReadouts();
  }

  // ============================================================ controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'hubble', label: 'Hubble diagram' }, { value: 'plane', label: 'Ω_m–Ω_Λ plane' }, { value: 'history', label: 'Expansion a(t)' }],
    onChange: (v) => {
      view = v;
      gH.visible = v === 'hubble';
      gP.visible = v === 'plane';
      gX.visible = v === 'history';
      legend.innerHTML = LEGENDS[v];
      stage.flyTo(CAM[v].pos, CAM[v].target);
    },
  });

  ui.section('Your universe');
  const onModel = () => {
    touched = true;
    modelDirty = true;
    if (source === 'sliders') dataDirty = true;
  };
  const omCtl = ui.slider({ key: 'Om', label: 'Matter Ω_m', min: 0, max: 2.5, step: 0.01, value: user.Om, format: (v) => v.toFixed(2), onInput: (v) => { user.Om = v; onModel(); } });
  const olCtl = ui.slider({ key: 'Ol', label: 'Dark energy Ω_Λ', min: -1, max: 3, step: 0.01, value: user.Ode, format: (v) => v.toFixed(2), onInput: (v) => { user.Ode = v; onModel(); } });
  const w0Ctl = ui.slider({ key: 'w0', label: 'w₀ (today)', min: -2, max: 0.3, step: 0.01, value: user.w0, format: (v) => v.toFixed(2), onInput: (v) => { user.w0 = v; onModel(); } });
  const waCtl = ui.slider({ key: 'wa', label: 'wₐ (evolution)', min: -2.5, max: 1.5, step: 0.01, value: user.wa, format: (v) => v.toFixed(2), onInput: (v) => { user.wa = v; onModel(); } });
  const preset = (om: number, ol: number, w0: number, wa: number) => {
    user.Om = om;
    user.Ode = ol;
    user.w0 = w0;
    user.wa = wa;
    omCtl.set(om, false);
    olCtl.set(ol, false);
    w0Ctl.set(w0, false);
    waCtl.set(wa, false);
    onModel();
  };
  ui.buttons([
    { label: 'ΛCDM', onClick: () => preset(0.3, 0.7, -1, 0) },
    { label: 'DESI-like', onClick: () => preset(0.3, 0.7, -0.75, -0.85) },
    { label: 'Matter only', onClick: () => preset(1, 0, -1, 0) },
  ]);
  ui.note('Curvature takes up the rest: Ω_k = 1 − Ω_m − Ω_Λ. The ΛCDM ribbon uses your Ω values with w = −1. The w₀–wₐ ribbon also uses your w₀ and wₐ.');
  const rQ0 = ui.readout('q0', 'deceleration q₀');
  const rZacc = ui.readout('zacc', 'acceleration began');
  const rRho = ui.readout('rho', 'ρ_DE(a=½)/ρ_DE today');
  const rAge = ui.readout('age', 'age (H₀ = 70)', 'Gyr');
  const rOk = ui.readout('Ok', 'curvature Ω_k');
  const rF = ui.readout('fcheck', 'Friedmann check');

  ui.section('Supernova data');
  ui.select<Source>({
    key: 'source', label: 'Data drawn from', value: source,
    options: [{ value: 'nature', label: 'Nature (hidden truth)' }, { value: 'sliders', label: 'Your w₀–wₐ universe' }],
    onChange: (v) => { source = v; dataDirty = true; touched = true; },
  });
  ui.slider({ key: 'nSN', label: 'Number of supernovae', min: 20, max: MAX_SN, step: 10, value: nSN, format: (v) => v.toFixed(0), onInput: (v) => { nSN = v; dataDirty = true; touched = true; } });
  ui.slider({ key: 'scatter', label: 'Scatter σ per supernova', min: 0.02, max: 0.5, step: 0.01, value: scatter, unit: 'mag', format: (v) => v.toFixed(2), onInput: (v) => { scatter = v; dataDirty = true; touched = true; } });
  ui.toggle({ key: 'residual', label: 'Plot Δμ relative to an empty universe', value: residual, onChange: (v) => { residual = v; setAxisMode(); placeSN(); modelDirty = true; } });
  ui.buttons([
    { label: 'Fit Ω_m, Ω_Λ', primary: true, key: 'fit', onClick: () => { runFit(true); updateReadouts(); } },
    { label: 'New sample', onClick: () => { seed = (seed * 7919 + 17) % 100003; dataDirty = true; touched = true; } },
    { label: 'Use best fit', onClick: () => { if (fit) preset(Math.round(fit.bestOm * 100) / 100, Math.round(fit.bestOl * 100) / 100, -1, 0); } },
  ]);
  ui.note('Nature here is ΛCDM with Ω_m = 0.3 and Ω_Λ = 0.7. The fit scans Ω_m and Ω_Λ with w = −1 and marginalises the unknown brightness and H₀.');
  const rChiL = ui.readout('chiL', 'χ² ΛCDM (yours)');
  const rChiW = ui.readout('chiW', 'χ² w₀–wₐ (yours)');
  const rChiM = ui.readout('chiM', 'χ² matter only');
  const rChiE = ui.readout('chiE', 'χ² empty');
  const rFit = ui.readout('fitOm', 'best fit Ω_m, Ω_Λ');
  const rNoL = ui.readout('noL', 'Ω_Λ ≤ 0 ruled out by');

  const fmtChi = (c: number) => (Number.isFinite(c) ? `${c.toFixed(0)} / ${data.n - 1}` : 'no such universe');
  const pOf = (c: number) => chi2Pvalue(c, data.n - 1);
  const fmtP = (c: number) => {
    const p = pOf(c);
    return p < 1e-4 ? 'p<10⁻⁴' : `p=${p.toFixed(p < 0.01 ? 4 : 2)}`;
  };
  function updateReadouts(): void {
    const q = q0(user);
    rQ0(`${q.toFixed(3)} ${q < 0 ? '(speeding up)' : '(slowing)'}`);
    if (hist.bounce) rZacc('no Big Bang');
    else if (Number.isFinite(hist.aAcc) && hist.aAcc < 1) rZacc(`z = ${(1 / hist.aAcc - 1).toFixed(2)}, ${(-hist.tAcc).toFixed(1)} Gyr ago`);
    else if (Number.isFinite(hist.aAcc)) rZacc(`in the future, a = ${hist.aAcc.toFixed(2)}`);
    else rZacc(q < 0 ? 'always' : 'never');
    const r = deDensity(user, 0.5);
    rRho(r.toFixed(r > 100 ? 0 : 3));
    rAge(hist.bounce ? '–' : Number.isFinite(hist.age) ? hist.age.toFixed(2) : '> 40');
    const Ok = omegaK(user);
    rOk(Math.abs(Ok) < 0.005 ? '0.00 (flat)' : `${Ok.toFixed(2)} ${Ok > 0 ? '(open)' : '(closed)'}`);
    rF(hist.maxConstraint.toExponential(0));
    rChiL(`${fmtChi(chiL)}  ${fmtP(chiL)}`);
    rChiW(`${fmtChi(chiW)}  ${fmtP(chiW)}`);
    rChiM(`${fmtChi(chiM)}  ${fmtP(chiM)}`);
    rChiE(`${fmtChi(chiE)}  ${fmtP(chiE)}`);
    if (fit) {
      rFit(`${fit.bestOm.toFixed(2)}, ${fit.bestOl.toFixed(2)}${fitStale ? ' (old data)' : ''}`);
      rNoL(`Δχ² = ${fit.dchiNoLambda.toFixed(1)}${fit.dchiNoLambda > DCHI2_LEVELS[2] ? ' (>99.7%)' : fit.dchiNoLambda > DCHI2_LEVELS[1] ? ' (>95%)' : ''}`);
    } else {
      rFit('press Fit');
      rNoL('–');
    }
  }

  // ------------------------------------------------------------ initial build
  setAxisMode();
  placeSN();
  dataDirty = false;
  computeChi();
  runFit(false);
  buildSurface();

  return {
    state: () => ({
      view,
      Om: user.Om,
      Ol: user.Ode,
      w0: user.w0,
      wa: user.wa,
      nSN,
      scatter,
      dataSource: source,
      touched,
      fitByUser,
      fitStale,
      fitOm: fit ? fit.bestOm : 0,
      fitOl: fit ? fit.bestOl : 0,
      dchiNoLambda: fit ? fit.dchiNoLambda : 0,
      chi2L: Number.isFinite(chiL) ? chiL : 1e9,
      chi2W: Number.isFinite(chiW) ? chiW : 1e9,
      chi2M: chiM,
      pL: pOf(chiL),
      pW: pOf(chiW),
      pM: pOf(chiM),
      q0: q0(user),
      accelerating: q0(user) < 0,
      zAcc: Number.isFinite(hist.aAcc) ? 1 / hist.aAcc - 1 : -1,
      rhoHalf: deDensity(user, 0.5),
      age: Number.isFinite(hist.age) ? hist.age : 0,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      staleNote.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'dark-energy',
  number: 81,
  title: 'Dark Energy',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'Something is speeding up the expansion of the universe.',
  content,
  mount,
};

export default topic;
