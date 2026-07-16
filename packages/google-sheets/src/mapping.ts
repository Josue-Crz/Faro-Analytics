import type { SheetCellValue, SheetFieldMapping, SheetRow, TargetContactField } from './contracts';
import { sheetFieldMappingSchema } from './contracts';

export interface MappedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  timezone?: string;
  preferredChannel?: string;
  type?: string;
  organizationName?: string;
  externalId?: string;
  tags?: string[];
  consentStatus?: string;
  customFields: Record<string, SheetCellValue | string[]>;
}

export interface MappingIssue {
  code:
    | 'DUPLICATE_SOURCE_COLUMN'
    | 'DUPLICATE_TARGET_FIELD'
    | 'MISSING_SOURCE_COLUMN'
    | 'MISSING_REQUIRED_VALUE'
    | 'INVALID_EMAIL'
    | 'INVALID_CONTACT_TYPE'
    | 'INVALID_PREFERRED_CHANNEL'
    | 'INVALID_CONSENT_STATUS'
    | 'INVALID_TIMEZONE'
    | 'MISSING_CANONICAL_FIELD'
    | 'MISSING_IDENTITY'
    | 'DUPLICATE_IMPORT_IDENTITY'
    | 'IDENTITY_CONFLICT'
    | 'EXISTING_CONTACT_CONFLICT';
  message: string;
  field?: string;
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES: Readonly<Record<string, TargetContactField>> = {
  firstname: 'firstName',
  givenname: 'firstName',
  lastname: 'lastName',
  surname: 'lastName',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  jobtitle: 'title',
  title: 'title',
  timezone: 'timezone',
  preferredchannel: 'preferredChannel',
  contacttype: 'type',
  organization: 'organizationName',
  company: 'organizationName',
  externalid: 'externalId',
  tags: 'tags',
  consent: 'consentStatus',
  consentstatus: 'consentStatus',
};

export function suggestHeaderMappings(headers: string[]): SheetFieldMapping[] {
  const claimedTargets = new Set<TargetContactField>();
  const suggestions: SheetFieldMapping[] = [];
  for (const header of headers) {
    const targetField = HEADER_ALIASES[normalizedHeader(header)];
    if (!targetField || claimedTargets.has(targetField)) continue;
    claimedTargets.add(targetField);
    suggestions.push({
      sourceColumn: header,
      targetField,
      // Identity validation accepts either email or external ID, so suggestions must not require both.
      required: false,
      transformation: targetField === 'email' ? 'LOWERCASE' : 'TRIM',
    });
  }
  return suggestions;
}

export function validateMapping(
  headers: string[],
  rawMappings: SheetFieldMapping[],
): MappingIssue[] {
  const mappings = rawMappings.map((mapping) => sheetFieldMappingSchema.parse(mapping));
  const issues: MappingIssue[] = [];
  const sources = new Set<string>();
  const targets = new Set<string>();
  const headerSet = new Set(headers);

  for (const mapping of mappings) {
    if (sources.has(mapping.sourceColumn)) {
      issues.push({
        code: 'DUPLICATE_SOURCE_COLUMN',
        message: `Source column ${mapping.sourceColumn} is mapped more than once`,
        field: mapping.sourceColumn,
      });
    }
    if (targets.has(mapping.targetField)) {
      issues.push({
        code: 'DUPLICATE_TARGET_FIELD',
        message: `Target field ${mapping.targetField} is mapped more than once`,
        field: mapping.targetField,
      });
    }
    if (!headerSet.has(mapping.sourceColumn)) {
      issues.push({
        code: 'MISSING_SOURCE_COLUMN',
        message: `Source column ${mapping.sourceColumn} was not found in the worksheet`,
        field: mapping.sourceColumn,
      });
    }
    sources.add(mapping.sourceColumn);
    targets.add(mapping.targetField);
  }
  return issues;
}

function transformCell(
  value: SheetCellValue | undefined,
  transformation: SheetFieldMapping['transformation'],
): SheetCellValue | string[] {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  switch (transformation) {
    case 'LOWERCASE':
      return value.trim().toLocaleLowerCase('en-US');
    case 'UPPERCASE':
      return value.trim().toLocaleUpperCase('en-US');
    case 'SPLIT_COMMA':
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    case 'TRIM':
      return value.trim();
    case 'NONE':
      return value;
  }
}

function hasValue(value: SheetCellValue | string[] | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    (!Array.isArray(value) || value.length > 0)
  );
}

const CONTACT_TYPES = new Set([
  'PARTICIPANT',
  'SPONSOR',
  'PARTNER',
  'DONOR',
  'SPEAKER',
  'VENDOR',
  'OTHER',
]);
const CONTACT_CHANNELS = new Set(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']);
const CONSENT_STATUSES = new Set(['OPTED_IN', 'IMPLIED', 'UNKNOWN', 'OPTED_OUT']);

function hasValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function validateCanonicalContactValues(contact: MappedContact): MappingIssue[] {
  const issues: MappingIssue[] = [];
  if (contact.type && !CONTACT_TYPES.has(contact.type)) {
    issues.push({
      code: 'INVALID_CONTACT_TYPE',
      message: `${contact.type} is not a canonical Faro contact type`,
      field: 'type',
    });
  }
  if (contact.preferredChannel && !CONTACT_CHANNELS.has(contact.preferredChannel)) {
    issues.push({
      code: 'INVALID_PREFERRED_CHANNEL',
      message: `${contact.preferredChannel} is not a canonical Faro contact channel`,
      field: 'preferredChannel',
    });
  }
  if (contact.consentStatus && !CONSENT_STATUSES.has(contact.consentStatus)) {
    issues.push({
      code: 'INVALID_CONSENT_STATUS',
      message: `${contact.consentStatus} is not a canonical Faro consent status`,
      field: 'consentStatus',
    });
  }
  if (contact.timezone && !hasValidTimeZone(contact.timezone)) {
    issues.push({
      code: 'INVALID_TIMEZONE',
      message: `${contact.timezone} is not a valid IANA timezone`,
      field: 'timezone',
    });
  }
  return issues;
}

export function validateCanonicalContactCreate(contact: MappedContact): MappingIssue[] {
  const requiredFields = ['firstName', 'lastName', 'type', 'timezone', 'preferredChannel'] as const;
  return requiredFields.flatMap((field) =>
    contact[field]?.trim()
      ? []
      : [
          {
            code: 'MISSING_CANONICAL_FIELD' as const,
            message: `${field} is required to create a canonical Faro contact`,
            field,
          },
        ],
  );
}

export function mapContactRow(
  row: SheetRow,
  mappings: SheetFieldMapping[],
): { contact: MappedContact; issues: MappingIssue[] } {
  const contact: MappedContact = { customFields: {} };
  const issues: MappingIssue[] = [];

  for (const rawMapping of mappings) {
    const mapping = sheetFieldMappingSchema.parse(rawMapping);
    const transformed = transformCell(row[mapping.sourceColumn], mapping.transformation);
    if (mapping.required && !hasValue(transformed)) {
      issues.push({
        code: 'MISSING_REQUIRED_VALUE',
        message: `${mapping.sourceColumn} is required`,
        field: mapping.targetField,
      });
      continue;
    }
    if (!hasValue(transformed)) continue;
    if (mapping.targetField.startsWith('customFields.')) {
      contact.customFields[mapping.targetField.slice('customFields.'.length)] = transformed;
      continue;
    }
    if (mapping.targetField === 'tags') {
      contact.tags = Array.isArray(transformed)
        ? transformed.map(String)
        : String(transformed)
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
      continue;
    }
    const scalarTarget = mapping.targetField as keyof Omit<MappedContact, 'customFields' | 'tags'>;
    contact[scalarTarget] = String(transformed);
  }

  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    issues.push({ code: 'INVALID_EMAIL', message: 'Email address is invalid', field: 'email' });
  }
  if (!contact.email && !contact.externalId) {
    issues.push({
      code: 'MISSING_IDENTITY',
      message: 'A mapped email or external ID is required for safe deduplication',
    });
  }
  issues.push(...validateCanonicalContactValues(contact));
  return { contact, issues };
}
