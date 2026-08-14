// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractDate, extractAmount, detectCategory } from '../../electron/services/ocrEngine';

describe('OCR Engine', () => {
  describe('extractDate', () => {
    it('should extract date in DD.MM.YYYY format', () => {
      const text = 'Rechnung vom 15.01.2024';
      expect(extractDate(text)).toBe('2024-01-15');
    });

    it('should extract date in DD.MM.YY format', () => {
      const text = 'Rechnung vom 15.01.24';
      expect(extractDate(text)).toBe('2024-01-15');
    });

    it('should extract date in YYYY-MM-DD format', () => {
      const text = 'Rechnung vom 2024-01-15';
      expect(extractDate(text)).toBe('2024-01-15');
    });

    it('should extract German month names', () => {
      const text = 'Rechnung vom 15. Januar 2024';
      expect(extractDate(text)).toBe('2024-01-15');
    });

    it('should return undefined for no date', () => {
      const text = 'Kein Datum vorhanden';
      expect(extractDate(text)).toBeUndefined();
    });
  });

  describe('extractAmount', () => {
    it('should extract EUR amount with comma', () => {
      const text = 'Betrag: 123,45 €';
      const result = extractAmount(text);
      expect(result?.amount).toBe(123.45);
      expect(result?.currency).toBe('EUR');
    });

    it('should extract EUR amount with thousand separator', () => {
      const text = 'Betrag: 1.234,56 €';
      const result = extractAmount(text);
      expect(result?.amount).toBe(1234.56);
    });

    it('should extract whole EUR amounts', () => {
      const text = 'Betrag: 123 €';
      const result = extractAmount(text);
      expect(result?.amount).toBe(123);
    });

    it('should return undefined for no amount', () => {
      const text = 'Kein Betrag vorhanden';
      expect(extractAmount(text)).toBeUndefined();
    });
  });

  describe('detectCategory', () => {
    it('should detect Versicherung category', () => {
      const text = 'Ihre Versicherung Police';
      expect(detectCategory(text)).toBe('Versicherung');
    });

    it('should detect Krankenversicherung subcategory', () => {
      const text = 'AOK Krankenkasse Beitrag';
      expect(detectCategory(text)).toBe('Krankenversicherung');
    });

    it('should detect Kauf category', () => {
      const text = 'Rechnung für Ihren Kauf';
      expect(detectCategory(text)).toBe('Kauf');
    });

    it('should return undefined for unknown category', () => {
      const text = 'Unbekannter Text';
      expect(detectCategory(text)).toBeUndefined();
    });
  });
});
