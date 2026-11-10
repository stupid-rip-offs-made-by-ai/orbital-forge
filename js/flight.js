import {
  P, M, G0, LAUNCH_TH, bodyPos, bodyVel, bodyRot, atmo, soiBody, gravity, orbitInfo, predict, terrainH, surfH, wrapA,
} from './physics.js';
import { Vessel } from './vessel.js';
import { isEngine } from './parts.js';
import * as audio from './audio.js';
import * as missions from './missions.js';

export const WARPS = [1, 2, 3, 4, 10, 50, 100, 1000, 10000, 100000];
const PHYS_MAX = 3; // index of the highest physics warp (4x)

const BP = {}, BV = {}, G = {};

export class Flight {
  constructor(ids, hooks) {
    this.ids = ids.slice();
    this.hooks = hooks; // { toast, onEnd }
    this.t = 0; this.met = 0; this.launched = false;
    this.vessel = Vessel.fromIds(ids);
    this.vessel.landed = { body: P, lat: LAUNCH_TH, tilt: 0 };
    this.placeLanded(this.vessel);
    this.debris = []; this.particles = [];
    this.warpIdx = 0; this.map = false; this.mapFocus = 'ship';
    this.cam = { yaw: 0.35, pitch: 0.12, dist: Math.max(14, this.vessel.length * 2.4 + 8) };
    this.mapCam = { yaw: 0, pitch: 0, dist: 3.4e6 };
    this.sas = 'stab'; this.rotInput = 0; this.thrInput = 0;
    this.q = 0; this.heat = 0; this.gforce = 1; this.shake = 0;
    this.pred = null; this.predTimer = 0;
    this.flags = { space: false, moonLanded: false };
    this.result = null; this.deathTimer = 0; this.boomPos = null;
    this.status = 'Ready on the pad';
    this.lastWarpMsg = 0;
    this.updateOrbit();
  }

  // ------------------------------------------------------------ helpers
  get dom() { return soiBody(this.vessel.x, this.vessel.y, this.t); }

  placeLanded(v) {
    const L = v.landed, b = L.body;
    bodyPos(b, this.t, BP); bodyVel(b, this.t, BV);
    const wa = L.lat + bodyRot(b, this.t);
    const ux = Math.cos(wa), uy = Math.sin(wa);
    const r = b.R + surfH(b, L.lat) + v.bottomDist + 0.02;
    v.x = BP.x + ux * r; v.y = BP.y + uy * r;
    v.vx = BV.x - b.omega * uy * r; v.vy = BV.y + b.omega * ux * r;
    v.angle = wa + L.tilt; v.angVel = b.omega;
  }

  maxWarpIdx() {
    const v = this.vessel;
    if (v.dead) return PHYS_MAX;
    if (v.isBurning()) return PHYS_MAX;
    if (!v.landed) {
      const d = this.dom;
      if (d.atmo) {
        bodyPos(d, this.t, BP);
        const alt = Math.hypot(v.x - BP.x, v.y - BP.y) - d.R;
        if (alt < d.atmo.height) return PHYS_MAX;
      }
      // keep warp sane when skimming a surface
      const alt2 = this.orbit ? this.orbit.alt : 1e9;
      if (alt2 < 6000) return 4;
    }
    return WARPS.length - 1;
  }

  warp(dir) {
    const want = Math.max(0, Math.min(WARPS.length - 1, this.warpIdx + dir));
    const max = this.maxWarpIdx();
    if (want > max) {
      const v = this.vessel;
      const why = v.isBurning() === 'srb' ? 'Solid boosters are burning' : v.isBurning() ? 'Cut throttle (X) to time-warp' : 'Only physics warp (4×) in atmosphere';
      this.hooks.toast(why);
      this.warpIdx = max;
      return;
    }
    this.warpIdx = want;
  }

  setSAS(mode) {
    if (!this.vessel.hasControl && mode !== 'off') { this.hooks.toast('No command part — no SAS'); return; }
    this.sas = mode;
  }

  stage() {
    const v = this.vessel;
    if (v.dead || this.result) return;
    const st = v.nextStage();
    if (!st) { this.hooks.toast('No stages left'); return; }
    if (st.type === 'ignite') {
      for (const i of st.parts) v.parts[i].ignited = true;
      if (!this.launched && v.throttle === 0 && st.parts.some((i) => v.parts[i].def.type === 'engine')) v.throttle = 1;
      audio.blip(660);
    } else if (st.type === 'decouple') {
      const deb = v.splitBottom();
      this.debris.push(deb);
      for (const i of v.segs[v.segs.length - 1]) {
        const p = v.parts[i];
        if (isEngine(p.def)) p.ignited = true;
      }
      audio.clunk();
      this.sparks(deb.x, deb.y, v.vx, v.vy, 18);
    } else if (st.type === 'chute') {
      this.deployChute(st.part);
    }
    this.updateOrbit();
  }

  deployChute(p) {
    p = p || this.vessel.parts.find((q) => q.def.type === 'chute' && !q.chute && !q.chuteCut);
    if (!p) { this.hooks.toast('No parachute ready'); return; }
    p.chute = 1; p.chuteT = this.t;
    audio.clunk();
  }

  // ------------------------------------------------------------ main update
  update(dtReal) {
    const v = this.vessel;
    // throttle & warp limits
    if (this.thrInput) v.throttle = Math.max(0, Math.min(1, v.throttle + this.thrInput * dtReal * 0.9));
    const maxW = this.maxWarpIdx();
    if (this.warpIdx > maxW) {
      this.warpIdx = maxW;
      if (performance.now() - this.lastWarpMsg > 3000) { this.hooks.toast('Time warp reduced'); this.lastWarpMsg = performance.now(); }
    }
    const warp = WARPS[this.warpIdx];
    const rails = warp > 4;
    if (rails && this.debris.length) this.debris = [];
    let remaining = dtReal * warp;
    let steps = 0;
    if (!v.dead && v.landed && rails) {
      this.t += remaining; remaining = 0; this.placeLanded(v);
    }
    while (remaining > 1e-9 && steps < 4000) {
      let h;
      if (!rails) h = Math.min(remaining, 0.02);
      else {
        const d = this.dom; bodyPos(d, this.t, BP);
        const r = Math.hypot(v.x - BP.x, v.y - BP.y);
        h = Math.min(remaining, Math.max(0.02, 0.006 * Math.sqrt((r * r * r) / d.GM)));
      }
      this.step(h, rails);
      for (const d of this.debris) this.stepDebris(d, h);
      remaining -= h; steps++;
    }
    this.debris = this.debris.filter((d) => !d.gone);
    if (this.launched && !v.dead) this.met += dtReal * warp;

    this.updateParticles(dtReal, warp);
    this.shake *= Math.exp(-dtReal * 3);
    this.updateOrbit();
    this.predTimer -= dtReal;
    if (this.predTimer <= 0 && !v.dead) {
      this.predTimer = this.map ? 0.15 : 0.6;
      this.pred = v.landed ? null : predict(v.x, v.y, v.vx, v.vy, this.t, this.map ? 3500 : 1500);
    }
    this.checkMissions();
    if (v.dead && !this.result) {
      this.deathTimer -= dtReal;
      if (this.deathTimer <= 0) { this.result = { ok: false, msg: this.deathMsg }; this.hooks.onEnd(this.result); }
    }
    // sound
    const st = this.vessel.dead ? 0 : Math.min(1, v.thrust / Math.max(1, v.stageStatus(0).thrustMax || 1));
    audio.setEngine(warp <= 4 ? st : 0, this.press || 0);
  }

  controlCmd(v, avail, dom, alt) {
    if (!v.hasControl) return 0;
    if (avail <= 0) return this.rotInput;
    const maxAcc = avail / v.inertia;
    if (this.rotInput) {
      // fly-by-wire: the stick commands a turn rate, so small rockets don't spin wildly
      const rate = this.rotInput * Math.min(0.55, Math.sqrt(maxAcc) * 0.6);
      return Math.max(-1, Math.min(1, (rate - v.angVel) / (maxAcc * 0.12 + 1e-9)));
    }
    if (this.sas === 'off') return 0;
    if (this.sas === 'stab') return Math.max(-1, Math.min(1, (-v.angVel / (maxAcc * 0.25 + 1e-9))));
    const target = this.sasTarget(v, dom, alt);
    if (target === null) return 0;
    const err = wrapA(target - v.angle);
    const desired = Math.sign(err) * Math.min(Math.sqrt(2 * maxAcc * 0.5 * Math.abs(err)), 1.5);
    return Math.max(-1, Math.min(1, (desired - v.angVel) / (maxAcc * 0.15 + 1e-9)));
  }

  refVel(v, dom) {
    bodyPos(dom, this.t, BP); bodyVel(dom, this.t, BV);
    const rx = v.x - BP.x, ry = v.y - BP.y;
    let vx = v.vx - BV.x, vy = v.vy - BV.y;
    const alt = Math.hypot(rx, ry) - dom.R;
    const surface = dom.atmo ? alt < 36000 : alt < 8000;
    if (surface) { vx += dom.omega * ry; vy -= dom.omega * rx; }
    return { vx, vy, rx, ry, surface };
  }

  sasTarget(v, dom, alt) {
    const r = this.refVel(v, dom);
    const sp = Math.hypot(r.vx, r.vy);
    const up = Math.atan2(r.ry, r.rx);
    switch (this.sas) {
      case 'pro': return sp > 0.5 ? Math.atan2(r.vy, r.vx) : null;
      case 'retro': return sp > 0.5 ? Math.atan2(-r.vy, -r.vx) : null;
      case 'radout': return up;
      case 'radin': return up + Math.PI;
      case 'up': return up;
      default: return null;
    }
  }

  step(h, rails) {
    const v = this.vessel;
    if (v.dead) { this.t += h; return; }
    if (v.landed) { this.stepLanded(h); return; }
    const t = this.t;
    const dom = soiBody(v.x, v.y, t);
    bodyPos(dom, t, BP); bodyVel(dom, t, BV);
    const rx = v.x - BP.x, ry = v.y - BP.y, r = Math.hypot(rx, ry);
    const alt = r - dom.R;
    const at = atmo(dom, alt);
    this.press = at.p;
    v.updateMass();
    const F = rails ? (v.thrust = 0, 0) : v.engineStep(h, at.p, v.throttle);
    v.updateMass();
    const m = v.mass;
    const ax = Math.cos(v.angle), ay = Math.sin(v.angle);
    gravity(v.x, v.y, t, G);
    let fx = F * ax, fy = F * ay, torque = 0;

    // aerodynamics
    let vrx = v.vx - BV.x, vry = v.vy - BV.y;
    if (dom.atmo) { vrx += dom.omega * ry; vry -= dom.omega * rx; }
    const vr = Math.hypot(vrx, vry);
    this.q = 0; this.heat = 0;
    let chuteOpen = 0;
    if (at.rho > 0 && vr > 0.01) {
      const q = 0.5 * at.rho * vr * vr;
      this.q = q;
      const alpha = wrapA(Math.atan2(vry, vrx) - v.angle);
      const ca = Math.abs(Math.cos(alpha)), sa = Math.abs(Math.sin(alpha));
      const cdF = Math.cos(alpha) > 0 ? v.cdNose : v.cdTail;
      const cda = cdF * v.frontArea * ca + 0.6 * v.sideArea * sa;
      let Fd = q * cda;
      const ux = vrx / vr, uy = vry / vr;
      // parachutes
      for (const p of v.parts) {
        if (p.def.type !== 'chute' || p.chute !== 1) continue;
        if (q > 30000 && this.t - p.chuteT < 3) { p.chute = 0; p.chuteCut = true; this.hooks.toast('Parachute ripped — too fast!'); continue; }
        const open = Math.min(1, (this.t - p.chuteT) / 3) ** 2;
        chuteOpen = Math.max(chuteOpen, open);
        const Fc = q * open * p.def.chuteCdA;
        Fd += Fc;
        const dC = p.sTop - v.com;
        torque += dC * (ax * (-uy * Fc) - ay * (-ux * Fc));
      }
      fx -= ux * Fd; fy -= uy * Fd;
      torque += q * Math.sin(alpha) * v.latMoment * 0.25;
      torque -= (v.angVel - (dom.omega || 0)) * q * v.latDamp * 0.25 / Math.max(vr, 5);
      this.heat = Math.min(1, Math.max(0, (vr - 1300) / 1400) * Math.min(1, at.rho * 40));
    }
    this.vrel = vr;

    // attitude control
    const avail = v.torqueWheels + (rails ? 0 : v.gimbalTorque);
    const cmd = this.controlCmd(v, avail, dom, alt);
    torque += cmd * avail;
    if (!rails) {
      v.angVel += (torque / v.inertia) * h;
      if (chuteOpen > 0) v.angVel *= Math.exp(-3 * h * chuteOpen);
      v.angVel = Math.max(-6, Math.min(6, v.angVel));
      v.angle += v.angVel * h;
    } else {
      v.angVel = 0;
      if (['pro', 'retro', 'radout', 'radin'].includes(this.sas) && v.hasControl) {
        const tg = this.sasTarget(v, dom, alt);
        if (tg !== null) v.angle = tg;
      }
    }

    // velocity-Verlet (kick-drift-kick): orbits stay put even at 100,000× warp
    const fax = fx / m, fay = fy / m;
    v.vx += (G.ax + fax) * h * 0.5; v.vy += (G.ay + fay) * h * 0.5;
    v.x += v.vx * h; v.y += v.vy * h;
    this.t += h;
    gravity(v.x, v.y, this.t, G);
    v.vx += (G.ax + fax) * h * 0.5; v.vy += (G.ay + fay) * h * 0.5;
    this.gforce = Math.hypot(fx, fy) / m / G0;
    if (alt < dom.maxTerrain + v.length + 60 + Math.hypot(v.vx, v.vy) * h * 2) this.checkGround(v, dom);
  }

  stepLanded(h) {
    const v = this.vessel, L = v.landed, b = L.body;
    bodyPos(b, this.t, BP);
    const r = Math.hypot(v.x - BP.x, v.y - BP.y);
    const at = atmo(b, r - b.R);
    this.press = at.p; this.q = 0; this.heat = 0;
    v.updateMass();
    const F = v.engineStep(h, at.p, v.throttle);
    v.updateMass();
    this.t += h;
    const g = b.GM / (r * r);
    const upF = F * Math.cos(L.tilt);
    this.gforce = 1;
    for (const p of v.parts) if (p.def.type === 'chute' && p.chute === 1 && L.body === P) { /* collapse on ground */ p.chute = 0; p.chuteCut = true; }
    if (upF > v.mass * g * 1.001) {
      v.landed = null;
      this.liftoffT = this.t;
      const wasPad = !this.launched;
      this.launched = true;
      if (wasPad) this.status = 'Liftoff!';
      // tiny nudge to clear the ground
      this.placeLandedNoClear(v, b, L);
      return;
    }
    this.placeLanded(v);
  }

  placeLandedNoClear(v, b, L) {
    const wa = L.lat + bodyRot(b, this.t);
    v.x += Math.cos(wa) * 0.05; v.y += Math.sin(wa) * 0.05;
  }

  checkGround(v, dom) {
    bodyPos(dom, this.t, BP); bodyVel(dom, this.t, BV);
    const rot = bodyRot(dom, this.t);
    let hit = false, water = false;
    const w = [0, 0];
    for (const [s, l] of v.contactRaw) {
      v.worldPt(s, l, w);
      const dx = w[0] - BP.x, dy = w[1] - BP.y;
      const rc = Math.hypot(dx, dy);
      if (rc > dom.R + dom.maxTerrain + 10) continue;
      const la = Math.atan2(dy, dx) - rot;
      const raw = terrainH(dom, la);
      const sh = dom === P ? Math.max(0, raw) : raw;
      if (rc < dom.R + sh - 0.01) { hit = true; if (dom === P && raw < 0) water = true; }
    }
    if (!hit) return;
    const rx = v.x - BP.x, ry = v.y - BP.y, r = Math.hypot(rx, ry);
    const om = dom.omega;
    const rvx = v.vx - (BV.x - om * ry), rvy = v.vy - (BV.y + om * rx);
    const radial = (rvx * rx + rvy * ry) / r;
    if (radial > 0.3) return; // moving away (e.g. just lifted off)
    if (v.thrust > 0 && this.t - (this.liftoffT ?? -99) < 1.5 && radial > -1) return; // still clearing the ground
    const speed = Math.hypot(rvx, rvy);
    const up = Math.atan2(ry, rx);
    const tilt = wrapA(v.angle - up);
    const tol = v.crashTol + (water ? 5 : 0);
    if (speed > tol) return this.crash(`Impact at ${speed.toFixed(1)} m/s (limit ${tol} m/s)`);
    if (Math.abs(tilt) > 0.62) return this.crash(`Toppled over at ${Math.round(Math.abs(tilt) * 57.3)}° — land upright`);
    v.landed = { body: dom, lat: up - rot, tilt: tilt * 0.5, water };
    this.placeLanded(v);
    this.status = water ? 'Splashed down' : dom === M ? 'Landed on Lumen' : 'Landed';
    this.hooks.toast(water ? '🌊 Splashdown!' : `🛬 Landed on ${dom.name} at ${speed.toFixed(1)} m/s`);
    audio.blip(520);
    if (dom === M) this.flags.moonLanded = true;
  }

  crash(msg) {
    const v = this.vessel;
    v.dead = true; v.thrust = 0;
    this.boomPos = { x: v.x, y: v.y };
    const d = soiBody(v.x, v.y, this.t);
    bodyVel(d, this.t, BV);
    bodyPos(d, this.t, BP);
    const om = d.omega, rx = v.x - BP.x, ry = v.y - BP.y;
    this.explosion(v.x, v.y, BV.x - om * ry, BV.y + om * rx, Math.min(3, 0.6 + v.mass / 8000));
    this.deathMsg = msg; this.deathTimer = 2.2;
    this.status = 'Destroyed';
    this.warpIdx = 0;
    audio.boom();
  }

  stepDebris(d, h) {
    if (d.gone) return;
    d.age += h;
    const dom = soiBody(d.x, d.y, this.t);
    bodyPos(dom, this.t, BP); bodyVel(dom, this.t, BV);
    const rx = d.x - BP.x, ry = d.y - BP.y, r = Math.hypot(rx, ry);
    const at = atmo(dom, r - dom.R);
    d.updateMass();
    const F = d.engineStep(h, at.p, 0);
    gravity(d.x, d.y, this.t, G);
    const ax = Math.cos(d.angle), ay = Math.sin(d.angle);
    let fx = F * ax, fy = F * ay;
    let vrx = d.vx - BV.x, vry = d.vy - BV.y;
    if (dom.atmo) { vrx += dom.omega * ry; vry -= dom.omega * rx; }
    const vr = Math.hypot(vrx, vry);
    if (at.rho > 0 && vr > 0.01) {
      const q = 0.5 * at.rho * vr * vr;
      const alpha = wrapA(Math.atan2(vry, vrx) - d.angle);
      const cda = 0.8 * d.frontArea * Math.abs(Math.cos(alpha)) + 0.6 * d.sideArea * Math.abs(Math.sin(alpha));
      fx -= (vrx / vr) * q * cda; fy -= (vry / vr) * q * cda;
      d.angVel += ((q * Math.sin(alpha) * d.latMoment * 0.25) / d.inertia) * h;
      d.angVel *= Math.exp(-0.3 * h);
    }
    d.angle += d.angVel * h;
    d.vx += (G.ax + fx / d.mass) * h; d.vy += (G.ay + fy / d.mass) * h;
    d.x += d.vx * h; d.y += d.vy * h;
    const rot = bodyRot(dom, this.t);
    if (r - dom.R < dom.maxTerrain + 50) {
      const sh = surfH(dom, Math.atan2(ry, rx) - rot);
      if (r - d.bottomDist < dom.R + sh) {
        d.gone = true;
        if (vr > 8 && Math.hypot(d.x - this.vessel.x, d.y - this.vessel.y) < 8000) {
          this.explosion(d.x, d.y, BV.x - dom.omega * ry, BV.y + dom.omega * rx, 0.8);
        }
      }
    }
    if (d.age > 600 || Math.hypot(d.x - this.vessel.x, d.y - this.vessel.y) > 40000) d.gone = true;
  }

  // ------------------------------------------------------------ orbit & missions
  updateOrbit() {
    const v = this.vessel;
    const dom = this.dom;
    bodyPos(dom, this.t, BP); bodyVel(dom, this.t, BV);
    this.domBody = dom;
    this.orbit = orbitInfo(v.x - BP.x, v.y - BP.y, v.vx - BV.x, v.vy - BV.y, dom);
    const rx = v.x - BP.x, ry = v.y - BP.y, r = Math.hypot(rx, ry);
    const la = Math.atan2(ry, rx) - bodyRot(dom, this.t);
    this.radarAlt = r - dom.R - surfH(dom, la) - v.bottomDist;
    const ref = this.refVel(v, dom);
    this.speedRef = ref;
    this.vspeed = (ref.vx * rx + ref.vy * ry) / r;
    if (!v.dead && !v.landed) {
      const o = this.orbit;
      if (dom.atmo && o.alt < dom.atmo.height) this.status = 'Flying';
      else if (o.e >= 1) this.status = `Escaping ${dom.name}`;
      else if (o.pe > (dom.atmo ? dom.atmo.height : 4000)) this.status = `Orbiting ${dom.name}`;
      else this.status = 'Sub-orbital';
    }
  }

  checkMissions() {
    const v = this.vessel;
    if (v.dead) return;
    const dom = this.domBody, o = this.orbit;
    const done = (id) => {
      if (missions.complete(id)) {
        const m = missions.MISSIONS.find((q) => q.id === id);
        this.hooks.toast(`🏆 Mission complete: ${m.name}`, true);
        audio.blip(1200);
      }
    };
    if (this.launched && !v.landed && this.radarAlt > 20) done('liftoff');
    if (dom === P && o.alt > 10000) done('alt10k');
    if (dom === P && o.alt > 70000) { done('space'); this.flags.space = true; }
    if (dom === P && o.e < 1 && o.pe > 70000) done('orbit');
    if (dom === M) { done('soi'); this.flags.space = true; }
    if (dom === M && o.e < 1 && o.pe > 4000 && o.ra < M.soi) done('moonorbit');
    if (v.landed && v.landed.body === M) { done('moonland'); this.flags.moonLanded = true; }
    if (v.landed && v.landed.body === P && this.flags.space) {
      done('return');
      if (this.flags.moonLanded) done('moonreturn');
      if (!this.result) {
        this.result = { ok: true, msg: this.flags.moonLanded ? 'Welcome home from Lumen!' : 'Safe return from space!' };
        setTimeout(() => this.hooks.onEnd(this.result), 1200);
      }
    }
  }

  // ------------------------------------------------------------ particles
  updateParticles(dt, warp) {
    const v = this.vessel;
    const ps = this.particles;
    if (warp <= 4 && !v.dead && !this.map) {
      const ax = Math.cos(v.angle), ay = Math.sin(v.angle);
      const press = this.press || 0;
      const dom = this.domBody;
      bodyPos(dom, this.t, BP); bodyVel(dom, this.t, BV);
      const om = dom.omega || 0;
      const airx = BV.x - om * (v.y - BP.y), airy = BV.y + om * (v.x - BP.x);
      const w = [0, 0];
      for (const p of v.parts) {
        if (!p.flame || p.flame < 0.02) continue;
        const d = p.def;
        v.worldPt(p.sTop - d.h, 0, w);
        const n = Math.ceil(p.flame * 4 * warp * Math.min(2, d.w));
        for (let k = 0; k < n && ps.length < 1600; k++) {
          const spread = (Math.random() - 0.5) * (8 + (1 - press) * 40) * d.w;
          const ev = 70 + Math.random() * 50;
          ps.push({ kind: 'flame', x: w[0], y: w[1], vx: v.vx - ax * ev - ay * spread, vy: v.vy - ay * ev + ax * spread,
            ax: v.vx, ay: v.vy, life: 0, max: 0.18 + Math.random() * 0.25, size: d.w * 0.7, grow: d.w * 4 * (1 + (1 - press) * 2), drag: 0 });
          if (press > 0.02 && Math.random() < 0.55) {
            const sv = 25 + Math.random() * 20;
            ps.push({ kind: 'smoke', x: w[0] - ax * d.h, y: w[1] - ay * d.h,
              vx: v.vx - ax * sv + (Math.random() - 0.5) * 10, vy: v.vy - ay * sv + (Math.random() - 0.5) * 10,
              ax: airx, ay: airy, life: 0, max: 2.5 + Math.random() * 3.5, size: d.w * 1.2, grow: 5 + d.w * 3, drag: 1.2, alpha: 0.55 * Math.min(1, press * 2) });
          }
        }
        // launch clouds hugging the ground
        if (this.radarAlt < 25 && press > 0.5 && Math.random() < 0.8 * p.flame) {
          const upx = Math.cos(Math.atan2(v.y - BP.y, v.x - BP.x)), upy = Math.sin(Math.atan2(v.y - BP.y, v.x - BP.x));
          const side = Math.random() < 0.5 ? -1 : 1, s = 15 + Math.random() * 25;
          ps.push({ kind: 'smoke', x: w[0] - upx * this.radarAlt, y: w[1] - upy * this.radarAlt,
            vx: airx - upy * side * s + upx * 3, vy: airy + upx * side * s + upy * 3,
            ax: airx, ay: airy, life: 0, max: 3 + Math.random() * 3, size: 3, grow: 10, drag: 0.7, alpha: 0.6 });
        }
      }
      if (this.heat > 0.05) {
        const vr = this.speedRef;
        const sp = Math.hypot(vr.vx, vr.vy) || 1;
        for (let k = 0; k < this.heat * 6; k++) {
          const off = (Math.random() - 0.5) * v.maxW * 1.4;
          ps.push({ kind: 'flame', x: v.x + (vr.vx / sp) * v.length * 0.4 - (vr.vy / sp) * off, y: v.y + (vr.vy / sp) * v.length * 0.4 + (vr.vx / sp) * off,
            vx: airx + v.vx - vr.vx * 0.15 - airx, vy: airy + v.vy - vr.vy * 0.15 - airy, ax: v.vx, ay: v.vy,
            life: 0, max: 0.25 + Math.random() * 0.3, size: v.maxW * 0.8, grow: v.maxW * 2, drag: 0, hot: true });
        }
      }
    }
    const step = dt * Math.min(warp, 4);
    for (const p of ps) {
      p.life += dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * step);
        p.vx = p.ax + (p.vx - p.ax) * k; p.vy = p.ay + (p.vy - p.ay) * k;
      }
      p.x += p.vx * step; p.y += p.vy * step;
    }
    this.particles = ps.filter((p) => p.life < p.max);
  }

  explosion(x, y, vx, vy, scale) {
    const ps = this.particles;
    for (let i = 0; i < 90 * scale; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 45 * scale;
      ps.push({ kind: 'flame', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, ax: vx, ay: vy, life: 0, max: 0.5 + Math.random() * 1.2,
        size: 3 * scale, grow: 14 * scale, drag: 1.5 });
    }
    for (let i = 0; i < 60 * scale; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 25 * scale;
      ps.push({ kind: 'smoke', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, ax: vx, ay: vy, life: 0, max: 3 + Math.random() * 4,
        size: 4 * scale, grow: 22 * scale, drag: 0.8, alpha: 0.7, dark: true });
    }
    this.sparks(x, y, vx, vy, 50 * scale);
    this.shake = Math.min(2, this.shake + scale);
  }

  sparks(x, y, vx, vy, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 60;
      this.particles.push({ kind: 'spark', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, ax: vx, ay: vy, life: 0,
        max: 0.4 + Math.random() * 0.8, size: 0.35, grow: 0, drag: 0.6 });
    }
  }
}
