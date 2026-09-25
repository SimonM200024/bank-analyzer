const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
// End-to-end test of the CRM module. Firebase is replaced by an in-memory mock (tests/firebase-mock.js).
// Run: npm i --no-save playwright && npx playwright install chromium && node tests/crm.e2e.js
// Set LIBS_DIR to a folder with chart.js, d3.js, sankey.js, pdf.js to serve CDN libraries offline.
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'firebase-mock.js'), 'utf8');
const OUT = path.join(__dirname, '.shots');
const LIBS_DIR = process.env.LIBS_DIR;
fs.mkdirSync(OUT, { recursive: true });
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(12, 0, 0, 0); return d.toISOString(); };
const SEED = {
  users: { u1: { email: 'tester@example.com', name: 'Test User', role: 'user' } },
  data: { u1: {
    imports: { imp1: { filename: 'statement.pdf', active: true, importedAt: 1, txns: [
      { id: 't1', date: 'x', parsedDate: day(-15), description: 'LUMA OPTICS D.O.O. PLACILO RACUNA 2026-114', amount: 18400, balance: 21000 },
      { id: 't2', date: 'x', parsedDate: day(-20), description: 'NORD LENS STUDIO GMBH INVOICE 88', amount: 7200, balance: 2600 },
      { id: 't3', date: 'x', parsedDate: day(-3), description: 'LIDL LJUBLJANA', amount: -45.2, balance: 20954.8 },
      { id: 't4', date: 'x', parsedDate: day(-2), description: 'CLEARVIEW PARTNERS SRL', amount: 5000, balance: 25954.8 },
      { id: 't5', date: 'x', parsedDate: day(-1), description: 'LUMA OPTICS REFUND FEE', amount: -120, balance: 25834.8 }
    ] } },
    stocks: { s1: { symbol: 'AAPL', shares: 1, price: 100 } }
  } }
};
const results = [];
const check = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); if (!cond) console.log('FAIL:', name, extra); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Proxy failed/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/corsproxy|codetabs|allorigins|exchangerate-api|yahoo/, r => r.abort());
  await page.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('firebase-app-compat') ? `window.__FB_SEED__=${JSON.stringify(SEED)};` + MOCK : '' }));
  const LIB = { 'chart.umd': 'chart.js', 'd3.v7': 'd3.js', 'd3-sankey': 'sankey.js', 'pdf.min': 'pdf.js' };
  if (LIBS_DIR) await page.route(/cdn\.jsdelivr\.net|d3js\.org|cdnjs\.cloudflare\.com/, r => { const k = Object.keys(LIB).find(k => r.request().url().includes(k)); return k ? r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(LIBS_DIR, LIB[k])) }) : r.fulfill({ status: 404, body: '' }); });
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('http://app.test/', r => r.fulfill({ contentType: 'text/html', body: HTML }));
  await page.goto('http://app.test/');
  await page.waitForSelector('#mainApp:not(.hidden)');
  await page.waitForTimeout(600);
  const db = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__fbState.tree)));

  // Empty state
  await page.click('.sidebar-item[data-page="crm"]');
  await page.waitForSelector('#crmView_crm .crm-empty');
  check('empty state shown', await page.isVisible('text=Your CRM is empty'));
  await page.screenshot({ path: OUT + '/01-empty.png' });

  // Sample data
  await page.click('text=✨ Load sample data');
  await page.waitForSelector('#crmChart');
  let t = await db();
  check('sample data persisted', Object.keys(t.data.u1.crm.companies).length === 8 && Object.keys(t.data.u1.crm.deals).length === 12);
  check('bank imports untouched', !!t.data.u1.imports.imp1 && t.data.u1.stocks.s1.symbol === 'AAPL');
  const cards = await page.$$eval('#crmView_crm .card', els => els.map(e => e.innerText.replace(/\n/g, ' | ')));
  check('six KPI cards', cards.length === 6, cards.join(' ;; '));
  check('tasks badge visible', await page.isVisible('#crmTasksBadge'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/02-dashboard.png', fullPage: true });

  // Global search
  await page.fill('#crmGlobalSearch', 'luma');
  await page.waitForSelector('#crmSearchResults:not(.hidden) .crm-search-hit');
  const hits = await page.$$eval('.crm-search-hit', els => els.length);
  check('global search hits', hits >= 2, 'hits=' + hits);
  await page.click('.crm-search-hit >> nth=0');
  await page.waitForSelector('.crm-drawer');
  check('drawer opens from search', (await page.textContent('.crm-drawer-title')).includes('Luma'));
  await page.click('.crm-tab:has-text("Bank")');
  const bankRows = await page.$$eval('.crm-drawer tbody tr', els => els.length);
  check('bank tab lists matched transactions (incl. outgoing)', bankRows === 2, 'rows=' + bankRows);
  await page.screenshot({ path: OUT + '/03-company-bank.png' });
  await page.keyboard.press('Escape');
  check('escape closes drawer', !(await page.isVisible('.crm-drawer')));

  // Pipeline drag and drop
  await page.click('.sidebar-item[data-page="crmPipeline"]');
  await page.waitForSelector('.crm-board');
  const cols = await page.$$eval('.crm-col', els => els.map(e => e.dataset.stage));
  check('board has 6 columns', cols.length === 6, cols.join(','));
  const src = '.crm-col[data-stage="New lead"] .crm-card >> nth=0';
  const title = (await page.textContent(src + ' >> .crm-card-title')).trim();
  await page.dragAndDrop(src, '.crm-col[data-stage="Qualified"] .crm-col-body');
  await page.waitForTimeout(200);
  t = await db();
  const moved = Object.values(t.data.u1.crm.deals).find(d => d.title === title);
  check('drag and drop changes stage', moved && moved.stage === 'Qualified', title + ' -> ' + (moved && moved.stage));
  await page.screenshot({ path: OUT + '/04-pipeline.png' });

  // Win a deal via drawer stepper; prospect becomes customer
  await page.click('.crm-card:has-text("Store fit-out frames")');
  await page.waitForSelector('.crm-stepper');
  await page.click('.crm-step:has-text("Won")');
  await page.waitForSelector('.crm-section-title:has-text("Payment")');
  t = await db();
  const fit = Object.values(t.data.u1.crm.deals).find(d => d.title === 'Store fit-out frames');
  check('deal won with closedAt', fit.stage === 'Won' && !!fit.closedAt);
  check('prospect promoted to customer', t.data.u1.crm.companies[fit.companyId].status === 'Customer');
  await page.click('.crm-step:has-text("Lost")');
  await page.waitForSelector('#crmF_reason');
  await page.selectOption('#crmF_reason', 'Price');
  await page.click('#crmModal button[type=submit]');
  await page.waitForTimeout(100);
  t = await db();
  const fit2 = Object.values(t.data.u1.crm.deals).find(d => d.title === 'Store fit-out frames');
  check('lost with reason', fit2.stage === 'Lost' && fit2.lostReason === 'Price');
  await page.keyboard.press('Escape');

  // Link a bank payment to a won deal
  await page.click('.crm-card:has-text("Autumn lens collection")');
  await page.click('.crm-step:has-text("Won")');
  await page.click('text=+ Link payment');
  await page.waitForSelector('#crmPayList .crm-list-item');
  const sugg = await page.$$eval('#crmPayList .crm-list-item', els => els.map(e => e.innerText.replace(/\n/g, ' ')));
  check('payment suggestions include matching bank txn first', sugg[0] && sugg[0].includes('LUMA OPTICS') && sugg[0].includes('Amount match'), sugg.join(' ;; '));
  await page.screenshot({ path: OUT + '/05-link-payment.png' });
  await page.click('#crmPayList button:has-text("Link") >> nth=0');
  await page.waitForTimeout(100);
  t = await db();
  const autumn = Object.values(t.data.u1.crm.deals).find(d => d.title === 'Autumn lens collection');
  const pays = Object.values(autumn.payments || {});
  check('payment linked', pays.length === 1 && pays[0].txnId === 't1' && pays[0].amount === 18400);
  check('drawer shows paid', (await page.textContent('.crm-drawer')).includes('✓ Paid'));
  await page.screenshot({ path: OUT + '/06-deal-paid.png' });
  // manual partial payment on another deal
  await page.keyboard.press('Escape');
  await page.click('.crm-card:has-text("Spring display refresh")');
  await page.click('text=+ Link payment');
  await page.click('.crm-manual summary');
  await page.fill('#crmPayAmount', '1.000,50');
  await page.click('.crm-manual button[type=submit]');
  await page.waitForTimeout(100);
  t = await db();
  const spring = Object.values(t.data.u1.crm.deals).find(d => d.title === 'Spring display refresh');
  const sp = Object.values(spring.payments).reduce((n, p) => n + p.amount, 0);
  check('manual payment parsed 1.000,50', Math.abs(sp - 3000.5) < 0.001, 'sum=' + sp);
  check('partial state shown', (await page.textContent('.crm-drawer')).includes('Part paid'));
  // Activity log
  await page.click('.crm-tab:has-text("Activity")');
  await page.fill('#crmActText', 'Called about <b>balance</b>');
  await page.click('.crm-composer button[type=submit]');
  await page.waitForTimeout(100);
  check('activity logged and escaped', (await page.innerHTML('.crm-drawer-body')).includes('&lt;b&gt;balance&lt;/b&gt;'));
  await page.keyboard.press('Escape');

  // Table view + sort
  await page.click('.crm-chip:has-text("Table")');
  await page.waitForSelector('.crm-table');
  await page.click('.crm-table th:has-text("Value")');
  let vals = await page.$$eval('.crm-table tbody tr td.num:not(.hide-sm)', els => els.map(e => Number(e.innerText.replace(/[^\d,]/g, '').replace(',', '.'))));
  check('table sorted by value asc', vals.every((v, i) => !i || vals[i - 1] <= v), vals.join(','));
  await page.click('.crm-table th:has-text("Value")');
  vals = await page.$$eval('.crm-table tbody tr td.num:not(.hide-sm)', els => els.map(e => Number(e.innerText.replace(/[^\d,]/g, '').replace(',', '.'))));
  check('table sorted by value desc', vals.every((v, i) => !i || vals[i - 1] >= v), vals.join(','));
  await page.fill('#crmView_crmPipeline .crm-search', 'clinic');
  const n = await page.$$eval('.crm-table tbody tr', els => els.length);
  check('deal search filters', n === 1, 'n=' + n);
  await page.fill('#crmView_crmPipeline .crm-search', '');
  await page.click('.crm-chip:has-text("Board")');

  // Companies page
  await page.click('.sidebar-item[data-page="crmCompanies"]');
  await page.waitForSelector('#crmList_companies table');
  const bankCell = await page.$$eval('#crmList_companies tbody tr', rows => rows.map(r => r.innerText.replace(/\s+/g, ' ')));
  check('companies table shows bank received', bankCell.some(r => r.includes('Luma') && /18\.?400[,.]00/.test(r)), bankCell.join(' ;; '));
  await page.screenshot({ path: OUT + '/07-companies.png' });
  await page.click('text=+ New company');
  await page.fill('#crmF_name', 'luma optics d.o.o.');
  await page.click('#crmModal button[type=submit]');
  check('duplicate company rejected', (await page.textContent('#crmFormError')).includes('already exists'));
  await page.fill('#crmF_name', 'Test <img src=x onerror=alert(1)> Co');
  await page.fill('#crmF_email', 'bad-email');
  await page.click('#crmModal button[type=submit]');
  check('invalid email rejected', (await page.textContent('#crmFormError')).includes('not a valid email'));
  await page.fill('#crmF_email', 'ok@test.example');
  await page.fill('#crmF_bankKeywords', 'CLEARVIEW');
  await page.click('#crmModal button[type=submit]');
  await page.waitForSelector('.crm-drawer');
  check('xss-safe title', (await page.textContent('.crm-drawer-title')).includes('<img'));
  await page.click('.crm-tab:has-text("Contacts")');
  await page.click('.crm-drawer button:has-text("+ Contact")');
  await page.fill('#crmF_name', 'Zoe Tester');
  await page.fill('#crmF_email', 'zoe@test.example');
  await page.click('#crmModal button[type=submit]');
  await page.waitForTimeout(100);
  check('contact created in company drawer', (await page.textContent('.crm-drawer-body')).includes('Zoe Tester'));
  // delete the company: contact kept but unlinked
  await page.click('.crm-drawer-actions button[title="Delete"]');
  await page.click('#crmConfirmBtn');
  await page.waitForTimeout(100);
  t = await db();
  const zoe = Object.values(t.data.u1.crm.contacts).find(c => c.name === 'Zoe Tester');
  check('company delete unlinks contact', zoe && zoe.companyId === '' && !Object.values(t.data.u1.crm.companies).some(c => c.name.startsWith('Test <img')));

  // Status filter
  await page.selectOption('#crmView_crmCompanies select', 'Partner');
  const partnerRows = await page.$$eval('#crmList_companies tbody tr', r => r.length);
  check('status filter', partnerRows === 1, 'rows=' + partnerRows);
  await page.selectOption('#crmView_crmCompanies select', 'all');

  // CSV import
  await page.click('#crmView_crmCompanies button:has-text("Import")');
  await page.fill('#crmImportText', 'Name;Status;City;E-mail\n"Alpha; Beta d.o.o.";Customer;Koper;a@alpha.example\nLuma Optics d.o.o.;Customer;;\n;Prospect;;\nGamma;Weird;;not-an-email\nDelta;;Bled;\nDelta;;;');
  await page.dispatchEvent('#crmImportText', 'input');
  await page.waitForSelector('.crm-import-summary');
  const summary = await page.textContent('.crm-import-summary');
  check('import preview summary', summary.includes('2 ready') && summary.includes('2 skipped') && summary.includes('2 with errors'), summary);
  await page.screenshot({ path: OUT + '/08-import.png' });
  await page.click('#crmImportBtn');
  await page.waitForTimeout(100);
  t = await db();
  const alpha = Object.values(t.data.u1.crm.companies).find(c => c.name === 'Alpha; Beta d.o.o.');
  check('import created quoted company', alpha && alpha.status === 'Customer' && alpha.location === 'Koper' && alpha.email === 'a@alpha.example');
  // contacts import creates companies
  await page.click('.sidebar-item[data-page="crmContacts"]');
  await page.click('#crmView_crmContacts button:has-text("Import")');
  await page.fill('#crmImportText', 'first name,last name,email,company\nIvo,Novak,ivo@x.example,Brand New Co\nAna,Kralj,ana.kralj@lumaoptics.example,Luma Optics d.o.o.');
  await page.dispatchEvent('#crmImportText', 'input');
  await page.waitForSelector('.crm-import-summary');
  const s2 = await page.textContent('.crm-import-preview');
  check('contacts preview flags new company & existing email', s2.includes('New company “Brand New Co”') && s2.includes('already exists'), s2.slice(0, 300));
  await page.click('#crmImportBtn');
  await page.waitForTimeout(100);
  t = await db();
  const ivo = Object.values(t.data.u1.crm.contacts).find(c => c.name === 'Ivo Novak');
  check('contact import links new company', ivo && t.data.u1.crm.companies[ivo.companyId]?.name === 'Brand New Co');
  await page.screenshot({ path: OUT + '/09-contacts.png' });

  // CSV export with formula escaping
  await page.evaluate(() => CRM.editContact());
  await page.fill('#crmF_name', '=HYPERLINK("http://evil")');
  await page.click('#crmModal button[type=submit]');
  await page.keyboard.press('Escape');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#crmView_crmContacts button:has-text("Export")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('export escapes formulas', csv.includes(`"'=HYPERLINK(""http://evil"")"`), csv.slice(0, 200));

  // Tasks
  await page.click('.sidebar-item[data-page="crmTasks"]');
  await page.waitForSelector('#crmQuickTitle');
  await page.fill('#crmQuickTitle', 'Quick added task');
  await page.press('#crmQuickTitle', 'Enter');
  await page.waitForTimeout(100);
  check('quick task added & focus kept', (await page.textContent('#crmList_tasks')).includes('Quick added task') && await page.evaluate(() => document.activeElement.id) === 'crmQuickTitle');
  const before = await page.textContent('#crmTasksBadge');
  await page.click('.crm-list-item:has-text("Quick added task") .crm-check');
  await page.waitForTimeout(100);
  const after = await page.textContent('#crmTasksBadge');
  check('completing task updates badge', Number(after) === Number(before) - 1, before + '->' + after);
  await page.click('.crm-chip:has-text("Overdue")');
  const od = await page.$$eval('#crmList_tasks .crm-list-item', e => e.length);
  check('overdue filter', od === 2, 'n=' + od);
  await page.click('.crm-chip:has-text("All open")');
  await page.screenshot({ path: OUT + '/10-tasks.png', fullPage: true });

  // Settings: rename a stage
  await page.evaluate(() => CRM.openSettings());
  await page.fill('.crm-stage-row >> nth=1 >> input.crm-grow', 'Discovery');
  await page.click('text=Save stages');
  await page.waitForTimeout(100);
  t = await db();
  const stages = t.data.u1.crm.settings.stages.map(s => s.name);
  const disc = Object.values(t.data.u1.crm.deals).filter(d => d.stage === 'Discovery').length;
  const qual = Object.values(t.data.u1.crm.deals).filter(d => d.stage === 'Qualified').length;
  check('stage rename migrates deals', stages[1] === 'Discovery' && disc > 0 && qual === 0, stages.join(',') + ' disc=' + disc);
  await page.evaluate(() => CRM.openSettings());
  await page.fill('.crm-stage-row >> nth=0 >> input.crm-grow', 'won');
  await page.click('text=Save stages');
  check('reserved stage name rejected', (await page.textContent('#crmStageError')).includes('built in'));
  await page.screenshot({ path: OUT + '/11-settings.png' });
  await page.keyboard.press('Escape');

  // Host saveData keeps CRM
  await page.evaluate(() => saveData());
  t = await db();
  check('saveData keeps crm node', !!t.data.u1.crm && Object.keys(t.data.u1.crm.deals).length === 12);

  // Alerts
  const al = await page.evaluate(() => { generateAlerts(); return alerts.map(a => a.title); });
  check('CRM alerts added to bell', al.includes('Overdue CRM tasks'), al.join(','));

  // Remote change sync
  await page.evaluate(() => window.firebase.database().ref('data/u1/crm/tasks/remote1').set({ id: 'remote1', title: 'From other device', due: '2020-01-01', priority: 'Normal', done: false }));
  await page.waitForTimeout(100);
  check('remote changes appear live', (await page.textContent('#crmList_tasks')).includes('From other device'));

  // Save failure reverts
  await page.evaluate(() => { window.__FB_FAIL__ = true; });
  await page.fill('#crmQuickTitle', 'Will fail');
  await page.press('#crmQuickTitle', 'Enter');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__FB_FAIL__ = false; });
  await page.waitForTimeout(300);
  check('failed save reverts to server state', !(await page.textContent('#crmList_tasks')).includes('Will fail'));

  // Backup + restore round trip
  await page.evaluate(() => CRM.openSettings());
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('text=Download backup')]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), 'utf8'));
  check('backup contains data', Object.keys(backup.crm.companies).length > 8);
  await page.click('text=🗑️ Delete all CRM data');
  await page.click('#crmConfirmBtn');
  await page.waitForTimeout(100);
  t = await db();
  check('delete all removes crm only', !t.data.u1.crm && !!t.data.u1.imports);
  await page.evaluate(() => CRM.openSettings());
  await page.setInputFiles('.crm-file-btn input', await bk.path());
  await page.waitForSelector('#crmConfirmBtn');
  await page.click('#crmConfirmBtn');
  await page.waitForTimeout(100);
  t = await db();
  check('restore works', Object.keys(t.data.u1.crm.companies).length === Object.keys(backup.crm.companies).length);

  // Remove sample
  await page.evaluate(() => CRM.openSettings());
  await page.click('text=Remove sample data');
  await page.click('#crmConfirmBtn');
  await page.waitForTimeout(100);
  t = await db();
  const leftover = Object.values(t.data.u1.crm.companies).map(c => c.name);
  check('remove sample keeps user data', leftover.includes('Alpha; Beta d.o.o.') && !leftover.includes('Forma Frames'), leftover.join(','));

  // Light theme + mobile
  await page.evaluate(() => CRM.loadSample());
  await page.click('.sidebar-item[data-page="crm"]');
  await page.evaluate(() => toggleTheme());
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/12-dashboard-alt-theme.png', fullPage: true });
  await page.evaluate(() => toggleTheme());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('no horizontal overflow on mobile dashboard', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: OUT + '/13-mobile-dashboard.png', fullPage: true });
  await page.evaluate(() => switchPage('crmCompanies'));
  await page.screenshot({ path: OUT + '/14-mobile-companies.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('no horizontal overflow on mobile companies', !overflow);
  await page.evaluate(() => CRM.open('deals', 'sd0'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/15-mobile-deal.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => switchPage('crmPipeline'));
  await page.screenshot({ path: OUT + '/16-mobile-pipeline.png' });

  // Sign out resets
  await page.evaluate(() => signOut());
  await page.waitForTimeout(100);
  check('sign out hides app', await page.isVisible('#authScreen'));

  check('no console/page errors', errors.length === 0, errors.join('\n'));
  await browser.close();
  console.log(results.map(r => r.join(' | ')).join('\n'));
  console.log(`\n${results.filter(r => r[0] === 'PASS').length}/${results.length} passed`);
  process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
