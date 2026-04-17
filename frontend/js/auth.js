/* ============================================================
   auth.js — MetaMask wallet connection + nonce-signature auth
   ============================================================ */

import api from './api.js';

const auth = {
  wallet: null,
  user: null,

  /** Check if MetaMask is installed */
  hasMetaMask() {
    return typeof window.ethereum !== 'undefined';
  },

  /** Connect wallet → sign nonce → get JWT */
  async connect() {
    if (!this.hasMetaMask()) {
      throw new Error('MetaMask is not installed. Please install it to continue.');
    }

    // Request accounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.wallet = accounts[0].toLowerCase();

    // Get nonce from backend
    const { nonce } = await api.get('/api/auth/nonce/', { wallet: this.wallet });

    // Sign nonce with MetaMask
    const message = `Sign this message to authenticate with TradingHub.\n\nNonce: ${nonce}`;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, this.wallet],
    });

    // Verify signature → get JWT
    const { access, refresh, user } = await api.post('/api/auth/verify/', {
      wallet: this.wallet,
      signature,
    });

    api.setToken(access);
    this.user = user;
    localStorage.setItem('th_refresh', refresh);

    return user;
  },

  /** Disconnect wallet */
  disconnect() {
    this.wallet = null;
    this.user = null;
    api.setToken(null);
    localStorage.removeItem('th_refresh');
  },

  /** Check if connected */
  isConnected() {
    return !!api.token;
  },

  /** Try restore session from stored token */
  async tryRestore() {
    if (!api.token) return false;
    try {
      this.user = await api.get('/api/auth/profile/');
      this.wallet = this.user.wallet_address;
      return true;
    } catch {
      this.disconnect();
      return false;
    }
  },

  /** Get short wallet display */
  shortWallet() {
    if (!this.wallet) return '';
    return `${this.wallet.slice(0, 6)}...${this.wallet.slice(-4)}`;
  },
};

export default auth;
