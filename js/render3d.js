// Three.js renderer. Physics happens in the system's orbital plane (z = 0);
// everything is drawn in full 3D around a floating origin centred on the camera target.
import * as THREE from './vendor/three.min.js';
import { P, SUN, BODIES, LAUNCH_TH, PAD_H, bodyPos, bodyRot, terrain3, wrapA, soiBody } from './physics.js';
import { buildRocket, updateRocket, rocketKey, makeEnv } from './rocketmesh.js';
import { skyMaterial, atmoMaterial, particleMaterial } from './shaders.js';
import { fmtDist } from './hud.js';

const TL = new THREE.TextureLoader();
function tex(path, opts = {}) {
  const t = TL.load('assets/textures/' + path);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  t.anisotropy = 8;
  return t;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const V = new THREE.Vector3();
const padDip = (b, th, lat) => (b === P && Math.hypot(wrapA(th - LAUNCH_TH), lat) < 0.0025 ? 0.6 : 0);

const NT = 201, NP = 101; // terrain patch grid
const GEO_LO = new THREE.SphereGeometry(1, 96, 48);
let GEO_HI = null; // built the first time the camera gets close to a body
const geoHi = () => GEO_HI || (GEO_HI = new THREE.SphereGeometry(1, 384, 192));

export class Renderer3D {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.setClearColor(0x000000);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    try { this.env = makeEnv(r); } catch (e) { this.env = null; }
    let q = null;
    try { q = localStorage.getItem('of_gfx'); } catch (e) { /* storage unavailable */ }
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.quality = q === 'high' || q === 'low' ? q : coarse ? 'low' : 'high';
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 5e12);
    scene.add(this.camera);
    this.fog = new THREE.FogExp2(0xa9d4ff, 0);
    scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x403424, 0.55);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x5a6480, 1.5);
    scene.add(this.amb);
    this.engineLight = new THREE.PointLight(0xffa040, 0, 120, 1.2);
    scene.add(this.engineLight);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    const starTex = tex('stars.png', { repeat: [8, 4] });
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
    this.stars.scale.setScalar(4e9);
    this.stars.renderOrder = -10;
    this.stars.frustumCulled = false;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial());
    this.sky.scale.setScalar(3e9);
    this.sky.renderOrder = -9;
    this.sky.frustumCulled = false;
    scene.add(this.stars, this.sky);

    this.detail = tex('ground_moon.png', { repeat: [1, 1] });
    this.bodies = BODIES.map((b) => this.makeBody(b));
    this.byId = Object.fromEntries(this.bodies.map((B) => [B.b.id, B]));
    for (const B of this.bodies) this.makeRings(B);
    this.makePad();
    this.makeParticles();
    this.makeMapLine();
    this.makeChute();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame.png'), color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.visible = false;
    scene.add(this.glow);
    this.vGroups = new Map();
    this.bodyScreen = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.W = w; this.H = h;
    this.dpr = Math.min(this.quality === 'high' ? 2 : 1.25, window.devicePixelRatio || 1);
    this.r.setPixelRatio(this.dpr);
    this.r.setSize(w, h, false);
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 'high': sharper image and real-time shadows. 'low': faster, for phones and older computers. */
  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('of_gfx', q); } catch (e) { /* ignore */ }
    this.resize();
  }

  // ------------------------------------------------------------------ construction
  makeBody(b) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const margin = b.gas || b.star ? 0 : b.R * (1 - Math.cos(Math.PI / 384)) + 10;
    const mat = b.star
      ? new THREE.MeshBasicMaterial({ map: tex(b.tex), fog: false })
      : new THREE.MeshStandardMaterial({ map: tex(b.tex), roughness: b.ocean ? 0.8 : 1, metalness: 0 });
    if (!b.star && !b.gas && b.id !== 'aurea') { mat.bumpMap = mat.map; mat.bumpScale = b.R * (b.ocean ? 0.005 : 0.02); } // surface relief from the map's brightness
    const sphere = new THREE.Mesh(GEO_LO, mat);
    sphere.rotation.x = Math.PI / 2;
    sphere.scale.setScalar(b.R - margin);
    spin.add(sphere);
    const B = { b, root, spin, sphere, patch: null, water: null, pos: { x: 0, y: 0 } };
    if (b.clouds) {
      B.cloudSpin = new THREE.Group();
      const cm = new THREE.Mesh(GEO_LO, new THREE.MeshStandardMaterial({ map: tex('clouds_map.png'), transparent: true, depthWrite: false, roughness: 1 }));
      cm.rotation.x = Math.PI / 2;
      cm.scale.setScalar(b.R + 4500);
      B.cloudSpin.add(cm);
      B.clouds = cm;
      root.add(B.cloudSpin);
    }
    if (b.atmo) {
      B.atmo = new THREE.Mesh(GEO_LO, atmoMaterial(b.atmoColor));
      B.atmo.scale.setScalar(b.R + b.atmo.height);
      root.add(B.atmo);
    }
    if (b.star) {
      B.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame.png'), color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      B.glow.renderOrder = -8;
      root.add(B.glow);
    }
    this.scene.add(root);
    return B;
  }

  /** Orbit path (drawn around the parent) and sphere-of-influence ring, both only shown on the map. */
  makeRings(B) {
    const b = B.b;
    if (!b.parent) return;
    const circle = (r, n, color, opacity) => {
      const pos = new Float32Array((n + 1) * 3);
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pos[i * 3] = r * Math.cos(a); pos[i * 3 + 1] = r * Math.sin(a); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: false, depthWrite: false }));
      l.frustumCulled = false;
      l.visible = false;
      return l;
    };
    B.orbitRing = circle(b.orbitR, 2048, new THREE.Color(b.color), 0.45);
    this.byId[b.parent.id].root.add(B.orbitRing);
    B.soiRing = circle(b.soi, 256, 0xffb84f, 0.3);
    B.root.add(B.soiRing);
  }

  makePatch(mat, full) {
    const n = NT * NP;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    if (full) {
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    }
    const idx = new Uint32Array((NT - 1) * (NP - 1) * 6);
    let k = 0;
    for (let j = 0; j < NP - 1; j++) for (let i = 0; i < NT - 1; i++) {
      const a = j * NT + i, b = a + 1, c = a + NT, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = c;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, g, state: null };
  }

  ensurePatch(B) {
    if (B.patch) return;
    B.patch = this.makePatch(new THREE.MeshStandardMaterial({ map: this.detail, vertexColors: true, roughness: 0.95, metalness: 0 }), true);
    B.patch.mesh.receiveShadow = true;
    B.spin.add(B.patch.mesh);
    if (B.b.ocean) {
      B.water = this.makePatch(new THREE.MeshStandardMaterial({ color: 0x1b5c9e, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86 }), false);
      B.spin.add(B.water.mesh);
    }
  }

  rebuildPatch(B, thc, span) {
    const b = B.b, R = b.R;
    const tile = 40;
    thc = Math.round(thc / (tile / R)) * (tile / R);
    const ax = R * Math.cos(thc), ay = R * Math.sin(thc);
    const latSpan = Math.min(span * 0.7, 0.5);
    const pal = b.pal, hMax = Math.max(1, b.maxTerrain);
    const doRow = (patch, water) => {
      const pos = patch.g.attributes.position.array;
      const col = !water && patch.g.attributes.color.array;
      const uv = !water && patch.g.attributes.uv.array;
      let k = 0, c = 0, u = 0;
      for (let j = 0; j < NP; j++) {
        const x = (j / (NP - 1)) * 2 - 1;
        const lat = Math.sign(x) * Math.abs(x) ** 1.8 * latSpan;
        const cl = Math.cos(lat), sl = Math.sin(lat);
        for (let i = 0; i < NT; i++) {
          const y = (i / (NT - 1)) * 2 - 1;
          const th = thc + Math.sign(y) * Math.abs(y) ** 1.8 * span;
          const h = water ? 0 : terrain3(b, th, lat) - padDip(b, th, lat);
          const r = R + h;
          pos[k++] = r * cl * Math.cos(th) - ax;
          pos[k++] = r * cl * Math.sin(th) - ay;
          pos[k++] = r * sl;
          if (!water) {
            uv[u++] = ((th - thc) * R) / tile; uv[u++] = (lat * R) / tile;
            let cr, cg, cb;
            if (b === P) {
              if (h < -4) { cr = 0.62; cg = 0.56; cb = 0.4; }
              else if (h < 25) { cr = 0.95; cg = 0.88; cb = 0.64; }
              else if (h < 1500) { const q = clamp(h / 1500, 0, 1); cr = 0.42 - 0.12 * q; cg = 0.72 - 0.2 * q; cb = 0.28 - 0.06 * q; }
              else if (h < 2700) { cr = 0.62; cg = 0.58; cb = 0.5; }
              else { cr = 1.6; cg = 1.62; cb = 1.7; }
            } else {
              const q = clamp(h / hMax, 0, 1), n = 0.9 + 0.1 * Math.sin(th * 300 + lat * 410);
              cr = (pal.lo[0] + (pal.hi[0] - pal.lo[0]) * q) * n; cg = (pal.lo[1] + (pal.hi[1] - pal.lo[1]) * q) * n; cb = (pal.lo[2] + (pal.hi[2] - pal.lo[2]) * q) * n;
            }
            col[c++] = cr; col[c++] = cg; col[c++] = cb;
          }
        }
      }
      patch.g.attributes.position.needsUpdate = true;
      patch.g.computeVertexNormals();
      if (!water) {
        // rocky slopes
        const nor = patch.g.attributes.normal.array;
        const rk = b === P ? [0.55, 0.5, 0.45] : pal.rock;
        for (let q = 0, n = NT * NP; q < n; q++) {
          const px = pos[q * 3] + ax, py = pos[q * 3 + 1] + ay, pz = pos[q * 3 + 2];
          const L = Math.hypot(px, py, pz);
          const d = (nor[q * 3] * px + nor[q * 3 + 1] * py + nor[q * 3 + 2] * pz) / L;
          const s = clamp((0.93 - d) * 6, 0, 1);
          if (s > 0) { col[q * 3] += (rk[0] - col[q * 3]) * s; col[q * 3 + 1] += (rk[1] - col[q * 3 + 1]) * s; col[q * 3 + 2] += (rk[2] - col[q * 3 + 2]) * s; }
        }
        patch.g.attributes.color.needsUpdate = true;
        patch.g.attributes.uv.needsUpdate = true;
      }
      patch.mesh.position.set(ax, ay, 0);
    };
    doRow(B.patch, false);
    if (B.water) doRow(B.water, true);
    B.patch.state = { thc, span };
  }

  makePad() {
    const pad = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8c8c90, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(26, 3, 22), concrete);
    slab.position.y = -1.5;
    const trench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 22), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 }));
    trench.position.y = 0.01;
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe6b828, roughness: 0.8 });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(26, 0.06, 0.6), stripeMat); s1.position.set(0, 0.02, 10.4);
    const s2 = s1.clone(); s2.position.z = -10.4;
    const lat = tex('lattice.png', { repeat: [1, 1.6] });
    const towerMat = new THREE.MeshStandardMaterial({ map: lat, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 28, 2.4), towerMat);
    tower.position.set(0, 14, -8.5);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.5, metalness: 0.6 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 6.5), armMat); arm1.position.set(0, 9, -4.6);
    const arm2 = arm1.clone(); arm2.position.y = 18;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }));
    beacon.position.set(0, 28.6, -8.5);
    pad.add(slab, trench, s1, s2, tower, arm1, arm2, beacon);
    slab.receiveShadow = trench.receiveShadow = true;
    tower.castShadow = arm1.castShadow = arm2.castShadow = true;
    pad.position.set((P.R + PAD_H) * Math.cos(LAUNCH_TH), (P.R + PAD_H) * Math.sin(LAUNCH_TH), 0);
    pad.rotation.z = LAUNCH_TH - Math.PI / 2;
    this.byId[P.id].spin.add(pad);
    this.pad = pad;
  }

  makeParticles() {
    const mk = (map, additive) => {
      const N = 2400, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const pts = new THREE.Points(g, particleMaterial(map, additive));
      pts.frustumCulled = false;
      pts.renderOrder = additive ? 8 : 7;
      this.scene.add(pts);
      return { pts, g, N };
    };
    this.smoke = mk(tex('smoke.png'), false);
    this.fire = mk(tex('flame.png'), true);
  }

  makeMapLine() {
    const N = 8000;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.orbitLine = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, fog: false, depthTest: false }));
    this.orbitLine.frustumCulled = false;
    this.orbitLine.renderOrder = 20;
    this.orbitLineN = N;
    this.scene.add(this.orbitLine);
  }

  makeChute() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 8;
    const x = c.getContext('2d');
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#e8682a' : '#f2f0ea'; x.fillRect((i * 256) / 12, 0, 256 / 12 + 1, 8); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    this.canopy.visible = false;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.chuteLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd }));
    this.chuteLines.frustumCulled = false;
    this.chuteLines.visible = false;
    this.scene.add(this.canopy, this.chuteLines);
  }

  // ------------------------------------------------------------------ per-frame
  draw(f) {
    const v = f.vessel, t = f.t;
    for (const B of this.bodies) bodyPos(B.b, t, B.pos);
    const focusObj = v.dead && f.boomPos ? f.boomPos : v;
    let F = { x: focusObj.x, y: focusObj.y };
    if (f.map && f.mapFocus !== 'ship' && this.byId[f.mapFocus]) F = { x: this.byId[f.mapFocus].pos.x, y: this.byId[f.mapFocus].pos.y };
    this.F = F;

    // camera
    let e1, e2;
    if (!f.map) {
      const dc = this.byId[soiBody(focusObj.x, focusObj.y, t).id].pos;
      const ux = focusObj.x - dc.x, uy = focusObj.y - dc.y, L = Math.hypot(ux, uy) || 1;
      e2 = new THREE.Vector3(ux / L, uy / L, 0);
      e1 = new THREE.Vector3(uy / L, -ux / L, 0);
    } else { e1 = new THREE.Vector3(1, 0, 0); e2 = new THREE.Vector3(0, 1, 0); }
    const e3 = new THREE.Vector3(0, 0, 1);
    const c = f.map ? f.mapCam : f.cam;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const cam = this.camera;
    cam.position.set(0, 0, 0)
      .addScaledVector(e3, c.dist * cp * Math.cos(c.yaw))
      .addScaledVector(e1, c.dist * cp * Math.sin(c.yaw))
      .addScaledVector(e2, c.dist * sp);
    if (f.shake > 0.01 && !f.map) cam.position.add(V.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(f.shake * 0.6));
    cam.up.copy(e2);
    cam.lookAt(0, 0, 0);
    cam.near = f.map ? Math.max(1, c.dist * 1e-4) : 0.3;
    cam.updateProjectionMatrix();
    const camW = { x: F.x + cam.position.x, y: F.y + cam.position.y, z: cam.position.z };

    // sunlight comes from Solara (tilted a little out of the plane so shapes read well)
    const sunP = this.byId[SUN.id].pos;
    const sd = this.sunDir.set(sunP.x - camW.x, sunP.y - camW.y, -camW.z);
    const sunDist = sd.length();
    sd.divideScalar(sunDist || 1);
    this.sun.position.set(sd.x, sd.y, sd.z + 0.35).normalize().multiplyScalar(400);
    const shadows = this.quality === 'high' && !f.map;
    if (this.sun.castShadow !== shadows) this.sun.castShadow = shadows;
    if (shadows) {
      const S = Math.max(28, v.length * 1.4 + 12), sc = this.sun.shadow.camera;
      if (sc.right !== S) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 50; sc.far = 800; sc.updateProjectionMatrix(); }
    }

    // sky & atmosphere of whatever body the camera is at
    const cb = soiBody(camW.x, camW.y, t), cB = this.byId[cb.id];
    const cdx = camW.x - cB.pos.x, cdy = camW.y - cB.pos.y;
    const camR = Math.hypot(cdx, cdy, camW.z) || 1;
    const camAlt = camR - cb.R;
    const up = V.set(cdx / camR, cdy / camR, camW.z / camR).clone();
    const dayF = clamp(up.dot(sd) * 2.5 + 0.55, 0.14, 1);
    let skyF = 0;
    const sk = cb.sky || P.sky;
    if (cb.atmo && camAlt < cb.atmo.height) skyF = clamp(Math.exp(-Math.max(0, camAlt) / (cb.atmo.H * 2.5)) * 1.08, 0, 1) * dayF;
    const su = this.sky.material.uniforms;
    su.uUp.value.copy(up); su.uSun.value.copy(sd); su.uSkyF.value = skyF;
    su.uZenith.value.setRGB(sk.zen[0] * dayF, sk.zen[1] * dayF, sk.zen[2] * dayF);
    su.uHorizon.value.setRGB(sk.hor[0] * dayF, sk.hor[1] * dayF, sk.hor[2] * dayF);
    this.sky.visible = skyF > 0.005;
    this.stars.material.color.setScalar(clamp(1 - skyF * 1.8, 0, 1));
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    const thick = cb.atmo ? clamp(Math.sqrt(cb.atmo.rho0 / 1.225), 0.6, 2.5) : 1;
    this.fog.density = f.map || skyF <= 0 ? 0 : (skyF * thick) / (cb.atmo.H * 10 + Math.max(0, camAlt) * 5);
    this.fog.color.setRGB(sk.hor[0] * 0.94 * dayF, sk.hor[1] * 0.95 * dayF, sk.hor[2] * 0.95 * dayF);
    this.hemi.intensity = 0.25 + 0.45 * skyF;
    this.amb.intensity = 1.5 + 2.4 * (1 - clamp(up.dot(sd) * 2.5 + 0.55, 0, 1)); // extra fill light on the night side so you can still see to land

    // bodies
    for (const B of this.bodies) {
      const b = B.b, bp = B.pos;
      B.root.position.set(bp.x - F.x, bp.y - F.y, 0);
      const rot = bodyRot(b, t);
      B.spin.rotation.z = rot;
      const dx = camW.x - bp.x, dy = camW.y - bp.y;
      const dist = Math.hypot(dx, dy, camW.z), alt = dist - b.R;
      const near = dist < b.R * 6;
      const want = near ? geoHi() : GEO_LO;
      if (B.sphere.geometry !== want) B.sphere.geometry = want;
      if (B.clouds) {
        B.cloudSpin.rotation.z = rot * 1.08;
        const ca = clamp((alt - 3000) / 6000, 0, 1);
        B.clouds.material.opacity = ca;
        B.clouds.visible = ca > 0.01;
      }
      if (B.atmo) B.atmo.material.uniforms.uFade.value = clamp((alt - b.atmo.height * 0.35) / (b.atmo.height * 0.65), 0, 1);
      if (B.glow) B.glow.scale.setScalar(Math.max(b.R * 5, dist * 0.09));
      if (B.orbitRing) { B.orbitRing.visible = f.map; B.soiRing.visible = f.map; }
      // terrain patch near the camera
      const showPatch = !f.map && !b.gas && !b.star && alt < Math.min(b.R * 0.5, 220000);
      if (showPatch) this.ensurePatch(B);
      if (B.patch) {
        B.patch.mesh.visible = showPatch;
        if (B.water) B.water.mesh.visible = showPatch;
        if (showPatch) {
          const fth = Math.atan2(F.y - bp.y, F.x - bp.x) - rot;
          const span = clamp((Math.sqrt(2 * b.R * Math.max(alt, 40)) * 1.3 + 3000) / b.R, 0.004, 0.9);
          const st = B.patch.state;
          if (!st || Math.abs(wrapA(fth - st.thc)) > st.span * 0.1 || span / st.span > 1.4 || span / st.span < 0.6) this.rebuildPatch(B, fth, span);
        }
      }
    }
    this.pad.visible = !f.map;

    // vessels
    const press = f.press || 0;
    const live = new Set();
    const list = [...f.debris, v];
    for (const ves of list) {
      let g = this.vGroups.get(ves);
      const key = rocketKey(ves.parts);
      if (!g || g.userData.key !== key) {
        if (g) this.disposeGroup(g);
        g = buildRocket(ves.parts, this.env);
        this.scene.add(g);
        this.vGroups.set(ves, g);
      }
      g.position.set(ves.x - F.x, ves.y - F.y, 0);
      g.rotation.set(0, 0, ves.angle - Math.PI / 2);
      g.visible = !ves.dead;
      updateRocket(g, ves, ves === v ? press : 0.5, performance.now() / 1000);
      live.add(ves);
    }
    for (const [ves, g] of this.vGroups) if (!live.has(ves)) { this.disposeGroup(g); this.vGroups.delete(ves); }

    // engine glow light
    let fl = 0;
    for (const p of v.parts) fl += (p.flame || 0) * p.n;
    if (!v.dead && fl > 0) {
      const [bx, by] = v.worldPt(v.minS - 2, 0);
      this.engineLight.position.set(bx - F.x, by - F.y, 0);
      this.engineLight.intensity = Math.min(3, fl) * 400 * (0.9 + Math.random() * 0.2);
    } else this.engineLight.intensity = 0;

    this.updateChute(f, F);
    this.updateParticles(f, F, cam);
    this.updateGlow(f, F);
    this.updateMap(f, F);

    this.r.render(this.scene, cam);
    this.drawOverlay(f);
  }

  disposeGroup(g) {
    this.scene.remove(g);
    g.traverse((o) => { if (o.material && !o.material.isShaderMaterial && o.material.map && o.material.map.isCanvasTexture !== true) o.material.dispose(); });
  }

  updateChute(f, F) {
    const v = f.vessel;
    const p = !v.dead && v.parts.find((q) => q.def.type === 'chute' && q.chute === 1);
    this.canopy.visible = this.chuteLines.visible = !!p;
    if (!p) return;
    const open = Math.min(1, (f.t - p.chuteT) / 3);
    const top = v.worldPt(v.maxS, 0);
    const r = f.speedRef || { vx: 0, vy: -1 };
    let dx = -r.vx, dy = -r.vy;
    const L = Math.hypot(dx, dy);
    if (L < 0.5) { dx = Math.cos(v.angle); dy = Math.sin(v.angle); } else { dx /= L; dy /= L; }
    const many = v.parts.filter((q) => q.def.type === 'chute' && q.chute === 1).reduce((a, q) => a + q.n, 0);
    const dist = 3 + 9 * open, rad = (1 + 6.5 * open) * (many > 1 ? 1.35 : 1);
    const dir = new THREE.Vector3(dx, dy, 0);
    const cx = top[0] - F.x + dx * dist, cy = top[1] - F.y + dy * dist;
    this.canopy.position.set(cx, cy, 0);
    this.canopy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.canopy.scale.set(rad, rad * 0.8, rad);
    const pos = this.chuteLines.geometry.attributes.position.array;
    const rim = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rim.set(Math.cos(a) * Math.sin(Math.PI * 0.42), Math.cos(Math.PI * 0.42), Math.sin(a) * Math.sin(Math.PI * 0.42));
      rim.multiply(this.canopy.scale).applyQuaternion(this.canopy.quaternion).add(this.canopy.position);
      pos.set([top[0] - F.x, top[1] - F.y, 0, rim.x, rim.y, rim.z], i * 6);
    }
    this.chuteLines.geometry.attributes.position.needsUpdate = true;
  }

  updateParticles(f, F, cam) {
    const scale = (this.H * this.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.smoke.pts.material.uniforms.uScale.value = scale;
    this.fire.pts.material.uniforms.uScale.value = scale;
    let ns = 0, nf = 0;
    const S = this.smoke, Fi = this.fire;
    const sp = S.g.attributes.position.array, ss = S.g.attributes.aSize.array, sa = S.g.attributes.aAlpha.array, sc = S.g.attributes.aColor.array;
    const fp = Fi.g.attributes.position.array, fs = Fi.g.attributes.aSize.array, fa = Fi.g.attributes.aAlpha.array, fc = Fi.g.attributes.aColor.array;
    for (const p of f.particles) {
      const k = p.life / p.max;
      const size = p.size + p.grow * k;
      if (p.z0 === undefined) { // give the 2D particle sim some depth
        p.z0 = (Math.random() - 0.5) * p.size * 0.8;
        p.zv = (Math.random() - 0.5) * (p.kind === 'spark' ? 50 : p.grow * 0.9);
      }
      const zj = p.z0 + p.zv * p.life;
      if (p.kind === 'smoke') {
        if (ns >= S.N) continue;
        sp[ns * 3] = p.x - F.x; sp[ns * 3 + 1] = p.y - F.y; sp[ns * 3 + 2] = zj;
        ss[ns] = size; sa[ns] = (p.alpha || 0.5) * (1 - k) * Math.min(1, k * 8);
        const g = p.dark ? 0.22 : 0.88;
        sc[ns * 3] = g; sc[ns * 3 + 1] = g; sc[ns * 3 + 2] = g * 1.02;
        ns++;
      } else {
        if (nf >= Fi.N) continue;
        fp[nf * 3] = p.x - F.x; fp[nf * 3 + 1] = p.y - F.y; fp[nf * 3 + 2] = zj;
        const spark = p.kind === 'spark';
        fs[nf] = spark ? 0.6 : size; fa[nf] = (1 - k) * (spark ? 1 : 0.8);
        if (spark) { fc[nf * 3] = 1; fc[nf * 3 + 1] = 0.85; fc[nf * 3 + 2] = 0.5; }
        else if (p.hot) { fc[nf * 3] = 1; fc[nf * 3 + 1] = 0.55; fc[nf * 3 + 2] = 0.3; }
        else { fc[nf * 3] = 1; fc[nf * 3 + 1] = 1; fc[nf * 3 + 2] = 1; fa[nf] *= 0.45; }
        nf++;
      }
    }
    for (const [sys, n] of [[S, ns], [Fi, nf]]) {
      sys.g.setDrawRange(0, n);
      for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) sys.g.attributes[a].needsUpdate = true;
    }
  }

  updateGlow(f, F) {
    const v = f.vessel;
    if (v.dead || f.heat < 0.02 || f.map) { this.glow.visible = false; return; }
    const r = f.speedRef, sp = Math.hypot(r.vx, r.vy) || 1;
    this.glow.visible = true;
    this.glow.position.set(v.x - F.x + (r.vx / sp) * v.length * 0.45, v.y - F.y + (r.vy / sp) * v.length * 0.45, 0);
    this.glow.scale.setScalar(v.maxW * 5 * (0.6 + f.heat));
    this.glow.material.opacity = Math.min(1, f.heat * 1.4);
  }

  /** Predicted path. Each point is relative to the body it is near, so it is drawn around that body. */
  updateMap(f, F) {
    const show = f.map && !!f.pred;
    this.orbitLine.visible = show;
    if (!show) return;
    const pts = f.pred.pts;
    const pos = this.orbitLine.geometry.attributes.position.array;
    const col = this.orbitLine.geometry.attributes.color.array;
    const dom = f.domBody;
    let k = 0;
    const put = (q) => {
      const bp = this.byId[q.b.id].pos;
      pos[k * 3] = bp.x + q.x - F.x; pos[k * 3 + 1] = bp.y + q.y - F.y; pos[k * 3 + 2] = 0;
      if (q.b === dom) { col[k * 3] = 0.31; col[k * 3 + 1] = 0.82; col[k * 3 + 2] = 1; } else { col[k * 3] = 1; col[k * 3 + 1] = 0.72; col[k * 3 + 2] = 0.31; }
      k++;
    };
    for (let i = 1; i < pts.length && k < this.orbitLineN - 2; i++) {
      if (pts[i].b !== pts[i - 1].b) continue; // no line across a change of reference body
      put(pts[i - 1]); put(pts[i]);
    }
    this.orbitLine.geometry.setDrawRange(0, k);
    this.orbitLine.geometry.attributes.position.needsUpdate = true;
    this.orbitLine.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ 2D overlay (map labels)
  project(x, y, z = 0) {
    V.set(x - this.F.x, y - this.F.y, z).project(this.camera);
    if (V.z > 1 || V.z < -1) return null;
    return [((V.x + 1) / 2) * this.W, ((1 - V.y) / 2) * this.H];
  }

  label(p, text, color = '#fff', dot = true) {
    if (!p) return;
    const ctx = this.octx, [x, y] = p;
    if (dot) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = '600 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 7, y - 16, w + 8, 17);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 11, y - 3);
  }

  /** Nearest body marker to a screen point (map view), for tap-to-target. */
  pickBody(x, y) {
    let best = null, bd = 34;
    for (const s of this.bodyScreen) { const d = Math.hypot(s.x - x, s.y - y) - s.r; if (d < bd) { bd = d; best = s.b; } }
    return best;
  }

  drawOverlay(f) {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    this.bodyScreen = [];
    if (!f.map) return;
    const v = f.vessel;
    const pxPerM = this.H / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * f.mapCam.dist);
    const scr = {};
    for (const B of this.bodies) {
      const b = B.b, p = this.project(B.pos.x, B.pos.y);
      if (!p) continue;
      const rpx = b.R * pxPerM;
      scr[b.id] = p;
      const pp = b.parent && scr[b.parent.id];
      if (pp && b.parent !== SUN && Math.hypot(p[0] - pp[0], p[1] - pp[1]) < 22) continue; // moon hidden inside its planet's marker
      if (rpx < 3) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); ctx.fill(); }
      const off = Math.max(5, rpx * 0.72);
      this.label([p[0] + off, p[1] - off], b.name, b.color, false);
      this.bodyScreen.push({ b, x: p[0], y: p[1], r: Math.max(0, rpx) });
      if (f.target === b) {
        const rr = Math.max(10, rpx + 6);
        ctx.strokeStyle = '#ff5fd2'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (v.dead) return;
    const o = f.orbit, dom = f.domBody, bp = this.byId[dom.id].pos;
    if (!v.landed && o) {
      const e = o.e, ex = e > 1e-5 ? o.ex / e : 1, ey = e > 1e-5 ? o.ey / e : 0;
      if (o.rp > 0) this.label(this.project(bp.x + ex * o.rp, bp.y + ey * o.rp), `Pe ${fmtDist(o.pe)}`, '#7dff9a');
      if (e < 1 && e > 1e-4 && o.ra < dom.soi) this.label(this.project(bp.x - ex * o.ra, bp.y - ey * o.ra), `Ap ${fmtDist(o.ap)}`, '#ffd166');
    }
    const pr = f.pred;
    if (pr) {
      for (const en of pr.encounters) {
        const q = this.byId[en.body.id].pos;
        this.label(this.project(q.x + en.x, q.y + en.y), `${en.body.name} Pe ${fmtDist(en.pe)}`, '#ffb84f');
      }
      if (pr.closest && f.target && !pr.encounters.some((en) => en.body === f.target)) {
        const q = this.byId[pr.closest.b.id].pos;
        const a = this.project(q.x + pr.closest.x, q.y + pr.closest.y), g = this.project(q.x + pr.closest.tx, q.y + pr.closest.ty);
        this.label(a, `Closest to ${f.target.name}: ${fmtDist(pr.closest.d)}`, '#ff5fd2');
        if (g) { ctx.strokeStyle = '#ff5fd2'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(g[0], g[1], 6, 0, Math.PI * 2); ctx.stroke(); }
        if (a && g) { ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(g[0], g[1]); ctx.stroke(); ctx.setLineDash([]); }
      }
      if (pr.impact) {
        const q = this.byId[pr.impact.b.id].pos;
        const p = this.project(q.x + pr.impact.x, q.y + pr.impact.y);
        if (p) {
          ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 6); ctx.lineTo(p[0] + 6, p[1] + 6); ctx.moveTo(p[0] + 6, p[1] - 6); ctx.lineTo(p[0] - 6, p[1] + 6); ctx.stroke();
          this.label(p, 'Impact', '#ff5d5d', false);
        }
      }
    }
    const s = this.project(v.x, v.y), s2 = this.project(v.x + Math.cos(v.angle) * f.mapCam.dist * 0.01, v.y + Math.sin(v.angle) * f.mapCam.dist * 0.01);
    if (s) {
      const ang = s2 ? Math.atan2(s2[1] - s[1], s2[0] - s[0]) + Math.PI / 2 : 0;
      ctx.save();
      ctx.translate(s[0], s[1]);
      ctx.rotate(ang);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}
