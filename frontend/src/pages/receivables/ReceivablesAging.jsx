import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReceivablesAging } from "../../api/transactions";
import DataTable from "../../components/ui/DataTable";
import { Card, Loader } from "../../components/ui/Surfaces";
import { Field } from "../../components/ui/Field";
import AgingBadge from "../../components/AgingBadge";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function ReceivablesAging() {
  const [party, setParty] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["receivables-aging", party?.id],
    queryFn: () => getReceivablesAging(undefined, party?.id),
  });

  const bucketTotals = useMemo(() => {
    const totals = { "Not Due": 0, "1-30 Days": 0, "31-60 Days": 0, "60+ Days": 0 };
    (data?.rows || []).forEach((r) => {
      totals[r.aging_bucket] = (totals[r.aging_bucket] || 0) + Number(r.amount_outstanding);
    });
    return totals;
  }, [data]);

  const columns = useMemo(
    () => [
      { accessorKey: "party_name", header: "Party", cell: (ctx) => ctx.getValue() || "—" },
      { accessorKey: "order_id", header: "Order", cell: (ctx) => <span className="text-xs text-taupe">{ctx.getValue().slice(0, 8)}…</span> },
      { accessorKey: "amount_outstanding", header: "Outstanding", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "due_date", header: "Due Date" },
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
              {Object.entries(bucketTotals).map(([bucket, total]) => (
                <div key={bucket}>
                  <AgingBadge bucket={bucket} />
                  <p className="mt-1 font-display text-lg font-semibold text-ink num">{formatCurrency(total)}</p>
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
