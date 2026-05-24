import React, { useState, useEffect } from 'react';
import { 
  ScanLine, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  AlertCircle, 
  User, 
  Book,
  X,
  CheckCircle2,
  Calendar,
  Loader2,
  RefreshCcw,
  Trash2,
  Edit,
  Eraser
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { handleFirestoreError, OperationType } from '@/src/hooks/useAuth';
import { collection, onSnapshot, query, orderBy, limit, addDoc, doc, updateDoc, getDoc, where, getDocs, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { Loan, Book as BookType, UserProfile } from '@/src/types';
import { format, addDays } from 'date-fns';
import { cn } from '@/src/lib/utils';

export const CirculationDashboard = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [barcode, setBarcode] = useState('');
  const [bookResults, setBookResults] = useState<BookType[]>([]);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingHistory, setRefreshingHistory] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchHistory = () => {
    setRefreshingHistory(true);
    const q = query(collection(db, 'loans'), orderBy('checkoutDate', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan)));
      setRefreshingHistory(false);
    }, (err) => {
      console.error(err);
      setRefreshingHistory(false);
      handleFirestoreError(err, OperationType.LIST, 'loans');
    });
    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchHistory();
    return () => unsubscribe();
  }, []);

  const handleDeleteLoan = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 5000); // 5 seconds
      return;
    }

    setIsDeleting(id);
    try {
      console.log("Attempting to delete loan record:", id);
      await deleteDoc(doc(db, 'loans', id));
      setStatus({ type: 'success', message: 'Record deleted successfully.' });
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Delete error:", err);
      setStatus({ type: 'error', message: 'Failed to delete record. Check permissions.' });
      handleFirestoreError(err, OperationType.DELETE, `loans/${id}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      setTimeout(() => setConfirmClearHistory(false), 3000);
      return;
    }
    
    setIsClearingHistory(true);
    try {
      const snap = await getDocs(collection(db, 'loans'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      setStatus({ type: 'success', message: 'All circulation history cleared.' });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to clear history.' });
    } finally {
      setIsClearingHistory(false);
    }
  };

  useEffect(() => {
    // Initial users fetch for search
    const fetchUsers = async () => {
      const q = query(collection(db, 'users'), limit(100));
      const snapshot = await getDocs(q);
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const searchBooks = async () => {
      if (barcode.length < 2 || barcode.includes('ZERA-')) {
        setBookResults([]);
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
  }, [barcode]);

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

  const handleTransaction = async (type: 'checkout' | 'checkin') => {
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

      if (type === 'checkout') {
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

        setStatus({ type: 'success', message: `${bookData.title} was successfully issued to ${selectedUser.name}.` });
      } else {
        const loanQuery = query(
          collection(db, 'loans'), 
          where('bookId', '==', bookDoc.id), 
          where('userId', '==', selectedUser.uid), 
          where('status', '==', 'active')
        );
        const activeLoanSnap = await getDocs(loanQuery);

        if (activeLoanSnap.empty) {
          setStatus({ type: 'error', message: 'No active loan found for this book and member.' });
          setLoading(false);
          return;
        }

        const loanDoc = activeLoanSnap.docs[0];
        await updateDoc(doc(db, 'loans', loanDoc.id), {
          status: 'returned',
          returnDate: new Date().toISOString()
        });

        await updateDoc(doc(db, 'books', bookDoc.id), {
          availableCopies: bookData.availableCopies + 1
        });

        setStatus({ type: 'success', message: `${bookData.title} has been returned.` });
      }

      setBarcode('');
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Transaction failed. Please check connection.' });
    }
    setLoading(false);
  };

  const filteredUsers = searchTerm.length > 0 && !selectedUser
    ? users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h2 className="font-serif text-3xl font-bold text-natural-text">Circulation Desk</h2>
        <p className="text-sm text-natural-muted font-medium italic">Zera International Institutional Lending Management</p>
      </div>

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
                    {filteredUsers.map(user => (
                      <button 
                        key={user.uid}
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
                  placeholder="Scan barcode or type title..."
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
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
                           <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
               <button 
                  onClick={() => handleTransaction('checkin')}
                  disabled={loading || !selectedUser || !barcode}
                  className="flex-1 flex items-center justify-center gap-3 bg-white border-2 border-zera-emerald text-zera-emerald rounded-full py-5 font-black uppercase text-xs tracking-[0.2em] hover:bg-zera-emerald/5 shadow-md disabled:opacity-30 transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowDownLeft className="w-5 h-5" /> Return Item</>}
               </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
           <div className="bg-zera-emerald rounded-[40px] p-8 text-white shadow-xl flex flex-col h-full relative overflow-hidden">
             <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                 <h3 className="font-serif text-2xl font-bold">Recent History</h3>
                 <div className="flex items-center gap-2">
                    <button 
                      onClick={fetchHistory}
                      className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/20"
                      title="Refresh"
                    >
                      <RefreshCcw className={cn("w-3.5 h-3.5", refreshingHistory && "animate-spin")} />
                    </button>
                    <button 
                      onClick={handleClearAllHistory}
                      disabled={isClearingHistory}
                      className={cn(
                        "p-1.5 transition-colors border",
                        confirmClearHistory 
                          ? "bg-red-600 text-white border-red-600 animate-pulse px-3 rounded-xl" 
                          : "bg-red-500/10 hover:bg-red-500/30 text-red-100 rounded-lg border-red-500/20"
                      )}
                      title={confirmClearHistory ? "Click again to clear ALL history" : "Clear All History"}
                    >
                      {isClearingHistory ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <div className="flex items-center gap-1">
                          <Eraser className="w-3.5 h-3.5" />
                          {confirmClearHistory && <span className="text-[9px] font-black uppercase tracking-tighter">Confirm?</span>}
                        </div>
                      )}
                    </button>
                    <div className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">Live Sync Active</div>
                 </div>
               </div>
               
               <div className="space-y-6">
                  {loans.length > 0 ? loans.map(loan => (
                    <div key={loan.id} className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0 group">
                      <div className="flex gap-4 items-center">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 group-hover:bg-white/20 transition-colors">
                           <Clock className="w-5 h-5 opacity-60" />
                        </div>
                        <div>
                          <p className="text-sm font-black tracking-tight">{loan.bookTitle}</p>
                          <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest mt-1">
                            {loan.userName} • {format(new Date(loan.checkoutDate), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border",
                          loan.status === 'active' ? "bg-amber-400 text-amber-900 border-amber-300" : "bg-emerald-400 text-emerald-900 border-emerald-300"
                        )}>
                          {loan.status}
                        </div>
                        <div className="flex gap-1 opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleDeleteLoan(loan.id)}
                            disabled={isDeleting === loan.id}
                            className={cn(
                              "p-1.5 rounded-lg transition-all flex items-center gap-1 disabled:opacity-30",
                              confirmDeleteId === loan.id 
                                ? "bg-red-500 text-white animate-pulse px-2" 
                                : "bg-white/10 hover:bg-red-500 text-white"
                            )}
                            title={confirmDeleteId === loan.id ? "Click again to confirm delete" : "Delete Record"}
                          >
                            {isDeleting === loan.id ? (
                               <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                {confirmDeleteId === loan.id && <span className="text-[9px] font-black uppercase tracking-tighter">Confirm?</span>}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-20 opacity-40 font-serif italic text-lg">No library activity recorded yet today.</div>
                  )}
               </div>
             </div>
             <Book className="absolute -right-12 -bottom-12 w-64 h-64 opacity-5 rotate-12 pointer-events-none" />
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
