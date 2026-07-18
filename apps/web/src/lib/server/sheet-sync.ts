import { prisma } from '@faro/database';
import {
  inferHeaderMappings,
  mapContactRowVariants,
  sheetFieldMappingSchema,
  type SheetFieldMapping,
} from '@faro/google-sheets';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { FaroSession } from './auth';
import { googleAccessToken } from './google';

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

const normalize = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');

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
  session: FaroSession,
  rawInput: SheetSyncRequest,
  trigger: SheetSyncTrigger = 'MANUAL_IMPORT',
) {
  const input = sheetSyncRequestSchema.parse(rawInput);
  const connection = await prisma.sheetConnection.upsert({
    create: {
      credentialReference: `google-user:${session.userId}`,
      displayName: input.displayName,
      headerRow: 1,
      id: randomUUID(),
      readRange: input.readRange,
      spreadsheetId: input.spreadsheetId,
      status: 'NEEDS_AUTH',
      syncDirection: 'IMPORT',
      workspaceId: session.workspaceId,
      worksheetId: input.worksheetTitle,
    },
    update: {
      credentialReference: `google-user:${session.userId}`,
      displayName: input.displayName,
      readRange: input.readRange,
    },
    where: {
      workspaceId_spreadsheetId_worksheetId: {
        spreadsheetId: input.spreadsheetId,
        workspaceId: session.workspaceId,
        worksheetId: input.worksheetTitle,
      },
    },
  });
  const startedAt = new Date();
  const runId = randomUUID();
  try {
    const sheet = await readGoogleRows(session.userId, input);
    const storedMappings = await prisma.sheetFieldMapping.findMany({
      orderBy: { createdAt: 'asc' },
      where: { sheetConnectionId: connection.id, workspaceId: session.workspaceId },
    });
    const mappings: SheetFieldMapping[] =
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
          ));
    const rows = sheet.rows;
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
          organization = await database.organization.upsert({
            create: {
              customFields: {
                outreachStatus: pick(row, ['2027 Outreach Status', 'Outreach Status', 'Status']),
                pastSponsor: pick(row, ['Past Sponsor?', 'Past Sponsor']),
                sheetConnectionId: connection.id,
                sourceRow: index + 2,
                sponsorType: pick(row, ['Sponsor Type', 'Type']),
              },
              externalId: organizationExternalId,
              id: randomUUID(),
              name: company,
              tags: ['google-sheets-import'],
              type: 'OTHER',
              website: pick(row, ['Website', 'Website(Update as needed)']) || null,
              workspaceId: session.workspaceId,
            },
            update: {
              customFields: {
                outreachStatus: pick(row, ['2027 Outreach Status', 'Outreach Status', 'Status']),
                pastSponsor: pick(row, ['Past Sponsor?', 'Past Sponsor']),
                sheetConnectionId: connection.id,
                sourceRow: index + 2,
                sponsorType: pick(row, ['Sponsor Type', 'Type']),
              },
              name: company,
              deletedAt: null,
              website: pick(row, ['Website', 'Website(Update as needed)']) || null,
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
              OR: [...(email ? [{ email }] : []), ...(externalId ? [{ externalId }] : [])],
              workspaceId: session.workspaceId,
            },
            select: { customFields: true, id: true },
          });
          const importedFollowUpAt = followUpInstant(
            pick(row, ['Follow-Up Date', 'Follow Up Date', 'Next Follow Up', 'Due Date']),
          );
          const existingFields = jsonObject(existingContact?.customFields);
          const importedFollowUpPending = Boolean(
            importedFollowUpAt &&
            existingFields.importedFollowUpActivatedAtValue !== importedFollowUpAt,
          );
          if (importedFollowUpPending) followUpsPending += 1;
          const contactData = {
            customFields: {
              ...existingFields,
              ...mappedContact.contact.customFields,
              assignedOwnerEmail: session.email,
              importedFollowUpAt,
              importedFollowUpPending,
              sourceRow: index + 2,
            },
            email,
            externalId:
              externalId ??
              (email
                ? stableExternalId(
                    'sheet_contact',
                    input.spreadsheetId,
                    input.worksheetTitle,
                    email,
                  )
                : null),
            firstName,
            lastName,
            organizationId: organization?.id ?? null,
            ownerId: session.userId,
            phone: mappedContact.contact.phone ?? null,
            preferredChannel: canonicalChannel(mappedContact.contact.preferredChannel),
            source: `google-sheets:${connection.id}`,
            tags: mappedContact.contact.tags ?? ['google-sheets-import'],
            timezone: mappedContact.contact.timezone ?? 'America/Los_Angeles',
            title: mappedContact.contact.title ?? null,
            type: canonicalContactType(mappedContact.contact.type),
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
      await database.sheetSyncRun.create({
        data: {
          completedAt,
          dryRun: false,
          errorSummary: rowsFailed ? `${rowsFailed} rows require mapping or data review` : null,
          id: runId,
          idempotencyKey: `manual:${runId}`,
          rowsCreated,
          rowsFailed,
          rowsRead: rows.length,
          rowsSkipped,
          rowsUpdated,
          sheetConnectionId: connection.id,
          startedAt,
          status: rowsFailed > 0 ? 'PARTIAL' : 'SUCCEEDED',
          workspaceId: session.workspaceId,
        },
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
          actorId: session.userId,
          actorType: 'USER',
          entityId: connection.id,
          entityType: 'SheetConnection',
          id: randomUUID(),
          metadata: {
            followUpsPending,
            archivedContacts: archivedContacts.count,
            archivedOrganizations,
            rowsCreated,
            rowsFailed,
            rowsRead: rows.length,
            rowsSkipped,
            rowsUpdated,
            trigger,
          },
          workspaceId: session.workspaceId,
        },
      });
      return {
        followUpsPending,
        archivedContacts: archivedContacts.count,
        archivedOrganizations,
        rowsCreated,
        rowsFailed,
        rowsRead: rows.length,
        rowsSkipped,
        rowsUpdated,
      };
    });
    return { connectionId: connection.id, ...result };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : 'SHEET_SYNC_FAILED';
    await prisma.sheetConnection.update({
      data: { lastErrorAt: new Date(), lastErrorCode: errorCode, status: 'SYNC_ISSUE' },
      where: { id: connection.id },
    });
    throw error;
  }
}
