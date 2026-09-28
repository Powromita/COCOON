/**
 * useCachedQuery — React Query + the SQLite api_cache for offline viewing.
 *
 * On success the response is written to the cache (API provider only —
 * fixture data is never cached, so it can't later masquerade as a backend
 * response). If the request fails because the device is offline or the
 * server is unreachable, the last cached response is returned instead,
 * marked source "cache" with its original fetch time. Any other failure is
 * surfaced as an error.
 */
import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";

import { DATA_PROVIDER } from "../constants/env";
import { getCacheRepository } from "../database";
import type { Sourced } from "../types/dataTruth";
import { AppError, isAppErrorKind } from "../utils/errors";

const FALLBACK_KINDS = ["offline", "network", "timeout", "unavailable", "server"] as const;

export async function fetchWithCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<Sourced<T>> {
  try {
    const data = await fetcher();
    const fetchedAt = new Date().toISOString();
    if (DATA_PROVIDER === "api") {
      try {
        await (await getCacheRepository()).set(cacheKey, data, DATA_PROVIDER, fetchedAt);
      } catch {
        // Caching is best-effort; a cache write failure must not fail the request.
      }
    }
    return { data, source: DATA_PROVIDER, fetchedAt };
  } catch (error) {
    if (DATA_PROVIDER === "api" && isAppErrorKind(error, ...FALLBACK_KINDS)) {
      try {
        const cached = await (await getCacheRepository()).get<T>(cacheKey);
        if (cached && cached.source === DATA_PROVIDER) {
          return { data: cached.value, source: "cache", fetchedAt: cached.fetchedAt };
        }
      } catch {
        // Fall through to the original error.
      }
    }
    throw error;
  }
}

type Options<T> = Omit<UseQueryOptions<Sourced<T>, Error, Sourced<T>, QueryKey>, "queryKey" | "queryFn">;

export function useCachedQuery<T>(queryKey: QueryKey, fetcher: () => Promise<T>, options: Options<T> = {}) {
  const cacheKey = JSON.stringify(queryKey);
  return useQuery<Sourced<T>, Error, Sourced<T>, QueryKey>({
    queryKey,
    queryFn: () => fetchWithCache(cacheKey, fetcher),
    retry: (failureCount, error) =>
      failureCount < 2 && (!(error instanceof AppError) || (error.retryable && error.kind !== "offline")),
    ...options,
  });
}
