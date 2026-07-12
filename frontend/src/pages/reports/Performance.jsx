import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { getPerformance } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Field, Select, Input } from "../../components/ui/Field";
import { formatCurrency, formatNumber, formatPercent } from "../../utils/currency";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}

const METRICS = [
  { value: "revenue", label: "Revenue" },
  { value: "quantity_sold", label: "Quantity Sold" },
  { value: "net_profit", label: "Net Profit" },
  { value: "margin_pct", label: "Margin %" },
];

export default function Performance() {
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [channelId, setChannelId] = useState("");
  const [metric, setMetric] = useState("revenue");
  const [descending, setDescending] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["performance", dateFrom, dateTo, channelId, metric, descending],
    queryFn: () =>
      getPerformance({ dateFrom, dateTo, channelId: channelId || undefined, metric, descending, limit: 30 }),
    enabled: Boolean(dateFrom && dateTo),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "rank", header: "#" },
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      { accessorKey: "quantity_sold", header: "Qty Sold", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "revenue", header: "Revenue", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "net_profit", header: "Net Profit", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "margin_pct", header: "Margin %", cell: (ctx) => <span className="num">{formatPercent(ctx.getValue())}</span> },
    ],
    []
  );

  const rows = useMemo(() => (data || []).map((r, i) => ({ ...r, rank: i + 1 })), [data]);

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Performance — best &amp; worst sellers</h1>
      <p className="mb-6 text-sm text-taupe">Rank SKUs by revenue, quantity, profit, or margin.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5 sm:max-w-4xl">
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
        <Field label="Metric">
          <Select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Order">
          <Select value={descending ? "desc" : "asc"} onChange={(e) => setDescending(e.target.value === "desc")}>
            <option value="desc">Best first</option>
            <option value="asc">Worst first</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyTitle="No sales in this range"
        emptyMessage="Try widening the date range or clearing the channel filter."
      />
    </div>
  );
}
