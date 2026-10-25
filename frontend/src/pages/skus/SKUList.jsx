import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listSkus } from "../../api/products";
import { usePagedList } from "../../hooks/usePagedList";
import { useDebounced } from "../../hooks/useDebounced";
import { Input } from "../../components/ui/Field";
import DataTable from "../../components/ui/DataTable";
import { Badge } from "../../components/ui/Surfaces";
import Button from "../../components/ui/Button";
import { formatCost, formatNumber } from "../../utils/currency";

export default function SKUList() {
  const [activeOnly, setActiveOnly] = useState(true);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());

  // Searching happens on the server over the whole catalogue. It used to filter
  // only the first 200 rows already in the browser, so a SKU beyond them could not
  // be found by searching.
  const list = usePagedList(["skus", activeOnly, debouncedSearch], ({ limit, offset }) =>
    listSkus({ isActive: activeOnly ? true : undefined, search: debouncedSearch || undefined, limit, offset })
  );

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
        cell: (ctx) => (
          <span className={`num ${ctx.getValue() <= 0 ? "font-medium text-danger" : ""}`}>
            {formatNumber(ctx.getValue())}
            {ctx.getValue() < 0 && <span className="sr-only"> (negative stock)</span>}
          </span>
        ),
      },
      {
        accessorKey: "current_avg_cost",
        header: "Avg. Cost",
        cell: (ctx) => <span className="num">{formatCost(ctx.getValue())}</span>,
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

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="w-full max-w-xs">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, category or size…"
            aria-label="Search SKUs"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="h-4 w-4 rounded border-taupe-light text-brand"
          />
          Active only
        </label>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        isLoading={list.isLoading}
        emptyTitle={debouncedSearch ? "No SKUs match your search" : "No SKUs yet"}
        emptyMessage={
          debouncedSearch
            ? "Try a different code, name, category or size — or untick “Active only”."
            : "Create your first SKU to start recording purchases and sales."
        }
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
      />
    </div>
  );
}
