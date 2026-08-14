// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeFolderName } from '../../electron/services/fileStorage';
import { validateRequired, validateString, validateNumber, validateDate, validateAmount } from '../utils/validators';

describe('File Storage', () => {
  describe('sanitizeFolderName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeFolderName('Test')).toBe('test');
    });

    it('should replace umlauts', () => {
      expect(sanitizeFolderName('Müller')).toBe('mueller');
    });

    it('should replace special characters', () => {
      expect(sanitizeFolderName('Test & Co.')).toBe('test-co');
    });

    it('should handle multiple dashes', () => {
      expect(sanitizeFolderName('test--name')).toBe('test-name');
    });

    it('should handle Windows reserved names', () => {
      expect(sanitizeFolderName('CON')).toBe('_con');
    });

    it('should limit length', () => {
      const longName = 'a'.repeat(100);
      expect(sanitizeFolderName(longName).length).toBeLessThanOrEqual(50);
    });
  });
});

describe('Validators', () => {
  describe('validateRequired', () => {
    it('should return error for empty value', () => {
      expect(validateRequired('', 'Field')).toBe('Field ist erforderlich');
    });

    it('should return null for valid value', () => {
      expect(validateRequired('test', 'Field')).toBeNull();
    });
  });

  describe('validateString', () => {
    it('should return error for too short string', () => {
      expect(validateString('ab', 'Field', 3)).toBe('Field muss mindestens 3 Zeichen lang sein');
    });

    it('should return error for too long string', () => {
      expect(validateString('a'.repeat(1001), 'Field', 0, 1000)).toBe('Field darf maximal 1000 Zeichen lang sein');
    });

    it('should return null for valid string', () => {
      expect(validateString('test', 'Field')).toBeNull();
    });
  });

  describe('validateNumber', () => {
    it('should return error for non-number', () => {
      expect(validateNumber('abc', 'Field')).toBe('Field muss eine Zahl sein');
    });

    it('should return error for number below min', () => {
      expect(validateNumber(5, 'Field', 10)).toBe('Field muss mindestens 10 sein');
    });

    it('should return error for number above max', () => {
      expect(validateNumber(100, 'Field', 0, 50)).toBe('Field darf maximal 50 sein');
    });

    it('should return null for valid number', () => {
      expect(validateNumber(25, 'Field', 0, 50)).toBeNull();
    });
  });

  describe('validateDate', () => {
    it('should return error for invalid format', () => {
      expect(validateDate('15.01.2024', 'Field')).toBe('Field muss im Format YYYY-MM-DD sein');
    });

    it('should return error for invalid date', () => {
      expect(validateDate('2024-13-45', 'Field')).toBe('Field ist kein gültiges Datum');
    });

    it('should return null for valid date', () => {
      expect(validateDate('2024-01-15', 'Field')).toBeNull();
    });
  });

  describe('validateAmount', () => {
    it('should return null for empty value', () => {
      expect(validateAmount('', 'Field')).toBeNull();
    });

    it('should return error for negative amount', () => {
      expect(validateAmount(-10, 'Field')).toBe('Field darf nicht negativ sein');
    });

    it('should return null for valid amount', () => {
      expect(validateAmount(123.45, 'Field')).toBeNull();
    });
  });
});
