"""add the AJIO sales channel

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-25

Channels are reference data seeded by migration (there is no create-channel
screen). This adds AJIO alongside Myntra, Zivame, Website and B2B.

Safe to run on a live database:
  - inserts only if no channel with code 'ajio' exists (re-running is harmless);
  - touches no existing rows.

A new channel starts with NO prices and NO commission. Until set, an AJIO sale
needs an override price, and commission is treated as zero. Set both after
upgrading: SKU page -> Channel pricing, and Settings -> Channel commission.

Downgrade removes AJIO only if nothing references it; otherwise it refuses
(deleting would orphan real sales/returns/prices).
"""
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

CODE = "ajio"
NAME = "AJIO"

# Every table holding a channel_id foreign key.
REFERENCING = ("orders", "returns", "channel_prices", "channel_commissions")


def upgrade() -> None:
    bind = op.get_bind()
    exists = bind.execute(sa.text("SELECT 1 FROM channels WHERE code = :c"), {"c": CODE}).first()
    if exists:
        return
    bind.execute(
        sa.text("INSERT INTO channels (id, code, name, is_active) VALUES (:id, :c, :n, TRUE)"),
        {"id": str(uuid.uuid4()), "c": CODE, "n": NAME},
    )


def downgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(sa.text("SELECT id FROM channels WHERE code = :c"), {"c": CODE}).first()
    if not row:
        return
    for table in REFERENCING:
        used = bind.execute(
            sa.text(f"SELECT 1 FROM {table} WHERE channel_id = :id LIMIT 1"), {"id": row[0]}
        ).first()
        if used:
            raise RuntimeError(
                f"Cannot remove the AJIO channel: it is used by existing rows in '{table}'. "
                "Deactivate the channel instead (set channels.is_active = false)."
            )
    bind.execute(sa.text("DELETE FROM channels WHERE id = :id"), {"id": row[0]})
