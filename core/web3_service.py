import json
import os
from pathlib import Path

from web3 import Web3

# Load ABI once at module level
_ABI_PATH = Path(__file__).resolve().parent / "escrow_abi.json"
with open(_ABI_PATH) as f:
    ESCROW_ABI = json.load(f)


def _get_web3():
    """Return a connected Web3 instance."""
    provider_url = os.getenv("WEB3_PROVIDER_URL", "http://127.0.0.1:8545")
    w3 = Web3(Web3.HTTPProvider(provider_url))
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to Web3 provider at {provider_url}")
    return w3


def _get_contract():
    """Return the Escrow contract instance."""
    w3 = _get_web3()
    
    # Force reload from .env in case the server cached old variables
    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
    
    address = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
    if not address:
        raise ValueError("ESCROW_CONTRACT_ADDRESS not set in environment.")
    return w3.eth.contract(
        address=Web3.to_checksum_address(address),
        abi=ESCROW_ABI,
    )


def build_create_escrow_tx(buyer_address: str, seller_address: str, amount_wei: int):
    """
    Build an unsigned transaction for buyer to create an escrow.
    The frontend signs this with MetaMask and broadcasts it.
    """
    contract = _get_contract()
    w3 = _get_web3()

    tx = contract.functions.createEscrow(
        Web3.to_checksum_address(seller_address)
    ).build_transaction({
        "from": Web3.to_checksum_address(buyer_address),
        "value": amount_wei,
        "nonce": w3.eth.get_transaction_count(
            Web3.to_checksum_address(buyer_address)
        ),
        "gasPrice": w3.eth.gas_price,
    })
    # Convert non-serializable values to hex strings for JSON response
    return _serialize_tx(tx)


def build_confirm_delivery_tx(buyer_address: str, escrow_id: int):
    """Build unsigned tx for buyer to confirm delivery."""
    contract = _get_contract()
    w3 = _get_web3()

    tx = contract.functions.confirmDelivery(escrow_id).build_transaction({
        "from": Web3.to_checksum_address(buyer_address),
        "nonce": w3.eth.get_transaction_count(
            Web3.to_checksum_address(buyer_address)
        ),
        "gasPrice": w3.eth.gas_price,
    })
    return _serialize_tx(tx)


def build_dispute_tx(caller_address: str, escrow_id: int):
    """Build unsigned tx for buyer or seller to raise a dispute."""
    contract = _get_contract()
    w3 = _get_web3()

    tx = contract.functions.disputeEscrow(escrow_id).build_transaction({
        "from": Web3.to_checksum_address(caller_address),
        "nonce": w3.eth.get_transaction_count(
            Web3.to_checksum_address(caller_address)
        ),
        "gasPrice": w3.eth.gas_price,
    })
    return _serialize_tx(tx)


def mark_escrow_disputed(escrow_id: int, caller_address: str, private_key: str) -> str:
    """
    Signs and sends disputeEscrow(escrowId) on-chain as the buyer or seller.
    The caller must be the buyer or seller of that escrow.
    Returns the transaction hash.
    """
    contract = _get_contract()
    w3 = _get_web3()

    tx = contract.functions.disputeEscrow(escrow_id).build_transaction({
        "from": Web3.to_checksum_address(caller_address),
        "nonce": w3.eth.get_transaction_count(Web3.to_checksum_address(caller_address)),
        "gasPrice": w3.eth.gas_price,
    })
    signed = w3.eth.account.sign_transaction(tx, private_key=private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    return tx_hash.hex()


def resolve_dispute_on_chain(escrow_id: int, refund_buyer: bool) -> str:
    """
    Arbiter signs and sends resolveDispute(escrowId, refundBuyer) on-chain.
    Returns the transaction hash.
    """
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

    private_key = os.getenv("ARBITER_PRIVATE_KEY", "")
    if not private_key:
        raise ValueError("ARBITER_PRIVATE_KEY not set in environment.")

    contract = _get_contract()
    w3 = _get_web3()

    arbiter_address = w3.eth.account.from_key(private_key).address

    tx = contract.functions.resolveDispute(escrow_id, refund_buyer).build_transaction({
        "from": arbiter_address,
        "nonce": w3.eth.get_transaction_count(arbiter_address),
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, private_key=private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    return tx_hash.hex()


def get_escrow_status(escrow_id: int) -> dict:
    """Read on-chain escrow state using the public mapping getter."""
    contract = _get_contract()
    status_map = {0: "awaiting_delivery", 1: "complete", 2: "disputed", 3: "resolved"}
    try:
        result = contract.functions.escrows(escrow_id).call()
        return {
            "buyer": result[0],
            "seller": result[1],
            "amount_wei": result[2],
            "amount_eth": str(Web3.from_wei(result[2], "ether")),
            "status": status_map.get(result[3], "unknown"),
        }
    except Exception:
        # Escrow may not exist on the current node (e.g. from a previous session)
        return {
            "buyer": None,
            "seller": None,
            "amount_wei": 0,
            "amount_eth": "0",
            "status": "unknown",
        }


def get_escrow_events(from_block: int = 0):
    """
    Fetch all EscrowCreated events from the contract.
    Returns a list of dicts with escrowId, buyer, seller, amount.
    """
    contract = _get_contract()
    events = contract.events.EscrowCreated.get_logs(from_block=from_block)
    return [
        {
            "escrow_id": e.args.escrowId,
            "buyer": e.args.buyer,
            "seller": e.args.seller,
            "amount_wei": e.args.amount,
            "tx_hash": e.transactionHash.hex(),
            "block_number": e.blockNumber,
        }
        for e in events
    ]


def _serialize_tx(tx: dict) -> dict:
    """Convert transaction dict values to JSON-serializable types."""
    serialized = {}
    for key, value in tx.items():
        if isinstance(value, bytes):
            serialized[key] = "0x" + value.hex()
        elif isinstance(value, int):
            serialized[key] = hex(value)
        else:
            serialized[key] = value
    return serialized
