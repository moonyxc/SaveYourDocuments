import React from 'react';
import { Document } from '../../types/document';
import { Badge } from '../ui/Badge';
import { formatDate, formatCurrency } from '../../utils/formatters';

interface DocumentListProps {
  documents: Document[];
  onDocumentClick?: (document: Document) => void;
  onValidate?: (document: Document) => void;
  onDelete?: (document: Document) => void;
}

export function DocumentList({ documents, onDocumentClick, onValidate, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm">Keine Dokumente gefunden</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-800 text-left">
            <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Dateiname</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Datum</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Betrag</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider text-right">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              className="border-b border-slate-800/50 hover:bg-slate-800/50 cursor-pointer transition-colors"
              onClick={() => onDocumentClick?.(doc)}
            >
              <td className="px-4 py-3 text-sm text-slate-200 max-w-xs truncate">
                {doc.originalFilename || 'Unbenannt'}
              </td>
              <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                {formatDate(doc.documentDate)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-200 font-mono">
                {doc.detectedAmount !== undefined ? formatCurrency(doc.detectedAmount, doc.detectedCurrency) : '-'}
              </td>
              <td className="px-4 py-3">
                <Badge color={!doc.isValidated ? 'yellow' : doc.isPaid ? 'green' : 'blue'}>
                  {!doc.isValidated ? 'Nicht validiert' : doc.isPaid ? 'Bezahlt' : 'Offen'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                {onValidate && !doc.isValidated && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onValidate(doc); }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium mr-3 transition-colors"
                  >
                    Validieren
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(doc); }}
                    className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                  >
                    Löschen
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
