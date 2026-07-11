"""FR-B3 return entry — stock replenishment and revenue/profit reversal."""
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError
from app.models.product import CommissionType, SKU
from app.schemas.transaction import OrderCreate, OrderItemCreate, ReturnCreate
from app.services.orders import create_order
from app.services.pricing import set_channel_commission, set_channel_price
from app.services.returns import record_return


@pytest.mark.asyncio
async def test_return_with_order_reference_prorates_snapshot_values(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    sku.current_avg_cost = Decimal("200.0000")
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)
    await set_channel_commission(db_session, channel.id, CommissionType.PERCENTAGE, Decimal("10"), owner_user)

    order = await create_order(
        db_session,
        OrderCreate(
            channel_id=channel.id,
            order_date="2026-07-01",
            items=[OrderItemCreate(sku_id=sku.id, quantity=10)],
        ),
        owner_user,
    )
    order_item = order.items[0]
    # revenue=5000.00, commission=500.00, cogs=2000.00, net_profit=2500.00

    ret = await record_return(
        db_session,
        ReturnCreate(
            sku_id=sku.id,
            channel_id=channel.id,
            quantity=3,
            return_date="2026-07-05",
            order_item_id=order_item.id,
        ),
        owner_user,
    )

    # Pro-rated by 3/10 of the original line
    assert ret.revenue_reversed == Decimal("1500.00")
    assert ret.commission_reversed == Decimal("150.00")
    assert ret.cost_reversed == Decimal("600.00")  # 3 * 200.0000
    assert ret.net_profit_reversed == Decimal("750.00")

    await db_session.refresh(sku)
    assert sku.current_stock_qty == 93  # 100 - 10 + 3


@pytest.mark.asyncio
async def test_over_return_is_rejected(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)

    order = await create_order(
        db_session,
        OrderCreate(
            channel_id=channel.id,
            order_date="2026-07-01",
            items=[OrderItemCreate(sku_id=sku.id, quantity=5)],
        ),
        owner_user,
    )
    order_item = order.items[0]

    await record_return(
        db_session,
        ReturnCreate(
            sku_id=sku.id, channel_id=channel.id, quantity=3, return_date="2026-07-05",
            order_item_id=order_item.id,
        ),
        owner_user,
    )

    with pytest.raises(ConflictError):
        await record_return(
            db_session,
            ReturnCreate(
                sku_id=sku.id, channel_id=channel.id, quantity=3, return_date="2026-07-06",
                order_item_id=order_item.id,
            ),
            owner_user,
        )
