// OCR check: the scanned sample is read with Tesseract and the fields are filled.
//   NODE_PATH=$(npm root -g) DEPS=<dir with node_modules: pdfjs-dist, tesseract.js, tesseract.js-core,
//   @tesseract.js-data/eng, @tesseract.js-data/slv> node ocr-e2e.mjs
// jsDelivr/cdnjs requests are answered from those local packages, so it runs offline.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..', 'invoices');
const NM = path.join(process.env.DEPS, 'node_modules');

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname.replace(/^\/invoices\//, '/').replace(/\/$/, '/index.html');
  const file = path.join(appDir, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8792, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await ctx.route(/cdnjs\.cloudflare\.com/, (r) => {
  const u = r.request().url();
  const name = u.endsWith('pdf.worker.min.js') ? 'pdf.worker.min.js' : 'pdf.min.js';
  r.fulfill({ path: path.join(NM, 'pdfjs-dist/build', name), contentType: 'application/javascript' });
});
await ctx.route(/cdn\.jsdelivr\.net\/npm\//, (r) => {
  const u = new URL(r.request().url());
  const m = u.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)(?:@[^/]+)?\/(.*)$/);
  const file = m && path.join(NM, m[1], m[2]);
  if (file && fs.existsSync(file)) {
    const ct = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
    r.fulfill({ path: file, contentType: ct, headers: { 'access-control-allow-origin': '*' } });
  } else {
    console.log('unserved', u.href);
    r.abort();
  }
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto('http://localhost:8792/invoices/');
await page.setInputFiles('#file-input', path.join(here, 'samples', 'scanned-receipt.pdf'));
await page.waitForSelector('#d-scanned:not([hidden])', { timeout: 20000 });
await page.waitForSelector('#d-pages canvas');
const t0 = Date.now();
await page.click('#d-ocr');
await page.waitForFunction(() => /Done|could not/.test(document.getElementById('d-ocr-status').textContent), null, { timeout: 180000 });
const status = await page.textContent('#d-ocr-status');
const got = await page.evaluate(() => ({
  vendor: document.getElementById('d-vendor').value, number: document.getElementById('d-number').value,
  issue: document.getElementById('d-issue').value, total: document.getElementById('d-total').value,
  vat: document.getElementById('d-vat').value, net: document.getElementById('d-net').value
}));
console.log(`OCR took ${((Date.now() - t0) / 1000).toFixed(1)} s — ${status}`);
console.log(JSON.stringify(got));
const want = { vendor: 'Mojster Marko s.p.', number: 'R-77/2026', issue: '2026-10-05', total: '250,00', vat: '0,00', net: '250,00' };
const ok = JSON.stringify(got) === JSON.stringify(want);
console.log(ok ? 'OCR check passed' : 'OCR check FAILED, expected ' + JSON.stringify(want));
await page.screenshot({ path: path.join(process.env.DEPS, 'out', '08-ocr.png') });
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
