import type { ConflictBehavior, SheetFieldMapping, SheetRow } from './contracts';
import {
  mapContactRowVariants,
  validateCanonicalContactCreate,
  validateCanonicalContactValues,
  validateMapping,
  type MappedContact,
  type MappingIssue,
} from './mapping';

export interface ExistingContactIdentity {
  id: string;
  email?: string | null;
  externalId?: string | null;
}

export interface PreviewRow {
  rowNumber: number;
  action: 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';
  contact: MappedContact;
  matchedContactId?: string;
  issues: MappingIssue[];
}

export interface SheetImportPreview {
  mode: 'DRY_RUN';
  rows: PreviewRow[];
  summary: {
    rowsRead: number;
    rowsCreate: number;
    rowsUpdate: number;
    rowsSkip: number;
    rowsError: number;
  };
  mappingIssues: MappingIssue[];
}

export interface PreviewContactImportInput {
  headers: string[];
  rows: SheetRow[];
  mappings: SheetFieldMapping[];
  existingContacts?: ExistingContactIdentity[];
  conflictBehavior?: ConflictBehavior;
  firstDataRowNumber?: number;
  createDefaults?: Partial<
    Pick<MappedContact, 'type' | 'timezone' | 'preferredChannel' | 'consentStatus'>
  >;
}

const normalizeEmail = (value?: string | null): string | undefined =>
  value?.trim().toLocaleLowerCase('en-US') || undefined;
const normalizeExternalId = (value?: string | null): string | undefined =>
  value?.trim() || undefined;

export function previewContactImport(input: PreviewContactImportInput): SheetImportPreview {
  const conflictBehavior = input.conflictBehavior ?? 'SKIP';
  const mappingIssues = validateMapping(input.headers, input.mappings);
  if (mappingIssues.length > 0) {
    return {
      mode: 'DRY_RUN',
      rows: [],
      summary: {
        rowsRead: input.rows.length,
        rowsCreate: 0,
        rowsUpdate: 0,
        rowsSkip: 0,
        rowsError: input.rows.length,
      },
      mappingIssues,
    };
  }

  const existingByEmail = new Map<string, ExistingContactIdentity>();
  const existingByExternalId = new Map<string, ExistingContactIdentity>();
  for (const contact of input.existingContacts ?? []) {
    const email = normalizeEmail(contact.email);
    const externalId = normalizeExternalId(contact.externalId);
    if (email) existingByEmail.set(email, contact);
    if (externalId) existingByExternalId.set(externalId, contact);
  }

  const seenEmails = new Map<string, number>();
  const seenExternalIds = new Map<string, number>();
  const expandedRows = input.rows.flatMap((row, index) =>
    mapContactRowVariants(row, input.mappings).map((mapped) => ({
      mapped,
      rowNumber: (input.firstDataRowNumber ?? 2) + index,
    })),
  );
  const rows = expandedRows.map<PreviewRow>(({ mapped, rowNumber }) => {
    let contact = mapped.contact;
    const issues = mapped.issues;
    const email = normalizeEmail(contact.email);
    const externalId = normalizeExternalId(contact.externalId);
    const firstEmailRow = email ? seenEmails.get(email) : undefined;
    const firstExternalRow = externalId ? seenExternalIds.get(externalId) : undefined;
    if (firstEmailRow !== undefined) {
      issues.push({
        code: 'DUPLICATE_IMPORT_IDENTITY',
        message: `Email duplicates import row ${firstEmailRow}`,
        field: 'email',
      });
    }
    if (firstExternalRow !== undefined) {
      issues.push({
        code: 'DUPLICATE_IMPORT_IDENTITY',
        message: `External ID duplicates import row ${firstExternalRow}`,
        field: 'externalId',
      });
    }
    if (email && firstEmailRow === undefined) seenEmails.set(email, rowNumber);
    if (externalId && firstExternalRow === undefined) seenExternalIds.set(externalId, rowNumber);

    const emailMatch = email ? existingByEmail.get(email) : undefined;
    const externalMatch = externalId ? existingByExternalId.get(externalId) : undefined;
    if (emailMatch && externalMatch && emailMatch.id !== externalMatch.id) {
      issues.push({
        code: 'IDENTITY_CONFLICT',
        message: 'Email and external ID match different existing contacts',
      });
    }
    const matched = externalMatch ?? emailMatch;
    if (!matched) {
      contact = { ...input.createDefaults, ...contact };
      for (const issue of [
        ...validateCanonicalContactValues(contact),
        ...validateCanonicalContactCreate(contact),
      ]) {
        if (
          !issues.some((existing) => existing.code === issue.code && existing.field === issue.field)
        ) {
          issues.push(issue);
        }
      }
      return {
        rowNumber,
        action: issues.length > 0 ? 'ERROR' : 'CREATE',
        contact,
        issues,
      };
    }
    if (issues.length > 0) return { rowNumber, action: 'ERROR', contact, issues };
    if (conflictBehavior === 'UPDATE') {
      return { rowNumber, action: 'UPDATE', contact, matchedContactId: matched.id, issues };
    }
    if (conflictBehavior === 'ERROR') {
      return {
        rowNumber,
        action: 'ERROR',
        contact,
        matchedContactId: matched.id,
        issues: [
          {
            code: 'EXISTING_CONTACT_CONFLICT',
            message: `Row matches existing contact ${matched.id}`,
          },
        ],
      };
    }
    return { rowNumber, action: 'SKIP', contact, matchedContactId: matched.id, issues };
  });

  return {
    mode: 'DRY_RUN',
    rows,
    summary: {
      rowsRead: rows.length,
      rowsCreate: rows.filter((row) => row.action === 'CREATE').length,
      rowsUpdate: rows.filter((row) => row.action === 'UPDATE').length,
      rowsSkip: rows.filter((row) => row.action === 'SKIP').length,
      rowsError: rows.filter((row) => row.action === 'ERROR').length,
    },
    mappingIssues,
  };
}
