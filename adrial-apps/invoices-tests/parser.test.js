// Parser tests: node --test adrial-apps/invoices-tests/
// Each sample is the line list pdf.js produces (columns joined with 3+ spaces).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../invoices/parser.js');

const opts = { ownNames: ['adrial'] };

test('Slovenian d.o.o. invoice with one VAT rate', () => {
  const r = P.parseInvoice([
    'Studio Lipa d.o.o.',
    'Trubarjeva cesta 12, 1000 Ljubljana',
    'ID za DDV: SI12345678   Matična št.: 1234567000',
    'TRR: SI56 0201 0001 2345 678',
    'Kupec:',
    'Adrialvallis d.o.o.',
    'Dunajska cesta 5, 1000 Ljubljana',
    'ID za DDV: SI87654321',
    'RAČUN št. 2026-0142',
    'Datum računa: 02.10.2026   Datum opravljene storitve: 30.09.2026',
    'Rok plačila: 16.10.2026',
    'Opis   Količina   Cena   DDV %   Znesek',
    'Oblikovanje spletne strani   1   1.200,00   22 %   1.200,00',
    'Gostovanje (12 mesecev)   1   180,00   22 %   180,00',
    'Skupaj brez DDV   1.380,00',
    'DDV 22 %   303,60',
    'Skupaj za plačilo   1.683,60 €',
    'Sklic: SI00 2026-0142'
  ], opts);
  assert.equal(r.vendor, 'Studio Lipa d.o.o.');
  assert.equal(r.vendorTaxId, 'SI12345678');
  assert.equal(r.number, '2026-0142');
  assert.equal(r.issueDate, '2026-10-02');
  assert.equal(r.dueDate, '2026-10-16');
  assert.equal(r.currency, 'EUR');
  assert.equal(r.total, 1683.6);
  assert.equal(r.vat, 303.6);
  assert.equal(r.net, 1380);
  assert.equal(r.vatRate, 22);
  assert.equal(r.confidence.total, 'high');
  assert.equal(r.confidence.vat, 'high');
});

test('US SaaS invoice, reverse charge, USD', () => {
  const r = P.parseInvoice([
    'Invoice',
    'Invoice number   ABCD1234-0007',
    'Date of issue   October 1, 2026',
    'Date due   October 1, 2026',
    'Nimbus Cloud, Inc.',
    '548 Market St, San Francisco, CA 94104, United States',
    'Bill to',
    'Adrialvallis d.o.o.',
    'Ljubljana, Slovenia',
    'SI VAT SI87654321',
    '$49.00 USD due October 1, 2026',
    'Description   Qty   Unit price   Amount',
    'Team plan (Oct 1 – Nov 1, 2026)   1   $49.00   $49.00',
    'Subtotal   $49.00',
    'Total   $49.00',
    'Amount due   $49.00 USD',
    'Tax to be paid on reverse charge basis'
  ], opts);
  assert.equal(r.vendor, 'Nimbus Cloud, Inc.');
  assert.equal(r.number, 'ABCD1234-0007');
  assert.equal(r.issueDate, '2026-10-01');
  assert.equal(r.dueDate, '2026-10-01');
  assert.equal(r.currency, 'USD');
  assert.equal(r.total, 49);
  assert.equal(r.vat, 0);
  assert.equal(r.net, 49);
  assert.equal(r.category, 'Software & SaaS');
});

test('Telecom bill: known vendor, dates with spaces, net + VAT lines', () => {
  const r = P.parseInvoice([
    'Telekom Slovenije, d.d.',
    'Cigaletova ulica 15, 1000 Ljubljana',
    'ID za DDV: SI98511734',
    'RAČUN ŠT.: 3001-2026-0918822',
    'Datum izdaje: 3. 10. 2026',
    'Obdobje: 1. 9. 2026 – 30. 9. 2026',
    'Naročnik: ADRIALVALLIS D.O.O.',
    'Mobilna telefonija   24,58',
    'Internet   29,51',
    'Osnova za DDV 22 %   54,09',
    'DDV 22 %   11,90',
    'Znesek za plačilo (EUR)   65,99',
    'Rok plačila: 18. 10. 2026'
  ], opts);
  assert.equal(r.vendor, 'Telekom Slovenije');
  assert.equal(r.category, 'Telecom & internet');
  assert.equal(r.number, '3001-2026-0918822');
  assert.equal(r.issueDate, '2026-10-03');
  assert.equal(r.dueDate, '2026-10-18');
  assert.equal(r.total, 65.99);
  assert.equal(r.vat, 11.9);
  assert.equal(r.net, 54.09);
});

test('Fuel receipt with two VAT rates on rate rows', () => {
  const r = P.parseInvoice([
    'PETROL d.d., Ljubljana',
    'Dunajska cesta 50, 1000 Ljubljana',
    'ID za DDV: SI80267432',
    'Račun št.: 0123-45-678901',
    'Datum: 28.09.2026 14:32',
    'Bencin 95   42,10 L   1,489   62,69',
    'Kava   2,20',
    'Skupaj EUR   64,89',
    'DDV 22%   osnova   51,39   DDV   11,30',
    'DDV 9,5%   osnova   2,01   DDV   0,19',
    'Plačano s kartico   64,89'
  ], opts);
  assert.equal(r.vendor, 'Petrol');
  assert.equal(r.category, 'Fuel & travel');
  assert.equal(r.issueDate, '2026-09-28');
  assert.equal(r.total, 64.89);
  assert.equal(r.vat, 11.49);
  assert.equal(r.net, 53.4);
});

test('UK invoice with VAT 20% and pound amounts', () => {
  const r = P.parseInvoice([
    'Brightline Analytics Ltd',
    '12 Fenchurch Street, London EC3M 3BY',
    'VAT Reg No. GB123456789',
    'TAX INVOICE',
    'Invoice No: BA-2026-311',
    'Invoice Date: 14 September 2026',
    'Payment due: 14 October 2026',
    'Invoice to:',
    'Adrialvallis d.o.o., Ljubljana',
    'Dashboard consulting, 4 hours   £400.00',
    'Subtotal   £400.00',
    'VAT (20%)   £80.00',
    'Total GBP   £480.00'
  ], opts);
  assert.equal(r.vendor, 'Brightline Analytics Ltd');
  assert.equal(r.vendorTaxId, 'GB123456789');
  assert.equal(r.number, 'BA-2026-311');
  assert.equal(r.issueDate, '2026-09-14');
  assert.equal(r.dueDate, '2026-10-14');
  assert.equal(r.currency, 'GBP');
  assert.equal(r.total, 480);
  assert.equal(r.vat, 80);
  assert.equal(r.net, 400);
});

test('Labels and values on separate lines', () => {
  const r = P.parseInvoice([
    'Faktura / Račun',
    'Mojster Marko s.p.',
    'Številka računa:',
    'R-77/2026',
    'Datum izdaje:',
    '05.10.2026',
    'Valuta:',
    '20.10.2026',
    'Za plačilo:',
    '250,00 EUR',
    'Ni zavezanec za DDV po 1. odstavku 94. člena ZDDV-1'
  ], opts);
  assert.equal(r.vendor, 'Mojster Marko s.p.');
  assert.equal(r.number, 'R-77/2026');
  assert.equal(r.issueDate, '2026-10-05');
  assert.equal(r.dueDate, '2026-10-20');
  assert.equal(r.total, 250);
  assert.equal(r.vat, 0);
  assert.equal(r.net, 250);
});

test('Learned rule by VAT ID overrides the name on the page', () => {
  const r = P.parseInvoice([
    'SL Hosting Solutions d.o.o.',
    'ID za DDV: SI11223344',
    'Račun št. 55/2026',
    'Datum računa: 01.10.2026',
    'Skupaj za plačilo   12,20 €',
    'DDV 22 %   2,20'
  ], { ownNames: ['adrial'], rules: { 'id:SI11223344': { vendor: 'SLH', category: 'Software & SaaS' } } });
  assert.equal(r.vendor, 'SLH');
  assert.equal(r.category, 'Software & SaaS');
  assert.equal(r.total, 12.2);
  assert.equal(r.vat, 2.2);
});

test('"Bill to" in a side column: your own VAT ID is not taken as the vendor\'s', () => {
  const r = P.parseInvoice([
    'Invoice',
    'Invoice number   NC-48213-0010',
    'Date of issue   October 1, 2026',
    'Nimbus Cloud, Inc.   Bill to',
    '548 Market St, San Francisco, CA 94104   Adrialvallis d.o.o.',
    'Ljubljana, Slovenia',
    'SI VAT SI87654321',
    'Amount due   $49.00 USD',
    'Tax to be paid on reverse charge basis.'
  ], opts);
  assert.equal(r.vendor, 'Nimbus Cloud, Inc.');
  assert.equal(r.vendorTaxId, '');
  assert.equal(r.total, 49);
});

test('vendor VAT ID that shares a line with your address in the next column is kept', () => {
  const r = P.parseInvoice([
    'Brightline Analytics Ltd   Bill to',
    '12 Fenchurch Street, London EC3M 3BY   Adrialvallis d.o.o.',
    'VAT Reg No. GB123456789   Ljubljana, Slovenia',
    'SI VAT SI87654321',
    'Invoice No: BA-2026-311',
    'Subtotal   £400.00',
    'VAT (20%)   £80.00',
    'Amount due   £480.00 GBP'
  ], opts);
  assert.equal(r.vendorTaxId, 'GB123456789');
  assert.equal(r.vat, 80);
});

test('Scanned PDF (no text) is flagged for manual entry', () => {
  const r = P.parseInvoice(['', ' '], opts);
  assert.equal(r.scanned, true);
  assert.equal(r.total, null);
});

test('number formats', () => {
  assert.equal(P.toNumber('1.234,56'), 1234.56);
  assert.equal(P.toNumber('1,234.56'), 1234.56);
  assert.equal(P.toNumber('1 234,56'), 1234.56);
  assert.equal(P.toNumber('1234,5'), 1234.5);
  assert.equal(P.toNumber('1.234'), 1234);
  assert.deepEqual(P.moneyIn('DDV 22 %   303,60').map((a) => a.value), [303.6]);
  assert.deepEqual(P.moneyIn('TRR: SI56 0201 0001 2345 678'), []);
  assert.deepEqual(P.findDates('Datum: 3. 10. 2026').map((d) => d.iso), ['2026-10-03']);
  assert.deepEqual(P.findDates('6. oktober 2026').map((d) => d.iso), ['2026-10-06']);
  assert.deepEqual(P.findDates('Oct 6, 2026').map((d) => d.iso), ['2026-10-06']);
});
