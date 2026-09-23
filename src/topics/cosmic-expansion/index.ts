import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  C_MPC_GYR, MPC_PER_GLY, accelerationRedshift, atTime, buildHistory, decelFromHistory, h0Gyr, hubbleDistance,
  observedZ, omegaK, omegaR, timeAtA, timeAtEta, transverse, turnaroundA, wavelengthRGB,
  type Cosmo, type History,
} from './physics.ts';

type Preset = 'planck' | 'eds' | 'milne' | 'closed' | 'lambda' | 'custom';
type View = 'bread' | 'balloon';

const PRESETS: Record<Exclude<Preset, 'custom'>, { Om: number; Ol: number; label: string; color: string }> = {
  planck: { Om: 0.315, Ol: 0.685, label: 'Planck', color: '#f5b642' },
  eds: { Om: 1, Ol: 0, label: 'EdS', color: '#4fd1e8' },
  milne: { Om: 0, Ol: 0, label: 'Empty', color: '#a78bfa' },
  closed: { Om: 3, Ol: 0, label: 'Closed', color: '#ff6b6b' },
  lambda: { Om: 0.05, Ol: 0.95, label: 'Λ-dom', color: '#5ee39a' },
};

const N_SIDE = 7;
const SPACING = 1400; // comoving Mpc between lattice sites
const NG = N_SIDE ** 3;
const DISP = 1 / 1000; // scene units per Mpc at a = 1
const ZP = 0.55; // view zoom: display = proper × a^(−ZP)
const zoom = (a: number) => Math.pow(a, -ZP);
const MAX_PH = 6;
const NP = 90; // points per photon wiggle
const LAMBDA0 = 0.2; // displayed wavelength at emission (scene units)
const EMIT_NM = 410;
const N_BALLOON = 170;
const RATE = 0.042; // slider units per second while playing
const CAM_BREAD: [number, number, number] = [7.2, 5.2, 11.5];
const CAM_BALLOON: [number, number, number] = [0, 3.0, 9.5];
const TWO_PI = Math.PI * 2;

function glowTexture(ring = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (ring) {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 32, 26, 0, TWO_PI);
    g.stroke();
  } else {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Redshift colour ramp in log(1+z): pale blue, white-gold, amber, red, deep red.
const Z_STOPS: [number, number, number, number][] = [
  [0, 0.62, 0.84, 1.0],
  [0.4, 1.0, 0.95, 0.78],
  [1, 0.96, 0.71, 0.26],
  [2.2, 1.0, 0.42, 0.42],
  [5, 0.75, 0.2, 0.3],
  [20, 0.45, 0.12, 0.2],
];
function zColor(z: number, out: THREE.Color): THREE.Color {
  if (!Number.isFinite(z)) return out.setRGB(0.13, 0.16, 0.24);
  if (z <= 0) return out.setRGB(Z_STOPS[0][1], Z_STOPS[0][2], Z_STOPS[0][3]);
  const x = Math.log1p(z);
  for (let i = 1; i < Z_STOPS.length; i++) {
    const x1 = Math.log1p(Z_STOPS[i][0]);
    if (x <= x1) {
      const x0 = Math.log1p(Z_STOPS[i - 1][0]);
      const f = (x - x0) / (x1 - x0);
      const a = Z_STOPS[i - 1];
      const b = Z_STOPS[i];
      return out.setRGB(a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3]));
    }
  }
  const l = Z_STOPS[Z_STOPS.length - 1];
  return out.setRGB(l[1], l[2], l[3]);
}

function unitCircle(n: number, plane: 'xz' | 'xy'): THREE.BufferGeometry {
  const p = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TWO_PI;
    p[i * 3] = Math.cos(t);
    if (plane === 'xz') p[i * 3 + 2] = Math.sin(t);
    else p[i * 3 + 1] = Math.sin(t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return g;
}

interface Photon {
  src: number;
  tE: number;
  chi0: number;
  aE: number;
  dir: THREE.Vector3;
  perp: THREE.Vector3;
  phi: number; // balloon meridian
  arrivedT: number;
  zArr: number;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_BREAD, target: [0, -0.3, 0], fov: 45, near: 0.02, far: 400 });
  const { scene, camera, renderer } = stage;

  // ------------------------------------------------------------ state
  const cosmo: Cosmo = { H0: 67.4, Om: 0.315, Ol: 0.685, Or: omegaR(67.4) };
  let preset: Preset = 'planck';
  let view: View = 'bread';
  let hist: History = buildHistory(cosmo);
  let fate = hist.fate;
  let noBang = false;
  let tStart = 0;
  let tEnd = 1;
  let s = 0; // slider position 0..1
  let t = 0;
  let a = 1;
  let adot = 0;
  let eta = 0;
  let playing = true;
  let stopAtNow = true;
  let cosmoTouched = false;
  let timeTouched = false;
  let selTouched = false;
  let showLines = true;
  let showArrows = true;
  let showShells = true;
  let home = 0;
  let selected = 0;
  let photonsEmitted = 0;
  let photonsArrived = 0;
  let lastZArr = NaN;
  const photons: Photon[] = [];

  // Galaxy comoving positions (Mpc), a jittered cubic lattice. Deterministic.
  const gpos = new Float64Array(NG * 3);
  {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    let k = 0;
    const h = (N_SIDE - 1) / 2;
    for (let i = 0; i < N_SIDE; i++)
      for (let j = 0; j < N_SIDE; j++)
        for (let l = 0; l < N_SIDE; l++) {
          const jit = i === h && j === h && l === h ? 0 : 0.2;
          gpos[k * 3] = (i - h + jit * rnd()) * SPACING;
          gpos[k * 3 + 1] = (j - h + jit * rnd()) * SPACING;
          gpos[k * 3 + 2] = (l - h + jit * rnd()) * SPACING;
          k++;
        }
  }
  const centreIdx = (NG - 1) / 2;
  home = centreIdx;
  const chiOf = (i: number) => {
    const dx = gpos[i * 3] - gpos[home * 3];
    const dy = gpos[i * 3 + 1] - gpos[home * 3 + 1];
    const dz = gpos[i * 3 + 2] - gpos[home * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  // Default selection: a near neighbour, inside the Hubble radius today.
  {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < NG; i++) {
      if (i === home) continue;
      const d = Math.abs(chiOf(i) - 2000) + (gpos[i * 3 + 2] < 0 ? 800 : 0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    selected = best;
  }

  // ------------------------------------------------------------ scene: raisin bread
  const glowTex = glowTexture();
  const ringTex = glowTexture(true);
  const bread = new THREE.Group();
  scene.add(bread);

  const galPos = new Float32Array(NG * 3);
  const galCol = new Float32Array(NG * 3);
  const galGeo = new THREE.BufferGeometry();
  galGeo.setAttribute('position', new THREE.BufferAttribute(galPos, 3));
  galGeo.setAttribute('color', new THREE.BufferAttribute(galCol, 3));
  const galaxies = new THREE.Points(
    galGeo,
    new THREE.PointsMaterial({ size: 0.34, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
  );
  galaxies.frustumCulled = false;
  bread.add(galaxies);

  const linePos = new Float32Array(NG * 6);
  const lineCol = new Float32Array(NG * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.13, depthWrite: false }));
  lines.frustumCulled = false;
  bread.add(lines);

  const arrPos = new Float32Array(NG * 6);
  const arrCol = new Float32Array(NG * 6);
  const arrGeo = new THREE.BufferGeometry();
  arrGeo.setAttribute('position', new THREE.BufferAttribute(arrPos, 3));
  arrGeo.setAttribute('color', new THREE.BufferAttribute(arrCol, 3));
  const arrows = new THREE.LineSegments(arrGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false }));
  arrows.frustumCulled = false;
  bread.add(arrows);

  // Selected-galaxy line drawn brighter
  const selLineGeo = new THREE.BufferGeometry();
  const selLinePos = new Float32Array(6);
  selLineGeo.setAttribute('position', new THREE.BufferAttribute(selLinePos, 3));
  const selLine = new THREE.Line(selLineGeo, new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.85 }));
  selLine.frustumCulled = false;
  bread.add(selLine);

  const homeMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: PALETTE.amber, depthWrite: false, transparent: true }));
  homeMark.scale.setScalar(0.55);
  bread.add(homeMark);
  const homeCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  homeCore.scale.setScalar(0.5);
  bread.add(homeCore);
  const selMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: PALETTE.white, depthWrite: false, transparent: true }));
  selMark.scale.setScalar(0.45);
  bread.add(selMark);
  stage.label('home', [0, 0.45, 0], '', bread);
  const selLabel = stage.label('', [0, 0, 0], '', bread);
  const arriveLabel = stage.label('', [0, -0.5, 0], 'big', bread);
  arriveLabel.visible = false;

  // Hubble sphere and particle horizon: faint shells plus two great circles each.
  const mkShell = (color: number, opacity: number) => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.BackSide }));
    g.add(shell);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
    g.add(new THREE.Line(unitCircle(128, 'xz'), mat));
    g.add(new THREE.Line(unitCircle(128, 'xy'), mat));
    bread.add(g);
    return g;
  };
  const hubbleShell = mkShell(PALETTE.cyan, 0.07);
  const horizonShell = mkShell(PALETTE.violet, 0.035);
  const hubbleLabel = stage.label('Hubble radius: v = c', [0, 1, 0], 'muted', bread);
  hubbleLabel.element.style.color = css(PALETTE.cyan);
  const horizonLabel = stage.label('particle horizon', [0, 1, 0], 'muted', bread);
  horizonLabel.element.style.color = css(PALETTE.violet);

  // Scale bar (true proper length)
  const barGeo = new THREE.BufferGeometry();
  const barPos = new Float32Array(18);
  barGeo.setAttribute('position', new THREE.BufferAttribute(barPos, 3));
  const bar = new THREE.LineSegments(barGeo, new THREE.LineBasicMaterial({ color: 0x9aa6bd }));
  bar.frustumCulled = false;
  bread.add(bar);
  const barLabel = stage.label('', [0, 0, 0], 'muted', bread);
  const eraLabel = stage.label('', [0, 0, 0], 'big', bread);
  eraLabel.element.style.whiteSpace = 'normal';
  eraLabel.element.style.maxWidth = '260px';
  eraLabel.element.style.textAlign = 'center';

  // Photons: pre-allocated wiggle lines and labels.
  const phLines: THREE.Line[] = [];
  const phPos: Float32Array[] = [];
  const phLabels = [] as ReturnType<typeof stage.label>[];
  const phHeads: THREE.Sprite[] = [];
  const bphLines: THREE.Line[] = [];
  const bphPos: Float32Array[] = [];
  for (let k = 0; k < MAX_PH; k++) {
    const p = new Float32Array(NP * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    l.frustumCulled = false;
    l.visible = false;
    l.renderOrder = 3;
    bread.add(l);
    phLines.push(l);
    phPos.push(p);
    const lab = stage.label('', [0, 0, 0], '', bread);
    lab.visible = false;
    phLabels.push(lab);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    head.scale.setScalar(0.5);
    head.visible = false;
    bread.add(head);
    phHeads.push(head);
  }

  // ------------------------------------------------------------ scene: balloon
  const balloon = new THREE.Group();
  balloon.visible = false;
  scene.add(balloon);
  const bScale = new THREE.Group();
  balloon.add(bScale);
  bScale.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshStandardMaterial({ color: 0x1a2744, roughness: 0.85, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })));
  {
    const seg: number[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const th = (lat * Math.PI) / 180;
      for (let j = 0; j < 96; j++) {
        const p0 = (j / 96) * TWO_PI;
        const p1 = ((j + 1) / 96) * TWO_PI;
        seg.push(Math.cos(th) * Math.cos(p0), Math.sin(th), Math.cos(th) * Math.sin(p0), Math.cos(th) * Math.cos(p1), Math.sin(th), Math.cos(th) * Math.sin(p1));
      }
    }
    for (let m = 0; m < 12; m++) {
      const ph = (m / 12) * TWO_PI;
      for (let j = 0; j < 48; j++) {
        const t0 = (j / 48) * Math.PI;
        const t1 = ((j + 1) / 48) * Math.PI;
        seg.push(Math.sin(t0) * Math.cos(ph), Math.cos(t0), Math.sin(t0) * Math.sin(ph), Math.sin(t1) * Math.cos(ph), Math.cos(t1), Math.sin(t1) * Math.sin(ph));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    bScale.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a4d78, transparent: true, opacity: 0.6, depthWrite: false })));
  }
  // Balloon galaxies: Fibonacci points; the first sits at the north pole as home.
  const bUnit = new Float32Array(N_BALLOON * 3);
  const bTheta = new Float32Array(N_BALLOON);
  for (let i = 0; i < N_BALLOON; i++) {
    const y = 1 - (2 * i) / (N_BALLOON - 1);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const ph = i * 2.399963;
    bUnit[i * 3] = r * Math.cos(ph) * 1.004;
    bUnit[i * 3 + 1] = y * 1.004;
    bUnit[i * 3 + 2] = r * Math.sin(ph) * 1.004;
    bTheta[i] = Math.acos(Math.max(-1, Math.min(1, y)));
  }
  const bCol = new Float32Array(N_BALLOON * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bUnit, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const bDots = new THREE.Points(bGeo, new THREE.PointsMaterial({ size: 0.3, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  bScale.add(bDots);
  const bHome = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: PALETTE.amber, depthWrite: false, transparent: true }));
  bHome.scale.setScalar(0.5);
  balloon.add(bHome);
  const bHomeLabel = stage.label('home', [0, 0, 0], '', balloon);
  const bTitle = stage.label('Analogy only: space is the 2D rubber surface', [0, 0, 0], 'big', balloon);
  const bSub = stage.label('', [0, 0, 0], 'muted', balloon);
  for (let k = 0; k < MAX_PH; k++) {
    const p = new Float32Array(NP * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    l.frustumCulled = false;
    l.visible = false;
    balloon.add(l);
    bphLines.push(l);
    bphPos.push(p);
  }

  // ------------------------------------------------------------ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const Z_BAR = '<div style="height:6px;border-radius:3px;margin:4px 0 2px;background:linear-gradient(90deg,#9ed6ff,#fff2c7,#f5b542,#ff6b6b,#bf334c,#731f33)"></div><div style="display:flex;justify-content:space-between;color:#8391ab"><span>z=0</span><span>1</span><span>2</span><span>5</span><span>20</span></div>';
  const LEGEND_BREAD = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Raisin bread</div>
<div>Galaxies sit still in comoving space. Every gap grows with a(t).</div>
<div style="margin-top:4px">Colour = redshift of the light home sees now</div>${Z_BAR}
<div style="margin-top:4px">Arrows (home's plane): v = Hd. <span style="color:${css(PALETTE.cyan)}">Cyan</span> below c, <span style="color:${css(PALETTE.rose)}">rose</span> faster than light.</div>
<div>Dark dots: beyond the particle horizon, not yet seen.</div>`;
  const LEGEND_BALLOON = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Balloon (analogy)</div>
<div>A closed universe with one dimension removed. Only the surface is space.</div>
<div style="margin-top:4px">Dots stay put on the rubber. Only the gaps grow. Light crawls along the surface and stretches with it.</div>${Z_BAR}`;

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
  const PX0 = 56;
  const PX1 = PW - 16;
  const PY0 = 74;
  const PY1 = PH - 44;
  const XL = -25;
  const XH = 45;
  const YH = 3;
  const xOf = (x: number) => PX0 + ((x - XL) / (XH - XL)) * (PX1 - PX0);
  const yOf = (y: number) => PY1 - (y / YH) * (PY1 - PY0);

  const warn = document.createElement('div');
  Object.assign(warn.style, {
    position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', zIndex: '3', pointerEvents: 'none', display: 'none',
    background: 'rgba(40,10,16,0.9)', border: '1px solid #ff6b6b', borderRadius: '10px', padding: '10px 14px', maxWidth: '320px',
    font: '12px/1.5 JetBrains Mono, monospace', color: '#ffd0d0', textAlign: 'center',
  } as CSSStyleDeclaration);
  warn.textContent = 'No Big Bang: with this much Ω_Λ and this little matter, the past universe would have bounced at a finite size. Lower Ω_Λ or raise Ω_m.';
  viewport.appendChild(warn);

  // ------------------------------------------------------------ plot
  let presetHists: { h: History; color: string; label: string }[] = [];
  function buildPresetHists(): void {
    presetHists = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => {
      const p = PRESETS[k];
      const c: Cosmo = { H0: cosmo.H0, Om: p.Om, Ol: p.Ol - (k === 'planck' || k === 'lambda' ? omegaR(cosmo.H0) : 0), Or: omegaR(cosmo.H0) };
      return { h: buildHistory(c, { aEnd: 4 }), color: p.color, label: p.label };
    });
  }

  function curve(c: CanvasRenderingContext2D, h: History, color: string, w: number, alpha: number): void {
    if (h.n < 2 || !Number.isFinite(h.t0)) return;
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    let started = false;
    const step = Math.max(1, Math.floor(h.n / 500));
    // Begin at the Big Bang: a = 0 at t = 0.
    c.moveTo(xOf(-h.t0), yOf(0));
    started = true;
    for (let i = 0; i < h.n; i += step) {
      const x = h.t[i] - h.t0;
      if (x > XH + 1) break;
      c.lineTo(xOf(x), yOf(Math.min(YH + 0.2, h.a[i])));
    }
    if (h.fate === 'crunch' && h.t[h.n - 1] - h.t0 < XH) c.lineTo(xOf(h.t[h.n - 1] - h.t0), yOf(0));
    if (started) c.stroke();
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
    c.fillText('x: Gyr from now', PW - 170, 30);
    c.font = '18px JetBrains Mono, monospace';
    c.strokeStyle = '#1a2336';
    c.lineWidth = 1.5;
    for (let x = -20; x <= 40; x += 10) {
      c.beginPath();
      c.moveTo(xOf(x), PY0);
      c.lineTo(xOf(x), PY1);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(`${x > 0 ? '+' : ''}${x}`, xOf(x) - (x === 0 ? 6 : 16), PH - 18);
    }
    for (let y = 0; y <= YH; y++) {
      c.beginPath();
      c.moveTo(PX0, yOf(y));
      c.lineTo(PX1, yOf(y));
      c.strokeStyle = y === 1 ? '#2c3852' : '#1a2336';
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(String(y), PX0 - 22, yOf(y) + 6);
    }
    c.save();
    c.beginPath();
    c.rect(PX0, PY0 - 6, PX1 - PX0, PY1 - PY0 + 6);
    c.clip();
    for (const p of presetHists) curve(c, p.h, p.color, 2, 0.45);
    if (!noBang) curve(c, hist, '#ffffff', 4, 1);
    c.restore();
    // "now" marker
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(xOf(0), yOf(1), 6, 0, TWO_PI);
    c.fill();
    c.fillText('now', xOf(0) + 8, yOf(1) - 10);
    // legend
    c.font = '16px JetBrains Mono, monospace';
    let lx = PX0 + 6;
    for (const p of presetHists) {
      c.fillStyle = p.color;
      c.fillText(p.label, lx, 58);
      lx += c.measureText(p.label).width + 14;
    }
    c.fillStyle = '#ffffff';
    c.fillText('this model', lx, 58);
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, PW, PH);
    pctx.drawImage(bgPlot, 0, 0);
    if (noBang) return;
    const x = t - hist.t0;
    if (x < XL || x > XH) return;
    const X = xOf(x);
    pctx.strokeStyle = 'rgba(245,182,66,0.5)';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(X, PY0);
    pctx.lineTo(X, PY1);
    pctx.stroke();
    pctx.fillStyle = css(PALETTE.amber);
    pctx.beginPath();
    pctx.arc(X, yOf(Math.min(YH, a)), 8, 0, TWO_PI);
    pctx.fill();
  }

  // ------------------------------------------------------------ time mapping
  const tOfS = (x: number) => tStart + (tEnd - tStart) * x * x;
  const sOfT = (tt: number) => Math.sqrt(Math.max(0, Math.min(1, (tt - tStart) / (tEnd - tStart))));

  function setTime(tt: number): void {
    t = Math.max(tStart, Math.min(tEnd, tt));
    a = atTime(hist, hist.a, t);
    adot = atTime(hist, hist.adot, t);
    eta = atTime(hist, hist.eta, t);
  }

  function rebuild(keep: boolean): void {
    const aWas = a;
    const branchUp = adot >= 0;
    const h = buildHistory(cosmo);
    fate = h.fate;
    noBang = h.fate === 'nobang';
    warn.style.display = noBang ? '' : 'none';
    if (noBang) {
      updateFixedReadouts();
      drawPlotBackground();
      drawPlot();
      return;
    }
    hist = h;
    tStart = timeAtA(hist, 0.001);
    tEnd = hist.t[hist.n - 1];
    photons.length = 0;
    let tt = hist.t0;
    if (keep && branchUp && aWas > 0.001) tt = timeAtA(hist, aWas);
    setTime(tt);
    s = sOfT(t);
    timeCtl?.set(s, false);
    updateFixedReadouts();
    drawPlotBackground();
  }

  // ------------------------------------------------------------ photons
  const UP = new THREE.Vector3(0, 1, 0);
  function emitFrom(src: number, tE: number): void {
    if (src === home || noBang) return;
    const chi0 = chiOf(src);
    const dir = new THREE.Vector3(gpos[src * 3] - gpos[home * 3], gpos[src * 3 + 1] - gpos[home * 3 + 1], gpos[src * 3 + 2] - gpos[home * 3 + 2]).normalize();
    const perp = new THREE.Vector3().crossVectors(dir, UP);
    if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0);
    perp.normalize();
    if (photons.length >= MAX_PH) photons.shift();
    photons.push({ src, tE, chi0, aE: atTime(hist, hist.a, tE), dir, perp, phi: 0.6 + photonsEmitted * 1.3, arrivedT: NaN, zArr: NaN });
    photonsEmitted++;
  }

  const rgb: [number, number, number] = [0, 0, 0];
  function drawPhotons(sc: number): void {
    let arrivalText = '';
    const R = balloonR();
    const Rd = R.disp;
    for (let k = 0; k < MAX_PH; k++) {
      const ph = photons[k];
      const line = phLines[k];
      const bl = bphLines[k];
      const lab = phLabels[k];
      const head = phHeads[k];
      head.visible = false;
      if (!ph || t < ph.tE) {
        line.visible = false;
        bl.visible = false;
        lab.visible = false;
        continue;
      }
      const travelled = eta - atTime(hist, hist.eta, ph.tE);
      const rem = ph.chi0 - travelled;
      const stretch = a / ph.aE;
      if (rem <= 0) {
        if (!Number.isFinite(ph.arrivedT)) {
          ph.arrivedT = timeAtEta(hist, atTime(hist, hist.eta, ph.tE) + ph.chi0);
          ph.zArr = atTime(hist, hist.a, ph.arrivedT) / ph.aE - 1;
          photonsArrived++;
          lastZArr = ph.zArr;
        }
        line.visible = false;
        bl.visible = false;
        lab.visible = false;
        if (t - ph.arrivedT < 0.06 * (tEnd - tStart)) arrivalText = `photon arrived: z = ${ph.zArr.toFixed(2)}, stretched ×${(1 + ph.zArr).toFixed(2)}`;
        continue;
      }
      ph.arrivedT = NaN;
      wavelengthRGB(EMIT_NM * stretch, rgb);
      const mat = line.material as THREE.LineBasicMaterial;
      mat.color.setRGB(rgb[0], rgb[1], rgb[2]);
      (bl.material as THREE.LineBasicMaterial).color.setRGB(rgb[0], rgb[1], rgb[2]);
      const lam = LAMBDA0 * stretch;
      const len = Math.min(3 * lam, 4);
      const amp = 0.13;
      // bread: head at dir·rem (display), packet trails back toward the source
      const hx = ph.dir.x * rem * sc;
      const hy = ph.dir.y * rem * sc;
      const hz = ph.dir.z * rem * sc;
      const P = phPos[k];
      for (let j = 0; j < NP; j++) {
        const u = (j / (NP - 1)) * len;
        const env = Math.sin((Math.PI * j) / (NP - 1));
        const w = amp * env * Math.sin((TWO_PI * u) / lam);
        P[j * 3] = hx + ph.dir.x * u + ph.perp.x * w;
        P[j * 3 + 1] = hy + ph.dir.y * u + ph.perp.y * w;
        P[j * 3 + 2] = hz + ph.dir.z * u + ph.perp.z * w;
      }
      (line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      line.visible = view === 'bread';
      const nm = EMIT_NM * stretch;
      lab.element.textContent = `λ ×${stretch.toFixed(2)}${nm > 750 ? ' infrared' : ''}`;
      lab.position.set(hx + ph.perp.x * 0.3, hy + 0.3, hz + ph.perp.z * 0.3);
      lab.visible = view === 'bread';
      head.position.set(hx, hy, hz);
      head.material.color.setRGB(rgb[0], rgb[1], rgb[2]);
      head.visible = view === 'bread';
      // balloon: along a meridian toward the north pole
      const th = rem / R.Rc;
      const BP = bphPos[k];
      const cp = Math.cos(ph.phi);
      const sp = Math.sin(ph.phi);
      for (let j = 0; j < NP; j++) {
        const u = (j / (NP - 1)) * len;
        const env = Math.sin((Math.PI * j) / (NP - 1));
        const w = amp * env * Math.sin((TWO_PI * u) / lam);
        const thj = th + u / Rd;
        const r = Rd * 1.01 + w;
        BP[j * 3] = r * Math.sin(thj) * cp;
        BP[j * 3 + 1] = r * Math.cos(thj);
        BP[j * 3 + 2] = r * Math.sin(thj) * sp;
      }
      (bl.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      bl.visible = view === 'balloon';
    }
    arriveLabel.visible = arrivalText !== '' && view === 'bread';
    if (arrivalText) arriveLabel.element.textContent = arrivalText;
  }

  // ------------------------------------------------------------ per-frame drawing
  const col = new THREE.Color();
  const ARR_SUB = new THREE.Color(PALETTE.cyan);
  const ARR_SUP = new THREE.Color(PALETTE.rose);

  function balloonR(): { Rc: number; disp: number } {
    const Ok = omegaK(cosmo);
    const DH = hubbleDistance(cosmo.H0);
    const Rc = Ok < -0.01 ? DH / Math.sqrt(-Ok) : DH;
    return { Rc, disp: 0.5 * Rc * a * zoom(a) * DISP };
  }

  function draw(): void {
    if (noBang) return;
    const sc = a * zoom(a) * DISP; // display units per comoving Mpc
    const hx = gpos[home * 3];
    const hy = gpos[home * 3 + 1];
    const hz = gpos[home * 3 + 2];
    const vScale = 0.32; // display units per c of recession speed
    const cM = C_MPC_GYR;
    for (let i = 0; i < NG; i++) {
      const dx = gpos[i * 3] - hx;
      const dy = gpos[i * 3 + 1] - hy;
      const dz = gpos[i * 3 + 2] - hz;
      const x = dx * sc;
      const y = dy * sc;
      const z = dz * sc;
      galPos[i * 3] = x;
      galPos[i * 3 + 1] = y;
      galPos[i * 3 + 2] = z;
      const chi = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const zObs = i === home ? 0 : observedZ(hist, t, chi);
      zColor(zObs, col);
      galCol[i * 3] = col.r;
      galCol[i * 3 + 1] = col.g;
      galCol[i * 3 + 2] = col.b;
      const o = i * 6;
      const seen = Number.isFinite(zObs);
      const lk = seen ? 1 : 0.25;
      linePos[o] = 0;
      linePos[o + 1] = 0;
      linePos[o + 2] = 0;
      linePos[o + 3] = x;
      linePos[o + 4] = y;
      linePos[o + 5] = z;
      lineCol[o] = col.r * 0.5 * lk;
      lineCol[o + 1] = col.g * 0.5 * lk;
      lineCol[o + 2] = col.b * 0.5 * lk;
      lineCol[o + 3] = col.r * lk;
      lineCol[o + 4] = col.g * lk;
      lineCol[o + 5] = col.b * lk;
      // velocity arrow v = ȧ χ, drawn from the galaxy away from home
      const inPlane = Math.abs(dy) < 0.5 * SPACING;
      const beta = i === home || !inPlane ? 0 : (adot * chi) / cM;
      const L = (vScale * Math.min(beta, 4)) / Math.max(1e-9, chi * sc);
      arrPos[o] = x;
      arrPos[o + 1] = y;
      arrPos[o + 2] = z;
      arrPos[o + 3] = x + x * L;
      arrPos[o + 4] = y + y * L;
      arrPos[o + 5] = z + z * L;
      const ac = Math.abs(beta) > 1 ? ARR_SUP : ARR_SUB;
      arrCol[o] = ac.r * 0.25;
      arrCol[o + 1] = ac.g * 0.25;
      arrCol[o + 2] = ac.b * 0.25;
      arrCol[o + 3] = ac.r;
      arrCol[o + 4] = ac.g;
      arrCol[o + 5] = ac.b;
    }
    (galGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (galGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (lineGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (arrGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (arrGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // selection
    const sx = galPos[selected * 3];
    const sy = galPos[selected * 3 + 1];
    const sz = galPos[selected * 3 + 2];
    selMark.position.set(sx, sy, sz);
    selLinePos[3] = sx;
    selLinePos[4] = sy;
    selLinePos[5] = sz;
    (selLineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    selLabel.position.set(sx, sy + 0.38, sz);
    const beta = (adot * chiOf(selected)) / cM;
    selLabel.element.textContent = `v = ${beta.toFixed(2)}c`;
    selLabel.element.style.color = beta > 1 ? css(PALETTE.rose) : '#dfe6f3';

    // shells (proper radii × zoom)
    const rH = (cM * a) / adot; // proper Hubble radius, Mpc
    const rHd = rH * zoom(a) * DISP;
    const valid = adot > 0;
    hubbleShell.visible = valid && showShells;
    horizonShell.visible = showShells;
    hubbleLabel.visible = valid && showShells && view === 'bread';
    if (valid) {
      hubbleShell.scale.setScalar(rHd);
      hubbleLabel.position.set(0, rHd + 0.15, 0);
    }
    const rP = eta * sc;
    horizonShell.scale.setScalar(Math.max(1e-3, rP));
    horizonLabel.position.set(rP * 0.6, -rP * 0.8, 0);
    horizonLabel.visible = showShells && view === 'bread' && rP < 30;

    // scale bar: choose a round proper length that fits
    const perGly = MPC_PER_GLY * zoom(a) * DISP;
    const choices = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10];
    let Lg = choices[0];
    for (const c of choices) if (c * perGly <= 3.2) Lg = c;
    const bl = Lg * perGly;
    const ext = ((N_SIDE - 1) / 2) * SPACING * sc;
    const by = -ext - 0.7;
    const bx = -bl / 2;
    const bz = ext + 0.4;
    barPos.set([bx, by, bz, bx + bl, by, bz, bx, by - 0.08, bz, bx, by + 0.08, bz, bx + bl, by - 0.08, bz, bx + bl, by + 0.08, bz]);
    (barGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    barLabel.position.set(0, by - 0.28, bz);
    barLabel.element.textContent = Lg >= 1 ? `${Lg} billion light years (proper)` : `${Math.round(Lg * 1000)} million light years (proper)`;

    // era notes
    let era = '';
    if (a < 0.0016) era = 'z ≈ 1000: the CMB light was released near here. No galaxies exist yet.';
    else if (a < 0.08) era = 'No galaxies yet. The dots mark matter that will gather into them.';
    else if (fate === 'crunch' && adot < 0) era = 'Contracting: light is now blueshifted on arrival.';
    eraLabel.visible = era !== '' && view === 'bread';
    eraLabel.element.textContent = era;
    eraLabel.position.set(0, ext + 1.2, 0);

    // balloon
    const R = balloonR();
    bScale.scale.setScalar(Math.max(1e-3, R.disp));
    bHome.position.set(0, R.disp * 1.01, 0);
    bHomeLabel.position.set(0, R.disp + 0.45, 0);
    bTitle.position.set(0, -R.disp - 0.55, 0);
    bSub.position.set(0, -R.disp - 0.95, 0);
    bSub.element.textContent = omegaK(cosmo) < -0.01 ? `closed: curvature radius ${(R.Rc * a / MPC_PER_GLY).toFixed(1)} Gly at this time` : 'this universe is not closed, so the sphere is only a sketch';
    for (let i = 0; i < N_BALLOON; i++) {
      const zb = i === 0 ? 0 : observedZ(hist, t, bTheta[i] * R.Rc);
      zColor(zb, col);
      bCol[i * 3] = col.r;
      bCol[i * 3 + 1] = col.g;
      bCol[i * 3 + 2] = col.b;
    }
    (bGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    drawPhotons(sc);
  }

  // ------------------------------------------------------------ picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (view !== 'bread' || noBang) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    ray.params.Points = { threshold: 0.18 };
    galGeo.computeBoundingSphere();
    const hits = ray.intersectObject(galaxies);
    let best = -1;
    let bd = Infinity;
    for (const h of hits) {
      if (h.index === undefined || h.index === home) continue;
      const d = (h.distanceToRay ?? 0) + h.distance * 0.002;
      if (d < bd) {
        bd = d;
        best = h.index;
      }
    }
    if (best >= 0) {
      selected = best;
      selTouched = true;
      draw();
      updateReadouts();
    }
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // ------------------------------------------------------------ frame loop
  let readoutTimer = 0;
  stage.onFrame((dt) => {
    if (playing && !noBang) {
      const before = t;
      s = Math.min(1, s + RATE * dt);
      let tt = tOfS(s);
      if (stopAtNow && before < hist.t0 && tt >= hist.t0) {
        tt = hist.t0;
        s = sOfT(tt);
        stopAtNow = false;
        setPlaying(false);
      }
      setTime(tt);
      if (s >= 1) setPlaying(false);
      timeCtl.set(s, false);
    }
    draw();
    drawPlot();
    readoutTimer += dt;
    if (readoutTimer > 0.1) {
      readoutTimer = 0;
      updateReadouts();
    }
  });

  // ------------------------------------------------------------ controls
  const ui = new Panel(panel);
  ui.section('Cosmic time');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { if (!playing && s >= 1) s = 0; setPlaying(!playing); } },
    { label: 'Now', onClick: () => { setPlaying(false); setTime(hist.t0); s = sOfT(t); timeCtl.set(s, false); } },
    { label: 'Emit photon', key: 'emit', onClick: () => { emitFrom(selected, t); if (!playing && s < 1) setPlaying(true); } },
  ]);
  function setPlaying(v: boolean): void {
    playing = v;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }
  const timeCtl = ui.slider({
    key: 'time', label: 'Time since the Big Bang', min: 0, max: 1, step: 0.0005, value: 0,
    format: (v) => { const tt = tOfS(v); return tt < 0.01 ? `${(tt * 1e6).toFixed(0)} kyr` : `${tt.toFixed(2)} Gyr`; },
    onInput: (v) => { s = v; timeTouched = true; stopAtNow = false; setPlaying(false); setTime(tOfS(v)); },
  });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'bread', label: 'Raisin bread' }, { value: 'balloon', label: 'Balloon (analogy)' }],
    onChange: (v) => {
      view = v;
      bread.visible = v === 'bread';
      balloon.visible = v === 'balloon';
      legend.innerHTML = v === 'bread' ? LEGEND_BREAD : LEGEND_BALLOON;
      if (v === 'bread') stage.flyTo(CAM_BREAD, [0, -0.3, 0]);
      else stage.flyTo(CAM_BALLOON, [0, 0.2, 0]);
    },
  });

  ui.section('Universe');
  const presetCtl = ui.select<Preset>({
    key: 'preset', label: 'Model', value: preset,
    options: [
      { value: 'planck', label: 'Planck 2018' },
      { value: 'eds', label: 'Einstein-de Sitter' },
      { value: 'milne', label: 'Empty (Milne)' },
      { value: 'closed', label: 'Closed' },
      { value: 'lambda', label: 'Λ-dominated' },
      { value: 'custom', label: 'Custom' },
    ],
    onChange: (v) => {
      preset = v;
      if (v === 'custom') return;
      const p = PRESETS[v];
      if (v === 'planck') {
        cosmo.H0 = 67.4;
        h0Ctl.set(67.4, false);
        cosmo.Or = omegaR(67.4);
        buildPresetHists();
      }
      cosmo.Om = p.Om;
      cosmo.Ol = p.Ol;
      omCtl.set(p.Om, false);
      olCtl.set(p.Ol, false);
      rebuild(true);
    },
  });
  const onCosmo = () => {
    cosmoTouched = true;
    preset = 'custom';
    presetCtl.set('custom', false);
    rebuild(true);
  };
  const h0Ctl = ui.slider({ key: 'H0', label: 'Hubble constant H₀', min: 50, max: 90, step: 0.1, value: cosmo.H0, unit: 'km/s/Mpc', format: (v) => v.toFixed(1), onInput: (v) => { cosmo.H0 = v; cosmo.Or = omegaR(v); buildPresetHists(); onCosmo(); } });
  const omCtl = ui.slider({ key: 'Om', label: 'Matter Ω_m', min: 0, max: 3, step: 0.005, value: cosmo.Om, format: (v) => v.toFixed(3), onInput: (v) => { cosmo.Om = v; onCosmo(); } });
  const olCtl = ui.slider({ key: 'Ol', label: 'Dark energy Ω_Λ', min: -0.5, max: 2, step: 0.005, value: cosmo.Ol, format: (v) => v.toFixed(3), onInput: (v) => { cosmo.Ol = v; onCosmo(); } });
  ui.note('Radiation is fixed at Ω_r h² = 4.18×10⁻⁵. Curvature takes up the rest: Ω_k = 1 − Ω_m − Ω_Λ − Ω_r.');
  const rAge0 = ui.readout('age0', 'age today t₀', 'Gyr');
  const rOk = ui.readout('Ok', 'curvature Ω_k');
  const rFate = ui.readout('fate', 'fate');
  const rZacc = ui.readout('zacc', 'acceleration began');

  ui.section('Galaxies');
  ui.note('Click a galaxy to select it. Emit photon sends light from it to home.');
  ui.buttons([
    { label: 'Make selected the home', key: 'home', onClick: () => { if (selected === home) return; const old = home; home = selected; selected = old; photons.length = 0; draw(); } },
    { label: 'Centre home', onClick: () => { if (home === centreIdx) return; if (selected === centreIdx) selected = home; home = centreIdx; photons.length = 0; draw(); } },
  ]);
  ui.toggle({ key: 'lines', label: 'Lines from home', value: showLines, onChange: (v) => { showLines = v; lines.visible = v; } });
  ui.toggle({ key: 'arrows', label: 'Recession velocity arrows', value: showArrows, onChange: (v) => { showArrows = v; arrows.visible = v; } });
  ui.toggle({ key: 'shells', label: 'Hubble radius and particle horizon', value: true, onChange: (v) => { showShells = v; } });

  ui.section('At this moment');
  const rT = ui.readout('t', 'age t', 'Gyr');
  const rA = ui.readout('a', 'scale factor a');
  const rZ = ui.readout('z', 'redshift z = 1/a − 1');
  const rH = ui.readout('H', 'Hubble rate H', 'km/s/Mpc');
  const rQ = ui.readout('q', 'deceleration q');
  const rRH = ui.readout('rH', 'Hubble radius c/H', 'Gly');
  const rPH = ui.readout('horizon', 'particle horizon', 'Gly');
  const rF = ui.readout('fcheck', 'Friedmann check');

  ui.section('Selected galaxy');
  const rSD = ui.readout('selD', 'proper distance', 'Gly');
  const rSV = ui.readout('selV', 'recession v = Hd');
  const rSB = ui.readout('beyond', 'beyond Hubble radius?');
  const rSZ = ui.readout('selZ', 'redshift seen now');
  const rSL = ui.readout('selLb', 'light travel time', 'Gyr');
  const rDL = ui.readout('DL', 'luminosity distance', 'Gly');
  const rDA = ui.readout('DA', 'angular diameter dist.', 'Gly');
  const rPh = ui.readout('photon', 'last photon arrived at');
  ui.note('Faster-than-light recession breaks no law. Relativity limits speeds through space measured nearby. Here no galaxy moves through space. The space between is growing, and over a long enough distance that growth adds up to more than c.');

  function updateFixedReadouts(): void {
    const Ok = omegaK(cosmo);
    rOk(Math.abs(Ok) < 5e-4 ? '0.000 (flat)' : `${Ok.toFixed(3)} ${Ok > 0 ? '(open)' : '(closed)'}`);
    if (noBang) {
      rAge0('–');
      rFate('no Big Bang');
      rZacc('–');
      rF('–');
      return;
    }
    rAge0(hist.t0.toFixed(2));
    if (fate === 'crunch') {
      const aMax = turnaroundA(cosmo);
      rFate(Number.isFinite(hist.tTurn) && hist.t[hist.n - 1] < 1e3 ? `crunch at ${hist.t[hist.n - 1].toFixed(1)} Gyr` : `recollapses (a_max ${aMax.toFixed(1)})`);
    } else rFate('expands forever');
    const za = accelerationRedshift(cosmo);
    rZacc(Number.isFinite(za) ? `z = ${za.toFixed(2)}` : decelFromHistory(hist, hist.t0) < 0 ? 'always' : 'never (so far)');
    rF(`${hist.maxConstraint.toExponential(0)}`);
  }

  let qNow = 0;
  let selV = 0;
  function updateReadouts(): void {
    if (noBang) return;
    rT(t < 0.01 ? `${(t * 1e6).toFixed(0)} kyr` : t.toFixed(3));
    rA(a < 0.01 ? a.toExponential(2) : a.toFixed(3));
    const z = 1 / a - 1;
    rZ(a > 1 ? `${z.toFixed(3)} (future)` : z < 100 ? z.toFixed(3) : z.toFixed(0));
    const H = (adot / a) * (cosmo.H0 / h0Gyr(cosmo.H0));
    rH(Math.abs(H) < 1e4 ? H.toFixed(1) : H.toExponential(2));
    qNow = decelFromHistory(hist, t);
    rQ(`${qNow.toFixed(3)} ${qNow < 0 ? '(speeding up)' : '(slowing)'}`);
    const rh = a / adot; // Gly, since c = 1 Gly/Gyr
    rRH(adot > 0 ? (rh < 0.01 ? rh.toExponential(1) : rh.toFixed(2)) : '–');
    const ph = (a * eta) / MPC_PER_GLY;
    rPH(ph < 0.01 ? ph.toExponential(1) : ph.toFixed(2));
    const chi = chiOf(selected);
    const dProper = (a * chi) / MPC_PER_GLY;
    rSD(dProper < 0.01 ? dProper.toExponential(1) : dProper.toFixed(2));
    selV = (adot * chi) / C_MPC_GYR;
    rSV(`${selV.toFixed(2)} c`);
    rSB(adot > 0 ? (selV > 1 ? 'yes, v > c' : 'no, v < c') : 'contracting');
    const zs = observedZ(hist, t, chi);
    if (Number.isFinite(zs)) {
      rSZ(zs.toFixed(3));
      const te = timeAtEta(hist, eta - chi);
      rSL((t - te).toFixed(2));
      const DM = (a * transverse(cosmo, chi)) / MPC_PER_GLY;
      rDL((DM * (1 + zs)).toFixed(2));
      rDA((DM / (1 + zs)).toFixed(2));
    } else {
      rSZ('not visible yet');
      rSL('–');
      rDL('–');
      rDA('–');
    }
    rPh(Number.isFinite(lastZArr) ? `z = ${lastZArr.toFixed(2)}` : '–');
  }

  // ------------------------------------------------------------ start: a photon from z ≈ 2.5 lands today
  buildPresetHists();
  rebuild(false);
  legend.innerHTML = LEGEND_BREAD;
  {
    let src = -1;
    let bd = Infinity;
    for (let i = 0; i < NG; i++) {
      const d = Math.abs(chiOf(i) - 5600) + (gpos[i * 3 + 2] < 0 ? 3000 : 0) + (gpos[i * 3] < 0 ? 1500 : 0);
      if (d < bd) {
        bd = d;
        src = i;
      }
    }
    const tE = timeAtEta(hist, hist.eta0 - chiOf(src));
    setTime(tE);
    s = sOfT(tE);
    timeCtl.set(s, false);
    emitFrom(src, tE);
    photonsEmitted = 0;
  }
  draw();
  drawPlot();
  updateReadouts();

  return {
    state: () => ({
      t,
      a,
      z: 1 / a - 1,
      H: (adot / a) * HUBBLE_FACTOR(cosmo.H0),
      q: qNow,
      age0: noBang ? 0 : hist.t0,
      H0: cosmo.H0,
      Om: cosmo.Om,
      Ol: cosmo.Ol,
      Ok: omegaK(cosmo),
      preset,
      fate: noBang ? 'nobang' : fate,
      view,
      home,
      selected,
      selV,
      selBeyond: selV > 1,
      photonsEmitted,
      photonsArrived,
      lastZArr: Number.isFinite(lastZArr) ? lastZArr : 0,
      playing,
      cosmoTouched,
      timeTouched,
      selTouched,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      plot.remove();
      legend.remove();
      warn.remove();
      glowTex.dispose();
      ringTex.dispose();
      stage.dispose();
    },
  };
}

/** Converts ȧ/a in 1/Gyr to km/s/Mpc. */
const HUBBLE_FACTOR = (H0: number) => H0 / h0Gyr(H0);

const topic: Topic = {
  id: 'cosmic-expansion',
  number: 24,
  title: 'The Expanding Universe',
  domain: 'relativity',
  level: 2,
  status: 'live',
  tagline: 'Galaxies are not flying apart. Space between them is growing.',
  content,
  mount,
};

export default topic;
