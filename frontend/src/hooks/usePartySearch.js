import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listParties } from "../api/parties";

export function usePartySearch(query) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["party-search", debounced],
    queryFn: () => listParties({ search: debounced || undefined, limit: 20 }),
    keepPreviousData: true,
  });

  return { parties: data?.items ?? [], isFetching };
}
