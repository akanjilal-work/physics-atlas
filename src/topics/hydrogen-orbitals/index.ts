import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type SliderSpec } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  N_MAX, airWavelengthNm, angularNodes, degeneracy, energyEv, lineName, meanRadius, mulberry32, orbitalName,
  prettyName, psiAt, radial, radialNodes, radiusQuantile, sampleOrbital, seriesName, transitionWavelengthNm,
  wavelengthToRGB, type Basis, type OrbitalSpec,
} from './physics.ts';

const MAXN = 60000;
const SCENE_R = 3.3; // scene radius that holds 99% of the largest orbital of a level
const MORPH_S = 1.0;
const ISO_RES = 56;
const PH_PTS = 240;
const PHOTON_S = 3.2;

const CAM: [number, number, number] = [4.4, 3.1, 9.2];
const CAM_CUT: [number, number, number] = [0.6, 1.0, 10.6];

/** HSV (s = 0.8) to RGB straight into a Float32Array. */
function hueInto(h: number, v: number, out: Float32Array, o: number): void {
  const s = 0.8;
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

/** Radius holding 99% of the s orbital of level n: the display scale for that level. */
const extent = (n: number): number => radiusQuantile(n, 0, 0.99);

function tickStep(L: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50]) if (L / s <= 4.2) return s;
  return 100;
}

const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

function photonCss(nm: number): string {
  const c = wavelengthToRGB(nm);
  if (c) return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  return nm < 380 ? '#9d8cf8' : '#c0605a';
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: [0, 0, 0], fov: 40 });
  const { scene, renderer, camera, controls } = stage;
  renderer.localClippingEnabled = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.7;

  // --- State
  let n = 3;
  let l = 2;
  let m = 0;
  let basis: Basis = 'real';
  let N = 40000;
  let showIso = false;
  let cutaway = false;
  let autoRotate = true;
  let reduced = true;
  let tUpper = 2;
  let tLower = 1;
  let photonNm = 0;
  let photonUpper = 0;
  let photonLower = 0;
  let photonCount = 0;
  const spec = (): OrbitalSpec => ({ n, l, m, basis });

  // --- World group: everything inside is in units of a0
  const world = new THREE.Group();
  scene.add(world);

  // Nucleus
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  scene.add(nucleus);

  // --- Axes with ticks in a0
  const AX_VERTS = 6 + 3 * 2 * 6 * 2;
  const axPos = new Float32Array(AX_VERTS * 3);
  const axGeo = new THREE.BufferGeometry();
  axGeo.setAttribute('position', new THREE.BufferAttribute(axPos, 3));
  const axes = new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: 0x3a4866, transparent: true, opacity: 0.7 }));
  axes.frustumCulled = false;
  world.add(axes);
  const tickLabels = Array.from({ length: 5 }, () => stage.label('', [0, 0, 0], 'muted', world));
  const axisNames = [
    stage.label('x', [0, 0, 0], 'muted', world),
    stage.label('z', [0, 0, 0], 'muted', world),
    stage.label('y', [0, 0, 0], 'muted', world),
  ];

  function buildAxes(): void {
    const L = extent(n) * 1.08;
    const step = tickStep(L);
    const tl = L * 0.025;
    let k = 0;
    const put = (x: number, y: number, z: number) => {
      axPos[k++] = x;
      axPos[k++] = y;
      axPos[k++] = z;
    };
    put(-L, 0, 0); put(L, 0, 0);
    put(0, -L, 0); put(0, L, 0);
    put(0, 0, -L); put(0, 0, L);
    for (let t = step; t <= L * 0.999 && k < AX_VERTS * 3 - 36; t += step) {
      for (const s of [-1, 1]) {
        put(s * t, -tl, 0); put(s * t, tl, 0);
        put(-tl, s * t, 0); put(tl, s * t, 0);
        put(0, -tl, s * t); put(0, tl, s * t);
      }
    }
    axGeo.setDrawRange(0, k / 3);
    axGeo.attributes.position.needsUpdate = true;
    tickLabels.forEach((lab, i) => {
      const v = (i + 1) * step;
      lab.visible = v <= L * 0.999;
      lab.position.set(v, -tl * 4, 0);
      lab.element.textContent = i === 0 || v + step > L ? `${v} a₀` : String(v);
    });
    axisNames[0].position.set(L * 1.06, 0, 0);
    axisNames[1].position.set(0, L * 1.06, 0);
    axisNames[2].position.set(0, 0, -L * 1.06);
  }

  // --- Point cloud
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  const dctx = dot.getContext('2d')!;
  const grad = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, 64, 64);
  const dotTex = new THREE.CanvasTexture(dot);
  dotTex.colorSpace = THREE.SRGBColorSpace;

  const posCur = new Float32Array(MAXN * 3);
  const colCur = new Float32Array(MAXN * 3);
  const posFrom = new Float32Array(MAXN * 3);
  const colFrom = new Float32Array(MAXN * 3);
  const posTo = new Float32Array(MAXN * 3);
  const colTo = new Float32Array(MAXN * 3);
  const sPos = new Float32Array(MAXN * 3);
  const sPh = new Float32Array(MAXN);
  const baseU = new Float32Array(MAXN * 3);
  const seedRng = mulberry32(20260923);
  for (let i = 0; i < baseU.length; i++) baseU[i] = seedRng();

  const ptGeo = new THREE.BufferGeometry();
  const ptPosAttr = new THREE.BufferAttribute(posCur, 3).setUsage(THREE.DynamicDrawUsage);
  const ptColAttr = new THREE.BufferAttribute(colCur, 3).setUsage(THREE.DynamicDrawUsage);
  ptGeo.setAttribute('position', ptPosAttr);
  ptGeo.setAttribute('color', ptColAttr);
  ptGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const ptMat = new THREE.PointsMaterial({
    size: 0.06, map: dotTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.6,
  });
  const cloud = new THREE.Points(ptGeo, ptMat);
  cloud.frustumCulled = false;
  world.add(cloud);

  const cPos = new THREE.Color(PALETTE.cyan);
  const cNeg = new THREE.Color(PALETTE.rose);

  // --- Isosurface
  const isoMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.88,
  });
  const iso = new MarchingCubes(ISO_RES, isoMat, false, true, 90000);
  iso.visible = false;
  world.add(iso);
  const isoSort = new Float32Array(ISO_RES ** 3);
  const psiTmp = new Float64Array(2);
  let isoDirty = true;

  function buildIso(): void {
    const L = extent(n) * 1.12;
    iso.scale.setScalar(L);
    const o = spec();
    const size = ISO_RES;
    const h = size / 2;
    const field = iso.field as Float32Array;
    const pal = iso.palette as Float32Array;
    let total = 0;
    for (let z = 0; z < size; z++) {
      const Z = ((z - h) / h) * L;
      for (let y = 0; y < size; y++) {
        const Y = ((y - h) / h) * L;
        for (let x = 0; x < size; x++) {
          const X = ((x - h) / h) * L;
          // scene (X, Y, Z) is physics (X, -Z, Y)
          psiAt(o, X, -Z, Y, psiTmp);
          const d = psiTmp[0] * psiTmp[0] + psiTmp[1] * psiTmp[1];
          const q = x + size * y + size * size * z;
          field[q] = d;
          isoSort[q] = d;
          total += d;
          if (basis === 'real') {
            const c = psiTmp[0] >= 0 ? cPos : cNeg;
            pal[q * 3] = c.r;
            pal[q * 3 + 1] = c.g;
            pal[q * 3 + 2] = c.b;
          } else {
            hueInto(Math.atan2(psiTmp[1], psiTmp[0]) / (2 * Math.PI) + 1, 0.9, pal, q * 3);
          }
        }
      }
    }
    // Threshold that encloses 90% of the probability on the grid.
    isoSort.sort();
    let acc = 0;
    let thr = 0;
    for (let i = isoSort.length - 1; i >= 0; i--) {
      acc += isoSort[i];
      if (acc >= 0.9 * total) {
        thr = isoSort[i];
        break;
      }
    }
    // Normalise so the addon's normal estimate works on a sensible scale.
    const inv = thr > 0 ? 1 / thr : 1;
    for (let i = 0; i < field.length; i++) field[i] *= inv;
    iso.isolation = 1;
    iso.update();
    isoDirty = false;
  }

  // --- Clipping for the cutaway: a thin slab for the cloud, a half space for the surface
  const slabW = SCENE_R * 0.075;
  const slab = [new THREE.Plane(new THREE.Vector3(0, 0, -1), slabW), new THREE.Plane(new THREE.Vector3(0, 0, 1), slabW)];
  const half = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];

  // --- Photon
  const phPos = new Float32Array(PH_PTS * 3);
  const phGeo = new THREE.BufferGeometry();
  const phAttr = new THREE.BufferAttribute(phPos, 3).setUsage(THREE.DynamicDrawUsage);
  phGeo.setAttribute('position', phAttr);
  const phMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const photon = new THREE.Line(phGeo, phMat);
  photon.frustumCulled = false;
  photon.visible = false;
  scene.add(photon);
  const phLabel = stage.label('', [0, 0, 0], 'big');
  phLabel.visible = false;
  const phDir = new THREE.Vector3();
  const phPerp = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  let phT = -1;
  let phLambdaVis = 0.3;

  function emit(nu: number, nl: number): void {
    tUpper = nu;
    tLower = nl;
    transSel.value = `${nu}-${nl}`;
    const nm = transitionWavelengthNm(nu, nl, reduced);
    photonNm = nm;
    photonUpper = nu;
    photonLower = nl;
    photonCount++;
    // Direction: toward the upper right of the current view.
    camera.updateMatrixWorld();
    tmpV.setFromMatrixColumn(camera.matrixWorld, 0);
    phDir.copy(tmpV);
    tmpV.setFromMatrixColumn(camera.matrixWorld, 1);
    phDir.addScaledVector(tmpV, 0.12).normalize();
    tmpV.setFromMatrixColumn(camera.matrixWorld, 2);
    phPerp.crossVectors(phDir, tmpV).normalize();
    const col = wavelengthToRGB(nm);
    if (col) phMat.color.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
    else phMat.color.set(nm < 380 ? 0x9d8cf8 : 0xc0605a);
    phLambdaVis = 0.3 * Math.pow(nm / 656, 0.55);
    const band = nm < 380 ? 'ultraviolet' : nm > 750 ? 'infrared' : 'visible';
    phLabel.element.innerHTML = `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${photonCss(nm)}"></span>${lineName(nu, nl)}  ${nm.toFixed(1)} nm, ${band}`;
    phT = 0;
    photon.visible = true;
    phLabel.visible = true;
    drawLadder();
    updateReadouts();
  }

  function updatePhoton(dt: number): void {
    phT += dt;
    if (phT > PHOTON_S) {
      phT = -1;
      photon.visible = false;
      phLabel.visible = false;
      return;
    }
    const head = 0.15 + phT * 1.5;
    const len = 2.4;
    const k = (2 * Math.PI) / phLambdaVis;
    for (let i = 0; i < PH_PTS; i++) {
      const f = i / (PH_PTS - 1);
      const s = Math.max(0.12, head - len + f * len);
      const env = Math.sin(Math.PI * f) * 0.16;
      const w = env * Math.sin(k * s - phT * 18);
      phPos[i * 3] = phDir.x * s + phPerp.x * w;
      phPos[i * 3 + 1] = phDir.y * s + phPerp.y * w;
      phPos[i * 3 + 2] = phDir.z * s + phPerp.z * w;
    }
    phAttr.needsUpdate = true;
    phMat.opacity = Math.min(1, (PHOTON_S - phT) / 0.8);
    phLabel.position.set(phDir.x * (head + 0.25), phDir.y * (head + 0.25) + 0.25, phDir.z * (head + 0.25));
  }

  // --- Legend overlay (top left)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '215px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  function drawLegend(): void {
    const name = prettyName(orbitalName(n, l, m, basis));
    const colours = basis === 'real'
      ? `<div><span style="color:${css(PALETTE.cyan)}">● ψ &gt; 0</span> &nbsp; <span style="color:${css(PALETTE.rose)}">● ψ &lt; 0</span></div>
<div>Dark gaps between colours are nodes, where ψ = 0.</div>`
      : `<div>Colour = phase of ψ, winding m times around z.</div>
<div style="height:6px;border-radius:3px;margin:4px 0;background:linear-gradient(90deg,hsl(0,80%,58%),hsl(60,80%,58%),hsl(120,80%,58%),hsl(180,80%,58%),hsl(240,80%,58%),hsl(300,80%,58%),hsl(360,80%,58%))"></div>`;
    legend.innerHTML = `<div style="color:#dfe6f3;font:600 17px/1.2 'Space Grotesk',sans-serif;margin-bottom:4px">${name}</div>
<div>Each dot is one place a measurement could find the electron. Dense means likely.</div>${colours}
<div style="margin-top:3px;color:#8391ab">${cutaway ? 'Cutaway: a thin slice through the nucleus.' : 'Ticks in Bohr radii a₀.'}</div>`;
  }

  // --- Radial probability inset (top right)
  const rad = document.createElement('canvas');
  rad.width = 500;
  rad.height = 260;
  Object.assign(rad.style, {
    position: 'absolute', right: '10px', top: '10px', width: '250px', height: '130px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(rad);
  const rctx = rad.getContext('2d')!;
  const RS = 320;
  const rVals = new Float64Array(RS + 1);

  function drawRadial(): void {
    const W = rad.width, H = rad.height;
    const x0 = 16, x1 = W - 16, y0 = 46, y1 = H - 40;
    const rMax = extent(n) * 1.08;
    rctx.clearRect(0, 0, W, H);
    let pMax = 0;
    for (let i = 0; i <= RS; i++) {
      const r = (i / RS) * rMax;
      const R = radial(n, l, r);
      rVals[i] = r * r * R * R;
      if (rVals[i] > pMax) pMax = rVals[i];
    }
    const X = (r: number) => x0 + (r / rMax) * (x1 - x0);
    const Y = (p: number) => y1 - (p / pMax) * (y1 - y0);
    // axis and ticks
    rctx.strokeStyle = '#2c3852';
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.moveTo(x0, y1);
    rctx.lineTo(x1, y1);
    rctx.stroke();
    rctx.font = '19px JetBrains Mono, monospace';
    rctx.fillStyle = '#56627c';
    const step = tickStep(rMax);
    for (let t = 0; t <= rMax; t += step) {
      rctx.fillRect(X(t) - 1, y1, 2, 7);
      if (X(t) < x1 - 90) rctx.fillText(String(t), X(t) - 5, y1 + 28);
    }
    rctx.fillText('r / a₀', x1 - 70, y1 + 28);
    // curve
    rctx.beginPath();
    rctx.moveTo(X(0), Y(0));
    for (let i = 0; i <= RS; i++) rctx.lineTo(X((i / RS) * rMax), Y(rVals[i]));
    rctx.lineTo(X(rMax), y1);
    rctx.closePath();
    rctx.fillStyle = 'rgba(79,209,232,0.18)';
    rctx.fill();
    rctx.beginPath();
    for (let i = 0; i <= RS; i++) {
      const px = X((i / RS) * rMax), py = Y(rVals[i]);
      if (i === 0) rctx.moveTo(px, py);
      else rctx.lineTo(px, py);
    }
    rctx.strokeStyle = css(PALETTE.cyan);
    rctx.lineWidth = 3;
    rctx.stroke();
    // radial nodes
    rctx.fillStyle = css(PALETTE.rose);
    let prev = radial(n, l, 1e-6);
    for (let i = 1; i <= RS; i++) {
      const v = radial(n, l, (i / RS) * rMax);
      if (Math.sign(v) !== Math.sign(prev) && v !== 0) {
        rctx.beginPath();
        rctx.arc(X(((i - 0.5) / RS) * rMax), y1, 6, 0, Math.PI * 2);
        rctx.fill();
      }
      prev = v;
    }
    // markers
    const vline = (r: number, color: string, text: string, dash: boolean, left: boolean) => {
      rctx.save();
      rctx.strokeStyle = color;
      rctx.lineWidth = 2.5;
      if (dash) rctx.setLineDash([8, 6]);
      rctx.beginPath();
      rctx.moveTo(X(r), y0 - 6);
      rctx.lineTo(X(r), y1);
      rctx.stroke();
      rctx.restore();
      rctx.fillStyle = color;
      rctx.font = '600 19px JetBrains Mono, monospace';
      const tw = rctx.measureText(text).width;
      const tx = left || X(r) + 6 + tw > x1 ? X(r) - 6 - tw : X(r) + 6;
      rctx.fillText(text, Math.max(4, tx), y0 + 12);
    };
    vline(n * n, css(PALETTE.violet), `n²a₀`, true, true);
    vline(meanRadius(n, l), css(PALETTE.amber), `⟨r⟩ = ${meanRadius(n, l)}`, false, false);
    rctx.fillStyle = '#b8c3d9';
    rctx.font = '600 20px JetBrains Mono, monospace';
    rctx.fillText('P(r) = r²R²', 16, 28);
    rctx.fillStyle = '#8391ab';
    rctx.font = '18px JetBrains Mono, monospace';
    rctx.fillText('radial probability', W - 204, 28);
  }

  // --- Energy ladder (bottom right), clickable
  const lad = document.createElement('canvas');
  lad.width = 500;
  lad.height = 380;
  Object.assign(lad.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '250px', height: '190px', cursor: 'pointer',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2',
  } as CSSStyleDeclaration);
  lad.setAttribute('role', 'img');
  lad.setAttribute('aria-label', 'Hydrogen energy levels. Click an arrow to emit that photon.');
  viewport.appendChild(lad);
  const lctx = lad.getContext('2d')!;
  const LT = 62, LB = 22, LL = 116, LR = 10;
  const levelY = (k: number) => lad.height - LB - (Math.log(k) / Math.log(N_MAX)) * (lad.height - LT - LB);
  const arrows: { nu: number; nl: number; x: number }[] = [];
  {
    let x = LL + 16;
    for (let nl = 1; nl < N_MAX; nl++) {
      for (let nu = nl + 1; nu <= N_MAX; nu++) {
        arrows.push({ nu, nl, x });
        x += 20;
      }
      x += 13;
    }
  }

  function drawLadder(): void {
    const W = lad.width, H = lad.height;
    lctx.clearRect(0, 0, W, H);
    lctx.font = '600 20px JetBrains Mono, monospace';
    lctx.fillStyle = '#b8c3d9';
    lctx.fillText('Energy levels', 14, 28);
    lctx.font = '17px JetBrains Mono, monospace';
    lctx.fillStyle = '#8391ab';
    const hint = 'log scale, click an arrow';
    lctx.fillText(hint, W - 12 - lctx.measureText(hint).width, 28);
    for (let k = 1; k <= N_MAX; k++) {
      const y = levelY(k);
      const cur = k === n;
      lctx.strokeStyle = cur ? css(PALETTE.cyan) : '#3a4866';
      lctx.lineWidth = cur ? 3 : 2;
      lctx.beginPath();
      lctx.moveTo(LL, y);
      lctx.lineTo(W - LR, y);
      lctx.stroke();
      lctx.fillStyle = cur ? css(PALETTE.cyan) : '#8391ab';
      lctx.font = `${cur ? '600 ' : ''}17px JetBrains Mono, monospace`;
      lctx.fillText(`n=${k}`, 12, y + 6);
      lctx.fillText(energyEv(k).toFixed(k === 1 ? 1 : 2).replace('-', '−'), 58, y + 6);
    }
    // series labels
    lctx.font = '16px JetBrains Mono, monospace';
    lctx.fillStyle = '#75819a';
    for (let nl = 1; nl < N_MAX; nl++) {
      const group = arrows.filter((a) => a.nl === nl);
      const cx = (group[0].x + group[group.length - 1].x) / 2;
      const s = seriesName(nl).slice(0, 2);
      lctx.fillText(s, cx - lctx.measureText(s).width / 2, LT - 14);
    }
    for (const a of arrows) {
      const ya = levelY(a.nu), yb = levelY(a.nl);
      const nm = transitionWavelengthNm(a.nu, a.nl, reduced);
      const sel = a.nu === tUpper && a.nl === tLower;
      const col = photonCss(nm);
      lctx.strokeStyle = col;
      lctx.fillStyle = col;
      lctx.globalAlpha = sel ? 1 : wavelengthToRGB(nm) ? 0.85 : 0.45;
      lctx.lineWidth = sel ? 5 : 2.5;
      lctx.beginPath();
      lctx.moveTo(a.x, ya);
      lctx.lineTo(a.x, yb - 9);
      lctx.stroke();
      lctx.beginPath();
      lctx.moveTo(a.x - (sel ? 7 : 5), yb - 11);
      lctx.lineTo(a.x + (sel ? 7 : 5), yb - 11);
      lctx.lineTo(a.x, yb - 1);
      lctx.closePath();
      lctx.fill();
    }
    lctx.globalAlpha = 1;
  }

  const onLadderClick = (e: PointerEvent) => {
    const r = lad.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * lad.width;
    const py = ((e.clientY - r.top) / r.height) * lad.height;
    let best: (typeof arrows)[number] | null = null;
    let bd = 12;
    for (const a of arrows) {
      const d = Math.abs(px - a.x);
      if (d < bd && py >= levelY(a.nu) - 12 && py <= levelY(a.nl) + 12) {
        bd = d;
        best = a;
      }
    }
    if (best) emit(best.nu, best.nl);
  };
  lad.addEventListener('pointerdown', onLadderClick);

  // --- Orbital changes
  let morphU = 1;
  let scaleFrom = SCENE_R / extent(n);
  let scaleTo = scaleFrom;
  let lastN = -1;

  function colourOf(i: number, out: Float32Array): void {
    const o = i * 3;
    if (basis === 'real') {
      const c = sPh[i] === 0 ? cPos : cNeg;
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
    } else {
      hueInto(sPh[i] / (2 * Math.PI) + 1, 0.95, out, o);
    }
  }

  function applyOpacity(): void {
    const dens = Math.sqrt(40000 / N);
    const base = showIso ? 0.28 : 0.62;
    ptMat.opacity = Math.min(1, base * dens * (cutaway ? 2.2 : 1));
    ptMat.size = cutaway ? 0.075 : 0.06;
  }

  function applyOrbital(morph: boolean): void {
    sampleOrbital(spec(), N, Math.random, sPos, sPh, baseU);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      // physics (x, y, z) -> scene (x, z, -y)
      posTo[o] = sPos[o];
      posTo[o + 1] = sPos[o + 2];
      posTo[o + 2] = -sPos[o + 1];
      colourOf(i, colTo);
    }
    ptGeo.setDrawRange(0, N);
    scaleFrom = world.scale.x;
    scaleTo = SCENE_R / extent(n);
    if (morph) {
      posFrom.set(posCur.subarray(0, N * 3));
      colFrom.set(colCur.subarray(0, N * 3));
      morphU = 0;
    } else {
      posCur.set(posTo.subarray(0, N * 3));
      colCur.set(colTo.subarray(0, N * 3));
      ptPosAttr.needsUpdate = true;
      ptColAttr.needsUpdate = true;
      world.scale.setScalar(scaleTo);
      morphU = 1;
    }
    if (n !== lastN) {
      buildAxes();
      lastN = n;
    }
    isoDirty = true;
    if (showIso && !morph) buildIso();
    iso.visible = showIso && !isoDirty;
    drawRadial();
    drawLadder();
    drawLegend();
    updateReadouts();
  }

  function stepMorph(dt: number): void {
    morphU = Math.min(1, morphU + dt / MORPH_S);
    const e = ease(morphU);
    const len = N * 3;
    for (let i = 0; i < len; i++) {
      posCur[i] = posFrom[i] + (posTo[i] - posFrom[i]) * e;
      colCur[i] = colFrom[i] + (colTo[i] - colFrom[i]) * e;
    }
    ptPosAttr.needsUpdate = true;
    ptColAttr.needsUpdate = true;
    world.scale.setScalar(scaleFrom + (scaleTo - scaleFrom) * e);
    if (morphU >= 1 && showIso && isoDirty) {
      buildIso();
      iso.visible = true;
    }
  }

  function applyClip(): void {
    ptMat.clippingPlanes = cutaway ? slab : [];
    isoMat.clippingPlanes = cutaway ? half : [];
    ptMat.needsUpdate = true;
    isoMat.needsUpdate = true;
    applyOpacity();
    drawLegend();
  }

  stage.onFrame((dt) => {
    if (morphU < 1) stepMorph(dt);
    if (phT >= 0) updatePhoton(dt);
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Orbital');
  const nSpec: SliderSpec = {
    key: 'n', label: 'Principal n', min: 1, max: N_MAX, step: 1, value: n,
    onInput: (v) => { n = v; clampLM(); applyOrbital(true); },
  };
  ui.slider(nSpec);
  const lSpec: SliderSpec = {
    key: 'l', label: 'Angular ℓ', min: 0, max: n - 1, step: 1, value: l,
    format: (v) => `${v} (${'spdfgh'[v]})`,
    onInput: (v) => { l = v; clampLM(); applyOrbital(true); },
  };
  const lCtl = ui.slider(lSpec);
  const mSpec: SliderSpec = {
    key: 'm', label: 'Magnetic m', min: -l, max: l, step: 1, value: m,
    format: (v) => {
      const name = orbitalName(n, l, v, basis);
      const tail = basis === 'real' && l > 0 && name.includes('_') ? `  ${prettyName(name).split(' ')[1]}` : '';
      return `${v > 0 ? '+' : ''}${v}${tail}`;
    },
    onInput: (v) => { m = v; applyOrbital(true); },
  };
  const mCtl = ui.slider(mSpec);
  const lInput = lCtl.el.querySelector('input')!;
  const mInput = mCtl.el.querySelector('input')!;

  function clampLM(): void {
    l = Math.min(l, n - 1);
    m = Math.max(-l, Math.min(l, m));
    lSpec.max = Math.max(n - 1, 1e-9);
    lInput.max = String(n - 1);
    lInput.disabled = n === 1;
    lCtl.set(l, false);
    mSpec.min = -l;
    mSpec.max = l === 0 ? 1e-9 : l;
    mInput.min = String(-l);
    mInput.max = String(l);
    mInput.disabled = l === 0;
    mCtl.set(m, false);
  }

  ui.select<Basis>({
    key: 'basis', label: 'Basis', value: basis,
    options: [{ value: 'real', label: 'Real (chemistry)' }, { value: 'complex', label: 'Complex (definite m)' }],
    onChange: (v) => { basis = v; mCtl.set(m, false); applyOrbital(true); },
  });
  ui.slider({
    key: 'points', label: 'Points', min: 10000, max: MAXN, step: 5000, value: N,
    format: (v) => `${Math.round(v / 1000)}k`,
    onInput: (v) => { N = v; applyOpacity(); applyOrbital(false); },
  });

  ui.section('View');
  ui.toggle({
    key: 'iso', label: 'Isosurface (90% of probability)', value: showIso,
    onChange: (v) => {
      showIso = v;
      if (v && isoDirty && morphU >= 1) buildIso();
      iso.visible = v && !isoDirty;
      applyOpacity();
    },
  });
  ui.toggle({
    key: 'cutaway', label: 'Cutaway (slice through the nucleus)', value: cutaway,
    onChange: (v) => {
      cutaway = v;
      applyClip();
      stage.flyTo(v ? CAM_CUT : CAM, [0, 0, 0]);
      if (v) { autoRotate = false; rotCtl.set(false, false); controls.autoRotate = false; }
    },
  });
  const rotCtl = ui.toggle({ key: 'rotate', label: 'Auto-rotate', value: autoRotate, onChange: (v) => { autoRotate = v; controls.autoRotate = v; } });

  ui.section('Light from hydrogen');
  const transRow = ui.note('');
  transRow.className = 'ctl';
  transRow.dataset.param = 'transition';
  const transTop = document.createElement('div');
  transTop.className = 'ctl-top';
  transTop.innerHTML = '<label for="hy-transition">Transition n<sub>upper</sub> → n<sub>lower</sub></label>';
  const transSel = document.createElement('select');
  transSel.id = 'hy-transition';
  Object.assign(transSel.style, {
    width: '100%', marginTop: '6px', padding: '7px 8px', borderRadius: '8px', border: '1px solid var(--line)',
    background: 'var(--surface-2)', color: 'var(--text)', font: '13px var(--mono)',
  } as CSSStyleDeclaration);
  for (let nl = 1; nl < N_MAX; nl++) {
    const grp = document.createElement('optgroup');
    grp.label = `${seriesName(nl)} (to n = ${nl})`;
    for (let nu = nl + 1; nu <= N_MAX; nu++) {
      const op = document.createElement('option');
      op.value = `${nu}-${nl}`;
      op.textContent = `${nu} → ${nl}   ${lineName(nu, nl)}   ${transitionWavelengthNm(nu, nl).toFixed(1)} nm`;
      grp.appendChild(op);
    }
    transSel.appendChild(grp);
  }
  transSel.value = `${tUpper}-${tLower}`;
  transSel.addEventListener('change', () => {
    const [a, b] = transSel.value.split('-').map(Number);
    tUpper = a;
    tLower = b;
    drawLadder();
  });
  transRow.append(transTop, transSel);
  ui.buttons([{ label: 'Emit photon', primary: true, key: 'photon', onClick: () => emit(tUpper, tLower) }]);
  ui.toggle({ key: 'reduced', label: 'Reduced-mass correction', value: reduced, onChange: (v) => { reduced = v; drawLadder(); } });
  ui.note('Wavelengths are in vacuum. Tables of visible lines quote air values, about 0.03% shorter: Hα is 656.47 nm in vacuum and 656.28 nm in air.');

  ui.section('Readouts');
  const rName = ui.readout('name', 'orbital');
  const rE = ui.readout('energy', 'energy Eₙ');
  const rRn = ui.readout('rnodes', 'radial nodes n−ℓ−1');
  const rAn = ui.readout('anodes', 'angular nodes ℓ');
  const rMean = ui.readout('rmean', '⟨r⟩', 'a₀');
  const rDeg = ui.readout('degen', 'degeneracy n²');
  const rPh = ui.readout('photonNm', 'last photon');
  ui.legend([
    { color: css(PALETTE.cyan), label: 'ψ > 0' },
    { color: css(PALETTE.rose), label: 'ψ < 0' },
    { color: css(PALETTE.amber), label: '⟨r⟩ and nucleus' },
    { color: css(PALETTE.violet), label: 'Bohr radius n²a₀' },
  ]);

  function updateReadouts(): void {
    rName(prettyName(orbitalName(n, l, m, basis)));
    rE(`${energyEv(n).toFixed(3)} eV`);
    rRn(radialNodes(n, l));
    rAn(angularNodes(l));
    rMean(meanRadius(n, l));
    rDeg(`${degeneracy(n)} (${2 * degeneracy(n)} with spin)`);
    rPh(photonNm ? `${photonNm.toFixed(2)} nm ${lineName(photonUpper, photonLower)}${photonNm > 200 && photonNm < 2000 ? ` (air ${airWavelengthNm(photonNm).toFixed(2)})` : ''}` : 'none yet');
  }

  clampLM();
  applyOpacity();
  applyOrbital(false);

  return {
    state: () => ({
      n, l, m, basis,
      name: orbitalName(n, l, m, basis),
      energy: energyEv(n),
      radialNodes: radialNodes(n, l),
      angularNodes: angularNodes(l),
      rMean: meanRadius(n, l),
      degeneracy: degeneracy(n),
      points: N,
      isosurface: showIso,
      cutaway,
      autoRotate,
      reducedMass: reduced,
      transition: `${tUpper}-${tLower}`,
      photonNm,
      photonUpper,
      photonLower,
      photonCount,
    }),
    dispose: () => {
      lad.removeEventListener('pointerdown', onLadderClick);
      legend.remove();
      rad.remove();
      lad.remove();
      dotTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'hydrogen-orbitals',
  number: 13,
  title: 'Hydrogen Orbitals',
  domain: 'quantum',
  level: 2,
  status: 'live',
  tagline: 'The electron is a standing wave, not a tiny planet.',
  content,
  mount,
};

export default topic;
