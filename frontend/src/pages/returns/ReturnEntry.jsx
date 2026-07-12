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

export default function ReturnEntry() {
  const queryClient = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });

  const [sku, setSku] = useState(null);
  const [channelId, setChannelId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  // Recent orders, filtered client-side to this SKU's lines — there is no
  // sku_id filter on GET /orders/, so this pulls the most recent window and
  // narrows in-browser. Fine at current order volumes; would need a backend
  // filter if order volume grows significantly.
  const { data: recentOrders, isFetching: loadingOrders } = useQuery({
    queryKey: ["orders-for-return", sku?.id],
    queryFn: () => listOrders({ limit: 100 }),
    enabled: Boolean(sku),
  });

  const matchingLines = useMemo(() => {
    if (!sku || !recentOrders) return [];
    const lines = [];
    recentOrders.items.forEach((order) => {
      order.items.forEach((item) => {
        if (item.sku_id === sku.id) {
          lines.push({ ...item, order_date: order.order_date, channel_id: order.channel_id });
        }
      });
    });
    return lines;
  }, [sku, recentOrders]);

  const channelName = (id) => channels?.find((c) => c.id === id)?.name || "—";

  const mutation = useMutation({
    mutationFn: createReturn,
    onSuccess: (ret) => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
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
    if (!sku || !channelId || !quantity) {
      setError("SKU, channel, and quantity are required.");
      return;
    }
    mutation.mutate({
      sku_id: sku.id,
      channel_id: channelId,
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
            <Field label="Channel" required>
              <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                <option value="">Select…</option>
                {(channels || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" required>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Return date" required>
              <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </Field>
          </div>

          <Field
            label="Original order line (recommended)"
            hint="Reversal amounts are exact when a source line is picked. Without one, the reversal is estimated from the current channel price/cost/commission."
          >
            <Select value={orderItemId} onChange={(e) => setOrderItemId(e.target.value)} disabled={!sku}>
              <option value="">No reference — estimate from current price</option>
              {loadingOrders && <option disabled>Loading recent sales…</option>}
              {matchingLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.order_date} · {channelName(line.channel_id)} · Qty {line.quantity} ·{" "}
                  {formatCurrency(line.selling_price_at_sale)}
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
