import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import { listVendorMappings } from "../../api/vendorMappings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSku,
  getSku,
  getSkuChannelPrices,
  listChannels,
  setChannelPrice,
  updateSku,
} from "../../api/products";
import { Card, ErrorBanner, Loader } from "../../components/ui/Surfaces";
import { Field, Input, Select, Checkbox } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { formatCurrency } from "../../utils/currency";
import { invalidateBusinessData } from "../../utils/invalidate";
import { isPositiveMoney } from "../../utils/numbers";
import { getErrorInfo } from "../../utils/errorCodes";

const required = (label, max) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

const schema = z.object({
  code: required("Code", 50),
  name: required("Name", 200),
  category: required("Category", 100),
  size_variant: required("Size / variant", 50),
  is_active: z.boolean().optional(),
  // Blank means "use the site-wide default" and is sent as null. The API returns
  // null for it too — `z.coerce.number()` turns null into 0, which used to silently
  // change "default" into "0 days" every time any SKU edit was saved.
  lead_time_days: z.preprocess(
    (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(0, "Must be 0 or more")
      .max(365, "Must be 365 or fewer")
      .nullable()
  ),
});

export default function SKUForm() {
  const { skuId } = useParams();
  const isEdit = Boolean(skuId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const skuQuery = useQuery({
    queryKey: ["sku", skuId],
    queryFn: () => getSku(skuId),
    enabled: isEdit,
  });
  const channelsQuery = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const pricesQuery = useQuery({
    queryKey: ["sku-channel-prices", skuId],
    queryFn: () => getSkuChannelPrices(skuId),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { is_active: true } });

  useEffect(() => {
    if (skuQuery.data) reset({ ...skuQuery.data, lead_time_days: skuQuery.data.lead_time_days ?? "" });
  }, [skuQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values) => (isEdit ? updateSku(skuId, values) : createSku(values)),
    onSuccess: (sku) => {
      invalidateBusinessData(queryClient);
      if (!isEdit) navigate(`/skus/${sku.id}`, { replace: true });
      else setSaved(true);
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function onSubmit(values) {
    setError("");
    setSaved(false);
    saveMutation.mutate(values);
  }

  if (isEdit && skuQuery.isLoading) return <Loader label="Loading SKU…" />;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">
        {isEdit ? `Edit SKU — ${skuQuery.data?.code ?? ""}` : "New SKU"}
      </h1>

      <Card title="Product details">
        <ErrorBanner message={error} />
        {saved && (
          <div role="status" className="mb-4 rounded-sm border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
            Changes saved.
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} onChange={() => saved && setSaved(false)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SKU code" required error={errors.code?.message}>
            <Input {...register("code")} disabled={isEdit} placeholder="e.g. BR-1024-BLK-32B" />
          </Field>
          <Field label="Name" required error={errors.name?.message}>
            <Input {...register("name")} placeholder="e.g. Lace Balconette Bra" />
          </Field>
          <Field label="Category" required error={errors.category?.message}>
            <Input {...register("category")} placeholder="e.g. Bras" />
          </Field>
          <Field label="Size / Variant" required error={errors.size_variant?.message}>
            <Input {...register("size_variant")} placeholder="e.g. 32B — Black" />
          </Field>
          <Field
            label="Lead time (days)"
            error={errors.lead_time_days?.message}
            hint="How long a reorder takes to arrive from this SKU's vendor. Leave blank to use the site-wide default (Settings)."
          >
            <Input type="number" min="0" max="365" step="1" inputMode="numeric" {...register("lead_time_days")} placeholder="e.g. 7" />
          </Field>
          {isEdit && (
            <div className="sm:col-span-2">
              <Checkbox label="Active (uncheck to discontinue without deleting)" {...register("is_active")} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create SKU"}
            </Button>
          </div>
        </form>
      </Card>

      {isEdit && (
        <div className="mt-6">
          <ChannelPriceEditor
            skuId={skuId}
            channels={channelsQuery.data}
            currentPrices={pricesQuery.data}
            loading={channelsQuery.isLoading || pricesQuery.isLoading}
          />
          <div className="mt-6">
            <VendorCodesCard skuId={skuId} />
          </div>
        </div>
      )}
    </div>
  );
}

function VendorCodesCard({ skuId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["vendor-mappings-by-sku", skuId],
    queryFn: () => listVendorMappings({ skuId, limit: 100 }),
  });
  if (isLoading) return <Loader label="Loading vendor codes…" />;
  const rows = data?.items ?? [];
  return (
    <Card title="Vendor codes">
      {rows.length === 0 ? (
        <p className="text-sm text-taupe">
          No vendor has its own code for this SKU yet. Add them from a vendor’s <Link to="/vendors" className="text-brand underline">SKU codes</Link> page.
        </p>
      ) : (
        <ul className="divide-y divide-taupe-light text-sm">
          {rows.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>
                <Link to={`/vendors/${m.vendor_id}/sku-mapping`} className="font-medium text-brand hover:underline">
                  {m.vendor_name}
                </Link>
                {m.vendor_product_name && <span className="ml-2 text-taupe">{m.vendor_product_name}</span>}
              </span>
              <span className="num font-medium text-ink">{m.vendor_sku_code}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChannelPriceEditor({ skuId, channels, currentPrices, loading }) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState({});
  const [error, setError] = useState("");
  const [savedChannel, setSavedChannel] = useState("");

  const priceMutation = useMutation({
    mutationFn: ({ channelId, price }) => setChannelPrice(skuId, channelId, price),
    onSuccess: () => {
      invalidateBusinessData(queryClient);
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  if (loading) return <Loader label="Loading channel prices…" />;

  const priceByChannel = Object.fromEntries((currentPrices || []).map((p) => [p.channel_id, p]));

  return (
    <Card title="Channel pricing">
      <p className="mb-4 text-sm text-taupe">
        Set the selling price for each channel. Saving a new price supersedes the old one — history is
        preserved, so past reports don't change retroactively.
      </p>
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-3">
        {(channels || []).map((channel) => {
          const current = priceByChannel[channel.id];
          return (
            <div
              key={channel.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-taupe-light px-3 py-2.5"
            >
              <div>
                <p className="font-medium text-ink">{channel.name}</p>
                <p className="text-xs text-taupe">
                  {current ? `Current: ${formatCurrency(current.price)}` : "No price set yet"}
                </p>
                {savedChannel === channel.id && (
                  <p role="status" className="text-xs text-success">
                    Price updated.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="New price"
                  className="w-32"
                  inputMode="decimal"
                  aria-label={`New price for ${channel.name}`}
                  value={edits[channel.id] ?? ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!edits[channel.id] || priceMutation.isPending}
                  onClick={() => {
                    setError("");
                    setSavedChannel("");
                    if (!isPositiveMoney(edits[channel.id])) {
                      setError(`Enter a price above 0 for ${channel.name} (max 2 decimals).`);
                      return;
                    }
                    priceMutation.mutate(
                      { channelId: channel.id, price: edits[channel.id].trim() },
                      {
                        onSuccess: () => {
                          setEdits((prev) => ({ ...prev, [channel.id]: "" }));
                          setSavedChannel(channel.id);
                        },
                      }
                    );
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
