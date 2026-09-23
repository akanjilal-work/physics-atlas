import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  GRID_L, GRID_N, TunnelSim, packetEnergy, packetT, region, segments, type PotentialKind, type SimParams,
} from './physics.ts';

type View = '3d' | 'side';

const DT = 0.05; // split-step time step
const XV = 48; // visible half-width in physics units
const SX = 0.15; // scene units per physics unit
const HB = 2.2; // scene height of V0
const DZ = 1.5; // half depth of the potential blocks
const FLOOR = -1.6; // floor height
const WELL_SCALE = 0.6; // wells are drawn shallower so they stay above the floor
const RH = 1.1; // helix radius of the initial packet peak
const RMAX = 2.1; // cap on helix radius
const HDEN = 1.7; // scene height of the initial density peak
const MEASURE_WIDTH = 0.8; // width of the collapsed packet

const CAM_3D: [number, number, number] = [-3.4, 4.0, 8.6];
const TGT_3D: [number, number, number] = [0.6, 0.2, 0];
const CAM_SIDE: [number, number, number] = [0, 0.9, 14.5];
const TGT_SIDE: [number, number, number] = [0, 0.9, 0];

/** HSV (s = 0.85) to linear-ish RGB written straight into a Float32Array. */
function hueInto(h: number, v: number, out: Float32Array, o: number): void {
  const s = 0.85;
  const hh = (h - Math.floor(h)) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r = v, g = t, b = p;
  switch (i) {
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  out[o] = r;
  out[o + 1] = g;
  out[o + 2] = b;
}

function stripIndex(m: number): THREE.BufferAttribute {
  const idx = new Uint16Array((m - 1) * 6);
  for (let i = 0; i < m - 1; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.set([a, b, c, b, d, c], i * 6);
  }
  return new THREE.BufferAttribute(idx, 1);
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_3D, target: TGT_3D, fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let kind: PotentialKind = 'barrier';
  let V0 = 1;
  let frac = 0.6; // nominal E / V0 = (k0^2/2) / V0
  let width = 1.2;
  let sigma = 4;
  let speed = 6;
  let playing = true;
  let showHelix = true;
  let view: View = '3d';

  const params = (): SimParams => {
    const [xL] = region(kind, width);
    return {
      kind, V0, a: width, sigma, dt: DT, absorb: true,
      k0: Math.sqrt(2 * frac * V0),
      x0: -(Math.abs(xL) + 3.5 * sigma + 3),
    };
  };
  const sim = new TunnelSim(params(), GRID_N, GRID_L);

  // Visible slice of the grid
  const i0 = Math.round((GRID_L / 2 - XV) / sim.dx);
  const i1 = GRID_N - i0;
  const M = i1 - i0 + 1;
  const xs = new Float32Array(M);
  for (let j = 0; j < M; j++) xs[j] = sim.x[i0 + j] * SX;

  // --- Floor
  const grid = makeGrid(16, 32);
  grid.position.y = FLOOR;
  scene.add(grid);

  // --- Helix: a ribbon from the x axis out to (Re psi, Im psi), plus its bright edge
  const helix = new THREE.Group();
  scene.add(helix);
  const ribPos = new Float32Array(M * 2 * 3);
  const ribCol = new Float32Array(M * 2 * 3);
  const ribGeo = new THREE.BufferGeometry();
  const ribPosAttr = new THREE.BufferAttribute(ribPos, 3).setUsage(THREE.DynamicDrawUsage);
  const ribColAttr = new THREE.BufferAttribute(ribCol, 3).setUsage(THREE.DynamicDrawUsage);
  ribGeo.setAttribute('position', ribPosAttr);
  ribGeo.setAttribute('color', ribColAttr);
  ribGeo.setIndex(stripIndex(M));
  const ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
  ribbon.frustumCulled = false;
  helix.add(ribbon);
  const edgePos = new Float32Array(M * 3);
  const edgeCol = new Float32Array(M * 3);
  const edgeGeo = new THREE.BufferGeometry();
  const edgePosAttr = new THREE.BufferAttribute(edgePos, 3).setUsage(THREE.DynamicDrawUsage);
  const edgeColAttr = new THREE.BufferAttribute(edgeCol, 3).setUsage(THREE.DynamicDrawUsage);
  edgeGeo.setAttribute('position', edgePosAttr);
  edgeGeo.setAttribute('color', edgeColAttr);
  const edge = new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  edge.frustumCulled = false;
  helix.add(edge);
  const axisGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-XV * SX, 0, 0, XV * SX, 0, 0], 3));
  helix.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0x56627c, transparent: true, opacity: 0.8 })));
  for (let j = 0; j < M; j++) {
    ribPos[j * 6] = xs[j];
    ribPos[j * 6 + 3] = xs[j];
    edgePos[j * 3] = xs[j];
  }

  // --- Probability density on the floor: a glowing area of half-width proportional to |psi|^2
  const floorPos = new Float32Array(M * 2 * 3);
  const floorCol = new Float32Array(M * 2 * 3);
  const floorGeo = new THREE.BufferGeometry();
  const floorPosAttr = new THREE.BufferAttribute(floorPos, 3).setUsage(THREE.DynamicDrawUsage);
  const floorColAttr = new THREE.BufferAttribute(floorCol, 3).setUsage(THREE.DynamicDrawUsage);
  floorGeo.setAttribute('position', floorPosAttr);
  floorGeo.setAttribute('color', floorColAttr);
  floorGeo.setIndex(stripIndex(M));
  const floorArea = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  floorArea.position.y = FLOOR + 0.01;
  floorArea.frustumCulled = false;
  scene.add(floorArea);
  for (let j = 0; j < M; j++) {
    floorPos[j * 6] = xs[j];
    floorPos[j * 6 + 3] = xs[j];
  }

  // --- Classic |psi|^2 plot on the back wall, shown in the side view
  const curtain = new THREE.Group();
  curtain.position.z = -DZ - 0.05;
  scene.add(curtain);
  const curPos = new Float32Array(M * 2 * 3);
  const curGeo = new THREE.BufferGeometry();
  const curPosAttr = new THREE.BufferAttribute(curPos, 3).setUsage(THREE.DynamicDrawUsage);
  curGeo.setAttribute('position', curPosAttr);
  curGeo.setIndex(stripIndex(M));
  const curMesh = new THREE.Mesh(curGeo, new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  curMesh.frustumCulled = false;
  curtain.add(curMesh);
  const curTopPos = new Float32Array(M * 3);
  const curTopGeo = new THREE.BufferGeometry();
  const curTopAttr = new THREE.BufferAttribute(curTopPos, 3).setUsage(THREE.DynamicDrawUsage);
  curTopGeo.setAttribute('position', curTopAttr);
  const curTop = new THREE.Line(curTopGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan }));
  curTop.frustumCulled = false;
  curtain.add(curTop);
  for (let j = 0; j < M; j++) {
    curPos[j * 6] = xs[j];
    curPos[j * 6 + 3] = xs[j];
    curTopPos[j * 3] = xs[j];
  }
  const baseGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-XV * SX, 0, 0, XV * SX, 0, 0], 3));
  curtain.add(new THREE.Line(baseGeo, new THREE.LineBasicMaterial({ color: 0x56627c })));
  const curLabel = stage.label('|ψ|²  probability density', [-XV * SX + 1.6, -0.35, 0], 'muted', curtain);

  // --- Potential blocks, rebuilt only when the potential changes
  const blocks = new THREE.Group();
  scene.add(blocks);
  const blockMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const blockEdgeMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.9 });
  const vLabel = stage.label('V₀', [0, HB + 0.3, 0], 'big');

  function buildBlocks(): void {
    for (const c of [...blocks.children]) {
      blocks.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    for (const s of segments(kind, V0, width, GRID_L)) {
      const x0 = Math.max(-XV, s.x0) * SX;
      const x1 = Math.min(XV, s.x1) * SX;
      const h = (s.V / V0) * HB * (s.V < 0 ? WELL_SCALE : 1);
      const g = new THREE.BoxGeometry(Math.max(0.004, x1 - x0), Math.abs(h), 2 * DZ);
      const mesh = new THREE.Mesh(g, blockMat);
      mesh.position.set((x0 + x1) / 2, h / 2, 0);
      mesh.renderOrder = 1;
      blocks.add(mesh);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), blockEdgeMat);
      e.position.copy(mesh.position);
      blocks.add(e);
    }
    const segs = segments(kind, V0, width, GRID_L);
    const s0 = segs[segs.length - 1];
    const lx = kind === 'step' ? 2.2 : (Math.max(-XV, s0.x0) + Math.min(XV, s0.x1)) / 2 * SX;
    vLabel.position.set(lx, kind === 'well' ? -HB * WELL_SCALE - 0.3 : HB + 0.35, DZ);
    vLabel.element.textContent = kind === 'well' ? `−V₀ = −${V0.toFixed(2)}` : `V₀ = ${V0.toFixed(2)}`;
  }

  // --- Energy plane and line
  const energy = new THREE.Group();
  scene.add(energy);
  const ePlane = new THREE.Mesh(new THREE.PlaneGeometry(2 * XV * SX, 2 * DZ), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide }));
  ePlane.rotation.x = -Math.PI / 2;
  energy.add(ePlane);
  const eLineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    -XV * SX, 0, DZ, XV * SX, 0, DZ,
    -XV * SX, 0, -DZ - 0.04, XV * SX, 0, -DZ - 0.04,
  ], 3));
  energy.add(new THREE.LineSegments(eLineGeo, new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.25, gapSize: 0.12 })));
  (energy.children[1] as THREE.LineSegments).computeLineDistances();
  const eLabel = stage.label('E', [-XV * SX + 2.0, 0.3, DZ], 'big', energy);
  eLabel.element.style.color = css(PALETTE.amber);

  // --- Measurement marker
  const markerMat = new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.6, 16, 1, true), markerMat);
  marker.position.y = FLOOR + 3.3;
  marker.visible = false;
  scene.add(marker);
  const markerLabel = stage.label('', [0, 4.2, 0], 'big');
  markerLabel.visible = false;
  let flash = 0;

  // --- Scene labels for R and T
  const rLabel = stage.label('← reflected', [-XV * SX + 2.4, FLOOR + 0.3, DZ + 0.4], 'muted');
  const tLabel = stage.label('transmitted →', [XV * SX - 2.6, FLOOR + 0.3, DZ + 0.4], 'muted');

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">How to read the helix</div>
<div>ψ is a complex number at each x. It spirals around the axis: Re ψ up, Im ψ sideways.</div>
<div>Radius = |ψ|. Colour = phase</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,hsl(0,85%,55%),hsl(60,85%,55%),hsl(120,85%,55%),hsl(180,85%,55%),hsl(240,85%,55%),hsl(300,85%,55%),hsl(360,85%,55%))"></div>
<div><span style="color:${css(PALETTE.cyan)}">Glow</span> = |ψ|², where it could be found. <span style="color:${css(PALETTE.amber)}">Dashed</span> = energy E. <span style="color:${css(PALETTE.violet)}">Block</span> = V(x).</div>`;
  viewport.appendChild(legend);

  // --- Simulation bookkeeping
  let ampScale = 1;
  let denScale = 1;
  let Tpred = 0;
  let Tsingle = 0;
  let EV = 0;
  let measured = false;
  let measureCount = 0;
  let lastMeasureX = NaN;
  let measureSide = 'none';
  let measureEV = 0;
  let measurePotential = '';

  function reset(): void {
    const p = params();
    sim.configure(p);
    const peak = Math.pow(2 * Math.PI * sigma * sigma, -0.25);
    ampScale = RH / peak;
    denScale = HDEN / (peak * peak);
    const segsA = segments(kind, V0, width, 1e9);
    Tpred = packetT(p.k0, sigma, segsA);
    Tsingle = packetT(p.k0, sigma, segments('barrier', V0, width, 1e9));
    EV = packetEnergy(p.k0, sigma) / V0;
    energy.position.y = EV * HB;
    helix.position.y = EV * HB;
    eLabel.element.textContent = `E = ${EV.toFixed(2)} V₀`;
    measured = false;
    measureSide = 'none';
    lastMeasureX = NaN;
    buildBlocks();
    draw();
  }

  function draw(): void {
    const { re, im } = sim;
    for (let j = 0; j < M; j++) {
      const i = i0 + j;
      const a = re[i];
      const b = im[i];
      const mod = Math.sqrt(a * a + b * b);
      let y = a * ampScale;
      let z = b * ampScale;
      const r = mod * ampScale;
      if (r > RMAX) {
        y *= RMAX / r;
        z *= RMAX / r;
      }
      const o = j * 6;
      ribPos[o + 4] = y;
      ribPos[o + 5] = z;
      edgePos[j * 3 + 1] = y;
      edgePos[j * 3 + 2] = z;
      const hue = Math.atan2(b, a) / (2 * Math.PI) + 1;
      const bright = Math.min(1, 0.25 + r / RH);
      hueInto(hue, bright, ribCol, o + 3);
      hueInto(hue, bright * 0.25, ribCol, o);
      hueInto(hue, 1, edgeCol, j * 3);
      // density
      const d = mod * mod * denScale;
      if (view === '3d') {
        const w = Math.min(1.8, d * 0.6);
        floorPos[o + 2] = -w;
        floorPos[o + 5] = w;
        const g = Math.min(1, d / HDEN);
        const c = 0.1 + 0.45 * g;
        floorCol[o] = floorCol[o + 3] = 0.31 * c;
        floorCol[o + 1] = floorCol[o + 4] = 0.82 * c;
        floorCol[o + 2] = floorCol[o + 5] = 0.91 * c;
      } else {
        const h = Math.min(4.5, d);
        curPos[o + 4] = h;
        curTopPos[j * 3 + 1] = h;
      }
    }
    ribPosAttr.needsUpdate = true;
    ribColAttr.needsUpdate = true;
    edgePosAttr.needsUpdate = true;
    edgeColAttr.needsUpdate = true;
    if (view === '3d') {
      floorPosAttr.needsUpdate = true;
      floorColAttr.needsUpdate = true;
    } else {
      curPosAttr.needsUpdate = true;
      curTopAttr.needsUpdate = true;
    }
  }

  function measure(): void {
    const xm = sim.measure(Math.random(), MEASURE_WIDTH);
    const far = !Number.isFinite(xm);
    measureCount++;
    measured = true;
    lastMeasureX = far ? Math.sign(xm) * (GRID_L / 2) : xm;
    measureSide = xm < sim.xL ? 'left' : xm >= sim.xR ? 'right' : 'inside';
    measureEV = EV;
    measurePotential = kind;
    // Keep the old helix scale (with the radius cap) so the jump to a narrow spike is visible.
    marker.position.x = Math.max(-XV, Math.min(XV, lastMeasureX)) * SX;
    marker.visible = true;
    markerLabel.visible = true;
    markerLabel.position.set(marker.position.x - Math.sign(marker.position.x) * (far ? 2 : 0), FLOOR + 0.9, DZ);
    markerLabel.element.textContent = far
      ? `found far ${measureSide}, already off screen`
      : `found at x = ${xm.toFixed(1)} (${measureSide})`;
    flash = 2.2;
    draw();
  }

  // --- Frame loop
  let labelTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      sim.step(speed);
      draw();
    }
    const o = sim.observe();
    if (flash > 0) {
      flash = Math.max(0, flash - dt);
      markerMat.opacity = Math.min(1, flash) * 0.9;
      if (flash === 0) {
        marker.visible = false;
        markerLabel.visible = false;
      }
    }
    labelTimer += dt;
    if (labelTimer > 0.25) {
      labelTimer = 0;
      rLabel.element.textContent = `← reflected  R = ${o.Rout.toFixed(2)}`;
      tLabel.element.textContent = `transmitted  T = ${o.T.toFixed(2)} →`;
    }
    updateReadouts(o.T, o.Rout, o.norm);
  });

  function applyView(): void {
    helix.visible = showHelix && view === '3d';
    floorArea.visible = view === '3d';
    curtain.visible = view === 'side';
    curLabel.visible = view === 'side';
    ePlane.visible = view === '3d';
    draw();
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
    { label: 'Measure position', key: 'measure', onClick: () => measure() },
  ]);
  ui.slider({ key: 'speed', label: 'Speed (steps per frame)', min: 1, max: 40, step: 1, value: speed, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'Camera', value: view,
    options: [{ value: '3d', label: '3D helix' }, { value: 'side', label: 'Side view (probability)' }],
    onChange: (v) => {
      view = v;
      applyView();
      if (v === '3d') stage.flyTo(CAM_3D, TGT_3D);
      else stage.flyTo(CAM_SIDE, TGT_SIDE);
    },
  });
  ui.toggle({ key: 'helix', label: 'Show helix (3D view)', value: showHelix, onChange: (v) => { showHelix = v; applyView(); } });

  ui.section('Potential and packet (resets)');
  ui.select<PotentialKind>({
    key: 'potential', label: 'Potential', value: kind,
    options: [
      { value: 'barrier', label: 'Barrier' },
      { value: 'double', label: 'Double barrier' },
      { value: 'step', label: 'Step' },
      { value: 'well', label: 'Well' },
    ],
    onChange: (v) => { kind = v; reset(); },
  });
  ui.slider({ key: 'energy', label: 'Energy E / V₀', min: 0.1, max: 2, step: 0.005, value: frac, format: (v) => v.toFixed(3), onInput: (v) => { frac = v; reset(); } });
  ui.slider({ key: 'V0', label: 'Barrier height V₀', min: 0.5, max: 3, step: 0.05, value: V0, format: (v) => v.toFixed(2), onInput: (v) => { V0 = v; reset(); } });
  ui.slider({ key: 'width', label: 'Barrier width a', min: 0.2, max: 4, step: 0.05, value: width, format: (v) => v.toFixed(2), onInput: (v) => { width = v; reset(); } });
  ui.slider({ key: 'sigma', label: 'Packet width σ', min: 2, max: 10, step: 0.5, value: sigma, format: (v) => v.toFixed(1), onInput: (v) => { sigma = v; reset(); } });
  ui.note('Units: ħ = m = 1. The double barrier has a fixed gap of 4 between its walls. The energy slider sets the packet momentum k₀ through E = k₀²/2.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rTm = ui.readout('T', 'T measured');
  const rRm = ui.readout('R', 'R measured');
  const rTp = ui.readout('Tpred', 'T predicted');
  const rEV = ui.readout('EV', 'E / V₀');
  const rN = ui.readout('norm', 'norm (should be 1)');
  const rMeas = ui.readout('measures', 'measurements');
  ui.legend([
    { color: css(PALETTE.cyan), label: '|ψ|² density' },
    { color: css(PALETTE.violet), label: 'potential V(x)' },
    { color: css(PALETTE.amber), label: 'packet energy E' },
  ]);

  let Tm = 0;
  let Rm = 0;
  let normV = 1;
  function updateReadouts(T: number, R: number, norm: number): void {
    Tm = T;
    Rm = R;
    normV = norm;
    rT(sim.t.toFixed(1));
    rTm(T.toFixed(3));
    rRm(R.toFixed(3));
    rTp(measured ? 'n/a after measuring' : Tpred.toFixed(3));
    rEV(EV.toFixed(3));
    rN(norm.toFixed(9));
    rMeas(measureCount);
  }

  reset();
  applyView();

  return {
    state: () => ({
      t: sim.t,
      potential: kind,
      EV,
      V0,
      width,
      sigma,
      T: Tm,
      R: Rm,
      Tpred,
      Tsingle,
      norm: normV,
      playing,
      measureCount,
      lastMeasureX: Number.isFinite(lastMeasureX) ? lastMeasureX : 0,
      measureSide,
      measureEV,
      measurePotential,
    }),
    dispose: () => {
      legend.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'quantum-tunneling',
  number: 12,
  title: 'Quantum Tunneling',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'A particle passes through a wall it does not have the energy to climb.',
  content,
  mount,
};

export default topic;
