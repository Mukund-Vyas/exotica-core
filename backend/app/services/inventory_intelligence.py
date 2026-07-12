"""
Epic G — Inventory Intelligence (BRD Addendum).

The system uses weighted-average costing, not batch/lot tracking (a deliberate
earlier simplicity decision) — so "aging" here means days since this SKU was
last *restocked*, not true FIFO lot-level aging of specific units (FR-G1).

"Fast-moving" is velocity-based, not urgency-based: a SKU that sells a lot is
fast-moving regardless of current stock level (FR-G2). "Purchase trigger" is
the intersection of fast-moving AND actually running low relative to that
velocity (FR-G3) — a high-velocity SKU with plenty of stock correctly won't
trigger, and a slow-moving SKU that's merely low on stock correctly won't
trigger either.
"""
import math
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import SKU
from app.models.settings import SystemSetting
from app.models.transaction import Order, OrderItem, Purchase, PurchaseItem, Return
from app.schemas.reports import (
    AgingBucket,
    FastMoverRow,
    FastMoversReport,
    InventoryAgingReport,
    InventoryAgingRow,
    PurchaseTriggerRow,
    PurchaseTriggersReport,
)

ADS_WINDOW_DAYS_KEY = "ads_window_days"
FAST_MOVER_TOP_PERCENTILE_KEY = "fast_mover_top_percentile"
SAFETY_BUFFER_DAYS_KEY = "safety_buffer_days"
TARGET_COVERAGE_DAYS_KEY = "target_coverage_days"
DEFAULT_LEAD_TIME_DAYS_KEY = "default_lead_time_days"


async def _get_int_setting(db: AsyncSession, key: str, default: int) -> int:
    result = await db.execute(select(SystemSetting.value).where(SystemSetting.key == key))
    value = result.scalar_one_or_none()
    return int(value) if value is not None else default


def _aging_bucket(days: int) -> AgingBucket:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


# ============================================================================
# FR-G1 — Inventory Aging
# ============================================================================


async def get_inventory_aging_report(db: AsyncSession) -> InventoryAgingReport:
    last_purchase_q = (
        select(PurchaseItem.sku_id, func.max(Purchase.purchase_date).label("last_purchase_date"))
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .group_by(PurchaseItem.sku_id)
    )
    last_purchase_by_sku = {row.sku_id: row.last_purchase_date for row in (await db.execute(last_purchase_q)).all()}

    skus = (
        (await db.execute(select(SKU).where(SKU.is_active.is_(True), SKU.current_stock_qty > 0)))
        .scalars()
        .all()
    )

    today = date.today()
    rows: list[InventoryAgingRow] = []
    for sku in skus:
        # FR-G1 acceptance criteria: a SKU never repurchased since initial
        # stock-in still shows correctly — fall back to creation date rather
        # than dividing by zero or leaving the row blank.
        last_purchase = last_purchase_by_sku.get(sku.id) or sku.created_at.date()
        days_since = (today - last_purchase).days
        rows.append(
            InventoryAgingRow(
                sku_id=sku.id,
                sku_code=sku.code,
                sku_name=sku.name,
                category=sku.category,
                stock_qty=sku.current_stock_qty,
                last_purchase_date=last_purchase,
                days_since_last_purchase=days_since,
                aging_bucket=_aging_bucket(days_since),
            )
        )
    return InventoryAgingReport(rows=rows)


# ============================================================================
# Shared — Average Daily Sales (FR-G2), used by both Fast-Movers and Purchase Triggers
# ============================================================================


@dataclass
class _AdsEntry:
    sku: SKU
    units_sold: int
    ads: Decimal


async def _compute_ads(db: AsyncSession, window_days: int) -> dict[str, _AdsEntry]:
    """Units sold per active SKU in the last `window_days`, net of returns in the
    same window (a returned unit wasn't really "sold" for velocity purposes)."""
    cutoff = date.today() - timedelta(days=window_days)

    sold_q = (
        select(OrderItem.sku_id, func.coalesce(func.sum(OrderItem.quantity), 0).label("qty"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.order_date >= cutoff)
        .group_by(OrderItem.sku_id)
    )
    sold_by_sku = {row.sku_id: row.qty for row in (await db.execute(sold_q)).all()}

    returned_q = (
        select(Return.sku_id, func.coalesce(func.sum(Return.quantity), 0).label("qty"))
        .where(Return.return_date >= cutoff)
        .group_by(Return.sku_id)
    )
    returned_by_sku = {row.sku_id: row.qty for row in (await db.execute(returned_q)).all()}

    skus = (await db.execute(select(SKU).where(SKU.is_active.is_(True)))).scalars().all()

    entries: dict[str, _AdsEntry] = {}
    for sku in skus:
        net_units = max(sold_by_sku.get(sku.id, 0) - returned_by_sku.get(sku.id, 0), 0)
        if net_units <= 0:
            continue  # FR-G2: fast-mover ranking is only over SKUs with sales > 0
        ads = (Decimal(net_units) / Decimal(window_days)).quantize(Decimal("0.0001"))
        entries[sku.id] = _AdsEntry(sku=sku, units_sold=net_units, ads=ads)
    return entries


def _days_remaining(stock_qty: int, ads: Decimal) -> Decimal | None:
    if ads <= 0:
        return None
    return (Decimal(stock_qty) / ads).quantize(Decimal("0.1"))


async def _fast_mover_ids(
    db: AsyncSession, ads_entries: dict[str, _AdsEntry], top_percentile: int
) -> list[str]:
    """Top P% of active SKUs-with-sales, ranked by units sold — same population
    and cutoff logic used by both the Fast-Movers report and Purchase Triggers,
    so the two stay consistent with each other (Section 3 of the addendum
    depends on this: a trigger requires "AND flagged fast-moving")."""
    if not ads_entries:
        return []
    ranked = sorted(ads_entries.values(), key=lambda e: e.units_sold, reverse=True)
    cutoff_count = max(1, math.ceil(len(ranked) * (top_percentile / 100)))
    return [e.sku.id for e in ranked[:cutoff_count]]


# ============================================================================
# FR-G2 — Fast-Moving SKUs
# ============================================================================


async def get_fast_movers_report(db: AsyncSession, default_window_days: int, default_percentile: int) -> FastMoversReport:
    window_days = await _get_int_setting(db, ADS_WINDOW_DAYS_KEY, default_window_days)
    top_percentile = await _get_int_setting(db, FAST_MOVER_TOP_PERCENTILE_KEY, default_percentile)

    ads_entries = await _compute_ads(db, window_days)
    fast_mover_ids = set(await _fast_mover_ids(db, ads_entries, top_percentile))

    rows = [
        FastMoverRow(
            sku_id=entry.sku.id,
            sku_code=entry.sku.code,
            sku_name=entry.sku.name,
            units_sold_in_window=entry.units_sold,
            average_daily_sales=entry.ads,
            current_stock_qty=entry.sku.current_stock_qty,
            days_of_stock_remaining=_days_remaining(entry.sku.current_stock_qty, entry.ads),
        )
        for sku_id, entry in ads_entries.items()
        if sku_id in fast_mover_ids
    ]
    rows.sort(key=lambda r: r.units_sold_in_window, reverse=True)
    return FastMoversReport(window_days=window_days, top_percentile=top_percentile, rows=rows)


# ============================================================================
# FR-G3 — Purchase Trigger Alerts
# ============================================================================


async def _last_vendor_by_sku(db: AsyncSession, sku_ids: list[str]) -> dict[str, str]:
    if not sku_ids:
        return {}
    q = (
        select(PurchaseItem.sku_id, Purchase.vendor, Purchase.purchase_date)
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .where(PurchaseItem.sku_id.in_(sku_ids))
        .order_by(PurchaseItem.sku_id, Purchase.purchase_date.desc())
    )
    result: dict[str, str] = {}
    for row in (await db.execute(q)).all():
        # first row per sku_id (thanks to the ORDER BY) is the most recent purchase
        result.setdefault(row.sku_id, row.vendor)
    return result


async def get_purchase_triggers_report(
    db: AsyncSession,
    default_ads_window_days: int,
    default_percentile: int,
    default_safety_buffer_days: int,
    default_target_coverage_days: int,
    default_lead_time_days: int,
) -> PurchaseTriggersReport:
    window_days = await _get_int_setting(db, ADS_WINDOW_DAYS_KEY, default_ads_window_days)
    top_percentile = await _get_int_setting(db, FAST_MOVER_TOP_PERCENTILE_KEY, default_percentile)
    safety_buffer_days = await _get_int_setting(db, SAFETY_BUFFER_DAYS_KEY, default_safety_buffer_days)
    target_coverage_days = await _get_int_setting(db, TARGET_COVERAGE_DAYS_KEY, default_target_coverage_days)
    fallback_lead_time = await _get_int_setting(db, DEFAULT_LEAD_TIME_DAYS_KEY, default_lead_time_days)

    ads_entries = await _compute_ads(db, window_days)
    fast_mover_ids = set(await _fast_mover_ids(db, ads_entries, top_percentile))
    fast_movers = {sku_id: e for sku_id, e in ads_entries.items() if sku_id in fast_mover_ids}

    last_vendor_by_sku = await _last_vendor_by_sku(db, list(fast_movers.keys()))

    rows: list[PurchaseTriggerRow] = []
    for sku_id, entry in fast_movers.items():
        lead_time_days = entry.sku.lead_time_days if entry.sku.lead_time_days is not None else fallback_lead_time
        safety_stock = entry.ads * safety_buffer_days
        reorder_point = (entry.ads * lead_time_days) + safety_stock

        if Decimal(entry.sku.current_stock_qty) > reorder_point:
            continue  # not past reorder point — no trigger for this SKU

        raw_suggested = (entry.ads * target_coverage_days) - Decimal(entry.sku.current_stock_qty)
        suggested_qty = max(0, int(raw_suggested.to_integral_value(rounding=ROUND_HALF_UP)))

        rows.append(
            PurchaseTriggerRow(
                sku_id=entry.sku.id,
                sku_code=entry.sku.code,
                sku_name=entry.sku.name,
                current_stock_qty=entry.sku.current_stock_qty,
                average_daily_sales=entry.ads,
                days_of_stock_remaining=_days_remaining(entry.sku.current_stock_qty, entry.ads),
                reorder_point=reorder_point.quantize(Decimal("0.01")),
                suggested_purchase_qty=suggested_qty,
                last_vendor_name=last_vendor_by_sku.get(sku_id),
            )
        )

    rows.sort(key=lambda r: (r.days_of_stock_remaining is None, r.days_of_stock_remaining))
    total_value = sum(
        (Decimal(r.suggested_purchase_qty) * fast_movers[r.sku_id].sku.current_avg_cost for r in rows),
        Decimal("0"),
    ).quantize(Decimal("0.01"))
    return PurchaseTriggersReport(rows=rows, total_suggested_purchase_value=total_value)
