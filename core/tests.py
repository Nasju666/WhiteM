import uuid
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from eth_account import Account
from eth_account.messages import encode_defunct

from core.models import KYCDocument, Order, Product, User


# ===================================================================
# Phase 2 — Auth Tests (unchanged)
# ===================================================================


class UserModelTests(TestCase):
    """Tests for the custom User model."""

    def test_create_user_by_wallet(self):
        wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd18"
        user = User.objects.create_user(wallet_address=wallet)
        self.assertEqual(user.wallet_address, wallet)
        self.assertFalse(user.is_seller)
        self.assertEqual(user.kyc_status, User.KYCStatus.NONE)
        self.assertIsNotNone(user.nonce)
        self.assertFalse(user.has_usable_password())

    def test_create_superuser(self):
        wallet = "0xabcdef1234567890abcdef1234567890abcdef12"
        user = User.objects.create_superuser(wallet_address=wallet, password="testpass")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    def test_wallet_address_stored_lowercase(self):
        wallet = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12"
        user = User.objects.create_user(wallet_address=wallet)
        self.assertEqual(user.wallet_address, wallet.lower())

    def test_rotate_nonce(self):
        user = User.objects.create_user(
            wallet_address="0x1111111111111111111111111111111111111111"
        )
        old_nonce = user.nonce
        user.rotate_nonce()
        self.assertNotEqual(user.nonce, old_nonce)


class NonceEndpointTests(TestCase):
    """Tests for GET /api/auth/nonce/"""

    def setUp(self):
        self.client = APIClient()
        self.wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd18"

    def test_nonce_returns_200(self):
        resp = self.client.get("/api/auth/nonce/", {"wallet": self.wallet})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("nonce", resp.json())

    def test_nonce_creates_user(self):
        self.assertEqual(User.objects.count(), 0)
        self.client.get("/api/auth/nonce/", {"wallet": self.wallet})
        self.assertEqual(User.objects.count(), 1)

    def test_nonce_returns_same_for_existing_user(self):
        user = User.objects.create_user(wallet_address=self.wallet)
        resp = self.client.get("/api/auth/nonce/", {"wallet": self.wallet})
        self.assertEqual(resp.json()["nonce"], str(user.nonce))

    def test_nonce_rejects_invalid_wallet(self):
        resp = self.client.get("/api/auth/nonce/", {"wallet": "not-a-wallet"})
        self.assertEqual(resp.status_code, 400)

    def test_nonce_rejects_missing_wallet(self):
        resp = self.client.get("/api/auth/nonce/")
        self.assertEqual(resp.status_code, 400)


class VerifySignatureTests(TestCase):
    """Tests for POST /api/auth/verify/"""

    def setUp(self):
        self.client = APIClient()
        self.account = Account.create()
        self.wallet = self.account.address.lower()
        self.user = User.objects.create_user(wallet_address=self.wallet)

    def _sign_nonce(self, nonce):
        message_text = (
            f"Sign this message to authenticate with TradingHub.\n\nNonce: {nonce}"
        )
        message = encode_defunct(text=message_text)
        signed = self.account.sign_message(message)
        return signed.signature.hex()

    def test_valid_signature_returns_tokens(self):
        sig = self._sign_nonce(self.user.nonce)
        resp = self.client.post(
            "/api/auth/verify/",
            {"wallet": self.wallet, "signature": f"0x{sig}"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)

    def test_valid_signature_rotates_nonce(self):
        old_nonce = self.user.nonce
        sig = self._sign_nonce(self.user.nonce)
        self.client.post(
            "/api/auth/verify/",
            {"wallet": self.wallet, "signature": f"0x{sig}"},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.nonce, old_nonce)

    def test_invalid_signature_returns_401(self):
        fake_sig = "0x" + "ab" * 65
        resp = self.client.post(
            "/api/auth/verify/",
            {"wallet": self.wallet, "signature": fake_sig},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)

    def test_unknown_wallet_returns_404(self):
        unknown = "0x0000000000000000000000000000000000000000"
        sig = "0x" + "ab" * 65
        resp = self.client.post(
            "/api/auth/verify/",
            {"wallet": unknown, "signature": sig},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)


class ProfileEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            wallet_address="0x742d35cc6634c0532925a3b844bc9e7595f2bd18"
        )

    def test_authenticated_user_gets_profile(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/auth/profile/")
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_gets_401(self):
        resp = self.client.get("/api/auth/profile/")
        self.assertEqual(resp.status_code, 401)


class KYCUploadEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            wallet_address="0x742d35cc6634c0532925a3b844bc9e7595f2bd18"
        )

    def test_unauthenticated_gets_401(self):
        resp = self.client.post("/api/kyc/upload/")
        self.assertEqual(resp.status_code, 401)

    def test_authenticated_can_upload(self):
        self.client.force_authenticate(user=self.user)
        from io import BytesIO
        from PIL import Image

        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        buf.name = "test_id.png"

        resp = self.client.post(
            "/api/kyc/upload/",
            {"document_type": "id_front", "file": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)


# ===================================================================
# Phase 3 — Product Tests
# ===================================================================


def _make_seller():
    """Helper to create an approved seller."""
    user = User.objects.create_user(
        wallet_address=f"0x{'aa' * 20}",
        is_seller=True,
        kyc_status="approved",
    )
    return user


def _make_buyer():
    """Helper to create a regular buyer."""
    return User.objects.create_user(wallet_address=f"0x{'bb' * 20}")


def _make_product(seller, **kwargs):
    defaults = {
        "category": Product.Category.DIGITAL,
        "title": "Test Product",
        "price": Decimal("0.5"),
        "status": Product.Status.ACTIVE,
        "quantity": 10,
    }
    defaults.update(kwargs)
    return Product.objects.create(seller=seller, **defaults)


class ProductCRUDTests(TestCase):
    """Tests for Product CRUD endpoints."""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()

    def test_list_active_products(self):
        _make_product(self.seller)
        _make_product(self.seller, status=Product.Status.DRAFT, title="Draft")
        resp = self.client.get("/api/products/")
        self.assertEqual(resp.status_code, 200)
        # Only active products are returned
        self.assertEqual(len(resp.json()), 1)

    def test_filter_by_category(self):
        _make_product(self.seller, category="digital")
        _make_product(self.seller, category="physical", title="Physical Thing")
        resp = self.client.get("/api/products/", {"category": "digital"})
        self.assertEqual(len(resp.json()), 1)

    def test_search_by_title(self):
        _make_product(self.seller, title="Rare Sword")
        _make_product(self.seller, title="Magic Shield")
        resp = self.client.get("/api/products/", {"search": "sword"})
        self.assertEqual(len(resp.json()), 1)

    def test_seller_can_create_product(self):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post("/api/products/", {
            "category": "digital",
            "title": "New Listing",
            "price": "1.0",
            "status": "active",
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Product.objects.count(), 1)

    def test_non_seller_cannot_create_product(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/products/", {
            "category": "digital",
            "title": "Blocked",
            "price": "1.0",
        })
        self.assertEqual(resp.status_code, 403)

    def test_owner_can_update_product(self):
        product = _make_product(self.seller)
        self.client.force_authenticate(user=self.seller)
        resp = self.client.patch(
            f"/api/products/{product.id}/",
            {"title": "Updated Title"},
        )
        self.assertEqual(resp.status_code, 200)
        product.refresh_from_db()
        self.assertEqual(product.title, "Updated Title")

    def test_non_owner_cannot_update(self):
        product = _make_product(self.seller)
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.patch(
            f"/api/products/{product.id}/",
            {"title": "Hacked"},
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_soft_delists(self):
        product = _make_product(self.seller)
        self.client.force_authenticate(user=self.seller)
        resp = self.client.delete(f"/api/products/{product.id}/")
        self.assertEqual(resp.status_code, 204)
        product.refresh_from_db()
        self.assertEqual(product.status, Product.Status.DELISTED)


# ===================================================================
# Phase 3 — Order Tests
# ===================================================================


class OrderTests(TestCase):
    """Tests for Order endpoints and state machine."""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)

    def test_buyer_can_place_order(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 2,
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["status"], "pending")
        self.assertEqual(Decimal(data["total_price"]), Decimal("1.00000000"))
        # Stock decremented
        self.product.refresh_from_db()
        self.assertEqual(self.product.quantity, 8)

    def test_cannot_order_inactive_product(self):
        self.product.status = Product.Status.DRAFT
        self.product.save()
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        })
        self.assertEqual(resp.status_code, 400)

    def test_cannot_order_more_than_stock(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 999,
        })
        self.assertEqual(resp.status_code, 400)

    def test_physical_requires_shipping_address(self):
        physical = _make_product(self.seller, category="physical", title="Box")
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": physical.id,
            "quantity": 1,
        })
        self.assertEqual(resp.status_code, 400)

        # With address
        resp = self.client.post("/api/orders/", {
            "product": physical.id,
            "quantity": 1,
            "shipping_address": "123 Main St",
        })
        self.assertEqual(resp.status_code, 201)

    def test_list_orders_buyer_and_seller(self):
        self.client.force_authenticate(user=self.buyer)
        self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        })
        # Buyer sees order
        resp = self.client.get("/api/orders/")
        self.assertEqual(len(resp.json()), 1)

        # Seller sees order
        self.client.force_authenticate(user=self.seller)
        resp = self.client.get("/api/orders/")
        self.assertEqual(len(resp.json()), 1)

    def test_client_cannot_mark_order_paid(self):
        """'paid' is only set by the escrow verify endpoint after an on-chain check."""
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        })
        order_id = resp.json()["id"]

        resp = self.client.patch(
            f"/api/orders/{order_id}/status/",
            {"status": "paid", "escrow_id": 7, "tx_hash": "0xdead"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.status, "pending")
        self.assertIsNone(order.escrow_id)

    def test_buyer_can_cancel_unpaid_order(self):
        self.client.force_authenticate(user=self.buyer)
        order_id = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        }).json()["id"]
        resp = self.client.patch(
            f"/api/orders/{order_id}/status/", {"status": "cancelled"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "cancelled")

    def test_invalid_status_transition_returns_400(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        })
        order_id = resp.json()["id"]

        # pending → shipped (invalid, must go through paid first)
        resp = self.client.patch(
            f"/api/orders/{order_id}/status/",
            {"status": "shipped"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_cannot_order(self):
        resp = self.client.post("/api/orders/", {
            "product": self.product.id,
            "quantity": 1,
        })
        self.assertEqual(resp.status_code, 401)

    def test_product_sold_out_when_stock_depleted(self):
        product = _make_product(self.seller, quantity=1, title="Last One")
        self.client.force_authenticate(user=self.buyer)
        self.client.post("/api/orders/", {
            "product": product.id,
            "quantity": 1,
        })
        product.refresh_from_db()
        self.assertEqual(product.quantity, 0)
        self.assertEqual(product.status, Product.Status.SOLD)


# ===================================================================
# Phase 5 — Escrow Endpoint Tests (USDC)
# ===================================================================

from unittest.mock import patch

from core.web3_service import EscrowError

_FAKE_CONFIG = {"chain_id": 84532, "chain_id_hex": "0x14a34", "escrow_address": "0xescrow"}
_FAKE_CALLS = {
    "approve": {"to": "0xusdc", "data": "0xapprove", "value": "0x0"},
    "create": {"to": "0xescrow", "data": "0xcreate", "value": "0x0"},
}


class OrderEscrowFieldsTests(TestCase):
    """Tests for the escrow fields on Order."""

    def test_order_has_escrow_fields(self):
        seller = _make_seller()
        buyer = _make_buyer()
        product = _make_product(seller)
        order = Order.objects.create(
            buyer=buyer, product=product, quantity=1, total_price=Decimal("0.5"),
        )
        self.assertIsNone(order.escrow_id)
        self.assertEqual(order.tx_hash, "")
        self.assertIsNone(order.escrow_amount_units)

    def test_order_escrow_fields_in_serializer(self):
        seller = _make_seller()
        buyer = _make_buyer()
        product = _make_product(seller)
        order = Order.objects.create(
            buyer=buyer, product=product, quantity=1, total_price=Decimal("0.5"),
            escrow_id=42, tx_hash="0xabc123", escrow_amount_units=1_234_567,
        )
        client = APIClient()
        client.force_authenticate(user=buyer)
        data = client.get(f"/api/orders/{order.id}/").json()
        self.assertEqual(data["escrow_id"], 42)
        self.assertEqual(data["tx_hash"], "0xabc123")
        self.assertEqual(data["escrow_amount_usdc"], "1.23")


class PhpToUsdcTests(TestCase):
    @patch("core.web3_service.get_php_per_usdc", return_value=Decimal("58"))
    def test_conversion_to_base_units(self, _rate):
        from core.web3_service import php_to_usdc_units
        self.assertEqual(php_to_usdc_units(Decimal("580")), 10_000_000)  # 10 USDC
        self.assertEqual(php_to_usdc_units(Decimal("1")), 17_241)        # 0.017241 USDC

    @patch("core.web3_service._fetch_live_rate", return_value=None)
    def test_falls_back_to_env_rate(self, _fetch):
        from django.core.cache import cache
        from core.web3_service import get_php_per_usdc
        cache.clear()
        with patch.dict("os.environ", {"PHP_PER_USDC": "60.5", "PRICE_FEED": "coingecko"}):
            self.assertEqual(get_php_per_usdc(), Decimal("60.5"))
        cache.clear()

    @patch("core.web3_service._fetch_live_rate", return_value=None)
    def test_no_rate_raises(self, _fetch):
        from django.core.cache import cache
        from core.web3_service import get_php_per_usdc
        cache.clear()
        with patch.dict("os.environ", {"PHP_PER_USDC": ""}):
            with self.assertRaises(EscrowError):
                get_php_per_usdc()


@patch("core.web3_service.get_public_config", return_value=_FAKE_CONFIG)
@patch("core.web3_service.build_create_escrow_calls", return_value=_FAKE_CALLS)
@patch("core.web3_service.get_php_per_usdc", return_value=Decimal("58"))
class EscrowCreateEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/create/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post("/api/orders/", {"product": self.product.id, "quantity": 1})
        self.order_id = resp.json()["id"]

    def test_returns_quote_and_calls(self, _rate, mock_build, _cfg):
        resp = self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["calls"], _FAKE_CALLS)
        order = Order.objects.get(pk=self.order_id)
        expected_units = int((order.total_price / Decimal("58") * 10**6).quantize(Decimal("1")))
        self.assertEqual(order.escrow_amount_units, expected_units)
        self.assertEqual(body["amount_units"], str(expected_units))
        mock_build.assert_called_once_with(
            order_id=order.id,
            seller_address=self.seller.wallet_address,
            amount_units=expected_units,
        )

    def test_quote_is_reused_within_ttl(self, mock_rate, _build, _cfg):
        self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        first = Order.objects.get(pk=self.order_id).escrow_amount_units
        mock_rate.return_value = Decimal("50")
        self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        self.assertEqual(Order.objects.get(pk=self.order_id).escrow_amount_units, first)

    def test_non_buyer_gets_403(self, *_):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        self.assertEqual(resp.status_code, 403)

    def test_duplicate_escrow_returns_400(self, *_):
        Order.objects.filter(pk=self.order_id).update(escrow_id=0)
        resp = self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_gets_401(self, *_):
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"/api/orders/{self.order_id}/escrow/create/")
        self.assertEqual(resp.status_code, 401)


class EscrowVerifyEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/verify/"""

    TX = "0x" + "ab" * 32

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("580"), escrow_amount_units=10_000_000,
        )
        self.client.force_authenticate(user=self.buyer)

    @patch("core.web3_service.verify_escrow_for_order")
    def test_marks_paid_when_chain_matches(self, mock_verify):
        mock_verify.return_value = {"escrow_id": 5, "amount_units": 10_000_000}
        resp = self.client.post(
            f"/api/orders/{self.order.id}/escrow/verify/", {"tx_hash": self.TX}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "paid")
        self.assertEqual(self.order.escrow_id, 5)
        self.assertEqual(self.order.tx_hash, self.TX)
        mock_verify.assert_called_once_with(
            order_id=self.order.id,
            buyer=self.buyer.wallet_address,
            seller=self.seller.wallet_address,
            min_amount_units=10_000_000,
        )

    @patch("core.web3_service.verify_escrow_for_order", side_effect=EscrowError("underpaid"))
    def test_rejects_mismatch(self, _verify):
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/verify/", {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "pending")
        self.assertIsNone(self.order.escrow_id)

    def test_rejects_bad_tx_hash(self):
        resp = self.client.post(
            f"/api/orders/{self.order.id}/escrow/verify/", {"tx_hash": "nope"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_seller_cannot_verify(self):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/verify/", {}, format="json")
        self.assertEqual(resp.status_code, 403)


class EscrowSyncEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/sync/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("580"), escrow_id=3, status="delivered",
        )

    def _chain(self, status, order_id=None):
        return {"status": status, "order_id": order_id or self.order.id,
                "buyer": self.buyer.wallet_address}

    def test_complete_on_chain_marks_completed(self):
        self.client.force_authenticate(user=self.buyer)
        with patch("core.web3_service.get_escrow_status", return_value=self._chain("complete")):
            resp = self.client.post(f"/api/orders/{self.order.id}/escrow/sync/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "completed")

    def test_refunded_on_chain_marks_cancelled(self):
        self.client.force_authenticate(user=self.seller)
        with patch("core.web3_service.get_escrow_status", return_value=self._chain("refunded")):
            resp = self.client.post(f"/api/orders/{self.order.id}/escrow/sync/")
        self.assertEqual(resp.json()["status"], "cancelled")

    def test_open_escrow_leaves_status(self):
        self.client.force_authenticate(user=self.buyer)
        with patch("core.web3_service.get_escrow_status", return_value=self._chain("awaiting_delivery")):
            resp = self.client.post(f"/api/orders/{self.order.id}/escrow/sync/")
        self.assertEqual(resp.json()["status"], "delivered")

    def test_escrow_of_another_order_is_ignored(self):
        self.client.force_authenticate(user=self.buyer)
        other = self._chain("complete", order_id=self.order.id + 999)
        with patch("core.web3_service.get_escrow_status", return_value=other):
            resp = self.client.post(f"/api/orders/{self.order.id}/escrow/sync/")
        self.assertEqual(resp.status_code, 409)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "delivered")


@patch("core.web3_service.get_public_config", return_value=_FAKE_CONFIG)
class EscrowConfirmEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/confirm/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("0.5"), escrow_id=0,
        )

    @patch("core.web3_service.build_confirm_delivery_call")
    def test_returns_unsigned_tx(self, mock_build, _cfg):
        mock_build.return_value = {"to": "0xcontract", "data": "0x..."}
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/confirm/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("transaction", resp.json())
        mock_build.assert_called_once_with(0)

    def test_no_escrow_returns_400(self, _cfg):
        self.order.escrow_id = None
        self.order.save()
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/confirm/")
        self.assertEqual(resp.status_code, 400)


@patch("core.web3_service.get_public_config", return_value=_FAKE_CONFIG)
class EscrowRefundEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/refund/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("0.5"), escrow_id=2, status="paid",
        )

    @patch("core.web3_service.build_refund_call", return_value={"to": "0xc", "data": "0x"})
    def test_seller_gets_refund_call(self, _b, _cfg):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/refund/")
        self.assertEqual(resp.status_code, 200)

    def test_buyer_cannot_refund(self, _cfg):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/refund/")
        self.assertEqual(resp.status_code, 403)

    def test_funded_order_cannot_be_cancelled_via_status(self, _cfg):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.patch(
            f"/api/orders/{self.order.id}/status/", {"status": "cancelled"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)


class EscrowDisputeEndpointTests(TestCase):
    """Tests for POST /api/orders/<id>/escrow/dispute/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("0.5"), escrow_id=0,
        )

    @patch("core.web3_service.build_dispute_call", return_value={"to": "0xc", "data": "0x"})
    def test_buyer_can_dispute(self, _b):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/dispute/")
        self.assertEqual(resp.status_code, 200)

    @patch("core.web3_service.build_dispute_call", return_value={"to": "0xc", "data": "0x"})
    def test_seller_can_dispute(self, _b):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/dispute/")
        self.assertEqual(resp.status_code, 200)

    def test_stranger_gets_403(self):
        stranger = User.objects.create_user(wallet_address=f"0x{'cc' * 20}")
        self.client.force_authenticate(user=stranger)
        resp = self.client.post(f"/api/orders/{self.order.id}/escrow/dispute/")
        self.assertEqual(resp.status_code, 403)


class EscrowStatusEndpointTests(TestCase):
    """Tests for GET /api/orders/<id>/escrow/status/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("0.5"), escrow_id=0,
        )

    @patch("core.web3_service.get_escrow_status")
    def test_returns_on_chain_status(self, mock_status):
        mock_status.return_value = {
            "buyer": "0xbuyer", "seller": "0xseller",
            "amount_units": 500000, "amount_usdc": "0.50",
            "status": "awaiting_delivery",
        }
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.get(f"/api/orders/{self.order.id}/escrow/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["escrow"]["status"], "awaiting_delivery")

    def test_no_escrow_returns_400(self):
        self.order.escrow_id = None
        self.order.save()
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.get(f"/api/orders/{self.order.id}/escrow/status/")
        self.assertEqual(resp.status_code, 400)


class ReleaseExpiredEndpointTests(TestCase):
    """POST /api/internal/release-expired/ is only callable with CRON_SECRET."""

    URL = "/api/internal/release-expired/"

    def test_rejects_missing_or_wrong_secret(self):
        with self.settings(CRON_SECRET="s3cret"):
            self.assertEqual(APIClient().post(self.URL).status_code, 403)
            resp = APIClient().post(self.URL, HTTP_AUTHORIZATION="Bearer nope")
            self.assertEqual(resp.status_code, 403)

    def test_disabled_when_secret_unset(self):
        with self.settings(CRON_SECRET=""):
            resp = APIClient().post(self.URL, HTTP_AUTHORIZATION="Bearer ")
            self.assertEqual(resp.status_code, 403)

    @patch("core.escrow_jobs.release_expired_escrows")
    def test_runs_job_with_correct_secret(self, mock_job):
        mock_job.return_value = {"released": 1, "synced": 2, "log": [], "errors": []}
        with self.settings(CRON_SECRET="s3cret"):
            resp = APIClient().post(self.URL, HTTP_AUTHORIZATION="Bearer s3cret")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"released": 1, "synced": 2, "errors": []})


class EscrowDisputeOnChainTests(TestCase):
    """Opening/resolving disputes moves the on-chain escrow via the arbiter key."""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product, quantity=1,
            total_price=Decimal("580"), escrow_id=9, status="shipped",
        )
        self.admin = User.objects.create_superuser(wallet_address=f"0x{'ad' * 20}", password="x")

    def _open(self):
        self.client.force_authenticate(user=self.buyer)
        return self.client.post(
            f"/api/orders/{self.order.id}/dispute/",
            {"reason": "not_received", "description": "Never arrived"},
            format="json",
        )

    @patch("core.web3_service.freeze_escrow_on_chain", return_value="0xfreeze")
    @patch("core.web3_service.get_escrow_status", return_value={"status": "awaiting_delivery"})
    def test_open_dispute_freezes_escrow(self, _s, mock_freeze):
        resp = self._open()
        self.assertEqual(resp.status_code, 201)
        mock_freeze.assert_called_once_with(9)
        self.assertNotIn("warning", resp.json())

    @patch("core.web3_service.freeze_escrow_on_chain", side_effect=ConnectionError("rpc down"))
    @patch("core.web3_service.get_escrow_status", return_value={"status": "awaiting_delivery"})
    def test_freeze_failure_is_reported(self, _s, _f):
        resp = self._open()
        self.assertEqual(resp.status_code, 201)
        self.assertIn("warning", resp.json())

    @patch("core.web3_service.resolve_dispute_on_chain", side_effect=ConnectionError("rpc down"))
    @patch("core.web3_service.get_escrow_status", return_value={"status": "disputed"})
    @patch("core.web3_service.freeze_escrow_on_chain", return_value="0xfreeze")
    def test_failed_chain_resolution_keeps_dispute_open(self, _f, _s, _r):
        dispute_id = self._open().json()["id"]
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/disputes/{dispute_id}/resolve/", {"resolution": "refund_buyer"}, format="json"
        )
        self.assertEqual(resp.status_code, 502)
        self.assertEqual(Dispute.objects.get(pk=dispute_id).resolution, "pending")

    @patch("core.web3_service.resolve_dispute_on_chain", return_value="0xresolve")
    @patch("core.web3_service.get_escrow_status", return_value={"status": "disputed"})
    @patch("core.web3_service.freeze_escrow_on_chain", return_value="0xfreeze")
    def test_resolution_pays_out_on_chain(self, _f, _s, mock_resolve):
        dispute_id = self._open().json()["id"]
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/disputes/{dispute_id}/resolve/", {"resolution": "pay_seller"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        mock_resolve.assert_called_once_with(9, refund_buyer=False)
        self.assertEqual(resp.json()["resolve_tx_hash"], "0xresolve")


# ===================================================================
# Phase 6 — Dispute & Dashboard Tests
# ===================================================================

from core.models import Dispute, DisputeEvidence


class OpenDisputeTests(TestCase):
    """Tests for POST/GET /api/orders/<id>/dispute/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer,
            product=self.product,
            quantity=1,
            total_price=Decimal("0.5"),
            status="delivered",
        )

    def test_buyer_can_open_dispute(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/dispute/", {
            "reason": "not_received",
            "description": "I never got the item.",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["reason"], "not_received")
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "disputed")

    def test_seller_can_open_dispute(self):
        self.client.force_authenticate(user=self.seller)
        resp = self.client.post(f"/api/orders/{self.order.id}/dispute/", {
            "reason": "unauthorized",
            "description": "Chargeback fraud.",
        }, format="json")
        self.assertEqual(resp.status_code, 201)

    def test_stranger_cannot_open_dispute(self):
        stranger = User.objects.create_user(wallet_address=f"0x{'dd' * 20}")
        self.client.force_authenticate(user=stranger)
        resp = self.client.post(f"/api/orders/{self.order.id}/dispute/", {
            "reason": "other",
            "description": "test",
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_cannot_dispute_pending_order(self):
        self.order.status = "pending"
        self.order.save()
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/dispute/", {
            "reason": "other",
            "description": "test",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_cannot_duplicate_dispute(self):
        Dispute.objects.create(
            order=self.order, opened_by=self.buyer,
            reason="other", description="first",
        )
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(f"/api/orders/{self.order.id}/dispute/", {
            "reason": "other",
            "description": "second",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_get_dispute_details(self):
        dispute = Dispute.objects.create(
            order=self.order, opened_by=self.buyer,
            reason="damaged", description="Broken screen",
        )
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.get(f"/api/orders/{self.order.id}/dispute/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["reason"], "damaged")

    def test_get_no_dispute_returns_404(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.get(f"/api/orders/{self.order.id}/dispute/")
        self.assertEqual(resp.status_code, 404)


class DisputeEvidenceTests(TestCase):
    """Tests for POST /api/disputes/<id>/evidence/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product,
            quantity=1, total_price=Decimal("0.5"), status="disputed",
        )
        self.dispute = Dispute.objects.create(
            order=self.order, opened_by=self.buyer,
            reason="damaged", description="Broken",
        )

    def test_buyer_can_upload_evidence(self):
        self.client.force_authenticate(user=self.buyer)
        from io import BytesIO
        from PIL import Image
        img = Image.new("RGB", (100, 100), color="red")
        buf = BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        buf.name = "evidence.png"
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/evidence/",
            {"file": buf, "description": "Photo of damage"},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

    def test_stranger_cannot_upload(self):
        stranger = User.objects.create_user(wallet_address=f"0x{'dd' * 20}")
        self.client.force_authenticate(user=stranger)
        from io import BytesIO
        buf = BytesIO(b"fake")
        buf.name = "evidence.txt"
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/evidence/",
            {"file": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403)

    def test_cannot_upload_to_resolved_dispute(self):
        self.dispute.resolution = Dispute.Resolution.REFUND_BUYER
        self.dispute.save()
        self.client.force_authenticate(user=self.buyer)
        from io import BytesIO
        buf = BytesIO(b"fake")
        buf.name = "evidence.txt"
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/evidence/",
            {"file": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)


class DisputeResolveTests(TestCase):
    """Tests for POST /api/disputes/<id>/resolve/"""

    def setUp(self):
        self.client = APIClient()
        self.seller = _make_seller()
        self.buyer = _make_buyer()
        self.admin = User.objects.create_superuser(
            wallet_address=f"0x{'ee' * 20}", password="nasju0465",
        )
        self.product = _make_product(self.seller)
        self.order = Order.objects.create(
            buyer=self.buyer, product=self.product,
            quantity=1, total_price=Decimal("0.5"), status="disputed",
        )
        self.dispute = Dispute.objects.create(
            order=self.order, opened_by=self.buyer,
            reason="not_received", description="Missing",
        )

    def test_admin_can_resolve_refund_buyer(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/resolve/",
            {"resolution": "refund_buyer", "admin_notes": "Buyer is right."},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.resolution, "refund_buyer")
        self.assertIsNotNone(self.dispute.resolved_at)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "completed")

    def test_admin_can_resolve_pay_seller(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/resolve/",
            {"resolution": "pay_seller"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.resolution, "pay_seller")

    def test_non_admin_gets_403(self):
        self.client.force_authenticate(user=self.buyer)
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/resolve/",
            {"resolution": "refund_buyer"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_cannot_resolve_twice(self):
        self.dispute.resolution = Dispute.Resolution.REFUND_BUYER
        self.dispute.save()
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f"/api/disputes/{self.dispute.id}/resolve/",
            {"resolution": "pay_seller"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)


class AdminDashboardTests(TestCase):
    """Tests for GET /api/admin/dashboard/"""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            wallet_address=f"0x{'ff' * 20}", password="nasju0465",
        )

    def test_admin_gets_dashboard(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/dashboard/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("users", data)
        self.assertIn("products", data)
        self.assertIn("orders", data)
        self.assertIn("disputes", data)
        self.assertIn("kyc", data)

    def test_non_admin_gets_403(self):
        user = User.objects.create_user(wallet_address=f"0x{'11' * 20}")
        self.client.force_authenticate(user=user)
        resp = self.client.get("/api/admin/dashboard/")
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_gets_401(self):
        resp = self.client.get("/api/admin/dashboard/")
        self.assertEqual(resp.status_code, 401)

    def test_dashboard_counts_are_correct(self):
        seller = _make_seller()
        buyer = _make_buyer()
        _make_product(seller, status="draft")
        _make_product(seller, status="active", title="Active One")
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/dashboard/")
        data = resp.json()
        # admin + seller + buyer = 3 users
        self.assertEqual(data["users"]["total"], 3)
        self.assertEqual(data["users"]["sellers"], 1)
        self.assertEqual(data["products"]["total"], 2)
        self.assertEqual(data["products"]["active"], 1)
