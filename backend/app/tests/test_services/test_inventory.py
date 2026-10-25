"""BRD Section 7 weighted-average-cost formula + FR-B1 purchase recording."""
import asyncio
import uuid
from decimal import Decimal

import pytest

from app.core.db import AsyncSessionLocal
from app.models.product import SKU
from app.models.vendor import Vendor
from app.schemas.transaction import PurchaseCreate, PurchaseItemCreate
from app.services.inventory import calculate_weighted_avg_cost, record_purchase


def test_weighted_avg_cost_hand_calculated():
    # (100 * 200 + 50 * 260) / 150 = (20000 + 13000) / 150 = 220.0000
    result = calculate_weighted_avg_cost(
        old_qty=100, old_avg_cost=Decimal("200"), new_qty=50, new_price=Decimal("260")
    )
    assert result == Decimal("220.0000")


def test_weighted_avg_cost_from_zero_stock():
    result = calculate_weighted_avg_cost(
        old_qty=0, old_avg_cost=Decimal("0"), new_qty=10, new_price=Decimal("150")
    )
    assert result == Decimal("150.0000")


@pytest.mark.asyncio
async def test_record_purchase_updates_stock_and_wac(db_session, owner_user, vendor):
    sku = SKU(id=str(uuid.uuid4()), code="X1", name="n", category="c", size_variant="s")
    db_session.add(sku)
    await db_session.flush()

    payload = PurchaseCreate(
        vendor_id=vendor.id,
        purchase_date="2026-07-01",
        items=[PurchaseItemCreate(sku_id=sku.id, quantity=100, unit_cost=Decimal("200.00"))],
    )
    await record_purchase(db_session, payload, owner_user)
    await db_session.refresh(sku)
    assert sku.current_stock_qty == 100
    assert sku.current_avg_cost == Decimal("200.0000")

    payload2 = PurchaseCreate(
        vendor_id=vendor.id,
        purchase_date="2026-07-02",
        items=[PurchaseItemCreate(sku_id=sku.id, quantity=50, unit_cost=Decimal("260.00"))],
    )
    await record_purchase(db_session, payload2, owner_user)
    await db_session.refresh(sku)
    assert sku.current_stock_qty == 150
    assert sku.current_avg_cost == Decimal("220.0000")


@pytest.mark.asyncio
@pytest.mark.skipif(
    AsyncSessionLocal.kw["bind"].dialect.name == "sqlite",
    reason="needs real row-level locks: run with DATABASE_URL pointing at Postgres",
)
async def test_concurrent_purchases_on_same_sku_serialize_correctly(db_session, owner_user):
    """Implementation Plan Section 7.2 — SKU row lock. Two 'simultaneous'
    purchases against the same SKU must both land, in some order, never lose
    an update to a race."""
    await db_session.commit()  # independent sessions below must be able to see the user
    race_sku_id, race_vendor_id = str(uuid.uuid4()), str(uuid.uuid4())
    async with AsyncSessionLocal() as setup_db:
        sku = SKU(id=race_sku_id, code="RACE1", name="n", category="c", size_variant="s")
        setup_db.add(sku)
        race_vendor = Vendor(id=race_vendor_id, name="Race Vendor", created_by_id=owner_user.id)
        setup_db.add(race_vendor)
        await setup_db.commit()

    async def do_purchase(qty: int, cost: str):
        async with AsyncSessionLocal() as db:
            payload = PurchaseCreate(
                vendor_id=race_vendor_id,
                purchase_date="2026-07-01",
                items=[PurchaseItemCreate(sku_id=race_sku_id, quantity=qty, unit_cost=Decimal(cost))],
            )
            await record_purchase(db, payload, owner_user)
            await db.commit()

    await asyncio.gather(do_purchase(10, "100.00"), do_purchase(20, "150.00"))

    async with AsyncSessionLocal() as check_db:
        from sqlalchemy import select

        result = await check_db.execute(select(SKU).where(SKU.id == race_sku_id))
        sku = result.scalar_one()
        # Both purchases must be reflected — the whole point of the row lock.
        assert sku.current_stock_qty == 30
