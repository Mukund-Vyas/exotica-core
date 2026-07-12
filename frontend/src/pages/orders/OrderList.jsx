import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listChannels } from "../../api/products";
import { listOrders } from "../../api/transactions";
import DataTable from "../../components/ui/DataTable";
import { Field, Select, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import PriceOverrideFlag from "../../components/PriceOverrideFlag";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency, formatNumber } from "../../utils/currency";

export default function OrderList() {
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const [channelId, setChannelId] = useState("");
  const [party, setParty] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", channelId, party?.id, dateFrom, dateTo],
    queryFn: () =>
      listOrders({
        channelId: channelId || undefined,
        partyId: party?.id,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit: 200,
      }),
  });

  const channelName = (id) => channels?.find((c) => c.id === id)?.name || "—";

  const rows = useMemo(
    () =>
      (data?.items || []).flatMap((order) =>
        order.items.map((item) => ({
          ...item,
          order_id: order.id,
          order_date: order.order_date,
          channel_id: order.channel_id,
          party_name: order.party_name,
          payment_term: order.payment_term,
        }))
      ),
    [data]
  );

  const columns = useMemo(
    () => [
      { accessorKey: "order_date", header: "Date" },
      { accessorFn: (r) => channelName(r.channel_id), header: "Channel", id: "channel" },
      { accessorKey: "quantity", header: "Qty", cell: (ctx) => <span className="num">{formatNumber(ctx.getValue())}</span> },
      { accessorKey: "selling_price_at_sale", header: "Price", cell: (ctx) => (
          <span className="inline-flex items-center gap-1.5">
            <span className="num">{formatCurrency(ctx.getValue())}</span>
            {ctx.row.original.price_overridden && <PriceOverrideFlag />}
          </span>
        ) },
      { accessorKey: "revenue", header: "Revenue", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "net_profit", header: "Net Profit", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
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
        <Field label="From">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyTitle="No orders logged yet"
        emptyMessage="Log your first order to start tracking sales and profit."
      />
    </div>
  );
}
