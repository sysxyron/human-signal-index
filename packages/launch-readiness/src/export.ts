// =============================================================================
// Audit export engine (Deliverable 15). PURE. Serialise rows to CSV or JSON with
// proper CSV escaping (and formula-injection neutralisation so a leading =,+,-,@
// in a cell can't execute when opened in a spreadsheet).
// =============================================================================

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialise rows to CSV. Columns are the union of keys (stable, first-seen order). */
export function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '';
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const header = cols.map(escapeCsvCell).join(',');
  const lines = rows.map((r) => cols.map((c) => escapeCsvCell(r[c])).join(','));
  return [header, ...lines].join('\r\n');
}

/** Serialise rows to pretty JSON. */
export function toJson(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function exportAudit(rows: ExportRow[], format: 'csv' | 'json'): string {
  return format === 'csv' ? toCsv(rows) : toJson(rows);
}
