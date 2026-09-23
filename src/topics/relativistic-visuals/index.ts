import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { content } from './content.ts';
import {
  buildBlackbodyLut,
  classicalDeaberrateCos,
  classicalNoShiftCos,
  deaberrateCos,
  DEG,
  dopplerObs,
  emissionTime,
  fractionInCone,
  gamma,
  halfSkyAngle,
  LUT_TMAX,
  LUT_TMIN,
  makeStars,
  noShiftCos,
  terrellRotation,
} from './physics.ts';

type View = 'flight' | 'terrell';
type Lens = 'camera' | 'sky';

const LUT_N = 256;
const N_STARS = 5000;
const FLY_C = 10; // lattice units per second of flight at β = 1
const LAT_S = 6; // lattice spacing
const NX = 6;
const NY = 4;
const NZ = 12;
const ZH = (NZ * LAT_S) / 2;
const FOV_FLIGHT = 80;
const EYE_R = 0.01;
const CONE_DEG = 25;
const T_CUBE = 5800;

const TERRELL_C = 4; // scene units of light travel per second
const TRACK_Z = -4;
const CUBE_Y = 1.1;
const SPHERE_Y = -1.1;
const X_LOOP = 9;
const TERRELL_CAM: [number, number, number] = [0, 0.8, 4.4];
const TERRELL_TARGET: [number, number, number] = [0, 0, TRACK_Z];

// ---------------------------------------------------------------- shaders

const COMMON = /* glsl */ `
uniform float uBeta;
uniform float uGamma;
uniform float uAber;
uniform float uDop;
uniform float uBeam;
uniform float uMode;
uniform mat4 uProj;
uniform float uFish;
uniform float uAspect;
uniform float uScaleX;
uniform float uShiftX;
uniform vec2 uClip;
uniform vec3 uEye;
uniform sampler2D uLut;
uniform float uLogTmin;
uniform float uLogTrange;
const vec3 FWD = vec3(0.0, 0.0, -1.0);
const float PI = 3.141592653589793;

// Rest-frame direction n -> seen direction. D is the Doppler factor, surf the brightness
// factor of an extended surface (D^4 in relativity).
vec3 aberrate(vec3 n, out float D, out float surf) {
  float c = dot(n, FWD);
  vec3 perp = n - c * FWD;
  float s = length(perp);
  vec3 e = s > 1e-6 ? perp / s : vec3(1.0, 0.0, 0.0);
  float cp;
  if (uMode < 0.5) {
    D = uGamma * (1.0 + uBeta * c);
    cp = (c + uBeta) / (1.0 + uBeta * c);
    surf = D * D * D * D;
  } else {
    D = 1.0 + uBeta * c;
    float q = 1.0 + 2.0 * uBeta * c + uBeta * uBeta;
    cp = (c + uBeta) / sqrt(q);
    surf = D * q * sqrt(q);
  }
  if (uAber < 0.5) return n;
  return cp * FWD + sqrt(max(0.0, 1.0 - cp * cp)) * e;
}

vec3 bb(float T) {
  float x = clamp((log(max(T, 1.0)) - uLogTmin) / uLogTrange, 0.0, 1.0);
  return texture2D(uLut, vec2(x * ${((LUT_N - 1) / LUT_N).toFixed(6)} + ${(0.5 / LUT_N).toFixed(6)}, 0.5)).rgb;
}
`;

const PROJECT = /* glsl */ `
vec4 project(vec3 p) {
  vec3 v = mat3(viewMatrix) * (p - uEye);
  vec4 clip;
  if (uFish > 0.5) {
    float d = max(length(v), 1e-6);
    vec3 u = v / d;
    float th = acos(clamp(-u.z, -1.0, 1.0));
    float rr = length(u.xy);
    vec2 q = rr > 1e-6 ? u.xy / rr : vec2(0.0);
    float R = th / PI * 0.96;
    clip = vec4(q.x * R / uAspect, q.y * R, 0.0, 1.0);
  } else {
    clip = uProj * vec4(v, 1.0);
  }
  clip.x = clip.x * uScaleX + uShiftX * clip.w;
  return clip;
}
float viewAngle(vec3 p) {
  vec3 v = normalize(mat3(viewMatrix) * (p - uEye));
  return acos(clamp(-v.z, -1.0, 1.0));
}
`;

const CLIP_TEST = /* glsl */ `if (gl_FragCoord.x < uClip.x || gl_FragCoord.x > uClip.y) discard;`;

const STAR_VERT = /* glsl */ `
${COMMON}
${PROJECT}
attribute vec3 aDir;
attribute float aTemp;
attribute float aLum;
uniform float uPx;
uniform float uStarExp;
varying vec3 vCol;
void main() {
  float D, surf;
  vec3 n2 = aberrate(aDir, D, surf);
  gl_Position = project(uEye + n2 * 1000.0);
  float T = uDop > 0.5 ? aTemp * D : aTemp;
  float f = aLum * uStarExp * (uBeam > 0.5 ? D * D : 1.0);
  float b = 1.0 - exp(-f);
  gl_PointSize = uPx * min(14.0, 1.6 + 3.0 * sqrt(b) + 1.6 * log(1.0 + f));
  vCol = bb(T) * b;
}`;

const STAR_FRAG = /* glsl */ `
uniform vec2 uClip;
varying vec3 vCol;
void main() {
  ${CLIP_TEST}
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 16.0);
  if (a < 0.02) discard;
  gl_FragColor = vec4(pow(vCol * a * 1.5, vec3(1.0 / 2.2)), 1.0);
}`;

const BG_VERT = /* glsl */ `
uniform vec2 uRect;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(mix(uRect.x, uRect.y, uv.x), position.y, 0.0, 1.0);
}`;

const BG_FRAG = /* glsl */ `
${COMMON}
uniform float uTanH;
uniform float uGlowExp;
varying vec2 vUv;
const vec3 GAL = vec3(0.2, 0.95, 0.24);
const vec3 BG = vec3(0.027, 0.039, 0.071);
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 dv;
  float rim = 0.0;
  if (uFish > 0.5) {
    vec2 q = vec2(p.x * uAspect, p.y) / 0.96;
    float R = length(q);
    rim = smoothstep(0.006, 0.0, abs(R - 1.0) * 0.96);
    if (R > 1.0) { gl_FragColor = vec4(BG + rim * vec3(0.18, 0.22, 0.32), 1.0); return; }
    float th = R * PI;
    vec2 qh = R > 1e-6 ? q / R : vec2(0.0);
    dv = vec3(sin(th) * qh, -cos(th));
  } else {
    dv = normalize(vec3(p.x * uTanH * uAspect, p.y * uTanH, -1.0));
  }
  vec3 np = transpose(mat3(viewMatrix)) * dv;
  float cp = dot(np, FWD);
  vec3 perp = np - cp * FWD;
  float s = length(perp);
  vec3 e = s > 1e-6 ? perp / s : vec3(1.0, 0.0, 0.0);
  float c = cp;
  if (uAber > 0.5) {
    if (uMode < 0.5) c = (cp - uBeta) / (1.0 - uBeta * cp);
    else {
      float lam = uBeta * cp + sqrt(uBeta * uBeta * cp * cp - uBeta * uBeta + 1.0);
      c = lam * cp - uBeta;
    }
  }
  vec3 n = c * FWD + sqrt(max(0.0, 1.0 - c * c)) * e;
  float D, surf;
  aberrate(n, D, surf);
  float band = exp(-pow(dot(n, normalize(GAL)) / 0.16, 2.0));
  float lumpy = 0.7 + 0.3 * sin(9.0 * n.x + 4.0 * n.z) * sin(7.0 * n.y - 5.0 * n.z);
  float I = 0.012 + 0.05 * band * lumpy;
  float T = 4800.0 * (uDop > 0.5 ? D : 1.0);
  float k = I * uGlowExp * (uBeam > 0.5 ? surf : 1.0);
  vec3 col = bb(T) * (1.0 - exp(-k));
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)) + BG * (1.0 - min(1.0, k)), 1.0);
}`;

const CUBE_VERT = /* glsl */ `
${COMMON}
${PROJECT}
uniform float uPhase;
uniform float uZH;
varying vec2 vUv;
varying float vD;
varying float vSurf;
varying float vFade;
void main() {
  vec3 center = instanceMatrix[3].xyz;
  center.z = mod(center.z + uPhase + uZH, 2.0 * uZH) - uZH;
  vec3 wp = center + mat3(instanceMatrix) * position;
  vec3 rel = wp - uEye;
  float r = length(rel);
  float D, surf;
  vec3 n2 = aberrate(rel / r, D, surf);
  vec3 seen = uEye + n2 * r;
  gl_Position = project(seen);
  vUv = uv;
  vD = D;
  vSurf = surf;
  vFade = smoothstep(uZH, uZH - 8.0, abs(center.z));
  if (uFish > 0.5) vFade *= smoothstep(2.95, 2.75, viewAngle(seen));
}`;

const CUBE_FRAG = /* glsl */ `
${COMMON}
uniform float uCubeExp;
varying vec2 vUv;
varying float vD;
varying float vSurf;
varying float vFade;
void main() {
  ${CLIP_TEST}
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float glow = 0.012 + exp(-e * 45.0);
  float T = ${T_CUBE.toFixed(1)} * (uDop > 0.5 ? vD : 1.0);
  float k = glow * uCubeExp * (uBeam > 0.5 ? vSurf : 1.0);
  vec3 col = bb(T) * (1.0 - exp(-k)) * vFade;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const RING_VERT = /* glsl */ `
${COMMON}
${PROJECT}
uniform vec3 uC;
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uAng;
void main() {
  vec3 d = cos(uAng) * uC + sin(uAng) * (cos(position.x) * uE1 + sin(position.x) * uE2);
  gl_Position = project(uEye + d * 500.0);
}`;

const RING_FRAG = /* glsl */ `
uniform vec2 uClip;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  ${CLIP_TEST}
  gl_FragColor = vec4(uColor, uOpacity);
}`;

const TERRELL_VERT = /* glsl */ `
uniform float uB;
uniform float uG;
uniform float uT;
uniform vec3 uC0;
uniform vec3 uCam;
uniform float uSeen;
attribute vec3 color;
varying vec3 vCol;
varying vec3 vN;
void main() {
  // Rest shape, Lorentz-contracted along x, centre at uC0 + (beta t, 0, 0).
  vec3 A = uC0 + vec3(position.x / uG, position.y, position.z);
  float t = uT;
  if (uSeen > 0.5) {
    // Solve |A + beta t_e x - C| = uT - t_e for the emission time t_e < uT.
    vec3 R = A - uCam;
    float k = 1.0 - uB * uB;
    float h = uT + uB * R.x;
    float sq = sqrt(max(h * h - k * (uT * uT - dot(R, R)), 0.0));
    t = h > 0.0 ? (uT * uT - dot(R, R)) / (h + sq) : (h - sq) / k;
  }
  vec3 P = A + vec3(uB * t, 0.0, 0.0);
  vCol = color;
  vN = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}`;

const TERRELL_FRAG = /* glsl */ `
uniform float uSeen;
uniform vec3 uWire;
varying vec3 vCol;
varying vec3 vN;
void main() {
  if (uSeen < 0.5) { gl_FragColor = vec4(uWire, 0.9); return; }
  float sh = 0.62 + 0.38 * max(dot(normalize(vN), normalize(vec3(0.35, 0.7, 1.0))), 0.0);
  gl_FragColor = vec4(vCol * sh, 1.0);
}`;

// ---------------------------------------------------------------- helpers

function overlayBox(extra: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const d = document.createElement('div');
  Object.assign(d.style, {
    position: 'absolute', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '6px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration, extra);
  return d;
}

const WIRE_COL = new THREE.Color(0xdfe6f3);

function faceColoredBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const n = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i);
    const nz = n.getZ(i);
    if (nx > 0.5) c.set(PALETTE.rose); // leading face
    else if (nx < -0.5) c.set(PALETTE.amber); // trailing face
    else if (nz > 0.5) c.set(PALETTE.cyan); // faces the camera track side
    else if (nz < -0.5) c.set(PALETTE.violet);
    else c.set(0x5a6a8c); // top and bottom
    col[3 * i] = c.r;
    col[3 * i + 1] = c.g;
    col[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function stripedSphere(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 64, 40);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const warm = new THREE.Color(PALETTE.amber);
  const cool = new THREE.Color(PALETTE.cyan);
  const dark = new THREE.Color(0x1d2a44);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / r;
    const y = p.getY(i) / r;
    const z = p.getZ(i) / r;
    const lon = Math.atan2(z, x);
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    const check = (Math.floor((lon / Math.PI) * 6 + 12) + Math.floor((lat / Math.PI) * 6 + 6)) % 2 === 0;
    c.copy(x < 0 ? warm : cool);
    if (check) c.lerp(dark, 0.55);
    col[3 * i] = c.r;
    col[3 * i + 1] = c.g;
    col[3 * i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function sphereWire(r: number): THREE.BufferGeometry {
  const pts: number[] = [];
  const N = 64;
  const push = (f: (a: number) => [number, number, number]) => {
    for (let i = 0; i < N; i++) {
      pts.push(...f((i / N) * Math.PI * 2), ...f(((i + 1) / N) * Math.PI * 2));
    }
  };
  for (const lat of [-50, 0, 50]) {
    const y = r * Math.sin(lat * DEG);
    const rr = r * Math.cos(lat * DEG);
    push((a) => [rr * Math.cos(a), y, rr * Math.sin(a)]);
  }
  for (const lon of [0, 45, 90, 135]) {
    const ca = Math.cos(lon * DEG);
    const sa = Math.sin(lon * DEG);
    push((a) => [r * Math.cos(a) * ca, r * Math.sin(a), r * Math.cos(a) * sa]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pts.length).fill(0), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pts.length).fill(1), 3));
  return g;
}

// ---------------------------------------------------------------- mount

function mount({ viewport, panel }: MountContext): TopicInstance {
  let view: View = 'flight';
  let lens: Lens = 'camera';
  let beta = 0.6;
  let aber = true;
  let doppler = true;
  let beam = true;
  let split = false;
  let flying = true;
  let probeDeg = 90;
  let objBeta = 0.5;
  let objPlaying = true;
  let showWire = true;
  let touched = false;
  let tObs = 0;
  let rotDeg = 0;

  const stage = createStage(viewport, { camera: [0, 0, EYE_R], target: [0, 0, 0], fov: FOV_FLIGHT, near: 0.001, far: 5000 });
  const { scene, camera, controls, renderer } = stage;
  const cam = camera as THREE.PerspectiveCamera;

  // --- Blackbody lookup table (8-bit is plenty for colour and filters everywhere)
  const lutF = buildBlackbodyLut(LUT_N);
  const lutB = new Uint8Array(LUT_N * 4);
  for (let i = 0; i < lutF.length; i++) lutB[i] = Math.round(Math.min(1, lutF[i]) * 255);
  const lutTex = new THREE.DataTexture(lutB, LUT_N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  lutTex.magFilter = lutTex.minFilter = THREE.LinearFilter;
  lutTex.wrapS = lutTex.wrapT = THREE.ClampToEdgeWrapping;
  lutTex.needsUpdate = true;

  // --- Shared uniforms. Each half of the split view adds its own mode, projection and clip.
  const U = {
    uBeta: { value: beta },
    uGamma: { value: gamma(beta) },
    uAber: { value: 1 },
    uDop: { value: 1 },
    uBeam: { value: 1 },
    uFish: { value: 0 },
    uEye: { value: new THREE.Vector3() },
    uLut: { value: lutTex },
    uLogTmin: { value: Math.log(LUT_TMIN) },
    uLogTrange: { value: Math.log(LUT_TMAX) - Math.log(LUT_TMIN) },
    uPx: { value: 1 },
    uStarExp: { value: 1.6 },
    uTanH: { value: Math.tan((FOV_FLIGHT * DEG) / 2) },
    uGlowExp: { value: 0.25 },
    uCubeExp: { value: 0.45 },
    uPhase: { value: 0 },
    uZH: { value: ZH },
  };
  type Half = {
    uMode: { value: number };
    uProj: { value: THREE.Matrix4 };
    uAspect: { value: number };
    uScaleX: { value: number };
    uShiftX: { value: number };
    uClip: { value: THREE.Vector2 };
    uRect: { value: THREE.Vector2 };
  };
  const makeHalf = (mode: number): Half => ({
    uMode: { value: mode },
    uProj: { value: new THREE.Matrix4() },
    uAspect: { value: 1 },
    uScaleX: { value: 1 },
    uShiftX: { value: 0 },
    uClip: { value: new THREE.Vector2(0, 1e5) },
    uRect: { value: new THREE.Vector2(-1, 1) },
  });

  // Shared geometry
  const stars = makeStars(N_STARS, 11);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_STARS * 3), 3));
  starGeo.setAttribute('aDir', new THREE.BufferAttribute(stars.dir, 3));
  starGeo.setAttribute('aTemp', new THREE.BufferAttribute(stars.temp, 1));
  starGeo.setAttribute('aLum', new THREE.BufferAttribute(stars.lum, 1));

  const cubeGeo = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  const lattice: THREE.Matrix4[] = [];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      for (let k = 0; k < NZ; k++) {
        lattice.push(new THREE.Matrix4().makeTranslation((i - NX / 2 + 0.5) * LAT_S, (j - NY / 2 + 0.5) * LAT_S, -ZH + (k + 0.5) * LAT_S));
      }
    }
  }
  const ringGeo = new THREE.BufferGeometry();
  {
    const pts = new Float32Array(160 * 3);
    for (let i = 0; i < 160; i++) pts[3 * i] = (i / 160) * Math.PI * 2;
    ringGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  }

  interface FlightSet {
    group: THREE.Group;
    half: Half;
    cone: { uAng: { value: number } };
    noShift: { uAng: { value: number } };
    probe: { uC: { value: THREE.Vector3 }; uE2: { value: THREE.Vector3 } };
  }

  const FWD = new THREE.Vector3(0, 0, -1);
  const UP = new THREE.Vector3(0, 1, 0);
  const RIGHT = new THREE.Vector3(1, 0, 0);

  function makeRing(half: Half, color: number, opacity: number, ang: number, c: THREE.Vector3, e1: THREE.Vector3, e2: THREE.Vector3) {
    const ru = {
      ...U, ...half,
      uC: { value: c.clone() }, uE1: { value: e1.clone() }, uE2: { value: e2.clone() },
      uAng: { value: ang },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
    };
    const m = new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: ru, transparent: true, depthTest: false, depthWrite: false });
    const line = new THREE.LineLoop(ringGeo, m);
    line.frustumCulled = false;
    line.renderOrder = 3;
    return { line, ru };
  }

  function buildFlightSet(mode: number): FlightSet {
    const half = makeHalf(mode);
    const group = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: { ...U, ...half }, depthTest: false, depthWrite: false }),
    );
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    group.add(bg);

    const cubes = new THREE.InstancedMesh(
      cubeGeo,
      new THREE.ShaderMaterial({
        vertexShader: CUBE_VERT, fragmentShader: CUBE_FRAG, uniforms: { ...U, ...half },
        blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      }),
      lattice.length,
    );
    lattice.forEach((m, i) => cubes.setMatrixAt(i, m));
    cubes.frustumCulled = false;
    cubes.renderOrder = 0;
    group.add(cubes);

    const pts = new THREE.Points(
      starGeo,
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { ...U, ...half },
        blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
      }),
    );
    pts.frustumCulled = false;
    pts.renderOrder = 1;
    group.add(pts);

    const cone = makeRing(half, PALETTE.amber, 0.8, CONE_DEG * DEG, FWD, RIGHT, UP);
    const ns = makeRing(half, PALETTE.green, 0.8, Math.PI / 2, FWD, RIGHT, UP);
    const pr = makeRing(half, 0xffffff, 0.95, 2.2 * DEG, FWD, UP, RIGHT);
    group.add(cone.line, ns.line, pr.line);
    scene.add(group);
    return { group, half, cone: cone.ru, noShift: ns.ru, probe: pr.ru };
  }

  const rel = buildFlightSet(0);
  const cla = buildFlightSet(1);
  const sets = [rel, cla];

  // Flight labels (camera lens, single view only)
  const flightLabels: CSS2DObject[] = [];
  const fl = (text: string, cls = 'muted') => {
    const l = stage.label(text, [0, 0, -100], cls);
    flightLabels.push(l);
    return l;
  };
  const lblAhead = fl('direction of flight', '');
  lblAhead.position.set(0, -6, -100);
  const lblCone = fl('25° cone');
  const lblNoShift = fl('D = 1: no colour shift');
  const lblProbe = fl('probe', '');

  const tmpV = new THREE.Vector3();
  const ringLabelPos = (ang: number, out: THREE.Vector3, ux: number, uy: number) => {
    const s = Math.sin(ang);
    return out.set(s * ux, s * uy, 0).addScaledVector(FWD, Math.cos(ang)).multiplyScalar(100);
  };

  // ---------------------------------------------------------------- Terrell scene
  const terrell = new THREE.Group();
  scene.add(terrell);
  const tGrid = makeGrid(24, 24);
  tGrid.position.set(0, -2.3, TRACK_Z);
  terrell.add(tGrid);

  const tU = {
    uB: { value: objBeta },
    uG: { value: gamma(objBeta) },
    uT: { value: 0 },
    uCam: { value: new THREE.Vector3() },
  };
  const tMat = (c0: THREE.Vector3, seen: boolean) =>
    new THREE.ShaderMaterial({
      vertexShader: TERRELL_VERT, fragmentShader: TERRELL_FRAG,
      uniforms: { ...tU, uC0: { value: c0 }, uSeen: { value: seen ? 1 : 0 }, uWire: { value: WIRE_COL } },
      transparent: !seen,
    });
  const cubeC0 = new THREE.Vector3(0, CUBE_Y, TRACK_Z);
  const sphC0 = new THREE.Vector3(0, SPHERE_Y, TRACK_Z);
  const cubeSolid = new THREE.Mesh(faceColoredBox(), tMat(cubeC0, true));
  const sphSolid = new THREE.Mesh(stripedSphere(0.6), tMat(sphC0, true));
  const cubeWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), tMat(cubeC0, false));
  const sphWireGeo = sphereWire(0.6);
  const sphWire = new THREE.LineSegments(sphWireGeo, tMat(sphC0, false));
  {
    const eg = cubeWire.geometry;
    const n = eg.attributes.position.count;
    eg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  for (const o of [cubeSolid, sphSolid, cubeWire, sphWire]) {
    o.frustumCulled = false;
    terrell.add(o);
  }
  // Tracks
  const trackGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-14, CUBE_Y - 0.75, TRACK_Z), new THREE.Vector3(14, CUBE_Y - 0.75, TRACK_Z),
    new THREE.Vector3(-14, SPHERE_Y - 0.75, TRACK_Z), new THREE.Vector3(14, SPHERE_Y - 0.75, TRACK_Z),
  ]);
  const tracks = new THREE.LineSegments(trackGeo, new THREE.LineDashedMaterial({ color: PALETTE.gridMajor, dashSize: 0.25, gapSize: 0.2 }));
  tracks.computeLineDistances();
  terrell.add(tracks);

  const terrellLabels: CSS2DObject[] = [];
  const lblWire = stage.label('wireframe: contracted, where it is now', [0, 0, 0], 'muted');
  const lblSeen = stage.label('solid: what you see', [0, 0, 0], '');
  const lblDir = stage.label('motion →', [0, CUBE_Y + 1.6, TRACK_Z], 'muted');
  terrellLabels.push(lblWire, lblSeen, lblDir);

  // ---------------------------------------------------------------- overlays
  const tag = overlayBox({ left: '10px', top: '10px' });
  const tagR = overlayBox({ left: 'calc(50% + 10px)', top: '10px' });
  const divider = document.createElement('div');
  Object.assign(divider.style, { position: 'absolute', top: '0', bottom: '0', left: '50%', width: '1px', background: '#243049', zIndex: '2', pointerEvents: 'none' } as CSSStyleDeclaration);
  viewport.append(tag, tagR, divider);

  const legend = overlayBox({ left: '10px', bottom: '34px', width: '220px', padding: '8px 10px' });
  legend.className = 'stage-overlay';
  viewport.appendChild(legend);

  const PW = 440;
  const PH = 270;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pc = plot.getContext('2d')!;

  const bbCss = (T: number) => {
    const x = Math.max(0, Math.min(1, (Math.log(T) - Math.log(LUT_TMIN)) / (Math.log(LUT_TMAX) - Math.log(LUT_TMIN))));
    const i = Math.round(x * (LUT_N - 1));
    const g = (v: number) => Math.round(255 * Math.pow(Math.min(1, v), 1 / 2.2));
    return `rgb(${g(lutF[4 * i])},${g(lutF[4 * i + 1])},${g(lutF[4 * i + 2])})`;
  };

  function paintLegend(): void {
    if (view === 'flight') {
      const stops: string[] = [];
      const t0 = Math.log(1000);
      const t1 = Math.log(40000);
      for (let i = 0; i <= 16; i++) stops.push(`${bbCss(Math.exp(t0 + ((t1 - t0) * i) / 16))} ${((i / 16) * 100).toFixed(0)}%`);
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Colour = blackbody at D × T</div>
<div style="height:8px;border-radius:4px;margin:4px 0 2px;background:linear-gradient(90deg,${stops.join(',')})"></div>
<div style="display:flex;justify-content:space-between"><span>1000 K</span><span>6000 K</span><span>40000 K</span></div>
<div style="margin-top:5px"><span style="color:${css(PALETTE.amber)}">amber ring</span>: 25° cone</div>
<div><span style="color:${css(PALETTE.green)}">green ring</span>: D = 1, no shift</div>
<div>white circle: probe</div>
<div>drag the view to look around</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Cube faces</div>
<div><span style="color:${css(PALETTE.amber)}">amber</span>: trailing face (−x)</div>
<div><span style="color:${css(PALETTE.rose)}">rose</span>: leading face (+x)</div>
<div><span style="color:${css(PALETTE.cyan)}">cyan</span>: face toward you</div>
<div style="margin-top:3px">Sphere: amber half trails, cyan half leads.</div>`;
    }
  }

  function paintTags(): void {
    const fx = [aber ? 'aberration' : null, doppler ? 'Doppler' : null, beam ? 'searchlight' : null].filter(Boolean).join(' + ') || 'all effects off';
    if (view === 'terrell') {
      tag.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Stationary camera</div><div>cube and sphere at β = ${objBeta.toFixed(2)}</div><div>light-travel time solved per vertex</div>`;
      return;
    }
    if (split) {
      tag.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Classical light</div><div>Galilean velocity addition</div><div>β = ${beta.toFixed(3)} · ${fx}</div>`;
      tagR.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Special relativity</div><div>γ = ${gamma(beta).toFixed(3)}</div><div>β = ${beta.toFixed(3)} · ${fx}</div>`;
    } else {
      tag.innerHTML = `<div style="color:#dfe6f3;font-weight:600">What you see at β = ${beta.toFixed(3)}</div><div>${fx}</div>`;
    }
  }

  // Inset: Doppler factor against seen angle (flight) or a top view (Terrell).
  const PX0 = 58;
  const PX1 = PW - 16;
  const PY0 = 44;
  const PY1 = PH - 40;
  const LD0 = -1.4;
  const LD1 = 1.25;
  const xOfA = (deg: number) => PX0 + (deg / 180) * (PX1 - PX0);
  const yOfD = (D: number) => PY1 - ((Math.log10(Math.max(1e-3, D)) - LD0) / (LD1 - LD0)) * (PY1 - PY0);

  function drawDPlot(): void {
    pc.clearRect(0, 0, PW, PH);
    pc.font = '600 19px JetBrains Mono, monospace';
    pc.fillStyle = '#dfe6f3';
    pc.fillText('Doppler factor D vs seen angle', 14, 28);
    pc.font = '16px JetBrains Mono, monospace';
    pc.lineWidth = 1.2;
    pc.strokeStyle = '#1a2336';
    pc.fillStyle = '#8391ab';
    for (const d of [0.1, 1, 10]) {
      const y = yOfD(d);
      pc.beginPath();
      pc.moveTo(PX0, y);
      pc.lineTo(PX1, y);
      pc.strokeStyle = d === 1 ? '#3a4a66' : '#1a2336';
      pc.stroke();
      pc.fillText(String(d), 12, y + 5);
    }
    for (const a of [0, 45, 90, 135, 180]) {
      const x = xOfA(a);
      pc.strokeStyle = '#1a2336';
      pc.beginPath();
      pc.moveTo(x, PY0);
      pc.lineTo(x, PY1);
      pc.stroke();
      pc.fillText(`${a}°`, x - (a === 0 ? 4 : a === 180 ? 40 : 18), PH - 16);
    }
    // 25° cone marker
    pc.strokeStyle = css(PALETTE.amber);
    pc.setLineDash([5, 5]);
    pc.beginPath();
    pc.moveTo(xOfA(CONE_DEG), PY0);
    pc.lineTo(xOfA(CONE_DEG), PY1);
    pc.stroke();
    pc.setLineDash([]);
    const curve = (f: (deg: number) => number, color: string, dash: number[]) => {
      pc.strokeStyle = color;
      pc.lineWidth = 3;
      pc.setLineDash(dash);
      pc.beginPath();
      for (let i = 0; i <= 90; i++) {
        const a = i * 2;
        const y = Math.max(PY0 - 6, Math.min(PY1 + 6, yOfD(f(a))));
        if (i === 0) pc.moveTo(xOfA(a), y);
        else pc.lineTo(xOfA(a), y);
      }
      pc.stroke();
      pc.setLineDash([]);
    };
    curve((a) => 1 + beta * classicalDeaberrateCos(Math.cos(a * DEG), beta), css(PALETTE.violet), [7, 6]);
    curve((a) => dopplerObs(Math.cos(a * DEG), beta), css(PALETTE.cyan), []);
    if (beta > 0) {
      const a0 = Math.acos(noShiftCos(beta)) / DEG;
      pc.fillStyle = css(PALETTE.green);
      pc.beginPath();
      pc.arc(xOfA(a0), yOfD(1), 7, 0, Math.PI * 2);
      pc.fill();
    }
    pc.fillStyle = '#ffffff';
    pc.beginPath();
    pc.arc(xOfA(probeDeg), Math.max(PY0, Math.min(PY1, yOfD(dopplerObs(Math.cos(probeDeg * DEG), beta)))), 6, 0, Math.PI * 2);
    pc.fill();
    pc.font = '15px JetBrains Mono, monospace';
    pc.fillStyle = css(PALETTE.cyan);
    pc.fillText('relativity', PW - 200, PY0 + 4);
    pc.fillStyle = css(PALETTE.violet);
    pc.fillText('classical', PW - 96, PY0 + 4);
    pc.fillStyle = '#8391ab';
    pc.fillText('blue ↑  red ↓', PX0 + 6, PY1 - 8);
  }

  // Top view for the Terrell scene: x across, z down the page (camera at the bottom).
  const TS = 20; // pixels per scene unit
  const TX = (x: number) => PW / 2 + x * TS;
  const TZ = (z: number) => Math.min(PH - 22, 92 + (z - TRACK_Z) * TS);
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  function drawTopView(): void {
    pc.clearRect(0, 0, PW, PH);
    pc.font = '600 19px JetBrains Mono, monospace';
    pc.fillStyle = '#dfe6f3';
    pc.fillText('Top view of the cube', 14, 28);
    const b = objBeta;
    const g = gamma(b);
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const z0 = TZ(TRACK_Z);
    pc.strokeStyle = '#243049';
    pc.setLineDash([6, 6]);
    pc.beginPath();
    pc.moveTo(14, z0);
    pc.lineTo(PW - 14, z0);
    pc.stroke();
    pc.setLineDash([]);
    // seen outline (filled) from the retarded-time solution, in the plane of the cube's centre
    pc.fillStyle = 'rgba(245,182,66,0.55)';
    pc.beginPath();
    for (let i = 0; i < 4; i++) {
      const ax = corners[i][0] / g;
      const az = TRACK_Z + corners[i][1];
      const te = emissionTime(ax, CUBE_Y, az, cx, cy, cz, b, tObs);
      const x = TX(ax + b * te);
      const y = TZ(az);
      if (i === 0) pc.moveTo(x, y);
      else pc.lineTo(x, y);
    }
    pc.closePath();
    pc.fill();
    // contracted outline now
    pc.strokeStyle = '#dfe6f3';
    pc.lineWidth = 2;
    pc.strokeRect(TX(-0.5 / g + b * tObs), TZ(TRACK_Z - 0.5), TS / g, TS);
    // light ray from seen centre to camera
    const te = emissionTime(0, CUBE_Y, TRACK_Z, cx, cy, cz, b, tObs);
    pc.strokeStyle = css(PALETTE.amber);
    pc.lineWidth = 1.5;
    pc.beginPath();
    pc.moveTo(TX(b * te), z0);
    pc.lineTo(TX(cx), TZ(cz));
    pc.stroke();
    pc.fillStyle = '#dfe6f3';
    pc.beginPath();
    pc.arc(TX(cx), TZ(cz), 6, 0, Math.PI * 2);
    pc.fill();
    pc.font = '15px JetBrains Mono, monospace';
    pc.fillStyle = '#8391ab';
    pc.fillText('camera', TX(cx) + 10, TZ(cz) + 5);
    pc.fillText('outline: now   filled: seen', 14, 52);
  }

  // ---------------------------------------------------------------- view logic
  const panelSections: Record<string, HTMLElement> = {};

  function setLook(dir: 'ahead' | 'side' | 'back'): void {
    if (dir === 'ahead') camera.position.set(0, 0, EYE_R);
    if (dir === 'side') camera.position.set(-EYE_R, 0, 0);
    if (dir === 'back') camera.position.set(0, 0, -EYE_R);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function applyView(): void {
    const fly = view === 'flight';
    rel.group.visible = fly;
    cla.group.visible = fly && split;
    terrell.visible = !fly;
    for (const l of terrellLabels) l.visible = !fly;
    tagR.style.display = fly && split ? '' : 'none';
    divider.style.display = fly && split ? '' : 'none';
    plot.style.display = fly && split ? 'none' : '';
    if (fly) {
      cam.fov = FOV_FLIGHT;
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.minDistance = controls.maxDistance = EYE_R;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      setLook('ahead');
    } else {
      cam.fov = 60;
      controls.enableZoom = true;
      controls.minDistance = 3;
      controls.maxDistance = 20;
      controls.minPolarAngle = 0.3;
      controls.maxPolarAngle = Math.PI - 0.3;
      camera.position.set(...TERRELL_CAM);
      controls.target.set(...TERRELL_TARGET);
      controls.update();
    }
    cam.updateProjectionMatrix();
    if (panelSections.flight) {
      for (const k of ['flight', 'effects', 'probe', 'flightOut']) panelSections[k].style.display = fly ? '' : 'none';
      for (const k of ['terrell', 'terrellOut']) panelSections[k].style.display = fly ? 'none' : '';
    }
    applyFlightUniforms();
    paintLegend();
    paintTags();
  }

  function applyFlightUniforms(): void {
    U.uBeta.value = beta;
    U.uGamma.value = gamma(beta);
    U.uAber.value = aber ? 1 : 0;
    U.uDop.value = doppler ? 1 : 0;
    U.uBeam.value = beam ? 1 : 0;
    U.uFish.value = lens === 'sky' ? 1 : 0;
    rel.cone.uAng.value = cla.cone.uAng.value = CONE_DEG * DEG;
    // With aberration off the stars stay where they are, so the ring sits at its rest-frame angle.
    rel.noShift.uAng.value = Math.acos(aber ? noShiftCos(beta) : restNoShift());
    cla.noShift.uAng.value = Math.acos(aber ? classicalNoShiftCos(beta) : 0);
    const p = probeDeg * DEG;
    for (const s of sets) {
      s.probe.uC.value.copy(FWD).multiplyScalar(Math.cos(p)).addScaledVector(RIGHT, Math.sin(p));
      s.probe.uE2.value.crossVectors(s.probe.uC.value, UP);
    }
    const labelsOn = view === 'flight' && !split && lens === 'camera';
    for (const l of flightLabels) l.visible = labelsOn;
    ringLabelPos(CONE_DEG * DEG, lblCone.position, -0.6, 0.8);
    ringLabelPos(rel.noShift.uAng.value, lblNoShift.position, 0.34, -0.94);
    lblNoShift.visible = labelsOn && beta > 0.02;
    tmpV.copy(rel.probe.uC.value).multiplyScalar(100).addScaledVector(UP, -7);
    lblProbe.position.copy(tmpV);
    drawDPlot();
  }

  /** Rest-frame angle of zero shift, used when aberration is switched off (stars stay put). */
  function restNoShift(): number {
    // D = γ(1 + β cos θ) = 1  ⇒  cos θ = (1/γ − 1)/β
    return beta > 0 ? (1 / gamma(beta) - 1) / beta : 0;
  }

  // ---------------------------------------------------------------- frame loop
  const size = new THREE.Vector2();
  const dbuf = new THREE.Vector2();
  const projCam = new THREE.PerspectiveCamera(FOV_FLIGHT, 1, 0.05, 5000);

  function setHalf(h: Half, aspect: number, scale: number, shift: number, x0: number, x1: number, r0: number, r1: number): void {
    projCam.aspect = aspect;
    projCam.fov = FOV_FLIGHT;
    projCam.updateProjectionMatrix();
    h.uProj.value.copy(projCam.projectionMatrix);
    h.uAspect.value = aspect;
    h.uScaleX.value = scale;
    h.uShiftX.value = shift;
    h.uClip.value.set(x0, x1);
    h.uRect.value.set(r0, r1);
  }

  const tmpP = new THREE.Vector3();
  stage.onFrame((dt) => {
    if (view === 'flight') {
      if (flying) U.uPhase.value = (U.uPhase.value + beta * FLY_C * dt) % (2 * ZH);
      renderer.getSize(size);
      renderer.getDrawingBufferSize(dbuf);
      U.uPx.value = renderer.getPixelRatio();
      U.uEye.value.copy(camera.position);
      const W = Math.max(1, size.x);
      const H = Math.max(1, size.y);
      if (split) {
        setHalf(cla.half, W / 2 / H, 0.5, -0.5, 0, dbuf.x / 2, -1, 0);
        setHalf(rel.half, W / 2 / H, 0.5, 0.5, dbuf.x / 2, dbuf.x + 1, 0, 1);
      } else {
        setHalf(rel.half, W / H, 1, 0, 0, dbuf.x + 1, -1, 1);
      }
    } else {
      if (objPlaying) {
        tObs += dt * TERRELL_C;
        const t1 = X_LOOP / objBeta + 14;
        if (tObs > t1) tObs = -X_LOOP / objBeta;
      }
      tU.uT.value = tObs;
      tU.uCam.value.copy(camera.position);
      cubeWire.visible = sphWire.visible = showWire;
      lblWire.visible = showWire;
      // Labels follow the objects.
      lblWire.position.set(objBeta * tObs, CUBE_Y + 0.95, TRACK_Z);
      const ts = emissionTime(0, SPHERE_Y, TRACK_Z, camera.position.x, camera.position.y, camera.position.z, objBeta, tObs);
      lblSeen.position.set(objBeta * ts, SPHERE_Y - 0.95, TRACK_Z);
      // Apparent rotation of the cube, from its seen centre.
      const te = emissionTime(0, CUBE_Y, TRACK_Z, camera.position.x, camera.position.y, camera.position.z, objBeta, tObs);
      tmpP.set(objBeta * te, CUBE_Y, TRACK_Z).sub(camera.position).normalize();
      rotDeg = terrellRotation(tmpP.x, objBeta) / DEG;
      drawTopView();
    }
  });

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  const grab = (k: string) => {
    panelSections[k] = ui.root.lastElementChild as HTMLElement;
  };
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'flight', label: 'Flight' }, { value: 'terrell', label: 'Terrell' }],
    onChange: (v) => { view = v; applyView(); },
  });
  ui.select<Lens>({
    key: 'lens', label: 'Lens (flight)', value: lens,
    options: [{ value: 'camera', label: 'Camera 80°' }, { value: 'sky', label: 'Whole sky' }],
    onChange: (v) => { lens = v; applyFlightUniforms(); },
  });
  ui.toggle({ key: 'split', label: 'Split view: classical | relativistic', value: split, onChange: (v) => { split = v; applyView(); } });

  ui.section('Flight');
  grab('flight');
  ui.slider({
    key: 'beta', label: 'Your speed β', min: 0, max: 0.99, step: 0.001, value: beta, format: (v) => v.toFixed(3),
    onInput: (v) => { beta = v; applyFlightUniforms(); paintTags(); },
  });
  ui.buttons([
    { label: 'Look ahead', onClick: () => setLook('ahead') },
    { label: 'Look sideways', onClick: () => setLook('side') },
    { label: 'Look back', onClick: () => setLook('back') },
  ]);
  ui.toggle({ key: 'fly', label: 'Move through the cube lattice', value: flying, onChange: (v) => { flying = v; } });

  ui.section('Effects');
  grab('effects');
  ui.toggle({ key: 'aber', label: 'Aberration (where light comes from)', value: aber, onChange: (v) => { aber = v; applyFlightUniforms(); paintTags(); } });
  ui.toggle({ key: 'doppler', label: 'Doppler colour (T → D·T)', value: doppler, onChange: (v) => { doppler = v; applyFlightUniforms(); paintTags(); } });
  ui.toggle({ key: 'beam', label: 'Searchlight (star D², surface D⁴)', value: beam, onChange: (v) => { beam = v; applyFlightUniforms(); paintTags(); } });

  ui.section('Probe');
  grab('probe');
  ui.slider({
    key: 'probe', label: 'Probe angle θ′ from ahead', min: 0, max: 180, step: 0.1, value: probeDeg, unit: '°', format: (v) => v.toFixed(1),
    onInput: (v) => { probeDeg = v; touched = true; applyFlightUniforms(); },
  });
  ui.note('The probe sits to the right of the flight direction. Use <b>Look sideways</b> or the whole-sky lens to see it at large angles.');

  ui.section('Terrell view');
  grab('terrell');
  ui.slider({
    key: 'objBeta', label: 'Object speed β', min: 0.1, max: 0.99, step: 0.01, value: objBeta, format: (v) => v.toFixed(2),
    onInput: (v) => {
      const x = objBeta * tObs;
      objBeta = v;
      tObs = x / v; // keep the contracted shape where it is
      tU.uB.value = v;
      tU.uG.value = gamma(v);
      paintTags();
    },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { objPlaying = !objPlaying; playBtn.textContent = objPlaying ? 'Pause' : 'Play'; } },
    {
      label: 'Freeze mid-view', key: 'rotDeg',
      onClick: () => {
        // Place the seen cube and the contracted cube symmetrically about the camera.
        // Seen centre at x_s, emitted at t = x_s/β. The cube is now at x_s + β·dist.
        const c = camera.position;
        const d0 = Math.hypot(CUBE_Y - c.y, TRACK_Z - c.z);
        let xs = c.x;
        for (let i = 0; i < 20; i++) xs = c.x - (objBeta * Math.hypot(xs - c.x, CUBE_Y - c.y, TRACK_Z - c.z)) / 2;
        tObs = xs / objBeta + Math.hypot(xs - c.x, d0);
        objPlaying = false;
        playBtn.textContent = 'Play';
      },
    },
  ]);
  ui.toggle({ key: 'wire', label: 'Show contracted wireframe', value: showWire, onChange: (v) => { showWire = v; } });

  ui.section('Flight readouts');
  grab('flightOut');
  const rGamma = ui.readout('gamma', 'Lorentz factor γ');
  const rAhead = ui.readout('dAhead', 'D straight ahead');
  const rBehind = ui.readout('dBehind', 'D straight behind');
  const rDProbe = ui.readout('dProbe', 'D at probe');
  const rSrc = ui.readout('probeSrc', 'probe rest angle θ');
  const rNoShift = ui.readout('noShift', 'no-shift angle θ′₀');
  const rFrac = ui.readout('frac25', 'stars in 25° cone');
  const rHalf = ui.readout('halfSky', 'half the sky within');
  const rSurf = ui.readout('surf', 'brightness ahead D⁴');

  ui.section('Terrell readouts');
  grab('terrellOut');
  const rObjG = ui.readout('objGamma', 'object γ');
  const rRot = ui.readout('rotDeg', 'apparent rotation');
  const rRotA = ui.readout('rotAbeam', 'arcsin β (seen side-on)');
  const rLen = ui.readout('len', 'contracted length 1/γ');
  ui.legend([
    { color: css(PALETTE.amber), label: '25° cone' },
    { color: css(PALETTE.green), label: 'D = 1 ring' },
    { color: '#ffffff', label: 'probe' },
  ]);

  const frac25 = () => fractionInCone(CONE_DEG * DEG, aber ? beta : 0);
  const dProbe = () => dopplerObs(Math.cos(probeDeg * DEG), beta);

  let readoutTimer = 1;
  stage.onFrame((dt) => {
    readoutTimer += dt;
    if (readoutTimer < 0.15) return;
    readoutTimer = 0;
    const g = gamma(beta);
    rGamma(g.toFixed(3));
    rAhead(dopplerObs(1, beta).toFixed(3));
    rBehind(dopplerObs(-1, beta).toFixed(3));
    rDProbe(dProbe().toFixed(3));
    rSrc(`${(Math.acos(deaberrateCos(Math.cos(probeDeg * DEG), beta)) / DEG).toFixed(1)}°`);
    rNoShift(beta > 0 ? `${(Math.acos(noShiftCos(beta)) / DEG).toFixed(2)}°` : 'everywhere');
    rFrac(`${(frac25() * 100).toFixed(1)} %`);
    rHalf(`${(halfSkyAngle(aber ? beta : 0) / DEG).toFixed(1)}°`);
    const s4 = dopplerObs(1, beta) ** 4;
    rSurf(s4 < 100 ? `${s4.toFixed(1)}×` : `${Math.round(s4).toLocaleString('en-US')}×`);
    const og = gamma(objBeta);
    rObjG(og.toFixed(3));
    rRot(`${rotDeg.toFixed(1)}°`);
    rRotA(`${(Math.asin(objBeta) / DEG).toFixed(1)}°`);
    rLen(`${(1 / og).toFixed(3)} of rest length`);
  });

  applyView();
  touched = false;

  return {
    state: () => ({
      touched,
      view,
      lens,
      split,
      beta,
      aber,
      doppler,
      beam,
      probe: probeDeg,
      dProbe: dProbe(),
      frac25: frac25(),
      objBeta,
      rotDeg,
    }),
    dispose: () => {
      tag.remove();
      tagR.remove();
      divider.remove();
      legend.remove();
      plot.remove();
      lutTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'relativistic-visuals',
  number: 47,
  title: 'Flying Near Light Speed',
  domain: 'relativity',
  level: 2,
  status: 'live',
  tagline: 'What you would actually see: squeezed skies and shifted colours.',
  content,
  mount,
};

export default topic;
