"""
Periodic escrow maintenance, shared by the management command and the
cron HTTP endpoint (free hosts like Render have no built-in cron).
"""

import logging

from core import web3_service as w3s
from core.models import Dispute, Order

logger = logging.getLogger("core.escrow")


def release_expired_escrows(dry_run: bool = False) -> dict:
    """
    Pay sellers for escrows past their auto-release deadline that were never
    confirmed or disputed, and sync orders whose escrow was settled on-chain.
    Returns counts plus a per-order log.
    """
    from core.views import apply_escrow_state, escrow_matches_order

    log, errors = [], []
    released = synced = 0

    try:
        now = w3s.chain_timestamp()  # deadlines are in chain time, not server time
    except Exception as exc:
        return {"released": 0, "synced": 0, "log": [], "errors": [f"Cannot reach the chain: {exc}"]}

    open_orders = (
        Order.objects.filter(
            escrow_id__isnull=False,
            status__in=[Order.Status.PAID, Order.Status.SHIPPED, Order.Status.DELIVERED],
        )
        .exclude(dispute__resolution=Dispute.Resolution.PENDING)
        .select_related("buyer")
    )

    for order in open_orders:
        try:
            escrow = w3s.get_escrow_status(order.escrow_id)
        except Exception as exc:
            errors.append(f"Order {order.id}: read failed: {exc}")
            continue

        if not escrow_matches_order(order, escrow):
            errors.append(f"Order {order.id}: escrow {order.escrow_id} belongs to another order, skipping")
            continue

        state = escrow["status"]
        if state in ("complete", "refunded"):
            apply_escrow_state(order, state)
            synced += 1
            log.append(f"Order {order.id}: synced to {order.status}")
            continue

        if state == "awaiting_delivery" and now >= escrow["release_after"]:
            if dry_run:
                log.append(f"Order {order.id}: would release escrow {order.escrow_id}")
                continue
            try:
                tx = w3s.release_expired_on_chain(order.escrow_id)
            except Exception as exc:
                errors.append(f"Order {order.id}: release failed: {exc}")
                continue
            apply_escrow_state(order, "complete")
            released += 1
            log.append(f"Order {order.id}: released to seller ({tx})")

    for line in errors:
        logger.warning(line)
    return {"released": released, "synced": synced, "log": log, "errors": errors}
