// End-to-end check of the Invoices app in headless Chromium.
//   NODE_PATH=$(npm root -g) DEPS=<dir with node_modules/pdfjs-dist + jszip> YEAR=<dir of year PDFs> \
//   SHELL_JS=<adrial-shell.js copy> OUT=<screenshots dir> node e2e.mjs
// CDN scripts are served from local copies so the test runs offline.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..', 'invoices');
const DEPS = process.env.DEPS;
const OUT = process.env.OUT || path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = url.pathname === '/_shared/adrial-shell.js' ? process.env.SHELL_JS : path.join(appDir, url.pathname.replace(/^\/invoices\//, '/').replace(/\/$/, '/index.html'));
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8791, r));

const local = {
  'pdf.min.js': path.join(DEPS, 'node_modules/pdfjs-dist/build/pdf.min.js'),
  'pdf.worker.min.js': path.join(DEPS, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
  'jszip.min.js': path.join(DEPS, 'node_modules/jszip/dist/jszip.min.js')
};

const failures = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
  if (!ok) failures.push(name);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());

async function newPage(opts) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1360, height: 900 }, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (r) => {
    const name = Object.keys(local).find((k) => r.request().url().endsWith('/' + k));
    if (name) r.fulfill({ path: local[name], contentType: 'application/javascript' });
    else r.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); failures.push('pageerror: ' + e.message); });
  return { ctx, page };
}

const { ctx, page } = await newPage();
await page.goto('http://localhost:8791/invoices/');
await page.waitForSelector('#onboard:not([hidden])');
await page.screenshot({ path: path.join(OUT, '01-empty.png'), fullPage: true });

// --- import the six representative samples and walk the review queue ---
const samples = path.join(here, 'samples');
const files = ['studio-lipa-2026-0142.pdf', 'lumen-telecom-september.pdf', 'nimbus-cloud-oct.pdf', 'sever-gorivo.pdf', 'brightline-ba-2026-311.pdf', 'scanned-receipt.pdf'];
await page.setInputFiles('#file-input', files.map((f) => path.join(samples, f)));
await page.waitForSelector('#detail[open]', { timeout: 30000 });
await page.waitForSelector('#d-pages canvas', { timeout: 15000 });
await page.screenshot({ path: path.join(OUT, '02-review.png') });

const expected = {
  'studio-lipa-2026-0142.pdf': { vendor: 'Studio Lipa d.o.o.', number: '2026-0142', issue: '2026-10-02', due: '2026-10-16', total: '1683,60', vat: '303,60', net: '1380,00', cur: 'EUR', taxid: 'SI12345678' },
  'lumen-telecom-september.pdf': { vendor: 'Lumen Telecom d.d.', number: '3001-2026-0918822', issue: '2026-10-03', due: '2026-10-18', total: '65,99', vat: '11,90', net: '54,09', cur: 'EUR', taxid: 'SI55667788' },
  'nimbus-cloud-oct.pdf': { vendor: 'Nimbus Cloud, Inc.', number: 'NC-48213-0010', issue: '2026-10-01', due: '2026-10-01', total: '49,00', vat: '0,00', net: '49,00', cur: 'USD', taxid: '' },
  'sever-gorivo.pdf': { vendor: 'Bencinski servis Sever d.o.o.', number: '0123-45-678901', issue: '2026-09-28', due: '2026-09-28', total: '64,90', vat: '11,50', net: '53,40', cur: 'EUR', taxid: 'SI24681357' },
  'brightline-ba-2026-311.pdf': { vendor: 'Brightline Analytics Ltd', number: 'BA-2026-311', issue: '2026-09-14', due: '2026-10-14', total: '480,00', vat: '80,00', net: '400,00', cur: 'GBP', taxid: 'GB123456789' },
  'scanned-receipt.pdf': { vendor: '', number: '', issue: '', due: '', total: '', vat: '', net: '', cur: 'EUR', taxid: '' }
};

for (let i = 0; i < files.length; i++) {
  const eyebrow = await page.textContent('#d-eyebrow');
  const name = await page.evaluate(() => window.__invoicesApp.state.current.fileName);
  const got = await page.evaluate(() => ({
    vendor: document.getElementById('d-vendor').value, number: document.getElementById('d-number').value,
    issue: document.getElementById('d-issue').value, due: document.getElementById('d-due').value,
    total: document.getElementById('d-total').value, vat: document.getElementById('d-vat').value, net: document.getElementById('d-net').value,
    cur: document.getElementById('d-cur').value, taxid: document.getElementById('d-taxid').value
  }));
  check(`review ${i + 1}/${files.length} eyebrow`, eyebrow, `TO CHECK · ${i + 1} OF ${files.length}`);
  check(`fields ${name}`, got, expected[name]);
  if (name === 'scanned-receipt.pdf') {
    check('scanned notice shown', await page.isVisible('#d-scanned'), true);
    await page.fill('#d-vendor', 'Mojster Marko s.p.');
    await page.fill('#d-issue', '2026-10-05');
    await page.fill('#d-total', '250');
    await page.fill('#d-vat', '0');
    await page.fill('#d-net', '250');
    await page.selectOption('#d-cat', 'Other');
  }
  if (name === 'nimbus-cloud-oct.pdf') {
    check('EUR field visible for USD', await page.isVisible('#d-eur'), true);
    await page.fill('#d-eur', '45,10');
  }
  if (name === 'brightline-ba-2026-311.pdf') await page.fill('#d-eur', '553,20');
  if (name === 'studio-lipa-2026-0142.pdf') {
    await page.screenshot({ path: path.join(OUT, '02b-review-first.png') });
  }
  await page.click('#d-save');
  await page.waitForTimeout(250);
}
check('dialog closed after queue', await page.isVisible('#detail'), false);
await page.waitForSelector('#dash:not([hidden])');
await page.selectOption('#f-year', '2026');
await page.waitForTimeout(200);
check('invoices in table', await page.locator('#t-body tr').count(), 6);
check('hero total', await page.textContent('#k-spent'), await page.evaluate((v) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(v), 1683.60 + 65.99 + 45.10 + 64.90 + 553.20 + 250));

// duplicate upload is skipped
await page.setInputFiles('#file-input', [path.join(samples, 'studio-lipa-2026-0142.pdf')]);
await page.waitForTimeout(800);
check('duplicate skipped', await page.locator('#t-body tr').count(), 6);

// remembered vendor rule: re-reading Lumen's VAT ID gives the stored name
check('rules stored', await page.evaluate(() => Object.keys(window.__invoicesApp.state.rules).length >= 5), true);

// CSV export
const [csvDl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('#export-menu summary'); await page.click('[data-act="csv"]'); })()]);
const csv = fs.readFileSync(await csvDl.path(), 'utf8');
check('csv rows', csv.trim().split('\r\n').length, 7);
check('csv decimal comma', /;1683,60;/.test(csv), true);

// Full backup, then restore into a fresh browser profile
const [bkDl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('#export-menu summary'); await page.click('[data-act="backup"]'); })()]);
const backupPath = path.join(OUT, 'backup.zip');
await bkDl.saveAs(backupPath);
const fresh = await newPage();
await fresh.page.goto('http://localhost:8791/invoices/');
await fresh.page.waitForSelector('#onboard:not([hidden])');
await fresh.page.setInputFiles('#restore-input', backupPath);
await fresh.page.waitForSelector('#dash:not([hidden])', { timeout: 20000 });
await fresh.page.selectOption('#f-year', '2026');
check('restored invoices', await fresh.page.locator('#t-body tr').count(), 6);
await fresh.ctx.close();

// --- a full year of invoices for the dashboard ---
const yearDir = process.env.YEAR;
const yearFiles = fs.readdirSync(yearDir).filter((f) => f.endsWith('.pdf')).map((f) => path.join(yearDir, f));
const t0 = Date.now();
await page.setInputFiles('#file-input', yearFiles);
await page.waitForSelector('#detail[open]', { timeout: 120000 });
console.log(`imported ${yearFiles.length} PDFs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const yr = await page.evaluate(() => {
  const list = window.__invoicesApp.state.invoices.filter((x) => x.status === 'review');
  return {
    complete: list.filter((x) => x.total != null && x.vendor && x.issueDate && x.dueDate && x.number).length,
    consistent: list.filter((x) => x.net != null && x.vat != null && Math.abs(x.net + x.vat - x.total) < 0.015).length,
    vendors: Array.from(new Set(list.map((x) => x.vendor))).sort(),
    cats: Object.fromEntries(list.map((x) => [x.vendor, x.category])),
    dupes: list.filter((x) => x.duplicateOf).map((x) => x.fileName).sort()
  };
});
check('year set: vendor, number, dates and total on every invoice', yr.complete, yearFiles.length);
check('year set: net + VAT = total on every invoice', yr.consistent, yearFiles.length);
check('year set: vendors', yr.vendors, ['Bencinski servis Sever d.o.o.', 'Brightline Analytics Ltd', 'Lumen Telecom d.d.', 'Nimbus Cloud, Inc.', 'Pisarna Center d.o.o.', 'Računovodstvo Bilanca d.o.o.', 'Studio Lipa d.o.o.', 'Tehno Tir d.o.o.']);
check('year set: categories', ['Lumen Telecom d.d.', 'Pisarna Center d.o.o.', 'Računovodstvo Bilanca d.o.o.', 'Nimbus Cloud, Inc.', 'Bencinski servis Sever d.o.o.', 'Tehno Tir d.o.o.'].map((v) => yr.cats[v]),
  ['Telecom & internet', 'Rent', 'Accounting & legal', 'Software & SaaS', 'Fuel & travel', 'Hardware']);
// these three repeat invoice numbers already added from the samples
check('year set: re-sent invoices flagged as possible duplicates', yr.dupes, ['brightline-09.pdf', 'nimbus-10.pdf', 'studio-lipa-10.pdf']);
await page.click('#d-close');
// mark everything as checked & paid except two, so the dashboard looks lived-in
await page.evaluate(async () => {
  const app = window.__invoicesApp;
  app.state.invoices.forEach((x, i) => { x.status = 'ok'; if (x.currency === 'USD') x.eur = 45.1; if (x.currency === 'GBP') x.eur = 553.2; x.paid = (x.dueDate || '') < '2026-10-01' || i % 4 === 0; if (x.paid) x.paidDate = x.dueDate; });
});
await page.selectOption('#f-year', '');
await page.selectOption('#f-year', '2026');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, '03-dashboard-light.png'), fullPage: true });
await page.hover('#c-month .col:nth-child(3)');
await page.waitForTimeout(100);
await page.screenshot({ path: path.join(OUT, '04-tooltip.png'), clip: { x: 0, y: 380, width: 1360, height: 520 } });
await page.click('#c-cat .hbar >> nth=0');
await page.waitForTimeout(200);
check('category filter narrows table', (await page.locator('#t-body tr').count()) < 66, true);
await page.click('#c-cat .hbar.on');
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(OUT, '05-dashboard-dark.png'), fullPage: true });
await page.emulateMedia({ colorScheme: 'light' });

const mobile = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.page.goto('http://localhost:8791/invoices/');
await mobile.page.setInputFiles('#file-input', files.slice(0, 2).map((f) => path.join(samples, f)));
await mobile.page.waitForSelector('#d-pages canvas', { timeout: 20000 });
await mobile.page.screenshot({ path: path.join(OUT, '06-mobile-review.png') });
await mobile.page.click('#d-close');
const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('no horizontal page scroll on phone', overflow <= 0, true);
await mobile.page.screenshot({ path: path.join(OUT, '07-mobile-dashboard.png'), fullPage: true });

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
