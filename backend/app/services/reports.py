"""
Reporting & inventory intelligence — FR-C1, FR-C2, FR-C3, FR-D1.

All P&L figures are built from the write-once snapshot fields on OrderItem
(never recomputed from current price/cost/commission), netted against Return
reversals in the same window, so reports stay stable even as master data changes
later (BRD Section 4.1, "Data Retention" NFR).

COGS is derived as ``revenue - commission - net_profit`` rather than re-summing
``qty x cost``: net profit was stored using per-line rounded COGS, so re-summing
unrounded products could drift by a few paise and make the displayed
Revenue - Commission - COGS != Net Profit. Deriving it guarantees the identity.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.timeutil import today_local
from app.models.product import SKU, Channel
from app.models.settings import DEAD_STOCK_WINDOW_KEY
from app.models.transaction import (
    Order,
    OrderItem,
    Payment,
    Purchase,
    PurchaseItem,
    Receivable,
    Return,
)
from app.models.user import User
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
from app.core.money import money
from app.services.settings import get_int_setting


def check_date_range(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise AppError(
            code="invalid_date_range", detail="'From' date must be on or before the 'To' date."
        )


def _margin_pct(net_profit: Decimal, revenue: Decimal) -> Decimal | None:
    if revenue == 0:
        return None
    return (net_profit / revenue * Decimal("100")).quantize(Decimal("0.01"))


async def get_dead_stock_window_days(db: AsyncSession, default_days: int) -> int:
    return await get_int_setting(db, DEAD_STOCK_WINDOW_KEY, default_days)


# ============================================================================
# FR-C1 / FR-D1 — Channel & SKU P&L
# ============================================================================


async def get_channel_pnl(
    db: AsyncSession, date_from: date, date_to: date, channel_id: str | None = None
) -> list[ChannelPnLRow]:
    check_date_range(date_from, date_to)
    sales_q = (
        select(
            Order.channel_id,
            func.coalesce(func.sum(OrderItem.revenue), 0).label("revenue"),
            func.coalesce(func.sum(OrderItem.commission_amount_at_sale), 0).label("commission"),
            func.coalesce(
                func.sum(OrderItem.revenue - OrderItem.commission_amount_at_sale - OrderItem.net_profit), 0
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
    result.sort(key=lambda r: r.channel_name)
    return result


async def get_sku_pnl(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_id: str | None = None,
    sku_id: str | None = None,
) -> list[SKUPnLRow]:
    check_date_range(date_from, date_to)
    sales_q = (
        select(
            OrderItem.sku_id,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(OrderItem.revenue), 0).label("revenue"),
            func.coalesce(func.sum(OrderItem.commission_amount_at_sale), 0).label("commission"),
            func.coalesce(
                func.sum(OrderItem.revenue - OrderItem.commission_amount_at_sale - OrderItem.net_profit), 0
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
    for sid in sorted(sku_ids):
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
    result.sort(key=lambda r: r.sku_code)
    return result


# ============================================================================
# FR-D1 — Inventory valuation
# ============================================================================


async def get_inventory_valuation(db: AsyncSession) -> InventoryValuationReport:
    # Discontinued SKUs that still hold stock are still inventory the business
    # paid for, so they stay in the valuation (only empty discontinued SKUs drop out).
    skus = (
        (
            await db.execute(
                select(SKU)
                .where((SKU.is_active.is_(True)) | (SKU.current_stock_qty != 0))
                .order_by(SKU.code)
            )
        )
        .scalars()
        .all()
    )
    rows = [
        InventoryValuationRow(
            sku_id=sku.id,
            sku_code=sku.code,
            sku_name=sku.name,
            is_active=sku.is_active,
            stock_qty=sku.current_stock_qty,
            avg_cost=sku.current_avg_cost,
            stock_value=money(Decimal(sku.current_stock_qty) * sku.current_avg_cost),
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
    cutoff = today_local() - timedelta(days=window_days)

    last_sale_q = (
        select(OrderItem.sku_id, func.max(Order.order_date).label("last_sale_date"))
        .join(Order, Order.id == OrderItem.order_id)
        .group_by(OrderItem.sku_id)
    )
    last_sale_by_sku = {row.sku_id: row.last_sale_date for row in (await db.execute(last_sale_q)).all()}

    first_stock_in_q = (
        select(PurchaseItem.sku_id, func.min(Purchase.purchase_date).label("first_in"))
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .group_by(PurchaseItem.sku_id)
    )
    first_stock_in = {row.sku_id: row.first_in for row in (await db.execute(first_stock_in_q)).all()}

    # Discontinued SKUs are included on purpose: unsold stock of a product the
    # business has stopped selling is the clearest example of blocked capital.
    skus = (
        (await db.execute(select(SKU).where(SKU.current_stock_qty > 0).order_by(SKU.code)))
        .scalars()
        .all()
    )

    rows: list[DeadStockRow] = []
    for sku in skus:
        last_sale = last_sale_by_sku.get(sku.id)
        # BRD Section 7: stock > 0 AND no sale within the window. A SKU that has
        # never sold is measured from when its stock arrived, so brand-new stock
        # isn't flagged "dead" on day one.
        reference = last_sale or first_stock_in.get(sku.id) or sku.created_at.date()
        if reference < cutoff:
            rows.append(
                DeadStockRow(
                    sku_id=sku.id,
                    sku_code=sku.code,
                    sku_name=sku.name,
                    is_active=sku.is_active,
                    stock_qty=sku.current_stock_qty,
                    avg_cost=sku.current_avg_cost,
                    capital_blocked=money(Decimal(sku.current_stock_qty) * sku.current_avg_cost),
                    last_sale_date=last_sale,
                )
            )

    rows.sort(key=lambda r: r.capital_blocked, reverse=True)
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
    if metric == "margin_pct":
        # A SKU with no net revenue (e.g. everything returned) has no margin to rank.
        rows = [r for r in rows if r.margin_pct is not None]

    def value(row: PerformanceRow) -> Decimal:
        if metric == "revenue":
            return row.revenue
        if metric == "quantity_sold":
            return Decimal(row.quantity_sold)
        if metric == "net_profit":
            return row.net_profit
        return row.margin_pct  # type: ignore[return-value]

    # Sort by code first so ties are broken the same way every time, then by the
    # metric (sort is stable, and reverse=True preserves the relative order of ties).
    rows.sort(key=lambda r: r.sku_code)
    rows.sort(key=value, reverse=descending)
    return rows[:limit]


# ============================================================================
# FR-D1 — Entry audit log
# ============================================================================


async def get_audit_log(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    limit: int = 50,
    offset: int = 0,
    channel_id: str | None = None,
    entry_type: str | None = None,
) -> tuple[list[AuditLogRow], int]:
    """Raw, filterable list of all purchase/sale/return/payment entries, for data verification.

    Each row carries the channel name, the amount involved and who entered it, so
    the log is usable on its own instead of showing bare IDs.
    """
    check_date_range(date_from, date_to)
    channel_names = {c.id: c.name for c in (await db.execute(select(Channel))).scalars()}
    usernames = {u.id: u.username for u in (await db.execute(select(User))).scalars()}
    skus = {s.id: s.code for s in (await db.execute(select(SKU))).scalars()}
    rows: list[AuditLogRow] = []

    def add(kind: str, **kw) -> None:
        if entry_type and entry_type != kind:
            return
        rows.append(AuditLogRow(entry_type=kind, created_by=usernames.get(kw["created_by_id"]), **kw))

    if not channel_id:  # purchases are not tied to a sales channel
        totals = {
            pid: total
            for pid, total in (
                await db.execute(
                    select(PurchaseItem.purchase_id, func.sum(PurchaseItem.line_total)).group_by(
                        PurchaseItem.purchase_id
                    )
                )
            ).all()
        }
        for p in (
            await db.execute(select(Purchase).where(Purchase.purchase_date.between(date_from, date_to)))
        ).scalars():
            add(
                "purchase",
                entry_id=p.id,
                entry_date=p.purchase_date,
                description=f"Purchase from {p.vendor}",
                amount=totals.get(p.id),
                created_by_id=p.created_by_id,
                created_at=p.created_at,
            )

    order_totals = {
        oid: total
        for oid, total in (
            await db.execute(select(OrderItem.order_id, func.sum(OrderItem.revenue)).group_by(OrderItem.order_id))
        ).all()
    }
    order_q = select(Order).where(Order.order_date.between(date_from, date_to))
    if channel_id:
        order_q = order_q.where(Order.channel_id == channel_id)
    for o in (await db.execute(order_q)).scalars():
        add(
            "order",
            entry_id=o.id,
            entry_date=o.order_date,
            description=f"Sale on {channel_names.get(o.channel_id, 'unknown channel')}"
            + (f" — {o.party_name}" if o.party_name else ""),
            amount=order_totals.get(o.id),
            channel_id=o.channel_id,
            channel_name=channel_names.get(o.channel_id),
            created_by_id=o.created_by_id,
            created_at=o.created_at,
        )

    ret_q = select(Return).where(Return.return_date.between(date_from, date_to))
    if channel_id:
        ret_q = ret_q.where(Return.channel_id == channel_id)
    for r in (await db.execute(ret_q)).scalars():
        add(
            "return",
            entry_id=r.id,
            entry_date=r.return_date,
            description=f"Return of {r.quantity} × {skus.get(r.sku_id, 'SKU')} on {channel_names.get(r.channel_id, 'unknown channel')}",
            amount=r.revenue_reversed,
            channel_id=r.channel_id,
            channel_name=channel_names.get(r.channel_id),
            created_by_id=r.created_by_id,
            created_at=r.created_at,
        )

    pay_q = (
        select(Payment, Order)
        .join(Receivable, Receivable.id == Payment.receivable_id)
        .join(Order, Order.id == Receivable.order_id)
        .where(Payment.payment_date.between(date_from, date_to))
    )
    if channel_id:
        pay_q = pay_q.where(Order.channel_id == channel_id)
    for pay, order in (await db.execute(pay_q)).all():
        add(
            "payment",
            entry_id=pay.id,
            entry_date=pay.payment_date,
            description="Payment received" + (f" — {order.party_name}" if order.party_name else ""),
            amount=pay.amount,
            channel_id=order.channel_id,
            channel_name=channel_names.get(order.channel_id),
            created_by_id=pay.created_by_id,
            created_at=pay.created_at,
        )

    rows.sort(key=lambda r: (r.created_at, r.entry_id), reverse=True)
    total = len(rows)
    return rows[offset : offset + limit], total
