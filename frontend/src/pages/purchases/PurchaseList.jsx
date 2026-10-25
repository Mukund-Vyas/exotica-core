import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listPurchases } from "../../api/transactions";
import { usePagedList } from "../../hooks/usePagedList";
import DataTable from "../../components/ui/DataTable";
import { Field } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import VendorPicker from "../../components/VendorPicker";
import { formatCurrency, formatCost, formatNumber } from "../../utils/currency";
import { formatDate } from "../../utils/dates";

export default function PurchaseList() {
  const [vendor, setVendor] = useState(null);

  const list = usePagedList(["purchases", vendor?.id], ({ limit, offset }) =>
    listPurchases({ vendorId: vendor?.id, limit, offset })
  );

  const rows = useMemo(() => {
    return list.items.flatMap((purchase) =>
      purchase.items.map((item) => ({
        ...item,
        vendor: purchase.vendor,
        purchase_date: purchase.purchase_date,
        purchase_id: purchase.id,
      }))
    );
  }, [list.items]);

  const columns = useMemo(
    () => [
      { accessorKey: "purchase_date", header: "Date", cell: (ctx) => formatDate(ctx.getValue()) },
      { accessorKey: "vendor", header: "Vendor" },
      {
        id: "sku",
        header: "SKU",
        accessorFn: (r) => (r.sku_code ? `${r.sku_code} ${r.sku_name}` : r.sku_id),
        cell: (ctx) => (
          <span>
            <span className="font-medium">{ctx.row.original.sku_code || "—"}</span>
            <span className="ml-1 text-xs text-taupe">{ctx.row.original.sku_name}</span>
          </span>
        ),
      },
      {
        accessorKey: "vendor_sku_code",
        header: "Vendor code",
        cell: (ctx) => ctx.getValue() || <span className="text-taupe">—</span>,
      },
      { accessorKey: "quantity", header: "Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "unit_cost", header: "Unit Cost", cell: (ctx) => <span className="num">{formatCost(ctx.getValue())}</span> },
      { accessorKey: "line_total", header: "Line Total", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "resulting_avg_cost", header: "New Avg. Cost", cell: (ctx) => <span className="num">{formatCost(ctx.getValue())}</span> },
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
        isLoading={list.isLoading}
        searchable
        searchPlaceholder="Search loaded purchases…"
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
        emptyTitle="No purchases recorded yet"
        emptyMessage="Record your first stock-in to start tracking cost and inventory."
      />
    </div>
  );
}
