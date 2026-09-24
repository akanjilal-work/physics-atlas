import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  EofN, T_CMB, aAtTemp, ageAt, buildFuture, colAt, decel, eventHorizonChi, hawkingLifetimeYr, integrate, leadFactor,
  lnOnePlusZ, omegaR, ripTimeFormula, rowAt, slopeLnH,
  type Future, type Model, type Orbit,
} from './physics.ts';

type Preset = 'freeze' | 'rip' | 'crunch' | 'desi' | 'custom';

const H0 = 67.4;
const OR = omegaR(H0);
const PRESETS: Record<Exclude<Preset, 'custom'>, { Om: number; Ol: number; w0: number; wa: number; label: string; color: string }> = {
  freeze: { Om: 0.315, Ol: 0.685, w0: -1, wa: 0, label: 'Freeze', color: '#4fd1e8' },
  rip: { Om: 0.315, Ol: 0.685, w0: -1.3, wa: 0, label: 'Rip', color: '#f472b6' },
  crunch: { Om: 1.5, Ol: -0.5, w0: -1, wa: 0, label: 'Crunch', color: '#ff6b6b' },
  desi: { Om: 0.319, Ol: 0.681, w0: -0.75, wa: -0.86, label: 'DESI-like', color: '#a78bfa' },
};

const TWO_PI = Math.PI * 2;
const LN10 = Math.LN10;
const NG = 650; // background galaxies
const NC = 16; // bound neighbours (our group)
const NS = 2600; // stars in the home galaxy
const NBH = 28; // stellar black holes left behind
const ND = 320; // Earth debris
const K_DISP = 2.2; // display radius = K ln(1 + D/D0)
const D0 = 2; // Gly
const DISK_R = 0.62;
const CAM_HOME: [number, number, number] = [0, 5.2, 12.6];
const CAM_SOLAR: [number, number, number] = [0, 1.25, 2.7];
/** CKW (2003) lead times for w = −3/2, in years. */
const LEAD_CLUSTER = 1e9;
const LEAD_MW = 6e7;
const LEAD_SS = 0.25;
const LEAD_EARTH = 30 / (60 * 24 * 365.25);
const LEAD_ATOM = 1e-19 / 3.15576e7;
const G15 = leadFactor(-1.5);
const X_FAR = 110.5; // freeze ruler end, log10 yr
const X_RIP_MIN = -27.8;
const X_CRUNCH_MIN = -9.5;
const LOG_BH_STELLAR = Math.log10(hawkingLifetimeYr(10));
const LOG_BH_OURS = Math.log10(hawkingLifetimeYr(1.5e8));
const LOG_BH_BIG = Math.log10(hawkingLifetimeYr(1e11));

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function glowTexture(ring = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (ring) {
    const grad = g.createRadialGradient(32, 32, 10, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
  } else {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
  }
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Redshift colour ramp in ln(1+z), shared with the cosmic-expansion topic's look.
const Z_STOPS: [number, number, number, number][] = [
  [0, 0.62, 0.84, 1.0],
  [0.4, 1.0, 0.95, 0.78],
  [1, 0.96, 0.71, 0.26],
  [2.2, 1.0, 0.42, 0.42],
  [5, 0.75, 0.2, 0.3],
  [20, 0.45, 0.12, 0.2],
];
function zColor(lz: number, out: THREE.Color): THREE.Color {
  if (lz <= 0) {
    // Blueshift in a collapsing universe: towards blue-white.
    const f = Math.min(1, -lz / 1.5);
    return out.setRGB(0.62 + 0.3 * f, 0.84 + 0.12 * f, 1);
  }
  for (let i = 1; i < Z_STOPS.length; i++) {
    const x1 = Math.log1p(Z_STOPS[i][0]);
    if (lz <= x1) {
      const x0 = Math.log1p(Z_STOPS[i - 1][0]);
      const f = (lz - x0) / (x1 - x0);
      const a = Z_STOPS[i - 1];
      const b = Z_STOPS[i];
      return out.setRGB(a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3]));
    }
  }
  const l = Z_STOPS[Z_STOPS.length - 1];
  return out.setRGB(l[1], l[2], l[3]);
}

/** Approximate blackbody colour (0..1 sRGB) for temperature T in kelvin. */
function blackbody(T: number, out: THREE.Color): THREE.Color {
  const t = Math.max(1000, Math.min(40000, T)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return out.setRGB(c(r), c(g), c(b));
}

/** Display radius for a proper distance given as ln(D / Gly). Log-compressed so the whole future fits. */
function dispR(lnD: number): number {
  if (lnD > 30) return K_DISP * (lnD - Math.log(D0));
  return K_DISP * Math.log1p(Math.exp(lnD) / D0);
}

function fmtYears(y: number): string {
  if (!Number.isFinite(y)) return '∞';
  const a = Math.abs(y);
  if (a < 1 / 365.25 / 24 / 60) {
    const s = y * 3.15576e7;
    return `${s.toExponential(0)} s`;
  }
  if (a < 1 / 365.25 / 24) return `${(y * 525960).toFixed(0)} min`;
  if (a < 1 / 12) return `${(y * 365.25).toFixed(y * 365.25 < 10 ? 1 : 0)} days`;
  if (a < 1) return `${(y * 12).toFixed(1)} months`;
  if (a < 1e3) return `${y.toFixed(0)} yr`;
  if (a < 1e6) return `${(y / 1e3).toFixed(0)} thousand yr`;
  if (a < 1e9) return `${(y / 1e6).toFixed(a < 1e7 ? 1 : 0)} million yr`;
  if (a < 1e12) return `${(y / 1e9).toFixed(a < 1e10 ? 2 : 1)} billion yr`;
  return `10^${Math.log10(a).toFixed(1)} yr`;
}
const sup = (x: number) => {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(Math.round(x)).split('').map((ch) => map[ch] ?? ch).join('');
};

interface Milestone {
  x: number;
  label: string;
  color: string;
  x2?: number;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_HOME, target: [0, 0, 0], fov: 45, near: 0.01, far: 400 });
  const { scene } = stage;
  const bgColor = new THREE.Color(PALETTE.bg);
  scene.background = bgColor.clone();

  // ------------------------------------------------------------ state
  let preset: Preset = 'freeze';
  let OmS = PRESETS.freeze.Om;
  let Ol = PRESETS.freeze.Ol;
  let w0 = PRESETS.freeze.w0;
  let wa = 0;
  let advanced = false;
  const model = (): Model => ({ H0, Om: OmS - OR, Or: OR, Ode: Ol, w0, wa: advanced ? wa : 0 });
  let m: Model = model();
  let F: Future = buildFuture(m);
  let orbitNow: Orbit = integrate(m, { tMax: 70, aMax: 30 });
  let rkEnd = NaN;
  let s = 0; // scrubber 0..1
  let playing = true;
  let userTime = false;
  let wTouched = false;
  let sawRip = false;
  let atomsGone = false;
  let dirty = true;
  let modelDirty = false;
  let camSolar = false;
  // Derived per moment
  let X = 0; // log10 years since the Big Bang (freeze) or log10 years left (rip, crunch)
  let tYr = 0;
  let tauYr = Infinity;
  let row = 0;
  let N = 0;
  let wEff = -1;
  let pExp = 1;
  let leadScale = 1;
  let caption = '';

  // ------------------------------------------------------------ deterministic layout
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gDir = new Float32Array(NG * 3);
  const gLnChi = new Float32Array(NG);
  const gChi = new Float64Array(NG);
  for (let i = 0; i < NG; i++) {
    const u = rnd() * 2 - 1;
    const ph = rnd() * TWO_PI;
    const r = Math.sqrt(1 - u * u);
    gDir[i * 3] = r * Math.cos(ph);
    gDir[i * 3 + 1] = u * 0.7;
    gDir[i * 3 + 2] = r * Math.sin(ph);
    const chi = 3 + 31 * Math.pow(rnd(), 0.75);
    gChi[i] = chi;
    gLnChi[i] = Math.log(chi);
  }

  const glowTex = glowTexture();
  const ringTex = glowTexture(true);
  const world = new THREE.Group();
  scene.add(world);

  // Background galaxies
  const galPos = new Float32Array(NG * 3);
  const galCol = new Float32Array(NG * 3);
  const galGeo = new THREE.BufferGeometry();
  galGeo.setAttribute('position', new THREE.BufferAttribute(galPos, 3));
  galGeo.setAttribute('color', new THREE.BufferAttribute(galCol, 3));
  const galaxies = new THREE.Points(
    galGeo,
    new THREE.PointsMaterial({ size: 0.3, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  galaxies.frustumCulled = false;
  world.add(galaxies);

  // Bound neighbours
  const nbBase = new Float32Array(NC * 4); // radius, angle, height, speed
  for (let i = 0; i < NC; i++) {
    nbBase[i * 4] = 1.0 + 0.9 * rnd();
    nbBase[i * 4 + 1] = rnd() * TWO_PI;
    nbBase[i * 4 + 2] = (rnd() - 0.5) * 0.9;
    nbBase[i * 4 + 3] = 0.05 + 0.08 * rnd();
  }
  const nbPos = new Float32Array(NC * 3);
  const nbCol = new Float32Array(NC * 3);
  const nbGeo = new THREE.BufferGeometry();
  nbGeo.setAttribute('position', new THREE.BufferAttribute(nbPos, 3));
  nbGeo.setAttribute('color', new THREE.BufferAttribute(nbCol, 3));
  const neighbours = new THREE.Points(
    nbGeo,
    new THREE.PointsMaterial({ size: 0.34, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  neighbours.frustumCulled = false;
  world.add(neighbours);
  let nbSpin = 0;

  // Home galaxy: a two-armed spiral of star points in a tilted group.
  const home = new THREE.Group();
  home.rotation.x = 0.35;
  world.add(home);
  const disk = new THREE.Group();
  home.add(disk);
  const starBase = new Float32Array(NS * 3);
  const starRnd = new Float32Array(NS);
  const starHue = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    const bulge = i < 380;
    let x: number;
    let y: number;
    let z: number;
    if (bulge) {
      const r = 0.12 * Math.pow(rnd(), 0.7);
      const u = rnd() * 2 - 1;
      const ph = rnd() * TWO_PI;
      const q = Math.sqrt(1 - u * u);
      x = r * q * Math.cos(ph);
      y = r * u * 0.6;
      z = r * q * Math.sin(ph);
    } else {
      const r = 0.08 + (DISK_R - 0.08) * Math.pow(rnd(), 0.8);
      const arm = i % 2;
      const th = Math.log(r / 0.05) / 0.32 + arm * Math.PI + (rnd() - 0.5) * 0.9;
      x = r * Math.cos(th);
      z = r * Math.sin(th);
      y = (rnd() - 0.5) * 0.03;
    }
    starBase[i * 3] = x;
    starBase[i * 3 + 1] = y;
    starBase[i * 3 + 2] = z;
    starRnd[i] = rnd();
    starHue[i] = bulge ? 0.7 : rnd();
  }
  const starPos = new Float32Array(NS * 3);
  const starCol = new Float32Array(NS * 3);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 0.05, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  stars.frustumCulled = false;
  disk.add(stars);
  const homeLabel = stage.label('Milky Way (not to scale)', [0, -0.32, 0], 'muted', home);

  // Central supermassive black hole
  const bhCore = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  home.add(bhCore);
  const bhRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: PALETTE.violet, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  bhRing.scale.setScalar(0.34);
  home.add(bhRing);
  // Stellar black holes left after the galaxy evaporates
  const sbhPos = new Float32Array(NBH * 3);
  const sbhCol = new Float32Array(NBH * 3);
  const sbhLog = new Float32Array(NBH);
  for (let i = 0; i < NBH; i++) {
    const r = 0.25 + 1.4 * rnd();
    const ph = rnd() * TWO_PI;
    sbhPos[i * 3] = r * Math.cos(ph);
    sbhPos[i * 3 + 1] = (rnd() - 0.5) * 0.5;
    sbhPos[i * 3 + 2] = r * Math.sin(ph);
    sbhLog[i] = Math.log10(hawkingLifetimeYr(3 + 27 * rnd()));
  }
  const sbhGeo = new THREE.BufferGeometry();
  sbhGeo.setAttribute('position', new THREE.BufferAttribute(sbhPos, 3));
  sbhGeo.setAttribute('color', new THREE.BufferAttribute(sbhCol, 3));
  const sbh = new THREE.Points(sbhGeo, new THREE.PointsMaterial({ size: 0.14, map: ringTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sbh.frustumCulled = false;
  home.add(sbh);

  // Event horizon shell
  const horizon = new THREE.Group();
  {
    horizon.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.BackSide })));
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.5, depthWrite: false });
    for (const plane of ['xz', 'xy'] as const) {
      const p = new Float32Array(129 * 3);
      for (let i = 0; i <= 128; i++) {
        const t = (i / 128) * TWO_PI;
        p[i * 3] = Math.cos(t);
        if (plane === 'xz') p[i * 3 + 2] = Math.sin(t);
        else p[i * 3 + 1] = Math.sin(t);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      horizon.add(new THREE.Line(g, mat));
    }
  }
  world.add(horizon);
  const horizonLabel = stage.label('event horizon', [0.72, -0.69, 0], 'muted', horizon);
  horizonLabel.element.style.color = css(PALETTE.violet);

  // Solar System (Big Rip close-up)
  const solar = new THREE.Group();
  solar.visible = false;
  world.add(solar);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true }));
  solar.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunGlow.scale.setScalar(0.45);
  solar.add(sunGlow);
  const PL_R = [0.16, 0.22, 0.3, 0.39, 0.54, 0.67, 0.79, 0.9];
  const PL_S = [0.012, 0.018, 0.02, 0.016, 0.045, 0.04, 0.03, 0.03];
  const PL_C = [0xb8b0a8, 0xe8c27a, 0x4f9dff, 0xd0613b, 0xd8b48a, 0xe6d29a, 0x9fd9e8, 0x5f7fe0];
  const planets: THREE.Mesh[] = [];
  const rings: THREE.Line[] = [];
  const plAng = new Float64Array(8);
  const ringGeo = new THREE.BufferGeometry();
  {
    const p = new Float32Array(97 * 3);
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * TWO_PI;
      p[i * 3] = Math.cos(t);
      p[i * 3 + 2] = Math.sin(t);
    }
    ringGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  for (let i = 0; i < 8; i++) {
    const pm = new THREE.Mesh(new THREE.SphereGeometry(PL_S[i], 16, 12), new THREE.MeshStandardMaterial({ color: PL_C[i], roughness: 0.6, emissive: PL_C[i], emissiveIntensity: 0.35, transparent: true }));
    solar.add(pm);
    planets.push(pm);
    const rg = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.6, depthWrite: false }));
    rg.scale.setScalar(PL_R[i]);
    solar.add(rg);
    rings.push(rg);
    plAng[i] = rnd() * TWO_PI;
  }
  const solarLabel = stage.label('Solar System (zoomed in, not to scale)', [0, -0.35, 0], 'muted', solar);
  const earthLabel = stage.label('Earth', [0, 0, 0], 'muted', solar);
  // Earth debris
  const debDir = new Float32Array(ND * 3);
  for (let i = 0; i < ND; i++) {
    const u = rnd() * 2 - 1;
    const ph = rnd() * TWO_PI;
    const q = Math.sqrt(1 - u * u);
    const sp = 0.5 + rnd();
    debDir[i * 3] = q * Math.cos(ph) * sp;
    debDir[i * 3 + 1] = u * sp;
    debDir[i * 3 + 2] = q * Math.sin(ph) * sp;
  }
  const debPos = new Float32Array(ND * 3);
  const debGeo = new THREE.BufferGeometry();
  debGeo.setAttribute('position', new THREE.BufferAttribute(debPos, 3));
  const debris = new THREE.Points(debGeo, new THREE.PointsMaterial({ size: 0.012, color: 0x8fc0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  debris.frustumCulled = false;
  debris.visible = false;
  solar.add(debris);


  // ------------------------------------------------------------ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const captionEl = document.createElement('div');
  Object.assign(captionEl.style, {
    position: 'absolute', left: '50%', bottom: '94px', transform: 'translateX(-50%)', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.78)', border: '1px solid #243049', borderRadius: '8px', padding: '5px 10px', maxWidth: '82%',
    font: '600 13px/1.4 JetBrains Mono, monospace', color: '#dfe6f3', textAlign: 'center',
  } as CSSStyleDeclaration);
  viewport.appendChild(captionEl);
  const flash = document.createElement('div');
  Object.assign(flash.style, { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none', background: '#ffffff', opacity: '0' } as CSSStyleDeclaration);
  viewport.appendChild(flash);

  const warn = document.createElement('div');
  Object.assign(warn.style, {
    position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', zIndex: '3', pointerEvents: 'none', display: 'none',
    background: 'rgba(40,10,16,0.9)', border: '1px solid #ff6b6b', borderRadius: '10px', padding: '10px 14px', maxWidth: '320px',
    font: '12px/1.5 JetBrains Mono, monospace', color: '#ffd0d0', textAlign: 'center',
  } as CSSStyleDeclaration);
  warn.textContent = 'No Big Bang: with this much dark energy and this little matter, the past universe would have bounced at a finite size. Lower Ω_Λ or raise Ω_m.';
  viewport.appendChild(warn);

  // a(t) inset
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
  const bctx = bgPlot.getContext('2d')!;
  const PX0 = 50;
  const PX1 = PW - 16;
  const PY0 = 70;
  const PY1 = PH - 44;
  const XL = -14;
  const XH = 60;
  const YH = 5;
  const xOf = (x: number) => PX0 + ((x - XL) / (XH - XL)) * (PX1 - PX0);
  const yOf = (y: number) => PY1 - (y / YH) * (PY1 - PY0);

  // Log-time ruler along the bottom. Wrapped in a div so it keeps full width on phones.
  const rulerWrap = document.createElement('div');
  Object.assign(rulerWrap.style, { position: 'absolute', left: '10px', right: '10px', bottom: '10px', height: '74px', zIndex: '2', pointerEvents: 'none' } as CSSStyleDeclaration);
  viewport.appendChild(rulerWrap);
  const ruler = document.createElement('canvas');
  Object.assign(ruler.style, { width: '100%', height: '100%', display: 'block', background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049' } as CSSStyleDeclaration);
  rulerWrap.appendChild(ruler);
  const rctx = ruler.getContext('2d')!;
  const bgRuler = document.createElement('canvas');
  const brctx = bgRuler.getContext('2d')!;
  let RW = 1200;
  const RH = 148;
  const sizeRuler = () => {
    RW = Math.max(300, Math.round(rulerWrap.clientWidth * 2));
    ruler.width = RW;
    ruler.height = RH;
    bgRuler.width = RW;
    bgRuler.height = RH;
    drawRulerBackground();
  };
  const ro = new ResizeObserver(() => sizeRuler());
  ro.observe(rulerWrap);

  // ------------------------------------------------------------ time mapping
  const ending = () => F.fate === 'rip' || F.fate === 'crunch';
  const xNow = () => (ending() ? Math.log10((F.tEnd - F.t0) * 1e9) : Math.log10(F.t0 * 1e9));
  const xMin = () => (F.fate === 'rip' ? X_RIP_MIN : X_CRUNCH_MIN);
  // The scrubber and the ruler share a stretched log axis: x = x_now ± span·u^γ.
  // Early decades get more room, where most of the familiar physics happens.
  const gam = () => (ending() ? 2 : 2.3);
  const spanX = () => (ending() ? xNow() - xMin() : X_FAR - xNow());
  const xOfS = (u: number) => (ending() ? xNow() - spanX() * Math.pow(u, gam()) : xNow() + spanX() * Math.pow(u, gam()));
  const sOfX = (x: number) => Math.pow(Math.max(0, Math.min(1, (ending() ? xNow() - x : x - xNow()) / spanX())), 1 / gam());
  const RULER_PAD = 0.035;
  const rx = (x: number) => 14 + (RULER_PAD + (1 - RULER_PAD) * sOfX(x)) * (RW - 28);

  let milestones: Milestone[] = [];
  function buildMilestones(): void {
    const L: Milestone[] = [];
    if (F.fate === 'freeze' || F.fate === 'nobang') {
      L.push({ x: 6, x2: 14, label: 'stars shine', color: 'rgba(245,182,66,0.20)' });
      L.push({ x: 14, x2: 40, label: 'degenerate era', color: 'rgba(167,139,250,0.16)' });
      L.push({ x: 40, x2: 100, label: 'black hole era', color: 'rgba(120,130,160,0.16)' });
      L.push({ x: 100, x2: 120, label: 'dark era', color: 'rgba(40,48,70,0.3)' });
      L.push({ x: 11.1, label: 'other galaxies fade', color: '#9ed6ff' });
      L.push({ x: 14, label: 'star formation ends', color: '#f5b642' });
      L.push({ x: 19.5, label: 'galaxy evaporates', color: '#dfe6f3' });
      L.push({ x: 40, label: 'protons decay? (hypothetical)', color: '#a78bfa' });
      L.push({ x: LOG_BH_STELLAR, label: 'stellar BHs evaporate', color: '#dfe6f3' });
      L.push({ x: LOG_BH_BIG, label: 'largest BHs gone', color: '#f472b6' });
    } else if (F.fate === 'rip') {
      L.push({ x: Math.log10(LEAD_CLUSTER * leadScale), label: 'clusters torn apart', color: '#9ed6ff' });
      L.push({ x: Math.log10(LEAD_MW * leadScale), label: 'Milky Way torn apart', color: '#f5b642' });
      L.push({ x: Math.log10(LEAD_SS * leadScale), label: 'Solar System unbound', color: '#5ee39a' });
      L.push({ x: Math.log10(LEAD_EARTH * leadScale), label: 'Earth explodes', color: '#4fd1e8' });
      L.push({ x: Math.log10(LEAD_ATOM * leadScale), label: 'atoms torn apart', color: '#f472b6' });
    } else {
      const ageYr = (a: number) => ageAt(m, a, 600) * 1e9;
      L.push({ x: Math.log10((F.tEnd / 2) * 1e9), label: 'turnaround', color: '#9ed6ff' });
      L.push({ x: Math.log10(ageYr(0.01)), label: 'galaxies merge', color: '#dfe6f3' });
      L.push({ x: Math.log10(ageYr(aAtTemp(3000))), label: 'sky 3000 K: atoms ionised', color: '#f5b642' });
      L.push({ x: Math.log10(ageYr(aAtTemp(5800))), label: 'sky hotter than the Sun', color: '#ffd27a' });
      L.push({ x: Math.log10(ageYr(aAtTemp(1e10))), label: '10¹⁰ K: nuclei break up', color: '#ff6b6b' });
    }
    milestones = L;
  }

  function drawRulerBackground(): void {
    const c = brctx;
    c.clearRect(0, 0, RW, RH);
    if (F.fate === 'nobang') return;
    const isEnd = ending();
    const rLo = xNow();
    const rHi = isEnd ? xMin() : X_FAR;
    const axisY = 58;
    // Era bands
    for (const ms of milestones) {
      if (ms.x2 === undefined) continue;
      const a = Math.max(14, rx(Math.max(ms.x, rLo)));
      const b = Math.min(RW - 14, rx(Math.min(ms.x2, rHi)));
      if (b <= a) continue;
      c.fillStyle = ms.color;
      c.fillRect(a, axisY - 18, b - a, 36);
      c.fillStyle = '#8391ab';
      c.font = '17px JetBrains Mono, monospace';
      const lx = Math.max(a + 6, rx(xNow()) + 50);
      if (lx + c.measureText(ms.label).width < b) c.fillText(ms.label, lx, axisY + 13);
    }
    c.strokeStyle = '#2c3852';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(14, axisY);
    c.lineTo(RW - 14, axisY);
    c.stroke();
    // Decade ticks
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = '#56627c';
    const lo = Math.ceil(Math.min(rLo, rHi));
    const hi = Math.floor(Math.max(rLo, rHi));
    let lastLab = -Infinity;
    const ks: number[] = [];
    for (let k = lo; k <= hi; k++) ks.push(k);
    if (isEnd) ks.reverse();
    for (const k of ks) {
      const x = rx(k);
      const major = x - lastLab > 78 && x < RW - 300;
      c.strokeStyle = major ? '#3a4a6a' : '#1f2940';
      c.beginPath();
      c.moveTo(x, axisY + 18);
      c.lineTo(x, axisY + (major ? 30 : 24));
      c.stroke();
      if (major) {
        c.fillText(`10${sup(k)}`, x - 14, axisY + 50);
        lastLab = x;
      }
    }
    c.fillStyle = '#8391ab';
    c.font = '600 18px JetBrains Mono, monospace';
    const title = isEnd ? (F.fate === 'rip' ? 'years left before the Rip' : 'years left before the Crunch') : 'years since the Big Bang (approximate milestones)';
    c.textAlign = 'right';
    c.fillText(title, RW - 20, axisY + 50);
    c.textAlign = 'left';
    // Point milestones, labels staggered above the axis
    c.font = '16px JetBrains Mono, monospace';
    const rowEnd = [-Infinity, -Infinity];
    for (const ms of milestones) {
      if (ms.x2 !== undefined) continue;
      const x = rx(ms.x);
      if (x < 14 || x > RW - 14) continue;
      c.strokeStyle = ms.color;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, axisY - 20);
      c.lineTo(x, axisY + 18);
      c.stroke();
      const w = c.measureText(ms.label).width;
      // Label starts at the tick, or ends at it near the right edge. Two rows, first free one wins.
      const tx = x + w + 20 > RW ? x - w + 4 : x - 4;
      let r = rowEnd[0] <= tx ? 0 : rowEnd[1] <= tx ? 1 : rowEnd[0] <= rowEnd[1] ? 0 : 1;
      if (rowEnd[r] > tx && x + w + 20 <= RW) r = rowEnd[0] < rowEnd[1] ? 0 : 1;
      c.fillStyle = ms.color;
      c.fillText(ms.label, tx, r ? 38 : 20);
      rowEnd[r] = tx + w + 12;
    }
    // "now" tick
    const xn = rx(xNow());
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(xn, axisY, 5, 0, TWO_PI);
    c.fill();
    c.fillText('now', xn + 8, axisY - 6);
  }

  function drawRuler(): void {
    rctx.clearRect(0, 0, RW, RH);
    rctx.drawImage(bgRuler, 0, 0);
    if (F.fate === 'nobang') return;
    const x = rx(X);
    rctx.strokeStyle = css(PALETTE.amber);
    rctx.lineWidth = 3;
    rctx.beginPath();
    rctx.moveTo(x, 44);
    rctx.lineTo(x, 76);
    rctx.stroke();
    rctx.fillStyle = css(PALETTE.amber);
    rctx.beginPath();
    rctx.moveTo(x - 8, 40);
    rctx.lineTo(x + 8, 40);
    rctx.lineTo(x, 50);
    rctx.fill();
  }

  // ------------------------------------------------------------ inset curves
  let presetOrbits: { o: Orbit; b: Orbit; color: string; label: string }[] = [];
  const presetModel = (k: keyof typeof PRESETS): Model => ({ H0, Om: PRESETS[k].Om - OR, Or: OR, Ode: PRESETS[k].Ol, w0: PRESETS[k].w0, wa: PRESETS[k].wa });
  for (const k of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
    const pm = presetModel(k);
    presetOrbits.push({ o: integrate(pm, { tMax: XH + 2, aMax: 40 }), b: integrate(pm, { tMax: 20, backward: true }), color: PRESETS[k].color, label: PRESETS[k].label });
  }
  let backNow: Orbit = integrate(m, { tMax: 20, backward: true });

  function curve(c: CanvasRenderingContext2D, o: Orbit, b: Orbit, color: string, w: number, alpha: number): void {
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(xOf(b.t[b.n - 1]), yOf(b.a[b.n - 1]));
    const sb = Math.max(1, Math.floor(b.n / 300));
    for (let i = b.n - 1; i >= 0; i -= sb) c.lineTo(xOf(b.t[i]), yOf(b.a[i]));
    const so = Math.max(1, Math.floor(o.n / 600));
    for (let i = 0; i < o.n; i += so) {
      if (o.t[i] > XH + 1) break;
      c.lineTo(xOf(o.t[i]), yOf(Math.min(YH + 0.3, o.a[i])));
      if (o.a[i] > YH + 0.3) break;
    }
    if (o.end === 'crunch' && o.tEnd < XH) c.lineTo(xOf(o.tEnd), yOf(0));
    c.stroke();
    c.globalAlpha = 1;
  }

  function drawPlotBackground(): void {
    const c = bctx;
    c.clearRect(0, 0, PW, PH);
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('Scale factor a(t)', 16, 32);
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('Gyr from now', PW - 150, 30);
    c.font = '18px JetBrains Mono, monospace';
    c.lineWidth = 1.5;
    for (let x = -10; x <= XH; x += 10) {
      c.strokeStyle = x === 0 ? '#2c3852' : '#1a2336';
      c.beginPath();
      c.moveTo(xOf(x), PY0);
      c.lineTo(xOf(x), PY1);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(`${x > 0 ? '+' : ''}${x}`, xOf(x) - (x === 0 ? 6 : 18), PH - 16);
    }
    for (let y = 0; y <= YH; y++) {
      c.strokeStyle = y === 1 ? '#2c3852' : '#1a2336';
      c.beginPath();
      c.moveTo(PX0, yOf(y));
      c.lineTo(PX1, yOf(y));
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(String(y), PX0 - 22, yOf(y) + 6);
    }
    c.save();
    c.beginPath();
    c.rect(PX0, PY0 - 6, PX1 - PX0, PY1 - PY0 + 6);
    c.clip();
    for (const p of presetOrbits) curve(c, p.o, p.b, p.color, 2.5, 0.5);
    if (F.fate !== 'nobang') curve(c, orbitNow, backNow, '#ffffff', 4.5, 1);
    if (F.fate === 'rip' && F.tEnd - F.t0 < XH) {
      c.setLineDash([8, 8]);
      c.strokeStyle = '#f472b6';
      c.lineWidth = 2;
      const xr = xOf(F.tEnd - F.t0);
      c.beginPath();
      c.moveTo(xr, PY0);
      c.lineTo(xr, PY1);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#f472b6';
      c.fillText('rip', xr + 6, PY0 + 18);
    }
    c.restore();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(xOf(0), yOf(1), 6, 0, TWO_PI);
    c.fill();
    c.font = '16px JetBrains Mono, monospace';
    let lx = PX0 + 4;
    for (const p of presetOrbits) {
      c.fillStyle = p.color;
      c.fillText(p.label, lx, 56);
      lx += c.measureText(p.label).width + 12;
    }
    c.fillStyle = '#ffffff';
    c.fillText('this model', lx, 56);
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    if (F.fate === 'nobang') return;
    const tRel = ending() ? F.tEnd - tauYr / 1e9 - F.t0 : tYr / 1e9 - F.t0;
    if (tRel > XH) {
      pctx.fillStyle = css(PALETTE.amber);
      pctx.font = '16px JetBrains Mono, monospace';
      pctx.fillText('now: off the right edge →', PX1 - 250, PY0 + 18);
      return;
    }
    const x = xOf(tRel);
    pctx.strokeStyle = 'rgba(245,182,66,0.6)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x, PY0);
    pctx.lineTo(x, PY1);
    pctx.stroke();
    const a = Math.exp(N);
    if (a < YH + 0.3) {
      pctx.fillStyle = css(PALETTE.amber);
      pctx.beginPath();
      pctx.arc(x, yOf(a), 7, 0, TWO_PI);
      pctx.fill();
    }
  }

  let timeCtlRef: { set(v: number, emit?: boolean): void } | null = null;

  // ------------------------------------------------------------ model rebuild
  function rebuild(): void {
    m = model();
    F = buildFuture(m);
    warn.style.display = F.fate === 'nobang' ? 'block' : 'none';
    if (F.fate === 'rip') sawRip = true;
    if (F.fate !== 'nobang') {
      orbitNow = integrate(m, { tMax: XH + 2, aMax: 40 });
      backNow = integrate(m, { tMax: 20, backward: true });
      // End-time cross-check between the RK4 run and the log-time table.
      if (F.fate === 'rip' || F.fate === 'crunch') {
        const o = F.fate === 'rip' ? integrate(m, { tMax: 1e5, aMax: 1e10 }) : integrate(m, { tMax: 1e5, aMin: 1e-3 });
        rkEnd = o.tEnd;
      } else rkEnd = NaN;
      // Effective w near the end sets the rip lead times and the tearing speed.
      const kEnd = F.fate === 'rip' ? slopeLnH(m, F.N[F.n - 1]) : 0;
      wEff = F.fate === 'rip' ? -1 - (2 / 3) * kEnd : w0;
      leadScale = F.fate === 'rip' ? leadFactor(wEff) / G15 : 1;
      pExp = F.fate === 'rip' ? Math.min(3, 2 / (3 * Math.abs(1 + wEff))) : 1;
    }
    atomsGone = false;
    buildMilestones();
    drawRulerBackground();
    if (timeCtlRef) timeCtlRef.set(s, false);
    drawPlotBackground();
    dirty = true;
  }

  // ------------------------------------------------------------ per-moment scene update
  const tmpC = new THREE.Color();
  const tmpC2 = new THREE.Color();
  const starCold = new THREE.Color();
  const skyC = new THREE.Color();

  function setCaption(text: string): void {
    if (text === caption) return;
    caption = text;
    captionEl.textContent = text;
    captionEl.style.display = text ? '' : 'none';
  }

  function updateMoment(): void {
    if (F.fate === 'nobang') {
      galaxies.visible = false;
      return;
    }
    galaxies.visible = true;
    X = xOfS(s);
    if (ending()) {
      tauYr = Math.pow(10, X);
      tYr = (F.tEnd - tauYr / 1e9) * 1e9;
      row = rowAt(F, tauYr / 1e9);
    } else {
      tYr = Math.pow(10, X);
      tauYr = Infinity;
      row = rowAt(F, tYr / 1e9);
    }
    N = colAt(F, F.N, row);
    // Beyond the table (freeze only): extrapolate with the last expansion rate.
    if (!ending() && tYr / 1e9 > F.t[F.n - 1]) {
      const Hl = EofN(m, F.N[F.n - 1]) * (H0 / 977.79);
      N = F.N[F.n - 1] + Hl * (tYr / 1e9 - F.t[F.n - 1]);
    }
    const a = Math.exp(Math.min(N, 700));

    // Background galaxies
    for (let i = 0; i < NG; i++) {
      const r = dispR(N + gLnChi[i]);
      galPos[i * 3] = gDir[i * 3] * r;
      galPos[i * 3 + 1] = gDir[i * 3 + 1] * r;
      galPos[i * 3 + 2] = gDir[i * 3 + 2] * r;
      const lz = lnOnePlusZ(F, row, gChi[i]);
      let b = 0;
      if (Number.isFinite(lz) && r < 40) {
        b = lz > 0 ? Math.exp(-1.25 * lz) : Math.min(2.2, Math.exp(-0.8 * lz));
        zColor(lz, tmpC);
      }
      galCol[i * 3] = tmpC.r * b;
      galCol[i * 3 + 1] = tmpC.g * b;
      galCol[i * 3 + 2] = tmpC.b * b;
    }
    (galGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (galGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Event horizon: proper radius a χ_eh
    const chiEh = eventHorizonChi(F, row);
    if (Number.isFinite(chiEh) && chiEh > 0 && (F.fate === 'freeze' || F.fate === 'rip')) {
      horizon.visible = true;
      horizon.scale.setScalar(Math.max(0.02, dispR(N + Math.log(chiEh))));
    } else horizon.visible = false;

    // Story state for bound structures
    let starBright = 1;
    let starSpread = 1; // radial factor for the home disk
    let starJitter = 0;
    let nbFactor = 1;
    let nbBright = 1;
    let bhVis = 0;
    let sbhOn = false;
    let solarOn = false;
    let plFactor = 1;
    let earthF = 0;
    let flashA = 0;
    let flashBlack = false;
    let text = '';
    starCold.setRGB(0.75, 0.85, 1);
    scene.background = bgColor;
    homeLabel.position.set(0, -0.9, 0.3);
    skyC.copy(bgColor);

    if (F.fate === 'freeze') {
      // Stars burn out, remnants cool, the galaxy evaporates, then black holes evaporate.
      const fade1 = smooth(12, 14.2, X);
      const fade2 = smooth(14.2, 16, X);
      starBright = 1 - 0.75 * fade1 - 0.17 * fade2;
      tmpC.setRGB(1, 0.45, 0.25);
      starCold.lerp(tmpC, fade1);
      tmpC.setRGB(0.55, 0.5, 0.75);
      starCold.lerp(tmpC, fade2);
      const evap = smooth(18.8, 20.4, X);
      starSpread = 1 + 7 * evap;
      starBright *= 1 - 0.85 * evap;
      starBright *= 1 - smooth(38.5, 40.5, X);
      nbBright = 1 - 0.8 * fade1 - 0.2 * smooth(18.8, 20.4, X);
      bhVis = smooth(14, 16, X) * (1 - smooth(LOG_BH_OURS - 0.4, LOG_BH_OURS, X));
      sbhOn = X > 19.5;
      if (X < 10.9) text = F.accelForever ? 'Distant galaxies recede faster and faster' : 'Expansion continues, slowing down';
      else if (X < 12.2) text = F.accelForever ? 'Other galaxies redshift out of sight. Our group stays bound.' : 'Dark energy fades in this extrapolation: no event horizon';
      else if (X < 13.3) text = 'Stars age and gas runs low. Only our own group is left in view.';
      else if (X < 14.4) text = 'Star formation ends, the last red dwarfs fade (~10¹⁴ yr)';
      else if (X < 18.8) text = 'Degenerate era: white dwarfs and neutron stars cool';
      else if (X < 21) text = 'Close encounters eject stars: the galaxy evaporates (~10¹⁹–10²⁰ yr)';
      else if (X < 38.5) text = 'Degenerate era: cold remnants and black holes';
      else if (X < 41) text = 'If protons decay (hypothetical), remnants dissolve (~10⁴⁰ yr)';
      else if (X < LOG_BH_STELLAR - 1.5) text = 'Black hole era: Hawking radiation slowly drains them';
      else if (X < LOG_BH_STELLAR + 1.5) text = 'Stellar-mass black holes evaporate';
      else if (X < LOG_BH_OURS + 0.3) text = 'Black hole era: only the big ones are left';
      else if (X < LOG_BH_BIG) text = 'The largest black holes evaporate (~10¹⁰⁰ yr)';
      else text = 'Dark era: cold, dilute, nearly empty. Heat death.';
      if (X > LOG_BH_OURS - 0.15 && X < LOG_BH_OURS + 0.05) flashA = 0.15;
    } else if (F.fate === 'rip') {
      const tau = tauYr;
      const f = (L: number) => (tau < L ? Math.pow(L / tau, pExp) : 1);
      nbFactor = f(LEAD_CLUSTER * leadScale);
      starSpread = f(LEAD_MW * leadScale);
      const lMW = LEAD_MW * leadScale;
      solarOn = tau < lMW / 30;
      plFactor = f(LEAD_SS * leadScale);
      earthF = tau < LEAD_EARTH * leadScale ? f(LEAD_EARTH * leadScale) : 0;
      const lAtom = LEAD_ATOM * leadScale;
      const lx = Math.log10(lAtom);
      flashA = smooth(lx + 1.2, lx, X);
      if (X < lx - 0.25) {
        flashA = smooth(lx - 0.25, lx - 0.7, X);
        flashBlack = true;
      }
      if (flashBlack) atomsGone = true;
      if (tau > LEAD_CLUSTER * leadScale * 3) text = 'Phantom dark energy: the expansion rate itself keeps growing';
      else if (tau > lMW) text = 'Galaxy clusters come apart';
      else if (!solarOn) text = 'The Milky Way is torn apart';
      else if (tau > LEAD_SS * leadScale) text = 'Zoom to the Solar System: still bound, for now';
      else if (tau > LEAD_EARTH * leadScale) text = 'The Solar System is unbound: planets fly off';
      else if (tau > lAtom * 30) text = 'The Earth explodes';
      else if (!flashBlack) text = 'Atoms are torn apart';
      else text = 'Big Rip: a and H become infinite';
    } else if (F.fate === 'crunch') {
      const T = T_CMB / a;
      const heat = smooth(600, 4500, T);
      blackbody(Math.min(T, 6000), tmpC);
      skyC.copy(bgColor).lerp(tmpC.multiplyScalar(0.3 + 0.25 * smooth(4500, 1e6, T)), heat);
      scene.background = skyC;
      const merge = 1 - smooth(0.05, 0.004, a);
      nbFactor = Math.min(1, a / 0.05) * merge + (1 - merge) * 0.02;
      starJitter = smooth(0.03, 0.002, a);
      blackbody(Math.max(T, 3000), tmpC2);
      starCold.lerp(tmpC2, smooth(1000, 8000, T));
      starBright = 1 + 0.6 * heat;
      const lEnd = X_CRUNCH_MIN + 0.4;
      if (X < lEnd) flashA = smooth(lEnd, X_CRUNCH_MIN + 0.05, X);
      const tNowRel = F.tEnd - tauYr / 1e9;
      if (tNowRel < F.tEnd / 2) text = 'Expansion slows under the pull of gravity';
      else if (a > 0.05) text = 'Expansion has reversed: galaxies approach, light is blueshifted';
      else if (T < 3000) text = 'Galaxies merge. The sky warms up.';
      else if (T < 5800) text = 'Sky above 3000 K: atoms are ionised';
      else if (T < 1e10) text = 'Sky hotter than the surface of the Sun: stars boil away';
      else text = 'Nuclei break apart. Big Crunch.';
    }

    // Neighbours
    for (let i = 0; i < NC; i++) {
      const rr = nbBase[i * 4] * Math.pow(nbFactor, 0.8 + 0.4 * starRnd[i]);
      const ang = nbBase[i * 4 + 1] + nbSpin * nbBase[i * 4 + 3];
      nbPos[i * 3] = rr * Math.cos(ang);
      nbPos[i * 3 + 1] = nbBase[i * 4 + 2] * Math.min(1, nbFactor);
      nbPos[i * 3 + 2] = rr * Math.sin(ang);
      const b = nbBright * (rr > 30 ? 0 : 1);
      nbCol[i * 3] = starCold.r * b;
      nbCol[i * 3 + 1] = starCold.g * b;
      nbCol[i * 3 + 2] = starCold.b * b;
    }
    (nbGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (nbGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // Home galaxy stars
    const lnSpread = Math.log(starSpread);
    for (let i = 0; i < NS; i++) {
      const rf = starRnd[i];
      const k = F.fate === 'rip' ? Math.exp(lnSpread * (0.7 + 0.6 * rf)) : F.fate === 'freeze' ? 1 + (starSpread - 1) * (0.2 + 1.6 * rf) : 1;
      const j = starJitter * (rf - 0.5) * 0.5;
      starPos[i * 3] = starBase[i * 3] * k + j;
      starPos[i * 3 + 1] = starBase[i * 3 + 1] * k + j * 2 * (starHue[i] - 0.5);
      starPos[i * 3 + 2] = starBase[i * 3 + 2] * k - j;
      let b = starBright * (0.55 + 0.45 * starHue[i]);
      if (F.fate === 'freeze' && k > 3) b *= Math.max(0, 1 - (k - 3) / 5);
      if (F.fate === 'rip' && k > 60) b = 0;
      starCol[i * 3] = starCold.r * b;
      starCol[i * 3 + 1] = starCold.g * b;
      starCol[i * 3 + 2] = starCold.b * b;
    }
    (starGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (starGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    home.visible = !(F.fate === 'rip' && solarOn && tauYr < (LEAD_MW * leadScale) / 1e3);
    homeLabel.visible = home.visible && starSpread < 2 && F.fate !== 'crunch';

    // Black holes (freeze)
    bhCore.visible = bhVis > 0.02;
    bhCore.scale.setScalar(0.6 + 0.4 * bhVis);
    bhRing.visible = bhVis > 0.02;
    bhRing.material.opacity = bhVis;
    sbh.visible = sbhOn;
    if (sbhOn) {
      for (let i = 0; i < NBH; i++) {
        const left = sbhLog[i] - X;
        const b = left > 0 ? 0.35 : left > -0.3 ? 1.5 : 0;
        sbhCol[i * 3] = 0.65 * b;
        sbhCol[i * 3 + 1] = 0.55 * b;
        sbhCol[i * 3 + 2] = 1 * b;
      }
      (sbhGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

    // Solar System (rip)
    solar.visible = solarOn;
    if (solarOn) {
      const fadeIn = smooth(Math.log10((LEAD_MW * leadScale) / 30), Math.log10((LEAD_MW * leadScale) / 300), X);
      (sun.material as THREE.MeshBasicMaterial).opacity = fadeIn;
      sunGlow.material.opacity = fadeIn * (flashBlack ? 0 : 1);
      for (let i = 0; i < 8; i++) {
        // Log-compressed, like the galaxy distances, so the flight stays on screen for a while.
        const rr = PL_R[i] * (1 + 0.1 * Math.log(plFactor) * (0.8 + 0.08 * i));
        planets[i].position.set(rr * Math.cos(plAng[i]), 0, rr * Math.sin(plAng[i]));
        (planets[i].material as THREE.MeshStandardMaterial).opacity = fadeIn * (rr > 12 ? 0 : 1);
        rings[i].scale.setScalar(rr);
        (rings[i].material as THREE.LineBasicMaterial).opacity = 0.6 * fadeIn * Math.max(0, 1 - (plFactor - 1) * 2);
      }
      const earth = planets[2];
      earth.visible = earthF === 0;
      earthLabel.visible = earthF === 0 && plFactor < 3;
      earthLabel.position.set(earth.position.x, 0.06, earth.position.z);
      debris.visible = earthF > 0;
      if (earthF > 0) {
        const sc = 0.02 * (1 + 1.2 * Math.log(earthF));
        for (let i = 0; i < ND; i++) {
          debPos[i * 3] = earth.position.x + debDir[i * 3] * sc;
          debPos[i * 3 + 1] = debDir[i * 3 + 1] * sc;
          debPos[i * 3 + 2] = earth.position.z + debDir[i * 3 + 2] * sc;
        }
        (debGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (debris.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - Math.log(earthF) / 60);
      }
      solarLabel.visible = plFactor < 1.5;
    }
    const wantSolar = solarOn;
    if (wantSolar !== camSolar) {
      camSolar = wantSolar;
      stage.flyTo(camSolar ? CAM_SOLAR : CAM_HOME, [0, 0, 0], 1.4);
    }

    flash.style.background = flashBlack ? '#000000' : F.fate === 'crunch' ? '#fff4e0' : '#ffffff';
    flash.style.opacity = flashA.toFixed(3);
    setCaption(text);
  }

  // ------------------------------------------------------------ legend
  let legendKey = '';
  function updateLegend(): void {
    const key = `${F.fate}|${F.accelForever}|${preset}`;
    if (key === legendKey) return;
    legendKey = key;
    const Z_BAR = '<div style="height:6px;border-radius:3px;margin:4px 0 2px;background:linear-gradient(90deg,#9ed6ff,#fff2c7,#f5b542,#ff6b6b,#bf334c,#731f33)"></div><div style="display:flex;justify-content:space-between;color:#8391ab"><span>z=0</span><span>1</span><span>2</span><span>5</span><span>20</span></div>';
    const head: Record<string, string> = {
      freeze: F.accelForever ? 'Big Freeze' : 'Freeze, slowing down',
      rip: 'Big Rip',
      crunch: 'Big Crunch',
      nobang: 'No Big Bang',
    };
    const body: Record<string, string> = {
      freeze: F.accelForever
        ? 'Galaxy spacing follows a(t). Light from distant galaxies reddens and fades. Our bound group stays together while its stars die.'
        : 'Dark energy fades in this extrapolation, so there is no event horizon. Speculative.',
      rip: 'Phantom dark energy (w &lt; −1) grows denser as space expands. The event horizon shrinks and tears bound systems apart, biggest first.',
      crunch: 'Expansion reverses. Galaxies fall together, light is blueshifted, and the sky heats up.',
      nobang: '',
    };
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${head[F.fate]}</div><div>${body[F.fate]}</div>
<div style="margin-top:4px">Colour = redshift of the light we receive</div>${Z_BAR}
<div style="margin-top:4px">Distances are log-compressed. Bound objects not to scale.</div>`;
  }

  // ------------------------------------------------------------ controls
  const ui = new Panel(panel);
  ui.section('Fate of the universe');
  const presetCtl = ui.select<Preset>({
    key: 'preset', label: 'Preset', value: preset,
    options: [
      { value: 'freeze', label: 'Freeze' },
      { value: 'rip', label: 'Rip' },
      { value: 'crunch', label: 'Crunch' },
      { value: 'desi', label: 'DESI-like' },
      { value: 'custom', label: 'Custom' },
    ],
    onChange: (v) => {
      preset = v;
      if (v === 'custom') return;
      const p = PRESETS[v];
      OmS = p.Om;
      Ol = p.Ol;
      w0 = p.w0;
      wa = p.wa;
      advanced = v === 'desi';
      omCtl.set(OmS, false);
      olCtl.set(Ol, false);
      w0Ctl.set(w0, false);
      waCtl.set(wa, false);
      advCtl.set(advanced, false);
      waCtl.el.style.display = advanced ? '' : 'none';
      s = 0;
      timeCtl.set(0, false);
      playing = true;
      playBtn.textContent = 'Pause';
      rebuild();
    },
  });
  const toCustom = () => {
    if (preset !== 'custom') {
      preset = 'custom';
      presetCtl.set('custom', false);
    }
    modelDirty = true;
  };
  const w0Ctl = ui.slider({
    key: 'w0', label: 'Dark energy w (p = wρc²)', min: -2, max: 0, step: 0.01, value: w0,
    format: (v) => v.toFixed(2),
    onInput: (v) => { w0 = Math.round(v * 100) / 100; wTouched = true; toCustom(); },
  });
  const omCtl = ui.slider({ key: 'Om', label: 'Matter Ω_m', min: 0.05, max: 3, step: 0.005, value: OmS, format: (v) => v.toFixed(3), onInput: (v) => { OmS = v; toCustom(); } });
  const olCtl = ui.slider({ key: 'Ol', label: 'Dark energy Ω_Λ', min: -1, max: 1.5, step: 0.005, value: Ol, format: (v) => v.toFixed(3), onInput: (v) => { Ol = Math.round(v * 1000) / 1000; toCustom(); } });
  const advCtl = ui.toggle({
    key: 'adv', label: 'Advanced: evolving w = w₀ + w_a(1 − a)', value: advanced,
    onChange: (v) => { advanced = v; waCtl.el.style.display = v ? '' : 'none'; toCustom(); },
  });
  const waCtl = ui.slider({ key: 'wa', label: 'w_a (speculative)', min: -2, max: 1, step: 0.01, value: wa, format: (v) => v.toFixed(2), onInput: (v) => { wa = Math.round(v * 100) / 100; toCustom(); } });
  waCtl.el.style.display = 'none';

  ui.section('Time (log scale)');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { playing = !playing; userTime = true; if (playing && s >= 1) s = 0; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Now', onClick: () => { s = 0; timeCtl.set(0, false); userTime = true; dirty = true; } },
    { label: 'The end', onClick: () => { s = 1; timeCtl.set(1, false); userTime = true; dirty = true; } },
  ]);
  const timeCtl: ReturnType<Panel['slider']> = ui.slider({
    key: 'time', label: 'Time', min: 0, max: 1, step: 0.0005, value: 0,
    format: (v) => (F.fate === 'nobang' ? '—' : ending() ? `${fmtYears(Math.pow(10, xOfS(v)))} left` : fmtYears(Math.pow(10, xOfS(v)))),
    onInput: (v) => { s = v; userTime = true; playing = false; playBtn.textContent = 'Play'; dirty = true; },
  });

  timeCtlRef = timeCtl;

  ui.section('Live readouts');
  const rFate = ui.readout('fate', 'fate');
  const rTime = ui.readout('t', 'time');
  const rA = ui.readout('a', 'scale factor a');
  const rH = ui.readout('H', 'Hubble rate H', 'km/s/Mpc');
  const rQ = ui.readout('q', 'deceleration q');
  const rT = ui.readout('T', 'radiation temp.');
  const rEnd = ui.readout('tend', 'time to end');
  const rFormula = ui.readout('ripFormula', 'CKW estimate');
  const rCheck = ui.readout('check', 'accuracy check');
  ui.legend([
    { color: PRESETS.freeze.color, label: 'Freeze (ΛCDM)' },
    { color: PRESETS.rip.color, label: 'Rip' },
    { color: PRESETS.crunch.color, label: 'Crunch' },
    { color: PRESETS.desi.color, label: 'DESI-like' },
    { color: '#ffffff', label: 'this model' },
  ]);
  ui.note('Presets: Freeze uses Planck 2018 values. DESI-like uses w₀ = −0.75, w_a = −0.86, one 2025 DESI fit. Its future is an extrapolation.');

  function updateReadouts(): void {
    const names: Record<string, string> = { freeze: F.accelForever ? 'Big Freeze' : 'Freeze (decelerating)', rip: 'Big Rip', crunch: 'Big Crunch', nobang: 'no Big Bang' };
    rFate(names[F.fate]);
    if (F.fate === 'nobang') {
      rTime('—'); rA('—'); rH('—'); rQ('—'); rT('—'); rEnd('—'); rFormula('—'); rCheck('—');
      return;
    }
    rTime(ending() ? `${fmtYears(tauYr)} left` : fmtYears(tYr));
    const log10a = N / LN10;
    rA(Math.abs(log10a) < 3 ? Math.exp(N).toFixed(3) : `10^${log10a < 1e6 ? log10a.toFixed(1) : log10a.toExponential(1)}`);
    const E = EofN(m, Math.min(N, 1e6));
    rH(Number.isFinite(E) ? (H0 * E < 1e5 ? (H0 * E).toFixed(1) : (H0 * E).toExponential(1)) : '∞');
    const q = Math.abs(N) < 5 ? decel(m, Math.exp(N)) : -1 - slopeLnH(m, N);
    rQ(`${q.toFixed(2)} ${q < 0 ? '(speeding up)' : '(slowing)'}`);
    const log10T = Math.log10(T_CMB) - log10a;
    rT(log10T > -3 && log10T < 5 ? `${Math.pow(10, log10T).toPrecision(3)} K` : `10^${log10T > -1e6 ? log10T.toFixed(0) : log10T.toExponential(1)} K`);
    rEnd(ending() ? `${(F.tEnd - F.t0).toFixed(2)} Gyr` : 'never');
    rFormula(F.fate === 'rip' && (!advanced || wa === 0) ? `${ripTimeFormula(H0, w0, OmS).toFixed(2)} Gyr` : '—');
    rCheck(Number.isFinite(rkEnd) ? `end ${(Math.abs(rkEnd - (F.tEnd - F.t0)) / (F.tEnd - F.t0)).toExponential(0)}` : `drift ${orbitNow.maxConstraint.toExponential(0)}`);
  }

  // ------------------------------------------------------------ frame loop
  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (modelDirty) {
      modelDirty = false;
      rebuild();
    }
    if (playing && F.fate !== 'nobang') {
      const x = xOfS(s);
      let rate: number; // decades per second
      if (ending()) rate = x > 8.5 ? 0.45 : F.fate === 'rip' && x < Math.log10(LEAD_MW * leadScale) && x > Math.log10(LEAD_MW * leadScale) - 3 ? 0.6 : 1.1;
      else rate = x < 12.3 ? 0.32 : x < 21 ? 0.9 : 2.2;
      const dxds = spanX() * gam() * Math.pow(Math.max(s, 0.04), gam() - 1);
      s = Math.min(1, s + (rate * dt) / dxds);
      timeCtl.set(s, false);
      if (s >= 1) {
        playing = false;
        playBtn.textContent = 'Play';
      }
      dirty = true;
    }
    // Slow visual motion: neighbour orbits, disk spin, planets.
    disk.rotation.y += dt * 0.12;
    nbSpin += dt;
    for (let i = 0; i < 8; i++) plAng[i] += dt * 0.9 * Math.pow(0.3 / PL_R[i], 1.5);
    if (dirty) {
      dirty = false;
      updateMoment();
      updateLegend();
      drawRuler();
      drawPlot();
    } else {
      // Neighbours and planets still need their orbital motion.
      updateMotionOnly();
    }
    readoutTimer += dt;
    if (readoutTimer > 0.1) {
      readoutTimer = 0;
      updateReadouts();
    }
  });

  function updateMotionOnly(): void {
    if (F.fate === 'nobang') return;
    // Cheap path: re-run neighbours and planets with the current story (positions only).
    for (let i = 0; i < NC; i++) {
      const rr = Math.hypot(nbPos[i * 3], nbPos[i * 3 + 2]);
      const ang = nbBase[i * 4 + 1] + nbSpin * nbBase[i * 4 + 3];
      nbPos[i * 3] = rr * Math.cos(ang);
      nbPos[i * 3 + 2] = rr * Math.sin(ang);
    }
    (nbGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (solar.visible) {
      for (let i = 0; i < 8; i++) {
        const rr = Math.hypot(planets[i].position.x, planets[i].position.z);
        planets[i].position.set(rr * Math.cos(plAng[i]), 0, rr * Math.sin(plAng[i]));
      }
      earthLabel.position.set(planets[2].position.x, 0.06, planets[2].position.z);
    }
  }

  rebuild();
  sizeRuler();

  return {
    state: () => ({
      fate: F.fate,
      w0,
      wa: advanced ? wa : 0,
      Om: OmS,
      Ol,
      tYr,
      tauYr: Number.isFinite(tauYr) ? tauYr : -1,
      ripGyr: F.fate === 'rip' ? F.tEnd - F.t0 : 0,
      userTime,
      wTouched,
      sawRip,
      atomsGone: atomsGone && F.fate === 'rip',
      preset,
    }),
    dispose: () => {
      ro.disconnect();
      legend.remove();
      flash.remove();
      captionEl.remove();
      warn.remove();
      plot.remove();
      rulerWrap.remove();
      glowTex.dispose();
      ringTex.dispose();
      ringGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'fate-of-universe',
  number: 84,
  title: 'The Fate of the Universe',
  domain: 'cosmology',
  level: 1,
  status: 'live',
  tagline: 'Freeze, rip or crunch, depending on what dark energy does.',
  content,
  mount,
};

export default topic;
