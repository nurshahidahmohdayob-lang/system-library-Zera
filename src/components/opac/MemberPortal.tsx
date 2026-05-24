import React, { useState, useEffect } from 'react';
import { 
  User, 
  Search, 
  BookOpen, 
  Clock, 
  Calendar, 
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  History,
  ArrowRight
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { UserProfile, Loan, Book } from '@/src/types/index';
import { cn } from '@/src/lib/utils';
import { format, isAfter, parseISO } from 'date-fns';

export const MemberPortal = () => {
  const [memberId, setMemberId] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loans, setLoans] = useState<(Loan & { book?: Book })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    const loansQ = query(
      collection(db, 'loans'), 
      where('userId', '==', profile.uid),
      orderBy('checkoutDate', 'desc')
    );

    const unsubscribe = onSnapshot(loansQ, async (loanSnap) => {
      const loanData = loanSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
      
      // Fetch books to match with loans
      const booksSnap = await getDocs(collection(db, 'books'));
      const booksMap = new Map(booksSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as Book]));
      
      setLoans(loanData.map(loan => ({
        ...loan,
        book: booksMap.get(loan.bookId)
      })));
      setLoading(false);
    }, (err) => {
      console.error("Loan fetch error:", err);
      setError("Unable to sync borrowing records.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!memberId.trim()) return;

    setLoading(true);
    setError(null);
    setProfile(null);
    setLoans([]);

    try {
      const usersRef = collection(db, 'users');
      let q = query(usersRef, where('studentId', '==', memberId.trim()));
      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        q = query(usersRef, where('email', '==', memberId.trim()));
        snapshot = await getDocs(q);
      }

      if (snapshot.empty) {
        setError('No members found with this ID or Email.');
        setLoading(false);
        return;
      }

      const userData = { uid: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserProfile;
      setProfile(userData);
    } catch (err) {
      console.error(err);
      setError('An error occurred during verification.');
      setLoading(false);
    }
  };

  const activeLoans = loans.filter(l => l.status === 'active');
  const pastLoans = loans.filter(l => l.status === 'returned');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {!profile ? (
        <div className="max-w-xl mx-auto py-12">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-zera-yellow/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-4 border-white">
              <User className="w-10 h-10 text-zera-emerald" />
            </div>
            <h2 className="text-4xl font-serif font-black text-zera-emerald">Member Access</h2>
            <p className="text-natural-muted font-medium mt-2">Enter your credentials to view your personal library archive.</p>
          </div>

          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
              <input 
                type="text"
                placeholder="Student ID or Institutional Email"
                className="w-full pl-14 pr-6 py-5 bg-white border-2 border-natural-border rounded-3xl outline-none focus:border-zera-yellow shadow-lg transition-all text-lg font-bold placeholder:text-natural-muted/50"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              />
              <button 
                type="submit"
                disabled={loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-zera-emerald text-white rounded-2xl hover:bg-zera-emerald-dark disabled:opacity-50 transition-all shadow-md group-hover:scale-105"
              >
                {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight className="w-6 h-6" />}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold animate-in zoom-in-95">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}
            <p className="text-center text-xs text-natural-muted font-bold uppercase tracking-widest pt-4">
              Authorized access only • SECURE SSL
            </p>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sidebar Info */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
              <div className="flex justify-between items-start mb-8">
                <div className="w-20 h-20 bg-zera-emerald text-white rounded-3xl flex items-center justify-center text-3xl font-black shadow-lg">
                  {profile.name.charAt(0)}
                </div>
                <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                  profile.role === 'teacher' ? 'bg-zera-yellow text-zera-emerald border-zera-yellow/30' : 'bg-blue-50 text-blue-600 border-blue-100'
                )}>
                  {profile.role}
                </div>
              </div>
              
              <h2 className="text-2xl font-serif font-black text-zera-emerald leading-tight mb-2">{profile.name}</h2>
              <p className="text-sm font-bold text-natural-muted mb-6">{profile.email}</p>
              
              <div className="space-y-4 pt-6 border-t border-natural-border">
                <div className="flex justify-between items-center bg-natural-bg p-3 rounded-2xl">
                  <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">ID Reference</span>
                  <span className="text-xs font-bold text-zera-emerald">{profile.studentId || 'N/A'}</span>
                </div>
                {profile.grade && (
                  <div className="flex justify-between items-center bg-natural-bg p-3 rounded-2xl">
                    <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">Form / Grade</span>
                    <span className="text-xs font-bold text-zera-emerald">{profile.grade}</span>
                  </div>
                )}
                {profile.department && (
                  <div className="flex justify-between items-center bg-natural-bg p-3 rounded-2xl">
                    <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">Faculty</span>
                    <span className="text-xs font-bold text-zera-emerald">{profile.department}</span>
                  </div>
                )}
              </div>

              <button 
                onClick={() => { setProfile(null); setMemberId(''); }}
                className="w-full mt-8 flex items-center justify-center gap-2 py-4 text-natural-muted font-black text-[10px] uppercase tracking-widest border border-natural-border rounded-2xl hover:bg-natural-bg transition-colors"
              >
                Logout Portal
              </button>
            </div>

            <div className="bg-zera-emerald p-8 rounded-[40px] text-white shadow-xl relative overflow-hidden">
               <ShieldCheck className="absolute -right-4 -bottom-4 w-40 h-40 text-white/5" />
               <div className="relative z-10">
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Member Standing</p>
                 <h3 className="text-2xl font-serif font-bold mb-4">Good Governance</h3>
                 <p className="text-xs font-medium leading-relaxed opacity-80">You have zero outstanding penalties. Your library privileges are fully active and in good standing.</p>
               </div>
            </div>
          </div>

          {/* Main Activity */}
          <div className="lg:col-span-2 space-y-8">
            {/* Active Items */}
            <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-zera-yellow/20 rounded-2xl">
                  <BookOpen className="w-6 h-6 text-zera-emerald" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-zera-emerald uppercase tracking-tight">Active Borrowing</h3>
                  <p className="text-[10px] font-bold text-natural-muted uppercase">Curated Resources Currently in your Possession</p>
                </div>
              </div>

              {activeLoans.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-natural-border rounded-3xl">
                   <p className="text-natural-muted font-serif italic">You currently have no physical assets borrowed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeLoans.map((loan) => {
                    const isOverdue = isAfter(new Date(), parseISO(loan.dueDate));
                    return (
                      <div key={loan.id} className="flex gap-4 p-4 bg-natural-bg rounded-3xl hover:shadow-md transition-shadow">
                        <div className="w-16 h-20 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-natural-border shadow-sm">
                          <img 
                            src={loan.book?.coverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'} 
                            className="w-full h-full object-cover"
                            alt="Book"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <h4 className="font-bold text-zera-emerald leading-tight mb-1">{loan.book?.title || 'Unknown Asset'}</h4>
                          <div className="flex gap-4">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-natural-muted" />
                              <span className="text-[10px] font-bold text-natural-muted uppercase">{format(parseISO(loan.checkoutDate), 'MMM d, yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className={cn("w-3.5 h-3.5", isOverdue ? "text-red-500" : "text-emerald-500")} />
                              <span className={cn("text-[10px] font-black uppercase tracking-wider", isOverdue ? "text-red-600" : "text-emerald-600")}>
                                Due: {format(parseISO(loan.dueDate), 'MMM d, yyyy')}
                                {isOverdue && ' (OVERDUE)'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-natural-border self-center" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* History */}
            <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-natural-bg rounded-2xl">
                  <History className="w-6 h-6 text-natural-muted" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-zera-emerald uppercase tracking-tight">Archive History</h3>
                  <p className="text-[10px] font-bold text-natural-muted uppercase">Past Intellectual Interactions</p>
                </div>
              </div>

              {pastLoans.length === 0 ? (
                <div className="text-center py-12">
                   <p className="text-natural-muted font-serif italic">Your library history is currently empty.</p>
                </div>
              ) : (
                <div className="divide-y divide-natural-border">
                  {pastLoans.map((loan) => (
                    <div key={loan.id} className="py-4 flex justify-between items-center group">
                      <div>
                        <p className="font-bold text-zera-emerald group-hover:text-zera-yellow-dark transition-colors">{loan.book?.title || 'Archive Item'}</p>
                        <p className="text-[10px] font-bold text-natural-muted uppercase">{loan.book?.author}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-natural-muted uppercase mb-1">Returned On</p>
                        <p className="text-xs font-black text-zera-emerald">{loan.returnDate ? format(parseISO(loan.returnDate), 'MMM d, yyyy') : 'Recently'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
