/**
 * Reusable data-fetching hook with loading/error state.
 * Prevents duplicated fetch + useState + useEffect patterns
 * scattered across admin components.
 */
import { useState, useEffect, useCallback, useRef } from "react";

interface UseAsyncDataOptions {
    /** Skip the initial fetch (e.g. when waiting for a dependency). */
    skip?: boolean;
}

interface UseAsyncDataResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useAsyncData<T>(
    fetcher: () => Promise<T>,
    deps: unknown[] = [],
    options: UseAsyncDataOptions = {},
): UseAsyncDataResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(!options.skip);
    const [error, setError] = useState<Error | null>(null);
    const mountedRef = useRef(true);

    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const execute = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetcherRef.current();
            if (mountedRef.current) {
                setData(result);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err : new Error(String(err)));
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        mountedRef.current = true;
        if (!options.skip) {
            execute();
        }
        return () => {
            mountedRef.current = false;
        };
    }, [execute, options.skip]);

    return { data, loading, error, refetch: execute };
}
