import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { getChannelPnl } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Field, Select, Input } from "../../components/ui/Field";
import { formatCurrency, formatPercent } from "../../utils/currency";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}

export default function ChannelPnL() {
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [channelId, setChannelId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["channel-pnl", dateFrom, dateTo, channelId],
    queryFn: () => getChannelPnl({ dateFrom, dateTo, channelId: channelId || undefined }),
    enabled: Boolean(dateFrom && dateTo),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "channel_name", header: "Channel" },
      { accessorKey: "revenue", header: "Revenue", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "commission", header: "Commission", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "cogs", header: "COGS", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "net_profit", header: "Net Profit", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "margin_pct", header: "Margin %", cell: (ctx) => <span className="num">{formatPercent(ctx.getValue())}</span> },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Channel P&amp;L</h1>
      <p className="mb-6 text-sm text-taupe">
        Revenue, commission, cost, and profit by channel — the same SKU can show different margins per channel
        because of commission; that's expected, not an error.
      </p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:max-w-xl">
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
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
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyTitle="No sales in this range"
        emptyMessage="Try widening the date range or clearing the channel filter."
      />
    </div>
  );
}
