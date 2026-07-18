import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listChannels, getCurrentChannelPrice } from "../../api/products";
import { createOrder } from "../../api/transactions";
import { Card, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import SkuPicker from "../../components/SkuPicker";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency } from "../../utils/currency";
import { getErrorInfo } from "../../utils/errorCodes";

function emptyLine() {
  return { key: crypto.randomUUID(), sku: null, quantity: "", override: "", autoPrice: undefined };
}

export default function OrderEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });

  const [channelId, setChannelId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([emptyLine()]);
  const [paymentTerm, setPaymentTerm] = useState("paid_immediately");
  const [party, setParty] = useState(null);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [stockConfirm, setStockConfirm] = useState(null); // { payload, detail }

  const selectedChannel = channels?.find((c) => c.id === channelId);
  const isB2B = selectedChannel?.code === "b2b";

  useEffect(() => {
    if (channels?.length && !channelId) setChannelId(channels[0].id);
  }, [channels, channelId]);

  // Re-fetch price for every line that already has a SKU whenever the
  // channel changes — previously this only ran when a SKU was first picked,
  // so switching channels afterward left the stale price displayed.
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    (async () => {
      const linesWithSku = lines.filter((l) => l.sku);
      if (!linesWithSku.length) return;
      const results = await Promise.all(
        linesWithSku.map(async (l) => {
          const price = await getCurrentChannelPrice(l.sku.id, channelId);
          return { key: l.key, autoPrice: price?.price ?? null };
        })
      );
      if (cancelled) return;
      setLines((prev) =>
        prev.map((l) => {
          const match = results.find((r) => r.key === l.key);
          return match ? { ...l, autoPrice: match.autoPrice } : l;
        })
      );
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-runs on channel change — it reads whatever
    // lines exist at that moment via closure, which is what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSkuChange(key, sku) {
    updateLine(key, { sku, autoPrice: undefined });
    if (sku && channelId) {
      const price = await getCurrentChannelPrice(sku.id, channelId);
      updateLine(key, { autoPrice: price?.price ?? null });
    }
  }

  function buildPayload(allowNegative) {
    return {
      channel_id: channelId,
      order_date: orderDate,
      allow_negative_stock: allowNegative,
      payment_term: isB2B ? paymentTerm : undefined,
      party_id: isB2B ? party?.id : undefined,
      due_date: isB2B && paymentTerm === "credit" ? dueDate : undefined,
      items: lines.map((l) => ({
        sku_id: l.sku.id,
        quantity: Number(l.quantity),
        selling_price_override: l.override ? Number(l.override) : undefined,
      })),
    };
  }

  const mutation = useMutation({
    mutationFn: (payload) => createOrder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
      navigate("/orders");
    },
    onError: (err) => {
      const info = getErrorInfo(err);
      if (info.code === "insufficient_stock") {
        setStockConfirm({ detail: info.message });
      } else {
        setError(info.message);
      }
    },
  });

  function validate() {
    const errs = {};
    if (!channelId) errs.channel = "Select a channel.";
    if (!orderDate) errs.date = "Date is required.";
    if (isB2B && paymentTerm === "credit" && !party) errs.party = "Select or add a party for credit orders.";
    if (isB2B && paymentTerm === "credit" && !dueDate) errs.dueDate = "Due date is required for credit orders.";
    lines.forEach((l) => {
      if (!l.sku) errs[`${l.key}-sku`] = "Select a SKU.";
      if (!l.quantity || Number(l.quantity) <= 0) errs[`${l.key}-qty`] = "Quantity must be > 0.";
      if (l.sku && l.autoPrice === null && !l.override) {
        errs[`${l.key}-price`] = "No channel price is set — enter an override price.";
      }
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    mutation.mutate(buildPayload(false));
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">Log an order</h1>
      <Card>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Channel" required error={fieldErrors.channel}>
              <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {(channels || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Order date" required error={fieldErrors.date}>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </Field>
          </div>

          {isB2B && (
            <div className="rounded-sm border border-brand-50 bg-brand-50/40 p-3">
              <p className="mb-3 text-sm font-medium text-ink">B2B payment terms (FR-F1)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Terms">
                  <Select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)}>
                    <option value="paid_immediately">Paid immediately</option>
                    <option value="credit">Credit</option>
                  </Select>
                </Field>
                <Field label="Party" required={paymentTerm === "credit"} error={fieldErrors.party}>
                  <PartyPicker value={party} onChange={setParty} />
                </Field>
                {paymentTerm === "credit" && (
                  <Field label="Due date" required error={fieldErrors.dueDate}>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Line items</p>
            <div className="flex flex-col gap-3">
              {lines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-1 gap-2 rounded-sm border border-taupe-light p-3 sm:grid-cols-[1fr_90px_120px_auto]">
                  <Field label={idx === 0 ? "SKU" : undefined} error={fieldErrors[`${line.key}-sku`]}>
                    <SkuPicker value={line.sku} onChange={(sku) => handleSkuChange(line.key, sku)} />
                  </Field>
                  <Field label={idx === 0 ? "Qty" : undefined} error={fieldErrors[`${line.key}-qty`]}>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={idx === 0 ? "Price" : undefined}
                    hint={
                      line.sku && line.autoPrice !== undefined
                        ? line.autoPrice === null
                          ? "No price set for this channel"
                          : `Auto: ${formatCurrency(line.autoPrice)}`
                        : undefined
                    }
                    error={fieldErrors[`${line.key}-price`]}
                  >
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={line.autoPrice ? String(line.autoPrice) : "Override"}
                      value={line.override}
                      onChange={(e) => updateLine(line.key, { override: e.target.value })}
                    />
                  </Field>
                  <div className={idx === 0 ? "mt-6" : ""}>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.key)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={addLine}>
              + Add line
            </Button>
          </div>

          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Log order"}
            </Button>
          </div>
        </form>
      </Card>

      <Modal
        open={Boolean(stockConfirm)}
        onClose={() => setStockConfirm(null)}
        title="Stock would go negative"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setStockConfirm(null);
                mutation.mutate(buildPayload(true));
              }}
            >
              Proceed anyway
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">{stockConfirm?.detail}</p>
        <p className="mt-2 text-sm text-taupe">
          You can proceed and let stock go negative, or cancel and adjust the quantity.
        </p>
      </Modal>
    </div>
  );
}
