import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { listSkus } from "../api/products";

// With `vendorId`, the search also matches that vendor's own codes/names and each
// result carries `vendor_sku_code` — so purchases can be keyed from a vendor invoice.
export function useSkuSearch(query, { activeOnly = true, vendorId } = {}) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["sku-search", debounced, activeOnly, vendorId ?? null],
    queryFn: () =>
      listSkus({
        search: debounced || undefined,
        isActive: activeOnly ? true : undefined,
        vendorId: vendorId || undefined,
        limit: 25,
      }),
    placeholderData: keepPreviousData,
  });

  return { skus: data?.items ?? [], isFetching };
}
