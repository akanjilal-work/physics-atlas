import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  PLANCK, T0, background, clFromDl, findPeaks, makeSkyWork, planckNu, shellAt, shellTable, synthesize,
  tempAtZ, toySpectrum, unitAlm, wienLambda, wienNu, TOY,
  type Background, type CMBParams, type ShellTable,
} from './physics.ts';

type View = 'sky' | 'shell' | 'spectrum';

const LMAX_SPEC = 2500;
const LMAX_SKY = 192;
const NTH = 192;
const NPH = 384;
const SKY_R = 3;
const T_SCALE = 300; // μK at the ends of the colour bar
const NS = 625; // ribbon samples
const SPEC_W = 12; // scene width of ℓ = 0..2500
const XS = SPEC_W / LMAX_SPEC;
const YS = 4 / 6000; // scene units per μK²
const YMAX = 16000;
const RIB_D = 0.28; // half-depth of the ribbon
const SHELL_S = 1 / 50; // scene units per Mpc
const SHELL_DUR = 15; // seconds for one launch
const U_FREEZE = 0.6; // animation fraction at the drag epoch
const A_END = 1 / 51; // end of the growth phase, z = 50

const CAM: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  sky: { pos: [0, 1.6, 9.2], target: [0, 0, 0] },
  shell: { pos: [5.4, 4.6, 7.6], target: [0, -0.2, 0] },
  spectrum: { pos: [0.3, 2.2, 12.2], target: [0, 0.15, 0] },
};

/** Diverging map in the style of Planck sky maps: deep blue, pale, deep red. */
const STOPS: [number, number, number, number][] = [
  [-1, 0x08, 0x1a, 0x5e],
  [-0.62, 0x1f, 0x5f, 0xc9],
  [-0.28, 0x86, 0xc3, 0xee],
  [0, 0xf6, 0xf0, 0xdc],
  [0.28, 0xff, 0xc1, 0x6a],
  [0.62, 0xe0, 0x44, 0x26],
  [1, 0x6e, 0x0b, 0x10],
];
const LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const v = (i / 255) * 2 - 1;
  let k = 0;
  while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
  const [a, b] = [STOPS[k], STOPS[k + 1]];
  const f = (v - a[0]) / (b[0] - a[0]);
  for (let c = 0; c < 3; c++) LUT[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
}
const lutIndex = (t: number) => Math.max(0, Math.min(255, Math.round(((t / T_SCALE + 1) / 2) * 255)));

function insetCanvas(w: number, h: number, pos: Partial<CSSStyleDeclaration>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  Object.assign(c.style, {
    position: 'absolute', width: `${w / 2}px`, height: `${h / 2}px`,
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
    ...pos,
  } as CSSStyleDeclaration);
  return c;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.sky.pos, target: CAM.sky.target, fov: 42, far: 800 });
  const { scene, camera, renderer } = stage;

  const p: CMBParams = { ...PLANCK };
  let bg: Background = background(p);
  const D = new Float64Array(LMAX_SPEC + 1);
  toySpectrum(p, LMAX_SPEC, bg, D);
  const bgFid = bg;
  const Dfid = toySpectrum(PLANCK, LMAX_SPEC, bgFid);
  let peaks = findPeaks(D, 100);
  let view: View = 'sky';
  let seed = 1;
  let inside = false;
  let spin = true;
  let picked = 0;

  // ================================================================ SKY
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);
  const skyWork = makeSkyWork(LMAX_SKY, NTH, NPH);
  const skyMap = new Float32Array(NTH * NPH);
  const skyCl = new Float64Array(LMAX_SKY + 1);
  let alm = unitAlm(seed, LMAX_SKY);
  const texData = new Uint8Array(NTH * NPH * 4);
  const skyTex = new THREE.DataTexture(texData, NPH, NTH, THREE.RGBAFormat);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.magFilter = THREE.LinearFilter;
  skyTex.minFilter = THREE.LinearFilter;
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.FrontSide, toneMapped: false });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 128, 64), skyMat);
  skyGroup.add(skyMesh);
  const you = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.green }));
  skyGroup.add(you);
  const youLabel = stage.label('you are here, at the centre', [0, -0.28, 0], 'muted', skyGroup);
  youLabel.visible = false;
  const skyLabel = stage.label('last-scattering surface, z ≈ 1090', [0, -SKY_R - 0.35, 0], '', skyGroup);
  let skyRms = 0;
  let skyDirty = true;
  let skyTimer = 0;

  function regenSky(): void {
    for (let l = 0; l <= LMAX_SKY; l++) skyCl[l] = clFromDl(D[l], l);
    synthesize(alm, skyCl, skyWork, skyMap);
    let s2 = 0;
    for (let i = 0; i < NTH; i++) {
      const src = i * NPH;
      const dst = (NTH - 1 - i) * NPH; // texture row 0 is the south pole
      for (let j = 0; j < NPH; j++) {
        const t = skyMap[src + j];
        s2 += t * t;
        const k = lutIndex(t) * 3;
        const o = (dst + j) * 4;
        texData[o] = LUT[k];
        texData[o + 1] = LUT[k + 1];
        texData[o + 2] = LUT[k + 2];
        texData[o + 3] = 255;
      }
    }
    skyRms = Math.sqrt(s2 / (NTH * NPH));
    skyTex.needsUpdate = true;
    drawMollweide();
    skyDirty = false;
  }

  // Mollweide inset (the classic all-sky view)
  const MW = 440;
  const MH = 250;
  const moll = insetCanvas(MW, MH, { right: '10px', top: '10px' });
  viewport.appendChild(moll);
  const mctx = moll.getContext('2d')!;
  const EW = MW - 24;
  const EH = EW / 2;
  const EX = 12;
  const EY = 38;
  const mollImg = mctx.createImageData(EW, Math.round(EH));
  const mollIdx = new Int32Array(EW * Math.round(EH)).fill(-1);
  for (let y = 0; y < Math.round(EH); y++) {
    for (let x = 0; x < EW; x++) {
      const X = ((x + 0.5) / EW) * 4 * Math.SQRT2 - 2 * Math.SQRT2;
      const Y = Math.SQRT2 - ((y + 0.5) / EH) * 2 * Math.SQRT2;
      if ((X * X) / 8 + (Y * Y) / 2 > 1) continue;
      const th = Math.asin(Y / Math.SQRT2);
      const lat = Math.asin((2 * th + Math.sin(2 * th)) / Math.PI);
      const lon = (Math.PI * X) / (2 * Math.SQRT2 * Math.cos(th));
      const i = Math.min(NTH - 1, Math.floor(((Math.PI / 2 - lat) / Math.PI) * NTH));
      const j = Math.floor((((-lon + 4 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * NPH) % NPH;
      mollIdx[y * EW + x] = i * NPH + j;
    }
  }
  function drawMollweide(): void {
    const d = mollImg.data;
    for (let q = 0; q < mollIdx.length; q++) {
      const src = mollIdx[q];
      const o = q * 4;
      if (src < 0) {
        d[o + 3] = 0;
        continue;
      }
      const k = lutIndex(skyMap[src]) * 3;
      d[o] = LUT[k];
      d[o + 1] = LUT[k + 1];
      d[o + 2] = LUT[k + 2];
      d[o + 3] = 255;
    }
    mctx.clearRect(0, 0, MW, MH);
    mctx.putImageData(mollImg, EX, EY);
    mctx.font = '22px JetBrains Mono, monospace';
    mctx.fillStyle = '#8391ab';
    mctx.fillText('whole sky, Mollweide projection', 14, 28);
    // colour bar
    const by = MH - 22;
    for (let x = 0; x < 200; x++) {
      const k = Math.round((x / 199) * 255) * 3;
      mctx.fillStyle = `rgb(${LUT[k]},${LUT[k + 1]},${LUT[k + 2]})`;
      mctx.fillRect(120 + x, by, 1, 10);
    }
    mctx.fillStyle = '#8391ab';
    mctx.font = '18px JetBrains Mono, monospace';
    mctx.fillText(`−${T_SCALE}`, 58, by + 11);
    mctx.fillText(`+${T_SCALE} μK`, 328, by + 11);
  }

  // Blackbody inset: the monopole the ripples sit on
  const BW = 440;
  const BH = 230;
  const bb = insetCanvas(BW, BH, { right: '10px', bottom: '10px' });
  viewport.appendChild(bb);
  (function drawBlackbody(): void {
    const c = bb.getContext('2d')!;
    const x0 = 58;
    const x1 = 272;
    const y0 = 52;
    const y1 = BH - 40;
    const NUMAX = 700;
    const IMAX = 420; // MJy/sr
    const xo = (nu: number) => x0 + (nu / NUMAX) * (x1 - x0);
    const yo = (I: number) => y1 - (I / IMAX) * (y1 - y0);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('blackbody at T₀ = 2.7255 K', 14, 30);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.font = '17px JetBrains Mono, monospace';
    for (const nu of [0, 300, 600]) {
      c.beginPath();
      c.moveTo(xo(nu), y0);
      c.lineTo(xo(nu), y1);
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(String(nu), xo(nu) - 12, y1 + 20);
    }
    c.fillText('GHz', x1 + 8, y1 + 20);
    for (const I of [0, 200, 400]) {
      c.fillText(String(I), 10, yo(I) + 6);
    }
    c.strokeStyle = css(PALETTE.amber);
    c.lineWidth = 3;
    c.beginPath();
    for (let k = 1; k <= 200; k++) {
      const nu = (k / 200) * NUMAX;
      const I = planckNu(nu * 1e9, T0) / 1e-20;
      if (k === 1) c.moveTo(xo(nu), yo(I));
      else c.lineTo(xo(nu), yo(I));
    }
    c.stroke();
    const nuP = wienNu(T0) / 1e9;
    const IP = planckNu(nuP * 1e9, T0) / 1e-20;
    c.fillStyle = css(PALETTE.cyan);
    c.beginPath();
    c.arc(xo(nuP), yo(IP), 5, 0, Math.PI * 2);
    c.fill();
    c.font = '16px JetBrains Mono, monospace';
    const tx = x1 + 12;
    c.fillText(`peak ${nuP.toFixed(0)} GHz`, tx, y0 + 12);
    c.fillText(`(per λ: ${(wienLambda(T0) * 1e3).toFixed(2)} mm)`, tx, y0 + 34);
    c.fillStyle = '#8391ab';
    c.fillText('FIRAS: blackbody', tx, y0 + 64);
    c.fillText('to within 50 ppm', tx, y0 + 86);
    c.fillText('I_ν in MJy/sr', tx, y0 + 116);
  })();

  // ================================================================ SOUND SHELL
  const shellGroup = new THREE.Group();
  scene.add(shellGroup);
  const floor = makeGrid(14, 14);
  floor.position.y = -3.4;
  shellGroup.add(floor);

  function shellShape(color: number, fillOpacity: number): { g: THREE.Group; fill: THREE.MeshBasicMaterial; wire: THREE.LineBasicMaterial } {
    const g = new THREE.Group();
    const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), fill));
    const wire = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    const circle = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2), 0, Math.sin((k / 96) * Math.PI * 2))),
    );
    for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 3, 0], [-Math.PI / 3, 0]] as [number, number][]) {
      const l = new THREE.Line(circle, wire);
      l.rotation.set(rx, 0, rz);
      g.add(l);
    }
    return { g, fill, wire };
  }
  const plasma = shellShape(PALETTE.rose, 0.12);
  shellGroup.add(plasma.g);
  const photons = shellShape(PALETTE.cyan, 0.1);
  shellGroup.add(photons.g);
  const baryons = shellShape(PALETTE.amber, 0.16);
  shellGroup.add(baryons.g);
  const dmShell = shellShape(PALETTE.violet, 0.1);
  shellGroup.add(dmShell.g);
  const dmCore = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshStandardMaterial({ color: PALETTE.violet, emissive: 0x4a2f9a, roughness: 0.5 }));
  shellGroup.add(dmCore);
  const bCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.5, depthWrite: false }));
  shellGroup.add(bCore);
  // ruler from the centre to the frozen shell
  const rulerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
  const ruler = new THREE.Line(rulerGeo, new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.8 }));
  shellGroup.add(ruler);
  const rulerLabel = stage.label('', [0, 0.25, 0], '', shellGroup);
  stage.label('dark matter lump', [0, -0.5, 0], 'muted', shellGroup);

  let shellTab: ShellTable = shellTable(p, 1e-6, A_END);
  let shellTabDirty = false;
  let aD = 1 / (1 + bg.zDrag);
  let uShell = 0;
  let shellPlaying = true;
  let shellFrozen = false;
  let shellA = 1e-6;
  let shellR = 0;
  let photonR = 0;
  let growth = 0;

  function shellAOf(u: number): number {
    if (u <= U_FREEZE) {
      // Linear in a, so the radius grows smoothly (r_s ∝ a in the radiation era).
      return Math.max(1e-6, (u / U_FREEZE) * aD);
    }
    const f = Math.min(1, (u - U_FREEZE) / (1 - U_FREEZE));
    return Math.exp(Math.log(aD) + f * (Math.log(A_END) - Math.log(aD)));
  }

  function updateShell(): void {
    if (shellTabDirty) {
      shellTab = shellTable(p, 1e-6, A_END);
      aD = 1 / (1 + bg.zDrag);
      shellTabDirty = false;
    }
    const a = shellAOf(uShell);
    shellA = a;
    const la = Math.log(a);
    const frozen = a >= aD * 0.9999;
    const rsNow = shellAt(shellTab, Math.min(la, Math.log(aD)), 'rs');
    shellR = frozen ? bg.rsDrag : rsNow;
    if (frozen && uShell > 0) shellFrozen = true;
    const etaD = shellAt(shellTab, Math.log(aD), 'eta');
    photonR = frozen ? shellR + (shellAt(shellTab, la, 'eta') - etaD) : shellR;
    // Linear growth in the matter era: perturbations grow ∝ a after the drag epoch.
    growth = frozen ? Math.min(1, (a - aD) / (A_END - aD)) : 0;

    const r = Math.max(0.02, shellR * SHELL_S);
    plasma.g.visible = !frozen;
    plasma.g.scale.setScalar(r);
    baryons.g.visible = frozen;
    baryons.g.scale.setScalar(r);
    baryons.fill.opacity = 0.1 * (1 - 0.6 * growth);
    baryons.wire.opacity = 0.85 * (1 - 0.55 * growth);
    const pr = photonR * SHELL_S;
    photons.g.visible = frozen && pr < 9;
    photons.g.scale.setScalar(pr);
    const fade = Math.max(0, 1 - (pr - r) / 6);
    photons.fill.opacity = 0.1 * fade;
    photons.wire.opacity = 0.7 * fade;
    dmShell.g.visible = frozen && growth > 0.02;
    dmShell.g.scale.setScalar(r);
    dmShell.fill.opacity = 0.08 * growth;
    dmShell.wire.opacity = 0.5 * growth;
    bCore.visible = frozen && growth > 0.02;
    bCore.scale.setScalar(0.9 + 1.4 * growth);
    bCore.material.opacity = 0.55 * growth;
    ruler.visible = frozen;
    ruler.scale.set(r, 1, 1);
    rulerLabel.visible = frozen;
    rulerLabel.position.set(r / 2, 0.28, 0);
    rulerLabel.element.textContent = `r_d = ${bg.rsDrag.toFixed(0)} Mpc`;
    const z = 1 / a - 1;
    caption.textContent = !frozen
      ? `z = ${z.toFixed(0)} · plasma rings, sound at ≈ c/√3`
      : growth < 0.08
        ? `z = ${z.toFixed(0)} · light escapes, the baryon shell freezes`
        : `z = ${z.toFixed(0)} · gravity: dark matter and baryons share both bumps`;
  }

  // Radial profile inset: r² ρ(r), a cartoon after Eisenstein, Seo & White (2007)
  const PW = 440;
  const PH = 250;
  const prof = insetCanvas(PW, PH, { right: '10px', top: '10px' });
  viewport.appendChild(prof);
  const pctx = prof.getContext('2d')!;
  function drawProfile(): void {
    const c = pctx;
    c.clearRect(0, 0, PW, PH);
    const x0 = 20;
    const x1 = PW - 16;
    const y0 = 84;
    const y1 = PH - 40;
    const RMAX = 250;
    const xo = (rr: number) => x0 + (rr / RMAX) * (x1 - x0);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('mass profile r²ρ(r)', 14, 30);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.font = '17px JetBrains Mono, monospace';
    for (const rr of [0, 50, 100, 150, 200, 250]) {
      c.beginPath();
      c.moveTo(xo(rr), y0);
      c.lineTo(xo(rr), y1);
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(String(rr), xo(rr) - 12, y1 + 20);
    }
    c.fillText('Mpc', x1 - 34, y1 + 20);
    const gauss = (rr: number, mu: number, s: number) => Math.exp(-0.5 * ((rr - mu) / s) ** 2);
    const frozen = shellA >= aD * 0.9999;
    const sig = 8 + 0.06 * shellR;
    const curve = (color: string, f: (rr: number) => number) => {
      c.strokeStyle = color;
      c.lineWidth = 3;
      c.beginPath();
      for (let k = 0; k <= 180; k++) {
        const rr = (k / 180) * RMAX;
        const y = y1 - Math.min(1.15, f(rr)) * (y1 - y0);
        if (k === 0) c.moveTo(xo(rr), y);
        else c.lineTo(xo(rr), y);
      }
      c.stroke();
    };
    const g = growth;
    // Dark matter: central lump that slowly spreads, then picks up an echo at r_d.
    curve(css(PALETTE.violet), (rr) => 0.9 * gauss(rr, 0, 10 + 0.08 * shellR) + (frozen ? 0.25 * g * gauss(rr, shellR, sig) + 0.35 * g * gauss(rr, 0, 25) : 0));
    if (!frozen) {
      curve(css(PALETTE.rose), (rr) => (shellR > 1 ? 0.8 * gauss(rr, shellR, sig) : 0));
    } else {
      const fade = Math.max(0, 1 - (photonR - shellR) / 300);
      if (photonR < RMAX + 30) curve(css(PALETTE.cyan), (rr) => 0.8 * fade * gauss(rr, photonR, sig + 0.1 * (photonR - shellR)));
      curve(css(PALETTE.amber), (rr) => 0.8 * (1 - 0.7 * g) * gauss(rr, shellR, sig) + 0.9 * g * gauss(rr, 0, 20));
    }
    c.font = '17px JetBrains Mono, monospace';
    const items: [string, number][] = frozen
      ? [['dark matter', PALETTE.violet], ['baryons', PALETTE.amber], ['photons', PALETTE.cyan]]
      : [['dark matter', PALETTE.violet], ['photon–baryon plasma', PALETTE.rose]];
    let lx = 16;
    for (const [t, col] of items) {
      c.fillStyle = css(col);
      c.fillRect(lx, 56, 12, 4);
      c.fillStyle = '#b8c3d9';
      c.fillText(t, lx + 16, 64);
      lx += c.measureText(t).width + 30;
    }
  }

  // ================================================================ SPECTRUM RIBBON
  const specGroup = new THREE.Group();
  specGroup.position.set(0, -1.8, 0);
  scene.add(specGroup);
  const ells = new Float32Array(NS);
  for (let k = 0; k < NS; k++) ells[k] = 2 + (k * (LMAX_SPEC - 2)) / (NS - 1);
  const xOf = (l: number) => -SPEC_W / 2 + l * XS;
  const cur = new Float32Array(NS);
  const tgt = new Float32Array(NS);

  const topPos = new Float32Array(NS * 2 * 3);
  const topCol = new Float32Array(NS * 2 * 3);
  const curtPos = new Float32Array(NS * 2 * 3);
  const curtCol = new Float32Array(NS * 2 * 3);
  const idx: number[] = [];
  for (let k = 0; k < NS - 1; k++) {
    const a = 2 * k;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.BufferAttribute(topPos, 3));
  topGeo.setAttribute('color', new THREE.BufferAttribute(topCol, 3));
  topGeo.setIndex(idx);
  const top = new THREE.Mesh(topGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
  top.frustumCulled = false;
  specGroup.add(top);
  const curtGeo = new THREE.BufferGeometry();
  curtGeo.setAttribute('position', new THREE.BufferAttribute(curtPos, 3));
  curtGeo.setAttribute('color', new THREE.BufferAttribute(curtCol, 3));
  curtGeo.setIndex(idx);
  const curtain = new THREE.Mesh(curtGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  curtain.frustumCulled = false;
  specGroup.add(curtain);
  // Fiducial (Planck values) as a faint line behind
  const ghostPos = new Float32Array(NS * 3);
  for (let k = 0; k < NS; k++) {
    ghostPos[k * 3] = xOf(ells[k]);
    ghostPos[k * 3 + 1] = Math.min(YMAX, Dfid[Math.round(ells[k])]) * YS;
    ghostPos[k * 3 + 2] = -RIB_D - 0.05;
  }
  const ghostGeo = new THREE.BufferGeometry();
  ghostGeo.setAttribute('position', new THREE.BufferAttribute(ghostPos, 3));
  const ghost = new THREE.Line(ghostGeo, new THREE.LineDashedMaterial({ color: 0xdfe6f3, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.5 }));
  ghost.computeLineDistances();
  specGroup.add(ghost);

  // Axes
  const axPts: THREE.Vector3[] = [
    new THREE.Vector3(xOf(0), 0, 0), new THREE.Vector3(xOf(LMAX_SPEC), 0, 0),
    new THREE.Vector3(xOf(0), 0, 0), new THREE.Vector3(xOf(0), 6000 * YS * 1.05, 0),
  ];
  for (const l of [500, 1000, 1500, 2000, 2500]) axPts.push(new THREE.Vector3(xOf(l), 0, 0), new THREE.Vector3(xOf(l), -0.12, 0));
  for (const d of [2000, 4000, 6000]) axPts.push(new THREE.Vector3(xOf(0), d * YS, 0), new THREE.Vector3(xOf(0) - 0.12, d * YS, 0));
  specGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(axPts), new THREE.LineBasicMaterial({ color: PALETTE.gridMajor })));
  const floorGrid = makeGrid(14, 28);
  floorGrid.position.set(0, -0.01, 0);
  floorGrid.scale.set(1, 1, 0.3);
  specGroup.add(floorGrid);
  for (const l of [2, 500, 1000, 1500, 2000, 2500]) stage.label(String(l), [xOf(l), -0.35, 0], 'muted', specGroup);
  stage.label('multipole ℓ  (angle ≈ 180°/ℓ)', [xOf(1900), -0.75, 0], 'muted', specGroup);
  for (const [l, t] of [[90, '2°'], [180, '1°'], [360, '0.5°'], [900, '0.2°']] as [number, string][]) stage.label(t, [xOf(l), -0.75, 0], 'muted', specGroup);
  for (const d of [2000, 4000, 6000]) stage.label(String(d), [xOf(0) - 0.45, d * YS, 0], 'muted', specGroup);
  stage.label('D_ℓ (μK²)', [xOf(0) + 0.2, 6000 * YS * 1.05 + 0.3, 0], 'muted', specGroup);
  stage.label('damping tail', [xOf(2000), 1.0, 0], 'muted', specGroup);
  const peakLabels = [0, 1, 2].map((n) => stage.label('', [0, 0, 0], n === 0 ? 'big' : '', specGroup));

  // Pick cursor
  const cursorGeo = new THREE.BufferGeometry();
  const cursorPos = new Float32Array(6);
  cursorGeo.setAttribute('position', new THREE.BufferAttribute(cursorPos, 3));
  const cursor = new THREE.Line(cursorGeo, new THREE.LineBasicMaterial({ color: PALETTE.green }));
  cursor.frustumCulled = false;
  cursor.visible = false;
  specGroup.add(cursor);
  const cursorLabel = stage.label('', [0, 0, 0], '', specGroup);
  cursorLabel.visible = false;
  const pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(SPEC_W, 12), new THREE.MeshBasicMaterial({ visible: false }));
  pickPlane.position.set(0, 4, 0);
  specGroup.add(pickPlane);

  const cCyan = new THREE.Color(PALETTE.cyan);
  const cAmber = new THREE.Color(PALETTE.amber);
  const cGrey = new THREE.Color(0x8391ab);
  const tmpC = new THREE.Color();

  function setTargets(): void {
    for (let k = 0; k < NS; k++) tgt[k] = Math.min(YMAX, D[Math.round(ells[k])]) * YS;
  }

  function colourRibbon(): void {
    for (let k = 0; k < NS; k++) {
      const l = ells[k];
      const x = Math.PI * (l / (TOY.spacing * bg.lA) + TOY.phi);
      const comp = 0.5 - 0.5 * Math.cos(x); // 1 at compressions (odd peaks)
      const w = 1 / (1 + (l / TOY.lSW) ** 2);
      tmpC.copy(cCyan).lerp(cAmber, comp).lerp(cGrey, w);
      for (let s = 0; s < 2; s++) {
        const o = (2 * k + s) * 3;
        topCol[o] = tmpC.r;
        topCol[o + 1] = tmpC.g;
        topCol[o + 2] = tmpC.b;
        const dim = s === 0 ? 0.15 : 0.8;
        curtCol[o] = tmpC.r * dim;
        curtCol[o + 1] = tmpC.g * dim;
        curtCol[o + 2] = tmpC.b * dim;
      }
    }
    (topGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (curtGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function writeRibbon(): void {
    for (let k = 0; k < NS; k++) {
      const x = xOf(ells[k]);
      const y = cur[k];
      let o = 2 * k * 3;
      topPos[o] = x;
      topPos[o + 1] = y;
      topPos[o + 2] = -RIB_D;
      topPos[o + 3] = x;
      topPos[o + 4] = y;
      topPos[o + 5] = RIB_D;
      o = 2 * k * 3;
      curtPos[o] = x;
      curtPos[o + 1] = 0;
      curtPos[o + 2] = 0;
      curtPos[o + 3] = x;
      curtPos[o + 4] = y;
      curtPos[o + 5] = 0;
    }
    (topGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (curtGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function placePeakLabels(): void {
    for (let n = 0; n < 3; n++) {
      const l = peaks[n];
      const lab = peakLabels[n];
      if (l === undefined) {
        lab.visible = false;
        continue;
      }
      lab.visible = true;
      lab.position.set(xOf(l), Math.min(YMAX, D[l]) * YS + 0.4, 0);
      lab.element.textContent = `ℓ${'₁₂₃'[n]} = ${l}`;
    }
  }

  function placeCursor(): void {
    if (!picked) return;
    const x = xOf(picked);
    const y = Math.min(YMAX, D[picked]) * YS;
    cursorPos[0] = x;
    cursorPos[1] = 0;
    cursorPos[2] = RIB_D + 0.02;
    cursorPos[3] = x;
    cursorPos[4] = y + 0.2;
    cursorPos[5] = RIB_D + 0.02;
    (cursorGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    cursor.visible = true;
    cursorLabel.visible = true;
    cursorLabel.position.set(x, -1.2, RIB_D);
    const ang = 180 / picked;
    cursorLabel.element.textContent = `ℓ = ${picked} · ${ang < 1 ? ang.toFixed(2) : ang.toFixed(1)}° · D = ${D[picked].toFixed(0)} μK²`;
  }

  // ================================================================ OVERLAY LEGEND
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number) => `<i style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px;background:${css(c)}"></i>`;
  const LEGENDS: Record<View, string> = {
    sky: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">A synthetic CMB sky</div>
<div>Random sky with the toy spectrum, ℓ ≤ ${LMAX_SKY}. Red is hotter, blue colder than 2.7255 K, by about ±100 μK.</div>
<div style="margin-top:4px">The spots have a typical size. Curvature changes it.</div>`,
    shell: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">One lump, one sound wave</div>
<div>${sw(PALETTE.violet)}dark matter stays put</div>
<div>${sw(PALETTE.rose)}photon–baryon plasma rings out</div>
<div>${sw(PALETTE.cyan)}light, free after recombination</div>
<div>${sw(PALETTE.amber)}baryon shell, frozen at r_d</div>
<div style="margin-top:4px">Comoving scale: 1 grid square = 50 Mpc.</div>`,
    spectrum: `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Toy power spectrum</div>
<div>${sw(PALETTE.amber)}compressions (odd peaks)</div>
<div>${sw(PALETTE.cyan)}rarefactions (even peaks)</div>
<div>dashed: Planck values, for comparison</div>
<div>far left: the flat Sachs–Wolfe plateau</div>
<div style="margin-top:4px">Click the ribbon to read off ℓ.</div>`,
  };

  const caption = document.createElement('div');
  Object.assign(caption.style, {
    position: 'absolute', left: '50%', bottom: '12px', transform: 'translateX(-50%)', zIndex: '2', pointerEvents: 'none',
    background: 'rgba(7,10,18,0.78)', borderRadius: '8px', border: '1px solid #243049', padding: '4px 10px',
    font: '600 12px JetBrains Mono, monospace', color: '#dfe6f3', whiteSpace: 'nowrap', maxWidth: '92%', overflow: 'hidden',
  } as CSSStyleDeclaration);
  viewport.appendChild(caption);

  // ================================================================ VIEW SWITCHING
  function applyView(v: View, fly = true): void {
    view = v;
    skyGroup.visible = v === 'sky';
    shellGroup.visible = v === 'shell';
    specGroup.visible = v === 'spectrum';
    moll.style.display = v === 'sky' ? '' : 'none';
    bb.style.display = v === 'sky' ? '' : 'none';
    prof.style.display = v === 'shell' ? '' : 'none';
    caption.style.display = v === 'shell' ? '' : 'none';
    legend.innerHTML = LEGENDS[v];
    if (v === 'sky' && skyDirty) regenSky();
    if (v === 'shell') {
      updateShell();
      drawProfile();
    }
    if (fly) {
      if (v === 'sky' && inside) stage.flyTo([0, 0, 0.02], [0, 0, 0]);
      else stage.flyTo(CAM[v].pos, CAM[v].target);
    }
    skySec.style.display = v === 'sky' ? '' : 'none';
    shellSec.style.display = v === 'shell' ? '' : 'none';
  }

  function setInside(v: boolean): void {
    inside = v;
    skyMat.side = v ? THREE.BackSide : THREE.FrontSide;
    skyMat.needsUpdate = true;
    youLabel.visible = !v;
    you.visible = !v;
    skyLabel.visible = !v;
    stage.controls.enablePan = !v;
    if (view === 'sky') {
      if (v) stage.flyTo([0, 0, 0.02], [0, 0, 0]);
      else stage.flyTo(CAM.sky.pos, CAM.sky.target);
    }
  }

  // ================================================================ PARAMETERS
  function recompute(): void {
    bg = background(p);
    toySpectrum(p, LMAX_SPEC, bg, D);
    peaks = findPeaks(D, 100);
    setTargets();
    colourRibbon();
    placePeakLabels();
    placeCursor();
    skyDirty = true;
    skyTimer = 0.18;
    shellTabDirty = true;
  }

  // ================================================================ PICKING
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => {
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (view !== 'spectrum') return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pickPlane, false)[0];
    if (!hit) return;
    const local = specGroup.worldToLocal(hit.point.clone());
    const l = Math.round((local.x + SPEC_W / 2) / XS);
    if (l < 2 || l > LMAX_SPEC) return;
    picked = l;
    placeCursor();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // ================================================================ PANEL
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'sky', label: 'Sky' }, { value: 'shell', label: 'Sound shell' }, { value: 'spectrum', label: 'Spectrum' }],
    onChange: (v) => applyView(v),
  });

  ui.section('The universe');
  const sWb = ui.slider({ key: 'wb', label: 'Baryons Ω_b h²', min: 0.005, max: 0.05, step: 0.0005, value: p.wb, format: (v) => v.toFixed(4), onInput: (v) => { p.wb = v; recompute(); } });
  const sWc = ui.slider({ key: 'wc', label: 'Dark matter Ω_c h²', min: 0.05, max: 0.25, step: 0.001, value: p.wc, format: (v) => v.toFixed(3), onInput: (v) => { p.wc = v; recompute(); } });
  const sOk = ui.slider({ key: 'ok', label: 'Curvature Ω_k', min: -0.15, max: 0.15, step: 0.005, value: p.ok, format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)} ${v < -0.001 ? '(closed)' : v > 0.001 ? '(open)' : '(flat)'}`, onInput: (v) => { p.ok = v; recompute(); } });
  ui.buttons([
    { label: 'Planck values', onClick: () => { sWb.set(PLANCK.wb, false); sWc.set(PLANCK.wc, false); sOk.set(PLANCK.ok, false); Object.assign(p, PLANCK); recompute(); } },
  ]);
  ui.note('Hubble parameter held at h = 0.674. Dark energy fills the rest of the budget.');

  ui.section('Sky');
  ui.buttons([{ label: 'New sky', primary: true, key: 'seed', onClick: () => { seed++; alm = unitAlm(seed, LMAX_SKY); regenSky(); } }]);
  ui.toggle({ key: 'inside', label: 'Stand inside the sphere', value: inside, onChange: (v) => setInside(v) });
  ui.toggle({ key: 'spin', label: 'Slow spin', value: spin, onChange: (v) => (spin = v) });
  const skySec = ui.root.querySelectorAll('.panel-section')[2] as HTMLElement;

  ui.section('Sound shell');
  ui.buttons([
    { label: 'Launch shell', primary: true, key: 'shell', onClick: () => { uShell = 0; shellPlaying = true; if (view !== 'shell') applyView('shell'); } },
    { label: 'Pause', onClick: () => { shellPlaying = !shellPlaying; } },
  ]);
  ui.note('The shell is the <a href="#/t/cosmic-web">cosmic web</a>’s hidden ruler: galaxies today still sit slightly more often 147 Mpc apart.');
  const shellSec = ui.root.querySelectorAll('.panel-section')[3] as HTMLElement;

  ui.section('Readouts');
  const rL1 = ui.readout('l1', 'first peak ℓ₁');
  const rLA = ui.readout('lA', 'ℓ_A = π D_A / r_s');
  const rR21 = ui.readout('r21', 'peak ratio D₂/D₁');
  const rRs = ui.readout('rs', 'sound horizon r_s(z*)', 'Mpc');
  const rRd = ui.readout('rd', 'BAO ruler r_d', 'Mpc');
  const rDM = ui.readout('DM', 'distance D_A(z*)', 'Gpc');
  const rTh = ui.readout('theta', 'angle θ* = r_s/D_A', '°');
  const rR = ui.readout('R', 'baryon loading R*');
  const rZ = ui.readout('zstar', 'last scattering z*');
  const rT = ui.readout('Tstar', 'T at z* = T₀(1+z*)', 'K');
  const rAge = ui.readout('age', 'age at z*', 'kyr');
  const rView = ui.readout('live', 'view readout');

  function updateReadouts(): void {
    rL1(peaks[0] ?? '–');
    rLA(bg.lA.toFixed(1));
    rR21(peaks.length > 1 ? (D[peaks[1]] / D[peaks[0]]).toFixed(3) : '–');
    rRs(bg.rsStar.toFixed(1));
    rRd(bg.rsDrag.toFixed(1));
    rDM((bg.DM / 1000).toFixed(2));
    rTh(((bg.thetaStar * 180) / Math.PI).toFixed(3));
    rR(bg.Rstar.toFixed(3));
    rZ(bg.zStar.toFixed(0));
    rT(tempAtZ(bg.zStar).toFixed(0));
    rAge((bg.ageStar / 1000).toFixed(0));
    if (view === 'sky') rView(`sky rms ${skyRms.toFixed(0)} μK`);
    else if (view === 'shell') rView(`z ${(1 / shellA - 1).toFixed(0)}, r ${shellR.toFixed(0)} Mpc`);
    else rView(picked ? `picked ℓ = ${picked}` : 'click the ribbon');
  }

  // ================================================================ FRAME LOOP
  let profTimer = 0;
  stage.onFrame((dt) => {
    if (view === 'sky') {
      if (spin) skyMesh.rotation.y += dt * 0.04;
      if (skyDirty) {
        skyTimer -= dt;
        if (skyTimer <= 0) regenSky();
      }
    } else if (view === 'shell') {
      if (shellPlaying && uShell < 1) {
        uShell = Math.min(1, uShell + dt / SHELL_DUR);
        updateShell();
      } else if (shellTabDirty) updateShell();
      profTimer += dt;
      if (profTimer > 0.08) {
        profTimer = 0;
        drawProfile();
      }
    } else {
      let moving = false;
      for (let k = 0; k < NS; k++) {
        const d = tgt[k] - cur[k];
        if (Math.abs(d) > 1e-4) {
          cur[k] += d * Math.min(1, dt * 8);
          moving = true;
        } else cur[k] = tgt[k];
      }
      if (moving) writeRibbon();
    }
    updateReadouts();
  });

  // ================================================================ INIT
  setTargets();
  cur.set(tgt);
  writeRibbon();
  colourRibbon();
  placePeakLabels();
  applyView('sky', false);
  updateReadouts();

  return {
    state: () => ({
      view,
      wb: p.wb,
      wc: p.wc,
      ok: p.ok,
      seed,
      inside,
      l1: peaks[0] ?? 0,
      l2: peaks[1] ?? 0,
      l3: peaks[2] ?? 0,
      lA: bg.lA,
      r21: peaks.length > 1 ? D[peaks[1]] / D[peaks[0]] : 1,
      rs: bg.rsStar,
      rd: bg.rsDrag,
      DM: bg.DM,
      thetaStar: bg.thetaStar,
      zStar: bg.zStar,
      Tstar: tempAtZ(bg.zStar),
      picked,
      shellZ: 1 / shellA - 1,
      shellR,
      shellFrozen,
      skyRms,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      moll.remove();
      bb.remove();
      prof.remove();
      caption.remove();
      legend.remove();
      skyTex.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cmb-acoustic-peaks',
  number: 87,
  title: 'The Cosmic Microwave Background',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'Sound waves from the early universe, frozen into the sky.',
  content,
  mount,
};

export default topic;
