// Celestial mechanics, atmosphere and terrain for the Solara system.
// Bodies form a tree (star → planets → moons) on circular, clockwise orbits in one plane.
export const G0 = 9.80665;
const TAU = 2 * Math.PI;

export const SUN = {
  id: 'solara', name: 'Solara', GM: 1.1723e18, R: 2.6e8, star: true, parent: null, soi: Infinity,
  omega: 0, maxTerrain: 0, color: '#ffe9a8', tex: 'sun_map.jpg',
};

/** Verdan — the home planet. */
export const P = {
  id: 'verdan', name: 'Verdan', parent: SUN, GM: 3.5316e12, R: 600000,
  orbitR: 6.8e9, phase0: -Math.PI / 2,
  atmo: { height: 70000, rho0: 1.225, H: 5600 }, rotPeriod: 21600, ocean: true, clouds: true,
  maxTerrain: 4200, color: '#5aa0ff', tex: 'planet_map.jpg', atmoColor: 0x5fa8ff,
  sky: { zen: [0.17, 0.42, 0.85], hor: [0.66, 0.82, 1.0] },
  desc: 'Home. Oceans, air and a launch pad.',
};
/** Lumen — Verdan's moon. */
export const M = {
  id: 'lumen', name: 'Lumen', parent: P, GM: 6.5138e10, R: 200000, orbitR: 6e6, phase0: 1.2,
  locked: true, maxTerrain: 4700, color: '#d8d4c8', tex: 'moon_map.jpg',
  pal: { lo: [0.95, 0.94, 0.9], hi: [1.2, 1.18, 1.12], rock: [0.8, 0.78, 0.74] },
  desc: 'Airless grey moon. Land on engines alone.',
};
export const CINDER = {
  id: 'cinder', name: 'Cinder', parent: SUN, GM: 1.7e11, R: 250000, orbitR: 2.8e9, phase0: 2.1,
  rotPeriod: 120000, color: '#b08a6a', tex: 'cinder_map.jpg',
  pal: { lo: [0.5, 0.4, 0.33], hi: [0.82, 0.7, 0.58], rock: [0.42, 0.34, 0.3] },
  terr: [41, 1500], desc: 'Scorched rock close to the star. Expensive to reach.',
};
export const AUREA = {
  id: 'aurea', name: 'Aurea', parent: SUN, GM: 8.17e12, R: 700000, orbitR: 4.9e9, phase0: 0.4,
  atmo: { height: 90000, rho0: 6.0, H: 7200 }, rotPeriod: 80000, color: '#f0c060', tex: 'aurea_map.jpg', atmoColor: 0xffc468,
  sky: { zen: [0.72, 0.5, 0.18], hor: [0.98, 0.82, 0.48] },
  pal: { lo: [0.62, 0.42, 0.2], hi: [0.9, 0.68, 0.34], rock: [0.45, 0.3, 0.18] },
  terr: [57, 1800], desc: 'Crushing golden atmosphere and heavy gravity. Easy to land on, brutal to leave.',
};
export const FERRA = {
  id: 'ferra', name: 'Ferra', parent: SUN, GM: 3.0136e11, R: 320000, orbitR: 1.035e10, phase0: -0.75,
  atmo: { height: 50000, rho0: 0.2, H: 5000 }, rotPeriod: 65000, color: '#d9643a', tex: 'ferra_map.jpg', atmoColor: 0xff9a70,
  sky: { zen: [0.5, 0.33, 0.27], hor: [0.86, 0.62, 0.5] },
  pal: { lo: [0.72, 0.36, 0.2], hi: [0.95, 0.6, 0.4], rock: [0.5, 0.26, 0.17] },
  terr: [73, 2100], desc: 'Red desert world with thin air. Parachutes help, but bring an engine.',
};
export const PEBBLE = {
  id: 'pebble', name: 'Pebble', parent: FERRA, GM: 1.857e10, R: 130000, orbitR: 1.6e6, phase0: 0.6,
  locked: true, color: '#9a938a', tex: 'pebble_map.jpg',
  pal: { lo: [0.6, 0.58, 0.55], hi: [0.85, 0.82, 0.78], rock: [0.48, 0.46, 0.44] },
  terr: [91, 1300], desc: "Ferra's little moon. Barely any gravity.",
};
export const JOVARA = {
  id: 'jovara', name: 'Jovara', parent: SUN, GM: 2.825e14, R: 6.0e6, orbitR: 2.25e10, phase0: 2.9,
  atmo: { height: 200000, rho0: 18, H: 30000 }, rotPeriod: 36000, gas: true, maxTerrain: 0,
  color: '#7fd6c4', tex: 'jovara_map.jpg', atmoColor: 0x8fe6d2,
  sky: { zen: [0.2, 0.5, 0.48], hor: [0.75, 0.92, 0.8] },
  desc: 'Gas giant. There is no ground, only deeper and deeper cloud.',
};
export const GLACIA = {
  id: 'glacia', name: 'Glacia', parent: JOVARA, GM: 2.07e11, R: 300000, orbitR: 2.15e7, phase0: -1.4,
  locked: true, color: '#bfe6ff', tex: 'glacia_map.jpg',
  pal: { lo: [1.0, 1.1, 1.2], hi: [1.45, 1.5, 1.55], rock: [0.62, 0.74, 0.86] },
  terr: [113, 1700], desc: "Jovara's frozen moon of blue ice ridges.",
};

/** Parents always come before their children. */
export const BODIES = [SUN, CINDER, AUREA, P, M, FERRA, PEBBLE, JOVARA, GLACIA];
export const bodyById = (id) => BODIES.find((b) => b.id === id);

function lcg(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
for (const b of BODIES) {
  b.children = [];
  if (b.parent) {
    b.parent.children.push(b);
    b.n = Math.sqrt(b.parent.GM / b.orbitR ** 3);
    if (!b.soi) b.soi = b.orbitR * (b.GM / b.parent.GM) ** 0.4;
    b.omega = b.locked ? -b.n : (-TAU) / b.rotPeriod; // everything turns clockwise, so "east" is to the right
  }
  if (b.terr) { // seeded procedural terrain: heights are always ≥ 0
    const r = lcg(b.terr[0]), amp = b.terr[1];
    const fr = [2, 5, 11, 23, 53, 131], am = [0.45, 0.25, 0.14, 0.065, 0.03, 0.013];
    b.harm = fr.map((f, i) => [amp * am[i] * (0.7 + 0.6 * r()), f + (i ? Math.floor(r() * 3) : 0), r() * TAU]);
    b.off = [[0.3, 3, 8], [0.16, 12, -15], [0.07, 29, 37], [0.025, 71, -83]].map(([a, f, g]) => [a * amp, f, g, r() * TAU]);
    b.base = b.harm.reduce((s, h) => s + Math.abs(h[0]), 0) + 20;
    b.maxTerrain = 2 * b.base;
  }
}

export const LAUNCH_TH = Math.PI / 2;
export const PAD_H = 70;

export const wrapA = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- ephemeris (cached per time)
let cacheT = NaN;
function upd(t) {
  if (t === cacheT) return;
  cacheT = t;
  for (const b of BODIES) {
    const pr = b.parent;
    if (!pr) { b.px = b.py = b.pvx = b.pvy = b.fax = b.fay = 0; continue; }
    const a = b.phase0 - b.n * t, c = Math.cos(a), s = Math.sin(a);
    const rx = b.orbitR * c, ry = b.orbitR * s, sp = b.orbitR * b.n, n2 = b.n * b.n;
    b.px = pr.px + rx; b.py = pr.py + ry;
    b.pvx = pr.pvx + sp * s; b.pvy = pr.pvy - sp * c;
    b.fax = pr.fax - n2 * rx; b.fay = pr.fay - n2 * ry; // acceleration of the body's own frame
  }
}
export function bodyPos(b, t, o = {}) { upd(t); o.x = b.px; o.y = b.py; return o; }
export function bodyVel(b, t, o = {}) { upd(t); o.x = b.pvx; o.y = b.pvy; return o; }
export function bodyRot(b, t) {
  if (!b.parent) return 0;
  return b.locked ? b.phase0 - b.n * t + Math.PI : b.omega * t;
}
/** Angle of a body around its parent. */
export const bodyAngle = (b, t) => b.phase0 - b.n * t;

// ---------------------------------------------------------------- terrain
/** Unflattened terrain height along the equator (the flight plane). */
export function terrainRaw(b, th) {
  if (b === P) {
    return 300 + 1900 * Math.sin(3 * th + 0.7) + 900 * Math.sin(7 * th + 2.1) + 450 * Math.sin(13 * th + 0.3)
      + 200 * Math.sin(29 * th + 1.9) + 80 * Math.sin(61 * th + 4.0) + 25 * Math.sin(143 * th + 1.0);
  }
  if (b === M) {
    return 2300 + 1100 * Math.sin(2 * th + 1) + 600 * Math.sin(5 * th + 0.5) + 320 * Math.sin(11 * th + 2)
      + 150 * Math.sin(23 * th + 0.2) + 70 * Math.sin(53 * th + 3) + 30 * Math.sin(131 * th + 1.3);
  }
  if (!b.harm) return 0;
  let h = b.base;
  for (const [a, f, ph] of b.harm) h += a * Math.sin(f * th + ph);
  return h;
}
/** Launch-site flattening factor (0 on the pad, 1 away from it) for an angular distance d. */
export const padBlend = (d) => smooth(0.004, 0.014, d);

/** Terrain height (m) at local angle th along the flight plane. Negative on Verdan = sea floor. */
export function terrainH(b, th) {
  const h = terrainRaw(b, th);
  if (b !== P) return h;
  const f = padBlend(Math.abs(wrapA(th - LAUNCH_TH)));
  return h * f + PAD_H * (1 - f);
}

/** Full 3D terrain: lat = 0 is exactly terrainH (the physics ground); off-plane adds extra relief. */
export function terrain3(b, th, lat) {
  const k = 1 - Math.exp(-((lat / 0.004) ** 2));
  let extra = 0;
  if (b === P) {
    extra = 1300 * Math.sin(4 * th + 7 * lat + 1) * Math.sin(5 * lat + 0.3) + 650 * Math.sin(9 * th - 13 * lat)
      + 300 * Math.sin(23 * th + 31 * lat + 2) + 110 * Math.sin(57 * th - 71 * lat) + 40 * Math.sin(150 * th + 170 * lat);
    extra -= 1200 * Math.sin(lat * 2.2) ** 2; // oceans become more common away from the equator
    const h = terrainRaw(b, th) + extra * k;
    const f = padBlend(Math.hypot(wrapA(th - LAUNCH_TH), lat));
    return h * f + PAD_H * (1 - f);
  }
  if (b === M) {
    extra = 700 * Math.sin(3 * th + 8 * lat + 2) + 380 * Math.sin(12 * th - 15 * lat) + 160 * Math.sin(29 * th + 37 * lat + 1)
      + 60 * Math.sin(71 * th - 83 * lat);
  } else if (b.off) {
    for (const [a, f, g, ph] of b.off) extra += a * Math.sin(f * th + g * lat + ph);
  }
  return Math.max(0, terrainRaw(b, th) + extra * k);
}

/** Solid/liquid surface height (water counts as surface on ocean worlds). */
export function surfH(b, th) {
  const h = terrainH(b, th);
  return b.ocean ? Math.max(0, h) : h;
}

const ZERO_ATM = { rho: 0, p: 0 };
/** rho in kg/m³; p in atmospheres (can exceed 1 on thick-air worlds). */
export function atmo(b, alt) {
  if (!b.atmo || alt >= b.atmo.height) return ZERO_ATM;
  const e = Math.exp(-Math.max(0, alt) / b.atmo.H);
  const top = b.atmo.height * 0.8;
  const taper = alt > top ? (b.atmo.height - alt) / (b.atmo.height - top) : 1;
  const rho = b.atmo.rho0 * e * taper;
  return { rho, p: rho / 1.225 };
}

// ---------------------------------------------------------------- gravity (patched conics)
/** The body whose sphere of influence contains the point. */
export function soiBody(x, y, t) {
  upd(t);
  let cur = SUN;
  for (;;) {
    let nx = null;
    for (const c of cur.children) {
      const dx = x - c.px, dy = y - c.py;
      if (dx * dx + dy * dy < c.soi * c.soi) { nx = c; break; }
    }
    if (!nx) return cur;
    cur = nx;
  }
}

/**
 * Only the body whose sphere of influence you are in pulls on you, plus the acceleration
 * of that body's own frame, so motion relative to it is an exact conic. Orbits never drift.
 */
export function gravity(x, y, t, o) {
  const b = soiBody(x, y, t);
  const dx = x - b.px, dy = y - b.py, d2 = dx * dx + dy * dy, d = Math.sqrt(d2), k = -b.GM / (d2 * d);
  o.ax = k * dx + b.fax; o.ay = k * dy + b.fay;
  return o;
}

/** Shrinks a time step so a coasting ship cannot jump clean over a moon's or planet's sphere of influence. */
export function stepLimit(x, y, vx, vy, t, dom, h) {
  upd(t);
  for (const c of dom.children) {
    const dx = x - c.px, dy = y - c.py;
    const d = Math.sqrt(dx * dx + dy * dy) - c.soi;
    const rv = Math.hypot(vx - c.pvx, vy - c.pvy) + 1;
    const lim = Math.max(c.soi * 0.12, d * 0.4) / rv;
    if (lim < h) h = lim;
  }
  return h;
}

/** Keplerian elements of a state relative to body b. */
export function orbitInfo(rx, ry, vx, vy, b) {
  const mu = b.GM;
  const r = Math.hypot(rx, ry), v2 = vx * vx + vy * vy;
  const eps = v2 / 2 - mu / r;
  const h = rx * vy - ry * vx;
  const rv = rx * vx + ry * vy;
  const ex = ((v2 - mu / r) * rx - rv * vx) / mu;
  const ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = (h * h) / mu;
  const a = -mu / (2 * eps);
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const period = e < 1 ? TAU * Math.sqrt(a ** 3 / mu) : Infinity;
  return { e, a, rp, ra, ex, ey, h, period, pe: rp - b.R, ap: ra - b.R, r, alt: r - b.R };
}

/**
 * Numerically propagates a coasting trajectory. Points are stored relative to the body
 * whose SOI they are in ({ b, x, y }). Reports SOI encounters, impact and, when a target
 * body is given, the closest approach to it.
 */
export function predict(x, y, vx, vy, t0, maxSteps = 3500, target = null) {
  const pts = [], encounters = [];
  let t = t0, dom = soiBody(x, y, t), changes = 0, swept = 0, prev = null;
  let enc = null, impact = null, closest = null;
  const G = {};
  for (let i = 0; i < maxSteps; i++) {
    upd(t);
    const rx = x - dom.px, ry = y - dom.py, r = Math.hypot(rx, ry);
    let dt = Math.max(0.5, 0.008 * Math.sqrt((r * r * r) / dom.GM));
    dt = stepLimit(x, y, vx, vy, t, dom, dt);
    gravity(x, y, t, G);
    vx += G.ax * dt * 0.5; vy += G.ay * dt * 0.5;
    x += vx * dt; y += vy * dt; t += dt;
    gravity(x, y, t, G);
    vx += G.ax * dt * 0.5; vy += G.ay * dt * 0.5;
    const nd = soiBody(x, y, t);
    if (nd !== dom) {
      if (nd.parent === dom) { enc = { body: nd, minD: Infinity, x: 0, y: 0, t }; encounters.push(enc); } else enc = null;
      dom = nd; changes++; swept = 0; prev = null;
    }
    const qx = x - dom.px, qy = y - dom.py, q = Math.hypot(qx, qy);
    pts.push({ b: dom, x: qx, y: qy });
    if (enc && q < enc.minD) { enc.minD = q; enc.x = qx; enc.y = qy; }
    if (target && target !== dom) {
      const d = Math.hypot(x - target.px, y - target.py);
      if (!closest || d < closest.d) closest = { d, b: dom, x: qx, y: qy, tx: target.px - dom.px, ty: target.py - dom.py, t };
    }
    if (q < dom.R) { impact = { b: dom, x: qx, y: qy }; break; }
    const ang = Math.atan2(qy, qx);
    if (prev !== null) swept += Math.abs(wrapA(ang - prev));
    prev = ang;
    if (swept > TAU + 0.02 || changes > 4) break;
    if (dom === SUN && q > 1.2e11) break;
  }
  for (const e of encounters) e.pe = e.minD - e.body.R;
  return { pts, encounters: encounters.filter((e) => e.minD < Infinity), impact, closest };
}

/**
 * Hohmann transfer helper: how long until the launch window to `target` opens and roughly
 * how big the burn is. Works for a target orbiting the body you orbit (a moon, or a planet
 * when you orbit the star) and for a neighbouring planet/moon of the body you orbit.
 */
export function transferInfo(o, dom, target, shipAngle, t) {
  if (!target || !target.parent || target === dom || !(o.e < 1)) return null;
  let mu, r1, n1, a1, eject = false;
  if (target.parent === dom) {
    mu = dom.GM; r1 = o.a; n1 = Math.sqrt(mu / r1 ** 3); a1 = shipAngle;
  } else {
    let org = dom;
    while (org.parent && org.parent !== target.parent) org = org.parent;
    if (!org.parent || org === target) return null;
    mu = org.parent.GM; r1 = org.orbitR; n1 = org.n; a1 = bodyAngle(org, t); eject = org === dom;
  }
  const r2 = target.orbitR, n2 = target.n, aT = (r1 + r2) / 2;
  const tT = Math.PI * Math.sqrt(aT ** 3 / mu);
  const need = wrapA(Math.PI - n2 * tT); // how far ahead (along the direction of travel) the target must be
  const lead = wrapA(a1 - bodyAngle(target, t));
  const rate = n2 - n1;
  const mod = (a) => ((a % TAU) + TAU) % TAU;
  const wait = rate > 0 ? mod(need - lead) / rate : mod(lead - need) / -rate;
  const synodic = TAU / Math.abs(rate);
  const vinf = Math.abs(Math.sqrt(mu * (2 / r1 - 1 / aT)) - Math.sqrt(mu / r1));
  let dv = vinf;
  if (target.parent !== dom) dv = eject ? Math.sqrt(vinf * vinf + (2 * dom.GM) / o.r) - Math.sqrt(dom.GM / o.r) : null;
  const now = wait < synodic * 0.012 || synodic - wait < synodic * 0.012;
  return { wait, dv, now, travel: tT, outward: r2 > r1 };
}
