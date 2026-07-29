import { describe, expect, it } from 'vitest';

import type { SheetFieldMapping, SheetScope } from './contracts';
import { FixtureGoogleSheetsClient } from './fixture-client';
import {
  canonicalizeContactRoleMapping,
  inferHeaderMappings,
  suggestHeaderMappings,
} from './mapping';
import { previewContactImport } from './preview';
import { protectFormulaCell } from './writeback';

const headers = ['Email Address', 'External ID', 'First Name', 'Last Name', 'Interests'];
const mappings: SheetFieldMapping[] = [
  {
    sourceColumn: 'Email Address',
    targetField: 'email',
    required: false,
    transformation: 'LOWERCASE',
  },
  {
    sourceColumn: 'External ID',
    targetField: 'externalId',
    required: false,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'First Name',
    targetField: 'firstName',
    required: true,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'Last Name',
    targetField: 'lastName',
    required: true,
    transformation: 'TRIM',
  },
  {
    sourceColumn: 'Interests',
    targetField: 'customFields.interests',
    required: false,
    transformation: 'SPLIT_COMMA',
  },
];

describe('Google Sheets mapping', () => {
  it('maps a person role column to the canonical contact title', () => {
    expect(inferHeaderMappings(['Contact Role'])[0]).toMatchObject({
      confidence: 'HIGH',
      sourceColumn: 'Contact Role',
      targetField: 'title',
    });
  });

  it('upgrades a stored custom Contact Role mapping without overriding an explicit title', () => {
    expect(
      canonicalizeContactRoleMapping([
        {
          required: false,
          sourceColumn: 'Contact Role',
          targetField: 'customFields.Contact_Role_3',
          transformation: 'TRIM',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        sourceColumn: 'Contact Role',
        targetField: 'title',
      }),
    ]);
  });

  it('suggests common header mappings without mapping a target twice', () => {
    expect(suggestHeaderMappings(['Email', 'Email Address', 'Company', 'Industry'])).toEqual([
      expect.objectContaining({ sourceColumn: 'Email', targetField: 'email' }),
      expect.objectContaining({ sourceColumn: 'Company', targetField: 'organizationName' }),
      expect.objectContaining({
        sourceColumn: 'Industry',
        targetField: 'organizationIndustry',
      }),
    ]);
  });

  it('recognizes third-party company taxonomy headers without mapping a target twice', () => {
    const inferred = inferHeaderMappings([
      'Company',
      'GICS Sector',
      'NAICS Description',
      'LinkedIn Industry',
    ]);

    expect(inferred[1]).toMatchObject({
      confidence: 'HIGH',
      targetField: 'organizationIndustry',
    });
    expect(inferred[2]?.targetField).toMatch(/^customFields\./);
    expect(inferred[3]?.targetField).toMatch(/^customFields\./);
  });

  it('infers a combined name and preserves unfamiliar columns as custom fields', () => {
    const inferred = inferHeaderMappings(['Contact Name', 'Primary Email', 'Favorite Color']);
    expect(inferred).toEqual([
      expect.objectContaining({ confidence: 'HIGH', targetField: 'fullName' }),
      expect.objectContaining({ confidence: 'HIGH', targetField: 'email' }),
      expect.objectContaining({ confidence: 'LOW', targetField: 'customFields.Favorite_Color_3' }),
    ]);
    const preview = previewContactImport({
      createDefaults: { preferredChannel: 'EMAIL', timezone: 'UTC', type: 'OTHER' },
      headers: ['Contact Name', 'Primary Email', 'Favorite Color'],
      mappings: inferred.map(({ confidence: _confidence, reason: _reason, ...mapping }) => mapping),
      rows: [
        {
          'Contact Name': 'Avery Jordan',
          'Favorite Color': 'blue',
          'Primary Email': 'avery@example.test',
        },
      ],
    });
    expect(preview.rows[0]).toMatchObject({
      action: 'CREATE',
      contact: {
        customFields: { Favorite_Color_3: 'blue' },
        firstName: 'Avery',
        lastName: 'Jordan',
      },
    });
  });

  it('expands positional name and email lists into multiple contacts for one organization', () => {
    const inferred = inferHeaderMappings(['Contact Name', 'Primary Email', 'Company']);
    const preview = previewContactImport({
      createDefaults: { preferredChannel: 'EMAIL', timezone: 'UTC', type: 'OTHER' },
      headers: ['Contact Name', 'Primary Email', 'Company'],
      mappings: inferred.map(({ confidence: _confidence, reason: _reason, ...mapping }) => mapping),
      rows: [
        {
          Company: 'Shared Organization',
          'Contact Name': 'Avery Jordan, Morgan Lee',
          'Primary Email': 'avery@example.test, morgan@example.test',
        },
      ],
    });
    expect(preview.summary).toMatchObject({ rowsCreate: 2, rowsError: 0, rowsRead: 2 });
    expect(preview.rows.map((row) => row.contact.email)).toEqual([
      'avery@example.test',
      'morgan@example.test',
    ]);
    expect(
      preview.rows.every((row) => row.contact.organizationName === 'Shared Organization'),
    ).toBe(true);
  });

  it('previews create/update actions and catches duplicate identities within the sheet', () => {
    const preview = previewContactImport({
      headers,
      mappings,
      conflictBehavior: 'UPDATE',
      createDefaults: {
        type: 'OTHER',
        timezone: 'UTC',
        preferredChannel: 'EMAIL',
      },
      existingContacts: [{ id: 'contact-one', email: 'avery@example.test' }],
      rows: [
        {
          'Email Address': ' Avery@Example.Test ',
          'External ID': 'sponsor-1',
          'First Name': ' Avery ',
          'Last Name': 'Jordan',
          Interests: 'education, arts',
        },
        {
          'Email Address': 'new@example.test',
          'External ID': 'sponsor-2',
          'First Name': 'Morgan',
          'Last Name': 'Lee',
          Interests: 'community',
        },
        {
          'Email Address': 'NEW@example.test',
          'External ID': 'sponsor-3',
          'First Name': 'Duplicate',
          'Last Name': 'Lee',
          Interests: null,
        },
      ],
    });

    expect(preview.summary).toEqual({
      rowsRead: 3,
      rowsCreate: 1,
      rowsUpdate: 1,
      rowsSkip: 0,
      rowsError: 1,
    });
    expect(preview.rows[0]).toMatchObject({ action: 'UPDATE', matchedContactId: 'contact-one' });
    expect(preview.rows[2]?.issues[0]?.message).toContain('duplicates import row');
  });

  it('protects formula-like values on explicit write-back', () => {
    expect(protectFormulaCell('=HYPERLINK("https://invalid.test")')).toBe(
      '\'=HYPERLINK("https://invalid.test")',
    );
    expect(protectFormulaCell('  +1')).toBe("'  +1");
    expect(protectFormulaCell('ordinary text')).toBe('ordinary text');
  });

  it('preserves case for opaque external IDs while normalizing email identities', () => {
    const preview = previewContactImport({
      headers,
      mappings,
      createDefaults: {
        type: 'OTHER',
        timezone: 'UTC',
        preferredChannel: 'EMAIL',
      },
      rows: [
        {
          'Email Address': null,
          'External ID': 'Sponsor-ABC',
          'First Name': 'Avery',
          'Last Name': 'Jordan',
          Interests: null,
        },
        {
          'Email Address': null,
          'External ID': 'sponsor-abc',
          'First Name': 'Morgan',
          'Last Name': 'Lee',
          Interests: null,
        },
      ],
    });
    expect(preview.summary).toMatchObject({ rowsCreate: 2, rowsError: 0 });
  });

  it('rejects values and missing fields that cannot be persisted as canonical contacts', () => {
    const preview = previewContactImport({
      headers: ['Email', 'Type', 'Timezone', 'Preferred channel'],
      mappings: [
        {
          sourceColumn: 'Email',
          targetField: 'email',
          required: true,
          transformation: 'LOWERCASE',
        },
        { sourceColumn: 'Type', targetField: 'type', required: true, transformation: 'UPPERCASE' },
        {
          sourceColumn: 'Timezone',
          targetField: 'timezone',
          required: true,
          transformation: 'TRIM',
        },
        {
          sourceColumn: 'Preferred channel',
          targetField: 'preferredChannel',
          required: true,
          transformation: 'UPPERCASE',
        },
      ],
      rows: [
        {
          Email: 'new@example.test',
          Type: 'wizard',
          Timezone: 'Mars/Olympus',
          'Preferred channel': 'carrier pigeon',
        },
      ],
    });

    expect(preview.rows[0]).toMatchObject({ action: 'ERROR' });
    expect(preview.rows[0]?.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'INVALID_CONTACT_TYPE',
        'INVALID_PREFERRED_CHANNEL',
        'INVALID_TIMEZONE',
        'MISSING_CANONICAL_FIELD',
      ]),
    );
  });
});

describe('fixture Google Sheets client', () => {
  const scope: SheetScope = {
    workspaceId: 'ws-one',
    connectionId: 'connection-one',
    spreadsheetId: 'spreadsheet-one',
    worksheetId: 'contacts',
  };

  it('is workspace scoped and truthfully labels fixture metadata', async () => {
    const client = new FixtureGoogleSheetsClient([
      {
        scope,
        title: 'Fictional contacts',
        headers: ['Email'],
        rows: [{ Email: 'a@test.example' }],
      },
    ]);

    await expect(client.getWorksheetMetadata(scope)).resolves.toMatchObject({
      source: 'DEVELOPMENT_FIXTURE',
      readOnly: true,
    });
    await expect(
      client.getWorksheetMetadata({ ...scope, workspaceId: 'ws-two' }),
    ).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    await expect(
      client.writeRows({ scope, rows: [{ Email: '=unsafe' }], idempotencyKey: 'once' }),
    ).rejects.toMatchObject({ code: 'SHEET_WRITEBACK_DISABLED' });
  });

  it('deduplicates explicitly enabled fixture write-back by idempotency key', async () => {
    const client = new FixtureGoogleSheetsClient(
      [{ scope, title: 'Fixture', headers: ['Email'], rows: [] }],
      true,
    );
    const write = { scope, rows: [{ Email: '=unsafe' }], idempotencyKey: 'sync-once' };

    await expect(client.writeRows(write)).resolves.toMatchObject({ rowsWritten: 1 });
    await expect(client.writeRows(write)).resolves.toMatchObject({ rowsWritten: 1 });
    const page = await client.readRows({ scope, limit: 10 });
    expect(page.rows).toEqual([{ Email: "'=unsafe" }]);
  });
});
