import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  blackbodyRGB,
  buildTrack,
  L_SUN,
  luminositySI,
  makePoint,
  makeTrack,
  msLuminosity,
  msRadius,
  phaseName,
  R_SUN,
  radiusFrom,
  REF_MASSES,
  teff,
  trackAt,
  U_END,
  U_REMNANT,
  M_CH,
  type Track,
} from './physics.ts';

// --- Layout (world units)
const T_HOT = 5.3; // log T at the left edge
const T_COOL = 3.35; // log T at the right edge
const L_LO = -3.2;
const L_HI = 6.6;
const HX0 = -7.4;
const HW = 6.3;
const HY0 = -3.7;
const HH = 5.9;
const hrX = (lt: number) => HX0 + ((T_HOT - lt) / (T_HOT - T_COOL)) * HW;
const hrY = (ll: number) => HY0 + ((ll - L_LO) / (L_HI - L_LO)) * HH;
const STAR = new THREE.Vector3(1.25, -1.85, 0);
const CAM: [number, number, number] = [-1.6, 0.6, 12.4];
const PHI_C = 1.34; // direction of the cutaway notch (toward the camera)
const PHI_START = PHI_C - 1.75 * Math.PI;
const NS = 280; // samples along the 3D track
const PLAY_SECONDS = 30;
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const LOG_MMIN = Math.log10(0.5);
const LOG_MMAX = Math.log10(40);

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Display radius of the star from R (R_sun), log scale. */
const rOf = (R: number) => 0.13 + ((clamp(Math.log10(R), -2.1, 3.3) + 2.1) / 5.4) * 1.42;

const SUP = '⁻⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace(/[-0-9]/g, (ch) => SUP['-0123456789'.indexOf(ch)]);
function fmtSci(x: number): string {
  if (!Number.isFinite(x) || x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 0.01 && ax < 1000) return x.toPrecision(3);
  if (ax >= 1000 && ax < 1e4) return String(Math.round(x));
  let e = Math.floor(Math.log10(ax));
  let m = x / 10 ** e;
  if (Number(m.toFixed(2)) >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m.toFixed(2)}×10${sup(e)}`;
}
function fmtAge(gyr: number): string {
  if (gyr >= 1) return `${gyr.toFixed(gyr >= 100 ? 0 : 2)} Gyr`;
  if (gyr >= 1e-3) return `${(gyr * 1e3).toFixed(gyr >= 0.1 ? 0 : 1)} Myr`;
  if (gyr >= 1e-6) return `${(gyr * 1e6).toFixed(0)} kyr`;
  return `${(gyr * 1e9).toFixed(0)} yr`;
}
const fmtM = (m: number) => (m < 10 ? m.toFixed(2) : m.toFixed(1));

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = `varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`;

/** Star surface: blackbody colour with limb darkening and faint granulation. */
function surfaceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ float mu = abs(dot(normalize(vN), normalize(vV)));
float limb = 0.5 + 0.6 * pow(mu, 0.5);
float g = 0.92 + 0.08 * sin(vP.x * 23.0 + uTime) * sin(vP.y * 19.0 - uTime * 0.7) * sin(vP.z * 21.0 + uTime * 0.4);
gl_FragColor = vec4(uColor * limb * g, 1.0); }`,
  });
}

/** Additive rim-lit shell for the nebula and supernova debris. */
function shellMaterial(color: number, power: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uPower: { value: power }, uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uPower; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ float r = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
float n = 0.7 + 0.3 * sin(vP.x * 9.0 + uTime * 0.3) * sin(vP.y * 7.0) * sin(vP.z * 11.0 - uTime * 0.2);
gl_FragColor = vec4(uColor * (0.035 + r) * n * uOpacity, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// --- Interior layers
interface Species { name: string; color: number; burning: boolean }
const SP: Species[] = [
  { name: 'H envelope', color: 0, burning: false }, // colour follows the star
  { name: 'H burning', color: PALETTE.amber, burning: true },
  { name: 'He ash', color: 0xb85a8a, burning: false },
  { name: 'He burning', color: PALETTE.rose, burning: true },
  { name: 'C, O', color: PALETTE.violet, burning: false },
  { name: 'Ne', color: PALETTE.cyan, burning: true },
  { name: 'O', color: 0x6c8cff, burning: true },
  { name: 'Si', color: PALETTE.green, burning: true },
  { name: 'Fe core', color: 0x9aa4b5, burning: false },
  { name: 'C, O', color: PALETTE.violet, burning: false },
  { name: 'H burning', color: PALETTE.amber, burning: true },
  { name: 'He burning', color: PALETTE.rose, burning: true },
  { name: 'C burning', color: PALETTE.violet, burning: true },
];
const MAX_LAYERS = 8;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: [-1.6, -0.35, 0], fov: 45, lights: false });
  const { scene } = stage;
  const glowTex = glowTexture();

  // --- State
  let M = 5;
  let u = 0;
  let playing = true;
  let cutaway = true;
  let touched = false;
  const track: Track = makeTrack();
  buildTrack(M, track);
  const pt = makePoint();
  const fmtPt = makePoint();
  let T = 0;
  let L = 0;
  let R = 0;
  let rDisp = 0.5;
  const rgb: [number, number, number] = [1, 1, 1];
  const starCol = new THREE.Color();
  const tmpC = new THREE.Color();

  // --- Background stars
  {
    const N = 500;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const uu = rnd() * 2 - 1;
      const ph = rnd() * Math.PI * 2;
      const q = Math.sqrt(1 - uu * uu);
      const r = 60 + rnd() * 20;
      pos[i * 3] = r * q * Math.cos(ph);
      pos[i * 3 + 1] = r * uu;
      pos[i * 3 + 2] = r * q * Math.sin(ph) - 20;
      const b = 0.15 + rnd() * 0.35;
      col[i * 3] = b * 0.85;
      col[i * 3 + 1] = b * 0.9;
      col[i * 3 + 2] = b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false })));
  }

  // --- HR diagram furniture
  const hr = new THREE.Group();
  scene.add(hr);
  {
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(HW + 0.4, HH + 0.4),
      new THREE.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    back.position.set(HX0 + HW / 2, HY0 + HH / 2, -0.25);
    hr.add(back);
    const seg: number[] = [];
    const major: number[] = [];
    const tTicks = [40000, 20000, 10000, 5000, 3000];
    for (const t of tTicks) {
      const x = hrX(Math.log10(t));
      major.push(x, HY0, 0, x, HY0 + HH, 0);
      stage.label(t >= 10000 ? `${t / 1000}k` : `${t}`, [x, HY0 - 0.28, 0], 'muted');
    }
    for (const t of [30000, 15000, 7000, 4000]) {
      const x = hrX(Math.log10(t));
      seg.push(x, HY0, 0, x, HY0 + HH, 0);
    }
    for (let ll = -2; ll <= 6; ll++) {
      const y = hrY(ll);
      (ll % 2 === 0 ? major : seg).push(HX0, y, 0, HX0 + HW, y, 0);
      if (ll % 2 === 0) stage.label(ll === 0 ? '1' : `10${sup(ll)}`, [HX0 - 0.32, y, 0], 'muted');
    }
    const mk = (arr: number[], color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    };
    hr.add(mk(seg, PALETTE.grid, 0.8), mk(major, PALETTE.gridMajor, 0.9));
    // Frame
    hr.add(mk([HX0, HY0, 0, HX0 + HW, HY0, 0, HX0 + HW, HY0, 0, HX0 + HW, HY0 + HH, 0, HX0 + HW, HY0 + HH, 0, HX0, HY0 + HH, 0, HX0, HY0 + HH, 0, HX0, HY0, 0], 0x3a4a6a, 1));
    // Lines of constant radius: log L = 2 log R + 4 (log T - log T_sun)
    const rl: number[] = [];
    const lts = Math.log10(5772);
    for (const lr of [-2, 0, 2, 3]) {
      let first = true;
      let px = 0;
      let py = 0;
      for (let lt = T_HOT; lt >= T_COOL - 1e-9; lt -= 0.02) {
        const ll = 2 * lr + 4 * (lt - lts);
        const inside = ll >= L_LO && ll <= L_HI;
        const x = hrX(lt);
        const y = hrY(clamp(ll, L_LO, L_HI));
        if (inside && !first) rl.push(px, py, -0.02, x, y, -0.02);
        first = !inside;
        px = x;
        py = y;
      }
      const ltLab = lr === 3 ? 3.37 : lr === 2 ? 3.93 : lr === 0 ? 4.55 : 4.95;
      const llLab = 2 * lr + 4 * (ltLab - lts);
      stage.label(lr === 0 ? '1 R☉' : `${10 ** lr} R☉`, [hrX(ltLab) + (lr === 3 ? 0.5 : 0), hrY(llLab) + 0.16, 0], 'muted');
    }
    const rlLine = mk(rl, 0x3b5b7a, 0.55);
    hr.add(rlLine);

    stage.label('surface temperature T_eff (K), hotter to the left', [HX0 + HW / 2, HY0 - 0.62, 0], 'muted');
    stage.label('luminosity L / L☉', [HX0 + 0.95, HY0 + HH + 0.25, 0], 'muted');
    stage.label('main sequence', [hrX(4.25) + 0.2, hrY(1.9) - 0.2, 0], 'muted');
    stage.label('giants', [hrX(3.62), hrY(2.4), 0], 'muted');
    stage.label('supergiants', [hrX(3.9), hrY(5.95), 0], 'muted');
    stage.label('white dwarfs', [hrX(4.35), hrY(-2.75), 0], 'muted');
  }

  // --- Scatter of example stars
  {
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const groups: { size: number; pts: [number, number][] }[] = [
      { size: 0.15, pts: [] },
      { size: 0.22, pts: [] },
      { size: 0.32, pts: [] },
    ];
    for (let i = 0; i < 380; i++) {
      const m = 10 ** (-0.8 + 2.4 * Math.pow(rnd(), 1.6));
      const Lm = msLuminosity(m);
      const Rm = msRadius(m);
      const lt = Math.log10(teff(Lm, Rm)) + gauss() * 0.015;
      const ll = Math.log10(Lm) + rnd() * 0.3;
      if (ll > L_LO && lt < T_HOT) groups[0].pts.push([lt, ll]);
    }
    for (let i = 0; i < 90; i++) {
      const ll = 0.4 + rnd() * 2.9;
      groups[1].pts.push([3.685 - 0.06 * (ll - 0.4) + gauss() * 0.012, ll]);
    }
    for (let i = 0; i < 40; i++) groups[1].pts.push([3.67 + gauss() * 0.012, 1.7 + gauss() * 0.12]);
    for (let i = 0; i < 20; i++) groups[1].pts.push([3.72 + rnd() * 0.25, 2 + rnd() * 1.6]);
    for (let i = 0; i < 34; i++) groups[2].pts.push([3.52 + rnd() * 0.95, 4.3 + rnd() * 1.5]);
    for (let i = 0; i < 50; i++) {
      const lt = 3.85 + rnd() * 0.75;
      groups[0].pts.push([lt, 2 * Math.log10(0.012) + 4 * (lt - Math.log10(5772)) + gauss() * 0.15]);
    }
    for (const gr of groups) {
      const n = gr.pts.length;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      gr.pts.forEach(([lt, ll], i) => {
        pos[i * 3] = hrX(lt);
        pos[i * 3 + 1] = hrY(ll);
        pos[i * 3 + 2] = (rnd() - 0.5) * 0.3;
        blackbodyRGB(10 ** lt, rgb);
        tmpC.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size: gr.size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      hr.add(new THREE.Points(g, m));
    }
    // Named stars
    const named: [string, number, number][] = [
      ['Sun', 5772, 1],
      ['Betelgeuse', 3600, 1e5],
      ['Sirius A', 9940, 25.4],
      ['Sirius B', 25000, 0.056],
    ];
    const dotGeo = new THREE.SphereGeometry(0.055, 12, 8);
    for (const [name, t, l] of named) {
      const x = hrX(Math.log10(t));
      const y = hrY(Math.log10(l));
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xdfe6f3 }));
      dot.position.set(x, y, 0.05);
      hr.add(dot);
      stage.label(name, [x + (name === 'Betelgeuse' ? -0.55 : 0.45), y - 0.2, 0.05], 'muted');
    }
  }

  // --- Current track in 3D (full path dim, travelled part bright)
  const trackPos = new Float32Array(NS * 3);
  const trackAttr = new THREE.BufferAttribute(trackPos, 3);
  trackAttr.setUsage(THREE.DynamicDrawUsage);
  const gFull = new THREE.BufferGeometry();
  gFull.setAttribute('position', trackAttr);
  const gDone = new THREE.BufferGeometry();
  gDone.setAttribute('position', trackAttr);
  const lineFull = new THREE.Line(gFull, new THREE.LineBasicMaterial({ color: 0x6b7a99, transparent: true, opacity: 0.6 }));
  const lineDone = new THREE.Line(gDone, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  lineFull.frustumCulled = false;
  lineDone.frustumCulled = false;
  lineFull.position.z = 0.08;
  lineDone.position.z = 0.1;
  hr.add(lineFull, lineDone);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  (marker.material as THREE.MeshBasicMaterial).toneMapped = false;
  hr.add(marker);
  const markerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  markerGlow.scale.setScalar(0.8);
  markerGlow.material.toneMapped = false;
  hr.add(markerGlow);
  const keyLabels: THREE.Object3D[] = [];
  const KEY_NAMES = ['ZAMS', 'end of MS', '', '', '', '', '', '', '', '', ''];
  for (let k = 0; k < 2; k++) keyLabels.push(stage.label(KEY_NAMES[k], [0, 0, 0], 'muted'));
  let trackUMax = 1;

  function rebuildTrackLine(): void {
    trackUMax = track.end === 'white dwarf' ? 1 : U_END;
    for (let i = 0; i < NS; i++) {
      trackAt(track, (i / (NS - 1)) * trackUMax, fmtPt);
      trackPos[i * 3] = hrX(fmtPt.logT);
      trackPos[i * 3 + 1] = hrY(fmtPt.logL);
      trackPos[i * 3 + 2] = 0;
    }
    trackAttr.needsUpdate = true;
    gFull.computeBoundingSphere();
    keyLabels[0].position.set(hrX(track.logT[0]) + 0.05, hrY(track.logL[0]) - 0.3, 0.1);
    keyLabels[1].position.set(hrX(track.logT[1]) + 0.25, hrY(track.logL[1]) + 0.25, 0.1);
  }

  // --- The star
  const starGroup = new THREE.Group();
  starGroup.position.copy(STAR);
  scene.add(starGroup);
  const surfMat = surfaceMaterial();
  const fullSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), surfMat);
  starGroup.add(fullSphere);
  const wedgeMat = surfaceMaterial();
  const wedge = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40, PHI_START, 1.5 * Math.PI), wedgeMat);
  starGroup.add(wedge);
  const capGeo = new THREE.CircleGeometry(1, 48, -Math.PI / 2, Math.PI);
  const caps: THREE.Mesh[][] = [];
  const capMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < MAX_LAYERS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 * (i + 1), polygonOffsetUnits: -4 * (i + 1) });
    capMats.push(mat);
    const pair: THREE.Mesh[] = [];
    for (const phi of [PHI_C - Math.PI / 4, PHI_C + Math.PI / 4]) {
      const m = new THREE.Mesh(capGeo, mat);
      m.rotation.y = phi + Math.PI;
      m.renderOrder = i + 1;
      starGroup.add(m);
      pair.push(m);
    }
    caps.push(pair);
  }
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowSprite.material.toneMapped = false;
  starGroup.add(glowSprite);

  const phaseLabel = stage.label('', [0, 0, 0], 'big');
  const keyHead = stage.label('surface ↓ core', [0, 0, 0], 'muted');
  const layerLabels = Array.from({ length: MAX_LAYERS }, () => {
    const l = stage.label('', [0, 0, 0], '');
    Object.assign(l.element.style, { width: '104px', textAlign: 'left' });
    return l;
  });
  Object.assign(keyHead.element.style, { width: '104px', textAlign: 'left', padding: '0 6px' });
  const layerHtml: string[] = new Array(MAX_LAYERS).fill('');

  // Layer configuration (outer to inner). Index 0 is the envelope.
  const laySp = new Int32Array(MAX_LAYERS);
  const layR = new Float32Array(MAX_LAYERS);
  let layN = 1;
  function setLayers(seg: number, f: number): void {
    const wd = track.end === 'white dwarf';
    const push = (sp: number, r: number) => {
      laySp[layN] = sp;
      layR[layN] = r;
      layN++;
    };
    layN = 1;
    laySp[0] = 0;
    layR[0] = 1;
    if (seg === 0) {
      push(1, 0.3);
    } else if (seg === 1 || seg === 2) {
      push(10, 0.19);
      push(2, 0.13);
    } else if (seg === 3) {
      push(10, 0.21);
      push(2, 0.15);
      push(3, 0.08 + 0.03 * f);
    } else if (seg === 4 || seg === 5) {
      push(10, 0.24);
      push(2, 0.18);
      push(3, 0.12);
    } else if (seg === 6 && wd) {
      push(10, 0.19);
      push(11, 0.14);
      push(4, 0.095);
    } else if (seg >= 6 && !wd) {
      // Onion builds up during the last stages before collapse.
      const g = seg >= 7 ? 1 : f;
      push(10, 0.5);
      push(11, 0.4);
      push(g > 0.15 ? 12 : 4, 0.31);
      if (g > 0.35) push(5, 0.23);
      if (g > 0.55) push(6, 0.16);
      if (g > 0.75) push(7, 0.1);
      if (g > 0.9) push(8, 0.05);
    } else if (seg === 7) {
      laySp[0] = 0;
      push(11, 0.75);
      push(4, 0.6);
    } else {
      laySp[0] = 9;
    }
  }

  // --- Endpoint effects
  const nebOuter = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMaterial(0xff5a8a, 1.6));
  const nebInner = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMaterial(0x4fe0d0, 2.2));
  nebOuter.visible = nebInner.visible = false;
  starGroup.add(nebOuter, nebInner);
  const debris = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMaterial(0xffa050, 1.4));
  debris.visible = false;
  starGroup.add(debris);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.material.toneMapped = false;
  flash.visible = false;
  starGroup.add(flash);
  // Neutron star with pulsar beams
  const ns = new THREE.Group();
  const nsCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdff0ff }));
  (nsCore.material as THREE.MeshBasicMaterial).toneMapped = false;
  const nsGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fd8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  nsGlow.scale.setScalar(0.9);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beamGeo = new THREE.ConeGeometry(0.16, 1.6, 20, 1, true);
  const beamAxis = new THREE.Group();
  beamAxis.rotation.z = 0.5;
  for (const sgn of [1, -1]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.position.y = sgn * 0.8;
    b.rotation.x = sgn > 0 ? Math.PI : 0;
    beamAxis.add(b);
  }
  const beamSpin = new THREE.Group();
  beamSpin.add(beamAxis);
  ns.add(nsCore, nsGlow, beamSpin);
  ns.visible = false;
  starGroup.add(ns);
  // Black hole
  const bh = new THREE.Group();
  const bhCore = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const bhRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 64), new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  bhRing.lookAt(new THREE.Vector3(CAM[0] - STAR.x, CAM[1] - STAR.y, CAM[2]));
  bh.add(bhCore, bhRing);
  bh.visible = false;
  starGroup.add(bh);

  // --- Inset: 2D HR diagram with reference tracks
  const PW = 560;
  const PH = 440;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const bg = document.createElement('canvas');
  bg.width = PW;
  bg.height = PH;
  const bctx = bg.getContext('2d')!;
  const PX0 = 70;
  const PX1 = PW - 18;
  const PY0 = 52;
  const PY1 = PH - 58;
  const pX = (lt: number) => PX0 + ((T_HOT - lt) / (T_HOT - T_COOL)) * (PX1 - PX0);
  const pY = (ll: number) => PY1 - ((ll - L_LO) / (L_HI - L_LO)) * (PY1 - PY0);
  const refTracks = REF_MASSES.filter((m) => m <= 25).map((m) => buildTrack(m));
  const drawPath = (c: CanvasRenderingContext2D, tr: Track, uMax: number) => {
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      trackAt(tr, (i / 200) * uMax, fmtPt);
      const x = pX(fmtPt.logT);
      const y = pY(fmtPt.logL);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  };
  function drawInsetBg(): void {
    const c = bctx;
    c.clearRect(0, 0, PW, PH);
    c.font = `600 21px ${MONO}`;
    c.fillStyle = '#dfe6f3';
    c.fillText('HR diagram: tracks', 16, 32);
    c.font = `16px ${MONO}`;
    c.lineWidth = 1;
    for (const t of [30000, 10000, 5000, 3000]) {
      const x = pX(Math.log10(t));
      c.strokeStyle = '#1a2336';
      c.beginPath();
      c.moveTo(x, PY0);
      c.lineTo(x, PY1);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(t >= 10000 ? `${t / 1000}k` : `${t}`, x - 18, PY1 + 22);
    }
    c.fillText('T_eff (K)', PX1 - 88, PH - 10);
    for (const ll of [-2, 0, 2, 4, 6]) {
      const y = pY(ll);
      c.strokeStyle = '#1a2336';
      c.beginPath();
      c.moveTo(PX0, y);
      c.lineTo(PX1, y);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(ll === 0 ? '1' : `10${sup(ll)}`, PX0 - 48, y + 6);
    }
    c.fillText('L/L☉', 12, PY0 + 2);
    c.strokeStyle = '#243049';
    c.strokeRect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    // ZAMS from the scaling laws
    c.save();
    c.beginPath();
    c.rect(PX0, PY0, PX1 - PX0, PY1 - PY0);
    c.clip();
    c.strokeStyle = 'rgba(223,230,243,0.25)';
    c.lineWidth = 6;
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const m = 10 ** (-1 + (i / 60) * 2.7);
      const l = msLuminosity(m);
      const x = pX(Math.log10(teff(l, msRadius(m))));
      const y = pY(Math.log10(l));
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(131,145,171,0.55)';
    for (const tr of refTracks) drawPath(c, tr, tr.end === 'white dwarf' ? 1 : U_END);
    c.lineWidth = 3.5;
    c.strokeStyle = css(PALETTE.amber);
    drawPath(c, track, trackUMax);
    c.restore();
    c.font = `15px ${MONO}`;
    c.fillStyle = '#8391ab';
    for (const tr of refTracks) c.fillText(`${tr.M}`, pX(tr.logT[0]) - 34, pY(tr.logL[0]) + 6);
    c.fillText('M☉', pX(refTracks[0].logT[0]) - 34, pY(refTracks[0].logL[0]) + 26);
    // Sun
    c.fillStyle = '#dfe6f3';
    c.beginPath();
    c.arc(pX(Math.log10(5772)), pY(0), 4, 0, Math.PI * 2);
    c.fill();
  }
  function drawInset(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bg, 0, 0);
    if (pt.gone) return;
    pctx.fillStyle = css(starCol.getHex(THREE.SRGBColorSpace));
    pctx.strokeStyle = '#ffffff';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.arc(pX(pt.logT), pY(pt.logL), 8, 0, Math.PI * 2);
    pctx.fill();
    pctx.stroke();
  }

  // --- Legend overlay (hidden on phones)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: string) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${c}"></i>`;
  legend.innerHTML = `<div>${sw(css(PALETTE.amber))}your star's track so far</div>
<div>${sw('#6b7a99')}the rest of its track</div>
<div>${sw('#3b5b7a')}diagonals: constant radius</div>
<div style="color:#8391ab">Tracks after the main sequence are schematic.</div>`;
  viewport.appendChild(legend);

  // --- Apply state to the scene
  let lastLayerKey = '';
  let time = 0;
  function apply(): void {
    trackAt(track, u, pt);
    T = 10 ** pt.logT;
    L = 10 ** pt.logL;
    R = radiusFrom(L, T);
    blackbodyRGB(T, rgb);
    starCol.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    const wd = track.end === 'white dwarf';

    // Marker and travelled track
    marker.visible = markerGlow.visible = !pt.gone;
    marker.position.set(hrX(pt.logT), hrY(pt.logL), 0.14);
    markerGlow.position.copy(marker.position);
    (marker.material as THREE.MeshBasicMaterial).color.copy(starCol);
    markerGlow.material.color.copy(starCol);
    const done = Math.floor((Math.min(u, trackUMax) / trackUMax) * (NS - 1)) + 1;
    gDone.setDrawRange(0, done);

    // Star body
    const rStar = rOf(R);
    rDisp = rStar;
    const starVisible = !pt.gone;
    fullSphere.visible = starVisible && !cutaway;
    wedge.visible = starVisible && cutaway;
    fullSphere.scale.setScalar(rStar);
    wedge.scale.setScalar(rStar);
    // Surface colour: sRGB values go straight to the shader.
    surfMat.uniforms.uColor.value.setRGB(rgb[0], rgb[1], rgb[2]);
    wedgeMat.uniforms.uColor.value.setRGB(rgb[0], rgb[1], rgb[2]);
    surfMat.uniforms.uTime.value = time;
    wedgeMat.uniforms.uTime.value = time;
    glowSprite.visible = starVisible;
    const isWD = wd && pt.seg >= 8;
    glowSprite.scale.setScalar(rStar * (isWD ? 6 : 3.1));
    glowSprite.material.color.copy(starCol).multiplyScalar(isWD ? 1.1 : 0.75);

    // Layers
    setLayers(pt.seg, pt.f);
    const showLayers = starVisible && cutaway;
    for (let i = 0; i < MAX_LAYERS; i++) {
      const on = showLayers && i < layN;
      caps[i][0].visible = caps[i][1].visible = on;
      if (!on) continue;
      const r = rStar * layR[i];
      caps[i][0].scale.setScalar(r);
      caps[i][1].scale.setScalar(r);
      const sp = SP[laySp[i]];
      if (laySp[i] === 0) capMats[i].color.copy(starCol).multiplyScalar(0.16);
      else {
        capMats[i].color.set(sp.color);
        if (sp.burning) capMats[i].color.multiplyScalar(0.88 + 0.12 * Math.sin(time * 3 + i));
      }
    }
    // Layer key to the right of the star
    keyHead.visible = showLayers;
    const kx = STAR.x + Math.max(rStar, 1.2) + 1.25;
    const ky = STAR.y + 0.75;
    keyHead.position.set(kx, ky, 0);
    let key = '';
    for (let i = 0; i < MAX_LAYERS; i++) key += i < layN ? `${laySp[i]},` : '';
    key += isWD ? 'wd' : '';
    for (let i = 0; i < MAX_LAYERS; i++) {
      const lab = layerLabels[i];
      lab.visible = showLayers && i < layN;
      if (!lab.visible) continue;
      lab.position.set(kx, ky - 0.3 * (i + 1), 0);
      if (key !== lastLayerKey) {
        const sp = SP[laySp[i]];
        const c = laySp[i] === 0 ? css(starCol.getHex(THREE.SRGBColorSpace)) : css(sp.color);
        const html = `${sw(c)}${sp.name}`;
        if (html !== layerHtml[i]) {
          lab.element.innerHTML = html;
          layerHtml[i] = html;
        }
      }
    }
    lastLayerKey = key;

    // Endpoint effects
    const vEnd = (u - U_END) / (1 - U_END);
    if (wd) {
      const v = (u - U_END) / (0.93 - U_END);
      const on = v > -0.02 && v < 1;
      nebOuter.visible = nebInner.visible = on;
      if (on) {
        const vv = clamp(v, 0, 1);
        const r7 = rOf(radiusFrom(10 ** track.logL[7], 10 ** track.logT[7]));
        const rn = r7 * 0.9 + 2.1 * Math.pow(vv, 0.7);
        nebOuter.scale.setScalar(rn);
        nebInner.scale.setScalar(rn * 0.7);
        const op = smooth(-0.02, 0.1, v) * Math.pow(1 - vv, 1.1);
        (nebOuter.material as THREE.ShaderMaterial).uniforms.uOpacity.value = op * 0.9;
        (nebInner.material as THREE.ShaderMaterial).uniforms.uOpacity.value = op * 0.7;
        (nebOuter.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      }
      debris.visible = flash.visible = ns.visible = bh.visible = false;
    } else {
      nebOuter.visible = nebInner.visible = false;
      const on = vEnd > 0;
      debris.visible = flash.visible = on;
      if (on) {
        const r7 = rOf(radiusFrom(10 ** track.logL[7], 10 ** track.logT[7]));
        const vf = clamp(vEnd / 0.5, 0, 1);
        flash.scale.setScalar(r7 * 2 + 12 * Math.sqrt(vf));
        flash.material.opacity = vf < 0.06 ? vf / 0.06 : Math.pow(1 - vf, 2.2);
        flash.material.color.setRGB(1, 0.95 - 0.2 * vf, 0.85 - 0.5 * vf);
        debris.scale.setScalar(r7 * 0.6 + 2.3 * Math.pow(vEnd, 0.55));
        (debris.material as THREE.ShaderMaterial).uniforms.uOpacity.value = smooth(0, 0.04, vEnd) * (0.12 + 0.8 * Math.pow(1 - vEnd, 1.5));
        (debris.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
      }
      const rem = smooth(0.08, 0.3, vEnd);
      const isNS = track.end === 'neutron star';
      ns.visible = isNS && rem > 0;
      bh.visible = !isNS && rem > 0;
      ns.scale.setScalar(rem);
      bh.scale.setScalar(rem);
      beamSpin.rotation.y = time * 6;
    }

    // Phase label
    phaseLabel.element.textContent = phaseName(M, pt.seg, pt.gone, track.end)
      + (pt.gone && pt.seg >= 8 ? (track.end === 'neutron star' ? ' (about 20 km, drawn far larger)' : ' (drawn far larger)') : '');
    const top = pt.gone ? 1.1 : Math.max(nebOuter.visible ? nebOuter.scale.x * 0.8 : 0, rStar);
    phaseLabel.position.set(STAR.x, STAR.y + top + 0.35, 0);
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Star');
  const massCtl = ui.slider({
    key: 'M', label: 'Initial mass (log scale)', min: LOG_MMIN, max: LOG_MMAX, step: 0.001, value: Math.log10(M),
    format: (v) => `${fmtM(10 ** v)} M☉`,
    onInput: (v) => {
      touched = true;
      setMass(10 ** v);
    },
  });
  ui.buttons(
    [1, 5, 15, 25].map((m) => ({
      label: `${m} M☉`,
      onClick: () => {
        touched = true;
        massCtl.set(Math.log10(m), false);
        setMass(m);
        u = 0;
        setPlaying(true);
      },
    })),
  );

  ui.section('Time');
  const ageCtl = ui.slider({
    key: 'age', label: 'Age (clock stretched after the main sequence)', min: 0, max: 1, step: 0.001, value: u,
    format: (v) => fmtAge(trackAt(track, v, fmtPt).age),
    onInput: (v) => {
      u = v;
      setPlaying(false);
    },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => setPlaying(!playing) },
    { label: 'Restart', onClick: () => { u = 0; setPlaying(true); } },
  ]);
  ui.toggle({ key: 'cutaway', label: 'Cutaway: show burning layers', value: cutaway, onChange: (v) => (cutaway = v) });

  ui.section('Readouts');
  const rAge = ui.readout('ageR', 'age');
  const rPhase = ui.readout('phase', 'phase');
  const rL = ui.readout('L', 'luminosity L');
  const rR = ui.readout('R', 'radius R');
  const rT = ui.readout('T', 'T_eff');
  const rSb = ui.readout('sb', '4πR²σT⁴ check');
  const rTms = ui.readout('tMS', 't_MS');
  const rEnd = ui.readout('end', 'endpoint');
  const rRem = ui.readout('rem', 'remnant mass');
  ui.note(`Endpoints by initial mass are approximate: white dwarf below about 8 M☉, neutron star up to about 25 M☉, black hole above. A white dwarf must stay below the Chandrasekhar limit of ${M_CH} M☉.`);

  function setPlaying(p: boolean): void {
    if (p && u >= 1) u = 0;
    playing = p;
    playBtn.textContent = playing ? 'Pause' : u >= 1 ? 'Replay' : 'Play';
  }

  function setMass(m: number): void {
    M = m;
    buildTrack(M, track);
    lastLayerKey = '';
    rebuildTrackLine();
    drawInsetBg();
    ageCtl.set(u, false);
  }

  function updateReadouts(): void {
    rAge(fmtAge(pt.age));
    rPhase(phaseName(M, pt.seg, pt.gone, track.end));
    rTms(fmtAge(track.tMS));
    rEnd(track.end);
    rRem(track.end === 'black hole' ? 'uncertain, > 3 M☉' : track.end === 'neutron star' ? '≈ 1.4 M☉' : `${track.remnant.toFixed(2)} M☉ (< ${M_CH})`);
    if (pt.gone) {
      rL('–');
      rR(track.end === 'neutron star' ? '≈ 12 km' : '–');
      rT('–');
      rSb('–');
      return;
    }
    rL(`${fmtSci(L)} L☉`);
    rR(`${R < 0.1 ? R.toFixed(4) : fmtSci(R)} R☉`);
    rT(`${Math.round(T).toLocaleString('en-US')} K`);
    rSb(`${fmtSci(luminositySI(R * R_SUN, T) / L_SUN)} L☉`);
  }

  // --- Frame loop
  let uiTimer = 0;
  let insetTimer = 0;
  stage.onFrame((dt) => {
    time += dt;
    if (playing) {
      u = Math.min(1, u + dt / PLAY_SECONDS);
      if (u >= 1) setPlaying(false);
    }
    apply();
    uiTimer += dt;
    insetTimer += dt;
    if (uiTimer > 0.1) {
      uiTimer = 0;
      updateReadouts();
      if (playing) ageCtl.set(u, false);
    }
    if (insetTimer > 0.1) {
      insetTimer = 0;
      drawInset();
    }
  });

  rebuildTrackLine();
  drawInsetBg();
  apply();
  drawInset();
  updateReadouts();

  return {
    state: () => ({
      M,
      u,
      ageGyr: pt.age,
      seg: pt.seg,
      segFrac: pt.f,
      phase: phaseName(M, pt.seg, pt.gone, track.end),
      L: pt.gone ? 0 : L,
      R: pt.gone ? 0 : R,
      T: pt.gone ? 0 : T,
      rDisp,
      tMS: track.tMS,
      endpoint: track.end,
      ended: u >= U_REMNANT,
      remnant: track.remnant,
      cutaway,
      playing,
      touched,
    }),
    dispose: () => {
      plot.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'stellar-evolution',
  number: 58,
  title: 'Lives of Stars',
  domain: 'astro',
  level: 2,
  status: 'live',
  tagline: 'From gas cloud to white dwarf, traced on one famous diagram.',
  content,
  mount,
};

export default topic;
