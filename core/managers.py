from django.contrib.auth.base_user import BaseUserManager


class WalletUserManager(BaseUserManager):
    """
    Custom manager for User model where wallet_address is the unique identifier
    instead of username.
    """

    def create_user(self, wallet_address, password=None, **extra_fields):
        if not wallet_address:
            raise ValueError("A wallet address is required.")
        wallet_address = wallet_address.lower()
        user = self.model(wallet_address=wallet_address, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, wallet_address, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(wallet_address, password, **extra_fields)
