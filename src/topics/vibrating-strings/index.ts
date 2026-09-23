import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  groupLevels,
  harmonicMass2,
  kkSpacing,
  levelMatched,
  massSquared,
  radiusFromLog,
  spectrum,
  stateKind,
  windingSpacing,
  writeClosedString,
  writeOpenString,
  type ClosedMode,
  type Level,
  type OpenMode,
  type StateKind,
} from './physics.ts';

type View = 'vibrate' | 'extra';

const TAU = Math.PI * 2;
const R_MAX = 5; // R slider spans 1/R_MAX .. R_MAX on a log scale
const LOOP_R = 2.2; // rest radius of the closed loop in the vibration view
const OPEN_HALF = 2.6; // half-length of the open string
const CYL_HALF = 100; // half-length of the large dimension
const X_MOM = -2.6; // where the momentum string sits on the cylinder
const X_WIND = 2.6; // where the winding string sits
const ZOOM_DIST = 150; // camera distance beyond which the circle counts as invisible

const CAM = {
  vibrate: { pos: [0.7, 2.7, 7.9] as [number, number, number], target: [0.7, -0.55, 0] as [number, number, number] },
  extra: { pos: [-5.2, 2.8, 8.4] as [number, number, number], target: [0.9, -0.4, 0] as [number, number, number] },
  far: { pos: [0, 70, 300] as [number, number, number], target: [0, 0, 0] as [number, number, number] },
};

const KIND_COLOR: Record<StateKind, number> = {
  tachyon: PALETTE.red,
  momentum: PALETTE.cyan,
  winding: PALETTE.amber,
  balanced: PALETTE.green,
  oscillator: PALETTE.violet,
};

/** Visual radius of the hidden circle for a physical radius R (compressed so both ends stay readable). */
const visRadius = (R: number) => 0.5 * Math.pow(R, 0.55);

/**
 * A thick glowing curve. Positions live in `pts` and are copied into the segment buffer of a
 * LineSegments2 in place, so updating it every frame allocates nothing.
 */
class GlowCurve {
  readonly group = new THREE.Group();
  readonly pts: Float32Array;
  private readonly segs: Float32Array;
  private readonly geo: LineSegmentsGeometry;
  private readonly mats: LineMaterial[] = [];

  constructor(readonly count: number, readonly closed: boolean, color: number, width: number, opts: { halo?: boolean; opacity?: number } = {}) {
    this.pts = new Float32Array(count * 3);
    const nseg = closed ? count : count - 1;
    this.segs = new Float32Array(nseg * 6);
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(this.segs);
    const opacity = opts.opacity ?? 1;
    const core = new LineMaterial({ color, linewidth: width, worldUnits: true, transparent: opacity < 1, opacity });
    core.toneMapped = false;
    this.mats.push(core);
    const coreLine = new LineSegments2(this.geo, core);
    coreLine.frustumCulled = false;
    this.group.add(coreLine);
    if (opts.halo !== false) {
      const halo = new LineMaterial({ color, linewidth: width * 3.6, worldUnits: true, transparent: true, opacity: 0.16 * opacity, depthWrite: false, blending: THREE.AdditiveBlending });
      halo.toneMapped = false;
      this.mats.push(halo);
      const haloLine = new LineSegments2(this.geo, halo);
      haloLine.frustumCulled = false;
      haloLine.renderOrder = 2;
      this.group.add(haloLine);
    }
  }

  commit(): void {
    const p = this.pts;
    const s = this.segs;
    const n = this.count;
    const nseg = this.closed ? n : n - 1;
    for (let i = 0; i < nseg; i++) {
      const a = i * 3;
      const b = ((i + 1) % n) * 3;
      const o = i * 6;
      s[o] = p[a];
      s[o + 1] = p[a + 1];
      s[o + 2] = p[a + 2];
      s[o + 3] = p[b];
      s[o + 4] = p[b + 1];
      s[o + 5] = p[b + 2];
    }
    (this.geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
  }

  setColor(hex: number): void {
    for (const m of this.mats) m.color.setHex(hex);
  }
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.vibrate.pos, target: CAM.vibrate.target, fov: 45, far: 1200 });
  const { scene, camera, controls } = stage;

  // --- State
  let view: View = 'vibrate';
  let playing = true;
  let speed = 1;
  let tt = 0;
  let harmonic = 3;
  let amp = 0.45;
  let closed = true;
  let mix = false;
  let R = 1.6;
  let n = 1;
  let w = 1;
  let N = 1;
  let Nt = 0;
  let swapOk = false;
  let zoomedOut = false;

  // =========================================================================
  // View 1: vibrating string
  // =========================================================================
  const vib = new THREE.Group();
  scene.add(vib);
  const floor = makeGrid(16, 32);
  floor.position.y = -3.1;
  vib.add(floor);

  const closedModes: ClosedMode[] = [];
  const openModes: OpenMode[] = [];
  const ghostClosed: ClosedMode[][] = [[], []];
  const ghostOpen: OpenMode[][] = [[], []];

  const loop = new GlowCurve(260, true, PALETTE.cyan, 0.075);
  vib.add(loop.group);
  const openStr = new GlowCurve(180, false, PALETTE.cyan, 0.075);
  vib.add(openStr.group);

  const ghosts = [0, 1].map(() => ({
    loop: new GlowCurve(160, true, PALETTE.violet, 0.035, { halo: false, opacity: 0.55 }),
    open: new GlowCurve(120, false, PALETTE.violet, 0.035, { halo: false, opacity: 0.55 }),
    group: new THREE.Group(),
  }));
  ghosts.forEach((g, i) => {
    g.group.position.set(i === 0 ? -2.3 : -0.1, -2.35, 0);
    g.group.add(g.loop.group, g.open.group);
    vib.add(g.group);
  });
  const ghostLabels = ghosts.map((g) => stage.label('', [0, -0.95, 0], 'muted', g.group));

  // Open-string end markers and the plates they are stuck to (D-branes)
  const endGroup = new THREE.Group();
  vib.add(endGroup);
  const endGeo = new THREE.SphereGeometry(0.1, 20, 14);
  const endMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber });
  const plateGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const plateMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const plateEdgeGeo = new THREE.EdgesGeometry(plateGeo);
  const plateEdgeMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.6 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(endGeo, endMat);
    e.position.x = s * OPEN_HALF;
    endGroup.add(e);
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.rotation.y = Math.PI / 2;
    plate.position.x = s * OPEN_HALF;
    endGroup.add(plate);
    const edge = new THREE.LineSegments(plateEdgeGeo, plateEdgeMat);
    edge.rotation.y = Math.PI / 2;
    edge.position.x = s * OPEN_HALF;
    endGroup.add(edge);
  }
  stage.label('end fixed on a brane', [-OPEN_HALF, 0.95, 0], 'muted', endGroup);

  const massLabel = stage.label('', [0, 2.25, 0], 'big', vib);
  stage.label('more wiggles → more energy → heavier particle', [0, 1.85, 0], 'muted', vib);

  // =========================================================================
  // View 2: extra dimension
  // =========================================================================
  const extra = new THREE.Group();
  extra.visible = false;
  scene.add(extra);

  // Unit-radius tube along x, scaled in y and z to the current radius.
  const tube = new THREE.Group();
  extra.add(tube);
  {
    const ringSegs = 28;
    const longs = 16;
    // Dense rings near the strings, sparse ones far away where they blur together anyway.
    const ringX: number[] = [];
    for (let x = -CYL_HALF; x <= CYL_HALF + 1e-9; x += Math.abs(x) < 16 ? 0.5 : 2) ringX.push(x);
    const verts = new Float32Array((ringX.length * ringSegs + longs) * 6);
    let o = 0;
    for (const x of ringX) {
      for (let k = 0; k < ringSegs; k++) {
        const a0 = (k / ringSegs) * TAU;
        const a1 = ((k + 1) / ringSegs) * TAU;
        verts.set([x, Math.cos(a0), Math.sin(a0), x, Math.cos(a1), Math.sin(a1)], o);
        o += 6;
      }
    }
    for (let k = 0; k < longs; k++) {
      const a = (k / longs) * TAU;
      verts.set([-CYL_HALF, Math.cos(a), Math.sin(a), CYL_HALF, Math.cos(a), Math.sin(a)], o);
      o += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    tube.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a4a6e, transparent: true, opacity: 0.5, depthWrite: false })));
    const skinGeo = new THREE.CylinderGeometry(1, 1, 2 * CYL_HALF, 48, 1, true);
    skinGeo.rotateZ(Math.PI / 2);
    tube.add(new THREE.Mesh(skinGeo, new THREE.MeshBasicMaterial({ color: 0x1a2a4c, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })));
  }

  const momWave = new GlowCurve(200, true, PALETTE.cyan, 0.022, { halo: false, opacity: 0.6 });
  const momLoop = new GlowCurve(120, true, PALETTE.cyan, 0.05);
  const windStr = new GlowCurve(420, true, PALETTE.amber, 0.05);
  extra.add(momWave.group, momLoop.group, windStr.group);

  const nearLabels = new THREE.Group();
  extra.add(nearLabels);
  const momLabel = stage.label('', [X_MOM, 1.5, 0], '', nearLabels);
  const windLabel = stage.label('', [X_WIND, 1.5, 0], '', nearLabels);
  const axisLabel = stage.label('large dimension →', [6.5, -1.3, 0], 'muted', nearLabels);
  const circleLabel = stage.label('', [0, -1.3, 0], 'muted', nearLabels);
  const farLabel = stage.label('From far away the tube is just a line. A tiny circle would be invisible.', [0, 14, 0], 'big', extra);
  farLabel.visible = false;

  // --- Curves drawn on the cylinder (plain math, reused buffers)
  function writeMomentum(t: number): void {
    const rv = visRadius(R);
    const omega = 0.55 * n; // angular drift speed around the circle grows with n
    const theta = omega * t + 0.6;
    // Wave around the circle with |n| crests travelling with the string.
    const p = momWave.pts;
    for (let k = 0; k < momWave.count; k++) {
      const a = (k / momWave.count) * TAU;
      p[k * 3] = X_MOM + 0.22 * Math.cos(n * (a - theta));
      p[k * 3 + 1] = (rv + 0.012) * Math.cos(a);
      p[k * 3 + 2] = (rv + 0.012) * Math.sin(a);
    }
    momWave.commit();
    // A small closed string sitting on the surface, sliding around the circle.
    const rho = Math.min(0.3, 0.75 * rv);
    const q = momLoop.pts;
    for (let k = 0; k < momLoop.count; k++) {
      const s = (k / momLoop.count) * TAU;
      const wig = 1 + 0.13 * Math.cos(3 * s - 4 * t);
      const da = (rho * wig * Math.sin(s)) / rv;
      const r = rv + 0.05;
      q[k * 3] = X_MOM + rho * 0.9 * wig * Math.cos(s);
      q[k * 3 + 1] = r * Math.cos(theta + da);
      q[k * 3 + 2] = r * Math.sin(theta + da);
    }
    momLoop.commit();
  }

  function writeWinding(t: number): void {
    const rv = visRadius(R);
    const theta0 = 0.55 * n * t - 0.8; // momentum n also makes the wound string slide around
    const aw = Math.abs(w);
    const hx = aw > 1 ? 0.28 * (aw - 1) + 0.15 : 0;
    const sN = Math.sqrt(N);
    const sNt = Math.sqrt(Nt);
    const p = windStr.pts;
    for (let k = 0; k < windStr.count; k++) {
      const s = (k / windStr.count) * TAU;
      // Oscillators: right movers (N) and left movers (Ñ) ripple along the string. The small
      // extra term stands in for zero-point jiggle, which never switches off.
      const ripple = 0.09 * (sN * Math.cos(4 * (s - t)) + sNt * Math.cos(4 * (s + t) + 1)) + 0.025 * Math.sin(6 * s - 3 * t);
      if (w === 0) {
        const rho = Math.min(0.3, 0.75 * rv);
        const da = (rho * Math.sin(s) * (1 + ripple)) / rv;
        const r = rv + 0.05;
        p[k * 3] = X_WIND + rho * 0.9 * Math.cos(s) * (1 + ripple);
        p[k * 3 + 1] = r * Math.cos(theta0 + da);
        p[k * 3 + 2] = r * Math.sin(theta0 + da);
      } else {
        const a = w * s + theta0;
        const r = rv * 1.04 + 0.04 + (aw > 1 ? 0.05 * Math.cos(s) : 0) + 0.3 * ripple * Math.min(1, rv);
        p[k * 3] = X_WIND + hx * Math.sin(s) + ripple;
        p[k * 3 + 1] = r * Math.cos(a);
        p[k * 3 + 2] = r * Math.sin(a);
      }
    }
    windStr.commit();
  }

  function placeRadiusDependents(): void {
    const rv = visRadius(R);
    tube.scale.set(1, rv, rv);
    momLabel.position.set(X_MOM, rv + 0.75, 0);
    windLabel.position.set(X_WIND, rv + 0.75, 0);
    axisLabel.position.set(6.5, -rv - 0.5, 0);
    circleLabel.position.set(0, -rv - 0.5, 0);
  }

  // =========================================================================
  // Inset overlay canvas (mass ladder or spectrum)
  // =========================================================================
  const inset = document.createElement('canvas');
  inset.className = 'st-inset';
  inset.width = 460;
  inset.height = 440;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '230px', height: '220px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const MONO = 'JetBrains Mono, ui-monospace, monospace';

  function drawLadder(): void {
    const W = inset.width;
    const H = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, H);
    c.font = `24px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText(closed ? 'closed string: mass ladder' : 'open string: mass ladder', 20, 38);
    const level = mix ? 2 * harmonic + 1 : harmonic;
    const top = Math.max(harmonicMass2(6, closed), harmonicMass2(level, closed));
    const y0 = H - 70;
    const y1 = 78;
    const yOf = (m2: number) => y0 - (m2 / top) * (y0 - y1);
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(72, y1 - 16);
    c.lineTo(72, y0 + 8);
    c.stroke();
    c.fillStyle = '#8391ab';
    c.font = `22px ${MONO}`;
    c.fillText('M²', 20, y1);
    c.fillText('0', 40, y0 + 8);
    for (let k = 1; k <= 6; k++) {
      const y = yOf(harmonicMass2(k, closed));
      const on = !mix && k === harmonic;
      const len = 90 + k * 30;
      c.strokeStyle = on ? css(PALETTE.cyan) : '#3a4a6e';
      c.lineWidth = on ? 9 : 5;
      c.beginPath();
      c.moveTo(84, y);
      c.lineTo(84 + len, y);
      c.stroke();
      c.fillStyle = on ? '#ffffff' : '#8391ab';
      c.font = `${on ? '700 ' : ''}22px ${MONO}`;
      c.fillText(`k=${k}`, 96 + len, y + 8);
    }
    if (mix) {
      const y = yOf(harmonicMass2(level, closed));
      c.strokeStyle = css(PALETTE.cyan);
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(84, y);
      c.lineTo(W - 120, y);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = `700 22px ${MONO}`;
      c.fillText(`${harmonic}+${harmonic + 1}`, W - 108, y + 8);
    }
    c.fillStyle = css(PALETTE.green);
    c.font = `22px ${MONO}`;
    c.fillText(closed ? 'k=1 massless: graviton' : 'k=1 massless: photon-like', 84, y0 + 48);
  }

  let levels: Level[] = [];
  let levelsR = NaN;
  const SPEC_MIN = -4.6;
  const SPEC_MAX = 6.5;

  function drawSpectrum(): void {
    if (levelsR !== R) {
      levels = groupLevels(spectrum(R, { nMax: 17, wMax: 17, NMax: 4, M2Max: SPEC_MAX }));
      levelsR = R;
    }
    const W = inset.width;
    const H = inset.height;
    const c = ictx;
    c.clearRect(0, 0, W, H);
    c.font = `24px ${MONO}`;
    c.fillStyle = '#9aa6bd';
    c.fillText('lowest mass levels', 20, 38);
    const x0 = 76;
    const x1 = W - 44;
    const y0 = H - 116;
    const y1 = 70;
    const yOf = (m2: number) => y0 - ((m2 - SPEC_MIN) / (SPEC_MAX - SPEC_MIN)) * (y0 - y1);
    c.font = `22px ${MONO}`;
    for (const m of [-4, 0, 4]) {
      const y = yOf(m);
      c.strokeStyle = m === 0 ? '#2c3852' : '#1c2436';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x0 - 6, y);
      c.lineTo(x1, y);
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(String(m), m < 0 ? 16 : 30, y + 8);
    }
    c.fillText('M²', 390, 38);
    // One block per state (n, w, N, Ñ), coloured by what dominates its mass.
    for (const L of levels) {
      const y = yOf(L.M2);
      const bw = Math.max(3, Math.min(18, (x1 - x0) / L.states.length - 3));
      let x = x0;
      for (const st of L.states) {
        if (x + bw > x1) break;
        c.fillStyle = css(KIND_COLOR[stateKind(st, R)]);
        c.fillRect(x, y - 4, bw, 8);
        x += bw + 3;
      }
    }
    // Marker for the selected state
    const m2 = massSquared(n, w, N, Nt, R);
    if (m2 <= SPEC_MAX && m2 >= SPEC_MIN) {
      const y = yOf(m2);
      c.fillStyle = levelMatched(n, w, N, Nt) ? '#ffffff' : '#ff6b6b';
      c.beginPath();
      c.moveTo(x1 + 8, y);
      c.lineTo(x1 + 30, y - 12);
      c.lineTo(x1 + 30, y + 12);
      c.closePath();
      c.fill();
    }
    // Log R axis with R, the dual radius 1/R and the self-dual point
    const ay = H - 40;
    const ax0 = 36;
    const ax1 = W - 36;
    const xR = (r: number) => ax0 + ((Math.log(r) / Math.log(R_MAX) + 1) / 2) * (ax1 - ax0);
    c.strokeStyle = '#3a4a6e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ax0, ay);
    c.lineTo(ax1, ay);
    c.moveTo(xR(1), ay - 12);
    c.lineTo(xR(1), ay + 12);
    c.stroke();
    c.font = `20px ${MONO}`;
    c.fillStyle = '#56627c';
    c.fillText('0.2', ax0 - 14, ay + 32);
    c.fillText('R=1', xR(1) - 18, ay + 32);
    c.fillText('5', ax1 - 6, ay + 32);
    c.strokeStyle = '#dfe6f3';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(xR(1 / R), ay, 9, 0, TAU);
    c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(xR(R), ay, 9, 0, TAU);
    c.fill();
    c.font = `22px ${MONO}`;
    c.fillStyle = '#dfe6f3';
    const lr = `R=${R.toFixed(2)}`;
    const ld = `1/R=${(1 / R).toFixed(2)}`;
    const place = (txt: string, x: number) => Math.min(W - 8 - c.measureText(txt).width, Math.max(8, x - c.measureText(txt).width / 2));
    c.fillText(lr, place(lr, xR(R)), ay - 20);
    c.fillStyle = '#9aa6bd';
    if (Math.abs(Math.log(R)) > 0.35) c.fillText(ld, place(ld, xR(1 / R)), ay - 20);
  }

  function drawInset(): void {
    if (view === 'vibrate') drawLadder();
    else drawSpectrum();
  }

  // =========================================================================
  // Mode setup for the vibration view
  // =========================================================================
  function rebuildModes(): void {
    const ks = mix ? [harmonic, harmonic + 1] : [harmonic];
    const amps = mix ? [amp, amp * 0.6] : [amp];
    closedModes.length = 0;
    openModes.length = 0;
    ks.forEach((k, i) => {
      // Right movers polarised vertically, left movers tilted toward the radial direction,
      // so the loop moves in all three dimensions.
      const cm: ClosedMode = { n: k, ampR: amps[i], ampL: amps[i] * 0.85, phiR: i * 1.3, phiL: 0.4 + i, polR: Math.PI / 2, polL: Math.PI / 2 - 0.45 + i * 0.5 };
      const om: OpenMode = { n: k, amp: amps[i] * 1.2, phase: i * 1.1, pol: 0.35 + i * 1.1 };
      closedModes.push(cm);
      openModes.push(om);
      ghostClosed[i] = [{ ...cm, ampR: cm.ampR * 0.5, ampL: cm.ampL * 0.5 }];
      ghostOpen[i] = [{ ...om, amp: om.amp * 0.5 }];
      ghostLabels[i].element.textContent = `harmonic ${k}`;
    });
    ghosts.forEach((g, i) => (g.group.visible = mix && i < ks.length));
    loop.group.visible = closed;
    openStr.group.visible = !closed;
    endGroup.visible = !closed;
    ghosts.forEach((g) => {
      g.loop.group.visible = closed;
      g.open.group.visible = !closed;
    });
    const level = mix ? 2 * harmonic + 1 : harmonic;
    const m2 = harmonicMass2(level, closed);
    const what = mix ? `harmonics ${harmonic} + ${harmonic + 1}` : `harmonic ${harmonic}`;
    const lvl = closed ? `N = Ñ = ${level}` : `N = ${level}`;
    massLabel.element.textContent = m2 === 0 ? `${what} → ${lvl} → massless (${closed ? 'graviton, spin 2' : 'photon-like, spin 1'})` : `${what} → ${lvl} → M² = ${m2} / α′`;
    drawInset();
  }

  // =========================================================================
  // Frame loop
  // =========================================================================
  stage.onFrame((dt) => {
    if (playing) tt += dt * speed * 1.2;
    if (view === 'vibrate') {
      if (closed) {
        writeClosedString(loop.pts, loop.count, tt, closedModes, LOOP_R);
        loop.commit();
      } else {
        writeOpenString(openStr.pts, openStr.count, tt, openModes, 'fixed', OPEN_HALF);
        openStr.commit();
      }
      if (mix) {
        for (let i = 0; i < 2; i++) {
          const g = ghosts[i];
          if (closed) {
            writeClosedString(g.loop.pts, g.loop.count, tt, ghostClosed[i], LOOP_R * 0.36);
            g.loop.commit();
          } else {
            writeOpenString(g.open.pts, g.open.count, tt, ghostOpen[i], 'fixed', OPEN_HALF * 0.36);
            g.open.commit();
          }
        }
      }
    } else {
      writeMomentum(tt);
      writeWinding(tt);
      const far = camera.position.distanceTo(controls.target) > ZOOM_DIST;
      if (far !== zoomedOut) {
        zoomedOut = far;
        nearLabels.visible = !far;
        farLabel.visible = far;
      }
    }
  });

  // =========================================================================
  // Controls
  // =========================================================================
  const ui = new Panel(panel);
  ui.section('View');
  const viewCtl = ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'vibrate', label: 'Vibrating string' }, { value: 'extra', label: 'Extra dimension' }],
    onChange: (v) => setView(v),
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
  ]);
  ui.slider({ key: 'speed', label: 'Speed', min: 0.1, max: 2, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Vibrating string');
  const vibCtl = () => { if (view !== 'vibrate') viewCtl.set('vibrate'); };
  ui.slider({ key: 'harmonic', label: 'Harmonic k', min: 1, max: 6, step: 1, value: harmonic, onInput: (v) => { harmonic = v; vibCtl(); rebuildModes(); } });
  ui.slider({ key: 'amp', label: 'Amplitude', min: 0.05, max: 0.6, step: 0.01, value: amp, onInput: (v) => { amp = v; vibCtl(); rebuildModes(); } });
  ui.toggle({ key: 'closed', label: 'Closed loop (off: open string)', value: closed, onChange: (v) => { closed = v; vibCtl(); rebuildModes(); } });
  ui.toggle({ key: 'mix', label: 'Add harmonic k+1 (shows ghosts)', value: mix, onChange: (v) => { mix = v; vibCtl(); rebuildModes(); } });

  ui.section('Extra dimension');
  const extraCtl = () => { if (view !== 'extra') viewCtl.set('extra'); };
  const rCtl = ui.slider({
    key: 'R', label: 'Radius R (log scale)', min: -1, max: 1, step: 0.001, value: Math.log(R) / Math.log(R_MAX),
    format: (u) => radiusFromLog(u, R_MAX).toFixed(3),
    onInput: (u) => { R = radiusFromLog(u, R_MAX); extraCtl(); onQuantum(); },
  });
  const nCtl = ui.slider({ key: 'n', label: 'Momentum n', min: -3, max: 3, step: 1, value: n, onInput: (v) => { n = v; extraCtl(); onQuantum(); } });
  const wCtl = ui.slider({ key: 'w', label: 'Winding w', min: -3, max: 3, step: 1, value: w, onInput: (v) => { w = v; extraCtl(); onQuantum(); } });
  ui.slider({ key: 'N', label: 'Right-moving level N', min: 0, max: 3, step: 1, value: N, onInput: (v) => { N = v; extraCtl(); onQuantum(); } });
  ui.slider({ key: 'Nt', label: 'Left-moving level Ñ', min: 0, max: 3, step: 1, value: Nt, onInput: (v) => { Nt = v; extraCtl(); onQuantum(); } });
  ui.buttons([
    {
      label: 'Swap R ↔ 1/R', primary: true, key: 'R',
      onClick: () => {
        extraCtl();
        const before = massSquared(n, w, N, Nt, R);
        R = 1 / R;
        const t = n;
        n = w;
        w = t;
        rCtl.set(Math.log(R) / Math.log(R_MAX), false);
        nCtl.set(n, false);
        wCtl.set(w, false);
        const after = massSquared(n, w, N, Nt, R);
        if (Math.abs(after - before) < 1e-9) swapOk = true;
        onQuantum();
      },
    },
    { label: 'Zoom out', onClick: () => { extraCtl(); stage.flyTo(CAM.far.pos, CAM.far.target, 2.4); } },
    { label: 'Zoom in', onClick: () => { extraCtl(); stage.flyTo(CAM.extra.pos, CAM.extra.target, 2.0); } },
  ]);

  ui.section('Your state');
  const rM2 = ui.readout('M2', 'mass² M²');
  const rMatch = ui.readout('match', 'level matching');
  const rKK = ui.readout('kk', 'KK spacing 1/R');
  const rWind = ui.readout('wind', 'winding spacing R');
  const rDual = ui.readout('dual', 'dual check');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'momentum-heavy' },
    { color: css(PALETTE.amber), label: 'winding-heavy' },
    { color: css(PALETTE.green), label: 'equal mix' },
    { color: css(PALETTE.violet), label: 'vibration only' },
    { color: css(PALETTE.red), label: 'tachyon' },
  ]);
  ui.note('Bars in the corner count distinct (n, w, N, Ñ). The swap turns cyan into amber but leaves every level in place. Units: α′ = 1.');

  function onQuantum(): void {
    const m2 = massSquared(n, w, N, Nt, R);
    const ok = levelMatched(n, w, N, Nt);
    const dual = massSquared(w, n, N, Nt, 1 / R);
    rM2(`${m2.toFixed(3)}${ok ? '' : ' (not allowed)'}`);
    rMatch(ok ? `holds: ${N - Nt} = ${n * w}` : `fails: N−Ñ = ${N - Nt}, n·w = ${n * w}`);
    rKK(kkSpacing(R).toFixed(3));
    rWind(windingSpacing(R).toFixed(3));
    rDual(`${dual.toFixed(3)} at R = ${(1 / R).toFixed(3)} ${Math.abs(dual - m2) < 1e-9 ? '✓' : '✗'}`);
    momLabel.element.textContent = `momentum n = ${n}: costs n/R = ${(n / R).toFixed(2)}`;
    windLabel.element.textContent = `winding w = ${w}: costs wR = ${(w * R).toFixed(2)}`;
    circleLabel.element.textContent = `tiny circle, radius R = ${R.toFixed(2)}`;
    placeRadiusDependents();
    if (view === 'extra') drawInset();
  }

  function setView(v: View): void {
    view = v;
    vib.visible = v === 'vibrate';
    extra.visible = v === 'extra';
    if (v === 'vibrate') {
      zoomedOut = false;
      nearLabels.visible = true;
      farLabel.visible = false;
      stage.flyTo(CAM.vibrate.pos, CAM.vibrate.target, 1.2);
    } else {
      stage.flyTo(CAM.extra.pos, CAM.extra.target, 1.2);
    }
    drawInset();
  }

  rebuildModes();
  onQuantum();

  return {
    state: () => ({
      view, playing, speed, harmonic, amp, closed, mix,
      R, n, w, N, Nt,
      M2: massSquared(n, w, N, Nt, R),
      matched: levelMatched(n, w, N, Nt),
      swapOk, zoomedOut,
    }),
    dispose: () => {
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'vibrating-strings',
  number: 18,
  title: 'Strings & Extra Dimensions',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'Particles as vibration modes, and dimensions curled too small to see.',
  content,
  mount,
};

export default topic;
