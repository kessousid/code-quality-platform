import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS relies on emitDecoratorMetadata for constructor-based DI, which
// esbuild (Vitest's default transform) does not emit. SWC does, matching
// what `tsc` produces at build time — see docs/adr/0005-api-framework-nestjs.md.
export default defineConfig({
  test: {
    root: './',
  },
  plugins: [swc.vite()],
});
