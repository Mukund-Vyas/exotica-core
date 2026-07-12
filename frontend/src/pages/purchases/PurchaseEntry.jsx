import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPurchase } from "../../api/transactions";
import { Card, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import SkuPicker from "../../components/SkuPicker";
import VendorPicker from "../../components/VendorPicker";
import { getErrorInfo } from "../../utils/errorCodes";

function emptyLine() {
  return { key: crypto.randomUUID(), sku: null, quantity: "", unit_cost: "" };
}

export default function PurchaseEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [vendor, setVendor] = useState(null);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
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
      if (!l.quantity || Number(l.quantity) <= 0) errs[`${l.key}-qty`] = "Quantity must be > 0.";
      if (!l.unit_cost || Number(l.unit_cost) <= 0) errs[`${l.key}-cost`] = "Cost must be > 0.";
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

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
        unit_cost: Number(l.unit_cost),
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
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Line items</p>
            <div className="flex flex-col gap-3">
              {lines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-1 gap-2 rounded-sm border border-taupe-light p-3 sm:grid-cols-[1fr_120px_120px_auto]">
                  <Field label={idx === 0 ? "SKU" : undefined} error={fieldErrors[`${line.key}-sku`]}>
                    <SkuPicker value={line.sku} onChange={(sku) => updateLine(line.key, { sku })} />
                  </Field>
                  <Field label={idx === 0 ? "Quantity" : undefined} error={fieldErrors[`${line.key}-qty`]}>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label={idx === 0 ? "Unit cost" : undefined} error={fieldErrors[`${line.key}-cost`]}>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
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
              {mutation.isPending ? "Saving…" : "Record purchase"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
