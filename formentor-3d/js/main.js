// App entry: renderer, camera, stage, car and UI wiring.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCar } from './car/car.js';
import { PAINTS, COPPER } from './car/palette.js';
import { WHEEL_STYLES } from './car/wheels.js';
import { DIM } from './car/profile.js';
import { createStage, ENV_LIST } from './env.js';
import { importModel } from './loader.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- Renderer / scene ------------------------------------------------------------
const canvas = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2.2;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.495;
controls.enablePan = false;
controls.autoRotateSpeed = 1.1;

const stage = createStage(renderer, scene);
stage.apply('studio');

// ---- Car -------------------------------------------------------------------------
const car = createCar();
scene.add(car.root);
let custom = null;                              // imported GLB, when loaded

// ---- Camera presets --------------------------------------------------------------
const VIEWS = {
  front34: { p: [5.6, 1.7, 4.7], t: [0, 0.62, 0], fov: 32 },
  front: { p: [8.0, 1.0, 0.01], t: [0, 0.62, 0], fov: 32 },
  side: { p: [0.01, 1.0, 8.6], t: [0, 0.62, 0], fov: 32 },
  rear34: { p: [-5.6, 1.7, -4.7], t: [0, 0.62, 0], fov: 32 },
  rear: { p: [-8.0, 1.2, 0.01], t: [0, 0.7, 0], fov: 32 },
  top: { p: [0.01, 11.5, 0.02], t: [0, 0, 0], fov: 32 },
  wheel: { p: [1.15, 0.5, 2.5], t: [1.34, 0.34, 0.8], fov: 32 },
  interior: { p: [-0.42, 1.24, -0.37], t: [3, 0.98, -0.16], fov: 66, inside: true },
};
let tween = null;
let inside = false;

function setView(name, instant = false) {
  const v = VIEWS[name];
  if (!v) return;
  const to = { p: new THREE.Vector3(...v.p), t: new THREE.Vector3(...v.t), fov: v.fov };
  if (v.inside) {
    // Look-around mode: orbit a point 1 cm in front of the eye.
    const dir = to.t.clone().sub(to.p).normalize();
    to.t = to.p.clone().addScaledVector(dir, 0.01);
  }
  enterMode(!!v.inside);
  tween = { from: { p: camera.position.clone(), t: controls.target.clone(), fov: camera.fov }, to, k: instant ? 1 : 0, dur: v.inside ? 0.9 : 1.1 };
  if (instant) stepTween(0);
  $$('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
}
let envBeforeCabin = null;
function applyEnv(id) {
  stage.apply(id);
  $$('[data-env]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.env === id)));
  const reflect = $('[data-toggle="reflect"]');
  const indoor = ENV_LIST.find((e) => e.id === id).indoor;
  reflect.disabled = !indoor;
  car.setDarkScene(indoor);
}
function enterMode(isInside) {
  if (isInside === inside) return;
  inside = isInside;
  // Seen from inside, a dark studio is just a black void: borrow the daylight scene for the cabin view.
  if (isInside && ENV_LIST.find((e) => e.id === stage.id).indoor) {
    envBeforeCabin = stage.id; applyEnv('day');
    toast('Cabin view uses Daylight so you can see out of the windows');
  } else if (!isInside && envBeforeCabin) { applyEnv(envBeforeCabin); envBeforeCabin = null; }
  controls.minDistance = isInside ? 0.001 : 2.2;
  controls.maxDistance = isInside ? 0.05 : 16;
  controls.enableZoom = !isInside;
  controls.rotateSpeed = isInside ? -0.45 : 1;
  controls.maxPolarAngle = isInside ? Math.PI * 0.92 : Math.PI * 0.495;
  controls.minPolarAngle = isInside ? Math.PI * 0.08 : 0;
  if (isInside) { controls.autoRotate = false; syncToggle('rotate', false); }
}
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function stepTween(dt) {
  if (!tween) return;
  tween.k = Math.min(1, tween.k + dt / tween.dur);
  const e = ease(tween.k);
  camera.position.lerpVectors(tween.from.p, tween.to.p, e);
  controls.target.lerpVectors(tween.from.t, tween.to.t, e);
  const fov = THREE.MathUtils.lerp(tween.from.fov, tween.to.fov, e);
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (tween.k >= 1) tween = null;
}
controls.addEventListener('start', () => { tween = null; });

// ---- Resize ----------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // On desktop the panel covers the right-hand side: shift the view so the car sits in the free area.
  const panelW = window.matchMedia('(min-width: 761px)').matches ? $('#panel').offsetWidth + 16 : 0;
  if (panelW) camera.setViewOffset(w, h, panelW / 2, 0, w, h); else camera.clearViewOffset();
  // keep the whole car in frame on narrow (portrait) screens
  camera.zoom = camera.aspect < 0.9 ? Math.max(0.32, camera.aspect * 0.72) : 1;
  camera.updateProjectionMatrix();
  stage.resize(w, h, pr);
}
window.addEventListener('resize', resize);
resize();

// ---- UI ----------------------------------------------------------------------------
function syncToggle(id, on) { const el = $(`[data-toggle="${id}"]`); if (el) el.setAttribute('aria-pressed', String(on)); }
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), ms);
}

// Paint
const state = { hex: '#53585d', finish: 'metallic', caliper: COPPER };
function applyPaint() {
  car.setPaint(state.hex, state.finish);
  if (custom) custom.setPaint(state.hex, state.finish);
  $('#paintName').textContent = (PAINTS.find((p) => p.hex === state.hex)?.name) || 'Custom colour';
  $('#customColor').value = state.hex;
  $$('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hex === state.hex)));
  $$('[data-finish]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.finish === state.finish)));
}
const swatches = $('#swatches');
for (const p of PAINTS) {
  const b = document.createElement('button');
  b.className = 'swatch'; b.type = 'button';
  b.style.setProperty('--c', p.hex);
  b.dataset.hex = p.hex; b.title = p.name; b.setAttribute('aria-label', p.name);
  b.addEventListener('click', () => { state.hex = p.hex; state.finish = p.finish; applyPaint(); });
  swatches.append(b);
}
$('#customColor').addEventListener('input', (e) => { state.hex = e.target.value; applyPaint(); });
$$('[data-finish]').forEach((b) => b.addEventListener('click', () => { state.finish = b.dataset.finish; applyPaint(); }));

// Wheels
const wheelBox = $('#wheelStyles');
for (const [key, w] of Object.entries(WHEEL_STYLES)) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = w.label; b.dataset.wheel = key;
  b.addEventListener('click', () => { car.setWheelStyle(key); $$('[data-wheel]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  wheelBox.append(b);
}
wheelBox.firstChild.setAttribute('aria-pressed', 'true');
const CALIPERS = [['Copper', COPPER], ['Red', 0xc4161c], ['Black', 0x151515], ['Blue', 0x1f5fbf]];
const calBox = $('#calipers');
for (const [name, hex] of CALIPERS) {
  const b = document.createElement('button');
  b.className = 'swatch small'; b.type = 'button'; b.title = name + ' calipers'; b.setAttribute('aria-label', name + ' brake calipers');
  b.style.setProperty('--c', '#' + new THREE.Color(hex).getHexString());
  b.addEventListener('click', () => { car.setCaliper(hex); $$('#calipers .swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  calBox.append(b);
}
calBox.firstChild.setAttribute('aria-pressed', 'true');

// Lights, glass, plate
$$('[data-lights]').forEach((b) => b.addEventListener('click', () => {
  car.setLights(b.dataset.lights);
  $$('[data-lights]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
$('#glass').addEventListener('input', (e) => car.setGlass(+e.target.value));
$('#plate').addEventListener('input', (e) => car.setPlate(e.target.value));

// Scene
const envBox = $('#envs');
for (const e of ENV_LIST) {
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button'; b.textContent = e.name; b.dataset.env = e.id;
  b.addEventListener('click', () => { envBeforeCabin = null; applyEnv(e.id); });
  envBox.append(b);
}
envBox.firstChild.setAttribute('aria-pressed', 'true');
const toggles = {
  rotate: (on) => { controls.autoRotate = on; if (on && inside) setView('front34'); },
  reflect: (on) => stage.setReflective(on),
  spin: (on) => car.setSpin(on),
};
$$('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  toggles[b.dataset.toggle]?.(on);
}));

// Views
$$('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// Photo: show a preview with a download link (some embedded viewers block direct downloads)
const dlg = $('#photoDlg');
function closePhoto() { dlg.hidden = true; $('#photoImg').removeAttribute('src'); }
$('#photo').addEventListener('click', () => {
  renderer.render(scene, camera);
  const url = canvas.toDataURL('image/png');
  $('#photoImg').src = url;
  $('#photoDl').href = url;
  dlg.hidden = false;
  $('#photoClose').focus();
});
$('#photoClose').addEventListener('click', closePhoto);
dlg.addEventListener('click', (e) => { if (e.target === dlg) closePhoto(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) closePhoto(); });

// Panel toggle (mobile)
$('#panelToggle').addEventListener('click', () => {
  const open = document.body.classList.toggle('panel-open');
  $('#panelToggle').setAttribute('aria-expanded', String(open));
});

// Specs
$('#dims').textContent = `${Math.round(DIM.length * 1000).toLocaleString('en')} × ${Math.round(DIM.width * 1000).toLocaleString('en')} × ${Math.round(DIM.height * 1000).toLocaleString('en')} mm`;
$('#wb').textContent = `${Math.round(DIM.wheelbase * 1000).toLocaleString('en')} mm`;

// Custom model import
const fileInput = $('#modelFile');
async function loadFile(file) {
  if (!file) return;
  try {
    toast('Loading ' + file.name + '…', 8000);
    const m = await importModel(file, { length: DIM.length });
    if (custom) scene.remove(custom.root);
    custom = m;
    custom.setPaint(state.hex, state.finish);
    scene.add(custom.root);
    car.root.visible = false;
    document.body.classList.add('has-custom');
    $('#modelName').textContent = file.name;
    toast(`Loaded ${file.name} — ${m.paintMaterials} paint material${m.paintMaterials === 1 ? '' : 's'} recolourable`);
  } catch (err) {
    console.error(err);
    toast('Could not load that file: ' + (err.message || err), 6000);
  }
}
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
$('#modelBuiltin').addEventListener('click', () => {
  if (custom) { scene.remove(custom.root); custom = null; }
  car.root.visible = true;
  document.body.classList.remove('has-custom');
  fileInput.value = '';
});
$('#modelFlip').addEventListener('click', () => { if (custom) custom.root.rotation.y += Math.PI; });
for (const ev of ['dragenter', 'dragover']) window.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
for (const ev of ['dragleave', 'drop']) window.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.remove('dragging'); });
window.addEventListener('drop', (e) => loadFile(e.dataTransfer?.files?.[0]));

// ---- Go ----------------------------------------------------------------------------
applyPaint();
setView('front34', true);
document.body.classList.add('ready');

const timer = new THREE.Timer();
function frame(ts) {
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 0.1);
  stepTween(dt);
  car.update(dt);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging / automated screenshots.
window.__app = { setView, car, scene, camera, controls, stage, renderer };
