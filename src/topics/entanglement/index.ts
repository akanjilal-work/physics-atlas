import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  CHSH_SIGN, Tally, chsh, correlation, jointProbs, lhvE, mulberry32, pairIndex, quantumE, runExperiment, samplePair, wrapPi,
  type Model, type Settings,
} from './physics.ts';

type View = 'lab' | 'alice' | 'bob';

const DEG = Math.PI / 180;

// --- Scene layout (scene units)
const DX = 3.3; // source to analyzer
const R = 0.78; // dial radius
const FLOOR = -1.5;
const X0 = 0.24; // pulses start here
const X1 = DX - 0.3; // and are measured here
const FLY = 0.95; // seconds of flight
const HZ = 2.1; // histogram z position
const HBAR = 1.15; // bar height for probability 1
const GROUP_X = [-1.95, -0.65, 0.65, 1.95];

// --- Budget
const MAXP = 600; // pairs in flight
const SEED = 800; // pairs pre-tallied at load
const MAX_EMIT_PER_FRAME = 40;

// Colours per setting: a, a', b, b'
const SET_COL = [PALETTE.amber, PALETTE.rose, PALETTE.cyan, PALETTE.violet];
const SET_NAME = ['a', 'a′', 'b', 'b′'];
const PAIR_NAME = ['a,b', 'a,b′', 'a′,b', 'a′,b′'];

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Detector {
  side: -1 | 1;
  group: THREE.Group;
  magnet: THREE.Group;
  lampP: THREE.SpriteMaterial;
  lampM: THREE.SpriteMaterial;
  bulbP: THREE.MeshBasicMaterial;
  bulbM: THREE.MeshBasicMaterial;
  fp: number;
  fm: number;
  cur: number;
  target: number;
  needlePos: Float32Array;
  needleGeo: THREE.BufferGeometry;
  tips: THREE.Mesh[];
  tags: ReturnType<Stage['label']>[];
  info: ReturnType<Stage['label']>;
}
type Stage = ReturnType<typeof createStage>;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM: [number, number, number] = [0, 2.9, 7.1];
  const TGT: [number, number, number] = [0, 0.05, 0.55];
  const stage = createStage(viewport, { camera: CAM, target: TGT, fov: 52 });
  const { scene } = stage;
  const glow = glowTexture();

  // --- Parameters
  const set: Settings = { a: 0, a2: 90 * DEG, b: 45 * DEG, b2: 135 * DEG };
  let mode: Model = 'quantum';
  let rate = 20;
  let playing = true;
  let view: View = 'lab';

  const angleOf = (i: number) => (i === 0 ? set.a : i === 1 ? set.a2 : i === 2 ? set.b : set.b2);

  // --- Floor
  const grid = makeGrid(18, 36);
  grid.position.y = FLOOR;
  scene.add(grid);

  // --- Source
  const srcMat = new THREE.MeshBasicMaterial({ color: 0xe9e2ff });
  const src = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), srcMat);
  scene.add(src);
  const srcGlowMat = new THREE.SpriteMaterial({ map: glow, color: PALETTE.violet, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 });
  const srcGlow = new THREE.Sprite(srcGlowMat);
  srcGlow.scale.setScalar(1.1);
  scene.add(srcGlow);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, -FLOOR - 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x3a4660, metalness: 0.5, roughness: 0.5 }));
  post.position.y = (FLOOR - 0.2) / 2;
  scene.add(post);
  stage.label('entangled-pair source', [0, -0.42, 0.3], 'muted');

  // Beam guide
  const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-X1, 0, 0), new THREE.Vector3(X1, 0, 0)]);
  const guide = new THREE.Line(guideGeo, new THREE.LineDashedMaterial({ color: PALETTE.gridMajor, dashSize: 0.12, gapSize: 0.1 }));
  guide.computeLineDistances();
  scene.add(guide);

  // --- Analyzers
  const poleN = new THREE.MeshStandardMaterial({ color: 0x9c3b4a, metalness: 0.55, roughness: 0.4 });
  const poleS = new THREE.MeshStandardMaterial({ color: 0x33508c, metalness: 0.55, roughness: 0.4 });
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.5, roughness: 0.55 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3c4a6a });
  const tickMat = new THREE.LineBasicMaterial({ color: 0x4a5a7e });
  const discMat = new THREE.MeshBasicMaterial({ color: 0x0c1222, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

  function makeDetector(side: -1 | 1, name: string): Detector {
    const group = new THREE.Group();
    group.position.x = side * DX;
    scene.add(group);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 64), discMat);
    disc.rotation.y = Math.PI / 2;
    group.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 96), ringMat);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
    const tp: number[] = [];
    for (let d = 0; d < 360; d += 15) {
      const major = d % 90 === 0;
      const c = Math.cos(d * DEG);
      const s = Math.sin(d * DEG);
      const r0 = R + 0.02;
      const r1 = R + (major ? 0.2 : 0.1);
      tp.push(0, r0 * c, r0 * s, 0, r1 * c, r1 * s);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    group.add(new THREE.LineSegments(tg, tickMat));

    // Setting needles (static, one per setting)
    const needlePos = new Float32Array(12);
    const needleGeo = new THREE.BufferGeometry();
    needleGeo.setAttribute('position', new THREE.BufferAttribute(needlePos, 3));
    const i0 = side < 0 ? 0 : 2;
    const needleCol = new Float32Array(12);
    for (let j = 0; j < 2; j++) {
      const c = new THREE.Color(SET_COL[i0 + j]);
      needleCol.set([c.r, c.g, c.b, c.r, c.g, c.b], 6 * j);
    }
    needleGeo.setAttribute('color', new THREE.BufferAttribute(needleCol, 3));
    group.add(new THREE.LineSegments(needleGeo, new THREE.LineBasicMaterial({ vertexColors: true })));
    const tips: THREE.Mesh[] = [];
    const tags: ReturnType<Stage['label']>[] = [];
    for (let j = 0; j < 2; j++) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 14), new THREE.MeshBasicMaterial({ color: SET_COL[i0 + j] }));
      group.add(tip);
      tips.push(tip);
      const tag = stage.label(SET_NAME[i0 + j], [0, 0, 0], '', group);
      tag.element.style.color = css(SET_COL[i0 + j]);
      tag.element.style.background = 'transparent';
      tags.push(tag);
    }

    // Stern-Gerlach magnet, turned to the setting in use. Local +y is the analyzer axis.
    const magnet = new THREE.Group();
    group.add(magnet);
    const n1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.46), poleN);
    n1.position.y = 0.32;
    magnet.add(n1);
    const n2 = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.18, 4), poleN);
    n2.rotation.set(Math.PI, Math.PI / 4, 0);
    n2.position.y = 0.16;
    magnet.add(n2);
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.46), poleS);
    s1.position.y = -0.32;
    magnet.add(s1);
    // Output lamps: + along the axis, - opposite
    const bulbGeo = new THREE.SphereGeometry(0.075, 16, 12);
    const bulbP = new THREE.MeshBasicMaterial({ color: 0x1d4a34 });
    const bulbM = new THREE.MeshBasicMaterial({ color: 0x4a1d24 });
    const bp = new THREE.Mesh(bulbGeo, bulbP);
    bp.position.set(side * 0.45, 0.6, 0);
    const bm = new THREE.Mesh(bulbGeo, bulbM);
    bm.position.set(side * 0.45, -0.6, 0);
    magnet.add(bp, bm);
    const lampP = new THREE.SpriteMaterial({ map: glow, color: PALETTE.green, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const lampM = new THREE.SpriteMaterial({ map: glow, color: PALETTE.red, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const sp = new THREE.Sprite(lampP);
    sp.scale.setScalar(0.85);
    sp.position.copy(bp.position);
    const sm = new THREE.Sprite(lampM);
    sm.scale.setScalar(0.85);
    sm.position.copy(bm.position);
    magnet.add(sp, sm);
    const lp = stage.label('+', [side * 0.45, 0.8, 0], '', magnet);
    lp.element.style.color = css(PALETTE.green);
    lp.element.style.background = 'transparent';
    const lm = stage.label('−', [side * 0.45, -0.8, 0], '', magnet);
    lm.element.style.color = css(PALETTE.red);
    lm.element.style.background = 'transparent';

    // Detector housing behind the magnet
    const house = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 24), housingMat);
    house.rotation.z = Math.PI / 2;
    house.position.x = side * 0.9;
    group.add(house);

    stage.label(name, [0, -R - 0.36, 0], 'big', group);
    const info = stage.label('', [0, -R - 0.62, 0], 'muted', group);
    return { side, group, magnet, lampP, lampM, bulbP, bulbM, fp: 0, fm: 0, cur: 0, target: 0, needlePos, needleGeo, tips, tags, info };
  }

  const det = [makeDetector(-1, 'Alice'), makeDetector(1, 'Bob')];

  const up = new THREE.Vector3(0, 1, 0);
  const dirV = new THREE.Vector3();
  function paintSettings(): void {
    for (let s = 0; s < 2; s++) {
      const d = det[s];
      for (let j = 0; j < 2; j++) {
        const th = angleOf(2 * s + j);
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const o = 6 * j;
        const x = d.side * -0.03 * (j + 1);
        d.needlePos[o] = x;
        d.needlePos[o + 1] = 0;
        d.needlePos[o + 2] = 0;
        d.needlePos[o + 3] = x;
        d.needlePos[o + 4] = (R - 0.1) * c;
        d.needlePos[o + 5] = (R - 0.1) * sn;
        dirV.set(0, c, sn);
        d.tips[j].position.set(x, (R - 0.02) * c, (R - 0.02) * sn);
        d.tips[j].quaternion.setFromUnitVectors(up, dirV);
        d.tags[j].position.set(0, (R + 0.3) * c, (R + 0.3) * sn);
      }
      d.needleGeo.attributes.position.needsUpdate = true;
      const i0 = 2 * s;
      d.info.element.textContent = `${SET_NAME[i0]} = ${Math.round(angleOf(i0) / DEG)}°   ${SET_NAME[i0 + 1]} = ${Math.round(angleOf(i0 + 1) / DEG)}°`;
    }
  }

  // --- Pulses in flight
  const active = new Uint8Array(MAXP);
  const t0 = new Float64Array(MAXP);
  const lam = new Float32Array(MAXP);
  const jy = new Float32Array(MAXP);
  const jz = new Float32Array(MAXP);
  const freeStack = new Int32Array(MAXP);
  let freeTop = 0;
  for (let i = MAXP - 1; i >= 0; i--) freeStack[freeTop++] = i;

  const pPos = new Float32Array(MAXP * 2 * 3);
  const pCol = new Float32Array(MAXP * 2 * 3);
  const pGeo = new THREE.BufferGeometry();
  const pPosAttr = new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage);
  const pColAttr = new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position', pPosAttr);
  pGeo.setAttribute('color', pColAttr);
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.36, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);

  // Entanglement threads between partners (quantum mode)
  const lPos = new Float32Array(MAXP * 2 * 3);
  const lGeo = new THREE.BufferGeometry();
  const lPosAttr = new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage);
  lGeo.setAttribute('position', lPosAttr);
  const threadMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const threads = new THREE.LineSegments(lGeo, threadMat);
  threads.frustumCulled = false;
  scene.add(threads);

  // Hidden-variable arrows (local mode)
  const aPos = new Float32Array(MAXP * 4 * 3);
  const aGeo = new THREE.BufferGeometry();
  const aPosAttr = new THREE.BufferAttribute(aPos, 3).setUsage(THREE.DynamicDrawUsage);
  aGeo.setAttribute('position', aPosAttr);
  const arrows = new THREE.LineSegments(aGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  arrows.frustumCulled = false;
  scene.add(arrows);

  const qCol = new THREE.Color(PALETTE.violet).lerp(new THREE.Color(0xffffff), 0.25);
  const lCol = new THREE.Color(0xf2ecdf);

  function clearSlot(i: number): void {
    pPos.fill(0, 6 * i, 6 * i + 6);
    pCol.fill(0, 6 * i, 6 * i + 6);
    lPos.fill(0, 6 * i, 6 * i + 6);
    aPos.fill(0, 12 * i, 12 * i + 12);
  }

  // --- Floor histogram: fraction of same and different outcomes per setting pair
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  barGeo.translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }), 8);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  const cSame = new THREE.Color(PALETTE.green).multiplyScalar(0.8);
  const cDiff = new THREE.Color(PALETTE.red).multiplyScalar(0.8);
  for (let k = 0; k < 4; k++) {
    bars.setColorAt(2 * k, cSame);
    bars.setColorAt(2 * k + 1, cDiff);
  }
  scene.add(bars);
  const thPos = new Float32Array(8 * 2 * 3);
  const thGeo = new THREE.BufferGeometry();
  thGeo.setAttribute('position', new THREE.BufferAttribute(thPos, 3));
  const thLines = new THREE.LineSegments(thGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  thLines.frustumCulled = false;
  scene.add(thLines);
  const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.04, 0.9), new THREE.MeshStandardMaterial({ color: 0x151c2e, roughness: 0.9 }));
  base.position.set(0, FLOOR + 0.02, HZ);
  scene.add(base);
  for (let k = 0; k < 4; k++) {
    const l = stage.label(`(${PAIR_NAME[k]})`, [GROUP_X[k], FLOOR - 0.12, HZ + 0.5], '');
    l.element.style.background = 'transparent';
  }
  stage.label('share of same / different results', [0, FLOOR - 0.42, HZ + 0.6], 'muted');

  const barW = 0.3;
  const barX = (k: number, j: number) => GROUP_X[k] + (j === 0 ? -0.19 : 0.19);
  const m4 = new THREE.Matrix4();
  const probs = new Float64Array(4);

  function drawBars(): void {
    for (let k = 0; k < 4; k++) {
      const n = tally.count(k);
      const ps = n > 0 ? tally.pSame(k) : 0;
      for (let j = 0; j < 2; j++) {
        const f = n > 0 ? (j === 0 ? ps : 1 - ps) : 0;
        m4.makeScale(barW, Math.max(1e-3, f * HBAR), barW);
        m4.setPosition(barX(k, j), FLOOR + 0.04, HZ);
        bars.setMatrixAt(2 * k + j, m4);
      }
    }
    bars.instanceMatrix.needsUpdate = true;
  }

  function drawTheoryTicks(): void {
    for (let k = 0; k < 4; k++) {
      const x = k < 2 ? set.a : set.a2;
      const y = k % 2 === 0 ? set.b : set.b2;
      jointProbs(mode, x, y, probs);
      const same = probs[0] + probs[3];
      for (let j = 0; j < 2; j++) {
        const f = j === 0 ? same : 1 - same;
        const o = 6 * (2 * k + j);
        const cx = barX(k, j);
        const yy = FLOOR + 0.04 + f * HBAR;
        thPos.set([cx - barW * 0.75, yy, HZ + barW / 2 + 0.01, cx + barW * 0.75, yy, HZ + barW / 2 + 0.01], o);
      }
    }
    thGeo.attributes.position.needsUpdate = true;
  }

  // --- Tally board inset (canvas, styled like the other corner insets)
  const board = document.createElement('canvas');
  board.width = 600;
  board.height = 420;
  Object.assign(board.style, {
    position: 'absolute', right: '10px', top: '10px', width: '256px', height: '179px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(board);
  const bx = board.getContext('2d')!;

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '205px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '10.5px/1.35 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  function paintLegend(): void {
    const g = css(PALETTE.green);
    const r = css(PALETTE.red);
    const pulses = mode === 'quantum'
      ? `<div><span style="color:${css(PALETTE.violet)}">Violet pulses</span> on a thread share one state. Neither has an answer yet.</div>`
      : `<div><span style="color:#f2ecdf">White pulses</span> carry a hidden arrow λ. Each says + if it is within 90° of its analyzer.</div>`;
    legend.innerHTML = `${pulses}
<div style="margin-top:3px">Per pair, each magnet turns to one of its two needles and lights <span style="color:${g}">+</span> or <span style="color:${r}">−</span>.</div>
<div style="margin-top:3px">Floor bars: <span style="color:${g}">same</span> vs <span style="color:${r}">different</span> results. Ticks: prediction.</div>`;
  }

  // --- Simulation state
  const rnd = mulberry32(1964);
  const tally = new Tally();
  const out = [0, 0];
  let seeded = true;
  let simTime = 0;
  let acc = 0;
  let srcPulse = 0;
  let dirty = true;
  let uiTimer = 0;
  let Sq = 0; // quantum prediction at current angles
  let Sl = 0; // local-model prediction at current angles

  function updateTheory(): void {
    Sq = chsh(quantumE, set);
    Sl = chsh(lhvE, set);
    drawTheoryTicks();
  }

  function resetTally(fromUser: boolean): void {
    tally.reset();
    if (fromUser) seeded = false;
    dirty = true;
    drawBars();
  }

  /** Measure one pair on arrival. Settings are chosen now, after emission. */
  function measure(lambda: number): void {
    const ap = rnd() < 0.5;
    const bp = rnd() < 0.5;
    const k = pairIndex(ap, bp);
    const x = ap ? set.a2 : set.a;
    const y = bp ? set.b2 : set.b;
    samplePair(mode, x, y, lambda, rnd, out);
    tally.add(k, out[0], out[1]);
    det[0].target = x;
    det[1].target = y;
    for (let s = 0; s < 2; s++) {
      if (out[s] > 0) det[s].fp = 1;
      else det[s].fm = 1;
    }
    dirty = true;
  }

  function emit(): void {
    const l = 2 * Math.PI * rnd();
    srcPulse = 1;
    if (freeTop === 0) {
      measure(l); // pool full: measure without drawing the flight
      return;
    }
    const i = freeStack[--freeTop];
    active[i] = 1;
    t0[i] = simTime;
    lam[i] = l;
    jy[i] = (rnd() - 0.5) * 0.14;
    jz[i] = (rnd() - 0.5) * 0.14;
  }

  function updatePulses(): void {
    const q = mode === 'quantum';
    const col = q ? qCol : lCol;
    for (let i = 0; i < MAXP; i++) {
      if (!active[i]) continue;
      const u = (simTime - t0[i]) / FLY;
      if (u >= 1) {
        measure(lam[i]);
        active[i] = 0;
        freeStack[freeTop++] = i;
        clearSlot(i);
        continue;
      }
      const x = X0 + u * (X1 - X0);
      const y = jy[i] * u;
      const z = jz[i] * u;
      const o = 6 * i;
      // Alice (left) then Bob (right). Pairs fly back to back.
      pPos[o] = -x;
      pPos[o + 1] = y;
      pPos[o + 2] = z;
      pPos[o + 3] = x;
      pPos[o + 4] = -y;
      pPos[o + 5] = -z;
      const b = Math.min(1, u * 6);
      for (let v = 0; v < 2; v++) {
        pCol[o + 3 * v] = col.r * b;
        pCol[o + 3 * v + 1] = col.g * b;
        pCol[o + 3 * v + 2] = col.b * b;
      }
      if (q) {
        for (let m = 0; m < 6; m++) lPos[o + m] = pPos[o + m];
        aPos.fill(0, 12 * i, 12 * i + 12);
      } else {
        lPos.fill(0, o, o + 6);
        const c = Math.cos(lam[i]);
        const s = Math.sin(lam[i]);
        const a = 12 * i;
        // Alice's particle points along λ, Bob's along λ + π, so both use the same rule.
        aPos[a] = -x;
        aPos[a + 1] = y - 0.07 * c;
        aPos[a + 2] = z - 0.07 * s;
        aPos[a + 3] = -x;
        aPos[a + 4] = y + 0.24 * c;
        aPos[a + 5] = z + 0.24 * s;
        aPos[a + 6] = x;
        aPos[a + 7] = -y + 0.07 * c;
        aPos[a + 8] = -z + 0.07 * s;
        aPos[a + 9] = x;
        aPos[a + 10] = -y - 0.24 * c;
        aPos[a + 11] = -z - 0.24 * s;
      }
    }
    pPosAttr.needsUpdate = true;
    pColAttr.needsUpdate = true;
    lPosAttr.needsUpdate = true;
    aPosAttr.needsUpdate = true;
  }

  function drawBoard(): void {
    const W = board.width;
    const g = bx;
    g.clearRect(0, 0, W, board.height);
    g.font = '22px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText('tally', 16, 32);
    g.fillStyle = '#dfe6f3';
    g.fillText(`N = ${tally.n} pairs`, 90, 32);
    g.fillStyle = mode === 'quantum' ? css(PALETTE.violet) : '#f2ecdf';
    g.textAlign = 'right';
    g.fillText(mode === 'quantum' ? 'quantum' : 'local HV', W - 16, 32);
    g.textAlign = 'left';

    // Correlation rows, axis -1..1
    const ax0 = 170;
    const ax1 = W - 24;
    const ex = (e: number) => ax0 + ((e + 1) / 2) * (ax1 - ax0);
    const rowY = (k: number) => 76 + k * 46;
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    for (const e of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(ex(e), 52);
      g.lineTo(ex(e), rowY(3) + 16);
      g.stroke();
    }
    g.font = '18px JetBrains Mono, monospace';
    g.fillStyle = '#56627c';
    g.textAlign = 'center';
    g.fillText('−1', ex(-1), rowY(3) + 36);
    g.fillText('0', ex(0), rowY(3) + 36);
    g.fillText('+1', ex(1), rowY(3) + 36);
    g.textAlign = 'left';
    for (let k = 0; k < 4; k++) {
      const y = rowY(k);
      const x = k < 2 ? set.a : set.a2;
      const yb = k % 2 === 0 ? set.b : set.b2;
      g.font = '21px JetBrains Mono, monospace';
      g.fillStyle = '#b8c3d9';
      g.fillText(`${CHSH_SIGN[k] > 0 ? '+' : '−'}E(${PAIR_NAME[k]})`, 12, y + 7);
      g.strokeStyle = '#1c2436';
      g.beginPath();
      g.moveTo(ax0, y);
      g.lineTo(ax1, y);
      g.stroke();
      // Predictions: quantum (violet) and local model (grey)
      const tq = ex(quantumE(x, yb));
      const tl = ex(lhvE(x, yb));
      g.lineWidth = 4;
      g.strokeStyle = '#6b7690';
      g.beginPath();
      g.moveTo(tl, y - 13);
      g.lineTo(tl, y + 13);
      g.stroke();
      g.strokeStyle = css(PALETTE.violet);
      g.beginPath();
      g.moveTo(tq, y - 13);
      g.lineTo(tq, y + 13);
      g.stroke();
      // Measured with error bar
      if (tally.count(k) > 0) {
        const e = tally.E(k);
        const s = Math.min(1, tally.sigmaE(k));
        g.strokeStyle = '#dfe6f3';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(ex(Math.max(-1, e - s)), y);
        g.lineTo(ex(Math.min(1, e + s)), y);
        g.stroke();
        g.fillStyle = css(PALETTE.amber);
        g.beginPath();
        g.arc(ex(e), y, 7, 0, 2 * Math.PI);
        g.fill();
      }
    }

    // S row, axis 0..3
    const sy = 336;
    const sx = (v: number) => ax0 + (v / 3) * (ax1 - ax0);
    g.fillStyle = 'rgba(255,107,107,0.13)';
    g.fillRect(sx(2), sy - 22, sx(3) - sx(2), 44);
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ax0, sy);
    g.lineTo(ax1, sy);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = '#ff9a9a';
    g.beginPath();
    g.moveTo(sx(2), sy - 22);
    g.lineTo(sx(2), sy + 22);
    g.stroke();
    g.strokeStyle = css(PALETTE.violet);
    g.beginPath();
    g.moveTo(sx(2 * Math.SQRT2), sy - 22);
    g.lineTo(sx(2 * Math.SQRT2), sy + 22);
    g.stroke();
    g.font = '18px JetBrains Mono, monospace';
    g.textAlign = 'center';
    g.fillStyle = '#ff9a9a';
    g.fillText('2 local', sx(2) - 18, sy + 44);
    g.fillStyle = css(PALETTE.violet);
    g.fillText('2√2', sx(2 * Math.SQRT2), sy + 44);
    g.fillStyle = '#56627c';
    g.fillText('0', sx(0), sy + 44);
    g.fillText('1', sx(1), sy + 44);
    g.textAlign = 'left';
    const S = Math.abs(tally.S());
    const sS = tally.sigmaS();
    g.font = '600 24px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText('|S|', 12, sy - 4);
    g.font = '19px JetBrains Mono, monospace';
    g.fillStyle = S > 2 + 2 * sS ? '#ff9a9a' : '#b8c3d9';
    g.fillText(tally.n > 0 ? `${S.toFixed(2)}±${sS.toFixed(2)}` : '…', 12, sy + 22);
    if (tally.n > 0) {
      g.strokeStyle = '#dfe6f3';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx(Math.max(0, S - sS)), sy);
      g.lineTo(sx(Math.min(3, S + sS)), sy);
      g.stroke();
      g.fillStyle = css(PALETTE.amber);
      g.beginPath();
      g.arc(sx(Math.min(3, S)), sy, 9, 0, 2 * Math.PI);
      g.fill();
    }
    g.font = '17px JetBrains Mono, monospace';
    g.fillStyle = '#56627c';
    g.fillText('dot = measured ± 1σ   violet = quantum   grey = local', 12, board.height - 8);
  }

  // --- Frame loop
  stage.onFrame((dt) => {
    if (playing) {
      simTime += dt;
      acc += rate * dt;
      let n = 0;
      while (acc >= 1 && n < MAX_EMIT_PER_FRAME) {
        emit();
        acc -= 1;
        n++;
      }
      if (acc > 5) acc = 0;
      updatePulses();
    }
    // Analyzer motion and lamp flashes
    const kf = 1 - Math.exp(-dt / 0.03);
    const kd = Math.exp(-dt / 0.16);
    for (let s = 0; s < 2; s++) {
      const d = det[s];
      d.cur += wrapPi(d.target - d.cur) * kf;
      d.magnet.rotation.x = d.cur;
      d.fp *= kd;
      d.fm *= kd;
      d.lampP.opacity = d.fp;
      d.lampM.opacity = d.fm;
      d.bulbP.color.setRGB(0.11 + 0.26 * d.fp, 0.29 + 0.6 * d.fp, 0.2 + 0.4 * d.fp);
      d.bulbM.color.setRGB(0.29 + 0.7 * d.fm, 0.11 + 0.3 * d.fm, 0.14 + 0.3 * d.fm);
    }
    srcPulse *= Math.exp(-dt / 0.1);
    srcGlow.scale.setScalar(1.0 + 0.5 * srcPulse);
    uiTimer += dt;
    if (uiTimer > 0.12) {
      uiTimer = 0;
      if (dirty) {
        drawBars();
        drawBoard();
        dirty = false;
      }
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Experiment');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset tally', key: 'reset', onClick: () => resetTally(true) },
  ]);
  ui.select<Model>({
    key: 'mode', label: 'Mode', value: mode,
    options: [{ value: 'quantum', label: 'Quantum' }, { value: 'lhv', label: 'Local hidden variables' }],
    onChange: (v) => { mode = v; applyMode(); updateTheory(); resetTally(true); },
  });
  ui.slider({ key: 'rate', label: 'Emission rate', min: 1, max: 400, step: 1, value: rate, format: (v) => `${v} pairs/s`, onInput: (v) => (rate = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: view,
    options: [{ value: 'lab', label: 'Lab' }, { value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }],
    onChange: (v) => { view = v; flyView(); },
  });

  const angleChanged = () => { paintSettings(); updateTheory(); resetTally(true); };
  const fmtDeg = (v: number) => `${v}°`;
  ui.section('Alice (left analyzer)');
  const aCtl = ui.slider({ key: 'a', label: 'Setting a', min: 0, max: 360, step: 1, value: 0, format: fmtDeg, onInput: (v) => { set.a = v * DEG; angleChanged(); } });
  const a2Ctl = ui.slider({ key: 'a2', label: 'Setting a′', min: 0, max: 360, step: 1, value: 90, format: fmtDeg, onInput: (v) => { set.a2 = v * DEG; angleChanged(); } });
  ui.section('Bob (right analyzer)');
  const bCtl = ui.slider({ key: 'b', label: 'Setting b', min: 0, max: 360, step: 1, value: 45, format: fmtDeg, onInput: (v) => { set.b = v * DEG; angleChanged(); } });
  const b2Ctl = ui.slider({ key: 'b2', label: 'Setting b′', min: 0, max: 360, step: 1, value: 135, format: fmtDeg, onInput: (v) => { set.b2 = v * DEG; angleChanged(); } });
  ui.buttons([
    {
      label: 'Optimal CHSH angles', key: 'preset',
      onClick: () => {
        aCtl.set(0, false);
        a2Ctl.set(90, false);
        bCtl.set(45, false);
        b2Ctl.set(135, false);
        set.a = 0;
        set.a2 = 90 * DEG;
        set.b = 45 * DEG;
        set.b2 = 135 * DEG;
        angleChanged();
      },
    },
  ]);
  ui.note('Each pair is measured with one of Alice\'s two settings and one of Bob\'s, picked by fair coins at arrival. Changing an angle starts a fresh tally.');

  ui.section('Live readouts');
  const rN = ui.readout('pairs', 'pairs N');
  const rS = ui.readout('S', 'measured S ± σ');
  const rSth = ui.readout('Sth', 'predicted S');
  const rDev = ui.readout('dev', 'vs theory');
  const rE = ui.readout('Eab', 'E(a,b) meas / theory');
  const rM = ui.readout('marg', 'P(A=+) · P(B=+)');
  const rNs = ui.readout('nosig', 'P(A=+) given b | b′');
  ui.legend([
    { color: css(PALETTE.amber), label: 'a' },
    { color: css(PALETTE.rose), label: 'a′' },
    { color: css(PALETTE.cyan), label: 'b' },
    { color: css(PALETTE.violet), label: 'b′' },
    { color: css(PALETTE.green), label: '+ / same' },
    { color: css(PALETTE.red), label: '− / different' },
  ]);

  function updateReadouts(): void {
    const n = tally.n;
    const S = tally.S();
    const sS = tally.sigmaS();
    const pred = mode === 'quantum' ? Sq : Sl;
    rN(n);
    rS(n > 0 ? `${S.toFixed(3)} ± ${sS.toFixed(3)}` : '…');
    rSth(pred.toFixed(3));
    rDev(n > 40 && sS > 0 ? `${((S - pred) / sS).toFixed(1)} σ` : '…');
    rE(tally.count(0) > 0 ? `${tally.E(0).toFixed(2)} / ${correlation(mode, set.a, set.b).toFixed(2)}` : '…');
    rM(n > 0 ? `${tally.pAliceUp().toFixed(2)} · ${tally.pBobUp().toFixed(2)}` : '…');
    rNs(n > 0 ? `${tally.pAliceUpGivenBob(false).toFixed(2)} | ${tally.pAliceUpGivenBob(true).toFixed(2)}` : '…');
  }

  function applyMode(): void {
    threads.visible = mode === 'quantum';
    arrows.visible = mode === 'lhv';
    srcGlowMat.color.set(mode === 'quantum' ? PALETTE.violet : 0xf2ecdf);
    paintLegend();
  }

  function flyView(): void {
    if (view === 'lab') stage.flyTo(CAM, TGT);
    if (view === 'alice') stage.flyTo([-1.3, 1.1, 1.9], [-DX, 0, 0]);
    if (view === 'bob') stage.flyTo([1.3, 1.1, 1.9], [DX, 0, 0]);
  }

  // --- Initial build, with a few hundred pairs already tallied
  paintSettings();
  applyMode();
  updateTheory();
  runExperiment(mode, set, SEED, rnd, tally);
  det[0].cur = det[0].target = set.a;
  det[1].cur = det[1].target = set.b;
  drawBars();
  drawBoard();
  updateReadouts();

  return {
    state: () => {
      let eqN = 0;
      let eqE = 0;
      for (let k = 0; k < 4; k++) {
        const x = k < 2 ? set.a : set.a2;
        const y = k % 2 === 0 ? set.b : set.b2;
        if (Math.abs(wrapPi(x - y)) < 0.5 * DEG && tally.count(k) > eqN) {
          eqN = tally.count(k);
          eqE = tally.E(k);
        }
      }
      const S = tally.S();
      return {
        mode,
        pairs: tally.n,
        seeded,
        S,
        absS: Math.abs(S),
        sigmaS: tally.sigmaS(),
        Squantum: Math.abs(Sq),
        Slocal: Math.abs(Sl),
        a: set.a / DEG,
        a2: set.a2 / DEG,
        b: set.b / DEG,
        b2: set.b2 / DEG,
        eqN,
        eqE,
        bobSep: Math.abs(wrapPi(set.b - set.b2)) / DEG,
        nB: tally.countBob(false),
        nB2: tally.countBob(true),
        pAgivenB: tally.pAliceUpGivenBob(false),
        pAgivenB2: tally.pAliceUpGivenBob(true),
        margA: tally.pAliceUp(),
        margB: tally.pBobUp(),
        rate,
        playing,
      };
    },
    dispose: () => {
      board.remove();
      legend.remove();
      glow.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'entanglement',
  number: 16,
  title: 'Entanglement & Bell',
  domain: 'quantum',
  level: 3,
  status: 'live',
  tagline: 'Correlations no local hidden story can explain.',
  content,
  mount,
};

export default topic;
