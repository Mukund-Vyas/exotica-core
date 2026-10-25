import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { getChannelPnl } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Field, Select, Input } from "../../components/ui/Field";
import DateRangeFields from "../../components/ui/DateRangeFields";
import { monthToDateRange, dateRangeError } from "../../utils/dates";
import { formatCurrency, formatPercent, signClass, sumMoney, marginOf } from "../../utils/currency";

function defaultRange() {
  return monthToDateRange();
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
    enabled: Boolean(dateFrom && dateTo) && !dateRangeError(dateFrom, dateTo),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "channel_name", header: "Channel" },
      { accessorKey: "revenue", header: "Revenue", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "commission", header: "Commission", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "cogs", header: "COGS", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "net_profit", header: "Net Profit", cell: (ctx) => <span className={`num font-medium ${signClass(ctx.getValue())}`}>{formatCurrency(ctx.getValue())}</span> },
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
      </div>

      {data && data.length > 0 && (
        <dl className="mb-4 grid grid-cols-2 gap-3 rounded-sm border border-taupe-light bg-white p-4 text-sm sm:grid-cols-5">
          {[
            ["Revenue", sumMoney(data, "revenue")],
            ["Commission", sumMoney(data, "commission")],
            ["COGS", sumMoney(data, "cogs")],
            ["Net profit", sumMoney(data, "net_profit")],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-taupe">{label} (total)</dt>
              <dd className={`num text-base font-semibold ${label === "Net profit" ? signClass(value) : "text-ink"}`}>
                {formatCurrency(value)}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-xs uppercase tracking-wide text-taupe">Margin (total)</dt>
            <dd className="num text-base font-semibold text-ink">
              {formatPercent(marginOf(sumMoney(data, "net_profit"), sumMoney(data, "revenue")))}
            </dd>
          </div>
        </dl>
      )}

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
