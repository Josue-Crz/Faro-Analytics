import { describe, expect, it } from 'vitest';

import {
  COMPANY_CATEGORY_REFERENCE_SOURCES,
  groupCompaniesByIndustry,
  summarizeCompanyCategorySources,
} from './company-categories';

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

  it('summarizes recorded organization category provenance', () => {
    expect(
      summarizeCompanyCategorySources([
        'SOURCE_FIELD',
        'THIRD_PARTY_CONTEXT',
        'WIKIDATA',
        'NAME_OR_DOMAIN',
        'BEST_EFFORT',
        'FALLBACK',
        null,
      ]),
    ).toEqual({
      bestEffort: 2,
      importedTaxonomy: 1,
      nameOrDomain: 1,
      sourceField: 1,
      unrecorded: 1,
      wikidata: 1,
    });
    expect(COMPANY_CATEGORY_REFERENCE_SOURCES.wikidata.href).toBe(
      'https://www.wikidata.org/wiki/Property:P452',
    );
  });
});
