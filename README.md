# 🚀 Orbital Forge

A 3D rocket-building and orbital-physics sandbox that runs in the browser. You build a rocket from parts, launch it from Verdan, reach orbit and fly to the moon Lumen. It's pure HTML, CSS and JavaScript (with Three.js included in `js/vendor/`) and has no build step, so it can be hosted on GitHub Pages as-is.

## Features

- **Full 3D.** Rockets are built from lathed 3D parts with fins, legs and engine bells. Verdan and Lumen are textured spheres with clouds, an atmosphere glow and polar ice. Near the ground you fly over real 3D terrain with oceans. There's a sky that fades to stars as you climb, a sun, and 3D exhaust plumes, smoke and explosions. Drag to orbit the camera anywhere.
- **Rocket builder.** 18 parts: capsules, probe cores, four sizes of tank, five engines (including a solid booster and a vacuum engine), decouplers, an adapter, a nose cone, fins, a parachute and landing legs. The builder shows Δv and TWR for each stage, warns you about problems, and saves your designs locally.
- **Physics.**
  - Patched-conic gravity with a velocity-Verlet integrator, so orbits stay stable even at 100,000× warp.
  - An atmosphere with exponential density.
  - Drag that depends on angle of attack, and aerodynamic stability from the centre of pressure versus the centre of mass. Fins really matter.
  - Engine efficiency (Isp) that changes with air pressure, and thrust vectoring.
  - A rotating planet, so launching east gives you about 175 m/s for free.
- **Map view.** Shows your predicted trajectory, Ap/Pe markers, Lumen encounters with their periapsis, and where you will impact. You can focus the map on the ship, Verdan or Lumen.
- **SAS.** Hold, prograde, retrograde, radial up and radial down, plus fly-by-wire steering.
- **Two worlds.** Verdan has oceans, coastlines, mountains and a launch pad. Lumen has its own terrain. You can splash down in the sea, land with legs, or deploy a parachute.
- **Effects.** Exhaust plumes that widen in vacuum, smoke trails, launch clouds, reentry plasma, explosions, falling debris and procedural sound.
- **Missions.** Nine milestones, from *First Flight* to *Homecoming*. Your progress is saved in the browser.
- **Mobile friendly.** Touch controls, a draggable throttle and pinch to zoom.

## Controls

| Key | Action |
|---|---|
| Space | Stage |
| A / D (or ← →) | Rotate |
| Shift / Ctrl, W / S | Throttle up / down |
| Z / X | Full / cut throttle |
| T | Toggle SAS hold |
| 1 2 3 4 | SAS prograde / retrograde / up / down |
| M | Map view |
| , / . | Time warp down / up |
| P | Parachute |
| Drag (mouse or finger) | Orbit the camera |
| Mouse wheel, pinch, + / − | Zoom |
| V | Reset camera |
| Esc | Pause menu |

## Put it on GitHub Pages

1. Create a new repository on GitHub, for example `orbital-forge`.
2. Upload everything in this folder, keeping the folder structure (`index.html`, `css/`, `js/`, `assets/` and the rest).
3. In the repository, open **Settings → Pages**. Under *Source*, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, then save.
4. After about a minute the game will be live at `https://<your-username>.github.io/orbital-forge/`.

To run it locally, use any static server, for example `python3 -m http.server`, then open http://localhost:8000. Opening the file directly from disk won't work, because browsers block ES modules on `file://`.

## Project layout

```
index.html            page + HUD markup
css/style.css         all styling (desktop + mobile)
js/main.js            app wiring, input, HUD
js/flight.js          flight simulation, staging, SAS, landing, particles, missions
js/physics.js         planet/moon, gravity, atmosphere, terrain, orbit maths, trajectory prediction
js/vessel.js          rocket model: mass, CoM, inertia, engines, fuel flow, stage analysis
js/parts.js           part catalogue + preset rockets
js/render3d.js        Three.js renderer: planets, terrain patch, water, sky, rockets, particles, map view
js/rocketmesh.js      builds 3D rocket meshes from parts (lathe profiles + fins/legs/plumes)
js/shaders.js         plume, particle, sky and atmosphere shaders
js/preview3d.js       spinning 3D preview in the builder
js/hud.js             attitude indicator + number formatting
js/vendor/three.min.js  Three.js r187 (MIT, bundled so the site has no external dependencies)
js/builder.js         rocket editor UI
js/audio.js           procedural sound
js/missions.js        mission list + saved progress
js/textures.js        texture loader
assets/textures/        planet/moon/cloud maps, stars, ground detail, particles, launch tower lattice
assets/textures/parts/  2D part icons (builder)
assets/textures/skins/  3D part skins (wrapped around each part)
tools/gen_textures.py     2D textures (needs numpy + Pillow)
tools/gen_3d_textures.py  3D maps and skins
```

## Modding

- **New part:** add an entry to `PARTS` in `js/parts.js`. Add an icon at `assets/textures/parts/<id>.png` and a skin at `assets/textures/skins/<id>.png`. The skin wraps once around the part, with its top row at the top of the part. Give it a shape by adding a profile function to `PROFILES` in `js/rocketmesh.js`; it defaults to a plain cylinder.
- **New preset rocket:** add a list of part ids to `PRESETS`.
- **Retexture:** edit the images directly (the planet and moon maps are standard equirectangular images), or tweak the generator scripts in `tools/` and run them with `assets/textures` as the argument.
- **Change the planets:** edit `P` (Verdan) and `M` (Lumen) in `js/physics.js`. You can change radius, gravity, atmosphere and rotation.

Orbital Forge is an original game inspired by the rocket-sandbox genre. It is not affiliated with any other game.

## How the 3D works

Flight physics runs in Verdan's equatorial plane. Every orbit, the trip to Lumen and every landing happens in that plane, which is how most moon missions in rocket games work anyway. The renderer draws the whole system in 3D around a floating origin centred on your ship, and it uses a logarithmic depth buffer so a 1 m part and a 600 km planet render correctly together. Near the surface, a high-detail terrain patch is generated on the fly. Along the flight path it matches the physics ground exactly, and away from the path it adds extra hills and coastlines.
