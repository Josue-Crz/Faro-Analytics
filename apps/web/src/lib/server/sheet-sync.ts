import { prisma } from '@faro/database';
import {
  categorizeOrganization,
  type CompanyCategoryInput,
  type CompanyCategoryResult,
} from '@faro/core';
import {
  canonicalizeContactRoleMapping,
  inferHeaderMappings,
  mapContactRowVariants,
  sheetFieldMappingSchema,
  type SheetFieldMapping,
} from '@faro/google-sheets';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { FaroSession } from './auth';
import {
  companyCategoryEnrichmentSchema,
  isFreshCompanyCategoryEnrichment,
  resolveWikidataCompanyCategory,
  type CompanyCategoryEnrichment,
} from './company-category-enrichment';
import { mergeContactCustomFields, storedContactManualOverrides } from './contact-manual-overrides';
import { googleAccessToken } from './google';
import { pruneAutomaticSheetPollRuns } from './sheet-poll-retention';

const googleValuesSchema = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).default([]),
});

export const sheetSyncRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    readRange: z.string().trim().min(1).max(300),
    spreadsheetId: z
      .string()
      .trim()
      .regex(/^[\w-]{10,200}$/),
    worksheetTitle: z.string().trim().min(1).max(200),
    mappings: z.array(sheetFieldMappingSchema).min(1).max(200).optional(),
  })
  .strict();

export type SheetSyncRequest = z.infer<typeof sheetSyncRequestSchema>;
export type SheetSyncTrigger =
  'MANUAL_IMPORT' | 'MANUAL_REFRESH' | 'AUTOMATIC_POLL' | 'OAUTH_RECONNECT';

function syncRunKey(trigger: SheetSyncTrigger, runId: string): string {
  return `${trigger.toLocaleLowerCase('en-US').replaceAll('_', '-')}:${runId}`;
}

async function enforceAutomaticPollRetention(
  trigger: SheetSyncTrigger,
  workspaceId: string,
  connectionId: string,
) {
  if (trigger !== 'AUTOMATIC_POLL') return;
  try {
    await prisma.$transaction((database) =>
      pruneAutomaticSheetPollRuns(database, workspaceId, connectionId),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        component: 'faro-web',
        connectionId,
        error: error instanceof Error ? error.message : 'POLL_RETENTION_FAILED',
        operation: 'prune-sheet-poll-log',
        workspaceId,
      }),
    );
  }
}

const normalize = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');

const thirdPartyCategoryHeaders = new Set([
  'businesscategory',
  'clearbitcategory',
  'companycategory',
  'companyvertical',
  'crunchbasecategories',
  'crunchbasecategory',
  'gicsindustry',
  'gicssector',
  'linkedinindustry',
  'naicsdescription',
  'naicsindustry',
  'organizationcategory',
  'sicdescription',
]);
const MAX_WIKIDATA_LOOKUPS_PER_SYNC = 10;

function pick(row: Record<string, string>, aliases: string[]): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  for (const alias of aliases) {
    const value = normalized.get(normalize(alias))?.trim();
    if (value) return value;
  }
  return '';
}

function stableExternalId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24)}`;
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstEmail(value: string): string | null {
  const email = value
    .split(/[;,\s]+/)
    .find((item) => item.includes('@'))
    ?.toLocaleLowerCase('en-US');
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function canonicalContactType(value?: string) {
  switch (value) {
    case 'PARTICIPANT':
    case 'SPONSOR':
    case 'PARTNER':
    case 'DONOR':
    case 'SPEAKER':
    case 'VENDOR':
      return value;
    default:
      return 'OTHER' as const;
  }
}

type ImportedOrganizationType =
  | 'SPONSOR'
  | 'PARTNER'
  | 'NONPROFIT'
  | 'CORPORATION'
  | 'EDUCATION'
  | 'GOVERNMENT'
  | 'VENDOR'
  | 'OTHER';

function canonicalOrganizationType(
  declaredType: string,
  sourceColumn: string | undefined,
  name: string,
): ImportedOrganizationType {
  const normalizedType = normalize(declaredType);
  const normalizedSource = normalize(sourceColumn ?? '');
  const normalizedName = name.toLocaleLowerCase('en-US');

  if (/\b(university|college|school|academy)\b/i.test(normalizedName)) return 'EDUCATION';
  if (/\b(city of|county of|government|department|public authority)\b/i.test(normalizedName)) {
    return 'GOVERNMENT';
  }
  if (
    /\b(foundation|nonprofit|non-profit|charity|association|alliance|coalition)\b/i.test(
      normalizedName,
    )
  ) {
    return 'NONPROFIT';
  }

  if (normalizedType.includes('nonprofit') || normalizedType === 'ngo') return 'NONPROFIT';
  if (
    normalizedType.includes('education') ||
    normalizedType.includes('university') ||
    normalizedType.includes('school')
  ) {
    return 'EDUCATION';
  }
  if (
    normalizedType.includes('government') ||
    normalizedType.includes('municipal') ||
    normalizedType.includes('publicsector')
  ) {
    return 'GOVERNMENT';
  }
  if (normalizedType.includes('vendor') || normalizedType.includes('supplier')) return 'VENDOR';
  if (normalizedType.includes('partner')) return 'PARTNER';
  if (normalizedType.includes('sponsor')) return 'SPONSOR';
  if (
    normalizedType.includes('corporat') ||
    normalizedType.includes('company') ||
    normalizedType.includes('business') ||
    normalizedType.includes('forprofit')
  ) {
    return 'CORPORATION';
  }

  if (normalizedSource.includes('company') || normalizedSource.includes('business')) {
    return 'CORPORATION';
  }
  if (normalizedSource.includes('sponsor')) return 'SPONSOR';
  if (normalizedSource.includes('partner')) return 'PARTNER';
  if (
    /\b(incorporated|inc\.?|llc|ltd\.?|limited|corp\.?|corporation|company|plc|llp|gmbh)\b/i.test(
      normalizedName,
    )
  ) {
    return 'CORPORATION';
  }
  return 'OTHER';
}

function companyStatus(type: ImportedOrganizationType): boolean | undefined {
  if (type === 'CORPORATION' || type === 'VENDOR') return true;
  if (type === 'NONPROFIT' || type === 'EDUCATION' || type === 'GOVERNMENT') return false;
  return undefined;
}

interface OrganizationRowEvidence {
  categoryInput: CompanyCategoryInput;
  organizationType: ImportedOrganizationType;
  website: string | null;
}

function organizationRowEvidence(
  row: Record<string, string>,
  company: string,
  mappedCategory: string | null,
  mappedCategoryIsThirdParty: boolean,
  organizationNameSource: string | undefined,
): OrganizationRowEvidence {
  const website =
    pick(row, ['Website', 'Website(Update as needed)', 'Company Website', 'Domain']) || null;
  const organizationType = canonicalOrganizationType(
    pick(row, [
      'Company Type',
      'Organization Type',
      'Entity Type',
      'Business Type',
      'Sponsor Type',
    ]),
    organizationNameSource,
    company,
  );
  return {
    categoryInput: {
      description: pick(row, [
        'Company Description',
        'Organization Description',
        'Business Description',
        'About',
        'Description',
      ]),
      explicitCategory:
        pick(row, ['Industry', 'Company Industry', 'Organization Industry', 'Sector']) ||
        (!mappedCategoryIsThirdParty ? mappedCategory : null),
      name: company,
      thirdPartyCategories: [
        mappedCategoryIsThirdParty ? mappedCategory : null,
        pick(row, ['GICS Sector', 'GICS Industry', 'LinkedIn Industry']),
        pick(row, [
          'Company Category',
          'Organization Category',
          'Business Category',
          'Vertical',
          'Company Vertical',
          'Market',
          'Sub-Industry',
          'Subindustry',
        ]),
        pick(row, ['NAICS Description', 'NAICS Industry', 'SIC Description']),
        pick(row, [
          'Crunchbase Category',
          'Crunchbase Categories',
          'Clearbit Category',
          'Categories',
          'Keywords',
        ]),
        pick(row, ['Sponsor Type', 'Organization Type', 'Company Type']),
      ],
      website,
    },
    organizationType,
    website,
  };
}

function storedCompanyCategoryEnrichment(value: unknown): CompanyCategoryEnrichment | null {
  const parsed = companyCategoryEnrichmentSchema.safeParse(
    jsonObject(value).companyCategoryEnrichment,
  );
  return parsed.success ? parsed.data : null;
}

function enrichmentJson(enrichment: CompanyCategoryEnrichment) {
  return enrichment.status === 'MATCHED'
    ? {
        checkedAt: enrichment.checkedAt,
        confidence: enrichment.confidence,
        entityId: enrichment.entityId,
        entityUrl: enrichment.entityUrl,
        industries: enrichment.industries,
        matchedBy: enrichment.matchedBy,
        provider: enrichment.provider,
        status: enrichment.status,
      }
    : {
        checkedAt: enrichment.checkedAt,
        provider: enrichment.provider,
        status: enrichment.status,
      };
}

function followUpInstant(value: string): string | null {
  if (!value.trim()) return null;
  const serial = Number(value);
  const date =
    Number.isFinite(serial) && serial > 0 && serial < 1_000_000
      ? new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonicalChannel(value?: string) {
  switch (value) {
    case 'PHONE':
    case 'SMS':
    case 'MEETING':
    case 'SOCIAL':
    case 'OTHER':
      return value;
    default:
      return 'EMAIL' as const;
  }
}

const categoryConfidenceRank = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const;

function preferredCategory(
  current: CompanyCategoryResult | undefined,
  candidate: CompanyCategoryResult,
): CompanyCategoryResult {
  if (!current) return candidate;
  if (categoryConfidenceRank[candidate.confidence] > categoryConfidenceRank[current.confidence]) {
    return candidate;
  }
  if (current.category === 'Other' && candidate.category !== 'Other') return candidate;
  return current;
}

async function readGoogleRows(userId: string, input: SheetSyncRequest) {
  const token = await googleAccessToken(userId);
  const fullRange = input.readRange.includes('!')
    ? input.readRange
    : `'${input.worksheetTitle.replaceAll("'", "''")}'!${input.readRange}`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(fullRange)}`,
  );
  url.searchParams.set('majorDimension', 'ROWS');
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(response.status === 404 ? 'SHEET_NOT_FOUND' : 'GOOGLE_SHEETS_READ_FAILED');
  const { values } = googleValuesSchema.parse(await response.json());
  const headers = (values[0] ?? []).map(String).slice(0, 200);
  if (headers.length === 0) throw new Error('SHEET_HEADERS_MISSING');
  return {
    headers,
    rows: values
      .slice(1, 5001)
      .map((valuesRow) =>
        Object.fromEntries(
          headers.map((header, column) => [header, String(valuesRow[column] ?? '')]),
        ),
      ),
  };
}

export async function syncGoogleSheet(
  session: FaroSession & { focusedCampaignId?: string | null },
  rawInput: SheetSyncRequest,
  trigger: SheetSyncTrigger = 'MANUAL_IMPORT',
) {
  const input = sheetSyncRequestSchema.parse(rawInput);
  const focusedCampaign =
    session.focusedCampaignId && trigger !== 'AUTOMATIC_POLL'
      ? await prisma.campaign.findFirst({
          select: { id: true, sheetConnectionId: true, status: true },
          where: {
            archivedAt: null,
            id: session.focusedCampaignId,
            workspaceId: session.workspaceId,
          },
        })
      : null;
  if (session.focusedCampaignId && trigger !== 'AUTOMATIC_POLL' && !focusedCampaign) {
    throw new Error('FOCUSED_CAMPAIGN_NOT_FOUND');
  }
  if (focusedCampaign?.status === 'COMPLETED') {
    throw new Error('FOCUSED_CAMPAIGN_COMPLETED');
  }
  const googleCredential = await prisma.googleCredential.findUnique({
    select: { grantedScopes: true },
    where: { userId: session.userId },
  });
  const writeBackEnabled = Boolean(
    googleCredential?.grantedScopes
      .split(/\s+/)
      .includes('https://www.googleapis.com/auth/spreadsheets'),
  );
  const connection = await prisma.sheetConnection.upsert({
    create: {
      credentialReference: `google-user:${session.userId}`,
      displayName: input.displayName,
      headerRow: 1,
      id: randomUUID(),
      readRange: input.readRange,
      spreadsheetId: input.spreadsheetId,
      status: 'ATTEMPTING',
      syncDirection: writeBackEnabled ? 'BIDIRECTIONAL' : 'IMPORT',
      writeBackEnabled,
      workspaceId: session.workspaceId,
      worksheetId: input.worksheetTitle,
    },
    update: {
      credentialReference: `google-user:${session.userId}`,
      displayName: input.displayName,
      lastErrorAt: null,
      lastErrorCode: null,
      readRange: input.readRange,
      status: 'ATTEMPTING',
      syncDirection: writeBackEnabled ? 'BIDIRECTIONAL' : 'IMPORT',
      writeBackEnabled,
    },
    where: {
      workspaceId_spreadsheetId_worksheetId: {
        spreadsheetId: input.spreadsheetId,
        workspaceId: session.workspaceId,
        worksheetId: input.worksheetTitle,
      },
    },
  });
  if (focusedCampaign) {
    if (focusedCampaign.sheetConnectionId !== connection.id) {
      await prisma.$transaction([
        prisma.campaign.update({
          data: { sheetConnectionId: connection.id },
          where: {
            id_workspaceId: {
              id: focusedCampaign.id,
              workspaceId: session.workspaceId,
            },
          },
        }),
        prisma.auditEvent.create({
          data: {
            action: 'CAMPAIGN_DATA_SOURCE_UPDATED',
            actorId: session.userId,
            actorType: 'USER',
            entityId: focusedCampaign.id,
            entityType: 'Campaign',
            id: randomUUID(),
            metadata: {
              previousSheetConnectionId: focusedCampaign.sheetConnectionId,
              sheetConnectionId: connection.id,
              source: 'focused-workspace-import',
            },
            workspaceId: session.workspaceId,
          },
        }),
      ]);
    }
  }
  const startedAt = new Date();
  const runId = randomUUID();
  await prisma.sheetSyncRun.create({
    data: {
      dryRun: false,
      id: runId,
      idempotencyKey: syncRunKey(trigger, runId),
      sheetConnectionId: connection.id,
      startedAt,
      status: 'RUNNING',
      trigger,
      workspaceId: session.workspaceId,
    },
  });
  await enforceAutomaticPollRetention(trigger, session.workspaceId, connection.id);
  try {
    const sheet = await readGoogleRows(session.userId, input);
    const storedMappings = await prisma.sheetFieldMapping.findMany({
      orderBy: { createdAt: 'asc' },
      where: { sheetConnectionId: connection.id, workspaceId: session.workspaceId },
    });
    const mappings: SheetFieldMapping[] = canonicalizeContactRoleMapping(
      input.mappings ??
        (storedMappings.length
          ? storedMappings.map((mapping) =>
              sheetFieldMappingSchema.parse({
                required: mapping.required,
                sourceColumn: mapping.sourceColumn,
                targetField: mapping.targetField,
                transformation: mapping.transformation ?? 'TRIM',
              }),
            )
          : inferHeaderMappings(sheet.headers).map(
              ({ confidence: _confidence, reason: _reason, ...mapping }) => mapping,
            )),
    );
    const categoryMapping = mappings.find(
      (mapping) => mapping.targetField === 'organizationIndustry',
    );
    const organizationNameMapping = mappings.find(
      (mapping) => mapping.targetField === 'organizationName',
    );
    const mappedCategoryIsThirdParty = Boolean(
      categoryMapping && thirdPartyCategoryHeaders.has(normalize(categoryMapping.sourceColumn)),
    );
    const rows = sheet.rows;
    const unresolvedCompanies = new Map<string, { name: string; website: string | null }>();
    const locallyCategorizedOrganizations = new Set<string>();
    for (const row of rows) {
      const mapped = mapContactRowVariants(row, mappings)[0];
      const company = mapped?.contact.organizationName?.trim() || '';
      if (!company) continue;
      const evidence = organizationRowEvidence(
        row,
        company,
        mapped?.contact.organizationIndustry?.trim() || null,
        mappedCategoryIsThirdParty,
        organizationNameMapping?.sourceColumn,
      );
      const externalId = stableExternalId(
        'sheet_org',
        input.spreadsheetId,
        input.worksheetTitle,
        company.toLocaleLowerCase('en-US'),
      );
      if (
        categorizeOrganization({
          ...evidence.categoryInput,
          allowBestEffort: false,
        }).category !== 'Other'
      ) {
        locallyCategorizedOrganizations.add(externalId);
        unresolvedCompanies.delete(externalId);
      } else if (
        companyStatus(evidence.organizationType) !== false &&
        !locallyCategorizedOrganizations.has(externalId)
      ) {
        unresolvedCompanies.set(externalId, { name: company, website: evidence.website });
      }
    }
    const enrichmentByOrganization = new Map<string, CompanyCategoryEnrichment>();
    let wikidataLookups = 0;
    let wikidataLookupFailures = 0;
    if (unresolvedCompanies.size > 0) {
      const existingOrganizations = await prisma.organization.findMany({
        select: { customFields: true, externalId: true },
        where: {
          externalId: { in: [...unresolvedCompanies.keys()] },
          workspaceId: session.workspaceId,
        },
      });
      for (const organization of existingOrganizations) {
        if (!organization.externalId) continue;
        const stored = storedCompanyCategoryEnrichment(organization.customFields);
        if (stored) enrichmentByOrganization.set(organization.externalId, stored);
      }
      if (process.env.FARO_WIKIDATA_ENRICHMENT_ENABLED !== 'false') {
        const lookupCandidates = [...unresolvedCompanies.entries()]
          .filter(([externalId]) => {
            const stored = enrichmentByOrganization.get(externalId);
            return !stored || !isFreshCompanyCategoryEnrichment(stored);
          })
          .slice(0, MAX_WIKIDATA_LOOKUPS_PER_SYNC);
        for (const [externalId, company] of lookupCandidates) {
          try {
            const enrichment = await resolveWikidataCompanyCategory(company);
            const previous = enrichmentByOrganization.get(externalId);
            if (enrichment.status === 'MATCHED' || previous?.status !== 'MATCHED') {
              enrichmentByOrganization.set(externalId, enrichment);
            }
            wikidataLookups += 1;
          } catch {
            wikidataLookupFailures += 1;
            break;
          }
        }
      }
    }
    const result = await prisma.$transaction(async (database) => {
      await database.sheetFieldMapping.deleteMany({
        where: { sheetConnectionId: connection.id, workspaceId: session.workspaceId },
      });
      await database.sheetFieldMapping.createMany({
        data: mappings.map((mapping) => ({
          id: randomUUID(),
          required: mapping.required,
          sheetConnectionId: connection.id,
          sourceColumn: mapping.sourceColumn,
          targetEntity: mapping.targetField.startsWith('customFields.')
            ? 'ContactCustom'
            : 'Contact',
          targetField: mapping.targetField,
          transformation: mapping.transformation,
          workspaceId: session.workspaceId,
        })),
      });
      let rowsCreated = 0;
      let rowsUpdated = 0;
      const rowsSkipped = 0;
      let rowsFailed = 0;
      let followUpsPending = 0;
      const seenContactIds = new Set<string>();
      const seenOrganizationExternalIds = new Set<string>();
      const categoriesByOrganization = new Map<string, CompanyCategoryResult>();
      for (const [index, row] of rows.entries()) {
        const mappedVariants = mapContactRowVariants(row, mappings);
        const mapped = mappedVariants[0]!;
        const company = mapped.contact.organizationName?.trim() || '';
        let organization: { id: string } | null = null;
        let existingOrganization: { customFields: unknown; id: string } | null = null;
        if (company) {
          const organizationExternalId = stableExternalId(
            'sheet_org',
            input.spreadsheetId,
            input.worksheetTitle,
            company.toLocaleLowerCase('en-US'),
          );
          seenOrganizationExternalIds.add(organizationExternalId);
          existingOrganization = await database.organization.findUnique({
            where: {
              workspaceId_externalId: {
                externalId: organizationExternalId,
                workspaceId: session.workspaceId,
              },
            },
            select: { customFields: true, id: true },
          });
          const existingOrganizationFields = existingOrganization
            ? jsonObject(existingOrganization.customFields)
            : {};
          if (existingOrganizationFields.manuallyTrashed === true) {
            organization = existingOrganization;
            continue;
          }
          const rowEvidence = organizationRowEvidence(
            row,
            company,
            mapped.contact.organizationIndustry?.trim() || null,
            mappedCategoryIsThirdParty,
            organizationNameMapping?.sourceColumn,
          );
          const enrichment = enrichmentByOrganization.get(organizationExternalId);
          const wikidataMatch = enrichment?.status === 'MATCHED' ? enrichment : null;
          const category = preferredCategory(
            categoriesByOrganization.get(organizationExternalId),
            categorizeOrganization({
              ...rowEvidence.categoryInput,
              organizationType: rowEvidence.organizationType,
              wikidataCategories: wikidataMatch?.industries,
              wikidataConfidence: wikidataMatch?.confidence,
            }),
          );
          categoriesByOrganization.set(organizationExternalId, category);
          const organizationFields = {
            ...existingOrganizationFields,
            ...(enrichment ? { companyCategoryEnrichment: enrichmentJson(enrichment) } : {}),
            industryClassification: {
              category: category.category,
              confidence: category.confidence,
              matchedKeyword: category.matchedKeyword,
              rulesetVersion: category.rulesetVersion,
              source: category.source,
            },
            outreachStatus: pick(row, ['2027 Outreach Status', 'Outreach Status', 'Status']),
            pastSponsor: pick(row, ['Past Sponsor?', 'Past Sponsor']),
            sheetConnectionId: connection.id,
            sourceRow: index + 2,
            sponsorType: pick(row, ['Sponsor Type', 'Type']),
          };
          organization = await database.organization.upsert({
            create: {
              customFields: organizationFields,
              externalId: organizationExternalId,
              id: randomUUID(),
              industry: category.category,
              name: company,
              tags: ['google-sheets-import'],
              type: rowEvidence.organizationType,
              website: rowEvidence.website,
              workspaceId: session.workspaceId,
            },
            update: {
              customFields: organizationFields,
              industry: category.category,
              name: company,
              deletedAt: null,
              type: rowEvidence.organizationType,
              website: rowEvidence.website,
            },
            where: {
              workspaceId_externalId: {
                externalId: organizationExternalId,
                workspaceId: session.workspaceId,
              },
            },
          });
        }
        for (const mappedContact of mappedVariants) {
          const email = mappedContact.contact.email
            ? firstEmail(mappedContact.contact.email)
            : null;
          const externalId = mappedContact.contact.externalId?.trim() || null;
          const canonicalExternalId =
            externalId ??
            (email
              ? stableExternalId('sheet_contact', input.spreadsheetId, input.worksheetTitle, email)
              : null);
          const firstName = mappedContact.contact.firstName?.trim();
          const lastName = mappedContact.contact.lastName?.trim();
          if (
            (!email && !externalId) ||
            !firstName ||
            !lastName ||
            mappedContact.issues.length > 0
          ) {
            rowsFailed += 1;
            continue;
          }
          const existingContact = await database.contact.findFirst({
            where: {
              OR: [
                ...(email ? [{ email }] : []),
                ...(canonicalExternalId ? [{ externalId: canonicalExternalId }] : []),
              ],
              workspaceId: session.workspaceId,
            },
            select: { customFields: true, id: true },
          });
          const importedFollowUpAt = followUpInstant(
            pick(row, ['Follow-Up Date', 'Follow Up Date', 'Next Follow Up', 'Due Date']),
          );
          const existingFields = jsonObject(existingContact?.customFields);
          const manualOverrides = storedContactManualOverrides(existingFields);
          const importedFollowUpPending = Boolean(
            importedFollowUpAt &&
            existingFields.importedFollowUpActivatedAtValue !== importedFollowUpAt,
          );
          if (importedFollowUpPending) followUpsPending += 1;
          const contactData = {
            customFields: {
              ...mergeContactCustomFields(existingFields, mappedContact.contact.customFields),
              assignedOwnerEmail: session.email,
              importedFollowUpAt,
              importedFollowUpPending,
              sourceRow: index + 2,
            },
            email: manualOverrides ? manualOverrides.email : email,
            externalId: canonicalExternalId,
            firstName: manualOverrides?.firstName ?? firstName,
            lastName: manualOverrides?.lastName ?? lastName,
            organizationId: organization?.id ?? null,
            ownerId: session.userId,
            phone: manualOverrides ? manualOverrides.phone : (mappedContact.contact.phone ?? null),
            preferredChannel:
              manualOverrides?.preferredChannel ??
              canonicalChannel(mappedContact.contact.preferredChannel),
            source: `google-sheets:${connection.id}`,
            tags: mappedContact.contact.tags ?? ['google-sheets-import'],
            timezone:
              manualOverrides?.timezone ?? mappedContact.contact.timezone ?? 'America/Los_Angeles',
            title: manualOverrides ? manualOverrides.title : (mappedContact.contact.title ?? null),
            type: manualOverrides?.type ?? canonicalContactType(mappedContact.contact.type),
            workspaceId: session.workspaceId,
          };
          let contactId: string;
          if (existingContact) {
            await database.contact.update({
              data: { ...contactData, deletedAt: null },
              where: { id: existingContact.id },
            });
            contactId = existingContact.id;
          } else {
            contactId = randomUUID();
            await database.contact.create({
              data: { ...contactData, consentStatus: 'UNKNOWN', id: contactId },
            });
          }
          seenContactIds.add(contactId);
          if (existingOrganization || existingContact) rowsUpdated += 1;
          else rowsCreated += 1;
        }
      }
      const archivedContacts = await database.contact.updateMany({
        data: { deletedAt: new Date() },
        where: {
          deletedAt: null,
          id: { notIn: [...seenContactIds] },
          source: `google-sheets:${connection.id}`,
          workspaceId: session.workspaceId,
        },
      });
      const categoryResults = [...categoriesByOrganization.values()];
      const organizationsCategorized = categoryResults.filter(
        (category) => category.source !== 'FALLBACK',
      ).length;
      const organizationsClassifiedByName = categoryResults.filter(
        (category) => category.source === 'NAME_OR_DOMAIN',
      ).length;
      const organizationsClassifiedByWikidata = categoryResults.filter(
        (category) => category.source === 'WIKIDATA',
      ).length;
      const organizationsClassifiedBestEffort = categoryResults.filter(
        (category) => category.source === 'BEST_EFFORT',
      ).length;
      const organizationsUncategorized = categoryResults.length - organizationsCategorized;
      let archivedOrganizations = 0;
      const importedOrganizations = await database.organization.findMany({
        select: { customFields: true, externalId: true, id: true },
        where: {
          deletedAt: null,
          tags: { has: 'google-sheets-import' },
          workspaceId: session.workspaceId,
        },
      });
      for (const candidate of importedOrganizations) {
        const fields = jsonObject(candidate.customFields);
        if (
          fields.sheetConnectionId !== connection.id ||
          !candidate.externalId ||
          seenOrganizationExternalIds.has(candidate.externalId)
        )
          continue;
        const activeContacts = await database.contact.count({
          where: {
            deletedAt: null,
            organizationId: candidate.id,
            workspaceId: session.workspaceId,
          },
        });
        if (activeContacts === 0) {
          await database.organization.update({
            data: { deletedAt: new Date() },
            where: { id: candidate.id },
          });
          archivedOrganizations += 1;
        }
      }
      const completedAt = new Date();
      await database.sheetSyncRun.update({
        data: {
          completedAt,
          errorSummary: rowsFailed ? `${rowsFailed} rows require mapping or data review` : null,
          rowsCreated,
          rowsFailed,
          rowsRead: rows.length,
          rowsSkipped,
          rowsUpdated,
          status: rowsFailed > 0 ? 'PARTIAL' : 'SUCCEEDED',
        },
        where: { id: runId, workspaceId: session.workspaceId },
      });
      await database.sheetConnection.update({
        data: {
          lastErrorAt: null,
          lastErrorCode: null,
          lastSyncedAt: completedAt,
          status: 'CONNECTED',
        },
        where: { id: connection.id },
      });
      await database.auditEvent.create({
        data: {
          action: 'GOOGLE_SHEET_SYNC_COMPLETED',
          actorId: trigger === 'AUTOMATIC_POLL' ? null : session.userId,
          actorType: trigger === 'AUTOMATIC_POLL' ? 'SYSTEM' : 'USER',
          entityId: connection.id,
          entityType: 'SheetConnection',
          id: randomUUID(),
          metadata: {
            followUpsPending,
            archivedContacts: archivedContacts.count,
            archivedOrganizations,
            organizationsCategorized,
            organizationsClassifiedBestEffort,
            organizationsClassifiedByName,
            organizationsClassifiedByWikidata,
            organizationsUncategorized,
            rowsCreated,
            rowsFailed,
            rowsRead: rows.length,
            rowsSkipped,
            rowsUpdated,
            trigger,
            wikidataLookupFailures,
            wikidataLookups,
          },
          workspaceId: session.workspaceId,
        },
      });
      return {
        followUpsPending,
        archivedContacts: archivedContacts.count,
        archivedOrganizations,
        organizationsCategorized,
        organizationsClassifiedBestEffort,
        organizationsClassifiedByName,
        organizationsClassifiedByWikidata,
        organizationsUncategorized,
        rowsCreated,
        rowsFailed,
        rowsRead: rows.length,
        rowsSkipped,
        rowsUpdated,
        wikidataLookupFailures,
        wikidataLookups,
      };
    });
    await enforceAutomaticPollRetention(trigger, session.workspaceId, connection.id);
    return { connectionId: connection.id, ...result };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SHEET_SYNC_FAILED';
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.sheetSyncRun.update({
        data: { completedAt, errorSummary: errorCode, status: 'FAILED' },
        where: { id: runId, workspaceId: session.workspaceId },
      }),
      prisma.sheetConnection.update({
        data: { lastErrorAt: completedAt, lastErrorCode: errorCode, status: 'SYNC_ISSUE' },
        where: { id: connection.id, workspaceId: session.workspaceId },
      }),
      prisma.auditEvent.create({
        data: {
          action: 'GOOGLE_SHEET_SYNC_FAILED',
          actorId: trigger === 'AUTOMATIC_POLL' ? null : session.userId,
          actorType: trigger === 'AUTOMATIC_POLL' ? 'SYSTEM' : 'USER',
          entityId: connection.id,
          entityType: 'SheetConnection',
          id: randomUUID(),
          metadata: { errorCode, trigger },
          workspaceId: session.workspaceId,
        },
      }),
    ]);
    await enforceAutomaticPollRetention(trigger, session.workspaceId, connection.id);
    throw error;
  }
}
