import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listChannels, listAllActiveSkus } from "../../api/products";
import { createBulkOrders } from "../../api/transactions";
import { Card, ErrorBanner, Badge } from "../../components/ui/Surfaces";
import { Field, Input, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { useKeyboardGrid } from "../../hooks/useKeyboardGrid";
import { todayISO } from "../../utils/dates";
import { newKey } from "../../utils/id";
import { isPositiveInt, isPositiveMoney } from "../../utils/numbers";
import { invalidateBusinessData } from "../../utils/invalidate";
import { getErrorInfo } from "../../utils/errorCodes";

const COLS = 4; // channel, sku code, qty, override

function emptyRow() {
  return { key: newKey(), channelId: "", skuCode: "", quantity: "", override: "" };
}

export default function BulkOrderGrid() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  // Every active SKU, not just the first page: the API caps a page at 200, and a
  // code beyond that used to show "No match" even though it existed.
  const { data: skuList, isLoading: skusLoading } = useQuery({
    queryKey: ["skus-all-active"],
    queryFn: () => listAllActiveSkus(),
  });

  const [orderDate, setOrderDate] = useState(todayISO());
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [error, setError] = useState("");
  const [lineErrors, setLineErrors] = useState({}); // keyed by row.key
  const [allowNegative, setAllowNegative] = useState(false);

  const { registerCell, handleKeyDown, focusCell } = useKeyboardGrid(COLS);
  const firstCellRef = useRef(null);
  const submittedRows = useRef([]); // rows as sent, so server errors map back to the right row

  const skuByCode = useMemo(() => {
    const map = new Map();
    (skuList || []).forEach((s) => map.set(s.code.toLowerCase(), s));
    return map;
  }, [skuList]);

  // Resolved on demand from the current SKU list, so a row typed before the list
  // finished loading still matches.
  const resolve = (code) => skuByCode.get((code || "").trim().toLowerCase()) || null;

  function updateRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setLineErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
    setTimeout(() => focusCell(rows.length, 0), 0);
  }
  function removeRow(key) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function resolveSkuCode(key, code) {
    updateRow(key, { skuCode: code });
  }

  const activeRows = rows.filter((r) => r.channelId || r.skuCode || r.quantity);

  const mutation = useMutation({
    mutationFn: createBulkOrders,
    onSuccess: (result) => {
      if (result.errors?.length) {
        const map = {};
        result.errors.forEach((e) => {
          const row = submittedRows.current[e.order_index];
          if (row) map[row.key] = e.detail;
        });
        setLineErrors(map);
        setError(`${result.errors.length} line(s) failed — nothing was saved (all-or-nothing). See details below.`);
      } else {
        invalidateBusinessData(queryClient);
        navigate("/orders");
      }
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function handleSubmit() {
    setError("");
    setLineErrors({});
    const errs = {};
    activeRows.forEach((r) => {
      if (!r.channelId) errs[r.key] = "Channel is required.";
      else if (!resolve(r.skuCode)) errs[r.key] = "SKU code not recognized.";
      else if (!isPositiveInt(r.quantity)) errs[r.key] = "Quantity must be a whole number, 1 or more.";
      else if (r.override && !isPositiveMoney(r.override)) errs[r.key] = "Price override must be above 0 (max 2 decimals).";
    });
    if (Object.keys(errs).length) {
      setLineErrors(errs);
      setError("Fix the highlighted rows before submitting.");
      return;
    }
    submittedRows.current = activeRows;
    const payload = activeRows.map((r) => ({
      channel_id: r.channelId,
      order_date: orderDate,
      allow_negative_stock: allowNegative,
      items: [
        {
          sku_id: resolve(r.skuCode).id,
          quantity: Number(r.quantity),
          selling_price_override: r.override ? Number(r.override) : undefined,
        },
      ],
    }));
    mutation.mutate(payload);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Bulk order grid</h1>
          <p className="text-sm text-taupe">
            Tab/Enter to move between cells. This is the fastest way to log a day's orders.
          </p>
        </div>
        <Field label="Order date" className="w-40">
          <Input type="date" value={orderDate} max={todayISO()} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
      </div>

      <Card>
        <ErrorBanner message={error} />

        {/* Desktop/tablet: spreadsheet-style grid */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-[1fr_1.4fr_90px_120px_36px] gap-2 border-b border-taupe-light pb-2 text-xs font-semibold uppercase tracking-wide text-taupe-dark">
            <span>Channel</span>
            <span>SKU code</span>
            <span>Qty</span>
            <span>Price override</span>
            <span />
          </div>
          <div className="flex flex-col gap-1 pt-2">
            {rows.map((row, rIdx) => (
              <div key={row.key}>
                <div className="grid grid-cols-[1fr_1.4fr_90px_120px_36px] items-center gap-2">
                  <Select
                    ref={registerCell(rIdx, 0)}
                    aria-label={`Channel, row ${rIdx + 1}`}
                    value={row.channelId}
                    onKeyDown={handleKeyDown(rIdx, 0, rows.length, addRow)}
                    onChange={(e) => updateRow(row.key, { channelId: e.target.value })}
                  >
                    <option value="">—</option>
                    {(channels || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <div>
                    <Input
                      ref={registerCell(rIdx, 1)}
                      aria-label={`SKU code, row ${rIdx + 1}`}
                      value={row.skuCode}
                      onKeyDown={handleKeyDown(rIdx, 1, rows.length, addRow)}
                      onChange={(e) => resolveSkuCode(row.key, e.target.value)}
                      placeholder="e.g. BR-1024-BLK-32B"
                      className={row.skuCode && !resolve(row.skuCode) ? "border-warning" : ""}
                    />
                    {row.skuCode && !resolve(row.skuCode) && (
                      <p className="mt-0.5 text-xs text-warning">No match</p>
                    )}
                    {resolve(row.skuCode) && <p className="mt-0.5 truncate text-xs text-taupe">{resolve(row.skuCode).name}</p>}
                  </div>
                  <Input
                    ref={registerCell(rIdx, 2)}
                    type="number"
                    min="1"
                    step="1"
                    aria-label={`Quantity, row ${rIdx + 1}`}
                    value={row.quantity}
                    onKeyDown={handleKeyDown(rIdx, 2, rows.length, addRow)}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                  <Input
                    ref={registerCell(rIdx, 3)}
                    type="number"
                    step="0.01"
                    min="0.01"
                    aria-label={`Price override, row ${rIdx + 1}`}
                    value={row.override}
                    onKeyDown={handleKeyDown(rIdx, 3, rows.length, addRow)}
                    onChange={(e) => updateRow(row.key, { override: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={`Remove row ${rIdx + 1}`}
                    className="text-taupe hover:text-danger"
                    onClick={() => removeRow(row.key)}
                  >
                    ✕
                  </button>
                </div>
                {lineErrors[row.key] && (
                  <p role="alert" className="mt-0.5 text-xs text-danger">
                    {lineErrors[row.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: stacked cards — a wide grid doesn't work on a phone screen */}
        <div className="flex flex-col gap-4 sm:hidden">
          {rows.map((row, rIdx) => (
            <div key={row.key} className="rounded-sm border border-taupe-light p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-taupe-dark">Line {rIdx + 1}</span>
                <button type="button" className="text-xs text-danger" onClick={() => removeRow(row.key)}>
                  Remove
                </button>
              </div>
              {lineErrors[row.key] && (
                <p role="alert" className="mb-2 rounded-sm bg-danger/5 px-2 py-1 text-xs text-danger">
                  {lineErrors[row.key]}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Field label="Channel">
                  <Select value={row.channelId} onChange={(e) => updateRow(row.key, { channelId: e.target.value })}>
                    <option value="">—</option>
                    {(channels || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="SKU code" hint={resolve(row.skuCode) ? resolve(row.skuCode).name : row.skuCode ? "No match" : undefined}>
                  <Input value={row.skuCode} onChange={(e) => resolveSkuCode(row.key, e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Qty">
                    <Input type="number" min="1" step="1" inputMode="numeric" value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Override">
                    <Input type="number" step="0.01" value={row.override} onChange={(e) => updateRow(row.key, { override: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>

        {skusLoading && <p className="mt-3 text-xs text-taupe">Loading your SKU list…</p>}
        <p className="mt-3 text-xs text-taupe">
          Each row is logged as a paid order. For B2B credit sales (with a party and due date), use <em>Single order</em>.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          Allow stock to go negative (if a SKU runs short, log the sale anyway)
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            + Add row
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={mutation.isPending || skusLoading || activeRows.length === 0}>
            {mutation.isPending ? "Submitting…" : `Submit ${activeRows.length || ""} order(s)`}
          </Button>
          <Badge tone="neutral">All-or-nothing: a single bad line rejects the whole batch</Badge>
        </div>
      </Card>
    </div>
  );
}
