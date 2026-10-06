// Text <-> bytes helpers that work in Node and in the browser.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const toBytes = (s) => enc.encode(String(s));
export const fromBytes = (b) => dec.decode(b);
