import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalises a field value for display: returns '' for null/undefined, empty
 * strings, and the literal strings "null"/"undefined"/"NaN" (which sneak in from
 * imports or JSON), so the UI never shows the word "null". Everything else is
 * returned trimmed. Use as `clean(x) || 'fallback'`.
 */
export function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  const low = s.toLowerCase();
  return (s === '' || low === 'null' || low === 'undefined' || low === 'nan') ? '' : s;
}
