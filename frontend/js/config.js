/* ============================================================
   config.js — where the frontend finds the backend API
   ============================================================ */

// Public backend URL when the site is hosted separately (e.g. Cloudflare Pages + Render).
// Change this if your Render service gets a different name.
const PRODUCTION_API = 'https://whitemarket-api.onrender.com';

const { hostname, port } = window.location;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
const onDevPort = port !== '' && port !== '80';

// Local dev server (port 3000) -> Django on :8000
// Local Docker/Nginx (port 80) -> same origin
// Anywhere else (production)   -> PRODUCTION_API
export const API_BASE = isLocal ? (onDevPort ? 'http://localhost:8000' : '') : PRODUCTION_API;
