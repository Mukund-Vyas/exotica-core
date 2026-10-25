import { useMemo, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { listReceivables, recordPayment } from "../../api/transactions";
import { usePagedList } from "../../hooks/usePagedList";
import DataTable from "../../components/ui/DataTable";
import { Badge, ErrorBanner } from "../../components/ui/Surfaces";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { Field, Input, Select } from "../../components/ui/Field";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency } from "../../utils/currency";
import { formatDate, todayISO } from "../../utils/dates";
import { isPositiveMoney } from "../../utils/numbers";
import { getErrorInfo } from "../../utils/errorCodes";
import { invalidateBusinessData } from "../../utils/invalidate";

export default function ReceivablesList() {
  const queryClient = useQueryClient();
  const [party, setParty] = useState(null);
  // Open items by default: the list used to mix in closed ones sorted by oldest due
  // date, so with enough history the balances you actually need to chase fell off
  // the end of a fixed-size page.
  const [statusFilter, setStatusFilter] = useState("open");
  const list = usePagedList(["receivables", party?.id, statusFilter], ({ limit, offset }) =>
    listReceivables({ partyId: party?.id, status: statusFilter || undefined, limit, offset })
  );

  const [payTarget, setPayTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => recordPayment(id, payload),
    onSuccess: () => {
      invalidateBusinessData(queryClient);
      setPayTarget(null);
      setAmount("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function openPayment(row) {
    setPayTarget(row);
    setAmount("");
    setPaymentDate(todayISO());
    setError("");
  }

  function submitPayment(e) {
    e?.preventDefault();
    setError("");
    if (!isPositiveMoney(amount)) {
      setError("Enter an amount above 0 (max 2 decimals).");
      return;
    }
    if (Number(amount) > Number(payTarget.amount_outstanding)) {
      setError(`That is more than the ${formatCurrency(payTarget.amount_outstanding)} outstanding.`);
      return;
    }
    if (payTarget.order_date && paymentDate < payTarget.order_date) {
      setError("The payment date can’t be before the order date.");
      return;
    }
    mutation.mutate({ id: payTarget.id, payload: { amount: amount.trim(), payment_date: paymentDate } });
  }

  const columns = useMemo(
    () => [
      {
        id: "order",
        header: "Order",
        accessorFn: (r) => r.order_date || "",
        // A bare UUID fragment meant nothing to the user; the order date is what they remember.
        cell: (ctx) => (
          <span>
            {formatDate(ctx.row.original.order_date)}
            <span className="ml-1 text-xs text-taupe">#{ctx.row.original.order_id.slice(0, 6)}</span>
          </span>
        ),
      },
      { accessorKey: "party_name", header: "Party", cell: (ctx) => ctx.getValue() || "—" },
      { accessorKey: "amount_total", header: "Total", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "amount_outstanding", header: "Outstanding", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "due_date", header: "Due", cell: (ctx) => formatDate(ctx.getValue()) },
      {
        accessorKey: "status",
        header: "Status",
        cell: (ctx) => (ctx.getValue() === "open" ? <Badge tone="warning">Open</Badge> : <Badge tone="success">Paid</Badge>),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (ctx) =>
          ctx.row.original.status === "open" ? (
            <Button size="sm" variant="secondary" onClick={() => openPayment(ctx.row.original)}>
              Record payment
            </Button>
          ) : null,
      },
    ],
    []
  );

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-semibold text-ink">Receivables</h1>
      <p className="mb-6 text-sm text-taupe">B2B credit orders and the balance still owed on each.</p>

      <div className="mb-4 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Party">
          <PartyPicker value={party} onChange={setParty} placeholder="All parties" allowCreate={false} />
        </Field>
        <Field label="Show">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">Open (still owed)</option>
            <option value="">Open and paid</option>
            <option value="closed">Paid only</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        isLoading={list.isLoading}
        emptyTitle={statusFilter === "open" ? "Nothing outstanding" : "No receivables found"}
        emptyMessage="Credit B2B orders will appear here once logged."
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
      />

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title="Record payment"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form" disabled={mutation.isPending || !amount}>
              {mutation.isPending ? "Saving…" : "Record payment"}
            </Button>
          </>
        }
      >
        <ErrorBanner message={error} />
        {payTarget && (
          <p className="mb-3 text-sm text-taupe">
            {payTarget.party_name || "Order"} · outstanding{" "}
            <span className="font-medium text-ink num">{formatCurrency(payTarget.amount_outstanding)}</span>
          </p>
        )}
        <form id="payment-form" onSubmit={submitPayment} className="flex flex-col gap-3">
          <Field label="Amount" required>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAmount(String(payTarget.amount_outstanding))}
                aria-label="Fill the full outstanding amount"
              >
                Full
              </Button>
            </div>
          </Field>
          <Field label="Payment date" required>
            <Input
              type="date"
              value={paymentDate}
              min={payTarget?.order_date}
              max={todayISO()}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
