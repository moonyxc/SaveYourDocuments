import React, { useState } from 'react';
import { useDocuments } from '../hooks/useDocuments';
import { useUiStore } from '../stores/uiStore';
import { DocumentGrid } from '../components/documents/DocumentGrid';
import { DocumentList } from '../components/documents/DocumentList';
import { DocumentDetail } from '../components/documents/DocumentDetail';
import { DocumentUpload, UploadItem } from '../components/documents/DocumentUpload';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Toast } from '../components/common/Toast';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Button } from '../components/ui/Button';
import { Document } from '../types/document';

export function DocumentsPage() {
  const { documents, selectedDocument, setSelectedDocument, deleteDocument, updateDocument, createDocument, isLoading } = useDocuments();
  const { currentView, setCurrentView } = useUiStore();
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; document: Document | null }>({
    isOpen: false,
    document: null,
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleUpload = async (items: UploadItem[]) => {
    for (const item of items) {
      try {
        let buffer: ArrayBuffer;
        if (item.file) {
          buffer = await item.file.arrayBuffer();
        } else if (item.path) {
          const readResult = await window.api.readFile(item.path);
          if (!readResult.success || !readResult.data) {
            setToast({ message: `Datei konnte nicht gelesen werden: ${item.name}`, type: 'error' });
            continue;
          }
          buffer = readResult.data;
        } else {
          continue;
        }

        const saveResult = await window.api.saveFile({ buffer, filename: item.name, metadata: {} });
        if (!saveResult.success || !saveResult.storedFilename) {
          setToast({ message: `Datei konnte nicht gespeichert werden: ${saveResult.error || item.name}`, type: 'error' });
          continue;
        }

        const doc = await createDocument({
          originalFilename: item.name,
          storedFilename: saveResult.storedFilename,
          fileHash: saveResult.fileHash,
          fileSize: saveResult.fileSize,
          mimeType: saveResult.mimeType,
          ocrSource: 'tesseract',
        });
        if (doc) {
          setToast({ message: `${item.name} gespeichert`, type: 'success' });
        } else {
          setToast({ message: `Dokument konnte nicht angelegt werden: ${item.name}`, type: 'error' });
        }
      } catch (error) {
        setToast({ message: `Fehler bei ${item.name}: ${error instanceof Error ? error.message : 'Unbekannt'}`, type: 'error' });
      }
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm.document) {
      const success = await deleteDocument(deleteConfirm.document.id);
      if (success) {
        setToast({ message: 'Dokument gelöscht', type: 'success' });
      } else {
        setToast({ message: 'Fehler beim Löschen', type: 'error' });
      }
      setDeleteConfirm({ isOpen: false, document: null });
      setSelectedDocument(null);
    }
  };

  const handleValidate = async (document: Document) => {
    const success = await updateDocument(document.id, { isValidated: true });
    if (success) {
      setToast({ message: 'Dokument validiert', type: 'success' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Lade Dokumente..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DocumentUpload onUpload={handleUpload} />
        <div className="flex gap-2">
          <Button
            type="button"
            variant={currentView === 'grid' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setCurrentView('grid')}
          >
            Grid
          </Button>
          <Button
            type="button"
            variant={currentView === 'list' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setCurrentView('list')}
          >
            Liste
          </Button>
        </div>
      </div>

      {currentView === 'grid' ? (
        <DocumentGrid
          documents={documents}
          onDocumentClick={(doc) => setSelectedDocument(doc)}
          onValidate={handleValidate}
          onDelete={(doc) => setDeleteConfirm({ isOpen: true, document: doc })}
        />
      ) : (
        <DocumentList
          documents={documents}
          onDocumentClick={(doc) => setSelectedDocument(doc)}
          onValidate={handleValidate}
          onDelete={(doc) => setDeleteConfirm({ isOpen: true, document: doc })}
        />
      )}

      {selectedDocument && (
        <DocumentDetail
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          onValidate={() => handleValidate(selectedDocument)}
          onDelete={() => setDeleteConfirm({ isOpen: true, document: selectedDocument })}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, document: null })}
        onConfirm={handleDelete}
        title="Dokument löschen"
        message={`Möchtest du "${deleteConfirm.document?.originalFilename}" wirklich löschen?`}
        variant="danger"
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
