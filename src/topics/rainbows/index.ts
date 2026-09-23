import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { content } from './content.ts';
import { DEG, descartes, deviation, fresnel, nWater, pathWeight, skyAngle, skyLut, spectralColor, traceRay } from './physics.ts';

type View = 'drop' | 'sky';
type ColorMode = 'spectrum' | 'single';
type Orders = '1' | '2' | 'both';

const S = 2; // drop radius in scene units
const X_IN = -7; // incoming rays start here
const EXIT_LEN = 5; // length of drawn exit rays
const MAX_RAYS = 160;
const SPECTRUM = [700, 640, 590, 550, 510, 460, 400];
const MAX_SEG = MAX_RAYS * (1 + SPECTRUM.length * 7);
const SKY_BINS = 1400;
const SKY_MAX = 70 * DEG;
const SUN_RADIUS = 0.2665 * DEG;
const DOME = 300;
const DROP_CAM: [number, number, number] = [-0.1, 0.3, 15];
const DROP_TARGET: [number, number, number] = [-0.3, -0.3, 0];

// Inset plot
const PW = 600;
const PH = 400;
const PX0 = 66;
const PX1 = 436;
const HX0 = 454;
const HX1 = PW - 14;
const PY0 = 64;
const PY1 = PH - 44;
const TH_MAX = 70;
const H_BINS = 140;

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uLut;
uniform float uBins;
uniform float uThMax;
uniform vec3 uAnti;
uniform vec3 uU;
uniform vec3 uW;
uniform float uGuides;
uniform vec2 uBows;
uniform float uGain;
varying vec3 vWorld;

vec3 lut(float th) {
  float x = clamp(th / uThMax, 0.0, 1.0) * (uBins - 1.0);
  float i = floor(x);
  vec3 a = texelFetch(uLut, ivec2(int(i), 0), 0).rgb;
  vec3 c = texelFetch(uLut, ivec2(int(min(i + 1.0, uBins - 1.0)), 0), 0).rgb;
  return mix(a, c, x - i);
}

void main() {
  vec3 n = normalize(vWorld - cameraPosition);
  float th = acos(clamp(dot(n, uAnti), -1.0, 1.0));
  vec3 col;
  if (n.y >= 0.0) {
    float e = sqrt(n.y);
    col = mix(vec3(0.17, 0.19, 0.23), vec3(0.035, 0.045, 0.075), e);
    vec3 bow = max(lut(th), vec3(0.0)) * uGain;
    col += bow * smoothstep(0.0, 0.015, n.y);
  } else {
    float d = sqrt(-n.y);
    col = mix(vec3(0.045, 0.06, 0.035), vec3(0.012, 0.016, 0.012), d);
    // Shadow of the observer's head sits at the antisolar point.
    col *= mix(0.25, 1.0, smoothstep(0.012, 0.03, th));
  }
  float hz = 1.0 - smoothstep(0.0, 0.004, abs(n.y));
  col += vec3(0.25, 0.3, 0.35) * hz;
  if (uGuides > 0.5) {
    float az = atan(dot(n, uU), dot(n, uW));
    float dash = step(0.5, fract(az * 18.0));
    float w = 0.0022;
    float g = (1.0 - smoothstep(w * 0.4, w, abs(th - uBows.x))) + (1.0 - smoothstep(w * 0.4, w, abs(th - uBows.y)));
    col = mix(col, vec3(0.85, 0.9, 1.0), 0.45 * g * dash);
  }
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}`;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: DROP_CAM, target: DROP_TARGET, fov: 42, far: 800 });
  const { scene, controls } = stage;
  const cam = stage.camera as THREE.PerspectiveCamera;

  let view: View = 'drop';
  let colorMode: ColorMode = 'spectrum';
  let lambda = 650;
  let orders: Orders = '1';
  let nRays = 48;
  let hb = 0.5;
  let useFresnel = true;
  let showCone = false;
  let sunElev = 15;
  let guides = true;
  let touched = false;

  // ------------------------------------------------------------ droplet view
  const dropWorld = new THREE.Group();
  scene.add(dropWorld);

  const drop = new THREE.Mesh(
    new THREE.SphereGeometry(S, 64, 48),
    new THREE.MeshStandardMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.1, roughness: 0.08, metalness: 0.0, depthWrite: false }),
  );
  dropWorld.add(drop);
  const rimPts: THREE.Vector3[] = [];
  for (let j = 0; j <= 128; j++) rimPts.push(new THREE.Vector3(S * Math.cos((j / 128) * Math.PI * 2), S * Math.sin((j / 128) * Math.PI * 2), 0));
  const rim = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.55 }));
  dropWorld.add(rim);

  // Ray fan: one LineSegments buffer, rebuilt only when parameters change.
  const segPos = new Float32Array(MAX_SEG * 6);
  const segCol = new Float32Array(MAX_SEG * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setDrawRange(0, 0);
  const segMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const fan = new THREE.LineSegments(segGeo, segMat);
  fan.frustumCulled = false;
  fan.renderOrder = 2;
  dropWorld.add(fan);

  // Guides: antisolar axis, bow directions, angle arcs (rebuilt on change).
  const guideGroup = new THREE.Group();
  dropWorld.add(guideGroup);
  const tubeGroup = new THREE.Group();
  dropWorld.add(tubeGroup);
  const coneGroup = new THREE.Group();
  dropWorld.add(coneGroup);

  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-EXIT_LEN - 1.2, 0, 0)]);
  const axis = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0x8391ab, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.8 }));
  axis.computeLineDistances();
  dropWorld.add(axis);

  const sunLabel = stage.label('sunlight →', [X_IN + 0.6, S + 0.45, 0], 'muted');
  const axisLabel = stage.label('back toward the Sun', [-EXIT_LEN - 0.4, -0.35, 0], 'muted');
  const bowLabels: CSS2DObject[] = [stage.label('', [0, 0, 0]), stage.label('', [0, 0, 0])];
  const arcLabels: CSS2DObject[] = [stage.label('', [0, 0, 0]), stage.label('', [0, 0, 0])];
  const dropLabels = [sunLabel, axisLabel, ...bowLabels, ...arcLabels];

  // Pulses travelling along the highlight rays.
  const PULSES = 8;
  const pulsePos = new Float32Array(PULSES * 3);
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3).setUsage(THREE.DynamicDrawUsage));
  const pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }));
  pulses.frustumCulled = false;
  pulses.renderOrder = 4;
  dropWorld.add(pulses);
  const hlPaths: { pts: Float32Array; cum: Float32Array; n: number }[] = [0, 1].map(() => ({ pts: new Float32Array(3 * 8), cum: new Float32Array(8), n: 0 }));

  const trace = new Float64Array(16);
  const tmpColor = new THREE.Color();
  const lambdas = (): number[] => (colorMode === 'spectrum' ? SPECTRUM : [lambda]);
  const orderList = (): number[] => (orders === 'both' ? [1, 2] : [Number(orders)]);

  function colorOf(l: number, out: THREE.Color): THREE.Color {
    const [r, g, b] = spectralColor(l);
    return out.setRGB(r, g, b, THREE.SRGBColorSpace);
  }

  /** Average of s and p power left after entry, j reflections and (optionally) exit. */
  function segWeight(rs: number, rp: number, j: number, exit: boolean): number {
    const s = (1 - rs) * rs ** j * (exit ? 1 - rs : 1);
    const p = (1 - rp) * rp ** j * (exit ? 1 - rp : 1);
    return (s + p) / 2;
  }

  function rebuildFan(): void {
    let seg = 0;
    const put = (x0: number, y0: number, x1: number, y1: number, c: THREE.Color, a: number) => {
      if (seg >= MAX_SEG) return;
      const o = seg * 6;
      segPos[o] = x0; segPos[o + 1] = y0; segPos[o + 2] = 0;
      segPos[o + 3] = x1; segPos[o + 4] = y1; segPos[o + 5] = 0;
      segCol[o] = c.r * a; segCol[o + 1] = c.g * a; segCol[o + 2] = c.b * a;
      segCol[o + 3] = c.r * a; segCol[o + 4] = c.g * a; segCol[o + 5] = c.b * a;
      seg++;
    };
    const ls = lambdas();
    const ks = orderList();
    const perL = colorMode === 'spectrum' ? 0.42 : 0.8;
    const white = tmpColor.set(0xffffff);
    const wIn = colorMode === 'spectrum' ? 0.35 : 0.3;
    for (let j = 0; j < nRays; j++) {
      const b = (j + 0.5) / nRays;
      put(X_IN, b * S, -Math.sqrt(1 - b * b) * S, b * S, white, wIn);
    }
    const c = new THREE.Color();
    // Reference brightness: the exit ray of the primary Descartes ray.
    for (const l of ls) {
      const n = nWater(l);
      colorOf(l, c);
      const dRef = descartes(n, 1);
      const fRef = fresnel(dRef.i, n);
      const ref = segWeight(fRef.rs, fRef.rp, 1, true);
      for (const k of ks) {
        for (let j = 0; j < nRays; j++) {
          const b = (j + 0.5) / nRays;
          const m = traceRay(b, n, k, trace);
          const f = useFresnel ? fresnel(Math.asin(b), n) : null;
          for (let q = 0; q < m - 1; q++) {
            const a = f ? Math.min(1, Math.sqrt(segWeight(f.rs, f.rp, q, false) / ref)) : 1;
            put(trace[2 * q] * S, trace[2 * q + 1] * S, trace[2 * q + 2] * S, trace[2 * q + 3] * S, c, perL * a);
          }
          const ex = trace[2 * (m - 1)] * S;
          const ey = trace[2 * (m - 1) + 1] * S;
          const a = f ? Math.min(1, Math.sqrt(segWeight(f.rs, f.rp, k, true) / ref)) : 1;
          put(ex, ey, ex + trace[2 * m] * EXIT_LEN, ey + trace[2 * m + 1] * EXIT_LEN, c, perL * a);
        }
      }
    }
    segGeo.setDrawRange(0, seg * 2);
    (segGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (segGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function pathPoints(b: number, n: number, k: number, len: number): THREE.Vector3[] {
    const m = traceRay(b, n, k, trace);
    const pts = [new THREE.Vector3(X_IN, b * S, 0)];
    for (let q = 0; q < m; q++) pts.push(new THREE.Vector3(trace[2 * q] * S, trace[2 * q + 1] * S, 0));
    const last = pts[pts.length - 1];
    pts.push(new THREE.Vector3(last.x + trace[2 * m] * len, last.y + trace[2 * m + 1] * len, 0));
    return pts;
  }

  function tube(pts: THREE.Vector3[], color: THREE.Color, radius: number, opacity: number): THREE.Mesh {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let q = 0; q < pts.length - 1; q++) path.add(new THREE.LineCurve3(pts[q], pts[q + 1]));
    const geo = new THREE.TubeGeometry(path, 40 * (pts.length - 1), radius, 8, false);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false }));
    m.renderOrder = 3;
    return m;
  }

  function clearGroup(g: THREE.Group): void {
    for (const o of [...g.children]) {
      g.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    }
  }

  function rebuildGuides(): void {
    clearGroup(tubeGroup);
    clearGroup(guideGroup);
    clearGroup(coneGroup);
    const n = nWater(lambda);
    const ks = orderList();
    const lc = colorOf(lambda, new THREE.Color());
    for (let s = 0; s < 2; s++) {
      bowLabels[s].visible = false;
      arcLabels[s].visible = false;
      hlPaths[s].n = 0;
    }
    ks.forEach((k, s) => {
      const d = descartes(n, k);
      // Descartes ray (amber) and highlight ray (white).
      tubeGroup.add(tube(pathPoints(d.b, n, k, EXIT_LEN + 0.4), new THREE.Color(PALETTE.amber), 0.035, 0.95));
      const hp = pathPoints(hb, n, k, EXIT_LEN + 0.4);
      tubeGroup.add(tube(hp, new THREE.Color(0xffffff), 0.026, 0.9));
      const P = hlPaths[s];
      P.n = hp.length;
      let acc = 0;
      hp.forEach((v, q) => {
        P.pts[3 * q] = v.x; P.pts[3 * q + 1] = v.y; P.pts[3 * q + 2] = v.z;
        if (q > 0) acc += v.distanceTo(hp[q - 1]);
        P.cum[q] = acc;
      });
      // Bow direction from the drop centre, and the angle arc from the antisolar axis.
      const ex = Math.cos(d.D);
      const ey = -Math.sin(d.D);
      const dirGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(ex * (EXIT_LEN + 1.2), ey * (EXIT_LEN + 1.2), 0)]);
      const dir = new THREE.Line(dirGeo, new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.75 }));
      dir.computeLineDistances();
      guideGroup.add(dir);
      const R = 2.5 + 0.5 * s;
      const a0 = Math.PI;
      const a1 = Math.atan2(ey, ex);
      let da = a1 - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const arc: THREE.Vector3[] = [];
      for (let q = 0; q <= 40; q++) {
        const a = a0 + (da * q) / 40;
        arc.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0));
      }
      guideGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc), new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8 })));
      const am = a0 + da * 0.5;
      arcLabels[s].position.set((R + 0.55) * Math.cos(am), (R + 0.55) * Math.sin(am), 0);
      arcLabels[s].element.textContent = `θ = ${(d.theta / DEG).toFixed(1)}°`;
      arcLabels[s].visible = view === 'drop';
      bowLabels[s].position.set(ex * (EXIT_LEN + 1.9), ey * (EXIT_LEN + 1.9), 0);
      bowLabels[s].element.textContent = k === 1 ? 'primary bow direction' : 'secondary bow direction';
      bowLabels[s].visible = view === 'drop';
      if (showCone) {
        const L = EXIT_LEN;
        const g = new THREE.ConeGeometry(L * Math.tan(d.theta), L, 64, 1, true);
        g.translate(0, -L / 2, 0);
        g.rotateZ(-Math.PI / 2);
        const cone = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: lc, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        coneGroup.add(cone);
        const ring: THREE.Vector3[] = [];
        const rr = L * Math.tan(d.theta);
        for (let q = 0; q <= 96; q++) {
          const a = (q / 96) * Math.PI * 2;
          ring.push(new THREE.Vector3(-L, rr * Math.cos(a), rr * Math.sin(a)));
        }
        coneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: lc, transparent: true, opacity: 0.5, toneMapped: false })));
      }
    });
  }

  function movePulses(t: number): void {
    let active = 0;
    for (const P of hlPaths) if (P.n > 1) active++;
    const per = active ? Math.floor(PULSES / active) : 0;
    let w = 0;
    for (const P of hlPaths) {
      if (P.n < 2) continue;
      const total = P.cum[P.n - 1];
      for (let q = 0; q < per; q++) {
        const s = (t * 3.2 + (q / per) * total) % total;
        let seg = 1;
        while (seg < P.n - 1 && P.cum[seg] < s) seg++;
        const s0 = P.cum[seg - 1];
        const f = (s - s0) / Math.max(1e-6, P.cum[seg] - s0);
        for (let c = 0; c < 3; c++) pulsePos[3 * w + c] = P.pts[3 * (seg - 1) + c] + (P.pts[3 * seg + c] - P.pts[3 * (seg - 1) + c]) * f;
        w++;
      }
    }
    pulseGeo.setDrawRange(0, w);
    (pulseGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------ inset plot
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW * 0.45}px`, height: `${PH * 0.45}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const xOf = (b: number) => PX0 + b * (PX1 - PX0);
  const yOf = (th: number) => PY1 - (th / TH_MAX) * (PY1 - PY0);
  const hist = new Float64Array(H_BINS);

  function rgbCss(l: number, a = 1): string {
    const [r, g, b] = spectralColor(l);
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
  }

  function drawPlot(): void {
    const c = pctx;
    c.clearRect(0, 0, PW, PH);
    c.font = '600 24px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('Sky angle θ vs height b', 14, 32);
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('light, √', HX0 + 2, PY0 - 6);
    const ls = lambdas();
    const ks = orderList();
    // Dark band shading when both orders show.
    if (ks.length === 2) {
      const t1 = Math.max(...ls.map((l) => descartes(nWater(l), 1).theta / DEG));
      const t2 = Math.min(...ls.map((l) => descartes(nWater(l), 2).theta / DEG));
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(PX0, yOf(t2), HX1 - PX0, yOf(t1) - yOf(t2));
      c.fillStyle = '#b8c3d9';
      c.fillText('dark band', PX0 + 8, (yOf(t1) + yOf(t2)) / 2 + 6);
    }
    // Grid
    c.strokeStyle = '#1a2336';
    c.lineWidth = 1.5;
    c.fillStyle = '#8391ab';
    for (const th of [0, 20, 40, 60]) {
      const y = yOf(th);
      c.beginPath();
      c.moveTo(PX0, y);
      c.lineTo(HX1, y);
      c.stroke();
      c.fillText(`${th}°`, 10, y + 6);
    }
    for (const b of [0, 0.5, 1]) {
      const x = xOf(b);
      c.beginPath();
      c.moveTo(x, PY0);
      c.lineTo(x, PY1);
      c.stroke();
      c.fillText(b.toFixed(1), x - 14, PH - 18);
    }
    c.fillText('b →', PX0 + 60, PH - 18);
    c.strokeStyle = '#243049';
    c.beginPath();
    c.moveTo(HX0 - 4, PY0);
    c.lineTo(HX0 - 4, PY1);
    c.stroke();
    // Curves and histograms.
    c.save();
    c.beginPath();
    c.rect(PX0, PY0 - 2, HX1 - PX0, PY1 - PY0 + 4);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    hist.fill(0);
    const perHist: { l: number; h: Float64Array }[] = [];
    let hmax = 0;
    for (const l of ls) {
      const n = nWater(l);
      const h = new Float64Array(H_BINS);
      for (const k of ks) {
        c.strokeStyle = rgbCss(l, 0.9);
        c.lineWidth = 3;
        c.beginPath();
        let penDown = false;
        for (let q = 0; q <= 200; q++) {
          const b = Math.min(0.9995, q / 200);
          const th = skyAngle(deviation(b, n, k)) / DEG;
          const x = xOf(b);
          const y = yOf(Math.min(th, TH_MAX + 2));
          if (!penDown) c.moveTo(x, y);
          else c.lineTo(x, y);
          penDown = true;
        }
        c.stroke();
        for (let q = 0; q < 6000; q++) {
          const b = (q + 0.5) / 6000;
          const th = skyAngle(deviation(b, n, k)) / DEG;
          const bin = Math.floor((th / TH_MAX) * H_BINS);
          if (bin < 0 || bin >= H_BINS) continue;
          h[bin] += b * (useFresnel ? pathWeight(b, n, k).total : 0.04);
        }
      }
      for (let q = 0; q < H_BINS; q++) hmax = Math.max(hmax, h[q]);
      perHist.push({ l, h });
    }
    const bh = (PY1 - PY0) / H_BINS;
    for (const { l, h } of perHist) {
      c.fillStyle = rgbCss(l, colorMode === 'spectrum' ? 0.55 : 0.9);
      for (let q = 0; q < H_BINS; q++) {
        if (h[q] <= 0) continue;
        const w = Math.sqrt(h[q] / hmax) * (HX1 - HX0);
        c.fillRect(HX0, yOf((q + 1) * (TH_MAX / H_BINS)), Math.max(1, w), Math.max(1, bh));
      }
    }
    c.globalCompositeOperation = 'source-over';
    // Descartes points and highlight marker for the current wavelength.
    const n = nWater(lambda);
    for (const k of ks) {
      const d = descartes(n, k);
      c.setLineDash([6, 6]);
      c.strokeStyle = css(PALETTE.amber);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(xOf(d.b), yOf(d.theta / DEG));
      c.lineTo(HX1, yOf(d.theta / DEG));
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = css(PALETTE.amber);
      c.beginPath();
      c.arc(xOf(d.b), yOf(d.theta / DEG), 8, 0, Math.PI * 2);
      c.fill();
      const th = skyAngle(deviation(hb, n, k)) / DEG;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(xOf(hb), yOf(Math.min(th, TH_MAX)), 6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // ------------------------------------------------------------ legend
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', right: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', width: '232px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    const k = orders === 'both' ? '1 and 2 reflections' : orders === '1' ? '1 reflection (primary)' : '2 reflections (secondary)';
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Sunlight through one drop</div>
<div>${colorMode === 'spectrum' ? '7 wavelengths, 400 to 700 nm' : `single wavelength ${lambda} nm`}, ${k}</div>
<div><span style="color:${css(PALETTE.amber)}">Amber</span>: Descartes ray. Rays bunch around it.</div>
<div><span style="color:#fff">White</span>: your highlighted ray.</div>
${useFresnel ? '<div>Brightness: Fresnel, relative to the Descartes ray.</div>' : ''}`;
  }

  // ------------------------------------------------------------ sky view
  const skyWorld = new THREE.Group();
  skyWorld.visible = false;
  scene.add(skyWorld);
  const lutData = new Float32Array(SKY_BINS * 4);
  const lutTex = new THREE.DataTexture(lutData, SKY_BINS, 1, THREE.RGBAFormat, THREE.FloatType);
  lutTex.minFilter = THREE.NearestFilter;
  lutTex.magFilter = THREE.NearestFilter;
  const uniforms = {
    uLut: { value: lutTex },
    uBins: { value: SKY_BINS },
    uThMax: { value: SKY_MAX },
    uAnti: { value: new THREE.Vector3(0, 0, -1) },
    uU: { value: new THREE.Vector3(1, 0, 0) },
    uW: { value: new THREE.Vector3(0, 1, 0) },
    uGuides: { value: 1 },
    uBows: { value: new THREE.Vector2(42 * DEG, 51 * DEG) },
    uGain: { value: 0.75 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME, 96, 48),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  skyWorld.add(dome);
  const skyLabels = {
    primary: stage.label('', [0, 0, 0], '', skyWorld),
    secondary: stage.label('', [0, 0, 0], '', skyWorld),
    band: stage.label("Alexander's dark band", [0, 0, 0], 'muted', skyWorld),
    anti: stage.label('shadow of your head = antisolar point', [0, 0, 0], 'muted', skyWorld),
  };

  function rebuildLut(): void {
    const rgb = skyLut({ bins: SKY_BINS, thetaMax: SKY_MAX, fresnel: useFresnel, samples: 9000, sunRadius: SUN_RADIUS, lambdaStep: 10 });
    for (let j = 0; j < SKY_BINS; j++) {
      lutData[4 * j] = rgb[3 * j];
      lutData[4 * j + 1] = rgb[3 * j + 1];
      lutData[4 * j + 2] = rgb[3 * j + 2];
      lutData[4 * j + 3] = 1;
    }
    lutTex.needsUpdate = true;
  }

  const bowRed1 = () => descartes(nWater(700), 1).theta / DEG;
  const bowRed2 = () => descartes(nWater(700), 2).theta / DEG;
  const bowVio2 = () => descartes(nWater(400), 2).theta / DEG;

  const A = new THREE.Vector3();
  const W = new THREE.Vector3();
  const U = new THREE.Vector3(1, 0, 0);
  function skyDir(thDeg: number, psiDeg: number, out: THREE.Vector3): THREE.Vector3 {
    const th = thDeg * DEG;
    const ps = psiDeg * DEG;
    return out.copy(A).multiplyScalar(Math.cos(th))
      .addScaledVector(W, Math.sin(th) * Math.cos(ps))
      .addScaledVector(U, Math.sin(th) * Math.sin(ps));
  }

  function updateSky(): void {
    const h = sunElev * DEG;
    A.set(0, -Math.sin(h), -Math.cos(h));
    W.set(0, Math.cos(h), -Math.sin(h));
    uniforms.uAnti.value.copy(A);
    uniforms.uW.value.copy(W);
    uniforms.uU.value.copy(U);
    uniforms.uGuides.value = guides ? 1 : 0;
    const t1 = bowRed1();
    const t2 = bowRed2();
    uniforms.uBows.value.set(t1 * DEG, t2 * DEG);
    const v = new THREE.Vector3();
    const place = (o: CSS2DObject, th: number, psi: number, onlyAbove = true) => {
      skyDir(th, psi, v);
      o.position.copy(v).multiplyScalar(DOME * 0.8);
      o.visible = view === 'sky' && (!onlyAbove || v.y > 0.02);
    };
    skyLabels.primary.element.textContent = `primary, ${t1.toFixed(1)}°`;
    skyLabels.secondary.element.textContent = `secondary, ${t2.toFixed(1)}° to ${bowVio2().toFixed(1)}°`;
    place(skyLabels.primary, t1 - 3.5, -22);
    place(skyLabels.secondary, bowVio2() + 2.5, -22);
    place(skyLabels.band, (t1 + t2) / 2, 0);
    place(skyLabels.anti, 0, 0, false);
    skyLabels.anti.position.y -= 9;
    paintSkyBox();
  }

  const skyBox = document.createElement('div');
  Object.assign(skyBox.style, {
    position: 'absolute', right: '10px', top: '10px', padding: '6px 10px', borderRadius: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', border: '1px solid #243049', font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9', maxWidth: '280px',
  } as CSSStyleDeclaration);
  skyBox.style.display = 'none';
  viewport.appendChild(skyBox);
  function paintSkyBox(): void {
    const top1 = bowRed1() - sunElev;
    const top2 = bowVio2() - sunElev;
    skyBox.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Looking away from the Sun</div>
<div>Sun behind you at ${sunElev.toFixed(0)}° elevation</div>
<div>top of primary: ${top1 > 0 ? `${top1.toFixed(1)}° up` : '<span style="color:#ff6b6b">below the horizon</span>'}</div>
<div>top of secondary: ${top2 > 0 ? `${top2.toFixed(1)}° up` : '<span style="color:#ff6b6b">below the horizon</span>'}</div>
<div>drag to look around</div>`;
  }

  // ------------------------------------------------------------ view switching
  function applyView(): void {
    const drop = view === 'drop';
    dropWorld.visible = drop;
    skyWorld.visible = !drop;
    plot.style.display = drop ? '' : 'none';
    legend.style.display = drop ? '' : 'none';
    skyBox.style.display = drop ? 'none' : '';
    for (const l of dropLabels) l.visible = drop && l.element.textContent !== '';
    if (drop) {
      rebuildGuides();
      cam.fov = 42;
      cam.position.set(...DROP_CAM);
      controls.target.set(...DROP_TARGET);
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.rotateSpeed = 1;
    } else {
      cam.fov = 72;
      const el = 14 * DEG;
      controls.target.set(0, 0, 0);
      cam.position.set(0, -0.01 * Math.sin(el), 0.01 * Math.cos(el));
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.rotateSpeed = 0.45;
    }
    cam.updateProjectionMatrix();
    controls.update();
    updateSky();
  }

  // ------------------------------------------------------------ frame loop
  stage.onFrame((_dt, t) => {
    if (view === 'drop') movePulses(t);
  });

  // ------------------------------------------------------------ controls
  const ui = new Panel(panel);
  const touch = () => { touched = true; };
  const refreshDrop = () => { rebuildFan(); rebuildGuides(); drawPlot(); paintLegend(); updateReadouts(); };

  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'drop', label: 'Inside a drop' }, { value: 'sky', label: 'Sky' }],
    onChange: (v) => { view = v; touch(); applyView(); updateReadouts(); },
  });

  ui.section('Light');
  ui.select<ColorMode>({
    key: 'color', label: 'Colour', value: colorMode,
    options: [{ value: 'spectrum', label: 'Full spectrum' }, { value: 'single', label: 'One wavelength' }],
    onChange: (v) => { colorMode = v; touch(); refreshDrop(); },
  });
  ui.slider({
    key: 'lambda', label: 'Wavelength λ', min: 400, max: 700, step: 5, value: lambda, unit: 'nm',
    format: (v) => v.toFixed(0),
    onInput: (v) => { lambda = v; touch(); refreshDrop(); },
  });
  ui.note('In full-spectrum mode, λ sets the amber Descartes ray and the white highlight ray.');
  ui.select<Orders>({
    key: 'k', label: 'Internal reflections k', value: orders,
    options: [{ value: '1', label: '1 (primary)' }, { value: '2', label: '2 (secondary)' }, { value: 'both', label: 'Both' }],
    onChange: (v) => { orders = v; touch(); refreshDrop(); },
  });
  ui.slider({ key: 'rays', label: 'Ray count', min: 8, max: MAX_RAYS, step: 4, value: nRays, onInput: (v) => { nRays = v; touch(); rebuildFan(); } });
  const hbCtl = ui.slider({
    key: 'hb', label: 'Highlight ray b', min: 0.01, max: 0.99, step: 0.001, value: hb, format: (v) => v.toFixed(3),
    onInput: (v) => { hb = v; touch(); rebuildGuides(); drawPlot(); updateReadouts(); },
  });
  ui.buttons([
    { label: 'Snap to Descartes ray', key: 'bD', onClick: () => { hb = descartes(nWater(lambda), orders === '2' ? 2 : 1).b; hbCtl.set(Number(hb.toFixed(3)), true); } },
  ]);
  ui.toggle({ key: 'fresnel', label: 'Fresnel brightness', value: useFresnel, onChange: (v) => { useFresnel = v; touch(); rebuildFan(); drawPlot(); paintLegend(); rebuildLut(); } });
  ui.toggle({ key: 'cone', label: 'Show the 3D cone of bow light', value: showCone, onChange: (v) => { showCone = v; touch(); rebuildGuides(); } });

  ui.section('Sky');
  ui.slider({ key: 'sun', label: 'Sun elevation', min: 0, max: 60, step: 0.5, value: sunElev, unit: '°', format: (v) => v.toFixed(1), onInput: (v) => { sunElev = v; touch(); updateSky(); updateReadouts(); } });
  ui.toggle({ key: 'guides', label: 'Guide circles at the bow angles', value: guides, onChange: (v) => { guides = v; touch(); updateSky(); } });

  ui.section('Descartes ray at λ');
  const rN = ui.readout('n', 'index n(λ)');
  const rBD = ui.readout('bD', 'Descartes b');
  const rDmin = ui.readout('Dmin', 'min deviation D');
  const rTheta = ui.readout('theta', 'bow angle θ');
  const rPol = ui.readout('pol', 'polarization');
  const rFrac = ui.readout('frac', 'light on this path');
  ui.section('Highlight ray');
  const rHD = ui.readout('hD', 'deviation D');
  const rHT = ui.readout('hTheta', 'sky angle θ');
  const rHI = ui.readout('hI', 'incidence i');
  const rSnell = ui.readout('snell', '|sin i − n sin r|');
  ui.section('Sky readouts');
  const rTop1 = ui.readout('top1', 'top of primary');
  const rTop2 = ui.readout('top2', 'top of secondary');
  const rBand = ui.readout('band', 'dark band width');
  ui.legend([
    { color: css(PALETTE.amber), label: 'Descartes ray' },
    { color: '#ffffff', label: 'highlight ray' },
    { color: css(PALETTE.cyan), label: 'drop surface' },
  ]);

  function snellResidual(b: number, n: number, k: number): number {
    traceRay(b, n, k, trace);
    const px = trace[0], py = trace[1];
    const dx = trace[2] - px, dy = trace[3] - py;
    const l = Math.hypot(dx, dy);
    const sinR = Math.abs(px * (dy / l) - py * (dx / l));
    return Math.abs(Math.abs(py) - n * sinR);
  }

  const hk = () => (orders === '2' ? 2 : 1);
  function updateReadouts(): void {
    const n = nWater(lambda);
    const k = hk();
    const d = descartes(n, k);
    rN(n.toFixed(4));
    rBD(d.b.toFixed(4));
    rDmin(`${(d.D / DEG).toFixed(2)}°`);
    rTheta(`${(d.theta / DEG).toFixed(2)}°`);
    const w = pathWeight(d.b, n, k);
    rPol(`${(w.pol * 100).toFixed(0)}% tangential`);
    rFrac(`${(w.total * 100).toFixed(2)}%`);
    const D = deviation(hb, n, k);
    rHD(`${(D / DEG).toFixed(2)}°`);
    rHT(`${(skyAngle(D) / DEG).toFixed(2)}°`);
    rHI(`${(Math.asin(hb) / DEG).toFixed(2)}°`);
    const res = snellResidual(hb, n, k);
    rSnell(res < 1e-16 ? '< 1e-16' : res.toExponential(0));
    const t1 = bowRed1() - sunElev;
    const t2 = bowVio2() - sunElev;
    rTop1(t1 > 0 ? `${t1.toFixed(1)}°` : 'below horizon');
    rTop2(t2 > 0 ? `${t2.toFixed(1)}°` : 'below horizon');
    rBand(`${(bowRed2() - bowRed1()).toFixed(1)}°`);
  }

  rebuildLut();
  rebuildFan();
  drawPlot();
  paintLegend();
  applyView();
  updateReadouts();
  touched = false;

  return {
    state: () => {
      const n = nWater(lambda);
      const th = skyAngle(deviation(hb, n, hk())) / DEG;
      return {
        touched,
        view,
        colorMode,
        lambda,
        k: orders,
        rays: nRays,
        hb,
        hTheta: th,
        hOffDescartes: Math.abs(hb - descartes(n, hk()).b),
        bowAngle: descartes(n, hk()).theta / DEG,
        fresnel: useFresnel,
        cone: showCone,
        sunElev,
        primaryTop: bowRed1() - sunElev,
        primaryVisible: bowRed1() - sunElev > 0,
        secondaryTop: bowVio2() - sunElev,
        secondaryReversed: bowRed2() < bowVio2(),
        bandWidth: bowRed2() - bowRed1(),
      };
    },
    dispose: () => {
      plot.remove();
      legend.remove();
      skyBox.remove();
      lutTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'rainbows',
  number: 30,
  title: 'How a Rainbow Works',
  domain: 'em',
  level: 1,
  status: 'live',
  tagline: 'One raindrop, one bounce, and a 42 degree circle in the sky.',
  content,
  mount,
};

export default topic;
