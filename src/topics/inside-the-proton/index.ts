import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  alphaS, MASS_DECOMPOSITION, momentumSum, nucleonMass, partonCounts, pdfParams, quarkMassFraction,
  resolutionFm, totalCharge, valenceContent, valenceQuarkMass, xpdf, type Nucleon, type PDFParams, type XPDF,
} from './physics.ts';

type V3 = [number, number, number];

const R = 2.2; // proton radius in scene units (0.84 fm)
const LOGQ_MIN = 0;
const LOGQ_MAX = 4;
const X_MARK = 1e-3;
const X_COUNT = 1e-4;
const MAXG = 60; // free gluon coils
const COIL_PTS = 14;
const MAXS = 30; // sea pairs
const LINK_PTS = 72;

const BLUE = 0x5b8cff;
const COLOUR = [PALETTE.red, PALETTE.green, BLUE];
const ANTI = [0x4fe0e8, 0xe070f0, 0xf5e04a]; // anti-red (cyan), anti-green (magenta), anti-blue (yellow)
const GLUON = PALETTE.amber;
const SLICE_COLOR: Record<string, number> = {
  condensate: PALETTE.amber,
  quarkEnergy: PALETTE.rose,
  gluonEnergy: PALETTE.cyan,
  anomaly: PALETTE.violet,
};

const CAM: Record<'proton' | 'pie', { pos: V3; target: V3 }> = {
  proton: { pos: [0.4, 1.4, 8.6], target: [0.4, 0, 0] },
  pie: { pos: [2.3, 0.9, 12.0], target: [2.3, 0.1, 0] },
};

// Small deterministic RNG so the scene looks the same on every load.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInBall(r: () => number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  do out.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
  while (out.lengthSq() > 1);
  return out.multiplyScalar(radius);
}

function perpBasis(axis: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3): void {
  if (Math.abs(axis.y) < 0.9) u.set(0, 1, 0);
  else u.set(1, 0, 0);
  u.cross(axis).normalize();
  v.crossVectors(axis, u).normalize();
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.proton.pos, target: CAM.proton.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  // ---------------------------------------------------------------- state
  let logQ2 = 0.6;
  let nucleon: Nucleon = 'proton';
  let showSea = true;
  let showGluons = true;
  let pieOn = false;
  let touched = false;
  let params: PDFParams = pdfParams(10 ** logQ2);
  let nGluons = 0;
  let nSea = 0;
  let momSumNum = 1;
  let seaRatio = 0;
  const tmpPdf: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 };
  const rand = rng(7);

  // ---------------------------------------------------------------- proton shell
  const shellGeo = new THREE.SphereGeometry(R, 64, 40);
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
    color: 0x5a6ea8, transparent: true, opacity: 0.07, roughness: 0.3, metalness: 0, depthWrite: false,
  }));
  scene.add(shell);
  const rimMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x7f9cff) }, uPow: { value: 2.6 }, uAmp: { value: 0.9 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uAmp; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor*f*uAmp, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rim = new THREE.Mesh(shellGeo, rimMat);
  scene.add(rim);
  stage.label('proton, r ≈ 0.84 fm', [0, -R - 0.35, 0], 'muted');

  // ---------------------------------------------------------------- valence quarks
  interface Quark {
    g: THREE.Group;
    core: THREE.Mesh;
    coreMat: THREE.MeshStandardMaterial;
    blob: THREE.Mesh;
    blobMat: THREE.MeshStandardMaterial;
    label: CSS2DObject;
    phase: number;
    colour: number; // 0 r, 1 g, 2 b
  }
  // Lumpy constituent-quark blob: an icosphere with fixed noise.
  const blobGeo = new THREE.IcosahedronGeometry(1, 4);
  {
    const pa = blobGeo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = 1 + 0.09 * Math.sin(5.1 * v.x + 1.3) * Math.sin(4.3 * v.y + 0.4) + 0.07 * Math.sin(6.7 * v.z + 2.1) * Math.cos(3.9 * v.x);
      v.multiplyScalar(n);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    blobGeo.computeVertexNormals();
  }
  const coreGeo = new THREE.SphereGeometry(1, 32, 20);
  const quarks: Quark[] = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({ color: COLOUR[i], emissive: COLOUR[i], emissiveIntensity: 0.55, roughness: 0.35 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    const blobMat = new THREE.MeshStandardMaterial({ color: COLOUR[i], emissive: COLOUR[i], emissiveIntensity: 0.25, roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    g.add(core, blob);
    scene.add(g);
    const label = stage.label('u', [0, 0.5, 0], 'big', g);
    return { g, core, coreMat, blob, blobMat, label, phase: (i * 2 * Math.PI) / 3, colour: i };
  });

  function setFlavours(): void {
    const f = valenceContent(nucleon);
    quarks.forEach((q, i) => (q.label.element.textContent = f[i]));
  }

  // Colour-exchange links (springy gluon lines between the three quarks)
  const PAIRS: [number, number][] = [[0, 1], [1, 2], [2, 0]];
  const linkPos = new Float32Array(PAIRS.length * LINK_PTS * 2 * 3);
  const linkCol = new Float32Array(PAIRS.length * LINK_PTS * 2 * 3);
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPos, 3));
  linkGeo.setAttribute('color', new THREE.BufferAttribute(linkCol, 3));
  const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  links.frustumCulled = false;
  scene.add(links);

  // Travelling gluon that carries colour between two quarks
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(pulse);
  const pulseHalo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  pulse.add(pulseHalo);
  let exPair = 0;
  let exU = 0;
  let exWait = 0.6;
  let exFrom = 0;
  let exTo = 1;
  let swaps = 0;

  // ---------------------------------------------------------------- free gluons (coils)
  interface Coil { c: THREE.Vector3; axis: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; vel: THREE.Vector3; life: number; dur: number; len: number }
  const coils: Coil[] = [];
  const coilPos = new Float32Array(MAXG * (COIL_PTS - 1) * 2 * 3);
  const coilCol = new Float32Array(coilPos.length);
  const coilGeo = new THREE.BufferGeometry();
  coilGeo.setAttribute('position', new THREE.BufferAttribute(coilPos, 3));
  coilGeo.setAttribute('color', new THREE.BufferAttribute(coilCol, 3));
  const coilLines = new THREE.LineSegments(coilGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  coilLines.frustumCulled = false;
  scene.add(coilLines);
  const gCol = new THREE.Color(GLUON);

  function spawnCoil(k: Coil, fresh: boolean): void {
    randInBall(rand, R * 0.85, k.c);
    k.axis.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    perpBasis(k.axis, k.u, k.v);
    k.vel.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.35);
    k.dur = 1.2 + rand() * 1.6;
    k.life = fresh ? rand() * k.dur : 0;
    k.len = 0.28 + rand() * 0.22;
  }
  for (let i = 0; i < MAXG; i++) {
    const k: Coil = { c: new THREE.Vector3(), axis: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dur: 1, len: 0.3 };
    spawnCoil(k, true);
    coils.push(k);
  }

  // ---------------------------------------------------------------- sea pairs
  interface Pair { c: THREE.Vector3; axis: THREE.Vector3; life: number; dur: number; colour: number }
  const pairs: Pair[] = [];
  const seaMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, emissive: 0x222222 }), MAXS * 2);
  seaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(seaMesh);
  const seaLinkPos = new Float32Array(MAXS * 2 * 3);
  const seaLinkGeo = new THREE.BufferGeometry();
  seaLinkGeo.setAttribute('position', new THREE.BufferAttribute(seaLinkPos, 3));
  const seaLinks = new THREE.LineSegments(seaLinkGeo, new THREE.LineBasicMaterial({ color: 0x8391ab, transparent: true, opacity: 0.45 }));
  seaLinks.frustumCulled = false;
  scene.add(seaLinks);
  const cTmp = new THREE.Color();

  function spawnPair(p: Pair, idx: number, fresh: boolean): void {
    randInBall(rand, R * 0.82, p.c);
    p.axis.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    p.dur = 0.8 + rand() * 1.2;
    p.life = fresh ? rand() * p.dur : 0;
    p.colour = Math.floor(rand() * 3);
    seaMesh.setColorAt(idx * 2, cTmp.set(COLOUR[p.colour]));
    seaMesh.setColorAt(idx * 2 + 1, cTmp.set(ANTI[p.colour]));
    if (seaMesh.instanceColor) seaMesh.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < MAXS; i++) {
    const p: Pair = { c: new THREE.Vector3(), axis: new THREE.Vector3(), life: 0, dur: 1, colour: 0 };
    spawnPair(p, i, true);
    pairs.push(p);
  }

  // ---------------------------------------------------------------- mass donut
  const donut = new THREE.Group();
  donut.position.set(5.0, 0.3, 0);
  donut.rotation.set(-0.25, -0.2, 0);
  donut.visible = false;
  scene.add(donut);
  const DR = 1.25;
  const DT = 0.42;
  const SHORT: Record<string, string> = { condensate: 'quark mass terms<br>(u, d, s)', quarkEnergy: 'quark kinetic +<br>potential energy', gluonEnergy: 'gluon field<br>energy', anomaly: 'trace<br>anomaly' };
  const total = MASS_DECOMPOSITION.reduce((s, d) => s + d.pct, 0);
  let ang = Math.PI / 2;
  for (const d of MASS_DECOMPOSITION) {
    const arc = (d.pct / total) * Math.PI * 2;
    const col = SLICE_COLOR[d.key];
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(DR, DT, 20, Math.max(8, Math.round(arc * 20)), arc - 0.03),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.1 }),
    );
    m.rotation.z = ang + 0.015;
    const mid = ang + arc / 2;
    m.position.set(Math.cos(mid) * 0.07, Math.sin(mid) * 0.07, 0);
    donut.add(m);
    const lr = DR + DT + 0.72;
    const l = stage.label('', [Math.cos(mid) * lr, Math.sin(mid) * lr, 0], '', donut);
    l.element.innerHTML = `<div style="text-align:center;line-height:1.15"><b style="font-size:15px;color:${css(col)}">${d.pct}%</b><br><span style="font-size:10px;color:#b8c3d9">${SHORT[d.key]}</span></div>`;
    l.element.style.background = 'transparent';
    ang += arc;
  }
  // Valence quark rest masses: a white sliver inside the quark-mass slice
  const valFrac = quarkMassFraction('proton');
  const sliverArc = Math.max(0.02, valFrac * Math.PI * 2);
  const sliver = new THREE.Mesh(
    new THREE.TorusGeometry(DR, DT * 1.18, 16, 6, sliverArc),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7 }),
  );
  sliver.rotation.z = Math.PI / 2 + 0.03;
  donut.add(sliver);
  const sliverLabel = stage.label('', [0, -(DR + DT + 1.45), 0], '', donut);
  sliverLabel.element.style.background = 'transparent';
  const donutTitle = stage.label('', [0, 0, 0], '', donut);
  donutTitle.element.style.background = 'transparent';
  function writeDonut(): void {
    sliverLabel.element.innerHTML = `<div style="font-size:11px;line-height:1.25;color:#fff;text-align:center">white sliver: the Higgs-given<br>masses of the valence quarks, ${valenceQuarkMass(nucleon).toFixed(1)} MeV = ${(quarkMassFraction(nucleon) * 100).toFixed(1)}%</div>`;
    donutTitle.element.innerHTML = `<div style="text-align:center;line-height:1.2"><b style="font-size:16px;color:#dfe6f3">${nucleonMass(nucleon).toFixed(0)} MeV</b><br><span style="font-size:10px;color:#8391ab">lattice QCD<br>Yang et al. 2018</span></div>`;
  }

  // ---------------------------------------------------------------- overlays
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.88)', borderRadius: '10px', border: '1px solid #243049', padding: '9px 12px',
    font: '11.5px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(info);
  let infoHtml = '';

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 600;
  inset.height = 400;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '300px', height: '200px',
    background: 'rgba(7,10,18,0.78)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  function writeInfo(): void {
    const q2 = 10 ** logQ2;
    const res = resolutionFm(q2);
    const sw = (c: number, t: string, sym = '●') => `<div><span style="color:${css(c)}">${sym}</span> ${t}</div>`;
    const html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">${nucleon === 'proton' ? 'Proton (uud)' : 'Neutron (udd)'}, Q² = ${fmtQ2(q2)} GeV²</div>
<div>You resolve about ħc/Q = ${res < 0.01 ? res.toFixed(3) : res.toFixed(2)} fm.</div>
<div style="margin-top:3px">${[0, 1, 2].map((i) => `<span style="color:${css(COLOUR[i])}">●</span>`).join('')} valence quarks, colour r g b</div>
${showGluons ? sw(GLUON, `gluons (${nGluons} coils shown)`, '〰') : ''}
${showSea ? `<div><span style="color:${css(COLOUR[0])}">●</span><span style="color:${css(ANTI[0])}">●</span> sea pair q q̄ (${nSea} shown)</div>` : ''}
<div style="color:#8391ab;margin-top:3px">A gluon carries colour between quarks. The three always stay one red, one green, one blue.</div>`;
    if (html !== infoHtml) {
      info.innerHTML = html;
      infoHtml = html;
    }
  }

  const PDF_COL = { uv: PALETTE.rose, dv: PALETTE.violet, sea: PALETTE.cyan, g: GLUON };
  const SCALE_SG = 0.05;
  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const H = inset.height;
    c.clearRect(0, 0, W, H);
    const m = params.m;
    // Momentum bar
    c.font = '20px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('momentum shares', 16, 28);
    const bx = 16;
    const bw = W - 32;
    const by = 38;
    const segs: [number, number, string, boolean][] = [
      [m.valence, PDF_COL.uv, 'valence', true],
      [m.sea, PDF_COL.sea, 'sea', showSea],
      [m.gluon, PDF_COL.g, 'gluons', showGluons],
    ];
    let x = bx;
    for (const [f, col, name, on] of segs) {
      const w = f * bw;
      c.fillStyle = css(col);
      c.globalAlpha = on ? 0.85 : 0.15;
      c.fillRect(x, by, w - 2, 26);
      c.globalAlpha = 1;
      c.fillStyle = on ? '#070a12' : '#56627c';
      c.font = '600 18px JetBrains Mono, monospace';
      c.fillText(`${name} ${(f * 100).toFixed(0)}%`, x + 6, by + 19);
      x += w;
    }
    // PDF plot
    const px0 = 62;
    const px1 = W - 14;
    const py0 = 100;
    const py1 = H - 36;
    const YMAX = 1.2;
    const lx0 = -4;
    const xOf = (lx: number) => px0 + ((lx - lx0) / -lx0) * (px1 - px0);
    const yOf = (v: number) => py1 - (v / YMAX) * (py1 - py0);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.font = '17px JetBrains Mono, monospace';
    c.fillStyle = '#56627c';
    for (let lx = -4; lx <= 0; lx++) {
      const X = xOf(lx);
      c.beginPath();
      c.moveTo(X, py0);
      c.lineTo(X, py1);
      c.stroke();
      c.fillText(lx === 0 ? '1' : `1e${lx}`, X - 18, py1 + 22);
    }
    for (const v of [0, 0.5, 1]) {
      const Y = yOf(v);
      c.beginPath();
      c.moveTo(px0, Y);
      c.lineTo(px1, Y);
      c.stroke();
      c.fillText(v.toFixed(1), 18, Y + 6);
    }
    c.fillStyle = '#8391ab';
    c.fillText('x', px1 - 10, py1 + 22);
    c.save();
    c.beginPath();
    c.rect(px0, py0 - 4, px1 - px0, py1 - py0 + 4);
    c.clip();
    const curve = (key: keyof XPDF, scale: number, col: number) => {
      c.strokeStyle = css(col);
      c.lineWidth = 3;
      c.beginPath();
      for (let i = 0; i <= 120; i++) {
        const lx = lx0 + (i / 120) * -lx0;
        const xv = Math.min(0.9999, 10 ** lx);
        xpdf(xv, params, nucleon, tmpPdf);
        const Y = yOf(tmpPdf[key] * scale);
        if (i === 0) c.moveTo(xOf(lx), Y);
        else c.lineTo(xOf(lx), Y);
      }
      c.stroke();
    };
    if (showGluons) curve('g', SCALE_SG, PDF_COL.g);
    if (showSea) curve('sea', SCALE_SG, PDF_COL.sea);
    curve('uv', 1, PDF_COL.uv);
    curve('dv', 1, PDF_COL.dv);
    c.restore();
    // Marker at x = 1e-3
    const MX = xOf(Math.log10(X_MARK));
    c.strokeStyle = '#dfe6f3';
    c.setLineDash([6, 6]);
    c.beginPath();
    c.moveTo(MX, py0 - 4);
    c.lineTo(MX, py1);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#dfe6f3';
    c.font = '17px JetBrains Mono, monospace';
    c.fillText(`sea : valence = ${seaRatio.toFixed(0)} : 1`, MX + 8, py0 + 14);
    // Legend
    c.font = '16px JetBrains Mono, monospace';
    const items: [string, number, boolean][] = [
      ['x u_v', PDF_COL.uv, true],
      ['x d_v', PDF_COL.dv, true],
      ['x S ×0.05', PDF_COL.sea, showSea],
      ['x g ×0.05', PDF_COL.g, showGluons],
    ];
    const lx = px1 - 118;
    let ly = py0 + 14;
    for (const [t, col, on] of items) {
      if (!on) continue;
      c.fillStyle = css(col);
      c.fillText(t, lx, ly);
      ly += 20;
    }
  }

  // ---------------------------------------------------------------- recompute
  function recompute(): void {
    const q2 = 10 ** logQ2;
    params = pdfParams(q2);
    const cnt = partonCounts(params, X_COUNT);
    nGluons = Math.min(MAXG, Math.round(cnt.gluon * 0.25));
    nSea = Math.min(MAXS, Math.round(cnt.sea * 0.3));
    momSumNum = momentumSum(q2);
    xpdf(X_MARK, params, 'proton', tmpPdf);
    seaRatio = tmpPdf.sea / (tmpPdf.uv + tmpPdf.dv);
    drawInset();
    writeInfo();
  }

  // ---------------------------------------------------------------- frame loop
  const qPos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const ax = new THREE.Vector3();
  const pu = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const pt = new THREE.Vector3();
  const ca = new THREE.Color();
  const cb = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const qIdent = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  function quarkRadius(): number {
    const s = (logQ2 - LOGQ_MIN) / (LOGQ_MAX - LOGQ_MIN);
    return 0.16 + 0.1 * (1 - s);
  }
  function blobRadius(): number {
    const s = (logQ2 - LOGQ_MIN) / (LOGQ_MAX - LOGQ_MIN);
    return 0.2 + 0.72 * Math.pow(1 - s, 1.3);
  }

  function linkPoint(a: THREE.Vector3, b: THREE.Vector3, t: number, twist: number, amp: number, out: THREE.Vector3): THREE.Vector3 {
    ax.subVectors(b, a);
    const len = ax.length();
    ax.divideScalar(len || 1);
    perpBasis(ax, pu, pv);
    const turns = Math.max(3, Math.round(len * 5));
    const ph = t * turns * Math.PI * 2 + twist;
    const env = Math.sin(Math.PI * t);
    const a0 = amp * Math.pow(env, 0.4);
    return out.copy(a).addScaledVector(ax, len * t).addScaledVector(pu, Math.cos(ph) * a0).addScaledVector(pv, Math.sin(ph) * a0);
  }

  let infoTimer = 0;
  stage.onFrame((dt, t) => {
    // Valence quark motion: bounded wandering inside the proton
    const br = blobRadius();
    const qr = quarkRadius();
    const s = (logQ2 - LOGQ_MIN) / (LOGQ_MAX - LOGQ_MIN);
    for (let i = 0; i < 3; i++) {
      const q = quarks[i];
      const ph = q.phase;
      const rr = 0.95 + 0.25 * Math.sin(0.7 * t + ph * 1.7);
      const th = ph + 0.35 * t + 0.4 * Math.sin(0.53 * t + ph);
      qPos[i].set(rr * Math.cos(th), 0.45 * Math.sin(0.9 * t + 2 * ph) + 0.2 * Math.cos(1.3 * t + ph), rr * Math.sin(th) * 0.85);
      q.g.position.copy(qPos[i]);
      q.core.scale.setScalar(qr);
      q.blob.scale.setScalar(br);
      q.blob.rotation.set(0.3 * t + ph, 0.21 * t, 0);
      q.blobMat.opacity = 0.12 + 0.3 * (1 - s);
      q.label.position.set(0, Math.max(qr, br * 0.8) + 0.18, 0);
    }

    // Colour exchange along one link at a time
    if (exWait > 0) {
      exWait -= dt;
      pulse.visible = false;
      if (exWait <= 0) {
        exPair = (exPair + 1 + Math.floor(rand() * 2)) % 3;
        const [a, b] = PAIRS[exPair];
        if (rand() < 0.5) { exFrom = a; exTo = b; } else { exFrom = b; exTo = a; }
        exU = 0;
      }
    } else {
      exU += dt / 0.75;
      if (exU >= 1) {
        const tmp = quarks[exFrom].colour;
        quarks[exFrom].colour = quarks[exTo].colour;
        quarks[exTo].colour = tmp;
        for (const q of quarks) {
          q.coreMat.color.set(COLOUR[q.colour]);
          q.coreMat.emissive.set(COLOUR[q.colour]);
          q.blobMat.color.set(COLOUR[q.colour]);
          q.blobMat.emissive.set(COLOUR[q.colour]);
        }
        swaps++;
        exWait = 0.5 + rand() * 0.6;
        pulse.visible = false;
      } else {
        pulse.visible = showGluons;
        const [a, b] = PAIRS[exPair];
        const fwd = exFrom === a;
        linkPoint(qPos[a], qPos[b], fwd ? exU : 1 - exU, t * 5 + exPair, 0.09, pt);
        pulse.position.copy(pt);
        // A gluon carries colour and anticolour: blend of the two quarks' colours
        ca.set(COLOUR[quarks[exFrom].colour]).lerp(cb.set(ANTI[quarks[exTo].colour]), 0.5);
        (pulse.material as THREE.MeshBasicMaterial).color.copy(ca);
        (pulseHalo.material as THREE.MeshBasicMaterial).color.copy(ca);
      }
    }

    // Springy links
    if (showGluons) {
      let k = 0;
      for (let p = 0; p < PAIRS.length; p++) {
        const [a, b] = PAIRS[p];
        ca.set(COLOUR[quarks[a].colour]);
        cb.set(COLOUR[quarks[b].colour]);
        const bright = p === exPair && exWait <= 0 ? 1 : 0.55;
        linkPoint(qPos[a], qPos[b], 0, t * 4 + p, 0.09, va);
        for (let j = 1; j <= LINK_PTS; j++) {
          const u = j / LINK_PTS;
          linkPoint(qPos[a], qPos[b], u, t * 4 + p, 0.09, vb);
          const u0 = (j - 1) / LINK_PTS;
          linkPos[k * 3] = va.x; linkPos[k * 3 + 1] = va.y; linkPos[k * 3 + 2] = va.z;
          linkCol[k * 3] = (ca.r + (cb.r - ca.r) * u0) * bright;
          linkCol[k * 3 + 1] = (ca.g + (cb.g - ca.g) * u0) * bright;
          linkCol[k * 3 + 2] = (ca.b + (cb.b - ca.b) * u0) * bright;
          k++;
          linkPos[k * 3] = vb.x; linkPos[k * 3 + 1] = vb.y; linkPos[k * 3 + 2] = vb.z;
          linkCol[k * 3] = (ca.r + (cb.r - ca.r) * u) * bright;
          linkCol[k * 3 + 1] = (ca.g + (cb.g - ca.g) * u) * bright;
          linkCol[k * 3 + 2] = (ca.b + (cb.b - ca.b) * u) * bright;
          k++;
          va.copy(vb);
        }
      }
      linkGeo.attributes.position.needsUpdate = true;
      linkGeo.attributes.color.needsUpdate = true;

      // Free gluon coils
      let v = 0;
      for (let i = 0; i < nGluons; i++) {
        const c = coils[i];
        c.life += dt;
        if (c.life > c.dur) spawnCoil(c, false);
        c.c.addScaledVector(c.vel, dt);
        if (c.c.length() > R * 0.9) c.vel.multiplyScalar(-1);
        const e = Math.sin((Math.PI * c.life) / c.dur);
        const len = c.len * (0.6 + 0.4 * e);
        const amp = 0.05;
        for (let j = 0; j < COIL_PTS - 1; j++) {
          for (let h = 0; h < 2; h++) {
            const u = (j + h) / (COIL_PTS - 1);
            const ph = u * Math.PI * 2 * 3 + t * 6 + i;
            pt.copy(c.c).addScaledVector(c.axis, (u - 0.5) * len).addScaledVector(c.u, Math.cos(ph) * amp).addScaledVector(c.v, Math.sin(ph) * amp);
            coilPos[v * 3] = pt.x; coilPos[v * 3 + 1] = pt.y; coilPos[v * 3 + 2] = pt.z;
            coilCol[v * 3] = gCol.r * e; coilCol[v * 3 + 1] = gCol.g * e; coilCol[v * 3 + 2] = gCol.b * e;
            v++;
          }
        }
      }
      coilGeo.setDrawRange(0, v);
      coilGeo.attributes.position.needsUpdate = true;
      coilGeo.attributes.color.needsUpdate = true;
    }

    // Sea pairs
    if (showSea) {
      for (let i = 0; i < MAXS; i++) {
        const p = pairs[i];
        if (i >= nSea) {
          m4.makeScale(0, 0, 0);
          seaMesh.setMatrixAt(i * 2, m4);
          seaMesh.setMatrixAt(i * 2 + 1, m4);
          seaLinkPos.fill(0, i * 6, i * 6 + 6);
          continue;
        }
        p.life += dt;
        if (p.life > p.dur) spawnPair(p, i, false);
        const e = Math.sin((Math.PI * p.life) / p.dur);
        const sep = 0.32 * e;
        const r = 0.085 * Math.sqrt(Math.max(0, e));
        sc.setScalar(r);
        pt.copy(p.c).addScaledVector(p.axis, sep / 2);
        m4.compose(pt, qIdent, sc);
        seaMesh.setMatrixAt(i * 2, m4);
        seaLinkPos[i * 6] = pt.x; seaLinkPos[i * 6 + 1] = pt.y; seaLinkPos[i * 6 + 2] = pt.z;
        pt.copy(p.c).addScaledVector(p.axis, -sep / 2);
        m4.compose(pt, qIdent, sc);
        seaMesh.setMatrixAt(i * 2 + 1, m4);
        seaLinkPos[i * 6 + 3] = pt.x; seaLinkPos[i * 6 + 4] = pt.y; seaLinkPos[i * 6 + 5] = pt.z;
      }
      seaMesh.instanceMatrix.needsUpdate = true;
      seaLinkGeo.attributes.position.needsUpdate = true;
    }

    rim.rotation.y = t * 0.05;
    if (donut.visible) donut.position.y = 0.06 * Math.sin(t * 0.8);

    infoTimer += dt;
    if (infoTimer > 0.25) {
      infoTimer = 0;
      updateReadouts();
    }
  });

  // ---------------------------------------------------------------- controls
  const ui = new Panel(panel);
  ui.section('Resolution');
  ui.slider({
    key: 'Q2', label: 'Resolution Q²', min: LOGQ_MIN, max: LOGQ_MAX, step: 0.02, value: logQ2,
    format: (v) => `${fmtQ2(10 ** v)} GeV²`,
    onInput: (v) => { logQ2 = v; touched = true; recompute(); },
  });
  ui.select<Nucleon>({
    key: 'nucleon', label: 'Nucleon', value: nucleon,
    options: [{ value: 'proton', label: 'Proton (uud)' }, { value: 'neutron', label: 'Neutron (udd)' }],
    onChange: (v) => { nucleon = v; touched = true; setFlavours(); writeDonut(); drawInset(); writeInfo(); updateReadouts(); },
  });

  ui.section('Show');
  ui.toggle({ key: 'showSea', label: 'Sea quark–antiquark pairs', value: showSea, onChange: (v) => { showSea = v; seaMesh.visible = v; seaLinks.visible = v; drawInset(); writeInfo(); } });
  ui.toggle({ key: 'showGluons', label: 'Gluons', value: showGluons, onChange: (v) => { showGluons = v; links.visible = v; coilLines.visible = v; if (!v) pulse.visible = false; drawInset(); writeInfo(); } });
  ui.toggle({
    key: 'pie', label: 'Mass pie (where 938 MeV comes from)', value: pieOn,
    onChange: (v) => {
      pieOn = v;
      donut.visible = v;
      inset.style.display = v ? 'none' : '';
      const c = v ? CAM.pie : CAM.proton;
      stage.flyTo(c.pos, c.target, 1.2);
    },
  });

  ui.section('Momentum (sum rule)');
  const rV = ui.readout('momV', 'valence ⟨x⟩');
  const rS = ui.readout('momS', 'sea ⟨x⟩');
  const rG = ui.readout('momG', 'gluons ⟨x⟩');
  const rSum = ui.readout('momSum', '∫x Σf dx (numeric)');
  const rShown = ui.readout('momShown', 'momentum shown');
  const rRatio = ui.readout('seaRatio', 'sea : valence at x = 10⁻³');
  const rAlpha = ui.readout('alphaS', 'α_s(Q²)');
  const rRes = ui.readout('res', 'resolution ħc/Q', 'fm');

  ui.section('Charge and mass');
  const rQ = ui.readout('charge', 'charge (units of e)');
  const rM = ui.readout('mass', 'nucleon mass', 'MeV');
  const rQm = ui.readout('quarkMass', 'valence quark masses', 'MeV');
  const rF = ui.readout('massFrac', 'quark mass fraction');
  ui.legend([
    { color: css(PALETTE.red), label: 'red' },
    { color: css(PALETTE.green), label: 'green' },
    { color: css(BLUE), label: 'blue' },
    { color: css(GLUON), label: 'gluon' },
    { color: css(ANTI[0]), label: 'antiquark (anti-red)' },
  ]);
  ui.note('Colour here is the strong charge, not visible colour. Antiquarks carry anticolour, drawn as the complementary hue.');

  function momShown(): number {
    const m = params.m;
    return m.valence + (showSea ? m.sea : 0) + (showGluons ? m.gluon : 0);
  }

  function updateReadouts(): void {
    const m = params.m;
    const q2 = 10 ** logQ2;
    rV(`${(m.valence * 100).toFixed(1)} %`);
    rS(`${(m.sea * 100).toFixed(1)} %`);
    rG(`${(m.gluon * 100).toFixed(1)} %`);
    rSum(momSumNum.toFixed(5));
    rShown(`${(momShown() * 100).toFixed(1)} %`);
    rRatio(`${seaRatio.toFixed(0)} : 1`);
    rAlpha(alphaS(q2).toFixed(3));
    const res = resolutionFm(q2);
    rRes(res < 0.01 ? res.toFixed(4) : res.toFixed(3));
    const ch = totalCharge(nucleon);
    rQ(Math.abs(ch) < 1e-12 ? '0' : `+${ch.toFixed(0)}`);
    rM(nucleonMass(nucleon).toFixed(3));
    rQm(valenceQuarkMass(nucleon).toFixed(2));
    rF(`${(quarkMassFraction(nucleon) * 100).toFixed(2)} %`);
    writeInfo();
  }

  setFlavours();
  writeDonut();
  recompute();
  updateReadouts();

  return {
    state: () => ({
      logQ2,
      Q2: 10 ** logQ2,
      nucleon,
      charge: totalCharge(nucleon),
      showSea,
      showGluons,
      pie: pieOn,
      quarkMassFrac: quarkMassFraction(nucleon),
      momValence: params.m.valence,
      momSea: params.m.sea,
      momGluon: params.m.gluon,
      momSum: momSumNum,
      momShown: momShown(),
      seaRatio,
      swaps,
      touched,
    }),
    dispose: () => {
      info.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

function fmtQ2(q2: number): string {
  if (q2 < 10) return q2.toFixed(1);
  if (q2 < 1000) return q2.toFixed(0);
  return q2.toExponential(1).replace('e+', '×10^');
}

const topic: Topic = {
  id: 'inside-the-proton',
  number: 66,
  title: 'Inside the Proton',
  domain: 'particle',
  level: 3,
  status: 'live',
  tagline: 'Three quarks, a sea of gluons, and mass made mostly of motion.',
  content,
  mount,
};

export default topic;
