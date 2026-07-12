import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
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
import { getErrorInfo } from "../../utils/errorCodes";

const schema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  size_variant: z.string().min(1, "Size / variant is required").max(50),
  is_active: z.boolean().optional(),
});

export default function SKUForm() {
  const { skuId } = useParams();
  const isEdit = Boolean(skuId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

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
    if (skuQuery.data) reset(skuQuery.data);
  }, [skuQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values) => (isEdit ? updateSku(skuId, values) : createSku(values)),
    onSuccess: (sku) => {
      queryClient.invalidateQueries({ queryKey: ["skus"] });
      if (!isEdit) navigate(`/skus/${sku.id}`, { replace: true });
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  function onSubmit(values) {
    setError("");
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
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
      )}
    </div>
  );
}

function ChannelPriceEditor({ skuId, channels, currentPrices, loading }) {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState({});
  const [error, setError] = useState("");

  const priceMutation = useMutation({
    mutationFn: ({ channelId, price }) => setChannelPrice(skuId, channelId, price),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sku-channel-prices", skuId] });
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  if (loading) return <Loader label="Loading channel prices…" />;

  const priceByChannel = Object.fromEntries((currentPrices || []).map((p) => [p.channel_id, p]));

  return (
    <Card title="Channel pricing (FR-A2)">
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
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="New price"
                  className="w-32"
                  value={edits[channel.id] ?? ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!edits[channel.id] || priceMutation.isPending}
                  onClick={() => {
                    setError("");
                    priceMutation.mutate(
                      { channelId: channel.id, price: Number(edits[channel.id]) },
                      { onSuccess: () => setEdits((prev) => ({ ...prev, [channel.id]: "" })) }
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
