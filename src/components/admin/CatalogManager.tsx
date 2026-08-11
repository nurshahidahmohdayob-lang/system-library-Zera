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
  CalendarPlus
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { BatchBookImporter } from './BatchBookImporter';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, limit, startAfter, getDoc, onSnapshot, where } from 'firebase/firestore';
import { Book } from '@/src/types';
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

export const CatalogManager = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookForView, setSelectedBookForView] = useState<Book | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  // Which book is currently being duplicated (for the per-row spinner), and a
  // brief confirmation banner after a copy is created.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const withWebSynopsis = async (draft: Partial<Book>): Promise<Partial<Book>> => {
    const needsEnrich = !isRealSynopsis(draft.description) || !draft.publisher || !draft.publishedYear || !draft.author;
    const emptyEnrich = { description: '', publisher: '', author: '', publishedYear: undefined as number | undefined };
    const [enrich, lexile, cover] = await Promise.all([
      needsEnrich ? fetchWebEnrichment(draft) : Promise.resolve(emptyEnrich),
      draft.lexileLevel ? Promise.resolve('') : fetchLexileFromWeb(draft),
      isRealCover(draft.coverUrl) ? Promise.resolve('') : fetchCoverFromWeb(draft)
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

  const handleIsbnLookup = async () => {
    if (!newBook.isbn) return;
    setIsSearching(true);
    try {
      const data = await lookupBookByIsbn(newBook.isbn);
      if (data) {
        const merged = await withWebSynopsis({ ...newBook, ...data });
        setNewBook(merged);
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
        const merged = await withWebSynopsis({ ...newBook, ...cleaned });
        setNewBook(merged);
      } else {
        alert("No metadata found for this title. Please enter details manually.");
      }
    } catch (err) {
      alert("Error connecting to metadata service.");
    } finally {
      setIsSearching(false);
    }
  };

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
      const sourceHasAvailable = (book.availableCopies || 0) > 0;

      const { id: _ignoredId, ...rest } = book;
      const copy = sanitizeForFirestore({
        ...rest,
        barcode: newBarcode,
        totalCopies: 1,
        availableCopies: sourceHasAvailable ? 1 : 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      const newRef = await addDoc(collection(db, 'books'), copy);

      // Peel one copy off the source.
      const srcTotal = Math.max(1, (book.totalCopies || 1) - 1);
      const srcAvail = sourceHasAvailable
        ? Math.max(0, Math.min((book.availableCopies || 0) - 1, srcTotal))
        : Math.min(book.availableCopies || 0, srcTotal);
      await updateDoc(doc(db, 'books', book.id), {
        totalCopies: srcTotal,
        availableCopies: srcAvail,
        updatedAt: now,
      });

      // Confirm with a brief banner; the onSnapshot listener refreshes the list.
      setNotice(`Copy created for “${book.title}” — accession ${newBarcode}. ${srcTotal > 1 ? `${srcTotal} copies still share the original record.` : 'Each copy now has its own accession number.'}`);
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

  // When the Add/Edit form opens, scroll it into view and focus the title so
  // the librarian lands directly on the field they want to change.
  useEffect(() => {
    if (!isAdding) return;
    const t = setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      titleInputRef.current?.focus();
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} selected book${selectedIds.size !== 1 ? 's' : ''}? Their copies and loan records will also be removed. This action cannot be undone.`)) {
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
        const loansSnap = await getDocs(query(collection(db, 'loans'), where('bookId', '==', id)));
        for (const loanDoc of loansSnap.docs) {
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
                        placeholder="ISBN-10 or ISBN-13 (optional)"
                        className="w-full pl-9 pr-3 py-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald font-mono" 
                        value={newBook.isbn} onChange={e => setNewBook({...newBook, isbn: e.target.value})}
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleIsbnLookup}
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
                <p className="text-[9px] font-bold text-zera-emerald uppercase tracking-tighter">Metadata sync enabled via ISBN lookup</p>
             </div>
             
             <div className="aspect-[3/4] bg-natural-bg rounded-2xl overflow-hidden relative border-2 border-dashed border-natural-border flex items-center justify-center">
               {newBook.coverUrl ? (
                 <img src={newBook.coverUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=400'; }} />
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
                  <option>Fiction</option>
                  <option>Non-Fiction</option>
                  <option>Reference</option>
                  <option>Scientific</option>
                  <option>History</option>
                  <option>Education</option>
                  <option>Story Book</option>
                  <option>Teacher Resource</option>
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
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search the catalogue by title, author, ISBN, accession no. or category…"
            className="w-full pl-11 pr-28 py-3 bg-natural-bg/50 border border-natural-border rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-zera-emerald transition-all"
          />
          {searchTerm.trim() && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="text-[10px] font-black text-zera-emerald uppercase tracking-widest whitespace-nowrap">
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
                  </div>
                </td>
                <td className="px-8 py-5 text-right" onClick={(e) => e.stopPropagation()}>
                   <div className="flex gap-2 justify-end">
                     {(book.totalCopies || 0) > 1 && (
                       <button
                         disabled={!!duplicatingId}
                         onClick={(e) => handleDuplicate(book, e)}
                         title="Duplicate a copy — creates a separate record with the same ISBN but a new accession number"
                         className="p-3 hover:bg-zera-emerald/10 text-natural-muted hover:text-zera-emerald rounded-2xl transition-all border border-transparent hover:border-zera-emerald/20 shadow-sm hover:shadow-md disabled:opacity-50 flex items-center gap-2"
                       >
                          {duplicatingId === book.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Copy className="w-4 h-4" />}
                          <span className="text-[8px] font-black uppercase tracking-tighter hidden group-hover:inline">Copy</span>
                       </button>
                     )}
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
          <div className="p-32 text-center text-natural-muted font-serif italic text-xl opacity-30">
            {searchTerm.trim()
              ? `No books match “${searchTerm.trim()}”.`
              : 'Inventory records empty for this section.'}
          </div>
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
