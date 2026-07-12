from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.party import Party
from app.models.user import User
from app.schemas.common import Page
from app.schemas.party import PartyCreate, PartyRead, PartyUpdate
from app.services.parties import create_party, list_parties, update_party

router = APIRouter(prefix="/api/v1/parties", tags=["parties"])


@router.get("/", response_model=Page[PartyRead])
async def get_parties(
    search: str | None = None,
    is_active: bool | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("parties:read")),
) -> Page[PartyRead]:
    rows, total = await list_parties(db, search, is_active, pagination.limit, pagination.offset)
    return Page(
        items=[PartyRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post("/", response_model=PartyRead, status_code=201)
async def post_party(
    payload: PartyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("parties:write")),
) -> PartyRead:
    party = await create_party(db, payload, current_user)
    return PartyRead.model_validate(party)


@router.patch("/{party_id}", response_model=PartyRead)
async def patch_party(
    party_id: str,
    payload: PartyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("parties:write")),
) -> Party:
    return await update_party(db, party_id, payload)
