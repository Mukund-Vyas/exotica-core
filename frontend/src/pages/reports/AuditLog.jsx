import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditLog } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Field, Input } from "../../components/ui/Field";
import { Badge } from "../../components/ui/Surfaces";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}

const ACTION_TONE = {
  create: "success",
  update: "warning",
  delete: "danger",
};

export default function AuditLog() {
  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", dateFrom, dateTo],
    queryFn: () => getAuditLog({ dateFrom, dateTo, limit: 200 }),
    enabled: Boolean(dateFrom && dateTo),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "created_at", header: "Timestamp", cell: (ctx) => new Date(ctx.getValue()).toLocaleString() },
      { accessorKey: "username", header: "User" },
      { accessorKey: "action", header: "Action", cell: (ctx) => <Badge tone={ACTION_TONE[ctx.getValue()] || "neutral"}>{ctx.getValue()}</Badge> },
      { accessorKey: "entity_type", header: "Entity" },
      { accessorKey: "entity_id", header: "Entity ID", cell: (ctx) => <span className="text-xs text-taupe">{String(ctx.getValue()).slice(0, 8)}…</span> },
      { accessorKey: "detail", header: "Detail", cell: (ctx) => ctx.getValue() || "—" },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Audit log</h1>
      <p className="mb-6 text-sm text-taupe">Who changed what, and when — every price, commission, and settings edit.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search user or entity…"
        emptyTitle="No activity in this range"
      />
    </div>
  );
}
