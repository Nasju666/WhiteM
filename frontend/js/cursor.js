/* ============================================================
   cursor.js — Custom cursor with magnetic button effect
   ============================================================ */

let dot, ring;
let mx = 0, my = 0, dx = 0, dy = 0;

export function initCursor() {
  // Create cursor elements
  dot = document.createElement('div');
  dot.className = 'cursor-dot';
  ring = document.createElement('div');
  ring.className = 'cursor-ring';
  document.body.appendChild(dot);
  document.body.appendChild(ring);

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
  });

  // Hover effects on interactive elements
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('button, a, .product-card, .editable, .filter-chip, input, textarea, select');
    if (el) {
      ring.classList.add('cursor-hover');
      dot.classList.add('cursor-hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('button, a, .product-card, .editable, .filter-chip, input, textarea, select');
    if (el) {
      ring.classList.remove('cursor-hover');
      dot.classList.remove('cursor-hover');
    }
  });

  // Click effect
  document.addEventListener('mousedown', () => ring.classList.add('cursor-click'));
  document.addEventListener('mouseup', () => ring.classList.remove('cursor-click'));

  // Magnetic buttons
  document.addEventListener('mousemove', magneticEffect);

  animateCursor();
}

function animateCursor() {
  dx += (mx - dx) * 0.12;
  dy += (my - dy) * 0.12;
  ring.style.left = dx + 'px';
  ring.style.top = dy + 'px';
  requestAnimationFrame(animateCursor);
}

function magneticEffect(e) {
  document.querySelectorAll('.btn, .wallet-btn').forEach(btn => {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const threshold = 80;

    if (dist < threshold) {
      const pull = (1 - dist / threshold) * 8;
      const ax = (e.clientX - cx) * pull / threshold;
      const ay = (e.clientY - cy) * pull / threshold;
      btn.style.transform = `translate(${ax}px, ${ay}px)`;
    } else {
      btn.style.transform = '';
    }
  });
}
