import { z } from 'zod';

export const sheetIdentifierSchema = z.string().trim().min(1).max(300);
export const sheetCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const sheetRowSchema = z.record(z.string(), sheetCellValueSchema);

export const sheetScopeSchema = z
  .object({
    workspaceId: sheetIdentifierSchema,
    connectionId: sheetIdentifierSchema,
    spreadsheetId: sheetIdentifierSchema,
    worksheetId: sheetIdentifierSchema,
  })
  .strict();

export const contactFieldSchema = z.enum([
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'title',
  'timezone',
  'preferredChannel',
  'type',
  'organizationName',
  'externalId',
  'tags',
  'consentStatus',
]);

export const customContactFieldSchema = z
  .string()
  .regex(/^customFields\.[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
export const targetContactFieldSchema = z.union([contactFieldSchema, customContactFieldSchema]);

export const sheetFieldMappingSchema = z
  .object({
    sourceColumn: z.string().trim().min(1).max(300),
    targetField: targetContactFieldSchema,
    required: z.boolean().default(false),
    transformation: z
      .enum(['NONE', 'TRIM', 'LOWERCASE', 'UPPERCASE', 'SPLIT_COMMA'])
      .default('TRIM'),
  })
  .strict();

export const conflictBehaviorSchema = z.enum(['SKIP', 'UPDATE', 'ERROR']);

export type SheetCellValue = z.infer<typeof sheetCellValueSchema>;
export type SheetRow = z.infer<typeof sheetRowSchema>;
export type SheetScope = z.infer<typeof sheetScopeSchema>;
export type ContactField = z.infer<typeof contactFieldSchema>;
export type TargetContactField = z.infer<typeof targetContactFieldSchema>;
export type SheetFieldMapping = z.infer<typeof sheetFieldMappingSchema>;
export type ConflictBehavior = z.infer<typeof conflictBehaviorSchema>;

export interface SheetCursor {
  offset: number;
  revision?: string;
}

export interface WorksheetMetadata {
  spreadsheetId: string;
  worksheetId: string;
  title: string;
  headers: string[];
  readOnly: boolean;
  source: 'GOOGLE_SHEETS' | 'DEVELOPMENT_FIXTURE';
}

export interface SheetReadPage {
  rows: SheetRow[];
  nextCursor: SheetCursor | null;
  revision?: string;
}

export interface ReadSheetRowsInput {
  scope: SheetScope;
  cursor?: SheetCursor;
  limit: number;
}

export interface WriteSheetRowsInput {
  scope: SheetScope;
  rows: SheetRow[];
  idempotencyKey: string;
}

export interface SheetWriteResult {
  rowsWritten: number;
  revision?: string;
}

/** Shared boundary used by application sync and the Sheets MCP server. */
export interface GoogleSheetsClient {
  getWorksheetMetadata(scope: SheetScope): Promise<WorksheetMetadata>;
  readRows(input: ReadSheetRowsInput): Promise<SheetReadPage>;
  writeRows(input: WriteSheetRowsInput): Promise<SheetWriteResult>;
}
