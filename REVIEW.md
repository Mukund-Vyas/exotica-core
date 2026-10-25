# Exotica Core — Code Review, QA & Fix Report

Scope: full read of backend (FastAPI/SQLAlchemy), frontend (React/Vite), migrations and BRD v1.
Method: every suspected bug was **reproduced first** (against real PostgreSQL 16 for API/DB issues,
in a simulated DOM for UI issues), then fixed, then covered by a regression test that fails on the old code.

Verification at hand-off: backend **44 passed on PostgreSQL / 43 passed + 1 PG-only skipped on SQLite**;
frontend **6 utility + 11 component tests pass**; `ruff` clean; production build succeeds; all 5 migrations
apply to an empty Postgres. (At the start, 12 of 24 backend tests were already failing — stale fixtures.)

## A. Calculation / data-integrity bugs (highest impact)

| # | Defect | Effect before | Fix |
|---|--------|---------------|-----|
| 1 | Weighted-avg cost blended a **negative** stock quantity into the average | Buy after overselling → cost above both prices (−5@100 + 10@120 ⇒ 140); exact cancel ⇒ cost 0 | Stock ≤ 0 ⇒ incoming price becomes the average |
| 2 | Dashboard/“this month” used `toISOString()` | In IST the month starts on **the last day of the previous month**; default dates are yesterday before 5:30 AM | Local-date helpers (`utils/dates.js`) everywhere |
| 3 | Server used `date.today()` (server tz) | Dead-stock cutoff, receivable aging, velocity windows off by a day in IST | `today_local()` with `APP_TIMEZONE` (default Asia/Kolkata) |
| 4 | Return could reference a sale line with a **different SKU or channel** | Stock added to wrong SKU; revenue reversed in wrong channel's P&L | Validated; 409/400 with clear message |
| 5 | Pro-rata return rounding | 3 returns of a 99.99 line reversed 99.99 ± stray paisa | Final return takes the exact remainder |
| 6 | Returned units didn't re-enter average cost | Inventory value drifted vs COGS reversal | Re-blended at original sale cost |
| 7 | Reports derived COGS from unrounded `qty×cost` | Revenue − Commission − COGS ≠ Net profit by paise | COGS = revenue − commission − net profit (identity holds) |
| 8 | Banker's rounding (`Decimal.quantize` default) | 3.325 ⇒ 3.32 | Half-up via `core/money.py` |
| 9 | Discontinued SKUs excluded from valuation & dead stock | Understated inventory value; hid the clearest dead stock | Included (with “Discontinued” badge) |
| 10 | Velocity window counted N+1 days, divided by N | Avg daily sales overstated | Window = last N days incl. today |
| 11 | Never-sold SKU flagged dead on day one | False dead-stock alarms for new stock | Measured from first stock-in date |
| 12 | SKU edit form turned blank lead-time (`null`) into **0** (`z.coerce`) | Every SKU edit silently zeroed reorder lead time | Schema fixed; verified against zod |
| 13 | Credit terms accepted on non-B2B channels; due date before order date | Bogus receivables | Rejected |
| 14 | Performance page offered “Net Profit” metric the API rejected (422) | Page showed “No sales” | Metric added to API |

## B. Crashes / 500s found on real Postgres (all now clean 4xx)
Non-UUID ids; unknown channel/SKU in price/commission/order; `name: null` on PATCH; price & quantity overflow;
bad `PATCH /settings` values (would later crash reports / divide by zero); duplicate-name races; swallowed
exceptions with no logging. Added typed fields (`schemas/types.py`), global IntegrityError/DBAPIError handlers,
readable validation messages (was a raw Python list), settings validation with ranges, and error logging.
Also: 150 % commission, `lead_time_days = -5`, whitespace-only names, case-variant duplicate SKU codes
(`A1` vs `a1`) were all accepted.

## C. UX / frontend defects
- **Wrong password reloaded the login page** (401 interceptor) and erased the error message.
- **Payment dialog: could type only one character** (focus stolen on every keystroke).
- Pickers: editing text after choosing a SKU kept the *old* SKU in the form; text didn't clear on reset; no keyboard use.
- Receivables/Orders/Purchases/SKU/Party/Vendor/Audit lists silently stopped at 100–200 rows; SKU search only searched
  those loaded rows; bulk grid couldn't find SKU codes beyond the first 200. All now page with “Load more”; search is server-side.
- **Audit Log page** read fields that don't exist (blank columns, “undefine…”). Rebuilt; added channel/type filters.
- Return screen: channel chosen independently of the sale line; only scanned latest 100 orders; now locked to the line, shows returnable qty.
- Failed requests looked like good news (“No dead stock — nice work”); now a visible banner + card error states.
- Dashboard “60+ days” showed a row count labelled “parties”; now shows ₹ amount + real party count.
- Sorting mis-ordered negative money values (string sort); fixed numerically, keyboard-accessible headers.
- Mobile: validation errors invisible in bulk grid; nav drawer stayed open; two nav items highlighted at once.
- Orders/purchases lists had no SKU column; receivables showed UUID fragments; unit costs truncated to 2 dp.
- Frontend `hasPermission` always returned true (API never sent permissions) — now served by `/auth/me`, fail-closed.
- Added live order/purchase totals, whole-number/price validation, “Full” payment button, save confirmations, aria labels,
  focus rings, `max=today` on dates, “Discontinued” badges; removed internal requirement codes (“FR-A2”) from UI.

## D. Decisions for you (not changed — they are business rules)
1. **Returns against credit (B2B) orders don't reduce the receivable.** The customer still “owes” the full amount. Needs a credit-note rule.
2. **Purchase-trigger formula** can suggest quantity 0 when lead time + buffer exceeds target coverage. The Epic G addendum isn't in the repo, so I left the formula alone.
3. Dead-stock rule for never-sold SKUs (#11) is my interpretation of the BRD; revert if you want the literal reading.
4. Returns without a sale reference are valued at *current* price/cost (documented limitation of the BRD).

## E. Hygiene notes
- `.venv/Scripts/python.exe` is committed to git; add a root `.gitignore` and remove it.
- Migrations omit `NOT NULL` on `created_at` and model-declared indexes differ slightly (`alembic check` shows cosmetic drift).
- Audit log merges in memory (fine at current volume; move to SQL `UNION` if it grows to 100k+ rows).
- No login rate-limiting yet.

## Running the tests
```
# backend (SQLite, quick)
cd backend && pytest
# backend on Postgres (also runs the real concurrency test)
DB_NULL_POOL=1 DATABASE_URL=postgresql://user:pw@localhost/db_test pytest
# frontend
cd frontend && npm install && npm test
```
