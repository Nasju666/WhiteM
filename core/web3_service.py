"""
Web3 integration for the USDC escrow contract (Escrow.sol).

Buyers and sellers sign their own transactions in MetaMask; the backend only
encodes calldata for them and then *verifies on-chain* what happened.
The arbiter key (ARBITER_PRIVATE_KEY) is used server-side to freeze escrows
when a dispute is opened, settle disputes, and release expired escrows.
"""

import json
import logging
import os
import urllib.request
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from django.core.cache import cache
from web3 import Web3

logger = logging.getLogger(__name__)

_ABI_PATH = Path(__file__).resolve().parent / "escrow_abi.json"
with open(_ABI_PATH) as f:
    ESCROW_ABI = json.load(f)

# Minimal ERC-20 ABI (approve / allowance / balanceOf)
ERC20_ABI = [
    {"name": "approve", "type": "function", "stateMutability": "nonpayable",
     "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
     "outputs": [{"name": "", "type": "bool"}]},
    {"name": "allowance", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "balanceOf", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "account", "type": "address"}],
     "outputs": [{"name": "", "type": "uint256"}]},
]

USDC_DECIMALS = 6
_UNIT = Decimal(10) ** USDC_DECIMALS

STATUS_MAP = {
    0: "awaiting_delivery",
    1: "complete",
    2: "disputed",
    3: "resolved",
    4: "refunded",
}

# Public network metadata used by the frontend to add/switch networks in MetaMask.
NETWORKS = {
    8453: {
        "name": "Base",
        "rpc_url": "https://mainnet.base.org",
        "explorer": "https://basescan.org",
    },
    84532: {
        "name": "Base Sepolia",
        "rpc_url": "https://sepolia.base.org",
        "explorer": "https://sepolia.basescan.org",
    },
    31337: {
        "name": "Hardhat Local",
        "rpc_url": "http://127.0.0.1:8545",
        "explorer": "",
    },
}

_RATE_CACHE_KEY = "escrow:php_per_usdc"
_RATE_CACHE_SECONDS = 600


class EscrowError(Exception):
    """Raised when on-chain state doesn't match what the backend expects."""


# ---------------------------------------------------------------------------
# Config / connections
# ---------------------------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _reload_env():
    """Re-read .env so a redeployed contract address is picked up without a restart (dev)."""
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)


def _get_web3() -> Web3:
    provider_url = _env("WEB3_PROVIDER_URL", "http://127.0.0.1:8545")
    w3 = Web3(Web3.HTTPProvider(provider_url, request_kwargs={"timeout": 30}))
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to Web3 provider at {provider_url}")
    return w3


def _address(name: str) -> str:
    value = _env(name)
    if not value:
        raise ValueError(f"{name} not set in environment.")
    return Web3.to_checksum_address(value)


def _get_contract(w3: Web3 | None = None):
    _reload_env()
    w3 = w3 or _get_web3()
    return w3.eth.contract(address=_address("ESCROW_CONTRACT_ADDRESS"), abi=ESCROW_ABI)


def _get_token(w3: Web3 | None = None):
    w3 = w3 or _get_web3()
    return w3.eth.contract(address=_address("USDC_TOKEN_ADDRESS"), abi=ERC20_ABI)


def chain_id() -> int:
    return int(_env("CHAIN_ID", "31337"))


# ---------------------------------------------------------------------------
# Pricing (PHP -> USDC)
# ---------------------------------------------------------------------------

def _fetch_live_rate() -> Decimal | None:
    """USDC price in PHP from CoinGecko. Returns None on any failure."""
    url = "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=php"
    headers = {"User-Agent": "WhiteMarket/1.0", "Accept": "application/json"}
    api_key = _env("COINGECKO_API_KEY")
    if api_key:
        headers["x-cg-demo-api-key"] = api_key
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
        rate = Decimal(str(data["usd-coin"]["php"]))
        # Sanity bounds: reject obviously broken data
        if not Decimal("20") < rate < Decimal("200"):
            logger.warning("Ignoring implausible USDC/PHP rate %s", rate)
            return None
        return rate
    except Exception as exc:  # network errors, rate limits, bad JSON
        logger.warning("CoinGecko rate fetch failed: %s", exc)
        return None


def get_php_per_usdc() -> Decimal:
    """
    How many PHP one USDC is worth.
    PRICE_FEED=coingecko (default) uses a live rate cached for 10 minutes and
    falls back to PHP_PER_USDC. PRICE_FEED=fixed always uses PHP_PER_USDC.
    """
    cached = cache.get(_RATE_CACHE_KEY)
    if cached:
        return Decimal(cached)

    rate = None
    if _env("PRICE_FEED", "coingecko").lower() == "coingecko":
        rate = _fetch_live_rate()
    if rate is None:
        fallback = _env("PHP_PER_USDC")
        if not fallback:
            raise EscrowError("No PHP/USDC rate available (live feed failed and PHP_PER_USDC is not set).")
        rate = Decimal(fallback)

    cache.set(_RATE_CACHE_KEY, str(rate), _RATE_CACHE_SECONDS)
    return rate


def php_to_usdc_units(php_amount) -> int:
    """Convert a PHP amount to USDC base units (6 decimals)."""
    usdc = Decimal(str(php_amount)) / get_php_per_usdc()
    return int((usdc * _UNIT).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def units_to_usdc(units: int) -> str:
    return str((Decimal(units) / _UNIT).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def get_public_config() -> dict:
    """Everything the frontend needs to talk to the right network/contract."""
    _reload_env()
    cid = chain_id()
    net = NETWORKS.get(cid, {"name": f"Chain {cid}", "rpc_url": "", "explorer": ""})
    try:
        rate = str(get_php_per_usdc())
    except EscrowError:
        rate = None
    return {
        "chain_id": cid,
        "chain_id_hex": hex(cid),
        "chain_name": net["name"],
        "rpc_url": _env("PUBLIC_RPC_URL") or net["rpc_url"],
        "explorer_url": net["explorer"],
        "escrow_address": _env("ESCROW_CONTRACT_ADDRESS"),
        "token_address": _env("USDC_TOKEN_ADDRESS"),
        "token_symbol": "USDC",
        "token_decimals": USDC_DECIMALS,
        "php_per_usdc": rate,
    }


# ---------------------------------------------------------------------------
# Calldata builders (signed by the user in MetaMask)
# ---------------------------------------------------------------------------

def _call(to: str, data: str) -> dict:
    return {"to": to, "data": data, "value": "0x0"}


def build_create_escrow_calls(order_id: int, seller_address: str, amount_units: int) -> dict:
    """approve() on USDC followed by createEscrow() on the escrow contract."""
    w3 = _get_web3()
    contract = _get_contract(w3)
    token = _get_token(w3)
    approve = token.encode_abi("approve", args=[contract.address, amount_units])
    create = contract.encode_abi(
        "createEscrow",
        args=[order_id, Web3.to_checksum_address(seller_address), amount_units],
    )
    return {
        "approve": _call(token.address, approve),
        "create": _call(contract.address, create),
    }


def build_confirm_delivery_call(escrow_id: int) -> dict:
    contract = _get_contract()
    return _call(contract.address, contract.encode_abi("confirmDelivery", args=[escrow_id]))


def build_dispute_call(escrow_id: int) -> dict:
    contract = _get_contract()
    return _call(contract.address, contract.encode_abi("disputeEscrow", args=[escrow_id]))


def build_refund_call(escrow_id: int) -> dict:
    contract = _get_contract()
    return _call(contract.address, contract.encode_abi("refundBuyer", args=[escrow_id]))


# ---------------------------------------------------------------------------
# Reads / verification
# ---------------------------------------------------------------------------

def _read_escrow(contract, escrow_id: int) -> dict:
    buyer, seller, amount, order_id, release_after, status = contract.functions.escrows(escrow_id).call()
    return {
        "escrow_id": escrow_id,
        "buyer": buyer,
        "seller": seller,
        "amount_units": amount,
        "amount_usdc": units_to_usdc(amount),
        "order_id": order_id,
        "release_after": release_after,
        "status": STATUS_MAP.get(status, "unknown"),
    }


def get_escrow_status(escrow_id: int) -> dict:
    """Read on-chain escrow state."""
    return _read_escrow(_get_contract(), escrow_id)


def verify_escrow_for_order(order_id: int, buyer: str, seller: str, min_amount_units: int) -> dict:
    """
    Look up the escrow the contract recorded for *order_id* and check it
    matches the order. Returns the escrow dict; raises EscrowError otherwise.
    This reads contract state directly, so it doesn't trust anything the browser sent.
    """
    contract = _get_contract()
    exists, escrow_id = contract.functions.escrowIdForOrder(
        Web3.to_checksum_address(buyer), order_id
    ).call()
    if not exists:
        raise EscrowError("No on-chain escrow found for this order yet.")

    e = _read_escrow(contract, escrow_id)
    if e["buyer"].lower() != buyer.lower():
        raise EscrowError("On-chain buyer does not match the order buyer.")
    if e["seller"].lower() != seller.lower():
        raise EscrowError("On-chain seller does not match the product seller.")
    if e["amount_units"] < min_amount_units:
        raise EscrowError(
            f"Escrow holds {Decimal(e['amount_units']) / _UNIT} USDC, "
            f"expected at least {Decimal(min_amount_units) / _UNIT} USDC."
        )
    return e


# ---------------------------------------------------------------------------
# Arbiter (server-signed) transactions
# ---------------------------------------------------------------------------

def _send_as_arbiter(build_fn) -> str:
    """Sign + send a contract call with the arbiter key. Fees are filled in by web3 (EIP-1559)."""
    _reload_env()
    private_key = _env("ARBITER_PRIVATE_KEY")
    if not private_key:
        raise ValueError("ARBITER_PRIVATE_KEY not set in environment.")

    w3 = _get_web3()
    contract = _get_contract(w3)
    account = w3.eth.account.from_key(private_key)

    tx = build_fn(contract).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address, "pending"),
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        raise EscrowError(f"Arbiter transaction reverted: 0x{tx_hash.hex()}")
    return "0x" + tx_hash.hex().removeprefix("0x")


def freeze_escrow_on_chain(escrow_id: int) -> str:
    """Arbiter marks the escrow disputed so it can't auto-release while under review."""
    return _send_as_arbiter(lambda c: c.functions.disputeEscrow(escrow_id))


def resolve_dispute_on_chain(escrow_id: int, refund_buyer: bool) -> str:
    """Arbiter settles the escrow: refund buyer or pay seller."""
    return _send_as_arbiter(lambda c: c.functions.resolveDispute(escrow_id, refund_buyer))


def chain_timestamp() -> int:
    """Timestamp of the latest block (the clock the contract's deadlines use)."""
    return int(_get_web3().eth.get_block("latest")["timestamp"])


def release_expired_on_chain(escrow_id: int) -> str:
    """Push funds to the seller after the auto-release deadline (anyone may call)."""
    return _send_as_arbiter(lambda c: c.functions.releaseExpired(escrow_id))
