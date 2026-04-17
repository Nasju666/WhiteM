/* ============================================================
   escrow.js — MetaMask + Escrow smart contract integration
   ============================================================ */

import api from './api.js';

// Fixed demo rate: ₱1 = 0.00001 ETH
const PHP_TO_ETH_RATE = 0.00001;

/**
 * Convert PHP price to Wei (smallest ETH unit)
 */
function phpToWei(phpAmount) {
  const eth = parseFloat(phpAmount) * PHP_TO_ETH_RATE;
  // Convert to Wei (1 ETH = 1e18 Wei) — use BigInt for precision
  const wei = BigInt(Math.round(eth * 1e18));
  return '0x' + wei.toString(16);
}

/**
 * Format Wei to readable ETH string
 */
function weiToEth(weiHex) {
  const wei = BigInt(weiHex);
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

/**
 * Convert PHP to ETH display string
 */
export function phpToEthDisplay(phpAmount) {
  const eth = parseFloat(phpAmount) * PHP_TO_ETH_RATE;
  if (eth < 0.000001) return eth.toExponential(2) + ' ETH';
  return eth.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + ' ETH';
}

/**
 * Create escrow on-chain via MetaMask
 * 1. Get unsigned tx from backend
 * 2. Send via MetaMask
 * 3. Save tx_hash + escrow_id back to backend
 */
export async function createEscrow(orderId, phpPrice) {
  if (!window.ethereum) throw new Error('MetaMask not installed');

  // Force MetaMask to switch to Hardhat Local Network (Chain ID: 31337 / 0x7a69)
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7a69' }],
    });
  } catch (switchError) {
    console.log("Could not switch network automatically. Please switch to Hardhat Local manually.", switchError);
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const buyer = accounts[0];

  // 1. Get the unsigned transaction from backend
  const { transaction } = await api.post(`/api/orders/${orderId}/escrow/create/`);

  // 2. Override the value with our PHP→Wei conversion
  const valueWei = phpToWei(phpPrice);

  // 3. Send transaction via MetaMask
  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: buyer,
      to: transaction.to,
      data: transaction.data,
      value: valueWei,
      gas: transaction.gas ? '0x' + parseInt(transaction.gas).toString(16) : undefined,
    }],
  });

  // 4. Wait for transaction receipt
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    receipt = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (receipt) break;
  }

  if (!receipt || receipt.status === '0x0') {
    throw new Error('Transaction failed on-chain');
  }

  // 5. Get escrow ID by querying the contract's nextEscrowId
  //    Our escrow is always (nextEscrowId - 1) since we just created it
  let escrowId = null;
  try {
    // ABI fragment for nextEscrowId() → returns uint256
    // Function selector: keccak256("nextEscrowId()") = 0x89cb29dd
    const nextIdResult = await window.ethereum.request({
      method: 'eth_call',
      params: [{
        to: receipt.to,
        data: '0x89cb29dd',  // nextEscrowId()
      }, 'latest'],
    });
    const nextId = parseInt(nextIdResult, 16);
    escrowId = nextId > 0 ? nextId - 1 : 0;
    console.log('Escrow ID extracted:', escrowId);
  } catch (logErr) {
    console.warn('Could not extract escrow ID from contract, trying logs...', logErr);
    // Fallback: try log parsing
    if (receipt.logs && receipt.logs.length > 0) {
      const log = receipt.logs[0];
      if (log.topics && log.topics.length > 1) {
        escrowId = parseInt(log.topics[1], 16);
      }
    }
  }

  // 6. Save to backend
  await api.patch(`/api/orders/${orderId}/status/`, {
    status: 'paid',
    tx_hash: txHash,
    escrow_id: escrowId,
  });

  return { txHash, escrowId };
}

/**
 * Confirm delivery on-chain — releases funds to seller
 */
export async function confirmDelivery(orderId) {
  if (!window.ethereum) throw new Error('MetaMask not installed');

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const buyer = accounts[0];

  // 1. Get unsigned tx from backend
  const { transaction } = await api.post(`/api/orders/${orderId}/escrow/confirm/`);

  // 2. Send via MetaMask
  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: buyer,
      to: transaction.to,
      data: transaction.data,
      gas: transaction.gas ? '0x' + parseInt(transaction.gas).toString(16) : undefined,
    }],
  });

  // 3. Wait for receipt
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    receipt = await window.ethereum.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (receipt) break;
  }

  if (!receipt || receipt.status === '0x0') {
    throw new Error('Transaction failed on-chain');
  }

  // 4. Update order status
  await api.patch(`/api/orders/${orderId}/status/`, {
    status: 'completed',
    tx_hash: txHash,
  });

  return { txHash };
}
