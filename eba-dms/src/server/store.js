// Local persistence: one JSON state file plus a directory of immutable blobs.
// Writes are atomic (temp file + rename) so a crash never leaves half a file.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    this.blobDir = path.join(dir, 'blobs');
    this.state = null;
  }

  exists() { return fs.existsSync(this.file); }

  load() {
    this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return this.state;
  }

  init(state) {
    this.state = state;
    this.save();
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }

  wipe() {
    fs.rmSync(this.file, { force: true });
    fs.rmSync(this.blobDir, { recursive: true, force: true });
    this.state = null;
  }

  // --- blobs ---------------------------------------------------------------
  putBlob(bytes, { mime, name, owner }) {
    fs.mkdirSync(this.blobDir, { recursive: true });
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const id = crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(path.join(this.blobDir, id), buf);
    const meta = { id, mime: mime || 'application/octet-stream', name: name || id, size: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'), owner: owner || null };
    this.state.blobs[id] = meta;
    return meta;
  }

  readBlob(id) {
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    const meta = this.state.blobs[id];
    if (!meta) return null;
    const p = path.join(this.blobDir, id);
    if (!fs.existsSync(p)) return null;
    return { meta, bytes: fs.readFileSync(p) };
  }

  blobText(id) {
    const b = this.readBlob(id);
    return b ? b.bytes.toString('utf8') : null;
  }
}
