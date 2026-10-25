import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listChannels } from "../../api/products";
import { listOrders } from "../../api/transactions";
import { usePagedList } from "../../hooks/usePagedList";
import DateRangeFields from "../../components/ui/DateRangeFields";
import DataTable from "../../components/ui/DataTable";
import { Field, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import PriceOverrideFlag from "../../components/PriceOverrideFlag";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency, formatNumber, signClass } from "../../utils/currency";
import { formatDate, dateRangeError } from "../../utils/dates";

export default function OrderList() {
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const [channelId, setChannelId] = useState("");
  const [party, setParty] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const rangeInvalid = Boolean(dateRangeError(dateFrom, dateTo));
  const list = usePagedList(
    ["orders", channelId, party?.id, dateFrom, dateTo],
    ({ limit, offset }) =>
      listOrders({
        channelId: channelId || undefined,
        partyId: party?.id,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
        offset,
      }),
    { enabled: !rangeInvalid }
  );

  const channelName = (id) => channels?.find((c) => c.id === id)?.name || "—";

  const rows = useMemo(
    () =>
      list.items.flatMap((order) =>
        order.items.map((item) => ({
          ...item,
          order_id: order.id,
          order_date: order.order_date,
          channel_id: order.channel_id,
          party_name: order.party_name,
          payment_term: order.payment_term,
        }))
      ),
    [list.items]
  );

  const columns = useMemo(
    () => [
      { accessorKey: "order_date", header: "Date", cell: (ctx) => formatDate(ctx.getValue()) },
      {
        id: "sku",
        header: "SKU",
        accessorFn: (r) => (r.sku_code ? `${r.sku_code} ${r.sku_name}` : r.sku_id),
        cell: (ctx) => (
          <span>
            <span className="font-medium">{ctx.row.original.sku_code || "—"}</span>
            <span className="ml-1 text-xs text-taupe">{ctx.row.original.sku_name}</span>
          </span>
        ),
      },
      { accessorFn: (r) => channelName(r.channel_id), header: "Channel", id: "channel" },
      { accessorKey: "quantity", header: "Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      {
        accessorKey: "returned_quantity",
        header: "Returned",
        cell: (ctx) => (ctx.getValue() ? <span className="num text-warning">{formatNumber(ctx.getValue())}</span> : <span className="text-taupe">—</span>),
      },
      { accessorKey: "selling_price_at_sale", header: "Price", cell: (ctx) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="num">{formatCurrency(ctx.getValue())}</span>
            {ctx.row.original.price_overridden && <PriceOverrideFlag />}
          </span>
        ) },
      { accessorKey: "revenue", header: "Revenue", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "net_profit", header: "Net Profit", cell: (ctx) => <span className={`num ${signClass(ctx.getValue())}`}>{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "party_name", header: "Party", cell: (ctx) => ctx.getValue() || "—" },
      { accessorKey: "payment_term", header: "Terms", cell: (ctx) => (ctx.getValue() === "credit" ? "Credit" : ctx.getValue() ? "Paid" : "—") },
    ],
    [channels]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Orders</h1>
          <p className="text-sm text-taupe">Every logged sale, by line item.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/orders/new">
            <Button variant="secondary">+ Single order</Button>
          </Link>
          <Link to="/orders/bulk">
            <Button>+ Bulk entry</Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:max-w-3xl">
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
        <Field label="Party">
          <PartyPicker value={party} onChange={setParty} placeholder="All parties" allowCreate={false} />
        </Field>
        <DateRangeFields from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={list.isLoading}
        searchable
        searchPlaceholder="Search loaded orders…"
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
        emptyTitle="No orders logged yet"
        emptyMessage="Log your first order to start tracking sales and profit."
      />
    </div>
  );
}
