import * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createStage, PALETTE, Trail } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import { renderMath } from '../../core/tex.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  betaOf, betaSpectrum, buildSpectrum, fermiFromG, gFromFermi, G_F, M_W, M_Z, ME_MEV, MP_MEV, muonLifetime, Q_CO60, Q_NEUTRON,
  rangeFm, sampleCosTheta, sampleT, surfaceHeight,
} from './physics.ts';

type View = 'beta' | 'wu' | 'range';
type V3 = [number, number, number];

const CAM: Record<View, { pos: V3; target: V3 }> = {
  beta: { pos: [0.2, 1.1, 7.6], target: [0.2, 0.55, 0] },
  wu: { pos: [0, 1.2, 10.2], target: [0, 0.55, 0] },
  range: { pos: [0, 7.4, 11.6], target: [0, 1.4, 0.4] },
};

const U_COL = PALETTE.rose;
const D_COL = PALETTE.violet;
const W_COL = PALETTE.cyan;
const E_COL = PALETTE.green;
const NU_COL = 0xcfe9ff;
const SPIN_COL = PALETTE.amber;
const NEUTRON_COL = 0x7f8ba3;
const PROTON_COL = 0xf472b6;

// Beta-decay timeline (seconds of slow-motion scene time). Phase i runs from B[i] to B[i+1].
const B = [0, 1.5, 2.7, 3.7, 6.4];
const SPLIT = B[2] + 0.5; // moment the W⁻ turns into e⁻ + ν̄
const VIS_C = 1.15; // scene units per second for v = c
const RECOIL_BOOST = 100;
const CAPTIONS = [
  '1 · A neutron: one up quark and two down quarks',
  '2 · A down quark emits a W⁻ and becomes an up quark',
  '3 · The virtual W⁻ turns into an electron and an antineutrino',
  '4 · Proton, electron and antineutrino fly apart',
];

// Wu scene
const WU_X = -2.3;
const NUC_R = 0.5;
const POOL = 180;
const WU_RATE = 36; // emissions per second of scene time
const WU_MAXR = 2.05;

// Range scene
const DISC_R = 2.7;
const DISC_X = 3.05;
const FM_PER_UNIT = 2e-3;
const RHO0 = 0.22;
const HMAX = 2.1;
const NR = 44;
const NT = 72;
const MU_LIFE_REF = muonLifetime(G_F);
const G_WEAK = gFromFermi(G_F, M_W);

const HB = 40; // histogram bins

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM.beta.pos, target: CAM.beta.target, fov: 42 });
  const { scene } = stage;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => { disposables.push(x); return x; };

  let view: View = 'beta';

  // =========================================================================
  // View 1: beta decay
  const betaG = new THREE.Group();
  scene.add(betaG);

  const shellMat = new THREE.MeshStandardMaterial({ color: NEUTRON_COL, transparent: true, opacity: 0.16, roughness: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMat);
  betaG.add(shell);
  const shellRim = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), Math.sin((i / 96) * Math.PI * 2), 0))),
    new THREE.LineBasicMaterial({ color: NEUTRON_COL, transparent: true, opacity: 0.55 }),
  );
  shell.add(shellRim);

  const quarkGeo = new THREE.SphereGeometry(0.2, 28, 18);
  const QBASE: V3[] = [[0, 0.44, 0], [-0.4, -0.24, 0.05], [0.4, -0.24, -0.05]];
  const quarks: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: CSS2DObject }[] = QBASE.map((p, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: i === 0 ? U_COL : D_COL, emissive: i === 0 ? U_COL : D_COL, emissiveIntensity: 0.35, roughness: 0.35 });
    const mesh = new THREE.Mesh(quarkGeo, mat);
    mesh.position.set(...p);
    shell.add(mesh);
    const label = stage.label(i === 0 ? 'u' : 'd', [0, 0.36, 0], 'big', mesh);
    return { mesh, mat, label };
  });
  const nucleonLabel = stage.label('neutron (udd)', [0, -1.3, 0], 'big', shell);
  const caption = stage.label(CAPTIONS[0], [0, -2.0, 0], 'big', betaG);

  // W⁻ blob: bright core plus additive halo
  const wG = new THREE.Group();
  const wCore = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 20), new THREE.MeshBasicMaterial({ color: W_COL }));
  const haloMat = new THREE.MeshBasicMaterial({ color: W_COL, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const wHalo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 20), haloMat);
  const halo2Mat = new THREE.MeshBasicMaterial({ color: W_COL, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false });
  const wHalo2 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 20), halo2Mat);
  wG.add(wCore, wHalo, wHalo2);
  const wLabel = stage.label('W⁻ (virtual, 80 GeV)', [0, 0.62, 0], '', wG);
  wLabel.element.style.color = css(W_COL);
  betaG.add(wG);

  const eMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshStandardMaterial({ color: E_COL, emissive: E_COL, emissiveIntensity: 0.6 }));
  const eLabel = stage.label('e⁻', [0, 0.26, 0], 'big', eMesh);
  eLabel.element.style.color = css(E_COL);
  betaG.add(eMesh);
  const eTrail = new Trail(140, E_COL, 0.9);
  betaG.add(eTrail.line);

  // Antineutrino with helicity marker: spin arrow along the motion and a ring turning right-handed about it.
  const nuG = new THREE.Group();
  const nuMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 14), new THREE.MeshStandardMaterial({ color: NU_COL, emissive: NU_COL, emissiveIntensity: 0.5 }));
  nuG.add(nuMesh);
  const nuRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), new THREE.MeshBasicMaterial({ color: SPIN_COL, transparent: true, opacity: 0.8 }));
  nuRing.rotation.x = Math.PI / 2;
  nuG.add(nuRing);
  const nuDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: SPIN_COL }));
  nuG.add(nuDot);
  const nuSpin = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.55, SPIN_COL, 0.14, 0.08);
  nuG.add(nuSpin);
  betaG.add(nuG);
  const nuLabel = stage.label('ν̄ₑ  spin along motion: right-handed', [0, 0, 0], '', betaG);
  nuLabel.element.style.color = css(NU_COL);
  const nuTrail = new Trail(140, NU_COL, 0.6);
  betaG.add(nuTrail.line);

  // Spectrum tables
  const nTab = buildSpectrum(Q_NEUTRON, 1);
  const coTab = buildSpectrum(Q_CO60, 28);

  // Decay kinematics (reused objects)
  const dirE = new THREE.Vector3();
  const dirNu = new THREE.Vector3();
  const wDir = new THREE.Vector3();
  const recoilV = new THREE.Vector3();
  const splitPos = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  let Te = 0;
  let Enu = 0;
  let betaE = 0;

  // Timeline state
  let dc = 0;
  let auto = true;
  let stepPhase = 0;
  let manualSteps = 0;
  let watched = false;
  let recorded = false;

  // Histogram
  const hist = new Float64Array(HB);
  let hTotal = 0;
  let hMax = 0;
  let hSum = 0;
  let ffUsed = false;

  function randUnitXY(out: THREE.Vector3): THREE.Vector3 {
    const a = Math.random() * Math.PI * 2;
    return out.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.5).normalize();
  }

  function addToHist(T: number): void {
    const b = Math.min(HB - 1, Math.floor((T / Q_NEUTRON) * HB));
    hist[b]++;
    hTotal++;
    hSum += T;
    if (T > hMax) hMax = T;
  }

  function newDecay(): void {
    dc = 0;
    stepPhase = 0;
    manualSteps = 0;
    recorded = false;
    Te = sampleT(nTab, Math.random());
    Enu = Q_NEUTRON - Te; // recoil energy (< 1 keV) neglected
    betaE = betaOf(Te);
    randUnitXY(dirE);
    // Antineutrino at a random angle from the electron (e-ν correlation is weak, a ≈ -0.1, and ignored).
    randUnitXY(dirNu);
    const pe = Math.sqrt(Te * (Te + 2 * ME_MEV));
    wDir.copy(dirE).multiplyScalar(pe).addScaledVector(dirNu, Enu);
    const pSum = wDir.length();
    // Proton recoils against the lepton pair. v_p = p/m_p, exaggerated for display.
    recoilV.copy(wDir).multiplyScalar(-(VIS_C * RECOIL_BOOST) / MP_MEV);
    if (pSum < 1e-6) wDir.copy(dirE);
    wDir.normalize();
    eTrail.clear();
    nuTrail.clear();
    quarks[2].mat.color.set(D_COL);
    quarks[2].mat.emissive.set(D_COL);
    quarks[2].label.element.textContent = 'd';
    shellMat.color.set(NEUTRON_COL);
    (shellRim.material as THREE.LineBasicMaterial).color.set(NEUTRON_COL);
    nucleonLabel.element.textContent = 'neutron (udd)';
    shell.position.set(0, 0, 0);
  }

  function phaseOf(t: number): number {
    return t < B[1] ? 0 : t < B[2] ? 1 : t < B[3] ? 2 : 3;
  }

  function quarkWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(quarks[i].mesh.position).add(shell.position);
  }

  let lastCaption = -1;
  let flipped = false;

  function drawBeta(t: number): void {
    const ph = phaseOf(dc);
    if (ph !== lastCaption) {
      caption.element.textContent = CAPTIONS[ph];
      lastCaption = ph;
    }
    // Quark jiggle (confined, gluon-bound)
    for (let i = 0; i < 3; i++) {
      const q = quarks[i].mesh;
      const b = QBASE[i];
      q.position.set(b[0] + 0.06 * Math.sin(t * 2.3 + i * 2.1), b[1] + 0.06 * Math.cos(t * 1.9 + i * 1.3), b[2] + 0.05 * Math.sin(t * 1.7 + i));
    }
    // d → u flip at 35% of phase 1
    const flipAt = B[1] + 0.35 * (B[2] - B[1]);
    const shouldFlip = dc >= flipAt;
    if (shouldFlip !== flipped) {
      flipped = shouldFlip;
      const c = flipped ? U_COL : D_COL;
      quarks[2].mat.color.set(c);
      quarks[2].mat.emissive.set(c);
      quarks[2].label.element.textContent = flipped ? 'u' : 'd';
      shellMat.color.set(flipped ? PROTON_COL : NEUTRON_COL);
      (shellRim.material as THREE.LineBasicMaterial).color.set(flipped ? PROTON_COL : NEUTRON_COL);
      nucleonLabel.element.textContent = flipped ? 'proton (uud)' : 'neutron (udd)';
    }
    const glow = ph === 1 ? 0.35 + 1.2 * Math.max(0, Math.sin(((dc - B[1]) / (B[2] - B[1])) * Math.PI)) : 0.35;
    quarks[2].mat.emissiveIntensity = glow;

    // W⁻
    const q2 = quarkWorld(2, tmpV);
    if (ph === 1) {
      const s = (dc - B[1]) / (B[2] - B[1]);
      const grow = Math.min(1, Math.max(0, (s - 0.2) / 0.5));
      wG.visible = grow > 0;
      wG.scale.setScalar(Math.max(0.001, grow));
      wG.position.copy(q2).lerp(splitPos.copy(wDir).multiplyScalar(0.85), grow);
    } else if (ph === 2) {
      const s = Math.min(1, (dc - B[2]) / (SPLIT - B[2]));
      wG.visible = true;
      wG.position.copy(wDir).multiplyScalar(0.85 + 0.55 * s);
      const fade = dc < SPLIT ? 1 : Math.max(0, 1 - (dc - SPLIT) / (B[3] - SPLIT));
      wG.scale.setScalar(Math.max(0.001, fade * (1 + 0.12 * Math.sin(t * 22))));
      wG.visible = fade > 0.01;
    } else {
      wG.visible = false;
    }
    wLabel.visible = wG.visible;

    // Leptons after the split
    splitPos.copy(wDir).multiplyScalar(1.4);
    if (dc >= SPLIT) {
      const tt = dc - SPLIT;
      eMesh.visible = true;
      nuG.visible = true;
      eMesh.position.copy(splitPos).addScaledVector(dirE, VIS_C * betaE * tt);
      nuG.position.copy(splitPos).addScaledVector(dirNu, VIS_C * tt);
      tmpQ.setFromUnitVectors(Y, dirNu);
      nuG.quaternion.copy(tmpQ);
      const phi = t * 7;
      nuDot.position.set(0.2 * Math.cos(phi), 0, -0.2 * Math.sin(phi));
      nuLabel.position.copy(nuG.position).addScaledVector(dirNu, 0.35);
      nuLabel.position.y += 0.28;
      nuLabel.visible = true;
      shell.position.copy(recoilV).multiplyScalar(tt);
    } else {
      eMesh.visible = false;
      nuG.visible = false;
      nuLabel.visible = false;
      shell.position.set(0, 0, 0);
    }
  }

  // =========================================================================
  // View 2: Wu experiment and its mirror image
  const wuG = new THREE.Group();
  scene.add(wuG);
  const realG = new THREE.Group();
  const mirrorG = new THREE.Group();
  mirrorG.scale.x = -1; // reflection in the x = 0 plane
  wuG.add(realG, mirrorG);

  // Striped nucleus so the rotation sense is visible
  const nucGeo = keep(new THREE.SphereGeometry(NUC_R, 36, 24));
  {
    const pos = nucGeo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(0x3f6fb0);
    const b = new THREE.Color(0xc9d6ee);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lon = Math.atan2(pos.getZ(i), pos.getX(i));
      c.copy(Math.sin(lon * 4) > 0 ? a : b);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    nucGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const nucMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }));
  const arcGeo = keep(new THREE.TorusGeometry(0.82, 0.028, 8, 64, Math.PI * 1.55));
  const arcMat = keep(new THREE.MeshBasicMaterial({ color: SPIN_COL, transparent: true, opacity: 0.75 }));
  const coneGeo = keep(new THREE.ConeGeometry(0.075, 0.2, 14));

  const eGeo = keep(new THREE.SphereGeometry(0.045, 8, 6));
  const eMat = keep(new THREE.MeshBasicMaterial({ color: E_COL }));
  const lobeMat = keep(new THREE.MeshBasicMaterial({ color: E_COL, wireframe: true, transparent: true, opacity: 0.1 }));
  let lobeGeo: THREE.LatheGeometry | null = null;
  const lobes: THREE.Mesh[] = [];

  interface World { nucleus: THREE.Mesh; electrons: THREE.InstancedMesh }
  function buildWorld(parent: THREE.Group, spinSign: 1 | -1, electrons: THREE.InstancedMesh): World {
    const g = new THREE.Group();
    g.position.x = WU_X;
    parent.add(g);
    const nucleus = new THREE.Mesh(nucGeo, nucMat);
    g.add(nucleus);
    // Arc showing the sense of rotation. rotation.x = -π/2 maps the torus point (cos a, sin a, 0) to
    // (cos a, 0, -sin a), so increasing a turns +x toward -z: counter-clockwise seen from above, spin +y.
    const arc = new THREE.Mesh(arcGeo, arcMat);
    arc.rotation.x = -Math.PI / 2;
    g.add(arc);
    const cone = new THREE.Mesh(coneGeo, arcMat);
    const endA = Math.PI * 1.55;
    cone.position.set(0.82 * Math.cos(endA), 0, -0.82 * Math.sin(endA));
    cone.quaternion.setFromUnitVectors(Y, new THREE.Vector3(-Math.sin(endA), 0, -Math.cos(endA)));
    g.add(cone);
    // Spin arrow. In the mirror group (scale.x = -1) the arc turns the other way, so its spin points down.
    const spin = new THREE.ArrowHelper(new THREE.Vector3(0, spinSign, 0), new THREE.Vector3(0, spinSign * (NUC_R + 0.02), 0), 1.05, SPIN_COL, 0.24, 0.14);
    g.add(spin);
    g.add(electrons);
    const lobe = new THREE.Mesh(new THREE.BufferGeometry(), lobeMat);
    lobes.push(lobe);
    g.add(lobe);
    return { nucleus, electrons };
  }

  const realE = new THREE.InstancedMesh(eGeo, eMat, POOL);
  realE.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  realE.frustumCulled = false;
  const mirrorE = new THREE.InstancedMesh(eGeo, eMat, POOL);
  mirrorE.instanceMatrix = realE.instanceMatrix; // the mirror shows the same electrons, reflected
  mirrorE.frustumCulled = false;
  const real = buildWorld(realG, 1, realE);
  const mirror = buildWorld(mirrorG, -1, mirrorE);

  // Mirror pane
  const paneG = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4), new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  pane.rotation.y = Math.PI / 2;
  paneG.add(pane);
  const paneEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.2, 4.4)), new THREE.LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.5 }));
  paneEdge.rotation.y = Math.PI / 2;
  paneG.add(paneEdge);
  wuG.add(paneG);

  const realTitle = stage.label('OUR WORLD', [WU_X, -2.15, 0], 'big', wuG);
  realTitle.element.style.color = css(PALETTE.green);
  stage.label('⁶⁰Co electrons go mostly against the spin', [WU_X, -2.5, 0], 'muted', wuG);
  const mirrorTitle = stage.label('MIRROR WORLD: never seen', [-WU_X, -2.15, 0], 'big', wuG);
  mirrorTitle.element.style.color = css(PALETTE.red);
  const mirrorSub = stage.label('spin flipped, so electrons go along it', [-WU_X, -2.5, 0], 'muted', wuG);
  const spinLabelR = stage.label('spin J', [WU_X + 0.42, 1.55, 0], '', wuG);
  spinLabelR.element.style.color = css(SPIN_COL);
  const spinLabelM = stage.label('spin J', [-WU_X + 0.42, -1.55, 0], '', wuG);
  spinLabelM.element.style.color = css(SPIN_COL);
  const mirrorLabels = [mirrorTitle, mirrorSub, spinLabelM];

  let mirrorOn = true;
  let polarization = 1;
  let meanA = -polarization * coTab.meanBeta;

  function rebuildLobe(): void {
    meanA = -polarization * coTab.meanBeta;
    const pts: THREE.Vector2[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI;
      const r = 1.25 * (1 + meanA * Math.cos(th));
      pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.sin(th)), r * Math.cos(th)));
    }
    lobeGeo?.dispose();
    lobeGeo = new THREE.LatheGeometry(pts, 28);
    for (const l of lobes) l.geometry = lobeGeo;
  }

  // Electron pool (positions relative to the nucleus)
  const ex = new Float32Array(POOL);
  const ey = new Float32Array(POOL);
  const ez = new Float32Array(POOL);
  const evx = new Float32Array(POOL);
  const evy = new Float32Array(POOL);
  const evz = new Float32Array(POOL);
  const alive = new Uint8Array(POOL);
  let nUp = 0;
  let nDown = 0;
  let emitAcc = 0;
  const m4 = new THREE.Matrix4();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);

  function resetWu(): void {
    nUp = 0;
    nDown = 0;
    alive.fill(0);
  }

  function emit(): void {
    let k = -1;
    for (let i = 0; i < POOL; i++) if (!alive[i]) { k = i; break; }
    if (k < 0) return;
    const T = sampleT(coTab, Math.random());
    const b = betaOf(T);
    const c = sampleCosTheta(-polarization * b, Math.random()); // A = -1 for Co-60
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    const phi = Math.random() * Math.PI * 2;
    const v = 0.5 + 2.2 * b;
    evx[k] = v * s * Math.cos(phi);
    evy[k] = v * c;
    evz[k] = v * s * Math.sin(phi);
    ex[k] = (evx[k] / v) * NUC_R;
    ey[k] = (evy[k] / v) * NUC_R;
    ez[k] = (evz[k] / v) * NUC_R;
    alive[k] = 1;
    if (c > 0) nUp++;
    else nDown++;
  }

  function stepWu(dt: number, t: number): void {
    real.nucleus.rotation.y = t * 1.6;
    mirror.nucleus.rotation.y = t * 1.6;
    emitAcc += dt * WU_RATE;
    while (emitAcc >= 1) { emit(); emitAcc -= 1; }
    for (let i = 0; i < POOL; i++) {
      if (alive[i]) {
        ex[i] += evx[i] * dt;
        ey[i] += evy[i] * dt;
        ez[i] += evz[i] * dt;
        if (ex[i] * ex[i] + ey[i] * ey[i] + ez[i] * ez[i] > WU_MAXR * WU_MAXR) alive[i] = 0;
      }
      if (alive[i]) {
        m4.makeTranslation(ex[i], ey[i], ez[i]);
        realE.setMatrixAt(i, m4);
      } else realE.setMatrixAt(i, zeroM);
    }
    realE.instanceMatrix.needsUpdate = true;
  }

  // =========================================================================
  // View 3: Yukawa vs Coulomb surfaces
  const rangeG = new THREE.Group();
  scene.add(rangeG);
  let massGeV = M_W;
  let lamUnits = rangeFm(massGeV) / FM_PER_UNIT;

  function makeSurface(color: number): { geo: THREE.BufferGeometry; mesh: THREE.Mesh; wire: THREE.Mesh } {
    const geo = new THREE.BufferGeometry();
    const nv = (NR + 1) * (NT + 1);
    const pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const idx: number[] = [];
    for (let i = 0; i < NR; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j;
        const b = a + NT + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.08 });
    const mesh = new THREE.Mesh(geo, mat);
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b1020, wireframe: true, transparent: true, opacity: 0.35 }));
    mesh.add(wire);
    return { geo, mesh, wire };
  }
  const radiusAt = (i: number) => DISC_R * Math.pow(i / NR, 1.6); // denser rings near the centre
  const base = new THREE.Color(0x172033);
  const cTmp = new THREE.Color();

  function fillSurface(geo: THREE.BufferGeometry, lam: number, color: number): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const P = pos.array as Float32Array;
    const C = col.array as Float32Array;
    const hi = cTmp.set(color);
    const hr = hi.r, hg = hi.g, hb = hi.b;
    for (let i = 0; i <= NR; i++) {
      const rho = radiusAt(i);
      const y = HMAX * surfaceHeight(rho, RHO0, lam);
      // Brightness shows r·V relative to Coulomb: the fraction of the force that survives at r.
      const f = Number.isFinite(lam) ? Math.exp(-rho / lam) : 1;
      for (let j = 0; j <= NT; j++) {
        const th = (j / NT) * Math.PI * 2;
        const k = (i * (NT + 1) + j) * 3;
        P[k] = rho * Math.cos(th);
        P[k + 1] = y;
        P[k + 2] = rho * Math.sin(th);
        C[k] = base.r + (hr - base.r) * (0.1 + 0.9 * f);
        C[k + 1] = base.g + (hg - base.g) * (0.1 + 0.9 * f);
        C[k + 2] = base.b + (hb - base.b) * (0.1 + 0.9 * f);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  const yuk = makeSurface(W_COL);
  yuk.mesh.position.x = -DISC_X;
  rangeG.add(yuk.mesh);
  const cou = makeSurface(PALETTE.amber);
  cou.mesh.position.x = DISC_X;
  rangeG.add(cou.mesh);
  fillSurface(cou.geo, Infinity, PALETTE.amber);

  // Rim circles and radial tick rings
  const ringPts = (r: number, y = 0) => Array.from({ length: 97 }, (_, i) => new THREE.Vector3(r * Math.cos((i / 96) * Math.PI * 2), y, r * Math.sin((i / 96) * Math.PI * 2)));
  for (const x of [-DISC_X, DISC_X]) {
    for (const r of [1, 2, DISC_R]) {
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts(r, -0.005)), new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: r === DISC_R ? 0.9 : 0.55 }));
      l.position.x = x;
      rangeG.add(l);
    }
    for (const r of [1, 2]) stage.label(`${(r * FM_PER_UNIT * 1e3).toFixed(0)}×10⁻³ fm`, [x + 0.15, HMAX * surfaceHeight(r, RHO0, Infinity) + 0.12, r], 'muted', rangeG);
  }
  // λ ring on the Yukawa surface, updated in place
  const lamRingGeo = new THREE.BufferGeometry();
  const lamRingPos = new Float32Array(97 * 3);
  lamRingGeo.setAttribute('position', new THREE.BufferAttribute(lamRingPos, 3));
  const lamRing = new THREE.LineLoop(lamRingGeo, new THREE.LineBasicMaterial({ color: PALETTE.white }));
  lamRing.position.x = -DISC_X;
  rangeG.add(lamRing);
  const lamLabel = stage.label('r = λ', [0, 0, 0], '', rangeG);

  const yukTitle = stage.label('Yukawa e^(−r/λ)/r · massive W', [-DISC_X, -0.1, DISC_R + 0.45], 'big', rangeG);
  yukTitle.element.style.color = css(W_COL);
  const couTitle = stage.label('Coulomb 1/r · massless photon', [DISC_X, -0.1, DISC_R + 0.45], 'big', rangeG);
  couTitle.element.style.color = css(PALETTE.amber);

  function updateRange(): void {
    lamUnits = rangeFm(massGeV) / FM_PER_UNIT;
    fillSurface(yuk.geo, lamUnits, W_COL);
    const show = Number.isFinite(lamUnits) && lamUnits < DISC_R * 0.98;
    lamRing.visible = show;
    lamLabel.visible = show;
    if (show) {
      const r = Math.max(lamUnits, 0.02);
      const h = HMAX * RHO0 * Math.exp(-Math.max(r, RHO0) / lamUnits) / Math.max(r, RHO0) + 0.01;
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        lamRingPos[i * 3] = r * Math.cos(a);
        lamRingPos[i * 3 + 1] = h;
        lamRingPos[i * 3 + 2] = r * Math.sin(a);
      }
      (lamRingGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      lamRingGeo.computeBoundingSphere();
      lamLabel.position.set(-DISC_X + r * 0.7, h + 0.25, r * 0.7);
    }
    drawInset();
    writeLegend();
  }

  // =========================================================================
  // Overlays: legend card (top left, hidden on phones) and inset plot (top right)
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '3', pointerEvents: 'none', maxWidth: '235px',
    background: 'rgba(7,10,18,0.9)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 11px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  const inset = document.createElement('canvas');
  inset.className = 'wk-inset';
  inset.width = 560;
  inset.height = 300;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '280px', height: '150px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;

  const sw = (c: number, txt: string, shape = '●') => `<div><span style="color:${css(c)}">${shape}</span> ${txt}</div>`;
  function writeLegend(): void {
    let html = '';
    if (view === 'beta') {
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">n → p + e⁻ + ν̄ₑ</div>`
        + sw(U_COL, 'up quark u (+2/3)') + sw(D_COL, 'down quark d (−1/3)') + sw(W_COL, 'W⁻ boson') + sw(E_COL, 'electron e⁻') + sw(NU_COL, 'antineutrino ν̄ₑ') + sw(SPIN_COL, 'spin', '↑');
    } else if (view === 'wu') {
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">Wu, 1957: ⁶⁰Co beta decay</div>`
        + sw(SPIN_COL, 'nuclear spin', '↑') + sw(E_COL, 'beta electrons') + sw(E_COL, 'rate ∝ 1 − P(v/c)cos θ', '◌');
    } else {
      const lam = rangeFm(massGeV);
      html = `<div style="color:#dfe6f3;font:600 13px/1.3 'Space Grotesk',sans-serif;margin-bottom:4px">Same coupling, different carrier mass</div>`
        + sw(W_COL, `e^(−r/λ)/r, λ = ${Number.isFinite(lam) ? lam.toExponential(2) + ' fm' : '∞'}`, '■') + sw(PALETTE.amber, '1/r, λ = ∞', '■')
        + `<div style="color:#8391ab;margin-top:2px">height ∝ V(r), brightness ∝ r·V(r)</div>`;
    }
    legend.innerHTML = html;
  }

  function drawInset(): void {
    const W = inset.width;
    const H = inset.height;
    const g = ictx;
    g.clearRect(0, 0, W, H);
    const L = 54, R = W - 20, T = 58, Bt = H - 44;
    g.font = '22px JetBrains Mono, monospace';
    g.fillStyle = '#8391ab';
    g.strokeStyle = '#243049';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(L, T - 10);
    g.lineTo(L, Bt);
    g.lineTo(R, Bt);
    g.stroke();
    if (view === 'beta') {
      g.fillText(`electron energy T (MeV) · ${hTotal} decays`, 16, 32);
      const Q = Q_NEUTRON;
      const X = (t: number) => L + (t / 0.8) * (R - L);
      const binW = Q / HB;
      let maxBin = 0;
      for (let i = 0; i < HB; i++) maxBin = Math.max(maxBin, hist[i]);
      const curvePeak = hTotal > 0 ? (hTotal * binW * nTab.peak) / nTab.norm : 1;
      const ymax = Math.max(maxBin, curvePeak) * 1.12 || 1;
      const Yv = (v: number) => Bt - (v / ymax) * (Bt - T);
      g.fillStyle = 'rgba(94,227,154,0.55)';
      for (let i = 0; i < HB; i++) {
        if (!hist[i]) continue;
        const x0 = X(i * binW);
        const x1 = X((i + 1) * binW);
        g.fillRect(x0 + 1, Yv(hist[i]), x1 - x0 - 2, Bt - Yv(hist[i]));
      }
      g.strokeStyle = '#dfe6f3';
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = (Q * i) / 120;
        const f = hTotal > 0 ? (hTotal * binW * betaSpectrumCached(t)) / nTab.norm : betaSpectrumCached(t) / nTab.peak;
        const x = X(t);
        const y = Yv(f);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      // Q marker
      g.strokeStyle = PALETTE_CSS.amber;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(X(Q), T - 10);
      g.lineTo(X(Q), Bt);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = PALETTE_CSS.amber;
      g.fillText('Q = 0.782', X(Q) - 132, T + 4);
      // last decay marker
      if (recorded || hTotal > 0) {
        g.fillStyle = PALETTE_CSS.green;
        g.beginPath();
        g.moveTo(X(Te), Bt + 2);
        g.lineTo(X(Te) - 8, Bt + 16);
        g.lineTo(X(Te) + 8, Bt + 16);
        g.fill();
      }
      g.fillStyle = '#56627c';
      for (const t of [0, 0.2, 0.4, 0.6, 0.8]) g.fillText(String(t), X(t) - (t ? 18 : 6), H - 12);
    } else if (view === 'wu') {
      const n = nUp + nDown;
      g.fillText(`electrons counted · ${n}`, 16, 32);
      const fracAlongReal = n ? nUp / n : 0;
      const fracAlongMirror = n ? nDown / n : 0;
      const rows: [string, number, number][] = [
        ['our world  along spin', fracAlongReal, PALETTE.green],
        ['our world  against', 1 - fracAlongReal, PALETTE.green],
        ['mirror     along spin', fracAlongMirror, PALETTE.red],
        ['mirror     against', 1 - fracAlongMirror, PALETTE.red],
      ];
      const rowH = 48;
      rows.forEach(([name, f, c], i) => {
        if (i >= 2 && !mirrorOn) return;
        const y = 56 + i * rowH;
        g.fillStyle = '#8391ab';
        g.fillText(name, 16, y + 26);
        const x0 = 300;
        g.fillStyle = '#1c2436';
        g.fillRect(x0, y + 6, R - x0 - 70, 26);
        g.fillStyle = css(c);
        g.globalAlpha = i % 2 === 0 ? 1 : 0.45;
        g.fillRect(x0, y + 6, (R - x0 - 70) * (n ? f : 0), 26);
        g.globalAlpha = 1;
        g.fillStyle = '#dfe6f3';
        g.fillText(n ? `${Math.round(f * 100)}%` : '·', R - 60, y + 28);
      });
    } else {
      g.fillText('r·V(r) vs r (10⁻³ fm): force left at r', 16, 32);
      const X = (r: number) => L + (r / (DISC_R * FM_PER_UNIT)) * (R - L);
      const Yv = (v: number) => Bt - v * (Bt - T);
      g.strokeStyle = PALETTE_CSS.amber;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(X(0), Yv(1));
      g.lineTo(X(DISC_R * FM_PER_UNIT), Yv(1));
      g.stroke();
      const lam = rangeFm(massGeV);
      g.strokeStyle = PALETTE_CSS.cyan;
      g.beginPath();
      for (let i = 0; i <= 100; i++) {
        const r = (DISC_R * FM_PER_UNIT * i) / 100;
        const v = Number.isFinite(lam) ? Math.exp(-r / lam) : 1;
        if (i === 0) g.moveTo(X(r), Yv(v));
        else g.lineTo(X(r), Yv(v));
      }
      g.stroke();
      if (Number.isFinite(lam) && lam < DISC_R * FM_PER_UNIT) {
        g.setLineDash([5, 6]);
        g.strokeStyle = '#dfe6f3';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(X(lam), T - 10);
        g.lineTo(X(lam), Bt);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#dfe6f3';
        g.fillText('λ', X(lam) + 6, T + 10);
        g.fillText('1/e', L + 6, Yv(Math.exp(-1)) - 6);
      }
      g.fillStyle = '#56627c';
      for (const r of [0, 1, 2, 3, 4, 5]) g.fillText(String(r), X(r * 1e-3) - 6, H - 12);
    }
  }

  // Cached spectrum curve for plotting (no allocation per draw)
  const curveN = 241;
  const curve = new Float64Array(curveN);
  for (let i = 0; i < curveN; i++) curve[i] = betaSpectrum((Q_NEUTRON * i) / (curveN - 1), Q_NEUTRON, 1);
  function betaSpectrumCached(t: number): number {
    const k = Math.round((t / Q_NEUTRON) * (curveN - 1));
    return curve[Math.max(0, Math.min(curveN - 1, k))];
  }

  // =========================================================================
  // Controls
  const ui = new Panel(panel);
  ui.section('View');
  ui.select<View>({
    key: 'view', label: 'Scene', value: view,
    options: [{ value: 'beta', label: 'Beta decay' }, { value: 'wu', label: 'Wu mirror' }, { value: 'range', label: 'Range' }],
    onChange: (v) => setView(v),
  });

  ui.section('Beta decay');
  const secBeta = ui.root.lastElementChild as HTMLElement;
  const autoCtl = ui.toggle({ key: 'auto', label: 'Play continuously', value: auto, onChange: (v) => { auto = v; if (!v) stepPhase = phaseOf(dc); } });
  ui.buttons([
    { label: 'Step ▸', primary: true, key: 'step', onClick: () => stepDecay() },
    { label: 'Add 1000 decays', key: 'decays', onClick: () => { for (let i = 0; i < 1000; i++) addToHist(sampleT(nTab, Math.random())); ffUsed = true; drawInset(); } },
    { label: 'Clear', onClick: () => { hist.fill(0); hTotal = 0; hMax = 0; hSum = 0; ffUsed = false; drawInset(); } },
  ]);
  const rPhase = ui.readout('phase', 'step');
  const rTe = ui.readout('Te', 'electron T', 'MeV');
  const rEnu = ui.readout('Enu', 'antineutrino E', 'MeV');
  const rSum = ui.readout('Q', 'sum (= Q)', 'MeV');
  const rN = ui.readout('decays', 'decays');
  const rMax = ui.readout('maxT', 'highest T seen', 'MeV');
  const rMean = ui.readout('meanT', 'mean T (theory)');
  ui.note(renderMath(`Slow motion. The virtual W⁻ exists for about $\\hbar/M_Wc^2 \\approx 8\\times10^{-27}$ s. The proton recoil is drawn ${RECOIL_BOOST} times too large.`));
  ui.note(renderMath('The spectrum uses the allowed shape $N(T) \\propto pE(Q-T)^2F$ with a non-relativistic Fermi function for $Z = 1$. The electron and antineutrino share $Q$ differently every time.'));

  ui.section('Wu experiment');
  const secWu = ui.root.lastElementChild as HTMLElement;
  ui.toggle({ key: 'mirror', label: 'Show the mirror world', value: mirrorOn, onChange: (v) => { mirrorOn = v; applyMirror(); drawInset(); } });
  ui.slider({ key: 'pol', label: 'Nuclear polarisation P', min: 0, max: 1, step: 0.05, value: polarization, onInput: (v) => { polarization = v; rebuildLobe(); resetWu(); } });
  ui.buttons([{ label: 'Reset counts', onClick: () => { resetWu(); drawInset(); } }]);
  const rUp = ui.readout('along', 'along spin (ours)');
  const rDn = ui.readout('alongMirror', 'along spin (mirror)');
  const rAsym = ui.readout('asym', 'asymmetry');
  const rAsymTh = ui.readout('asymTh', 'expected −P⟨v/c⟩/2');
  ui.note('A mirror reverses the turning of the nucleus, so it reverses the spin. It does not reverse which way the electrons fly.');
  ui.note(renderMath('Wu cooled the cobalt to millikelvin temperatures so the nuclear spins stayed lined up. At room temperature $P \\approx 0$ and the asymmetry vanishes.'));

  ui.section('Range and mediator mass');
  const secRange = ui.root.lastElementChild as HTMLElement;
  const massCtl = ui.slider({ key: 'mass', label: 'Mediator mass M', min: 0, max: 200, step: 0.01, value: massGeV, unit: 'GeV', format: (v) => v.toFixed(2), onInput: (v) => { massGeV = v; updateRange(); } });
  ui.buttons([
    { label: 'W (80.37)', onClick: () => massCtl.set(M_W) },
    { label: 'Z (91.19)', onClick: () => massCtl.set(M_Z) },
    { label: 'Massless', onClick: () => massCtl.set(0) },
  ]);
  const rRange = ui.readout('range', 'range λ = ħ/Mc');
  const rG = ui.readout('g', 'coupling g (fixed)');
  const rGF = ui.readout('GF', 'G_F = √2g²/8M²', 'GeV⁻²');
  const rTau = ui.readout('tauMu', 'muon lifetime');
  ui.note(renderMath(`At the real W mass, $\\Gamma = G_F^2 m_\\mu^5/192\\pi^3$ gives $\\tau_\\mu = ${(MU_LIFE_REF * 1e6).toFixed(3)}\\ \\mu$s at tree level, 0.44% below the measured 2.197 μs. Small QED and electron-mass corrections close the gap.`));
  rG(G_WEAK.toFixed(4));

  function stepDecay(): void {
    if (auto) {
      auto = false;
      autoCtl.set(false, false);
      stepPhase = phaseOf(dc);
    }
    if (stepPhase < 3) {
      stepPhase++;
      manualSteps++;
      dc = B[stepPhase];
      if (stepPhase === 3 && manualSteps >= 3) watched = true;
    } else {
      newDecay();
    }
  }

  function applyMirror(): void {
    mirrorG.visible = mirrorOn;
    paneG.visible = mirrorOn;
    for (const l of mirrorLabels) l.visible = mirrorOn;
  }

  function setView(v: View): void {
    view = v;
    betaG.visible = v === 'beta';
    wuG.visible = v === 'wu';
    rangeG.visible = v === 'range';
    secBeta.style.display = v === 'beta' ? '' : 'none';
    secWu.style.display = v === 'wu' ? '' : 'none';
    secRange.style.display = v === 'range' ? '' : 'none';
    if (v === 'wu') applyMirror();
    stage.flyTo(CAM[v].pos, CAM[v].target, 1.0);
    writeLegend();
    drawInset();
  }

  // =========================================================================
  // Frame loop
  let insetTimer = 0;
  stage.onFrame((dt, t) => {
    if (view === 'beta') {
      const hold = auto ? Infinity : B[stepPhase + 1] - 1e-4;
      dc = Math.min(dc + dt, hold);
      if (!recorded && dc >= SPLIT) {
        recorded = true;
        addToHist(Te);
        drawInset();
      }
      if (auto && dc >= B[4]) newDecay();
      if (auto) stepPhase = phaseOf(dc);
      drawBeta(t);
      if (eMesh.visible) {
        eTrail.push(eMesh.position.x, eMesh.position.y, eMesh.position.z);
        nuTrail.push(nuG.position.x, nuG.position.y, nuG.position.z);
      }
      const ph = phaseOf(dc);
      rPhase(`${ph + 1} / 4`);
      const shown = dc >= SPLIT;
      rTe(shown ? Te.toFixed(3) : '·');
      rEnu(shown ? Enu.toFixed(3) : '·');
      rSum(shown ? (Te + Enu).toFixed(3) : Q_NEUTRON.toFixed(3));
      rN(hTotal);
      rMax(hTotal ? hMax.toFixed(3) : '·');
      rMean(hTotal ? `${(hSum / hTotal).toFixed(3)} (${nTab.meanT.toFixed(3)})` : `· (${nTab.meanT.toFixed(3)})`);
    } else if (view === 'wu') {
      stepWu(dt, t);
      const n = nUp + nDown;
      rUp(n ? `${((nUp / n) * 100).toFixed(1)}%` : '·');
      rDn(mirrorOn ? (n ? `${((nDown / n) * 100).toFixed(1)}%` : '·') : 'hidden');
      rAsym(n ? ((nUp - nDown) / n).toFixed(3) : '·');
      rAsymTh((meanA / 2).toFixed(3));
      insetTimer += dt;
      if (insetTimer > 0.2) { insetTimer = 0; drawInset(); }
    } else {
      const lam = rangeFm(massGeV);
      rRange(Number.isFinite(lam) ? `${lam.toExponential(3)} fm` : '∞');
      const gf = fermiFromG(G_WEAK, massGeV);
      rGF(Number.isFinite(gf) ? gf.toExponential(4) : '∞');
      const tau = Number.isFinite(gf) ? muonLifetime(gf) : 0;
      rTau(tau > 0 ? (tau >= 1e-3 ? `${tau.toExponential(2)} s` : `${(tau * 1e6).toPrecision(4)} μs`) : '0 (contact theory fails)');
    }
  });

  // Initial state
  newDecay();
  rebuildLobe();
  updateRange();
  setView('beta');
  stage.camera.position.set(...CAM.beta.pos);

  return {
    state: () => {
      const n = nUp + nDown;
      return {
        view,
        phase: phaseOf(dc),
        auto,
        watched,
        decays: hTotal,
        ffUsed,
        maxT: hMax,
        meanT: hTotal ? hSum / hTotal : 0,
        lastT: Te,
        Q: Q_NEUTRON,
        mirror: mirrorOn,
        polarization,
        wuCount: n,
        alongReal: n ? nUp / n : 0.5,
        alongMirror: n ? nDown / n : 0.5,
        mass: massGeV,
        rangeFm: rangeFm(massGeV),
        rangeInfinite: !Number.isFinite(rangeFm(massGeV)),
      };
    },
    dispose: () => {
      lobeGeo?.dispose();
      for (const d of disposables) d.dispose();
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const PALETTE_CSS = {
  amber: css(PALETTE.amber),
  cyan: css(PALETTE.cyan),
  green: css(PALETTE.green),
};

const topic: Topic = {
  id: 'weak-force',
  number: 71,
  title: 'The Weak Force',
  domain: 'particle',
  level: 2,
  status: 'live',
  tagline: 'The force that powers the Sun and prefers left-handed particles.',
  content,
  mount,
};

export default topic;
