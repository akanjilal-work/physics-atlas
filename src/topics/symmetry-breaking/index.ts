import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  countVortices, criticalT, curvatures, elasticaShape, modeMasses, mu2Eff, phiMin, potentialT, radiusAtCap, Rng,
  slopeForLoad, stepHat, stepRuler, T_BKT, vev, XYLattice, type HatParams, type RulerParams,
} from './physics.ts';

type View = 'hat' | 'ruler' | 'xy';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  hat: { pos: [0, 4.1, 5.6], target: [0, -0.45, 0] },
  ruler: { pos: [1.1, 0.6, 8.2], target: [0.2, 0.25, 0] },
  xy: { pos: [0, 10.4, 4.4], target: [0, 0, 0.3] },
};
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const BOX = { background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none', position: 'absolute' };

// Hat scene scales
const S = 1.6; // scene units per unit of |φ|
const VSC = 2.2; // scene units per unit of V
const RHO_MAX = 2.4;
const CAP = 0.2; // surface is trimmed where V reaches this value
const NR = 44;
const NT = 96;
const BALL_R = 0.13;
const TS = 2.5; // sim seconds per real second
const H_HAT = 1 / 400;
const GAMMA = 0.12;
const NOISE = 0.02;

// Ruler scene
const LEN = 4;
const NSEG = 48;
const H_RUL = 1 / 600;

// XY scene
const XL = 48;
const WIDTH = 7.2;
const CELL = WIDTH / XL;
const XY_DT = 0.05;
const XY_RATE = 24; // sim time per real second
const T_HOT = 2;
const T_COLD = 0.05;
const T_FREEZE = 0.1;
const TRACE_N = 300;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.hat.pos, target: CAM.hat.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  let view: View = 'hat';
  const hatG = new THREE.Group();
  const rulerG = new THREE.Group();
  const xyG = new THREE.Group();
  scene.add(hatG, rulerG, xyG);
  const rng = new Rng(20260924);

  // =========================================================================
  // View 1: the hat
  const hp: HatParams = { mu2: 1, lambda: 0.5, T: 0.3, c: 1 };
  const ball = new Float64Array([0, 0, 0, 0]);
  let hatTouched = false;
  let cooledThrough = false;
  let settledFor = 0;
  let rSurf = 1;
  // Goldstone tracking
  let gActive = false;
  let gAngle = 0;
  let gSwept = 0;
  let gMaxDev = 0;
  let goldstoneOK = false;
  // Radial frequency measurement
  let armed = false;
  let lastCross = -1;
  let omegaMeas = NaN;
  let hatTime = 0;

  const surfGeo = new THREE.BufferGeometry();
  const nV = (NR + 1) * (NT + 1);
  const sPos = new Float32Array(nV * 3);
  const sCol = new Float32Array(nV * 3);
  surfGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  {
    const idx: number[] = [];
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j;
        const b = a + NT + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    surfGeo.setIndex(idx);
  }
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  hatG.add(surf);
  hatG.add(new THREE.Mesh(surfGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.06, depthWrite: false })));

  const RING_N = 160;
  const ringPos = new Float32Array(RING_N * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  ring.frustumCulled = false;
  hatG.add(ring);

  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: PALETTE.amber, emissiveIntensity: 0.6, roughness: 0.3 }));
  hatG.add(ballMesh);
  const trail = new Trail(500, PALETTE.amber, 0.85);
  hatG.add(trail.line);

  // Mode arrows at the ball: Goldstone (along rim) and radial
  const arrG = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.55, PALETTE.green, 0.14, 0.09);
  const arrR = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.45, PALETTE.rose, 0.14, 0.09);
  hatG.add(arrG, arrR);
  const labG = stage.label('Goldstone: flat', [0, 0, 0], '', hatG);
  labG.element.style.color = css(PALETTE.green);
  const labR = stage.label('radial: stiff', [0, 0, 0], '', hatG);
  labR.element.style.color = css(PALETTE.rose);

  const peakLabel = stage.label('', [0, 0, 0], 'muted', hatG);
  const rimLabel = stage.label('', [0, 0, 0], '', hatG);
  rimLabel.element.style.color = css(PALETTE.green);
  const axisGeo = new THREE.BufferGeometry();
  const axisPos = new Float32Array(12);
  axisGeo.setAttribute('position', new THREE.BufferAttribute(axisPos, 3));
  const axes = new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: 0x56627c }));
  axes.frustumCulled = false;
  hatG.add(axes);
  const reLabel = stage.label('Re φ', [0, 0, 0], 'muted', hatG);
  const imLabel = stage.label('Im φ', [0, 0, 0], 'muted', hatG);

  const cLow = new THREE.Color(PALETTE.cyan);
  const cMid = new THREE.Color(PALETTE.violet);
  const cHigh = new THREE.Color(PALETTE.amber);
  const tmpC = new THREE.Color();
  const hScene = (rho: number) => potentialT(hp, rho) * VSC;

  function rebuildSurface(): void {
    const rMax = radiusAtCap(hp, CAP, RHO_MAX);
    rSurf = rMax;
    const vLo = Math.min(0, potentialT(hp, phiMin(hp)));
    let k = 0;
    for (let i = 0; i <= NR; i++) {
      const rho = (rMax * i) / NR;
      const V = potentialT(hp, rho);
      const u = Math.max(0, Math.min(1, (V - vLo) / (CAP - vLo || 1)));
      if (u < 0.5) tmpC.copy(cLow).lerp(cMid, u * 2);
      else tmpC.copy(cMid).lerp(cHigh, (u - 0.5) * 2);
      for (let j = 0; j <= NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        sPos[k * 3] = rho * S * Math.cos(th);
        sPos[k * 3 + 1] = V * VSC;
        sPos[k * 3 + 2] = -rho * S * Math.sin(th);
        sCol[k * 3] = tmpC.r;
        sCol[k * 3 + 1] = tmpC.g;
        sCol[k * 3 + 2] = tmpC.b;
        k++;
      }
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();
    const r0 = phiMin(hp);
    const broken = r0 > 0;
    const y0 = hScene(r0) + 0.012;
    for (let i = 0; i < RING_N; i++) {
      const th = (i / RING_N) * Math.PI * 2;
      ringPos[i * 3] = r0 * S * Math.cos(th);
      ringPos[i * 3 + 1] = y0;
      ringPos[i * 3 + 2] = -r0 * S * Math.sin(th);
    }
    ringGeo.attributes.position.needsUpdate = true;
    ring.visible = broken;
    rimLabel.visible = broken;
    rimLabel.position.set(-r0 * S * 0.75, y0 - 0.22, r0 * S * 0.75);
    rimLabel.element.textContent = `vacuum ring |φ| = ${r0.toFixed(2)}`;
    peakLabel.position.set(0, 0.85, 0);
    peakLabel.element.textContent = broken ? 'φ = 0: symmetric but unstable' : 'φ = 0: symmetric and stable';
    const L = rMax * S + 0.35;
    const ya = CAP * VSC + 0.02;
    axisPos.set([-L, ya, 0, L, ya, 0, 0, ya, -L, 0, ya, L]);
    axisGeo.attributes.position.needsUpdate = true;
    reLabel.position.set(L + 0.25, ya, 0);
    imLabel.position.set(0, ya, -L - 0.2);
    // parameters changed: frequency measurement starts again
    trail.clear();
    armed = false;
    lastCross = -1;
    omegaMeas = NaN;
    settledFor = 0;
  }

  const tmpV = new THREE.Vector3();
  function placeBall(): void {
    const rho = Math.hypot(ball[0], ball[1]);
    ballMesh.position.set(ball[0] * S, hScene(rho) + BALL_R * 0.9, -ball[1] * S);
    const broken = phiMin(hp) > 0 && rho > 0.02;
    arrG.visible = arrR.visible = labG.visible = labR.visible = broken;
    if (broken) {
      const ux = ball[0] / rho;
      const uz = -ball[1] / rho;
      const base = ballMesh.position;
      arrR.position.copy(base);
      arrR.setDirection(tmpV.set(ux, 0, uz));
      arrG.position.copy(base);
      arrG.setDirection(tmpV.set(uz, 0, -ux)); // counter-clockwise tangent in scene
      labG.position.set(base.x + uz * 0.75, base.y + 0.18, base.z - ux * 0.75);
      labR.position.set(base.x + ux * 0.7, base.y + 0.28, base.z + uz * 0.7);
    }
  }

  function dropOnPeak(): void {
    ball.fill(0);
    const a = rng.next() * 2 * Math.PI;
    ball[0] = 1e-3 * Math.cos(a);
    ball[1] = 1e-3 * Math.sin(a);
    trail.clear();
    settledFor = 0;
    gActive = false;
  }

  function kick(radial: boolean): void {
    hatTouched = true;
    let rho = Math.hypot(ball[0], ball[1]);
    if (rho < 1e-3) {
      const a = rng.next() * 2 * Math.PI;
      ball[0] = 1e-3 * Math.cos(a);
      ball[1] = 1e-3 * Math.sin(a);
      rho = 1e-3;
    }
    const ux = ball[0] / rho;
    const uy = ball[1] / rho;
    const m = mu2Eff(hp);
    const r0 = phiMin(hp);
    if (radial) {
      const sp = r0 > 0 ? 0.15 * r0 * Math.sqrt(2 * m) : 0.35;
      ball[2] += sp * ux;
      ball[3] += sp * uy;
      gActive = false;
    } else {
      const sp = r0 > 0 ? 0.3 * r0 * Math.sqrt(Math.max(m, 0.05)) : 0.35;
      ball[2] += -sp * uy;
      ball[3] += sp * ux;
      const onRimNow = r0 > 0 && settledFor > 0.4;
      if (!gActive && onRimNow) {
        gActive = true;
        gSwept = 0;
        gMaxDev = 0;
        gAngle = Math.atan2(ball[1], ball[0]);
      }
    }
    settledFor = 0;
  }

  function stepHatFrame(dt: number): void {
    const n = Math.min(80, Math.round((dt * TS) / H_HAT));
    const r0 = phiMin(hp);
    const sq = NOISE * Math.sqrt(H_HAT);
    for (let k = 0; k < n; k++) {
      stepHat(ball, hp, GAMMA, H_HAT);
      ball[2] += sq * rng.normal();
      ball[3] += sq * rng.normal();
      hatTime += H_HAT;
      let rho = Math.hypot(ball[0], ball[1]);
      if (rho > rSurf) {
        const f = rSurf / rho;
        ball[0] *= f;
        ball[1] *= f;
        const ux = ball[0] / rSurf;
        const uy = ball[1] / rSurf;
        const vr = ball[2] * ux + ball[3] * uy;
        if (vr > 0) { ball[2] -= 1.6 * vr * ux; ball[3] -= 1.6 * vr * uy; }
        rho = rSurf;
      }
      if (r0 > 0) {
        const d = rho - r0;
        if (d < -0.004 * r0) armed = true;
        if (armed && d >= 0) {
          armed = false;
          if (lastCross > 0) {
            const P = hatTime - lastCross;
            const wd = (2 * Math.PI) / P;
            if (P > 0.3) omegaMeas = Math.sqrt(wd * wd + (GAMMA * GAMMA) / 4);
          }
          lastCross = hatTime;
        }
        if (gActive) {
          const a = Math.atan2(ball[1], ball[0]);
          let da = a - gAngle;
          if (da > Math.PI) da -= 2 * Math.PI;
          if (da < -Math.PI) da += 2 * Math.PI;
          gSwept += da;
          gAngle = a;
          gMaxDev = Math.max(gMaxDev, Math.abs(d) / r0);
          if (gMaxDev >= 0.2) gActive = false;
          else if (Math.abs(gSwept) >= Math.PI / 2) { goldstoneOK = true; }
        }
      }
    }
    const rho = Math.hypot(ball[0], ball[1]);
    const speed = Math.hypot(ball[2], ball[3]);
    const nearRim = r0 > 0 ? Math.abs(rho - r0) < 0.06 * r0 + 0.01 : rho < 0.03;
    settledFor = nearRim && speed < 0.04 ? settledFor + dt : 0;
    placeBall();
    if (speed > 0.01) trail.push(ballMesh.position.x, ballMesh.position.y - BALL_R * 0.8, ballMesh.position.z);
  }

  // =========================================================================
  // View 2: the buckling ruler
  const rp: RulerParams = { p: 0.4, bias: 0 };
  const rs = new Float64Array([0, 0]);
  let pTarget = rp.p;
  let pRate = 0;
  let rulerArmed = true;
  let biasAtBuckle = 0;
  let unlikely = false;
  let nLeft = 0;
  let nRight = 0;
  let span = 1;

  const beamGeo = new THREE.BoxGeometry(0.06, LEN, 0.55, 1, NSEG, 1);
  const beamBase = Float32Array.from(beamGeo.attributes.position.array as Float32Array);
  const beamPos = beamGeo.attributes.position.array as Float32Array;
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshStandardMaterial({ color: 0xd9dee8, emissive: 0x2a3348, roughness: 0.35, metalness: 0.2 }));
  rulerG.add(beam);
  // tick marks on the ruler face, deformed with it
  const TICKS = 16;
  const tickPos = new Float32Array(TICKS * 6);
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPos, 3));
  const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: 0x3a4660 }));
  ticks.frustumCulled = false;
  rulerG.add(ticks);

  const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.6, metalness: 0.4 });
  const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.1), blockMat);
  baseBlock.position.set(0, -LEN / 2 - 0.16, 0);
  rulerG.add(baseBlock);
  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.9), blockMat);
  rulerG.add(topPlate);
  const pinGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.8, 16);
  pinGeo.rotateX(Math.PI / 2);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.6, roughness: 0.3 });
  const pinB = new THREE.Mesh(pinGeo, pinMat);
  pinB.position.set(0, -LEN / 2, 0);
  const pinT = new THREE.Mesh(pinGeo, pinMat);
  rulerG.add(pinB, pinT);
  const loadArrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 3, 0), 1, PALETTE.amber, 0.3, 0.2);
  rulerG.add(loadArrow);
  const biasArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.6, PALETTE.violet, 0.2, 0.14);
  rulerG.add(biasArrow);
  const loadLabel = stage.label('', [0.9, 2.6, 0], '', rulerG);
  loadLabel.element.style.color = css(PALETTE.amber);
  const biasLabel = stage.label('bias', [0, 0, 0], 'muted', rulerG);
  biasLabel.element.style.color = css(PALETTE.violet);
  const stateLabel = stage.label('', [0, -LEN / 2 - 0.65, 0], 'big', rulerG);

  // ghost outlines of the two buckled states
  const GH_N = 40;
  const ghostPos = [new Float32Array(GH_N * 3), new Float32Array(GH_N * 3)];
  const ghosts = ghostPos.map((arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: PALETTE.cyan, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.55 }));
    l.frustumCulled = false;
    rulerG.add(l);
    return l;
  });
  const ghostL = stage.label('left', [0, 0, 0], 'muted', rulerG);
  const ghostR = stage.label('right', [0, 0, 0], 'muted', rulerG);

  function layoutRuler(): void {
    const sh = elasticaShape(rs[0]);
    span = sh.span;
    const d = sh.deflection * LEN;
    const y0 = -LEN / 2;
    for (let i = 0; i < beamBase.length; i += 3) {
      const s = (beamBase[i + 1] + LEN / 2) / LEN;
      beamPos[i] = beamBase[i] + d * Math.sin(Math.PI * s);
      beamPos[i + 1] = y0 + s * span * LEN;
      beamPos[i + 2] = beamBase[i + 2];
    }
    beamGeo.attributes.position.needsUpdate = true;
    beamGeo.computeVertexNormals();
    beamGeo.computeBoundingSphere();
    for (let k = 0; k < TICKS; k++) {
      const s = (k + 1) / (TICKS + 1);
      const x = d * Math.sin(Math.PI * s);
      const y = y0 + s * span * LEN;
      const w = k % 4 === 3 ? 0.2 : 0.11;
      const o = k * 6;
      tickPos[o] = x;
      tickPos[o + 1] = y;
      tickPos[o + 2] = 0.281;
      tickPos[o + 3] = x;
      tickPos[o + 4] = y;
      tickPos[o + 5] = 0.281 - w;
    }
    tickGeo.attributes.position.needsUpdate = true;
    const yTop = y0 + span * LEN;
    pinT.position.set(0, yTop, 0);
    topPlate.position.set(0, yTop + 0.16, 0);
    const aLen = 0.35 + 0.75 * rp.p;
    loadArrow.position.set(0, yTop + 0.25 + aLen, 0);
    loadArrow.setLength(aLen, 0.26, 0.18);
    loadLabel.position.set(0.95, yTop + 0.6, 0);
    loadLabel.element.textContent = `P = ${rp.p.toFixed(2)} P_c`;
    const b = rp.bias;
    biasArrow.visible = biasLabel.visible = Math.abs(b) > 0.02;
    if (biasArrow.visible) {
      const len = 0.25 + 0.6 * Math.abs(b);
      const dir = Math.sign(b);
      biasArrow.setDirection(tmpV.set(dir, 0, 0));
      biasArrow.setLength(len, 0.18, 0.13);
      biasArrow.position.set(d - dir * (len + 0.08), y0 + 0.5 * span * LEN, 0);
      biasLabel.position.set(d - dir * (len * 0.5 + 0.08), y0 + 0.5 * span * LEN - 0.25, 0);
    }
    const ghostOn = rp.p > 1.005;
    ghosts.forEach((g) => (g.visible = ghostOn));
    ghostL.visible = ghostR.visible = ghostOn;
    if (ghostOn) {
      const a = slopeForLoad(rp.p);
      for (let side = 0; side < 2; side++) {
        const sg = elasticaShape(side === 0 ? -a : a);
        const arr = ghostPos[side];
        for (let i = 0; i < GH_N; i++) {
          const s = i / (GH_N - 1);
          arr[i * 3] = sg.deflection * LEN * Math.sin(Math.PI * s);
          arr[i * 3 + 1] = y0 + s * sg.span * LEN;
          arr[i * 3 + 2] = -0.3;
        }
        ghosts[side].geometry.attributes.position.needsUpdate = true;
        ghosts[side].computeLineDistances();
        const lab = side === 0 ? ghostL : ghostR;
        lab.position.set(sg.deflection * LEN * 1.15 + (side === 0 ? -0.3 : 0.3), y0 + 0.5 * sg.span * LEN, -0.3);
      }
    }
    const a = rs[0];
    stateLabel.element.textContent = Math.abs(a) < 0.1 ? (rp.p < 1 ? 'straight: stable' : 'straight: unstable') : `buckled ${a < 0 ? 'left' : 'right'}`;
  }

  function stepRulerFrame(dt: number): void {
    if (pRate > 0 && rp.p !== pTarget) {
      const dp = pRate * dt;
      rp.p = Math.abs(pTarget - rp.p) <= dp ? pTarget : rp.p + Math.sign(pTarget - rp.p) * dp;
      loadCtl.set(rp.p, false);
      if (rp.p === pTarget) pRate = 0;
    }
    const n = Math.min(60, Math.round(dt / H_RUL));
    for (let k = 0; k < n; k++) {
      stepRuler(rs, rp, H_RUL, rng);
      const a = Math.abs(rs[0]);
      if (a < 0.08) rulerArmed = true;
      if (rulerArmed && a > 0.25 && rp.p > 1) {
        rulerArmed = false;
        biasAtBuckle = rp.bias;
        if (rs[0] < 0) nLeft++;
        else nRight++;
        if (Math.abs(biasAtBuckle) >= 0.3 && Math.sign(rs[0]) !== Math.sign(biasAtBuckle)) unlikely = true;
      }
    }
    layoutRuler();
  }

  // =========================================================================
  // View 3: XY lattice quench
  const xy = new XYLattice(XL, 17);
  let xyT = T_HOT;
  let quenching = false;
  let quenchT0 = 0;
  let xyTime = 0;
  let rateLog = -1.5;
  const rate = () => Math.pow(10, rateLog);
  let xyUser = false;
  let xyStarted = false;
  let frozen = -1;
  let frozenRun = -1;
  let vPlus = 0;
  let vMinus = 0;
  let vNet = 0;
  const charges = new Int8Array(XL * XL);
  const kzPts: [number, number][] = [];
  const trV = new Float32Array(TRACE_N);
  const trT = new Float32Array(TRACE_N);
  let trLen = 0;
  let trTimer = 0;

  const plate = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 0.3, 0.1, WIDTH + 0.3), new THREE.MeshStandardMaterial({ color: 0x111726, roughness: 0.9 }));
  plate.position.y = -0.08;
  xyG.add(plate);
  const arrowShape = new THREE.Shape();
  {
    const l = CELL * 0.92;
    const w = CELL * 0.1;
    const hw = CELL * 0.26;
    const hl = CELL * 0.36;
    arrowShape.moveTo(-l / 2, -w);
    arrowShape.lineTo(l / 2 - hl, -w);
    arrowShape.lineTo(l / 2 - hl, -hw);
    arrowShape.lineTo(l / 2, 0);
    arrowShape.lineTo(l / 2 - hl, hw);
    arrowShape.lineTo(l / 2 - hl, w);
    arrowShape.lineTo(-l / 2, w);
    arrowShape.closePath();
  }
  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  arrowGeo.rotateX(-Math.PI / 2); // shape x → scene x, shape y → scene −z
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), XL * XL);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrows.setColorAt(0, new THREE.Color(0));
  arrows.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  arrows.frustumCulled = false;
  xyG.add(arrows);
  const aM = arrows.instanceMatrix.array as Float32Array;
  const aC = arrows.instanceColor!.array as Float32Array;
  const LUT_N = 256;
  const lut = new Float32Array(LUT_N * 3);
  for (let i = 0; i < LUT_N; i++) {
    tmpC.setHSL(i / LUT_N, 0.8, 0.5);
    lut[i * 3] = tmpC.r;
    lut[i * 3 + 1] = tmpC.g;
    lut[i * 3 + 2] = tmpC.b;
  }
  for (let y = 0; y < XL; y++) {
    for (let x = 0; x < XL; x++) {
      const b = (y * XL + x) * 16;
      aM.fill(0, b, b + 16);
      aM[b + 5] = 1;
      aM[b + 15] = 1;
      aM[b + 12] = (x + 0.5) * CELL - WIDTH / 2;
      aM[b + 13] = 0.01;
      aM[b + 14] = WIDTH / 2 - (y + 0.5) * CELL;
    }
  }
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(CELL * 0.36, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 0.5, emissive: 0x222222 }), XL * XL);
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.setColorAt(0, new THREE.Color(0));
  dots.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  dots.frustumCulled = false;
  dots.count = 0;
  xyG.add(dots);
  const dM = dots.instanceMatrix.array as Float32Array;
  const dC = dots.instanceColor!.array as Float32Array;
  const plusC = new THREE.Color(PALETTE.rose);
  const minusC = new THREE.Color(PALETTE.cyan);
  const xyLabel = stage.label('', [-1.4, 0, WIDTH / 2 + 0.45], 'big', xyG);

  function drawXY(): void {
    const th = xy.theta;
    for (let i = 0; i < XL * XL; i++) {
      const t = th[i];
      const c = Math.cos(t);
      const s = Math.sin(t);
      const b = i * 16;
      aM[b] = c;
      aM[b + 2] = -s;
      aM[b + 8] = s;
      aM[b + 10] = c;
      let u = Math.floor(((t + Math.PI) / (2 * Math.PI)) * LUT_N);
      if (u >= LUT_N) u = LUT_N - 1;
      if (u < 0) u = 0;
      aC[i * 3] = lut[u * 3];
      aC[i * 3 + 1] = lut[u * 3 + 1];
      aC[i * 3 + 2] = lut[u * 3 + 2];
    }
    arrows.instanceMatrix.needsUpdate = true;
    arrows.instanceColor!.needsUpdate = true;
    const vc = countVortices(th, XL, true, charges);
    vPlus = vc.plus;
    vMinus = vc.minus;
    vNet = vc.net;
    let n = 0;
    const cap = XL * XL;
    for (let y = 0; y < XL && n < cap; y++) {
      for (let x = 0; x < XL && n < cap; x++) {
        const q = charges[y * XL + x];
        if (q === 0) continue;
        const b = n * 16;
        dM.fill(0, b, b + 16);
        dM[b] = dM[b + 5] = dM[b + 10] = dM[b + 15] = 1;
        dM[b + 12] = (x + 1) * CELL - WIDTH / 2;
        dM[b + 13] = 0.1;
        dM[b + 14] = WIDTH / 2 - (y + 1) * CELL;
        const col = q > 0 ? plusC : minusC;
        dC[n * 3] = col.r;
        dC[n * 3 + 1] = col.g;
        dC[n * 3 + 2] = col.b;
        n++;
      }
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor!.needsUpdate = true;
  }

  function startQuench(user: boolean): void {
    xy.randomize();
    for (let i = 0; i < 20; i++) xy.step(T_HOT, XY_DT);
    quenching = true;
    xyStarted = true;
    quenchT0 = xyTime;
    xyT = T_HOT;
    frozenRun = -1;
    trLen = 0;
    if (user) xyUser = true;
  }

  function stepXYFrame(dt: number): void {
    const n = Math.max(1, Math.min(16, Math.round((dt * XY_RATE) / XY_DT)));
    for (let k = 0; k < n; k++) {
      xyTime += XY_DT;
      if (quenching) xyT = Math.max(T_COLD, T_HOT - rate() * (xyTime - quenchT0));
      xy.step(xyT, XY_DT);
    }
    drawXY();
    const tot = vPlus + vMinus;
    if (quenching && frozenRun < 0 && xyT <= T_FREEZE) {
      frozenRun = tot;
      if (xyUser) frozen = Math.max(frozen, tot);
      kzPts.push([rate(), Math.max(tot, 0.7)]);
      if (kzPts.length > 40) kzPts.shift();
    }
    trTimer += dt;
    if (trTimer > 0.08) {
      trTimer = 0;
      if (trLen < TRACE_N) {
        trV[trLen] = tot;
        trT[trLen] = xyT;
        trLen++;
      } else {
        trV.copyWithin(0, 1);
        trT.copyWithin(0, 1);
        trV[TRACE_N - 1] = tot;
        trT[TRACE_N - 1] = xyT;
      }
    }
    xyLabel.element.textContent = xyT > T_BKT ? `T = ${xyT.toFixed(2)} J: hot, no order` : quenching && xyT > T_COLD ? `T = ${xyT.toFixed(2)} J: cooling` : `T = ${xyT.toFixed(2)} J: cold, defects annihilating`;
  }

  // =========================================================================
  // Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    ...BOX, left: '10px', top: '10px', maxWidth: '240px', padding: '8px 10px',
    font: `11px/1.45 ${MONO}`, color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 520;
  inset.height = 320;
  Object.assign(inset.style, { ...BOX, right: '10px', bottom: '10px', width: '260px', height: '160px' } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const LEGENDS: Record<View, string> = {
    hat: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">The Mexican hat</div>
<div>Height is the energy V of a uniform field value φ. The floor directions are Re φ and Im φ.</div>
<div style="margin-top:3px"><span style="color:${css(PALETTE.amber)}">Ball</span>: the field's current value. <span style="color:${css(PALETTE.green)}">Green ring</span>: the vacuum, every point equally low.</div>
<div style="margin-top:3px;color:#8391ab">Hot: a bowl. Below T_c: a hat.</div>`,
    ruler: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">The buckling ruler</div>
<div>A column with pinned ends under a load <span style="color:${css(PALETTE.amber)}">P</span>. Both sides are equal, so the rules are symmetric.</div>
<div style="margin-top:3px">Past P_c = π²EI/L² it must bend. <span style="color:${css(PALETTE.cyan)}">Dashed</span>: the two possible outcomes. <span style="color:${css(PALETTE.violet)}">Bias</span>: a tiny side push.</div>`,
    xy: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">XY lattice quench</div>
<div>Each arrow is a phase angle that wants to match its neighbours. Colour shows direction.</div>
<div style="margin-top:3px"><span style="color:${css(PALETTE.rose)}">●</span> vortex (+1) and <span style="color:${css(PALETTE.cyan)}">●</span> antivortex (−1): the angle turns a full circle around them.</div>`,
  };

  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const Hh = inset.height;
    c.clearRect(0, 0, W, Hh);
    c.font = `22px ${MONO}`;
    c.lineCap = 'round';
    if (view === 'hat') {
      c.fillStyle = '#8391ab';
      c.fillText('slice along the ball: V(φ)', 16, 32);
      const xr = Math.max(1.2, rSurf) * 1.02;
      const r0 = phiMin(hp);
      const vLo = Math.min(-0.05, potentialT(hp, r0));
      const vHi = CAP;
      const x0 = 20;
      const x1 = W - 20;
      const yTop = 50;
      const yBot = Hh - 36;
      const X = (s: number) => x0 + ((s + xr) / (2 * xr)) * (x1 - x0);
      const Y = (v: number) => yBot - ((v - vLo) / (vHi - vLo)) * (yBot - yTop);
      c.strokeStyle = '#243049';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0, Y(0));
      c.lineTo(x1, Y(0));
      c.moveTo(X(0), yTop);
      c.lineTo(X(0), yBot);
      c.stroke();
      c.strokeStyle = css(PALETTE.violet);
      c.lineWidth = 3;
      c.beginPath();
      let first = true;
      for (let i = 0; i <= 160; i++) {
        const s = -xr + (2 * xr * i) / 160;
        const v = potentialT(hp, Math.abs(s));
        if (v > vHi) { first = true; continue; }
        if (first) c.moveTo(X(s), Y(v));
        else c.lineTo(X(s), Y(v));
        first = false;
      }
      c.stroke();
      if (r0 > 0) {
        c.fillStyle = css(PALETTE.green);
        for (const sg of [-1, 1]) {
          c.beginPath();
          c.arc(X(sg * r0), Y(potentialT(hp, r0)), 5, 0, Math.PI * 2);
          c.fill();
        }
      }
      // ball position projected on its own direction (always on the + side)
      const rho = Math.hypot(ball[0], ball[1]);
      c.fillStyle = css(PALETTE.amber);
      c.beginPath();
      c.arc(X(rho), Y(Math.min(vHi, potentialT(hp, rho))), 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#56627c';
      c.fillText('−|φ|', x0, Hh - 10);
      c.fillText('+|φ|', x1 - 56, Hh - 10);
      c.fillText(`T/T_c = ${(hp.T / Math.max(1e-6, criticalT(hp.mu2, hp.c))).toFixed(2)}`, W / 2 - 90, Hh - 10);
    } else if (view === 'ruler') {
      c.fillStyle = '#8391ab';
      c.fillText('pitchfork: end slope α vs load', 16, 32);
      const x0 = 50;
      const x1 = W - 20;
      const yTop = 48;
      const yBot = Hh - 36;
      const pMax = 1.6;
      const aMax = 1.9;
      const X = (p: number) => x0 + (p / pMax) * (x1 - x0);
      const Y = (a: number) => (yTop + yBot) / 2 - (a / aMax) * ((yBot - yTop) / 2);
      c.strokeStyle = '#243049';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(X(1), yTop);
      c.lineTo(X(1), yBot);
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText('P_c', X(1) - 18, Hh - 10);
      c.fillText('0', X(0) - 6, Hh - 10);
      c.fillText('R', 16, Y(1.2) + 8);
      c.fillText('L', 16, Y(-1.2) + 8);
      c.strokeStyle = css(PALETTE.cyan);
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(X(0), Y(0));
      c.lineTo(X(1), Y(0));
      c.stroke();
      c.setLineDash([8, 8]);
      c.beginPath();
      c.moveTo(X(1), Y(0));
      c.lineTo(X(pMax), Y(0));
      c.stroke();
      c.setLineDash([]);
      for (const sg of [-1, 1]) {
        c.beginPath();
        for (let i = 0; i < branchN; i++) {
          const px = X(branchP[i]);
          const py = Y(sg * branchA[i]);
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
      c.fillStyle = css(PALETTE.amber);
      c.beginPath();
      c.arc(X(Math.min(pMax, rp.p)), Y(Math.max(-aMax, Math.min(aMax, rs[0]))), 8, 0, Math.PI * 2);
      c.fill();
    } else {
      // left: vortex count vs time. right: frozen count vs quench rate (log-log)
      const mid = W * 0.56;
      c.fillStyle = '#8391ab';
      c.fillText('vortices N(t)', 16, 32);
      c.fillText('N at T=0.1 vs rate', mid + 12, 32);
      const yTop = 48;
      const yBot = Hh - 34;
      const lg = (n: number) => Math.log10(Math.max(0.7, n));
      const Yn = (n: number) => yBot - ((lg(n) - lg(0.7)) / (3 - lg(0.7))) * (yBot - yTop);
      c.strokeStyle = '#243049';
      c.lineWidth = 2;
      c.fillStyle = '#56627c';
      for (const n of [1, 10, 100, 1000]) {
        c.beginPath();
        c.moveTo(76, Yn(n));
        c.lineTo(mid - 10, Yn(n));
        c.moveTo(mid + 12, Yn(n));
        c.lineTo(W - 14, Yn(n));
        c.stroke();
        c.fillText(String(n), 14, Yn(n) + 8);
      }
      if (trLen > 1) {
        const x0 = 76;
        const dx = (mid - 24 - x0) / (TRACE_N - 1);
        c.strokeStyle = '#56627c';
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < trLen; i++) {
          const y = yBot - (trT[i] / T_HOT) * (yBot - yTop);
          if (i === 0) c.moveTo(x0 + i * dx, y);
          else c.lineTo(x0 + i * dx, y);
        }
        c.stroke();
        c.strokeStyle = css(PALETTE.rose);
        c.lineWidth = 3;
        c.beginPath();
        for (let i = 0; i < trLen; i++) {
          if (i === 0) c.moveTo(x0 + i * dx, Yn(trV[i]));
          else c.lineTo(x0 + i * dx, Yn(trV[i]));
        }
        c.stroke();
      }
      c.fillStyle = '#56627c';
      c.fillText('T', 80, yTop + 18);
      const rx0 = mid + 16;
      const rx1 = W - 18;
      const Xr = (r: number) => rx0 + ((Math.log10(r) + 2.5) / 3.5) * (rx1 - rx0);
      c.fillText('slow', rx0, Hh - 10);
      c.fillText('fast', rx1 - 50, Hh - 10);
      c.fillStyle = css(PALETTE.amber);
      for (const [r, n] of kzPts) {
        c.beginPath();
        c.arc(Xr(r), Yn(n), 6, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = '#dfe6f3';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(Xr(rate()), yTop);
      c.lineTo(Xr(rate()), yBot);
      c.stroke();
    }
  }
  const branchN = 60;
  const branchP = new Float32Array(branchN);
  const branchA = new Float32Array(branchN);
  for (let i = 0; i < branchN; i++) {
    const p = 1 + (0.6 * i) / (branchN - 1);
    branchP[i] = p;
    branchA[i] = slopeForLoad(p);
  }

  // =========================================================================
  // Controls
  const ui = new Panel(panel);
  const sections: Record<View, HTMLElement> = {} as Record<View, HTMLElement>;
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'hat', label: 'Mexican hat' }, { value: 'ruler', label: 'Ruler' }, { value: 'xy', label: 'XY quench' }],
    onChange: (v) => setView(v, true),
  });

  ui.section('Mexican hat');
  sections.hat = ui.root.lastElementChild as HTMLElement;
  ui.slider({ key: 'T', label: 'Temperature T', min: 0, max: 2, step: 0.01, value: hp.T, onInput: (v) => {
    const Tc = criticalT(hp.mu2, hp.c);
    if (hp.T >= Tc && v < Tc) cooledThrough = true;
    hp.T = v;
    hatTouched = true;
    rebuildSurface();
  } });
  ui.slider({ key: 'mu2', label: 'μ²', min: 0.3, max: 2, step: 0.01, value: hp.mu2, onInput: (v) => { hp.mu2 = v; hatTouched = true; rebuildSurface(); } });
  ui.slider({ key: 'lambda', label: 'λ', min: 0.25, max: 1.5, step: 0.01, value: hp.lambda, onInput: (v) => { hp.lambda = v; hatTouched = true; rebuildSurface(); } });
  ui.buttons([
    { label: 'Goldstone kick', primary: true, key: 'goldstone', onClick: () => kick(false) },
    { label: 'Radial kick', key: 'radial', onClick: () => kick(true) },
    { label: 'Drop on peak', onClick: () => { hatTouched = true; dropOnPeak(); } },
  ]);
  const rTc = ui.readout('Tc', 'T_c');
  const rPhi = ui.readout('phi', 'ball |φ|');
  const rV = ui.readout('V', 'V at ball');
  const rVev = ui.readout('v', 'vev v');
  const rMH = ui.readout('mH', 'm_H radial');
  const rMG = ui.readout('mG', 'm_G along rim');
  const rOm = ui.readout('omega', 'bounce ω measured');
  const rSw = ui.readout('swept', 'rim angle swept');
  ui.legend([
    { color: css(PALETTE.green), label: 'vacuum ring' },
    { color: css(PALETTE.rose), label: 'radial (massive)' },
    { color: css(PALETTE.amber), label: 'field value' },
  ]);

  ui.section('Buckling ruler');
  sections.ruler = ui.root.lastElementChild as HTMLElement;
  const loadCtl = ui.slider({ key: 'load', label: 'Load P / P_c', min: 0, max: 1.6, step: 0.01, value: rp.p, onInput: (v) => { rp.p = v; pTarget = v; pRate = 0; } });
  ui.slider({ key: 'bias', label: 'Bias (side push)', min: -1, max: 1, step: 0.01, value: rp.bias, format: (v) => (v === 0 ? '0' : `${v > 0 ? 'right' : 'left'} ${Math.abs(v).toFixed(2)}`), onInput: (v) => { rp.bias = v; } });
  ui.buttons([
    { label: 'Release', onClick: () => { pTarget = 0.3; pRate = 3; } },
    { label: 'Slam load', primary: true, onClick: () => { pTarget = 1.2; pRate = 8; } },
    { label: 'Load slowly', onClick: () => { pTarget = 1.2; pRate = 0.05; } },
  ]);
  const rP = ui.readout('load', 'P / P_c');
  const rA = ui.readout('alpha', 'end slope α');
  const rLR = ui.readout('tally', 'left / right');
  const rBB = ui.readout('biasBuckle', 'bias at last buckle');

  ui.section('XY quench');
  sections.xy = ui.root.lastElementChild as HTMLElement;
  ui.slider({ key: 'rate', label: 'Quench rate dT/dt', min: -2.5, max: 1, step: 0.05, value: rateLog, format: (v) => `${Math.pow(10, v) < 0.1 ? Math.pow(10, v).toFixed(3) : Math.pow(10, v).toFixed(2)} J/τ`, onInput: (v) => { rateLog = v; } });
  ui.buttons([
    { label: 'Quench', primary: true, key: 'rate', onClick: () => startQuench(true) },
    { label: 'Heat', onClick: () => { quenching = false; xyT = T_HOT; } },
  ]);
  const rXT = ui.readout('xyT', 'T (J)');
  const rVX = ui.readout('vortices', 'vortices + / −');
  const rNet = ui.readout('net', 'net winding');
  const rFr = ui.readout('frozen', 'N when T hit 0.1');
  ui.note(`BKT temperature of this lattice: $T \\approx ${T_BKT}\\,J$. Net winding on a torus is always 0, a built-in check.`);

  function setView(v: View, fly: boolean): void {
    view = v;
    hatG.visible = v === 'hat';
    rulerG.visible = v === 'ruler';
    xyG.visible = v === 'xy';
    (Object.keys(sections) as View[]).forEach((k) => (sections[k].style.display = k === v ? '' : 'none'));
    legend.innerHTML = LEGENDS[v];
    if (fly) stage.flyTo(CAM[v].pos, CAM[v].target);
    if (v === 'xy' && !xyStarted) startQuench(false);
    viewCtl.set(v, false);
    drawInset();
  }

  function updateReadouts(): void {
    const Tc = criticalT(hp.mu2, hp.c);
    const rho = Math.hypot(ball[0], ball[1]);
    const mm = modeMasses(hp);
    rTc(Tc.toFixed(3));
    rPhi(rho.toFixed(3));
    rV(potentialT(hp, rho).toFixed(3));
    rVev(vev(hp).toFixed(3));
    rMH(mm.radial.toFixed(3));
    rMG(phiMin(hp) > 0 ? `${Math.abs(curvatures(hp, ball[0] || 1e-3, ball[1]).angular) < 1e-6 ? '0' : mm.goldstone.toFixed(3)}` : `${mm.goldstone.toFixed(3)} (= radial)`);
    if (phiMin(hp) > 0 && Number.isFinite(omegaMeas)) {
      const err = ((omegaMeas - mm.radial) / mm.radial) * 100;
      rOm(`${omegaMeas.toFixed(3)} (${err >= 0 ? '+' : ''}${err.toFixed(1)}%)`);
    } else rOm(phiMin(hp) > 0 ? 'press Radial kick' : 'no ring');
    rSw(gActive || goldstoneOK ? `${Math.abs((gSwept * 180) / Math.PI).toFixed(0)}°, dev ${(gMaxDev * 100).toFixed(0)}%` : '…');
    rP(rp.p.toFixed(2));
    rA(`${((rs[0] * 180) / Math.PI).toFixed(1)}°`);
    rLR(`${nLeft} / ${nRight}`);
    rBB(nLeft + nRight > 0 ? biasAtBuckle.toFixed(2) : '…');
    rXT(xyT.toFixed(2));
    rVX(`${vPlus} / ${vMinus}`);
    rNet(String(vNet));
    rFr(frozenRun >= 0 ? String(frozenRun) : '…');
  }

  // =========================================================================
  // Frame loop
  let insetTimer = 0;
  stage.onFrame((dt) => {
    if (view === 'hat') stepHatFrame(dt);
    else if (view === 'ruler') stepRulerFrame(dt);
    else stepXYFrame(dt);
    insetTimer += dt;
    if (insetTimer > 0.1) {
      insetTimer = 0;
      drawInset();
      updateReadouts();
    }
  });

  rebuildSurface();
  dropOnPeak();
  ball[0] *= 60;
  ball[1] *= 60;
  placeBall();
  layoutRuler();
  drawXY();
  setView('hat', false);
  updateReadouts();

  return {
    state: () => {
      const Tc = criticalT(hp.mu2, hp.c);
      const r0 = phiMin(hp);
      return {
        view,
        T: hp.T,
        Tc,
        mu2: hp.mu2,
        lambda: hp.lambda,
        mu2eff: mu2Eff(hp),
        phi: Math.hypot(ball[0], ball[1]),
        v: vev(hp),
        mH: modeMasses(hp).radial,
        onRim: r0 > 0 && settledFor > 0.5,
        cooledThrough,
        hatTouched,
        goldstoneOK,
        sweptDeg: Math.abs((gSwept * 180) / Math.PI),
        omega: Number.isFinite(omegaMeas) ? omegaMeas : 0,
        load: rp.p,
        bias: rp.bias,
        alpha: rs[0],
        biasAtBuckle,
        buckles: nLeft + nRight,
        unlikely,
        xyT,
        vortices: vPlus + vMinus,
        net: vNet,
        rate: rate(),
        xyUser,
        frozenVortices: frozen,
      };
    },
    dispose: () => {
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'symmetry-breaking',
  number: 92,
  title: 'Spontaneous Symmetry Breaking',
  domain: 'foundations',
  level: 2,
  status: 'live',
  tagline: 'Symmetric rules, lopsided outcomes, from magnets to the Higgs.',
  content,
  mount,
};

export default topic;
