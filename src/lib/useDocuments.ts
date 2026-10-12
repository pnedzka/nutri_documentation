import { useCallback, useEffect, useState } from 'react';
import type { DocumentSummary } from '../../shared/schema.ts';
import { api } from './api';

const POLL_MS = 5000;

/** Document list; refreshes itself while any document is being processed. */
export function useDocuments(scope: 'mine' | 'all') {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { documents } = await api<{ documents: DocumentSummary[] }>(scope === 'all' ? '/api/documents?scope=all' : '/api/documents');
      setDocuments(documents);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void reload();
  }, [reload]);

  const processing = documents?.some((d) => d.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [processing, reload]);

  return { documents, error, reload };
}
