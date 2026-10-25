import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSettings, updateSetting } from "../../api/settings";
import { listChannels, listCurrentChannelCommissions, setChannelCommission } from "../../api/products";
import { Card, ErrorBanner, Loader } from "../../components/ui/Surfaces";
import { Field, Input, Select } from "../../components/ui/Field";
import Button from "../../components/ui/Button";
import { getErrorInfo } from "../../utils/errorCodes";
import { invalidateBusinessData } from "../../utils/invalidate";
import { trimZeros } from "../../utils/numbers";

const SETTING_LABELS = {
  dead_stock_window: "Dead stock window (days)",
  ads_window_days: "ADS calculation window (days)",
  fast_mover_top_percentile: "Fast-mover cutoff (top % by units sold)",
  safety_buffer_days: "Safety buffer (days)",
  target_coverage_days: "Target stock coverage (days)",
  default_lead_time_days: "Default lead time (days, when a SKU leaves it blank)",
};

// Same limits the server enforces (backend/app/services/settings.py).
const SETTING_RANGES = {
  dead_stock_window: [1, 3650],
  ads_window_days: [1, 365],
  fast_mover_top_percentile: [1, 100],
  safety_buffer_days: [0, 365],
  target_coverage_days: [1, 730],
  default_lead_time_days: [0, 365],
};

function SettingsList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: listSettings });
  const [edits, setEdits] = useState({});
  const [error, setError] = useState("");
  const [savedKey, setSavedKey] = useState("");

  const mutation = useMutation({
    mutationFn: ({ key, value }) => updateSetting(key, value),
    onSuccess: () => {
      // These settings drive several reports and dashboard cards, not just one.
      invalidateBusinessData(queryClient);
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
              <p className="text-xs text-taupe">
                Current: {s.value}
                {SETTING_RANGES[s.key] && ` · allowed ${SETTING_RANGES[s.key][0]}–${SETTING_RANGES[s.key][1]}`}
              </p>
              {savedKey === s.key && (
                <p role="status" className="text-xs text-success">
                  Saved.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                type="number"
                step="1"
                inputMode="numeric"
                aria-label={SETTING_LABELS[s.key] || s.key}
                min={SETTING_RANGES[s.key]?.[0]}
                max={SETTING_RANGES[s.key]?.[1]}
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
                  setSavedKey("");
                  const range = SETTING_RANGES[s.key];
                  const n = Number(edits[s.key]);
                  if (!/^\d+$/.test(edits[s.key].trim()) || (range && (n < range[0] || n > range[1]))) {
                    setError(
                      `${SETTING_LABELS[s.key] || s.key}: enter a whole number${range ? ` between ${range[0]} and ${range[1]}` : ""}.`
                    );
                    return;
                  }
                  mutation.mutate(
                    { key: s.key, value: edits[s.key].trim() },
                    {
                      onSuccess: () => {
                        setEdits((prev) => ({ ...prev, [s.key]: "" }));
                        setSavedKey(s.key);
                      },
                    }
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
  const [savedChannel, setSavedChannel] = useState("");

  const mutation = useMutation({
    mutationFn: ({ channelId, type, value }) => setChannelCommission(channelId, type, value),
    onSuccess: () => invalidateBusinessData(queryClient),
    onError: (err) => setError(getErrorInfo(err).message),
  });

  if (loadingChannels || loadingCommissions) return <Loader label="Loading commission settings…" />;

  const byChannel = Object.fromEntries((commissions || []).map((c) => [c.channel_id, c]));

  return (
    <Card title="Channel commission">
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
                    ? `Current: ${current.commission_type === "percentage" ? `${trimZeros(current.value)}%` : `₹${trimZeros(current.value)} per unit`}`
                    : "No commission set yet"}
                </p>
                {savedChannel === channel.id && (
                  <p role="status" className="text-xs text-success">
                    Saved. Applies to new orders only; past orders keep the rate they were sold at.
                  </p>
                )}
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
                  max={edit.type === "percentage" ? 100 : undefined}
                  aria-label={`Commission value for ${channel.name}`}
                  className="w-28"
                  placeholder={edit.type === "percentage" ? "% (0–100)" : "₹ per unit"}
                  value={edit.value}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [channel.id]: { ...edit, value: e.target.value } }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!edit.value || mutation.isPending}
                  onClick={() => {
                    setError("");
                    setSavedChannel("");
                    const limitOk = edit.type !== "percentage" || Number(edit.value) <= 100;
                    if (!(Number(edit.value) >= 0) || !limitOk || !/^\d+(\.\d{1,4})?$/.test(edit.value.trim())) {
                      setError(
                        `${channel.name}: enter ${edit.type === "percentage" ? "a percentage between 0 and 100" : "an amount of 0 or more"}.`
                      );
                      return;
                    }
                    mutation.mutate(
                      { channelId: channel.id, type: edit.type, value: edit.value.trim() },
                      {
                        onSuccess: () => {
                          setEdits((prev) => ({ ...prev, [channel.id]: { ...edit, value: "" } }));
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
