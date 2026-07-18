import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInventoryValuation } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Card, Loader } from "../../components/ui/Surfaces";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function InventoryValuation() {
  const { data, isLoading } = useQuery({
    queryKey: ["inventory-valuation"],
    queryFn: getInventoryValuation,
  });

  const columns = useMemo(
    () => [
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      { accessorKey: "stock_qty", header: "Stock Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "avg_cost", header: "Avg. Cost", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "stock_value", header: "Stock Value", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Inventory valuation</h1>
      <p className="mb-6 text-sm text-taupe">Current stock, valued at weighted average cost.</p>

      {isLoading ? (
        <Loader />
      ) : (
        <>
          <Card className="mb-6">
            <p className="text-xs uppercase tracking-wide text-taupe">Total Stock Value</p>
            <p className="font-display text-2xl font-semibold text-brand num">{formatCurrency(data?.total_stock_value)}</p>
          </Card>
          <DataTable
            columns={columns}
            data={data?.rows}
            searchable
            searchPlaceholder="Search code or name…"
            emptyTitle="No stock on hand"
          />
        </>
      )}
    </div>
  );
}
