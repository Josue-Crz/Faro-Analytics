import { describe, expect, it } from 'vitest';

import { contactSheetWritePlan, sheetColumnName } from './contact-sheet-writeback';

const fields = {
  email: 'person@example.org',
  firstName: 'Pat',
  lastName: 'Lee',
  phone: null,
  preferredChannel: 'EMAIL' as const,
  timezone: 'America/Los_Angeles',
  title: 'Program Director',
  type: 'PARTNER' as const,
};

describe('contact Google Sheet write-back planning', () => {
  it('writes the person role into an existing Contact Role column and promotes its mapping', () => {
    const plan = contactSheetWritePlan({
      changedFields: ['title'],
      fields,
      headers: ['Company', 'Contact Name', 'Contact Role', 'Primary Email'],
      mappings: [
        {
          id: 'role-mapping',
          sourceColumn: 'Contact Role',
          targetField: 'customFields.Contact_Role_3',
        },
      ],
    });

    expect(plan.cells).toEqual([
      {
        columnIndex: 2,
        sourceColumn: 'Contact Role',
        targetField: 'title',
        value: 'Program Director',
      },
    ]);
    expect(plan.promotedMappings).toEqual([{ id: 'role-mapping', targetField: 'title' }]);
    expect(plan.newMappings).toEqual([]);
  });

  it('combines name edits for a mapped full-name column and protects formula-like roles', () => {
    const plan = contactSheetWritePlan({
      changedFields: ['firstName', 'lastName', 'title'],
      fields: { ...fields, title: '=IMPORTXML("unsafe")' },
      headers: ['Contact Name', 'Contact Role'],
      mappings: [
        { id: 'name', sourceColumn: 'Contact Name', targetField: 'fullName' },
        { id: 'role', sourceColumn: 'Contact Role', targetField: 'title' },
      ],
    });

    expect(plan.cells).toEqual([
      expect.objectContaining({ targetField: 'fullName', value: 'Pat Lee' }),
      expect.objectContaining({ targetField: 'title', value: `'=IMPORTXML("unsafe")` }),
    ]);
  });

  it('plans a new canonical column when an edited field is absent from the sheet', () => {
    const plan = contactSheetWritePlan({
      changedFields: ['timezone'],
      fields,
      headers: ['Contact Name', 'Primary Email'],
      mappings: [],
    });

    expect(plan.cells[0]).toMatchObject({
      columnIndex: 2,
      sourceColumn: 'Timezone',
      targetField: 'timezone',
      value: 'America/Los_Angeles',
    });
    expect(plan.newMappings[0]).toMatchObject({
      columnIndex: 2,
      sourceColumn: 'Timezone',
      targetField: 'timezone',
    });
  });

  it('converts zero-based indexes into A1 column names', () => {
    expect(sheetColumnName(0)).toBe('A');
    expect(sheetColumnName(25)).toBe('Z');
    expect(sheetColumnName(26)).toBe('AA');
    expect(sheetColumnName(701)).toBe('ZZ');
  });
});
