import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getChannelPnl, getDeadStock } from "../api/reports";
import { getReceivablesAging } from "../api/transactions";
import { Card, Loader } from "../components/ui/Surfaces";
import { formatCurrency, formatPercent } from "../utils/currency";

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
}

export default function Dashboard() {
  const { dateFrom, dateTo } = monthRange();

  const pnlQuery = useQuery({
    queryKey: ["dashboard-channel-pnl", dateFrom, dateTo],
    queryFn: () => getChannelPnl({ dateFrom, dateTo }),
  });
  const deadStockQuery = useQuery({ queryKey: ["dashboard-dead-stock"], queryFn: getDeadStock });
  const agingQuery = useQuery({ queryKey: ["dashboard-aging"], queryFn: () => getReceivablesAging() });

  const bestChannel = pnlQuery.data
    ?.filter((r) => r.revenue > 0)
    .sort((a, b) => Number(b.net_profit) - Number(a.net_profit))[0];

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mb-6 text-sm text-taupe">This month, at a glance.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Most profitable channel (this month)">
          {pnlQuery.isLoading ? (
            <Loader />
          ) : bestChannel ? (
            <div>
              <p className="font-display text-2xl font-semibold text-plum">{bestChannel.channel_name}</p>
              <p className="mt-1 text-sm text-taupe">
                Net profit {formatCurrency(bestChannel.net_profit)} · Margin{" "}
                {formatPercent(bestChannel.margin_pct)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-taupe">No sales recorded this month yet.</p>
          )}
          <Link to="/reports/channel-pnl" className="mt-3 inline-block text-sm text-plum underline">
            View full channel P&amp;L →
          </Link>
        </Card>

        <Card title="Capital blocked in dead stock">
          {deadStockQuery.isLoading ? (
            <Loader />
          ) : (
            <div>
              <p className="font-display text-2xl font-semibold text-warning">
                {formatCurrency(deadStockQuery.data?.total_capital_blocked)}
              </p>
              <p className="mt-1 text-sm text-taupe">
                {deadStockQuery.data?.rows?.length ?? 0} SKU(s) flagged · no sale in{" "}
                {deadStockQuery.data?.window_days ?? 45}+ days
              </p>
            </div>
          )}
          <Link to="/reports/dead-stock" className="mt-3 inline-block text-sm text-plum underline">
            View dead stock report →
          </Link>
        </Card>

        <Card title="B2B receivables outstanding">
          {agingQuery.isLoading ? (
            <Loader />
          ) : (
            <div>
              <p className="font-display text-2xl font-semibold text-danger">
                {formatCurrency(agingQuery.data?.total_outstanding)}
              </p>
              <p className="mt-1 text-sm text-taupe">
                {agingQuery.data?.rows?.filter((r) => r.aging_bucket === "60+ Days").length ?? 0} party(ies) 60+
                days overdue
              </p>
            </div>
          )}
          <Link to="/receivables/aging" className="mt-3 inline-block text-sm text-plum underline">
            View aging report →
          </Link>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/orders/new" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-plum">
          <p className="font-display font-semibold text-ink">Log an order</p>
          <p className="text-sm text-taupe">Record today's sales</p>
        </Link>
        <Link to="/orders/bulk" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-plum">
          <p className="font-display font-semibold text-ink">Bulk order entry</p>
          <p className="text-sm text-taupe">Log several lines fast</p>
        </Link>
        <Link to="/purchases/new" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-plum">
          <p className="font-display font-semibold text-ink">Record a purchase</p>
          <p className="text-sm text-taupe">Stock in with cost price</p>
        </Link>
        <Link to="/skus/new" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-plum">
          <p className="font-display font-semibold text-ink">Add a SKU</p>
          <p className="text-sm text-taupe">New product + variant</p>
        </Link>
      </div>
    </div>
  );
}
