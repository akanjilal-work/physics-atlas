import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  QWZRibbon, SymEigen, chernFHS, eigenResidual, qwzGap, randomUnit, sshChainMatrix, sshChainSpectrum, sshD,
  sshWindingRaw, type ChainSpectrum,
} from './physics.ts';

type View = 'chain' | 'ribbon' | 'morph';

const MAXN = 40; // max cells
const MAXS = 2 * MAXN; // max sites
const CHAIN_L = 7.6; // scene length of the chain
const BAR_H = 6; // bar height for density 1
const W_RIB = 20; // ribbon rows
const NK_RIB = 81; // ribbon k points
const KX = 4; // half width of kx axis in scene units
const ES = 0.55; // scene units per energy unit
const ZE = 2.2; // half depth of the "across the strip" axis
const FLOOR_Y = -3.2;
const MOVERS = 12;
const TR_r = 1.05; // morph tube radius

const CAM: Record<View, { pos: [number, number, number]; tgt: [number, number, number] }> = {
  chain: { pos: [1.6, 3.6, 12.4], tgt: [1.25, 1.1, 0] },
  ribbon: { pos: [4.6, 2.6, 11.4], tgt: [0, -0.7, 0] },
  morph: { pos: [0, 3.6, 11.5], tgt: [0, -0.2, 0] },
};

const col = (hex: number) => new THREE.Color(hex);

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.chain.pos, target: CAM.chain.tgt, fov: 42 });
  const { scene } = stage;

  // ---------------- parameters
  let view: View = 'chain';
  let vw = 0.6;
  let N = 12;
  let disorder = 0;
  let seed = 11;
  let u = 1;
  const w = 1;

  const noise = new Float64Array(MAXS);
  const rowNoise = new Float64Array(W_RIB);
  const reseed = () => {
    randomUnit(seed, noise);
    randomUnit(seed * 7 + 3, rowNoise);
  };
  reseed();

  // ---------------- derived state
  let spec: ChainSpectrum | null = null;
  let windingRaw = 1;
  let winding = 1;
  let gap = 0;
  let residual = 0;
  let chernRaw = 0;
  let chern = 0;
  let gapQ = 0;
  let edgeL = { nL: 0, nR: 0, velL: 0, velR: 0 };
  let crossed = false;
  let sawTrivial = false;
  let sawCplus = false;
  let sawCminus = false;
  let chainDirty = true;
  let ribbonDirty = true;
  const Hbuf = new Float64Array(MAXS * MAXS);
  const solvers = new Map<number, SymEigen>();
  const ribbon = new QWZRibbon(W_RIB, NK_RIB);
  const onsite = new Float64Array(W_RIB);

  // ===================================================================
  // SSH chain view
  // ===================================================================
  const chainG = new THREE.Group();
  scene.add(chainG);
  const grid = makeGrid(16, 32);
  grid.position.y = -0.45;
  chainG.add(grid);

  const atomGeo = new THREE.SphereGeometry(1, 24, 16);
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 });
  const atoms = new THREE.InstancedMesh(atomGeo, atomMat, MAXS);
  atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chainG.add(atoms);

  const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  bondGeo.rotateZ(Math.PI / 2);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x9fb0cf, roughness: 0.45, metalness: 0.3 });
  const bonds = new THREE.InstancedMesh(bondGeo, bondMat, MAXS);
  bonds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chainG.add(bonds);

  const barGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  barGeo.translate(0, 0.5, 0);
  const barMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: PALETTE.amber, emissiveIntensity: 0.9, roughness: 0.6,
    transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const bars = new THREE.InstancedMesh(barGeo, barMat, MAXS);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chainG.add(bars);
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  const caps = new THREE.InstancedMesh(atomGeo, capMat, MAXS);
  caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chainG.add(caps);

  const lblV = stage.label('v', [0, 0, 0], 'big', chainG);
  const lblW = stage.label('w', [0, 0, 0], 'big', chainG);
  const lblA = stage.label('A', [0, 0, 0], 'muted', chainG);
  const lblB = stage.label('B', [0, 0, 0], 'muted', chainG);
  const lblL = stage.label('', [0, 0, 0], '', chainG);
  const lblR = stage.label('', [0, 0, 0], '', chainG);
  const lblMid = stage.label('', [0, 3.2, 0], 'muted', chainG);

  const cA = col(PALETTE.cyan);
  const cB = col(PALETTE.violet);
  const cEdge = col(PALETTE.amber);
  const cBulk = col(0x6f86b5);
  const cWhite = col(0xffffff);
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vP = new THREE.Vector3();
  const vS = new THREE.Vector3();
  const tmpC = new THREE.Color();

  function recomputeChain(): void {
    const n = 2 * N;
    const v = vw * w;
    sshChainMatrix(N, v, w, disorder, noise, Hbuf);
    const H = Hbuf.subarray(0, n * n);
    let solver = solvers.get(n);
    if (!solver) { solver = new SymEigen(n); solvers.set(n, solver); }
    spec = sshChainSpectrum(H, N, solver);
    residual = eigenResidual(H, solver);
    windingRaw = Math.abs(vw - 1) < 1e-9 ? NaN : sshWindingRaw(v, w);
    winding = Number.isNaN(windingRaw) ? -1 : Math.round(windingRaw);
    gap = 2 * Math.abs(v - w);
    if (winding === 0) sawTrivial = true;
    if (winding === 1 && sawTrivial) crossed = true;
    layoutChain();
    drawSpectrum();
    drawLegend();
  }

  function isEdgeState(): boolean {
    return !!spec && winding === 1 && spec.edgeE < Math.max(0.05, gap * 0.25) && spec.edgeWeight > 0.5;
  }

  function layoutChain(): void {
    if (!spec) return;
    const n = 2 * N;
    const sp = CHAIN_L / (n - 1);
    const rAtom = Math.min(0.2, sp * 0.3);
    const x0 = -CHAIN_L / 2;
    const edge = isEdgeState();
    for (let s = 0; s < n; s++) {
      const x = x0 + s * sp;
      m4.compose(vP.set(x, 0, 0), qI, vS.setScalar(rAtom));
      atoms.setMatrixAt(s, m4);
      atoms.setColorAt(s, s % 2 === 0 ? cA : cB);
      const dens = spec.density[s];
      const h = Math.max(0.001, BAR_H * dens);
      m4.compose(vP.set(x, rAtom * 0.6, 0), qI, vS.set(rAtom * 0.75, h, rAtom * 0.75));
      bars.setMatrixAt(s, m4);
      tmpC.copy(edge ? cEdge : cBulk);
      bars.setColorAt(s, tmpC);
      m4.compose(vP.set(x, rAtom * 0.6 + h, 0), qI, vS.setScalar(dens > 0.02 ? rAtom * 0.55 : 0.0001));
      caps.setMatrixAt(s, m4);
      caps.setColorAt(s, tmpC.lerp(cWhite, 0.35));
    }
    for (let b = 0; b < n - 1; b++) {
      const t0 = b % 2 === 0 ? vw * w : w;
      const t = t0 * (1 + disorder * noise[b]);
      const r = rAtom * Math.min(0.95, 0.08 + 0.7 * Math.pow(Math.max(0, t), 1.3));
      const len = sp - 2 * rAtom * 0.7;
      m4.compose(vP.set(x0 + (b + 0.5) * sp, 0, 0), qI, vS.set(len, r, r));
      bonds.setMatrixAt(b, m4);
    }
    atoms.count = n;
    bars.count = n;
    caps.count = n;
    bonds.count = n - 1;
    atoms.instanceMatrix.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    bonds.instanceMatrix.needsUpdate = true;
    if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    barMat.emissive.copy(edge ? cEdge : cBulk);

    lblV.position.set(x0 + 0.5 * sp, -0.5, 0);
    lblW.position.set(x0 + 1.5 * sp, -0.5, 0);
    lblA.position.set(x0, 0.45, 0.4);
    lblB.position.set(x0 + sp, 0.45, 0.4);
    const hL = BAR_H * spec.density[0] + 0.9;
    const hR = BAR_H * spec.density[n - 1] + 0.9;
    if (edge) {
      lblL.element.textContent = 'edge state (A sites)';
      lblR.element.textContent = 'edge state (B sites)';
      lblL.position.set(x0 + 0.9, Math.max(1.2, hL), 0);
      lblR.position.set(-x0 - 0.9, Math.max(1.2, hR), 0);
      lblL.visible = true;
      lblR.visible = true;
      lblMid.element.textContent = 'insulating bulk';
      lblMid.position.set(0, 1.1, 0);
    } else {
      lblL.visible = false;
      lblR.visible = false;
      lblMid.element.textContent = winding === 0
        ? 'trivial: the states nearest E = 0 are spread through the bulk'
        : 'gap closed: the bulk conducts';
      lblMid.position.set(0, 1.6, 0);
    }
  }

  // ===================================================================
  // Chern ribbon view
  // ===================================================================
  const ribbonG = new THREE.Group();
  scene.add(ribbonG);
  const nR = 2 * W_RIB;
  const segCount = (NK_RIB - 1) * nR;
  const segPos = new Float32Array(segCount * 6);
  const segCol = new Float32Array(segCount * 6);
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(segPos, 3).setUsage(THREE.DynamicDrawUsage));
  segGeo.setAttribute('color', new THREE.BufferAttribute(segCol, 3).setUsage(THREE.DynamicDrawUsage));
  const segs = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  segs.frustumCulled = false;
  ribbonG.add(segs);
  const ptPos = new Float32Array(NK_RIB * nR * 3);
  const ptCol = new Float32Array(NK_RIB * nR * 3);
  const ptGeo = new THREE.BufferGeometry();
  ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dotCol = new Float32Array(NK_RIB * nR * 3);
  ptGeo.setAttribute('color', new THREE.BufferAttribute(dotCol, 3).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, sizeAttenuation: true }));
  pts.frustumCulled = false;
  ribbonG.add(pts);

  const gapSlab = new THREE.Mesh(
    new THREE.BoxGeometry(2 * KX, 1, 2 * ZE + 0.3),
    new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.08, depthWrite: false }),
  );
  ribbonG.add(gapSlab);
  const gapEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * KX, 1, 2 * ZE + 0.3)),
    new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.35 }),
  );
  ribbonG.add(gapEdges);
  const gapLbl = stage.label('bulk gap', [-KX - 0.3, 0, ZE], 'muted', ribbonG);

  // axes
  const axMat = new THREE.LineBasicMaterial({ color: PALETTE.gridMajor });
  const axGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-KX, 0, -ZE - 0.4), new THREE.Vector3(KX, 0, -ZE - 0.4),
    new THREE.Vector3(-KX, -3, -ZE - 0.4), new THREE.Vector3(-KX, 3, -ZE - 0.4),
    new THREE.Vector3(-KX, FLOOR_Y, -ZE - 0.4), new THREE.Vector3(-KX, FLOOR_Y, ZE + 0.4),
  ]);
  ribbonG.add(new THREE.LineSegments(axGeo, axMat));
  stage.label('kx', [KX + 0.35, 0, -ZE - 0.4], 'muted', ribbonG);
  stage.label('−π', [-KX, -0.3, -ZE - 0.4], 'muted', ribbonG);
  stage.label('π', [KX, -0.3, -ZE - 0.4], 'muted', ribbonG);
  stage.label('E', [-KX, 3.3, -ZE - 0.4], 'muted', ribbonG);
  stage.label('across the strip', [-KX - 0.9, FLOOR_Y, 0], 'muted', ribbonG);
  const edgeLblL = stage.label('edge y = 0', [KX + 0.4, -1.6, ZE], '', ribbonG);
  const edgeLblR = stage.label('edge y = W', [KX + 0.4, -1.6, -ZE], '', ribbonG);
  edgeLblL.element.style.color = css(PALETTE.amber);
  edgeLblR.element.style.color = css(PALETTE.cyan);

  // real-space strip on the floor with chiral movers
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * KX, 2 * ZE),
    new THREE.MeshBasicMaterial({ color: 0x121a2c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  ribbonG.add(floor);
  const latN = 24;
  const latPos = new Float32Array(latN * W_RIB * 3);
  for (let i = 0; i < latN; i++) {
    for (let y = 0; y < W_RIB; y++) {
      const q = 3 * (i * W_RIB + y);
      latPos[q] = -KX + ((i + 0.5) * 2 * KX) / latN;
      latPos[q + 1] = FLOOR_Y + 0.01;
      latPos[q + 2] = ZE - (2 * ZE * y) / (W_RIB - 1);
    }
  }
  const latGeo = new THREE.BufferGeometry();
  latGeo.setAttribute('position', new THREE.BufferAttribute(latPos, 3));
  ribbonG.add(new THREE.Points(latGeo, new THREE.PointsMaterial({ color: 0x3a4a6c, size: 0.05 })));
  const movPos = new Float32Array(2 * MOVERS * 3);
  const movCol = new Float32Array(2 * MOVERS * 3);
  for (let i = 0; i < 2 * MOVERS; i++) {
    const c = i < MOVERS ? cEdge : cA;
    movCol[3 * i] = c.r; movCol[3 * i + 1] = c.g; movCol[3 * i + 2] = c.b;
  }
  const movGeo = new THREE.BufferGeometry();
  movGeo.setAttribute('position', new THREE.BufferAttribute(movPos, 3).setUsage(THREE.DynamicDrawUsage));
  movGeo.setAttribute('color', new THREE.BufferAttribute(movCol, 3));
  const movers = new THREE.Points(movGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 }));
  movers.frustumCulled = false;
  ribbonG.add(movers);
  const floorLbl = stage.label('', [0, FLOOR_Y - 0.35, ZE + 0.2], 'muted', ribbonG);

  const cSlate = col(0x3a4868);
  const cDim = col(0x1a2236);
  function recomputeRibbon(): void {
    for (let y = 0; y < W_RIB; y++) onsite[y] = 2 * disorder * rowNoise[y];
    ribbon.compute(u, onsite);
    edgeL = ribbon.edgeSummary(gapQ);
    const { energies, wL, wR, pos, kx } = ribbon;
    const X = (k: number) => (k / Math.PI) * KX;
    const Z = (p: number) => ZE - 2 * ZE * p;
    for (let ik = 0; ik < NK_RIB; ik++) {
      for (let s = 0; s < nR; s++) {
        const q = ik * nR + s;
        const l = wL[q], r = wR[q];
        const b = Math.max(0, 1 - l - r);
        const cr = cSlate.r * b + cEdge.r * l + cA.r * r;
        const cg = cSlate.g * b + cEdge.g * l + cA.g * r;
        const cb = cSlate.b * b + cEdge.b * l + cA.b * r;
        ptPos[3 * q] = X(kx[ik]);
        ptPos[3 * q + 1] = energies[q] * ES;
        ptPos[3 * q + 2] = Z(pos[q]);
        ptCol[3 * q] = cr; ptCol[3 * q + 1] = cg; ptCol[3 * q + 2] = cb;
        const e = Math.min(1, l + r);
        dotCol[3 * q] = cDim.r * (1 - e) + (cEdge.r * l + cA.r * r);
        dotCol[3 * q + 1] = cDim.g * (1 - e) + (cEdge.g * l + cA.g * r);
        dotCol[3 * q + 2] = cDim.b * (1 - e) + (cEdge.b * l + cA.b * r);
      }
    }
    let o = 0;
    for (let ik = 0; ik < NK_RIB - 1; ik++) {
      for (let s = 0; s < nR; s++) {
        const a = 3 * (ik * nR + s);
        const b = 3 * ((ik + 1) * nR + s);
        for (let c = 0; c < 3; c++) {
          segPos[o + c] = ptPos[a + c];
          segPos[o + 3 + c] = ptPos[b + c];
          segCol[o + c] = ptCol[a + c];
          segCol[o + 3 + c] = ptCol[b + c];
        }
        o += 6;
      }
    }
    segGeo.attributes.position.needsUpdate = true;
    segGeo.attributes.color.needsUpdate = true;
    ptGeo.attributes.position.needsUpdate = true;
    ptGeo.attributes.color.needsUpdate = true;
    const gh = Math.max(0.002, gapQ * ES);
    gapSlab.scale.y = gh;
    gapEdges.scale.y = gh;
    gapLbl.position.y = 0;
    gapLbl.element.textContent = gapQ < 0.05 ? 'gap closed' : `bulk gap ${gapQ.toFixed(2)}`;
    floorLbl.element.textContent = chern !== 0
      ? 'the strip seen from above: each edge carries current one way only'
      : 'the strip seen from above: no edge channels';
    movers.visible = chern !== 0 && edgeL.velL !== 0;
    ribbonDirty = false;
  }

  function recomputeChern(): void {
    chernRaw = chernFHS(u, 24);
    gapQ = qwzGap(u);
    chern = Math.abs(u) < 1e-6 || Math.abs(Math.abs(u) - 2) < 1e-6 ? 0 : Math.round(chernRaw);
    if (chern === 1) sawCplus = true;
    if (chern === -1) sawCminus = true;
  }

  // Precomputed phase diagram C(u) for the inset
  const PU = 121;
  const phaseC = new Float64Array(PU);
  for (let i = 0; i < PU; i++) phaseC[i] = Math.round(chernFHS(-3 + (6 * (i + 0.5)) / PU, 12));

  // ===================================================================
  // Doughnut / sphere morph
  // ===================================================================
  const morphG = new THREE.Group();
  scene.add(morphG);
  const SU = 128, SV = 64;
  const mPos = new Float32Array((SU + 1) * (SV + 1) * 3);
  const mIdx: number[] = [];
  for (let i = 0; i < SU; i++) {
    for (let j = 0; j < SV; j++) {
      const a = i * (SV + 1) + j, b = (i + 1) * (SV + 1) + j;
      mIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
  mGeo.setIndex(mIdx);
  const mMat = new THREE.MeshStandardMaterial({ color: PALETTE.green, roughness: 0.35, metalness: 0.15, emissive: 0x000000 });
  const mMesh = new THREE.Mesh(mGeo, mMat);
  morphG.add(mMesh);
  const mGrid = makeGrid(12, 24);
  mGrid.position.y = -2.4;
  morphG.add(mGrid);
  const mLbl = stage.label('', [0, 2.6, 0], 'big', morphG);
  const mSub = stage.label('', [0, -3.1, 0], 'muted', morphG);
  let morphR = TR_r * 1.4;
  let morphShown = -1;
  const morphTarget = () => TR_r * Math.max(0, Math.min(2, 2 - vw));

  function buildMorph(R: number): void {
    for (let i = 0; i <= SU; i++) {
      const th = (2 * Math.PI * i) / SU;
      const ct = Math.cos(th), st = Math.sin(th);
      for (let j = 0; j <= SV; j++) {
        const ph = (2 * Math.PI * j) / SV;
        const rr = R + TR_r * Math.cos(ph);
        const q = 3 * (i * (SV + 1) + j);
        mPos[q] = rr * ct;
        mPos[q + 1] = TR_r * Math.sin(ph);
        mPos[q + 2] = rr * st;
      }
    }
    mGeo.attributes.position.needsUpdate = true;
    mGeo.computeVertexNormals();
    mGeo.computeBoundingSphere();
    morphShown = R;
  }

  function styleMorph(): void {
    const near = Math.abs(vw - 1) < 0.04;
    if (near) {
      mMat.color.set(PALETTE.red);
      mLbl.element.textContent = 'the hole pinches shut: the gap closes';
      mSub.element.textContent = 'a real surface would have to tear here';
    } else if (vw < 1) {
      mMat.color.set(PALETTE.green);
      mLbl.element.textContent = 'genus 1 (one hole)  ↔  ν = 1';
      mSub.element.textContent = 'squeeze all you like: the hole stays until it pinches';
    } else {
      mMat.color.set(PALETTE.violet);
      mLbl.element.textContent = 'genus 0 (no hole)  ↔  ν = 0';
      mSub.element.textContent = 'past the pinch the surface passes through itself';
    }
  }

  // ===================================================================
  // Insets and overlays
  // ===================================================================
  const insetStyle = {
    position: 'absolute', right: '10px', background: 'rgba(7,10,18,0.72)', borderRadius: '10px',
    border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  const loop = document.createElement('canvas');
  loop.width = 400;
  loop.height = 400;
  Object.assign(loop.style, { ...insetStyle, top: '10px', width: '200px', height: '200px' } as CSSStyleDeclaration);
  viewport.appendChild(loop);
  const lctx = loop.getContext('2d')!;

  const specC = document.createElement('canvas');
  specC.className = 'stage-overlay';
  specC.width = 400;
  specC.height = 220;
  Object.assign(specC.style, { ...insetStyle, top: '218px', width: '200px', height: '110px' } as CSSStyleDeclaration);
  viewport.appendChild(specC);
  const sctx = specC.getContext('2d')!;

  const phase = document.createElement('canvas');
  phase.width = 440;
  phase.height = 260;
  Object.assign(phase.style, { ...insetStyle, top: '10px', width: '220px', height: '130px' } as CSSStyleDeclaration);
  viewport.appendChild(phase);
  const pctx = phase.getContext('2d')!;

  const MONO = 'JetBrains Mono, monospace';
  function drawLoop(t: number): void {
    const Wd = loop.width, Hd = loop.height;
    lctx.clearRect(0, 0, Wd, Hd);
    lctx.font = `600 22px ${MONO}`;
    lctx.fillStyle = '#b8c3d9';
    lctx.fillText('d(k) as k runs −π → π', 16, 32);
    const v = vw * w;
    const sc = 82; // canvas px per energy unit
    const cx = 22 + 1.2 * sc, cy = Hd / 2 + 6;
    const X = (x: number) => cx + x * sc;
    const Y = (y: number) => cy - y * sc;
    // axes
    lctx.strokeStyle = '#2c3852';
    lctx.lineWidth = 2;
    lctx.beginPath();
    lctx.moveTo(X(-1.2), cy); lctx.lineTo(X(3.2), cy);
    lctx.moveTo(cx, Y(1.4)); lctx.lineTo(cx, Y(-1.4));
    lctx.stroke();
    lctx.fillStyle = '#56627c';
    lctx.font = `18px ${MONO}`;
    lctx.fillText('dx', X(3.2) - 28, cy - 8);
    lctx.fillText('dy', cx + 8, Y(1.4) + 14);
    // loop
    const near = Math.abs(vw - 1) < 0.04;
    const loopCol = near ? css(PALETTE.red) : winding === 1 ? css(PALETTE.green) : css(PALETTE.violet);
    lctx.strokeStyle = loopCol;
    lctx.lineWidth = 4;
    lctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const [dx, dy] = sshD(v, w, -Math.PI + (2 * Math.PI * i) / 96);
      if (i === 0) lctx.moveTo(X(dx), Y(dy));
      else lctx.lineTo(X(dx), Y(dy));
    }
    lctx.stroke();
    // moving point and vector from origin
    const k = ((t * 0.9) % (2 * Math.PI)) - Math.PI;
    const [px, py] = sshD(v, w, k);
    lctx.strokeStyle = 'rgba(223,230,243,0.75)';
    lctx.lineWidth = 2.5;
    lctx.beginPath();
    lctx.moveTo(cx, cy);
    lctx.lineTo(X(px), Y(py));
    lctx.stroke();
    lctx.fillStyle = '#dfe6f3';
    lctx.beginPath();
    lctx.arc(X(px), Y(py), 7, 0, 2 * Math.PI);
    lctx.fill();
    // origin
    lctx.strokeStyle = css(PALETTE.amber);
    lctx.lineWidth = 3;
    lctx.beginPath();
    lctx.arc(cx, cy, 9, 0, 2 * Math.PI);
    lctx.stroke();
    lctx.fillStyle = css(PALETTE.amber);
    lctx.beginPath();
    lctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    lctx.fill();
    lctx.font = `18px ${MONO}`;
    lctx.fillText('origin', cx - 76, cy + 34);
    // verdict
    lctx.font = `600 24px ${MONO}`;
    lctx.fillStyle = loopCol;
    const verdict = near ? 'touches origin: gap ≈ 0' : winding === 1 ? 'circles origin: ν = 1' : 'misses origin: ν = 0';
    lctx.fillText(verdict, 16, Hd - 16);
  }

  function drawSpectrum(): void {
    if (!spec) return;
    const Wd = specC.width, Hd = specC.height;
    sctx.clearRect(0, 0, Wd, Hd);
    sctx.font = `600 20px ${MONO}`;
    sctx.fillStyle = '#b8c3d9';
    sctx.fillText('finite-chain energies', 14, 28);
    const n = spec.values.length;
    const emax = 1 + vw * w + disorder * 2;
    const x0 = 16, x1 = Wd - 16, y0 = 44, y1 = Hd - 14;
    const Y = (e: number) => (y0 + y1) / 2 - (e / emax) * ((y1 - y0) / 2);
    sctx.strokeStyle = '#2c3852';
    sctx.lineWidth = 1.5;
    sctx.beginPath();
    sctx.moveTo(x0, Y(0)); sctx.lineTo(x1, Y(0));
    sctx.stroke();
    sctx.fillStyle = '#56627c';
    sctx.font = `16px ${MONO}`;
    sctx.fillText('E = 0', x1 - 56, Y(0) - 6);
    const edge = isEdgeState();
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0);
      const hl = edge && (i === spec.i0 || i === spec.i1);
      sctx.fillStyle = hl ? css(PALETTE.amber) : i % 2 === 0 ? '#7f93bd' : '#6b7fa8';
      sctx.beginPath();
      sctx.arc(x, Y(spec.values[i]), hl ? 6 : 3.2, 0, 2 * Math.PI);
      sctx.fill();
    }
  }

  function drawPhase(): void {
    const Wd = phase.width, Hd = phase.height;
    pctx.clearRect(0, 0, Wd, Hd);
    pctx.font = `600 22px ${MONO}`;
    pctx.fillStyle = '#b8c3d9';
    pctx.fillText('Chern number C(u)', 16, 32);
    const x0 = 40, x1 = Wd - 20, yc = 150, amp = 60;
    const X = (uu: number) => x0 + ((uu + 3) / 6) * (x1 - x0);
    pctx.strokeStyle = '#2c3852';
    pctx.lineWidth = 1.5;
    pctx.beginPath();
    for (const c of [-1, 0, 1]) { pctx.moveTo(x0, yc - c * amp); pctx.lineTo(x1, yc - c * amp); }
    pctx.stroke();
    pctx.fillStyle = '#56627c';
    pctx.font = `18px ${MONO}`;
    pctx.fillText('+1', 4, yc - amp + 6);
    pctx.fillText(' 0', 4, yc + 6);
    pctx.fillText('−1', 4, yc + amp + 6);
    for (const uu of [-2, 0, 2]) pctx.fillText(String(uu), X(uu) - 6, Hd - 14);
    pctx.fillText('u', x1 - 10, Hd - 14);
    pctx.strokeStyle = css(PALETTE.green);
    pctx.lineWidth = 4;
    pctx.beginPath();
    for (let i = 0; i < PU; i++) {
      const x = X(-3 + (6 * (i + 0.5)) / PU);
      const y = yc - phaseC[i] * amp;
      if (i === 0) pctx.moveTo(x, y);
      else pctx.lineTo(x, y);
    }
    pctx.stroke();
    pctx.strokeStyle = 'rgba(255,107,107,0.6)';
    pctx.setLineDash([5, 5]);
    pctx.lineWidth = 2;
    pctx.beginPath();
    for (const uu of [-2, 0, 2]) { pctx.moveTo(X(uu), 44); pctx.lineTo(X(uu), Hd - 36); }
    pctx.stroke();
    pctx.setLineDash([]);
    pctx.fillStyle = css(PALETTE.amber);
    pctx.beginPath();
    pctx.arc(X(u), yc - chern * amp, 9, 0, 2 * Math.PI);
    pctx.fill();
  }

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const badge = document.createElement('div');
  badge.className = 'stage-overlay';
  Object.assign(badge.style, {
    position: 'absolute', right: '10px', bottom: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '6px 10px',
    font: '12px/1.4 JetBrains Mono, monospace', color: '#b8c3d9', textAlign: 'right',
  } as CSSStyleDeclaration);
  viewport.appendChild(badge);

  const H3 = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;
  function drawLegend(): void {
    if (view === 'chain') {
      legend.innerHTML = `${H3('SSH chain')}
<div>Thick bond = strong hopping. <b>v</b> inside a cell, <b>w</b> between cells.</div>
<div>Atoms: <span style="color:${css(PALETTE.cyan)}">A</span> and <span style="color:${css(PALETTE.violet)}">B</span> sublattices.</div>
<div>Column height = density of the two states nearest E = 0. <span style="color:${css(PALETTE.amber)}">Amber</span> = edge states.</div>`;
    } else if (view === 'ribbon') {
      legend.innerHTML = `${H3('QWZ strip, 20 rows wide')}
<div>Each dot is a state: momentum kx, energy E, and where it sits across the strip.</div>
<div><span style="color:${css(PALETTE.amber)}">Amber</span> = on edge y = 0. <span style="color:${css(PALETTE.cyan)}">Cyan</span> = on edge y = W. Slate = bulk.</div>
<div>Violet slab = bulk gap. Edge lines crossing it are the chiral edge modes.</div>`;
    } else {
      legend.innerHTML = `${H3('Why integers are stubborn')}
<div>The shape follows v/w. Below 1 it has a hole. Above 1 it has none.</div>
<div>Smooth squeezing never changes the number of holes. It can only change at the pinch.</div>
<div>Band topology is the same: ν can only change where the gap closes.</div>`;
    }
    const topo = winding === 1;
    const near = Math.abs(vw - 1) < 0.04;
    if (view === 'ribbon') {
      const cc = chern !== 0 ? css(PALETTE.green) : css(PALETTE.violet);
      badge.innerHTML = `<div style="color:${cc};font:600 15px/1.2 'Space Grotesk',sans-serif">${chern !== 0 ? 'Chern insulator' : 'Trivial insulator'} · C = ${chern > 0 ? '+' : ''}${chern}</div><div>${chern !== 0 ? 'one chiral mode per edge' : 'no edge modes in the gap'}</div>`;
    } else {
      const cc = near ? css(PALETTE.red) : topo ? css(PALETTE.green) : css(PALETTE.violet);
      const name = near ? 'At the transition' : topo ? 'Topological · ν = 1' : 'Trivial · ν = 0';
      const sub = near ? 'bulk gap nearly closed' : topo ? 'zero modes at both ends' : 'no end states';
      badge.innerHTML = `<div style="color:${cc};font:600 15px/1.2 'Space Grotesk',sans-serif">${name}</div><div>${sub}</div>`;
    }
  }

  function applyView(): void {
    chainG.visible = view === 'chain';
    ribbonG.visible = view === 'ribbon';
    morphG.visible = view === 'morph';
    loop.style.display = view === 'ribbon' ? 'none' : '';
    specC.style.display = view === 'chain' ? '' : 'none';
    phase.style.display = view === 'ribbon' ? '' : 'none';
    if (view === 'ribbon') drawPhase();
    drawLegend();
  }

  // ===================================================================
  // Frame loop
  // ===================================================================
  let loopTimer = 0;
  let movT = 0;
  stage.onFrame((dt, t) => {
    if (chainDirty) {
      recomputeChain();
      chainDirty = false;
    }
    if (view === 'ribbon' && ribbonDirty) recomputeRibbon();

    if (view === 'chain') {
      barMat.emissiveIntensity = isEdgeState() ? 0.75 + 0.35 * Math.sin(t * 3) : 0.35;
    }
    if (view !== 'ribbon') {
      loopTimer += dt;
      if (loopTimer > 1 / 24) {
        loopTimer = 0;
        drawLoop(t);
      }
    }
    if (view === 'morph') {
      const target = morphTarget();
      morphR += (target - morphR) * Math.min(1, dt * 4);
      if (Math.abs(morphR - morphShown) > 1e-4) buildMorph(morphR);
      mMesh.rotation.y += dt * 0.35;
      mMesh.rotation.x = 0.55 + 0.08 * Math.sin(t * 0.7);
      const near = Math.abs(vw - 1) < 0.04;
      mMat.emissive.setRGB(near ? 0.35 + 0.25 * Math.sin(t * 6) : 0, 0, 0);
    }
    if (view === 'ribbon' && movers.visible) {
      movT += dt;
      for (let i = 0; i < 2 * MOVERS; i++) {
        const left = i < MOVERS;
        const dir = left ? edgeL.velL : edgeL.velR;
        const ph = ((i % MOVERS) / MOVERS + dir * movT * 0.12) % 1;
        const f = ph < 0 ? ph + 1 : ph;
        movPos[3 * i] = -KX + f * 2 * KX;
        movPos[3 * i + 1] = FLOOR_Y + 0.08;
        movPos[3 * i + 2] = left ? ZE - 0.05 : -ZE + 0.05;
      }
      movGeo.attributes.position.needsUpdate = true;
    }
    updateReadouts();
  });

  // ===================================================================
  // Controls
  // ===================================================================
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'chain', label: 'SSH chain' }, { value: 'ribbon', label: 'Chern ribbon' }, { value: 'morph', label: 'Doughnut ↔ sphere' }],
    onChange: (v) => {
      view = v;
      applyView();
      stage.flyTo(CAM[v].pos, CAM[v].tgt);
      if (v === 'morph') styleMorph();
    },
  });

  ui.section('SSH chain');
  ui.slider({
    key: 'vw', label: 'Hopping ratio v/w', min: 0, max: 2, step: 0.005, value: vw,
    format: (x) => x.toFixed(3),
    onInput: (x) => { vw = x; chainDirty = true; styleMorph(); },
  });
  ui.slider({ key: 'N', label: 'Chain length (cells)', min: 4, max: MAXN, step: 1, value: N, onInput: (x) => { N = x; chainDirty = true; } });
  ui.slider({
    key: 'disorder', label: 'Disorder', min: 0, max: 0.5, step: 0.01, value: disorder,
    format: (x) => (x === 0 ? 'none' : `±${Math.round(x * 100)}%`),
    onInput: (x) => { disorder = x; chainDirty = true; ribbonDirty = true; },
  });
  ui.buttons([{ label: 'New disorder pattern', key: 'disorder', onClick: () => { seed = (seed * 1103515245 + 12345) % 2147483647; reseed(); chainDirty = true; ribbonDirty = true; } }]);

  ui.section('Chern insulator (QWZ)');
  ui.slider({
    key: 'u', label: 'Mass parameter u', min: -3, max: 3, step: 0.02, value: u,
    format: (x) => x.toFixed(2),
    onInput: (x) => { u = x; recomputeChern(); ribbonDirty = true; if (view === 'ribbon') drawPhase(); drawLegend(); },
  });
  ui.note('Disorder varies the bond strengths in the chain (this keeps chiral symmetry) and adds a random potential across the strip in the ribbon. Energies are in units of w = 1 and of the QWZ hopping.');

  ui.section('SSH readouts');
  const rNu = ui.readout('winding', 'winding ν');
  const rNuRaw = ui.readout('windingRaw', 'winding sum');
  const rGap = ui.readout('gap', 'bulk gap 2|v−w|');
  const rEdge = ui.readout('edgeE', 'edge energy |E|');
  const rW = ui.readout('edgeWeight', 'weight on ends');
  const rRes = ui.readout('residual', 'eigen residual');
  ui.section('Chern readouts');
  const rC = ui.readout('chern', 'Chern number C');
  const rCRaw = ui.readout('chernRaw', 'Σ F / 2π (24²)');
  const rGQ = ui.readout('qwzGap', 'QWZ bulk gap');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'A sites / edge y = W' },
    { color: css(PALETTE.violet), label: 'B sites / gap' },
    { color: css(PALETTE.amber), label: 'edge states' },
  ]);

  function updateReadouts(): void {
    if (!spec) return;
    rNu(winding < 0 ? 'undefined (v = w)' : String(winding));
    rNuRaw(Number.isNaN(windingRaw) ? 'n/a' : windingRaw.toFixed(6));
    rGap(gap.toFixed(3));
    rEdge(spec.edgeE < 1e-14 ? '< 1e-14' : spec.edgeE < 1e-3 ? spec.edgeE.toExponential(1) : spec.edgeE.toFixed(3));
    rW(`${(spec.edgeWeight * 100).toFixed(0)} %`);
    rRes(residual.toExponential(0));
    rC(chern > 0 ? `+${chern}` : String(chern));
    rCRaw(chernRaw.toFixed(6));
    rGQ(gapQ.toFixed(3));
  }

  recomputeChern();
  recomputeChain();
  chainDirty = false;
  buildMorph(morphR);
  styleMorph();
  applyView();

  return {
    state: () => ({
      view,
      vw,
      N,
      disorder,
      winding,
      windingRaw: Number.isNaN(windingRaw) ? 0.5 : windingRaw,
      gap,
      edgeE: spec ? spec.edgeE : 1,
      edgeWeight: spec ? spec.edgeWeight : 0,
      topological: winding === 1,
      crossed,
      u,
      chern,
      chernRaw,
      qwzGap: gapQ,
      sawCplus,
      sawCminus,
    }),
    dispose: () => {
      loop.remove();
      specC.remove();
      phase.remove();
      legend.remove();
      badge.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'topological-insulators',
  number: 96,
  title: 'Topological Insulators',
  domain: 'quantum',
  level: 3,
  status: 'live',
  tagline: 'Insulating inside, conducting on the edge, protected by topology.',
  content,
  mount,
};

export default topic;
