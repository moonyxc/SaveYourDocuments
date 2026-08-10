import path from 'path';
import type { DailyLogger } from './logger';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tiff', '.tif']);

export function isImage(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

export async function extractText(filePath: string, language: string, logger: DailyLogger): Promise<string> {
  if (isImage(filePath)) {
    try {
      const tesseract = await import('tesseract.js');
      const result = await tesseract.recognize(filePath, language);
      const text = result?.data?.text ?? '';
      logger.info('ocr:done', { file: path.basename(filePath), chars: text.length });
      return text;
    } catch (err) {
      logger.error('ocr:failed', { file: path.basename(filePath), error: String(err) });
      return '';
    }
  }
  if (isPdf(filePath)) {
    logger.warn('ocr:pdf-unsupported', { file: path.basename(filePath) });
    return '';
  }
  logger.warn('ocr:unsupported-type', { file: path.basename(filePath) });
  return '';
}
