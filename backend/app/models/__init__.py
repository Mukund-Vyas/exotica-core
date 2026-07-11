"""
Import every model module here so `Base.metadata` is fully populated for
Alembic's `--autogenerate` (alembic/env.py imports this package).
"""
from app.models.product import (  # noqa: F401
    Channel,
    ChannelCommission,
    ChannelPrice,
    CommissionType,
    SKU,
)
from app.models.settings import SystemSetting  # noqa: F401
from app.models.transaction import (  # noqa: F401
    Order,
    OrderItem,
    Payment,
    PaymentTerm,
    Purchase,
    PurchaseItem,
    Receivable,
    ReceivableStatus,
    Return,
)
from app.models.user import Permission, Role, RolePermission, User  # noqa: F401

__all__ = [
    "Channel",
    "ChannelCommission",
    "ChannelPrice",
    "CommissionType",
    "SKU",
    "SystemSetting",
    "Order",
    "OrderItem",
    "Payment",
    "PaymentTerm",
    "Purchase",
    "PurchaseItem",
    "Receivable",
    "ReceivableStatus",
    "Return",
    "Permission",
    "Role",
    "RolePermission",
    "User",
]