import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AE_EXP, AE_EXP_SIGMA, MAX_ORDER, aePrediction, anomalyFreq, bohrRadius, comptonWavelength,
  cyclotronFreq, invAlpha, schwinger, spinFreq, trapPosition, type AlphaSource, type TrapMotion,
} from './physics.ts';

type View = 'cloud' | 'spin' | 'trap' | 'scale';

const DEG = Math.PI / 180;
/** Scene precession: turns per second per tesla. The real electron makes 28 billion. */
const PREC_VIS = 0.35;
const N_EVENTS = 260;
/** Events shown per QED order: more loops, a busier cloud. */
const EVENTS_AT_ORDER = [0, 80, 150, 200, 235, 250, 260];
const CLOUD_R = 1.7;
const TILT = 35 * DEG;
const SPIN_LEN = 1.7;
const WIN_R = 1.9; // scale view: window radius in scene units equals 10^zoom metres
const LAD_X = -3.5;
const ladY = (e: number) => 1.5 + (e * 4.9) / 18;

const CAMS: Record<View, [[number, number, number], [number, number, number]]> = {
  cloud: [[0.4, 0.9, 6.4], [0, -0.25, 0]],
  spin: [[4.4, 3.4, 6.8], [0, 0.35, 0]],
  trap: [[5.2, 3.0, 6.8], [0, -0.1, 0]],
  scale: [[-0.5, -0.3, 9.2], [-0.5, -0.3, 0]],
};

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '.': '·' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');
const sci = (x: number, d = 2) => {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  return `${(x / 10 ** e).toFixed(d)}×10${sup(e)}`;
};

const ORDER_NAMES = ['Dirac, g = 2', 'Schwinger, 1 loop', '2 loops', '3 loops', '4 loops', '5 loops', '+ μ, τ, hadrons, weak'];

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrow(color: number, shaftR: number, headR: number, headLen: number, len: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, len - headLen, 14), mat);
  shaft.position.y = (len - headLen) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 20), mat);
  head.position.y = len - headLen / 2;
  g.add(shaft, head);
  return g;
}

function circleLine(r: number, n: number, color: number, opacity: number): THREE.Line {
  const a = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    a[i * 3] = Math.cos(t) * r;
    a[i * 3 + 1] = Math.sin(t) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAMS.cloud[0], target: CAMS.cloud[1], fov: 42 });
  const { scene } = stage;
  const glow = glowTexture();

  // --- State
  let view: View = 'cloud';
  let B = 0.5;
  let order = 1;
  let alphaSrc: AlphaSource = 'cs';
  let zoomExp = 0;
  let trapLoaded = false;
  let trapT = 0;
  let spinPhase = 0;

  // =====================================================================
  // CLOUD VIEW: a point with a heuristic haze of virtual particles
  // =====================================================================
  const cloud = new THREE.Group();
  scene.add(cloud);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  cloud.add(core);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  coreGlow.scale.setScalar(0.75);
  cloud.add(coreGlow);

  const hazeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x4a78c8) }, uAmt: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAmt; varying vec3 vN; varying vec3 vV;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor, uAmt * 0.22 * pow(f, 2.5)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const haze = new THREE.Mesh(new THREE.SphereGeometry(CLOUD_R, 48, 32), hazeMat);
  cloud.add(haze);
  const comptonRing = circleLine(CLOUD_R, 128, 0x5a7bb0, 0.5);
  cloud.add(comptonRing);

  // Virtual events: photons that leave and return, pairs that split and rejoin.
  const evPos = new Float32Array(N_EVENTS * 2 * 3);
  const evCol = new Float32Array(N_EVENTS * 2 * 3);
  const evGeo = new THREE.BufferGeometry();
  evGeo.setAttribute('position', new THREE.BufferAttribute(evPos, 3));
  evGeo.setAttribute('color', new THREE.BufferAttribute(evCol, 3));
  const evMat = new THREE.PointsMaterial({ size: 0.13, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const events = new THREE.Points(evGeo, evMat);
  events.frustumCulled = false;
  cloud.add(events);
  const evKind = new Uint8Array(N_EVENTS); // 0 photon, 1 pair, 2 heavy (muon / hadron) loop
  const evU = new Float32Array(N_EVENTS);
  const evDur = new Float32Array(N_EVENTS);
  const evC = new Float32Array(N_EVENTS * 3); // photon: direction * reach. pair: centre
  const evA = new Float32Array(N_EVENTS * 3); // pair axis
  const cAmber = new THREE.Color(PALETTE.amber);
  const cCyan = new THREE.Color(PALETTE.cyan);
  const cRose = new THREE.Color(PALETTE.rose);
  const cGreen = new THREE.Color(PALETTE.green);

  function spawn(i: number, randomPhase: boolean): void {
    const heavy = i >= EVENTS_AT_ORDER[5];
    evKind[i] = heavy ? 2 : Math.random() < 0.55 ? 0 : 1;
    evU[i] = randomPhase ? Math.random() : 0;
    evDur[i] = 0.7 + Math.random() * 1.3;
    const z = 2 * Math.random() - 1;
    const ph = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    // Density falls off with distance. Most of the activity is near the core.
    const r = CLOUD_R * Math.min(1, 0.12 + -0.38 * Math.log(1 - 0.95 * Math.random()));
    const rr = heavy ? r * 0.25 : r;
    evC[i * 3] = s * Math.cos(ph) * rr;
    evC[i * 3 + 1] = z * rr;
    evC[i * 3 + 2] = s * Math.sin(ph) * rr;
    const az = 2 * Math.random() - 1;
    const ap = Math.random() * Math.PI * 2;
    const as = Math.sqrt(1 - az * az);
    evA[i * 3] = as * Math.cos(ap);
    evA[i * 3 + 1] = az;
    evA[i * 3 + 2] = as * Math.sin(ap);
  }
  for (let i = 0; i < N_EVENTS; i++) spawn(i, true);

  function stepCloud(dt: number): void {
    const n = EVENTS_AT_ORDER[order];
    for (let i = 0; i < N_EVENTS; i++) {
      const j = i * 6;
      if (i >= n) {
        evCol[j] = evCol[j + 1] = evCol[j + 2] = evCol[j + 3] = evCol[j + 4] = evCol[j + 5] = 0;
        continue;
      }
      evU[i] += dt / evDur[i];
      if (evU[i] >= 1) spawn(i, false);
      const u = evU[i];
      const b = Math.sin(Math.PI * u);
      const cx = evC[i * 3], cy = evC[i * 3 + 1], cz = evC[i * 3 + 2];
      if (evKind[i] === 0) {
        // Virtual photon: emitted by the core, flies out, is reabsorbed.
        evPos[j] = cx * b; evPos[j + 1] = cy * b; evPos[j + 2] = cz * b;
        evPos[j + 3] = evPos[j]; evPos[j + 4] = evPos[j + 1]; evPos[j + 5] = evPos[j + 2];
        const k = 0.9 * b;
        evCol[j] = cAmber.r * k; evCol[j + 1] = cAmber.g * k; evCol[j + 2] = cAmber.b * k;
        evCol[j + 3] = evCol[j + 4] = evCol[j + 5] = 0;
      } else {
        // Pair: appears from nothing, splits, rejoins and vanishes.
        const d = (evKind[i] === 2 ? 0.07 : 0.16) * b;
        const ax = evA[i * 3] * d, ay = evA[i * 3 + 1] * d, azz = evA[i * 3 + 2] * d;
        evPos[j] = cx + ax; evPos[j + 1] = cy + ay; evPos[j + 2] = cz + azz;
        evPos[j + 3] = cx - ax; evPos[j + 4] = cy - ay; evPos[j + 5] = cz - azz;
        const k = b;
        const c1 = evKind[i] === 2 ? cGreen : cCyan;
        const c2 = evKind[i] === 2 ? cGreen : cRose;
        evCol[j] = c1.r * k; evCol[j + 1] = c1.g * k; evCol[j + 2] = c1.b * k;
        evCol[j + 3] = c2.r * k; evCol[j + 4] = c2.g * k; evCol[j + 5] = c2.b * k;
      }
    }
    (evGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (evGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  const cloudLabels = [
    stage.label('e⁻  a point, no structure seen above 10⁻¹⁸ m', [0.12, 0.2, 0], 'big', cloud),
    stage.label(`ring ≈ reduced Compton wavelength ƛ = ${sci(comptonWavelength() / (2 * Math.PI), 1)} m`, [0, -CLOUD_R - 0.22, 0], 'muted', cloud),
    stage.label('haze: heuristic picture of virtual photons and e⁺e⁻ pairs (vacuum polarization)', [0, -CLOUD_R - 0.5, 0], 'muted', cloud),
  ];
  cloudLabels[0].element.style.color = css(PALETTE.cyan);
  cloudLabels[0].center.set(0, 1);

  // =====================================================================
  // SPIN VIEW: precession of S (and the opposite magnetic moment) about B
  // =====================================================================
  const spin = new THREE.Group();
  spin.scale.setScalar(0.72);
  spin.position.y = -0.25;
  scene.add(spin);
  const eBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 16), new THREE.MeshStandardMaterial({ color: PALETTE.cyan, emissive: PALETTE.cyan, emissiveIntensity: 0.6 }));
  spin.add(eBall);
  const bArrows = new THREE.Group();
  spin.add(bArrows);
  const bMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.5 });
  const bLinePos = new Float32Array(9 * 6);
  let bi = 0;
  for (const x of [-1.7, 0, 1.7]) {
    for (const z of [-1.7, 0, 1.7]) {
      if (x === 0 && z === 0) continue;
      bLinePos.set([x, -1.6, z, x, 2.3, z], bi * 6);
      bi++;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 12), new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.7 }));
      head.position.set(x, 2.3, z);
      bArrows.add(head);
    }
  }
  const bLineGeo = new THREE.BufferGeometry();
  bLineGeo.setAttribute('position', new THREE.BufferAttribute(bLinePos.subarray(0, bi * 6), 3));
  bArrows.add(new THREE.LineSegments(bLineGeo, bMat));
  const bAxis = arrow(PALETTE.violet, 0.018, 0.08, 0.24, 2.7);
  bAxis.position.y = -0.3;
  spin.add(bAxis);
  const bLab = stage.label('B', [0, 2.55, 0], 'big', spin);
  bLab.element.style.color = css(PALETTE.violet);

  const sPivot = new THREE.Group();
  spin.add(sPivot);
  const sArrow = arrow(PALETTE.amber, 0.035, 0.11, 0.3, SPIN_LEN);
  sArrow.rotation.z = -TILT;
  sPivot.add(sArrow);
  const muArrow = arrow(PALETTE.rose, 0.03, 0.09, 0.24, 1.15);
  muArrow.rotation.z = Math.PI - TILT;
  sPivot.add(muArrow);
  const sLab = stage.label('spin S', [Math.sin(TILT) * (SPIN_LEN + 0.25), Math.cos(TILT) * (SPIN_LEN + 0.25), 0], 'big', sPivot);
  sLab.element.style.color = css(PALETTE.amber);
  const muLab = stage.label('μ = −g μ_B S/ħ', [-Math.sin(TILT) * 1.45, -Math.cos(TILT) * 1.45, 0], '', sPivot);
  muLab.element.style.color = css(PALETTE.rose);
  const cone = circleLine(Math.sin(TILT) * SPIN_LEN, 96, 0x8391ab, 0.45);
  cone.rotation.x = Math.PI / 2;
  cone.position.y = Math.cos(TILT) * SPIN_LEN;
  spin.add(cone);
  const sTrail = new Trail(220, PALETTE.amber, 0.9);
  spin.add(sTrail.line);
  const precLab = stage.label('', [0, -2.15, 0], 'muted', spin);

  // =====================================================================
  // TRAP VIEW: a Penning trap with one electron
  // =====================================================================
  const trap = new THREE.Group();
  scene.add(trap);
  const RHO0 = 1.5;
  const Z0 = RHO0 / Math.SQRT2;
  const ringPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const z = -0.85 + (1.7 * i) / 24;
    ringPts.push(new THREE.Vector2(Math.sqrt(RHO0 * RHO0 + 2 * z * z), z));
  }
  const capPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const r = (1.75 * i) / 24;
    capPts.push(new THREE.Vector2(r, Math.sqrt(Z0 * Z0 + (r * r) / 2)));
  }
  const metal = new THREE.MeshStandardMaterial({ color: 0xc98a4b, metalness: 0.75, roughness: 0.32, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false });
  const CUT = 1.45 * Math.PI;
  const ring = new THREE.Mesh(new THREE.LatheGeometry(ringPts, 72, Math.PI * 0.3, CUT), metal);
  const capTop = new THREE.Mesh(new THREE.LatheGeometry(capPts, 72, Math.PI * 0.3, CUT), metal);
  const capBot = capTop.clone();
  capBot.scale.y = -1;
  trap.add(ring, capTop, capBot);
  const trapB = new THREE.Group();
  trap.add(trapB);
  const tbPos = new Float32Array(6 * 6);
  let ti = 0;
  for (const [x, z] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35], [2.6, 0], [-2.6, 0]] as [number, number][]) {
    tbPos.set([x, -2.4, z, x, 2.4, z], ti * 6);
    ti++;
  }
  const tbGeo = new THREE.BufferGeometry();
  tbGeo.setAttribute('position', new THREE.BufferAttribute(tbPos, 3));
  trapB.add(new THREE.LineSegments(tbGeo, new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.35 })));
  const tbLab = stage.label('uniform B along the axis', [0, 2.65, 0], 'muted', trap);
  tbLab.element.style.color = css(PALETTE.violet);
  stage.label('ring electrode', [RHO0 + 0.95, 0.1, 0.6], 'muted', trap);
  stage.label('endcap', [0.9, Z0 + 0.95, 0.9], 'muted', trap);
  stage.label('endcap', [0.9, -Z0 - 0.95, 0.9], 'muted', trap);

  const eTrap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const eTrapGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x7fe0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  eTrapGlow.scale.setScalar(0.5);
  eTrap.add(eTrapGlow);
  eTrapGlow.renderOrder = 3;
  trap.add(eTrap);
  const tTrail = new Trail(1400, PALETTE.cyan, 1);
  trap.add(tTrail.line);
  const trapMotion: TrapMotion = { rc: 0.13, rm: 0.5, az: 0.55, wc: 13, wm: 0.42, wz: 3.1 };
  const tp = new Float64Array(3);
  const eLab = stage.label('', [0, 0, 0], 'muted', trap);

  // =====================================================================
  // SCALE VIEW: a ladder from 1 m to 1e-18 m and a zooming window
  // =====================================================================
  const scale = new THREE.Group();
  scene.add(scale);
  const ladPos: number[] = [LAD_X, ladY(0), 0, LAD_X, ladY(-18), 0];
  for (let e = 0; e >= -18; e--) {
    const w = e % 3 === 0 ? 0.16 : 0.08;
    ladPos.push(LAD_X - w, ladY(e), 0, LAD_X + w, ladY(e), 0);
  }
  const ladGeo = new THREE.BufferGeometry();
  ladGeo.setAttribute('position', new THREE.Float32BufferAttribute(ladPos, 3));
  scale.add(new THREE.LineSegments(ladGeo, new THREE.LineBasicMaterial({ color: 0x5a7bb0, transparent: true, opacity: 0.8 })));
  for (let e = 0; e >= -18; e -= 3) {
    const l = stage.label(`10${sup(e)} m`, [LAD_X - 0.28, ladY(e), 0], 'muted', scale);
    l.center.set(1, 0.5);
  }
  const marks: { e: number; text: string; color: number; dy?: number }[] = [
    { e: 0, text: 'you, about 1 m', color: PALETTE.text },
    { e: Math.log10(2 * bohrRadius()), text: 'hydrogen atom, 1.1×10⁻¹⁰ m', color: PALETTE.cyan },
    { e: Math.log10(comptonWavelength()), text: `Compton λ_C, ${sci(comptonWavelength(), 2)} m (not a size)`, color: 0x8391ab },
    { e: Math.log10(1.4e-14), text: 'gold nucleus, about 1.4×10⁻¹⁴ m', color: PALETTE.amber, dy: 0.07 },
    { e: Math.log10(1.68e-15), text: 'proton, 1.7×10⁻¹⁵ m across', color: PALETTE.rose, dy: -0.07 },
    { e: -18, text: 'electron size limit, about 10⁻¹⁸ m', color: PALETTE.green },
  ];
  const dotGeo = new THREE.SphereGeometry(0.06, 12, 8);
  for (const m of marks) {
    const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: m.color }));
    d.position.set(LAD_X, ladY(m.e), 0);
    scale.add(d);
    const l = stage.label(m.text, [LAD_X + 0.24, ladY(m.e) + (m.dy ?? 0), 0], '', scale);
    l.center.set(0, 0.5);
    l.element.style.color = css(m.color);
    l.element.style.fontSize = '11px';
    l.element.style.background = 'transparent';
  }
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.19, 32), new THREE.MeshBasicMaterial({ color: PALETTE.white, side: THREE.DoubleSide }));
  scale.add(cursor);

  const WIN_X = 1.5;
  const win = new THREE.Group();
  win.position.set(WIN_X, 0, 0);
  scale.add(win);
  win.add(circleLine(WIN_R, 128, 0x46587c, 0.9));
  const winLab = stage.label('', [0, -WIN_R - 0.3, 0], 'big', win);
  interface ZoomObj { size: number; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: ReturnType<typeof stage.label>; base: number }
  const zoomObjs: ZoomObj[] = [];
  const addZoom = (radius: number, color: number, base: number, text: string, wire = false) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: base, depthWrite: false, roughness: 0.6, wireframe: wire, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, wire ? 16 : 40, wire ? 12 : 28), mat);
    win.add(mesh);
    const label = stage.label(text, [0, 0, 0], '', win);
    label.element.style.color = css(color);
    label.center.set(0, 1);
    zoomObjs.push({ size: radius, mesh, mat, label, base });
  };
  addZoom(1.44e-10, PALETTE.cyan, 0.16, 'gold atom');
  addZoom(7.0e-15, PALETTE.amber, 0.4, 'gold nucleus');
  addZoom(0.84e-15, PALETTE.rose, 0.8, 'proton');
  addZoom(1e-18, PALETTE.green, 0.7, 'electron limit', true);
  const ePoint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  ePoint.scale.setScalar(0.22);
  ePoint.position.set(-1.0, -1.25, 0.1);
  win.add(ePoint);
  const ePointLab = stage.label('an electron: still a point', [-0.86, -1.25, 0.1], 'muted', win);
  ePointLab.center.set(0, 0.5);

  function layoutScale(): void {
    cursor.position.set(LAD_X, ladY(zoomExp), 0.01);
    winLab.element.textContent = `window radius: 10${sup(Math.round(zoomExp * 10) / 10)} m`;
    const fov = 10 ** zoomExp;
    for (const o of zoomObjs) {
      const R = (WIN_R * o.size) / fov;
      const vis = R > 0.004 && R < 40;
      o.mesh.visible = vis;
      o.mesh.scale.setScalar(Math.max(R, 0.004));
      const fade = Math.min(1, Math.max(0, (5 - R) / 3.5));
      o.mat.opacity = o.base * (0.12 + 0.88 * fade);
      const showLab = R > 0.05 && R < 4;
      o.label.visible = showLab;
      if (showLab) o.label.position.set(R * 0.72, R * 0.72, 0);
    }
  }

  // =====================================================================
  // OVERLAYS
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const insetStyle = {
    position: 'absolute', right: '10px', width: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const chart = document.createElement('canvas');
  chart.width = 500;
  chart.height = 300;
  Object.assign(chart.style, { ...insetStyle, top: '10px', height: '150px' } as CSSStyleDeclaration);
  viewport.appendChild(chart);
  const cctx = chart.getContext('2d')!;

  const sg = document.createElement('canvas');
  sg.width = 500;
  sg.height = 250;
  Object.assign(sg.style, { ...insetStyle, bottom: '10px', height: '125px' } as CSSStyleDeclaration);
  viewport.appendChild(sg);
  const sctx = sg.getContext('2d')!;

  function drawChart(): void {
    const W = chart.width, Hh = chart.height;
    cctx.clearRect(0, 0, W, Hh);
    cctx.font = '22px JetBrains Mono, monospace';
    cctx.fillStyle = '#8391ab';
    cctx.fillText('|prediction − measurement|', 16, 30);
    const x0 = 64, x1 = W - 14, y0 = 48, y1 = Hh - 44;
    const LO = -14, HI = -2;
    const yOf = (lg: number) => y1 - ((Math.max(LO, Math.min(HI, lg)) - LO) / (HI - LO)) * (y1 - y0);
    cctx.lineWidth = 1;
    for (const lg of [-3, -6, -9, -12]) {
      cctx.strokeStyle = '#243049';
      cctx.beginPath();
      cctx.moveTo(x0, yOf(lg));
      cctx.lineTo(x1, yOf(lg));
      cctx.stroke();
      cctx.fillStyle = '#56627c';
      cctx.fillText(`1e${lg}`, 8, yOf(lg) + 7);
    }
    // Target 1e-9 and measurement uncertainty.
    cctx.setLineDash([8, 6]);
    cctx.strokeStyle = css(PALETTE.amber);
    cctx.beginPath();
    cctx.moveTo(x0, yOf(-9));
    cctx.lineTo(x1, yOf(-9));
    cctx.stroke();
    cctx.strokeStyle = css(PALETTE.green);
    cctx.beginPath();
    cctx.moveTo(x0, yOf(Math.log10(AE_EXP_SIGMA)));
    cctx.lineTo(x1, yOf(Math.log10(AE_EXP_SIGMA)));
    cctx.stroke();
    cctx.setLineDash([]);
    const ia = invAlpha(alphaSrc);
    const n = MAX_ORDER + 1;
    const bw = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      const gap = Math.abs(aePrediction(k, ia) - AE_EXP);
      const y = yOf(Math.log10(gap));
      const x = x0 + k * bw + bw * 0.18;
      const w = bw * 0.64;
      cctx.fillStyle = k === order ? css(PALETTE.cyan) : k < order ? '#35507a' : 'rgba(53,80,122,0.25)';
      cctx.fillRect(x, y, w, y1 - y);
      cctx.fillStyle = k === order ? '#dfe6f3' : '#56627c';
      cctx.fillText(k === 0 ? 'D' : k === MAX_ORDER ? '+' : String(k), x + w / 2 - 7, Hh - 16);
    }
    cctx.fillStyle = css(PALETTE.amber);
    cctx.fillText('1e-9 goal', x1 - 118, yOf(-9) - 6);
    cctx.fillStyle = css(PALETTE.green);
    cctx.fillText('exp. error', x1 - 130, yOf(Math.log10(AE_EXP_SIGMA)) - 6);
  }

  function drawSG(): void {
    const W = sg.width, Hh = sg.height;
    sctx.clearRect(0, 0, W, Hh);
    sctx.font = '22px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    sctx.fillText('Stern–Gerlach screen, silver', 16, 32);
    const cx = 170, cy = 140;
    // Classical expectation: a continuous smear.
    sctx.setLineDash([6, 6]);
    sctx.strokeStyle = '#56627c';
    sctx.lineWidth = 2;
    sctx.strokeRect(cx - 90, cy - 70, 180, 140);
    sctx.setLineDash([]);
    // Observed: two lobes, one per spin state.
    for (const s of [-1, 1]) {
      const g = sctx.createRadialGradient(cx, cy + s * 48, 2, cx, cy + s * 48, 80);
      g.addColorStop(0, s < 0 ? 'rgba(245,182,66,0.95)' : 'rgba(79,209,232,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.ellipse(cx, cy + s * 48, 86, 20, 0, 0, Math.PI * 2);
      sctx.fill();
    }
    sctx.fillStyle = '#dfe6f3';
    sctx.fillText('two spots:', 290, 104);
    sctx.fillStyle = css(PALETTE.amber);
    sctx.fillText('spin up', 290, 134);
    sctx.fillStyle = css(PALETTE.cyan);
    sctx.fillText('spin down', 290, 164);
    sctx.fillStyle = '#56627c';
    sctx.fillText('dashed: classical smear', 16, Hh - 14);
  }
  drawSG();

  function drawLegend(): void {
    let body = '';
    if (view === 'cloud') {
      body = `<div>A point charge. The haze is a <b>heuristic</b> for vacuum polarization, not a picture of real objects.</div>
<div style="margin-top:3px"><span style="color:${css(PALETTE.amber)}">●</span> virtual photon &nbsp;<span style="color:${css(PALETTE.cyan)}">●</span><span style="color:${css(PALETTE.rose)}">●</span> e⁻e⁺ pair${order >= MAX_ORDER ? ` &nbsp;<span style="color:${css(PALETTE.green)}">●</span> μ, τ, hadron loops` : ''}</div>
<div style="color:#8391ab">Each QED order adds more.</div>`;
    } else if (view === 'spin') {
      body = `<div><span style="color:${css(PALETTE.amber)}">spin S</span> precesses about <span style="color:${css(PALETTE.violet)}">B</span>. The <span style="color:${css(PALETTE.rose)}">moment μ</span> points the other way because the charge is negative.</div>
<div style="color:#8391ab">Shown slowed by about 10¹¹.</div>`;
    } else if (view === 'trap') {
      body = `<div>One electron in a Penning trap. B holds it sideways, the electrodes hold it along the axis.</div>
<div style="margin-top:3px">fast small circles: <b>cyclotron</b><br/>up and down: <b>axial</b><br/>slow wide drift: <b>magnetron</b></div>
<div style="color:#8391ab">Slowed and exaggerated to be visible.</div>`;
    } else {
      body = `<div>Each step on the ladder is ten times smaller. The window on the right zooms with the slider.</div>
<div>Zoom to 10⁻¹⁸ m. Still no surface on the electron.</div>
<div style="color:#8391ab">Grey marks are useful lengths, not sizes.</div>`;
    }
    const titles: Record<View, string> = { cloud: 'The electron', spin: 'Spin in a field', trap: 'Penning trap', scale: 'Powers of ten' };
    legend.innerHTML = `<div style="color:#dfe6f3;font:600 15px/1.25 'Space Grotesk',sans-serif;margin-bottom:4px">${titles[view]}</div>${body}`;
  }

  // =====================================================================
  // PANEL
  // =====================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'cloud', label: 'Cloud' }, { value: 'spin', label: 'Spin' }, { value: 'trap', label: 'Trap' }, { value: 'scale', label: 'Scale' }],
    onChange: (v) => setView(v),
  });

  ui.section('Magnetic field');
  ui.slider({ key: 'B', label: 'B field', min: 0, max: 6, step: 0.01, value: B, unit: 'T', format: (v) => v.toFixed(2), onInput: (v) => { B = v; updateField(); } });
  const rSpin = ui.readout('spinGHz', 'spin precession', 'GHz');
  const rCyc = ui.readout('cycGHz', 'cyclotron', 'GHz');
  const rAn = ui.readout('anMHz', 'difference ν_s − ν_c', 'MHz');

  ui.section('QED prediction of g');
  ui.slider({
    key: 'order', label: 'QED order', min: 0, max: MAX_ORDER, step: 1, value: order,
    format: (v) => `${v} · ${ORDER_NAMES[v]}`,
    onInput: (v) => { order = v; updateQED(); drawLegend(); },
  });
  ui.select<AlphaSource>({
    key: 'alphaSrc', label: 'α from', value: alphaSrc,
    options: [{ value: 'cs', label: 'Caesium 2018' }, { value: 'rb', label: 'Rubidium 2020' }],
    onChange: (v) => { alphaSrc = v; updateQED(); },
  });
  const rSch = ui.readout('schwinger', 'α/2π');
  const rG = ui.readout('gPred', 'g/2 predicted');
  const rApred = ui.readout('aPred', 'a_e predicted ×10³');
  const rGexp = ui.readout('aExp', 'a_e measured ×10³');
  const rGap = ui.readout('gap', 'pred − meas');

  ui.section('Penning trap');
  const [loadBtn] = ui.buttons([
    { label: 'Load electron', primary: true, key: 'trapLoaded', onClick: () => toggleTrap() },
  ]);
  const rAx = ui.readout('axialCount', 'axial bounces');

  ui.section('Scale');
  ui.slider({
    key: 'zoom', label: 'Zoom', min: -18, max: 0, step: 0.1, value: zoomExp,
    format: (v) => `10^${v.toFixed(1)} m`,
    onInput: (v) => { zoomExp = v; if (view !== 'scale') setView('scale', true); layoutScale(); updateScaleReadout(); },
  });
  const rIn = ui.readout('inView', 'at this scale');
  ui.legend([
    { color: css(PALETTE.amber), label: 'spin / photon' },
    { color: css(PALETTE.rose), label: 'moment / e⁺' },
    { color: css(PALETTE.violet), label: 'B field' },
  ]);

  let gap = 0;
  function updateQED(): void {
    const ia = invAlpha(alphaSrc);
    const a = aePrediction(order, ia);
    gap = a - AE_EXP;
    rSch(schwinger(ia).toFixed(10));
    rG((1 + a).toFixed(order >= 4 ? 14 : 12));
    rApred((a * 1e3).toFixed(11));
    rGexp((AE_EXP * 1e3).toFixed(11));
    rGap(order === 0 ? `${sci(gap, 3)}` : `${gap >= 0 ? '+' : ''}${sci(gap, 2)}`);
    drawChart();
  }

  let spinGHz = 0;
  function updateField(): void {
    spinGHz = spinFreq(B) / 1e9;
    rSpin(spinGHz.toFixed(3));
    rCyc((cyclotronFreq(B) / 1e9).toFixed(3));
    rAn((anomalyFreq(B) / 1e6).toFixed(2));
    precLab.element.textContent = B > 0 ? `real rate: ${spinGHz.toFixed(2)} GHz` : 'no field, no precession';
    const o = Math.min(1, 0.15 + B / 3);
    bMat.opacity = 0.5 * o;
    bArrows.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material;
      m.opacity = 0.7 * o;
    });
  }

  function updateScaleReadout(): void {
    const fov = 10 ** zoomExp;
    let txt = 'people and rulers';
    if (fov < 1e-3) txt = 'cells, dust';
    if (fov < 1e-6) txt = 'viruses, molecules';
    if (fov < 5e-10) txt = 'a single atom';
    if (fov < 2e-11) txt = 'empty space in the atom';
    if (fov < 3e-14) txt = 'a nucleus';
    if (fov < 3e-15) txt = 'a proton';
    if (fov < 3e-17) txt = 'no structure in the electron';
    rIn(txt);
  }

  function toggleTrap(): void {
    trapLoaded = !trapLoaded;
    trapT = 0;
    tTrail.clear();
    loadBtn.textContent = trapLoaded ? 'Empty trap' : 'Load electron';
    if (trapLoaded && view !== 'trap') setView('trap', true);
  }

  function setView(v: View, syncSelect = false): void {
    view = v;
    cloud.visible = v === 'cloud';
    spin.visible = v === 'spin';
    trap.visible = v === 'trap';
    scale.visible = v === 'scale';
    sg.style.display = v === 'spin' ? '' : 'none';
    if (syncSelect) viewCtl.set(v, false);
    stage.flyTo(CAMS[v][0], CAMS[v][1], 1.1);
    drawLegend();
  }

  // =====================================================================
  // FRAME LOOP
  // =====================================================================
  let lastSx = 1e9;
  stage.onFrame((dt, t) => {
    if (view === 'cloud') {
      stepCloud(dt);
      hazeMat.uniforms.uAmt.value = EVENTS_AT_ORDER[order] / N_EVENTS;
      coreGlow.scale.setScalar(0.7 + 0.05 * Math.sin(t * 3));
    }
    if (view === 'spin') {
      // Electron spin precesses right-handed about +B (the moment is antiparallel to S).
      spinPhase += 2 * Math.PI * PREC_VIS * B * dt;
      sPivot.rotation.y = spinPhase;
      const r = Math.sin(TILT) * SPIN_LEN;
      const x = r * Math.cos(-spinPhase);
      const z = r * Math.sin(-spinPhase);
      if (Math.abs(x - lastSx) > 1e-3 || B === 0) {
        if (B > 0) sTrail.push(x, Math.cos(TILT) * SPIN_LEN, z);
        lastSx = x;
      }
    }
    if (view === 'trap') {
      eTrap.visible = trapLoaded;
      if (trapLoaded) {
        trapT += dt;
        trapPosition(trapMotion, trapT, tp);
        eTrap.position.set(tp[0], tp[2], -tp[1]);
        tTrail.push(tp[0], tp[2], -tp[1]);
        eLab.position.set(tp[0] + 0.12, tp[2] + 0.12, -tp[1]);
        eLab.element.textContent = 'e⁻';
        rAx(Math.floor((trapMotion.wz * trapT) / (2 * Math.PI)));
      } else {
        eLab.element.textContent = '';
        rAx('press Load electron');
      }
    }
  });

  // Initial draw
  updateField();
  updateQED();
  layoutScale();
  updateScaleReadout();
  setView('cloud');
  rAx('press Load electron');

  return {
    state: () => ({
      view, B, spinGHz, order, alphaSrc,
      aPred: aePrediction(order, invAlpha(alphaSrc)),
      gapAbs: Math.abs(gap),
      zoomExp,
      trapLoaded,
      axialCount: trapLoaded ? Math.floor((trapMotion.wz * trapT) / (2 * Math.PI)) : 0,
    }),
    dispose: () => {
      legend.remove();
      chart.remove();
      sg.remove();
      glow.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'the-electron',
  number: 69,
  title: 'The Electron',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'A point with charge, spin and a magnet, measured to twelve digits.',
  content,
  mount,
};

export default topic;
