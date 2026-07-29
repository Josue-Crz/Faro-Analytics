import { z } from 'zod';

const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_USER_AGENT =
  'FaroAnalytics/0.1 (https://github.com/Josue-Crz/Faro-Analytics; company-category-enrichment)';

const searchResponseSchema = z.object({
  search: z
    .array(
      z.object({
        description: z.string().optional(),
        id: z.string().regex(/^Q\d+$/),
        label: z.string(),
      }),
    )
    .default([]),
});

const claimSchema = z
  .object({
    mainsnak: z
      .object({
        datavalue: z.object({ value: z.unknown() }).optional(),
      })
      .passthrough(),
    rank: z.enum(['preferred', 'normal', 'deprecated']).optional(),
  })
  .passthrough();

const entitySchema = z
  .object({
    claims: z.record(z.string(), z.array(claimSchema)).default({}),
    descriptions: z
      .record(z.string(), z.object({ language: z.string(), value: z.string() }))
      .default({}),
    labels: z.record(z.string(), z.object({ language: z.string(), value: z.string() })).default({}),
  })
  .passthrough();

const entitiesResponseSchema = z.object({
  entities: z.record(z.string(), entitySchema),
});

export const companyCategoryEnrichmentSchema = z.discriminatedUnion('status', [
  z.object({
    checkedAt: z.string().datetime(),
    confidence: z.enum(['HIGH', 'MEDIUM']),
    entityId: z.string().regex(/^Q\d+$/),
    entityUrl: z.string().url(),
    industries: z.array(z.string().trim().min(1)).min(1),
    matchedBy: z.enum(['DOMAIN', 'EXACT_NAME']),
    provider: z.literal('WIKIDATA'),
    status: z.literal('MATCHED'),
  }),
  z.object({
    checkedAt: z.string().datetime(),
    provider: z.literal('WIKIDATA'),
    status: z.literal('NO_MATCH'),
  }),
]);

export type CompanyCategoryEnrichment = z.infer<typeof companyCategoryEnrichmentSchema>;

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

function normalizedName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function websiteHost(value?: string | null): string {
  if (!value?.trim()) return '';
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname
      .toLocaleLowerCase('en-US')
      .replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sameDomain(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function claimStringValues(entity: z.infer<typeof entitySchema>, property: string): string[] {
  return (entity.claims[property] ?? []).flatMap((claim) => {
    if (claim.rank === 'deprecated') return [];
    const value = claim.mainsnak.datavalue?.value;
    return typeof value === 'string' ? [value] : [];
  });
}

function claimItemIds(entity: z.infer<typeof entitySchema>, property: string): string[] {
  return (entity.claims[property] ?? []).flatMap((claim) => {
    if (claim.rank === 'deprecated') return [];
    const value = claim.mainsnak.datavalue?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const id = (value as Record<string, unknown>).id;
    return typeof id === 'string' && /^Q\d+$/.test(id) ? [id] : [];
  });
}

async function wikidataRequest(
  parameters: Record<string, string>,
  fetcher: Fetcher,
): Promise<unknown> {
  const url = new URL(WIKIDATA_API_URL);
  Object.entries({ ...parameters, format: 'json' }).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  const response = await fetcher(url, {
    headers: {
      'Api-User-Agent': WIKIDATA_USER_AGENT,
      'User-Agent': WIKIDATA_USER_AGENT,
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`WIKIDATA_LOOKUP_FAILED_${response.status}`);
  return response.json();
}

async function entities(
  ids: string[],
  properties: 'claims|descriptions|labels' | 'labels',
  fetcher: Fetcher,
) {
  if (!ids.length) return {};
  const response = await wikidataRequest(
    {
      action: 'wbgetentities',
      ids: ids.join('|'),
      languages: 'en',
      props: properties,
    },
    fetcher,
  );
  return entitiesResponseSchema.parse(response).entities;
}

export function isFreshCompanyCategoryEnrichment(
  enrichment: CompanyCategoryEnrichment,
  now = new Date(),
): boolean {
  const checkedAt = new Date(enrichment.checkedAt);
  const maximumAge =
    enrichment.status === 'MATCHED' ? 30 * 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
  return now.getTime() - checkedAt.getTime() < maximumAge;
}

export async function resolveWikidataCompanyCategory(
  input: { name: string; website?: string | null },
  options: { fetcher?: Fetcher; now?: () => Date } = {},
): Promise<CompanyCategoryEnrichment> {
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const search = searchResponseSchema.parse(
    await wikidataRequest(
      {
        action: 'wbsearchentities',
        language: 'en',
        limit: '5',
        search: input.name.slice(0, 200),
        type: 'item',
        uselang: 'en',
      },
      fetcher,
    ),
  ).search;
  if (!search.length) return { checkedAt, provider: 'WIKIDATA', status: 'NO_MATCH' };

  const candidateEntities = await entities(
    search.map((candidate) => candidate.id),
    'claims|descriptions|labels',
    fetcher,
  );
  const inputHost = websiteHost(input.website);
  const inputName = normalizedName(input.name);
  const viable = search.filter((candidate) => {
    const entity = candidateEntities[candidate.id];
    if (!entity || claimItemIds(entity, 'P452').length === 0) return false;
    if (inputHost) {
      return claimStringValues(entity, 'P856').some((url) => {
        const candidateHost = websiteHost(url);
        return candidateHost ? sameDomain(inputHost, candidateHost) : false;
      });
    }
    const description = entity.descriptions.en?.value ?? candidate.description ?? '';
    return (
      normalizedName(candidate.label) === inputName &&
      /\b(company|corporation|business|manufacturer|brand|enterprise|firm)\b/i.test(description)
    );
  });
  if (viable.length !== 1) return { checkedAt, provider: 'WIKIDATA', status: 'NO_MATCH' };

  const candidate = viable[0]!;
  const entity = candidateEntities[candidate.id]!;
  const industryIds = [...new Set(claimItemIds(entity, 'P452'))].slice(0, 12);
  const industryEntities = await entities(industryIds, 'labels', fetcher);
  const industries = industryIds.flatMap((id) => {
    const label = industryEntities[id]?.labels.en?.value?.trim();
    return label ? [label] : [];
  });
  if (!industries.length) return { checkedAt, provider: 'WIKIDATA', status: 'NO_MATCH' };

  return {
    checkedAt,
    confidence: inputHost ? 'HIGH' : 'MEDIUM',
    entityId: candidate.id,
    entityUrl: `https://www.wikidata.org/wiki/${candidate.id}`,
    industries,
    matchedBy: inputHost ? 'DOMAIN' : 'EXACT_NAME',
    provider: 'WIKIDATA',
    status: 'MATCHED',
  };
}
