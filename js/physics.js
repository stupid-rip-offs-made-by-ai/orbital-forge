// Celestial mechanics, atmosphere and terrain for the Verdan system.
export const G0 = 9.80665;

export const P = {
  id: 'verdan', name: 'Verdan', GM: 3.5316e12, R: 600000,
  atmo: { height: 70000, rho0: 1.225, H: 5600 },
  rotPeriod: 21600, soi: Infinity,
  tex: 'planet', clouds: 'clouds', ground: 'ground_grass',
  surfColor: '#86c455', fillColor: '#4d7a33', maxTerrain: 4200,
};
P.omega = (-2 * Math.PI) / P.rotPeriod; // spins clockwise, so "east" is to the right on screen

export const M = {
  id: 'lumen', name: 'Lumen', GM: 6.5138e10, R: 200000, atmo: null,
  orbitR: 1.2e7, phase0: 1.2, soi: 2.43e6,
  tex: 'moon', ground: 'ground_moon',
  surfColor: '#c9c8c2', fillColor: '#77766f', maxTerrain: 3400,
};
M.n = Math.sqrt(P.GM / M.orbitR ** 3);
M.omega = -M.n; // tidally locked, orbits clockwise like Verdan spins

export const BODIES = [P, M];
export const LAUNCH_TH = Math.PI / 2;
export const PAD_H = 70;

export const wrapA = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
};
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function bodyPos(b, t, o = {}) {
  if (b === P) { o.x = 0; o.y = 0; return o; }
  const a = M.phase0 - M.n * t;
  o.x = M.orbitR * Math.cos(a); o.y = M.orbitR * Math.sin(a);
  return o;
}
export function bodyVel(b, t, o = {}) {
  if (b === P) { o.x = 0; o.y = 0; return o; }
  const a = M.phase0 - M.n * t, s = M.orbitR * M.n;
  o.x = s * Math.sin(a); o.y = -s * Math.cos(a);
  return o;
}
export function bodyRot(b, t) {
  return b === P ? P.omega * t : M.phase0 - M.n * t + Math.PI;
}

/** Unflattened terrain height along the equator (the flight plane). */
export function terrainRaw(b, th) {
  if (b === P) {
    return 300 + 1900 * Math.sin(3 * th + 0.7) + 900 * Math.sin(7 * th + 2.1) + 450 * Math.sin(13 * th + 0.3)
      + 200 * Math.sin(29 * th + 1.9) + 80 * Math.sin(61 * th + 4.0) + 25 * Math.sin(143 * th + 1.0);
  }
  return 900 + 1100 * Math.sin(2 * th + 1) + 600 * Math.sin(5 * th + 0.5) + 320 * Math.sin(11 * th + 2)
    + 150 * Math.sin(23 * th + 0.2) + 70 * Math.sin(53 * th + 3) + 30 * Math.sin(131 * th + 1.3);
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
  let extra;
  if (b === P) {
    extra = 1300 * Math.sin(4 * th + 7 * lat + 1) * Math.sin(5 * lat + 0.3) + 650 * Math.sin(9 * th - 13 * lat)
      + 300 * Math.sin(23 * th + 31 * lat + 2) + 110 * Math.sin(57 * th - 71 * lat) + 40 * Math.sin(150 * th + 170 * lat);
    extra -= 1200 * Math.sin(lat * 2.2) ** 2; // oceans become more common away from the equator
    const h = terrainRaw(b, th) + extra * k;
    const d = Math.hypot(wrapA(th - LAUNCH_TH), lat);
    const f = padBlend(d);
    return h * f + PAD_H * (1 - f);
  }
  extra = 700 * Math.sin(3 * th + 8 * lat + 2) + 380 * Math.sin(12 * th - 15 * lat) + 160 * Math.sin(29 * th + 37 * lat + 1)
    + 60 * Math.sin(71 * th - 83 * lat);
  return terrainRaw(b, th) + extra * k;
}

/** Solid/liquid surface height (water counts as surface on Verdan). */
export function surfH(b, th) {
  const h = terrainH(b, th);
  return b === P ? Math.max(0, h) : h;
}

const ZERO_ATM = { rho: 0, p: 0 };
export function atmo(b, alt) {
  if (!b.atmo || alt >= b.atmo.height) return ZERO_ATM;
  const e = Math.exp(-Math.max(0, alt) / b.atmo.H);
  const top = b.atmo.height * 0.8;
  const taper = alt > top ? (b.atmo.height - alt) / (b.atmo.height - top) : 1;
  return { rho: b.atmo.rho0 * e * taper, p: e * taper };
}

const _m = {};
export function soiBody(x, y, t) {
  bodyPos(M, t, _m);
  const dx = x - _m.x, dy = y - _m.y;
  return dx * dx + dy * dy < M.soi * M.soi ? M : P;
}

/**
 * Patched-conic gravity (like the classic rocket games): only the body whose sphere of
 * influence you are in pulls on you. Inside Lumen's SOI we also add Lumen's own
 * acceleration so motion relative to Lumen is an exact conic. Orbits never drift.
 */
export function gravity(x, y, t, o) {
  bodyPos(M, t, _m);
  const dx = x - _m.x, dy = y - _m.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < M.soi * M.soi) {
    const d = Math.sqrt(d2), k = -M.GM / (d2 * d), n2 = M.n * M.n;
    o.ax = k * dx - n2 * _m.x; o.ay = k * dy - n2 * _m.y;
    return o;
  }
  const r2 = x * x + y * y, r = Math.sqrt(r2), k = -P.GM / (r2 * r);
  o.ax = k * x; o.ay = k * y;
  return o;
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
  const period = e < 1 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity;
  return { e, a, rp, ra, ex, ey, h, period, pe: rp - b.R, ap: ra - b.R, r, alt: r - b.R };
}

/** Numerically propagates a coasting trajectory (patched-conic style drawing data). */
export function predict(x, y, vx, vy, t0, maxSteps = 3500) {
  const pts = [];
  let t = t0, dom = soiBody(x, y, t), changes = 0, swept = 0, prev = null;
  let encounter = null, impact = null;
  const G = {}, bp = {};
  for (let i = 0; i < maxSteps; i++) {
    bodyPos(dom, t, bp);
    const rx = x - bp.x, ry = y - bp.y, r = Math.hypot(rx, ry);
    const dt = Math.min(4000, Math.max(0.5, 0.008 * Math.sqrt((r * r * r) / dom.GM)));
    gravity(x, y, t, G);
    vx += G.ax * dt * 0.5; vy += G.ay * dt * 0.5;
    x += vx * dt; y += vy * dt; t += dt;
    gravity(x, y, t, G);
    vx += G.ax * dt * 0.5; vy += G.ay * dt * 0.5;
    const nd = soiBody(x, y, t);
    if (nd !== dom) {
      dom = nd; changes++; swept = 0; prev = null;
      if (dom === M && !encounter) encounter = { minD: Infinity, x: 0, y: 0, t };
    }
    bodyPos(dom, t, bp);
    const qx = x - bp.x, qy = y - bp.y, q = Math.hypot(qx, qy);
    if (dom === M) {
      pts.push({ moon: true, x: qx, y: qy });
      if (encounter && q < encounter.minD) { encounter.minD = q; encounter.x = qx; encounter.y = qy; }
    } else pts.push({ moon: false, x, y });
    if (q < dom.R) { impact = { moon: dom === M, x: dom === M ? qx : x, y: dom === M ? qy : y, body: dom }; break; }
    const ang = Math.atan2(qy, qx);
    if (prev !== null) swept += Math.abs(wrapA(ang - prev));
    prev = ang;
    if (swept > 2 * Math.PI + 0.02 || changes > 3) break;
    if (Math.hypot(x, y) > M.orbitR * 3) break;
  }
  if (encounter && encounter.minD < Infinity) encounter.pe = encounter.minD - M.R; else if (encounter) encounter = null;
  return { pts, encounter, impact };
}
