import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { getAuditLog } from "../../api/reports";
import { usePagedList } from "../../hooks/usePagedList";
import DataTable from "../../components/ui/DataTable";
import DateRangeFields from "../../components/ui/DateRangeFields";
import { Field, Select } from "../../components/ui/Field";
import { Badge } from "../../components/ui/Surfaces";
import { formatCurrency } from "../../utils/currency";
import { formatDate, monthToDateRange, dateRangeError } from "../../utils/dates";

const TYPES = [
  { value: "", label: "All entry types" },
  { value: "order", label: "Sales" },
  { value: "purchase", label: "Purchases" },
  { value: "return", label: "Returns" },
  { value: "payment", label: "Payments" },
];
const TYPE_LABEL = { order: "Sale", purchase: "Purchase", return: "Return", payment: "Payment" };
const TYPE_TONE = { order: "success", purchase: "neutral", return: "warning", payment: "success" };

export default function AuditLog() {
  const initial = monthToDateRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [channelId, setChannelId] = useState("");
  const [entryType, setEntryType] = useState("");
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });

  const rangeOk = Boolean(dateFrom && dateTo) && !dateRangeError(dateFrom, dateTo);
  const list = usePagedList(
    ["audit-log", dateFrom, dateTo, channelId, entryType],
    ({ limit, offset }) =>
      getAuditLog({ dateFrom, dateTo, channelId: channelId || undefined, entryType: entryType || undefined, limit, offset }),
    { enabled: rangeOk }
  );

  const columns = useMemo(
    () => [
      { accessorKey: "created_at", header: "Entered at", cell: (ctx) => new Date(ctx.getValue()).toLocaleString("en-IN") },
      { accessorKey: "entry_date", header: "Date", cell: (ctx) => formatDate(ctx.getValue()) },
      {
        accessorKey: "entry_type",
        header: "Type",
        cell: (ctx) => <Badge tone={TYPE_TONE[ctx.getValue()] || "neutral"}>{TYPE_LABEL[ctx.getValue()] || ctx.getValue()}</Badge>,
      },
      { accessorKey: "description", header: "Details" },
      { accessorKey: "channel_name", header: "Channel", cell: (ctx) => ctx.getValue() || "—" },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: (ctx) => <span className="num">{ctx.getValue() == null ? "—" : formatCurrency(ctx.getValue())}</span>,
      },
      { accessorKey: "created_by", header: "Entered by", cell: (ctx) => ctx.getValue() || "—" },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Audit Log</h1>
      <p className="mb-6 text-sm text-taupe">
        Every purchase, sale, return and payment entered, newest first — for checking data against your own records.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:max-w-3xl sm:grid-cols-4">
        <DateRangeFields from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <Field label="Channel">
          <Select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">All channels</option>
            {(channels || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={entryType} onChange={(e) => setEntryType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {channelId && (
        <p className="mb-3 text-xs text-taupe">Purchases aren’t tied to a sales channel, so they’re hidden while a channel is selected.</p>
      )}

      <DataTable
        columns={columns}
        data={list.items}
        isLoading={list.isLoading}
        searchable
        searchPlaceholder="Search loaded entries…"
        emptyTitle="No entries in this range"
        emptyMessage="Try widening the date range or clearing the filters."
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
      />
    </div>
  );
}
