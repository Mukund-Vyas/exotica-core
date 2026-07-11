"""
Channel-specific pricing and commission configuration — FR-A2, FR-A3.

Implements BRD Section 7 commission formula selection:
    Commission Amount = Revenue x Commission%          [if type = Percentage]
                       = Qty Sold x Flat Commission     [if type = Flat per unit]

Both price and commission are insert-only history: a new row is added and the
previous `is_current` row is flipped to False, so past reports never change
retroactively when terms are updated (BRD FR-A2/A3, Implementation Plan Section 1.4/9).
"""
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.product import ChannelCommission, ChannelPrice, CommissionType
from app.models.user import User


async def get_current_price(db: AsyncSession, sku_id: str, channel_id: str) -> ChannelPrice | None:
    result = await db.execute(
        select(ChannelPrice)
        .where(
            ChannelPrice.sku_id == sku_id,
            ChannelPrice.channel_id == channel_id,
            ChannelPrice.is_current.is_(True),
        )
        .order_by(ChannelPrice.effective_from.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_channel_price(
    db: AsyncSession, sku_id: str, channel_id: str, price: Decimal, current_user: User
) -> ChannelPrice:
    """Creates a new current price row; supersedes any prior current row for this (sku, channel)."""
    await db.execute(
        update(ChannelPrice)
        .where(
            ChannelPrice.sku_id == sku_id,
            ChannelPrice.channel_id == channel_id,
            ChannelPrice.is_current.is_(True),
        )
        .values(is_current=False)
    )
    new_price = ChannelPrice(
        sku_id=sku_id,
        channel_id=channel_id,
        price=price,
        is_current=True,
        created_by_id=current_user.id,
    )
    db.add(new_price)
    await db.flush()
    return new_price


async def get_current_commission(db: AsyncSession, channel_id: str) -> ChannelCommission | None:
    result = await db.execute(
        select(ChannelCommission)
        .where(ChannelCommission.channel_id == channel_id, ChannelCommission.is_current.is_(True))
        .order_by(ChannelCommission.effective_from.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_channel_commission(
    db: AsyncSession,
    channel_id: str,
    commission_type: CommissionType,
    value: Decimal,
    current_user: User,
) -> ChannelCommission:
    await db.execute(
        update(ChannelCommission)
        .where(ChannelCommission.channel_id == channel_id, ChannelCommission.is_current.is_(True))
        .values(is_current=False)
    )
    new_commission = ChannelCommission(
        channel_id=channel_id,
        commission_type=commission_type,
        value=value,
        is_current=True,
        created_by_id=current_user.id,
    )
    db.add(new_commission)
    await db.flush()
    return new_commission


def calculate_commission(
    commission: ChannelCommission | None, revenue: Decimal, quantity: int
) -> Decimal:
    """BRD Section 7 commission formula. No commission configured => 0 (e.g. Website/B2B defaults)."""
    if commission is None:
        return Decimal("0")
    if commission.commission_type == CommissionType.PERCENTAGE:
        return (revenue * commission.value / Decimal("100")).quantize(Decimal("0.01"))
    # FLAT per unit
    return (Decimal(quantity) * commission.value).quantize(Decimal("0.01"))
