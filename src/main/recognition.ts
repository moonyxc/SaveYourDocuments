import type { Category, DocumentMeta } from '../shared/types';

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  versicherung: [
    'versicherung', 'versicherungsschein', 'police', 'policennummer', 'versicherungsnummer',
    'beitrag', 'schaden', 'schadensmeldung', 'haftpflicht', 'krankenversicherung',
    'lebensversicherung', 'kasko', 'allianz', 'huk', 'ergo', 'aok', 'barmer', 'signal iduna',
    'versicherungsnehmer', 'praemie', 'prämie', 'deckung'
  ],
  kauf: [
    'kaufvertrag', 'kaufbeleg', 'kassenbon', 'quittung', 'beleg', 'garantie', 'garantieschein',
    'bestellung', 'bestellbestaetigung', 'bestellbestätigung', 'lieferung', 'lieferschein',
    'artikel', 'warenkorb', 'zahlungseingang', 'gesamtpreis'
  ],
  vertrag: [
    'vertrag', 'vertragsnummer', 'kundennummer', 'vertragspartner', 'laufzeit',
    'kuendigung', 'kündigung', 'verlaengerung', 'verlängerung', 'mietvertrag',
    'arbeitsvertrag', 'darlehensvertrag', 'vertragsbeginn', 'agb', 'widerruf'
  ],
  behoerde: [
    'behoerde', 'behörde', 'amt', 'bescheid', 'aktenzeichen', 'finanzamt', 'rathaus',
    'einwohnermeldeamt', 'buergerservice', 'bürgerservice', 'steuerbescheid', 'antrag',
    'genehmigung', 'verwaltung', 'bundesamt', 'landratsamt', 'polizei', 'zoll'
  ],
  rechnung: [
    'rechnung', 'rechnungsnummer', 'rechnungsbetrag', 'zahlbar', 'faellig', 'fällig',
    'ueberweisen', 'überweisen', 'iban', 'bic', 'gesamtbetrag', 'nettobetrag', 'bruttobetrag',
    'mwst', 'mehrwertsteuer', 'ust', 'zahlungsziel', 'mahnung', 'rechnungsdatum'
  ],
  sonstiges: []
};

const SUBCATEGORY_HINTS: Record<Category, { label: string; keywords: string[] }[]> = {
  versicherung: [
    { label: 'KFZ', keywords: ['kfz', 'auto', 'fahrzeug', 'kennzeichen', 'kasko'] },
    { label: 'Gesundheit', keywords: ['kranken', 'gesundheit', 'aok', 'barmer', 'zahn'] },
    { label: 'Haftpflicht', keywords: ['haftpflicht'] },
    { label: 'Hausrat', keywords: ['hausrat', 'wohnung'] },
    { label: 'Leben', keywords: ['lebensversicherung', 'rente'] }
  ],
  kauf: [
    { label: 'Elektronik', keywords: ['laptop', 'handy', 'smartphone', 'fernseher', 'computer', 'tablet'] },
    { label: 'Haushalt', keywords: ['kueche', 'küche', 'waschmaschine', 'moebel', 'möbel'] },
    { label: 'Kleidung', keywords: ['jacke', 'hose', 'schuhe', 'shirt'] }
  ],
  vertrag: [
    { label: 'Miete', keywords: ['miete', 'mietvertrag', 'vermieter'] },
    { label: 'Arbeit', keywords: ['arbeitsvertrag', 'arbeitgeber', 'gehalt'] },
    { label: 'Mobilfunk', keywords: ['mobilfunk', 'tarif', 'telefon', 'sim'] },
    { label: 'Energie', keywords: ['strom', 'gas', 'energie', 'versorger'] }
  ],
  behoerde: [
    { label: 'Steuer', keywords: ['steuer', 'finanzamt'] },
    { label: 'Ausweis', keywords: ['personalausweis', 'reisepass', 'führerschein', 'fuehrerschein'] },
    { label: 'Anmeldung', keywords: ['anmeldung', 'ummeldung', 'einwohner'] }
  ],
  rechnung: [
    { label: 'Strom', keywords: ['strom'] },
    { label: 'Internet', keywords: ['internet', 'dsl', 'telekom', 'vodafone'] },
    { label: 'Handy', keywords: ['mobilfunk', 'handy'] },
    { label: 'Miete', keywords: ['miete', 'nebenkosten'] }
  ],
  sonstiges: []
};

const GERMAN_MONTHS: Record<string, number> = {
  'januar': 1, 'februar': 2, 'maerz': 3, 'märz': 3, 'april': 4, 'mai': 5, 'juni': 6,
  'juli': 7, 'august': 8, 'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12,
  'jan': 1, 'feb': 2, 'mae': 3, 'mär': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8,
  'sep': 9, 'sept': 9, 'okt': 10, 'nov': 11, 'dez': 12
};

const KNOWN_COMPANIES = [
  'allianz', 'huk-coburg', 'huk24', 'ergo', 'axa', 'generali', 'gothaer', 'signal iduna',
  'aok', 'barmer', 'techniker krankenkasse', 'tk', 'dak', 'amazon', 'otto', 'zalando',
  'media markt', 'mediamarkt', 'saturn', 'ikea', 'lidl', 'aldi', 'rewe', 'edeka', 'kaufland',
  'telekom', 'vodafone', 'o2', '1&1', 'congstar', 'finanzamt', 'sparkasse', 'volksbank',
  'commerzbank', 'deutsche bank', 'ing', 'paypal', 'ebay', 'check24', 'verivox',
  'rwe', 'eon', 'e.on', 'vattenfall', 'enbw', 'deutsche post', 'dhl', 'hermes', 'ups', 'dpd'
];

function normalize(text: string): string {
  return text.toLowerCase();
}

export function classifyCategory(text: string): Category {
  const n = normalize(text);
  let best: Category = 'sonstiges';
  let bestScore = 0;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (n.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

export function classifySubcategory(text: string, category: Category): string | null {
  const n = normalize(text);
  for (const hint of SUBCATEGORY_HINTS[category]) {
    for (const kw of hint.keywords) {
      if (n.includes(kw)) return hint.label;
    }
  }
  return null;
}

export function extractDate(text: string): string | null {
  let m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (isValidDate(year, month, day)) return toIso(year, month, day);
  }
  m = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    year += year < 70 ? 2000 : 1900;
    if (isValidDate(year, month, day)) return toIso(year, month, day);
  }
  m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (isValidDate(year, month, day)) return toIso(year, month, day);
  }
  m = text.match(/\b(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    const monthName = normalize(m[2]);
    const month = GERMAN_MONTHS[monthName];
    const year = parseInt(m[3], 10);
    if (month && isValidDate(year, month, day)) return toIso(year, month, day);
  }
  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function toIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const NUMBER_PATTERN = '\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d{1,2})?';

const KEYWORD_AMOUNT_REGEX = new RegExp(
  `(?:beitrag|betrag|summe|gesamt(?:betrag)?|rechnungsbetrag|endbetrag|zahlbetrag|betrag\\s+von|preis|praemie|prämie)\\s*[:.]?\\s*(${NUMBER_PATTERN})\\s*(?:€|EUR|Euro)?`,
  'i'
);

const SUFFIX_AMOUNT_REGEX = new RegExp(`(${NUMBER_PATTERN})\\s*(?:€|EUR|Euro)\\b`, 'i');

export function extractAmount(text: string): { amount: number | null; currency: string | null } {
  let m = text.match(KEYWORD_AMOUNT_REGEX);
  if (!m) m = text.match(SUFFIX_AMOUNT_REGEX);
  if (!m) return { amount: null, currency: null };
  const parsed = parseGermanNumber(m[1]);
  if (parsed === null) return { amount: null, currency: null };
  return { amount: parsed, currency: 'EUR' };
}

export function parseGermanNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else if (!/^\d+(\.\d+)?$/.test(s)) {
    return null;
  }
  const value = Number(s);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function extractMeta(text: string): DocumentMeta {
  return {
    date: extractDate(text),
    amount: extractAmount(text).amount,
    currency: extractAmount(text).currency
  };
}

export function detectCompany(text: string, knownNames: string[]): { name: string; isNew: boolean } | null {
  const n = normalize(text);

  for (const known of knownNames) {
    if (known && n.includes(known.toLowerCase())) {
      return { name: known, isNew: false };
    }
  }

  for (const candidate of KNOWN_COMPANIES) {
    if (n.includes(candidate)) {
      const display = candidate
        .split(' ')
        .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(' ');
      return { name: display, isNew: true };
    }
  }

  const suffixMatch = text.match(
    /([A-ZÄÖÜ][A-Za-zäöüÄÖÜß&.\-]*(?:\s+[A-ZÄÖÜ][A-Za-zäöüÄÖÜß&.\-]*){0,3}\s+(?:GmbH|AG|e\.?\s?V\.?|KG|OHG|SE|mbH|GmbH\s*&\s*Co\.?\s*KG))/
  );
  if (suffixMatch) {
    return { name: suffixMatch[1].trim(), isNew: true };
  }

  return null;
}

export function guessTitle(text: string, fileName: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 5 && l.length <= 80);
  if (lines.length > 0) return lines[0];
  return fileName.replace(/\.[^.]+$/, '');
}
