// End-to-end API tests against a real server on a random port with a
// temporary data directory. They exercise behaviour, not fixture counts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/http.js';

let dir, app, base;

function client() {
  let cookie = '';
  const c = {
    async login(username, password = 'demo') {
      const r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ username, password }) });
      assert.equal(r.status, 200, `login ${username}`);
      cookie = r.headers.get('set-cookie').split(';')[0];
      return c;
    },
    async call(op, args = {}) {
      const r = await fetch(`${base}/api/${op}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      const body = await r.json().catch(() => null);
      return { status: r.status, body };
    },
    async ok(op, args) {
      const r = await c.call(op, args);
      assert.equal(r.status, 200, `${op}: ${JSON.stringify(r.body)}`);
      return r.body;
    },
    async get(p) { return fetch(`${base}${p}`, { headers: { cookie } }); },
    async upload(name, bytes, type) {
      const r = await fetch(`${base}/api/upload`, { method: 'POST', headers: { cookie, 'Content-Type': type, 'X-Filename': encodeURIComponent(name) }, body: bytes });
      assert.equal(r.status, 200);
      return r.json();
    },
  };
  return c;
}

async function start() {
  app = createApp({ dataDir: dir });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
}
async function stop() { await new Promise((r) => app.server.close(r)); }

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eba-test-'));
  await start();
});
after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test('login rejects wrong password and service accounts', async () => {
  let r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ username: 'mnovak', password: 'x' }) });
  assert.equal(r.status, 401);
  r = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ username: 'skenirnica-lipnik', password: 'demo' }) });
  assert.equal(r.status, 401);
  r = await fetch(`${base}/api/whoami`, { method: 'POST' });
  assert.equal(r.status, 401);
});

test('folder counts derive from data and update after workflow actions', async () => {
  const maja = await client().login('mnovak');
  const args = { companyId: 'c1', scope: 'office', folderId: 'in/racun' };
  const counts = await maja.ok('folderCounts', { companyId: 'c1', scope: 'office' });
  const list = await maja.ok('listDocuments', args);
  assert.equal(counts['in/racun'].count, list.total);
  assert.equal(counts['in/racun'].unread, list.rows.filter((r) => r.unread).length);
  // sub-views partition by external status
  const views = ['in/racun/checked', 'in/racun/pantheon', 'in/racun/other', 'in/racun/prejeto'];
  const sum = views.reduce((s, v) => s + counts[v].count, 0);
  const statusKnown = list.rows.filter((r) => [0, 1, 2, 3, 4].includes(r.externalStatus)).length;
  assert.equal(sum, statusKnown);
  // marking a document read decrements the unread badge
  const unread = list.rows.find((r) => r.unread);
  if (unread) {
    await maja.ok('markRead', { id: unread.id, read: true });
    const after = await maja.ok('folderCounts', { companyId: 'c1', scope: 'office' });
    assert.equal(after['in/racun'].unread, counts['in/racun'].unread - 1);
  }
});

test('director approval runs the routing rule: status, external status, routing, events', async () => {
  const jana = await client().login('jkovac');
  const office = await jana.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun/prejeto' });
  const target = office.rows.find((r) => r.externalStatus === 0);
  assert.ok(target, 'a received invoice waits in the director office');
  // the toolbar state in a document window: claim first
  let doc = await jana.ok('getDocument', { id: target.id, open: true });
  assert.equal(doc.allowed.claim, true);
  assert.equal(doc.allowed.save, false);
  await jana.ok('claim', { id: target.id });
  doc = await jana.ok('getDocument', { id: target.id });
  assert.equal(doc.allowed.save, true);
  const saved = await jana.ok('saveDocument', { id: target.id, fields: { oddelek: '1 - Uprava', stroskovni_nosilec: 'Splošno' } });
  assert.equal(saved.changed, true);
  await jana.ok('initial', { id: target.id });
  doc = await jana.ok('getDocument', { id: target.id });
  assert.equal(doc.externalStatus, 1);
  assert.equal(doc.fields.status, 'Potrjen');
  assert.equal(doc.fields.oddelek, '1 - Uprava');
  assert.equal(doc.inOffice, false, 'document left the director office');
  const ev = doc.events; // newest first
  const actions = ev.map((e) => e.action);
  for (const a of ['Izvedeno pravilo', 'Posredovan', 'Spremenjen zunanji status', 'Parafiran (Potrdi)', 'Sprememba na spremnem listu', 'Prevzet', 'Odprt']) assert.ok(actions.includes(a), a);
  assert.equal(ev[0].action, 'Izvedeno pravilo');
  assert.equal(ev[0].rule, 'Potrjen s strani direktorice - v računovodstvo');
  const fwd = ev.find((e) => e.action === 'Posredovan');
  assert.match(fwd.from, /\(Pravilo 'Potrjen s strani direktorice - v računovodstvo'\)/);
  assert.equal(fwd.toUsers, 'Sodelavec v oddelku računovodstva');
  assert.equal(ev.find((e) => e.action === 'Spremenjen zunanji status').status, '0 - Prejet -> 1 - Potrjen');
  assert.equal(ev.find((e) => e.action === 'Sprememba na spremnem listu' && e.userLabel.endsWith('(Pravilo)')).fields, 'Status: Potrjen');
  assert.ok(doc.signatures.some((s) => s.label === 'Potrdi' && s.demo === true));
  // accounting now has it in their office
  const maja = await client().login('mnovak');
  const mine = await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' });
  assert.ok(mine.rows.some((r) => r.id === target.id && r.inOffice));
  // the director can no longer modify it
  const denied = await jana.call('saveDocument', { id: target.id, fields: { oddelek: '2 - Finance' } });
  assert.equal(denied.status, 403);
});

test('access checks apply to queries and operations, not only buttons', async () => {
  const tina = await client().login('tkrajnc'); // external accountant: invoices only with an access grant
  const maja = await client().login('mnovak');
  const any = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' })).rows[0];
  assert.equal((await tina.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' })).total, 0);
  assert.equal((await tina.ok('search', { companyId: 'c1', criteria: { rows: [] } })).total, 0);
  assert.equal((await tina.call('getDocument', { id: any.id })).status, 403);
  assert.equal((await tina.call('claim', { id: any.id })).status, 403);
  assert.equal((await tina.call('addNote', { id: any.id })).status, 403);
  // blob of an unreadable document is refused
  const full = await maja.ok('getDocument', { id: any.id });
  assert.equal((await tina.get(`/blob/${full.pages[0].blobId}`)).status, 403);
  assert.equal((await maja.get(`/blob/${full.pages[0].blobId}`)).status, 200);
  // after an explicit grant, read is allowed but modification is still not
  const andrej = await client().login('ahorvat');
  await andrej.ok('grantAccess', { id: any.id, holders: ['user:u5'] });
  assert.equal((await tina.call('getDocument', { id: any.id })).status, 200);
  assert.equal((await tina.call('saveDocument', { id: any.id, fields: { opomba: 'x' } })).status, 403);
  assert.equal((await tina.call('forward', { id: any.id, targets: ['role:r1'] })).status, 403);
  // pro formas and contracts are outside her role matrix even with a grant
  const pro = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/predracun' })).rows[0];
  await andrej.ok('grantAccess', { id: pro.id, holders: ['user:u5'] });
  assert.equal((await tina.call('getDocument', { id: pro.id })).status, 403);
});

test('cross-company data stays isolated', async () => {
  const luka = await client().login('lmlakar'); // JAVOR MG only
  const maja = await client().login('mnovak');
  const lipnikDoc = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' })).rows[0];
  assert.equal((await luka.call('getDocument', { id: lipnikDoc.id })).status, 403);
  assert.equal((await luka.call('listDocuments', { companyId: 'c1', scope: 'live' })).status, 403);
  const all = await luka.ok('listDocuments', { companyId: 'all', scope: 'live' });
  assert.ok(all.rows.length > 0);
  assert.ok(all.rows.every((r) => r.companyId === 'c2'));
  assert.equal((await luka.call('searchPartners', { companyId: 'c1' })).status, 403);
  const me = await luka.ok('whoami');
  assert.deepEqual(me.companies.map((c) => c.id), ['c2']);
});

test('analyst can read but not modify; supervision requires the role flag', async () => {
  const peter = await client().login('pzupan');
  const list = await peter.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' });
  assert.ok(list.total > 0);
  assert.ok(list.rows.every((r) => !r.inOffice));
  assert.equal((await peter.call('claim', { id: list.rows[0].id })).status, 403);
  assert.equal((await peter.call('supervision', { companyId: 'c1' })).status, 403);
  const barbara = await client().login('bzorko');
  const sup = await barbara.ok('supervision', { companyId: 'c1' });
  assert.equal(sup.counts.total, sup.counts.VHODNI + sup.counts.IZHODNI + sup.counts.INTERNI);
  const rows = (await barbara.ok('supervision', { companyId: 'c1', roleId: 'r1', folderId: 'in/racun' })).rows;
  assert.ok(rows.length > 0 && rows.every((r) => r.holderName && r.officeSince));
});

test('search and column-backed fields agree with documents', async () => {
  const maja = await client().login('mnovak');
  const some = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' })).rows.find((r) => r.fields.stevilka_racuna);
  const num = some.fields.stevilka_racuna;
  const byEq = await maja.ok('search', { companyId: 'c1', criteria: { types: { mode: 'in', ids: ['racun'] }, rows: [{ key: 'stevilka_racuna', op: 'eq', value: num }] } });
  assert.ok(byEq.rows.some((r) => r.id === some.id));
  assert.ok(byEq.rows.every((r) => r.fields.stevilka_racuna.toLowerCase() === num.toLowerCase()));
  const total = some.fields.skupni_znesek_racuna;
  const gt = await maja.ok('search', { companyId: 'c1', criteria: { rows: [{ key: 'skupni_znesek_racuna', op: 'gt', value: String(total).replace('.', ',') }] } });
  assert.ok(gt.rows.every((r) => r.fields.skupni_znesek_racuna > total));
  const archived = await maja.ok('search', { companyId: 'c1', criteria: { active: false, archived: true, rows: [] } });
  assert.ok(archived.rows.length > 0 && archived.rows.every((r) => r.archived));
  const none = await maja.ok('search', { companyId: 'c1', criteria: { active: false, archived: false, rows: [] } });
  assert.equal(none.total, 0);
  const full = await maja.ok('getDocument', { id: some.id });
  const ex = full.extracted.find((x) => x.key === 'stevilka_racuna');
  assert.equal(ex.value, full.fields.stevilka_racuna, 'data view and cover sheet agree');
});

test('limited result state follows EBA_LIST_LIMIT', async () => {
  const andrej = await client().login('ahorvat');
  const s = await andrej.ok('getAppSettings');
  s.system.env = [{ key: 'EBA_LIST_LIMIT', value: '10', concealed: false }];
  await andrej.ok('saveAppSettings', { system: s.system });
  const list = await andrej.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' });
  assert.equal(list.limited, true);
  assert.equal(list.rows.length, 10);
  assert.ok(list.total > 10);
  s.system.env = [{ key: 'EBA_LIST_LIMIT', value: '1000', concealed: false }];
  await andrej.ok('saveAppSettings', { system: s.system });
});

test('settings secrets stay masked and Apply keeps unchanged secrets', async () => {
  const andrej = await client().login('ahorvat');
  const s = await andrej.ok('getAppSettings');
  assert.equal(s.connections[0].password, '••••••••');
  assert.ok(!JSON.stringify(s).includes('demo-db-secret'));
  s.connections[0].server = 'db.demo.local';
  s.system.env.push({ key: 'API_TOKEN', value: 'tajno', concealed: true });
  const saved = await andrej.ok('saveAppSettings', s);
  assert.equal(saved.connections[0].server, 'db.demo.local');
  assert.equal(saved.system.env.find((e) => e.key === 'API_TOKEN').value, '••••••••');
  assert.equal(app.svc.s.settings.connections[0].password, 'demo-db-secret', 'masked value did not overwrite the secret');
  assert.equal(app.svc.s.settings.system.env.find((e) => e.key === 'API_TOKEN').value, 'tajno');
  const test = await andrej.ok('testConnection', { connection: saved.connections[0] });
  assert.equal(test.demo, true);
  assert.match(test.message, /Demo test/);
  const maja = await client().login('mnovak');
  assert.equal((await maja.call('saveAppSettings', s)).status, 403);
});

test('content edits preserve versions; restore keeps history', async () => {
  const maja = await client().login('mnovak');
  const row = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' })).rows.find((r) => r.inOffice);
  await maja.ok('claim', { id: row.id });
  const before = await maja.ok('getDocument', { id: row.id });
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await maja.upload('nova-stran.png', png, 'image/png');
  const after = await maja.ok('replacePages', { id: row.id, blobIds: [up.id] });
  assert.equal(after.versions.length, before.versions.length + 1);
  assert.deepEqual(after.versions[0].snapshot.pages.map((p) => p.blobId), before.pages.map((p) => p.blobId));
  assert.equal(after.pages[0].blobId, up.id);
  // old page bytes are still retrievable
  assert.equal((await maja.get(`/blob/${before.pages[0].blobId}`)).status, 200);
  const restored = await maja.ok('restoreVersion', { id: row.id, n: after.versions[0].n });
  assert.deepEqual(restored.pages.map((p) => p.blobId), before.pages.map((p) => p.blobId));
  assert.equal(restored.versions.length, after.versions.length + 1);
  // a foreign upload cannot be attached by someone else
  const jana = await client().login('jkovac');
  const up2 = await jana.upload('x.png', png, 'image/png');
  assert.equal((await maja.call('attachFile', { id: row.id, blobId: up2.id })).status, 403);
});

test('import keeps files intact, extracts demo pages, dispatch creates documents and log entries', async () => {
  const maja = await client().login('mnovak');
  const batch = await maja.ok('newBatch', { companyId: 'c1' });
  // an SVG produced by the demo generator (OCR-readable) and an arbitrary PDF (not readable)
  const someDoc = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' })).rows[0];
  const full = await maja.ok('getDocument', { id: someDoc.id });
  const svgBytes = Buffer.from(await (await maja.get(`/blob/${full.pages[0].blobId}`)).arrayBuffer());
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const a = await maja.upload('racun.svg', svgBytes, 'image/svg+xml');
  const b = await maja.upload('pogodba.pdf', pdfBytes, 'application/pdf');
  const res = await maja.ok('importFiles', { batchId: batch.id, blobIds: [a.id, b.id], perFile: true, ocr: true, category: 'racun' });
  assert.equal(res.created.length, 2);
  const [d1, d2] = res.batch.docs;
  assert.ok(d1.extracted.length > 0 && d1.fields.stevilka_racuna, 'demo OCR read the generated page');
  assert.equal(d2.extracted.length, 0, 'arbitrary PDFs are not "recognised"');
  for (const [d, src] of [[d1, svgBytes], [d2, pdfBytes]]) {
    const got = Buffer.from(await (await maja.get(`/blob/${d.pages[0].blobId}`)).arrayBuffer());
    assert.ok(got.equals(src), 'file bytes are unchanged');
  }
  await maja.ok('updateIntakeDoc', { batchId: batch.id, docId: d2.id, patch: { sender: 'Testni pošiljatelj d.o.o.', category: 'pogodbe', subject: 'Testna pogodba' } });
  const out = await maja.ok('dispatchIntake', { batchId: batch.id, mode: 'users', targets: ['role:r3'] });
  assert.equal(out.created.length, 2);
  const jana = await client().login('jkovac');
  const created = await jana.ok('getDocument', { id: out.created[1] });
  assert.equal(created.subject, 'Testna pogodba');
  assert.equal(created.category, 'pogodbe');
  assert.equal(created.pages[0].mime, 'application/pdf');
  assert.ok(created.inOffice);
  assert.deepEqual(created.events.map((e) => e.action).slice(-4).reverse(), ['Nov', 'Prejet', 'Podpisan', 'Posredovan']);
  const log = await maja.ok('searchIntakeLog', { criteria: { companyId: 'c1' } });
  assert.ok(log.rows.some((r) => r.docId === out.created[0]) && log.rows.some((r) => r.docId === out.created[1]));
  assert.ok((await maja.ok('listBatches', { companyId: 'c1' })).batches.every((x) => x.id !== batch.id), 'dispatched batch leaves Paketi');
});

test('outgoing dispatch lifecycle and demo exchange never claims a real send', async () => {
  const maja = await client().login('mnovak');
  const list = await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'out/racun' });
  const prep = list.rows.find((r) => r.dispatchState === 'prep' && r.signatureState === 'Ni podpisan');
  await maja.ok('sign', { id: prep.id });
  await maja.ok('dispatchAction', { id: prep.id, op: 'toDispatch' });
  let q = await maja.ok('listDocuments', { companyId: 'c1', scope: 'dispatch' });
  assert.ok(q.rows.some((r) => r.id === prep.id));
  await maja.ok('dispatchAction', { id: prep.id, op: 'returnToPrep' });
  await maja.ok('dispatchAction', { id: prep.id, op: 'toDispatch' });
  const sr = await maja.ok('sendReceive', { companyId: 'c1' });
  assert.ok(sr.sent >= 1);
  assert.match(sr.message, /demo/i);
  const d = await maja.ok('getDocument', { id: prep.id });
  assert.equal(d.dispatch.state, 'sent');
  assert.match(d.events[0].detail, /ni bil dejansko poslan/);
  q = await maja.ok('listDocuments', { companyId: 'c1', scope: 'dispatch' });
  assert.ok(!q.rows.some((r) => r.id === prep.id));
});

test('tags, notes, clipboard links, classification and archive persist and show in rows', async () => {
  const maja = await client().login('mnovak');
  const rows = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' })).rows.filter((r) => r.inOffice);
  const [x, y] = rows;
  await maja.ok('addTag', { ids: [x.id], tag: 'Testna oznaka' });
  await maja.ok('addNote', { ids: [x.id] });
  await maja.ok('linkDocuments', { id: x.id, targetIds: [y.id] });
  await maja.ok('classify', { ids: [x.id], code: '02.01' });
  const got = await maja.ok('getDocument', { id: x.id });
  assert.ok(got.tags.includes('Testna oznaka'));
  assert.equal(got.note, 'yellow');
  assert.ok(got.links.some((l) => l.docId === y.id));
  assert.equal(got.classificationCode, '02.01');
  assert.ok(got.events.some((e) => e.action === 'Povezan dokument') && got.events.some((e) => e.action === 'Klasificiran'));
  const notes = await maja.ok('listDocuments', { companyId: 'c1', scope: 'notes' });
  assert.ok(notes.rows.some((r) => r.id === x.id));
  await maja.ok('archive', { ids: [y.id] });
  const live = await maja.ok('listDocuments', { companyId: 'c1', scope: 'live', folderId: 'in/racun' });
  assert.ok(!live.rows.some((r) => r.id === y.id), 'archived documents leave the live scope');
});

test('personal settings and substitutions; substitution grants office access', async () => {
  const maja = await client().login('mnovak');
  const nina = await client().login('nkos');
  const before = await nina.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' });
  const today = new Date().toISOString().slice(0, 10);
  await maja.ok('savePersonal', { substitutions: [{ companyId: 'c1', substituteUserId: 'u8', from: today, to: today, notify: true, desc: 'Dopust' }], scanner: { noAutoSubject: true } });
  const p = await maja.ok('getPersonal');
  assert.equal(p.scanner.noAutoSubject, true);
  const during = await nina.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' });
  assert.ok(during.total > before.total, 'substitute sees the substituted office');
  await maja.ok('savePersonal', { substitutions: [] });
  const bad = await maja.call('savePersonal', { substitutions: [{ substituteUserId: 'u8', from: '2026-10-10', to: '2026-10-01' }] });
  assert.equal(bad.status, 400);
});

test('state survives a server restart', async () => {
  const maja = await client().login('mnovak');
  const row = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' })).rows.find((r) => r.inOffice);
  await maja.ok('addTag', { ids: [row.id], tag: 'Po ponovnem zagonu' });
  await stop();
  await start();
  const again = await client().login('mnovak');
  const doc = await again.ok('getDocument', { id: row.id });
  assert.ok(doc.tags.includes('Po ponovnem zagonu'));
});

test('export produces a zip with pages and metadata and records the event', async () => {
  const maja = await client().login('mnovak');
  const row = (await maja.ok('listDocuments', { companyId: 'c1', scope: 'office', folderId: 'in/racun' })).rows[0];
  const r = await maja.get(`/export?ids=${row.id}&shortcut=1`);
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const text = buf.toString('latin1');
  assert.ok(text.includes('metapodatki.json') && text.includes('dokument.url'));
  const doc = await maja.ok('getDocument', { id: row.id });
  assert.equal(doc.events[0].action, 'Izvožen');
});

test('static file routes cannot escape their folders', async () => {
  for (const u of ['/docs/%2E%2E%2Fdata%2Fstate.json', '/core/%2E%2E%2Fserver%2Fservice.js', '/%2E%2E%2Fdata%2Fstate.json', '/css/%2E%2E%2F%2E%2E%2Fdata%2Fstate.json']) {
    const r = await fetch(base + u);
    assert.equal(r.status, 404, u);
  }
  assert.equal((await fetch(`${base}/README.md`)).status, 200);
  assert.equal((await fetch(`${base}/core/format.js`)).status, 200);
});
