import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 100;

/**
 * Server-paged list with "Load more".
 *   fetchPage({ limit, offset }) must resolve to the API's Page shape
 *   ({ items, total, limit, offset }).
 * The List screens used to request one page and silently stop (orders at 200,
 * purchases at 100, SKUs at 200), so older rows were unreachable.
 */
export function usePagedList(queryKey, fetchPage, options = {}) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total && last.items.length > 0 ? next : undefined;
    },
    ...options,
  });
  const pages = query.data?.pages ?? [];
  return {
    items: pages.flatMap((p) => p.items),
    total: pages.length ? pages[pages.length - 1].total : 0,
    isLoading: query.isLoading,
    isError: query.isError,
    hasMore: !!query.hasNextPage,
    loadMore: () => query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    refetch: query.refetch,
  };
}
