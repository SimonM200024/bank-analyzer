// Browser tests (optional): needs the "playwright" package and a Chromium.
//   npm i -D playwright && npx playwright install chromium && npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/http.js';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch { chromium = null; }
const skip = chromium ? false : 'playwright is not installed';

let dir, app, base, browser;
before(async () => {
  if (skip) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eba-e2e-'));
  app = createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => {
  if (skip) return;
  await browser.close();
  await new Promise((r) => app.server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function login(user, size = { width: 1600, height: 900 }) {
  const ctx = await browser.newContext({ viewport: size });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.fill('.login .u', user);
  await page.fill('.login .p', 'demo');
  await page.click('.login .go');
  await page.waitForSelector('table.grid tbody tr');
  return { ctx, page, errors };
}
const rowCount = (page) => page.locator('table.grid tbody tr').count();

test('office grid: counts, column value filter, sort, status bar', { skip }, async () => {
  const { ctx, page, errors } = await login('mnovak');
  const total = await rowCount(page);
  assert.match(await page.textContent('.statusbar .cnt'), new RegExp(`Število dokumentov: ${total}`));
  // filter "Zunanji status" to one value
  await page.click('table.grid thead tr.f th:first-child .ftri');
  await page.locator('.vfilter label', { hasText: 'Kontroliran' }).locator('input').check();
  await page.click('.vfilter .foot [data-m="in"]');
  const filtered = await rowCount(page);
  assert.ok(filtered > 0 && filtered < total);
  const statuses = await page.locator('table.grid tbody tr td:first-child').allTextContents();
  assert.ok(statuses.every((s) => s.trim() === 'Kontroliran'));
  // exclusion
  await page.click('table.grid thead tr.f th:first-child .ftri');
  await page.click('.vfilter .foot [data-m="out"]');
  assert.equal(await rowCount(page), total - filtered);
  await page.click('.gridicons .clr');
  assert.equal(await rowCount(page), total);
  // selection updates the status bar
  await page.click('table.grid tbody tr:nth-child(2)');
  await page.click('table.grid tbody tr:nth-child(4)', { modifiers: ['Shift'] });
  assert.equal(await page.textContent('.statusbar .sel'), 'Izbrani 3 dokumenti');
  // folder change and scope change reload data
  await page.click('.tree .node:has-text("Pogodbe")');
  await page.waitForTimeout(300);
  assert.equal(await page.textContent('table.grid thead tr.h th:nth-child(4)'), 'Pošiljatelj');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('document window: six panels independent of Slika/Podatki; data view shows snippets and Brez slike', { skip }, async () => {
  const { ctx, page, errors } = await login('mnovak');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.dblclick('table.grid tbody tr:nth-child(1)')]);
  pop.on('pageerror', (e) => errors.push(e.message));
  await pop.waitForSelector('.side .sh');
  await pop.click('.rtabs [data-t="versions"]');
  assert.equal(await pop.textContent('.side .sh'), 'Verzije dokumenta');
  await pop.click('.vtabs [data-c="data"]');
  assert.equal(await pop.textContent('.side .sh'), 'Verzije dokumenta', 'right panel kept while switching to Podatki');
  await pop.waitForSelector('table.dataview');
  assert.ok(await pop.locator('table.dataview tr.grp:has-text("Spremni list")').count() === 1);
  assert.ok(await pop.locator('table.dataview td.snip:has-text("Brez slike")').count() >= 1);
  assert.ok(await pop.locator('table.dataview td.snip img').count() >= 1);
  await pop.click('.rtabs [data-t="trail"]');
  assert.equal(await pop.textContent('.side .sh'), 'Dogodki na dokumentu');
  assert.ok(await pop.locator('.vtabs .t.active:has-text("Podatki")').count() === 1, 'center tab kept while switching panels');
  for (const [t, h] of [['sigs', 'Podpisniki dokumenta'], ['cover', 'Spremni list'], ['links', 'Zadeva in povezave'], ['access', 'Uporabniki in dostopi']]) {
    await pop.click(`.rtabs [data-t="${t}"]`);
    assert.equal(await pop.textContent('.side .sh'), h);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('approval through the UI: Prevzemi, edit cover sheet, Parafiraj › Potrdi', { skip }, async () => {
  const { ctx, page, errors } = await login('jkovac');
  await page.selectOption('.pane-foot select', 'office');
  await page.waitForTimeout(300);
  await page.click('.tree .node:has-text("Prejeto")');
  await page.waitForTimeout(400);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.dblclick('table.grid tbody tr:nth-child(1)')]);
  pop.on('pageerror', (e) => errors.push(e.message));
  await pop.waitForSelector('.side .sh');
  await pop.click('.rtabs [data-t="cover"]');
  assert.ok(await pop.isDisabled('.toolbar [data-a="save"]'));
  assert.ok(await pop.isDisabled('.toolbar [data-a="initial"]'));
  await pop.click('.toolbar [data-a="claim"]');
  await pop.waitForSelector('.cover select[data-k="oddelek"]');
  await pop.selectOption('.cover select[data-k="oddelek"]', '3 - Prodaja');
  assert.ok(!(await pop.isDisabled('.toolbar [data-a="save"]')));
  await pop.keyboard.press('Control+s');
  await pop.waitForFunction(() => document.querySelector('.toolbar [data-a="save"]').disabled);
  await pop.click('.toolbar [data-a="initial"]');
  await pop.click('.menu .row:has-text("Potrdi")');
  await pop.waitForFunction(() => document.querySelector('.toolbar select.ext')?.value === '1');
  await pop.click('.rtabs [data-t="trail"]');
  const first = await pop.locator('.evs .ev').first().textContent();
  assert.match(first, /Izvedeno pravilo/);
  assert.match(first, /Potrjen s strani direktorice - v računovodstvo/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('personal settings: Prekliči discards, Uveljavi applies', { skip }, async () => {
  const { ctx, page } = await login('pzupan');
  const open = async () => {
    await page.click('.menubar .mi:has-text("Orodja")');
    await page.click('.menu .row .lbl:text-is("Osebne nastavitve")');
    await page.click('.catdlg .cats [data-c="scan"]');
  };
  await open();
  await page.check('[data-b="noOcrDefault"]');
  await page.click('.dlg .dfoot .btn:has-text("Prekliči")');
  let p = await page.evaluate(() => fetch('/api/getPersonal', { method: 'POST' }).then((r) => r.json()));
  assert.equal(p.scanner.noOcrDefault, false);
  await open();
  await page.check('[data-b="noOcrDefault"]');
  await page.click('.dlg .dfoot .btn:has-text("Uveljavi")');
  p = await page.evaluate(() => fetch('/api/getPersonal', { method: 'POST' }).then((r) => r.json()));
  assert.equal(p.scanner.noOcrDefault, true);
  await page.click('.dlg .dfoot .btn:has-text("Prekliči")');
  await ctx.close();
});

test('search workspace: criteria, repeated rows and result count', { skip }, async () => {
  const { ctx, page, errors } = await login('mnovak');
  await page.click('.rail [data-v="search"]');
  await page.waitForSelector('.crit .c[data-k="stevilka_racuna"]');
  await page.click('.crit-actions .go');
  await page.waitForTimeout(400);
  const all = await rowCount(page);
  const c = page.locator('.crit .c[data-k="g_predmet"]');
  await c.locator('select.op').selectOption('contains');
  await c.locator('input.v').fill('Oblak');
  await page.click('.crit-actions .go');
  await page.waitForTimeout(400);
  const some = await rowCount(page);
  assert.ok(some > 0 && some < all);
  assert.equal(await page.textContent('.tabline .n'), String(some));
  await c.locator('.add').click();
  await page.locator('.crit .c[data-k="g_predmet"] .row').nth(1).locator('select.op').selectOption('contains');
  await page.locator('.crit .c[data-k="g_predmet"] .row').nth(1).locator('input.v').fill('Hitri');
  await page.click('.crit-actions .go');
  await page.waitForTimeout(400);
  assert.ok(await rowCount(page) > some, 'second row is an alternative (OR)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('menu mnemonics: duplicate Alt+K cycles Akcija and Okno', { skip }, async () => {
  const { ctx, page } = await login('mnovak');
  await page.keyboard.press('Alt+k');
  assert.equal(await page.textContent('.menubar .mi.open'), 'Akcija');
  await page.keyboard.press('Alt+k');
  assert.equal(await page.textContent('.menubar .mi.open'), 'Okno');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu').count(), 0);
  await ctx.close();
});

test('layout at 2560x1392 and 1366x768 keeps panes visible', { skip }, async () => {
  for (const size of [{ width: 2560, height: 1392 }, { width: 1366, height: 768 }]) {
    const { ctx, page } = await login('mnovak', size);
    const box = await page.locator('.statusbar').boundingBox();
    assert.ok(box.y + box.height <= size.height + 1);
    assert.ok((await page.locator('.pane').boundingBox()).width >= 160);
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(hScroll, false);
    await ctx.close();
  }
});

test('scanning room: demo scan, import a file, send to my office, intake log', { skip }, async () => {
  const { ctx, page, errors } = await login('mnovak');
  const before = await page.evaluate(() => fetch('/api/listDocuments', { method: 'POST', body: JSON.stringify({ companyId: 'c1', scope: 'office' }) }).then((r) => r.json()).then((x) => x.total));
  await page.click('.modtab[data-m="scanner"]');
  await page.waitForSelector('.intake .bsel');
  await page.selectOption('.intake .bsel', '__new');
  await page.waitForTimeout(400);
  await page.click('.toolbar [data-a="scan"]');
  await page.waitForSelector('.intake .items .item');
  assert.match(await page.textContent('.intake .count'), /1 dokument, 1 slika/);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.toolbar [data-a="import"]')]);
  await chooser.setFiles({ name: 'priloga.txt', mimeType: 'text/plain', buffer: Buffer.from('demo') });
  await page.waitForFunction(() => document.querySelectorAll('.intake .items .item').length === 2);
  await page.locator('.iform [data-f="subject"]').fill('Uvoženo besedilo');
  await page.locator('.iform [data-f="subject"]').press('Tab');
  await page.waitForTimeout(300);
  await page.click('.intake .items .item:first-child');
  const batchesBefore = await page.locator('.intake .bsel option').count();
  await page.keyboard.press('Control+Shift+F4');
  // the dispatched batch leaves the selector; the view falls back to another pending batch
  await page.waitForFunction((n) => document.querySelectorAll('.intake .bsel option').length === n - 1, batchesBefore);
  const after = await page.evaluate(() => fetch('/api/listDocuments', { method: 'POST', body: JSON.stringify({ companyId: 'c1', scope: 'office' }) }).then((r) => r.json()).then((x) => x.total));
  assert.equal(after, before + 2);
  await page.click('.rail [data-v="log"]');
  await page.click('.crit-actions .go');
  await page.waitForTimeout(400);
  assert.ok(await page.locator('table.grid tbody tr:has-text("Uvoženo besedilo")').count() === 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('modern UX: command palette, preview approval, theme switch persists', { skip }, async () => {
  const { ctx, page, errors } = await login('jkovac');
  assert.ok(await page.evaluate(() => document.body.classList.contains('theme-modern')));
  await page.selectOption('.pane-foot select', 'office');
  await page.waitForTimeout(300);
  // Palette jumps to a folder.
  await page.keyboard.press('Control+Shift+P');
  await page.fill('.cmdp input', 'prejeto');
  await page.click('.cmdp .it:has-text("Prejeto")');
  await page.waitForTimeout(400);
  assert.match(await page.textContent('.tree .node.selected'), /Prejeto/);
  // Preview shows the selected invoice and approves it without opening it.
  const before = await rowCount(page);
  assert.ok(before > 0);
  await page.click('table.grid tbody tr:nth-child(1)');
  await page.waitForSelector('.preview .pv-thumb img');
  assert.match(await page.textContent('.preview .pv-eyebrow'), /Prejet/);
  assert.match(await page.textContent('.preview .pv-amount'), /EUR/);
  await page.click('.preview [data-p="initial"]');
  await page.waitForFunction((n) => document.querySelectorAll('table.grid tbody tr').length === n - 1, before);
  // Palette finds documents and menu commands.
  await page.keyboard.press('Control+Shift+P');
  await page.fill('.cmdp input', 'osebne nast');
  await page.waitForSelector('.cmdp .it:has-text("Osebne nastavitve")');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.cmdp').count(), 0);
  // Pogled › Videz › Klasičen (EBA) is saved per user.
  await page.click('.menubar .mi:has-text("Pogled")');
  await page.hover('.menu .row:has-text("Videz")');
  await page.click('.menu .row:has-text("Klasičen (EBA)")');
  await page.waitForFunction(() => !document.body.classList.contains('theme-modern'));
  await page.reload();
  await page.waitForSelector('table.grid tbody tr');
  assert.equal(await page.evaluate(() => document.body.classList.contains('theme-modern')), false);
  assert.equal(await page.locator('.preview').isVisible(), false);
  await page.click('.menubar .mi:has-text("Pogled")');
  await page.hover('.menu .row:has-text("Videz")');
  await page.click('.menu .row:has-text("Sodoben")');
  await page.waitForFunction(() => document.body.classList.contains('theme-modern'));
  assert.deepEqual(errors, []);
  await ctx.close();
});
