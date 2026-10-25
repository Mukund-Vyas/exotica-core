import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReceivablesAging } from "../../api/transactions";
import DataTable from "../../components/ui/DataTable";
import { Card, Loader } from "../../components/ui/Surfaces";
import { Field } from "../../components/ui/Field";
import AgingBadge from "../../components/AgingBadge";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency, formatNumber } from "../../utils/currency";
import { formatDate } from "../../utils/dates";

export default function ReceivablesAging() {
  const [party, setParty] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["receivables-aging", party?.id],
    queryFn: () => getReceivablesAging(undefined, party?.id),
  });

  // Exact per-bucket sums come from the server (no floating-point addition here).
  const bucketTotals = data?.bucket_totals ?? {};
  const BUCKETS = ["Not Due", "1-30 Days", "31-60 Days", "60+ Days"];

  const columns = useMemo(
    () => [
      { accessorKey: "party_name", header: "Party", cell: (ctx) => ctx.getValue() || "—" },
      {
        id: "order",
        header: "Order",
        accessorFn: (r) => r.order_date || "",
        cell: (ctx) => (
          <span>
            {formatDate(ctx.row.original.order_date)}
            <span className="ml-1 text-xs text-taupe">#{ctx.row.original.order_id.slice(0, 6)}</span>
          </span>
        ),
      },
      { accessorKey: "amount_outstanding", header: "Outstanding", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "due_date", header: "Due Date", cell: (ctx) => formatDate(ctx.getValue()) },
      { accessorKey: "days_overdue", header: "Days Overdue", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "aging_bucket", header: "Bucket", cell: (ctx) => <AgingBadge bucket={ctx.getValue()} /> },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Receivables aging</h1>
      <p className="mb-6 text-sm text-taupe">Who owes what, and how overdue it is.</p>

      <div className="mb-4 max-w-xs">
        <Field label="Party">
          <PartyPicker value={party} onChange={setParty} placeholder="All parties" allowCreate={false} />
        </Field>
      </div>

      {isLoading ? (
        <Loader />
      ) : !data ? (
        // The load failed (the banner above explains why) — don't show ₹0 as if it were real.
        <p className="text-sm text-danger">Couldn’t load the aging report.</p>
      ) : (
        <>
          <Card className="mb-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-taupe">Total Outstanding</p>
                <p className="font-display text-2xl font-semibold text-danger num">
                  {formatCurrency(data?.total_outstanding)}
                </p>
              </div>
              {BUCKETS.map((bucket) => (
                <div key={bucket}>
                  <AgingBadge bucket={bucket} />
                  <p className="mt-1 font-display text-lg font-semibold text-ink num">{formatCurrency(bucketTotals[bucket] ?? 0)}</p>
                </div>
              ))}
            </div>
          </Card>

          <DataTable
            columns={columns}
            data={data?.rows}
            searchable
            searchPlaceholder="Search party…"
            emptyTitle="No outstanding receivables"
            emptyMessage="Nothing overdue right now — nice work."
          />
        </>
      )}
    </div>
  );
}
