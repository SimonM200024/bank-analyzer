#!/usr/bin/env node
// EBA DMS demo recreation — local server.
//   node server.mjs            start on http://localhost:4173
//   node server.mjs --reset    rebuild the fictional demo data first
//   node server.mjs --port 8080 --data ./mydata

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/server/http.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const reset = args.includes('--reset');
const resetOnly = args.includes('--reset-only');
const port = Number(opt('--port', process.env.PORT || 4173));
const dataDir = path.resolve(opt('--data', process.env.EBA_DATA || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')));

const { server, svc } = createApp({ dataDir, reset: reset || resetOnly });
if (resetOnly) {
  console.log(`Demo podatki ponastavljeni v ${dataDir} (${svc.s.documents.length} dokumentov).`);
  process.exit(0);
}
server.listen(port, '127.0.0.1', () => {
  console.log(`EBA DMS (demo rekreacija) teče na http://localhost:${port}`);
  console.log(`Podatki: ${dataDir}  ·  Dokumentov: ${svc.s.documents.length}`);
  console.log('Demo uporabniki (geslo "demo"): mnovak, jkovac, pzupan, ahorvat, tkrajnc, lmlakar, bzorko, nkos, egolob');
});
