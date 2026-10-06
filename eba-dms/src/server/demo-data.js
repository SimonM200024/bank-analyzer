// Fictional demo data: companies, partners, people, invoice line items.
// None of these names, identifiers or accounts refer to real records.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export const pickR = (r, list) => list[Math.floor(r() * list.length)];

export const COMPANIES = [
  { id: 'c1', name: 'LIPNIK d.o.o.', short: 'LIPNIK', address: 'Gozdna pot 6', postal: 'SI-1000', city: 'Ljubljana', country: 'Slovenija', vatId: 'SI90000017', trr: 'SI56 9000 0000 1111 222', email: 'racuni@lipnik.example' },
  { id: 'c2', name: 'JAVOR MG d.o.o.', short: 'JAVOR MG', address: 'Industrijska cesta 12', postal: 'SI-2000', city: 'Maribor', country: 'Slovenija', vatId: 'SI90000025', trr: 'SI56 9000 0000 3333 444', email: 'racuni@javor.example' },
  { id: 'c3', name: 'TISA 91 d.o.o.', short: 'TISA 91', address: 'Obrtna ulica 3', postal: 'SI-4000', city: 'Kranj', country: 'Slovenija', vatId: 'SI90000033', trr: 'SI56 9000 0000 5555 666', email: 'info@tisa91.example' },
  { id: 'c4', name: 'LIPNIK TRADE d.o.o.', short: 'LIPNIK TRADE', address: 'Gozdna pot 6', postal: 'SI-1000', city: 'Ljubljana', country: 'Slovenija', vatId: 'SI90000041', trr: 'SI56 9000 0000 7777 888', email: 'trade@lipnik.example' },
];

// [shortName, fullName suffix, city, postal, country, cc]
export const SUPPLIERS = [
  ['Oblak Storitve d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Zelena Energija d.o.o.', 'Celje', 'SI-3000', 'Slovenija', 'SI'],
  ['Hitri Kurir d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Papirnica Bela d.o.o.', 'Kamnik', 'SI-1241', 'Slovenija', 'SI'],
  ['Telekom Vrh d.d.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Mobilni Val d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Pisarniški Svet d.o.o.', 'Domžale', 'SI-1230', 'Slovenija', 'SI'],
  ['Kava in Čaj d.o.o.', 'Koper', 'SI-6000', 'Slovenija', 'SI'],
  ['Gradnje Kocka d.o.o.', 'Novo mesto', 'SI-8000', 'Slovenija', 'SI'],
  ['Varnost Plus d.o.o.', 'Maribor', 'SI-2000', 'Slovenija', 'SI'],
  ['Računalniški center Bit d.o.o.', 'Kranj', 'SI-4000', 'Slovenija', 'SI'],
  ['Avtoservis Kolo d.o.o.', 'Velenje', 'SI-3320', 'Slovenija', 'SI'],
  ['Čistilni servis Bistro d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Tiskarna Črka d.o.o.', 'Škofja Loka', 'SI-4220', 'Slovenija', 'SI'],
  ['Logistika Pot d.o.o.', 'Sežana', 'SI-6210', 'Slovenija', 'SI'],
  ['Svetovanje Modri Krog d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Nordwind Software GmbH', 'Graz', 'AT-8010', 'Avstrija', 'AT'],
  ['Brightline Analytics Ltd', 'Dublin', 'D02', 'Irska', 'IE'],
  ['Cloudberry Hosting B.V.', 'Utrecht', 'NL-3511', 'Nizozemska', 'NL'],
  ['Atlas Freight S.r.l.', 'Trieste', 'IT-34100', 'Italija', 'IT'],
  ['Kovinarstvo Iskrica d.o.o.', 'Kranj', 'SI-4000', 'Slovenija', 'SI'],
  ['Elektro Svetla d.o.o.', 'Ptuj', 'SI-2250', 'Slovenija', 'SI'],
  ['Vodovod Studenec d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Komunala Gaj d.o.o.', 'Kamnik', 'SI-1241', 'Slovenija', 'SI'],
  ['Oglaševalnica Plakat d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Hotel Pri jezeru d.o.o.', 'Bled', 'SI-4260', 'Slovenija', 'SI'],
  ['Prevajalnica Beseda s.p.', 'Maribor', 'SI-2000', 'Slovenija', 'SI'],
  ['Pravna pisarna Tehtnica', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Zavarovalnica Ščit d.d.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Pekarna Zlato Zrno d.o.o.', 'Domžale', 'SI-1230', 'Slovenija', 'SI'],
  ['Vrtnarstvo Bršljan d.o.o.', 'Celje', 'SI-3000', 'Slovenija', 'SI'],
  ['Optika Leča d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Agencija Kompas Digital d.o.o.', 'Nova Gorica', 'SI-5000', 'Slovenija', 'SI'],
  ['Pohištvo Hrast d.o.o.', 'Slovenj Gradec', 'SI-2380', 'Slovenija', 'SI'],
  ['Medpot Freight Kft.', 'Budimpešta', 'HU-1051', 'Madžarska', 'HU'],
  ['Kartica Plus d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
];

export const CUSTOMERS = [
  ['Trgovina Smreka d.o.o.', 'Ljubljana', 'SI-1000', 'Slovenija', 'SI'],
  ['Gostilna Pri mlinu', 'Kamnik', 'SI-1241', 'Slovenija', 'SI'],
  ['Studio Vijolica d.o.o.', 'Koper', 'SI-6000', 'Slovenija', 'SI'],
  ['Mizarstvo Žaga s.p.', 'Kranj', 'SI-4000', 'Slovenija', 'SI'],
  ['Alpenblick Handel GmbH', 'Klagenfurt', 'AT-9020', 'Avstrija', 'AT'],
  ['Sončnica d.o.o.', 'Murska Sobota', 'SI-9000', 'Slovenija', 'SI'],
];

const STREETS = ['Cesta v Mestni log', 'Tržaška cesta', 'Glavni trg', 'Partizanska ulica', 'Kolodvorska ulica', 'Ulica heroja Šlandra', 'Vojkova cesta', 'Industrijska cona', 'Prešernova ulica', 'Pot na polje'];

export function partnerRecord(i, row, companyId, kind = 'supplier') {
  const [name, city, postal, country, cc] = row;
  const r = rng(1000 + i * 31 + (kind === 'customer' ? 7 : 0));
  const tax = String(10000000 + Math.floor(r() * 89999999));
  return {
    id: `p-${companyId}-${kind[0]}${i}`, companyId, fullName: name, shortName: name, representative: '',
    taxNo: tax, regNo: String(1000000 + Math.floor(r() * 8999999)) + '000', email: `info@${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.example`,
    web: `www.${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.example`, ean: '', phone: `+386 1 ${200 + Math.floor(r() * 700)} ${10 + Math.floor(r() * 89)} ${10 + Math.floor(r() * 89)}`,
    fax: '', address: `${pickR(r, STREETS)} ${1 + Math.floor(r() * 80)}`, city: city.toUpperCase(), postal, post: city.toUpperCase(),
    country: country.toUpperCase(), vatId: `${cc}${tax}`, vatPayer: cc === 'SI' ? r() > 0.2 : true, externalId: `EXT-${String(4000 + i)}`,
    ebaId: name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14), source: 'Lokalno', oneTime: false,
    trr: `${cc}56 ${String(1000 + Math.floor(r() * 8999))} ${String(1000 + Math.floor(r() * 8999))} ${String(1000 + Math.floor(r() * 8999))} ${String(100 + Math.floor(r() * 899))}`,
    bic: `${cc === 'SI' ? 'DEMO' : 'TEST'}${cc}2X`, bank: cc === 'SI' ? 'Demo banka d.d.' : 'Example Bank',
    contacts: i % 3 === 0 ? [{ name: 'Prodaja', email: `prodaja@${name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.example`, phone: '', desc: 'Splošni kontakt' }] : [],
    kind,
  };
}

const LINES = [
  ['Najem strežniške infrastrukture', 89, 22], ['Licenca programske opreme (mesečno)', 24.5, 22], ['Kurirske storitve', 18.9, 22],
  ['Pisarniški material', 62.4, 22], ['Mobilna telefonija', 41.2, 22], ['Električna energija', 312.75, 22], ['Vzdrževanje opreme', 145, 22],
  ['Kava in napitki za pisarno', 35.9, 9.5], ['Čiščenje poslovnih prostorov', 260, 22], ['Tisk promocijskih letakov', 180, 22],
  ['Prevoz blaga', 410, 22], ['Svetovanje', 95, 22], ['Gorivo', 72.35, 22], ['Prevajanje dokumentacije', 0.06, 22],
  ['Zavarovalna premija', 380, 0], ['Komunalne storitve', 54.2, 9.5], ['Nočitev', 89, 9.5], ['Oglaševanje na spletu', 250, 22],
];

// Invoice page spec for the synthetic renderer.
export function makeInvoiceSpec(seed, partner, company, baseDate, opts = {}) {
  const r = rng(seed * 7 + 13);
  const issue = new Date(baseDate); issue.setDate(issue.getDate() - Math.floor(r() * 6));
  const service = new Date(issue); service.setDate(service.getDate() - Math.floor(r() * 3));
  const due = new Date(issue); due.setDate(due.getDate() + pickR(r, [0, 8, 15, 30]));
  const nLines = 1 + Math.floor(r() * 3);
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    const [desc, price, vatRate] = pickR(r, LINES);
    const qty = desc.startsWith('Prevajanje') ? 1200 + Math.floor(r() * 2000) : 1 + Math.floor(r() * (price > 200 ? 2 : 6));
    lines.push({ desc, qty, price: Math.round(price * (0.8 + r() * 0.6) * 100) / 100, vatRate, discount: 0 });
  }
  const year = issue.getFullYear();
  const number = opts.number || `${pickR(r, ['R', 'RAC', '', 'INV-'])}${year % 100}-${String(Math.floor(r() * 90000) + 1000)}`;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    seed, kind: opts.kind || 'racun', number, issueDate: iso(issue), serviceDate: iso(service), dueDate: iso(due),
    reference: `SI00 ${number.replace(/[^0-9]/g, '').slice(0, 8) || String(seed)}`,
    currency: partner.country === 'SLOVENIJA' || partner.country === 'Slovenija' ? 'EUR' : pickR(r, ['EUR', 'EUR', 'USD']),
    issuer: { name: partner.fullName, address: partner.address, postal: partner.postal, city: partner.city, country: partner.country, vatId: partner.vatId, email: partner.email, trr: partner.trr, bic: partner.bic, bank: partner.bank },
    recipient: { name: company.name, address: company.address, postal: company.postal, city: company.city, country: company.country, vatId: company.vatId, email: company.email },
    lines, printIssueDate: opts.printIssueDate, note: opts.note || (partner.vatPayer ? '' : 'DDV ni obračunan na podlagi 94. člena ZDDV-1.'),
  };
}
