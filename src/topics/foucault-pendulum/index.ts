import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { FoucaultSim, G, OMEGA_EARTH, PlaneTracker, SIDEREAL_HOURS, precessionPeriodHours, swingPeriod } from './physics.ts';

type Frame = 'earth' | 'inertial';

const DEG = Math.PI / 180;
const R_SWING = 2.4; // displayed swing radius on the floor
const PIVOT_Y = 12; // dome apex
const BOB_Y0 = 0.42; // bob centre at rest
const PIVOT_H = PIVOT_Y - BOB_Y0;
const FLOOR_R = 3.3;
const N_PEGS = 40;
const R_PEG = R_SWING * 0.93;
const SEG = 30000; // sand-trace capacity (segments)
const MAX_STEPS = 6000; // integrator steps per frame
const SAND_Y = 0.012;
const COL_R = 9.6; // colonnade radius (outside the default camera distance)

/** Round to two significant figures (keeps 1 exactly 1). */
const nice = (v: number) => {
  const e = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / e) * e;
};

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)} s`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ${Math.floor(sec % 60)} s`;
  if (sec < 48 * 3600) return `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min`;
  return `${Math.floor(sec / 86400)} d ${Math.floor((sec % 86400) / 3600)} h`;
}
const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [0.4, 6.2, 8.4], target: [0, 0.6, 0], fov: 42 });
  const { scene } = stage;
  stage.controls.maxDistance = 16;
  stage.controls.minDistance = 3;

  // --- Parameters
  let latDeg = 48.85;
  let exag = 30;
  let accel = 60;
  let ampDeg = 4;
  let L = 67;
  let frame: Frame = 'earth';
  let playing = true;

  const sim = new FoucaultSim({ L, g: G, latDeg, omega: OMEGA_EARTH * exag });
  const tracker = new PlaneTracker();

  // --- Earth-fixed group: everything bolted to the ground
  const earth = new THREE.Group();
  scene.add(earth);

  const outer = new THREE.Mesh(new THREE.CircleGeometry(11, 72), new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.002;
  earth.add(outer);
  const sandDisc = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 96), new THREE.MeshStandardMaterial({ color: 0x2a2519, roughness: 1 }));
  sandDisc.rotation.x = -Math.PI / 2;
  earth.add(sandDisc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(FLOOR_R, 0.06, 8, 96), new THREE.MeshStandardMaterial({ color: 0x5a6378, metalness: 0.6, roughness: 0.35 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.04;
  earth.add(rim);

  // Compass ticks every 10 degrees, long ticks at N/E/S/W
  {
    const pts: number[] = [];
    for (let i = 0; i < 36; i++) {
      const a = i * 10 * DEG;
      const r0 = i % 9 === 0 ? FLOOR_R - 0.34 : FLOOR_R - 0.16;
      pts.push(r0 * Math.cos(a), 0.01, -r0 * Math.sin(a), (FLOOR_R - 0.02) * Math.cos(a), 0.01, -(FLOOR_R - 0.02) * Math.sin(a));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    earth.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a8f9c, transparent: true, opacity: 0.6 })));
  }
  const compass: [string, number][] = [['E', 0], ['N', 90], ['W', 180], ['S', 270]];
  for (const [t, a] of compass) stage.label(t, [(FLOOR_R + 0.35) * Math.cos(a * DEG), 0.05, -(FLOOR_R + 0.35) * Math.sin(a * DEG)], 'muted', earth);

  // Columns and a dome outline: a hint of the Panthéon
  {
    const colMat = new THREE.MeshStandardMaterial({ color: 0x3b4458, roughness: 0.8 });
    const colGeo = new THREE.CylinderGeometry(0.2, 0.24, 6, 16);
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) * (Math.PI / 6);
      const c = new THREE.Mesh(colGeo, colMat);
      c.position.set(COL_R * Math.cos(a), 3, COL_R * Math.sin(a));
      earth.add(c);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(COL_R, 0.14, 8, 96), colMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 6.05;
    earth.add(ring);
    const pts: number[] = [];
    const lineTo = (a: THREE.Vector3, b: THREE.Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const R = COL_R;
    const H = PIVOT_Y - 6.05;
    const pDome = (el: number, az: number) => new THREE.Vector3(R * Math.cos(el) * Math.cos(az), 6.05 + H * Math.sin(el), R * Math.cos(el) * Math.sin(az));
    for (let m = 0; m < 12; m++) {
      const az = (m + 0.5) * (Math.PI / 6);
      for (let k = 0; k < 16; k++) lineTo(pDome((k / 16) * Math.PI / 2, az), pDome(((k + 1) / 16) * Math.PI / 2, az));
    }
    for (const el of [0.35, 0.75, 1.1]) for (let k = 0; k < 72; k++) lineTo(pDome(el, (k / 72) * 2 * Math.PI), pDome(el, ((k + 1) / 72) * 2 * Math.PI));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    earth.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2c3852, transparent: true, opacity: 0.55 })));
  }

  // Pegs: each in a pivot group at its base so it can topple outward
  const pegGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.34, 10);
  pegGeo.translate(0, 0.17, 0);
  const capGeo = new THREE.SphereGeometry(0.055, 12, 8);
  capGeo.translate(0, 0.35, 0);
  const pegMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.6 });
  const capMat = new THREE.MeshStandardMaterial({ color: PALETTE.red, roughness: 0.4, emissive: 0x330808 });
  const pegs: THREE.Group[] = [];
  const pegFall = new Float32Array(N_PEGS); // 0 upright ... 1 flat; <0 means not hit
  for (let i = 0; i < N_PEGS; i++) {
    const a = (i / N_PEGS) * 2 * Math.PI;
    const g = new THREE.Group();
    g.position.set(R_PEG * Math.cos(a), 0, -R_PEG * Math.sin(a));
    g.rotation.y = a;
    const inner = new THREE.Group();
    inner.add(new THREE.Mesh(pegGeo, pegMat), new THREE.Mesh(capGeo, capMat));
    g.add(inner);
    earth.add(g);
    pegs.push(inner);
  }
  let pegsDown = 0;

  // Sand trace: ring buffer of line segments, lying in the Earth-fixed group
  const sandPos = new Float32Array(SEG * 6);
  const sandCol = new Float32Array(SEG * 6);
  const sandGeo = new THREE.BufferGeometry();
  const sandPosAttr = new THREE.BufferAttribute(sandPos, 3).setUsage(THREE.DynamicDrawUsage);
  const sandColAttr = new THREE.BufferAttribute(sandCol, 3).setUsage(THREE.DynamicDrawUsage);
  sandGeo.setAttribute('position', sandPosAttr);
  sandGeo.setAttribute('color', sandColAttr);
  sandGeo.setDrawRange(0, 0);
  const sand = new THREE.LineSegments(sandGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  sand.frustumCulled = false;
  earth.add(sand);
  let sandHead = 0;
  let sandCount = 0;
  let dirtyLo = SEG;
  let dirtyHi = 0;
  let dirtyWrap = false;
  let prevSX = 0;
  let prevSZ = 0;
  const sc = new THREE.Color();

  // Predicted swing plane (cyan dashed), in the Earth group
  const predGeo = new THREE.BufferGeometry();
  predGeo.setAttribute('position', new THREE.Float32BufferAttribute([-FLOOR_R * 0.97, 0.02, 0, FLOOR_R * 0.97, 0.02, 0], 3));
  const pred = new THREE.Line(predGeo, new THREE.LineDashedMaterial({ color: PALETTE.cyan, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.95 }));
  pred.computeLineDistances();
  earth.add(pred);

  // --- Pendulum (not in the Earth group: we place it by hand in either frame)
  const mount3 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.7, roughness: 0.3 }));
  mount3.position.y = PIVOT_Y;
  scene.add(mount3);
  const wirePos = new Float32Array([0, PIVOT_Y, 0, 0, BOB_Y0, 0]);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  const wire = new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: 0xc9d3e6, transparent: true, opacity: 0.85 }));
  wire.frustumCulled = false;
  scene.add(wire);
  const bob = new THREE.Group();
  const bobMesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 20), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.28, emissive: 0x2a1a00 }));
  const stylus = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 10), bobMesh.material);
  stylus.rotation.x = Math.PI;
  stylus.position.y = -0.3;
  bob.add(bobMesh, stylus);
  scene.add(bob);

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '190px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '10.5px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const paintLegend = () => {
    const fr = frame === 'earth' ? 'Earth frame: the floor is still, the swing turns.' : 'Inertial view: the swing keeps its plane, the floor turns beneath.';
    const ex = exag === 1 ? '<span style="color:#5ee39a">Ω real (1×)</span>' : `<span style="color:${css(PALETTE.rose)}">Ω exaggerated ${exag}×</span>`;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the floor</div>
<div>Sand trace, shaded as the plane turns</div>
<div style="height:6px;border-radius:3px;margin:3px 0 5px;background:linear-gradient(90deg,hsl(40,90%,58%),hsl(330,80%,62%),hsl(265,80%,70%))"></div>
<div><span style="color:${css(PALETTE.cyan)}">Dashed</span>: predicted plane, rate Ω sin φ</div>
<div><span style="color:${css(PALETTE.red)}">Pegs</span> fall as the swing reaches them</div>
<div style="margin-top:4px;color:#dfe6f3">${fr}</div>
<div>${ex}</div>
<div style="color:#6b7894;margin-top:3px">Swing enlarged to fill the floor.</div>`;
  };

  // --- Globe inset (2D canvas, corner, styled like the sparkline insets)
  const globe = document.createElement('canvas');
  globe.width = 380;
  globe.height = 470;
  Object.assign(globe.style, {
    position: 'absolute', right: '10px', top: '10px', width: '190px', height: '235px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(globe);
  const gctx = globe.getContext('2d')!;

  // --- Simulation bookkeeping
  let h = 0.05;
  let sampleDt = 1;
  let sampleAcc = 0;
  let pending = 0;
  let realT = 0;
  let capped = false;
  let j0 = 0;
  let jScale = 1;
  let kDisp = 1;
  let psi0 = 0;

  function reset(): void {
    sim.setParams({ L, g: G, latDeg, omega: OMEGA_EARTH * exag });
    sim.release(ampDeg * DEG, 0);
    const T0 = swingPeriod(L);
    h = T0 / 200;
    sampleDt = T0 / 16;
    sampleAcc = 0;
    pending = 0;
    realT = 0;
    capped = false;
    tracker.reset(sim.planeAngle());
    psi0 = tracker.psi0;
    j0 = sim.jacobi();
    jScale = G * L * (1 - Math.cos(ampDeg * DEG));
    kDisp = R_SWING / (L * Math.sin(ampDeg * DEG));
    sandHead = 0;
    sandCount = 0;
    sandGeo.setDrawRange(0, 0);
    const [x, z] = dispXZ();
    prevSX = x;
    prevSZ = z;
    pegFall.fill(-1);
    pegsDown = 0;
    for (const p of pegs) p.rotation.z = 0;
    paintLegend();
    placePendulum();
  }

  /** Bob position on the floor in display units (Earth-fixed X, Z). */
  function dispXZ(): [number, number] {
    return [sim.s[0] * kDisp, -sim.s[1] * kDisp];
  }

  function addSand(): void {
    const x = sim.s[0] * kDisp;
    const z = -sim.s[1] * kDisp;
    const i = sandHead * 6;
    sandPos[i] = prevSX;
    sandPos[i + 1] = SAND_Y;
    sandPos[i + 2] = prevSZ;
    sandPos[i + 3] = x;
    sandPos[i + 4] = SAND_Y;
    sandPos[i + 5] = z;
    const f = (Math.abs(tracker.total) % Math.PI) / Math.PI;
    sc.setHSL((0.11 - 0.37 * f + 1) % 1, 0.85, 0.6 + 0.08 * f);
    for (let k = 0; k < 6; k += 3) {
      sandCol[i + k] = sc.r;
      sandCol[i + k + 1] = sc.g;
      sandCol[i + k + 2] = sc.b;
    }
    if (sandHead < dirtyLo) dirtyLo = sandHead;
    if (sandHead + 1 > dirtyHi) dirtyHi = sandHead + 1;
    sandHead++;
    if (sandHead >= SEG) {
      sandHead = 0;
      dirtyWrap = true;
    }
    if (sandCount < SEG) sandCount++;
    prevSX = x;
    prevSZ = z;
    // Pegs: is the bob out at the ring, next to a standing peg?
    const r = Math.hypot(x, z);
    if (r > R_PEG - 0.08) {
      let a = Math.atan2(-z, x);
      if (a < 0) a += 2 * Math.PI;
      const idx = Math.round((a / (2 * Math.PI)) * N_PEGS) % N_PEGS;
      const pa = (idx / N_PEGS) * 2 * Math.PI;
      let d = Math.abs(a - pa);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (pegFall[idx] < 0 && d * R_PEG < 0.2) {
        pegFall[idx] = 0;
        pegsDown++;
      }
    }
  }

  function flushSand(): void {
    if (dirtyWrap || dirtyHi > dirtyLo) {
      sandPosAttr.clearUpdateRanges();
      sandColAttr.clearUpdateRanges();
      if (!dirtyWrap) {
        sandPosAttr.addUpdateRange(dirtyLo * 6, (dirtyHi - dirtyLo) * 6);
        sandColAttr.addUpdateRange(dirtyLo * 6, (dirtyHi - dirtyLo) * 6);
      }
      sandPosAttr.needsUpdate = true;
      sandColAttr.needsUpdate = true;
      sandGeo.setDrawRange(0, sandCount * 2);
    }
    dirtyLo = SEG;
    dirtyHi = 0;
    dirtyWrap = false;
  }

  /** Angle the ground has turned about the local vertical since release (rad, ccw). */
  const groundTurn = () => sim.W[2] * sim.t;

  function placePendulum(): void {
    let x = sim.s[0] * kDisp;
    let z = -sim.s[1] * kDisp;
    if (frame === 'inertial') {
      const a = groundTurn();
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = x * c + z * s;
      z = -x * s + z * c;
      x = nx;
      earth.rotation.y = a;
    } else {
      earth.rotation.y = 0;
    }
    const rr = Math.min(x * x + z * z, PIVOT_H * PIVOT_H * 0.9);
    const y = BOB_Y0 + PIVOT_H - Math.sqrt(PIVOT_H * PIVOT_H - rr);
    bob.position.set(x, y, z);
    wirePos[3] = x;
    wirePos[4] = y + 0.26;
    wirePos[5] = z;
    (wireGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // Predicted plane in the Earth frame: psi0 - Ω sinφ t
    pred.rotation.y = psi0 - groundTurn();
  }

  // --- Frame loop
  let globeTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      realT += dt;
      pending += dt * accel;
      let n = 0;
      while (pending >= h && n < MAX_STEPS) {
        sim.step(h);
        tracker.update(sim.planeAngle());
        sampleAcc += h;
        if (sampleAcc >= sampleDt) {
          sampleAcc -= sampleDt;
          addSand();
        }
        pending -= h;
        n++;
      }
      if (pending >= h) {
        capped = true;
        pending = 0;
      }
      flushSand();
      placePendulum();
      // Topple pegs
      for (let i = 0; i < N_PEGS; i++) {
        const f = pegFall[i];
        if (f >= 0 && f < 1) {
          pegFall[i] = Math.min(1, f + dt * 2.5);
          const e = pegFall[i] * pegFall[i];
          pegs[i].rotation.z = -e * (Math.PI / 2 - 0.1);
        }
      }
    }
    globeTimer += dt;
    if (globeTimer > 0.066) {
      globeTimer = 0;
      drawGlobe();
      updateReadouts();
    }
  });

  // --- Globe drawing
  const TILT = 22 * DEG;
  const proj = (lat: number, lon: number, out: Float64Array) => {
    const px = Math.cos(lat) * Math.cos(lon);
    const py = Math.cos(lat) * Math.sin(lon);
    const pz = Math.sin(lat);
    out[0] = -px; // screen right
    out[1] = pz * Math.cos(TILT) - py * Math.sin(TILT); // screen up
    out[2] = py * Math.cos(TILT) + pz * Math.sin(TILT); // toward viewer
  };
  const pp = new Float64Array(3);
  const LATS = [-60, -30, 30, 60];
  /** Stroke a latitude circle (fixedLat=true, value=lat) or a meridian (value=lon), front or back half. */
  function curve(fixedLat: boolean, value: number, n: number, cx: number, cy: number, R: number, front: boolean): void {
    gctx.beginPath();
    let pen = false;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      if (fixedLat) proj(value, u * 2 * Math.PI, pp);
      else proj((-90 + 180 * u) * DEG, value, pp);
      const vis = front ? pp[2] >= 0 : pp[2] < 0;
      if (vis) {
        const X = cx + R * pp[0];
        const Y = cy - R * pp[1];
        if (pen) gctx.lineTo(X, Y);
        else gctx.moveTo(X, Y);
        pen = true;
      } else pen = false;
    }
    gctx.stroke();
  }

  function drawGlobe(): void {
    const W = globe.width;
    const c = gctx;
    c.clearRect(0, 0, W, globe.height);
    const cx = W / 2;
    const cy = 190;
    const R = 112;
    const spin = sim.p.omega * sim.t;
    const phi = latDeg * DEG;
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('site on the spinning Earth', 16, 32);
    // Ocean disc
    const grad = c.createRadialGradient(cx - 35, cy - 40, 10, cx, cy, R);
    grad.addColorStop(0, '#1d3a63');
    grad.addColorStop(1, '#0b1528');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(cx, cy, R, 0, 2 * Math.PI);
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#2f4a73';
    c.stroke();
    // Graticule
    c.strokeStyle = 'rgba(120,150,200,0.35)';
    for (const la of LATS) curve(true, la * DEG, 72, cx, cy, R, true);
    for (let m = 0; m < 12; m++) {
      curve(false, spin + (m * Math.PI) / 6, 36, cx, cy, R, true);
    }
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(244,114,182,0.8)';
    curve(true, 0, 96, cx, cy, R, true);
    // Site's latitude circle
    c.setLineDash([6, 5]);
    c.strokeStyle = 'rgba(245,182,66,0.35)';
    curve(true, phi, 96, cx, cy, R, false);
    c.strokeStyle = 'rgba(245,182,66,0.9)';
    curve(true, phi, 96, cx, cy, R, true);
    c.setLineDash([]);
    // Spin axis
    const ax = 0;
    const ayN = Math.cos(TILT);
    c.strokeStyle = css(PALETTE.cyan);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - R * 1.28 * ax, cy + R * 1.28 * ayN);
    c.lineTo(cx, cy - R * 1.32 * ayN);
    c.stroke();
    c.fillStyle = css(PALETTE.cyan);
    c.beginPath();
    c.moveTo(cx, cy - R * 1.32 * ayN - 14);
    c.lineTo(cx - 8, cy - R * 1.32 * ayN + 4);
    c.lineTo(cx + 8, cy - R * 1.32 * ayN + 4);
    c.fill();
    c.fillText('Ω', cx + 12, cy - R * 1.2 * ayN);
    // Site and its local vertical
    proj(phi, Math.PI / 2 + spin, pp);
    const sx = cx + R * pp[0];
    const sy = cy - R * pp[1];
    const front = pp[2] >= 0;
    const ex = cx + R * 1.42 * pp[0];
    const ey = cy - R * 1.42 * pp[1];
    c.globalAlpha = front ? 1 : 0.35;
    c.strokeStyle = css(PALETTE.amber);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.stroke();
    const ang = Math.atan2(ey - sy, ex - sx);
    c.fillStyle = css(PALETTE.amber);
    c.beginPath();
    c.moveTo(ex + 12 * Math.cos(ang), ey + 12 * Math.sin(ang));
    c.lineTo(ex + 8 * Math.cos(ang + 2.2), ey + 8 * Math.sin(ang + 2.2));
    c.lineTo(ex + 8 * Math.cos(ang - 2.2), ey + 8 * Math.sin(ang - 2.2));
    c.fill();
    c.beginPath();
    c.arc(sx, sy, 8, 0, 2 * Math.PI);
    c.fill();
    c.globalAlpha = 1;
    // Text
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText(`φ = ${Math.abs(latDeg).toFixed(2)}° ${latDeg >= 0 ? 'N' : 'S'}`, 16, 352);
    c.fillText(`sin φ = ${Math.sin(phi).toFixed(3).replace('-', '−')}`, 200, 352);
    c.fillStyle = '#8391ab';
    c.fillText(`Earth time  ${fmtDur(sim.t)}`, 16, 390);
    c.fillText(`your time   ${fmtClock(realT)}`, 16, 422);
    c.fillText(`plane turned ${Math.abs(tracker.total / DEG).toFixed(1)}°`, 16, 454);
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Release again', onClick: () => reset() },
  ]);
  ui.select<Frame>({
    key: 'frame', label: 'Frame', value: frame,
    options: [{ value: 'earth', label: 'Earth frame' }, { value: 'inertial', label: 'Inertial view' }],
    onChange: (v) => { frame = v; paintLegend(); placePendulum(); },
  });
  ui.slider({
    key: 'accel', label: 'Time acceleration', min: 0, max: Math.log10(5000), step: 0.01, value: Math.log10(accel),
    format: (v) => `${nice(Math.pow(10, v))}×`, onInput: (v) => { accel = nice(Math.pow(10, v)); },
  });
  const exagCtl = ui.slider({
    key: 'exag', label: 'Exaggerated Ω (not real)', min: 0, max: 3, step: 0.01, value: Math.log10(exag),
    format: (v) => `${nice(Math.pow(10, v))}× Earth`, onInput: (v) => { exag = nice(Math.pow(10, v)); reset(); },
  });
  ui.buttons([{ label: 'Real Ω (1×)', key: 'exag', onClick: () => exagCtl.set(0) }]);

  ui.section('Site');
  const latCtl = ui.slider({
    key: 'lat', label: 'Latitude φ', min: -90, max: 90, step: 0.05, value: latDeg,
    format: (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? 'N' : 'S'}`, onInput: (v) => { latDeg = v; reset(); },
  });
  ui.buttons([
    { label: 'Paris', onClick: () => latCtl.set(48.85) },
    { label: 'N Pole', onClick: () => latCtl.set(90) },
    { label: 'Equator', onClick: () => latCtl.set(0) },
  ]);
  ui.buttons([
    { label: 'Guelph', onClick: () => latCtl.set(43.55) },
    { label: 'Sydney', onClick: () => latCtl.set(-33.87) },
  ]);

  ui.section('Pendulum (resets)');
  ui.slider({ key: 'amp', label: 'Amplitude θ₀', min: 1, max: 15, step: 0.5, value: ampDeg, unit: '°', onInput: (v) => { ampDeg = v; reset(); } });
  ui.slider({ key: 'L', label: 'Length L', min: 2, max: 100, step: 1, value: L, unit: 'm', onInput: (v) => { L = v; reset(); } });
  ui.note('The Panthéon pendulum of 1851 was 67 m long with a 28 kg bob.');

  ui.section('Readouts');
  const rTp = ui.readout('Tpred', 'period, predicted');
  const rTm = ui.readout('Tmeas', 'period, measured');
  const rRot = ui.readout('rot', 'rotation so far');
  const rPeg = ui.readout('pegs', 'pegs down');
  const rSim = ui.readout('simT', 'Earth time (accelerated)');
  const rReal = ui.readout('realT', 'real time');
  const rSw = ui.readout('swing', 'swing period', 's');
  const rJ = ui.readout('jacobi', 'Jacobi drift');

  const measuredRate = () => (sim.t > 0 && Math.abs(tracker.total) > 0.5 * DEG ? tracker.total / sim.t : 0);
  const periodH = (rate: number) => (rate === 0 ? 0 : (2 * Math.PI) / Math.abs(rate) / 3600);
  const fmtH = (hrs: number) => (hrs >= 1 ? `${hrs.toFixed(2)} h` : `${(hrs * 60).toFixed(1)} min`);

  function updateReadouts(): void {
    const tp = precessionPeriodHours(latDeg, exag);
    rTp(Number.isFinite(tp) ? fmtH(tp) : '∞ (none)');
    const rate = measuredRate();
    rTm(rate !== 0 ? fmtH(periodH(rate)) : Math.abs(latDeg) < 0.5 && sim.t > 600 ? '∞ (none)' : 'measuring…');
    const rot = -tracker.total / DEG;
    rRot(`${Math.abs(rot).toFixed(1)}° ${Math.abs(rot) < 0.05 ? '' : rot > 0 ? 'cw' : 'ccw'}`.trim());
    rPeg(`${pegsDown} / ${N_PEGS}`);
    rSim(fmtDur(sim.t));
    rReal(`${fmtClock(realT)}${capped ? ' (capped)' : ''}`);
    rSw(swingPeriod(L).toFixed(1));
    rJ(`${((sim.jacobi() - j0) / jScale).toExponential(0)}`);
  }

  /** Advance the simulation by simSeconds without waiting (used for the opening demo). */
  function prerun(simSeconds: number): void {
    const n = Math.min(200000, Math.round(simSeconds / h));
    for (let i = 0; i < n; i++) {
      sim.step(h);
      tracker.update(sim.planeAngle());
      sampleAcc += h;
      if (sampleAcc >= sampleDt) {
        sampleAcc -= sampleDt;
        addSand();
      }
    }
    flushSand();
    for (let i = 0; i < N_PEGS; i++) if (pegFall[i] >= 0) { pegFall[i] = 1; pegs[i].rotation.z = -(Math.PI / 2 - 0.1); }
    placePendulum();
  }

  reset();
  // Opening demo: let the plane turn about 60 degrees so the star is already on the floor.
  prerun((60 / 360) * precessionPeriodHours(latDeg, exag) * 3600);
  drawGlobe();
  updateReadouts();

  return {
    state: () => ({
      lat: latDeg,
      exag,
      accel,
      L,
      amp: ampDeg,
      frame,
      rotDeg: -tracker.total / DEG,
      Tmeas: periodH(measuredRate()),
      Tpred: precessionPeriodHours(latDeg, exag),
      earthDeg: (sim.p.omega * sim.t) / DEG,
      simHours: sim.t / 3600,
      pegsDown,
      siderealHours: SIDEREAL_HOURS,
    }),
    dispose: () => {
      legend.remove();
      globe.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'foucault-pendulum',
  number: 22,
  symbol: 'Fp',
  title: 'The Foucault Pendulum',
  domain: 'classical',
  level: 2,
  status: 'live',
  tagline: 'A swinging weight that proves the Earth turns.',
  content,
  mount,
};

export default topic;
