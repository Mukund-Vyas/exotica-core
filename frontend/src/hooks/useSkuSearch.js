import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSkus } from "../api/products";

export function useSkuSearch(query, { activeOnly = true } = {}) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["sku-search", debounced, activeOnly],
    queryFn: () =>
      listSkus({ search: debounced || undefined, isActive: activeOnly ? true : undefined, limit: 25 }),
    keepPreviousData: true,
  });

  return { skus: data?.items ?? [], isFetching };
}
