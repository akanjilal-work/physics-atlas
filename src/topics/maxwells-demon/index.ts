import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  createGas,
  entropyDeficit,
  h2,
  H_STEP,
  halfStats,
  initGas,
  kinetic,
  ksSortedMB,
  LX,
  LY,
  LZ,
  mbPdf,
  mixingEntropy,
  mulberry32,
  RAD,
  reverseVelocities,
  stepGas,
  temperatureOf,
  type DemonMode,
  type HalfStats,
} from './physics.ts';

type Exp = 'demon' | 'mix';

const S = 2.3; // world units per simulation length unit
const MAXN = 800;
const HB = 16; // histogram bins
const MAX_STEPS = 8; // outer steps per frame
const NOISE_ZERO = -13; // slider notch that means exactly zero noise
const SPARK_N = 400;
const NOISE_FLOOR = 3; // k_B: 95% of equilibrium fluctuations lie below this (Einstein, P = e^-s)

const SLOW = 0x3f6ff0;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Speed colour ramp: slow blue, cyan, white, amber, fast red. */
function speedLUT(n: number): Float32Array {
  const stops: [number, number][] = [[0, SLOW], [0.3, PALETTE.cyan], [0.5, 0xe8eef8], [0.72, PALETTE.amber], [1, PALETTE.red]];
  const out = new Float32Array(n * 3);
  const a = new THREE.Color();
  const b = new THREE.Color();
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    let s = 0;
    while (s < stops.length - 2 && u > stops[s + 1][0]) s++;
    const f = (u - stops[s][0]) / (stops[s + 1][0] - stops[s][0]);
    c.lerpColors(a.setHex(stops[s][1]), b.setHex(stops[s + 1][1]), Math.min(1, Math.max(0, f)));
    out[k * 3] = c.r;
    out[k * 3 + 1] = c.g;
    out[k * 3 + 2] = c.b;
  }
  return out;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [2.5, 1.9, 6.5];
  const TARGET: [number, number, number] = [0.15, 0.1, 0];
  const stage = createStage(viewport, { camera: CAM, target: TARGET, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let exp: Exp = 'demon';
  let demon: DemonMode = 'sorter';
  let nPart = 400;
  let T0 = 1;
  let doorSide = 0.3;
  let equalStart = true;
  let noiseExp = NOISE_ZERO;
  let speed = 1;
  let playing = true;
  let touched = false;
  let seed = 1;

  // --- Scene furniture
  const bx = LX * S, by = LY * S, bz = LZ * S;
  const grid = makeGrid(14, 28);
  grid.position.y = -by - 0.02;
  scene.add(grid);
  const boxGeo = new THREE.BoxGeometry(2 * bx, 2 * by, 2 * bz);
  const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0x5f7299, transparent: true, opacity: 0.9 }));
  scene.add(boxEdges);
  const boxShell = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x1b2744, transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false }));
  scene.add(boxShell);

  // Partition wall with a square hole, in the x = 0 plane.
  const partGroup = new THREE.Group();
  scene.add(partGroup);
  const wallMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
  const wall = new THREE.Mesh(new THREE.BufferGeometry(), wallMat);
  wall.rotation.y = Math.PI / 2;
  partGroup.add(wall);
  const wallEdge = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.55 }));
  wallEdge.rotation.y = Math.PI / 2;
  partGroup.add(wallEdge);
  const frame = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  frame.rotation.y = Math.PI / 2;
  partGroup.add(frame);
  const doorGeo = new THREE.PlaneGeometry(1, 1);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x8a78d8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const doorPanel = new THREE.Mesh(doorGeo, doorMat);
  doorPanel.rotation.y = Math.PI / 2;
  partGroup.add(doorPanel);
  const flashMat = new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const flashPanel = new THREE.Mesh(doorGeo, flashMat);
  flashPanel.rotation.y = Math.PI / 2;
  partGroup.add(flashPanel);

  function buildWall(): void {
    const a = (doorSide / 2) * S;
    const shape = new THREE.Shape();
    shape.moveTo(-bz, -by);
    shape.lineTo(bz, -by);
    shape.lineTo(bz, by);
    shape.lineTo(-bz, by);
    shape.lineTo(-bz, -by);
    const hole = new THREE.Path();
    hole.moveTo(-a, -a);
    hole.lineTo(-a, a);
    hole.lineTo(a, a);
    hole.lineTo(a, -a);
    hole.lineTo(-a, -a);
    shape.holes.push(hole);
    wall.geometry.dispose();
    wall.geometry = new THREE.ShapeGeometry(shape);
    wallEdge.geometry.dispose();
    wallEdge.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      -bz, -by, 0, bz, -by, 0, bz, -by, 0, bz, by, 0, bz, by, 0, -bz, by, 0, -bz, by, 0, -bz, -by, 0,
    ], 3));
    frame.geometry.dispose();
    frame.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-a, -a, 0, a, -a, 0, a, a, 0, -a, a, 0], 3));
    doorPanel.scale.set(2 * a, 2 * a, 1);
    flashPanel.scale.set(2 * a, 2 * a, 1);
    gas.door = doorSide / 2;
  }

  // Particles
  const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
  const partMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 });
  const balls = new THREE.InstancedMesh(sphereGeo, partMat, MAXN);
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  balls.frustumCulled = false;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAXN; i++) balls.setColorAt(i, white);
  balls.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  scene.add(balls);
  const mArr = balls.instanceMatrix.array as Float32Array;
  const cArr = balls.instanceColor!.array as Float32Array;
  for (let i = 0; i < MAXN; i++) {
    const b = i * 16;
    mArr.fill(0, b, b + 16);
    mArr[b] = mArr[b + 5] = mArr[b + 10] = RAD * S;
    mArr[b + 15] = 1;
  }
  const LUT_N = 64;
  const lut = speedLUT(LUT_N);
  const speciesA = new THREE.Color(PALETTE.amber);
  const speciesB = new THREE.Color(PALETTE.cyan);

  // The demon: an abstract glowing eye above the door.
  const glowTex = glowTexture();
  const eye = new THREE.Group();
  eye.position.set(0, by + 0.7, 0);
  scene.add(eye);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.violet, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(1.25);
  eye.add(glow);
  const look = new THREE.Group();
  eye.add(look);
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 20), new THREE.MeshStandardMaterial({ color: 0xe9edf7, emissive: 0x2a3148, roughness: 0.3 }));
  look.add(sclera);
  const irisMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet });
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.233, 32, 12, 0, Math.PI * 2, 0, 0.62), irisMat);
  iris.rotation.x = Math.PI / 2;
  look.add(iris);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.236, 24, 8, 0, Math.PI * 2, 0, 0.27), new THREE.MeshBasicMaterial({ color: 0x05060a }));
  pupil.rotation.x = Math.PI / 2;
  look.add(pupil);
  stage.label('demon', [0, 0.42, 0], 'muted', eye);

  const labL = stage.label('', [-bx / 2, -by - 0.22, bz]);
  const labR = stage.label('', [bx / 2, -by - 0.22, bz]);
  labL.element.style.color = css(PALETTE.cyan);
  labR.element.style.color = css(PALETTE.amber);

  // --- Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const RAMP = `<div style="height:6px;border-radius:3px;margin:4px 0 2px;background:linear-gradient(90deg,${css(SLOW)},${css(PALETTE.cyan)},#e8eef8,${css(PALETTE.amber)},${css(PALETTE.red)})"></div><div style="display:flex;justify-content:space-between"><span>slow</span><span>fast</span></div>`;
  const LEGEND_DEMON = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:2px">Particles coloured by speed</div>${RAMP}
<div style="margin-top:4px"><span style="color:${css(PALETTE.green)}">Green flash</span>: the demon opens the door.</div>
<div><span style="color:${css(PALETTE.violet)}">Eye</span>: the demon, which records one bit per decision.</div>`;
  const LEGEND_MIX = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:2px">Two gases, no wall</div>
<div><span style="color:${css(PALETTE.amber)}">Amber</span> started on the left, <span style="color:${css(PALETTE.cyan)}">cyan</span> on the right.</div>
<div style="margin-top:3px">Press Reverse velocities to run the film backwards.</div>`;

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const ledger = document.createElement('div');
  ledger.className = 'stage-overlay';
  Object.assign(ledger.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none', width: '240px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9', boxSizing: 'border-box',
  } as CSSStyleDeclaration);
  viewport.appendChild(ledger);

  // --- Simulation state
  const gas = createGas(MAXN);
  const rng = mulberry32(12345);
  const hs: HalfStats = { nL: 0, eL: 0, nR: 0, eR: 0 };
  const speeds = new Float64Array(MAXN);
  const histL = new Float64Array(HB);
  const histR = new Float64Array(HB);
  const rawL = new Float64Array(HB);
  const rawR = new Float64Array(HB);
  const mixWork = new Int32Array(64);
  const segStart = new Float64Array(3 * MAXN);
  const target = new Float64Array(3 * MAXN);
  const sparkT = new Float64Array(SPARK_N);
  const sparkM = new Float64Array(SPARK_N);
  let sparkCount = 0;
  let nextSpark = 0;

  let acc = 0;
  let e0 = 1;
  let Teq = 1;
  let TL = 1, TR = 1, dT = 0;
  let sgas = 0;
  let mix = 0;
  let ks = 0;
  let histFresh = true;
  // Ledger: bits held in memory and bits already erased.
  let memBits = 0, memOpens = 0;
  let erasedBits = 0, erasedInfo = 0;
  let lastDecisions = 0, lastOpens = 0;
  // Reversal bookkeeping
  let stepsInSeg = 0;
  let revSteps = -1;
  let reversed = false;
  let revNoise = -1;
  let revDur = 0;
  let revAt = 0;
  let tSinceRev = 0;
  let mixAtRev = 0;
  let minMixAfter = 1;
  let retErr = NaN;
  // Visual state
  let flash = 0;
  let pulse = 0;
  let pulseOpen = true;
  let lastSeq = 0;
  const lookAt = new THREE.Vector3(0, -1.5, 2.4);
  const lookGoal = new THREE.Vector3(0, -1.5, 2.4);
  const glowCol = new THREE.Color();
  const cViolet = new THREE.Color(PALETTE.violet);
  const cGreen = new THREE.Color(PALETTE.green);
  const cRose = new THREE.Color(PALETTE.rose);
  const cSleep = new THREE.Color(0x56627c);

  function snapshot(into: Float64Array): void {
    for (let i = 0; i < gas.n; i++) {
      into[3 * i] = gas.x[i];
      into[3 * i + 1] = gas.y[i];
      into[3 * i + 2] = gas.z[i];
    }
  }

  function reset(): void {
    seed++;
    initGas(gas, { n: nPart, T: T0, seed, layout: exp === 'mix' ? 'species' : 'halves', speeds: exp === 'demon' && equalStart ? 'equal' : 'maxwell' });
    gas.partition = exp === 'demon';
    gas.demon = demon;
    gas.door = doorSide / 2;
    e0 = kinetic(gas);
    Teq = temperatureOf(e0, gas.n);
    acc = 0;
    memBits = memOpens = erasedBits = erasedInfo = 0;
    lastDecisions = lastOpens = 0;
    lastSeq = 0;
    stepsInSeg = 0;
    revSteps = -1;
    reversed = false;
    revNoise = -1;
    revDur = 0;
    tSinceRev = 0;
    mixAtRev = 0;
    minMixAfter = 1;
    retErr = NaN;
    snapshot(segStart);
    sparkCount = 0;
    nextSpark = 0;
    histFresh = true;
    balls.count = gas.n;
    partGroup.visible = exp === 'demon';
    eye.visible = exp === 'demon';
    labL.visible = labR.visible = exp === 'demon';
    legend.innerHTML = exp === 'demon' ? LEGEND_DEMON : LEGEND_MIX;
    mix = exp === 'mix' ? mixingEntropy(gas, 4, 2, 2, mixWork) / (gas.n * Math.LN2) : 0;
    measure();
    place();
    drawInset();
    updateReadouts();
  }

  function reverse(): void {
    const noise = noiseExp <= NOISE_ZERO ? 0 : 10 ** noiseExp;
    target.set(segStart.subarray(0, 3 * gas.n));
    revSteps = stepsInSeg;
    revDur = stepsInSeg * H_STEP;
    reverseVelocities(gas, noise, rng);
    snapshot(segStart);
    stepsInSeg = 0;
    reversed = true;
    revNoise = noise;
    revAt = gas.t;
    tSinceRev = 0;
    mixAtRev = mix;
    minMixAfter = mix;
    retErr = NaN;
  }

  function erase(): void {
    erasedBits += memBits;
    erasedInfo += memBits * h2(memBits > 0 ? memOpens / memBits : 0);
    memBits = 0;
    memOpens = 0;
  }

  function simStep(): void {
    stepGas(gas, H_STEP);
    stepsInSeg++;
    if (gas.decisions !== lastDecisions) {
      memBits += gas.decisions - lastDecisions;
      memOpens += gas.opens - lastOpens;
      lastDecisions = gas.decisions;
      lastOpens = gas.opens;
    }
    if (exp === 'mix') {
      mix = mixingEntropy(gas, 4, 2, 2, mixWork) / (gas.n * Math.LN2);
      if (gas.t >= nextSpark) {
        const k = sparkCount < SPARK_N ? sparkCount++ : (sparkT.copyWithin(0, 1), sparkM.copyWithin(0, 1), SPARK_N - 1);
        sparkT[k] = gas.t;
        sparkM[k] = mix;
        nextSpark = gas.t + 0.05;
      }
    }
    if (reversed) {
      tSinceRev += H_STEP;
      if (mix < minMixAfter) minMixAfter = mix;
      if (stepsInSeg === revSteps) {
        let e = 0;
        for (let i = 0; i < gas.n; i++) {
          const d = Math.max(Math.abs(gas.x[i] - target[3 * i]), Math.abs(gas.y[i] - target[3 * i + 1]), Math.abs(gas.z[i] - target[3 * i + 2]));
          if (d > e) e = d;
        }
        retErr = e;
      }
    }
  }

  /** Bits and Shannon information currently accounted for. */
  const memInfo = () => memBits * h2(memBits > 0 ? memOpens / memBits : 0);

  function measure(): void {
    halfStats(gas, hs);
    TL = temperatureOf(hs.eL, hs.nL);
    TR = temperatureOf(hs.eR, hs.nR);
    dT = Math.abs(TR - TL) / Math.max(1e-9, 0.5 * (TL + TR));
    sgas = Math.max(0, entropyDeficit(hs.nL, hs.eL, hs.nR, hs.eR));
    // Speed histograms, per half, normalised as densities.
    const vmax = 3.6 * Math.sqrt(Teq);
    const dv = vmax / HB;
    rawL.fill(0);
    rawR.fill(0);
    for (let i = 0; i < gas.n; i++) {
      const v = Math.sqrt(gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i]);
      speeds[i] = v;
      const b = Math.floor(v / dv);
      if (b < HB) {
        if (exp === 'mix' || gas.x[i] < 0) rawL[b]++;
        else rawR[b]++;
      }
    }
    const nl = exp === 'mix' ? gas.n : hs.nL;
    const nr = hs.nR;
    const a = histFresh ? 1 : 0.3;
    for (let b = 0; b < HB; b++) {
      histL[b] += a * (rawL[b] / Math.max(1, nl * dv) - histL[b]);
      histR[b] += a * (rawR[b] / Math.max(1, nr * dv) - histR[b]);
    }
    histFresh = false;
    const sorted = speeds.subarray(0, gas.n).sort();
    ks = ksSortedMB(sorted, gas.n, Teq);
  }

  function place(): void {
    const n = gas.n;
    const speedScale = (LUT_N - 1) / (2 * Math.sqrt(3 * Teq));
    for (let i = 0; i < n; i++) {
      const b = i * 16;
      mArr[b + 12] = gas.x[i] * S;
      mArr[b + 13] = gas.y[i] * S;
      mArr[b + 14] = gas.z[i] * S;
      if (exp === 'mix') {
        const c = gas.tag[i] ? speciesB : speciesA;
        cArr[3 * i] = c.r;
        cArr[3 * i + 1] = c.g;
        cArr[3 * i + 2] = c.b;
      } else {
        const v = Math.sqrt(gas.vx[i] * gas.vx[i] + gas.vy[i] * gas.vy[i] + gas.vz[i] * gas.vz[i]);
        const k = 3 * Math.min(LUT_N - 1, Math.round(v * speedScale));
        cArr[3 * i] = lut[k];
        cArr[3 * i + 1] = lut[k + 1];
        cArr[3 * i + 2] = lut[k + 2];
      }
    }
    balls.instanceMatrix.needsUpdate = true;
    balls.instanceColor!.needsUpdate = true;
  }

  // --- Inset drawing
  function drawHist(h: Float64Array, T: number, x0: number, y0: number, w: number, hgt: number, col: string, title: string): void {
    const vmax = 3.6 * Math.sqrt(Teq);
    const dv = vmax / HB;
    const pmax = 1.35 * mbPdf(Math.sqrt(2 * Teq * 0.8), Teq * 0.8);
    const bw = w / HB;
    ictx.fillStyle = col;
    ictx.globalAlpha = 0.75;
    for (let b = 0; b < HB; b++) {
      const bh = Math.min(1, h[b] / pmax) * hgt;
      ictx.fillRect(x0 + b * bw + 1, y0 + hgt - bh, bw - 2, bh);
    }
    ictx.globalAlpha = 1;
    ictx.strokeStyle = '#e8eef8';
    ictx.lineWidth = 2.5;
    ictx.beginPath();
    for (let k = 0; k <= 60; k++) {
      const v = (k / 60) * vmax;
      const y = y0 + hgt - Math.min(1.05, mbPdf(v, Math.max(1e-6, T)) / pmax) * hgt;
      if (k === 0) ictx.moveTo(x0, y);
      else ictx.lineTo(x0 + (v / dv) * bw, y);
    }
    ictx.stroke();
    ictx.strokeStyle = '#2c3852';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.moveTo(x0, y0 + hgt + 1);
    ictx.lineTo(x0 + w, y0 + hgt + 1);
    ictx.stroke();
    ictx.fillStyle = '#8391ab';
    ictx.font = '19px JetBrains Mono, monospace';
    ictx.fillText(title, x0, y0 + hgt + 24);
  }

  function drawInset(): void {
    const W = inset.width;
    const Hh = inset.height;
    ictx.clearRect(0, 0, W, Hh);
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    if (exp === 'demon') {
      ictx.fillText('speeds vs MB curve (white)', 14, 28);
      drawHist(histL, TL, 14, 48, 170, 190, css(PALETTE.cyan), 'left half');
      drawHist(histR, TR, 200, 48, 170, 190, css(PALETTE.amber), 'right half');
      // Temperature bars
      const top = 48, hgt = 190, base = top + hgt; // same frame as the histograms
      const tmax = 2 * Teq;
      const bars: [number, number, string, string][] = [[392, TL, css(PALETTE.cyan), 'L'], [436, TR, css(PALETTE.amber), 'R']];
      ictx.strokeStyle = '#8391ab';
      ictx.lineWidth = 2;
      const yEq = base - (Teq / tmax) * hgt;
      ictx.setLineDash([6, 5]);
      ictx.beginPath();
      ictx.moveTo(386, yEq);
      ictx.lineTo(472, yEq);
      ictx.stroke();
      ictx.setLineDash([]);
      for (const [x, T, col, lab] of bars) {
        const bh = Math.min(1, T / tmax) * hgt;
        ictx.fillStyle = '#1a2236';
        ictx.fillRect(x, top, 30, hgt);
        ictx.fillStyle = col;
        ictx.fillRect(x, base - bh, 30, bh);
        ictx.fillStyle = '#8391ab';
        ictx.font = '19px JetBrains Mono, monospace';
        ictx.fillText(`T${lab}`, x + 2, base + 24);
      }
      ictx.fillStyle = '#56627c';
      ictx.font = '17px JetBrains Mono, monospace';
      ictx.fillText('dashed line: starting T', 232, 290);
      return;
    }
    // Mixing: entropy sparkline
    ictx.fillText('mixing entropy  S / (N k ln 2)', 14, 28);
    const x0 = 14, x1 = W - 60, y0 = 50, y1 = Hh - 40;
    const yOf = (m: number) => y1 - Math.max(0, Math.min(1.05, m)) * (y1 - y0);
    ictx.lineWidth = 1;
    for (const m of [0, 0.5, 1]) {
      ictx.strokeStyle = m === 1 ? '#3a4a6a' : '#243049';
      ictx.beginPath();
      ictx.moveTo(x0, yOf(m));
      ictx.lineTo(x1, yOf(m));
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(m.toFixed(1), x1 + 8, yOf(m) + 7);
    }
    if (sparkCount < 2) return;
    const tA = sparkT[0];
    const span = Math.max(4, sparkT[sparkCount - 1] - tA);
    const xOf = (t: number) => x0 + ((t - tA) / span) * (x1 - x0);
    if (reversed && revAt >= tA) {
      ictx.strokeStyle = css(PALETTE.rose);
      ictx.lineWidth = 2.5;
      ictx.setLineDash([8, 6]);
      ictx.beginPath();
      ictx.moveTo(xOf(revAt), y0);
      ictx.lineTo(xOf(revAt), y1);
      ictx.stroke();
      ictx.setLineDash([]);
      ictx.fillStyle = css(PALETTE.rose);
      ictx.fillText('reversed', Math.min(xOf(revAt) + 6, x1 - 96), y1 + 26);
    }
    ictx.strokeStyle = css(PALETTE.green);
    ictx.lineWidth = 3;
    ictx.beginPath();
    for (let k = 0; k < sparkCount; k++) {
      const x = xOf(sparkT[k]);
      const y = yOf(sparkM[k]);
      if (k === 0) ictx.moveTo(x, y);
      else ictx.lineTo(x, y);
    }
    ictx.stroke();
    ictx.fillStyle = '#56627c';
    ictx.fillText('time →', x0, y1 + 26);
  }

  // --- Ledger overlay
  const fmt1 = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));
  let ledgerHtml = '';
  function drawLedger(): void {
    let html: string;
    const row = (k: string, v: string, note = '') =>
      `<div style="display:flex;justify-content:space-between;gap:8px"><span>${k}</span><span style="color:#dfe6f3">${v}${note ? ` <span style="color:#56627c">${note}</span>` : ''}</span></div>`;
    if (exp === 'demon') {
      const info = memInfo() + erasedInfo;
      const bound = Math.LN2 * info;
      let verdict: string;
      if (sgas <= NOISE_FLOOR) verdict = `<span style="color:#8391ab">drop within equilibrium noise</span>`;
      else if (sgas <= bound) verdict = `<span style="color:${css(PALETTE.green)}">✓ drop ≤ k ln2 × info (×${fmt1(bound / sgas)} margin)</span>`;
      else verdict = `<span style="color:${css(PALETTE.red)}">drop exceeds k ln2 × info</span>`;
      html = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Demon’s ledger <span style="color:#56627c;font-weight:400">(units of k_B)</span></div>
${row('bits in memory', String(memBits))}
${row('bits erased', String(erasedBits))}
${row('information', `${fmt1(info)} bits`)}
${row('gas entropy drop', fmt1(sgas), '(noise ≈ 1)')}
${row('k ln2 × info', fmt1(bound))}
${row('paid at erasure', fmt1(Math.LN2 * erasedInfo))}
<div style="margin-top:3px">${verdict}</div>`;
    } else {
      html = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Loschmidt’s test</div>
${row('mixed', `${(mix * 100).toFixed(0)}%`)}
${row('reversed at', reversed ? `${(mixAtRev * 100).toFixed(0)}% mixed` : '–')}
${row('noise used', !reversed ? '–' : revNoise === 0 ? '0 (exact)' : revNoise.toExponential(0))}
${row('least mixed since', reversed ? `${(minMixAfter * 100).toFixed(0)}%` : '–')}
${row('return error', Number.isFinite(retErr) ? `${retErr < 1e-3 ? retErr.toExponential(0) : retErr.toFixed(2)}` : '–')}`;
    }
    if (html !== ledgerHtml) {
      ledger.innerHTML = html;
      ledgerHtml = html;
    }
  }

  // --- Frame loop
  let uiTimer = 0;
  stage.onFrame((dt, time) => {
    if (playing) {
      acc += dt * speed * (exp === 'mix' ? 0.5 : 1);
      let steps = 0;
      while (acc >= H_STEP && steps < MAX_STEPS) {
        simStep();
        acc -= H_STEP;
        steps++;
      }
      if (steps === MAX_STEPS) acc = 0;
      if (steps > 0) place();
    }
    // Door flash and the eye
    if (gas.doorSeq !== lastSeq) {
      lastSeq = gas.doorSeq;
      pulse = 1;
      pulseOpen = gas.lastOpen;
      if (gas.lastOpen) flash = 1;
      lookGoal.set(0, gas.lastY * S - eye.position.y, gas.lastZ * S + 2.4);
    }
    flash *= Math.exp(-dt * 7);
    pulse *= Math.exp(-dt * 5);
    const awake = demon !== 'off';
    doorPanel.visible = awake;
    flashPanel.visible = awake;
    doorMat.opacity = 0.42 * (1 - flash);
    flashMat.opacity = 0.95 * flash;
    if (!awake) lookGoal.set(Math.sin(time * 0.4) * 0.8, -2.5, 1.5);
    lookAt.lerp(lookGoal, Math.min(1, dt * 8));
    look.lookAt(lookAt.x + eye.position.x, lookAt.y + eye.position.y, lookAt.z + eye.position.z);
    glowCol.copy(awake ? cViolet : cSleep).lerp(pulseOpen ? cGreen : cRose, awake ? pulse * 0.8 : 0);
    glowMat.color.copy(glowCol);
    glowMat.opacity = awake ? 0.75 + 0.25 * pulse : 0.3;
    glow.scale.setScalar(awake ? 1.2 + 0.25 * pulse : 0.9);
    irisMat.color.copy(awake ? cViolet : cSleep);

    uiTimer += dt;
    if (uiTimer > 0.2) {
      uiTimer = 0;
      measure();
      drawInset();
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  const touch = () => { touched = true; };
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => { touch(); reset(); } },
    { label: 'Reverse velocities', key: 'reverse', onClick: () => { touch(); reverse(); drawLedger(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.25, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { speed = v; touch(); } });
  const demonRows: HTMLElement[] = [];
  ui.select<Exp>({
    key: 'exp', label: 'Experiment', value: exp,
    options: [{ value: 'demon', label: 'Demon and trapdoor' }, { value: 'mix', label: 'Mixing and reversal' }],
    onChange: (v) => {
      exp = v;
      touch();
      for (const r of demonRows) r.style.opacity = v === 'demon' ? '1' : '0.45';
      reset();
    },
  });

  ui.section('Demon');
  const demonSel = ui.select<DemonMode>({
    key: 'demon', label: 'Demon', value: demon,
    options: [{ value: 'off', label: 'Off (open door)' }, { value: 'sorter', label: 'Temperature sorter' }, { value: 'pressure', label: 'Pressure' }],
    onChange: (v) => { demon = v; gas.demon = v; touch(); },
  });
  demonRows.push(demonSel.el);
  demonRows.push(ui.slider({ key: 'door', label: 'Door size', min: 0.1, max: 0.6, step: 0.02, value: doorSide, format: (v) => `${(v * 100).toFixed(0)}% of wall`, onInput: (v) => { doorSide = v; touch(); buildWall(); } }).el);
  const [eraseBtn] = ui.buttons([{ label: 'Erase memory', key: 'erase', onClick: () => { touch(); erase(); drawLedger(); } }]);
  demonRows.push(eraseBtn.parentElement as HTMLElement);
  ui.note('Sorter: fast particles may go right, slow ones left. Pressure: anything may go right, nothing comes back. Every decision is one bit.');

  ui.section('Gas (resets)');
  ui.slider({ key: 'n', label: 'Particles N', min: 200, max: 800, step: 50, value: nPart, onInput: (v) => { nPart = v; touch(); reset(); } });
  ui.slider({ key: 'T0', label: 'Initial temperature', min: 0.3, max: 3, step: 0.1, value: T0, format: (v) => `${v.toFixed(1)} (k_B = 1)`, onInput: (v) => { T0 = v; touch(); reset(); } });
  ui.toggle({ key: 'equal', label: 'Start with equal speeds', value: equalStart, onChange: (v) => { equalStart = v; touch(); reset(); } });

  ui.section('Time reversal');
  ui.slider({
    key: 'noise', label: 'Noise on reversal', min: NOISE_ZERO, max: -1, step: 1, value: noiseExp,
    format: (v) => (v <= NOISE_ZERO ? '0 (exact)' : `10^${v}`),
    onInput: (v) => { noiseExp = v; touch(); },
  });
  ui.note('Each velocity is turned by a random angle of this relative size before reversal. Speeds, and so energy, stay the same.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rTL = ui.readout('tl', 'T left');
  const rTR = ui.readout('tr', 'T right');
  const rDT = ui.readout('dT', 'ΔT / T');
  const rS = ui.readout('sgas', 'gas entropy drop', 'k_B');
  const rBits = ui.readout('bits', 'bits recorded');
  const rErased = ui.readout('erased', 'bits erased');
  const rLand = ui.readout('landauer', 'paid at erasure', 'k_B');
  const rMix = ui.readout('mix', 'mixing S / N k ln2');
  const rKs = ui.readout('ks', 'KS gap to MB');
  const rE = ui.readout('energy', 'energy drift');
  const rRet = ui.readout('ret', 'return error');
  ui.legend([
    { color: css(SLOW), label: 'slow' },
    { color: '#e8eef8', label: 'typical' },
    { color: css(PALETTE.red), label: 'fast' },
    { color: css(PALETTE.green), label: 'door opened' },
  ]);

  function updateReadouts(): void {
    rT(gas.t.toFixed(1));
    rTL(exp === 'demon' ? TL.toFixed(3) : '–');
    rTR(exp === 'demon' ? TR.toFixed(3) : '–');
    rDT(exp === 'demon' ? `${(dT * 100).toFixed(1)} %` : '–');
    rS(exp === 'demon' ? sgas.toFixed(1) : '–');
    rBits(gas.decisions);
    rErased(erasedBits);
    rLand((Math.LN2 * erasedInfo).toFixed(1));
    rMix(exp === 'mix' ? mix.toFixed(3) : '–');
    rKs(ks.toFixed(3));
    const d = Math.abs(kinetic(gas) - e0) / e0;
    rE(d < 1e-15 ? '< 1e-15' : d.toExponential(1));
    rRet(Number.isFinite(retErr) ? retErr.toExponential(1) : '–');
    if (exp === 'demon') {
      labL.element.textContent = `left  T = ${TL.toFixed(2)}`;
      labR.element.textContent = `right  T = ${TR.toFixed(2)}`;
    }
    drawLedger();
  }

  buildWall();
  reset();
  touched = false;

  return {
    state: () => ({
      t: gas.t,
      exp,
      demon,
      touched,
      n: gas.n,
      T0,
      door: doorSide,
      TL,
      TR,
      dT,
      sgas,
      bits: gas.decisions,
      memBits,
      erased: erasedBits,
      info: memInfo() + erasedInfo,
      landauer: Math.LN2 * erasedInfo,
      mix,
      reversed,
      revNoise,
      revDur,
      tSinceRev,
      mixAtRev,
      minMixAfter,
      retErr: Number.isFinite(retErr) ? retErr : -1,
      ks,
      eDrift: Math.abs(kinetic(gas) - e0) / e0,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      ledger.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'maxwells-demon',
  number: 32,
  title: 'Entropy & Maxwell’s Demon',
  domain: 'thermo',
  level: 2,
  status: 'live',
  tagline: 'Why heat flows one way, and what it costs to cheat.',
  content,
  mount,
};

export default topic;
