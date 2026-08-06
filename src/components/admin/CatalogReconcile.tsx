import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  GitCompareArrows,
  Library,
  ListChecks,
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Book } from '@/src/types';
import { cn, clean } from '@/src/lib/utils';

// SheetJS (~500KB) is only loaded when the user actually uploads a workbook.
let xlsxPromise: Promise<typeof import('xlsx')> | null = null;
const loadXlsx = () => {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
};

// A single book pulled out of an uploaded file.
interface ListRow {
  title: string;
  author: string;
  isbn: string;
  barcode: string;
  file: string;
}

interface UploadedFile {
  name: string;
  rows: ListRow[];
  rawRows: number;      // total non-empty data rows read (across all sheets)
  skipped: number;      // rows dropped because they had no title/ISBN
  detected: string[];   // which columns were recognised (for transparency)
  sheets: number;       // how many sheets were read
  error?: string;
}

// --- normalisation helpers (shared by both sides of the comparison) ---
const normIsbn = (s?: string) => (s || '').replace(/[^0-9xX]/g, '').toLowerCase();
const normText = (s?: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

// Find the column index whose header matches any of the given keywords.
const findCol = (header: string[], keywords: string[]) =>
  header.findIndex(h => {
    const n = normText(h);
    return keywords.some(k => n.includes(k));
  });

export const CatalogReconcile = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState<'extra' | 'missing'>('extra');
  const [result, setResult] = useState<{
    systemCount: number;
    listCount: number;
    matched: number;
    extraInSystem: Book[];
    missingFromSystem: ListRow[];
  } | null>(null);

  // Turn one sheet's header + data rows into ListRow[], reporting how many rows
  // were read and how many were skipped (no usable title/ISBN), plus which
  // columns were recognised. Detects ISBN / Title / Author / Accession by header
  // name; with no recognisable header, treats column 0 as the title.
  const rowsFromMatrix = (matrix: string[][], fileName: string) => {
    const result = { rows: [] as ListRow[], skipped: 0, detected: [] as string[], dataCount: 0 };
    if (matrix.length === 0) return result;
    const header = matrix[0];
    const isbnIdx = findCol(header, ['isbn']);
    const titleIdx = findCol(header, ['title', 'book name', 'book title', 'name of book', 'judul', 'tajuk']);
    const authorIdx = findCol(header, ['author', 'writer', 'penulis']);
    const barcodeIdx = findCol(header, ['barcode', 'accession', 'acc no', 'acc. no', 'call no']);

    const hasHeader = isbnIdx !== -1 || titleIdx !== -1 || authorIdx !== -1 || barcodeIdx !== -1;
    const dataRows = hasHeader ? matrix.slice(1) : matrix;
    const tIdx = titleIdx !== -1 ? titleIdx : 0;

    result.detected.push(titleIdx !== -1 ? `Title (col ${titleIdx + 1})` : 'Title (col 1, assumed)');
    if (isbnIdx !== -1) result.detected.push(`ISBN (col ${isbnIdx + 1})`);
    if (barcodeIdx !== -1) result.detected.push(`Accession (col ${barcodeIdx + 1})`);
    result.dataCount = dataRows.length;

    for (const r of dataRows) {
      const isbn = isbnIdx !== -1 ? (r[isbnIdx] || '').trim() : '';
      const barcode = barcodeIdx !== -1 ? (r[barcodeIdx] || '').trim() : '';
      let title = (r[tIdx] || '').trim();
      // Recover the title from the first filled cell that isn't the ISBN/accession
      // — so a row is never dropped just because the detected title column is blank
      // (mis-detected header, merged cells, etc.). Title-only lists always survive.
      if (!title) {
        const fallback = r.find((c, i) => i !== isbnIdx && i !== barcodeIdx && (c || '').trim() !== '');
        if (fallback) title = String(fallback).trim();
      }
      const row: ListRow = {
        title,
        author: authorIdx !== -1 ? (r[authorIdx] || '').trim() : '',
        isbn,
        barcode,
        file: fileName,
      };
      if (row.title || normIsbn(row.isbn).length >= 10 || row.barcode) result.rows.push(row);
      else result.skipped++;
    }
    return result;
  };

  const parseFile = async (file: File): Promise<UploadedFile> => {
    try {
      const data = await file.arrayBuffer();
      const XLSX = await loadXlsx();
      // SheetJS reads .xlsx/.xls AND .csv from the same array buffer.
      const wb = XLSX.read(data, { type: 'array' });
      if (!wb.SheetNames.length) return { name: file.name, rows: [], rawRows: 0, skipped: 0, detected: [], sheets: 0, error: 'No sheets found in this file.' };

      // Read EVERY sheet — book lists are often split across tabs, and reading
      // only the first would silently drop the rest.
      const rows: ListRow[] = [];
      let skipped = 0, rawRows = 0;
      let detected: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false });
        const matrix = raw
          .map(r => (Array.isArray(r) ? r.map(c => (c == null ? '' : String(c)).trim()) : []))
          .filter(r => r.some(c => c !== ''));
        const res = rowsFromMatrix(matrix, file.name);
        rows.push(...res.rows);
        skipped += res.skipped;
        rawRows += res.dataCount;
        if (detected.length === 0) detected = res.detected;
      }

      if (rows.length === 0) return { name: file.name, rows: [], rawRows, skipped, detected, sheets: wb.SheetNames.length, error: 'No book titles detected. Make sure the sheet has a Title column (or a plain list of titles).' };
      return { name: file.name, rows, rawRows, skipped, detected, sheets: wb.SheetNames.length };
    } catch (err) {
      console.error('Reconcile parse error:', err);
      return { name: file.name, rows: [], rawRows: 0, skipped: 0, detected: [], sheets: 0, error: 'Could not read this file. Use .xlsx, .xls, or .csv.' };
    }
  };

  const addFiles = async (fileList: FileList | File[]) => {
    setParsing(true);
    setResult(null);
    try {
      const parsed = await Promise.all(Array.from(fileList).map(parseFile));
      setFiles(prev => [...prev, ...parsed]);
    } finally {
      setParsing(false);
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const totalListRows = files.reduce((n, f) => n + f.rows.length, 0);

  const compare = async () => {
    setComparing(true);
    try {
      // 1) Load the library's active catalogue.
      const snap = await getDocs(collection(db, 'books'));
      const systemBooks = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as Book))
        .filter(b => b.status !== 'archived');

      // 2) Build lookup sets from the uploaded list.
      const allRows = files.flatMap(f => f.rows);
      const listIsbn = new Set<string>();
      const listBarcode = new Set<string>();
      const listTitleAuthor = new Set<string>();
      const listTitleOnly = new Set<string>();
      for (const r of allRows) {
        const i = normIsbn(r.isbn); if (i.length >= 10) listIsbn.add(i);
        const b = normText(r.barcode); if (b) listBarcode.add(b);
        const t = normText(r.title);
        if (t) { listTitleOnly.add(t); listTitleAuthor.add(`${t}|${normText(r.author)}`); }
      }

      // 3) Build the same sets from the system (to find what the list is missing).
      const sysIsbn = new Set<string>();
      const sysBarcode = new Set<string>();
      const sysTitleAuthor = new Set<string>();
      const sysTitleOnly = new Set<string>();
      for (const b of systemBooks) {
        const i = normIsbn(b.isbn); if (i.length >= 10) sysIsbn.add(i);
        const bc = normText(b.barcode); if (bc) sysBarcode.add(bc);
        const t = normText(b.title);
        if (t) { sysTitleOnly.add(t); sysTitleAuthor.add(`${t}|${normText(b.author)}`); }
      }

      // A system book counts as "on the list" if it shares ISBN, accession, or
      // title (with or without matching author) with any uploaded row.
      const inList = (b: Book) => {
        const i = normIsbn(b.isbn); if (i.length >= 10 && listIsbn.has(i)) return true;
        const bc = normText(b.barcode); if (bc && listBarcode.has(bc)) return true;
        const t = normText(b.title);
        return !!t && (listTitleAuthor.has(`${t}|${normText(b.author)}`) || listTitleOnly.has(t));
      };
      const rowInSystem = (r: ListRow) => {
        const i = normIsbn(r.isbn); if (i.length >= 10 && sysIsbn.has(i)) return true;
        const bc = normText(r.barcode); if (bc && sysBarcode.has(bc)) return true;
        const t = normText(r.title);
        return !!t && (sysTitleAuthor.has(`${t}|${normText(r.author)}`) || sysTitleOnly.has(t));
      };

      const extraInSystem = systemBooks.filter(b => !inList(b));
      const missingFromSystem = allRows.filter(r => !rowInSystem(r));

      setResult({
        systemCount: systemBooks.length,
        listCount: allRows.length,
        matched: systemBooks.length - extraInSystem.length,
        extraInSystem,
        missingFromSystem,
      });
      setView('extra');
    } catch (err) {
      console.error('Reconcile compare error:', err);
      alert('Could not load the library catalogue to compare. Please try again.');
    } finally {
      setComparing(false);
    }
  };

  const downloadCsv = (rows: Record<string, any>[], cols: { key: string; label: string }[], filename: string) => {
    const esc = (v: any) => `"${clean(v).replace(/"/g, '""')}"`;
    const csv = [
      cols.map(c => esc(c.label)).join(','),
      ...rows.map(r => cols.map(c => esc(r[c.key])).join(',')),
    ].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const extraCols = [
    { key: 'title', label: 'Book Title' },
    { key: 'author', label: 'Author' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'barcode', label: 'Accession No.' },
    { key: 'category', label: 'Category' },
    { key: 'availableCopies', label: 'Available' },
  ];
  const missingCols = [
    { key: 'title', label: 'Book Title' },
    { key: 'author', label: 'Author' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'barcode', label: 'Accession No.' },
    { key: 'file', label: 'From File' },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-zera-emerald/10 rounded-2xl">
          <GitCompareArrows className="w-6 h-6 text-zera-emerald" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-black text-zera-emerald tracking-tight">Catalogue Reconciliation</h1>
          <p className="text-xs font-bold text-natural-muted uppercase tracking-widest mt-1">
            Upload your book list & cross-check against the library system
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        className={cn(
          'border-2 border-dashed rounded-3xl p-10 text-center transition-all',
          dragOver ? 'border-zera-emerald bg-zera-emerald/5' : 'border-natural-border bg-white'
        )}
      >
        <UploadCloud className="w-12 h-12 mx-auto text-zera-emerald/40 mb-3" />
        <p className="text-sm font-bold text-natural-text">Drag & drop your Excel / CSV files here</p>
        <p className="text-xs text-natural-muted font-medium mt-1">You can add several files. A <span className="font-bold text-zera-emerald">Title</span> column is all that's needed to compare — ISBN is optional and makes matches more exact.</p>
        <label className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-zera-emerald text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zera-emerald-dark transition-all cursor-pointer">
          {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          Choose files
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.currentTarget.value = ''; }}
          />
        </label>
      </div>

      {/* Uploaded files */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-white border border-natural-border rounded-2xl px-5 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet className={cn('w-5 h-5 shrink-0', f.error ? 'text-red-500' : 'text-zera-emerald')} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-natural-text truncate">{f.name}</p>
                  {f.error
                    ? <p className="text-[11px] font-bold text-red-500">{f.error}</p>
                    : (
                      <div className="text-[11px] font-bold text-natural-muted">
                        <span className="text-zera-emerald">{f.rows.length}</span> book{f.rows.length === 1 ? '' : 's'} detected
                        {f.sheets > 1 && <span> · {f.sheets} sheets</span>}
                        {f.skipped > 0 && <span className="text-amber-600"> · {f.skipped} row{f.skipped === 1 ? '' : 's'} skipped (no title/ISBN)</span>}
                        {f.detected.length > 0 && <span className="block font-medium text-natural-muted/80 mt-0.5">Columns: {f.detected.join(' · ')}</span>}
                      </div>
                    )}
                </div>
              </div>
              <button onClick={() => removeFile(i)} className="p-2 hover:bg-natural-bg rounded-full transition-colors">
                <X className="w-4 h-4 text-natural-muted" />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-black uppercase tracking-widest text-natural-muted">
              Total in your list: <span className="text-zera-emerald">{totalListRows}</span>
            </p>
            <button
              onClick={compare}
              disabled={comparing || totalListRows === 0}
              className="flex items-center gap-2 px-6 py-3 bg-zera-yellow text-zera-emerald rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40"
            >
              {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
              Compare with Library
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-natural-border rounded-3xl p-5">
              <div className="flex items-center gap-2 text-natural-muted"><ListChecks className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Your List</span></div>
              <p className="text-3xl font-serif font-black text-natural-text mt-2">{result.listCount}</p>
            </div>
            <div className="bg-white border border-natural-border rounded-3xl p-5">
              <div className="flex items-center gap-2 text-natural-muted"><Library className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">In System</span></div>
              <p className="text-3xl font-serif font-black text-natural-text mt-2">{result.systemCount}</p>
            </div>
            <button onClick={() => setView('extra')} className={cn('text-left rounded-3xl p-5 border transition-all', view === 'extra' ? 'bg-amber-50 border-amber-300' : 'bg-white border-natural-border hover:border-amber-200')}>
              <div className="flex items-center gap-2 text-amber-600"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Extra in System</span></div>
              <p className="text-3xl font-serif font-black text-amber-600 mt-2">{result.extraInSystem.length}</p>
              <p className="text-[10px] font-bold text-natural-muted mt-1">In system, not in your list</p>
            </button>
            <button onClick={() => setView('missing')} className={cn('text-left rounded-3xl p-5 border transition-all', view === 'missing' ? 'bg-red-50 border-red-300' : 'bg-white border-natural-border hover:border-red-200')}>
              <div className="flex items-center gap-2 text-red-500"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Missing from System</span></div>
              <p className="text-3xl font-serif font-black text-red-500 mt-2">{result.missingFromSystem.length}</p>
              <p className="text-[10px] font-bold text-natural-muted mt-1">In your list, not in system</p>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-zera-emerald bg-zera-emerald/5 border border-zera-emerald/10 rounded-2xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {result.matched} book{result.matched === 1 ? '' : 's'} matched between your list and the system.
          </div>

          {/* Table */}
          <div className="bg-white border border-natural-border rounded-3xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border bg-natural-bg/40">
              <h3 className="text-sm font-black text-natural-text">
                {view === 'extra'
                  ? `Extra in System (${result.extraInSystem.length}) — books the library has that aren't in your list`
                  : `Missing from System (${result.missingFromSystem.length}) — books in your list the library doesn't have`}
              </h3>
              <button
                onClick={() => view === 'extra'
                  ? downloadCsv(result.extraInSystem as any, extraCols, `extra_in_system_${new Date().toISOString().slice(0, 10)}.csv`)
                  : downloadCsv(result.missingFromSystem as any, missingCols, `missing_from_system_${new Date().toISOString().slice(0, 10)}.csv`)}
                disabled={(view === 'extra' ? result.extraInSystem.length : result.missingFromSystem.length) === 0}
                className="flex items-center gap-2 px-4 py-2 bg-zera-emerald text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zera-emerald-dark transition-colors disabled:opacity-40"
              >
                <Download className="w-4 h-4" /> Download CSV
              </button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-natural-bg sticky top-0">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-natural-muted">
                    {(view === 'extra' ? extraCols : missingCols).map(c => <th key={c.key} className="px-4 py-3">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-bg">
                  {(view === 'extra' ? result.extraInSystem : result.missingFromSystem).map((row: any, idx) => (
                    <tr key={idx} className="hover:bg-natural-bg/50">
                      {(view === 'extra' ? extraCols : missingCols).map(c => (
                        <td key={c.key} className="px-4 py-3 text-sm font-medium text-natural-text">{clean(row[c.key]) || '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {(view === 'extra' ? result.extraInSystem : result.missingFromSystem).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-16 text-center text-sm font-bold text-natural-muted">Nothing here — everything reconciled. 🎉</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
