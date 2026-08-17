import React from 'react';
import { Document } from '../../types/document';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatDate, formatCurrency, formatFileSize } from '../../utils/formatters';

interface DocumentDetailProps {
  document: Document;
  onClose: () => void;
  onValidate?: () => void;
  onDelete?: () => void;
  onUpdate?: (updates: Partial<Document>) => void;
}

export function DocumentDetail({ document, onClose, onValidate, onDelete }: DocumentDetailProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-100">
            {document.originalFilename || 'Dokumentdetails'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Dateiname</label>
              <p className="text-sm text-slate-200 mt-1 truncate">{document.originalFilename || '-'}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Größe</label>
              <p className="text-sm text-slate-200 mt-1 font-mono">{formatFileSize(document.fileSize)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Datum</label>
              <p className="text-sm text-slate-200 mt-1 font-mono">{formatDate(document.documentDate)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Betrag</label>
              <p className="text-sm text-slate-200 mt-1 font-mono">{formatCurrency(document.detectedAmount, document.detectedCurrency)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">OCR-Quelle</label>
              <div className="mt-1">
                <Badge color={document.ocrSource === 'vision_fallback' ? 'purple' : 'blue'}>
                  {document.ocrSource === 'vision_fallback' ? 'Vision' : 'Tesseract'}
                </Badge>
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <label className="text-xs text-slate-500 uppercase tracking-wider">Konfidenz</label>
              <p className="text-sm text-slate-200 mt-1 font-mono">
                {document.ocrConfidence !== undefined ? `${document.ocrConfidence.toFixed(1)}%` : '-'}
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider">Status</label>
            <div className="flex gap-2 mt-2">
              <Badge color={document.isValidated ? 'green' : 'yellow'}>
                {document.isValidated ? 'Validiert' : 'Nicht validiert'}
              </Badge>
              <Badge color={document.isPaid ? 'green' : 'red'}>
                {document.isPaid ? 'Bezahlt' : 'Unbezahlt'}
              </Badge>
            </div>
          </div>

          {document.ocrText && (
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Erkannter Text</label>
              <div className="mt-2 p-4 bg-slate-800/50 rounded-lg max-h-40 overflow-y-auto border border-slate-800">
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{document.ocrText}</p>
              </div>
            </div>
          )}

          {document.validationNotes && (
            <div>
              <label className="text-xs text-slate-500 uppercase tracking-wider">Notizen</label>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">{document.validationNotes}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
          {onValidate && !document.isValidated && (
            <Button type="button" onClick={onValidate} variant="primary" size="sm">
              Validieren
            </Button>
          )}
          {onDelete && (
            <Button type="button" onClick={onDelete} variant="danger" size="sm">
              Löschen
            </Button>
          )}
          <Button type="button" onClick={onClose} variant="secondary" size="sm">
            Schließen
          </Button>
        </div>
      </div>
    </div>
  );
}
