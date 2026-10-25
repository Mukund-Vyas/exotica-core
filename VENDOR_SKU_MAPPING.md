# Vendor ↔ Exotica SKU mapping

Each vendor labels products with its own codes and names. This feature links a vendor's code to your SKU.

## Rules
- One vendor code maps to **one** SKU (compared ignoring case and extra spaces, per vendor).
- A vendor has at most **one code per SKU**. Different vendors may reuse the same code text.
- Only the vendor's code/name can be edited. To point a code at a different SKU, remove and re-add it.
- Mappings use the existing `vendors:read` / `vendors:write` permissions (no new permissions).
- Each purchase line stores a **snapshot** of the vendor code at purchase time, so history is unaffected by later edits or deletions.

## Where it appears
- **Vendors → "SKU codes"** per vendor: add, edit, remove, search, and CSV import (template download, per-row error report).
- **Record purchase**: after choosing a vendor, the SKU search also matches that vendor's codes/names and shows the code; each line shows the vendor's code (or a link to add one).
- **Purchases list**: new "Vendor code" column.
- **SKU edit page**: "Vendor codes" card listing every vendor's code for that SKU.

## API (all under `/api/v1`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/vendor-sku-mappings/?vendor_id&sku_id&search` | list (paged) |
| GET | `/vendor-sku-mappings/lookup?vendor_id&code` | resolve a vendor code to a SKU |
| POST | `/vendor-sku-mappings/` | add |
| PATCH / DELETE | `/vendor-sku-mappings/{id}` | edit code/name · remove |
| GET / POST | `/vendor-sku-mappings/bulk/template` · `/bulk` | CSV template · CSV import (form: `vendor_id`, `file`) |
| GET | `/skus/?search=&vendor_id=` | SKU search that also matches the vendor's codes |
| GET | `/vendors/{id}` | single vendor |

CSV columns: `vendor_sku_code`, `vendor_product_name` (optional), `exotica_sku_code` (header spelling/case is forgiven).

## Deploy
Run the migration: `alembic upgrade head` (adds `0006_vendor_sku_mappings`; reversible).
