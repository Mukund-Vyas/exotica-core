"""FR-B2/FR-C1 order creation, P&L-at-sale, and bulk-entry all-or-nothing rollback.

The bulk-rollback test at the bottom of this file is a regression test for a
bug found while building this backend: against SQLite specifically, a
`begin_nested()` savepoint that rolled back on a later line's failure could
leave an *earlier*, already-succeeded line's changes committed anyway. Root
cause and fix are in app/core/db.py (search "pysqlite/aiosqlite quirk") — this
test is what would have caught it.
"""
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError
from app.models.product import CommissionType, SKU
from app.schemas.transaction import BulkOrderCreate, OrderCreate, OrderItemCreate
from app.services.orders import create_bulk_orders, create_order
from app.services.pricing import set_channel_commission, set_channel_price


@pytest.mark.asyncio
async def test_order_pnl_matches_hand_calculation(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    sku.current_avg_cost = Decimal("300.0000")

    await set_channel_price(db_session, sku.id, channel.id, Decimal("999.00"), owner_user)
    await set_channel_commission(db_session, channel.id, CommissionType.PERCENTAGE, Decimal("10"), owner_user)

    order = await create_order(
        db_session,
        OrderCreate(
            channel_id=channel.id,
            order_date="2026-07-01",
            items=[OrderItemCreate(sku_id=sku.id, quantity=6)],
        ),
        owner_user,
    )

    item = order.items[0]
    # Revenue = 6 * 999.00 = 5994.00
    assert item.revenue == Decimal("5994.00")
    # Commission = 5994.00 * 10% = 599.40
    assert item.commission_amount_at_sale == Decimal("599.40")
    # COGS = 6 * 300.0000 = 1800.00
    # Net profit = 5994.00 - 599.40 - 1800.00 = 3594.60
    assert item.net_profit == Decimal("3594.60")

    await db_session.refresh(sku)
    assert sku.current_stock_qty == 94


@pytest.mark.asyncio
async def test_order_rejected_when_stock_insufficient(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=2)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)

    with pytest.raises(ConflictError):
        await create_order(
            db_session,
            OrderCreate(
                channel_id=channel.id,
                order_date="2026-07-01",
                items=[OrderItemCreate(sku_id=sku.id, quantity=5)],
            ),
            owner_user,
        )


@pytest.mark.asyncio
async def test_bulk_orders_all_or_nothing_rolls_back_earlier_success(db_session, owner_user, channel):
    """The regression test described in this module's docstring: order 1 is
    valid and would succeed on its own; order 2 references a nonexistent SKU.
    The whole batch must be rejected, and — critically — order 1's stock
    decrement must NOT persist either."""
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("100.00"), owner_user)

    result = await create_bulk_orders(
        db_session,
        BulkOrderCreate(
            orders=[
                OrderCreate(
                    channel_id=channel.id,
                    order_date="2026-07-01",
                    items=[OrderItemCreate(sku_id=sku.id, quantity=1)],
                ),
                OrderCreate(
                    channel_id=channel.id,
                    order_date="2026-07-01",
                    items=[OrderItemCreate(sku_id="does-not-exist", quantity=1)],
                ),
            ]
        ),
        owner_user,
    )

    assert result.orders == []
    assert len(result.errors) == 1

    await db_session.refresh(sku)
    assert sku.current_stock_qty == 100, (
        "Order 1's stock decrement leaked through despite the batch failing overall"
    )


@pytest.mark.asyncio
async def test_bulk_orders_all_succeed_when_all_valid(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("100.00"), owner_user)

    result = await create_bulk_orders(
        db_session,
        BulkOrderCreate(
            orders=[
                OrderCreate(
                    channel_id=channel.id,
                    order_date="2026-07-01",
                    items=[OrderItemCreate(sku_id=sku.id, quantity=1)],
                ),
                OrderCreate(
                    channel_id=channel.id,
                    order_date="2026-07-01",
                    items=[OrderItemCreate(sku_id=sku.id, quantity=2)],
                ),
            ]
        ),
        owner_user,
    )

    assert len(result.orders) == 2
    assert result.errors == []
    await db_session.refresh(sku)
    assert sku.current_stock_qty == 97
