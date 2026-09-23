import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/. Override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/physics-atlas/',
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
