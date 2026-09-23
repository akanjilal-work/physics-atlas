import * as THREE from 'three';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  areal,
  deflection,
  embedZ,
  fillSkyLut,
  impactOf,
  launch,
  rk4,
  turningPoint,
  type Ray,
} from './physics.ts';

type View = 'embed' | 'split' | 'camera';

const S = 0.56; // scene units per unit of ℓ
const LS = 5.2; // the surface runs over ℓ ∈ [−LS, LS]
const L_FLY = 4.5; // fly-through goes from +L_FLY to −L_FLY
const DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
const LUT_N = 1024;
const SKY_FOV = 72; // vertical field of view of the wormhole camera, degrees
const FAN_N = 15;
const FAN_H = 0.02; // fan ray step in ℓ units
const FAN_STEPS = 1400;
const FAN_MAXP = FAN_STEPS / 2 + 2;
const PROBE_H = 0.004;
const PROBE_SPEED = 2.4; // ℓ units per second (schematic)
const PHI_CAM = -2.3; // azimuth of the camera marker on the surface (back left)
const PHI_PROBE = Math.PI / 2; // azimuth where the probe starts
const FLY_TIME = 7;
const TURN_TIME = 1.6;

const CAMS: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  embed: { pos: [0, 2.7, 7.0], target: [0, -0.1, 0] },
  split: { pos: [0, 3.3, 9.4], target: [0, -0.1, 0] },
  camera: { pos: [0, 2.7, 7.0], target: [0, -0.1, 0] },
};

const C_OUR = new THREE.Color(PALETTE.amber);
const C_OTHER = new THREE.Color(PALETTE.cyan);

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Point on the double trumpet at (ℓ, φ). */
function surfPoint(l: number, phi: number, b0: number, out: THREE.Vector3): THREE.Vector3 {
  const r = areal(l, b0);
  return out.set(S * r * Math.cos(phi), S * embedZ(l, b0), S * r * Math.sin(phi));
}

const VERT = /* glsl */ `
uniform vec2 uRect;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(mix(uRect.x, uRect.y, uv.x), position.y, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
#define PI 3.141592653589793
uniform sampler2D uLut;
uniform float uLutN;
uniform float uThetaT;
uniform float uSide;
uniform float uTanH;
uniform float uAspect;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec2 vUv;

float lutRow(float row, float t) {
  float x = clamp(t, 0.0, 1.0) * (uLutN - 1.0);
  float i = floor(x);
  float a = texelFetch(uLut, ivec2(int(i), int(row)), 0).r;
  float c = texelFetch(uLut, ivec2(int(min(i + 1.0, uLutN - 1.0)), int(row)), 0).r;
  return mix(a, c, x - i);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float starLayer(vec3 n, float sc, float thr, float size) {
  vec3 p = n * sc;
  vec3 c = floor(p);
  float h = hash13(c);
  if (h < thr) return 0.0;
  vec3 o = 0.25 + 0.5 * hash33(c);
  float d = length(p - c - o);
  return (h - thr) / (1.0 - thr) * (1.0 - smoothstep(0.0, size, d));
}

// Our universe: warm starfield, a dusty band and a bright orange star behind the wormhole.
vec3 warmSky(vec3 n) {
  vec3 gal = normalize(vec3(0.2, 1.0, 0.35));
  float band = exp(-pow(dot(n, gal) / 0.25, 2.0));
  vec3 col = vec3(0.026, 0.016, 0.01) + vec3(0.16, 0.08, 0.035) * band;
  col += vec3(0.10, 0.03, 0.05) * exp(-pow(length(n - normalize(vec3(-0.6, 0.35, -0.7))) / 0.35, 2.0));
  col += vec3(1.0, 0.82, 0.55) * starLayer(n, 60.0, 0.86, 0.24) * 1.7;
  col += vec3(1.0, 0.7, 0.45) * starLayer(n, 140.0, 0.78 - 0.25 * band, 0.2);
  float sun = length(n - normalize(vec3(0.16, 0.06, -1.0)));
  col += vec3(1.6, 0.95, 0.4) * (1.0 - smoothstep(0.035, 0.05, sun));
  col += vec3(0.5, 0.25, 0.08) * exp(-sun * sun / 0.012);
  return col;
}
const vec3 WARM_AVG = vec3(0.07, 0.04, 0.025);

// The other universe: a cool latitude-longitude grid around the ℓ axis, with blue stars.
vec3 coolSky(vec3 n) {
  float lon = atan(n.y, n.x);
  float lat = asin(clamp(n.z, -1.0, 1.0));
  vec3 col = mix(vec3(0.02, 0.05, 0.11), vec3(0.03, 0.12, 0.16), 0.5 + 0.5 * n.z);
  float st = PI / 12.0;
  vec2 g = vec2(lon, lat) / st;
  vec2 w = fwidth(g);
  vec2 l = abs(fract(g + 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(l.x, l.y), 1.0);
  col = mix(col, vec3(0.3, 0.8, 0.95), line * 0.75);
  col += vec3(0.6, 0.85, 1.0) * starLayer(n, 90.0, 0.9, 0.22) * 1.4;
  float moon = length(n - normalize(vec3(-0.5, 0.3, 0.8)));
  col += vec3(0.55, 0.45, 1.1) * (1.0 - smoothstep(0.06, 0.075, moon));
  return col;
}
const vec3 COOL_AVG = vec3(0.07, 0.14, 0.2);

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 d = normalize(uFwd + p.x * uTanH * uAspect * uRight + p.y * uTanH * uUp);
  vec3 outv = vec3(0.0, 0.0, uSide);
  float cosA = dot(d, outv);
  float theta = acos(clamp(-cosA, -1.0, 1.0));
  vec3 t = d - cosA * outv;
  float sl = length(t);
  t = sl > 1e-6 ? t / sl : vec3(1.0, 0.0, 0.0);
  bool crosses = theta < uThetaT;
  float phi = crosses
    ? lutRow(0.0, sqrt(max(0.0, (uThetaT - theta) / uThetaT)))
    : lutRow(1.0, sqrt(max(0.0, (theta - uThetaT) / (PI - uThetaT))));
  vec3 n = cos(phi) * vec3(0.0, 0.0, 1.0) + sin(phi) * t;
  float uni = crosses ? -uSide : uSide;
  vec3 col = uni > 0.0 ? warmSky(n) : coolSky(n);
  // Near the rim the images wind round faster than a pixel can show. Fade those to the mean colour.
  float blur = smoothstep(0.6, 2.5, fwidth(phi));
  col = mix(col, uni > 0.0 ? WARM_AVG : COOL_AVG, blur);
  col = col / (1.0 + 0.3 * col);
  gl_FragColor = vec4(col, 1.0);
}`;

function mount({ viewport, panel }: MountContext): TopicInstance {
  let view: View = 'split';
  let b0 = 1;
  let lCam = 4;
  let probeB = 0.6;
  let showFan = true;
  let probeUser = false;
  let camMoved = false;
  let flying = false;
  let flyU = 0;
  let turnU = -1;
  let yaw = 0;
  let pitch = 0;

  const stage = createStage(viewport, { camera: CAMS[view].pos, target: CAMS[view].target, fov: 45, near: 0.01, far: 200 });
  const { scene, camera, controls } = stage;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  const cam = camera as THREE.PerspectiveCamera;

  const world = new THREE.Group();
  scene.add(world);

  // --- Double trumpet surface, grid and throat ring (rebuilt when b0 changes)
  const NL = 140;
  const NT = 112;
  const lSamples = new Float32Array(NL + 1);
  for (let i = 0; i <= NL; i++) {
    const u = (i / NL) * 2 - 1;
    lSamples[i] = (LS * Math.sinh(2.2 * u)) / Math.sinh(2.2);
  }
  const surfPos = new Float32Array((NL + 1) * (NT + 1) * 3);
  const surfCol = new Float32Array((NL + 1) * (NT + 1) * 3);
  const surfIdx: number[] = [];
  for (let i = 0; i < NL; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * (NT + 1) + j;
      const b = a + NT + 1;
      surfIdx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const surfGeo = new THREE.BufferGeometry();
  surfGeo.setAttribute('position', new THREE.BufferAttribute(surfPos, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(surfCol, 3));
  surfGeo.setIndex(surfIdx);
  const surface = new THREE.Mesh(
    surfGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
  );
  world.add(surface);

  const GRID_L = [-5, -4, -3, -2.2, -1.5, -1, -0.6, -0.3, 0.3, 0.6, 1, 1.5, 2.2, 3, 4, 5];
  const N_MER = 24;
  const CIRC_N = 128;
  const gridVerts = (GRID_L.length * CIRC_N + N_MER * NL) * 2;
  const gridPos = new Float32Array(gridVerts * 3);
  const gridCol = new Float32Array(gridVerts * 3);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3));
  gridGeo.setAttribute('color', new THREE.BufferAttribute(gridCol, 3));
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
  world.add(grid);

  const RING_N = 160;
  const ringPos = new Float32Array((RING_N + 1) * 3);
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  const throatRing = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.95 }));
  world.add(throatRing);

  const tmpC = new THREE.Color();
  const lowWarm = new THREE.Color(0x3a2610);
  const lowCool = new THREE.Color(0x0f2c46);
  const gridWarm = new THREE.Color(0x8a6a3a);
  const gridCool = new THREE.Color(0x3a7090);
  const colFor = (l: number, warm: THREE.Color, cool: THREE.Color, out: THREE.Color) => out.copy(cool).lerp(warm, 0.5 + 0.5 * Math.tanh(l / (0.6 * b0)));

  const v = new THREE.Vector3();
  function rebuildSurface(): void {
    for (let i = 0; i <= NL; i++) {
      const l = lSamples[i];
      colFor(l, lowWarm, lowCool, tmpC);
      for (let j = 0; j <= NT; j++) {
        const k = (i * (NT + 1) + j) * 3;
        surfPoint(l, (j / NT) * TWO_PI, b0, v);
        surfPos[k] = v.x;
        surfPos[k + 1] = v.y;
        surfPos[k + 2] = v.z;
        surfCol[k] = tmpC.r;
        surfCol[k + 1] = tmpC.g;
        surfCol[k + 2] = tmpC.b;
      }
    }
    surfGeo.attributes.position.needsUpdate = true;
    surfGeo.attributes.color.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();

    let n = 0;
    const put = (l: number, phi: number) => {
      surfPoint(l, phi, b0, v);
      colFor(l, gridWarm, gridCool, tmpC);
      gridPos[n * 3] = v.x;
      gridPos[n * 3 + 1] = v.y;
      gridPos[n * 3 + 2] = v.z;
      gridCol[n * 3] = tmpC.r;
      gridCol[n * 3 + 1] = tmpC.g;
      gridCol[n * 3 + 2] = tmpC.b;
      n++;
    };
    for (const l of GRID_L) {
      for (let j = 0; j < CIRC_N; j++) {
        put(l, (j / CIRC_N) * TWO_PI);
        put(l, ((j + 1) / CIRC_N) * TWO_PI);
      }
    }
    for (let m = 0; m < N_MER; m++) {
      const phi = (m / N_MER) * TWO_PI;
      for (let i = 0; i < NL; i++) {
        put(lSamples[i], phi);
        put(lSamples[i + 1], phi);
      }
    }
    gridGeo.attributes.position.needsUpdate = true;
    gridGeo.attributes.color.needsUpdate = true;
    gridGeo.computeBoundingSphere();

    for (let j = 0; j <= RING_N; j++) {
      surfPoint(0, (j / RING_N) * TWO_PI, b0, v);
      ringPos[j * 3] = v.x;
      ringPos[j * 3 + 1] = v.y;
      ringPos[j * 3 + 2] = v.z;
    }
    ringGeo.attributes.position.needsUpdate = true;
    ringGeo.computeBoundingSphere();

    throatLabel.position.set(S * b0 + 0.55, 0, 0);
    topLabel.position.copy(surfPoint(LS, 0.45, b0, v)).y += 0.2;
    botLabel.position.copy(surfPoint(-LS, 0.45, b0, v)).y -= 0.2;
  }

  const throatLabel = stage.label('throat, r = b₀', [0, 0, 0], 'muted', world);
  const topLabel = stage.label('our universe (ℓ > 0)', [0, 0, 0], '', world);
  const botLabel = stage.label('other universe (ℓ < 0)', [0, 0, 0], '', world);
  topLabel.element.style.color = css(PALETTE.amber);
  botLabel.element.style.color = css(PALETTE.cyan);

  // --- Camera marker on the surface
  const marker = new THREE.Group();
  const markerCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.26, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666, roughness: 0.4 }),
  );
  marker.add(markerCone);
  world.add(marker);
  const camLabel = stage.label('camera', [0, 0.25, 0], 'muted', marker);
  const up = new THREE.Vector3(0, 1, 0);
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  function placeMarker(): void {
    // The camera always faces −ℓ (the fly-through direction). After crossing, that points away from the throat.
    surfPoint(lCam, PHI_CAM, b0, va);
    surfPoint(lCam - 0.05, PHI_CAM, b0, vb);
    vb.sub(va).normalize();
    marker.position.copy(va);
    markerCone.quaternion.setFromUnitVectors(up, vb);
    camLabel.position.set(0, lCam >= 0 ? 0.28 : -0.28, 0);
  }

  // --- Fan of sight lines from the camera
  const fanGroup = new THREE.Group();
  world.add(fanGroup);
  const fanLines: THREE.Line[] = [];
  for (let k = 0; k < FAN_N; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FAN_MAXP * 3), 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.6 }));
    line.frustumCulled = false;
    fanLines.push(line);
    fanGroup.add(line);
  }
  const fanRay: Ray = [0, 0, 0, 0];
  let fanDirty = true;
  function rebuildFan(): void {
    fanDirty = false;
    const R = areal(lCam, b0);
    const thMax = Math.min(1.35, Math.asin(Math.min(0.999, (2.4 * b0) / R)));
    for (let k = 0; k < FAN_N; k++) {
      const th = -thMax + (2 * thMax * k) / (FAN_N - 1);
      const b = R * Math.sin(th);
      fanRay[0] = lCam;
      fanRay[1] = 0;
      fanRay[2] = (lCam > 0 ? -1 : 1) * Math.sqrt(Math.max(0, 1 - (b * b) / (R * R)));
      fanRay[3] = b / (R * R);
      const attr = fanLines[k].geometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      let n = 0;
      surfPoint(fanRay[0], PHI_CAM + fanRay[1], b0, v);
      arr[0] = v.x; arr[1] = v.y; arr[2] = v.z;
      n = 1;
      for (let s = 0; s < FAN_STEPS && n < FAN_MAXP; s++) {
        rk4(fanRay, b0, FAN_H);
        if (s % 2 === 1 || Math.abs(fanRay[0]) > LS) {
          surfPoint(fanRay[0], PHI_CAM + fanRay[1], b0, v);
          arr[n * 3] = v.x; arr[n * 3 + 1] = v.y; arr[n * 3 + 2] = v.z;
          n++;
        }
        if (Math.abs(fanRay[0]) > LS) break;
      }
      fanLines[k].geometry.setDrawRange(0, n);
      attr.needsUpdate = true;
      (fanLines[k].material as THREE.LineBasicMaterial).color.copy(fanRay[0] > 0 ? C_OUR : C_OTHER);
    }
  }

  // --- Probe photon
  const glowTex = glowTexture();
  const probe = new THREE.Group();
  probe.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  const probeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  probeGlow.scale.setScalar(0.34);
  probe.add(probeGlow);
  world.add(probe);
  const probeTrail = new Trail(2600, PALETTE.white, 0.95);
  world.add(probeTrail.line);

  let pRay: Ray = [LS, 0, -1, 0];
  let pB = probeB;
  let pRunning = false;
  let pDone = 0;
  let pCrossed = false;
  let pCrossedUser = false;
  let pUserLaunch = false;
  let pBDrift = 0;
  let pWinds = 0;
  let stepCount = 0;
  function launchProbe(user: boolean): void {
    pB = probeB;
    pRay = launch(LS - 0.05, pB, b0);
    pRunning = true;
    pDone = 0;
    pCrossed = false;
    pBDrift = 0;
    pWinds = 0;
    stepCount = 0;
    pUserLaunch = user;
    if (user) probeUser = true;
    probeTrail.clear();
    surfPoint(pRay[0], PHI_PROBE + pRay[1], b0, v);
    probe.position.copy(v);
    probeTrail.push(v.x, v.y, v.z);
  }

  // --- Lensed sky: a full-screen quad. The Φ(θ) table goes in as a 2-row float texture.
  const lutData = new Float32Array(LUT_N * 2);
  const lutTex = new THREE.DataTexture(lutData, LUT_N, 2, THREE.RedFormat, THREE.FloatType);
  lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter;
  const uniforms = {
    uLut: { value: lutTex },
    uLutN: { value: LUT_N },
    uThetaT: { value: 0.3 },
    uSide: { value: 1 },
    uTanH: { value: Math.tan((SKY_FOV * Math.PI) / 360) },
    uAspect: { value: 1 },
    uFwd: { value: new THREE.Vector3(0, 0, -1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uRect: { value: new THREE.Vector2(0, 1) },
  };
  const skyMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  skyQuad.frustumCulled = false;
  skyQuad.renderOrder = 1000;
  scene.add(skyQuad);
  let skyDirty = true;
  let thetaT = 0;
  function rebuildSky(): void {
    skyDirty = false;
    thetaT = fillSkyLut(lutData, LUT_N, Math.abs(lCam), b0);
    lutTex.needsUpdate = true;
    uniforms.uThetaT.value = thetaT;
    uniforms.uSide.value = lCam >= 0 ? 1 : -1;
  }

  // --- Overlays
  const skyBox = document.createElement('div');
  Object.assign(skyBox.style, {
    position: 'absolute', top: '0', bottom: '0', right: '0', zIndex: '2', pointerEvents: 'none', borderLeft: '1px solid #243049',
  } as CSSStyleDeclaration);
  const skyTitle = document.createElement('div');
  Object.assign(skyTitle.style, {
    position: 'absolute', left: '10px', top: '10px', padding: '6px 10px', borderRadius: '10px',
    background: 'rgba(7,10,18,0.72)', border: '1px solid #243049', font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  skyBox.appendChild(skyTitle);
  viewport.appendChild(skyBox);

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', width: '220px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Sight lines from the camera toward the throat</div>
<div><span style="color:${css(PALETTE.amber)}">amber</span> end on our sky (warm stars)</div>
<div><span style="color:${css(PALETTE.cyan)}">cyan</span> end on the other sky (cool grid)</div>
<div>white = probe ray, <span style="color:${css(PALETTE.rose)}">rose</span> = throat</div>`;
  viewport.appendChild(legend);

  // Inset: the barrier 1/r(ℓ)² against the probe's 1/b².
  const PW = 440;
  const PH = 210;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const X0 = 16;
  const X1 = PW - 16;
  const Y0 = 50;
  const Y1 = PH - 16;
  const YMAX = 1.35;
  const px = (l: number) => X0 + ((l + LS) / (2 * LS)) * (X1 - X0);
  const py = (y: number) => Y1 - (Math.min(YMAX, y) / YMAX) * (Y1 - Y0);
  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.font = '600 20px JetBrains Mono, monospace';
    pctx.fillStyle = '#dfe6f3';
    pctx.fillText('Barrier: b₀²/r(ℓ)² vs b₀²/b²', 14, 28);
    pctx.strokeStyle = '#243049';
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.moveTo(px(0), Y0 - 6);
    pctx.lineTo(px(0), Y1);
    pctx.moveTo(X0, Y1);
    pctx.lineTo(X1, Y1);
    pctx.stroke();
    pctx.font = '16px JetBrains Mono, monospace';
    pctx.fillStyle = '#56627c';
    pctx.fillText('ℓ<0', X0, Y1 - 6);
    pctx.fillText('ℓ>0', X1 - 36, Y1 - 6);
    // Barrier curve
    pctx.strokeStyle = css(PALETTE.violet);
    pctx.lineWidth = 3;
    pctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const l = -LS + (2 * LS * i) / 120;
      const y = (b0 * b0) / (b0 * b0 + l * l);
      if (i === 0) pctx.moveTo(px(l), py(y));
      else pctx.lineTo(px(l), py(y));
    }
    pctx.stroke();
    // Probe level
    const lvl = pB > 0 ? (b0 * b0) / (pB * pB) : YMAX;
    const cross = pB < b0;
    pctx.strokeStyle = cross ? css(PALETTE.cyan) : css(PALETTE.amber);
    pctx.lineWidth = 2;
    pctx.setLineDash([8, 6]);
    pctx.beginPath();
    pctx.moveTo(X0, py(lvl));
    pctx.lineTo(X1, py(lvl));
    pctx.stroke();
    pctx.setLineDash([]);
    pctx.fillStyle = pctx.strokeStyle;
    const ty = py(lvl);
    pctx.fillText(cross ? 'line clears the hump: crosses' : 'line hits the hump: turns back', X0 + 4, ty < Y0 + 20 ? ty + 22 : ty - 8);
    // Probe dot
    pctx.fillStyle = '#ffffff';
    pctx.beginPath();
    pctx.arc(px(Math.max(-LS, Math.min(LS, pRay[0]))), py(lvl), 6, 0, TWO_PI);
    pctx.fill();
  }

  // --- View handling
  function applyView(fly: boolean): void {
    world.visible = view !== 'camera';
    skyQuad.visible = view !== 'embed';
    skyBox.style.display = view === 'embed' ? 'none' : '';
    skyBox.style.left = view === 'split' ? '50%' : '0';
    skyBox.style.borderLeftWidth = view === 'split' ? '1px' : '0';
    uniforms.uRect.value.set(view === 'split' ? 0 : -1, 1);
    if (view === 'split') cam.setViewOffset(1, 1, 0.25, 0, 1, 1);
    else cam.clearViewOffset();
    plot.style.display = view === 'camera' ? 'none' : '';
    plot.style.right = view === 'split' ? '' : '10px';
    plot.style.left = view === 'split' ? '10px' : '';
    legend.style.display = view === 'camera' ? 'none' : '';
    controls.enabled = view !== 'camera';
    if (fly) stage.flyTo(CAMS[view].pos, CAMS[view].target);
    paintSkyTitle();
  }

  let lastTitle = '';
  function paintSkyTitle(): void {
    const side = lCam >= 0 ? 'our universe' : 'the other universe';
    const html = `<div style="color:#dfe6f3;font-weight:600">Camera view, ℓ = ${lCam.toFixed(2)}</div>
<div>in ${side}, facing ${Math.abs(yaw) > Math.PI / 2 ? '+ℓ' : '−ℓ'}</div>
<div><span style="color:${css(PALETTE.amber)}">warm stars</span>: our sky · <span style="color:${css(PALETTE.cyan)}">cool grid</span>: other sky</div>
<div>drag here to look around</div>`;
    if (html !== lastTitle) {
      skyTitle.innerHTML = html;
      lastTitle = html;
    }
  }

  // Dragging inside the sky area turns the wormhole camera instead of orbiting the diagram.
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  const inSky = (e: PointerEvent): boolean => {
    if (view === 'embed') return false;
    if (view === 'camera') return true;
    const rect = viewport.getBoundingClientRect();
    return e.clientX > rect.left + rect.width / 2;
  };
  const onDown = (e: PointerEvent) => {
    if (!inSky(e)) {
      controls.enabled = view !== 'camera';
      return;
    }
    controls.enabled = false;
    dragging = true;
    dragX = e.clientX;
    dragY = e.clientY;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const h = Math.max(1, viewport.clientHeight);
    const k = (SKY_FOV / DEG) / h;
    yaw += (e.clientX - dragX) * k;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - dragY) * k));
    dragX = e.clientX;
    dragY = e.clientY;
    turnU = -1;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = view !== 'camera';
  };
  viewport.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // --- State changes
  function setLCam(l: number): void {
    lCam = l;
    skyDirty = true;
    fanDirty = true;
    placeMarker();
  }
  function setB0(x: number): void {
    b0 = x;
    rebuildSurface();
    setLCam(lCam);
    launchProbe(false);
  }

  // --- Frame loop
  const size = new THREE.Vector2();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let plotTimer = 0;
  let fanTimer = 0;
  stage.onFrame((dt) => {
    // Fly-through: ease ℓ from +L to −L, then turn round to look back at the throat.
    if (flying) {
      flyU = Math.min(1, flyU + dt / FLY_TIME);
      const e = flyU * flyU * (3 - 2 * flyU);
      setLCam(L_FLY * (1 - 2 * e));
      lSlider.set(Number(lCam.toFixed(2)), false);
      if (flyU >= 1) {
        flying = false;
        turnU = 0;
        flyBtn.textContent = 'Fly through';
      }
    } else if (turnU >= 0) {
      turnU = Math.min(1, turnU + dt / TURN_TIME);
      const e = turnU * turnU * (3 - 2 * turnU);
      yaw = Math.PI * e;
      if (turnU >= 1) turnU = -1;
    }

    // Probe photon: fixed RK4 steps, several per frame.
    if (pRunning) {
      const steps = Math.max(1, Math.round((dt * PROBE_SPEED) / PROBE_H));
      for (let s = 0; s < steps; s++) {
        rk4(pRay, b0, PROBE_H);
        stepCount++;
        pBDrift = Math.max(pBDrift, Math.abs(impactOf(pRay, b0) - pB) / Math.max(1e-9, pB));
        if (pRay[0] < -0.5 * b0 && !pCrossed) {
          pCrossed = true;
          if (pUserLaunch) pCrossedUser = true;
        }
        if (stepCount % 3 === 0) {
          surfPoint(pRay[0], PHI_PROBE + pRay[1], b0, v);
          probeTrail.push(v.x, v.y, v.z);
        }
        if (Math.abs(pRay[0]) > LS || stepCount > 60000) {
          pRunning = false;
          break;
        }
      }
      pWinds = pRay[1] / TWO_PI;
      surfPoint(pRay[0], PHI_PROBE + pRay[1], b0, v);
      probe.position.copy(v);
    } else {
      pDone += dt;
      if (pDone > 2.2) launchProbe(pUserLaunch);
    }

    if (skyDirty) rebuildSky();
    fanTimer += dt;
    if (fanDirty && showFan && world.visible && (!flying || fanTimer > 0.06)) {
      fanTimer = 0;
      rebuildFan();
    }

    if (skyQuad.visible) {
      stage.renderer.getSize(size);
      const frac = view === 'split' ? 0.5 : 1;
      uniforms.uAspect.value = (size.x * frac) / Math.max(1, size.y);
      const fwd = uniforms.uFwd.value;
      fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      uniforms.uRight.value.crossVectors(fwd, worldUp).normalize();
      uniforms.uUp.value.crossVectors(uniforms.uRight.value, fwd);
      paintSkyTitle();
    }

    plotTimer += dt;
    if (plotTimer > 0.08 && plot.style.display !== 'none') {
      plotTimer = 0;
      drawPlot();
    }
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'embed', label: 'Embedding' }, { value: 'split', label: 'Both' }, { value: 'camera', label: 'Camera view' }],
    onChange: (x) => { view = x; applyView(true); },
  });
  const [flyBtn] = ui.buttons([
    {
      label: 'Fly through', primary: true, key: 'lcam',
      onClick: () => {
        if (flying) {
          flying = false;
          flyBtn.textContent = 'Fly through';
          return;
        }
        flying = true;
        camMoved = true;
        flyU = 0;
        turnU = -1;
        yaw = 0;
        pitch = 0;
        flyBtn.textContent = 'Stop';
      },
    },
    { label: 'Turn around', onClick: () => { yaw = Math.abs(yaw) > Math.PI / 2 ? 0 : Math.PI; pitch = 0; turnU = -1; } },
  ]);
  ui.toggle({ key: 'fan', label: 'Show sight lines', value: showFan, onChange: (x) => { showFan = x; fanGroup.visible = x; fanDirty = true; } });

  ui.section('Wormhole');
  ui.slider({ key: 'b0', label: 'Throat radius b₀', min: 0.4, max: 2.5, step: 0.05, value: b0, onInput: (x) => setB0(x) });
  const lSlider = ui.slider({
    key: 'lcam', label: 'Camera distance ℓ_cam', min: -5, max: 5, step: 0.05, value: lCam,
    onInput: (x) => { flying = false; flyBtn.textContent = 'Fly through'; camMoved = true; setLCam(x); },
  });
  ui.note('Negative ℓ is the other universe. The camera is static at each ℓ and faces −ℓ.');

  ui.section('Probe ray');
  ui.slider({ key: 'bprobe', label: 'Probe impact parameter b', min: 0, max: 3, step: 0.005, value: probeB, onInput: (x) => { probeB = x; launchProbe(true); } });
  ui.buttons([{ label: 'Send ray', key: 'fate', onClick: () => launchProbe(true) }]);

  ui.section('Live readouts');
  const rThroat = ui.readout('throat', 'throat angle θ_t', '°');
  const rFrac = ui.readout('frac', 'sky through throat');
  const rR = ui.readout('rcam', 'r at camera');
  const rFate = ui.readout('fate', 'probe fate');
  const rAlpha = ui.readout('alpha', 'deflection α');
  const rDrift = ui.readout('drift', 'RK4 b drift');

  function updateReadouts(): void {
    rThroat((thetaT * DEG).toFixed(1));
    rFrac(`${(((1 - Math.cos(thetaT)) / 2) * 100).toFixed(1)} %`);
    rR(areal(lCam, b0).toFixed(3));
    const ratio = pB / b0;
    if (Math.abs(ratio - 1) < 1e-3) rFate('on the throat');
    else if (pB < b0) rFate(`crosses (b/b₀ ${ratio.toFixed(3)})`);
    else rFate(`turns at ℓ ${turningPoint(pB, b0).toFixed(2)}`);
    if (pB > b0 * 1.0005) {
      const a = deflection(pB, b0) * DEG;
      rAlpha(`${a < 10 ? a.toFixed(2) : a.toFixed(0)}°`);
    } else rAlpha('passes through');
    rDrift(pBDrift < 1e-15 ? '< 1e-15' : pBDrift.toExponential(1));
  }

  rebuildSurface();
  setLCam(lCam);
  launchProbe(false);
  applyView(false);

  return {
    state: () => ({
      b0,
      lCam,
      view,
      thetaTDeg: thetaT * DEG,
      probeB: pB,
      bErr: probeUser && pUserLaunch ? Math.abs(pB / b0 - 1) : 1,
      probeUser,
      probeCrossed: pCrossedUser,
      probeWinds: pWinds,
      camMoved,
      flying,
    }),
    dispose: () => {
      viewport.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      plot.remove();
      legend.remove();
      skyBox.remove();
      glowTex.dispose();
      lutTex.dispose();
      cam.clearViewOffset();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'wormholes',
  number: 45,
  title: 'Wormholes',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'Shortcuts through spacetime that general relativity allows on paper.',
  content,
  mount,
};

export default topic;
