import { PARTS, isEngine } from './parts.js';
import { G0 } from './physics.js';

export function makePart(id) {
  const def = PARTS[id];
  return { id, def, fuel: def.fuel, ignited: false, flame: 0, chute: 0, chuteT: 0, chuteCut: false };
}

/**
 * A stack of parts (index 0 = top). Coordinates along the axis use "s":
 * the top of the stack is s = 0 and s decreases downwards.
 */
export class Vessel {
  constructor(parts) {
    this.parts = parts;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.angle = Math.PI / 2; this.angVel = 0;
    this.throttle = 0; this.thrust = 0; this.gimbalTorque = 0;
    this.landed = null; this.dead = false; this.debris = false; this.age = 0;
    this.layout();
    this.updateMass();
  }

  static fromIds(ids) { return new Vessel(ids.map(makePart)); }

  layout() {
    let s = 0, maxW = 0.1, torque = 0, tol = 8, side = 0;
    for (const p of this.parts) {
      const d = p.def;
      p.sTop = s; p.sC = s - d.h / 2; s -= d.h;
      maxW = Math.max(maxW, d.w);
      torque += d.torque;
      side += d.w * d.h;
    }
    this.length = -s;
    this.maxW = maxW;
    this.sideArea = side;
    this.frontArea = Math.PI * (maxW / 2) ** 2;
    this.torqueWheels = torque;
    this.segs = this.computeSegs();
    const bottom = new Set(this.segs.length ? this.segs[this.segs.length - 1] : []);
    let hasLegs = false;
    this.parts.forEach((p, i) => { p.legsOut = p.def.type === 'legs' && bottom.has(i); if (p.legsOut) hasLegs = true; });
    // crash tolerance: legs help, otherwise the weakest bottom part decides
    const bottomPart = this.parts[this.parts.length - 1];
    tol = hasLegs ? 12 : (bottomPart && bottomPart.def.crash) || (this.parts.length === 1 || bottomPart?.def.type === 'pod' ? 14 : 7);
    if (this.parts.length && this.parts.every((p) => ['pod', 'chute', 'cone'].includes(p.def.type))) tol = 14;
    this.crashTol = tol;
    this.hasLegs = hasLegs;
    this.cdNose = (this.parts[0] && this.parts[0].def.cd) || 0.8;
    this.cdTail = (bottomPart && bottomPart.def.cdTail) || 0.9;
    this.hasControl = this.parts.some((p) => p.def.type === 'pod');
    // contact points relative to top
    const pts = [];
    for (const p of this.parts) {
      const d = p.def, hw = d.w / 2;
      pts.push([p.sTop - d.h, -hw], [p.sTop - d.h, hw], [p.sTop, -hw], [p.sTop, hw]);
      if (p.legsOut) pts.push([p.sTop - 2.4, -1.7], [p.sTop - 2.4, 1.7]);
    }
    this.contactRaw = pts;
    this.minS = Math.min(...pts.map((q) => q[0]));
  }

  computeSegs() {
    const segs = []; let cur = [];
    this.parts.forEach((p, i) => {
      if (p.def.type === 'decoupler' && cur.length) { segs.push(cur); cur = [i]; } else cur.push(i);
    });
    if (cur.length) segs.push(cur);
    return segs;
  }

  updateMass() {
    let m = 0, ms = 0;
    for (const p of this.parts) { p.m = p.def.mass + p.fuel; m += p.m; ms += p.m * p.sC; }
    this.mass = m;
    this.com = ms / m;
    let I = 0, lat = 0, damp = 0;
    for (const p of this.parts) {
      const d = p.sC - this.com;
      I += p.m * (d * d + (p.def.h * p.def.h) / 12);
      const A = p.def.w * p.def.h + (p.def.fin || 0);
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

  engineStep(dt, press, thr) {
    let F = 0, gT = 0;
    for (const seg of this.segs) {
      const liq = []; let need = 0;
      for (const i of seg) {
        const p = this.parts[i], d = p.def;
        if (!isEngine(d)) continue;
        if (!p.ignited) { p.flame = 0; continue; }
        const isp = d.ispVac + (d.ispSL - d.ispVac) * press;
        const flowMax = d.thrust / (d.ispVac * G0);
        if (d.type === 'srb') {
          if (p.fuel <= 0) { p.flame = 0; continue; }
          const use = Math.min(p.fuel, flowMax * dt);
          const frac = dt > 0 ? use / (flowMax * dt) : 1;
          p.fuel -= use;
          const f = ((d.thrust * isp) / d.ispVac) * frac;
          F += f; p.flame = frac;
        } else { liq.push(p); need += flowMax * thr * dt; }
      }
      if (!liq.length) continue;
      let tot = 0;
      for (const i of seg) { const p = this.parts[i]; if (p.def.type === 'tank') tot += p.fuel; }
      let frac = tot > 0 ? 1 : 0;
      if (need > 0 && tot > 0) {
        frac = Math.min(1, tot / need);
        const r = Math.min(1, need / tot);
        for (const i of seg) { const p = this.parts[i]; if (p.def.type === 'tank') p.fuel *= 1 - r; if (p.fuel < 1e-6) p.fuel = 0; }
      }
      for (const p of liq) {
        const d = p.def;
        const isp = d.ispVac + (d.ispSL - d.ispVac) * press;
        if (tot <= 0) { p.flame = 0; continue; }
        const f = ((d.thrust * isp) / d.ispVac) * thr * frac;
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
    for (const seg of this.segs) {
      let tot = 0;
      for (const i of seg) if (this.parts[i].def.type === 'tank') tot += this.parts[i].fuel;
      for (const i of seg) {
        const p = this.parts[i];
        if (!p.ignited) continue;
        if (p.def.type === 'srb' && p.fuel > 0) return 'srb';
        if (p.def.type === 'engine' && this.throttle > 0 && tot > 0) return 'liquid';
      }
    }
    return false;
  }

  nextStage() {
    const segs = this.segs;
    if (!segs.length) return null;
    const bottom = segs[segs.length - 1];
    const unlit = bottom.filter((i) => isEngine(this.parts[i].def) && !this.parts[i].ignited);
    if (unlit.length) return { type: 'ignite', parts: unlit, label: 'Ignite ' + [...new Set(unlit.map((i) => this.parts[i].def.name))].join(' + ') };
    if (segs.length > 1) return { type: 'decouple', label: 'Decouple stage' };
    const ch = this.parts.find((p) => p.def.type === 'chute' && !p.chute && !p.chuteCut);
    if (ch) return { type: 'chute', part: ch, label: 'Deploy parachute' };
    return null;
  }

  /** Removes the bottom segment and returns it as a new debris vessel. */
  splitBottom() {
    const seg = this.segs[this.segs.length - 1];
    const first = seg[0];
    const lower = this.parts.slice(first), upper = this.parts.slice(0, first);
    const ax = Math.cos(this.angle), ay = Math.sin(this.angle);
    const oldCom = this.com, ox = this.x, oy = this.y;
    const sTopLower = lower[0].sTop;
    this.parts = upper;
    this.layout(); this.updateMass();
    const dS = this.com - oldCom;
    this.x = ox + ax * dS; this.y = oy + ay * dS;
    for (const p of lower) if (p.def.type === 'engine') p.ignited = false;
    const deb = new Vessel(lower);
    const d2 = sTopLower + deb.com - oldCom;
    deb.x = ox + ax * d2; deb.y = oy + ay * d2;
    deb.vx = this.vx - ax * 2.5; deb.vy = this.vy - ay * 2.5;
    deb.angle = this.angle; deb.angVel = this.angVel + (Math.random() - 0.5) * 0.15;
    deb.debris = true;
    this.vx += ax * 0.6; this.vy += ay * 0.6;
    return deb;
  }

  /** Fuel fraction and estimated Δv of the active (bottom) stage. */
  stageStatus(press) {
    const seg = this.segs[this.segs.length - 1] || [];
    let fuel = 0, cap = 0, Fv = 0, flow = 0, hasEng = false;
    for (const i of seg) {
      const p = this.parts[i], d = p.def;
      if (d.type === 'tank' || d.type === 'srb') { fuel += p.fuel; cap += d.fuel; }
      if (isEngine(d)) {
        hasEng = true;
        const isp = d.ispVac + (d.ispSL - d.ispVac) * press;
        const f = (d.thrust * isp) / d.ispVac;
        Fv += f; flow += f / isp;
      }
    }
    const isp = flow > 0 ? Fv / flow : 0;
    const dv = hasEng && fuel > 0 ? isp * G0 * Math.log(this.mass / (this.mass - fuel)) : 0;
    return { frac: cap > 0 ? fuel / cap : 0, dv, thrustMax: Fv };
  }
}

/** Static stage analysis for the builder. */
export function analyzeDesign(ids) {
  if (!ids.length) return { stages: [], total: 0, mass: 0, height: 0, warnings: [] };
  const v = Vessel.fromIds(ids);
  const segs = v.segs;
  const stages = [];
  let total = 0;
  const wet = (seg) => seg.reduce((a, i) => a + v.parts[i].def.mass + v.parts[i].def.fuel, 0);
  for (let j = segs.length - 1; j >= 0; j--) {
    let m0 = 0;
    for (let k = 0; k <= j; k++) m0 += wet(segs[k]);
    const seg = segs[j];
    let tank = 0, srbFuel = 0, Fv = 0, Fs = 0, flowV = 0, flowS = 0, liquid = false;
    const names = [];
    for (const i of seg) {
      const d = v.parts[i].def;
      if (d.type === 'tank') tank += d.fuel;
      if (d.type === 'srb') srbFuel += d.fuel;
      if (isEngine(d)) {
        if (d.type === 'engine') liquid = true;
        names.push(d.name);
        Fv += d.thrust; flowV += d.thrust / d.ispVac;
        const fs = (d.thrust * d.ispSL) / d.ispVac;
        Fs += fs; flowS += fs / d.ispSL;
      }
    }
    const fuel = (liquid ? tank : 0) + srbFuel;
    const m1 = m0 - fuel;
    const ispV = flowV ? Fv / flowV : 0, ispS = flowS ? Fs / flowS : 0;
    const dvV = Fv && fuel ? ispV * G0 * Math.log(m0 / m1) : 0;
    const dvS = Fs && fuel ? ispS * G0 * Math.log(m0 / m1) : 0;
    stages.push({ num: segs.length - j, m0, m1, dvV, dvS, twrS: Fs / (m0 * G0), twrV: Fv / (m0 * G0), engines: [...new Set(names)], fuel });
    total += dvV;
  }
  const warnings = [];
  if (!v.hasControl) warnings.push('No command part — you will not be able to steer.');
  if (stages[0] && stages[0].engines.length && stages[0].twrS < 1) warnings.push('First stage TWR is below 1 — it will not leave the pad.');
  if (stages[0] && !stages[0].engines.length) warnings.push('The bottom stage has no engine.');
  stages.forEach((s) => { if (s.engines.length && !s.fuel) warnings.push(`Stage ${s.num} has engines but no fuel in the same stage.`); });
  if (v.length > 8 && !ids.includes('fins')) warnings.push('Tip: a fin ring near the bottom keeps tall rockets from flipping.');
  return { stages, total, mass: v.mass, height: v.length, warnings };
}
