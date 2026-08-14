import React from 'react';
import { Document } from '../../types/document';
import { DocumentCard } from './DocumentCard';

interface DocumentGridProps {
  documents: Document[];
  onDocumentClick?: (document: Document) => void;
  onValidate?: (document: Document) => void;
  onDelete?: (document: Document) => void;
}

export function DocumentGrid({ documents, onDocumentClick, onValidate, onDelete }: DocumentGridProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-slate-400">Keine Dokumente gefunden</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onClick={() => onDocumentClick?.(doc)}
          onValidate={() => onValidate?.(doc)}
          onDelete={() => onDelete?.(doc)}
        />
      ))}
    </div>
  );
}
