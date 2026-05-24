import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Book } from '@/src/types';
import { Search, Book as BookIcon, X, Calendar, Barcode, Hash, Copy, Clock, Bookmark, Globe } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { AnimatePresence, motion } from 'motion/react';

const minHeight = (a: number, b: number) => a < b ? a : b;

export const BookGrid = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Show only active books in the public grid
    const q = query(collection(db, 'books'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Book));
      setBooks(booksData.filter(b => b.status !== 'archived'));
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredBooks = books.filter(b => 
    b.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.isbn?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-12">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-5xl font-serif font-black text-zera-emerald mb-6 tracking-tight">Search Collections</h1>
        <form onSubmit={(e) => e.preventDefault()} className="relative group">
          <button 
            type="button"
            onClick={() => document.getElementById('catalog-search')?.focus()}
            className="absolute left-5 top-1/2 -translate-y-1/2 p-1 text-natural-muted group-focus-within:text-zera-emerald transition-colors hover:scale-110"
          >
            <Search className="w-6 h-6" />
          </button>
          <input 
            id="catalog-search"
            type="text" 
            placeholder="Search by title, author, or ISBN barcode..."
            className="w-full pl-14 pr-32 py-5 bg-white border-2 border-natural-border rounded-3xl focus:border-zera-emerald transition-all outline-none shadow-lg text-lg font-bold placeholder:text-natural-muted/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-zera-emerald text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-zera-emerald-dark hover:shadow-xl transition-all shadow-md active:scale-95"
          >
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <div className="w-10 h-10 border-4 border-zera-emerald border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
          {filteredBooks.map((book, i) => (
            <motion.div 
              key={book.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: minHeight(i * 0.03, 0.5) }}
              onClick={() => setSelectedBook(book)}
              className="group cursor-pointer bg-white p-2 rounded-2xl border border-natural-border hover:shadow-xl hover:border-zera-yellow transition-all"
            >
              <div className="aspect-[3/4.2] bg-natural-bg rounded-xl mb-2 overflow-hidden relative shadow-inner border border-natural-border/50">
                <img 
                  src={book.coverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=400&auto=format&fit=crop'} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  alt={book.title}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-1 right-1">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest shadow-sm border",
                    book.availableCopies > 0 
                      ? "bg-zera-emerald text-white border-zera-emerald-dark" 
                      : "bg-red-500 text-white border-red-600"
                  )}>
                    {book.availableCopies > 0 ? 'In' : 'Out'}
                  </span>
                </div>
              </div>
              <h3 className="font-serif text-[11px] font-black text-zera-emerald leading-tight mb-0.5 line-clamp-1">{book.title}</h3>
              <p className="text-[9px] text-natural-muted font-bold truncate opacity-80">{book.author}</p>
              
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[7px] px-1.5 py-0.5 bg-natural-bg rounded text-natural-muted uppercase font-black tracking-widest">
                  {book.category}
                </span>
                <BookIcon className="w-2.5 h-2.5 text-zera-emerald/40 group-hover:text-zera-emerald transition-colors" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Book Detail Modal */}
      <AnimatePresence>
        {selectedBook && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBook(null)}
              className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setSelectedBook(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/80 backdrop-blur-sm rounded-full text-natural-muted hover:text-red-500 hover:scale-110 transition-all shadow-md"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="md:col-span-4 bg-natural-bg p-8 flex items-center justify-center border-r border-natural-border">
                <div className="w-full max-w-[240px] aspect-[3/4.5] rounded-2xl overflow-hidden shadow-2xl border-4 border-white transform hover:rotate-1 transition-transform duration-500">
                  <img 
                    src={selectedBook.coverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600'} 
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
                       Catalogued Asset
                     </span>
                     <span className={cn(
                       "px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] rounded-full shadow-sm border",
                       selectedBook.availableCopies > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                     )}>
                       {selectedBook.availableCopies > 0 ? `${selectedBook.availableCopies} Copies Available` : 'Circulated'}
                     </span>
                  </div>
                  <h2 className="text-3xl lg:text-4xl font-serif font-black text-zera-emerald leading-tight">{selectedBook.title}</h2>
                  <p className="text-lg font-bold text-natural-muted italic">By {selectedBook.author}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-natural-bg p-6 rounded-[24px] border border-natural-border shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                      <Barcode className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">ISBN / Barcode</p>
                      <p className="font-mono text-sm font-bold text-zera-emerald">{selectedBook.isbn} {selectedBook.barcode && ` / ${selectedBook.barcode}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                      <Bookmark className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Classification</p>
                      <p className="text-sm font-bold text-zera-emerald">{selectedBook.series ? `${selectedBook.series} (${selectedBook.category})` : selectedBook.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Publication</p>
                      <p className="text-sm font-bold text-zera-emerald">{selectedBook.publisher} {selectedBook.publishedYear && `(${selectedBook.publishedYear})`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Language & Spec</p>
                      <p className="text-sm font-bold text-zera-emerald">{selectedBook.language} • {selectedBook.pageCount ? `${selectedBook.pageCount}pp` : ''}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-natural-muted mb-1">Abstract</h4>
                   <p className="text-natural-text font-serif leading-relaxed text-base line-clamp-4">
                     {selectedBook.description || `Institutional asset for Zera International School.`}
                   </p>
                </div>

                <div className="pt-4 flex flex-wrap gap-3">
                  <button 
                    onClick={() => {
                      alert("Please visit the Librarian Control Desk to borrow this asset.");
                    }}
                    className="flex-1 min-w-[180px] h-14 bg-zera-emerald text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" /> Borrow Request
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {filteredBooks.length === 0 && !loading && (
        <div className="col-span-full py-24 text-center">
          <div className="w-24 h-24 bg-natural-bg rounded-full flex items-center justify-center mx-auto mb-8 border-4 border-white shadow-sm opacity-50">
            <BookIcon className="w-10 h-10 text-natural-muted" />
          </div>
          <h3 className="text-2xl font-serif font-black text-zera-emerald mb-2">No Records Found</h3>
          <p className="text-natural-muted font-medium">Verify your query or consult the Librarian for physical archive access.</p>
        </div>
      )}
    </div>
  );
};

