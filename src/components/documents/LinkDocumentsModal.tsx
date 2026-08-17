import React, { useState, useEffect } from 'react';
import { Document } from '../../types/document';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

interface LinkDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceDocument: Document;
  availableDocuments: Document[];
  onLink: (sourceId: number, targetId: number, linkType: string) => void;
}

export function LinkDocumentsModal({
  isOpen,
  onClose,
  sourceDocument,
  availableDocuments,
  onLink,
}: LinkDocumentsModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<number | ''>('');
  const [linkType, setLinkType] = useState<string>('related');

  useEffect(() => {
    if (isOpen) {
      setSelectedTarget('');
      setLinkType('related');
    }
  }, [isOpen, sourceDocument.id]);

  const handleSubmit = () => {
    if (selectedTarget !== '') {
      onLink(sourceDocument.id, selectedTarget, linkType);
      onClose();
    }
  };

  const filteredDocuments = availableDocuments.filter((d) => d.id !== sourceDocument.id);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dokumente verknüpfen" size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Quelldokument</label>
          <p className="text-sm text-slate-200 mt-1">{sourceDocument.originalFilename}</p>
        </div>

        <Select
          label="Zieldokument"
          value={selectedTarget === '' ? '' : String(selectedTarget)}
          onChange={(e) => setSelectedTarget(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          options={[
            { value: '', label: 'Dokument wählen' },
            ...filteredDocuments.map((d) => ({
              value: String(d.id),
              label: d.originalFilename || `Dokument #${d.id}`,
            })),
          ]}
        />

        <Select
          label="Verknüpfungstyp"
          value={linkType}
          onChange={(e) => setLinkType(e.target.value)}
          options={[
            { value: 'related', label: 'Verwandt' },
            { value: 'response', label: 'Antwort' },
            { value: 'attachment', label: 'Anhang' },
            { value: 'reminder', label: 'Erinnerung' },
          ]}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" onClick={onClose} variant="secondary" size="sm">
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSubmit} variant="primary" size="sm" disabled={selectedTarget === ''}>
            Verknüpfen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
