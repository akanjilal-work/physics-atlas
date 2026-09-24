# Physics Atlas

Interactive 3D explanations of the hardest ideas in physics. Each topic pairs a live simulation you can rotate and control with four layers of explanation. The layers start with plain intuition and end with derivations.

**Live site:** https://physics-atlas.akanjilal.dev/

Drag a slider and the matching term in the equation lights up. Change the physics and the scene responds immediately. Every simulation runs in the browser, with no backend.

## Topics

98 live topics across eleven fields:

- **Foundations:** Least Action & Path Integrals, Noether's Theorem, Gauge Symmetry, Spontaneous Symmetry Breaking, Quantum Fields, Casimir Effect
- **Classical Mechanics:** Double Pendulum, Tennis Racket Effect, Three-Body Problem, Lagrange Points, Normal Modes, Gyroscopic Precession, Foucault Pendulum, Lorenz Attractor, Solitons, Kepler Orbits & Slingshots, Rattleback, Tides & the Roche Limit
- **Fluids & Waves:** Vortex Rings, Kármán Vortex Street, Chladni Figures, Doppler Effect
- **Electromagnetism & Light:** Electromagnetic Waves, Charges in Magnetic Fields, Rainbows, Superconductivity, Maxwell's Equations, Lasers, Cherenkov Radiation, Plasma & Fusion Confinement
- **Thermo & Statistical:** Ising Model, Maxwell's Demon, Brownian Motion, Heat Engines & Carnot, Percolation, Bose–Einstein Condensates
- **Relativity:** Special Relativity, Curved Spacetime, Twin Paradox, Black Hole Lensing, Gravitational Waves, Spinning Black Holes, Expanding Universe, Wormholes, Hawking Radiation, Flying Near Light Speed
- **Astrophysics:** Lives of Stars, Neutron Stars & Pulsars, Dark Matter, Finding Exoplanets
- **Cosmology:** Cosmic Web, Mapping Dark Matter with Light, Hunting Dark Matter, Dark Energy, Cosmic Distance Ladder, Vacuum Energy Puzzle, Fate of the Universe, Cosmic Inflation, The First Three Minutes, Cosmic Microwave Background, A Timeline of Everything
- **Quantum Mechanics:** Tunneling, Hydrogen Orbitals, Double Slit, Bloch Sphere, Entanglement & Bell, Uncertainty Principle, Quantum Oscillator, Grover Search, Quantum Teleportation, Shor's Algorithm, Quantum Zeno Effect, Crystals & Energy Bands, Quantum Hall Effect, Topological Insulators
- **Nuclear & Particle:** Standard Model, Neutrino Oscillations, Fusion in the Sun, Nuclear Binding Energy, Inside the Proton, Quarks & Colour Confinement, The Quark Model, The Electron, Muon g−2, The Weak Force, Feynman Diagrams & QED, Antimatter, Why Is There Matter?, Fermions & Bosons, Quark–Gluon Plasma, How Detectors See Particles
- **String Theory:** Strings & Extra Dimensions, Calabi–Yau Shapes, D-Branes, Holography, Cosmic Strings, Supersymmetry, String Landscape

## The four layers

1. **Intuition.** A story in plain words, plus a short "try this first" list for the 3D scene.
2. **The Physics.** One headline equation. Every term is a card linked to the control or readout that drives it.
3. **Deep Dive.** Derivations, edge cases, experiments and history, followed by an honest note on what the model leaves out.
4. **Try It.** Challenges that the simulation checks for you as you experiment. Progress is saved in your browser.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # 635 numerical checks against analytic results
npm run test:one -- <topic-id>   # checks for a single topic
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
