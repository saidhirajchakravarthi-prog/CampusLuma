import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiError } from '../api/client';

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: any[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [requestError, setRequestError] = useState<{ key: string; epoch: number; message: string } | null>(null);
  const [completedRequest, setCompletedRequest] = useState<{ key: string; epoch: number } | null>(null);
  const [requestEpoch, setRequestEpoch] = useState(0);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  const dependencyKey = JSON.stringify(deps);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refetch = useCallback(() => {
    setRequestEpoch((epoch) => epoch + 1);
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((result) => {
        if (currentRequest !== requestId.current) return;
        setData(result);
        setRequestError(null);
      })
      .catch((err: unknown) => {
        if (currentRequest !== requestId.current) return;
        if (err instanceof ApiError || err instanceof Error) {
          setRequestError({ key: dependencyKey, epoch: requestEpoch, message: err.message });
        } else {
          setRequestError({ key: dependencyKey, epoch: requestEpoch, message: 'An unexpected error occurred while fetching data.' });
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setCompletedRequest({ key: dependencyKey, epoch: requestEpoch });
      });
    return () => {
      requestId.current += 1;
    };
  }, [dependencyKey, requestEpoch]);

  const loading = completedRequest?.key !== dependencyKey || completedRequest?.epoch !== requestEpoch;
  const error = requestError?.key === dependencyKey && requestError.epoch === requestEpoch ? requestError.message : null;
  return { data, loading, error, refetch };
}
