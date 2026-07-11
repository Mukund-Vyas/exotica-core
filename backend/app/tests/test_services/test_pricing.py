"""BRD Section 7 commission formula + FR-A2/A3 history-versioning behavior."""
from decimal import Decimal

import pytest

from app.models.product import CommissionType
from app.services.pricing import (
    calculate_commission,
    get_current_price,
    set_channel_commission,
    set_channel_price,
)


def test_percentage_commission():
    commission = type("C", (), {"commission_type": CommissionType.PERCENTAGE, "value": Decimal("10")})
    # Revenue x Commission% — BRD Section 7
    assert calculate_commission(commission, revenue=Decimal("1000.00"), quantity=5) == Decimal("100.00")


def test_flat_commission():
    commission = type("C", (), {"commission_type": CommissionType.FLAT, "value": Decimal("15")})
    # Qty Sold x Flat Commission — BRD Section 7
    assert calculate_commission(commission, revenue=Decimal("1000.00"), quantity=5) == Decimal("75.00")


def test_no_commission_configured_defaults_to_zero():
    assert calculate_commission(None, revenue=Decimal("500.00"), quantity=2) == Decimal("0")


@pytest.mark.asyncio
async def test_set_channel_price_supersedes_previous_current_row(db_session, owner_user, channel):
    """FR-A2: price history is insert-only — old row flips to is_current=False,
    never overwritten in place."""
    from app.models.product import SKU

    sku = SKU(id="sku-1", code="X1", name="n", category="c", size_variant="s")
    db_session.add(sku)
    await db_session.flush()

    first = await set_channel_price(db_session, sku.id, channel.id, Decimal("500.00"), owner_user)
    second = await set_channel_price(db_session, sku.id, channel.id, Decimal("550.00"), owner_user)

    await db_session.refresh(first)
    assert first.is_current is False
    assert second.is_current is True

    current = await get_current_price(db_session, sku.id, channel.id)
    assert current.price == Decimal("550.00")


@pytest.mark.asyncio
async def test_set_channel_commission_supersedes_previous(db_session, owner_user, channel):
    first = await set_channel_commission(
        db_session, channel.id, CommissionType.PERCENTAGE, Decimal("10"), owner_user
    )
    second = await set_channel_commission(
        db_session, channel.id, CommissionType.FLAT, Decimal("20"), owner_user
    )
    await db_session.refresh(first)
    assert first.is_current is False
    assert second.is_current is True
    assert second.commission_type == CommissionType.FLAT
