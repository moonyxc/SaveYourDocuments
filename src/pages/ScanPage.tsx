import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOcr } from '../hooks/useOcr';
import { useDocuments } from '../hooks/useDocuments';
import { DocumentUpload, UploadItem } from '../components/documents/DocumentUpload';
import { ValidationModal } from '../components/documents/ValidationModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Toast } from '../components/common/Toast';
import { Button } from '../components/ui/Button';
import { Document } from '../types/document';

export function ScanPage() {
  const { isProcessing, progress, processImage, visionStatus, checkVisionStatus, downloadModel } = useOcr();
  const { createDocument } = useDocuments();
  const [scannedDocument, setScannedDocument] = useState<Partial<Document> | null>(null);
  const [ocrResult, setOcrResult] = useState<{ text: string; confidence: number; source: 'tesseract' | 'vision_fallback' } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    checkVisionStatus();
  }, [checkVisionStatus]);

  const processOne = useCallback(async (item: UploadItem) => {
    let buffer: ArrayBuffer;

    if (item.file) {
      buffer = await item.file.arrayBuffer();
    } else if (item.path) {
      const readResult = await window.api.readFile(item.path);
      if (!readResult.success || !readResult.data) {
        setToast({ message: `Datei konnte nicht gelesen werden: ${item.name}`, type: 'error' });
        return;
      }
      buffer = readResult.data;
    } else {
      return;
    }

    const saveResult = await window.api.saveFile({ buffer, filename: item.name, metadata: {} });
    if (!saveResult.success || !saveResult.storedFilename) {
      setToast({ message: `Datei konnte nicht gespeichert werden: ${saveResult.error || item.name}`, type: 'error' });
      return;
    }

    const filePath = saveResult.storedFilename;
    const result = await processImage(filePath);
    if (result) {
      setOcrResult({
        text: result.text,
        confidence: result.confidence,
        source: result.source,
      });
      setScannedDocument({
        originalFilename: item.name,
        storedFilename: saveResult.storedFilename,
        fileHash: saveResult.fileHash,
        fileSize: saveResult.fileSize,
        mimeType: saveResult.mimeType,
        documentDate: result.date,
        detectedAmount: result.amount,
        detectedCurrency: result.currency,
        ocrText: result.text,
        ocrConfidence: result.confidence,
        ocrSource: result.source,
      });
    } else {
      setScannedDocument({
        originalFilename: item.name,
        storedFilename: saveResult.storedFilename,
        fileHash: saveResult.fileHash,
        fileSize: saveResult.fileSize,
        mimeType: saveResult.mimeType,
        ocrSource: 'tesseract',
      });
      setOcrResult({ text: '', confidence: 0, source: 'tesseract' });
    }
  }, [processImage]);

  const handleUpload = useCallback((items: UploadItem[]) => {
    for (const item of items) {
      queueRef.current = queueRef.current.then(() => processOne(item));
    }
  }, [processOne]);

  const handleConfirm = async (data: Partial<Document>) => {
    if (scannedDocument) {
      const doc = await createDocument({ ...scannedDocument, ...data });
      if (doc) {
        setToast({ message: 'Dokument gespeichert', type: 'success' });
        setScannedDocument(null);
        setOcrResult(null);
      } else {
        setToast({ message: 'Fehler beim Speichern', type: 'error' });
      }
    }
  };

  const handleSkip = () => {
    setScannedDocument(null);
    setOcrResult(null);
  };

  const handleDownloadModel = async () => {
    const success = await downloadModel();
    if (success) {
      setToast({ message: 'Vision-Modell verfügbar', type: 'success' });
    } else {
      setToast({ message: 'Vision-Modell konnte nicht geladen werden', type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <h3 className="text-base font-semibold text-slate-100 mb-4">Dokument scannen</h3>
        <DocumentUpload onUpload={handleUpload} isProcessing={isProcessing} />
      </div>

      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <LoadingSpinner text="OCR läuft..." />
          <div className="w-64 bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 font-mono">{Math.round(progress)}%</p>
        </div>
      )}

      {!visionStatus.downloaded && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-400">Vision-Modell nicht heruntergeladen</p>
              <p className="text-sm text-amber-400/70 mt-1">
                Für bessere OCR-Ergebnisse kann das Vision-Modell heruntergeladen werden (ca. 6 GB).
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDownloadModel}>
              Herunterladen
            </Button>
          </div>
        </div>
      )}

      {scannedDocument && ocrResult && (
        <ValidationModal
          isOpen={true}
          onClose={handleSkip}
          document={scannedDocument}
          ocrText={ocrResult.text}
          ocrConfidence={ocrResult.confidence}
          ocrSource={ocrResult.source}
          onConfirm={handleConfirm}
          onSkip={handleSkip}
        />
      )}

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
