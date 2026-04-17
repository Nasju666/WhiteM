from django.http import JsonResponse
from django.urls import path

from . import views


def health(_request):
    return JsonResponse({"status": "ok", "service": "tradinghub"})


urlpatterns = [
    # Health check
    path("api/health/", health, name="health"),

    # Auth — wallet-based
    path("api/auth/nonce/", views.NonceView.as_view(), name="auth-nonce"),
    path("api/auth/verify/", views.VerifySignatureView.as_view(), name="auth-verify"),
    path("api/auth/profile/", views.ProfileView.as_view(), name="auth-profile"),

    # KYC
    path("api/kyc/", views.KYCListView.as_view(), name="kyc-list"),
    path("api/kyc/upload/", views.KYCUploadView.as_view(), name="kyc-upload"),

    # Products
    path("api/products/", views.ProductListCreateView.as_view(), name="product-list"),
    path("api/products/<int:pk>/", views.ProductDetailView.as_view(), name="product-detail"),
    path("api/products/<int:pk>/images/", views.ProductImageUploadView.as_view(), name="product-image-upload"),
    path("api/products/<int:pk>/images/<int:img_id>/", views.ProductImageDeleteView.as_view(), name="product-image-delete"),

    # Orders
    path("api/orders/", views.OrderListCreateView.as_view(), name="order-list"),
    path("api/orders/<int:pk>/", views.OrderDetailView.as_view(), name="order-detail"),
    path("api/orders/<int:pk>/status/", views.OrderStatusView.as_view(), name="order-status"),

    # Escrow (Web3)
    path("api/orders/<int:pk>/escrow/create/", views.EscrowCreateView.as_view(), name="escrow-create"),
    path("api/orders/<int:pk>/escrow/confirm/", views.EscrowConfirmView.as_view(), name="escrow-confirm"),
    path("api/orders/<int:pk>/escrow/dispute/", views.EscrowDisputeView.as_view(), name="escrow-dispute"),
    path("api/orders/<int:pk>/escrow/status/", views.EscrowStatusView.as_view(), name="escrow-status"),

    # Disputes
    path("api/orders/<int:pk>/dispute/", views.OpenDisputeView.as_view(), name="dispute-open"),
    path("api/disputes/<int:dispute_id>/evidence/", views.DisputeEvidenceUploadView.as_view(), name="dispute-evidence"),
    path("api/disputes/<int:dispute_id>/resolve/", views.DisputeResolveView.as_view(), name="dispute-resolve"),

    # Admin dashboard
    path("api/admin/dashboard/", views.AdminDashboardView.as_view(), name="admin-dashboard"),
    path("api/admin/kyc/", views.AdminKYCListView.as_view(), name="admin-kyc-list"),
    path("api/admin/kyc/<int:pk>/", views.AdminKYCReviewView.as_view(), name="admin-kyc-review"),
    path("api/admin/disputes/", views.AdminDisputeListView.as_view(), name="admin-dispute-list"),

    # Seller
    path("api/seller/products/", views.SellerProductsView.as_view(), name="seller-products"),

    # Reviews
    path("api/reviews/", views.SellerReviewListCreateView.as_view(), name="review-create"),
    path("api/sellers/<str:wallet>/reviews/", views.SellerReviewListCreateView.as_view(), name="seller-reviews"),
    path("api/sellers/<str:wallet>/reviews/stats/", views.SellerReviewStatsView.as_view(), name="seller-review-stats"),
]
