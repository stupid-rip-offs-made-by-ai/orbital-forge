import { loadTextures, TEX } from './textures.js';
import { Builder } from './builder.js';
import { Flight, WARPS } from './flight.js';
import { Renderer3D } from './render3d.js';
import { fmtDist, drawAttitude } from './hud.js';
import { PRESETS } from './parts.js';
import { BODIES, SUN, bodyPos, transferInfo } from './physics.js';
import { MISSIONS, isDone, doneCount, resetMissions } from './missions.js';
import * as audio from './audio.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const app = {
  screen: 'loading', flight: null, design: null, designName: '',
  show(name) {
    this.screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== name));
    if (name === 'builder') requestAnimationFrame(() => builder.render());
    if (name === 'menu') { this.flight = null; audio.setEngine(0, 0); renderMissionList('#menu-missions'); $('#menu-progress').textContent = `${doneCount()} / ${MISSIONS.length} missions`; }
  },
  toast(msg, big) {
    const t = document.createElement('div');
    t.className = 'toast' + (big ? ' big' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), big ? 3200 : 2200);
    setTimeout(() => t.remove(), big ? 3800 : 2800);
  },
  launch(ids, name) {
    audio.initAudio();
    this.design = ids; this.designName = name;
    this.flight = new Flight(ids, { toast: (m, b) => this.toast(m, b), onEnd: (r) => showResult(r) });
    $('#result').classList.add('hidden');
    $('#flight-menu').classList.add('hidden');
    this.show('flight');
    renderer && renderer.resize();
    if (innerWidth < innerHeight) this.flight.mapCam.dist = 5.5e6; // portrait phones need to back off
    this.toast('Press STAGE (Space) to ignite engines');
  },
};
window.OF = app; // handy for debugging in the console

const builder = new Builder(app);
let renderer = null;
try { renderer = new Renderer3D($('#game'), $('#overlay')); } catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div class="modal"><div class="modal-box"><h2>WebGL unavailable</h2><p>Your browser could not start 3D graphics.</p></div></div>'); }

// ------------------------------------------------------------------ menu
function renderMissionList(sel) {
  $(sel).innerHTML = MISSIONS.map((m) => `<li class="${isDone(m.id) ? 'done' : ''}"><span class="chk">${isDone(m.id) ? '✔' : '○'}</span><div><b>${m.name}</b><small>${m.desc}</small></div></li>`).join('');
}
$('#m-build').onclick = () => { audio.initAudio(); app.show('builder'); };
$('#m-quick').onclick = () => app.launch(PRESETS['Booster Buddy'], 'Booster Buddy');
$('#m-help').onclick = () => $('#help').classList.remove('hidden');
$$('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.add('hidden')));
$('#m-reset').onclick = (e) => {
  const b = e.currentTarget;
  if (b.dataset.armed) { resetMissions(); delete b.dataset.armed; b.textContent = 'Reset progress'; app.show('menu'); return; }
  b.dataset.armed = '1'; b.textContent = 'Tap again to reset all progress';
  setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset progress'; }, 3000);
};

// ------------------------------------------------------------------ flight HUD
const hud = {
  alt: $('#r-alt'), radar: $('#r-radar'), spd: $('#r-spd'), spdLbl: $('#r-spd-lbl'), vs: $('#r-vs'), ap: $('#r-ap'), pe: $('#r-pe'),
  met: $('#r-met'), warp: $('#r-warp'), status: $('#r-status'), thrFill: $('#thr-fill'), thrVal: $('#thr-val'),
  fuel: $('#fuel-fill'), dv: $('#r-dv'), next: $('#r-next'), g: $('#r-g'), twr: $('#r-twr'),
};
function fmtTime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return (d ? `${d}d ` : '') + `${p(h)}:${p(m)}:${p(sec)}`;
}
function fmtDur(s) {
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return (s / 3600).toFixed(1) + ' h';
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
/** One line of guidance for reaching the chosen target. */
function targetLine(f) {
  const tg = f.target, v = f.vessel;
  if (!tg) return 'Tap a planet or moon (or press TARGET) to plan a trip';
  if (f.domBody === tg) return `🎯 ${tg.name} · you are here`;
  let txt = `🎯 ${tg.name}`;
  const en = f.pred && f.pred.encounters.find((e) => e.body === tg);
  if (en) return `${txt} · ENCOUNTER · closest pass ${fmtDist(en.pe)} above the surface`;
  if (!v.landed && !v.dead) {
    const b = bodyPos(f.domBody, f.t);
    const ti = transferInfo(f.orbit, f.domBody, tg, Math.atan2(v.y - b.y, v.x - b.x), f.t);
    if (ti) {
      txt += ti.now ? ' · WINDOW OPEN' : ` · window in ${fmtDur(ti.wait)}`;
      if (ti.dv) txt += ` · burn prograde ≈ ${Math.round(ti.dv).toLocaleString()} m/s`;
      if (tg.parent !== f.domBody && ti.dv) txt += ti.outward ? ' on the night side' : ' on the day side';
      txt += ` · trip ${fmtDur(ti.travel)}`;
    }
    if (f.pred && f.pred.closest) txt += ` · closest ${fmtDist(f.pred.closest.d)}`;
  }
  return txt;
}
let hudTimer = 0;
function updateHUD(dt) {
  const f = app.flight; if (!f) return;
  const v = f.vessel;
  hud.thrFill.style.height = v.throttle * 100 + '%';
  hud.thrVal.textContent = Math.round(v.throttle * 100) + '%';
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.1;
  const o = f.orbit, r = f.speedRef;
  hud.alt.textContent = fmtDist(o.alt);
  hud.radar.textContent = f.radarAlt < 5000 && !v.dead ? `Radar ${fmtDist(Math.max(0, f.radarAlt))}` : f.domBody.name;
  const sp = Math.hypot(r.vx, r.vy);
  hud.spd.textContent = `${Math.round(sp).toLocaleString()} m/s`;
  hud.spdLbl.textContent = r.surface ? 'SURFACE' : 'ORBIT';
  hud.vs.textContent = `${f.vspeed >= 0 ? '▲' : '▼'} ${Math.abs(f.vspeed).toFixed(Math.abs(f.vspeed) < 100 ? 1 : 0)} m/s`;
  const show = !v.landed && !v.dead;
  hud.ap.textContent = show ? (o.e < 1 ? fmtDist(o.ap) : 'Escape') : '—';
  hud.pe.textContent = show ? fmtDist(o.pe) : '—';
  hud.pe.classList.toggle('warn', show && o.pe < (f.domBody.atmo ? 0 : 0));
  hud.met.textContent = 'T+ ' + fmtTime(f.met);
  hud.warp.textContent = '×' + WARPS[f.warpIdx].toLocaleString();
  hud.warp.classList.toggle('on', f.warpIdx > 0);
  hud.status.textContent = f.status;
  const st = v.stageStatus(f.press || 0);
  hud.fuel.style.width = st.frac * 100 + '%';
  hud.fuel.classList.toggle('low', st.frac < 0.15);
  hud.dv.textContent = `ΔV ${Math.round(st.dv).toLocaleString()} m/s`;
  const nx = v.dead ? null : v.nextStage();
  hud.next.textContent = nx ? nx.label : 'No more stages';
  hud.g.textContent = `${f.gforce.toFixed(1)} G`;
  const gl = f.domBody.GM / (o.r * o.r);
  hud.twr.textContent = `TWR ${(st.thrustMax / (v.mass * gl)).toFixed(2)}`;
  $$('[data-sas]').forEach((b) => b.classList.toggle('on', b.dataset.sas === f.sas));
  $('#b-map').classList.toggle('on', f.map);
  $('#b-focus').classList.toggle('hidden', !f.map);
  $('#b-target').classList.toggle('hidden', !f.map);
  $('#b-target').classList.toggle('on', !!f.target);
  const tl = $('#hud-target');
  tl.classList.toggle('hidden', !f.map);
  if (f.map) tl.textContent = targetLine(f);
}

function showResult(r) {
  const box = $('#result');
  box.querySelector('h2').textContent = r.ok ? '🎉 Mission success' : '💥 Vessel destroyed';
  box.querySelector('p').textContent = r.msg;
  box.querySelector('.missions-mini').innerHTML = `${doneCount()} / ${MISSIONS.length} missions complete`;
  box.classList.remove('hidden');
}

// buttons
const hold = (id, on, off) => {
  const b = $(id);
  const start = (e) => { e.preventDefault(); b.classList.add('held'); on(); };
  const end = (e) => { e.preventDefault(); b.classList.remove('held'); off(); };
  b.addEventListener('pointerdown', start);
  b.addEventListener('pointerup', end);
  b.addEventListener('pointerleave', end);
  b.addEventListener('pointercancel', end);
};
hold('#b-rotl', () => app.flight && (app.flight.rotInput = 1), () => app.flight && (app.flight.rotInput = 0));
hold('#b-rotr', () => app.flight && (app.flight.rotInput = -1), () => app.flight && (app.flight.rotInput = 0));
$('#b-stage').onclick = () => { audio.initAudio(); app.flight && app.flight.stage(); };
$('#b-warpd').onclick = () => app.flight && app.flight.warp(-1);
$('#b-warpu').onclick = () => app.flight && app.flight.warp(1);
$('#b-map').onclick = () => app.flight && (app.flight.map = !app.flight.map);
$('#b-focus').onclick = () => {
  const f = app.flight; if (!f) return;
  // ship first, then the bodies that matter right now, then everything else
  const order = ['ship'];
  for (let b = f.domBody; b; b = b.parent) order.push(b.id);
  if (f.target) order.push(f.target.id);
  for (const b of BODIES) order.push(b.id);
  const uniq = [...new Set(order)];
  f.mapFocus = uniq[(uniq.indexOf(f.mapFocus) + 1) % uniq.length];
  const fb = BODIES.find((b) => b.id === f.mapFocus);
  if (fb) f.mapCam.dist = Math.max(f.mapCam.dist, fb.R * 4);
  app.toast('Map focus: ' + (fb ? fb.name : 'Ship'));
};
function setTarget(b) {
  const f = app.flight; if (!f) return;
  f.target = b; f.predTimer = 0;
  app.toast(b ? `Target: ${b.name}` : 'Target cleared');
}
$('#b-target').onclick = () => {
  const f = app.flight; if (!f) return;
  const list = [null, ...BODIES.filter((b) => b !== SUN)];
  setTarget(list[(list.indexOf(f.target) + 1) % list.length]);
};
$('#b-chute').onclick = () => app.flight && app.flight.deployChute();
$('#b-full').onclick = () => app.flight && (app.flight.vessel.throttle = 1);
$('#b-cut').onclick = () => app.flight && (app.flight.vessel.throttle = 0);
$('#b-zin').onclick = () => zoom(1.5);
$('#b-zout').onclick = () => zoom(1 / 1.5);
$('#b-menu').onclick = () => { $('#flight-menu').classList.remove('hidden'); renderMissionList('#fm-missions'); };
$('#b-sound').onclick = () => { const m = audio.toggleMute(); $('#b-sound').textContent = m ? '🔇' : '🔊'; };
$('#b-sound').textContent = audio.isMuted() ? '🔇' : '🔊';
$$('[data-sas]').forEach((b) => (b.onclick = () => app.flight && app.flight.setSAS(b.dataset.sas === app.flight.sas && b.dataset.sas !== 'off' ? 'off' : b.dataset.sas)));
const revert = () => app.launch(app.design, app.designName);
const toBuilder = () => { builder.setDesign(app.design, app.designName); app.show('builder'); };
const gfxBtn = $('#fm-gfx');
const gfxLabel = () => { if (renderer) gfxBtn.textContent = 'Graphics: ' + (renderer.quality === 'high' ? 'High' : 'Low'); };
gfxBtn.onclick = () => { if (renderer) { renderer.setQuality(renderer.quality === 'high' ? 'low' : 'high'); gfxLabel(); app.toast(renderer.quality === 'high' ? 'High graphics: sharper, with shadows' : 'Low graphics: faster'); } };
gfxLabel();
$('#fm-resume').onclick = () => $('#flight-menu').classList.add('hidden');
$('#fm-revert').onclick = revert;
$('#fm-build').onclick = toBuilder;
$('#fm-menu').onclick = () => app.show('menu');
$('#rs-revert').onclick = revert;
$('#rs-build').onclick = toBuilder;
$('#rs-continue').onclick = () => $('#result').classList.add('hidden');

// throttle bar drag
(() => {
  const bar = $('#thr');
  let drag = false;
  const set = (e) => {
    const r = bar.getBoundingClientRect();
    const v = 1 - (e.clientY - r.top) / r.height;
    if (app.flight) app.flight.vessel.throttle = Math.max(0, Math.min(1, v < 0.03 ? 0 : v > 0.97 ? 1 : v));
  };
  bar.addEventListener('pointerdown', (e) => { drag = true; bar.setPointerCapture(e.pointerId); set(e); });
  bar.addEventListener('pointermove', (e) => drag && set(e));
  bar.addEventListener('pointerup', () => (drag = false));
  bar.addEventListener('pointercancel', () => (drag = false));
})();

function zoom(k) {
  const f = app.flight; if (!f) return;
  const c = f.map ? f.mapCam : f.cam;
  c.dist = f.map ? Math.max(3e5, Math.min(4e11, c.dist / k)) : Math.max(4, Math.min(3e5, c.dist / k));
}
function resetView() {
  const f = app.flight; if (!f) return;
  if (f.map) Object.assign(f.mapCam, { yaw: 0, pitch: 0 });
  else Object.assign(f.cam, { yaw: 0.35, pitch: 0.12, dist: Math.max(14, f.vessel.length * 2.4 + 8) });
}
$('#b-view').onclick = resetView;
const canvas = $('#game');
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
// one finger / mouse drag orbits the camera, two fingers pinch-zoom
const touches = new Map();
let pinchD = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = touches.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  touches.set(e.pointerId, cur);
  const f = app.flight; if (!f) return;
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchD > 0) zoom(d / pinchD);
    pinchD = d;
  } else if (touches.size === 1) {
    const c = f.map ? f.mapCam : f.cam;
    c.yaw -= (cur.x - prev.x) * 0.006;
    c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + (cur.y - prev.y) * 0.006));
  }
});
const endTouch = (e) => { touches.delete(e.pointerId); pinchD = 0; };
// a tap (no drag) on the map picks a planet or moon as the target
let tapStart = null;
canvas.addEventListener('pointerdown', (e) => { tapStart = touches.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
canvas.addEventListener('pointerup', (e) => {
  const f = app.flight;
  if (!f || !f.map || !tapStart || !renderer) return;
  if (Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 8 || performance.now() - tapStart.t > 600) return;
  const r = canvas.getBoundingClientRect();
  const b = renderer.pickBody(e.clientX - r.left, e.clientY - r.top);
  if (b && b !== SUN) setTarget(f.target === b ? null : b);
});
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

// keyboard
const keys = new Set();
addEventListener('keydown', (e) => {
  if (app.screen !== 'flight' || !app.flight) return;
  if (e.target.tagName === 'INPUT') return;
  const f = app.flight, k = e.key.toLowerCase();
  if (keys.has(k) && !['.', ',', '>', '<'].includes(k)) { if (k === ' ') e.preventDefault(); return; }
  keys.add(k);
  switch (k) {
    case ' ': e.preventDefault(); audio.initAudio(); f.stage(); break;
    case 'a': case 'arrowleft': case 'q': f.rotInput = 1; break;
    case 'd': case 'arrowright': case 'e': f.rotInput = -1; break;
    case 'shift': case 'w': case 'arrowup': f.thrInput = 1; break;
    case 'control': case 's': case 'arrowdown': f.thrInput = -1; break;
    case 'z': f.vessel.throttle = 1; break;
    case 'x': f.vessel.throttle = 0; break;
    case 'm': case 'tab': e.preventDefault(); f.map = !f.map; break;
    case '.': case '>': f.warp(1); break;
    case ',': case '<': f.warp(-1); break;
    case '/': f.warpIdx = 0; break;
    case 't': f.setSAS(f.sas === 'stab' ? 'off' : 'stab'); break;
    case '1': f.setSAS('pro'); break;
    case '2': f.setSAS('retro'); break;
    case '3': f.setSAS('radout'); break;
    case '4': f.setSAS('radin'); break;
    case 'p': f.deployChute(); break;
    case '=': case '+': zoom(1.3); break;
    case '-': case '_': zoom(1 / 1.3); break;
    case 'f': $('#b-focus').click(); break;
    case 'v': resetView(); break;
    case 'escape': $('#flight-menu').classList.toggle('hidden'); renderMissionList('#fm-missions'); break;
    case 'r': if (f.vessel.dead) revert(); break;
    default: break;
  }
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  const f = app.flight; if (!f) return;
  if (['a', 'd', 'q', 'e', 'arrowleft', 'arrowright'].includes(k)) f.rotInput = 0;
  if (['shift', 'control', 'w', 's', 'arrowup', 'arrowdown'].includes(k)) f.thrInput = 0;
});
addEventListener('blur', () => { keys.clear(); if (app.flight) { app.flight.rotInput = 0; app.flight.thrInput = 0; } });

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (app.screen === 'flight' && app.flight) {
    const paused = !$('#flight-menu').classList.contains('hidden');
    if (!paused) app.flight.update(dt);
    if (renderer) renderer.draw(app.flight);
    if (!app.flight.vessel.dead) drawAttitude(app.flight);
    updateHUD(dt);
  }
  requestAnimationFrame(frame);
}

loadTextures((p) => { $('#load-bar').style.width = p * 100 + '%'; }).then(() => {
  if (TEX.planet) $('#menu-planet').src = TEX.planet.src;
  app.show('menu');
  requestAnimationFrame(frame);
});
