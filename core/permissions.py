from rest_framework import permissions


class IsApprovedSeller(permissions.BasePermission):
    """
    Allow access only to users who are approved sellers
    (is_seller=True AND kyc_status='approved').
    """

    message = "You must be an approved seller to perform this action."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_seller
            and request.user.kyc_status == "approved"
        )


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Object-level permission: only the owner can mutate;
    everyone else gets read-only access.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        # Works for Product.seller and Order.buyer
        owner_field = getattr(obj, "seller", None) or getattr(obj, "buyer", None)
        return owner_field == request.user


class IsBuyerOrSeller(permissions.BasePermission):
    """
    Object-level: only the order's buyer or the product's seller
    can access an order.
    """

    def has_object_permission(self, request, view, obj):
        return (
            obj.buyer == request.user
            or obj.product.seller == request.user
        )


class IsAdminUser(permissions.BasePermission):
    """Allow access only to admin / staff users."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_staff
