"""
Consistent {code, detail} error shape across the whole API (Implementation Plan Section 5).

Use AppError (or a subclass) from service/router code instead of raising a bare
HTTPException, so every error response — validation, business-rule, or auth —
looks the same to the frontend.
"""
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


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


def _error_response(code: str, detail: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"code": code, "detail": detail})


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
        return _error_response(
            "validation_error", str(exc.errors()), status.HTTP_422_UNPROCESSABLE_ENTITY
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return _error_response(
            "internal_error", "An unexpected error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR
        )
