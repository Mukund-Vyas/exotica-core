# Business Requirements Document (BRD)
## Exotica — Multi-Channel Inventory & Profitability Management System

| | |
|---|---|
| **Document Version** | 1.0 |
| **Status** | Draft — pending stakeholder sign-off |
| **Prepared For** | Exotica Lingerie (exoticalingerie.in) |
| **Document Owner** | [Your name] |

---

## 1. Business Context & Problem Statement

Exotica sells across four channels — Myntra, Zivame, its own website, and B2B — each with different selling prices for the same SKU. Purchasing, stock tracking, and profitability analysis are currently managed manually (Excel), which creates four specific business problems:

1. **No real-time visibility into stock** — decisions on what to reorder are based on stale or manually reconciled numbers.
2. **No channel-level profitability view** — the business cannot currently answer "which channel is actually profitable after costs" with confidence, since selling price, cost, and (where applicable) marketplace commission live in different places or aren't tracked together.
3. **No dead stock visibility** — capital is likely tied up in slow-moving inventory with no systematic way to identify which SKUs are the cause.
4. **Manual process doesn't scale** — as SKU count and order volume grow, spreadsheet-based tracking increases the risk of costly manual errors (overselling, stockouts, mispriced orders).

This system exists to solve these four problems specifically — not to become a general-purpose ERP. Scope discipline matters here: a narrow system that reliably answers these four questions is more valuable to the business than a broad system that answers many questions unreliably.

---

## 2. Business Objectives

| # | Objective | How This System Achieves It |
|---|---|---|
| O1 | Reduce time spent on manual stock reconciliation | Single source of truth for stock, updated on every purchase/sale entry |
| O2 | Enable channel-level pricing and profitability decisions | Channel-specific pricing + automated P&L calculation per channel |
| O3 | Reduce capital tied up in unsold inventory | Systematic dead-stock detection and reporting |
| O4 | Improve purchase decision quality | Stock + sales velocity visible together, in one place |

Every functional requirement below should be traceable to one of these four objectives. If a requested feature doesn't map to O1–O4, it belongs in a future phase, not this one.

---

## 3. Stakeholders

| Role | Interest |
|---|---|
| Business Owner / Client | Primary user; needs decision-ready numbers, not raw data |
| Data Entry Staff (if applicable — see Q6.3) | Needs fast, low-friction daily entry screens |
| Developer (your brother) | Needs unambiguous, testable requirements to estimate and build against |
| You (delivery/BA) | Owns scope, sign-off, and change control |

---

## 4. Scope

### 4.1 In Scope (Phase 1)
- Manual entry of purchases (stock in) with cost price
- Manual entry of daily sales/orders per channel with channel-specific selling price
- Manual entry of returns
- Real-time stock level tracking per SKU
- Automated profit & loss calculation per SKU, per channel, per period, net of marketplace commission
- Dead stock identification and capital-blocked reporting
- B2B Receivables tracking (payment due, payments received, aging)
- Core reports: channel P&L, SKU P&L, inventory valuation, dead stock, top/bottom performers, receivables aging
- Role-based access **architecture** (single active role in Phase 1, but data model supports adding roles without rebuild)

### 4.2 Explicitly Out of Scope (Phase 1)
- Direct API integration with Myntra/Zivame/website (all entry is manual)
- Demand forecasting / AI-based purchase suggestions
- Multi-warehouse / multi-location stock tracking (confirmed: single stock location)
- Accounting/Tally/GST integration
- CRM, vendor management portal, production planning
- Automated commission reconciliation against marketplace settlement reports (commission is entered by the business owner, not auto-verified against actual Myntra/Zivame payout statements)
- Multiple user accounts / login-level role enforcement (architecture supports it; actual multi-role UI and permissions are future scope — see FR-E1)
- Automated payment reminders/dunning for overdue receivables (aging is reported; reminders are manual for now)

Anything in 4.2 raised mid-project is a **change request**, not an oversight — flag it as scope creep and re-estimate rather than absorbing it silently.

---

## 5. Functional Requirements

Written as user stories with acceptance criteria, so both the client and developer can verify "done" unambiguously.

### Epic A: Master Data Management

**FR-A1: SKU Management**
> As the business owner, I want to create and maintain a master list of SKUs, so that all purchases and sales reference consistent product data.

*Acceptance Criteria:*
- Each SKU has a unique code, name, category, and size/variant
- SKUs can be marked active/discontinued without being deleted (preserves historical reports)
- System prevents duplicate SKU codes

**FR-A2: Channel-Specific Pricing**
> As the business owner, I want to set a different selling price per SKU per channel, so that Myntra, Zivame, Website, and B2B pricing can differ.

*Acceptance Criteria:*
- Each SKU can have up to 4 prices, one per channel
- Price changes are timestamped (price history preserved, not overwritten)
- If no channel price is set for a SKU, the order entry screen (FR-B2) must prompt for one rather than defaulting silently to 0 or blank

**FR-A3: Channel Commission Configuration** *(confirmed in scope)*
> As the business owner, I want to set and edit the marketplace commission for each channel myself, so that profit calculations stay accurate as Myntra/Zivame terms change without needing the developer involved.

*Acceptance Criteria:*
- Commission is configurable **per channel**, and the owner can choose either a **percentage of sale price** or a **flat amount per unit** — not both fixed at once, but the type must be selectable per channel
- Commission changes are timestamped/versioned, same as pricing (FR-A2), so historical P&L reports don't silently change when commission terms are updated later
- Website and B2B channels typically have 0 commission by default but must remain editable (in case that changes)
- Owner can edit this without developer/admin involvement — this is a self-service settings screen, not a database change

### Epic B: Transaction Entry

**FR-B1: Purchase Entry**
> As the business owner, I want to record stock purchases with cost price, so that stock levels and cost basis update automatically.

*Acceptance Criteria:*
- Recording a purchase increases the SKU's stock quantity immediately
- System recalculates weighted average cost price on save (formula: see Section 7)
- Vendor and date are mandatory fields

**FR-B2: Daily Order Entry**
> As the business owner, I want to log each day's orders by channel, so that sales and stock depletion are tracked accurately per channel.

*Acceptance Criteria:*
- Selecting channel + SKU auto-populates the selling price from FR-A2, with the ability to manually override (for negotiated/discounted sales)
- Recording an order decreases stock quantity immediately
- System rejects (or clearly warns on) an order that would take stock negative
- Bulk-entry mode exists for logging multiple line items in one session without re-opening a form each time

**FR-B3: Return Entry**
> As the business owner, I want to log returned items, so that stock and profit figures reflect actual net sales.

*Acceptance Criteria:*
- A return increases stock quantity and reverses the corresponding revenue/profit for that line
- Return can optionally reference the original order

### Epic C: Profitability & Inventory Intelligence

**FR-C1: Automated P&L Calculation**
> As the business owner, I want profit/loss calculated automatically on every sale, so that I don't have to compute margins manually.

*Acceptance Criteria:*
- P&L is calculated at time of sale using: selling price, weighted average cost, and commission % (if set for that channel)
- P&L is viewable per SKU, per channel, and per custom date range

**FR-C2: Dead Stock Detection**
> As the business owner, I want to see which SKUs haven't sold recently, so that I can identify where capital is unnecessarily tied up.

*Acceptance Criteria:*
- A SKU is flagged as dead stock if it has stock > 0 and no sales within a configurable window (default 45 days)
- Report shows capital blocked per flagged SKU (stock qty × cost) and total capital blocked across all flagged SKUs

**FR-C3: Performance Ranking**
> As the business owner, I want to see which SKUs perform best/worst, so I can make informed purchase and discontinuation decisions.

*Acceptance Criteria:*
- SKUs can be ranked by revenue, quantity sold, and margin % independently (a high-volume SKU is not always the most profitable one, and the report must not conflate the two)

### Epic D: Reporting

**FR-D1: Standard Reports**
> As the business owner, I want a fixed set of reports available on demand, so I can review business performance without asking anyone to pull data for me.

*Acceptance Criteria (each report supports date-range and channel filters):*
- Channel-wise P&L
- SKU-wise P&L
- Inventory valuation
- Dead stock report
- Top/bottom performer report
- Entry audit log (raw list of all purchase/sale/return entries, for data verification)

### Epic F: Receivables Management *(confirmed in scope)*

**FR-F1: B2B Payment Terms**
> As the business owner, I want to record whether a B2B order is paid immediately or on credit terms, so that unpaid amounts are tracked rather than assumed collected.

*Acceptance Criteria:*
- Order Entry (FR-B2) for B2B channel allows marking an order as "Credit" with a due date, or "Paid Immediately"
- Credit orders create an open receivable equal to the order's revenue value

**FR-F2: Payment Recording**
> As the business owner, I want to record payments received against a B2B credit order, so that outstanding balances are accurate and up to date.

*Acceptance Criteria:*
- Partial payments are supported (an order can be partially paid, remainder stays outstanding)
- Each payment is timestamped and reduces the open receivable balance for that order
- A receivable is marked "Closed" only when fully paid

**FR-F3: Receivables Aging Report**
> As the business owner, I want to see all outstanding B2B receivables grouped by how overdue they are, so I know who to follow up with and how much cash is outstanding.

*Acceptance Criteria:*
- Report shows: customer/party, order reference, amount outstanding, due date, days overdue
- Standard aging buckets: not yet due, 1–30 days overdue, 31–60, 60+
- Total outstanding receivables figure shown prominently (this is uncollected cash — a key number for the owner)

### Epic E: Access

**FR-E1: Authentication**
> As the business owner, I want to log in securely, so unauthorized users cannot view or edit business data.

*Acceptance Criteria:*
- Single active user account in Phase 1 *(confirmed)*
- **However:** the underlying data model must include a Role/Permission structure from day one (e.g. a `role` field on the user table, permission checks written against roles rather than hardcoded to "the one user") — so that adding a second staff account with restricted access (e.g. entry-only, no report access) later is a configuration change, not a re-architecture
- This is an architecture instruction to the developer, not a Phase 1 UI feature — no role-management screen needs to be built yet

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Order entry form should submit and clear in under 1 second on a normal connection — this screen is used dozens of times daily; slowness compounds |
| Data Integrity | Stock quantity must never go negative without an explicit override/warning shown to the user |
| Auditability | Every entry (purchase/sale/return/payment) must be timestamped and attributable, even in a single-user system, to support later reconciliation |
| Usability | Daily order entry must be optimized for repetitive fast entry (keyboard-friendly, minimal clicks, bulk-grid mode) |
| Availability | Standard business-hours availability is sufficient; this is not a customer-facing system and doesn't need high-availability architecture |
| Data Retention | Historical price, cost, and commission data must be preserved, not overwritten, so past reports remain accurate even after terms change |
| Scalability (Access) | Data model must support role-based permissions without redesign, per FR-E1 |

### UI/UX — "Robust" Defined

The client asked for UI/UX to be "robust." That word isn't testable as written, so here's the concrete breakdown a developer can actually build against and a client can actually sign off on:

| Dimension | Concrete Criteria |
|---|---|
| Visual consistency | One design system used throughout (consistent spacing, type scale, button styles, color palette) — not each screen styled independently |
| Responsiveness | Fully usable on both desktop and tablet/mobile widths — daily entry may happen from a phone on the shop floor, not only a desk |
| Feedback & validation | Every form gives immediate inline validation (e.g. "stock cannot go below 0," "this field is required") — no silent failures, no generic error pages |
| Loading & empty states | Every screen has a defined loading state and empty state (e.g. "No dead stock — nice work" rather than a blank table) — polish is often judged on these edge cases, not the happy path |
| Data density done well | Reports (P&L, dead stock, receivables aging) need sortable/filterable tables, not static dumps — this is where "robust" will be judged hardest, since these are the screens the owner actually lives in |
| Accessibility basics | Adequate color contrast, legible font sizes — no reliance on color alone to indicate status (e.g. don't use only red/green with no icon/label, for colorblind accessibility and just general clarity) |

**BA recommendation:** before development starts, ask the client for 2–3 examples of dashboards/apps they consider "good UI" (their own Myntra seller panel, a finance app they like, anything). "Robust" means something different to every stakeholder — a reference example resolves that ambiguity in five minutes instead of a design review disagreement in week 5.

---

## 7. Business Rules (Calculation Logic)

```
Weighted Avg Cost (on purchase) =
  ((Old Stock Qty × Old Avg Cost) + (New Purchase Qty × New Purchase Price))
  / (Old Stock Qty + New Purchase Qty)

Revenue (per order line) = Qty Sold × Selling Price

Commission Amount =
    Revenue × Commission %          [if channel's commission type = Percentage]
    OR
    Qty Sold × Flat Commission Amount   [if channel's commission type = Flat per unit]

COGS       = Qty Sold × Weighted Avg Cost (at time of sale)
Net Profit = Revenue − Commission Amount − COGS
Margin %   = Net Profit / Revenue

Dead Stock Flag = Stock Qty > 0 AND no sale recorded in last [N] days (default 45, configurable)
Capital Blocked  = Stock Qty × Weighted Avg Cost, summed across all flagged SKUs

--- Receivables ---

Receivable Created (on Credit B2B order) = Revenue (full order value at time of sale)
Amount Outstanding = Receivable Value − Sum of Payments Received Against It
Days Overdue       = Today's Date − Due Date (only meaningful if > 0 and still outstanding)
Aging Bucket       = Not Due | 1–30 Days | 31–60 Days | 60+ Days, based on Days Overdue
Total Receivables Outstanding = Sum of Amount Outstanding across all open, non-zero receivables
```

**Note on commission and net profit interaction:** commission reduces *channel* profitability directly — this means the same SKU can show different net margins on Myntra vs. B2B even at identical selling price and cost, purely due to commission. This is expected and is in fact the entire point of Objective O2 (channel profitability visibility) — worth explaining to the client up front so a lower Myntra margin isn't mistaken for a data error.

These rules are the core intellectual property of this system — get sign-off from the client on these exact formulas before development starts, since disagreement on "how profit is calculated" discovered after go-live is expensive to fix (requires reprocessing historical data).

---

## 8. Confirmed Decisions (Signed Off by Client — [date])

| # | Item | Decision |
|---|---|---|
| 1 | Marketplace commission in profit calc | **Yes.** Commission (percentage or flat amount, per channel) factors into net profit. Owner can configure/edit it directly — see FR-A3. |
| 2 | Returns support | **Yes,** included in Phase 1 — see FR-B3. |
| 3 | Single user vs. multi-staff entry | **Single user in Phase 1**, but data model must support role-based access without rebuild later — see FR-E1. |
| 4 | Stock location | **Single location, confirmed.** No multi-warehouse logic needed. |
| 5 | B2B credit terms | **Receivables tracking is required in Phase 1** (moved from future scope) — see Epic F. |
| 6 | UI/UX quality bar | Client requires a "robust" UI/UX. Converted into concrete, testable criteria — see Section 6, "UI/UX — 'Robust' Defined." **Still recommend the client share 2–3 reference apps/dashboards** so this is judged against examples, not adjectives. |

**Recommendation:** get this table re-sent back to the client as a confirmation email ("here's what we heard, reply confirming") even though verbal/chat confirmation already happened — it's the artifact that protects both sides if scope is questioned later, and it costs five minutes now.

---

## 9. Success Metrics

How you'll know Phase 1 actually solved the business problem, 4–6 weeks post-launch:

- Client can answer "which channel is most profitable this month" in under 30 seconds, without a spreadsheet
- Client can name their top 3 dead-stock SKUs and the capital blocked, on demand
- Client can state total outstanding B2B receivables and how much is 60+ days overdue, on demand
- Daily order entry takes less time than the current Excel process (measure before/after)
- Zero instances of stock going negative without the system flagging it
- Client's own reaction to the UI, unprompted, is positive — the concrete criteria in Section 6 are the build target, but the real test is whether the client stops calling it "the Excel replacement" and starts calling it "the system"

---

## 10. Out of Scope — Future Roadmap (Not Estimated, Not Designed Yet)

Retained for context only — do not scope or design these until a Phase 1 retrospective confirms they're needed:
- Marketplace API integration (auto-import orders)
- AI/ML-based demand forecasting
- Full accounting/GST/Tally sync (Receivables tracking is now in Phase 1, but this is not a full accounting module — no ledger, no tax handling, no invoicing/PDF generation unless explicitly requested)
- CRM / vendor portal / production planning
- Multi-warehouse inventory
- Automated payment reminders / dunning workflows for overdue receivables
- Multi-role UI (permission architecture is in Phase 1; the actual "add a staff account with limited access" screen is not)

---

## 11. Glossary

| Term | Definition |
|---|---|
| SKU | Stock Keeping Unit — a unique product+variant identifier |
| COGS | Cost of Goods Sold |
| Dead Stock | Inventory with no recent sales movement, tying up capital unproductively |
| Weighted Average Cost | A costing method that blends old and new purchase costs into a single running average, rather than tracking each batch separately |
| Channel | A sales platform: Myntra, Zivame, Website, or B2B |
| Receivable | Money owed to the business by a customer for goods already delivered on credit terms |
| Aging | Categorizing outstanding receivables by how long they've been overdue (e.g. 1–30, 31–60, 60+ days) |
| Commission | The percentage or flat fee a marketplace channel (Myntra/Zivame) deducts from the sale price |

---

## Sign-Off

| Role | Name | Date | Signature/Confirmation |
|---|---|---|---|
| Business Owner (Client) | | | |
| Developer | | | |
| BA / Delivery Owner | | | |
