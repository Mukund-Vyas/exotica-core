"""
Return entry — FR-B3. A return increases stock and reverses the revenue/profit
for that line.

If `order_item_id` is given, the reversal uses that line's exact snapshot values
pro-rated by the returned quantity (so the reversal is precise even if price/cost/
commission have since changed) and the OrderItem row is locked for the duration
of the check, per Implementation Plan Section 7.2, to prevent two near-simultaneous
returns against the same line both passing the `sum(returned_qty) <= quantity`
check before either commits.

If no order reference is given, the reversal is estimated using the SKU's current
channel price/cost/commission — the best available basis without a source line.

Integrity rules enforced when a source line is given:
  * the return's SKU and channel must match that sale line (otherwise stock and
    revenue would be reversed against the wrong product/channel);
  * the return date cannot precede the sale date;
  * the *final* return against a line reverses exactly what is left of the
    original revenue/commission, so pro-rata rounding can never leave a stray
    paisa behind (e.g. 3 x 33.33 vs a 100.00 line);
  * returned units re-enter inventory at their original cost, re-blended into the
    weighted average, so inventory value and COGS reversal stay consistent.
"""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.core.money import money
from app.models.product import Channel
from app.models.transaction import Order, OrderItem, Return
from app.models.user import User
from app.schemas.transaction import ReturnCreate
from app.services.inventory import calculate_weighted_avg_cost, lock_skus
from app.services.pricing import calculate_commission, get_current_commission, get_current_price


async def record_return(db: AsyncSession, payload: ReturnCreate, current_user: User) -> Return:
    sku = (await lock_skus(db, [payload.sku_id]))[payload.sku_id]

    if await db.get(Channel, payload.channel_id) is None:
        raise NotFoundError(f"Channel {payload.channel_id} not found")

    return_cost_basis = sku.current_avg_cost  # cost the returned units re-enter stock at

    if payload.order_item_id:
        row = (
            await db.execute(
                select(OrderItem, Order)
                .join(Order, Order.id == OrderItem.order_id)
                .where(OrderItem.id == payload.order_item_id)
                .with_for_update(of=OrderItem)
            )
        ).first()
        if row is None:
            raise NotFoundError(f"OrderItem {payload.order_item_id} not found")
        order_item, order = row

        if order_item.sku_id != payload.sku_id:
            raise AppError(
                code="return_sku_mismatch",
                detail="The selected sale line is for a different SKU than the one being returned.",
            )
        if order.channel_id != payload.channel_id:
            raise AppError(
                code="return_channel_mismatch",
                detail="The selected sale line belongs to a different channel than the one chosen.",
            )
        if payload.return_date < order.order_date:
            raise AppError(
                code="return_before_order",
                detail=f"The return date cannot be before the sale date ({order.order_date}).",
            )

        prior = (
            await db.execute(
                select(
                    func.coalesce(func.sum(Return.quantity), 0),
                    func.coalesce(func.sum(Return.revenue_reversed), 0),
                    func.coalesce(func.sum(Return.commission_reversed), 0),
                ).where(Return.order_item_id == payload.order_item_id)
            )
        ).one()
        already_returned = int(prior[0])
        if already_returned + payload.quantity > order_item.quantity:
            raise ConflictError(
                detail=(
                    f"Return rejected: {already_returned} of {order_item.quantity} already "
                    f"returned for this line; cannot return {payload.quantity} more."
                ),
                code="over_return",
            )

        if already_returned + payload.quantity == order_item.quantity:
            # Final return on this line: take exactly what remains of the original
            # figures, so the reversals add up to the sale to the paisa.
            revenue_reversed = order_item.revenue - Decimal(prior[1])
            commission_reversed = order_item.commission_amount_at_sale - Decimal(prior[2])
        else:
            fraction = Decimal(payload.quantity) / Decimal(order_item.quantity)
            revenue_reversed = money(order_item.revenue * fraction)
            commission_reversed = money(order_item.commission_amount_at_sale * fraction)
        cost_reversed = money(order_item.cost_price_at_sale * payload.quantity)
        return_cost_basis = order_item.cost_price_at_sale
    else:
        # No source line — estimate from current price/cost/commission for this channel.
        current_price = await get_current_price(db, payload.sku_id, payload.channel_id)
        if current_price is None:
            raise AppError(
                code="price_not_set",
                detail="Cannot estimate return value: no channel price set for this SKU/channel.",
            )
        commission = await get_current_commission(db, payload.channel_id)
        revenue_reversed = money(Decimal(payload.quantity) * current_price.price)
        commission_reversed = calculate_commission(commission, revenue_reversed, payload.quantity)
        cost_reversed = money(Decimal(payload.quantity) * sku.current_avg_cost)
    net_profit_reversed = revenue_reversed - commission_reversed - cost_reversed

    sku.current_avg_cost = calculate_weighted_avg_cost(
        old_qty=sku.current_stock_qty,
        old_avg_cost=sku.current_avg_cost,
        new_qty=payload.quantity,
        new_price=return_cost_basis,
    )
    sku.current_stock_qty += payload.quantity

    ret = Return(
        order_item_id=payload.order_item_id,
        sku_id=payload.sku_id,
        channel_id=payload.channel_id,
        quantity=payload.quantity,
        return_date=payload.return_date,
        reason=(payload.reason or "").strip() or None,
        revenue_reversed=revenue_reversed,
        cost_reversed=cost_reversed,
        commission_reversed=commission_reversed,
        net_profit_reversed=net_profit_reversed,
        created_by_id=current_user.id,
    )
    db.add(ret)
    await db.flush()
    return ret
