/* ============================================================
   escrow.js — MetaMask + USDC escrow contract integration (Base)

   The backend tells us which network/contract to use
   (GET /api/escrow/config/) and encodes every call. We only sign
   in MetaMask, then ask the backend to verify the result on-chain.
   ============================================================ */

import api from './api.js';
import auth from './auth.js';

let _config = null;
let _configPromise = null;

/** Fetch (and cache) chain/contract config + PHP/USDC rate. */
export function loadEscrowConfig(force = false) {
  if (force) { _config = null; _configPromise = null; }
  if (_config) return Promise.resolve(_config);
  if (!_configPromise) {
    _configPromise = api.get('/api/escrow/config/')
      .then(cfg => (_config = cfg))
      .catch(err => { _configPromise = null; throw err; });
  }
  return _configPromise;
}

/** "12.34 USDC" estimate for a PHP amount (uses the cached rate). */
export function phpToUsdcDisplay(phpAmount) {
  const rate = parseFloat(_config?.php_per_usdc);
  if (!rate) return 'USDC';
  const usdc = parseFloat(phpAmount) / rate;
  return `${usdc.toFixed(2)} USDC`;
}

// ─── Wallet helpers ────────────────────────────────────────

async function ensureWallet(config) {
  if (!window.ethereum) throw new Error('MetaMask not installed');

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts[0].toLowerCase();
  const expected = (auth.wallet || auth.user?.wallet_address || '').toLowerCase();
  if (expected && account !== expected) {
    throw new Error(`Switch MetaMask to the account you logged in with (${expected.slice(0, 6)}…${expected.slice(-4)}).`);
  }

  const current = await window.ethereum.request({ method: 'eth_chainId' });
  if (parseInt(current, 16) !== config.chain_id) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: config.chain_id_hex }],
      });
    } catch (err) {
      // 4902 = chain not added to MetaMask yet
      if (err.code !== 4902 && err?.data?.originalError?.code !== 4902) {
        throw new Error(`Please switch MetaMask to ${config.chain_name}.`);
      }
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: config.chain_id_hex,
          chainName: config.chain_name,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [config.rpc_url],
          blockExplorerUrls: config.explorer_url ? [config.explorer_url] : undefined,
        }],
      });
    }
  }
  return account;
}

const pad32 = (hexNoPrefix) => hexNoPrefix.toLowerCase().padStart(64, '0');
const addrArg = (addr) => pad32(addr.replace(/^0x/, ''));

async function readUint(to, data) {
  const res = await window.ethereum.request({ method: 'eth_call', params: [{ to, data }, 'latest'] });
  return BigInt(res && res !== '0x' ? res : '0x0');
}

const balanceOf = (token, owner) => readUint(token, '0x70a08231' + addrArg(owner));
const allowance = (token, owner, spender) =>
  readUint(token, '0xdd62ed3e' + addrArg(owner) + addrArg(spender));

async function sendTx(from, call) {
  return window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: call.to, data: call.data, value: call.value || '0x0' }],
  });
}

async function waitForReceipt(txHash, { tries = 90, intervalMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const receipt = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (receipt) {
      if (receipt.status === '0x0') throw new Error('Transaction failed on-chain');
      return receipt;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for the transaction. Check your wallet activity and refresh.');
}

/** POST to a backend endpoint, retrying briefly in case its RPC node is a block behind. */
async function postWithRetry(path, body, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api.post(path, body);
    } catch (err) {
      lastErr = err;
      if (err.status !== 400 && err.status !== 502) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

// ─── Escrow actions ────────────────────────────────────────

/**
 * Pay for an order:
 *  1. backend quotes the order in USDC and encodes approve + createEscrow
 *  2. buyer signs approve (if needed) and createEscrow in MetaMask
 *  3. backend verifies the escrow on-chain and marks the order paid
 */
export async function createEscrow(orderId) {
  const quote = await api.post(`/api/orders/${orderId}/escrow/create/`);
  const { config, calls } = quote;
  const amount = BigInt(quote.amount_units);

  const buyer = await ensureWallet(config);

  const bal = await balanceOf(config.token_address, buyer);
  if (bal < amount) {
    const have = (Number(bal) / 1e6).toFixed(2);
    throw new Error(`Not enough USDC on ${config.chain_name}: need ${quote.amount_usdc}, you have ${have}.`);
  }

  if (await allowance(config.token_address, buyer, config.escrow_address) < amount) {
    const approveHash = await sendTx(buyer, calls.approve);
    await waitForReceipt(approveHash);
  }

  const txHash = await sendTx(buyer, calls.create);
  await waitForReceipt(txHash);

  const order = await postWithRetry(`/api/orders/${orderId}/escrow/verify/`, { tx_hash: txHash });
  return { txHash, escrowId: order.escrow_id, amountUsdc: quote.amount_usdc, explorerUrl: config.explorer_url };
}

/** Buyer confirms delivery on-chain; funds go to the seller. */
export async function confirmDelivery(orderId) {
  const { transaction, config } = await api.post(`/api/orders/${orderId}/escrow/confirm/`);
  const buyer = await ensureWallet(config);
  const txHash = await sendTx(buyer, transaction);
  await waitForReceipt(txHash);
  await postWithRetry(`/api/orders/${orderId}/escrow/sync/`);
  return { txHash, explorerUrl: config.explorer_url };
}

/** Seller refunds the buyer on-chain; order becomes cancelled. */
export async function refundEscrow(orderId) {
  const { transaction, config } = await api.post(`/api/orders/${orderId}/escrow/refund/`);
  const seller = await ensureWallet(config);
  const txHash = await sendTx(seller, transaction);
  await waitForReceipt(txHash);
  await postWithRetry(`/api/orders/${orderId}/escrow/sync/`);
  return { txHash, explorerUrl: config.explorer_url };
}
