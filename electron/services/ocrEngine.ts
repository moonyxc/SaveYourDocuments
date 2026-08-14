import { createWorker, Worker } from 'tesseract.js';
import path from 'path';
import fs from 'fs';

export interface OcrResult {
  text: string;
  confidence: number;
  source: 'tesseract' | 'vision_fallback';
  date?: string;
  amount?: number;
  currency?: string;
}

export interface OcrEngineService {
  processImage: (imagePath: string) => Promise<OcrResult>;
  isVisionModelAvailable: () => boolean;
  downloadVisionModel: () => Promise<void>;
  close: () => Promise<void>;
}

const DATE_PATTERNS = [
  /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
  /(\d{1,2})\.(\d{1,2})\.(\d{2})/g,
  /(\d{4})-(\d{2})-(\d{2})/g,
  /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/gi,
];

const AMOUNT_PATTERNS = [
  /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(€|EUR|Euro)/g,
  /(\d+,\d{2})\s*(€|EUR|Euro)/g,
  /EUR\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,
  /(\d+)\s*(€|EUR|Euro)/g,
];

const CATEGORY_RULES: Record<string, { keywords: string[]; subcategories?: Record<string, string[]> }> = {
  'Versicherung': {
    keywords: ['versicherung', 'police', 'beitrag', 'schaden', 'leistung'],
    subcategories: {
      'Krankenversicherung': ['krankenkasse', 'aok', 'tk', 'barmer'],
      'Haftpflicht': ['haftpflicht', 'schadensfall'],
      'KFZ-Versicherung': ['kfz', 'auto', 'fahrzeug'],
    }
  },
  'Kauf': {
    keywords: ['rechnung', 'kauf', 'bestellung', 'quittung', 'kassenbon'],
    subcategories: {
      'Elektronik': ['amazon', 'media markt', 'saturn', 'apple'],
      'Lebensmittel': ['rewe', 'edeka', 'aldi', 'lidl'],
      'Möbel': ['ikea', 'höffner', 'xxxlutz'],
    }
  },
  'Bank': {
    keywords: ['kontoauszug', 'überweisung', 'lastschrift', 'kredit'],
    subcategories: {
      'Girokonto': ['kontoauszug', 'umsätze'],
      'Kreditkarte': ['visa', 'mastercard', 'abrechnung'],
    }
  },
  'Vertrag': {
    keywords: ['vertrag', 'kündigung', 'verlängerung', 'agb'],
  },
  'Behörde': {
    keywords: ['finanzamt', 'bürgeramt', 'rathaus', 'amt', 'behörde'],
  }
};

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function extractDate(text: string): string | undefined {
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const match = matches[0];
      const germanMonthMatch = match.match(/(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/i);
      if (germanMonthMatch) {
        const day = parseInt(germanMonthMatch[1], 10);
        const monthMap: Record<string, number> = {
          'januar': 1, 'februar': 2, 'märz': 3, 'april': 4,
          'mai': 5, 'juni': 6, 'juli': 7, 'august': 8,
          'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12
        };
        const month = monthMap[germanMonthMatch[2].toLowerCase()];
        const year = parseInt(germanMonthMatch[3], 10);
        if (isValidDateParts(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        continue;
      }

      const dotMatch = match.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (dotMatch) {
        const day = parseInt(dotMatch[1], 10);
        const month = parseInt(dotMatch[2], 10);
        let year = parseInt(dotMatch[3], 10);
        if (dotMatch[3].length === 2) {
          year = 2000 + year;
        }
        if (isValidDateParts(year, month, day)) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        continue;
      }

      const isoMatch = match.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10);
        const day = parseInt(isoMatch[3], 10);
        if (isValidDateParts(year, month, day)) {
          return match;
        }
        continue;
      }
    }
  }
  return undefined;
}

function extractAmount(text: string): { amount: number; currency: string } | undefined {
  let best: { amount: number; currency: string } | undefined;
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const numMatch = match[0].match(/(\d{1,3}(?:\.\d{3})*,\d{2})|(\d+,\d{2})|(\d+)/);
      if (numMatch) {
        let numStr = numMatch[0];
        numStr = numStr.replace(/\./g, '').replace(',', '.');
        const amount = parseFloat(numStr);
        if (!isNaN(amount) && amount > 0) {
          if (!best || amount > best.amount) {
            best = { amount, currency: 'EUR' };
          }
        }
      }
    }
  }
  return best;
}

function detectCategory(text: string): string | undefined {
  const lowerText = text.toLowerCase();

  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    for (const keyword of rules.keywords) {
      if (lowerText.includes(keyword)) {
        if (rules.subcategories) {
          for (const [subcategory, subKeywords] of Object.entries(rules.subcategories)) {
            for (const subKeyword of subKeywords) {
              if (lowerText.includes(subKeyword)) {
                return subcategory;
              }
            }
          }
        }
        return category;
      }
    }
  }
  return undefined;
}

export function setupOcrEngine(modelsDir: string): OcrEngineService {
  let worker: Worker | null = null;
  let workerPromise: Promise<Worker> | null = null;
  let visionModelAvailable = false;

  const checkVisionModel = (): boolean => {
    const modelPath = path.join(modelsDir, 'ocr-vision-8b.gguf');
    return fs.existsSync(modelPath);
  };

  visionModelAvailable = checkVisionModel();

  const getWorker = (): Promise<Worker> => {
    if (!workerPromise) {
      workerPromise = createWorker('deu+eng').then((w) => {
        worker = w;
        return w;
      }).catch((err) => {
        workerPromise = null;
        throw err;
      });
    }
    return workerPromise;
  };

  return {
    processImage: async (imagePath: string): Promise<OcrResult> => {
      const worker = await getWorker();
      const result = await worker.recognize(imagePath);
      const text = result.data.text;
      const confidence = result.data.confidence;

      const date = extractDate(text);
      const amountInfo = extractAmount(text);
      const category = detectCategory(text);

      let source: 'tesseract' | 'vision_fallback' = 'tesseract';
      let finalText = text;
      let finalConfidence = confidence;

      const needsVisionFallback = confidence < 70 || (!date && !amountInfo);

      if (needsVisionFallback && visionModelAvailable) {
        source = 'vision_fallback';
        // Vision-Modell ist noch nicht implementiert; Tesseract-Ergebnis bleibt unveraendert.
      }

      return {
        text: finalText,
        confidence: finalConfidence,
        source,
        date,
        amount: amountInfo?.amount,
        currency: amountInfo?.currency,
      };
    },

    isVisionModelAvailable: () => visionModelAvailable,

    downloadVisionModel: async () => {
      visionModelAvailable = checkVisionModel();
      if (!visionModelAvailable) {
        throw new Error('Vision-Modell nicht gefunden. Bitte die Datei ocr-vision-8b.gguf im Modellverzeichnis ablegen.');
      }
    },

    close: async () => {
      if (workerPromise) {
        const w = await workerPromise.catch(() => null);
        if (w) {
          await w.terminate();
        }
        workerPromise = null;
        worker = null;
      }
    },
  };
}

export { extractDate, extractAmount, detectCategory };
