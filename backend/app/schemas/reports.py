from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class ChannelPnLRow(BaseModel):
    channel_id: str
    channel_name: str
    revenue: Decimal
    commission: Decimal
    cogs: Decimal
    net_profit: Decimal
    margin_pct: Decimal | None  # null when revenue is 0


class SKUPnLRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    quantity_sold: int
    revenue: Decimal
    commission: Decimal
    cogs: Decimal
    net_profit: Decimal
    margin_pct: Decimal | None


class InventoryValuationRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    stock_qty: int
    avg_cost: Decimal
    stock_value: Decimal


class InventoryValuationReport(BaseModel):
    rows: list[InventoryValuationRow]
    total_stock_value: Decimal


class DeadStockRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    stock_qty: int
    avg_cost: Decimal
    capital_blocked: Decimal
    last_sale_date: date | None  # null = never sold


class DeadStockReport(BaseModel):
    window_days: int
    rows: list[DeadStockRow]
    total_capital_blocked: Decimal


class PerformanceRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    revenue: Decimal
    quantity_sold: int
    net_profit: Decimal
    margin_pct: Decimal | None


RankMetric = Literal["revenue", "quantity_sold", "margin_pct"]


class AuditLogRow(BaseModel):
    entry_type: Literal["purchase", "order", "return", "payment"]
    entry_id: str
    entry_date: date
    description: str
    amount: Decimal | None
    created_by_id: str
    created_at: datetime


# ============================================================================
# Epic G — Inventory Intelligence (BRD Addendum)
# ============================================================================

AgingBucket = Literal["0-30", "31-60", "61-90", "90+"]


class InventoryAgingRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    category: str
    stock_qty: int
    last_purchase_date: date  # falls back to SKU creation date if never repurchased (FR-G1)
    days_since_last_purchase: int
    aging_bucket: AgingBucket


class InventoryAgingReport(BaseModel):
    rows: list[InventoryAgingRow]


class FastMoverRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    units_sold_in_window: int
    average_daily_sales: Decimal
    current_stock_qty: int
    days_of_stock_remaining: Decimal | None  # null when ADS is 0 (can't divide)


class FastMoversReport(BaseModel):
    window_days: int
    top_percentile: int
    rows: list[FastMoverRow]  # sorted by units_sold_in_window desc, already filtered to the top P%


class PurchaseTriggerRow(BaseModel):
    sku_id: str
    sku_code: str
    sku_name: str
    current_stock_qty: int
    average_daily_sales: Decimal
    days_of_stock_remaining: Decimal | None
    reorder_point: Decimal
    suggested_purchase_qty: int
    last_vendor_name: str | None  # from Purchase history; null if never purchased


class PurchaseTriggersReport(BaseModel):
    rows: list[PurchaseTriggerRow]
    total_suggested_purchase_value: Decimal  # sum(suggested_qty * current_avg_cost) across all rows
