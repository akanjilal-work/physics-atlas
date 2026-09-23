import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  LHC_GLUINO,
  LHC_STOP,
  MT,
  MZ,
  PAIRS,
  couplingsAt,
  fineTuning,
  fineTuningNoSusy,
  pairCrossings,
  quadraticPieces,
  stopLeftover,
  unification,
  type Family,
  type Model,
  type Triple,
  type Unification,
} from './physics.ts';

type View = 'mirror' | 'unify' | 'hierarchy';
type Cutoff = '1e4' | '1e10' | '1e16';

const TAU = Math.PI * 2;
const MONO = 'JetBrains Mono, ui-monospace, monospace';

const CAM: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  mirror: { pos: [0.2, 3.6, 12.6], target: [0.2, 2.85, 0] },
  unify: { pos: [0.9, 2.5, 12.4], target: [0.6, 1.5, 0] },
  hierarchy: { pos: [0.9, 3.0, 9.6], target: [0.7, 1.55, 0] },
};

const FAMILY_COLOR: Record<Family, number> = {
  lepton: PALETTE.cyan,
  quark: PALETTE.rose,
  gauge: PALETTE.amber,
  higgs: PALETTE.green,
};
const COUPLING_COLOR = [PALETTE.cyan, PALETTE.green, PALETTE.rose];
const COUPLING_NAME = ['α₁ hypercharge', 'α₂ weak', 'α₃ strong'];

// --- Mirror world geometry
/** Height of an orb for mass m in GeV, on a log scale. Massless sits on the floor. */
const massY = (m: number) => (m <= 0 ? 0 : Math.max(0.2, 0.62 * (Math.log10(m) + 4)));
const pairX = (i: number) => 0.85 + i * 0.55;

// --- Unification plot geometry
const LMIN = 2;
const LMAX = 19;
const plotX = (l: number) => (l - 10.5) * 0.6;
const plotY = (a: number) => a * 0.085;
const NS = 171; // samples along each ribbon
const RIB_W = 0.2;

// --- Hierarchy geometry
const PIVOT_Y = 1.5;
const ARM = 2.7;
const HANG = 1.05;
const METER_X = 4.75;
const METER_Y = 0.9;
const METER_H = 3.0;
const METER_DEC = 4; // meter spans Delta = 1 .. 10^4

const fmtTeV = (gev: number) => (gev >= 1000 ? `${(gev / 1000).toFixed(gev >= 1e4 ? 1 : 2)} TeV` : `${gev.toFixed(0)} GeV`);
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).replace('-', '⁻').replace(/\d/g, (d) => SUP[Number(d)]);
/** Symbol with a tilde drawn above it, for superpartner labels. */
function tilde(sym: string): string {
  const base = sym.replace('\u0303', '');
  return `<span style="position:relative;display:inline-block">${base}<span style="position:absolute;left:50%;top:-0.72em;transform:translateX(-50%)">~</span></span>`;
}
function sci(x: number, digits = 1): string {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${m.toFixed(digits)}×10${sup(e)}`;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.mirror.pos, target: CAM.mirror.target, fov: 44 });
  const { scene } = stage;

  // --- State
  let view: View = 'mirror';
  let model: Model = 'MSSM';
  let msusy = 3000; // GeV
  let probe = 10; // log10 mu
  let mstop = 400; // GeV
  let cutoff: Cutoff = '1e16';
  let unif: Unification = unification(model, msusy);
  let delta = fineTuning(mstop, Number(cutoff));

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const basic = (color: number, opacity = 1, extra: THREE.MeshBasicMaterialParameters = {}) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, ...extra });
    m.toneMapped = false;
    return m;
  };
  const lineMat = (color: number, opacity = 1) => {
    const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    m.toneMapped = false;
    return m;
  };
  const segLines = (pts: number[], mat: THREE.Material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, mat);
  };
  const tint = (el: CSS2DObject, color: number) => {
    el.element.style.color = css(color);
    return el;
  };

  // =========================================================================
  // View 1: mirror world
  // =========================================================================
  const mirror = new THREE.Group();
  scene.add(mirror);

  const orbGeo = keep(new THREE.SphereGeometry(0.13, 24, 16));
  const shellGeo = keep(new THREE.IcosahedronGeometry(0.18, 1));
  const ringGeo = keep(new THREE.TorusGeometry(0.215, 0.012, 6, 48));
  const ringMat = basic(0xffffff, 0.85);
  const ghostRingMat = basic(0xd9ccff, 0.55);

  // Decade grid and floor
  {
    const decades: [number, string][] = [[-3, '1 MeV'], [0, '1 GeV'], [3, '1 TeV'], [4, '10 TeV']];
    const pts: number[] = [];
    for (const [d] of decades) {
      const y = massY(10 ** d);
      pts.push(-5.6, y, -0.5, 5.6, y, -0.5);
    }
    mirror.add(segLines(pts, lineMat(PALETTE.gridMajor, 0.8)));
    for (const [d, lab] of decades) stage.label(lab, [-0.5, massY(10 ** d) + 0.14, -0.5], 'muted', mirror).element.style.fontSize = '10.5px';
    mirror.add(segLines([-5.6, 0, -0.5, 5.6, 0, -0.5], lineMat(PALETTE.gridMajor, 1)));
    stage.label('0', [-0.3, 0.14, -0.5], 'muted', mirror).element.style.fontSize = '10.5px';
  }

  // The mirror: a faint violet sheet at x = 0
  {
    const g = new THREE.PlaneGeometry(2.6, 5.6);
    g.rotateY(Math.PI / 2);
    const sheet = new THREE.Mesh(g, basic(PALETTE.violet, 0.07, { side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    sheet.position.set(0, 2.6, 0);
    mirror.add(sheet);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat(PALETTE.violet, 0.55));
    e.position.copy(sheet.position);
    mirror.add(e);
    keep(e.geometry);
    tint(stage.label('Q', [0, 5.6, 0], '', mirror), PALETTE.violet).element.style.font = `700 18px ${MONO}`;
    stage.label('Standard Model (seen)', [-3.0, -1.0, 0], '', mirror);
    tint(stage.label('superpartners (never seen)', [3.0, -1.0, 0], '', mirror), 0xc4b5fd);
  }

  // LHC band: rough limits on coloured partners, 1.2 to 2.2 TeV
  {
    const y0 = massY(LHC_STOP);
    const y1 = massY(LHC_GLUINO);
    const g = new THREE.PlaneGeometry(5.2, y1 - y0);
    const band = new THREE.Mesh(g, basic(PALETTE.red, 0.12, { side: THREE.DoubleSide, depthWrite: false }));
    band.position.set(3.1, (y0 + y1) / 2, -0.45);
    mirror.add(band);
    mirror.add(segLines([0.5, y1, -0.45, 5.7, y1, -0.45, 0.5, y0, -0.45, 5.7, y0, -0.45], lineMat(PALETTE.red, 0.6)));
  }

  interface Orb {
    group: THREE.Group;
    rings: THREE.Mesh[];
    shell: THREE.Mesh | null;
    y: number;
    target: number;
    x: number;
    phase: number;
    flash: number;
  }
  const smOrbs: Orb[] = [];
  const spOrbs: Orb[] = [];
  const pairLinePos = new Float32Array(PAIRS.length * 6);
  const pairLineGeo = new THREE.BufferGeometry();
  pairLineGeo.setAttribute('position', new THREE.BufferAttribute(pairLinePos, 3));
  mirror.add(new THREE.LineSegments(pairLineGeo, lineMat(PALETTE.violet, 0.28)));

  function makeOrb(x: number, y: number, color: number, spin: number, ghost: boolean, text: string, phase: number): Orb {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: ghost ? 0.55 : 0.4, roughness: 0.35, metalness: 0.1,
      transparent: ghost, opacity: ghost ? 0.42 : 1, depthWrite: !ghost,
    });
    group.add(new THREE.Mesh(orbGeo, mat));
    let shell: THREE.Mesh | null = null;
    if (ghost) {
      shell = new THREE.Mesh(shellGeo, basic(color, 0.5, { wireframe: true }));
      group.add(shell);
    }
    const rings: THREE.Mesh[] = [];
    const n = Math.round(2 * spin);
    for (let k = 0; k < n; k++) {
      const r = new THREE.Mesh(ringGeo, ghost ? ghostRingMat : ringMat);
      r.rotation.set(Math.PI / 2 - 0.35 + k * 0.7, 0, k * 0.5);
      r.scale.setScalar(1 + k * 0.22);
      rings.push(r);
      group.add(r);
    }
    const lab = stage.label(text, [0, -0.42, 0], '', group);
    if (ghost) lab.element.innerHTML = tilde(text);
    lab.element.style.color = css(ghost ? 0xc4b5fd : color);
    lab.element.style.fontWeight = '600';
    mirror.add(group);
    return { group, rings, shell, y, target: y, x, phase, flash: 0 };
  }

  PAIRS.forEach((p, i) => {
    const col = FAMILY_COLOR[p.family];
    const ys = massY(p.mass);
    smOrbs.push(makeOrb(-pairX(i), ys, col, p.spin, false, p.sm, i * 0.9));
    const yp = massY(p.ratio * msusy);
    spOrbs.push(makeOrb(pairX(i), yp, col, p.partnerSpin, true, p.partner, i * 0.9 + 1.7));
  });

  // Q pulse: a spark that crosses the mirror along one pair line at a time
  const spark = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), basic(0xffffff));
  const sparkHalo = new THREE.Mesh(keep(new THREE.SphereGeometry(0.16, 12, 8)), basic(PALETTE.violet, 0.35, { depthWrite: false, blending: THREE.AdditiveBlending }));
  spark.add(sparkHalo);
  mirror.add(spark);
  let sparkPair = 0;
  let sparkU = 0;
  let sparkDir = 1;

  // =========================================================================
  // View 2: gauge coupling unification
  // =========================================================================
  const unify = new THREE.Group();
  unify.visible = false;
  scene.add(unify);
  const YTOP = plotY(62);
  {
    const pts: number[] = [];
    for (let l = LMIN; l <= LMAX; l += 2) pts.push(plotX(l), 0, -0.5, plotX(l), YTOP, -0.5);
    for (let a = 0; a <= 60; a += 10) pts.push(plotX(LMIN), plotY(a), -0.5, plotX(LMAX), plotY(a), -0.5);
    unify.add(segLines(pts, lineMat(PALETTE.grid, 1)));
    unify.add(segLines([plotX(LMIN), 0, -0.5, plotX(LMAX), 0, -0.5, plotX(LMIN), 0, -0.5, plotX(LMIN), YTOP, -0.5], lineMat(PALETTE.gridMajor, 1)));
    for (let l = LMIN; l <= LMAX; l += 2) stage.label(`10${sup(l)}`, [plotX(l), -0.28, -0.5], 'muted', unify);
    for (let a = 10; a <= 60; a += 10) stage.label(String(a), [plotX(LMIN) - 0.35, plotY(a), -0.5], 'muted', unify);
    stage.label('energy scale μ (GeV)', [0, -0.68, -0.5], 'muted', unify);
    stage.label('1/α', [plotX(LMIN) - 0.4, YTOP + 0.3, -0.5], 'muted', unify);
    // Floor sheet for depth
    const fg = new THREE.PlaneGeometry(plotX(LMAX) - plotX(LMIN), 1.6);
    fg.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(fg, basic(PALETTE.gridMajor, 0.18, { depthWrite: false, side: THREE.DoubleSide }));
    floor.position.set(0, -0.01, 0.3);
    unify.add(floor);
  }

  interface Ribbon {
    pos: Float32Array;
    geo: THREE.BufferGeometry;
    linePos: Float32Array;
    lineGeo: THREE.BufferGeometry;
    ghostPos: Float32Array;
    ghostGeo: THREE.BufferGeometry;
    label: CSS2DObject;
  }
  const ribbons: Ribbon[] = COUPLING_COLOR.map((c, i) => {
    const pos = new Float32Array(NS * 2 * 3);
    const idx: number[] = [];
    for (let k = 0; k < NS - 1; k++) {
      const a = 2 * k;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, basic(c, 0.42, { side: THREE.DoubleSide, depthWrite: false }));
    mesh.frustumCulled = false;
    const linePos = new Float32Array(NS * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const line = new THREE.Line(lineGeo, lineMat(c, 1));
    line.frustumCulled = false;
    const ghostPos = new Float32Array(NS * 3);
    const ghostGeo = new THREE.BufferGeometry();
    ghostGeo.setAttribute('position', new THREE.BufferAttribute(ghostPos, 3));
    const ghost = new THREE.Line(ghostGeo, lineMat(c, 0.28));
    ghost.frustumCulled = false;
    unify.add(mesh, line, ghost);
    const label = tint(stage.label(COUPLING_NAME[i], [0, 0, 0], '', unify), c);
    return { pos, geo, linePos, lineGeo, ghostPos, ghostGeo, label };
  });
  const ghostNote = stage.label('', [plotX(LMAX) - 1.6, plotY(66), -0.5], 'muted', unify);

  // Threshold marker
  const thrGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, YTOP, 0)]);
  const thrMat = new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.8 });
  const thr = new THREE.Line(thrGeo, thrMat);
  thr.computeLineDistances();
  unify.add(thr);
  const thrLabel = tint(stage.label('M_SUSY', [0.55, plotY(44), 0], '', thr), PALETTE.amber);

  // Probe sheet
  const probeGroup = new THREE.Group();
  {
    const g = new THREE.PlaneGeometry(1.6, YTOP);
    g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, basic(PALETTE.white, 0.06, { side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(0, YTOP / 2, 0.3);
    probeGroup.add(m);
    probeGroup.add(segLines([0, 0, 0, 0, YTOP, 0], lineMat(PALETTE.white, 0.6)));
  }
  unify.add(probeGroup);
  const probeLabel = stage.label('', [0, YTOP + 0.55, 0], '', probeGroup);
  probeLabel.element.style.whiteSpace = 'nowrap';
  const probeDots = COUPLING_COLOR.map((c) => {
    const d = new THREE.Mesh(keep(new THREE.SphereGeometry(0.07, 12, 8)), basic(c));
    probeGroup.add(d);
    return d;
  });

  // Closest-approach marker
  const meet = new THREE.Mesh(keep(new THREE.TorusGeometry(0.3, 0.025, 8, 48)), basic(PALETTE.green, 0.9));
  unify.add(meet);
  const meetLabel = stage.label('', [0, 0.55, 0], '', meet);
  meetLabel.element.style.whiteSpace = 'nowrap';

  const cTmp: Triple = [0, 0, 0];
  const other = (m: Model): Model => (m === 'SM' ? 'MSSM' : 'SM');

  function rebuildRibbons(): void {
    for (let k = 0; k < NS; k++) {
      const l = LMIN + ((LMAX - LMIN) * k) / (NS - 1);
      const x = plotX(l);
      couplingsAt(10 ** l, model, msusy, cTmp);
      for (let i = 0; i < 3; i++) {
        const y = plotY(cTmp[i]);
        const r = ribbons[i];
        const o = k * 6;
        r.pos[o] = x; r.pos[o + 1] = y; r.pos[o + 2] = -RIB_W;
        r.pos[o + 3] = x; r.pos[o + 4] = y; r.pos[o + 5] = RIB_W;
        r.linePos[k * 3] = x; r.linePos[k * 3 + 1] = y; r.linePos[k * 3 + 2] = RIB_W;
      }
      couplingsAt(10 ** l, other(model), msusy, cTmp);
      for (let i = 0; i < 3; i++) {
        const r = ribbons[i];
        r.ghostPos[k * 3] = x; r.ghostPos[k * 3 + 1] = plotY(cTmp[i]); r.ghostPos[k * 3 + 2] = -0.3;
      }
    }
    for (const r of ribbons) {
      (r.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.ghostGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      r.geo.computeBoundingSphere();
    }
    // End labels, nudged apart vertically if they crowd
    couplingsAt(10 ** LMAX, model, msusy, cTmp);
    const ys = [0, 1, 2].map((i) => plotY(cTmp[i]));
    const order = [0, 1, 2].sort((a, b) => ys[a] - ys[b]);
    for (let k = 1; k < 3; k++) if (ys[order[k]] - ys[order[k - 1]] < 0.26) ys[order[k]] = ys[order[k - 1]] + 0.26;
    ribbons.forEach((r, i) => r.label.position.set(plotX(LMAX) + 0.95, ys[i], RIB_W));
    ghostNote.element.textContent = `faint lines: ${other(model)} for comparison`;

    const showThr = model === 'MSSM' && msusy > MZ * 1.01;
    thr.visible = showThr;
    thrLabel.visible = showThr;
    thr.position.x = plotX(Math.log10(Math.max(MZ, msusy)));

    const ok = unif.spread < 0.4;
    meet.position.set(plotX(unif.log10mu), plotY(unif.aInv), RIB_W);
    (meet.material as THREE.MeshBasicMaterial).color.setHex(model === 'SM' ? PALETTE.red : ok ? PALETTE.green : PALETTE.amber);
    meetLabel.element.textContent = model === 'SM' ? `closest miss: gap ${unif.spread.toFixed(2)}` : `meet at ${sci(10 ** unif.log10mu)} GeV`;
    meetLabel.element.style.color = css(model === 'SM' ? PALETTE.red : ok ? PALETTE.green : PALETTE.amber);
    placeProbe();
  }

  function placeProbe(): void {
    probeGroup.position.x = plotX(probe);
    couplingsAt(10 ** probe, model, msusy, cTmp);
    for (let i = 0; i < 3; i++) probeDots[i].position.set(0, plotY(cTmp[i]), RIB_W);
    probeLabel.element.innerHTML = `μ = 10${sup(Math.round(probe * 10) / 10).replace('.', '·')} GeV<br>` +
      COUPLING_COLOR.map((c, i) => `<span style="color:${css(c)}">${cTmp[i].toFixed(1)}</span>`).join(' · ');
  }

  // =========================================================================
  // View 3: hierarchy seesaw
  // =========================================================================
  const hier = new THREE.Group();
  hier.visible = false;
  scene.add(hier);
  {
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(0.5, PIVOT_Y - 0.05, 4)), new THREE.MeshStandardMaterial({ color: 0x3a4a6e, roughness: 0.6, metalness: 0.2 }));
    cone.position.y = (PIVOT_Y - 0.05) / 2;
    cone.rotation.y = Math.PI / 4;
    hier.add(cone);
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(9.6, 0.05, 2.2)), basic(PALETTE.grid, 0.9));
    base.position.set(0.6, -0.03, 0);
    hier.add(base);
  }
  const beam = new THREE.Group();
  beam.position.y = PIVOT_Y;
  hier.add(beam);
  beam.add(new THREE.Mesh(keep(new THREE.BoxGeometry(2 * ARM + 0.3, 0.09, 0.28)), new THREE.MeshStandardMaterial({ color: 0xb8c3d9, roughness: 0.4, metalness: 0.5 })));
  const pivotBall = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 16, 12)), basic(PALETTE.white));
  beam.add(pivotBall);

  interface PanObj {
    group: THREE.Group;
    loop: THREE.Mesh;
    dot: THREE.Mesh;
    sign: number;
  }
  const hangPos = new Float32Array(12);
  const hangGeo = new THREE.BufferGeometry();
  hangGeo.setAttribute('position', new THREE.BufferAttribute(hangPos, 3));
  hier.add(new THREE.LineSegments(hangGeo, lineMat(0x8391ab, 0.9)));
  const panGeo = keep(new THREE.CylinderGeometry(0.85, 0.65, 0.08, 40));
  const loopGeo = keep(new THREE.TorusGeometry(0.5, 0.035, 10, 64));
  const dotGeo = keep(new THREE.SphereGeometry(0.09, 14, 10));
  function makePan(sign: number, color: number, fermion: boolean): PanObj {
    const group = new THREE.Group();
    const pan = new THREE.Mesh(panGeo, new THREE.MeshStandardMaterial({ color: 0x2c3852, roughness: 0.5, metalness: 0.4 }));
    group.add(pan);
    const loop = new THREE.Mesh(loopGeo, basic(color, fermion ? 1 : 0.85));
    loop.position.y = 0.6;
    group.add(loop);
    const dot = new THREE.Mesh(dotGeo, basic(0xffffff));
    loop.add(dot);
    if (fermion) {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.scale.setScalar(0.55);
      dot.add(r);
    }
    hier.add(group);
    return { group, loop, dot, sign };
  }
  const topPan = makePan(-1, PALETTE.cyan, true);
  const stopPan = makePan(1, PALETTE.rose, false);
  const topLabel = tint(stage.label('', [0, 1.45, 0], '', topPan.group), PALETTE.cyan);
  const stopLabel = tint(stage.label('', [0, 1.45, 0], '', stopPan.group), PALETTE.rose);
  topLabel.element.style.textAlign = 'center';
  stopLabel.element.style.textAlign = 'center';

  // Leftover weight: sits on the top pan, the side that wins
  const leftover = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1, 1)), new THREE.MeshStandardMaterial({ color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.35, roughness: 0.5 }));
  topPan.group.add(leftover);
  const leftoverLabel = tint(stage.label('', [0, 0, 0.7], '', topPan.group), 0xff9a9a);
  leftoverLabel.element.style.fontSize = '11px';
  leftoverLabel.element.style.whiteSpace = 'nowrap';
  const cancelLabel = stage.label('', [0, PIVOT_Y + 1.35, 0], '', hier);
  cancelLabel.element.style.color = css(PALETTE.violet);

  // Fine-tuning meter
  const meterFillMat = basic(PALETTE.green, 0.95);
  const meterFill = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.17, 0.17, 1, 24)), meterFillMat);
  {
    const tube = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.24, 0.24, METER_H, 24, 1, true)), basic(0x9aa6bd, 0.14, { side: THREE.DoubleSide, depthWrite: false }));
    tube.position.set(METER_X, METER_Y + METER_H / 2, 0);
    hier.add(tube);
    const pts: number[] = [];
    for (let d = 0; d <= METER_DEC; d++) {
      const y = METER_Y + (d / METER_DEC) * METER_H;
      pts.push(METER_X - 0.3, y, 0, METER_X + 0.3, y, 0);
    }
    hier.add(segLines(pts, lineMat(0x8391ab, 0.8)));
    hier.add(segLines([METER_X, 0, 0, METER_X, METER_Y, 0], lineMat(0x3a4a6e, 1)));
    const tick: [number, string][] = [[0, '100%'], [1, '10%'], [2, '1%'], [3, '0.1%'], [4, '0.01%']];
    for (const [d, t] of tick) stage.label(t, [METER_X - 0.75, METER_Y + (d / METER_DEC) * METER_H, 0], d === 2 ? '' : 'muted', hier).element.style.fontSize = '11px';
    stage.label('tuning 1/Δ', [METER_X, METER_Y + METER_H + 0.3, 0], '', hier);
  }
  meterFill.position.x = METER_X;
  hier.add(meterFill);

  // =========================================================================
  // Overlays: legend and corner inset
  // =========================================================================
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: `11px/1.45 ${MONO}`, color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.width = 440;
  inset.height = 400;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '210px', height: '191px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  function drawLegend(): void {
    const sw = (c: number, t: string) => `<div><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${css(c)};margin-right:6px"></i>${t}</div>`;
    const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;
    legend.style.display = '';
    if (view === 'mirror') {
      legend.innerHTML = head('Reading the mirror') +
        '<div>height = mass (log)</div><div>rings = 2 × spin</div>' +
        `<div style="white-space:nowrap"><span style="color:${css(PALETTE.amber)}">●</span> force <span style="color:${css(PALETTE.rose)}">●</span> quark <span style="color:${css(PALETTE.cyan)}">●</span> lepton <span style="color:${css(PALETTE.green)}">●</span> Higgs</div>` +
        '<div>γ, g massless. ν drawn at 0.</div>' +
        '<div style="color:#ff9a9a">red band: LHC limits</div>' +
        '<div style="color:#8391ab">right side: toy masses, unseen</div>';
    } else if (view === 'unify') {
      legend.style.display = 'none';
      legend.innerHTML = head(`One-loop running, ${model}`) +
        sw(PALETTE.cyan, '1/α₁ hypercharge (GUT norm.)') + sw(PALETTE.green, '1/α₂ weak SU(2)') + sw(PALETTE.rose, '1/α₃ strong SU(3)') +
        `<div style="margin-top:4px;color:#8391ab">Start at M_Z: 59.0, 29.6, 8.5.${model === 'MSSM' ? ' Slopes change at M_SUSY.' : ''}</div>`;
    } else {
      legend.innerHTML = head('Higgs mass corrections') +
        sw(PALETTE.cyan, 'top quark loop (fermion, −)') + sw(PALETTE.rose, 'two stop loops (scalars, +)') + sw(PALETTE.red, 'leftover ∝ m²(stop) ln(Λ²/m²)') +
        '<div style="margin-top:4px;color:#8391ab">Δ = |δm_H²| / (m_h²/2). Tuning is 1/Δ.</div>';
    }
  }

  function drawTriangle(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `26px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText(`zoom: meeting, ${model}`, 18, 36);
    // Window around the three pairwise crossings
    const xs = pairCrossings(model, msusy);
    let l0 = unif.log10mu;
    let l1 = unif.log10mu;
    let a0 = unif.aInv;
    let a1 = unif.aInv;
    for (const p of xs) {
      if (!Number.isFinite(p.log10mu)) continue;
      l0 = Math.min(l0, p.log10mu); l1 = Math.max(l1, p.log10mu);
      a0 = Math.min(a0, p.aInv); a1 = Math.max(a1, p.aInv);
    }
    const lc = (l0 + l1) / 2;
    const ac = (a0 + a1) / 2;
    const hl = Math.max(0.3, (l1 - l0) * 0.75);
    const ha = Math.max(0.5, (a1 - a0) * 0.75);
    const x0 = 24;
    const x1 = W - 24;
    const y0 = 56;
    const y1 = H - 76;
    const X = (l: number) => x0 + ((l - (lc - hl)) / (2 * hl)) * (x1 - x0);
    const Y = (a: number) => y1 - ((a - (ac - ha)) / (2 * ha)) * (y1 - y0);
    c.save();
    c.beginPath();
    c.rect(x0, y0, x1 - x0, y1 - y0);
    c.clip();
    // Triangle
    const tri = xs.filter((p) => Number.isFinite(p.log10mu));
    if (tri.length === 3) {
      c.beginPath();
      tri.forEach((p, k) => (k ? c.lineTo(X(p.log10mu), Y(p.aInv)) : c.moveTo(X(p.log10mu), Y(p.aInv))));
      c.closePath();
      c.fillStyle = model === 'SM' ? 'rgba(255,107,107,0.22)' : 'rgba(245,182,66,0.22)';
      c.fill();
    }
    c.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = css(COUPLING_COLOR[i]);
      c.beginPath();
      for (let k = 0; k <= 40; k++) {
        const l = lc - hl + (2 * hl * k) / 40;
        couplingsAt(10 ** l, model, msusy, cTmp);
        const x = X(l);
        const y = Y(cTmp[i]);
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
    c.strokeStyle = '#243049';
    c.lineWidth = 2;
    c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    c.font = `22px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText(`box ±${hl.toFixed(hl < 1 ? 2 : 1)} dec × ±${ha.toFixed(ha < 1 ? 2 : 1)}`, 18, y1 + 28);
    const ok = unif.spread < 0.4;
    c.font = `600 24px ${MONO}`;
    c.fillStyle = model === 'SM' ? css(PALETTE.red) : ok ? css(PALETTE.green) : css(PALETTE.amber);
    c.fillText(`gap ${unif.spread.toFixed(2)} at ${sci(10 ** unif.log10mu)} GeV`, 18, H - 16);
  }

  const CUTS: Cutoff[] = ['1e4', '1e10', '1e16'];
  function drawTuning(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    c.font = `26px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('Δ vs stop mass', 18, 36);
    const x0 = 70;
    const x1 = W - 20;
    const y0 = 58;
    const y1 = H - 80;
    const lm0 = Math.log10(200);
    const lm1 = Math.log10(5000);
    const X = (m: number) => x0 + ((Math.log10(m) - lm0) / (lm1 - lm0)) * (x1 - x0);
    const Y = (d: number) => y1 - (Math.log10(Math.max(1, d)) / METER_DEC) * (y1 - y0);
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0, y1);
    c.lineTo(x1, y1);
    c.stroke();
    c.font = `20px ${MONO}`;
    c.fillStyle = '#8391ab';
    for (let d = 0; d <= METER_DEC; d += 2) c.fillText(`10${sup(d)}`, 18, Y(10 ** d) + 7);
    // 1% line and LHC stop limit
    c.setLineDash([6, 8]);
    c.strokeStyle = '#8391ab';
    c.beginPath();
    c.moveTo(x0, Y(100));
    c.lineTo(x1, Y(100));
    c.stroke();
    c.strokeStyle = css(PALETTE.red);
    c.beginPath();
    c.moveTo(X(LHC_STOP), y0);
    c.lineTo(X(LHC_STOP), y1);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#8391ab';
    c.fillText('1%', x1 - 40, Y(100) - 8);
    c.fillStyle = '#ff9a9a';
    c.fillText('LHC', X(LHC_STOP) + 6, y0 + 18);
    for (const cut of CUTS) {
      const L = Number(cut);
      const on = cut === cutoff;
      c.strokeStyle = on ? css(PALETTE.amber) : 'rgba(131,145,171,0.45)';
      c.lineWidth = on ? 4 : 2;
      c.beginPath();
      for (let k = 0; k <= 50; k++) {
        const m = 10 ** (lm0 + ((lm1 - lm0) * k) / 50);
        const x = X(m);
        const y = Math.max(y0, Y(fineTuning(m, L)));
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(X(Math.max(200, mstop)), Math.max(y0, Y(delta)), 8, 0, TAU);
    c.fill();
    c.font = `20px ${MONO}`;
    c.fillStyle = '#8391ab';
    c.fillText('0.2', x0 - 10, y1 + 26);
    c.fillText('1', X(1000) - 6, y1 + 26);
    c.fillText('5 TeV', x1 - 64, y1 + 26);
    c.font = `600 24px ${MONO}`;
    c.fillStyle = delta > 100 ? css(PALETTE.red) : delta > 10 ? css(PALETTE.amber) : css(PALETTE.green);
    c.fillText(`Δ = ${delta < 10 ? delta.toFixed(1) : delta.toFixed(0)}, tuning ${tuningText()}`, 18, H - 16);
  }

  function drawInset(): void {
    inset.style.display = view === 'mirror' ? 'none' : '';
    if (view === 'unify') drawTriangle();
    else if (view === 'hierarchy') drawTuning();
  }

  // =========================================================================
  // Derived quantities
  // =========================================================================
  function tuningText(): string {
    if (delta < 1) return '> 100% (natural)';
    const pct = 100 / delta;
    return pct >= 10 ? `${pct.toFixed(0)}%` : pct >= 1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(2)}%`;
  }

  function updateMirror(): void {
    PAIRS.forEach((p, i) => (spOrbs[i].target = massY(p.ratio * msusy)));
  }

  function updateHierarchy(): void {
    const L = Number(cutoff);
    delta = fineTuning(mstop, L);
    const q = quadraticPieces(L);
    topLabel.element.innerHTML = `top loop<br>${sci(q.top)} GeV²`;
    stopLabel.element.innerHTML = `stop loops<br>+${sci(q.stop)} GeV²`;
    const lo = stopLeftover(mstop, L);
    leftoverLabel.element.textContent = lo === 0 ? 'no leftover: m_stop = m_top' : `leftover ${sci(lo)} GeV²`;
    const f = Math.min(1, Math.log10(1 + delta) / METER_DEC);
    const s = 0.08 + 0.42 * f;
    leftover.scale.setScalar(s);
    leftover.position.set(0.55, 0.04 + s / 2, 0.15);
    leftover.visible = lo !== 0;
    tiltTarget = 0.34 * f;
    const fill = Math.max(0.001, Math.min(1, Math.log10(Math.max(1, delta)) / METER_DEC));
    meterFill.scale.y = fill * METER_H;
    meterFill.position.y = METER_Y + (fill * METER_H) / 2;
    meterFillMat.color.setHex(delta > 100 ? PALETTE.red : delta > 10 ? PALETTE.amber : PALETTE.green);
    cancelLabel.element.textContent = `Λ = ${cutoff === '1e4' ? '10 TeV' : `10${sup(Number(cutoff.slice(2)))} GeV`}: Λ² pieces cancel exactly`;
  }

  // =========================================================================
  // Per-frame animation
  // =========================================================================
  let tilt = 0;
  let tiltTarget = 0;
  const vA = new THREE.Vector3();

  function frameMirror(dt: number, t: number): void {
    const k = 1 - Math.exp(-dt * 4);
    let moved = false;
    for (let i = 0; i < PAIRS.length; i++) {
      const a = smOrbs[i];
      const b = spOrbs[i];
      if (Math.abs(b.target - b.y) > 1e-4) {
        b.y += (b.target - b.y) * k;
        moved = true;
      }
      const ya = a.y + 0.05 * Math.sin(1.1 * t + a.phase);
      const yb = b.y + 0.05 * Math.sin(1.1 * t + b.phase);
      a.group.position.y = ya;
      b.group.position.y = yb;
      for (let r = 0; r < a.rings.length; r++) a.rings[r].rotation.z += dt * (1.2 + 0.5 * r);
      for (let r = 0; r < b.rings.length; r++) b.rings[r].rotation.z -= dt * (0.9 + 0.5 * r);
      if (b.shell) b.shell.rotation.y += dt * 0.4;
      const fl = b.flash > 0 ? (b.flash -= dt) : 0;
      b.group.scale.setScalar(1 + 0.35 * Math.max(0, fl));
      const o = i * 6;
      pairLinePos[o] = a.x; pairLinePos[o + 1] = ya; pairLinePos[o + 2] = 0;
      pairLinePos[o + 3] = b.x; pairLinePos[o + 4] = yb; pairLinePos[o + 5] = 0;
    }
    (pairLineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (moved) pairLineGeo.computeBoundingSphere();
    // Q spark
    sparkU += dt / 1.1;
    if (sparkU >= 1) {
      const target = sparkDir > 0 ? spOrbs[sparkPair] : smOrbs[sparkPair];
      target.flash = 0.5;
      sparkU = 0;
      sparkDir = -sparkDir;
      if (sparkDir > 0) sparkPair = (sparkPair + 3) % PAIRS.length;
    }
    const a = smOrbs[sparkPair].group.position;
    const b = spOrbs[sparkPair].group.position;
    const u = sparkDir > 0 ? sparkU : 1 - sparkU;
    const e = u * u * (3 - 2 * u);
    vA.lerpVectors(a, b, e);
    spark.position.copy(vA);
    sparkHalo.scale.setScalar(1 + 0.3 * Math.sin(t * 9));
  }

  function frameUnify(t: number): void {
    const s = 1 + 0.12 * Math.sin(t * 3);
    meet.scale.setScalar(s);
    meet.rotation.y = t * 0.8;
  }

  function frameHier(dt: number, t: number): void {
    tilt += (tiltTarget - tilt) * (1 - Math.exp(-dt * 3));
    const wob = 0.004 * Math.sin(t * 1.7);
    beam.rotation.z = tilt + wob;
    const c = Math.cos(beam.rotation.z);
    const s = Math.sin(beam.rotation.z);
    const pans = [topPan, stopPan];
    for (let k = 0; k < 2; k++) {
      const p = pans[k];
      const ex = p.sign * ARM * c;
      const ey = PIVOT_Y + p.sign * ARM * s;
      p.group.position.set(ex, ey - HANG, 0);
      const o = k * 6;
      hangPos[o] = ex; hangPos[o + 1] = ey; hangPos[o + 2] = 0;
      hangPos[o + 3] = ex; hangPos[o + 4] = ey - HANG + 0.04; hangPos[o + 5] = 0;
      const w = t * (k === 0 ? 2.4 : -2.4);
      p.dot.position.set(0.5 * Math.cos(w), 0.5 * Math.sin(w), 0);
      p.loop.rotation.y = 0.35 * Math.sin(t * 0.5 + k);
    }
    (hangGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  stage.onFrame((dt, t) => {
    if (view === 'mirror') frameMirror(dt, t);
    else if (view === 'unify') frameUnify(t);
    else frameHier(dt, t);
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'mirror', label: 'Mirror world' }, { value: 'unify', label: 'Unification' }, { value: 'hierarchy', label: 'Hierarchy' }],
    onChange: (v) => setView(v),
  });

  ui.section('Supersymmetry breaking');
  ui.slider({
    key: 'msusy', label: 'SUSY scale M_SUSY', min: Math.log10(0.1), max: Math.log10(20), step: 0.01, value: Math.log10(msusy / 1000),
    format: (v) => fmtTeV(1000 * 10 ** v),
    onInput: (v) => {
      msusy = Math.max(MZ, 1000 * 10 ** v);
      updateMirror();
      unif = unification(model, msusy);
      rebuildRibbons();
      updateReadouts();
      if (view !== 'hierarchy') drawInset();
    },
  });
  const rGl = ui.readout('mgluino', 'gluino (toy)');
  const rLhc = ui.readout('lhc', 'vs LHC limit');

  ui.section('Unification');
  const toUnify = () => { if (view !== 'unify') viewCtl.set('unify'); };
  ui.select<Model>({
    key: 'model', label: 'Running with', value: model,
    options: [{ value: 'SM', label: 'Standard Model' }, { value: 'MSSM', label: 'MSSM' }],
    onChange: (v) => {
      model = v;
      unif = unification(model, msusy);
      rebuildRibbons();
      updateReadouts();
      drawLegend();
      toUnify();
      drawInset();
    },
  });
  ui.slider({
    key: 'probe', label: 'Probe scale log₁₀ μ', min: LMIN, max: LMAX, step: 0.05, value: probe,
    format: (v) => `10^${v.toFixed(2)} GeV`,
    onInput: (v) => { probe = v; placeProbe(); toUnify(); },
  });
  ui.legend(COUPLING_COLOR.map((c, i) => ({ color: css(c), label: ['1/α₁ hypercharge', '1/α₂ weak', '1/α₃ strong'][i] })));
  const rGut = ui.readout('mgut', 'closest approach');
  const rMis = ui.readout('mismatch', 'gap in 1/α');
  const rAg = ui.readout('agut', '1/α there');

  ui.section('Hierarchy');
  const toHier = () => { if (view !== 'hierarchy') viewCtl.set('hierarchy'); };
  ui.slider({
    key: 'mstop', label: 'Stop mass', min: Math.log10(MT / 1000), max: Math.log10(5), step: 0.005, value: Math.log10(mstop / 1000),
    format: (v) => (Math.abs(1000 * 10 ** v - MT) < 1 ? `${MT} GeV (= top)` : fmtTeV(1000 * 10 ** v)),
    onInput: (v) => { mstop = Math.max(MT, 1000 * 10 ** v); updateHierarchy(); updateReadouts(); toHier(); drawInset(); },
  });
  ui.select<Cutoff>({
    key: 'cutoff', label: 'Breaking passed on at Λ', value: cutoff,
    options: [{ value: '1e4', label: '10 TeV' }, { value: '1e10', label: '10¹⁰ GeV' }, { value: '1e16', label: '10¹⁶ GeV' }],
    onChange: (v) => { cutoff = v; updateHierarchy(); updateReadouts(); toHier(); drawInset(); },
  });
  const rDel = ui.readout('delta', 'Δ');
  const rTun = ui.readout('tuning', 'tuning 1/Δ');
  const rNo = ui.readout('nosusy', 'no SUSY: 1 part in');
  ui.note('Masses in the mirror are a toy spectrum set by one SUSY scale. Running is one loop. The tuning uses only the leading stop logarithm with y<sub>t</sub> = 0.94.');

  function updateReadouts(): void {
    const gl = PAIRS[4].ratio * msusy;
    rGl(fmtTeV(gl));
    rLhc(gl >= LHC_GLUINO ? 'above ≈2.2 TeV' : 'likely excluded');
    rGut(`${sci(10 ** unif.log10mu)} GeV`);
    rMis(unif.spread.toFixed(2));
    rAg(unif.aInv.toFixed(1));
    rDel(delta < 10 ? delta.toFixed(1) : delta.toFixed(0));
    rTun(tuningText());
    rNo(sci(fineTuningNoSusy(Number(cutoff)), 0));
  }

  function setView(v: View): void {
    view = v;
    mirror.visible = v === 'mirror';
    unify.visible = v === 'unify';
    hier.visible = v === 'hierarchy';
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.2);
    drawLegend();
    drawInset();
  }

  updateMirror();
  for (const o of spOrbs) o.y = o.target;
  rebuildRibbons();
  updateHierarchy();
  tilt = tiltTarget;
  updateReadouts();
  drawLegend();
  drawInset();
  frameMirror(0, 0);
  frameHier(0, 0);

  return {
    state: () => ({
      view, model,
      msusy: msusy / 1000,
      mgluino: (PAIRS[4].ratio * msusy) / 1000,
      probe,
      mgutLog: unif.log10mu,
      mismatch: unif.spread,
      agut: unif.aInv,
      mstop,
      cutoff,
      delta,
      tuningPct: delta > 0 ? 100 / delta : 100,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      stage.dispose();
      for (const d of disposables) d.dispose();
      ringMat.dispose();
      ghostRingMat.dispose();
    },
  };
}

const topic: Topic = {
  id: 'supersymmetry',
  number: 52,
  title: 'Supersymmetry',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'A mirror partner for every particle, still unseen.',
  content,
  mount,
};

export default topic;
