# 02 · Architecture

```
index.html ── main.ts ── hash router
                 ├── atlas.ts        tile grid from catalog.ts
                 └── topicPage.ts    four-layer page shell
                        └── topics/<id>/index.ts  (dynamic import)
                               ├── physics.ts   pure solver
                               ├── content.ts   text, equation terms, challenges
                               └── core/stage.ts + core/panel.ts
```

## Routing

Routing uses hash URLs, so GitHub Pages needs no rewrite rules.

- `#/` is the atlas.
- `#/t/<id>` is a topic page.
- `#/t/<id>/<tab>` deep-links to a layer (`intuition`, `physics`, `deep`, `try`).

## Lifecycle

1. The router disposes the current page before rendering the next.
2. `topicPage.ts` renders the shell, then calls `topic.mount({ viewport, panel })`.
3. The topic builds a `Stage` (renderer, camera, orbit controls, labels, frame loop) and a `Panel` (controls and readouts).
4. The page polls `instance.state()` every 250 ms and runs challenge checks. Checks are armed only after the reader interacts, so the default demo state never solves one.
5. On navigation, `dispose()` frees GPU resources, overlays and listeners.

## Term and control linking

Every control and readout carries `data-param="<key>"`. Equation terms declare `param: '<key>'`. When a reader hovers or focuses a term, the matching control is highlighted. When a reader clicks a term, the page scrolls to the control and focuses it.

## Performance

- The frame loop pauses when the tab is hidden or the viewport scrolls offscreen.
- Solvers use fixed small steps, with many substeps per frame.
- Geometry is updated in place through BufferAttributes. Topics avoid allocating in the frame loop.
- Three.js and KaTeX ship as shared vendor chunks.
