import { prisma } from '@faro/database';
import { protectFormulaCell } from '@faro/google-sheets';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { googleAccessToken } from './google';
import type { ContactEditableFields } from './contact-manual-overrides';

export type ContactEditableField = keyof ContactEditableFields;

interface StoredMapping {
  id: string;
  sourceColumn: string;
  targetField: string;
}

interface PlannedCell {
  columnIndex: number;
  sourceColumn: string;
  targetField: string;
  value: string;
}

export interface ContactSheetWritePlan {
  cells: PlannedCell[];
  newMappings: Array<{
    columnIndex: number;
    sourceColumn: string;
    targetField: string;
  }>;
  promotedMappings: Array<{ id: string; targetField: string }>;
}

const GOOGLE_SHEETS_WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const TARGET_HEADERS: Record<ContactEditableField | 'fullName', string> = {
  email: 'Email',
  firstName: 'First Name',
  fullName: 'Contact Name',
  lastName: 'Last Name',
  phone: 'Phone',
  preferredChannel: 'Preferred Channel',
  timezone: 'Timezone',
  title: 'Contact Role',
  type: 'Contact Type',
};

const TARGET_ALIASES: Record<ContactEditableField | 'fullName', readonly string[]> = {
  email: ['email', 'emailaddress', 'primaryemail', 'contactemail'],
  firstName: ['firstname', 'givenname', 'contactfirstname'],
  fullName: ['name', 'fullname', 'contact', 'contactname', 'primarycontact'],
  lastName: ['lastname', 'surname', 'contactlastname'],
  phone: ['phone', 'phonenumber', 'contactphone'],
  preferredChannel: ['preferredchannel', 'contactchannel'],
  timezone: ['timezone', 'contacttimezone'],
  title: ['title', 'jobtitle', 'role', 'jobrole', 'contactrole', 'position'],
  type: ['contacttype'],
};

const googleValuesSchema = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).default([]),
});

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

function targetValue(
  targetField: ContactEditableField | 'fullName',
  fields: ContactEditableFields,
): string {
  if (targetField === 'fullName') return `${fields.firstName} ${fields.lastName}`.trim();
  return fields[targetField] ?? '';
}

function desiredTargets(
  changedFields: readonly ContactEditableField[],
  mappings: readonly StoredMapping[],
  headers: readonly string[],
): Array<ContactEditableField | 'fullName'> {
  const changed = new Set(changedFields);
  const nameChanged = changed.has('firstName') || changed.has('lastName');
  const hasFullNameColumn =
    mappings.some((mapping) => mapping.targetField === 'fullName') ||
    headers.some((header) => TARGET_ALIASES.fullName.includes(normalizedHeader(header)));
  const targets: Array<ContactEditableField | 'fullName'> = [];
  if (nameChanged && hasFullNameColumn) targets.push('fullName');
  else {
    if (changed.has('firstName')) targets.push('firstName');
    if (changed.has('lastName')) targets.push('lastName');
  }
  changedFields.forEach((field) => {
    if (field !== 'firstName' && field !== 'lastName') targets.push(field);
  });
  return [...new Set(targets)];
}

export function contactSheetWritePlan(input: {
  changedFields: readonly ContactEditableField[];
  fields: ContactEditableFields;
  headers: readonly string[];
  mappings: readonly StoredMapping[];
}): ContactSheetWritePlan {
  const headers = [...input.headers];
  const cells: PlannedCell[] = [];
  const newMappings: ContactSheetWritePlan['newMappings'] = [];
  const promotedMappings: ContactSheetWritePlan['promotedMappings'] = [];

  for (const targetField of desiredTargets(input.changedFields, input.mappings, headers)) {
    const directMapping = input.mappings.find((mapping) => mapping.targetField === targetField);
    const aliases = TARGET_ALIASES[targetField];
    const aliasMapping =
      directMapping ??
      input.mappings.find((mapping) => aliases.includes(normalizedHeader(mapping.sourceColumn)));
    let sourceColumn = aliasMapping?.sourceColumn;
    let columnIndex = sourceColumn === undefined ? -1 : headers.indexOf(sourceColumn);

    if (columnIndex === -1) {
      columnIndex = headers.findIndex((header) => aliases.includes(normalizedHeader(header)));
      sourceColumn = columnIndex >= 0 ? headers[columnIndex] : undefined;
    }
    if (columnIndex === -1 || sourceColumn === undefined) {
      sourceColumn = TARGET_HEADERS[targetField];
      columnIndex = headers.length;
      headers.push(sourceColumn);
      newMappings.push({ columnIndex, sourceColumn, targetField });
    } else if (aliasMapping && aliasMapping.targetField !== targetField) {
      promotedMappings.push({ id: aliasMapping.id, targetField });
    } else if (!aliasMapping) {
      newMappings.push({ columnIndex, sourceColumn, targetField });
    }

    cells.push({
      columnIndex,
      sourceColumn,
      targetField,
      value: String(protectFormulaCell(targetValue(targetField, input.fields))),
    });
  }

  return { cells, newMappings, promotedMappings };
}

export function sheetColumnName(columnIndex: number): string {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) {
    throw new TypeError('Sheet column index must be a non-negative integer');
  }
  let remaining = columnIndex + 1;
  let name = '';
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

function sheetRange(worksheetId: string, columnIndex: number, row: number): string {
  const escapedTitle = worksheetId.replaceAll("'", "''");
  return `'${escapedTitle}'!${sheetColumnName(columnIndex)}${row}`;
}

export class ContactSheetWritebackError extends Error {
  constructor(
    readonly code:
      | 'GOOGLE_SHEETS_SOURCE_ROW_MISSING'
      | 'GOOGLE_SHEETS_WRITE_FAILED'
      | 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
      | 'GOOGLE_SHEETS_WRITE_OWNER_REQUIRED'
      | 'SHEET_CONNECTION_NOT_FOUND',
  ) {
    super(code);
    this.name = 'ContactSheetWritebackError';
  }
}

export type ContactSheetWritebackResult =
  | { cellsWritten: 0; status: 'NOT_APPLICABLE' | 'NO_CHANGES' }
  | { cellsWritten: number; connectionId: string; status: 'WRITTEN' };

export async function writeContactEditsToGoogleSheet(input: {
  actorUserId: string;
  changedFields: readonly ContactEditableField[];
  contact: {
    customFields: unknown;
    source: string | null;
  };
  fields: ContactEditableFields;
  workspaceId: string;
}): Promise<ContactSheetWritebackResult> {
  if (!input.changedFields.length) return { cellsWritten: 0, status: 'NO_CHANGES' };
  if (!input.contact.source?.startsWith('google-sheets:')) {
    return { cellsWritten: 0, status: 'NOT_APPLICABLE' };
  }
  const connectionId = input.contact.source.slice('google-sheets:'.length);
  const sourceRowValue = jsonObject(input.contact.customFields).sourceRow;
  const sourceRow =
    typeof sourceRowValue === 'number' && Number.isInteger(sourceRowValue) && sourceRowValue > 1
      ? sourceRowValue
      : null;
  if (!sourceRow) throw new ContactSheetWritebackError('GOOGLE_SHEETS_SOURCE_ROW_MISSING');

  const connection = await prisma.sheetConnection.findFirst({
    select: {
      credentialReference: true,
      fieldMappings: {
        select: { id: true, sourceColumn: true, targetField: true },
      },
      headerRow: true,
      id: true,
      spreadsheetId: true,
      worksheetId: true,
    },
    where: { id: connectionId, workspaceId: input.workspaceId },
  });
  if (!connection) throw new ContactSheetWritebackError('SHEET_CONNECTION_NOT_FOUND');
  if (connection.credentialReference !== `google-user:${input.actorUserId}`) {
    throw new ContactSheetWritebackError('GOOGLE_SHEETS_WRITE_OWNER_REQUIRED');
  }
  const credential = await prisma.googleCredential.findUnique({
    select: { grantedScopes: true },
    where: { userId: input.actorUserId },
  });
  const scopes = credential?.grantedScopes.split(/\s+/).filter(Boolean) ?? [];
  if (!scopes.includes(GOOGLE_SHEETS_WRITE_SCOPE)) {
    throw new ContactSheetWritebackError('GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED');
  }

  let token: string;
  try {
    token = await googleAccessToken(input.actorUserId);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    throw new ContactSheetWritebackError(
      code === 'GOOGLE_REAUTH_REQUIRED' ||
        code === 'GOOGLE_NOT_CONNECTED' ||
        code === 'GOOGLE_TOKEN_REFRESH_FAILED'
        ? 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
        : 'GOOGLE_SHEETS_WRITE_FAILED',
    );
  }
  const headerRange = `'${connection.worksheetId.replaceAll("'", "''")}'!${
    connection.headerRow
  }:${connection.headerRow}`;
  const headerResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      connection.spreadsheetId,
    )}/values/${encodeURIComponent(headerRange)}?majorDimension=ROWS`,
    {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
    },
  );
  if (!headerResponse.ok) {
    throw new ContactSheetWritebackError(
      headerResponse.status === 401 || headerResponse.status === 403
        ? 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
        : 'GOOGLE_SHEETS_WRITE_FAILED',
    );
  }
  const headerValues = googleValuesSchema.parse(await headerResponse.json()).values[0] ?? [];
  const headers = headerValues.map(String);
  const plan = contactSheetWritePlan({
    changedFields: input.changedFields,
    fields: input.fields,
    headers,
    mappings: connection.fieldMappings,
  });
  const headerWrites = plan.newMappings
    .filter((mapping) => mapping.columnIndex >= headers.length)
    .map((mapping) => ({
      range: sheetRange(connection.worksheetId, mapping.columnIndex, connection.headerRow),
      values: [[mapping.sourceColumn]],
    }));
  const valueWrites = plan.cells.map((cell) => ({
    range: sheetRange(connection.worksheetId, cell.columnIndex, sourceRow),
    values: [[cell.value]],
  }));
  const writeResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      connection.spreadsheetId,
    )}/values:batchUpdate`,
    {
      body: JSON.stringify({
        data: [...headerWrites, ...valueWrites],
        includeValuesInResponse: false,
        valueInputOption: 'RAW',
      }),
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  );
  if (!writeResponse.ok) {
    throw new ContactSheetWritebackError(
      writeResponse.status === 401 || writeResponse.status === 403
        ? 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
        : 'GOOGLE_SHEETS_WRITE_FAILED',
    );
  }

  await prisma.$transaction(async (database) => {
    for (const promotion of plan.promotedMappings) {
      await database.sheetFieldMapping.update({
        data: { targetEntity: 'Contact', targetField: promotion.targetField },
        where: {
          id_workspaceId: {
            id: promotion.id,
            workspaceId: input.workspaceId,
          },
        },
      });
    }
    if (plan.newMappings.length) {
      await database.sheetFieldMapping.createMany({
        data: plan.newMappings.map((mapping) => ({
          id: randomUUID(),
          required: false,
          sheetConnectionId: connection.id,
          sourceColumn: mapping.sourceColumn,
          targetEntity: 'Contact',
          targetField: mapping.targetField,
          transformation: mapping.targetField === 'email' ? 'LOWERCASE' : 'TRIM',
          workspaceId: input.workspaceId,
        })),
        skipDuplicates: true,
      });
    }
    await database.sheetConnection.update({
      data: {
        lastErrorAt: null,
        lastErrorCode: null,
        syncDirection: 'BIDIRECTIONAL',
        writeBackEnabled: true,
      },
      where: { id_workspaceId: { id: connection.id, workspaceId: input.workspaceId } },
    });
  });

  return {
    cellsWritten: valueWrites.length,
    connectionId: connection.id,
    status: 'WRITTEN',
  };
}
