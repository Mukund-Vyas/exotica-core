import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getVendor } from "../../api/vendors";
import {
  createVendorMapping,
  deleteVendorMapping,
  downloadVendorMappingTemplate,
  listVendorMappings,
  updateVendorMapping,
  uploadVendorMappings,
} from "../../api/vendorMappings";
import { usePagedList } from "../../hooks/usePagedList";
import { useDebounced } from "../../hooks/useDebounced";
import DataTable from "../../components/ui/DataTable";
import { Badge, Card, ErrorBanner, Loader } from "../../components/ui/Surfaces";
import { Field, Input } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import SkuPicker from "../../components/SkuPicker";
import { getErrorInfo } from "../../utils/errorCodes";
import { invalidateBusinessData } from "../../utils/invalidate";

function AddMappingCard({ vendor, onChanged }) {
  const [sku, setSku] = useState(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");

  const mutation = useMutation({
    mutationFn: createVendorMapping,
    onSuccess: (m) => {
      onChanged();
      setAdded(`${m.vendor_sku_code} → ${m.sku_code}`);
      setSku(null);
      setCode("");
      setName("");
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function submit(e) {
    e.preventDefault();
    setError("");
    setAdded("");
    if (!code.trim()) return setError("Enter the vendor’s code for this product.");
    if (!sku) return setError("Choose the Exotica SKU this code belongs to.");
    mutation.mutate({
      vendor_id: vendor.id,
      sku_id: sku.id,
      vendor_sku_code: code.trim(),
      vendor_product_name: name.trim() || null,
    });
  }

  return (
    <Card title="Add a mapping">
      <ErrorBanner message={error} />
      {added && (
        <div role="status" className="mb-4 rounded-sm border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
          Added {added}.
        </div>
      )}
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Vendor’s code" required hint="As printed on their invoice or catalogue">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. VT-2210-BLK-34B" maxLength={100} />
        </Field>
        <Field label="Vendor’s product name" hint="Optional">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lace Bra Black" maxLength={200} />
        </Field>
        <Field label="Exotica SKU" required>
          <SkuPicker value={sku} onChange={setSku} />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add mapping"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ImportCard({ vendor, onChanged }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const upload = useMutation({
    mutationFn: () => uploadVendorMappings(vendor.id, file),
    onSuccess: (res) => {
      setResult(res);
      if (res.created_count > 0) onChanged();
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  return (
    <Card title="Import from CSV">
      <p className="mb-3 text-sm text-taupe">
        Got the vendor’s product list in a spreadsheet? Upload it to map many products at once. Rows that can’t be
        added are reported below; the rest are saved.
      </p>
      <ErrorBanner message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadVendorMappingTemplate().catch((e) => setError(getErrorInfo(e).message))}
        >
          Download template
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file to import"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError("");
          }}
          className="text-sm"
        />
        <Button
          size="sm"
          disabled={!file || upload.isPending}
          onClick={() => {
            setError("");
            setResult(null);
            upload.mutate();
          }}
        >
          {upload.isPending ? "Importing…" : "Import"}
        </Button>
      </div>
      {result && (
        <div className="mt-4" role="status">
          <p className="text-sm">
            <Badge tone="success">{result.created_count} added</Badge>{" "}
            {result.failed_count > 0 && <Badge tone="danger">{result.failed_count} skipped</Badge>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-3 max-h-48 overflow-auto rounded-sm border border-taupe-light text-sm">
              {result.errors.map((e) => (
                <li key={e.row_number} className="border-b border-taupe-light px-3 py-1.5 last:border-0">
                  <span className="font-medium">Row {e.row_number}</span>
                  {e.vendor_sku_code ? ` (${e.vendor_sku_code})` : ""}: {e.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function VendorSkuMappings() {
  const { vendorId } = useParams();
  const queryClient = useQueryClient();
  const vendorQuery = useQuery({ queryKey: ["vendor", vendorId], queryFn: () => getVendor(vendorId) });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [editing, setEditing] = useState(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [removing, setRemoving] = useState(null);
  const [dialogError, setDialogError] = useState("");

  const list = usePagedList(["vendor-mappings", vendorId, debouncedSearch], ({ limit, offset }) =>
    listVendorMappings({ vendorId, search: debouncedSearch, limit, offset })
  );
  const refresh = () => invalidateBusinessData(queryClient);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateVendorMapping(editing.id, { vendor_sku_code: editCode.trim(), vendor_product_name: editName.trim() || null }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (err) => setDialogError(getErrorInfo(err).message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteVendorMapping(removing.id),
    onSuccess: () => {
      setRemoving(null);
      refresh();
    },
    onError: (err) => setDialogError(getErrorInfo(err).message),
  });

  const columns = useMemo(
    () => [
      { accessorKey: "vendor_sku_code", header: "Vendor’s code", cell: (ctx) => <span className="font-medium">{ctx.getValue()}</span> },
      { accessorKey: "vendor_product_name", header: "Vendor’s product name", cell: (ctx) => ctx.getValue() || "—" },
      {
        id: "sku",
        header: "Exotica SKU",
        accessorFn: (r) => `${r.sku_code} ${r.sku_name}`,
        cell: (ctx) => (
          <Link to={`/skus/${ctx.row.original.sku_id}`} className="text-brand hover:underline">
            {ctx.row.original.sku_code}
            <span className="ml-1 text-xs text-taupe">{ctx.row.original.sku_name}</span>
          </Link>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (ctx) => (
          <span className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(ctx.row.original);
                setEditCode(ctx.row.original.vendor_sku_code);
                setEditName(ctx.row.original.vendor_product_name || "");
                setDialogError("");
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRemoving(ctx.row.original);
                setDialogError("");
              }}
            >
              Remove
            </Button>
          </span>
        ),
      },
    ],
    []
  );

  if (vendorQuery.isLoading) return <Loader label="Loading vendor…" />;
  if (vendorQuery.isError || !vendorQuery.data) {
    return (
      <div>
        <p className="mb-3 text-sm text-danger">That vendor couldn’t be found.</p>
        <Link to="/vendors" className="text-sm text-brand underline">
          ← Back to vendors
        </Link>
      </div>
    );
  }
  const vendor = vendorQuery.data;

  return (
    <div className="max-w-5xl">
      <Link to="/vendors" className="text-sm text-brand underline">
        ← Vendors
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl font-semibold text-ink">{vendor.name} — SKU mapping</h1>
      <p className="mb-6 text-sm text-taupe">
        Link this vendor’s own product codes to your SKUs. When you record a purchase from {vendor.name}, you can then
        find a product by the vendor’s code, and each purchase line keeps the code for reconciling their invoice.
      </p>
      {!vendor.is_active && (
        <p className="mb-4 text-sm text-warning">This vendor is inactive. Reactivate it before adding mappings.</p>
      )}

      <div className="mb-6 flex flex-col gap-6">
        <AddMappingCard vendor={vendor} onChanged={refresh} />
        <ImportCard vendor={vendor} onChanged={refresh} />
      </div>

      <div className="mb-3 max-w-xs">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor code or SKU…"
          aria-label="Search mappings"
        />
      </div>
      <DataTable
        columns={columns}
        data={list.items}
        isLoading={list.isLoading}
        emptyTitle={debouncedSearch ? "No mappings match your search" : "No mappings yet"}
        emptyMessage={debouncedSearch ? undefined : "Add one above, or import the vendor’s product list."}
        totalCount={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
      />

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit mapping"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-mapping-form" disabled={saveMutation.isPending || !editCode.trim()}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <ErrorBanner message={dialogError} />
        {editing && (
          <p className="mb-3 text-sm text-taupe">
            Mapped to <span className="font-medium text-ink">{editing.sku_code}</span>. To point this code at a different
            SKU, remove it and add it again.
          </p>
        )}
        <form
          id="edit-mapping-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setDialogError("");
            saveMutation.mutate();
          }}
        >
          <Field label="Vendor’s code" required>
            <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Vendor’s product name">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={200} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove mapping?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        <ErrorBanner message={dialogError} />
        {removing && (
          <p className="text-sm text-ink">
            {removing.vendor_sku_code} will no longer be linked to {removing.sku_code}. Past purchases keep the code they
            were recorded with.
          </p>
        )}
      </Modal>
    </div>
  );
}
