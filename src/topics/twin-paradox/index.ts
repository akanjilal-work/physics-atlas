import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  G_LY, buildTrip, countUpTo, earthTimeSimultaneous, eventAtT, eventAtTau, gapSplit, integrateProperTime,
  niceStep, pulseTable, sampleWorldline, turnaroundSweep, wevent,
  type PulseTable, type Trip, type TripMode, type TripParams,
} from './physics.ts';

// Three.js axes: x = space (light-years), y = ct (years), z = depth.
// The diagram is rescaled so the whole trip always fills the same height, with equal scales on both axes,
// so light still runs at 45°.
const H = 8; // world height of the diagram (t = 0 .. T)
const X0 = -2.2; // world x of Earth
const SHIP_Y = -1.05; // world y of the "space" strip under the diagram
const N_WL = 721; // worldline samples (odd, so the instant corner is sampled exactly)
const MAX_TICKS = 64; // per twin
const MAX_PULSES = 64; // drawn per twin
const MAX_SIM = MAX_TICKS + 16;
const MAX_HYP = 10;
const HYP_PTS = 64;
const MAX_LABELS = 10;
const DURATION = 16; // seconds for a whole trip at speed 1
const CAM: [number, number, number] = [-2.2, 5.0, 14.6];
const TGT: [number, number, number] = [-0.5, 3.55, 0];

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: TGT, fov: 42 });
  const { scene, renderer } = stage;

  const p: TripParams = { mode: 'instant', beta: 0.8, D: 4, a: G_LY, coast: true };
  let aG = 1;
  let speed = 1;
  let playing = true;
  let completed = false;
  let showPulses = false;
  let showSim = true;
  let showHyp = false;
  let t = 0; // Earth time now

  let trip: Trip = buildTrip(p);
  let pulses: PulseTable = pulseTable(trip);
  let s = H / trip.T; // world units per year
  let eStep = 1;
  let tStep = 1;
  let tauNumeric = trip.tau;
  let cruiseShare = 1;

  // ---------------------------------------------------------------
  // Line helpers
  // ---------------------------------------------------------------
  const lineMats: LineMaterial[] = [];
  interface FatDyn { line: Line2; set(pts: Float32Array, n: number): void }
  /** Fat polyline with a fixed capacity, updated in place. */
  function fatDyn(maxPts: number, color: number, width: number, opacity = 1): FatDyn {
    const g = new LineGeometry();
    g.setPositions(new Float32Array(maxPts * 3));
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    lineMats.push(m);
    const line = new Line2(g, m);
    line.frustumCulled = false;
    const data = (g.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    const arr = data.array as Float32Array;
    return {
      line,
      set(pts, n) {
        for (let i = 0; i < n - 1; i++) {
          const a = i * 6;
          const b = i * 3;
          arr[a] = pts[b]; arr[a + 1] = pts[b + 1]; arr[a + 2] = pts[b + 2];
          arr[a + 3] = pts[b + 3]; arr[a + 4] = pts[b + 4]; arr[a + 5] = pts[b + 5];
        }
        g.instanceCount = Math.max(0, n - 1);
        data.needsUpdate = true;
      },
    };
  }
  function fatStatic(pts: number[], color: number, width: number, opacity = 1): Line2 {
    const g = new LineGeometry();
    g.setPositions(pts);
    const m = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    lineMats.push(m);
    const l = new Line2(g, m);
    l.frustumCulled = false;
    return l;
  }
  /** Thin line segments with a fixed capacity and optional vertex colours. */
  function segs(maxSegs: number, color: number, opacity: number, vertexColors = false): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegs * 6), 3).setUsage(THREE.DynamicDrawUsage));
    if (vertexColors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxSegs * 6), 3));
    g.setDrawRange(0, 0);
    const m = new THREE.LineBasicMaterial({ color: vertexColors ? 0xffffff : color, vertexColors, transparent: true, opacity, depthWrite: false });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    return l;
  }
  const wx = (x: number) => X0 + x * s;
  const wy = (tt: number) => tt * s;

  // ---------------------------------------------------------------
  // Static furniture
  // ---------------------------------------------------------------
  const diagram = new THREE.Group();
  scene.add(diagram);

  const floor = makeGrid(16, 32);
  floor.position.set(0, SHIP_Y - 0.45, 0);
  scene.add(floor);

  // Year grid behind the diagram, rebuilt when the scale changes.
  const yearGrid = segs(64, PALETTE.gridMajor, 0.55);
  yearGrid.position.z = -0.02;
  diagram.add(yearGrid);

  // t = 0 axis and the light diamond: all possible round trips live inside it.
  diagram.add(fatStatic([X0 - 0.3, 0, 0, X0 + H / 2 + 0.4, 0, 0], 0x55627e, 1.4));
  diagram.add(fatStatic([X0, 0, 0, X0 + H / 2, H / 2, 0, X0, H, 0], PALETTE.violet, 1.6, 0.8));
  {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([X0, 0, -0.03, X0 + H / 2, H / 2, -0.03, X0, H, -0.03], 3));
    diagram.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })));
  }
  stage.label('light', [X0 + H / 4 + 0.35, H / 4 - 0.1, 0], 'muted', diagram);
  stage.label('light', [X0 + H / 4 + 0.35, (3 * H) / 4 + 0.1, 0], 'muted', diagram);
  stage.label('ct (years)', [X0, H + 0.75, 0], 'big', diagram);
  stage.label('x (light-years)', [X0 + H / 2 + 1.0, 0, 0], 'muted', diagram);
  const reunionLabel = stage.label('reunion', [X0, H + 0.35, 0], '', diagram);
  reunionLabel.center.set(-0.08, 0.5);

  // Earth worldline: always a vertical line in world space.
  diagram.add(fatStatic([X0, 0, 0, X0, H, 0], PALETTE.cyan, 3.4));
  // Traveller worldline.
  const wlBuf = new Float64Array(N_WL * 2);
  const wlPts = new Float32Array(N_WL * 3);
  const travWL = fatDyn(N_WL, PALETTE.amber, 3.4);
  diagram.add(travWL.line);

  // Year labels along Earth's worldline.
  const yearLabels: CSS2DObject[] = [];
  for (let i = 0; i < MAX_LABELS; i++) {
    const l = stage.label('', [X0, 0, 0], 'muted', diagram);
    l.center.set(1.15, 0.5);
    yearLabels.push(l);
  }

  // Proper-year ticks on both worldlines.
  const ticks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial(), MAX_TICKS * 2);
  ticks.frustumCulled = false;
  {
    const cC = new THREE.Color(PALETTE.cyan);
    const cA = new THREE.Color(PALETTE.amber);
    for (let i = 0; i < MAX_TICKS * 2; i++) ticks.setColorAt(i, i < MAX_TICKS ? cC : cA);
  }
  diagram.add(ticks);

  // Invariant hyperbolae t² − x² = τ² from the departure event.
  const hypGroup = new THREE.Group();
  hypGroup.visible = showHyp;
  diagram.add(hypGroup);
  const hypLines: THREE.Line[] = [];
  const hypLabels: CSS2DObject[] = [];
  for (let i = 0; i < MAX_HYP; i++) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(HYP_PTS * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.6, depthWrite: false }));
    l.frustumCulled = false;
    hypGroup.add(l);
    hypLines.push(l);
    const lab = stage.label('', [0, 0, 0], 'muted', hypGroup);
    lab.center.set(-0.25, 0.5);
    hypLabels.push(lab);
  }

  // Simultaneity fan: the traveller's "now", drawn at each tick and densely through the turnaround.
  const simFan = segs(MAX_SIM, PALETTE.rose, 0.75, true);
  simFan.position.z = -0.01;
  diagram.add(simFan);
  const simTaus = new Float64Array(MAX_SIM);
  let simCount = 0;
  const simNowPts = new Float32Array(6);
  const simNow = fatDyn(2, PALETTE.rose, 2.2);
  diagram.add(simNow.line);
  const sweepPts = new Float32Array(6);
  const sweepBand = fatDyn(2, PALETTE.rose, 7, 0.55);
  diagram.add(sweepBand.line);
  const sweepLabel = stage.label('', [X0, 0, 0], '', diagram);
  sweepLabel.center.set(-0.06, 0.5);
  sweepLabel.element.style.color = css(PALETTE.rose);
  const simGroup = [simFan, simNow.line, sweepBand.line, sweepLabel];

  // Earth's own "now": a level line.
  const earthNow = segs(1, PALETTE.cyan, 0.35);
  diagram.add(earthNow);

  // Birthday pulses at 45°, coloured by sender.
  const pulseGeo = new LineSegmentsGeometry();
  pulseGeo.setPositions(new Float32Array(MAX_PULSES * 2 * 6));
  {
    const col = new Float32Array(MAX_PULSES * 2 * 6);
    const cC = new THREE.Color(PALETTE.cyan);
    const cA = new THREE.Color(PALETTE.amber);
    for (let i = 0; i < MAX_PULSES * 4; i++) {
      const c = i < MAX_PULSES * 2 ? cC : cA;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    pulseGeo.setColors(col);
  }
  const pulseMat = new LineMaterial({ vertexColors: true, linewidth: 1.8, transparent: true, opacity: 0.85, depthWrite: false });
  lineMats.push(pulseMat);
  const pulseLines = new LineSegments2(pulseGeo, pulseMat);
  pulseLines.frustumCulled = false;
  pulseLines.visible = showPulses;
  diagram.add(pulseLines);
  const pulseData = (pulseGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  const pulsePos = pulseData.array as Float32Array;
  // Emission data of the drawn pulses (Earth ones first, then the traveller's).
  const pEmitT = new Float64Array(MAX_PULSES * 2);
  const pEmitX = new Float64Array(MAX_PULSES * 2);
  const pRecvT = new Float64Array(MAX_PULSES * 2);
  let nPE = 0;
  let nPT = 0;

  // "Now" markers with floating clocks.
  const nowGeo = new THREE.SphereGeometry(0.13, 20, 14);
  const nowEarth = new THREE.Mesh(nowGeo, new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  const nowTrav = new THREE.Mesh(nowGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  diagram.add(nowEarth, nowTrav);
  const clockEarth = stage.label('', [0, 0, 0], 'big', nowEarth);
  clockEarth.center.set(1.12, 0.5);
  clockEarth.element.style.color = css(PALETTE.cyan);
  const clockTrav = stage.label('', [0, 0, 0], 'big', nowTrav);
  clockTrav.center.set(-0.12, 0.5);
  clockTrav.element.style.color = css(PALETTE.amber);

  // ---------------------------------------------------------------
  // The space strip: Earth, destination and ship moving in x
  // ---------------------------------------------------------------
  const strip = new THREE.Group();
  scene.add(strip);
  strip.add(fatStatic([X0 - 0.5, SHIP_Y - 0.3, 0, X0 + H / 2 + 0.4, SHIP_Y - 0.3, 0], PALETTE.gridMajor, 1.2));
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0x2c6fb8, roughness: 0.6, metalness: 0.1, emissive: 0x0b2a44, emissiveIntensity: 0.8 }),
  );
  earth.position.set(X0, SHIP_Y, 0);
  const earthWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(0.265, 12, 8)),
    new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.25 }),
  );
  earth.add(earthWire);
  strip.add(earth);
  const dest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
  strip.add(dest);
  const destLabel = stage.label('', [0, -0.3, 0], 'muted', dest);
  destLabel.center.set(0.5, 0);

  const ship = new THREE.Group();
  {
    const hull = new THREE.MeshStandardMaterial({ color: 0xd9dfeb, metalness: 0.5, roughness: 0.35 });
    const trim = new THREE.MeshStandardMaterial({ color: PALETTE.amber, metalness: 0.3, roughness: 0.4, emissive: PALETTE.amber, emissiveIntensity: 0.25 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 16), hull);
    body.rotation.z = -Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 16), trim);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.25;
    ship.add(body, nose);
    const finGeo = new THREE.BoxGeometry(0.12, 0.012, 0.1);
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const f = new THREE.Mesh(finGeo, trim);
      f.position.set(-0.13, 0.08 * Math.cos(a), 0.08 * Math.sin(a));
      f.rotation.x = a;
      ship.add(f);
    }
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.3, 14),
    new THREE.MeshBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -0.33;
  ship.add(flame);
  ship.position.set(X0, SHIP_Y, 0);
  ship.scale.setScalar(1.5);
  strip.add(ship);

  // ---------------------------------------------------------------
  // Rebuild on parameter change
  // ---------------------------------------------------------------
  const ev = wevent();
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vS = new THREE.Vector3(1, 1, 1);
  const vP = new THREE.Vector3();
  let sweepYears = 0;
  let turnTau = 0;

  function fmtYears(v: number): string {
    const a = Math.abs(v);
    if (a >= 1000) return Math.round(v).toLocaleString('en-US');
    if (a >= 100) return v.toFixed(0);
    return v.toFixed(1);
  }

  function rebuild(): void {
    p.a = aG * G_LY;
    trip = buildTrip(p);
    pulses = pulseTable(trip);
    s = H / trip.T;
    eStep = niceStep(trip.T / MAX_TICKS);
    tStep = niceStep(trip.tau / MAX_TICKS);
    tauNumeric = integrateProperTime(trip, 1e-10);
    const split = gapSplit(trip);
    cruiseShare = split.cruise / Math.max(1e-12, split.cruise + split.burn);

    // Worldline.
    sampleWorldline(trip, N_WL, wlBuf, ev);
    for (let i = 0; i < N_WL; i++) {
      wlPts[i * 3] = wx(wlBuf[i * 2 + 1]);
      wlPts[i * 3 + 1] = wy(wlBuf[i * 2]);
      wlPts[i * 3 + 2] = 0;
    }
    travWL.set(wlPts, N_WL);

    // Year grid.
    const gStep = niceStep(trip.T / 10);
    const gp = (yearGrid.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    let k = 0;
    const put = (x1: number, y1: number, x2: number, y2: number) => {
      if (k >= 64 * 6) return;
      gp[k++] = x1; gp[k++] = y1; gp[k++] = 0; gp[k++] = x2; gp[k++] = y2; gp[k++] = 0;
    };
    for (let j = 1; j * gStep <= trip.T + 1e-9; j++) put(X0, wy(j * gStep), X0 + H / 2, wy(j * gStep));
    for (let j = 1; j * gStep <= trip.T / 2 + 1e-9; j++) put(wx(j * gStep), 0, wx(j * gStep), H);
    yearGrid.geometry.setDrawRange(0, k / 3);
    yearGrid.geometry.attributes.position.needsUpdate = true;

    const lStep = niceStep(trip.T / 6);
    for (let i = 0; i < MAX_LABELS; i++) {
      const yr = (i + 1) * lStep;
      const l = yearLabels[i];
      l.visible = yr <= trip.T * 0.97;
      l.position.set(X0 - 0.12, wy(yr), 0);
      setText(l, `${yr >= 1000 ? Math.round(yr).toLocaleString('en-US') : yr} yr`);
    }

    // Ticks.
    let n = 0;
    vS.setScalar(1);
    for (let j = 1; j * eStep <= trip.T + 1e-9 && n < MAX_TICKS; j++, n++) {
      ticks.setMatrixAt(n, m4.compose(vP.set(X0, wy(j * eStep), 0.01), qI, vS));
    }
    vS.setScalar(0);
    for (; n < MAX_TICKS; n++) ticks.setMatrixAt(n, m4.compose(vP.set(0, 0, 0), qI, vS));
    for (let j = 1; j * tStep <= trip.tau + 1e-9 && n < 2 * MAX_TICKS; j++, n++) {
      eventAtTau(trip, j * tStep, ev);
      vS.setScalar(1);
      ticks.setMatrixAt(n, m4.compose(vP.set(wx(ev.x), wy(ev.t), 0.01), qI, vS));
    }
    vS.setScalar(0);
    for (; n < 2 * MAX_TICKS; n++) ticks.setMatrixAt(n, m4.compose(vP.set(0, 0, 0), qI, vS));
    vS.setScalar(1);
    ticks.instanceMatrix.needsUpdate = true;

    // Hyperbolae of equal proper time from departure, clipped to the light diamond.
    for (let i = 0; i < MAX_HYP; i++) {
      const tau = (i + 1) * tStep * Math.max(1, Math.ceil(trip.tau / tStep / MAX_HYP));
      const l = hypLines[i];
      const ok = tau < trip.T;
      l.visible = hypLabels[i].visible = ok;
      if (!ok) continue;
      const xmax = (trip.T * trip.T - tau * tau) / (2 * trip.T);
      const umax = Math.asinh(xmax / tau);
      const arr = (l.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let j = 0; j < HYP_PTS; j++) {
        const u = (umax * j) / (HYP_PTS - 1);
        arr[j * 3] = wx(tau * Math.sinh(u));
        arr[j * 3 + 1] = wy(tau * Math.cosh(u));
        arr[j * 3 + 2] = -0.005;
      }
      l.geometry.attributes.position.needsUpdate = true;
      hypLabels[i].position.set(X0, wy(tau), 0);
      hypLabels[i].visible = i < 3;
      setText(hypLabels[i], `τ=${fmtYears(tau)}`);
    }

    // Simultaneity fan.
    const list: { tau: number; eta: number; hot: boolean }[] = [];
    for (let j = 1; j * tStep < trip.tau - 1e-9 && list.length < MAX_TICKS; j++) {
      eventAtTau(trip, j * tStep, ev);
      list.push({ tau: j * tStep, eta: ev.eta, hot: false });
    }
    const f = trip.segs[trip.turnFirst];
    const l2 = trip.segs[trip.turnLast];
    if (p.mode === 'instant') {
      for (let j = 0; j <= 12; j++) list.push({ tau: f.tau0 + f.dtau, eta: f.eta0 * (1 - j / 6), hot: true });
    } else {
      const a0 = f.tau0;
      const a1 = l2.tau0 + l2.dtau;
      for (let j = 0; j <= 12; j++) {
        eventAtTau(trip, a0 + ((a1 - a0) * j) / 12, ev);
        list.push({ tau: ev.tau, eta: ev.eta, hot: true });
      }
    }
    list.sort((u, v) => u.tau - v.tau);
    simCount = Math.min(MAX_SIM, list.length);
    const sp = (simFan.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const sc = (simFan.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    const rose = new THREE.Color(PALETTE.rose);
    for (let i = 0; i < simCount; i++) {
      const it = list[i];
      eventAtTau(trip, it.tau, ev);
      const tE = earthTimeSimultaneous(ev.t, ev.x, it.eta);
      simTaus[i] = it.tau;
      sp.set([X0, wy(tE), 0, wx(ev.x), wy(ev.t), 0], i * 6);
      const b = it.hot ? 1 : 0.45;
      for (let v = 0; v < 2; v++) sc.set([rose.r * b, rose.g * b, rose.b * b], i * 6 + v * 3);
    }
    simFan.geometry.attributes.position.needsUpdate = true;
    simFan.geometry.attributes.color.needsUpdate = true;

    const sw = turnaroundSweep(trip);
    turnTau = p.mode === 'instant' ? f.tau0 + f.dtau : l2.tau0 + l2.dtau;
    sweepYears = sw.after - sw.before;
    sweepPts.set([X0 - 0.09, wy(sw.before), 0.02, X0 - 0.09, wy(sw.after), 0.02]);
    sweepBand.set(sweepPts, 2);
    sweepLabel.position.set(wx(p.D) + 0.3, wy(trip.T / 2), 0);
    setText(sweepLabel, `“now” on Earth ${p.mode === 'instant' ? 'jumps' : 'sweeps'} ${fmtYears(sweepYears)} yr`);

    // Pulses to draw.
    nPE = 0;
    for (let j = eStep; j <= pulses.earthRecvT.length && nPE < MAX_PULSES; j += eStep) {
      pEmitT[nPE] = j;
      pEmitX[nPE] = 0;
      pRecvT[nPE] = pulses.earthRecvT[j - 1];
      nPE++;
    }
    nPT = 0;
    for (let j = tStep; j <= pulses.travRecvT.length && nPT < MAX_PULSES; j += tStep) {
      const i = MAX_PULSES + nPT;
      pEmitT[i] = pulses.travEmitT[j - 1];
      pEmitX[i] = pulses.travEmitX[j - 1];
      pRecvT[i] = pulses.travRecvT[j - 1];
      nPT++;
    }

    dest.position.set(wx(p.D), SHIP_Y, 0);
    setText(destLabel, `D = ${fmtD(p.D)} ly`);
    setText(reunionLabel, `reunion: Earth ${fmtYears(trip.T)} yr, traveller ${fmtYears(trip.tau)} yr`);
    refreshNote();
    t = 0;
    completed = false;
    dirty = true;
  }

  function setText(o: CSS2DObject, str: string): void {
    if (o.element.textContent !== str) o.element.textContent = str;
  }

  // ---------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------
  let dirty = true;
  let pending = false;
  let rxTrav = 0;
  let rxEarth = 0;
  let tauNow = 0;
  let nowOnEarth = 0;
  let shipDir = 1;
  let spin = 0;
  const res = new THREE.Vector2();
  let lastW = 0;
  let lastH = 0;

  function updatePulses(): void {
    const n = MAX_PULSES * 2;
    for (let i = 0; i < n; i++) {
      const earthSide = i < MAX_PULSES;
      const used = earthSide ? i < nPE : i - MAX_PULSES < nPT;
      const o = i * 6;
      if (!used || t < pEmitT[i]) {
        // Park unused pulses as a zero-length segment at the emission point, under the tick.
        const px = used ? wx(pEmitX[i]) : X0;
        const py = used ? wy(pEmitT[i]) : 0;
        pulsePos[o] = pulsePos[o + 3] = px;
        pulsePos[o + 1] = pulsePos[o + 4] = py;
        pulsePos[o + 2] = pulsePos[o + 5] = 0;
        continue;
      }
      const te = pEmitT[i];
      const xe = pEmitX[i];
      const tEnd = Math.min(t, pRecvT[i]);
      const xEnd = earthSide ? xe + (tEnd - te) : xe - (tEnd - te);
      pulsePos[o] = wx(xe); pulsePos[o + 1] = wy(te); pulsePos[o + 2] = 0.015;
      pulsePos[o + 3] = wx(xEnd); pulsePos[o + 4] = wy(tEnd); pulsePos[o + 5] = 0.015;
    }
    pulseData.needsUpdate = true;
  }

  function updateScene(): void {
    eventAtT(trip, t, ev);
    tauNow = ev.tau;
    const yE = wy(t);
    nowEarth.position.set(X0, yE, 0.03);
    nowTrav.position.set(wx(ev.x), wy(ev.t), 0.03);
    setText(clockEarth, `Earth twin ${fmtYears(t)} yr`);
    for (let i = 0; i < MAX_LABELS; i++) {
      const l = yearLabels[i];
      l.element.style.visibility = Math.abs(l.position.y - yE) < 0.32 ? 'hidden' : '';
    }
    setText(clockTrav, `traveller ${fmtYears(tauNow)} yr`);

    // Earth's level "now" and the traveller's tilted one.
    const ep = (earthNow.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    ep[0] = X0; ep[1] = yE; ep[2] = -0.01; ep[3] = X0 + H / 2; ep[4] = yE; ep[5] = -0.01;
    earthNow.geometry.setDrawRange(0, 2);
    earthNow.geometry.attributes.position.needsUpdate = true;
    nowOnEarth = earthTimeSimultaneous(ev.t, ev.x, ev.eta);
    const beta = Math.tanh(ev.eta);
    const ext = 0.6 / s; // extend 0.6 world units past the traveller
    simNowPts[0] = X0; simNowPts[1] = wy(nowOnEarth); simNowPts[2] = 0.02;
    simNowPts[3] = wx(ev.x + ext); simNowPts[4] = wy(ev.t + beta * ext); simNowPts[5] = 0.02;
    simNow.set(simNowPts, 2);
    simNow.line.visible = showSim && t > 0;
    simFan.geometry.setDrawRange(0, 2 * countUpTo(simTaus, tauNow, simCount));
    const swept = tauNow >= turnTau - 1e-9;
    sweepBand.line.visible = sweepLabel.visible = showSim && swept;

    // Pulses received so far.
    rxTrav = countUpTo(pulses.earthRecvTau, tauNow);
    rxEarth = countUpTo(pulses.travRecvT, t);
    if (showPulses) updatePulses();

    // Ship. Nose points along the thrust while burning, along the velocity while coasting.
    ship.position.x = wx(ev.x);
    if (ev.alpha !== 0) shipDir = ev.alpha > 0 ? 1 : -1;
    else if (Math.abs(ev.eta) > 1e-9) shipDir = ev.eta > 0 ? 1 : -1;
    if (t >= trip.T) shipDir = 1;
    ship.scale.x = 1.5 * shipDir;
    flame.visible = ev.alpha !== 0 && t > 0 && t < trip.T;
    dirty = false;
  }

  stage.onFrame((dt) => {
    if (pending) {
      pending = false;
      rebuild();
    }
    renderer.getSize(res);
    if (res.x !== lastW || res.y !== lastH) {
      lastW = res.x;
      lastH = res.y;
      for (const m of lineMats) m.resolution.set(res.x, res.y);
    }
    if (playing) {
      t += (dt * speed * trip.T) / DURATION;
      if (t >= trip.T) {
        t = trip.T;
        playing = false;
        completed = true;
        playBtn.textContent = 'Replay';
      }
      dirty = true;
    }
    if (dirty) updateScene();
    if (flame.visible) flame.scale.set(0.8 + 0.3 * Math.random(), 1, 1);
    spin += dt * 0.4;
    earth.rotation.y = spin;
    updateReadouts();
  });

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------
  const fmtD = (d: number) => (d >= 1000 ? Math.round(d).toLocaleString('en-US') : d >= 100 ? d.toFixed(0) : d.toFixed(2));
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    {
      label: 'Pause', primary: true,
      onClick: () => {
        if (completed) { t = 0; completed = false; playing = true; }
        else playing = !playing;
        playBtn.textContent = playing ? 'Pause' : 'Play';
        dirty = true;
      },
    },
    { label: 'Reset', onClick: () => { t = 0; completed = false; dirty = true; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
  ]);
  ui.slider({ key: 'speed', label: 'Playback speed', min: 0.25, max: 4, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('The trip (restarts it)');
  // Slider drags can fire many input events per frame, so rebuild at most once per frame.
  const onParam = () => {
    pending = true;
    completed = false;
    t = 0;
    playing = true;
    playBtn.textContent = 'Pause';
    syncEnabled();
  };
  const modeCtl = ui.select<TripMode>({
    key: 'mode', label: 'Turnaround', value: p.mode,
    options: [{ value: 'instant', label: 'Instant' }, { value: 'accel', label: 'Constant acceleration' }],
    onChange: (v) => { p.mode = v; onParam(); },
  });
  const betaCtl = ui.slider({ key: 'beta', label: 'Cruise speed β = v/c', min: 0.05, max: 0.99, step: 0.001, value: p.beta, format: (v) => v.toFixed(3), onInput: (v) => { p.beta = v; onParam(); } });
  const dCtl = ui.slider({
    key: 'D', label: 'Distance D', min: Math.log10(0.5), max: Math.log10(30000), step: 0.001, value: Math.log10(p.D),
    format: (v) => `${fmtD(Math.pow(10, v))} ly`, onInput: (v) => { p.D = Math.pow(10, v); onParam(); },
  });
  const aCtl = ui.slider({ key: 'a', label: 'Proper acceleration a', min: 0.1, max: 3, step: 0.05, value: aG, format: (v) => `${v.toFixed(2)} g`, onInput: (v) => { aG = v; onParam(); } });
  const coastCtl = ui.toggle({ key: 'coast', label: 'Coast at β between burns', value: p.coast, onChange: (v) => { p.coast = v; onParam(); } });
  ui.buttons([
    { label: 'α Centauri at 1 g', key: 'preset', onClick: () => preset(4.37) },
    { label: 'Galactic centre at 1 g', key: 'preset', onClick: () => preset(26700) },
  ]);
  function preset(D: number): void {
    p.mode = 'accel';
    p.coast = false;
    p.D = D;
    aG = 1;
    modeCtl.set('accel', false);
    coastCtl.set(false, false);
    dCtl.set(Math.log10(D), false);
    aCtl.set(1, false);
    onParam();
  }
  function syncEnabled(): void {
    const acc = p.mode === 'accel';
    aCtl.el.style.opacity = acc ? '1' : '0.4';
    coastCtl.el.style.opacity = acc ? '1' : '0.4';
    betaCtl.el.style.opacity = acc && !p.coast ? '0.4' : '1';
  }

  ui.section('Show');
  ui.toggle({ key: 'pulses', label: 'Birthday pulses (one per proper year)', value: showPulses, onChange: (v) => { showPulses = v; pulseLines.visible = v; dirty = true; } });
  ui.toggle({ key: 'simultaneity', label: 'Traveller’s lines of “now”', value: showSim, onChange: (v) => { showSim = v; for (const o of simGroup) o.visible = v; dirty = true; } });
  ui.toggle({ key: 'hyperbolae', label: 'Hyperbolae of equal proper time', value: showHyp, onChange: (v) => { showHyp = v; hypGroup.visible = v; } });

  ui.section('Live readouts');
  const rE = ui.readout('tEarth', 'Earth twin age', 'yr');
  const rT = ui.readout('tauTrav', 'traveller age', 'yr');
  const rGap = ui.readout('gap', 'age gap', 'yr');
  const rG = ui.readout('gamma', 'Lorentz factor at cruise');
  const rRxT = ui.readout('rxTrav', 'pulses traveller got');
  const rRxE = ui.readout('rxEarth', 'pulses Earth got');
  const rNow = ui.readout('nowEarth', 'Earth time on traveller’s “now”', 'yr');
  const rShare = ui.readout('cruiseShare', 'gap earned while coasting');
  const rChk = ui.readout('check', '∫√(1−v²)dt vs exact');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'Earth twin' },
    { color: css(PALETTE.amber), label: 'traveller' },
    { color: css(PALETTE.rose), label: 'traveller’s “now”' },
    { color: css(PALETTE.violet), label: 'light' },
    { color: css(PALETTE.green), label: 'equal proper time' },
  ]);
  const note = ui.note('');
  function refreshNote(): void {
    note.innerHTML = `Dots mark every ${eStep === 1 ? '' : `${eStep} `}year${eStep === 1 ? '' : 's'} on Earth and every ${tStep === 1 ? '' : `${tStep} `}year${tStep === 1 ? '' : 's'} of the traveller’s own time. `
      + `At reunion the ratio of ages is ${(trip.T / trip.tau).toFixed(3)}. Peak speed ${trip.betaPeak > 0.9999 ? `1 − ${(1 - trip.betaPeak).toExponential(1)}` : trip.betaPeak.toFixed(4)} c.`
      + ((eStep > 1 || tStep > 1) ? ' Only some pulses are drawn. The counts include all of them.' : '');
  }

  function updateReadouts(): void {
    rE(fmtYears(t));
    rT(fmtYears(tauNow));
    rGap(fmtYears(t - tauNow));
    const g = Math.cosh(trip.etaPeak);
    rG(g < 1000 ? g.toFixed(3) : Math.round(g).toLocaleString('en-US'));
    rRxT(`${rxTrav.toLocaleString('en-US')} of ${pulses.earthRecvTau.length.toLocaleString('en-US')}`);
    rRxE(`${rxEarth} of ${pulses.travRecvT.length}`);
    rNow(fmtYears(nowOnEarth));
    rShare(p.mode === 'instant' ? '100 %' : `${(cruiseShare * 100).toFixed(0)} %`);
    rChk(`${(Math.abs(tauNumeric - trip.tau) / trip.tau).toExponential(0)} rel.`);
  }

  rebuild();
  syncEnabled();

  return {
    state: () => ({
      mode: p.mode,
      beta: p.beta,
      D: p.D,
      a: aG,
      coast: p.coast,
      T: trip.T,
      tauTotal: trip.tau,
      finalGap: trip.T - trip.tau,
      ratio: trip.T / trip.tau,
      t,
      tau: tauNow,
      gap: t - tauNow,
      gamma: Math.cosh(trip.etaPeak),
      betaPeak: trip.betaPeak,
      rxTrav,
      rxEarth,
      pulsesFromEarth: pulses.earthRecvTau.length,
      pulsesFromTraveller: pulses.travRecvT.length,
      nowEarth: nowOnEarth,
      sweep: sweepYears,
      cruiseShare,
      completed,
      playing,
      pulses: showPulses,
      simultaneity: showSim,
      hyperbolae: showHyp,
    }),
    dispose: () => {
      ticks.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'twin-paradox',
  number: 9,
  symbol: 'Tw',
  title: 'The Twin Paradox',
  domain: 'relativity',
  level: 2,
  status: 'live',
  tagline: 'Why the travelling twin comes home younger.',
  content,
  mount,
};

export default topic;
