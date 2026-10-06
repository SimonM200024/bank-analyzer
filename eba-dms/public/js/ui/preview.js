// Modern theme: preview panel beside the document list. Shows the selected
// document's summary, first page, key facts and recent events, with the most
// common actions, so a document can be checked and approved without opening it.
import { api, esc, blobUrl } from './core.js';
import { icon, isModern } from './icons.js';
import { can, act } from '../actions.js';
import { fmtDate, fmtDateTime, fmtAmount } from '/core/format.js';

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const statusPill = (label) => (label ? `<span class="pill st-${slug(label)}">${esc(label)}</span>` : '');

export function mountPreview(app, host, { office = true } = {}) {
  const el = document.createElement('aside');
  el.className = 'preview';
  el.setAttribute('aria-label', 'Predogled dokumenta');
  host.appendChild(el);
  let seq = 0, timer = null, rows = [];

  const visible = () => isModern() && getComputedStyle(el).display !== 'none';

  function empty() {
    el.innerHTML = `<div class="pv-empty">${icon('docs', 36)}<div>Izberite dokument za predogled.</div><div class="demo-note">Dvoklik ali Enter odpre dokument.</div></div>`;
  }

  function actions(sel) {
    const b = [];
    if (sel.length === 1) b.push(`<button class="btn primary" data-p="open">Odpri</button>`);
    if (office && can.claim(app, sel)) b.push('<button class="btn" data-p="claim">Prevzemi</button>');
    if (office && can.initial(app, sel)) b.push('<button class="btn accent" data-p="initial">Parafiraj</button>');
    if (office && can.forward(app, sel)) b.push('<button class="btn" data-p="forward">Posreduj</button>');
    b.push(sel.some((r) => r.note === 'yellow')
      ? `<button class="btn icon on" data-p="unnote" data-tip="Odstrani zaznamek" aria-label="Odstrani zaznamek">${icon('star')}</button>`
      : `<button class="btn icon" data-p="note" data-tip="Dodaj zaznamek" aria-label="Dodaj zaznamek">${icon('starOutline')}</button>`);
    return `<div class="pv-actions">${b.join('')}</div>`;
  }

  function many(sel) {
    const total = sel.reduce((s, r) => s + (Number(r.fields?.skupni_znesek_racuna) || 0), 0);
    const by = new Map();
    for (const r of sel) { const k = r.externalStatusLabel || r.categoryLabel; by.set(k, (by.get(k) || 0) + 1); }
    el.innerHTML = `<div class="pv-scroll">
      <div><div class="pv-eyebrow">Izbor</div><h3>${sel.length} izbranih dokumentov</h3></div>
      ${total ? `<div><div class="pv-h">Skupni znesek</div><div class="pv-amount">${fmtAmount(total)}<small>EUR</small></div></div>` : ''}
      <div><div class="pv-h">Po statusu</div><dl>${[...by].map(([k, n]) => `<dt>${statusPill(k) || esc(k)}</dt><dd>${n}</dd>`).join('')}</dl></div>
      <div class="demo-note">Akcije spodaj veljajo za vse izbrane dokumente.</div></div>${actions(sel)}`;
  }

  function one(r, d) {
    const f = r.fields || {};
    const amount = f.skupni_znesek_racuna;
    const page = d?.pages?.find((p) => p.mime?.startsWith('image/'));
    const facts = [
      ['Pošiljatelj', r.direction === 'out' ? r.recipient : r.sender],
      ['Št. računa', f.stevilka_racuna || f.stevilka_predracuna || f.stevilka_pogodbe],
      ['Datum računa', f.datum_racuna && fmtDate(f.datum_racuna)],
      ['Zapadlost', f.datum_zapadlosti_rok_placila && fmtDate(f.datum_zapadlosti_rok_placila)],
      ['Prejeto', r.receivedAt && fmtDateTime(r.receivedAt)],
      ['Pri', r.holderName],
      ['V pisarni', r.timeInOffice],
      ['Podpis', r.signatureState],
      ['Klasifikacija', r.classification],
      ['Oznake', r.tags?.length ? r.tags.join(', ') : ''],
    ].filter(([, v]) => v);
    const events = (d?.events || []).slice(0, 4);
    el.innerHTML = `<div class="pv-scroll">
      <div><div class="pv-eyebrow"><span>${esc(r.categoryLabel)}</span><span>·</span><span>${esc(r.companyName || '')}</span>${statusPill(r.externalStatusLabel)}</div>
        <h3>${esc(r.subject)}</h3></div>
      ${amount != null && amount !== '' ? `<div class="pv-amount">${fmtAmount(amount)}<small>${esc(f.valuta || 'EUR')}</small></div>` : ''}
      ${page ? `<div class="pv-thumb" data-p="open" title="Odpri dokument"><img src="${blobUrl(page.blobId)}" alt="Prva stran dokumenta"></div>` : d ? '<div class="demo-note">Dokument nima slike.</div>' : '<div class="pv-thumb"></div>'}
      <dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${events.length ? `<div><div class="pv-h">Zadnji dogodki</div><div class="pv-tl">${events.map((e) => `<div>${esc(e.action)}${e.rule ? ` <span>${esc(e.rule)}</span>` : ''}<span>${esc(e.userLabel || '')} · ${fmtDateTime(e.at)}</span></div>`).join('')}</div></div>` : ''}
    </div>${actions([r])}`;
  }

  async function update(sel) {
    rows = sel;
    clearTimeout(timer);
    if (!visible()) return;
    const my = ++seq;
    if (!sel.length) return empty();
    if (sel.length > 1) return many(sel);
    one(sel[0], null);
    timer = setTimeout(async () => {
      try {
        const d = await api('getDocument', { id: sel[0].id });
        if (my === seq) one(sel[0], d);
      } catch { /* row may have gone; list refresh handles it */ }
    }, 120);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b || !rows.length) return;
    const p = b.dataset.p;
    if (p === 'open') app.openDocument(rows[0]);
    else if (p === 'claim') act.claim(app, rows);
    else if (p === 'initial') act.initial(app, rows);
    else if (p === 'forward') act.forward(app, rows);
    else if (p === 'note') act.addNote(app, rows);
    else if (p === 'unnote') act.removeNote(app, rows, 'yellow');
  });

  empty();
  return { el, update };
}
