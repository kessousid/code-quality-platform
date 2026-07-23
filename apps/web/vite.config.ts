import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // The API's httpOnly session cookie is SameSite=Strict (ADR-0014),
      // so it's only ever sent on same-origin requests. This proxy makes
      // the browser see /api/* as same-origin in dev; a production
      // deployment's reverse proxy plays the same role. Frontend code
      // always calls /api/*, never the API's own :3000 origin directly.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
