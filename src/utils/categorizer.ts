export interface CategoryRule {
  keywords: string[];
  subcategories?: Record<string, string[]>;
}

export const CATEGORY_RULES: Record<string, CategoryRule> = {
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
    keywords: ['finanzamt', 'bürgeramt', 'rathaus', 'behörde', 'amt'],
  }
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, keyword: string): boolean {
  const pattern = new RegExp(`(?<![a-zäöüß0-9])${escapeRegex(keyword)}(?![a-zäöüß0-9])`, 'i');
  return pattern.test(text);
}

function countMatches(text: string, keywords: string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    if (matchesKeyword(text, keyword)) {
      count++;
    }
  }
  return count;
}

export function detectCategory(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  let bestMatch: string | undefined;
  let bestScore = 0;

  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    const categoryScore = countMatches(lowerText, rules.keywords);
    if (categoryScore === 0) {
      continue;
    }

    if (rules.subcategories) {
      for (const [subcategory, subKeywords] of Object.entries(rules.subcategories)) {
        const subScore = categoryScore + countMatches(lowerText, subKeywords);
        if (subScore > bestScore) {
          bestScore = subScore;
          bestMatch = subcategory;
        }
      }
    }

    if (categoryScore > bestScore) {
      bestScore = categoryScore;
      bestMatch = category;
    }
  }

  return bestMatch;
}

export function suggestCompany(text: string): string | undefined {
  const companyPatterns: Record<string, string[]> = {
    'AOK': ['aok', 'aok plus', 'aok bayern'],
    'TK': ['techniker krankenkasse'],
    'Barmer': ['barmer'],
    'Amazon': ['amazon', 'amazon.de', 'amazon eu'],
    'Media Markt': ['media markt', 'mediamarkt'],
    'Saturn': ['saturn'],
    'IKEA': ['ikea'],
    'Finanzamt': ['finanzamt'],
    'Sparkasse': ['sparkasse'],
    'Volksbank': ['volksbank', 'vr bank'],
  };

  const lowerText = text.toLowerCase();
  for (const [company, patterns] of Object.entries(companyPatterns)) {
    for (const pattern of patterns) {
      if (matchesKeyword(lowerText, pattern)) {
        return company;
      }
    }
  }
  return undefined;
}
