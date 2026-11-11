import { PARTS, isEngine, sideOk } from './parts.js';
import { G0 } from './physics.js';

export function makePart(id, n = 1) {
  const def = PARTS[id];
  return { id, def, n, lat: 0, grp: null, fuel: def.fuel, ignited: false, flame: 0, chute: 0, chuteT: 0, chuteCut: false };
}

/** Cleans a design into [{ id, side: [ids] }], dropping anything unknown or not allowed. */
export function normDesign(design) {
  const out = [];
  for (const e of design || []) {
    const id = typeof e === 'string' ? e : e && e.id;
    const d = PARTS[id];
    if (!d || d.sideOnly) continue;
    const side = (typeof e === 'object' && Array.isArray(e.side) ? e.side : []).filter((s) => PARTS[s] && sideOk(PARTS[s]));
    out.push({ id, side: d.type === 'decoupler' ? [] : side });
  }
  return out;
}
/** Back to the compact saved form. */
export const packDesign = (design) => normDesign(design).map((e) => (e.side.length ? { id: e.id, side: e.side.slice() } : e.id));

/** Isp at a pressure in atmospheres. Thick air (p > 1) chokes engines further. */
export const ispAt = (d, p) => Math.max(d.ispVac * 0.08, d.ispVac + (d.ispSL - d.ispVac) * p);

/**
 * A core stack of parts (index 0 = top) plus side groups: stacks mounted as mirrored pairs
 * on a core part. Coordinates along the axis use "s": the top of the core is s = 0 and s
 * decreases downwards; "lat" is the sideways offset. A side part object stands for the
 * pair (n = 2).
 */
export class Vessel {
  constructor(core, groups = []) {
    this.core = core; this.groups = groups;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.angle = Math.PI / 2; this.angVel = 0;
    this.throttle = 0; this.thrust = 0; this.gimbalTorque = 0;
    this.landed = null; this.dead = false; this.debris = false; this.age = 0;
    this.layout();
    this.updateMass();
  }

  static fromDesign(design) {
    const core = [], groups = [];
    for (const e of normDesign(design)) {
      const p = makePart(e.id);
      core.push(p);
      if (e.side.length) groups.push({ host: p, parts: e.side.map((id) => makePart(id, 2)) });
    }
    return new Vessel(core, groups);
  }
  static fromIds(design) { return Vessel.fromDesign(design); }

  layout() {
    const core = this.core;
    this.parts = core.concat(...this.groups.map((g) => g.parts));
    this.nCore = core.length;
    let s = 0, maxW = 0.1, front = 0;
    for (const p of core) {
      const d = p.def;
      p.sTop = s; p.sC = s - d.h / 2; s -= d.h; p.lat = 0; p.n = 1; p.grp = null;
      maxW = Math.max(maxW, d.w);
    }
    this.length = -s;
    this.maxW = maxW;
    front = Math.PI * (maxW / 2) ** 2;
    let idx = core.length;
    for (const g of this.groups) {
      const gw = Math.max(...g.parts.map((p) => p.def.w));
      g.lat = g.host.def.w / 2 + gw / 2;
      let gs = g.host.sTop;
      const first = g.parts[0].def;
      if (g.parts.length > 1 && (first.type === 'cone' || (first.type === 'chute' && !first.sideOnly))) gs += first.h; // caps poke up above the mount
      g.idx = [];
      let gf = 0;
      for (const p of g.parts) {
        const d = p.def;
        p.sTop = gs; p.sC = gs - d.h / 2; gs -= d.h; p.lat = g.lat; p.n = 2; p.grp = g;
        g.idx.push(idx++);
        gf = Math.max(gf, d.sideOnly ? 0.03 : Math.PI * (d.w / 2) ** 2);
      }
      g.droppable = g.parts.some((p) => isEngine(p.def) || p.def.type === 'tank');
      front += 2 * gf;
    }
    let side = 0, torque = 0;
    for (const p of this.parts) { side += p.n * p.def.w * p.def.h; torque += p.def.torque; }
    this.sideArea = side;
    this.frontArea = front;
    this.torqueWheels = torque;
    this.segs = this.computeSegs();
    const bottom = new Set(this.segs.length ? this.segs[this.segs.length - 1] : []);
    this.active = this.groups.filter((g) => bottom.has(core.indexOf(g.host)));
    this.pools = this.segs.concat(this.groups.map((g) => g.idx));
    let hasLegs = false;
    core.forEach((p, i) => { p.legsOut = p.def.type === 'legs' && bottom.has(i); if (p.legsOut) hasLegs = true; });
    // crash tolerance: legs help, otherwise the weakest bottom part decides
    const bottomPart = core[core.length - 1];
    let tol = hasLegs ? 12 : (bottomPart && bottomPart.def.crash) || (core.length === 1 || bottomPart?.def.type === 'pod' ? 14 : 7);
    if (core.length && this.parts.every((p) => ['pod', 'chute', 'cone', 'gyro', 'deco'].includes(p.def.type))) tol = 14;
    this.crashTol = tol;
    this.hasLegs = hasLegs;
    this.cdNose = (core[0] && core[0].def.cd) || 0.8;
    this.cdTail = (bottomPart && bottomPart.def.cdTail) || 0.9;
    this.hasControl = core.some((p) => p.def.type === 'pod');
    // contact points: [s, lat]
    const pts = [];
    for (const p of this.parts) {
      const d = p.def, hw = d.w / 2;
      for (const sg of p.n === 2 ? [1, -1] : [1]) {
        pts.push([p.sTop - d.h, sg * (p.lat - hw)], [p.sTop - d.h, sg * (p.lat + hw)], [p.sTop, sg * (p.lat - hw)], [p.sTop, sg * (p.lat + hw)]);
      }
      if (p.legsOut) { const k = d.legScale || 1; pts.push([p.sTop - 2.4 * k, -1.7 * k], [p.sTop - 2.4 * k, 1.7 * k]); }
    }
    this.contactRaw = pts;
    this.minS = pts.length ? Math.min(...pts.map((q) => q[0])) : 0;
    this.maxS = pts.length ? Math.max(...pts.map((q) => q[0])) : 0;
  }

  /** Core segments: index lists split at decouplers. */
  computeSegs() {
    const segs = []; let cur = [];
    this.core.forEach((p, i) => {
      if (p.def.type === 'decoupler' && cur.length) { segs.push(cur); cur = [i]; } else cur.push(i);
    });
    if (cur.length) segs.push(cur);
    return segs;
  }

  updateMass() {
    let m = 0, ms = 0;
    for (const p of this.parts) { p.m = p.n * (p.def.mass + p.fuel); m += p.m; ms += p.m * p.sC; }
    this.mass = m;
    this.com = m > 0 ? ms / m : 0;
    let I = 0, lat = 0, damp = 0;
    for (const p of this.parts) {
      const d = p.sC - this.com;
      I += p.m * (d * d + (p.def.h * p.def.h) / 12 + p.lat * p.lat);
      const A = p.n * (p.def.w * p.def.h + (p.def.fin || 0));
      lat += A * -d;
      damp += A * d * d;
    }
    this.inertia = Math.max(I, 30);
    this.latMoment = lat;
    this.latDamp = damp;
    this.bottomDist = this.com - this.minS;
  }

  axis() { return [Math.cos(this.angle), Math.sin(this.angle)]; }

  /** World position of a point at axis offset s (from top) and lateral offset l. */
  worldPt(s, l, out = [0, 0]) {
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    const d = s - this.com;
    out[0] = this.x + ax * d - ay * l;
    out[1] = this.y + ay * d + ax * l;
    return out;
  }

  /** Burns fuel for dt seconds. press in atmospheres. Each pool (stage or side group) feeds its own engines. */
  engineStep(dt, press, thr) {
    let F = 0, gT = 0;
    for (const pool of this.pools) {
      const liq = []; let need = 0;
      for (const i of pool) {
        const p = this.parts[i], d = p.def;
        if (!isEngine(d)) continue;
        if (!p.ignited) { p.flame = 0; continue; }
        const flow = d.thrust / (d.ispVac * G0); // per unit
        if (d.type === 'srb') {
          if (p.fuel <= 0) { p.flame = 0; continue; }
          const use = Math.min(p.fuel, flow * dt);
          const frac = dt > 0 ? use / (flow * dt) : 1;
          p.fuel -= use;
          F += p.n * ((d.thrust * ispAt(d, press)) / d.ispVac) * frac;
          p.flame = frac;
        } else { liq.push(p); need += p.n * flow * thr * dt; }
      }
      if (!liq.length) continue;
      let tot = 0;
      for (const i of pool) { const p = this.parts[i]; if (p.def.type === 'tank') tot += p.n * p.fuel; }
      let frac = tot > 0 ? 1 : 0;
      if (need > 0 && tot > 0) {
        frac = Math.min(1, tot / need);
        const r = Math.min(1, need / tot);
        for (const i of pool) { const p = this.parts[i]; if (p.def.type === 'tank') { p.fuel *= 1 - r; if (p.fuel < 1e-6) p.fuel = 0; } }
      }
      for (const p of liq) {
        const d = p.def;
        if (tot <= 0) { p.flame = 0; continue; }
        const f = p.n * ((d.thrust * ispAt(d, press)) / d.ispVac) * thr * frac;
        F += f; p.flame = thr * frac;
        gT += f * Math.sin(d.gimbal) * Math.abs(p.sC - this.com);
      }
    }
    this.thrust = F;
    this.gimbalTorque = gT;
    return F;
  }

  /** Can produce thrust right now (used to block time-warp). */
  isBurning() {
    for (const pool of this.pools) {
      let tot = 0;
      for (const i of pool) if (this.parts[i].def.type === 'tank') tot += this.parts[i].fuel;
      for (const i of pool) {
        const p = this.parts[i];
        if (!p.ignited) continue;
        if (p.def.type === 'srb' && p.fuel > 0) return 'srb';
        if (p.def.type === 'engine' && this.throttle > 0 && tot > 0) return 'liquid';
      }
    }
    return false;
  }

  /** Part indices of the bottom core stage plus everything mounted on its sides. */
  stageIdx() {
    const out = (this.segs[this.segs.length - 1] || []).slice();
    for (const g of this.active) out.push(...g.idx);
    return out;
  }

  nextStage() {
    if (!this.segs.length) return null;
    const unlit = this.stageIdx().filter((i) => isEngine(this.parts[i].def) && !this.parts[i].ignited);
    if (unlit.length) {
      const names = [...new Set(unlit.map((i) => this.parts[i].def.name))];
      return { type: 'ignite', parts: unlit, label: 'Ignite ' + (names.length > 2 ? 'all engines' : names.join(' + ')) };
    }
    if (this.active.some((g) => g.droppable)) return { type: 'boosters', label: 'Drop side boosters' };
    if (this.segs.length > 1) return { type: 'decouple', label: 'Decouple stage' };
    const ch = this.parts.find((p) => p.def.type === 'chute' && !p.chute && !p.chuteCut);
    if (ch) return { type: 'chute', part: ch, label: 'Deploy parachute' };
    return null;
  }

  /** Re-lays out after parts were removed, keeping the remaining mass where it was. */
  reshape() {
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    const oldCom = this.com;
    this.layout(); this.updateMass();
    const dS = this.com - oldCom;
    this.x += ax * dS; this.y += ay * dS;
  }

  /** Drops the side boosters of the bottom stage. Returns them as debris vessels (left and right). */
  dropBoosters() {
    const out = [];
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    const drop = this.active.filter((g) => g.droppable);
    for (const g of drop) {
      for (const sg of [1, -1]) {
        const clones = g.parts.map((p) => {
          const c = makePart(p.id);
          c.fuel = p.fuel; c.ignited = p.def.type === 'srb' && p.ignited; c.chuteCut = true;
          return c;
        });
        const deb = new Vessel(clones);
        const w = this.worldPt(g.parts[0].sTop + deb.com, sg * g.lat);
        deb.x = w[0]; deb.y = w[1];
        deb.vx = this.vx - ay * sg * 4 - ax * 1.5; deb.vy = this.vy + ax * sg * 4 - ay * 1.5;
        deb.angle = this.angle; deb.angVel = this.angVel + sg * 0.35;
        deb.debris = true;
        out.push(deb);
      }
    }
    this.groups = this.groups.filter((g) => !drop.includes(g));
    this.reshape();
    return out;
  }

  /** Removes the bottom core segment (with anything on its sides) and returns it as a debris vessel. */
  splitBottom() {
    const seg = this.segs[this.segs.length - 1];
    const first = seg[0];
    const lower = this.core.slice(first), upper = this.core.slice(0, first);
    const lowerG = this.groups.filter((g) => lower.includes(g.host));
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    const oldCom = this.com, ox = this.x, oy = this.y;
    const sTopLower = lower[0].sTop;
    this.core = upper;
    this.groups = this.groups.filter((g) => !lowerG.includes(g));
    this.layout(); this.updateMass();
    const dS = this.com - oldCom;
    this.x = ox + ax * dS; this.y = oy + ay * dS;
    for (const p of lower.concat(...lowerG.map((g) => g.parts))) if (p.def.type === 'engine') p.ignited = false;
    const deb = new Vessel(lower, lowerG);
    const d2 = sTopLower + deb.com - oldCom;
    deb.x = ox + ax * d2; deb.y = oy + ay * d2;
    deb.vx = this.vx - ax * 2.5; deb.vy = this.vy - ay * 2.5;
    deb.angle = this.angle; deb.angVel = this.angVel + (Math.random() - 0.5) * 0.15;
    deb.debris = true;
    this.vx += ax * 0.6; this.vy += ay * 0.6;
    return deb;
  }

  /** Burn data for each pool of the current stage (bottom core stage + its side groups). */
  stagePools(press) {
    const pools = [this.segs[this.segs.length - 1] || []].concat(this.active.map((g) => g.idx));
    return pools.map((pool, k) => {
      let tank = 0, srb = 0, cap = 0, F = 0, Fv = 0, flow = 0, liquid = false;
      const names = [];
      for (const i of pool) {
        const p = this.parts[i], d = p.def;
        if (d.type === 'tank') { tank += p.n * p.fuel; cap += p.n * d.fuel; }
        if (isEngine(d)) {
          const fl = (p.n * d.thrust) / (d.ispVac * G0);
          if (d.type === 'srb') { srb += p.n * p.fuel; cap += p.n * d.fuel; if (p.fuel <= 0) continue; } else liquid = true;
          names.push((p.n > 1 ? p.n + '× ' : '') + d.name);
          Fv += p.n * d.thrust; F += fl * ispAt(d, press) * G0; flow += fl;
        }
      }
      const fuel = (liquid ? tank : 0) + srb;
      return { pool, core: k === 0, group: k ? this.active[k - 1] : null, fuel, cap, F, Fv, flow, names };
    });
  }

  /** Fuel fraction and estimated Δv of the active stage (including its side boosters). */
  stageStatus(press) {
    let fuel = 0, cap = 0, F = 0, flow = 0;
    for (const q of this.stagePools(press)) {
      cap += q.cap;
      if (q.flow > 0) { fuel += q.fuel; F += q.F; flow += q.flow; }
    }
    const isp = flow > 0 ? F / (flow * G0) : 0;
    const dv = fuel > 0 && fuel < this.mass ? isp * G0 * Math.log(this.mass / (this.mass - fuel)) : 0;
    return { frac: cap > 0 ? Math.min(1, fuel / cap) : 0, dv, thrustMax: F };
  }
}

/** Static stage-by-stage analysis for the builder (simulates burning and dropping everything in order). */
export function analyzeDesign(design) {
  const v = Vessel.fromDesign(design);
  if (!v.parts.length) return { stages: [], total: 0, mass: 0, height: 0, warnings: [] };
  const mass = v.mass, height = v.maxS - Math.min(v.minS, -v.length);
  const hasControl = v.hasControl, hasFin = v.parts.some((p) => p.def.fin), tall = v.length > 8;
  const stages = [];
  let total = 0, burned = false, coreNum = v.segs.length;
  const emptyRow = () => stages.push({ num: stages.length + 1, dvV: 0, dvS: 0, twrS: 0, twrV: 0, engines: [], fuel: 0, m0: v.mass });
  for (let guard = 0; guard < 60; guard++) {
    v.updateMass();
    const pv = v.stagePools(0), ps = v.stagePools(1);
    const live = pv.map((q, i) => ({ q, s: ps[i] })).filter((z) => z.q.fuel > 1e-6 && z.q.flow > 0);
    if (live.length) {
      const t = Math.min(...live.map((z) => z.q.fuel / z.q.flow));
      let flow = 0, Fv = 0, Fs = 0;
      const names = [];
      for (const z of live) { flow += z.q.flow; Fv += z.q.F; Fs += z.s.F; names.push(...z.q.names); }
      const m0 = v.mass, used = flow * t, m1 = m0 - used;
      const dvV = (Fv / flow) * Math.log(m0 / m1), dvS = (Fs / flow) * Math.log(m0 / m1);
      stages.push({ num: stages.length + 1, m0, m1, dvV, dvS, twrS: Fs / (m0 * G0), twrV: Fv / (m0 * G0), engines: [...new Set(names)], fuel: used,
        boosters: live.some((z) => !z.q.core) });
      total += dvV; burned = true;
      for (const z of live) {
        const k = 1 - Math.min(1, (z.q.flow * t) / z.q.fuel);
        for (const i of z.q.pool) { const p = v.parts[i]; if (p.def.type === 'tank' || p.def.type === 'srb') p.fuel = k < 1e-9 ? 0 : p.fuel * k; }
      }
      v.updateMass();
      const drop = v.active.filter((g) => g.droppable);
      if (drop.length && v.stagePools(0).filter((q) => !q.core && q.group.droppable).every((q) => q.fuel <= 1e-6 || q.flow === 0)) v.dropBoosters();
      continue;
    }
    if (v.active.some((g) => g.droppable)) { v.dropBoosters(); continue; }
    if (!burned) emptyRow();
    if (v.segs.length > 1) { v.splitBottom(); burned = false; coreNum--; continue; }
    break;
  }
  const warnings = [];
  const first = stages[0];
  if (!hasControl) warnings.push('No command part — you will not be able to steer.');
  if (first && first.engines.length && first.twrS < 1) warnings.push('First stage TWR is below 1 — it will not leave the pad.');
  if (first && !first.engines.length) warnings.push('The bottom stage has no engine with fuel.');
  if (tall && !hasFin) warnings.push('Tip: fins near the bottom keep tall rockets from flipping.');
  return { stages, total, mass, height, warnings };
}
