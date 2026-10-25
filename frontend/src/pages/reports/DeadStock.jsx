import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDeadStock } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Badge, Card, Loader } from "../../components/ui/Surfaces";
import { formatDate } from "../../utils/dates";
import { formatCurrency, formatCost, formatNumber } from "../../utils/currency";

export default function DeadStock() {
  const { data, isLoading } = useQuery({ queryKey: ["dead-stock"], queryFn: getDeadStock });

  const columns = useMemo(
    () => [
      {
        accessorKey: "sku_code",
        header: "Code",
        cell: (ctx) => (
          <span>
            {ctx.getValue()}
            {ctx.row.original.is_active === false && (
              <Badge tone="neutral" className="ml-2">
                Discontinued
              </Badge>
            )}
          </span>
        ),
      },
      { accessorKey: "sku_name", header: "Name" },
      { accessorKey: "stock_qty", header: "Stock Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "avg_cost", header: "Avg. Cost", cell: (ctx) => <span className="num">{formatCost(ctx.getValue())}</span> },
      { accessorKey: "capital_blocked", header: "Capital Blocked", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "last_sale_date", header: "Last Sale", cell: (ctx) => (ctx.getValue() ? formatDate(ctx.getValue()) : "Never sold") },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Dead stock</h1>
      <p className="mb-6 text-sm text-taupe">
        SKUs with stock on hand but no sale in {data?.window_days ?? 45}+ days — capital sitting idle.
      </p>

      {isLoading ? (
        <Loader />
      ) : (
        <>
          <Card className="mb-6">
            <p className="text-xs uppercase tracking-wide text-taupe">Total Capital Blocked</p>
            <p className="font-display text-2xl font-semibold text-warning num">
              {formatCurrency(data?.total_capital_blocked)}
            </p>
          </Card>
          <DataTable
            columns={columns}
            data={data?.rows}
            searchable
            searchPlaceholder="Search code or name…"
            emptyTitle="No dead stock — nice work"
            emptyMessage="Every SKU with stock on hand has sold within the window."
          />
        </>
      )}
    </div>
  );
}
