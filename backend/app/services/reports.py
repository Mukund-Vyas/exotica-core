"""
Reporting & inventory intelligence — FR-C1, FR-C2, FR-C3, FR-D1.

All P&L figures are built from the write-once snapshot fields on OrderItem
(never recomputed from current price/cost/commission), netted against Return
reversals in the same window, so reports stay stable even as master data changes
later (BRD Section 4.1, "Data Retention" NFR).
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import SKU, Channel
from app.models.settings import DEAD_STOCK_WINDOW_KEY, SystemSetting
from app.models.transaction import Order, OrderItem, Payment, Purchase, PurchaseItem, Return
from app.schemas.reports import (
    AuditLogRow,
    ChannelPnLRow,
    DeadStockReport,
    DeadStockRow,
    InventoryValuationReport,
    InventoryValuationRow,
    PerformanceRow,
    RankMetric,
    SKUPnLRow,
)


def _margin_pct(net_profit: Decimal, revenue: Decimal) -> Decimal | None:
    if revenue == 0:
        return None
    return (net_profit / revenue * Decimal("100")).quantize(Decimal("0.01"))


async def get_dead_stock_window_days(db: AsyncSession, default_days: int) -> int:
    result = await db.execute(
        select(SystemSetting.value).where(SystemSetting.key == DEAD_STOCK_WINDOW_KEY)
    )
    value = result.scalar_one_or_none()
    return int(value) if value is not None else default_days


# ============================================================================
# FR-C1 / FR-D1 — Channel & SKU P&L
# ============================================================================


async def get_channel_pnl(
    db: AsyncSession, date_from: date, date_to: date, channel_id: str | None = None
) -> list[ChannelPnLRow]:
    sales_q = (
        select(
            Order.channel_id,
            func.coalesce(func.sum(OrderItem.revenue), 0).label("revenue"),
            func.coalesce(func.sum(OrderItem.commission_amount_at_sale), 0).label("commission"),
            func.coalesce(
                func.sum(OrderItem.quantity * OrderItem.cost_price_at_sale), 0
            ).label("cogs"),
            func.coalesce(func.sum(OrderItem.net_profit), 0).label("net_profit"),
        )
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(Order.order_date.between(date_from, date_to))
        .group_by(Order.channel_id)
    )
    if channel_id:
        sales_q = sales_q.where(Order.channel_id == channel_id)
    sales_rows = {row.channel_id: row for row in (await db.execute(sales_q)).all()}

    returns_q = (
        select(
            Return.channel_id,
            func.coalesce(func.sum(Return.revenue_reversed), 0).label("revenue"),
            func.coalesce(func.sum(Return.commission_reversed), 0).label("commission"),
            func.coalesce(func.sum(Return.cost_reversed), 0).label("cogs"),
            func.coalesce(func.sum(Return.net_profit_reversed), 0).label("net_profit"),
        )
        .where(Return.return_date.between(date_from, date_to))
        .group_by(Return.channel_id)
    )
    if channel_id:
        returns_q = returns_q.where(Return.channel_id == channel_id)
    return_rows = {row.channel_id: row for row in (await db.execute(returns_q)).all()}

    channels = (await db.execute(select(Channel))).scalars().all()
    result: list[ChannelPnLRow] = []
    for ch in channels:
        if channel_id and ch.id != channel_id:
            continue
        s = sales_rows.get(ch.id)
        r = return_rows.get(ch.id)
        revenue = Decimal(s.revenue if s else 0) - Decimal(r.revenue if r else 0)
        commission = Decimal(s.commission if s else 0) - Decimal(r.commission if r else 0)
        cogs = Decimal(s.cogs if s else 0) - Decimal(r.cogs if r else 0)
        net_profit = Decimal(s.net_profit if s else 0) - Decimal(r.net_profit if r else 0)
        if s is None and r is None:
            continue
        result.append(
            ChannelPnLRow(
                channel_id=ch.id,
                channel_name=ch.name,
                revenue=revenue,
                commission=commission,
                cogs=cogs,
                net_profit=net_profit,
                margin_pct=_margin_pct(net_profit, revenue),
            )
        )
    return result


async def get_sku_pnl(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_id: str | None = None,
    sku_id: str | None = None,
) -> list[SKUPnLRow]:
    sales_q = (
        select(
            OrderItem.sku_id,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(OrderItem.revenue), 0).label("revenue"),
            func.coalesce(func.sum(OrderItem.commission_amount_at_sale), 0).label("commission"),
            func.coalesce(
                func.sum(OrderItem.quantity * OrderItem.cost_price_at_sale), 0
            ).label("cogs"),
            func.coalesce(func.sum(OrderItem.net_profit), 0).label("net_profit"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.order_date.between(date_from, date_to))
        .group_by(OrderItem.sku_id)
    )
    if channel_id:
        sales_q = sales_q.where(Order.channel_id == channel_id)
    if sku_id:
        sales_q = sales_q.where(OrderItem.sku_id == sku_id)
    sales_rows = {row.sku_id: row for row in (await db.execute(sales_q)).all()}

    returns_q = (
        select(
            Return.sku_id,
            func.coalesce(func.sum(Return.quantity), 0).label("qty"),
            func.coalesce(func.sum(Return.revenue_reversed), 0).label("revenue"),
            func.coalesce(func.sum(Return.commission_reversed), 0).label("commission"),
            func.coalesce(func.sum(Return.cost_reversed), 0).label("cogs"),
            func.coalesce(func.sum(Return.net_profit_reversed), 0).label("net_profit"),
        )
        .where(Return.return_date.between(date_from, date_to))
        .group_by(Return.sku_id)
    )
    if channel_id:
        returns_q = returns_q.where(Return.channel_id == channel_id)
    if sku_id:
        returns_q = returns_q.where(Return.sku_id == sku_id)
    return_rows = {row.sku_id: row for row in (await db.execute(returns_q)).all()}

    sku_ids = set(sales_rows) | set(return_rows)
    if not sku_ids:
        return []
    skus = {s.id: s for s in (await db.execute(select(SKU).where(SKU.id.in_(sku_ids)))).scalars()}

    result: list[SKUPnLRow] = []
    for sid in sku_ids:
        sku = skus.get(sid)
        if sku is None:
            continue
        s = sales_rows.get(sid)
        r = return_rows.get(sid)
        qty = int(s.qty if s else 0) - int(r.qty if r else 0)
        revenue = Decimal(s.revenue if s else 0) - Decimal(r.revenue if r else 0)
        commission = Decimal(s.commission if s else 0) - Decimal(r.commission if r else 0)
        cogs = Decimal(s.cogs if s else 0) - Decimal(r.cogs if r else 0)
        net_profit = Decimal(s.net_profit if s else 0) - Decimal(r.net_profit if r else 0)
        result.append(
            SKUPnLRow(
                sku_id=sid,
                sku_code=sku.code,
                sku_name=sku.name,
                quantity_sold=qty,
                revenue=revenue,
                commission=commission,
                cogs=cogs,
                net_profit=net_profit,
                margin_pct=_margin_pct(net_profit, revenue),
            )
        )
    return result


# ============================================================================
# FR-D1 — Inventory valuation
# ============================================================================


async def get_inventory_valuation(db: AsyncSession) -> InventoryValuationReport:
    skus = (await db.execute(select(SKU).where(SKU.is_active.is_(True)))).scalars().all()
    rows = [
        InventoryValuationRow(
            sku_id=sku.id,
            sku_code=sku.code,
            sku_name=sku.name,
            stock_qty=sku.current_stock_qty,
            avg_cost=sku.current_avg_cost,
            stock_value=(Decimal(sku.current_stock_qty) * sku.current_avg_cost).quantize(Decimal("0.01")),
        )
        for sku in skus
    ]
    total = sum((r.stock_value for r in rows), Decimal("0"))
    return InventoryValuationReport(rows=rows, total_stock_value=total)


# ============================================================================
# FR-C2 — Dead stock detection
# ============================================================================


async def get_dead_stock_report(db: AsyncSession, default_window_days: int) -> DeadStockReport:
    window_days = await get_dead_stock_window_days(db, default_window_days)
    cutoff = date.today() - timedelta(days=window_days)

    last_sale_q = (
        select(OrderItem.sku_id, func.max(Order.order_date).label("last_sale_date"))
        .join(Order, Order.id == OrderItem.order_id)
        .group_by(OrderItem.sku_id)
    )
    last_sale_by_sku = {row.sku_id: row.last_sale_date for row in (await db.execute(last_sale_q)).all()}

    skus = (
        (await db.execute(select(SKU).where(SKU.is_active.is_(True), SKU.current_stock_qty > 0)))
        .scalars()
        .all()
    )

    rows: list[DeadStockRow] = []
    for sku in skus:
        last_sale = last_sale_by_sku.get(sku.id)
        # Dead stock flag (BRD Section 7): stock > 0 AND no sale within the window.
        if last_sale is None or last_sale < cutoff:
            capital_blocked = (Decimal(sku.current_stock_qty) * sku.current_avg_cost).quantize(
                Decimal("0.01")
            )
            rows.append(
                DeadStockRow(
                    sku_id=sku.id,
                    sku_code=sku.code,
                    sku_name=sku.name,
                    stock_qty=sku.current_stock_qty,
                    avg_cost=sku.current_avg_cost,
                    capital_blocked=capital_blocked,
                    last_sale_date=last_sale,
                )
            )

    total = sum((r.capital_blocked for r in rows), Decimal("0"))
    return DeadStockReport(window_days=window_days, rows=rows, total_capital_blocked=total)


# ============================================================================
# FR-C3 — Performance ranking
# ============================================================================


async def get_performance_ranking(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    metric: RankMetric,
    channel_id: str | None = None,
    descending: bool = True,
    limit: int = 20,
) -> list[PerformanceRow]:
    pnl_rows = await get_sku_pnl(db, date_from, date_to, channel_id=channel_id)
    rows = [
        PerformanceRow(
            sku_id=r.sku_id,
            sku_code=r.sku_code,
            sku_name=r.sku_name,
            revenue=r.revenue,
            quantity_sold=r.quantity_sold,
            net_profit=r.net_profit,
            margin_pct=r.margin_pct,
        )
        for r in pnl_rows
    ]

    def sort_key(row: PerformanceRow) -> Decimal:
        if metric == "revenue":
            return row.revenue
        if metric == "quantity_sold":
            return Decimal(row.quantity_sold)
        return row.margin_pct if row.margin_pct is not None else Decimal("-999999")

    rows.sort(key=sort_key, reverse=descending)
    return rows[:limit]


# ============================================================================
# FR-D1 — Entry audit log
# ============================================================================


async def get_audit_log(
    db: AsyncSession, date_from: date, date_to: date, limit: int = 50, offset: int = 0
) -> tuple[list[AuditLogRow], int]:
    """Raw, filterable list of all purchase/sale/return/payment entries, for data verification."""
    rows: list[AuditLogRow] = []

    purchases = (
        (
            await db.execute(
                select(Purchase).where(Purchase.purchase_date.between(date_from, date_to))
            )
        )
        .scalars()
        .all()
    )
    for p in purchases:
        rows.append(
            AuditLogRow(
                entry_type="purchase",
                entry_id=p.id,
                entry_date=p.purchase_date,
                description=f"Purchase from {p.vendor}",
                amount=None,
                created_by_id=p.created_by_id,
                created_at=p.created_at,
            )
        )

    orders = (
        (await db.execute(select(Order).where(Order.order_date.between(date_from, date_to))))
        .scalars()
        .all()
    )
    for o in orders:
        rows.append(
            AuditLogRow(
                entry_type="order",
                entry_id=o.id,
                entry_date=o.order_date,
                description=f"Order on channel {o.channel_id}" + (f" — {o.party_name}" if o.party_name else ""),
                amount=None,
                created_by_id=o.created_by_id,
                created_at=o.created_at,
            )
        )

    returns_ = (
        (await db.execute(select(Return).where(Return.return_date.between(date_from, date_to))))
        .scalars()
        .all()
    )
    for r in returns_:
        rows.append(
            AuditLogRow(
                entry_type="return",
                entry_id=r.id,
                entry_date=r.return_date,
                description=f"Return of {r.quantity} unit(s)",
                amount=r.revenue_reversed,
                created_by_id=r.created_by_id,
                created_at=r.created_at,
            )
        )

    payments = (
        (await db.execute(select(Payment).where(Payment.payment_date.between(date_from, date_to))))
        .scalars()
        .all()
    )
    for pay in payments:
        rows.append(
            AuditLogRow(
                entry_type="payment",
                entry_id=pay.id,
                entry_date=pay.payment_date,
                description="Payment received against receivable",
                amount=pay.amount,
                created_by_id=pay.created_by_id,
                created_at=pay.created_at,
            )
        )

    rows.sort(key=lambda r: r.created_at, reverse=True)
    total = len(rows)
    return rows[offset : offset + limit], total
