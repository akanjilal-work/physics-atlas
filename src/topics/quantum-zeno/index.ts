import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  decayAll, dragAngles, dragFidelity, dragFidelityUniform, goldenRate, makeEnsemble, measureAll, measuredRate,
  mulberry32, rabiP0, resetEnsemble, rotateAll, stayProb, survivalAt, survivalAtPi, survivorFraction,
} from './physics.ts';

type View = 'zeno' | 'drag' | 'anti';

const R = 2;
const MAX_M = 500;
const TRAIL_L = 26;
const FAN = 16 * (Math.PI / 180);
const HOLD = 1.6; // seconds of pause between shots
const MAX_DOTS = 256;
// Anti-Zeno toy units: continuum half-width b = 1, peak golden-rule rate Gamma0 = 0.2 b.
const B = 1;
const G0 = 0.2;
const ANTI_WALL = 8; // wall seconds per anti-Zeno shot
const CAM: [number, number, number] = [6.4, 2.6, 4.6];

const AMBER = css(PALETTE.amber);
const VIOLET = css(PALETTE.violet);
const CYAN = css(PALETTE.cyan);
const GREEN = css(PALETTE.green);
const ROSE = css(PALETTE.rose);

interface VecArrow {
  group: THREE.Group;
  set(dir: THREE.Vector3, len: number): void;
}

function makeVecArrow(color: number, shaftR: number, headR: number, headLen: number, opacity = 1): VecArrow {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
  const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, 1, 14);
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 22), mat);
  group.add(shaft, head);
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  return {
    group,
    set(dir, len) {
      if (len < 1e-3 || dir.lengthSq() < 1e-12) {
        group.visible = false;
        return;
      }
      group.visible = true;
      d.copy(dir).normalize();
      group.quaternion.setFromUnitVectors(up, d);
      const hl = Math.min(headLen, len * 0.55);
      head.scale.setScalar(hl / headLen);
      head.position.y = len - hl / 2;
      shaft.scale.y = Math.max(1e-3, len - hl);
    },
  };
}

/** Scene position of the state at angle beta on the drive circle, fanned by phi about the z axis. */
function circlePos(beta: number, phi: number, s: number, out: THREE.Vector3): THREE.Vector3 {
  // physics (sin b sin f, -sin b cos f, cos b) -> scene (x, z, -y)
  const sb = Math.sin(beta);
  return out.set(sb * Math.sin(phi) * s, Math.cos(beta) * s, sb * Math.cos(phi) * s);
}

function ringPoints(n: number): Float32Array {
  const a = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    a[i * 3] = Math.cos(t) * R;
    a[i * 3 + 1] = 0;
    a[i * 3 + 2] = Math.sin(t) * R;
  }
  return a;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: [0, -0.1, 0], fov: 40 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'zeno';
  let Om = 1;
  let m = 6;
  let M = 150;
  let dragV = 0.6;
  let Delta = 4;
  let logNu = 0.3;
  let playing = true;
  let touched = false;

  // --- Ensemble and shot bookkeeping
  const ens = makeEnsemble(MAX_M);
  ens.n = M;
  const rand = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  let t = 0;
  let shotLen = 1;
  let nMeas = 0;
  let kMeas = 0;
  let tauS = Infinity; // measurement interval in scene seconds
  let simRate = 1; // sim seconds per wall second
  let phase: 'run' | 'hold' = 'run';
  let holdT = 0;
  let freeBeta = 0;
  let alpha = 0; // current measurement axis angle
  let qDecay = 0;
  let gEff = 0;
  let gGR = 0;
  const dAngles: number[] = [];
  let dragFinalF = 0;
  // Dots for the insets (sim results at measurement instants)
  const dotT = new Float64Array(MAX_DOTS);
  const dotP = new Float64Array(MAX_DOTS);
  let dotN = 0;
  let dotStride = 1;
  let lastP = 1; // ensemble value at the last measurement
  // Last completed shots, for the challenges
  let shotM = -1;
  let shotSurvSim = 0;
  let shotSurvTheory = 0;
  let shotEndZ = 1;
  let dragDone = false;
  let dragN = 0;
  let dragF = 0;
  let dragSim = 0;
  let dragEndZ = 1;
  let antiSim = -1;
  let antiTheory = 0;

  // --- Sphere
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6aa8ff) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); gl_FragColor = vec4(uColor*(0.35+0.9*f), 0.03 + 0.4*f); }`,
    transparent: true,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), glassMat);
  glass.renderOrder = 2;
  scene.add(glass);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPoints(128), 3));
  const faintMat = new THREE.LineBasicMaterial({ color: 0x33476e, transparent: true, opacity: 0.55 });
  scene.add(new THREE.Line(ringGeo, faintMat)); // equator
  const merX = new THREE.Line(ringGeo, faintMat);
  merX.rotation.x = Math.PI / 2;
  scene.add(merX);
  // The circle the drive moves the state along (scene y-z plane)
  const driveCircle = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x5a7bb0, transparent: true, opacity: 0.85 }));
  driveCircle.rotation.z = Math.PI / 2;
  scene.add(driveCircle);
  const axPts = new Float32Array([-1.15 * R, 0, 0, 1.15 * R, 0, 0, 0, 0, -1.15 * R, 0, 0, 1.15 * R]);
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.BufferAttribute(axPts, 3));
  scene.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: 0x46587c, transparent: true, opacity: 0.7 })));
  stage.label('|0⟩', [0, R * 1.3, 0], 'big');
  stage.label('|1⟩', [0, -R * 1.3, 0], 'big');
  stage.label('|−i⟩', [0, 0, R * 1.22], 'muted');

  // --- Measurement axis
  const mPos = new Float32Array(6);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  const mMat = new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.55 });
  const mLine = new THREE.Line(mGeo, mMat);
  mLine.frustumCulled = false;
  scene.add(mLine);
  const mPlus = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  const mMinus = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2f7a55 }));
  scene.add(mPlus, mMinus);
  const mLab = stage.label('measure', [0, 0, 0], 'muted');
  mLab.element.style.color = GREEN;
  // Measurement flash: ring around the axis at the + end, and a burst at the main tip
  const ringFlash = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(ringFlash);
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x5ee39a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  scene.add(burst);
  let flashT = 0;

  // --- Drive axis (physics x = scene x)
  const driveArrow = makeVecArrow(PALETTE.rose, 0.028, 0.09, 0.24, 0.9);
  driveArrow.set(new THREE.Vector3(1, 0, 0), R * 1.42);
  scene.add(driveArrow.group);
  const driveLab = stage.label('Ω drive', [R * 1.6, 0.12, 0], '');
  driveLab.element.style.color = ROSE;

  // --- Unwatched (free Rabi) arrow
  const freeArrow = makeVecArrow(0xc9d2e6, 0.022, 0.08, 0.22, 0.55);
  scene.add(freeArrow.group);
  const freeLab = stage.label('unwatched', [0, 0, 0], 'muted');

  // --- Main trajectory arrow
  const mainArrow = makeVecArrow(PALETTE.amber, 0.042, 0.12, 0.3);
  scene.add(mainArrow.group);
  const mainTip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe2a3 }));
  scene.add(mainTip);
  const mainTrail = new Trail(260, PALETTE.amber, 0.95);
  scene.add(mainTrail.line);

  // --- Ghost trajectories: instanced dots plus fading trails
  const ghostGeo = new THREE.SphereGeometry(0.042, 10, 8);
  const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false });
  const ghosts = new THREE.InstancedMesh(ghostGeo, ghostMat, MAX_M);
  ghosts.frustumCulled = false;
  const cAmber = new THREE.Color(0xffd27a);
  const cViolet = new THREE.Color(PALETTE.violet);
  for (let i = 0; i < MAX_M; i++) ghosts.setColorAt(i, cAmber);
  ghosts.count = M;
  scene.add(ghosts);
  const fanPhi = new Float64Array(MAX_M);
  const jitU = new Float64Array(MAX_M);
  const jitW = new Float64Array(MAX_M);
  for (let i = 0; i < MAX_M; i++) {
    const g = (i * 0.6180339887498949) % 1;
    fanPhi[i] = i === 0 ? 0 : FAN * (2 * g - 1);
    const rr = 0.2 * Math.sqrt(((i * 0.7548776662) % 1));
    const aa = 2 * Math.PI * ((i * 0.5698402910) % 1);
    jitU[i] = rr * Math.cos(aa);
    jitW[i] = rr * Math.sin(aa);
  }
  const gColorCode = new Int8Array(MAX_M).fill(-1);

  const trailPos = new Float32Array(MAX_M * TRAIL_L * 3);
  const trailCol = new Float32Array(MAX_M * TRAIL_L * 3);
  const trailIdx = new Uint32Array(MAX_M * (TRAIL_L - 1) * 2);
  for (let g = 0, w = 0; g < MAX_M; g++) {
    for (let j = 0; j < TRAIL_L - 1; j++) {
      trailIdx[w++] = g * TRAIL_L + j;
      trailIdx[w++] = g * TRAIL_L + j + 1;
    }
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeo.setIndex(new THREE.BufferAttribute(trailIdx, 1));
  const trails = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  trails.frustumCulled = false;
  scene.add(trails);

  function paintTrail(g: number, c: THREE.Color): void {
    const base = g * TRAIL_L * 3;
    for (let j = 0; j < TRAIL_L; j++) {
      const f = ((j + 1) / TRAIL_L) ** 2 * 0.8;
      trailCol[base + j * 3] = c.r * f;
      trailCol[base + j * 3 + 1] = c.g * f;
      trailCol[base + j * 3 + 2] = c.b * f;
    }
  }
  function fillTrail(g: number, p: THREE.Vector3): void {
    const base = g * TRAIL_L * 3;
    for (let j = 0; j < TRAIL_L; j++) {
      trailPos[base + j * 3] = p.x;
      trailPos[base + j * 3 + 1] = p.y;
      trailPos[base + j * 3 + 2] = p.z;
    }
  }

  // --- Overlays
  const boxStyle = {
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    ...boxStyle, position: 'absolute', left: '10px', top: '10px', maxWidth: '215px', padding: '7px 9px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  let legendHtml = '';

  const plotA = document.createElement('canvas');
  plotA.width = 520;
  plotA.height = 280;
  Object.assign(plotA.style, { ...boxStyle, position: 'absolute', right: '10px', top: '10px', width: '260px', height: '140px' } as CSSStyleDeclaration);
  viewport.appendChild(plotA);
  const actx = plotA.getContext('2d')!;
  const plotB = document.createElement('canvas');
  plotB.width = 520;
  plotB.height = 230;
  Object.assign(plotB.style, { ...boxStyle, position: 'absolute', right: '10px', bottom: '10px', width: '260px', height: '115px' } as CSSStyleDeclaration);
  viewport.appendChild(plotB);
  const bctx = plotB.getContext('2d')!;

  // --- Shot control
  const Tpi = () => Math.PI / Om;
  const nu = () => Math.pow(10, logNu);

  function startShot(): void {
    ens.n = M;
    resetEnsemble(ens, 0);
    t = 0;
    kMeas = 0;
    freeBeta = 0;
    alpha = 0;
    dotN = 0;
    lastP = 1;
    phase = 'run';
    tauS = m > 0 ? Tpi() / m : Infinity;
    if (view === 'zeno') {
      shotLen = Tpi();
      nMeas = m;
      simRate = 1;
    } else if (view === 'drag') {
      if (m > 0) {
        dragAngles(dragV * tauS, dAngles);
        nMeas = dAngles.length;
        shotLen = nMeas * tauS;
        dragFinalF = dragFidelity(dAngles);
      } else {
        dAngles.length = 0;
        nMeas = 0;
        shotLen = Math.PI / dragV;
        dragFinalF = 0;
      }
      simRate = 1;
    } else {
      const tau = 1 / nu();
      gGR = goldenRate(G0, B, Delta);
      gEff = measuredRate(G0, B, Delta, tau);
      qDecay = 1 - Math.exp(-gEff * tau);
      shotLen = 2.5 / Math.sqrt(gGR * gEff);
      nMeas = Math.floor(shotLen / tau + 1e-9);
      shotLen = nMeas * tau;
      tauS = tau;
      simRate = shotLen / ANTI_WALL;
    }
    dotStride = Math.max(1, Math.ceil(nMeas / (MAX_DOTS - 1)));
    for (let i = 0; i < M; i++) ens.jumped[i] = 1; // refill trails at the start point
    mainTrail.clear();
  }

  function tMeas(k: number): number {
    if (view === 'zeno') return (k * Tpi()) / m;
    return k * tauS;
  }

  function measureNow(): void {
    kMeas++;
    if (view === 'zeno') {
      measureAll(ens, 0, rand);
      lastP = survivorFraction(ens);
    } else if (view === 'drag') {
      alpha = dAngles[kMeas - 1];
      lastP = measureAll(ens, alpha, rand) / ens.n;
    } else {
      decayAll(ens, qDecay, rand);
      lastP = survivorFraction(ens);
    }
    if (kMeas % dotStride === 0 || kMeas === nMeas) {
      if (dotN < MAX_DOTS) {
        dotT[dotN] = t;
        dotP[dotN] = lastP;
        dotN++;
      }
    }
    if (view !== 'anti' || nMeas < 80) flashT = 1;
  }

  function endShot(): void {
    phase = 'hold';
    holdT = HOLD;
    if (view === 'zeno') {
      shotM = m;
      shotSurvSim = survivorFraction(ens);
      shotSurvTheory = survivalAtPi(m);
      shotEndZ = Math.cos(ens.beta[0]);
    } else if (view === 'drag') {
      dragDone = true;
      dragN = nMeas;
      dragF = dragFinalF;
      dragSim = m > 0 ? lastP : 0;
      dragEndZ = Math.cos(ens.beta[0]);
    } else {
      antiSim = survivorFraction(ens);
      antiTheory = Math.exp(-gEff * shotLen);
    }
  }

  function advance(simDt: number): void {
    const rate = view === 'zeno' ? Om : 0;
    const tEnd = Math.min(t + simDt, shotLen);
    let guard = 0;
    while (kMeas < nMeas && tMeas(kMeas + 1) <= tEnd + 1e-12 && guard++ < 100000) {
      const tm = tMeas(kMeas + 1);
      if (rate) rotateAll(ens, rate * (tm - t));
      freeBeta += Om * (tm - t);
      t = tm;
      measureNow();
    }
    if (rate) rotateAll(ens, rate * (tEnd - t));
    freeBeta += Om * (tEnd - t);
    t = tEnd;
    if (view === 'drag') alpha = Math.min(Math.PI, dragV * t);
    if (t >= shotLen - 1e-12 && kMeas >= nMeas) endShot();
  }

  // --- Drawing
  const tv = new THREE.Vector3();
  const tv2 = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  const X = new THREE.Vector3(1, 0, 0);

  function ghostPos(i: number, out: THREE.Vector3): THREE.Vector3 {
    const b = ens.beta[i];
    if (view === 'zeno') return circlePos(b, fanPhi[i], R, out);
    circlePos(b, 0, 1, out);
    if (i === 0) return out.multiplyScalar(R);
    // tangent along the circle: d/dbeta of (0, cos b, sin b)
    tv2.set(0, -Math.sin(b), Math.cos(b)).multiplyScalar(jitW[i]);
    out.addScaledVector(X, jitU[i]).add(tv2).normalize().multiplyScalar(R);
    return out;
  }

  function drawScene(): void {
    const zeno = view === 'zeno';
    // Measurement axis
    circlePos(alpha, 0, 1.28 * R, tv);
    mPos[0] = -tv.x; mPos[1] = -tv.y; mPos[2] = -tv.z;
    mPos[3] = tv.x; mPos[4] = tv.y; mPos[5] = tv.z;
    mGeo.attributes.position.needsUpdate = true;
    circlePos(alpha, 0, R, tv);
    mPlus.position.copy(tv);
    mMinus.position.copy(tv).negate();
    circlePos(alpha, 0, 1.12 * R, tv);
    mLab.position.copy(tv).add(tv2.set(0.55, 0, 0));
    mLab.visible = view === 'drag';
    ringFlash.position.copy(mPlus.position);
    tv.copy(mPlus.position).normalize();
    ringFlash.quaternion.setFromUnitVectors(tv2.set(0, 0, 1), tv);

    if (flashT > 0) {
      (ringFlash.material as THREE.MeshBasicMaterial).opacity = 0.9 * flashT;
      ringFlash.scale.setScalar(0.6 + 1.2 * (1 - flashT));
      (burst.material as THREE.MeshBasicMaterial).opacity = 0.4 * flashT;
      burst.scale.setScalar(0.5 + 1.4 * (1 - flashT));
      mMat.opacity = 0.55 + 0.45 * flashT;
      ringFlash.visible = burst.visible = true;
    } else {
      ringFlash.visible = burst.visible = false;
      mMat.opacity = 0.55;
    }

    driveArrow.group.visible = zeno;
    driveLab.visible = zeno;

    // Unwatched arrow
    const showFree = zeno && m > 0;
    if (showFree) {
      circlePos(freeBeta, 0, 1, tv);
      freeArrow.set(tv, R);
      freeLab.position.copy(tv).multiplyScalar(R * 0.85).add(tv2.set(0, 0, 0.5));
    } else freeArrow.group.visible = false;
    freeLab.visible = showFree;

    // Main trajectory
    const jumpedMain = ens.jumped[0] === 1;
    ghostPos(0, tv);
    tv2.copy(tv).normalize();
    mainArrow.set(tv2, R);
    mainTip.position.copy(tv);
    burst.position.copy(tv);
    if (jumpedMain) mainTrail.clear();
    mainTrail.push(tv.x, tv.y, tv.z);

    // Ghosts
    const showTrails = zeno;
    trails.visible = showTrails;
    let colorsDirty = false;
    let trailColorsDirty = false;
    if (showTrails) trailPos.copyWithin(0, 3);
    for (let i = 0; i < M; i++) {
      ghostPos(i, tv);
      mat4.makeTranslation(tv.x, tv.y, tv.z);
      ghosts.setMatrixAt(i, mat4);
      const code = view === 'drag' ? (ens.plus[i] ? 0 : 1) : ens.failed[i] ? 1 : 0;
      if (code !== gColorCode[i]) {
        gColorCode[i] = code;
        const c = code ? cViolet : cAmber;
        ghosts.setColorAt(i, c);
        paintTrail(i, c);
        colorsDirty = trailColorsDirty = true;
      }
      if (showTrails) {
        if (ens.jumped[i]) fillTrail(i, tv);
        else {
          const k = (i * TRAIL_L + TRAIL_L - 1) * 3;
          trailPos[k] = tv.x;
          trailPos[k + 1] = tv.y;
          trailPos[k + 2] = tv.z;
        }
      }
      ens.jumped[i] = 0;
    }
    ghosts.count = M;
    ghosts.instanceMatrix.needsUpdate = true;
    if (colorsDirty && ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;
    trailGeo.setDrawRange(0, M * (TRAIL_L - 1) * 2);
    if (showTrails) trailGeo.attributes.position.needsUpdate = true;
    if (trailColorsDirty) trailGeo.attributes.color.needsUpdate = true;
  }

  // --- Inset plots
  const plotFrame = (ctx: CanvasRenderingContext2D, W: number, Hh: number, title: string, tag: string) => {
    ctx.clearRect(0, 0, W, Hh);
    ctx.font = '600 20px JetBrains Mono, monospace';
    ctx.fillStyle = '#b8c3d9';
    ctx.fillText(title, 16, 30);
    ctx.font = '17px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText(tag, W - 16 - ctx.measureText(tag).width, 30);
  };
  const hline = (ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, label: string, dash = false) => {
    ctx.save();
    ctx.strokeStyle = dash ? '#3a4a6a' : '#243049';
    ctx.lineWidth = 1.5;
    if (dash) ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#56627c';
    ctx.font = '16px JetBrains Mono, monospace';
    ctx.fillText(label, x1 + 6, y + 5);
  };
  const dots = (ctx: CanvasRenderingContext2D, xOf: (t: number) => number, yOf: (p: number) => number) => {
    ctx.fillStyle = CYAN;
    for (let i = 0; i < dotN; i++) {
      ctx.beginPath();
      ctx.arc(xOf(dotT[i]), yOf(dotP[i]), 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const ZENO_SET = [0, 2, 4, 8, 16, 32];
  const DRAG_SET = [2, 5, 10, 25, 60];

  function drawA(): void {
    const W = plotA.width, Hh = plotA.height;
    const x0 = 18, x1 = W - 58, y0 = 52, y1 = Hh - 34;
    const yOf = (p: number) => y1 - p * (y1 - y0);
    if (view === 'zeno') {
      plotFrame(actx, W, Hh, 'P(survive) vs t', 'curves: N per π');
      hline(actx, x0, x1, yOf(0), '');
      hline(actx, x0, x1, yOf(0.5), '', true);
      hline(actx, x0, x1, yOf(1), '');
      actx.fillStyle = '#56627c';
      actx.font = '15px JetBrains Mono, monospace';
      actx.fillText('1', x0 + 4, yOf(1) + 18);
      actx.fillText('0.5', x0 + 4, yOf(0.5) - 6);
      const xOf = (u: number) => x0 + u * (x1 - x0);
      const curve = (mm: number, color: string, width: number, dash: boolean) => {
        actx.save();
        actx.strokeStyle = color;
        actx.lineWidth = width;
        if (dash) actx.setLineDash([9, 7]);
        actx.beginPath();
        for (let i = 0; i <= 200; i++) {
          const u = i / 200;
          const p = mm > 0 ? survivalAt(Math.PI, 1 / mm, u) : rabiP0(Math.PI, u);
          if (i === 0) actx.moveTo(xOf(u), yOf(p));
          else actx.lineTo(xOf(u), yOf(p));
        }
        actx.stroke();
        actx.restore();
      };
      actx.font = '15px JetBrains Mono, monospace';
      for (const mm of ZENO_SET) {
        if (mm === m) continue;
        curve(mm, '#3b4a68', 2, false);
        const pe = mm > 0 ? survivalAtPi(mm) : 0;
        actx.fillStyle = '#56627c';
        if (mm !== 0 && Math.abs(pe - survivalAtPi(m)) > 0.04) actx.fillText(String(mm), x1 + 8, yOf(pe) + 5);
      }
      curve(m, AMBER, 3.5, false);
      actx.fillStyle = AMBER;
      actx.font = '600 16px JetBrains Mono, monospace';
      actx.fillText(`N=${m}`, x1 + 6, yOf(survivalAtPi(m)) + 5);
      dots(actx, (tt) => xOf(tt / Tpi()), yOf);
      // time cursor
      const xc = xOf(Math.min(1, t / Tpi()));
      actx.strokeStyle = 'rgba(223,230,243,0.35)';
      actx.lineWidth = 1.5;
      actx.beginPath();
      actx.moveTo(xc, y0 - 8);
      actx.lineTo(xc, y1);
      actx.stroke();
      actx.fillStyle = '#56627c';
      actx.font = '16px JetBrains Mono, monospace';
      actx.fillText('0', x0, Hh - 10);
      actx.fillText('t = π/Ω', x1 - 70, Hh - 10);
    } else if (view === 'drag') {
      plotFrame(actx, W, Hh, 'P(along axis)', 'vs axis angle');
      for (const v of [0, 0.5, 1]) hline(actx, x0, x1, yOf(v), String(v));
      const xOf = (a: number) => x0 + (a / Math.PI) * (x1 - x0);
      for (const N of DRAG_SET) {
        actx.strokeStyle = '#3b4a68';
        actx.lineWidth = 2;
        actx.beginPath();
        actx.moveTo(xOf(0), yOf(1));
        for (let k = 1; k <= N; k++) {
          const f = 0.5 + 0.5 * Math.pow(Math.cos(Math.PI / N), k);
          actx.lineTo(xOf((k * Math.PI) / N), yOf(f));
        }
        actx.stroke();
      }
      if (dAngles.length) {
        actx.strokeStyle = AMBER;
        actx.lineWidth = 3.5;
        actx.beginPath();
        actx.moveTo(xOf(0), yOf(1));
        for (let k = 1; k <= dAngles.length; k++) actx.lineTo(xOf(dAngles[k - 1]), yOf(dragFidelity(dAngles, k)));
        actx.stroke();
      }
      dots(actx, (tt) => {
        const k = Math.round(tt / tauS);
        return xOf(k >= 1 && k <= dAngles.length ? dAngles[k - 1] : Math.min(Math.PI, dragV * tt));
      }, yOf);
      const xc = xOf(alpha);
      actx.strokeStyle = 'rgba(94,227,154,0.6)';
      actx.lineWidth = 1.5;
      actx.beginPath();
      actx.moveTo(xc, y0 - 8);
      actx.lineTo(xc, y1);
      actx.stroke();
      actx.fillStyle = '#56627c';
      actx.font = '16px JetBrains Mono, monospace';
      actx.fillText('|0⟩ axis', x0, Hh - 10);
      actx.fillText('|1⟩ axis', x1 - 80, Hh - 10);
    } else {
      plotFrame(actx, W, Hh, 'Γ_meas / Γ_golden', 'vs rate ν');
      const lo = -0.5, hi = 2;
      const ratio = (D: number, lg: number) => measuredRate(G0, B, D, 1 / Math.pow(10, lg)) / goldenRate(G0, B, D);
      let top = 2;
      for (let i = 0; i <= 120; i++) top = Math.max(top, ratio(Delta, lo + ((hi - lo) * i) / 120));
      top = Math.ceil(top + 0.2);
      const yR = (r: number) => y1 - (r / top) * (y1 - y0);
      const xOf = (lg: number) => x0 + ((lg - lo) / (hi - lo)) * (x1 - x0);
      hline(actx, x0, x1, yR(0), '0');
      hline(actx, x0, x1, yR(1), '1', true);
      hline(actx, x0, x1, yR(top), String(top));
      actx.fillStyle = '#56627c';
      actx.font = '15px JetBrains Mono, monospace';
      actx.fillText('anti-Zeno', x0 + 6, yR(1) - 8);
      actx.fillText('Zeno', x0 + 6, yR(1) + 20);
      const curve = (D: number, color: string, w: number, dash: boolean) => {
        actx.save();
        actx.strokeStyle = color;
        actx.lineWidth = w;
        if (dash) actx.setLineDash([8, 7]);
        actx.beginPath();
        for (let i = 0; i <= 160; i++) {
          const lg = lo + ((hi - lo) * i) / 160;
          const y = yR(Math.min(top, ratio(D, lg)));
          if (i === 0) actx.moveTo(xOf(lg), y);
          else actx.lineTo(xOf(lg), y);
        }
        actx.stroke();
        actx.restore();
      };
      curve(0, '#6b7a99', 2, true);
      curve(Delta, AMBER, 3.5, false);
      const rNow = ratio(Delta, logNu);
      actx.fillStyle = GREEN;
      actx.beginPath();
      actx.arc(xOf(logNu), yR(Math.min(top, rNow)), 7, 0, Math.PI * 2);
      actx.fill();
      actx.fillStyle = '#56627c';
      actx.font = '16px JetBrains Mono, monospace';
      actx.fillText('ν = 0.3 b', x0, Hh - 10);
      actx.fillText('100 b', x1 - 50, Hh - 10);
    }
  }

  function drawB(): void {
    const W = plotB.width, Hh = plotB.height;
    const x0 = 18, x1 = W - 58, y0 = 48, y1 = Hh - 34;
    const yOf = (p: number) => y1 - p * (y1 - y0);
    if (view === 'zeno' || view === 'drag') {
      const zeno = view === 'zeno';
      plotFrame(bctx, W, Hh, zeno ? 'P at t = π/Ω' : 'final P(|1⟩)', 'vs N (log)');
      hline(bctx, x0, x1, yOf(0), '0');
      hline(bctx, x0, x1, yOf(0.5), '0.5', true);
      hline(bctx, x0, x1, yOf(0.9), '0.9', true);
      hline(bctx, x0, x1, yOf(1), '1');
      const nMax = zeno ? 64 : 128;
      const xOf = (n: number) => x0 + (Math.log(n) / Math.log(nMax)) * (x1 - x0);
      bctx.strokeStyle = zeno ? AMBER : GREEN;
      bctx.lineWidth = 3;
      bctx.beginPath();
      for (let n = 1; n <= nMax; n++) {
        const p = zeno ? survivalAtPi(n) : dragFidelityUniform(n);
        if (n === 1) bctx.moveTo(xOf(n), yOf(p));
        else bctx.lineTo(xOf(n), yOf(p));
      }
      bctx.stroke();
      bctx.fillStyle = '#b8c3d9';
      for (let n = 1; n <= nMax; n++) {
        if (!zeno && n > 16 && n % 4) continue;
        const p = zeno ? survivalAtPi(n) : dragFidelityUniform(n);
        bctx.beginPath();
        bctx.arc(xOf(n), yOf(p), 2.5, 0, Math.PI * 2);
        bctx.fill();
      }
      // current setting
      const nNow = zeno ? m : nMeas;
      const pNow = zeno ? survivalAtPi(m) : dragFinalF;
      if (nNow >= 1) {
        bctx.strokeStyle = '#dfe6f3';
        bctx.lineWidth = 2.5;
        bctx.beginPath();
        bctx.arc(xOf(Math.min(nMax, nNow)), yOf(pNow), 9, 0, Math.PI * 2);
        bctx.stroke();
        const simV = zeno ? (shotM === m ? shotSurvSim : -1) : dragDone && dragN === nMeas ? dragSim : -1;
        if (simV >= 0) {
          bctx.fillStyle = CYAN;
          bctx.beginPath();
          bctx.arc(xOf(Math.min(nMax, nNow)), yOf(simV), 5.5, 0, Math.PI * 2);
          bctx.fill();
        }
      }
      bctx.fillStyle = '#56627c';
      bctx.font = '16px JetBrains Mono, monospace';
      bctx.fillText('1', x0, Hh - 10);
      bctx.fillText(String(nMax), x1 - 30, Hh - 10);
      const lab = nNow >= 1 ? `N = ${nNow}` : 'N = 0: no data';
      bctx.fillStyle = '#dfe6f3';
      bctx.fillText(lab, (x0 + x1) / 2 - 50, Hh - 10);
    } else {
      plotFrame(bctx, W, Hh, 'P(undecayed)', 'vs time');
      hline(bctx, x0, x1, yOf(0), '0');
      hline(bctx, x0, x1, yOf(1), '1');
      const xOf = (tt: number) => x0 + (tt / shotLen) * (x1 - x0);
      const expCurve = (rate: number, color: string, dash: boolean) => {
        bctx.save();
        bctx.strokeStyle = color;
        bctx.lineWidth = dash ? 2 : 3;
        if (dash) bctx.setLineDash([8, 7]);
        bctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const tt = (shotLen * i) / 100;
          const y = yOf(Math.exp(-rate * tt));
          if (i === 0) bctx.moveTo(xOf(tt), y);
          else bctx.lineTo(xOf(tt), y);
        }
        bctx.stroke();
        bctx.restore();
      };
      expCurve(gGR, '#8391ab', true);
      expCurve(gEff, AMBER, false);
      dots(bctx, xOf, yOf);
      bctx.fillStyle = '#56627c';
      bctx.font = '16px JetBrains Mono, monospace';
      bctx.fillText('- - unwatched, golden rule', x0, Hh - 10);
    }
  }

  function updateLegend(): void {
    let html: string;
    const key = `<div style="margin-top:4px"><span style="color:${AMBER}">●</span> never failed &nbsp;<span style="color:${VIOLET}">●</span> jumped away</div>`;
    if (view === 'zeno') {
      const fails = Math.round((1 - survivorFraction(ens)) * M);
      html = `<div style="color:#dfe6f3;font:600 15px/1.25 'Space Grotesk',sans-serif;margin-bottom:4px">${m > 0 ? `Watched ${m}× per π pulse` : 'Unwatched Rabi flopping'}</div>
<div>The <span style="color:${ROSE}">drive</span> turns |0⟩ toward |1⟩. Each <span style="color:${GREEN}">flash</span> is a z measurement.</div>
<div>Check ${kMeas}/${nMeas}. ${fails} of ${M} runs jumped.</div>${key}
${m > 0 ? '<div><span style="color:#c9d2e6">●</span> grey arrow: unwatched copy</div>' : ''}
<div style="color:#8391ab">Runs are fanned about z so they do not overlap.</div>`;
    } else if (view === 'drag') {
      const along = Math.round(lastP * M);
      html = `<div style="color:#dfe6f3;font:600 15px/1.25 'Space Grotesk',sans-serif;margin-bottom:4px">Zeno dragging, no drive</div>
<div>The <span style="color:${GREEN}">measurement axis</span> turns from |0⟩ to |1⟩. Each measurement pulls the state onto it.</div>
<div>Axis ${(alpha * 180 / Math.PI).toFixed(0)}°. Measurements ${kMeas}/${nMeas}. ${along} of ${M} runs lie along the axis.</div>
<div style="margin-top:4px"><span style="color:${AMBER}">●</span> along axis &nbsp;<span style="color:${VIOLET}">●</span> opposite</div>
<div style="color:#8391ab">Dots are scattered a little so you can count them.</div>`;
    } else {
      html = `<div style="color:#dfe6f3;font:600 15px/1.25 'Space Grotesk',sans-serif;margin-bottom:4px">Anti-Zeno toy model</div>
<div>|0⟩ is an excited level leaking into a continuum. |1⟩ here means "decayed".</div>
<div>Level detuned ${Delta.toFixed(1)} b from the continuum peak. Checks at ν = ${nu().toFixed(2)} b.</div>
<div>Rate × ${(gEff / gGR).toFixed(2)} of the unwatched rate: <b style="color:${gEff > gGR ? ROSE : CYAN}">${gEff > gGR ? 'anti-Zeno' : 'Zeno'}</b>.</div>${key}`;
    }
    if (html !== legendHtml) {
      legend.innerHTML = html;
      legendHtml = html;
    }
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'zeno', label: 'Zeno freeze' }, { value: 'drag', label: 'Zeno dragging' }, { value: 'anti', label: 'Anti-Zeno' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => setPlaying(!playing) },
    { label: 'Restart shot', onClick: () => startShot() },
  ]);

  ui.section('Drive and measurement');
  ui.slider({
    key: 'omega', label: 'Rabi frequency Ω', min: 0.3, max: 3, step: 0.05, value: Om, unit: 'rad/s',
    onInput: (v) => { Om = v; startShot(); },
  });
  ui.slider({
    key: 'm', label: 'Measurements per π pulse N', min: 0, max: 64, step: 1, value: m,
    format: (v) => (v === 0 ? 'none' : String(v)),
    onInput: (v) => { m = v; touched = true; startShot(); },
  });
  ui.slider({
    key: 'M', label: 'Trajectories', min: 1, max: MAX_M, step: 1, value: M,
    onInput: (v) => { M = v; startShot(); },
  });
  const rTau = ui.readout('tau', 'interval τ = π/(NΩ)');
  const rTpi = ui.readout('Tpi', 'π-pulse time π/Ω');

  ui.section('Zeno dragging');
  const dragSec = ui.root.lastElementChild as HTMLElement;
  ui.slider({
    key: 'drag', label: 'Drag speed of the axis', min: 0.05, max: 2, step: 0.05, value: dragV, unit: 'rad/s',
    onInput: (v) => { dragV = v; if (view === 'drag') startShot(); },
  });
  const rDragN = ui.readout('dragN', 'measurements in sweep');
  const rDragF = ui.readout('dragF', 'P(end at |1⟩) theory');
  const rDragS = ui.readout('dragSim', 'last sweep, simulated');

  ui.section('Anti-Zeno toy');
  const antiSec = ui.root.lastElementChild as HTMLElement;
  ui.slider({
    key: 'delta', label: 'Level offset from continuum peak', min: 0, max: 8, step: 0.1, value: Delta, unit: 'b',
    onInput: (v) => { Delta = v; if (view === 'anti') startShot(); },
  });
  ui.slider({
    key: 'nu', label: 'Measurement rate ν', min: -0.5, max: 2, step: 0.02, value: logNu,
    format: (v) => `${Math.pow(10, v).toFixed(Math.pow(10, v) < 10 ? 2 : 0)} b`,
    onInput: (v) => { logNu = v; if (view === 'anti') startShot(); },
  });
  const rRatio = ui.readout('ratio', 'Γ_meas / Γ_golden');
  const rAnti = ui.readout('antiSim', 'undecayed at end (sim / theory)');

  ui.section('Live readouts');
  const rTime = ui.readout('time', 'elapsed t');
  const rN = ui.readout('N', 'measurements so far');
  const rStep = ui.readout('pstep', 'stay per interval cos²(Ωτ/2)');
  const rP = ui.readout('P', 'theory at last check');
  const rPsim = ui.readout('Psim', 'ensemble at last check');
  const rSig = ui.readout('sigma', '|sim − theory| / σ');
  ui.legend([
    { color: AMBER, label: 'watched state' },
    { color: VIOLET, label: 'jumped' },
    { color: GREEN, label: 'measurement axis' },
    { color: ROSE, label: 'drive' },
    { color: CYAN, label: 'simulated' },
  ]);

  function setPlaying(v: boolean): void {
    playing = v;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }

  function setView(v: View): void {
    view = v;
    dragSec.style.display = v === 'drag' ? '' : 'none';
    antiSec.style.display = v === 'anti' ? '' : 'none';
    gColorCode.fill(-1);
    startShot();
  }

  /** Theory value at the last completed measurement. */
  function theoryNow(): number {
    if (view === 'zeno') return m > 0 ? Math.pow(survivalAtPi(m), kMeas / m) : 1;
    if (view === 'drag') return kMeas > 0 ? dragFidelity(dAngles, kMeas) : 1;
    return Math.exp(-gEff * kMeas * tauS);
  }

  function updateReadouts(): void {
    rTpi(`${Tpi().toFixed(2)} s`);
    rTau(m > 0 ? `${(Tpi() / m).toFixed(3)} s` : '∞ (no checks)');
    rDragN(m > 0 ? String(dAngles.length || '–') : '0');
    rDragF(view === 'drag' ? dragFinalF.toFixed(3) : '–');
    rDragS(dragDone ? dragSim.toFixed(3) : '–');
    const ratio = measuredRate(G0, B, Delta, 1 / nu()) / goldenRate(G0, B, Delta);
    rRatio(ratio.toFixed(3));
    rAnti(antiSim >= 0 ? `${antiSim.toFixed(2)} / ${antiTheory.toFixed(2)}` : '–');
    if (view === 'anti') rTime(`${t.toFixed(1)} / ${shotLen.toFixed(0)} 1/b`);
    else rTime(view === 'zeno' ? `${(t / Tpi()).toFixed(2)} π/Ω` : `${t.toFixed(2)} s`);
    rN(`${kMeas} of ${nMeas}`);
    rStep(view === 'zeno' && m > 0 ? stayProb(Om, Tpi() / m).toFixed(4) : '–');
    const th = theoryNow();
    rP(th.toFixed(4));
    rPsim(lastP.toFixed(4));
    if (kMeas > 0) {
      const sig = Math.sqrt(Math.max(th * (1 - th), 1e-12) / M);
      rSig(th > 1 - 1e-12 || th < 1e-12 ? (Math.abs(lastP - th) < 1e-12 ? '0 (exact)' : '∞') : (Math.abs(lastP - th) / sig).toFixed(2));
    } else rSig('–');
  }

  // --- Frame loop
  let uiTimer = 0;
  let plotTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      if (phase === 'run') advance(dt * simRate);
      else {
        holdT -= dt;
        if (holdT <= 0) startShot();
      }
    }
    if (flashT > 0) flashT = Math.max(0, flashT - dt / 0.35);
    drawScene();
    plotTimer += dt;
    if (plotTimer > 1 / 15) {
      plotTimer = 0;
      drawA();
      drawB();
    }
    uiTimer += dt;
    if (uiTimer > 0.15) {
      uiTimer = 0;
      updateReadouts();
      updateLegend();
    }
  });

  // --- Init
  setView('zeno');
  setPlaying(true);
  drawA();
  drawB();
  updateReadouts();
  updateLegend();

  return {
    state: () => ({
      view,
      omega: Om,
      m,
      tau: m > 0 ? Tpi() / m : -1,
      M,
      touched,
      running: phase === 'run',
      t,
      kMeas,
      survSim: lastP,
      survTheory: theoryNow(),
      shotM,
      shotSurvSim,
      shotSurvTheory,
      shotEndZ,
      dragDone,
      dragN,
      dragF,
      dragSim,
      dragEndZ,
      dragSpeed: dragV,
      delta: Delta,
      nu: nu(),
      antiRatio: gGR > 0 ? gEff / gGR : 1,
    }),
    dispose: () => {
      legend.remove();
      plotA.remove();
      plotB.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quantum-zeno',
  number: 50,
  title: 'The Quantum Zeno Effect',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'A watched quantum pot never boils.',
  content,
  mount,
};

export default topic;
