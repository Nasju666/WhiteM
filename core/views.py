from django.db.models import Q, Sum, Count
from django.utils import timezone
from rest_framework import filters, generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .authentication import verify_signature
from .models import Dispute, DisputeEvidence, KYCDocument, Order, Product, ProductImage, SellerReview, User
from .permissions import IsAdminUser, IsApprovedSeller, IsBuyerOrSeller, IsOwnerOrReadOnly
from .serializers import (
    DisputeEvidenceSerializer,
    DisputeResolveSerializer,
    DisputeSerializer,
    KYCDocumentSerializer,
    NonceRequestSerializer,
    OrderSerializer,
    OrderStatusSerializer,
    ProductImageSerializer,
    ProductListSerializer,
    ProductSerializer,
    SellerReviewSerializer,
    UserSerializer,
    VerifySignatureSerializer,
)


# ---------------------------------------------------------------------------
# Auth views (Phase 2 — unchanged)
# ---------------------------------------------------------------------------


class NonceView(APIView):
    """
    GET /api/auth/nonce/?wallet=0x...
    Returns the nonce for the given wallet address.
    Creates the user on first visit.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        serializer = NonceRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        wallet = serializer.validated_data["wallet"]

        user, _created = User.objects.get_or_create(wallet_address=wallet)
        return Response({"nonce": str(user.nonce)})


class VerifySignatureView(APIView):
    """
    POST /api/auth/verify/
    Body: { "wallet": "0x...", "signature": "0x..." }
    Verifies the MetaMask signature, rotates the nonce,
    and returns JWT access + refresh tokens.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifySignatureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        wallet = serializer.validated_data["wallet"]
        signature = serializer.validated_data["signature"]

        try:
            user = User.objects.get(wallet_address=wallet)
        except User.DoesNotExist:
            return Response(
                {"detail": "Wallet not found. Request a nonce first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not verify_signature(wallet, str(user.nonce), signature):
            return Response(
                {"detail": "Invalid signature."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Rotate nonce so the same signature can't be replayed
        user.rotate_nonce()

        # Issue JWT tokens
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class ProfileView(APIView):
    """
    GET  /api/auth/profile/  — returns the authenticated user's profile.
    PATCH /api/auth/profile/ — updates personal info fields.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        allowed = ["full_name", "email_address", "phone_number", "date_of_birth"]
        for field in allowed:
            if field in request.data:
                setattr(user, field, request.data[field] or "")
        user.save(update_fields=[f for f in allowed if f in request.data])
        return Response(UserSerializer(user).data)


class KYCListView(APIView):
    """
    GET /api/kyc/
    Returns the authenticated user's own KYC documents.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        docs = KYCDocument.objects.filter(user=request.user).order_by("-uploaded_at")
        data = [
            {
                "id": d.id,
                "document_type": d.document_type,
                "file": request.build_absolute_uri(d.file.url) if d.file else None,
                "status": d.status,
                "notes": d.notes,
                "uploaded_at": d.uploaded_at,
                "reviewed_at": d.reviewed_at,
            }
            for d in docs
        ]
        return Response(data)


class KYCUploadView(APIView):
    """
    POST /api/kyc/upload/
    Accepts multipart form with:
      - document_type, file (KYC document)
      - full_name, email_address, phone_number, date_of_birth (optional personal info)
    Creates KYC doc and updates user personal info + kyc_status.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = KYCDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)

        # Update personal info if provided
        user = request.user
        info_fields = ["full_name", "email_address", "phone_number", "date_of_birth"]
        updated = []
        for field in info_fields:
            if field in request.data and request.data[field]:
                setattr(user, field, request.data[field])
                updated.append(field)

        # Set KYC status to pending
        if user.kyc_status != "approved":
            user.kyc_status = "pending"
            updated.append("kyc_status")

        if updated:
            user.save(update_fields=updated)

        return Response(
            {"detail": "KYC document uploaded successfully.", "kyc_status": user.kyc_status},
            status=status.HTTP_201_CREATED,
        )



# ---------------------------------------------------------------------------
# Phase 3 — Product views
# ---------------------------------------------------------------------------


class ProductListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/products/         — browse active listings (anyone)
    POST /api/products/         — create a listing (approved sellers only)

    Query params:
      ?category=physical|digital|game_account
      ?search=<term>   (searches title)
    """

    filter_backends = [filters.SearchFilter]
    search_fields = ["title"]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return ProductListSerializer
        return ProductSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsApprovedSeller()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = Product.objects.select_related("seller")
        # For browsing, only show active products
        if self.request.method == "GET":
            qs = qs.filter(status=Product.Status.ACTIVE)
            category = self.request.query_params.get("category")
            if category:
                qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        serializer.save(seller=self.request.user)


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/products/<id>/  — product detail (anyone)
    PUT    /api/products/<id>/  — update listing (owner only)
    PATCH  /api/products/<id>/  — partial update (owner only)
    DELETE /api/products/<id>/  — delist product (owner only)
    """

    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]
    queryset = Product.objects.select_related("seller")

    def perform_destroy(self, instance):
        """Soft-delete: set status to delisted instead of removing."""
        instance.status = Product.Status.DELISTED
        instance.save(update_fields=["status", "updated_at"])


class ProductImageUploadView(APIView):
    """
    POST /api/products/<pk>/images/  — upload one or more images (owner only)
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        product = generics.get_object_or_404(Product, pk=pk)
        if product.seller != request.user:
            return Response({"detail": "Not the owner."}, status=status.HTTP_403_FORBIDDEN)

        files = request.FILES.getlist("images")
        if not files:
            return Response({"detail": "No images provided."}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > 10:
            return Response({"detail": "Maximum 10 images per listing."}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        base_order = product.images.count()
        for i, f in enumerate(files):
            img = ProductImage.objects.create(product=product, image=f, order=base_order + i)
            created.append(ProductImageSerializer(img, context={"request": request}).data)

        return Response(created, status=status.HTTP_201_CREATED)


class ProductImageDeleteView(APIView):
    """
    DELETE /api/products/<pk>/images/<img_id>/  — remove a single image (owner only)
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, img_id):
        img = generics.get_object_or_404(ProductImage, pk=img_id, product_id=pk)
        if img.product.seller != request.user:
            return Response({"detail": "Not the owner."}, status=status.HTTP_403_FORBIDDEN)
        img.image.delete(save=False)
        img.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Phase 3 — Order views
# ---------------------------------------------------------------------------


class OrderListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/orders/   — list orders where user is buyer OR seller
    POST /api/orders/   — place a new order
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return (
            Order.objects.select_related("product", "product__seller", "buyer")
            .filter(Q(buyer=user) | Q(product__seller=user))
        )

    def perform_create(self, serializer):
        product = serializer.validated_data["product"]
        qty = serializer.validated_data.get("quantity", 1)

        serializer.save(buyer=self.request.user)

        # Decrement stock
        product.quantity -= qty
        if product.quantity <= 0:
            product.status = Product.Status.SOLD
        product.save(update_fields=["quantity", "status", "updated_at"])


class OrderDetailView(generics.RetrieveAPIView):
    """
    GET /api/orders/<id>/  — order detail (buyer or seller only)
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated, IsBuyerOrSeller]
    queryset = Order.objects.select_related("product", "product__seller", "buyer")


class OrderStatusView(APIView):
    """
    PATCH /api/orders/<id>/status/
    Body: { "status": "paid" }
    Transitions order status (buyer or seller only).
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response(
                {"detail": "Order not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only buyer or seller may transition
        is_buyer = order.buyer == request.user
        is_seller = order.product.seller == request.user
        if not is_buyer and not is_seller:
            return Response(
                {"detail": "Not authorized."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = OrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]

        # Role-based transition enforcement:
        # Only the buyer can pay, complete, or dispute.
        # Only the seller can ship or mark delivered.
        BUYER_ONLY = {"paid", "delivered", "completed", "disputed"}
        SELLER_ONLY = {"shipped"}
        if new_status in BUYER_ONLY and not is_buyer:
            return Response(
                {"detail": "Only the buyer can perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if new_status in SELLER_ONLY and not is_seller:
            return Response(
                {"detail": "Only the seller can perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )
        tracking = serializer.validated_data.get("tracking_number")
        tx_hash = serializer.validated_data.get("tx_hash")
        escrow_id = serializer.validated_data.get("escrow_id")

        try:
            order.transition_status(new_status)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = []
        if tracking:
            order.tracking_number = tracking
            update_fields.append("tracking_number")
        if tx_hash:
            order.tx_hash = tx_hash
            update_fields.append("tx_hash")
        if escrow_id is not None:
            order.escrow_id = escrow_id
            update_fields.append("escrow_id")
        if update_fields:
            order.save(update_fields=update_fields)

        return Response(OrderSerializer(order).data)


# ---------------------------------------------------------------------------
# Phase 5 — Escrow views (Web3 integration)
# ---------------------------------------------------------------------------


class EscrowCreateView(APIView):
    """
    POST /api/orders/<id>/escrow/create/
    Returns an unsigned transaction for the buyer to create an on-chain escrow.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.buyer != request.user:
            return Response({"detail": "Only the buyer can create an escrow."}, status=status.HTTP_403_FORBIDDEN)

        if order.escrow_id is not None:
            return Response({"detail": "Escrow already exists for this order."}, status=status.HTTP_400_BAD_REQUEST)

        from .web3_service import build_create_escrow_tx
        from web3 import Web3
        from decimal import Decimal

        # ₱1 = 0.00001 ETH (must match frontend PHP_TO_ETH_RATE in escrow.js)
        PHP_TO_ETH_RATE = Decimal("0.00001")
        amount_eth = Decimal(str(order.total_price)) * PHP_TO_ETH_RATE
        amount_wei = Web3.to_wei(amount_eth, "ether")
        try:
            tx = build_create_escrow_tx(
                buyer_address=order.buyer.wallet_address,
                seller_address=order.product.seller.wallet_address,
                amount_wei=amount_wei,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"transaction": tx, "order_id": order.id})


class EscrowConfirmView(APIView):
    """
    POST /api/orders/<id>/escrow/confirm/
    Returns unsigned tx for buyer to confirm delivery (release funds to seller).
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.buyer != request.user:
            return Response({"detail": "Only the buyer can confirm delivery."}, status=status.HTTP_403_FORBIDDEN)

        if order.escrow_id is None:
            return Response({"detail": "No escrow linked to this order."}, status=status.HTTP_400_BAD_REQUEST)

        from .web3_service import build_confirm_delivery_tx

        try:
            tx = build_confirm_delivery_tx(
                buyer_address=order.buyer.wallet_address,
                escrow_id=order.escrow_id,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"transaction": tx, "order_id": order.id})


class EscrowDisputeView(APIView):
    """
    POST /api/orders/<id>/escrow/dispute/
    Returns unsigned tx for buyer or seller to raise a dispute.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.buyer != request.user and order.product.seller != request.user:
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        if order.escrow_id is None:
            return Response({"detail": "No escrow linked to this order."}, status=status.HTTP_400_BAD_REQUEST)

        from .web3_service import build_dispute_tx

        try:
            tx = build_dispute_tx(
                caller_address=request.user.wallet_address,
                escrow_id=order.escrow_id,
            )
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"transaction": tx, "order_id": order.id})


class EscrowStatusView(APIView):
    """
    GET /api/orders/<id>/escrow/status/
    Reads on-chain escrow state.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.buyer != request.user and order.product.seller != request.user:
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        if order.escrow_id is None:
            return Response({"detail": "No escrow linked to this order."}, status=status.HTTP_400_BAD_REQUEST)

        from .web3_service import get_escrow_status

        try:
            escrow_data = get_escrow_status(order.escrow_id)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response({"order_id": order.id, "escrow": escrow_data})


# ---------------------------------------------------------------------------
# Phase 6 — Dispute views
# ---------------------------------------------------------------------------


class OpenDisputeView(APIView):
    """
    POST /api/orders/<id>/dispute/
    Opens a dispute on an order. Only buyer or seller.
    Body: { "reason": "not_received", "description": "..." }
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.buyer != request.user and order.product.seller != request.user:
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        if hasattr(order, "dispute"):
            return Response({"detail": "Dispute already exists."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate allowed order statuses for dispute (delivered or shipped)
        if order.status not in ("delivered", "shipped", "paid"):
            return Response(
                {"detail": f"Cannot dispute an order with status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = DisputeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dispute = Dispute.objects.create(
            order=order,
            opened_by=request.user,
            reason=serializer.validated_data["reason"],
            description=serializer.validated_data["description"],
        )

        # Transition order to disputed
        order.status = Order.Status.DISPUTED
        order.save(update_fields=["status", "updated_at"])

        return Response(DisputeSerializer(dispute).data, status=status.HTTP_201_CREATED)

    def get(self, request, pk):
        """GET /api/orders/<id>/dispute/ — view dispute details."""
        try:
            order = Order.objects.select_related("product__seller", "buyer").get(pk=pk)
        except Order.DoesNotExist:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if (
            order.buyer != request.user
            and order.product.seller != request.user
            and not request.user.is_staff
        ):
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        if not hasattr(order, "dispute"):
            return Response({"detail": "No dispute on this order."}, status=status.HTTP_404_NOT_FOUND)

        dispute = order.dispute
        return Response(DisputeSerializer(dispute).data)


class DisputeEvidenceUploadView(APIView):
    """
    POST /api/disputes/<id>/evidence/
    Upload evidence for a dispute. Buyer or seller only.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, dispute_id):
        try:
            dispute = Dispute.objects.select_related(
                "order__buyer", "order__product__seller"
            ).get(pk=dispute_id)
        except Dispute.DoesNotExist:
            return Response({"detail": "Dispute not found."}, status=status.HTTP_404_NOT_FOUND)

        order = dispute.order
        if order.buyer != request.user and order.product.seller != request.user:
            return Response({"detail": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

        if dispute.resolution != Dispute.Resolution.PENDING:
            return Response({"detail": "Dispute already resolved."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DisputeEvidenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(dispute=dispute, uploaded_by=request.user)

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DisputeResolveView(APIView):
    """
    POST /api/disputes/<id>/resolve/
    Admin resolves a dispute. Triggers on-chain escrow resolution if available.
    Body: { "resolution": "refund_buyer" | "pay_seller", "admin_notes": "..." }
    """

    permission_classes = [IsAdminUser]

    def post(self, request, dispute_id):
        try:
            dispute = Dispute.objects.select_related(
                "order__buyer", "order__product__seller"
            ).get(pk=dispute_id)
        except Dispute.DoesNotExist:
            return Response({"detail": "Dispute not found."}, status=status.HTTP_404_NOT_FOUND)

        if dispute.resolution != Dispute.Resolution.PENDING:
            return Response({"detail": "Dispute already resolved."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DisputeResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resolution = serializer.validated_data["resolution"]
        admin_notes = serializer.validated_data.get("admin_notes", "")

        dispute.resolution = resolution
        dispute.admin_notes = admin_notes
        dispute.resolved_by = request.user
        dispute.resolved_at = timezone.now()
        dispute.save()

        # Update order status to completed (dispute resolved)
        order = dispute.order
        order.status = Order.Status.COMPLETED
        order.save(update_fields=["status", "updated_at"])

        # Release escrow funds on-chain if an escrow exists for this order
        escrow_id = order.escrow_id
        if escrow_id is not None:
            try:
                from .web3_service import resolve_dispute_on_chain
                refund_buyer = (resolution == "refund_buyer")
                resolve_dispute_on_chain(escrow_id, refund_buyer)
            except Exception as exc:
                # DB is already updated; log and surface warning but don't fail
                import logging
                logging.getLogger(__name__).error(
                    "On-chain dispute resolution failed for escrow %s: %s", escrow_id, exc
                )
                data = DisputeSerializer(dispute).data
                data["warning"] = f"DB updated but on-chain call failed: {exc}"
                return Response(data, status=status.HTTP_207_MULTI_STATUS)

        return Response(DisputeSerializer(dispute).data)


class AdminDashboardView(APIView):
    """
    GET /api/admin/dashboard/
    Returns platform-wide statistics for admin monitoring.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        total_users = User.objects.count()
        total_sellers = User.objects.filter(is_seller=True).count()
        total_products = Product.objects.count()
        active_products = Product.objects.filter(status=Product.Status.ACTIVE).count()

        total_orders = Order.objects.count()
        orders_by_status = dict(
            Order.objects.values_list("status").annotate(count=Count("id")).values_list("status", "count")
        )

        total_revenue = Order.objects.filter(
            status__in=["completed", "delivered"]
        ).aggregate(total=Sum("total_price"))["total"] or 0

        total_disputes = Dispute.objects.count()
        pending_disputes = Dispute.objects.filter(resolution=Dispute.Resolution.PENDING).count()
        pending_kyc = KYCDocument.objects.filter(status=KYCDocument.Status.PENDING).count()

        return Response({
            "users": {
                "total": total_users,
                "sellers": total_sellers,
            },
            "products": {
                "total": total_products,
                "active": active_products,
            },
            "orders": {
                "total": total_orders,
                "by_status": orders_by_status,
                "total_revenue_eth": str(total_revenue),
            },
            "disputes": {
                "total": total_disputes,
                "pending": pending_disputes,
            },
            "kyc": {
                "pending_reviews": pending_kyc,
            },
        })


# ---------------------------------------------------------------------------
# Admin — KYC Management
# ---------------------------------------------------------------------------


class AdminKYCListView(APIView):
    """
    GET /api/admin/kyc/?status=pending
    List KYC submissions grouped by user.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = KYCDocument.objects.select_related("user").order_by("-uploaded_at")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Group documents by user
        from collections import OrderedDict
        grouped = OrderedDict()
        for doc in qs:
            uid = doc.user.id
            if uid not in grouped:
                grouped[uid] = {
                    "user_id": uid,
                    "user_wallet": doc.user.wallet_address,
                    "full_name": doc.user.full_name,
                    "email_address": doc.user.email_address,
                    "phone_number": doc.user.phone_number,
                    "date_of_birth": str(doc.user.date_of_birth) if doc.user.date_of_birth else None,
                    "kyc_status": doc.user.kyc_status,
                    "documents": [],
                }
            grouped[uid]["documents"].append({
                "id": doc.id,
                "document_type": doc.document_type,
                "file": request.build_absolute_uri(doc.file.url) if doc.file else None,
                "status": doc.status,
                "notes": doc.notes,
                "uploaded_at": doc.uploaded_at,
                "reviewed_at": doc.reviewed_at,
            })

        # Determine overall status for each group.
        # Priority: pending > rejected > approved
        # (if a user resubmitted after rejection they'll have both pending and
        # rejected docs — we want to surface them as pending so admin can review)
        for g in grouped.values():
            statuses = [d["status"] for d in g["documents"]]
            if any(s == "pending" for s in statuses):
                g["overall_status"] = "pending"
            elif any(s == "rejected" for s in statuses):
                g["overall_status"] = "rejected"
            elif all(s == "approved" for s in statuses):
                g["overall_status"] = "approved"
            else:
                g["overall_status"] = statuses[0] if statuses else "pending"

        return Response(list(grouped.values()))


class AdminKYCReviewView(APIView):
    """
    PATCH /api/admin/kyc/<user_id>/
    Body: { "status": "approved" | "rejected", "notes": "..." }
    Approve or reject ALL KYC documents for a user.
    """

    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        # pk is the user_id
        from core.models import User
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        docs = KYCDocument.objects.filter(user=user)
        if not docs.exists():
            return Response({"detail": "No KYC documents found."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get("status")
        if new_status not in ("approved", "rejected"):
            return Response(
                {"detail": "Status must be 'approved' or 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        notes = request.data.get("notes", "")
        now = timezone.now()

        # Update ALL docs for this user
        docs.update(status=new_status, notes=notes, reviewed_at=now)

        # Auto-update user seller status
        if new_status == "approved":
            user.kyc_status = "approved"
            user.is_seller = True
        else:
            user.kyc_status = "rejected"
            user.is_seller = False
        user.save(update_fields=["kyc_status", "is_seller"])

        return Response({
            "user_id": user.id,
            "status": new_status,
            "notes": notes,
            "user_wallet": user.wallet_address,
            "user_kyc_status": user.kyc_status,
            "user_is_seller": user.is_seller,
        })


# ---------------------------------------------------------------------------
# Admin — Dispute Management
# ---------------------------------------------------------------------------


class AdminDisputeListView(APIView):
    """
    GET /api/admin/disputes/?resolution=pending
    List all disputes with order info.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            qs = Dispute.objects.select_related(
                "order", "order__buyer", "order__product", "order__product__seller",
                "opened_by", "resolved_by"
            ).order_by("-created_at")

            resolution_filter = request.query_params.get("resolution")
            if resolution_filter:
                qs = qs.filter(resolution=resolution_filter)

            data = []
            for d in qs:
                evidence_list = []
                for ev in d.evidence.select_related("uploaded_by").all():
                    evidence_list.append({
                        "id": ev.id,
                        "file": request.build_absolute_uri(ev.file.url) if ev.file else None,
                        "description": ev.description,
                        "uploader_wallet": ev.uploaded_by.wallet_address,
                        "uploaded_at": ev.uploaded_at,
                    })
                data.append({
                    "id": d.id,
                    "order_id": d.order.id,
                    "product_id": d.order.product.id,
                    "product_title": d.order.product.title,
                    "buyer_wallet": d.order.buyer.wallet_address,
                    "seller_wallet": d.order.product.seller.wallet_address,
                    "total_price": str(d.order.total_price),
                    "reason": d.reason,
                    "description": d.description,
                    "resolution": d.resolution,
                    "admin_notes": d.admin_notes,
                    "opened_by_wallet": d.opened_by.wallet_address,
                    "resolved_by_wallet": d.resolved_by.wallet_address if d.resolved_by else None,
                    "created_at": d.created_at,
                    "resolved_at": d.resolved_at,
                    "evidence": evidence_list,
                })
            return Response(data)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------------------------------------------------------------------------
# Seller — My Products
# ---------------------------------------------------------------------------


class SellerProductsView(APIView):
    """
    GET /api/seller/products/
    Returns all products owned by the authenticated seller (any status).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        products = Product.objects.filter(seller=request.user).order_by("-created_at")
        serializer = ProductListSerializer(products, many=True, context={"request": request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


class SellerReviewListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/sellers/<wallet>/reviews/  — list all reviews for a seller
    POST /api/reviews/                   — submit a review (buyer of completed order)
    """

    serializer_class = SellerReviewSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        wallet = self.kwargs.get("wallet")
        qs = SellerReview.objects.select_related("reviewer", "seller")
        if wallet:
            qs = qs.filter(seller__wallet_address=wallet)
        return qs

    def perform_create(self, serializer):
        serializer.save()


class SellerReviewStatsView(APIView):
    """
    GET /api/sellers/<wallet>/reviews/stats/
    Returns average rating and count for a seller.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, _request, wallet):
        from django.db.models import Avg
        qs = SellerReview.objects.filter(seller__wallet_address=wallet)
        count = qs.count()
        avg = qs.aggregate(avg=Avg("rating"))["avg"]
        return Response({
            "count": count,
            "average": round(float(avg), 1) if avg else None,
        })

