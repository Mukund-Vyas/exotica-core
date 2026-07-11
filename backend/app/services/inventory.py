"""
Purchase entry, weighted-average-cost recalculation, and stock mutation — FR-B1.

BRD Section 7 formula:
    Weighted Avg Cost (on purchase) =
        ((Old Stock Qty x Old Avg Cost) + (New Purchase Qty x New Purchase Price))
        / (Old Stock Qty + New Purchase Qty)

The SKU row is locked with SELECT ... FOR UPDATE for the duration of the mutation
(Implementation Plan Section 7.2) so two near-simultaneous purchases/orders on the
same SKU can't read stale stock/cost and race each other.
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.product import SKU
from app.models.transaction import Purchase, PurchaseItem
from app.models.user import User
from app.schemas.transaction import PurchaseCreate


async def _lock_sku(db: AsyncSession, sku_id: str) -> SKU:
    result = await db.execute(select(SKU).where(SKU.id == sku_id).with_for_update())
    sku = result.scalar_one_or_none()
    if sku is None:
        raise NotFoundError(f"SKU {sku_id} not found")
    return sku


def calculate_weighted_avg_cost(
    old_qty: int, old_avg_cost: Decimal, new_qty: int, new_price: Decimal
) -> Decimal:
    """BRD Section 7 — Weighted Avg Cost formula. Pure function, unit-testable in isolation."""
    total_qty = old_qty + new_qty
    if total_qty == 0:
        return Decimal("0")
    total_value = (Decimal(old_qty) * old_avg_cost) + (Decimal(new_qty) * new_price)
    return (total_value / Decimal(total_qty)).quantize(Decimal("0.0001"))


async def record_purchase(db: AsyncSession, payload: PurchaseCreate, current_user: User) -> Purchase:
    """
    Records a purchase with one or more line items. Each line item locks its SKU row,
    recalculates WAC, increases stock, then releases the lock — items across SKUs don't
    block each other, but two purchases hitting the *same* SKU serialize correctly.
    """
    purchase = Purchase(
        vendor=payload.vendor,
        purchase_date=payload.purchase_date,
        created_by_id=current_user.id,
    )
    db.add(purchase)
    await db.flush()

    for item in payload.items:
        sku = await _lock_sku(db, item.sku_id)

        new_avg_cost = calculate_weighted_avg_cost(
            old_qty=sku.current_stock_qty,
            old_avg_cost=sku.current_avg_cost,
            new_qty=item.quantity,
            new_price=item.unit_cost,
        )
        sku.current_stock_qty += item.quantity
        sku.current_avg_cost = new_avg_cost

        db.add(
            PurchaseItem(
                purchase_id=purchase.id,
                sku_id=item.sku_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                line_total=(item.quantity * item.unit_cost).quantize(Decimal("0.01")),
                resulting_avg_cost=new_avg_cost,
            )
        )

    await db.flush()
    await db.refresh(purchase, attribute_names=["items"])
    return purchase
