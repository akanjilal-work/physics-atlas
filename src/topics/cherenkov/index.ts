import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  MASS_MEV, MEDIA, cherenkovAngle, envelopeHalfAngle, frankTammPerNm, gammaOf, isAbove, kineticMeV,
  machAngle, photonsPerCm, thresholdBeta, thresholdKinetic, type Medium, type Particle,
} from './physics.ts';

type View = 'light' | 'sound';
type Cam = 'side' | 'detector';

const DEG = Math.PI / 180;
const BLUE = 0x5b9dff;
const WAVE_BLUE = 0x8fc2ff;
const SOUND = 0xdfe6f3;

// Layout (scene units). The track runs along +x through a tank that ends in a PMT wall.
const TX0 = -6.5; // tank ends
const TX1 = 5.5;
const TH = 4.5; // tank half height and half depth
const XW = TX1; // detector wall
const X0 = -6; // particle entry
const X1 = 5.2; // particle exit
const C_SCENE = 2.4; // on-screen vacuum light speed, units per second
const C_SOUND = 1.35; // on-screen sound speed
const LIFE = 2.2; // wavelet lifetime (s)
const PAUSE = 1.2; // gap between passes (s)
const NW = 64; // wavelet pool
const CSEG = 48; // segments per wavelet circle
const NRAY = 16;
const PMT_N = 36; // PMTs per side
const PMT_STEP = (2 * TH) / PMT_N;
const RING_SEG = 128;
const ARC_SEG = 24;

const CAM: Record<Cam, [number, number, number]> = { side: [-1.2, 7.6, 21.5], detector: [-11, 1.8, 3.4] };
const TGT: Record<Cam, [number, number, number]> = { side: [2.2, 0.9, 0], detector: [XW, 0, 0] };

const rimVert = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const rimFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = (0.05 + 0.9 * pow(f, 4.0)) * vAlpha * uGain;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const coneVert = /* glsl */ `
varying float vS;
varying vec3 vN;
varying vec3 vV;
void main() {
  vS = -position.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const coneFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying float vS;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float along = pow(clamp(1.0 - vS, 0.0, 1.0), 1.3);
  float a = (0.28 + 0.7 * pow(f, 2.0)) * along * uGain;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const pmtVert = /* glsl */ `
attribute vec3 color;
varying vec3 vC;
uniform float uSize;
void main() {
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const pmtFrag = /* glsl */ `
varying vec3 vC;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float edge = smoothstep(0.5, 0.36, r);
  gl_FragColor = vec4(vC * edge, 1.0);
}`;

/** Approximate sRGB colour of a wavelength in nm (for the spectrum inset). */
function lambdaRGB(l: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / (440 - 380); b = 1; }
  else if (l < 490) { g = (l - 440) / 50; b = 1; }
  else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; }
  else if (l < 645) { r = 1; g = -(l - 645) / 65; }
  else { r = 1; }
  let k = 1;
  if (l < 420) k = 0.3 + (0.7 * (l - 380)) / 40;
  if (l > 680) k = 0.3 + (0.7 * (700 - l)) / 20;
  if (l < 380) k = 0.25;
  return [Math.max(0, Math.min(1, r * k)), Math.max(0, Math.min(1, g * k)), Math.max(0, Math.min(1, b * k))];
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.side, target: TGT.side, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let view: View = 'light';
  let medium: Medium = 'water';
  let particle: Particle = 'electron';
  let beta = 0.9;
  let mach = 1.8;
  let density = 12; // wavelets per second
  let playing = true;

  let crossedUp = false;
  let armed = false;

  const n = () => MEDIA[medium];
  const above = () => (view === 'light' ? isAbove(n(), beta) : mach > 1);
  const uSpeed = () => (view === 'light' ? beta * C_SCENE : mach * C_SOUND);
  const wSpeed = () => (view === 'light' ? C_SCENE / n() : C_SOUND);
  /** Half-angle of the wavefront cone (Cherenkov φ = 90° − θ, or Mach α). */
  const coneHalf = () => (view === 'light' ? Math.asin(Math.min(1, 1 / (n() * beta))) : machAngle(mach));

  // =====================================================================
  // Tank, wall and PMTs
  // =====================================================================
  const lightGroup = new THREE.Group();
  scene.add(lightGroup);
  const tankGeo = new THREE.BoxGeometry(TX1 - TX0, 2 * TH, 2 * TH);
  tankGeo.translate((TX0 + TX1) / 2, 0, 0);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x1d5a9a, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false, roughness: 0.2 });
  const tank = new THREE.Mesh(tankGeo, tankMat);
  tank.renderOrder = 0;
  lightGroup.add(tank);
  const tankEdges = new THREE.LineSegments(new THREE.EdgesGeometry(tankGeo), new THREE.LineBasicMaterial({ color: 0x2f5f95, transparent: true, opacity: 0.55 }));
  lightGroup.add(tankEdges);
  // Water surface sheet on top
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(TX1 - TX0, 2 * TH), new THREE.MeshBasicMaterial({ color: 0x3a7cc4, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
  surf.rotation.x = -Math.PI / 2;
  surf.position.set((TX0 + TX1) / 2, TH, 0);
  lightGroup.add(surf);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(2 * TH, 2 * TH), new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.9, side: THREE.DoubleSide }));
  wall.rotation.y = -Math.PI / 2;
  wall.position.set(XW + 0.02, 0, 0);
  lightGroup.add(wall);

  const NP = PMT_N * PMT_N;
  const pmtPos = new Float32Array(NP * 3);
  const pmtCol = new Float32Array(NP * 3);
  const pmtR = new Float32Array(NP);
  const pmtHit = new Float32Array(NP);
  for (let i = 0; i < PMT_N; i++) {
    for (let j = 0; j < PMT_N; j++) {
      const k = i * PMT_N + j;
      const y = -TH + PMT_STEP * (i + 0.5);
      const z = -TH + PMT_STEP * (j + 0.5);
      pmtPos[k * 3] = XW - 0.01;
      pmtPos[k * 3 + 1] = y;
      pmtPos[k * 3 + 2] = z;
      pmtR[k] = Math.hypot(y, z);
    }
  }
  const pmtGeo = new THREE.BufferGeometry();
  pmtGeo.setAttribute('position', new THREE.BufferAttribute(pmtPos, 3));
  const pmtColAttr = new THREE.BufferAttribute(pmtCol, 3);
  pmtColAttr.setUsage(THREE.DynamicDrawUsage);
  pmtGeo.setAttribute('color', pmtColAttr);
  const pmtMat = new THREE.ShaderMaterial({
    vertexShader: pmtVert, fragmentShader: pmtFrag, uniforms: { uSize: { value: 150 } }, depthWrite: false,
  });
  const pmts = new THREE.Points(pmtGeo, pmtMat);
  pmts.frustumCulled = false;
  lightGroup.add(pmts);

  // Crisp ring where light from the current position lands
  const ringPos = new Float32Array(RING_SEG * 2 * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3).setUsage(THREE.DynamicDrawUsage));
  const ring = new THREE.LineSegments(ringGeo, new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.95 }));
  ring.frustumCulled = false;
  lightGroup.add(ring);

  // Light rays from the particle to the ring
  const rayPos = new Float32Array(NRAY * 2 * 3);
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  rays.frustumCulled = false;
  lightGroup.add(rays);

  const mediumLabel = stage.label('', [XW - 2.4, -TH - 0.45, TH], 'muted', lightGroup);
  stage.label('PMT wall', [XW, TH + 0.4, 0], 'muted', lightGroup);

  // =====================================================================
  // Particle, track, wavelets, cone
  // =====================================================================
  const particleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  scene.add(particleMesh);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  particleMesh.add(halo);
  const trackPos = new Float32Array(6);
  const trackGeo = new THREE.BufferGeometry();
  trackGeo.setAttribute('position', new THREE.BufferAttribute(trackPos, 3).setUsage(THREE.DynamicDrawUsage));
  const track = new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.9 }));
  track.frustumCulled = false;
  scene.add(track);
  const axisLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(TX0, 0, 0), new THREE.Vector3(XW, 0, 0)]),
    new THREE.LineDashedMaterial({ color: 0x3a4660, dashSize: 0.15, gapSize: 0.12 }),
  );
  axisLine.computeLineDistances();
  scene.add(axisLine);

  // Wavelet pool
  const wx = new Float64Array(NW);
  const wr = new Float64Array(NW);
  const wage = new Float64Array(NW);
  const wpass = new Int32Array(NW);
  const walive = new Uint8Array(NW);
  let wNext = 0;
  const envX = new Float64Array(NW);
  const envR = new Float64Array(NW);

  const sphereGeo = new THREE.SphereGeometry(1, 36, 18);
  const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(NW), 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  sphereGeo.setAttribute('aAlpha', alphaAttr);
  const sphereMat = new THREE.ShaderMaterial({
    vertexShader: rimVert, fragmentShader: rimFrag,
    uniforms: { uColor: { value: new THREE.Color(WAVE_BLUE) }, uGain: { value: 0.55 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, NW);
  spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spheres.frustumCulled = false;
  spheres.renderOrder = 2;
  scene.add(spheres);

  // Wavelet circles in the vertical slice through the track
  const circPos = new Float32Array(NW * CSEG * 2 * 3);
  const circCol = new Float32Array(NW * CSEG * 2 * 3);
  const circGeo = new THREE.BufferGeometry();
  circGeo.setAttribute('position', new THREE.BufferAttribute(circPos, 3).setUsage(THREE.DynamicDrawUsage));
  circGeo.setAttribute('color', new THREE.BufferAttribute(circCol, 3).setUsage(THREE.DynamicDrawUsage));
  const circles = new THREE.LineSegments(circGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  circles.frustumCulled = false;
  circles.renderOrder = 3;
  scene.add(circles);
  const cosT = new Float32Array(CSEG + 1);
  const sinT = new Float32Array(CSEG + 1);
  for (let s = 0; s <= CSEG; s++) { cosT[s] = Math.cos((2 * Math.PI * s) / CSEG); sinT[s] = Math.sin((2 * Math.PI * s) / CSEG); }

  // Wavefront cone: apex at the particle, opening backward along −x
  const coneGeo = new THREE.ConeGeometry(1, 1, 72, 1, true);
  coneGeo.translate(0, -0.5, 0); // apex at origin, base at y = −1
  const coneMat = new THREE.ShaderMaterial({
    vertexShader: coneVert, fragmentShader: coneFrag,
    uniforms: { uColor: { value: new THREE.Color(BLUE) }, uGain: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.rotation.z = -Math.PI / 2; // local +y → world +x, so the base trails behind
  cone.renderOrder = 4;
  cone.frustumCulled = false;
  scene.add(cone);

  // Angle arc at the particle
  const arcPos = new Float32Array((ARC_SEG + 1) * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3).setUsage(THREE.DynamicDrawUsage));
  const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: PALETTE.text }));
  arc.frustumCulled = false;
  scene.add(arc);
  const arcRay = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: PALETTE.text, transparent: true, opacity: 0.8 }));
  const arcRayPos = new Float32Array(6);
  arcRay.geometry.setAttribute('position', new THREE.BufferAttribute(arcRayPos, 3).setUsage(THREE.DynamicDrawUsage));
  arcRay.frustumCulled = false;
  scene.add(arcRay);
  const angleLabel = stage.label('', [0, 0, 0], 'big');
  const statusLabel = stage.label('', [0, -TH + 0.6, 0], '');
  const coneLabel = stage.label('', [0, 0, 0], 'muted');

  // =====================================================================
  // Overlays: legend (left) and spectrum inset (right)
  // =====================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  const paintLegend = () => {
    if (view === 'light') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Cherenkov light</div>
<div>${sw(PALETTE.amber, '●')} charged particle at βc</div>
<div>${sw(WAVE_BLUE, '○ wavelets')} of light, growing at c/n</div>
<div>${sw(BLUE, '■ cone')}: where the wavelets pile up</div>
<div>${sw(0xbfe0ff, '◯ ring')} on the PMT wall, light at angle θ</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Mach cone (sound)</div>
<div>${sw(PALETTE.amber, '●')} jet at speed M·c<sub>s</sub></div>
<div>${sw(SOUND, '○ sound wavelets')} growing at c<sub>s</sub></div>
<div>${sw(SOUND, '■ shock cone')}, half-angle α with sin α = 1/M</div>`;
    }
  };

  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 260;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '130px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const L0 = 300;
  const L1 = 700;
  // Fixed vertical scale: glass at β → 1, at 300 nm, fills the box.
  const specMax = frankTammPerNm(1.5, 0.99999, L0);
  function drawSpectrum(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    ictx.font = '21px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('photons per nm  dN/dλ ∝ sin²θ/λ²', 14, 28);
    const x0 = 16;
    const x1 = W - 14;
    const yb = H - 38;
    const yt = 46;
    const xOf = (l: number) => x0 + ((l - L0) / (L1 - L0)) * (x1 - x0);
    const yOf = (v: number) => yb - (v / specMax) * (yb - yt);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    ictx.beginPath();
    ictx.moveTo(x0, yb + 0.5);
    ictx.lineTo(x1, yb + 0.5);
    ictx.stroke();
    ictx.fillStyle = '#56627c';
    for (const l of [300, 400, 500, 600, 700]) ictx.fillText(String(l), xOf(l) - (l === 700 ? 36 : 12), H - 12);
    const nn = n();
    if (!isAbove(nn, beta)) {
      ictx.fillStyle = '#dfe6f3';
      ictx.font = '600 24px JetBrains Mono, monospace';
      ictx.fillText('below threshold: no light', x0 + 10, (yb + yt) / 2 + 8);
      return;
    }
    // Filled columns coloured by wavelength
    const step = 4;
    for (let l = L0; l < L1; l += step) {
      const v = frankTammPerNm(nn, beta, l + step / 2);
      const [r, g, b] = lambdaRGB(l + step / 2);
      ictx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},0.75)`;
      const y = Math.max(yt - 6, yOf(v));
      ictx.fillRect(xOf(l), y, xOf(l + step) - xOf(l) + 0.5, yb - y);
    }
    ictx.strokeStyle = '#dfe6f3';
    ictx.lineWidth = 2.5;
    ictx.beginPath();
    for (let l = L0; l <= L1; l += 5) {
      const y = Math.max(yt - 6, yOf(frankTammPerNm(nn, beta, l)));
      if (l === L0) ictx.moveTo(xOf(l), y);
      else ictx.lineTo(xOf(l), y);
    }
    ictx.stroke();
    ictx.fillStyle = '#dfe6f3';
    ictx.font = '600 22px JetBrains Mono, monospace';
    const vis = photonsPerCm(nn, beta, 400, 700);
    const txt = `${vis < 10 ? vis.toFixed(2) : vis.toFixed(0)} photons/cm (400–700 nm)`;
    ictx.fillText(txt, W - 14 - ictx.measureText(txt).width, 62);
  }

  // =====================================================================
  // Simulation state
  // =====================================================================
  let xp = X0;
  let inside = true;
  let passT = 0; // time since the particle left
  let pass = 0;
  let emitAcc = 0;
  let coneFade = 1;
  let envDeg = NaN;
  let envTimer = 0;

  function newPass(): void {
    pass++;
    xp = X0;
    inside = true;
    passT = 0;
    emitAcc = 1 / density; // emit immediately
    coneFade = 1;
    envDeg = NaN;
  }

  function clearWavelets(): void {
    walive.fill(0);
    pmtHit.fill(0);
  }

  function emit(x: number, age: number): void {
    const i = wNext;
    wNext = (wNext + 1) % NW;
    wx[i] = x;
    wage[i] = age;
    wr[i] = wSpeed() * age;
    wpass[i] = pass;
    walive[i] = 1;
  }

  const m4 = new THREE.Matrix4();
  const vp = new THREE.Vector3();
  const vq = new THREE.Quaternion();
  const vs = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const cWave = new THREE.Color();

  function drawWavelets(): void {
    cWave.set(view === 'light' ? WAVE_BLUE : SOUND);
    const alpha = alphaAttr.array as Float32Array;
    let seg = 0;
    for (let i = 0; i < NW; i++) {
      if (!walive[i]) {
        spheres.setMatrixAt(i, zero);
        alpha[i] = 0;
        continue;
      }
      const u = wage[i] / LIFE;
      const a = Math.min(1, wage[i] / 0.15) * (1 - u) * (1 - u);
      alpha[i] = a;
      m4.compose(vp.set(wx[i], 0, 0), vq, vs.setScalar(Math.max(1e-3, wr[i])));
      spheres.setMatrixAt(i, m4);
      const k = 0.85 * a;
      const r = wr[i];
      for (let s = 0; s < CSEG; s++) {
        const o = seg * 6;
        circPos[o] = wx[i] + r * cosT[s];
        circPos[o + 1] = r * sinT[s];
        circPos[o + 2] = 0;
        circPos[o + 3] = wx[i] + r * cosT[s + 1];
        circPos[o + 4] = r * sinT[s + 1];
        circPos[o + 5] = 0;
        circCol[o] = circCol[o + 3] = cWave.r * k;
        circCol[o + 1] = circCol[o + 4] = cWave.g * k;
        circCol[o + 2] = circCol[o + 5] = cWave.b * k;
        seg++;
      }
    }
    spheres.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    circGeo.setDrawRange(0, seg * 2);
    (circGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (circGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Length behind the apex covered by wavelets of this pass (for the cone and envelope fit). */
  function coveredLength(): number {
    let xmin = Infinity;
    for (let i = 0; i < NW; i++) if (walive[i] && wpass[i] === pass && wx[i] < xmin) xmin = wx[i];
    return Number.isFinite(xmin) ? Math.max(0, xp - xmin) : 0;
  }

  function measureEnvelope(): void {
    envDeg = NaN;
    if (!above() || !inside) return;
    let c = 0;
    for (let i = 0; i < NW; i++) {
      if (walive[i] && wpass[i] === pass) { envX[c] = wx[i]; envR[c] = wr[i]; c++; }
    }
    const L = coveredLength();
    if (c < 6 || L < 1.2) return;
    const phi = envelopeHalfAngle(xp, envX, envR, c, 1.5 * uSpeed() / density, L, 32);
    if (!Number.isFinite(phi)) return;
    envDeg = view === 'light' ? 90 - phi / DEG : phi / DEG;
  }

  function drawGeometry(dt: number): void {
    const up = above();
    const half = coneHalf();
    const theta = view === 'light' ? cherenkovAngle(n(), beta) : half;

    particleMesh.visible = inside;
    particleMesh.position.set(xp, 0, 0);
    trackPos[0] = X0;
    trackPos[3] = inside ? xp : X1;
    (trackGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Cone
    coneFade = inside ? Math.min(1, coneFade + dt * 3) : Math.max(0, coneFade - dt * 2.5);
    const L = coveredLength();
    const showCone = up && Number.isFinite(half) && L > 0.05 && coneFade > 0;
    cone.visible = showCone;
    if (showCone) {
      const h = Math.min(L * Math.cos(half) ** 2 * 1.02, L);
      cone.position.set(xp, 0, 0);
      cone.scale.set(h * Math.tan(half), h, h * Math.tan(half));
      coneMat.uniforms.uGain.value = (view === 'light' ? 0.55 + 0.9 * Math.min(1, Math.sin(theta) ** 2 / 0.3) : 0.9) * coneFade;
    }

    // Arc for θ (light: between track and ray, forward) or α (sound: between axis and cone, backward)
    const showArc = up && inside && theta > 0.2 * DEG;
    arc.visible = showArc;
    arcRay.visible = showArc;
    angleLabel.visible = showArc;
    if (showArc) {
      const R = 1.25;
      const back = view === 'sound';
      for (let s = 0; s <= ARC_SEG; s++) {
        const a = (theta * s) / ARC_SEG;
        arcPos[s * 3] = xp + (back ? -1 : 1) * R * Math.cos(a);
        arcPos[s * 3 + 1] = R * Math.sin(a);
        arcPos[s * 3 + 2] = 0;
      }
      (arcGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const RR = back ? Math.min(3, L) : 2.2;
      arcRayPos[0] = xp; arcRayPos[1] = 0; arcRayPos[2] = 0;
      arcRayPos[3] = xp + (back ? -1 : 1) * RR * Math.cos(theta);
      arcRayPos[4] = RR * Math.sin(theta);
      arcRayPos[5] = 0;
      (arcRay.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const am = Math.max(theta / 2, 4 * DEG);
      angleLabel.position.set(xp + (back ? -1 : 1) * 1.75 * Math.cos(am), 1.75 * Math.sin(am) + 0.1, 0);
    }
    if (view === 'sound' || !showCone) coneLabel.visible = false;
    else {
      coneLabel.visible = true;
      const h = Math.min(L * Math.cos(half) ** 2, L) * 0.7;
      coneLabel.position.set(xp - h, -h * Math.tan(half) - 0.35, 0);
    }

    // Rays and ring on the wall (light view)
    const rayOn = view === 'light' && up && inside;
    rays.visible = rayOn;
    ring.visible = rayOn;
    const D = XW - xp;
    const Rw = D * Math.tan(theta);
    if (rayOn) {
      for (let k = 0; k < NRAY; k++) {
        const a = (2 * Math.PI * k) / NRAY;
        const o = k * 6;
        rayPos[o] = xp; rayPos[o + 1] = 0; rayPos[o + 2] = 0;
        // Stop the ray where it leaves the tank if the ring is off the wall
        let f = 1;
        const cy = Math.abs(Math.cos(a)) * Rw;
        const cz = Math.abs(Math.sin(a)) * Rw;
        const over = Math.max(cy, cz);
        if (over > TH) f = TH / over;
        rayPos[o + 3] = xp + D * f;
        rayPos[o + 4] = Rw * Math.cos(a) * f;
        rayPos[o + 5] = Rw * Math.sin(a) * f;
      }
      (rayGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      for (let s = 0; s < RING_SEG; s++) {
        const o = s * 6;
        const y0 = Rw * Math.cos((2 * Math.PI * s) / RING_SEG);
        const z0 = Rw * Math.sin((2 * Math.PI * s) / RING_SEG);
        const y1 = Rw * Math.cos((2 * Math.PI * (s + 1)) / RING_SEG);
        const z1 = Rw * Math.sin((2 * Math.PI * (s + 1)) / RING_SEG);
        const on = Math.abs(y0) < TH && Math.abs(z0) < TH && Math.abs(y1) < TH && Math.abs(z1) < TH;
        ringPos[o] = XW - 0.03; ringPos[o + 1] = on ? y0 : 0; ringPos[o + 2] = on ? z0 : 0;
        ringPos[o + 3] = XW - 0.03; ringPos[o + 4] = on ? y1 : 0; ringPos[o + 5] = on ? z1 : 0;
      }
      (ringGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // PMT hits: light a band of width ~ one PMT around the current ring, then fade.
    if (view === 'light') {
      const decay = Math.exp(-dt / 0.45);
      const gain = rayOn ? Math.min(1, 0.35 + Math.sin(theta) ** 2 * 2.5) : 0;
      for (let k = 0; k < NP; k++) {
        let h = pmtHit[k] * decay;
        if (gain > 0 && Math.abs(pmtR[k] - Rw) < PMT_STEP * 0.75) h = Math.min(1, h + gain * dt * 9);
        pmtHit[k] = h;
        const o = k * 3;
        pmtCol[o] = 0.16 + h * 0.55;
        pmtCol[o + 1] = 0.13 + h * 0.78;
        pmtCol[o + 2] = 0.08 + h * 1.0;
      }
      pmtColAttr.needsUpdate = true;
    }
  }

  function updateLabels(): void {
    const up = above();
    if (view === 'light') {
      const th = cherenkovAngle(n(), beta) / DEG;
      (angleLabel.element as HTMLElement).textContent = `θ = ${th.toFixed(1)}°`;
      (coneLabel.element as HTMLElement).textContent = 'wavefront cone';
      (statusLabel.element as HTMLElement).textContent = up
        ? ''
        : `below threshold: β < 1/n = ${thresholdBeta(n()).toFixed(4)}. Wavelets nest, no cone.`;
    } else {
      (angleLabel.element as HTMLElement).textContent = `α = ${(machAngle(mach) / DEG).toFixed(1)}°`;
      (statusLabel.element as HTMLElement).textContent = up ? '' : 'subsonic: waves nest, no shock cone';
    }
    statusLabel.visible = !up;
    mediumLabel.element.textContent = `${medium} · n = ${n()}`;
  }

  // =====================================================================
  // Frame loop
  // =====================================================================
  stage.onFrame((dt) => {
    if (playing) {
      const u = uSpeed();
      const w = wSpeed();
      // Age wavelets
      for (let i = 0; i < NW; i++) {
        if (!walive[i]) continue;
        wage[i] += dt;
        wr[i] += w * dt;
        if (wage[i] > LIFE) walive[i] = 0;
      }
      if (inside) {
        xp += u * dt;
        emitAcc += dt;
        const dtE = 1 / density;
        while (emitAcc >= dtE) {
          emitAcc -= dtE;
          const x = xp - u * emitAcc;
          if (x <= X1) emit(x, emitAcc);
        }
        if (xp >= X1) { xp = X1; inside = false; passT = 0; }
      } else {
        passT += dt;
        if (passT > PAUSE) newPass();
      }
      envTimer += dt;
      if (envTimer > 0.25) { envTimer = 0; measureEnvelope(); }
    }
    drawWavelets();
    drawGeometry(playing ? dt : 0);
    updateReadouts();
  });

  // =====================================================================
  // Controls
  // =====================================================================
  const ui = new Panel(panel);
  ui.section('Particle');
  ui.slider({
    key: 'beta', label: 'Speed β = v/c', min: 0.5, max: 0.9999, step: 0.0001, value: beta,
    format: (v) => v.toFixed(4),
    onInput: (v) => { beta = v; onParams(); },
  });
  ui.select<Medium>({
    key: 'medium', label: 'Medium', value: medium,
    options: [{ value: 'water', label: 'Water 1.33' }, { value: 'glass', label: 'Glass 1.5' }, { value: 'air', label: 'Air 1.0003' }],
    onChange: (v) => { medium = v; onParams(); },
  });
  ui.select<Particle>({
    key: 'particle', label: 'Particle', value: particle,
    options: [{ value: 'electron', label: 'Electron' }, { value: 'muon', label: 'Muon' }],
    onChange: (v) => { particle = v; onParams(); },
  });

  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'light', label: 'Cherenkov light' }, { value: 'sound', label: 'Mach cone (sound)' }],
    onChange: (v) => { setView(v); },
  });
  ui.slider({
    key: 'mach', label: 'Mach number M (sound view)', min: 0.5, max: 3, step: 0.01, value: mach,
    format: (v) => v.toFixed(2),
    onInput: (v) => { mach = v; onParams(); },
  });
  ui.slider({
    key: 'density', label: 'Wavelet density', min: 4, max: 24, step: 1, value: density, unit: '/s',
    onInput: (v) => { density = v; },
  });
  ui.select<Cam>({
    key: 'camera', label: 'Camera', value: 'side',
    options: [{ value: 'side', label: 'Side' }, { value: 'detector', label: 'Toward the wall' }],
    onChange: (v) => stage.flyTo(CAM[v], TGT[v]),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Restart pass', onClick: () => { clearWavelets(); newPass(); } },
  ]);

  ui.section('Live readouts');
  const rTheta = ui.readout('theta', 'angle θ');
  const rEnv = ui.readout('envelope', 'envelope θ (fit)');
  const rBetaT = ui.readout('betaT', 'threshold β = 1/n');
  const rGamma = ui.readout('gamma', 'Lorentz γ');
  const rKE = ui.readout('ke', 'kinetic energy');
  const rKET = ui.readout('keT', 'threshold energy');
  const rPh = ui.readout('photons', 'photons/cm, 400–700 nm');
  const rMax = ui.readout('thetaMax', 'max θ (β → 1)');
  ui.note('The envelope angle is measured from the drawn wavelets by fitting their outer edge. It should match the formula.');

  const fmtE = (e: number) => (e >= 1000 ? `${(e / 1000).toFixed(2)} GeV` : e >= 10 ? `${e.toFixed(1)} MeV` : `${e.toFixed(3)} MeV`);

  function updateReadouts(): void {
    const nn = n();
    const m = MASS_MEV[particle];
    if (view === 'light') {
      const up = isAbove(nn, beta);
      rTheta(up ? `${(cherenkovAngle(nn, beta) / DEG).toFixed(2)}°` : 'none');
    } else {
      rTheta(mach > 1 ? `α ${(machAngle(mach) / DEG).toFixed(2)}°` : 'subsonic');
    }
    rEnv(Number.isFinite(envDeg) ? `${envDeg.toFixed(2)}°` : '…');
    rBetaT(thresholdBeta(nn).toFixed(4));
    rGamma(gammaOf(beta).toFixed(3));
    rKE(fmtE(kineticMeV(beta, m)));
    rKET(fmtE(thresholdKinetic(nn, m)));
    const ph = photonsPerCm(nn, beta, 400, 700);
    rPh(ph < 10 ? ph.toFixed(2) : ph.toFixed(0));
    rMax(`${(Math.acos(1 / nn) / DEG).toFixed(2)}°`);
  }

  function onParams(): void {
    if (medium === 'water') {
      if (!isAbove(n(), beta)) armed = true;
      else if (armed) crossedUp = true;
    }
    envDeg = NaN;
    updateLabels();
    drawSpectrum();
  }

  function setView(v: View): void {
    view = v;
    lightGroup.visible = v === 'light';
    inset.style.display = v === 'light' ? '' : 'none';
    sphereMat.uniforms.uColor.value.set(v === 'light' ? WAVE_BLUE : SOUND);
    sphereMat.uniforms.uGain.value = v === 'light' ? 0.55 : 0.4;
    coneMat.uniforms.uColor.value.set(v === 'light' ? BLUE : 0xc9d3e6);
    if (v === 'sound') pmtHit.fill(0);
    clearWavelets();
    newPass();
    paintLegend();
    onParams();
  }

  setView('light');

  return {
    state: () => {
      const nn = n();
      const m = MASS_MEV[particle];
      return {
        view,
        medium,
        particle,
        n: nn,
        beta,
        above: isAbove(nn, beta),
        thetaDeg: cherenkovAngle(nn, beta) / DEG,
        gamma: gammaOf(beta),
        keMeV: kineticMeV(beta, m),
        keThreshold: thresholdKinetic(nn, m),
        photons: photonsPerCm(nn, beta, 400, 700),
        crossedUp,
        mach,
        machDeg: mach > 1 ? machAngle(mach) / DEG : 0,
        density,
        envelopeDeg: Number.isFinite(envDeg) ? envDeg : 0,
        playing,
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
  id: 'cherenkov',
  number: 41,
  title: 'Cherenkov Radiation',
  domain: 'em',
  level: 2,
  status: 'live',
  tagline: 'A blue sonic boom made of light.',
  content,
  mount,
};

export default topic;
