import { defineConfig } from 'vite';

// Served from the root of physics-atlas.akanjilal.dev (see public/CNAME).
// Override with BASE=/physics-atlas/ to host under a project-pages path instead.
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/katex')) return 'katex';
          return undefined;
        },
      },
    },
  },
});
