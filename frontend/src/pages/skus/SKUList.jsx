import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listSkus } from "../../api/products";
import DataTable from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Surfaces";
import Button from "../../components/ui/Button";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function SKUList() {
  const [activeOnly, setActiveOnly] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["skus", activeOnly],
    queryFn: () => listSkus({ isActive: activeOnly ? true : undefined, limit: 200 }),
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: (ctx) => (
          <Link to={`/skus/${ctx.row.original.id}`} className="font-medium text-brand hover:underline">
            {ctx.getValue()}
          </Link>
        ),
      },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "category", header: "Category" },
      { accessorKey: "size_variant", header: "Size / Variant" },
      {
        accessorKey: "current_stock_qty",
        header: "Stock",
        cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span>,
      },
      {
        accessorKey: "current_avg_cost",
        header: "Avg. Cost",
        cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span>,
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: (ctx) =>
          ctx.getValue() ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Discontinued</Badge>
          ),
      },
    ],
    []
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">SKUs</h1>
          <p className="text-sm text-taupe">Master product list — every purchase and sale references these.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/skus/bulk-upload">
            <Button variant="secondary">Bulk upload</Button>
          </Link>
          <Link to="/skus/new">
            <Button>+ New SKU</Button>
          </Link>
        </div>
      </div>

      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
          className="h-4 w-4 rounded border-taupe-light text-brand"
        />
        Active only
      </label>

      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search by code, name, or category…"
        emptyTitle="No SKUs yet"
        emptyMessage="Create your first SKU to start recording purchases and sales."
      />
    </div>
  );
}
