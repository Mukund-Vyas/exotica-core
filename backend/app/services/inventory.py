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
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.core.money import money, unit_cost as round_cost
from app.models.product import SKU
from app.models.transaction import Purchase, PurchaseItem
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.transaction import PurchaseCreate


async def lock_skus(db: AsyncSession, sku_ids: list[str]) -> dict[str, SKU]:
    """Lock every distinct SKU row (SELECT ... FOR UPDATE) in a fixed order.

    Always locking in sorted-ID order matters: two multi-line orders that touch
    the same SKUs in opposite order (A,B vs B,A) would otherwise each hold one
    lock while waiting for the other -> deadlock. A single ordered statement
    makes that impossible.
    """
    wanted = sorted(set(sku_ids))
    rows = (
        await db.execute(select(SKU).where(SKU.id.in_(wanted)).order_by(SKU.id).with_for_update())
    ).scalars().all()
    by_id = {sku.id: sku for sku in rows}
    for sku_id in wanted:
        if sku_id not in by_id:
            raise NotFoundError(f"SKU {sku_id} not found")
    return by_id


async def _lock_sku(db: AsyncSession, sku_id: str) -> SKU:
    return (await lock_skus(db, [sku_id]))[sku_id]


def calculate_weighted_avg_cost(
    old_qty: int, old_avg_cost: Decimal, new_qty: int, new_price: Decimal
) -> Decimal:
    """BRD Section 7 — Weighted Avg Cost formula. Pure function, unit-testable in isolation.

    If stock on hand is zero *or negative* (an order was allowed to oversell),
    there is no valid existing inventory value to blend with: the formula would
    mix a negative quantity into the average and produce a nonsense cost (e.g.
    -5 units @100 plus 10 @120 would give 140, higher than either price). In that
    case the incoming price simply becomes the new average.
    """
    if old_qty <= 0:
        return round_cost(new_price)
    total_qty = old_qty + new_qty
    total_value = (Decimal(old_qty) * old_avg_cost) + (Decimal(new_qty) * new_price)
    return round_cost(total_value / Decimal(total_qty))


async def record_purchase(db: AsyncSession, payload: PurchaseCreate, current_user: User) -> Purchase:
    """
    Records a purchase with one or more line items. Each line item locks its SKU row,
    recalculates WAC, increases stock, then releases the lock — items across SKUs don't
    block each other, but two purchases hitting the *same* SKU serialize correctly.
    """
    vendor = (await db.execute(select(Vendor).where(Vendor.id == payload.vendor_id))).scalar_one_or_none()
    if vendor is None:
        raise NotFoundError(f"Vendor {payload.vendor_id} not found")
    if not vendor.is_active:
        raise AppError(code="vendor_inactive", detail=f"Vendor '{vendor.name}' is inactive. Reactivate it first.")

    skus = await lock_skus(db, [i.sku_id for i in payload.items])
    for sku in skus.values():
        if not sku.is_active:
            raise AppError(
                code="sku_inactive",
                detail=f"SKU {sku.code} is discontinued; reactivate it before recording a purchase.",
            )

    purchase = Purchase(
        vendor_id=vendor.id,
        vendor=vendor.name,  # write-once snapshot, see models/vendor.py
        purchase_date=payload.purchase_date,
        created_by_id=current_user.id,
    )
    db.add(purchase)
    await db.flush()

    for item in payload.items:
        sku = skus[item.sku_id]

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
                line_total=money(Decimal(item.quantity) * item.unit_cost),
                resulting_avg_cost=new_avg_cost,
            )
        )

    await db.flush()
    await db.refresh(purchase, attribute_names=["items"])
    return purchase
