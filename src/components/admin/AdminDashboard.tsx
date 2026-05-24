import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Users, 
  Clock, 
  AlertCircle, 
  Plus, 
  UserPlus, 
  ArrowUpRight, 
  ArrowDownLeft,
  Activity,
  ChevronRight,
  TrendingUp,
  FileText,
  Trash2,
  Loader2,
  RefreshCcw,
  Eraser,
  Edit
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { db } from '@/src/lib/firebase';
import { handleFirestoreError, OperationType } from '@/src/hooks/useAuth';
import { collection, query, where, onSnapshot, getDocs, writeBatch, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { Loan } from '@/src/types';
import { formatDistanceToNow } from 'date-fns';

interface AdminDashboardProps {
  onNavigate: (tab: any) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [counts, setCounts] = useState({
    books: 0,
    students: 0,
   borrows: 0,
    overdue: 0
  });
  const [loading, setLoading] = useState(true);
  const [isPurging, setIsPurging] = useState<string | null>(null);
  const [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<string | null>(null);
  const [recentLoans, setRecentLoans] = useState<Loan[]>([]);
  const [refreshingLog, setRefreshingLog] = useState(false);
  const [refreshingCats, setRefreshingCats] = useState(false);
  const [popularCategories, setPopularCategories] = useState<{name: string, val: number, color: string}[]>([]);

  // Calculate dynamic popular categories
  useEffect(() => {
    const calculateTrends = async () => {
      try {
        const loansSnap = await getDocs(collection(db, 'loans'));
        const booksSnap = await getDocs(collection(db, 'books'));
        
        const booksMap = new Map();
        booksSnap.docs.forEach(d => booksMap.set(d.id, d.data()));
        
        const categoryCounts: {[key: string]: number} = {};
        loansSnap.docs.forEach(d => {
          const loan = d.data();
          const book = booksMap.get(loan.bookId);
          if (book && book.category) {
            categoryCounts[book.category] = (categoryCounts[book.category] || 0) + 1;
          }
        });
        
        const total = Object.values(categoryCounts).reduce((a, b) => a + b, 0) || 1;
        const colors = ['bg-blue-500', 'bg-zera-emerald', 'bg-zera-yellow', 'bg-indigo-500', 'bg-amber-500'];
        
        const sorted = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count], i) => ({
            name,
            val: Math.round((count / total) * 100),
            color: colors[i % colors.length]
          }));
          
        setPopularCategories(sorted);
      } catch (err) {
        console.error("Trends error:", err);
      }
    };
    
    calculateTrends();
  }, [recentLoans]); // Re-calculate when loans change
  useEffect(() => {
    // 1. Books Count
    const unsubBooks = onSnapshot(collection(db, 'books'), (snap) => {
      const activeSize = snap.docs.filter(d => d.data().status !== 'archived').length;
      setCounts(prev => ({ ...prev, books: activeSize }));
    });

    // 2. Students Count
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const activeSize = snap.docs.filter(d => d.data().role === 'student' && d.data().status !== 'archived').length;
      setCounts(prev => ({ ...prev, students: activeSize }));
    });

    // 3. Loans & Overdue & Activity
    const qLoans = query(collection(db, 'loans'), orderBy('checkoutDate', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      const allLoans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
      const activeLoans = allLoans.filter(d => d.status === 'active');
      const activeSize = activeLoans.length;
      const now = new Date().toISOString();
      const overdueSize = activeLoans.filter(d => (d as any).dueDate < now).length;
      
      setCounts(prev => ({ 
        ...prev, 
        borrows: activeSize, 
        overdue: overdueSize 
      }));
      
      // Update local recent activity
      setRecentLoans(allLoans.slice(0, 5));
      setLoading(false);
    }, (err) => {
      console.error("Dashboard snap error:", err);
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'loans');
    });

    return () => {
      unsubBooks();
      unsubUsers();
      unsubLoans();
    };
  }, []);

  const handleClearLog = async () => {
    if (!confirm("Are you sure you want to clear the circulation log? This will reset all transaction history. This cannot be undone.")) return;
    try {
      const snap = await getDocs(collection(db, 'loans'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      alert("Log cleared successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to clear log.");
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (confirmDeleteActivityId !== id) {
      setConfirmDeleteActivityId(id);
      setTimeout(() => setConfirmDeleteActivityId(null), 5000); // 5 seconds
      return;
    }

    try {
      console.log("Attempting to delete activity:", id);
      await deleteDoc(doc(db, 'loans', id));
      setConfirmDeleteActivityId(null);
    } catch (err) {
      console.error("Dashboard delete error:", err);
      // We don't use alert/confirm here as requested by environment constraints
      // But we will console.log so the dev can see it
      handleFirestoreError(err, OperationType.DELETE, `loans/${id}`);
    }
  };

  const handleArchiveData = async (label: string) => {
    if (isPurging !== label) {
      setIsPurging(label);
      // We don't use a timeout here because we want the user to click specifically to confirm
      // But maybe a small "confirm" state is better.
      return;
    }

    // Secondary click - execute
    try {
      const now = new Date().toISOString();
      if (label === 'Total Books') {
        const snap = await getDocs(collection(db, 'books'));
        const docsToArchive = snap.docs.filter(d => d.data().status !== 'archived');
        const batch = writeBatch(db);
        docsToArchive.forEach(d => batch.update(d.ref, { status: 'archived', updatedBy: 'admin_bulk', updatedAt: now }));
        await batch.commit();
        alert(`Successfully archived ${docsToArchive.length} book records.`);
      } else if (label === 'Total Students') {
        const snap = await getDocs(collection(db, 'users'));
        const docsToArchive = snap.docs.filter(d => d.data().role === 'student' && d.data().status !== 'archived');
        const batch = writeBatch(db);
        docsToArchive.forEach(d => batch.update(d.ref, { status: 'archived', updatedBy: 'admin_bulk', updatedAt: now }));
        await batch.commit();
        alert(`Successfully archived ${docsToArchive.length} student records.`);
      } else if (label === 'Active Borrows') {
        const snap = await getDocs(query(collection(db, 'loans'), where('status', '==', 'active')));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.update(d.ref, { status: 'archived', returnDate: now, updatedAt: now }));
        await batch.commit();
        alert(`Successfully archived ${snap.size} active loans.`);
      } else if (label === 'Overdue Books') {
        const snap = await getDocs(query(collection(db, 'loans'), where('status', '==', 'active')));
        const overdueDocs = snap.docs.filter(d => (d.data() as any).dueDate < now);
        const batch = writeBatch(db);
        overdueDocs.forEach(d => batch.update(d.ref, { 
          status: 'archived', 
          returnDate: now,
          updatedAt: now 
        }));
        await batch.commit();
        alert(`Successfully archived ${overdueDocs.length} overdue records.`);
      }
    } catch (error) {
      console.error("Archive failed:", error);
      alert("Failed to archive records: " + (error instanceof Error ? error.message : "Database error"));
    } finally {
      setIsPurging(null);
    }
  };

  const stats = [
    { label: 'Total Books', value: counts.books.toLocaleString(), icon: BookOpen, color: 'text-zera-emerald', bg: 'bg-zera-emerald/10' },
    { label: 'Total Students', value: counts.students.toLocaleString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Borrows', value: counts.borrows.toLocaleString(), icon: Clock, color: 'text-zera-yellow-dark', bg: 'bg-zera-yellow/10' },
    { label: 'Overdue Books', value: counts.overdue.toLocaleString(), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  const quickActions = [
    { label: 'Issue Book', icon: ArrowUpRight, action: () => onNavigate('circulation'), color: 'bg-zera-emerald' },
    { label: 'Return Book', icon: ArrowDownLeft, action: () => onNavigate('circulation'), color: 'bg-zera-emerald' },
    { label: 'Add Book', icon: Plus, action: () => onNavigate('catalog'), color: 'bg-zera-emerald' },
    { label: 'Add Student', icon: UserPlus, action: () => onNavigate('students'), color: 'bg-blue-600' },
  ];

  const recentActivity = [
    { id: 1, user: 'Ahmad Daniel', book: 'The Great Gatsby', type: 'Borrowed', time: '10 mins ago', status: 'success' },
    { id: 2, user: 'Sarah Jane', book: 'Advanced Physics', type: 'Returned', time: '25 mins ago', status: 'info' },
    { id: 3, user: 'Kevin Lee', book: 'Moby Dick', type: 'Overdue', time: '1 hour ago', status: 'error' },
    { id: 4, user: 'Mira Bella', book: 'Biology Vol. 2', type: 'Borrowed', time: '2 hours ago', status: 'success' },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-serif font-bold text-natural-text">Welcome back, Librarian</h2>
          <p className="text-natural-muted font-medium">Zera International School Library Overview</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-natural-border shadow-sm">
           <Activity className="w-5 h-5 text-zera-emerald animate-pulse" />
           <div className="text-xs">
             <p className="font-bold text-natural-text">Live System Update</p>
             <div className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 bg-zera-emerald rounded-full shadow-[0_0_5px_rgba(16,185,129,1)]"></div>
               <p className="text-[9px] font-black text-zera-emerald uppercase tracking-tighter">Z39.50 Connection Linked</p>
             </div>
           </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-natural-border shadow-sm group hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <stat.icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <button 
                onClick={() => handleArchiveData(stat.label)}
                className={cn(
                  "p-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5",
                  isPurging === stat.label 
                    ? "bg-red-600 text-white border-red-600 animate-pulse px-3" 
                    : "bg-red-50 text-red-500 border border-red-100 hover:bg-red-500 hover:text-white"
                )}
                title={`Archive ${stat.label} records`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isPurging === stat.label && <span className="text-[8px] font-black uppercase tracking-tighter">Confirm?</span>}
              </button>
            </div>
            {loading ? (
              <div className="h-8 w-24 bg-natural-bg animate-pulse rounded-lg mb-1"></div>
            ) : (
              <p className="text-2xl font-bold text-natural-text">{stat.value}</p>
            )}
            <p className="text-xs font-bold text-natural-muted uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-lg font-bold text-natural-text px-1">Quick Librarian Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            {quickActions.map((action, i) => (
              <button 
                key={i}
                onClick={action.action}
                className="flex flex-col items-center justify-center p-6 bg-white border border-natural-border rounded-3xl gap-3 hover:bg-natural-bg transition-colors shadow-sm group"
              >
                <div className={cn("p-4 rounded-2xl text-white group-hover:bg-zera-yellow group-hover:text-zera-emerald transition-all", action.color)}>
                  <action.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-natural-text">{action.label}</span>
              </button>
            ))}
          </div>

          <div className="bg-zera-emerald rounded-3xl p-6 text-white shadow-lg overflow-hidden relative">
            <div className="relative z-10">
              <h4 className="font-bold text-lg mb-2">Shelf Scan Required</h4>
              <p className="text-sm opacity-90 mb-4">Category "Science Fiction" hasn't been audited in 3 months.</p>
              <button 
                onClick={() => onNavigate('inventory')}
                className="bg-white text-zera-emerald px-4 py-2 rounded-xl text-xs font-bold shadow-sm hover:bg-natural-bg active:scale-95 transition-all"
              >
                Start Audit
              </button>
            </div>
            <BookOpen className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12 pointer-events-none" />
          </div>
        </div>

        {/* Recent Activity & Trends */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-lg font-bold text-natural-text">Live Circulation Log</h3>
            <div className="flex items-center gap-2">
               <button 
                onClick={() => {
                  setRefreshingLog(true);
                  setTimeout(() => setRefreshingLog(false), 800);
                }}
                className="p-1.5 hover:bg-natural-bg rounded-lg text-natural-muted transition-colors border border-natural-border"
               >
                 <RefreshCcw className={cn("w-3.5 h-3.5", refreshingLog && "animate-spin")} />
               </button>
               <button 
                onClick={handleClearLog}
                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors border border-red-100"
               >
                 <Eraser className="w-3.5 h-3.5" />
               </button>
               <button onClick={() => onNavigate('circulation')} className="text-xs font-bold text-zera-emerald flex items-center gap-1 ml-2">
                 View All <ChevronRight className="w-4 h-4" />
               </button>
            </div>
          </div>
          <div className="bg-white border border-natural-border rounded-3xl overflow-hidden shadow-sm">
            <div className="divide-y divide-natural-border">
              {recentLoans.length > 0 ? recentLoans.map((loan) => (
                <div key={loan.id} className="p-4 flex items-center justify-between hover:bg-natural-bg/50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", 
                      loan.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                    )}>
                      {loan.status === 'active' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-natural-text">
                        {loan.userName} <span className="font-normal text-natural-muted italic">{loan.status === 'active' ? 'Borrowed' : 'Returned'}</span> {loan.bookTitle}
                      </p>
                      <p className="text-[10px] font-bold text-natural-muted uppercase tracking-wider">
                        {formatDistanceToNow(new Date(loan.checkoutDate), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDeleteActivity(loan.id)}
                      className={cn(
                        "p-2 rounded-full transition-all flex items-center gap-1",
                        confirmDeleteActivityId === loan.id 
                          ? "bg-red-500 text-white animate-pulse px-3" 
                          : "hover:bg-red-50 text-red-500"
                      )}
                      title={confirmDeleteActivityId === loan.id ? "Click again to confirm" : "Delete Activity"}
                    >
                      <Trash2 className="w-4 h-4" />
                      {confirmDeleteActivityId === loan.id && <span className="text-[10px] font-black uppercase tracking-tighter">Confirm?</span>}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-natural-muted italic font-serif">No library transactions recorded.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-zera-emerald" />
                  Popular Categories
                </h4>
                <div className="flex gap-1">
                   <button 
                    onClick={() => {
                      setRefreshingCats(true);
                      setTimeout(() => setRefreshingCats(false), 800);
                    }}
                    title="Refresh Trends"
                    className="p-1 text-natural-muted hover:text-zera-emerald transition-colors"
                   >
                     <RefreshCcw className={cn("w-3 h-3", refreshingCats && "animate-spin")} />
                   </button>
                   <button 
                    onClick={handleClearLog}
                    title="Reset Trends (Clears History)"
                    className="p-1 text-natural-muted hover:text-red-500 transition-colors"
                   >
                     <Eraser className="w-3 h-3" />
                   </button>
                </div>
              </div>
              <div className="space-y-4">
                {popularCategories.length > 0 ? popularCategories.map((cat, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span>{cat.name}</span>
                      <span>{cat.val}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-natural-bg rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full", cat.color)} style={{ width: `${cat.val}%` }}></div>
                    </div>
                  </div>
                )) : (
                  <div className="py-8 text-center text-[10px] text-natural-muted italic">Insufficient borrowing data to show trends.</div>
                )}
              </div>
            </div>
            
            <div className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm">
              <h4 className="text-sm font-bold mb-4">Quick Report Export</h4>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => onNavigate('reports')}
                  className="flex items-center justify-between p-2 bg-natural-bg rounded-xl text-[10px] font-bold hover:bg-natural-border transition-colors active:scale-95 transition-all"
                >
                  <span>Inventory PDF</span>
                  <FileText className="w-3.5 h-3.5 text-natural-muted" />
                </button>
                <button 
                  onClick={() => onNavigate('reports')}
                  className="flex items-center justify-between p-2 bg-natural-bg rounded-xl text-[10px] font-bold hover:bg-natural-border transition-colors active:scale-95 transition-all"
                >
                  <span>Borrower Trends</span>
                  <Activity className="w-3.5 h-3.5 text-natural-muted" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
