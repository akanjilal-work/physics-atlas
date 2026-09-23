import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, makeGrid, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { boost, contraction, event, gamma, rapidity, relativeVelocity } from './physics.ts';

// Three.js axes: x = space x, y = ct, z = space y. Units: c = 1, one unit = 1 light-second.
type View = 'spacetime' | 'clock';

const B = 4.5; // half-size of the spacetime box (space and time)
const L = 2; // lightning strikes at x = ±L, t = 0
const U_MAX = 4.3; // loop length of the "now" animation
const U_RATE = 0.6; // diagram seconds per real second at speed 1
const TICKS = 4; // proper-time ticks k = ±1..±4 on each worldline
const FAR = 150; // half-length of "infinite" lines and planes before clipping
const BLEND_TIME = 1.6; // seconds for the boost animation

// Light clock layout
const DV = 1.5; // mirror gap (one light-second in clock units)
const W0 = 1.4; // clock body rest length along x
const REST_Y = 1.7; // centre of the rest clock
const MOV_Y = -1.7; // centre of the moving clock
const TRACK = 4.8; // moving clock runs from −TRACK to +TRACK

const CAM_ST: [number, number, number] = [-6, 5.2, 15];
const TGT_ST: [number, number, number] = [0, 0.3, 0];
const CAM_LC: [number, number, number] = [0, 0.1, 10.5];
const TGT_LC: [number, number, number] = [0, 0, 0];

function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Row-major Lorentz boost on three.js (x, y=ct, z=y) coordinates. */
function setBoostMatrix(m: THREE.Matrix4, beta: number): void {
  const g = gamma(beta);
  m.set(g, -g * beta, 0, 0, -g * beta, g, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM_ST, target: TGT_ST, fov: 42 });
  const { scene, renderer } = stage;
  renderer.localClippingEnabled = true;

  let beta = 0.6;
  let speed = 1;
  let playing = true;
  let view: View = 'spacetime';
  let showCone = true;
  let showPlanes = true;
  let showHyper = true;
  let showLightning = true;
  let boosted = false;
  let blend = 0; // 0 = rest frame, 1 = rocket frame
  let u = 0; // time on the display frame's own clock
  let tLc = 0; // light-clock rest time

  const e = 1e-3;
  const clip = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), B + e),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), B + e),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), B + e),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), B + e),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), B + e),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), B + e),
  ];

  const lineMats: LineMaterial[] = [];
  function fat(pts: number[], color: number, width: number, opacity = 1, dashed = false): Line2 {
    const g = new LineGeometry();
    g.setPositions(pts);
    const m = new LineMaterial({
      color, linewidth: width, transparent: opacity < 1, opacity, dashed, dashSize: 0.18, gapSize: 0.14,
      depthWrite: opacity >= 1,
    });
    lineMats.push(m);
    const l = new Line2(g, m);
    if (dashed) l.computeLineDistances();
    l.frustumCulled = false;
    return l;
  }
  const thin = (color: number, opacity: number) =>
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, clippingPlanes: clip, depthWrite: false });

  /**
   * A fat line through the box. Fat lines with an end behind the camera do not clip reliably on the GPU,
   * so each one is clipped to the box here and drawn as a unit segment mapped by its matrix. No allocation per update.
   */
  class Seg {
    readonly line: Line2;
    constructor(color: number, width: number, opacity: number, readonly dashed: boolean, parent: THREE.Object3D) {
      this.line = fat([0, 0, 0, 1, 0, 0], color, width, opacity, dashed);
      this.line.matrixAutoUpdate = false;
      parent.add(this.line);
    }
    /** Display-space line P(s) = p + s·d for s in [s0, s1], clipped to the box. */
    set(px: number, py: number, pz: number, dx: number, dy: number, dz: number, s0 = -1e9, s1 = 1e9): void {
      let lo = s0;
      let hi = s1;
      for (let a = 0; a < 3; a++) {
        const p = a === 0 ? px : a === 1 ? py : pz;
        const d = a === 0 ? dx : a === 1 ? dy : dz;
        if (Math.abs(d) < 1e-12) {
          if (Math.abs(p) > B) lo = Infinity;
          continue;
        }
        let t1 = (-B - p) / d;
        let t2 = (B - p) / d;
        if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
        if (t1 > lo) lo = t1;
        if (t2 < hi) hi = t2;
      }
      if (!(hi > lo)) {
        this.line.visible = false;
        return;
      }
      this.line.visible = true;
      const ax = px + lo * dx, ay = py + lo * dy, az = pz + lo * dz;
      const ex = (hi - lo) * dx, ey = (hi - lo) * dy, ez = (hi - lo) * dz;
      // Keep the determinant positive so the line's triangles are not back-face culled.
      this.line.matrix.set(ex, 0, 0, ax, ey, 1, 0, ay, ez, 0, ex < 0 ? -1 : 1, az, 0, 0, 0, 1);
      this.line.matrixWorldNeedsUpdate = true;
      if (this.dashed) (this.line.material as LineMaterial).dashScale = Math.hypot(ex, ey, ez);
    }
  }

  // =================================================================
  // Spacetime diagram
  // =================================================================
  const st = new THREE.Group();
  scene.add(st);

  const grid = makeGrid(2 * B, 9);
  st.add(grid);
  const boxEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * B, 2 * B, 2 * B)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.5 }),
  );
  st.add(boxEdges);
  const axes = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      -B, 0, 0, B, 0, 0,
      0, -B, 0, 0, B, 0,
      0, 0, -B, 0, 0, B,
    ], 3)),
    new THREE.LineBasicMaterial({ color: 0x55627e }),
  );
  st.add(axes);
  stage.label('ct', [0, B + 0.3, 0], 'big', st);
  stage.label('x', [B + 0.35, 0, 0], 'big', st);
  stage.label('y', [0, 0, B + 0.35], 'big', st);
  const frameLabel = stage.label('rest frame', [-B, B + 0.35, -B], 'big', st);

  // --- Light cone from the origin (invariant, so it lives in world space)
  const coneGroup = new THREE.Group();
  st.add(coneGroup);
  const coneMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const futureGeo = new THREE.ConeGeometry(B, B, 72, 1, true);
  futureGeo.rotateX(Math.PI).translate(0, B / 2, 0);
  const pastGeo = new THREE.ConeGeometry(B, B, 72, 1, true);
  pastGeo.translate(0, -B / 2, 0);
  coneGroup.add(new THREE.Mesh(futureGeo, coneMat), new THREE.Mesh(pastGeo, new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })));
  {
    const pts: number[] = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(0, 0, 0, B * Math.cos(a), B, B * Math.sin(a), 0, 0, 0, B * Math.cos(a), -B, B * Math.sin(a));
    }
    for (const h of [-B, -B / 2, B / 2, B]) {
      const m = 72;
      for (let i = 0; i < m; i++) {
        const a0 = (i / m) * Math.PI * 2;
        const a1 = ((i + 1) / m) * Math.PI * 2;
        const r = Math.abs(h);
        pts.push(r * Math.cos(a0), h, r * Math.sin(a0), r * Math.cos(a1), h, r * Math.sin(a1));
      }
    }
    const wire = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    coneGroup.add(wire);
    // The two light rays in the x–t plane, drawn bold: this is where c lives.
    coneGroup.add(fat([-B, B, 0, 0, 0, 0, B, B, 0], PALETTE.violet, 1.6, 0.85));
    coneGroup.add(fat([-B, -B, 0, 0, 0, 0, B, -B, 0], PALETTE.violet, 1.2, 0.5));
    stage.label('light cone', [B * Math.SQRT1_2, -B, B * Math.SQRT1_2], 'muted', coneGroup);
  }

  // --- Invariant hyperbolae (ct)² − x² = τ² in the x–t plane
  const hyperGroup = new THREE.Group();
  st.add(hyperGroup);
  {
    const N = 160;
    for (let k = 1; k <= 6; k++) {
      for (const sgn of [1, -1]) {
        const pos = new Float32Array((N + 1) * 3);
        for (let i = 0; i <= N; i++) {
          const eta = -3 + (6 * i) / N;
          pos[i * 3] = k * Math.sinh(eta);
          pos[i * 3 + 1] = sgn * k * Math.cosh(eta);
          pos[i * 3 + 2] = 0;
        }
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const line = new THREE.Line(g, thin(PALETTE.green, sgn > 0 ? 0.8 : 0.35));
        line.frustumCulled = false;
        hyperGroup.add(line);
      }
    }
    for (let k = 1; k <= 3; k++) stage.label(`τ=${k}`, [-0.12, k, 0], 'muted', hyperGroup).center.set(1, 1.1);
  }

  // --- Frame-dependent surfaces. disp holds the display boost Λ(βv) as a matrix.
  // Its children are in rest coordinates. rocketFrame adds Λ(−β), so its children are in rocket coordinates.
  // Planes are linear, so a matrix maps them exactly. Lines are clipped to the box on the CPU (see Seg).
  const disp = new THREE.Group();
  disp.matrixAutoUpdate = false;
  st.add(disp);
  const rocketFrame = new THREE.Group();
  rocketFrame.matrixAutoUpdate = false;
  disp.add(rocketFrame);

  function makeNowPlane(color: number): THREE.Mesh {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * FAR, 2 * FAR).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clip }),
    );
    plane.frustumCulled = false;
    return plane;
  }
  const restPlane = makeNowPlane(PALETTE.cyan);
  disp.add(restPlane);
  const rocketPlane = makeNowPlane(PALETTE.amber);
  rocketFrame.add(rocketPlane);

  // Lines drawn in display space: worldlines, the "now" lines, light rays from the strikes.
  const planeLines = new THREE.Group();
  st.add(planeLines);
  const lightning = new THREE.Group();
  st.add(lightning);
  const restWL = new Seg(PALETTE.cyan, 3.2, 1, false, st);
  const rocketWL = new Seg(PALETTE.amber, 3.2, 1, false, st);
  const restNow = [new Seg(PALETTE.cyan, 2.4, 0.95, false, planeLines), new Seg(PALETTE.cyan, 1, 0.4, false, planeLines), new Seg(PALETTE.cyan, 1, 0.4, false, planeLines)];
  const rocketNow = [new Seg(PALETTE.amber, 2.4, 0.95, false, planeLines), new Seg(PALETTE.amber, 1, 0.4, false, planeLines), new Seg(PALETTE.amber, 1, 0.4, false, planeLines)];
  const rays = [0, 1, 2, 3].map(() => new Seg(PALETTE.rose, 1.8, 0.9, false, lightning));
  const xPrime = new Seg(PALETTE.amber, 1.5, 0.9, true, lightning);
  const PLANE_Z = [0, B - 0.02, -B + 0.02];

  // Vertical gaps between each strike and the rocket's "now" through the origin (rest coordinates).
  const lightningRest = new THREE.Group();
  disp.add(lightningRest);
  const gapPos = new Float32Array(12);
  const gapGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(gapPos, 3));
  const gapLines = new THREE.LineSegments(gapGeo, thin(PALETTE.rose, 0.9));
  gapLines.frustumCulled = false;
  lightningRest.add(gapLines);

  // --- Point markers, positioned on the CPU so they stay round in any frame.
  const tickGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const ticks = new THREE.InstancedMesh(tickGeo, new THREE.MeshBasicMaterial(), TICKS * 4);
  ticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ticks.frustumCulled = false;
  const cCyan = new THREE.Color(PALETTE.cyan);
  const cAmber = new THREE.Color(PALETTE.amber);
  for (let i = 0; i < TICKS * 4; i++) ticks.setColorAt(i, i < TICKS * 2 ? cCyan : cAmber);
  st.add(ticks);

  const nowGeo = new THREE.SphereGeometry(0.15, 20, 14);
  const nowRest = new THREE.Mesh(nowGeo, new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  const nowRocket = new THREE.Mesh(nowGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  st.add(nowRest, nowRocket);
  const restLabel = stage.label('rest observer', [0, 0, 0], 'muted', st);
  const rocketLabel = stage.label('rocket', [0, 0, 0], 'muted', st);
  restLabel.center.set(1.05, 0.5);
  rocketLabel.center.set(-0.05, 0.5);

  const halo = haloTexture();
  const strikeGroup = new THREE.Group();
  st.add(strikeGroup);
  const strikeCores: THREE.Mesh[] = [];
  const strikeHalos: THREE.Sprite[] = [];
  const strikeLabels: CSS2DObject[] = [];
  for (let i = 0; i < 2; i++) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: PALETTE.rose, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.1);
    strikeGroup.add(core, sp);
    strikeCores.push(core);
    strikeHalos.push(sp);
    const lab = stage.label(i === 0 ? 'rear strike' : 'front strike', [0, 0, 0], '', strikeGroup);
    lab.center.set(0.5, -0.6);
    strikeLabels.push(lab);
  }

  // =================================================================
  // Light clocks
  // =================================================================
  const lc = new THREE.Group();
  lc.visible = false;
  scene.add(lc);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xe8eef8, metalness: 0.2, roughness: 0.35, emissive: 0x3a4660, emissiveIntensity: 0.6 });
  function makeClockBody(tint: number): THREE.Group {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.3, roughness: 0.5, emissive: tint, emissiveIntensity: 0.25 });
    const mGeo = new THREE.BoxGeometry(W0, 0.07, 0.5);
    const top = new THREE.Mesh(mGeo, mirrorMat);
    top.position.y = DV / 2 + 0.035;
    const bot = new THREE.Mesh(mGeo, mirrorMat);
    bot.position.y = -DV / 2 - 0.035;
    g.add(top, bot);
    const pGeo = new THREE.BoxGeometry(0.05, DV + 0.14, 0.05);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = new THREE.Mesh(pGeo, postMat);
        p.position.set((sx * (W0 - 0.05)) / 2, 0, sz * 0.22);
        g.add(p);
      }
    }
    return g;
  }
  const restClock = new THREE.Group();
  restClock.position.set(0, REST_Y, 0);
  restClock.add(makeClockBody(PALETTE.cyan));
  lc.add(restClock);
  const movClock = new THREE.Group();
  movClock.position.set(-TRACK, MOV_Y, 0);
  const movBody = makeClockBody(PALETTE.amber);
  movClock.add(movBody);
  lc.add(movClock);

  const photonGeo = new THREE.SphereGeometry(0.08, 16, 12);
  const photonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const photonHaloMat = new THREE.SpriteMaterial({ map: halo, color: PALETTE.rose, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  function makePhoton(): THREE.Group {
    const g = new THREE.Group();
    const s = new THREE.Sprite(photonHaloMat);
    s.scale.setScalar(0.6);
    g.add(new THREE.Mesh(photonGeo, photonMat), s);
    lc.add(g);
    return g;
  }
  const restPhoton = makePhoton();
  const movPhoton = makePhoton();
  const restTrail = new Trail(120, PALETTE.rose, 0.9);
  const movTrail = new Trail(900, PALETTE.rose, 0.95);
  lc.add(restTrail.line, movTrail.line);

  const track = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-TRACK - 1, MOV_Y - DV / 2 - 0.3, 0, TRACK + 1, MOV_Y - DV / 2 - 0.3, 0], 3)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor }),
  );
  lc.add(track);
  const restClockLabel = stage.label('', [0, REST_Y + DV / 2 + 0.45, 0], 'big', lc);
  const movClockLabel = stage.label('', [0, DV / 2 + 0.45, 0], 'big', movClock);
  const movLenLabel = stage.label('', [0, -DV / 2 - 0.4, 0], 'muted', movClock);
  stage.label('length L₀', [0, REST_Y - DV / 2 - 0.4, 0], 'muted', lc);
  const lcCaption = stage.label('', [0, MOV_Y - DV / 2 - 0.95, 0], 'muted', lc);

  // =================================================================
  // Per-frame update
  // =================================================================
  const ev = event();
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  const vPos = new THREE.Vector3();
  const vScale = new THREE.Vector3();
  const res = new THREE.Vector2();
  let lastW = 0;
  let lastH = 0;
  let appliedBv = NaN;
  let appliedBeta = NaN;
  let bv = 0;

  /** Rest-frame event → display position (three.js coords) under the current display boost. */
  function toDisplay(t: number, x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    boost(t, x, y, bv, ev);
    return out.set(ev.x, ev.t, ev.y);
  }
  const evD = event();
  /** Set a segment from a rest-frame point and direction, mapped into the display frame. */
  function segRest(sg: Seg, t: number, x: number, y: number, dt: number, dx: number, s0 = -1e9): void {
    boost(t, x, y, bv, ev);
    boost(dt, dx, 0, bv, evD);
    sg.set(ev.x, ev.t, ev.y, evD.x, evD.t, 0, s0);
  }
  const inBox = (p: THREE.Vector3) => Math.abs(p.x) <= B + 1e-6 && Math.abs(p.y) <= B + 1e-6 && Math.abs(p.z) <= B + 1e-6;

  function placeFrame(): void {
    const g = gamma(beta);
    if (beta !== appliedBeta) {
      setBoostMatrix(rocketFrame.matrix, -beta);
      rocketFrame.matrixWorldNeedsUpdate = true;
      gapPos.set([L, 0, 0, L, beta * L, 0, -L, 0, 0, -L, -beta * L, 0]);
      gapGeo.attributes.position.needsUpdate = true;
      appliedBeta = beta;
      appliedBv = NaN;
    }
    if (bv === appliedBv) return;
    appliedBv = bv;
    setBoostMatrix(disp.matrix, bv);
    disp.matrixWorldNeedsUpdate = true;
    segRest(restWL, 0, 0, 0, 1, 0);
    segRest(rocketWL, 0, 0, 0, 1, beta);
    segRest(xPrime, 0, 0, 0, beta, 1);
    segRest(rays[0], 0, -L, 0, 1, -1, 0);
    segRest(rays[1], 0, -L, 0, 1, 1, 0);
    segRest(rays[2], 0, L, 0, 1, -1, 0);
    segRest(rays[3], 0, L, 0, 1, 1, 0);
    // Ticks at equal proper time on both worldlines.
    let i = 0;
    for (let k = -TICKS; k <= TICKS; k++) {
      if (k === 0) continue;
      toDisplay(k, 0, 0, vPos);
      vScale.setScalar(inBox(vPos) ? 1 : 0);
      ticks.setMatrixAt(i++, m4.compose(vPos, qI, vScale));
    }
    for (let k = -TICKS; k <= TICKS; k++) {
      if (k === 0) continue;
      toDisplay(g * k, g * beta * k, 0, vPos);
      vScale.setScalar(inBox(vPos) ? 1 : 0);
      ticks.setMatrixAt(i++, m4.compose(vPos, qI, vScale));
    }
    ticks.instanceMatrix.needsUpdate = true;
    // Lightning strikes.
    for (let s = 0; s < 2; s++) {
      toDisplay(0, s === 0 ? -L : L, 0, vPos);
      const vis = inBox(vPos);
      strikeCores[s].position.copy(vPos);
      strikeHalos[s].position.copy(vPos);
      strikeLabels[s].position.copy(vPos);
      strikeCores[s].visible = strikeHalos[s].visible = strikeLabels[s].visible = vis;
    }
  }

  let tNow = 0;
  let tauNow = 0;
  let ratio = 1;

  function updateSpacetime(dt: number): void {
    // Boost animation: interpolate rapidity, so every in-between frame is a true Lorentz boost.
    const target = boosted ? 1 : 0;
    if (blend !== target) {
      const step = dt / BLEND_TIME;
      blend = target > blend ? Math.min(target, blend + step) : Math.max(target, blend - step);
    }
    const eased = blend * blend * (3 - 2 * blend);
    bv = Math.tanh(eased * rapidity(beta));
    placeFrame();

    if (playing) {
      u += dt * speed * U_RATE;
      if (u > U_MAX) u = 0;
    }
    // "Now" is the display frame's time u. Each observer's clock reading on that slice:
    const gv = gamma(bv);
    const gRel = gamma(relativeVelocity(beta, bv));
    tNow = u / gv;
    tauNow = u / gRel;
    ratio = gv / gRel;
    restPlane.position.y = tNow;
    rocketPlane.position.y = tauNow;

    const g = gamma(beta);
    for (let i = 0; i < 3; i++) {
      segRest(restNow[i], tNow, 0, PLANE_Z[i], 0, 1);
      segRest(rocketNow[i], g * tauNow, g * beta * tauNow, PLANE_Z[i], beta, 1);
    }
    toDisplay(tNow, 0, 0, vPos);
    nowRest.position.copy(vPos);
    nowRest.visible = inBox(vPos);
    toDisplay(g * tauNow, g * beta * tauNow, 0, vPos);
    nowRocket.position.copy(vPos);
    nowRocket.visible = inBox(vPos);

    // Worldline labels near the top of the box.
    const yTop = B - 0.35;
    restLabel.position.set(Math.max(-B, -bv * yTop) - 0.15, yTop, 0);
    rocketLabel.position.set(Math.min(B, relativeVelocity(beta, bv) * yTop) + 0.15, yTop, 0);
  }

  const tri = (p: number) => {
    const f = p - 2 * Math.floor(p / 2);
    return f < 1 ? f : 2 - f;
  };
  let shownRestTicks = -1;
  let shownMovTicks = -1;
  let shownBeta = -1;
  let lastRestBounce = 0;
  let lastMovBounce = 0;
  let lastLap = 0;

  function updateClocks(dt: number): void {
    if (playing) tLc += dt * speed;
    const g = gamma(beta);
    const tau = tLc / g;
    movBody.scale.x = 1 / g;

    const travel = beta * DV * tLc;
    const lap = Math.floor(travel / (2 * TRACK));
    const xm = -TRACK + (travel - lap * 2 * TRACK);
    if (lap !== lastLap) {
      movTrail.clear();
      lastLap = lap;
    }
    // Insert exact bounce points so the zig-zag keeps sharp corners at any frame rate.
    const rb = Math.floor(tLc);
    if (rb !== lastRestBounce && tLc > 0) {
      restTrail.push(0, REST_Y - DV / 2 + DV * tri(rb), 0);
      lastRestBounce = rb;
    }
    const mb = Math.floor(tau);
    if (mb !== lastMovBounce && tau > 0) {
      const tb = mb * g;
      const xb = -TRACK + (beta * DV * tb - lap * 2 * TRACK);
      if (xb >= -TRACK) movTrail.push(xb, MOV_Y - DV / 2 + DV * tri(mb), 0);
      lastMovBounce = mb;
    }
    restPhoton.position.set(0, REST_Y - DV / 2 + DV * tri(tLc), 0);
    movClock.position.x = xm;
    movPhoton.position.set(xm, MOV_Y - DV / 2 + DV * tri(tau), 0);
    if (playing) {
      restTrail.push(restPhoton.position.x, restPhoton.position.y, 0);
      movTrail.push(movPhoton.position.x, movPhoton.position.y, 0);
    }

    const nr = Math.floor(tLc / 2);
    const nm = Math.floor(tau / 2);
    if (nr !== shownRestTicks) setText(restClockLabel, `at rest: ${(shownRestTicks = nr)} tick${nr === 1 ? '' : 's'}`);
    if (nm !== shownMovTicks) setText(movClockLabel, `moving: ${(shownMovTicks = nm)} tick${nm === 1 ? '' : 's'}`);
    if (beta !== shownBeta) {
      shownBeta = beta;
      setText(movLenLabel, `length L₀/γ = ${(1 / g).toFixed(2)} L₀`);
      setText(lcCaption, `β = ${beta.toFixed(2)}. The moving photon runs a longer diagonal, so each tick takes γ = ${g.toFixed(2)} times longer.`);
    }
  }

  function setText(o: CSS2DObject, s: string): void {
    if (o.element.textContent !== s) o.element.textContent = s;
  }

  let frameState = -1;
  let frameBeta = -1;
  stage.onFrame((dt) => {
    renderer.getSize(res);
    if (res.x !== lastW || res.y !== lastH) {
      lastW = res.x;
      lastH = res.y;
      for (const m of lineMats) m.resolution.set(res.x, res.y);
    }
    if (view === 'spacetime') updateSpacetime(dt);
    else updateClocks(dt);
    const fs = blend >= 1 ? 2 : blend <= 0 ? 0 : 1;
    if (fs !== frameState || (fs === 2 && beta !== frameBeta)) {
      frameState = fs;
      frameBeta = beta;
      setText(frameLabel, fs === 2 ? `rocket frame (β = ${beta.toFixed(2)})` : fs === 0 ? 'rest frame' : 'boosting…');
    }
    updateReadouts();
  });

  // =================================================================
  // Controls
  // =================================================================
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.1, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'spacetime', label: 'Spacetime diagram' }, { value: 'clock', label: 'Light clock' }],
    onChange: (v) => setView(v),
  });

  ui.section('Rocket');
  ui.slider({ key: 'beta', label: 'Speed β = v/c', min: 0, max: 0.99, step: 0.01, value: beta, format: (v) => v.toFixed(2), onInput: (v) => { beta = v; } });
  ui.toggle({ key: 'boosted', label: 'Boosted view (rocket frame)', value: boosted, onChange: (v) => { boosted = v; } });

  ui.section('Show');
  ui.toggle({ key: 'cone', label: 'Light cone', value: showCone, onChange: (v) => { showCone = v; coneGroup.visible = v; } });
  ui.toggle({ key: 'planes', label: 'Planes of simultaneity', value: showPlanes, onChange: (v) => { showPlanes = v; restPlane.visible = rocketPlane.visible = planeLines.visible = v; } });
  ui.toggle({ key: 'hyperbolae', label: 'Hyperbolae of equal τ', value: showHyper, onChange: (v) => { showHyper = v; hyperGroup.visible = v; } });
  ui.toggle({ key: 'lightning', label: 'Lightning strikes', value: showLightning, onChange: (v) => { showLightning = v; lightningRest.visible = lightning.visible = strikeGroup.visible = v; } });

  ui.section('Live readouts');
  const rG = ui.readout('gamma', 'γ');
  const rT = ui.readout('t', 'rest clock t', 's');
  const rTau = ui.readout('tau', 'rocket clock τ', 's');
  const rRatio = ui.readout('ratio', 'τ / t');
  const rLen = ui.readout('contraction', 'L / L₀');
  const rGap = ui.readout('gap', 'Δt′ rear − front', 's');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'rest observer' },
    { color: css(PALETTE.amber), label: 'rocket' },
    { color: css(PALETTE.violet), label: 'light' },
    { color: css(PALETTE.green), label: 'equal proper time' },
    { color: css(PALETTE.rose), label: 'lightning' },
  ]);
  ui.note('Dots mark one second of proper time on each clock. The sheets are each observer’s “now”. In the rocket frame the rest clock is the one that runs slow.');

  function curT(): number {
    return view === 'spacetime' ? tNow : tLc;
  }
  function curTau(): number {
    return view === 'spacetime' ? tauNow : tLc / gamma(beta);
  }
  function curRatio(): number {
    return view === 'spacetime' ? ratio : 1 / gamma(beta);
  }
  const gap = () => 2 * gamma(beta) * beta * L;

  function updateReadouts(): void {
    rG(gamma(beta).toFixed(3));
    rT(curT().toFixed(2));
    rTau(curTau().toFixed(2));
    rRatio(curRatio().toFixed(3));
    rLen(contraction(beta).toFixed(3));
    rGap(gap().toFixed(2));
  }

  function setView(v: View): void {
    view = v;
    st.visible = v === 'spacetime';
    lc.visible = v === 'clock';
    if (v === 'spacetime') stage.flyTo(CAM_ST, TGT_ST);
    else stage.flyTo(CAM_LC, TGT_LC);
  }

  function reset(): void {
    u = 0;
    tLc = 0;
    lastRestBounce = 0;
    lastMovBounce = 0;
    lastLap = 0;
    shownRestTicks = shownMovTicks = -1;
    restTrail.clear();
    movTrail.clear();
  }

  reset();

  return {
    state: () => ({
      beta,
      gamma: gamma(beta),
      t: curT(),
      tau: curTau(),
      ratio: curRatio(),
      contraction: contraction(beta),
      gap: gap(),
      view,
      boosted,
      blend,
      lightning: showLightning,
      frontFirst: view === 'spacetime' && showLightning && boosted && blend >= 0.999 && beta > 0,
      playing,
      cone: showCone,
      planes: showPlanes,
      hyperbolae: showHyper,
    }),
    dispose: () => {
      halo.dispose();
      ticks.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'special-relativity',
  number: 7,
  title: 'Special Relativity',
  domain: 'relativity',
  level: 2,
  status: 'live',
  tagline: 'Moving clocks tick slower, and “now” depends on who is asking.',
  content,
  mount,
};

export default topic;
