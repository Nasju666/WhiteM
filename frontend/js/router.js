/* ============================================================
   router.js — Simple hash-based SPA router
   ============================================================ */

const routes = {};
let currentCleanup = null;
let handleRoute = null;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  const target = '#' + path;
  if (window.location.hash === target) {
    refresh();
  } else {
    window.location.hash = target;
  }
}

export function refresh() {
  if (handleRoute) handleRoute();
}

export function start() {
  handleRoute = async function () {
    const hash = window.location.hash.slice(1) || '/';
    const content = document.getElementById('app');

    // Find matching route
    let handler = null;
    let params = {};

    for (const [pattern, h] of Object.entries(routes)) {
      const match = matchRoute(pattern, hash);
      if (match) {
        handler = h;
        params = match;
        break;
      }
    }

    if (currentCleanup) { currentCleanup(); currentCleanup = null; }

    // Update page mode (theme + 3D canvas visibility)
    try {
      const { updatePageMode } = await import('./app.js');
      updatePageMode();
    } catch (e) { /* first load before app.js is ready */ }

    if (handler) {
      content.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
      try {
        const cleanup = await handler(content, params);
        if (typeof cleanup === 'function') currentCleanup = cleanup;
        // Render Lucide SVG icons in the newly injected DOM
        if (window.lucide) window.lucide.createIcons();
      } catch (err) {
        content.innerHTML = `<div class="container"><div class="empty-state"><div class="icon"><i data-lucide="alert-circle" style="width:48px;height:48px;"></i></div><p>${err.message}</p></div></div>`;
        if (window.lucide) window.lucide.createIcons();
      }
    } else {
      content.innerHTML = '<div class="container"><div class="empty-state"><div class="icon"><i data-lucide="search" style="width:48px;height:48px;"></i></div><p>Page not found</p></div></div>';
      if (window.lucide) window.lucide.createIcons();
    }

    // Update active nav link
    document.querySelectorAll('.navbar-links a').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === '#' + hash || (hash.startsWith(href?.slice(1)) && href !== '#/'));
    });
  };

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function matchRoute(pattern, path) {
  // Convert /products/:id to regex
  const keys = [];
  const regex = pattern.replace(/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  const match = path.match(new RegExp(`^${regex}$`));
  if (!match) return null;
  const params = {};
  keys.forEach((key, i) => { params[key] = match[i + 1]; });
  return params;
}
