# Exotica Core — Backend

FastAPI backend for the Exotica Multi-Channel Inventory & Profitability
Management System, implementing all six BRD epics (A–F) per the
Implementation Plan: SKU/pricing/commission, purchases/orders/bulk-entry,
P&L/dead-stock/ranking, reports, receivables, and JWT auth/roles.

## Project layout

```
backend/
├── main.py                 # thin re-export of app.main:app (so `uvicorn main:app` works)
├── requirements.txt
├── .env.example
├── alembic/
│   ├── env.py
│   └── versions/
│       ├── 0001_initial_schema.py   # all tables, hand-written for Postgres
│       └── 0002_seed_data.py        # permissions, "owner" role, channels, dead_stock_window
├── scripts/
│   └── create_first_user.py         # one-time bootstrap CLI (Section 1.4)
└── app/
    ├── main.py              # FastAPI app instance, router registration, middleware
    ├── core/                # config, db session, security, exception handling
    ├── models/              # SQLAlchemy models
    ├── schemas/              # Pydantic request/response models
    ├── services/             # business logic (routers stay thin)
    ├── routers/               # FastAPI route definitions
    ├── dependencies/          # auth, permission, pagination Depends()
    └── tests/
        ├── conftest.py
        ├── test_services/
        └── test_routers/
```

## Setup

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill in your real Neon connection strings + JWT secret
alembic upgrade head
python -m scripts.create_first_user   # prompts for username/password, attaches "owner" role
uvicorn main:app --reload
```

Swagger UI: `http://localhost:8000/docs`

## Migrations

- `0001_initial_schema.py` creates every table matching `app/models/` — hand-written
  rather than `alembic revision --autogenerate`, because autogenerate was validated
  during development against SQLite (to avoid needing a live Postgres instance just
  to iterate), and SQLite can't represent native Postgres `ENUM` types or several
  other constructs faithfully. The migration was written by hand against the actual
  models instead, then structurally reviewed line-by-line against them.
- `0002_seed_data.py` seeds the `owner` role + all `require_permission(...)` codes
  from `app/routers/*.py`, the four BRD channels (Myntra/Zivame/Website/B2B), and
  `dead_stock_window = 45` in `SystemSetting` — see Implementation Plan Section 1.4.
- The first user account is deliberately **not** created by a migration (no
  hashed credential belongs in version control) — run `scripts/create_first_user.py`
  once per environment, after migrations, before using the API.

## A bug found (and fixed) while building this

While smoke-testing the bulk order-entry endpoint's all-or-nothing rollback
(`POST /api/v1/orders/bulk` → `services/orders.create_bulk_orders`), a batch
where line 1 legitimately succeeded and line 2 failed (bad SKU) was correctly
reported as fully rejected — but line 1's stock decrement was still landing
in the database afterward, even though `db.rollback()` was called.

**Root cause:** this only reproduced against **SQLite**, the database used for
local smoke tests (not production). SQLAlchemy's own docs flag this as a known
pysqlite/aiosqlite quirk: the DBAPI driver does its own implicit `BEGIN`/`COMMIT`
handling underneath SQLAlchemy, which interferes with `SAVEPOINT`-based nested
transactions (`session.begin_nested()`) — an earlier savepoint that should still
be pending inside the outer transaction can end up committed to disk before a
later savepoint's rollback + the outer `db.rollback()` ever run.

**Fix:** `app/core/db.py` now disables pysqlite's own transaction management via
two `sqlalchemy.event` listeners (`connect` → `isolation_level = None`, `begin` →
explicit `BEGIN`), applied only when the engine's dialect is `sqlite`. This is
the standard workaround from SQLAlchemy's documentation. **Production runs on
Postgres via `asyncpg`, which doesn't have this quirk at all** — the
`create_bulk_orders` logic itself (per-order `begin_nested()` savepoint, roll
back the whole session if any order errors) was already correct; it just needed
a database that honors `SAVEPOINT` semantics the way SQLAlchemy expects, which
plain aiosqlite doesn't do without this fix.

`app/tests/test_services/test_orders.py::test_bulk_orders_all_or_nothing_rolls_back_earlier_success`
is the regression test for this — it fails without the `db.py` fix and passes with it.

## ⚠️ Testing status in this environment

This backend was completed in a follow-up sandbox session that **has no network
access** — `pip install` cannot reach PyPI here, so none of the code in this
repo (including the test suite above) could actually be executed or verified
end-to-end in this session. What *was* verified here:

- Every `.py` file (app, alembic, scripts, tests) passes `python -m py_compile`
  — no syntax errors.
- The route table was confirmed reachable in an *earlier* session (before this
  follow-up) by actually importing the FastAPI app and listing registered routes.
- The bulk-order rollback bug and fix above are based on a documented, well-known
  SQLAlchemy/pysqlite interaction, reasoned through carefully, not verified by
  re-running the smoke test in this session.

**Before relying on this in production, please run:**

```bash
pip install -r requirements.txt
pytest -v
```

on a machine with network access, and treat that as the real verification step —
not this message. If anything doesn't pass, the most likely places to look are
the transaction-boundary code in `app/core/db.py` and `services/orders.py`
(nested savepoints), since that's the area with the most subtle behavior.

## Permission codes (seeded onto the "owner" role by migration 0002)

`skus:read` `skus:write` `channels:read` `prices:write` `commissions:write`
`purchases:read` `purchases:write` `orders:read` `orders:write` `returns:write`
`receivables:read` `receivables:write` `reports:view` `settings:read` `settings:write`

Adding a second, more restricted role later (FR-E1) is a data change (new
`Role` + `RolePermission` rows) — no code or migration changes needed.

## Running tests

```bash
pytest                      # all tests
pytest app/tests/test_services   # business-logic unit/integration tests only
pytest app/tests/test_routers    # httpx.AsyncClient integration tests
```

Tests run against an in-memory SQLite database (see `app/tests/conftest.py`
and the SQLite fix in `app/core/db.py` above) — no external services required.

## Deployment

```bash
gunicorn -k uvicorn.workers.UvicornWorker main:app
```

Point `DATABASE_URL` at each environment's own Neon branch. Never set
`allow_origins=["*"]` in `CORS_ALLOWED_ORIGINS_RAW` in production — this API
handles real financial data.
