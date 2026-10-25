import { useSkuSearch } from "../hooks/useSkuSearch";
import SearchPicker from "./ui/SearchPicker";

const skuText = (sku) => `${sku.code} — ${sku.name}`;

export default function SkuPicker({ value, onChange, placeholder = "Search SKU code or name…", autoFocus }) {
  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
      emptyText="No matching SKUs."
      getText={skuText}
      useSearch={(q) => {
        const { skus, isFetching } = useSkuSearch(q);
        return { items: skus, isFetching };
      }}
      renderItem={(sku) => (
        <>
          <span className="block font-medium text-ink">{skuText(sku)}</span>
          <span className={`block text-xs ${sku.current_stock_qty <= 0 ? "text-danger" : "text-taupe"}`}>
            {sku.category} · {sku.size_variant} · {sku.current_stock_qty <= 0 ? "Out of stock" : `Stock: ${sku.current_stock_qty}`}
          </span>
        </>
      )}
    />
  );
}
