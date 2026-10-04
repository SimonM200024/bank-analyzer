# Cupra Formentor VZ2 · 3D preview

An interactive 3D viewer for a 2022 **Cupra Formentor VZ2**, built with [three.js](https://threejs.org/).
No build step and no dependencies to install: three.js is vendored in `vendor/`.

## Run it

ES modules need an HTTP server (opening `index.html` straight from disk won't work):

```bash
cd formentor-3d
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

The folder is plain static files, so it also works on GitHub Pages or any static host.

## What you can do

| | |
|---|---|
| **Look around** | Drag to orbit, scroll / pinch to zoom. Preset views: front ¾, front, side, rear ¾, rear, top, wheel close-up and a driver's-seat **Cabin** view. |
| **Paint** | 9 approximate Formentor colours, a free colour picker, and Metallic / Gloss / Matte finishes. |
| **Wheels** | Three 19″ designs (245/40 R19), brake caliper colours, and a "Roll" toggle that spins the wheels. |
| **Lights** | Off, daytime running lights, or full headlights / tail-lights. |
| **Glass & plate** | Window tint slider and an editable number plate. |
| **Scenes** | Studio (reflective floor), Daylight, Sunset, Night street, plus a turntable. |
| **Photo** | Saves a PNG of the current view. |
| **Your own model** | Drop a `.glb` onto the page to view *your* car model instead; paint controls recolour materials named like `paint` / `body`. Use *Flip direction* if it faces backwards. |

## About the model

There is no official CAD data for the Formentor, so the car is **built procedurally in code**
from the real dimensions (4,450 × 1,839 × 1,511 mm, 2,680 mm wheelbase, 245/40 R19 tyres) —
it is an approximation of the shape, not an exact replica, and paint colours are approximate.
If you want photo-real accuracy, load a detailed `.glb` of the car (for example one you own
or have a licence for) with **Your own model**.

How it works, in `js/car/`:

- `profile.js` – side-profile / plan-view curves of the body and the cross-section "ring" that is lofted along the car.
- `body.js` – turns those rings into the body mesh (wheel arches and window openings are cut into it) and drapes decals over it.
- `details.js` – glass, lights, grille, trim, mirrors, exhausts, plate, all projected onto the body surface.
- `wheels.js`, `interior.js`, `car.js` – wheels & brakes, a simple cabin, and the assembled car with its controls.

To tweak the shape, edit the point tables at the top of `profile.js` (height, width, belt-line, roof-line curves).

## Licences

three.js is MIT-licensed (`vendor/three/LICENSE`). "Cupra" and "Formentor" are trademarks of their respective owners; this is an unofficial fan/owner project.
