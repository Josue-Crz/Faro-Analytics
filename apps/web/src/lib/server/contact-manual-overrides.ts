import { z } from 'zod';

const nullableEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email()
  .nullable()
  .transform((value) => value?.toLocaleLowerCase('en-US') ?? null);

const nullableTextSchema = (maximum: number) => z.string().trim().max(maximum).nullable();

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, 'Timezone must be a valid IANA timezone.');

export const contactEditableFieldsSchema = z
  .object({
    email: nullableEmailSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: nullableTextSchema(50),
    preferredChannel: z.enum(['EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER']),
    timezone: timezoneSchema,
    title: nullableTextSchema(160),
    type: z.enum(['PARTICIPANT', 'SPONSOR', 'PARTNER', 'DONOR', 'SPEAKER', 'VENDOR', 'OTHER']),
  })
  .strict();

export type ContactEditableFields = z.infer<typeof contactEditableFieldsSchema>;

const storedManualOverridesSchema = contactEditableFieldsSchema.extend({
  updatedAt: z.string().datetime(),
});

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function storedContactManualOverrides(value: unknown): ContactEditableFields | null {
  const parsed = storedManualOverridesSchema.safeParse(jsonObject(value).manualOverrides);
  if (!parsed.success) return null;
  return {
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    phone: parsed.data.phone,
    preferredChannel: parsed.data.preferredChannel,
    timezone: parsed.data.timezone,
    title: parsed.data.title,
    type: parsed.data.type,
  };
}

export function mergeContactCustomFields(
  existingFields: unknown,
  importedFields: unknown,
): Record<string, unknown> {
  const existing = jsonObject(existingFields);
  const merged = {
    ...existing,
    ...jsonObject(importedFields),
  };
  delete merged.manualOverrides;
  if (storedContactManualOverrides(existing)) {
    merged.manualOverrides = existing.manualOverrides;
  }
  return merged;
}

export function withContactManualOverrides(
  customFields: unknown,
  fields: ContactEditableFields,
  updatedAt: string,
): Record<string, unknown> {
  return {
    ...jsonObject(customFields),
    manualOverrides: {
      ...fields,
      updatedAt,
    },
  };
}
