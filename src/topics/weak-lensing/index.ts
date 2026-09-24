import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  analyticShear,
  correlation,
  geometry,
  intrinsic,
  lensGammaT,
  lensKappa,
  lensingField,
  makeLens,
  makeSources,
  observe,
  reconstruct,
  rms,
  sample,
  tangentialProfile,
  truthMap,
  type Field,
  type Lens,
  type Observation,
  type Profile,
  type Profile1D,
  type Recon,
} from './physics.ts';

type View = 'stack' | 'sky' | 'maps';

/** Field of view in arcmin, and scene units per arcmin on the source plane. */
const FS = 16;
const U = 0.5;
const NMAX = 20000;
const NG = 64; // truth grid
const NR = 16; // reconstruction cells (1 arcmin)
const SRC_Z = -5;
const LENS_Z = 0;
const OBS_Z = 5;
/** Angular positions shrink toward the observer: lens plane is half way. */
const LENS_SCALE = (OBS_Z - LENS_Z) / (OBS_Z - SRC_Z);
const MAP_SEG = 47;
const TRUTH_X = 10.5;
const RECON_X = 19.5;
const MAP_Y = -2.5;
const ZL = 0.3;
const ZS = 1.0;
const HALO_COL = PALETTE.violet;
const MASK_COL = PALETTE.rose;

const CAM: Record<View, [number, number, number][]> = {
  stack: [[-5.2, 3.0, 12.4], [0.5, -0.5, -2.4]],
  sky: [[0, 0, 5.6], [0, 0, SRC_Z]],
  maps: [[(TRUTH_X + RECON_X) / 2, 9.5, 16.5], [(TRUTH_X + RECON_X) / 2, MAP_Y + 2.4, -0.8]],
};

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Diverging-ish ramp for convergence: deep blue (negative) to violet to amber (high). */
function kappaColor(v: number, out: THREE.Color): THREE.Color {
  const t = Math.max(-1, Math.min(1, v));
  if (t < 0) return out.setRGB(0.1 + 0.05 * -t, 0.16 + 0.1 * -t, 0.3 + 0.35 * -t);
  if (t < 0.5) {
    const u = t / 0.5;
    return out.setRGB(0.1 + 0.46 * u, 0.16 + 0.26 * u, 0.3 + 0.5 * u);
  }
  const u = (t - 0.5) / 0.5;
  return out.setRGB(0.56 + 0.4 * u, 0.42 + 0.29 * u, 0.8 - 0.54 * u);
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.stack[0], target: CAM.stack[1], fov: 42, far: 200 });
  const { scene } = stage;
  const geo = geometry(ZL, ZS);

  // ---- Parameters
  let profile: Profile = 'sis';
  let logM1 = Math.log10(4e14);
  let x1 = 0;
  let y1 = 0;
  let lens2On = false;
  let logM2 = Math.log10(4e14);
  let x2 = 4;
  let y2 = 2;
  let N = 1200;
  let sigmaE = 0.26;
  let exaggerate = true;
  let showTruth = true;
  let smooth = 1;
  let view: View = 'stack';
  let seed = 7;
  let touched = false;

  // ---- Derived state
  let lenses: Lens[] = [];
  let field: Field;
  let src = makeSources(NMAX, FS, seed);
  let obs: Observation | undefined;
  let prof: Profile1D;
  let recon: Recon;
  let truth: Float64Array;
  let corr = 0;
  let noise = 0;
  let peak1 = 0;
  let peak2 = 0;
  let dip = false;
  let ksErr = 0;
  const es1 = new Float64Array(NMAX);
  const es2 = new Float64Array(NMAX);

  // ======================================================================
  // Scene: source plane, lens plane, observer
  const frameMat = new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.9 });
  const squareLoop = (half: number, z: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, z), new THREE.Vector3(half, -half, z), new THREE.Vector3(half, half, z), new THREE.Vector3(-half, half, z),
    ]);
    return new THREE.LineLoop(g, frameMat);
  };
  const half = (FS / 2) * U;
  scene.add(squareLoop(half, SRC_Z));
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * half, 2 * half),
    new THREE.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  backing.position.z = SRC_Z - 0.02;
  scene.add(backing);
  const lensFrame = squareLoop(half * LENS_SCALE, LENS_Z);
  lensFrame.material = new THREE.LineBasicMaterial({ color: 0x6d5bd0, transparent: true, opacity: 0.8 });
  scene.add(lensFrame);
  const lensSheet = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * half * LENS_SCALE, 2 * half * LENS_SCALE),
    new THREE.MeshBasicMaterial({ color: 0x6d5bd0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  );
  lensSheet.position.z = LENS_Z;
  scene.add(lensSheet);

  // Viewing cone edges from the observer to the source corners
  const conePts: THREE.Vector3[] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) conePts.push(new THREE.Vector3(0, 0, OBS_Z), new THREE.Vector3(sx * half, sy * half, SRC_Z));
  const cone = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(conePts), new THREE.LineDashedMaterial({ color: 0x3a4a6c, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.7 }));
  cone.computeLineDistances();
  scene.add(cone);

  // Observer: a small telescope
  const obsGroup = new THREE.Group();
  obsGroup.position.set(0, 0, OBS_Z);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xc9d3e6, metalness: 0.5, roughness: 0.35 }));
  tube.rotation.x = Math.PI / 2;
  obsGroup.add(tube);
  const lensCap = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
  lensCap.position.z = -0.251;
  lensCap.rotation.y = Math.PI;
  obsGroup.add(lensCap);
  scene.add(obsGroup);

  stage.label('observer', [0, -0.45, OBS_Z], 'muted');
  stage.label(`source galaxies, z = ${ZS}`, [0, -half - 0.35, SRC_Z], 'muted');
  stage.label(`lens plane, z = ${ZL}`, [0, half * LENS_SCALE + 0.3, LENS_Z], 'muted');

  // Halos (translucent glow + faint core), one per lens
  const glowTex = glowTexture();
  const halos: THREE.Group[] = [];
  for (let k = 0; k < 2; k++) {
    const h = new THREE.Group();
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: HALO_COL, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    h.add(spr);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 20),
      new THREE.MeshBasicMaterial({ color: HALO_COL, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    h.add(shell);
    h.userData.spr = spr;
    h.userData.shell = shell;
    scene.add(h);
    halos.push(h);
  }
  const haloLabel = stage.label('dark matter halo', [0, 0, 0], 'muted');

  // Galaxies: instanced ellipses in the source plane
  const galGeo = new THREE.CircleGeometry(1, 14);
  const galMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const gals = new THREE.InstancedMesh(galGeo, galMat, NMAX);
  gals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  gals.frustumCulled = false;
  scene.add(gals);
  const baseCol: THREE.Color[] = [];
  {
    const rnd = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const tints = [0xfff1d6, 0xdfe8ff, 0xffe3b0, 0xc9dcff, 0xffffff];
    for (let i = 0; i < NMAX; i++) {
      const c = new THREE.Color(tints[Math.floor(rnd(i) * tints.length)]);
      c.multiplyScalar(0.75 + 0.25 * rnd(i + 0.5));
      baseCol.push(c);
      gals.setColorAt(i, c);
    }
  }
  const maskColor = new THREE.Color(MASK_COL);

  // ======================================================================
  // Maps: true and reconstructed kappa as height fields
  const mapGroup = new THREE.Group();
  scene.add(mapGroup);
  function makeMap(x: number): { mesh: THREE.Mesh; geo: THREE.PlaneGeometry } {
    const g = new THREE.PlaneGeometry(2 * half, 2 * half, MAP_SEG, MAP_SEG);
    g.rotateX(-Math.PI / 2);
    const cols = new Float32Array(g.attributes.position.count * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }));
    mesh.position.set(x, MAP_Y, 0);
    mapGroup.add(mesh);
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(2 * half, 2 * half, 8, 8)), new THREE.LineBasicMaterial({ color: PALETTE.grid, transparent: true, opacity: 0.8 }));
    wire.rotation.x = -Math.PI / 2;
    wire.position.set(x, MAP_Y - 0.02, 0);
    mapGroup.add(wire);
    return { mesh, geo: g };
  }
  const truthM = makeMap(TRUTH_X);
  const reconM = makeMap(RECON_X);
  const truthLabel = stage.label('true κ (smoothed, mean removed)', [TRUTH_X, MAP_Y - 0.4, half + 0.5], 'muted', mapGroup);
  stage.label('κ rebuilt from galaxy shapes', [RECON_X, MAP_Y - 0.4, half + 0.5], 'muted', mapGroup);
  const hiddenLabel = stage.label('truth hidden', [TRUTH_X, MAP_Y + 0.4, 0], 'muted', mapGroup);
  mapGroup.visible = false;
  // Lens pins on the maps
  const pinGeo = new THREE.BufferGeometry();
  pinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const pins = new THREE.LineSegments(pinGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  mapGroup.add(pins);
  let heightScale = 1;
  const tmpC = new THREE.Color();

  function paintMap(m: { mesh: THREE.Mesh; geo: THREE.PlaneGeometry }, f: Float64Array, scale: number, cmax: number): void {
    const pos = m.geo.attributes.position as THREE.BufferAttribute;
    const col = m.geo.attributes.color as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    for (let v = 0; v < pos.count; v++) {
      const tx = pa[v * 3] / U;
      const ty = -pa[v * 3 + 2] / U;
      const k = sample(f, NR, FS, tx, ty);
      pa[v * 3 + 1] = k * scale;
      kappaColor(k / cmax, tmpC);
      ca[v * 3] = tmpC.r;
      ca[v * 3 + 1] = tmpC.g;
      ca[v * 3 + 2] = tmpC.b;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    m.geo.computeVertexNormals();
  }

  // ======================================================================
  // Galaxy drawing (exaggeration animates between 1 and 10)
  let shownX = exaggerate ? 10 : 1;
  const mArr = gals.instanceMatrix.array as Float32Array;
  function drawGalaxies(): void {
    if (!obs) return;
    const X = shownX;
    const r0 = Math.min(0.17, Math.max(0.04, 0.32 * Math.sqrt((FS * FS) / N))) * U;
    for (let i = 0; i < N; i++) {
      let e1 = es1[i] + X * (obs.e1[i] - es1[i]);
      let e2 = es2[i] + X * (obs.e2[i] - es2[i]);
      let e = Math.hypot(e1, e2);
      if (e > 0.92) {
        e1 *= 0.92 / e;
        e2 *= 0.92 / e;
        e = 0.92;
      }
      const phi = 0.5 * Math.atan2(e2, e1);
      const r = r0 * src.size[i];
      const a = r * Math.sqrt((1 + e) / (1 - e));
      const b = r * Math.sqrt((1 - e) / (1 + e));
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const o = i * 16;
      mArr[o] = a * c; mArr[o + 1] = a * s; mArr[o + 2] = 0; mArr[o + 3] = 0;
      mArr[o + 4] = -b * s; mArr[o + 5] = b * c; mArr[o + 6] = 0; mArr[o + 7] = 0;
      mArr[o + 8] = 0; mArr[o + 9] = 0; mArr[o + 10] = 1; mArr[o + 11] = 0;
      mArr[o + 12] = src.x[i] * U; mArr[o + 13] = src.y[i] * U; mArr[o + 14] = SRC_Z; mArr[o + 15] = 1;
    }
    gals.count = N;
    gals.instanceMatrix.needsUpdate = true;
  }

  function paintGalaxyColors(): void {
    if (!obs) return;
    for (let i = 0; i < N; i++) gals.setColorAt(i, obs.use[i] ? baseCol[i] : maskColor);
    if (gals.instanceColor) gals.instanceColor.needsUpdate = true;
  }

  // ======================================================================
  // Tangential shear inset
  const PW = 560;
  const PH = 440;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const X0 = 70;
  const X1 = PW - 18;
  const Y0 = 112;
  const Y1 = PH - 74;
  const RMIN = 0.4;
  const RMAX = 8;
  const px = (r: number) => X0 + (Math.log(r / RMIN) / Math.log(RMAX / RMIN)) * (X1 - X0);

  function drawPlot(): void {
    const g = pctx;
    g.clearRect(0, 0, PW, PH);
    // y range from the model and data
    let ymax = 0.03;
    for (let b = 0; b < prof.mid.length; b++) if (prof.count[b] > 0) ymax = Math.max(ymax, prof.model[b] * 1.5);
    ymax = Math.min(0.5, ymax);
    const ymin = -0.35 * ymax;
    const py = (v: number) => Y1 - ((v - ymin) / (ymax - ymin)) * (Y1 - Y0);
    g.font = '600 25px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText('Tangential shear, lens 1', 16, 34);
    g.font = '600 22px JetBrains Mono, monospace';
    g.fillStyle = prof.snr >= 3 ? css(PALETTE.green) : '#b8c3d9';
    g.fillText(`S/N = ${prof.snr > 999 ? '>999' : prof.snr.toFixed(1)}σ`, 16, 64);
    // grid
    g.strokeStyle = '#1a2336';
    g.lineWidth = 1.5;
    g.fillStyle = '#8391ab';
    g.font = '19px JetBrains Mono, monospace';
    for (const r of [0.5, 1, 2, 4, 8]) {
      g.beginPath();
      g.moveTo(px(r), Y0);
      g.lineTo(px(r), Y1);
      g.stroke();
      const t = String(r);
      g.fillText(t, px(r) - g.measureText(t).width / 2, Y1 + 26);
    }
    const xl = 'distance from lens θ (arcmin)';
    g.fillText(xl, (X0 + X1) / 2 - g.measureText(xl).width / 2, PH - 14);
    const step = ymax > 0.2 ? 0.1 : ymax > 0.08 ? 0.05 : ymax > 0.04 ? 0.02 : 0.01;
    for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) {
      g.strokeStyle = Math.abs(v) < 1e-9 ? '#3a4660' : '#1a2336';
      g.beginPath();
      g.moveTo(X0, py(v));
      g.lineTo(X1, py(v));
      g.stroke();
      g.fillText(v.toFixed(2), 10, py(v) + 6);
    }
    g.save();
    g.beginPath();
    g.rect(X0, Y0 - 6, X1 - X0, Y1 - Y0 + 12);
    g.clip();
    // truth: analytic lens-1 curve (reduced shear) and binned model
    if (showTruth) {
      const L = lenses[0];
      g.strokeStyle = css(HALO_COL);
      g.lineWidth = 3;
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const r = RMIN * (RMAX / RMIN) ** (k / 120);
        const v = lensGammaT(L, r) / (1 - lensKappa(L, r));
        if (k === 0) g.moveTo(px(r), py(v));
        else g.lineTo(px(r), py(v));
      }
      g.stroke();
    }
    // cross shear (null test)
    g.fillStyle = '#56627c';
    for (let b = 0; b < prof.mid.length; b++) {
      if (prof.count[b] === 0) continue;
      g.beginPath();
      g.arc(px(prof.mid[b]) + 7, py(prof.ex[b]), 4, 0, Math.PI * 2);
      g.fill();
    }
    // measured
    g.strokeStyle = css(PALETTE.cyan);
    g.fillStyle = css(PALETTE.cyan);
    g.lineWidth = 2.5;
    for (let b = 0; b < prof.mid.length; b++) {
      if (prof.count[b] === 0) continue;
      const x = px(prof.mid[b]);
      g.beginPath();
      g.moveTo(x, py(prof.et[b] - prof.err[b]));
      g.lineTo(x, py(prof.et[b] + prof.err[b]));
      g.stroke();
      g.beginPath();
      g.arc(x, py(prof.et[b]), 5.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // key
    g.font = '19px JetBrains Mono, monospace';
    let kx = 16;
    const key = (col: string, txt: string, line: boolean) => {
      g.fillStyle = col;
      g.strokeStyle = col;
      if (line) {
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(kx, 88);
        g.lineTo(kx + 20, 88);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(kx + 10, 88, 6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillText(txt, kx + 26, 95);
      kx += 26 + g.measureText(txt).width + 14;
    };
    key(css(PALETTE.cyan), 'measured', false);
    key('#56627c', 'cross (null)', false);
    if (showTruth) key(css(HALO_COL), 'true', true);
  }

  // ---- Title and legend overlays
  const title = document.createElement('div');
  Object.assign(title.style, {
    position: 'absolute', left: '10px', top: '10px', padding: '6px 10px', borderRadius: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', border: '1px solid #243049', font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9', maxWidth: '270px',
  } as CSSStyleDeclaration);
  viewport.appendChild(title);

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '270px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (col: number, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${css(col)}"></i>`;

  function paintOverlays(): void {
    const ex = exaggerate ? '<span style="color:#f5b642">stretch exaggerated ×10</span>' : 'true stretch (×1)';
    title.innerHTML = view === 'maps'
      ? `<div style="color:#dfe6f3;font-weight:600">Mass map from ${N.toLocaleString()} galaxy shapes</div><div>1′ cells, ${smooth.toFixed(1)}′ smoothing. Correlation with truth ${corr.toFixed(2)}</div>`
      : `<div style="color:#dfe6f3;font-weight:600">${N.toLocaleString()} background galaxies, ${ex}</div><div>Field ${FS}′ × ${FS}′ (${((FS * geo.Dl * Math.PI) / (180 * 60)).toFixed(1)} Mpc at the lens). σ_e = ${sigmaE.toFixed(2)}</div>`;
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">In the scene</div>` + [
      `${sw(0xdfe8ff)}background galaxy (intrinsic shape + lensing)`,
      `${sw(MASK_COL)}strong-lensing zone, κ > 0.5, not used`,
      showTruth ? `${sw(HALO_COL)}dark matter halo (schematic size)` : '',
      view === 'maps' ? `${sw(PALETTE.amber, false)}pins: true lens positions` : '',
    ].filter(Boolean).join('<br/>');
  }

  // ======================================================================
  // Recompute everything that depends on parameters
  function lensPos(L: Lens, h: THREE.Group, rScale: number): void {
    h.position.set(L.x * U * LENS_SCALE, L.y * U * LENS_SCALE, LENS_Z);
    const R = Math.max(0.35, Math.min(2.2, L.thetaS * U * rScale));
    (h.userData.spr as THREE.Sprite).scale.setScalar(R * 2.6);
    (h.userData.shell as THREE.Mesh).scale.setScalar(R * 0.55);
  }

  let snrReady = false;
  function recomputeLensing(): void {
    lenses = [makeLens(profile, 10 ** logM1, x1, y1, geo)];
    if (lens2On) lenses.push(makeLens(profile, 10 ** logM2, x2, y2, geo));
    field = lensingField(lenses, NG, FS);
    lenses.forEach((L, k) => lensPos(L, halos[k], 1.4));
    halos[1].visible = showTruth && lens2On;
    halos[0].visible = showTruth;
    haloLabel.position.set(lenses[0].x * U * LENS_SCALE, lenses[0].y * U * LENS_SCALE + 1.0, LENS_Z);
    haloLabel.visible = showTruth && view !== 'maps';
    // Accuracy: grid shear vs analytic shear for lens-free annuli 1'..5'
    const o = { g1: 0, g2: 0, k: 0 };
    let se = 0;
    let sa = 0;
    for (let k = 0; k < 240; k++) {
      const ang = k * 2.39996;
      const r = 1 + 4 * ((k % 24) / 24);
      const x = lenses[0].x + r * Math.cos(ang);
      const y = lenses[0].y + r * Math.sin(ang);
      if (Math.abs(x) > FS / 2 - 0.5 || Math.abs(y) > FS / 2 - 0.5) continue;
      analyticShear(lenses, x, y, o);
      const g1 = sample(field.g1, NG, FS, x, y);
      const g2 = sample(field.g2, NG, FS, x, y);
      se += (g1 - o.g1) ** 2 + (g2 - o.g2) ** 2;
      sa += o.g1 * o.g1 + o.g2 * o.g2;
    }
    ksErr = sa > 0 ? Math.sqrt(se / sa) : 0;
    recomputeObs();
  }

  function recomputeObs(): void {
    obs = observe(field, src, N, sigmaE, obs);
    const tmp: [number, number] = [0, 0];
    for (let i = 0; i < N; i++) {
      intrinsic(src, i, sigmaE, tmp);
      es1[i] = tmp[0];
      es2[i] = tmp[1];
    }
    prof = tangentialProfile(lenses[0].x, lenses[0].y, N, src.x, src.y, obs.e1, obs.e2, obs.t1, obs.t2, obs.use, sigmaE, RMIN, RMAX, 8);
    snrReady = true;
    drawGalaxies();
    paintGalaxyColors();
    drawPlot();
    recomputeMaps();
  }

  function recomputeMaps(): void {
    if (!obs) return;
    recon = reconstruct(N, src.x, src.y, obs.e1, obs.e2, obs.use, NR, FS, smooth);
    truth = truthMap(field, NR, smooth);
    corr = correlation(recon.kE, truth);
    noise = rms(recon.kB);
    let tmax = 0.01;
    for (let q = 0; q < truth.length; q++) tmax = Math.max(tmax, truth[q]);
    heightScale = 2.2 / tmax;
    paintMap(truthM, truth, heightScale, tmax);
    paintMap(reconM, recon.kE, heightScale, tmax);
    const nz = Math.max(noise, 1e-6);
    peak1 = sample(recon.kE, NR, FS, lenses[0].x, lenses[0].y) / nz;
    if (lenses.length > 1) {
      peak2 = sample(recon.kE, NR, FS, lenses[1].x, lenses[1].y) / nz;
      const mid = sample(recon.kE, NR, FS, (lenses[0].x + lenses[1].x) / 2, (lenses[0].y + lenses[1].y) / 2) / nz;
      dip = mid < 0.7 * Math.min(peak1, peak2);
    } else {
      peak2 = 0;
      dip = false;
    }
    // Pins at lens positions, drawn on both maps
    const pa = pinGeo.attributes.position.array as Float32Array;
    pa.fill(0);
    let p = 0;
    for (const L of lenses) {
      for (const mx of [TRUTH_X, RECON_X]) {
        const f = mx === TRUTH_X ? truth : recon.kE;
        const h = Math.max(0, sample(f, NR, FS, L.x, L.y) * heightScale);
        pa[p++] = mx + L.x * U; pa[p++] = MAP_Y + h; pa[p++] = -L.y * U;
        pa[p++] = mx + L.x * U; pa[p++] = MAP_Y + h + 0.9; pa[p++] = -L.y * U;
      }
    }
    pinGeo.attributes.position.needsUpdate = true;
    pinGeo.setDrawRange(0, lenses.length * 4);
    truthM.mesh.visible = showTruth;
    truthLabel.visible = showTruth;
    hiddenLabel.visible = !showTruth;
    paintOverlays();
  }

  // ======================================================================
  // Controls
  const touch = () => {
    touched = true;
  };
  const ui = new Panel(panel);
  ui.section('Lens');
  ui.select<Profile>({
    key: 'profile', label: 'Mass profile', value: profile,
    options: [{ value: 'sis', label: 'Isothermal (SIS)' }, { value: 'nfw', label: 'NFW' }],
    onChange: (v) => { profile = v; touch(); recomputeLensing(); },
  });
  const fmtM = (v: number) => `${(10 ** v / 1e14).toFixed(1)}×10¹⁴ M☉`;
  ui.slider({ key: 'mass', label: 'Lens 1 mass M₂₀₀', min: 13.8, max: 15.3, step: 0.01, value: logM1, format: fmtM, onInput: (v) => { logM1 = v; touch(); recomputeLensing(); } });
  const cX1 = ui.slider({ key: 'x1', label: 'Lens 1 x', min: -6, max: 6, step: 0.1, value: x1, unit: '′', onInput: (v) => { x1 = v; touch(); recomputeLensing(); } });
  const cY1 = ui.slider({ key: 'y1', label: 'Lens 1 y', min: -6, max: 6, step: 0.1, value: y1, unit: '′', onInput: (v) => { y1 = v; touch(); recomputeLensing(); } });
  const lens2Rows: Control<number>[] = [];
  ui.toggle({
    key: 'lens2', label: 'Second lens', value: lens2On,
    onChange: (v) => {
      lens2On = v;
      if (v) {
        // Keep the pair clearly separated when switching on
        x1 = -3; y1 = 0; x2 = 3; y2 = 0;
        cX1.set(x1, false); cY1.set(y1, false);
        lens2Rows[1].set(x2, false); lens2Rows[2].set(y2, false);
      }
      lens2Rows.forEach((c) => (c.el.style.display = v ? '' : 'none'));
      touch();
      recomputeLensing();
    },
  });
  lens2Rows.push(ui.slider({ key: 'mass2', label: 'Lens 2 mass', min: 13.8, max: 15.3, step: 0.01, value: logM2, format: fmtM, onInput: (v) => { logM2 = v; touch(); recomputeLensing(); } }));
  lens2Rows.push(ui.slider({ key: 'x2', label: 'Lens 2 x', min: -6, max: 6, step: 0.1, value: x2, unit: '′', onInput: (v) => { x2 = v; touch(); recomputeLensing(); } }));
  lens2Rows.push(ui.slider({ key: 'y2', label: 'Lens 2 y', min: -6, max: 6, step: 0.1, value: y2, unit: '′', onInput: (v) => { y2 = v; touch(); recomputeLensing(); } }));
  lens2Rows.forEach((c) => (c.el.style.display = 'none'));

  ui.section('Background galaxies');
  ui.slider({ key: 'N', label: 'Number of galaxies N', min: 200, max: NMAX, step: 100, value: N, format: (v) => v.toLocaleString(), onInput: (v) => { N = v; touch(); recomputeObs(); } });
  ui.slider({ key: 'sigmaE', label: 'Shape noise σ_e', min: 0, max: 0.4, step: 0.01, value: sigmaE, format: (v) => v.toFixed(2), onInput: (v) => { sigmaE = v; touch(); recomputeObs(); } });
  ui.buttons([{ label: 'New sky', onClick: () => { seed++; src = makeSources(NMAX, FS, seed); touch(); recomputeObs(); } }]);

  ui.section('Display');
  ui.toggle({ key: 'exaggerate', label: 'Exaggerate stretch ×10', value: exaggerate, onChange: (v) => { exaggerate = v; paintOverlays(); } });
  ui.toggle({
    key: 'truth', label: 'Show truth (halo, true map, model)', value: showTruth,
    onChange: (v) => { showTruth = v; halos[0].visible = v; halos[1].visible = v && lens2On; haloLabel.visible = v && view !== 'maps'; drawPlot(); recomputeMaps(); },
  });
  ui.slider({ key: 'smooth', label: 'Map smoothing', min: 0.5, max: 3, step: 0.1, value: smooth, unit: '′', onInput: (v) => { smooth = v; recomputeMaps(); } });
  ui.select<View>({
    key: 'view', label: 'View', value: view,
    options: [{ value: 'stack', label: 'Stack' }, { value: 'sky', label: 'Observer' }, { value: 'maps', label: 'Maps' }],
    onChange: (v) => {
      view = v;
      stage.flyTo(CAM[v][0], CAM[v][1]);
      haloLabel.visible = showTruth && v !== 'maps';
      obsGroup.visible = v !== 'sky';
      mapGroup.visible = v === 'maps';
      paintOverlays();
    },
  });

  ui.section('Readouts');
  const rThE = ui.readout('thetaE', 'SIS Einstein radius θ_E');
  const rSig = ui.readout('sigmaV', 'SIS σ_v');
  const rCr = ui.readout('sigcr', 'Σ_cr');
  const rG2 = ui.readout('gamma2', 'γ_t at 2′ (lens 1)');
  const rSnr = ui.readout('snr', 'tangential S/N');
  const rCorr = ui.readout('corr', 'map vs truth corr.');
  const rNoise = ui.readout('noise', 'map noise (B-mode rms)');
  const rErr = ui.readout('ksErr', 'grid vs analytic shear');
  ui.note('The B mode is the part of the rebuilt map that lensing cannot make. It measures the noise. Quadruple N and it halves.');

  function updateReadouts(): void {
    const L = lenses[0];
    rThE(`${(L.thetaE * 60).toFixed(1)}″`);
    rSig(`${L.sigmaV.toFixed(0)} km/s`);
    rCr(`${geo.sigmaCr.toFixed(0)} M☉/pc²`);
    rG2(lensGammaT(L, 2).toFixed(3));
    rSnr(`${prof.snr > 999 ? '>999' : prof.snr.toFixed(1)}σ`);
    rCorr(corr.toFixed(3));
    rNoise(noise.toFixed(4));
    rErr(`${(ksErr * 100).toFixed(1)} %`);
  }

  // ======================================================================
  // Frame loop: animate exaggeration and let halos breathe
  stage.onFrame((dt, t) => {
    const target = exaggerate ? 10 : 1;
    if (Math.abs(shownX - target) > 1e-3) {
      shownX += (target - shownX) * Math.min(1, dt * 5);
      if (Math.abs(shownX - target) < 0.01) shownX = target;
      drawGalaxies();
    }
    for (let k = 0; k < 2; k++) {
      const spr = halos[k].userData.spr as THREE.Sprite;
      (spr.material as THREE.SpriteMaterial).opacity = 0.5 + 0.08 * Math.sin(t * 1.3 + k * 2);
    }
    if (snrReady) updateReadouts();
  });

  recomputeLensing();
  paintOverlays();

  return {
    state: () => ({
      touched,
      profile,
      mass: 10 ** logM1 / 1e14,
      lens2: lens2On,
      sep: lens2On ? Math.hypot(x2 - x1, y2 - y1) : 0,
      N,
      sigmaE,
      exaggerate,
      truth: showTruth,
      smooth,
      view,
      thetaE: lenses[0].thetaE * 60,
      snr: prof.snr,
      corr,
      noise,
      peak1,
      peak2,
      dip,
      ksErr,
    }),
    dispose: () => {
      plot.remove();
      title.remove();
      legend.remove();
      glowTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'weak-lensing',
  number: 79,
  title: 'Mapping Dark Matter with Light',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'Tiny distortions in distant galaxies reveal invisible mass.',
  content,
  mount,
};

export default topic;
