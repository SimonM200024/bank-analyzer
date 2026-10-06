// Metadata schemas, field inventories and column definitions.
// Labels are preserved exactly as observed in the installed client, including
// unusual spellings ("izdajatelejeve", "Davčn", "refernčnega", "Panteon").
import { BRAND } from './brand.js';

export function slug(label) {
  return String(label)
    .replace(/[šŠ]/g, 's').replace(/[čćČĆ]/g, 'c').replace(/[žŽ]/g, 'z').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export const CATEGORIES = [
  { id: 'pogodbe', label: 'Pogodbe' },
  { id: 'predracun', label: 'Predračun' },
  { id: 'racun', label: 'Račun' },
];
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const DIRECTIONS = [
  { id: 'in', label: 'Vhodni', folder: 'VHODNI' },
  { id: 'out', label: 'Izhodni', folder: 'IZHODNI' },
  { id: 'internal', label: 'Interni', folder: 'INTERNI' },
];
export const directionLabel = (id) => DIRECTIONS.find((d) => d.id === id)?.label ?? '';

// External status codes. "0 - Prejet" and "1 - Potrjen" are observed; the other
// numeric prefixes are a demo assumption (only their labels were observed).
export const EXTERNAL_STATUSES = [
  { code: 0, label: 'Prejet' },
  { code: 1, label: 'Potrjen' },
  { code: 2, label: 'Potrjen vodja oddelka' },
  { code: 3, label: 'Kontroliran' },
  { code: 4, label: 'Prenešen v Pantheon' },
];
export const extStatusText = (code) => {
  const s = EXTERNAL_STATUSES.find((x) => x.code === code);
  return s ? `${s.code} - ${s.label}` : '';
};
export const extStatusLabel = (code) => EXTERNAL_STATUSES.find((x) => x.code === code)?.label ?? '';

// Folder tree as configured in the observed installation. Invoice subfolders are
// rendered bold-italic; in the replica they are saved views over the external status.
export const FOLDERS = [
  {
    id: 'in', label: 'VHODNI', direction: 'in', children: [
      { id: 'in/pogodbe', label: 'Pogodbe', direction: 'in', category: 'pogodbe' },
      { id: 'in/predracun', label: 'Predračun', direction: 'in', category: 'predracun' },
      {
        id: 'in/racun', label: 'Račun', direction: 'in', category: 'racun', children: [
          { id: 'in/racun/checked', label: 'Checked', direction: 'in', category: 'racun', view: true, extStatus: [3] },
          { id: 'in/racun/pantheon', label: 'Pantheon', direction: 'in', category: 'racun', view: true, extStatus: [4] },
          { id: 'in/racun/other', label: 'Other', direction: 'in', category: 'racun', view: true, extStatus: [1, 2] },
          { id: 'in/racun/prejeto', label: 'Prejeto', direction: 'in', category: 'racun', view: true, extStatus: [0] },
        ],
      },
    ],
  },
  {
    id: 'out', label: 'IZHODNI', direction: 'out', children: [
      { id: 'out/racun', label: 'Račun', direction: 'out', category: 'racun' },
    ],
  },
];
export function findFolder(id, list = FOLDERS) {
  for (const f of list) {
    if (f.id === id) return f;
    if (f.children) { const r = findFolder(id, f.children); if (r) return r; }
  }
  return null;
}

export const SCOPES = [
  { id: 'office', label: 'Pisarna' },
  { id: 'live', label: 'Vsi živi dokumenti z dostopom' },
  { id: 'notes', label: 'Prikaži moje zaznamke' },
  { id: 'dispatch', label: 'Odprema' },
];

export const SOURCES = ['', BRAND.exchange, 'Moj-eRačun Plugin', 'AS2 Exchange', 'IMAP Email Exchange', 'Microsoft Exchange', 'Uvoz'];

export const SIGNATURE_STATES = ['Ni podpisan', 'Neveljaven podpis', 'Veljaven podpis', 'Veljaven podpis z nekvalificiranim certifikatom'];

export const EVENT_ACTIONS = [
  'Deljeno', 'Dodeljen dostop', 'Dostop preko API', 'Izvedeno pravilo', 'Izvožen', 'Izvzet dokument',
  'Izvzet iz zadeve', 'Klasificiran', 'Komentar dodan', 'Komentar odstranjen', 'Komentar spremenjen',
  'Natisnjen', 'Nov', 'Objavljen', 'Odprt', 'Odstranjen paraf', 'Odstranjen podpis', 'Parafiran',
  'Podpisan', 'Poslan', 'Poslan v hrambo', 'Posredovan', 'Posredovan paket', 'Potrjen',
  'Povezan dokument', 'Prejem paketa', 'Prejet', 'Preklasificiran', 'Preklic objave',
];
// Additional event labels observed in the trail, plus replica-only labels (marked).
export const EXTRA_EVENT_ACTIONS = [
  'Sprememba na spremnem listu', 'Spremenjen zunanji status', 'Parafiran (Potrdi)',
  // Replica assumptions (no captured label exists for these outcomes):
  'Prevzet', 'Zavrnjen', 'Vzet iz hrambe', 'Izbrisan', 'Nova verzija',
];

export const INVOICE_FUNCTION = ['Preklic', 'Kopija', 'Original'];
export const INVOICE_TYPE = [
  'Račun za predplačilo', 'Dobropis za provizijo oz. nadomestilo', 'Provizija oz. nadomestilo', 'Konsolidiran račun',
  'Revidiran račun', 'Dobropis', 'Bremepis', 'Zbirni podjetniški račun', 'Neplačana terjatev', 'Finančni dobropis',
  'Finančni bremepis', 'Račun', 'Račun za lizing', 'Račun za merjene storitve', 'Predračun', 'Zahtevek za plačilo',
  'Davčni račun', 'Specifikacija za račun',
];

// Operator profiles exposed by the Search tree.
export const OPS = {
  starts: 'se začne z', contains: 'vsebuje', eq: 'je enak', ne: 'ni enak', lt: 'manj', le: 'manj ali enako',
  gt: 'več', ge: 'več ali enako', empty: 'je prazen', notEmpty: 'ni prazen', in: 'v', notIn: 'ni v',
};
export const PROFILES = {
  T: ['starts', 'contains'],
  C: ['eq', 'lt'],
  S: ['in', 'notIn'],
  K: ['eq', 'starts'],
  X: ['starts', 'contains', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'empty', 'notEmpty'],
};

// ---------------------------------------------------------------------------
// Indexed content fields (122) in the exact order of the captured Search tree.
// [label, control, profile]; control: i = editable input, p = input + ellipsis
// picker, d = categorical dropdown.
const CONTENT_RAW = [
  ['BIC koda dobaviteljeve banke', 'i', 'T'], ['BIC koda izdajatelejeve banke', 'i', 'T'],
  ['Datum bremepisa', 'p', 'C'], ['Datum dobavnice', 'p', 'C'], ['Datum dobropisa', 'p', 'C'],
  ['Datum naročila (dobaviteljeva)', 'i', 'T'], ['Datum naročila (kupčeva)', 'p', 'C'],
  ['Datum opr. stor./ izdaje blaga', 'p', 'C'], ['Datum pogodbe', 'p', 'C'], ['Datum predračuna', 'p', 'C'],
  ['Datum prevzemnice', 'p', 'C'], ['Datum računa', 'p', 'C'], ['Datum refernčnega računa', 'p', 'C'],
  ['Datum transporta', 'p', 'C'], ['Datum zapadlosti, rok plačila', 'p', 'C'],
  ['Davčn št. prejemnika dokumenta', 'i', 'T'],
  ['Davčna klavzula 1', 'i', 'T'], ['Davčna klavzula 2', 'i', 'T'], ['Davčna klavzula 3', 'i', 'T'], ['Davčna klavzula 4', 'i', 'T'],
  ['Davčna št. dobavitelja', 'i', 'T'], ['Davčna št. izdajatelja', 'i', 'T'], ['Davčna št. kupca', 'i', 'T'], ['Davčna št. prejemnika blaga', 'i', 'T'],
  ['DDV (dodatna stopnja 1) osnova', 'i', 'C'], ['DDV (dodatna stopnja 1) stopnja', 'i', 'C'], ['DDV (dodatna stopnja 1) znesek', 'i', 'C'],
  ['DDV (osnovna stopnja) osnova', 'i', 'C'], ['DDV (osnovna stopnja) stopnja', 'i', 'C'], ['DDV (osnovna stopnja) znesek', 'i', 'C'],
  ['DDV (znižana stopnja) osnova', 'i', 'C'], ['DDV (znižana stopnja) stopnja', 'i', 'C'], ['DDV (znižana stopnja) znesek', 'i', 'C'],
  ['DDV neobdavčena osnova', 'i', 'C'], ['DDV neobdavčena stopnja', 'i', 'C'],
  ['Dobaviteljev TRR', 'i', 'T'], ['Država kupca', 'i', 'T'], ['Država prejemnika blaga', 'i', 'T'],
  ['DUNS št. dobavitelja', 'i', 'T'], ['DUNS št. izdajatelja', 'i', 'T'], ['DUNS št. kupca', 'i', 'T'],
  ['DUNS št. prejemnika blaga', 'i', 'T'], ['DUNS št. prejemnika dokumenta', 'i', 'T'],
  ['EAN GLN št. dobavitelja', 'i', 'T'], ['EAN GLN št. izdajatelja', 'i', 'T'], ['EAN GLN št. kupca', 'i', 'T'],
  ['EAN GLN št. prejemnika blaga', 'i', 'T'], ['EAN GLN št. prejemnika dokumenta', 'i', 'T'],
  ['Funkcija računa (Šifra)', 'd', 'S'],
  ['Id za DDV dobavitelja', 'i', 'T'], ['Id za DDV izdajatelja', 'i', 'T'], ['Id za DDV kupca', 'i', 'T'],
  ['Id za DDV prejemnika blaga', 'i', 'T'], ['Id za DDV prejemnika dokumenta', 'i', 'T'],
  ['Izdajateljev TRR', 'i', 'T'], ['Koda države dobavitelja', 'i', 'T'], ['Koda države izdajatelja', 'i', 'T'],
  ['Koda namena plačila', 'i', 'T'], ['Končni znesek', 'i', 'C'],
  ['Kraj dobavitelja', 'i', 'T'], ['Kraj izdajatelja', 'i', 'T'], ['Kraj izdaje računa', 'i', 'T'], ['Kraj kupca', 'i', 'T'],
  ['Kraj prejemnika blaga', 'i', 'T'], ['Kupčev TRR', 'i', 'T'],
  ['Matična št. dobavitelja', 'i', 'T'], ['Matična št. izdajatelja', 'i', 'T'], ['Matična št. kupca', 'i', 'T'],
  ['Matična št. prejemnika blaga', 'i', 'T'], ['Matična št. prejemnika dokumenta', 'i', 'T'],
  ['Način plačila', 'i', 'T'],
  ['Naslov dobavitelja', 'i', 'T'], ['Naslov izdajatelja', 'i', 'T'], ['Naslov kupca', 'i', 'T'], ['Naslov prejemnika blaga', 'i', 'T'],
  ['Naziv dobavitelja', 'i', 'T'], ['Naziv dobaviteljeve banke', 'i', 'T'], ['Naziv države dobavitelja', 'i', 'T'],
  ['Naziv države izdajatelja', 'i', 'T'], ['Naziv izdajatelja', 'i', 'T'], ['Naziv izdajateljeve banke', 'i', 'T'],
  ['Naziv kupca', 'i', 'T'], ['Naziv prejemnika blaga', 'i', 'T'], ['Naziv prejemnika dokumenta', 'i', 'T'],
  ['Posebno besedilo 1', 'i', 'T'], ['Posebno besedilo 2', 'i', 'T'], ['Posebno besedilo 3', 'i', 'T'], ['Posebno besedilo 4', 'i', 'T'],
  ['Poštna številka dobavitelja', 'i', 'T'], ['Poštna številka izdajatelja', 'i', 'T'], ['Poštna številka kupca', 'i', 'T'],
  ['Poštna številka prejemnika blaga', 'i', 'T'],
  ['Sklic plačila', 'i', 'T'],
  ['Skupni neto znesek računa', 'i', 'C'], ['Skupni znesek DDV', 'i', 'C'], ['Skupni znesek popusta', 'i', 'C'],
  ['Skupni znesek postavk', 'i', 'C'], ['Skupni znesek računa', 'i', 'C'],
  ['Splošno besedilo 1', 'i', 'T'], ['Splošno besedilo 2', 'i', 'T'], ['Splošno besedilo 3', 'i', 'T'], ['Splošno besedilo 4', 'i', 'T'],
  ['Stroškovno mesto', 'i', 'T'], ['Šifra države kupca', 'i', 'T'], ['Šifra države prejemnika blaga', 'i', 'T'],
  ['Šifra prejemnika dokumenta', 'i', 'T'],
  ['Številka bremepisa', 'i', 'T'], ['Številka dobavnice', 'i', 'T'], ['Številka dobropisa', 'i', 'T'],
  ['Številka naročila (dobaviteljeva)', 'p', 'C'], ['Številka naročila (kupčeva)', 'i', 'T'], ['Številka pogodbe', 'i', 'T'],
  ['Številka predračuna', 'i', 'T'], ['Številka prevzemnice', 'i', 'T'], ['Številka računa', 'i', 'X'],
  ['Številka refernčnega računa', 'i', 'T'], ['Številka transporta', 'i', 'T'],
  ['Tip računa (Šifra)', 'd', 'S'], ['TRR prejemnika blaga', 'i', 'T'], ['TRR prejemnika dokumenta', 'i', 'T'],
  ['Valuta računa', 'i', 'T'], ['Znesek predplačila', 'i', 'C'],
];

function contentType(label, profile) {
  // Preserve the two unusual combinations as observed (see README):
  if (label === 'Datum naročila (dobaviteljeva)') return 'text';
  if (label === 'Številka naročila (dobaviteljeva)') return 'text';
  if (/^Datum /.test(label)) return 'date';
  if (profile === 'C') return 'amount';
  if (profile === 'S') return 'enum';
  return 'text';
}

export const CONTENT_FIELDS = CONTENT_RAW.map(([label, control, profile]) => ({
  key: slug(label), label, control, profile, type: contentType(label, profile), group: 'content',
  options: label === 'Funkcija računa (Šifra)' ? INVOICE_FUNCTION : label === 'Tip računa (Šifra)' ? INVOICE_TYPE : undefined,
}));

// ---------------------------------------------------------------------------
// General search criteria (22) in captured order. `prop` names the document
// property evaluated by the replica's query engine.
export const GENERAL_CRITERIA = [
  { key: 'g_predmet', label: 'Predmet', control: 'i', profile: 'T', type: 'text', prop: 'subject' },
  { key: 'g_prejemnik', label: 'Prejemnik', control: 'p', profile: null, type: 'text', prop: 'recipient' },
  { key: 'g_posiljatelj', label: 'Pošiljatelj', control: 'p', profile: null, type: 'text', prop: 'sender' },
  { key: 'g_datum_posiljanja', label: 'Datum pošiljanja', control: 'p', profile: 'C', type: 'date', prop: 'sentAt' },
  { key: 'g_datum_prejetja', label: 'Datum prejetja', control: 'p', profile: 'C', type: 'date', prop: 'receivedAt' },
  { key: 'g_datum_nastanka', label: 'Datum nastanka', control: 'p', profile: 'C', type: 'date', prop: 'createdAt' },
  { key: 'g_datum_zadnje_spremembe', label: 'Datum zadnje spremembe', control: 'p', profile: 'C', type: 'date', prop: 'modifiedAt' },
  { key: 'g_zunanji_id', label: 'Zunanji id', control: 'i', profile: 'T', type: 'text', prop: 'externalId' },
  { key: 'g_zunanji_id_2', label: 'Zunanji id 2', control: 'i', profile: 'T', type: 'text', prop: 'externalId2' },
  { key: 'g_datum_izteka', label: 'Datum izteka podp. cert.', control: 'p', profile: 'C', type: 'date', prop: 'certExpiry' },
  { key: 'g_rok_hranjenja', label: 'Rok hranjenja', control: 'p', profile: 'C', type: 'date', prop: 'retentionUntil' },
  { key: 'g_osebni', label: 'Vsebuje osebne podatke', control: 'yn', profile: null, type: 'bool', prop: 'personalData' },
  { key: 'g_arhivsko', label: 'Arhivsko gradivo', control: 'yn', profile: null, type: 'bool', prop: 'archival' },
  { key: 'g_podpis', label: 'Podpis', control: 'd', profile: 'S', type: 'enum', prop: 'signatureState', options: SIGNATURE_STATES },
  { key: 'g_pri', label: 'Dokument pri/v', control: 'pd', profile: null, type: 'holder', prop: 'location' },
  { key: 'g_dostop', label: 'Dostop', control: 'pd', profile: null, type: 'holder', prop: 'access' },
  { key: 'g_klas_vozlisce', label: 'Klasifikacijsko vozlišče', control: 'pk', profile: 'K', type: 'text', prop: 'classNode' },
  { key: 'g_klasifikacija', label: 'Klasifikacija', control: 'd', profile: 'S', type: 'enum', prop: 'classification' },
  { key: 'g_oznake', label: 'Oznake', control: 'd', profile: 'S', type: 'enum', prop: 'tags' },
  { key: 'g_akcija', label: 'Akcija na dokumentu', control: 'd', profile: 'S', type: 'enum', prop: 'actions', options: EVENT_ACTIONS },
  { key: 'g_datum_akcije', label: 'Datum akcije', control: 'p', profile: 'C', type: 'date', prop: 'actionDate', dependsOn: 'g_akcija' },
  { key: 'g_nosilec_akcije', label: 'Nosilec akcije', control: 'd', profile: 'S', type: 'enum', prop: 'actionHolder', dependsOn: 'g_akcija' },
];
export const ALL_CRITERIA = [...GENERAL_CRITERIA.map((f) => ({ ...f, group: 'general' })), ...CONTENT_FIELDS];
export const criterionByKey = Object.fromEntries(ALL_CRITERIA.map((f) => [f.key, f]));

// ---------------------------------------------------------------------------
// Cover sheet ("Spremni list") templates. The Račun template follows the captured
// layout; Predračun and Pogodbe templates are replica assumptions.
export const DEPARTMENTS = ['1 - Uprava', '2 - Finance', '3 - Prodaja', '4 - Logistika', '5 - Razvoj'];
export const PROCUREMENT = ['Rezident', 'Nerezident', 'EU'];
export const COST_CARRIERS = ['Splošno', 'Projekt Sever', 'Projekt Jug', 'Marketing', 'Vozni park'];
export const PAYMENT_METHODS = ['Transakcijski račun', 'Plačilna kartica', 'Gotovina', 'Direktna obremenitev'];
export const DOC_TYPES = [
  '1000 - nakup blaga in materiala', '1200 - stroškovni računi', '1K00 - str. računi kartice',
  '1T00 - stroškovni računi tujina', '1900 - prevzem blaga', '1910 - prevzem blaga EU',
];
export const COVER_STATUSES = ['Prejet', 'Kontroliran', 'Potrjen vodja oddelka', 'Potrjen', 'Zavrnjen'];

const TAX_TABLE = {
  key: 'taxes', caption: 'Davki', columns: [
    { key: 'naziv', label: 'Naziv davka', type: 'text' }, { key: 'osnova', label: 'Osnova za DDV', type: 'amount' },
    { key: 'stopnja', label: 'Stopnja', type: 'amount' }, { key: 'znesek', label: 'Znesek DDV', type: 'amount' },
  ],
};
// Truncated headers are kept as displayed; no expansions are invented.
const LINES_TABLE = {
  key: 'lines', caption: 'Postavke', columns: [
    { key: 'ident', label: 'Ident', type: 'text' }, { key: 'cena', label: 'Cena', type: 'amount' },
    { key: 'kolic', label: 'Količ...', type: 'amount' }, { key: 'rabat', label: 'Rabat', type: 'amount' },
    { key: 'ddv_pct', label: 'DDV %', type: 'text' }, { key: 'ddv_s', label: 'DDV Š.', type: 'text' },
    { key: 'ddv', label: 'DDV', type: 'text' }, { key: 'znes', label: 'Znes...', type: 'text' },
    { key: 'konto', label: 'Konto', type: 'text' }, { key: 'odd', label: 'Odd...', type: 'text' },
    { key: 'sn', label: 'SN', type: 'text' }, { key: 'dob', label: 'Dob...', type: 'text' }, { key: 'opo', label: 'Opo...', type: 'text' },
  ],
};
const POSTINGS_TABLE = {
  key: 'postings', caption: 'Knjižbe', columns: [
    { key: 'temeljnica', label: 'Št. temeljnice', type: 'text' }, { key: 'konto', label: 'Konto', type: 'text' },
    { key: 'debit', label: 'Debit', type: 'amount' }, { key: 'kredit', label: 'Kredit', type: 'amount' },
  ],
};
const PROFORMA_TABLE = {
  key: 'proformas', caption: 'Tabela povezanih predracunov', columns: [
    { key: 'stevilka', label: 'Številka predračuna', type: 'text' }, { key: 'znesek', label: 'Znesek predračuna', type: 'amount' },
    { key: 'datum', label: 'Datum predračuna', type: 'date' }, { key: 'placano', label: 'Plačano', type: 'bool' },
  ],
};

// Items: {f: field} | {sep: label} | {table} | {gap}
export const COVER_TEMPLATES = {
  racun: [
    { f: { key: 'stev_racuna_panteon', label: 'Štev. računa (Panteon)', type: 'text' } },
    { f: { key: 'datum_prejema', label: 'Datum prejema', type: 'date' } },
    { sep: '' },
    { f: { key: 'vrsta_dokumenta', label: 'Vrsta dokumenta', type: 'enum', options: DOC_TYPES } },
    { f: { key: 'status', label: 'Status', type: 'enum', options: COVER_STATUSES } },
    { f: { key: 'nacin_placila', label: 'Način plačila', type: 'enum', options: PAYMENT_METHODS } },
    { f: { key: 'izdajatelj', label: 'Izdajatelj', type: 'partner' } },
    { f: { key: 'prejemnik', label: 'Prejemnik', type: 'partner' } },
    { f: { key: 'oddelek', label: 'Oddelek', type: 'enum', options: DEPARTMENTS } },
    { f: { key: 'nacin_nabave', label: 'Način nabave', type: 'enum', options: PROCUREMENT } },
    { f: { key: 'stroskovni_nosilec', label: 'Stroškovni nosilec', type: 'enum', options: COST_CARRIERS } },
    { f: { key: 'konto_obv', label: 'Konto obv.', type: 'text' } },
    { f: { key: 'datum_zapadlosti', label: 'Datum zapadlosti', type: 'date' } },
    { f: { key: 'datum_opravljene_storitve', label: 'Datum opravljene storitve', type: 'date' } },
    { f: { key: 'datum_racuna', label: 'Datum računa', type: 'date' } },
    { f: { key: 'skupni_znesek_racuna', label: 'Skupni znesek računa', type: 'amount' } },
    { f: { key: 'dobropis', label: 'Dobropis', type: 'bool' } },
    { f: { key: 'acdoc2', label: 'acDoc2', type: 'text' } },
    { f: { key: 'addatedoc2', label: 'adDateDoc2', type: 'date' } },
    { f: { key: 'kreiraj_placilni_nalog', label: 'Kreiraj plačilni nalog', type: 'bool' } },
    { f: { key: 'placano', label: 'PLAČANO', type: 'bool', accent: true } },
    { sep: 'Davki' },
    { table: TAX_TABLE },
    { sep: 'Postavke dokumenta' },
    { table: LINES_TABLE },
    { f: { key: 'saldo', label: 'Saldo', type: 'amount', computed: true } },
    { sep: 'Ostalo' },
    { f: { key: 'stevilka_racuna', label: 'Številka računa', type: 'text' } },
    { f: { key: 'sklic_placila', label: 'Sklic', type: 'text' } },
    { f: { key: 'opomba', label: 'Opomba', type: 'multiline' } },
    { sep: 'Knjižbe' },
    { f: { key: 'stevilka_temeljnice', label: 'Številka temeljnice', type: 'text' } },
    { table: POSTINGS_TABLE },
    { table: PROFORMA_TABLE },
    { f: { key: 'valuta', label: 'Valuta', type: 'text' } },
  ],
  predracun: [
    { f: { key: 'stevilka_predracuna', label: 'Številka predračuna', type: 'text' } },
    { f: { key: 'datum_predracuna', label: 'Datum predračuna', type: 'date' } },
    { sep: '' },
    { f: { key: 'izdajatelj', label: 'Izdajatelj', type: 'partner' } },
    { f: { key: 'prejemnik', label: 'Prejemnik', type: 'partner' } },
    { f: { key: 'oddelek', label: 'Oddelek', type: 'enum', options: DEPARTMENTS } },
    { f: { key: 'datum_zapadlosti', label: 'Datum zapadlosti', type: 'date' } },
    { f: { key: 'skupni_znesek_racuna', label: 'Znesek predračuna', type: 'amount' } },
    { f: { key: 'placano', label: 'PLAČANO', type: 'bool', accent: true } },
    { sep: 'Ostalo' },
    { f: { key: 'sklic_placila', label: 'Sklic', type: 'text' } },
    { f: { key: 'opomba', label: 'Opomba', type: 'multiline' } },
    { f: { key: 'valuta', label: 'Valuta', type: 'text' } },
  ],
  pogodbe: [
    { f: { key: 'stevilka_pogodbe', label: 'Številka pogodbe', type: 'text' } },
    { f: { key: 'datum_pogodbe', label: 'Datum pogodbe', type: 'date' } },
    { sep: '' },
    { f: { key: 'izdajatelj', label: 'Pogodbena stranka', type: 'partner' } },
    { f: { key: 'oddelek', label: 'Oddelek', type: 'enum', options: DEPARTMENTS } },
    { f: { key: 'veljavnost_od', label: 'Veljavnost od', type: 'date' } },
    { f: { key: 'veljavnost_do', label: 'Veljavnost do', type: 'date' } },
    { f: { key: 'vrednost_pogodbe', label: 'Vrednost pogodbe', type: 'amount' } },
    { sep: 'Ostalo' },
    { f: { key: 'opomba', label: 'Opomba', type: 'multiline' } },
    { f: { key: 'valuta', label: 'Valuta', type: 'text' } },
  ],
};
export function coverFields(category) {
  return (COVER_TEMPLATES[category] || []).filter((x) => x.f).map((x) => x.f);
}
export function coverTables(category) {
  return (COVER_TEMPLATES[category] || []).filter((x) => x.table).map((x) => x.table);
}

// Fields shown in the "Podatki" (extracted data) view: extracted invoice fields,
// then a "Spremni list" group of cover-sheet values.
export const EXTRACTION_FIELDS = {
  racun: {
    main: [
      ['datum_opr_stor_izdaje_blaga', 'Datum opr. stor./ izdaje blaga', 'date'],
      ['datum_racuna', 'Datum računa', 'date'],
      ['datum_zapadlosti_rok_placila', 'Datum zapadlosti, rok plačila', 'date'],
      ['sklic_placila', 'Sklic plačila', 'text'],
      ['skupni_znesek_racuna', 'Skupni znesek računa', 'amount'],
      ['stevilka_racuna', 'Številka računa', 'text'],
    ],
    cover: [['vrsta_dokumenta', 'Vrsta dokumenta', 'text'], ['valuta', 'Valuta', 'text']],
  },
  predracun: {
    main: [['stevilka_predracuna', 'Številka predračuna', 'text'], ['datum_predracuna', 'Datum predračuna', 'date'], ['skupni_znesek_racuna', 'Znesek predračuna', 'amount']],
    cover: [['valuta', 'Valuta', 'text']],
  },
  pogodbe: {
    main: [['stevilka_pogodbe', 'Številka pogodbe', 'text'], ['datum_pogodbe', 'Datum pogodbe', 'date']],
    cover: [],
  },
};

// ---------------------------------------------------------------------------
// Grid columns. `get(row)` reads the row summary returned by the API.
// Types: text | date | datetime | amount | sig | note | attach | bool | status
const F = (key) => (r) => r.fields?.[key];
export const GENERAL_COLUMNS = [
  { id: 'arhivsko', label: 'Arhivsko gradivo', type: 'bool', get: (r) => r.archival, w: 90 },
  { id: 'avtor', label: 'Avtor', type: 'text', get: (r) => r.author, w: 120 },
  { id: 'cas_v_pisarni', label: 'Čas v pisarni', type: 'text', get: (r) => r.timeInOffice, w: 140 },
  { id: 'crtna_koda', label: 'Črtna koda', type: 'text', get: (r) => r.barcode, w: 110 },
  { id: 'dal_v_hrambo', label: 'Dal v hrambo', type: 'text', get: (r) => r.archivedBy, w: 110 },
  { id: 'datum_izteka', label: 'Datum izteka podp. cert.', type: 'date', get: (r) => r.certExpiry, w: 110 },
  { id: 'datum_nastanka', label: 'Datum nastanka', type: 'datetime', get: (r) => r.createdAt, w: 108 },
  { id: 'datum_posiljanja', label: 'Datum pošiljanja', type: 'datetime', get: (r) => r.sentAt, w: 108 },
  { id: 'datum_prejetja', label: 'Datum prejetja', type: 'datetime', get: (r) => r.receivedAt, w: 140 },
  { id: 'datum_v_pisarni', label: 'Datum v pisarni', type: 'datetime', get: (r) => r.officeSince, w: 108 },
  { id: 'datum_zadnje_spremembe', label: 'Datum zadnje spremembe', type: 'datetime', get: (r) => r.modifiedAt, w: 140 },
  { id: 'id', label: 'Id', type: 'text', get: (r) => r.id, w: 230 },
  { id: 'ima_komentarje', label: 'Ima komentarje', type: 'bool', get: (r) => r.hasComments, w: 90 },
  { id: 'klasifikacija', label: 'Klasifikacija', type: 'text', get: (r) => r.classification, w: 140 },
  { id: 'najdalj_v_pisarni', label: 'Najdalj v pisarni pri', type: 'text', get: (r) => r.longestHolder, w: 160 },
  { id: 'namen_vpogleda', label: 'Namen vpogleda', type: 'text', get: (r) => r.viewPurpose, w: 110 },
  { id: 'napaka_izvoz', label: 'Napaka pri izvozu', type: 'text', get: (r) => r.exportError, w: 110 },
  { id: 'napaka_protokola', label: 'Napaka protokola', type: 'text', get: (r) => r.protocolError, w: 110 },
  { id: 'naslov_protokola', label: 'Naslov protokola', type: 'text', get: (r) => r.protocolAddress, w: 110 },
  { id: 'neprebrano', label: 'Neprebrano', type: 'bool', get: (r) => r.unread, w: 70 },
  { id: 'oznake', label: 'Oznake', type: 'text', get: (r) => (r.tags || []).join(', '), w: 110 },
  { id: 'parafiran', label: 'Parafiran', type: 'bool', get: (r) => r.initialed, w: 70 },
  { id: 'podpis', label: 'Podpis', type: 'sig', get: (r) => r.signatureState, w: 48 },
  { id: 'posiljatelj', label: 'Pošiljatelj', type: 'text', get: (r) => r.sender, w: 100 },
  { id: 'predloga', label: 'Predloga', type: 'text', get: (r) => r.template, w: 110 },
  { id: 'predmet', label: 'Predmet', type: 'text', get: (r) => r.subject, w: 100 },
  { id: 'prejemnik', label: 'Prejemnik', type: 'text', get: (r) => r.recipient, w: 120 },
  { id: 'priponka', label: 'Priponka', header: 'Pri', type: 'attach', get: (r) => r.attachments, w: 22 },
  { id: 'protokol', label: 'Protokol', type: 'text', get: (r) => r.protocol, w: 100 },
  { id: 'rok_hranjenja', label: 'Rok hranjenja', type: 'date', get: (r) => r.retentionUntil, w: 100 },
  { id: 'status', label: 'Status', type: 'text', get: (r) => r.status, w: 100 },
  { id: 'status_izvoza', label: 'Status izvoza', type: 'text', get: (r) => r.exportStatus, w: 100 },
  { id: 'tip_dokumenta', label: 'Tip dokumenta', type: 'text', get: (r) => r.categoryLabel, w: 100 },
  { id: 'uporabnik', label: 'Uporabnik', type: 'text', get: (r) => r.holderName, w: 130 },
  { id: 'v_hrambi_od', label: 'V hrambi od', type: 'datetime', get: (r) => r.archivedAt, w: 108 },
  { id: 'osebni', label: 'Vsebuje osebne podatke', type: 'bool', get: (r) => r.personalData, w: 90 },
  { id: 'zadnji_paraf', label: 'Zadnji paraf', type: 'text', get: (r) => r.lastInitial, w: 120 },
  { id: 'zaznamek', label: 'Zaznamek', header: 'Za', type: 'note', get: (r) => r.note, w: 22 },
  { id: 'zunanji_id', label: 'Zunanji id', type: 'text', get: (r) => r.externalId, w: 100 },
  { id: 'zunanji_id_2', label: 'Zunanji id 2', type: 'text', get: (r) => r.externalId2, w: 100 },
  { id: 'zunanji_status', label: 'Zunanji status', type: 'status', get: (r) => r.externalStatusLabel, w: 136 },
];

// Category content columns (group band in the "Stolpci" dialog).
const CATEGORY_EXTRA = {
  racun: [
    { id: 'c:datum_racuna', label: 'Datum računa', type: 'date', get: F('datum_racuna'), w: 90 },
    { id: 'c:datum_opr_stor_izdaje_blaga', label: 'Datum opr. stor./ izdaje blaga', header: 'Datum opr. stor./izdaje blaga', type: 'date', get: F('datum_opr_stor_izdaje_blaga'), w: 170 },
    { id: 'c:vrsta_dokumenta', label: 'Vrsta dokumenta', type: 'text', get: F('vrsta_dokumenta'), w: 125 },
    { id: 'c:vrsta_dokumenta_sifra', label: 'Vrsta dokumenta (Šifra)', type: 'text', get: (r) => String(r.fields?.vrsta_dokumenta || '').split(' - ')[0], w: 98 },
    { id: 'c:stev_racuna_panteon', label: 'Štev. računa (Panteon)', type: 'text', get: F('stev_racuna_panteon'), w: 140 },
    { id: 'c:datum_zapadlosti_rok_placila', label: 'Datum zapadlosti, rok plačila', type: 'date', get: F('datum_zapadlosti_rok_placila'), w: 175 },
    { id: 'c:skupni_znesek_racuna', label: 'Skupni znesek računa', type: 'amount', get: F('skupni_znesek_racuna'), w: 135 },
    { id: 'c:saldo', label: 'Saldo', type: 'amount', get: F('saldo'), w: 66 },
    { id: 'c:datum_zapadlosti', label: 'Datum zapadlosti', type: 'date', get: F('datum_zapadlosti'), w: 108 },
    { id: 'c:datum_opravljene_storitve', label: 'Datum opravljene storitve', type: 'date', get: F('datum_opravljene_storitve'), w: 140 },
    { id: 'c:oddelek', label: 'Oddelek', type: 'text', get: F('oddelek'), w: 100 },
    { id: 'c:stroskovni_nosilec', label: 'Stroškovni nosilec', type: 'text', get: F('stroskovni_nosilec'), w: 110 },
    { id: 'c:placano', label: 'PLAČANO', type: 'bool', get: F('placano'), w: 60 },
    { id: 'c:valuta', label: 'Valuta', type: 'text', get: F('valuta'), w: 50 },
  ],
  predracun: [
    { id: 'c:stevilka_predracuna', label: 'Številka predračuna', type: 'text', get: F('stevilka_predracuna'), w: 120 },
    { id: 'c:datum_predracuna', label: 'Datum predračuna', type: 'date', get: F('datum_predracuna'), w: 100 },
    { id: 'c:skupni_znesek_racuna', label: 'Znesek predračuna', type: 'amount', get: F('skupni_znesek_racuna'), w: 110 },
  ],
  pogodbe: [
    { id: 'c:stevilka_pogodbe', label: 'Številka pogodbe', type: 'text', get: F('stevilka_pogodbe'), w: 110 },
    { id: 'c:datum_pogodbe', label: 'Datum pogodbe', type: 'date', get: F('datum_pogodbe'), w: 100 },
    { id: 'c:veljavnost_do', label: 'Veljavnost do', type: 'date', get: F('veljavnost_do'), w: 100 },
  ],
};

export function contentColumns(category) {
  const extra = CATEGORY_EXTRA[category] || [];
  const have = new Set(extra.map((c) => c.id));
  // Remaining indexed content fields are available as columns for invoices.
  const rest = category === 'racun'
    ? CONTENT_FIELDS.filter((f) => !have.has('c:' + f.key)).map((f) => ({
      id: 'c:' + f.key, label: f.label, type: f.type === 'enum' ? 'text' : f.type, get: F(f.key), w: 110,
    }))
    : [];
  return [...extra, ...rest];
}

export function allColumns(category) {
  return [...GENERAL_COLUMNS, ...contentColumns(category)];
}
export function columnById(id, category) {
  return allColumns(category || 'racun').find((c) => c.id === id) || allColumns('predracun').find((c) => c.id === id) || allColumns('pogodbe').find((c) => c.id === id);
}

// Default visible column sets per folder (order as captured).
export const DEFAULT_COLUMNS = {
  'in/racun': ['zunanji_status', 'c:datum_racuna', 'c:datum_opr_stor_izdaje_blaga', 'c:vrsta_dokumenta', 'c:stev_racuna_panteon',
    'datum_prejetja', 'c:datum_zapadlosti_rok_placila', 'c:skupni_znesek_racuna', 'c:saldo', 'podpis', 'zaznamek', 'priponka',
    'c:datum_zapadlosti', 'posiljatelj', 'predmet', 'datum_posiljanja'],
  'in/pogodbe': ['podpis', 'zaznamek', 'priponka', 'posiljatelj', 'predmet', 'datum_posiljanja', 'datum_prejetja'],
  'in/predracun': ['podpis', 'zaznamek', 'priponka', 'posiljatelj', 'predmet', 'datum_posiljanja', 'datum_prejetja'],
  'out/racun': ['podpis', 'zaznamek', 'priponka', 'prejemnik', 'predmet', 'datum_posiljanja', 'datum_zadnje_spremembe'],
  supervision: ['podpis', 'zaznamek', 'priponka', 'uporabnik', 'datum_v_pisarni', 'posiljatelj', 'predmet', 'datum_posiljanja', 'datum_prejetja'],
  search: ['c:stevilka_racuna', 'c:vrsta_dokumenta_sifra', 'c:vrsta_dokumenta', 'c:skupni_znesek_racuna', 'c:datum_opravljene_storitve',
    'podpis', 'tip_dokumenta', 'posiljatelj', 'prejemnik', 'datum_posiljanja', 'datum_prejetja', 'predmet'],
};
export function defaultColumnsFor(folderId) {
  if (DEFAULT_COLUMNS[folderId]) return DEFAULT_COLUMNS[folderId];
  if (folderId?.startsWith('in/racun')) return DEFAULT_COLUMNS['in/racun'];
  return DEFAULT_COLUMNS['in/pogodbe'];
}

// Classification plan (fictional demo plan).
export const CLASSIFICATION = [
  { code: '01', label: 'Splošne zadeve', children: [
    { code: '01.01', label: 'Korespondenca' }, { code: '01.02', label: 'Zapisniki' } ] },
  { code: '02', label: 'Finance in računovodstvo', children: [
    { code: '02.01', label: 'Prejeti računi' }, { code: '02.02', label: 'Izdani računi' }, { code: '02.03', label: 'Predračuni' } ] },
  { code: '03', label: 'Pogodbe', children: [
    { code: '03.01', label: 'Dobaviteljske pogodbe' }, { code: '03.02', label: 'Kupčeve pogodbe' } ] },
];
export function classificationLabel(code) {
  for (const n of CLASSIFICATION) {
    if (n.code === code) return `${n.code} ${n.label}`;
    for (const c of n.children || []) if (c.code === code) return `${c.code} ${c.label}`;
  }
  return code || '';
}

// Self-check: content keys must be unique.
{
  const seen = new Set();
  for (const f of CONTENT_FIELDS) {
    if (seen.has(f.key)) throw new Error('Duplicate content key ' + f.key);
    seen.add(f.key);
  }
  if (CONTENT_FIELDS.length !== 122 || GENERAL_CRITERIA.length !== 22) throw new Error('Search inventory size mismatch');
}
