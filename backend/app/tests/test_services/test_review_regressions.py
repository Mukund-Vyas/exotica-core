"""
Regression tests for defects found in the code review. Each test is named after
the behaviour it protects; every one failed against the pre-review code.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.exceptions import AppError
from app.core.money import money
from app.core.timeutil import today_local
from app.models.product import SKU, CommissionType
from app.models.transaction import PaymentTerm
from app.schemas.product import ChannelCommissionCreate, SKUCreate, SKUUpdate
from app.schemas.transaction import OrderCreate, OrderItemCreate, PurchaseCreate, PurchaseItemCreate, ReturnCreate
from app.services.inventory import calculate_weighted_avg_cost, record_purchase
from app.services.orders import create_order
from app.services.pricing import calculate_commission, set_channel_commission, set_channel_price
from app.services.reports import get_channel_pnl, get_dead_stock_report, get_inventory_valuation, get_performance_ranking, get_sku_pnl
from app.services.returns import record_return
from app.services.settings import validate_setting_value

TODAY = today_local


async def _sku(db, **kw):
    sku = SKU(id=str(uuid.uuid4()), code=kw.pop("code", "X1"), name="n", category="c", size_variant="s", **kw)
    db.add(sku)
    await db.flush()
    return sku


def _order(channel, sku, qty, **kw):
    return OrderCreate(channel_id=channel.id, order_date=kw.pop("order_date", TODAY()), items=[OrderItemCreate(sku_id=sku.id, quantity=qty)], **kw)


# ---- calculations -----------------------------------------------------------

def test_wac_ignores_negative_stock_instead_of_blending_it():
    # -5 @100 then +10 @120: the old formula gave 140 (above both prices).
    assert calculate_weighted_avg_cost(-5, Decimal("100"), 10, Decimal("120")) == Decimal("120.0000")


def test_wac_when_negative_stock_exactly_cancelled_does_not_zero_the_cost():
    assert calculate_weighted_avg_cost(-5, Decimal("100"), 5, Decimal("90")) == Decimal("90.0000")


def test_money_rounds_half_up_not_bankers():
    assert money(Decimal("3.325")) == Decimal("3.33")  # half-even would give 3.32
    assert money(Decimal("0.125")) == Decimal("0.13")


def test_percentage_commission_rounds_half_up():
    c = type("C", (), {"commission_type": CommissionType.PERCENTAGE, "value": Decimal("10")})
    assert calculate_commission(c, Decimal("33.25"), 1) == Decimal("3.33")


@pytest.mark.asyncio
async def test_final_partial_return_reverses_exactly_the_original_revenue(db_session, owner_user, channel):
    sku = await _sku(db_session, current_stock_qty=10)
    await set_channel_price(db_session, sku.id, channel.id, Decimal("33.33"), owner_user)
    order = await create_order(db_session, _order(channel, sku, 3, ), owner_user)
    line = order.items[0]
    assert line.revenue == Decimal("99.99")
    total = Decimal("0")
    for _ in range(3):
        r = await record_return(db_session, ReturnCreate(sku_id=sku.id, channel_id=channel.id, quantity=1, return_date=TODAY(), order_item_id=line.id), owner_user)
        total += r.revenue_reversed
    assert total == line.revenue  # no stray paisa


@pytest.mark.asyncio
async def test_return_with_wrong_channel_is_rejected(db_session, owner_user, channel, b2b_channel):
    sku = await _sku(db_session, current_stock_qty=10)
    await set_channel_price(db_session, sku.id, channel.id, Decimal("100"), owner_user)
    order = await create_order(db_session, _order(channel, sku, 2), owner_user)
    with pytest.raises(AppError) as exc:
        await record_return(db_session, ReturnCreate(sku_id=sku.id, channel_id=b2b_channel.id, quantity=1, return_date=TODAY(), order_item_id=order.items[0].id), owner_user)
    assert exc.value.code == "return_channel_mismatch"


@pytest.mark.asyncio
async def test_return_with_wrong_sku_is_rejected(db_session, owner_user, channel):
    a = await _sku(db_session, code="A", current_stock_qty=10)
    b = await _sku(db_session, code="B", current_stock_qty=10)
    await set_channel_price(db_session, a.id, channel.id, Decimal("100"), owner_user)
    order = await create_order(db_session, _order(channel, a, 2), owner_user)
    with pytest.raises(AppError) as exc:
        await record_return(db_session, ReturnCreate(sku_id=b.id, channel_id=channel.id, quantity=1, return_date=TODAY(), order_item_id=order.items[0].id), owner_user)
    assert exc.value.code == "return_sku_mismatch"


@pytest.mark.asyncio
async def test_returned_units_reenter_stock_at_their_original_cost(db_session, owner_user, channel, vendor):
    sku = await _sku(db_session, current_stock_qty=10, current_avg_cost=Decimal("100"))
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500"), owner_user)
    order = await create_order(db_session, _order(channel, sku, 5), owner_user)  # sold at cost 100
    await record_purchase(db_session, PurchaseCreate(vendor_id=vendor.id, purchase_date=TODAY(), items=[PurchaseItemCreate(sku_id=sku.id, quantity=5, unit_cost=Decimal("200"))]), owner_user)
    await db_session.refresh(sku)  # stock 10, avg (5*100+5*200)/10 = 150
    assert sku.current_avg_cost == Decimal("150.0000")
    await record_return(db_session, ReturnCreate(sku_id=sku.id, channel_id=channel.id, quantity=5, return_date=TODAY(), order_item_id=order.items[0].id), owner_user)
    await db_session.refresh(sku)
    # 10 @150 + 5 @100 -> 133.3333 (previously stayed at 150, overstating inventory value)
    assert sku.current_stock_qty == 15
    assert sku.current_avg_cost == Decimal("133.3333")


@pytest.mark.asyncio
async def test_negative_stock_sale_then_purchase_uses_new_price_as_cost(db_session, owner_user, channel, vendor):
    sku = await _sku(db_session, current_stock_qty=2, current_avg_cost=Decimal("100"))
    await set_channel_price(db_session, sku.id, channel.id, Decimal("500"), owner_user)
    await create_order(db_session, OrderCreate(channel_id=channel.id, order_date=TODAY(), allow_negative_stock=True, items=[OrderItemCreate(sku_id=sku.id, quantity=5)]), owner_user)
    await record_purchase(db_session, PurchaseCreate(vendor_id=vendor.id, purchase_date=TODAY(), items=[PurchaseItemCreate(sku_id=sku.id, quantity=10, unit_cost=Decimal("120"))]), owner_user)
    await db_session.refresh(sku)
    assert sku.current_stock_qty == 7 and sku.current_avg_cost == Decimal("120.0000")


# ---- business rules ---------------------------------------------------------

@pytest.mark.asyncio
async def test_credit_terms_rejected_on_non_b2b_channel(db_session, owner_user, channel, party):
    sku = await _sku(db_session, current_stock_qty=5)
    await set_channel_price(db_session, sku.id, channel.id, Decimal("100"), owner_user)
    with pytest.raises(AppError) as exc:
        await create_order(db_session, _order(channel, sku, 1, payment_term=PaymentTerm.CREDIT, party_id=party.id, due_date=TODAY() + timedelta(days=5)), owner_user)
    assert exc.value.code == "credit_b2b_only"


@pytest.mark.asyncio
async def test_inactive_party_cannot_be_used_on_new_order(db_session, owner_user, b2b_channel, party):
    sku = await _sku(db_session, current_stock_qty=5)
    await set_channel_price(db_session, sku.id, b2b_channel.id, Decimal("100"), owner_user)
    party.is_active = False
    await db_session.flush()
    with pytest.raises(AppError) as exc:
        await create_order(db_session, _order(b2b_channel, sku, 1, payment_term=PaymentTerm.CREDIT, party_id=party.id, due_date=TODAY()), owner_user)
    assert exc.value.code == "party_inactive"


@pytest.mark.asyncio
async def test_discontinued_sku_cannot_be_purchased(db_session, owner_user, vendor):
    sku = await _sku(db_session, is_active=False)
    with pytest.raises(AppError) as exc:
        await record_purchase(db_session, PurchaseCreate(vendor_id=vendor.id, purchase_date=TODAY(), items=[PurchaseItemCreate(sku_id=sku.id, quantity=1, unit_cost=Decimal("5"))]), owner_user)
    assert exc.value.code == "sku_inactive"


@pytest.mark.asyncio
async def test_price_for_unknown_sku_is_not_found_not_a_crash(db_session, owner_user, channel):
    from app.core.exceptions import NotFoundError
    with pytest.raises(NotFoundError):
        await set_channel_price(db_session, str(uuid.uuid4()), channel.id, Decimal("5"), owner_user)


# ---- input validation -------------------------------------------------------

def test_schema_rejects_bad_input():
    with pytest.raises(ValidationError):
        SKUCreate(code="   ", name="n", category="c", size_variant="s")
    with pytest.raises(ValidationError):
        SKUUpdate(name=None)  # would have hit NOT NULL -> 500
    with pytest.raises(ValidationError):
        SKUUpdate(lead_time_days=-5)
    assert SKUUpdate(lead_time_days=None).lead_time_days is None  # clearing is allowed
    with pytest.raises(ValidationError):
        ChannelCommissionCreate(channel_id=str(uuid.uuid4()), commission_type="percentage", value="150")
    ChannelCommissionCreate(channel_id=str(uuid.uuid4()), commission_type="flat", value="150")  # flat > 100 is fine
    with pytest.raises(ValidationError):
        PurchaseItemCreate(sku_id="not-a-uuid", quantity=1, unit_cost="5")
    with pytest.raises(ValidationError):
        PurchaseItemCreate(sku_id=str(uuid.uuid4()), quantity=3_000_000_000, unit_cost="5")
    with pytest.raises(ValidationError):
        OrderItemCreate(sku_id=str(uuid.uuid4()), quantity=1, selling_price_override="10.999")
    with pytest.raises(ValidationError):
        _ = OrderCreate(channel_id=str(uuid.uuid4()), order_date=TODAY() + timedelta(days=2), items=[OrderItemCreate(sku_id=str(uuid.uuid4()), quantity=1)])
    with pytest.raises(ValidationError):
        _ = OrderCreate(channel_id=str(uuid.uuid4()), order_date=TODAY(), due_date=TODAY() - timedelta(days=1), items=[OrderItemCreate(sku_id=str(uuid.uuid4()), quantity=1)])


def test_setting_validation():
    assert validate_setting_value("dead_stock_window", " 60 ") == "60"
    for key, bad in (("dead_stock_window", "abc"), ("ads_window_days", "0"), ("fast_mover_top_percentile", "101"), ("nope", "1")):
        with pytest.raises(AppError):
            validate_setting_value(key, bad)


# ---- reports ----------------------------------------------------------------

@pytest.mark.asyncio
async def test_pnl_identity_revenue_minus_commission_minus_cogs_equals_profit(db_session, owner_user, channel):
    sku = await _sku(db_session, current_stock_qty=1000, current_avg_cost=Decimal("33.3333"))
    await set_channel_price(db_session, sku.id, channel.id, Decimal("99.99"), owner_user)
    await set_channel_commission(db_session, channel.id, CommissionType.PERCENTAGE, Decimal("12.5"), owner_user)
    for q in (1, 3, 7, 11, 13):
        await create_order(db_session, _order(channel, sku, q), owner_user)
    for rows in (await get_channel_pnl(db_session, TODAY(), TODAY()), await get_sku_pnl(db_session, TODAY(), TODAY())):
        r = rows[0]
        assert r.revenue - r.commission - r.cogs == r.net_profit


@pytest.mark.asyncio
async def test_discontinued_stock_still_counted_in_valuation_and_dead_stock(db_session, owner_user):
    old = TODAY() - timedelta(days=200)
    sku = await _sku(db_session, current_stock_qty=10, current_avg_cost=Decimal("50"), is_active=False)
    from app.models.transaction import Purchase, PurchaseItem
    from app.models.vendor import Vendor
    v = Vendor(id=str(uuid.uuid4()), name="V", created_by_id=owner_user.id)
    db_session.add(v)
    await db_session.flush()
    p = Purchase(id=str(uuid.uuid4()), vendor_id=v.id, vendor="V", purchase_date=old, created_by_id=owner_user.id)
    db_session.add(p)
    await db_session.flush()
    db_session.add(
        PurchaseItem(
            purchase_id=p.id,
            sku_id=sku.id,
            quantity=10,
            unit_cost=Decimal("50"),
            line_total=Decimal("500"),
            resulting_avg_cost=Decimal("50"),
        )
    )
    await db_session.flush()
    assert (await get_inventory_valuation(db_session)).total_stock_value == Decimal("500.00")
    dead = await get_dead_stock_report(db_session, 45)
    assert [r.sku_code for r in dead.rows] == ["X1"] and dead.total_capital_blocked == Decimal("500.00")


@pytest.mark.asyncio
async def test_never_sold_sku_with_fresh_stock_is_not_dead(db_session, owner_user, vendor):
    sku = await _sku(db_session)
    await record_purchase(db_session, PurchaseCreate(vendor_id=vendor.id, purchase_date=TODAY(), items=[PurchaseItemCreate(sku_id=sku.id, quantity=5, unit_cost=Decimal("10"))]), owner_user)
    assert (await get_dead_stock_report(db_session, 45)).rows == []


@pytest.mark.asyncio
async def test_performance_supports_net_profit_and_is_deterministic(db_session, owner_user, channel):
    for code, price in (("A", "100"), ("B", "100"), ("C", "300")):
        s = await _sku(db_session, code=code, current_stock_qty=10)
        await set_channel_price(db_session, s.id, channel.id, Decimal(price), owner_user)
        await create_order(db_session, _order(channel, s, 1), owner_user)
    rows = await get_performance_ranking(db_session, TODAY(), TODAY(), "net_profit", descending=True)
    assert [r.sku_code for r in rows] == ["C", "A", "B"]  # tie A/B broken by code, every time


@pytest.mark.asyncio
async def test_reversed_date_range_is_rejected(db_session):
    with pytest.raises(AppError) as exc:
        await get_channel_pnl(db_session, TODAY(), TODAY() - timedelta(days=3))
    assert exc.value.code == "invalid_date_range"
