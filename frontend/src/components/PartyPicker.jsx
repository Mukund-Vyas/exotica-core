import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePartySearch } from "../hooks/usePartySearch";
import { createParty } from "../api/parties";
import SearchPicker from "./ui/SearchPicker";
import { getErrorInfo } from "../utils/errorCodes";

export default function PartyPicker({
  value,
  onChange,
  placeholder = "Search or add a party…",
  allowCreate = true,
}) {
  const queryClient = useQueryClient();
  const [createError, setCreateError] = useState("");

  const createMutation = useMutation({
    mutationFn: (name) => createParty(name),
  });

  const create = allowCreate
    ? {
        label: (q) => `Add new party "${q}"`,
        isPending: createMutation.isPending,
        error: createError,
        exists: (items, q) => items.some((i) => i.name.toLowerCase() === q.toLowerCase()),
        onCreate: (q, choose) => {
          setCreateError("");
          createMutation.mutate(q, {
            onSuccess: (created) => {
              queryClient.invalidateQueries({ queryKey: ["party-search"] });
              choose(created);
            },
            onError: (err) => {
              const info = getErrorInfo(err);
              // Created by someone else a moment ago: refresh so it can be picked.
              if (info.code === "duplicate_party_name") queryClient.invalidateQueries({ queryKey: ["party-search"] });
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
      emptyText="Start typing to search parties."
      getText={(item) => item.name}
      useSearch={(q) => {
        const r = usePartySearch(q);
        return { items: r.parties, isFetching: r.isFetching };
      }}
      renderItem={(item) => item.name}
      create={create}
    />
  );
}
