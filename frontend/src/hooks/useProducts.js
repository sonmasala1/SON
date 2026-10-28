'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProducts } from '@/lib/api';

export default function useProducts({ q = '', category = '', page = 1, limit = 12, featured = '', offers = '', sort = '' } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getProducts({ q, category, page, limit, featured, offers, sort }, { signal: controller.signal }).then(setData).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q, category, page, limit, featured, offers, sort, attempt]);
  return { data, error, loading, retry };
}
