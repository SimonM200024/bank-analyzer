import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAmount, parseAmount, parseDate, fmtDate, fmtDateTime, selectedLabel, applyMask, fmtElapsed, isoLocal } from '../src/core/format.js';
import { CONTENT_FIELDS, GENERAL_CRITERIA, PROFILES, OPS, criterionByKey, DEFAULT_COLUMNS, columnById } from '../src/core/schema.js';
import { renderInvoicePage, readDemoMetadata } from '../src/core/page-svg.js';
import { matchCriteria } from '../src/server/search.js';

test('Slovenian amount formatting and parsing', () => {
  assert.equal(fmtAmount(13275.3), '13.275,30');
  assert.equal(fmtAmount(-84.43), '-84,43');
  assert.equal(fmtAmount(0), '0,00');
  assert.equal(parseAmount('13.275,30'), 13275.3);
  assert.equal(parseAmount('1275,5'), 1275.5);
  assert.equal(parseAmount('-84,43'), -84.43);
  assert.equal(parseAmount('abc'), null);
});

test('Slovenian dates', () => {
  assert.equal(fmtDate('2026-10-01T14:39:00'), '1. 10. 2026');
  assert.equal(fmtDateTime('2026-10-01T14:39:00'), '1. 10. 2026 14:39');
  assert.equal(isoLocal(parseDate('1. 10. 2026'), false), '2026-10-01');
  assert.equal(isoLocal(parseDate('01.10.2026'), false), '2026-10-01');
  assert.equal(parseDate('31. 2. 2026'), null, 'invalid calendar date is rejected');
  assert.equal(fmtElapsed('2026-10-05T07:07:00', new Date(2026, 9, 6, 10, 5)), '1 dni(an), 2 uri, 58 minut');
});

test('status bar plural forms', () => {
  assert.equal(selectedLabel(1), 'Izbran 1 dokument');
  assert.equal(selectedLabel(2), 'Izbrana 2 dokumenta');
  assert.equal(selectedLabel(3), 'Izbrani 3 dokumenti');
  assert.equal(selectedLabel(5), 'Izbranih 5 dokumentov');
  assert.equal(selectedLabel(0), 'Izbranih 0 dokumentov');
});

test('display masks', () => {
  assert.equal(applyMask('2026-09-17T10:30:00', 'dd.MM.yyyy', 'date'), '17.09.2026');
  assert.equal(applyMask(1234.5, '#,##0.00', 'amount'), '1.234,50');
  assert.equal(applyMask(1234.5, '0.0', 'amount'), '1234,5');
  assert.equal(applyMask('abc', '>', 'text'), 'ABC');
});

test('search inventory matches the captured tree', () => {
  assert.equal(GENERAL_CRITERIA.length, 22);
  assert.equal(CONTENT_FIELDS.length, 122);
  assert.equal(CONTENT_FIELDS[0].label, 'BIC koda dobaviteljeve banke');
  assert.equal(CONTENT_FIELDS[121].label, 'Znesek predplačila');
  assert.deepEqual(PROFILES.X.map((o) => OPS[o]), ['se začne z', 'vsebuje', 'je enak', 'ni enak', 'manj', 'manj ali enako', 'več', 'več ali enako', 'je prazen', 'ni prazen']);
  assert.equal(criterionByKey.stevilka_racuna.profile, 'X');
  // unusual combinations preserved
  assert.equal(criterionByKey.datum_narocila_dobaviteljeva.profile, 'T');
  assert.equal(criterionByKey.stevilka_narocila_dobaviteljeva.profile, 'C');
  assert.ok(CONTENT_FIELDS.some((f) => f.label === 'BIC koda izdajatelejeve banke'));
  for (const ids of Object.values(DEFAULT_COLUMNS)) for (const id of ids) assert.ok(columnById(id, 'racun'), id);
});

test('generated pages carry metadata readable by the demo OCR only', () => {
  const page = renderInvoicePage({
    seed: 3, number: 'R-1', issueDate: '2026-09-17', serviceDate: '2026-09-16', dueDate: '2026-10-01', reference: 'SI00 1',
    issuer: { name: 'Test d.o.o.', address: 'Ulica 1', postal: 'SI-1000', city: 'Ljubljana', country: 'Slovenija' },
    recipient: { name: 'Prejemnik d.o.o.', address: 'Cesta 2', postal: 'SI-2000', city: 'Maribor', country: 'Slovenija' },
    lines: [{ desc: 'A', qty: 2, price: 10, vatRate: 22 }],
  });
  const meta = readDemoMetadata(page.svg);
  assert.equal(meta.values.stevilka_racuna, 'R-1');
  assert.equal(meta.values.skupni_znesek_racuna, 24.4);
  assert.ok(meta.regions.datum_racuna.w > 0);
  assert.equal(readDemoMetadata('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), null);
});

test('search semantics: OR within a criterion, AND across, empties, comparisons', () => {
  const docs = [
    { category: 'racun', direction: 'in', archived: false, subject: 'Račun od A', fields: { stevilka_racuna: 'R-100', skupni_znesek_racuna: 100, datum_racuna: '2026-09-17' }, tags: [], events: [], location: [], access: [] },
    { category: 'racun', direction: 'in', archived: false, subject: 'Račun od B', fields: { stevilka_racuna: 'X-200', skupni_znesek_racuna: 250.5, datum_racuna: '2026-09-20' }, tags: [], events: [], location: [], access: [] },
    { category: 'racun', direction: 'in', archived: true, subject: 'Račun od C', fields: { skupni_znesek_racuna: 50 }, tags: [], events: [], location: [], access: [] },
    { category: 'pogodbe', direction: 'in', archived: false, subject: 'Pogodba', fields: {}, tags: [], events: [], location: [], access: [] },
  ];
  const h = { signatureState: () => 'Ni podpisan' };
  const run = (criteria) => docs.filter((d) => matchCriteria(d, criteria, h)).map((d) => d.subject);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'starts', value: 'r-' }] }), ['Račun od A']);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'starts', value: 'R' }, { key: 'stevilka_racuna', op: 'starts', value: 'X' }] }), ['Račun od A', 'Račun od B']);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'empty' }], types: { mode: 'in', ids: ['racun'] } }), []);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'empty' }], types: { mode: 'in', ids: ['racun'] }, archived: true }), ['Račun od C']);
  assert.deepEqual(run({ rows: [{ key: 'skupni_znesek_racuna', op: 'lt', value: '200,00' }], types: { mode: 'in', ids: ['racun'] } }), ['Račun od A']);
  assert.deepEqual(run({ rows: [{ key: 'skupni_znesek_racuna', op: 'eq', value: '250,50' }] }), ['Račun od B']);
  assert.deepEqual(run({ rows: [{ key: 'datum_racuna', op: 'eq', value: '17. 9. 2026' }] }), ['Račun od A']);
  assert.deepEqual(run({ types: { mode: 'out', ids: ['racun'] } }), ['Pogodba']);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'ne', value: 'R-100' }], types: { mode: 'in', ids: ['racun'] } }), ['Račun od B']);
  assert.deepEqual(run({ rows: [{ key: 'g_predmet', op: 'contains', value: 'od b' }, { key: 'skupni_znesek_racuna', op: 'lt', value: '100' }] }), []);
  assert.deepEqual(run({ rows: [{ key: 'stevilka_racuna', op: 'starts', value: '' }] }).length, 3, 'empty value is ignored');
});
