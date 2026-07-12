import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInventoryAging } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Loader, Badge } from "../../components/ui/Surfaces";
import { Field, Select } from "../../components/ui/Field";
import { formatNumber } from "../../utils/currency";

const BUCKET_TONE = {
  "0-30": "success",
  "31-60": "warning",
  "61-90": "warning",
  "90+": "danger",
};

export default function InventoryAging() {
  const { data, isLoading } = useQuery({ queryKey: ["inventory-aging"], queryFn: getInventoryAging });
  const [bucket, setBucket] = useState("");
  const [category, setCategory] = useState("");

  const categories = useMemo(
    () => Array.from(new Set((data?.rows || []).map((r) => r.category))).sort(),
    [data]
  );

  const filteredRows = useMemo(() => {
    return (data?.rows || []).filter(
      (r) => (!bucket || r.aging_bucket === bucket) && (!category || r.category === category)
    );
  }, [data, bucket, category]);

  const columns = useMemo(
    () => [
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      { accessorKey: "category", header: "Category" },
      { accessorKey: "stock_qty", header: "Stock Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "last_purchase_date", header: "Last Restocked" },
      {
        accessorKey: "days_since_last_purchase",
        header: "Days Since",
        cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "aging_bucket",
        header: "Bucket",
        cell: (ctx) => <Badge tone={BUCKET_TONE[ctx.getValue()] || "neutral"}>{ctx.getValue()} days</Badge>,
      },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Inventory aging</h1>
      <p className="mb-1 text-sm text-taupe">
        Days since each SKU was last restocked — a proxy for replenishment staleness.
      </p>
      <p className="mb-6 text-xs text-taupe">
        Note: this system uses weighted-average costing, not batch/lot tracking, so this reflects "how long
        since this SKU's last purchase," not true FIFO lot-level aging of specific units.
      </p>

      {isLoading ? (
        <Loader />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
            <Field label="Bucket">
              <Select value={bucket} onChange={(e) => setBucket(e.target.value)}>
                <option value="">All buckets</option>
                <option value="0-30">0–30 days</option>
                <option value="31-60">31–60 days</option>
                <option value="61-90">61–90 days</option>
                <option value="90+">90+ days</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DataTable
            columns={columns}
            data={filteredRows}
            searchable
            searchPlaceholder="Search code or name…"
            emptyTitle="No stock to show"
            emptyMessage="Every active SKU with stock on hand would appear here."
          />
        </>
      )}
    </div>
  );
}
