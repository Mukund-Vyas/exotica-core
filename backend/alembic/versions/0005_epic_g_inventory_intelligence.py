"""add sku.lead_time_days and Epic G inventory-intelligence settings

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-12
"""

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, insert

# revision identifiers, used by Alembic.
revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

NEW_SETTINGS = [
    ("ads_window_days", "30"),
    ("fast_mover_top_percentile", "20"),
    ("safety_buffer_days", "7"),
    ("target_coverage_days", "30"),
    ("default_lead_time_days", "7"),
]


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # Add lead_time_days to SKUs
    # ------------------------------------------------------------------
    op.add_column(
        "skus",
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
    )

    # ------------------------------------------------------------------
    # Seed new system settings
    # ------------------------------------------------------------------
    settings_t = sa.table(
        "system_settings",
        sa.column("id", UUID(as_uuid=False)),
        sa.column("key", sa.String(100)),
        sa.column("value", sa.String(500)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    now = datetime.now(timezone.utc)

    stmt = insert(settings_t).values(
        [
            {
                "id": str(uuid.uuid4()),
                "key": key,
                "value": value,
                "updated_at": now,
            }
            for key, value in NEW_SETTINGS
        ]
    )

    # Safe if migration is re-run or data already exists
    stmt = stmt.on_conflict_do_nothing(index_elements=["key"])

    bind.execute(stmt)


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            """
            DELETE FROM system_settings
            WHERE key = ANY(:keys)
            """
        ),
        {"keys": [key for key, _ in NEW_SETTINGS]},
    )

    op.drop_column("skus", "lead_time_days")