import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  X, 
  Search, 
  Book as BookIcon, 
  RefreshCcw, 
  Save, 
  ChevronLeft, 
  ChevronRight,
  Barcode,
  Loader2,
  Edit2,
  Archive,
  UploadCloud,
  Layers,
  Copy,
  CheckCircle2,
  CalendarPlus,
  User
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { BatchBookImporter } from './BatchBookImporter';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, limit, startAfter, getDoc, onSnapshot, where } from 'firebase/firestore';
import { Book, Loan } from '@/src/types';
import { cn, clean } from '@/src/lib/utils';
import { lookupBookByIsbn, lookupBookByTitle, fetchSynopsisFromWeb, fetchWebEnrichment, fetchLexileFromWeb, fetchCoverFromWeb, isRealSynopsis, isRealCover } from '@/src/services/catalogService';
import { BarcodeService } from '@/src/services/BarcodeService';
import { Sparkles, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// Firestore rejects `undefined` field values outright, and empty number inputs
// (parseInt('')) or web enrichment can leave a field as `undefined`/`NaN`.
// Drop any such fields so a blank optional value never blocks the save.
const sanitizeForFirestore = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
};

// The date a book was keyed into the system (its createdAt). Handles the ISO
// string we store, and defensively a Firestore Timestamp, formatted like
// "23 Jul 2026". Returns '' when there's no usable date.
const formatDateAdded = (v: any): string => {
  if (!v) return '';
  let d: Date;
  if (typeof v === 'string' || typeof v === 'number') d = new Date(v);
  else if (typeof v?.toDate === 'function') { try { d = v.toDate(); } catch { return ''; } }
  else if (typeof v?.seconds === 'number') d = new Date(v.seconds * 1000);
  else return '';
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** The subject categories a book may be filed under. */
const BOOK_CATEGORIES = [
  'Fiction', 'Non-Fiction', 'Reference', 'Scientific',
  'History', 'Education', 'Story Book', 'Teacher Resource',
] as const;

/** Strip hyphens/spaces so a scanned EAN and a typed ISBN compare equal. */
const sanitizeIsbn = (isbn?: string | null) => (isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();

/** A complete ISBN-10 or ISBN-13 — the point at which a scan is worth searching on. */
const isCompleteIsbn = (isbn: string) => isbn.length === 10 || isbn.length === 13;

/** How long a lookup will hold its spinner waiting for the book jacket. */
const COVER_WAIT_MS = 7000;

export const CatalogManager = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookForView, setSelectedBookForView] = useState<Book | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  // The slow web top-up (synopsis / Lexile / cover) runs after the form is
  // already filled, so it gets its own quiet indicator rather than the blocking
  // lookup spinner. `enrichSeqRef` discards results from a superseded scan.
  const [isEnriching, setIsEnriching] = useState(false);
  const enrichSeqRef = useRef(0);
  // Last ISBN the scan watcher (or a manual lookup) already searched for, so a
  // single scan never triggers two lookups.
  const lastAutoLookupRef = useRef('');
  const [saving, setSaving] = useState(false);
  // Which book is currently being duplicated (for the per-row spinner), and a
  // brief confirmation banner after a copy is created.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Active loans grouped by bookId, so the catalogue can show who currently has
  // each issued-out book. Kept live via an onSnapshot listener.
  const [activeLoansByBook, setActiveLoansByBook] = useState<Record<string, Loan[]>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  // After adding a new book we want to jump to the page that actually contains
  // it. The book only shows up once the Firestore snapshot re-delivers the
  // catalogue, so we arm this ref on save and let the books effect do the jump
  // once the new record has arrived.
  const pendingJumpRef = useRef(false);
  const [highlightBookId, setHighlightBookId] = useState<string | null>(null);
  // Refs so opening the Add/Edit form scrolls it into view and focuses the
  // title — otherwise editing a book far down the list opens the form off-screen
  // at the top of the page and looks like nothing happened.
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isbnInputRef = useRef<HTMLInputElement>(null);
  const [isBatchImporting, setIsBatchImporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiCopyOnly, setMultiCopyOnly] = useState(false);
  // Lexile reading-level lookup & sort over the catalogue.
  const [lexileSort, setLexileSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [lexileMin, setLexileMin] = useState('');
  const [lexileMax, setLexileMax] = useState('');

  const [newBook, setNewBook] = useState<Partial<Book>>({
    title: '',
    author: '',
    series: '',
    isbn: '',
    barcode: '',
    category: 'Fiction',
    description: '',
    publisher: '',
    publishedYear: new Date().getFullYear(),
    language: 'English',
    pageCount: 0,
    dimensions: '',
    lexileLevel: '',
    totalCopies: 1,
    availableCopies: 1,
    coverUrl: '',
    assignedTeacher: ''
  });

  // Teacher names for the "Assigned Teacher" picker (books kept under a teacher).
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
        const names = snap.docs
          .map(d => (d.data() as any).name)
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
        setTeacherNames(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      } catch (err) {
        console.warn('Could not load teacher names for the assignment picker:', err);
      }
    })();
  }, []);





  useEffect(() => {
    // Fetch all books and filter in-memory to ensure visibility of un-migrated records
    const q = query(collection(db, 'books'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allBooks = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Book));
      // Show books that are active or haven't been assigned a status yet (new registrations default to active)
      const activeBooks = allBooks.filter(book => book.status !== 'archived');
      // Order by when each book was catalogued, oldest first, so a freshly added
      // book always lands at the very bottom of the list — an at-a-glance
      // confirmation that the save worked. Records with no createdAt (older
      // imports) are treated as oldest and fall back to alphabetical order.
      setBooks(activeBooks.sort((a, b) => {
        const ca = a.createdAt || '';
        const cb = b.createdAt || '';
        if (ca !== cb) return ca < cb ? -1 : 1;
        return (a.title || '').localeCompare(b.title || '');
      }));
      // Drop selections that no longer exist in the catalog
      setSelectedIds(prev => new Set([...prev].filter(id => activeBooks.some(b => b.id === id))));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Once the just-added book actually appears in the refreshed catalogue, jump
  // to the page that holds it and briefly highlight it. Waiting for it to be
  // present (rather than jumping immediately) avoids landing on the wrong page
  // before the Firestore snapshot has delivered the new record.
  useEffect(() => {
    if (!pendingJumpRef.current || !highlightBookId) return;
    const idx = books.findIndex(b => b.id === highlightBookId);
    if (idx === -1) return; // new book not in this snapshot yet — wait for the next
    pendingJumpRef.current = false;
    setPage(Math.floor(idx / itemsPerPage) + 1);
    // Clear the highlight after a few seconds so it's just a brief flash.
    const t = setTimeout(() => setHighlightBookId(null), 4000);
    return () => clearTimeout(t);
  }, [books, highlightBookId]);

  // Make sure a looked-up draft carries a genuine web synopsis, publisher/year/
  // author (web search), and a Lexile measure before it reaches the form, so the
  // librarian sees (and can tweak) the real values. Web-sourced fields only fill
  // gaps — they never overwrite data the structured lookup or librarian provided.
  // `skipCover` is set by the lookup handlers, which resolve the jacket up front
  // (see resolveCover) and only use this for the remaining slow fields.
  const withWebSynopsis = async (draft: Partial<Book>, opts?: { skipCover?: boolean }): Promise<Partial<Book>> => {
    const needsEnrich = !isRealSynopsis(draft.description) || !draft.publisher || !draft.publishedYear || !draft.author;
    const emptyEnrich = { description: '', publisher: '', author: '', publishedYear: undefined as number | undefined };
    const [enrich, lexile, cover] = await Promise.all([
      needsEnrich ? fetchWebEnrichment(draft) : Promise.resolve(emptyEnrich),
      draft.lexileLevel ? Promise.resolve('') : fetchLexileFromWeb(draft),
      opts?.skipCover || isRealCover(draft.coverUrl) ? Promise.resolve('') : fetchCoverFromWeb(draft)
    ]);
    return {
      ...draft,
      ...(!isRealSynopsis(draft.description) && enrich.description ? { description: enrich.description } : {}),
      ...(!draft.publisher && enrich.publisher ? { publisher: enrich.publisher } : {}),
      ...(!draft.author && enrich.author ? { author: enrich.author } : {}),
      ...(!draft.publishedYear && enrich.publishedYear ? { publishedYear: enrich.publishedYear } : {}),
      ...(lexile ? { lexileLevel: lexile } : {}),
      ...(cover ? { coverUrl: cover } : {})
    };
  };

  // Drop a freshly-found jacket into the form, but only while it is still the
  // same book and the slot is still empty — the librarian may have moved on or
  // pasted their own cover URL while the search was running.
  const applyCover = (draft: Partial<Book>, url: string) => {
    if (!isRealCover(url)) return;
    setNewBook(prev =>
      sanitizeIsbn(prev.isbn) === sanitizeIsbn(draft.isbn) && !isRealCover(prev.coverUrl)
        ? { ...prev, coverUrl: url }
        : prev
    );
  };

  // The cover is the one field a librarian eyeballs to confirm the scan matched
  // the right edition, so the lookup spinner waits for it rather than finishing
  // against an empty jacket box (which reads as "lookup failed"). The wait is
  // capped: fetchCoverFromWeb cascades through Google Books by ISBN, by title,
  // the Open Library proxy and finally the full metadata lookups, so an unknown
  // book could otherwise hang the form for half a minute. Past the cap the form
  // is released and the cover still drops in on its own when it lands.
  const resolveCover = async (draft: Partial<Book>): Promise<string> => {
    if (isRealCover(draft.coverUrl)) return draft.coverUrl;
    const pending = fetchCoverFromWeb(draft).catch(() => '');
    void pending.then(url => applyCover(draft, url));
    const deadline = new Promise<string>(resolve => setTimeout(() => resolve(''), COVER_WAIT_MS));
    return Promise.race([pending, deadline]);
  };

  // Top the draft up from the slow web sources (DuckDuckGo scrape + AI synopsis,
  // Lexile scrape) WITHOUT holding the form hostage. Blocking the
  // lookup spinner on these is what made cataloguing a book feel like it hung:
  // the structured ISBN lookup resolves in well under a second, but the web
  // enrichment behind it can take another ten or twenty. Now the librarian gets
  // the bibliographic record immediately and the extras land as they arrive.
  const enrichDraftInBackground = (draft: Partial<Book>) => {
    const seq = ++enrichSeqRef.current;
    setIsEnriching(true);
    // The cover was already resolved (or is still in flight from resolveCover,
    // which will fill it in itself) — searching for it again here would only
    // duplicate that whole cascade.
    withWebSynopsis(draft, { skipCover: true })
      .then(enriched => {
        // A newer scan/lookup superseded this one — its results are stale.
        if (seq !== enrichSeqRef.current) return;
        setNewBook(prev => {
          // The librarian moved on to a different book while we were waiting.
          if (sanitizeIsbn(prev.isbn) !== sanitizeIsbn(draft.isbn)) return prev;
          // Only fill gaps — never clobber anything typed during the wait.
          return {
            ...prev,
            ...(!isRealSynopsis(prev.description) && isRealSynopsis(enriched.description) ? { description: enriched.description } : {}),
            ...(!prev.publisher && enriched.publisher ? { publisher: enriched.publisher } : {}),
            ...(!prev.author && enriched.author ? { author: enriched.author } : {}),
            ...(!prev.publishedYear && enriched.publishedYear ? { publishedYear: enriched.publishedYear } : {}),
            ...(!prev.lexileLevel && enriched.lexileLevel ? { lexileLevel: enriched.lexileLevel } : {}),
            ...(!isRealCover(prev.coverUrl) && isRealCover(enriched.coverUrl) ? { coverUrl: enriched.coverUrl } : {})
          };
        });
      })
      .catch(err => console.warn('Background enrichment failed:', err))
      .finally(() => {
        if (seq === enrichSeqRef.current) setIsEnriching(false);
      });
  };

  const handleIsbnLookup = async (isbnOverride?: string) => {
    const isbn = (isbnOverride ?? newBook.isbn ?? '').trim();
    if (!isbn) return;
    // Record what we looked up so the scan watcher below doesn't immediately
    // fire again on the canonical ISBN-13 the lookup writes back into the field.
    lastAutoLookupRef.current = sanitizeIsbn(isbn);
    setIsSearching(true);
    try {
      const data = await lookupBookByIsbn(isbn);
      if (data) {
        const draft = { ...newBook, ...data };
        lastAutoLookupRef.current = sanitizeIsbn(draft.isbn);
        // Show the bibliographic record straight away, then keep the spinner
        // running only until the jacket is in.
        setNewBook(draft);
        const cover = await resolveCover(draft);
        const withCover = isRealCover(cover) ? { ...draft, coverUrl: cover } : draft;
        enrichDraftInBackground(withCover);
      } else {
        alert("Metadata not found for this ISBN. Please enter details manually.");
      }
    } catch (err) {
      alert("Error connecting to metadata service.");
    } finally {
      setIsSearching(false);
    }
  };


  const handleTitleLookup = async () => {
    if (!newBook.title?.trim()) return;
    setIsSearching(true);
    try {
      const matches = await lookupBookByTitle(newBook.title);
      if (matches && matches.length > 0) {
        // Drop empty fields from the match so they don't wipe values already typed in
        const cleaned = Object.fromEntries(
          Object.entries(matches[0]).filter(([, v]) => v !== undefined && v !== null && v !== '')
        ) as Partial<Book>;
        const draft = { ...newBook, ...cleaned };
        lastAutoLookupRef.current = sanitizeIsbn(draft.isbn);
        setNewBook(draft);
        const cover = await resolveCover(draft);
        const withCover = isRealCover(cover) ? { ...draft, coverUrl: cover } : draft;
        enrichDraftInBackground(withCover);
      } else {
        alert("No metadata found for this title. Please enter details manually.");
      }
    } catch (err) {
      alert("Error connecting to metadata service.");
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search on scan. A USB barcode scanner types the whole ISBN in a burst
  // (and usually finishes with Enter), so as soon as the field holds a complete
  // ISBN-10/13 we run the lookup ourselves — no reaching for the search button
  // mid-scan. The short debounce lets the burst finish and stops a hand-typed
  // ISBN from firing on every intermediate keystroke.
  // Deliberately skipped while editing an existing record: re-looking-up a book
  // already in the catalogue would overwrite the librarian's own corrections.
  useEffect(() => {
    if (!isAdding || editingBook || isSearching) return;
    const isbn = sanitizeIsbn(newBook.isbn);
    if (!isCompleteIsbn(isbn) || isbn === lastAutoLookupRef.current) return;
    const timer = setTimeout(() => { void handleIsbnLookup(isbn); }, 350);
    return () => clearTimeout(timer);
    // handleIsbnLookup is deliberately not a dependency: it is recreated every
    // render, so depending on it would re-arm the timer continuously. The ISBN
    // value is the only real trigger.
  }, [newBook.isbn, isAdding, editingBook, isSearching]);

  const handleAutoBarcode = async () => {
    setIsSearching(true);
    try {
      const nextBarcode = await BarcodeService.generateNextBarcode('book');
      setNewBook(prev => ({ ...prev, barcode: nextBarcode }));
    } catch (err) {
      alert("Failed to generate accession number.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSave triggered for", editingBook ? "edit" : "create");
    const now = new Date().toISOString();
    
    setSaving(true);

    try {
      // If no synopsis or Lexile level was provided, look them up on the web
      // before storing so every catalogued title carries them.
      let bookToSave = { ...newBook };
      if (!isRealSynopsis(bookToSave.description) || !bookToSave.lexileLevel) {
        bookToSave = await withWebSynopsis(bookToSave);
        setNewBook(prev => ({ ...prev, description: bookToSave.description, lexileLevel: bookToSave.lexileLevel }));
      }

      if (editingBook) {
        await updateDoc(doc(db, 'books', editingBook.id), sanitizeForFirestore({
          ...bookToSave,
          updatedAt: now
        }));
        setEditingBook(null);
      } else {
        const newRef = await addDoc(collection(db, 'books'), sanitizeForFirestore({
          ...bookToSave,
          availableCopies: bookToSave.totalCopies,
          status: 'active',
          createdAt: now,
          updatedAt: now
        }));
        // Reset any active search/filter and jump to the last page so the newly
        // added book (now at the bottom of the catalogue) is visible and briefly
        // highlighted — clear confirmation the save succeeded.
        setSearchTerm('');
        setMultiCopyOnly(false);
        setLexileSort('none');
        setLexileMin('');
        setLexileMax('');
        pendingJumpRef.current = true;
        setHighlightBookId(newRef.id);
      }
      
      // Close modal and clear data ONLY after successful save
      setIsAdding(false);
      // Drop any in-flight background enrichment and the scan guard, so the next
      // book starts clean and re-scanning this ISBN searches again.
      enrichSeqRef.current++;
      setIsEnriching(false);
      lastAutoLookupRef.current = '';
      setNewBook({
        title: '', author: '', series: '', isbn: '', barcode: '', category: 'Fiction',
        description: '', publisher: '', publishedYear: new Date().getFullYear(),
        language: 'English', pageCount: 0, dimensions: '', lexileLevel: '',
        totalCopies: 1, availableCopies: 1, coverUrl: '', assignedTeacher: ''
      });
    } catch (error) {
      console.error("Catalog Save Error:", error);
      alert("Failed to save book record: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };
  // A catalogue search that found nothing is the moment the librarian discovers
  // the book isn't on the shelf list yet — so open the Add form right there,
  // already carrying what they typed rather than making them retype it.
  //
  // Where the term lands depends on what it looks like: a complete ISBN goes in
  // the ISBN box, where the scan watcher picks it up and runs the metadata
  // lookup on its own, so the record is half-filled before they touch anything.
  // An accession number goes in the accession field, and anything else is a title.
  const startAddFromSearch = () => {
    const term = searchTerm.trim();
    const isAccession = /^zera(student|staff)?\d+$/i.test(term);
    const isbn = sanitizeIsbn(term);
    const asIsbn = !isAccession && isCompleteIsbn(isbn);

    setEditingBook(null);
    // Fresh draft — clear the scan guard so the prefilled ISBN is looked up.
    lastAutoLookupRef.current = '';
    enrichSeqRef.current++;
    setIsEnriching(false);
    setNewBook({
      title: asIsbn || isAccession ? '' : term,
      author: '', series: '',
      isbn: asIsbn ? isbn : '',
      barcode: isAccession ? term : '',
      category: 'Fiction', description: '', publisher: '',
      publishedYear: new Date().getFullYear(), language: 'English',
      pageCount: 0, dimensions: '', lexileLevel: '',
      totalCopies: 1, availableCopies: 1, coverUrl: '', assignedTeacher: ''
    });
    setIsAdding(true);
  };

  const startEdit = (book: Book) => {
    setEditingBook(book);
    setNewBook({
      title: book.title,
      author: book.author,
      series: book.series || '',
      isbn: book.isbn,
      barcode: book.barcode || '',
      category: book.category,
      description: book.description,
      publisher: book.publisher || '',
      publishedYear: book.publishedYear || new Date().getFullYear(),
      language: book.language || 'English',
      pageCount: book.pageCount || 0,
      dimensions: book.dimensions || '',
      lexileLevel: book.lexileLevel || '',
      totalCopies: book.totalCopies,
      availableCopies: book.availableCopies,
      coverUrl: book.coverUrl,
      // Preload the assigned teacher — WITHOUT this, editing & saving a book
      // would overwrite the stored teacher with a blank and lose the tracking.
      assignedTeacher: book.assignedTeacher || ''
    });
    setIsAdding(true);
  };

  // Split one physical copy of a multi-copy book off into its own catalogue
  // record: same bibliographic details and ISBN, but a brand-new accession
  // number so each copy can be scanned & borrowed individually. The source
  // record loses one copy so the total physical count stays correct.
  const handleDuplicate = async (book: Book, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (duplicatingId) return;
    setDuplicatingId(book.id);
    try {
      const now = new Date().toISOString();
      const newBarcode = await BarcodeService.generateNextBarcode('book');
      // A record with totalCopies > 1 holds several physical copies under one
      // accession; duplicating SPLITS one off (total unchanged). A single-copy
      // record duplicates by ADDING a brand-new copy (total grows by one).
      const isPooled = (book.totalCopies || 0) > 1;
      const sourceHasAvailable = (book.availableCopies || 0) > 0;

      const { id: _ignoredId, ...rest } = book;
      const copy = sanitizeForFirestore({
        ...rest,
        barcode: newBarcode,
        totalCopies: 1,
        availableCopies: isPooled ? (sourceHasAvailable ? 1 : 0) : 1,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      const newRef = await addDoc(collection(db, 'books'), copy);

      if (isPooled) {
        // Peel one copy off the source so the physical total stays correct.
        const srcTotal = Math.max(1, (book.totalCopies || 1) - 1);
        const srcAvail = sourceHasAvailable
          ? Math.max(0, Math.min((book.availableCopies || 0) - 1, srcTotal))
          : Math.min(book.availableCopies || 0, srcTotal);
        await updateDoc(doc(db, 'books', book.id), {
          totalCopies: srcTotal,
          availableCopies: srcAvail,
          updatedAt: now,
        });
        setNotice(`Copy split from “${book.title}” — accession ${newBarcode}. ${srcTotal > 1 ? `${srcTotal} copies still share the original record.` : 'Each copy now has its own accession number.'}`);
      } else {
        // Add a brand-new additional copy; the source record is left untouched.
        setNotice(`New copy of “${book.title}” created — accession ${newBarcode}.`);
      }

      // The onSnapshot listener refreshes the list; highlight the new copy.
      setHighlightBookId(newRef.id);
    } catch (err) {
      console.error('Duplicate error:', err);
      alert('Failed to duplicate copy: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDuplicatingId(null);
    }
  };

  // Auto-dismiss the copy-created banner after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Live map of who currently has each book out, keyed by bookId, so an
  // issued-out book can show the borrower's name in the catalogue.
  useEffect(() => {
    const q = query(collection(db, 'loans'), where('status', '==', 'active'));
    const unsub = onSnapshot(q, (snap) => {
      const map: Record<string, Loan[]> = {};
      snap.docs.forEach(d => {
        const loan = { id: d.id, ...d.data() } as Loan;
        if (!loan.bookId) return;
        if (!map[loan.bookId]) map[loan.bookId] = [];
        map[loan.bookId].push(loan);
      });
      setActiveLoansByBook(map);
    }, (err) => console.error('Active-loans listener error:', err));
    return () => unsub();
  }, []);

  // Compact "Borrowed by …" label for a book's active loans (names of holders).
  const borrowersLabel = (bookId: string): string | null => {
    const loans = activeLoansByBook[bookId];
    if (!loans || loans.length === 0) return null;
    const names = loans.map(l => (l.userName || 'Unknown').trim()).filter(Boolean);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]}, ${names[1]}`;
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  };

  // When the Add/Edit form opens, scroll it into view and focus the field the
  // librarian is about to use: the ISBN box for a new title (so a barcode scan
  // lands straight in it and auto-searches), the title when editing an existing
  // record, where the ISBN is already known.
  useEffect(() => {
    if (!isAdding) return;
    const t = setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (editingBook) titleInputRef.current?.focus();
      else isbnInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [isAdding, editingBook]);

  // Replaces a stored placeholder/missing description and missing Lexile level
  // with real values looked up on the web, directly from the detail view.
  const handleRefreshSynopsis = async () => {
    if (!selectedBookForView) return;
    setSaving(true);
    try {
      const [synopsis, lexile, cover] = await Promise.all([
        fetchSynopsisFromWeb(selectedBookForView),
        fetchLexileFromWeb(selectedBookForView),
        isRealCover(selectedBookForView.coverUrl) ? Promise.resolve('') : fetchCoverFromWeb(selectedBookForView)
      ]);
      if (synopsis || lexile || cover) {
        const updates: Partial<Book> & { updatedAt: string } = { updatedAt: new Date().toISOString() };
        if (synopsis) updates.description = synopsis;
        if (lexile) updates.lexileLevel = lexile;
        if (cover) updates.coverUrl = cover;
        await updateDoc(doc(db, 'books', selectedBookForView.id), updates);
        setSelectedBookForView({ ...selectedBookForView, ...updates });
      } else {
        alert("No new synopsis, Lexile measure, or cover found on the web for this title/ISBN.");
      }
    } catch (error) {
      alert("Failed to update book details: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  // Walks the whole catalogue and fills in the Lexile level for every book
  // that doesn't have one yet.
  const [lexileSync, setLexileSync] = useState<{ current: number; total: number } | null>(null);
  const handleSyncLexileLevels = async () => {
    const missing = books.filter(b => !b.lexileLevel);
    if (missing.length === 0) {
      alert("All catalogued books already have a Lexile level (where one exists).");
      return;
    }
    if (!window.confirm(`Look up Lexile reading levels for ${missing.length} book${missing.length !== 1 ? 's' : ''} without one? This may take a few minutes.`)) {
      return;
    }
    setLexileSync({ current: 0, total: missing.length });
    let found = 0;
    try {
      for (let i = 0; i < missing.length; i++) {
        setLexileSync({ current: i + 1, total: missing.length });
        const lexile = await fetchLexileFromWeb(missing[i]);
        if (lexile) {
          await updateDoc(doc(db, 'books', missing[i].id), {
            lexileLevel: lexile,
            updatedAt: new Date().toISOString()
          });
          found++;
        }
      }
      alert(`Lexile sync complete: measures found and saved for ${found} of ${missing.length} books. Books without a result have no published Lexile measure.`);
    } catch (error) {
      alert("Lexile sync stopped: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLexileSync(null);
    }
  };

  // Walks the whole catalogue and fetches a real cover image for every book
  // that is still showing the generic placeholder (or has none).
  const [coverSync, setCoverSync] = useState<{ current: number; total: number } | null>(null);
  const handleSyncBookCovers = async () => {
    const missing = books.filter(b => !isRealCover(b.coverUrl));
    if (missing.length === 0) {
      alert("Every catalogued book already has a real cover image.");
      return;
    }
    if (!window.confirm(`Find and attach cover images for ${missing.length} book${missing.length !== 1 ? 's' : ''} without one? This may take a few minutes.`)) {
      return;
    }
    setCoverSync({ current: 0, total: missing.length });
    let found = 0;
    try {
      for (let i = 0; i < missing.length; i++) {
        setCoverSync({ current: i + 1, total: missing.length });
        const cover = await fetchCoverFromWeb(missing[i]);
        if (cover) {
          await updateDoc(doc(db, 'books', missing[i].id), {
            coverUrl: cover,
            updatedAt: new Date().toISOString()
          });
          found++;
        }
      }
      alert(`Cover sync complete: covers found and saved for ${found} of ${missing.length} books. Books without a result have no cover in the public databases.`);
    } catch (error) {
      alert("Cover sync stopped: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setCoverSync(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /**
   * Re-file every selected book under one subject category.
   *
   * Reclassifying a class set one record at a time is the kind of job that gets
   * abandoned half-done, which is how a catalogue ends up with the same set
   * split across "Fiction" and "Teacher Resource". Only the category changes —
   * loans, copies and accession numbers are untouched.
   */
  const handleRecategoriseSelected = async (category: string) => {
    if (selectedIds.size === 0 || !category) return;
    const ids = [...selectedIds];
    const already = books.filter(b => selectedIds.has(b.id) && b.category === category).length;
    const changing = ids.length - already;
    if (changing === 0) {
      setNotice(`All ${ids.length} selected book${ids.length !== 1 ? 's are' : ' is'} already filed under “${category}”.`);
      return;
    }
    if (!window.confirm(
      `Re-file ${changing} book${changing !== 1 ? 's' : ''} under “${category}”?` +
      (already ? `\n\n${already} of the ${ids.length} selected are already in that category and will be left as they are.` : '')
    )) return;

    setSaving(true);
    let done = 0;
    try {
      for (const id of ids) {
        const book = books.find(b => b.id === id);
        if (!book || book.category === category) continue;
        await updateDoc(doc(db, 'books', id), { category, updatedAt: new Date().toISOString() });
        done += 1;
      }
      setSelectedIds(new Set());
      setNotice(`${done} book${done !== 1 ? 's' : ''} re-filed under “${category}”.`);
    } catch (err) {
      console.error('Bulk recategorise failed:', err);
      alert(`Re-filed ${done} of ${changing} before failing: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} selected book${selectedIds.size !== 1 ? 's' : ''}? Their copies and any current loans will also be removed; past borrowing history is kept. This action cannot be undone.`)) {
      return;
    }

    setSaving(true);
    try {
      for (const id of selectedIds) {
        // Remove the book's copies and loan records too, so nothing is orphaned
        const copiesSnap = await getDocs(query(collection(db, 'copies'), where('bookId', '==', id)));
        for (const copyDoc of copiesSnap.docs) {
          await deleteDoc(doc(db, 'copies', copyDoc.id));
        }
        // Only the ACTIVE loans go: those hold a copy against a member who no
        // longer has anything to return. Returned loans are kept — they are that
        // member's borrowing history, and the record carries its own bookTitle,
        // so it still reads correctly once the book record is gone. Deleting
        // them used to wipe a teacher's history the moment a title was weeded.
        const loansSnap = await getDocs(query(collection(db, 'loans'), where('bookId', '==', id)));
        for (const loanDoc of loansSnap.docs) {
          if ((loanDoc.data() as { status?: string }).status === 'returned') continue;
          await deleteDoc(doc(db, 'loans', loanDoc.id));
        }
        await deleteDoc(doc(db, 'books', id));
      }
      if (selectedBookForView && selectedIds.has(selectedBookForView.id)) {
        setSelectedBookForView(null);
      }
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
      alert("Failed to delete selected books: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!confirm("Are you sure you want to PERMANENTLY delete this book? This will remove it from the library catalog entirely. This action cannot be undone.")) {
      return;
    }

    setSaving(true);
    try {
      await deleteDoc(doc(db, 'books', id));
      alert("Book deleted successfully.");
      setConfirmDeleteId(null);
      if (selectedBookForView?.id === id) {
        setSelectedBookForView(null);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to delete book: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  // "Multiple copies" = the SAME title appears more than once in the catalogue
  // (duplicate records), OR a single record holds more than one physical copy.
  const titleKey = (b: Book) => (b.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const titleFreq = books.reduce((map, b) => {
    const k = titleKey(b);
    if (k) map.set(k, (map.get(k) || 0) + 1);
    return map;
  }, new Map<string, number>());
  const isMultiCopy = (b: Book) =>
    (b.totalCopies || 0) > 1 || (titleFreq.get(titleKey(b)) || 0) > 1;

  // Parse a Lexile code ("740L", "AD610L", "BR150L", "1000L") into a sortable number.
  // Reader-prefixes (AD/HL/IG/NC/GN) are advisory and ignored; "BR" (Beginning Reader)
  // sits below 0L, so its number is negated. Returns null when there is no measure.
  const parseLexile = (lex?: string): number | null => {
    if (!lex) return null;
    const m = lex.match(/(\d+)/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (isNaN(n)) return null;
    return /BR/i.test(lex) ? -n : n;
  };

  const multiCopyBooks = books.filter(isMultiCopy);
  const multiCopyCount = multiCopyBooks.length;

  const lexMinN = lexileMin.trim() === '' ? null : parseInt(lexileMin, 10);
  const lexMaxN = lexileMax.trim() === '' ? null : parseInt(lexileMax, 10);
  const lexileFilterActive = lexMinN !== null || lexMaxN !== null;

  let displayBooks = multiCopyOnly ? multiCopyBooks : books;

  // Free-text search across the fields a librarian would look a book up by.
  const searchQuery = searchTerm.trim().toLowerCase();
  if (searchQuery) {
    // An accession number (e.g. "zera40") must match a book's barcode EXACTLY —
    // never a substring — so "zera40" returns only Zera40, not Zera400..Zera409.
    const isAccession = /^zera(student|staff)?\d+$/i.test(searchQuery);
    if (isAccession) {
      displayBooks = displayBooks.filter(b => (b.barcode || '').toLowerCase() === searchQuery);
    } else {
      const terms = searchQuery.split(/\s+/);
      displayBooks = displayBooks.filter(b => {
        // Note: barcode is intentionally NOT in the haystack — it is only matched
        // exactly, via the accession branch above.
        const haystack = [
          b.title, b.author, b.isbn, b.category, b.publisher, b.assignedTeacher,
          ...(b.subjects || []),
          // Who currently has it out. Without this there was no way to pull up
          // "every book Hadifah has" — the catalogue could be searched by what a
          // book *is* but never by who is holding it, even though that is how a
          // librarian thinks when reclassifying or chasing a class set.
          ...(activeLoansByBook[b.id] || []).map(l => l.userName || ''),
        ].filter(Boolean).join(' ').toLowerCase();
        // Every whitespace-separated term must appear (AND search).
        return terms.every(t => haystack.includes(t));
      });
    }
  }

  // Lexile range lookup: keep books whose measure falls within [min, max].
  // Records with no Lexile are excluded while a range is active.
  if (lexileFilterActive) {
    displayBooks = displayBooks.filter(b => {
      const v = parseLexile(b.lexileLevel);
      if (v === null) return false;
      if (lexMinN !== null && v < lexMinN) return false;
      if (lexMaxN !== null && v > lexMaxN) return false;
      return true;
    });
  }

  // Lexile sort: un-measured books always sink to the bottom regardless of direction.
  if (lexileSort !== 'none') {
    displayBooks = [...displayBooks].sort((a, b) => {
      const va = parseLexile(a.lexileLevel);
      const vb = parseLexile(b.lexileLevel);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return lexileSort === 'asc' ? va - vb : vb - va;
    });
  }

  const totalPages = Math.ceil(displayBooks.length / itemsPerPage);
  const paginatedBooks = displayBooks.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const lexileMatchCount = displayBooks.length;
  const cycleLexileSort = () => {
    setLexileSort(s => (s === 'asc' ? 'desc' : s === 'desc' ? 'none' : 'asc'));
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end border-b border-natural-border pb-6">
        <div>
          <h2 className="font-serif text-3xl font-bold text-natural-text">Catalogue Management</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-natural-muted font-medium italic">Zera Education Library System</p>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zera-emerald/10 rounded-full border border-zera-emerald/20 shadow-inner">
              <div className="w-1.5 h-1.5 bg-zera-emerald rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              <span className="text-[10px] font-black text-zera-emerald uppercase tracking-widest">Active Z39.50 Connection</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {selectedIds.size > 0 && (
            <select
              disabled={saving}
              value=""
              onChange={e => { const v = e.target.value; e.target.value = ''; handleRecategoriseSelected(v); }}
              title="Re-file the selected books under a different subject category"
              className="px-4 py-2.5 bg-white border border-natural-border rounded-full text-sm font-bold uppercase tracking-wider text-zera-emerald shadow-md cursor-pointer disabled:opacity-50"
            >
              <option value="">Set category ({selectedIds.size})…</option>
              {BOOK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white hover:bg-rose-700 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider hover:scale-[1.01] disabled:opacity-50"
              title="Permanently delete the selected books along with their copies and loan records."
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => { setMultiCopyOnly(v => !v); setPage(1); }}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider",
              multiCopyOnly
                ? "bg-zera-emerald text-white hover:bg-zera-emerald-dark"
                : "bg-white border border-zera-emerald/30 text-zera-emerald hover:bg-zera-emerald/5"
            )}
            title="Show titles that appear more than once in the catalogue (duplicate records), or a record with more than one copy"
          >
            <Copy className="w-4 h-4" />
            {multiCopyOnly ? `Multiple Copies (${multiCopyCount})` : 'Multiple Copies'}
          </button>
          <button
            type="button"
            disabled={coverSync !== null || lexileSync !== null || saving}
            onClick={handleSyncBookCovers}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zera-emerald/30 text-zera-emerald hover:bg-zera-emerald/5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider disabled:opacity-60"
            title="Find and attach a real cover image for every catalogued book that doesn't have one yet."
          >
            {coverSync ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookIcon className="w-4 h-4" />}
            {coverSync ? `Covers ${coverSync.current}/${coverSync.total}` : 'Sync Book Covers'}
          </button>
          <button
            type="button"
            disabled={lexileSync !== null || coverSync !== null || saving}
            onClick={handleSyncLexileLevels}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zera-emerald/30 text-zera-emerald hover:bg-zera-emerald/5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider disabled:opacity-60"
            title="Look up the Lexile reading level for every catalogued book that doesn't have one yet."
          >
            {lexileSync ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {lexileSync ? `Lexile ${lexileSync.current}/${lexileSync.total}` : 'Sync Lexile Levels'}
          </button>
          <button
            type="button"
            onClick={() => setIsBatchImporting(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-zera-yellow text-zera-emerald-dark hover:brightness-95 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider"
          >
            <UploadCloud className="w-4 h-4" />
            Batch Import / Sync
          </button>
          <button 
            type="button"
            onClick={() => {
              setIsAdding(!isAdding);
              if (isAdding) setEditingBook(null);
              // Fresh form — forget the last scan so re-scanning the same ISBN
              // (e.g. cataloguing a second copy) searches again.
              lastAutoLookupRef.current = '';
              enrichSeqRef.current++;
              setIsEnriching(false);
            }}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider",
              isAdding ? "bg-natural-bg text-natural-muted border border-natural-border" : "bg-zera-emerald text-white hover:bg-zera-emerald-dark"
            )}
          >
            {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isAdding ? 'Cancel' : 'Add New Title'}
          </button>
        </div>
      </div>

      {isAdding && (
        <form ref={formRef} onSubmit={handleSave} className="p-8 bg-white border-2 border-zera-emerald/30 rounded-3xl shadow-lg grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-4">
          <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-natural-border pb-6 md:pb-0 md:pr-8 space-y-6 text-center">
             <div className="space-y-1 text-left">
                <h3 className="text-lg font-black text-zera-emerald uppercase tracking-tight">
                  {editingBook ? 'Edit Record' : 'Initial Registration'}
                </h3>
                <p className="text-[10px] font-bold text-natural-muted uppercase">Metadata Synchronization Service</p>
             </div>
             <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">ISBN (Z39.50 / Library Lookup)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <BookIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                      <input
                        ref={isbnInputRef}
                        placeholder="Scan or type ISBN-10 / ISBN-13"
                        className="w-full pl-9 pr-3 py-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald font-mono"
                        value={newBook.isbn} onChange={e => setNewBook({...newBook, isbn: e.target.value})}
                        // Barcode scanners terminate with Enter. Without this it
                        // submits the form and saves a half-empty record instead
                        // of running the lookup.
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleIsbnLookup();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleIsbnLookup()}
                      disabled={isSearching}
                      className="p-3 bg-zera-emerald text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
                    >
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Accession Number (Asset ID)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                      <input 
                        placeholder="ZERA-XXXXX"
                        className="w-full pl-9 pr-3 py-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald font-mono" 
                        value={newBook.barcode} onChange={e => setNewBook({...newBook, barcode: e.target.value})}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleAutoBarcode}
                      className="p-3 bg-zera-yellow/20 text-zera-emerald-dark rounded-xl hover:bg-zera-yellow/40 transition-colors border border-zera-yellow/30"
                      title="Generate accession number"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {isEnriching ? (
                  <p className="flex items-center gap-1.5 text-[9px] font-bold text-zera-emerald uppercase tracking-tighter">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Fetching synopsis &amp; Lexile in the background — you can keep editing
                  </p>
                ) : (
                  <p className="text-[9px] font-bold text-zera-emerald uppercase tracking-tighter">Scan a barcode to search automatically — no need to press the button</p>
                )}
             </div>
             
             <div className="aspect-[3/4] bg-natural-bg rounded-2xl overflow-hidden relative border-2 border-dashed border-natural-border flex items-center justify-center">
               {newBook.coverUrl ? (
                 <img src={newBook.coverUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=400'; }} />
               ) : isSearching ? (
                 <div className="text-center p-6 text-zera-emerald">
                   <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin" />
                   <p className="text-[10px] font-bold uppercase tracking-widest">Finding Cover…</p>
                 </div>
               ) : (
                 <div className="text-center p-6 grayscale opacity-20">
                   <BookIcon className="w-12 h-12 mx-auto mb-2" />
                   <p className="text-[10px] font-bold uppercase">No Cover Found</p>
                 </div>
               )}
             </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Book Title</label>
                <div className="flex gap-2">
                  <input
                    ref={titleInputRef}
                    required
                    placeholder="Official Title"
                    className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text font-bold"
                    value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})}
                  />
                  <button
                    type="button"
                    onClick={handleTitleLookup}
                    disabled={isSearching || !newBook.title?.trim()}
                    className="p-3 bg-zera-emerald text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm shrink-0"
                    title="Look up metadata & synopsis by title"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Primary Author <span className="text-natural-muted/60 normal-case tracking-normal font-medium">(optional)</span></label>
                <input
                  placeholder="Full Name (optional)"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.author} onChange={e => setNewBook({...newBook, author: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Sub-Series (Internal)</label>
                <input
                  placeholder="Edition or Volume Info"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text"
                  value={newBook.series} onChange={e => setNewBook({...newBook, series: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Assigned Teacher <span className="text-natural-muted/60 normal-case tracking-normal">(kept under)</span></label>
                <input
                  list="catalog-teacher-list"
                  placeholder="Type or pick a teacher name"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text"
                  value={newBook.assignedTeacher || ''} onChange={e => setNewBook({...newBook, assignedTeacher: e.target.value})}
                />
                <datalist id="catalog-teacher-list">
                  {teacherNames.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Subject Category</label>
                <select 
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.category} onChange={e => setNewBook({...newBook, category: e.target.value})}
                >
                  {BOOK_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Publisher</label>
                <input 
                  placeholder="Publishing House"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.publisher} onChange={e => setNewBook({...newBook, publisher: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Year</label>
                <input
                  type="number"
                  placeholder="YYYY"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text"
                  value={newBook.publishedYear} onChange={e => setNewBook({...newBook, publishedYear: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Lexile Level</label>
                <input
                  placeholder="Auto e.g. 740L"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text font-mono"
                  value={newBook.lexileLevel} onChange={e => setNewBook({...newBook, lexileLevel: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
               <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Language</label>
                <input 
                  placeholder="Language"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.language} onChange={e => setNewBook({...newBook, language: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Pages</label>
                <input 
                  type="number"
                  placeholder="Page Count"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.pageCount} onChange={e => setNewBook({...newBook, pageCount: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Size</label>
                <input 
                  placeholder="e.g. 21cm"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text" 
                  value={newBook.dimensions} onChange={e => setNewBook({...newBook, dimensions: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Inventory</label>
                <input 
                  type="number"
                  min="1"
                  required
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text font-bold" 
                  value={newBook.totalCopies} onChange={e => setNewBook({...newBook, totalCopies: parseInt(e.target.value) || 1})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Book Synopsis</label>
              <textarea
                rows={3}
                placeholder="Leave blank to automatically fetch the plot/synopsis from the web when saving."
                className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text leading-relaxed"
                value={newBook.description} onChange={e => setNewBook({...newBook, description: e.target.value})}
              />
            </div>
            
             <div className="flex justify-end pt-4">
               <button 
                 type="submit" 
                 disabled={saving}
                 className="px-10 py-4 bg-zera-emerald text-white rounded-full text-xs font-black shadow-lg hover:bg-zera-emerald-dark transition-all uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
               >
                 {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                 {saving ? 'Processing...' : (editingBook ? 'Update Record' : 'Finalize & Store')}
               </button>
             </div>
          </div>
        </form>
      )}

      {/* Search the catalogue */}
      <div className="bg-white p-3 rounded-3xl border border-natural-border shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search by title, author, ISBN, accession no., category, or who has it out…"
              className="w-full pl-11 pr-28 py-3 bg-natural-bg/50 border border-natural-border rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-zera-emerald transition-all"
            />
            {searchTerm.trim() && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest whitespace-nowrap",
                  displayBooks.length === 0 ? "text-rose-500" : "text-zera-emerald"
                )}>
                  {displayBooks.length} found
                </span>
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setPage(1); }}
                  title="Clear search"
                  className="text-natural-muted hover:text-rose-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {/* Nothing on the shelf list matched — the book almost certainly needs
              cataloguing, so the shortcut sits right beside the search box. */}
          {searchTerm.trim() && displayBooks.length === 0 && !isAdding && (
            <button
              type="button"
              onClick={startAddFromSearch}
              title={`Catalogue “${searchTerm.trim()}” as a new book`}
              className="shrink-0 flex items-center gap-2 px-5 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-2xl text-xs font-black uppercase tracking-widest shadow-md transition-all animate-in fade-in slide-in-from-right-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add this book</span>
            </button>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-3xl border border-natural-border shadow-sm">
         <div className="flex items-center gap-4 bg-natural-bg px-4 py-2 rounded-2xl">
            <div className="flex items-center gap-2 text-[10px] font-black text-zera-emerald uppercase tracking-widest">
              <div className="w-2 h-2 bg-zera-emerald rounded-full animate-pulse"></div>
              {books.length} Catalogue entries
            </div>
         </div>

         {/* Lexile reading-level lookup & sort */}
         <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-natural-bg rounded-2xl border border-natural-border">
               <Sparkles className="w-3.5 h-3.5 text-zera-emerald shrink-0" />
               <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">Lexile</span>
               <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  value={lexileMin}
                  onChange={e => { setLexileMin(e.target.value); setPage(1); }}
                  className="w-14 px-2 py-1 bg-white border border-natural-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald"
                  title="Lowest Lexile measure to include (e.g. 400)"
               />
               <span className="text-natural-muted text-xs">–</span>
               <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  value={lexileMax}
                  onChange={e => { setLexileMax(e.target.value); setPage(1); }}
                  className="w-14 px-2 py-1 bg-white border border-natural-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald"
                  title="Highest Lexile measure to include (e.g. 800)"
               />
               {lexileFilterActive && (
                  <>
                     <span className="text-[9px] font-black text-zera-emerald uppercase tracking-widest">{lexileMatchCount} hit{lexileMatchCount === 1 ? '' : 's'}</span>
                     <button
                        type="button"
                        onClick={() => { setLexileMin(''); setLexileMax(''); setPage(1); }}
                        title="Clear Lexile range"
                        className="text-natural-muted hover:text-rose-500 transition-colors"
                     >
                        <X className="w-3.5 h-3.5" />
                     </button>
                  </>
               )}
            </div>
            <button
               type="button"
               onClick={cycleLexileSort}
               className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                  lexileSort !== 'none'
                     ? "bg-zera-emerald text-white hover:bg-zera-emerald-dark"
                     : "bg-white border border-zera-emerald/30 text-zera-emerald hover:bg-zera-emerald/5"
               )}
               title="Sort the catalogue by Lexile reading level (click to cycle: low→high, high→low, off)"
            >
               {lexileSort === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : lexileSort === 'desc' ? <ArrowDown className="w-3.5 h-3.5" /> : <ArrowUpDown className="w-3.5 h-3.5" />}
               {lexileSort === 'asc' ? 'Low → High' : lexileSort === 'desc' ? 'High → Low' : 'Sort Lexile'}
            </button>
         </div>

         <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest mr-2">Page {page} of {totalPages || 1}</span>
            <div className="flex gap-1">
               <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-3 border border-natural-border rounded-2xl hover:bg-natural-bg transition-colors disabled:opacity-20"
                  disabled={page === 1}
                >
                 <ChevronLeft className="w-4 h-4" />
               </button>
               <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-3 border border-natural-border rounded-2xl hover:bg-natural-bg transition-colors disabled:opacity-20"
                  disabled={page === totalPages || totalPages === 0}
                >
                 <ChevronRight className="w-4 h-4" />
               </button>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-[40px] border border-natural-border shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1000px]">
            <thead className="bg-natural-bg text-natural-muted text-[10px] uppercase font-black tracking-widest border-b border-natural-border">
            <tr>
              <th className="pl-8 pr-2 py-5 w-12">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-zera-emerald cursor-pointer"
                  title="Select all books on this page"
                  checked={paginatedBooks.length > 0 && paginatedBooks.every(b => selectedIds.has(b.id))}
                  onChange={e => {
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      paginatedBooks.forEach(b => e.target.checked ? next.add(b.id) : next.delete(b.id));
                      return next;
                    });
                  }}
                />
              </th>
              <th className="px-8 py-5">Accession No.</th>
              <th className="px-8 py-5">ISBN</th>
              <th className="px-8 py-5">Title & Author</th>
              <th className="px-8 py-5">Category</th>
              <th className="px-8 py-5">
                <button
                  type="button"
                  onClick={cycleLexileSort}
                  className="flex items-center gap-1 uppercase font-black tracking-widest hover:text-zera-emerald transition-colors"
                  title="Sort by Lexile reading level"
                >
                  Lexile
                  {lexileSort === 'asc' ? <ArrowUp className="w-3 h-3 text-zera-emerald" /> : lexileSort === 'desc' ? <ArrowDown className="w-3 h-3 text-zera-emerald" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                </button>
              </th>
              <th className="px-8 py-5">Availability</th>
              <th className="px-8 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-natural-bg">
            {paginatedBooks.map(book => (
              <tr 
                key={book.id} 
                onClick={() => setSelectedBookForView(book)}
                className={cn(
                  "hover:bg-natural-bg/40 transition-colors group cursor-pointer",
                  selectedIds.has(book.id) && "bg-rose-50/50",
                  highlightBookId === book.id && "bg-zera-emerald/10 ring-2 ring-inset ring-zera-emerald animate-in fade-in"
                )}
              >
                <td className="pl-8 pr-2 py-5 w-12" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-zera-emerald cursor-pointer"
                    checked={selectedIds.has(book.id)}
                    onChange={() => toggleSelect(book.id)}
                  />
                </td>
                <td className="px-8 py-5 font-mono text-[10px] text-natural-muted uppercase font-bold tracking-tighter">
                  <div className="text-zera-emerald">{book.barcode || `ZERA-${book.isbn.slice(-6)}`}</div>
                </td>
                <td className="px-8 py-5 font-mono text-[10px] text-natural-muted uppercase font-bold tracking-tighter">
                  <div className="opacity-60 font-medium">{book.isbn}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex gap-4 items-center">
                    <div className="w-10 h-12 bg-natural-bg rounded-lg border border-natural-border overflow-hidden shrink-0 shadow-sm transition-transform group-hover:scale-110">
                      <img 
                        src={book.coverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=400'} 
                        alt="Cover" 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=400';
                        }}
                      />
                    </div>
                    <div>
                      <div className="font-black text-natural-text group-hover:text-zera-emerald transition-colors leading-tight flex items-center gap-1.5 flex-wrap">
                        {book.title}

                      </div>
                      {book.author?.trim() && <div className="text-[10px] text-natural-muted font-bold uppercase tracking-wider mt-0.5">{book.author}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-widest px-2.5 py-1 bg-natural-bg rounded-lg border border-natural-border">{book.category}</span>
                </td>
                <td className="px-8 py-5">
                   {book.lexileLevel
                     ? <span className="text-[10px] font-black text-zera-emerald font-mono px-2.5 py-1 bg-zera-emerald/10 rounded-lg border border-zera-emerald/20">{book.lexileLevel}</span>
                     : <span className="text-[9px] font-bold text-natural-muted/50 uppercase tracking-widest">—</span>}
                </td>
                <td className="px-8 py-5">
                  <div className="flex flex-col gap-1.5">
                     <div className="flex items-center gap-3">
                        <div className="w-24 bg-natural-bg h-2 rounded-full overflow-hidden border border-natural-border">
                          <div className={cn("h-full", 
                            (book.availableCopies/book.totalCopies) < 0.2 ? "bg-red-500" : "bg-zera-emerald"
                          )} style={{ width: `${(book.availableCopies/book.totalCopies)*100}%` }}></div>
                        </div>
                        <span className="text-[10px] font-black text-natural-text">{book.availableCopies}/{book.totalCopies}</span>
                     </div>
                     <span className={cn(
                       "text-[9px] w-fit px-2 py-0.5 rounded font-black border tracking-tighter uppercase",
                       book.availableCopies > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                     )}>
                       {book.availableCopies > 0 ? "In Stacks" : "Issued Out"}
                     </span>
                     {borrowersLabel(book.id) && (
                       <span className="text-[9px] font-bold text-natural-muted uppercase tracking-wide flex items-center gap-1" title="Currently borrowed by">
                         <User className="w-3 h-3 shrink-0 text-zera-emerald" />
                         <span className="truncate max-w-[10rem]">{borrowersLabel(book.id)}</span>
                       </span>
                     )}
                  </div>
                </td>
                <td className="px-8 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                   <div className="flex gap-2 justify-end">
                     <button
                       disabled={!!duplicatingId}
                       onClick={(e) => handleDuplicate(book, e)}
                       title="Duplicate this book — creates a separate copy with the same ISBN but a new accession number"
                       className="p-3 hover:bg-zera-emerald/10 text-natural-muted hover:text-zera-emerald rounded-2xl transition-all border border-transparent hover:border-zera-emerald/20 shadow-sm hover:shadow-md disabled:opacity-50 flex items-center gap-2"
                     >
                        {duplicatingId === book.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Copy className="w-4 h-4" />}
                        <span className="text-[8px] font-black uppercase tracking-tighter hidden group-hover:inline">Copy</span>
                     </button>
                     <button onClick={() => startEdit(book)} className="p-3 hover:bg-zera-yellow/10 text-natural-muted hover:text-zera-yellow-dark rounded-2xl transition-all border border-transparent hover:border-zera-yellow/20 shadow-sm hover:shadow-md">
                        <Edit2 className="w-4 h-4" />
                     </button>
                    <button 
                      disabled={saving}
                      onClick={(e) => handleDelete(book.id, e)} 
                      className={cn(
                        "p-3 rounded-2xl transition-all border shadow-sm hover:shadow-md flex items-center gap-2 disabled:opacity-50",
                        confirmDeleteId === book.id 
                          ? "bg-red-600 text-white border-red-600 animate-pulse" 
                          : "hover:bg-red-50 text-natural-muted hover:text-red-500 border-transparent hover:border-red-100"
                      )}
                    >
                       <Trash2 className={cn("w-4 h-4", saving && confirmDeleteId === book.id && "animate-spin")} />
                       {confirmDeleteId === book.id && <span className="text-[8px] font-black uppercase tracking-tighter">{saving ? 'Deleting...' : 'Confirm?'}</span>}
                    </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        
        {loading && (
          <div className="p-32 text-center">
            <Loader2 className="w-12 h-12 text-zera-emerald animate-spin mx-auto mb-4" />
            <p className="text-xs font-black text-natural-muted uppercase tracking-[0.2em]">Synchronizing Zera Archives</p>
          </div>
        )}
        
        {!loading && paginatedBooks.length === 0 && (
          searchTerm.trim() ? (
            // Not in the catalogue — offer to add it on the spot instead of
            // making the librarian find the Add button and retype the term.
            <div className="p-20 sm:p-24 text-center flex flex-col items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-natural-bg border-2 border-dashed border-natural-border flex items-center justify-center">
                <BookIcon className="w-7 h-7 text-natural-muted opacity-40" />
              </div>
              <div className="space-y-1">
                <p className="text-natural-muted font-serif italic text-xl opacity-60">
                  No books match “{searchTerm.trim()}”.
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted/70">
                  {isAdding ? 'Registration form open above.' : 'Not catalogued yet? Register it now.'}
                </p>
              </div>
              {/* Hidden while the form is open — the registration is already
                  under way, and a second live Add button would reset the draft. */}
              {!isAdding && (
                <button
                  type="button"
                  onClick={startAddFromSearch}
                  className="flex items-center gap-2 px-7 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-full text-sm font-bold shadow-md hover:shadow-lg transition-all uppercase tracking-wider"
                >
                  <Plus className="w-4 h-4" />
                  Add “{searchTerm.trim().length > 32 ? `${searchTerm.trim().slice(0, 32)}…` : searchTerm.trim()}”
                </button>
              )}
            </div>
          ) : (
            <div className="p-32 text-center text-natural-muted font-serif italic text-xl opacity-30">
              Inventory records empty for this section.
            </div>
          )
        )}
      </div>
      {notice && (
        <div className="fixed bottom-6 right-6 z-[120] max-w-sm bg-zera-emerald text-white px-5 py-4 rounded-2xl shadow-2xl border border-zera-emerald-dark flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-bold leading-snug">{notice}</p>
          <button onClick={() => setNotice(null)} className="ml-1 shrink-0 opacity-80 hover:opacity-100" title="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {/* Book Detail View Modal */}
      {selectedBookForView && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
          <div 
            className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md"
            onClick={() => setSelectedBookForView(null)}
          />
          <div className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
            <button 
              onClick={() => setSelectedBookForView(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-sm rounded-full text-natural-muted hover:text-red-500 hover:scale-110 transition-all shadow-md"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="md:col-span-4 bg-natural-bg p-8 flex items-center justify-center border-r border-natural-border">
              <div className="w-full max-w-[240px] aspect-[3/4.5] rounded-2xl overflow-hidden shadow-2xl border-4 border-white transform rotate-1">
                <img 
                  src={selectedBookForView.coverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600'} 
                  className="w-full h-full object-cover"
                  alt="Cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600';
                  }}
                />
              </div>
            </div>

            <div className="md:col-span-8 p-10 lg:p-12 space-y-8">
              <div className="space-y-3">
                <div className="flex gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-zera-yellow text-zera-emerald-dark text-[8px] font-black uppercase tracking-[0.2em] rounded-full shadow-sm">
                     System Index: {selectedBookForView.id.slice(0, 8)}
                   </span>
                   <span className={cn(
                     "px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] rounded-full shadow-sm border",
                     selectedBookForView.availableCopies > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                   )}>
                     {selectedBookForView.availableCopies} available / {selectedBookForView.totalCopies} total
                   </span>
                </div>
                <h2 className="text-3xl lg:text-4xl font-serif font-black text-zera-emerald leading-tight">{selectedBookForView.title}</h2>
                {selectedBookForView.author?.trim() && <p className="text-lg font-bold text-natural-muted italic">By {selectedBookForView.author}</p>}
              </div>

              {(activeLoansByBook[selectedBookForView.id]?.length || 0) > 0 && (
                <div className="bg-red-50/60 border border-red-100 rounded-[24px] p-5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-500 mb-3 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Currently borrowed by
                  </p>
                  <div className="space-y-2">
                    {activeLoansByBook[selectedBookForView.id].map(loan => (
                      <div key={loan.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-red-100 px-4 py-2.5">
                        <span className="text-sm font-bold text-natural-text truncate">{loan.userName || 'Unknown member'}</span>
                        {formatDateAdded(loan.dueDate) && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-natural-muted shrink-0">Due {formatDateAdded(loan.dueDate)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 bg-natural-bg p-6 rounded-[24px] border border-natural-border shadow-inner">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald shrink-0">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Accession No.</p>
                    <p className="font-mono text-sm font-bold text-zera-emerald">{clean(selectedBookForView.barcode) || 'NO-ACCESSION-NO'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald shrink-0">
                    <BookIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">ISBN (Standard ID)</p>
                    <p className="font-mono text-sm font-bold text-zera-emerald">{clean(selectedBookForView.isbn) || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <RefreshCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Publication</p>
                    <p className="text-sm font-bold text-zera-emerald">{clean(selectedBookForView.publisher) || '—'} {selectedBookForView.publishedYear && `(${selectedBookForView.publishedYear})`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <Save className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Physical Spec</p>
                    <p className="text-sm font-bold text-zera-emerald">{[selectedBookForView.pageCount ? `${selectedBookForView.pageCount}pp` : '', clean(selectedBookForView.dimensions), clean(selectedBookForView.language)].filter(Boolean).join(' ') || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Lexile Reading Level</p>
                    <p className="text-sm font-bold text-zera-emerald font-mono">{clean(selectedBookForView.lexileLevel) || 'Not measured'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <CalendarPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Date Catalogued</p>
                    <p className="text-sm font-bold text-zera-emerald">{formatDateAdded(selectedBookForView.createdAt) || 'Not recorded'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <BookIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Assigned Teacher</p>
                    <p className="text-sm font-bold text-zera-emerald">{clean(selectedBookForView.assignedTeacher) || 'Not assigned'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                 <div className="flex items-center justify-between mb-1">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-natural-muted">Synopsis</h4>
                   <button
                     onClick={handleRefreshSynopsis}
                     disabled={saving}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-zera-emerald/10 text-zera-emerald rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-zera-emerald/20 transition-all disabled:opacity-50"
                     title="Look up the plot/synopsis and Lexile reading level on the web and save them to this record"
                   >
                     {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                     Fetch Synopsis & Lexile from Web
                   </button>
                 </div>
                 <p className="text-natural-text font-serif leading-relaxed text-base">
                   {isRealSynopsis(selectedBookForView.description)
                     ? selectedBookForView.description
                     : `No synopsis stored yet — use "Fetch Synopsis from Web" above.`}
                 </p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  disabled={saving}
                  onClick={(e) => {
                    handleDelete(selectedBookForView.id, e);
                    // We don't close the modal on first click (confirm state)
                    // But maybe we should handle the confirm state in the detail view specifically?
                    // Actually, the handleDelete already handles confirmDeleteId.
                    // If it was already confirmed, it will execute and we can close.
                    if (confirmDeleteId === selectedBookForView.id) {
                       setSelectedBookForView(null);
                    }
                  }}
                  className={cn(
                    "px-4 h-14 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest border-2 transition-all disabled:opacity-50",
                    confirmDeleteId === selectedBookForView.id
                      ? "bg-red-600 text-white border-red-600 animate-pulse"
                      : "bg-red-50 text-red-600 border-red-100 hover:bg-red-500 hover:text-white"
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDeleteId === selectedBookForView.id ? 'Confirm?' : 'Remove'}
                </button>
                 <button
                  disabled={!!duplicatingId}
                  onClick={(e) => handleDuplicate(selectedBookForView, e)}
                  title="Create another copy of this book with a new accession number (same ISBN)"
                  className="px-4 h-14 bg-zera-emerald/10 text-zera-emerald border-2 border-zera-emerald/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zera-emerald hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {duplicatingId === selectedBookForView.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />} Duplicate Copy
                </button>
                 <button
                  onClick={() => {
                    startEdit(selectedBookForView);
                    setSelectedBookForView(null);
                  }}
                  className="flex-1 h-14 bg-zera-emerald text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-zera-emerald-dark transition-all flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" /> Edit Record
                </button>
                <button 
                  onClick={() => setSelectedBookForView(null)}
                  className="px-8 h-14 bg-natural-bg text-natural-muted rounded-xl border border-natural-border text-xs font-black uppercase tracking-widest hover:bg-natural-border/20 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isBatchImporting && (
        <BatchBookImporter onClose={() => setIsBatchImporting(false)} />
      )}


    </div>
  );
};
