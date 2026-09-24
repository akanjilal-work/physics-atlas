import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  B_CMS, GEO, M_H, M_W, M_Z, PBWO4, generateEvent, heitlerTmax, mulberry32, pT, peakEstimate, radiusFromPT,
  reconstruct, trace, type EventType, type GenEvent, type Kind, type RecoEvent,
} from './physics.ts';

type Choice = EventType | 'mystery';
type View = '3d' | 'end';
type V3 = [number, number, number];

const DS = 0.03; // tracking step (m)
const MAXP = 420; // points per track
const POOL = 72; // track lines
const DEP_N = 110; // calorimeter towers
const HIT_N = 40; // muon chamber hits
const VS = 11; // visual speed of light (scene metres per second)
const TAU_END = 1.25; // seconds for a full event animation

const CAM: Record<View, { pos: V3; target: V3 }> = {
  '3d': { pos: [14, 6.6, 8.8], target: [0, -0.3, 0.2] },
  end: { pos: [0, 0, 19], target: [0, 0, 0] },
};
// Keep a 270° sector. The removed quarter faces the default camera.
const CUT_MID = Math.atan2(CAM['3d'].pos[1], CAM['3d'].pos[0]);
const KEEP0 = CUT_MID + Math.PI / 4;
const KEEP_LEN = 1.5 * Math.PI;

const COLOR: Record<Kind, number> = {
  e: PALETTE.amber,
  mu: PALETTE.rose,
  gamma: 0xfff1a8,
  hpm: PALETTE.cyan,
  h0: PALETTE.violet,
  nu: PALETTE.red,
};
const ECAL_COL = PALETTE.green;
const HCAL_COL = 0x5b8cff;
const MET_COL = PALETTE.red;
const MUON_COL = 0xb88aa6;

interface Hist { lo: number; hi: number; nb: number; bins: Float64Array; n: number; label: string; ref: number; refLabel: string }
const mkHist = (lo: number, hi: number, nb: number, label: string, ref: number, refLabel: string): Hist => ({ lo, hi, nb, bins: new Float64Array(nb), n: 0, label, ref, refLabel });

const TYPE_LABEL: Record<EventType, string> = {
  zmm: 'Z → μ⁺μ⁻', zee: 'Z → e⁺e⁻', hgg: 'H → γγ', wen: 'W → eν', jets: 'dijet',
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM['3d'].pos, target: CAM['3d'].target, fov: 42, far: 400 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  // Everything detector-shaped lives in det. The end-on view flattens it along z.
  const det = new THREE.Group();
  scene.add(det);
  const layersG = new THREE.Group();
  det.add(layersG);
  const groups = {
    tracker: new THREE.Group(), ecal: new THREE.Group(), hcal: new THREE.Group(), magnet: new THREE.Group(), muon: new THREE.Group(),
  };
  for (const g of Object.values(groups)) layersG.add(g);
  const layerVis = { tracker: true, ecal: true, hcal: true, magnet: true, muon: true };

  // Beam line
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -11, 0, 0, 11], 3));
    det.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x56627c, transparent: true, opacity: 0.8 })));
  }
  const vertex = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  det.add(vertex);

  // --- Layer geometry (rebuilt only when the view changes)
  const built: { geo: THREE.BufferGeometry; mat: THREE.Material; obj: THREE.Object3D; parent: THREE.Group }[] = [];

  function shape(rIn: number, rOut: number, full: boolean): THREE.Shape {
    const s = new THREE.Shape();
    if (full) {
      s.absarc(0, 0, rOut, 0, 2 * Math.PI, false);
      const h = new THREE.Path();
      h.absarc(0, 0, rIn, 0, 2 * Math.PI, true);
      s.holes.push(h);
      return s;
    }
    const a0 = KEEP0;
    const a1 = KEEP0 + KEEP_LEN;
    s.moveTo(rOut * Math.cos(a0), rOut * Math.sin(a0));
    s.absarc(0, 0, rOut, a0, a1, false);
    s.lineTo(rIn * Math.cos(a1), rIn * Math.sin(a1));
    s.absarc(0, 0, rIn, a1, a0, true);
    s.closePath();
    return s;
  }

  function piece(parent: THREE.Group, rIn: number, rOut: number, z0: number, z1: number, full: boolean, color: number, opacity: number, edge: number): void {
    const geo = new THREE.ExtrudeGeometry(shape(rIn, rOut, full), { depth: z1 - z0, bevelEnabled: false, curveSegments: full ? 72 : 54 });
    geo.translate(0, 0, z0);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    parent.add(mesh);
    built.push({ geo, mat, obj: mesh, parent });
    if (edge > 0) {
      const eg = new THREE.EdgesGeometry(geo, 25);
      const em = new THREE.LineBasicMaterial({ color, transparent: true, opacity: edge, depthWrite: false });
      const lines = new THREE.LineSegments(eg, em);
      lines.renderOrder = 1;
      parent.add(lines);
      built.push({ geo: eg, mat: em, obj: lines, parent });
    }
  }

  function buildLayers(full: boolean): void {
    for (const b of built) { b.parent.remove(b.obj); b.geo.dispose(); b.mat.dispose(); }
    built.length = 0;
    const caps = !full; // endcaps only in the cutaway, and only on the far (−z) side
    const T = GEO.tracker;
    for (let li = 0; li < GEO.trackerLayers.length; li += 2) {
      // Every other layer is drawn, to keep the view readable.
      const r = GEO.trackerLayers[li === GEO.trackerLayers.length - 2 ? li + 1 : li];
      const zh = r < 0.12 ? 0.55 : T.zOut;
      piece(groups.tracker, r, r + 0.01, -zh, zh, full, 0x9fb6dd, 0.1, r > 1 ? 0.5 : 0.18);
    }
    if (caps) for (const z of [1.3, 1.8, 2.3, 2.7]) piece(groups.tracker, 0.23, T.rOut, -z - 0.01, -z, full, 0x9fb6dd, 0.08, 0.15);
    const E = GEO.ecal;
    piece(groups.ecal, E.rIn, E.rOut, -E.zIn, E.zIn, full, ECAL_COL, 0.16, 0.45);
    if (caps) piece(groups.ecal, 0.32, E.rOut, -E.zOut, -E.zIn, full, ECAL_COL, 0.12, 0.35);
    const H = GEO.hcal;
    piece(groups.hcal, H.rIn, H.rOut, -H.zIn, H.zIn, full, HCAL_COL, 0.12, 0.45);
    if (caps) piece(groups.hcal, 0.35, H.rOut, -H.zOut, -H.zIn, full, HCAL_COL, 0.1, 0.3);
    const C = GEO.coil;
    piece(groups.magnet, C.rIn, C.rOut, -C.zOut, C.zOut, full, 0xc9d3e6, 0.2, 0.55);
    const Y = GEO.yoke;
    const iron: [number, number][] = [[3.5, 3.72], [3.88, 4.32], [4.48, 4.92], [5.08, 5.52]];
    for (const [a, b] of iron) piece(groups.magnet, a, b, -Y.zOut, Y.zOut, full, 0x7a5048, 0.045, 0.08);
    for (const r of GEO.muonStations) piece(groups.muon, r - 0.05, r + 0.05, -Y.zOut, Y.zOut, full, MUON_COL, 0.09, 0.45);
    if (caps) for (const z of GEO.muonDisks) piece(groups.muon, 0.9, 5.65, -z - 0.05, -z + 0.05, full, MUON_COL, 0.03, 0.12);
  }

  // Layer labels, placed on the cut face
  const labelAt = (text: string, r: number, z: number, col: number, other = false) => {
    const a = other ? KEEP0 + KEEP_LEN + 0.05 : KEEP0 - 0.05;
    const l = stage.label(text, [r * Math.cos(a), r * Math.sin(a), z], 'muted', det);
    l.element.style.color = css(col);
    l.element.style.fontSize = '11px';
    return l;
  };
  const layerLabels: CSS2DObject[] = [
    labelAt('silicon tracker', 0.62, 3.4, 0x9fb6dd),
    labelAt('ECAL', 1.42, 4.1, ECAL_COL),
    labelAt('HCAL', 2.35, 4.9, HCAL_COL),
    labelAt(`solenoid`, 3.2, 4.6, 0xc9d3e6),
    labelAt('iron yoke + muon chambers', 4.7, 5.6, MUON_COL, true),
  ];

  // --- Tracks
  interface TrackSlot { line: THREE.Line; pos: Float32Array; mat: THREE.LineBasicMaterial; n: number; tEnd: number; active: boolean }
  const tracks: TrackSlot[] = [];
  const tracksG = new THREE.Group();
  det.add(tracksG);
  for (let i = 0; i < POOL; i++) {
    const pos = new Float32Array(MAXP * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false });
    const line = new THREE.Line(g, mat);
    line.frustumCulled = false;
    line.renderOrder = 5;
    line.visible = false;
    tracksG.add(line);
    tracks.push({ line, pos, mat, n: 0, tEnd: 0, active: false });
  }

  // --- Calorimeter towers and shower flashes
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const towers = new THREE.InstancedMesh(boxGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }), DEP_N);
  towers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  towers.frustumCulled = false;
  towers.renderOrder = 6;
  det.add(towers);
  const flashes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), DEP_N);
  flashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flashes.frustumCulled = false;
  flashes.renderOrder = 7;
  det.add(flashes);
  const dep = {
    n: 0,
    pos: new Float32Array(DEP_N * 3),
    dir: new Float32Array(DEP_N * 3),
    len: new Float32Array(DEP_N),
    w: new Float32Array(DEP_N),
    t: new Float32Array(DEP_N),
    col: new Uint32Array(DEP_N),
    fl: new Float32Array(DEP_N),
  };
  const hits = new THREE.InstancedMesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffb3d9, depthTest: false, transparent: true }), HIT_N);
  hits.renderOrder = 6;
  hits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  hits.frustumCulled = false;
  det.add(hits);
  const hit = { n: 0, pos: new Float32Array(HIT_N * 3), t: new Float32Array(HIT_N) };

  // Missing transverse momentum arrow
  const metArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, MET_COL, 0.5, 0.3);
  metArrow.visible = false;
  det.add(metArrow);
  const metLabel = stage.label('', [0, 0, 0], '', det);
  metLabel.element.style.color = css(MET_COL);
  metLabel.visible = false;

  // Object labels (leptons, photons)
  const objLabels: { l: CSS2DObject; t: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const l = stage.label('', [0, 0, 0], '', det);
    l.visible = false;
    l.element.style.fontSize = '11px';
    objLabels.push({ l, t: 0 });
  }

  // --- Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '260px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number, dashed = false) => `<i style="display:inline-block;width:14px;height:0;border-top:2px ${dashed ? 'dashed' : 'solid'} ${css(c)};vertical-align:middle;margin-right:6px"></i>`;
  const box = (c: number) => `<i style="display:inline-block;width:9px;height:9px;background:${css(c)};vertical-align:middle;margin:0 2px 0 4px;border-radius:2px"></i>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">signatures</div>
${sw(COLOR.e)}electron: track ${box(ECAL_COL)} ECAL<br>
${sw(COLOR.gamma, true)}photon: no track ${box(ECAL_COL)} ECAL<br>
${sw(COLOR.mu)}muon: track, crosses everything<br>
${sw(COLOR.hpm)}charged hadron: track ${box(HCAL_COL)} HCAL<br>
${sw(COLOR.h0, true)}neutral hadron: ${box(HCAL_COL)} HCAL only<br>
${sw(MET_COL)}neutrino: missing p<sub>T</sub> arrow`;
  viewport.appendChild(legend);

  const histC = document.createElement('canvas');
  histC.width = 480;
  histC.height = 280;
  Object.assign(histC.style, {
    position: 'absolute', right: '10px', top: '10px', width: '240px', height: '140px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(histC);
  const hctx = histC.getContext('2d')!;

  const showerC = document.createElement('canvas');
  showerC.width = 480;
  showerC.height = 200;
  showerC.className = 'stage-overlay';
  Object.assign(showerC.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '240px', height: '100px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(showerC);
  const sctx = showerC.getContext('2d')!;

  // --- State
  const rng = mulberry32(20120704);
  let choice: Choice = 'zmm';
  let B = B_CMS;
  let view: View = '3d';
  let nRun = 300;
  let auto = true;
  let touched = false;
  let muonIdentified = false;
  let neutrinoFound = false;
  let straightSeen = false;
  let idCorrect = 0;
  let idTotal = 0;
  let guessed = false;
  let queue = 0;
  let batch = 1;
  let tau = 0;
  let idle = 0;
  let zTarget = 1;
  let ev: GenEvent | null = null;
  let rec: RecoEvent | null = null;
  let evB = B;
  let leadPt = 0;
  let nCharged = 0;
  let emE = 0;
  let emKind: Kind = 'e';

  const hists: Record<EventType, Hist> = {
    zmm: mkHist(60, 120, 60, 'M(μμ)', M_Z, 'M_Z'),
    zee: mkHist(60, 120, 60, 'M(ee)', M_Z, 'M_Z'),
    hgg: mkHist(100, 160, 30, 'M(γγ)', M_H, 'M_H'),
    wen: mkHist(40, 120, 40, 'mT(eν)', M_W, 'M_W'),
    jets: mkHist(0, 800, 40, 'M(jj)', NaN, ''),
  };

  function fill(e: GenEvent, r: RecoEvent): void {
    if (!Number.isFinite(r.mass)) return;
    const h = hists[e.type];
    const i = Math.floor(((r.mass - h.lo) / (h.hi - h.lo)) * h.nb);
    h.n++;
    if (i >= 0 && i < h.nb) h.bins[i]++;
  }

  function simulate(): void {
    const t: EventType = choice === 'mystery' ? (['zmm', 'zee', 'hgg', 'wen', 'jets'] as EventType[])[Math.floor(rng() * 5)] : choice;
    ev = generateEvent(t, rng, choice === 'mystery' ? 1 : 0.14);
    rec = reconstruct(ev, B, rng);
    evB = B;
    fill(ev, rec);
  }

  // --- Build the display for the current event
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();

  function addDeposit(x: number, y: number, z: number, E: number, ecal: boolean, t: number): void {
    if (dep.n >= DEP_N || E < 0.3) return;
    const i = dep.n++;
    const r = Math.hypot(x, y, z) || 1;
    dep.pos[i * 3] = x; dep.pos[i * 3 + 1] = y; dep.pos[i * 3 + 2] = z;
    dep.dir[i * 3] = x / r; dep.dir[i * 3 + 1] = y / r; dep.dir[i * 3 + 2] = z / r;
    dep.len[i] = ecal ? 0.08 + 0.17 * Math.log(1 + E) : 0.1 + 0.2 * Math.log(1 + E);
    dep.w[i] = ecal ? 0.09 + 0.012 * Math.log(1 + E) : 0.16 + 0.02 * Math.log(1 + E);
    dep.t[i] = t;
    dep.col[i] = ecal ? ECAL_COL : HCAL_COL;
    dep.fl[i] = 0.06 + 0.045 * Math.log(1 + E);
  }

  function display(): void {
    if (!ev || !rec) return;
    for (const tr of tracks) { tr.active = false; tr.line.visible = false; }
    dep.n = 0;
    hit.n = 0;
    for (const o of objLabels) o.l.visible = false;
    let slot = 0;
    leadPt = 0;
    nCharged = 0;
    emE = 0;
    let nLab = 0;
    const order = ev.particles.map((_, i) => i).sort((a, b) => pT(ev!.particles[b].p) - pT(ev!.particles[a].p));
    for (const idx of order) {
      const pa = ev.particles[idx];
      const rc = rec.reco[idx];
      if (pa.kind === 'nu') continue;
      if (slot >= POOL) break;
      const tr = tracks[slot++];
      const res = trace(pa, evB, DS, tr.pos, MAXP);
      tr.n = res.n;
      tr.tEnd = ((res.n - 1) * DS) / VS;
      tr.active = true;
      tr.line.visible = true;
      tr.line.geometry.setDrawRange(0, 0);
      (tr.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      tr.mat.color.setHex(COLOR[pa.kind]);
      tr.mat.opacity = pa.kind === 'gamma' || pa.kind === 'h0' ? 0.45 : pa.soft ? 0.6 : 1;
      const k = (res.n - 1) * 3;
      const ex = tr.pos[k], ey = tr.pos[k + 1], ez = tr.pos[k + 2];
      if (pa.q !== 0) {
        nCharged++;
        // Muon momentum comes only from the bend. With B = 0 it is unmeasured.
        if (pa.kind !== 'mu' || rc.p) leadPt = Math.max(leadPt, pa.kind === 'mu' ? pT(rc.p!) : pT(pa.p));
      }
      if (res.stop === 'ecal') {
        addDeposit(ex, ey, ez, rc.ecal || pa.p.E, true, tr.tEnd);
        if (pa.p.E > emE) { emE = pa.p.E; emKind = pa.kind; }
      } else if (res.stop === 'hcal') {
        // Hadrons leave a small ECAL signal on the way through, then shower in the HCAL.
        addDeposit(ex, ey, ez, rc.hcal || pa.p.E, false, tr.tEnd);
      }
      for (const hi of res.hits) {
        if (hit.n >= HIT_N) break;
        const j = hit.n++;
        hit.pos[j * 3] = tr.pos[hi * 3]; hit.pos[j * 3 + 1] = tr.pos[hi * 3 + 1]; hit.pos[j * 3 + 2] = tr.pos[hi * 3 + 2];
        hit.t[j] = (hi * DS) / VS;
      }
      if (!pa.soft && ev.type !== 'jets' && nLab < objLabels.length && (pa.kind === 'e' || pa.kind === 'mu' || pa.kind === 'gamma') && pT(pa.p) > 10) {
        const o = objLabels[nLab++];
        const name = pa.kind === 'mu' ? (pa.q > 0 ? 'μ⁺' : 'μ⁻') : pa.kind === 'e' ? (pa.q > 0 ? 'e⁺' : 'e⁻') : 'γ';
        const mom = pa.kind === 'mu' ? (rc.p ? `${pT(rc.p).toFixed(1)} GeV` : 'p unknown') : `${(rc.ecal * Math.hypot(pa.p.px, pa.p.py) / pa.p.E).toFixed(1)} GeV`;
        o.l.element.textContent = `${name} ${mom}`;
        o.l.element.style.color = css(COLOR[pa.kind]);
        const f = pa.kind === 'mu' ? 1.02 : 1.25;
        o.l.position.set(ex * f, ey * f, ez * f);
        o.t = tr.tEnd;
      }
    }
    for (let i = slot; i < POOL; i++) tracks[i].active = false;
    // Missing pT arrow
    const metLen = Math.min(6.5, rec.met / 8);
    if (rec.met > 4) {
      metArrow.setDirection(va.set(Math.cos(rec.metPhi), Math.sin(rec.metPhi), 0));
      metArrow.setLength(Math.max(0.6, metLen), 0.5, 0.3);
      metLabel.position.set(Math.cos(rec.metPhi) * (metLen + 0.7), Math.sin(rec.metPhi) * (metLen + 0.7), 0);
      metLabel.element.textContent = `missing pT ${rec.met.toFixed(0)} GeV`;
    }
    metArrow.visible = false;
    metLabel.visible = false;
    towers.count = dep.n;
    flashes.count = dep.n;
    hits.count = hit.n;
    tau = 0;
    idle = 0;
    guessed = false;
    if (Math.abs(evB) < 0.05 && nCharged > 0 && touched) straightSeen = true;
    if (ev.type === 'wen' && rec.met > 30 && touched) neutrinoFound = true;
    drawShower();
    drawHist();
    updateEventText();
    animate(0);
  }

  function animate(dt: number): void {
    tau += dt;
    for (const tr of tracks) {
      if (!tr.active) continue;
      const cnt = Math.min(tr.n, 1 + Math.floor((tau * VS) / DS));
      tr.line.geometry.setDrawRange(0, cnt);
    }
    for (let i = 0; i < dep.n; i++) {
      const u = (tau - dep.t[i]) / 0.18;
      const k = u <= 0 ? 0 : Math.min(1, u);
      const len = Math.max(1e-4, dep.len[i] * k);
      const w = k > 0 ? dep.w[i] : 1e-4;
      vb.set(dep.dir[i * 3], dep.dir[i * 3 + 1], dep.dir[i * 3 + 2]);
      q.setFromUnitVectors(up, vb);
      va.set(dep.pos[i * 3], dep.pos[i * 3 + 1], dep.pos[i * 3 + 2]).addScaledVector(vb, len / 2);
      m4.compose(va, q, sc.set(w, len, w));
      towers.setMatrixAt(i, m4);
      col.setHex(dep.col[i]);
      towers.setColorAt(i, col);
      // Flash: bright at impact, fading over 0.7 s
      const fu = tau - dep.t[i];
      const fk = fu < 0 ? 0 : Math.max(0, 1 - fu / 0.7);
      va.set(dep.pos[i * 3], dep.pos[i * 3 + 1], dep.pos[i * 3 + 2]);
      m4.compose(va, q.identity(), sc.setScalar(fk > 0 ? dep.fl[i] * (0.6 + 1.2 * (1 - fk)) : 1e-4));
      flashes.setMatrixAt(i, m4);
      col.setHex(dep.col[i]).multiplyScalar(fk * 0.7);
      flashes.setColorAt(i, col);
    }
    if (dep.n) {
      towers.instanceMatrix.needsUpdate = true;
      flashes.instanceMatrix.needsUpdate = true;
      if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
      if (flashes.instanceColor) flashes.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < hit.n; i++) {
      const s = tau >= hit.t[i] ? 1 : 1e-4;
      va.set(hit.pos[i * 3], hit.pos[i * 3 + 1], hit.pos[i * 3 + 2]);
      vb.set(va.x, va.y, 0).normalize();
      q.setFromUnitVectors(up, vb.lengthSq() > 0 ? vb : up);
      m4.compose(va, q, sc.set(0.32 * s, 0.14 * s, 0.32 * s));
      hits.setMatrixAt(i, m4);
    }
    if (hit.n) hits.instanceMatrix.needsUpdate = true;
    const showMet = !!rec && rec.met > 4 && tau > 0.75;
    metArrow.visible = showMet;
    metLabel.visible = showMet;
    for (const o of objLabels) if (o.l.element.textContent) o.l.visible = tau >= o.t && o.t > 0;
    const vf = tau < 0.25 ? 1 + 3 * (1 - tau / 0.25) : 1;
    vertex.scale.setScalar(vf);
  }

  // --- Insets
  function drawHist(): void {
    const W = histC.width;
    const H = histC.height;
    hctx.clearRect(0, 0, W, H);
    hctx.font = '22px JetBrains Mono, monospace';
    if (choice === 'mystery') {
      hctx.fillStyle = '#8391ab';
      hctx.fillText('mystery mode', 18, 36);
      hctx.fillText('histogram hidden until', 18, 90);
      hctx.fillText('you make your call', 18, 120);
      return;
    }
    const h = hists[choice];
    const x0 = 44, x1 = W - 16, y0 = H - 44, y1 = 58;
    let mx = 1;
    for (let i = 0; i < h.nb; i++) mx = Math.max(mx, h.bins[i]);
    hctx.fillStyle = '#8391ab';
    hctx.fillText(`${h.label}  ·  ${h.n} events`, 16, 32);
    // axis
    hctx.strokeStyle = '#2c3852';
    hctx.lineWidth = 2;
    hctx.beginPath();
    hctx.moveTo(x0, y0); hctx.lineTo(x1, y0);
    hctx.stroke();
    const bw = (x1 - x0) / h.nb;
    hctx.fillStyle = choice === 'zmm' ? css(COLOR.mu) : choice === 'hgg' ? css(COLOR.gamma) : choice === 'jets' ? css(COLOR.hpm) : css(COLOR.e);
    for (let i = 0; i < h.nb; i++) {
      const v = h.bins[i];
      if (!v) continue;
      const hh = ((y0 - y1) * v) / mx;
      hctx.fillRect(x0 + i * bw + 1, y0 - hh, Math.max(1, bw - 2), hh);
    }
    // ticks
    hctx.fillStyle = '#56627c';
    hctx.font = '19px JetBrains Mono, monospace';
    const step = h.hi - h.lo > 200 ? 200 : 20;
    for (let v = Math.ceil(h.lo / step) * step; v <= h.hi; v += step) {
      const x = x0 + ((v - h.lo) / (h.hi - h.lo)) * (x1 - x0);
      hctx.fillText(String(v), x - 16, y0 + 26);
    }
    hctx.fillText('GeV', x1 - 40, y1 - 10);
    // reference line
    if (Number.isFinite(h.ref)) {
      const x = x0 + ((h.ref - h.lo) / (h.hi - h.lo)) * (x1 - x0);
      hctx.strokeStyle = 'rgba(223,230,243,0.5)';
      hctx.setLineDash([6, 6]);
      hctx.beginPath();
      hctx.moveTo(x, y0); hctx.lineTo(x, y1 - 4);
      hctx.stroke();
      hctx.setLineDash([]);
    }
    if ((choice === 'zmm' || choice === 'zee') && h.n >= 30) {
      const pk = peakEstimate(h.bins, h.lo, (h.hi - h.lo) / h.nb, 4);
      hctx.fillStyle = '#dfe6f3';
      hctx.font = '20px JetBrains Mono, monospace';
      hctx.fillText(`peak ${pk.toFixed(1)}`, x0 + 4, y1 + 2);
    }
    if (choice === 'wen') {
      hctx.fillStyle = '#9aa6bd';
      hctx.font = '19px JetBrains Mono, monospace';
      hctx.fillText('edge at M(W)', x0 + 4, y1 + 2);
    }
  }

  function drawShower(): void {
    const W = showerC.width;
    const H = showerC.height;
    sctx.clearRect(0, 0, W, H);
    const ref = emE <= 0;
    const E0 = ref ? 50 : emE;
    const tmax = heitlerTmax(E0, PBWO4.EcGeV);
    sctx.font = '20px JetBrains Mono, monospace';
    sctx.fillStyle = '#8391ab';
    const who = ref ? '50 GeV e (example)' : `${emKind === 'gamma' ? 'γ' : 'e'} ${E0.toFixed(0)} GeV`;
    sctx.fillText(`EM shower in PbWO₄ · ${who}`, 14, 28);
    const x0 = 16, x1 = W - 16, yc = 106, half = 54;
    const LX = 25.8; // crystal depth in X0
    const xOf = (t: number) => x0 + (t / LX) * (x1 - x0);
    // crystal outline
    sctx.strokeStyle = '#243049';
    sctx.lineWidth = 2;
    sctx.strokeRect(x0, yc - half - 4, x1 - x0, 2 * half + 8);
    // envelope past the drawn generations
    const gShow = Math.min(6, Math.floor(tmax));
    sctx.fillStyle = 'rgba(94,227,154,0.16)';
    sctx.beginPath();
    sctx.moveTo(xOf(gShow), yc - half * 0.95);
    sctx.lineTo(xOf(tmax), yc - half);
    sctx.lineTo(Math.min(x1, xOf(tmax + 7)), yc - 6);
    sctx.lineTo(Math.min(x1, xOf(tmax + 7)), yc + 6);
    sctx.lineTo(xOf(tmax), yc + half);
    sctx.lineTo(xOf(gShow), yc + half * 0.95);
    sctx.closePath();
    sctx.fill();
    // binary tree
    sctx.strokeStyle = 'rgba(94,227,154,0.85)';
    sctx.lineWidth = 1.5;
    sctx.beginPath();
    for (let g = 0; g < gShow; g++) {
      const n = 1 << g;
      for (let i = 0; i < n; i++) {
        const y = yc + ((i + 0.5) / n - 0.5) * 2 * half * 0.95 * Math.min(1, g / 3 + 0.001);
        for (let c = 0; c < 2; c++) {
          const j = 2 * i + c;
          const y2 = yc + ((j + 0.5) / (2 * n) - 0.5) * 2 * half * 0.95 * Math.min(1, (g + 1) / 3);
          sctx.moveTo(xOf(g), g === 0 ? yc : y);
          sctx.lineTo(xOf(g + 1), y2);
        }
      }
    }
    sctx.stroke();
    // t_max marker
    const xm = xOf(tmax);
    sctx.strokeStyle = '#dfe6f3';
    sctx.setLineDash([5, 5]);
    sctx.beginPath();
    sctx.moveTo(xm, yc - half - 4); sctx.lineTo(xm, yc + half + 4);
    sctx.stroke();
    sctx.setLineDash([]);
    sctx.fillStyle = '#dfe6f3';
    sctx.font = '19px JetBrains Mono, monospace';
    const txt = `shower max ${tmax.toFixed(1)} X₀ = ${(tmax * PBWO4.X0cm).toFixed(1)} cm`;
    sctx.fillText(txt, Math.min(xm + 8, W - 16 - sctx.measureText(txt).width), H - 10);
    sctx.fillStyle = '#56627c';
    sctx.fillText('N = 2ᵗ', x0 + 4, H - 10);
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    // Glide between the cutaway and the flattened end-on view.
    const zs = det.scale.z + (zTarget - det.scale.z) * Math.min(1, dt * 5);
    det.scale.z = zs;
    if (queue > 0) {
      const k = Math.min(queue, batch);
      for (let i = 0; i < k; i++) simulate();
      queue -= k;
      display();
      tau = queue > 0 ? TAU_END : 0;
      animate(0);
      if (queue === 0) { tau = 0; }
      drawHist();
    } else {
      animate(dt);
      if (auto && tau > TAU_END) {
        idle += dt;
        if (idle > 2.2) { simulate(); display(); }
      }
    }
    updateReadouts();
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Collisions');
  const choiceCtl = ui.select<Choice>({
    key: 'event', label: 'Event', value: choice,
    options: [
      { value: 'zmm', label: 'Z→μμ' }, { value: 'zee', label: 'Z→ee' }, { value: 'hgg', label: 'H→γγ' },
      { value: 'wen', label: 'W→eν' }, { value: 'jets', label: 'Jets' }, { value: 'mystery', label: 'Mystery' },
    ],
    onChange: (v) => { touched = true; choice = v; mysteryBox.style.display = v === 'mystery' ? '' : 'none'; mysteryHint.style.display = v === 'mystery' ? 'none' : ''; feedback.textContent = ''; simulate(); display(); },
  });
  void choiceCtl;
  ui.buttons([
    { label: 'Next event', primary: true, key: 'next', onClick: () => { touched = true; queue = 0; simulate(); display(); } },
    { label: 'Run N events', key: 'nevents', onClick: () => { touched = true; queue = nRun; batch = Math.max(1, Math.ceil(nRun / 50)); } },
    { label: 'Clear', onClick: () => { touched = true; for (const h of Object.values(hists)) { h.bins.fill(0); h.n = 0; } drawHist(); } },
  ]);
  ui.slider({ key: 'nevents', label: 'N events per run', min: 10, max: 2000, step: 10, value: nRun, onInput: (v) => { nRun = v; } });
  ui.toggle({ key: 'auto', label: 'Auto-play events', value: auto, onChange: (v) => { auto = v; } });

  ui.section('Detector');
  ui.slider({
    key: 'B', label: 'Solenoid field B', min: 0, max: 4, step: 0.1, value: B, unit: 'T', format: (v) => v.toFixed(1),
    onInput: (v) => { touched = true; B = v; },
  });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: '3d', label: 'Cutaway 3D' }, { value: 'end', label: 'End-on' }],
    onChange: (v) => setView(v),
  });
  const layerToggle = (key: keyof typeof layerVis, label: string) =>
    ui.toggle({ key: `show-${key}`, label, value: true, onChange: (v) => { layerVis[key] = v; groups[key].visible = v; } });
  layerToggle('tracker', 'Silicon tracker');
  layerToggle('ecal', 'EM calorimeter');
  layerToggle('hcal', 'Hadron calorimeter');
  layerToggle('magnet', 'Solenoid and iron yoke');
  layerToggle('muon', 'Muon chambers');

  ui.section('Your call (Mystery mode)');
  const mysteryBox = document.createElement('div');
  const feedback = ui.note('');
  mysteryBox.appendChild(feedback);
  const guess = (g: 'mu' | 'e' | 'gamma' | 'nu' | 'jets') => {
    if (choice !== 'mystery' || !ev || guessed) return;
    touched = true;
    guessed = true;
    const t = ev.type;
    const ok = (g === 'mu' && t === 'zmm') || (g === 'e' && (t === 'zee' || t === 'wen')) || (g === 'gamma' && t === 'hgg') || (g === 'nu' && t === 'wen') || (g === 'jets' && t === 'jets');
    idTotal++;
    if (ok) idCorrect++;
    if (ok && g === 'mu') muonIdentified = true;
    feedback.innerHTML = `${ok ? '<b style="color:#5ee39a">Correct.</b>' : '<b style="color:#ff6b6b">Not quite.</b>'} This was ${TYPE_LABEL[t]}. Score ${idCorrect}/${idTotal}. Press Next event.`;
    updateEventText();
  };
  const idBtns = ui.buttons([
    { label: 'Muon', onClick: () => guess('mu') },
    { label: 'Electron', onClick: () => guess('e') },
    { label: 'Photon', onClick: () => guess('gamma') },
    { label: 'Neutrino', onClick: () => guess('nu') },
    { label: 'Jets', onClick: () => guess('jets') },
  ]);
  const idRow = idBtns[0].parentElement!;
  idRow.parentElement!.insertBefore(mysteryBox, idRow);
  mysteryBox.appendChild(idRow);
  mysteryBox.appendChild(feedback);
  const mysteryHint = document.createElement('div');
  mysteryHint.className = 'panel-note';
  mysteryHint.textContent = 'Pick Mystery as the event type to play.';
  mysteryBox.parentElement!.appendChild(mysteryHint);
  mysteryBox.style.display = 'none';

  ui.section('This event');
  const rEv = ui.readout('evtype', 'event');
  const rN = ui.readout('ntracks', 'charged tracks');
  const rPt = ui.readout('pt', 'leading track pT', 'GeV');
  const rR = ui.readout('radius', 'its radius R');
  const rM = ui.readout('mass', 'pair mass');
  const rMet = ui.readout('met', 'missing pT', 'GeV');
  const rPk = ui.readout('peak', 'histogram peak');
  const rTm = ui.readout('tmax', 'shower max');
  ui.legend([
    { color: css(COLOR.e), label: 'e' },
    { color: css(COLOR.mu), label: 'μ' },
    { color: css(COLOR.gamma), label: 'γ' },
    { color: css(COLOR.hpm), label: 'h±' },
    { color: css(COLOR.h0), label: 'h⁰' },
    { color: css(MET_COL), label: 'missing pT' },
  ]);

  function updateEventText(): void {
    if (!ev) return;
    rEv(choice === 'mystery' && !guessed ? '?' : `${TYPE_LABEL[ev.type]}${ev.type === 'hgg' ? (ev.signal ? ' (signal)' : ' (background)') : ''}`);
  }

  function zStats(): { n: number; peak: number } {
    const h = choice === 'zee' ? hists.zee : choice === 'zmm' ? hists.zmm : null;
    if (!h) return { n: 0, peak: 0 };
    const pk = peakEstimate(h.bins, h.lo, (h.hi - h.lo) / h.nb, 4);
    return { n: h.n, peak: Number.isFinite(pk) ? pk : 0 };
  }

  function updateReadouts(): void {
    if (!rec || !ev) return;
    rN(nCharged);
    rPt(leadPt > 0 ? leadPt.toFixed(1) : '–');
    const R = radiusFromPT(leadPt, evB);
    rR(leadPt <= 0 ? '–' : Number.isFinite(R) ? `${R.toFixed(R < 10 ? 2 : 1)} m` : '∞ (straight)');
    const hide = choice === 'mystery' && !guessed;
    const lab = rec.massKind === 'mT' ? 'mT ' : 'M ';
    rM(hide ? '?' : Number.isFinite(rec.mass) ? `${lab}${rec.mass.toFixed(1)} GeV` : ev.type === 'zmm' ? 'no bend, no p' : '–');
    rMet(rec.met.toFixed(1));
    if (choice === 'mystery') rPk('–');
    else if (choice === 'jets') rPk(`${hists.jets.n} events`);
    else {
      const h = hists[choice];
      const pk = peakEstimate(h.bins, h.lo, (h.hi - h.lo) / h.nb, choice === 'wen' ? 6 : 4);
      rPk(h.n >= 30 && Number.isFinite(pk) ? `${pk.toFixed(1)} GeV (${h.n})` : `${h.n} events`);
    }
    const tm = emE > 0 ? heitlerTmax(emE, PBWO4.EcGeV) : 0;
    rTm(emE > 0 ? `${tm.toFixed(1)} X₀` : 'no EM shower');
  }

  function setView(v: View): void {
    view = v;
    buildLayers(v === 'end');
    zTarget = v === 'end' ? 0.02 : 1;
    for (const l of layerLabels) l.visible = v === '3d';
    legend.style.display = '';
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.2);
  }

  buildLayers(false);
  simulate();
  display();

  return {
    state: () => {
      const z = zStats();
      return {
        eventType: choice,
        truth: ev ? ev.type : '',
        B,
        touched,
        view,
        nTracks: nCharged,
        pt: leadPt,
        radius: radiusFromPT(leadPt, evB),
        mass: rec && Number.isFinite(rec.mass) ? rec.mass : 0,
        met: rec ? rec.met : 0,
        zEntries: z.n,
        zPeak: z.peak,
        muonIdentified,
        neutrinoFound,
        straightSeen,
        idCorrect,
        idTotal,
        layersOn: Object.values(layerVis).filter(Boolean).length,
      };
    },
    dispose: () => {
      for (const b of built) { b.geo.dispose(); b.mat.dispose(); }
      legend.remove();
      histC.remove();
      showerC.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'particle-detectors',
  number: 77,
  title: 'How Detectors See Particles',
  domain: 'particle',
  level: 1,
  status: 'live',
  tagline: 'Every particle leaves its own signature in the layers of a detector.',
  content,
  mount,
};

export default topic;
