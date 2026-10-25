import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import { Loader, EmptyState } from "./Surfaces";
import { Input } from "./Field";
import Button from "./Button";
import { smartSortingFn } from "../../utils/sort";

const ARIA_SORT = { asc: "ascending", desc: "descending" };

/**
 * Props for server-paged lists (the API returns at most 200 rows per request):
 *   totalCount    – total rows on the server
 *   hasMore       – whether more rows can be fetched
 *   onLoadMore    – fetch the next page
 *   isLoadingMore – fetch in flight
 */
export default function DataTable({
  columns,
  data,
  isLoading,
  emptyTitle = "No data yet",
  emptyMessage,
  searchable = false,
  searchPlaceholder = "Search…",
  pageSize = 15,
  totalCount,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
}) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data: data || [],
    columns,
    // Numeric-aware sort (API money values are strings like "-250.00").
    defaultColumn: { sortingFn: smartSortingFn },
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (isLoading) return <Loader label="Loading data…" />;

  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }

  const visibleRows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div>
      {searchable && (
        <div className="mb-3 max-w-xs">
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-sm border border-taupe-light">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-ivory text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ARIA_SORT[sorted] || (canSort ? "none" : undefined)}
                      tabIndex={canSort ? 0 : undefined}
                      className={`select-none whitespace-nowrap border-b border-taupe-light px-3 py-2 font-medium text-taupe-dark ${
                        canSort ? "cursor-pointer hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                      onKeyDown={(e) => {
                        if (canSort && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          header.column.toggleSorting();
                        }
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: "↑", desc: "↓" }[sorted] ?? ""}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-taupe">
                  No rows match “{globalFilter}”.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-taupe-light last:border-0 hover:bg-ivory/60">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-3 py-2 text-ink">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-taupe">
        <span>
          {globalFilter
            ? `${filteredCount} of ${data.length} loaded rows match`
            : totalCount != null
              ? `Showing ${data.length} of ${totalCount}`
              : `${data.length} row${data.length === 1 ? "" : "s"}`}
        </span>
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-2">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button variant="secondary" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        )}
      </div>
      {hasMore && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
