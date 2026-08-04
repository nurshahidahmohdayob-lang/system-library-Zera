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
  ArrowRight,
  Bookmark,
  Loader2,
  X,
  LogIn
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { UserProfile, Loan, Book } from '@/src/types/index';
import { cn } from '@/src/lib/utils';
import { format, isAfter, parseISO } from 'date-fns';
import { useAuth, handleFirestoreError, OperationType } from '@/src/hooks/useAuth';
import { useUserHolds } from '@/src/hooks/useHolds';
import { HoldService } from '@/src/services/libraryService';

interface MemberPortalProps {
  onOpenAuth?: () => void;
}

export const MemberPortal: React.FC<MemberPortalProps> = ({ onOpenAuth }) => {
  const { profile: loggedInProfile, logout } = useAuth();
  const [typedName, setTypedName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>('student');
  const [matchedCandidates, setMatchedCandidates] = useState<UserProfile[]>([]);
  const [memberId, setMemberId] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loans, setLoans] = useState<(Loan & { book?: Book })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loggedInProfile && (loggedInProfile.role === 'student' || loggedInProfile.role === 'teacher')) {
      setProfile(loggedInProfile);
    } else {
      setProfile(null);
    }
  }, [loggedInProfile]);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    const loansQ = query(
      collection(db, 'loans'), 
      where('userId', '==', profile.uid),
      orderBy('checkoutDate', 'desc')
    );

    const unsubscribe = onSnapshot(loansQ, async (loanSnap) => {
      const loanData = loanSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Loan));
      
      try {
        // Fetch books to match with loans
        const booksSnap = await getDocs(collection(db, 'books'));
        const booksMap = new Map(booksSnap.docs.map(doc => [doc.id, { ...doc.data(), id: doc.id } as Book]));
        
        setLoans(loanData.map(loan => ({
          ...loan,
          book: booksMap.get(loan.bookId)
        })));
        setLoading(false);
      } catch (bookErr) {
        handleFirestoreError(bookErr, OperationType.LIST, 'books');
      }
    }, (err) => {
      console.error("Loan fetch error:", err);
      setError("Unable to sync borrowing records.");
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'loans');
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedName.trim()) return;

    setLoading(true);
    setError(null);
    setProfile(null);
    setLoans([]);
    setMatchedCandidates([]);

    try {
      const usersRef = collection(db, 'users');
      // Find all users with the requested role
      const q = query(usersRef, where('role', '==', selectedRole));
      
      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (docErr) {
        handleFirestoreError(docErr, OperationType.LIST, 'users');
        throw docErr;
      }

      if (snapshot.empty) {
        setError(`No ${selectedRole} profiles found in the system.`);
        setLoading(false);
        return;
      }

      const searchLower = typedName.trim().toLowerCase();
      const candidates = snapshot.docs
        .map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile))
        .filter(user => {
          const nameLower = (user.name || '').toLowerCase();
          const idMatch = user.studentId && user.studentId.toLowerCase() === searchLower;
          return nameLower.includes(searchLower) || searchLower.includes(nameLower) || idMatch;
        });

      if (candidates.length === 0) {
        setError(`No ${selectedRole} profiles found matching "${typedName}". Please verify your spelling.`);
        setLoading(false);
        return;
      }

      if (candidates.length === 1) {
        // Only one match - select immediately
        setProfile(candidates[0]);
      } else {
        // Multiple matches - let the user select
        setMatchedCandidates(candidates);
      }
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError('An error occurred during verification.');
      setLoading(false);
    }
  };

  const activeLoans = loans.filter(l => l.status === 'active');
  const pastLoans = loans.filter(l => l.status === 'returned');

  // Holds are personal: only load them when viewing your OWN logged-in profile.
  const myUid = loggedInProfile && profile && loggedInProfile.uid === profile.uid ? profile.uid : undefined;
  const holds = useUserHolds(myUid);
  const activeHolds = holds.filter(h => h.status === 'pending' || h.status === 'ready');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancelHold = async (holdId: string) => {
    setCancelingId(holdId);
    try {
      await HoldService.cancelHold(holdId);
    } catch (e) {
      console.error('Cancel hold failed:', e);
    } finally {
      setCancelingId(null);
    }
  };

  const holdStatusLabel: Record<string, string> = {
    pending: 'Awaiting Librarian',
    ready: 'Ready for Pickup',
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {!profile ? (
        matchedCandidates.length > 0 ? (
          <div className="max-w-xl mx-auto py-12 text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-zera-yellow/20 rounded-full flex items-center justify-center mx-auto shadow-sm border-4 border-white animate-pulse">
              <User className="w-10 h-10 text-zera-emerald" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-serif font-black text-zera-emerald">Select Your Profile</h2>
              <p className="text-natural-muted font-medium max-w-sm mx-auto text-sm">
                We found several {selectedRole === 'teacher' ? 'teachers' : 'students'} matching your search. Please choose your correct profile below:
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 text-left">
              {matchedCandidates.map((candidate) => (
                <button
                  key={candidate.uid}
                  type="button"
                  onClick={() => {
                    setProfile(candidate);
                    setMatchedCandidates([]);
                  }}
                  className="bg-white border-2 border-natural-border hover:border-zera-emerald hover:bg-emerald-50/20 p-5 rounded-[24px] text-left transition-all hover:scale-[1.01] shadow-sm flex flex-col justify-between group cursor-pointer focus:ring-2 focus:ring-zera-yellow outline-none"
                >
                  <div className="pointer-events-none">
                    <p className="font-extrabold text-natural-text text-base leading-tight group-hover:text-zera-emerald transition-colors">{candidate.name}</p>
                    <div className="text-[10px] font-black uppercase text-zera-emerald tracking-wider mt-1.5 flex items-center gap-1.5">
                      <span>{candidate.role}</span>
                      {candidate.grade && (
                        <>
                          <span className="opacity-40">•</span>
                          <span>{candidate.grade}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 text-[11px] font-black uppercase tracking-wider text-natural-muted group-hover:text-zera-emerald pointer-events-none">
                    <span>Borrowing Portfolio</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={() => setMatchedCandidates([])}
                className="text-xs font-black uppercase tracking-widest text-natural-muted hover:text-zera-emerald transition-colors"
              >
                ← Back to Search
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-xl mx-auto py-12 text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-zera-yellow/20 rounded-full flex items-center justify-center mx-auto shadow-sm border-4 border-white">
              <User className="w-12 h-12 text-zera-emerald" />
            </div>
            
            <div className="space-y-3">
              <h2 className="text-4xl font-serif font-black text-zera-emerald">Member Borrowing Portal</h2>
              <p className="text-natural-muted font-medium max-w-md mx-auto leading-relaxed text-sm">
                <span className="font-bold text-zera-emerald">Teachers</span> sign in with their Zera email to place holds and track loans. Students can look up borrowing by name below.
              </p>
            </div>

            {/* Primary sign-in: Zera email + password (teaching staff only) */}
            <div className="bg-white border border-natural-border rounded-[36px] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-zera-emerald bg-zera-yellow/15 border border-zera-yellow/30 rounded-full py-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                For Teachers &amp; Staff
              </div>
              <button
                type="button"
                onClick={() => onOpenAuth?.()}
                className="w-full py-4 bg-zera-emerald hover:bg-zera-emerald-dark text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer select-none active:scale-[0.99]"
              >
                <LogIn className="w-4 h-4" />
                Sign in with Email
              </button>
              <p className="text-[10px] font-bold text-natural-muted leading-relaxed">
                Use your <span className="font-bold text-zera-emerald">@zera.edu.my</span> email. First time? Tap <span className="font-bold">“Forgot password?”</span> to set your password — a reset link is sent to your Zera (Outlook) inbox.
              </p>
            </div>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-natural-border" /></div>
              <div className="relative flex justify-center"><span className="bg-natural-bg px-3 text-[9px] font-black uppercase tracking-widest text-natural-muted">Students — quick lookup by name</span></div>
            </div>

            <form onSubmit={handleSearch} className="space-y-6 bg-white border border-natural-border rounded-[36px] p-6 shadow-sm text-left">
              {/* Role Toggle Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted italic block px-1">
                  Select Member Role
                </label>
                <div className="bg-natural-bg p-1 rounded-2xl flex border-2 border-natural-border gap-1 animate-in">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('student');
                      setError(null);
                    }}
                    className={cn(
                      "flex-1 py-3 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer select-none border border-transparent",
                      selectedRole === 'student'
                        ? "bg-white text-zera-emerald border-natural-border shadow-sm font-black"
                        : "text-natural-muted hover:text-natural-text"
                    )}
                  >
                    <User className="w-4 h-4" />
                    Student / Learner
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('teacher');
                      setError(null);
                    }}
                    className={cn(
                      "flex-1 py-3 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer select-none border border-transparent",
                      selectedRole === 'teacher'
                        ? "bg-white text-zera-emerald border-natural-border shadow-sm font-black"
                        : "text-natural-muted hover:text-natural-text"
                    )}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Teacher / Educator
                  </button>
                </div>
              </div>

              {/* Name Search field */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted italic block px-1">
                  Type Your Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Enter your registered name..."
                    className="w-full bg-natural-bg border-2 border-natural-border hover:border-zera-yellow/60 focus:border-zera-yellow rounded-2xl pl-12 pr-6 py-4 text-sm font-bold text-natural-text placeholder-natural-muted transition-colors outline-none shadow-inner"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start gap-2.5 text-xs font-bold leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-zera-emerald hover:bg-zera-emerald-dark disabled:bg-natural-border text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    View Borrowed Books
                  </>
                )}
              </button>
            </form>
            
            <div className="pt-2 border-t border-natural-border/60">
              <p className="text-[10px] font-black text-natural-muted uppercase tracking-[0.2em] leading-normal">
                Authorized OPAC Self-Check Directory
              </p>
            </div>
          </div>
        )
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
                onClick={async () => {
                  try {
                    await logout();
                  } catch (e) {
                    console.error("Logout failed:", e);
                  }
                  setProfile(null);
                  setMemberId('');
                  setTypedName('');
                  setMatchedCandidates([]);
                }}
                className="w-full mt-8 flex items-center justify-center gap-2 py-4 text-natural-muted hover:text-red-500 font-black text-[10px] uppercase tracking-widest border border-natural-border rounded-2xl hover:bg-natural-bg transition-colors"
              >
                Exit Member Portal
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
                            onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} 
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

            {/* My Holds / Reservations */}
            {myUid && (
              <div className="bg-white border border-natural-border rounded-[40px] p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-zera-yellow/20 rounded-2xl">
                    <Bookmark className="w-6 h-6 text-zera-emerald" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-zera-emerald uppercase tracking-tight">My Holds</h3>
                    <p className="text-[10px] font-bold text-natural-muted uppercase">Books You've Requested to Borrow</p>
                  </div>
                </div>

                {activeHolds.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-natural-border rounded-3xl">
                    <p className="text-natural-muted font-serif italic">
                      No active holds. Browse the Physical Library and tap “Hold this Book” to reserve one.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeHolds.map((hold) => (
                      <div key={hold.id} className="flex gap-4 p-4 bg-natural-bg rounded-3xl items-center">
                        <div className="w-14 h-18 bg-white rounded-xl overflow-hidden flex-shrink-0 border border-natural-border shadow-sm">
                          <img
                            onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }}
                            src={hold.bookCoverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'}
                            className="w-full h-full object-cover"
                            alt={hold.bookTitle}
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zera-emerald leading-tight mb-1 truncate">{hold.bookTitle}</h4>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            hold.status === 'ready'
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          )}>
                            <Clock className="w-3 h-3" />
                            {holdStatusLabel[hold.status] || hold.status}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCancelHold(hold.id)}
                          disabled={cancelingId === hold.id}
                          title="Cancel hold"
                          className="p-2.5 rounded-xl text-natural-muted hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {cancelingId === hold.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
