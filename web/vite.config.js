import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const MTEXT_WORKER = 'mtext-renderer-worker.js';
const DWG_WORKER = 'libredwg-parser-worker.js';
const DWG_WASM = 'libredwg-web.wasm';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `./node_modules/@mlightcad/cad-simple-viewer/dist/${MTEXT_WORKER}`, dest: 'assets' },
        { src: `./node_modules/@mlightcad/libredwg-converter/dist/${DWG_WORKER}`, dest: 'assets' },
        { src: `./node_modules/@mlightcad/libredwg-converter/dist/${DWG_WASM}`, dest: 'assets' }
      ]
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    chunkSizeWarningLimit: 8000
  }
});
