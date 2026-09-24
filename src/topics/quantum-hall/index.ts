import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  B_LOW, DEFAULT_PARAMS, R_K, classicalHall, cyclotronMeV, degeneracy, emptyResult, fermiEnergyMeV,
  levelEnergy, makeDisorder, nu2Deviation, plateauIndex, rng, skipDirection, solveQH, stepElectrons,
  type Disorder, type QHParams,
} from './physics.ts';

type View = 'sample' | 'fan';

// ---- Hall bar geometry (scene units)
const L = 10;
const W = 3.6;
const MAXE = 440;
const V0 = 1.2; // electron speed in the scene
const HSTEP = 1 / 300; // integrator step (s)
const NTRACE = 4;

// ---- Landau fan geometry
const BMAX = 14;
const NS = 200; // sweep samples for the inset and the Fermi line
const NB = 100; // surface columns (B)
const NE = 150; // surface rows (E)
const FX0 = -4.5, FXW = 9; // B axis
const FY0 = -2.0, FYH = 4.4; // E axis
const FZS = 1.5; // DOS height
const MAXL = 64; // fan lines
const LSEG = 40; // segments per fan line
const MAXRUN = 24; // plateau strips

const CAM_SAMPLE: [number, number, number] = [0, 10.2, 7.6];
const TGT_SAMPLE: [number, number, number] = [0, -0.2, 0.9];
const CAM_FAN: [number, number, number] = [2.6, 2.4, 10.6];
const TGT_FAN: [number, number, number] = [0.4, 0.2, 0.3];

const RK_KOHM = R_K / 1000;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_SAMPLE, target: TGT_SAMPLE, fov: 42 });
  const { scene } = stage;

  // ---- State
  let B = 3;
  let nDens = 2.5; // 1e11 cm^-2
  let view: View = 'sample';
  let sweeping = false;
  const p: QHParams = { ...DEFAULT_PARAMS, n: nDens * 1e15 };
  const cur = emptyResult();
  let plateau = 0;
  let plateauDev = 0;
  let edgeDir = 1;

  // ======================= Sample view =======================
  const sampleG = new THREE.Group();
  scene.add(sampleG);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.2, 0.3, W + 0.2),
    new THREE.MeshStandardMaterial({ color: 0x141b2c, roughness: 0.8, metalness: 0.2 }),
  );
  slab.position.y = -0.16;
  sampleG.add(slab);

  // Disorder landscape texture on the electron sheet
  const TXN = 160, TZN = 64;
  const impData = new Uint8Array(TXN * TZN * 4);
  const impTex = new THREE.DataTexture(impData, TXN, TZN, THREE.RGBAFormat);
  impTex.magFilter = THREE.LinearFilter;
  impTex.minFilter = THREE.LinearFilter;
  impTex.colorSpace = THREE.SRGBColorSpace;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshBasicMaterial({ map: impTex }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.001;
  sampleG.add(sheet);

  // Contacts and probe arms
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.8 });
  const padGeo = new THREE.BoxGeometry(0.7, 0.2, W + 0.6);
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(padGeo, gold);
    pad.position.set(sx * (L / 2 + 0.45), -0.05, 0);
    sampleG.add(pad);
  }
  const armGeo = new THREE.BoxGeometry(0.4, 0.16, 0.7);
  for (const ax of [-2.5, 2.5]) {
    for (const sz of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, gold);
      arm.position.set(ax, -0.07, sz * (W / 2 + 0.4));
      sampleG.add(arm);
    }
  }
  stage.label('source', [-L / 2 - 0.45, 0.2, W / 2 + 0.75], 'muted', sampleG);
  stage.label('drain', [L / 2 + 0.45, 0.2, W / 2 + 0.75], 'muted', sampleG);
  stage.label('V_H ↕', [2.5, 0.2, W / 2 + 1.05], 'muted', sampleG);
  stage.label('V_xx ↔', [0, 0.2, W / 2 + 1.05], 'muted', sampleG);

  // Magnetic field arrows
  const arrowG = new THREE.Group();
  sampleG.add(arrowG);
  const arrows: THREE.ArrowHelper[] = [];
  for (const [x, z] of [[-4.2, -2.6], [4.2, -2.6], [-4.2, 2.6], [4.2, 2.6], [-1.2, -2.7], [1.2, 2.7]] as [number, number][]) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, 0, z), 1, PALETTE.violet, 0.25, 0.16);
    arrows.push(a);
    arrowG.add(a);
  }
  const bLabel = stage.label('B', [1.2, 1.9, 2.7], '', sampleG);

  // Edge channels: glow strip plus moving chevrons
  const chevCanvas = document.createElement('canvas');
  chevCanvas.width = 128;
  chevCanvas.height = 32;
  {
    const g = chevCanvas.getContext('2d')!;
    g.clearRect(0, 0, 128, 32);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(44, 5);
    g.lineTo(76, 16);
    g.lineTo(44, 27);
    g.stroke();
  }
  const chevTex = new THREE.CanvasTexture(chevCanvas);
  chevTex.wrapS = THREE.RepeatWrapping;
  chevTex.repeat.set(L / 0.55, 1);
  chevTex.colorSpace = THREE.SRGBColorSpace;
  const chevMat = new THREE.MeshBasicMaterial({ map: chevTex, color: PALETTE.cyan, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const chevGeo = new THREE.PlaneGeometry(L, 0.2);
  const glowGeo = new THREE.PlaneGeometry(L, 0.42);
  const edges: { chev: THREE.Mesh; glow: THREE.Mesh; top: boolean }[] = [];
  for (const top of [true, false]) {
    const z = top ? W / 2 - 0.12 : -W / 2 + 0.12;
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.012, top ? W / 2 - 0.2 : -W / 2 + 0.2);
    const chev = new THREE.Mesh(chevGeo, chevMat);
    chev.rotation.x = -Math.PI / 2;
    chev.position.set(0, 0.02, z);
    sampleG.add(glow, chev);
    edges.push({ chev, glow, top });
  }
  const edgeLabelA = stage.label('edge current', [-2.6, 0.3, W / 2 + 0.45], '', sampleG);
  const edgeLabelB = stage.label('edge current', [0.4, 0.3, -W / 2 - 0.4], '', sampleG);

  // Electrons
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const ePos = new Float32Array(MAXE * 3);
  const eCol = new Float32Array(MAXE * 3);
  const eGeo = new THREE.BufferGeometry();
  const ePosAttr = new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage);
  const eColAttr = new THREE.BufferAttribute(eCol, 3).setUsage(THREE.DynamicDrawUsage);
  eGeo.setAttribute('position', ePosAttr);
  eGeo.setAttribute('color', eColAttr);
  const electrons = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.17, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  electrons.frustumCulled = false;
  sampleG.add(electrons);

  const es = new Float64Array(MAXE * 4);
  const wallHit = new Uint8Array(MAXE);
  const edgeAge = new Float32Array(MAXE).fill(99);
  const gradBuf = new Float64Array(2);
  let nElec = 0;
  let disorder: Disorder | null = null;
  const cEdge = new THREE.Color(PALETTE.cyan);
  const cBulk = new THREE.Color(0xc8b6ff);

  const traces: Trail[] = [];
  const traceG = new THREE.Group();
  traceG.position.y = 0.03;
  sampleG.add(traceG);
  for (let i = 0; i < NTRACE; i++) {
    const tr = new Trail(150, i < 2 ? PALETTE.cyan : PALETTE.amber, 0.9);
    traces.push(tr);
    traceG.add(tr.line);
  }
  const lastX = new Float64Array(NTRACE);

  function seedElectrons(): void {
    const r = rng(11);
    const n = Math.round(70 * nDens);
    nElec = Math.min(MAXE, n);
    for (let i = 0; i < MAXE; i++) {
      const o = i * 4;
      let x = (r() - 0.5) * L;
      let z = (r() - 0.5) * W;
      if (i === 0) { x = -3; z = W / 2 - 0.15; }
      if (i === 1) { x = 3; z = -W / 2 + 0.15; }
      if (i === 2) { x = -1.5; z = 0.3; }
      if (i === 3) { x = 2; z = -0.5; }
      const a = r() * Math.PI * 2;
      es[o] = x;
      es[o + 1] = z;
      es[o + 2] = V0 * Math.cos(a);
      es[o + 3] = V0 * Math.sin(a);
      edgeAge[i] = 99;
    }
    for (let i = 0; i < NTRACE; i++) { traces[i].clear(); lastX[i] = es[i * 4]; }
    electrons.geometry.setDrawRange(0, nElec);
  }

  function buildDisorder(): void {
    const amp = Math.min(2.2, 0.9 * (p.gamma / 0.35));
    disorder = makeDisorder(L, W, 36, amp, 0.42, 5);
    let vmax = 1e-9;
    for (let k = 0; k < disorder.V.length; k++) vmax = Math.max(vmax, Math.abs(disorder.V[k]));
    const vis = Math.min(1, 0.35 + p.gamma / 0.8);
    for (let r = 0; r < TZN; r++) {
      const k = TZN - 1 - r; // texture row 0 is z = +W/2
      for (let i = 0; i < TXN; i++) {
        const v = disorder.V[k * disorder.nx + Math.min(disorder.nx - 1, i)] / vmax;
        const a = Math.min(1, Math.abs(v)) * vis;
        const base = [15, 22, 38];
        const tint = v > 0 ? [244, 114, 182] : [167, 139, 250];
        const o = (r * TXN + i) * 4;
        impData[o] = base[0] + (tint[0] - base[0]) * a * 0.55;
        impData[o + 1] = base[1] + (tint[1] - base[1]) * a * 0.55;
        impData[o + 2] = base[2] + (tint[2] - base[2]) * a * 0.55;
        impData[o + 3] = 255;
      }
    }
    impTex.needsUpdate = true;
  }

  function omegaNow(): number {
    const aB = Math.abs(B);
    if (aB < 0.02) return 0;
    const rc = Math.max(0.1, 0.95 / aB);
    return Math.sign(B) * (V0 / rc);
  }

  function stepSample(dt: number): void {
    const steps = Math.min(24, Math.max(1, Math.round(dt / HSTEP)));
    const h = dt / steps;
    const om = omegaNow();
    stepElectrons(es, nElec, h, steps, om, L, W, disorder, wallHit, gradBuf);
    // thermal scattering: random turns at a rate that grows with T
    const pk = 1 - Math.exp(-0.06 * p.T * dt);
    for (let i = 0; i < nElec; i++) {
      const o = i * 4;
      if (pk > 0 && Math.random() < pk) {
        const sp = Math.hypot(es[o + 2], es[o + 3]);
        const a = Math.random() * Math.PI * 2;
        es[o + 2] = sp * Math.cos(a);
        es[o + 3] = sp * Math.sin(a);
      }
      edgeAge[i] = wallHit[i] ? 0 : edgeAge[i] + dt;
      const f = Math.max(0, 1 - edgeAge[i] / 1.4);
      ePos[i * 3] = es[o];
      ePos[i * 3 + 1] = 0.05;
      ePos[i * 3 + 2] = es[o + 1];
      eCol[i * 3] = cBulk.r + (cEdge.r - cBulk.r) * f;
      eCol[i * 3 + 1] = cBulk.g + (cEdge.g - cBulk.g) * f;
      eCol[i * 3 + 2] = cBulk.b + (cEdge.b - cBulk.b) * f;
    }
    ePosAttr.needsUpdate = true;
    eColAttr.needsUpdate = true;
    for (let i = 0; i < NTRACE; i++) {
      const x = es[i * 4];
      if (Math.abs(x - lastX[i]) > L / 2) traces[i].clear();
      lastX[i] = x;
      traces[i].push(x, 0, es[i * 4 + 1]);
    }
  }

  const arrowDir = new THREE.Vector3();
  function updateFieldVisuals(): void {
    const aB = Math.abs(B);
    const len = 0.35 + 0.1 * Math.min(aB, 14);
    const dir = B >= 0 ? 1 : -1;
    for (const a of arrows) {
      a.visible = aB >= 0.05;
      a.setDirection(arrowDir.set(0, dir, 0));
      a.position.y = dir > 0 ? 0 : len;
      a.setLength(len, 0.25, 0.16);
    }
    bLabel.position.set(1.2, len + 0.3, 2.7);
    bLabel.element.textContent = `B ${B >= 0 ? '↑' : '↓'} ${aB.toFixed(1)} T`;
    const om = omegaNow();
    edgeDir = om === 0 ? 0 : skipDirection(om, true);
    for (const e of edges) {
      const d = skipDirection(om, e.top);
      e.chev.visible = d !== 0;
      e.glow.visible = d !== 0;
      e.chev.scale.x = d >= 0 ? 1 : -1;
    }
    const arrowTxt = (d: number) => (d > 0 ? 'edge current →' : d < 0 ? '← edge current' : 'no edge channel');
    edgeLabelA.element.textContent = arrowTxt(skipDirection(om, true));
    edgeLabelB.element.textContent = arrowTxt(skipDirection(om, false));
  }

  // ======================= Landau fan view =======================
  const fanG = new THREE.Group();
  scene.add(fanG);
  let Emax = 20;
  const bOf = (i: number) => B_LOW + ((BMAX - B_LOW) * i) / (NB - 1);
  const xOfB = (b: number) => FX0 + (b / BMAX) * FXW;
  const yOfE = (e: number) => FY0 + (e / Emax) * FYH;

  // DOS surface
  const sPos = new Float32Array(NB * NE * 3);
  const sCol = new Float32Array(NB * NE * 3);
  const sH = new Float32Array(NB * NE);
  const sGeo = new THREE.BufferGeometry();
  const sPosAttr = new THREE.BufferAttribute(sPos, 3);
  const sColAttr = new THREE.BufferAttribute(sCol, 3);
  sGeo.setAttribute('position', sPosAttr);
  sGeo.setAttribute('color', sColAttr);
  {
    const idx: number[] = [];
    for (let i = 0; i < NB - 1; i++) {
      for (let k = 0; k < NE - 1; k++) {
        const a = i * NE + k, b = (i + 1) * NE + k, c = (i + 1) * NE + k + 1, d = i * NE + k + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    sGeo.setIndex(idx);
  }
  const surface = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  fanG.add(surface);

  // Back wall and axes
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(FXW, FYH), new THREE.MeshBasicMaterial({ color: 0x0c1220, side: THREE.DoubleSide }));
  wall.position.set(FX0 + FXW / 2, FY0 + FYH / 2, -0.01);
  fanG.add(wall);
  const axMat = new THREE.LineBasicMaterial({ color: PALETTE.gridMajor });
  const axGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(FX0, FY0, 0), new THREE.Vector3(FX0 + FXW + 0.2, FY0, 0),
    new THREE.Vector3(FX0, FY0, 0), new THREE.Vector3(FX0, FY0 + FYH + 0.2, 0),
    new THREE.Vector3(FX0, FY0, 0), new THREE.Vector3(FX0, FY0, FZS + 0.4),
  ]);
  fanG.add(new THREE.LineSegments(axGeo, axMat));
  stage.label('B (T)', [FX0 + FXW + 0.55, FY0, 0], 'muted', fanG);
  stage.label('E (meV)', [FX0, FY0 + FYH + 0.45, 0], 'muted', fanG);
  stage.label('density of states', [FX0, FY0 - 0.1, FZS + 0.75], 'muted', fanG);
  for (const b of [0, 5, 10]) stage.label(String(b), [xOfB(b), FY0 - 0.3, 0], 'muted', fanG);
  const eTickLabels = [0, 1, 2, 3].map(() => stage.label('', [FX0 - 0.35, 0, 0], 'muted', fanG));

  // Fan lines along the ridge crests
  const flPos = new Float32Array(MAXL * LSEG * 2 * 3);
  const flGeo = new THREE.BufferGeometry();
  flGeo.setAttribute('position', new THREE.BufferAttribute(flPos, 3));
  const fanLines = new THREE.LineSegments(flGeo, new THREE.LineBasicMaterial({ color: 0xe8eefc, transparent: true, opacity: 0.55 }));
  fanLines.frustumCulled = false;
  fanG.add(fanLines);

  // Fermi level line mu(B) and current-B markers
  const muPos = new Float32Array(NS * 3);
  const muGeo = new THREE.BufferGeometry();
  muGeo.setAttribute('position', new THREE.BufferAttribute(muPos, 3));
  const muLine = new THREE.Line(muGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  muLine.frustumCulled = false;
  fanG.add(muLine);
  const fermiPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(FXW, FZS + 0.3),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  fermiPlane.rotation.x = -Math.PI / 2;
  fanG.add(fermiPlane);
  const fermiLabel = stage.label('Fermi level', [0, 0, 0], '', fanG);
  const slice = new THREE.Mesh(
    new THREE.PlaneGeometry(FZS + 0.3, FYH),
    new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  slice.rotation.y = Math.PI / 2;
  fanG.add(slice);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.white }));
  fanG.add(marker);
  const sliceLabel = stage.label('', [0, 0, 0], '', fanG);

  // Plateau strips on the floor
  const stripGeo = new THREE.BoxGeometry(1, 0.06, 0.3);
  const strips = new THREE.InstancedMesh(stripGeo, new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.7 }), MAXRUN);
  strips.count = 0;
  fanG.add(strips);
  const stripLabels = Array.from({ length: 6 }, () => stage.label('', [0, 0, 0], 'muted', fanG));

  function dosS(b: number, e: number, gv: number): number {
    const hw = cyclotronMeV(b);
    const k = Math.ceil((4 * gv) / hw) + 1;
    const N0 = Math.max(0, Math.floor(e / hw - 0.5) - k);
    const N1 = Math.floor(e / hw + 0.5) + k;
    let s = 0;
    for (let N = N0; N <= N1; N++) {
      for (let sp = 0; sp < 2; sp++) {
        const d = e - levelEnergy(2 * N + sp, hw, p.spinFrac);
        if (Math.abs(d) < 4 * gv) s += Math.exp((-0.5 * d * d) / (gv * gv));
      }
    }
    return s;
  }
  const heightOf = (s: number) => FZS * (1 - Math.exp(-s));

  function buildSurface(): void {
    Emax = Math.min(45, Math.max(14, 2.3 * fermiEnergyMeV(p.n)));
    const dE = Emax / (NE - 1);
    const gv = Math.max(p.gamma, 1.3 * dE);
    for (let i = 0; i < NB; i++) {
      const b = bOf(i);
      for (let k = 0; k < NE; k++) {
        const e = k * dE;
        const h = heightOf(dosS(b, e, gv));
        const o = i * NE + k;
        sH[o] = h;
        sPos[o * 3] = xOfB(b);
        sPos[o * 3 + 1] = yOfE(e);
        sPos[o * 3 + 2] = h;
      }
    }
    sPosAttr.needsUpdate = true;
    sGeo.computeVertexNormals();
    sGeo.computeBoundingSphere();
    // fan lines along crests
    let m = 0;
    for (let j = 0; j < MAXL; j++) {
      for (let q = 0; q < LSEG; q++) {
        const b0 = B_LOW + ((BMAX - B_LOW) * q) / LSEG;
        const b1 = B_LOW + ((BMAX - B_LOW) * (q + 1)) / LSEG;
        const e0 = levelEnergy(j, cyclotronMeV(b0), p.spinFrac);
        const e1 = levelEnergy(j, cyclotronMeV(b1), p.spinFrac);
        const o = m * 6;
        if (e1 > Emax) {
          for (let c = 0; c < 6; c++) flPos[o + c] = 0;
        } else {
          flPos[o] = xOfB(b0); flPos[o + 1] = yOfE(e0); flPos[o + 2] = heightOf(dosS(b0, e0, gv)) + 0.015;
          flPos[o + 3] = xOfB(b1); flPos[o + 4] = yOfE(e1); flPos[o + 5] = heightOf(dosS(b1, e1, gv)) + 0.015;
        }
        m++;
      }
    }
    (flGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const step = Emax > 30 ? 10 : 5;
    eTickLabels.forEach((lb, i) => {
      const e = i * step;
      lb.visible = e <= Emax;
      lb.position.set(FX0 - 0.4, yOfE(e), 0);
      lb.element.textContent = String(e);
    });
  }

  // ======================= Model sweep (progressive) =======================
  const swRxy = new Float64Array(NS);
  const swRxx = new Float64Array(NS);
  const swMu = new Float64Array(NS);
  const swB = new Float64Array(NS);
  for (let i = 0; i < NS; i++) swB[i] = B_LOW + ((BMAX - B_LOW) * i) / (NS - 1);
  let swDone = 0;
  const tmp = emptyResult();

  function restartSweep(): void {
    swDone = 0;
  }

  function advanceSweep(budgetMs: number): void {
    if (swDone >= NS) return;
    const t0 = performance.now();
    while (swDone < NS && performance.now() - t0 < budgetMs) {
      solveQH(swB[swDone], p, tmp);
      swRxy[swDone] = tmp.Rxy;
      swRxx[swDone] = tmp.Rxx;
      swMu[swDone] = tmp.mu;
      swDone++;
    }
    if (swDone >= NS) onSweepDone();
  }

  function muAt(b: number): number {
    const f = ((b - B_LOW) / (BMAX - B_LOW)) * (NS - 1);
    const i = Math.max(0, Math.min(NS - 2, Math.floor(f)));
    const a = Math.max(0, Math.min(1, f - i));
    return swMu[i] * (1 - a) + swMu[i + 1] * a;
  }

  function onSweepDone(): void {
    // colour surface: filled states cyan, empty slate, brightness by height
    const dE = Emax / (NE - 1);
    for (let i = 0; i < NB; i++) {
      const mu = muAt(bOf(i));
      for (let k = 0; k < NE; k++) {
        const o = i * NE + k;
        const h = sH[o] / FZS;
        const filled = k * dE <= mu;
        const lum = 0.12 + 0.88 * h;
        if (filled) {
          sCol[o * 3] = 0.12 * lum + 0.02; sCol[o * 3 + 1] = 0.62 * lum + 0.05; sCol[o * 3 + 2] = 0.78 * lum + 0.08;
        } else {
          sCol[o * 3] = 0.34 * lum + 0.04; sCol[o * 3 + 1] = 0.38 * lum + 0.05; sCol[o * 3 + 2] = 0.5 * lum + 0.08;
        }
      }
    }
    sColAttr.needsUpdate = true;
    const dEs = Emax / (NE - 1);
    const gv = Math.max(p.gamma, 1.3 * dEs);
    for (let i = 0; i < NS; i++) {
      const mu = Math.min(Emax, Math.max(0, swMu[i]));
      muPos[i * 3] = xOfB(swB[i]);
      muPos[i * 3 + 1] = yOfE(mu);
      muPos[i * 3 + 2] = heightOf(dosS(swB[i], mu, gv)) + 0.03;
    }
    (muGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // plateau strips
    const m4 = new THREE.Matrix4();
    let runs = 0;
    let lb = 0;
    stripLabels.forEach((l) => (l.visible = false));
    let i = 0;
    while (i < NS && runs < MAXRUN) {
      const v = plateauIndex(swRxy[i], swRxx[i], 1e-3);
      if (!v) { i++; continue; }
      let j = i;
      while (j + 1 < NS && plateauIndex(swRxy[j + 1], swRxx[j + 1], 1e-3) === v) j++;
      const x0 = xOfB(swB[i]), x1 = xOfB(swB[j]);
      const w = Math.max(0.04, x1 - x0);
      m4.makeScale(w, 1, 1).setPosition((x0 + x1) / 2, FY0 - 0.08, 0.15);
      strips.setMatrixAt(runs++, m4);
      if (v <= 6 && lb < stripLabels.length && w > 0.25) {
        const l = stripLabels[lb++];
        l.visible = true;
        l.position.set((x0 + x1) / 2, FY0 - 0.35, 0.5);
        l.element.textContent = `ν=${v}`;
      }
      i = j + 1;
    }
    strips.count = runs;
    strips.instanceMatrix.needsUpdate = true;
    drawInset();
  }

  function updateFanMarkers(): void {
    const aB = Math.min(BMAX, Math.max(B_LOW, Math.abs(B)));
    const mu = Math.min(Emax, Math.max(0, cur.mu));
    const x = xOfB(aB);
    const y = yOfE(mu);
    fermiPlane.position.set(FX0 + FXW / 2, y, (FZS + 0.3) / 2);
    fermiLabel.position.set(FX0 + FXW + 0.2, y, FZS + 0.3);
    slice.position.set(x, FY0 + FYH / 2, (FZS + 0.3) / 2);
    const dEs = Emax / (NE - 1);
    marker.position.set(x, y, heightOf(dosS(aB, mu, Math.max(p.gamma, 1.3 * dEs))) + 0.05);
    sliceLabel.position.set(x, FY0 + FYH + 0.2, 0.2);
    sliceLabel.element.textContent = plateau ? `on plateau ν = ${plateau}` : `B = ${aB.toFixed(2)} T`;
    sliceLabel.element.style.color = plateau ? css(PALETTE.green) : '';
  }

  // ======================= Inset: R_xy and R_xx vs B =======================
  const inset = document.createElement('canvas');
  inset.width = 500;
  inset.height = 360;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '250px', height: '180px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const YMAX = 1.3 * RK_KOHM;

  function drawInset(): void {
    const Wc = inset.width, Hc = inset.height;
    const x0 = 64, x1 = Wc - 16, y0 = 48, y1 = Hc - 46;
    const X = (b: number) => x0 + (b / BMAX) * (x1 - x0);
    const Y = (r: number) => y1 - (Math.min(r, YMAX * 1.02) / YMAX) * (y1 - y0);
    ictx.clearRect(0, 0, Wc, Hc);
    ictx.font = '600 22px JetBrains Mono, monospace';
    ictx.fillStyle = '#b8c3d9';
    ictx.fillText('model, vs |B|', 14, 30);
    ictx.fillStyle = css(PALETTE.cyan);
    ictx.fillText('R_xy', Wc - 150, 30);
    ictx.fillStyle = css(PALETTE.rose);
    ictx.fillText('R_xx', Wc - 76, 30);
    ictx.strokeStyle = '#2c3852';
    ictx.lineWidth = 2;
    ictx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    for (const b of [0, 5, 10]) {
      ictx.fillRect(X(b) - 1, y1, 2, 7);
      ictx.fillText(String(b), X(b) - 6, y1 + 28);
    }
    ictx.fillText('B (T)', x1 - 58, y1 + 28);
    // plateau reference lines h/(nu e^2)
    ictx.setLineDash([3, 6]);
    ictx.lineWidth = 1.2;
    for (let v = 1; v <= 6; v++) {
      const y = Y(RK_KOHM / v);
      ictx.strokeStyle = 'rgba(94,227,154,0.35)';
      ictx.beginPath();
      ictx.moveTo(x0, y);
      ictx.lineTo(x1, y);
      ictx.stroke();
      if (v <= 3) {
        ictx.fillStyle = 'rgba(94,227,154,0.9)';
        ictx.fillText(`ν=${v}`, x0 - 58, y + 7);
      }
    }
    // classical line
    ictx.strokeStyle = 'rgba(131,145,171,0.6)';
    ictx.setLineDash([8, 7]);
    ictx.beginPath();
    ictx.moveTo(X(0), Y(0));
    const bTop = Math.min(BMAX, (YMAX * 1000) * p.n * 1.602176634e-19);
    ictx.lineTo(X(bTop), Y(classicalHall(bTop, p.n) / 1000));
    ictx.stroke();
    ictx.setLineDash([]);
    ictx.save();
    ictx.beginPath();
    ictx.rect(x0, y0 - 2, x1 - x0, y1 - y0 + 2);
    ictx.clip();
    const curve = (arr: Float64Array, color: string, lw: number, fromOrigin: boolean) => {
      ictx.strokeStyle = color;
      ictx.lineWidth = lw;
      ictx.beginPath();
      let pen = fromOrigin;
      if (fromOrigin) ictx.moveTo(X(0), Y(0));
      for (let i = 0; i < swDone; i++) {
        const r = Math.abs(arr[i]) / 1000;
        if (!Number.isFinite(r)) { pen = false; continue; }
        if (pen) ictx.lineTo(X(swB[i]), Y(r));
        else { ictx.moveTo(X(swB[i]), Y(r)); pen = true; }
      }
      ictx.stroke();
    };
    curve(swRxx, css(PALETTE.rose), 2.5, false);
    curve(swRxy, css(PALETTE.cyan), 3.5, true);
    // marker
    const aB = Math.min(BMAX, Math.abs(B));
    ictx.strokeStyle = 'rgba(255,255,255,0.35)';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.moveTo(X(aB), y0);
    ictx.lineTo(X(aB), y1);
    ictx.stroke();
    ictx.fillStyle = '#ffffff';
    const ry = Number.isFinite(cur.Rxy) ? Math.abs(cur.Rxy) / 1000 : YMAX;
    ictx.beginPath();
    ictx.arc(X(aB), Y(ry), 7, 0, Math.PI * 2);
    ictx.fill();
    ictx.fillStyle = css(PALETTE.rose);
    ictx.beginPath();
    ictx.arc(X(aB), Y(Number.isFinite(cur.Rxx) ? cur.Rxx / 1000 : YMAX), 5, 0, Math.PI * 2);
    ictx.fill();
    ictx.restore();
    if (swDone < NS) {
      ictx.fillStyle = '#8391ab';
      ictx.fillText('computing…', x0 + 10, y0 + 22);
    }
  }

  // ======================= Overlays =======================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const badge = document.createElement('div');
  badge.className = 'stage-overlay';
  Object.assign(badge.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '6px 10px',
    font: '12px/1.45 JetBrains Mono, monospace', color: '#b8c3d9', textAlign: 'right',
  } as CSSStyleDeclaration);
  viewport.appendChild(badge);

  function drawLegend(): void {
    if (view === 'sample') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Hall bar, seen from above</div>
<div><span style="color:${css(PALETTE.violet)}">B</span> points ${B >= 0 ? 'up' : 'down'} through the sheet.</div>
<div><span style="color:#c8b6ff">Bulk dots</span> circle around impurity bumps and stay put (localized).</div>
<div><span style="color:${css(PALETTE.cyan)}">Edge dots</span> bounce off a wall and skip along it, one way only.</div>
<div style="color:#8391ab;margin-top:3px">Classical cartoon, orbits enlarged.</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Landau fan</div>
<div>Each ridge is one level, E = ħω<sub>c</sub>(n+½), split by spin.</div>
<div><span style="color:${css(PALETTE.cyan)}">Cyan</span> = filled. <span style="color:${css(PALETTE.amber)}">Amber</span> = Fermi level.</div>
<div><span style="color:${css(PALETTE.green)}">Green bars</span> = plateaus: the Fermi level sits in a gap.</div>`;
    }
  }

  function drawBadge(): void {
    const rxy = Number.isFinite(cur.Rxy) ? `${(cur.Rxy / 1000).toFixed(3)} kΩ` : 'n/a';
    const line2 = plateau
      ? `<span style="color:${css(PALETTE.green)}">plateau: R_xy = h/(${plateau}e²)</span>`
      : cur.insulating ? 'insulating (all states localized)' : 'between plateaus';
    badge.innerHTML = `ν = ${cur.nu.toFixed(2)} · R_xy = ${rxy}<br/>${line2}`;
  }

  function applyView(): void {
    sampleG.visible = view === 'sample';
    fanG.visible = view === 'fan';
    drawLegend();
  }

  // ======================= Recompute =======================
  function solveCurrent(): void {
    solveQH(B, p, cur);
    plateau = Math.abs(B) >= B_LOW ? plateauIndex(cur.Rxy, cur.Rxx) : 0;
    updateFieldVisuals();
    updateFanMarkers();
    drawBadge();
    drawInset();
  }

  function onModelChange(rebuildSurface: boolean): void {
    plateauDev = nu2Deviation(p);
    if (rebuildSurface) buildSurface();
    restartSweep();
    solveCurrent();
  }

  // ======================= Frame loop =======================
  let chevOff = 0;
  stage.onFrame((dt) => {
    if (sweeping) {
      let nb = Math.abs(B) + 0.8 * dt;
      if (nb > BMAX) nb = 0.5;
      B = (B < 0 ? -1 : 1) * nb;
      bCtl.set(Math.round(B * 100) / 100, false);
      solveCurrent();
    }
    if (swDone < NS) {
      advanceSweep(7);
      if (swDone < NS) drawInset();
    }
    if (view === 'sample') {
      stepSample(dt);
      chevOff -= dt * 1.6;
      chevTex.offset.x = chevOff;
    }
    updateReadouts();
  });

  // ======================= Controls =======================
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'sample', label: 'Hall bar sample' }, { value: 'fan', label: 'Landau fan' }],
    onChange: (v) => {
      view = v;
      applyView();
      if (v === 'sample') stage.flyTo(CAM_SAMPLE, TGT_SAMPLE);
      else stage.flyTo(CAM_FAN, TGT_FAN);
    },
  });

  ui.section('Sample');
  const bCtl = ui.slider({
    key: 'B', label: 'Magnetic field B', min: -14, max: 14, step: 0.01, value: B, unit: 'T', format: (v) => v.toFixed(2),
    onInput: (v) => { B = v; drawLegend(); solveCurrent(); },
  });
  const [sweepBtn] = ui.buttons([
    { label: 'Sweep B', primary: true, key: 'B', onClick: () => { sweeping = !sweeping; sweepBtn.textContent = sweeping ? 'Stop sweep' : 'Sweep B'; } },
    { label: 'Reset electrons', onClick: () => seedElectrons() },
  ]);
  ui.slider({
    key: 'n', label: 'Electron density n', min: 1.5, max: 6, step: 0.05, value: nDens, unit: '×10¹¹ cm⁻²', format: (v) => v.toFixed(2),
    onInput: (v) => { nDens = v; p.n = v * 1e15; seedElectrons(); onModelChange(true); },
  });
  ui.slider({
    key: 'gamma', label: 'Disorder broadening Γ', min: 0.03, max: 1.5, step: 0.01, value: p.gamma, unit: 'meV', format: (v) => v.toFixed(2),
    onInput: (v) => { p.gamma = v; buildDisorder(); onModelChange(true); },
  });
  ui.slider({
    key: 'T', label: 'Temperature T', min: 0, max: 40, step: 0.1, value: p.T, unit: 'K', format: (v) => v.toFixed(1),
    onInput: (v) => { p.T = v; onModelChange(false); },
  });
  ui.note('GaAs 2D electron gas, m* = 0.067 mₑ. The resistance curves come from a broadened-level model (see The Physics). R_xx is per square. Below 0.25 T the classical line B/(ne) is shown.');

  ui.section('Live readouts');
  const rNu = ui.readout('nu', 'filling ν = nh/eB');
  const rPl = ui.readout('plateau', 'plateau index');
  const rRxy = ui.readout('Rxy', 'R_xy', 'Ω');
  const rRxx = ui.readout('Rxx', 'R_xx', 'Ω');
  const rRK = ui.readout('RK', 'h/e² (exact)', 'Ω');
  const rDev = ui.readout('dev', 'R_xy·ν/R_K − 1');
  const rHw = ui.readout('hwc', 'ħω_c', 'meV');
  const rDeg = ui.readout('degen', 'eB/h per level', 'cm⁻²');
  const rMu = ui.readout('mu', 'Fermi level μ', 'meV');
  const rEdge = ui.readout('edge', 'near-edge flow');
  const rRes = ui.readout('resid', 'density residual');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'R_xy, edge electrons' },
    { color: css(PALETTE.rose), label: 'R_xx' },
    { color: css(PALETTE.amber), label: 'Fermi level' },
    { color: css(PALETTE.green), label: 'plateau h/(νe²)' },
  ]);
  rRK(R_K.toFixed(4));

  function updateReadouts(): void {
    rNu(Math.abs(B) < 1e-6 ? '∞' : cur.nu.toFixed(3));
    rPl(plateau ? String(plateau) : 'none');
    rRxy(Number.isFinite(cur.Rxy) ? cur.Rxy.toFixed(2) : 'n/a');
    rRxx(Number.isFinite(cur.Rxx) ? (cur.Rxx < 0.01 ? cur.Rxx.toExponential(1) : cur.Rxx.toFixed(2)) : '∞');
    rDev(plateau ? ((Math.abs(cur.Rxy) * plateau) / R_K - 1).toExponential(1) : 'n/a');
    rHw(cyclotronMeV(B).toFixed(2));
    rDeg((degeneracy(B) / 1e4).toExponential(2));
    rMu(cur.mu.toFixed(2));
    rEdge(edgeDir > 0 ? '→ (+x)' : edgeDir < 0 ? '← (−x)' : 'none');
    rRes(cur.resid.toExponential(1));
  }

  // ======================= Start =======================
  buildDisorder();
  seedElectrons();
  buildSurface();
  plateauDev = nu2Deviation(p);
  solveCurrent();
  applyView();

  return {
    state: () => ({
      view,
      B,
      n: nDens,
      gamma: p.gamma,
      T: p.T,
      nu: cur.nu,
      Rxy: Number.isFinite(cur.Rxy) ? cur.Rxy : 0,
      Rxx: Number.isFinite(cur.Rxx) ? cur.Rxx : 1e12,
      plateau,
      plateauDev,
      mu: cur.mu,
      edgeDir,
      sweeping,
    }),
    dispose: () => {
      inset.remove();
      legend.remove();
      badge.remove();
      dotTex.dispose();
      chevTex.dispose();
      impTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quantum-hall',
  number: 95,
  title: 'The Quantum Hall Effect',
  domain: 'quantum',
  level: 3,
  status: 'live',
  tagline: 'Resistance in perfect steps, set only by nature’s constants.',
  content,
  mount,
};

export default topic;
