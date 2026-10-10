import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BUILD = String(Date.now());
// stamp the service worker cache name per build (cache bust)
const swStamp = () => ({
  name: 'sw-stamp',
  apply: 'build',
  closeBundle() {
    const f = 'dist/sw.js';
    if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace('__BUILD__', BUILD));
  },
});

export default defineConfig({
  base: './',
  plugins: [swStamp()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
  server: { host: true },
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node', setupFiles: ['tests/setup.js'] },
});
