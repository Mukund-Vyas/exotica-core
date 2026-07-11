"""Epic F — B2B receivables: payment recording and aging."""
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.exceptions import ConflictError
from app.models.product import SKU
from app.models.transaction import PaymentTerm
from app.schemas.transaction import OrderCreate, OrderItemCreate, PaymentCreate
from app.services.orders import create_order
from app.services.pricing import set_channel_price
from app.services.receivables import get_receivables_aging, record_payment


async def _make_credit_order(db_session, owner_user, channel, sku_id, due_date, qty=10, price="500.00"):
    return await create_order(
        db_session,
        OrderCreate(
            channel_id=channel.id,
            order_date="2026-07-01",
            items=[OrderItemCreate(sku_id=sku_id, quantity=qty)],
            payment_term=PaymentTerm.CREDIT,
            party_name="Acme Retail",
            due_date=due_date,
        ),
        owner_user,
    )


@pytest.mark.asyncio
async def test_partial_payment_reduces_outstanding_balance(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)

    order = await _make_credit_order(db_session, owner_user, channel, sku.id, "2026-08-01")
    receivable = order.receivable
    assert receivable.amount_total == Decimal("5000.00")

    await record_payment(
        db_session, receivable.id, PaymentCreate(amount=Decimal("2000.00"), payment_date="2026-07-10"),
        owner_user,
    )
    await db_session.refresh(receivable)
    assert receivable.amount_outstanding == Decimal("3000.00")


@pytest.mark.asyncio
async def test_overpayment_is_rejected(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)

    order = await _make_credit_order(db_session, owner_user, channel, sku.id, "2026-08-01")
    receivable = order.receivable

    with pytest.raises(ConflictError):
        await record_payment(
            db_session,
            receivable.id,
            PaymentCreate(amount=Decimal("9999.00"), payment_date="2026-07-10"),
            owner_user,
        )


@pytest.mark.asyncio
async def test_aging_bucket_reflects_days_overdue(db_session, owner_user, channel):
    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s", current_stock_qty=100)
    db_session.add(sku)
    await db_session.flush()
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)

    today = date(2026, 7, 11)
    overdue_due_date = today - timedelta(days=40)  # falls in "31-60 Days"
    await _make_credit_order(db_session, owner_user, channel, sku.id, overdue_due_date.isoformat())

    report = await get_receivables_aging(db_session, as_of=today)
    assert len(report.rows) == 1
    assert report.rows[0].aging_bucket == "31-60 Days"
    assert report.rows[0].days_overdue == 40
