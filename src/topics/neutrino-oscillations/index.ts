import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  AU_KM, EARTH_DIAMETER_KM, K, NUFIT_IO, NUFIT_NO, buildSystem, chordAngle, oscLength, probs,
  type MixParams, type OscSystem,
} from './physics.ts';

type Model = '3f' | '2f';
type Order = 'no' | 'io';
type PresetId = 'solar' | 'atm' | 'kamland' | 't2k' | 'dune' | 'custom';
type Flav = 'e' | 'mu' | 'tau';
type View = 'both' | 'path' | 'earth';

const DEG = Math.PI / 180;
const FLAVS: Flav[] = ['e', 'mu', 'tau'];
const FL_COL = [0x5ee39a, 0x4f86ff, 0xff6b6b];
const FL_NAME = ['νe', 'νμ', 'ντ'];
const MS_COL = [0xdfe6f3, PALETTE.amber, PALETTE.violet];
const MS_NAME = ['ν₁', 'ν₂', 'ν₃'];

// Scene geometry
const PX0 = -9.4;
const PX1 = 3.2;
const PLEN = PX1 - PX0;
const NP = 320; // path rows
const NW = 720; // wave samples
const WY = [1.2, 2.1, 3.0];
const CYCLES = 9; // drawn carrier cycles along the path
const K0 = (2 * Math.PI * CYCLES) / PLEN;
const MAX_TICKS = 20;
const EC = new THREE.Vector3(6.9, -3.2, 0);
const ER = 2.1;
const NC = 96; // chord samples
const COL_H = 2.0;
const TRIP = 7; // seconds per flight at speed 1
const DET_WIN = 0.01; // detector averaging window, fraction of L
const PLOT_LO = 0;
const PLOT_HI = 12;
const NPX = 280;

const CAM_BOTH: [number, number, number] = [-0.8, 1.3, 21];
const TGT_BOTH: [number, number, number] = [-0.8, 0.7, 0];

interface Preset { label: string; E: number; L: number; start: number; anti: boolean; rho: number; src: string; det: string }
const PRESETS: Record<Exclude<PresetId, 'custom'>, Preset> = {
  solar: { label: 'Sun', E: 0.000862, L: AU_KM, start: 0, anti: false, rho: 0, src: 'Sun core (⁷Be)', det: 'detector on Earth' },
  atm: { label: 'Atmos.', E: 1, L: EARTH_DIAMETER_KM, start: 1, anti: false, rho: 4.5, src: 'cosmic-ray shower', det: 'Super-Kamiokande' },
  kamland: { label: 'KamLAND', E: 0.004, L: 180, start: 0, anti: true, rho: 2.7, src: 'Japanese reactors', det: 'KamLAND' },
  t2k: { label: 'T2K', E: 0.6, L: 295, start: 1, anti: false, rho: 2.6, src: 'J-PARC (Tokai)', det: 'Super-Kamiokande' },
  dune: { label: 'DUNE', E: 2.5, L: 1300, start: 1, anti: false, rho: 2.85, src: 'Fermilab', det: 'DUNE far detector' },
};

function fmtE(E: number): string {
  if (E >= 0.1) return `${E < 10 ? E.toFixed(2) : E.toFixed(1)} GeV`;
  const m = E * 1000;
  return `${m < 1 ? m.toFixed(2) : m < 10 ? m.toFixed(1) : m.toFixed(0)} MeV`;
}

function fmtL(L: number): string {
  if (L < 10) return `${L.toFixed(2)} km`;
  if (L < 1e5) return `${Math.round(L).toLocaleString('en-US')} km`;
  const e = Math.floor(Math.log10(L));
  return `${(L / 10 ** e).toFixed(2)}×10${sup(e)} km`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number): string => String(n).split('').map((c) => SUP[Number(c)] ?? c).join('');

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_BOTH, target: TGT_BOTH, fov: 40 });
  const { scene } = stage;

  // --- State
  let model: Model = '3f';
  let order: Order = 'no';
  let deltaDeg = 177;
  let theta2 = 45;
  let dm2 = 2.5e-3;
  let E = PRESETS.dune.E;
  let L = PRESETS.dune.L;
  let start = 1;
  let anti = false;
  let matter = false;
  let rho = PRESETS.dune.rho;
  let preset: PresetId = 'dune';
  let srcName = PRESETS.dune.src;
  let detName = PRESETS.dune.det;
  let playing = true;
  let speed = 1;
  let u = 0;
  let hold = 0;
  let wt = 0;
  let eTouched = false;
  let sys: OscSystem = buildSystem(NUFIT_NO, E);
  const det = new Float64Array(3);
  const cur = new Float64Array(3);
  const tmp = new Float64Array(3);
  const amp = new Float64Array(3);
  const fade = new Float64Array(3);
  const kRel = new Float64Array(3);

  const flCol = FL_COL.map((c) => new THREE.Color(c));
  const mix = new THREE.Color();
  const mixColor = (P: ArrayLike<number>, out: THREE.Color): THREE.Color => {
    out.setRGB(
      P[0] * flCol[0].r + P[1] * flCol[1].r + P[2] * flCol[2].r,
      P[0] * flCol[0].g + P[1] * flCol[1].g + P[2] * flCol[2].g,
      P[0] * flCol[0].b + P[1] * flCol[1].b + P[2] * flCol[2].b,
    );
    return out;
  };

  const matterActive = (): boolean => matter && L <= EARTH_DIAMETER_KM * 1.0001;

  function params(): MixParams {
    if (model === '2f') return { th12: theta2 * DEG, th13: 0, th23: 0, delta: 0, dm21: dm2, dm31: dm2 };
    return { ...(order === 'no' ? NUFIT_NO : NUFIT_IO), delta: deltaDeg * DEG };
  }

  // --- Flight path tube, vertex-coloured by flavour mix
  const RAD = 12;
  const tubeGeo = new THREE.CylinderGeometry(0.13, 0.13, PLEN, RAD, NP, true);
  const tubeCol = new Float32Array(tubeGeo.attributes.position.count * 3);
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(tubeCol, 3));
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  tube.rotation.z = -Math.PI / 2;
  tube.position.set((PX0 + PX1) / 2, 0, 0);
  scene.add(tube);

  // Source and detector
  const srcMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a4660, emissive: 0x1a2236, roughness: 0.5, metalness: 0.3 }),
  );
  srcMesh.position.set(PX0 - 0.35, 0, 0);
  scene.add(srcMesh);
  const detMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 1.1, 32, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x2b3a57, emissive: 0x0d1424, roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.85 }),
  );
  detMesh.position.set(PX1 + 0.6, 0, 0);
  scene.add(detMesh);
  const detRing = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.56, 0.56, 1.12, 32, 1)), new THREE.LineBasicMaterial({ color: 0x6f86b3 }));
  detRing.position.copy(detMesh.position);
  scene.add(detRing);
  const srcLab = stage.label('', [PX0 + 2.2, -2.85, 0], 'muted');
  const detLab = stage.label('', [PX1 + 0.6, -0.95, 0], '');
  const lenLab = stage.label('', [PX1 + 0.6, -1.35, 0], 'muted');

  // --- Mass-state waves (ribbons) with crest ticks
  const waveY = [new Float32Array(NW + 1), new Float32Array(NW + 1), new Float32Array(NW + 1)];
  const waves: THREE.Mesh[] = [];
  const wavePos: Float32Array[] = [];
  const ribIndex: number[] = [];
  for (let j = 0; j < NW; j++) {
    const a = j * 2;
    ribIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < 3; i++) {
    const pos = new Float32Array((NW + 1) * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(ribIndex);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: MS_COL[i], side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    m.frustumCulled = false;
    scene.add(m);
    waves.push(m);
    wavePos.push(pos);
    const lab = stage.label(MS_NAME[i], [PX0 - 0.75, WY[i], 0], 'big');
    lab.element.style.color = css(MS_COL[i]);
  }
  const axisPos = new Float32Array(3 * 2 * 3);
  for (let i = 0; i < 3; i++) {
    axisPos.set([PX0, WY[i], -0.01, PX1, WY[i], -0.01], i * 6);
  }
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.BufferAttribute(axisPos, 3));
  scene.add(new THREE.LineSegments(axisGeo, new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.9 })));
  const tickPos = new Float32Array(MAX_TICKS * 2 * 3);
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.BufferAttribute(tickPos, 3));
  const ticks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: 0xaab6cc, transparent: true, opacity: 0.8 }));
  ticks.frustumCulled = false;
  scene.add(ticks);
  const waveNote = stage.label('', [(PX0 + PX1) / 2, WY[2] + 0.75, 0], 'muted');

  // --- Travelling neutrino, glow and stacked flavour bars
  const nuMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3 });
  const nu = new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 18), nuMat);
  scene.add(nu);
  const glowTex = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(1.6);
  scene.add(glow);
  const bars = new THREE.Group();
  scene.add(bars);
  const barGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
  const barMeshes = FL_COL.map((c) => {
    const m = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.72, depthWrite: false }));
    bars.add(m);
    return m;
  });
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.54, COL_H, 0.54)), new THREE.LineBasicMaterial({ color: 0x6f86b3, transparent: true, opacity: 0.8 }));
  frame.position.y = -0.45 - COL_H / 2;
  bars.add(frame);

  // --- Earth cross-section
  const earth = new THREE.Group();
  earth.position.copy(EC);
  scene.add(earth);
  const disc = (r: number, color: number, z: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshBasicMaterial({ color }));
    m.position.z = z;
    earth.add(m);
    return m;
  };
  disc(ER, 0x16294a, -0.03);
  disc((ER * 3480) / 6371, 0x4a2d1a, -0.02);
  disc((ER * 1221) / 6371, 0x7a4f22, -0.01);
  const rimPts: number[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    rimPts.push(Math.cos(a) * ER, Math.sin(a) * ER, 0);
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPts, 3));
  earth.add(new THREE.Line(rimGeo, new THREE.LineBasicMaterial({ color: 0x4d6ea3 })));
  const atmo = new THREE.Mesh(new THREE.RingGeometry(ER, ER * 1.035, 128), new THREE.MeshBasicMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.18, depthWrite: false }));
  earth.add(atmo);
  const eDet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xdfe6f3 }));
  eDet.position.set(0, ER - 0.14, 0.02);
  earth.add(eDet);
  const chordPos = new Float32Array((NC + 1) * 3);
  const chordCol = new Float32Array((NC + 1) * 3);
  const chordGeo = new THREE.BufferGeometry();
  chordGeo.setAttribute('position', new THREE.BufferAttribute(chordPos, 3));
  chordGeo.setAttribute('color', new THREE.BufferAttribute(chordCol, 3));
  const chord = new THREE.Line(chordGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  chord.frustumCulled = false;
  earth.add(chord);
  const eNu = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  eNu.position.z = 0.05;
  earth.add(eNu);
  const eGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  eGlow.scale.setScalar(0.7);
  earth.add(eGlow);
  stage.label('Earth, cut in half', [0, -ER - 0.4, 0], 'muted', earth);
  stage.label('detector', [1.25, ER - 0.05, 0], 'muted', earth);
  stage.label('core', [0, 0, 0], 'muted', earth);
  const zenLab = stage.label('', [0, 0, 0], 'muted', earth);
  const S = new THREE.Vector2();
  const D = new THREE.Vector2(0, ER);

  // --- Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '300px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  let legendHtml = '';

  const plot = document.createElement('canvas');
  plot.width = 560;
  plot.height = 300;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: '280px', height: '150px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const plotBase = document.createElement('canvas');
  plotBase.width = plot.width;
  plotBase.height = plot.height;
  const bctx = plotBase.getContext('2d')!;
  const PL = { x0: 18, x1: 548, y0: 52, y1: 262 };
  const xOf = (lg: number) => PL.x0 + ((lg - PLOT_LO) / (PLOT_HI - PLOT_LO)) * (PL.x1 - PL.x0);
  const yOf = (p: number) => PL.y1 - p * (PL.y1 - PL.y0);
  const curve = [new Float64Array(NPX), new Float64Array(NPX), new Float64Array(NPX)];

  function drawPlotBase(): void {
    const W = plotBase.width, Hh = plotBase.height;
    bctx.clearRect(0, 0, W, Hh);
    bctx.font = '600 20px JetBrains Mono, monospace';
    bctx.fillStyle = '#b8c3d9';
    bctx.fillText(`P(${anti ? 'ν̄' : 'ν'}${['e', 'μ', 'τ'][start]} → β) vs L/E`, 16, 30);
    bctx.font = '17px JetBrains Mono, monospace';
    bctx.fillStyle = '#8391ab';
    const tag = matterActive() ? `at E = ${fmtE(E)}` : 'km/GeV, log';
    bctx.fillText(tag, W - 16 - bctx.measureText(tag).width, 30);
    bctx.strokeStyle = '#243049';
    bctx.lineWidth = 1.5;
    for (const v of [0, 0.5, 1]) {
      bctx.beginPath();
      bctx.moveTo(PL.x0, yOf(v));
      bctx.lineTo(PL.x1, yOf(v));
      bctx.stroke();
    }
    bctx.fillStyle = '#56627c';
    bctx.font = '16px JetBrains Mono, monospace';
    for (let lg = PLOT_LO; lg <= PLOT_HI; lg += 2) {
      const x = xOf(lg);
      bctx.beginPath();
      bctx.moveTo(x, PL.y1);
      bctx.lineTo(x, PL.y1 + 6);
      bctx.stroke();
      const s = lg === 0 ? '1' : `10${sup(lg)}`;
      bctx.fillText(s, Math.min(W - 40, Math.max(4, x - bctx.measureText(s).width / 2)), PL.y1 + 26);
    }
    const step = (PLOT_HI - PLOT_LO) / NPX;
    for (let j = 0; j < NPX; j++) {
      const a = 10 ** (PLOT_LO + j * step) * E;
      const b = 10 ** (PLOT_LO + (j + 1) * step) * E;
      probs(sys, start, (a + b) / 2, b - a, tmp);
      curve[0][j] = tmp[0];
      curve[1][j] = tmp[1];
      curve[2][j] = tmp[2];
    }
    bctx.lineWidth = 3;
    for (const f of [2, 0, 1]) {
      bctx.strokeStyle = css(FL_COL[f]);
      bctx.beginPath();
      for (let j = 0; j < NPX; j++) {
        const x = xOf(PLOT_LO + (j + 0.5) * step);
        const y = yOf(Math.max(0, Math.min(1, curve[f][j])));
        if (j === 0) bctx.moveTo(x, y);
        else bctx.lineTo(x, y);
      }
      bctx.stroke();
    }
  }

  function drawPlot(): void {
    pctx.clearRect(0, 0, plot.width, plot.height);
    pctx.drawImage(plotBase, 0, 0);
    const lgD = Math.log10(L / E);
    const xd = xOf(Math.max(PLOT_LO, Math.min(PLOT_HI, lgD)));
    pctx.save();
    pctx.strokeStyle = '#dfe6f3';
    pctx.setLineDash([8, 6]);
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(xd, PL.y0 - 6);
    pctx.lineTo(xd, PL.y1);
    pctx.stroke();
    pctx.restore();
    pctx.font = '16px JetBrains Mono, monospace';
    pctx.fillStyle = '#dfe6f3';
    const t = 'detector';
    pctx.fillText(t, xd + 6 + pctx.measureText(t).width > plot.width - 6 ? xd - 6 - pctx.measureText(t).width : xd + 6, PL.y0 + 4);
    const Lnu = u * L;
    if (Lnu > 0) {
      const lg = Math.log10(Lnu / E);
      if (lg >= PLOT_LO) {
        const x = xOf(Math.min(PLOT_HI, lg));
        for (let f = 0; f < 3; f++) {
          pctx.fillStyle = css(FL_COL[f]);
          pctx.beginPath();
          pctx.arc(x, yOf(cur[f]), 7, 0, Math.PI * 2);
          pctx.fill();
        }
        pctx.strokeStyle = '#ffffff';
        pctx.lineWidth = 1.5;
        pctx.beginPath();
        pctx.moveTo(x, PL.y0);
        pctx.lineTo(x, PL.y1);
        pctx.stroke();
      }
    }
  }

  // --- Recompute everything that depends on parameters
  function recompute(): void {
    sys = buildSystem(params(), E, { antineutrino: anti, rho: matterActive() ? rho : 0 }, sys);
    const seg = L / NP;
    // Tube colours: row iy sits at fraction 1 - iy/NP of the path.
    for (let iy = 0; iy <= NP; iy++) {
      const Lr = (1 - iy / NP) * L;
      probs(sys, start, Lr, seg, tmp);
      mixColor(tmp, mix);
      for (let ix = 0; ix <= RAD; ix++) {
        const v = (iy * (RAD + 1) + ix) * 3;
        tubeCol[v] = mix.r;
        tubeCol[v + 1] = mix.g;
        tubeCol[v + 2] = mix.b;
      }
    }
    tubeGeo.attributes.color.needsUpdate = true;
    probs(sys, start, L, DET_WIN * L, det);

    // Wave amplitudes and visibility
    let maxFade = 1;
    for (let i = 0; i < 3; i++) {
      const re = sys.U.re[start * 3 + i], im = sys.U.im[start * 3 + i];
      amp[i] = 0.08 + 0.34 * Math.hypot(re, im);
      kRel[i] = sys.k[i] - sys.k[0];
      const r = (Math.abs(kRel[i]) * L) / (K0 * PLEN);
      fade[i] = r < 0.35 ? 1 : r > 0.7 ? 0 : 1 - (r - 0.35) / 0.35;
      maxFade = Math.min(maxFade, fade[i]);
    }
    waveNote.element.textContent = maxFade < 1 ? 'some waves slip too fast to draw here: their effect averages out' : '';

    // Earth chord
    const inside = L <= EARTH_DIAMETER_KM * 1.0001;
    if (inside) {
      const a = chordAngle(L);
      S.set(Math.cos(Math.PI / 2 + a) * ER, Math.sin(Math.PI / 2 + a) * ER);
      const zen = 90 + a / 2 / DEG;
      zenLab.element.textContent = L < 2000 ? '' : `zenith ${zen.toFixed(0)}°`;
      zenLab.position.set(S.x - 0.2, S.y - 0.35, 0);
      if (a > Math.PI * 0.8) zenLab.position.set(S.x + 0.9, S.y + 0.3, 0);
    } else {
      S.set(0.9, ER + 2.0);
      zenLab.element.textContent = preset === 'solar' ? 'from the Sun' : 'from beyond Earth';
      zenLab.position.set(S.x, S.y + 0.35, 0);
    }
    for (let i = 0; i <= NC; i++) {
      const f = i / NC;
      chordPos[i * 3] = S.x + (D.x - S.x) * f;
      chordPos[i * 3 + 1] = S.y + (D.y - S.y) * f;
      chordPos[i * 3 + 2] = 0.03;
      probs(sys, start, f * L, L / NC, tmp);
      mixColor(tmp, mix);
      chordCol[i * 3] = mix.r;
      chordCol[i * 3 + 1] = mix.g;
      chordCol[i * 3 + 2] = mix.b;
    }
    chordGeo.attributes.position.needsUpdate = true;
    chordGeo.attributes.color.needsUpdate = true;

    srcLab.element.textContent = `${anti ? 'ν̄' : 'ν'}${['e', 'μ', 'τ'][start]} source: ${srcName}`;
    detLab.element.textContent = detName;
    lenLab.element.textContent = `L = ${fmtL(L)}`;
    drawPlotBase();
    updateTravel();
    drawPlot();
    updateReadouts();
    updateLegend();
  }

  // --- Per-frame updates
  function updateTravel(): void {
    probs(sys, start, u * L, L / NP, cur);
    const x = PX0 + u * PLEN;
    nu.position.set(x, 0, 0);
    glow.position.set(x, 0, 0);
    mixColor(cur, mix);
    nuMat.color.copy(mix);
    nuMat.emissive.copy(mix);
    glowMat.color.copy(mix);
    bars.position.set(x, 0, 0);
    let y = -0.45;
    for (let f = 0; f < 3; f++) {
      const h = Math.max(1e-3, cur[f] * COL_H);
      barMeshes[f].scale.set(1, h, 1);
      barMeshes[f].position.y = y - h / 2;
      barMeshes[f].visible = cur[f] > 1e-4;
      y -= h;
    }
    eNu.position.set(S.x + (D.x - S.x) * u, S.y + (D.y - S.y) * u, 0.05);
    eGlow.position.copy(eNu.position);
    (eNu.material as THREE.MeshBasicMaterial).color.copy(mix);
    eGlow.material.color.copy(mix);
  }

  function updateWaves(): void {
    for (let i = 0; i < 3; i++) {
      const yv = waveY[i];
      const A = amp[i] * fade[i];
      for (let j = 0; j <= NW; j++) {
        const s = j / NW;
        yv[j] = WY[i] + A * Math.cos(K0 * s * PLEN - kRel[i] * s * L - wt);
      }
      const pos = wavePos[i];
      const hw = 0.035;
      const dx = PLEN / NW;
      for (let j = 0; j <= NW; j++) {
        const jm = j > 0 ? j - 1 : j, jp = j < NW ? j + 1 : j;
        const dy = (yv[jp] - yv[jm]) / ((jp - jm) * dx);
        const n = 1 / Math.sqrt(1 + dy * dy);
        const nx = -dy * n * hw, ny = n * hw;
        const x = PX0 + j * dx;
        const o = j * 6;
        pos[o] = x + nx; pos[o + 1] = yv[j] + ny; pos[o + 2] = 0;
        pos[o + 3] = x - nx; pos[o + 4] = yv[j] - ny; pos[o + 5] = 0;
      }
      waves[i].geometry.attributes.position.needsUpdate = true;
      (waves[i].material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * fade[i];
    }
    // nu1 crests: K0 s PLEN - wt = 2 pi n
    let n = 0;
    const lam = (2 * Math.PI) / K0;
    const x0 = ((wt / K0) % lam + lam) % lam;
    for (let d = x0; d <= PLEN && n < MAX_TICKS; d += lam) {
      const o = n * 6;
      tickPos[o] = PX0 + d; tickPos[o + 1] = WY[0] - 0.45; tickPos[o + 2] = -0.02;
      tickPos[o + 3] = PX0 + d; tickPos[o + 4] = WY[2] + 0.45; tickPos[o + 5] = -0.02;
      n++;
    }
    tickGeo.setDrawRange(0, n * 2);
    tickGeo.attributes.position.needsUpdate = true;
  }

  function phase(): number {
    const d = model === '2f' ? dm2 : Math.abs(order === 'no' ? NUFIT_NO.dm31 : NUFIT_IO.dm31);
    return (K * d * L) / E;
  }

  function updateLegend(): void {
    const nm = (f: number) => `${anti ? FL_NAME[f].replace('ν', 'ν̄') : FL_NAME[f]}`;
    const pc = (f: number) => `<span style="color:${css(FL_COL[f])}">${nm(f)} ${(det[f] * 100).toFixed(det[f] < 0.1 && det[f] > 0.001 ? 1 : 0)}%</span>`;
    const waveLine = MS_NAME.map((n, i) => `<span style="color:${css(MS_COL[i])}">${n}</span>`).join(' ');
    const html = `<div style="color:#dfe6f3;font:600 14px/1.3 'Space Grotesk',sans-serif;margin-bottom:3px">${nm(start)} → ${fmtL(L)} at ${fmtE(E)}</div>
<div>at detector: ${pc(0)} · ${pc(1)} · ${pc(2)}</div>
<div style="margin-top:3px">waves ${waveLine}: mass states${matterActive() ? ' in matter' : ''}. Ticks mark ν₁ crests.</div>
<div style="color:#8391ab">Crests back in line: birth flavour returns.</div>
${model === '2f' ? `<div style="color:#8391ab">2 flavours: θ = ${theta2}°, Δm² = ${dm2.toExponential(2)} eV²</div>` : `<div style="color:#8391ab">NuFIT 6.0, ${order === 'no' ? 'normal' : 'inverted'} ordering, δ = ${deltaDeg}°</div>`}
${matterActive() ? `<div style="color:${css(PALETTE.amber)}">constant-density matter, ρ = ${rho.toFixed(1)} g/cm³</div>` : matter ? `<div style="color:#8391ab">matter off: path does not cross Earth</div>` : ''}`;
    if (html !== legendHtml) {
      legend.innerHTML = html;
      legendHtml = html;
    }
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Experiment');
  const presetCtl = ui.select<PresetId>({
    key: 'preset', label: 'Preset', value: preset,
    options: (Object.keys(PRESETS) as Exclude<PresetId, 'custom'>[]).map((k) => ({ value: k, label: PRESETS[k].label })),
    onChange: (v) => applyPreset(v),
  });
  const startCtl = ui.select<Flav>({
    key: 'start', label: 'Starting flavour', value: FLAVS[start],
    options: [{ value: 'e', label: 'νe' }, { value: 'mu', label: 'νμ' }, { value: 'tau', label: 'ντ' }],
    onChange: (v) => { start = FLAVS.indexOf(v); u = 0; recompute(); },
  });
  const antiCtl = ui.toggle({ key: 'anti', label: 'Antineutrino (ν̄)', value: anti, onChange: (v) => { anti = v; recompute(); } });
  const eCtl = ui.slider({
    key: 'E', label: 'Energy E', min: -4, max: 2, step: 0.005, value: Math.log10(E), format: (v) => fmtE(10 ** v),
    onInput: (v) => { E = 10 ** v; eTouched = true; recompute(); },
  });
  const lCtl = ui.slider({
    key: 'L', label: 'Baseline L', min: 0, max: 8.2, step: 0.002, value: Math.log10(L), format: (v) => fmtL(10 ** v),
    onInput: (v) => { L = 10 ** v; setCustom(); recompute(); },
  });

  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Restart flight', onClick: () => { u = 0; hold = 0; updateTravel(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Flight speed', min: 0.1, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: 'both',
    options: [{ value: 'both', label: 'Both' }, { value: 'path', label: 'Flight path' }, { value: 'earth', label: 'Earth' }],
    onChange: (v) => {
      if (v === 'both') stage.flyTo(CAM_BOTH, TGT_BOTH);
      if (v === 'path') stage.flyTo([-3.1, 1.5, 15], [-3.1, 0.6, 0]);
      if (v === 'earth') stage.flyTo([EC.x, EC.y + 0.8, 8.5], [EC.x, EC.y + 0.6, 0]);
    },
  });

  ui.section('Mixing model');
  const modelCtl = ui.select<Model>({
    key: 'model', label: 'Model', value: model,
    options: [{ value: '3f', label: '3 flavours (NuFIT 6.0)' }, { value: '2f', label: '2 flavours' }],
    onChange: (v) => { model = v; recompute(); },
  });
  const orderCtl = ui.select<Order>({
    key: 'order', label: 'Mass ordering', value: order,
    options: [{ value: 'no', label: 'Normal' }, { value: 'io', label: 'Inverted' }],
    onChange: (v) => {
      order = v;
      deltaDeg = v === 'no' ? 177 : 285;
      deltaCtl.set(deltaDeg, false);
      to3f();
      recompute();
    },
  });
  const deltaCtl: Control<number> = ui.slider({
    key: 'delta', label: 'CP phase δ', min: 0, max: 359, step: 1, value: deltaDeg, unit: '°',
    onInput: (v) => { deltaDeg = v; to3f(); recompute(); },
  });
  ui.note('Two-flavour sliders (moving one switches the model):');
  ui.slider({
    key: 'theta', label: 'Mixing angle θ', min: 0, max: 90, step: 1, value: theta2, unit: '°',
    onInput: (v) => { theta2 = v; to2f(); recompute(); },
  });
  ui.slider({
    key: 'dm2', label: 'Splitting Δm²', min: 0, max: 5, step: 0.01, value: dm2 * 1e3, format: (v) => (v === 0 ? '0' : `${v.toFixed(2)}×10⁻³`), unit: 'eV²',
    onInput: (v) => { dm2 = v * 1e-3; to2f(); recompute(); },
  });

  ui.section('Matter (simplified)');
  const matterCtl = ui.toggle({ key: 'matter', label: 'Constant-density matter (MSW)', value: matter, onChange: (v) => { matter = v; recompute(); } });
  const rhoCtl = ui.slider({ key: 'rho', label: 'Density ρ', min: 0.5, max: 13, step: 0.05, value: rho, unit: 'g/cm³', onInput: (v) => { rho = v; if (matter) recompute(); } });
  ui.note('One uniform density, electron fraction 0.5. Fair for beams through the crust. Rough for core-crossing paths. Only used when L is at most one Earth diameter.');

  ui.section('At the detector');
  const rPe = ui.readout('P', 'P(→ νe)');
  const rPm = ui.readout('P', 'P(→ νμ)');
  const rPt = ui.readout('P', 'P(→ ντ)');
  const rSum = ui.readout('unit', 'accuracy |ΣP − 1|');
  const rPh = ui.readout('phase', 'phase 1.27Δm²L/E', 'rad');
  const rLE = ui.readout('LE', 'L/E', 'km/GeV');
  const rLosc = ui.readout('losc', 'oscillation length');
  const rTof = ui.readout('tof', 'flight time L/c');
  const rPos = ui.readout('pos', 'travelling ν at');
  ui.note('Detector values average over ±0.5% of L, like a real source and detector of finite size.');
  ui.legend([
    { color: css(FL_COL[0]), label: 'νe' },
    { color: css(FL_COL[1]), label: 'νμ' },
    { color: css(FL_COL[2]), label: 'ντ' },
    { color: css(MS_COL[0]), label: 'ν₁' },
    { color: css(MS_COL[1]), label: 'ν₂' },
    { color: css(MS_COL[2]), label: 'ν₃' },
  ]);

  function to2f(): void {
    if (model !== '2f') { model = '2f'; modelCtl.set('2f', false); }
  }
  function to3f(): void {
    if (model !== '3f') { model = '3f'; modelCtl.set('3f', false); }
  }
  function setCustom(): void {
    if (preset !== 'custom') {
      preset = 'custom';
      presetCtl.set('custom', false);
      srcName = 'source';
      detName = 'detector';
    }
  }

  function applyPreset(id: PresetId): void {
    if (id === 'custom') return;
    const p = PRESETS[id];
    preset = id;
    E = p.E;
    L = p.L;
    start = p.start;
    anti = p.anti;
    srcName = p.src;
    detName = p.det;
    if (p.rho > 0) { rho = p.rho; rhoCtl.set(rho, false); }
    eCtl.set(Math.log10(E), false);
    lCtl.set(Math.log10(L), false);
    startCtl.set(FLAVS[start], false);
    antiCtl.set(anti, false);
    eTouched = false;
    u = 0;
    hold = 0;
    recompute();
  }

  function updateReadouts(): void {
    rPe(det[0].toFixed(3));
    rPm(det[1].toFixed(3));
    rPt(det[2].toFixed(3));
    rSum(Math.abs(det[0] + det[1] + det[2] - 1).toExponential(1));
    const ph = phase();
    rPh(ph < 1e4 ? ph.toFixed(2) : ph.toExponential(2));
    const le = L / E;
    rLE(le < 1e5 ? le.toFixed(0) : le.toExponential(2));
    const d = model === '2f' ? dm2 : Math.abs(order === 'no' ? NUFIT_NO.dm31 : NUFIT_IO.dm31);
    const lo = oscLength(d, E);
    rLosc(Number.isFinite(lo) ? fmtL(lo) : '∞ (no splitting)');
    const tof = (L / 299792.458) * 1000;
    rTof(tof < 1000 ? `${tof.toPrecision(3)} ms` : `${(tof / 1000).toPrecision(3)} s`);
    rPos(fmtL(u * L));
  }

  // --- Frame loop
  let uiTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) u = 0;
      } else {
        u += (dt * speed) / TRIP;
        if (u >= 1) { u = 1; hold = 0.9; }
      }
      wt += dt * speed * 2.2;
      updateTravel();
    }
    updateWaves();
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      drawPlot();
      rPos(fmtL(u * L));
    }
  });

  // --- Init
  matterCtl.set(matter, false);
  orderCtl.set(order, false);
  recompute();
  updateWaves();

  return {
    state: () => ({
      model,
      preset,
      start: FLAVS[start],
      anti,
      E,
      L,
      theta: theta2,
      dm2,
      order,
      delta: deltaDeg,
      matter: matterActive(),
      rho,
      pe: det[0],
      pmu: det[1],
      ptau: det[2],
      psurv: det[start],
      phase: phase(),
      eTouched,
      u,
    }),
    dispose: () => {
      legend.remove();
      plot.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'neutrino-oscillations',
  number: 55,
  title: 'Neutrino Oscillations',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Ghostly particles that change identity as they fly.',
  content,
  mount,
};

export default topic;
