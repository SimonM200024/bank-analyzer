// Captures the main layouts at the reference size (2560x1392) and a smaller
// desktop size into ./screenshots-out for side-by-side comparison.
//   npm i -D playwright && npx playwright install chromium && npm run screenshots
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/http.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('screenshots-out');
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eba-shots-'));
const app = createApp({ dataDir: dir });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

for (const [w, h] of [[2560, 1392], [1366, 768]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const shot = (p, n) => p.screenshot({ path: path.join(out, `${w}x${h}-${n}.png`) });
  await page.goto(base);
  await page.fill('.login .u', 'mnovak'); await page.fill('.login .p', 'demo'); await page.click('.login .go');
  await page.waitForSelector('table.grid tbody tr');
  await page.click('table.grid tbody tr:nth-child(3)');
  await shot(page, '01-office');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.dblclick('table.grid tbody tr:nth-child(3)')]);
  await pop.setViewportSize({ width: w, height: h });
  await pop.waitForSelector('.side .sh');
  await pop.click('.rtabs [data-t="cover"]'); await pop.waitForTimeout(300); await shot(pop, '12-document');
  await pop.click('.rtabs [data-t="trail"]'); await pop.waitForTimeout(200); await shot(pop, '15-trail');
  await pop.click('.vtabs [data-c="data"]'); await pop.waitForTimeout(200); await shot(pop, '18-data');
  await pop.close();
  await page.click('.rail [data-v="search"]'); await page.click('.crit-actions .go'); await page.waitForTimeout(500); await shot(page, '24-search');
  await page.click('.modtab[data-m="scanner"]'); await page.click('.rail [data-v="packages"]'); await page.waitForTimeout(800); await shot(page, '40-packages');
  await ctx.close();
}
await browser.close();
await new Promise((r) => app.server.close(r));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Screenshots saved to ${out}`);
