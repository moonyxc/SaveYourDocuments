import { describe, it, expect } from 'vitest';
import { extractMetadata } from '../../src/main/infrastructure/import/metadata-extractor';

describe('Metadata Extractor', () => {
  it('extracts a date from a German invoice text', () => {
    const text = `Rechnungsdatum: 15.03.2025
    Rechnungsnummer: RG-2025-0042
    Firma Muster GmbH
    Gesamtbetrag: 1.250,00 €`;

    const metadata = extractMetadata(text, 'Rechnung.pdf');
    const date = metadata.find((m) => m.field === 'document_date');
    expect(date).toBeDefined();
    expect(date?.value).toBe('2025-03-15');
    expect(date?.confidence).toBeGreaterThanOrEqual(0.80);
  });

  it('extracts an amount', () => {
    const text = `Gesamtbetrag: 1.250,00 €
    Zahlbar bis 30.04.2025`;

    const metadata = extractMetadata(text, 'Rechnung.pdf');
    const amount = metadata.find((m) => m.field === 'amount');
    expect(amount).toBeDefined();
    expect(amount?.value).toBe('125000');
    expect(amount?.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('extracts currency EUR', () => {
    const text = 'Betrag: 500,00 €';
    const metadata = extractMetadata(text, 'test.pdf');
    const currency = metadata.find((m) => m.field === 'currency');
    expect(currency).toBeDefined();
    expect(currency?.value).toBe('EUR');
  });

  it('extracts a document number', () => {
    const text = 'Rechnungsnummer: RG-2025-0042';
    const metadata = extractMetadata(text, 'test.pdf');
    const num = metadata.find((m) => m.field === 'document_number');
    expect(num).toBeDefined();
    expect(num?.value).toBe('RG-2025-0042');
  });

  it('extracts title from filename', () => {
    const metadata = extractMetadata('', 'Mietvertrag-2025.pdf');
    const title = metadata.find((m) => m.field === 'title');
    expect(title).toBeDefined();
    expect(title?.value).toBe('Mietvertrag-2025');
  });

  it('handles empty text gracefully', () => {
    const metadata = extractMetadata('', 'empty.pdf');
    expect(metadata.length).toBeGreaterThanOrEqual(1); // at least title
    const title = metadata.find((m) => m.field === 'title');
    expect(title?.value).toBe('empty');
  });
});