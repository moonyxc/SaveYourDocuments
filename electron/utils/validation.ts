import path from 'path';

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') {
    return `${fieldName} ist erforderlich`;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return `${fieldName} ist erforderlich`;
  }
  return null;
}

export function validateString(value: unknown, fieldName: string, minLength = 0, maxLength = 1000): string | null {
  if (typeof value !== 'string') {
    return `${fieldName} muss ein String sein`;
  }
  if (value.length < minLength) {
    return `${fieldName} muss mindestens ${minLength} Zeichen lang sein`;
  }
  if (value.length > maxLength) {
    return `${fieldName} darf maximal ${maxLength} Zeichen lang sein`;
  }
  return null;
}

export function validateNumber(value: unknown, fieldName: string, min?: number, max?: number): string | null {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} muss eine Zahl sein`;
  }
  if (min !== undefined && value < min) {
    return `${fieldName} muss mindestens ${min} sein`;
  }
  if (max !== undefined && value > max) {
    return `${fieldName} darf maximal ${max} sein`;
  }
  return null;
}

export function validateEmail(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string') {
    return `${fieldName} muss ein String sein`;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return `${fieldName} muss eine gültige E-Mail-Adresse sein`;
  }
  return null;
}

export function validateUuid(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string') {
    return `${fieldName} muss ein String sein`;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    return `${fieldName} muss eine gültige UUID sein`;
  }
  return null;
}

export function validateId(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return `${fieldName} muss eine positive ganze Zahl sein`;
  }
  return null;
}

export function validateFilename(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Dateiname ist erforderlich';
  }
  if (value.includes('..') || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    return 'Dateiname enthält ungültige Zeichen';
  }
  if (value.length > 255) {
    return 'Dateiname ist zu lang';
  }
  return null;
}

export function validateFileType(filename: string, allowedTypes: string[]): string | null {
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  if (!ext || !allowedTypes.includes(ext)) {
    return `Dateityp .${ext || '(keine)'} ist nicht erlaubt. Erlaubt: ${allowedTypes.join(', ')}`;
  }
  return null;
}

export function validateFileSize(size: number, maxSizeMB: number): string | null {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (size > maxSizeBytes) {
    return `Datei ist zu groß. Maximum: ${maxSizeMB} MB`;
  }
  return null;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) {
    return false;
  }
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === value;
}

const FILTER_KEYS = new Set(['categoryId', 'companyId', 'isPaid', 'isValidated', 'dateFrom', 'dateTo', 'limit']);

export function validateFilters(filters?: Record<string, unknown>): Record<string, unknown> {
  if (!filters || typeof filters !== 'object') {
    return {};
  }
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(filters)) {
    if (!FILTER_KEYS.has(key)) {
      continue;
    }
    const value = filters[key];
    switch (key) {
      case 'categoryId':
      case 'companyId':
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          clean[key] = value;
        }
        break;
      case 'isPaid':
      case 'isValidated':
        if (typeof value === 'boolean') {
          clean[key] = value;
        }
        break;
      case 'dateFrom':
      case 'dateTo':
        if (typeof value === 'string' && isValidDateString(value)) {
          clean[key] = value;
        }
        break;
      case 'limit':
        if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 10000) {
          clean[key] = value;
        }
        break;
    }
  }
  return clean;
}

const UPDATE_KEYS = new Set([
  'originalFilename', 'ocrText', 'ocrConfidence', 'detectedDate', 'detectedAmount',
  'detectedCurrency', 'categoryId', 'companyId', 'tags', 'customMetadata',
  'isPaid', 'isValidated', 'validationNotes', 'documentDate',
]);

export function validateDocumentUpdates(updates?: Record<string, unknown>): Record<string, unknown> {
  if (!updates || typeof updates !== 'object') {
    return {};
  }
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    if (!UPDATE_KEYS.has(key)) {
      continue;
    }
    const value = updates[key];
    switch (key) {
      case 'originalFilename':
      case 'ocrText':
      case 'validationNotes':
        if (typeof value === 'string' || value === null || value === undefined) {
          clean[key] = value ?? null;
        }
        break;
      case 'ocrConfidence':
      case 'detectedAmount':
        if (typeof value === 'number' && !isNaN(value)) {
          clean[key] = value;
        } else if (value === null || value === undefined) {
          clean[key] = null;
        }
        break;
      case 'detectedDate':
      case 'documentDate':
        if (typeof value === 'string' && isValidDateString(value)) {
          clean[key] = value;
        } else if (value === null || value === undefined || value === '') {
          clean[key] = null;
        }
        break;
      case 'detectedCurrency':
        if (typeof value === 'string' && /^[A-Z]{3}$/.test(value)) {
          clean[key] = value;
        } else if (value === null || value === undefined) {
          clean[key] = null;
        }
        break;
      case 'categoryId':
      case 'companyId':
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          clean[key] = value;
        } else if (value === null || value === undefined) {
          clean[key] = null;
        }
        break;
      case 'tags':
        if (Array.isArray(value)) {
          clean[key] = value.filter((t) => typeof t === 'string');
        }
        break;
      case 'customMetadata':
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          clean[key] = value;
        }
        break;
      case 'isPaid':
      case 'isValidated':
        clean[key] = Boolean(value);
        break;
    }
  }
  return clean;
}
