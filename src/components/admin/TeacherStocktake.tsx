import React, { useState, useEffect, useRef } from 'react';
import {
  ScanLine,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Loader2,
  BookMarked,
  PackageCheck,
  PackageX,
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, onSnapshot, query, writeBatch, doc } from 'firebase/firestore';
import { Book as BookType } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { loadXlsx } from '@/src/lib/importParsing';
import { NOT_RETURNED_BARCODES, STOCKTAKE_BASELINE_LABEL } from './teacherStocktakeBaseline';

// The category this stocktake is scoped to. Books must be catalogued under this
// category to be counted here.
const STOCKTAKE_CATEGORY = 'Teacher Resource';

// One-time backfill: the teacher-resource collection was bulk-imported on this
// day under ~28 mixed auto-generated categories, so none carry the
// STOCKTAKE_CATEGORY yet. The setup card below lets an admin tag that whole
// batch (all 294 books, including the 2 Collins titles) in one click.
const BACKFILL_DAY = '2026-07-09';

// Where the in-progress scan list is saved so the librarian can leave the page
// and come back to keep scanning without losing what's already been counted.
const STORAGE_KEY = 'zera:teacher-stocktake:scanned';

const norm = (s?: string) => (s || '').toString().trim().toLowerCase();
const onlyDigits = (s?: string) => (s || '').toString().replace(/[^0-9Xx]/gi, '');
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const TeacherStocktake = () => {
  const [allBooks, setAllBooks] = useState<BookType[]>([]);
  // Restore any saved scan progress so re-opening the page continues where it
  // left off.
  const [scannedIds, setScannedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  });
  const [barcode, setBarcode] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const lastScanRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the whole catalogue (live). We keep it all so we can both scope the
  // stocktake to STOCKTAKE_CATEGORY and detect the untagged import batch that
  // still needs backfilling.
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'books')), (snap) => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as BookType))
        .filter(b => b.status !== 'archived');
      setAllBooks(all);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Persist scan progress on every change so it survives leaving the page.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...scannedIds]));
    } catch {
      /* storage full or unavailable — progress just won't persist */
    }
  }, [scannedIds]);

  // Books in scope: everything catalogued under the Teacher Resource category.
  const books = allBooks
    .filter(b => norm(b.category) === norm(STOCKTAKE_CATEGORY))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  // The 9-Jul import batch that hasn't been tagged Teacher Resource yet.
  const pendingBatch = allBooks.filter(b =>
    String(b.createdAt || '').slice(0, 10) === BACKFILL_DAY &&
    norm(b.category) !== norm(STOCKTAKE_CATEGORY),
  );

  const handleTagBatch = async () => {
    if (pendingBatch.length === 0) return;
    setTagging(true);
    setStatus(null);
    try {
      // Firestore write batches cap at 500 ops, so commit in chunks.
      for (let i = 0; i < pendingBatch.length; i += 400) {
        const chunk = pendingBatch.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(b => batch.update(doc(db, 'books', b.id), {
          category: STOCKTAKE_CATEGORY,
          updatedAt: new Date().toISOString(),
        }));
        await batch.commit();
      }
      setStatus({ type: 'success', message: `Tagged ${pendingBatch.length} books as Teacher Resource. You can now stocktake them.` });
    } catch (err) {
      console.error('Tag batch error:', err);
      setStatus({ type: 'error', message: 'Tagging failed — make sure you are signed in as an admin, then try again.' });
    }
    setTagging(false);
  };

  const registerScan = (raw: string) => {
    // Keep the cursor in the scan box so the next barcode/ISBN/title can be
    // scanned straight away without clicking back into the field.
    inputRef.current?.focus();
    const scan = raw.trim();
    if (!scan) return;
    const scanDigits = onlyDigits(scan);

    const match = books.find(b =>
      (b.barcode && norm(b.barcode) === norm(scan)) ||
      (b.isbn && scanDigits.length >= 10 && onlyDigits(b.isbn) === scanDigits) ||
      (b.title && norm(b.title) === norm(scan)),
    );

    if (!match) {
      setStatus({ type: 'error', message: `No Teacher Resource book matches “${scan}”. Check it's catalogued under Teacher Resource.` });
      return;
    }

    if (scannedIds.has(match.id)) {
      setStatus({ type: 'info', message: `“${match.title}” was already scanned.` });
      setBarcode('');
      lastScanRef.current = '';
      return;
    }

    setScannedIds(prev => new Set(prev).add(match.id));
    setStatus({ type: 'success', message: `“${match.title}” marked present.` });
    setBarcode('');
    lastScanRef.current = '';
  };

  const notReturned = books.filter(b => !scannedIds.has(b.id));
  const scannedBooks = books.filter(b => scannedIds.has(b.id));

  const resetSession = () => {
    if (scannedIds.size > 0 && !window.confirm(`Clear the saved scan list (${scannedIds.size} book${scannedIds.size !== 1 ? 's' : ''})? This can't be undone.`)) {
      return;
    }
    setScannedIds(new Set());
    setStatus(null);
    setBarcode('');
    lastScanRef.current = '';
  };

  // Restore the saved 14-Jul stocktake: mark every Teacher Resource book as
  // already-scanned EXCEPT the ones on the "not returned" baseline, so the
  // librarian can carry on scanning just the books that were still out.
  const restoreBaseline = () => {
    if (books.length === 0) {
      setStatus({ type: 'error', message: 'Books are still loading — please try again in a moment.' });
      return;
    }
    const notReturned = new Set(NOT_RETURNED_BARCODES.map(b => norm(b)));
    const scanned = books.filter(b => !(b.barcode && notReturned.has(norm(b.barcode)))).map(b => b.id);
    const remaining = books.length - scanned.length;
    if (scannedIds.size > 0 && !window.confirm(
      `Load the ${STOCKTAKE_BASELINE_LABEL}? This replaces the current scan list with ${scanned.length} already scanned and ${remaining} still to scan.`
    )) {
      return;
    }
    setScannedIds(new Set(scanned));
    setStatus({
      type: remaining === NOT_RETURNED_BARCODES.length ? 'success' : 'info',
      message: remaining === NOT_RETURNED_BARCODES.length
        ? `Restored ${STOCKTAKE_BASELINE_LABEL}: ${scanned.length} scanned, ${remaining} left to scan. Carry on scanning below.`
        : `Restored: ${scanned.length} scanned, ${remaining} left to scan. (Expected ${NOT_RETURNED_BARCODES.length} — ${NOT_RETURNED_BARCODES.length - remaining} baseline barcode(s) didn't match the catalogue.)`,
    });
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) {
      setStatus({ type: 'error', message: 'Could not open the print window — please allow pop-ups for this site.' });
      return;
    }
    const printedOn = new Date().toLocaleString();
    const rows = notReturned.map((b, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(b.title || '')}</td>
        <td>${escapeHtml(b.author || '—')}</td>
        <td class="mono">${escapeHtml(b.isbn || '—')}</td>
        <td></td>
      </tr>`).join('');

    win.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>Teacher Resource — Books Not Yet Returned</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Georgia, 'Times New Roman', serif; color: #1a2b28; margin: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; color: #0f5132; }
        .sub { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; margin: 0 0 2px; }
        .meta { font-size: 12px; color: #6b7280; margin: 12px 0 20px; }
        .stat { display: inline-block; margin-right: 24px; font-size: 13px; }
        .stat b { font-size: 18px; color: #0f5132; display: block; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
        th { text-align: left; border-bottom: 2px solid #0f5132; padding: 8px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        td.num { color: #9ca3af; width: 28px; }
        td.mono { font-family: 'Courier New', monospace; font-size: 12px; }
        th.check, td:last-child { width: 90px; }
        th.check { text-align: center; }
        tfoot td { border: none; padding-top: 16px; font-size: 11px; color: #9ca3af; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <p class="sub">Zera Education • Library Stocktake</p>
      <h1>Teacher Resource — Books Not Yet Returned</h1>
      <div class="meta">Printed ${escapeHtml(printedOn)}</div>
      <div>
        <span class="stat"><b>${books.length}</b>Total in category</span>
        <span class="stat"><b>${scannedBooks.length}</b>Scanned / present</span>
        <span class="stat"><b>${notReturned.length}</b>Not returned</span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Author</th><th>ISBN</th><th class="check">Returned?</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px;">All Teacher Resource books have been scanned — nothing outstanding.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="5">Generated by Zera Library System</td></tr></tfoot>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const handleExportExcel = async () => {
    if (notReturned.length === 0) {
      setStatus({ type: 'info', message: 'Nothing to export — every Teacher Resource book has been scanned.' });
      return;
    }
    setExporting(true);
    try {
      const XLSX = await loadXlsx();
      const rows = notReturned.map((b, i) => ({
        '#': i + 1,
        Title: b.title || '',
        Author: b.author || '',
        'Barcode / ISBN': b.barcode || b.isbn || '',
        Category: b.category || '',
        Returned: '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 5 }, { wch: 50 }, { wch: 28 }, { wch: 22 }, { wch: 18 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Not Returned');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `teacher-resources-not-returned-${stamp}.xlsx`);
    } catch (err) {
      console.error('Excel export error:', err);
      setStatus({ type: 'error', message: 'Could not generate the Excel file. Please try again.' });
    }
    setExporting(false);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-3xl font-bold text-natural-text">Teacher Resource Stocktake</h2>
          <p className="text-sm text-natural-muted font-medium italic">
            Scan the books you have; whatever isn’t scanned is still out (not returned).
          </p>
          <p className="text-[11px] text-zera-emerald font-bold mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Your scan list saves automatically — leave and come back to continue.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetSession}
            disabled={scannedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-natural-border text-natural-muted hover:text-zera-emerald rounded-full text-sm font-bold shadow-sm transition-all uppercase tracking-wider disabled:opacity-30"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider disabled:opacity-40"
            title="Download the list of Teacher Resource books not yet returned as an Excel file."
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Download Excel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 bg-zera-yellow text-zera-emerald-dark hover:brightness-95 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider"
            title="Print the list of Teacher Resource books not yet returned."
          >
            <Printer className="w-4 h-4" /> Print “Not Returned” List
          </button>
        </div>
      </div>

      {/* Continue a saved stocktake — restore the bareline session */}
      {!loading && scannedIds.size === 0 && books.length > 0 && (
        <div className="bg-zera-emerald/5 border-2 border-zera-emerald/30 rounded-[32px] p-6 flex flex-col sm:flex-row sm:items-center gap-4 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-zera-emerald flex items-center justify-center text-white shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-natural-text">Continue your previous stocktake</p>
            <p className="text-sm text-natural-muted font-medium mt-1">
              Pick up the <b>{STOCKTAKE_BASELINE_LABEL}</b> where you left off — <b>{NOT_RETURNED_BARCODES.length}</b> books
              were still to scan (the other {Math.max(0, books.length - NOT_RETURNED_BARCODES.length)} already counted).
            </p>
          </div>
          <button
            type="button"
            onClick={restoreBaseline}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zera-emerald text-white rounded-full text-sm font-black uppercase tracking-wider shadow-lg hover:bg-zera-emerald-dark transition-all shrink-0"
          >
            <RotateCcw className="w-4 h-4" /> Continue Scanning
          </button>
        </div>
      )}

      {/* One-time setup: tag the untagged import batch */}
      {pendingBatch.length > 0 && (
        <div className="bg-zera-yellow/10 border-2 border-zera-yellow/40 rounded-[32px] p-6 flex flex-col sm:flex-row sm:items-center gap-4 animate-in fade-in">
          <div className="w-12 h-12 rounded-2xl bg-zera-yellow flex items-center justify-center text-zera-emerald-dark shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-natural-text">One-time setup — tag your imported books</p>
            <p className="text-sm text-natural-muted font-medium mt-1">
              Found <b>{pendingBatch.length}</b> books from your {BACKFILL_DAY} import that aren’t under the
              “Teacher Resource” category yet. Tag them once so the stocktake can track them.
            </p>
          </div>
          <button
            type="button"
            onClick={handleTagBatch}
            disabled={tagging}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zera-emerald text-white rounded-full text-sm font-black uppercase tracking-wider shadow-lg hover:bg-zera-emerald-dark disabled:opacity-40 transition-all shrink-0"
          >
            {tagging ? <><Loader2 className="w-4 h-4 animate-spin" /> Tagging…</> : <>Tag {pendingBatch.length} books</>}
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-natural-border rounded-3xl p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-zera-emerald/10 flex items-center justify-center text-zera-emerald"><BookMarked className="w-6 h-6" /></div>
          <div>
            <p className="text-2xl font-black text-natural-text">{books.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-natural-muted">Total in Category</p>
          </div>
        </div>
        <div className="bg-white border border-natural-border rounded-3xl p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600"><PackageCheck className="w-6 h-6" /></div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{scannedBooks.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-natural-muted">Scanned / Present</p>
          </div>
        </div>
        <div className="bg-white border border-natural-border rounded-3xl p-6 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500"><PackageX className="w-6 h-6" /></div>
          <div>
            <p className="text-2xl font-black text-red-500">{notReturned.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-natural-muted">Not Returned Yet</p>
          </div>
        </div>
      </div>

      {/* Scanner */}
      <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-zera-emerald rounded-2xl flex items-center justify-center text-white shadow-lg">
            <ScanLine className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-2xl font-bold text-natural-text">Scan Present Books</h3>
            <p className="text-[10px] text-natural-muted font-black uppercase tracking-[0.2em] mt-1">Barcode • ISBN • Title</p>
          </div>
        </div>

        <form onSubmit={e => { e.preventDefault(); registerScan(barcode); }} className="relative group">
          <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
          <input
            ref={inputRef}
            autoFocus
            className="w-full bg-natural-bg border border-natural-border rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-zera-emerald outline-none text-natural-text font-mono shadow-inner transition-all"
            placeholder="Scan a Teacher Resource book to mark it present…"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            onKeyDown={e => {
              // Scanners send Enter after the code → register immediately.
              if (e.key === 'Enter') {
                e.preventDefault();
                const scan = barcode.trim();
                if (scan && lastScanRef.current !== scan) {
                  lastScanRef.current = scan;
                  registerScan(scan);
                }
              }
            }}
          />
        </form>

        {status && (
          <div className={cn(
            'p-4 rounded-3xl text-sm font-bold flex gap-3 items-center animate-in slide-in-from-top-2',
            status.type === 'success' && 'bg-emerald-50 text-emerald-800 border border-emerald-100',
            status.type === 'error' && 'bg-red-50 text-red-800 border border-red-100',
            status.type === 'info' && 'bg-zera-yellow/10 text-zera-yellow-dark border border-zera-yellow/30',
          )}>
            {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            {status.message}
          </div>
        )}
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Not returned */}
        <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-2xl font-bold text-natural-text flex items-center gap-2">
              <PackageX className="w-5 h-5 text-red-500" /> Not Returned Yet
            </h3>
            <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-black">{notReturned.length}</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-natural-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : notReturned.length === 0 ? (
            <div className="text-center py-16 text-natural-muted font-serif italic">
              {books.length === 0 ? 'No Teacher Resource books catalogued yet.' : 'Everything scanned — nothing outstanding. 🎉'}
            </div>
          ) : (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {notReturned.map((b, idx) => (
                <div key={b.id} className="flex items-center gap-3 bg-natural-bg border border-natural-border rounded-2xl px-4 py-3">
                  <span className="text-[10px] font-black text-natural-muted w-5 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-natural-text truncate">{b.title}</p>
                    <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                      {b.author?.trim() ? `${b.author} • ` : ''}{b.barcode || b.isbn || 'No code'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scanned */}
        <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-2xl font-bold text-natural-text flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-600" /> Scanned / Present
            </h3>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black">{scannedBooks.length}</span>
          </div>
          {scannedBooks.length === 0 ? (
            <div className="text-center py-16 text-natural-muted font-serif italic">Scanned books will appear here.</div>
          ) : (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {scannedBooks.map(b => (
                <div key={b.id} className="flex items-center gap-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-natural-text truncate">{b.title}</p>
                    <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                      {b.barcode || b.isbn || 'No code'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
