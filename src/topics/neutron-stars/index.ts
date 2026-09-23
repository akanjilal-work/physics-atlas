import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  beamHalfAngle,
  beamIntensity,
  beamSeen,
  bSurface,
  charAge,
  compactness,
  EOS_FITS,
  impact,
  lightCylinder,
  massRadius,
  M_SUN,
  PRESETS,
  pulseWidth,
  spinDownPower,
  surfaceSpeed,
  YEAR,
  type MRCurve,
} from './physics.ts';

type PresetId = 'custom' | 'crab' | 'vela' | 'msp' | 'magnetar';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const R_STAR_M = 12e3; // canonical radius, m
const M_STAR = 1.4 * M_SUN;
const EARTH_D = 6.2; // scene distance of the Earth marker
const BEAM_LEN = 6.6;
const MIN_SHOWN_PERIOD = 1.6; // s: faster pulsars are slowed down on screen
const N_AZ = 8; // field-line planes
const SEG_PER_LINE = 72;
const MAX_LINES = N_AZ * 14;
const TRACE_TURNS = 3;

/** Scene radius of the light cylinder: logarithmic in R_LC / R. */
const lcScene = (P: number) => 1 + 0.9 * Math.log10(lightCylinder(P) / R_STAR_M);

/** Mass–radius curves are the same for every mount: compute once. */
let mrCache: MRCurve[] | null = null;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Vertical alpha gradient for the beam cones: bright at the star, fading outward. */
function beamAlphaTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  // uv.y = 1 at the cone tip (the star), which maps to the top of the canvas
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(0.45, 'rgb(90,90,90)');
  grad.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function fmtTime(s: number): string {
  if (s < 1) return `${(s * 1e3).toFixed(s < 0.01 ? 2 : 1)} ms`;
  return `${s.toFixed(s < 10 ? 3 : 1)} s`;
}

function fmtYears(y: number): string {
  if (y < 1e4) return `${y.toFixed(0)} yr`;
  if (y < 1e6) return `${(y / 1e3).toFixed(1)} kyr`;
  if (y < 1e9) return `${(y / 1e6).toFixed(1)} Myr`;
  return `${(y / 1e9).toFixed(1)} Gyr`;
}

const sci = (v: number, d = 1) => {
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  return `${m.toFixed(d)}×10${String(e).replace(/-/g, '⁻').replace(/\d/g, (x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+x])}`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: [1.6, 2.4, 16.5], target: [1.7, 0.2, 0], fov: 44, near: 0.05, far: 200 });
  const { scene } = stage;

  // --- State
  let P = 0.1;
  let Pdot = 1e-14;
  let alpha = 60 * DEG;
  let zeta = 68 * DEG;
  let preset: PresetId = 'custom';
  let cutaway = false;
  let touched = false;
  let dialed = false; // P or Ṗ moved by hand since the last preset pick
  let phase = 0; // displayed rotation phase, rad
  let pulses = 0;
  let audioOn = false;

  const comp = compactness(M_STAR, R_STAR_M);
  const glowTex = glowTexture();
  const beamTex = beamAlphaTexture();

  // --- Background stars
  {
    const n = 900;
    const pos = new Float32Array(n * 3);
    let seed = 716;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * TWO_PI;
      const r = 60 + rnd() * 30;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8894b0, size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.55 })));
  }

  // --- The star (static: a uniform sphere shows no rotation) and its cutaway
  const starGroup = new THREE.Group();
  scene.add(starGroup);
  const starMat = new THREE.MeshStandardMaterial({ color: 0xbfd6ff, emissive: 0x6f9cff, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.1 });
  const starFull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), starMat);
  starGroup.add(starFull);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7fa8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  starGlow.scale.setScalar(4.2);
  starGroup.add(starGlow);

  // Cutaway: the missing quadrant is x>0, z>0 in cutGroup's frame, rotated to face the camera.
  const cutGroup = new THREE.Group();
  cutGroup.rotation.y = -Math.PI / 4;
  starGroup.add(cutGroup);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40, Math.PI, 1.5 * Math.PI), new THREE.MeshStandardMaterial({ color: 0xbfd6ff, emissive: 0x6f9cff, emissiveIntensity: 0.75, roughness: 0.5, side: THREE.DoubleSide }));
  cutGroup.add(shell);
  // Layer radii (star radius = 1). Crust layers are drawn about twice their real thickness.
  const LAYERS: { r0: number; r1: number; color: number; name: string }[] = [
    { r0: 0.0, r1: 0.45, color: PALETTE.rose, name: 'inner core: ?' },
    { r0: 0.45, r1: 0.82, color: PALETTE.violet, name: 'outer core: superfluid n, p, e, μ' },
    { r0: 0.82, r1: 0.87, color: PALETTE.amber, name: 'nuclear pasta' },
    { r0: 0.87, r1: 0.93, color: PALETTE.cyan, name: 'inner crust: nuclei + free neutrons' },
    { r0: 0.93, r1: 1.0, color: 0x8b98b5, name: 'outer crust: nuclear lattice' },
  ];
  const faceMats: THREE.MeshStandardMaterial[] = [];
  for (const L of LAYERS) {
    const mat = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.color, emissiveIntensity: 0.35, roughness: 0.7, side: THREE.DoubleSide });
    faceMats.push(mat);
    for (const face of [0, 1]) {
      const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.0001, L.r0), L.r1, 64, 1, -Math.PI / 2, Math.PI), mat);
      if (face === 1) m.rotation.y = -Math.PI / 2;
      cutGroup.add(m);
    }
  }
  // Pasta texture: small rods on the pasta band of the z=0 face
  {
    const pts: number[] = [];
    for (let k = 0; k < 26; k++) {
      const a = -Math.PI / 2 + ((k + 0.5) / 26) * Math.PI;
      const r = 0.845;
      const d = 0.018;
      pts.push((r - d) * Math.cos(a), (r - d) * Math.sin(a), 0.003, (r + d) * Math.cos(a), (r + d) * Math.sin(a), 0.003);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    cutGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x3a2a08 })));
  }
  // Labels stacked to the left of the star, with leader lines to each layer on the left cut face.
  const leaderPos = new Float32Array(LAYERS.length * 6);
  const LABEL_Y = [-0.62, -0.28, 0.06, 0.36, 0.66];
  const layerLabels = LAYERS.map((L, i) => {
    const r = i === 0 ? 0.2 : (L.r0 + L.r1) / 2;
    const a = [-0.5, -0.25, 0.1, 0.4, 0.7][i];
    // Point on the x=0 face in cutGroup, mapped through the −45° turn into starGroup.
    const fy = r * Math.sin(a);
    const fz = r * Math.cos(a);
    const px = -Math.SQRT1_2 * fz;
    const pz = Math.SQRT1_2 * fz;
    const lx = -1.45;
    const lz = 0.4;
    leaderPos.set([px, fy, pz, lx, LABEL_Y[i], lz], i * 6);
    const lbl = stage.label(L.name, [lx - 0.04, LABEL_Y[i], lz], '', starGroup);
    lbl.element.style.color = css(L.color);
    lbl.center.set(1, 0.5);
    return lbl;
  });
  const leaderGeo = new THREE.BufferGeometry();
  leaderGeo.setAttribute('position', new THREE.BufferAttribute(leaderPos, 3));
  const leaders = new THREE.LineSegments(leaderGeo, new THREE.LineBasicMaterial({ color: 0xb8c3d9, transparent: true, opacity: 0.7, depthTest: false }));
  leaders.renderOrder = 10;
  leaders.visible = false;
  starGroup.add(leaders);
  const setCutaway = (v: boolean) => {
    starFull.visible = !v;
    cutGroup.visible = v;
    starGlow.material.opacity = v ? 0.35 : 0.9;
    for (const l of layerLabels) l.visible = v;
    leaders.visible = v;
    legend.style.visibility = v ? 'hidden' : 'visible';
    fieldLines.material.opacity = v ? 0.25 : 0.8;
    applyBeamOpacity();
    if (v) stage.flyTo([-0.6, 0.6, 5.6], [-0.9, 0, 0]);
    else stage.flyTo([1.6, 2.4, 16.5], [1.7, 0.2, 0]);
  };
  const applyBeamOpacity = () => {
    const o = (cutaway ? 0.12 : 0.55) * Math.min(1, Math.sqrt((15 * DEG) / rho));
    for (const m of beamMats) m.opacity = o;
  };

  // --- Rotating magnetosphere: spinGroup spins about +y, magGroup tilts the magnetic axis by α
  const spinGroup = new THREE.Group();
  scene.add(spinGroup);
  const magGroup = new THREE.Group();
  spinGroup.add(magGroup);

  // Polar hot spots
  const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), capMat);
    cap.position.y = s * 0.98;
    magGroup.add(cap);
  }
  // Magnetic axis
  {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.9, 0), new THREE.Vector3(0, 1.9, 0)]);
    magGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.7 })));
  }

  // Beams: open cones with the tip at the star, opening along ±y of magGroup
  const beamMats: THREE.MeshBasicMaterial[] = [];
  const beams: THREE.Mesh[] = [];
  for (const s of [1, -1]) {
    const color = s === 1 ? PALETTE.cyan : PALETTE.rose;
    const mat = new THREE.MeshBasicMaterial({ color, alphaMap: beamTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    beamMats.push(mat);
    const geo = new THREE.ConeGeometry(1, 1, 48, 1, true);
    geo.translate(0, -0.5, 0); // tip at origin, base at y = -1
    geo.rotateX(Math.PI); // base at y = +1
    const cone = new THREE.Mesh(geo, mat);
    if (s === -1) cone.rotation.x = Math.PI;
    cone.renderOrder = 5;
    magGroup.add(cone);
    beams.push(cone);
    // Beam axis
    const ax = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, s * 1.0, 0), new THREE.Vector3(0, s * BEAM_LEN, 0)]);
    magGroup.add(new THREE.Line(ax, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 })));
  }

  // Field lines (rebuilt when the light cylinder moves)
  const flPos = new Float32Array(MAX_LINES * SEG_PER_LINE * 2 * 3);
  const flCol = new Float32Array(MAX_LINES * SEG_PER_LINE * 2 * 3);
  const flGeo = new THREE.BufferGeometry();
  flGeo.setAttribute('position', new THREE.BufferAttribute(flPos, 3));
  flGeo.setAttribute('color', new THREE.BufferAttribute(flCol, 3));
  const fieldLines = new THREE.LineSegments(flGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  fieldLines.frustumCulled = false;
  magGroup.add(fieldLines);
  const cClosed = new THREE.Color(PALETTE.violet);
  const cOpen = new THREE.Color(PALETTE.green);

  function rebuildFieldLines(rlc: number): void {
    let v = 0;
    const put = (x: number, y: number, z: number, c: THREE.Color, f: number) => {
      flPos[v * 3] = x;
      flPos[v * 3 + 1] = y;
      flPos[v * 3 + 2] = z;
      flCol[v * 3] = c.r * f;
      flCol[v * 3 + 1] = c.g * f;
      flCol[v * 3 + 2] = c.b * f;
      v++;
    };
    const Ls: number[] = [];
    for (let L = 1.4; L < rlc * 0.97 && Ls.length < 5; L *= 1.5) Ls.push(L);
    const Lopen = [rlc * 1.25, rlc * 2.2];
    for (let k = 0; k < N_AZ; k++) {
      const psi = (k / N_AZ) * TWO_PI;
      const cp = Math.cos(psi);
      const sp = Math.sin(psi);
      for (const L of Ls) {
        const th0 = Math.asin(Math.sqrt(1 / L));
        let px = 0;
        let py = 0;
        let pz = 0;
        for (let j = 0; j <= SEG_PER_LINE; j++) {
          const th = th0 + (j / SEG_PER_LINE) * (Math.PI - 2 * th0);
          const r = L * Math.sin(th) ** 2;
          const x = r * Math.sin(th) * cp;
          const y = r * Math.cos(th);
          const z = r * Math.sin(th) * sp;
          if (j > 0) {
            put(px, py, pz, cClosed, 0.8);
            put(x, y, z, cClosed, 0.8);
          }
          px = x;
          py = y;
          pz = z;
        }
      }
      // Open lines: follow the dipole shape out to the light cylinder, then continue straight
      for (const L of Lopen) {
        for (const hemi of [1, -1]) {
          const th0 = Math.asin(Math.sqrt(1 / L));
          const n = SEG_PER_LINE / 2;
          let px = Math.sin(th0) * cp;
          let py = hemi * Math.cos(th0);
          let pz = Math.sin(th0) * sp;
          let dx = 0;
          let dy = 0;
          let dz = 0;
          let fade = 1;
          for (let j = 1; j <= n; j++) {
            const th = th0 + (j / n) * (Math.PI / 2 - th0);
            const r = L * Math.sin(th) ** 2;
            let x = r * Math.sin(th) * cp;
            let y = hemi * r * Math.cos(th);
            let z = r * Math.sin(th) * sp;
            const out = Math.hypot(x, z) > rlc * 0.9 || r > rlc * 1.4;
            if (out) {
              // straight continuation along the last direction
              x = px + dx * 0.35;
              y = py + dy * 0.35;
              z = pz + dz * 0.35;
              fade *= 0.8;
            } else {
              const d = Math.hypot(x - px, y - py, z - pz) || 1;
              dx = (x - px) / d;
              dy = (y - py) / d;
              dz = (z - pz) / d;
            }
            put(px, py, pz, cOpen, fade);
            put(x, y, z, cOpen, fade * (out ? 0.8 : 1));
            px = x;
            py = y;
            pz = z;
            if (fade < 0.08) break;
          }
        }
      }
    }
    flGeo.setDrawRange(0, v);
    (flGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (flGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- Spin axis (static)
  {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -3.2, 0), new THREE.Vector3(0, 3.2, 0)]);
    scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: PALETTE.amber })));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
    head.position.y = 3.3;
    scene.add(head);
    const l = stage.label('spin axis', [0, 3.65, 0], 'muted');
    l.element.style.color = css(PALETTE.amber);
  }

  // --- Light cylinder
  const lcGroup = new THREE.Group();
  scene.add(lcGroup);
  {
    const n = 160;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= n; j++) pts.push(new THREE.Vector3(Math.cos((j / n) * TWO_PI), 0, Math.sin((j / n) * TWO_PI)));
    const ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
    lcGroup.add(new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.9 })));
    for (const y of [-2.2, 2.2]) {
      const r = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.25 }));
      r.position.y = y;
      lcGroup.add(r);
    }
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 4.4, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.green, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }),
    );
    lcGroup.add(cyl);
  }
  const lcLabel = stage.label('light cylinder', [0, 0, 0], 'muted');
  lcLabel.element.style.color = css(PALETTE.green);

  // --- Earth observer
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3f7fd8, emissive: 0x0b2a55, roughness: 0.6 }));
  earthGroup.add(earth);
  const earthFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  earthFlash.scale.setScalar(2.2);
  earthGroup.add(earthFlash);
  const earthLabel = stage.label('Earth', [0, -0.42, 0], '', earthGroup);
  const losGeo = new THREE.BufferGeometry();
  const losPos = new Float32Array(6);
  losGeo.setAttribute('position', new THREE.BufferAttribute(losPos, 3));
  const los = new THREE.Line(losGeo, new THREE.LineDashedMaterial({ color: 0x9fb4d8, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.5 }));
  scene.add(los);

  // --- Timing trace inset (top right)
  const TW = 500;
  const TH = 210;
  const trace = document.createElement('canvas');
  trace.width = TW;
  trace.height = TH;
  Object.assign(trace.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${TW / 2}px`, height: `${TH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(trace);
  const tctx = trace.getContext('2d')!;
  const C_CYAN = css(PALETTE.cyan);
  const C_ROSE = css(PALETTE.rose);

  // --- Mass–radius inset (below the trace)
  const MW = 500;
  const MH = 360;
  const mr = document.createElement('canvas');
  mr.width = MW;
  mr.height = MH;
  mr.className = 'stage-overlay';
  Object.assign(mr.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: `${MW / 2}px`, height: `${MH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(mr);

  function drawMR(curves: MRCurve[] | null): void {
    const c = mr.getContext('2d')!;
    c.clearRect(0, 0, MW, MH);
    const X0 = 62;
    const X1 = MW - 20;
    const Y0 = 56;
    const Y1 = MH - 50;
    const xOf = (R: number) => X0 + ((R - 8) / (16 - 8)) * (X1 - X0);
    const yOf = (M: number) => Y1 - ((M - 0.5) / (2.7 - 0.5)) * (Y1 - Y0);
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('mass vs radius (approx.)', 16, 32);
    c.font = '17px JetBrains Mono, monospace';
    c.lineWidth = 1;
    for (const M of [1, 1.5, 2, 2.5]) {
      c.strokeStyle = '#1a2336';
      c.beginPath();
      c.moveTo(X0, yOf(M));
      c.lineTo(X1, yOf(M));
      c.stroke();
      c.fillStyle = '#8391ab';
      c.fillText(M.toFixed(1), X0 - 42, yOf(M) + 6);
    }
    for (const R of [8, 10, 12, 14, 16]) {
      c.fillStyle = '#8391ab';
      c.fillText(String(R), xOf(R) - 10, MH - 24);
    }
    c.fillText('R (km)', X1 - 64, MH - 24);
    c.fillText('M/M☉', X0 + 6, Y0 + 16);
    // Causality: R > 2.9 GM/c² roughly; black hole: R = 2GM/c²
    c.fillStyle = 'rgba(255,107,107,0.12)';
    c.beginPath();
    c.moveTo(xOf(8), yOf(0.5));
    for (let M = 0.5; M <= 2.7; M += 0.05) c.lineTo(xOf(Math.max(8, 2.95 * 1.4766 * M)), yOf(M));
    c.lineTo(xOf(8), yOf(2.7));
    c.closePath();
    c.fill();
    if (!curves) {
      c.fillStyle = '#8391ab';
      c.fillText('solving TOV…', X0 + 100, (Y0 + Y1) / 2);
      return;
    }
    const cols = [css(PALETTE.cyan), css(PALETTE.violet), css(PALETTE.rose)];
    curves.forEach((cv, k) => {
      c.strokeStyle = cols[k];
      c.lineWidth = 3;
      c.beginPath();
      let started = false;
      for (let i = 0; i < cv.M.length; i++) {
        if (cv.M[i] < 0.5 || cv.R[i] > 16) continue;
        const x = xOf(cv.R[i]);
        const y = yOf(cv.M[i]);
        if (!started) c.moveTo(x, y);
        else c.lineTo(x, y);
        started = true;
      }
      c.stroke();
      c.fillStyle = cols[k];
      c.fillText(cv.name, xOf(cv.rAtMax) + 8, yOf(cv.mMax) - 6);
    });
    // NICER (Riley et al. 2019, 2021) with 68% error bars
    const err = (R: number, rl: number, rh: number, M: number, ml: number, mh: number, name: string) => {
      c.strokeStyle = '#dfe6f3';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(xOf(R - rl), yOf(M));
      c.lineTo(xOf(R + rh), yOf(M));
      c.moveTo(xOf(R), yOf(M - ml));
      c.lineTo(xOf(R), yOf(M + mh));
      c.stroke();
      c.fillStyle = '#dfe6f3';
      c.fillText(name, xOf(R + rh) + 6, yOf(M) + 6);
    };
    err(12.71, 1.19, 1.14, 1.34, 0.16, 0.15, 'J0030');
    err(12.39, 0.98, 1.3, 2.072, 0.066, 0.067, 'J0740');
    c.fillStyle = css(PALETTE.amber);
    c.beginPath();
    c.arc(xOf(12), yOf(1.4), 7, 0, TWO_PI);
    c.fill();
    c.fillText('this star', xOf(12) - 118, yOf(1.4) + 6);
    c.fillStyle = '#8391ab';
    c.font = '15px JetBrains Mono, monospace';
    c.fillText('crosses: NICER · red: forbidden by causality', 16, MH - 4);
  }
  drawMR(mrCache);
  let mrTimer = 0;
  if (!mrCache) {
    mrTimer = window.setTimeout(() => {
      mrCache = EOS_FITS.map((f) => massRadius(f, 36));
      drawMR(mrCache);
    }, 400);
  }

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  const sw = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${css(c)}"></i>`;
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Reading the scene (not to scale)</div>
<div>${sw(PALETTE.amber)}spin axis</div>
<div>${sw(PALETTE.cyan)}north beam and magnetic axis</div>
<div>${sw(PALETTE.rose)}south beam</div>
<div>${sw(PALETTE.violet)}closed dipole field lines</div>
<div>${sw(PALETTE.green)}open field lines, light cylinder (log scale)</div>
<div>${sw(0x3f7fd8)}Earth: flashes when a beam crosses it</div>`;
  viewport.appendChild(legend);

  // --- Audio: one looped buffer holding one rotation of clicks at the true period
  let actx: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let audioDirty = false;
  let audioTimer = 0;

  function buildAudio(): void {
    if (!actx || !gain) return;
    const sr = actx.sampleRate;
    const N = Math.max(8, Math.round(P * sr));
    const buf = actx.createBuffer(1, N, sr);
    const d = buf.getChannelData(0);
    const rho = beamHalfAngle(P);
    const tau = Math.min(0.0015, P / 6);
    const len = Math.min(N / 2, Math.round(5 * tau * sr));
    for (const [beam, at] of [[1, 0], [-1, 0.5]] as [1 | -1, number][]) {
      const A = beamIntensity(alpha, zeta, rho, at * TWO_PI, beam);
      if (A <= 0) continue;
      const i0 = Math.round(at * N);
      for (let j = 0; j < len; j++) d[(i0 + j) % N] += A * Math.exp(-j / (tau * sr));
    }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += d[i];
    mean /= N;
    for (let i = 0; i < N; i++) d[i] -= mean;
    if (src) {
      src.stop();
      src.disconnect();
    }
    src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(gain);
    src.start();
  }

  function setAudio(on: boolean): void {
    audioOn = on;
    audioBtn.textContent = on ? 'Stop clicks' : 'Play clicks';
    if (on) {
      if (!actx) {
        actx = new AudioContext();
        gain = actx.createGain();
        gain.gain.value = 0.35;
        gain.connect(actx.destination);
      }
      void actx.resume();
      buildAudio();
    } else if (src) {
      src.stop();
      src.disconnect();
      src = null;
    }
  }

  // --- Parameter updates
  let rho = beamHalfAngle(P);
  let rlcS = lcScene(P);

  function applyGeometry(): void {
    magGroup.rotation.z = -alpha;
    const len = BEAM_LEN;
    const w = len * Math.tan(rho);
    for (const b of beams) b.scale.set(w, len, w);
    applyBeamOpacity();
    const n = Math.sin(zeta);
    const y = Math.cos(zeta);
    earthGroup.position.set(EARTH_D * n, EARTH_D * y, 0);
    losPos[3] = EARTH_D * n;
    losPos[4] = EARTH_D * y;
    (losGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    los.computeLineDistances();
  }

  function applyPeriod(): void {
    rho = beamHalfAngle(P);
    rlcS = lcScene(P);
    lcGroup.scale.set(rlcS, 1, rlcS);
    lcLabel.position.set(-rlcS * 0.7, 0.2, rlcS * 0.7);
    rebuildFieldLines(rlcS);
  }

  function update(): void {
    applyPeriod();
    applyGeometry();
    audioDirty = true;
    updateReadouts();
  }

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Pulsar');
  const presetCtl = ui.select<PresetId>({
    key: 'preset', label: 'Preset', value: preset,
    options: [{ value: 'custom', label: 'Custom' }, ...PRESETS.map((p) => ({ value: p.id as PresetId, label: p.id === 'msp' ? 'J1748' : p.label }))],
    onChange: (v) => {
      preset = v;
      touched = true;
      dialed = false;
      const p = PRESETS.find((x) => x.id === v);
      if (p) {
        P = p.P;
        Pdot = p.Pdot;
        pCtl.set(Math.log10(P), false);
        pdCtl.set(Math.log10(Pdot), false);
        presetNote.textContent = p.note;
      } else presetNote.textContent = 'Your own pulsar. Move any slider.';
      update();
    },
  });
  const presetNote = ui.note('Your own pulsar. Move any slider.');
  const toCustom = () => {
    touched = true;
    if (preset !== 'custom') {
      preset = 'custom';
      presetCtl.set('custom', false);
      presetNote.textContent = 'Your own pulsar. Move any slider.';
    }
  };
  const pCtl = ui.slider({
    key: 'period', label: 'Spin period P', min: -3, max: 1, step: 0.0005, value: Math.log10(P),
    format: (v) => fmtTime(10 ** v),
    onInput: (v) => { toCustom(); dialed = true; P = 10 ** v; update(); },
  });
  const pdCtl = ui.slider({
    key: 'pdot', label: 'Spin-down rate Ṗ', min: -21, max: -9, step: 0.005, value: Math.log10(Pdot),
    format: (v) => `${sci(10 ** v, 2)} s/s`,
    onInput: (v) => { toCustom(); dialed = true; Pdot = 10 ** v; update(); },
  });

  ui.section('Geometry');
  ui.slider({
    key: 'alpha', label: 'Magnetic inclination α', min: 0, max: 90, step: 1, value: alpha / DEG, unit: '°',
    onInput: (v) => { touched = true; alpha = v * DEG; update(); },
  });
  ui.slider({
    key: 'zeta', label: 'Observer angle ζ', min: 0, max: 180, step: 1, value: zeta / DEG, unit: '°',
    onInput: (v) => { touched = true; zeta = v * DEG; update(); },
  });
  ui.toggle({
    key: 'cutaway', label: 'Cutaway: show the interior', value: cutaway,
    onChange: (v) => { cutaway = v; touched = true; setCutaway(v); },
  });
  const [audioBtn] = ui.buttons([{ label: 'Play clicks', primary: true, key: 'audio', onClick: () => setAudio(!audioOn) }]);

  ui.section('Timing');
  const rF = ui.readout('freq', 'spin frequency f', 'Hz');
  const rTau = ui.readout('tau', 'characteristic age τc');
  const rB = ui.readout('bfield', 'surface field B');
  const rLC = ui.readout('rlc', 'light cylinder R_LC');
  const rE = ui.readout('edot', 'spin-down power Ė');
  const rV = ui.readout('veq', 'equator speed');

  ui.section('Beam and pulses');
  const rRho = ui.readout('rho', 'beam half-width ρ');
  const rBeta = ui.readout('beta', 'impact angle β');
  const rW = ui.readout('width', 'pulse width W');
  const rN = ui.readout('pulses', 'pulses seen');

  ui.section('Compactness (1.4 M☉, 12 km)');
  const rEsc = ui.readout('vesc', 'escape speed');
  const rRed = ui.readout('gr', '1 − 2GM/Rc²');
  const rG = ui.readout('gsurf', 'surface gravity');
  const rVis = ui.readout('visible', 'surface visible');
  const rRho0 = ui.readout('density', 'mean ρ / ρ_nuclear');
  const rCube = ui.readout('sugar', '1 cm³ weighs');
  rEsc(`${comp.vEsc.toFixed(2)} c`);
  rRed(comp.redshiftFactor.toFixed(3));
  rG(`${sci(comp.gSurface)} m/s²`);
  rVis(`${(comp.visibleFraction * 100).toFixed(0)}% (flat: 50%)`);
  rRho0(`${comp.densityRatio.toFixed(1)}×`);
  rCube(`${(comp.sugarCubeTonnes / 1e6).toFixed(0)} Mt`);

  function updateReadouts(): void {
    rF(1 / P < 10 ? (1 / P).toFixed(3) : (1 / P).toFixed(1));
    rTau(fmtYears(charAge(P, Pdot) / YEAR));
    rB(`${sci(bSurface(P, Pdot))} G`);
    const lc = lightCylinder(P) / 1e3;
    rLC(lc < 1e4 ? `${lc.toFixed(lc < 100 ? 1 : 0)} km` : `${sci(lc)} km`);
    rE(`${sci(spinDownPower(P, Pdot) * 1e7)} erg/s`);
    rV(`${surfaceSpeed(P, R_STAR_M).toFixed(surfaceSpeed(P, R_STAR_M) < 0.001 ? 5 : 3)} c`);
    rRho(`${(rho / DEG).toFixed(1)}°`);
    const bN = impact(alpha, zeta, 1);
    const bS = impact(alpha, zeta, -1);
    rBeta(`${(bN / DEG).toFixed(0)}° / ${(bS / DEG).toFixed(0)}°`);
    const wN = pulseWidth(alpha, zeta, rho, 1);
    const wS = pulseWidth(alpha, zeta, rho, -1);
    const parts: string[] = [];
    if (wN > 0) parts.push(`${(wN / DEG).toFixed(0)}°`);
    if (wS > 0) parts.push(`${(wS / DEG).toFixed(0)}° inter`);
    rW(parts.length ? parts.join(' + ') : 'no pulse');
    rN(pulses);
  }

  // --- Trace drawing
  function drawTrace(): void {
    const c = tctx;
    c.clearRect(0, 0, TW, TH);
    const X0 = 14;
    const X1 = TW - 14;
    const Yb = TH - 40;
    const Yt = 60;
    c.font = '600 22px JetBrains Mono, monospace';
    c.fillStyle = '#dfe6f3';
    c.fillText('pulses at Earth', 14, 30);
    c.font = '18px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    const slow = MIN_SHOWN_PERIOD / P;
    c.fillText(slow > 1.05 ? `slowed ×${slow < 100 ? slow.toFixed(0) : sci(slow, 0)}` : 'real time', TW - 200, 30);
    // turn ticks
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    const turn0 = Math.floor(phase / TWO_PI);
    for (let k = 0; k <= TRACE_TURNS + 1; k++) {
      const ph = (turn0 - TRACE_TURNS + k) * TWO_PI;
      const x = X1 - ((phase - ph) / (TRACE_TURNS * TWO_PI)) * (X1 - X0);
      if (x < X0 || x > X1) continue;
      c.beginPath();
      c.moveTo(x, Yt - 10);
      c.lineTo(x, Yb + 4);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(X0, Yb);
    c.lineTo(X1, Yb);
    c.stroke();
    c.fillText(`← 1 turn = ${fmtTime(P)}`, X0, TH - 10);
    const n = 360;
    for (const beam of [1, -1] as (1 | -1)[]) {
      if (!beamSeen(alpha, zeta, rho, beam)) continue;
      c.strokeStyle = beam === 1 ? C_CYAN : C_ROSE;
      c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const ph = phase - ((n - i) / n) * TRACE_TURNS * TWO_PI;
        const I = beamIntensity(alpha, zeta, rho, ph, beam);
        const x = X0 + (i / n) * (X1 - X0);
        const y = Yb - I * (Yb - Yt);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    if (!beamSeen(alpha, zeta, rho, 1) && !beamSeen(alpha, zeta, rho, -1)) {
      c.fillStyle = '#ff6b6b';
      c.fillText('no pulses: both beams miss the Earth', X0 + 40, (Yt + Yb) / 2 + 6);
    }
  }

  // --- Frame loop
  let traceTimer = 0;
  stage.onFrame((dt) => {
    const shown = Math.max(P, MIN_SHOWN_PERIOD);
    const prev = phase;
    phase += (dt * TWO_PI) / shown;
    // Count beam crossings of the observer's meridian (north at 0, south at π).
    const k0 = Math.floor(prev / Math.PI);
    const k1 = Math.floor(phase / Math.PI);
    for (let k = k0 + 1; k <= k1; k++) {
      const beam: 1 | -1 = k % 2 === 0 ? 1 : -1;
      if (beamSeen(alpha, zeta, rho, beam)) pulses++;
    }
    spinGroup.rotation.y = -phase;
    const I = beamIntensity(alpha, zeta, rho, phase, 1) + beamIntensity(alpha, zeta, rho, phase, -1);
    earthFlash.material.opacity = Math.min(1, I);
    earthFlash.material.color.setHex(beamIntensity(alpha, zeta, rho, phase, 1) >= beamIntensity(alpha, zeta, rho, phase, -1) ? PALETTE.cyan : PALETTE.rose);
    (earth.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + 6 * I;
    traceTimer += dt;
    if (traceTimer > 1 / 30) {
      traceTimer = 0;
      drawTrace();
      rN(pulses);
    }
    if (audioDirty && audioOn) {
      audioTimer += dt;
      if (audioTimer > 0.15) {
        audioTimer = 0;
        audioDirty = false;
        buildAudio();
      }
    }
  });

  starFull.visible = true;
  cutGroup.visible = false;
  for (const l of layerLabels) l.visible = false;
  update();
  drawTrace();
  void earthLabel;

  return {
    state: () => {
      const seen = beamSeen(alpha, zeta, rho, 1) || beamSeen(alpha, zeta, rho, -1);
      return {
        P,
        Pdot,
        tauYr: charAge(P, Pdot) / YEAR,
        B: bSurface(P, Pdot),
        alpha: alpha / DEG,
        zeta: zeta / DEG,
        rho: rho / DEG,
        pulseVisible: seen,
        pulses,
        cutaway,
        preset,
        touched,
        dialed,
        audio: audioOn,
      };
    },
    dispose: () => {
      window.clearTimeout(mrTimer);
      if (src) {
        src.stop();
        src.disconnect();
      }
      if (actx) void actx.close();
      trace.remove();
      mr.remove();
      legend.remove();
      glowTex.dispose();
      beamTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'neutron-stars',
  number: 59,
  title: 'Neutron Stars & Pulsars',
  domain: 'astro',
  level: 3,
  status: 'live',
  tagline: 'A city-sized atom nucleus spinning hundreds of times a second.',
  content,
  mount,
};

export default topic;
