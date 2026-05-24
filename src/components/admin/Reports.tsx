import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  BarChart2, 
  PieChart, 
  Users, 
  BookOpen, 
  Clock, 
  CheckCircle,
  TrendingUp,
  Printer,
  Loader2,
  Trash2,
  X,
  Edit,
  User as UserIcon,
  Search,
  RefreshCcw,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { db } from '@/src/lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch, 
  doc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { Book, UserProfile, Loan } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/hooks/useAuth';

interface PreviewModalProps {
  title: string;
  data: any[];
  columns: { key: string; label: string }[];
  onClose: () => void;
  onRefresh: () => void;
  type: 'users' | 'books' | 'loans';
}

const PreviewModal: React.FC<PreviewModalProps> = ({ title, data, columns, onClose, onRefresh, type }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  
  const filteredData = data.filter(item => 
    Object.values(item).some(val => 
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleDelete = async (id: string) => {
    if (!id) {
      console.error("Delete failed: ID is missing from item");
      return;
    }

    // Check if we are in the confirmation phase
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      // Reset confirmation after 3 seconds of inactivity
      setTimeout(() => {
        setConfirmDeleteId(prev => prev === id ? null : prev);
      }, 3000);
      return;
    }

    setIsDeleting(id);
    try {
      const collectionMapping:Record<string, string> = {
        'users': 'users',
        'books': 'books',
        'loans': 'loans'
      };
      
      const collectionName = collectionMapping[type] || type;
      console.log(`Executing delete for ${id} in collection ${collectionName}`);
      
      await deleteDoc(doc(db, collectionName, id));
      
      console.log("Delete operation successful");
      setConfirmDeleteId(null);
      
      // Notify parent to refresh
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Delete operation failed:", err);
      // Don't throw here to avoid crashing the UI, just alert and log
      alert("Failed to delete record. Please check permissions.");
    } finally {
      setIsDeleting(null);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditValues({ ...item });
  };

  const handleEditChange = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    try {
      const collectionName = type === 'users' ? 'users' : type === 'books' ? 'books' : 'loans';
      const { id, ...updateData } = editValues;
      
      // Clean up sensitive or derived fields that shouldn't be manually edited here if necessary
      // For now, allow general editing based on column keys
      
      await updateDoc(doc(db, collectionName, editingId), updateData);
      alert("Update successful.");
      setEditingId(null);
      onRefresh();
    } catch (err) {
      console.error("Update error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `${type}/${editingId}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-natural-border flex items-center justify-between bg-natural-bg/50">
          <div>
            <h3 className="text-2xl font-serif font-bold text-natural-text">{title}</h3>
            <p className="text-xs text-natural-muted font-bold uppercase tracking-widest mt-1">Found {filteredData.length} records</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                <input 
                  className="pl-10 pr-4 py-2 bg-white border border-natural-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-zera-emerald outline-none w-64"
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
             <button onClick={onClose} className="p-2 hover:bg-natural-border rounded-full transition-colors">
               <X className="w-6 h-6 text-natural-text" />
             </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-natural-border text-[10px] font-black uppercase tracking-widest text-natural-muted bg-natural-bg/30">
                {columns.map(col => (
                  <th key={col.key} className="px-4 py-3">{col.label}</th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-natural-bg">
              {filteredData.map((item, idx) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id || idx} className="hover:bg-natural-bg/50 transition-colors group">
                    {columns.map(col => (
                      <td key={col.key} className="px-4 py-4 text-sm font-medium text-natural-text">
                        {isEditing ? (
                          <input 
                            className="w-full bg-white border border-natural-border rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-zera-emerald outline-none"
                            value={editValues[col.key] || ''}
                            onChange={(e) => handleEditChange(col.key, e.target.value)}
                          />
                        ) : (
                          item[col.key] || '-'
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={saveEdit}
                              disabled={isSaving}
                              className="p-2 text-zera-emerald hover:bg-zera-emerald/10 rounded-lg transition-colors"
                            >
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => setEditingId(null)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => startEdit(item)}
                              className="p-2 text-natural-muted hover:text-zera-emerald transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              disabled={isDeleting === item.id}
                              className={cn(
                                "p-2 rounded-lg transition-all flex items-center gap-1",
                                confirmDeleteId === item.id 
                                  ? "bg-red-600 text-white animate-pulse px-3" 
                                  : "text-natural-muted hover:text-red-500 hover:bg-red-50"
                              )}
                              title={confirmDeleteId === item.id ? "Click again to permanently delete" : "Delete record"}
                            >
                              {isDeleting === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="w-4 h-4" />
                                  {confirmDeleteId === item.id && <span className="text-[10px] font-black uppercase tracking-tighter">Confirm?</span>}
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <div className="py-20 text-center text-natural-muted font-serif italic text-lg opacity-50">
              No matching records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Reports: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    students: 0,
    teachers: 0,
    books: 0,
    loans: 0,
    availableBooks: 0
  });
  const [topBorrowers, setTopBorrowers] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ title: string; data: any[]; columns: any[]; type: any } | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const [confirmDeleteStats, setConfirmDeleteStats] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Students
      const studentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
      const teacherSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
      const bookSnap = await getDocs(collection(db, 'books'));
      const loanSnap = await getDocs(collection(db, 'loans'));

      const students = studentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const teachers = teacherSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const books = bookSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const loans = loanSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setStats({
        students: students.length,
        teachers: teachers.length,
        books: books.length,
        loans: loans.length,
        availableBooks: books.reduce((acc, b: any) => acc + (b.availableCopies || 0), 0)
      });

      // Calculate Top Borrowers
      const borrowerCounts: { [key: string]: { name: string; grade: string; count: number; role: string } } = {};
      
      loans.forEach((loan: any) => {
        if (!borrowerCounts[loan.userId]) {
          const user = [...students, ...teachers].find((u: any) => u.id === loan.userId) as any;
          borrowerCounts[loan.userId] = { 
            name: loan.userName || 'Unknown', 
            grade: user?.grade || user?.role || '-',
            role: user?.role || 'student',
            count: 0 
          };
        }
        borrowerCounts[loan.userId].count++;
      });

      const sortedBorrowers = Object.values(borrowerCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setTopBorrowers(sortedBorrowers);

    } catch (err) {
      console.error("Data fetch error:", err);
      handleFirestoreError(err, OperationType.LIST, 'collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleClearLoans = async () => {
    if (!confirmDeleteStats) {
      setConfirmDeleteStats(true);
      setTimeout(() => setConfirmDeleteStats(false), 3000);
      return;
    }
    
    setIsClearing(true);
    try {
      const loanSnap = await getDocs(collection(db, 'loans'));
      const batch = writeBatch(db);
      loanSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      // Also reset activeLoansCount for all users to be safe
      const userSnap = await getDocs(collection(db, 'users'));
      const userBatch = writeBatch(db);
      userSnap.docs.forEach((u) => {
        userBatch.update(u.ref, { activeLoansCount: 0 });
      });
      await userBatch.commit();

      await fetchData();
      alert("All circulation records have been cleared.");
    } catch (err) {
      console.error("Clear error:", err);
      alert("Failed to clear records.");
    } finally {
      setIsClearing(false);
    }
  };

  const reportTypes = [
    { 
      title: 'Students List', 
      icon: Users, 
      desc: 'Master list of all registered student members and their details.', 
      color: 'emerald',
      action: async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
        setPreview({
          title: 'Registered Students',
          data: snap.docs.map(d => ({ id: d.id, ...d.data() })),
          columns: [
            { key: 'name', label: 'FullName' },
            { key: 'grade', label: 'Grade' },
            { key: 'email', label: 'Email' },
            { key: 'studentId', label: 'Student ID' }
          ],
          type: 'users'
        });
      }
    },
    { 
      title: 'Teachers List', 
      icon: UserIcon, 
      desc: 'Comprehensive list of faculty and staff with library access.', 
      color: 'blue',
      action: async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
        setPreview({
          title: 'Faculty & Staff',
          data: snap.docs.map(d => ({ id: d.id, ...d.data() })),
          columns: [
            { key: 'name', label: 'FullName' },
            { key: 'department', label: 'Department' },
            { key: 'email', label: 'Email' },
            { key: 'studentId', label: 'Employee ID' }
          ],
          type: 'users'
        });
      }
    },
    { 
      title: 'Catalog Inventory', 
      icon: BookOpen, 
      desc: 'Full list of books, copies available, and current stock status.', 
      color: 'indigo',
      action: async () => {
        const snap = await getDocs(collection(db, 'books'));
        setPreview({
          title: 'Library Inventory',
          data: snap.docs.map(d => ({ id: d.id, ...d.data() })),
          columns: [
            { key: 'title', label: 'Book Title' },
            { key: 'author', label: 'Author' },
            { key: 'isbn', label: 'ISBN' },
            { key: 'availableCopies', label: 'Available' }
          ],
          type: 'books'
        });
      }
    },
    { 
      title: 'Circulation History', 
      icon: Clock, 
      desc: 'Log of all past and current loan transactions.', 
      color: 'orange',
      action: async () => {
        const snap = await getDocs(query(collection(db, 'loans'), orderBy('checkoutDate', 'desc')));
        setPreview({
          title: 'Circulation History',
          data: snap.docs.map(d => ({ id: d.id, ...d.data() })),
          columns: [
            { key: 'bookTitle', label: 'Book' },
            { key: 'userName', label: 'Member' },
            { key: 'checkoutDate', label: 'Issued' },
            { key: 'status', label: 'Status' }
          ],
          type: 'loans'
        });
      }
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-natural-border">
        <div>
          <h2 className="text-3xl font-serif font-bold text-natural-text">Systems Reporting</h2>
          <p className="text-natural-muted font-medium">Generate, export and customize library performance analytics.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData}
            className="p-2.5 bg-white border border-natural-border rounded-xl hover:bg-natural-bg transition-colors shadow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          </button>
          <button 
            onClick={handleClearLoans}
            disabled={isClearing}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border",
              confirmDeleteStats 
                ? "bg-red-600 text-white border-red-600 animate-pulse px-8" 
                : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            )}
          >
            <Trash2 className="w-4 h-4" /> 
            {isClearing ? 'Clearing...' : confirmDeleteStats ? 'Confirm Clear All?' : 'Clear Statistics'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {reportTypes.map((report, i) => (
          <div key={i} className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6", 
              report.color === 'emerald' ? 'bg-zera-emerald/10 text-zera-emerald' :
              report.color === 'blue' ? 'bg-blue-50 text-blue-600' :
              report.color === 'orange' ? 'bg-amber-50 text-amber-600' :
              report.color === 'red' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
            )}>
              <report.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-natural-text group-hover:text-zera-emerald transition-colors">{report.title}</h3>
            <p className="text-xs text-natural-muted mt-2 mb-8 font-medium leading-relaxed">{report.desc}</p>
            
            <div className="mt-auto">
              <button 
                onClick={report.action}
                className="w-full flex items-center justify-center gap-2 py-3 bg-zera-emerald/10 text-zera-emerald hover:bg-zera-emerald hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <BarChart2 className="w-3.5 h-3.5" /> Generate Report
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Stats */}
        <div className="bg-white border border-natural-border rounded-3xl p-8 shadow-sm">
           <div className="flex justify-between items-center mb-8">
             <h4 className="font-bold text-natural-text">Library Snapshot</h4>
             <TrendingUp className="w-5 h-5 text-zera-emerald" />
           </div>
           
           <div className="grid grid-cols-2 gap-6">
              {[
                { label: 'Total Books', val: stats.books, icon: BookOpen, color: 'text-indigo-600' },
                { label: 'Available', val: stats.availableBooks, icon: CheckCircle, color: 'text-emerald-600' },
                { label: 'Total Members', val: stats.students + stats.teachers, icon: Users, color: 'text-blue-600' },
                { label: 'Total Loans', val: stats.loans, icon: Clock, color: 'text-amber-600' },
              ].map((stat, i) => (
                <div key={i} className="p-6 bg-natural-bg/50 rounded-[32px] border border-natural-border flex flex-col items-center justify-center">
                   <stat.icon className={cn("w-6 h-6 mb-3", stat.color)} />
                   <p className="text-2xl font-black text-natural-text">{stat.val}</p>
                   <p className="text-[10px] font-black text-natural-muted uppercase tracking-widest mt-1">{stat.label}</p>
                </div>
              ))}
           </div>
        </div>

        <div className="bg-white border border-natural-border rounded-3xl p-8 shadow-sm">
           <div className="flex justify-between items-center mb-6">
             <h4 className="font-bold text-natural-text">Top Borrower (All-Time)</h4>
             <button 
                onClick={handleClearLoans}
                className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:underline"
              >
                Reset Rankings
             </button>
           </div>
           
           <div className="space-y-4">
             {topBorrowers.length > 0 ? topBorrowers.map((user, i) => (
               <div key={i} className="flex items-center justify-between group">
                 <div className="flex items-center gap-3">
                   <div className={cn(
                     "w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold",
                     i === 0 ? "bg-zera-yellow text-zera-yellow-dark" :
                     i === 1 ? "bg-slate-300 text-slate-600" :
                     i === 2 ? "bg-amber-600 text-amber-50" : "bg-natural-border text-natural-muted"
                   )}>
                     #{i + 1}
                   </div>
                   <div>
                     <p className="text-sm font-bold text-natural-text group-hover:text-zera-emerald transition-colors">{user.name}</p>
                     <p className="text-[10px] font-bold text-natural-muted uppercase tracking-wider">{user.grade}</p>
                   </div>
                 </div>
                 <div className="text-right">
                   <p className="text-sm font-black text-natural-text">{user.count}</p>
                   <p className="text-[10px] font-bold text-natural-muted uppercase">Books</p>
                 </div>
               </div>
             )) : (
              <div className="py-12 text-center opacity-30 italic font-serif">
                No borrowing data recorded yet.
              </div>
             )}
           </div>
        </div>
      </div>

      {preview && (
        <PreviewModal 
          title={preview.title}
          data={preview.data}
          columns={preview.columns}
          type={preview.type}
          onClose={() => setPreview(null)}
          onRefresh={() => {
            fetchData();
            // If we are currently previewing, we need to refresh the preview data itself
            // since fetchData only updates stats and topBorrowers
            const refreshActivePreview = async () => {
              if (!preview) return;
              
              try {
                if (preview.type === 'users') {
                  // Determine if student or teacher based on title
                  const role = preview.title.toLocaleLowerCase().includes('student') ? 'student' : 'teacher';
                  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', role)));
                  setPreview(prev => prev ? { ...prev, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) } : null);
                } else if (preview.type === 'books') {
                  const snap = await getDocs(collection(db, 'books'));
                  setPreview(prev => prev ? { ...prev, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) } : null);
                } else if (preview.type === 'loans') {
                  const snap = await getDocs(query(collection(db, 'loans'), orderBy('checkoutDate', 'desc')));
                  setPreview(prev => prev ? { ...prev, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) } : null);
                }
              } catch (error) {
                console.error("Preview refresh failed:", error);
              }
            };
            refreshActivePreview();
          }}
        />
      )}
    </div>
  );
};
