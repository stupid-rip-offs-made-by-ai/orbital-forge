import { PARTS, CATS, PRESETS, sideOk } from './parts.js';
import { analyzeDesign, normDesign, packDesign } from './vessel.js';
import { Preview3D } from './preview3d.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = (n) => Math.round(n).toLocaleString();

function loadSaved() { try { return JSON.parse(localStorage.getItem('of_designs') || '{}'); } catch (e) { return {}; } }
function storeSaved(d) { try { localStorage.setItem('of_designs', JSON.stringify(d)); return true; } catch (e) { return false; } }

export class Builder {
  constructor(app) {
    this.app = app;
    this.parts = normDesign(PRESETS['Booster Buddy']); // [{ id, side: [ids] }], top to bottom
    this.name = 'Booster Buddy';
    this.sel = -1;      // selected core part
    this.selSide = -1;  // selected part inside that core part's side stack (-1 = the core part itself)
    this.sideMode = false;
    this.cat = 'Command';
    this.buildPalette();
    try { this.preview = new Preview3D($('#preview3d')); } catch (e) { this.preview = null; }
    $('#b-name').addEventListener('input', (e) => { this.name = e.target.value || 'Untitled'; });
    $('#b-load').addEventListener('change', (e) => this.loadOption(e.target.value));
    $('#b-save').onclick = () => this.save();
    $('#b-clear').onclick = () => { this.parts = []; this.select(-1); };
    $('#b-launch').onclick = () => this.launch();
    $('#b-back').onclick = () => app.show('menu');
    $('#t-up').onclick = () => this.move(-1);
    $('#t-down').onclick = () => this.move(1);
    $('#t-dup').onclick = () => this.duplicate();
    $('#t-del').onclick = () => this.remove();
    $('#t-side').onclick = () => { this.sideMode = !this.sideMode; this.selSide = -1; this.buildPalette(); this.render(); };
    $('#sel-tools').addEventListener('click', (e) => e.stopPropagation());
    $('#b-stats-toggle').onclick = () => document.body.classList.toggle('stats-open');
    addEventListener('resize', () => { if (app.screen === 'builder') this.render(); });
  }

  setDesign(design, name) { this.parts = normDesign(design); this.name = name || this.name; this.sel = -1; this.selSide = -1; this.sideMode = false; this.buildPalette(); }
  design() { return packDesign(this.parts); }

  select(i, j = -1) {
    if (i !== this.sel) this.sideMode = false;
    this.sel = i; this.selSide = j;
    this.buildPalette();
    this.render();
  }

  buildPalette() {
    const tabs = $('#pal-tabs');
    tabs.innerHTML = '';
    for (const c of CATS) {
      const b = el('button', 'tab' + (c === this.cat ? ' on' : ''), c);
      b.onclick = () => { this.cat = c; this.buildPalette(); };
      tabs.appendChild(b);
    }
    const list = $('#pal-list');
    list.innerHTML = '';
    for (const d of Object.values(PARTS)) {
      if (d.cat !== this.cat) continue;
      const off = this.sideMode && !sideOk(d);
      const b = el('button', 'pal-item' + (off ? ' off' : ''));
      b.title = d.desc;
      b.innerHTML = `<div class="pal-img"><img src="assets/textures/${d.tex}.png" alt=""></div><div class="pal-name">${d.name}</div><div class="pal-sub">${d.sideOnly ? 'side mount · ' : ''}${this.partStat(d)}</div>`;
      b.onclick = () => this.add(d.id);
      list.appendChild(b);
    }
  }

  partStat(d) {
    const t = (d.mass + d.fuel) / 1000;
    if (d.type === 'engine' || d.type === 'srb') return `${fmt(d.thrust / 1000)} kN · Isp ${d.ispSL}/${d.ispVac}s`;
    if (d.type === 'tank') return `${t.toFixed(2)} t · fuel ${(d.fuel / 1000).toFixed(1)} t`;
    return `${t.toFixed(2)} t`;
  }

  add(id) {
    const d = PARTS[id];
    if (d.sideOnly || this.sideMode) {
      const host = this.parts[this.sel];
      if (!host) { this.app.toast('Tap a part on the rocket first — this mounts on its sides'); return; }
      if (PARTS[host.id].type === 'decoupler') { this.app.toast('Decouplers cannot carry side parts'); return; }
      if (!sideOk(d)) { this.app.toast(`${d.name} cannot be side-mounted`); return; }
      if (host.side.length >= 6) { this.app.toast('That side stack is full'); return; }
      host.side.push(id);
      this.selSide = -1;
      this.render();
      return;
    }
    const at = this.sel >= 0 ? this.sel + 1 : this.parts.length;
    this.parts.splice(at, 0, { id, side: [] });
    this.sel = at; this.selSide = -1;
    this.render();
    const node = document.querySelector(`.stack-part[data-i="${at}"]`);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  move(dir) {
    const i = this.sel;
    if (i < 0) return;
    if (this.selSide >= 0) {
      const s = this.parts[i].side, a = this.selSide, b = a + dir;
      if (b < 0 || b >= s.length) return;
      [s[a], s[b]] = [s[b], s[a]];
      this.selSide = b;
    } else {
      const j = i + dir;
      if (j < 0 || j >= this.parts.length) return;
      [this.parts[i], this.parts[j]] = [this.parts[j], this.parts[i]];
      this.sel = j;
    }
    this.render();
  }

  duplicate() {
    const e = this.parts[this.sel];
    if (!e) return;
    if (this.selSide >= 0) { if (e.side.length < 6) e.side.splice(this.selSide + 1, 0, e.side[this.selSide]); } else {
      this.parts.splice(this.sel + 1, 0, { id: e.id, side: e.side.slice() });
      this.sel++;
    }
    this.render();
  }

  remove() {
    const e = this.parts[this.sel];
    if (!e) return;
    if (this.selSide >= 0) { e.side.splice(this.selSide, 1); this.selSide = -1; } else {
      this.parts.splice(this.sel, 1);
      this.sel = Math.min(this.sel, this.parts.length - 1);
      this.sideMode = false;
    }
    this.buildPalette();
    this.render();
  }

  refreshLoad() {
    const sel = $('#b-load');
    const saved = loadSaved();
    sel.innerHTML = '<option value="">Load rocket…</option>' +
      '<optgroup label="Presets">' + Object.keys(PRESETS).map((k) => `<option value="p:${k}">${k}</option>`).join('') + '</optgroup>' +
      (Object.keys(saved).length ? '<optgroup label="My rockets">' + Object.keys(saved).map((k) => `<option value="s:${k}">${k}</option>`).join('') + '</optgroup>' : '');
  }

  loadOption(v) {
    if (!v) return;
    const [kind, name] = [v.slice(0, 1), v.slice(2)];
    const d = kind === 'p' ? PRESETS[name] : loadSaved()[name];
    if (d) { this.setDesign(d, name); this.render(); }
    $('#b-load').value = '';
  }

  save() {
    const saved = loadSaved();
    saved[this.name] = this.design();
    if (storeSaved(saved)) this.app.toast(`Saved “${this.name}”`); else this.app.toast('Could not save (storage blocked)');
    this.refreshLoad();
  }

  launch() {
    if (!this.parts.length) { this.app.toast('Add some parts first!'); return; }
    this.app.launch(this.design(), this.name);
  }

  render() {
    $('#b-name').value = this.name;
    this.refreshLoad();
    const stack = $('#stack');
    stack.innerHTML = '';
    const cur = this.parts[this.sel];
    $('#sel-tools').classList.toggle('hidden', !cur);
    const sideBtn = $('#t-side');
    sideBtn.classList.toggle('hidden', !cur || this.selSide >= 0 || PARTS[cur.id].type === 'decoupler');
    sideBtn.classList.toggle('on', this.sideMode);
    const hint = $('#b-hint');
    hint.classList.toggle('hidden', !this.sideMode);
    if (this.sideMode && cur) hint.textContent = `Side mode: parts you tap are mounted on both sides of the ${PARTS[cur.id].name}`;
    if (!this.parts.length) {
      stack.appendChild(el('div', 'stack-empty', 'Tap parts below to stack them here.<br>Start with a command part, then tanks, then an engine.'));
      this.renderStats();
      return;
    }
    // true top and bottom of the drawing, counting side stacks that stick out past the core
    let y = 0, top = 0, bot = 0;
    for (const e of this.parts) {
      if (e.side.length) {
        const f0 = PARTS[e.side[0]];
        const cap = e.side.length > 1 && (f0.type === 'cone' || (f0.type === 'chute' && !f0.sideOnly)) ? f0.h : 0;
        top = Math.max(top, cap - y);
        bot = Math.max(bot, y - cap + e.side.reduce((a, sid) => a + PARTS[sid].h, 0));
      }
      y += PARTS[e.id].h;
      if (PARTS[e.id].type === 'legs') bot = Math.max(bot, y - PARTS[e.id].h + PARTS[e.id].drawH);
    }
    const coreH = y, overTop = top, overBot = Math.max(0, bot - coreH);
    const totalH = coreH + overTop + overBot;
    const view = $('#stackview');
    const avail = Math.max(180, view.clientHeight - 150);
    let maxHalf = 0;
    for (const e of this.parts) {
      const gw = e.side.length ? Math.max(...e.side.map((s) => PARTS[s].w)) : 0;
      maxHalf = Math.max(maxHalf, PARTS[e.id].drawW / 2, PARTS[e.id].w / 2 + gw);
    }
    const availW = Math.max(160, view.clientWidth - 110);
    const ppm = Math.max(9, Math.min(56, avail / totalH, availW / (2 * maxHalf)));
    stack.style.paddingTop = overTop * ppm + 'px';
    stack.style.paddingBottom = overBot * ppm + 'px';
    // stage numbering: segments split at decouplers, numbered from the bottom
    const segOf = [];
    let seg = 0;
    this.parts.forEach((e, i) => { if (PARTS[e.id].type === 'decoupler' && i > 0) seg++; segOf.push(seg); });
    const nSeg = seg + 1, bottomSeg = seg;
    this.parts.forEach((e, i) => {
      const d = PARTS[e.id];
      const node = el('div', 'stack-part' + (i === this.sel && this.selSide < 0 ? ' sel' : '') + (i === this.sel && this.sideMode ? ' host' : ''));
      node.dataset.i = i;
      node.style.height = d.h * ppm + 'px';
      node.style.width = d.w * ppm + 'px';
      const isLegs = d.type === 'legs', legsOut = isLegs && segOf[i] === bottomSeg, k = d.legScale || 1;
      const img = el('img');
      img.src = `assets/textures/${isLegs && !legsOut ? 'parts/legs_stowed' : d.tex}.png`;
      const dw = isLegs && !legsOut ? 1.6 * k : d.drawW, dh = isLegs && !legsOut ? 0.4 * k : d.drawH;
      img.style.width = dw * ppm + 'px';
      img.style.height = dh * ppm + 'px';
      img.style.left = ((d.w - dw) / 2) * ppm + 'px';
      if (isLegs || d.type === 'fins') node.style.zIndex = 3;
      node.appendChild(img);
      let gw = 0;
      if (e.side.length) {
        gw = Math.max(...e.side.map((s) => PARTS[s].w));
        const f0 = PARTS[e.side[0]];
        const cap = e.side.length > 1 && (f0.type === 'cone' || (f0.type === 'chute' && !f0.sideOnly)) ? f0.h : 0;
        for (const sg of [-1, 1]) {
          const colEl = el('div', 'side-col' + (sg < 0 ? ' left' : ''));
          colEl.style.width = gw * ppm + 'px';
          colEl.style.top = -cap * ppm + 'px';
          colEl.style.left = (sg > 0 ? d.w : -gw) * ppm + 'px';
          e.side.forEach((sid, j) => {
            const sd = PARTS[sid];
            const sp = el('div', 'side-part' + (i === this.sel && j === this.selSide ? ' sel' : ''));
            sp.style.height = sd.h * ppm + 'px';
            const si = el('img');
            si.src = `assets/textures/${sd.tex}.png`;
            si.style.width = sd.w * ppm + 'px';
            si.style.height = sd.h * ppm + 'px';
            si.style.left = (sd.sideOnly ? 0 : (gw - sd.w) / 2) * ppm + 'px';
            sp.appendChild(si);
            sp.onclick = (ev) => { ev.stopPropagation(); this.sideMode = false; this.select(i, i === this.sel && j === this.selSide ? -1 : j); };
            colEl.appendChild(sp);
          });
          node.appendChild(colEl);
        }
      }
      if (i === 0 || segOf[i] !== segOf[i - 1]) {
        const lab = el('div', 'stage-tag', `Stage ${nSeg - segOf[i]}`);
        lab.style.right = `calc(100% + ${Math.round((maxHalf - d.w / 2) * ppm) + 10}px)`;
        node.appendChild(lab);
      }
      node.onclick = (ev) => { ev.stopPropagation(); this.select(this.sel === i && this.selSide < 0 ? -1 : i); };
      stack.appendChild(node);
    });
    view.onclick = () => { document.body.classList.remove('stats-open'); this.select(-1); };
    this.renderStats();
  }

  renderStats() {
    const design = this.design();
    if (this.preview) this.preview.set(design);
    const a = analyzeDesign(design);
    const box = $('#stats');
    let html = `<div class="st-head"><div><span>Mass</span><b>${(a.mass / 1000).toFixed(2)} t</b></div><div><span>Height</span><b>${a.height.toFixed(1)} m</b></div><div><span>Total ΔV</span><b>${fmt(a.total)} m/s</b></div></div>`;
    html += '<table class="st-table"><tr><th>Burn</th><th>ΔV vac</th><th>TWR</th></tr>';
    for (const s of a.stages) {
      const has = s.engines.length > 0;
      const twrCls = has ? (s.twrS >= 1.15 ? 'ok' : s.twrV >= 0.3 ? 'meh' : 'bad') : '';
      html += `<tr><td>${s.num}${has ? `<small>${s.engines.join(', ')}</small>` : '<small>no engine</small>'}</td><td>${fmt(s.dvV)}<small>${fmt(s.dvS)} at sea level</small></td><td class="${twrCls}">${has ? s.twrS.toFixed(2) : '–'}<small>vac ${has ? s.twrV.toFixed(2) : '–'}</small></td></tr>`;
    }
    html += '</table>';
    html += '<div class="st-goals"><div>To orbit Verdan <b>≈ 3,400 m/s</b></div><div>Orbit → land on Lumen <b>≈ +1,800</b></div><div>Lumen → home <b>≈ +900</b></div>'
      + '<div>Orbit → Ferra (land with chutes) <b>≈ +1,900</b></div><div>Ferra → home <b>≈ +2,000</b></div><div>Orbit → Aurea / Jovara flyby <b>≈ +1,150 / +2,250</b></div></div>';
    if (a.warnings.length) html += '<ul class="st-warn">' + a.warnings.map((w) => `<li>${w}</li>`).join('') + '</ul>';
    const e = this.parts[this.sel];
    if (e) {
      const d = PARTS[this.selSide >= 0 ? e.side[this.selSide] : e.id];
      html += `<div class="st-part"><b>${d.name}${this.selSide >= 0 ? ' ×2 (side pair)' : ''}</b><p>${d.desc}</p><p class="dim">${this.partStat(d)}</p></div>`;
    }
    box.innerHTML = html;
  }
}
