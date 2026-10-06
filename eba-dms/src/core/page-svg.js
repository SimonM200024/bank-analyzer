// Synthetic document pages rendered as A4 SVG (595 x 842 units).
// Every generated page embeds a <metadata> block describing the printed values
// and their regions; the demo OCR adapter reads that block. Pages from any
// other source carry no such block and therefore produce no extraction.

import { fmtAmount, fmtDateCompact, escapeHtml as esc } from './format.js';

const W = 595, H = 842;

function t(x, y, s, o = {}) {
  const size = o.size || 9, weight = o.bold ? 'bold' : 'normal', anchor = o.anchor || 'start';
  const fill = o.fill || '#111';
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`;
}
// Approximate text box for regions (Helvetica-ish metrics).
function box(x, y, s, size = 9, anchor = 'start', pad = 2) {
  const w = Math.max(10, String(s).length * size * 0.56);
  const x0 = anchor === 'end' ? x - w : x;
  return { x: Math.round(x0 - pad), y: Math.round(y - size - pad + 1), w: Math.round(w + pad * 2), h: Math.round(size + pad * 2 + 2) };
}

function partyBlock(x, y, title, p, out) {
  out.push(t(x, y, title, { size: 8, fill: '#555' }));
  out.push(t(x, y + 14, p.name, { size: 11, bold: true }));
  const lines = [p.address, `${p.postal || ''} ${p.city || ''}`.trim(), p.country, p.vatId ? `ID za DDV: ${p.vatId}` : '', p.email || ''].filter(Boolean);
  lines.forEach((l, i) => out.push(t(x, y + 30 + i * 13, l, { size: 9.5 })));
}

function logo(seed, x, y) {
  const hue = (seed * 47) % 360;
  return `<g transform="translate(${x},${y})"><circle cx="18" cy="18" r="18" fill="hsl(${hue},55%,45%)"/>` +
    `<rect x="9" y="9" width="18" height="18" rx="3" fill="#fff" opacity=".85"/><circle cx="18" cy="18" r="5" fill="hsl(${hue},55%,45%)"/></g>`;
}

// Invoice / pro forma page. Returns { svg, regions, values }.
export function renderInvoicePage(spec) {
  const out = [];
  const regions = {};
  const values = {};
  const cur = spec.currency || 'EUR';
  const title = spec.kind === 'predracun' ? 'Predračun' : spec.credit ? 'Dobropis' : 'Račun';

  out.push(logo(spec.seed || 1, 500, 46));
  out.push(t(50, 78, title, { size: 26, bold: true }));

  const pro = spec.kind === 'predracun';
  const dates = { issue: spec.issueDate, service: spec.serviceDate, due: spec.dueDate };
  const meta = [
    ['Številka', spec.number, pro ? 'stevilka_predracuna' : 'stevilka_racuna', null],
    ['Datum izdaje', spec.issueDate ? fmtDateCompact(spec.issueDate) : '', pro ? 'datum_predracuna' : 'datum_racuna', 'issue'],
    ['Datum opr. storitve', spec.serviceDate ? fmtDateCompact(spec.serviceDate) : '', 'datum_opr_stor_izdaje_blaga', 'service'],
    ['Rok plačila', spec.dueDate ? fmtDateCompact(spec.dueDate) : '', 'datum_zapadlosti_rok_placila', 'due'],
    ['Sklic', spec.reference, 'sklic_placila', null],
  ];
  if (spec.printIssueDate === false) meta.splice(1, 1);
  meta.forEach(([label, val, key, dateKind], i) => {
    const y = 108 + i * 15;
    out.push(t(50, y, label, { size: 10, bold: true }));
    out.push(t(160, y, val, { size: 10 }));
    if (key && val) {
      regions[key] = box(160, y, val, 10);
      values[key] = dateKind ? dates[dateKind] : val;
    }
  });

  partyBlock(50, 210, 'Izdajatelj', spec.issuer, out);
  partyBlock(320, 210, 'Prejemnik', spec.recipient, out);

  // Amount headline
  const lines = spec.lines || [];
  let net = 0, vat = 0;
  for (const l of lines) {
    const base = l.qty * l.price * (1 - (l.discount || 0) / 100);
    net += base; vat += base * (l.vatRate || 0) / 100;
  }
  net = Math.round(net * 100) / 100; vat = Math.round(vat * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  const head = `${fmtAmount(total)} ${cur} zapade v plačilo ${spec.dueDate ? fmtDateCompact(spec.dueDate) : ''}`;
  out.push(t(50, 340, head, { size: 15, bold: true }));

  // Line items
  const ty = 380;
  out.push(t(50, ty, 'Opis', { size: 9.5, fill: '#333' }));
  out.push(t(360, ty, 'Kol.', { size: 9.5, anchor: 'end', fill: '#333' }));
  out.push(t(430, ty, 'Cena', { size: 9.5, anchor: 'end', fill: '#333' }));
  out.push(t(475, ty, 'DDV', { size: 9.5, anchor: 'end', fill: '#333' }));
  out.push(t(545, ty, 'Znesek', { size: 9.5, anchor: 'end', fill: '#333' }));
  out.push(`<line x1="50" y1="${ty + 6}" x2="545" y2="${ty + 6}" stroke="#111" stroke-width="1"/>`);
  lines.forEach((l, i) => {
    const y = ty + 24 + i * 18;
    const amt = l.qty * l.price * (1 - (l.discount || 0) / 100);
    out.push(t(50, y, l.desc, { size: 10 }));
    out.push(t(360, y, fmtAmount(l.qty, l.qty % 1 ? 2 : 0), { size: 10, anchor: 'end' }));
    out.push(t(430, y, fmtAmount(l.price), { size: 10, anchor: 'end' }));
    out.push(t(475, y, `${l.vatRate || 0} %`, { size: 10, anchor: 'end' }));
    out.push(t(545, y, fmtAmount(amt), { size: 10, anchor: 'end' }));
  });
  const sy = ty + 40 + lines.length * 18;
  out.push(`<line x1="330" y1="${sy}" x2="545" y2="${sy}" stroke="#111" stroke-width=".8"/>`);
  out.push(t(330, sy + 15, 'Osnova', { size: 10 })); out.push(t(545, sy + 15, fmtAmount(net), { size: 10, anchor: 'end' }));
  out.push(t(330, sy + 31, 'DDV', { size: 10 })); out.push(t(545, sy + 31, fmtAmount(vat), { size: 10, anchor: 'end' }));
  out.push(`<line x1="330" y1="${sy + 38}" x2="545" y2="${sy + 38}" stroke="#111" stroke-width="1.2"/>`);
  out.push(t(330, sy + 54, 'Za plačilo', { size: 11, bold: true }));
  const totalText = `${fmtAmount(total)} ${cur}`;
  out.push(t(545, sy + 54, totalText, { size: 11, bold: true, anchor: 'end' }));
  regions.skupni_znesek_racuna = box(545, sy + 54, totalText, 11, 'end');
  values.skupni_znesek_racuna = total;

  // Footer
  const fy = 760;
  out.push(`<line x1="50" y1="${fy - 14}" x2="545" y2="${fy - 14}" stroke="#bbb" stroke-width=".6"/>`);
  out.push(t(50, fy, `${spec.issuer.name} · ${spec.issuer.address}, ${spec.issuer.postal} ${spec.issuer.city}`, { size: 7.5, fill: '#555' }));
  if (spec.issuer.trr) out.push(t(50, fy + 12, `TRR: ${spec.issuer.trr}${spec.issuer.bic ? ' · BIC: ' + spec.issuer.bic : ''}${spec.issuer.bank ? ' · ' + spec.issuer.bank : ''}`, { size: 7.5, fill: '#555' }));
  if (spec.note) out.push(t(50, fy + 24, spec.note, { size: 7.5, fill: '#555' }));
  out.push(t(545, 812, 'Fiktivni demo dokument – brez pravne veljave', { size: 6.5, anchor: 'end', fill: '#999' }));

  const meta2 = { generator: 'eba-dms-demo', kind: spec.kind || 'racun', issuer: spec.issuer.name, values, regions, net, vat, total, currency: cur };
  const svg = wrap(out.join(''), meta2, spec.grey);
  return { svg, regions, values: { ...values, net, vat, total } };
}

export function renderContractPage(spec) {
  const out = [];
  out.push(logo(spec.seed || 3, 500, 46));
  out.push(t(297, 110, 'POGODBA', { size: 22, bold: true, anchor: 'middle' }));
  out.push(t(297, 130, `št. ${spec.number}`, { size: 11, anchor: 'middle' }));
  const regions = { stevilka_pogodbe: box(297 + 8, 130, spec.number, 11) };
  out.push(t(50, 175, 'sklenjena med', { size: 10 }));
  partyBlock(50, 200, 'Stranka 1', spec.issuer, out);
  partyBlock(320, 200, 'Stranka 2', spec.recipient, out);
  const paras = [
    `1. člen: Predmet pogodbe je ${spec.subjectText || 'izvajanje storitev po ponudbi'}.`,
    '2. člen: Pogodbeni stranki se dogovorita za rok in način izvedbe skladno s prilogo.',
    `3. člen: Vrednost pogodbe znaša ${fmtAmount(spec.value || 0)} ${spec.currency || 'EUR'} brez DDV.`,
    `4. člen: Pogodba velja od ${fmtDateCompact(spec.validFrom)} do ${fmtDateCompact(spec.validTo)}.`,
    '5. člen: Morebitne spore rešujeta stranki sporazumno.',
  ];
  paras.forEach((p, i) => out.push(t(50, 330 + i * 22, p, { size: 10 })));
  const dateText = fmtDateCompact(spec.date);
  out.push(t(50, 520, `V Ljubljani, dne ${dateText}`, { size: 10 }));
  regions.datum_pogodbe = box(50 + 88, 520, dateText, 10);
  out.push('<line x1="60" y1="640" x2="240" y2="640" stroke="#111"/><line x1="340" y1="640" x2="520" y2="640" stroke="#111"/>');
  out.push(t(150, 655, spec.issuer.name, { size: 9, anchor: 'middle' }));
  out.push(t(430, 655, spec.recipient.name, { size: 9, anchor: 'middle' }));
  out.push(t(545, 812, 'Fiktivni demo dokument – brez pravne veljave', { size: 6.5, anchor: 'end', fill: '#999' }));
  const values = { stevilka_pogodbe: spec.number, datum_pogodbe: spec.date };
  return { svg: wrap(out.join(''), { generator: 'eba-dms-demo', kind: 'pogodbe', issuer: spec.issuer.name, values, regions }, spec.grey), regions, values };
}

// Second page used for multi-page fixtures (terms / delivery note).
export function renderAttachmentPage(spec) {
  const out = [];
  out.push(t(50, 80, spec.title || 'Priloga', { size: 18, bold: true }));
  for (let i = 0; i < 26; i++) {
    const wdt = 300 + ((i * 97 + (spec.seed || 0) * 13) % 190);
    out.push(`<rect x="50" y="${110 + i * 22}" width="${wdt}" height="7" fill="#ccc"/>`);
  }
  out.push(t(545, 812, 'Fiktivni demo dokument', { size: 6.5, anchor: 'end', fill: '#999' }));
  return { svg: wrap(out.join(''), { generator: 'eba-dms-demo', kind: 'attachment', values: {}, regions: {} }, spec.grey), regions: {}, values: {} };
}

function wrap(body, meta, grey) {
  const filter = grey ? ' filter="url(#g)"' : '';
  const defs = grey ? '<defs><filter id="g"><feColorMatrix type="saturate" values="0"/></filter></defs>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif">` +
    `<metadata id="eba-demo">${esc(JSON.stringify(meta))}</metadata>${defs}` +
    `<rect width="${W}" height="${H}" fill="#fff"/><g${filter}>${body}</g></svg>`;
}

// Demo OCR: reads the embedded metadata of generated pages only.
export function readDemoMetadata(svgText) {
  const m = /<metadata id="eba-demo">([\s\S]*?)<\/metadata>/.exec(svgText || '');
  if (!m) return null;
  const json = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try { return JSON.parse(json); } catch { return null; }
}

export const PAGE_SIZE = { w: W, h: H };
