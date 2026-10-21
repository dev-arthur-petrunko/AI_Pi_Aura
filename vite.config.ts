import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VITE_BUILD_ID || 'dev'),
  },
});
