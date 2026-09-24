import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A_VENUS,
  H0_PLANCK,
  H0_SHOES,
  H0_TRGB,
  GAIA_SIGMA_BRIGHT_MAS,
  M_SN_IA,
  auFromEcho,
  cepheidDeltaMag,
  distanceFactor,
  distanceFromModulus,
  distanceModulus,
  fitH0,
  gauss,
  leavittMV,
  offsetForH0,
  parallaxDistancePc,
  radarEchoTime,
  rng,
  simulateHubbleSNe,
  snFlux,
  tensionSigma,
} from './physics.ts';

type Rung = 'all' | 'radar' | 'parallax' | 'cepheid' | 'sn' | 'hubble';
type Method = 'cepheid' | 'trgb' | 'all';

const TAU = Math.PI * 2;
const S = 3.5; // scene units per decade of distance
const LG_MIN = -6;
const LG_MAX = 9.7;
const X = (lg: number) => S * lg;
const LY_PER_PC = 3.261_563_777;

// Simulated Cepheid host galaxy (not a real galaxy).
const D_CEP_TRUE = 18.6e6; // pc
const P_TRUE = 32.4; // days
const M_OBS = leavittMV(P_TRUE) + distanceModulus(D_CEP_TRUE);
const OBS_DAYS = 90;
const N_OBS = 38;
const CEP_DAYS_PER_S = 12;
const SN_CYCLE_DAYS = 110;
const SN_DAYS_PER_S = 26;
const SN_D_REP = 200e6; // pc, the supernova drawn in rung 4

// Parallax diorama geometry (local units, angles exaggerated).
const R_ORB = 0.8;
const TILT = (50 * Math.PI) / 180;
const BACK = 5.2;
const YEAR_S = 6;
const dVis = (dPc: number) => 1.8 + 0.8 * Math.max(0, Math.log10(dPc));

const STATIONS: { id: Exclude<Rung, 'all'>; lg: number; c: [number, number, number]; color: number; title: string; cam: [number, number, number] }[] = [
  { id: 'radar', lg: Math.log10(1 / 206264.806), c: [X(-5.31), 4.2, 0], color: PALETTE.violet, title: '1 · Radar: the AU', cam: [0, 1.2, 7.2] },
  { id: 'parallax', lg: 0.7, c: [X(0.7), 4.2, 0], color: PALETTE.cyan, title: '2 · Parallax', cam: [4.2, 2.6, 6.2] },
  { id: 'cepheid', lg: Math.log10(D_CEP_TRUE), c: [X(Math.log10(D_CEP_TRUE)) - 1.2, 4.2, 0], color: PALETTE.amber, title: '3 · Cepheids', cam: [0, 0.6, 6.8] },
  { id: 'sn', lg: Math.log10(SN_D_REP), c: [X(Math.log10(SN_D_REP)) + 1.2, 12.2, 0], color: PALETTE.rose, title: '4 · Type Ia supernovae', cam: [0, 0.5, 6.4] },
  { id: 'hubble', lg: 8.85, c: [X(8.85) + 4.6, 4.2, 0], color: PALETTE.green, title: '5 · Hubble flow', cam: [0, 0.8, 7.4] },
];
// Bounding box of the whole ladder for the overview camera.
const BOX = { x0: X(LG_MIN) - 4, x1: X(8.85) + 10.5, y0: -6.6, y1: 17 };
/** Size of each rung's diorama. */
const DS = 1.8;
const OVERVIEW_TGT: [number, number, number] = [(BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2 + 1.5, 0];
function overviewPos(aspect: number): [number, number, number] {
  const t = Math.tan((45 / 2) * (Math.PI / 180));
  const halfW = (BOX.x1 - BOX.x0) / 2;
  const halfH = (BOX.y1 - BOX.y0) / 2 + 2.5; // room for the insets
  const dist = Math.max(halfW / (t * aspect), halfH / t) * 1.02;
  return [OVERVIEW_TGT[0], OVERVIEW_TGT[1] + 0.08 * dist, dist];
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const aspect0 = () => Math.max(0.3, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  const stage = createStage(viewport, { camera: overviewPos(aspect0()), target: OVERVIEW_TGT, fov: 45, far: 900 });
  const { scene } = stage;
  const glowTex = glowTexture();

  // ---------------------------------------------------------------- state
  let rung: Rung = 'all';
  let method: Method = 'cepheid';
  let pMas = 100;
  let periodDays = 10;
  let offset = 0;
  let periodTouched = false;

  const sprite = (color: number, scale: number, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.setScalar(scale);
    return s;
  };
  const lineLoop = (pts: THREE.Vector3[], color: number, opacity = 0.7) =>
    new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  const circlePts = (r: number, n = 128) => Array.from({ length: n }, (_, i) => new THREE.Vector3(r * Math.cos((i / n) * TAU), 0, r * Math.sin((i / n) * TAU)));

  // ---------------------------------------------------------------- background stars
  {
    const r = rng(99);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -120 + 260 * r();
      pos[i * 3 + 1] = -60 + 140 * r();
      pos[i * 3 + 2] = -180 - 120 * r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8090b0, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false })));
  }

  // ---------------------------------------------------------------- the ladder
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6c, metalness: 0.5, roughness: 0.45 });
  const len = X(LG_MAX) - X(LG_MIN);
  for (const z of [-0.5, 0.5]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 10), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set((X(LG_MAX) + X(LG_MIN)) / 2, 0, z);
    scene.add(rail);
  }
  const rungGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
  for (let lg = Math.ceil(LG_MIN); lg <= Math.floor(LG_MAX); lg++) {
    const m = new THREE.Mesh(rungGeo, railMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(X(lg), 0, 0);
    scene.add(m);
  }
  const DECADES: [number, string][] = [[-5.31, '1 AU'], [-3, '200 AU'], [0, '1 pc'], [3, '1 kpc'], [6, '1 Mpc'], [9, '1 Gpc']];
  for (const [lg, txt] of DECADES) stage.label(txt, [X(lg), 0.75, 0.6], 'muted');

  // Reach bars: where each method works (approximate).
  const REACH: { lo: number; hi: number; color: number; name: string }[] = [
    { lo: -6, hi: -4.3, color: PALETTE.violet, name: 'radar' },
    { lo: 0.1, hi: 4.0, color: PALETTE.cyan, name: 'parallax (Gaia)' },
    { lo: 2.1, hi: 7.6, color: PALETTE.amber, name: 'Cepheids' },
    { lo: 6.8, hi: 9.7, color: PALETTE.rose, name: 'SN Ia' },
    { lo: 7.5, hi: 9.7, color: PALETTE.green, name: 'Hubble flow' },
  ];
  REACH.forEach((b, i) => {
    const w = X(b.hi) - X(b.lo);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.75 }));
    const y = -1.0 - i * 1.2;
    bar.position.set(X(b.lo) + w / 2, y, 0.9);
    scene.add(bar);
    // Name sits just left of the bar (right of it for the first bar, which starts at the edge).
    const first = i === 0;
    const l = stage.label('', [first ? X(b.hi) : X(b.lo), y, 1.0], 'muted');
    l.element.innerHTML = `<span style="display:inline-block;transform:translateX(${first ? 'calc(50% + 6px)' : 'calc(-50% - 6px)'});color:${css(b.color)}">${b.name}</span>`;
  });

  // Station frames: leader lines from ladder to diorama, and titles.
  const groups: Record<string, THREE.Group> = {};
  const titles: Record<string, ReturnType<typeof stage.label>> = {};
  for (const st of STATIONS) {
    const g = new THREE.Group();
    g.position.set(...st.c);
    g.scale.setScalar(DS);
    scene.add(g);
    groups[st.id] = g;
    const lead = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(st.lg), 0.1, 0), new THREE.Vector3(st.c[0], st.c[1] - 2.2 * DS, 0)]),
      new THREE.LineDashedMaterial({ color: st.color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.55 }),
    );
    lead.computeLineDistances();
    scene.add(lead);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: st.color }));
    knob.position.set(X(st.lg), 0, 0);
    scene.add(knob);
    titles[st.id] = stage.label(st.title, [st.c[0], st.c[1] + 2.4 * DS, 0], 'big');
  }

  // Beads for measured distances that move with the controls.
  const bead = (color: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color }));
    const halo = sprite(color, 1.3, 0.7);
    m.add(halo);
    scene.add(m);
    return m;
  };
  const beadStar = bead(PALETTE.cyan);
  const beadCep = bead(PALETTE.amber);
  const beadSN = bead(PALETTE.rose);

  const details: ReturnType<typeof stage.label>[] = [];
  const dl = (...a: Parameters<typeof stage.label>) => {
    const l = stage.label(...a);
    l.visible = false;
    details.push(l);
    return l;
  };

  // ---------------------------------------------------------------- rung 1: radar
  const gR = groups.radar;
  gR.rotation.x = 0.5;
  const rE = 2.2;
  const rV = rE * A_VENUS;
  gR.add(sprite(PALETTE.amber, 1.1));
  gR.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd27a })));
  gR.add(lineLoop(circlePts(rE), PALETTE.cyan, 0.5));
  gR.add(lineLoop(circlePts(rV), 0xe8d6a8, 0.5));
  const earthR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.6 }));
  earthR.position.set(rE * Math.cos(-0.5), 0, rE * Math.sin(-0.5));
  gR.add(earthR);
  const venus = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf0dfb0, roughness: 0.6 }));
  venus.position.set(rV * Math.cos(-0.5), 0, rV * Math.sin(-0.5));
  gR.add(venus);
  dl('Earth', earthR.position.clone().add(new THREE.Vector3(0.3, 0.3, 0)), 'muted', gR);
  dl('Venus', venus.position.clone().add(new THREE.Vector3(-0.3, 0.3, 0)), 'muted', gR);
  dl('Sun', [0, -0.45, 0], 'muted', gR);
  const pulse = sprite(PALETTE.cyan, 0.45);
  gR.add(pulse);

  // ---------------------------------------------------------------- rung 2: parallax
  const gP = groups.parallax;
  gP.add(sprite(PALETTE.amber, 0.6));
  const orbitPts = Array.from({ length: 128 }, (_, i) => {
    const th = (i / 128) * TAU;
    return new THREE.Vector3(R_ORB * Math.cos(th), -R_ORB * Math.sin(th) * Math.sin(TILT), R_ORB * Math.sin(th) * Math.cos(TILT));
  });
  gP.add(lineLoop(orbitPts, PALETTE.cyan, 0.6));
  const earthP = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), new THREE.MeshStandardMaterial({ color: 0x4f8fe8, roughness: 0.6, emissive: 0x10224a }));
  gP.add(earthP);
  dl("Earth's orbit, 2 AU across", [0, -0.95, 0.4], 'muted', gP);
  // Background star field on a far plane.
  {
    const r = rng(12);
    const n = 160;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -2.6 + 5.2 * r();
      pos[i * 3 + 1] = -1.8 + 3.6 * r();
      pos[i * 3 + 2] = -BACK;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gP.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8c6e6, size: 0.1, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const frame = lineLoop([new THREE.Vector3(-2.7, -1.9, -BACK), new THREE.Vector3(2.7, -1.9, -BACK), new THREE.Vector3(2.7, 1.9, -BACK), new THREE.Vector3(-2.7, 1.9, -BACK)], PALETTE.gridMajor, 0.8);
    gP.add(frame);
    dl('distant background stars', [0, 2.15, -BACK], 'muted', gP);
  }
  const nearStar = sprite(0xfff1c8, 0.55);
  gP.add(nearStar);
  dl('near star', [0, 0.35, 0], 'muted', nearStar);
  const ghost = sprite(PALETTE.amber, 0.45);
  gP.add(ghost);
  const pathPos = new Float32Array(97 * 3);
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
  const path = new THREE.Line(pathGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.8 }));
  gP.add(path);
  const sightPos = new Float32Array(6);
  const sightGeo = new THREE.BufferGeometry();
  sightGeo.setAttribute('position', new THREE.BufferAttribute(sightPos, 3));
  const sight = new THREE.Line(sightGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.45 }));
  sight.frustumCulled = false;
  gP.add(sight);
  let Dv = dVis(10);
  const eTmp = new THREE.Vector3();
  const earthAt = (th: number, out: THREE.Vector3) => out.set(R_ORB * Math.cos(th), -R_ORB * Math.sin(th) * Math.sin(TILT), R_ORB * Math.sin(th) * Math.cos(TILT));
  // Where the line from Earth through the star hits the background plane.
  const project = (e: THREE.Vector3, out: Float32Array, k: number) => {
    const t = (-BACK - e.z) / (-Dv - e.z);
    out[k] = e.x + (0 - e.x) * t;
    out[k + 1] = e.y + (0 - e.y) * t;
    out[k + 2] = -BACK + 0.01;
  };
  function rebuildParallax(): void {
    Dv = dVis(parallaxDistancePc(pMas / 1000));
    nearStar.position.set(0, 0, -Dv);
    for (let i = 0; i <= 96; i++) {
      earthAt((i / 96) * TAU, eTmp);
      project(eTmp, pathPos, i * 3);
    }
    pathGeo.attributes.position.needsUpdate = true;
    pathGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- galaxies
  function makeGalaxy(n: number, radius: number, seed: number, arms = 2, bulge = 0.25): THREE.Points {
    const r = rng(seed);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const cCore = new THREE.Color(0xffe2b0);
    const cArm = new THREE.Color(0x9fb8ff);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (r() < bulge) {
        const rr = radius * 0.22 * Math.abs(gauss(r));
        const a = r() * TAU;
        x = rr * Math.cos(a);
        z = rr * Math.sin(a);
        y = 0.4 * rr * gauss(r) * 0.5;
        tmp.copy(cCore);
      } else {
        const u = r();
        const rr = radius * (0.15 + 0.85 * u);
        const arm = Math.floor(r() * arms);
        const a = (arm * TAU) / arms + 2.6 * Math.log(rr / (radius * 0.15) + 1) + 0.35 * gauss(r);
        x = rr * Math.cos(a);
        z = rr * Math.sin(a);
        y = 0.04 * gauss(r);
        tmp.copy(cCore).lerp(cArm, Math.min(1, u * 1.4));
      }
      pos.set([x, y, z], i * 3);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, map: glowTex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  // ---------------------------------------------------------------- rung 3: Cepheid
  const gC = groups.cepheid;
  const galC = makeGalaxy(2600, 2.1, 3);
  galC.rotation.x = 1.05;
  gC.add(galC);
  const cepPos = new THREE.Vector3(1.05, 0.02, 0.55);
  const cep = sprite(0xffe7a8, 0.5);
  cep.position.copy(cepPos);
  galC.add(cep);
  const cepRing = lineLoop(circlePts(0.32, 48), PALETTE.amber, 0.9);
  cepRing.position.copy(cepPos);
  galC.add(cepRing);
  dl('Cepheid', [0, 0.1, 0.45], '', cep);
  dl('simulated host galaxy', [0, -1.8, 0], 'muted', gC);

  // Observations of the Cepheid (simulated, fixed).
  const obsT = new Float64Array(N_OBS);
  const obsM = new Float64Array(N_OBS);
  {
    const r = rng(5);
    for (let i = 0; i < N_OBS; i++) {
      obsT[i] = (OBS_DAYS * (i + r())) / N_OBS;
      obsM[i] = M_OBS + cepheidDeltaMag(obsT[i] / P_TRUE) + 0.03 * gauss(r);
    }
  }

  // ---------------------------------------------------------------- rung 4: SN Ia
  const gS = groups.sn;
  const galS = makeGalaxy(1500, 1.5, 17, 2, 0.35);
  galS.rotation.set(0.9, 0.4, 0.2);
  gS.add(galS);
  const snPos = new THREE.Vector3(0.75, 0.02, -0.45);
  const sn = sprite(0xe8f0ff, 0.1);
  sn.position.copy(snPos);
  galS.add(sn);
  const labSN = dl('SN Ia', [0, 0.45, 0], '', sn);
  dl('far galaxy, 200 Mpc', [0, -1.7, 0], 'muted', gS);

  // ---------------------------------------------------------------- rung 5: Hubble flow
  const gH = groups.hubble;
  const NG = 42;
  const g0 = new Float32Array(NG * 3);
  const gPos = new Float32Array(NG * 3);
  const gCol = new Float32Array(NG * 3);
  const streak = new Float32Array(NG * 6);
  {
    const r = rng(21);
    const c = new THREE.Color();
    for (let i = 0; i < NG; i++) {
      const rr = 0.45 + 1.45 * Math.cbrt(r());
      const ct = 2 * r() - 1;
      const st = Math.sqrt(1 - ct * ct);
      const ph = r() * TAU;
      g0.set([rr * st * Math.cos(ph), rr * ct * 0.8, rr * st * Math.sin(ph)], i * 3);
      c.setRGB(1, 1, 1).lerp(new THREE.Color(0xff7a5c), (rr - 0.45) / 1.45);
      gCol.set([c.r, c.g, c.b], i * 3);
    }
  }
  const galGeo = new THREE.BufferGeometry();
  galGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  galGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const galMat = new THREE.PointsMaterial({ size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const gals = new THREE.Points(galGeo, galMat);
  gals.frustumCulled = false;
  gH.add(gals);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streak, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.6 });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.frustumCulled = false;
  gH.add(streaks);
  gH.add(sprite(PALETTE.cyan, 0.5));
  dl('us', [0, -0.3, 0], 'muted', gH);
  dl('speed ∝ distance', [0, -2.1, 0], 'muted', gH);

  // ---------------------------------------------------------------- ladder physics
  const sne = simulateHubbleSNe(H0_SHOES.value, 36, 7);
  const sneD = new Float64Array(sne.length);
  const sneV = Float64Array.from(sne.map((s) => s.v));
  {
    // Scale the simulated velocities so the zero-offset ladder reproduces the SH0ES value.
    const d0 = Float64Array.from(sne.map((s) => distanceFromModulus(s.m - M_SN_IA) / 1e6));
    const k = H0_SHOES.value / fitH0(d0, sneV);
    for (let i = 0; i < sneV.length; i++) sneV[i] *= k;
  }
  let H0 = 0;
  let dCepEst = 0;
  let errCep = 0;
  let muCep = 0;
  let MV = 0;

  function recompute(): void {
    // Rung 3: Cepheid distance with the current period guess and calibration offset.
    MV = leavittMV(periodDays) + offset;
    muCep = M_OBS - MV;
    dCepEst = distanceFromModulus(muCep);
    errCep = dCepEst / D_CEP_TRUE - 1;
    // Rungs 4-5: the SN Ia zero point inherits the offset, then refit the Hubble diagram.
    const mCal = M_SN_IA + offset;
    for (let i = 0; i < sne.length; i++) sneD[i] = distanceFromModulus(sne[i].m - mCal) / 1e6;
    H0 = fitH0(sneD, sneV);
    beadCep.position.set(X(Math.log10(dCepEst)), 0, 0);
    beadSN.position.set(X(Math.log10(SN_D_REP * distanceFactor(-offset))), 0, 0);
    beadStar.position.set(X(Math.log10(parallaxDistancePc(pMas / 1000))), 0, 0);
  }
  const H0_BASE = fitH0(Float64Array.from(sne.map((s) => distanceFromModulus(s.m - M_SN_IA) / 1e6)), sneV);
  const h0Sigma = () => H0_SHOES.sigma * (H0 / H0_SHOES.value);

  function tension(): number {
    if (method === 'cepheid') return tensionSigma(H0, h0Sigma(), H0_PLANCK.value, H0_PLANCK.sigma);
    if (method === 'trgb') return tensionSigma(H0_TRGB.value, H0_TRGB.sigma, H0_PLANCK.value, H0_PLANCK.sigma);
    return tensionSigma(H0_SHOES.value, H0_SHOES.sigma, H0_PLANCK.value, H0_PLANCK.sigma);
  }

  // ---------------------------------------------------------------- insets
  const mkCanvas = (css0: Partial<CSSStyleDeclaration>, W: number, H: number) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    Object.assign(c.style, {
      position: 'absolute', background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
      ...css0,
    } as CSSStyleDeclaration);
    viewport.appendChild(c);
    return c;
  };
  const h0c = mkCanvas({ left: '10px', top: '10px', width: '250px', height: '140px' }, 500, 280);
  const rc = mkCanvas({ right: '10px', top: '10px', width: '280px', height: '140px' }, 560, 280);
  const hx = h0c.getContext('2d')!;
  const rx = rc.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '260px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Not to scale</div>` +
    ['ladder: log distance, ×10 per rung', 'bars: rough reach of each method', 'beads: your measured distances'].join('<br/>');
  viewport.appendChild(legend);

  const MONO = 'JetBrains Mono, monospace';
  function drawH0(): void {
    const W = h0c.width;
    const Hh = h0c.height;
    hx.clearRect(0, 0, W, Hh);
    hx.font = `22px ${MONO}`;
    hx.fillStyle = '#8391ab';
    hx.fillText('H₀ (km/s/Mpc)', 14, 30);
    const x0 = 16;
    const x1 = W - 16;
    const lo = 63;
    const hi = 78;
    const xOf = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
    const yTop = 48;
    const yBot = Hh - 36;
    // Planck band
    hx.fillStyle = 'rgba(79,209,232,0.13)';
    hx.fillRect(xOf(H0_PLANCK.value - H0_PLANCK.sigma), yTop, xOf(H0_PLANCK.value + H0_PLANCK.sigma) - xOf(H0_PLANCK.value - H0_PLANCK.sigma), yBot - yTop);
    // axis
    hx.strokeStyle = '#243049';
    hx.lineWidth = 1;
    hx.fillStyle = '#56627c';
    hx.font = `18px ${MONO}`;
    hx.textAlign = 'center';
    for (let v = 64; v <= 78; v += 2) {
      hx.beginPath();
      hx.moveTo(xOf(v), yTop);
      hx.lineTo(xOf(v), yBot);
      hx.stroke();
      hx.fillText(String(v), xOf(v), Hh - 12);
    }
    hx.textAlign = 'left';
    const rows: { v: number; s: number; c: number; name: string; on: boolean }[] = [
      { v: H0, s: h0Sigma(), c: PALETTE.amber, name: 'your ladder', on: method !== 'trgb' },
      { v: H0_SHOES.value, s: H0_SHOES.sigma, c: PALETTE.rose, name: 'SH0ES 2022', on: method !== 'trgb' },
      { v: H0_TRGB.value, s: H0_TRGB.sigma, c: PALETTE.green, name: 'TRGB 2025', on: method !== 'cepheid' },
      { v: H0_PLANCK.value, s: H0_PLANCK.sigma, c: PALETTE.cyan, name: 'Planck ΛCDM', on: true },
    ];
    const dy = (yBot - yTop) / rows.length;
    rows.forEach((r, i) => {
      const y = yTop + dy * (i + 0.55);
      hx.globalAlpha = r.on ? 1 : 0.28;
      hx.strokeStyle = css(r.c);
      hx.fillStyle = css(r.c);
      hx.lineWidth = 4;
      hx.beginPath();
      hx.moveTo(xOf(Math.max(lo, r.v - r.s)), y);
      hx.lineTo(xOf(Math.min(hi, r.v + r.s)), y);
      hx.stroke();
      hx.beginPath();
      hx.arc(xOf(Math.min(hi, Math.max(lo, r.v))), y, 7, 0, TAU);
      hx.fill();
      hx.font = `18px ${MONO}`;
      const lab = `${r.name} ${r.v.toFixed(1)}`;
      const right = xOf(r.v) > (x0 + x1) / 2;
      hx.textAlign = right ? 'right' : 'left';
      hx.fillText(lab, right ? xOf(r.v - r.s) - 10 : xOf(r.v + r.s) + 10, y + 6);
      hx.textAlign = 'left';
    });
    hx.globalAlpha = 1;
    hx.fillStyle = '#dfe6f3';
    hx.font = `600 22px ${MONO}`;
    hx.textAlign = 'right';
    hx.fillText(`${tension().toFixed(1)}σ`, W - 14, 30);
    hx.textAlign = 'left';
  }

  const frame = (W: number, Hh: number, title: string) => {
    rx.clearRect(0, 0, W, Hh);
    rx.font = `22px ${MONO}`;
    rx.fillStyle = '#8391ab';
    rx.textAlign = 'left';
    rx.fillText(title, 14, 30);
  };

  function drawRadar(t: number): void {
    const W = rc.width;
    const Hh = rc.height;
    frame(W, Hh, 'radar echo from Venus');
    const echo = radarEchoTime(A_VENUS);
    const x0 = 30;
    const x1 = W - 30;
    const y = 120;
    rx.strokeStyle = '#243049';
    rx.lineWidth = 2;
    rx.beginPath();
    rx.moveTo(x0, y);
    rx.lineTo(x1, y);
    rx.stroke();
    const u = (t % 3) / 3;
    const px = u < 0.5 ? x0 + (x1 - x0) * 2 * u : x1 - (x1 - x0) * 2 * (u - 0.5);
    rx.fillStyle = css(PALETTE.cyan);
    rx.beginPath();
    rx.arc(px, y, 8, 0, TAU);
    rx.fill();
    rx.fillStyle = '#dfe6f3';
    rx.font = `20px ${MONO}`;
    rx.fillText('Earth', x0 - 10, y - 18);
    rx.textAlign = 'right';
    rx.fillText('Venus', x1 + 10, y - 18);
    rx.textAlign = 'left';
    rx.fillStyle = '#b8c3d9';
    rx.fillText(`round trip t = ${echo.toFixed(0)} s`, 14, 180);
    rx.fillText(`d = ct/2 = ${(1 - A_VENUS).toFixed(3)} AU (Kepler III)`, 14, 212);
    rx.fillText(`⇒ 1 AU = ${(auFromEcho(echo, A_VENUS) / 1e11).toFixed(4)}×10¹¹ m`, 14, 244);
  }

  function drawParallax(t: number): void {
    const W = rc.width;
    const Hh = rc.height;
    frame(W, Hh, 'telescope view, 2″ field');
    const cx = W / 2 + 60;
    const cy = Hh / 2 + 16;
    const scale = 110; // px per arcsec
    // background stars (fixed)
    rx.fillStyle = '#56627c';
    const r = rng(4);
    for (let i = 0; i < 40; i++) {
      rx.beginPath();
      rx.arc(40 + r() * (W - 80), 44 + r() * (Hh - 70), 1.5 + 2 * r(), 0, TAU);
      rx.fill();
    }
    const p = pMas / 1000;
    const beta = TILT;
    rx.strokeStyle = 'rgba(245,182,66,0.6)';
    rx.lineWidth = 2;
    rx.beginPath();
    rx.ellipse(cx, cy, Math.max(0.5, p * scale), Math.max(0.5, p * scale * Math.sin(beta)), 0, 0, TAU);
    rx.stroke();
    const th = (t / YEAR_S) * TAU;
    rx.fillStyle = '#fff1c8';
    rx.beginPath();
    rx.arc(cx - p * scale * Math.cos(th), cy + p * scale * Math.sin(beta) * Math.sin(th), 7, 0, TAU);
    rx.fill();
    // scale bar
    rx.strokeStyle = '#8391ab';
    rx.beginPath();
    rx.moveTo(20, Hh - 20);
    rx.lineTo(20 + scale, Hh - 20);
    rx.stroke();
    rx.fillStyle = '#8391ab';
    rx.font = `18px ${MONO}`;
    rx.fillText('1″', 24 + scale, Hh - 14);
    rx.fillStyle = '#dfe6f3';
    rx.font = `20px ${MONO}`;
    rx.textAlign = 'right';
    rx.fillText(`p = ${pMas >= 10 ? pMas.toFixed(0) : pMas.toPrecision(2)} mas`, W - 14, 30);
    rx.textAlign = 'left';
  }

  function drawCepheid(t: number): void {
    const W = rc.width;
    const Hh = rc.height;
    frame(W, Hh, 'data vs model');
    // Left: light curve (m vs day)
    const x0 = 16;
    const x1 = 340;
    const yT = 46;
    const yB = Hh - 30;
    const mLo = M_OBS - 0.65;
    const mHi = M_OBS + 0.65;
    const xOf = (d: number) => x0 + (d / OBS_DAYS) * (x1 - x0);
    const yOf = (m: number) => yT + ((m - mLo) / (mHi - mLo)) * (yB - yT);
    rx.strokeStyle = '#243049';
    rx.lineWidth = 1;
    rx.strokeRect(x0, yT, x1 - x0, yB - yT);
    rx.strokeStyle = css(PALETTE.amber);
    rx.lineWidth = 3;
    rx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const d = (i / 240) * OBS_DAYS;
      const y = yOf(M_OBS + cepheidDeltaMag(d / periodDays));
      if (i === 0) rx.moveTo(xOf(d), y);
      else rx.lineTo(xOf(d), y);
    }
    rx.stroke();
    rx.fillStyle = '#ffffff';
    for (let i = 0; i < N_OBS; i++) {
      rx.beginPath();
      rx.arc(xOf(obsT[i]), yOf(obsM[i]), 4.5, 0, TAU);
      rx.fill();
    }
    // time cursor of the pulsing star
    const tc = (t * CEP_DAYS_PER_S) % OBS_DAYS;
    rx.strokeStyle = 'rgba(223,230,243,0.25)';
    rx.beginPath();
    rx.moveTo(xOf(tc), yT);
    rx.lineTo(xOf(tc), yB);
    rx.stroke();
    rx.fillStyle = '#56627c';
    rx.font = `18px ${MONO}`;
    rx.fillText('0', x0, Hh - 8);
    rx.textAlign = 'right';
    rx.fillText(`${OBS_DAYS} d`, x1, Hh - 8);
    rx.textAlign = 'left';
    // Right: P-L relation
    const px0 = 370;
    const px1 = W - 14;
    const lxOf = (lp: number) => px0 + (lp / 2) * (px1 - px0);
    const lyOf = (M: number) => yT + ((M + 7.2) / 5.2) * (yB - yT);
    rx.strokeStyle = '#243049';
    rx.strokeRect(px0, yT, px1 - px0, yB - yT);
    rx.strokeStyle = css(PALETTE.cyan);
    rx.lineWidth = 2;
    rx.beginPath();
    rx.moveTo(lxOf(0), lyOf(leavittMV(1) + offset));
    rx.lineTo(lxOf(2), lyOf(leavittMV(100) + offset));
    rx.stroke();
    rx.fillStyle = css(PALETTE.amber);
    rx.beginPath();
    rx.arc(lxOf(Math.log10(periodDays)), lyOf(MV), 7, 0, TAU);
    rx.fill();
    rx.fillStyle = '#8391ab';
    rx.font = `18px ${MONO}`;
    rx.fillText('P–L law', px0 + 6, yT - 6);
    rx.fillStyle = '#56627c';
    rx.fillText('log P', px1 - 58, Hh - 8);
    rx.fillStyle = '#dfe6f3';
    rx.font = `20px ${MONO}`;
    rx.textAlign = 'right';
    rx.fillText(`model P = ${periodDays.toFixed(1)} d`, x1 + 16, 30);
    rx.textAlign = 'left';
  }

  function drawSN(t: number): void {
    const W = rc.width;
    const Hh = rc.height;
    frame(W, Hh, 'SN Ia light curve');
    const mPk = M_SN_IA + distanceModulus(SN_D_REP);
    const x0 = 16;
    const x1 = W - 16;
    const yT = 50;
    const yB = Hh - 34;
    const tLo = -20;
    const tHi = 70;
    const xOf = (d: number) => x0 + ((d - tLo) / (tHi - tLo)) * (x1 - x0);
    const yOf = (f: number) => yB - f * (yB - yT);
    rx.strokeStyle = '#243049';
    rx.lineWidth = 1;
    rx.strokeRect(x0, yT, x1 - x0, yB - yT);
    rx.strokeStyle = css(PALETTE.rose);
    rx.lineWidth = 3;
    rx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const d = tLo + (i / 200) * (tHi - tLo);
      if (i === 0) rx.moveTo(xOf(d), yOf(snFlux(d)));
      else rx.lineTo(xOf(d), yOf(snFlux(d)));
    }
    rx.stroke();
    const tc = ((t * SN_DAYS_PER_S) % SN_CYCLE_DAYS) - 25;
    if (tc > tLo && tc < tHi) {
      rx.fillStyle = '#ffffff';
      rx.beginPath();
      rx.arc(xOf(tc), yOf(snFlux(tc)), 6, 0, TAU);
      rx.fill();
    }
    rx.fillStyle = '#56627c';
    rx.font = `18px ${MONO}`;
    rx.fillText('days from peak', x0 + 4, Hh - 10);
    rx.fillStyle = '#dfe6f3';
    rx.font = `20px ${MONO}`;
    rx.textAlign = 'right';
    const mCal = M_SN_IA + offset;
    rx.fillText(`peak m = ${mPk.toFixed(2)}, M = ${mCal.toFixed(2)}`, W - 14, 30);
    rx.fillText(`d = ${(distanceFromModulus(mPk - mCal) / 1e6).toFixed(0)} Mpc`, x1 - 8, yT + 26);
    rx.textAlign = 'left';
  }

  function drawHubble(): void {
    const W = rc.width;
    const Hh = rc.height;
    frame(W, Hh, 'Hubble diagram');
    const x0 = 54;
    const x1 = W - 16;
    const yT = 46;
    const yB = Hh - 34;
    const dMax = 700;
    const vMax = 50000;
    const xOf = (d: number) => x0 + (d / dMax) * (x1 - x0);
    const yOf = (v: number) => yB - (v / vMax) * (yB - yT);
    rx.strokeStyle = '#243049';
    rx.lineWidth = 1;
    rx.strokeRect(x0, yT, x1 - x0, yB - yT);
    // Planck line
    rx.setLineDash([8, 6]);
    rx.strokeStyle = css(PALETTE.cyan);
    rx.lineWidth = 2;
    rx.beginPath();
    rx.moveTo(xOf(0), yOf(0));
    rx.lineTo(xOf(vMax / H0_PLANCK.value), yOf(vMax));
    rx.stroke();
    rx.setLineDash([]);
    rx.strokeStyle = css(PALETTE.amber);
    rx.beginPath();
    rx.moveTo(xOf(0), yOf(0));
    const dEnd = Math.min(dMax, vMax / H0);
    rx.lineTo(xOf(dEnd), yOf(H0 * dEnd));
    rx.stroke();
    rx.fillStyle = css(PALETTE.rose);
    for (let i = 0; i < sne.length; i++) {
      rx.beginPath();
      rx.arc(xOf(sneD[i]), yOf(sneV[i]), 4, 0, TAU);
      rx.fill();
    }
    rx.fillStyle = '#56627c';
    rx.font = `18px ${MONO}`;
    rx.fillText('d (Mpc) from SN Ia', x0 + 4, Hh - 10);
    rx.save();
    rx.translate(22, yB);
    rx.rotate(-Math.PI / 2);
    rx.fillText('v (km/s)', 0, 0);
    rx.restore();
    rx.fillStyle = '#dfe6f3';
    rx.font = `20px ${MONO}`;
    rx.textAlign = 'right';
    rx.fillText(`fit H₀ = ${H0.toFixed(1)}`, W - 14, 30);
    rx.fillStyle = css(PALETTE.cyan);
    rx.font = `18px ${MONO}`;
    rx.fillText('Planck 67.4', x1 - 6, yT + 22);
    rx.textAlign = 'left';
  }

  function drawRungInset(t: number): void {
    if (rung === 'radar') drawRadar(t);
    else if (rung === 'parallax') drawParallax(t);
    else if (rung === 'cepheid') drawCepheid(t);
    else if (rung === 'sn') drawSN(t);
    else drawHubble();
  }

  // ---------------------------------------------------------------- frame loop
  let insetTimer = 1;
  stage.onFrame((dt, t) => {
    // radar pulse bounces between Earth and Venus
    const u = (t % 3) / 3;
    const f = u < 0.5 ? 2 * u : 2 - 2 * u;
    pulse.position.lerpVectors(earthR.position, venus.position, f);
    // parallax: Earth orbit, sight line and apparent position
    const th = (t / YEAR_S) * TAU;
    earthAt(th, earthP.position);
    sightPos[0] = earthP.position.x;
    sightPos[1] = earthP.position.y;
    sightPos[2] = earthP.position.z;
    project(earthP.position, sightPos, 3);
    sightGeo.attributes.position.needsUpdate = true;
    ghost.position.set(sightPos[3], sightPos[4], sightPos[5]);
    // Cepheid pulse at its true period
    const dm = cepheidDeltaMag((t * CEP_DAYS_PER_S) / P_TRUE);
    const b = Math.pow(10, -0.4 * dm);
    cep.scale.setScalar(0.42 * b);
    // SN flash
    const tsn = ((t * SN_DAYS_PER_S) % SN_CYCLE_DAYS) - 25;
    const fl = snFlux(tsn);
    sn.scale.setScalar(0.08 + 1.5 * Math.sqrt(fl));
    labSN.visible = rung !== 'all' && fl > 0.05;
    // Hubble flow: every galaxy moves out with speed proportional to distance
    const hu = (t % 6) / 6;
    const a = 1 + 0.45 * hu;
    galMat.opacity = Math.min(1, hu * 8, (1 - hu) * 8);
    streakMat.opacity = 0.6 * galMat.opacity;
    for (let i = 0; i < NG; i++) {
      const k = i * 3;
      gPos[k] = g0[k] * a;
      gPos[k + 1] = g0[k + 1] * a;
      gPos[k + 2] = g0[k + 2] * a;
      streak[i * 6] = gPos[k];
      streak[i * 6 + 1] = gPos[k + 1];
      streak[i * 6 + 2] = gPos[k + 2];
      streak[i * 6 + 3] = gPos[k] * 1.22;
      streak[i * 6 + 4] = gPos[k + 1] * 1.22;
      streak[i * 6 + 5] = gPos[k + 2] * 1.22;
    }
    galGeo.attributes.position.needsUpdate = true;
    streakGeo.attributes.position.needsUpdate = true;
    insetTimer += dt;
    if (insetTimer > 0.1) {
      insetTimer = 0;
      drawRungInset(t);
    }
  });

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('Rungs of the ladder');
  const flyTo = (r: Rung) => {
    if (r === 'all') {
      stage.flyTo(overviewPos(aspect0()), OVERVIEW_TGT, 1.6);
      return;
    }
    const st = STATIONS.find((s) => s.id === r)!;
    const [cx, cy, cz] = st.c;
    // Aim a little above the diorama so it sits below the corner insets.
    const k = DS * 1.25;
    const lift = 0.6 * DS;
    const tgt: [number, number, number] = r === 'parallax' ? [cx, cy + lift, cz - 2.2 * DS] : [cx, cy + lift, cz];
    stage.flyTo([cx + k * st.cam[0], cy + lift + k * st.cam[1], tgt[2] + k * st.cam[2]], tgt, 1.6);
  };
  ui.select<Rung>({
    key: 'rung', label: 'Fly to', value: rung,
    options: [
      { value: 'all', label: 'All' },
      { value: 'radar', label: 'Radar' },
      { value: 'parallax', label: 'Parallax' },
      { value: 'cepheid', label: 'Cepheid' },
      { value: 'sn', label: 'SN Ia' },
      { value: 'hubble', label: 'Hubble' },
    ],
    onChange: (v) => {
      rung = v;
      flyTo(v);
      insetTimer = 1;
      for (const l of details) l.visible = v !== 'all';
      for (const id in titles) titles[id].visible = id !== v;
    },
  });
  const rEcho = ui.readout('echo', 'Venus radar echo', 's');
  const rAU = ui.readout('au', '1 AU');

  ui.section('Parallax');
  const fmtP = (lg: number) => {
    const p = Math.pow(10, lg);
    return p >= 100 ? `${(p / 1000).toFixed(3)}″` : `${p.toPrecision(3)} mas`;
  };
  ui.slider({ key: 'p', label: 'Parallax angle p', min: -1, max: 2.9, step: 0.001, value: Math.log10(pMas), format: fmtP, onInput: (v) => { pMas = Math.pow(10, v); rebuildParallax(); recompute(); update(); } });
  const rD = ui.readout('dStar', 'd = 1/p', 'pc');
  const rLy = ui.readout('ly', 'd', 'ly');
  const rGaia = ui.readout('gaia', 'Gaia σ_d/d (bright)');

  ui.section('Cepheid in the host galaxy');
  ui.slider({ key: 'P', label: 'Model period P', min: 0, max: 2, step: 0.002, value: Math.log10(periodDays), format: (v) => `${Math.pow(10, v).toFixed(1)} d`, onInput: (v) => { periodDays = Math.pow(10, v); periodTouched = true; recompute(); update(); } });
  const rm = ui.readout('m', 'mean m_V');
  const rMV = ui.readout('MV', 'M_V from P–L');
  const rMu = ui.readout('mu', 'μ = m − M');
  const rDC = ui.readout('dCep', 'distance', 'Mpc');
  const rErr = ui.readout('errCep', 'error vs truth');

  ui.section('Calibration and H₀');
  ui.slider({ key: 'offset', label: 'Cepheid zero-point offset δ', min: -0.3, max: 0.3, step: 0.005, value: offset, format: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`, unit: 'mag', onInput: (v) => { offset = v; recompute(); update(); } });
  const rFac = ui.readout('dfac', 'distances ×');
  const rH0 = ui.readout('H0', 'your H₀', 'km/s/Mpc');
  const rdH = ui.readout('dH0', 'H₀ shift');
  ui.select<Method>({
    key: 'method', label: 'H₀ comparison with Planck', value: method,
    options: [{ value: 'cepheid', label: 'Cepheid + SN' }, { value: 'trgb', label: 'TRGB + SN' }, { value: 'all', label: 'All' }],
    onChange: (v) => { method = v; update(); },
  });
  const rT = ui.readout('tension', 'tension');
  const rNeed = ui.readout('need', 'δ to reach Planck', 'mag');
  ui.legend([
    { color: css(PALETTE.amber), label: 'your ladder' },
    { color: css(PALETTE.rose), label: 'SH0ES' },
    { color: css(PALETTE.green), label: 'TRGB' },
    { color: css(PALETTE.cyan), label: 'Planck' },
  ]);
  ui.note('The Cepheid host and the supernova sample are simulated. Published values: SH0ES 73.04 ± 1.04, CCHP TRGB 70.4 ± 1.9, Planck 2018 67.4 ± 0.5 km/s/Mpc.');

  function update(): void {
    const e = radarEchoTime(A_VENUS);
    rEcho(e.toFixed(1));
    rAU(`${(auFromEcho(e, A_VENUS) / 1e11).toFixed(4)}e11 m`);
    const d = parallaxDistancePc(pMas / 1000);
    rD(d < 100 ? d.toFixed(2) : d.toFixed(0));
    rLy(d * LY_PER_PC < 100 ? (d * LY_PER_PC).toFixed(1) : (d * LY_PER_PC).toFixed(0));
    const fe = GAIA_SIGMA_BRIGHT_MAS / pMas;
    rGaia(fe < 0.001 ? `${(fe * 1e6).toFixed(0)} ppm` : `${(fe * 100).toFixed(fe < 0.1 ? 2 : 0)} %`);
    rm(M_OBS.toFixed(2));
    rMV(MV.toFixed(2));
    rMu(muCep.toFixed(2));
    rDC((dCepEst / 1e6).toFixed(2));
    rErr(`${errCep >= 0 ? '+' : ''}${(errCep * 100).toFixed(1)} %`);
    rFac(distanceFactor(-offset).toFixed(4));
    rH0(H0.toFixed(2));
    rdH(`${H0 >= H0_BASE ? '+' : ''}${((H0 / H0_BASE - 1) * 100).toFixed(1)} %`);
    rT(`${tension().toFixed(1)} σ`);
    rNeed(offsetForH0(H0_BASE, H0_PLANCK.value).toFixed(3));
    drawH0();
    insetTimer = 1;
  }

  rebuildParallax();
  recompute();
  update();
  drawRungInset(0);

  return {
    state: () => ({
      rung,
      method,
      pMas,
      dStar: parallaxDistancePc(pMas / 1000),
      period: periodDays,
      periodTouched,
      dCep: dCepEst / 1e6,
      errCep,
      offset,
      H0,
      H0shift: H0 / H0_BASE - 1,
      tension: tension(),
    }),
    dispose: () => {
      h0c.remove();
      rc.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'distance-ladder',
  number: 82,
  title: 'The Cosmic Distance Ladder',
  domain: 'cosmology',
  level: 1,
  status: 'live',
  tagline: 'How we measure the universe one rung at a time.',
  content,
  mount,
};

export default topic;
