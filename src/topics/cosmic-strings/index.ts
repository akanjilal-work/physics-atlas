import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { content } from './content.ts';
import {
  ARCSEC,
  GMU_CMB,
  T_CMB,
  aPrime,
  bPrime,
  coneEmbed,
  deficitAngle,
  findCusps,
  foldFactor,
  images,
  ksStep,
  loopPoint,
  loopVelocity,
  sourceAngle,
  TWO_PI,
  type Cusp,
  type Image,
  type LoopParams,
  type Vec3,
} from './physics.ts';

type View = 'cone' | 'sky' | 'loop';

const DEG = Math.PI / 180;
const R_PAPER = 3.2;
const R_OBS = 2.2;
const NR = 28;
const NA = 120;
const NS = 160; // samples along each ray
const RIBBON_W = 0.045;
const LIFT = 0.014;
const GRID_STEP = 0.4;
const GRID_DS = 0.04;
const SKY_Z = -20;
const STRING_Z = -8;
const SKY_K = 10; // scene units per radian of (exaggerated) sky angle
const N_GAL = 96;
const LOOP_R = 2;
const LOOP_N = 360;
const LOOP_RATE = 1.15; // loop time units per second

const CAMS: Record<View, { pos: [number, number, number]; target: [number, number, number] }> = {
  cone: { pos: [1.7, 5.3, 5.8], target: [0, -0.7, -0.6] },
  sky: { pos: [0, 0, 8], target: [0, 0, -20] },
  loop: { pos: [0, 1.6, 7.6], target: [0, 0, 0] },
};

/** Exaggerated deficit shown in the scene: monotone in Gμ, but not to scale. */
const visDeficit = (lg: number) => (10 + 12 * (lg + 10)) * DEG;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small procedural galaxy images: 0 elliptical, 1 face-on spiral, 2 edge-on disk, 3 irregular. */
function galaxyTexture(kind: number, seed: number): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.translate(S / 2, S / 2);
  const blob = (x: number, y: number, r: number, col: string, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', String(a)));
    gr.addColorStop(1, col.replace('A', '0'));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TWO_PI);
    g.fill();
  };
  if (kind === 0) {
    g.scale(1, 0.7);
    blob(0, 0, 60, 'rgba(255,214,170,A)', 0.55);
    blob(0, 0, 22, 'rgba(255,236,210,A)', 1);
  } else if (kind === 1) {
    blob(0, 0, 58, 'rgba(150,180,255,A)', 0.25);
    for (let arm = 0; arm < 2; arm++) {
      for (let k = 0; k < 70; k++) {
        const th = arm * Math.PI + k * 0.075;
        const r = 4 + k * 0.72;
        const x = r * Math.cos(th + 0.25 * rnd());
        const y = r * Math.sin(th + 0.25 * rnd());
        blob(x, y, 7 + 4 * rnd(), k % 9 === 0 ? 'rgba(255,170,220,A)' : 'rgba(170,205,255,A)', 0.5);
      }
    }
    blob(0, 0, 16, 'rgba(255,230,190,A)', 1);
  } else if (kind === 2) {
    g.scale(1, 0.18);
    blob(0, 0, 62, 'rgba(190,210,255,A)', 0.8);
    blob(0, 0, 24, 'rgba(255,230,200,A)', 1);
  } else {
    for (let k = 0; k < 14; k++) blob((rnd() - 0.5) * 60, (rnd() - 0.5) * 50, 10 + 14 * rnd(), 'rgba(170,215,255,A)', 0.55);
    blob(0, 0, 12, 'rgba(230,240,255,A)', 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  let view: View = 'cone';
  let lgGmu = -8;
  let v = 0.3;
  let srcS = 1.6;
  let distRatio = 0.85;
  let fold = 0;
  let playing = true;
  let foldAuto = true;
  let alpha = 0.5;
  let tiltDeg = 90;

  const stage = createStage(viewport, { camera: CAMS.cone.pos, target: CAMS.cone.target, fov: 45, near: 0.05, far: 200 });
  const { scene, camera, controls, renderer } = stage;
  renderer.localClippingEnabled = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 20;

  const glowTex = glowTexture();
  const disposables: { dispose(): void }[] = [glowTex];

  // =====================================================================
  // View 1: cut-and-glue cone
  const coneGroup = new THREE.Group();
  coneGroup.position.y = 0.55;
  scene.add(coneGroup);

  const e: Vec3 = { x: 0, y: 0, z: 0 };
  /** Paper polar coords → scene position (paper +x toward the camera, height = scene y). */
  function embed(r: number, phi: number, c: number, arr: Float32Array | number[], o: number, lift = 0): void {
    coneEmbed(r, phi, c, e);
    arr[o] = e.y;
    arr[o + 1] = e.z + lift;
    arr[o + 2] = e.x;
  }

  let delta = visDeficit(lgGmu);
  let hi = Math.PI - delta / 2;

  // Sector meshes: paper, and two thin "double-image zone" sectors along the glued edges.
  interface Sector { mesh: THREE.Mesh; pos: Float32Array; a0: () => number; a1: () => number; lift: number; nr: number; na: number }
  function makeSector(nr: number, na: number, mat: THREE.Material, a0: () => number, a1: () => number, lift: number): Sector {
    const pos = new Float32Array((nr + 1) * (na + 1) * 3);
    const idx: number[] = [];
    for (let i = 0; i < nr; i++) {
      for (let j = 0; j < na; j++) {
        const A = i * (na + 1) + j;
        const B = A + na + 1;
        idx.push(A, B, A + 1, B, B + 1, A + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    coneGroup.add(mesh);
    return { mesh, pos, a0, a1, lift, nr, na };
  }
  function updateSector(sec: Sector, c: number): void {
    const a0 = sec.a0();
    const a1 = sec.a1();
    let o = 0;
    for (let i = 0; i <= sec.nr; i++) {
      const r = (R_PAPER * i) / sec.nr;
      for (let j = 0; j <= sec.na; j++) {
        embed(r, a0 + ((a1 - a0) * j) / sec.na, c, sec.pos, o, sec.lift);
        o += 3;
      }
    }
    const g = sec.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xc4bca8, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const paper = makeSector(NR, NA, paperMat, () => -hi, () => hi, 0);
  const zoneMat = new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const zoneUp = makeSector(NR, 6, zoneMat, () => Math.PI - delta, () => hi, 0.004);
  const zoneDn = makeSector(NR, 6, zoneMat, () => -hi, () => -Math.PI + delta, 0.004);

  // Glue edges (amber) and paper rim.
  const edgePos = new Float32Array(4 * 3);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3).setUsage(THREE.DynamicDrawUsage));
  const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  edges.frustumCulled = false;
  coneGroup.add(edges);
  const RIM_N = 160;
  const rimPos = new Float32Array((RIM_N + 1) * 3);
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rim = new THREE.Line(rimGeo, new THREE.LineBasicMaterial({ color: 0x8a8475 }));
  rim.frustumCulled = false;
  coneGroup.add(rim);

  // Missing wedge outline, shown on the flat paper.
  const wedgeGeo = new THREE.BufferGeometry();
  const wedgePos = new Float32Array(42 * 3);
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(wedgePos, 3).setUsage(THREE.DynamicDrawUsage));
  const wedgeMat = new THREE.LineDashedMaterial({ color: PALETTE.amber, dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: 0.8 });
  const wedge = new THREE.Line(wedgeGeo, wedgeMat);
  wedge.frustumCulled = false;
  coneGroup.add(wedge);

  // Cartesian grid drawn on the paper, stored as paper (r, φ) pairs so folding can remap it.
  const MAX_GRID = 7000;
  const gridPolar = new Float32Array(MAX_GRID * 4);
  const gridPos = new Float32Array(MAX_GRID * 6);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(gridPos, 3).setUsage(THREE.DynamicDrawUsage));
  const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x9c9482, transparent: true, opacity: 0.55 }));
  gridLines.frustumCulled = false;
  coneGroup.add(gridLines);
  let gridCount = 0;
  function rebuildGridPolar(): void {
    gridCount = 0;
    const inPaper = (x: number, y: number) => Math.hypot(x, y) < R_PAPER && Math.abs(Math.atan2(y, x)) < hi;
    for (let dir = 0; dir < 2; dir++) {
      for (let k = -8; k <= 8; k++) {
        const q = k * GRID_STEP;
        for (let p = -R_PAPER; p < R_PAPER; p += GRID_DS) {
          const x1 = dir ? q : p, y1 = dir ? p : q;
          const x2 = dir ? q : p + GRID_DS, y2 = dir ? p + GRID_DS : q;
          if (!inPaper(x1, y1) || !inPaper(x2, y2) || gridCount >= MAX_GRID) continue;
          const o = gridCount * 4;
          gridPolar[o] = Math.hypot(x1, y1);
          gridPolar[o + 1] = Math.atan2(y1, x1);
          gridPolar[o + 2] = Math.hypot(x2, y2);
          gridPolar[o + 3] = Math.atan2(y2, x2);
          gridCount++;
        }
      }
    }
    gridGeo.setDrawRange(0, gridCount * 2);
  }

  // Light rays as ribbons lying on the paper. Up to two images.
  interface Ray { mesh: THREE.Mesh; pos: Float32Array; polar: Float32Array; ok: Uint8Array; center: Float32Array }
  function makeRay(color: number): Ray {
    const pos = new Float32Array(NS * 6 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    coneGroup.add(mesh);
    // polar: for each sample, (r, φ) of centre, +offset, −offset
    return { mesh, pos, polar: new Float32Array((NS + 1) * 6), ok: new Uint8Array(NS), center: new Float32Array((NS + 1) * 3) };
  }
  const rays = [makeRay(PALETTE.cyan), makeRay(PALETTE.rose)];
  let imgs: Image[] = [];
  let rS = distRatio * R_OBS;
  let phiS = sourceAngle(delta, srcS);

  const P = () => TWO_PI - delta;
  function wrapIdx(theta: number): number {
    let m = 0;
    let a = theta;
    while (a > hi) { a -= P(); m--; }
    while (a <= -hi) { a += P(); m++; }
    return m;
  }

  function rebuildRayPolar(): void {
    imgs = images(delta, R_OBS, rS, phiS);
    // Direct path first (k = 0), the one around the other side second.
    imgs.sort((a, b) => Math.abs(a.k) - Math.abs(b.k));
    for (let q = 0; q < 2; q++) {
      const ray = rays[q];
      const im = imgs[q];
      ray.mesh.visible = !!im;
      if (!im) continue;
      const dx = im.sx - R_OBS;
      const dy = im.sy;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const mIdx = new Int8Array(NS + 1);
      for (let i = 0; i <= NS; i++) {
        const u = i / NS;
        const cx = R_OBS + dx * u;
        const cy = dy * u;
        let m = 0;
        for (let s = 0; s < 3; s++) {
          const x = cx + (s === 0 ? 0 : s === 1 ? 1 : -1) * nx * RIBBON_W;
          const y = cy + (s === 0 ? 0 : s === 1 ? 1 : -1) * ny * RIBBON_W;
          const th = Math.atan2(y, x);
          const mm = wrapIdx(th);
          if (s === 0) m = mm;
          else if (mm !== m) m = 99;
          ray.polar[i * 6 + s * 2] = Math.hypot(x, y);
          ray.polar[i * 6 + s * 2 + 1] = th + mm * P();
        }
        mIdx[i] = m;
      }
      for (let i = 0; i < NS; i++) ray.ok[i] = mIdx[i] === mIdx[i + 1] && mIdx[i] !== 99 ? 1 : 0;
    }
  }

  function updateRays(c: number): void {
    for (let q = 0; q < 2; q++) {
      const ray = rays[q];
      if (!ray.mesh.visible) continue;
      const pl = ray.polar;
      for (let i = 0; i <= NS; i++) embed(pl[i * 6], pl[i * 6 + 1], c, ray.center, i * 3, LIFT);
      const pos = ray.pos;
      const tmp = scratchQuad;
      for (let i = 0; i < NS; i++) {
        const o = i * 18;
        if (!ray.ok[i]) {
          pos.fill(0, o, o + 18);
          continue;
        }
        embed(pl[i * 6 + 2], pl[i * 6 + 3], c, tmp, 0, LIFT);
        embed(pl[i * 6 + 4], pl[i * 6 + 5], c, tmp, 3, LIFT);
        embed(pl[i * 6 + 8], pl[i * 6 + 9], c, tmp, 6, LIFT);
        embed(pl[i * 6 + 10], pl[i * 6 + 11], c, tmp, 9, LIFT);
        // A+ A− B+ | A− B− B+
        for (let k = 0; k < 6; k++) {
          pos[o + k * 3] = tmp[order[k] * 3];
          pos[o + k * 3 + 1] = tmp[order[k] * 3 + 1];
          pos[o + k * 3 + 2] = tmp[order[k] * 3 + 2];
        }
      }
      (ray.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
  const scratchQuad = new Float32Array(12);
  const order = [0, 1, 2, 1, 3, 2];

  // Ghost copy of the source in the missing wedge, and the straight sight line to it (flat paper only).
  const ghostLineGeo = new THREE.BufferGeometry();
  const ghostLinePos = new Float32Array(6);
  ghostLineGeo.setAttribute('position', new THREE.BufferAttribute(ghostLinePos, 3).setUsage(THREE.DynamicDrawUsage));
  const ghostMat = new THREE.LineDashedMaterial({ color: PALETTE.rose, dashSize: 0.1, gapSize: 0.07, transparent: true, opacity: 0.9 });
  const ghostLine = new THREE.Line(ghostLineGeo, ghostMat);
  ghostLine.frustumCulled = false;
  coneGroup.add(ghostLine);
  const ghostSrc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.rose, transparent: true, depthWrite: false, opacity: 0.7 }));
  ghostSrc.scale.setScalar(0.45);
  coneGroup.add(ghostSrc);

  // Markers
  const obsMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333 }));
  coneGroup.add(obsMesh);
  const srcSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE.amber, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  srcSprite.scale.setScalar(0.6);
  coneGroup.add(srcSprite);
  const srcCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.amber }));
  coneGroup.add(srcCore);
  const coneString = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.9, 10), new THREE.MeshBasicMaterial({ color: 0xe8f6ff }));
  coneString.position.y = 0.35;
  coneGroup.add(coneString);
  const coneGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 16, 1, true), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  coneGlow.position.y = 0.35;
  coneGroup.add(coneGlow);

  const coneLabels: Record<string, CSS2DObject> = {
    obs: stage.label('observer', [0, 0, 0], '', coneGroup),
    src: stage.label('source', [0, 0, 0], '', coneGroup),
    str: stage.label('string (perpendicular to paper)', [0, 1.5, 0], 'muted', coneGroup),
    glue: stage.label('', [0, 0, 0], 'muted', coneGroup),
    ghost: stage.label('ghost: where B seems to come from', [0, 0, 0], 'muted', coneGroup),
    a: stage.label('A', [0, 0, 0], '', coneGroup),
    b: stage.label('B', [0, 0, 0], '', coneGroup),
  };
  coneLabels.a.element.style.color = css(PALETTE.cyan);
  coneLabels.b.element.style.color = css(PALETTE.rose);

  // Photons travelling from source to observer along each ray.
  const photonPos = new Float32Array(6 * 3);
  const photonCol = new Float32Array(6 * 3);
  const photonGeo = new THREE.BufferGeometry();
  photonGeo.setAttribute('position', new THREE.BufferAttribute(photonPos, 3).setUsage(THREE.DynamicDrawUsage));
  photonGeo.setAttribute('color', new THREE.BufferAttribute(photonCol, 3));
  const photons = new THREE.Points(photonGeo, new THREE.PointsMaterial({ size: 0.22, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  photons.frustumCulled = false;
  photons.renderOrder = 4;
  coneGroup.add(photons);
  const cA = new THREE.Color(PALETTE.cyan);
  const cB = new THREE.Color(PALETTE.rose);
  for (let i = 0; i < 6; i++) {
    const cc = i < 3 ? cA : cB;
    photonCol[i * 3] = cc.r; photonCol[i * 3 + 1] = cc.g; photonCol[i * 3 + 2] = cc.b;
  }

  let isoErr = 0;
  const tmp3 = [0, 0, 0];
  function updateCone(): void {
    const c = foldFactor(delta, fold);
    updateSector(paper, c);
    updateSector(zoneUp, c);
    updateSector(zoneDn, c);
    // edges
    embed(0, hi, c, edgePos, 0, 0.006);
    embed(R_PAPER, hi, c, edgePos, 3, 0.006);
    embed(0, -hi, c, edgePos, 6, 0.006);
    embed(R_PAPER, -hi, c, edgePos, 9, 0.006);
    (edgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let j = 0; j <= RIM_N; j++) embed(R_PAPER, -hi + (2 * hi * j) / RIM_N, c, rimPos, j * 3, 0.003);
    (rimGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (let k = 0; k < gridCount; k++) {
      embed(gridPolar[k * 4], gridPolar[k * 4 + 1], c, gridPos, k * 6, 0.004);
      embed(gridPolar[k * 4 + 2], gridPolar[k * 4 + 3], c, gridPos, k * 6 + 3, 0.004);
    }
    (gridGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    updateRays(c);

    // Isometry check: 3D length of the direct ray versus its straight length on the paper.
    if (rays[0].mesh.visible && imgs[0]) {
      const cc = rays[0].center;
      let L = 0;
      for (let i = 1; i <= NS; i++) L += Math.hypot(cc[i * 3] - cc[i * 3 - 3], cc[i * 3 + 1] - cc[i * 3 - 2], cc[i * 3 + 2] - cc[i * 3 - 1]);
      isoErr = Math.abs(L / imgs[0].length - 1);
    }

    // Markers
    embed(R_OBS, 0, c, tmp3, 0, 0.09);
    obsMesh.position.fromArray(tmp3);
    coneLabels.obs.position.set(tmp3[0], tmp3[1] + 0.28, tmp3[2] + 0.1);
    embed(rS, phiS, c, tmp3, 0, 0.08);
    srcSprite.position.fromArray(tmp3);
    srcCore.position.fromArray(tmp3);
    coneLabels.src.position.set(tmp3[0], tmp3[1] + 0.32, tmp3[2]);
    embed(R_PAPER * 1.04, hi, c, tmp3, 0, 0.05);
    coneLabels.glue.position.fromArray(tmp3);
    coneLabels.glue.element.textContent = fold < 0.5 ? 'glue edge' : '';

    // Image labels a little way along each ray from the observer
    for (let q = 0; q < 2; q++) {
      const lab = q === 0 ? coneLabels.a : coneLabels.b;
      const ray = rays[q];
      lab.visible = ray.mesh.visible;
      if (!ray.mesh.visible) continue;
      const i = Math.round(NS * 0.8);
      lab.position.set(ray.center[i * 3], ray.center[i * 3 + 1] + 0.2, ray.center[i * 3 + 2]);
    }

    // Ghost: only meaningful on the flat paper, fades while folding.
    const second = imgs.find((im) => im.k !== 0);
    const ga = Math.max(0, 1 - fold * 3);
    ghostLine.visible = ghostSrc.visible = coneLabels.ghost.visible = !!second && ga > 0.01;
    wedge.visible = ga > 0.01;
    wedgeMat.opacity = 0.8 * ga;
    if (second && ga > 0.01) {
      ghostLinePos[0] = 0; ghostLinePos[1] = LIFT * 2; ghostLinePos[2] = R_OBS;
      ghostLinePos[3] = second.sy; ghostLinePos[4] = LIFT * 2; ghostLinePos[5] = second.sx;
      (ghostLineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      ghostLine.computeLineDistances();
      ghostMat.opacity = 0.9 * ga;
      (ghostSrc.material as THREE.SpriteMaterial).opacity = 0.8 * ga;
      ghostSrc.position.set(second.sy, 0.06, second.sx);
      coneLabels.ghost.position.set(second.sy * 1.2 - 0.9, 0.05, second.sx * 1.2);
    }
    if (wedge.visible) {
      // Outline of the removed wedge on the flat plane: apex → rim arc → apex.
      wedgePos[0] = 0; wedgePos[1] = 0.01; wedgePos[2] = 0;
      for (let j = 0; j <= 39; j++) {
        const a = hi + ((TWO_PI - 2 * hi) * j) / 39;
        wedgePos[3 + j * 3] = R_PAPER * Math.sin(a);
        wedgePos[4 + j * 3] = 0.01;
        wedgePos[5 + j * 3] = R_PAPER * Math.cos(a);
      }
      wedgePos[123] = 0; wedgePos[124] = 0.01; wedgePos[125] = 0;
      (wedgeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      wedge.computeLineDistances();
    }
  }

  let photonU = 0;
  function updatePhotons(): void {
    const c = foldFactor(delta, fold);
    for (let q = 0; q < 2; q++) {
      const im = imgs[q];
      for (let j = 0; j < 3; j++) {
        const o = (q * 3 + j) * 3;
        if (!im) { photonPos[o] = 1e4; photonPos[o + 1] = 0; photonPos[o + 2] = 0; continue; }
        const u = (photonU + j / 3) % 1;
        const x = im.sx + (R_OBS - im.sx) * u;
        const y = im.sy - im.sy * u;
        const th = Math.atan2(y, x);
        embed(Math.hypot(x, y), th + wrapIdx(th) * P(), c, photonPos, o, LIFT * 3);
      }
    }
    (photonGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  function rebuildCone(): void {
    delta = visDeficit(lgGmu);
    hi = Math.PI - delta / 2;
    rS = distRatio * R_OBS;
    phiS = sourceAngle(delta, srcS);
    rebuildGridPolar();
    rebuildRayPolar();
    updateCone();
    updatePhotons();
  }

  // =====================================================================
  // View 2: the sky behind a straight string
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);
  const clipR = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
  const clipL = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)];
  const galTex = [0, 1, 2, 3].map((k) => galaxyTexture(k, 11 + k * 97));
  disposables.push(...galTex);
  const galMat = (k: number, side: 0 | 1, color = 0xffffff) =>
    new THREE.MeshBasicMaterial({ map: galTex[k], color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, clippingPlanes: side ? clipL : clipR });
  const matsR = galTex.map((_, k) => galMat(k, 0));
  const matsL = galTex.map((_, k) => galMat(k, 1));
  const quad = new THREE.PlaneGeometry(1, 1);

  interface Gal { x: number; y: number; f: number; size: number; right: THREE.Mesh; left: THREE.Mesh }
  const gals: Gal[] = [];
  let gs = 12345;
  const grnd = () => ((gs = (gs * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N_GAL; i++) {
    const kind = Math.floor(grnd() * 4);
    const size = 0.5 + 1.1 * grnd() ** 2;
    const rot = grnd() * TWO_PI;
    const g: Gal = {
      x: (grnd() * 2 - 1) * 17,
      y: (grnd() * 2 - 1) * 10.5,
      f: 0.35 + 0.55 * grnd(),
      size,
      right: new THREE.Mesh(quad, matsR[kind]),
      left: new THREE.Mesh(quad, matsL[kind]),
    };
    // Keep a clear lane for the highlighted source.
    if (Math.abs(g.y - 2.5) < 1.6) g.y += g.y > 2.5 ? 1.6 : -1.6;
    for (const m of [g.right, g.left]) {
      m.scale.setScalar(size);
      m.rotation.z = rot;
      m.position.z = SKY_Z;
      skyGroup.add(m);
    }
    gals.push(g);
  }
  const srcMatR = galMat(1, 0, 0xffd08a);
  const srcMatL = galMat(1, 1, 0xffd08a);
  const srcGal = { right: new THREE.Mesh(quad, srcMatR), left: new THREE.Mesh(quad, srcMatL) };
  for (const m of [srcGal.right, srcGal.left]) {
    m.scale.setScalar(2.1);
    m.rotation.z = 0.5;
    m.position.set(0, 2.5, SKY_Z + 0.1);
    skyGroup.add(m);
  }
  const srcLabR = stage.label('source image', [0, 0, 0], '', skyGroup);
  const srcLabL = stage.label('second image', [0, 0, 0], '', skyGroup);

  // Band edges for the source's distance.
  const bandGeo = new THREE.BufferGeometry();
  const bandPos = new Float32Array(12);
  bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPos, 3).setUsage(THREE.DynamicDrawUsage));
  const band = new THREE.LineSegments(bandGeo, new THREE.LineDashedMaterial({ color: PALETTE.violet, dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.7 }));
  band.frustumCulled = false;
  skyGroup.add(band);
  const bandFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 30), new THREE.MeshBasicMaterial({ color: PALETTE.violet, transparent: true, opacity: 0.07, depthWrite: false }));
  bandFill.position.z = SKY_Z - 0.05;
  skyGroup.add(bandFill);
  stage.label('doubled strip (at the source distance)', [0, 9.6, SKY_Z], 'muted', skyGroup);

  const skyString = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 30, 10), new THREE.MeshBasicMaterial({ color: 0xf2fbff }));
  skyString.position.z = STRING_Z;
  skyGroup.add(skyString);
  const glowPlaneTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 4;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  disposables.push(glowPlaneTex);
  const skyGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 30), new THREE.MeshBasicMaterial({ map: glowPlaneTex, color: PALETTE.cyan, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  skyGlow.position.z = STRING_Z + 0.01;
  skyGroup.add(skyGlow);
  stage.label('cosmic string', [0, -1.6, STRING_Z], '', skyGroup);
  const velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -3.6, STRING_Z), 1, PALETTE.green, 0.25, 0.16);
  skyGroup.add(velArrow);
  const velLab = stage.label('', [0, -3.2, STRING_Z], '', skyGroup);
  velLab.element.style.color = css(PALETTE.green);

  let doubledCount = 0;
  function updateSky(): void {
    const half = (delta / 2) * SKY_K;
    doubledCount = 0;
    for (const g of gals) {
      const h = half * g.f;
      const rOk = g.x + h > 0;
      const lOk = g.x - h < 0;
      g.right.visible = rOk;
      g.left.visible = lOk;
      if (rOk) g.right.position.set(g.x + h, g.y, SKY_Z);
      if (lOk) g.left.position.set(g.x - h, g.y, SKY_Z);
      if (rOk && lOk) doubledCount++;
    }
    const fs = distRatio / (1 + distRatio);
    const hs = half * fs;
    const xs = srcS * hs;
    srcGal.right.visible = xs + hs > 0;
    srcGal.left.visible = xs - hs < 0;
    srcGal.right.position.x = xs + hs;
    srcGal.left.position.x = xs - hs;
    srcLabR.visible = srcGal.right.visible;
    srcLabL.visible = srcGal.left.visible;
    srcLabR.position.set(xs + hs, 4.0, SKY_Z);
    srcLabL.position.set(xs - hs, 4.0, SKY_Z);
    srcLabR.element.textContent = srcGal.left.visible ? 'image 1' : 'source';
    srcLabL.element.textContent = srcGal.right.visible ? 'image 2' : 'source';
    bandPos.set([hs, -12, SKY_Z, hs, 12, SKY_Z, -hs, -12, SKY_Z, -hs, 12, SKY_Z]);
    (bandGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    band.computeLineDistances();
    bandFill.scale.x = 2 * hs;
    velArrow.setLength(0.3 + 3 * v, 0.25, 0.16);
    velLab.element.textContent = `v = ${v.toFixed(2)}c`;
  }

  // =====================================================================
  // View 3: an oscillating Kibble–Turok loop
  const loopGroup = new THREE.Group();
  scene.add(loopGroup);
  const loopGrid = makeGrid(12, 24);
  loopGrid.position.y = -2.6;
  loopGroup.add(loopGrid);
  const lp: LoopParams = { L: TWO_PI * LOOP_R, alpha, phi: tiltDeg * DEG };
  const loopPos = new Float32Array((LOOP_N + 1) * 3);
  const loopCol = new Float32Array((LOOP_N + 1) * 3);
  const loopGeo = new THREE.BufferGeometry();
  loopGeo.setAttribute('position', new THREE.BufferAttribute(loopPos, 3).setUsage(THREE.DynamicDrawUsage));
  loopGeo.setAttribute('color', new THREE.BufferAttribute(loopCol, 3).setUsage(THREE.DynamicDrawUsage));
  const loopLine = new THREE.Line(loopGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  loopLine.frustumCulled = false;
  loopGroup.add(loopLine);
  const loopPts = new THREE.Points(loopGeo, new THREE.PointsMaterial({ size: 0.13, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  loopPts.frustumCulled = false;
  loopGroup.add(loopPts);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flash.visible = false;
  loopGroup.add(flash);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 3, 24, 1, true).translate(0, -1.5, 0).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.visible = false;
  loopGroup.add(beam);
  const cuspLab = stage.label('cusp: v → c, GW burst (schematic)', [0, 0, 0], '', loopGroup);
  cuspLab.element.style.color = css(PALETTE.amber);
  cuspLab.visible = false;

  let loopT = 0;
  let cusps: Cusp[] = [];
  let cuspCount = 0;
  let flashAge = 99;
  let vmax = 0;
  const lv: Vec3 = { x: 0, y: 0, z: 0 };
  const lx: Vec3 = { x: 0, y: 0, z: 0 };
  const colSlow = new THREE.Color(PALETTE.violet);
  const colMid = new THREE.Color(PALETTE.cyan);
  const colFast = new THREE.Color(0xffffff);
  const cTmp = new THREE.Color();
  const upY = new THREE.Vector3(0, 1, 0);
  const dirV = new THREE.Vector3();

  function rebuildLoop(): void {
    lp.alpha = alpha;
    lp.phi = tiltDeg * DEG;
    cusps = findCusps(lp, 200);
    drawSphere();
  }

  function updateLoop(): void {
    vmax = 0;
    for (let i = 0; i <= LOOP_N; i++) {
      const sg = (i / LOOP_N) * lp.L;
      loopPoint(sg, loopT, lp, lx);
      loopVelocity(sg, loopT, lp, lv);
      const sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp > vmax) vmax = sp;
      loopPos[i * 3] = lx.x;
      loopPos[i * 3 + 1] = lx.z;
      loopPos[i * 3 + 2] = lx.y;
      if (sp < 0.7) cTmp.copy(colSlow).lerp(colMid, sp / 0.7);
      else cTmp.copy(colMid).lerp(colFast, Math.min(1, (sp - 0.7) / 0.3) ** 2);
      loopCol[i * 3] = cTmp.r; loopCol[i * 3 + 1] = cTmp.g; loopCol[i * 3 + 2] = cTmp.b;
    }
    (loopGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (loopGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function stepLoop(dt: number): void {
    const half = lp.L / 2;
    const t0 = loopT;
    loopT += dt * LOOP_RATE;
    for (const c of cusps) {
      // Did a cusp time t_c + n·L/2 fall inside (t0, loopT]?
      const n = Math.ceil((t0 - c.t) / half);
      const tc = c.t + n * half;
      if (tc > t0 && tc <= loopT) {
        cuspCount++;
        flashAge = 0;
        loopPoint(c.sigma, c.t, lp, lx);
        loopVelocity(c.sigma, c.t, lp, lv);
        flash.position.set(lx.x, lx.z, lx.y);
        beam.position.copy(flash.position);
        dirV.set(lv.x, lv.z, lv.y).normalize();
        beam.quaternion.setFromUnitVectors(upY, dirV);
        cuspLab.position.set(lx.x, lx.z + 0.45, lx.y);
      }
    }
    if (loopT > 1e4 * half) loopT -= 1e4 * half;
  }

  // =====================================================================
  // Overlays
  const insetStyle = {
    position: 'absolute', right: '10px', top: '10px', background: 'rgba(7,10,18,0.78)', borderRadius: '10px',
    border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  };
  // Kaiser–Stebbins inset
  const KW = 440, KH = 300;
  const ks = document.createElement('canvas');
  ks.width = KW; ks.height = KH;
  Object.assign(ks.style, insetStyle, { width: `${KW / 2}px`, height: `${KH / 2}px` });
  viewport.appendChild(ks);
  const kctx = ks.getContext('2d')!;
  const MW = 132, MH = 54;
  const noise = new Float32Array(MW * MH);
  (() => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const waves: number[][] = [];
    for (let i = 0; i < 48; i++) {
      const k = 0.06 + 0.3 * r();
      const a = r() * TWO_PI;
      waves.push([k * Math.cos(a), k * Math.sin(a), r() * TWO_PI, 1 / Math.sqrt(k)]);
    }
    let ss = 0;
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        let t = 0;
        for (const w of waves) t += w[3] * Math.cos(w[0] * i + w[1] * j + w[2]);
        noise[j * MW + i] = t;
        ss += t * t;
      }
    }
    const rms = Math.sqrt(ss / (MW * MH));
    for (let i = 0; i < noise.length; i++) noise[i] *= 30 / rms; // ~30 μK rms, illustrative
  })();
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MW; mapCanvas.height = MH;
  const mctx = mapCanvas.getContext('2d')!;
  const mimg = mctx.createImageData(MW, MH);

  function drawKS(): void {
    const stepK = ksStep(Math.pow(10, lgGmu), v) * T_CMB * 1e6;
    for (let j = 0; j < MH; j++) {
      for (let i = 0; i < MW; i++) {
        const T = noise[j * MW + i] + (i < MW / 2 ? stepK / 2 : -stepK / 2);
        const q = Math.max(-1, Math.min(1, T / 100));
        const o = (j * MW + i) * 4;
        if (q >= 0) {
          mimg.data[o] = 28 + 212 * q; mimg.data[o + 1] = 30 + 70 * q; mimg.data[o + 2] = 44 + 10 * q;
        } else {
          mimg.data[o] = 28 + 12 * -q; mimg.data[o + 1] = 30 + 110 * -q; mimg.data[o + 2] = 44 + 190 * -q;
        }
        mimg.data[o + 3] = 255;
      }
    }
    mctx.putImageData(mimg, 0, 0);
    kctx.clearRect(0, 0, KW, KH);
    kctx.font = '600 20px JetBrains Mono, monospace';
    kctx.fillStyle = '#dfe6f3';
    kctx.fillText('CMB step across a moving string', 14, 28);
    const X0 = 14, Y0 = 40, W = KW - 28, Hm = 150;
    kctx.imageSmoothingEnabled = true;
    kctx.drawImage(mapCanvas, X0, Y0, W, Hm);
    kctx.strokeStyle = '#e8f6ff';
    kctx.lineWidth = 3;
    kctx.beginPath();
    kctx.moveTo(X0 + W / 2, Y0);
    kctx.lineTo(X0 + W / 2, Y0 + Hm);
    kctx.stroke();
    // velocity arrow
    kctx.strokeStyle = css(PALETTE.green);
    kctx.fillStyle = css(PALETTE.green);
    const ay = Y0 + Hm - 16;
    const al = 20 + 90 * v;
    kctx.beginPath();
    kctx.moveTo(X0 + W / 2, ay);
    kctx.lineTo(X0 + W / 2 + al, ay);
    kctx.stroke();
    kctx.beginPath();
    kctx.moveTo(X0 + W / 2 + al + 10, ay);
    kctx.lineTo(X0 + W / 2 + al, ay - 7);
    kctx.lineTo(X0 + W / 2 + al, ay + 7);
    kctx.fill();
    // Profile: column means
    const PY = Y0 + Hm + 12, PH = 70;
    kctx.strokeStyle = '#243049';
    kctx.lineWidth = 1;
    kctx.strokeRect(X0, PY, W, PH);
    const yOf = (T: number) => PY + PH / 2 - (T / 60) * (PH / 2);
    kctx.strokeStyle = css(PALETTE.cyan);
    kctx.lineWidth = 2.5;
    kctx.beginPath();
    for (let i = 0; i < MW; i++) {
      let m = 0;
      for (let j = 0; j < MH; j++) m += noise[j * MW + i];
      m = m / MH + (i < MW / 2 ? stepK / 2 : -stepK / 2);
      const x = X0 + (i / (MW - 1)) * W;
      const y = Math.max(PY, Math.min(PY + PH, yOf(m)));
      if (i === 0) kctx.moveTo(x, y); else kctx.lineTo(x, y);
    }
    kctx.stroke();
    kctx.strokeStyle = css(PALETTE.amber);
    kctx.setLineDash([6, 5]);
    kctx.beginPath();
    const ys1 = Math.max(PY, yOf(Math.min(60, stepK / 2)));
    const ys2 = Math.min(PY + PH, yOf(Math.max(-60, -stepK / 2)));
    kctx.moveTo(X0, ys1); kctx.lineTo(X0 + W / 2, ys1); kctx.lineTo(X0 + W / 2, ys2); kctx.lineTo(X0 + W, ys2);
    kctx.stroke();
    kctx.setLineDash([]);
    kctx.font = '17px JetBrains Mono, monospace';
    kctx.fillStyle = css(PALETTE.amber);
    kctx.fillText(`step ΔT = ${stepK < 0.1 ? stepK.toFixed(3) : stepK.toFixed(1)} μK`, X0 + 6, PY + 20);
    kctx.fillStyle = '#8391ab';
    kctx.fillText('to scale vs ~30 μK noise', X0 + 6, PY + PH - 8);
  }

  // Kibble–Turok sphere inset
  const SW = 400;
  const sph = document.createElement('canvas');
  sph.width = SW; sph.height = SW;
  Object.assign(sph.style, insetStyle, { width: `${SW / 2}px`, height: `${SW / 2}px` });
  viewport.appendChild(sph);
  const sctx = sph.getContext('2d')!;
  function drawSphere(): void {
    const cx = SW / 2, cy = SW / 2 + 14, R = 140;
    sctx.clearRect(0, 0, SW, SW);
    sctx.font = '600 19px JetBrains Mono, monospace';
    sctx.fillStyle = '#dfe6f3';
    sctx.fillText("unit sphere: a′ and −b′", 12, 26);
    sctx.strokeStyle = '#2c3852';
    sctx.lineWidth = 2;
    sctx.beginPath();
    sctx.arc(cx, cy, R, 0, TWO_PI);
    sctx.stroke();
    const tilt = 0.45, yaw = 0.6;
    const proj = (p: Vec3): [number, number, number] => {
      const x1 = p.x * Math.cos(yaw) - p.y * Math.sin(yaw);
      const y1 = p.x * Math.sin(yaw) + p.y * Math.cos(yaw);
      const z1 = p.z;
      const y2 = y1 * Math.cos(tilt) - z1 * Math.sin(tilt);
      const z2 = y1 * Math.sin(tilt) + z1 * Math.cos(tilt);
      return [cx + R * x1, cy - R * z2, y2];
    };
    const q: Vec3 = { x: 0, y: 0, z: 0 };
    const curve = (fn: (u: number) => void, color: string) => {
      for (let i = 0; i < 240; i++) {
        fn((i / 240) * lp.L);
        const [x, y, d] = proj(q);
        sctx.fillStyle = color;
        sctx.globalAlpha = d < 0 ? 1 : 0.35;
        sctx.beginPath();
        sctx.arc(x, y, 2.6, 0, TWO_PI);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
    };
    curve((u) => aPrime(u, lp, q), css(PALETTE.cyan));
    curve((u) => { bPrime(u, lp, q); q.x = -q.x; q.y = -q.y; q.z = -q.z; }, css(PALETTE.rose));
    for (const c of cusps) {
      aPrime(c.sigma - c.t, lp, q);
      const [x, y] = proj(q);
      sctx.strokeStyle = '#ffffff';
      sctx.lineWidth = 3;
      sctx.beginPath();
      sctx.arc(x, y, 9, 0, TWO_PI);
      sctx.stroke();
    }
    sctx.font = '16px JetBrains Mono, monospace';
    sctx.fillStyle = css(PALETTE.cyan);
    sctx.fillText("a′", 14, SW - 14);
    sctx.fillStyle = css(PALETTE.rose);
    sctx.fillText("−b′", 54, SW - 14);
    sctx.fillStyle = '#ffffff';
    sctx.fillText(`○ crossing = cusp (${cusps.length})`, 112, SW - 14);
  }

  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', bottom: '34px', zIndex: '2', pointerEvents: 'none', maxWidth: '250px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);
  const sw = (c: number) => `<i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${css(c)}"></i>`;
  function paintLegend(): void {
    const ex = `<div style="margin-top:4px;color:${css(PALETTE.amber)}">Angles exaggerated about ×${fmtExp(visDeficit(lgGmu) / deficitAngle(Math.pow(10, lgGmu)))}</div>`;
    if (view === 'cone') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Cut out a wedge Δ, glue the edges</div>
<div>${sw(PALETTE.cyan)}ray A, straight on the paper</div>
<div>${sw(PALETTE.rose)}ray B, around the other side</div>
<div>${sw(PALETTE.violet)}zone where sources look double</div>
<div>${sw(PALETTE.amber)}edges that get glued</div>${ex}`;
    } else if (view === 'sky') {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">The observer's sky</div>
<div>Galaxies in the strip behind the string appear twice. Images are identical, unstretched, and cut sharply by the string.</div>
<div style="margin-top:3px">${sw(PALETTE.violet)}strip width Δ·D<sub>ls</sub>/D<sub>s</sub></div>${ex}`;
    } else {
      legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Kibble–Turok loop, x = ½[a(σ−t) + b(σ+t)]</div>
<div>Colour = local speed: ${sw(PALETTE.violet)}slow ${sw(PALETTE.cyan)}fast ${sw(0xffffff)}near c</div>
<div>Period L/2. Not to scale in time. No radiation back-reaction.</div>`;
    }
  }
  const fmtExp = (x: number) => {
    const e10 = Math.floor(Math.log10(x));
    return `${(x / Math.pow(10, e10)).toFixed(1)}·10${String(e10).replace(/./g, (ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(ch)] ?? ch)}`;
  };

  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none',
    background: 'rgba(80,16,20,0.9)', border: `1px solid ${css(PALETTE.red)}`, color: '#ffd6d6', borderRadius: '10px',
    padding: '6px 12px', font: '600 12px/1.4 JetBrains Mono, monospace', display: 'none', maxWidth: '40%',
  } as CSSStyleDeclaration);
  banner.textContent = 'Gμ is above the Planck CMB limit (1.5×10⁻⁷). Strings this heavy are ruled out.';
  viewport.appendChild(banner);

  // =====================================================================
  // View switching
  function applyView(fly: boolean): void {
    coneGroup.visible = view === 'cone';
    skyGroup.visible = view === 'sky';
    loopGroup.visible = view === 'loop';
    ks.style.display = view === 'loop' ? 'none' : '';
    sph.style.display = view === 'loop' ? '' : 'none';
    controls.enabled = view !== 'sky';
    scene.background = new THREE.Color(view === 'sky' ? 0x03050a : PALETTE.bg);
    paintLegend();
    const cam = CAMS[view];
    if (fly) stage.flyTo(cam.pos, cam.target, 1.1);
    else {
      camera.position.set(...cam.pos);
      controls.target.set(...cam.target);
    }
  }

  // =====================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Show', value: view,
    options: [{ value: 'cone', label: 'Cone' }, { value: 'sky', label: 'Sky' }, { value: 'loop', label: 'Loop' }],
    onChange: (x) => { view = x; applyView(true); },
  });
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => setPlaying(!playing) },
    { label: 'Replay fold', onClick: () => { foldClock = 0; foldAuto = true; setPlaying(true); } },
  ]);
  function setPlaying(p: boolean): void {
    playing = p;
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }

  ui.section('String');
  ui.slider({
    key: 'gmu', label: 'Tension Gμ/c² (real value)', min: -10, max: -5, step: 0.05, value: lgGmu,
    format: (x) => `${Math.pow(10, x).toExponential(1)}`,
    onInput: (x) => { lgGmu = x; rebuildCone(); updateSky(); drawKS(); paintLegend(); },
  });
  ui.note(`Real limit: Gμ/c² &lt; 1.5×10⁻⁷ (Planck CMB). The scene angle is <b>exaggerated</b> by a factor of 10⁵ to 10⁹ so you can see it.`);
  ui.slider({ key: 'v', label: 'String speed v', min: 0, max: 0.99, step: 0.01, value: v, unit: 'c', format: (x) => x.toFixed(2), onInput: (x) => { v = x; updateSky(); drawKS(); } });

  ui.section('Lensing geometry');
  ui.slider({
    key: 'src', label: 'Source offset (units of Δ/2)', min: -3, max: 3, step: 0.05, value: srcS, format: (x) => x.toFixed(2),
    onInput: (x) => { srcS = x; rebuildCone(); updateSky(); },
  });
  ui.slider({
    key: 'dist', label: 'Source distance behind string D_ls/D_l', min: 0.3, max: 1.4, step: 0.01, value: distRatio, format: (x) => x.toFixed(2),
    onInput: (x) => { distRatio = x; rebuildCone(); updateSky(); },
  });
  const foldCtl = ui.slider({
    key: 'fold', label: 'Fold paper into cone', min: 0, max: 1, step: 0.01, value: fold, format: (x) => `${Math.round(x * 100)}%`,
    onInput: (x) => { fold = x; foldAuto = false; updateCone(); updatePhotons(); },
  });

  ui.section('Loop');
  ui.slider({ key: 'alpha', label: 'Loop shape α', min: 0.05, max: 0.95, step: 0.01, value: alpha, onInput: (x) => { alpha = x; rebuildLoop(); updateLoop(); } });
  ui.slider({ key: 'tilt', label: 'Loop tilt φ', min: 10, max: 170, step: 1, value: tiltDeg, unit: '°', onInput: (x) => { tiltDeg = x; rebuildLoop(); updateLoop(); } });

  ui.section('Readouts');
  const rDef = ui.readout('deficit', 'deficit Δ (real)');
  const rDefS = ui.readout('deficitScene', 'Δ drawn (exaggerated)');
  const rSep = ui.readout('sep', 'image separation (real)');
  const rImg = ui.readout('images', 'images of source');
  const rKs = ui.readout('ks', 'Kaiser–Stebbins δT/T');
  const rKsK = ui.readout('ksK', 'step ΔT');
  const rCmb = ui.readout('cmb', 'CMB limit');
  const rIso = ui.readout('iso', 'ray length, cone vs paper');
  ui.section('Loop readouts');
  const rVmax = ui.readout('vmax', 'fastest point', 'c');
  const rCusps = ui.readout('cusps', 'cusps seen');
  const rPer = ui.readout('period', 'period L/2');
  const rDoub = ui.readout('doubled', 'doubled galaxies (sky)');

  const fmtAngle = (rad: number) => {
    const as = rad / ARCSEC;
    if (as >= 0.1) return `${as.toFixed(2)}″`;
    if (as >= 1e-4) return `${(as * 1000).toFixed(as >= 1e-2 ? 1 : 3)} mas`;
    return `${rad.toExponential(1)} rad`;
  };
  const gmu = () => Math.pow(10, lgGmu);
  const realSep = () => {
    const d = deficitAngle(gmu());
    const im = images(d, 1, distRatio, sourceAngle(d, srcS));
    return im.length < 2 ? 0 : Math.abs(im[0].dir - im[1].dir);
  };
  const ksMicroK = () => ksStep(gmu(), v) * T_CMB * 1e6;

  function updateReadouts(): void {
    const d = deficitAngle(gmu());
    rDef(fmtAngle(d));
    rDefS(`${(delta / DEG).toFixed(1)}°`);
    const s = realSep();
    rSep(s > 0 ? fmtAngle(s) : 'single image');
    rImg(String(imgs.length));
    rKs(ksStep(gmu(), v).toExponential(2));
    const k = ksMicroK();
    rKsK(`${k < 0.1 ? k.toFixed(3) : k.toFixed(2)} μK`);
    rCmb(gmu() > GMU_CMB ? 'EXCEEDED' : 'allowed');
    rIso(isoErr.toExponential(0));
    rVmax(vmax.toFixed(3));
    rCusps(String(cuspCount));
    rPer(`${(lp.L / 2).toFixed(2)} (L = ${lp.L.toFixed(2)})`);
    rDoub(String(doubledCount));
    banner.style.display = gmu() > GMU_CMB ? '' : 'none';
  }

  // =====================================================================
  // Frame loop
  let foldClock = 0;
  const FOLD_CYCLE = 9;
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  let readoutTimer = 1;
  let foldUiTimer = 0;
  stage.onFrame((dt) => {
    if (playing) {
      if (view === 'cone') {
        if (foldAuto) foldClock = (foldClock + dt) % FOLD_CYCLE;
        const f = foldClock;
        const nf = !foldAuto ? fold : f < 1.5 ? 0 : f < 4 ? ease((f - 1.5) / 2.5) : f < 7.5 ? 1 : 1 - ease((f - 7.5) / 1.5);
        if (nf !== fold) {
          fold = nf;
          updateCone();
          foldUiTimer += dt;
          if (foldUiTimer > 0.1) { foldUiTimer = 0; foldCtl.set(fold, false); }
        }
        photonU = (photonU + dt * 0.28) % 1;
        updatePhotons();
      } else if (view === 'loop') {
        stepLoop(dt);
        updateLoop();
      }
    }
    if (view === 'loop') {
      flashAge += dt;
      const on = flashAge < 1.2;
      flash.visible = beam.visible = cuspLab.visible = on;
      if (on) {
        const a = 1 - flashAge / 1.2;
        flash.scale.setScalar(0.4 + 1.6 * a);
        (flash.material as THREE.SpriteMaterial).opacity = a;
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.45 * a;
        beam.scale.set(1, 0.3 + 0.9 * (1 - a), 1);
      }
    }
    readoutTimer += dt;
    if (readoutTimer > 0.15) { readoutTimer = 0; updateReadouts(); }
  });

  rebuildCone();
  updateSky();
  rebuildLoop();
  updateLoop();
  drawKS();
  applyView(false);
  updateReadouts();

  return {
    state: () => ({
      view,
      logGmu: lgGmu,
      gmu: gmu(),
      violatesCMB: gmu() > GMU_CMB,
      v,
      src: srcS,
      images: imgs.length,
      sepArcsec: realSep() / ARCSEC,
      ksMicroK: ksMicroK(),
      fold,
      cusps: cuspCount,
      vmax,
      doubled: doubledCount,
    }),
    dispose: () => {
      ks.remove();
      sph.remove();
      legend.remove();
      banner.remove();
      for (const d of disposables) d.dispose();
      quad.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cosmic-strings',
  number: 27,
  symbol: 'Cs',
  title: 'Cosmic Strings',
  domain: 'string',
  level: 3,
  status: 'live',
  tagline: 'Thin cracks in space that could double the sky behind them.',
  content,
  mount,
};

export default topic;
