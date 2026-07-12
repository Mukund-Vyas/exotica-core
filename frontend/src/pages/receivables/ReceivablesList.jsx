import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { listReceivables, recordPayment } from "../../api/transactions";
import DataTable from "../../components/ui/DataTable";
import { Badge, ErrorBanner } from "../../components/ui/Surfaces";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { Field, Input } from "../../components/ui/Field";
import PartyPicker from "../../components/PartyPicker";
import { formatCurrency } from "../../utils/currency";
import { getErrorInfo } from "../../utils/errorCodes";

export default function ReceivablesList() {
  const queryClient = useQueryClient();
  const [party, setParty] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["receivables", party?.id],
    queryFn: () => listReceivables({ partyId: party?.id, limit: 200 }),
  });

  const [payTarget, setPayTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => recordPayment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receivables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-aging"] });
      setPayTarget(null);
      setAmount("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "order_id", header: "Order", cell: (ctx) => <span className="text-xs text-taupe">{ctx.getValue().slice(0, 8)}…</span> },
      { accessorKey: "party_name", header: "Party", cell: (ctx) => ctx.getValue() || "—" },
      { accessorKey: "amount_total", header: "Total", cell: (ctx) => <span className="num">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "amount_outstanding", header: "Outstanding", cell: (ctx) => <span className="num font-medium">{formatCurrency(ctx.getValue())}</span> },
      { accessorKey: "due_date", header: "Due" },
      {
        accessorKey: "status",
        header: "Status",
        cell: (ctx) => (ctx.getValue() === "open" ? <Badge tone="warning">Open</Badge> : <Badge tone="success">Closed</Badge>),
      },
      {
        id: "actions",
        header: "",
        cell: (ctx) =>
          ctx.row.original.status === "open" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPayTarget(ctx.row.original);
                setAmount("");
                setError("");
              }}
            >
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

      <div className="mb-4 max-w-xs">
        <Field label="Party">
          <PartyPicker value={party} onChange={setParty} placeholder="All parties" allowCreate={false} />
        </Field>
      </div>

      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isLoading}
        emptyTitle="No open receivables"
        emptyMessage="Credit B2B orders will appear here once logged."
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
            <Button
              disabled={mutation.isPending || !amount}
              onClick={() =>
                mutation.mutate({
                  id: payTarget.id,
                  payload: { amount: Number(amount), payment_date: paymentDate },
                })
              }
            >
              {mutation.isPending ? "Saving…" : "Record payment"}
            </Button>
          </>
        }
      >
        <ErrorBanner message={error} />
        {payTarget && (
          <p className="mb-3 text-sm text-taupe">
            Outstanding: <span className="font-medium text-ink num">{formatCurrency(payTarget.amount_outstanding)}</span>
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Field label="Amount" required>
            <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Payment date" required>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
