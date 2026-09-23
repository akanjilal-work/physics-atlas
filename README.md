# Physics Atlas

Interactive 3D explanations of the hardest ideas in physics. Each topic pairs a live simulation you can rotate and control with four layers of explanation. The layers start with plain intuition and end with derivations.

**Live site:** https://akanjilal-work.github.io/physics-atlas/

Drag a slider and the matching term in the equation lights up. Change the physics and the scene responds immediately. Every simulation runs in the browser, with no backend.

## Topics

| # | Topic | Domain | What you can do |
|---|---|---|---|
| 1 | **Chaos & the Double Pendulum** | Classical | Release twin pendulums a billionth of a radian apart and watch them split. Follow both paths on a configuration-space torus. |
| 2 | **The Tennis Racket Effect** | Classical | Spin a T-handle about each principal axis. See the saddle on the angular-momentum sphere that makes the middle axis flip. |
| 7 | **Special Relativity** | Relativity | Tilt a rocket's worldline inside a 3D light cone. Boost into its frame and watch simultaneity break. |
| 8 | **Curved Spacetime & Orbits** | Relativity | Fly Schwarzschild geodesics over a Flamm funnel. Compare against a Newtonian ghost orbit and read the effective potential live. |
| 12 | **Quantum Tunneling** | Quantum | Fire a wave packet, drawn as a complex helix, at a barrier. Measure where the particle turns up. |
| 18 | **Strings & Extra Dimensions** | String theory | Excite string harmonics. Wrap strings around a compact dimension and test T-duality. |

Fifteen more tiles are on the roadmap, including the three-body problem, hydrogen orbitals, the double slit, entanglement, black hole lensing and holography.

## The four layers

1. **Intuition.** A story in plain words, plus a short "try this first" list for the 3D scene.
2. **The Physics.** One headline equation. Every term is a card linked to the control or readout that drives it.
3. **Deep Dive.** Derivations, edge cases, experiments and history, followed by an honest note on what the model leaves out.
4. **Try It.** Challenges that the simulation checks for you as you experiment. Progress is saved in your browser.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/physics-atlas/
npm test           # 34 numerical checks against analytic results
npm run build      # static site in dist/
```

## Stack

- **Vite + TypeScript**: static build, one lazily loaded chunk per topic
- **Three.js**: rendering, orbit controls, CSS2D labels
- **KaTeX**: equations
- Physics solvers written from scratch in TypeScript. They include RK4, quaternion rigid-body integration, Schwarzschild geodesics, split-step Fourier for the Schrödinger equation (with a hand-written FFT), and Lorentz boosts.

```
src/
  core/        stage (Three.js), panel (controls), tex, progress, shared types
  topics/<id>/ physics.ts (pure, tested) · content.ts (4 layers) · index.ts (scene)
  catalog.ts   atlas tiles and lazy loaders
tests/topics/  numerical checks per topic
docs/          architecture and authoring guides
```

## Physics you can trust

Every physics module is pure and tested in Node against known results. The checks cover:

- conserved energy and momentum
- normal-mode periods
- the Lyapunov divergence
- the intermediate-axis growth rate
- Lorentz invariance of the interval
- Schwarzschild perihelion precession
- free-packet spreading
- barrier transmission
- T-duality of the string spectrum

Scenes also show live accuracy readouts, such as energy drift and wavefunction norm, so readers can see that what they watch is physics and not numerical error.

## Documentation

- [01 · Overview](docs/01-overview.md)
- [02 · Architecture](docs/02-architecture.md)
- [03 · Physics engines](docs/03-physics-engines.md)
- [04 · Authoring a topic](docs/04-topic-authoring.md)
- [05 · Hosting and deploy](docs/05-hosting-and-deploy.md)

## License

MIT
