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
