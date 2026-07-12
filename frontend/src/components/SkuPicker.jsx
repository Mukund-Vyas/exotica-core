import { useEffect, useRef, useState } from "react";
import { useSkuSearch } from "../hooks/useSkuSearch";
import { Input } from "./ui/Field";

export default function SkuPicker({ value, onChange, placeholder = "Search SKU code or name…", autoFocus }) {
  const [query, setQuery] = useState(value?.label || "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const { skus, isFetching } = useSkuSearch(query);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <Input
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange?.(null);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border border-taupe-light bg-white shadow-card">
          {isFetching && <div className="px-3 py-2 text-sm text-taupe">Searching…</div>}
          {!isFetching && skus.length === 0 && (
            <div className="px-3 py-2 text-sm text-taupe">No matching SKUs.</div>
          )}
          {skus.map((sku) => (
            <button
              type="button"
              key={sku.id}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-plum-50"
              onClick={() => {
                onChange?.(sku);
                setQuery(`${sku.code} — ${sku.name}`);
                setOpen(false);
              }}
            >
              <span className="font-medium text-ink">
                {sku.code} — {sku.name}
              </span>
              <span className="text-xs text-taupe">
                {sku.category} · {sku.size_variant} · Stock: {sku.current_stock_qty}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
