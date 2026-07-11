"""
B2B receivables — FR-F1, FR-F2, FR-F3.

BRD Section 7 formulas:
    Amount Outstanding = Receivable Value - Sum of Payments Received Against It
    Days Overdue       = Today's Date - Due Date (only meaningful if > 0 and open)
    Aging Bucket        = Not Due | 1-30 Days | 31-60 Days | 60+ Days

The Receivable row is locked during payment creation (Implementation Plan Section
7.2) so two near-simultaneous payments against the same receivable can't both read
a stale outstanding balance and together overpay it before either commits.
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.transaction import Order, Payment, Receivable, ReceivableStatus
from app.models.user import User
from app.schemas.transaction import PaymentCreate, ReceivableAgingRow, ReceivablesAgingReport


async def record_payment(
    db: AsyncSession, receivable_id: str, payload: PaymentCreate, current_user: User
) -> Payment:
    result = await db.execute(
        select(Receivable).where(Receivable.id == receivable_id).with_for_update()
    )
    receivable = result.scalar_one_or_none()
    if receivable is None:
        raise NotFoundError(f"Receivable {receivable_id} not found")

    if payload.amount > receivable.amount_outstanding:
        raise ConflictError(
            detail=(
                f"Payment of {payload.amount} exceeds outstanding balance of "
                f"{receivable.amount_outstanding}."
            ),
            code="overpayment",
        )

    receivable.amount_outstanding -= payload.amount
    if receivable.amount_outstanding <= Decimal("0"):
        receivable.status = ReceivableStatus.CLOSED

    payment = Payment(
        receivable_id=receivable_id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        created_by_id=current_user.id,
    )
    db.add(payment)
    await db.flush()
    return payment


def _aging_bucket(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "Not Due"
    if days_overdue <= 30:
        return "1-30 Days"
    if days_overdue <= 60:
        return "31-60 Days"
    return "60+ Days"


async def get_receivables_aging(db: AsyncSession, as_of: date | None = None) -> ReceivablesAgingReport:
    as_of = as_of or date.today()
    result = await db.execute(
        select(Receivable, Order.party_name)
        .join(Order, Order.id == Receivable.order_id)
        .where(Receivable.status == ReceivableStatus.OPEN, Receivable.amount_outstanding > 0)
        .order_by(Receivable.due_date.asc())
    )

    rows: list[ReceivableAgingRow] = []
    total_outstanding = Decimal("0")
    for receivable, party_name in result.all():
        days_overdue = (as_of - receivable.due_date).days
        rows.append(
            ReceivableAgingRow(
                receivable_id=receivable.id,
                order_id=receivable.order_id,
                party_name=party_name,
                amount_outstanding=receivable.amount_outstanding,
                due_date=receivable.due_date,
                days_overdue=max(days_overdue, 0),
                aging_bucket=_aging_bucket(days_overdue),
            )
        )
        total_outstanding += receivable.amount_outstanding

    return ReceivablesAgingReport(rows=rows, total_outstanding=total_outstanding)
