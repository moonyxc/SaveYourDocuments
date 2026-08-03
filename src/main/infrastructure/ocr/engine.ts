import { createWorker, type Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  engineVersion: string;
}

export class OcrEngine {
  private worker: Worker | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.worker = await createWorker(['deu', 'eng']);
    this.initialized = true;
  }

  async recognize(imageData: Buffer | string): Promise<OcrResult> {
    if (!this.worker) await this.initialize();

    const result = await this.worker!.recognize(imageData);
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      language: 'deu+eng',
      engineVersion: 'tesseract.js@5',
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

export const ocrEngine = new OcrEngine();