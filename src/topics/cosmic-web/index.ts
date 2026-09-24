import * as THREE from 'three';
import { createStage, PALETTE } from '../../core/stage.ts';
import { Panel, css, type Control } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import {
  A_INIT, FOF_B, FOF_MIN, NG, PMSim, binK, cicAssign, cicSample, fof, growth, growthCheck,
  type Background, type Halos, type Shape,
} from './physics.ts';

const SCENE = 10; // scene units per box side
const DM = 32; // display density mesh
const DM3 = DM * DM * DM;
const PLAY_SECONDS = 16;
const MAX_GAL = 400;
const CAM: [number, number, number] = [10.5, 7.2, 13.5];
const GOLD = 0xe9c46a;

/** Play slider u in [0, 1] maps to a = a_i + (1 - a_i) u^2, which spends more time at late, eventful epochs. */
const aOfU = (u: number) => A_INIT + (1 - A_INIT) * u * u;
const uOfA = (a: number) => Math.sqrt(Math.max(0, (a - A_INIT) / (1 - A_INIT)));
const fmtZ = (z: number) => (z < 0.005 ? '0' : z < 10 ? z.toFixed(2) : z.toFixed(1));
const fmtMass = (m: number) => {
  const e = Math.floor(Math.log10(m));
  return `${(m / 10 ** e).toFixed(1)}×10${String(e).replace(/./g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])} M☉/h`;
};

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 40);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const lg = g.createLinearGradient(64 - 62 * dx, 64 - 62 * dy, 64 + 62 * dx, 64 + 62 * dy);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    if (dx) g.fillRect(2, 62, 124, 4);
    else g.fillRect(62, 2, 4, 124);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(ring = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (ring) {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(30, 30, 4, 4);
  } else {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Density colour ramp in t = (log10(1 + delta) + 1) / 2.9: dim indigo voids, violet sheets, amber filaments.
// Per-particle brightness falls again in knots, because hundreds of particles overlap there and add up to a gold glow.
const RAMP: [number, number, number, number][] = [
  [0, 0.03, 0.035, 0.12],
  [0.3, 0.13, 0.16, 0.46],
  [0.45, 0.42, 0.34, 0.8],
  [0.62, 0.85, 0.52, 0.2],
  [0.8, 0.5, 0.34, 0.12],
  [1, 0.3, 0.2, 0.08],
];
function ramp(t: number, out: Float32Array, o: number): void {
  if (t <= 0) {
    out[o] = RAMP[0][1];
    out[o + 1] = RAMP[0][2];
    out[o + 2] = RAMP[0][3];
    return;
  }
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0] || i === RAMP.length - 1) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const f = Math.min(1, (t - a[0]) / (b[0] - a[0]));
      out[o] = a[1] + f * (b[1] - a[1]);
      out[o + 1] = a[2] + f * (b[2] - a[2]);
      out[o + 2] = a[3] + f * (b[3] - a[3]);
      return;
    }
  }
}
const RAMP_CSS = 'linear-gradient(90deg,#080917,#212976,#6b57cc,#f29a3d,#e6b35c,#f2d18c)';

function mount({ viewport, panel }: MountContext): TopicInstance {
  const stage = createStage(viewport, { camera: CAM, target: [0, 0, 0], fov: 45, near: 0.02, far: 400, lights: false });
  const { scene, camera, controls, renderer } = stage;

  // ------------------------------------------------------------ parameters and state
  let np = 32;
  let seed = 1;
  let slope = 0.96;
  let shape: Shape = 'cdm';
  let warm = false;
  let bg: Background = 'lcdm';
  let showGal = true;
  let fly = false;
  let playing = true;
  let u = 0; // requested time on the slider
  let touched = false;
  let camTouched = false;
  let dispA = -1; // scale factor currently drawn
  let dispStep = -1;
  let halos: Halos = { count: 0, centres: new Float32Array(0), sizes: new Int32Array(0) };
  let halosA = -1;
  let fofTimer = 0;
  let targetDelta = 0;
  let growthNow = 1;
  let flyT = 0;
  const coldRefs = new Map<string, number>();
  const cfgKey = () => `${np}|${seed}|${slope}|${shape}|${bg}`;

  let sim = new PMSim({ np, seed, spec: { slope, shape, warm }, bg });

  // ------------------------------------------------------------ scene
  const glowTex = glowTexture();
  const ringTex = glowTexture(true);
  const starTex = starTexture();

  const boxLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SCENE, SCENE, SCENE)),
    new THREE.LineBasicMaterial({ color: PALETTE.gridMajor, transparent: true, opacity: 0.8 }),
  );
  scene.add(boxLines);
  const sizeLabel = stage.label('box side 50 Mpc/h ≈ 240 million light years', [SCENE / 2 + 0.2, -SCENE / 2 - 0.4, 0], 'muted');

  let disp = new Float32Array(sim.n * 3); // positions in cells
  let scaled = new Float32Array(sim.n * 3); // positions in display-mesh cells
  let pGeo = new THREE.BufferGeometry();
  const pMat = new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  let points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const dens = new Float64Array(DM3);
  const tmp = new Float64Array(DM3);

  function buildGeometry(): void {
    scene.remove(points);
    pGeo.dispose();
    disp = new Float32Array(sim.n * 3);
    scaled = new Float32Array(sim.n * 3);
    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sim.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sim.n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    pMat.size = np >= 64 ? 0.15 : 0.28;
    scene.add(points);
  }
  buildGeometry();

  // Galaxies: per-point size shader so heavier halos glow larger.
  const gPos = new Float32Array(MAX_GAL * 3);
  const gSize = new Float32Array(MAX_GAL);
  const gCol = new Float32Array(MAX_GAL * 3);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('gsize', new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('gcol', new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setDrawRange(0, 0);
  const gMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: starTex }, scale: { value: 400 } },
    vertexShader: `attribute float gsize; attribute vec3 gcol; varying vec3 vC; uniform float scale;
      void main(){ vC = gcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = gsize * scale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.a * 2.2, t.a); }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const galaxies = new THREE.Points(gGeo, gMat);
  galaxies.frustumCulled = false;
  galaxies.renderOrder = 4;
  scene.add(galaxies);
  const bigLabel = stage.label('', [0, 0, 0], 'muted');
  bigLabel.element.style.color = css(GOLD);

  // Camera target ring and its density label
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: PALETTE.cyan, transparent: true, depthTest: false, opacity: 0.9, sizeAttenuation: false }));
  ring.scale.setScalar(0.045);
  ring.renderOrder = 5;
  scene.add(ring);
  const ringLabel = stage.label('', [0, 0, 0], 'muted');
  ringLabel.element.style.color = css(PALETTE.cyan);

  const toScene = (c: number) => (c / NG - 0.5) * SCENE;

  // ------------------------------------------------------------ overlays
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.45 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">Dark matter particles</div>
<div>Colour = local density δ</div>
<div style="height:6px;border-radius:3px;margin:4px 0 2px;background:${RAMP_CSS}"></div>
<div style="display:flex;justify-content:space-between;color:#8391ab"><span>void</span><span>wall</span><span>filament</span><span>knot</span></div>
<div style="margin-top:5px"><span style="color:${css(GOLD)}">✦</span> halos found by friends-of-friends (≥ ${FOF_MIN} particles), where galaxies form</div>
<div><span style="color:${css(PALETTE.cyan)}">◯</span> camera target, with smoothed δ</div>`;
  viewport.appendChild(legend);

  const PW = 600;
  const PH = 400;
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
  const X1 = PW - 16;
  const Y0 = 58;
  const Y1 = PH - 50;
  const LK0 = Math.log10(binK(1)) - 0.05;
  const LK1 = Math.log10(binK(NG / 2)) + 0.05;
  const LP0 = -2;
  const LP1 = 4.6;
  const xOf = (k: number) => X0 + ((Math.log10(k) - LK0) / (LK1 - LK0)) * (X1 - X0);
  const yOf = (p: number) => Y1 - ((Math.log10(Math.max(1e-6, p)) - LP0) / (LP1 - LP0)) * (Y1 - Y0);

  function drawPlot(): void {
    const c = pctx;
    c.clearRect(0, 0, PW, PH);
    c.font = '22px JetBrains Mono, monospace';
    c.fillStyle = '#8391ab';
    c.fillText(`power spectrum P(k), z = ${fmtZ(1 / dispA - 1)}`, 16, 32);
    c.strokeStyle = '#243049';
    c.lineWidth = 1;
    c.font = '18px JetBrains Mono, monospace';
    for (let lp = -2; lp <= 4; lp += 2) {
      const y = yOf(10 ** lp);
      c.beginPath();
      c.moveTo(X0, y);
      c.lineTo(X1, y);
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(`10${lp < 0 ? '⁻' : ''}${'⁰¹²³⁴'[Math.abs(lp)]}`, 18, y + 6);
    }
    for (const k of [0.2, 0.5, 1, 2]) {
      const x = xOf(k);
      c.beginPath();
      c.moveTo(x, Y0);
      c.lineTo(x, Y1);
      c.stroke();
      c.fillStyle = '#56627c';
      c.fillText(String(k), x - 10, Y1 + 22);
    }
    c.fillText('k [h/Mpc]', X1 - 96, Y1 + 42);
    const kmax = np / 2;
    const line = (pk: Float32Array, scale: number, color: string, width: number, dash: number[]) => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.setLineDash(dash);
      c.beginPath();
      for (let b = 1; b < kmax; b++) {
        const x = xOf(binK(b));
        const y = yOf(pk[b] * scale);
        if (b === 1) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([]);
    };
    const p0 = sim.pk[0];
    const g = growth(dispA, sim.cosmo) / growth(A_INIT, sim.cosmo);
    line(p0, 1, '#3a4660', 2, []);
    line(p0, g * g, css(PALETTE.cyan), 2.5, [8, 6]);
    line(sim.pk[dispStep], 1, css(GOLD), 4, []);
    c.font = '18px JetBrains Mono, monospace';
    c.fillStyle = css(GOLD);
    c.fillText('measured', X1 - 250, Y0 + 12);
    c.fillStyle = css(PALETTE.cyan);
    c.fillText('linear × D²', X1 - 130, Y0 + 12);
    c.fillStyle = '#56627c';
    c.fillText('z = 50', X1 - 250, Y0 + 36);
  }

  // ------------------------------------------------------------ display update
  function smooth(src: Float64Array, dst: Float64Array, sx: number, sy: number, sz: number): void {
    const M = DM - 1;
    for (let i = 0; i < DM; i++)
      for (let j = 0; j < DM; j++)
        for (let l = 0; l < DM; l++) {
          const id = (i * DM + j) * DM + l;
          const m = (((i - sx) & M) * DM + ((j - sy) & M)) * DM + ((l - sz) & M);
          const p = (((i + sx) & M) * DM + ((j + sy) & M)) * DM + ((l + sz) & M);
          dst[id] = 0.25 * src[m] + 0.5 * src[id] + 0.25 * src[p];
        }
  }

  function updateDisplay(a: number): void {
    dispA = sim.positionsAt(a, disp);
    dispStep = sim.stepAt(dispA);
    const n = sim.n;
    const sc = DM / NG;
    for (let k = 0; k < n * 3; k++) scaled[k] = disp[k] * sc;
    cicAssign(scaled, n, tmp, DM, DM3 / n);
    smooth(tmp, dens, 1, 0, 0);
    smooth(dens, tmp, 0, 1, 0);
    smooth(tmp, dens, 0, 0, 1);
    const pos = pGeo.attributes.position.array as Float32Array;
    const col = pGeo.attributes.color.array as Float32Array;
    for (let q = 0; q < n; q++) {
      const o = q * 3;
      pos[o] = toScene(disp[o]);
      pos[o + 1] = toScene(disp[o + 1]);
      pos[o + 2] = toScene(disp[o + 2]);
      const d = cicSample(dens, DM, scaled[o], scaled[o + 1], scaled[o + 2]);
      const t = (Math.log10(Math.max(0.05, d)) + 1) / 2.9;
      ramp(t, col, o);
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    growthNow = growthCheck(sim, dispStep);
    drawPlot();
  }

  function runFof(): void {
    halos = fof(disp, sim.n, NG, (FOF_B * NG) / np, FOF_MIN);
    halosA = dispA;
    const cnt = Math.min(MAX_GAL, halos.count);
    for (let h = 0; h < cnt; h++) {
      gPos[h * 3] = toScene(halos.centres[h * 3]);
      gPos[h * 3 + 1] = toScene(halos.centres[h * 3 + 1]);
      gPos[h * 3 + 2] = toScene(halos.centres[h * 3 + 2]);
      const lg = Math.log10(halos.sizes[h] / FOF_MIN);
      gSize[h] = 0.85 + 0.5 * lg;
      const b = Math.min(1, 0.6 + 0.25 * lg);
      gCol[h * 3] = b;
      gCol[h * 3 + 1] = b * 0.97;
      gCol[h * 3 + 2] = b * 0.85;
    }
    gGeo.setDrawRange(0, cnt);
    gGeo.attributes.position.needsUpdate = true;
    (gGeo.attributes.gsize as THREE.BufferAttribute).needsUpdate = true;
    (gGeo.attributes.gcol as THREE.BufferAttribute).needsUpdate = true;
    if (halos.count > 0) {
      bigLabel.position.set(toScene(halos.centres[0]), toScene(halos.centres[1]) + 0.45, toScene(halos.centres[2]));
      bigLabel.element.textContent = `heaviest halo ${fmtMass(halos.sizes[0] * sim.massPerParticle)}`;
    }
    bigLabel.visible = showGal && halos.count > 0;
    if (!warm && 1 / dispA - 1 < 0.05) coldRefs.set(cfgKey(), halos.count);
  }

  // ------------------------------------------------------------ rebuild on parameter change
  function rebuild(): void {
    const oldN = sim.n;
    sim = new PMSim({ np, seed, spec: { slope, shape, warm }, bg });
    if (sim.n !== oldN) buildGeometry();
    u = 0;
    zSlider.set(0, false);
    setPlaying(true);
    halos = { count: 0, centres: new Float32Array(0), sizes: new Int32Array(0) };
    halosA = -1;
    gGeo.setDrawRange(0, 0);
    bigLabel.visible = false;
    dispA = -1;
    updateDisplay(A_INIT);
  }

  // ------------------------------------------------------------ camera
  const pathPoint = (t: number, out: THREE.Vector3) =>
    out.set(3.4 * Math.sin(t), 2.6 * Math.sin(1.3 * t + 0.7), 3.4 * Math.cos(0.8 * t));
  const tmpV = new THREE.Vector3();
  const tgtV = new THREE.Vector3();
  controls.addEventListener('start', () => {
    camTouched = true;
  });

  // ------------------------------------------------------------ frame loop
  let labelTimer = 0;
  stage.onFrame((dt) => {
    // Compute ahead: one PM step per frame, two if steps are cheap.
    if (!sim.done) {
      sim.advance();
      if (!sim.done && sim.lastMs < 12) sim.advance();
    }
    if (playing) {
      u = Math.min(1, u + dt / PLAY_SECONDS, uOfA(sim.frontier));
      zSlider.set(u, false);
      if (u >= 1) setPlaying(false);
    }
    const want = Math.min(aOfU(u), sim.frontier);
    if (Math.abs(want - dispA) > 1e-7) {
      updateDisplay(want);
    }
    fofTimer += dt;
    if (halosA !== dispA) {
      const busy = playing || !sim.done;
      const wait = np >= 64 ? (busy ? Infinity : 0.3) : busy ? 0.6 : 0.2;
      if (fofTimer > wait) {
        fofTimer = 0;
        runFof();
      }
    }
    galaxies.visible = showGal;

    if (fly) {
      flyT += dt * 0.06;
      pathPoint(flyT, tmpV);
      pathPoint(flyT + 0.35, tgtV);
      camera.position.copy(tmpV);
      controls.target.copy(tgtV);
    }
    const tg = controls.target;
    ring.position.copy(tg);
    const cx = ((tg.x / SCENE + 0.5) * DM) % DM;
    const cy = ((tg.y / SCENE + 0.5) * DM) % DM;
    const cz = ((tg.z / SCENE + 0.5) * DM) % DM;
    targetDelta = cicSample(dens, DM, (cx + DM) % DM, (cy + DM) % DM, (cz + DM) % DM) - 1;
    labelTimer += dt;
    if (labelTimer > 0.15) {
      labelTimer = 0;
      ringLabel.position.set(tg.x, tg.y - 0.42, tg.z);
      ringLabel.element.textContent = `δ = ${targetDelta.toFixed(2)}${targetDelta < -0.8 ? ' · void' : targetDelta > 10 ? ' · knot' : ''}`;
    }
    gMat.uniforms.scale.value = renderer.domElement.height / 2 / Math.tan((camera as THREE.PerspectiveCamera).fov * Math.PI / 360);
    updateReadouts();
  });

  // ------------------------------------------------------------ controls
  const ui = new Panel(panel);
  ui.section('Cosmic time');
  function setPlaying(v: boolean): void {
    playing = v;
    playBtn.textContent = v ? 'Pause' : 'Play';
  }
  const [playBtn] = ui.buttons([
    {
      label: 'Pause', primary: true, key: 'play',
      onClick: () => {
        touched = true;
        if (!playing && u >= 0.999) u = 0;
        setPlaying(!playing);
      },
    },
    { label: 'Restart', onClick: () => { touched = true; u = 0; zSlider.set(0, false); setPlaying(true); } },
    {
      label: 'Reset view',
      onClick: () => {
        if (fly) flyCtl.set(false);
        stage.flyTo(CAM, [0, 0, 0]);
      },
    },
  ]);
  const zSlider: Control<number> = ui.slider({
    key: 'z', label: 'Redshift z', min: 0, max: 1, step: 0.001, value: 0,
    format: (v) => `${fmtZ(1 / aOfU(v) - 1)}`,
    onInput: (v) => {
      touched = true;
      u = v;
      setPlaying(false);
    },
  });

  ui.section('Universe (restarts the run)');
  ui.select<Background>({
    key: 'bg', label: 'Background', value: bg,
    options: [{ value: 'lcdm', label: 'ΛCDM' }, { value: 'eds', label: 'Einstein-de Sitter' }],
    onChange: (v) => { touched = true; bg = v; rebuild(); },
  });
  ui.select<'cold' | 'warm'>({
    key: 'dm', label: 'Dark matter', value: 'cold',
    options: [{ value: 'cold', label: 'Cold' }, { value: 'warm', label: 'Warm (0.15 keV)' }],
    onChange: (v) => { touched = true; warm = v === 'warm'; rebuild(); },
  });
  ui.select<Shape>({
    key: 'shape', label: 'Initial spectrum', value: shape,
    options: [{ value: 'cdm', label: 'CDM-like' }, { value: 'power', label: 'Pure power law' }],
    onChange: (v) => { touched = true; shape = v; rebuild(); },
  });
  ui.slider({
    key: 'slope', label: 'Spectral slope n (P ∝ kⁿ)', min: -2.5, max: 1.5, step: 0.05, value: slope,
    format: (v) => v.toFixed(2),
    onInput: (v) => { touched = true; slope = v; rebuild(); },
  });
  ui.slider({
    key: 'seed', label: 'Random seed', min: 1, max: 40, step: 1, value: seed,
    onInput: (v) => { touched = true; seed = v; rebuild(); },
  });
  ui.select<'32' | '64'>({
    key: 'np', label: 'Particles', value: '32',
    options: [{ value: '32', label: '32³ = 32,768' }, { value: '64', label: '64³ = 262,144' }],
    onChange: (v) => { touched = true; np = Number(v); rebuild(); },
  });

  ui.section('View');
  ui.toggle({
    key: 'galaxies', label: 'Galaxies at halos', value: showGal,
    onChange: (v) => { showGal = v; bigLabel.visible = v && halos.count > 0; },
  });
  const flyCtl = ui.toggle({
    key: 'fly', label: 'Fly-through camera', value: fly,
    onChange: (v) => {
      fly = v;
      camTouched = true;
      controls.enabled = !v;
      if (v) {
        flyT = Math.random() * 20;
      }
    },
  });
  ui.note('Right-drag or two-finger drag pans the target ring. The ring reads the smoothed density where it sits.');

  ui.section('Live readouts');
  const rZ = ui.readout('zr', 'redshift z / a');
  const rD = ui.readout('D', 'linear growth D/Dᵢ');
  const rG = ui.readout('growth', 'measured / linear');
  const rH = ui.readout('halos', 'FoF halos');
  const rM = ui.readout('mmax', 'heaviest halo');
  const rT = ui.readout('target', 'δ at target');
  const rC = ui.readout('progress', 'computed to z');
  const rS = ui.readout('stepms', 'PM step cost', 'ms');

  function updateReadouts(): void {
    const z = 1 / dispA - 1;
    rZ(`${fmtZ(z)} / ${dispA.toFixed(3)}`);
    rD((growth(dispA, sim.cosmo) / growth(A_INIT, sim.cosmo)).toFixed(1));
    rG(growthNow.toFixed(3));
    rH(halosA === dispA ? String(halos.count) : '…');
    rM(halos.count > 0 && halosA === dispA ? fmtMass(halos.sizes[0] * sim.massPerParticle) : '–');
    rT(targetDelta.toFixed(2));
    rC(sim.done ? 'done (z = 0)' : fmtZ(1 / sim.frontier - 1));
    rS(sim.lastMs.toFixed(0));
  }

  updateDisplay(A_INIT);

  return {
    state: () => {
      const z = 1 / dispA - 1;
      return {
        z,
        a: dispA,
        playing,
        touched,
        camTouched,
        bg,
        warm,
        shape,
        slope,
        seed,
        np,
        fly,
        galaxies: showGal,
        halos: halosA === dispA ? halos.count : 0,
        coldRef: coldRefs.get(cfgKey()) ?? 0,
        targetDelta,
        growth: growthNow,
        computed: sim.done,
      };
    },
    dispose: () => {
      plot.remove();
      legend.remove();
      sizeLabel.element.remove();
      glowTex.dispose();
      ringTex.dispose();
      starTex.dispose();
      pGeo.dispose();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'cosmic-web',
  number: 78,
  title: 'The Cosmic Web',
  domain: 'cosmology',
  level: 2,
  status: 'live',
  tagline: 'Dark matter pulls the universe into filaments, walls and voids.',
  content,
  mount,
};

export default topic;
