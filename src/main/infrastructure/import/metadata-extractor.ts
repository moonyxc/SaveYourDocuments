import type { MetadataCandidate } from '../../../shared/domain/types';

export function extractMetadata(text: string, fileName: string): MetadataCandidate[] {
  const candidates: MetadataCandidate[] = [];
  const normalizedText = text.toLowerCase();
  const lines = text.split(/\n|\r\n?/);

  extractDate(lines, candidates);
  extractAmount(lines, candidates);
  extractCurrency(lines, normalizedText, candidates);
  extractDocumentNumber(lines, candidates);
  extractCompanyName(lines, fileName, candidates);
  extractTitle(fileName, candidates);

  return candidates;
}

function extractDate(lines: string[], candidates: MetadataCandidate[]): void {
  // German date patterns
  const datePatterns = [
    /(?:Rechnungsdatum|Dokumentendatum|datums?|vom|ausgestellt\s*am)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /(?:datum|date)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        const dateStr = normalizeDate(match[1]);
        const confidence = line.toLowerCase().includes('rechnungsdatum') ? 0.95 : 0.80;
        candidates.push({
          id: '',
          documentId: '',
          field: 'document_date',
          value: dateStr,
          confidence,
          location: line,
          rule: 'date_pattern',
        });
        return; // First good match wins
      }
    }
  }
}

function extractAmount(lines: string[], candidates: MetadataCandidate[]): void {
  // German amount patterns
  const amountContexts = [
    /(?:gesamtbetrag|endbetrag|gesamtsumme|rechnungsbetrag|zu zahlen|zahlbetrag|summe|total|betrag)[:\s]*([\d.,]+\s*(?:€|EUR)?)/i,
    /(?:[\d.,]+\s*(?:€|EUR))/,
  ];

  for (const line of lines) {
    for (const pattern of amountContexts) {
      const match = line.match(pattern);
      if (match) {
        const amountStr = match[1] || match[0];
        const cleaned = amountStr.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (!isNaN(num) && num > 0) {
          const confidence = line.toLowerCase().includes('gesamt') || line.toLowerCase().includes('endbetrag') ? 0.95 : 0.75;
          candidates.push({
            id: '',
            documentId: '',
            field: 'amount',
            value: String(Math.round(num * 100)),
            confidence,
            location: line,
            rule: 'amount_pattern',
          });
          return;
        }
      }
    }
  }
}

function extractCurrency(_lines: string[], normalizedText: string, candidates: MetadataCandidate[]): void {
  if (normalizedText.includes('€') || normalizedText.includes('eur') || normalizedText.includes('euro')) {
    candidates.push({
      id: '',
      documentId: '',
      field: 'currency',
      value: 'EUR',
      confidence: 0.95,
      location: null,
      rule: 'currency_symbol',
    });
  } else if (normalizedText.includes('$') || normalizedText.includes('usd')) {
    candidates.push({
      id: '',
      documentId: '',
      field: 'currency',
      value: 'USD',
      confidence: 0.95,
      location: null,
      rule: 'currency_symbol',
    });
  }
}

function extractDocumentNumber(lines: string[], candidates: MetadataCandidate[]): void {
  const patterns = [
    /(?:rechnungs(?:nummer|nr)|rechnungs-nr|invoice\s*(?:number|no|#)|beleg(?:nummer|nr)|vertrags(?:nummer|nr)|kunden(?:nummer|nr))[:\s#]*([\w\d/-]+)/i,
    /(?:rnr|r-nr|rg-nr)[:\s#]*([\w\d/-]+)/i,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        candidates.push({
          id: '',
          documentId: '',
          field: 'document_number',
          value: match[1].trim(),
          confidence: 0.90,
          location: line,
          rule: 'document_number_pattern',
        });
        return;
      }
    }
  }
}

function extractCompanyName(lines: string[], _fileName: string, candidates: MetadataCandidate[]): void {
  // Look for company-like patterns in first few lines
  const firstLines = lines.slice(0, 8);
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 80 && !trimmed.match(/^\d/) && !trimmed.match(/^(rechnung|invoice|quittung|an|von|betreff|datum|sehr|hallo)/i)) {
      // Check if it looks like a company name
      const words = trimmed.split(/\s+/);
      if (words.length >= 1 && words.length <= 5) {
        const hasCapitals = /[A-ZÄÖÜ]/.test(trimmed);
        if (hasCapitals) {
          candidates.push({
            id: '',
            documentId: '',
            field: 'company_name',
            value: trimmed,
            confidence: 0.60,
            location: line,
            rule: 'first_line_company_heuristic',
          });
          return;
        }
      }
    }
  }
}

function extractTitle(fileName: string, candidates: MetadataCandidate[]): void {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  candidates.push({
    id: '',
    documentId: '',
    field: 'title',
    value: withoutExt,
    confidence: 0.95,
    location: null,
    rule: 'filename',
  });
}

function normalizeDate(raw: string): string {
  // Convert various date formats to YYYY-MM-DD
  const cleaned = raw.replace(/[./]/g, '-');
  const parts = cleaned.split('-').map(Number);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // Assume DD-MM-YYYY or DD-MM-YY
    if (a > 12 && b <= 12) {
      const year = c < 100 ? 2000 + c : c;
      return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    // Assume YYYY-MM-DD
    if (a > 1900) {
      return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    }
    // Assume DD-MM-YYYY
    const year = c < 100 ? 2000 + c : c;
    return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  return cleaned;
}