import React, { useState, useEffect } from 'react';
import { Document } from '../../types/document';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { detectCategory, suggestCompany } from '../../utils/categorizer';

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Partial<Document>;
  ocrText: string;
  ocrConfidence: number;
  ocrSource: 'tesseract' | 'vision_fallback';
  onConfirm: (data: Partial<Document>) => void;
  onSkip: () => void;
}

export function ValidationModal({
  isOpen,
  onClose,
  document,
  ocrText,
  ocrConfidence,
  ocrSource,
  onConfirm,
  onSkip,
}: ValidationModalProps) {
  const [formData, setFormData] = useState<Partial<Document>>({});

  useEffect(() => {
    if (isOpen) {
      setFormData({
        documentDate: document.documentDate || '',
        detectedAmount: document.detectedAmount,
        categoryId: document.categoryId,
        companyId: document.companyId,
        tags: document.tags || [],
        validationNotes: '',
        isPaid: document.isPaid || false,
      });
    }
  }, [isOpen, document]);

  const [suggestedCategory, setSuggestedCategory] = useState<string | undefined>();
  const [suggestedCompany, setSuggestedCompany] = useState<string | undefined>();

  useEffect(() => {
    if (ocrText) {
      const category = detectCategory(ocrText);
      const company = suggestCompany(ocrText);
      setSuggestedCategory(category);
      setSuggestedCompany(company);
    }
  }, [ocrText]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ ...formData, isValidated: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">Dokument validieren</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Badge color={ocrSource === 'vision_fallback' ? 'purple' : 'blue'}>
              {ocrSource === 'vision_fallback' ? 'Vision OCR' : 'Tesseract OCR'}
            </Badge>
            <span className="text-sm text-slate-400">
              Konfidenz: {ocrConfidence.toFixed(1)}%
            </span>
          </div>

          <Input
            label="Datum"
            type="date"
            value={formData.documentDate || ''}
            onChange={(e) => setFormData({ ...formData, documentDate: e.target.value })}
          />

          <Input
            label="Betrag"
            type="number"
            step="0.01"
            min="0"
            value={formData.detectedAmount ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              setFormData({ ...formData, detectedAmount: raw === '' ? undefined : parseFloat(raw) });
            }}
          />

          <Select
            label="Kategorie"
            value={formData.categoryId ?? ''}
            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
            options={[
              { value: '', label: 'Kategorie wählen' },
              { value: 1, label: 'Versicherung' },
              { value: 2, label: 'Kauf' },
              { value: 3, label: 'Bank' },
              { value: 4, label: 'Vertrag' },
              { value: 5, label: 'Behörde' },
            ]}
          />
          {suggestedCategory && (
            <p className="text-xs text-blue-400">Vorschlag: {suggestedCategory}</p>
          )}

          <Select
            label="Firma"
            value={formData.companyId ?? ''}
            onChange={(e) => setFormData({ ...formData, companyId: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
            options={[
              { value: '', label: 'Firma wählen' },
              { value: 1, label: 'AOK' },
              { value: 2, label: 'Amazon' },
              { value: 3, label: 'Finanzamt' },
            ]}
          />
          {suggestedCompany && (
            <p className="text-xs text-blue-400">Vorschlag: {suggestedCompany}</p>
          )}

          <Input
            label="Notizen"
            value={formData.validationNotes || ''}
            onChange={(e) => setFormData({ ...formData, validationNotes: e.target.value })}
            placeholder="Optionale Notizen"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPaid"
              checked={formData.isPaid || false}
              onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isPaid" className="text-sm text-slate-300">
              Als bezahlt markieren
            </label>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <Button type="button" onClick={onSkip} variant="ghost" size="sm">
            Überspringen
          </Button>
          <Button type="button" onClick={handleSubmit} variant="primary" size="sm">
            Bestätigen
          </Button>
        </div>
      </div>
    </div>
  );
}
