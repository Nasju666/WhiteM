/* ============================================================
   animations.js — Scroll-reveal + count-up animations
   ============================================================ */

let observer;

export function initScrollAnimations() {
  // Intersection Observer for scroll-reveal
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Stagger children if it's a grid
        if (entry.target.classList.contains('stagger-children')) {
          const children = entry.target.children;
          Array.from(children).forEach((child, i) => {
            child.style.transitionDelay = `${i * 0.08}s`;
            child.classList.add('revealed');
          });
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
}

/** Observe all scroll-reveal elements currently in the DOM */
export function observeElements() {
  if (!observer) initScrollAnimations();
  document.querySelectorAll('.scroll-reveal, .stagger-children').forEach(el => {
    observer.observe(el);
  });
}

/** Animate a number counting up from 0 */
export function countUp(el, target, duration = 1500) {
  const start = performance.now();
  const isDecimal = String(target).includes('.');

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = eased * target;
    el.textContent = isDecimal ? current.toFixed(2) : Math.floor(current);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/** Observe stat values and count them up when visible */
export function initCountUp() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const val = parseFloat(entry.target.dataset.count);
        if (!isNaN(val)) countUp(entry.target, val);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-count]').forEach(el => obs.observe(el));
}

/** Text reveal effect — characters appear one by one */
export function textReveal(el) {
  const text = el.textContent;
  el.textContent = '';
  el.style.visibility = 'visible';
  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.textContent = char;
    span.style.opacity = '0';
    span.style.display = 'inline-block';
    span.style.animation = `fadeInChar 0.3s ${i * 0.02}s forwards`;
    if (char === ' ') span.style.width = '0.3em';
    el.appendChild(span);
  });
}
