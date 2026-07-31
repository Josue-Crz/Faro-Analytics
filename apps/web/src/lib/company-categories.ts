export interface CompanyIndustryGroup<T> {
  companies: T[];
  companyCount: number;
  contactCount: number;
  industry: string;
}

export const COMPANY_CATEGORY_REFERENCE_SOURCES = Object.freeze({
  gics: {
    href: 'https://www.msci.com/indexes/index-resources/gics',
    label: 'GICS',
  },
  naics: {
    href: 'https://www.census.gov/naics/',
    label: 'NAICS',
  },
  wikidata: {
    href: 'https://www.wikidata.org/wiki/Property:P452',
    label: 'Wikidata industry (P452)',
  },
});

export interface CompanyCategorySourceSummary {
  bestEffort: number;
  importedTaxonomy: number;
  nameOrDomain: number;
  sourceField: number;
  unrecorded: number;
  wikidata: number;
}

export function summarizeCompanyCategorySources(
  sources: Array<string | null | undefined>,
): CompanyCategorySourceSummary {
  const summary: CompanyCategorySourceSummary = {
    bestEffort: 0,
    importedTaxonomy: 0,
    nameOrDomain: 0,
    sourceField: 0,
    unrecorded: 0,
    wikidata: 0,
  };
  sources.forEach((source) => {
    switch (source) {
      case 'SOURCE_FIELD':
        summary.sourceField += 1;
        break;
      case 'THIRD_PARTY_CONTEXT':
        summary.importedTaxonomy += 1;
        break;
      case 'WIKIDATA':
        summary.wikidata += 1;
        break;
      case 'NAME_OR_DOMAIN':
        summary.nameOrDomain += 1;
        break;
      case 'BEST_EFFORT':
      case 'FALLBACK':
        summary.bestEffort += 1;
        break;
      default:
        summary.unrecorded += 1;
    }
  });
  return summary;
}

export function groupCompaniesByIndustry<T>(
  companies: T[],
  getIndustry: (company: T) => string,
  getContactCount: (company: T) => number,
): Array<CompanyIndustryGroup<T>> {
  const groups = new Map<string, CompanyIndustryGroup<T>>();

  companies.forEach((company) => {
    const industry = getIndustry(company).trim() || 'Other';
    const current = groups.get(industry) ?? {
      companies: [],
      companyCount: 0,
      contactCount: 0,
      industry,
    };

    current.companies.push(company);
    current.companyCount += 1;
    current.contactCount += Math.max(0, getContactCount(company));
    groups.set(industry, current);
  });

  return [...groups.values()].sort(
    (left, right) =>
      right.companyCount - left.companyCount || left.industry.localeCompare(right.industry),
  );
}
