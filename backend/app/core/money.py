"""
Money/quantity rounding helpers — one place, one rounding rule.

Python's ``Decimal.quantize`` defaults to ROUND_HALF_EVEN ("banker's rounding"),
which turns 3.325 into 3.32. For rupee amounts the expected convention is
round-half-up (3.325 -> 3.33), so every monetary quantize in the app goes
through these helpers instead of calling ``quantize`` directly.
"""
from decimal import ROUND_HALF_UP, Decimal

_CENT = Decimal("0.01")
_COST = Decimal("0.0001")


def money(value: Decimal) -> Decimal:
    """Round to 2 decimal places, half-up (rupees and paise)."""
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def unit_cost(value: Decimal) -> Decimal:
    """Round to 4 decimal places, half-up (per-unit weighted-average cost)."""
    return Decimal(value).quantize(_COST, rounding=ROUND_HALF_UP)


def like_pattern(search: str) -> str:
    """Contains-style LIKE pattern with the user's own %, _ and \\ escaped.

    Use with ``.ilike(like_pattern(q), escape="\\\\")``. Without escaping, searching
    for "50%" or "A_1" treats the symbols as wildcards and returns wrong matches.
    """
    escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
