import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The generated JSON in data/ is served as-is: data/episodes/index.json is
// available at /episodes/index.json.
// Relative base, so the build works under a sub-path such as GitHub Pages'
// /nyhetsmorgon-highlights/.
export default defineConfig({
  root: 'site',
  base: './',
  publicDir: '../data',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
});
