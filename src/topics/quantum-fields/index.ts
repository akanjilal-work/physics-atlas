import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  addPacket,
  addPluck,
  centroidX,
  clearField,
  energy,
  energyDensity,
  fieldEnergies,
  groupVelocityContinuum,
  groupVelocityLattice,
  makeScratch,
  makeTwoField,
  modeQuanta,
  omegaContinuum,
  omegaLattice,
  rng,
  sampleVacuum,
  siteX,
  step,
  type FieldParams,
  type TwoField,
} from './physics.ts';

const N = 128; // sites per side
const L = 24; // box side (sim units, hbar = c = 1)
const A = L / N; // lattice spacing
const H = 0.04; // integrator step
const RATE = 2.6; // sim time units per real second
const MAX_STEPS = 6;
const S = 8.4; // scene size of a sheet
const SC = S / L; // scene units per sim unit
const HS = 2.8; // height scale (scene units per unit of field)
const VAC_DISPLAY = 1 / 10; // vacuum jitter drawn at 1/10 of true size
const VAC_KMAX = 4; // only modes with |k| < 4 (the range in the inset) are drawn
const Y_A = 0;
const Y_B = -3.4;
const NET = 8; // spring-net line every NET sites
const X_LAUNCH = -7;
const HBAR = 1;
const DK = 0.2; // histogram bin width
const KMAX_PLOT = 4;
const NBINS = Math.round(KMAX_PLOT / DK) + 1;

const CAM = {
  one: { pos: [0, 9.6, 8.2] as [number, number, number], target: [0, 0.9, -0.4] as [number, number, number] },
  two: { pos: [0, 3.4, 14.2] as [number, number, number], target: [0, -1.2, -0.8] as [number, number, number] },
};

const sceneX = (x: number) => x * SC;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.one.pos, target: CAM.one.target, fov: 42 });
  const { scene, camera, renderer } = stage;

  // --- Parameters
  const p: FieldParams = { N, a: A, m: 1, g: 0 };
  let k0 = 1.5;
  let sigma = 2;
  let jitter = false;

  // --- Field layers (linear dynamics, so layers superpose exactly)
  const P = makeTwoField(N); // the tracked particle
  const R = makeTwoField(N); // older particles and plucks
  const V = makeTwoField(N); // vacuum sample (display only)
  let rActive = false;
  const scratch = makeScratch(N);
  const n2 = N * N;
  const tmp1 = new Float64Array(n2);
  const tmp2 = new Float64Array(n2);
  const vacTmp = [0, 1, 2, 3].map(() => new Float64Array(n2));
  const dens = new Float64Array(n2);
  const eAB = new Float64Array(2);
  const binsA = new Float64Array(NBINS);
  const binsB = new Float64Array(NBINS);
  const rand = rng(20260924);

  // --- Measurement state
  let t = 0;
  let acc = 0;
  let userLaunch = false;
  let measuring = false;
  let x0 = 0;
  let t0 = 0;
  let xc = 0;
  let dist = 0;
  let vmeas = 0;
  let vgLaunch = 0;
  let launchM = 1;
  let hasPacket = false;
  let fracB = 0;
  let nA = 0;
  let nB = 0;
  let e0 = 0;
  let drift = 0;
  let status = '';

  // =========================================================================
  // Scene
  // =========================================================================
  const floor = makeGrid(22, 44);
  floor.position.y = Y_B - 1.2;
  scene.add(floor);

  interface Sheet {
    group: THREE.Group;
    geo: THREE.BufferGeometry;
    pos: THREE.BufferAttribute;
    nor: THREE.BufferAttribute;
    col: THREE.BufferAttribute;
    h: Float32Array;
    net: THREE.LineSegments;
    netPos: THREE.BufferAttribute;
    cPos: THREE.Color;
    cNeg: THREE.Color;
    cMid: THREE.Color;
    y: number;
  }

  function makeSheet(y: number, cPos: number, cNeg: number, netOpacity: number): Sheet {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(n2 * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v = (j * N + i) * 3;
        posArr[v] = sceneX(siteX(i, N, A));
        posArr[v + 2] = sceneX(siteX(j, N, A));
      }
    }
    const idx = new Uint32Array((N - 1) * (N - 1) * 6);
    let o = 0;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a0 = j * N + i;
        idx[o++] = a0;
        idx[o++] = a0 + N;
        idx[o++] = a0 + 1;
        idx[o++] = a0 + 1;
        idx[o++] = a0 + N;
        idx[o++] = a0 + N + 1;
      }
    }
    const pos = new THREE.BufferAttribute(posArr, 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    const nor = new THREE.BufferAttribute(new Float32Array(n2 * 3), 3);
    nor.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(new Float32Array(n2 * 3), 3);
    col.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nor);
    geo.setAttribute('color', col);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), S);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Spring net: every NET-th row and column, following the surface
    const lines = N / NET;
    const netArr = new Float32Array(2 * lines * (N - 1) * 6);
    const netPos = new THREE.BufferAttribute(netArr, 3);
    netPos.setUsage(THREE.DynamicDrawUsage);
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', netPos);
    const net = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xb8c6e0, transparent: true, opacity: netOpacity }));
    net.frustumCulled = false;
    group.add(net);

    // Frame around the sheet at rest height
    const half = S / 2 + 0.05;
    const fg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, 0, -half), new THREE.Vector3(half, 0, half), new THREE.Vector3(-half, 0, half), new THREE.Vector3(-half, 0, -half),
    ]);
    group.add(new THREE.Line(fg, new THREE.LineBasicMaterial({ color: 0x3a4a6e })));

    return {
      group, geo, pos, nor, col, h: new Float32Array(n2), net, netPos,
      cPos: new THREE.Color(cPos), cNeg: new THREE.Color(cNeg), cMid: new THREE.Color(0x1a2640), y,
    };
  }

  const sheetA = makeSheet(Y_A, PALETTE.cyan, PALETTE.rose, 0.32);
  const sheetB = makeSheet(Y_B, PALETTE.amber, PALETTE.violet, 0.22);
  sheetB.group.visible = false;

  // Masses at the net crossings of sheet A
  const DOTS = (N / NET) * (N / NET);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdfe6f3, roughness: 0.4 }), DOTS);
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.frustumCulled = false;
  sheetA.group.add(dots);

  // Coupling springs between the sheets
  const couplePos = new THREE.BufferAttribute(new Float32Array(DOTS * 6), 3);
  couplePos.setUsage(THREE.DynamicDrawUsage);
  const coupleGeo = new THREE.BufferGeometry();
  coupleGeo.setAttribute('position', couplePos);
  const coupleMat = new THREE.LineBasicMaterial({ color: 0x8a97b2, transparent: true, opacity: 0 });
  const couple = new THREE.LineSegments(coupleGeo, coupleMat);
  couple.frustumCulled = false;
  couple.visible = false;
  scene.add(couple);

  // Particle marker: arrow along +x and a label
  const marker = new THREE.Group();
  scene.add(marker);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.5, 0, 0), 1.2, PALETTE.amber, 0.28, 0.16);
  marker.add(arrow);
  const markLab = stage.label('', [0, 0.45, 0], '', marker);

  const labA = stage.label('field A', [-S / 2, 0.15, -S / 2 - 0.35], 'muted');
  const labB = stage.label('field B (toy coupling)', [-S / 2, Y_B + 0.15, -S / 2 - 0.35], 'muted');
  labB.visible = false;
  labA.center.set(0, 0.5);
  labB.center.set(0, 0.5);

  // --- Legend overlay (hidden on phones)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">A field as a mattress</div>
<div>height = field φ: <span style="color:${css(PALETTE.cyan)}">■</span> up <span style="color:${css(PALETTE.rose)}">■</span> down</div>
<div>grid lines = springs</div>
<div><span style="color:${css(PALETTE.amber)}">→</span> particle = one quantum ħω<sub>k</sub></div>
<div style="color:#8391ab">click the sheet to pluck it</div>
<div class="qf-vac" style="display:none;color:#8391ab;margin-top:3px">vacuum jitter is schematic: modes with |k| &lt; 4 only, drawn at 1/10 size</div>`;
  viewport.appendChild(legend);
  const vacNote = legend.querySelector('.qf-vac') as HTMLElement;

  // --- Inset: dispersion curve and occupation histogram
  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 460;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ctx = inset.getContext('2d')!;

  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ctx.clearRect(0, 0, W, Hh);
    const x0p = 60;
    const x1p = W - 18;
    const xOf = (k: number) => x0p + (k / KMAX_PLOT) * (x1p - x0p);
    // ---- dispersion
    const top = 44;
    const bot = 230;
    const wMax = omegaContinuum(KMAX_PLOT, p.m) + 0.2;
    const yOf = (w: number) => bot - (w / wMax) * (bot - top);
    ctx.font = '22px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText('dispersion ω(k)', 16, 30);
    ctx.fillStyle = css(PALETTE.amber);
    ctx.fillText(`slope v = ${groupVelocityLattice(k0, p.m, A).toFixed(2)}c`, W - 230, 30);
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0p, top);
    ctx.lineTo(x0p, bot);
    ctx.lineTo(x1p, bot);
    ctx.stroke();
    // light cone ω = k
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = '#56627c';
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    ctx.lineTo(xOf(Math.min(KMAX_PLOT, wMax)), yOf(Math.min(KMAX_PLOT, wMax)));
    ctx.stroke();
    // continuum
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#9aa6bd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const k = (i / 80) * KMAX_PLOT;
      const y = yOf(omegaContinuum(k, p.m));
      if (i === 0) ctx.moveTo(xOf(k), y);
      else ctx.lineTo(xOf(k), y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // lattice
    ctx.strokeStyle = css(PALETTE.cyan);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const k = (i / 80) * KMAX_PLOT;
      const y = yOf(omegaLattice(k, 0, p.m, A));
      if (i === 0) ctx.moveTo(xOf(k), y);
      else ctx.lineTo(xOf(k), y);
    }
    ctx.stroke();
    // packet point and tangent (slope = group velocity)
    const wk = omegaLattice(k0, 0, p.m, A);
    const vg = groupVelocityLattice(k0, p.m, A);
    const dkT = 0.7;
    ctx.strokeStyle = css(PALETTE.amber);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(Math.max(0, k0 - dkT)), yOf(wk - vg * (k0 - Math.max(0, k0 - dkT))));
    ctx.lineTo(xOf(Math.min(KMAX_PLOT, k0 + dkT)), yOf(wk + vg * (Math.min(KMAX_PLOT, k0 + dkT) - k0)));
    ctx.stroke();
    ctx.fillStyle = css(PALETTE.amber);
    ctx.beginPath();
    ctx.arc(xOf(k0), yOf(wk), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56627c';
    ctx.fillText('ω = ck', xOf(KMAX_PLOT) - 90, yOf(KMAX_PLOT) + 30);
    ctx.fillStyle = '#8391ab';
    ctx.fillText('ω', 24, top + 16);
    if (p.m > 0) {
      ctx.fillStyle = css(PALETTE.cyan);
      ctx.fillText('m', 26, yOf(p.m) + 8);
    }
    // ---- histogram
    const hTop = 305;
    const hBot = 420;
    ctx.fillStyle = '#8391ab';
    ctx.fillText('quanta n per |k| bin', 16, 276);
    let peak = 0.5;
    for (let b = 0; b < NBINS; b++) peak = Math.max(peak, binsA[b] + binsB[b]);
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0p, hTop);
    ctx.lineTo(x0p, hBot);
    ctx.lineTo(x1p, hBot);
    ctx.stroke();
    const bw = (x1p - x0p) / NBINS;
    for (let b = 0; b < NBINS; b++) {
      const ha = (binsA[b] / peak) * (hBot - hTop);
      const hb = (binsB[b] / peak) * (hBot - hTop);
      const x = x0p + b * bw + 1;
      ctx.fillStyle = css(PALETTE.cyan);
      ctx.fillRect(x, hBot - ha, bw - 2, ha);
      ctx.fillStyle = css(PALETTE.amber);
      ctx.fillRect(x, hBot - ha - hb, bw - 2, hb);
    }
    ctx.fillStyle = '#56627c';
    ctx.fillText(peak.toFixed(peak < 2 ? 2 : 1), 4, hTop + 8);
    ctx.fillText('0', 34, hBot);
    for (const k of [0, 1, 2, 3, 4]) ctx.fillText(String(k), xOf(k) - 6, hBot + 28);
    ctx.fillText('k', x1p - 14, hBot + 28);
    ctx.fillStyle = '#b8c3d9';
    const tot = nA + nB;
    ctx.fillText(tot < 0.02 ? 'vacuum: all n_k = 0' : `total ${tot.toFixed(2)}`, W - 170, 276);
  }

  // =========================================================================
  // Simulation helpers
  // =========================================================================
  function allLayers(fn: (f: TwoField) => void): void {
    fn(P);
    fn(R);
    fn(V);
  }

  function resetEnergyRef(): void {
    e0 = energy(P, p) + (rActive ? energy(R, p) : 0);
    drift = 0;
  }

  function stopMeasuring(why: string): void {
    measuring = false;
    status = why;
  }

  function launch(byUser: boolean): void {
    // Keep earlier particles alive by moving them into the background layer
    let d = xc - X_LAUNCH;
    d -= L * Math.round(d / L);
    if (hasPacket && Math.abs(d) > 4 * sigma + 2) {
      for (let i = 0; i < n2; i++) {
        R.phiA[i] += P.phiA[i];
        R.piA[i] += P.piA[i];
        R.phiB[i] += P.phiB[i];
        R.piB[i] += P.piB[i];
      }
      R.accValid = false;
      rActive = true;
    }
    clearField(P);
    addPacket(P, p, X_LAUNCH, 0, k0, sigma, 1, HBAR, scratch, tmp1, tmp2, 1.2 * sigma);
    hasPacket = true;
    userLaunch = byUser;
    energyDensity(P, p, dens);
    xc = centroidX(dens, N, A, X_LAUNCH);
    x0 = xc;
    t0 = t;
    dist = 0;
    vmeas = 0;
    vgLaunch = groupVelocityLattice(k0, p.m, A);
    launchM = p.m;
    measuring = true;
    status = '';
    resetEnergyRef();
    updateSpectrum();
  }

  function resampleVacuum(): void {
    if (jitter) sampleVacuum(V, p, HBAR, rand, scratch, vacTmp, VAC_KMAX);
  }

  function updateSpectrum(): void {
    binsA.fill(0);
    binsB.fill(0);
    for (let i = 0; i < n2; i++) {
      tmp1[i] = P.phiA[i] + R.phiA[i];
      tmp2[i] = P.piA[i] + R.piA[i];
    }
    nA = modeQuanta(tmp1, tmp2, p, HBAR, scratch, binsA, DK);
    if (p.g > 0 || sheetB.group.visible) {
      for (let i = 0; i < n2; i++) {
        tmp1[i] = P.phiB[i] + R.phiB[i];
        tmp2[i] = P.piB[i] + R.piB[i];
      }
      nB = modeQuanta(tmp1, tmp2, p, HBAR, scratch, binsB, DK);
    } else {
      nB = 0;
    }
  }

  function paramsChanged(): void {
    allLayers((f) => (f.accValid = false));
    if (measuring) stopMeasuring('parameters changed: launch again to measure');
    resampleVacuum();
    resetEnergyRef();
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  const m4 = new THREE.Matrix4();
  const qi = new THREE.Quaternion();
  const tp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const cTmp = new THREE.Color();
  const dxs = A * SC;

  function renderSheet(sh: Sheet, pP: Float64Array, pR: Float64Array, pV: Float64Array): void {
    const h = sh.h;
    const vf = jitter ? VAC_DISPLAY : 0;
    for (let i = 0; i < n2; i++) h[i] = HS * (pP[i] + (rActive ? pR[i] : 0) + vf * pV[i]);
    const pos = sh.pos.array as Float32Array;
    const nor = sh.nor.array as Float32Array;
    const col = sh.col.array as Float32Array;
    const inv2 = 1 / (2 * dxs);
    for (let j = 0; j < N; j++) {
      const jd = j === 0 ? 0 : j - 1;
      const ju = j === N - 1 ? N - 1 : j + 1;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const il = i === 0 ? 0 : i - 1;
        const ir = i === N - 1 ? N - 1 : i + 1;
        const v = row + i;
        const hv = h[v];
        pos[v * 3 + 1] = hv;
        const gx = (h[row + ir] - h[row + il]) * inv2 * (i === 0 || i === N - 1 ? 2 : 1);
        const gz = (h[ju * N + i] - h[jd * N + i]) * inv2 * (j === 0 || j === N - 1 ? 2 : 1);
        const inl = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        nor[v * 3] = -gx * inl;
        nor[v * 3 + 1] = inl;
        nor[v * 3 + 2] = -gz * inl;
        const f = Math.min(1, Math.abs(hv) * 1.6);
        cTmp.copy(sh.cMid).lerp(hv >= 0 ? sh.cPos : sh.cNeg, f);
        col[v * 3] = cTmp.r;
        col[v * 3 + 1] = cTmp.g;
        col[v * 3 + 2] = cTmp.b;
      }
    }
    sh.pos.needsUpdate = true;
    sh.nor.needsUpdate = true;
    sh.col.needsUpdate = true;
    // spring net
    const b = sh.netPos.array as Float32Array;
    let o = 0;
    const lift = 0.012;
    for (let l = 0; l < N; l += NET) {
      for (let i = 0; i < N - 1; i++) {
        const va = l * N + i;
        const vb = va + 1;
        b[o++] = pos[va * 3]; b[o++] = h[va] + lift; b[o++] = pos[va * 3 + 2];
        b[o++] = pos[vb * 3]; b[o++] = h[vb] + lift; b[o++] = pos[vb * 3 + 2];
      }
      for (let j = 0; j < N - 1; j++) {
        const va = j * N + l;
        const vb = va + N;
        b[o++] = pos[va * 3]; b[o++] = h[va] + lift; b[o++] = pos[va * 3 + 2];
        b[o++] = pos[vb * 3]; b[o++] = h[vb] + lift; b[o++] = pos[vb * 3 + 2];
      }
    }
    sh.netPos.needsUpdate = true;
  }

  function renderDots(): void {
    const h = sheetA.h;
    const hb = sheetB.h;
    const pos = sheetA.pos.array as Float32Array;
    const cp = couplePos.array as Float32Array;
    let d = 0;
    for (let j = 0; j < N; j += NET) {
      for (let i = 0; i < N; i += NET) {
        const v = j * N + i;
        m4.compose(tp.set(pos[v * 3], h[v] + 0.02, pos[v * 3 + 2]), qi, one);
        dots.setMatrixAt(d, m4);
        if (couple.visible) {
          const o = d * 6;
          cp[o] = pos[v * 3]; cp[o + 1] = Y_A + h[v]; cp[o + 2] = pos[v * 3 + 2];
          cp[o + 3] = pos[v * 3]; cp[o + 4] = Y_B + hb[v]; cp[o + 5] = pos[v * 3 + 2];
        }
        d++;
      }
    }
    dots.instanceMatrix.needsUpdate = true;
    if (couple.visible) couplePos.needsUpdate = true;
  }

  function placeMarker(): void {
    marker.visible = hasPacket;
    if (!hasPacket) return;
    let x = xc;
    x -= L * Math.round(x / L);
    const onB = fracB > 0.5 && sheetB.group.visible;
    marker.position.set(sceneX(x), (onB ? Y_B : Y_A) + 1.15, 0);
    const v = measuring && dist > 0.3 ? vmeas : vgLaunch;
    markLab.element.textContent = `particle  v = ${v.toFixed(2)}c`;
    arrow.setLength(0.4 + 1.2 * Math.min(1, vgLaunch), 0.28, 0.16);
  }

  // =========================================================================
  // Pluck by clicking the sheet
  // =========================================================================
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y_A);
  const hit = new THREE.Vector3();
  let downX = 0;
  let downY = 0;
  let downT = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 || performance.now() - downT > 500) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    if (Math.abs(hit.x) > S / 2 || Math.abs(hit.z) > S / 2) return;
    addPluck(R, p, hit.x / SC, hit.z / SC, 0.7, 0.3);
    rActive = true;
    resetEnergyRef();
    updateSpectrum();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // =========================================================================
  // Frame loop
  // =========================================================================
  let specTimer = 0;
  let insetTimer = 0;
  stage.onFrame((dt) => {
    acc += dt * RATE;
    let steps = 0;
    while (acc >= H && steps < MAX_STEPS) {
      if (hasPacket) step(P, p, H);
      if (rActive) step(R, p, H);
      if (jitter) step(V, p, H);
      acc -= H;
      t += H;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;

    if (hasPacket && steps > 0) {
      energyDensity(P, p, dens);
      xc = centroidX(dens, N, A, xc);
      if (measuring) {
        dist = xc - x0;
        const el = t - t0;
        vmeas = el > 0 ? dist / el : 0;
      }
    }

    renderSheet(sheetA, P.phiA, R.phiA, V.phiA);
    if (sheetB.group.visible) renderSheet(sheetB, P.phiB, R.phiB, V.phiB);
    renderDots();
    placeMarker();

    specTimer += dt;
    if (specTimer > 0.25) {
      specTimer = 0;
      updateSpectrum();
      if (hasPacket) {
        fieldEnergies(P, p, eAB);
        fracB = eAB[0] + eAB[1] > 0 ? eAB[1] / (eAB[0] + eAB[1]) : 0;
      }
      const e = energy(P, p) + (rActive ? energy(R, p) : 0);
      drift = e0 > 0 ? (e - e0) / e0 : 0;
    }
    insetTimer += dt;
    if (insetTimer > 0.2) {
      insetTimer = 0;
      drawInset();
    }
    updateReadouts();
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('Particle');
  ui.slider({ key: 'k', label: 'Packet momentum k', min: 0.3, max: 3.5, step: 0.05, value: k0, format: (v) => v.toFixed(2), onInput: (v) => { k0 = v; drawInset(); } });
  ui.slider({ key: 'sigma', label: 'Packet width', min: 1, max: 3.5, step: 0.1, value: sigma, format: (v) => `${v.toFixed(1)} units`, onInput: (v) => { sigma = v; } });
  ui.buttons([
    { label: 'Create particle', primary: true, key: 'create', onClick: () => launch(true) },
    {
      label: 'Reset', onClick: () => {
        clearField(P);
        clearField(R);
        rActive = false;
        hasPacket = false;
        userLaunch = false;
        measuring = false;
        dist = 0;
        vmeas = 0;
        fracB = 0;
        status = '';
        resampleVacuum();
        resetEnergyRef();
        updateSpectrum();
      },
    },
  ]);

  ui.section('Field');
  ui.slider({
    key: 'm', label: 'Field mass m', min: 0, max: 3, step: 0.05, value: p.m, format: (v) => v.toFixed(2),
    onInput: (v) => { p.m = v; paramsChanged(); drawInset(); },
  });
  ui.toggle({
    key: 'jitter', label: 'Vacuum jitter (schematic)', value: jitter,
    onChange: (v) => { jitter = v; vacNote.style.display = v ? 'block' : 'none'; if (v) resampleVacuum(); else clearField(V); },
  });
  ui.slider({
    key: 'g', label: 'Coupling to field B', min: 0, max: 0.6, step: 0.01, value: p.g,
    onInput: (v) => {
      const wasOn = p.g > 0;
      p.g = v;
      paramsChanged();
      const on = v > 0;
      coupleMat.opacity = Math.min(0.55, 0.15 + v);
      if (on && !sheetB.group.visible) {
        sheetB.group.visible = true;
        couple.visible = true;
        labB.visible = true;
        stage.flyTo(CAM.two.pos, CAM.two.target);
      }
      couple.visible = on;
      if (!on && wasOn) status = status || 'coupling off';
    },
  });
  ui.note('Units: ħ = c = 1. The coupling is a toy: a spring joining matching sites of the two sheets. Click the sheet to pluck it.');

  ui.section('Live readouts');
  const rOmega = ui.readout('omega', 'mode ω_k');
  const rE = ui.readout('E', 'E = ħω_k');
  const rVg = ui.readout('vg', 'predicted v = dω/dk');
  const rVm = ui.readout('vmeas', 'measured v');
  const rDist = ui.readout('dist', 'distance');
  const rErr = ui.readout('speedErr', 'speed error');
  const rNA = ui.readout('nA', 'quanta in A');
  const rNB = ui.readout('nB', 'quanta in B');
  const rDrift = ui.readout('drift', 'energy drift');
  const rT = ui.readout('t', 'time');
  const statusNote = ui.note('');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'field A' },
    { color: css(PALETTE.amber), label: 'field B / particle' },
  ]);

  function speedErr(): number {
    return vgLaunch > 0 ? (vmeas / vgLaunch - 1) * 100 : 0;
  }

  function updateReadouts(): void {
    const wk = omegaLattice(k0, 0, p.m, A);
    rOmega(wk.toFixed(3));
    rE(`${wk.toFixed(3)} ħ`);
    rVg(`${groupVelocityLattice(k0, p.m, A).toFixed(3)} c`);
    rVm(measuring && dist > 0.3 ? `${vmeas.toFixed(3)} c` : '…');
    rDist(measuring ? dist.toFixed(1) : '…');
    rErr(measuring && dist > 0.3 ? `${speedErr().toFixed(1)} %` : '…');
    rNA(nA.toFixed(2));
    rNB(nB.toFixed(2));
    rDrift(e0 > 0 ? `${(drift * 100).toExponential(0)} %` : '…');
    rT(t.toFixed(1));
    const txt = status || (measuring ? `tracking the newest particle. Continuum v = k/ω = ${groupVelocityContinuum(k0, p.m).toFixed(3)} c` : '');
    if (statusNote.textContent !== txt) statusNote.textContent = txt;
  }

  // Demo particle so the sheet is alive at first glance (does not count for challenges)
  launch(false);
  drawInset();

  const api = {
    state: () => ({
      t, m: p.m, k: k0, sigma, g: p.g, jitter, userLaunch, measuring, dist, vmeas, vg: vgLaunch,
      speedErr: measuring && dist > 0.3 ? speedErr() : 999, launchM, fracB, nA, nB, drift,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
  return api;
}

const topic: Topic = {
  id: 'quantum-fields',
  number: 93,
  title: 'Quantum Fields',
  domain: 'foundations',
  level: 3,
  status: 'live',
  tagline: 'Particles are ripples in fields that fill all of space.',
  content,
  mount,
};

export default topic;
