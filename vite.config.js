/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import { basename, resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Dev-server only (apply:'serve' - never runs on build): the pages' strict CSP blocks
// Vite's HMR websocket, killing hot reload. Rewrite connect-src to admit the dev
// websocket (plus 'self' for the client's HTTP ping fallback); 'none' must be dropped
// because a CSP source list cannot combine 'none' with other sources.
const devCspAllowHmr = () => ({
  name: 'dev-csp-allow-hmr',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(/connect-src ([^;]*);/, (match, sources) => {
      const kept = sources.replaceAll("'none'", '').trim();
      return `connect-src ${kept ? kept + ' ' : ''}'self' ws://localhost:* ws://127.0.0.1:*;`;
    });
  }
});

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

const licenseNotice = () => {
  const banner = `/*! triauth-authenticator v${version} | Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/) `
    + `| Licensed under the Elastic License 2.0; see LICENSE.txt for the full text | https://github.com/triauth/triauth-authenticator | SPDX-License-Identifier: Elastic-2.0 */`;

  const LEGAL_FILES = ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt'];

  return {
    name: 'license-notice',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split('?')[0];
        const file = LEGAL_FILES.find((name) => pathname === `/${name}`);
        if (!file) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(resolve(__dirname, file), 'utf8'));
      });
    },
    generateBundle: {
      // 'post': Vite minifies with esbuild's legalComments:'none', which strips even /*! */
      // banners, so the notice has to go on after that pass rather than through
      // rollupOptions.output.banner.
      order: 'post',
      handler(_options, bundle) {
        for (const file of LEGAL_FILES) {
          this.emitFile({
            type: 'asset',
            fileName: file,
            source: readFileSync(resolve(__dirname, file), 'utf8')
          });
        }

        // A prepended banner line shifts every source mapping down a line - fix it
        const shiftMapDownOneLine = (mapAsset) => {
          if (mapAsset?.type !== 'asset') return;
          const map = JSON.parse(mapAsset.source);
          map.mappings = ';' + map.mappings;
          mapAsset.source = JSON.stringify(map);
        };

        for (const [fileName, item] of Object.entries(bundle)) {
          if (item.type === 'chunk') {
            item.code = `${banner}\n${item.code}`;
            shiftMapDownOneLine(item.sourcemapFileName && bundle[item.sourcemapFileName]);
            if (item.map) item.map.mappings = ';' + item.map.mappings;
          } else if (fileName.endsWith('.css') || fileName.endsWith('.js')) {
            // A .js asset is a `?worker` bundle: Vite builds it in a separate pass and emits it as an asset, not a chunk
            const text = typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source);
            item.source = `${banner}\n${text}`;
            shiftMapDownOneLine(bundle[`${fileName}.map`]);
          }
        }
      }
    }
  };
};

// Build only. Inject preload hints for fonts to prevent font flash.
const FIRST_PAINT_WEIGHTS = { index: [400, 600, 700], auth: [400, 700], sign: [400, 700], attest: [400, 700] };

const preloadFonts = () => ({
  name: 'preload-fonts',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(_html, { path, bundle }) {
      const weights = FIRST_PAINT_WEIGHTS[basename(path, '.html')] ?? [];
      return Object.keys(bundle)
        .filter((file) => weights.some((weight) => file.match(`/inter-latin-${weight}-normal-[^/]+\\.woff2$`)))
        .sort()
        .map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: `/${file}` },
          injectTo: 'head'
        }));
    }
  }
});

// https://vite.dev/config/
export default defineConfig({
  // HTML entries live in src/, so src/ is the Vite root. This keeps each page's
  // served URL flat (src/auth.html -> dist/auth.html -> /auth.html), which both the
  // pathname routing in src/main.js and the relying-party "/<verb>.html" redirect
  // contract depend on. Because root moves to src/, publicDir, outDir, and envDir
  // must be pinned back to the project root explicitly (defaults would become
  // src/public, src/dist, and .env files read from src/).
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  envDir: __dirname,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue(), tailwindcss(), devCspAllowHmr(), licenseNotice(), preloadFonts()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        attest: resolve(__dirname, 'src/attest.html'),
        auth: resolve(__dirname, 'src/auth.html'),
        index: resolve(__dirname, 'src/index.html'),
        ping: resolve(__dirname, 'src/ping.html'),
        sign: resolve(__dirname, 'src/sign.html'),
        stamp: resolve(__dirname, 'src/stamp.html'),
      }
    }
  }
})
