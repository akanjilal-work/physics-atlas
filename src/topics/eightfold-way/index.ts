import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  contentKey, contentQN, decupletLevels, fmtFrac, gmnAudit, identify, inMultiplet, isAnti, levelMass,
  OMEGA_MASS, predictOmega, qn, quarkText, type Hadron, type Multiplet, type QN, type QuarkCode,
} from './physics.ts';

type V3 = [number, number, number];
type Kind = 'baryon' | 'meson';

const SX = 1.7; // scene units per unit of I3
const SZ = SX * (Math.sqrt(3) / 2); // per unit of Y, so the hexagon is regular
const KM = 0.0065; // scene units of height per MeV
const BASE: Record<Multiplet, number> = { meson: 60, octet: 880, decuplet: 1150 };
const FLAT_H = 0.06;
const TILE_R = 0.34;

const S_COLOR: Record<number, number> = { 1: PALETTE.green, 0: PALETTE.cyan, [-1]: PALETTE.violet, [-2]: PALETTE.rose, [-3]: PALETTE.amber };
const QCD = [PALETTE.red, PALETTE.green, 0x5b8cff];

const MULT_NAME: Record<Multiplet, string> = { meson: 'pseudoscalar mesons (8 + 1)', octet: 'baryon octet', decuplet: 'baryon decuplet' };
const CAM: Record<Multiplet, { pos: V3; target: V3 }> = {
  meson: { pos: [-6.2, 5.6, 10.8], target: [-0.6, 1.9, 0.6] },
  octet: { pos: [-5.2, 4.6, 9.2], target: [-0.6, 0.8, 0.6] },
  decuplet: { pos: [-5.4, 5.0, 10.0], target: [-0.5, 1.3, 0.9] },
};
const OUTLINE: Record<Multiplet, [number, number][]> = {
  meson: [[1, 0], [0.5, 1], [-0.5, 1], [-1, 0], [-0.5, -1], [0.5, -1]],
  octet: [[1, 0], [0.5, 1], [-0.5, 1], [-1, 0], [-0.5, -1], [0.5, -1]],
  decuplet: [[-1.5, 1], [1.5, 1], [0, -2]],
};

const px = (I3: number) => I3 * SX;
const pz = (Y: number) => -Y * SZ;
const massH = (m: number, mult: Multiplet) => (m - BASE[mult]) * KM;

interface Tile {
  h: Hadron;
  n: QN;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  halo: THREE.Mesh;
  haloMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  /** Flat-mode x offset for states that share a weight. */
  dx: number;
  cur: number;
  pop: number;
  visible: () => boolean;
}

interface Layer {
  mult: Multiplet;
  group: THREE.Group;
  tiles: Tile[];
  drop: THREE.BufferAttribute;
  rows: { ys: number; tiles: Tile[] }[];
  rowAttr: THREE.BufferAttribute;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.decuplet.pos, target: CAM.decuplet.target, fov: 42 });
  const { scene } = stage;
  const labelLayer = viewport.querySelector('.stage-labels') as HTMLElement | null;
  if (labelLayer) labelLayer.style.zIndex = '1';

  let mult: Multiplet = 'decuplet';
  let massOn = true;
  let predict = false;
  let revealed = false;
  let guess = 1600;
  let lastErr = NaN;
  let bestErr = 999;
  let selected = 'none';
  let kind: Kind = 'baryon';
  let slots: QuarkCode[] = ['u', 'u', 'd'];
  let antiSlot: QuarkCode = 'D';
  let builderTouched = false;
  let built = '';
  let builtQN: QN | null = null;
  let ballCodes: QuarkCode[] = [];
  let buildMsg = '';

  // ======================================================================
  // Floor: grid and I3 / Y axes
  const grid = makeGrid(12, 24);
  grid.position.y = -0.01;
  scene.add(grid);
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([px(-2.3), 0, 0, px(2.3), 0, 0, 0, 0, pz(-2.6), 0, 0, pz(1.6)], 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x56627c })));
    const lx = stage.label('I₃ →', [px(2.55), 0, 0], 'muted');
    lx.element.style.fontSize = '13px';
    const ly = stage.label('Y ↑', [0, 0, pz(1.85)], 'muted');
    ly.element.style.fontSize = '13px';
  }

  // Shared tile geometry
  const tileGeo = new THREE.CylinderGeometry(TILE_R, TILE_R, 0.09, 6);
  const haloGeo = new THREE.CylinderGeometry(TILE_R * 1.55, TILE_R * 1.55, 0.02, 6);
  const edgeGeo = new THREE.EdgesGeometry(tileGeo);

  function buildLayer(m: Multiplet): Layer {
    const group = new THREE.Group();
    scene.add(group);
    const list = inMultiplet(m);
    // Floor outline (hexagon or triangle) and weight dots
    const ol = OUTLINE[m].flatMap(([i, y]) => [px(i), 0.005, pz(y)]);
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(ol, 3));
    group.add(new THREE.LineLoop(og, new THREE.LineBasicMaterial({ color: 0x7a8bb0, transparent: true, opacity: 0.8 })));
    const seen = new Map<string, number>();
    const tiles: Tile[] = list.map((h) => {
      const n = qn(h);
      const key = `${n.I3},${n.Y}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const color = S_COLOR[n.S];
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.1 });
      const mesh = new THREE.Mesh(tileGeo, mat);
      mesh.userData.id = h.id;
      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      mesh.add(edge);
      const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = -0.03;
      mesh.add(halo);
      const lab = stage.label('', [0, 0.36, 0], '', mesh);
      lab.element.innerHTML = `<div style="text-align:center;line-height:1.05"><b style="font-size:14px;color:${css(color)}">${h.sym}</b><br><span style="font-size:10px;color:#9aa6bd">${Math.round(h.mass)}</span></div>`;
      lab.element.style.background = 'transparent';
      group.add(mesh);
      return { h, n, mesh, mat, halo, haloMat, x: px(n.I3), z: pz(n.Y), dx: k, cur: FLAT_H, pop: 1, visible: () => mesh.visible };
    });
    // Spread states that share a weight when the mass axis is flattened.
    for (const t of tiles) {
      const cnt = seen.get(`${t.n.I3},${t.n.Y}`)!;
      t.dx = cnt > 1 ? (t.dx - (cnt - 1) / 2) * 0.8 : 0;
    }
    // Weight dots on the floor
    const dotGeo = new THREE.CircleGeometry(0.07, 16);
    dotGeo.rotateX(-Math.PI / 2);
    for (const key of seen.keys()) {
      const [i, y] = key.split(',').map(Number);
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x9aa6bd }));
      d.position.set(px(i), 0.01, pz(y));
      group.add(d);
      const cnt = seen.get(key)!;
      if (cnt > 1) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.18, 24), new THREE.MeshBasicMaterial({ color: 0x9aa6bd, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px(i), 0.012, pz(y));
        group.add(ring);
      }
    }
    // Drop lines from each weight up to its tile
    const dropArr = new Float32Array(tiles.length * 6);
    const dg = new THREE.BufferGeometry();
    const drop = new THREE.BufferAttribute(dropArr, 3);
    drop.setUsage(THREE.DynamicDrawUsage);
    dg.setAttribute('position', drop);
    const dl = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x4a5a80, transparent: true, opacity: 0.7 }));
    dl.frustumCulled = false;
    group.add(dl);
    // Row rungs: tiles of equal Y (equal strangeness) at their mean height
    const ysVals = [...new Set(tiles.map((t) => t.n.Y))].sort((a, b) => b - a);
    const rows = ysVals.map((ys) => ({ ys, tiles: tiles.filter((t) => t.n.Y === ys && !t.h.mix) })).filter((r) => r.tiles.length > 1);
    const rowArr = new Float32Array(rows.length * 6);
    const rg = new THREE.BufferGeometry();
    const rowAttr = new THREE.BufferAttribute(rowArr, 3);
    rowAttr.setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', rowAttr);
    const rl = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xdfe6f3, transparent: true, opacity: 0.45 }));
    rl.frustumCulled = false;
    group.add(rl);
    // Mass ruler at the back left
    const masses = list.map((h) => h.mass);
    const lo = Math.ceil(BASE[m] / 100) * 100;
    const hi = Math.max(...masses) + 60;
    const step = m === 'meson' ? 200 : 100;
    const rx = px(2.9);
    const rz = pz(-0.4);
    const rp: number[] = [rx, 0, rz, rx, massH(hi, m), rz];
    const rulerLabels: CSS2DObject[] = [];
    for (let v = lo; v <= hi; v += step) {
      const y = massH(v, m);
      rp.push(rx - 0.18, y, rz, rx + 0.12, y, rz);
      const l = stage.label(`${v}`, [rx + 0.45, y, rz], 'muted', group);
      l.element.style.fontSize = '10.5px';
      rulerLabels.push(l);
    }
    const rpg = new THREE.BufferGeometry();
    rpg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    const ruler = new THREE.LineSegments(rpg, new THREE.LineBasicMaterial({ color: 0x2c3852, transparent: true, opacity: 0.9 }));
    group.add(ruler);
    const rt = stage.label('mass (MeV)', [rx, massH(hi, m) + 0.3, rz], 'muted', group);
    rt.element.style.fontSize = '11px';
    ruler.userData.labels = [...rulerLabels, rt];
    group.userData.ruler = ruler;
    return { mult: m, group, tiles, drop, rows, rowAttr };
  }

  const layers: Record<Multiplet, Layer> = { meson: buildLayer('meson'), octet: buildLayer('octet'), decuplet: buildLayer('decuplet') };
  const allTiles = () => layers[mult].tiles;
  const tileOf = (id: string) => layers.meson.tiles.concat(layers.octet.tiles, layers.decuplet.tiles).find((t) => t.h.id === id);

  // Ghost Ω⁻ for prediction mode
  const ghost = new THREE.Group();
  const ghostEdge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: PALETTE.amber }));
  ghostEdge.scale.setScalar(1.1);
  ghost.add(ghostEdge);
  const ghostHalo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
  ghost.add(ghostHalo);
  const ghostLabel = stage.label('', [0, 0.42, 0], '', ghost);
  ghostLabel.element.style.background = 'transparent';
  ghost.position.set(0, 0, pz(-2));
  ghost.visible = false;
  layers.decuplet.group.add(ghost);

  // Quark balls above the selected tile (colours are QCD colour charges, letters are flavour)
  const qGroup = new THREE.Group();
  scene.add(qGroup);
  const ballGeo = new THREE.SphereGeometry(0.12, 24, 16);
  const balls: { mesh: THREE.Mesh; solid: THREE.MeshStandardMaterial; hollow: THREE.MeshBasicMaterial; lab: CSS2DObject }[] = [];
  for (let i = 0; i < 3; i++) {
    const solid = new THREE.MeshStandardMaterial({ color: QCD[i], emissive: QCD[i], emissiveIntensity: 0.6, roughness: 0.3 });
    const hollow = new THREE.MeshBasicMaterial({ color: QCD[i], wireframe: true, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(ballGeo, solid);
    qGroup.add(mesh);
    const lab = stage.label('', [0, 0.22, 0], '', mesh);
    lab.element.style.fontSize = '12px';
    lab.element.style.padding = '0 4px';
    balls.push({ mesh, solid, hollow, lab });
  }
  qGroup.visible = false;

  function setBalls(codes: QuarkCode[]): void {
    ballCodes = codes;
    const meson = codes.length === 2;
    balls.forEach((b, i) => {
      const c = codes[i];
      b.mesh.visible = !!c;
      if (!c) return;
      const anti = isAnti(c);
      b.mesh.material = anti ? b.hollow : b.solid;
      // A meson is colour plus matching anticolour: both balls share one hue.
      const col = meson ? QCD[0] : QCD[i];
      b.solid.color.setHex(col); b.solid.emissive.setHex(col); b.hollow.color.setHex(col);
      b.lab.element.textContent = anti ? `${c.toLowerCase()}̄` : c;
    });
  }

  // ======================================================================
  // Overlays
  const info = document.createElement('div');
  info.className = 'stage-overlay';
  Object.assign(info.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '280px',
    background: 'rgba(7,10,18,0.9)', borderRadius: '10px', border: '1px solid #243049', padding: '9px 12px',
    font: '11.5px/1.5 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(info);

  const inset = document.createElement('canvas');
  inset.className = 'stage-overlay';
  inset.width = 560;
  inset.height = 320;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', bottom: '10px', width: '280px', height: '160px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const omegaHidden = () => predict && !revealed;
  const ok = `<span style="color:${css(PALETTE.green)}">✓</span>`;
  const val = (s: string) => `<span style="color:#dfe6f3">${s}</span>`;

  function writeInfo(): void {
    const t = selected !== 'none' ? tileOf(selected) : undefined;
    let html: string;
    if (!t) {
      const blurb: Record<Multiplet, string> = {
        meson: 'Nine spin-0 mesons, each a quark and an antiquark. Kaons carry one s or s̄, so they sit at Y = ±1.',
        octet: 'Eight spin-½ baryons, three quarks each. Every row down swaps a u or d for an s.',
        decuplet: 'Ten spin-3/2 baryons. Each row down adds one s quark and roughly 146 MeV. The tip is the Ω⁻.',
      };
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">${MULT_NAME[mult]}</div>
<div>${blurb[mult]}</div>
<div style="color:#8391ab;margin-top:4px">Floor: weight diagram (I₃, Y). Height: mass. Click a tile.</div>`;
      if (predict) html += `<div style="color:${css(PALETTE.amber)};margin-top:4px">${revealed ? `Ω⁻ revealed. Your guess was off by ${lastErr >= 0 ? '+' : ''}${lastErr.toFixed(0)} MeV.` : 'Ω⁻ is hidden. Slide your guess, then reveal it.'}</div>`;
    } else {
      const h = t.h;
      const n = t.n;
      const col = css(S_COLOR[n.S]);
      const mn = h.multiplet === 'meson' ? 'meson nonet' : h.multiplet === 'octet' ? 'baryon octet' : 'baryon decuplet';
      html = `<div style="font:600 15px/1.3 'Space Grotesk',sans-serif;color:${col};margin-bottom:3px">${h.sym} &nbsp;${h.name}</div>
<div>quarks &nbsp;${val(h.mix ?? quarkText(h.q))}</div>
<div>set &nbsp;&nbsp;&nbsp;&nbsp;${val(`${mn}, J<sup>P</sup> = ${h.spin}`)}</div>
<div>mass &nbsp;&nbsp;&nbsp;${val(`${h.massText} MeV`)}</div>
<div>B ${val(fmtFrac(n.B))} &nbsp;S ${val(fmtFrac(n.S))} &nbsp;Y ${val(fmtFrac(n.Y))} &nbsp;I₃ ${val(fmtFrac(n.I3))}</div>
<div>Q = I₃ + Y/2 = ${val(`${fmtFrac(n.I3)} ${n.Y >= 0 ? '+' : '−'} ${fmtFrac(Math.abs(n.Y) / 2, false)} = ${fmtFrac(n.Q)}`)} ${ok}</div>`;
      if (h.id === 'Delta++') html += `<div style="color:#8391ab;margin-top:4px;font-family:'Space Grotesk',sans-serif;font-size:12px">Three u quarks, spins aligned, same state. Pauli forbids that unless each quark has a different colour.</div>`;
      if (h.mix) html += `<div style="color:#8391ab;margin-top:4px;font-family:'Space Grotesk',sans-serif;font-size:12px">A quantum mixture of quark–antiquark pairs.</div>`;
    }
    if (buildMsg) html += `<div style="margin-top:6px;border-top:1px solid #243049;padding-top:5px;color:#dfe6f3">${buildMsg}</div>`;
    info.innerHTML = html;
  }

  function drawInset(): void {
    const c = ictx;
    const W = inset.width;
    const Hh = inset.height;
    c.clearRect(0, 0, W, Hh);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText('mass vs strangeness', 18, 32);
    const Ss = mult === 'meson' ? [1, 0, -1] : mult === 'octet' ? [0, -1, -2] : [0, -1, -2, -3];
    const list = inMultiplet(mult);
    const mMin = mult === 'meson' ? 100 : mult === 'octet' ? 900 : 1200;
    const mMax = mult === 'meson' ? 1000 : mult === 'octet' ? 1350 : 1760;
    const x0 = 70, x1 = W - 150, y0 = Hh - 44, y1 = 56;
    const xOf = (S: number) => x0 + ((Ss[0] - S) / (Ss.length - 1)) * (x1 - x0);
    const yOf = (m: number) => y0 - ((m - mMin) / (mMax - mMin)) * (y0 - y1);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.font = '18px JetBrains Mono, monospace';
    for (const S of Ss) {
      c.beginPath(); c.moveTo(xOf(S), y1 - 8); c.lineTo(xOf(S), y0); c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(`S=${S > 0 ? '+' : ''}${S}`, xOf(S) - 26, Hh - 14);
    }
    // points
    for (const h of list) {
      if (h.id === 'Omega-' && omegaHidden()) continue;
      const n = qn(h);
      c.fillStyle = css(S_COLOR[n.S]);
      c.beginPath(); c.arc(xOf(n.S), yOf(h.mass), h.id === selected ? 9 : 6, 0, Math.PI * 2); c.fill();
    }
    c.font = '20px JetBrains Mono, monospace';
    if (mult === 'decuplet') {
      const { levels } = decupletLevels();
      const shown = omegaHidden() ? 3 : 4;
      c.strokeStyle = '#dfe6f3'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < shown; i++) (i ? c.lineTo : c.moveTo).call(c, xOf(-i), yOf(levels[i]));
      c.stroke();
      c.fillStyle = '#dfe6f3';
      for (let i = 0; i < shown - 1; i++) {
        const g = levels[i + 1] - levels[i];
        c.fillText(`+${g.toFixed(0)}`, (xOf(-i) + xOf(-i - 1)) / 2 - 10, (yOf(levels[i]) + yOf(levels[i + 1])) / 2 - 16);
      }
      if (predict) {
        c.strokeStyle = css(PALETTE.amber); c.setLineDash([6, 6]); c.lineWidth = 2;
        c.beginPath(); c.moveTo(xOf(-2), yOf(levels[2])); c.lineTo(xOf(-3), yOf(guess)); c.stroke();
        c.setLineDash([]);
        c.beginPath(); c.arc(xOf(-3), yOf(guess), 9, 0, Math.PI * 2); c.stroke();
        c.fillStyle = css(PALETTE.amber);
        c.fillText(`guess ${guess}`, x1 + 14, yOf(guess) + 6);
        if (revealed) {
          c.fillStyle = '#dfe6f3';
          c.fillText(`true ${OMEGA_MASS.toFixed(0)}`, x1 + 14, yOf(OMEGA_MASS) + (Math.abs(guess - OMEGA_MASS) < 15 ? 26 : 6));
        }
      } else {
        c.fillStyle = '#8391ab';
        c.fillText('Ω⁻ 1672', x1 + 14, yOf(OMEGA_MASS) + 6);
      }
    } else if (mult === 'octet') {
      // Octet GMO readout drawn as level means
      c.fillStyle = '#8391ab';
      c.fillText('N', xOf(0) + 14, yOf(levelMass('octet', 0)) + 6);
      c.fillText('Λ,Σ', xOf(-1) + 14, yOf(levelMass('octet', -1)) + 6);
      c.fillText('Ξ', xOf(-2) + 14, yOf(levelMass('octet', -2)) + 6);
    } else {
      c.fillStyle = '#8391ab';
      c.fillText('η′ sits far above', x1 - 150, yOf(957.78) + 30);
    }
  }

  // ======================================================================
  // Selection, multiplet switching, prediction
  function paintTiles(): void {
    for (const L of Object.values(layers)) {
      for (const t of L.tiles) {
        const on = t.h.id === selected;
        t.mat.emissiveIntensity = on ? 1.0 : selected === 'none' ? 0.45 : 0.28;
        t.haloMat.opacity = on ? 0.45 : 0.16;
        t.mesh.scale.setScalar(on ? 1.18 : 1);
      }
    }
  }

  function select(id: string, codes?: QuarkCode[]): void {
    selected = id;
    const t = id !== 'none' ? tileOf(id) : undefined;
    if (t) {
      if (t.h.multiplet !== mult) setMultiplet(t.h.multiplet, false);
      setBalls(codes ?? t.h.q);
      qGroup.visible = true;
    } else {
      qGroup.visible = false;
    }
    paintTiles();
    writeInfo();
    drawInset();
    updateReadouts();
  }

  function setMultiplet(m: Multiplet, clearSel = true): void {
    mult = m;
    multCtl?.set(m, false);
    for (const L of Object.values(layers)) L.group.visible = L.mult === m;
    stage.flyTo(CAM[m].pos, CAM[m].target);
    if (m !== 'decuplet' && predict) setPredict(false);
    if (clearSel && selected !== 'none' && tileOf(selected)?.h.multiplet !== m) select('none');
    writeInfo();
    drawInset();
  }

  const omegaTile = tileOf('Omega-')!;
  function setPredict(on: boolean): void {
    predict = on;
    predictCtl?.set(on, false);
    revealed = false;
    if (on) {
      if (mult !== 'decuplet') setMultiplet('decuplet');
      if (selected === 'Omega-') select('none');
    }
    omegaTile.mesh.visible = !omegaHidden();
    ghost.visible = on;
    guessRow.style.display = on ? '' : 'none';
    revealBtn.disabled = !on;
    updateGhost();
    writeInfo();
    drawInset();
  }

  function updateGhost(): void {
    ghostLabel.element.innerHTML = `<div style="text-align:center;line-height:1.05"><b style="font-size:14px;color:${css(PALETTE.amber)}">Ω⁻ ?</b><br><span style="font-size:10px;color:${css(PALETTE.amber)}">${guess}</span></div>`;
  }

  function reveal(): void {
    if (!predict || revealed) return;
    revealed = true;
    lastErr = guess - OMEGA_MASS;
    bestErr = Math.min(bestErr, Math.abs(lastErr));
    omegaTile.mesh.visible = true;
    omegaTile.pop = 0;
    select('Omega-');
    drawInset();
  }

  // ======================================================================
  // Builder
  function build(): void {
    const codes: QuarkCode[] = kind === 'baryon' ? [...slots] : [slots[0], antiSlot];
    const n = contentQN(codes);
    builtQN = n;
    built = contentKey(codes);
    const matches = identify(codes);
    const txt = quarkText(codes);
    const desc = (h: Hadron) => `${h.sym} (${h.multiplet === 'meson' ? 'meson' : h.multiplet}, ${h.spin})`;
    if (!matches.length) {
      buildMsg = `${txt}: no hadron`;
      select('none');
      return;
    }
    const pick = matches.find((h) => h.multiplet === mult && !(h.id === 'Omega-' && omegaHidden())) ?? matches.find((h) => !(h.id === 'Omega-' && omegaHidden()));
    buildMsg = `${txt} → ${matches.map(desc).join(' or ')}<br>Q ${fmtFrac(n.Q)}, S ${fmtFrac(n.S)}, Y ${fmtFrac(n.Y)}`;
    if (matches.length > 1 && kind === 'baryon') buildMsg += `<br><span style="color:#8391ab">Same quarks, different spin arrangement.</span>`;
    if (kind === 'meson' && n.S === 0 && matches.length > 1) buildMsg += `<br><span style="color:#8391ab">Neutral pairs mix into π⁰, η and η′.</span>`;
    if (!pick) {
      buildMsg += `<br><span style="color:${css(PALETTE.amber)}">That is the hidden Ω⁻. Make your prediction first.</span>`;
      select('none');
      return;
    }
    select(pick.id, codes);
  }

  // ======================================================================
  // Picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const hit = ray.intersectObjects(allTiles().filter((t) => t.mesh.visible).map((t) => t.mesh), false)[0];
    if (hit) {
      buildMsg = '';
      select(hit.object.userData.id as string);
    } else if (selected !== 'none') {
      buildMsg = '';
      select('none');
    }
  };
  stage.renderer.domElement.addEventListener('pointerdown', onDown);
  stage.renderer.domElement.addEventListener('pointerup', onUp);

  // ======================================================================
  // Frame loop: animate heights, update drop lines and rungs in place
  let spin = 0;
  stage.onFrame((dt) => {
    const L = layers[mult];
    const k = 1 - Math.exp(-dt * 6);
    let moving = false;
    for (let i = 0; i < L.tiles.length; i++) {
      const t = L.tiles[i];
      const target = massOn ? massH(t.h.mass, mult) : FLAT_H;
      if (Math.abs(target - t.cur) > 1e-4) { t.cur += (target - t.cur) * k; moving = true; }
      const x = t.x + (massOn ? 0 : t.dx);
      t.mesh.position.set(x, t.cur, t.z);
      if (t.pop < 1) {
        t.pop = Math.min(1, t.pop + dt * 1.6);
        const s = t.pop < 0.7 ? (t.pop / 0.7) * 1.35 : 1.35 - ((t.pop - 0.7) / 0.3) * (1.35 - 1.18);
        t.mesh.scale.setScalar(s);
      }
      const a = L.drop.array as Float32Array;
      a[i * 6] = x; a[i * 6 + 1] = 0; a[i * 6 + 2] = t.z;
      a[i * 6 + 3] = x; a[i * 6 + 4] = t.visible() ? t.cur : 0; a[i * 6 + 5] = t.z;
    }
    if (moving || L.drop.version === 0) L.drop.needsUpdate = true;
    if (moving || L.rowAttr.version === 0) {
      const r = L.rowAttr.array as Float32Array;
      L.rows.forEach((row, j) => {
        let hs = 0, xmin = Infinity, xmax = -Infinity, n = 0;
        for (const t of row.tiles) {
          if (!t.visible()) continue;
          hs += t.cur; n++;
          xmin = Math.min(xmin, t.mesh.position.x); xmax = Math.max(xmax, t.mesh.position.x);
        }
        const y = n ? hs / n : 0;
        r[j * 6] = xmin - 0.45; r[j * 6 + 1] = y; r[j * 6 + 2] = pz(row.ys);
        r[j * 6 + 3] = xmax + 0.45; r[j * 6 + 4] = y; r[j * 6 + 5] = pz(row.ys);
      });
      L.rowAttr.needsUpdate = true;
    }
    if (ghost.visible) {
      const gy = massOn ? massH(guess, 'decuplet') : FLAT_H;
      ghost.position.y += (gy - ghost.position.y) * k;
      ghost.rotation.y += dt * 0.6;
    }
    if (qGroup.visible && selected !== 'none') {
      const t = tileOf(selected)!;
      spin += dt * 0.9;
      qGroup.position.set(t.mesh.position.x, t.cur + 0.62, t.z);
      const nb = ballCodes.length;
      for (let i = 0; i < nb; i++) {
        const ang = spin + (i * Math.PI * 2) / nb;
        balls[i].mesh.position.set(Math.cos(ang) * 0.3, 0, Math.sin(ang) * 0.3);
      }
    }
  });

  // ======================================================================
  // Panel
  const ui = new Panel(panel);
  ui.section('Multiplet');
  let multCtl: Control<Multiplet> | null = null;
  multCtl = ui.select<Multiplet>({
    key: 'multiplet', label: 'Show', value: mult,
    options: [{ value: 'meson', label: 'Mesons 8+1' }, { value: 'octet', label: 'Octet' }, { value: 'decuplet', label: 'Decuplet' }],
    onChange: (v) => { buildMsg = ''; setMultiplet(v); },
  });
  ui.toggle({ key: 'massHeight', label: 'Show mass as height', value: massOn, onChange: (v) => { massOn = v; } });
  ui.legend([
    { color: css(PALETTE.green), label: 'S = +1' },
    { color: css(PALETTE.cyan), label: 'S = 0' },
    { color: css(PALETTE.violet), label: 'S = −1' },
    { color: css(PALETTE.rose), label: 'S = −2' },
    { color: css(PALETTE.amber), label: 'S = −3' },
  ]);

  ui.section('Quark builder');
  const q2Rows: HTMLElement[] = [];
  const qOpts = [{ value: 'u', label: 'u' }, { value: 'd', label: 'd' }, { value: 's', label: 's' }] as { value: QuarkCode; label: string }[];
  const kindCtl = ui.select<Kind>({
    key: 'builder', label: 'Build a', value: kind,
    options: [{ value: 'baryon', label: 'Baryon (q q q)' }, { value: 'meson', label: 'Meson (q q̄)' }],
    onChange: (v) => { kind = v; builderTouched = true; layoutBuilder(); build(); },
  });
  void kindCtl;
  const slotCtls = [0, 1, 2].map((i) => ui.select<QuarkCode>({
    key: `q${i + 1}`, label: `Quark ${i + 1}`, value: slots[i], options: qOpts,
    onChange: (v) => { slots[i] = v; builderTouched = true; build(); },
  }));
  const antiCtl = ui.select<QuarkCode>({
    key: 'qbar', label: 'Antiquark', value: antiSlot,
    options: [{ value: 'U', label: 'ū' }, { value: 'D', label: 'd̄' }, { value: 'S', label: 's̄' }],
    onChange: (v) => { antiSlot = v; builderTouched = true; build(); },
  });
  q2Rows.push(slotCtls[1].el, slotCtls[2].el);
  function layoutBuilder(): void {
    for (const r of q2Rows) r.style.display = kind === 'baryon' ? '' : 'none';
    antiCtl.el.style.display = kind === 'meson' ? '' : 'none';
  }
  ui.buttons([{ label: 'Build', primary: true, onClick: () => { builderTouched = true; build(); } }]);
  ui.note('Ball colours are the three QCD colours. A baryon needs one of each. A meson pairs a colour with its anticolour (hollow ball).');

  ui.section('Ω⁻ prediction');
  let predictCtl: Control<boolean> | null = null;
  predictCtl = ui.toggle({ key: 'predict', label: 'Hide the Ω⁻ and predict it', value: predict, onChange: (v) => setPredict(v) });
  const guessCtl = ui.slider({
    key: 'guess', label: 'Your Ω⁻ mass', min: 1550, max: 1850, step: 1, value: guess, unit: 'MeV',
    onInput: (v) => { guess = v; updateGhost(); drawInset(); },
  });
  const guessRow = guessCtl.el;
  const [revealBtn] = ui.buttons([{ label: 'Reveal Ω⁻', primary: true, key: 'guess', onClick: () => reveal() }]);

  ui.section('Quantum numbers');
  const rQ = ui.readout('Q', 'charge Q');
  const rI3 = ui.readout('I3', 'isospin I₃');
  const rY = ui.readout('Y', 'hypercharge Y');
  const rS = ui.readout('S', 'strangeness S');
  const rB = ui.readout('B', 'baryon no. B');
  const rM = ui.readout('mass', 'mass', 'MeV');
  const rG = ui.readout('gmn', 'Q − I₃ − Y/2, all 27');
  const rSp = ui.readout('spacing', 'decuplet step', 'MeV');

  const audit = gmnAudit();
  const dec = decupletLevels();
  const pred = predictOmega();
  function updateReadouts(): void {
    const t = selected !== 'none' ? tileOf(selected) : undefined;
    const n = builderTouched && buildMsg && builtQN ? builtQN : t?.n;
    const f = (x: number | undefined) => (x === undefined ? '·' : fmtFrac(x));
    rQ(f(n?.Q)); rI3(f(n?.I3)); rY(f(n?.Y)); rS(f(n?.S)); rB(f(n?.B));
    rM(t ? t.h.massText : '·');
    rG(audit.maxResidual === 0 && audit.chargeMismatches.length === 0 ? '0 (27 of 27)' : audit.maxResidual.toExponential(1));
    rSp(omegaHidden() ? `${dec.gaps[0].toFixed(0)}, ${dec.gaps[1].toFixed(0)}, ?` : `${dec.mean.toFixed(1)} avg`);
  }
  ui.note(`Equal spacing from Δ, Σ*, Ξ* predicts the Ω⁻ at ${pred.step.toFixed(0)} to ${pred.fit.toFixed(0)} MeV. PDG: ${OMEGA_MASS} MeV.`);

  layoutBuilder();
  setPredict(false);
  setMultiplet('decuplet');
  for (const L of Object.values(layers)) for (const t of L.tiles) t.cur = massOn ? massH(t.h.mass, L.mult) : FLAT_H;
  select('none');

  return {
    state: () => ({
      multiplet: mult,
      massHeight: massOn,
      predict,
      omegaRevealed: revealed,
      omegaGuess: guess,
      omegaErr: Number.isFinite(lastErr) ? lastErr : 999,
      omegaBestErr: bestErr,
      selected,
      selectedS: selected !== 'none' ? tileOf(selected)!.n.S : 99,
      built: builderTouched ? built : '',
      builderKind: kind,
      builtStrangeMeson: builderTouched && kind === 'meson' && !!builtQN && builtQN.S !== 0,
      touched: builderTouched,
    }),
    dispose: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onDown);
      stage.renderer.domElement.removeEventListener('pointerup', onUp);
      info.remove();
      inset.remove();
      tileGeo.dispose();
      haloGeo.dispose();
      edgeGeo.dispose();
      ballGeo.dispose();
      balls.forEach((b) => { b.solid.dispose(); b.hollow.dispose(); });
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'eightfold-way',
  number: 68,
  title: 'The Quark Model',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'Patterns in the particle zoo that predicted a particle before it was found.',
  content,
  mount,
};

export default topic;
