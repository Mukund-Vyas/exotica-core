import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listVendors } from "../api/vendors";

export function useVendorSearch(query) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["vendor-search", debounced],
    queryFn: () => listVendors({ search: debounced || undefined, limit: 20 }),
    keepPreviousData: true,
  });

  return { vendors: data?.items ?? [], isFetching };
}
