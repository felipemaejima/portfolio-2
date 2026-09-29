/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Content-Security-Policy of the built site, as a <meta> tag: the CloudFront Free plan only allows AWS-managed
// response header policies. Build only — Vite's dev server injects inline scripts for hot reload.
// (frame-ancestors can't be set in a meta tag; CloudFront already sends X-Frame-Options.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  server: {
    host: true,
    port: 5173,
    // Same origin as in production (CloudFront serves /, /api and /uploads): no CORS, cookies just work.
    proxy: {
      '/api': process.env.API_URL ?? 'http://api:3000',
      '/uploads': process.env.API_URL ?? 'http://api:3000',
    },
  },
  test: { environment: 'node' },
});
