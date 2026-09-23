import * as THREE from 'three';
import { createStage, makeGrid, PALETTE } from '../../core/stage.ts';
import { Panel, css } from '../../core/panel.ts';
import type { MountContext, Topic, TopicInstance } from '../../core/types.ts';
import { content } from './content.ts';
import { buildPreset, coarseCopy, kelvinSpeed, stepSize, syncCoarse, type Preset, VortexSystem } from './physics.ts';

const TEAL = 0x2dd4bf; // fluids accent
const COL_A = TEAL;
const COL_B = PALETTE.amber;
const SIDES = 10; // tube cross-section vertices
const TRACERS = 2400;
const STRIDE = 2; // smoke feels every second filament node
const MAX_STEPS = 28; // filament steps per frame before the sim runs slow
const HIST = 400; // inset samples
const SAMPLE = 0.1; // sim time between inset samples
const GRID_Y = -2.6;

const SEP_DEFAULT: Record<Preset, number> = { single: 1, leapfrog: 0.8, collision: 3, wall: 1.6 };
const NODES: Record<Preset, number> = { single: 128, leapfrog: 96, collision: 96, wall: 128 };

/** A tube mesh that wraps a closed filament, updated in place every frame. */
class Tube {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly norAttr: THREE.BufferAttribute;

  constructor(readonly n: number, material: THREE.Material) {
    const verts = (n + 1) * SIDES;
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norAttr = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('normal', this.norAttr);
    const idx = new Uint16Array(n * SIDES * 6);
    let o = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = i * SIDES + k;
        const b = i * SIDES + ((k + 1) % SIDES);
        const c = a + SIDES;
        const d = b + SIDES;
        idx[o++] = a; idx[o++] = c; idx[o++] = b;
        idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  /** Wrap ring k of s. mirror = z of a mirror plane for an image ring, or null. */
  update(s: Float64Array, k: number, radius: number, mirror: number | null): void {
    const n = this.n;
    const base = 3 * k * n;
    // Centroid, to build a frame that points away from the ring centre.
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < n; j++) {
      cx += s[base + 3 * j];
      cy += s[base + 3 * j + 1];
      cz += s[base + 3 * j + 2];
    }
    cx /= n; cy /= n; cz /= n;
    const P = this.pos, Nn = this.nor;
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const o = base + 3 * j;
      const p = base + 3 * ((j + n - 1) % n);
      const q = base + 3 * ((j + 1) % n);
      let tx = s[q] - s[p], ty = s[q + 1] - s[p + 1], tz = s[q + 2] - s[p + 2];
      const tl = 1 / Math.hypot(tx, ty, tz);
      tx *= tl; ty *= tl; tz *= tl;
      let rx = s[o] - cx, ry = s[o + 1] - cy, rz = s[o + 2] - cz;
      const rt = rx * tx + ry * ty + rz * tz;
      rx -= rt * tx; ry -= rt * ty; rz -= rt * tz;
      const rl = 1 / (Math.hypot(rx, ry, rz) || 1);
      rx *= rl; ry *= rl; rz *= rl;
      const bx = ty * rz - tz * ry, by = tz * rx - tx * rz, bz = tx * ry - ty * rx;
      for (let m = 0; m < SIDES; m++) {
        const ph = (2 * Math.PI * m) / SIDES;
        const c = Math.cos(ph), sn = Math.sin(ph);
        const nx = c * rx + sn * bx, ny = c * ry + sn * by, nz = c * rz + sn * bz;
        const v = 3 * (i * SIDES + m);
        const pz = s[o + 2] + radius * nz;
        P[v] = s[o] + radius * nx;
        P[v + 1] = s[o + 1] + radius * ny;
        P[v + 2] = mirror === null ? pz : 2 * mirror - pz;
        Nn[v] = nx;
        Nn[v + 1] = ny;
        Nn[v + 2] = mirror === null ? nz : -nz;
      }
    }
    this.posAttr.needsUpdate = true;
    this.norAttr.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

function smokeSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mount({ viewport, panel }: MountContext): TopicInstance {
  const CAM_NEAR: [number, number, number] = [-4.4, 2.4, 6.4];
  const CAM_FAR: [number, number, number] = [-5.6, 3.0, 8.4];
  const stage = createStage(viewport, { camera: CAM_NEAR, target: [0.3, 0, 0], fov: 42 });
  const { scene } = stage;

  // --- Parameters
  let preset: Preset = 'leapfrog';
  let gamma = 1;
  let R0 = 1;
  let a = 0.1;
  let sep = SEP_DEFAULT.leapfrog;
  let speed = 3;
  let playing = true;
  let smokeOn = true;

  // Physics frame: rings travel along physics +z, which maps to scene +x.
  const world = new THREE.Group();
  world.rotation.y = Math.PI / 2;
  scene.add(world);

  const grid = makeGrid(24, 24);
  grid.position.y = GRID_Y;
  world.add(grid);
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -40, 0, 0, 40], 3)),
    new THREE.LineDashedMaterial({ color: 0x3a4a6a, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7 }),
  );
  axis.computeLineDistances();
  world.add(axis);

  // Wall at physics z = 0 (wall preset only).
  const wallGroup = new THREE.Group();
  world.add(wallGroup);
  const wallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 6),
    new THREE.MeshStandardMaterial({ color: 0x1d3b44, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 }),
  );
  wallMesh.position.y = GRID_Y + 3;
  wallGroup.add(wallMesh);
  const wallEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(7, 6)),
    new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0.5 }),
  );
  wallEdge.position.y = GRID_Y + 3;
  wallGroup.add(wallEdge);
  const wallLabel = stage.label('wall (acts as a mirror)', [0, GRID_Y + 6.3, 0], 'muted', wallGroup);

  // Materials: glowing cores, additive halos, ghost image.
  const coreMat = [COL_A, COL_B].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.1 }));
  const haloMat = [COL_A, COL_B].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  const ghostMat = new THREE.MeshBasicMaterial({ color: PALETTE.rose, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false });
  const ringGroup = new THREE.Group();
  world.add(ringGroup);
  let cores: Tube[] = [];
  let halos: Tube[] = [];
  let ghost: Tube | null = null;

  const ringLabels = [stage.label('ring A', [0, 0, 0], '', world), stage.label('ring B', [0, 0, 0], '', world)];
  ringLabels[0].element.style.color = css(COL_A);
  ringLabels[1].element.style.color = css(COL_B);
  const ghostLabel = stage.label('mirror image ring', [0, 0, 0], 'muted', world);
  const stopLabel = stage.label('', [0, 0, 0], '', world);
  stopLabel.element.style.color = css(PALETTE.rose);

  // --- Smoke tracers, stored directly in physics coordinates.
  const tracer = new Float32Array(TRACERS * 3);
  const tracerCol = new Float32Array(TRACERS * 3);
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new THREE.BufferAttribute(tracer, 3).setUsage(THREE.DynamicDrawUsage);
  smokeGeo.setAttribute('position', smokePos);
  smokeGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3));
  const sprite = smokeSprite();
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    size: 0.13, map: sprite, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  smoke.frustumCulled = false;
  world.add(smoke);

  // --- Inset: ring radius against time
  const inset = document.createElement('canvas');
  inset.width = 460;
  inset.height = 220;
  Object.assign(inset.style, {
    position: 'absolute', right: '10px', top: '10px', width: '230px', height: '110px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', zIndex: '2', pointerEvents: 'none',
  } as CSSStyleDeclaration);
  viewport.appendChild(inset);
  const ictx = inset.getContext('2d')!;
  const hT = new Float64Array(HIST);
  const hA = new Float64Array(HIST);
  const hB = new Float64Array(HIST);
  let hCount = 0;

  // --- Legend overlay
  const legend = document.createElement('div');
  legend.className = 'stage-overlay';
  Object.assign(legend.style, {
    position: 'absolute', left: '10px', top: '10px', zIndex: '2', pointerEvents: 'none', maxWidth: '240px',
    background: 'rgba(7,10,18,0.72)', borderRadius: '10px', border: '1px solid #243049', padding: '8px 10px',
    font: '11px/1.4 JetBrains Mono, monospace', color: '#b8c3d9',
  } as CSSStyleDeclaration);
  viewport.appendChild(legend);

  // --- Simulation state
  let sys: VortexSystem = buildPreset(preset, { gamma, R: R0, a, sep }, NODES[preset]);
  let field: VortexSystem = coarseCopy(sys, STRIDE);
  let h = 0.01;
  let acc = 0;
  let stopped = false;
  let passes = 0;
  let order = 0;
  let zStart = 0;
  let P0 = 1;
  let impulseDrift = 0;
  let growth = 1;
  let Uinst = 0;
  let Umeas = 0;
  let prevZ = 0;
  let prevT = 0;
  let follow = 0;
  let sinceSample = 0;
  let RA = R0, RB = R0, zA = 0, zB = 0;
  const Pv = new Float64Array(3);
  // Speed measurements from the Single preset, for the challenges.
  const records: { gamma: number; R: number; a: number; U: number }[] = [];

  const twoRings = () => preset === 'leapfrog' || preset === 'collision';

  function followTarget(): number {
    if (preset === 'collision') return 0;
    if (preset === 'wall') return -0.6;
    return twoRings() ? 0.5 * (zA + zB) : zA;
  }

  function buildMeshes(): void {
    for (const t of [...cores, ...halos]) {
      ringGroup.remove(t.mesh);
      t.dispose();
    }
    if (ghost) {
      ringGroup.remove(ghost.mesh);
      ghost.dispose();
      ghost = null;
    }
    cores = [];
    halos = [];
    for (let k = 0; k < sys.nr; k++) {
      const c = new Tube(sys.N, coreMat[k]);
      const g = new Tube(sys.N, haloMat[k]);
      cores.push(c);
      halos.push(g);
      ringGroup.add(g.mesh, c.mesh);
    }
    if (preset === 'wall') {
      ghost = new Tube(sys.N, ghostMat);
      ringGroup.add(ghost.mesh);
    }
  }

  function seedSmoke(): void {
    const c = new Float64Array(3);
    const nr = sys.nr;
    for (let i = 0; i < TRACERS; i++) {
      const k = i % nr;
      sys.centroid(k, c);
      const Rk = sys.radius(k);
      const th = Math.random() * 2 * Math.PI;
      // Rayleigh-distributed distance from the core, capped inside the ring's atmosphere.
      const sig = 0.22 * Rk;
      const rho = Math.min(0.65 * Rk, a * 0.6 + sig * Math.sqrt(-2 * Math.log(1 - Math.random() * 0.999)));
      const ph = Math.random() * 2 * Math.PI;
      const rr = Rk + rho * Math.cos(ph);
      const o = 3 * i;
      tracer[o] = c[0] + rr * Math.cos(th);
      tracer[o + 1] = c[1] + rr * Math.sin(th);
      tracer[o + 2] = c[2] + rho * Math.sin(ph);
      const base = new THREE.Color(k === 1 ? COL_B : COL_A);
      const w = 0.55 + 0.25 * Math.random();
      const b = 0.35 + 0.35 * Math.random();
      tracerCol[o] = (base.r * (1 - w) + w) * b;
      tracerCol[o + 1] = (base.g * (1 - w) + w) * b;
      tracerCol[o + 2] = (base.b * (1 - w) + w) * b;
    }
    smokePos.needsUpdate = true;
    (smokeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  function measure(): void {
    RA = sys.radius(0);
    zA = sys.axialZ(0);
    if (sys.nr > 1) {
      RB = sys.radius(1);
      zB = sys.axialZ(1);
    } else {
      RB = NaN;
      zB = zA;
    }
    if (preset === 'leapfrog') {
      const o = Math.sign(zB - zA);
      if (o !== 0 && o !== order) {
        if (order !== 0) passes++;
        order = o;
      }
    }
    if (preset !== 'wall') {
      sys.impulse(Pv);
      // Relative to one ring's impulse, since a head-on pair has zero total.
      impulseDrift = Math.abs(Pv[2] - P0) / (Math.abs(gamma) * Math.PI * R0 * R0);
    }
    growth = Math.max(growth, RA / R0);
    const t = sys.t;
    if (t > prevT) {
      const v = (zA - prevZ) / (t - prevT);
      Uinst = Uinst === 0 ? v : Uinst + 0.3 * (v - Uinst);
    }
    prevZ = zA;
    prevT = t;
    if (preset === 'single' && t > 0) {
      Umeas = (zA - zStart) / t;
      if (t >= 2) {
        const last = records[records.length - 1];
        if (last && last.gamma === gamma && last.R === R0 && last.a === a) last.U = Umeas;
        else {
          records.push({ gamma, R: R0, a, U: Umeas });
          if (records.length > 40) records.shift();
        }
      }
    }
    if ((preset === 'collision' || preset === 'wall') && sys.closeness() < 1) {
      stopped = true;
    }
  }

  function draw(): void {
    const s = sys.pos;
    const rad = Math.max(0.018, a);
    for (let k = 0; k < sys.nr; k++) {
      cores[k].update(s, k, rad, null);
      halos[k].update(s, k, rad * 2.2 + 0.05, null);
    }
    if (ghost) ghost.update(s, 0, rad * 1.4, 0);
    // Labels
    ringLabels[0].position.set(0, RA + 0.35, zA);
    ringLabels[1].visible = sys.nr > 1;
    if (sys.nr > 1) ringLabels[1].position.set(0, RB + 0.35, zB);
    ghostLabel.visible = preset === 'wall';
    if (preset === 'wall') ghostLabel.position.set(0, -RA - 0.35, -zA);
    stopLabel.visible = stopped;
    if (stopped) stopLabel.position.set(0, -RA - 0.85, preset === 'wall' ? zA : 0);
  }

  function sampleHistory(): void {
    if (hCount === HIST) {
      hT.copyWithin(0, 1);
      hA.copyWithin(0, 1);
      hB.copyWithin(0, 1);
      hCount--;
    }
    hT[hCount] = sys.t;
    hA[hCount] = RA;
    hB[hCount] = RB;
    hCount++;
  }

  function drawInset(): void {
    const Wc = inset.width;
    const Hc = inset.height;
    ictx.clearRect(0, 0, Wc, Hc);
    ictx.font = '22px JetBrains Mono, monospace';
    ictx.fillStyle = '#8391ab';
    ictx.fillText('ring radius R vs time', 16, 30);
    let top = 0;
    for (let i = 0; i < hCount; i++) top = Math.max(top, hA[i], Number.isFinite(hB[i]) ? hB[i] : 0);
    top = Math.max(1.5 * R0, Math.ceil(top * 1.15 * 2) / 2);
    const y0 = Hc - 18;
    const y1 = 50;
    const x0 = 14;
    const x1 = Wc - 64;
    const yOf = (v: number) => y0 - (v / top) * (y0 - y1);
    ictx.strokeStyle = '#243049';
    ictx.lineWidth = 1;
    for (const v of [0, R0, top]) {
      const y = yOf(v);
      ictx.beginPath();
      ictx.moveTo(x0, y);
      ictx.lineTo(x1, y);
      ictx.stroke();
      ictx.fillStyle = '#56627c';
      ictx.fillText(v === R0 ? `R₀` : v.toFixed(1), x1 + 8, y + 7);
    }
    if (hCount < 2) return;
    const tEnd = hT[hCount - 1];
    const tBeg = Math.max(hT[0], tEnd - HIST * SAMPLE);
    const span = Math.max(10, tEnd - tBeg);
    const xOf = (t: number) => x0 + ((t - tBeg) / span) * (x1 - x0);
    const series: [Float64Array, number][] = [[hA, COL_A], [hB, COL_B]];
    for (const [arr, col] of series) {
      if (!Number.isFinite(arr[hCount - 1])) continue;
      ictx.strokeStyle = css(col);
      ictx.lineWidth = 3;
      ictx.beginPath();
      for (let i = 0; i < hCount; i++) {
        const x = xOf(hT[i]);
        const y = yOf(arr[i]);
        if (i === 0) ictx.moveTo(x, y);
        else ictx.lineTo(x, y);
      }
      ictx.stroke();
    }
    ictx.font = '20px JetBrains Mono, monospace';
    ictx.fillStyle = css(COL_A);
    ictx.fillText('A', 370, 30);
    if (sys.nr > 1) {
      ictx.fillStyle = css(COL_B);
      ictx.fillText('B', 396, 30);
    }
  }

  function paintLegend(): void {
    const sw = (c: number, t: string) => `<span style="color:${css(c)}">■</span> ${t}`;
    const text: Record<Preset, string> = {
      single: 'One ring pushes itself along. Every piece of the loop is carried by the swirl of all the others.',
      leapfrog: 'The rear ring is pulled inward, shrinks and speeds up. The front ring grows and slows. The rear one threads through, then the roles swap.',
      collision: 'Rings with opposite spin meet head on. Each stretches the other, so both grow wide and slow down.',
      wall: 'A frictionless wall acts like a mirror ring coming the other way. The ring spreads along the wall.',
    };
    const title: Record<Preset, string> = { single: 'A single vortex ring', leapfrog: 'Leapfrogging rings', collision: 'Head-on collision', wall: 'Ring meets a wall' };
    legend.innerHTML = `<div style="color:#dfe6f3;font-weight:600;margin-bottom:3px">${title[preset]}</div>
<div>${sw(COL_A, 'ring A')}${sys.nr > 1 ? ` &nbsp;${sw(COL_B, 'ring B')}` : ''}${preset === 'wall' ? ` &nbsp;${sw(PALETTE.rose, 'image')}` : ''}</div>
<div>${text[preset]}</div>
<div style="margin-top:3px;color:#8391ab">Tube thickness = core size a. Haze = smoke tracers.</div>`;
  }

  let lastCamR = -1;
  let lastCamPreset: Preset | null = null;

  function reset(): void {
    sys = buildPreset(preset, { gamma, R: R0, a, sep }, NODES[preset]);
    field = coarseCopy(sys, STRIDE);
    h = stepSize(gamma, (2 * Math.PI * 0.7 * R0) / sys.N);
    acc = 0;
    stopped = false;
    passes = 0;
    order = 0;
    growth = 1;
    Uinst = 0;
    Umeas = 0;
    zStart = sys.axialZ(0);
    prevZ = zStart;
    prevT = 0;
    sys.impulse(Pv);
    P0 = Pv[2];
    impulseDrift = 0;
    hCount = 0;
    sinceSample = 0;
    buildMeshes();
    measure();
    follow = followTarget();
    world.position.x = -follow;
    grid.position.z = Math.round(follow);
    wallGroup.visible = preset === 'wall';
    wallLabel.visible = preset === 'wall';
    smoke.visible = smokeOn;
    if (smokeOn) seedSmoke();
    sampleHistory();
    draw();
    drawInset();
    paintLegend();
    const far = preset === 'collision' || preset === 'wall';
    const scale = Math.max(0.8, R0);
    if (preset !== lastCamPreset || Math.abs(R0 - lastCamR) > 0.25 * lastCamR) {
      const c = far ? CAM_FAR : CAM_NEAR;
      stage.flyTo([c[0] * scale, c[1] * scale, c[2] * scale], [far ? 0 : 0.3 * scale, far ? 0.4 : 0, 0], lastCamPreset === null ? 0.01 : 1.2);
      lastCamPreset = preset;
      lastCamR = R0;
    }
  }

  // --- Frame loop
  let labelTimer = 0;
  let insetTimer = 0;
  stage.onFrame((dt) => {
    if (playing && !stopped) {
      acc += dt * speed;
      let steps = Math.floor(acc / h);
      if (steps > MAX_STEPS) {
        steps = MAX_STEPS;
        acc = 0;
      } else {
        acc -= steps * h;
      }
      for (let i = 0; i < steps && !stopped; i++) {
        sys.step(h);
        sinceSample += h;
        if (sinceSample >= SAMPLE) {
          sinceSample -= SAMPLE;
          measure();
          sampleHistory();
        }
      }
      if (steps > 0) {
        measure();
        if (smokeOn) {
          // Tracers move with the frozen filament field over this frame, in up to 3 RK4 steps.
          const T = steps * h;
          const sub = Math.min(3, Math.max(1, Math.ceil((T * Math.abs(gamma)) / 0.1)));
          syncCoarse(field, sys, STRIDE);
          for (let i = 0; i < sub; i++) field.advect(tracer, TRACERS, T / sub);
          smokePos.needsUpdate = true;
        }
        draw();
      }
      follow += (followTarget() - follow) * Math.min(1, dt * 2.5);
      world.position.x = -follow;
      grid.position.z = Math.round(follow);
    }
    insetTimer += dt;
    if (insetTimer > 0.2) {
      insetTimer = 0;
      drawInset();
    }
    labelTimer += dt;
    if (labelTimer > 0.25) {
      labelTimer = 0;
      updateReadouts();
    }
  });

  // --- Controls
  const ui = new Panel(panel);
  ui.section('Playback');
  const [playBtn] = ui.buttons([
    { label: 'Pause', primary: true, onClick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } },
    { label: 'Reset', key: 'reset', onClick: () => reset() },
  ]);
  ui.slider({ key: 'speed', label: 'Sim speed', min: 0.5, max: 8, step: 0.1, value: speed, format: (v) => `${v.toFixed(1)} t/s`, onInput: (v) => (speed = v) });
  const sepCtl = { set: (_v: number, _e?: boolean) => {} };
  ui.select<Preset>({
    key: 'preset', label: 'Experiment', value: preset,
    options: [
      { value: 'single', label: 'Single' },
      { value: 'leapfrog', label: 'Leapfrog' },
      { value: 'collision', label: 'Collision' },
      { value: 'wall', label: 'Wall' },
    ],
    onChange: (v) => { preset = v; sep = SEP_DEFAULT[v]; sepCtl.set(sep, false); reset(); },
  });
  ui.toggle({
    key: 'tracers', label: 'Smoke tracers', value: smokeOn,
    onChange: (v) => { smokeOn = v; smoke.visible = v; if (v) seedSmoke(); },
  });

  ui.section('Rings (resets)');
  ui.slider({ key: 'gamma', label: 'Circulation Γ', min: 0.25, max: 3, step: 0.05, value: gamma, onInput: (v) => { gamma = v; reset(); } });
  ui.slider({ key: 'R', label: 'Radius R', min: 0.5, max: 1.5, step: 0.05, value: R0, onInput: (v) => { R0 = v; reset(); } });
  ui.slider({ key: 'a', label: 'Core size a', min: 0.02, max: 0.3, step: 0.01, value: a, onInput: (v) => { a = v; reset(); } });
  const sepSlider = ui.slider({ key: 'sep', label: 'Separation (to wall in Wall)', min: 0.4, max: 4, step: 0.05, value: sep, onInput: (v) => { sep = v; reset(); } });
  sepCtl.set = (v, e) => sepSlider.set(v, e);
  ui.note('Scaled units: fluid density 1, lengths in units of the default ring radius. The separation is ignored in Single.');

  ui.section('Live readouts');
  const rT = ui.readout('t', 'time t');
  const rU = ui.readout('U', 'U measured');
  const rK = ui.readout('Ukelvin', 'U Kelvin (lone ring)');
  const rRA = ui.readout('RA', 'radius A');
  const rRB = ui.readout('RB', 'radius B');
  const rPass = ui.readout('passes', 'pass-throughs');
  const rP = ui.readout('impulse', 'impulse drift');
  ui.legend([
    { color: css(COL_A), label: 'ring A core' },
    { color: css(COL_B), label: 'ring B core' },
    { color: css(PALETTE.rose), label: 'mirror image' },
  ]);

  function updateReadouts(): void {
    rT(sys.t.toFixed(1));
    const U = preset === 'single' ? Umeas : Uinst;
    rU(sys.t > 0.2 ? U.toFixed(3) : '…');
    rK(kelvinSpeed(gamma, R0, a).toFixed(3));
    rRA(RA.toFixed(3));
    rRB(Number.isFinite(RB) ? RB.toFixed(3) : 'n/a');
    rPass(preset === 'leapfrog' ? passes : 'n/a');
    rP(preset === 'wall' ? 'wall pushes' : impulseDrift < 1e-6 ? '< 1e-6' : impulseDrift.toExponential(1));
    if (stopped) stopLabel.element.textContent = 'cores meet: a thin-filament model stops here';
  }

  reset();
  updateReadouts();

  function pairStats() {
    let gammaRatio = 1, speedRatio = 1, coreRatio = 1, thinFaster = false;
    for (let i = 0; i < records.length; i++) {
      for (let j = 0; j < records.length; j++) {
        const p = records[i], q = records[j];
        if (Math.abs(p.R - q.R) > 1e-9) continue;
        if (Math.abs(p.a - q.a) < 1e-9 && q.gamma > p.gamma && p.U > 0) {
          const g = q.gamma / p.gamma;
          if (g > gammaRatio) {
            gammaRatio = g;
            speedRatio = q.U / p.U;
          }
        }
        if (Math.abs(p.gamma - q.gamma) < 1e-9 && q.a > p.a) {
          const c = q.a / p.a;
          if (c > coreRatio || (c === coreRatio && p.U > q.U)) {
            coreRatio = c;
            thinFaster = p.U > q.U;
          }
        }
      }
    }
    return { gammaRatio, speedRatio, coreRatio, thinFaster };
  }

  return {
    state: () => {
      const ps = pairStats();
      return {
        t: sys.t,
        preset,
        gamma,
        R: R0,
        a,
        sep,
        sepOverR: sep / R0,
        passes,
        growth,
        stopped,
        RA,
        RB: Number.isFinite(RB) ? RB : 0,
        U: preset === 'single' ? Umeas : Uinst,
        Ukelvin: kelvinSpeed(gamma, R0, a),
        impulseDrift,
        gammaRatio: ps.gammaRatio,
        speedRatio: ps.speedRatio,
        coreRatio: ps.coreRatio,
        thinFaster: ps.thinFaster,
      };
    },
    dispose: () => {
      for (const t of [...cores, ...halos]) t.dispose();
      ghost?.dispose();
      sprite.dispose();
      legend.remove();
      inset.remove();
      stage.dispose();
    },
  };
}

const topic: Topic = {
  id: 'vortex-rings',
  number: 62,
  title: 'Vortex Rings',
  domain: 'fluids',
  level: 2,
  status: 'live',
  tagline: 'Smoke rings that push, leapfrog and carry their own momentum.',
  content,
  mount,
};

export default topic;
