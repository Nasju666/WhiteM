/* ============================================================
   pages.js — All page render functions (3D interactive)
   ============================================================ */

import api from './api.js';
import auth from './auth.js';
import toast from './toast.js';
import { navigate, refresh } from './router.js';
import { observeElements, initCountUp, textReveal } from './animations.js';
import { createEscrow, confirmDelivery, phpToEthDisplay } from './escrow.js';

// Resolve relative media URLs to absolute (dev: port 3000 → 8000)
const API_ORIGIN = window.location.port === '80' || window.location.port === ''
  ? ''
  : 'http://localhost:8000';
function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return API_ORIGIN + url;
}

// Price formatter — strips trailing zeros
function formatPrice(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

// ─── Success Modal ─────────────────────────────────────────
function showSuccessModal({ title, subtitle, details, buttonText, onClose }) {
  // Remove any existing modal
  document.querySelector('.success-overlay')?.remove();

  const detailRows = details.map(d =>
    `<div class="detail-row">
       <span class="detail-label">${d.label}</span>
       <span class="detail-value">${d.value}</span>
     </div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';
  overlay.innerHTML = `
    <div class="success-modal">
      <div class="success-check">
        <svg viewBox="0 0 40 40">
          <path class="check-path" d="M10 20 L17 27 L30 13" />
        </svg>
      </div>
      <h2>${title}</h2>
      <p class="success-subtitle">${subtitle}</p>
      <div class="success-details">${detailRows}</div>
      <button class="btn-close-modal">${buttonText || 'Done'}</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Spawn floating particles
  const modal = overlay.querySelector('.success-modal');
  const colors = ['#10b981', '#34d399', '#6ee7b7', '#059669', '#a7f3d0'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'success-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.bottom = '40%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.animationDuration = (1 + Math.random()) + 's';
    modal.appendChild(p);
  }

  // Render Lucide icons inside modal
  if (window.lucide) window.lucide.createIcons();

  // Close handler — forces page re-render so user sees updated status
  const closeBtn = overlay.querySelector('.btn-close-modal');
  closeBtn.addEventListener('click', () => {
    overlay.style.animation = 'successFadeIn 0.2s ease reverse forwards';
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
      refresh();
    }, 200);
  });
}

// ─── Landing Page ──────────────────────────────────────────
export async function landingPage(el) {
  el.innerHTML = `
    <section class="hero">
      <div class="hero-content">
        <h1 class="scroll-reveal">White Market<br>Trading Hub</h1>
        <p class="scroll-reveal">Buy and sell physical goods, digital products, and game accounts with blockchain-powered escrow protection. Every transaction is secured by smart contracts on Ethereum.</p>
        <div class="hero-actions scroll-reveal">
          <a href="#/products" class="btn btn-primary btn-lg">Explore Marketplace</a>
          ${!auth.isConnected() ? '<button id="hero-connect" class="btn btn-secondary btn-lg">Connect Wallet →</button>' : ''}
        </div>
        <div class="hero-features scroll-reveal stagger-children">
          <div class="hero-feature">
            <span class="icon"><i data-lucide="lock" style="width:24px;height:24px;"></i></span>
            <span class="label">Escrow-Protected</span>
          </div>
          <div class="hero-feature">
            <span class="icon"><i data-lucide="link" style="width:24px;height:24px;"></i></span>
            <span class="label">Blockchain-Verified</span>
          </div>
          <div class="hero-feature">
            <span class="icon"><i data-lucide="shield-check" style="width:24px;height:24px;"></i></span>
            <span class="label">Dispute Resolution</span>
          </div>
          <div class="hero-feature">
            <span class="icon"><i data-lucide="wallet" style="width:24px;height:24px;"></i></span>
            <span class="label">MetaMask Auth</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── How It Works ──────────────────────────────────────── -->
    <section style="padding:80px 0 60px;">
      <div class="container" style="max-width:960px;">
        <div class="glow-line"></div>
        <div class="scroll-reveal" style="text-align:center;margin-bottom:56px;">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:5px 16px;border-radius:20px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);margin-bottom:16px;">
            <i data-lucide="workflow" style="width:14px;height:14px;color:var(--accent);"></i>
            <span style="font-size:0.78rem;font-weight:700;letter-spacing:0.07em;color:var(--accent);text-transform:uppercase;">Transaction Flow</span>
          </div>
          <h2 style="font-size:2rem;font-weight:800;margin-bottom:10px;">How It Works</h2>
          <p style="color:var(--text-secondary);font-size:1rem;max-width:480px;margin:0 auto;">From wallet connection to confirmed delivery — every step protected by blockchain escrow.</p>
        </div>

        <!-- Steps -->
        <div style="display:flex;flex-direction:column;gap:0;">

          ${[
            {
              n:'01', icon:'wallet', color:'#818cf8', bg:'rgba(99,102,241,0.1)', border:'rgba(99,102,241,0.2)',
              title:'Connect Your Wallet',
              sub:'No passwords. No accounts. Just your MetaMask.',
              points:[
                'Install MetaMask and create or import an Ethereum wallet.',
                'Click Connect Wallet — MetaMask signs a one-time challenge message.',
                'The backend verifies your signature and issues a secure session token.',
                'Your wallet address becomes your unique identity on the platform.',
              ],
              tag:'For Everyone',
            },
            {
              n:'02', icon:'shield-check', color:'#34d399', bg:'rgba(52,211,153,0.08)', border:'rgba(52,211,153,0.2)',
              title:'Get Verified to Sell',
              sub:'KYC ensures every seller is a real, accountable person.',
              points:[
                'Upload a government-issued ID (PhilSys, Passport, Driver\'s License, etc.).',
                'Submit your personal details and a selfie for identity matching.',
                'An admin reviews and approves your submission — typically within 1–2 days.',
                'Verified badge appears on your listings, building buyer trust.',
              ],
              tag:'Sellers Only',
            },
            {
              n:'03', icon:'package-search', color:'#60a5fa', bg:'rgba(96,165,250,0.08)', border:'rgba(96,165,250,0.2)',
              title:'Browse & Place an Order',
              sub:'Find what you need. Your payment goes into escrow, not directly to the seller.',
              points:[
                'Browse verified listings filtered by category, price, or keyword.',
                'Click Buy Now and select your quantity.',
                'MetaMask prompts you to send the ETH equivalent of the price to the Escrow smart contract.',
                'Funds are locked on-chain — the seller cannot touch them until you confirm receipt.',
              ],
              tag:'Buyers',
            },
            {
              n:'04', icon:'truck', color:'#f59e0b', bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.2)',
              title:'Seller Ships the Item',
              sub:'The seller dispatches and marks the order as shipped.',
              points:[
                'Seller receives order notification on their dashboard.',
                'Seller packs and ships the item via their stated shipping method.',
                'Seller marks the order as Shipped in the platform.',
                'Buyer can see the updated status and knows the item is on its way.',
              ],
              tag:'Sellers',
            },
            {
              n:'05', icon:'check-circle', color:'#10b981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.2)',
              title:'Buyer Confirms Delivery',
              sub:'Once you receive and verify the item, one click releases the funds.',
              points:[
                'Buyer inspects the received item against the listing description.',
                'Click Confirm Delivery on the order page.',
                'MetaMask signs a transaction calling confirmDelivery on the smart contract.',
                'Escrow funds are automatically transferred to the seller\'s wallet on-chain.',
              ],
              tag:'Buyers',
            },
            {
              n:'06', icon:'scale', color:'#ef4444', bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.2)',
              title:'Dispute Resolution (If Needed)',
              sub:'Something wrong? Raise a dispute. Funds stay frozen until an admin decides.',
              points:[
                'Buyer or seller opens a dispute with a reason and written description.',
                'Both parties upload evidence (photos, screenshots, PDFs) independently.',
                'Admin reviews all evidence, inspects the original product listing, and adds notes.',
                'Admin resolves by choosing Refund Buyer or Pay Seller — the smart contract executes the transfer automatically.',
              ],
              tag:'Both Parties',
            },
          ].map((s, i, arr) => `
            <div class="scroll-reveal" style="display:flex;gap:0;align-items:stretch;">
              <!-- Number column -->
              <div style="display:flex;flex-direction:column;align-items:center;width:60px;flex-shrink:0;">
                <div style="width:48px;height:48px;border-radius:50%;background:${s.bg};border:2px solid ${s.border};display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;">
                  <i data-lucide="${s.icon}" style="width:20px;height:20px;color:${s.color};"></i>
                </div>
                ${i < arr.length - 1 ? `<div style="flex:1;width:2px;background:linear-gradient(${s.border},${arr[i+1].border});min-height:24px;margin:4px 0;"></div>` : ''}
              </div>

              <!-- Content card -->
              <div style="flex:1;margin-left:20px;padding-bottom:${i < arr.length - 1 ? '32px' : '0'};">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
                  <span style="font-size:0.68rem;font-weight:800;letter-spacing:0.06em;color:var(--text-muted);">${s.n}</span>
                  <h3 style="font-size:1.05rem;font-weight:700;margin:0;">${s.title}</h3>
                  <span style="padding:2px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;background:${s.bg};color:${s.color};border:1px solid ${s.border};">${s.tag}</span>
                </div>
                <p style="color:var(--text-secondary);font-size:0.88rem;margin:0 0 12px;">${s.sub}</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                  ${s.points.map(pt => `
                    <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">
                      <div style="width:6px;height:6px;border-radius:50%;background:${s.color};flex-shrink:0;margin-top:5px;"></div>
                      <span style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${pt}</span>
                    </div>`).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- ── Why White Market ───────────────────────────────────── -->
    <section style="padding:60px 0;background:var(--bg-secondary);">
      <div class="container" style="max-width:960px;">
        <div class="scroll-reveal" style="text-align:center;margin-bottom:48px;">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:5px 16px;border-radius:20px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);margin-bottom:16px;">
            <i data-lucide="shield" style="width:14px;height:14px;color:var(--success);"></i>
            <span style="font-size:0.78rem;font-weight:700;letter-spacing:0.07em;color:var(--success);text-transform:uppercase;">Why Us</span>
          </div>
          <h2 style="font-size:1.9rem;font-weight:800;margin-bottom:10px;">Why White Market?</h2>
          <p style="color:var(--text-secondary);font-size:0.97rem;max-width:480px;margin:0 auto;">We built the safeguards that social media marketplaces never had.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">
          ${[
            { icon:'lock',          color:'#818cf8', bg:'rgba(99,102,241,0.1)',   title:'Escrow-Protected Payments',   desc:'Buyer funds are locked in a smart contract. The seller only gets paid after you confirm the item arrived as described.' },
            { icon:'user-check',    color:'#34d399', bg:'rgba(52,211,153,0.08)',  title:'Verified Sellers Only',       desc:'Every seller completes government ID verification before posting. No anonymous listings, no fake accounts.' },
            { icon:'file-check',    color:'#60a5fa', bg:'rgba(96,165,250,0.08)', title:'Immutable Transaction Records', desc:'Every payment is recorded on the Ethereum blockchain — permanently timestamped and tamper-proof.' },
            { icon:'scale',         color:'#f59e0b', bg:'rgba(245,158,11,0.08)', title:'Fair Dispute Arbitration',     desc:'If something goes wrong, an admin reviews evidence from both parties and resolves the case — no guessing, no ghosting.' },
            { icon:'key',           color:'#a78bfa', bg:'rgba(167,139,250,0.1)', title:'No Passwords Stored',          desc:'Authentication is handled entirely by your MetaMask wallet signature. We never store credentials.' },
            { icon:'star',          color:'#fbbf24', bg:'rgba(251,191,36,0.08)', title:'Seller Ratings & Reviews',     desc:'Buyers rate sellers after each completed transaction, building a trustworthy reputation system over time.' },
          ].map(c => `
            <div class="card scroll-reveal" style="padding:22px;border-color:${c.border || c.bg};">
              <div style="width:42px;height:42px;border-radius:12px;background:${c.bg};display:flex;align-items:center;justify-content:center;margin-bottom:14px;">
                <i data-lucide="${c.icon}" style="width:20px;height:20px;color:${c.color};"></i>
              </div>
              <div style="font-weight:700;font-size:0.95rem;margin-bottom:6px;">${c.title}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${c.desc}</div>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- ── For Buyers vs Sellers ─────────────────────────────── -->
    <section style="padding:70px 0;">
      <div class="container" style="max-width:860px;">
        <div class="scroll-reveal" style="text-align:center;margin-bottom:48px;">
          <h2 style="font-size:1.9rem;font-weight:800;margin-bottom:10px;">Built for Both Sides</h2>
          <p style="color:var(--text-secondary);font-size:0.97rem;">Whether you're buying or selling, the platform has you covered.</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <!-- Buyers -->
          <div class="card scroll-reveal" style="padding:28px;border-color:rgba(96,165,250,0.25);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;">
                <i data-lucide="shopping-bag" style="width:18px;height:18px;color:#60a5fa;"></i>
              </div>
              <span style="font-size:1.1rem;font-weight:800;color:#60a5fa;">For Buyers</span>
            </div>
            ${['Your money is locked in escrow until you confirm receipt.','Browse only verified, KYC-approved sellers.','Open a dispute if the item doesn\'t match the listing.','Leave a review to help other buyers make informed decisions.','One-click MetaMask payment — no card details, no bank transfers.'].map(t => `
              <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;">
                <i data-lucide="check" style="width:15px;height:15px;color:#60a5fa;flex-shrink:0;margin-top:2px;"></i>
                <span style="font-size:0.88rem;color:var(--text-secondary);line-height:1.5;">${t}</span>
              </div>`).join('')}
            <a href="#/marketplace" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.4);">
              Browse Marketplace
            </a>
          </div>
          <!-- Sellers -->
          <div class="card scroll-reveal" style="padding:28px;border-color:rgba(52,211,153,0.25);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
              <div style="width:38px;height:38px;border-radius:10px;background:rgba(52,211,153,0.1);display:flex;align-items:center;justify-content:center;">
                <i data-lucide="store" style="width:18px;height:18px;color:#34d399;"></i>
              </div>
              <span style="font-size:1.1rem;font-weight:800;color:#34d399;">For Sellers</span>
            </div>
            ${['Get a verified badge that builds instant buyer trust.','Upload multiple photos and full product descriptions.','Funds are released automatically when buyer confirms receipt.','Submit counter-evidence if a dispute is raised against you.','Earn ratings and reviews that grow your reputation over time.'].map(t => `
              <div style="display:flex;align-items:flex-start;gap:9px;margin-bottom:10px;">
                <i data-lucide="check" style="width:15px;height:15px;color:#34d399;flex-shrink:0;margin-top:2px;"></i>
                <span style="font-size:0.88rem;color:var(--text-secondary);line-height:1.5;">${t}</span>
              </div>`).join('')}
            <a href="#/kyc" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px;background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.35);">
              Start Selling
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ── CTA ───────────────────────────────────────────────── -->
    <section style="padding:70px 0 90px;">
      <div class="container" style="max-width:640px;text-align:center;">
        <div class="card scroll-reveal" style="padding:52px 40px;background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border-color:rgba(99,102,241,0.2);">
          <div style="width:60px;height:60px;border-radius:50%;background:var(--grad-accent);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <i data-lucide="zap" style="width:26px;height:26px;color:#fff;"></i>
          </div>
          <h2 style="font-size:1.75rem;font-weight:800;margin-bottom:10px;">Ready to trade safely?</h2>
          <p style="color:var(--text-secondary);font-size:0.97rem;margin-bottom:28px;line-height:1.6;">Join White Market and experience the only Philippine peer-to-peer marketplace with blockchain escrow protection and verified sellers.</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="#/marketplace" class="btn btn-primary btn-lg">Explore Marketplace</a>
            ${!auth.isConnected() ? '<button id="cta-connect" class="btn btn-secondary btn-lg">Connect Wallet →</button>' : '<a href="#/kyc" class="btn btn-secondary btn-lg">Become a Seller</a>'}
          </div>
        </div>
      </div>
    </section>
  `;

  async function handleConnect() {
    try {
      await auth.connect();
      window.dispatchEvent(new Event('auth-changed'));
      toast.success('Wallet connected!');
      navigate('/marketplace');
    } catch (e) { toast.error(e.message); }
  }

  const heroConnect = el.querySelector('#hero-connect');
  if (heroConnect) heroConnect.addEventListener('click', handleConnect);

  const ctaConnect = el.querySelector('#cta-connect');
  if (ctaConnect) ctaConnect.addEventListener('click', handleConnect);

  requestAnimationFrame(() => { observeElements(); if (window.lucide) window.lucide.createIcons(); });
}

// ─── Marketplace Page ──────────────────────────────────────
export async function marketplacePage(el) {
  el.innerHTML = `
    <div class="container">
      <div class="page-header scroll-reveal">
        <h1>Marketplace</h1>
        <p class="text-muted">Browse active listings</p>
      </div>
      <div class="filters scroll-reveal">
        <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search products...">
        <button class="filter-chip active" data-cat="">All</button>
        <button class="filter-chip" data-cat="physical">Physical</button>
        <button class="filter-chip" data-cat="digital">Digital</button>
        <button class="filter-chip" data-cat="game_account">Game Account</button>
      </div>
      <div id="productGrid" class="product-grid stagger-children">
        <div class="loader"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  let currentCat = '';

  async function loadProducts(search = '', category = '') {
    const grid = el.querySelector('#productGrid');
    grid.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      const products = await api.get('/api/products/', params);
      if (products.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="icon">📦</div><p>No products found</p></div>';
        return;
      }
      grid.innerHTML = products.map(p => `
        <div class="product-card scroll-reveal" data-id="${p.id}">
          <div class="product-card-img">
            ${p.image ? `<img src="${mediaUrl(p.image)}" alt="${esc(p.title)}">` : categoryIcon(p.category)}
          </div>
          <div class="product-card-body">
            <span class="badge badge-${p.category}">${p.category.replace('_', ' ')}</span>
            <h3>${esc(p.title)}</h3>
            <p class="text-muted" style="font-size:0.85rem; margin-top:4px;">${esc((p.description || '').slice(0, 80))}</p>
            <div class="product-card-meta">
              <span class="product-price">₱${formatPrice(p.price)}</span>
              <span class="text-muted">${p.quantity} left</span>
            </div>
          </div>
        </div>
      `).join('');
      requestAnimationFrame(() => observeElements());
    } catch (e) {
      grid.innerHTML = `<div class="empty-state"><p>Error loading products: ${e.message}</p></div>`;
    }
  }

  el.querySelector('#productGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) navigate(`/products/${card.dataset.id}`);
  });

  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentCat = chip.dataset.cat;
      loadProducts(el.querySelector('#searchInput').value, currentCat);
    });
  });

  let searchTimer;
  el.querySelector('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadProducts(e.target.value, currentCat), 300);
  });

  requestAnimationFrame(() => observeElements());
  await loadProducts();
}

// ─── Product Detail Page (with inline editing) ─────────────
export async function productDetailPage(el, params) {
  const product = await api.get(`/api/products/${params.id}/`);
  const isSeller = auth.user && auth.user.wallet_address === product.seller_wallet;

  el.innerHTML = `
    <div class="container mt-4">
      <a href="#/products" class="scroll-reveal" style="color:var(--text-muted);font-size:0.9rem;">← Back to Marketplace</a>
      <div class="detail-grid mt-3">
        <div class="scroll-reveal" style="display:flex;flex-direction:column;gap:20px;">
          ${(() => {
            const imgs = product.images?.length ? product.images : (product.image ? [{ id: 0, image: product.image }] : []);
            if (!imgs.length) return `<div class="product-card-img" style="height:400px;border-radius:var(--radius);">${categoryIcon(product.category)}</div>`;
            return `
              <div style="position:relative;">
                <div id="galleryMain" style="height:400px;border-radius:var(--radius);overflow:hidden;background:var(--bg-card);">
                  <img id="galleryMainImg" src="${mediaUrl(imgs[0].image)}" alt="${esc(product.title)}" style="width:100%;height:100%;object-fit:cover;">
                </div>
                ${imgs.length > 1 ? `
                <div id="galleryThumbs" style="display:flex;gap:8px;margin-top:8px;overflow-x:auto;padding-bottom:4px;">
                  ${imgs.map((img, i) => `
                    <img data-src="${mediaUrl(img.src || img.image)}" data-img-id="${img.id}"
                      src="${mediaUrl(img.src || img.image)}"
                      style="width:72px;height:72px;object-fit:cover;border-radius:8px;cursor:pointer;flex-shrink:0;opacity:${i === 0 ? 1 : 0.5};border:2px solid ${i === 0 ? 'var(--accent-primary)' : 'transparent'};transition:all 0.15s;">
                  `).join('')}
                </div>` : ''}
              </div>`;
          })()}

          <!-- ── Seller Reviews (left column) ── -->
          <div id="reviewsSection">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
              <h3 style="margin:0;font-size:1rem;">Seller Reviews</h3>
              <div id="reviewSummary" style="font-size:0.85rem;color:var(--text-muted);"></div>
            </div>
            <div id="reviewForm" style="display:none;" class="card" style="margin-bottom:14px;padding:14px;">
              <p style="font-weight:600;margin-bottom:10px;font-size:0.9rem;">Leave a Review</p>
              <div class="form-group">
                <label>Rating</label>
                <div id="starPicker" style="display:flex;gap:4px;cursor:pointer;font-size:1.5rem;line-height:1;">
                  ${[1,2,3,4,5].map(n => `<span data-star="${n}" style="opacity:0.3;transition:opacity 0.1s;">★</span>`).join('')}
                </div>
                <input type="hidden" id="reviewRating" value="0">
              </div>
              <div class="form-group">
                <label>Comment <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
                <textarea id="reviewComment" class="form-textarea" placeholder="Share your experience with this seller..." style="min-height:70px;"></textarea>
              </div>
              <button id="submitReviewBtn" class="btn btn-primary btn-sm">Submit Review</button>
            </div>
            <div id="reviewList" style="display:flex;flex-direction:column;gap:10px;">
              <div class="loader"><div class="spinner"></div></div>
            </div>
          </div>
        </div>
        <div class="card scroll-reveal">
          <span class="badge badge-${product.category}">${product.category.replace('_', ' ')}</span>
          <span class="badge badge-${product.status}" style="margin-left:6px;">${product.status}</span>

          <h1 style="margin-top:16px;"
            ${isSeller ? `class="editable" data-field="title" data-id="${product.id}" contenteditable="false"` : ''}>
            ${esc(product.title)}
          </h1>

          <p class="product-price" style="font-size:1.6rem;margin-top:16px;"
            ${isSeller ? `class="product-price editable" data-field="price" data-id="${product.id}" contenteditable="false"` : ''}>
            ₱${formatPrice(product.price)}
          </p>

          <p class="text-muted mt-1">${product.quantity} available</p>

          <div class="glow-line" style="margin:20px 0;"></div>

          <p style="line-height:1.8;"
            ${isSeller ? `class="editable" data-field="description" data-id="${product.id}" contenteditable="false"` : ''}>
            ${esc(product.description || 'No description provided.')}
          </p>

          ${(product.location || product.shipping_info) ? `
          <div class="glow-line" style="margin:20px 0;"></div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${product.location ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-muted);">
                <i data-lucide="map-pin" style="width:14px;height:14px;flex-shrink:0;"></i>
                <span>${esc(product.location)}</span>
              </div>` : ''}
            ${product.shipping_info ? `
              <div style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:var(--text-muted);">
                <i data-lucide="truck" style="width:14px;height:14px;flex-shrink:0;"></i>
                <span>${esc(product.shipping_info)}</span>
              </div>` : ''}
          </div>` : ''}

          ${product.facebook_url ? `
          <a href="${product.facebook_url}" target="_blank" rel="noopener noreferrer"
             class="btn btn-secondary mt-3" style="width:100%;justify-content:center;gap:8px;">
            <i data-lucide="facebook" style="width:16px;height:16px;"></i>
            Contact Seller on Facebook
          </a>` : ''}

          <div class="mt-3" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <p class="text-muted" style="font-size:0.8rem;font-family:var(--font-mono);margin:0;">
              Seller: ${product.seller_wallet.slice(0, 10)}...${product.seller_wallet.slice(-6)}
            </p>
            <span id="sellerRatingBadge" style="font-size:0.8rem;color:var(--text-muted);">loading…</span>
          </div>

          ${product.status === 'active' && !isSeller && auth.isConnected() ? `
            <div class="glow-line" style="margin:20px 0;"></div>
            <div>
              <div class="form-group">
                <label>Quantity</label>
                <input type="number" id="buyQty" class="form-input" value="1" min="1" max="${product.quantity}" style="width:120px;">
              </div>
              ${product.category === 'physical' ? `
                <div class="form-group">
                  <label>Shipping Address</label>
                  <textarea id="buyAddr" class="form-textarea" placeholder="Enter your shipping address..."></textarea>
                </div>
              ` : ''}
              <button id="buyBtn" class="btn btn-primary btn-lg" style="width:100%;">Buy Now</button>
            </div>
          ` : ''}

          ${isSeller ? `<p class="text-muted mt-3" style="font-size:0.75rem;">💡 Click any highlighted field to edit it inline.</p>` : ''}
        </div>
      </div>
    </div>
  `;

  // Gallery thumbnail switcher
  el.querySelectorAll('#galleryThumbs img').forEach(thumb => {
    thumb.addEventListener('click', () => {
      el.querySelector('#galleryMainImg').src = thumb.dataset.src;
      el.querySelectorAll('#galleryThumbs img').forEach(t => {
        t.style.opacity = '0.5';
        t.style.borderColor = 'transparent';
      });
      thumb.style.opacity = '1';
      thumb.style.borderColor = 'var(--accent-primary)';
    });
  });

  // Inline editing for sellers
  if (isSeller) {
    el.querySelectorAll('.editable').forEach(field => {
      field.addEventListener('click', () => {
        field.contentEditable = 'true';
        field.classList.add('editing');
        field.focus();
      });
      field.addEventListener('blur', async () => {
        field.contentEditable = 'false';
        field.classList.remove('editing');
        field.classList.add('editable-saving');

        const fieldName = field.dataset.field;
        let value = field.textContent.trim();

        // Clean up price field (remove currency symbol)
        if (fieldName === 'price') value = value.replace(/[₱\s*PHP\s*]/ig, '');

        try {
          await api.patch(`/api/products/${field.dataset.id}/`, { [fieldName]: value });
          toast.success(`${fieldName} updated!`);
        } catch (e) {
          toast.error(`Failed to update: ${e.message}`);
        }

        setTimeout(() => field.classList.remove('editable-saving'), 600);
      });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          field.blur();
        }
        if (e.key === 'Escape') {
          field.contentEditable = 'false';
          field.classList.remove('editing');
        }
      });
    });
  }

  // Buy button
  const buyBtn = el.querySelector('#buyBtn');
  if (buyBtn) {
    buyBtn.addEventListener('click', async () => {
      const qty = parseInt(el.querySelector('#buyQty').value);
      const addr = el.querySelector('#buyAddr')?.value || '';
      buyBtn.disabled = true;
      buyBtn.textContent = 'Processing...';
      try {
        const order = await api.post('/api/orders/', {
          product: product.id,
          quantity: qty,
          shipping_address: addr,
        });
        toast.success('Order placed!');
        navigate(`/orders/${order.id}`);
      } catch (e) {
        // DRF returns field-level errors like {shipping_address: ["Required..."]}
        let msg = e.data?.detail || e.message;
        if (!msg && e.data && typeof e.data === 'object') {
          const errors = Object.entries(e.data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
          msg = errors.join(' | ') || 'Order failed';
        }
        toast.error(msg);
        buyBtn.disabled = false;
        buyBtn.textContent = 'Buy Now';
      }
    });
  }

  // ── Seller rating badge + reviews ────────────────────────
  const sellerWallet = product.seller_wallet;

  function stars(avg) {
    if (!avg) return '';
    const full = Math.round(avg);
    return [1,2,3,4,5].map(n => `<span style="color:${n <= full ? '#f59e0b' : 'var(--text-muted)'};">★</span>`).join('');
  }

  // Load stats for the inline badge
  api.get(`/api/sellers/${sellerWallet}/reviews/stats/`).then(stats => {
    const badge = el.querySelector('#sellerRatingBadge');
    if (!badge) return;
    if (stats.count === 0) {
      badge.textContent = 'No reviews yet';
    } else {
      badge.innerHTML = `${stars(stats.average)} <span style="color:var(--text-muted);">${stats.average} (${stats.count} review${stats.count !== 1 ? 's' : ''})</span>`;
    }
  }).catch(() => {
    const badge = el.querySelector('#sellerRatingBadge');
    if (badge) badge.textContent = '';
  });

  // Load full review list
  async function loadReviews() {
    const listEl   = el.querySelector('#reviewList');
    const summaryEl = el.querySelector('#reviewSummary');
    try {
      const [reviews, stats] = await Promise.all([
        api.get(`/api/sellers/${sellerWallet}/reviews/`),
        api.get(`/api/sellers/${sellerWallet}/reviews/stats/`),
      ]);

      summaryEl.innerHTML = stats.count
        ? `${stars(stats.average)} <strong>${stats.average}</strong> / 5 &nbsp;·&nbsp; ${stats.count} review${stats.count !== 1 ? 's' : ''}`
        : 'No reviews yet';

      if (!reviews.length) {
        listEl.innerHTML = `<p class="text-muted" style="font-size:0.9rem;">No reviews yet for this seller.</p>`;
        return;
      }
      listEl.innerHTML = reviews.map(r => `
        <div class="card" style="padding:14px 16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;gap:3px;font-size:1rem;">
              ${[1,2,3,4,5].map(n => `<span style="color:${n <= r.rating ? '#f59e0b' : 'var(--border-color)'};">★</span>`).join('')}
            </div>
            <span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">
              ${r.reviewer_wallet.slice(0,8)}…${r.reviewer_wallet.slice(-4)}
            </span>
          </div>
          ${r.comment ? `<p style="margin:8px 0 0;font-size:0.88rem;line-height:1.6;">${esc(r.comment)}</p>` : ''}
          <p style="margin:6px 0 0;font-size:0.72rem;color:var(--text-muted);">${new Date(r.created_at).toLocaleDateString()}</p>
        </div>
      `).join('');
    } catch {
      listEl.innerHTML = `<p class="text-muted">Could not load reviews.</p>`;
    }
  }
  loadReviews();

  // Show review form only if the current user has a completed order with this seller
  if (!isSeller && auth.isConnected()) {
    api.get('/api/orders/').then(orders => {
      const eligible = orders.find(o =>
        o.seller_wallet === sellerWallet &&
        o.status === 'completed' &&
        !o.has_review
      );
      if (eligible) {
        const formEl = el.querySelector('#reviewForm');
        formEl.style.display = '';
        formEl.dataset.orderId = eligible.id;
      }
    }).catch(() => {});
  }

  // Star picker
  const starPicker  = el.querySelector('#starPicker');
  const ratingInput = el.querySelector('#reviewRating');
  if (starPicker) {
    starPicker.querySelectorAll('span').forEach(s => {
      s.addEventListener('mouseover', () => {
        const n = +s.dataset.star;
        starPicker.querySelectorAll('span').forEach(x => x.style.opacity = +x.dataset.star <= n ? '1' : '0.3');
      });
      s.addEventListener('mouseleave', () => {
        const cur = +ratingInput.value;
        starPicker.querySelectorAll('span').forEach(x => x.style.opacity = +x.dataset.star <= cur ? '1' : '0.3');
      });
      s.addEventListener('click', () => {
        ratingInput.value = s.dataset.star;
        starPicker.querySelectorAll('span').forEach(x => x.style.color = +x.dataset.star <= +s.dataset.star ? '#f59e0b' : 'var(--text-muted)');
      });
    });
  }

  // Submit review
  const submitBtn = el.querySelector('#submitReviewBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const rating = +ratingInput.value;
      if (!rating) { toast.error('Please select a star rating'); return; }
      const orderId = +el.querySelector('#reviewForm').dataset.orderId;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        await api.post('/api/reviews/', {
          order: orderId,
          rating,
          comment: el.querySelector('#reviewComment').value.trim(),
        });
        toast.success('Review submitted!');
        el.querySelector('#reviewForm').style.display = 'none';
        loadReviews();
      } catch (e) {
        toast.error(e.data?.non_field_errors?.[0] || e.data?.detail || e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
      }
    });
  }

  requestAnimationFrame(() => observeElements());
}

// ─── Create Listing Page ───────────────────────────────────
export async function createListingPage(el) {
  if (!auth.isConnected()) { navigate('/'); return toast.error('Connect wallet first'); }

  el.innerHTML = `
    <div class="container" style="max-width:680px;">
      <div class="page-header scroll-reveal"><h1>Create Listing</h1></div>

      <!-- ── Section: Basic Info ── -->
      <div class="card scroll-reveal" style="margin-bottom:16px;">
        <div class="section-label" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px;">Basic Info</div>
        <div class="form-group">
          <label>Title <span style="color:#ef4444;">*</span></label>
          <input type="text" id="pTitle" class="form-input" placeholder="Product title" required>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Category</label>
            <select id="pCategory" class="form-select">
              <option value="physical">Physical Good</option>
              <option value="digital">Digital Product</option>
              <option value="game_account">Game Account</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="pStatus" class="form-select">
              <option value="draft">Draft (save for later)</option>
              <option value="active">Active (list immediately)</option>
            </select>
          </div>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Price (PHP) <span style="color:#ef4444;">*</span></label>
            <input type="number" id="pPrice" class="form-input" step="0.01" min="0.01" placeholder="0.00">
          </div>
          <div class="form-group">
            <label>Quantity</label>
            <input type="number" id="pQty" class="form-input" value="1" min="1">
          </div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="pDesc" class="form-textarea" placeholder="Describe your product in detail — condition, specs, inclusions..." style="min-height:110px;"></textarea>
        </div>
      </div>

      <!-- ── Section: Media ── -->
      <div class="card scroll-reveal" style="margin-bottom:16px;">
        <div class="section-label" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px;">
          Media <span id="imgCount" style="font-weight:400;opacity:0.6;">(0 / 10)</span>
        </div>
        <div id="imageDropzone" style="border:2px dashed var(--border-color);border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:border-color 0.2s;">
          <i data-lucide="image-plus" style="width:32px;height:32px;margin-bottom:8px;opacity:0.5;"></i>
          <p style="margin:0;font-size:0.85rem;color:var(--text-muted);">Click or drag & drop images</p>
          <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted);">JPG, PNG, WebP — max 5 MB each, up to 10 photos</p>
          <input type="file" id="pImage" accept="image/*" multiple style="display:none;">
        </div>
        <div id="imageThumbs" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>
      </div>

      <!-- ── Section: Shipping & Location ── -->
      <div class="card scroll-reveal" id="shippingCard" style="margin-bottom:16px;">
        <div class="section-label" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px;">Shipping &amp; Location</div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Item Location</label>
            <input type="text" id="pLocation" class="form-input" placeholder="e.g. Quezon City, Metro Manila">
          </div>
          <div class="form-group">
            <label>Shipping Info</label>
            <input type="text" id="pShipping" class="form-input" placeholder="e.g. Ships via J&T, 3–5 days">
          </div>
        </div>
      </div>

      <!-- ── Section: Contact ── -->
      <div class="card scroll-reveal" style="margin-bottom:20px;">
        <div class="section-label" style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px;">Contact</div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Facebook Profile / Page URL</label>
          <div style="position:relative;">
            <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:0.5;">
              <i data-lucide="facebook" style="width:16px;height:16px;"></i>
            </span>
            <input type="url" id="pFacebook" class="form-input" style="padding-left:36px;" placeholder="https://facebook.com/yourprofile">
          </div>
          <p style="font-size:0.75rem;color:var(--text-muted);margin:6px 0 0;">Buyers will see this to reach you — no built-in chat yet.</p>
        </div>
      </div>

      <button id="createBtn" class="btn btn-primary" style="width:100%;padding:14px;">
        <i data-lucide="plus-circle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>
        Create Listing
      </button>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // ── Multi-image dropzone ──────────────────────────────────
  const dropzone   = el.querySelector('#imageDropzone');
  const fileInput  = el.querySelector('#pImage');
  const thumbsEl   = el.querySelector('#imageThumbs');
  const imgCountEl = el.querySelector('#imgCount');
  const selectedFiles = []; // accumulates File objects

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--accent-primary)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = ''; });
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.style.borderColor = '';
    addFiles([...e.dataTransfer.files]);
  });
  fileInput.addEventListener('change', () => {
    addFiles([...fileInput.files]);
    fileInput.value = ''; // reset so same file can be re-added after removal
  });

  function addFiles(files) {
    for (const f of files) {
      if (selectedFiles.length >= 10) { toast.error('Maximum 10 photos'); break; }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} exceeds 5 MB`); continue; }
      selectedFiles.push(f);
      renderThumb(f, selectedFiles.length - 1);
    }
    updateCount();
  }

  function renderThumb(file, idx) {
    const reader = new FileReader();
    reader.onload = ev => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:80px;height:80px;flex-shrink:0;';
      wrap.dataset.idx = idx;
      wrap.innerHTML = `
        <img src="${ev.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;display:block;">
        ${idx === 0 ? '<span style="position:absolute;bottom:4px;left:4px;background:var(--accent-primary);color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:4px;">Cover</span>' : ''}
        <button data-remove="${idx}" style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,0.65);border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;color:#fff;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
      `;
      wrap.querySelector('[data-remove]').addEventListener('click', () => removeFile(idx));
      thumbsEl.appendChild(wrap);
      if (window.lucide) window.lucide.createIcons();
    };
    reader.readAsDataURL(file);
  }

  function removeFile(idx) {
    selectedFiles.splice(idx, 1);
    // Re-render all thumbs
    thumbsEl.innerHTML = '';
    selectedFiles.forEach((f, i) => renderThumb(f, i));
    updateCount();
  }

  function updateCount() {
    imgCountEl.textContent = `(${selectedFiles.length} / 10)`;
    dropzone.style.display = selectedFiles.length >= 10 ? 'none' : '';
  }

  // ── Category → shipping toggle ────────────────────────────
  const categorySelect = el.querySelector('#pCategory');
  const shippingCard   = el.querySelector('#shippingCard');
  function toggleShipping() {
    shippingCard.style.display = categorySelect.value === 'physical' ? '' : 'none';
  }
  categorySelect.addEventListener('change', toggleShipping);
  toggleShipping();

  // ── Submit ────────────────────────────────────────────────
  el.querySelector('#createBtn').addEventListener('click', async () => {
    const btn = el.querySelector('#createBtn');
    const title = el.querySelector('#pTitle').value.trim();
    const price = el.querySelector('#pPrice').value;
    if (!title) { toast.error('Title is required'); return; }
    if (!price || parseFloat(price) <= 0) { toast.error('Enter a valid price'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;animation:spin 1s linear infinite;"></i>Creating...';
    if (window.lucide) window.lucide.createIcons();

    try {
      // Step 1 — create product (first selected file becomes the legacy `image` cover)
      const fd = new FormData();
      fd.append('title',         title);
      fd.append('category',      el.querySelector('#pCategory').value);
      fd.append('description',   el.querySelector('#pDesc').value);
      fd.append('price',         price);
      fd.append('quantity',      parseInt(el.querySelector('#pQty').value));
      fd.append('status',        el.querySelector('#pStatus').value);
      fd.append('facebook_url',  el.querySelector('#pFacebook').value.trim());
      fd.append('location',      el.querySelector('#pLocation').value.trim());
      fd.append('shipping_info', el.querySelector('#pShipping').value.trim());
      if (selectedFiles[0]) fd.append('image', selectedFiles[0]);

      const product = await api.upload('/api/products/', fd);

      // Step 2 — upload all selected files to the images gallery endpoint
      if (selectedFiles.length > 0) {
        const imgFd = new FormData();
        selectedFiles.forEach(f => imgFd.append('images', f));
        await api.upload(`/api/products/${product.id}/images/`, imgFd);
      }

      toast.success('Listing created!');
      navigate(`/products/${product.id}`);
    } catch (e) {
      const msg = e.data?.detail || e.data?.title?.[0] || e.data?.price?.[0] || e.message;
      toast.error(msg);
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="plus-circle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Create Listing';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  requestAnimationFrame(() => observeElements());
}

// ─── My Orders Page ────────────────────────────────────────
export async function ordersPage(el) {
  if (!auth.isConnected()) { navigate('/'); return toast.error('Connect wallet first'); }

  el.innerHTML = `
    <div class="container" style="max-width:860px;">
      <div class="page-header scroll-reveal" style="margin-bottom:8px;">
        <div>
          <h1 style="font-size:1.75rem;font-weight:800;">My Orders</h1>
          <p style="color:var(--text-secondary);font-size:0.92rem;margin-top:4px;">Track your purchases and sales</p>
        </div>
      </div>

      <!-- Status filter chips -->
      <div class="scroll-reveal" style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
        <button class="filter-chip active" data-status="">All</button>
        <button class="filter-chip" data-status="pending">Pending</button>
        <button class="filter-chip" data-status="paid">Paid</button>
        <button class="filter-chip" data-status="shipped">Shipped</button>
        <button class="filter-chip" data-status="delivered">Delivered</button>
        <button class="filter-chip" data-status="completed">Completed</button>
        <button class="filter-chip" data-status="disputed">Disputed</button>
      </div>

      <div id="orderList"></div>
    </div>
  `;

  const statusCfg = {
    pending:   { color: 'var(--text-muted)',  icon: 'clock',          bg: 'rgba(100,116,139,0.1)'  },
    paid:      { color: '#60a5fa',            icon: 'credit-card',    bg: 'rgba(96,165,250,0.1)'   },
    shipped:   { color: '#a78bfa',            icon: 'truck',          bg: 'rgba(167,139,250,0.1)'  },
    delivered: { color: '#34d399',            icon: 'package-check',  bg: 'rgba(52,211,153,0.1)'   },
    completed: { color: 'var(--success)',     icon: 'check-circle',   bg: 'rgba(16,185,129,0.1)'   },
    disputed:  { color: 'var(--danger)',      icon: 'alert-triangle', bg: 'rgba(239,68,68,0.1)'    },
    cancelled: { color: 'var(--text-muted)',  icon: 'x-circle',       bg: 'rgba(100,116,139,0.08)' },
  };

  let allOrders = [];

  function renderOrders(statusFilter) {
    const list = el.querySelector('#orderList');
    const filtered = statusFilter ? allOrders.filter(o => o.status === statusFilter) : allOrders;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon"><i data-lucide="package" style="width:48px;height:48px;opacity:0.3;"></i></div>
          <p style="font-weight:600;margin-bottom:8px;">${statusFilter ? `No ${statusFilter} orders` : 'No orders yet'}</p>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">
            ${statusFilter ? 'Try a different filter.' : "You haven't placed any orders yet."}
          </p>
          ${!statusFilter ? `<a href="#/marketplace" class="btn btn-primary">Browse Marketplace</a>` : ''}
        </div>`;
      if (window.lucide) window.lucide.createIcons();
      requestAnimationFrame(() => observeElements());
      return;
    }

    list.innerHTML = filtered.map(o => {
      const cfg = statusCfg[o.status] || statusCfg.pending;
      return `
      <div class="card scroll-reveal" style="margin-bottom:10px;padding:16px 20px;cursor:pointer;transition:border-color 0.2s,transform 0.15s;" data-id="${o.id}"
        onmouseenter="this.style.borderColor='var(--accent)';this.style.transform='translateY(-1px)'"
        onmouseleave="this.style.borderColor='';this.style.transform=''">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">

          <!-- Status icon -->
          <div style="width:42px;height:42px;border-radius:12px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="${cfg.icon}" style="width:20px;height:20px;color:${cfg.color};"></i>
          </div>

          <!-- Main info -->
          <div style="flex:1;min-width:140px;">
            <div style="font-weight:700;font-size:0.97rem;margin-bottom:2px;">${esc(o.product_title)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
              Qty ${o.quantity} · ${new Date(o.created_at).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}
            </div>
          </div>

          <!-- Price -->
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-weight:800;font-size:1.05rem;color:var(--accent);">₱${formatPrice(o.total_price)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">≈ ${phpToEthDisplay(o.total_price)}</div>
          </div>

          <!-- Status badge -->
          <div style="flex-shrink:0;display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:${cfg.bg};border:1px solid ${cfg.color}40;">
            <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${cfg.color};">${o.status}</span>
          </div>

          <!-- Arrow -->
          <div style="flex-shrink:0;opacity:0.35;">
            <i data-lucide="chevron-right" style="width:18px;height:18px;"></i>
          </div>
        </div>
      </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    list.querySelectorAll('[data-id]').forEach(row => {
      row.addEventListener('click', () => navigate(`/orders/${row.dataset.id}`));
    });

    requestAnimationFrame(() => observeElements());
  }

  try {
    const list = el.querySelector('#orderList');
    list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    allOrders = await api.get('/api/orders/');

    let currentFilter = '';
    el.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.status;
        renderOrders(currentFilter);
      });
    });

    renderOrders('');
  } catch (e) {
    el.querySelector('#orderList').innerHTML = `<div class="card" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

// ─── Order Detail Page ─────────────────────────────────────
export async function orderDetailPage(el, params) {
  if (!auth.isConnected()) { navigate('/'); return toast.error('Connect wallet first'); }

  const order = await api.get(`/api/orders/${params.id}/`);
  const isBuyer = auth.user?.wallet_address === order.buyer_wallet;
  const isSeller = auth.user?.wallet_address === order.seller_wallet;

  el.innerHTML = `
    <div class="container" style="max-width:800px;">
      <a href="#/orders" class="scroll-reveal" style="color:var(--text-muted);font-size:0.9rem;">← Back to Orders</a>
      <div class="page-header scroll-reveal">
        <h1>Order #${order.id}</h1>
        <span class="badge badge-${order.status}" style="font-size:0.9rem;padding:6px 16px;">${order.status}</span>
      </div>

      <div class="card scroll-reveal mb-2">
        <h3>Details</h3>
        <div class="mt-2" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div><span class="text-muted">Product:</span> ${esc(order.product_title)}</div>
          <div><span class="text-muted">Quantity:</span> ${order.quantity}</div>
          <div><span class="text-muted">Total:</span> <strong class="product-price">₱${formatPrice(order.total_price)}</strong> <span class="text-muted" style="font-size:0.8rem;">(≈ ${phpToEthDisplay(order.total_price)})</span></div>
          <div><span class="text-muted">Created:</span> ${new Date(order.created_at).toLocaleString()}</div>
          <div><span class="text-muted">Buyer:</span> <span style="font-family:var(--font-mono);font-size:0.85rem;">${order.buyer_wallet.slice(0, 10)}...${order.buyer_wallet.slice(-4)}</span></div>
          <div><span class="text-muted">Seller:</span> <span style="font-family:var(--font-mono);font-size:0.85rem;">${order.seller_wallet.slice(0, 10)}...${order.seller_wallet.slice(-4)}</span></div>
          ${order.escrow_id !== null ? `<div><span class="text-muted">Escrow ID:</span> <span style="font-family:var(--font-mono);">${order.escrow_id}</span></div>` : ''}
          ${order.tx_hash ? `<div><span class="text-muted">TX:</span> <span style="font-family:var(--font-mono);font-size:0.8rem;">${order.tx_hash.slice(0, 16)}...</span></div>` : ''}
        </div>
      </div>

      <div id="actions" class="scroll-reveal mt-3"></div>
      <div id="disputeSection" class="mt-3"></div>
    </div>
  `;

  const actionsDiv = el.querySelector('#actions');
  const actions = [];

  if (isBuyer && order.status === 'pending')
    actions.push(`<button class="btn btn-primary" data-action="pay"><i data-lucide="credit-card" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Pay with MetaMask (${phpToEthDisplay(order.total_price)})</button>`);
  if (isSeller && order.status === 'paid')
    actions.push('<button class="btn btn-primary" data-action="ship"><i data-lucide="package" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Mark as Shipped</button>');
  if (isBuyer && order.status === 'shipped')
    actions.push('<button class="btn btn-success" data-action="deliver"><i data-lucide="check-circle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Confirm Delivery</button>');
  if (isBuyer && order.status === 'delivered') {
    actions.push('<button class="btn btn-success" data-action="complete"><i data-lucide="party-popper" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Complete & Release Funds</button>');
    actions.push('<button class="btn btn-danger" data-action="open-dispute"><i data-lucide="alert-triangle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Open Dispute</button>');
  }
  if ((isBuyer || isSeller) && ['paid', 'shipped'].includes(order.status))
    actions.push('<button class="btn btn-danger btn-sm" data-action="open-dispute"><i data-lucide="alert-triangle" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"></i>Dispute</button>');

  actionsDiv.innerHTML = actions.length
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">${actions.join('')}</div>`
    : '';

  actionsDiv.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'open-dispute') {
      showDisputeForm(el.querySelector('#disputeSection'), order.id);
      return;
    }

    btn.disabled = true;
    const origText = btn.textContent;

    try {
      if (action === 'pay') {
        // Blockchain: create escrow via MetaMask
        btn.textContent = 'Waiting for MetaMask...';
        const { txHash, escrowId } = await createEscrow(order.id, order.total_price);
        showSuccessModal({
          title: 'Payment Sent!',
          subtitle: 'Your funds have been locked in the smart contract escrow. The seller will now ship your order.',
          details: [
            { label: 'Order', value: `#${order.id}` },
            { label: 'Amount', value: `₱${formatPrice(order.total_price)} (${phpToEthDisplay(order.total_price)})` },
            { label: 'Escrow ID', value: `${escrowId}` },
            { label: 'TX Hash', value: `${txHash.slice(0, 18)}...` },
          ],
          buttonText: 'View Order',
          onClose: () => navigate(`/orders/${order.id}`),
        });
        return; // Don't navigate yet — let user close modal
      } else if (action === 'complete') {
        // Blockchain: confirm delivery via MetaMask (releases funds)
        btn.textContent = 'Confirming on-chain...';
        const { txHash } = await confirmDelivery(order.id);
        showSuccessModal({
          title: 'Funds Released!',
          subtitle: 'Transaction complete! The escrow funds have been released to the seller. Thank you for using White Market.',
          details: [
            { label: 'Order', value: `#${order.id}` },
            { label: 'Product', value: order.product_title },
            { label: 'Amount', value: `₱${formatPrice(order.total_price)} (${phpToEthDisplay(order.total_price)})` },
            { label: 'TX Hash', value: `${txHash.slice(0, 18)}...` },
            { label: 'Status', value: 'COMPLETED ✓' },
          ],
          buttonText: 'Done',
          onClose: () => navigate(`/orders/${order.id}`),
        });
        return; // Don't navigate yet — let user close modal
      } else {
        // Non-blockchain actions (ship, deliver)
        const statusMap = { ship: 'shipped', deliver: 'delivered' };
        await api.patch(`/api/orders/${order.id}/status/`, { status: statusMap[action] });
        toast.success(`Order ${statusMap[action]}!`);
      }
      navigate(`/orders/${order.id}`);
    } catch (e) {
      const msg = e.data?.detail || e.message || 'Transaction cancelled';
      toast.error(msg);
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  if (order.status === 'disputed' || order.status === 'completed') {
    try {
      const dispute = await api.get(`/api/orders/${order.id}/dispute/`);
      const isResolved = dispute.resolution !== 'pending';
      const resColor   = { pending: 'var(--warning)', pay_buyer: 'var(--success)', pay_seller: 'var(--success)', cancelled: 'var(--danger)' }[dispute.resolution] || 'var(--text-muted)';

      el.querySelector('#disputeSection').innerHTML = `
        <div class="card scroll-reveal" style="border-color:var(--danger);margin-top:8px;">

          <!-- Header -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:40px;height:40px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i data-lucide="alert-triangle" style="width:20px;height:20px;color:var(--danger);"></i>
            </div>
            <div>
              <h3 style="margin:0;color:var(--danger);">Active Dispute</h3>
              <p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-muted);">An admin will review and resolve this dispute.</p>
            </div>
            <span class="badge" style="margin-left:auto;background:${resColor}20;color:${resColor};border:1px solid ${resColor}40;padding:4px 12px;font-size:0.75rem;">${dispute.resolution.replace(/_/g,' ').toUpperCase()}</span>
          </div>

          <!-- Details grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;padding:14px;background:var(--bg-secondary, rgba(255,255,255,0.03));border-radius:8px;margin-bottom:16px;">
            <div>
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Reason</div>
              <div style="font-weight:600;">${dispute.reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
            </div>
            <div>
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Opened</div>
              <div>${new Date(dispute.created_at || Date.now()).toLocaleDateString()}</div>
            </div>
            <div style="grid-column:1/-1;">
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Description</div>
              <div style="line-height:1.6;">${esc(dispute.description)}</div>
            </div>
            ${dispute.admin_notes ? `
            <div style="grid-column:1/-1;padding:10px 14px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.3);border-radius:8px;">
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--warning);margin-bottom:4px;font-weight:600;">Admin Notes</div>
              <div style="font-size:0.9rem;">${esc(dispute.admin_notes)}</div>
            </div>` : ''}
          </div>

          <!-- Evidence — separated by party -->
          ${(() => {
            const allEv = dispute.evidence || [];
            const buyerEv  = allEv.filter(e => e.uploader_wallet === order.buyer_wallet);
            const sellerEv = allEv.filter(e => e.uploader_wallet === order.seller_wallet);

            function renderParty(label, color, icon, items) {
              return `
                <div style="margin-bottom:14px;">
                  <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
                    <div style="width:22px;height:22px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;">
                      <i data-lucide="${icon}" style="width:12px;height:12px;color:${color};"></i>
                    </div>
                    <span style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${color};">${label}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted);">(${items.length})</span>
                  </div>
                  ${items.length === 0
                    ? `<p style="font-size:0.82rem;color:var(--text-muted);margin-left:29px;">No evidence submitted.</p>`
                    : `<div style="display:flex;flex-direction:column;gap:7px;margin-left:29px;">
                        ${items.map(ev => `
                          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-secondary,rgba(255,255,255,0.03));border-radius:8px;border:1px solid var(--border-color);">
                            ${ev.file
                              ? `<div style="width:42px;height:42px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--border-color);">
                                   <img src="${mediaUrl(ev.file)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<i data-lucide=\\'file\\' style=\\'width:20px;height:20px;\\'></i>'">
                                 </div>
                                 <div style="flex:1;min-width:0;">
                                   <div style="font-size:0.84rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ev.description || ev.file.split('/').pop())}</div>
                                   <div style="font-size:0.7rem;color:var(--text-muted);">Image / File</div>
                                 </div>
                                 <a href="${mediaUrl(ev.file)}" target="_blank" class="btn btn-secondary btn-sm" style="flex-shrink:0;">
                                   <i data-lucide="external-link" style="width:13px;height:13px;"></i>
                                 </a>`
                              : `<div style="width:42px;height:42px;border-radius:6px;flex-shrink:0;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;">
                                   <i data-lucide="message-square" style="width:18px;height:18px;color:var(--accent-primary);"></i>
                                 </div>
                                 <div style="flex:1;">
                                   <div style="font-size:0.84rem;line-height:1.5;">${esc(ev.description || 'Text note')}</div>
                                   <div style="font-size:0.7rem;color:var(--text-muted);">Text note</div>
                                 </div>`
                            }
                          </div>
                        `).join('')}
                      </div>`
                  }
                </div>`;
            }

            return `
              <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:10px;padding:14px;">
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:14px;">
                  Evidence (${allEv.length} total)
                </div>
                ${renderParty('Buyer', '#60a5fa', 'user', buyerEv)}
                <div style="height:1px;background:var(--border-color);margin:10px 0;"></div>
                ${renderParty('Seller', '#a78bfa', 'store', sellerEv)}
              </div>`;
          })()}

          <!-- Submit more evidence (only while pending) -->
          ${!isResolved ? `
          <div style="border-top:1px solid var(--border-color);padding-top:16px;">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.06em;">
              <i data-lucide="upload" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>
              Submit ${isSeller ? 'Counter ' : 'Additional '}Evidence
            </div>
            <div class="form-group">
              <textarea id="ceDesc" class="form-textarea" placeholder="Describe what you're submitting…" style="min-height:70px;"></textarea>
            </div>
            <div id="ceDropzone" style="border:2px dashed var(--border-color);border-radius:8px;padding:16px;text-align:center;cursor:pointer;margin-bottom:12px;font-size:0.85rem;color:var(--text-muted);">
              <i data-lucide="paperclip" style="width:18px;height:18px;margin-bottom:4px;"></i>
              <div>Click or drag files here (images, PDF)</div>
              <input type="file" id="ceFiles" multiple accept="image/*,.pdf" style="display:none;">
            </div>
            <div id="cePreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;"></div>
            <button id="ceSubmit" class="btn btn-primary btn-sm">
              <i data-lucide="send" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>Submit Evidence
            </button>
          </div>` : `
          <div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border-radius:8px;border:1px solid rgba(16,185,129,0.3);">
            <i data-lucide="check-circle" style="width:20px;height:20px;color:var(--success);vertical-align:middle;margin-right:6px;"></i>
            <span style="font-size:0.9rem;color:var(--success);font-weight:600;">This dispute has been resolved.</span>
          </div>`}
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();

      const ceDropzone = el.querySelector('#ceDropzone');
      const ceInput    = el.querySelector('#ceFiles');
      if (ceDropzone && ceInput) {
        ceDropzone.addEventListener('click', () => ceInput.click());
        ceDropzone.addEventListener('dragover', e => { e.preventDefault(); ceDropzone.style.borderColor = 'var(--accent-primary)'; });
        ceDropzone.addEventListener('dragleave', () => { ceDropzone.style.borderColor = ''; });
        ceDropzone.addEventListener('drop', e => { e.preventDefault(); ceDropzone.style.borderColor = ''; renderCePreview([...e.dataTransfer.files]); });
        ceInput.addEventListener('change', () => renderCePreview([...ceInput.files]));

        function renderCePreview(files) {
          const preview = el.querySelector('#cePreview');
          preview.innerHTML = '';
          files.forEach(f => {
            if (f.type.startsWith('image/')) {
              const img = document.createElement('img');
              img.src = URL.createObjectURL(f);
              img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);';
              preview.appendChild(img);
            } else {
              const tag = document.createElement('div');
              tag.style.cssText = 'font-size:0.75rem;padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
              tag.textContent = `📎 ${f.name}`;
              preview.appendChild(tag);
            }
          });
        }

        el.querySelector('#ceSubmit').addEventListener('click', async () => {
          const files = ceInput.files;
          const desc  = el.querySelector('#ceDesc').value.trim();
          if (!files.length && !desc) return toast.error('Add a description or attach files');
          const btn = el.querySelector('#ceSubmit');
          btn.disabled = true;
          btn.innerHTML = '<i data-lucide="loader-2" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;animation:spin 1s linear infinite;"></i>Submitting…';
          if (window.lucide) window.lucide.createIcons();
          try {
            // Text note and files are always stored as separate evidence items
            if (desc) {
              await api.post(`/api/disputes/${dispute.id}/evidence/`, { description: desc });
            }
            for (const file of files) {
              const form = new FormData();
              form.append('file', file);
              form.append('description', file.name);
              await api.upload(`/api/disputes/${dispute.id}/evidence/`, form);
            }
            toast.success('Evidence submitted!');
            navigate(`/orders/${order.id}`);
          } catch (e) {
            toast.error(e.data?.detail || e.message);
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="send" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>Submit Evidence';
            if (window.lucide) window.lucide.createIcons();
          }
        });
      }

      requestAnimationFrame(() => observeElements());
    } catch { /* no dispute */ }
  }

  requestAnimationFrame(() => observeElements());
}

function showDisputeForm(container, orderId) {
  const reasons = [
    { value: 'not_received',    label: 'Item Not Received',       icon: 'package-x',      desc: 'The item was never delivered' },
    { value: 'not_as_described',label: 'Not As Described',        icon: 'file-warning',   desc: 'Item is different from the listing' },
    { value: 'damaged',         label: 'Item Arrived Damaged',    icon: 'shield-alert',   desc: 'The item arrived broken or defective' },
    { value: 'unauthorized',    label: 'Unauthorized Transaction', icon: 'lock',           desc: 'I did not authorize this purchase' },
    { value: 'other',           label: 'Other',                   icon: 'help-circle',    desc: 'Another issue not listed above' },
  ];

  container.innerHTML = `
    <div class="card scroll-reveal" style="border-color:var(--danger);margin-top:8px;">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:40px;height:40px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i data-lucide="alert-triangle" style="width:20px;height:20px;color:var(--danger);"></i>
        </div>
        <div>
          <h3 style="margin:0;">Open a Dispute</h3>
          <p style="margin:2px 0 0;font-size:0.8rem;color:var(--text-muted);">An admin will review your case and reach a resolution.</p>
        </div>
      </div>

      <!-- Reason selector -->
      <div class="form-group">
        <label style="margin-bottom:10px;display:block;">What's the issue?</label>
        <div style="display:flex;flex-direction:column;gap:8px;" id="reasonCards">
          ${reasons.map(r => `
            <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border-color);border-radius:10px;cursor:pointer;transition:border-color 0.15s,background 0.15s;" class="reason-card">
              <input type="radio" name="dReason" value="${r.value}" style="display:none;">
              <div style="width:34px;height:34px;border-radius:8px;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${r.icon}" style="width:17px;height:17px;color:var(--danger);"></i>
              </div>
              <div>
                <div style="font-weight:600;font-size:0.9rem;">${r.label}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${r.desc}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Description -->
      <div class="form-group">
        <label>Describe the issue <span style="color:var(--danger);">*</span></label>
        <textarea id="dDesc" class="form-textarea" placeholder="Please provide as much detail as possible — order timeline, what went wrong, what you expected…" style="min-height:100px;"></textarea>
      </div>

      <!-- Evidence upload -->
      <div class="form-group">
        <label>Evidence <span style="font-weight:400;color:var(--text-muted);">(optional but recommended)</span></label>
        <div id="dDropzone" style="border:2px dashed var(--border-color);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:border-color 0.2s;color:var(--text-muted);font-size:0.85rem;">
          <i data-lucide="upload-cloud" style="width:28px;height:28px;margin-bottom:6px;opacity:0.5;"></i>
          <div>Click or drag & drop screenshots, photos, or PDFs</div>
          <input type="file" id="dEvidence" multiple accept="image/*,.pdf" style="display:none;">
        </div>
        <div id="dPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"></div>
      </div>

      <!-- Warning + submit -->
      <div style="padding:10px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">
        <i data-lucide="info" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"></i>
        Once submitted, the order will be locked pending admin review. Provide as much evidence as possible.
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="dSubmit" class="btn btn-danger" style="flex:1;">
          <i data-lucide="send" style="width:15px;height:15px;vertical-align:middle;margin-right:6px;"></i>Submit Dispute
        </button>
        <button id="dCancel" class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Highlight selected reason card
  container.querySelectorAll('.reason-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.reason-card').forEach(c => {
        c.style.borderColor = 'var(--border-color)';
        c.style.background  = '';
      });
      card.style.borderColor = 'var(--danger)';
      card.style.background  = 'rgba(239,68,68,0.06)';
      card.querySelector('input[type=radio]').checked = true;
    });
  });
  // Pre-select first
  container.querySelector('.reason-card').click();

  // Dropzone
  const dropzone  = container.querySelector('#dDropzone');
  const fileInput = container.querySelector('#dEvidence');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--danger)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = ''; });
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.style.borderColor = ''; renderPreview([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', () => renderPreview([...fileInput.files]));

  function renderPreview(files) {
    const preview = container.querySelector('#dPreview');
    preview.innerHTML = '';
    files.forEach(f => {
      if (f.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color);';
        preview.appendChild(img);
      } else {
        const tag = document.createElement('div');
        tag.style.cssText = 'font-size:0.75rem;padding:6px 10px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        tag.textContent = `📎 ${f.name}`;
        preview.appendChild(tag);
      }
    });
  }

  // Cancel
  container.querySelector('#dCancel').addEventListener('click', () => {
    container.innerHTML = '';
  });

  // Submit
  container.querySelector('#dSubmit').addEventListener('click', async () => {
    const btn  = container.querySelector('#dSubmit');
    const desc = container.querySelector('#dDesc').value.trim();
    const reason = container.querySelector('input[name=dReason]:checked')?.value;
    if (!desc) return toast.error('Please describe the issue');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" style="width:15px;height:15px;vertical-align:middle;margin-right:6px;animation:spin 1s linear infinite;"></i>Submitting…';
    if (window.lucide) window.lucide.createIcons();
    try {
      const dispute = await api.post(`/api/orders/${orderId}/dispute/`, { reason, description: desc });
      const files = fileInput.files;
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('description', file.name);
        try { await api.upload(`/api/disputes/${dispute.id}/evidence/`, form); } catch {}
      }
      toast.success('Dispute submitted — an admin will review shortly.');
      navigate(`/orders/${orderId}`);
    } catch (e) {
      toast.error(e.data?.detail || e.message);
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" style="width:15px;height:15px;vertical-align:middle;margin-right:6px;"></i>Submit Dispute';
      if (window.lucide) window.lucide.createIcons();
    }
  });

  observeElements();
}

// ─── Admin Dashboard Page ──────────────────────────────────
export async function adminDashboardPage(el) {
  if (!auth.isConnected() || !auth.user?.is_staff) {
    navigate('/');
    return toast.error('Admin access required');
  }

  el.innerHTML = `
    <div class="container" style="max-width:960px;">
      <div class="page-header scroll-reveal" style="margin-bottom:28px;">
        <div>
          <h1 style="font-size:1.75rem;font-weight:800;">Admin Dashboard</h1>
          <p style="color:var(--text-secondary);font-size:0.92rem;margin-top:4px;">Platform overview and management</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <a href="#/admin/kyc" class="btn btn-primary" style="gap:7px;">
            <i data-lucide="shield-check" style="width:16px;height:16px;"></i>KYC Review
          </a>
          <a href="#/admin/disputes" class="btn btn-danger" style="gap:7px;">
            <i data-lucide="scale" style="width:16px;height:16px;"></i>Disputes
          </a>
        </div>
      </div>

      <div id="dashStats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:32px;">
        <div class="loader"><div class="spinner"></div></div>
      </div>

      <div id="dashAlerts" style="margin-bottom:24px;display:flex;flex-direction:column;gap:10px;"></div>

      <div id="dashExtra"></div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  try {
    const d = await api.get('/api/admin/dashboard/');

    const statItems = [
      { label: 'Total Users',      value: d.users.total,                   icon: 'users',         color: '#60a5fa' },
      { label: 'Verified Sellers', value: d.users.sellers,                 icon: 'store',         color: '#a78bfa' },
      { label: 'Active Listings',  value: d.products.active,               icon: 'package',       color: '#34d399' },
      { label: 'Total Orders',     value: d.orders.total,                  icon: 'shopping-bag',  color: '#f59e0b' },
      { label: 'Revenue (PHP)',    value: `₱${formatPrice(d.orders.total_revenue_eth || 0)}`, icon: 'banknote', color: 'var(--success)', raw: true },
      { label: 'Pending Disputes', value: d.disputes.pending,              icon: 'alert-triangle',color: 'var(--danger)' },
      { label: 'Pending KYC',      value: d.kyc.pending_reviews,           icon: 'clock',         color: 'var(--warning)' },
    ];

    el.querySelector('#dashStats').innerHTML = statItems.map(s => `
      <div class="card scroll-reveal" style="padding:20px;border-color:${s.color}25;position:relative;overflow:hidden;">
        <div style="position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:10px;background:${s.color}15;display:flex;align-items:center;justify-content:center;">
          <i data-lucide="${s.icon}" style="width:16px;height:16px;color:${s.color};"></i>
        </div>
        <div style="font-size:${s.raw ? '1.3rem' : '1.85rem'};font-weight:800;color:${s.color};margin-bottom:4px;line-height:1;">
          ${s.raw ? s.value : `<span data-count="${s.value}">0</span>`}
        </div>
        <div style="font-size:0.78rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;">${s.label}</div>
      </div>`).join('');

    if (window.lucide) window.lucide.createIcons();

    // Alert banners for items needing attention
    const alerts = [];
    if (d.disputes.pending > 0) alerts.push({
      icon: 'scale', color: 'var(--danger)', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)',
      text: `<strong>${d.disputes.pending} dispute${d.disputes.pending > 1 ? 's' : ''}</strong> awaiting resolution`,
      link: '#/admin/disputes', linkText: 'View Disputes',
    });
    if (d.kyc.pending_reviews > 0) alerts.push({
      icon: 'user-check', color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)',
      text: `<strong>${d.kyc.pending_reviews} KYC submission${d.kyc.pending_reviews > 1 ? 's' : ''}</strong> pending review`,
      link: '#/admin/kyc', linkText: 'Review Now',
    });

    el.querySelector('#dashAlerts').innerHTML = alerts.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${a.bg};border:1px solid ${a.border};border-radius:10px;flex-wrap:wrap;">
        <i data-lucide="${a.icon}" style="width:18px;height:18px;color:${a.color};flex-shrink:0;"></i>
        <span style="flex:1;font-size:0.9rem;color:var(--text-primary);">${a.text}</span>
        <a href="${a.link}" style="font-size:0.82rem;font-weight:700;color:${a.color};text-decoration:none;white-space:nowrap;">${a.linkText} →</a>
      </div>`).join('');

    if (window.lucide) window.lucide.createIcons();

    // Orders by status breakdown
    const statuses = d.orders.by_status || {};
    const entries  = Object.entries(statuses).filter(([,c]) => c > 0);
    if (entries.length > 0) {
      const statusColors = { pending:'#94a3b8', paid:'#60a5fa', shipped:'#a78bfa', delivered:'#34d399', completed:'var(--success)', disputed:'var(--danger)', cancelled:'#475569' };
      el.querySelector('#dashExtra').innerHTML = `
        <div class="card scroll-reveal" style="padding:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">
            <i data-lucide="bar-chart-3" style="width:18px;height:18px;color:var(--accent);"></i>
            <span style="font-weight:700;font-size:0.95rem;">Orders by Status</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${entries.map(([s, c]) => {
              const clr = statusColors[s] || 'var(--text-muted)';
              const pct = Math.round((c / d.orders.total) * 100);
              return `
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                  <div style="display:flex;align-items:center;gap:7px;">
                    <div style="width:8px;height:8px;border-radius:50%;background:${clr};"></div>
                    <span style="font-size:0.85rem;font-weight:600;text-transform:capitalize;">${s}</span>
                  </div>
                  <span style="font-size:0.82rem;color:var(--text-muted);">${c} &nbsp;(${pct}%)</span>
                </div>
                <div style="height:6px;background:var(--bg-secondary);border-radius:3px;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${clr};border-radius:3px;transition:width 0.8s var(--ease);"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      if (window.lucide) window.lucide.createIcons();
    }

    requestAnimationFrame(() => { observeElements(); initCountUp(); });
  } catch (e) {
    el.querySelector('#dashStats').innerHTML = `<div class="card" style="color:var(--danger);">Error: ${e.message}</div>`;
  }
}

// ─── Seller Dashboard Page ─────────────────────────────────
export async function sellerDashboardPage(el) {
  if (!auth.isConnected()) { navigate('/'); return toast.error('Connect wallet first'); }

  const user = auth.user;

  // KYC status banner
  const kycColor   = { approved: 'var(--success)', pending: 'var(--warning)', rejected: 'var(--danger)' }[user.kyc_status] || 'var(--accent-primary)';
  const kycIcon    = { approved: 'badge-check', pending: 'clock', rejected: 'x-circle' }[user.kyc_status] || 'clipboard-list';
  const kycMessage = user.kyc_status === 'approved'
    ? 'Verified Seller — You can create listings!'
    : user.kyc_status === 'pending'
      ? 'KYC Under Review — Your documents are being reviewed.'
      : user.kyc_status === 'rejected'
        ? 'KYC Rejected — <a href="#/kyc" style="font-weight:700;color:inherit;">Resubmit your documents →</a>'
        : 'You need to <a href="#/kyc" style="font-weight:700;color:inherit;">submit KYC documents</a> to start selling.';

  el.innerHTML = `
    <div class="container">
      <!-- Header -->
      <div class="page-header scroll-reveal" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <h1>Seller Dashboard</h1>
        ${user.kyc_status === 'approved' ? `<a href="#/sell" class="btn btn-primary"><i data-lucide="plus" style="width:15px;height:15px;vertical-align:middle;margin-right:6px;"></i>New Listing</a>` : ''}
      </div>

      <!-- KYC Banner -->
      <div class="card scroll-reveal" style="border-color:${kycColor};margin-bottom:24px;padding:12px 16px;">
        <p style="color:${kycColor};font-weight:600;margin:0;display:flex;align-items:center;gap:8px;">
          <i data-lucide="${kycIcon}" style="width:16px;height:16px;flex-shrink:0;"></i>
          <span>${kycMessage}</span>
        </p>
      </div>

      <!-- Stats Row -->
      <div id="statsRow" class="stats-grid scroll-reveal" style="margin-bottom:28px;">
        <div class="stat-card"><div class="stat-value" id="st-listings">—</div><div class="stat-label">Total Listings</div></div>
        <div class="stat-card"><div class="stat-value" id="st-active">—</div><div class="stat-label">Active</div></div>
        <div class="stat-card"><div class="stat-value" id="st-orders">—</div><div class="stat-label">Incoming Orders</div></div>
        <div class="stat-card"><div class="stat-value" id="st-revenue">—</div><div class="stat-label">Total Revenue</div></div>
      </div>

      <!-- Tabs -->
      <div class="scroll-reveal" style="display:flex;gap:12px;margin-bottom:20px;border-bottom:1px solid var(--border-color);padding-bottom:12px;">
        <button class="filter-chip active" data-tab="listings">
          <i data-lucide="package" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>My Listings
        </button>
        <button class="filter-chip" data-tab="orders">
          <i data-lucide="shopping-bag" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>Incoming Orders
        </button>
      </div>

      <div id="tabContent"></div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  // ── Fetch stats in background ──────────────────────────────
  Promise.all([
    api.get('/api/seller/products/'),
    api.get('/api/orders/'),
  ]).then(([products, orders]) => {
    const incoming = orders.filter(o => o.seller_wallet === user.wallet_address);
    const revenue  = incoming
      .filter(o => ['completed', 'delivered', 'shipped', 'paid'].includes(o.status))
      .reduce((s, o) => s + parseFloat(o.total_price), 0);

    el.querySelector('#st-listings').textContent = products.length;
    el.querySelector('#st-active').textContent   = products.filter(p => p.status === 'active').length;
    el.querySelector('#st-orders').textContent   = incoming.length;
    el.querySelector('#st-revenue').textContent  = `₱${formatPrice(revenue)}`;
  }).catch(() => {});

  // ── Listings tab ───────────────────────────────────────────
  async function loadListings() {
    const container = el.querySelector('#tabContent');
    container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const products = await api.get('/api/seller/products/');
      if (products.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="icon"><i data-lucide="package-open" style="width:48px;height:48px;opacity:0.4;"></i></div>
            <p style="font-size:1rem;font-weight:600;">No listings yet</p>
            ${user.kyc_status === 'approved' ? '<a href="#/sell" class="btn btn-primary mt-2">Create Your First Listing →</a>' : ''}
          </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      // Group by status for quick filter
      const statuses = ['all', ...new Set(products.map(p => p.status))];
      container.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          ${statuses.map(s => `<button class="filter-chip${s === 'all' ? ' active' : ''}" data-filter="${s}">${s === 'all' ? 'All' : s}</button>`).join('')}
        </div>
        <div id="listingGrid" class="product-grid stagger-children"></div>
      `;

      function renderListings(filter) {
        const grid = container.querySelector('#listingGrid');
        const shown = filter === 'all' ? products : products.filter(p => p.status === filter);
        grid.innerHTML = shown.map(p => {
          const coverImg = mediaUrl(p.images?.[0]?.image || p.image);
          return `
          <div class="product-card scroll-reveal" data-id="${p.id}" style="cursor:pointer;position:relative;">
            <div class="product-card-img">
              ${coverImg ? `<img src="${coverImg}" alt="${esc(p.title)}">` : categoryIcon(p.category)}
            </div>
            <div class="product-card-body">
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <span class="badge badge-${p.category}">${p.category.replace('_', ' ')}</span>
                <span class="badge badge-${p.status}">${p.status}</span>
              </div>
              <h3 style="margin:8px 0 4px;">${esc(p.title)}</h3>
              <div class="product-card-meta">
                <span class="product-price">₱${formatPrice(p.price)}</span>
                <span class="text-muted">${p.quantity} left</span>
              </div>
              ${p.location ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px;"><i data-lucide="map-pin" style="width:11px;height:11px;"></i>${esc(p.location)}</div>` : ''}
            </div>
            <div style="padding:0 14px 14px;display:flex;gap:8px;">
              <a href="#/products/${p.id}" class="btn btn-secondary btn-sm" style="flex:1;justify-content:center;" onclick="event.stopPropagation();">
                <i data-lucide="eye" style="width:13px;height:13px;margin-right:4px;"></i>View
              </a>
              <button class="btn btn-secondary btn-sm edit-listing-btn" data-id="${p.id}" style="flex:1;justify-content:center;" onclick="event.stopPropagation();">
                <i data-lucide="pencil" style="width:13px;height:13px;margin-right:4px;"></i>Edit
              </button>
            </div>
          </div>`;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
        requestAnimationFrame(() => observeElements());
      }

      renderListings('all');

      // Status filter chips
      container.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          renderListings(chip.dataset.filter);
        });
      });

      // Navigate on card click; Edit button navigates to product page (inline editing)
      container.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-listing-btn');
        if (editBtn) { navigate(`/products/${editBtn.dataset.id}`); return; }
        const card = e.target.closest('.product-card');
        if (card) navigate(`/products/${card.dataset.id}`);
      });

    } catch (e) {
      container.innerHTML = `<p class="text-muted">Error loading listings: ${e.message}</p>`;
    }
  }

  // ── Incoming orders tab ────────────────────────────────────
  async function loadIncomingOrders() {
    const container = el.querySelector('#tabContent');
    container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const orders   = await api.get('/api/orders/');
      const incoming = orders.filter(o => o.seller_wallet === user.wallet_address);
      if (incoming.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="icon"><i data-lucide="shopping-bag" style="width:48px;height:48px;opacity:0.4;"></i></div>
            <p>No incoming orders yet</p>
          </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const statusColor = { pending:'var(--warning)', paid:'var(--accent-primary)', shipped:'var(--info,#60a5fa)', delivered:'var(--success)', completed:'var(--success)', cancelled:'var(--danger)', disputed:'var(--danger)' };

      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${incoming.map(o => `
            <div class="card order-row scroll-reveal" data-id="${o.id}"
                 style="display:grid;grid-template-columns:auto 1fr auto auto;gap:12px 16px;align-items:center;cursor:pointer;padding:16px;">
              <div style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-muted);">#${o.id}</div>
              <div>
                <div style="font-weight:600;margin-bottom:2px;">${esc(o.product_title)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">
                  Qty: ${o.quantity} &nbsp;·&nbsp; ${new Date(o.created_at).toLocaleDateString()}
                  ${o.shipping_address ? `&nbsp;·&nbsp; <i data-lucide="map-pin" style="width:11px;height:11px;vertical-align:middle;"></i> ${esc(o.shipping_address.split('\n')[0])}` : ''}
                </div>
              </div>
              <div style="font-weight:700;font-size:1rem;">₱${formatPrice(o.total_price)}</div>
              <span class="badge badge-${o.status}" style="color:${statusColor[o.status] || 'inherit'};">${o.status}</span>
            </div>
          `).join('')}
        </div>`;
      container.querySelectorAll('.order-row').forEach(row => {
        row.addEventListener('click', () => navigate(`/orders/${row.dataset.id}`));
      });
      if (window.lucide) window.lucide.createIcons();
      requestAnimationFrame(() => observeElements());
    } catch (e) {
      container.innerHTML = `<p class="text-muted">Error loading orders: ${e.message}</p>`;
    }
  }

  // Tab switching
  el.querySelectorAll('.filter-chip[data-tab]').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip[data-tab]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (chip.dataset.tab === 'listings') loadListings();
      else loadIncomingOrders();
    });
  });

  requestAnimationFrame(() => observeElements());
  await loadListings();
}

// ─── KYC Upload Page (3-Step Wizard) ───────────────────────
export async function kycUploadPage(el) {
  if (!auth.isConnected()) { navigate('/'); return toast.error('Connect wallet first'); }

  const user = auth.user;

  // ── Status screens ──────────────────────────────────────────────────────────
  function statusScreen({ icon, iconColor, iconBg, title, titleColor, body, actions }) {
    el.innerHTML = `
      <div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:24px;">
        <div style="width:100%;max-width:480px;">
        <div class="card scroll-reveal" style="text-align:center;padding:52px 40px;border-color:${iconColor}30;">
          <div style="width:80px;height:80px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
            <i data-lucide="${icon}" style="width:36px;height:36px;color:${iconColor};"></i>
          </div>
          <h2 style="font-size:1.5rem;font-weight:700;color:${titleColor};margin-bottom:10px;">${title}</h2>
          <div style="color:var(--text-secondary);font-size:0.95rem;line-height:1.6;">${body}</div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:28px;">${actions}</div>
        </div>
        </div>
      </div>`;
    requestAnimationFrame(() => { observeElements(); if (window.lucide) window.lucide.createIcons(); });
  }

  if (user.kyc_status === 'approved') {
    statusScreen({
      icon: 'shield-check', iconColor: 'var(--success)', iconBg: 'rgba(16,185,129,0.12)',
      title: 'Identity Verified', titleColor: 'var(--success)',
      body: 'Your identity has been successfully verified. You are now a trusted seller on White Market.',
      actions: `<a href="#/sell" class="btn btn-primary">Create a Listing</a>
                <a href="#/dashboard" class="btn btn-secondary">Go to Dashboard</a>`,
    });
    return;
  }

  if (user.kyc_status === 'pending') {
    statusScreen({
      icon: 'clock', iconColor: 'var(--warning)', iconBg: 'rgba(245,158,11,0.12)',
      title: 'Under Review', titleColor: 'var(--warning)',
      body: 'Your documents have been submitted and are currently being reviewed by our team. This usually takes 1–2 business days.',
      actions: `<a href="#/dashboard" class="btn btn-secondary">Back to Dashboard</a>`,
    });
    return;
  }

  if (user.kyc_status === 'rejected') {
    let rejectionNote = '';
    try {
      const docs = await api.get('/api/kyc/');
      const withNotes = docs.find(d => d.status === 'rejected' && d.notes);
      if (withNotes) {
        rejectionNote = `
          <div style="margin-top:16px;padding:14px 16px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;text-align:left;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--danger);margin-bottom:6px;">Rejection Reason</div>
            <p style="margin:0;font-size:0.9rem;line-height:1.5;color:var(--text-primary);">${esc(withNotes.notes)}</p>
          </div>`;
      }
    } catch (e) { /* ignore */ }

    el.innerHTML = `
      <div class="container" style="max-width:520px;padding-top:32px;">
        <div class="card scroll-reveal" style="text-align:center;padding:52px 40px;border-color:rgba(239,68,68,0.25);">
          <div style="width:80px;height:80px;border-radius:50%;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
            <i data-lucide="x-circle" style="width:36px;height:36px;color:var(--danger);"></i>
          </div>
          <h2 style="font-size:1.5rem;font-weight:700;color:var(--danger);margin-bottom:10px;">Submission Rejected</h2>
          <p style="color:var(--text-secondary);font-size:0.95rem;">Your KYC submission was rejected. Please review the reason and resubmit with valid documents.</p>
          ${rejectionNote || `<p style="margin-top:12px;font-size:0.85rem;color:var(--text-muted);">No specific reason was provided. Make sure your documents are clear and legible.</p>`}
          <button id="resubmitBtn" class="btn btn-primary" style="width:100%;margin-top:24px;">Resubmit Verification</button>
        </div>
      </div>`;
    requestAnimationFrame(() => { observeElements(); if (window.lucide) window.lucide.createIcons(); });
    el.querySelector('#resubmitBtn').addEventListener('click', () => {
      auth.user.kyc_status = 'none';
      kycUploadPage(el);
    });
    return;
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────
  let currentStep = 1;
  const wizardData = {
    document_type: 'philsys_id',
    id_file: null,
    full_name: user.full_name || '',
    email_address: user.email_address || '',
    phone_number: user.phone_number || '',
    date_of_birth: user.date_of_birth || '',
    selfie_file: null,
  };

  const stepMeta = [
    { label: 'ID Document',    icon: 'credit-card'  },
    { label: 'Personal Info',  icon: 'user'         },
    { label: 'Face Verify',    icon: 'scan-face'     },
  ];

  function renderWizard() {
    el.innerHTML = `
      <div class="container" style="max-width:600px;padding-top:24px;">

        <!-- Header -->
        <div class="scroll-reveal" style="margin-bottom:28px;">
          <h1 style="font-size:1.75rem;font-weight:800;margin-bottom:6px;">KYC Verification</h1>
          <p style="color:var(--text-secondary);font-size:0.95rem;">Complete all 3 steps to become a verified seller</p>
          ${user.kyc_status === 'rejected' ? `
          <div style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;font-size:0.83rem;color:var(--danger);">
            <i data-lucide="alert-triangle" style="width:14px;height:14px;"></i>Previous submission was rejected — please resubmit
          </div>` : ''}
        </div>

        <!-- Step tracker -->
        <div class="scroll-reveal" style="display:flex;align-items:center;margin-bottom:28px;">
          ${stepMeta.map((s, i) => {
            const n = i + 1;
            const done    = n < currentStep;
            const active  = n === currentStep;
            const dotBg   = done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-secondary)';
            const dotBorder = done || active ? 'transparent' : 'var(--border)';
            const labelColor = active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--text-muted)';
            const lineColor  = done ? 'var(--success)' : 'var(--border)';
            return `
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
                <div style="width:42px;height:42px;border-radius:50%;background:${dotBg};border:2px solid ${dotBorder};display:flex;align-items:center;justify-content:center;transition:all 0.3s;">
                  ${done
                    ? `<i data-lucide="check" style="width:18px;height:18px;color:#fff;"></i>`
                    : `<i data-lucide="${s.icon}" style="width:18px;height:18px;color:${active ? '#fff' : 'var(--text-muted)'};"></i>`
                  }
                </div>
                <span style="font-size:0.72rem;font-weight:600;margin-top:6px;color:${labelColor};white-space:nowrap;">${s.label}</span>
              </div>
              ${n < 3 ? `<div style="flex:1;height:2px;background:${lineColor};margin:0 4px;margin-bottom:20px;border-radius:2px;transition:background 0.3s;"></div>` : ''}
            `;
          }).join('')}
        </div>

        <!-- Card -->
        <div class="card scroll-reveal" id="stepContent" style="padding:28px;"></div>

        <!-- Nav -->
        <div style="display:flex;gap:12px;margin-top:16px;justify-content:space-between;" id="stepNav"></div>
      </div>`;
    renderStep();
  }

  function fileDropZone(inputId, previewFile, accepts = 'image/*') {
    return `
      <div id="dropzone-${inputId}" style="
        border:2px dashed var(--border);border-radius:12px;padding:28px 20px;
        text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s;
        background:var(--bg-secondary);">
        ${previewFile
          ? `<div style="display:flex;align-items:center;justify-content:center;gap:10px;color:var(--success);">
               <i data-lucide="check-circle" style="width:20px;height:20px;"></i>
               <span style="font-size:0.9rem;font-weight:600;">${esc(previewFile.name)}</span>
             </div>
             <p style="margin-top:6px;font-size:0.78rem;color:var(--text-muted);">Click to change file</p>`
          : `<i data-lucide="upload-cloud" style="width:32px;height:32px;color:var(--accent);margin-bottom:8px;"></i>
             <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">Click or drag to upload</div>
             <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">JPG, PNG — max 10MB</div>`
        }
        <input type="file" id="${inputId}" accept="${accepts}" style="display:none;">
      </div>`;
  }

  function renderStep() {
    const content = el.querySelector('#stepContent');
    const nav     = el.querySelector('#stepNav');

    // ── Step 1 ─────────────────────────────────────────────────────────
    if (currentStep === 1) {
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="credit-card" style="width:18px;height:18px;color:var(--accent);"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:1.05rem;">Step 1: ID Document</div>
            <div style="font-size:0.82rem;color:var(--text-muted);">Upload a clear photo of your valid government-issued ID</div>
          </div>
        </div>

        <div class="form-group">
          <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Document Type</label>
          <select id="kycDocType" class="form-select">
            <option value="philsys_id"      ${wizardData.document_type === 'philsys_id'      ? 'selected' : ''}>PhilSys National ID</option>
            <option value="drivers_license" ${wizardData.document_type === 'drivers_license' ? 'selected' : ''}>Driver's License</option>
            <option value="passport"        ${wizardData.document_type === 'passport'        ? 'selected' : ''}>Passport</option>
            <option value="sss_id"          ${wizardData.document_type === 'sss_id'          ? 'selected' : ''}>SSS ID</option>
            <option value="umid"            ${wizardData.document_type === 'umid'            ? 'selected' : ''}>UMID</option>
            <option value="prc_id"          ${wizardData.document_type === 'prc_id'          ? 'selected' : ''}>PRC ID</option>
          </select>
        </div>

        <div class="form-group">
          <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">ID Photo</label>
          ${fileDropZone('kycIdFile', wizardData.id_file)}
        </div>

        <div style="margin-top:16px;padding:12px 14px;background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.2);border-radius:10px;display:flex;gap:10px;align-items:flex-start;">
          <i data-lucide="info" style="width:16px;height:16px;color:var(--info);flex-shrink:0;margin-top:1px;"></i>
          <span style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">Make sure all four corners of the ID are visible and the text is clearly readable. Avoid glare or shadows.</span>
        </div>`;

      setupDropzone('kycIdFile', f => { wizardData.id_file = f; });
      content.querySelector('#kycDocType').addEventListener('change', e => { wizardData.document_type = e.target.value; });

      nav.innerHTML = `
        <div></div>
        <button class="btn btn-primary" id="nextBtn" style="gap:8px;">
          Next — Personal Info <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
        </button>`;
      nav.querySelector('#nextBtn').addEventListener('click', () => {
        if (!wizardData.id_file) return toast.error('Please upload your ID document');
        currentStep = 2; renderWizard();
      });

    // ── Step 2 ─────────────────────────────────────────────────────────
    } else if (currentStep === 2) {
      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="user" style="width:18px;height:18px;color:var(--accent);"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:1.05rem;">Step 2: Personal Information</div>
            <div style="font-size:0.82rem;color:var(--text-muted);">Enter your details exactly as they appear on your ID</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Full Name</label>
            <input type="text" id="kycName" class="form-input" placeholder="Juan Dela Cruz" value="${esc(wizardData.full_name)}">
          </div>
          <div class="form-group">
            <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Email Address</label>
            <input type="email" id="kycEmail" class="form-input" placeholder="you@email.com" value="${esc(wizardData.email_address)}">
          </div>
          <div class="form-group">
            <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Phone Number</label>
            <input type="tel" id="kycPhone" class="form-input" placeholder="09XX XXX XXXX" value="${esc(wizardData.phone_number)}">
          </div>
          <div class="form-group">
            <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Date of Birth</label>
            <input type="date" id="kycDob" class="form-input" value="${wizardData.date_of_birth}">
          </div>
        </div>`;

      nav.innerHTML = `
        <button class="btn btn-secondary" id="backBtn">
          <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Back
        </button>
        <button class="btn btn-primary" id="nextBtn" style="gap:8px;">
          Next — Face Verification <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
        </button>`;
      nav.querySelector('#backBtn').addEventListener('click', () => { saveStep2(); currentStep = 1; renderWizard(); });
      nav.querySelector('#nextBtn').addEventListener('click', () => {
        saveStep2();
        if (!wizardData.full_name.trim())      return toast.error('Please enter your full name');
        if (!wizardData.email_address.trim())  return toast.error('Please enter your email address');
        if (!wizardData.phone_number.trim())   return toast.error('Please enter your phone number');
        if (!wizardData.date_of_birth)         return toast.error('Please enter your date of birth');
        currentStep = 3; renderWizard();
      });

    // ── Step 3 ─────────────────────────────────────────────────────────
    } else if (currentStep === 3) {
      const docLabel = { philsys_id: 'PhilSys National ID', drivers_license: "Driver's License", passport: 'Passport', sss_id: 'SSS ID', umid: 'UMID', prc_id: 'PRC ID' }[wizardData.document_type] || wizardData.document_type;

      content.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="scan-face" style="width:18px;height:18px;color:var(--accent);"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:1.05rem;">Step 3: Face Verification</div>
            <div style="font-size:0.82rem;color:var(--text-muted);">Upload a selfie — face clearly visible and well-lit</div>
          </div>
        </div>

        <div class="form-group">
          <label style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;display:block;">Selfie Photo</label>
          ${fileDropZone('kycSelfie', wizardData.selfie_file)}
        </div>

        <!-- Submission summary -->
        <div style="margin-top:20px;border:1px solid var(--border);border-radius:12px;overflow:hidden;">
          <div style="padding:10px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;">
            <i data-lucide="clipboard-list" style="width:15px;height:15px;color:var(--text-muted);"></i>
            <span style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);">Submission Summary</span>
          </div>
          <div style="padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.85rem;">
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">ID Type</div>
              <div style="font-weight:600;">${esc(docLabel)}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">ID File</div>
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(wizardData.id_file?.name || '—')}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">Full Name</div>
              <div style="font-weight:600;">${esc(wizardData.full_name)}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">Email</div>
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(wizardData.email_address)}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">Phone</div>
              <div style="font-weight:600;">${esc(wizardData.phone_number)}</div>
            </div>
            <div>
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:2px;">Date of Birth</div>
              <div style="font-weight:600;">${wizardData.date_of_birth || '—'}</div>
            </div>
          </div>
        </div>`;

      setupDropzone('kycSelfie', f => { wizardData.selfie_file = f; });

      nav.innerHTML = `
        <button class="btn btn-secondary" id="backBtn">
          <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Back
        </button>
        <button class="btn btn-primary" id="submitBtn" style="gap:8px;min-width:200px;">
          <i data-lucide="send" style="width:16px;height:16px;"></i> Submit for Verification
        </button>`;
      nav.querySelector('#backBtn').addEventListener('click', () => { currentStep = 2; renderWizard(); });
      nav.querySelector('#submitBtn').addEventListener('click', submitKYC);
    }

    requestAnimationFrame(() => { observeElements(); if (window.lucide) window.lucide.createIcons(); });
  }

  // Shared drag-drop zone setup
  function setupDropzone(inputId, onFile) {
    const zone  = el.querySelector(`#dropzone-${inputId}`);
    const input = el.querySelector(`#${inputId}`);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; zone.style.background = 'rgba(99,102,241,0.06)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; zone.style.background = ''; });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor = ''; zone.style.background = '';
      const f = e.dataTransfer.files[0]; if (f) { onFile(f); renderWizard(); }
    });
    input.addEventListener('change', e => { const f = e.target.files[0]; if (f) { onFile(f); renderWizard(); } });
  }

  function saveStep2() {
    const n = el.querySelector('#kycName');
    const em = el.querySelector('#kycEmail');
    const p = el.querySelector('#kycPhone');
    const d = el.querySelector('#kycDob');
    if (n)  wizardData.full_name      = n.value;
    if (em) wizardData.email_address  = em.value;
    if (p)  wizardData.phone_number   = p.value;
    if (d)  wizardData.date_of_birth  = d.value;
  }

  async function submitKYC() {
    if (!wizardData.selfie_file) return toast.error('Please upload your selfie');

    const submitBtn = el.querySelector('#submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i> Uploading…`;
    if (window.lucide) window.lucide.createIcons();

    try {
      const idForm = new FormData();
      idForm.append('document_type', wizardData.document_type);
      idForm.append('file', wizardData.id_file);
      idForm.append('full_name', wizardData.full_name);
      idForm.append('email_address', wizardData.email_address);
      idForm.append('phone_number', wizardData.phone_number);
      idForm.append('date_of_birth', wizardData.date_of_birth);
      await api.upload('/api/kyc/upload/', idForm);

      const selfieForm = new FormData();
      selfieForm.append('document_type', 'selfie');
      selfieForm.append('file', wizardData.selfie_file);
      await api.upload('/api/kyc/upload/', selfieForm);

      toast.success('KYC submitted! Your documents will be reviewed shortly.');
      auth.user.kyc_status = 'pending';

      statusScreen({
        icon: 'clock', iconColor: 'var(--warning)', iconBg: 'rgba(245,158,11,0.12)',
        title: 'Under Review', titleColor: 'var(--warning)',
        body: 'Your documents have been submitted successfully and are being reviewed by our team. This usually takes 1–2 business days.',
        actions: `<a href="#/dashboard" class="btn btn-secondary">Back to Dashboard</a>`,
      });
    } catch (err) {
      toast.error(err.data?.detail || err.message || 'Upload failed');
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i data-lucide="send" style="width:16px;height:16px;"></i> Submit for Verification`;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  renderWizard();
}

// ─── Admin: KYC Review Page ────────────────────────────────
export async function adminKYCPage(el) {
  if (!auth.isConnected() || !auth.user?.is_staff) {
    navigate('/');
    return toast.error('Admin access required');
  }

  el.innerHTML = `
    <div class="container" style="max-width:860px;">
      <div class="page-header scroll-reveal" style="margin-bottom:8px;">
        <div>
          <h1 style="font-size:1.75rem;font-weight:800;">KYC Review</h1>
          <p style="color:var(--text-secondary);font-size:0.92rem;margin-top:4px;">Review and approve seller identity documents</p>
        </div>
        <div id="kycStats" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
      </div>

      <!-- Filters -->
      <div class="scroll-reveal" style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
        <button class="filter-chip active" data-status="">All</button>
        <button class="filter-chip" data-status="pending">Pending</button>
        <button class="filter-chip" data-status="approved">Approved</button>
        <button class="filter-chip" data-status="rejected">Rejected</button>
      </div>

      <div id="kycList"></div>
    </div>
  `;

  let currentStatus = '';

  async function loadKYC(statusFilter = '') {
    let container = el.querySelector('#kycList');
    container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const submissions = await api.get('/api/admin/kyc/', params);

      // Stats pills (only when showing all)
      if (!statusFilter) {
        const pending  = submissions.filter(s => s.overall_status === 'pending').length;
        const approved = submissions.filter(s => s.overall_status === 'approved').length;
        const rejected = submissions.filter(s => s.overall_status === 'rejected').length;
        el.querySelector('#kycStats').innerHTML = `
          ${pending  ? `<div style="padding:5px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:rgba(245,158,11,0.12);color:var(--warning);border:1px solid rgba(245,158,11,0.3);">
            <i data-lucide="clock" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${pending} Pending
          </div>` : ''}
          ${approved ? `<div style="padding:5px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.25);">
            <i data-lucide="check-circle" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${approved} Approved
          </div>` : ''}
          ${rejected ? `<div style="padding:5px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;background:rgba(239,68,68,0.1);color:var(--danger);border:1px solid rgba(239,68,68,0.25);">
            <i data-lucide="x-circle" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${rejected} Rejected
          </div>` : ''}`;
        if (window.lucide) window.lucide.createIcons();
      }

      if (submissions.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="icon"><i data-lucide="shield-off" style="width:48px;height:48px;opacity:0.3;"></i></div>
            <p>No KYC submissions found</p>
          </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const statusCfg = {
        pending:  { color: 'var(--warning)',  bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  icon: 'clock',         label: 'PENDING'  },
        approved: { color: 'var(--success)',  bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: 'shield-check',  label: 'APPROVED' },
        rejected: { color: 'var(--danger)',   bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: 'x-circle',      label: 'REJECTED' },
      };

      container.innerHTML = submissions.map(s => {
        const cfg       = statusCfg[s.overall_status] || statusCfg.pending;
        const isPending = s.overall_status === 'pending';
        const latestDoc = [...s.documents].sort((a,b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))[0];
        const rejNote   = s.documents.find(d => d.notes)?.notes;

        // Separate selfie from ID docs
        const idDocs      = s.documents.filter(d => d.document_type !== 'selfie');
        const selfieDocs  = s.documents.filter(d => d.document_type === 'selfie');

        return `
        <div class="card scroll-reveal" style="margin-bottom:14px;border-color:${cfg.border};padding:0;overflow:hidden;" data-user-id="${s.user_id}">

          <!-- Card header -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:${cfg.bg};border-bottom:1px solid ${cfg.border};flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:34px;height:34px;border-radius:50%;background:${cfg.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${cfg.icon}" style="width:16px;height:16px;color:${cfg.color};"></i>
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-size:0.7rem;font-weight:800;letter-spacing:0.08em;color:${cfg.color};">${cfg.label}</span>
                  <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-secondary);">${s.user_wallet.slice(0,10)}…${s.user_wallet.slice(-4)}</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:1px;">
                  Submitted ${latestDoc ? new Date(latestDoc.uploaded_at).toLocaleString() : '—'}
                </div>
              </div>
            </div>
            ${isPending ? `
            <div style="display:flex;gap:8px;flex-shrink:0;">
              <button class="btn btn-sm" data-action="approve" data-id="${s.user_id}"
                style="background:rgba(16,185,129,0.12);color:var(--success);border:1px solid rgba(16,185,129,0.35);gap:5px;">
                <i data-lucide="check" style="width:14px;height:14px;"></i>Approve
              </button>
              <button class="btn btn-sm" data-action="reject" data-id="${s.user_id}"
                style="background:rgba(239,68,68,0.1);color:var(--danger);border:1px solid rgba(239,68,68,0.3);gap:5px;">
                <i data-lucide="x" style="width:14px;height:14px;"></i>Reject
              </button>
            </div>` : ''}
          </div>

          <!-- Body -->
          <div style="padding:18px 20px;">

            <!-- Personal info grid -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
              ${[
                ['user', 'Full Name',     esc(s.full_name     || '—'), false],
                ['mail', 'Email',         esc(s.email_address || '—'), true],
                ['phone','Phone',         esc(s.phone_number  || '—'), false],
                ['calendar', 'Date of Birth', s.date_of_birth || '—', false],
              ].map(([icon, label, val, truncate]) => `
                <div style="display:flex;align-items:flex-start;gap:8px;min-width:0;">
                  <div style="width:26px;height:26px;border-radius:7px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
                    <i data-lucide="${icon}" style="width:12px;height:12px;color:var(--text-muted);"></i>
                  </div>
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:0.67rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);">${label}</div>
                    <div style="font-size:0.86rem;font-weight:600;margin-top:1px;${truncate ? 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' : ''}">${val}</div>
                  </div>
                </div>`).join('')}
            </div>

            <!-- Documents -->
            <div style="margin-bottom:${isPending ? '16px' : '0'};">
              <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:10px;">
                <i data-lucide="paperclip" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>Documents
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                ${[...idDocs, ...selfieDocs].map(doc => {
                  const docName = doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const docIcon = doc.document_type === 'selfie' ? 'scan-face' : 'credit-card';
                  return `
                  <a href="${doc.file}" target="_blank" style="
                    display:inline-flex;align-items:center;gap:7px;
                    padding:8px 14px;border-radius:10px;
                    background:var(--bg-secondary);
                    border:1px solid var(--border);
                    color:var(--text-primary);
                    text-decoration:none;
                    font-size:0.83rem;font-weight:500;
                    transition:border-color 0.2s,background 0.2s;">
                    <i data-lucide="${docIcon}" style="width:14px;height:14px;color:var(--accent);flex-shrink:0;"></i>
                    ${esc(docName)}
                    <i data-lucide="external-link" style="width:11px;height:11px;color:var(--text-muted);margin-left:2px;"></i>
                  </a>`;
                }).join('')}
              </div>
            </div>

            <!-- Previous rejection note -->
            ${rejNote ? `
            <div style="margin-top:12px;padding:10px 14px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:8px;">
              <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--danger);margin-bottom:4px;">Previous Rejection Reason</div>
              <div style="font-size:0.85rem;color:var(--text-primary);">${esc(rejNote)}</div>
            </div>` : ''}

            <!-- Inline reject reason (pending only) -->
            ${isPending ? `
            <div class="reject-panel" style="display:none;margin-top:14px;padding:14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;">
              <div style="font-size:0.75rem;font-weight:700;color:var(--danger);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em;">
                <i data-lucide="alert-triangle" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>Rejection Reason
              </div>
              <textarea class="form-textarea reject-reason" placeholder="Explain why this submission is rejected (shown to the user)…" style="min-height:72px;font-size:0.85rem;border-color:rgba(239,68,68,0.3);"></textarea>
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn btn-sm" data-action="reject-confirm" data-id="${s.user_id}"
                  style="background:rgba(239,68,68,0.12);color:var(--danger);border:1px solid rgba(239,68,68,0.35);">
                  <i data-lucide="x-circle" style="width:14px;height:14px;"></i>Confirm Reject
                </button>
                <button class="btn btn-sm btn-secondary reject-cancel">Cancel</button>
              </div>
            </div>` : ''}
          </div>
        </div>`;
      }).join('');

      if (window.lucide) window.lucide.createIcons();

      // Event delegation
      container.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const userId = btn.dataset.id;
        const card   = btn.closest('[data-user-id]');

        if (action === 'reject') {
          // Show inline panel instead of prompt
          const panel = card.querySelector('.reject-panel');
          if (panel) { panel.style.display = 'block'; if (window.lucide) window.lucide.createIcons(); }
          return;
        }

        if (action === 'reject-confirm') {
          const notes = card.querySelector('.reject-reason')?.value.trim() || '';
          btn.disabled = true;
          btn.innerHTML = `<i data-lucide="loader" style="width:13px;height:13px;animation:spin 1s linear infinite;"></i> Rejecting…`;
          if (window.lucide) window.lucide.createIcons();
          try {
            await api.patch(`/api/admin/kyc/${userId}/`, { status: 'rejected', notes });
            toast.success('KYC rejected.');
            loadKYC(currentStatus);
          } catch (err) {
            toast.error(err.data?.detail || err.message);
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="x-circle" style="width:14px;height:14px;"></i>Confirm Reject`;
            if (window.lucide) window.lucide.createIcons();
          }
          return;
        }

        if (action === 'approve') {
          btn.disabled = true;
          btn.innerHTML = `<i data-lucide="loader" style="width:13px;height:13px;animation:spin 1s linear infinite;"></i> Approving…`;
          if (window.lucide) window.lucide.createIcons();
          try {
            await api.patch(`/api/admin/kyc/${userId}/`, { status: 'approved', notes: '' });
            toast.success('KYC approved!');
            loadKYC(currentStatus);
          } catch (err) {
            toast.error(err.data?.detail || err.message);
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="check" style="width:14px;height:14px;"></i>Approve`;
            if (window.lucide) window.lucide.createIcons();
          }
          return;
        }
      });

      // Cancel reject panel
      container.addEventListener('click', e => {
        if (e.target.closest('.reject-cancel')) {
          e.target.closest('.reject-panel').style.display = 'none';
        }
      });

      requestAnimationFrame(() => observeElements());
    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--danger);">Error: ${err.message}</div>`;
    }
  }

  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatus = chip.dataset.status;
      loadKYC(currentStatus);
    });
  });

  requestAnimationFrame(() => observeElements());
  await loadKYC();
}

// ─── Admin: Disputes Page ──────────────────────────────────
export async function adminDisputesPage(el) {
  if (!auth.isConnected() || !auth.user?.is_staff) {
    navigate('/');
    return toast.error('Admin access required');
  }

  el.innerHTML = `
    <div class="container">
      <div class="page-header scroll-reveal" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <h1>Dispute Management</h1>
          <p class="text-muted">Review evidence and resolve disputes between buyers and sellers</p>
        </div>
        <div id="disputeStats" style="display:flex;gap:12px;font-size:0.85rem;"></div>
      </div>

      <div class="scroll-reveal" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;border-bottom:1px solid var(--border-color);padding-bottom:12px;">
        <button class="filter-chip active" data-res="">All</button>
        <button class="filter-chip" data-res="pending">
          <i data-lucide="clock" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>Pending
        </button>
        <button class="filter-chip" data-res="refund_buyer">
          <i data-lucide="undo-2" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>Refunded to Buyer
        </button>
        <button class="filter-chip" data-res="pay_seller">
          <i data-lucide="send" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>Paid to Seller
        </button>
      </div>

      <div id="disputeList"></div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  function renderEvidenceParty(label, color, icon, items) {
    return `
      <div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">
          <div style="width:20px;height:20px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="${icon}" style="width:11px;height:11px;color:${color};"></i>
          </div>
          <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${color};">${label}</span>
          <span style="font-size:0.7rem;color:var(--text-muted);">(${items.length})</span>
        </div>
        ${items.length === 0
          ? `<p style="font-size:0.78rem;color:var(--text-muted);margin-left:26px;font-style:italic;">Nothing submitted</p>`
          : `<div style="display:flex;flex-direction:column;gap:6px;margin-left:26px;">
              ${items.map(ev => `
                <div style="display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--bg-secondary,rgba(255,255,255,0.03));border:1px solid var(--border-color);border-radius:8px;">
                  ${ev.file
                    ? `<div style="width:38px;height:38px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--border-color);">
                         <img src="${mediaUrl(ev.file)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='flex';this.parentElement.style.alignItems='center';this.parentElement.style.justifyContent='center';this.remove();">
                       </div>
                       <div style="flex:1;min-width:0;">
                         <div style="font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(ev.description || ev.file.split('/').pop())}</div>
                         <div style="font-size:0.69rem;color:var(--text-muted);">File attachment</div>
                       </div>
                       <a href="${mediaUrl(ev.file)}" target="_blank" class="btn btn-secondary btn-sm" style="flex-shrink:0;padding:4px 8px;">
                         <i data-lucide="external-link" style="width:12px;height:12px;"></i>
                       </a>`
                    : `<div style="width:38px;height:38px;border-radius:6px;flex-shrink:0;background:rgba(99,102,241,0.1);display:flex;align-items:center;justify-content:center;">
                         <i data-lucide="message-square" style="width:16px;height:16px;color:var(--accent-primary);"></i>
                       </div>
                       <div style="flex:1;font-size:0.82rem;line-height:1.5;">${esc(ev.description || 'Text note')}</div>`
                  }
                </div>
              `).join('')}
            </div>`
        }
      </div>`;
  }

  async function loadDisputes(resFilter = '') {
    const container = el.querySelector('#disputeList');
    container.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    try {
      const params = {};
      if (resFilter) params.resolution = resFilter;
      const disputes = await api.get('/api/admin/disputes/', params);

      // Stats
      const statsEl = el.querySelector('#disputeStats');
      const pending  = disputes.filter(d => d.resolution === 'pending').length;
      statsEl.innerHTML = `
        <div style="padding:6px 14px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:20px;color:var(--warning);font-weight:600;">
          ${pending} Pending
        </div>
        <div style="padding:6px 14px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:20px;color:var(--text-muted);">
          ${disputes.length} Total
        </div>`;

      if (disputes.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="icon"><i data-lucide="scale" style="width:48px;height:48px;opacity:0.3;"></i></div>
            <p>No disputes found</p>
          </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      container.innerHTML = disputes.map(d => {
        const isPending   = d.resolution === 'pending';
        const buyerEv     = (d.evidence || []).filter(e => e.uploader_wallet === d.buyer_wallet);
        const sellerEv    = (d.evidence || []).filter(e => e.uploader_wallet === d.seller_wallet);
        const resLabel    = { pending: 'PENDING', refund_buyer: 'REFUNDED TO BUYER', pay_seller: 'PAID TO SELLER', cancelled: 'CANCELLED' }[d.resolution] || d.resolution;
        const resColor    = { pending: 'var(--warning)', refund_buyer: '#60a5fa', pay_seller: 'var(--success)', cancelled: 'var(--danger)' }[d.resolution] || 'var(--text-muted)';

        return `
        <div class="card scroll-reveal" style="margin-bottom:16px;border-color:${isPending ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'};" data-dispute-id="${d.id}">

          <!-- Card header -->
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:${isPending ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.1)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="${isPending ? 'alert-triangle' : 'check-circle'}" style="width:18px;height:18px;color:${isPending ? 'var(--danger)' : 'var(--success)'};"></i>
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span style="font-weight:700;font-size:0.95rem;">${esc(d.product_title)}</span>
                  <span style="font-size:0.78rem;color:var(--text-muted);font-family:var(--font-mono);">Order #${d.order_id}</span>
                  <span style="font-weight:700;color:var(--accent-primary);">₱${formatPrice(d.total_price)}</span>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">
                  Opened ${new Date(d.created_at).toLocaleDateString()} · ${d.reason.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;">
              <a href="#/products/${d.product_id}" target="_blank"
                style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-size:0.78rem;font-weight:600;background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.3);text-decoration:none;white-space:nowrap;">
                <i data-lucide="external-link" style="width:12px;height:12px;"></i>View Listing
              </a>
              <span style="padding:4px 12px;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:0.06em;background:${resColor}18;color:${resColor};border:1px solid ${resColor}40;white-space:nowrap;">
                ${resLabel}
              </span>
            </div>
          </div>

          <!-- Parties -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;background:var(--bg-secondary,rgba(255,255,255,0.03));border-radius:8px;margin-bottom:14px;font-size:0.82rem;">
            <div>
              <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Buyer</div>
              <div style="font-family:var(--font-mono);">${d.buyer_wallet.slice(0,10)}…</div>
            </div>
            <div>
              <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Seller</div>
              <div style="font-family:var(--font-mono);">${d.seller_wallet.slice(0,10)}…</div>
            </div>
            <div style="grid-column:1/-1;">
              <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:3px;">Description</div>
              <div style="line-height:1.5;">${esc(d.description)}</div>
            </div>
          </div>

          <!-- Evidence by party -->
          <div style="border:1px solid var(--border-color);border-radius:10px;padding:12px;margin-bottom:${isPending ? '14px' : '0'};">
            <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:12px;">
              Evidence (${(d.evidence||[]).length} total)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              ${renderEvidenceParty('Buyer', '#60a5fa', 'user', buyerEv)}
              ${renderEvidenceParty('Seller', '#a78bfa', 'store', sellerEv)}
            </div>
          </div>

          ${d.admin_notes ? `
          <div style="margin-top:12px;padding:10px 14px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.25);border-radius:8px;font-size:0.83rem;">
            <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--warning);letter-spacing:0.08em;">Admin Notes</span>
            <p style="margin:4px 0 0;">${esc(d.admin_notes)}</p>
          </div>` : ''}

          <!-- Resolve panel (pending only) -->
          ${isPending ? `
          <div class="resolve-panel" style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:14px;">
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:10px;">
              <i data-lucide="scale" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"></i>Admin Decision
            </div>
            <textarea class="form-textarea admin-notes-input" placeholder="Add a note explaining your decision (visible to both parties)…" style="min-height:60px;margin-bottom:10px;font-size:0.85rem;"></textarea>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn btn-sm" data-resolve="refund_buyer" data-id="${d.id}"
                style="background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.4);flex:1;justify-content:center;">
                <i data-lucide="undo-2" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>Refund Buyer
              </button>
              <button class="btn btn-sm" data-resolve="pay_seller" data-id="${d.id}"
                style="background:rgba(16,185,129,0.12);color:var(--success);border:1px solid rgba(16,185,129,0.35);flex:1;justify-content:center;">
                <i data-lucide="send" style="width:14px;height:14px;vertical-align:middle;margin-right:5px;"></i>Pay Seller
              </button>
            </div>
          </div>` : ''}
        </div>`;
      }).join('');

      if (window.lucide) window.lucide.createIcons();

      // Resolve click — reads notes from the card's textarea
      container.addEventListener('click', async e => {
        const btn = e.target.closest('[data-resolve]');
        if (!btn) return;
        const resolution  = btn.dataset.resolve;
        const id          = btn.dataset.id;
        const card        = btn.closest('[data-dispute-id]');
        const adminNotes  = card.querySelector('.admin-notes-input')?.value.trim() || '';
        btn.disabled = true;
        const origHTML = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" style="width:14px;height:14px;vertical-align:middle;animation:spin 1s linear infinite;"></i>';
        if (window.lucide) window.lucide.createIcons();
        try {
          const result = await api.post(`/api/disputes/${id}/resolve/`, { resolution, admin_notes: adminNotes });
          if (result.warning) {
            toast.error(`⚠️ DB updated but on-chain failed: ${result.warning}`);
          } else {
            toast.success(`Dispute resolved: ${resolution.replace('_', ' ')} — funds transferred on-chain.`);
          }
          loadDisputes(currentRes);
        } catch (err) {
          toast.error(err.data?.detail || err.message);
          btn.disabled = false;
          btn.innerHTML = origHTML;
          if (window.lucide) window.lucide.createIcons();
        }
      });

      requestAnimationFrame(() => observeElements());
    } catch (e) {
      container.innerHTML = `<p class="text-muted">Error: ${e.message}</p>`;
    }
  }

  let currentRes = '';
  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentRes = chip.dataset.res;
      loadDisputes(currentRes);
    });
  });

  requestAnimationFrame(() => observeElements());
  await loadDisputes();
}

// ─── Utility ───────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function categoryIcon(cat) {
  const icons = { physical: '📦', digital: '💾', game_account: '🎮' };
  return icons[cat] || '📦';
}
