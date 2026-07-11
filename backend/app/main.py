from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import auth, products, reports, settings as settings_router, transactions

app = FastAPI(
    title="Exotica Core API",
    description="Multi-Channel Inventory & Profitability Management System — backend API",
    version="1.0.0",
)

register_exception_handlers(app)

# Never allow_origins=["*"] in production — this API handles real financial data.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(transactions.router)
app.include_router(reports.router)
app.include_router(settings_router.router)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
