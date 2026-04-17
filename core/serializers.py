import re

from rest_framework import serializers

from .models import Dispute, DisputeEvidence, KYCDocument, Order, Product, ProductImage, SellerReview, User


class WalletAddressField(serializers.CharField):
    """Validates an Ethereum wallet address (0x + 40 hex chars)."""

    def to_internal_value(self, data):
        value = super().to_internal_value(data).strip()
        if not re.match(r"^0x[0-9a-fA-F]{40}$", value):
            raise serializers.ValidationError("Invalid Ethereum wallet address.")
        return value.lower()


class NonceRequestSerializer(serializers.Serializer):
    wallet = WalletAddressField()


class VerifySignatureSerializer(serializers.Serializer):
    wallet = WalletAddressField()
    signature = serializers.CharField(min_length=130, max_length=134)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "wallet_address",
            "is_seller",
            "is_staff",
            "kyc_status",
            "full_name",
            "email_address",
            "phone_number",
            "date_of_birth",
            "date_joined",
        ]
        read_only_fields = fields


class KYCDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = KYCDocument
        fields = [
            "id",
            "document_type",
            "file",
            "status",
            "notes",
            "uploaded_at",
            "reviewed_at",
        ]
        read_only_fields = ["id", "status", "notes", "uploaded_at", "reviewed_at"]


# ---------------------------------------------------------------------------
# Phase 3 — Product & Order Serializers
# ---------------------------------------------------------------------------


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "order"]
        read_only_fields = ["id"]


class ProductSerializer(serializers.ModelSerializer):
    seller_wallet = serializers.CharField(source="seller.wallet_address", read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "seller_wallet",
            "category",
            "title",
            "description",
            "price",
            "image",
            "images",
            "facebook_url",
            "location",
            "shipping_info",
            "status",
            "quantity",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "seller_wallet", "created_at", "updated_at"]


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views (no description)."""

    seller_wallet = serializers.CharField(source="seller.wallet_address", read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "seller_wallet",
            "category",
            "title",
            "price",
            "image",
            "images",
            "location",
            "status",
            "quantity",
            "created_at",
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    buyer_wallet = serializers.CharField(source="buyer.wallet_address", read_only=True)
    product_title = serializers.CharField(source="product.title", read_only=True)
    seller_wallet = serializers.CharField(
        source="product.seller.wallet_address", read_only=True
    )
    has_review = serializers.SerializerMethodField()

    def get_has_review(self, obj):
        return hasattr(obj, "review")

    class Meta:
        model = Order
        fields = [
            "id",
            "buyer_wallet",
            "seller_wallet",
            "product",
            "product_title",
            "quantity",
            "total_price",
            "status",
            "shipping_address",
            "tracking_number",
            "escrow_id",
            "tx_hash",
            "has_review",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "buyer_wallet",
            "seller_wallet",
            "product_title",
            "total_price",
            "status",
            "tracking_number",
            "escrow_id",
            "tx_hash",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        product = attrs["product"]
        qty = attrs.get("quantity", 1)

        if product.status != Product.Status.ACTIVE:
            raise serializers.ValidationError("This product is not available.")
        if qty > product.quantity:
            raise serializers.ValidationError(
                f"Only {product.quantity} in stock."
            )
        if product.category == Product.Category.PHYSICAL:
            if not attrs.get("shipping_address"):
                raise serializers.ValidationError(
                    {"shipping_address": "Required for physical goods."}
                )

        # Auto-compute total price
        attrs["total_price"] = product.price * qty
        return attrs


class OrderStatusSerializer(serializers.Serializer):
    """Validates an order status transition."""

    status = serializers.ChoiceField(choices=Order.Status.choices)
    tracking_number = serializers.CharField(required=False, allow_blank=True)
    tx_hash = serializers.CharField(required=False, allow_blank=True)
    escrow_id = serializers.IntegerField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

class SellerReviewSerializer(serializers.ModelSerializer):
    reviewer_wallet = serializers.CharField(source="reviewer.wallet_address", read_only=True)

    class Meta:
        model = SellerReview
        fields = ["id", "order", "reviewer_wallet", "rating", "comment", "created_at"]
        read_only_fields = ["id", "reviewer_wallet", "created_at"]

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def validate_order(self, order):
        request = self.context["request"]
        if order.buyer != request.user:
            raise serializers.ValidationError("You can only review your own orders.")
        if order.status != Order.Status.COMPLETED:
            raise serializers.ValidationError("You can only review completed orders.")
        if hasattr(order, "review"):
            raise serializers.ValidationError("You have already reviewed this order.")
        return order

    def create(self, validated_data):
        order = validated_data["order"]
        validated_data["reviewer"] = self.context["request"].user
        validated_data["seller"] = order.product.seller
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Phase 6 — Dispute Serializers
# ---------------------------------------------------------------------------


class DisputeEvidenceSerializer(serializers.ModelSerializer):
    uploader_wallet = serializers.CharField(
        source="uploaded_by.wallet_address", read_only=True
    )

    class Meta:
        model = DisputeEvidence
        fields = ["id", "uploader_wallet", "file", "description", "uploaded_at"]
        read_only_fields = ["id", "uploader_wallet", "uploaded_at"]
        extra_kwargs = {"file": {"required": False}}


class DisputeSerializer(serializers.ModelSerializer):
    opened_by_wallet = serializers.CharField(
        source="opened_by.wallet_address", read_only=True
    )
    resolved_by_wallet = serializers.CharField(
        source="resolved_by.wallet_address", read_only=True, allow_null=True
    )
    evidence = DisputeEvidenceSerializer(many=True, read_only=True)
    product_id = serializers.IntegerField(source="order.product.id", read_only=True)
    product_title = serializers.CharField(source="order.product.title", read_only=True)
    order_id = serializers.IntegerField(source="order.id", read_only=True)
    buyer_wallet = serializers.CharField(
        source="order.buyer.wallet_address", read_only=True
    )
    seller_wallet = serializers.CharField(
        source="order.product.seller.wallet_address", read_only=True
    )

    class Meta:
        model = Dispute
        fields = [
            "id",
            "order",
            "order_id",
            "opened_by_wallet",
            "buyer_wallet",
            "seller_wallet",
            "product_id",
            "product_title",
            "reason",
            "description",
            "resolution",
            "admin_notes",
            "resolved_by_wallet",
            "created_at",
            "resolved_at",
            "evidence",
        ]
        read_only_fields = [
            "id",
            "order",
            "opened_by_wallet",
            "resolution",
            "admin_notes",
            "resolved_by_wallet",
            "created_at",
            "resolved_at",
            "evidence",
        ]


class DisputeResolveSerializer(serializers.Serializer):
    """Validates admin dispute resolution."""

    resolution = serializers.ChoiceField(
        choices=[
            ("refund_buyer", "Refund Buyer"),
            ("pay_seller", "Pay Seller"),
        ]
    )
    admin_notes = serializers.CharField(required=False, allow_blank=True, default="")
