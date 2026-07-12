import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createParty, listParties, updateParty } from "../../api/parties";
import DataTable from "../../components/ui/DataTable";
import { Card, Badge, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { getErrorInfo } from "../../utils/errorCodes";

export default function PartyList() {
  const queryClient = useQueryClient();
  const [activeOnly, setActiveOnly] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["parties-admin", activeOnly],
    queryFn: () => listParties({ isActive: activeOnly ? true : undefined, limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (n) => createParty(n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties-admin"] });
      queryClient.invalidateQueries({ queryKey: ["party-search"] });
      setName("");
      setError("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => updateParty(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parties-admin"] });
      queryClient.invalidateQueries({ queryKey: ["party-search"] });
    },
  });

  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: (ctx) =>
          ctx.getValue() ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
      },
      { accessorKey: "created_at", header: "Added", cell: (ctx) => new Date(ctx.getValue()).toLocaleDateString() },
      {
        id: "actions",
        header: "",
        cell: (ctx) => (
          <Button
            size="sm"
            variant="ghost"
            disabled={toggleMutation.isPending}
            onClick={() =>
              toggleMutation.mutate({ id: ctx.row.original.id, is_active: !ctx.row.original.is_active })
            }
          >
            {ctx.row.original.is_active ? "Deactivate" : "Activate"}
          </Button>
        ),
      },
    ],
    [toggleMutation]
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(name.trim());
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Parties</h1>
        <p className="text-sm text-taupe">
          Master B2B customer list — pick a party at order entry instead of typing a name, so the same
          customer never fragments into multiple spellings and orders/receivables can be filtered by party.
        </p>
      </div>

      <Card title="Add a party" className="mb-6">
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <Field label="Party name" className="max-w-xs flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mahavir Textiles" />
          </Field>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "+ Add party"}
          </Button>
        </form>
      </Card>

      <label className="mb-3 flex w-fit items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => setActiveOnly(e.target.checked)}
          className="h-4 w-4 rounded border-taupe-light text-plum"
        />
        Active only
      </label>

      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isLoading}
        searchable
        searchPlaceholder="Search parties…"
        emptyTitle="No parties yet"
        emptyMessage="Add your first party to start picking it from the dropdown when recording a B2B order."
      />
    </div>
  );
}
