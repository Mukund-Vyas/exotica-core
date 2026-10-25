"""
Business-date helpers.

``date.today()`` uses the *server's* timezone (UTC on most hosts). For a shop in
India that means "today" is still yesterday between 00:00 and 05:30 IST, which
shifts dead-stock cutoffs, receivable aging and velocity windows by a day. All
"what day is it" decisions go through ``today_local()`` instead.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def today_local() -> date:
    return datetime.now(ZoneInfo(settings.app_timezone)).date()
