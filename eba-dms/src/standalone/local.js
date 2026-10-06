// In-page replacement for src/server/http.js: the same Service, API and
// access checks, reached through a function call instead of HTTP.
import { Service, API, checkPassword } from '../server/service.js';
import { INTAKE_API } from '../server/intake.js';
import { buildFixtures } from '../server/fixtures.js';
import { AccessError, canRead, flag } from '../server/access.js';
import { BrowserStore } from './store.js';

const ALL_API = { ...API, ...INTAKE_API };

export async function createLocal({ onUnavailable } = {}) {
  const store = new BrowserStore();
  await store.open();
  if (!store.exists()) buildFixtures(store, new Date());
  let svc = new Service(store);
  let userId = null;
  const urls = new Map();

  const fail = (status, message) => Object.assign(new Error(message), { status });
  const user = () => {
    const u = userId && svc.user(userId);
    if (!u) throw fail(401, 'Seja je potekla. Prijavite se.');
    return u;
  };
  function allowed(u, meta) {
    const o = meta.owner || {};
    if (o.type === 'upload') return o.userId === u.id;
    if (o.type === 'doc') return canRead(svc.s, u, svc.doc(o.id), svc.now());
    if (o.type === 'batch') { const b = svc.s.batches.find((x) => x.id === o.id); return !!b && flag(svc.s, u, b.companyId, 'scan'); }
    return false;
  }

  return {
    async call(op, args = {}) {
      if (op === 'login') {
        const u = svc.s.users.find((x) => x.username === String(args.username || '').trim().toLowerCase() && x.login !== false);
        if (!u || !checkPassword(String(args.password || ''), u.password)) throw fail(401, 'Napačno uporabniško ime ali geslo.');
        userId = u.id;
        return { ok: true };
      }
      if (op === 'logout') { userId = null; return { ok: true }; }
      const fn = Object.hasOwn(ALL_API, op) ? ALL_API[op] : null;
      if (!fn) throw fail(404, 'Neznana operacija.');
      try {
        const result = await fn(svc, user(), JSON.parse(JSON.stringify(args ?? {})));
        return result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result));
      } catch (e) {
        if (e.status) throw e;
        const code = e instanceof AccessError ? e.code : Number.isInteger(e.code) ? e.code : 500;
        if (code === 500) console.error(e);
        throw fail(code, code === 500 ? 'Notranja napaka.' : e.message);
      }
    },
    async upload(file) {
      const u = user();
      if (file.size > 25 * 1024 * 1024) throw fail(413, 'Datoteka je prevelika.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = store.putBlob(bytes, { mime: file.type || 'application/octet-stream', name: file.name.slice(0, 180), owner: { type: 'upload', userId: u.id } });
      store.save();
      return { id: meta.id, name: meta.name, mime: meta.mime, size: meta.size };
    },
    blobUrl(id) {
      const u = userId && svc.user(userId);
      const b = store.readBlob(id);
      if (!u || !b || !allowed(u, b.meta)) return '';
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(new Blob([b.bytes], { type: b.meta.mime })));
      return urls.get(id);
    },
    unavailable(what) { return onUnavailable?.(what); },
    async reset() {
      await store.wipe();
      for (const u of urls.values()) URL.revokeObjectURL(u);
      urls.clear();
      buildFixtures(store, new Date());
      svc = new Service(store);
      userId = null;
    },
  };
}
