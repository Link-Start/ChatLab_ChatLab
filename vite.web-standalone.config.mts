import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const rootDir = import.meta.dirname

export default defineConfig({
  root: resolve(rootDir, 'src/web'),
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
      '~': resolve(rootDir, 'src'),
      '@openchatlab': resolve(rootDir, 'packages'),
    },
  },
  define: {
    __IS_ELECTRON__: JSON.stringify(false),
    __IS_BROWSER_STANDALONE__: JSON.stringify(true),
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')).version),
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: resolve(rootDir, 'dist-web-standalone'),
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 3200,
  },
})
