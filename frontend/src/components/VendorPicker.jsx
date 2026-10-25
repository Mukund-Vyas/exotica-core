import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVendorSearch } from "../hooks/useVendorSearch";
import { createVendor } from "../api/vendors";
import SearchPicker from "./ui/SearchPicker";
import { getErrorInfo } from "../utils/errorCodes";

export default function VendorPicker({
  value,
  onChange,
  placeholder = "Search or add a vendor…",
  allowCreate = true,
}) {
  const queryClient = useQueryClient();
  const [createError, setCreateError] = useState("");

  const createMutation = useMutation({
    mutationFn: (name) => createVendor(name),
  });

  const create = allowCreate
    ? {
        label: (q) => `Add new vendor "${q}"`,
        isPending: createMutation.isPending,
        error: createError,
        exists: (items, q) => items.some((i) => i.name.toLowerCase() === q.toLowerCase()),
        onCreate: (q, choose) => {
          setCreateError("");
          createMutation.mutate(q, {
            onSuccess: (created) => {
              queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
              choose(created);
            },
            onError: (err) => {
              const info = getErrorInfo(err);
              // Created by someone else a moment ago: refresh so it can be picked.
              if (info.code === "duplicate_vendor_name") queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
              setCreateError(info.message);
            },
          });
        },
      }
    : undefined;

  return (
    <SearchPicker
      value={value}
      onChange={(item) => {
        setCreateError("");
        onChange?.(item);
      }}
      placeholder={placeholder}
      emptyText="Start typing to search vendors."
      getText={(item) => item.name}
      useSearch={(q) => {
        const r = useVendorSearch(q);
        return { items: r.vendors, isFetching: r.isFetching };
      }}
      renderItem={(item) => item.name}
      create={create}
    />
  );
}
