"""
System settings — validation and safe reads.

Every setting is a whole number with a sensible range. Before this module the
PATCH endpoint stored any string, so e.g. "abc" or "0" for a window length would
later crash (or divide by zero in) the reports that read it.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.settings import SystemSetting

# key -> (minimum, maximum, human label)
SETTING_RULES: dict[str, tuple[int, int, str]] = {
    "dead_stock_window": (1, 3650, "Dead stock window"),
    "ads_window_days": (1, 365, "Sales-velocity window"),
    "fast_mover_top_percentile": (1, 100, "Fast-mover cutoff"),
    "safety_buffer_days": (0, 365, "Safety buffer"),
    "target_coverage_days": (1, 730, "Target stock coverage"),
    "default_lead_time_days": (0, 365, "Default lead time"),
}


def validate_setting_value(key: str, raw: str) -> str:
    """Return the canonical stored form of ``raw`` or raise AppError."""
    rule = SETTING_RULES.get(key)
    if rule is None:
        raise AppError(code="unknown_setting", detail=f"'{key}' is not an editable setting.")
    low, high, label = rule
    text = (raw or "").strip()
    if not text.lstrip("-").isdigit():
        raise AppError(code="invalid_setting", detail=f"{label} must be a whole number.")
    value = int(text)
    if not low <= value <= high:
        raise AppError(code="invalid_setting", detail=f"{label} must be between {low} and {high}.")
    return str(value)


async def get_int_setting(db: AsyncSession, key: str, default: int) -> int:
    """Read an integer setting; fall back to ``default`` if missing or corrupt."""
    value = (await db.execute(select(SystemSetting.value).where(SystemSetting.key == key))).scalar_one_or_none()
    if value is None:
        return default
    try:
        parsed = int(str(value).strip())
    except ValueError:
        return default
    rule = SETTING_RULES.get(key)
    if rule and not rule[0] <= parsed <= rule[1]:
        return default
    return parsed
