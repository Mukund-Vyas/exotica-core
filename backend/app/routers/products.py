from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.dependencies.pagination import PaginationParams, pagination_params
from app.dependencies.permissions import require_permission
from app.models.product import SKU, Channel
from app.models.user import User
from app.schemas.common import Page
from app.schemas.product import (
    ChannelCommissionCreate,
    ChannelCommissionRead,
    ChannelPriceCreate,
    ChannelPriceRead,
    ChannelRead,
    SKUCreate,
    SKURead,
    SKUUpdate,
)
from app.services.pricing import (
    get_current_commission,
    get_current_price,
    set_channel_commission,
    set_channel_price,
)

router = APIRouter(prefix="/api/v1", tags=["products"])


# --- Channels ---


@router.get("/channels/", response_model=list[ChannelRead])
async def list_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("channels:read")),
) -> list[Channel]:
    return (await db.execute(select(Channel))).scalars().all()


# --- SKUs (FR-A1) ---


@router.post("/skus/", response_model=SKURead, status_code=201)
async def create_sku(
    payload: SKUCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:write")),
) -> SKU:
    existing = await db.execute(select(SKU).where(SKU.code == payload.code))
    if existing.scalar_one_or_none() is not None:
        raise ConflictError(f"SKU code '{payload.code}' already exists", code="duplicate_sku_code")

    sku = SKU(**payload.model_dump())
    db.add(sku)
    await db.flush()
    await db.refresh(sku)
    return sku


@router.get("/skus/", response_model=Page[SKURead])
async def list_skus(
    is_active: bool | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:read")),
) -> Page[SKURead]:
    query = select(SKU)
    if is_active is not None:
        query = query.where(SKU.is_active == is_active)
    if search:
        like = f"%{search}%"
        query = query.where((SKU.code.ilike(like)) | (SKU.name.ilike(like)))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        (await db.execute(query.order_by(SKU.code).limit(pagination.limit).offset(pagination.offset)))
        .scalars()
        .all()
    )
    return Page(
        items=[SKURead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/skus/{sku_id}", response_model=SKURead)
async def get_sku(
    sku_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:read")),
) -> SKU:
    sku = await db.get(SKU, sku_id)
    if sku is None:
        raise NotFoundError(f"SKU {sku_id} not found")
    return sku


@router.patch("/skus/{sku_id}", response_model=SKURead)
async def update_sku(
    sku_id: str,
    payload: SKUUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:write")),
) -> SKU:
    sku = await db.get(SKU, sku_id)
    if sku is None:
        raise NotFoundError(f"SKU {sku_id} not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sku, field, value)

    await db.flush()
    await db.refresh(sku)
    return sku


# --- Channel pricing (FR-A2) ---


@router.post("/channel-prices/", response_model=ChannelPriceRead, status_code=201)
async def create_channel_price(
    payload: ChannelPriceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("prices:write")),
) -> ChannelPriceRead:
    price = await set_channel_price(
        db, payload.sku_id, payload.channel_id, payload.price, current_user
    )
    return ChannelPriceRead.model_validate(price)


@router.get("/skus/{sku_id}/channel-prices", response_model=list[ChannelPriceRead])
async def get_sku_channel_prices(
    sku_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:read")),
) -> list[ChannelPriceRead]:
    """Current price for every channel that has one set for this SKU (Gap #0 fix).

    Wraps the existing services/pricing.get_current_price() query per-channel so
    FR-A2's order-entry auto-fill and the Price/Commission settings screen have
    something to read, not just something to write.
    """
    channels = (await db.execute(select(Channel))).scalars().all()
    prices = []
    for channel in channels:
        price = await get_current_price(db, sku_id, channel.id)
        if price is not None:
            prices.append(ChannelPriceRead.model_validate(price))
    return prices


@router.get("/channel-prices/current", response_model=ChannelPriceRead | None)
async def get_current_channel_price(
    sku_id: str,
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:read")),
) -> ChannelPriceRead | None:
    """Single (sku, channel) current price — returns null if none is set yet,
    rather than 404, so the frontend can distinguish "no price set" from an error
    and prompt for one per FR-A2's acceptance criteria."""
    price = await get_current_price(db, sku_id, channel_id)
    return ChannelPriceRead.model_validate(price) if price else None


# --- Channel commission (FR-A3, self-service settings) ---


@router.get("/channel-commissions/", response_model=list[ChannelCommissionRead])
async def list_current_channel_commissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("skus:read")),
) -> list[ChannelCommissionRead]:
    """Current commission config for every channel (Gap #0 fix) — powers the
    Settings screen so the owner can see, not just set, commission terms."""
    channels = (await db.execute(select(Channel))).scalars().all()
    out = []
    for channel in channels:
        commission = await get_current_commission(db, channel.id)
        if commission is not None:
            out.append(ChannelCommissionRead.model_validate(commission))
    return out


@router.post("/channel-commissions/", response_model=ChannelCommissionRead, status_code=201)
async def create_channel_commission(
    payload: ChannelCommissionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("commissions:write")),
) -> ChannelCommissionRead:
    commission = await set_channel_commission(
        db, payload.channel_id, payload.commission_type, payload.value, current_user
    )
    return ChannelCommissionRead.model_validate(commission)