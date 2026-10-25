import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { createReturn, listOrders } from "../../api/transactions";
import { Card, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import SkuPicker from "../../components/SkuPicker";
import { formatCurrency } from "../../utils/currency";
import { getErrorInfo } from "../../utils/errorCodes";
import { formatDate, todayISO } from "../../utils/dates";
import { isPositiveInt } from "../../utils/numbers";
import { invalidateBusinessData } from "../../utils/invalidate";

export default function ReturnEntry() {
  const queryClient = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });

  const [sku, setSku] = useState(null);
  const [channelId, setChannelId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [returnDate, setReturnDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  // Sales of this SKU, newest first (filtered on the server, so older sales are
  // reachable too — this used to scan only the 100 most recent orders).
  const { data: skuOrders, isFetching: loadingOrders } = useQuery({
    queryKey: ["orders-for-return", sku?.id],
    queryFn: () => listOrders({ skuId: sku.id, limit: 100 }),
    enabled: Boolean(sku),
  });

  // Only lines with something left to return are offered.
  const matchingLines = useMemo(() => {
    if (!sku || !skuOrders) return [];
    const lines = [];
    skuOrders.items.forEach((order) => {
      order.items.forEach((item) => {
        const remaining = item.quantity - (item.returned_quantity || 0);
        if (item.sku_id === sku.id && remaining > 0) {
          lines.push({ ...item, remaining, order_date: order.order_date, channel_id: order.channel_id });
        }
      });
    });
    return lines;
  }, [sku, skuOrders]);

  const selectedLine = matchingLines.find((l) => l.id === orderItemId);
  // A return must be booked to the channel the item was sold on, otherwise that
  // channel's P&L is wrong. With a sale line chosen, the channel is not editable.
  const effectiveChannelId = selectedLine ? selectedLine.channel_id : channelId;

  const channelName = (id) => channels?.find((c) => c.id === id)?.name || "—";

  const mutation = useMutation({
    mutationFn: createReturn,
    onSuccess: (ret) => {
      invalidateBusinessData(queryClient);
      setSuccess(ret);
      setSku(null);
      setQuantity("");
      setOrderItemId("");
      setReason("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    if (!sku || !effectiveChannelId) {
      setError("Choose a SKU and a channel.");
      return;
    }
    if (!isPositiveInt(quantity)) {
      setError("Quantity must be a whole number, 1 or more.");
      return;
    }
    if (selectedLine && Number(quantity) > selectedLine.remaining) {
      setError(`Only ${selectedLine.remaining} unit(s) of that sale can still be returned.`);
      return;
    }
    mutation.mutate({
      sku_id: sku.id,
      channel_id: effectiveChannelId,
      quantity: Number(quantity),
      return_date: returnDate,
      reason: reason || undefined,
      order_item_id: orderItemId || undefined,
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">Log a return</h1>
      <Card>
        <ErrorBanner message={error} />
        {success && (
          <div className="mb-4 rounded-sm border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
            Return recorded. Revenue reversed: {formatCurrency(success.revenue_reversed)}, net profit reversed:{" "}
            {formatCurrency(success.net_profit_reversed)}.
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="SKU" required>
              <SkuPicker
                value={sku}
                onChange={(s) => {
                  setSku(s);
                  setOrderItemId("");
                }}
              />
            </Field>
            <Field label="Channel" required hint={selectedLine ? "Set by the sale line below." : undefined}>
              <Select
                value={effectiveChannelId}
                disabled={Boolean(selectedLine)}
                onChange={(e) => setChannelId(e.target.value)}
              >
                <option value="">Select…</option>
                {(channels || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                min="1"
                step="1"
                max={selectedLine ? selectedLine.remaining : undefined}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Return date" required>
              <Input
                type="date"
                value={returnDate}
                min={selectedLine?.order_date}
                max={todayISO()}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Original order line (recommended)"
            hint="Reversal amounts are exact when a source line is picked. Without one, the reversal is estimated from the current channel price/cost/commission."
          >
            <Select value={orderItemId} onChange={(e) => { setOrderItemId(e.target.value); setError(""); }} disabled={!sku}>
              <option value="">No reference — estimate from current price</option>
              {loadingOrders && <option disabled>Loading sales…</option>}
              {!loadingOrders && sku && matchingLines.length === 0 && <option disabled>No returnable sales found for this SKU</option>}
              {matchingLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {formatDate(line.order_date)} · {channelName(line.channel_id)} · Sold {line.quantity}
                  {line.returned_quantity ? ` (${line.returned_quantity} already returned)` : ""} ·{" "}
                  {formatCurrency(line.selling_price_at_sale)} each
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </Field>

          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Record return"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
