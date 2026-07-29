import { describe, expect, it } from 'vitest';

import {
  categorizeOrganization,
  COMPANY_CATEGORIES,
  COMPANY_CATEGORY_RULESET_VERSION,
  normalizeIndustry,
} from '../src/industry';

describe('industry taxonomy', () => {
  it('does not expose Other as a selectable company category', () => {
    expect(COMPANY_CATEGORIES).not.toContain('Other');
  });

  it('normalizes detailed labels into filterable industries', () => {
    expect(normalizeIndustry('Food cooperative')).toBe('Food');
    expect(normalizeIndustry('Civic technology')).toBe('Technology');
    expect(normalizeIndustry('Accessible transportation')).toBe('Transportation');
    expect(normalizeIndustry('Community energy')).toBe('Energy');
  });

  it('retains Other only when there is no organization to classify', () => {
    expect(normalizeIndustry()).toBe('Other');
    expect(normalizeIndustry('')).toBe('Other');
    expect(normalizeIndustry('Experimental category')).toBe('Other');
  });

  it('normalizes common third-party taxonomies before using name inference', () => {
    expect(
      categorizeOrganization({
        explicitCategory: 'GICS: Health Care Equipment & Services',
        name: 'Northstar Systems',
      }),
    ).toMatchObject({
      category: 'Healthcare',
      confidence: 'HIGH',
      source: 'SOURCE_FIELD',
    });
    expect(
      categorizeOrganization({
        name: 'Northstar Systems',
        thirdPartyCategories: ['NAICS 541511 · Custom Computer Programming Services'],
      }),
    ).toMatchObject({
      category: 'Technology',
      confidence: 'MEDIUM',
      source: 'THIRD_PARTY_CONTEXT',
    });
  });

  it('uses bounded company name and domain rules when provider categories are absent', () => {
    expect(categorizeOrganization({ name: 'Microsoft' })).toMatchObject({
      category: 'Technology',
      confidence: 'HIGH',
      source: 'NAME_OR_DOMAIN',
    });
    expect(
      categorizeOrganization({
        name: 'Harbor Renewable Power Cooperative',
        website: 'harbor-solar.example',
      }),
    ).toMatchObject({
      category: 'Energy',
      confidence: 'MEDIUM',
      source: 'NAME_OR_DOMAIN',
    });
  });

  it('uses a verified Wikidata industry instead of a generic company category', () => {
    expect(
      categorizeOrganization({
        explicitCategory: 'Other',
        name: 'Northstar Systems',
        wikidataCategories: ['enterprise software', 'cloud computing'],
        wikidataConfidence: 'HIGH',
      }),
    ).toEqual({
      category: 'Technology',
      confidence: 'HIGH',
      matchedKeyword: 'software',
      rulesetVersion: COMPANY_CATEGORY_RULESET_VERSION,
      source: 'WIKIDATA',
    });
  });

  it('uses an explainable best-effort category after stronger evidence is exhausted', () => {
    expect(categorizeOrganization({ name: 'Northstar Collective' })).toEqual({
      category: 'Professional Services',
      confidence: 'LOW',
      matchedKeyword: 'best available commercial category',
      rulesetVersion: COMPANY_CATEGORY_RULESET_VERSION,
      source: 'BEST_EFFORT',
    });
    expect(
      categorizeOrganization({
        name: 'Harbor Center',
        organizationType: 'EDUCATION',
      }),
    ).toMatchObject({
      category: 'Education',
      confidence: 'LOW',
      source: 'BEST_EFFORT',
    });
    expect(
      categorizeOrganization({
        name: 'Newco',
        website: 'newco.ai',
      }),
    ).toMatchObject({
      category: 'Technology',
      confidence: 'LOW',
      source: 'BEST_EFFORT',
    });
  });

  it('can defer best-effort classification while a third-party lookup is still available', () => {
    expect(
      categorizeOrganization({
        allowBestEffort: false,
        name: 'Northstar Collective',
      }),
    ).toMatchObject({
      category: 'Other',
      source: 'FALLBACK',
    });
  });
});
