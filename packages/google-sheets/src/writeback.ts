import type { SheetCellValue, SheetRow } from './contracts';

const DANGEROUS_FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

/** Prefixes spreadsheet formula-like strings so exports and explicit write-back remain data. */
export function protectFormulaCell(value: SheetCellValue): SheetCellValue {
  if (typeof value !== 'string' || !DANGEROUS_FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

export function protectFormulaRows(rows: SheetRow[]): SheetRow[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, protectFormulaCell(value)])),
  );
}
