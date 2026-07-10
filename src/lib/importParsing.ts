// Shared spreadsheet-parsing helpers for the batch importers (catalogue + circulation).
// Kept dependency-light; SheetJS is lazy-loaded only when an Excel file is read.

// Robust native CSV parser — handles quoted fields, escaped quotes and CRLF.
export const parseCSV = (text: string): string[][] => {
  const lines: string[][] = [];
  let row: string[] = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines.filter(r => r.some(cell => cell.trim() !== ''));
};

// SheetJS (~500KB) — only pulled in when an Excel workbook is actually parsed.
let xlsxPromise: Promise<typeof import('xlsx')> | null = null;
export const loadXlsx = () => {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
};

// Read the first sheet of an .xlsx/.xls workbook into a rows × columns matrix.
export const readExcelMatrix = async (data: ArrayBuffer): Promise<string[][]> => {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(data, { type: 'array' });
  const name = wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1, blankrows: false, defval: '', raw: false,
  });
  return rows
    .map(r => (Array.isArray(r) ? r.map(c => (c == null ? '' : String(c)).trim()) : []))
    .filter(r => r.some(c => c !== ''));
};

// Is this a spreadsheet workbook (needs binary/ArrayBuffer reading)?
export const isExcelFile = (file: File): boolean =>
  /\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name)
  || file.type.includes('spreadsheetml')
  || file.type === 'application/vnd.ms-excel';

// Normalise a value for tolerant matching (case/space-insensitive).
export const normalizeKey = (s: unknown): string =>
  String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Digits/ISBN-only form of a code, for ISBN/barcode comparison.
export const normalizeCode = (s: unknown): string =>
  String(s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
