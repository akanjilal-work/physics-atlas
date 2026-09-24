import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  EPOCHS, INFLATION_END, LOG_T_MAX, LOG_T_MIN, GYR_S, blackbodyRGB, buildThermal, formatEnergy, formatKelvin, formatTime,
  gStar, mevToKelvin, radiationT, redshiftAt, scaleAt, sci, sup, tempAt, type Confidence, type Epoch,
} from './physics.ts';

const S_TOT = 280; // tunnel length in scene units
const HR = 5; // helix radius
const HRHO = 9; // helix pitch parameter: one turn per 2π·HRHO units
const TUBE = 2.0; // tunnel radius
const N_WALL = 16000;
const CAM_BACK = 3.4;
const CAM_AHEAD = 1.4;
const INF_START = 1e-36;
const TWO_PI = Math.PI * 2;

const CONF_COLOR: Record<Confidence, number> = {
  observed: PALETTE.green,
  tested: PALETTE.cyan,
  theory: PALETTE.amber,
  speculative: PALETTE.violet,
};
const CONF_LABEL: Record<Confidence, string> = {
  observed: 'observed directly',
  tested: 'tested in the lab',
  theory: 'established theory',
  speculative: 'speculative',
};
const NULL_TEMP: Record<string, string> = {
  planck: 'near the Planck temperature, 1.4 × 10³² K, if the idea applies',
  gut: 'about 10²⁹ K, if the plasma was thermal',
  inflation: 'plunges toward zero, then reheating refills the universe',
};

// False-colour ramp for the tunnel walls: log10 of temperature in K.
const RAMP: [number, number, number, number][] = [
  [-2, 0.1, 0.1, 0.2],
  [0.5, 0.23, 0.18, 0.42],
  [3.5, 1.0, 0.42, 0.42],
  [9, 0.96, 0.71, 0.26],
  [12, 0.37, 0.89, 0.6],
  [16, 0.31, 0.82, 0.91],
  [24, 0.65, 0.55, 0.98],
  [32, 0.92, 0.9, 1.0],
];
function rampColor(lg: number, out: THREE.Color): THREE.Color {
  if (lg <= RAMP[0][0]) return out.setRGB(RAMP[0][1], RAMP[0][2], RAMP[0][3]);
  for (let i = 1; i < RAMP.length; i++) {
    if (lg <= RAMP[i][0]) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const f = (lg - a[0]) / (b[0] - a[0]);
      return out.setRGB(a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3]));
    }
  }
  const l = RAMP[RAMP.length - 1];
  return out.setRGB(l[1], l[2], l[3]);
}
const RAMP_CSS = `linear-gradient(90deg,${[...RAMP].reverse().map((r) => `rgb(${Math.round(r[1] * 255)},${Math.round(r[2] * 255)},${Math.round(r[3] * 255)})`).join(',')})`;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mottled CMB-like texture: smoothed random blotches in orange. Deterministic. */
function cmbTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#f08a3c';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 3 + rnd() * 9;
    const hot = rnd() > 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, hot ? 'rgba(255,214,140,0.55)' : 'rgba(150,40,20,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Visual {
  group: THREE.Group;
  update?: (time: number) => void;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0, 0, 5], target: [0, 0, 0], fov: 60, near: 0.05, far: 120 });
  const { scene, camera, renderer, controls } = stage;
  controls.enabled = false;
  const hint = viewport.querySelector<HTMLElement>('.orbit-hint');
  const hintText = hint?.textContent ?? '';
  if (hint) hint.textContent = 'Scroll, or drag up and down, to travel in time';
  const bg = new THREE.Color(PALETTE.bg);
  scene.background = bg;
  const fog = new THREE.FogExp2(PALETTE.bg, 0.045);
  scene.fog = fog;

  const th = buildThermal();
  const glowTex = glowTexture();
  const cmbTex = cmbTexture();

  // ------------------------------------------------------------ log time to tunnel length
  // Half uniform in log t, half by station rank, so crowded late epochs still get room.
  const N_EP = EPOCHS.length;
  const knotX = [LOG_T_MIN, ...EPOCHS.map((e) => Math.log10(e.t)), LOG_T_MAX];
  const knotY = knotX.map((_, i) => (i === knotX.length - 1 ? S_TOT : (i * S_TOT) / (N_EP + 1)));
  const sOf = (lg: number): number => {
    const lin = ((lg - LOG_T_MIN) / (LOG_T_MAX - LOG_T_MIN)) * S_TOT;
    let k = 0;
    while (k < knotX.length - 2 && lg > knotX[k + 1]) k++;
    const f = Math.max(0, Math.min(1, (lg - knotX[k]) / (knotX[k + 1] - knotX[k])));
    return 0.5 * lin + 0.5 * (knotY[k] + f * (knotY[k + 1] - knotY[k]));
  };
  const NS = 4000;
  const tabLg = new Float64Array(NS);
  const tabS = new Float64Array(NS);
  for (let i = 0; i < NS; i++) {
    tabLg[i] = LOG_T_MIN + ((LOG_T_MAX - LOG_T_MIN) * i) / (NS - 1);
    tabS[i] = sOf(tabLg[i]);
  }
  const lgOfS = (s: number): number => {
    if (s <= 0) return LOG_T_MIN;
    if (s >= S_TOT) return LOG_T_MAX;
    let lo = 0;
    let hi = NS - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tabS[m] <= s) lo = m;
      else hi = m;
    }
    const f = (s - tabS[lo]) / (tabS[hi] - tabS[lo]);
    return tabLg[lo] + f * (tabLg[hi] - tabLg[lo]);
  };
  /** log10 of the temperature in K shown for the wall colour at log time lg. */
  const wallLogT = (lg: number) => Math.log10(mevToKelvin(tempAt(th, 10 ** lg)));

  // ------------------------------------------------------------ helix frame
  const vT = new THREE.Vector3();
  const vN = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const centre = (s: number, out: THREE.Vector3) => out.set(HR * Math.cos(s / HRHO), HR * Math.sin(s / HRHO), -s);
  const frame = (s: number) => {
    const ph = s / HRHO;
    vT.set((-HR / HRHO) * Math.sin(ph), (HR / HRHO) * Math.cos(ph), -1).normalize();
    vN.set(-Math.cos(ph), -Math.sin(ph), 0);
    vB.crossVectors(vT, vN).normalize();
    vN.crossVectors(vB, vT).normalize();
  };
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();

  // ------------------------------------------------------------ tunnel walls
  const tmpC = new THREE.Color();
  const tmpV = new THREE.Vector3();
  {
    const pos = new Float32Array(N_WALL * 3);
    const col = new Float32Array(N_WALL * 3);
    const r = rng(3);
    for (let i = 0; i < N_WALL; i++) {
      const s = -6 + r() * (S_TOT + 12);
      const th0 = r() * TWO_PI;
      const rr = TUBE * (0.92 + 0.16 * r());
      frame(s);
      centre(s, tmpV);
      tmpV.addScaledVector(vN, rr * Math.cos(th0)).addScaledVector(vB, rr * Math.sin(th0));
      pos[i * 3] = tmpV.x;
      pos[i * 3 + 1] = tmpV.y;
      pos[i * 3 + 2] = tmpV.z;
      const lg = lgOfS(s);
      if (lg > Math.log10(INF_START) && lg < Math.log10(INFLATION_END)) tmpC.setRGB(0.42, 0.3, 0.78);
      else rampColor(wallLogT(lg), tmpC);
      const k = 0.55 + 0.45 * r();
      col[i * 3] = tmpC.r * k;
      col[i * 3 + 1] = tmpC.g * k;
      col[i * 3 + 2] = tmpC.b * k;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const walls = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.13, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    walls.frustumCulled = false;
    scene.add(walls);
  }

  // Four spiral stripes along the tube, coloured by temperature.
  {
    const NSEG = 2400;
    for (let k = 0; k < 4; k++) {
      const pos = new Float32Array(NSEG * 3);
      const col = new Float32Array(NSEG * 3);
      for (let i = 0; i < NSEG; i++) {
        const s = -6 + ((S_TOT + 12) * i) / (NSEG - 1);
        frame(s);
        centre(s, tmpV);
        const a = (k * Math.PI) / 2 + s * 0.09;
        tmpV.addScaledVector(vN, TUBE * Math.cos(a)).addScaledVector(vB, TUBE * Math.sin(a));
        pos.set([tmpV.x, tmpV.y, tmpV.z], i * 3);
        const lg = lgOfS(s);
        if (lg > Math.log10(INF_START) && lg < Math.log10(INFLATION_END)) tmpC.setRGB(0.5, 0.35, 0.9);
        else rampColor(wallLogT(lg), tmpC);
        col.set([tmpC.r * 0.7, tmpC.g * 0.7, tmpC.b * 0.7], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }));
      line.frustumCulled = false;
      scene.add(line);
    }
  }

  // Decade rings: one per factor of ten in time, with labels.
  const ringGeo = (() => {
    const n = 64;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = Math.cos((i / n) * TWO_PI);
      p[i * 3 + 1] = Math.sin((i / n) * TWO_PI);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  })();
  const orient = (obj: THREE.Object3D, s: number, radius: number) => {
    frame(s);
    centre(s, obj.position);
    const m = new THREE.Matrix4().makeBasis(vN, vB, vT);
    obj.quaternion.setFromRotationMatrix(m);
    obj.scale.setScalar(radius);
  };
  const decadeLabels: { obj: CSS2DObject; s: number }[] = [];
  for (let k = Math.ceil(LOG_T_MIN); k <= Math.floor(LOG_T_MAX); k++) {
    const s = sOf(k);
    const major = k % 5 === 0;
    rampColor(wallLogT(k), tmpC);
    const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: tmpC.clone(), transparent: true, opacity: major ? 0.95 : 0.5 }));
    orient(ring, s, TUBE * 1.02);
    scene.add(ring);
    frame(s);
    centre(s, tmpV).addScaledVector(vB, TUBE * 1.02);
    const text = k >= 2 ? `10${sup(k)} s · ${formatTime(10 ** k)}` : `10${sup(k)} s`;
    const lab = stage.label(text, tmpV.clone(), 'muted');
    lab.element.style.fontSize = '10.5px';
    decadeLabels.push({ obj: lab, s });
  }

  // ------------------------------------------------------------ stations
  const stationS = EPOCHS.map((e) => sOf(Math.log10(e.t)));
  const visuals: Visual[] = [];
  const stationLabels: CSS2DObject[] = [];
  const linkChips: CSS2DObject[] = [];
  const stationGlows: THREE.Sprite[] = [];

  const glowSprite = (color: number, size: number, opacity = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(size);
    return sp;
  };
  const pointsOf = (n: number, colors: (i: number, c: THREE.Color) => void, size: number) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors(i, tmpC);
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.frustumCulled = false;
    return { p, pos, attr: g.attributes.position as THREE.BufferAttribute };
  };
  const basic = (color: number, opacity = 1, wire = false) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, wireframe: wire, depthWrite: opacity >= 1 });

  function makeVisual(kind: string): Visual {
    const group = new THREE.Group();
    const r = rng(kind.length * 97 + kind.charCodeAt(0));
    switch (kind) {
      case 'foam': {
        const n = 160;
        const base = new Float32Array(n * 3);
        const { p, pos, attr } = pointsOf(n, (_, c) => c.setHSL(0.72 + 0.1 * r(), 0.5, 0.75), 0.09);
        for (let i = 0; i < n * 3; i++) base[i] = (r() * 2 - 1) * 0.5;
        const ph = Float32Array.from({ length: n * 3 }, () => r() * TWO_PI);
        group.add(p);
        return { group, update: (t) => {
          for (let i = 0; i < n * 3; i++) pos[i] = base[i] + 0.12 * Math.sin(t * 9 + ph[i]) * Math.sin(t * 2.3 + ph[i] * 3);
          attr.needsUpdate = true;
        } };
      }
      case 'gut': {
        const cols = [PALETTE.red, PALETTE.green, 0x5b8cff];
        const rings = cols.map((c, i) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.06, 0.022, 8, 48), basic(c));
          group.add(m);
          return m;
        });
        group.add(glowSprite(PALETTE.white, 0.5, 0.5));
        return { group, update: (t) => {
          const merge = 0.5 + 0.5 * Math.cos(t * 0.8);
          rings.forEach((m, i) => {
            m.rotation.set(merge * (i - 1) * 1.1 + t * 0.4, merge * i * 0.7, 0);
          });
        } };
      }
      case 'inflate': {
        const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), basic(PALETTE.violet, 0.6, true));
        group.add(ico);
        return { group, update: (t) => {
          const u = (t * 0.35) % 1;
          ico.scale.setScalar(0.04 * Math.exp(u * 3));
          (ico.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u * u);
          ico.rotation.y = t * 0.3;
        } };
      }
      case 'higgs': {
        const prof: THREE.Vector2[] = [];
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * 0.55;
          prof.push(new THREE.Vector2(x, 2.2 * (x * x - 0.1) ** 2 - 0.02));
        }
        const hat = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), basic(PALETTE.cyan, 0.45, true));
        group.add(hat);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), basic(PALETTE.amber));
        group.add(ball);
        group.rotation.x = 0.5;
        const rMin = Math.sqrt(0.1);
        return { group, update: (t) => {
          ball.position.set(rMin * Math.cos(t * 0.9), 0.03, rMin * Math.sin(t * 0.9));
        } };
      }
      case 'soup': {
        const n = 240;
        const qc = [PALETTE.red, PALETTE.green, 0x5b8cff, 0xffffff];
        const { p, pos, attr } = pointsOf(n, (i, c) => c.set(qc[i % 4]), 0.08);
        const vel = Float32Array.from({ length: n * 3 }, () => (r() * 2 - 1) * 0.5);
        for (let i = 0; i < n * 3; i++) pos[i] = (r() * 2 - 1) * 0.45;
        group.add(p);
        group.add(glowSprite(0xff7050, 1.4, 0.35));
        let last = 0;
        return { group, update: (t) => {
          const dt = Math.min(0.05, Math.max(0, t - last));
          last = t;
          for (let i = 0; i < n; i++) {
            let d2 = 0;
            for (let k = 0; k < 3; k++) {
              const j = i * 3 + k;
              vel[j] += (r() * 2 - 1) * 0.6 * dt * 10;
              vel[j] *= 0.96;
              pos[j] += vel[j] * dt;
              d2 += pos[j] * pos[j];
            }
            if (d2 > 0.3) for (let k = 0; k < 3; k++) vel[i * 3 + k] -= pos[i * 3 + k] * dt * 8;
          }
          attr.needsUpdate = true;
        } };
      }
      case 'hadrons': {
        const nH = 8;
        const qc = [PALETTE.red, PALETTE.green, 0x5b8cff];
        const { p, pos, attr } = pointsOf(nH * 3, (i, c) => c.set(qc[i % 3]), 0.09);
        const centres: THREE.Vector3[] = [];
        for (let h = 0; h < nH; h++) {
          const c = new THREE.Vector3((r() * 2 - 1) * 0.45, (r() * 2 - 1) * 0.35, (r() * 2 - 1) * 0.35);
          centres.push(c);
          const shell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), basic(PALETTE.amber, 0.18));
          shell.position.copy(c);
          group.add(shell);
        }
        group.add(p);
        return { group, update: (t) => {
          for (let h = 0; h < nH; h++) {
            for (let q = 0; q < 3; q++) {
              const a = t * (2 + h * 0.3) + (q * TWO_PI) / 3;
              const j = (h * 3 + q) * 3;
              pos[j] = centres[h].x + 0.055 * Math.cos(a);
              pos[j + 1] = centres[h].y + 0.055 * Math.sin(a);
              pos[j + 2] = centres[h].z + 0.03 * Math.sin(a + h);
            }
          }
          attr.needsUpdate = true;
        } };
      }
      case 'streaks': {
        const n = 36;
        const dirs = Array.from({ length: n }, () => new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize());
        const ph = Float32Array.from({ length: n }, () => r());
        const pos = new Float32Array(n * 6);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.8 }));
        lines.frustumCulled = false;
        group.add(lines);
        group.add(glowSprite(PALETTE.green, 0.5, 0.5));
        return { group, update: (t) => {
          for (let i = 0; i < n; i++) {
            const u = (t * 0.45 + ph[i]) % 1;
            const r1 = 0.1 + 0.6 * u;
            const r0 = r1 - 0.18;
            const d = dirs[i];
            pos[i * 6] = d.x * r0;
            pos[i * 6 + 1] = d.y * r0;
            pos[i * 6 + 2] = d.z * r0;
            pos[i * 6 + 3] = d.x * r1;
            pos[i * 6 + 4] = d.y * r1;
            pos[i * 6 + 5] = d.z * r1;
          }
          (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        } };
      }
      case 'pairs': {
        const nP = 6;
        const { p, pos, attr } = pointsOf(nP * 2, (i, c) => c.set(i % 2 ? PALETTE.rose : PALETTE.cyan), 0.12);
        const cen = Array.from({ length: nP }, () => new THREE.Vector3((r() * 2 - 1) * 0.4, (r() * 2 - 1) * 0.3, (r() * 2 - 1) * 0.3));
        const dir = Array.from({ length: nP }, () => new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize());
        const ph = Float32Array.from({ length: nP }, () => r());
        const flashes = cen.map((c) => {
          const s = glowSprite(0xffffff, 0.3, 0);
          s.position.copy(c);
          group.add(s);
          return s;
        });
        group.add(p);
        return { group, update: (t) => {
          for (let k = 0; k < nP; k++) {
            const u = (t * 0.5 + ph[k]) % 1;
            const d = u < 0.8 ? 0.25 * (1 - u / 0.8) : 0;
            const vis = u < 0.8 ? 1 : 0;
            for (let q = 0; q < 2; q++) {
              const sg = q ? -1 : 1;
              const j = (k * 2 + q) * 3;
              pos[j] = vis ? cen[k].x + sg * d * dir[k].x : 1e3;
              pos[j + 1] = cen[k].y + sg * d * dir[k].y;
              pos[j + 2] = cen[k].z + sg * d * dir[k].z;
            }
            const f = u >= 0.8 ? 1 - (u - 0.8) / 0.2 : 0;
            (flashes[k].material as THREE.SpriteMaterial).opacity = f;
            flashes[k].scale.setScalar(0.15 + 0.4 * (1 - f));
          }
          attr.needsUpdate = true;
        } };
      }
      case 'nuclei': {
        // Helium-4 nuclei (2 protons, 2 neutrons) assemble, with a deuteron and free protons.
        const nN = 4;
        const nucleons = nN * 4 + 2 + 3;
        const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222 }), nucleons);
        const home: THREE.Vector3[] = [];
        const start: THREE.Vector3[] = [];
        const cP = new THREE.Color(PALETTE.red);
        const cN = new THREE.Color(0x9fb4d8);
        const off = [[0.035, 0.035, 0.035], [-0.035, -0.035, 0.035], [-0.035, 0.035, -0.035], [0.035, -0.035, -0.035]];
        let idx = 0;
        for (let k = 0; k < nN; k++) {
          const c = new THREE.Vector3((r() * 2 - 1) * 0.4, (r() * 2 - 1) * 0.3, (r() * 2 - 1) * 0.3);
          for (let q = 0; q < 4; q++) {
            home.push(c.clone().add(new THREE.Vector3(...(off[q] as [number, number, number]))));
            inst.setColorAt(idx++, q < 2 ? cP : cN);
          }
        }
        const dc = new THREE.Vector3(0.1, -0.3, 0.2);
        home.push(dc.clone().add(new THREE.Vector3(0.04, 0, 0)), dc.clone().add(new THREE.Vector3(-0.04, 0, 0)));
        inst.setColorAt(idx++, cP);
        inst.setColorAt(idx++, cN);
        for (let k = 0; k < 3; k++) {
          home.push(new THREE.Vector3((r() * 2 - 1) * 0.5, (r() * 2 - 1) * 0.4, (r() * 2 - 1) * 0.3));
          inst.setColorAt(idx++, cP);
        }
        for (let i = 0; i < nucleons; i++) start.push(new THREE.Vector3((r() * 2 - 1) * 0.55, (r() * 2 - 1) * 0.45, (r() * 2 - 1) * 0.4));
        group.add(inst);
        group.add(glowSprite(PALETTE.amber, 1.2, 0.3));
        const m4 = new THREE.Matrix4();
        const v = new THREE.Vector3();
        return { group, update: (t) => {
          const u = (t * 0.25) % 1;
          const f = Math.min(1, Math.max(0, (u - 0.1) / 0.5));
          const e = f * f * (3 - 2 * f);
          for (let i = 0; i < nucleons; i++) {
            v.lerpVectors(start[i], home[i], i >= nucleons - 3 ? 0.2 * e : e);
            m4.makeTranslation(v.x, v.y, v.z);
            inst.setMatrixAt(i, m4);
          }
          inst.instanceMatrix.needsUpdate = true;
        } };
      }
      case 'balance': {
        const bar = new THREE.Group();
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.04), basic(0x8391ab));
        bar.add(beam);
        const rad = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), basic(PALETTE.amber));
        rad.position.x = -0.42;
        const mat = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), basic(PALETTE.violet));
        mat.position.x = 0.42;
        bar.add(rad, mat);
        const piv = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), basic(0x56627c));
        piv.position.y = -0.09;
        group.add(bar, piv);
        return { group, update: (t) => {
          const u = Math.sin(t * 0.7);
          bar.rotation.z = 0.35 * u;
          rad.scale.setScalar(1 - 0.25 * u);
          mat.scale.setScalar(1 + 0.25 * u);
        } };
      }
      case 'cmb': {
        const sph = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24), new THREE.MeshBasicMaterial({ map: cmbTex, transparent: true, opacity: 0.9 }));
        group.add(sph);
        const flash = glowSprite(0xffc58a, 1.6, 0.6);
        group.add(flash);
        return { group, update: (t) => {
          sph.rotation.y = t * 0.25;
          const u = (t * 0.3) % 1;
          flash.scale.setScalar(0.8 + 2.6 * u);
          (flash.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - u);
        } };
      }
      case 'web': {
        const nodes = Array.from({ length: 16 }, () => new THREE.Vector3((r() * 2 - 1) * 0.55, (r() * 2 - 1) * 0.4, (r() * 2 - 1) * 0.4));
        const segs: number[] = [];
        nodes.forEach((a, i) => {
          const near = nodes.map((b, j) => ({ j, d: a.distanceTo(b) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, 2);
          for (const { j } of near) segs.push(a.x, a.y, a.z, nodes[j].x, nodes[j].y, nodes[j].z);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
        group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7a6bd0, transparent: true, opacity: 0.55 })));
        const { p, pos, attr } = pointsOf(nodes.length, (_, c) => c.set(0x9a8cf0), 0.12);
        nodes.forEach((n, i) => pos.set([n.x, n.y, n.z], i * 3));
        attr.needsUpdate = true;
        group.add(p);
        return { group, update: (t) => { group.rotation.y = t * 0.15; } };
      }
      case 'star': {
        const n = 140;
        const { p, pos, attr } = pointsOf(n, (_, c) => c.setRGB(0.5, 0.55, 0.8), 0.06);
        const dirs = Array.from({ length: n }, () => new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(0.25 + 0.35 * r()));
        group.add(p);
        const core = glowSprite(0xcfe0ff, 0.2, 1);
        group.add(core);
        return { group, update: (t) => {
          const u = (t * 0.22) % 1;
          const col = Math.min(1, u / 0.6);
          for (let i = 0; i < n; i++) {
            const k = 1 - 0.85 * col;
            pos[i * 3] = dirs[i].x * k;
            pos[i * 3 + 1] = dirs[i].y * k;
            pos[i * 3 + 2] = dirs[i].z * k;
          }
          attr.needsUpdate = true;
          const ign = u > 0.6 ? Math.min(1, (u - 0.6) / 0.1) : 0;
          core.scale.setScalar(0.15 + 1.5 * ign * (1 + 0.08 * Math.sin(t * 20)));
        } };
      }
      case 'bubbles': {
        const n = 6;
        const cen = Array.from({ length: n }, () => new THREE.Vector3((r() * 2 - 1) * 0.35, (r() * 2 - 1) * 0.25, (r() * 2 - 1) * 0.25));
        const ph = Float32Array.from({ length: n }, () => r() * 0.5);
        const bub = cen.map((c) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), basic(PALETTE.cyan, 0.18));
          m.position.copy(c);
          group.add(m);
          const src = glowSprite(0xe8f4ff, 0.14, 0.9);
          src.position.copy(c);
          group.add(src);
          return m;
        });
        return { group, update: (t) => {
          const u = (t * 0.2) % 1;
          for (let i = 0; i < n; i++) bub[i].scale.setScalar(0.02 + 0.3 * Math.max(0, u - ph[i]) / (1 - ph[i]));
        } };
      }
      case 'galaxy':
      case 'today': {
        const n = kind === 'galaxy' ? 700 : 420;
        const { p, pos, attr } = pointsOf(n, (i, c) => (i % 5 === 0 ? c.setRGB(0.55, 0.7, 1) : c.setRGB(1, 0.85, 0.6)), kind === 'galaxy' ? 0.05 : 0.045);
        for (let i = 0; i < n; i++) {
          const arm = i % 2;
          const rr = 0.04 + 0.5 * Math.pow(r(), 0.8);
          const a = arm * Math.PI + rr * 7 + (r() - 0.5) * 0.7;
          pos[i * 3] = rr * Math.cos(a);
          pos[i * 3 + 1] = (r() - 0.5) * 0.04;
          pos[i * 3 + 2] = rr * Math.sin(a);
        }
        attr.needsUpdate = true;
        const disc = new THREE.Group();
        disc.add(p);
        disc.add(glowSprite(0xffe2b0, 0.35, 0.8));
        disc.rotation.x = 0.9;
        group.add(disc);
        if (kind === 'today') {
          const you = glowSprite(PALETTE.cyan, 0.12, 1);
          you.position.set(0.3, 0, 0);
          p.add(you);
        }
        return { group, update: (t) => { p.rotation.y = -t * 0.12; } };
      }
      case 'spread': {
        const n = 27;
        const { p, pos, attr } = pointsOf(n, (_, c) => c.set(PALETTE.green), 0.1);
        group.add(p);
        return { group, update: (t) => {
          const u = (t * 0.3) % 1;
          const sc = 0.08 * Math.exp(2.2 * u * u);
          let i = 0;
          for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
            pos[i * 3] = x * sc;
            pos[i * 3 + 1] = y * sc;
            pos[i * 3 + 2] = z * sc;
            i++;
          }
          attr.needsUpdate = true;
        } };
      }
      case 'sun': {
        const sun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), basic(0xffd27a));
        group.add(sun, glowSprite(0xffb54a, 0.9, 0.7));
        const earth = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), basic(0x4f9be8));
        group.add(earth);
        const orbit = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0x56627c, transparent: true, opacity: 0.6 }));
        orbit.scale.setScalar(0.48);
        orbit.rotation.x = Math.PI / 2;
        group.add(orbit);
        group.rotation.x = 0.35;
        return { group, update: (t) => { earth.position.set(0.48 * Math.cos(t * 0.8), 0, 0.48 * Math.sin(t * 0.8)); } };
      }
      case 'fade':
      default: {
        const n = 40;
        const { p, pos, attr } = pointsOf(n, (_, c) => c.setRGB(0.8, 0.3, 0.25), 0.1);
        const dirs = Array.from({ length: n }, () => new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize());
        group.add(p);
        const mat = p.material as THREE.PointsMaterial;
        return { group, update: (t) => {
          const u = (t * 0.15) % 1;
          const sc = 0.1 + 0.6 * u * u;
          for (let i = 0; i < n; i++) pos.set([dirs[i].x * sc, dirs[i].y * sc, dirs[i].z * sc], i * 3);
          attr.needsUpdate = true;
          mat.opacity = 1 - u;
        } };
      }
    }
  }

  const GATE_GEO = new THREE.TorusGeometry(1, 0.012, 6, 96);
  EPOCHS.forEach((e, i) => {
    const s = stationS[i];
    frame(s);
    centre(s, tmpV);
    side.crossVectors(vT, up).normalize();
    const sign = i % 2 ? -1 : 1;
    const vis = makeVisual(e.visual);
    vis.group.position.copy(tmpV).addScaledVector(side, sign * 0.9).addScaledVector(up, -0.1);
    scene.add(vis.group);
    visuals.push(vis);
    const glow = glowSprite(CONF_COLOR[e.confidence], 2.0, 0.22);
    glow.position.copy(vis.group.position);
    scene.add(glow);
    stationGlows.push(glow);
    const gate = new THREE.Mesh(GATE_GEO, new THREE.MeshBasicMaterial({ color: CONF_COLOR[e.confidence], transparent: true, opacity: 0.85 }));
    orient(gate, s, TUBE * 0.99);
    scene.add(gate);
    const lab = stage.label(e.name, vis.group.position.clone().add(new THREE.Vector3(0, 0.72, 0)), 'big');
    lab.element.style.color = css(CONF_COLOR[e.confidence]);
    stationLabels.push(lab);
    const chip = stage.label(`↗ ${e.linkTitle}`, vis.group.position.clone().add(new THREE.Vector3(0, -0.7, 0)));
    Object.assign(chip.element.style, { pointerEvents: 'auto', cursor: 'pointer', border: `1px solid ${css(CONF_COLOR[e.confidence])}`, fontSize: '11px' } as CSSStyleDeclaration);
    chip.element.title = `Open ${e.linkTitle}`;
    chip.element.addEventListener('click', () => openLink(e));
    linkChips.push(chip);
  });

  // ------------------------------------------------------------ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: Confidence) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(CONF_COLOR[c])};margin-right:5px"></span>${CONF_LABEL[c]}`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Time tunnel</div>
<div>Each ring is a factor of 10 in time.</div>
<div style="margin-top:4px">Walls: temperature</div>
<div style="height:6px;border-radius:3px;margin:3px 0 2px;background:${RAMP_CSS}"></div>
<div style="display:flex;justify-content:space-between;color:#8391ab"><span>10³² K</span><span>10¹²</span><span>3000</span><span>1 K</span></div>
<div style="margin-top:4px">Sky: blackbody colour of the light</div>
<div style="margin-top:4px">Gates: how we know</div>
<div>${sw('observed')}</div><div>${sw('tested')}</div><div>${sw('theory')}</div><div>${sw('speculative')}</div>`;
  viewport.appendChild(legend);

  // Inset plot: log T against log t, model and headline law.
  const PW = 560;
  const PH = 340;
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
  const X0 = 58;
  const X1 = PW - 14;
  const Y0 = 50;
  const Y1 = PH - 40;
  const TMAXL = 33;
  const TMINL = -2;
  const px = (lg: number) => X0 + ((lg - LOG_T_MIN) / (LOG_T_MAX - LOG_T_MIN)) * (X1 - X0);
  const py = (lT: number) => Y0 + ((TMAXL - lT) / (TMAXL - TMINL)) * (Y1 - Y0);
  {
    const g = bgPlot.getContext('2d')!;
    g.font = '20px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText('temperature vs time (log–log)', 14, 30);
    g.fillStyle = 'rgba(167,139,250,0.16)';
    g.fillRect(px(-36), Y0, px(-32) - px(-36), Y1 - Y0);
    g.fillStyle = 'rgba(167,139,250,0.08)';
    g.fillRect(X0, Y0, px(-36) - X0, Y1 - Y0);
    g.strokeStyle = '#243049';
    g.lineWidth = 1;
    g.fillStyle = '#56627c';
    g.font = '17px JetBrains Mono, monospace';
    for (const lT of [30, 20, 10, 0]) {
      g.beginPath();
      g.moveTo(X0, py(lT));
      g.lineTo(X1, py(lT));
      g.stroke();
      g.fillText(`10${sup(lT)}K`, 4, py(lT) + 6);
    }
    for (const lg of [-40, -20, 0]) {
      g.beginPath();
      g.moveTo(px(lg), Y0);
      g.lineTo(px(lg), Y1);
      g.stroke();
      g.fillText(`10${sup(lg)}s`, px(lg) - 22, Y1 + 24);
    }
    // Headline law (dashed amber) with g*(T) from the model.
    g.setLineDash([8, 6]);
    g.strokeStyle = css(PALETTE.amber);
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 300; i++) {
      const lg = LOG_T_MIN + ((LOG_T_MAX - LOG_T_MIN) * i) / 300;
      const T = tempAt(th, 10 ** lg);
      const lT = Math.log10(mevToKelvin(radiationT(10 ** lg, gStar(T))));
      if (i === 0) g.moveTo(px(lg), py(lT));
      else g.lineTo(px(lg), py(Math.max(TMINL - 1, lT)));
    }
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = css(PALETTE.cyan);
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 400; i++) {
      const lg = LOG_T_MIN + ((LOG_T_MAX - LOG_T_MIN) * i) / 400;
      const lT = Math.log10(mevToKelvin(tempAt(th, 10 ** lg)));
      if (i === 0) g.moveTo(px(lg), py(lT));
      else g.lineTo(px(lg), py(Math.max(TMINL, lT)));
    }
    g.stroke();
    EPOCHS.forEach((e) => {
      g.fillStyle = css(CONF_COLOR[e.confidence]);
      g.beginPath();
      g.arc(px(Math.log10(e.t)), Y1 - 6, 4, 0, TWO_PI);
      g.fill();
    });
    g.font = '17px JetBrains Mono, monospace';
    g.fillStyle = css(PALETTE.cyan);
    g.fillText('ΛCDM model', X1 - 250, Y0 + 20);
    g.fillStyle = css(PALETTE.amber);
    g.fillText('1.5 MeV g*^-¼ t^-½', X1 - 250, Y0 + 42);
    g.fillStyle = '#a78bfa';
    g.fillText('inflation?', px(-36) - 4, Y1 - 18);
  }

  // Epoch card.
  const card = document.createElement('div');
  Object.assign(card.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '3', width: '290px', maxWidth: 'calc(100% - 20px)',
    background: 'rgba(7,10,18,0.86)', borderRadius: '12px', border: '1px solid #243049', padding: '10px 12px',
    font: '12px/1.45 Inter, system-ui, sans-serif', color: '#c9d3e6', transition: 'opacity 0.35s', opacity: '0', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(card);

  // ------------------------------------------------------------ state
  let lgTarget = LOG_T_MIN + 0.4;
  let lg = lgTarget;
  let playing = false;
  let touched = false;
  let showLinks = true;
  let linkOpened = false;
  let cardEpoch = -1;
  let nearest = 0;
  let linkTimer = 0;
  let lastPlotLg = NaN;

  function openLink(e: Epoch): void {
    if (!showLinks) return;
    linkOpened = true;
    touched = true;
    const btn = card.querySelector<HTMLElement>('[data-open]');
    if (btn) btn.textContent = 'Opening…';
    clearTimeout(linkTimer);
    // Short delay so the challenge check sees the click before the page changes.
    linkTimer = window.setTimeout(() => {
      location.hash = e.link;
    }, 500);
  }

  function fillCard(i: number): void {
    const e = EPOCHS[i];
    const col = css(CONF_COLOR[e.confidence]);
    const temp = e.TK !== null ? formatKelvin(e.TK) : NULL_TEMP[e.id] ?? 'not defined';
    const z = e.z !== null ? (e.z >= 1e4 ? sci(e.z) : e.z.toLocaleString('en-US')) : 'not a useful label here';
    card.style.borderColor = col;
    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
<div style="font:600 14px Space Grotesk, Inter, sans-serif;color:#eef2fa">${e.name}</div>
<div style="font:600 10px JetBrains Mono, monospace;color:${col};text-transform:uppercase;white-space:nowrap">${CONF_LABEL[e.confidence]}</div></div>
<div style="font:11px/1.5 JetBrains Mono, monospace;color:#9aa6bd;margin:4px 0 6px">
<div>time&nbsp;&nbsp;${e.when}</div><div>temp&nbsp;&nbsp;${temp}</div><div>energy ${e.energy}</div><div>z&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${z}</div></div>
<div style="color:#dfe6f3">${e.line}</div>
<div style="margin-top:5px;color:#8391ab"><b style="color:#b8c3d9">How we know:</b> ${e.how}</div>
${showLinks ? `<button type="button" data-open style="margin-top:8px;cursor:pointer;font:600 12px Inter, sans-serif;color:#07101a;background:${col};border:0;border-radius:8px;padding:5px 10px">Open topic: ${e.linkTitle} →</button>` : ''}`;
    card.querySelector('[data-open]')?.addEventListener('click', () => openLink(e));
  }

  // ------------------------------------------------------------ controls
  const ui = new Panel(panel);
  ui.section('Fly through time');
  const [playBtn] = ui.buttons([
    { label: 'Play fly-through', primary: true, key: 'play', onClick: () => setPlaying(!playing) },
    { label: 'Next station', onClick: () => jumpTo(Math.min(N_EP - 1, nextStation())) },
    { label: 'Restart', onClick: () => { setPlaying(false); lgTarget = LOG_T_MIN + 0.4; lg = lgTarget; timeCtl.set(lgTarget, false); } },
  ]);
  const timeCtl = ui.slider({
    key: 'time', label: 'Time (log scale)', min: LOG_T_MIN, max: LOG_T_MAX, step: 0.005, value: lgTarget,
    format: (v) => formatTime(10 ** v),
    onInput: (v) => { lgTarget = v; touched = true; setPlaying(false); },
  });
  const selHost = ui.note('');
  selHost.dataset.param = 'epoch';
  selHost.innerHTML = '<label style="display:block;font-size:13.5px;font-weight:500;margin-bottom:4px">Jump to epoch</label>';
  const sel = document.createElement('select');
  Object.assign(sel.style, {
    width: '100%', padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--text)', font: '13px Inter, system-ui, sans-serif',
  } as CSSStyleDeclaration);
  sel.setAttribute('aria-label', 'Jump to epoch');
  EPOCHS.forEach((e, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${e.name} (${formatTime(e.t)})`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => jumpTo(Number(sel.value)));
  selHost.appendChild(sel);
  ui.toggle({
    key: 'links', label: 'Show links to atlas topics', value: showLinks,
    onChange: (v) => {
      showLinks = v;
      linkChips.forEach((c) => (c.visible = v));
      if (cardEpoch >= 0) fillCard(cardEpoch);
    },
  });
  ui.note('Scroll over the scene, or drag up and down, to move through time.');

  ui.section('Live readouts');
  const rTime = ui.readout('tRead', 'time t');
  const rTemp = ui.readout('temp', 'temperature T');
  const rE = ui.readout('energy', 'energy kT');
  const rZ = ui.readout('z', 'redshift z');
  const rA = ui.readout('a', 'scale factor a');
  const rG = ui.readout('gstar', 'species g*');
  const rEp = ui.readout('epochR', 'epoch');
  const rRatio = ui.readout('ratio', 'formula / model T');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'ΛCDM model T(t)' },
    { color: css(PALETTE.amber), label: 'headline law' },
  ]);

  function setPlaying(v: boolean): void {
    playing = v;
    playBtn.textContent = v ? 'Pause' : 'Play fly-through';
    if (v) {
      touched = true;
      if (lgTarget >= LOG_T_MAX - 0.01) lgTarget = LOG_T_MIN + 0.4;
    }
  }
  function nextStation(): number {
    const sNow = sOf(lg);
    for (let i = 0; i < N_EP; i++) if (stationS[i] > sNow + 0.5) return i;
    return N_EP - 1;
  }
  function jumpTo(i: number): void {
    setPlaying(false);
    touched = true;
    lgTarget = Math.log10(EPOCHS[i].t);
    timeCtl.set(lgTarget, false);
  }

  // Scroll and drag move through time.
  const onWheel = (ev: WheelEvent) => {
    const s = sOf(lgTarget);
    if ((s <= 0 && ev.deltaY < 0) || (s >= S_TOT && ev.deltaY > 0)) return; // let the page scroll at the ends
    ev.preventDefault();
    const d = ev.deltaMode === 1 ? ev.deltaY * 30 : ev.deltaY;
    lgTarget = lgOfS(Math.max(0, Math.min(S_TOT, s + d * 0.02)));
    touched = true;
    setPlaying(false);
    timeCtl.set(lgTarget, false);
  };
  let dragY: number | null = null;
  const onDown = (ev: PointerEvent) => { dragY = ev.clientY; };
  const onMove = (ev: PointerEvent) => {
    if (dragY === null) return;
    const dy = ev.clientY - dragY;
    dragY = ev.clientY;
    lgTarget = lgOfS(Math.max(0, Math.min(S_TOT, sOf(lgTarget) - dy * 0.06)));
    touched = true;
    setPlaying(false);
    timeCtl.set(lgTarget, false);
  };
  const onUp = () => { dragY = null; };
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // ------------------------------------------------------------ frame loop
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  const rgb: [number, number, number] = [0, 0, 0];
  const baseS = [0x07 / 255, 0x0a / 255, 0x12 / 255];
  let T_MeV = tempAt(th, 10 ** lg);

  function drawPlot(): void {
    if (lg === lastPlotLg) return;
    lastPlotLg = lg;
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    const x = px(lg);
    const y = py(Math.max(TMINL, Math.log10(mevToKelvin(T_MeV))));
    pctx.strokeStyle = 'rgba(255,255,255,0.35)';
    pctx.lineWidth = 1.5;
    pctx.beginPath();
    pctx.moveTo(x, Y0);
    pctx.lineTo(x, Y1);
    pctx.stroke();
    pctx.fillStyle = '#ffffff';
    pctx.beginPath();
    pctx.arc(x, y, 7, 0, TWO_PI);
    pctx.fill();
  }

  stage.onFrame((dt, time) => {
    if (playing) {
      const sNow = sOf(lgTarget);
      let dmin = Infinity;
      for (const ss of stationS) dmin = Math.min(dmin, Math.abs(ss - sNow));
      const speed = 5.5 * (0.3 + 0.7 * Math.min(1, dmin / 3));
      const sNext = sNow + speed * dt;
      if (sNext >= S_TOT) {
        lgTarget = LOG_T_MAX;
        setPlaying(false);
      } else lgTarget = lgOfS(sNext);
      timeCtl.set(lgTarget, false);
    }
    // Ease toward the target so jumps glide.
    const k = Math.min(1, dt * 5);
    lg += (lgTarget - lg) * (Math.abs(lgTarget - lg) < 1e-4 ? 1 : k);
    const tSec = 10 ** lg;
    const s = sOf(lg);

    centre(s - CAM_BACK, camPos);
    camPos.y += 0.35;
    centre(s + CAM_AHEAD, camTgt);
    camera.position.copy(camPos);
    controls.target.copy(camTgt);

    // Sky colour: blackbody colour of the photons, dimmed. Inflation is supercooled.
    T_MeV = tempAt(th, tSec);
    const TK = mevToKelvin(T_MeV);
    if (tSec > INF_START && tSec < INFLATION_END) {
      bg.setRGB(0.14, 0.08, 0.24, THREE.SRGBColorSpace);
    } else {
      blackbodyRGB(TK, rgb);
      const l = Math.log10(TK);
      const x = Math.max(0, Math.min(1, (l - 2.9) / 1.3));
      const kk = 0.03 + 0.2 * x * x * (3 - 2 * x);
      bg.setRGB(Math.max(baseS[0], rgb[0] * kk), Math.max(baseS[1], rgb[1] * kk), Math.max(baseS[2], rgb[2] * kk), THREE.SRGBColorSpace);
    }
    fog.color.copy(bg);

    // Nearest station, card, labels, animations.
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < N_EP; i++) {
      const d = Math.abs(stationS[i] - s);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    nearest = best;
    const show = bd < 4.5;
    if (show && cardEpoch !== best) {
      cardEpoch = best;
      fillCard(best);
    }
    card.style.opacity = show ? '1' : '0';
    card.style.pointerEvents = show ? 'auto' : 'none';
    if (sel.value !== String(best)) sel.value = String(best);

    for (let i = 0; i < N_EP; i++) {
      const ahead = stationS[i] - s;
      const near = ahead > -CAM_BACK + 0.6 && ahead < 26;
      visuals[i].group.visible = near;
      stationGlows[i].visible = near;
      stationLabels[i].visible = near && ahead < 10;
      linkChips[i].visible = showLinks && near && ahead < 7;
      if (near) visuals[i].update?.(time);
    }
    for (const d of decadeLabels) {
      const ahead = d.s - s;
      d.obj.visible = ahead > 0.5 && ahead < 11;
    }

    // Readouts.
    const a = scaleAt(th, tSec);
    const z = redshiftAt(th, tSec);
    const pre = tSec < INFLATION_END;
    rTime(formatTime(tSec));
    rTemp(`${formatKelvin(TK)}${pre ? ' (naive)' : ''}`);
    rE(formatEnergy(T_MeV));
    rZ(z >= 0 ? (z >= 1e4 ? sci(z) : z.toFixed(z < 10 ? 2 : 0)) : `${z.toFixed(2)} (future)`);
    rA(a >= 1e-3 ? a.toPrecision(3) : sci(a));
    rG(gStar(T_MeV).toFixed(2));
    rEp(EPOCHS[best].name);
    rRatio((radiationT(tSec, gStar(T_MeV)) / T_MeV).toFixed(3));
    drawPlot();
  });

  timeCtl.set(lgTarget, false);

  return {
    state: () => ({
      logt: lg,
      t_s: 10 ** lg,
      t_Gyr: 10 ** lg / GYR_S,
      T_MeV,
      T_K: mevToKelvin(T_MeV),
      z: redshiftAt(th, 10 ** lg),
      a: scaleAt(th, 10 ** lg),
      epoch: EPOCHS[nearest].id,
      epochIndex: nearest,
      linkOpened,
      touched,
      playing,
      showLinks,
    }),
    dispose: () => {
      clearTimeout(linkTimer);
      if (hint) hint.textContent = hintText;
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      card.remove();
      legend.remove();
      plot.remove();
      glowTex.dispose();
      cmbTex.dispose();
      ringGeo.dispose();
      GATE_GEO.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cosmic-timeline',
  number: 88,
  title: 'A Timeline of Everything',
  domain: 'cosmology',
  level: 1,
  status: 'live',
  tagline: 'From the first instant to today, with links along the way.',
  content,
  mount,
};

export default topic;
