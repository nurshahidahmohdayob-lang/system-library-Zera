import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Book } from '@/src/types';
import { Search, Book as BookIcon, BookOpen, X, Calendar, Barcode, Hash, Copy, Clock, Bookmark, BookmarkCheck, Globe, LayoutGrid, List, Sparkles, Loader2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { useUserHolds } from '@/src/hooks/useHolds';
import { HoldService } from '@/src/services/libraryService';

const minHeight = (a: number, b: number) => a < b ? a : b;

// Local, always-available cover placeholder (inline SVG, no network). Used when a
// book has no coverUrl OR when its external cover link fails to load, so every
// book always shows a cover instead of a blank box.
const COVER_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='420' viewBox='0 0 300 420'>` +
  `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#064E3B'/><stop offset='1' stop-color='#059669'/></linearGradient></defs>` +
  `<rect width='300' height='420' fill='url(#g)'/>` +
  `<g fill='none' stroke='#ffffff' stroke-opacity='0.9' stroke-width='9' stroke-linejoin='round' stroke-linecap='round'>` +
  `<path d='M150 148 v128'/><path d='M92 138 q29 -17 58 0 v128 q-29 -17 -58 0 z'/><path d='M208 138 q-29 -17 -58 0 v128 q29 -17 58 0 z'/></g>` +
  `<text x='150' y='352' fill='#F6C445' font-family='Georgia, serif' font-size='19' font-weight='bold' text-anchor='middle'>Zera Library</text>` +
  `</svg>`
)}`;

// Legacy imports set many books' coverUrl to this generic Unsplash stock image
// as a "no cover found" placeholder — it is NOT a real cover, so we ignore it.
const STOCK_PLACEHOLDER_MARKER = 'photo-1543004626-aa121041c291';
const isRealCoverUrl = (url?: string) => !!(url && url.trim() && !url.includes(STOCK_PLACEHOLDER_MARKER));

// Build an Open Library cover URL from an ISBN (empty if no usable ISBN).
// `default=false` makes Open Library 404 when it has no cover, so onError fires.
const olCover = (isbnRaw?: string) => {
  const isbn = (isbnRaw || '').replace(/[^0-9Xx]/gi, '');
  return isbn.length >= 10 ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : '';
};

// The cover to show first: a real stored cover, else an ISBN lookup, else the placeholder.
const initialCover = (book: Book) => (isRealCoverUrl(book.coverUrl) ? book.coverUrl! : (olCover(book.isbn) || COVER_PLACEHOLDER));

// On load failure, try the ISBN lookup (if not already tried), then the local
// placeholder. Guards prevent request loops.
const handleCoverError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (img.dataset.fallback === 'done') return;
  const ol = olCover(img.dataset.isbn);
  if (ol && !img.src.includes('covers.openlibrary.org')) {
    img.src = ol; // book's own cover failed → try Open Library by ISBN
    return;
  }
  img.dataset.fallback = 'done';
  img.src = COVER_PLACEHOLDER;
};

export const BookGrid = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
   const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { profile } = useAuth();
  const isMember = profile?.role === 'student' || profile?.role === 'teacher';
  const userHolds = useUserHolds(isMember ? profile?.uid : undefined);
  const heldBookIds = new Set(
    userHolds.filter(h => h.status === 'pending' || h.status === 'ready').map(h => h.bookId)
  );
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdMsg, setHoldMsg] = useState<string | null>(null);

  // Reset the hold message whenever a different book is opened.
  useEffect(() => { setHoldMsg(null); }, [selectedBook]);

  const handleHold = async (book: Book) => {
    if (!profile) return;
    setHoldLoading(true);
    setHoldMsg(null);
    try {
      const res = await HoldService.requestHold(book, profile);
      setHoldMsg(res === 'duplicate'
        ? 'You already have an active hold on this title.'
        : 'Hold requested — the librarian has been notified.');
    } catch {
      setHoldMsg('Could not place the hold. Please try again.');
    } finally {
      setHoldLoading(false);
    }
  };

  useEffect(() => {
    // Show only active books in the public grid
    const q = query(collection(db, 'books'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Book));
      // Show all active books, ranked so real cover images come first and the
      // no-cover (placeholder) ones fall to the back. Rank: real stored cover (2)
      // > has an ISBN that can resolve a cover (1) > nothing (0). Stable sort
      // keeps the updatedAt order within each rank.
      const coverRank = (b: Book) =>
        isRealCoverUrl(b.coverUrl) ? 2 : (olCover(b.isbn) ? 1 : 0);
      const active = booksData.filter(b => b.status !== 'archived');
      active.sort((a, b) => coverRank(b) - coverRank(a));
      setBooks(active);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);



  const q = searchTerm.trim().toLowerCase();
  const filteredBooks = books.filter(b =>
    b.title?.toLowerCase().includes(q) ||
    b.author?.toLowerCase().includes(q) ||
    b.isbn?.toLowerCase().includes(q) ||
    // Accession number (barcode, e.g. "Zera2661") — exact match so a scan pulls
    // up the one book without prefix noise (scanning "Zera40" won't list "Zera400").
    (q.length > 0 && b.barcode?.toLowerCase() === q)
  );

  // Public catalogue pagination — show 16 books per page, the rest on later pages.
  const PER_PAGE = 16;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PER_PAGE));

  // Whenever the search or the result count shrinks, keep the page in range.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, viewMode]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedBooks = filteredBooks.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const goToPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };



  return (
    <div className="space-y-12">
      <div className="max-w-2xl mx-auto text-center space-y-4">
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
            placeholder="Search or scan by title, author, ISBN, or accession no..."
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



        <div className="flex justify-between items-center bg-white/70 backdrop-blur-sm px-6 py-3 rounded-2xl border border-natural-border shadow-sm">
          <span className="text-xs font-bold text-natural-muted">
            Found {filteredBooks.length} academic holdings
          </span>
          <div className="flex bg-natural-bg p-1 rounded-xl border border-natural-border shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                viewMode === 'grid' 
                  ? "bg-white text-zera-emerald shadow-sm border border-natural-border/40" 
                  : "text-natural-muted hover:text-natural-text"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                viewMode === 'list' 
                  ? "bg-white text-zera-emerald shadow-sm border border-natural-border/40" 
                  : "text-natural-muted hover:text-natural-text"
              )}
            >
              <List className="w-3.5 h-3.5" />
              List View with Summaries
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <div className="w-10 h-10 border-4 border-zera-emerald border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4 animate-in fade-in duration-350">
          {paginatedBooks.map((book, i) => {
            const isAbstractAvailable = book.description &&
              book.description !== 'Institutional asset for Zera Education.' && 
              book.description !== 'No explicit abstract provided for this asset.' && 
              !book.description.startsWith('Institutional archive record for') &&
              book.description.length >= 15;

            return (
              <motion.div 
                key={book.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: minHeight(i * 0.03, 0.5) }}
                onClick={() => setSelectedBook(book)}
                className="group cursor-pointer bg-white p-2 rounded-2xl border border-natural-border hover:shadow-xl hover:border-zera-yellow transition-all"
                title={isAbstractAvailable ? `Abstract: ${book.description}` : "Click to view scholastic catalog metadata"}
              >
                <div className="aspect-[3/4.2] bg-natural-bg rounded-xl mb-2 overflow-hidden relative shadow-inner border border-natural-border/50">
                  <img
                    src={initialCover(book)}
                    data-isbn={book.isbn}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    alt={book.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={handleCoverError}
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
                <p className="text-[9px] text-natural-muted font-bold truncate opacity-80">By {book.author}</p>
                
                <div className="mt-1.5 flex items-center justify-between">
                  <span className={cn(
                    "text-[7px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest flex items-center gap-0.5",
                    "bg-natural-bg text-natural-muted font-black"
                  )}>
                    {book.category}
                  </span>
                  <BookIcon className="w-2.5 h-2.5 text-zera-emerald/40 group-hover:text-zera-emerald transition-colors" />
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in duration-350">
          {paginatedBooks.map((book, i) => {
            const hasRealDesc = book.description &&
              book.description !== 'Institutional asset for Zera Education.' && 
              book.description !== 'No explicit abstract provided for this asset.' && 
              !book.description.startsWith('Institutional archive record for');
            
            return (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: minHeight(i * 0.04, 0.4) }}
                onClick={() => setSelectedBook(book)}
                className="group cursor-pointer bg-white p-5 rounded-[24px] border border-natural-border hover:shadow-xl hover:border-zera-yellow transition-all flex flex-col sm:flex-row gap-6 items-start"
              >
                <div className="w-20 h-28 bg-natural-bg rounded-xl overflow-hidden shrink-0 border border-natural-border relative shadow-sm">
                  <img
                    src={initialCover(book)}
                    data-isbn={book.isbn}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    alt={book.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={handleCoverError}
                  />
                  <div className="absolute top-1 right-1">
                    <span className={cn(
                      "px-1 py-0.5 rounded-md text-[5px] font-black uppercase tracking-widest shadow-sm",
                      book.availableCopies > 0 ? "bg-zera-emerald text-white" : "bg-red-500 text-white"
                    )}>
                      {book.availableCopies > 0 ? 'In' : 'Out'}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-serif text-lg font-black text-zera-emerald leading-tight">{book.title}</h3>
                      <span className="text-[8px] px-2 py-0.5 bg-natural-bg border border-natural-border rounded-full text-natural-muted font-bold uppercase tracking-widest">
                        {book.category}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-natural-muted mt-1">By {book.author} {book.publisher && `• Publisher: ${book.publisher}`}</p>
                  </div>

                  <div className="text-xs text-natural-text font-serif leading-relaxed line-clamp-3 bg-natural-bg/45 p-3 rounded-xl border border-natural-border/30">
                    {book.description || 'Institutional asset for Zera Education.'}
                  </div>


                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination — 16 books per page */}
      {!loading && filteredBooks.length > PER_PAGE && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2.5 bg-white border border-natural-border rounded-xl text-xs font-black uppercase tracking-wider text-natural-text shadow-sm hover:border-zera-emerald/40 hover:text-zera-emerald transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>

            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => {
                const prev = arr[idx - 1];
                const gap = prev && p - prev > 1;
                return (
                  <React.Fragment key={p}>
                    {gap && <span className="px-1.5 text-natural-muted font-black select-none">…</span>}
                    <button
                      type="button"
                      onClick={() => goToPage(p)}
                      className={cn(
                        "min-w-[2.5rem] px-3 py-2.5 rounded-xl text-xs font-black tabular-nums shadow-sm border transition-all",
                        p === page
                          ? "bg-zera-emerald text-white border-zera-emerald-dark"
                          : "bg-white text-natural-text border-natural-border hover:border-zera-emerald/40 hover:text-zera-emerald"
                      )}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                );
              })}

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-4 py-2.5 bg-white border border-natural-border rounded-xl text-xs font-black uppercase tracking-wider text-natural-text shadow-sm hover:border-zera-emerald/40 hover:text-zera-emerald transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-[11px] font-bold text-natural-muted">
            Page {page} of {totalPages} · showing {paginatedBooks.length} of {filteredBooks.length} holdings
          </span>
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
                    src={initialCover(selectedBook)}
                    data-isbn={selectedBook.isbn}
                    className="w-full h-full object-cover"
                    alt="Cover"
                    referrerPolicy="no-referrer"
                    onError={handleCoverError}
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
                      <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">ISBN / Accession No.</p>
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
                  {selectedBook.lexileLevel && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-zera-emerald">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-natural-muted/60 mb-0.5">Lexile Reading Level</p>
                        <p className="text-sm font-bold text-zera-emerald font-mono">{selectedBook.lexileLevel}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                   <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-natural-muted mb-1">Abstract</h4>
                   <p className="text-natural-text font-serif leading-relaxed text-base">
                     {selectedBook.description || `Institutional asset for Zera Education.`}
                   </p>
                </div>

                <div className="pt-4 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {isMember ? (
                      heldBookIds.has(selectedBook.id) ? (
                        <button
                          disabled
                          className="flex-1 min-w-[180px] h-14 bg-emerald-50 text-zera-emerald border-2 border-emerald-200 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-default"
                        >
                          <BookmarkCheck className="w-4 h-4" /> Hold Requested
                        </button>
                      ) : (
                        <button
                          onClick={() => handleHold(selectedBook)}
                          disabled={holdLoading}
                          className="flex-1 min-w-[180px] h-14 bg-zera-emerald text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl hover:scale-[1.01] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                        >
                          {holdLoading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing Hold…</>
                            : <><Bookmark className="w-4 h-4" /> Hold this Book</>}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => alert('Sign in via the Member Portal (or through Commun) to place a hold on this title.')}
                        className="flex-1 min-w-[180px] h-14 bg-zera-emerald text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                      >
                        <Copy className="w-4 h-4" /> Sign in to Hold
                      </button>
                    )}
                  </div>
                  {holdMsg && (
                    <div className="flex items-center gap-2 text-xs font-bold text-zera-emerald bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{holdMsg}</span>
                    </div>
                  )}
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

