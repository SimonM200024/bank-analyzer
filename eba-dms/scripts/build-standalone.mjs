// Builds the browser-only demo into one self-contained HTML file.
//   npm i -D esbuild && npm run build:standalone
// Output: dist/standalone.html (page body for publishing) and
//         dist/standalone-preview.html (full document for opening locally).
// The standalone build uses neutral naming (src/core/brand-neutral.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = await import(process.env.ESBUILD_MODULE || 'esbuild');
const neutral = !process.argv.includes('--keep-brand');

const resolver = {
  name: 'eba-paths',
  setup(b) {
    b.onResolve({ filter: /^\/core\// }, (a) => {
      let rel = a.path.slice('/core/'.length);
      if (neutral && rel === 'brand.js') rel = 'brand-neutral.js';
      return { path: path.join(ROOT, 'src', 'core', rel) };
    });
    b.onResolve({ filter: /^\.{1,2}\/.*brand\.js$/ }, (a) => {
      const p = path.resolve(a.resolveDir, a.path);
      return { path: neutral && p === path.join(ROOT, 'src', 'core', 'brand.js') ? path.join(ROOT, 'src', 'core', 'brand-neutral.js') : p };
    });
    b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: path.join(ROOT, 'src', 'standalone', 'crypto-shim.js') }));
  },
};

const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'standalone', 'main.js')],
  bundle: true, format: 'iife', target: 'es2022', minify: true, write: false, plugins: [resolver], charset: 'utf8', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'eba.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const extraCss = `
:root { color-scheme: light; }
body { background: var(--bar); color: #000; }
.app, .docwin { top: env(safe-area-inset-top, 0px); bottom: env(safe-area-inset-bottom, 0px); }
@media (max-width: 760px) {
  .menubar, .toolbar { overflow-x: auto; overflow-y: hidden; }
  .menubar .brand { display: none; }
  .toolbar .tb .tl { display: none; }
  .rail { width: 46px; }
  .rail .it span { font-size: 9.5px; }
  .pane { width: 132px !important; }
  .statusbar .kbd, .statusbar .clock { display: none; }
  .docwin .thumbs { display: none; }
  .docwin .side { position: absolute; right: 22px; top: 0; bottom: 0; width: min(320px, 82vw); min-width: 0; z-index: 6; box-shadow: -2px 0 8px rgba(0,0,0,.25); }
  .docwin .main { position: relative; }
  .docwin .hdrs { grid-template-columns: auto 1fr; }
  .docwin .hdrs > :nth-child(3), .docwin .hdrs > :nth-child(4) { display: none; }
  .intake .iform { width: 220px; }
  .crit .c .row select.op { width: 60px; }
}`;
const title = neutral ? 'Pisarna DMS Demo' : 'EBA DMS Demo';
const body = `<title>${title}</title>\n<style>${css}\n${extraCss}</style>\n<script>${js}</script>\n`;
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'standalone.html'), body);
fs.writeFileSync(path.join(ROOT, 'dist', 'standalone-preview.html'),
  `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body style="margin:0">\n${body}</body></html>\n`);
console.log(`dist/standalone.html  ${(body.length / 1024).toFixed(0)} KB  (${neutral ? 'neutral naming' : 'original naming'})`);
