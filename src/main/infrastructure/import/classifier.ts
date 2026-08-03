import type { DocumentCategory, MetadataCandidate } from '../../../shared/domain/types';

export interface ClassificationResult {
  category: DocumentCategory;
  subCategory: string | null;
  confidence: number;
}

const CATEGORY_RULES: {
  category: DocumentCategory;
  subCategory: string;
  keywords: string[];
  weight: number;
}[] = [
  // Insurance
  { category: 'insurance', subCategory: 'policy', keywords: ['police', 'versicherungsschein', 'versicherungspolice', 'deckungsnachweis'], weight: 10 },
  { category: 'insurance', subCategory: 'invoice', keywords: ['beitragsrechnung', 'versicherungsbeitrag', 'beitrag', 'versicherungsprämie'], weight: 8 },
  { category: 'insurance', subCategory: 'claim', keywords: ['schadensfall', 'schadenmeldung', 'schadensnummer', 'schadenanzeige'], weight: 10 },
  { category: 'insurance', subCategory: 'correspondence', keywords: ['versicherung', 'versichert'], weight: 3 },

  // Purchases
  { category: 'purchases', subCategory: 'invoice', keywords: ['rechnung', 'rechnungsnummer', 'rechnungsdatum', 'invoice', 'rechnungsbetrag'], weight: 10 },
  { category: 'purchases', subCategory: 'receipt', keywords: ['quittung', 'kassenbon', 'bon', 'zahlungsbeleg', 'receipt'], weight: 10 },
  { category: 'purchases', subCategory: 'warranty', keywords: ['garantie', 'garantieschein', 'garantieurkunde', 'warranty'], weight: 10 },
  { category: 'purchases', subCategory: 'order', keywords: ['bestellung', 'auftragsbestätigung', 'bestellbestätigung', 'order confirmation'], weight: 8 },

  // Contracts
  { category: 'contracts', subCategory: 'rental', keywords: ['mietvertrag', 'mietvertrag', 'vermietung', 'mieter', 'mietdauer'], weight: 10 },
  { category: 'contracts', subCategory: 'mobile', keywords: ['mobilfunk', 'handyvertrag', 'mobilfunkvertrag', 'telefonvertrag'], weight: 10 },
  { category: 'contracts', subCategory: 'energy', keywords: ['stromvertrag', 'gasvertrag', 'energievertrag', 'stromlieferung'], weight: 10 },
  { category: 'contracts', subCategory: 'subscription', keywords: ['abonnement', 'abo', 'mitgliedschaft', 'subscription'], weight: 8 },

  // Authorities
  { category: 'authorities', subCategory: 'notice', keywords: ['bescheid', 'steuerbescheid', 'feststellungsbescheid', 'bewilligungsbescheid'], weight: 10 },
  { category: 'authorities', subCategory: 'application', keywords: ['antrag', 'antragsformular', 'antragstellung', 'anmeldung'], weight: 8 },
  { category: 'authorities', subCategory: 'registration', keywords: ['meldeunterlage', 'meldebescheinigung', 'anmeldebestätigung', 'wohnsitz'], weight: 8 },
  { category: 'authorities', subCategory: 'letter', keywords: ['behörde', 'amt', 'finanzamt', 'stadt', 'gemeinde', 'landkreis'], weight: 4 },

  // Finance
  { category: 'finance', subCategory: 'account', keywords: ['kontoauszug', 'konto', 'kontostand', 'bank', 'sparkasse'], weight: 8 },
  { category: 'finance', subCategory: 'loan', keywords: ['kredit', 'darlehen', 'kreditvertrag', 'finanzierung', 'ratenzahlung'], weight: 10 },
  { category: 'finance', subCategory: 'tax', keywords: ['steuer', 'steuererklärung', 'steuerbeleg', 'einkommensteuer', 'umsatzsteuer'], weight: 8 },
  { category: 'finance', subCategory: 'donation', keywords: ['spende', 'spendenquittung', 'spendenbescheinigung', 'zuwendungsbestätigung'], weight: 10 },

  // Health
  { category: 'health', subCategory: 'invoice', keywords: ['arztrechnung', 'zahnarztrechnung', 'behandlungsrechnung', 'heilbehandlung'], weight: 10 },
  { category: 'health', subCategory: 'report', keywords: ['befund', 'arztbrief', 'diagnose', 'laborbefund', 'untersuchungsergebnis'], weight: 10 },
  { category: 'health', subCategory: 'prescription', keywords: ['rezept', 'verschreibung', 'medikament', 'apotheke'], weight: 10 },
  { category: 'health', subCategory: 'insurance', keywords: ['krankenkasse', 'krankenversicherung', 'gesundheitskarte', 'versichertenkarte'], weight: 8 },

  // Work & Education
  { category: 'work_education', subCategory: 'contract', keywords: ['arbeitsvertrag', 'anstellungsvertrag', 'dienstvertrag', 'arbeitsverhältnis'], weight: 10 },
  { category: 'work_education', subCategory: 'payslip', keywords: ['lohnabrechnung', 'gehaltsabrechnung', 'entgeltabrechnung', 'lohnzettel', 'verdienstabrechnung'], weight: 10 },
  { category: 'work_education', subCategory: 'certificate', keywords: ['zeugnis', 'arbeitszeugnis', 'zertifikat', 'teilnahmebescheinigung', 'diplom'], weight: 8 },
  { category: 'work_education', subCategory: 'certificate', keywords: ['zeugnis', 'schulzeugnis', 'abschlusszeugnis', 'prüfungszeugnis'], weight: 8 },

  // Correspondence
  { category: 'correspondence', subCategory: 'incoming', keywords: ['schreiben', 'brief', 'anschreiben', 'mitteilung', 'information', 'sehr geehrte'], weight: 3 },
  { category: 'correspondence', subCategory: 'reply', keywords: ['antwort', 'rückmeldung', 'stellungnahme', 'erwiderung'], weight: 5 },
  { category: 'correspondence', subCategory: 'note', keywords: ['notiz', 'vermerk', 'aktennotiz', 'gesprächsnotiz'], weight: 5 },
];

export function classifyDocument(
  text: string,
  metadata: MetadataCandidate[],
): ClassificationResult {
  const normalizedText = text.toLowerCase();
  const scores = new Map<string, { category: DocumentCategory; subCategory: string; score: number }>();

  for (const rule of CATEGORY_RULES) {
    const key = `${rule.category}:${rule.subCategory}`;
    for (const keyword of rule.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        const existing = scores.get(key);
        if (existing) {
          existing.score += rule.weight;
        } else {
          scores.set(key, { category: rule.category, subCategory: rule.subCategory, score: rule.weight });
        }
      }
    }
  }

  // Also check metadata hints
  const titleMeta = metadata.find((m) => m.field === 'title');
  if (titleMeta) {
    const titleLower = titleMeta.value.toLowerCase();
    for (const rule of CATEGORY_RULES) {
      for (const keyword of rule.keywords) {
        if (titleLower.includes(keyword.toLowerCase())) {
          const key = `${rule.category}:${rule.subCategory}`;
          const existing = scores.get(key);
          if (existing) {
            existing.score += rule.weight * 1.5;
          } else {
            scores.set(key, { category: rule.category, subCategory: rule.subCategory, score: rule.weight * 1.5 });
          }
        }
      }
    }
  }

  // Find best match
  let best: { category: DocumentCategory; subCategory: string; score: number } | null = null;
  for (const entry of scores.values()) {
    if (!best || entry.score > best.score) {
      best = entry;
    }
  }

  if (best && best.score > 3) {
    return {
      category: best.category,
      subCategory: best.subCategory,
      confidence: Math.min(best.score / 30, 0.95),
    };
  }

  return {
    category: 'other',
    subCategory: null,
    confidence: 0.3,
  };
}