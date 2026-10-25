import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getChannelPnl,
  getDeadStock,
  getInventoryAging,
  getInventoryValuation,
  getPerformance,
  getPurchaseTriggers,
} from "../api/reports";
import { getReceivablesAging } from "../api/transactions";
import { Card, Loader } from "../components/ui/Surfaces";
import { formatCurrency, formatNumber, formatPercent, signClass } from "../utils/currency";
import { monthToDateRange } from "../utils/dates";


function SectionLabel({ children }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-taupe-dark">{children}</p>;
}

function DashboardCard({ title, isLoading, isError, children, linkTo, linkLabel }) {
  return (
    <Card title={title}>
      {isLoading ? (
        <Loader />
      ) : isError ? (
        // A failed request must not read as good news (“no dead stock — nice work”).
        <p className="text-sm text-danger">Couldn’t load this right now.</p>
      ) : (
        children
      )}
      {linkTo && (
        <Link to={linkTo} className="mt-3 inline-block text-sm text-brand underline">
          {linkLabel} →
        </Link>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { dateFrom, dateTo } = monthToDateRange();

  const pnlQuery = useQuery({
    queryKey: ["dashboard-channel-pnl", dateFrom, dateTo],
    queryFn: () => getChannelPnl({ dateFrom, dateTo }),
  });
  const agingQuery = useQuery({ queryKey: ["dashboard-aging"], queryFn: () => getReceivablesAging() });
  const valuationQuery = useQuery({ queryKey: ["dashboard-valuation"], queryFn: getInventoryValuation });
  const deadStockQuery = useQuery({ queryKey: ["dashboard-dead-stock"], queryFn: getDeadStock });
  const inventoryAgingQuery = useQuery({ queryKey: ["dashboard-inventory-aging"], queryFn: getInventoryAging });
  const purchaseTriggersQuery = useQuery({
    queryKey: ["dashboard-purchase-triggers"],
    queryFn: getPurchaseTriggers,
  });
  const topSellerQuery = useQuery({
    queryKey: ["dashboard-top-seller", dateFrom, dateTo],
    queryFn: () => getPerformance({ dateFrom, dateTo, metric: "revenue", descending: true, limit: 1 }),
  });

  const bestChannel = (pnlQuery.data ?? [])
    .filter((r) => Number(r.revenue) > 0)
    .sort((a, b) => Number(b.net_profit) - Number(a.net_profit))[0];

  // The question this card answers is “how much is badly overdue, and from whom”.
  const severeRows = (agingQuery.data?.rows ?? []).filter((r) => r.aging_bucket === "60+ Days");
  const severeAmount = agingQuery.data?.bucket_totals?.["60+ Days"] ?? 0;
  const severeParties = new Set(severeRows.map((r) => r.party_id || r.party_name)).size;

  const stale90Count = inventoryAgingQuery.data?.rows?.filter((r) => r.aging_bucket === "90+").length ?? 0;

  const topSeller = topSellerQuery.data?.[0];

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mb-6 text-sm text-taupe">This month, at a glance.</p>

      {/* Row 1 — Financial Health */}
      <SectionLabel>Financial Health</SectionLabel>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardCard
          title="Most profitable channel"
          isLoading={pnlQuery.isLoading}
          isError={pnlQuery.isError}
          linkTo="/reports/channel-pnl"
          linkLabel="View full channel P&L"
        >
          {bestChannel ? (
            <div>
              <p className="font-display text-2xl font-semibold text-brand">{bestChannel.channel_name}</p>
              <p className="mt-1 text-sm text-taupe">
                Net profit <span className={signClass(bestChannel.net_profit)}>{formatCurrency(bestChannel.net_profit)}</span> · Margin{" "}
                {formatPercent(bestChannel.margin_pct)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-taupe">No sales recorded this month yet.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="B2B receivables outstanding"
          isLoading={agingQuery.isLoading}
          isError={agingQuery.isError}
          linkTo="/receivables/aging"
          linkLabel="View aging report"
        >
          <p className="font-display text-2xl font-semibold text-danger">
            {formatCurrency(agingQuery.data?.total_outstanding)}
          </p>
          <p className={`mt-1 text-sm ${severeRows.length ? "font-medium text-danger" : "text-taupe"}`}>
            {severeRows.length
              ? `${formatCurrency(severeAmount)} is 60+ days overdue (${severeParties} ${severeParties === 1 ? "party" : "parties"})`
              : "Nothing is 60+ days overdue."}
          </p>
        </DashboardCard>

        <DashboardCard
          title="Total inventory valuation"
          isLoading={valuationQuery.isLoading}
          isError={valuationQuery.isError}
          linkTo="/reports/inventory-valuation"
          linkLabel="View inventory valuation"
        >
          <p className="font-display text-2xl font-semibold text-brand">
            {formatCurrency(valuationQuery.data?.total_stock_value)}
          </p>
          <p className="mt-1 text-sm text-taupe">Capital currently tied up in stock, at weighted-avg cost.</p>
        </DashboardCard>
      </div>

      {/* Row 2 — Inventory Health */}
      <SectionLabel>Inventory Health</SectionLabel>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardCard
          title="Capital blocked in dead stock"
          isLoading={deadStockQuery.isLoading}
          isError={deadStockQuery.isError}
          linkTo="/reports/dead-stock"
          linkLabel="View dead stock report"
        >
          {deadStockQuery.data?.rows?.length ? (
            <>
              <p className="font-display text-2xl font-semibold text-warning">
                {formatCurrency(deadStockQuery.data?.total_capital_blocked)}
              </p>
              <p className="mt-1 text-sm text-taupe">
                {deadStockQuery.data?.rows?.length} SKU(s) flagged · no sale in {deadStockQuery.data?.window_days}+
                days
              </p>
            </>
          ) : (
            <p className="text-sm text-taupe">No dead stock right now — nice work.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Inventory aging summary"
          isLoading={inventoryAgingQuery.isLoading}
          isError={inventoryAgingQuery.isError}
          linkTo="/reports/inventory-aging"
          linkLabel="View inventory aging"
        >
          {stale90Count > 0 ? (
            <>
              <p className="font-display text-2xl font-semibold text-warning num">{stale90Count}</p>
              <p className="mt-1 text-sm text-taupe">SKU(s) haven't been restocked in 90+ days.</p>
            </>
          ) : (
            <p className="text-sm text-taupe">No SKUs are significantly overdue for restock.</p>
          )}
        </DashboardCard>

        <DashboardCard
          title="Purchase triggers"
          isLoading={purchaseTriggersQuery.isLoading}
          isError={purchaseTriggersQuery.isError}
          linkTo="/reports/purchase-triggers"
          linkLabel="View purchase triggers"
        >
          {purchaseTriggersQuery.data?.rows?.length ? (
            <>
              <p className="font-display text-2xl font-semibold text-danger num">
                {purchaseTriggersQuery.data.rows.length}
              </p>
              <p className="mt-1 text-sm text-taupe">
                fast-moving SKU(s) need reordering ·{" "}
                {formatCurrency(purchaseTriggersQuery.data.total_suggested_purchase_value)} suggested purchase
              </p>
            </>
          ) : (
            <p className="text-sm text-taupe">No SKUs need reordering right now.</p>
          )}
        </DashboardCard>
      </div>

      {/* Row 3 — Performance Highlight (optional) */}
      <SectionLabel>Performance Highlight</SectionLabel>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardCard
          title="Top-selling SKU this month"
          isLoading={topSellerQuery.isLoading}
          isError={topSellerQuery.isError}
          linkTo="/reports/performance"
          linkLabel="View full performance report"
        >
          {topSeller ? (
            <div>
              <p className="font-display text-2xl font-semibold text-brand">{topSeller.sku_code}</p>
              <p className="mt-1 text-sm text-taupe">
                {topSeller.sku_name} · {formatCurrency(topSeller.revenue)} revenue ·{" "}
                {formatNumber(topSeller.quantity_sold)} sold
              </p>
            </div>
          ) : (
            <p className="text-sm text-taupe">No sales recorded this month yet.</p>
          )}
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/orders/new" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-brand">
          <p className="font-display font-semibold text-ink">Log an order</p>
          <p className="text-sm text-taupe">Record today's sales</p>
        </Link>
        <Link to="/orders/bulk" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-brand">
          <p className="font-display font-semibold text-ink">Bulk order entry</p>
          <p className="text-sm text-taupe">Log several lines fast</p>
        </Link>
        <Link to="/purchases/new" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-brand">
          <p className="font-display font-semibold text-ink">Record a purchase</p>
          <p className="text-sm text-taupe">Stock in with cost price</p>
        </Link>
        <Link to="/skus/bulk-upload" className="rounded-md border border-taupe-light bg-white p-4 shadow-card hover:border-brand">
          <p className="font-display font-semibold text-ink">Bulk upload SKUs</p>
          <p className="text-sm text-taupe">Create many at once via CSV</p>
        </Link>
      </div>
    </div>
  );
}
