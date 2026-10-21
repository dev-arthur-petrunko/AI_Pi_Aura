import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';

const buildId = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.VITE_BUILD_ID || 'dev';
  }
})();

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
    __BUILD_ID__: JSON.stringify(buildId),
  },
});
