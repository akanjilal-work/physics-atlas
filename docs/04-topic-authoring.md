# 04 · Authoring a topic

Every topic lives in `src/topics/<id>/` and follows the same three-file pattern. Use `double-pendulum` as the reference implementation.

```
src/topics/<id>/
  physics.ts   pure math: no DOM, no Three.js. Testable in Node.
  content.ts   the four layers of text, equation terms, challenges.
  index.ts     the Three.js scene, the control panel, and the Topic export.
tests/topics/<id>.ts   numerical checks for physics.ts
```

## Contracts

The contracts are in `src/core/types.ts`.

- `index.ts` default-exports a `Topic` whose metadata (`id`, `number`, `title`, `domain`, `level`, `tagline`) matches its entry in `src/catalog.ts`. Add a line icon for the tile to `src/core/icons.ts`, keyed by the topic `id`.
- `mount({ viewport, panel })` builds the scene and controls, and returns `{ state(), dispose() }`.
- `state()` returns a flat object of numbers, booleans and strings. The page polls it every 250 ms to run the challenge checks.
- `dispose()` must remove everything the topic added: the stage, overlay canvases, and listeners on `window` or `document`.

## Building blocks

- `createStage(viewport, opts)` in `core/stage.ts` gives you the scene, camera, orbit controls, CSS2D labels (`stage.label`), a frame loop (`stage.onFrame((dt, t) => ...)`), camera moves (`stage.flyTo`) and disposal. The loop pauses on its own when the tab is hidden or the scene is scrolled offscreen.
- `Trail` is a fading polyline with a fixed capacity. `makeGrid` and `makeArrow` are small helpers. `PALETTE` holds the scene colours.
- `Panel` in `core/panel.ts` provides `section`, `slider`, `toggle`, `select`, `buttons`, `readout`, `note` and `legend`. Every control and readout has a `key`. Equation terms in `content.ts` refer to these keys through `param`. Hovering a term then highlights the matching control.
- Put TeX in content strings as `$inline$` or `$$display$$`. Escape backslashes in TypeScript strings (`'\\lambda'`).

## Physics rules

- Integrate with a fixed small step (RK4 or symplectic), and use several substeps per frame. Never use a single step sized to the frame time.
- Show a conservation or accuracy readout wherever it makes sense (energy drift, norm of the wavefunction, conserved angular momentum). It shows readers the result is physics and not numerical error.
- Every physics module ships with at least three checks in `tests/topics/<id>.ts`, each against a known analytic result.

## Writing rules

- Layer 1 (Intuition) uses no required math. Tell a story, name the surprise, and point at what to look for in the scene.
- Layer 2 (The Physics) has one headline equation with 3 to 6 linked terms, plus the derivation route.
- Layer 3 (Deep Dive) has 4 or 5 collapsible sections covering derivation, edge cases, an experiment or history, and connections.
- Layer 4 (Try It) has 3 or 4 challenges. Each one can be checked from `state()`, and each includes a hint.
- `caveats` states plainly what the model simplifies.
- Style: short sentences, plain words, no em-dashes, no semicolons, no filler. Be honest about what is established physics and what is speculative.
