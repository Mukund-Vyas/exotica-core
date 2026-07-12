"""
Party master (B2B customers). Created to stop free-text party names from
fragmenting the same customer into multiple spellings across orders and
receivables — see app/models/party.py.
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.party import Party
from app.models.user import User
from app.schemas.party import PartyCreate, PartyUpdate


async def list_parties(
    db: AsyncSession, search: str | None, is_active: bool | None, limit: int, offset: int
) -> tuple[list[Party], int]:
    query = select(Party)
    if is_active is not None:
        query = query.where(Party.is_active == is_active)
    if search:
        query = query.where(Party.name.ilike(f"%{search}%"))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (await db.execute(query.order_by(Party.name.asc()).limit(limit).offset(offset))).scalars().all()
    )
    return rows, total


async def create_party(db: AsyncSession, payload: PartyCreate, current_user: User) -> Party:
    name = payload.name.strip()

    # Case-insensitive dedup check up front (nicer error message than the DB's
    # unique-index violation, which is still there as a backstop against races).
    existing = (
        await db.execute(select(Party).where(func.lower(Party.name) == name.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError(
            detail=f"A party named '{existing.name}' already exists — use that one instead of creating a duplicate.",
            code="duplicate_party_name",
        )

    party = Party(name=name, created_by_id=current_user.id)
    db.add(party)
    await db.flush()
    await db.refresh(party)
    return party


async def update_party(db: AsyncSession, party_id: str, payload: PartyUpdate) -> Party:
    party = await db.get(Party, party_id)
    if party is None:
        raise NotFoundError(f"Party {party_id} not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(party, field, value)

    await db.flush()
    await db.refresh(party)
    return party
