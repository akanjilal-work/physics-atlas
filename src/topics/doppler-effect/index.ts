import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { MEDIA, boomTime, emissionCos, emissionTimes, heardRatio, machAngle, residual, type Medium, type PassBy } from './physics.ts';

type View = 'street' | 'top' | 'ear';

const DEG = Math.PI / 180;
const SCALE = 10; // metres per scene unit
const HALF = 11; // half-length of one pass, scene units of separation
const RMAX = 15; // largest ring drawn
const SPACING = 1; // ring spacing for a still source, scene units
const NRING = 40;
const CSEG = 96;
const SRC_Y = 0.5; // source and ear height
const RING_Y = 0.03;
const NS = 320; // trace samples
const WAVE = 0x6fd8ec;
const GHOST = PALETTE.rose;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [-1.2, 5.2, 11.5], target: [0, 0, 1.2], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let mach = 0.15;
  let mo = 0; // listener speed as a fraction of c, toward the oncoming source
  let freq = 500;
  let dist = 20; // metres from the source's line
  let medium: Medium = 'air';
  let view: View = 'street';
  let playing = true;
  let audioOn = false;

  // Challenge bookkeeping
  let boomHeard = false;
  let srcOnlyM = mach;
  let obsOnlyM = -1;

  // --- Derived quantities (rebuilt on parameter change)
  const p: PassBy = { c: MEDIA.air, vs: 0, vo: 0, d: dist };
  let cScr = 22; // on-screen sound speed, units per screen second
  let uS = 0; // on-screen source speed
  let uO = 0; // on-screen listener speed
  let tau0 = 8; // half-duration of a pass in screen seconds
  let tauEnd = 8;
  let k = 1; // physical seconds per screen second
  let tauBoom = NaN;

  // =====================================================================
  // Ground, road, listener lane
  // =====================================================================
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.002, 3);
  scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(34, 1.3), new THREE.MeshStandardMaterial({ color: 0x1a2231, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.001;
  scene.add(road);
  const dashPts: THREE.Vector3[] = [];
  for (let x = -17; x < 17; x += 1.2) dashPts.push(new THREE.Vector3(x, 0.006, 0), new THREE.Vector3(x + 0.6, 0.006, 0));
  const dashes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dashPts), new THREE.LineBasicMaterial({ color: 0x55607a }));
  scene.add(dashes);
  for (const z of [-0.65, 0.65]) {
    const edge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-17, 0.006, z), new THREE.Vector3(17, 0.006, z)]),
      new THREE.LineBasicMaterial({ color: 0x3a4660 }),
    );
    scene.add(edge);
  }
  const laneGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-17, 0.006, 0), new THREE.Vector3(17, 0.006, 0)]);
  const lane = new THREE.Line(laneGeo, new THREE.LineDashedMaterial({ color: 0x2f7a55, dashSize: 0.25, gapSize: 0.2 }));
  lane.computeLineDistances();
  scene.add(lane);

  // =====================================================================
  // Source: ambulance (subsonic) and jet (supersonic)
  // =====================================================================
  const source = new THREE.Group();
  scene.add(source);
  const amb = new THREE.Group();
  source.add(amb);
  const white = new THREE.MeshStandardMaterial({ color: 0xe8edf5, roughness: 0.5, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.56), white);
  body.position.set(-0.12, 0.43, 0);
  amb.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.54), white);
  cab.position.set(0.55, 0.34, 0);
  amb.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.46), new THREE.MeshStandardMaterial({ color: 0x223050, roughness: 0.2, metalness: 0.5 }));
  glass.position.set(0.77, 0.44, 0);
  amb.add(glass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.07, 0.572), new THREE.MeshStandardMaterial({ color: 0xd8403c, roughness: 0.6 }));
  stripe.position.set(0.1, 0.36, 0);
  amb.add(stripe);
  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 });
  for (const [x, z] of [[-0.4, 0.28], [-0.4, -0.28], [0.5, 0.28], [0.5, -0.28]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.11, z);
    amb.add(w);
  }
  const redMat = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2a2a, emissiveIntensity: 1 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x112255, emissive: 0x3a7bff, emissiveIntensity: 1 });
  const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.18), redMat);
  lampR.position.set(0.3, 0.78, 0.12);
  const lampB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.18), blueMat);
  lampB.position.set(0.3, 0.78, -0.12);
  amb.add(lampR, lampB);

  const jet = new THREE.Group();
  source.add(jet);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c3d4, roughness: 0.35, metalness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.5, 16), metal);
  fus.rotation.z = Math.PI / 2;
  fus.position.y = SRC_Y;
  jet.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 16), metal);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(1.0, SRC_Y, 0);
  jet.add(nose);
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.35, 0);
  wingShape.lineTo(-0.55, 0.62);
  wingShape.lineTo(-0.7, 0.62);
  wingShape.lineTo(-0.6, 0);
  wingShape.lineTo(-0.7, -0.62);
  wingShape.lineTo(-0.55, -0.62);
  wingShape.closePath();
  const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), new THREE.MeshStandardMaterial({ color: 0x9aa6bd, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  wing.rotation.x = -Math.PI / 2;
  wing.position.y = SRC_Y - 0.02;
  jet.add(wing);
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.35, 0);
  finShape.lineTo(-0.72, 0.42);
  finShape.lineTo(-0.78, 0.42);
  finShape.lineTo(-0.75, 0);
  finShape.closePath();
  const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape), new THREE.MeshStandardMaterial({ color: 0x9aa6bd, side: THREE.DoubleSide }));
  fin.position.y = SRC_Y + 0.05;
  jet.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 12), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.z = Math.PI / 2;
  flame.position.set(-0.93, SRC_Y, 0);
  jet.add(flame);
  const srcLabel = stage.label('', [0, 1.25, 0], 'muted', source);

  // =====================================================================
  // Listener
  // =====================================================================
  const listener = new THREE.Group();
  scene.add(listener);
  const personMat = new THREE.MeshStandardMaterial({ color: PALETTE.green, roughness: 0.5, emissive: 0x0b2a18 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 16), personMat);
  torso.position.y = 0.21;
  listener.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), personMat);
  head.position.y = SRC_Y;
  listener.add(head);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), haloMat);
  halo.position.y = SRC_Y;
  listener.add(halo);
  const lisLabel = stage.label('', [0, 1.05, 0], '', listener);
  const boomLabel = stage.label('BOOM', [0, 1.55, 0], 'big', listener);
  boomLabel.visible = false;

  // =====================================================================
  // Wave rings on the ground
  // =====================================================================
  const ringPos = new Float32Array(NRING * CSEG * 2 * 3);
  const ringCol = new Float32Array(NRING * CSEG * 2 * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3).setUsage(THREE.DynamicDrawUsage));
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3).setUsage(THREE.DynamicDrawUsage));
  const rings = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rings.frustumCulled = false;
  rings.renderOrder = 2;
  scene.add(rings);
  const cosT = new Float32Array(CSEG + 1);
  const sinT = new Float32Array(CSEG + 1);
  for (let s = 0; s <= CSEG; s++) {
    cosT[s] = Math.cos((2 * Math.PI * s) / CSEG);
    sinT[s] = Math.sin((2 * Math.PI * s) / CSEG);
  }
  const cWave = new THREE.Color(WAVE);

  // Emission point of the sound heard now, and the line of sight from it
  const ghost = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.26, 32),
    new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  ghost.rotation.x = -Math.PI / 2;
  scene.add(ghost);
  const ghostPost = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: GHOST }));
  scene.add(ghostPost);
  const sightPos = new Float32Array(6);
  const sightGeo = new THREE.BufferGeometry();
  sightGeo.setAttribute('position', new THREE.BufferAttribute(sightPos, 3).setUsage(THREE.DynamicDrawUsage));
  const sight = new THREE.Line(sightGeo, new THREE.LineBasicMaterial({ color: GHOST, transparent: true, opacity: 0.7 }));
  sight.frustumCulled = false;
  scene.add(sight);
  const ghostLabel = stage.label('', [0, 0, 0], 'muted');

  // Mach cone (3D) and its trace on the ground
  const coneGeo = new THREE.ConeGeometry(1, 1, 72, 1, true);
  coneGeo.translate(0, -0.5, 0);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xc9d3e6, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.z = -Math.PI / 2;
  cone.frustumCulled = false;
  cone.renderOrder = 3;
  scene.add(cone);
  const wedgePos = new Float32Array(12);
  const wedgeGeo = new THREE.BufferGeometry();
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(wedgePos, 3).setUsage(THREE.DynamicDrawUsage));
  const wedge = new THREE.LineSegments(wedgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  wedge.frustumCulled = false;
  scene.add(wedge);
  const alphaLabel = stage.label('', [0, 0, 0], 'muted');

  // =====================================================================
  // Overlays: legend (left), pitch trace (right), boom flash
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Doppler pass-by</div>
<div>${sw(WAVE, '○ crests')} growing at c from where they left</div>
<div>${sw(PALETTE.green, '●')} listener, with the pitch heard now</div>
<div>${sw(GHOST, '◎')} where the sound heard now was emitted</div>
<div>${sw(0xc9d3e6, '▲ Mach cone')} above Mach 1</div>`;
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.width = 480;
  inset.height = 280;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '140px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const base = document.createElement('canvas');
  base.width = inset.width;
  base.height = inset.height;
  const bctx = base.getContext('2d')!;

  const flashEl = document.createElement('div');
  Object.assign(flashEl.style, {
    position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none', opacity: '0',
    background: 'radial-gradient(circle at 50% 55%, rgba(255,244,214,0.55), rgba(255,244,214,0) 65%)',
  } as CSSStyleDeclaration);
  viewport.appendChild(flashEl);

  const trFwd = new Float64Array(NS);
  const trRev = new Float64Array(NS);
  let yMax = 1.5;
  let yMin = 0.5;
  const PX0 = 16;
  const PX1 = 480 - 14;
  const PY0 = 50;
  const PY1 = 280 - 36;
  const xOfTau = (tau: number) => PX0 + ((tau + tau0) / (2 * tau0)) * (PX1 - PX0);
  const yOfR = (r: number) => PY1 - ((r - yMin) / (yMax - yMin)) * (PY1 - PY0);
  const roots = new Float64Array(2);

  function buildTrace(): void {
    let hi = 1;
    let lo = 1;
    for (let i = 0; i < NS; i++) {
      const tau = -tau0 + (2 * tau0 * i) / (NS - 1);
      const t = tau * k;
      const n = emissionTimes(p, t, roots);
      trFwd[i] = NaN;
      trRev[i] = NaN;
      for (let j = 0; j < n; j++) {
        const r = heardRatio(p, t, roots[j]);
        if (r >= 0) trFwd[i] = r;
        else trRev[i] = -r;
        if (Math.abs(r) < 4) { hi = Math.max(hi, Math.abs(r)); lo = Math.min(lo, Math.abs(r)); }
      }
    }
    const pad = Math.max(0.02, (hi - lo) * 0.08);
    yMax = Math.min(4, hi + pad);
    yMin = Math.max(0, lo - pad);
    const W = base.width;
    const H = base.height;
    bctx.clearRect(0, 0, W, H);
    bctx.font = '21px JetBrains Mono, monospace';
    bctx.fillStyle = '#8391ab';
    bctx.fillText("heard pitch f′ vs time", 14, 28);
    // Reference line at f
    bctx.strokeStyle = '#3a4660';
    bctx.lineWidth = 1.5;
    bctx.setLineDash([6, 6]);
    bctx.beginPath();
    bctx.moveTo(PX0, yOfR(1));
    bctx.lineTo(PX1, yOfR(1));
    bctx.stroke();
    bctx.beginPath();
    bctx.moveTo(xOfTau(0), PY0 - 4);
    bctx.lineTo(xOfTau(0), PY1);
    bctx.stroke();
    bctx.setLineDash([]);
    bctx.strokeStyle = '#243049';
    bctx.beginPath();
    bctx.moveTo(PX0, PY1 + 0.5);
    bctx.lineTo(PX1, PY1 + 0.5);
    bctx.stroke();
    bctx.fillStyle = '#56627c';
    bctx.font = '19px JetBrains Mono, monospace';
    bctx.fillText(`f = ${freq.toFixed(0)} Hz`, PX1 - 150, yOfR(1) - 8);
    bctx.fillText('closest', xOfTau(0) + 6, PY1 - 8);
    const span = tau0 * k;
    const tl = span < 1 ? `${(span * 1000).toFixed(0)} ms` : `${span.toFixed(1)} s`;
    bctx.fillText(`−${tl}`, PX0, H - 10);
    bctx.fillText(`+${tl}`, PX1 - bctx.measureText(`+${tl}`).width, H - 10);
    bctx.fillText(`${(yMax * freq).toFixed(0)} Hz`, PX0 + 2, PY0 + 10);
    bctx.fillText(`${(yMin * freq).toFixed(0)} Hz`, PX0 + 2, PY1 - 8);
    const path = (arr: Float64Array, color: string, dash: number[]) => {
      bctx.strokeStyle = color;
      bctx.lineWidth = 3;
      bctx.setLineDash(dash);
      bctx.beginPath();
      let pen = false;
      for (let i = 0; i < NS; i++) {
        const v = arr[i];
        if (!Number.isFinite(v)) { pen = false; continue; }
        const x = PX0 + (i / (NS - 1)) * (PX1 - PX0);
        const y = Math.min(PY1, Math.max(PY0 - 10, yOfR(v)));
        if (!pen) { bctx.moveTo(x, y); pen = true; } else bctx.lineTo(x, y);
      }
      bctx.stroke();
      bctx.setLineDash([]);
    };
    path(trRev, css(PALETTE.rose), [8, 6]);
    path(trFwd, css(PALETTE.cyan), []);
    if (mach > 1) {
      bctx.fillStyle = css(PALETTE.rose);
      bctx.fillText('dashed: heard reversed', PX0 + 150, PY0 + 10);
    }
  }

  function drawTrace(tau: number, r: number): void {
    ictx.clearRect(0, 0, inset.width, inset.height);
    ictx.drawImage(base, 0, 0);
    const x = xOfTau(Math.max(-tau0, Math.min(tau0, tau)));
    ictx.strokeStyle = 'rgba(223,230,243,0.45)';
    ictx.lineWidth = 1.5;
    ictx.beginPath();
    ictx.moveTo(x, PY0 - 4);
    ictx.lineTo(x, PY1);
    ictx.stroke();
    if (Number.isFinite(r)) {
      ictx.fillStyle = '#ffffff';
      ictx.beginPath();
      ictx.arc(x, Math.min(PY1, Math.max(PY0 - 10, yOfR(r))), 6, 0, 2 * Math.PI);
      ictx.fill();
    }
  }

  // =====================================================================
  // Audio (created only from a user click)
  // =====================================================================
  let actx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let amp: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let lastFrame = performance.now();

  function startAudio(): void {
    if (actx) {
      void actx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    osc = actx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    amp = actx.createGain();
    amp.gain.value = 0;
    osc.connect(amp).connect(actx.destination);
    osc.start();
    const len = Math.floor(actx.sampleRate * 1.4);
    noise = actx.createBuffer(1, len, actx.sampleRate);
    const ch = noise.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / actx.sampleRate;
      lp = 0.9 * lp + 0.1 * (Math.random() * 2 - 1);
      // A sharp N-like onset, then a rumbling decay
      const env = (tt < 0.004 ? tt / 0.004 : Math.exp(-tt / 0.28)) * (tt < 0.12 ? 1.6 : 1);
      ch[i] = lp * 3 * env;
    }
  }

  function stopAudio(): void {
    if (!actx || !amp) return;
    amp.gain.setTargetAtTime(0, actx.currentTime, 0.02);
    void actx.suspend();
  }

  function playBoom(): void {
    if (!audioOn || !actx || !noise) return;
    const src = actx.createBufferSource();
    src.buffer = noise;
    const lpf = actx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 500;
    const g = actx.createGain();
    g.gain.value = 0.9;
    src.connect(lpf).connect(g).connect(actx.destination);
    src.start();
    src.onended = () => { src.disconnect(); lpf.disconnect(); g.disconnect(); };
  }

  function setAudio(fHz: number, level: number): void {
    if (!audioOn || !actx || !osc || !amp) return;
    const now = actx.currentTime;
    osc.frequency.setTargetAtTime(Math.max(20, Math.min(8000, fHz)), now, 0.012);
    amp.gain.setTargetAtTime(level, now, 0.03);
  }

  const onVis = () => {
    if (!actx) return;
    if (document.hidden) void actx.suspend();
    else if (audioOn) void actx.resume();
  };
  document.addEventListener('visibilitychange', onVis);
  // Silence the tone if frames stop (for example when the scene scrolls offscreen)
  const watchdog = window.setInterval(() => {
    if (audioOn && actx && amp && performance.now() - lastFrame > 400) amp.gain.setTargetAtTime(0, actx.currentTime, 0.05);
  }, 300);

  // =====================================================================
  // Simulation
  // =====================================================================
  let tau = 0;
  let prevTau = 0;
  let flash = 0;
  let lampT = 0;
  // Live values
  let fHeard = freq;
  let ratio = 1;
  let ratioRev = NaN;
  let delay = 0;
  let resid = 0;
  let nRoots = 1;
  let approaching = false;
  let xe = 0;

  function derive(): void {
    p.c = MEDIA[medium];
    p.vs = mach * p.c;
    p.vo = mo * p.c;
    p.d = dist;
    const rel = mach + mo;
    cScr = Math.max(3, Math.min(22, 2.6 / Math.max(rel, 1e-6)));
    uS = mach * cScr;
    uO = mo * cScr;
    tau0 = rel < 0.02 ? 8 : HALF / (uS + uO);
    k = (SCALE * cScr) / p.c;
    const tb = boomTime(p);
    tauBoom = Number.isFinite(tb) ? tb / k : NaN;
    tauEnd = Number.isFinite(tauBoom) ? Math.max(tau0, tauBoom + 0.6) : tau0;
  }

  function onParams(keepPhase = true): void {
    const frac = tau0 > 0 ? tau / tau0 : -1;
    derive();
    tau = keepPhase ? Math.max(-1, Math.min(1, frac)) * tau0 : -tau0;
    prevTau = tau;
    if (mo === 0 && mach > 0) srcOnlyM = mach;
    if (mach === 0 && mo > 0) obsOnlyM = mo;
    amb.visible = mach < 1;
    jet.visible = mach >= 1;
    lane.visible = mo > 0;
    listener.position.z = dist / SCALE;
    srcLabel.element.textContent = `${mach >= 1 ? 'jet' : 'siren'} · ${freq.toFixed(0)} Hz`;
    alphaLabel.element.textContent = mach > 1 ? `Mach cone · α = ${(machAngle(mach) / DEG).toFixed(1)}°` : '';
    buildTrace();
    if (view === 'ear') flyView('ear', 0.6);
  }

  function drawRings(): void {
    const Tv = SPACING / cScr;
    let j = Math.floor(tau / Tv);
    let seg = 0;
    let oldest = 0;
    for (let n = 0; n < NRING; n++, j--) {
      const te = j * Tv;
      const age = tau - te;
      const r = cScr * age;
      if (r > RMAX) break;
      oldest = age;
      const cx = uS * te;
      const fade = Math.pow(1 - r / RMAX, 1.4) * Math.min(1, r / 0.25);
      const kk = 0.95 * fade;
      for (let s = 0; s < CSEG; s++) {
        const o = seg * 6;
        ringPos[o] = cx + r * cosT[s];
        ringPos[o + 1] = RING_Y;
        ringPos[o + 2] = r * sinT[s];
        ringPos[o + 3] = cx + r * cosT[s + 1];
        ringPos[o + 4] = RING_Y;
        ringPos[o + 5] = r * sinT[s + 1];
        ringCol[o] = ringCol[o + 3] = cWave.r * kk;
        ringCol[o + 1] = ringCol[o + 4] = cWave.g * kk;
        ringCol[o + 2] = ringCol[o + 5] = cWave.b * kk;
        seg++;
      }
    }
    ringGeo.setDrawRange(0, seg * 2);
    (ringGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ringGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Mach cone: apex at the source, reaching back to where the oldest ring is tangent
    const sup = mach > 1;
    cone.visible = sup;
    wedge.visible = sup;
    alphaLabel.visible = sup;
    if (sup) {
      const a = machAngle(mach);
      const L = uS * oldest;
      const h = L * Math.cos(a) ** 2;
      const xs = uS * tau;
      cone.position.set(xs, SRC_Y, 0);
      cone.scale.set(h * Math.tan(a), h, h * Math.tan(a));
      wedgePos[0] = xs; wedgePos[1] = RING_Y + 0.01; wedgePos[2] = 0;
      wedgePos[3] = xs - h; wedgePos[4] = RING_Y + 0.01; wedgePos[5] = h * Math.tan(a);
      wedgePos[6] = xs; wedgePos[7] = RING_Y + 0.01; wedgePos[8] = 0;
      wedgePos[9] = xs - h; wedgePos[10] = RING_Y + 0.01; wedgePos[11] = -h * Math.tan(a);
      (wedgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      alphaLabel.position.set(xs - 2.2, 0.1, -2.2 * Math.tan(a) - 0.5);
    }
  }

  let lisText = '';
  let ghostText = '';
  const setText = (o: { element: HTMLElement }, s: string, prev: string): string => {
    if (s !== prev) o.element.textContent = s;
    return s;
  };

  function solve(): void {
    const t = tau * k;
    nRoots = emissionTimes(p, t, roots);
    if (nRoots === 0) {
      ratio = NaN;
      ratioRev = NaN;
      fHeard = NaN;
      delay = NaN;
      resid = 0;
      approaching = false;
      return;
    }
    // Forward-playing root for the main readout, time-reversed root reported separately
    let iF = -1;
    let iR = -1;
    for (let j = 0; j < nRoots; j++) {
      const r = heardRatio(p, t, roots[j]);
      if (r >= 0 && iF < 0) iF = j;
      else if (r < 0 && iR < 0) iR = j;
    }
    const main = iF >= 0 ? iF : 0;
    const te = roots[main];
    ratio = heardRatio(p, t, te);
    ratioRev = iR >= 0 ? -heardRatio(p, t, roots[iR]) : NaN;
    fHeard = freq * ratio;
    delay = t - te;
    resid = residual(p, t, te);
    approaching = ratio > 1 && (mach === 0 ? tau < 0 : emissionCos(p, t, te) > 0);
    xe = (p.vs * te) / SCALE;
  }

  function place(): void {
    const xs = uS * tau;
    const xl = -uO * tau;
    source.position.set(xs, 0, 0);
    listener.position.x = xl;
    const has = nRoots > 0;
    ghost.visible = has;
    ghostPost.visible = has;
    sight.visible = has;
    ghostLabel.visible = has && delay > 0;
    if (has) {
      ghost.position.set(xe, RING_Y + 0.005, 0);
      ghostPost.position.set(xe, SRC_Y, 0);
      sightPos[0] = xe; sightPos[1] = SRC_Y; sightPos[2] = 0;
      sightPos[3] = xl; sightPos[4] = SRC_Y; sightPos[5] = dist / SCALE;
      (sightGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      ghostLabel.position.set(xe, 0.02, -1.25);
      const dl = delay < 1 ? `${(delay * 1000).toFixed(0)} ms` : `${delay.toFixed(2)} s`;
      ghostText = setText(ghostLabel, `sent ${dl} ago`, ghostText);
    }
    let s: string;
    if (!has) s = 'silence · cone on its way';
    else if (Number.isFinite(ratioRev)) s = `hearing ${fHeard.toFixed(0)} Hz + ${(ratioRev * freq).toFixed(0)} Hz reversed`;
    else s = `hearing ${fHeard.toFixed(0)} Hz`;
    lisText = setText(lisLabel, s, lisText);
  }

  stage.onFrame((dt) => {
    lastFrame = performance.now();
    if (playing) {
      prevTau = tau;
      tau += dt;
      if (Number.isFinite(tauBoom) && prevTau < tauBoom && tau >= tauBoom) {
        flash = 1;
        boomHeard = true;
        playBoom();
      }
      if (tau > tauEnd) {
        tau = -tau0;
        prevTau = tau;
      }
    }
    solve();
    place();
    drawRings();
    drawTrace(tau, ratio);

    // Flashing lamps
    lampT += dt;
    const on = Math.floor(lampT * 4) % 2 === 0;
    redMat.emissiveIntensity = on ? 2.2 : 0.15;
    blueMat.emissiveIntensity = on ? 0.15 : 2.2;
    flame.scale.setScalar(0.85 + 0.3 * Math.random());

    // Boom flash
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    flashEl.style.opacity = flash > 0 ? String(flash * 0.9) : '0';
    haloMat.opacity = flash * 0.5;
    halo.scale.setScalar(0.2 + (1 - flash) * 1.4);
    boomLabel.visible = flash > 0.05;

    // Audio: loudness falls off with distance to the emission point
    if (audioOn) {
      if (Number.isFinite(fHeard) && playing) {
        const R = Math.max(1, p.c * delay);
        setAudio(fHeard, 0.16 * Math.max(0.15, Math.min(1, 12 / R)));
      } else setAudio(freq, 0);
    }
    updateReadouts();
  });

  // =====================================================================
  // Controls
  // =====================================================================
  const CAM: Record<Exclude<View, 'ear'>, [[number, number, number], [number, number, number]]> = {
    street: [[-1.2, 5.2, 11.5], [0, 0, 1.2]],
    top: [[0, 25, 0.8], [0, 0, 0.8]],
  };
  function flyView(v: View, secs = 1.2): void {
    if (v === 'ear') {
      const z = dist / SCALE;
      stage.flyTo([2.2, 1.4, z + 3.6], [-3.5, 0.4, 0], secs);
    } else stage.flyTo(CAM[v][0], CAM[v][1], secs);
  }

  const ui = new Panel(panel);
  ui.section('Source');
  ui.slider({
    key: 'mach', label: 'Source speed (Mach)', min: 0, max: 2, step: 0.01, value: mach,
    format: (v) => `M ${v.toFixed(2)}`,
    onInput: (v) => { mach = v; onParams(); },
  });
  ui.slider({
    key: 'freq', label: 'Source frequency f', min: 200, max: 1200, step: 10, value: freq, unit: 'Hz',
    onInput: (v) => { freq = v; onParams(); },
  });
  ui.select<Medium>({
    key: 'medium', label: 'Medium', value: medium,
    options: [{ value: 'air', label: 'Air 343 m/s' }, { value: 'water', label: 'Water 1480 m/s' }],
    onChange: (v) => { medium = v; onParams(); },
  });

  ui.section('Listener');
  ui.slider({
    key: 'dist', label: 'Distance from the road', min: 8, max: 60, step: 1, value: dist, unit: 'm',
    onInput: (v) => { dist = v; onParams(); },
  });
  ui.slider({
    key: 'vo', label: 'Listener speed toward source', min: 0, max: 0.9, step: 0.01, value: mo,
    format: (v) => `M ${v.toFixed(2)}`,
    onInput: (v) => { mo = v; onParams(); },
  });

  ui.section('Sound and view');
  ui.toggle({
    key: 'audio', label: 'Sound on (click again to mute)', value: audioOn,
    onChange: (v) => {
      audioOn = v;
      if (v) startAudio();
      else stopAudio();
    },
  });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'street', label: 'Street' }, { value: 'top', label: 'Top down' }, { value: 'ear', label: 'Listener' }],
    onChange: (v) => { view = v; flyView(v); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Restart pass', onClick: () => { tau = -tau0; prevTau = tau; } },
  ]);
  ui.note('The scene runs in slow motion (see time rate). Crests are drawn far fewer per second than the true pitch, but their spacing ahead and behind is to scale.');

  ui.section('Live readouts');
  const rF = ui.readout('fHeard', "heard f′");
  const rRatio = ui.readout('ratio', "f′ / f");
  const rDelay = ui.readout('delay', 'sound travel time');
  const rVs = ui.readout('vsms', 'source speed');
  const rVo = ui.readout('voms', 'listener speed');
  const rAlpha = ui.readout('alpha', 'Mach angle α');
  const rSrc = ui.readout('shiftSrc', 'approach shift, source moving');
  const rObs = ui.readout('shiftObs', 'approach shift, listener moving');
  const rRate = ui.readout('timeRate', 'time rate');
  const rRes = ui.readout('resid', 'solver residual');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'heard pitch' },
    { color: css(PALETTE.rose), label: 'emission point / reversed' },
  ]);

  function updateReadouts(): void {
    rF(Number.isFinite(fHeard) ? `${fHeard.toFixed(1)} Hz` : 'silent');
    rRatio(Number.isFinite(ratio) ? ratio.toFixed(3) : '…');
    rDelay(Number.isFinite(delay) ? (delay < 1 ? `${(delay * 1000).toFixed(0)} ms` : `${delay.toFixed(2)} s`) : '…');
    rVs(`${p.vs.toFixed(0)} m/s (${(p.vs * 3.6).toFixed(0)} km/h)`);
    rVo(`${p.vo.toFixed(0)} m/s`);
    rAlpha(mach > 1 ? `${(machAngle(mach) / DEG).toFixed(1)}°` : mach === 1 ? '90° (pile-up)' : 'subsonic');
    rSrc(mach < 1 ? `× ${(1 / (1 - mach)).toFixed(3)} (M ${mach.toFixed(2)})` : '∞ (M ≥ 1)');
    rObs(`× ${(1 + mo).toFixed(3)} (M ${mo.toFixed(2)})`);
    rRate(`× ${k.toFixed(2)}`);
    rRes(nRoots > 0 ? resid.toExponential(0) : '…');
  }

  derive();
  tau = -0.55 * tau0;
  onParams();

  return {
    state: () => ({
      mach,
      mo,
      freq,
      dist,
      medium,
      view,
      audioOn,
      ratio: Number.isFinite(ratio) ? ratio : 0,
      fHeard: Number.isFinite(fHeard) ? fHeard : 0,
      approaching,
      boomHeard,
      alphaDeg: mach > 1 ? machAngle(mach) / DEG : 0,
      srcOnlyM,
      obsOnlyM,
      delay: Number.isFinite(delay) ? delay : 0,
    }),
    dispose: () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(watchdog);
      if (osc) { try { osc.stop(); } catch { /* already stopped */ } }
      if (actx) void actx.close();
      actx = null;
      legend.remove();
      inset.remove();
      flashEl.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'doppler-effect',
  number: 65,
  title: 'The Doppler Effect',
  domain: 'fluids',
  level: 1,
  status: 'live',
  tagline: 'The rising and falling pitch of a passing siren, and sonic booms.',
  content,
  mount,
};

export default topic;
