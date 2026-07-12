import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listChannels } from "../../api/products";
import { getSkuPnl } from "../../api/reports";
import DataTable from "../../components/ui/DataTable";
import { Field, Select, Input } from "../../components/ui/Field";
import SkuPicker from "../../components/SkuPicker";
import { formatCurrency, formatNumber, formatPercent } from "../../utils/currency";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}

export default function SkuPnL() {
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const initial = defaultRange();
  const [dateFrom, setDateFrom] = useState(initial.dateFrom);
  const [dateTo, setDateTo] = useState(initial.dateTo);
  const [channelId, setChannelId] = useState("");
  const [sku, setSku] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sku-pnl", dateFrom, dateTo, channelId, sku?.id],
    queryFn: () => getSkuPnl({ dateFrom, dateTo, channelId: channelId || undefined, skuId: sku?.id }),
    enabled: Boolean(dateFrom && dateTo),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "sku_code", header: "Code" },
      { accessorKey: "sku_name", header: "Name" },
      { accessorKey: "quantity_sold", header: "Qty Sold", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
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
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">SKU P&amp;L</h1>
      <p className="mb-6 text-sm text-taupe">Profitability by product — filter by date range, channel, or a single SKU.</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:max-w-3xl">
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
        <Field label="SKU">
          <SkuPicker value={sku} onChange={setSku} placeholder="All SKUs" />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search code or name…"
        emptyTitle="No sales in this range"
        emptyMessage="Try widening the date range or clearing filters."
      />
    </div>
  );
}
