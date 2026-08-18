import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  where,
  getDocs,
  getDoc,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { UserProfile, Loan, Book as BookType } from '@/src/types';
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
  ChevronLeft,
  Trash2,
  BookOpen,
  Archive,
  Edit2,
  Clock,
  Loader2,
  Barcode as BarcodeIcon,
  Sparkles,
  Printer,
  Download,
  Users
} from 'lucide-react';
import { cn, clean } from '@/src/lib/utils';
import { format } from 'date-fns';
import { MemberDuplicates } from './MemberDuplicates';
import { BarcodeService, BarcodeType } from '@/src/services/BarcodeService';
import { StudentSync } from '@/src/components/admin/StudentSync';
import { StaffSync } from '@/src/components/admin/StaffSync';

interface UserManagementProps {
  roleFilter?: 'student' | 'teacher';
}

// Format a loan date (stored as ISO string; guarded for Firestore Timestamp)
// into "Aug 6, 2026". Returns '' for missing/invalid dates.
// Parse a loan date that may be an ISO string, a Firestore Timestamp, or a
// {seconds} shape (older/imported records). Returns null when unparseable.
const parseLoanDate = (v: any): Date | null => {
  if (!v) return null;
  const d = (typeof v === 'string' || typeof v === 'number')
    ? new Date(v)
    : (typeof v?.toDate === 'function' ? v.toDate() : (typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : null));
  return d && !isNaN(d.getTime()) ? d : null;
};

const fmtLoanDate = (v: any): string => {
  const d = parseLoanDate(v);
  return d ? format(d, 'MMM d, yyyy') : '';
};

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
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userLoans, setUserLoans] = useState<Loan[]>([]);
  // Book-details popup opened by clicking a borrowed title in Active Borrowings.
  const [viewBook, setViewBook] = useState<BookType | null>(null);
  const [viewBookLoading, setViewBookLoading] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // Duplicate-cleanup panel. Deleting /users needs an admin session, so this is
  // the only place the redundant records can actually be removed from.
  const [showDuplicates, setShowDuplicates] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, searchTerm]);
  
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
      const allMembers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
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

  // Open the catalogue record for a borrowed title. We look the book up by its
  // loan.bookId; if the book was deleted we fall back to a title match.
  const openBookDetails = async (loan: Loan) => {
    setViewBookLoading(loan.id);
    try {
      let book: BookType | null = null;
      if (loan.bookId) {
        const snap = await getDoc(doc(db, 'books', loan.bookId));
        if (snap.exists()) book = { id: snap.id, ...snap.data() } as BookType;
      }
      if (!book && loan.bookTitle) {
        const q = await getDocs(query(collection(db, 'books'), where('title', '==', loan.bookTitle)));
        if (!q.empty) book = { id: q.docs[0].id, ...q.docs[0].data() } as BookType;
      }
      if (book) {
        setViewBook(book);
      } else {
        alert('This book is no longer in the catalogue.');
      }
    } catch (err) {
      console.error('Failed to load book details:', err);
      alert('Could not load book details. Please try again.');
    } finally {
      setViewBookLoading(null);
    }
  };

  // Build a self-contained, printable HTML page of a member's borrowed books.
  const buildLoansHtml = (member: UserProfile, loans: Loan[]): string => {
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    const printedOn = fmtLoanDate(new Date().toISOString()) || '';
    const activeCount = loans.filter(l => l.status !== 'returned').length;
    const rowsFor = (list: Loan[]) => list.map((l, i) => {
      const returned = l.status === 'returned';
      const due = parseLoanDate(l.dueDate);
      const overdue = l.status === 'active' && !!due && due.getTime() < Date.now();
      const statusLabel = returned ? 'Returned' : overdue ? 'Overdue' : 'Out';
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.bookTitle) || '—'}</td>
        <td>${esc(fmtLoanDate(l.checkoutDate)) || '—'}</td>
        <td>${returned ? esc(fmtLoanDate(l.returnDate)) || '—' : esc(fmtLoanDate(l.dueDate)) || '—'}</td>
        <td class="${overdue ? 'overdue' : ''}">${statusLabel}</td>
      </tr>`;
    }).join('');
    const currentLoans = loans.filter(l => l.status !== 'returned');
    const pastLoans = loans.filter(l => l.status === 'returned');
    const tableFor = (title: string, list: Loan[]) => `<h2>${esc(title)} (${list.length})</h2>` + (list.length
      ? `<table><thead><tr><th>#</th><th>Title</th><th>Borrowed</th><th>Due / Returned</th><th>Status</th></tr></thead><tbody>${rowsFor(list)}</tbody></table>`
      : `<p class="empty">None.</p>`);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Borrowed Books — ${esc(member.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2a24; margin: 40px; }
  .head { border-bottom: 3px solid #1e6b52; padding-bottom: 14px; margin-bottom: 22px; }
  .head h1 { margin: 0 0 4px; color: #1e6b52; font-size: 24px; }
  .meta { font-size: 12px; color: #5b6b63; }
  .meta strong { color: #1f2a24; }
  h2 { font-size: 15px; color: #1e6b52; margin: 24px 0 6px; border-left: 4px solid #f2c14e; padding-left: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
  th { background: #1e6b52; color: #fff; text-align: left; padding: 9px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 9px 12px; border-bottom: 1px solid #e2e8e4; }
  tr:nth-child(even) td { background: #f6faf8; }
  td.overdue { color: #c0392b; font-weight: bold; }
  .empty { margin-top: 24px; font-style: italic; color: #8a978f; }
  .foot { margin-top: 26px; font-size: 11px; color: #8a978f; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="head">
    <h1>Zera International Library — Borrowed Books</h1>
    <div class="meta">
      <div><strong>Member:</strong> ${esc(member.name)}${member.role ? ` (${esc(member.role)})` : ''}</div>
      ${member.email ? `<div><strong>Email:</strong> ${esc(member.email)}</div>` : ''}
      <div><strong>Currently out:</strong> ${activeCount} &nbsp;·&nbsp; <strong>Total records:</strong> ${loans.length}</div>
      ${printedOn ? `<div><strong>Printed:</strong> ${esc(printedOn)}</div>` : ''}
    </div>
  </div>
  ${loans.length
    ? `${tableFor('Currently Borrowed', currentLoans)}${tableFor('Previously Borrowed (History)', pastLoans)}`
    : `<p class="empty">This member has no borrowing records.</p>`}
  <div class="foot">Generated by the Zera International Library System.</div>
</body></html>`;
  };

  const handlePrintLoans = () => {
    if (!selectedUser) return;
    const html = buildLoansHtml(selectedUser, userLoans);
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print the list.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Give the new window a moment to render before invoking print.
    setTimeout(() => w.print(), 300);
  };

  const handleDownloadLoansHtml = () => {
    if (!selectedUser) return;
    const html = buildLoansHtml(selectedUser, userLoans);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (selectedUser.name || 'member').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
    a.href = url;
    a.download = `${safeName}-borrowed-books.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // One loan row — reused by the "Currently Borrowed" and "Previously Borrowed"
  // sections below.
  const renderLoanRow = (loan: Loan) => {
    const due = parseLoanDate(loan.dueDate);
    const isOverdue = loan.status === 'active' && !!due && due.getTime() < Date.now();
    return (
      <button
        key={loan.id}
        type="button"
        onClick={() => openBookDetails(loan)}
        title="View book details"
        className="w-full text-left bg-white p-5 rounded-2xl border border-natural-border flex items-center justify-between gap-3 group shadow-sm hover:shadow-md hover:border-zera-emerald/40 transition-all cursor-pointer"
      >
        <div className="flex gap-4 items-center min-w-0">
           <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
             loan.status === 'active' ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
           )}>
              {viewBookLoading === loan.id ? <Loader2 className="w-5 h-5 animate-spin" /> : loan.status === 'active' ? <Clock className="w-5 h-5" /> : <Library className="w-5 h-5" />}
           </div>
           <div className="min-w-0">
             <p className="text-sm font-black text-natural-text group-hover:text-zera-emerald transition-colors leading-tight underline decoration-transparent group-hover:decoration-zera-emerald/40 underline-offset-2 truncate">{loan.bookTitle}</p>
             <p className="text-[10px] font-bold text-natural-muted uppercase mt-0.5">
               Borrowed: {fmtLoanDate(loan.checkoutDate) || '—'}
               {loan.status === 'returned' && <> · Returned: {fmtLoanDate(loan.returnDate) || '—'}</>}
             </p>
           </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className={cn(
           "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border",
           isOverdue ? "bg-red-500 text-white border-red-600"
             : loan.status === 'active' ? "bg-amber-400 text-amber-900 border-amber-300"
             : "bg-emerald-100 text-emerald-800 border-emerald-200"
          )}>
            {isOverdue ? 'overdue' : loan.status}
          </div>
          {loan.status === 'active' && (
            <div className={cn(
              "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border whitespace-nowrap",
              isOverdue ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-natural-text border-natural-border"
            )}>
              Due {due ? format(due, 'd MMM yyyy') : '—'}
            </div>
          )}
        </div>
      </button>
    );
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

  const indexOfLastUser = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstUser = indexOfLastUser - ITEMS_PER_PAGE;
  const currentUsers = users.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-natural-border pb-8">
        <div className="flex-1">
          <h2 className="font-serif text-3xl font-bold text-natural-text capitalize">{roleFilter ? `${roleFilter}s` : 'Member'} Directory</h2>
          <p className="text-sm text-natural-muted font-medium italic">Zera Education Registered Faculty & Students</p>
          
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
          type="button"
          onClick={() => setShowDuplicates(true)}
          title="Find members that exist more than once"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold shadow-md transition-all uppercase tracking-wider bg-zera-yellow text-zera-emerald-dark hover:brightness-95"
        >
          <Users className="w-4 h-4" />
          Duplicates
        </button>
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

      {showDuplicates && <MemberDuplicates onClose={() => setShowDuplicates(false)} />}

      {roleFilter === 'student' && <StudentSync />}
      {roleFilter === 'teacher' && <StaffSync />}

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
                    <span className="text-sm font-bold text-natural-text">{clean(selectedUser.phoneNumber) || 'N/A'}</span>
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
                  
                  {selectedUser.cohort && (
                    <div className="flex items-center gap-3 pt-1 border-t border-natural-border/30">
                      <span className="text-[10px] text-natural-muted font-black uppercase tracking-wider w-16 shrink-0">Cohort</span>
                      <span className="text-xs font-black text-natural-text bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border">{selectedUser.cohort}</span>
                    </div>
                  )}
                  {selectedUser.dateOfBirth && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-natural-muted font-black uppercase tracking-wider w-16 shrink-0">DOB</span>
                      <span className="text-xs font-black text-natural-text bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border">{selectedUser.dateOfBirth}</span>
                    </div>
                  )}
                  {selectedUser.gender && (
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-natural-muted font-black uppercase tracking-wider w-16 shrink-0">Gender</span>
                      <span className="text-xs font-black text-natural-text bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border capitalize">{selectedUser.gender}</span>
                    </div>
                  )}
                  {selectedUser.syncSource && (
                    <div className="pt-2.5 border-t border-natural-border/60 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-zera-emerald rounded-full animate-pulse shrink-0" />
                      <span className="text-[9px] text-zera-emerald font-black uppercase tracking-widest leading-none">Synced Profile • {selectedUser.syncSource}</span>
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
                <div className="flex items-center justify-between px-2 gap-3 flex-wrap">
                  <h4 className="text-lg font-black text-natural-text uppercase tracking-tight">Borrowing History</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 bg-zera-emerald/10 px-3 py-1 rounded-full text-[10px] font-black text-zera-emerald uppercase tracking-widest border border-zera-emerald/20">
                      <BookOpen className="w-3.5 h-3.5" /> {userLoans.filter(l => l.status === 'active').length} out · {userLoans.length} total
                    </div>
                    <button
                      type="button"
                      onClick={handlePrintLoans}
                      disabled={userLoans.length === 0}
                      title="Print this member's borrowed-books list"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark shadow-sm transition-all disabled:opacity-40"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadLoansHtml}
                      disabled={userLoans.length === 0}
                      title="Download this member's borrowed-books list as an HTML file"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-yellow text-zera-emerald-dark hover:brightness-95 shadow-sm transition-all disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" /> HTML
                    </button>
                  </div>
                </div>

                {(() => {
                  const currentLoans = userLoans.filter(l => l.status !== 'returned');
                  const pastLoans = userLoans.filter(l => l.status === 'returned');
                  return (
                    <div className="bg-natural-bg rounded-[32px] border border-natural-border p-4 space-y-3 max-h-[400px] overflow-y-auto">
                      {userLoans.length === 0 ? (
                        <div className="text-center py-20 grayscale opacity-30 font-serif italic text-lg">Member has no current or historical loans.</div>
                      ) : (
                        <>
                          {/* Currently borrowed — the books still under this member's name. */}
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zera-emerald px-1 pt-1">Currently Borrowed · {currentLoans.length}</p>
                          {currentLoans.length > 0
                            ? currentLoans.map(renderLoanRow)
                            : <p className="text-xs font-bold text-natural-muted italic px-1 pb-2">No books currently borrowed.</p>}

                          {/* Previously borrowed — returned books kept only as history. */}
                          {pastLoans.length > 0 && (
                            <>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-natural-muted px-1 pt-3 border-t border-natural-border/60 mt-2">Previously Borrowed · History · {pastLoans.length}</p>
                              {pastLoans.map(renderLoanRow)}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
             </div>
           </div>
           
           <UserIcon className="absolute -left-12 -bottom-12 w-64 h-64 text-zera-emerald opacity-5 pointer-events-none" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {currentUsers.map(user => (
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

          {/* Pagination Component */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-white border border-natural-border px-6 py-4 rounded-[28px] shadow-sm gap-4 mt-4 select-none">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-natural-text border-2 border-natural-border rounded-2xl hover:bg-natural-bg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <span className="text-xs font-black text-natural-muted uppercase tracking-wider text-center">
                Page <span className="text-zera-emerald font-black text-sm px-1">{currentPage}</span> of <span className="text-natural-text font-black">{totalPages}</span>
                <span className="text-[10px] text-natural-muted/60 block sm:inline sm:ml-2">({users.length} total profiles)</span>
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-natural-text border-2 border-natural-border rounded-2xl hover:bg-natural-bg disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {users.length === 0 && !loading && (
        <div className="text-center py-40 border-2 border-dashed border-natural-border rounded-[40px] opacity-30">
           <UserIcon className="w-16 h-16 mx-auto mb-4" />
           <p className="font-serif italic text-2xl">No members registered in this category.</p>
        </div>
      )}

      {/* Book details popup — opened from a borrowed title in Active Borrowings */}
      {viewBook && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setViewBook(null)}
        >
          <div
            className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex justify-between items-start gap-4 mb-6">
                <div className="flex gap-4">
                  <div className="w-24 h-32 rounded-2xl bg-natural-bg border border-natural-border overflow-hidden shrink-0 flex items-center justify-center">
                    {viewBook.coverUrl ? (
                      <img src={viewBook.coverUrl} alt={viewBook.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <BookOpen className="w-8 h-8 text-natural-muted opacity-40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-serif text-xl font-black text-zera-emerald leading-tight">{viewBook.title}</h3>
                    {viewBook.author?.trim() && <p className="text-sm font-bold text-natural-muted italic mt-1">By {viewBook.author}</p>}
                    <span className="inline-block mt-2 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-zera-emerald/10 text-zera-emerald border border-zera-emerald/20">{viewBook.category}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewBook(null)}
                  className="p-2 hover:bg-natural-bg rounded-full transition-colors shrink-0"
                  title="Close"
                >
                  <X className="w-5 h-5 text-natural-muted" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-natural-bg rounded-2xl p-4 border border-natural-border">
                  <p className="text-[9px] font-black uppercase tracking-widest text-natural-muted/70 mb-1">ISBN</p>
                  <p className="font-mono text-sm font-bold text-zera-emerald break-all">{clean(viewBook.isbn) || '—'}</p>
                </div>
                <div className="bg-natural-bg rounded-2xl p-4 border border-natural-border">
                  <p className="text-[9px] font-black uppercase tracking-widest text-natural-muted/70 mb-1">Accession No.</p>
                  <p className="font-mono text-sm font-bold text-zera-emerald break-all">{clean(viewBook.barcode) || '—'}</p>
                </div>
                <div className="bg-natural-bg rounded-2xl p-4 border border-natural-border">
                  <p className="text-[9px] font-black uppercase tracking-widest text-natural-muted/70 mb-1">Availability</p>
                  <p className="text-sm font-bold text-natural-text">{viewBook.availableCopies} / {viewBook.totalCopies} available</p>
                </div>
                {viewBook.publisher && (
                  <div className="bg-natural-bg rounded-2xl p-4 border border-natural-border">
                    <p className="text-[9px] font-black uppercase tracking-widest text-natural-muted/70 mb-1">Publisher</p>
                    <p className="text-sm font-bold text-natural-text">{clean(viewBook.publisher) || '—'}{viewBook.publishedYear ? ` (${viewBook.publishedYear})` : ''}</p>
                  </div>
                )}
              </div>

              {viewBook.description?.trim() && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-natural-muted/70 mb-2">Synopsis</p>
                  <p className="text-sm text-natural-text leading-relaxed">{viewBook.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
