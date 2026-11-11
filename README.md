# 🚀 Orbital Forge

A 3D rocket-building and orbital-physics sandbox that runs in the browser. You build a rocket from parts, launch it from Verdan, reach orbit, land on the moon Lumen and travel to the other planets of the Solara system. It's pure HTML, CSS and JavaScript (with Three.js included in `js/vendor/`) and has no build step, so it can be hosted on GitHub Pages as-is.

## Features

- **Full 3D.** Rockets are built from lathed 3D parts with fins, legs and engine bells. Verdan and Lumen are textured spheres with clouds, an atmosphere glow and polar ice. Near the ground you fly over real 3D terrain with oceans. There's a sky that fades to stars as you climb, a sun, and 3D exhaust plumes, smoke and explosions. Drag to orbit the camera anywhere.
- **Rocket builder.** 29 parts: capsules, probe cores, a gyro ring, five sizes of tank, seven engines (including a nuclear engine and two solid boosters), decouplers, an adapter, nose cones, fins, parachutes, landing legs and solar panels. The builder shows Δv and TWR for every burn, warns you about problems, and saves your designs locally.
- **Side mounts.** Select a part, press **⇔ Sides**, and whatever you tap is mounted on both sides of it: boosters with nose cones, drop tanks with their own engines, winglets, solar panels or radial parachutes. Side boosters fire with their stage and drop away when you press STAGE.
- **A whole solar system.** The star Solara, five planets and three moons:
  - **Cinder**: scorched airless rock close to the star.
  - **Aurea**: heavy gravity and a thick golden atmosphere.
  - **Verdan**: home, with its moon **Lumen**.
  - **Ferra**: red desert with thin air, and its tiny moon **Pebble**.
  - **Jovara**: a gas giant with no ground, and its frozen moon **Glacia**.
- **Trip planning.** Tap any planet or moon on the map to target it. A guidance line shows when the launch window opens, roughly how big the burn is, how long the trip takes, and your closest approach. Time warp goes up to 1,000,000× and drops automatically when you enter a new sphere of influence.
- **Physics.**
  - Patched-conic gravity with a velocity-Verlet integrator, so orbits stay stable even at 100,000× warp.
  - An atmosphere with exponential density.
  - Drag that depends on angle of attack, and aerodynamic stability from the centre of pressure versus the centre of mass. Fins really matter.
  - Engine efficiency (Isp) that changes with air pressure, and thrust vectoring.
  - A rotating planet, so launching east gives you about 175 m/s for free.
- **Map view.** Shows your predicted trajectory, Ap/Pe markers, Lumen encounters with their periapsis, and where you will impact. You can focus the map on the ship, Verdan or Lumen.
- **SAS.** Hold, prograde, retrograde, radial up and radial down, plus fly-by-wire steering.
- **Landings.** Every rocky world has its own 3D terrain, sky colour and gravity. You can splash down in Verdan's sea, land on legs, or use parachutes wherever there is air.
- **Effects.** Exhaust plumes that widen in vacuum, smoke trails, launch clouds, reentry plasma, explosions, falling debris and procedural sound.
- **Missions.** 19 milestones, from *First Flight* to *Interplanetary Hero*. Your progress is saved in the browser.
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
| M | Map view (tap a body to target it; FOCUS and TARGET buttons cycle) |
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
js/physics.js         the Solara system: bodies, gravity, atmosphere, terrain, orbit maths, trajectory prediction, transfer windows
js/vessel.js          rocket model: core stack + side groups, mass, CoM, inertia, engines, fuel flow, stage analysis
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
tools/gen_new_assets.py   icons, skins and planet maps added with the solar-system update
```

## Modding

- **New part:** add an entry to `PARTS` in `js/parts.js`. Add an icon at `assets/textures/parts/<id>.png` and a skin at `assets/textures/skins/<id>.png`. The skin wraps once around the part, with its top row at the top of the part. Give it a shape by adding a profile function to `PROFILES` in `js/rocketmesh.js`; it defaults to a plain cylinder.
- **New preset rocket:** add a list to `PRESETS`, top to bottom. An entry is a part id, or `{ id: 'tank_l', side: ['nose', 'srb_bolt'] }` to hang a stack on both sides of that part.
- **Retexture:** edit the images directly (the planet and moon maps are standard equirectangular images), or tweak the generator scripts in `tools/` and run them with `assets/textures` as the argument.
- **Change or add planets:** edit the body list at the top of `js/physics.js`. Each body has a parent, orbit radius, gravity (`GM`), radius, optional atmosphere, colours and a texture map in `assets/textures/`. Add it to `BODIES` after its parent.

Orbital Forge is an original game inspired by the rocket-sandbox genre. It is not affiliated with any other game.

## How the 3D works

Flight physics runs in one plane: all planets and moons orbit in it, and so does your ship. Gravity uses patched conics, so only the body whose sphere of influence you are in pulls on you. The renderer draws the whole system in 3D around a floating origin centred on your ship, and it uses a logarithmic depth buffer so a 1 m part and a 600 km planet render correctly together. Near the surface, a high-detail terrain patch is generated on the fly. Along the flight path it matches the physics ground exactly, and away from the path it adds extra hills and coastlines.
