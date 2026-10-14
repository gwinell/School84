/** Quote CSV cells and prevent spreadsheet applications from treating text as formulas. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const str = /^[=+\-@\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
