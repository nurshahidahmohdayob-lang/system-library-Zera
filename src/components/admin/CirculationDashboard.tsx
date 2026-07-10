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
import { collection, query, limit, addDoc, doc, updateDoc, where, getDocs } from 'firebase/firestore';
import { Book as BookType, UserProfile, Loan } from '@/src/types';
import { format, addDays } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { BatchCirculationImporter } from './BatchCirculationImporter';

export const CirculationDashboard = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [barcode, setBarcode] = useState('');
  const [bookResults, setBookResults] = useState<BookType[]>([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  // Running list of items issued to the currently-selected member during this
  // session. Grows with every successful scan/checkout and resets when a
  // different member is selected, so the librarian sees a live pile of what
  // they've just handed over.
  const [sessionIssues, setSessionIssues] = useState<{ bookTitle: string; barcode: string; at: string }[]>([]);
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
      const snapshot = await getDocs(collection(db, 'users'));
      setUsers(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)));
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const searchBooks = async () => {
      if (barcode.length < 2 || barcode.includes('ZERA-')) {
        setBookResults([]);
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
        // A scanner sends the whole code at once — if it exactly matches a book's
        // barcode or ISBN, issue it immediately (no button press needed).
        const exact = allBooks.find(b =>
          (b.barcode && b.barcode.toLowerCase() === scan.toLowerCase()) ||
          (b.isbn && scanDigits.length >= 10 && b.isbn.replace(/[^0-9Xx]/gi, '') === scanDigits)
        );
        if (exact && selectedUser && lastScanRef.current !== scan) {
          lastScanRef.current = scan;
          setBookResults([]);
          handleTransaction('checkout');
          return;
        }

        const filtered = allBooks.filter(b =>
          b.title.toLowerCase().includes(barcode.toLowerCase()) ||
          b.isbn.includes(barcode) ||
          (b.barcode && b.barcode.includes(barcode))
        ).slice(0, 5);

        setBookResults(filtered);
      } catch (err) {
        console.error("Book search error:", err);
      } finally {
        setIsSearchingBooks(false);
      }
    };

    const timer = setTimeout(searchBooks, 300);
    return () => clearTimeout(timer);
  }, [barcode, selectedUser]);

  const handleUserSearch = (val: string) => {
    setSearchTerm(val);
    if (val.length === 0) setSelectedUser(null);
  };

  const selectUser = (user: UserProfile) => {
    // Switching to a different member starts a fresh session list.
    if (user.uid !== selectedUser?.uid) setSessionIssues([]);
    setSelectedUser(user);
    setSearchTerm(user.name);
  };

  const selectBook = (book: BookType) => {
    setBarcode(book.barcode || book.isbn);
    setBookResults([]);
  };

  const handleTransaction = async (type: 'checkout') => {
    if (!selectedUser || !barcode) {
      setStatus({ type: 'error', message: 'Please select a member and enter a book barcode.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      // Search by barcode first, then isbn, then title
      let bookSnap = await getDocs(query(collection(db, 'books'), where('barcode', '==', barcode)));

      if (bookSnap.empty) {
        bookSnap = await getDocs(query(collection(db, 'books'), where('isbn', '==', barcode)));
      }

      if (bookSnap.empty) {
        bookSnap = await getDocs(query(collection(db, 'books'), where('title', '==', barcode)));
      }

      if (bookSnap.empty) {
        setStatus({ type: 'error', message: 'Book not found in catalog (checked Barcode, ISBN & Title).' });
        setLoading(false);
        return;
      }

      const bookDoc = bookSnap.docs[0];
      const bookData = bookDoc.data() as BookType;

      if (bookData.availableCopies <= 0) {
        setStatus({ type: 'error', message: 'No copies available for checkout.' });
        setLoading(false);
        return;
      }

      await addDoc(collection(db, 'loans'), {
        userId: selectedUser.uid,
        userName: selectedUser.name,
        bookId: bookDoc.id,
        bookTitle: bookData.title,
        checkoutDate: new Date().toISOString(),
        dueDate: addDays(new Date(), 14).toISOString(),
        status: 'active'
      });

      await updateDoc(doc(db, 'books', bookDoc.id), {
        availableCopies: bookData.availableCopies - 1
      });

      setSessionIssues(prev => [
        { bookTitle: bookData.title, barcode: bookData.barcode || bookData.isbn || barcode, at: new Date().toISOString() },
        ...prev,
      ]);
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
      // Find the book: barcode first, then ISBN, then exact title.
      let bookSnap = await getDocs(query(collection(db, 'books'), where('barcode', '==', code)));
      if (bookSnap.empty) bookSnap = await getDocs(query(collection(db, 'books'), where('isbn', '==', code)));
      if (bookSnap.empty) bookSnap = await getDocs(query(collection(db, 'books'), where('title', '==', code)));

      if (bookSnap.empty) {
        setReturnStatus({ type: 'error', message: `No catalogue match for “${code}” (checked Barcode, ISBN & Title).` });
        setReturnLoading(false);
        return;
      }

      const bookDoc = bookSnap.docs[0];
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
                      setSessionIssues([]);
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
                        <div>
                          <p className="text-sm font-bold text-natural-text">{user.name}</p>
                          <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest">{user.role} {user.grade && `• Grade ${user.grade}`}</p>
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
                     <p className="text-2xl font-black text-zera-emerald">{selectedUser.activeLoansCount || 0}</p>
                     <p className="text-[9px] font-black text-natural-muted uppercase tracking-widest">Active Loans</p>
                   </div>
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

               {bookResults.length > 0 && (
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

            {selectedUser && sessionIssues.length > 0 && (
              <div className="bg-natural-bg border border-natural-border rounded-3xl p-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-zera-emerald text-white flex items-center justify-center text-xs font-black">
                      {sessionIssues.length}
                    </span>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted">
                      Issued to {selectedUser.name.split(' ')[0]}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSessionIssues([])}
                    className="text-[9px] font-black uppercase tracking-widest text-natural-muted hover:text-red-500 transition-colors flex items-center gap-1"
                    title="Clear this session list"
                  >
                    <Eraser className="w-3 h-3" /> Clear
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sessionIssues.map((item, idx) => (
                    <div
                      key={`${item.barcode}-${item.at}-${idx}`}
                      className="flex items-center gap-3 bg-white border border-natural-border rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-1"
                    >
                      <CheckCircle2 className="w-4 h-4 text-zera-emerald shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-natural-text truncate">{item.bookTitle}</p>
                        <p className="text-[9px] font-black uppercase text-natural-muted tracking-widest truncate">
                          {item.barcode} • {format(new Date(item.at), 'h:mm a')}
                        </p>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-natural-muted">#{sessionIssues.length - idx}</span>
                    </div>
                  ))}
                </div>
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
