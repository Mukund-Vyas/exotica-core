import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listVendorMappings } from "../../api/vendorMappings";
import { createPurchase } from "../../api/transactions";
import { Card, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import SkuPicker from "../../components/SkuPicker";
import VendorPicker from "../../components/VendorPicker";
import { getErrorInfo } from "../../utils/errorCodes";
import { formatCurrency, sumMoney } from "../../utils/currency";
import { todayISO } from "../../utils/dates";
import { newKey } from "../../utils/id";
import { isPositiveInt, isPositiveMoney } from "../../utils/numbers";
import { invalidateBusinessData } from "../../utils/invalidate";

function emptyLine() {
  return { key: newKey(), sku: null, quantity: "", unit_cost: "" };
}

/** Shows the selected vendor's own code for a SKU (or invites adding one). */
function VendorCodeHint({ vendor, sku }) {
  const { data, isLoading } = useQuery({
    queryKey: ["vendor-mappings-for-sku", vendor?.id, sku?.id],
    queryFn: () => listVendorMappings({ vendorId: vendor.id, skuId: sku.id, limit: 1 }),
    enabled: Boolean(vendor && sku),
  });
  if (!vendor || !sku || isLoading) return null;
  const mapping = data?.items?.[0];
  return mapping ? (
    <p className="mt-1 text-xs text-taupe">
      {vendor.name}’s code: <span className="font-medium text-ink">{mapping.vendor_sku_code}</span>
      {mapping.vendor_product_name ? ` · ${mapping.vendor_product_name}` : ""}
    </p>
  ) : (
    <p className="mt-1 text-xs text-taupe">
      No {vendor.name} code saved for this SKU.{" "}
      <Link to={`/vendors/${vendor.id}/sku-mapping`} className="text-brand underline" target="_blank" rel="noreferrer">
        Add one
      </Link>
    </p>
  );
}

export default function PurchaseEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [vendor, setVendor] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      invalidateBusinessData(queryClient);
      navigate("/purchases");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function validate() {
    const errs = {};
    if (!vendor) errs.vendor = "Select or add a vendor.";
    if (!purchaseDate) errs.purchaseDate = "Date is required.";
    lines.forEach((l) => {
      if (!l.sku) errs[`${l.key}-sku`] = "Select a SKU.";
      if (!isPositiveInt(l.quantity)) errs[`${l.key}-qty`] = "Enter a whole number, 1 or more.";
      if (!isPositiveMoney(l.unit_cost, 4)) errs[`${l.key}-cost`] = "Enter a cost above 0 (max 4 decimals).";
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const purchaseTotal = sumMoney(
    lines
      .filter((l) => isPositiveInt(l.quantity) && isPositiveMoney(l.unit_cost, 4))
      .map((l) => ({ amount: Number(l.quantity) * Number(l.unit_cost) })),
    "amount"
  );

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    mutation.mutate({
      vendor_id: vendor.id,
      purchase_date: purchaseDate,
      items: lines.map((l) => ({
        sku_id: l.sku.id,
        quantity: Number(l.quantity),
        unit_cost: l.unit_cost.trim(),
      })),
    });
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">Record a purchase</h1>
      <Card>
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vendor" required error={fieldErrors.vendor}>
              <VendorPicker value={vendor} onChange={setVendor} />
            </Field>
            <Field label="Purchase date" required error={fieldErrors.purchaseDate}>
              <Input type="date" value={purchaseDate} max={todayISO()} onChange={(e) => setPurchaseDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Line items</p>
            <div className="flex flex-col gap-3">
              {lines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-1 gap-2 rounded-sm border border-taupe-light p-3 sm:grid-cols-[1fr_120px_120px_auto]">
                  <Field label={idx === 0 ? "SKU" : undefined} error={fieldErrors[`${line.key}-sku`]}>
                    <SkuPicker
                      value={line.sku}
                      vendorId={vendor?.id}
                      placeholder={vendor ? "Search SKU, or the vendor’s code…" : undefined}
                      onChange={(sku) => updateLine(line.key, { sku })}
                    />
                    <VendorCodeHint vendor={vendor} sku={line.sku} />
                  </Field>
                  <Field label={idx === 0 ? "Quantity" : undefined} error={fieldErrors[`${line.key}-qty`]}>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      aria-label={`Quantity, line ${idx + 1}`}
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label={idx === 0 ? "Unit cost" : undefined} error={fieldErrors[`${line.key}-cost`]}>
                    <Input
                      type="number"
                      step="any"
                      min="0.0001"
                      inputMode="decimal"
                      aria-label={`Unit cost, line ${idx + 1}`}
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                    />
                  </Field>
                  <div className={idx === 0 ? "mt-6" : ""}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${idx + 1}`}
                      onClick={() => removeLine(line.key)}
                    >
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

          {purchaseTotal > 0 && (
            <p className="text-sm text-taupe">
              Purchase total: <span className="num font-semibold text-ink">{formatCurrency(purchaseTotal)}</span>
            </p>
          )}

          <div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Record purchase"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
