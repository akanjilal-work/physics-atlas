# 05 · Hosting and deploy

The site is fully static. GitHub Actions deploys it to GitHub Pages, and it is served at **https://physics-atlas.akanjilal.dev**.

## One-time setup

1. Create the repository `akanjilal-work/physics-atlas` and push `main`.
2. In the repository, go to **Settings → Pages → Build and deployment** and set the source to **GitHub Actions**.
3. In DNS for `akanjilal.dev` (Cloudflare), add a record:

   | Type | Name | Target | Proxy |
   |---|---|---|---|
   | CNAME | `physics-atlas` | `akanjilal-work.github.io` | DNS only (grey cloud) |

   Keep the proxy off until GitHub has issued its certificate. You can turn it on afterwards if you want. In that case, set Cloudflare SSL/TLS mode to **Full**.
4. In **Settings → Pages → Custom domain**, enter `physics-atlas.akanjilal.dev`. Once the certificate is issued, tick **Enforce HTTPS**.
5. Optional: verify `akanjilal.dev` for the organization under **Org settings → Pages → Verified domains**. This stops other accounts from claiming its subdomains.

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow installs dependencies, runs the physics checks, builds, and publishes `dist/`.

## Custom domain and base path

`public/CNAME` holds the domain, and Vite copies it into `dist/` on each build. `vite.config.ts` sets `base` to `/` because the site is served from the domain root. Routing uses URL hashes (`#/topic/...`), so no 404 fallback is needed.

To host under a project-pages path instead, for example `https://<org>.github.io/physics-atlas/`, delete `public/CNAME` and build with:

```bash
BASE=/physics-atlas/ npm run build
```

## Browser support

The site needs WebGL 2 and a recent evergreen browser. If WebGL is unavailable, the page shows a message in place of the scene, and all four text layers still work.
