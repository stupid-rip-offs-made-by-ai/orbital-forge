import { PARTS, CATS, PRESETS } from './parts.js';
import { analyzeDesign } from './vessel.js';
import { Preview3D } from './preview3d.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = (n) => Math.round(n).toLocaleString();

function loadSaved() { try { return JSON.parse(localStorage.getItem('of_designs') || '{}'); } catch (e) { return {}; } }
function storeSaved(d) { try { localStorage.setItem('of_designs', JSON.stringify(d)); return true; } catch (e) { return false; } }

export class Builder {
  constructor(app) {
    this.app = app;
    this.parts = PRESETS['Orbiter Mk1'].slice();
    this.name = 'Orbiter Mk1';
    this.sel = -1;
    this.cat = 'Command';
    this.buildPalette();
    try { this.preview = new Preview3D($('#preview3d')); } catch (e) { this.preview = null; }
    $('#b-name').addEventListener('input', (e) => { this.name = e.target.value || 'Untitled'; });
    $('#b-load').addEventListener('change', (e) => this.loadOption(e.target.value));
    $('#b-save').onclick = () => this.save();
    $('#b-clear').onclick = () => { this.parts = []; this.sel = -1; this.render(); };
    $('#b-launch').onclick = () => this.launch();
    $('#b-back').onclick = () => app.show('menu');
    $('#t-up').onclick = () => this.move(-1);
    $('#t-down').onclick = () => this.move(1);
    $('#t-dup').onclick = () => { if (this.sel >= 0) { this.parts.splice(this.sel + 1, 0, this.parts[this.sel]); this.sel++; this.render(); } };
    $('#t-del').onclick = () => { if (this.sel >= 0) { this.parts.splice(this.sel, 1); this.sel = Math.min(this.sel, this.parts.length - 1); this.render(); } };
    $('#sel-tools').addEventListener('click', (e) => e.stopPropagation());
    $('#b-stats-toggle').onclick = () => document.body.classList.toggle('stats-open');
    addEventListener('resize', () => { if (app.screen === 'builder') this.render(); });
  }

  setDesign(ids, name) { this.parts = ids.slice(); this.name = name || this.name; this.sel = -1; }

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
      const b = el('button', 'pal-item');
      b.title = d.desc;
      b.innerHTML = `<div class="pal-img"><img src="assets/textures/${d.tex}.png" alt=""></div><div class="pal-name">${d.name}</div><div class="pal-sub">${this.partStat(d)}</div>`;
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
    const at = this.sel >= 0 ? this.sel + 1 : this.parts.length;
    this.parts.splice(at, 0, id);
    this.sel = at;
    this.render();
    const node = document.querySelector(`.stack-part[data-i="${at}"]`);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  move(dir) {
    const i = this.sel, j = i + dir;
    if (i < 0 || j < 0 || j >= this.parts.length) return;
    [this.parts[i], this.parts[j]] = [this.parts[j], this.parts[i]];
    this.sel = j;
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
    const ids = kind === 'p' ? PRESETS[name] : loadSaved()[name];
    if (ids) { this.setDesign(ids, name); this.render(); }
    $('#b-load').value = '';
  }

  save() {
    const saved = loadSaved();
    saved[this.name] = this.parts.slice();
    if (storeSaved(saved)) this.app.toast(`Saved “${this.name}”`); else this.app.toast('Could not save (storage blocked)');
    this.refreshLoad();
  }

  launch() {
    if (!this.parts.length) { this.app.toast('Add some parts first!'); return; }
    this.app.launch(this.parts.slice(), this.name);
  }

  render() {
    $('#b-name').value = this.name;
    this.refreshLoad();
    const stack = $('#stack');
    stack.innerHTML = '';
    const tools = $('#sel-tools');
    tools.classList.toggle('hidden', this.sel < 0);
    if (!this.parts.length) {
      stack.appendChild(el('div', 'stack-empty', 'Tap parts on the left to stack them here.<br>Start with a command part, then tanks, then an engine.'));
      this.renderStats();
      return;
    }
    const totalH = this.parts.reduce((a, id) => a + PARTS[id].h, 0);
    const view = $('#stackview');
    const avail = Math.max(200, view.clientHeight - 60);
    const ppm = Math.max(12, Math.min(56, avail / totalH));
    // stage numbering: segments split at decouplers, numbered from the bottom
    const segOf = [];
    let seg = 0;
    this.parts.forEach((id, i) => { if (PARTS[id].type === 'decoupler' && i > 0) seg++; segOf.push(seg); });
    const nSeg = seg + 1;
    const bottomSeg = seg;
    this.parts.forEach((id, i) => {
      const d = PARTS[id];
      const node = el('div', 'stack-part' + (i === this.sel ? ' sel' : ''));
      node.dataset.i = i;
      node.style.height = d.h * ppm + 'px';
      node.style.width = d.w * ppm + 'px';
      const legsOut = d.type === 'legs' && segOf[i] === bottomSeg;
      const img = el('img');
      img.src = `assets/textures/${d.type === 'legs' && !legsOut ? 'parts/legs_stowed' : d.tex}.png`;
      const dw = d.type === 'legs' && !legsOut ? 1.6 : d.drawW, dh = d.type === 'legs' && !legsOut ? 0.4 : d.drawH;
      img.style.width = dw * ppm + 'px';
      img.style.height = dh * ppm + 'px';
      img.style.left = ((d.w - dw) / 2) * ppm + 'px';
      if (d.type === 'legs' || d.type === 'fins') node.style.zIndex = 3;
      node.appendChild(img);
      if (i === 0 || segOf[i] !== segOf[i - 1]) {
        const lab = el('div', 'stage-tag', `Stage ${nSeg - segOf[i]}`);
        node.appendChild(lab);
      }
      node.onclick = (e) => { e.stopPropagation(); this.sel = this.sel === i ? -1 : i; this.render(); };
      stack.appendChild(node);
    });
    view.onclick = () => { this.sel = -1; this.render(); };
    this.renderStats();
  }

  renderStats() {
    if (this.preview) this.preview.set(this.parts);
    const a = analyzeDesign(this.parts);
    const box = $('#stats');
    let html = `<div class="st-head"><div><span>Mass</span><b>${(a.mass / 1000).toFixed(2)} t</b></div><div><span>Height</span><b>${a.height.toFixed(1)} m</b></div><div><span>Total ΔV</span><b>${fmt(a.total)} m/s</b></div></div>`;
    html += '<table class="st-table"><tr><th>Stage</th><th>ΔV vac</th><th>TWR</th></tr>';
    for (const s of a.stages) {
      const twrCls = s.engines.length ? (s.twrS >= 1.15 ? 'ok' : s.twrV >= 0.3 ? 'meh' : 'bad') : '';
      html += `<tr><td>${s.num}${s.engines.length ? `<small>${s.engines.join(', ')}</small>` : '<small>no engine</small>'}</td><td>${fmt(s.dvV)}<small>${fmt(s.dvS)} at sea level</small></td><td class="${twrCls}">${s.engines.length ? s.twrS.toFixed(2) : '–'}<small>vac ${s.engines.length ? s.twrV.toFixed(2) : '–'}</small></td></tr>`;
    }
    html += '</table>';
    html += '<div class="st-goals"><div>To orbit Verdan <b>≈ 3,400 m/s</b></div><div>Orbit → land on Lumen <b>≈ +1,900</b></div><div>Lumen → home <b>≈ +900</b></div></div>';
    if (a.warnings.length) html += '<ul class="st-warn">' + a.warnings.map((w) => `<li>${w}</li>`).join('') + '</ul>';
    if (this.sel >= 0) {
      const d = PARTS[this.parts[this.sel]];
      html += `<div class="st-part"><b>${d.name}</b><p>${d.desc}</p><p class="dim">${this.partStat(d)}</p></div>`;
    }
    box.innerHTML = html;
  }
}
