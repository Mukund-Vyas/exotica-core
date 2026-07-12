import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { downloadSkuBulkTemplate, uploadSkusBulk } from "../../api/products";
import { Card, ErrorBanner, Badge } from "../../components/ui/Surfaces";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import { getErrorInfo } from "../../utils/errorCodes";

function downloadErrorsAsCsv(errors) {
  const header = "row_number,code,error_code,detail";
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = errors.map((e) => [e.row_number, e.code, e.error_code, e.detail].map(escape).join(","));
  const csv = [header, ...lines].join("\n");
  const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "exotica_sku_upload_errors.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function BulkUpload() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [result, setResult] = useState(null);

  const uploadMutation = useMutation({
    mutationFn: uploadSkusBulk,
    onSuccess: (res) => {
      setResult(res);
      if (res.created_count > 0) queryClient.invalidateQueries({ queryKey: ["skus"] });
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  async function handleTemplateDownload() {
    setTemplateError("");
    try {
      await downloadSkuBulkTemplate();
    } catch (err) {
      setTemplateError(getErrorInfo(err).message);
    }
  }

  function handleUpload() {
    if (!file) return;
    setError("");
    setResult(null);
    uploadMutation.mutate(file);
  }

  const errorColumns = [
    { accessorKey: "row_number", header: "Row" },
    { accessorKey: "code", header: "Code", cell: (ctx) => ctx.getValue() || "—" },
    { accessorKey: "error_code", header: "Error" },
    { accessorKey: "detail", header: "Detail" },
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Bulk SKU upload</h1>
          <p className="text-sm text-taupe">Create many SKUs at once from a CSV file (FR-A4).</p>
        </div>
        <Link to="/skus" className="text-sm text-plum underline">
          ← Back to SKUs
        </Link>
      </div>

      <Card title="1. Get the template">
        <ErrorBanner message={templateError} />
        <p className="mb-3 text-sm text-taupe">
          Required columns: <code className="text-xs">code, name, category, size_variant</code>. Optional:{" "}
          <code className="text-xs">lead_time_days, myntra_price, zivame_price, website_price, b2b_price</code>. A
          blank price column means "no price set yet for that channel" — same as pricing it individually later.
        </p>
        <Button variant="secondary" onClick={handleTemplateDownload}>
          Download CSV template
        </Button>
      </Card>

      <Card title="2. Upload your file" className="mt-6">
        <ErrorBanner message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button onClick={handleUpload} disabled={!file || uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-taupe">
          Up to 2,000 rows. One bad row won't block the rest — each row succeeds or fails independently.
        </p>
      </Card>

      {result && (
        <Card title="Result" className="mt-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge tone="success">{result.created_count} created</Badge>
            {result.failed_count > 0 && <Badge tone="danger">{result.failed_count} failed</Badge>}
            {result.failed_count === 0 && result.created_count > 0 && (
              <span className="text-sm text-taupe">All rows created successfully.</span>
            )}
          </div>

          {result.errors.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Failed rows</p>
                <Button size="sm" variant="ghost" onClick={() => downloadErrorsAsCsv(result.errors)}>
                  Download error report
                </Button>
              </div>
              <DataTable columns={errorColumns} data={result.errors} emptyTitle="No errors" />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
