import React, { useState, useEffect } from 'react';
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
  Archive
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, limit, startAfter, getDoc, onSnapshot, where } from 'firebase/firestore';
import { Book } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { lookupBookByIsbn } from '@/src/services/catalogService';
import { BarcodeService } from '@/src/services/BarcodeService';
import { Sparkles } from 'lucide-react';

export const CatalogManager = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookForView, setSelectedBookForView] = useState<Book | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
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
    totalCopies: 1,
    availableCopies: 1,
    coverUrl: ''
  });

  useEffect(() => {
    // Fetch all books and filter in-memory to ensure visibility of un-migrated records
    const q = query(collection(db, 'books'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allBooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
      // Show books that are active or haven't been assigned a status yet (new registrations default to active)
      const activeBooks = allBooks.filter(book => book.status !== 'archived');
      setBooks(activeBooks.sort((a, b) => (a.title || '').localeCompare(b.title || '')));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleIsbnLookup = async () => {
    if (!newBook.isbn) return;
    setIsSearching(true);
    try {
      const data = await lookupBookByIsbn(newBook.isbn);
      if (data) {
        setNewBook(prev => ({ ...prev, ...data }));
      } else {
        alert("Metadata not found for this ISBN. Please enter details manually.");
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
      alert("Failed to generate sequence barcode.");
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
      if (editingBook) {
        await updateDoc(doc(db, 'books', editingBook.id), {
          ...newBook,
          updatedAt: now
        });
        setEditingBook(null);
      } else {
        await addDoc(collection(db, 'books'), {
          ...newBook,
          availableCopies: newBook.totalCopies,
          status: 'active',
          createdAt: now,
          updatedAt: now
        });
      }
      
      // Close modal and clear data ONLY after successful save
      setIsAdding(false);
      setNewBook({ 
        title: '', author: '', series: '', isbn: '', barcode: '', category: 'Fiction', 
        description: '', publisher: '', publishedYear: new Date().getFullYear(),
        language: 'English', pageCount: 0, dimensions: '',
        totalCopies: 1, availableCopies: 1, coverUrl: '' 
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
      totalCopies: book.totalCopies,
      availableCopies: book.availableCopies,
      coverUrl: book.coverUrl
    });
    setIsAdding(true);
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

  const totalPages = Math.ceil(books.length / itemsPerPage);
  const paginatedBooks = books.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end border-b border-natural-border pb-6">
        <div>
          <h2 className="font-serif text-3xl font-bold text-natural-text">Catalogue Management</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-natural-muted font-medium italic">Zera International Library System</p>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zera-emerald/10 rounded-full border border-zera-emerald/20 shadow-inner">
              <div className="w-1.5 h-1.5 bg-zera-emerald rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              <span className="text-[10px] font-black text-zera-emerald uppercase tracking-widest">Active Z39.50 Connection</span>
            </div>
          </div>
        </div>
        <button 
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

      {isAdding && (
        <form onSubmit={handleSave} className="p-8 bg-white border-2 border-zera-emerald/30 rounded-3xl shadow-lg grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-4">
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
                        required
                        placeholder="ISBN-10 or ISBN-13"
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
                  <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">System Barcode (Asset ID)</label>
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
                      title="Generate Zera Serial"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-[9px] font-bold text-zera-emerald uppercase tracking-tighter">Metadata sync enabled via ISBN lookup</p>
             </div>
             
             <div className="aspect-[3/4] bg-natural-bg rounded-2xl overflow-hidden relative border-2 border-dashed border-natural-border flex items-center justify-center">
               {newBook.coverUrl ? (
                 <img src={newBook.coverUrl} alt="Preview" className="w-full h-full object-cover" />
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
                <input 
                  required
                  placeholder="Official Title"
                  className="w-full p-3 bg-natural-bg border border-natural-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zera-emerald text-natural-text font-bold" 
                  value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Primary Author</label>
                <input 
                  required
                  placeholder="Full Name"
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
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                  value={newBook.publishedYear} onChange={e => setNewBook({...newBook, publishedYear: parseInt(e.target.value)})}
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
                  value={newBook.pageCount} onChange={e => setNewBook({...newBook, pageCount: parseInt(e.target.value)})}
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
                  value={newBook.totalCopies} onChange={e => setNewBook({...newBook, totalCopies: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Book Synopsis</label>
              <textarea 
                rows={3}
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

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-3xl border border-natural-border shadow-sm">
         <div className="flex items-center gap-4 bg-natural-bg px-4 py-2 rounded-2xl">
            <div className="flex items-center gap-2 text-[10px] font-black text-zera-emerald uppercase tracking-widest">
              <div className="w-2 h-2 bg-zera-emerald rounded-full animate-pulse"></div>
              {books.length} Catalogue entries
            </div>
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
              <th className="px-8 py-5">Barcode</th>
              <th className="px-8 py-5">ISBN</th>
              <th className="px-8 py-5">Title & Author</th>
              <th className="px-8 py-5">Category</th>
              <th className="px-8 py-5">Availability</th>
              <th className="px-8 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-natural-bg">
            {paginatedBooks.map(book => (
              <tr 
                key={book.id} 
                onClick={() => setSelectedBookForView(book)}
                className="hover:bg-natural-bg/40 transition-colors group cursor-pointer"
              >
                <td className="px-8 py-5 font-mono text-[10px] text-natural-muted uppercase font-bold tracking-tighter">
                  <div className="text-zera-emerald">{book.barcode || `ZERA-${book.isbn.slice(-6)}`}</div>
                </td>
                <td className="px-8 py-5 font-mono text-[10px] text-natural-muted uppercase font-bold tracking-tighter">
                  <div className="opacity-60 font-medium">{book.isbn}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex gap-4 items-center">
                    <div className="w-10 h-12 bg-natural-bg rounded-lg border border-natural-border overflow-hidden shrink-0 shadow-sm transition-transform group-hover:scale-110">
                      <img src={book.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-black text-natural-text group-hover:text-zera-emerald transition-colors leading-tight">{book.title}</div>
                      <div className="text-[10px] text-natural-muted font-bold uppercase tracking-wider mt-0.5">{book.author}</div>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-widest px-2.5 py-1 bg-natural-bg rounded-lg border border-natural-border">{book.category}</span>
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
            Inventory records empty for this section.
          </div>
        )}
      </div>
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
                <p className="text-lg font-bold text-natural-muted italic">By {selectedBookForView.author}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-natural-bg p-6 rounded-[24px] border border-natural-border shadow-inner">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald shrink-0">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">System Barcode</p>
                    <p className="font-mono text-sm font-bold text-zera-emerald">{selectedBookForView.barcode || 'NO-BARCODE'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald shrink-0">
                    <BookIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">ISBN (Standard ID)</p>
                    <p className="font-mono text-sm font-bold text-zera-emerald">{selectedBookForView.isbn}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <RefreshCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Publication</p>
                    <p className="text-sm font-bold text-zera-emerald">{selectedBookForView.publisher} {selectedBookForView.publishedYear && `(${selectedBookForView.publishedYear})`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                    <Save className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Physical Spec</p>
                    <p className="text-sm font-bold text-zera-emerald">{selectedBookForView.pageCount ? `${selectedBookForView.pageCount}pp` : ''} {selectedBookForView.dimensions} {selectedBookForView.language}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-natural-muted mb-1">Administrative Description</h4>
                 <p className="text-natural-text font-serif leading-relaxed text-base">
                   {selectedBookForView.description || `No explicit abstract provided for this asset.`}
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
    </div>
  );
};
