import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  PAIRS, barrierHeight, contactRadius, coulomb, gamowEnergy, gamowPeak, gamowWidth, heatingRates, kTkeV,
  neutrinoFlux, ppIChain, protonLifetimeYears, tempExponents, tunnelFactor, turningPoint, type PairId,
} from './physics.ts';

type View = 'chain' | 'barrier';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  chain: { pos: [-0.5, 0.9, 14.2], target: [-0.5, -0.1, 0] },
  barrier: { pos: [0.8, 8.2, 12.6], target: [0.2, 0.7, 0] },
};

const CHAIN = ppIChain();
const Q_TOTAL = CHAIN.reduce((a, s) => a + s.times * s.Q, 0);
const NEUTRON = 0x9aa6bd;

// ---- Chain layout -----------------------------------------------------------
const YA = 1.45; // lane height
const NR = 0.23; // nucleon radius
const STEP_TIME = 3.2; // seconds per reaction at speed 1
const HOLD = 0.9; // pause between reactions while playing
const F1X = -4.5; // step 1 meeting point
const F2X = -2.3; // step 2 meeting point
const F3: V3 = [1.7, 0, 0]; // step 3 meeting point

/** Nucleon positions before step 1, after step 1, after step 2, after step 3. Six nucleons: A lane 0..2, B lane 3..5. */
function buildLayouts(): V3[][] {
  const lane = (sg: number): V3[][] => {
    const y = sg * YA;
    return [
      [[-6.0, y, 0], [-3.2, y, 0], [-0.4, y, 0]],
      [[F1X - NR, y, 0], [F1X + NR, y, 0], [-0.4, y, 0]],
      [[F2X - NR, y + sg * 0.14, 0], [F2X + NR, y + sg * 0.14, 0], [F2X, y - sg * 0.26, 0]],
    ];
  };
  const a = lane(1);
  const b = lane(-1);
  const t = NR * 0.82;
  const he: V3[] = [
    [F3[0] + t, t, t], [F3[0] - t, -t, t], [F3[0] - t, t, -t], [F3[0] + t, -t, -t],
  ];
  const L: V3[][] = [];
  for (let k = 0; k < 3; k++) L.push([...a[k], ...b[k]]);
  // after step 3: nucleons 0,1 (A) and 3,4 (B) form helium-4, 2 and 5 fly off
  L.push([he[0], he[1], [4.7, 1.5, 0.6], he[2], he[3], [4.7, -1.5, 0.6]]);
  return L;
}
const LAYOUT = buildLayouts();
const HE4_IDX = [0, 1, 3, 4];
const EJECT_VIA: V3[] = [[F3[0] + 0.1, 0.35, 0], [F3[0] + 0.1, -0.35, 0]];

// ---- Barrier layout ---------------------------------------------------------
const SMAX = 6.0; // scene radius of the plot
const SR = 0.55; // scene radius of the nuclear edge
const KR = 1.3; // scene units per decade of radius
const HK = 1.05; // scene units per decade of energy
const VF = 0.3; // keV at floor level
const WELL_Y = -1.3;
const WAVE_N = 260;

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 2;
const hOf = (VkeV: number) => HK * Math.log10(Math.max(VkeV, VF) / VF);
const fmtSci = (v: number, d = 1) => {
  if (!Number.isFinite(v) || v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return v.toFixed(Math.max(0, d + 1 - Math.max(0, e + 1)));
  const m = v / 10 ** e;
  return `${m.toFixed(d)}e${e}`;
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.chain.pos, target: CAM.chain.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  // --- Parameters
  let view: View = 'chain';
  let TMK = 15.7;
  let pairId: PairId = 'pp';
  let Eprobe = 20; // keV
  let playing = true;
  let speed = 1;
  let touched = false;

  const chainG = new THREE.Group();
  const barrierG = new THREE.Group();
  scene.add(chainG, barrierG);
  barrierG.visible = false;

  const tex = glowTexture();

  // =========================================================================
  // Chain view
  const plasmaGeo = new THREE.BufferGeometry();
  {
    const n = 420;
    const pos = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -10 + rnd() * 18;
      pos[i * 3 + 1] = -5 + rnd() * 10;
      pos[i * 3 + 2] = -9 + rnd() * 6;
    }
    plasmaGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const plasma = new THREE.Points(plasmaGeo, new THREE.PointsMaterial({ color: PALETTE.amber, size: 0.06, transparent: true, opacity: 0.35, depthWrite: false }));
  chainG.add(plasma);

  const nucGeo = new THREE.SphereGeometry(NR, 28, 18);
  const protonMat = new THREE.MeshStandardMaterial({ color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.05 });
  const neutronMat = new THREE.MeshStandardMaterial({ color: NEUTRON, emissive: NEUTRON, emissiveIntensity: 0.12, roughness: 0.4, metalness: 0.1 });
  const nucleons: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(nucGeo, protonMat);
    chainG.add(m);
    nucleons.push(m);
  }

  // Leptons and photons
  const smallGeo = new THREE.SphereGeometry(0.1, 16, 10);
  const posMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose });
  const eleMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });
  const streakGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true);
  const nuMat = new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.95 });
  const gamMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.95 });

  interface Streak { mesh: THREE.Mesh; dir: THREE.Vector3; origin: THREE.Vector3 }
  const UP = new THREE.Vector3(0, 1, 0);
  const makeStreak = (mat: THREE.Material, dir: V3, origin: V3): Streak => {
    const mesh = new THREE.Mesh(streakGeo, mat);
    const d = new THREE.Vector3(...dir).normalize();
    mesh.quaternion.setFromUnitVectors(UP, d);
    mesh.visible = false;
    chainG.add(mesh);
    return { mesh, dir: d, origin: new THREE.Vector3(...origin) };
  };
  const setStreak = (s: Streak, head: number, len: number) => {
    const l = Math.min(len, head);
    s.mesh.visible = l > 0.01;
    s.mesh.scale.set(1, Math.max(0.01, l), 1);
    s.mesh.position.copy(s.origin).addScaledVector(s.dir, head - l / 2);
  };

  interface Lane {
    sg: number;
    positron: THREE.Mesh;
    electron: THREE.Mesh;
    annih: THREE.Vector3;
    posDir: THREE.Vector3;
    eStart: THREE.Vector3;
    nu: Streak;
    g1: Streak;
    g2: Streak;
    gCap: Streak;
    nuLabel: CSS2DObject;
    annLabel: CSS2DObject;
    capLabel: CSS2DObject;
  }
  const lanes: Lane[] = [1, -1].map((sg) => {
    const F: V3 = [F1X, sg * YA, 0];
    const posDir = new THREE.Vector3(0.9, sg * 0.55, 0.5).normalize();
    const annih = new THREE.Vector3(...F).addScaledVector(posDir, 1.25);
    const positron = new THREE.Mesh(smallGeo, posMat);
    const electron = new THREE.Mesh(smallGeo, eleMat);
    positron.visible = electron.visible = false;
    chainG.add(positron, electron);
    const eStart = annih.clone().add(new THREE.Vector3(1.3, sg * 0.5, -0.5));
    const a: V3 = [annih.x, annih.y, annih.z];
    const nuLabel = stage.label('νₑ leaves the Sun', [0, 0, 0], 'muted', chainG);
    nuLabel.element.style.color = css(PALETTE.green);
    const annLabel = stage.label('e⁺ + e⁻ → γ γ', [annih.x + 0.2, annih.y + sg * 0.45, annih.z], 'muted', chainG);
    annLabel.element.style.color = css(PALETTE.rose);
    const capLabel = stage.label('γ  5.49 MeV', [F2X + 0.9, sg * (YA + 1.2), 0.3], 'muted', chainG);
    capLabel.element.style.color = css(PALETTE.amber);
    return {
      sg, positron, electron, annih, posDir, eStart,
      nu: makeStreak(nuMat, [-0.25, sg * 0.3, 1], F),
      g1: makeStreak(gamMat, [1, sg * 0.25, 0.7], a),
      g2: makeStreak(gamMat, [-1, -sg * 0.25, -0.7], a),
      gCap: makeStreak(gamMat, [0.25, sg * 1, 0.45], [F2X, sg * YA, 0]),
      nuLabel, annLabel, capLabel,
    };
  });

  // Flash sprites
  interface Flash { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; max: number; size: number }
  const flashes: Flash[] = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    chainG.add(sprite);
    flashes.push({ sprite, mat, life: 0, max: 1, size: 1 });
  }
  let flashNext = 0;
  const flash = (x: number, y: number, z: number, color: number, size: number, dur = 0.7) => {
    const f = flashes[flashNext];
    flashNext = (flashNext + 1) % flashes.length;
    f.sprite.position.set(x, y, z);
    f.mat.color.setHex(color);
    f.life = f.max = dur;
    f.size = size;
    f.sprite.visible = true;
  };

  // Step labels
  const banner = stage.label('', [-0.5, -3.55, 0], 'big', chainG);
  const heLabel = stage.label('⁴He', [F3[0], -0.75, 0], 'big', chainG);
  const lab = (t: string, at: V3) => stage.label(t, at, 'muted', chainG);
  const dLabels = [lab('d', [F1X, YA + 0.5, 0]), lab('d', [F1X, -YA - 0.5, 0])];
  const he3Labels = [lab('³He', [F2X, YA + 0.62, 0]), lab('³He', [F2X, -YA - 0.62, 0])];
  const pLabels = [lab('p back to the pool', [4.7, 1.0, 0.6]), lab('p back to the pool', [4.7, -2.0, 0.6])];

  // --- Chain state
  let done = 0; // completed reactions 0..3
  let animating = false;
  let u = 0;
  let prevU = 0;
  let hold = HOLD;
  let chainDone = false;
  let runTouched = false;
  let released = 0;
  let nuCarried = 0;

  const tv = new THREE.Vector3();
  function placeChain(t: number): void {
    const k = done;
    const from = LAYOUT[Math.min(k, 3)];
    const to = LAYOUT[Math.min(k + 1, 3)];
    for (let i = 0; i < 6; i++) {
      const a = from[i];
      const b = animating ? to[i] : a;
      let x: number, y: number, z: number;
      if (animating && k === 2 && (i === 2 || i === 5)) {
        const via = EJECT_VIA[i === 2 ? 0 : 1];
        if (u < 0.5) {
          const e = smooth(u / 0.5);
          x = a[0] + (via[0] - a[0]) * e; y = a[1] + (via[1] - a[1]) * e; z = a[2] + (via[2] - a[2]) * e;
        } else {
          const e = easeOut((u - 0.5) / 0.5);
          x = via[0] + (b[0] - via[0]) * e; y = via[1] + (b[1] - via[1]) * e; z = via[2] + (b[2] - via[2]) * e;
        }
      } else {
        const e = animating ? smooth(u / 0.55) : 0;
        x = a[0] + (b[0] - a[0]) * e; y = a[1] + (b[1] - a[1]) * e; z = a[2] + (b[2] - a[2]) * e;
      }
      const moving = animating && (a[0] !== b[0] || a[1] !== b[1]);
      const jig = moving ? 0 : 0.035;
      nucleons[i].position.set(x + jig * Math.sin(t * 2.3 + i * 1.7), y + jig * Math.sin(t * 3.1 + i), z + jig * Math.cos(t * 2.7 + i * 2.1));
    }
    const neutrons = done >= 1 || (animating && done === 0 && u >= 0.5);
    nucleons[1].material = neutrons ? neutronMat : protonMat;
    nucleons[4].material = neutrons ? neutronMat : protonMat;
    // 4He spins gently once formed
    if (done === 3) {
      for (const i of HE4_IDX) {
        tv.set(nucleons[i].position.x - F3[0], nucleons[i].position.y - F3[1], nucleons[i].position.z - F3[2]);
        tv.applyAxisAngle(UP, t * 0.8);
        nucleons[i].position.set(F3[0] + tv.x, F3[1] + tv.y, F3[2] + tv.z);
      }
    }
  }

  function placeProducts(): void {
    const s1 = animating && done === 0;
    const s2 = animating && done === 1;
    for (const L of lanes) {
      // positron and electron
      const pe = s1 && u >= 0.5 && u < 0.74;
      L.positron.visible = L.electron.visible = pe;
      if (pe) {
        const f = (u - 0.5) / 0.24;
        L.positron.position.set(F1X, L.sg * YA, 0).addScaledVector(L.posDir, 1.25 * easeOut(f));
        L.electron.position.lerpVectors(L.eStart, L.annih, smooth(f));
      }
      if (s1 && u >= 0.5 && u < 0.9) setStreak(L.nu, (u - 0.5) * 38, 1.6);
      else L.nu.mesh.visible = false;
      L.nuLabel.visible = s1 && u >= 0.52 && u < 0.95;
      if (L.nuLabel.visible) L.nuLabel.position.copy(L.nu.origin).addScaledVector(L.nu.dir, Math.min(2.6, (u - 0.5) * 38));
      const gg = s1 && u >= 0.74 && u < 0.98;
      if (gg) {
        setStreak(L.g1, (u - 0.74) * 16, 0.9);
        setStreak(L.g2, (u - 0.74) * 16, 0.9);
      } else {
        L.g1.mesh.visible = L.g2.mesh.visible = false;
      }
      L.annLabel.visible = s1 && u >= 0.74;
      if (s2 && u >= 0.5 && u < 0.92) setStreak(L.gCap, (u - 0.5) * 14, 1.0);
      else L.gCap.mesh.visible = false;
      L.capLabel.visible = s2 && u >= 0.55;
    }
    for (let i = 0; i < 2; i++) {
      dLabels[i].visible = done === 1 && !animating;
      he3Labels[i].visible = done === 2 && !animating;
      pLabels[i].visible = done === 3 || (animating && done === 2 && u > 0.8);
    }
    heLabel.visible = done === 3 || (animating && done === 2 && u > 0.6);
  }

  function writeBanner(): void {
    const k = animating ? done : done - 1;
    if (k < 0) {
      banner.element.innerHTML = 'Six protons in the solar core. Press <b>Step</b>.';
      return;
    }
    const s = CHAIN[k];
    const times = s.times === 2 ? ' (twice)' : '';
    banner.element.innerHTML = `Step ${k + 1} of 3 &nbsp;${s.eq}${times} &nbsp;<span style="color:${css(PALETTE.amber)}">Q = ${s.Q.toFixed(3)} MeV</span>`;
  }

  function finishStep(): void {
    const s = CHAIN[done];
    released += s.times * s.Q;
    nuCarried += s.times * s.nu;
    done++;
    animating = false;
    u = 0;
    hold = 0;
    if (done === 3 && runTouched) chainDone = true;
    writeBanner();
    updateTally();
  }

  function startStep(): void {
    if (done >= 3) resetChain();
    if (done === 0) runTouched = touched;
    animating = true;
    u = 0;
    prevU = 0;
    writeBanner();
  }

  function resetChain(): void {
    done = 0;
    animating = false;
    u = 0;
    hold = 0;
    released = 0;
    nuCarried = 0;
    writeBanner();
    updateTally();
  }

  function onCross(): void {
    // Called once when u passes a trigger point
    if (done === 0) {
      if (prevU < 0.5 && u >= 0.5) for (const L of lanes) flash(F1X, L.sg * YA, 0, 0xffe6b0, 1.6);
      if (prevU < 0.74 && u >= 0.74) for (const L of lanes) flash(L.annih.x, L.annih.y, L.annih.z, PALETTE.rose, 1.3);
    } else if (done === 1) {
      if (prevU < 0.5 && u >= 0.5) for (const L of lanes) flash(F2X, L.sg * YA, 0, 0xffd27a, 1.8);
    } else if (done === 2) {
      if (prevU < 0.5 && u >= 0.5) flash(F3[0], F3[1], F3[2], 0xfff2c4, 3.0, 1.0);
    }
  }

  // =========================================================================
  // Barrier view
  const floor = makeGrid(16, 32);
  floor.position.y = -0.005;
  barrierG.add(floor);

  const surfMat = new THREE.MeshStandardMaterial({ color: PALETTE.violet, emissive: PALETTE.violet, emissiveIntensity: 0.18, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 });
  let surf: THREE.Mesh | null = null;
  const unitCircle = new THREE.BufferGeometry();
  {
    const n = 96;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = Math.cos((2 * Math.PI * i) / n);
      p[i * 3 + 2] = Math.sin((2 * Math.PI * i) / n);
    }
    unitCircle.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  const contourMat = new THREE.LineBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.55 });
  const contourV = [1, 10, 100, 1000];
  const contours = contourV.map(() => {
    const c = new THREE.LineLoop(unitCircle, contourMat);
    barrierG.add(c);
    return c;
  });
  const rimRing = new THREE.LineLoop(unitCircle, new THREE.LineBasicMaterial({ color: PALETTE.violet }));
  barrierG.add(rimRing);

  // Well
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x2a3552, emissive: PALETTE.green, emissiveIntensity: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true), wellMat);
  barrierG.add(well);
  const wellBottom = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  wellBottom.rotation.x = -Math.PI / 2;
  barrierG.add(wellBottom);

  // Energy plane and turning ring
  const ePlane = new THREE.Mesh(new THREE.CircleGeometry(SMAX, 72), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  ePlane.rotation.x = -Math.PI / 2;
  barrierG.add(ePlane);
  const eEdge = new THREE.LineLoop(unitCircle, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.5 }));
  barrierG.add(eEdge);
  const turnRing = new THREE.LineLoop(unitCircle, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  barrierG.add(turnRing);

  // Contour labels (energy on the log height axis)
  const contourLabels = contourV.map((v) => {
    const l = stage.label(v >= 1000 ? `${v / 1000} MeV` : `${v} keV`, [0, 0, 0], 'muted', barrierG);
    l.element.style.fontSize = '11px';
    l.element.style.color = '#b9a6f5';
    return l;
  });
  const rTicks = new THREE.Group();
  barrierG.add(rTicks);
  const rTickLabels: CSS2DObject[] = [];
  const rTickGeo = new THREE.BufferGeometry();
  rTickGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 6), 3));
  rTicks.add(new THREE.LineSegments(rTickGeo, new THREE.LineBasicMaterial({ color: 0x56627c })));
  for (let i = 0; i < 4; i++) {
    const l = stage.label('', [0, 0, 0], 'muted', rTicks);
    l.element.style.fontSize = '11px';
    rTickLabels.push(l);
  }
  const rAxisLabel = stage.label('distance between nuclei (log) →', [SMAX * 0.5, 0, 1.45], 'muted', barrierG);
  rAxisLabel.element.style.fontSize = '11px';

  // Particle, ghost and wave
  const ballMat = new THREE.MeshStandardMaterial({ color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.4, roughness: 0.3 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), ballMat);
  barrierG.add(ball);
  const ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0.3, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), ghostMat);
  barrierG.add(ghost);
  const target = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12), new THREE.MeshStandardMaterial({ color: PALETTE.red, emissive: PALETTE.red, emissiveIntensity: 0.3 }));
  target.position.set(0, 0, 0);
  barrierG.add(target);
  const wavePos = new Float32Array(WAVE_N * 3);
  const waveGeo = new THREE.BufferGeometry();
  const waveAttr = new THREE.BufferAttribute(wavePos, 3).setUsage(THREE.DynamicDrawUsage);
  waveGeo.setAttribute('position', waveAttr);
  const wave = new THREE.Line(waveGeo, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5 }));
  wave.frustumCulled = false;
  barrierG.add(wave);
  const waveAmp = new Float32Array(WAVE_N);
  const waveS = new Float32Array(WAVE_N);

  const vcLabel = stage.label('', [0, 0, 0], '', barrierG);
  vcLabel.element.style.color = css(PALETTE.violet);
  const eLabel = stage.label('', [0, 0, 0], '', barrierG);
  eLabel.element.style.color = css(PALETTE.amber);
  const turnLabel = stage.label('', [0, 0, 0], 'muted', barrierG);
  const wellLabel = stage.label('nuclear well (strong force, not to scale)', [0, WELL_Y - 0.35, 0], 'muted', barrierG);
  wellLabel.element.style.color = css(PALETTE.green);
  const ghostLabel = stage.label('', [0, 0, 0], 'muted', barrierG);

  // Barrier geometry derived values
  let sT = 1; // scene radius of turning point
  let hE = 1; // scene height of E
  let hTop = 3;
  const sOfR = (rFm: number, R: number) => (rFm <= R ? (SR * rFm) / R : SR + KR * Math.log10(rFm / R));

  function buildBarrier(): void {
    const p = PAIRS[pairId];
    const R = contactRadius(p);
    const Vc = barrierHeight(p);
    hTop = hOf(Vc);
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(SR * 0.999, hTop));
    const N = 90;
    const rEnd = (p.Z1 * p.Z2 * 1439.964548) / VF;
    for (let i = 1; i <= N; i++) {
      const r = R * Math.pow(rEnd / R, i / N);
      pts.push(new THREE.Vector2(sOfR(r, R), hOf(coulomb(p, r))));
    }
    pts.push(new THREE.Vector2(SMAX, 0));
    if (surf) {
      barrierG.remove(surf);
      surf.geometry.dispose();
    }
    surf = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), surfMat);
    surf.renderOrder = 2;
    barrierG.add(surf);
    contourV.forEach((v, i) => {
      const r = (p.Z1 * p.Z2 * 1439.964548) / v;
      const c = contours[i];
      c.visible = v < Vc && sOfR(r, R) < SMAX;
      const s = sOfR(r, R);
      c.scale.set(s, 1, s);
      c.position.y = hOf(v);
      contourLabels[i].visible = c.visible;
      contourLabels[i].position.set(-s * 0.72, hOf(v) + 0.12, s * 0.72);
    });
    rimRing.scale.set(SR, 1, SR);
    rimRing.position.y = hTop;
    well.scale.set(SR, hTop - WELL_Y, SR);
    well.position.y = (hTop + WELL_Y) / 2;
    wellBottom.scale.set(SR, SR, 1);
    wellBottom.position.y = WELL_Y;
    vcLabel.position.set(-1.3, hTop + 0.4, 0);
    vcLabel.element.textContent = `V_C = ${Vc.toFixed(0)} keV at R = ${R.toFixed(1)} fm`;
    // radial ticks
    const arr = rTickGeo.attributes.position as THREE.BufferAttribute;
    const radii = [10, 100, 1000, 10000];
    radii.forEach((r, i) => {
      const s = sOfR(r, R);
      const ok = s < SMAX && r > R;
      arr.setXYZ(i * 2, s, 0.01, 0.0);
      arr.setXYZ(i * 2 + 1, s, 0.01, ok ? 0.35 : 0);
      rTickLabels[i].visible = ok;
      rTickLabels[i].position.set(s, 0.01, 0.62);
      rTickLabels[i].element.textContent = r >= 1000 ? `${r / 1000}k fm` : `${r} fm`;
    });
    arr.setXYZ(8, 0, 0.01, 0);
    arr.setXYZ(9, SMAX, 0.01, 0);
    arr.needsUpdate = true;
    ghostLabel.element.textContent = 'ghost: the tunneling path';
    updateEnergy();
  }

  function updateEnergy(): void {
    const p = PAIRS[pairId];
    const R = contactRadius(p);
    const Vc = barrierHeight(p);
    const rt = turningPoint(p, Eprobe);
    sT = Eprobe >= Vc ? SR : sOfR(rt, R);
    hE = hOf(Eprobe);
    ePlane.position.y = hE;
    eEdge.scale.set(SMAX, 1, SMAX);
    eEdge.position.y = hE;
    turnRing.scale.set(sT, 1, sT);
    turnRing.position.y = hE;
    eLabel.position.set(-SMAX * 0.55, hE + 0.2, SMAX * 0.8);
    eLabel.element.textContent = `E = ${fmtSci(Eprobe, 2)} keV`;
    turnLabel.position.set(sT, hE - 0.35, 0.5);
    turnLabel.element.textContent = `classical turning point ${rt >= 1000 ? rt.toExponential(1) : rt.toFixed(0)} fm`;
    // wave amplitude profile along +x
    const A0 = 0.3;
    const xR = Math.min(1, R / rt);
    const shapeR = Math.acos(Math.sqrt(xR)) - Math.sqrt(xR * (1 - xR));
    for (let j = 0; j < WAVE_N; j++) {
      const s = (SMAX * j) / (WAVE_N - 1);
      waveS[j] = s;
      if (s >= sT) waveAmp[j] = A0;
      else if (s >= SR) {
        // invert s -> r on the log axis
        const r = R * Math.pow(10, (s - SR) / KR);
        const x = Math.min(1, r / rt);
        const sh = Math.acos(Math.sqrt(x)) - Math.sqrt(x * (1 - x));
        waveAmp[j] = A0 * Math.exp((-3.2 * sh) / Math.max(1e-6, shapeR));
      } else waveAmp[j] = A0 * Math.exp(-3.2);
    }
  }

  let tb = 0;
  const APPROACH = 1.9;
  function animateBarrier(dt: number): void {
    tb += dt * speed;
    const P2 = 2 * APPROACH;
    const ph = (tb % (P2 + 0.6)) / APPROACH;
    let s: number;
    if (ph < 1) s = sT + (SMAX - sT) * (1 - ph) ** 1.6;
    else if (ph < 2) s = sT + (SMAX - sT) * (ph - 1) ** 1.6;
    else s = SMAX;
    ball.position.set(s, hE, 0);
    ball.visible = ph < 2;
    // ghost continues through the barrier during the bounce
    const g = ph - 1;
    ghost.visible = g > 0 && g < 0.9;
    if (ghost.visible) {
      const f = g / 0.7;
      const gs = Math.max(0, sT * (1 - f));
      let gy = hE;
      if (gs < SR) gy = hE + (WELL_Y + 0.2 - hE) * Math.min(1, (SR - gs) / SR);
      ghost.position.set(gs, gy, 0);
      ghostMat.opacity = 0.4 * (1 - Math.max(0, (g - 0.6) / 0.3));
    }
    ghostLabel.visible = ghost.visible;
    if (ghost.visible) ghostLabel.position.set(ghost.position.x, ghost.position.y + 0.45, 0);
    // wave: Re psi with a travelling phase outside and a pulsing evanescent tail inside
    const w = 5.0 * tb;
    const kv = (2 * Math.PI) / 0.55;
    for (let j = 0; j < WAVE_N; j++) {
      const sj = waveS[j];
      const osc = sj >= sT ? Math.cos(kv * (sj - sT) + w) : sj >= SR ? Math.cos(w) : Math.cos(kv * 1.6 * (SR - sj) + w);
      wavePos[j * 3] = sj;
      wavePos[j * 3 + 1] = hE + waveAmp[j] * osc;
      wavePos[j * 3 + 2] = 0;
    }
    waveAttr.needsUpdate = true;
    target.position.set(0.12 * Math.sin(tb * 2), WELL_Y + 0.2, 0.12 * Math.cos(tb * 2.4));
  }

  // =========================================================================
  // Overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '230px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const dot = (c: number) => `<span style="color:${css(c)}">●</span>`;
  const bar = (c: number) => `<span style="color:${css(c)}">▬</span>`;
  function writeLegend(): void {
    legend.innerHTML = view === 'chain'
      ? `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">pp-I chain</div>
<div>${dot(PALETTE.red)} proton &nbsp;${dot(NEUTRON)} neutron</div>
<div>${dot(PALETTE.rose)} positron &nbsp;${dot(PALETTE.cyan)} electron</div>
<div>${bar(PALETTE.green)} neutrino &nbsp;${bar(PALETTE.amber)} gamma ray</div>
<div style="color:#8391ab;margin-top:3px">4 p in, 1 ⁴He out. Mass lost: 0.7%.</div>`
      : `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Coulomb barrier, log-log</div>
<div>${bar(PALETTE.violet)} V(r) = Z₁Z₂e²/4πε₀r</div>
<div>${bar(PALETTE.amber)} collision energy E</div>
<div>${bar(PALETTE.cyan)} ψ, amplitude not to scale</div>
<div style="color:#8391ab;margin-top:3px">The solid ball turns back at the ring. The faint ball tunnels.</div>`;
  }

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 560;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '280px', height: '150px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  // Derived numbers (recomputed on parameter change)
  let kT = 0, EG = 0, E0 = 0, dW = 0, Vc = 0, P = 0, cnoOverPp = 0, nuPP = 0, nuCNO = 0, life = 0;
  const FLUX = neutrinoFlux();

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    ictx.clearRect(0, 0, W, H);
    const x0 = 22, x1 = W - 20, yb = H - 44, yt = 66;
    const Emax = E0 + 3.2 * dW;
    const xOf = (E: number) => x0 + ((x1 - x0) * E) / Emax;
    const yOf = (f: number) => yb - (yb - yt) * f;
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText(`Gamow peak, ${PAIRS[pairId].label}, ${TMK.toFixed(1)} MK`, 16, 30);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 2;
    ictx.beginPath();
    ictx.moveTo(x0, yb);
    ictx.lineTo(x1, yb);
    ictx.stroke();
    const N = 220;
    const tunMax = tunnelFactor(Emax, EG);
    const prodPeak = Math.exp(-E0 / kT - Math.sqrt(EG / E0));
    const curve = (fn: (E: number) => number, color: string, fill: boolean) => {
      ictx.beginPath();
      for (let i = 0; i <= N; i++) {
        const E = (Emax * i) / N + 1e-6;
        const X = xOf(E);
        const Y = yOf(Math.min(1.05, fn(E)));
        if (i === 0) ictx.moveTo(X, Y);
        else ictx.lineTo(X, Y);
      }
      if (fill) {
        ictx.lineTo(xOf(Emax), yb);
        ictx.lineTo(x0, yb);
        ictx.closePath();
        ictx.fillStyle = 'rgba(79,209,232,0.22)';
        ictx.fill();
      }
      ictx.strokeStyle = color;
      ictx.lineWidth = 3;
      ictx.stroke();
    };
    curve((E) => Math.exp(-E / kT), css(PALETTE.amber), false);
    curve((E) => tunnelFactor(E, EG) / tunMax, css(PALETTE.violet), false);
    curve((E) => Math.exp(-E / kT - Math.sqrt(EG / E)) / prodPeak, css(PALETTE.cyan), true);
    // labels
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = css(PALETTE.amber);
    ictx.fillText('e^(−E/kT)', xOf(Math.min(kT * 1.2, Emax * 0.2)) + 8, yt + 30);
    ictx.fillStyle = css(PALETTE.violet);
    ictx.fillText('tunneling', x1 - 118, yt - 6);
    ictx.fillStyle = css(PALETTE.cyan);
    ictx.fillText('product', xOf(E0) - 38, yOf(0.5));
    // probe marker
    const inRange = Eprobe <= Emax;
    const xp = inRange ? xOf(Eprobe) : x1;
    ictx.strokeStyle = '#ffffff';
    ictx.lineWidth = 2;
    ictx.setLineDash([6, 5]);
    ictx.beginPath();
    ictx.moveTo(xp, yt - 10);
    ictx.lineTo(xp, yb);
    ictx.stroke();
    ictx.setLineDash([]);
    // axis ticks
    ictx.fillStyle = '#8391ab';
    ictx.font = '19px JetBrains Mono, monospace';
    const step = Emax > 60 ? 20 : Emax > 30 ? 10 : 5;
    for (let e = 0; e <= Emax; e += step) {
      const X = xOf(e);
      ictx.fillRect(X - 1, yb, 2, 8);
      ictx.fillText(String(e), X - (e >= 10 ? 11 : 6), yb + 28);
    }
    ictx.fillText('keV', x1 - 36, yb + 28);
    ictx.fillStyle = '#dfe6f3';
    ictx.fillText(inRange ? 'E' : 'E →', xp - (inRange ? 6 : 36), yt - 16);
  }

  function recompute(): void {
    const p = PAIRS[pairId];
    const TK = TMK * 1e6;
    kT = kTkeV(TK);
    EG = gamowEnergy(p);
    E0 = gamowPeak(EG, kT);
    dW = gamowWidth(EG, kT);
    Vc = barrierHeight(p);
    P = tunnelFactor(Eprobe, EG);
    const r = heatingRates(TK);
    cnoOverPp = r.cno / r.pp;
    const ex = tempExponents(TK);
    nuPP = ex.pp;
    nuCNO = ex.cno;
    life = protonLifetimeYears(TK);
    drawInset();
    updateReadouts();
  }

  // =========================================================================
  // Frame loop
  stage.onFrame((dt, t) => {
    if (view === 'chain') {
      if (animating) {
        prevU = u;
        u = Math.min(1, u + (dt * speed) / STEP_TIME);
        onCross();
        if (u >= 1) finishStep();
      } else if (playing) {
        hold += dt * speed;
        if (hold > (done === 3 ? HOLD * 3 : HOLD)) startStep();
      }
      placeChain(t);
      placeProducts();
      plasma.rotation.y = 0.02 * Math.sin(t * 0.1);
      for (const f of flashes) {
        if (f.life <= 0) continue;
        f.life = Math.max(0, f.life - dt);
        const a = f.life / f.max;
        f.mat.opacity = a;
        f.sprite.scale.setScalar(f.size * (1.4 - 0.6 * a));
        if (f.life === 0) f.sprite.visible = false;
      }
    } else {
      animateBarrier(dt);
    }
  });

  // =========================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'chain', label: 'Chain' }, { value: 'barrier', label: 'Barrier' }],
    onChange: (v) => {
      view = v;
      chainG.visible = v === 'chain';
      barrierG.visible = v === 'barrier';
      stage.flyTo(CAM[v].pos, CAM[v].target);
      writeLegend();
      updateReadouts();
    },
  });

  ui.section('Plasma and pair');
  ui.slider({
    key: 'T', label: 'Core temperature', min: 5, max: 40, step: 0.1, value: TMK, unit: 'MK',
    format: (v) => v.toFixed(1), onInput: (v) => { TMK = v; recompute(); },
  });
  ui.select<PairId>({
    key: 'pair', label: 'Colliding pair', value: pairId,
    options: [{ value: 'pp', label: 'p + p' }, { value: 'pC12', label: 'p + ¹²C' }, { value: 'pN14', label: 'p + ¹⁴N' }],
    onChange: (v) => { pairId = v; buildBarrier(); recompute(); },
  });
  ui.slider({
    key: 'E', label: 'Probe energy E', min: Math.log10(0.5), max: Math.log10(150), step: 0.002, value: Math.log10(Eprobe),
    format: (v) => `${fmtSci(10 ** v, 2)} keV`, onInput: (v) => { Eprobe = 10 ** v; updateEnergy(); recompute(); },
  });

  ui.section('Chain playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { touched = true; playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    {
      label: 'Step', key: 'step', onClick: () => {
        touched = true;
        playing = false;
        playBtn.textContent = 'Play';
        if (animating) {
          u = 1;
          finishStep();
        } else startStep();
      },
    },
    { label: 'Reset', onClick: () => { touched = true; resetChain(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Animation speed', min: 0.25, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => (speed = v) });

  ui.section('Energy tally (pp-I)');
  const rStep = ui.readout('stepIdx', 'reactions done');
  const rRel = ui.readout('released', 'energy released', 'MeV');
  const rNu = ui.readout('nu', 'carried by ν', 'MeV');
  const rHeat = ui.readout('heat', 'heats the Sun', 'MeV');

  ui.section('Barrier and Gamow peak');
  const rkT = ui.readout('kT', 'thermal kT', 'keV');
  const rVc = ui.readout('VC', 'barrier V_C', 'keV');
  const rRatio = ui.readout('barrierRatio', 'V_C / E');
  const rEG = ui.readout('EG', 'Gamow energy E_G', 'keV');
  const rP = ui.readout('P', 'P = e^−√(E_G/E)');
  const rE0 = ui.readout('E0', 'Gamow peak E₀', 'keV');

  ui.section('Burning rates');
  const rLife = ui.readout('life', 'proton wait (core)');
  const rRatioC = ui.readout('cnoOverPp', 'CNO / pp heat');
  const rNuPP = ui.readout('nuPP', 'pp ∝ T^ν, ν =');
  const rNuC = ui.readout('nuCNO', 'CNO ∝ T^ν, ν =');
  const rFlux = ui.readout('flux', 'ν flux at Earth', '/cm²/s');
  ui.note('Rates assume a fixed solar-core density of 150 g/cm³, hydrogen fraction 0.34 and nitrogen-14 fraction 0.005, with no electron screening. The CNO rate is set by its slowest step, p + ¹⁴N.');
  ui.legend([
    { color: css(PALETTE.amber), label: 'Maxwell-Boltzmann tail' },
    { color: css(PALETTE.violet), label: 'tunneling factor' },
    { color: css(PALETTE.cyan), label: 'product: Gamow peak' },
  ]);

  function updateTally(): void {
    rStep(`${done} of 3`);
    rRel(released.toFixed(3));
    rNu(nuCarried.toFixed(3));
    rHeat((released - nuCarried).toFixed(3));
  }

  function updateReadouts(): void {
    rkT(kT.toFixed(3));
    rVc(Vc.toFixed(0));
    rRatio(fmtSci(Vc / Eprobe, 2));
    rEG(EG >= 1e4 ? `${(EG / 1000).toFixed(1)}e3` : EG.toFixed(1));
    rP(P.toExponential(1));
    rE0(E0.toFixed(2));
    rLife(life > 1e9 ? `${(life / 1e9).toPrecision(2)} Gyr` : life > 1e6 ? `${(life / 1e6).toPrecision(2)} Myr` : `${life.toPrecision(2)} yr`);
    rRatioC(fmtSci(cnoOverPp, 2));
    rNuPP(nuPP.toFixed(2));
    rNuC(nuCNO.toFixed(1));
    rFlux(`${(FLUX / 1e10).toFixed(2)}e10`);
  }

  writeLegend();
  buildBarrier();
  recompute();
  resetChain();

  return {
    state: () => ({
      view,
      pair: pairId,
      TMK,
      kT,
      E: Eprobe,
      E0,
      EG,
      P,
      VC: Vc,
      barrierRatio: Vc / Eprobe,
      cnoOverPp,
      stepIdx: done,
      released,
      chainDone,
      touched,
      playing,
      qTotal: Q_TOTAL,
    }),
    dispose: () => {
      legend.remove();
      inset.remove();
      tex.dispose();
      unitCircle.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'solar-fusion',
  number: 56,
  title: 'Fusion in the Sun',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Four protons become helium, and quantum tunneling makes it possible.',
  content,
  mount,
};

export default topic;
