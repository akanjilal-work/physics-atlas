# 05 · Hosting and deploy

The site is fully static and deploys to GitHub Pages through GitHub Actions.

## One-time setup

1. Create the repository `akanjilal-work/physics-atlas` and push `main`.
2. In the repository, go to **Settings → Pages → Build and deployment** and set the source to **GitHub Actions**.
3. Every push to `main` then runs `.github/workflows/deploy.yml`. The workflow installs dependencies, runs the physics checks, builds, and publishes `dist/`.

The site is served at `https://akanjilal-work.github.io/physics-atlas/`.

## Base path

`vite.config.ts` sets `base` to `/physics-atlas/`. To host at a domain root or under another repository name, build with a different base:

```bash
BASE=/ npm run build
```

## Browser support

The site needs WebGL 2 and a recent evergreen browser. If WebGL is unavailable, the page shows a message in place of the scene, and all four text layers still work.
