import { describe, expect, it } from 'vitest';

import {
  contactEditableFieldsSchema,
  mergeContactCustomFields,
  storedContactManualOverrides,
  withContactManualOverrides,
} from './contact-manual-overrides';

const editableContact = {
  email: 'person@example.org',
  firstName: 'Pat',
  lastName: 'Lee',
  phone: null,
  preferredChannel: 'EMAIL' as const,
  timezone: 'America/Los_Angeles',
  title: 'Program Director',
  type: 'PARTNER' as const,
};

describe('manual contact overrides', () => {
  it('validates and normalizes editable contact fields', () => {
    expect(
      contactEditableFieldsSchema.parse({ ...editableContact, email: ' Person@Example.ORG ' }),
    ).toMatchObject({ email: 'person@example.org' });
  });

  it('rejects an invalid timezone', () => {
    expect(() =>
      contactEditableFieldsSchema.parse({ ...editableContact, timezone: 'Mars/Olympus' }),
    ).toThrow();
  });

  it('stores overrides without replacing unrelated imported fields', () => {
    const stored = withContactManualOverrides(
      { sourceRow: 7 },
      editableContact,
      '2026-07-29T12:00:00.000Z',
    );

    expect(stored).toMatchObject({ sourceRow: 7 });
    expect(storedContactManualOverrides(stored)).toEqual(editableContact);
  });

  it('reserves the override key from imported custom fields', () => {
    const existing = withContactManualOverrides(
      { sourceRow: 7 },
      editableContact,
      '2026-07-29T12:00:00.000Z',
    );
    const merged = mergeContactCustomFields(existing, {
      manualOverrides: {
        ...editableContact,
        firstName: 'Injected',
        updatedAt: '2026-07-29T13:00:00.000Z',
      },
      sourceNote: 'preserved',
    });

    expect(storedContactManualOverrides(merged)).toEqual(editableContact);
    expect(merged).toMatchObject({ sourceNote: 'preserved', sourceRow: 7 });
  });
});
