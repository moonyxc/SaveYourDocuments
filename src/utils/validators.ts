export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
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

export function validateDate(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string') {
    return `${fieldName} muss ein String sein`;
  }
  const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = value.match(dateRegex);
  if (!match) {
    return `${fieldName} muss im Format YYYY-MM-DD sein`;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return `${fieldName} ist kein gültiges Datum`;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return `${fieldName} ist kein gültiges Datum`;
  }
  return null;
}

const AMOUNT_REGEX = /^-?\d{1,3}(\.\d{3})*,\d{1,2}$|^-?\d+([.,]\d{1,2})?$/;

export function validateAmount(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  let num: number;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!AMOUNT_REGEX.test(trimmed)) {
      return `${fieldName} muss eine gültige Zahl sein`;
    }
    num = parseFloat(trimmed.replace(/\./g, '').replace(',', '.'));
  } else {
    num = value as number;
  }
  if (typeof num !== 'number' || isNaN(num)) {
    return `${fieldName} muss eine gültige Zahl sein`;
  }
  if (num < 0) {
    return `${fieldName} darf nicht negativ sein`;
  }
  return null;
}
