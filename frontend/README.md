# Exotica Frontend

React + Vite + Tailwind frontend for the Exotica inventory/profitability backend, built against
`Exotica-BRD-v1.md` and `Exotica-Frontend-Implementation-Plan.md`.

## Setup

```bash
npm install
cp .env.example .env   # edit VITE_API_BASE_URL if your backend isn't on localhost:8000
npm run dev
```

Requires the backend running (see `backend/README.md`) and a first user created via
`scripts/create_first_user.py`, since there's no self-serve signup.

## Backend patch included

Two small routers were added to `backend/app/routers/products.py` to close gaps the implementation
plan flagged before frontend work could start cleanly:

- **Gap #0 (blocking):** the backend could *set* channel prices and commissions but had no `GET` to
  read the current one back. Order entry can't auto-fill a price, and Settings can't show what's
  configured, without this. Added:
  - `GET /skus/{sku_id}/channel-prices` — current price per channel for a SKU
  - `GET /channel-prices/current?sku_id=&channel_id=` — single current price (returns `null`, not
    404, when unset, so the frontend can tell "no price set" apart from a real error)
  - `GET /channel-commissions/` — current commission per channel
- **Gap #1:** added an optional `search` query param to `GET /skus/` (ILIKE on code/name) so SKU
  search doesn't have to pull every SKU and filter client-side.

Everything else in the backend was used as-is. **Gap #2** (whether `order_item_id` is required on a
return) turned out not to be a real gap on inspection — `app/services/returns.py` already handles
both cases (exact reversal when a source line is given, an estimate from current price/cost/commission
when it isn't) — so the Return form defaults to picking a source line but allows leaving it blank.

If you don't want the backend touched, the diff is isolated to that one file — revert it and the
frontend's price/commission reads will 404 until you add equivalent endpoints yourself.

## What's implemented

Every screen in the implementation plan: Dashboard, SKUs (list/create/edit + channel pricing),
Purchases (entry/list), Orders (single entry, bulk keyboard-navigable grid, list), Returns,
Receivables (list + payment recording + aging report), all six reports (Channel P&L, SKU P&L,
Inventory Valuation, Dead Stock, Performance, Audit Log), and Settings (system settings +
per-channel commission).

Auth: access token in memory, refresh token in `localStorage`, silent refresh-on-401 via an axios
interceptor, session restored on page load if a refresh token is present.

Not implemented (out of scope for this pass, per the plan's "Phase 2" notes): automated tests
(Vitest/MSW), multi-role permission-gated UI (backend enforces permissions; the frontend doesn't yet
hide buttons a role can't use), CSV export.

## Stack

React 18, Vite, Tailwind, React Router, TanStack Query + Table, React Hook Form + Zod, Axios.
