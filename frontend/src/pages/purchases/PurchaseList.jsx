import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listPurchases } from "../../api/transactions";
import DataTable from "../../components/ui/DataTable";
import { Field } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import VendorPicker from "../../components/VendorPicker";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function PurchaseList() {
  const [vendor, setVendor] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", vendor?.id],
    queryFn: () => listPurchases({ vendorId: vendor?.id, limit: 100 }),
  });

  const rows = useMemo(() => {
    return (data?.items || []).flatMap((purchase) =>
      purchase.items.map((item) => ({
        ...item,
        vendor: purchase.vendor,
        purchase_date: purchase.purchase_date,
        purchase_id: purchase.id,
      }))
    );
  }, [data]);

  const columns = useMemo(
    () => [
      { accessorKey: "purchase_date", header: "Date" },
      { accessorKey: "vendor", header: "Vendor" },
      { accessorKey: "sku_id", header: "SKU ID", cell: (ctx) => <span className="text-xs text-taupe">{ctx.getValue().slice(0, 8)}…</span> },
      { accessorKey: "quantity", header: "Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "unit_cost", header: "Unit Cost", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "line_total", header: "Line Total", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "resulting_avg_cost", header: "New Avg. Cost", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
    ],
    []
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Purchases</h1>
          <p className="text-sm text-taupe">Stock-in history with weighted average cost after each line.</p>
        </div>
        <Link to="/purchases/new">
          <Button>+ Record purchase</Button>
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:max-w-3xl">
        <Field label="Vendor">
          <VendorPicker value={vendor} onChange={setVendor} placeholder="All vendors" allowCreate={false} />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search vendor…"
        emptyTitle="No purchases recorded yet"
        emptyMessage="Record your first stock-in to start tracking cost and inventory."
      />
    </div>
  );
}
