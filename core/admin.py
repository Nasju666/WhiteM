from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from .models import Dispute, DisputeEvidence, KYCDocument, Order, Product, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("wallet_address", "kyc_status", "is_seller", "is_staff", "date_joined")
    list_filter = ("kyc_status", "is_seller", "is_staff")
    search_fields = ("wallet_address",)
    ordering = ("-date_joined",)

    # Override fieldsets since we dropped the username field
    fieldsets = (
        (None, {"fields": ("wallet_address", "password")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Seller / KYC", {"fields": ("is_seller", "kyc_status")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("wallet_address", "password1", "password2"),
        }),
    )


@admin.register(KYCDocument)
class KYCDocumentAdmin(admin.ModelAdmin):
    list_display = ("user", "document_type", "status", "uploaded_at", "reviewed_at")
    list_filter = ("status", "document_type")
    search_fields = ("user__wallet_address",)
    readonly_fields = ("uploaded_at",)
    actions = ["approve_documents", "reject_documents"]

    @admin.action(description="Approve selected documents")
    def approve_documents(self, request, queryset):
        queryset.update(
            status=KYCDocument.Status.APPROVED,
            reviewer=request.user,
            reviewed_at=timezone.now(),
        )
        # If all required docs approved, update user KYC status
        for doc in queryset.select_related("user"):
            self._update_user_kyc_status(doc.user)

    @admin.action(description="Reject selected documents")
    def reject_documents(self, request, queryset):
        queryset.update(
            status=KYCDocument.Status.REJECTED,
            reviewer=request.user,
            reviewed_at=timezone.now(),
        )
        for doc in queryset.select_related("user"):
            doc.user.kyc_status = User.KYCStatus.REJECTED
            doc.user.save(update_fields=["kyc_status"])

    def _update_user_kyc_status(self, user):
        """Set user's kyc_status to 'approved' if they have at least one approved doc."""
        if user.kyc_documents.filter(status=KYCDocument.Status.APPROVED).exists():
            user.kyc_status = User.KYCStatus.APPROVED
            user.save(update_fields=["kyc_status"])


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("title", "seller", "category", "price", "status", "quantity", "created_at")
    list_filter = ("category", "status")
    search_fields = ("title", "seller__wallet_address")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "buyer", "product", "quantity", "total_price", "status", "escrow_id", "created_at")
    list_filter = ("status",)
    search_fields = ("buyer__wallet_address", "product__title")
    readonly_fields = ("created_at", "updated_at")


class DisputeEvidenceInline(admin.TabularInline):
    model = DisputeEvidence
    extra = 0
    readonly_fields = ("uploaded_by", "file", "description", "uploaded_at")


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "opened_by", "reason", "resolution", "created_at", "resolved_at")
    list_filter = ("reason", "resolution")
    search_fields = ("order__id", "opened_by__wallet_address")
    readonly_fields = ("order", "opened_by", "reason", "description", "created_at")
    inlines = [DisputeEvidenceInline]
    actions = ["resolve_refund_buyer", "resolve_pay_seller"]

    @admin.action(description="Resolve — Refund Buyer")
    def resolve_refund_buyer(self, request, queryset):
        self._resolve(request, queryset, Dispute.Resolution.REFUND_BUYER)

    @admin.action(description="Resolve — Pay Seller")
    def resolve_pay_seller(self, request, queryset):
        self._resolve(request, queryset, Dispute.Resolution.PAY_SELLER)

    def _resolve(self, request, queryset, resolution):
        for dispute in queryset.filter(resolution=Dispute.Resolution.PENDING):
            dispute.resolution = resolution
            dispute.resolved_by = request.user
            dispute.resolved_at = timezone.now()
            dispute.save()
            dispute.order.status = Order.Status.COMPLETED
            dispute.order.save(update_fields=["status", "updated_at"])
        self.message_user(request, f"Resolved {queryset.count()} dispute(s) as {resolution}.")


@admin.register(DisputeEvidence)
class DisputeEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "dispute", "uploaded_by", "uploaded_at")
    readonly_fields = ("dispute", "uploaded_by", "file", "description", "uploaded_at")
