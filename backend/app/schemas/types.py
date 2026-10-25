"""
Reusable, bounds-checked field types.

Why this exists: before these, a malformed ID, an out-of-range number, or a
whitespace-only name sailed through Pydantic and blew up later as a database
error (HTTP 500 "unexpected error"). Everything here is sized to the actual
column definitions in app/models so bad input is rejected up front with a
clear 422 message instead.

Column limits these are sized against:
  Numeric(12, 2)  selling price           -> price < 10,000,000.00 here
  Numeric(12, 4)  unit cost               -> cost  < 1,000,000.0000 here
  Numeric(14, 2)  revenue / line totals   -> qty (<= 100,000) x price/cost stays < 1e12
  Integer         stock quantity          -> qty <= 100,000 per line
"""
import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, Field, StringConstraints

from app.core.timeutil import today_local


def _valid_uuid(value: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        raise ValueError("is not a valid ID") from None


def _not_future(value: date) -> date:
    if value > today_local():
        raise ValueError("cannot be in the future")
    return value


UUIDStr = Annotated[str, AfterValidator(_valid_uuid)]

# Quantities are whole units (lingerie pieces), at least 1.
Quantity = Annotated[int, Field(gt=0, le=100_000)]

# Selling price: > 0, max 2 decimal places (paise).
Price = Annotated[Decimal, Field(gt=0, max_digits=9, decimal_places=2, allow_inf_nan=False)]

# Purchase cost per unit: > 0, up to 4 decimal places (weighted-average precision).
UnitCostField = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=4, allow_inf_nan=False)]

# A payment amount: > 0, paise precision.
PaymentAmount = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]

# Dates a user enters for something that already happened.
PastOrToday = Annotated[date, AfterValidator(_not_future)]


def trimmed(max_length: int) -> type:
    """A required string with surrounding whitespace removed; blank is rejected."""
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]
