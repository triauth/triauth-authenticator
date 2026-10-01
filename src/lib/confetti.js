/*
 * Triauth Authenticator - Copyright (c) 2026 The Triauth Authors (https://www.triauth.org/)
 * Licensed under the Elastic License 2.0; see LICENSE.txt for the full text.
 * SPDX-License-Identifier: Elastic-2.0
 */

// A short burst of flat squares in the brand colours, drawn on a full-window canvas that
// removes itself once the last square has faded. Does nothing under prefers-reduced-motion.
// x and y are the origin as fractions of the window. Returns a function that stops the burst early.

const COLORS = ['#2563eb', '#1d4ed8', '#111111', '#93c5fd'];

export function confetti({x = 0.5, y = 0.3, count = 80} = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;pointer-events:none;z-index:30`;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const unit = Math.min(w, 860) / 860;  // smaller and slower on narrow screens
  const parts = Array.from({length: count}, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;  // fan of ~80 degrees, straight up
    const speed = (6 + Math.random() * 6) * unit;
    return {
      x: x * w, y: y * h, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: (5 + Math.random() * 5) * unit,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      tilt: Math.random() * Math.PI, vt: 0.08 + Math.random() * 0.14,
      color: COLORS[i % COLORS.length], life: 0, ttl: 110 + Math.random() * 50,
    };
  });

  let raf;
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      if (p.life++ > p.ttl) continue;
      alive++;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.35 * unit;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.tilt += p.vt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.ttl - p.life) / 30);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.tilt));  // flutter
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(frame); else canvas.remove();
  };
  raf = requestAnimationFrame(frame);

  return () => { cancelAnimationFrame(raf); canvas.remove(); };
}
