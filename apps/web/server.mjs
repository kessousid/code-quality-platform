import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Mirrors vite.config.ts's dev proxy exactly (see docs/adr/0030): the API's session cookie is
// SameSite=Strict, so it's only ever sent on same-origin requests — this makes `/api/*` look
// same-origin to the browser in production the same way Vite's dev server proxy does locally.
const apiTarget = process.env.API_INTERNAL_URL ?? 'http://localhost:3000';
const port = process.env.PORT ?? 3000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

const app = express();

app.use(
  '/api',
  createProxyMiddleware({
    target: apiTarget,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
  }),
);

app.use(express.static(distDir));

// SPA fallback — any non-file, non-/api route serves index.html so client-side routing works on a real refresh/deep link.
app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

createServer(app).listen(port, () => {
  console.log(`[web] listening on :${port}, proxying /api -> ${apiTarget}`);
});
