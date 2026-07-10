import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud, X, CheckCircle2, AlertTriangle, Loader2, ChevronRight, ArrowRight,
  UserCheck, Check, Users, Play,
} from 'lucide-react';
import { addDays } from 'date-fns';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { Book as BookType, UserProfile } from '@/src/types';
import { parseCSV, readExcelMatrix, isExcelFile, normalizeKey, normalizeCode } from '@/src/lib/importParsing';

interface BatchCirculationImporterProps {
  onClose: () => void;
}

interface RawRow {
  teacher: string;
  teacherId: string;
  book: string;
  isbn: string;
  checkout: string;
  due: string;
}

type RowStatus = 'matched' | 'teacher-unmatched' | 'no-book';

interface ResolvedRow extends RawRow {
  rowNum: number;
  user?: UserProfile;
  bookMatch?: BookType;
  status: RowStatus;
}

// Header keyword → which field a column maps to. Book columns are matched first
// so a "Book Title" column isn't mistaken for the teacher's name.
const detectColumns = (headers: string[]) => {
  const lower = headers.map(h => h.toLowerCase());
  const find = (test: (h: string) => boolean) => lower.findIndex(test);

  const bookIdx = find(h => h.includes('book title') || h.includes('book name') || h === 'book' || h === 'title' || h.includes('title'));
  const isbnIdx = find(h => h.includes('isbn') || h.includes('identifier'));
  const dueIdx = find(h => h.includes('due') || h.includes('return'));
  const checkoutIdx = find(h => h.includes('checkout') || h.includes('check out') || h.includes('issue') || h.includes('borrow') || h.includes('loan date') || h === 'date');
  // Teacher: prefer explicit borrower/teacher/member/staff, then a bare "name".
  let teacherIdx = find(h => h.includes('teacher') || h.includes('borrower') || h.includes('member') || h.includes('patron') || h.includes('staff name') || h.includes('user'));
  if (teacherIdx === -1) teacherIdx = lower.findIndex((h, idx) => (h.includes('name') || h === 'staff') && idx !== bookIdx);
  // A code/email column identifying the teacher precisely.
  const teacherIdIdx = find(h => h.includes('email') || h.includes('nric') || h.includes('staff id') || h.includes('teacher id') || h.includes('employee') || h.includes('ic '));

  return { teacherIdx, teacherIdIdx, bookIdx, isbnIdx, checkoutIdx, dueIdx };
};

export const BatchCirculationImporter: React.FC<BatchCirculationImporterProps> = ({ onClose }) => {
  const [step, setStep] = useState<number>(1);
  const [inputText, setInputText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [books, setBooks] = useState<BookType[]>([]);
  const [dataReady, setDataReady] = useState(false);

  const [resolvedRows, setResolvedRows] = useState<ResolvedRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ issued: number; skipped: number } | null>(null);

  // Load teachers and the catalogue up-front so matching is instant & in-memory.
  useEffect(() => {
    (async () => {
      try {
        const [usersSnap, booksSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'books')),
        ]);
        setUsers(usersSnap.docs.map(d => ({ ...(d.data() as UserProfile), uid: d.id })));
        setBooks(booksSnap.docs.map(d => ({ ...(d.data() as BookType), id: d.id })));
      } catch (err) {
        console.error('Failed to load users/books for circulation import:', err);
        setFileError('Could not load teachers and the catalogue. Check your connection and reopen.');
      } finally {
        setDataReady(true);
      }
    })();
  }, []);

  // ---- matching indexes ----
  const resolveRows = (matrix: string[][]) => {
    if (matrix.length < 2) {
      setFileError('That file has no data rows under the header.');
      return;
    }
    const headers = matrix[0].map(h => h.trim());
    const cols = detectColumns(headers);
    if (cols.teacherIdx === -1 && cols.teacherIdIdx === -1) {
      setFileError('Could not find a teacher / borrower column. Add a column named "Teacher" (or Borrower / Member / Email).');
      return;
    }
    if (cols.bookIdx === -1 && cols.isbnIdx === -1) {
      setFileError('Could not find a book column. Add a column named "Book Title" (or ISBN).');
      return;
    }

    // Build lookup maps once.
    const userByName = new Map<string, UserProfile>();
    const userByEmail = new Map<string, UserProfile>();
    const userById = new Map<string, UserProfile>();
    const userByBarcode = new Map<string, UserProfile>();
    for (const u of users) {
      if (u.name) userByName.set(normalizeKey(u.name), u);
      if (u.email) userByEmail.set(normalizeKey(u.email), u);
      if (u.studentId) userById.set(normalizeKey(u.studentId), u);
      if (u.barcode) userByBarcode.set(normalizeKey(u.barcode), u);
    }
    const bookByTitle = new Map<string, BookType>();
    const bookByIsbn = new Map<string, BookType>();
    const bookByBarcode = new Map<string, BookType>();
    for (const b of books) {
      if (b.title) bookByTitle.set(normalizeKey(b.title), b);
      if (b.isbn) bookByIsbn.set(normalizeCode(b.isbn), b);
      if (b.barcode) bookByBarcode.set(normalizeKey(b.barcode), b);
    }

    const matchUser = (name: string, idText: string): UserProfile | undefined => {
      const idKey = normalizeKey(idText);
      if (idKey) {
        const hit = userByEmail.get(idKey) || userById.get(idKey) || userByBarcode.get(idKey);
        if (hit) return hit;
      }
      const nameKey = normalizeKey(name);
      if (!nameKey) return undefined;
      if (userByName.has(nameKey)) return userByName.get(nameKey);
      // Fuzzy: one name contains the other (guard against very short tokens).
      if (nameKey.length >= 4) {
        for (const u of users) {
          const un = normalizeKey(u.name);
          if (un && (un.includes(nameKey) || nameKey.includes(un))) return u;
        }
      }
      return undefined;
    };

    const matchBook = (title: string, isbnText: string): BookType | undefined => {
      const code = normalizeCode(isbnText);
      if (code) {
        const hit = bookByIsbn.get(code) || bookByBarcode.get(normalizeKey(isbnText));
        if (hit) return hit;
      }
      const titleKey = normalizeKey(title);
      if (!titleKey) return undefined;
      if (bookByTitle.has(titleKey)) return bookByTitle.get(titleKey);
      if (titleKey.length >= 4) {
        for (const b of books) {
          const bt = normalizeKey(b.title);
          if (bt && (bt.includes(titleKey) || titleKey.includes(bt))) return b;
        }
      }
      return undefined;
    };

    const rows: ResolvedRow[] = [];
    matrix.slice(1).forEach((cells, i) => {
      const at = (idx: number) => (idx >= 0 ? (cells[idx] || '').trim() : '');
      const raw: RawRow = {
        teacher: at(cols.teacherIdx),
        teacherId: at(cols.teacherIdIdx),
        book: at(cols.bookIdx),
        isbn: at(cols.isbnIdx),
        checkout: at(cols.checkoutIdx),
        due: at(cols.dueIdx),
      };
      // Skip fully-empty rows.
      if (!raw.teacher && !raw.teacherId && !raw.book && !raw.isbn) return;

      const user = matchUser(raw.teacher, raw.teacherId);
      const bookMatch = matchBook(raw.book, raw.isbn);
      const status: RowStatus = !bookMatch ? 'no-book' : user ? 'matched' : 'teacher-unmatched';
      rows.push({ ...raw, rowNum: i + 2, user, bookMatch, status });
    });

    if (rows.length === 0) {
      setFileError('No borrow records were found in that file.');
      return;
    }
    setResolvedRows(rows);
    setStep(2);
  };

  // ---- file intake ----
  const handleMatrix = (matrix: string[][]) => {
    setFileError('');
    resolveRows(matrix);
  };

  const handleFile = (file: File) => {
    setFileError('');
    setFileLoading(true);
    const done = () => setFileLoading(false);
    const reader = new FileReader();
    if (isExcelFile(file)) {
      reader.onload = async (e) => {
        try {
          if (e.target?.result instanceof ArrayBuffer) handleMatrix(await readExcelMatrix(e.target.result));
        } catch (err) {
          console.error(err);
          setFileError('Could not read that Excel file. Try exporting it as CSV.');
        } finally { done(); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') handleMatrix(parseCSV(e.target.result));
        done();
      };
      reader.readAsText(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
    e.target.value = '';
  };
  const handlePaste = () => {
    if (!inputText.trim()) { setFileError('Paste a table of teachers and books first.'); return; }
    handleMatrix(parseCSV(inputText));
  };

  const importable = resolvedRows.filter(r => r.status !== 'no-book');
  const parseDate = (s: string, fallback: Date): Date => {
    const t = (s || '').trim();
    if (!t) return fallback;
    const d = new Date(t);
    return isNaN(d.getTime()) ? fallback : d;
  };

  // ---- commit ----
  const runImport = async () => {
    const rows = importable;
    if (rows.length === 0) return;
    setProcessing(true);
    setProgress({ current: 0, total: rows.length });

    // Track remaining copies per book so we don't over-decrement below zero.
    const remaining = new Map<string, number>();
    for (const b of books) remaining.set(b.id, typeof b.availableCopies === 'number' ? b.availableCopies : 0);

    let issued = 0;
    try {
      // Firestore batch caps at 500 writes; each loan = 1 write + occasional book update.
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const batch = writeBatch(db);
        const touchedBooks = new Set<string>();

        for (const r of chunk) {
          const b = r.bookMatch!;
          const checkout = parseDate(r.checkout, new Date());
          const due = parseDate(r.due, addDays(checkout, 14));
          const loanRef = doc(collection(db, 'loans'));
          batch.set(loanRef, {
            userId: r.user?.uid || '',
            userName: r.user?.name || r.teacher || 'Unknown teacher',
            bookId: b.id,
            bookTitle: b.title,
            checkoutDate: checkout.toISOString(),
            dueDate: due.toISOString(),
            status: 'active',
          });
          remaining.set(b.id, Math.max(0, (remaining.get(b.id) ?? 0) - 1));
          touchedBooks.add(b.id);
          issued++;
        }
        for (const id of touchedBooks) {
          batch.update(doc(db, 'books', id), { availableCopies: remaining.get(id) ?? 0 });
        }
        await batch.commit();
        setProgress({ current: Math.min(i + chunk.length, rows.length), total: rows.length });
      }
      setResult({ issued, skipped: resolvedRows.length - importable.length });
      setStep(4);
    } catch (err) {
      console.error('Circulation import failed:', err);
      setFileError('Import failed partway through: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setProcessing(false);
    }
  };

  const matchedCount = resolvedRows.filter(r => r.status === 'matched').length;
  const unmatchedTeacherCount = resolvedRows.filter(r => r.status === 'teacher-unmatched').length;
  const noBookCount = resolvedRows.filter(r => r.status === 'no-book').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zera-emerald-dark/60 backdrop-blur-md" onClick={() => !processing && onClose()} />

      <div className="relative w-full max-w-4xl bg-white rounded-[2rem] border border-natural-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none">
        {/* Header */}
        <div className="flex justify-between items-center px-8 py-5 border-b border-natural-border bg-natural-bg shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zera-emerald/10 text-zera-emerald rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-black text-zera-emerald leading-tight">Batch Loan Import</h3>
              <p className="text-[10px] font-bold text-natural-muted uppercase mt-0.5 tracking-wider">Sync a list of teachers who borrowed books</p>
            </div>
          </div>
          <button disabled={processing} onClick={onClose} className="p-2 text-natural-muted hover:text-red-500 rounded-full hover:bg-natural-border/30 transition-all disabled:opacity-30">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto min-h-[400px]">
          {/* STEP 1 — upload */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <h4 className="text-xl font-serif font-black text-zera-emerald">Upload the Borrower List</h4>
                <p className="text-xs text-natural-muted leading-relaxed font-medium">
                  Upload an <span className="font-bold text-zera-emerald">Excel</span> or <span className="font-bold text-zera-emerald">CSV</span> file with one row per borrow. Include a <span className="font-bold text-zera-emerald">Teacher</span> column and a <span className="font-bold text-zera-emerald">Book Title</span> (or ISBN) column. Optional: <span className="font-bold">Checkout Date</span> and <span className="font-bold">Due Date</span>. We'll match each teacher &amp; book and record the loan automatically.
                </p>
              </div>

              <div
                className={`border-3 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-zera-yellow bg-zera-yellow/5' : 'border-natural-border hover:border-zera-emerald/30 bg-natural-bg/40'}`}
                onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
              >
                <div className="w-16 h-16 bg-white border border-natural-border rounded-2xl flex items-center justify-center text-zera-emerald shadow-sm mb-4">
                  {fileLoading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
                </div>
                <p className="text-sm font-black text-natural-text">{fileLoading ? 'Reading your file…' : 'Drag & drop your file here'}</p>
                {!fileLoading && <p className="text-xs text-natural-muted">Excel or CSV — or click to choose from disk</p>}
                <button onClick={() => fileInputRef.current?.click()} disabled={fileLoading}
                  className="mt-6 px-6 py-2.5 bg-white border border-natural-border hover:border-zera-emerald/30 text-natural-text text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50">
                  Choose File
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.txt,.xlsx,.xlsm,.xlsb,.xls" onChange={handleFileSelect} />
              </div>

              {!dataReady && (
                <p className="text-[10px] text-natural-muted flex items-center gap-2 justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading teachers &amp; catalogue for matching…
                </p>
              )}
              {fileError && (
                <p className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {fileError}
                </p>
              )}

              <div className="space-y-3">
                <label className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Or paste rows (Teacher, Book Title, …)</label>
                <textarea rows={4} value={inputText} onChange={e => setInputText(e.target.value)}
                  placeholder={'Teacher, Book Title, Checkout Date, Due Date\nRichard Hendricks, Pride and Prejudice, 2026-07-01, 2026-07-15'}
                  className="w-full bg-natural-bg/40 border border-natural-border focus:bg-white rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald leading-relaxed" />
                <div className="flex justify-end">
                  <button onClick={handlePaste} className="px-6 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow transition-all">
                    Process Pasted Rows <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — review */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center max-w-xl mx-auto space-y-1.5">
                <UserCheck className="w-10 h-10 text-zera-emerald mx-auto" />
                <h4 className="text-xl font-serif font-black text-zera-emerald">Review {resolvedRows.length} Borrow{resolvedRows.length !== 1 ? 's' : ''}</h4>
                <p className="text-xs text-natural-muted font-medium">
                  We matched each row to a teacher and a book. Click <span className="font-bold text-zera-emerald">Confirm</span> to record the loans. <span className="font-bold">Nothing is saved until you confirm.</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">{matchedCount} matched</span>
                {unmatchedTeacherCount > 0 && <span className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">{unmatchedTeacherCount} teacher not found (kept by name)</span>}
                {noBookCount > 0 && <span className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100">{noBookCount} book not in catalogue (skipped)</span>}
              </div>

              <div className="border border-natural-border rounded-2xl overflow-hidden bg-white">
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-natural-bg text-natural-muted select-none sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">Teacher</th>
                        <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider">Book</th>
                        <th className="px-4 py-2.5 font-black uppercase text-[9px] tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-natural-bg/60 text-natural-text">
                      {resolvedRows.map((r, i) => (
                        <tr key={i} className={r.status === 'no-book' ? 'opacity-50' : ''}>
                          <td className="px-4 py-2 font-bold truncate max-w-[12rem]" title={r.user?.name || r.teacher}>
                            {r.user?.name || r.teacher || <span className="italic font-normal text-natural-muted">—</span>}
                            {r.status === 'teacher-unmatched' && <span className="ml-1 text-[9px] text-amber-600">(by name)</span>}
                          </td>
                          <td className="px-4 py-2 truncate max-w-[14rem]" title={r.bookMatch?.title || r.book}>
                            {r.bookMatch?.title || r.book || r.isbn || '—'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {r.status === 'matched' && <Check className="w-4 h-4 text-emerald-500 inline" />}
                            {r.status === 'teacher-unmatched' && <AlertTriangle className="w-4 h-4 text-amber-500 inline" />}
                            {r.status === 'no-book' && <X className="w-4 h-4 text-red-400 inline" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center gap-3 pt-1">
                <button onClick={() => { setStep(1); setResolvedRows([]); }} className="px-5 py-3 bg-natural-bg border border-natural-border text-natural-text text-xs font-black uppercase tracking-widest rounded-xl hover:bg-natural-border/30 transition-all">
                  Back
                </button>
                <button onClick={() => { setStep(3); runImport(); }} disabled={importable.length === 0}
                  className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-xl flex items-center gap-2 transition-all disabled:opacity-50">
                  <Play className="w-4 h-4 fill-white" /> Confirm &amp; record {importable.length} loan{importable.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — processing */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <Loader2 className="w-12 h-12 text-zera-emerald animate-spin" />
              <div className="text-center space-y-1">
                <h4 className="text-lg font-serif font-black text-zera-emerald">Recording loans…</h4>
                <p className="text-xs text-natural-muted font-medium">{progress.current} / {progress.total} borrows synced</p>
              </div>
              <div className="w-full max-w-md bg-natural-bg h-3 rounded-full overflow-hidden border border-natural-border p-0.5">
                <div className="bg-zera-yellow h-full rounded-full transition-all duration-300" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
              </div>
              {fileError && <p className="text-[10px] font-bold text-red-600">{fileError}</p>}
            </div>
          )}

          {/* STEP 4 — result */}
          {step === 4 && result && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-zera-emerald to-zera-emerald-dark text-white p-8 rounded-[2rem] text-center space-y-4 shadow-xl">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-zera-emerald mx-auto shadow-md">
                  <CheckCircle2 className="w-10 h-10 text-zera-emerald" />
                </div>
                <h4 className="text-3xl font-serif font-black text-zera-yellow leading-tight">Loans Recorded</h4>
                <div className="grid grid-cols-2 max-w-sm mx-auto gap-4 pt-4 border-t border-white/15">
                  <div>
                    <p className="text-[10px] font-black uppercase text-zera-yellow tracking-widest">Loans Issued</p>
                    <p className="text-4xl font-serif font-black">{result.issued}</p>
                  </div>
                  <div className="border-l border-white/10 pl-4">
                    <p className="text-[10px] font-black uppercase text-zera-yellow tracking-widest">Skipped</p>
                    <p className="text-4xl font-serif font-black text-white/60">{result.skipped}</p>
                  </div>
                </div>
                {result.skipped > 0 && (
                  <p className="text-[11px] text-white/80">Skipped rows had a book that isn't in the catalogue. Add those books first, then re-import just those rows.</p>
                )}
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-lg transition-all flex items-center gap-2">
                  Done <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
