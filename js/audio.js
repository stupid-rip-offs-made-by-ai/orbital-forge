// Tiny procedural sound engine (no audio files needed).
let ctx = null, gain = null, filt = null, master = null, muted = false;
try { muted = localStorage.getItem('of_muted') === '1'; } catch (e) { /* storage unavailable */ }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 300;
    gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filt).connect(gain).connect(master); src.start();
  } catch (e) { ctx = null; }
}
export function setEngine(level, press) {
  if (!gain) return;
  const t = ctx.currentTime;
  gain.gain.setTargetAtTime(level * (0.12 + 0.55 * press), t, 0.06);
  filt.frequency.setTargetAtTime(160 + 700 * level * (0.3 + press), t, 0.08);
}
function burst(dur, freq, vol) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start();
}
export const boom = () => burst(1.6, 500, 1.4);
export const clunk = () => burst(0.25, 1400, 0.6);
export function blip(freq = 880) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = 0.08;
  g.gain.setTargetAtTime(0, ctx.currentTime + 0.05, 0.05);
  o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + 0.3);
}
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('of_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}
export const isMuted = () => muted;
