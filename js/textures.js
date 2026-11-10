import { PARTS } from './parts.js';

export const TEX = {};
export function textureList() {
  const list = ['planet', 'parts/legs_stowed'];
  for (const p of Object.values(PARTS)) list.push(p.tex);
  return list;
}
export function loadTextures(onProgress) {
  const list = textureList();
  let done = 0;
  return Promise.all(list.map((name) => new Promise((res) => {
    const img = new Image();
    const fin = () => { done++; onProgress && onProgress(done / list.length); res(); };
    img.onload = () => { TEX[name] = img; fin(); };
    img.onerror = () => { console.warn('missing texture', name); fin(); };
    img.src = 'assets/textures/' + name + '.png';
  })));
}
