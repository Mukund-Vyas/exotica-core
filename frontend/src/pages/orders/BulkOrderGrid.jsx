import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listChannels, listSkus } from "../../api/products";
import { createBulkOrders } from "../../api/transactions";
import { Card, ErrorBanner, Badge } from "../../components/ui/Surfaces";
import { Field, Input, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { useKeyboardGrid } from "../../hooks/useKeyboardGrid";
import { formatCurrency } from "../../utils/currency";
import { getErrorInfo } from "../../utils/errorCodes";

const COLS = 4; // channel, sku code, qty, override

function emptyRow() {
  return { key: crypto.randomUUID(), channelId: "", skuCode: "", quantity: "", override: "", resolvedSku: null };
}

export default function BulkOrderGrid() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const { data: skuIndex } = useQuery({
    queryKey: ["skus-all-active"],
    queryFn: () => listSkus({ isActive: true, limit: 200 }),
  });

  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [error, setError] = useState("");
  const [lineErrors, setLineErrors] = useState({});

  const { registerCell, handleKeyDown, focusCell } = useKeyboardGrid(COLS);
  const firstCellRef = useRef(null);

  const skuByCode = useMemo(() => {
    const map = new Map();
    (skuIndex?.items || []).forEach((s) => map.set(s.code.toLowerCase(), s));
    return map;
  }, [skuIndex]);

  function updateRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
    setTimeout(() => focusCell(rows.length, 0), 0);
  }
  function removeRow(key) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function resolveSkuCode(key, code) {
    const match = skuByCode.get(code.trim().toLowerCase());
    updateRow(key, { skuCode: code, resolvedSku: match || null });
  }

  const activeRows = rows.filter((r) => r.channelId || r.skuCode || r.quantity);

  const mutation = useMutation({
    mutationFn: createBulkOrders,
    onSuccess: (result) => {
      if (result.errors?.length) {
        const map = {};
        result.errors.forEach((e) => {
          map[e.order_index] = e.detail;
        });
        setLineErrors(map);
        setError(`${result.errors.length} line(s) failed — nothing was saved (all-or-nothing). See details below.`);
      } else {
        queryClient.invalidateQueries({ queryKey: ["skus"] });
        navigate("/orders");
      }
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function handleSubmit() {
    setError("");
    setLineErrors({});
    const errs = {};
    activeRows.forEach((r, idx) => {
      if (!r.channelId) errs[idx] = "Channel is required.";
      else if (!r.resolvedSku) errs[idx] = "SKU code not recognized.";
      else if (!r.quantity || Number(r.quantity) <= 0) errs[idx] = "Quantity must be > 0.";
    });
    if (Object.keys(errs).length) {
      setLineErrors(errs);
      setError("Fix the highlighted rows before submitting.");
      return;
    }
    const payload = activeRows.map((r) => ({
      channel_id: r.channelId,
      order_date: orderDate,
      items: [
        {
          sku_id: r.resolvedSku.id,
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
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
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
                      value={row.skuCode}
                      onKeyDown={handleKeyDown(rIdx, 1, rows.length, addRow)}
                      onChange={(e) => resolveSkuCode(row.key, e.target.value)}
                      placeholder="e.g. BR-1024-BLK-32B"
                      className={row.skuCode && !row.resolvedSku ? "border-warning" : ""}
                    />
                    {row.skuCode && !row.resolvedSku && (
                      <p className="mt-0.5 text-xs text-warning">No match</p>
                    )}
                    {row.resolvedSku && <p className="mt-0.5 truncate text-xs text-taupe">{row.resolvedSku.name}</p>}
                  </div>
                  <Input
                    ref={registerCell(rIdx, 2)}
                    type="number"
                    min="1"
                    value={row.quantity}
                    onKeyDown={handleKeyDown(rIdx, 2, rows.length, addRow)}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                  <Input
                    ref={registerCell(rIdx, 3)}
                    type="number"
                    step="0.01"
                    value={row.override}
                    onKeyDown={handleKeyDown(rIdx, 3, rows.length, addRow)}
                    onChange={(e) => updateRow(row.key, { override: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label="Remove row"
                    className="text-taupe hover:text-danger"
                    onClick={() => removeRow(row.key)}
                  >
                    ✕
                  </button>
                </div>
                {lineErrors[rows.filter((r) => r.channelId || r.skuCode || r.quantity).indexOf(row)] && (
                  <p className="mt-0.5 text-xs text-danger">
                    {lineErrors[rows.filter((r) => r.channelId || r.skuCode || r.quantity).indexOf(row)]}
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
                <Field label="SKU code" hint={row.resolvedSku ? row.resolvedSku.name : row.skuCode ? "No match" : undefined}>
                  <Input value={row.skuCode} onChange={(e) => resolveSkuCode(row.key, e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Qty">
                    <Input type="number" min="1" value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: e.target.value })} />
                  </Field>
                  <Field label="Override">
                    <Input type="number" step="0.01" value={row.override} onChange={(e) => updateRow(row.key, { override: e.target.value })} />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            + Add row
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting…" : `Submit ${activeRows.length || ""} order(s)`}
          </Button>
          <Badge tone="neutral">All-or-nothing: a single bad line rejects the whole batch</Badge>
        </div>
      </Card>
    </div>
  );
}
