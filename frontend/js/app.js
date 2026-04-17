/* ============================================================
   app.js — Main entry point (3D enhanced)
   ============================================================ */

import auth from './auth.js';
import toast from './toast.js';
import { route, start, navigate } from './router.js';
import { initScene } from './three-scene.js';
import { initScrollAnimations } from './animations.js';
import {
  landingPage,
  marketplacePage,
  productDetailPage,
  createListingPage,
  ordersPage,
  orderDetailPage,
  adminDashboardPage,
  sellerDashboardPage,
  kycUploadPage,
  adminKYCPage,
  adminDisputesPage,
} from './pages.js';

// ─── Register Routes ───────────────────────────────────────
route('/', landingPage);
route('/products', marketplacePage);
route('/products/:id', productDetailPage);
route('/sell', createListingPage);
route('/orders', ordersPage);
route('/orders/:id', orderDetailPage);
route('/dashboard', sellerDashboardPage);
route('/kyc', kycUploadPage);
route('/admin', adminDashboardPage);
route('/admin/kyc', adminKYCPage);
route('/admin/disputes', adminDisputesPage);

// ─── Theme System ──────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');

function getStoredTheme() {
  return localStorage.getItem('th_theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun" style="width:18px;height:18px;"></i>' : '<i data-lucide="moon" style="width:18px;height:18px;"></i>';
  if (window.lucide) window.lucide.createIcons({ attrs: { class: '' } });
  localStorage.setItem('th_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Show/hide toggle and manage page-inner class based on current route
export function updatePageMode() {
  const hash = window.location.hash.slice(1) || '/';
  const isLanding = hash === '/';

  if (isLanding) {
    document.body.classList.remove('page-inner');
    themeToggle.style.display = 'none';
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.body.classList.add('page-inner');
    themeToggle.style.display = 'flex';
    applyTheme(getStoredTheme());
  }
}

themeToggle.addEventListener('click', toggleTheme);

// ─── Navbar Wallet Button ──────────────────────────────────
function updateNavbar() {
  const walletBtn = document.getElementById('walletBtn');
  const navLinks = document.getElementById('navLinks');

  if (auth.isConnected()) {
    walletBtn.innerHTML = `
      <span class="wallet-addr">${auth.shortWallet()}</span>
      <i data-lucide="chevron-down" style="width:14px;height:14px;margin-left:4px;transition:transform 0.2s;"></i>
    `;
    walletBtn.classList.add('connected');

    const isStaff = auth.user?.is_staff;
    const isSeller = auth.user?.is_seller;

    navLinks.innerHTML = `
      <a href="#/products">Marketplace</a>
      ${isSeller ? '<a href="#/sell">Sell</a>' : ''}
      <a href="#/dashboard">Dashboard</a>
      <a href="#/orders">Orders</a>
      ${!isSeller ? '<a href="#/kyc">KYC</a>' : ''}
      ${isStaff ? `
        <a href="#/admin">Admin</a>
        <a href="#/admin/kyc">KYC Review</a>
        <a href="#/admin/disputes">Disputes</a>
      ` : ''}
    `;
  } else {
    walletBtn.innerHTML = 'Connect Wallet';
    walletBtn.classList.remove('connected');
    navLinks.innerHTML = '<a href="#/products">Marketplace</a>';
  }

  if (window.lucide) window.lucide.createIcons();
}

// ─── Wallet Dropdown ───────────────────────────────────────
function setupWalletDropdown() {
  const walletBtn = document.getElementById('walletBtn');

  // Create dropdown element once
  let dropdown = document.getElementById('walletDropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'walletDropdown';
    dropdown.className = 'wallet-dropdown';
    dropdown.innerHTML = `
      <div class="wallet-dropdown-addr"></div>
      <hr class="wallet-dropdown-divider">
      <button class="wallet-dropdown-item" id="switchAccountBtn">
        <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
        Switch Account
      </button>
      <button class="wallet-dropdown-item wallet-dropdown-disconnect" id="disconnectBtn">
        <i data-lucide="log-out" style="width:14px;height:14px;"></i>
        Disconnect
      </button>
    `;
    walletBtn.parentElement.style.position = 'relative';
    walletBtn.parentElement.appendChild(dropdown);
  }

  walletBtn.addEventListener('click', async () => {
    if (!auth.isConnected()) {
      try {
        await auth.connect();
        updateNavbar();
        toast.success('Wallet connected!');
      } catch (err) {
        toast.error(err.message);
      }
      return;
    }

    // Toggle dropdown
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);

    // Update address display
    dropdown.querySelector('.wallet-dropdown-addr').textContent = auth.wallet();

    // Rotate chevron
    const chevron = walletBtn.querySelector('[data-lucide="chevron-down"]');
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';

    if (window.lucide) window.lucide.createIcons();
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!walletBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      const chevron = walletBtn.querySelector('[data-lucide="chevron-down"]');
      if (chevron) chevron.style.transform = '';
    }
  });

  // Switch Account — request MetaMask account switch
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#switchAccountBtn')) {
      dropdown.classList.remove('open');
      try {
        await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
        toast.info('Select an account in MetaMask');
      } catch (err) {
        if (err.code !== 4001) toast.error(err.message);
      }
    }
  });

  // Disconnect
  document.addEventListener('click', (e) => {
    if (e.target.closest('#disconnectBtn')) {
      dropdown.classList.remove('open');
      auth.disconnect();
      updateNavbar();
      toast.info('Wallet disconnected');
      navigate('/');
    }
  });
}

// ─── Init ──────────────────────────────────────────────────
async function init() {
  initScene();
  initScrollAnimations();
  updatePageMode();

  await auth.tryRestore();
  updateNavbar();

  setupWalletDropdown();

  window.addEventListener('auth-changed', updateNavbar);
  start();
}

init().then(() => {
  if (window.lucide) window.lucide.createIcons();
});
