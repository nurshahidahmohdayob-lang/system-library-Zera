import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  where, 
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { UserProfile, Loan } from '@/src/types';
import { 
  User as UserIcon, 
  Mail, 
  Tag, 
  GraduationCap, 
  Plus, 
  X, 
  Phone, 
  Building,
  Library,
  Search,
  ChevronRight,
  Trash2,
  BookOpen,
  Archive,
  Edit2,
  Clock,
  Loader2,
  Barcode as BarcodeIcon,
  Sparkles
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';
import { BarcodeService, BarcodeType } from '@/src/services/BarcodeService';

interface UserManagementProps {
  roleFilter?: 'student' | 'teacher';
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null, // We don't have easy access to auth here without passing it
      email: null,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const UserManagement: React.FC<UserManagementProps> = ({ roleFilter }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userLoans, setUserLoans] = useState<Loan[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [newUser, setNewUser] = useState<Partial<UserProfile>>({
    name: '',
    email: '',
    role: roleFilter || 'student',
    grade: '',
    department: '',
    studentId: '',
    phoneNumber: '',
    activeLoansCount: 0,
    status: 'active'
  });

  const resetForm = () => {
    setNewUser({
      name: '',
      email: '',
      role: roleFilter || 'student',
      grade: '',
      department: '',
      studentId: '',
      phoneNumber: '',
      activeLoansCount: 0,
      status: 'active'
    });
    setEditingUser(null);
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAutoBarcode = async () => {
    setIsGenerating(true);
    try {
      const barcodeType: BarcodeType = newUser.role === 'teacher' ? 'staff' : 'student';
      const nextBarcode = await BarcodeService.generateNextBarcode(barcodeType);
      setNewUser(prev => ({ ...prev, barcode: nextBarcode }));
    } catch (err) {
      alert("Failed to generate sequence barcode.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    // Use a simple query to avoid index requirements and filter in-memory
    const q = query(collection(db, 'users'), orderBy('name'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMembers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      // filter in-memory
      const filtered = allMembers.filter(u => {
        const matchesRole = roleFilter ? u.role === roleFilter : true;
        const isNotArchived = u.status !== 'archived';
        const matchesSearch = searchTerm ? (
          u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.studentId?.toLowerCase().includes(searchTerm.toLowerCase())
        ) : true;
        return matchesRole && isNotArchived && matchesSearch;
      });
      setUsers(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, [roleFilter, searchTerm]);

  const viewUserDetail = async (user: UserProfile) => {
    setSelectedUser(user);
    try {
      const q = query(collection(db, 'loans'), where('userId', '==', user.uid), orderBy('checkoutDate', 'desc'));
      const snapshot = await getDocs(q);
      setUserLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan)));
    } catch (err) {
      console.error("Error fetching loans:", err);
      // Fallback if index not ready
      const qSimple = query(collection(db, 'loans'), where('userId', '==', user.uid));
      const snapSimple = await getDocs(qSimple);
      setUserLoans(snapSimple.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan)));
    }
  };

  const handleSave = async (e?: React.BaseSyntheticEvent) => {
    if (e) e.preventDefault();
    
    // Immediate feedback
    console.log("handleSave started", newUser);
    
    if (!newUser.name || newUser.name.trim() === '') {
      alert("Please enter a Name before registering.");
      return;
    }

    const path = `users/${editingUser?.uid || 'new'}`;
    setSaving(true);
    
    try {
      const dataToSave = {
        name: (newUser.name || '').trim(),
        email: (newUser.email || '').trim(),
        role: newUser.role || roleFilter || 'student',
        grade: (newUser.grade || '').trim(),
        department: (newUser.department || '').trim(),
        studentId: (newUser.studentId || '').trim(),
        phoneNumber: (newUser.phoneNumber || '').trim(),
        status: newUser.status || 'active',
        activeLoansCount: newUser.activeLoansCount || 0,
        updatedAt: new Date().toISOString()
      };

      if (editingUser) {
        console.log("Updating:", editingUser.uid);
        await updateDoc(doc(db, 'users', editingUser.uid), dataToSave);
        alert(`Successfully updated "${dataToSave.name}"`);
      } else {
        console.log("Creating new user...");
        const userToSave = {
          ...dataToSave,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'users'), userToSave);
        console.log("New user created with ID:", docRef.id);
        alert(`"${dataToSave.name}" has been registered successfully!`);
      }
      
      setIsAdding(false);
      resetForm();
    } catch (err) {
      console.error("Registration error:", err);
      alert("Registration failed: " + (err instanceof Error ? err.message : "Database error"));
      handleFirestoreError(err, editingUser ? OperationType.UPDATE : OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user: UserProfile) => {
    setEditingUser(user);
    setNewUser({
      name: user.name,
      email: user.email,
      role: user.role,
      grade: user.grade,
      department: user.department,
      studentId: user.studentId,
      phoneNumber: user.phoneNumber
    });
    setIsAdding(true);
  };

  const roles: { value: 'student' | 'teacher' | 'admin'; label: string }[] = [
    { value: 'student', label: 'Student / Learner' },
    { value: 'teacher', label: 'Faculty / Teacher' },
    { value: 'admin', label: 'Administrator / Staff' }
  ];

  const deleteMember = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    console.log("Deleting member ID:", id);
    setSaving(true);
    try {
      const userRef = doc(db, 'users', id);
      await deleteDoc(userRef);
      
      console.log("Member deleted successfully");
      setSelectedUser(null);
      setEditingUser(null);
      setIsAdding(false);
      setConfirmDeleteId(null);
      alert("Member has been successfully removed from the system.");
    } catch (err) {
      console.error("Delete operation failed:", err);
      alert("Failed to delete member. Please check permissions.");
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-natural-border pb-8">
        <div className="flex-1">
          <h2 className="font-serif text-3xl font-bold text-natural-text capitalize">{roleFilter ? `${roleFilter}s` : 'Member'} Directory</h2>
          <p className="text-sm text-natural-muted font-medium italic">Zera International Registered Faculty & Students</p>
          
          <div className="mt-6 relative max-w-md group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted group-focus-within:text-zera-emerald transition-colors" />
            <input 
              type="text"
              placeholder="Search by name, email or ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (e.target.value && selectedUser) {
                  setSelectedUser(null);
                }
              }}
              className="w-full pl-12 pr-12 py-3.5 bg-white border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none shadow-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-natural-bg rounded-xl transition-colors"
                title="Clear Search"
              >
                <X className="w-4 h-4 text-natural-muted" />
              </button>
            )}
          </div>
        </div>
        <button 
          onClick={() => {
            if (!isAdding) {
              resetForm();
            }
            setIsAdding(!isAdding);
          }}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider",
            isAdding ? "bg-natural-bg text-natural-muted border border-natural-border" : "bg-zera-emerald text-white"
          )}
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancel' : `Add New ${roleFilter ? roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1) : 'Member'}`}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="p-8 bg-white border-2 border-zera-emerald/30 rounded-[40px] shadow-lg grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4">
          <div className="md:col-span-2 mb-2">
            <h3 className="text-xl font-serif font-bold text-zera-emerald">
              {editingUser ? 'Update Membership Details' : `New ${roleFilter || 'Member'} Registration`}
            </h3>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Membership Access Level</label>
              <select 
                className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none appearance-none"
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value as any})}
              >
                {roles.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Legal Full Name</label>
              <input placeholder="Enter full name" className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Institutional Email (Optional)</label>
              <input type="email" placeholder="email@zeraschool.org" className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
            </div>
            {newUser.role === 'student' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Academic Grade / Class (Optional)</label>
                <input className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none" value={newUser.grade} onChange={e => setNewUser({...newUser, grade: e.target.value})} placeholder="e.g. 10B" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Faculty Department / Role (Optional)</label>
                <input className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none" value={newUser.department} onChange={e => setNewUser({...newUser, department: e.target.value})} placeholder="e.g. Science / Senior Lecturer" />
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Unique Member ID (Scan QR) (Optional)</label>
              <input placeholder="ID Number" className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none font-mono" value={newUser.studentId} onChange={e => setNewUser({...newUser, studentId: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Contact Number (Optional)</label>
              <input className="w-full p-4 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none" value={newUser.phoneNumber} onChange={e => setNewUser({...newUser, phoneNumber: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted px-2">Library Barcode (Zera Serial)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <BarcodeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                  <input 
                    placeholder="Zera01" 
                    className="w-full p-4 pl-10 bg-natural-bg border border-natural-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-zera-emerald outline-none font-mono" 
                    value={newUser.barcode || ''} 
                    onChange={e => setNewUser({...newUser, barcode: e.target.value})} 
                  />
                </div>
                <button 
                  type="button"
                  onClick={handleAutoBarcode}
                  disabled={isGenerating}
                  className="px-4 bg-zera-yellow/20 text-zera-emerald-dark rounded-2xl hover:bg-zera-yellow/40 transition-colors border border-zera-yellow/30 flex items-center gap-2"
                  title="Generate Zera Serial"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-end justify-between gap-4">
                {editingUser && (
                  <button 
                    type="button" 
                    disabled={saving}
                    onClick={(e) => deleteMember(editingUser.uid, e)}
                    className={cn(
                      "px-6 py-4 border-2 font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50",
                      confirmDeleteId === editingUser.uid
                        ? "bg-red-600 text-white border-red-600 animate-pulse"
                        : "border-red-100 text-red-600 hover:bg-red-500 hover:text-white"
                    )}
                  >
                    <Trash2 className="w-4 h-4" /> 
                    {saving ? 'Deleting...' : confirmDeleteId === editingUser.uid ? 'Confirm?' : 'Delete Member'}
                  </button>
                )}
               <button 
                 type="button" 
                 disabled={saving}
                 onClick={(e) => handleSave(e)}
                 className={cn(
                   "flex-1 md:w-auto px-12 py-4 bg-zera-emerald text-white rounded-full text-xs font-black shadow-lg hover:bg-zera-emerald-dark transition-all uppercase tracking-widest flex items-center justify-center gap-2",
                   saving && "opacity-50 cursor-not-allowed"
                 )}
               >
                 {saving ? (
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 ) : null}
                 {editingUser ? 'Save Updates' : 'Register Member'}
               </button>
            </div>
          </div>
        </form>
      )}

      {selectedUser ? (
        <div className="bg-white border-2 border-zera-emerald rounded-[40px] p-8 shadow-xl animate-in zoom-in-95 fade-in duration-300 relative overflow-hidden">
           <button 
             onClick={() => setSelectedUser(null)} 
             type="button"
             className="absolute top-6 right-6 p-2 bg-natural-bg rounded-2xl hover:bg-natural-border transition-colors z-50 shadow-sm"
           >
             <X className="w-6 h-6 text-natural-muted" />
           </button>

           <div className="flex flex-col lg:flex-row gap-12 relative z-10">
             <div className="lg:w-1/3 space-y-8">
                <div className="flex flex-col items-center text-center">
                  <div className="w-32 h-32 bg-zera-emerald/10 border-4 border-zera-emerald/20 rounded-[40px] flex items-center justify-center text-zera-emerald mb-6">
                    <UserIcon className="w-16 h-16" />
                  </div>
                  <h3 className="text-3xl font-serif font-bold text-natural-text">{selectedUser.name}</h3>
                  <p className="text-[10px] font-black text-zera-emerald uppercase tracking-[0.3em] mt-1">{selectedUser.role}</p>
                </div>

                <div className="space-y-4 bg-natural-bg/50 p-6 rounded-[32px] border border-natural-border">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-natural-muted" />
                    <span className="text-sm font-bold text-natural-text">{selectedUser.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-natural-muted" />
                    <span className="text-sm font-bold text-natural-text">{selectedUser.phoneNumber || 'N/A'}</span>
                  </div>
                  {selectedUser.grade && (
                    <div className="flex items-center gap-3">
                      <GraduationCap className="w-4 h-4 text-natural-muted" />
                      <span className="text-sm font-bold text-natural-text">Grade {selectedUser.grade}</span>
                    </div>
                  )}
                  {selectedUser.department && (
                    <div className="flex items-center gap-3">
                      <Building className="w-4 h-4 text-natural-muted" />
                      <span className="text-sm font-bold text-natural-text">{selectedUser.department}</span>
                    </div>
                  )}
                </div>

                <button 
                  type="button"
                  disabled={saving}
                  onClick={(e) => deleteMember(selectedUser.uid, e)} 
                  className={cn(
                    "w-full relative z-30 flex items-center justify-center gap-2 py-4 font-black text-[10px] uppercase tracking-widest border-2 transition-all disabled:opacity-50 rounded-2xl",
                    confirmDeleteId === selectedUser.uid 
                      ? "bg-red-600 text-white border-red-600 animate-pulse px-4" 
                      : "text-red-600 border-red-200 hover:bg-red-500 hover:text-white bg-red-50/50"
                  )}
                >
                  <Trash2 className="w-4 h-4" /> 
                  {saving ? 'removing...' : confirmDeleteId === selectedUser.uid ? 'Confirm Removal?' : 'Delete Member Record'}
                </button>
             </div>

             <div className="lg:w-2/3 space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-lg font-black text-natural-text uppercase tracking-tight">Active Borrowings</h4>
                  <div className="flex items-center gap-2 bg-zera-emerald/10 px-3 py-1 rounded-full text-[10px] font-black text-zera-emerald uppercase tracking-widest border border-zera-emerald/20">
                    <BookOpen className="w-3.5 h-3.5" /> {userLoans.filter(l => l.status === 'active').length} Books
                  </div>
                </div>

                <div className="bg-natural-bg rounded-[32px] border border-natural-border p-4 space-y-3 max-h-[400px] overflow-y-auto">
                   {userLoans.length > 0 ? userLoans.map(loan => (
                     <div key={loan.id} className="bg-white p-5 rounded-2xl border border-natural-border flex items-center justify-between group shadow-sm hover:shadow-md transition-all">
                       <div className="flex gap-4 items-center">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors", 
                            loan.status === 'active' ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          )}>
                             {loan.status === 'active' ? <Clock className="w-5 h-5" /> : <Library className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-sm font-black text-natural-text group-hover:text-zera-emerald transition-colors leading-tight">{loan.bookTitle}</p>
                            <p className="text-[10px] font-bold text-natural-muted uppercase mt-0.5">
                              Due: {format(new Date(loan.dueDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                       </div>
                       <div className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border",
                        loan.status === 'active' ? "bg-amber-400 text-amber-900 border-amber-300" : "bg-emerald-100 text-emerald-800 border-emerald-200"
                       )}>
                         {loan.status}
                       </div>
                     </div>
                   )) : (
                     <div className="text-center py-20 grayscale opacity-30 font-serif italic text-lg">Member has no current or historical loans.</div>
                   )}
                </div>
             </div>
           </div>
           
           <UserIcon className="absolute -left-12 -bottom-12 w-64 h-64 text-zera-emerald opacity-5 pointer-events-none" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {users.map(user => (
            <div 
              key={user.uid} 
              onClick={() => viewUserDetail(user)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  viewUserDetail(user);
                }
              }}
              role="button"
              tabIndex={0}
              className="bg-white border border-natural-border rounded-[32px] p-6 shadow-sm hover:shadow-xl transition-all flex flex-col gap-6 text-left group relative overflow-hidden cursor-pointer focus:ring-2 focus:ring-zera-yellow outline-none"
            >
              <div className="flex gap-4 items-center relative z-10 pointer-events-none">
                <div className="w-14 h-14 bg-natural-bg rounded-2xl flex items-center justify-center text-natural-muted group-hover:bg-zera-emerald group-hover:text-white transition-all border border-natural-border shadow-inner">
                  <UserIcon className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-natural-text leading-tight group-hover:text-zera-emerald transition-colors truncate">{user.name}</p>
                  <p className="text-[9px] font-black text-zera-emerald uppercase tracking-[0.2em] mt-1">{user.role}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 relative z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-[11px] font-bold text-natural-muted group-hover:text-natural-text transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="flex justify-between items-end mt-2">
                   <div className="flex gap-2">
                     {user.grade && (
                       <span className="text-[9px] px-2 py-0.5 bg-zera-emerald/10 text-zera-emerald border border-zera-emerald/20 rounded font-black uppercase">G{user.grade}</span>
                     )}
                     {user.department && (
                       <span className="text-[9px] px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded font-black uppercase">{user.department}</span>
                     )}
                   </div>
                   <div className="flex items-center gap-1.5 text-zera-emerald">
                      <span className="text-xs font-black">{user.activeLoansCount || 0}</span>
                      <BookOpen className="w-3.5 h-3.5 opacity-40" />
                   </div>
                </div>
              </div>
              
              <div className="absolute top-4 right-4 flex gap-2">
                 <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(user);
                  }}
                  className="p-2 bg-white/80 rounded-xl hover:bg-zera-yellow hover:text-zera-emerald-dark transition-all shadow-sm opacity-0 group-hover:opacity-100 border border-natural-border z-20"
                  title="Edit Record"
                >
                   <Edit2 className="w-4 h-4" />
                 </button>
                 <button 
                  onClick={(e) => deleteMember(user.uid, e)}
                  disabled={saving}
                  className="p-2 bg-white/80 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm opacity-0 group-hover:opacity-100 border border-natural-border z-20 disabled:opacity-50"
                  title="Delete Record"
                >
                   <Trash2 className={cn("w-4 h-4", saving && confirmDeleteId === user.uid && "animate-spin")} />
                 </button>
                 <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-6 h-6 text-zera-emerald" />
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {users.length === 0 && !loading && (
        <div className="text-center py-40 border-2 border-dashed border-natural-border rounded-[40px] opacity-30">
           <UserIcon className="w-16 h-16 mx-auto mb-4" />
           <p className="font-serif italic text-2xl">No members registered in this category.</p>
        </div>
      )}
    </div>
  );
};
