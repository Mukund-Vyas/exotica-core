import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.product import SKU, Channel, CommissionType
from app.schemas.transaction import OrderCreate, OrderItemCreate
from app.services.orders import create_order
from app.services.pricing import get_current_price, set_channel_commission, set_channel_price
from app.services.products import PRICE_COLUMNS, TEMPLATE_EXAMPLE_ROW, TEMPLATE_HEADERS, bulk_create_skus
from app.services.reports import get_channel_pnl


async def _ajio(db) -> Channel:
    ch = Channel(id=str(uuid.uuid4()), code="ajio", name="AJIO")
    db.add(ch)
    await db.flush()
    return ch


def test_template_has_an_ajio_column_aligned_with_its_example_value():
    assert "ajio_price" in TEMPLATE_HEADERS and PRICE_COLUMNS["ajio_price"] == "ajio"
    assert len(TEMPLATE_HEADERS) == len(TEMPLATE_EXAMPLE_ROW)  # columns and example stay in step
    assert TEMPLATE_EXAMPLE_ROW[TEMPLATE_HEADERS.index("ajio_price")] == "719.00"


@pytest.mark.asyncio
async def test_bulk_upload_sets_ajio_price_and_old_files_without_it_still_work(db_session, owner_user):
    ajio = await _ajio(db_session)
    rows = [
        {"code": "A-1", "name": "n", "category": "c", "size_variant": "s", "ajio_price": "719.00"},
        {"code": "A-2", "name": "n", "category": "c", "size_variant": "s"},  # an older CSV: no ajio column at all
    ]
    result = await bulk_create_skus(db_session, rows, owner_user)
    assert result.created_count == 2 and result.failed_count == 0
    a1 = next(s for s in result.created_skus if s.code == "A-1")
    price = await get_current_price(db_session, a1.id, ajio.id)
    assert price is not None and price.price == Decimal("719.00")
    a2 = next(s for s in result.created_skus if s.code == "A-2")
    assert await get_current_price(db_session, a2.id, ajio.id) is None


@pytest.mark.asyncio
async def test_ajio_price_is_rejected_loudly_if_the_channel_does_not_exist(db_session, owner_user):
    # No AJIO channel row (migration 0007 not applied yet)
    rows = [{"code": "A-1", "name": "n", "category": "c", "size_variant": "s", "ajio_price": "719.00"}]
    result = await bulk_create_skus(db_session, rows, owner_user)
    assert result.created_count == 0 and result.failed_count == 1
    assert result.errors[0].error_code == "channel_not_found"
    assert "alembic upgrade head" in result.errors[0].detail


@pytest.mark.asyncio
async def test_ajio_sale_with_commission_is_reported_under_ajio(db_session, owner_user):
    ajio = await _ajio(db_session)
    sku = SKU(id=str(uuid.uuid4()), code="X1", name="n", category="c", size_variant="s",
              current_stock_qty=10, current_avg_cost=Decimal("250"))
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, ajio.id, Decimal("719"), owner_user)
    await set_channel_commission(db_session, ajio.id, CommissionType.PERCENTAGE, Decimal("25"), owner_user)
    order = await create_order(
        db_session,
        OrderCreate(channel_id=ajio.id, order_date=date.today(), items=[OrderItemCreate(sku_id=sku.id, quantity=2)]),
        owner_user,
    )
    line = order.items[0]
    assert (line.revenue, line.commission_amount_at_sale) == (Decimal("1438.00"), Decimal("359.50"))
    rows = await get_channel_pnl(db_session, date.today(), date.today())
    ajio_row = next(r for r in rows if r.channel_name == "AJIO")
    assert ajio_row.revenue - ajio_row.commission - ajio_row.cogs == ajio_row.net_profit == Decimal("578.50")
