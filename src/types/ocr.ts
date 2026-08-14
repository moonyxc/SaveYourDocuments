export interface OcrResult {
  text: string;
  confidence: number;
  source: 'tesseract' | 'vision_fallback';
  date?: string;
  amount?: number;
  currency?: string;
}

export interface OcrProgress {
  jobId: string;
  progress: number;
}

export interface VisionModelStatus {
  available: boolean;
  downloaded: boolean;
}

export interface ModelDownloadProgress {
  percent: number;
  eta: string;
}
