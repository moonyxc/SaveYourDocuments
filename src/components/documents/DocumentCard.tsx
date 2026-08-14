import React from 'react';
import { Document } from '../../types/document';
import { Badge } from '../ui/Badge';
import { formatDate, formatCurrency } from '../../utils/formatters';

interface DocumentCardProps {
  document: Document;
  onClick?: () => void;
  onValidate?: () => void;
  onDelete?: () => void;
}

export function DocumentCard({ document, onClick, onValidate, onDelete }: DocumentCardProps) {
  const getStatusColor = () => {
    if (!document.isValidated) return 'yellow';
    if (document.isPaid) return 'green';
    return 'blue';
  };

  const getStatusText = () => {
    if (!document.isValidated) return 'Nicht validiert';
    if (document.isPaid) return 'Bezahlt';
    return 'Offen';
  };

  return (
    <div
      className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-slate-200 truncate">
            {document.originalFilename || 'Unbenannt'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {formatDate(document.documentDate)}
          </p>
        </div>
        <Badge color={getStatusColor()}>{getStatusText()}</Badge>
      </div>

      {document.detectedAmount !== undefined && (
        <p className="text-lg font-semibold text-slate-100 mb-2">
          {formatCurrency(document.detectedAmount, document.detectedCurrency)}
        </p>
      )}

      {document.ocrText && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-3">
          {document.ocrText}
        </p>
      )}

      <div className="flex items-center gap-2">
        {document.ocrSource === 'vision_fallback' && (
          <Badge color="purple">Vision</Badge>
        )}
        {document.tags?.map((tag) => (
          <Badge key={tag} color="gray">{tag}</Badge>
        ))}
      </div>

      {(onValidate || onDelete) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
          {onValidate && !document.isValidated && (
            <button
              onClick={(e) => { e.stopPropagation(); onValidate(); }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Validieren
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
