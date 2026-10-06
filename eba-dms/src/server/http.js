// Zero-dependency HTTP layer: static files, JSON API, uploads, blobs, export.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { Service, API, checkPassword, hexId } from './service.js';
import { INTAKE_API } from './intake.js';
import { buildFixtures } from './fixtures.js';
import { AccessError, canRead, flag } from './access.js';
import { zip } from './zip.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
};
const ALL_API = { ...API, ...INTAKE_API };
const UPLOAD_LIMIT = 25 * 1024 * 1024;

export function createApp({ dataDir, reset = false, clock } = {}) {
  const store = new Store(dataDir || path.join(ROOT, 'data'));
  if (reset) store.wipe();
  if (!store.exists()) buildFixtures(store, clock ? clock() : new Date());
  else store.load();
  const svc = new Service(store, { clock });

  function sessionUser(req) {
    const m = /(?:^|;\s*)eba_session=([a-f0-9]+)/.exec(req.headers.cookie || '');
    const s = m && svc.sessions.get(m[1]);
    if (!s) return null;
    const user = svc.user(s.userId);
    return user ? { user, token: m[1], session: s } : null;
  }

  function send(res, code, body, headers = {}) {
    const isBuf = Buffer.isBuffer(body);
    const payload = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(code, {
      'Content-Type': isBuf || typeof body === 'string' ? headers['Content-Type'] || 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
    });
    res.end(payload);
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Datoteka je prevelika.'), { code: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  function blobAllowed(user, meta) {
    const o = meta.owner || {};
    if (o.type === 'upload') return o.userId === user.id;
    if (o.type === 'doc') return canRead(svc.s, user, svc.doc(o.id), svc.now());
    if (o.type === 'batch') {
      const b = svc.s.batches.find((x) => x.id === o.id);
      return !!b && flag(svc.s, user, b.companyId, 'scan');
    }
    return false;
  }

  function serveStatic(req, res, urlPath) {
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    let base = path.join(ROOT, 'public');
    if (rel === '/README.md') { return send(res, 200, fs.readFileSync(path.join(ROOT, 'README.md')), { 'Content-Type': MIME['.md'] }); }
    if (rel.startsWith('/docs/')) { base = path.join(ROOT, 'docs'); rel = rel.slice(5); }
    if (rel.startsWith('/core/')) { base = path.join(ROOT, 'src', 'core'); rel = rel.slice(5); }
    const file = path.normalize(path.join(base, decodeURIComponent(rel)));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Ni najdeno');
    send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    try {
      if (p === '/api/login' && req.method === 'POST') {
        const a = JSON.parse((await readBody(req, 1e5)).toString() || '{}');
        const user = svc.s.users.find((u) => u.username === String(a.username || '').trim().toLowerCase() && u.login !== false);
        if (!user || !checkPassword(String(a.password || ''), user.password)) return send(res, 401, { error: 'Napačno uporabniško ime ali geslo.' });
        const token = crypto.randomBytes(24).toString('hex');
        svc.sessions.set(token, { userId: user.id, at: Date.now() });
        return send(res, 200, { ok: true }, { 'Set-Cookie': `eba_session=${token}; HttpOnly; SameSite=Strict; Path=/` });
      }
      if (p === '/api/logout' && req.method === 'POST') {
        const s = sessionUser(req);
        if (s) svc.sessions.delete(s.token);
        return send(res, 200, { ok: true }, { 'Set-Cookie': 'eba_session=; Max-Age=0; Path=/' });
      }
      if (p.startsWith('/api/') || p.startsWith('/blob/') || p.startsWith('/export')) {
        const s = sessionUser(req);
        if (!s) return send(res, 401, { error: 'Seja je potekla. Prijavite se.' });
        const user = s.user;

        if (p === '/api/upload' && req.method === 'POST') {
          const bytes = await readBody(req, UPLOAD_LIMIT);
          const name = decodeURIComponent(req.headers['x-filename'] || 'datoteka');
          const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
          const meta = store.putBlob(bytes, { mime, name: path.basename(name).slice(0, 180), owner: { type: 'upload', userId: user.id } });
          store.save();
          return send(res, 200, { id: meta.id, name: meta.name, mime: meta.mime, size: meta.size });
        }
        if (p.startsWith('/blob/')) {
          const id = p.slice(6);
          const b = store.readBlob(id);
          if (!b) return send(res, 404, 'Ni najdeno');
          if (!blobAllowed(user, b.meta)) return send(res, 403, 'Ni dostopa');
          const dl = url.searchParams.get('download');
          return send(res, 200, b.bytes, {
            'Content-Type': b.meta.mime, 'Cache-Control': 'private, max-age=3600',
            ...(dl ? { 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(b.meta.name)}` } : {}),
            ...(b.meta.mime.includes('svg') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
          });
        }
        if (p === '/export') {
          const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
          const shortcut = url.searchParams.get('shortcut') === '1';
          const files = [];
          for (const id of ids) {
            const doc = svc.doc(id);
            if (!doc || !canRead(svc.s, user, doc, svc.now())) return send(res, 403, 'Ni dostopa');
            const dir = `${doc.id.slice(0, 8)}_${doc.subject.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 50).trim()}`;
            [...doc.pages, ...doc.attachments].forEach((pg, i) => {
              const b = store.readBlob(pg.blobId);
              if (b) files.push({ name: `${dir}/${String(i + 1).padStart(2, '0')}_${b.meta.name}`, data: b.bytes });
            });
            files.push({ name: `${dir}/metapodatki.json`, data: Buffer.from(JSON.stringify({ id: doc.id, subject: doc.subject, sender: doc.sender, recipient: doc.recipient, category: doc.category, direction: doc.direction, receivedAt: doc.receivedAt, externalStatus: doc.externalStatus, fields: doc.fields, tables: doc.tables, events: doc.events }, null, 2)) });
            if (shortcut) {
              const host = req.headers.host || 'localhost';
              files.push({ name: `${dir}/dokument.url`, data: Buffer.from(`[InternetShortcut]\r\nURL=http://${host}/#/doc/${doc.id}\r\n`) });
            }
            svc.event(doc, 'Izvožen', user, { detail: shortcut ? 'Izvoz z bližnjico (ZIP)' : 'Izvoz (ZIP)' });
          }
          store.save();
          return send(res, 200, zip(files), { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="eba-izvoz-${hexId(3)}.zip"` });
        }
        const op = p.slice(5);
        const fn = Object.hasOwn(ALL_API, op) ? ALL_API[op] : null;
        if (!fn || req.method !== 'POST') return send(res, 404, { error: 'Neznana operacija.' });
        const raw = await readBody(req, 5e6);
        let args = {};
        try { args = raw.length ? JSON.parse(raw.toString()) : {}; } catch { return send(res, 400, { error: 'Neveljaven JSON.' }); }
        const result = await fn(svc, user, args || {});
        return send(res, 200, result ?? { ok: true });
      }
      if (req.method !== 'GET') return send(res, 405, 'Metoda ni dovoljena');
      return serveStatic(req, res, p);
    } catch (e) {
      const code = e instanceof AccessError ? e.code : e.code && Number.isInteger(e.code) ? e.code : 500;
      if (code === 500) console.error(e);
      return send(res, code, { error: code === 500 ? 'Notranja napaka strežnika.' : e.message });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  return { server, svc, store };
}
