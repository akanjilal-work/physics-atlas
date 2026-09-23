import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A0,
  BUDGET,
  BULLET,
  G,
  KPC_PER_KMS_MYR,
  MW,
  baryonEnclosed,
  bulletInit,
  bulletPassage,
  bulletStep,
  chi2,
  contour,
  flatness,
  haloEnclosed,
  illustrativeData,
  logSlope,
  mondAccel,
  mondRadius,
  rotation,
  type BulletState,
  type Curve,
  type GalaxyParams,
  type Model,
} from './physics.ts';

type View = 'galaxy' | 'bullet';

/** Scene units per kpc in the galaxy view. */
const S = 0.22;
const N_STARS = 4200;
const R_MAX = 27; // kpc, outermost stars
const N_BEADS = 13;
const LUT_N = 256;
const GAL_RATE = 40; // Myr per second at 1x
const BUL_RATE = 90; // Myr per second at 1x
const BUL_END = 420; // Myr after core passage, then hold
/** Scene units per kpc in the Bullet view. */
const SB = 1 / 250;
const MASS_BLUE = 0x6f9dff;
const GAS_FRAC = 0.15;

const MODEL_COL: Record<Model, number> = { newton: PALETTE.amber, nfw: PALETTE.cyan, iso: PALETTE.cyan, mond: PALETTE.green };
const MODEL_NAME: Record<Model, string> = { newton: 'visible only', nfw: 'visible + NFW halo', iso: 'visible + cored halo', mond: 'MOND, no halo' };

function glowTexture(inner = 0.3): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(inner, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft projected-density texture for the halo: surface density of a cored sphere. */
function haloTexture(): THREE.CanvasTexture {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / (N / 2) - 1;
      const y = (j + 0.5) / (N / 2) - 1;
      const R = Math.hypot(x, y);
      // Projected cored isothermal (core 0.25), truncated at the sprite edge.
      const a = R >= 1 ? 0 : (1 / Math.sqrt(0.0625 + R * R)) * (1 - R) ** 1.5 * 0.25;
      const k = 4 * (j * N + i);
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.min(255, a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small deterministic RNG so the galaxy looks the same on every visit. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circleLine(r: number, color: number, opacity: number, dashed: boolean, n = 160): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let j = 0; j <= n; j++) {
    const a = (j / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(g, m);
  if (dashed) line.computeLineDistances();
  return line;
}

const fmtMass = (m: number) => {
  const e = Math.floor(Math.log10(m));
  return `${(m / 10 ** e).toFixed(1)}×10${String(e).replace(/./g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
};

function mount({ viewport, panel }: MountContext): TopicInstance {
  const p: GalaxyParams = { ...MW };
  let model: Model = 'nfw';
  let view: View = 'galaxy';
  let playing = true;
  let speed = 1;
  let showGlow = true;
  let probeR = 8.2;
  let touched = false;

  const GAL_CAM: [number, number, number] = [1.5, 6.0, 8.4];
  const GAL_TGT: [number, number, number] = [1.5, -0.6, 0];
  const BUL_CAM: [number, number, number] = [0, 0.6, 12.5];
  const stage = createStage(viewport, { camera: GAL_CAM, target: GAL_TGT, fov: 45, near: 0.05, far: 300, lights: false });
  const { scene, controls } = stage;
  controls.minDistance = 3;
  controls.maxDistance = 40;

  const starTex = glowTexture(0.25);
  const haloTex = haloTexture();
  const c: Curve = { bulge: 0, disk: 0, halo: 0, visible: 0, total: 0 };

  // =====================================================================
  // Galaxy
  const gal = new THREE.Group();
  scene.add(gal);

  const rand = rng(1933);
  const gauss = () => {
    const u = Math.max(1e-9, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const starR = new Float32Array(N_STARS);
  const starY = new Float32Array(N_STARS);
  const starTh0 = new Float32Array(N_STARS);
  const starTh = new Float32Array(N_STARS);
  const starOm = new Float32Array(N_STARS);
  const starPos = new Float32Array(N_STARS * 3);
  const starCol = new Float32Array(N_STARS * 3);
  const PITCH = (13 * Math.PI) / 180;
  const cWarm = new THREE.Color(0xffd9a0);
  const cBlue = new THREE.Color(0xa9c8ff);
  const cPale = new THREE.Color(0xe8ecf6);
  const tmpC = new THREE.Color();
  for (let i = 0; i < N_STARS; i++) {
    const u = rand();
    let R: number;
    let th: number;
    let y: number;
    if (u < 0.14) {
      // Bulge
      R = Math.abs(gauss()) * 1.1 + 0.05;
      th = rand() * Math.PI * 2;
      y = gauss() * 0.7 * Math.exp(-R / 2);
      tmpC.copy(cWarm);
    } else if (u < 0.72) {
      // Two logarithmic arms, trailing for counterclockwise rotation seen from above.
      R = 2.5 + Math.pow(rand(), 1.25) * (R_MAX - 2.5);
      const arm = rand() < 0.5 ? 0 : Math.PI;
      th = arm - Math.log(R / 2.5) / Math.tan(PITCH) + gauss() * 0.22;
      y = gauss() * 0.12;
      tmpC.copy(cBlue).lerp(cPale, rand() * 0.5);
    } else {
      // Smooth disk
      R = Math.min(R_MAX, (-Math.log(Math.max(1e-6, rand())) - Math.log(Math.max(1e-6, rand()))) * 3.2 + 0.3);
      th = rand() * Math.PI * 2;
      y = gauss() * 0.16;
      tmpC.copy(cPale).lerp(cWarm, Math.max(0, 1 - R / 8) * 0.8);
    }
    const b = 0.55 + 0.45 * rand();
    starR[i] = R;
    starY[i] = y;
    starTh0[i] = th;
    starTh[i] = th;
    starCol[3 * i] = tmpC.r * b;
    starCol[3 * i + 1] = tmpC.g * b;
    starCol[3 * i + 2] = tmpC.b * b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3).setUsage(THREE.DynamicDrawUsage));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.13, map: starTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  stars.frustumCulled = false;
  gal.add(stars);

  // Core glow
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffd9a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.setScalar(2.2);
  gal.add(core);

  // Tracer beads that start on a straight spoke.
  const beadR = new Float32Array(N_BEADS);
  const beadTh = new Float32Array(N_BEADS);
  const beadOm = new Float32Array(N_BEADS);
  const beadPos = new Float32Array(N_BEADS * 3);
  for (let k = 0; k < N_BEADS; k++) beadR[k] = 2 + 2 * k;
  const beadGeo = new THREE.BufferGeometry();
  beadGeo.setAttribute('position', new THREE.BufferAttribute(beadPos, 3).setUsage(THREE.DynamicDrawUsage));
  const beads = new THREE.Points(beadGeo, new THREE.PointsMaterial({ size: 0.42, map: starTex, color: PALETTE.amber, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  beads.frustumCulled = false;
  gal.add(beads);
  const spokeGeo = new THREE.BufferGeometry();
  spokeGeo.setAttribute('position', new THREE.BufferAttribute(beadPos, 3));
  const spoke = new THREE.Line(spokeGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.55 }));
  spoke.frustumCulled = false;
  gal.add(spoke);
  const spokeLabel = stage.label('beads started in a straight line', [0, 0, 0], 'muted', gal);

  // Halo glow sprite
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, color: PALETTE.violet, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const halo = new THREE.Sprite(haloMat);
  halo.renderOrder = -1;
  gal.add(halo);
  const haloLabel = stage.label('dark halo', [0, 0, 0], 'muted', gal);

  // Probe ring and MOND ring
  const probeRing = circleLine(1, 0xffffff, 0.55, true);
  gal.add(probeRing);
  const probeLabel = stage.label('', [0, 0, 0], '', gal);
  const mondRing = circleLine(1, PALETTE.green, 0.8, true);
  gal.add(mondRing);
  const mondLabel = stage.label('g_N = a₀', [0, 0, 0], 'muted', gal);

  // Lookup table of angular speed on a radial grid (rad per Myr).
  const lutOm = new Float32Array(LUT_N);
  const lutR = (k: number) => 0.02 + (k / (LUT_N - 1)) * (R_MAX + 3);
  function omegaAt(R: number): number {
    const x = ((R - 0.02) / (R_MAX + 3)) * (LUT_N - 1);
    const k = Math.max(0, Math.min(LUT_N - 2, Math.floor(x)));
    const f = Math.min(1, Math.max(0, x - k));
    return lutOm[k] + (lutOm[k + 1] - lutOm[k]) * f;
  }
  function rebuildOmega(): void {
    for (let k = 0; k < LUT_N; k++) {
      const R = lutR(k);
      lutOm[k] = rotation(R, p, model, c).total / R / KPC_PER_KMS_MYR;
    }
    for (let i = 0; i < N_STARS; i++) starOm[i] = omegaAt(starR[i]);
    for (let k = 0; k < N_BEADS; k++) beadOm[k] = omegaAt(beadR[k]);
  }

  let tGal = 0;
  function resetArms(): void {
    starTh.set(starTh0);
    beadTh.fill(0);
    tGal = 0;
    drawGalaxy();
  }

  function drawGalaxy(): void {
    for (let i = 0; i < N_STARS; i++) {
      const R = starR[i] * S;
      const th = starTh[i];
      starPos[3 * i] = R * Math.cos(th);
      starPos[3 * i + 1] = starY[i] * S;
      starPos[3 * i + 2] = -R * Math.sin(th);
    }
    (starGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let k = 0; k < N_BEADS; k++) {
      const R = beadR[k] * S;
      beadPos[3 * k] = R * Math.cos(beadTh[k]);
      beadPos[3 * k + 1] = 0.02;
      beadPos[3 * k + 2] = -R * Math.sin(beadTh[k]);
    }
    (beadGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (spokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const k6 = 3 * 6;
    spokeLabel.position.set(beadPos[k6], 0.45, beadPos[k6 + 2]);
  }

  function updateGalaxyDecor(): void {
    const isHalo = model === 'nfw' || model === 'iso';
    halo.visible = isHalo && showGlow;
    haloLabel.visible = halo.visible;
    const rVis = Math.min(75, Math.max(28, (model === 'iso' ? 5 : 2.6) * p.rs));
    halo.scale.setScalar(2 * rVis * S);
    haloMat.opacity = Math.min(0.85, 0.22 + 0.32 * Math.max(0, Math.log10(p.M200) - 11));
    haloLabel.position.set(-rVis * S * 0.55, rVis * S * 0.42, 0);
    haloLabel.element.textContent = model === 'iso' ? `cored dark halo, r_c = ${p.rs.toFixed(0)} kpc` : `NFW dark halo, r_s = ${p.rs.toFixed(0)} kpc`;
    probeRing.scale.setScalar(probeR * S);
    probeLabel.position.set(probeR * S * 0.71, 0.05, probeR * S * 0.71);
    probeLabel.element.textContent = `r = ${probeR.toFixed(1)} kpc, v = ${rotation(probeR, p, model, c).total.toFixed(0)} km/s`;
    const rm = mondRadius(p);
    mondRing.visible = model === 'mond';
    mondLabel.visible = mondRing.visible;
    mondRing.scale.setScalar(rm * S);
    mondLabel.position.set(-rm * S * 0.71, 0.05, rm * S * 0.71);
  }

  // =====================================================================
  // Bullet Cluster
  const bul = new THREE.Group();
  bul.visible = false;
  scene.add(bul);
  const brand = rng(657);
  const bg = () => {
    const u = Math.max(1e-9, brand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * brand());
  };

  const GAS_N: [number, number] = [1500, 700];
  const GAL_N: [number, number] = [90, 40];
  const gasOff = [new Float32Array(GAS_N[0] * 2), new Float32Array(GAS_N[1] * 2)];
  const galOff = [new Float32Array(GAL_N[0] * 2), new Float32Array(GAL_N[1] * 2)];
  for (let q = 0; q < 2; q++) {
    for (let i = 0; i < GAS_N[q]; i++) {
      gasOff[q][2 * i] = bg() * BULLET.gasSig[q];
      gasOff[q][2 * i + 1] = bg() * BULLET.gasSig[q] * 0.85;
    }
    for (let i = 0; i < GAL_N[q]; i++) {
      galOff[q][2 * i] = bg() * BULLET.sig[q] * 0.8;
      galOff[q][2 * i + 1] = bg() * BULLET.sig[q] * 0.7;
    }
  }
  const gasPos = new Float32Array((GAS_N[0] + GAS_N[1]) * 3);
  const gasGeo = new THREE.BufferGeometry();
  gasGeo.setAttribute('position', new THREE.BufferAttribute(gasPos, 3).setUsage(THREE.DynamicDrawUsage));
  const gas = new THREE.Points(gasGeo, new THREE.PointsMaterial({ size: 0.55, map: starTex, color: PALETTE.rose, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
  gas.frustumCulled = false;
  bul.add(gas);
  const galPos = new Float32Array((GAL_N[0] + GAL_N[1]) * 3);
  const galGeo = new THREE.BufferGeometry();
  galGeo.setAttribute('position', new THREE.BufferAttribute(galPos, 3).setUsage(THREE.DynamicDrawUsage));
  const gals = new THREE.Points(galGeo, new THREE.PointsMaterial({ size: 0.14, map: starTex, color: 0xfff1d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  gals.frustumCulled = false;
  bul.add(gals);

  // Mass contours (marching squares on a grid, rewritten in place).
  const NX = 128;
  const NY = 64;
  const XW = 3200; // kpc half width
  const YH = 1600;
  const field = new Float32Array(NX * NY);
  const SEG_CAP = 8000;
  const segs = new Float32Array(SEG_CAP * 4);
  const conPos = new Float32Array(SEG_CAP * 6);
  const conGeo = new THREE.BufferGeometry();
  conGeo.setAttribute('position', new THREE.BufferAttribute(conPos, 3).setUsage(THREE.DynamicDrawUsage));
  const contours = new THREE.LineSegments(conGeo, new THREE.LineBasicMaterial({ color: MASS_BLUE, transparent: true, opacity: 0.9 }));
  contours.frustumCulled = false;
  bul.add(contours);
  const LEVELS = [0.12, 0.28, 0.5, 0.75];

  // Bow shock ahead of the bullet gas.
  const SHOCK_N = 48;
  const shockPos = new Float32Array(SHOCK_N * 3);
  const shockGeo = new THREE.BufferGeometry();
  shockGeo.setAttribute('position', new THREE.BufferAttribute(shockPos, 3).setUsage(THREE.DynamicDrawUsage));
  const shockMat = new THREE.LineBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0 });
  const shock = new THREE.Line(shockGeo, shockMat);
  shock.frustumCulled = false;
  bul.add(shock);

  const labBulMass = stage.label('bullet: mass', [0, 0, 0], '', bul);
  const labBulGas = stage.label('bullet: gas', [0, 0, 0], '', bul);
  const labMain = stage.label('main cluster', [0, 0, 0], 'muted', bul);
  labBulMass.element.style.color = css(MASS_BLUE);
  labBulGas.element.style.color = css(PALETTE.rose);

  let bs: BulletState = bulletInit();
  const tPass = bulletPassage(bs);
  const H_BUL = 0.5; // Myr per step
  let bulletDone = false;

  function resetBullet(): void {
    bs = bulletInit();
    bulletDone = false;
    drawBullet();
  }

  function drawBullet(): void {
    const after = bs.t - tPass;
    const shape = Math.max(0, Math.min(1, after / 120));
    let o = 0;
    for (let q = 0; q < 2; q++) {
      const dir = q === 1 ? 1 : -1; // bullet gas moves +x, main gas moves -x
      const off = gasOff[q];
      for (let i = 0; i < GAS_N[q]; i++) {
        let dx = off[2 * i];
        const dy = off[2 * i + 1];
        const ahead = dx * dir > 0;
        // After passage: a sharp front ahead, a stretched wake behind (schematic).
        if (q === 1) dx *= ahead ? 1 - 0.45 * shape : 1 + 0.6 * shape;
        else dx *= ahead ? 1 - 0.1 * shape : 1 + 0.35 * shape;
        gasPos[o++] = (bs.x[q] + dx) * SB;
        gasPos[o++] = dy * SB * (q === 1 ? 1 - 0.2 * shape * (ahead ? 1 : 0) : 1);
        gasPos[o++] = -0.05;
      }
    }
    (gasGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    o = 0;
    for (let q = 0; q < 2; q++) {
      const off = galOff[q];
      for (let i = 0; i < GAL_N[q]; i++) {
        galPos[o++] = (bs.X[q] + off[2 * i]) * SB;
        galPos[o++] = off[2 * i + 1] * SB;
        galPos[o++] = 0.02;
      }
    }
    (galGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Surface density: dark matter plus gas, each a Gaussian.
    let peak = 0;
    for (let j = 0; j < NY; j++) {
      const y = -YH + (2 * YH * j) / (NY - 1);
      for (let i = 0; i < NX; i++) {
        const x = -XW + (2 * XW * i) / (NX - 1);
        let s = 0;
        for (let q = 0; q < 2; q++) {
          const m = BULLET.M[q];
          const sd = BULLET.sig[q];
          const sg = BULLET.gasSig[q];
          const dxd = x - bs.X[q];
          const dxg = x - bs.x[q];
          s += ((m * (1 - GAS_FRAC)) / (sd * sd)) * Math.exp(-(dxd * dxd + y * y) / (2 * sd * sd));
          s += ((m * GAS_FRAC) / (sg * sg)) * Math.exp(-(dxg * dxg + y * y) / (2 * sg * sg));
        }
        field[j * NX + i] = s;
        if (s > peak) peak = s;
      }
    }
    const ref = (BULLET.M[1] * (1 - GAS_FRAC)) / BULLET.sig[1] ** 2 + (BULLET.M[1] * GAS_FRAC) / BULLET.gasSig[1] ** 2;
    let n = 0;
    for (const lv of LEVELS) n += contour(field, NX, NY, lv * ref, segs, n);
    const sx = (2 * XW * SB) / (NX - 1);
    const sy = (2 * YH * SB) / (NY - 1);
    for (let k = 0; k < n; k++) {
      conPos[6 * k] = -XW * SB + segs[4 * k] * sx;
      conPos[6 * k + 1] = -YH * SB + segs[4 * k + 1] * sy;
      conPos[6 * k + 2] = 0.01;
      conPos[6 * k + 3] = -XW * SB + segs[4 * k + 2] * sx;
      conPos[6 * k + 4] = -YH * SB + segs[4 * k + 3] * sy;
      conPos[6 * k + 5] = 0.01;
    }
    conGeo.setDrawRange(0, n * 2);
    (conGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Bow shock: a parabola just ahead of the bullet gas, once it has pushed through.
    const vr = bs.v[1] - bs.v[0];
    shockMat.opacity = Math.max(0, Math.min(0.85, shape * 1.2)) * (vr > 0.5 ? 1 : 0.3);
    const xs = bs.x[1] + 1.1 * BULLET.gasSig[1];
    for (let k = 0; k < SHOCK_N; k++) {
      const u = -1 + (2 * k) / (SHOCK_N - 1);
      const yy = u * 520;
      shockPos[3 * k] = (xs - (yy * yy) / 700) * SB;
      shockPos[3 * k + 1] = yy * SB;
      shockPos[3 * k + 2] = 0;
    }
    (shockGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    labBulMass.position.set(bs.X[1] * SB, 0.95, 0);
    labBulGas.position.set(bs.x[1] * SB, -0.95, 0);
    labMain.position.set(bs.X[0] * SB, 1.55, 0);
  }

  // =====================================================================
  // Overlays: rotation-curve inset, title, legend
  const data = illustrativeData();
  const PW = 620;
  const PH = 420;
  const plot = document.createElement('canvas');
  plot.width = PW;
  plot.height = PH;
  Object.assign(plot.style, {
    position: 'absolute', right: '10px', top: '10px', width: `${PW / 2}px`, height: `${PH / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(plot);
  const pctx = plot.getContext('2d')!;
  const X0 = 64;
  const X1 = PW - 18;
  const Y0 = 70;
  const Y1 = PH - 44;
  const RMAXP = 40;
  const VMAXP = 320;
  const px = (r: number) => X0 + (r / RMAXP) * (X1 - X0);
  const py = (v: number) => Y1 - (v / VMAXP) * (Y1 - Y0);

  function curvePath(key: keyof Curve, m: Model): void {
    pctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const r = 0.1 + (i / 160) * (RMAXP - 0.1);
      const v = rotation(r, p, m, c)[key];
      if (i === 0) pctx.moveTo(px(r), py(v));
      else pctx.lineTo(px(r), py(v));
    }
    pctx.stroke();
  }

  function drawPlot(): void {
    const g = pctx;
    g.clearRect(0, 0, PW, PH);
    g.font = '600 22px JetBrains Mono, monospace';
    g.fillStyle = '#dfe6f3';
    g.fillText('Rotation curve v(r)', 16, 30);
    g.font = '17px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.fillText('points: illustrative, not real data', 16, 54);
    g.strokeStyle = '#1a2336';
    g.lineWidth = 1.5;
    for (const r of [10, 20, 30, 40]) {
      g.beginPath();
      g.moveTo(px(r), Y0);
      g.lineTo(px(r), Y1);
      g.stroke();
      g.fillText(String(r), px(r) - 10, PH - 18);
    }
    g.fillText('r (kpc)', X0 + 4, PH - 18);
    for (const v of [100, 200, 300]) {
      g.beginPath();
      g.moveTo(X0, py(v));
      g.lineTo(X1, py(v));
      g.stroke();
      g.fillText(String(v), 14, py(v) + 6);
    }
    g.save();
    g.beginPath();
    g.rect(X0, Y0 - 4, X1 - X0, Y1 - Y0 + 4);
    g.clip();
    // Components
    g.lineWidth = 2;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(245,182,66,0.45)';
    curvePath('bulge', 'newton');
    curvePath('disk', 'newton');
    if (model === 'nfw' || model === 'iso') {
      g.strokeStyle = css(PALETTE.violet);
      g.lineWidth = 2.5;
      g.setLineDash([4, 5]);
      curvePath('halo', model);
    }
    g.setLineDash([10, 7]);
    g.lineWidth = 3;
    g.strokeStyle = css(PALETTE.amber);
    curvePath('visible', 'newton');
    g.setLineDash([]);
    g.lineWidth = 4;
    g.strokeStyle = css(MODEL_COL[model]);
    curvePath('total', model);
    // Probe
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.5;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.moveTo(px(probeR), Y0);
    g.lineTo(px(probeR), Y1);
    g.stroke();
    g.setLineDash([]);
    // Data
    g.strokeStyle = '#ffffff';
    g.fillStyle = '#ffffff';
    g.lineWidth = 2;
    for (const d of data) {
      const x = px(d.r);
      g.beginPath();
      g.moveTo(x, py(d.v - d.err));
      g.lineTo(x, py(d.v + d.err));
      g.stroke();
      g.beginPath();
      g.arc(x, py(d.v), 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Key
    g.font = '16px JetBrains Mono, monospace';
    let kx = X0 + 250;
    const key = (col: string, txt: string, dash: number[]) => {
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.setLineDash(dash);
      g.beginPath();
      g.moveTo(kx, 24);
      g.lineTo(kx + 22, 24);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = col;
      g.fillText(txt, kx + 27, 30);
      kx += 27 + g.measureText(txt).width + 14;
    };
    if (model !== 'newton') key(css(MODEL_COL[model]), model === 'mond' ? 'MOND' : 'total', []);
    key(css(PALETTE.amber), 'visible', [8, 5]);
    if (model === 'nfw' || model === 'iso') key(css(PALETTE.violet), 'halo', [4, 4]);
  }

  const title = document.createElement('div');
  Object.assign(title.style, {
    position: 'absolute', left: '10px', top: '10px', padding: '6px 10px', borderRadius: '10px', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.72)', border: '1px solid #243049', font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9', maxWidth: '260px',
  } as CSSStyleDeclaration);
  viewport.appendChild(title);

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '260px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (col: number, round = true) => `<i style="display:inline-block;width:9px;height:9px;border-radius:${round ? '50%' : '2px'};margin-right:6px;background:${css(col)}"></i>`;
  const head = (t: string) => `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${t}</div>`;

  function paintOverlays(): void {
    if (view === 'galaxy') {
      title.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Spiral galaxy: ${MODEL_NAME[model]}</div>
<div>1 s of play = ${(GAL_RATE * speed).toFixed(0)} Myr. Circular orbits only.</div>`;
      legend.innerHTML = head('In the scene') + [
        `${sw(0xa9c8ff)}stars, each on a circle at v(r)`,
        `${sw(PALETTE.amber)}tracer beads, started on one line`,
        model === 'nfw' || model === 'iso' ? `${sw(PALETTE.violet)}dark halo glow (schematic size)` : '',
        model === 'mond' ? `${sw(PALETTE.green, false)}ring where visible pull g_N = a₀` : '',
        `${sw(0xffffff, false)}probe radius r`,
      ].filter(Boolean).join('<br/>');
    } else {
      const after = bs.t - tPass;
      title.innerHTML = `<div style="color:#dfe6f3;font-weight:600">Bullet Cluster (schematic toy)</div>
<div>${after < 0 ? `${(-after).toFixed(0)} Myr before` : `${after.toFixed(0)} Myr after`} the cores pass</div>`;
      const bar = (f: number, col: string) => `<span style="display:inline-block;height:8px;width:${(f * 100).toFixed(1)}%;background:${col}"></span>`;
      legend.innerHTML = head('Two views of one collision') + [
        `${sw(PALETTE.rose)}hot gas, seen in X-rays`,
        `${sw(MASS_BLUE, false)}total mass, seen by lensing`,
        `${sw(0xfff1d6)}galaxies`,
      ].join('<br/>') + `<div style="margin-top:8px;color:#dfe6f3;font-weight:600">Cosmic budget today (Planck 2018)</div>
<div style="display:flex;border-radius:4px;overflow:hidden;margin:4px 0 2px">${bar(BUDGET.ordinary, css(PALETTE.amber))}${bar(BUDGET.dark, css(MASS_BLUE))}${bar(BUDGET.darkEnergy, '#3a4660')}</div>
<div>${sw(PALETTE.amber, false)}ordinary ${(BUDGET.ordinary * 100).toFixed(0)}% ${sw(MASS_BLUE, false)}dark matter ${(BUDGET.dark * 100).toFixed(0)}%</div>
<div>${sw(0x3a4660, false)}dark energy ${(BUDGET.darkEnergy * 100).toFixed(0)}%</div>`;
    }
  }

  // =====================================================================
  // Derived numbers, recomputed when parameters change
  let flat = 0;
  let slope40 = 0;
  let chi = 0;
  let v8 = 0;
  function recompute(): void {
    rebuildOmega();
    flat = flatness(p, model);
    slope40 = logSlope(40, p, model);
    chi = chi2(data, p, model);
    v8 = rotation(8.2, p, model, c).total;
    updateGalaxyDecor();
    drawPlot();
    paintOverlays();
  }

  function applyView(fly: boolean): void {
    gal.visible = view === 'galaxy';
    bul.visible = view === 'bullet';
    plot.style.display = view === 'galaxy' ? '' : 'none';
    if (fly) stage.flyTo(view === 'galaxy' ? GAL_CAM : BUL_CAM, view === 'galaxy' ? GAL_TGT : [0, 0, 0]);
    galSection.forEach((el) => (el.style.display = view === 'galaxy' ? '' : 'none'));
    bulSection.forEach((el) => (el.style.display = view === 'bullet' ? '' : 'none'));
    paintOverlays();
  }

  // =====================================================================
  // Frame loop
  let overlayTimer = 0;
  stage.onFrame((dt) => {
    if (!playing) return;
    if (view === 'galaxy') {
      const dM = dt * speed * GAL_RATE;
      tGal += dM;
      for (let i = 0; i < N_STARS; i++) starTh[i] += starOm[i] * dM;
      for (let k = 0; k < N_BEADS; k++) beadTh[k] += beadOm[k] * dM;
      drawGalaxy();
    } else if (!bulletDone) {
      const target = bs.t + dt * speed * BUL_RATE;
      while (bs.t < target) bulletStep(bs, H_BUL);
      if (bs.t - tPass >= BUL_END) bulletDone = true;
      drawBullet();
      overlayTimer += dt;
      if (overlayTimer > 0.2) {
        overlayTimer = 0;
        paintOverlays();
      }
    }
  });

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'galaxy', label: 'Spiral galaxy' }, { value: 'bullet', label: 'Bullet Cluster' }],
    onChange: (v) => { view = v; applyView(true); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, key: 'play', onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', onClick: () => { if (view === 'galaxy') resetArms(); else resetBullet(); paintOverlays(); } },
  ]);
  ui.slider({ key: 'speed', label: 'Time rate', min: 0.25, max: 3, step: 0.05, value: speed, format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { speed = v; paintOverlays(); } });

  const galSection: HTMLElement[] = [];
  const bulSection: HTMLElement[] = [];
  const mark = (arr: HTMLElement[]) => arr.push(panel.querySelector('.panel')!.lastElementChild as HTMLElement);

  ui.section('Gravity model');
  mark(galSection);
  ui.select<Model>({
    key: 'model', label: 'Model', value: model,
    options: [{ value: 'newton', label: 'Visible' }, { value: 'nfw', label: 'NFW halo' }, { value: 'iso', label: 'Cored halo' }, { value: 'mond', label: 'MOND' }],
    onChange: (v) => { model = v; touched = true; recompute(); },
  });
  ui.toggle({ key: 'glow', label: 'Show halo glow', value: showGlow, onChange: (v) => { showGlow = v; updateGalaxyDecor(); } });

  ui.section('Mass');
  mark(galSection);
  ui.slider({ key: 'mdisk', label: 'Disk mass (stars + gas)', min: 1, max: 15, step: 0.5, value: p.Md / 1e10, format: (v) => `${v.toFixed(1)}×10¹⁰`, unit: 'M☉', onInput: (v) => { p.Md = v * 1e10; touched = true; recompute(); } });
  ui.slider({ key: 'mhalo', label: 'Halo mass M₂₀₀', min: 11, max: 12.8, step: 0.02, value: Math.log10(p.M200), format: (v) => fmtMass(10 ** v), unit: 'M☉', onInput: (v) => { p.M200 = 10 ** v; touched = true; recompute(); } });
  ui.slider({ key: 'rs', label: 'Halo scale radius r_s (core r_c)', min: 2, max: 60, step: 1, value: p.rs, unit: 'kpc', onInput: (v) => { p.rs = v; touched = true; recompute(); } });
  ui.note('Fixed: bulge 1.0×10¹⁰ M☉ (Hernquist, a = 0.6 kpc) and disk scale length 2.6 kpc. The disk uses Freeman’s exact thin-disk formula. The halo mass does nothing in the Visible and MOND models.');

  ui.section('Probe');
  mark(galSection);
  ui.slider({ key: 'r', label: 'Probe radius r', min: 1, max: 40, step: 0.1, value: probeR, unit: 'kpc', onInput: (v) => { probeR = v; updateGalaxyDecor(); drawPlot(); } });
  const rV = ui.readout('v', 'v(r)', 'km/s');
  const rMenc = ui.readout('menc', 'M(<r), total');
  const rDark = ui.readout('dark', 'dark share of M(<r)');
  const rVis = ui.readout('vvis', 'visible-only v(r)', 'km/s');

  ui.section('Curve checks');
  mark(galSection);
  const rV8 = ui.readout('v8', 'v at 8.2 kpc (Sun)', 'km/s');
  const rFlat = ui.readout('flat', 'flatness 8 to 35 kpc');
  const rSlope = ui.readout('slope', 'slope dln v/dln r at 40 kpc');
  const rChi = ui.readout('chi2', 'χ²/N vs points');
  const rDeep = ui.readout('deep', 'v⁴/(G M a₀) at 150 kpc');
  const rT = ui.readout('tgal', 'elapsed', 'Myr');
  ui.note('χ² uses the illustrative points, which were generated from a halo model. In MOND the last check tends to 1 far out. With the simple μ it approaches slowly, as about 1 + √(g_N/a₀).');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'total (halo)' },
    { color: css(PALETTE.green), label: 'MOND' },
    { color: css(PALETTE.amber), label: 'visible only' },
    { color: css(PALETTE.violet), label: 'dark halo' },
  ]);

  ui.section('Collision readouts');
  mark(bulSection);
  const rBT = ui.readout('bt', 'time after core passage', 'Myr');
  const rBOff = ui.readout('boff', 'bullet: gas behind mass', 'kpc');
  const rMOff = ui.readout('moff', 'main: gas behind mass', 'kpc');
  const rBV = ui.readout('bv', 'bullet mass speed', 'km/s');
  ui.note('Dark matter and galaxies pass through each other. The gas clouds collide, feel a drag and fall behind. Lensing contours show all the mass, with gas at 15%.');
  ui.legend([
    { color: css(PALETTE.rose), label: 'X-ray gas' },
    { color: css(MASS_BLUE), label: 'lensing mass' },
  ]);

  let readTimer = 1;
  stage.onFrame((dt) => {
    readTimer += dt;
    if (readTimer < 0.15) return;
    readTimer = 0;
    if (view === 'galaxy') {
      rotation(probeR, p, model, c);
      rV(c.total.toFixed(1));
      rVis(c.visible.toFixed(1));
      const mb = baryonEnclosed(probeR, p);
      const mh = haloEnclosed(probeR, p, model);
      // Dynamical mass from the headline equation: M = v^2 r / G.
      const mdyn = (c.total * c.total * probeR) / G;
      rMenc(`${fmtMass(mdyn)} M☉`);
      const gN = (c.visible * c.visible) / probeR;
      if (model === 'newton') rDark('none (no halo)');
      else if (model === 'mond') rDark(`none, pull ×${(mondAccel(gN) / gN).toFixed(2)}`);
      else rDark(`${((mh / (mb + mh)) * 100).toFixed(0)}%`);
      rV8(v8.toFixed(1));
      rFlat(`${(flat * 100).toFixed(1)}%`);
      rSlope(slope40.toFixed(3));
      rChi(chi.toFixed(2));
      if (model === 'mond') {
        const r = 150;
        const v = rotation(r, p, model, c).total;
        rDeep((v ** 4 / (G * baryonEnclosed(r, p) * A0)).toFixed(3));
      } else rDeep('MOND only');
      rT(tGal.toFixed(0));
    } else {
      const after = bs.t - tPass;
      rBT(after.toFixed(0));
      rBOff((bs.X[1] - bs.x[1]).toFixed(0));
      rMOff((bs.x[0] - bs.X[0]).toFixed(0));
      rBV((bs.V[1] * KPC_PER_KMS_MYR).toFixed(0));
    }
  });

  rebuildOmega();
  resetArms();
  resetBullet();
  recompute();
  applyView(false);
  touched = false;

  return {
    state: () => ({
      view,
      model,
      touched,
      glow: showGlow,
      Md: p.Md,
      M200: p.M200,
      rs: p.rs,
      r: probeR,
      v: rotation(probeR, p, model, c).total,
      v8,
      flat,
      slope40,
      chi2: chi,
      tGal,
      bulletT: bs.t - tPass,
      bulletOffset: bs.X[1] - bs.x[1],
      bulletDone,
      playing,
    }),
    dispose: () => {
      plot.remove();
      title.remove();
      legend.remove();
      starTex.dispose();
      haloTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'dark-matter',
  number: 60,
  title: 'Dark Matter',
  domain: 'astro',
  level: 2,
  status: 'live',
  tagline: 'Galaxies spin too fast for the matter we can see.',
  content,
  mount,
};

export default topic;
