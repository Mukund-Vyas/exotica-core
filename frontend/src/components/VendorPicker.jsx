import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVendorSearch } from "../hooks/useVendorSearch";
import { createVendor } from "../api/vendors";
import { Input } from "./ui/Field";
import { getErrorInfo } from "../utils/errorCodes";

export default function VendorPicker({ value, onChange, placeholder = "Search or add a vendor…", allowCreate = true }) {
  const [query, setQuery] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const boxRef = useRef(null);
  const queryClient = useQueryClient();
  const { vendors, isFetching } = useVendorSearch(query);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const trimmedQuery = query.trim();
  const hasExactMatch = vendors.some((v) => v.name.toLowerCase() === trimmedQuery.toLowerCase());

  const createMutation = useMutation({
    mutationFn: (name) => createVendor(name),
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
      onChange?.(vendor);
      setQuery(vendor.name);
      setOpen(false);
      setCreateError("");
    },
    onError: (err) => {
      const info = getErrorInfo(err);
      // Someone else created the same vendor in the gap between search and
      // create (race) — the backend already resolved this to the existing
      // row's name in its message, so just re-search and let them pick it.
      if (info.code === "duplicate_vendor_name") {
        queryClient.invalidateQueries({ queryKey: ["vendor-search"] });
      }
      setCreateError(info.message);
    },
  });

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCreateError("");
          if (!e.target.value) onChange?.(null);
        }}
        onFocus={() => setOpen(true)}
      />
      {createError && <p className="mt-1 text-xs text-danger">{createError}</p>}
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-taupe-light bg-white shadow-card">
          {isFetching && <div className="px-3 py-2 text-sm text-taupe">Searching…</div>}
          {!isFetching && vendors.length === 0 && !trimmedQuery && (
            <div className="px-3 py-2 text-sm text-taupe">Start typing to search vendors.</div>
          )}
          {vendors.map((vendor) => (
            <button
              type="button"
              key={vendor.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-plum-50"
              onClick={() => {
                onChange?.(vendor);
                setQuery(vendor.name);
                setOpen(false);
              }}
            >
              {vendor.name}
            </button>
          ))}
          {trimmedQuery && !hasExactMatch && allowCreate && (
            <button
              type="button"
              disabled={createMutation.isPending}
              className="flex w-full items-center gap-1.5 border-t border-taupe-light px-3 py-2 text-left text-sm text-plum hover:bg-plum-50 disabled:opacity-60"
              onClick={() => {
                setCreateError("");
                createMutation.mutate(trimmedQuery);
              }}
            >
              <span aria-hidden="true">+</span>
              {createMutation.isPending ? "Adding…" : `Add new vendor "${trimmedQuery}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
