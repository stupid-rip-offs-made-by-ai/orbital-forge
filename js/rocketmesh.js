// Builds 3D meshes for rockets out of the part catalogue (lathed bodies + fins/legs).
import * as THREE from './vendor/three.min.js';
import { isEngine } from './parts.js';
import { plumeMaterial } from './shaders.js';

const loader = new THREE.TextureLoader();
const skins = {};
function skin(id) {
  if (!skins[id]) {
    const t = loader.load(`assets/textures/skins/${id}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    skins[id] = t;
  }
  return skins[id];
}

const glowTex = loader.load('assets/textures/flame.png');
glowTex.colorSpace = THREE.SRGBColorSpace;

/** Small studio-style environment so metal parts pick up soft reflections. One per renderer. */
export function makeEnv(renderer) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#5f7fb8'); g.addColorStop(0.42, '#cfe0f5'); g.addColorStop(0.5, '#ffffff');
  g.addColorStop(0.56, '#8a7a66'); g.addColorStop(1, '#2a2622');
  x.fillStyle = g; x.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(sc, 0.04).texture;
  pm.dispose();
  return env;
}

const eng = (he, ht, hb, throat, exit, curve = 0.7) => (t) =>
  t < he ? ht + ((hb - ht) * t) / he : throat + (exit - throat) * Math.pow((t - he) / (1 - he), curve);

/** Half-width (m) as a function of t (0 = top of part, 1 = bottom). Mirrors tools/gen_textures.py. */
export const PROFILES = {
  pod_c1: (t) => (t < 0.06 ? 0.24 : 0.28 + ((0.625 - 0.28) * (t - 0.06)) / 0.94),
  probe: (t) => 0.625 * (0.86 + 0.14 * Math.min(1, Math.min(t, 1 - t) / 0.22)),
  nose: (t) => 0.625 * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)),
  chute: (t) => 0.38 * Math.sqrt(Math.min(1, t / 0.4)),
  adapter: (t) => 0.625 + 0.625 * t,
  srb_bolt: (t) => (t < 0.88 ? (t < 0.06 ? 0.48 + (0.12 * t) / 0.06 : 0.6) : 0.3 + (0.22 * (t - 0.88)) / 0.12),
  eng_ember: eng(0.35, 0.36, 0.22, 0.12, 0.42),
  eng_pivot: eng(0.36, 0.62, 0.34, 0.2, 0.56),
  eng_void: eng(0.24, 0.5, 0.26, 0.12, 0.61, 0.55),
  eng_titan: eng(0.3, 1.24, 0.74, 0.38, 1.17),
  legs: () => 0.64,
  legs_l: () => 1.27,
  fins: () => 0.625,
  pod_3: (t) => (t < 0.05 ? 0.5 : 0.58 + ((1.25 - 0.58) * (t - 0.05)) / 0.95),
  nose_l: (t) => 1.25 * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)),
  srb_thor: (t) => (t < 0.93 ? (t < 0.035 ? 0.48 + (0.12 * t) / 0.035 : 0.6) : 0.3 + (0.24 * (t - 0.93)) / 0.07),
  eng_spark: eng(0.32, 0.6, 0.3, 0.16, 0.5),
  eng_hawk: eng(0.38, 0.62, 0.42, 0.24, 0.6),
  eng_kestrel: eng(0.25, 1.22, 0.62, 0.3, 1.2, 0.55),
  srb_flea: (t) => (t < 0.86 ? (t < 0.1 ? 0.3 + (0.15 * t) / 0.1 : 0.45) : 0.22 + (0.18 * (t - 0.86)) / 0.14),
  pod_can: (t) => (t < 0.12 ? 0.45 + (0.175 * t) / 0.12 : t > 0.9 ? 0.625 - (0.1 * (t - 0.9)) / 0.1 : 0.625),
  shield: (t) => 0.625 * Math.sqrt(Math.max(0.05, 1 - (t * 0.92) ** 2)),
  shield_l: (t) => 1.25 * Math.sqrt(Math.max(0.05, 1 - (t * 0.92) ** 2)),
  fins_l: () => 1.25,
  chute_l: (t) => 0.6 * Math.sqrt(Math.min(1, t / 0.4)),
  truss: () => 0.55,
  eng_nova: eng(0.6, 0.5, 0.42, 0.14, 0.55),
};
const HOUSING = { eng_ember: 0.35, eng_pivot: 0.36, eng_void: 0.24, eng_titan: 0.3, eng_spark: 0.32, eng_nova: 0.6, eng_hawk: 0.38, eng_kestrel: 0.25 };

const geoCache = {};
function latheGeo(def) {
  if (geoCache[def.id]) return geoCache[def.id];
  const prof = PROFILES[def.id] || (() => def.w / 2);
  const N = 36, h = def.h;
  const pts = [];
  const openBottom = def.type === 'engine';
  if (!openBottom) pts.push(new THREE.Vector2(0.0001, -h));
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push(new THREE.Vector2(Math.max(0.0001, prof(t)), -t * h));
  }
  pts.push(new THREE.Vector2(0.0001, 0));
  const g = new THREE.LatheGeometry(pts, 40);
  g.computeVertexNormals();
  geoCache[def.id] = g;
  return g;
}

const finShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0.6, -0.02); s.lineTo(1.68, -0.6); s.lineTo(1.68, -0.98); s.lineTo(0.6, -0.98); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
  g.translate(0, 0, -0.035);
  return g;
})();
const finMat = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.5, metalness: 0.1 });
const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, roughness: 0.5, metalness: 0.5 });
const legMat2 = new THREE.MeshStandardMaterial({ color: 0xe6b828, roughness: 0.5, metalness: 0.2 });
const throatMat = new THREE.MeshBasicMaterial({ color: 0x0a0806 });

function strut(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

const wingletGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, -0.86); s.lineTo(0.5, -1.3); s.lineTo(-0.5, -1.3); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
  g.translate(0, 0, -0.03);
  return g;
})();
let solarTex = null;
function solarMat() {
  if (!solarTex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#16327a'; x.fillRect(0, 0, 256, 96);
    x.strokeStyle = '#6f9be6'; x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 96); x.stroke(); }
    for (let j = 0; j <= 3; j++) { x.beginPath(); x.moveTo(0, j * 32); x.lineTo(256, j * 32); x.stroke(); }
    solarTex = new THREE.CanvasTexture(c);
    solarTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: solarTex, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide });
}
const dishMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide });
const chuteBoxMat = new THREE.MeshStandardMaterial({ color: 0xd64a2a, roughness: 0.6 });

/** Parts that only exist as side mounts. `sg` is +1 or -1 for the two sides. */
function sideOnlyMesh(d, sg) {
  const g = new THREE.Group();
  if (d.id === 'winglet') g.add(new THREE.Mesh(wingletGeo, finMat));
  else if (d.id === 'solar') {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), legMat);
    arm.position.set(-d.w / 2 + 0.15, -d.h / 2, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(d.w - 0.25, d.h, 0.03), solarMat());
    panel.position.set(0.125, -d.h / 2, 0);
    g.add(arm, panel);
  } else if (d.id === 'dish') {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), legMat);
    arm.rotation.z = Math.PI / 2; arm.position.set(-0.25, -0.5, 0);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const r = (i / 10) * 0.48; pts.push(new THREE.Vector2(r + 0.001, r * r * 1.1)); }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), dishMat);
    bowl.rotation.z = -Math.PI / 2; bowl.position.set(0.05, -0.5, 0);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), legMat);
    feed.rotation.z = Math.PI / 2; feed.position.set(0.25, -0.5, 0);
    g.add(arm, bowl, feed);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.34), chuteBoxMat);
    box.position.y = -d.h / 2;
    g.add(box);
  }
  if (sg < 0) g.rotation.y = Math.PI;
  return g;
}

function partMesh(p, sg = 1, env = null) {
  const d = p.def;
  if (d.sideOnly) return sideOnlyMesh(d, sg);
  const g = new THREE.Group();
  const isEng = d.type === 'engine';
  const mat = new THREE.MeshStandardMaterial({
    map: skin(d.id), roughness: isEng ? 0.3 : 0.42, metalness: isEng ? 0.8 : 0.3,
    side: isEng ? THREE.DoubleSide : THREE.FrontSide, envMap: env || null, envMapIntensity: isEng ? 0.9 : 0.6,
  });
  const body = new THREE.Mesh(latheGeo(d), mat);
  body.rotation.y = Math.PI / 2; // put the skin's "front" (windows) toward the default camera
  g.add(body);
  if (isEng) {
    const he = HOUSING[d.id] || 0.3;
    const r = PROFILES[d.id](he) * 0.98;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 20), throatMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = -he * d.h - 0.02;
    g.add(disc);
  }
  if (d.type === 'fins') {
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(finShape, finMat);
      f.rotation.y = (k * Math.PI) / 2;
      if (d.finScale) f.scale.set(d.finScale, d.h, 1.4);
      g.add(f);
    }
  }
  if (d.type === 'legs') {
    const out = new THREE.Group(), stow = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const c = Math.cos(a), s = Math.sin(a);
      const P = (r, y) => new THREE.Vector3(r * c, y, r * s);
      out.add(strut(P(0.58, -0.28), P(1.5, -2.3), 0.07, legMat));
      out.add(strut(P(0.58, -0.1), P(1.08, -1.35), 0.04, legMat2));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 14), legMat);
      foot.position.copy(P(1.5, -2.35));
      out.add(foot);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.18), legMat);
      st.position.copy(P(0.7, -0.2));
      st.rotation.y = -a;
      stow.add(st);
    }
    const k = d.legScale || 1;
    out.scale.setScalar(k); stow.scale.setScalar(k);
    out.visible = !!p.legsOut;
    stow.visible = !p.legsOut;
    g.userData.legs = { out, stow };
    g.add(out, stow);
  }
  return g;
}

/** Plume: two nested open cones with a soft additive shader. Grows downward from y=0. */
const plumeGeo = (() => {
  const g = new THREE.CylinderGeometry(0.5, 1, 1, 24, 6, true);
  g.translate(0, -0.5, 0);
  return g;
})();
function makePlume(def) {
  const grp = new THREE.Group();
  const outer = new THREE.Mesh(plumeGeo, def.hot ? plumeMaterial(0x4a8cff, 0xbfe0ff, 0.9) : plumeMaterial(0xff8a30, 0xffd27a, 0.9));
  const inner = new THREE.Mesh(plumeGeo, plumeMaterial(def.hot ? 0xa8d0ff : 0xffc070, 0xffffff, 1.0));
  inner.scale.set(0.5, 0.6, 0.5);
  outer.renderOrder = 5; inner.renderOrder = 6;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: def.hot ? 0x9cc8ff : 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  glow.renderOrder = 6;
  grp.add(outer, inner);
  grp.userData = { outer, inner, def, glow };
  grp.visible = false;
  return grp;
}

/**
 * Build a rocket group. `parts` must already be laid out (p.sTop set, as Vessel does).
 * Hierarchy: root (positioned/rotated by caller) → inner (y = -com) → part groups.
 */
export function buildRocket(parts, env = null) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const plumes = [], legs = [];
  for (const p of parts) {
    for (const sg of p.n === 2 ? [1, -1] : [1]) {
      const g = partMesh(p, sg, env);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(sg * (p.lat || 0), p.sTop, 0);
      inner.add(g);
      if (g.userData.legs) legs.push({ p, ...g.userData.legs });
      if (isEngine(p.def)) {
        const pl = makePlume(p.def);
        pl.position.set(sg * (p.lat || 0), p.sTop - p.def.h + 0.05, 0);
        inner.add(pl);
        const gl = pl.userData.glow;
        gl.position.copy(pl.position); gl.visible = false;
        inner.add(gl);
        plumes.push({ p, grp: pl });
      }
    }
  }
  root.userData = { inner, plumes, legs, key: rocketKey(parts) };
  return root;
}
export const rocketKey = (parts) => parts.map((p) => p.id + (p.legsOut ? '+' : '') + (p.n === 2 ? '@' + p.sTop.toFixed(1) + '/' + p.lat.toFixed(2) : '')).join(',');

/** Per-frame update of plumes/legs. press: 0 (vacuum) .. 1 (sea level). */
export function updateRocket(root, vessel, press, time) {
  const u = root.userData;
  u.inner.position.y = -vessel.com;
  for (const L of u.legs) { L.out.visible = !!L.p.legsOut; L.stow.visible = !L.p.legsOut; }
  for (const { p, grp } of u.plumes) {
    const fl = p.flame || 0;
    grp.visible = fl > 0.02;
    grp.userData.glow.visible = grp.visible;
    if (!grp.visible) continue;
    grp.userData.glow.scale.setScalar(p.def.w * (2.2 + 2.2 * fl) * (0.92 + 0.16 * Math.random()));
    grp.userData.glow.material.opacity = 0.35 + 0.5 * fl;
    const d = p.def, vac = 1 - Math.min(1, press);
    const flick = 0.93 + 0.14 * Math.sin(time * 53 + d.thrust * 1e-3) * Math.sin(time * 31);
    const len = d.plume * (0.55 + 0.45 * fl) * (1 + vac * 1.4) * flick;
    const wid = d.w * 0.48 * (1 + vac * 1.8);
    grp.scale.set(wid, len, wid);
    grp.userData.outer.material.uniforms.uIntensity.value = 0.45 + 0.55 * fl;
    grp.userData.inner.material.uniforms.uIntensity.value = 0.6 + 0.4 * fl;
  }
}
