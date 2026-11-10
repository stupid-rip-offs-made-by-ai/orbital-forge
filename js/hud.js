import { P, M, bodyPos } from './physics.js';

export function fmtDist(m) {
  if (!isFinite(m)) return '∞';
  const a = Math.abs(m);
  if (a < 10000) return `${Math.round(m).toLocaleString()} m`;
  if (a < 1e7) return `${(m / 1000).toFixed(1)} km`;
  return `${(m / 1e6).toFixed(2)} Mm`;
}

export function drawAttitude(f) {
  const cv = document.getElementById('att');
  if (!cv) return;
  const ctx = cv.getContext('2d'), v = f.vessel;
  const R = cv.width / 2 - 3;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const dom = f.domBody;
  const bp = dom === P ? { x: 0, y: 0 } : bodyPos(M, f.t);
  const up = Math.atan2(v.y - bp.y, v.x - bp.x);
  const tilt = v.angle - up;
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
  ctx.rotate(tilt);
  ctx.fillStyle = '#2f6fbf'; ctx.fillRect(-R, -R, R * 2, R);
  ctx.fillStyle = '#7a5531'; ctx.fillRect(-R, 0, R * 2, R);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.stroke();
  ctx.lineWidth = 2;
  for (let a = -60; a <= 60; a += 30) {
    if (!a) continue;
    const y = (-a / 90) * R;
    ctx.beginPath(); ctx.moveTo(-R * 0.22, y); ctx.lineTo(R * 0.22, y); ctx.stroke();
  }
  const r = f.speedRef;
  if (r && Math.hypot(r.vx, r.vy) > 0.5) {
    const psi = Math.atan2(r.vy, r.vx) - up;
    const mk = (ang, color, retro) => {
      const x = -Math.sin(ang) * R * 0.7, y = -Math.cos(ang) * R * 0.7;
      ctx.strokeStyle = color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      if (retro) { ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); }
      else { ctx.moveTo(x - 19, y); ctx.lineTo(x - 11, y); ctx.moveTo(x + 11, y); ctx.lineTo(x + 19, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 19); }
      ctx.stroke();
    };
    mk(psi, '#d9ff5a', false);
    mk(psi + Math.PI, '#ff9a3c', true);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-R * 0.5, 8); ctx.lineTo(-R * 0.16, 8); ctx.lineTo(0, -10); ctx.lineTo(R * 0.16, 8); ctx.lineTo(R * 0.5, 8); ctx.stroke();
}
