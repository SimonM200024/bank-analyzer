// Browser store with the same interface as src/server/store.js. State and
// files live in memory and are mirrored to IndexedDB when the browser allows
// it; when storage is blocked the demo still works for the current visit.
import { fromBytes } from '../core/bytes.js';

const DB = 'dms-demo', VERSION = 1;
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export class BrowserStore {
  constructor() { this.state = null; this.bytes = new Map(); this.db = null; this.dirty = new Set(); this.timer = null; }

  async open() {
    try {
      if (!('indexedDB' in globalThis)) return;
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('blobs'); };
      this.db = await req(r);
      const tx = this.db.transaction(['kv', 'blobs']);
      const json = await req(tx.objectStore('kv').get('state'));
      if (!json) return;
      const keys = await req(tx.objectStore('blobs').getAllKeys());
      const vals = await req(tx.objectStore('blobs').getAll());
      this.state = JSON.parse(json);
      keys.forEach((k, i) => this.bytes.set(k, vals[i]));
    } catch { this.db = null; this.state = null; this.bytes.clear(); }
  }

  exists() { return !!this.state; }
  load() { return this.state; }
  init(state) { this.state = state; this.save(); }

  save() {
    if (!this.db) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }
  flush() {
    if (!this.db || !this.state) return;
    try {
      const tx = this.db.transaction(['kv', 'blobs'], 'readwrite');
      tx.objectStore('kv').put(JSON.stringify(this.state), 'state');
      for (const id of this.dirty) if (this.bytes.has(id)) tx.objectStore('blobs').put(this.bytes.get(id), id);
      this.dirty.clear();
    } catch { /* storage full or blocked: keep working in memory */ }
  }

  async wipe() {
    clearTimeout(this.timer);
    this.state = null; this.bytes.clear(); this.dirty.clear();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(['kv', 'blobs'], 'readwrite');
      tx.objectStore('kv').clear(); tx.objectStore('blobs').clear();
      await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; });
    } catch { /* ignore */ }
  }

  putBlob(bytes, { mime, name, owner }) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const rnd = new Uint8Array(12); crypto.getRandomValues(rnd);
    const id = [...rnd].map((b) => b.toString(16).padStart(2, '0')).join('');
    this.bytes.set(id, u8);
    this.dirty.add(id);
    const meta = { id, mime: mime || 'application/octet-stream', name: name || id, size: u8.length, sha256: '', owner: owner || null };
    this.state.blobs[id] = meta;
    return meta;
  }
  readBlob(id) {
    const meta = this.state?.blobs[id];
    const bytes = this.bytes.get(id);
    return meta && bytes ? { meta, bytes } : null;
  }
  blobText(id) { const b = this.readBlob(id); return b ? fromBytes(b.bytes) : null; }
}
