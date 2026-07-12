import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createVendor, listVendors, updateVendor } from "../../api/vendors";
import DataTable from "../../components/ui/DataTable";
import { Card, Badge, ErrorBanner } from "../../components/ui/Surfaces";
import { Field, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { getErrorInfo } from "../../utils/errorCodes";

export default function VendorList() {
  const queryClient = useQueryClient();
  const [activeOnly, setActiveOnly] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", activeOnly],
    queryFn: () => listVendors({ isActive: activeOnly ? true : undefined, limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (n) => createVendor(n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
      setName("");
      setError("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => updateVendor(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
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
        <h1 className="font-display text-2xl font-semibold text-ink">Vendors</h1>
        <p className="text-sm text-taupe">
          Master supplier list — pick a vendor at purchase entry instead of typing a name, so the same
          supplier never fragments into multiple spellings.
        </p>
      </div>

      <Card title="Add a vendor" className="mb-6">
        <ErrorBanner message={error} />
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <Field label="Vendor name" className="max-w-xs flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Textiles" />
          </Field>
          <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Adding…" : "+ Add vendor"}
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
        searchPlaceholder="Search vendors…"
        emptyTitle="No vendors yet"
        emptyMessage="Add your first vendor to start picking it from the dropdown when recording a purchase."
      />
    </div>
  );
}
