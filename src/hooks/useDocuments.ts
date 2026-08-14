import { useEffect, useCallback, useRef } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { Document } from '../types/document';

export function useDocuments() {
  const {
    documents,
    categories,
    companies,
    tags,
    selectedDocument,
    isLoading,
    error,
    setDocuments,
    setSelectedDocument,
    setLoading,
    setError,
    addDocument,
    updateDocument,
    removeDocument,
  } = useDocumentStore();

  const requestIdRef = useRef(0);

  const loadDocuments = useCallback(async (filters?: Record<string, unknown>) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.documents.list(filters);
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (Array.isArray(result)) {
        setDocuments(result as Document[]);
      } else {
        setError((result as unknown as { error?: string }).error || 'Fehler beim Laden der Dokumente');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Dokumente');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [setDocuments, setLoading, setError]);

  const loadDocument = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.documents.get(id);
      if (result && typeof result === 'object' && 'id' in (result as object)) {
        setSelectedDocument(result as Document);
        return result as Document;
      }
      setError((result as { error?: string })?.error || 'Dokument nicht gefunden');
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden des Dokuments');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setSelectedDocument, setLoading, setError]);

  const createDocument = useCallback(async (doc: Partial<Document>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.documents.create(doc as Record<string, unknown>);
      if (!result.success || result.id === undefined) {
        setError(result.error || 'Fehler beim Erstellen des Dokuments');
        return null;
      }
      const newDoc = {
        uuid: result.uuid || '',
        originalFilename: '',
        storedFilename: '',
        fileHash: '',
        fileSize: 0,
        mimeType: '',
        ocrSource: 'tesseract' as const,
        tags: [],
        customMetadata: {},
        isPaid: false,
        isValidated: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...doc,
        id: result.id,
      } as Document;
      addDocument(newDoc);
      return newDoc;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Dokuments');
      return null;
    } finally {
      setLoading(false);
    }
  }, [addDocument, setLoading, setError]);

  const updateDocumentById = useCallback(async (id: number, updates: Partial<Document>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.documents.update(id, updates as Record<string, unknown>);
      if (!result.success) {
        setError(result.error || 'Fehler beim Aktualisieren des Dokuments');
        return false;
      }
      updateDocument(id, updates);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Dokuments');
      return false;
    } finally {
      setLoading(false);
    }
  }, [updateDocument, setLoading, setError]);

  const deleteDocument = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.documents.delete(id);
      if (!result.success) {
        setError(result.error || 'Fehler beim Löschen des Dokuments');
        return false;
      }
      removeDocument(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen des Dokuments');
      return false;
    } finally {
      setLoading(false);
    }
  }, [removeDocument, setLoading, setError]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return {
    documents,
    categories,
    companies,
    tags,
    selectedDocument,
    isLoading,
    error,
    loadDocuments,
    loadDocument,
    createDocument,
    updateDocument: updateDocumentById,
    deleteDocument,
    setSelectedDocument,
  };
}
