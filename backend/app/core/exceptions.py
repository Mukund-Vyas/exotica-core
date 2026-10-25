"""
Consistent {code, detail} error shape across the whole API (Implementation Plan Section 5).

Use AppError (or a subclass) from service/router code instead of raising a bare
HTTPException, so every error response — validation, business-rule, or auth —
looks the same to the frontend.
"""
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("exotica.api")


class AppError(Exception):
    """Base application error. Raise this (or a subclass) from services/routers."""

    def __init__(self, code: str, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.code = code
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class NotFoundError(AppError):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(code="not_found", detail=detail, status_code=status.HTTP_404_NOT_FOUND)


class ConflictError(AppError):
    """Used for things like insufficient stock, duplicate SKU code, overpayment, etc."""

    def __init__(self, detail: str, code: str = "conflict"):
        super().__init__(code=code, detail=detail, status_code=status.HTTP_409_CONFLICT)


class PermissionDeniedError(AppError):
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(
            code="permission_denied", detail=detail, status_code=status.HTTP_403_FORBIDDEN
        )


def _error_response(code: str, detail: str, status_code: int, **extra) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "detail": detail, **extra})


def _humanize_validation_errors(errors: list[dict]) -> tuple[str, list[dict]]:
    """Turn Pydantic's error list into a readable sentence plus a structured list.

    Previously the raw Python repr of ``exc.errors()`` was sent to the browser,
    e.g. "[{'type': 'greater_than', 'loc': ('body', 'items', 0, ...".
    """
    items: list[dict] = []
    for err in errors:
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
        field = ".".join(loc) or "request"
        msg = str(err.get("msg", "is invalid"))
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        items.append({"field": field, "message": msg})
    detail = "; ".join(
        i["message"] if i["field"] == "request" else f"{i['field']}: {i['message']}" for i in items[:5]
    )
    if len(items) > 5:
        detail += f" (+{len(items) - 5} more)"
    return detail, items


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.code, exc.detail, exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error_response("http_error", str(exc.detail), exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        detail, items = _humanize_validation_errors(exc.errors())
        return _error_response(
            "validation_error", detail, status.HTTP_422_UNPROCESSABLE_ENTITY, errors=items
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        # Safety net for races/edge cases the services don't pre-check
        # (duplicate names created simultaneously, dangling references, ...).
        text = str(getattr(exc, "orig", exc)).lower()
        if "foreign key" in text:
            return _error_response(
                "not_found",
                "A record this refers to no longer exists.",
                status.HTTP_404_NOT_FOUND,
            )
        if "unique" in text or "duplicate" in text:
            return _error_response(
                "conflict", "That already exists.", status.HTTP_409_CONFLICT
            )
        logger.exception("Unhandled integrity error on %s %s", request.method, request.url.path)
        return _error_response(
            "conflict",
            "This conflicts with existing data.",
            status.HTTP_409_CONFLICT,
        )

    @app.exception_handler(DBAPIError)
    async def db_api_error_handler(request: Request, exc: DBAPIError) -> JSONResponse:
        # Malformed input that reached the database driver (bad UUID text,
        # numeric out of range). Input schemas catch these first; this keeps any
        # path that slips through a 4xx instead of a 500.
        text = str(getattr(exc, "orig", exc)).lower()
        if "uuid" in text or "out of range" in text or "numeric field overflow" in text:
            return _error_response(
                "validation_error", "One of the values sent is invalid or out of range.", 422
            )
        logger.exception("Database error on %s %s", request.method, request.url.path)
        return _error_response(
            "internal_error", "An unexpected error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _error_response(
            "internal_error", "An unexpected error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )
