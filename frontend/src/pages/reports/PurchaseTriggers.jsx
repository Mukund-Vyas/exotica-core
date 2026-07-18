import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPurchaseTriggers } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Card, Loader, Badge } from "../../components/ui/Surfaces";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function PurchaseTriggers() {
  const { data, isLoading } = useQuery({ queryKey: ["purchase-triggers"], queryFn: getPurchaseTriggers });

  const columns = useMemo(
    () => [
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      {
        accessorKey: "current_stock_qty",
        header: "Current Stock",
        cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "days_of_stock_remaining",
        header: "Days Remaining",
        cell: (ctx) =>
          ctx.getValue() == null ? (
            "—"
          ) : (
            <Badge tone={Number(ctx.getValue()) <= 3 ? "danger" : "warning"}>{formatNumber(ctx.getValue())} days</Badge>
          ),
      },
      {
        accessorKey: "suggested_purchase_qty",
        header: "Suggested Qty",
        cell: (ctx) => <span className="num font-medium">{formatNumber(ctx.getValue())}</span>,
      },
      { accessorKey: "last_vendor_name", header: "Last Vendor", cell: (ctx) => ctx.getValue() || "—" },
    ],
    []
  );

  const totalUnits = (data?.rows || []).reduce((sum, r) => sum + r.suggested_purchase_qty, 0);

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Purchase triggers</h1>
      <p className="mb-6 text-sm text-taupe">
        Fast-moving SKUs that have crossed their reorder point — an in-app to-do, checked when you're ready,
        not a push alert.
      </p>

      {isLoading ? (
        <Loader />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-taupe">SKUs Needing Reorder</p>
              <p className="font-display text-2xl font-semibold text-danger num">{data?.rows?.length ?? 0}</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-taupe">Suggested Purchase Value</p>
              <p className="font-display text-2xl font-semibold text-brand num">
                {formatCurrency(data?.total_suggested_purchase_value)}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-taupe">Total Units Suggested</p>
              <p className="font-display text-2xl font-semibold text-ink num">{formatNumber(totalUnits)}</p>
            </Card>
          </div>
          <DataTable
            columns={columns}
            data={data?.rows}
            searchable
            searchPlaceholder="Search code or name…"
            emptyTitle="No SKUs need reordering right now"
            emptyMessage="Every fast-moving SKU currently has enough stock to cover its lead time plus safety buffer."
          />
        </>
      )}
    </div>
  );
}
