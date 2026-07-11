from dataclasses import dataclass

from fastapi import Query


@dataclass
class PaginationParams:
    limit: int
    offset: int


def pagination_params(
    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0)
) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset)