import { useState, useCallback, useRef } from 'react';
import { Document } from '../types/document';

export function useSearch() {
  const [results, setResults] = useState<Document[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const search = useCallback(async (query: string, filters?: Record<string, unknown>) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setIsSearching(false);
      return [];
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setError(null);

    try {
      const searchResults = await window.api.search(query, filters);
      if (requestId !== requestIdRef.current) {
        return [];
      }
      if (Array.isArray(searchResults)) {
        setResults(searchResults as Document[]);
        return searchResults as Document[];
      }
      const errorResult = searchResults as unknown as { error?: string };
      setError(errorResult.error || 'Suchfehler');
      return [];
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return [];
      }
      setError(err instanceof Error ? err.message : 'Suchfehler');
      return [];
    } finally {
      if (requestId === requestIdRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  const clearSearch = useCallback(() => {
    requestIdRef.current++;
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    clearSearch,
  };
}
