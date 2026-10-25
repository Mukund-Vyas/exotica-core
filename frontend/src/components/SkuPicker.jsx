import { useSkuSearch } from "../hooks/useSkuSearch";
import SearchPicker from "./ui/SearchPicker";

const skuText = (sku) => `${sku.code} — ${sku.name}`;

/** `vendorId` (optional): also search by that vendor's own code/name and show it. */
export default function SkuPicker({ value, onChange, placeholder = "Search SKU code or name…", autoFocus, vendorId }) {
  return (
    <SearchPicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoFocus={autoFocus}
      emptyText="No matching SKUs."
      getText={skuText}
      useSearch={(q) => {
        const { skus, isFetching } = useSkuSearch(q, { vendorId });
        return { items: skus, isFetching };
      }}
      renderItem={(sku) => (
        <>
          <span className="block font-medium text-ink">{skuText(sku)}</span>
          {vendorId && sku.vendor_sku_code && (
            <span className="block text-xs text-brand-dark">
              Vendor code: <span className="font-medium">{sku.vendor_sku_code}</span>
              {sku.vendor_product_name ? ` · ${sku.vendor_product_name}` : ""}
            </span>
          )}
          <span className={`block text-xs ${sku.current_stock_qty <= 0 ? "text-danger" : "text-taupe"}`}>
            {sku.category} · {sku.size_variant} · {sku.current_stock_qty <= 0 ? "Out of stock" : `Stock: ${sku.current_stock_qty}`}
          </span>
        </>
      )}
    />
  );
}
