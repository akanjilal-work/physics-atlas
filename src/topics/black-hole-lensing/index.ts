import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { content } from './content.ts';
import {
  B_CRIT,
  buildPathLut,
  buildSkyLut,
  deflection,
  lookupPhi,
  impactFromAngle,
  R_HORIZON,
  R_PHOTON,
  sweep,
  tracePath,
  weakDeflection,
  type Fate,
  type SweepResult,
} from './physics.ts';

type View = 'rays' | 'split' | 'sky';
type Sky = 'stars' | 'grid';

const S = 0.15; // scene units per M
const X0 = 26; // rays start at x = −X0 (in M)
const R_OUT = 28; // stop drawing an escaping ray at this radius (in M)
const MAX_RAYS = 60;
const MAX_PTS = 1600;
const DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
/** Near-critical rays added on each side of the fan (offsets above b_c, in M), plus one just inside. */
const CLUSTER = [0.002, 0.05, 0.4, -0.05];
const PHOTON_SPEED = 14; // M per second along each path (schematic)
const SKY_FOV = 76; // vertical field of view of the lensed-sky camera, degrees
const THETA_LUT = (75 * Math.PI) / 180; // largest viewing angle covered by the lookup tables
const LUT_N = 2048;
const DISK_IN = 6; // inner edge at the ISCO, M
const DISK_OUT = 14;

const CAMS: Record<View, [number, number, number]> = {
  rays: [0, 1.0, 7.4],
  split: [0, 1.2, 9.4],
  sky: [0, 1.0, 7.4],
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const C_RED = new THREE.Color(PALETTE.red);
const C_ROSE = new THREE.Color(PALETTE.rose);
const C_STOPS = [new THREE.Color(PALETTE.amber), new THREE.Color(PALETTE.green), new THREE.Color(PALETTE.cyan), new THREE.Color(PALETTE.violet)];

/** Ray colour by impact parameter: reds for captured rays, amber at b_c through cyan to violet at the fan edge. */
function rayColor(b: number, W: number, out: THREE.Color): THREE.Color {
  const ab = Math.abs(b);
  if (ab < B_CRIT) return out.copy(C_RED).lerp(C_ROSE, ab / B_CRIT);
  const t = Math.min(1, Math.sqrt(Math.max(0, (ab - B_CRIT) / Math.max(0.5, W - B_CRIT)))) * (C_STOPS.length - 1);
  const i = Math.min(C_STOPS.length - 2, Math.floor(t));
  return out.copy(C_STOPS[i]).lerp(C_STOPS[i + 1], t - i);
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
uniform sampler2D uPath;
uniform vec2 uPathN;
uniform float uPhiMax;
uniform float uBMax;
uniform float uBc;
uniform float uD;
uniform float uTanH;
uniform float uAspect;
uniform vec3 uObs;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uSrcDir;
uniform float uSrcRad;
uniform float uDisk;
uniform float uGrid;
uniform float uTime;
uniform vec2 uDiskR;
varying vec2 vUv;

float lutPhi(float b) {
  float x = clamp(b / uBMax, 0.0, 1.0) * (uLutN - 1.0);
  float i = floor(x);
  float a = texelFetch(uLut, ivec2(int(i), 0), 0).r;
  float c = texelFetch(uLut, ivec2(int(min(i + 1.0, uLutN - 1.0)), 0), 0).r;
  if (a < 0.0) return c;
  return mix(a, c, x - i);
}

float pathU(float b, float phi) {
  vec2 x = vec2(clamp(phi / uPhiMax, 0.0, 1.0) * (uPathN.x - 1.0), clamp(b / uBMax, 0.0, 1.0) * (uPathN.y - 1.0));
  ivec2 i = ivec2(floor(x));
  ivec2 top = ivec2(uPathN) - 1;
  ivec2 j = min(i + 1, top);
  vec2 f = x - vec2(i);
  float a = texelFetch(uPath, ivec2(i.x, i.y), 0).r;
  float b1 = texelFetch(uPath, ivec2(j.x, i.y), 0).r;
  float c = texelFetch(uPath, ivec2(i.x, j.y), 0).r;
  float d = texelFetch(uPath, ivec2(j.x, j.y), 0).r;
  return mix(mix(a, b1, f.x), mix(c, d, f.x), f.y);
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

vec3 starLayer(vec3 n, float sc, float thr, float size) {
  vec3 p = n * sc;
  vec3 c = floor(p);
  float h = hash13(c);
  if (h < thr) return vec3(0.0);
  vec3 o = 0.25 + 0.5 * hash33(c);
  float d = length(p - c - o);
  float br = (h - thr) / (1.0 - thr);
  vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), hash13(c + 17.0));
  return tint * br * (1.0 - smoothstep(0.0, size, d)) * 1.6;
}

vec3 skyColor(vec3 n) {
  vec3 col;
  if (uGrid > 0.5) {
    float lon = atan(n.z, n.x);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    vec3 q1 = vec3(0.10, 0.30, 0.38);
    vec3 q2 = vec3(0.36, 0.25, 0.08);
    vec3 q3 = vec3(0.24, 0.17, 0.40);
    vec3 q4 = vec3(0.09, 0.32, 0.20);
    col = n.y > 0.0 ? (lon > 0.0 ? q1 : q2) : (lon > 0.0 ? q3 : q4);
    float st = PI / 12.0;
    vec2 g = vec2(lon, lat) / st;
    vec2 w = fwidth(g);
    vec2 l = abs(fract(g + 0.5) - 0.5) / max(w, vec2(1e-4));
    float line = 1.0 - min(min(l.x, l.y), 1.0);
    col = mix(col, vec3(0.85, 0.9, 1.0), line * 0.7);
  } else {
    vec3 gal = normalize(vec3(0.35, 1.0, 0.25));
    float band = exp(-pow(dot(n, gal) / 0.22, 2.0));
    col = vec3(0.012, 0.016, 0.03) + vec3(0.07, 0.065, 0.09) * band;
    col += starLayer(n, 70.0, 0.86, 0.22);
    col += starLayer(n, 150.0, 0.8 - 0.25 * band, 0.2) * 0.7;
  }
  float ang = acos(clamp(dot(n, uSrcDir), -1.0, 1.0));
  float src = (1.0 - smoothstep(uSrcRad * 0.7, uSrcRad, ang));
  col += vec3(1.3, 1.05, 0.7) * src;
  return col;
}

vec4 diskHit(float r, vec3 p) {
  if (r < uDiskR.x || r > uDiskR.y) return vec4(0.0);
  // Simplified thin disk: Newtonian-style flux (1 - sqrt(r_in/r)) / r^3, no Doppler beaming, no redshift.
  float f = (1.0 - sqrt(uDiskR.x / r)) / (r * r * r);
  float fmax = (1.0 - sqrt(36.0 / 49.0)) / pow(49.0 / 36.0 * uDiskR.x, 3.0);
  float br = clamp(f / fmax, 0.0, 1.0);
  float az = atan(p.z, p.x);
  float omega = pow(r, -1.5) * 6.0;
  float streak = 0.8 + 0.2 * sin(7.0 * (az + omega * uTime) + 2.5 * log(r));
  vec3 hot = vec3(1.4, 1.2, 0.9);
  vec3 warm = vec3(0.95, 0.45, 0.12);
  vec3 c = mix(warm, hot, br) * (0.25 + 1.1 * br) * streak;
  float edge = (1.0 - smoothstep(uDiskR.y - 1.5, uDiskR.y, r));
  return vec4(c, 0.92 * edge);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 d = normalize(uFwd + p.x * uTanH * uAspect * uRight + p.y * uTanH * uUp);
  float cosT = dot(d, uFwd);
  vec3 perp = d - cosT * uFwd;
  float sinT = length(perp);
  vec3 e2 = sinT > 1e-6 ? perp / sinT : uRight;
  float theta = atan(sinT, cosT);
  float b = uD * sin(theta) / sqrt(1.0 - 2.0 / uD);
  bool captured = b < uBc;
  float dphi = captured ? 1e9 : lutPhi(b);

  vec3 acc = vec3(0.0);
  float trans = 1.0;
  if (uDisk > 0.5) {
    float phi0 = mod(atan(-uObs.y, e2.y), PI);
    for (int k = 0; k < 3; k++) {
      float ph = phi0 + float(k) * PI;
      if (ph > dphi || ph > uPhiMax) break;
      float u = pathU(b, ph);
      if (u >= 0.49) break;
      if (u <= 0.0) break;
      float r = 1.0 / u;
      vec3 pos = (cos(ph) * uObs + sin(ph) * e2) * r;
      vec4 h = diskHit(r, pos);
      acc += trans * h.rgb * h.a;
      trans *= 1.0 - h.a;
      if (trans < 0.02) break;
    }
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    vec3 n = cos(dphi) * uObs + sin(dphi) * e2;
    bg = skyColor(n);
  }
  vec3 col = acc + trans * bg;
  col = col / (1.0 + 0.25 * col);
  gl_FragColor = vec4(col, 1.0);
}`;

function mount({ viewport, panel }: MountContext): TopicInstance {
  let view: View = 'split';
  let sky: Sky = 'stars';
  let fanW = 12;
  let nRays = 24;
  let showPhotons = true;
  let disk = false;
  let D = 30;
  let srcOffsetDeg = 4;
  const SRC_RAD_DEG = 1.5;
  let probeBase = 8;
  let probeFine = 0;
  let touched = false;

  const stage = createStage(viewport, { camera: CAMS[view], target: [0, 0, 0], fov: 45, near: 0.01, far: 200 });
  const { scene, camera, controls } = stage;
  controls.enablePan = false;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI - 0.12;
  controls.minDistance = 2;
  controls.maxDistance = 30;

  const labels: CSS2DObject[] = [];
  const addLabel = (text: string, at: [number, number, number], cls = 'muted') => {
    const l = stage.label(text, at, cls);
    labels.push(l);
    return l;
  };

  // --- Scene furniture
  const world = new THREE.Group();
  scene.add(world);

  const horizon = new THREE.Mesh(new THREE.SphereGeometry(R_HORIZON * S, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  world.add(horizon);
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(R_HORIZON * S, R_HORIZON * S * 1.07, 64),
    new THREE.MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  world.add(rim);

  const circle = (r: number, color: number, opacity: number, dashed: boolean): THREE.Line => {
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 180; j++) {
      const a = (j / 180) * TWO_PI;
      pts.push(new THREE.Vector3(r * S * Math.cos(a), r * S * Math.sin(a), 0));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(g, m);
    if (dashed) line.computeLineDistances();
    return line;
  };
  world.add(circle(R_PHOTON, PALETTE.rose, 0.95, true));
  for (const r of [10, 20]) world.add(circle(r, PALETTE.gridMajor, 0.5, false));
  addLabel('10M', [10 * S * 0.34, -10 * S * 0.94 - 0.08, 0]);
  addLabel('20M', [20 * S * 0.34, -20 * S * 0.94 - 0.08, 0]);
  addLabel('photon sphere 3M', [-R_PHOTON * S - 0.1, R_PHOTON * S + 0.16, 0]);
  addLabel('horizon 2M', [0, -R_HORIZON * S - 0.16, 0]);

  // Critical impact parameter guides on the incoming side.
  const bcGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-X0 * S, B_CRIT * S, 0), new THREE.Vector3(-0.2, B_CRIT * S, 0),
    new THREE.Vector3(-X0 * S, -B_CRIT * S, 0), new THREE.Vector3(-0.2, -B_CRIT * S, 0),
  ]);
  const bcLines = new THREE.LineSegments(bcGeo, new THREE.LineDashedMaterial({ color: PALETTE.rose, dashSize: 0.08, gapSize: 0.08, transparent: true, opacity: 0.55 }));
  bcLines.computeLineDistances();
  world.add(bcLines);
  addLabel('|b| < 3√3 M: captured', [-1.25, -B_CRIT * S - 0.14, 0]);

  const diskMesh = new THREE.Mesh(
    new THREE.RingGeometry(DISK_IN * S, DISK_OUT * S, 96, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  diskMesh.rotation.x = -Math.PI / 2;
  diskMesh.visible = disk;
  world.add(diskMesh);
  const diskLabel = addLabel('thin disk 6M to 14M (simplified)', [-DISK_OUT * S * 0.85, -0.12, DISK_OUT * S * 0.4]);
  diskLabel.visible = disk;

  // --- Ray fan: one LineSegments geometry holding every ray, rebuilt only when the fan changes.
  const pathXY = new Float32Array(MAX_RAYS * MAX_PTS * 2);
  const pathS = new Float32Array(MAX_RAYS * MAX_PTS); // cumulative arc length, in M
  const pathN = new Int32Array(MAX_RAYS);
  const rayB = new Float32Array(MAX_RAYS);
  const rayFate: Fate[] = [];
  const segPos = new Float32Array(MAX_RAYS * MAX_PTS * 6);
  const segCol = new Float32Array(MAX_RAYS * MAX_PTS * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3).setUsage(THREE.DynamicDrawUsage));
  const fan = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  fan.frustumCulled = false;
  world.add(fan);
  let rayCount = 0;
  let maxLen = 1;

  const glowTex = glowTexture();
  const dotPos = new Float32Array(MAX_RAYS * 3);
  const dotCol = new Float32Array(MAX_RAYS * 3);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3).setUsage(THREE.DynamicDrawUsage));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3));
  const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  dots.frustumCulled = false;
  world.add(dots);
  const dotPtr = new Int32Array(MAX_RAYS);

  const col = new THREE.Color();
  const tmpPts = new Float32Array(MAX_PTS * 2);

  function rebuildFan(): void {
    const bs: number[] = [];
    for (let i = 0; i < nRays; i++) bs.push(-fanW + (2 * fanW * (i + 0.5)) / nRays);
    for (const d of CLUSTER) bs.push(B_CRIT + d, -(B_CRIT + d));
    rayCount = Math.min(MAX_RAYS, bs.length);
    let seg = 0;
    maxLen = 1;
    for (let r = 0; r < rayCount; r++) {
      const b = bs[r];
      rayB[r] = b;
      const res = tracePath(b, X0, R_OUT, tmpPts, MAX_PTS, 0.1);
      rayFate[r] = res.fate;
      pathN[r] = res.n;
      rayColor(b, fanW, col);
      const base = r * MAX_PTS;
      let s = 0;
      for (let k = 0; k < res.n; k++) {
        const x = tmpPts[2 * k];
        const y = tmpPts[2 * k + 1];
        if (k > 0) s += Math.hypot(x - tmpPts[2 * k - 2], y - tmpPts[2 * k - 1]);
        pathXY[2 * (base + k)] = x;
        pathXY[2 * (base + k) + 1] = y;
        pathS[base + k] = s;
        if (k > 0) {
          const o = seg * 6;
          segPos[o] = tmpPts[2 * k - 2] * S;
          segPos[o + 1] = tmpPts[2 * k - 1] * S;
          segPos[o + 2] = 0;
          segPos[o + 3] = x * S;
          segPos[o + 4] = y * S;
          segPos[o + 5] = 0;
          for (let v = 0; v < 2; v++) {
            segCol[o + 3 * v] = col.r;
            segCol[o + 3 * v + 1] = col.g;
            segCol[o + 3 * v + 2] = col.b;
          }
          seg++;
        }
      }
      if (s > maxLen) maxLen = s;
      dotCol[3 * r] = Math.min(1, col.r * 1.3 + 0.15);
      dotCol[3 * r + 1] = Math.min(1, col.g * 1.3 + 0.15);
      dotCol[3 * r + 2] = Math.min(1, col.b * 1.3 + 0.15);
      dotPtr[r] = 0;
    }
    segGeo.setDrawRange(0, seg * 2);
    (segGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (segGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (dotGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    dotGeo.setDrawRange(0, rayCount);
  }

  let photonS = 0;
  function moveDots(): void {
    const period = maxLen + 12;
    if (photonS > period) {
      photonS -= period;
      dotPtr.fill(0);
    }
    for (let r = 0; r < rayCount; r++) {
      const base = r * MAX_PTS;
      const n = pathN[r];
      let k = dotPtr[r];
      while (k < n - 1 && pathS[base + k + 1] < photonS) k++;
      dotPtr[r] = k;
      if (k >= n - 1) {
        // Finished: park it at the end (inside the horizon for captured rays), or far off for escaped ones.
        const far = rayFate[r] === 'captured' ? 0 : 1e4;
        dotPos[3 * r] = far;
        dotPos[3 * r + 1] = 0;
        dotPos[3 * r + 2] = 0;
        continue;
      }
      const s0 = pathS[base + k];
      const s1 = pathS[base + k + 1];
      const f = s1 > s0 ? (photonS - s0) / (s1 - s0) : 0;
      const i = 2 * (base + k);
      dotPos[3 * r] = (pathXY[i] + (pathXY[i + 2] - pathXY[i]) * f) * S;
      dotPos[3 * r + 1] = (pathXY[i + 1] + (pathXY[i + 3] - pathXY[i + 1]) * f) * S;
      dotPos[3 * r + 2] = 0;
    }
    (dotGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Probe ray: a white tube, rebuilt when b changes.
  const probeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const probeMesh = new THREE.Mesh(new THREE.BufferGeometry(), probeMat);
  world.add(probeMesh);
  const probeLabel = addLabel('', [0, 0, 0], '');
  let probe: SweepResult = sweep(probeBase);
  let probeAlpha = NaN;
  const probePts = new Float32Array(MAX_PTS * 4 * 2);

  const probeB = () => probeBase + probeFine;

  function rebuildProbe(): void {
    const b = probeB();
    const critical = Math.abs(b - B_CRIT) < 1e-9;
    probe = sweep(b);
    if (critical) probe = { fate: 'orbiting', phi: Infinity, rMin: R_PHOTON, drift: 0 };
    probeAlpha = probe.fate === 'escaped' ? probe.phi - Math.PI : NaN;
    probeMesh.geometry.dispose();
    if (Math.abs(b) > 24) {
      probeMesh.geometry = new THREE.BufferGeometry();
      probeLabel.element.textContent = `probe b = ${b.toFixed(1)}M is off-screen above`;
      probeLabel.position.set(-X0 * S + 1.3, 23 * S, 0);
    } else {
      const res = tracePath(b, X0, R_OUT, probePts, MAX_PTS * 4, 0.06);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < res.n; k++) pts.push(new THREE.Vector3(probePts[2 * k] * S, probePts[2 * k + 1] * S, 0.002));
      if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      probeMesh.geometry = new THREE.TubeGeometry(curve, Math.min(3000, pts.length * 2), 0.013, 5, false);
      probeLabel.element.textContent = `probe b = ${b.toFixed(b < 10 ? 4 : 2)}M`;
      probeLabel.position.set(pts[0].x + 0.55, pts[0].y + 0.13, 0);
    }
    drawPlot();
  }

  // --- Lensed sky: full-screen quad with a custom shader. Lookup tables go in as DataTextures.
  let skyLut = buildSkyLut(D, impactFromAngle(D, THETA_LUT), LUT_N);
  let pathLut = buildPathLut(D, skyLut.bMax);
  const lutTex = new THREE.DataTexture(skyLut.phi, LUT_N, 1, THREE.RedFormat, THREE.FloatType);
  lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter;
  lutTex.needsUpdate = true;
  const pathTex = new THREE.DataTexture(pathLut.u, pathLut.np, pathLut.nb, THREE.RedFormat, THREE.FloatType);
  pathTex.magFilter = pathTex.minFilter = THREE.NearestFilter;
  pathTex.needsUpdate = true;

  const uniforms = {
    uLut: { value: lutTex },
    uLutN: { value: LUT_N },
    uPath: { value: pathTex },
    uPathN: { value: new THREE.Vector2(pathLut.np, pathLut.nb) },
    uPhiMax: { value: pathLut.phiMax },
    uBMax: { value: skyLut.bMax },
    uBc: { value: B_CRIT },
    uD: { value: D },
    uTanH: { value: Math.tan((SKY_FOV * Math.PI) / 360) },
    uAspect: { value: 1 },
    uObs: { value: new THREE.Vector3(0, 0, 1) },
    uFwd: { value: new THREE.Vector3(0, 0, -1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uSrcDir: { value: new THREE.Vector3(0, 0, -1) },
    uSrcRad: { value: SRC_RAD_DEG / DEG },
    uDisk: { value: disk ? 1 : 0 },
    uGrid: { value: 0 },
    uTime: { value: 0 },
    uDiskR: { value: new THREE.Vector2(DISK_IN, DISK_OUT) },
    uRect: { value: new THREE.Vector2(0, 1) },
  };
  const skyMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  skyQuad.frustumCulled = false;
  skyQuad.renderOrder = 1000;
  scene.add(skyQuad);

  let shadowDeg = 0;
  let ringDeg = 0;
  function rebuildSky(): void {
    skyLut = buildSkyLut(D, impactFromAngle(D, THETA_LUT), LUT_N);
    pathLut = buildPathLut(D, skyLut.bMax);
    lutTex.image.data = skyLut.phi;
    lutTex.needsUpdate = true;
    pathTex.image.data = pathLut.u;
    pathTex.needsUpdate = true;
    uniforms.uBMax.value = skyLut.bMax;
    uniforms.uD.value = D;
    shadowDeg = Math.asin((B_CRIT * Math.sqrt(1 - 2 / D)) / D) * DEG;
    // Einstein ring for a source straight behind: the angle where the swept angle is exactly π.
    let lo = shadowDeg / DEG + 1e-4;
    let hi = THETA_LUT;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (lookupPhi(skyLut, impactFromAngle(D, m)) > Math.PI) lo = m;
      else hi = m;
    }
    ringDeg = lo * DEG;
  }

  // --- Overlays
  const skyBox = document.createElement('div');
  Object.assign(skyBox.style, {
    position: 'absolute', top: '0', bottom: '0', right: '0', zIndex: '2', pointerEvents: 'none',
    borderLeft: '1px solid #243049',
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
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', width: '210px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    const stops: string[] = [];
    for (let i = 0; i <= 20; i++) {
      const b = (i / 20) * fanW;
      stops.push(`#${rayColor(b, fanW, col).getHexString()} ${((i / 20) * 100).toFixed(0)}%`);
    }
    const bcPct = (B_CRIT / fanW) * 100;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Ray colour = impact parameter |b|</div>
<div style="position:relative;height:8px;border-radius:4px;margin:4px 0 2px;background:linear-gradient(90deg,${stops.join(',')})">
<i style="position:absolute;left:${bcPct}%;top:-3px;bottom:-3px;border-left:2px solid #fff"></i></div>
<div style="display:flex;justify-content:space-between"><span>0</span><span>b_c = 5.196</span><span>${fanW.toFixed(0)}M</span></div>
<div style="margin-top:3px"><span style="color:${css(PALETTE.red)}">Reds</span> fall in. White tube = probe ray.</div>`;
  }

  // Deflection plot inset (log-log): α(b) from the geodesic, the weak-field 4M/b, and the probe.
  const PW = 600;
  const PH = 380;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const bgPlot = document.createElement('canvas');
  bgPlot.width = PW;
  bgPlot.height = PH;
  const PX0 = 70;
  const PX1 = PW - 20;
  const PY0 = 52;
  const PY1 = PH - 46;
  const LB0 = Math.log10(4);
  const LB1 = Math.log10(1000);
  const LA0 = Math.log10(0.1);
  const LA1 = Math.log10(2000);
  const xOf = (b: number) => PX0 + ((Math.log10(b) - LB0) / (LB1 - LB0)) * (PX1 - PX0);
  const yOf = (aDeg: number) => PY1 - ((Math.log10(aDeg) - LA0) / (LA1 - LA0)) * (PY1 - PY0);
  (function drawPlotBackground(): void {
    const c = bgPlot.getContext('2d')!;
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('Deflection α vs b', 16, 32);
    c.font = '18px JetBrains Mono, monospace';
    c.fillStyle = 'rgba(255,107,107,0.14)';
    c.fillRect(PX0, PY0, xOf(B_CRIT) - PX0, PY1 - PY0);
    c.strokeStyle = '#1a2336';
    c.lineWidth = 1.5;
    c.fillStyle = '#8391ab';
    for (const b of [10, 100, 1000]) {
      const x = xOf(b);
      c.beginPath();
      c.moveTo(x, PY0);
      c.lineTo(x, PY1);
      c.stroke();
      c.fillText(String(b), x - (b >= 1000 ? 40 : b >= 100 ? 18 : 12), PH - 18);
    }
    c.fillText('b/M', PX0 + 6, PH - 18);
    for (const a of [1, 10, 100, 1000]) {
      const y = yOf(a);
      c.beginPath();
      c.moveTo(PX0, y);
      c.lineTo(PX1, y);
      c.stroke();
      c.fillText(`${a}°`, 8, y + 6);
    }
    // One full loop
    c.setLineDash([6, 6]);
    c.strokeStyle = 'rgba(245,182,66,0.6)';
    c.beginPath();
    c.moveTo(PX0, yOf(360));
    c.lineTo(PX1, yOf(360));
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = css(PALETTE.amber);
    c.fillText('360°', PX1 - 56, yOf(360) - 6);
    c.fillStyle = css(PALETTE.rose);
    c.fillText('captured', PX0 + 4, PY1 - 8);
    // Weak field 4M/b
    c.save();
    c.beginPath();
    c.rect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    c.clip();
    c.setLineDash([8, 6]);
    c.strokeStyle = css(PALETTE.violet);
    c.lineWidth = 2.5;
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const b = Math.pow(10, LB0 + ((LB1 - LB0) * i) / 60);
      const y = yOf(weakDeflection(b) * DEG);
      if (i === 0) c.moveTo(xOf(b), y);
      else c.lineTo(xOf(b), y);
    }
    c.stroke();
    c.setLineDash([]);
    // Exact geodesic result, sampled densely near b_c
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 3.5;
    c.beginPath();
    let first = true;
    for (let i = 0; i <= 90; i++) {
      const s = -4.5 + ((Math.log10(1000 - B_CRIT) + 4.5) * i) / 90;
      const b = B_CRIT + Math.pow(10, s);
      const a = deflection(b, 5e-3) * DEG;
      const x = xOf(b);
      const y = Math.max(PY0 - 10, yOf(a));
      if (first) c.moveTo(x, y);
      else c.lineTo(x, y);
      first = false;
    }
    c.stroke();
    c.restore();
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = css(PALETTE.cyan);
    c.fillText('exact', PW - 250, 32);
    c.fillStyle = css(PALETTE.violet);
    c.fillText('4M/b', PW - 180, 32);
    c.fillStyle = '#ffffff';
    c.fillText('probe', PW - 110, 32);
  })();

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    const b = probeB();
    if (b < 4 || b > 1000) return;
    const x = xOf(b);
    pctx.fillStyle = '#ffffff';
    pctx.strokeStyle = '#ffffff';
    if (Number.isFinite(probeAlpha)) {
      const y = Math.max(PY0, Math.min(PY1, yOf(probeAlpha * DEG)));
      pctx.beginPath();
      pctx.arc(x, y, 8, 0, TWO_PI);
      pctx.fill();
    } else {
      pctx.lineWidth = 3;
      pctx.beginPath();
      pctx.moveTo(x, PY0);
      pctx.lineTo(x, PY1);
      pctx.stroke();
    }
  }

  // --- View layout
  const cam = camera as THREE.PerspectiveCamera;
  function applyView(fly: boolean): void {
    const showRays = view !== 'sky';
    world.visible = showRays;
    for (const l of labels) l.visible = showRays && (l !== diskLabel || disk);
    skyQuad.visible = view !== 'rays';
    skyBox.style.display = view === 'rays' ? 'none' : '';
    skyBox.style.left = view === 'split' ? '50%' : '0';
    skyBox.style.borderLeftWidth = view === 'split' ? '1px' : '0';
    uniforms.uRect.value.set(view === 'split' ? 0 : -1, 1);
    if (view === 'split') cam.setViewOffset(1, 1, 0.25, 0, 1, 1);
    else cam.clearViewOffset();
    plot.style.display = view === 'sky' ? 'none' : '';
    plot.style.right = view === 'split' ? '' : '10px';
    plot.style.left = view === 'split' ? '10px' : '';
    plot.style.width = `${view === 'split' ? PW * 0.42 : PW / 2}px`;
    plot.style.height = `${view === 'split' ? PH * 0.42 : PH / 2}px`;
    legend.style.display = view === 'sky' ? 'none' : '';
    if (fly) stage.flyTo(CAMS[view], [0, 0, 0]);
  }

  function paintSkyTitle(): void {
    skyTitle.innerHTML = `<div style="color:#dfe6f3;font-weight:600">What you would see</div>
<div>static observer at r = ${D.toFixed(0)}M, looking at the hole</div>
<div>drag to look from another side</div>
${disk ? `<div style="color:${css(PALETTE.amber)}">disk is simplified: no Doppler beaming or redshift</div>` : ''}`;
  }

  // --- Frame loop
  const size = new THREE.Vector2();
  const obs = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  stage.onFrame((dt, t) => {
    rim.quaternion.copy(camera.quaternion);
    if (showPhotons && world.visible) {
      photonS += dt * PHOTON_SPEED;
      moveDots();
    }
    if (skyQuad.visible) {
      stage.renderer.getSize(size);
      const frac = view === 'split' ? 0.5 : 1;
      uniforms.uAspect.value = (size.x * frac) / Math.max(1, size.y);
      obs.copy(camera.position).sub(controls.target).normalize();
      uniforms.uObs.value.copy(obs);
      uniforms.uFwd.value.copy(obs).negate();
      uniforms.uRight.value.crossVectors(uniforms.uFwd.value, worldUp).normalize();
      uniforms.uUp.value.crossVectors(uniforms.uRight.value, uniforms.uFwd.value);
      const bt = srcOffsetDeg / DEG;
      uniforms.uSrcDir.value.copy(uniforms.uFwd.value).multiplyScalar(Math.cos(bt)).addScaledVector(uniforms.uUp.value, Math.sin(bt));
      uniforms.uTime.value = t;
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'rays', label: 'Rays (3D)' }, { value: 'split', label: 'Rays + sky' }, { value: 'sky', label: 'What you would see' }],
    onChange: (v) => { view = v; touched = true; applyView(true); },
  });

  ui.section('Ray fan');
  ui.slider({ key: 'fan', label: 'Fan width (largest |b|)', min: 6, max: 22, step: 0.5, value: fanW, unit: 'M', onInput: (v) => { fanW = v; rebuildFan(); paintLegend(); } });
  ui.slider({ key: 'rays', label: 'Number of rays', min: 4, max: 48, step: 2, value: nRays, onInput: (v) => { nRays = v; rebuildFan(); } });
  ui.toggle({ key: 'photons', label: 'Moving photons (schematic speed)', value: showPhotons, onChange: (v) => { showPhotons = v; dots.visible = v; } });
  ui.note('Each fan also carries a few extra rays just outside and inside b_c. The ones closest to b_c wrap around the photon sphere before leaving.');

  ui.section('Probe ray (white)');
  const baseCtl = ui.slider({
    key: 'probeB', label: 'Impact parameter b', min: 0, max: 3, step: 0.001, value: Math.log10(probeBase),
    format: (v) => `${Math.pow(10, v).toFixed(v < 1 ? 3 : 1)} M`,
    onInput: (v) => { probeBase = Math.pow(10, v); touched = true; rebuildProbe(); },
  });
  const fineCtl = ui.slider({
    key: 'fine', label: 'Fine tune Δb', min: -0.02, max: 0.02, step: 0.0001, value: 0,
    format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(4)} M`,
    onInput: (v) => { probeFine = v; touched = true; rebuildProbe(); },
  });
  ui.buttons([
    { label: 'Snap to b_c', key: 'bc', onClick: () => { probeBase = B_CRIT; probeFine = 0; baseCtl.set(Math.log10(B_CRIT), false); fineCtl.set(0, false); touched = true; rebuildProbe(); } },
  ]);

  ui.section('Lensed sky');
  ui.slider({ key: 'D', label: 'Observer distance', min: 15, max: 80, step: 1, value: D, unit: 'M', onInput: (v) => { D = v; rebuildSky(); paintSkyTitle(); } });
  ui.slider({ key: 'offset', label: 'Bright source offset β', min: 0, max: 20, step: 0.1, value: srcOffsetDeg, unit: '°', format: (v) => v.toFixed(1), onInput: (v) => { srcOffsetDeg = v; touched = true; } });
  ui.select<Sky>({
    key: 'sky', label: 'Background', value: sky,
    options: [{ value: 'stars', label: 'Starfield' }, { value: 'grid', label: 'Grid sphere' }],
    onChange: (v) => { sky = v; uniforms.uGrid.value = v === 'grid' ? 1 : 0; },
  });
  ui.toggle({
    key: 'disk', label: 'Thin accretion disk (simplified)', value: disk,
    onChange: (v) => { disk = v; uniforms.uDisk.value = v ? 1 : 0; diskMesh.visible = v; diskLabel.visible = v && view !== 'sky'; paintSkyTitle(); },
  });
  ui.note('The bright source sits β degrees above the point straight behind the hole. It has a radius of 1.5°.');

  ui.section('Probe readouts');
  const rB = ui.readout('b', 'impact parameter b', 'M');
  const rAlpha = ui.readout('alpha', 'deflection α');
  const rSwept = ui.readout('swept', 'angle swept φ');
  const rWeak = ui.readout('weak', 'weak field 4M/b');
  const rErr = ui.readout('err', 'α vs 4M/b');
  const rMin = ui.readout('rmin', 'closest approach', 'M');
  const rFate = ui.readout('fate', 'fate');
  const rDrift = ui.readout('drift', 'invariant drift');
  ui.section('Sky readouts');
  const rShadow = ui.readout('shadow', 'shadow radius');
  const rRing = ui.readout('ring', 'Einstein ring radius');
  const rRingW = ui.readout('ringWeak', 'weak field √(4M/D)');
  const rBc = ui.readout('bc', 'critical b_c = 3√3 M', 'M');
  ui.legend([
    { color: css(PALETTE.rose), label: 'photon sphere 3M' },
    { color: css(PALETTE.red), label: 'horizon 2M' },
    { color: '#ffffff', label: 'probe ray' },
  ]);

  const fmtDeg = (d: number) => (d >= 10 ? `${d.toFixed(1)}°` : d >= 0.1 ? `${d.toFixed(3)}°` : `${(d * 3600).toFixed(1)}″`);

  function weakErr(): number {
    return Number.isFinite(probeAlpha) ? probeAlpha / weakDeflection(probeB()) - 1 : NaN;
  }

  let readoutTimer = 1;
  stage.onFrame((dt) => {
    readoutTimer += dt;
    if (readoutTimer < 0.15) return;
    readoutTimer = 0;
    const b = probeB();
    rB(b.toFixed(b < 10 ? 4 : 2));
    rAlpha(Number.isFinite(probeAlpha) ? fmtDeg(probeAlpha * DEG) : probe.fate === 'captured' ? 'captured' : '∞');
    rSwept(Number.isFinite(probe.phi) ? fmtDeg(probe.phi * DEG) : '∞');
    rWeak(fmtDeg(weakDeflection(b) * DEG));
    const e = weakErr();
    rErr(Number.isFinite(e) ? `${e >= 0 ? '+' : ''}${(e * 100).toFixed(e < 0.1 ? 2 : 0)}%` : '–');
    rMin(probe.rMin.toFixed(3));
    rFate(probe.fate === 'orbiting' ? 'orbits at 3M' : probe.fate);
    rDrift(probe.drift < 1e-15 ? '0' : probe.drift.toExponential(0));
    rShadow(`${shadowDeg.toFixed(2)}°`);
    rRing(`${ringDeg.toFixed(2)}°`);
    rRingW(`${(Math.sqrt(4 / D) * DEG).toFixed(2)}°`);
    rBc(B_CRIT.toFixed(4));
  });

  rebuildFan();
  paintLegend();
  rebuildSky();
  rebuildProbe();
  paintSkyTitle();
  applyView(false);
  touched = false;

  return {
    state: () => {
      const e = weakErr();
      return {
        touched,
        view,
        disk,
        D,
        fanW,
        rays: nRays,
        probeB: probeB(),
        probeFate: probe.fate,
        probeAlphaDeg: Number.isFinite(probeAlpha) ? probeAlpha * DEG : 0,
        weakErr: Number.isFinite(e) ? Math.abs(e) : 1,
        srcOffsetDeg,
        srcRadiusDeg: SRC_RAD_DEG,
        ringFull: srcOffsetDeg < SRC_RAD_DEG,
        shadowDeg,
        ringDeg,
      };
    },
    dispose: () => {
      plot.remove();
      legend.remove();
      skyBox.remove();
      glowTex.dispose();
      lutTex.dispose();
      pathTex.dispose();
      cam.clearViewOffset();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'black-hole-lensing',
  number: 10,
  symbol: 'Bh',
  title: 'Black Hole Lensing',
  domain: 'relativity',
  level: 3,
  status: 'live',
  tagline: 'Light rays that loop around a black hole before reaching you.',
  content,
  mount,
};

export default topic;
