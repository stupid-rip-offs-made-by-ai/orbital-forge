// Three.js renderer. Physics happens in the planet's equatorial plane (z = 0);
// everything is drawn in full 3D around a floating origin centred on the camera target.
import * as THREE from './vendor/three.min.js';
import { P, M, LAUNCH_TH, PAD_H, bodyPos, bodyRot, terrain3, wrapA } from './physics.js';
const padDip = (b, th, lat) => (b === P && Math.hypot(wrapA(th - LAUNCH_TH), lat) < 0.0025 ? 0.6 : 0);
import { buildRocket, updateRocket, rocketKey } from './rocketmesh.js';
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
export const SUN = new THREE.Vector3(0.42, 1, 0.62).normalize();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const V = new THREE.Vector3();

const NT = 161, NP = 81; // terrain patch grid

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
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 5e10);
    scene.add(this.camera);
    this.fog = new THREE.FogExp2(0xa9d4ff, 0);
    scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
    this.sun.position.copy(SUN);
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x403424, 0.55);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x5a6480, 1.5);
    scene.add(this.amb);
    this.engineLight = new THREE.PointLight(0xffa040, 0, 120, 1.2);
    scene.add(this.engineLight);

    const starTex = tex('stars.png', { repeat: [8, 4] });
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24),
      new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite: false, fog: false, transparent: true }));
    this.stars.scale.setScalar(4e9);
    this.stars.renderOrder = -10;
    this.stars.frustumCulled = false;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial());
    this.sky.scale.setScalar(3e9);
    this.sky.renderOrder = -9;
    this.sky.frustumCulled = false;
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame.png'), color: 0xfff6e0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.sunSprite.scale.setScalar(2.2e8);
    this.sunSprite.renderOrder = -8;
    scene.add(this.stars, this.sky, this.sunSprite);

    this.detail = tex('ground_moon.png', { repeat: [1, 1] });
    this.bodies = [this.makeBody(P), this.makeBody(M)];
    this.makePad();
    this.makeParticles();
    this.makeMapHelpers();
    this.makeChute();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame.png'), color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.visible = false;
    scene.add(this.glow);
    this.vGroups = new Map();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.W = w; this.H = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.r.setPixelRatio(this.dpr);
    this.r.setSize(w, h, false);
    this.overlay.width = Math.round(w * this.dpr);
    this.overlay.height = Math.round(h * this.dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ construction
  makeBody(b) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(b.R - (b === P ? 30 : 20), 384, 192),
      new THREE.MeshStandardMaterial({ map: tex(b === P ? 'planet_map.jpg' : 'moon_map.jpg'), roughness: b === P ? 0.8 : 1, metalness: 0 }));
    sphere.rotation.x = Math.PI / 2;
    spin.add(sphere);
    const B = { b, root, spin, sphere };
    if (b === P) {
      B.cloudSpin = new THREE.Group();
      const cm = new THREE.Mesh(new THREE.SphereGeometry(b.R + 4500, 192, 96),
        new THREE.MeshStandardMaterial({ map: tex('clouds_map.png'), transparent: true, depthWrite: false, roughness: 1 }));
      cm.rotation.x = Math.PI / 2;
      B.cloudSpin.add(cm);
      B.clouds = cm;
      root.add(B.cloudSpin);
      B.atmo = new THREE.Mesh(new THREE.SphereGeometry(b.R + 70000, 128, 64), atmoMaterial(0x5fa8ff));
      root.add(B.atmo);
    }
    B.patch = this.makePatch(new THREE.MeshStandardMaterial({ map: this.detail, vertexColors: true, roughness: 0.95, metalness: 0 }), true);
    spin.add(B.patch.mesh);
    if (b === P) {
      B.water = this.makePatch(new THREE.MeshStandardMaterial({ color: 0x1b5c9e, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86 }), false);
      spin.add(B.water.mesh);
    }
    this.scene.add(root);
    return B;
  }

  makePatch(mat, full) {
    const n = NT * NP;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
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

  rebuildPatch(B, thc, span) {
    const b = B.b, R = b.R;
    const tile = 40;
    thc = Math.round(thc / (tile / R)) * (tile / R);
    const ax = R * Math.cos(thc), ay = R * Math.sin(thc);
    const latSpan = Math.min(span * 0.7, 0.5);
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
            } else { const q = 0.85 + 0.15 * Math.sin(th * 300 + lat * 410); cr = 1.18 * q; cg = 1.16 * q; cb = 1.1 * q; }
            col[c++] = cr; col[c++] = cg; col[c++] = cb;
          }
        }
      }
      patch.g.attributes.position.needsUpdate = true;
      patch.g.computeVertexNormals();
      if (!water) {
        // rocky slopes
        const nor = patch.g.attributes.normal.array;
        for (let q = 0, n = NT * NP; q < n; q++) {
          const px = pos[q * 3] + ax, py = pos[q * 3 + 1] + ay, pz = pos[q * 3 + 2];
          const L = Math.hypot(px, py, pz);
          const d = (nor[q * 3] * px + nor[q * 3 + 1] * py + nor[q * 3 + 2] * pz) / L;
          const s = clamp((0.93 - d) * 6, 0, 1);
          if (s > 0) {
            const rk = b === P ? [0.55, 0.5, 0.45] : [0.8, 0.78, 0.74];
            col[q * 3] += (rk[0] - col[q * 3]) * s; col[q * 3 + 1] += (rk[1] - col[q * 3 + 1]) * s; col[q * 3 + 2] += (rk[2] - col[q * 3 + 2]) * s;
          }
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
    const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 3, 22), concrete);
    slab.position.y = -1.5;
    const trench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 22), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 }));
    trench.position.y = 0.01;
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe6b828, roughness: 0.8 });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(22, 0.06, 0.6), stripeMat); s1.position.set(0, 0.02, 10.4);
    const s2 = s1.clone(); s2.position.z = -10.4;
    const lat = tex('lattice.png', { repeat: [1, 1.6] });
    const towerMat = new THREE.MeshStandardMaterial({ map: lat, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 28, 2.4), towerMat);
    tower.position.set(-8.5, 14, 0);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.5, metalness: 0.6 });
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.5, 0.8), armMat); arm1.position.set(-4.6, 9, 0);
    const arm2 = arm1.clone(); arm2.position.y = 18;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 }));
    beacon.position.set(-8.5, 28.6, 0);
    pad.add(slab, trench, s1, s2, tower, arm1, arm2, beacon);
    pad.position.set((P.R + PAD_H) * Math.cos(LAUNCH_TH), (P.R + PAD_H) * Math.sin(LAUNCH_TH), 0);
    pad.rotation.z = LAUNCH_TH - Math.PI / 2;
    this.bodies[0].spin.add(pad);
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

  makeMapHelpers() {
    const N = 4000;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.orbitLine = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, fog: false }));
    this.orbitLine.frustumCulled = false;
    this.scene.add(this.orbitLine);
    const circle = (r, color, opacity) => {
      const pts = [];
      for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0)); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: false }));
      l.frustumCulled = false;
      return l;
    };
    this.moonOrbit = circle(M.orbitR, 0xb8c0ff, 0.35);
    this.bodies[0].root.add(this.moonOrbit);
    this.soiRing = circle(M.soi, 0xffb84f, 0.35);
    this.bodies[1].root.add(this.soiRing);
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
    const mp = bodyPos(M, t);
    const focusObj = v.dead && f.boomPos ? f.boomPos : v;
    let F;
    if (!f.map) F = { x: focusObj.x, y: focusObj.y };
    else F = f.mapFocus === 'verdan' ? { x: 0, y: 0 } : f.mapFocus === 'lumen' ? { x: mp.x, y: mp.y } : { x: focusObj.x, y: focusObj.y };
    this.F = F;

    // camera
    const domC = Math.hypot(focusObj.x - mp.x, focusObj.y - mp.y) < M.soi ? mp : { x: 0, y: 0 };
    let e1, e2;
    if (!f.map) {
      const ux = focusObj.x - domC.x, uy = focusObj.y - domC.y, L = Math.hypot(ux, uy) || 1;
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

    // sky & atmosphere
    const camR = Math.hypot(camW.x, camW.y, camW.z);
    const camAlt = camR - P.R;
    const upP = V.set(camW.x / camR, camW.y / camR, camW.z / camR).clone();
    const dayF = clamp(upP.dot(SUN) * 2.5 + 0.55, 0.12, 1);
    const inMoon = Math.hypot(camW.x - mp.x, camW.y - mp.y, camW.z) < M.soi;
    let skyF = inMoon || camAlt > P.atmo.height ? 0 : clamp(Math.exp(-camAlt / 14000) * 1.08, 0, 1);
    skyF *= dayF;
    const su = this.sky.material.uniforms;
    su.uUp.value.copy(upP); su.uSun.value.copy(SUN); su.uSkyF.value = skyF;
    su.uZenith.value.setRGB(0.17 * dayF, 0.42 * dayF, 0.85 * dayF);
    su.uHorizon.value.setRGB(0.66 * dayF, 0.82 * dayF, 1.0 * dayF);
    this.sky.visible = skyF > 0.005;
    this.stars.material.opacity = clamp(1 - skyF * 1.8, 0, 1);
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.sunSprite.position.copy(cam.position).addScaledVector(SUN, 2e9);
    this.fog.density = f.map ? 0 : skyF > 0 ? (skyF * 1) / (55000 + Math.max(0, camAlt) * 5) : 0;
    this.fog.color.setRGB(0.62 * dayF, 0.78 * dayF, 0.95 * dayF);
    this.hemi.intensity = 0.25 + 0.45 * skyF;

    // bodies
    for (const B of this.bodies) {
      const b = B.b;
      const bp = b === P ? { x: 0, y: 0 } : mp;
      B.root.position.set(bp.x - F.x, bp.y - F.y, 0);
      const rot = bodyRot(b, t);
      B.spin.rotation.z = rot;
      if (B.cloudSpin) {
        B.cloudSpin.rotation.z = rot * 1.08;
        const ca = clamp((camAlt - 3000) / 6000, 0, 1);
        B.clouds.material.opacity = ca;
        B.clouds.visible = ca > 0.01;
        B.atmo.material.uniforms.uFade.value = clamp((camAlt - 25000) / 45000, 0, 1);
      }
      // terrain patch near the camera
      const dx = camW.x - bp.x, dy = camW.y - bp.y;
      const alt = Math.hypot(dx, dy, camW.z) - b.R;
      const showPatch = !f.map && alt < 300000;
      B.patch.mesh.visible = showPatch;
      if (B.water) B.water.mesh.visible = showPatch;
      if (showPatch) {
        const fth = Math.atan2(F.y - bp.y, F.x - bp.x) - rot;
        const span = clamp((Math.sqrt(2 * b.R * Math.max(alt, 40)) * 1.3 + 3000) / b.R, 0.004, 0.9);
        const st = B.patch.state;
        if (!st || Math.abs(wrapA(fth - st.thc)) > st.span * 0.1 || span / st.span > 1.4 || span / st.span < 0.6) this.rebuildPatch(B, fth, span);
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
        g = buildRocket(ves.parts);
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
    for (const p of v.parts) fl += p.flame || 0;
    if (!v.dead && fl > 0) {
      const [bx, by] = v.worldPt(v.minS - 2, 0);
      this.engineLight.position.set(bx - F.x, by - F.y, 0);
      this.engineLight.intensity = Math.min(3, fl) * 400 * (0.9 + Math.random() * 0.2);
    } else this.engineLight.intensity = 0;

    this.updateChute(f, F);
    this.updateParticles(f, F, cam);
    this.updateGlow(f, F);
    this.updateMap(f, F, mp);

    this.r.render(this.scene, cam);
    this.drawOverlay(f, F, mp);
  }

  disposeGroup(g) {
    this.scene.remove(g);
    g.traverse((o) => { if (o.material && !o.material.isShaderMaterial && o.material.map) o.material.dispose(); });
  }

  updateChute(f, F) {
    const v = f.vessel;
    const p = !v.dead && v.parts.find((q) => q.def.type === 'chute' && q.chute === 1);
    this.canopy.visible = this.chuteLines.visible = !!p;
    if (!p) return;
    const open = Math.min(1, (f.t - p.chuteT) / 3);
    const top = v.worldPt(p.sTop, 0);
    const r = f.speedRef || { vx: 0, vy: -1 };
    let dx = -r.vx, dy = -r.vy;
    const L = Math.hypot(dx, dy);
    if (L < 0.5) { dx = Math.cos(v.angle); dy = Math.sin(v.angle); } else { dx /= L; dy /= L; }
    const dist = 3 + 9 * open, rad = 1 + 6.5 * open;
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

  updateMap(f, F, mp) {
    const show = f.map;
    this.orbitLine.visible = show && !!f.pred;
    this.moonOrbit.visible = this.soiRing.visible = show;
    if (!show || !f.pred) return;
    const pts = f.pred.pts;
    const pos = this.orbitLine.geometry.attributes.position.array;
    const col = this.orbitLine.geometry.attributes.color.array;
    const n = Math.min(pts.length, 4000);
    for (let i = 0; i < n; i++) {
      const q = pts[i];
      const x = q.moon ? mp.x + q.x : q.x, y = q.moon ? mp.y + q.y : q.y;
      pos[i * 3] = x - F.x; pos[i * 3 + 1] = y - F.y; pos[i * 3 + 2] = 0;
      if (q.moon) { col[i * 3] = 1; col[i * 3 + 1] = 0.72; col[i * 3 + 2] = 0.31; } else { col[i * 3] = 0.31; col[i * 3 + 1] = 0.82; col[i * 3 + 2] = 1; }
    }
    this.orbitLine.geometry.setDrawRange(0, n);
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

  drawOverlay(f, F, mp) {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (!f.map) return;
    const v = f.vessel;
    this.label(this.project(0, P.R * 1.05), 'Verdan', '#9fd0ff', false);
    this.label(this.project(mp.x, mp.y + M.R * 1.1), 'Lumen', '#e8e3d0', false);
    if (v.dead) return;
    const o = f.orbit, dom = f.domBody;
    const bp = dom === P ? { x: 0, y: 0 } : mp;
    if (!v.landed && o) {
      const e = o.e, ex = e > 1e-5 ? o.ex / e : 1, ey = e > 1e-5 ? o.ey / e : 0;
      if (o.rp > 0) this.label(this.project(bp.x + ex * o.rp, bp.y + ey * o.rp), `Pe ${fmtDist(o.pe)}`, '#7dff9a');
      if (e < 1 && e > 1e-4) this.label(this.project(bp.x - ex * o.ra, bp.y - ey * o.ra), `Ap ${fmtDist(o.ap)}`, '#ffd166');
    }
    const pr = f.pred;
    if (pr && pr.encounter && dom === P) this.label(this.project(mp.x + pr.encounter.x, mp.y + pr.encounter.y), `Lumen Pe ${fmtDist(pr.encounter.pe)}`, '#ffb84f');
    if (pr && pr.impact) {
      const q = pr.impact;
      const p = q.moon ? this.project(mp.x + q.x, mp.y + q.y) : this.project(q.x, q.y);
      if (p) {
        ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p[0] - 6, p[1] - 6); ctx.lineTo(p[0] + 6, p[1] + 6); ctx.moveTo(p[0] + 6, p[1] - 6); ctx.lineTo(p[0] - 6, p[1] + 6); ctx.stroke();
        this.label(p, 'Impact', '#ff5d5d', false);
      }
    }
    const s = this.project(v.x, v.y), s2 = this.project(v.x + Math.cos(v.angle) * 1e3, v.y + Math.sin(v.angle) * 1e3);
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
