import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSettings, updateSetting } from "../../api/settings";
import { listChannels, listCurrentChannelCommissions, setChannelCommission } from "../../api/products";
import { Card, ErrorBanner, Loader } from "../../components/ui/Surfaces";
import { Field, Input, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { getErrorInfo } from "../../utils/errorCodes";

const SETTING_LABELS = {
  dead_stock_window: "Dead stock window (days)",
};

function SettingsList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: listSettings });
  const [edits, setEdits] = useState({});
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: ({ key, value }) => updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-dead-stock"] });
      queryClient.invalidateQueries({ queryKey: ["dead-stock"] });
    },
    onError: (err) => setError(getErrorInfo(err).message),
  });

  if (isLoading) return <Loader label="Loading settings…" />;

  return (
    <Card title="System settings">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-3">
        {(data?.items || data || []).map((s) => (
          <div key={s.key} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-taupe-light px-3 py-2.5">
            <div>
              <p className="font-medium text-ink">{SETTING_LABELS[s.key] || s.key}</p>
              <p className="text-xs text-taupe">Current: {s.value}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                value={edits[s.key] ?? ""}
                placeholder={s.value}
                onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!edits[s.key] || mutation.isPending}
                onClick={() => {
                  setError("");
                  mutation.mutate(
                    { key: s.key, value: edits[s.key] },
                    { onSuccess: () => setEdits((prev) => ({ ...prev, [s.key]: "" })) }
                  );
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CommissionEditor() {
  const queryClient = useQueryClient();
  const { data: channels, isLoading: loadingChannels } = useQuery({ queryKey: ["channels"], queryFn: listChannels });
  const { data: commissions, isLoading: loadingCommissions } = useQuery({
    queryKey: ["channel-commissions"],
    queryFn: listCurrentChannelCommissions,
  });
  const [edits, setEdits] = useState({});
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: ({ channelId, type, value }) => setChannelCommission(channelId, type, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channel-commissions"] }),
    onError: (err) => setError(getErrorInfo(err).message),
  });

  if (loadingChannels || loadingCommissions) return <Loader label="Loading commission settings…" />;

  const byChannel = Object.fromEntries((commissions || []).map((c) => [c.channel_id, c]));

  return (
    <Card title="Channel commission (FR-A3)">
      <p className="mb-4 text-sm text-taupe">
        Set commission per channel — flat percentage or fixed amount per unit. This feeds directly into every
        P&amp;L report, so keep it current when a marketplace changes its rate.
      </p>
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-3">
        {(channels || []).map((channel) => {
          const current = byChannel[channel.id];
          const edit = edits[channel.id] || { type: current?.commission_type || "percentage", value: "" };
          return (
            <div key={channel.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-taupe-light px-3 py-2.5">
              <div>
                <p className="font-medium text-ink">{channel.name}</p>
                <p className="text-xs text-taupe">
                  {current
                    ? `Current: ${current.value}${current.commission_type === "percentage" ? "%" : " flat"}`
                    : "No commission set yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  className="w-32"
                  value={edit.type}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [channel.id]: { ...edit, type: e.target.value } }))}
                >
                  <option value="percentage">Percentage</option>
                  <option value="flat">Flat amount</option>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-28"
                  placeholder="Value"
                  value={edit.value}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [channel.id]: { ...edit, value: e.target.value } }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!edit.value || mutation.isPending}
                  onClick={() => {
                    setError("");
                    mutation.mutate(
                      { channelId: channel.id, type: edit.type, value: Number(edit.value) },
                      { onSuccess: () => setEdits((prev) => ({ ...prev, [channel.id]: { ...edit, value: "" } })) }
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

export default function SystemSettings() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-display text-2xl font-semibold text-ink">Settings</h1>
      <div className="flex flex-col gap-6">
        <SettingsList />
        <CommissionEditor />
      </div>
    </div>
  );
}
