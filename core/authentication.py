from eth_account.messages import encode_defunct
from web3 import Web3


def verify_signature(wallet_address: str, nonce: str, signature: str) -> bool:
    """
    Verify that *signature* was produced by the owner of *wallet_address*
    signing the standard nonce message.

    Returns True if the recovered signer matches the claimed wallet.
    """
    message_text = (
        f"Sign this message to authenticate with TradingHub.\n\nNonce: {nonce}"
    )
    message = encode_defunct(text=message_text)

    try:
        recovered = Web3().eth.account.recover_message(message, signature=signature)
    except Exception:
        return False

    return recovered.lower() == wallet_address.lower()
