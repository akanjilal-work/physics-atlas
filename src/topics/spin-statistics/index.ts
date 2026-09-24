import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  ELEMENTS, SUBSHELLS, aufbau, configString, density, homCoincidence, homVisibility, mulberry, occ,
  pairStats, sep2Analytic, slotFill, solveMu, spinDeg, subshellOcc, type Kind,
} from './physics.ts';

type View = 'exchange' | 'filling' | 'hom';

const KINDS: Kind[] = ['dist', 'boson', 'fermion'];

// exchange surfaces
const G = 64; // grid segments per side
const S = 2.5; // surface side length
const SURF_X = [-3.4, 0, 3.4];
const HMAX = 1.8;

// filling view
const E_Y = 0.55;
const Y0 = -2.3;
const COL_S = -4.0;
const COL_P = [-2.6, -1.7, -0.8];
const COL_D = [0.6, 1.5, 2.4, 3.3, 4.2];
const BAR_W = 0.74;
const BALLS = 20;

// HOM view
const ARM = 3.6;
const DET = 3.2;
const V_PH = 4; // scene units per second
const T_PER_TAU = 0.3; // seconds of visual lag per coherence time
const PAIR_RATE = 60; // simulated pairs per second for the counting statistics
const BIN = 0.1;
const NBINS = 61; // delays -3 .. 3

const CAMS: Record<View, [[number, number, number], [number, number, number]]> = {
  exchange: [[0, 5.6, 10.6], [0, 0.9, -0.2]],
  filling: [[0.3, 0.8, 13.2], [0.3, 0.8, 0]],
  hom: [[-0.1, 0.1, 12.6], [-0.1, 0.1, 0]],
};

const RAMP = [0x0d1429, 0x292b75, 0x8c66eb, 0xf573b5, 0xf5b542, 0xfff7db].map((c) => new THREE.Color(c));
function rampInto(u: number, out: Float32Array, o: number): void {
  const x = Math.max(0, Math.min(1, u)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = RAMP[i], b = RAMP[i + 1];
  out[o] = a.r + (b.r - a.r) * f;
  out[o + 1] = a.g + (b.g - a.g) * f;
  out[o + 2] = a.b + (b.b - a.b) * f;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAMS.exchange[0], target: CAMS.exchange[1], fov: 42 });
  const { scene } = stage;

  let view: View = 'exchange';
  let kind: Kind = 'boson';
  let n1 = 1;
  let n2 = 2;
  let N = 6;
  let logT = Math.log10(0.15);
  let kT = 0.15;
  let delay = 2;
  let building = false;
  let buildClock = 0;

  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // ================================================================ view 1: exchange surfaces
  const gEx = new THREE.Group();
  scene.add(gEx);
  const V = (G + 1) * (G + 1);
  const index: number[] = [];
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      const a = i * (G + 1) + j, b = a + 1, c = a + (G + 1), d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  interface Surf {
    kind: Kind;
    group: THREE.Group;
    pos: Float32Array;
    col: Float32Array;
    geo: THREE.BufferGeometry;
    mat: THREE.MeshStandardMaterial;
    wire: THREE.LineBasicMaterial;
    diag: THREE.Mesh;
    title: HTMLElement;
    zeroLabel: THREE.Object3D;
  }
  const surfs: Surf[] = KINDS.map((k, idx) => {
    const group = new THREE.Group();
    group.position.x = SURF_X[idx];
    gEx.add(group);
    const pos = new Float32Array(V * 3);
    const col = new Float32Array(V * 3);
    for (let i = 0; i <= G; i++) {
      for (let j = 0; j <= G; j++) {
        const v = i * (G + 1) + j;
        pos[v * 3] = (i / G - 0.5) * S; // x1 to the right
        pos[v * 3 + 2] = -(j / G - 0.5) * S; // x2 into the screen
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05 });
    group.add(new THREE.Mesh(geo, mat));
    const wire = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 });
    group.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), wire));
    // floor frame and floor diagonal
    const frame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-S / 2, 0, S / 2), new THREE.Vector3(S / 2, 0, S / 2),
        new THREE.Vector3(S / 2, 0, -S / 2), new THREE.Vector3(-S / 2, 0, -S / 2),
      ]),
      new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }),
    );
    group.add(frame);
    const floorDiag = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-S / 2, 0.002, S / 2), new THREE.Vector3(S / 2, 0.002, -S / 2)]),
      new THREE.LineDashedMaterial({ color: PALETTE.rose, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0.7 }),
    );
    floorDiag.computeLineDistances();
    group.add(floorDiag);
    const diag = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: PALETTE.rose }));
    group.add(diag);
    const titleObj = stage.label('', [0, 0, S / 2 + 0.75], 'big', group);
    stage.label('x₁ →', [S / 2 - 0.2, 0, S / 2 + 0.3], 'muted', group);
    stage.label('x₂ →', [-S / 2 - 0.35, 0, 0.1], 'muted', group);
    const zeroLabel = stage.label('ψ ≡ 0: two fermions cannot share one state', [0, 0.35, 0], '', group);
    zeroLabel.visible = false;
    return { kind: k, group, pos, col, geo, mat, wire, diag, title: titleObj.element, zeroLabel };
  });
  const diagLabel = stage.label('x₁ = x₂', [S / 2 + 0.15, 0.1, -S / 2 - 0.1], 'muted', surfs[2].group);
  diagLabel.element.style.color = css(PALETTE.rose);

  const exStats: Record<Kind, { norm: number; sep: number; sepA: number; pClose: number }> = {
    dist: { norm: 1, sep: 0, sepA: 0, pClose: 0 },
    boson: { norm: 1, sep: 0, sepA: 0, pClose: 0 },
    fermion: { norm: 1, sep: 0, sepA: 0, pClose: 0 },
  };

  function rebuildSurfaces(): void {
    let peak = 0;
    for (const s of surfs) {
      for (let i = 0; i <= G; i++) {
        for (let j = 0; j <= G; j++) {
          const d = density(s.kind, n1, n2, i / G, j / G);
          s.pos[(i * (G + 1) + j) * 3 + 1] = d;
          if (d > peak) peak = d;
        }
      }
    }
    const k = HMAX / Math.max(peak, 1e-9);
    const pts: THREE.Vector3[] = [];
    for (const s of surfs) {
      for (let v = 0; v < V; v++) {
        const d = s.pos[v * 3 + 1];
        s.pos[v * 3 + 1] = d * k;
        rampInto(Math.sqrt(d / peak), s.col, v * 3);
      }
      (s.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (s.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      s.geo.computeVertexNormals();
      s.geo.computeBoundingSphere();
      pts.length = 0;
      for (let i = 0; i <= G; i++) {
        const v = i * (G + 1) + i;
        pts.push(new THREE.Vector3(s.pos[v * 3], s.pos[v * 3 + 1] + 0.012, s.pos[v * 3 + 2]));
      }
      s.diag.geometry.dispose();
      s.diag.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 128, 0.022, 6, false);
      const empty = s.kind === 'fermion' && n1 === n2;
      s.zeroLabel.visible = empty;
      const st = pairStats(s.kind, n1, n2, 160);
      exStats[s.kind].norm = st.norm;
      exStats[s.kind].sep = Math.sqrt(st.sep2);
      exStats[s.kind].sepA = Math.sqrt(sep2Analytic(s.kind, n1, n2));
      exStats[s.kind].pClose = st.pClose;
    }
    paintTitles();
  }

  function paintTitles(): void {
    const t: Record<Kind, string> = {
      dist: `distinguishable`,
      boson: `bosons (+)`,
      fermion: `fermions (−)`,
    };
    for (const s of surfs) {
      s.title.textContent = t[s.kind];
      const on = s.kind === kind;
      s.mat.color.setScalar(on ? 1 : 0.16);
      s.wire.opacity = on ? 0.09 : 0.03;
      (s.diag.material as THREE.MeshBasicMaterial).color.set(on ? PALETTE.rose : 0x5a3450);
      s.title.style.opacity = on ? '1' : '0.5';
    }
  }

  // ================================================================ view 2: level filling
  const gFill = new THREE.Group();
  scene.add(gFill);
  interface Orb { x: number; y: number; sub: number; k: number }
  const orbs: Orb[] = [];
  SUBSHELLS.forEach((s, si) => {
    const xs = s.l === 0 ? [COL_S] : s.l === 1 ? COL_P : COL_D;
    for (let k = 0; k < s.orbitals; k++) orbs.push({ x: xs[k], y: Y0 + s.E * E_Y, sub: si, k });
  });
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(BAR_W, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), orbs.length);
  gFill.add(bars);
  {
    const m = new THREE.Matrix4();
    orbs.forEach((o, i) => bars.setMatrixAt(i, m.makeTranslation(o.x, o.y, 0)));
    SUBSHELLS.forEach((s) => {
      const xs = s.l === 0 ? [COL_S] : s.l === 1 ? COL_P : COL_D;
      stage.label(s.name, [xs[0] - BAR_W / 2 - 0.22, Y0 + s.E * E_Y, 0], 'muted', gFill);
    });
    // energy axis
    const ax = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-5.1, Y0 - 0.3, 0), 5.2, 0x56627c, 0.25, 0.14);
    gFill.add(ax);
    stage.label('energy', [-5.1, Y0 + 5.2, 0], 'muted', gFill);
    stage.label('s', [COL_S, Y0 - 0.5, 0], 'muted', gFill);
    stage.label('p  (3 orbitals)', [COL_P[1], Y0 - 0.5, 0], 'muted', gFill);
    stage.label('d  (5 orbitals)', [COL_D[2], Y0 + 9.4 * E_Y + 0.5, 0], 'muted', gFill);
  }
  const headline = stage.label('', [-1.5, Y0 - 1.05, 0], 'big', gFill);
  // spin arrows (fermions)
  const arrowGeo = (() => {
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.24, 8);
    shaft.translate(0, -0.05, 0);
    const head = new THREE.ConeGeometry(0.07, 0.14, 12);
    head.translate(0, 0.14, 0);
    const g = mergeGeometries([shaft, head])!;
    shaft.dispose();
    head.dispose();
    return g;
  })();
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, emissive: 0x111111 }), orbs.length * 2);
  arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gFill.add(arrows);
  // balls (bosons and labelled particles)
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.068, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.3, emissive: 0x111111 }), orbs.length * BALLS);
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gFill.add(balls);

  const bgc = new THREE.Color(PALETTE.bg);
  const cUp = new THREE.Color(PALETTE.amber);
  const cDown = new THREE.Color(PALETTE.cyan);
  const cBoson = new THREE.Color(PALETTE.violet);
  const cDist = new THREE.Color(PALETTE.green);
  const cBar = new THREE.Color(0x8391ab);
  const cClosed = new THREE.Color(PALETTE.green);
  const tmpC = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  const tp = new THREE.Vector3();
  const sc = new THREE.Vector3();

  const target: number[] = [];
  const shown: number[] = SUBSHELLS.map(() => 0);
  let mu = 0;
  let fillDirty = true;

  function recomputeFill(): void {
    mu = subshellOcc(kind, N, kT, target).mu;
    fillDirty = true;
    paintFillLabels();
    drawInset();
  }

  function drawFill(): void {
    const fermi = kind === 'fermion';
    let a = 0;
    let b = 0;
    orbs.forEach((o) => {
      const s = SUBSHELLS[o.sub];
      const n = shown[o.sub];
      if (fermi) {
        for (let spin = 0; spin < 2; spin++) {
          const f = slotFill(n, spin * s.orbitals + o.k);
          tp.set(o.x + (spin === 0 ? -0.15 : 0.15), o.y + 0.2, 0);
          sc.setScalar(f > 0.02 ? 1 : 0);
          m4.compose(tp, spin === 0 ? q.identity() : qDown, sc);
          arrows.setMatrixAt(a, m4);
          arrows.setColorAt(a, tmpC.copy(bgc).lerp(spin === 0 ? cUp : cDown, f));
          a++;
        }
        for (let k = 0; k < BALLS; k++) {
          balls.setMatrixAt(b, m4.makeScale(0, 0, 0));
          b++;
        }
      } else {
        const per = n / s.orbitals;
        for (let spin = 0; spin < 2; spin++) {
          arrows.setMatrixAt(a, m4.makeScale(0, 0, 0));
          a++;
        }
        for (let k = 0; k < BALLS; k++) {
          const f = Math.max(0, Math.min(1, per - k));
          const col = k % 5;
          const row = Math.floor(k / 5);
          tp.set(o.x + (col - 2) * 0.15, o.y + 0.1 + row * 0.15, 0);
          sc.setScalar(f > 0.02 ? 1 : 0);
          m4.compose(tp, q.identity(), sc);
          balls.setMatrixAt(b, m4);
          balls.setColorAt(b, tmpC.copy(bgc).lerp(kind === 'boson' ? cBoson : cDist, f));
          b++;
        }
      }
    });
    arrows.instanceMatrix.needsUpdate = true;
    balls.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  }

  const periodOcc = [0, 0, 0, 0];
  function paintFillLabels(): void {
    periodOcc.fill(0);
    SUBSHELLS.forEach((s, i) => (periodOcc[s.period - 1] += target[i]));
    const caps = [2, 8, 8, 18];
    const closed = periodOcc.map((v, i) => kind === 'fermion' && Math.abs(v - caps[i]) < 0.02);
    orbs.forEach((o, i) => bars.setColorAt(i, closed[SUBSHELLS[o.sub].period - 1] ? cClosed : cBar));
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    let txt = '';
    if (kind === 'fermion') {
      const [sym, name] = ELEMENTS[N - 1];
      const af = aufbau(N);
      const cold = af.every((v, i) => Math.abs(v - target[i]) < 0.05);
      const shut = closed.some((c, i) => c && periodOcc[i + 1] < 0.02);
      txt = `Z = ${N} · ${sym} (${name}) · ${cold ? configString(af) : 'thermally smeared'}${shut ? ' · closed shell' : ''}`;
    } else if (kind === 'boson') {
      txt = `${N} spin-0 bosons · ${target[0].toFixed(2)} in the lowest level`;
    } else {
      txt = `${N} distinguishable particles · ${target[0].toFixed(2)} in the lowest level`;
    }
    if (headline.element.textContent !== txt) headline.element.textContent = txt;
  }

  // ================================================================ view 3: Hong–Ou–Mandel
  const gHom = new THREE.Group();
  scene.add(gHom);
  {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false }),
    );
    gHom.add(glass);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 0.9, 0.9)), new THREE.LineBasicMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.6 }));
    gHom.add(edges);
    const coat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.02, 0.88), new THREE.MeshStandardMaterial({ color: 0xa6e9f5, metalness: 0.6, roughness: 0.2, transparent: true, opacity: 0.7 }));
    coat.rotation.z = Math.PI / 4;
    gHom.add(coat);
    const beamMat = new THREE.LineBasicMaterial({ color: 0x2c3852 });
    const beams = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-ARM, 0, 0), new THREE.Vector3(DET, 0, 0),
        new THREE.Vector3(0, -ARM, 0), new THREE.Vector3(0, DET, 0),
      ]),
      beamMat,
    );
    gHom.add(beams);
    const srcMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.6 });
    const srcA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), srcMat);
    srcA.position.set(-ARM - 0.25, 0, 0);
    gHom.add(srcA);
    const srcB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), srcMat);
    srcB.position.set(0, -ARM - 0.25, 0);
    gHom.add(srcB);
    stage.label('input A', [-ARM - 0.25, -0.45, 0], 'muted', gHom);
    stage.label('50:50 beam splitter', [0.95, -0.7, 0], 'muted', gHom);
  }
  const delayLabel = stage.label('', [0.55, -ARM - 0.25, 0], 'muted', gHom);
  const detMat = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: 0x3a4660, emissive: new THREE.Color(PALETTE.green), emissiveIntensity: 0, roughness: 0.4 }));
  const detGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.45, 24);
  const det1 = new THREE.Mesh(detGeo, detMat[0]);
  det1.rotation.z = Math.PI / 2;
  det1.position.set(DET + 0.22, 0, 0);
  gHom.add(det1);
  const det2 = new THREE.Mesh(detGeo, detMat[1]);
  det2.position.set(0, DET + 0.22, 0);
  gHom.add(det2);
  stage.label('detector 1', [DET + 0.22, -0.5, 0], 'muted', gHom);
  stage.label('detector 2', [0.95, DET + 0.22, 0], 'muted', gHom);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x1b2a22 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), lampMat);
  lamp.position.set(2.5, 2.5, 0);
  gHom.add(lamp);
  const lampLabel = stage.label('coincidence', [2.5, 2.05, 0], 'muted', gHom);
  const lampText = lampLabel.element;
  const phMats = [0, 1].map(() => new THREE.SpriteMaterial({ map: dotTex, color: PALETTE.amber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const photons = phMats.map((m) => {
    const sp = new THREE.Sprite(m);
    sp.visible = false;
    gHom.add(sp);
    return sp;
  });

  const rng = mulberry(1987);
  const binPairs = new Float64Array(NBINS);
  const binCoinc = new Float64Array(NBINS);
  let pairAcc = 0;
  const binOf = (tau: number) => Math.max(0, Math.min(NBINS - 1, Math.round((tau + 3) / BIN)));

  // one visual pair at a time
  let cyc = 0;
  let cycEnd = 1;
  const t0 = [0, 0];
  const port = [0, 0]; // 0 = detector 1 (+x), 1 = detector 2 (+y)
  const arrived = [false, false];
  let lampGlow = 0;
  const detGlow = [0, 0];
  function newPair(): void {
    cyc = 0;
    t0[0] = Math.max(0, -delay) * T_PER_TAU;
    t0[1] = Math.max(0, delay) * T_PER_TAU;
    const coinc = rng() < homCoincidence(kind, delay);
    if (coinc) {
      // A transmitted to +x, B transmitted to +y, or both reflected. Same detectors either way.
      port[0] = rng() < 0.5 ? 0 : 1;
      port[1] = 1 - port[0];
    } else {
      port[0] = port[1] = rng() < 0.5 ? 0 : 1;
    }
    arrived[0] = arrived[1] = false;
    cycEnd = Math.max(t0[0], t0[1]) + (ARM + DET) / V_PH + 0.45;
    const identical = kind !== 'dist';
    const c = kind === 'fermion' ? PALETTE.rose : PALETTE.amber;
    phMats[0].color.set(c);
    phMats[1].color.set(identical ? c : PALETTE.cyan);
  }

  function stepHom(dt: number): void {
    // counting statistics
    pairAcc += PAIR_RATE * dt;
    const bi = binOf(delay);
    const pc = homCoincidence(kind, delay);
    while (pairAcc >= 1) {
      pairAcc -= 1;
      binPairs[bi] += 1;
      if (rng() < pc) binCoinc[bi] += 1;
    }
    // visual pair
    cyc += dt;
    for (let i = 0; i < 2; i++) {
      const s = V_PH * (cyc - t0[i]) - ARM;
      const sp = photons[i];
      if (s < -ARM || arrived[i]) {
        sp.visible = false;
        continue;
      }
      if (s >= DET) {
        arrived[i] = true;
        sp.visible = false;
        detGlow[port[i]] = 1;
        if (arrived[0] && arrived[1] && port[0] !== port[1]) lampGlow = 1;
        continue;
      }
      sp.visible = true;
      let horiz: boolean;
      if (s < 0) {
        horiz = i === 0;
        if (i === 0) sp.position.set(s, 0, 0.05);
        else sp.position.set(0, s, 0.05);
      } else {
        horiz = port[i] === 0;
        if (port[i] === 0) sp.position.set(s, 0, 0.05);
        else sp.position.set(0, s, 0.05);
      }
      const off = port[0] === port[1] && s > 0 && i === 1 ? 0.05 : 0;
      sp.position.z += off;
      if (horiz) sp.scale.set(0.95, 0.42, 1);
      else sp.scale.set(0.42, 0.95, 1);
    }
    if (cyc > cycEnd) newPair();
    for (let k = 0; k < 2; k++) {
      detGlow[k] = Math.max(0, detGlow[k] - dt * 2.2);
      detMat[k].emissiveIntensity = detGlow[k] * 1.4;
    }
    lampGlow = Math.max(0, lampGlow - dt * 1.6);
    lampMat.color.setRGB(0.1 + 0.27 * lampGlow * 1.3, 0.16 + 0.73 * lampGlow, 0.13 + 0.47 * lampGlow);
    lampText.style.color = lampGlow > 0.2 ? css(PALETTE.green) : '';
  }

  // ================================================================ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '260px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const hl = (c: number, t: string) => `<span style="color:${css(c)}">${t}</span>`;
  function paintLegend(): void {
    if (view === 'exchange') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Two particles in a box</div>
<div>Height = |ψ(x₁, x₂)|², the chance to find one particle at x₁ and the other at x₂. Same scale for all three.</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,#0d1429,#292b75,#8c66eb,#f573b5,#f5b542,#fff7db)"></div>
<div>${hl(PALETTE.rose, 'Pink line')}: the diagonal x₁ = x₂, both particles in the same place. Fermions: zero. Bosons: a ridge.</div>`;
    } else if (view === 'filling') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Filling energy levels</div>
<div>${hl(PALETTE.amber, '↑')} ${hl(PALETTE.cyan, '↓')} electrons: 2 per orbital at most.</div>
<div>${hl(PALETTE.violet, 'bosons')}, ${hl(PALETTE.green, 'labelled')}: no limit. Faded = thermal average.</div>
<div>Full rows turn ${hl(PALETTE.green, 'green')}.</div>`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Hong–Ou–Mandel</div>
<div>Two photons meet a 50:50 beam splitter. If they are identical and arrive together, they always leave by the same port. The ${hl(PALETTE.green, 'coincidence')} lamp stays dark.</div>
<div>Distinguishable photons are drawn in two colours. Fermions (${hl(PALETTE.rose, 'electrons')}) always split.</div>`;
    }
  }

  function makeInset(top: boolean): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
    const c = document.createElement('canvas');
    c.width = 460;
    c.height = 320;
    Object.assign(c.style, {
      position: 'absolute', right: '10px', [top ? 'top' : 'bottom']: '10px', width: '230px', height: '160px',
      background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    } as unknown as CSSStyleDeclaration);
    viewport.appendChild(c);
    return { c, x: c.getContext('2d')! };
  }
  const occInset = makeInset(true);
  const homInset = makeInset(false);

  const KCOL: Record<Kind, number> = { dist: 0x8391ab, boson: PALETTE.violet, fermion: PALETTE.amber };
  function drawInset(): void {
    const { c, x: ctx } = occInset;
    const W = c.width, Hh = c.height;
    const x0 = 50, x1 = W - 14, y0 = Hh - 42, y1 = 60;
    const EMIN = -1, EMAX = 11, YMAX = 2;
    const X = (e: number) => x0 + ((e - EMIN) / (EMAX - EMIN)) * (x1 - x0);
    const Y = (f: number) => y0 - (Math.min(f, YMAX * 1.04) / YMAX) * (y0 - y1);
    ctx.clearRect(0, 0, W, Hh);
    ctx.font = '22px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText(`occupancy per state · kT = ${kT.toFixed(2)}`, 14, 30);
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    for (const f of [0, 1, 2]) {
      ctx.beginPath(); ctx.moveTo(x0, Y(f)); ctx.lineTo(x1, Y(f)); ctx.stroke();
      ctx.fillStyle = '#56627c';
      ctx.fillText(String(f), 18, Y(f) + 8);
    }
    ctx.fillStyle = '#56627c';
    for (const s of SUBSHELLS) {
      ctx.fillRect(X(s.E) - 1, y0, 2, 8);
    }
    ctx.fillText('E →', x1 - 44, y0 + 32);
    ctx.fillText('levels', x0, y0 + 32);
    for (const k of KINDS) {
      const m = solveMu(k, N, kT);
      ctx.strokeStyle = css(KCOL[k]);
      ctx.lineWidth = k === kind ? 4 : 2;
      ctx.setLineDash(k === 'dist' ? [8, 7] : []);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 160; i++) {
        const e = EMIN + ((EMAX - EMIN) * i) / 160;
        const v = occ(k, (e - m) / kT);
        if (k === 'boson' && e <= m) { started = false; continue; }
        const y = Y(Number.isFinite(v) ? v : YMAX * 2);
        if (!started) { ctx.moveTo(X(e), y); started = true; } else ctx.lineTo(X(e), y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = '19px JetBrains Mono, monospace';
    const lx = W - 170;
    ctx.fillStyle = css(KCOL.fermion); ctx.fillText('Fermi–Dirac', lx, Y(1.55));
    ctx.fillStyle = css(KCOL.boson); ctx.fillText('Bose–Einstein', lx, Y(1.55) + 22);
    ctx.fillStyle = css(KCOL.dist); ctx.fillText('Boltzmann', lx, Y(1.55) + 44);
  }

  let homDrawT = 0;
  function drawHom(): void {
    const { c, x: ctx } = homInset;
    const W = c.width, Hh = c.height;
    const x0 = 50, x1 = W - 14, y0 = Hh - 42, y1 = 56;
    const X = (t: number) => x0 + ((t + 3) / 6) * (x1 - x0);
    const Y = (p: number) => y0 - p * (y0 - y1);
    ctx.clearRect(0, 0, W, Hh);
    ctx.font = '22px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText('coincidence prob. vs delay', 14, 30);
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    for (const p of [0, 0.5, 1]) {
      ctx.beginPath(); ctx.moveTo(x0, Y(p)); ctx.lineTo(x1, Y(p)); ctx.stroke();
      ctx.fillStyle = '#56627c';
      ctx.fillText(p === 0.5 ? '½' : String(p), 18, Y(p) + 8);
    }
    for (const t of [-3, 0, 3]) ctx.fillText(`${t}`, X(t) - 8, y0 + 30);
    ctx.fillText('τ / τc', x1 - 80, y0 + 30);
    ctx.strokeStyle = '#8391ab';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = -3 + (6 * i) / 120;
      const y = Y(homCoincidence(kind, t));
      if (i === 0) ctx.moveTo(X(t), y); else ctx.lineTo(X(t), y);
    }
    ctx.stroke();
    ctx.fillStyle = css(PALETTE.cyan);
    for (let b = 0; b < NBINS; b++) {
      if (binPairs[b] < 5) continue;
      ctx.beginPath();
      ctx.arc(X(-3 + b * BIN), Y(binCoinc[b] / binPairs[b]), 5, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.strokeStyle = css(PALETTE.amber);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(delay), y1 - 6); ctx.lineTo(X(delay), y0); ctx.stroke();
  }

  // ================================================================ controls
  const ui = new Panel(panel);
  ui.section('Scene');
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'exchange', label: 'Exchange' }, { value: 'filling', label: 'Filling' }, { value: 'hom', label: 'HOM' }],
    onChange: (v) => setView(v),
  });
  const kindCtl = ui.select<Kind>({
    key: 'ptype', label: 'Particle type', value: kind,
    options: [{ value: 'dist', label: 'Distinguishable' }, { value: 'boson', label: 'Bosons (+)' }, { value: 'fermion', label: 'Fermions (−)' }],
    onChange: (v) => {
      kind = v;
      paintTitles();
      recomputeFill();
      binPairs.fill(0);
      binCoinc.fill(0);
      newPair();
    },
  });

  ui.section('Two particles in a box');
  ui.slider({ key: 'n1', label: 'State of particle 1, n₁', min: 1, max: 5, step: 1, value: n1, onInput: (v) => { n1 = v; rebuildSurfaces(); } });
  ui.slider({ key: 'n2', label: 'State of particle 2, n₂', min: 1, max: 5, step: 1, value: n2, onInput: (v) => { n2 = v; rebuildSurfaces(); } });
  const rDiag = ui.readout('diag', 'ρ(x,x) / ρ_dist(x,x)');
  const rSep = ui.readout('sep', 'rms |x₁ − x₂|', 'L');
  const rClose = ui.readout('pclose', 'P(|x₁ − x₂| < 0.1L)');
  const rNorm = ui.readout('norm', 'grid norm ∫|ψ|²');

  ui.section('Filling levels');
  const nCtl = ui.slider({ key: 'N', label: 'Number of particles (Z)', min: 1, max: 20, step: 1, value: N, onInput: (v) => { N = v; building = false; buildBtn.textContent = 'Build atoms 1 → 20'; recomputeFill(); } });
  const tCtl = ui.slider({
    key: 'T', label: 'Temperature kT / ε', min: -1.7, max: 0.5, step: 0.01, value: logT,
    format: (v) => (10 ** v).toFixed(10 ** v < 0.1 ? 3 : 2),
    onInput: (v) => { logT = v; kT = 10 ** v; recomputeFill(); },
  });
  const [buildBtn] = ui.buttons([{
    label: 'Build atoms 1 → 20', primary: true, key: 'N',
    onClick: () => {
      building = !building;
      buildBtn.textContent = building ? 'Stop' : 'Build atoms 1 → 20';
      if (building) {
        if (kind !== 'fermion') kindCtl.set('fermion');
        if (view !== 'filling') setView('filling');
        tCtl.set(-1.7);
        N = 1;
        nCtl.set(1, false);
        buildClock = 0;
        recomputeFill();
      }
    },
  }]);
  const rN0 = ui.readout('N0', 'lowest level N₀');
  const rMu = ui.readout('mu', 'chemical pot. μ / ε');
  const rShell = ui.readout('shell', 'rows 1 / 2 / 3');
  const rSum = ui.readout('nsum', 'Σ n − N');

  ui.section('Hong–Ou–Mandel');
  ui.slider({
    key: 'delay', label: 'Delay τ / τc', min: -3, max: 3, step: 0.05, value: delay, format: (v) => v.toFixed(2),
    onInput: (v) => { delay = v; },
  });
  ui.buttons([{ label: 'Clear counts', onClick: () => { binPairs.fill(0); binCoinc.fill(0); } }]);
  const rPc = ui.readout('pc', 'P_c theory');
  const rMeas = ui.readout('meas', 'P_c measured');
  const rPairs = ui.readout('pairs', 'pairs at this τ');
  const rVis = ui.readout('vis', 'dip visibility V');

  function setView(v: View): void {
    view = v;
    gEx.visible = v === 'exchange';
    gFill.visible = v === 'filling';
    gHom.visible = v === 'hom';
    homInset.c.style.display = v === 'hom' ? '' : 'none';
    occInset.c.style.display = v === 'hom' ? 'none' : '';
    occInset.c.style.top = v === 'exchange' ? '10px' : '';
    occInset.c.style.bottom = v === 'filling' ? '10px' : '';
    stage.flyTo(CAMS[v][0], CAMS[v][1], 1.0);
    paintLegend();
    if (v === 'hom') newPair();
  }

  function updateReadouts(): void {
    const st = exStats[kind];
    const empty = kind === 'fermion' && n1 === n2;
    rDiag(empty ? 'no state' : kind === 'dist' ? '1' : kind === 'fermion' ? '0' : n1 === n2 ? '1' : '2');
    rSep(empty ? '—' : `${st.sep.toFixed(3)} (exact ${st.sepA.toFixed(3)})`);
    rClose(empty ? '—' : `${(st.pClose * 100).toFixed(1)} %`);
    rNorm(empty ? '0 (Pauli)' : st.norm.toFixed(6));
    rN0(target[0].toFixed(2));
    rMu(mu.toFixed(2));
    rShell(`${periodOcc[0].toFixed(1)} / ${periodOcc[1].toFixed(1)} / ${periodOcc[2].toFixed(1)}`);
    let sum = 0;
    for (const v of target) sum += v;
    rSum((sum - N).toExponential(0));
    const bi = binOf(delay);
    rPc(homCoincidence(kind, delay).toFixed(3));
    rMeas(binPairs[bi] > 0 ? (binCoinc[bi] / binPairs[bi]).toFixed(3) : '…');
    rPairs(binPairs[bi].toFixed(0));
    rVis(homVisibility(kind).toFixed(2));
  }

  // ================================================================ frame loop
  let roTimer = 0;
  stage.onFrame((dt) => {
    if (building) {
      buildClock += dt;
      if (buildClock > 0.9) {
        buildClock = 0;
        if (N < 20) {
          N++;
          nCtl.set(N, false);
          recomputeFill();
        } else {
          building = false;
          buildBtn.textContent = 'Build atoms 1 → 20';
        }
      }
    }
    // ease displayed occupancies toward the thermal targets
    let moved = false;
    for (let i = 0; i < shown.length; i++) {
      const d = target[i] - shown[i];
      if (Math.abs(d) > 1e-4) {
        shown[i] += d * Math.min(1, dt * 7);
        moved = true;
      } else if (d !== 0) {
        shown[i] = target[i];
        moved = true;
      }
    }
    if ((moved || fillDirty) && view === 'filling') {
      drawFill();
      paintFillLabels();
      fillDirty = false;
    }
    if (view === 'hom') {
      stepHom(dt);
      delayLabel.element.textContent = `input B · delay τ = ${delay.toFixed(2)} τc`;
      homDrawT += dt;
      if (homDrawT > 0.2) { homDrawT = 0; drawHom(); }
    }
    roTimer += dt;
    if (roTimer > 0.15) { roTimer = 0; updateReadouts(); }
  });

  rebuildSurfaces();
  recomputeFill();
  paintFillLabels();
  setView('exchange');
  stage.camera.position.set(...CAMS.exchange[0]);
  newPair();
  updateReadouts();

  return {
    state: () => {
      const bi = binOf(delay);
      return {
        view,
        ptype: kind,
        n1,
        n2,
        N,
        kT,
        N0: target[0],
        mu,
        shell1: periodOcc[0],
        shell2: periodOcc[1],
        shell3: periodOcc[2],
        diagRatio: kind === 'fermion' ? 0 : kind === 'boson' && n1 !== n2 ? 2 : 1,
        sep: exStats[kind].sep,
        delay,
        pc: homCoincidence(kind, delay),
        pairsHere: binPairs[bi],
        measured: binPairs[bi] > 0 ? binCoinc[bi] / binPairs[bi] : 1,
        visibility: homVisibility(kind),
        spinDeg: spinDeg(kind),
      };
    },
    dispose: () => {
      building = false;
      legend.remove();
      occInset.c.remove();
      homInset.c.remove();
      dotTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'spin-statistics',
  number: 75,
  title: 'Fermions & Bosons',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Why electrons stack into atoms and photons pile into lasers.',
  content,
  mount,
};

export default topic;
