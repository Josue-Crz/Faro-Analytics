import type {
  GoogleSheetsClient,
  ReadSheetRowsInput,
  SheetReadPage,
  SheetRow,
  SheetScope,
  SheetWriteResult,
  WorksheetMetadata,
  WriteSheetRowsInput,
} from './contracts';
import { sheetScopeSchema } from './contracts';
import { protectFormulaRows } from './writeback';

export interface FixtureWorksheet {
  scope: SheetScope;
  title: string;
  headers: string[];
  rows: SheetRow[];
  revision?: string;
}

export class SheetAccessError extends Error {
  constructor(
    readonly code: 'SHEET_NOT_FOUND' | 'SHEET_WRITEBACK_DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'SheetAccessError';
  }
}

/** Deterministic development client; it never claims to connect to Google. */
export class FixtureGoogleSheetsClient implements GoogleSheetsClient {
  private readonly worksheets = new Map<string, FixtureWorksheet>();
  private readonly writeResults = new Map<string, SheetWriteResult>();

  constructor(
    fixtures: FixtureWorksheet[] = [],
    private readonly allowWriteBack = false,
  ) {
    for (const fixture of fixtures) {
      const scope = sheetScopeSchema.parse(fixture.scope);
      this.worksheets.set(this.key(scope), structuredClone({ ...fixture, scope }));
    }
  }

  async getWorksheetMetadata(scopeInput: SheetScope): Promise<WorksheetMetadata> {
    const fixture = this.requireFixture(scopeInput);
    return {
      spreadsheetId: fixture.scope.spreadsheetId,
      worksheetId: fixture.scope.worksheetId,
      title: fixture.title,
      headers: [...fixture.headers],
      readOnly: !this.allowWriteBack,
      source: 'DEVELOPMENT_FIXTURE',
    };
  }

  async readRows(input: ReadSheetRowsInput): Promise<SheetReadPage> {
    const fixture = this.requireFixture(input.scope);
    const offset = Math.max(0, input.cursor?.offset ?? 0);
    const limit = Math.min(1_000, Math.max(1, input.limit));
    const rows = fixture.rows.slice(offset, offset + limit).map((row) => structuredClone(row));
    const nextOffset = offset + rows.length;
    return {
      rows,
      nextCursor:
        nextOffset < fixture.rows.length
          ? { offset: nextOffset, revision: fixture.revision }
          : null,
      revision: fixture.revision,
    };
  }

  async writeRows(input: WriteSheetRowsInput): Promise<SheetWriteResult> {
    if (!this.allowWriteBack) {
      throw new SheetAccessError(
        'SHEET_WRITEBACK_DISABLED',
        'Fixture write-back is disabled; enable it explicitly for a development test',
      );
    }
    const fixture = this.requireFixture(input.scope);
    if (!input.idempotencyKey.trim()) throw new Error('A write-back idempotency key is required');
    const writeKey = `${this.key(input.scope)}\u0000${input.idempotencyKey}`;
    const existingResult = this.writeResults.get(writeKey);
    if (existingResult) return { ...existingResult };
    fixture.rows.push(...protectFormulaRows(input.rows));
    const result = { rowsWritten: input.rows.length, revision: fixture.revision };
    this.writeResults.set(writeKey, result);
    return { ...result };
  }

  private requireFixture(scopeInput: SheetScope): FixtureWorksheet {
    const scope = sheetScopeSchema.parse(scopeInput);
    const fixture = this.worksheets.get(this.key(scope));
    if (!fixture)
      throw new SheetAccessError('SHEET_NOT_FOUND', 'Worksheet not found in this workspace');
    return fixture;
  }

  private key(scope: SheetScope): string {
    return [scope.workspaceId, scope.connectionId, scope.spreadsheetId, scope.worksheetId].join(
      '\u0000',
    );
  }
}
