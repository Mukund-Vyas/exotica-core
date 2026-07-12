"""
Bulk SKU upload — FR-A4 (BRD Addendum 2).

Deliberately partial-success, not all-or-nothing: SKU creation rows are
independent of each other (unlike Bulk Order Entry, which touches shared
stock/financial state and must be atomic — see services/orders.py). One bad
row here — a duplicate code, a missing required field — must not block the
other 199 valid rows in the same file.

Mechanism: each row gets its own SAVEPOINT via `db.begin_nested()` (the same
primitive services/orders.py uses for its all-or-nothing rollback) — a failed
row rolls back only to its own savepoint, leaving every already-succeeded
row's savepoint intact in the pending outer transaction. The difference from
bulk orders is simply that we never call the outer `db.rollback()` at the end.
"""
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.product import SKU, Channel
from app.models.user import User
from app.schemas.product import BulkSKURowError, BulkSKUUploadResult, SKURead
from app.services.pricing import set_channel_price

MAX_ROWS = 2000

REQUIRED_COLUMNS = ["code", "name", "category", "size_variant"]

# CSV column -> channel code (Channel rows seeded in 0002_seed_data.py)
PRICE_COLUMNS = {
    "myntra_price": "myntra",
    "zivame_price": "zivame",
    "website_price": "website",
    "b2b_price": "b2b",
}

TEMPLATE_HEADERS = [
    "code",
    "name",
    "category",
    "size_variant",
    "lead_time_days",
    "myntra_price",
    "zivame_price",
    "website_price",
    "b2b_price",
]
TEMPLATE_EXAMPLE_ROW = [
    "BR-1024-BLK-32B",
    "Lace Balconette Bra",
    "Bras",
    "32B - Black",
    "7",
    "699.00",
    "599.00",
    "799.00",
    "",  # blank is valid — "no price set yet for this channel"
]


@dataclass
class _RowOutcome:
    sku: SKU | None
    error: BulkSKURowError | None


def _row_error(row_number: int, code: str | None, error_code: str, detail: str) -> BulkSKURowError:
    return BulkSKURowError(row_number=row_number, code=code, error_code=error_code, detail=detail)


async def _process_row(
    db: AsyncSession,
    row: dict[str, str],
    row_number: int,
    existing_codes: set[str],
    seen_in_file: set[str],
    channel_by_code: dict[str, Channel],
    current_user: User,
) -> _RowOutcome:
    code = (row.get("code") or "").strip()

    for column in REQUIRED_COLUMNS:
        if not (row.get(column) or "").strip():
            return _RowOutcome(
                None, _row_error(row_number, code or None, "missing_required_field", f"missing_required_field: {column}")
            )

    if code.lower() in existing_codes:
        return _RowOutcome(None, _row_error(row_number, code, "duplicate_sku_code", f"SKU code '{code}' already exists"))
    if code.lower() in seen_in_file:
        return _RowOutcome(
            None,
            _row_error(
                row_number, code, "duplicate_sku_code", f"SKU code '{code}' appears more than once in this file"
            ),
        )

    lead_time_raw = (row.get("lead_time_days") or "").strip()
    try:
        lead_time_days = int(lead_time_raw) if lead_time_raw else None
        if lead_time_days is not None and lead_time_days < 0:
            raise ValueError
    except ValueError:
        return _RowOutcome(
            None, _row_error(row_number, code, "invalid_value", f"lead_time_days '{lead_time_raw}' is not a valid non-negative integer")
        )

    price_by_channel_id: dict[str, Decimal] = {}
    for column, channel_code in PRICE_COLUMNS.items():
        raw_price = (row.get(column) or "").strip()
        if not raw_price:
            continue
        channel = channel_by_code.get(channel_code)
        if channel is None:
            continue  # shouldn't happen with the seeded channel set; don't fail the row over it
        try:
            price = Decimal(raw_price)
            if price <= 0:
                raise InvalidOperation
        except InvalidOperation:
            return _RowOutcome(
                None, _row_error(row_number, code, "invalid_value", f"{column} '{raw_price}' is not a valid positive price")
            )
        price_by_channel_id[channel.id] = price

    try:
        async with db.begin_nested():
            sku = SKU(
                code=code,
                name=row["name"].strip(),
                category=row["category"].strip(),
                size_variant=row["size_variant"].strip(),
                lead_time_days=lead_time_days,
            )
            db.add(sku)
            await db.flush()  # need sku.id for price rows below, and surfaces a DB-level race as an exception here
            for channel_id, price in price_by_channel_id.items():
                await set_channel_price(db, sku.id, channel_id, price, current_user)
    except AppError as exc:
        return _RowOutcome(None, _row_error(row_number, code, exc.code or "creation_failed", exc.detail))
    except Exception as exc:  # noqa: BLE001 — last-resort catch so one bad row (e.g. a DB-level race) can't 500 the whole upload
        return _RowOutcome(None, _row_error(row_number, code, "creation_failed", str(exc)))

    return _RowOutcome(sku, None)


async def bulk_create_skus(db: AsyncSession, rows: list[dict[str, str]], current_user: User) -> BulkSKUUploadResult:
    if len(rows) > MAX_ROWS:
        raise AppError(code="upload_too_large", detail=f"Upload exceeds the {MAX_ROWS}-row limit ({len(rows)} rows)")

    channel_by_code = {c.code: c for c in (await db.execute(select(Channel))).scalars().all()}
    existing_codes = {c.lower() for c in (await db.execute(select(SKU.code))).scalars().all()}
    seen_in_file: set[str] = set()

    created_skus: list[SKU] = []
    errors: list[BulkSKURowError] = []

    for idx, row in enumerate(rows, start=1):
        outcome = await _process_row(db, row, idx, existing_codes, seen_in_file, channel_by_code, current_user)
        if outcome.error is not None:
            errors.append(outcome.error)
            continue
        created_skus.append(outcome.sku)
        seen_in_file.add(outcome.sku.code.lower())

    for sku in created_skus:
        await db.refresh(sku)

    return BulkSKUUploadResult(
        created_count=len(created_skus),
        failed_count=len(errors),
        created_skus=[SKURead.model_validate(s) for s in created_skus],
        errors=errors,
    )
