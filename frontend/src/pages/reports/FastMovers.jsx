import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFastMovers } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Card, Loader } from "../../components/ui/Surfaces";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function FastMovers() {
  const { data, isLoading } = useQuery({ queryKey: ["fast-movers"], queryFn: getFastMovers });

  const columns = useMemo(
    () => [
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      {
        accessorKey: "units_sold_in_window",
        header: "Units Sold",
        cell: (ctx) => <span className="num font-medium">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "average_daily_sales",
        header: "Avg. Daily Sales",
        cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "current_stock_qty",
        header: "Current Stock",
        cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "days_of_stock_remaining",
        header: "Days Remaining",
        cell: (ctx) => (ctx.getValue() == null ? "—" : <span className="num">{formatNumber(ctx.getValue())}</span>),
      },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Fast-moving SKUs</h1>
      <p className="mb-6 text-sm text-taupe">
        Top {data?.top_percentile ?? "…"}% of SKUs by units sold in the last {data?.window_days ?? "…"} days —
        velocity-based, independent of current stock level.
      </p>

      {isLoading ? (
        <Loader />
      ) : (
        <>
          <Card className="mb-6">
            <p className="text-xs uppercase tracking-wide text-taupe">Fast-Moving SKUs</p>
            <p className="font-display text-2xl font-semibold text-plum num">{data?.rows?.length ?? 0}</p>
          </Card>
          <DataTable
            columns={columns}
            data={data?.rows}
            searchable
            searchPlaceholder="Search code or name…"
            emptyTitle="No fast-movers yet"
            emptyMessage="Once there's enough sales history, the top sellers by velocity will appear here."
          />
        </>
      )}
    </div>
  );
}
