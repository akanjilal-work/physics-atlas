import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  abIntensity, createLattice, fluxPattern, fluxes, fringeShift, gaugeTransform, hIdx, linkEnergy,
  maxPlaquetteDrift, pIdx, plaquetteSnapshot, setFluxPattern, sIdx, vIdx, wrap, TAU, type ABParams,
} from './physics.ts';

type View = 'both' | 'lattice' | 'ab';
type Pattern = 'uniform' | 'tube';

const N = 8; // sites per side
const M = N - 1; // plaquettes per side
const NH = (N - 1) * N;
const NV = N * (N - 1);
const LAT_X = -4.6; // lattice board centre
const AB_X = 5.0; // Aharonov–Bohm bench centre
const HALF = (N - 1) / 2;
const AB: ABParams = { spacing: 0.9, envelope: 2.7 };
const SCREEN_X = 2.6;
const SCREEN_HALF = 2.2;
const SCREEN_RES = 160;
const SOL_X = -0.8;
const SOL_R = 0.2;
const PATH_PTS = 48;
const HIST = 300;

const siteX = (i: number) => LAT_X + (i - HALF);
const siteZ = (j: number) => HALF - j;

function makeOverlay(viewport: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'stage-overlay';
  Object.assign(d.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(d);
  return d;
}

function makeInset(viewport: HTMLElement, pos: Partial<CSSStyleDeclaration>): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = 460;
  c.height = 200;
  Object.assign(c.style, {
    position: 'absolute', right: '10px', width: '230px', height: '100px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    ...pos,
  } as CSSStyleDeclaration);
  viewport.appendChild(c);
  return { c, ctx: c.getContext('2d')! };
}

/** Flat arrow lying in the XZ plane, pointing along +x, tail at the origin. */
function arrowGeometry(len: number, width: number, head: number): THREE.BufferGeometry {
  const w = width / 2;
  const s = new THREE.Shape();
  s.moveTo(0, -w);
  s.lineTo(len - head, -w);
  s.lineTo(len - head, -w * 2.6);
  s.lineTo(len, 0);
  s.lineTo(len - head, w * 2.6);
  s.lineTo(len - head, w);
  s.lineTo(0, w);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.2, 17.2, 8.6], target: [0.2, 0, 0.6], fov: 42 });
  const { scene, camera, renderer, controls } = stage;

  // ---------------------------------------------------------------- state
  const L = createLattice(N);
  let pattern: Pattern = 'uniform';
  let fluxPer = 0.9; // rad per plaquette (uniform) or total (tube)
  let beta = 0; // global rotation
  let linksOn = true;
  let brushOn = true;
  let wave = true;
  let abFlux = 0; // Phi / Phi0
  let view: View = 'both';
  let localTransforms = 0;
  let brokenJump = 0;
  let drift = 0;
  let eCov = 0;
  let eNaive = 0;
  let eCov0 = 0;
  let eNaive0 = 0;
  const ref = new Float64Array(M * M * 2);
  const F = new Float64Array(M * M);
  const alpha = new Float64Array(N * N);
  const waveNow = new Float64Array(N * N);
  const wavePrev = new Float64Array(N * N);
  const dispTheta = new Float64Array(N * N);
  const dispAh = new Float64Array(NH);
  const dispAv = new Float64Array(NV);

  // ---------------------------------------------------------------- lattice scene
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(N + 0.2, N + 0.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0b1120 }),
  );
  board.position.set(LAT_X, -0.03, 0);
  scene.add(board);
  const boardEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(N + 0.2, N + 0.2).rotateX(-Math.PI / 2)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }),
  );
  boardEdge.position.copy(board.position);
  scene.add(boardEdge);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pv = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  const cAmber = new THREE.Color(PALETTE.amber);
  const cCyan = new THREE.Color(PALETTE.cyan);
  const cBase = new THREE.Color(0x141b2b);
  const cIdle = new THREE.Color(0x2a3246);
  const cRed = new THREE.Color(PALETTE.red);

  // Plaquette tiles
  const tiles = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.44, 0.44).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 }),
    M * M,
  );
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      m4.makeTranslation(siteX(i) + 0.5, -0.01, siteZ(j) - 0.5);
      tiles.setMatrixAt(pIdx(N, i, j), m4);
      tiles.setColorAt(pIdx(N, i, j), cBase);
    }
  }
  scene.add(tiles);

  // Dials (static rings) and needles (phase arrows)
  const rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.25, 0.29, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x46526e }),
    N * N,
  );
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    m4.makeTranslation(siteX(i), 0, siteZ(j));
    rings.setMatrixAt(sIdx(N, i, j), m4);
  }
  scene.add(rings);
  const needles = new THREE.InstancedMesh(arrowGeometry(0.27, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xf2f5fb }), N * N);
  needles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(needles);
  const hubs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f5fb }), N * N);
  for (let k = 0; k < N * N; k++) {
    rings.getMatrixAt(k, m4);
    m4.elements[13] = 0.012;
    hubs.setMatrixAt(k, m4);
  }
  scene.add(hubs);

  // Link arrows: horizontal then vertical, all in one instanced mesh
  const LINK_LEN = 0.36;
  const links = new THREE.InstancedMesh(arrowGeometry(LINK_LEN, 0.07, 0.12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 }), NH + NV);
  for (let j = 0; j < N; j++) for (let i = 0; i < N - 1; i++) {
    q.identity();
    m4.compose(pv.set(siteX(i) + 0.5 - LINK_LEN / 2, 0.005, siteZ(j)), q, one);
    links.setMatrixAt(hIdx(N, i, j), m4);
  }
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N; i++) {
    q.setFromAxisAngle(yAxis, Math.PI / 2); // +x -> -z, i.e. towards j+1
    m4.compose(pv.set(siteX(i), 0.005, siteZ(j) - 0.5 + LINK_LEN / 2), q, one);
    links.setMatrixAt(NH + vIdx(N, i, j), m4);
  }
  for (let k = 0; k < NH + NV; k++) links.setColorAt(k, cIdle);
  scene.add(links);

  stage.label('sites: phase dials ψ = exp(iθ)', [LAT_X, 0, HALF + 0.85], 'muted');
  stage.label('links: U = exp(iA), colour = angle A', [LAT_X, 0, HALF + 1.25], 'muted');
  stage.label('tiles: plaquette flux F', [LAT_X, 0, HALF + 1.65], 'muted');

  // ---------------------------------------------------------------- Aharonov–Bohm bench
  const ab = new THREE.Group();
  ab.position.set(AB_X, 0, 0);
  scene.add(ab);
  const bench = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 5.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1120 }));
  bench.position.set(-0.1, -0.03, 0);
  ab.add(bench);

  const source = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  source.position.set(-3.1, 0.15, 0);
  ab.add(source);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.7, metalness: 0.2 });
  const SLIT = 0.5;
  const GAP = 0.14;
  const wallSeg = (z0: number, z1: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, z1 - z0), wallMat);
    m.position.set(-1.8, 0.22, (z0 + z1) / 2);
    ab.add(m);
  };
  wallSeg(-2.3, -SLIT - GAP / 2);
  wallSeg(-SLIT + GAP / 2, SLIT - GAP / 2);
  wallSeg(SLIT + GAP / 2, 2.3);

  // Solenoid: violet core with B arrows inside, glass shell
  const solenoid = new THREE.Group();
  solenoid.position.set(SOL_X, 0, 0);
  ab.add(solenoid);
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(SOL_R, SOL_R, 1.0, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  shell.position.y = 0.5;
  solenoid.add(shell);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(SOL_R, 0.015, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8b6ff }));
  for (let k = 0; k < 7; k++) {
    const c = coil.clone();
    c.position.y = 0.1 + k * 0.13;
    solenoid.add(c);
  }
  const bArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.05, 0), 1.2, PALETTE.violet, 0.2, 0.12);
  solenoid.add(bArrow);

  // Vector potential ring arrows (circulating, |A| ~ 1/r)
  const A_RINGS = [0.45, 0.75, 1.1];
  const A_PER = 10;
  const aArrows = new THREE.InstancedMesh(arrowGeometry(1, 0.06, 0.11), new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.85 }), A_RINGS.length * A_PER);
  aArrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  aArrows.position.set(SOL_X, 0.01, 0);
  ab.add(aArrows);

  // Paths (top = amber, bottom = rose)
  const mkPath = (color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PATH_PTS * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    l.frustumCulled = false;
    ab.add(l);
    return l;
  };
  const pathA = mkPath(PALETTE.amber);
  const pathB = mkPath(PALETTE.rose);

  // Screen: vertex-coloured strip along z, plus an intensity trace on the floor
  const scrGeo = new THREE.BufferGeometry();
  const scrPos = new Float32Array((SCREEN_RES + 1) * 2 * 3);
  const scrCol = new Float32Array((SCREEN_RES + 1) * 2 * 3);
  const scrIdx: number[] = [];
  for (let k = 0; k <= SCREEN_RES; k++) {
    const z = -SCREEN_HALF + (2 * SCREEN_HALF * k) / SCREEN_RES;
    scrPos.set([SCREEN_X, 0, z, SCREEN_X, 0.9, z], k * 6);
    if (k < SCREEN_RES) {
      const a = k * 2;
      scrIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  scrGeo.setAttribute('position', new THREE.BufferAttribute(scrPos, 3));
  scrGeo.setAttribute('color', new THREE.BufferAttribute(scrCol, 3));
  scrGeo.setIndex(scrIdx);
  ab.add(new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const traceGeo = new THREE.BufferGeometry();
  traceGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SCREEN_RES + 1) * 3), 3));
  const trace = new THREE.Line(traceGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan }));
  trace.frustumCulled = false;
  ab.add(trace);
  const refGeo = new THREE.BufferGeometry();
  refGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SCREEN_RES + 1) * 3), 3));
  const refLine = new THREE.Line(refGeo, new THREE.LineDashedMaterial({ color: 0x56627c, dashSize: 0.06, gapSize: 0.05 }));
  refLine.frustumCulled = false;
  ab.add(refLine);
  const peak = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ab.add(peak);

  stage.label('electron source', [AB_X - 3.1, 0, 0.55], 'muted');
  stage.label('B inside only', [AB_X + SOL_X, 1.35, 0]);
  stage.label('A ≠ 0 but B = 0 on the paths', [AB_X + SOL_X, 0, 1.75], 'muted');
  stage.label('screen', [AB_X + SCREEN_X, 1.1, -SCREEN_HALF + 0.2], 'muted');

  // ---------------------------------------------------------------- overlays
  const overlay = makeOverlay(viewport);
  const energyInset = makeInset(viewport, { top: '10px' });
  const abInset = makeInset(viewport, { bottom: '10px' });
  const histCov = new Float32Array(HIST);
  const histNaive = new Float32Array(HIST);
  let histHead = 0;
  let histCount = 0;

  // ---------------------------------------------------------------- lattice logic
  function rebuildFlux(): void {
    setFluxPattern(L, fluxPattern(N, pattern, fluxPer));
    plaquetteSnapshot(L, ref);
    fluxes(L, F);
    paintTiles();
    dispAh.set(L.ah);
    dispAv.set(L.av);
  }

  function paintTiles(): void {
    for (let k = 0; k < M * M; k++) {
      const t = F[k] / Math.PI;
      const a = Math.pow(Math.min(1, Math.abs(t)), 0.6);
      col.copy(cBase).lerp(t >= 0 ? cAmber : cCyan, a * 0.8);
      tiles.setColorAt(k, col);
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  }

  function measure(): void {
    eCov = linkEnergy(L, true, beta);
    eNaive = linkEnergy(L, false, beta);
    drift = maxPlaquetteDrift(L, ref);
  }

  function applyLocal(a: Float64Array, user: boolean): void {
    const before = linkEnergy(L, false);
    gaugeTransform(L, a);
    if (user && !linksOn) brokenJump = linkEnergy(L, false) - before;
  }

  function randomTransform(): void {
    for (let k = 0; k < N * N; k++) alpha[k] = (Math.random() * 2 - 1) * Math.PI;
    stopWave();
    applyLocal(alpha, true);
    localTransforms++;
  }

  function resetLattice(): void {
    L.theta.fill(0);
    dispTheta.fill(0);
    rebuildFlux();
    measure();
    eCov0 = eCov;
    eNaive0 = eNaive;
    brokenJump = 0;
  }

  function waveField(t: number, out: Float64Array): void {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      out[sIdx(N, i, j)] = 1.1 * Math.sin(0.85 * i + 0.45 * j - 1.3 * t) + 0.7 * Math.sin(0.7 * j - 0.4 * i - 0.8 * t + 1);
    }
  }

  // ---------------------------------------------------------------- drawing
  function drawLattice(dt: number): void {
    const k = 1 - Math.exp(-dt * 9);
    for (let s = 0; s < N * N; s++) {
      dispTheta[s] += wrap(L.theta[s] - dispTheta[s]) * k;
      const i = s % N;
      const j = (s - i) / N;
      q.setFromAxisAngle(yAxis, dispTheta[s] + beta);
      m4.compose(pv.set(siteX(i), 0.01, siteZ(j)), q, one);
      needles.setMatrixAt(s, m4);
    }
    needles.instanceMatrix.needsUpdate = true;

    for (let e = 0; e < NH; e++) dispAh[e] += wrap(L.ah[e] - dispAh[e]) * k;
    for (let e = 0; e < NV; e++) dispAv[e] += wrap(L.av[e] - dispAv[e]) * k;
    for (let j = 0; j < N; j++) for (let i = 0; i < N - 1; i++) {
      const e = hIdx(N, i, j);
      linkColor(dispAh[e], dispTheta[sIdx(N, i + 1, j)] - dispTheta[sIdx(N, i, j)]);
      links.setColorAt(e, col);
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N; i++) {
      const e = vIdx(N, i, j);
      linkColor(dispAv[e], dispTheta[sIdx(N, i, j + 1)] - dispTheta[sIdx(N, i, j)]);
      links.setColorAt(NH + e, col);
    }
    if (links.instanceColor) links.instanceColor.needsUpdate = true;
  }

  function linkColor(A: number, dTheta: number): void {
    if (linksOn) {
      let h = (A / TAU) % 1;
      if (h < 0) h += 1;
      col.setHSL(h, 0.8, 0.58);
    } else {
      // Links removed: show the naive bond strain (1 - cos dTheta)/2.
      const strain = (1 - Math.cos(dTheta)) / 2;
      col.copy(cIdle).lerp(cRed, Math.min(1, strain * 1.4));
    }
  }

  function drawAB(): void {
    // Screen and floor trace
    const shift = fringeShift(abFlux, AB);
    const tp = trace.geometry.attributes.position as THREE.BufferAttribute;
    const rp = refLine.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k <= SCREEN_RES; k++) {
      const z = -SCREEN_HALF + (2 * SCREEN_HALF * k) / SCREEN_RES;
      const I = abIntensity(z, abFlux, AB);
      const b = Math.pow(I, 0.8);
      col.setRGB(0.12 + 0.19 * b, 0.14 + 0.68 * b, 0.2 + 0.71 * b);
      scrCol.set([col.r, col.g, col.b, col.r, col.g, col.b], k * 6);
      tp.setXYZ(k, SCREEN_X + 0.15 + 0.9 * I, 0.02, z);
      rp.setXYZ(k, SCREEN_X + 0.15 + 0.9 * abIntensity(z, 0, AB), 0.015, z);
    }
    tp.needsUpdate = true;
    rp.needsUpdate = true;
    refLine.computeLineDistances();
    (scrGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    peak.position.set(SCREEN_X + 0.15 + 0.9 * abIntensity(shift, abFlux, AB), 0.03, shift);

    // Two paths from the source through each slit, around the solenoid, to the central bright fringe
    const setPath = (line: THREE.Line, side: number) => {
      const a = line.geometry.attributes.position as THREE.BufferAttribute;
      const half = PATH_PTS / 2;
      for (let k = 0; k < PATH_PTS; k++) {
        let x: number;
        let z: number;
        if (k < half) {
          const u = k / (half - 1);
          x = -3.1 + u * (-1.8 + 3.1);
          z = side * SLIT * u;
        } else {
          const u = (k - half) / (half - 1);
          // Quadratic Bezier: slit -> control beside the solenoid -> screen point
          const cx = SOL_X + 0.4;
          const cz = side * 0.95;
          const x0 = -1.8;
          const z0 = side * SLIT;
          x = (1 - u) * (1 - u) * x0 + 2 * u * (1 - u) * cx + u * u * SCREEN_X;
          z = (1 - u) * (1 - u) * z0 + 2 * u * (1 - u) * cz + u * u * shift;
        }
        a.setXYZ(k, x, 0.15, z);
      }
      a.needsUpdate = true;
    };
    setPath(pathA, -1);
    setPath(pathB, 1);

    // Vector potential arrows: tangent, length ~ Phi / r, direction set by the sign of Phi
    const sgn = abFlux >= 0 ? 1 : -1;
    let idx = 0;
    for (const r of A_RINGS) {
      const len = Math.min(0.5, (0.16 * Math.abs(abFlux)) / r) + 1e-4;
      for (let k = 0; k < A_PER; k++) {
        const phi = (k / A_PER) * TAU + r;
        const px = r * Math.cos(phi);
        const pz = -r * Math.sin(phi);
        // tangent (counterclockwise from above) is the direction of phi + pi/2
        const ang = phi + (sgn * Math.PI) / 2;
        q.setFromAxisAngle(yAxis, ang);
        sv.set(len, 1, 1);
        // centre the arrow on the ring point
        m4.compose(pv.set(px - (Math.cos(ang) * len) / 2, 0, pz + (Math.sin(ang) * len) / 2), q, sv);
        aArrows.setMatrixAt(idx++, m4);
      }
    }
    aArrows.instanceMatrix.needsUpdate = true;
    bArrow.setLength(0.35 + 0.85 * Math.min(1, Math.abs(abFlux) / 1.5), 0.2, 0.12);
    bArrow.setDirection(pv.set(0, sgn, 0));
    bArrow.position.y = sgn > 0 ? 0.05 : 1.1;
    drawABInset();
  }

  function drawEnergyInset(): void {
    const { c, ctx } = energyInset;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '20px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText('energy vs time', 14, 26);
    ctx.fillStyle = css(PALETTE.green);
    ctx.fillText('Σ|Dψ|²', 210, 26);
    ctx.fillStyle = css(PALETTE.red);
    ctx.fillText('naive', 330, 26);
    let top = 1;
    for (let k = 0; k < histCount; k++) top = Math.max(top, histCov[k], histNaive[k]);
    top *= 1.15;
    const x0 = 14;
    const x1 = W - 14;
    const y0 = H - 14;
    const y1 = 42;
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
    const plot = (arr: Float32Array, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k < histCount; k++) {
        const v = arr[(histHead - histCount + k + HIST) % HIST];
        const x = x0 + ((x1 - x0) * k) / (HIST - 1);
        const y = y0 - ((y0 - y1) * v) / top;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    plot(histNaive, css(PALETTE.red));
    plot(histCov, css(PALETTE.green));
  }

  function drawABInset(): void {
    const { c, ctx } = abInset;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '20px JetBrains Mono, monospace';
    ctx.fillStyle = '#8391ab';
    ctx.fillText(`screen intensity, Φ/Φ₀ = ${abFlux.toFixed(2)}`, 14, 26);
    const x0 = 14;
    const x1 = W - 14;
    const y0 = H - 12;
    const y1 = 40;
    const curve = (f: number | null, color: string, dash: number[], lw: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (let k = 0; k <= 200; k++) {
        const z = -SCREEN_HALF + (2 * SCREEN_HALF * k) / 200;
        const I = f === null ? abIntensity(z, 0, AB) + abIntensity(z, 0.5, AB) : abIntensity(z, f, AB);
        const x = x0 + ((x1 - x0) * k) / 200;
        const y = y0 - (y0 - y1) * I;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    curve(null, '#39445c', [], 2);
    curve(0, '#6b7894', [8, 6], 2);
    curve(abFlux, css(PALETTE.cyan), [], 3);
  }

  function updateOverlay(): void {
    const wheel = 'conic-gradient(from 90deg, hsl(0,80%,58%), hsl(60,80%,58%), hsl(120,80%,58%), hsl(180,80%,58%), hsl(240,80%,58%), hsl(300,80%,58%), hsl(360,80%,58%))';
    overlay.innerHTML = `
<div style="color:#dfe6f3;font-weight:600;margin-bottom:4px">U(1) lattice gauge field</div>
<div><span style="color:#f2f5fb">➤</span> site phase θ (white arrow)</div>
<div>${linksOn
      ? `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${wheel};vertical-align:-1px"></i> link angle A (hue wheel)`
      : `<span style="color:${css(PALETTE.red)}">▬</span> links removed: bond strain`}</div>
<div><span style="color:${css(PALETTE.amber)}">■</span>/<span style="color:${css(PALETTE.cyan)}">■</span> plaquette flux F &gt; 0 / &lt; 0</div>
<div style="margin-top:4px;color:#8391ab">${brushOn ? 'Drag on the board to paint gauge turns.' : 'Brush off: drag to orbit.'}</div>`;
  }

  // ---------------------------------------------------------------- brush
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let painting = false;
  let strokeSign = 1;
  let strokeNaive0 = 0;
  const boardHit = (e: PointerEvent): boolean => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(floor, hit)) return false;
    return Math.abs(hit.x - LAT_X) < HALF + 0.6 && Math.abs(hit.z) < HALF + 0.6;
  };
  const dab = () => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = siteX(i) - hit.x;
      const dz = siteZ(j) - hit.z;
      alpha[sIdx(N, i, j)] = strokeSign * 0.45 * Math.exp(-(dx * dx + dz * dz) / (2 * 0.9 * 0.9));
    }
    gaugeTransform(L, alpha);
    if (!linksOn) brokenJump = linkEnergy(L, false) - strokeNaive0;
  };
  const onDown = (e: PointerEvent) => {
    if (!brushOn || e.button !== 0 || !boardHit(e)) return;
    painting = true;
    controls.enabled = false;
    strokeSign = Math.random() < 0.5 ? -1 : 1;
    strokeNaive0 = linkEnergy(L, false);
    stopWave();
    localTransforms++;
    dab();
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!painting) return;
    if (boardHit(e)) dab();
  };
  const onUp = () => {
    if (!painting) return;
    painting = false;
    controls.enabled = true;
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Camera', value: view,
    options: [{ value: 'both', label: 'Both' }, { value: 'lattice', label: 'Lattice' }, { value: 'ab', label: 'Aharonov–Bohm' }],
    onChange: (v) => {
      view = v;
      if (v === 'both') stage.flyTo([0.2, 17.2, 8.6], [0.2, 0, 0.6]);
      if (v === 'lattice') stage.flyTo([LAT_X, 10.5, 5.2], [LAT_X, 0, 0.2]);
      if (v === 'ab') stage.flyTo([AB_X, 7.5, 5.2], [AB_X, 0, 0.1]);
    },
  });

  ui.section('Gauge transformations');
  ui.slider({
    key: 'global', label: 'Global rotation β', min: -180, max: 180, step: 1, value: 0, unit: '°',
    onInput: (v) => { beta = (v * Math.PI) / 180; },
  });
  ui.buttons([
    { label: 'Random local transform', primary: true, key: 'randomize', onClick: randomTransform },
    { label: 'Reset lattice', onClick: () => { resetLattice(); } },
  ]);
  ui.toggle({ key: 'brush', label: 'Paint brush on the board', value: brushOn, onChange: (v) => { brushOn = v; updateOverlay(); } });
  const waveCtl = ui.toggle({ key: 'wave', label: 'Rolling gauge wave (demo)', value: wave, onChange: (v) => { wave = v; if (v) { waveT = 0; waveField(0, wavePrev); } } });
  ui.toggle({
    key: 'links', label: 'Use link variables U = exp(iA)', value: linksOn,
    onChange: (v) => { linksOn = v; brokenJump = 0; updateOverlay(); tiles.material.opacity = v ? 1 : 0.25; },
  });
  function stopWave(): void {
    if (wave) {
      wave = false;
      waveCtl.set(false, false);
    }
  }

  ui.section('Magnetic field on the lattice');
  ui.select<Pattern>({
    key: 'pattern', label: 'Flux pattern', value: pattern,
    options: [{ value: 'uniform', label: 'Uniform B' }, { value: 'tube', label: 'Flux tube' }],
    onChange: (v) => { pattern = v; rebuildFlux(); },
  });
  ui.slider({
    key: 'flux', label: 'Flux per plaquette F', min: -3, max: 3, step: 0.05, value: fluxPer, unit: 'rad',
    onInput: (v) => { fluxPer = v; rebuildFlux(); },
  });

  ui.section('Aharonov–Bohm');
  ui.slider({
    key: 'abFlux', label: 'Solenoid flux Φ/Φ₀ (Φ₀ = h/e)', min: -2, max: 2, step: 0.01, value: abFlux,
    format: (v) => v.toFixed(2),
    onInput: (v) => { abFlux = v; drawAB(); },
  });

  ui.section('Live readouts');
  const rCov = ui.readout('eCov', 'E = Σ|Dψ|²');
  const rNaive = ui.readout('eNaive', 'naive Σ|Δψ|²');
  const rDrift = ui.readout('drift', 'max |ΔU_p|');
  const rGlob = ui.readout('global', 'ΔE from β');
  const rTot = ui.readout('flux', 'total flux ΣF', 'rad');
  const rShift = ui.readout('abFlux', 'fringe shift', 'periods');
  ui.note('The drift compares every plaquette with its value when the flux was set. Rounding error alone is about 10⁻¹⁵. B on both electron paths is exactly zero.');

  const fmtE = (v: number) => v.toFixed(3);
  function updateReadouts(): void {
    rCov(fmtE(eCov));
    rNaive(fmtE(eNaive));
    rDrift(drift < 1e-17 ? '0' : drift.toExponential(1));
    rGlob(Math.abs(linkEnergy(L, true, beta) - linkEnergy(L, true, 0)).toExponential(0));
    let tot = 0;
    for (let k = 0; k < M * M; k++) tot += F[k];
    rTot(tot.toFixed(2));
    rShift((-fringeShift(abFlux, AB) / AB.spacing).toFixed(2));
  }

  // ---------------------------------------------------------------- loop
  let waveT = 0;
  let histAcc = 0;
  waveField(0, wavePrev);
  stage.onFrame((dt) => {
    if (wave) {
      waveT += dt;
      waveField(waveT, waveNow);
      for (let s = 0; s < N * N; s++) alpha[s] = waveNow[s] - wavePrev[s];
      wavePrev.set(waveNow);
      gaugeTransform(L, alpha);
    }
    measure();
    drawLattice(dt);
    histAcc += dt;
    if (histAcc > 0.08) {
      histAcc = 0;
      histCov[histHead] = eCov;
      histNaive[histHead] = eNaive;
      histHead = (histHead + 1) % HIST;
      histCount = Math.min(HIST, histCount + 1);
      drawEnergyInset();
    }
    updateReadouts();
  });

  resetLattice();
  dispAh.set(L.ah);
  dispAv.set(L.av);
  drawLattice(1);
  drawAB();
  updateOverlay();

  return {
    state: () => ({
      linksOn, localTransforms, drift, brokenJump, abFlux, global: beta, eCov, eNaive, view, flux: fluxPer, pattern,
      eCovChange: eCov - eCov0, eNaiveChange: eNaive - eNaive0, wave,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      overlay.remove();
      energyInset.c.remove();
      abInset.c.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'gauge-symmetry',
  number: 91,
  title: 'Gauge Symmetry',
  domain: 'foundations',
  level: 3,
  status: 'live',
  tagline: 'Demand a local freedom, and a force appears.',
  content,
  mount,
};

export default topic;
