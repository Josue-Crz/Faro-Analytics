import { describe, expect, it, vi } from 'vitest';

import {
  isFreshCompanyCategoryEnrichment,
  resolveWikidataCompanyCategory,
} from './company-category-enrichment';

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

describe('Wikidata company category enrichment', () => {
  it('requires and records an official-domain match when a website is available', async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(input);
      expect(new Headers(init?.headers).get('User-Agent')).toContain('FaroAnalytics');
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return response({
          search: [
            {
              description: 'American software company',
              id: 'Q100',
              label: 'Northstar',
            },
          ],
        });
      }
      if (url.searchParams.get('ids') === 'Q100') {
        return response({
          entities: {
            Q100: {
              claims: {
                P452: [{ mainsnak: { datavalue: { value: { id: 'Q200' } } } }],
                P856: [{ mainsnak: { datavalue: { value: 'https://www.northstar.example.com' } } }],
              },
              descriptions: { en: { language: 'en', value: 'American software company' } },
              labels: { en: { language: 'en', value: 'Northstar' } },
            },
          },
        });
      }
      return response({
        entities: {
          Q200: {
            claims: {},
            descriptions: {},
            labels: { en: { language: 'en', value: 'software industry' } },
          },
        },
      });
    });

    await expect(
      resolveWikidataCompanyCategory(
        { name: 'Northstar', website: 'northstar.example.com' },
        { fetcher, now: () => new Date('2026-07-29T12:00:00.000Z') },
      ),
    ).resolves.toEqual({
      checkedAt: '2026-07-29T12:00:00.000Z',
      confidence: 'HIGH',
      entityId: 'Q100',
      entityUrl: 'https://www.wikidata.org/wiki/Q100',
      industries: ['software industry'],
      matchedBy: 'DOMAIN',
      provider: 'WIKIDATA',
      status: 'MATCHED',
    });
  });

  it('rejects an entity whose official website does not match', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return response({
          search: [{ description: 'software company', id: 'Q100', label: 'Northstar' }],
        });
      }
      return response({
        entities: {
          Q100: {
            claims: {
              P452: [{ mainsnak: { datavalue: { value: { id: 'Q200' } } } }],
              P856: [{ mainsnak: { datavalue: { value: 'https://unrelated.example' } } }],
            },
            descriptions: { en: { language: 'en', value: 'software company' } },
            labels: { en: { language: 'en', value: 'Northstar' } },
          },
        },
      });
    });

    await expect(
      resolveWikidataCompanyCategory(
        { name: 'Northstar', website: 'northstar.example.com' },
        { fetcher, now: () => new Date('2026-07-29T12:00:00.000Z') },
      ),
    ).resolves.toEqual({
      checkedAt: '2026-07-29T12:00:00.000Z',
      provider: 'WIKIDATA',
      status: 'NO_MATCH',
    });
  });

  it('accepts one exact company-name match when no website is supplied', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.searchParams.get('action') === 'wbsearchentities') {
        return response({
          search: [
            {
              description: 'renewable energy company',
              id: 'Q300',
              label: 'Harbor Power',
            },
          ],
        });
      }
      if (url.searchParams.get('ids') === 'Q300') {
        return response({
          entities: {
            Q300: {
              claims: {
                P452: [{ mainsnak: { datavalue: { value: { id: 'Q400' } } } }],
              },
              descriptions: { en: { language: 'en', value: 'renewable energy company' } },
              labels: { en: { language: 'en', value: 'Harbor Power' } },
            },
          },
        });
      }
      return response({
        entities: {
          Q400: {
            claims: {},
            descriptions: {},
            labels: { en: { language: 'en', value: 'renewable energy industry' } },
          },
        },
      });
    });

    await expect(
      resolveWikidataCompanyCategory(
        { name: 'Harbor Power' },
        { fetcher, now: () => new Date('2026-07-29T12:00:00.000Z') },
      ),
    ).resolves.toMatchObject({
      confidence: 'MEDIUM',
      industries: ['renewable energy industry'],
      matchedBy: 'EXACT_NAME',
      provider: 'WIKIDATA',
      status: 'MATCHED',
    });
  });

  it('uses shorter negative-cache retention than verified matches', () => {
    expect(
      isFreshCompanyCategoryEnrichment(
        {
          checkedAt: '2026-07-23T12:00:00.000Z',
          provider: 'WIKIDATA',
          status: 'NO_MATCH',
        },
        new Date('2026-07-29T12:00:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isFreshCompanyCategoryEnrichment(
        {
          checkedAt: '2026-07-21T12:00:00.000Z',
          provider: 'WIKIDATA',
          status: 'NO_MATCH',
        },
        new Date('2026-07-29T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});
