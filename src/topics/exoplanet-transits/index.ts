import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AU,
  DAY,
  M_EARTH,
  M_SUN,
  R_EARTH,
  R_JUP,
  R_SUN,
  TAU,
  gauss,
  habitableZone,
  luminosity,
  massFromRadius,
  occultedFlux,
  period,
  rvSemiAmplitude,
  transitDuration,
  transitSNR,
  skySeparation,
  type Star,
} from './physics.ts';

type StarId = 'M8' | 'M' | 'K' | 'G' | 'F' | 'HD209';
type PresetId = 'earth' | 'jupiter' | 'hd209' | 'trappist' | 'custom';
type TrapId = 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
type View = 'telescope' | 'tilted';

const DEG = Math.PI / 180;
const R_J_IN_E = R_JUP / R_EARTH;
const M_J_IN_E = 317.83;

// Star types. Sun, HD 209458 (Torres et al. 2008) and TRAPPIST-1 (Agol et al. 2021)
// are real stars. M, K and F are typical dwarfs. Limb-darkening coefficients are
// illustrative optical-band values.
const STARS: Record<StarId, Star> = {
  M8: { name: 'TRAPPIST-1 (M8 V)', mass: 0.0898, radius: 0.1192, teff: 2566, u1: 0.55, u2: 0.25, color: 0xff8a4c },
  M: { name: 'typical M dwarf', mass: 0.45, radius: 0.43, teff: 3550, u1: 0.45, u2: 0.3, color: 0xffac68 },
  K: { name: 'typical K dwarf', mass: 0.7, radius: 0.68, teff: 4450, u1: 0.5, u2: 0.21, color: 0xffcf96 },
  G: { name: 'the Sun (G2 V)', mass: 1, radius: 1, teff: 5772, u1: 0.4, u2: 0.26, color: 0xfff0d8 },
  F: { name: 'typical F dwarf', mass: 1.3, radius: 1.45, teff: 6500, u1: 0.32, u2: 0.3, color: 0xeef0ff },
  HD209: { name: 'HD 209458 (G0 V)', mass: 1.119, radius: 1.155, teff: 6065, u1: 0.38, u2: 0.27, color: 0xfff6e8 },
};

// TRAPPIST-1 planets, Agol et al. (2021): a (AU), R (R⊕), M (M⊕), i (deg).
const TRAPPIST: Record<TrapId, { a: number; r: number; m: number; i: number }> = {
  b: { a: 0.01154, r: 1.116, m: 1.374, i: 89.728 },
  c: { a: 0.0158, r: 1.097, m: 1.308, i: 89.778 },
  d: { a: 0.02227, r: 0.788, m: 0.388, i: 89.896 },
  e: { a: 0.02925, r: 0.92, m: 0.692, i: 89.793 },
  f: { a: 0.03849, r: 1.045, m: 1.039, i: 89.74 },
  g: { a: 0.04683, r: 1.129, m: 1.321, i: 89.742 },
  h: { a: 0.06189, r: 0.755, m: 0.326, i: 89.805 },
};

/** Photometric noise per 30-minute sample: roughly Kepler on a bright Sun-like star. */
const SIGMA30 = 100e-6;
const NM = 241; // model samples across the window
const NB = 80; // noisy samples per window
const NOISE_CAP = NB * 12;
const LIVE_CAP = 600;
const INC_SPAN = 12; // inclination slider covers 90° down to 78°
const MIN_VIS_K = 0.05;

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (n: number) => String(n).split('').map((c) => SUP[c] ?? c).join('');

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Display radius of an orbit: log-compressed so hot Jupiters and Jupiters both fit. */
const aVisOf = (aR: number) => 1.7 + 1.3 * Math.log10(Math.max(1, aR) / 2);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { orthographic: true, orthoSize: 3.2, camera: [0, 0, 40], target: [0, 0, 0], lights: false });
  const { scene } = stage;
  const cam = stage.camera as THREE.OrthographicCamera;

  // ---------------------------------------------------------------- state
  let preset: PresetId = 'hd209';
  let trap: TrapId = 'e';
  let starId: StarId = 'HD209';
  let rpE = 1.359 * R_J_IN_E;
  let mpE = 0.682 * M_J_IN_E;
  let aAU = 0.04707;
  let incDeg = 86.71;
  let ld = true;
  let noise = false;
  let view: View = 'telescope';
  let speed = 1;
  let playing = true;
  let touched = false;

  // Derived
  let star = STARS[starId];
  let k = 0;
  let aR = 0;
  let aRclamped = false;
  let b = 0;
  let P = 0;
  let K = 0;
  let T14 = 0;
  let T23 = 0;
  let transits = true;
  let grazing = false;
  let modelDepth = 0;
  let hzIn = 0;
  let hzOut = 0;
  let inHZ = false;
  let w = 0.05;
  let snr1 = 0;
  let integErr = 0;
  let u1 = 0;
  let u2 = 0;
  let aVis = 3;
  let y0 = 0;
  let zc = 3;
  let wobX = 1;
  let wobQ = 0;
  let sigBin = SIGMA30;

  const modelF = new Float64Array(NM);
  const deficit = new Float64Array(NM);

  // Animation
  let phase = -0.3;
  let inWin = false;
  let passFull = false;
  let lastBin = -1;
  let nTransits = 0;
  let fNow = 1;
  const liveX = new Float32Array(LIVE_CAP);
  const liveY = new Float32Array(LIVE_CAP);
  let liveN = 0;
  const noiseX = new Float32Array(NOISE_CAP);
  const noiseY = new Float32Array(NOISE_CAP);
  let noiseN = 0;
  let noiseHead = 0;
  const binSum = new Float64Array(24);
  const binCnt = new Float64Array(24);

  // ---------------------------------------------------------------- scene
  scene.add(new THREE.AmbientLight(0x8090b0, 0.25));
  const starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  scene.add(starLight);

  // Background stars scattered through a box so the orthographic view sees some.
  {
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      do {
        x = (Math.random() * 2 - 1) * 40;
        y = (Math.random() * 2 - 1) * 40;
        z = -10 - Math.random() * 60;
      } while (Math.hypot(x, y) < 1.2);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a96b8, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55 }));
    scene.add(pts);
  }

  const glowTex = glowTexture();
  const starGroup = new THREE.Group();
  scene.add(starGroup);
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(star.color) }, uU1: { value: 0.4 }, uU2: { value: 0.26 } },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uU1;
      uniform float uU2;
      varying vec3 vN;
      void main() {
        float mu = clamp(normalize(vN).z, 0.0, 1.0);
        float m = 1.0 - mu;
        float I = 1.0 - uU1 * m - uU2 * m * m;
        gl_FragColor = vec4(uColor * I, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  starMat.toneMapped = false;
  const starMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), starMat);
  starGroup.add(starMesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: star.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.scale.setScalar(3.6);
  starGroup.add(glow);
  // Star centre dot (drawn on top) and barycentre cross.
  const dotMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose, depthTest: false, transparent: true });
  const starDot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), dotMat);
  starDot.renderOrder = 10;
  starGroup.add(starDot);
  const bary = new THREE.Group();
  {
    const m = new THREE.LineBasicMaterial({ color: PALETTE.green, depthTest: false, transparent: true });
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.09, 0, 0), new THREE.Vector3(0.09, 0, 0), new THREE.Vector3(0, -0.09, 0), new THREE.Vector3(0, 0.09, 0),
    ]);
    const seg = new THREE.LineSegments(g, m);
    seg.renderOrder = 11;
    bary.add(seg);
  }
  scene.add(bary);
  const labBary = stage.label('barycentre', [0.1, -0.16, 0], 'muted', bary);
  const labStar = stage.label('', [0, 1.28, 0], 'muted', starGroup);
  const labWob = stage.label('', [0, -1.3, 0], 'muted', starGroup);

  // Orbit plane group
  const orbitGroup = new THREE.Group();
  scene.add(orbitGroup);
  const orbitLine = (() => {
    const n = 192;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.sin((i / n) * TAU);
      pos[i * 3 + 2] = Math.cos((i / n) * TAU);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.45 }));
  })();
  orbitGroup.add(orbitLine);
  const hzMat = new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const hzMesh = new THREE.Mesh(new THREE.RingGeometry(1, 2, 128, 1), hzMat);
  hzMesh.rotation.x = -Math.PI / 2;
  orbitGroup.add(hzMesh);
  const labHZ = stage.label('habitable zone (approx.)', [0, 0, 0], 'muted', orbitGroup);

  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), new THREE.MeshStandardMaterial({ color: 0x8a7fd0, roughness: 0.8, metalness: 0 }));
  scene.add(planet);
  const labPlanet = stage.label('planet', [0, 1.6, 0], 'muted', planet);

  const losArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1.4, 0), 6, PALETTE.cyan, 0.35, 0.2);
  scene.add(losArrow);
  const labLos = stage.label('to telescope', [0, -1.4, 6.4], '', undefined);

  // ---------------------------------------------------------------- insets
  const mkCanvas = (css0: Partial<CSSStyleDeclaration>, W: number, H: number) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    Object.assign(c.style, {
      position: 'absolute', background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
      ...css0,
    } as CSSStyleDeclaration);
    viewport.appendChild(c);
    return c;
  };
  const lc = mkCanvas({ right: '10px', top: '10px', width: '270px', height: '130px' }, 540, 260);
  const rv = mkCanvas({ left: '10px', top: '10px', width: '230px', height: '100px' }, 460, 200);
  const lcx = lc.getContext('2d')!;
  const rvx = rv.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${css(c)}"></i>`;
  function paintLegend(): void {
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Not to scale</div>` + [
      `${sw(PALETTE.violet, false)}orbit, log-compressed`,
      `${sw(PALETTE.green, false)}habitable zone (approx.)`,
      `${sw(PALETTE.rose)}star centre, ${sw(PALETTE.green, false)}barycentre`,
      k < MIN_VIS_K ? `planet drawn ×${(MIN_VIS_K / k).toFixed(0)} larger` : 'planet to scale with star',
      'Time slows near transit.',
    ].join('<br/>');
  }

  // ---------------------------------------------------------------- physics update
  function recompute(): void {
    star = STARS[starId];
    const Rs = star.radius * R_SUN;
    const Ms = star.mass * M_SUN;
    const Rp = rpE * R_EARTH;
    const Mp = mpE * M_EARTH;
    k = Rp / Rs;
    aR = (aAU * AU) / Rs;
    aRclamped = aR < 2;
    if (aRclamped) aR = 2;
    const aM = aR * Rs;
    const inc = incDeg * DEG;
    b = aR * Math.cos(inc);
    P = period(aM, Ms, Mp);
    K = rvSemiAmplitude(P, Mp, Ms, inc);
    T14 = transitDuration(P, aR, k, inc);
    T23 = transitDuration(P, aR, k, inc, true);
    transits = b < 1 + k;
    grazing = transits && b > 1 - k;
    u1 = ld ? star.u1 : 0;
    u2 = ld ? star.u2 : 0;
    starMat.uniforms.uU1.value = u1;
    starMat.uniforms.uU2.value = u2;
    starMat.uniforms.uColor.value.set(star.color);
    (glow.material as THREE.SpriteMaterial).color.set(star.color);
    const L = luminosity(star);
    [hzIn, hzOut] = habitableZone(L, star.teff);
    inHZ = aAU >= hzIn && aAU <= hzOut;
    // Window: 1.5× the half-duration of a central transit, in orbital phase.
    w = Math.min(0.2, (1.5 * Math.asin(Math.min(1, (1 + k) / aR))) / TAU);
    modelDepth = 0;
    for (let i = 0; i < NM; i++) {
      const ph = -w + (2 * w * i) / (NM - 1);
      const F = fluxAt(ph, 256);
      modelF[i] = F;
      deficit[i] = 1 - F;
      if (1 - F > modelDepth) modelDepth = 1 - F;
    }
    const dtM = (2 * w * P) / (NM - 1);
    snr1 = transitSNR(deficit, NM, dtM, SIGMA30);
    sigBin = SIGMA30 * Math.sqrt(1800 / ((2 * w * P) / NB));
    integErr = k < 1 ? Math.abs((1 - occultedFlux(0, k, 0, 0, 256)) / (k * k) - 1) : 0;

    // Scene geometry
    aVis = aVisOf(aR);
    const thr = Math.max(1.6, 1 + k + 0.4);
    const ymax = 0.8 * aVis;
    y0 = b <= thr || ymax <= thr ? Math.min(b, 0.95 * aVis) : thr + (ymax - thr) * Math.tanh((b - thr) / (ymax - thr));
    zc = Math.sqrt(Math.max(0, aVis * aVis - y0 * y0));
    orbitGroup.rotation.x = -Math.asin(y0 / aVis);
    orbitLine.scale.setScalar(aVis);
    const Rsun_AU = Rs / AU;
    const rIn = Math.max(1.05, aVisOf(hzIn / Rsun_AU));
    const rOut = Math.max(rIn + 0.02, aVisOf(hzOut / Rsun_AU));
    hzMesh.geometry.dispose();
    hzMesh.geometry = new THREE.RingGeometry(rIn, rOut, 128, 1);
    labHZ.position.set(-(rIn + rOut) / 2 * 0.72, 0, (rIn + rOut) / 2 * 0.72);
    planet.scale.setScalar(Math.max(k, MIN_VIS_K));
    labPlanet.position.set(0, 1 + 0.25 / Math.max(k, MIN_VIS_K), 0);
    const q = Mp / (Ms + Mp);
    const amp = aVis * q;
    wobX = amp >= 0.1 ? 1 : Math.pow(10, Math.ceil(Math.log10(0.1 / amp)));
    wobQ = q * wobX;
    const exp = Math.round(Math.log10(wobX));
    labWob.element.textContent = wobX > 1 ? `wobble exaggerated ×10${sup(exp)}` : 'wobble to scale';
    labStar.element.textContent = star.name;
    losArrow.setLength(aVis + 1.2, 0.35, 0.2);
    labLos.position.set(0, -1.4, aVis + 1.6);
    paintLegend();
  }

  /** Relative flux at orbital phase ph (fraction of an orbit, 0 = mid-transit). */
  function fluxAt(ph: number, n: number): number {
    const th = ph * TAU;
    if (Math.cos(th) <= 0) return 1;
    return occultedFlux(skySeparation(aR, incDeg * DEG, th), k, u1, u2, n);
  }

  function resetObs(): void {
    liveN = 0;
    noiseN = 0;
    noiseHead = 0;
    nTransits = 0;
    passFull = false;
    inWin = Math.abs(phase) < w;
    lastBin = -1;
  }

  function placeBodies(): void {
    const th = phase * TAU;
    const px = aVis * Math.sin(th);
    const py = y0 * Math.cos(th);
    const pz = zc * Math.cos(th);
    planet.position.set(px, py, pz);
    starGroup.position.set(-px * wobQ, -py * wobQ, -pz * wobQ);
    starLight.position.copy(starGroup.position);
  }

  // ---------------------------------------------------------------- animation
  function modelAt(ph: number): number {
    const u = ((ph + w) / (2 * w)) * (NM - 1);
    const i = Math.max(0, Math.min(NM - 2, Math.floor(u)));
    const f = Math.min(1, Math.max(0, u - i));
    return modelF[i] * (1 - f) + modelF[i + 1] * f;
  }

  function addNoisePoint(ph: number): void {
    const y = modelAt(ph) + sigBin * gauss(Math.random);
    noiseX[noiseHead] = ph;
    noiseY[noiseHead] = y;
    noiseHead = (noiseHead + 1) % NOISE_CAP;
    if (noiseN < NOISE_CAP) noiseN++;
  }

  function advance(dt: number): void {
    const sub = 8;
    const h = (dt * speed) / sub;
    const rIn = (2 * w) / 5;
    const rOut = (1 - 2 * w) / 3.5;
    for (let s = 0; s < sub; s++) {
      const a = Math.abs(phase);
      const x = Math.min(1, Math.max(0, (a - w) / (0.4 * w)));
      const sm = x * x * (3 - 2 * x);
      const prev = phase;
      phase += (rIn + (rOut - rIn) * sm) * h;
      if (phase >= 0.5) phase -= 1;
      const was = inWin;
      inWin = Math.abs(phase) < w;
      if (!was && inWin && prev < 0) {
        // Entering the transit window: start a new trace.
        liveN = 0;
        lastBin = -1;
        passFull = true;
      }
      if (was && !inWin) {
        if (passFull && transits) nTransits++;
        passFull = false;
      }
      if (inWin) {
        const bin = Math.min(NB - 1, Math.floor(((phase + w) / (2 * w)) * NB));
        if (noise && passFull) {
          while (lastBin < bin) {
            lastBin++;
            addNoisePoint(-w + ((lastBin + 0.5) / NB) * 2 * w);
          }
        }
        lastBin = Math.max(lastBin, bin);
      }
    }
    fNow = fluxAt(phase, 160);
    if (inWin && liveN < LIVE_CAP) {
      liveX[liveN] = phase;
      liveY[liveN] = fNow;
      liveN++;
    }
  }

  // ---------------------------------------------------------------- inset drawing
  function niceStep(span: number): number {
    const raw = span / 3;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : 5) * p;
  }

  function drawLC(): void {
    const W = lc.width;
    const H = lc.height;
    lcx.clearRect(0, 0, W, H);
    lcx.font = '22px JetBrains Mono, monospace';
    lcx.fillStyle = '#8391ab';
    lcx.fillText('light curve: star brightness', 14, 30);
    const dMax = Math.max(1.3 * modelDepth, noise ? 3.5 * sigBin : 0, 40e-6);
    const top = noise ? 2.5 * sigBin : 0.25 * dMax;
    const yLo = 1 - dMax;
    const yHi = 1 + top;
    const x0 = 14;
    const x1 = W - 110;
    const yT = 46;
    const yB = H - 34;
    const X = (ph: number) => x0 + ((ph + w) / (2 * w)) * (x1 - x0);
    const Y = (f: number) => yB - ((Math.min(yHi, Math.max(yLo, f)) - yLo) / (yHi - yLo)) * (yB - yT);
    // Grid in ppm or %
    const usePct = dMax > 3e-3;
    const step = niceStep(dMax);
    lcx.lineWidth = 1;
    for (let d = 0; d <= dMax + 1e-12; d += step) {
      const y = Y(1 - d);
      lcx.strokeStyle = d === 0 ? '#34405c' : '#1f293d';
      lcx.beginPath();
      lcx.moveTo(x0, y);
      lcx.lineTo(x1, y);
      lcx.stroke();
      lcx.fillStyle = '#56627c';
      const lab = d === 0 ? '1' : usePct ? `-${(d * 100).toFixed(step * 100 < 0.1 ? 2 : 1)}%` : `-${Math.round(d * 1e6)}ppm`;
      lcx.fillText(lab, x1 + 8, y + 7);
    }
    // Time axis
    const hrs = (w * P) / 3600;
    lcx.fillStyle = '#56627c';
    const tl = hrs >= 10 ? hrs.toFixed(0) : hrs.toFixed(1);
    lcx.fillText(`-${tl} h`, x0, H - 8);
    lcx.fillText(`+${tl} h`, x1 - 86, H - 8);
    lcx.fillText('0', (x0 + x1) / 2 - 6, H - 8);
    // Noise points and binned means
    if (noise && noiseN > 0) {
      lcx.fillStyle = 'rgba(79,209,232,0.45)';
      for (let i = 0; i < noiseN; i++) lcx.fillRect(X(noiseX[i]) - 2, Y(noiseY[i]) - 2, 4, 4);
      const nb = 20;
      binSum.fill(0);
      binCnt.fill(0);
      for (let i = 0; i < noiseN; i++) {
        const j = Math.min(nb - 1, Math.floor(((noiseX[i] + w) / (2 * w)) * nb));
        binSum[j] += noiseY[i];
        binCnt[j]++;
      }
      lcx.strokeStyle = css(PALETTE.white);
      lcx.fillStyle = css(PALETTE.white);
      lcx.lineWidth = 2;
      lcx.beginPath();
      let first = true;
      for (let j = 0; j < nb; j++) {
        if (!binCnt[j]) continue;
        const x = X(-w + ((j + 0.5) / nb) * 2 * w);
        const y = Y(binSum[j] / binCnt[j]);
        if (first) lcx.moveTo(x, y);
        else lcx.lineTo(x, y);
        first = false;
      }
      lcx.stroke();
      for (let j = 0; j < nb; j++) {
        if (!binCnt[j]) continue;
        lcx.fillRect(X(-w + ((j + 0.5) / nb) * 2 * w) - 4, Y(binSum[j] / binCnt[j]) - 4, 8, 8);
      }
    }
    // Model (dashed)
    lcx.strokeStyle = 'rgba(223,230,243,0.45)';
    lcx.setLineDash([8, 8]);
    lcx.lineWidth = 2;
    lcx.beginPath();
    for (let i = 0; i < NM; i += 2) {
      const x = X(-w + (2 * w * i) / (NM - 1));
      const y = Y(modelF[i]);
      if (i === 0) lcx.moveTo(x, y);
      else lcx.lineTo(x, y);
    }
    lcx.stroke();
    lcx.setLineDash([]);
    // Live trace
    if (!noise && liveN > 1) {
      lcx.strokeStyle = css(PALETTE.amber);
      lcx.lineWidth = 4;
      lcx.beginPath();
      for (let i = 0; i < liveN; i++) {
        const x = X(liveX[i]);
        const y = Y(liveY[i]);
        if (i === 0) lcx.moveTo(x, y);
        else lcx.lineTo(x, y);
      }
      lcx.stroke();
    }
    if (inWin) {
      lcx.fillStyle = css(PALETTE.amber);
      lcx.beginPath();
      lcx.arc(X(phase), Y(fNow), 6, 0, TAU);
      lcx.fill();
    }
    if (!transits) {
      lcx.fillStyle = css(PALETTE.red);
      lcx.fillText('no transit', (x0 + x1) / 2 - 60, yT + 40);
    }
  }

  function drawRV(): void {
    const W = rv.width;
    const H = rv.height;
    rvx.clearRect(0, 0, W, H);
    rvx.font = '22px JetBrains Mono, monospace';
    rvx.fillStyle = '#8391ab';
    rvx.fillText('star RV (wobble)', 14, 30);
    const x0 = 14;
    const x1 = W - 14;
    const yT = 50;
    const yB = H - 30;
    const ym = (yT + yB) / 2;
    const X = (ph: number) => x0 + (ph + 0.5) * (x1 - x0);
    const Y = (v: number) => ym - v * ((yB - yT) / 2 / 1.25);
    rvx.strokeStyle = '#34405c';
    rvx.lineWidth = 1;
    rvx.beginPath();
    rvx.moveTo(x0, ym);
    rvx.lineTo(x1, ym);
    rvx.moveTo(X(0), yT - 4);
    rvx.lineTo(X(0), yB);
    rvx.stroke();
    rvx.strokeStyle = css(PALETTE.cyan);
    rvx.lineWidth = 3;
    rvx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const ph = -0.5 + i / 120;
      const x = X(ph);
      const y = Y(-Math.sin(ph * TAU));
      if (i === 0) rvx.moveTo(x, y);
      else rvx.lineTo(x, y);
    }
    rvx.stroke();
    rvx.fillStyle = css(PALETTE.amber);
    rvx.beginPath();
    rvx.arc(X(phase), Y(-Math.sin(phase * TAU)), 7, 0, TAU);
    rvx.fill();
    rvx.fillStyle = '#56627c';
    rvx.fillText('transit', X(0) + 6, H - 6);
    rvx.fillText('+ = moving away', x0, H - 6);
    rvx.fillStyle = '#dfe6f3';
    const kTxt = K >= 1 ? `${K.toFixed(1)} m/s` : `${(K * 100).toFixed(K < 0.1 ? 1 : 0)} cm/s`;
    rvx.textAlign = 'right';
    rvx.fillText(`K = ${kTxt}`, W - 14, 30);
    rvx.textAlign = 'left';
  }

  // ---------------------------------------------------------------- camera
  function fit(fly = true): void {
    const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
    const halfW = aVis + 0.9;
    const halfH = view === 'telescope' ? 2.2 : Math.max(2.2, aVis * 0.55 + 1.2);
    cam.zoom = Math.min((3.2 * aspect) / halfW, 3.2 / halfH);
    cam.updateProjectionMatrix();
    const pos: [number, number, number] = view === 'telescope' ? [0, 0, 40] : [10, 27, 28];
    if (fly) stage.flyTo(pos, [0, 0, 0], 0.9);
  }

  function applyView(): void {
    const tilted = view === 'tilted';
    losArrow.visible = tilted;
    labLos.visible = tilted;
    labHZ.visible = tilted;
    labBary.visible = tilted;
    fit();
  }

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('System');
  const presetCtl = ui.select<PresetId>({
    key: 'preset', label: 'Preset', value: preset,
    options: [
      { value: 'earth', label: 'Earth–Sun' },
      { value: 'jupiter', label: 'Jupiter–Sun' },
      { value: 'hd209', label: 'HD 209458 b' },
      { value: 'trappist', label: 'TRAPPIST-1' },
    ],
    onChange: (v) => applyPreset(v, true),
  });
  const trapCtl = ui.select<TrapId>({
    key: 'trappist', label: 'TRAPPIST-1 planet', value: trap,
    options: (['b', 'c', 'd', 'e', 'f', 'g', 'h'] as TrapId[]).map((x) => ({ value: x, label: x })),
    onChange: (v) => { trap = v; applyPreset('trappist', true); },
  });
  const starCtl = ui.select<StarId>({
    key: 'star', label: 'Star type', value: starId,
    options: [
      { value: 'M8', label: 'M8' },
      { value: 'M', label: 'M' },
      { value: 'K', label: 'K' },
      { value: 'G', label: 'G (Sun)' },
      { value: 'F', label: 'F' },
    ],
    onChange: (v) => { starId = v; userChange(false); },
  });
  const rpCtl = ui.slider({
    key: 'rp', label: 'Planet radius', min: Math.log10(0.3), max: Math.log10(25), step: 0.002, value: Math.log10(rpE),
    format: (v) => { const r = 10 ** v; return `${r.toFixed(r < 10 ? 2 : 1)} R⊕`; },
    onInput: (v) => { rpE = 10 ** v; mpE = massFromRadius(rpE); userChange(false); },
  });
  const aCtl = ui.slider({
    key: 'a', label: 'Orbit radius a', min: Math.log10(0.005), max: Math.log10(10), step: 0.002, value: Math.log10(aAU),
    format: (v) => { const a = 10 ** v; return `${a < 0.1 ? a.toFixed(4) : a.toFixed(a < 1 ? 3 : 2)} AU`; },
    onInput: (v) => { aAU = 10 ** v; userChange(true); },
  });
  const uOfInc = (i: number) => Math.cbrt(Math.max(0, 90 - i) / INC_SPAN);
  const incCtl = ui.slider({
    key: 'inc', label: 'Inclination i (tilt)', min: 0, max: 1, step: 0.0005, value: uOfInc(incDeg),
    format: (u) => `${(90 - INC_SPAN * u ** 3).toFixed(3)}°`,
    onInput: (u) => { incDeg = 90 - INC_SPAN * u ** 3; userChange(true); },
  });
  ui.note('90° is edge-on. The slider is finer near 90°, where transits happen.');

  ui.section('Observation');
  ui.toggle({ key: 'ld', label: 'Limb darkening', value: ld, onChange: (v) => { ld = v; touched = true; recompute(); resetObs(); } });
  ui.toggle({ key: 'noise', label: 'Photometric noise (100 ppm / 30 min)', value: noise, onChange: (v) => { noise = v; touched = true; resetObs(); } });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'telescope', label: 'Telescope (line of sight)' }, { value: 'tilted', label: 'Tilted' }],
    onChange: (v) => { view = v; applyView(); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Clear data', onClick: () => resetObs() },
  ]);
  ui.slider({ key: 'speed', label: 'Playback speed', min: 0.25, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Transit');
  const rDepth = ui.readout('depth', '(Rp/R★)²');
  const rModel = ui.readout('modelDepth', 'deepest point of dip');
  const rB = ui.readout('b', 'impact parameter b');
  const rT14 = ui.readout('T14', 'duration T14 / T23');
  const rProb = ui.readout('prob', 'chance to transit R★/a');
  const rSnr = ui.readout('snr', 'S/N (transits seen)');
  const rCheck = ui.readout('check', 'integrator vs (Rp/R★)²');
  ui.section('Orbit and wobble');
  const rP = ui.readout('P', 'period P');
  const rK = ui.readout('K', 'RV amplitude K');
  const rMp = ui.readout('mp', 'planet mass');
  const rHZ = ui.readout('hz', 'habitable zone');
  const rStar = ui.readout('starinfo', 'star M★, R★, T');
  ui.legend([
    { color: css(PALETTE.amber), label: 'live light curve' },
    { color: css(PALETTE.cyan), label: 'noisy data / RV' },
    { color: css(PALETTE.green), label: 'habitable zone' },
  ]);

  function syncSliders(): void {
    rpCtl.set(Math.log10(rpE), false);
    aCtl.set(Math.log10(aAU), false);
    incCtl.set(uOfInc(incDeg), false);
    starCtl.set(starId === 'HD209' ? ('' as StarId) : starId, false);
    presetCtl.set(preset === 'custom' ? ('' as PresetId) : preset, false);
    trapCtl.el.style.display = preset === 'trappist' ? '' : 'none';
  }

  function applyPreset(p: PresetId, user: boolean): void {
    preset = p;
    if (p === 'earth') {
      starId = 'G'; rpE = 1; mpE = 1; aAU = 1; incDeg = 90;
    } else if (p === 'jupiter') {
      starId = 'G'; rpE = R_J_IN_E; mpE = M_J_IN_E; aAU = 5.2038; incDeg = 90;
    } else if (p === 'hd209') {
      starId = 'HD209'; rpE = 1.359 * R_J_IN_E; mpE = 0.682 * M_J_IN_E; aAU = 0.04707; incDeg = 86.71;
    } else if (p === 'trappist') {
      const t = TRAPPIST[trap];
      starId = 'M8'; rpE = t.r; mpE = t.m; aAU = t.a; incDeg = t.i;
    }
    if (user) touched = true;
    syncSliders();
    recompute();
    phase = -1.25 * w;
    resetObs();
    placeBodies();
    fit();
  }

  function userChange(refit: boolean): void {
    touched = true;
    preset = 'custom';
    syncSliders();
    recompute();
    resetObs();
    placeBodies();
    if (refit) fit(false);
  }

  const fmtTime = (s: number) => {
    const h = s / 3600;
    return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
  };
  const fmtDepth = (d: number) => (d >= 1e-3 ? `${(d * 100).toFixed(3)}%` : `${(d * 1e6).toFixed(1)} ppm`);

  function updateReadouts(): void {
    rDepth(fmtDepth(k * k));
    rModel(transits ? fmtDepth(modelDepth) : 'no transit');
    rB(`${b < 100 ? b.toFixed(3) : b.toFixed(0)} (edge ${(1 + k).toFixed(3)})`);
    rT14(transits ? `${fmtTime(T14)} / ${T23 > 0 ? fmtTime(T23) : 'grazing'}` : 'none');
    rProb(`${((1 / aR) * 100).toFixed(aR > 100 ? 2 : 1)}%${aRclamped ? ' (a clamped)' : ''}`);
    rSnr(noise ? `${(snr1 * Math.sqrt(nTransits)).toFixed(1)} (${nTransits})` : `turn noise on`);
    rCheck(k < 1 ? `${integErr.toExponential(1)}` : 'n/a');
    const Pd = P / DAY;
    rP(Pd > 730 ? `${(Pd / 365.25).toFixed(2)} yr` : `${Pd.toFixed(Pd < 10 ? 3 : 1)} d`);
    rK(K >= 1 ? `${K.toFixed(2)} m/s` : `${(K * 100).toFixed(2)} cm/s`);
    rMp(mpE > 50 ? `${(mpE / M_J_IN_E).toFixed(3)} M_J` : `${mpE.toFixed(2)} M⊕`);
    rHZ(`${hzIn.toFixed(hzIn < 0.1 ? 3 : 2)} to ${hzOut.toFixed(hzOut < 0.1 ? 3 : 2)} AU${inHZ ? ' ✓' : ''}`);
    rStar(`${star.mass} M☉, ${star.radius} R☉, ${star.teff} K`);
  }

  // ---------------------------------------------------------------- loop
  let uiTimer = 0;
  stage.onFrame((dt) => {
    if (playing) advance(dt);
    placeBodies();
    uiTimer += dt;
    if (uiTimer > 0.1) {
      uiTimer = 0;
      updateReadouts();
      drawLC();
      drawRV();
    }
  });

  applyPreset('hd209', false);
  applyView();
  updateReadouts();
  drawLC();
  drawRV();
  touched = false;

  return {
    state: () => ({
      preset,
      star: starId,
      rp: rpE,
      a: aAU,
      inc: incDeg,
      b,
      k,
      depth: k * k,
      modelDepth,
      transits,
      grazing,
      ld,
      noise,
      snr: noise ? snr1 * Math.sqrt(nTransits) : 0,
      nTransits,
      inHZ,
      K,
      T14h: T14 / 3600,
      view,
      touched,
    }),
    dispose: () => {
      lc.remove();
      rv.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'exoplanet-transits',
  number: 61,
  title: 'Finding Exoplanets',
  domain: 'astro',
  level: 1,
  status: 'live',
  tagline: 'A tiny dip in starlight reveals a world.',
  content,
  mount,
};

export default topic;
