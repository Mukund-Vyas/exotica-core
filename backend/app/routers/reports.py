from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.user import User
from app.schemas.common import Page
from app.schemas.reports import (
    AuditLogRow,
    ChannelPnLRow,
    DeadStockReport,
    FastMoversReport,
    InventoryAgingReport,
    InventoryValuationReport,
    PerformanceRow,
    PurchaseTriggersReport,
    RankMetric,
    SKUPnLRow,
)
from app.services import inventory_intelligence, reports as reports_service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/channel-pnl", response_model=list[ChannelPnLRow])
async def channel_pnl(
    date_from: date,
    date_to: date,
    channel_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> list[ChannelPnLRow]:
    return await reports_service.get_channel_pnl(db, date_from, date_to, channel_id)


@router.get("/sku-pnl", response_model=list[SKUPnLRow])
async def sku_pnl(
    date_from: date,
    date_to: date,
    channel_id: str | None = None,
    sku_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> list[SKUPnLRow]:
    return await reports_service.get_sku_pnl(db, date_from, date_to, channel_id, sku_id)


@router.get("/inventory-valuation", response_model=InventoryValuationReport)
async def inventory_valuation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> InventoryValuationReport:
    return await reports_service.get_inventory_valuation(db)


@router.get("/dead-stock", response_model=DeadStockReport)
async def dead_stock(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> DeadStockReport:
    return await reports_service.get_dead_stock_report(db, settings.dead_stock_window_days)


@router.get("/performance", response_model=list[PerformanceRow])
async def performance_ranking(
    date_from: date,
    date_to: date,
    metric: RankMetric = "revenue",
    channel_id: str | None = None,
    descending: bool = True,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> list[PerformanceRow]:
    """FR-C3 — ranked independently by revenue, quantity_sold, or margin_pct."""
    return await reports_service.get_performance_ranking(
        db, date_from, date_to, metric, channel_id, descending, limit
    )


@router.get("/audit-log", response_model=Page[AuditLogRow])
async def audit_log(
    date_from: date,
    date_to: date,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> Page[AuditLogRow]:
    rows, total = await reports_service.get_audit_log(
        db, date_from, date_to, pagination.limit, pagination.offset
    )
    return Page(items=rows, total=total, limit=pagination.limit, offset=pagination.offset)


# ============================================================================
# Epic G — Inventory Intelligence (BRD Addendum)
# ============================================================================


@router.get("/inventory-aging", response_model=InventoryAgingReport)
async def inventory_aging(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> InventoryAgingReport:
    """FR-G1 — days since last restock, bucketed. A proxy for replenishment
    staleness, not true lot-level FIFO aging (this system uses weighted-average
    costing, not batch tracking)."""
    return await inventory_intelligence.get_inventory_aging_report(db)


@router.get("/fast-movers", response_model=FastMoversReport)
async def fast_movers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> FastMoversReport:
    """FR-G2 — velocity-based: top P% of active SKUs-with-sales by units sold
    in the ADS window, independent of current stock level."""
    return await inventory_intelligence.get_fast_movers_report(
        db, settings.ads_window_days, settings.fast_mover_top_percentile
    )


@router.get("/purchase-triggers", response_model=PurchaseTriggersReport)
async def purchase_triggers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("reports:view")),
) -> PurchaseTriggersReport:
    """FR-G3 — fast-moving AND past its reorder point. A high-velocity SKU with
    plenty of stock won't trigger; a slow-moving SKU that's merely low won't
    trigger either — only the intersection does."""
    return await inventory_intelligence.get_purchase_triggers_report(
        db,
        settings.ads_window_days,
        settings.fast_mover_top_percentile,
        settings.safety_buffer_days,
        settings.target_coverage_days,
        settings.default_lead_time_days,
    )
