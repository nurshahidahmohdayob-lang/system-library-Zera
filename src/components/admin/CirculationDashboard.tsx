import React, { useState, useEffect, useRef } from 'react';
import { 
  ScanLine, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft,
  AlertCircle,
  User,
  Book,
  X,
  CheckCircle2,
  Loader2,
  Eraser,
  Upload
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, query, limit, addDoc, doc, updateDoc, where, getDocs, getDoc, orderBy, DocumentSnapshot } from 'firebase/firestore';
import { Book as BookType, UserProfile, Loan } from '@/src/types';
import { format, addDays, addMonths } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { BatchCirculationImporter } from './BatchCirculationImporter';
// Loan limits/durations are shared with the Member Portal's policy section so the
// rule the desk enforces and the rule members are shown can never drift apart.
import { STUDENT_LOAN_LIMIT, STUDENT_LOAN_DAYS, STAFF_LOAN_MONTHS } from '@/src/lib/borrowingPolicy';
// Same duplicate-collapsing rule the Members list uses, so a member visible
// there is never missing from the lending terminal (or the reverse).
import { collapsibleDuplicateIds } from '@/src/lib/memberVisibility';

// Loan dates may be ISO strings (new records), Firestore Timestamps, or {seconds}
// shapes (older/imported records). Parse defensively so a stray value can't crash
// the list render — return '' when it can't be understood.
const safeDate = (v: any, fmt: string): string => {
  if (!v) return '';
  const d = (typeof v === 'string' || typeof v === 'number')
    ? new Date(v)
    : (typeof v?.toDate === 'function' ? v.toDate() : (typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : null));
  return d && !isNaN(d.getTime()) ? format(d, fmt) : '';
};

export const CirculationDashboard = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [barcode, setBarcode] = useState('');
  const [bookResults, setBookResults] = useState<BookType[]>([]);
  // An ISBN identifies a *title*, not a physical book: "Duplicate" creates a
  // separate catalogue record per copy, each with its own accession number but
  // the same ISBN. So when a scan matches more than one record the librarian
  // picks which copy is actually going out, instead of the system silently
  // issuing whichever one Firestore happened to return first — which is how a
  // teacher could walk off with Zera41 while the loan was recorded against Zera40.
  const [copyChoices, setCopyChoices] = useState<BookType[]>([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  // The books currently on loan to the selected member, read LIVE from
  // Firestore. Unlike an in-memory session list, this is never lost on reload
  // or when switching members — it always reflects the real borrowing records
  // stored under the member's name. It grows the instant a book is issued and
  // shrinks when one is returned.
  const [memberLoans, setMemberLoans] = useState<Loan[]>([]);
  const [memberLoansLoading, setMemberLoansLoading] = useState(false);
  // Remembers the last scan we auto-issued, so an exact match + Enter key can't
  // both fire a checkout for the same scan.
  const lastScanRef = useRef('');

  // --- Returns station -----------------------------------------------------
  // Returning a book doesn't need a member to be selected: the librarian just
  // scans the book, and we find whoever has it out and check it back in.
  const [returnBarcode, setReturnBarcode] = useState('');
  const [returnStatus, setReturnStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [sessionReturns, setSessionReturns] = useState<{ bookTitle: string; userName: string; barcode: string; at: string }[]>([]);
  const lastReturnScanRef = useRef('');

  useEffect(() => {
    // Load ALL members so the search can find anyone. A previous limit(100)
    // meant members beyond the first 100 (e.g. teachers loaded later) never
    // appeared in the lending terminal even though they exist.
    const fetchUsers = async () => {
      const [userSnap, loanSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'loans')),
      ]);
      const all = userSnap.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      // A stub holding loans stays: the loans point at it, so hiding it would
      // put that member's books out of reach at the desk.
      const withLoans = new Set(loanSnap.docs.map(d => (d.data() as { userId?: string }).userId || ''));
      const hidden = collapsibleDuplicateIds(all, withLoans);
      setUsers(all.filter(u => !hidden.has(u.uid)));
    };
    fetchUsers();
  }, []);

  /**
   * Every catalogue record carrying this ISBN.
   *
   * Queried directly rather than filtered out of the suggestion batch above:
   * that batch is capped at 50 records and restricted to status 'available', so
   * a copy further down the catalogue — or one whose record status differs —
   * would be missing from the chooser, and the librarian would be picking from
   * an incomplete list without knowing it.
   *
   * ISBNs are stored however the metadata source supplied them, so the exact
   * match is tried first and a digits-only comparison catches hyphenated forms.
   */
  const findCopiesByIsbn = async (isbnDigits: string): Promise<BookType[]> => {
    const byId = new Map<string, BookType>();
    try {
      const exact = await getDocs(query(collection(db, 'books'), where('isbn', '==', isbnDigits)));
      exact.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() } as BookType));

      // Only sweep the whole collection when the indexed query found nothing,
      // which means the stored ISBN is punctuated differently from the scan.
      // Doing it whenever the query returned a single hit would put a
      // full-catalogue read behind every ordinary one-copy scan.
      if (byId.size === 0) {
        const all = await getDocs(collection(db, 'books'));
        all.docs.forEach(d => {
          const data = d.data() as BookType;
          if ((data.isbn || '').replace(/[^0-9Xx]/gi, '') === isbnDigits) {
            byId.set(d.id, { id: d.id, ...data } as BookType);
          }
        });
      }
    } catch (err) {
      console.error('Copy lookup by ISBN failed:', err);
    }
    // Show them in accession order so the list reads the way the shelf does.
    return [...byId.values()].sort((a, b) =>
      (a.barcode || '').localeCompare(b.barcode || '', undefined, { numeric: true })
    );
  };

  useEffect(() => {
    const searchBooks = async () => {
      if (barcode.length < 2 || barcode.includes('ZERA-')) {
        setBookResults([]);
        setCopyChoices([]);
        lastScanRef.current = ''; // field cleared → allow the same code to be scanned again
        return;
      }

      setIsSearchingBooks(true);
      try {
        // We fetch a small batch to filter client side for better partial matching
        // Or if the catalog is massive, we use prefix search
        const q = query(
          collection(db, 'books'),
          where('status', '==', 'available'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const allBooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BookType));

        const scan = barcode.trim();
        const scanDigits = scan.replace(/[^0-9Xx]/gi, '');
        const isIsbnScan = scanDigits.length === 10 || scanDigits.length === 13;

        // An accession number is unique to one physical book, so it stays
        // unambiguous. An ISBN is not — every copy shares it.
        const byAccession = allBooks.filter(b => b.barcode && b.barcode.toLowerCase() === scan.toLowerCase());
        const byIsbn = isIsbnScan ? await findCopiesByIsbn(scanDigits) : [];
        const exactMatches = byAccession.length > 0 ? byAccession : byIsbn;

        if (exactMatches.length > 0 && selectedUser && lastScanRef.current !== scan) {
          // Exactly one record — nothing to disambiguate, so keep the instant
          // issue that makes the desk workflow fast.
          if (exactMatches.length === 1) {
            lastScanRef.current = scan;
            setBookResults([]);
            setCopyChoices([]);
            handleTransaction('checkout');
            return;
          }
          // Several copies share this code — stop and let the librarian say
          // which one is in their hand. Deliberately does NOT set lastScanRef,
          // so re-scanning still works if they clear and start over.
          setBookResults([]);
          setCopyChoices(exactMatches);
          return;
        }

        // If the input IS an accession number (e.g. "Zera40", "Zerastudent12"),
        // match ONLY that exact barcode — never a partial title/ISBN and never a
        // longer barcode like "Zera400". Otherwise fall back to a general search.
        const isAccession = /^zera(student|staff)?\d+$/i.test(scan);
        const filtered = (isAccession
          ? allBooks.filter(b => b.barcode && b.barcode.toLowerCase() === scan.toLowerCase())
          : allBooks.filter(b =>
              b.title.toLowerCase().includes(barcode.toLowerCase()) ||
              (b.isbn && b.isbn.replace(/[^0-9Xx]/gi, '') === scanDigits && scanDigits.length >= 10) ||
              (b.barcode && b.barcode.toLowerCase() === scan.toLowerCase())
            )
        ).slice(0, 5);

        setBookResults(filtered);
        setCopyChoices([]);
      } catch (err) {
        console.error("Book search error:", err);
      } finally {
        setIsSearchingBooks(false);
      }
    };

    const timer = setTimeout(searchBooks, 300);
    return () => clearTimeout(timer);
  }, [barcode, selectedUser]);

  // Load the selected member's currently-borrowed (active) loans straight from
  // Firestore. Re-run whenever the member changes so the panel always shows the
  // true, persisted list of what's out under their name.
  const loadMemberLoans = async (user: UserProfile | null) => {
    if (!user) { setMemberLoans([]); return; }
    setMemberLoansLoading(true);
    try {
      let docs;
      try {
        const snap = await getDocs(query(
          collection(db, 'loans'),
          where('userId', '==', user.uid),
          where('status', '==', 'active'),
          orderBy('checkoutDate', 'desc'),
        ));
        docs = snap.docs;
      } catch {
        // Fallback if the composite index isn't ready — sort in memory instead.
        const snap = await getDocs(query(
          collection(db, 'loans'),
          where('userId', '==', user.uid),
          where('status', '==', 'active'),
        ));
        docs = snap.docs;
      }
      const loans = docs
        .map(d => ({ id: d.id, ...d.data() } as Loan))
        .sort((a, b) => (b.checkoutDate || '').localeCompare(a.checkoutDate || ''));
      setMemberLoans(loans);
    } catch (err) {
      console.error('Error loading member loans:', err);
    } finally {
      setMemberLoansLoading(false);
    }
  };

  useEffect(() => {
    loadMemberLoans(selectedUser);
  }, [selectedUser]);

  const handleUserSearch = (val: string) => {
    setSearchTerm(val);
    if (val.length === 0) setSelectedUser(null);
  };

  const selectUser = (user: UserProfile) => {
    setSelectedUser(user);
    setSearchTerm(user.name);
  };

  const selectBook = (book: BookType) => {
    setBarcode(book.barcode || book.isbn);
    setBookResults([]);
  };

  // Issue one specific copy the librarian picked out of the chooser. Goes by
  // document id, not by re-resolving the barcode text — resolving a shared ISBN
  // back to a record is exactly the ambiguity the chooser exists to settle.
  const issueChosenCopy = (book: BookType) => {
    setCopyChoices([]);
    setBookResults([]);
    setBarcode(book.barcode || book.isbn || '');
    lastScanRef.current = (book.barcode || book.isbn || '').trim();
    handleTransaction('checkout', book.id);
  };

  const handleTransaction = async (type: 'checkout', forcedBookId?: string) => {
    if (!selectedUser || !barcode) {
      setStatus({ type: 'error', message: 'Please select a member and enter a book barcode.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    // Policy: students may hold at most STUDENT_LOAN_LIMIT books at once. Teachers
    // and other staff are unlimited. Count active loans authoritatively (live
    // query) so the cap holds even before the panel finished loading or across
    // rapid scans; fall back to the in-memory list only if the query fails.
    if (selectedUser.role === 'student') {
      let activeCount = memberLoans.length;
      try {
        const snap = await getDocs(query(
          collection(db, 'loans'),
          where('userId', '==', selectedUser.uid),
          where('status', '==', 'active'),
        ));
        activeCount = snap.size;
      } catch (err) {
        console.error('Loan-count check failed, using in-memory count:', err);
      }
      if (activeCount >= STUDENT_LOAN_LIMIT) {
        setStatus({
          type: 'error',
          message: `Borrowing limit reached — students may borrow up to ${STUDENT_LOAN_LIMIT} books at a time. ${selectedUser.name.split(' ')[0]} already has ${activeCount} out; please return one first.`,
        });
        setLoading(false);
        return;
      }
    }

    try {
      const raw = barcode.trim();
      // Barcodes are stored in canonical case ("Zera40"), but a librarian may type
      // "zera40". Firestore '==' is case-sensitive, so normalise an accession
      // number's case before the exact lookup.
      const normalized = /^zera(student|staff)?\d+$/i.test(raw)
        ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
        : raw;

      // The Issue button and the Enter key reach this without going through the
      // scan effect, so the same "don't guess between copies" rule is enforced
      // here too — otherwise either one would quietly issue an arbitrary copy.
      if (!forcedBookId) {
        const rawDigits = raw.replace(/[^0-9Xx]/gi, '');
        if (rawDigits.length === 10 || rawDigits.length === 13) {
          const copies = await findCopiesByIsbn(rawDigits);
          if (copies.length > 1) {
            setCopyChoices(copies);
            setStatus({
              type: 'error',
              message: `${copies.length} copies share this ISBN — choose which one you are handing over.`
            });
            setLoading(false);
            return;
          }
        }
      }

      let bookDoc: DocumentSnapshot | null = null;

      if (forcedBookId) {
        // The librarian already chose this exact copy from the chooser — take it
        // as given rather than resolving the text in the box, which for a shared
        // ISBN would land back on an arbitrary copy.
        const chosen = await getDoc(doc(db, 'books', forcedBookId));
        if (chosen.exists()) bookDoc = chosen;
      } else {
        // Search by barcode first, then isbn, then title.
        let snap = await getDocs(query(collection(db, 'books'), where('barcode', '==', normalized)));
        if (!snap.empty) bookDoc = snap.docs[0];

        if (!bookDoc) {
          snap = await getDocs(query(collection(db, 'books'), where('isbn', '==', raw)));
          if (!snap.empty) bookDoc = snap.docs[0];
        }

        if (!bookDoc) {
          snap = await getDocs(query(collection(db, 'books'), where('title', '==', raw)));
          if (!snap.empty) bookDoc = snap.docs[0];
        }

        // Last resort: case-insensitive barcode scan (covers any unusual stored casing).
        if (!bookDoc) {
          const all = await getDocs(collection(db, 'books'));
          bookDoc = all.docs.find(d => (d.data().barcode || '').toLowerCase() === raw.toLowerCase()) || null;
        }
      }

      if (!bookDoc) {
        setStatus({ type: 'error', message: 'Book not found in catalog (checked Barcode, ISBN & Title).' });
        setLoading(false);
        return;
      }

      let bookData = bookDoc.data() as BookType;

      // The matched copy is fully out — but the library may hold OTHER copies of
      // the same title (either as extra copies on this record, or as separate
      // accession-numbered records sharing the same ISBN/title). Find one that's
      // actually available and lend that instead, so a second borrower isn't
      // wrongly told "no copies" while a copy sits on the shelf.
      // Skipped when the copy was chosen explicitly: quietly swapping in a
      // different copy would undo the choice the librarian just made, and the
      // loan would again name a book that isn't the one on the desk.
      if (!forcedBookId && (bookData.availableCopies || 0) <= 0) {
        const siblingDocs: DocumentSnapshot[] = [];
        try {
          if (bookData.isbn && bookData.isbn.trim()) {
            const s = await getDocs(query(collection(db, 'books'), where('isbn', '==', bookData.isbn)));
            siblingDocs.push(...s.docs);
          } else if (bookData.title) {
            const s = await getDocs(query(collection(db, 'books'), where('title', '==', bookData.title)));
            siblingDocs.push(...s.docs);
          }
        } catch (err) {
          console.error('Sibling-copy lookup failed:', err);
        }
        const availableCopy = siblingDocs.find(d => ((d.data().availableCopies as number) || 0) > 0);
        if (availableCopy) {
          bookDoc = availableCopy;
          bookData = availableCopy.data() as BookType;
        }
      }

      if ((bookData.availableCopies || 0) <= 0) {
        setStatus({ type: 'error', message: `All copies of “${bookData.title}” are currently out — none available to issue right now.` });
        setLoading(false);
        return;
      }

      const checkoutDate = new Date().toISOString();
      // Students: due in 2 weeks. Teachers/staff: due at end of term (~4 months).
      const dueDate = (selectedUser.role === 'student'
        ? addDays(new Date(), STUDENT_LOAN_DAYS)
        : addMonths(new Date(), STAFF_LOAN_MONTHS)
      ).toISOString();
      const loanRef = await addDoc(collection(db, 'loans'), {
        userId: selectedUser.uid,
        userName: selectedUser.name,
        bookId: bookDoc.id,
        bookTitle: bookData.title,
        checkoutDate,
        dueDate,
        status: 'active'
      });

      await updateDoc(doc(db, 'books', bookDoc.id), {
        availableCopies: bookData.availableCopies - 1
      });

      // Add the freshly-created loan to the live list immediately. It's already
      // persisted in Firestore, so it will still be here on reload / re-select.
      const newLoan: Loan = {
        id: loanRef.id,
        userId: selectedUser.uid,
        userName: selectedUser.name,
        copyId: '',
        bookId: bookDoc.id,
        bookTitle: bookData.title,
        checkoutDate,
        dueDate,
        returnDate: null,
        status: 'active',
      };
      setMemberLoans(prev => [newLoan, ...prev]);
      setStatus({ type: 'success', message: `${bookData.title} was successfully issued to ${selectedUser.name}.` });

      setBarcode('');
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Transaction failed. Please check connection.' });
    }
    setLoading(false);
  };

  // Return a book to the system by scanning its barcode / ISBN / title. No
  // member needs to be selected — we look up the active loan for the book,
  // mark it returned and put the copy back on the shelf (availableCopies + 1).
  const handleReturn = async (rawCode?: string) => {
    const code = (rawCode ?? returnBarcode).trim();
    if (!code) {
      setReturnStatus({ type: 'error', message: 'Scan or type a book barcode, ISBN or title to return.' });
      return;
    }

    setReturnLoading(true);
    setReturnStatus(null);

    try {
      // Normalise accession-number case ("zera40" -> "Zera40") — Firestore '==' is case-sensitive.
      const normalized = /^zera(student|staff)?\d+$/i.test(code)
        ? code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
        : code;

      // Find the book: barcode first, then ISBN, then exact title.
      let bookDoc: DocumentSnapshot | null = null;
      let bookSnap = await getDocs(query(collection(db, 'books'), where('barcode', '==', normalized)));
      if (!bookSnap.empty) bookDoc = bookSnap.docs[0];
      if (!bookDoc) { bookSnap = await getDocs(query(collection(db, 'books'), where('isbn', '==', code))); if (!bookSnap.empty) bookDoc = bookSnap.docs[0]; }
      if (!bookDoc) { bookSnap = await getDocs(query(collection(db, 'books'), where('title', '==', code))); if (!bookSnap.empty) bookDoc = bookSnap.docs[0]; }
      if (!bookDoc) {
        const all = await getDocs(collection(db, 'books'));
        bookDoc = all.docs.find(d => (d.data().barcode || '').toLowerCase() === code.toLowerCase()) || null;
      }

      if (!bookDoc) {
        setReturnStatus({ type: 'error', message: `No catalogue match for “${code}” (checked Barcode, ISBN & Title).` });
        setReturnLoading(false);
        return;
      }

      const bookData = bookDoc.data() as BookType;

      // Find the active loan(s) for this book. If a member happens to be
      // selected we prefer their copy; otherwise we return the oldest one out.
      const loanSnap = await getDocs(query(
        collection(db, 'loans'),
        where('bookId', '==', bookDoc.id),
        where('status', '==', 'active'),
      ));

      if (loanSnap.empty) {
        setReturnStatus({ type: 'error', message: `“${bookData.title}” has no active loan on record — nothing to return.` });
        setReturnLoading(false);
        return;
      }

      const loans = loanSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Loan))
        .sort((a, b) => (a.checkoutDate || '').localeCompare(b.checkoutDate || ''));
      const loan = loans.find(l => selectedUser && l.userId === selectedUser.uid) || loans[0];

      await updateDoc(doc(db, 'loans', loan.id), {
        status: 'returned',
        returnDate: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'books', bookDoc.id), {
        availableCopies: (bookData.availableCopies || 0) + 1,
      });

      // If the returned book was out to the member currently on screen, drop it
      // from their live borrowed list so the panel stays accurate.
      if (selectedUser && loan.userId === selectedUser.uid) {
        setMemberLoans(prev => prev.filter(l => l.id !== loan.id));
      }

      setSessionReturns(prev => [
        {
          bookTitle: bookData.title,
          userName: loan.userName || 'Unknown member',
          barcode: bookData.barcode || bookData.isbn || code,
          at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setReturnStatus({
        type: 'success',
        message: `“${bookData.title}” returned${loan.userName ? ` from ${loan.userName}` : ''} — back in the system.`,
      });
      setReturnBarcode('');
      lastReturnScanRef.current = '';
    } catch (error) {
      console.error(error);
      setReturnStatus({ type: 'error', message: 'Return failed. Please check connection.' });
    }
    setReturnLoading(false);
  };

  const filteredUsers = searchTerm.length > 0 && !selectedUser
    ? users.filter(u => {
        const q = searchTerm.toLowerCase();
        // Match on name, email, ID or barcode; guard members with missing fields
        // so one bad record can't break the whole search.
        return [u.name, u.email, u.studentId, u.barcode]
          .some(field => (field || '').toLowerCase().includes(q));
      }).slice(0, 50)
    : [];

  // Names appearing more than once in the current results — those rows get an
  // extra identifying line so they can be told apart.
  const nameCounts = filteredUsers.reduce<Record<string, number>>((acc, u) => {
    const key = String(u.name || '').toLowerCase().trim();
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const duplicateNames = new Set(
    Object.keys(nameCounts).filter(name => nameCounts[name] > 1)
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-3xl font-bold text-natural-text">Circulation Desk</h2>
          <p className="text-sm text-natural-muted font-medium italic">Zera Education Institutional Lending Management</p>
        </div>
        <button
          type="button"
          onClick={() => setIsBatchImporting(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-zera-yellow text-zera-emerald-dark hover:brightness-95 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider"
          title="Upload an Excel/CSV list of teachers who borrowed books and record all the loans at once."
        >
          <Upload className="w-4 h-4" />
          Batch Import Loans
        </button>
      </div>

      {isBatchImporting && <BatchCirculationImporter onClose={() => setIsBatchImporting(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm flex flex-col gap-8 h-fit">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-zera-emerald rounded-2xl flex items-center justify-center text-white shadow-lg">
              <ScanLine className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-serif text-2xl font-bold text-natural-text">Lending Terminal</h3>
              <p className="text-[10px] text-natural-muted font-black uppercase tracking-[0.2em] mt-1">Ready for transaction</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2 relative">
               <label className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted px-2">Member Search (Name/ID)</label>
               <div className="relative group">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
                 <input 
                  className={cn(
                    "w-full bg-natural-bg border border-natural-border rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-zera-emerald outline-none text-natural-text font-bold shadow-inner transition-all",
                    selectedUser && "border-zera-emerald bg-zera-emerald/5"
                  )}
                  placeholder="Type student or teacher name..."
                  value={searchTerm}
                  onChange={e => handleUserSearch(e.target.value)}
                />
                {selectedUser && (
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setSearchTerm('');
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-neutral-border rounded-full transition-colors z-10"
                    title="Clear Selection"
                  >
                    <X className="w-4 h-4 text-natural-muted" />
                  </button>
                )}
               </div>

               {filteredUsers.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-natural-border rounded-2xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-natural-bg">
                    {filteredUsers.map((user, idx) => (
                      <button 
                        key={`${user.uid || ''}-${idx}`}
                        onClick={() => selectUser(user)}
                        className="w-full p-4 flex items-center gap-3 hover:bg-zera-emerald/5 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-natural-bg flex items-center justify-center border border-natural-border">
                           <User className="w-4 h-4 text-natural-muted" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-natural-text truncate">{user.name}</p>
                          <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                            {user.role}
                            {user.grade ? ` • Grade ${user.grade}` : ''}
                            {user.email ? ` • ${user.email}` : ''}
                          </p>
                          {/* Two members can share a name AND an email (duplicate
                              records from repeated sign-ins or staff syncs). Without
                              something unique on screen the rows are indistinguishable
                              and the librarian cannot tell which one they are issuing
                              to — so show the record's own id when the name repeats. */}
                          {duplicateNames.has(String(user.name || '').toLowerCase().trim()) && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 truncate">
                              Duplicate name • id {String(user.uid || '').slice(0, 8) || 'n/a'}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                 </div>
               )}
            </div>

            {selectedUser && (
              <div className="bg-natural-bg p-5 rounded-3xl border border-natural-border animate-in zoom-in-95 fade-in duration-300">
                <div className="flex justify-between items-start">
                   <div className="flex gap-4 items-center">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-natural-border flex items-center justify-center">
                        <User className="w-6 h-6 text-zera-emerald" />
                      </div>
                      <div>
                        <p className="text-lg font-black text-natural-text leading-tight">{selectedUser.name}</p>
                        <p className="text-[10px] font-black text-zera-emerald uppercase tracking-widest mt-0.5">{selectedUser.uid.slice(0, 8)}</p>
                      </div>
                   </div>
                   <div className="text-right">
                     <p className="text-2xl font-black text-zera-emerald">{memberLoansLoading ? '…' : memberLoans.length}</p>
                     <p className="text-[9px] font-black text-natural-muted uppercase tracking-widest">Books Out</p>
                   </div>
                </div>
                {/* Borrowing policy for this member's role. */}
                <div className="mt-4 pt-3 border-t border-natural-border/60">
                  {selectedUser.role === 'student' ? (
                    <div className={cn(
                      "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest",
                      memberLoans.length >= STUDENT_LOAN_LIMIT ? "text-red-500" : "text-natural-muted"
                    )}>
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Student · up to {STUDENT_LOAN_LIMIT} books · due in {STUDENT_LOAN_DAYS} days ·{' '}
                        {memberLoans.length >= STUDENT_LOAN_LIMIT
                          ? 'limit reached'
                          : `${STUDENT_LOAN_LIMIT - memberLoans.length} left`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-natural-muted">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span>{selectedUser.role === 'teacher' ? 'Teacher' : 'Staff'} · unlimited · due end of term (~{STAFF_LOAN_MONTHS} months)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 relative">
               <label className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted px-2">Book Barcode / ISBN / Title</label>
               <div className="relative group">
                 <Book className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
                 <input
                  className="w-full bg-natural-bg border border-natural-border rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-zera-emerald outline-none text-natural-text font-mono shadow-inner transition-all disabled:opacity-30"
                  placeholder="Scan barcode to issue instantly, or type a title…"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  onKeyDown={e => {
                    // Scanners send Enter after the code → issue immediately.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const scan = barcode.trim();
                      if (selectedUser && scan && lastScanRef.current !== scan) {
                        lastScanRef.current = scan;
                        handleTransaction('checkout');
                      }
                    }
                  }}
                  disabled={!selectedUser}
                />
                {isSearchingBooks && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-zera-emerald" />
                  </div>
                )}
               </div>

               {/* Several catalogue records share the scanned code — the
                   librarian says which physical copy is going out. */}
               {copyChoices.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-zera-emerald/40 rounded-2xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2">
                   <div className="px-4 py-3 bg-zera-emerald/10 border-b border-zera-emerald/20 flex items-center justify-between gap-3">
                     <div className="min-w-0">
                       <p className="text-[10px] font-black uppercase tracking-widest text-zera-emerald">
                         {copyChoices.length} copies share this code
                       </p>
                       <p className="text-[10px] font-bold text-natural-muted truncate">
                         Choose the copy you are issuing to {selectedUser?.name || 'this member'}.
                       </p>
                     </div>
                     <button
                       type="button"
                       onClick={() => { setCopyChoices([]); setBarcode(''); }}
                       title="Cancel"
                       className="shrink-0 text-natural-muted hover:text-rose-500 transition-colors"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                   <div className="divide-y divide-natural-bg max-h-72 overflow-y-auto">
                     {copyChoices.map(copy => {
                       const available = (copy.availableCopies || 0) > 0;
                       return (
                         <button
                           key={copy.id}
                           type="button"
                           disabled={!available}
                           onClick={() => issueChosenCopy(copy)}
                           className={cn(
                             "w-full p-3 flex items-center gap-3 text-left transition-colors",
                             available ? "hover:bg-zera-emerald/5" : "opacity-50 cursor-not-allowed"
                           )}
                         >
                           <div className="w-10 h-10 rounded-lg bg-natural-bg overflow-hidden shrink-0 border border-natural-border flex items-center justify-center">
                             {copy.coverUrl ? (
                               <img src={copy.coverUrl} alt={copy.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                             ) : (
                               <Book className="w-4 h-4 text-natural-muted opacity-40" />
                             )}
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold text-natural-text truncate">{copy.title}</p>
                             {/* The accession number is the only thing that tells
                                 these records apart — it is what is printed on
                                 the physical book's spine label. */}
                             <p className="text-[10px] font-black uppercase tracking-widest text-zera-emerald truncate">
                               {copy.barcode || 'No accession no.'}
                             </p>
                           </div>
                           <div className={cn(
                             "shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border whitespace-nowrap",
                             available
                               ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                               : "bg-rose-50 text-rose-600 border-rose-200"
                           )}>
                             {available ? `${copy.availableCopies} of ${copy.totalCopies || 1} in` : 'All out'}
                           </div>
                         </button>
                       );
                     })}
                   </div>
                 </div>
               )}

               {bookResults.length > 0 && copyChoices.length === 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-natural-border rounded-2xl shadow-xl z-20 overflow-hidden divide-y divide-natural-bg animate-in fade-in slide-in-from-top-2">
                   {bookResults.map(book => (
                     <button 
                       key={book.id}
                       onClick={() => selectBook(book)}
                       className="w-full p-3 flex items-center gap-3 hover:bg-zera-emerald/5 transition-colors text-left"
                     >
                       <div className="w-10 h-10 rounded-lg bg-natural-bg overflow-hidden flex-shrink-0 border border-natural-border flex items-center justify-center">
                         {book.coverUrl ? (
                           <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                         ) : (
                           <Book className="w-4 h-4 text-natural-muted opacity-40" />
                         )}
                       </div>
                       <div className="flex-1 min-w-0">
                         <p className="text-sm font-bold text-natural-text truncate">{book.title}</p>
                         <p className="text-[9px] font-black uppercase text-zera-emerald tracking-widest truncate">{book.barcode || book.isbn}</p>
                       </div>
                     </button>
                   ))}
                 </div>
               )}
            </div>

            {status && (
              <div className={cn(
                "p-5 rounded-3xl text-sm font-bold flex gap-4 animate-in slide-in-from-top-2",
                status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
              )}>
                {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                {status.message}
              </div>
            )}

            <div className="flex gap-4 pt-4">
               <button
                  onClick={() => handleTransaction('checkout')}
                  disabled={loading || !selectedUser || !barcode}
                  className="flex-1 flex items-center justify-center gap-3 bg-zera-emerald text-white rounded-full py-5 font-black uppercase text-xs tracking-[0.2em] hover:bg-zera-emerald-dark shadow-lg disabled:opacity-30 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUpRight className="w-5 h-5" /> Issue Item</>}
               </button>
            </div>

            {selectedUser && (
              <div className="bg-natural-bg border border-natural-border rounded-3xl p-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-zera-emerald text-white flex items-center justify-center text-xs font-black">
                      {memberLoansLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : memberLoans.length}
                    </span>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted">
                      Books out to {selectedUser.name.split(' ')[0]}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMemberLoans(selectedUser)}
                    className="text-[9px] font-black uppercase tracking-widest text-natural-muted hover:text-zera-emerald transition-colors flex items-center gap-1"
                    title="Refresh this list from the database"
                  >
                    <Loader2 className={cn('w-3 h-3', memberLoansLoading && 'animate-spin')} /> Refresh
                  </button>
                </div>
                {memberLoans.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {memberLoans.map((loan, idx) => (
                      <div
                        key={loan.id}
                        className="flex items-center gap-3 bg-white border border-natural-border rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-1"
                      >
                        <CheckCircle2 className="w-4 h-4 text-zera-emerald shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-natural-text truncate">{loan.bookTitle}</p>
                          <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                            {safeDate(loan.checkoutDate, 'd MMM yyyy') ? `Borrowed ${safeDate(loan.checkoutDate, 'd MMM yyyy')}` : 'Borrowed'}
                            {safeDate(loan.dueDate, 'd MMM') ? ` • Due ${safeDate(loan.dueDate, 'd MMM')}` : ''}
                          </p>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">#{memberLoans.length - idx}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  !memberLoansLoading && (
                    <p className="text-xs font-bold text-natural-muted italic px-1 py-2">
                      No books currently out to {selectedUser.name.split(' ')[0]}.
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8">
           <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm flex flex-col gap-8 h-fit">
             <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-zera-yellow rounded-2xl flex items-center justify-center text-zera-emerald-dark shadow-lg">
                 <ArrowDownLeft className="w-7 h-7" />
               </div>
               <div>
                 <h3 className="font-serif text-2xl font-bold text-natural-text">Returns Station</h3>
                 <p className="text-[10px] text-natural-muted font-black uppercase tracking-[0.2em] mt-1">Scan to check a book back in</p>
               </div>
             </div>

             <div className="space-y-6">
               <div className="space-y-2 relative">
                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted px-2">Book Barcode / ISBN / Title</label>
                 <div className="relative group">
                   <Book className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
                   <input
                     className="w-full bg-natural-bg border border-natural-border rounded-2xl p-4 pl-12 focus:ring-2 focus:ring-zera-emerald outline-none text-natural-text font-mono shadow-inner transition-all"
                     placeholder="Scan a returned book to check it in…"
                     value={returnBarcode}
                     onChange={e => setReturnBarcode(e.target.value)}
                     onKeyDown={e => {
                       // Scanners send Enter after the code → return immediately.
                       if (e.key === 'Enter') {
                         e.preventDefault();
                         const scan = returnBarcode.trim();
                         if (scan && lastReturnScanRef.current !== scan) {
                           lastReturnScanRef.current = scan;
                           handleReturn(scan);
                         }
                       }
                     }}
                   />
                   {returnLoading && (
                     <div className="absolute right-4 top-1/2 -translate-y-1/2">
                       <Loader2 className="w-4 h-4 animate-spin text-zera-emerald" />
                     </div>
                   )}
                 </div>
                 <p className="text-[10px] text-natural-muted font-medium px-2 pt-1">No need to pick a member — the system finds who has the book out.</p>
               </div>

               {returnStatus && (
                 <div className={cn(
                   "p-5 rounded-3xl text-sm font-bold flex gap-4 animate-in slide-in-from-top-2",
                   returnStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
                 )}>
                   {returnStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                   {returnStatus.message}
                 </div>
               )}

               <button
                 onClick={() => handleReturn()}
                 disabled={returnLoading || !returnBarcode}
                 className="w-full flex items-center justify-center gap-3 bg-zera-emerald text-white rounded-full py-5 font-black uppercase text-xs tracking-[0.2em] hover:bg-zera-emerald-dark shadow-lg disabled:opacity-30 transition-all"
               >
                 {returnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowDownLeft className="w-5 h-5" /> Return Item</>}
               </button>

               {sessionReturns.length > 0 && (
                 <div className="bg-natural-bg border border-natural-border rounded-3xl p-6 animate-in fade-in slide-in-from-top-2">
                   <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-2">
                       <span className="w-7 h-7 rounded-full bg-zera-emerald text-white flex items-center justify-center text-xs font-black">
                         {sessionReturns.length}
                       </span>
                       <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted">Returned this session</h4>
                     </div>
                     <button
                       type="button"
                       onClick={() => setSessionReturns([])}
                       className="text-[9px] font-black uppercase tracking-widest text-natural-muted hover:text-red-500 transition-colors flex items-center gap-1"
                       title="Clear this session list"
                     >
                       <Eraser className="w-3 h-3" /> Clear
                     </button>
                   </div>
                   <div className="space-y-2 max-h-64 overflow-y-auto">
                     {sessionReturns.map((item, idx) => (
                       <div
                         key={`${item.barcode}-${item.at}-${idx}`}
                         className="flex items-center gap-3 bg-white border border-natural-border rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-1"
                       >
                         <ArrowDownLeft className="w-4 h-4 text-zera-emerald shrink-0" />
                         <div className="flex-1 min-w-0">
                           <p className="text-sm font-bold text-natural-text truncate">{item.bookTitle}</p>
                           <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                             {item.userName} • {format(new Date(item.at), 'h:mm a')}
                           </p>
                         </div>
                         <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">#{sessionReturns.length - idx}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </div>
           </div>

           <div className="bg-zera-yellow/10 border border-zera-yellow/30 rounded-[40px] p-8">
              <h4 className="flex items-center gap-2 font-black text-zera-yellow-dark uppercase text-xs tracking-widest mb-6">
                <AlertCircle className="w-4 h-4" /> Circulation Notice
              </h4>
              <p className="text-sm font-bold text-natural-text leading-relaxed">
                Items not returned within 14 days will be flagged as overdue. Automated email notifications are sent to parents for students and departments for faculty.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};
