export const COMPANY_CATEGORIES = [
  'Food',
  'Technology',
  'Healthcare',
  'Energy',
  'Financial Services',
  'Consumer Goods',
  'Automotive',
  'Education',
  'Transportation',
  'Manufacturing',
  'Real Estate & Construction',
  'Telecommunications',
  'Hospitality & Travel',
  'Media',
  'Philanthropy',
  'Community Development',
  'Government',
  'Professional Services',
] as const;

export const INDUSTRIES = [...COMPANY_CATEGORIES, 'Other'] as const;
export const COMPANY_CATEGORY_RULESET_VERSION = 'company-category.v4';

export type Industry = (typeof INDUSTRIES)[number];
export type CompanyCategoryConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CompanyCategorySource =
  | 'SOURCE_FIELD'
  | 'THIRD_PARTY_CONTEXT'
  | 'WIKIDATA'
  | 'NAME_OR_DOMAIN'
  | 'BEST_EFFORT'
  | 'FALLBACK';

export interface CompanyCategoryInput {
  allowBestEffort?: boolean;
  description?: string | null;
  explicitCategory?: string | null;
  name: string;
  organizationType?: string | null;
  thirdPartyCategories?: Array<string | null | undefined>;
  website?: string | null;
  wikidataCategories?: Array<string | null | undefined>;
  wikidataConfidence?: Extract<CompanyCategoryConfidence, 'HIGH' | 'MEDIUM'>;
}

export interface CompanyCategoryResult {
  category: Industry;
  confidence: CompanyCategoryConfidence;
  matchedKeyword: string | null;
  rulesetVersion: typeof COMPANY_CATEGORY_RULESET_VERSION;
  source: CompanyCategorySource;
}

interface CategoryRule {
  category: Exclude<Industry, 'Other'>;
  keywords: RegExp;
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: 'Healthcare',
    keywords:
      /\b(health(?:care)?|medical|medicine|hospital|clinic|pharma(?:ceutical)?|biotech|life sciences?|therapeutic|diagnostic|dental|wellness)\b/i,
  },
  {
    category: 'Financial Services',
    keywords:
      /\b(financial|finance|bank(?:ing)?|credit union|fintech|payments?|insurance|investment|capital management|wealth|mortgage|lending|crypto(?:currency)?|blockchain)\b/i,
  },
  {
    category: 'Energy',
    keywords:
      /\b(energy|climate tech|cleantech|renewable|solar|wind power|utility|utilities|electric power|battery storage|oil|gas|petroleum)\b/i,
  },
  {
    category: 'Food',
    keywords:
      /\b(food|grocery|restaurant|agriculture|agricultural|farm(?:ing)?|beverage|coffee|catering|nutrition|dairy|bakery)\b/i,
  },
  {
    category: 'Automotive',
    keywords:
      /\b(automotive|automobile|car maker|vehicle manufacturer|electric vehicles?|ev manufacturer|motor company)\b/i,
  },
  {
    category: 'Telecommunications',
    keywords:
      /\b(telecom(?:munications)?|wireless carrier|mobile network|broadband|fiber network|internet service provider|cable provider)\b/i,
  },
  {
    category: 'Education',
    keywords:
      /\b(education|learning|school|university|college|academy|edtech|curriculum|student|training provider)\b/i,
  },
  {
    category: 'Transportation',
    keywords:
      /\b(transport(?:ation)?|mobility|transit|logistics|shipping|freight|delivery network|airline|railway|railroad|rideshare)\b/i,
  },
  {
    category: 'Real Estate & Construction',
    keywords:
      /\b(real estate|property management|construction|homebuilder|housing developer|architecture|commercial property|realty)\b/i,
  },
  {
    category: 'Hospitality & Travel',
    keywords: /\b(hospitality|hotel|resort|travel|tourism|lodging|vacation rental|cruise line)\b/i,
  },
  {
    category: 'Manufacturing',
    keywords:
      /\b(manufactur(?:e|er|ing)|industrial|factory|machinery|aerospace|defense contractor|materials|chemical company|packaging)\b/i,
  },
  {
    category: 'Technology',
    keywords:
      /\b(technology|software|saas|cloud computing|computer programming|information technology|it services|data platform|analytics|digital platform|cybersecurity|semiconductor|artificial intelligence|machine learning|developer tools?|civic tech|tech)\b/i,
  },
  {
    category: 'Media',
    keywords:
      /\b(media|publishing|journalism|broadcast|entertainment|streaming|music|film|television|advertising network|news)\b/i,
  },
  {
    category: 'Consumer Goods',
    keywords:
      /\b(consumer|retail|apparel|fashion|outdoor goods|sporting goods|ecommerce|e-commerce|beauty|cosmetics|household goods|personal care)\b/i,
  },
  {
    category: 'Philanthropy',
    keywords: /\b(philanthrop(?:y|ic)|foundation|charit(?:y|able)|grantmaking|grant maker)\b/i,
  },
  {
    category: 'Government',
    keywords:
      /\b(government|public sector|municipal|municipality|city of|county of|state agency|federal agency|public authority)\b/i,
  },
  {
    category: 'Community Development',
    keywords:
      /\b(community|nonprofit|non-profit|civic|economic development|neighborhood|social impact|ngo|association|alliance)\b/i,
  },
  {
    category: 'Professional Services',
    keywords:
      /\b(professional services|consulting|legal|law firm|accounting|staffing|recruiting|marketing agency|design agency|public relations|advisory)\b/i,
  },
];

const KNOWN_ORGANIZATION_CATEGORIES: ReadonlyArray<{
  category: Exclude<Industry, 'Other'>;
  names: readonly string[];
}> = [
  {
    category: 'Technology',
    names: [
      'adobe',
      'alphabet',
      'amazon web services',
      'amd',
      'apple',
      'github',
      'google',
      'ibm',
      'intel',
      'meta',
      'microsoft',
      'nvidia',
      'oracle',
      'salesforce',
    ],
  },
  {
    category: 'Financial Services',
    names: [
      'american express',
      'bank of america',
      'chase',
      'coinbase',
      'jpmorgan',
      'mastercard',
      'paypal',
      'stripe',
      'visa',
      'wells fargo',
    ],
  },
  {
    category: 'Consumer Goods',
    names: [
      'adidas',
      'costco',
      'ikea',
      'nike',
      'patagonia',
      'procter gamble',
      'target',
      'unilever',
      'walmart',
    ],
  },
  {
    category: 'Media',
    names: ['disney', 'netflix', 'new york times', 'spotify', 'warner bros'],
  },
  {
    category: 'Food',
    names: ['coca cola', 'doordash', 'pepsico', 'starbucks', 'whole foods'],
  },
  {
    category: 'Automotive',
    names: ['bmw', 'ford', 'general motors', 'honda', 'tesla', 'toyota', 'volkswagen'],
  },
  {
    category: 'Transportation',
    names: ['delta air lines', 'fedex', 'lyft', 'uber', 'united airlines', 'ups'],
  },
  {
    category: 'Telecommunications',
    names: ['att', 'comcast', 't mobile', 'verizon'],
  },
  {
    category: 'Healthcare',
    names: ['kaiser permanente', 'moderna', 'pfizer', 'unitedhealth'],
  },
  {
    category: 'Hospitality & Travel',
    names: ['airbnb', 'expedia', 'hilton', 'marriott'],
  },
  {
    category: 'Education',
    names: ['coursera', 'khan academy'],
  },
  {
    category: 'Real Estate & Construction',
    names: ['cbre', 'zillow'],
  },
];

function normalizedEvidence(value?: string | null): string {
  return (
    value
      ?.trim()
      .toLocaleLowerCase('en-US')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}

function canonicalCategory(value?: string | null): Industry | null {
  const normalized = normalizedEvidence(value);
  return INDUSTRIES.find((industry) => normalizedEvidence(industry) === normalized) ?? null;
}

function categoryFromRules(value?: string | null): {
  category: Exclude<Industry, 'Other'>;
  matchedKeyword: string;
} | null {
  const normalized = normalizedEvidence(value);
  if (!normalized) return null;
  for (const rule of CATEGORY_RULES) {
    const match = normalized.match(rule.keywords);
    if (match?.[1] || match?.[0]) {
      return {
        category: rule.category,
        matchedKeyword: (match[1] ?? match[0]).toLocaleLowerCase('en-US'),
      };
    }
  }
  return null;
}

function knownCategoryFromName(value: string): {
  category: Exclude<Industry, 'Other'>;
  matchedKeyword: string;
} | null {
  const normalized = normalizedEvidence(value);
  if (!normalized) return null;
  for (const group of KNOWN_ORGANIZATION_CATEGORIES) {
    const knownName = group.names.find(
      (name) => normalized === name || normalized.startsWith(`${name} `),
    );
    if (knownName) return { category: group.category, matchedKeyword: knownName };
  }
  return null;
}

function websiteHost(value?: string | null): string {
  if (!value?.trim()) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    return value.slice(0, 200);
  }
}

function bestEffortCategory(input: CompanyCategoryInput): {
  category: Exclude<Industry, 'Other'>;
  matchedKeyword: string;
} | null {
  if (!normalizedEvidence(input.name)) return null;

  const host = websiteHost(input.website).toLocaleLowerCase('en-US');
  const domainCategory = [
    {
      category: 'Education' as const,
      pattern: /\.(?:edu|ac\.[a-z]{2})$/,
      reason: 'education domain',
    },
    {
      category: 'Government' as const,
      pattern: /\.gov(?:\.[a-z]{2})?$/,
      reason: 'government domain',
    },
    {
      category: 'Technology' as const,
      pattern: /\.(?:ai|app|cloud|dev|io|software|tech)$/,
      reason: 'technology domain',
    },
    {
      category: 'Consumer Goods' as const,
      pattern: /\.(?:shop|store)$/,
      reason: 'retail domain',
    },
    {
      category: 'Community Development' as const,
      pattern: /\.org$/,
      reason: 'noncommercial domain',
    },
  ].find((entry) => entry.pattern.test(host));
  if (domainCategory) {
    return {
      category: domainCategory.category,
      matchedKeyword: domainCategory.reason,
    };
  }

  switch (normalizedEvidence(input.organizationType)) {
    case 'education':
      return { category: 'Education', matchedKeyword: 'organization type: education' };
    case 'government':
      return { category: 'Government', matchedKeyword: 'organization type: government' };
    case 'nonprofit':
      return {
        category: 'Community Development',
        matchedKeyword: 'organization type: nonprofit',
      };
    default:
      return {
        category: 'Professional Services',
        matchedKeyword: 'best available commercial category',
      };
  }
}

function result(
  category: Industry,
  confidence: CompanyCategoryConfidence,
  source: CompanyCategorySource,
  matchedKeyword: string | null,
): CompanyCategoryResult {
  return {
    category,
    confidence,
    matchedKeyword,
    rulesetVersion: COMPANY_CATEGORY_RULESET_VERSION,
    source,
  };
}

/**
 * Resolves third-party organization taxonomies into one stable Faro company
 * category. Explicit source data wins, then provider context, then bounded
 * name/domain rules, then a low-confidence category derived from organization
 * type or domain. No external lookup or AI inference is performed here.
 */
export function categorizeOrganization(input: CompanyCategoryInput): CompanyCategoryResult {
  const explicitCanonical = canonicalCategory(input.explicitCategory);
  if (explicitCanonical && explicitCanonical !== 'Other') {
    return result(explicitCanonical, 'HIGH', 'SOURCE_FIELD', explicitCanonical);
  }
  const explicitMatch = categoryFromRules(input.explicitCategory);
  if (explicitMatch) {
    return result(explicitMatch.category, 'HIGH', 'SOURCE_FIELD', explicitMatch.matchedKeyword);
  }

  const thirdPartyContext = [input.description, ...(input.thirdPartyCategories ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
  const contextMatch = categoryFromRules(thirdPartyContext);
  if (contextMatch) {
    return result(
      contextMatch.category,
      'MEDIUM',
      'THIRD_PARTY_CONTEXT',
      contextMatch.matchedKeyword,
    );
  }

  const wikidataMatch = categoryFromRules(
    (input.wikidataCategories ?? [])
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' '),
  );
  if (wikidataMatch) {
    return result(
      wikidataMatch.category,
      input.wikidataConfidence ?? 'MEDIUM',
      'WIKIDATA',
      wikidataMatch.matchedKeyword,
    );
  }

  const nameAndDomain = `${input.name} ${websiteHost(input.website)}`;
  const knownName = knownCategoryFromName(nameAndDomain);
  if (knownName) {
    return result(knownName.category, 'HIGH', 'NAME_OR_DOMAIN', knownName.matchedKeyword);
  }
  const nameMatch = categoryFromRules(nameAndDomain);
  if (nameMatch) {
    return result(nameMatch.category, 'MEDIUM', 'NAME_OR_DOMAIN', nameMatch.matchedKeyword);
  }

  if (input.allowBestEffort !== false) {
    const bestEffort = bestEffortCategory(input);
    if (bestEffort) {
      return result(bestEffort.category, 'LOW', 'BEST_EFFORT', bestEffort.matchedKeyword);
    }
  }

  return result('Other', 'LOW', 'FALLBACK', null);
}

/**
 * Backwards-compatible single-field normalization for callers that only have
 * a provider industry value.
 */
export function normalizeIndustry(value?: string | null): Industry {
  return categorizeOrganization({ explicitCategory: value, name: '' }).category;
}
