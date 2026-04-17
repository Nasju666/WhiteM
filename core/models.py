import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import WalletUserManager


class User(AbstractUser):
    """Custom user model with wallet-based authentication."""

    class KYCStatus(models.TextChoices):
        NONE = "none", "None"
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    # Remove username field — wallet_address is the identifier
    username = None

    wallet_address = models.CharField(
        max_length=42,
        unique=True,
        help_text="Ethereum wallet address (0x...)",
    )
    nonce = models.UUIDField(
        default=uuid.uuid4,
        help_text="Random nonce for MetaMask signature verification; rotated on each login.",
    )
    is_seller = models.BooleanField(
        default=False,
        help_text="Whether this user has been approved as a seller.",
    )
    kyc_status = models.CharField(
        max_length=10,
        choices=KYCStatus.choices,
        default=KYCStatus.NONE,
    )

    # Personal info (collected during KYC)
    full_name = models.CharField(max_length=200, blank=True, default="")
    email_address = models.EmailField(blank=True, default="")
    phone_number = models.CharField(max_length=20, blank=True, default="")
    date_of_birth = models.DateField(null=True, blank=True)

    objects = WalletUserManager()

    USERNAME_FIELD = "wallet_address"
    REQUIRED_FIELDS = []  # wallet_address is already required via USERNAME_FIELD

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.wallet_address

    def rotate_nonce(self):
        """Generate a new nonce (call after every successful login)."""
        self.nonce = uuid.uuid4()
        self.save(update_fields=["nonce"])


class KYCDocument(models.Model):
    """Seller KYC verification documents."""

    class DocumentType(models.TextChoices):
        PHILSYS_ID = "philsys_id", "PhilSys ID"
        DRIVERS_LICENSE = "drivers_license", "Driver's License"
        PASSPORT = "passport", "Passport"
        SSS_ID = "sss_id", "SSS ID"
        SELFIE = "selfie", "Selfie"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="kyc_documents",
    )
    document_type = models.CharField(
        max_length=20,
        choices=DocumentType.choices,
    )
    file = models.ImageField(
        upload_to="kyc/",
        help_text="Uploaded KYC document image.",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Reviewer notes.",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_documents",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "KYC Document"
        verbose_name_plural = "KYC Documents"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.user.wallet_address} — {self.get_document_type_display()}"


class Product(models.Model):
    """Marketplace listing."""

    class Category(models.TextChoices):
        PHYSICAL = "physical", "Physical Good"
        DIGITAL = "digital", "Digital Product"
        GAME_ACCOUNT = "game_account", "Game Account"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        SOLD = "sold", "Sold Out"
        DELISTED = "delisted", "Delisted"

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="products",
    )
    category = models.CharField(max_length=15, choices=Category.choices)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(
        max_digits=18,
        decimal_places=8,
        help_text="Price in ETH.",
    )
    image = models.ImageField(upload_to="products/", blank=True, null=True)
    facebook_url = models.URLField(
        max_length=255,
        blank=True,
        default="",
        help_text="Seller's Facebook profile/page URL for buyer contact.",
    )
    location = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="City / province where item is located.",
    )
    shipping_info = models.CharField(
        max_length=300,
        blank=True,
        default="",
        help_text="Shipping terms, e.g. 'Ships nationwide via J&T, 3-5 days'.",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    quantity = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class ProductImage(models.Model):
    """Additional images for a product listing."""

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="images",
    )
    image = models.ImageField(upload_to="products/")
    order = models.PositiveSmallIntegerField(default=0, help_text="Display order.")

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"Image {self.id} for {self.product.title}"


class Order(models.Model):
    """Purchase order with state-machine status transitions."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        DISPUTED = "disputed", "Disputed"

    # Valid transitions: { current_status: [allowed_next_statuses] }
    TRANSITIONS = {
        "pending": ["paid", "cancelled"],
        "paid": ["shipped", "cancelled"],
        "shipped": ["delivered"],
        "delivered": ["completed", "disputed"],
    }

    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders_as_buyer",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="orders",
    )
    quantity = models.PositiveIntegerField(default=1)
    total_price = models.DecimalField(max_digits=18, decimal_places=8)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    shipping_address = models.TextField(
        blank=True,
        default="",
        help_text="Required for physical goods.",
    )
    tracking_number = models.CharField(max_length=100, blank=True, default="")
    escrow_id = models.IntegerField(
        null=True,
        blank=True,
        help_text="On-chain escrow ID from Escrow.sol.",
    )
    tx_hash = models.CharField(
        max_length=66,
        blank=True,
        default="",
        help_text="Transaction hash of the escrow deposit.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Order #{self.pk} — {self.product.title}"

    def transition_status(self, new_status):
        """
        Transition to *new_status* if allowed.
        Raises ValueError on invalid transition.
        """
        allowed = self.TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition from '{self.status}' to '{new_status}'. "
                f"Allowed: {allowed}"
            )
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])


class SellerReview(models.Model):
    """Star rating + comment left by a buyer after a completed order."""

    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name="review",
        help_text="Each completed order can have exactly one review.",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews_given",
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reviews_received",
    )
    rating = models.PositiveSmallIntegerField(
        help_text="1–5 stars.",
    )
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Review #{self.pk} — {self.rating}★ by {self.reviewer.wallet_address}"


class Dispute(models.Model):
    """Dispute raised on an order by buyer or seller."""

    class Reason(models.TextChoices):
        NOT_RECEIVED = "not_received", "Item Not Received"
        NOT_AS_DESCRIBED = "not_as_described", "Not As Described"
        DAMAGED = "damaged", "Damaged"
        UNAUTHORIZED = "unauthorized", "Unauthorized Transaction"
        OTHER = "other", "Other"

    class Resolution(models.TextChoices):
        PENDING = "pending", "Pending"
        REFUND_BUYER = "refund_buyer", "Refund Buyer"
        PAY_SELLER = "pay_seller", "Pay Seller"

    order = models.OneToOneField(
        Order,
        on_delete=models.CASCADE,
        related_name="dispute",
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="disputes_opened",
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    description = models.TextField(help_text="Detailed description of the issue.")
    resolution = models.CharField(
        max_length=15,
        choices=Resolution.choices,
        default=Resolution.PENDING,
    )
    admin_notes = models.TextField(blank=True, default="")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes_resolved",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispute #{self.pk} — Order #{self.order_id}"


class DisputeEvidence(models.Model):
    """Evidence file uploaded for a dispute."""

    dispute = models.ForeignKey(
        Dispute,
        on_delete=models.CASCADE,
        related_name="evidence",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    file = models.FileField(upload_to="dispute_evidence/", blank=True, null=True)
    description = models.TextField(blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]
        verbose_name_plural = "Dispute evidence"

    def __str__(self):
        return f"Evidence #{self.pk} for Dispute #{self.dispute_id}"
