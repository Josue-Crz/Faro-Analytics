export interface CompanyIndustryGroup<T> {
  companies: T[];
  companyCount: number;
  contactCount: number;
  industry: string;
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
