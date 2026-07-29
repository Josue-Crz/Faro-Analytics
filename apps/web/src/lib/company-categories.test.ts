import { describe, expect, it } from 'vitest';

import { groupCompaniesByIndustry } from './company-categories';

const companies = [
  { contacts: 3, industry: 'Technology', name: 'Northstar Labs' },
  { contacts: 2, industry: 'Food', name: 'Harvest Table' },
  { contacts: 4, industry: 'Technology', name: 'Civic Signal' },
  { contacts: -2, industry: '', name: 'Uncategorized Company' },
];

describe('company industry groups', () => {
  it('groups companies and totals their contact reach', () => {
    const groups = groupCompaniesByIndustry(
      companies,
      (company) => company.industry,
      (company) => company.contacts,
    );

    expect(groups.map((group) => group.industry)).toEqual(['Technology', 'Food', 'Other']);
    expect(groups[0]).toMatchObject({
      companyCount: 2,
      contactCount: 7,
      industry: 'Technology',
    });
  });

  it('uses Other for blank categories and does not count negative contacts', () => {
    const groups = groupCompaniesByIndustry(
      companies,
      (company) => company.industry,
      (company) => company.contacts,
    );
    const other = groups.find((group) => group.industry === 'Other');

    expect(other).toMatchObject({ companyCount: 1, contactCount: 0 });
  });
});
