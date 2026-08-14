import { useState, useCallback, useEffect, useRef } from 'react';
import { OcrResult, VisionModelStatus } from '../types/ocr';

export function useOcr() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [visionStatus, setVisionStatus] = useState<VisionModelStatus>({ available: false, downloaded: false });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const processImage = useCallback(async (imagePath: string): Promise<OcrResult | null> => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    unsubscribeRef.current = window.api.ocr.onProgress((data) => {
      setProgress(data.progress);
    });

    try {
      const result = await window.api.ocr.process(imagePath);
      if (result.success && typeof result.text === 'string') {
        setProgress(100);
        return {
          text: result.text,
          confidence: result.confidence ?? 0,
          source: result.source === 'vision_fallback' ? 'vision_fallback' : 'tesseract',
          date: result.date,
          amount: result.amount,
          currency: result.currency,
        };
      }
      setError(result.error || 'OCR-Fehler');
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR-Fehler');
      return null;
    } finally {
      setIsProcessing(false);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    }
  }, []);

  const checkVisionStatus = useCallback(async () => {
    try {
      const status = await window.api.ocr.visionStatus();
      setVisionStatus(status);
      return status;
    } catch {
      const fallback = { available: false, downloaded: false };
      setVisionStatus(fallback);
      return fallback;
    }
  }, []);

  const downloadModel = useCallback(async () => {
    try {
      const result = await window.api.model.download();
      if (result.success) {
        await checkVisionStatus();
        return true;
      }
      setError(result.error || 'Modell-Download fehlgeschlagen');
      return false;
    } catch {
      return false;
    }
  }, [checkVisionStatus]);

  return {
    isProcessing,
    progress,
    error,
    visionStatus,
    processImage,
    checkVisionStatus,
    downloadModel,
  };
}
