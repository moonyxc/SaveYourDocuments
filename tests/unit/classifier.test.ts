import { describe, it, expect } from 'vitest';
import { classifyDocument } from '../../src/main/infrastructure/import/classifier';

describe('Classifier', () => {
  it('classifies a German invoice as purchases/invoice', () => {
    const result = classifyDocument('Rechnung Nr. 12345 Rechnungsdatum 01.01.2025 Gesamtbetrag 100 EUR', []);
    expect(result.category).toBe('purchases');
    expect(result.subCategory).toBe('invoice');
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it('classifies a rental contract', () => {
    const result = classifyDocument('Mietvertrag über Wohnraum Mietdauer unbefristet Kaltmiete 800 EUR', []);
    expect(result.category).toBe('contracts');
    expect(result.subCategory).toBe('rental');
  });

  it('classifies an insurance policy', () => {
    const result = classifyDocument('Versicherungsschein Haftpflichtversicherung Deckungsnachweis', []);
    expect(result.category).toBe('insurance');
    expect(result.subCategory).toBe('policy');
  });

  it('classifies a job contract', () => {
    const result = classifyDocument('Arbeitsvertrag zwischen Arbeitgeber und Arbeitnehmer', []);
    expect(result.category).toBe('work_education');
    expect(result.subCategory).toBe('contract');
  });

  it('classifies a payslip', () => {
    const result = classifyDocument('Lohnabrechnung Januar 2025 Gehaltsabrechnung', []);
    expect(result.category).toBe('work_education');
    expect(result.subCategory).toBe('payslip');
  });

  it('falls back to other for unknown text', () => {
    const result = classifyDocument('xyz abc 123', []);
    expect(result.category).toBe('other');
    expect(result.subCategory).toBeNull();
  });

  it('uses metadata title hints', () => {
    const metadata = [
      { id: '', documentId: '', field: 'title', value: 'Steuerbescheid 2024', confidence: 0.95, location: null, rule: 'filename' },
    ];
    const result = classifyDocument('', metadata);
    expect(result.category).toBe('authorities');
    expect(result.subCategory).toBe('notice');
  });
});