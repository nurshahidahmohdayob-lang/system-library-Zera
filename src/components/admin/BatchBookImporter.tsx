import React, { useState, useRef } from 'react';
import { 
  UploadCloud,
  X,
  CheckCircle2,
  AlertTriangle, 
  Loader2, 
  FileText, 
  FileSpreadsheet, 
  Sparkles, 
  Clipboard, 
  ChevronRight, 
  BookOpen, 
  Check, 
  RefreshCcw,
  Search,
  Book as BookIcon,
  Layers,
  ArrowRight,
  Link2
} from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Book } from '@/src/types';
import { BarcodeService } from '@/src/services/BarcodeService';
import { lookupBookByIsbn, lookupBookByTitle, isRealSynopsis } from '@/src/services/catalogService';

// pdf.js is ~1.3MB, so load it only when a PDF is actually imported instead of
// bundling it into the main app chunk. The web worker is wired up on first use.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return lib;
    });
  }
  return pdfjsPromise;
};

// SheetJS (~500KB) is likewise only loaded when an Excel file is imported.
let xlsxPromise: Promise<typeof import('xlsx')> | null = null;
const loadXlsx = () => {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
};

// ---- PDF text reconstruction helpers ----
// A single glyph run from pdf.js text content, with its page position.
type PdfFrag = { str: string; x: number; y: number; w: number };

// Split one visual line of fragments into cells wherever there's a wide
// horizontal gap. Returns the cell text and the x-start of each cell.
const lineToCells = (line: PdfFrag[]): { cells: string[]; xs: number[] } => {
  const ordered = [...line].sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  const xs: number[] = [];
  let cell = '';
  let startX: number | null = null;
  let prevEnd: number | null = null;
  for (const it of ordered) {
    if (prevEnd !== null && it.x - prevEnd > 12) {
      cells.push(cell.replace(/\s+/g, ' ').trim());
      xs.push(startX as number);
      cell = '';
      startX = null;
    }
    if (startX === null) startX = it.x;
    cell += (cell ? ' ' : '') + it.str;
    prevEnd = it.x + it.w;
  }
  if (cell.trim()) {
    cells.push(cell.replace(/\s+/g, ' ').trim());
    xs.push(startX as number);
  }
  return { cells, xs };
};

const isSerialCell = (s: string) => /^\d{1,5}$/.test(s.trim());
const isReportHeader = (cells: string[]) =>
  cells.includes('Title') && cells.some(c => /identifier|isbn/i.test(c));
const isReportNoise = (cells: string[]) =>
  cells.length <= 2 &&
  cells.every(c => /^(report:|sl|no|title|type|publisher|identifiers?|call|category|copies)/i.test(c.trim()));
const isReportFooter = (text: string) =>
  /showing\s+\d+\s+records\s+out\s+of|page\s+\d+\s+of\s+\d+/i.test(text);

// Reduce a mixed "ISBN: … ISBN_13: …" identifier blob to one clean number,
// preferring the 13-digit ISBN.
const cleanReportIsbn = (text: string): string => {
  const m13 = text.match(/ISBN[_ ]?13[:\s]*([0-9]{13})/i) || text.match(/\b(97[89][0-9]{10})\b/);
  if (m13) return m13[1];
  const m10 = text.match(/ISBN[:\s]*([0-9]{9}[0-9Xx])/i) || text.match(/\b([0-9]{9}[0-9Xx])\b/);
  if (m10) return m10[1].toUpperCase();
  return '';
};

// Reconstruct a wrapped "Report: Catalog Items"-style export, where each book
// record spans several visual lines (wrapped title/publisher + a separate
// ISBN_13 line). Records are anchored by a leading serial number (SL No), and
// every fragment is bucketed into a column by the x-positions taken from the
// header row. Returns [headers, ...records], or null when the PDF isn't this
// kind of enumerated report (so callers fall back to generic extraction).
const reconstructReportMatrix = (lines: PdfFrag[][]): string[][] | null => {
  let colX: number[] | null = null;
  let headerCells: string[] | null = null;
  for (const line of lines) {
    const { cells, xs } = lineToCells(line);
    if (isReportHeader(cells)) {
      colX = xs.slice();
      headerCells = cells.slice();
      break;
    }
  }
  if (!colX || !headerCells || colX.length < 3) return null;

  const cols = colX;
  const isbnCol = headerCells.findIndex(c => /identifier|isbn/i.test(c));
  const colOf = (x: number) => {
    let idx = 0;
    for (let i = 0; i < cols.length; i++) {
      if (x >= cols[i] - 6) idx = i;
      else break;
    }
    return idx;
  };

  const records: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    const { cells } = lineToCells(line);
    if (
      isReportHeader(cells) ||
      isReportNoise(cells) ||
      isReportFooter(cells.join(' ')) ||
      /^report:/i.test(cells[0] || '')
    ) {
      continue;
    }

    const row = Array.from({ length: cols.length }, () => '');
    for (const it of [...line].sort((a, b) => a.x - b.x)) {
      const c = colOf(it.x);
      row[c] = (row[c] ? row[c] + ' ' : '') + it.str;
    }

    if (isSerialCell(row[0] || '')) {
      // New record.
      if (cur) records.push(cur);
      cur = row.map(c => c.replace(/\s+/g, ' ').trim());
    } else if (cur) {
      // Continuation of the current record — append to matching columns.
      for (let i = 0; i < row.length; i++) {
        const t = row[i].replace(/\s+/g, ' ').trim();
        if (t) cur[i] = (cur[i] ? cur[i] + ' ' : '') + t;
      }
    }
  }
  if (cur) records.push(cur);
  if (records.length === 0) return null;

  if (isbnCol >= 0) {
    for (const r of records) r[isbnCol] = cleanReportIsbn(r[isbnCol] || '');
  }
  return [headerCells.map(h => h.trim()), ...records];
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error in Importer: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface BatchBookImporterProps {
  onClose: () => void;
}

interface UploadedRow {
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  description?: string;
}

interface ImportErrorItem {
  rowNum: number;
  rawText: string;
  reason: string;
}

interface ColumnIndices {
  titleIdx: number;
  authorIdx: number;
  isbnIdx: number;
  categoryIdx: number;
  copiesIdx: number;
  descriptionIdx: number;
}

// Guess which column holds which field from the header names. Each header maps
// to at most one field; later matches win (same as the original inline logic).
const deriveColumnIndices = (fileHeaders: string[]): ColumnIndices => {
  const idx: ColumnIndices = {
    titleIdx: -1, authorIdx: -1, isbnIdx: -1, categoryIdx: -1, copiesIdx: -1, descriptionIdx: -1,
  };
  fileHeaders.forEach((h, i) => {
    const lower = h.toLowerCase();
    if (lower.includes('title') || lower.includes('bookname') || lower.includes('name')) idx.titleIdx = i;
    else if (lower.includes('author') || lower.includes('writer')) idx.authorIdx = i;
    else if (lower.includes('isbn') || lower.includes('identifier')) idx.isbnIdx = i;
    else if (lower.includes('cat') || lower.includes('subject')) idx.categoryIdx = i;
    else if (lower.includes('cop') || lower.includes('quantity') || lower === 'qty') idx.copiesIdx = i;
    else if (lower.includes('summar') || lower.includes('synops') || lower.includes('descrip') || lower.includes('abstract') || lower.includes('notes')) idx.descriptionIdx = i;
  });
  return idx;
};

// Build the import rows from a body matrix given the resolved column indices.
// Rows with neither a title nor an ISBN are collected as skippable errors.
const rowsFromMatrix = (
  body: string[][],
  idx: ColumnIndices,
): { rows: UploadedRow[]; errors: ImportErrorItem[] } => {
  const rows: UploadedRow[] = [];
  const errors: ImportErrorItem[] = [];
  body.forEach((columns, index) => {
    const rowNum = index + 2; // header is row 1
    const title = idx.titleIdx !== -1 ? (columns[idx.titleIdx] || '').trim() : '';
    const author = idx.authorIdx !== -1 ? (columns[idx.authorIdx] || '').trim() : '';
    const isbn = idx.isbnIdx !== -1 ? (columns[idx.isbnIdx] || '').replace(/[^0-9X]/gi, '').trim() : '';
    const category = idx.categoryIdx !== -1 ? (columns[idx.categoryIdx] || '').trim() : 'Fiction';
    const rawCopies = idx.copiesIdx !== -1 ? parseInt(columns[idx.copiesIdx] || '1', 10) : 1;
    const copies = isNaN(rawCopies) || rawCopies < 1 ? 1 : rawCopies;
    const description = idx.descriptionIdx !== -1 ? (columns[idx.descriptionIdx] || '').trim() : '';

    if (!title && !isbn) {
      errors.push({
        rowNum,
        rawText: columns.join(','),
        reason: 'Both Title and ISBN are empty. At least one identifier is required.',
      });
    } else {
      rows.push({ title, author, isbn, category, copies, description });
    }
  });
  return { rows, errors };
};

interface ActiveJob {
  index: number;
  row: UploadedRow;
  status: 'pending' | 'lookup' | 'saving' | 'completed' | 'failed';
  matchedLogo?: string;
  matchedTitle?: string;
  matchedAuthor?: string;
  matchedCategory?: string;
  matchedYear?: number;
  matchedPublisher?: string;
  coverUrl?: string;
  barcode?: string;
  method?: string;
  error?: string;
}

export const BatchBookImporter: React.FC<BatchBookImporterProps> = ({ onClose }) => {
  const [step, setStep] = useState<number>(1); // 1: Choose/Paste, 2: Column Mapping, 3: Sync & Store, 4: Result
  const [inputText, setInputText] = useState<string>('');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [linkLoading, setLinkLoading] = useState<boolean>(false);
  const [linkError, setLinkError] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [fileLoading, setFileLoading] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<UploadedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [errorLogs, setErrorLogs] = useState<ImportErrorItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Field Mapping states state
  const [titleIdx, setTitleIdx] = useState<number>(-1);
  const [authorIdx, setAuthorIdx] = useState<number>(-1);
  const [isbnIdx, setIsbnIdx] = useState<number>(-1);
  const [categoryIdx, setCategoryIdx] = useState<number>(-1);
  const [copiesIdx, setCopiesIdx] = useState<number>(-1);
  const [descriptionIdx, setDescriptionIdx] = useState<number>(-1);

  // Live import state
  const [importJobs, setImportJobs] = useState<ActiveJob[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [successfulImports, setSuccessfulImports] = useState<number>(0);
  const [failedImports, setFailedImports] = useState<number>(0);

  // Robust Native CSV Parser
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [''];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push('');
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines.filter(r => r.some(cell => cell.trim() !== ''));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // Load a header+rows matrix, auto-guess the columns, and jump straight to the
  // review-and-confirm list. Column mapping is only shown as a fallback when we
  // can't confidently find a Title or ISBN column. Shared by CSV/link/PDF.
  const applyMatrix = (matrix: string[][]) => {
    if (matrix.length === 0) {
      alert('No readable rows were found.');
      return;
    }
    const fileHeaders = matrix[0].map(h => h.trim());
    const body = matrix.slice(1);
    const idx = deriveColumnIndices(fileHeaders);

    // Keep the detected columns in state so the manual-mapping fallback
    // (Step 2) opens pre-filled if the user chooses to adjust.
    setHeaders(fileHeaders);
    setRawMatrix(body);
    setTitleIdx(idx.titleIdx); setAuthorIdx(idx.authorIdx); setIsbnIdx(idx.isbnIdx);
    setCategoryIdx(idx.categoryIdx); setCopiesIdx(idx.copiesIdx); setDescriptionIdx(idx.descriptionIdx);

    if (idx.titleIdx !== -1 || idx.isbnIdx !== -1) {
      // Confident enough — skip mapping, show the books for confirmation.
      const { rows, errors } = rowsFromMatrix(body, idx);
      setParsedRows(rows);
      setErrorLogs(errors);
      setStep(3);
    } else {
      // Couldn't identify an anchor column — let the user map it manually.
      setStep(2);
    }
  };

  const processFileContent = (content: string, fileName?: string) => {
    const isCsv = fileName?.endsWith('.csv') || content.includes(',');

    if (isCsv) {
      const matrix = parseCSV(content);
      if (matrix.length > 0) {
        applyMatrix(matrix);
      } else {
        alert('File content is empty or unreadable.');
      }
    } else {
      // Plain text parsing (Assuming one ISBN or book title per line)
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows: UploadedRow[] = lines.map(line => {
        // Is it an ISBN? Look for numbers
        const cleanLine = line.replace(/[^0-9X]/gi, '');
        const looksLikeIsbn = cleanLine.length >= 10 && cleanLine.length <= 13 && /^\d+x?$/i.test(cleanLine);
        
        if (looksLikeIsbn) {
          return { title: '', author: '', isbn: cleanLine, category: 'General', copies: 1 };
        } else {
          // Check if there is Author split by comma or semi-colon
          const parts = line.split(/[,;|]/);
          if (parts.length > 1) {
            return { title: parts[0].trim(), author: parts[1].trim(), isbn: '', category: 'General', copies: 1 };
          }
          return { title: line, author: '', isbn: '', category: 'General', copies: 1 };
        }
      });
      setParsedRows(rows);
      setStep(3);
    }
  };

  // Turn a text-based PDF into a rows × columns matrix. Fragments are grouped
  // into visual lines by y-position; enumerated "report" exports (one record
  // wrapped across several lines) are reconstructed record-by-record, and
  // everything else falls back to a simple one-line-per-row table split on
  // wide horizontal gaps.
  const extractPdfMatrix = async (data: ArrayBuffer): Promise<string[][]> => {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({ data }).promise;

    try {
      const lines: PdfFrag[][] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();

        const items: PdfFrag[] = (content.items as any[])
          .filter(it => typeof it.str === 'string' && it.str.trim() !== '')
          .map(it => ({
            str: it.str as string,
            x: it.transform[4] as number,
            y: it.transform[5] as number,
            w: it.width as number,
          }));
        if (items.length === 0) continue;

        // Group fragments into visual lines (top→bottom), tolerating y jitter.
        const byLine = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
        let line: PdfFrag[] = [];
        let lineY: number | null = null;
        for (const it of byLine) {
          if (lineY === null || Math.abs(it.y - lineY) <= 3) {
            line.push(it);
            if (lineY === null) lineY = it.y;
          } else {
            lines.push(line);
            line = [it];
            lineY = it.y;
          }
        }
        if (line.length) lines.push(line);
      }

      // Prefer structured reconstruction for wrapped "report" exports.
      const report = reconstructReportMatrix(lines);
      if (report) return report;

      // Otherwise, one visual line per row, columns split on wide gaps.
      return lines
        .map(line => lineToCells(line).cells.filter(Boolean))
        .filter(cells => cells.length > 0);
    } finally {
      doc.destroy();
    }
  };

  const processPdf = async (data: ArrayBuffer) => {
    setFileError('');
    setFileLoading(true);
    try {
      const matrix = await extractPdfMatrix(data);
      if (matrix.length === 0) {
        setFileError('No selectable text found in this PDF. If it is a scanned image, save the list as a CSV or paste the titles/ISBNs below instead.');
        return;
      }

      const maxCols = Math.max(...matrix.map(r => r.length));
      if (maxCols >= 2) {
        // Looks like a table: keep multi-column rows and pad them to a
        // consistent width so column mapping lines up. Stray single-cell
        // lines (page numbers, headings) are dropped.
        const table = matrix
          .filter(r => r.length >= 2)
          .map(r => {
            const padded = [...r];
            while (padded.length < maxCols) padded.push('');
            return padded.slice(0, maxCols);
          });
        if (table.length > 0) {
          applyMatrix(table);
          return;
        }
      }

      // Otherwise treat it as a plain list — one book per line.
      processFileContent(matrix.map(r => r.join(' ')).join('\n'));
    } catch (err) {
      console.error('PDF import failed:', err);
      setFileError('Could not read this PDF file. It may be encrypted or corrupted — try exporting it as CSV instead.');
    } finally {
      setFileLoading(false);
    }
  };

  // Read an Excel workbook (.xlsx/.xls) and hand its first sheet to the same
  // column-mapping/review flow as a CSV.
  const processExcel = async (data: ArrayBuffer) => {
    setFileError('');
    setFileLoading(true);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(data, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const sheet = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
      if (!sheet) {
        setFileError('That workbook has no sheets to read.');
        return;
      }
      // header:1 → array-of-arrays; raw:false renders cells as shown (keeps
      // text ISBNs intact); defval keeps row lengths aligned.
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1, blankrows: false, defval: '', raw: false,
      });
      const matrix = rows
        .map(r => (Array.isArray(r) ? r.map(c => (c == null ? '' : String(c)).trim()) : []))
        .filter(r => r.some(c => c !== ''));
      if (matrix.length === 0) {
        setFileError('The first sheet in that Excel file appears to be empty.');
        return;
      }
      applyMatrix(matrix);
    } catch (err) {
      console.error('Excel import failed:', err);
      setFileError('Could not read this Excel file. Make sure it is a valid .xlsx/.xls workbook, or export it as CSV.');
    } finally {
      setFileLoading(false);
    }
  };

  // Route a picked/dropped file by type: PDFs are parsed for text, Excel
  // workbooks through SheetJS, everything else as plain text / CSV.
  const handleFile = (file: File) => {
    setFileError('');
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    const isExcel = /\.(xlsx|xlsm|xlsb|xls)$/.test(name)
      || file.type.includes('spreadsheetml')
      || file.type === 'application/vnd.ms-excel';
    const reader = new FileReader();
    if (isPdf) {
      reader.onload = (event) => {
        if (event.target?.result instanceof ArrayBuffer) {
          processPdf(event.target.result);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (isExcel) {
      reader.onload = (event) => {
        if (event.target?.result instanceof ArrayBuffer) {
          processExcel(event.target.result);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          processFileContent(event.target.result, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
    // Allow re-selecting the same file after a failed/aborted import.
    e.target.value = '';
  };

  const handlePasteSubmit = () => {
    if (!inputText.trim()) {
      alert('Please paste some text/CSV book list to proceed.');
      return;
    }
    processFileContent(inputText);
  };

  const handleLinkImport = async () => {
    const url = linkUrl.trim();
    setLinkError('');
    if (!url) {
      setLinkError('Paste a spreadsheet or CSV link first.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setLinkError('Enter a full link starting with https://');
      return;
    }
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/v1/fetch-sheet?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.csv) {
        setLinkError(data?.error || 'Could not read books from that link.');
        return;
      }
      if (!data.csv.trim()) {
        setLinkError('The link opened, but the sheet appears to be empty.');
        return;
      }
      processFileContent(data.csv, 'import.csv');
    } catch {
      setLinkError('Network error fetching the link. Is the dev server running?');
    } finally {
      setLinkLoading(false);
    }
  };

  const finalizeMapping = () => {
    if (titleIdx === -1 && isbnIdx === -1) {
      alert('Please choose at least the Book Title or the ISBN column.');
      return;
    }
    const { rows, errors } = rowsFromMatrix(rawMatrix, {
      titleIdx, authorIdx, isbnIdx, categoryIdx, copiesIdx, descriptionIdx,
    });
    setParsedRows(rows);
    setErrorLogs(errors);
    setStep(3);
  };

  const triggerSearchAndSync = async () => {
    if (parsedRows.length === 0) {
      alert('No books detected to import.');
      return;
    }

    // Final permission gate — nothing is written to the catalogue until the
    // librarian explicitly confirms here.
    const proceed = window.confirm(
      `Add these ${parsedRows.length} book${parsedRows.length !== 1 ? 's' : ''} to the library catalogue?\n\nThey will be looked up online and saved permanently. Click Cancel to review them again.`
    );
    if (!proceed) return;

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: parsedRows.length });
    setSuccessfulImports(0);
    setFailedImports(0);

    const jobs: ActiveJob[] = parsedRows.map((row, idx) => ({
      index: idx,
      row,
      status: 'pending'
    }));
    setImportJobs(jobs);

    // Sequence Queue execution
    for (let i = 0; i < parsedRows.length; i++) {
      const currentJob = jobs[i];
      
      setImportJobs(prev => prev.map((j, k) => k === i ? { ...j, status: 'lookup' } : j));
      setSyncProgress(prev => ({ ...prev, current: i + 1 }));

      let matchedBook: Partial<Book> | null = null;
      let syncMethod = 'Fallback Manual';
      const syncedCover = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600'; // Default beautiful aesthetic placeholder

      try {
        // Step 1: Perform Deep Z39.50/ISBN Query Integration
        if (currentJob.row.isbn) {
          matchedBook = await lookupBookByIsbn(currentJob.row.isbn);
          syncMethod = 'Z39.50 / ISBN Auto-Sync';
        }

        // Step 2: Use title lookup as lookup bypass if no direct ISBN record exists
        if (!matchedBook && currentJob.row.title) {
          const matchResult = await lookupBookByTitle(currentJob.row.title);
          if (matchResult && matchResult.length > 0) {
            matchedBook = matchResult[0];
            syncMethod = 'Title-Matched Sync';
          }
        }

        // Step 3: Set status or save fallbacks
        const titleToUse = matchedBook?.title || currentJob.row.title || 'Untitled Book';
        const authorToUse = matchedBook?.author || currentJob.row.author || 'Unknown Author';
        const isbnToUse = matchedBook?.isbn || currentJob.row.isbn || '';
        const coverToUse = matchedBook?.coverUrl || syncedCover;
        const categoryToUse = matchedBook?.category || currentJob.row.category || 'Fiction';
        // Only treat a genuine synopsis as "already known" — placeholder strings
        // stamped by enrichBookDetails would otherwise suppress the server-side
        // title/ISBN synopsis search below.
        const descToUse = currentJob.row.description?.trim()
          || (isRealSynopsis(matchedBook?.description) ? matchedBook!.description! : '');
        const publisherToUse = matchedBook?.publisher || 'Zera Archives';
        const yearToUse = matchedBook?.publishedYear || new Date().getFullYear();
        const subjectsToUse = matchedBook?.subjects || [categoryToUse];
        const pageCountToUse = typeof matchedBook?.pageCount === 'number' ? matchedBook.pageCount : 0;
        const languageToUse = matchedBook?.language || 'English';

        // Step 3.5: Query AI Coprocessor for high-fidelity synopsis & metadata enrichment
        let enrichedDetails = null;
        try {
          const enrichRes = await fetch('/api/v1/enrich-book-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // Don't send the 'Untitled Book' fallback — a title search on it could
              // match a wrong book; the server can look up by ISBN alone.
              title: titleToUse !== 'Untitled Book' ? titleToUse : '',
              author: authorToUse !== 'Unknown Author' ? authorToUse : '',
              isbn: isbnToUse,
              description: descToUse
            })
          });
          if (enrichRes.ok) {
            enrichedDetails = await enrichRes.json();
          }
        } catch (err) {
          console.warn("AI enrichment during batch import timed out/failed:", err);
        }

        const finalDesc = currentJob.row.description?.trim()
          || [enrichedDetails?.description, matchedBook?.description].find(isRealSynopsis)
          || 'No synopsis/abstract available in public bibliographic databases.';
        const finalAuthor = enrichedDetails?.author || authorToUse;
        const finalCategory = enrichedDetails?.category || categoryToUse;
        const finalPublisher = enrichedDetails?.publisher || publisherToUse;
        const finalYear = enrichedDetails?.publishedYear || yearToUse;
        const finalSubjects = enrichedDetails?.subjects || subjectsToUse;
        const finalPageCount = enrichedDetails?.pageCount || pageCountToUse;

        // Step 4: Generate unique Sequence Barcode
        setImportJobs(prev => prev.map((j, k) => k === i ? { ...j, status: 'saving' } : j));
        const matchedBarcode = await BarcodeService.generateNextBarcode('book');

        // Step 5: Save record to Firestore DB
        const now = new Date().toISOString();
        const bookPayload = {
          title: titleToUse,
          author: finalAuthor,
          isbn: isbnToUse,
          barcode: matchedBarcode,
          category: finalCategory,
          description: finalDesc,
          coverUrl: coverToUse,
          publisher: finalPublisher,
          publishedYear: finalYear,
          subjects: finalSubjects,
          pageCount: finalPageCount,
          lexileLevel: enrichedDetails?.lexileLevel || '',
          language: languageToUse,
          totalCopies: currentJob.row.copies,
          availableCopies: currentJob.row.copies,
          status: 'available',
          createdAt: now,
          updatedAt: now
        };

        try {
          await addDoc(collection(db, 'books'), bookPayload);
          
          setImportJobs(prev => prev.map((j, k) => k === i ? {
            ...j,
            status: 'completed',
            matchedTitle: titleToUse,
            matchedAuthor: finalAuthor,
            matchedCategory: finalCategory,
            matchedYear: finalYear,
            matchedPublisher: finalPublisher,
            coverUrl: coverToUse,
            barcode: matchedBarcode,
            method: syncMethod
          } : j));
          setSuccessfulImports(prev => prev + 1);
        } catch (dbError) {
          handleFirestoreError(dbError, OperationType.WRITE, 'books');
        }

      } catch (err) {
        console.error('Failed to sync book row:', i, err);
        
        // Add minimal error info to state but proceed so user is not blocked
        setImportJobs(prev => prev.map((j, k) => k === i ? { 
          ...j, 
          status: 'failed', 
          error: err instanceof Error ? err.message : String(err) 
        } : j));
        setFailedImports(prev => prev + 1);
      }

      // Small throttling delay to look elegant, avoid API locks, and give a movie-like registry compilation feel!
      await new Promise(resolve => setTimeout(resolve, 520));
    }

    setIsSyncing(false);
    setStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zera-emerald-dark/60 backdrop-blur-md" onClick={() => !isSyncing && onClose()} />
      
      <div className="relative w-full max-w-4xl bg-white rounded-[2rem] border border-natural-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none animate-in scale-in float-up duration-500">
        
        {/* Upper Brand Header Bar */}
        <div className="flex justify-between items-center px-8 py-5 border-b border-natural-border bg-natural-bg shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-zera-emerald/10 text-zera-emerald rounded-xl flex items-center justify-center font-bold">
               <Layers className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-serif text-lg font-black text-zera-emerald leading-tight">Batch Catalog Registry Sync</h3>
                <p className="text-[10px] font-bold text-natural-muted uppercase mt-0.5 tracking-wider">Z39.50 Academic Autoconnect Protocol</p>
             </div>
          </div>
          <button 
            disabled={isSyncing}
            onClick={onClose}
            className="p-2 text-natural-muted hover:text-red-500 rounded-full hover:bg-natural-border/30 transition-all disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body Space */}
        <div className="p-8 flex-1 overflow-y-auto min-h-[400px]">
          
          {/* STEP 1: UPLOAD / PASTING CONTAINER */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                 <h4 className="text-xl font-serif font-black text-zera-emerald">Upload or Paste Book Index</h4>
                 <p className="text-xs text-natural-muted leading-relaxed font-medium">
                   Quickly import multiple titles into Zera library database. We support Excel workbooks (<span className="font-bold text-zera-emerald">.xlsx</span>), comma-separated files (<span className="font-bold text-zera-emerald">.csv</span>), plain lists (<span className="font-bold text-zera-emerald">.txt</span>), book-list documents (<span className="font-bold text-zera-emerald">.pdf</span>), or copying directly from a sheet.
                 </p>
              </div>

              {/* Drag n Drop Sandbox */}
              <div 
                className={`border-3 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all ${
                  dragActive 
                    ? 'border-zera-yellow bg-zera-yellow/5 scale-[0.99] shadow-inner' 
                    : 'border-natural-border hover:border-zera-emerald/30 bg-natural-bg/40 hover:bg-natural-bg/80'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className="w-16 h-16 bg-white border border-natural-border rounded-2xl flex items-center justify-center text-zera-emerald shadow-sm mb-4 transition-transform group-hover:scale-110">
                  {fileLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
                </div>
                <div className="space-y-2">
                  {fileLoading ? (
                    <p className="text-sm font-black text-natural-text">Reading your file…</p>
                  ) : (
                    <>
                      <p className="text-sm font-black text-natural-text">Drag & drop your files here</p>
                      <p className="text-xs text-natural-muted">Excel, CSV, TXT or PDF — or click to choose from disk</p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileLoading}
                  className="mt-6 px-6 py-2.5 bg-white border border-natural-border hover:border-zera-emerald/30 text-natural-text text-xs font-black uppercase tracking-wider rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50"
                >
                  Choose File
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".csv,.txt,.pdf,.xlsx,.xlsm,.xlsb,.xls"
                  onChange={handleFileSelect}
                />
              </div>

              {fileError && (
                <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {fileError}
                </p>
              )}

              {/* Import from Link (Google Sheet / CSV URL) */}
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-natural-muted uppercase tracking-widest block flex items-center gap-1.5">
                   <Link2 className="w-3.5 h-3.5 text-zera-emerald" /> Import from a Link (Google Sheet or CSV URL)
                 </label>
                 <div className="flex flex-col sm:flex-row gap-3">
                   <input
                     type="url"
                     inputMode="url"
                     placeholder="https://docs.google.com/spreadsheets/d/…  or  https://…/books.csv"
                     value={linkUrl}
                     onChange={e => { setLinkUrl(e.target.value); if (linkError) setLinkError(''); }}
                     onKeyDown={e => { if (e.key === 'Enter' && !linkLoading) handleLinkImport(); }}
                     disabled={linkLoading}
                     className="flex-1 bg-natural-bg/40 border border-natural-border focus:bg-white rounded-2xl px-4 py-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald antialiased disabled:opacity-50"
                   />
                   <button
                     onClick={handleLinkImport}
                     disabled={linkLoading}
                     className="px-6 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow transition-all disabled:opacity-60 shrink-0"
                   >
                     {linkLoading
                       ? (<><Loader2 className="w-4 h-4 animate-spin" /> Fetching…</>)
                       : (<>Import from Link <ChevronRight className="w-4 h-4" /></>)}
                   </button>
                 </div>
                 {linkError
                   ? (
                     <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-1.5">
                       <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {linkError}
                     </p>
                   )
                   : (
                     <p className="text-[10px] text-natural-muted leading-relaxed">
                       Paste a direct <span className="font-bold text-zera-emerald">.csv</span> URL, or a Google Sheet link. On a <span className="font-bold text-zera-emerald">school / Workspace account</span>, "Anyone with the link" can be blocked for outside servers — if you get a 403, open the Sheet and use <span className="font-bold text-zera-emerald">File ▸ Share ▸ Publish to web ▸ CSV</span>, then paste that published link here. We'll pull every row, then let you map the columns just like a file upload.
                     </p>
                   )}
              </div>

              {/* Paste Segment Fallback */}
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Alternative: Direct Copy-Paste from Sheets</label>
                 <textarea 
                   rows={5}
                   placeholder="Example CSV structure:&#10;ISBN, Title, Author, Category, Copies&#10;9780141439518, Pride and Prejudice, Jane Austen, Fiction, 3&#10;&#10;Or a raw list of ISBNs (one per line):&#10;9780061120084&#10;9780451524935"
                   value={inputText}
                   onChange={e => setInputText(e.target.value)}
                   className="w-full bg-natural-bg/40 border border-natural-border focus:bg-white rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald antialiased leading-relaxed"
                 />
                 <div className="flex justify-between items-center pt-2">
                    <span className="text-[9px] font-bold text-zera-yellow-dark bg-zera-yellow/15 border border-zera-yellow/10 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> No list on-hand? Paste a line of ISBN to test!
                    </span>
                    <button 
                      onClick={handlePasteSubmit}
                      className="px-6 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow transition-all"
                    >
                      Process Copy-Pasted Data <ChevronRight className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING DIALOG */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-1.5">
                 <h4 className="text-xl font-serif font-black text-zera-emerald">Map File Columns</h4>
                 <p className="text-xs text-natural-muted font-medium">
                   We detected <span className="font-bold text-zera-emerald">{headers.length} columns</span> in your uploaded sheet. Align the selector mappings below to help the database identify where details lie.
                 </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-natural-bg p-6 rounded-3xl border border-natural-border">
                
                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Book Title</span>
                   <select 
                     value={titleIdx}
                     onChange={e => setTitleIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Primary Author</span>
                   <select 
                     value={authorIdx}
                     onChange={e => setAuthorIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">ISBN Number (Recommended)</span>
                   <select 
                     value={isbnIdx}
                     onChange={e => setIsbnIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Subject / Category</span>
                   <select 
                     value={categoryIdx}
                     onChange={e => setCategoryIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore (Default 'Fiction') --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Copies / Volume Inventory</span>
                   <select 
                     value={copiesIdx}
                     onChange={e => setCopiesIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore (Default 1 Copy) --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Summary / Synopsis</span>
                   <select 
                     value={descriptionIdx}
                     onChange={e => setDescriptionIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

              </div>

              {/* Sample Data Matrix */}
              <div className="space-y-3">
                 <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Data rows sampler preview</span>
                 <div className="border border-natural-border rounded-2xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                       <thead className="bg-natural-bg text-natural-muted select-none font-bold">
                          <tr>
                             {headers.map((h, idx) => (
                                <th key={idx} className="px-4 py-2 border-b border-natural-border font-mono text-[10px] uppercase">
                                  {h}
                                </th>
                             ))}
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-natural-bg/60 text-natural-text font-mono">
                          {rawMatrix.slice(0, 3).map((row, idx) => (
                             <tr key={idx}>
                                {row.map((cell, cIdx) => (
                                   <td key={cIdx} className="px-4 py-2 border-b border-natural-border">
                                     {cell}
                                   </td>
                                ))}
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-natural-border">
                 <button 
                   onClick={() => setStep(1)}
                   className="px-6 py-3 bg-natural-bg border border-natural-border text-natural-text text-xs font-black uppercase tracking-widest rounded-xl hover:bg-natural-border/30 transition-all"
                 >
                   Go Back
                 </button>
                 <button 
                   onClick={finalizeMapping}
                   className="px-8 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all"
                 >
                   Apply Column Mappings
                 </button>
              </div>
            </div>
          )}

          {/* STEP 3: QUEUE SYNC WITH METADATA PLATFORM */}
          {step === 3 && (
            <div className="space-y-6">
              
              {!isSyncing && (
                <div className="space-y-5">
                  <div className="text-center max-w-xl mx-auto space-y-1.5">
                     <BookOpen className="w-10 h-10 text-zera-emerald mx-auto" />
                     <h4 className="text-xl font-serif font-black text-zera-emerald">Review {parsedRows.length} Book{parsedRows.length !== 1 ? 's' : ''}</h4>
                     <p className="text-xs text-natural-muted font-medium">
                       Here's what we read from your file. Click <span className="font-bold text-zera-emerald">Yes, add them</span> and we'll look up covers &amp; details, assign accession numbers, and catalog them. <span className="font-bold">Nothing is saved until you confirm.</span>
                     </p>
                  </div>

                  {errorLogs.length > 0 && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs border border-red-100 flex items-start gap-2 max-w-md mx-auto text-left">
                       <AlertTriangle className="w-5 h-5 shrink-0" />
                       <div>
                         <p className="font-bold">{errorLogs.length} row{errorLogs.length !== 1 ? 's' : ''} skipped</p>
                         <p className="opacity-90">Missing both a title and an ISBN — these won't be added.</p>
                       </div>
                    </div>
                  )}

                  {/* Review list — the exact books that will be catalogued */}
                  <div className="border border-natural-border rounded-2xl overflow-hidden bg-white">
                    <div className="max-h-[320px] overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-natural-bg text-natural-muted select-none sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">#</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">Title</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">Author</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">ISBN</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">Category</th>
                            <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider text-center">Copies</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-natural-bg/60 text-natural-text">
                          {parsedRows.map((r, i) => (
                            <tr key={i} className="hover:bg-natural-bg/30">
                              <td className="px-4 py-2 text-natural-muted font-mono text-[10px]">{i + 1}</td>
                              <td className="px-4 py-2 font-bold max-w-xs truncate" title={r.title}>
                                {r.title || <span className="text-natural-muted italic font-normal">will look up by ISBN</span>}
                              </td>
                              <td className="px-4 py-2 text-natural-muted truncate max-w-[9rem]" title={r.author}>{r.author || '—'}</td>
                              <td className="px-4 py-2 font-mono text-[10px] text-natural-muted">{r.isbn || '—'}</td>
                              <td className="px-4 py-2 text-natural-muted truncate max-w-[8rem]" title={r.category}>{r.category || '—'}</td>
                              <td className="px-4 py-2 text-center font-bold">{r.copies}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-3 pt-1">
                    <button
                      onClick={() => setStep(headers.length > 0 ? 2 : 1)}
                      className="px-5 py-3 bg-natural-bg border border-natural-border text-natural-text text-xs font-black uppercase tracking-widest rounded-xl hover:bg-natural-border/30 transition-all"
                    >
                      {headers.length > 0 ? 'Adjust columns' : 'Back'}
                    </button>
                    <button
                      onClick={triggerSearchAndSync}
                      disabled={parsedRows.length === 0}
                      className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-xl flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> Yes, add {parsedRows.length} book{parsedRows.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              )}

              {isSyncing && (
                <div className="space-y-6">
                   
                   {/* Sync Status Banner */}
                   <div className="bg-gradient-to-r from-zera-emerald to-zera-emerald-dark text-white p-6 rounded-3xl border border-zera-emerald-dark shrink-0 flex items-center justify-between shadow-lg">
                      <div className="space-y-1">
                         <span className="text-[9px] font-black uppercase tracking-widest text-zera-yellow">Status: Synthesizing Bibliographic Stack</span>
                         <h4 className="text-lg font-serif font-bold">Cataloging record {syncProgress.current} / {syncProgress.total}</h4>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="flex flex-col text-right">
                           <span className="text-xs font-mono font-black">{Math.round((syncProgress.current/syncProgress.total)*100)}%</span>
                           <span className="text-[8px] font-black uppercase tracking-widest text-white/75">Registry Completion</span>
                         </div>
                         <Loader2 className="w-6 h-6 animate-spin text-zera-yellow" />
                      </div>
                   </div>

                   {/* Micro Progress Bar */}
                   <div className="w-full bg-natural-bg h-3 rounded-full overflow-hidden border border-natural-border p-0.5">
                     <div 
                       className="bg-zera-yellow h-full rounded-full transition-all duration-300"
                       style={{ width: `${(syncProgress.current/syncProgress.total)*100}%` }}
                     />
                   </div>

                   {/* Active Sync Visual Cards Grid */}
                   <div className="space-y-3">
                      <div className="flex justify-between items-center select-none">
                         <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">Active Metadata Lookups</span>
                         <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
                            <span className="text-zera-emerald">Success: {successfulImports}</span>
                            <span className="text-red-500">Failed: {failedImports}</span>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 border border-transparent rounded-2xl">
                          {importJobs.map((job) => {
                             const isCurrent = job.status === 'lookup' || job.status === 'saving';
                             return (
                               <div 
                                 key={job.index}
                                 className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 ${
                                   job.status === 'completed' 
                                     ? 'bg-white border-zera-emerald/20 shadow-sm opacity-60' 
                                     : job.status === 'failed'
                                     ? 'bg-red-50/50 border-red-200'
                                     : isCurrent
                                     ? 'bg-zera-yellow/5 border-zera-yellow shadow-md scale-[1.01]'
                                     : 'bg-white border-natural-border opacity-40'
                                 }`}
                               >
                                  {/* Cover sync preview */}
                                  <div className="w-10 h-14 bg-natural-bg rounded-lg border border-natural-border overflow-hidden shrink-0 shadow-sm relative flex items-center justify-center">
                                     {job.coverUrl ? (
                                        <img src={job.coverUrl} className="w-full h-full object-cover" alt="Matched" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                                     ) : (
                                        <BookIcon className={`w-5 h-5 text-natural-muted ${isCurrent && 'animate-pulse'}`} />
                                     )}
                                  </div>

                                  <div className="flex-1 min-w-0 space-y-1">
                                     <div className="flex justify-between items-start gap-2">
                                        <h5 className="text-xs font-black text-natural-text truncate leading-tight">
                                          {job.matchedTitle || job.row.title || `ISBN: ${job.row.isbn}`}
                                        </h5>
                                        <span className="text-[8px] font-mono font-bold text-natural-muted bg-natural-bg border border-natural-border px-1.5 py-0.5 rounded uppercase font-bold shrink-0">
                                          Row {job.index + 1}
                                        </span>
                                     </div>
                                     <p className="text-[10px] text-natural-muted truncate">
                                       By {job.matchedAuthor || job.row.author || 'Searching Online...'}
                                     </p>

                                     {/* State badge */}
                                     <div className="flex justify-between items-center pt-1.5 border-t border-natural-border/40 text-[9px] font-bold">
                                        {job.status === 'pending' && <span className="text-natural-muted uppercase">In Queue</span>}
                                        {job.status === 'lookup' && (
                                          <span className="text-zera-yellow-dark flex items-center gap-1 uppercase animate-pulse">
                                            <Search className="w-3 h-3 animate-spin" /> Querying Z39.50...
                                          </span>
                                        )}
                                        {job.status === 'saving' && (
                                          <span className="text-zera-emerald flex items-center gap-1 uppercase font-black">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                                          </span>
                                        )}
                                        {job.status === 'completed' && (
                                          <span className="text-zera-emerald flex items-center gap-1 uppercase font-black">
                                            <Check className="w-3 h-3 text-zera-emerald" /> Catalogued ({job.barcode})
                                          </span>
                                        )}
                                        {job.status === 'failed' && (
                                          <span className="text-red-500 flex items-center gap-1 uppercase">
                                            <AlertTriangle className="w-3 h-3 text-red-500" /> Lookup Failed
                                          </span>
                                        )}
                                        <span className="text-[8px] font-mono text-natural-muted opacity-80">{job.method || ''}</span>
                                     </div>
                                  </div>
                               </div>
                             );
                          })}
                      </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: COMPILATION SUCCESS REPORT */}
          {step === 4 && (
            <div className="space-y-6 animate-in zoom-in-95 duration-500">
               <div className="bg-gradient-to-br from-zera-emerald to-zera-emerald-dark text-white p-8 rounded-[2rem] text-center space-y-4 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
                  
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-zera-emerald mx-auto shadow-md">
                     <CheckCircle2 className="w-10 h-10 text-zera-emerald" />
                  </div>
                  <div className="space-y-1 text-center">
                     <h4 className="text-3xl font-serif font-black text-zera-yellow leading-tight">Sync Job Accomplished</h4>
                     <p className="text-sm text-white/90">Catalog processing task has successfully terminated.</p>
                  </div>

                  {/* Highlights statistics */}
                  <div className="grid grid-cols-2 max-w-md mx-auto gap-4 pt-6 mt-4 border-t border-white/15 text-center">
                     <div>
                        <p className="text-[10px] font-black uppercase text-zera-yellow font-black tracking-widest">Added to Stacks</p>
                        <p className="text-4xl font-serif font-black">{successfulImports} Titles</p>
                     </div>
                     <div className="border-l border-white/10 pl-4">
                        <p className="text-[10px] font-black uppercase text-zera-yellow font-black tracking-widest">Unresolved Exception</p>
                        <p className="text-4xl font-serif font-black text-white/60">{failedImports} Skip{failedImports !== 1 && 's'}</p>
                     </div>
                  </div>
               </div>

               {/* Summarized success roster */}
               <div className="space-y-3">
                  <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Bibliographic ledger database updates</span>
                  <div className="border border-natural-border rounded-2xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                     <table className="w-full text-xs text-left">
                        <thead className="bg-natural-bg text-natural-muted select-none font-bold">
                           <tr>
                              <th className="px-5 py-3">Catalog Block</th>
                              <th className="px-5 py-3">Allocated Accession No.</th>
                              <th className="px-5 py-3">Sync Stream / Result</th>
                              <th className="px-5 py-3">Stacks Inventory</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-natural-bg/60 text-natural-text font-bold">
                           {importJobs.filter(j => j.status === 'completed').map((job) => (
                              <tr key={job.index} className="hover:bg-natural-bg/20">
                                 <td className="px-5 py-3.5">
                                    <div className="flex gap-3 items-center">
                                       <img src={job.coverUrl} className="w-6 h-9 object-cover rounded shadow-sm shrink-0" alt="c" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                                       <div className="min-w-0">
                                          <p className="truncate text-natural-text leading-tight">{job.matchedTitle}</p>
                                          <p className="text-[10px] text-natural-muted truncate font-normal">By {job.matchedAuthor}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="px-5 py-3.5 font-mono text-[10px] text-zera-emerald">
                                    {job.barcode}
                                 </td>
                                 <td className="px-5 py-3.5">
                                    <span className="text-[9px] font-black uppercase bg-zera-yellow/15 text-zera-yellow-dark px-2.5 py-1 rounded-lg">
                                       {job.method}
                                    </span>
                                 </td>
                                 <td className="px-5 py-3.5 text-natural-muted">
                                    {job.row.copies} Standard Cop{job.row.copies !== 1 ? 'ies' : 'y'}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>

               <div className="flex justify-end pt-4 border-t border-natural-border shrink-0">
                  <button 
                     onClick={onClose}
                     className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-lg transition-all flex items-center gap-2"
                  >
                     Finalize & Close Portal <ArrowRight className="w-4 h-4" />
                  </button>
               </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
