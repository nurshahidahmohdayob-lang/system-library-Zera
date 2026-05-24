import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Loader2, 
  Trash2, 
  Save, 
  History,
  Info,
  PackageCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { Book } from '@/src/types';

interface AuditedItem {
  id: string;
  bookId: string;
  title: string;
  author: string;
  barcode: string;
  scanTime: Date;
  status: 'verified' | 'missing' | 'damaged' | 'wrong-location' | 'lost-auto';
  notes?: string;
}

export const InventoryAudit = () => {
  const [barcode, setBarcode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [scannedItems, setScannedItems] = useState<AuditedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<Book | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastAuditSummary, setLastAuditSummary] = useState<{scanned: number, lost: number} | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Keep focus on barcode input for convenience
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [scannedItems.length, lastScanned]);

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcode.trim()) return;

    setIsSearching(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // Find book by barcode or ID
      // Some barcodes might be ISBN or custom internal IDs
      const booksRef = collection(db, 'books');
      const q = query(booksRef, where('barcode', '==', barcode.trim()));
      const querySnapshot = await getDocs(q);

      let foundBook: Book | null = null;

      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        foundBook = { id: doc.id, ...doc.data() } as Book;
      } else {
        // Try getting by document ID directly if no barcode match
        try {
          const docRef = doc(db, 'books', barcode.trim());
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            foundBook = { id: docSnap.id, ...docSnap.data() } as Book;
          }
        } catch (err) {
          // Silent fail for ID lookup if it's not a valid doc ID format
        }
      }

      if (foundBook) {
        // Check if already in scanned list
        const alreadyScanned = scannedItems.find(item => item.bookId === foundBook!.id);
        
        if (alreadyScanned) {
          setError(`"${foundBook.title}" is already in the current audit list.`);
        } else {
          const newItem: AuditedItem = {
            id: crypto.randomUUID(),
            bookId: foundBook.id,
            title: foundBook.title,
            author: foundBook.author,
            barcode: barcode.trim(),
            scanTime: new Date(),
            status: 'verified'
          };
          setScannedItems([newItem, ...scannedItems]);
          setLastScanned(foundBook);
          setBarcode('');
        }
      } else {
        setError(`No book found for identifier: ${barcode}`);
      }
    } catch (err) {
      console.error("Scan error:", err);
      setError("An error occurred during scanning. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const removeScannedItem = (id: string) => {
    setScannedItems(scannedItems.filter(item => item.id !== id));
  };

  const updateItemStatus = (id: string, status: AuditedItem['status']) => {
    setScannedItems(scannedItems.map(item => 
      item.id === id ? { ...item, status } : item
    ));
  };

  const handleFinishAudit = async () => {
    if (scannedItems.length === 0) {
      setError("Cannot save an empty audit session.");
      return;
    }

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Fetch all books from catalog
      const booksSnap = await getDocs(collection(db, 'books'));
      const allBooks = booksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
      
      // 2. Fetch all active loans
      const loansSnap = await getDocs(query(collection(db, 'loans'), where('status', '==', 'active')));
      const activeLoanBookIds = new Set(loansSnap.docs.map(d => d.data().bookId));
      
      // 3. Identify scanned book IDs
      const scannedBookIds = new Set(scannedItems.map(item => item.bookId));
      
      // 4. Identify books that are NOT scanned AND NOT borrowed
      const missingBooks = allBooks.filter(book => 
        !scannedBookIds.has(book.id) && !activeLoanBookIds.has(book.id) && book.status !== 'lost'
      );

      // Create entries for the missing books in the session history
      const autoLostItems = missingBooks.map(book => ({
        bookId: book.id,
        title: book.title,
        barcode: book.barcode || book.isbn || 'No Barcode',
        status: 'lost-auto' as const,
        scanTime: new Date().toISOString()
      }));

      // Update the status of missing books to 'lost' in the database
      missingBooks.forEach(book => {
        batch.update(doc(db, 'books', book.id), { 
          status: 'lost',
          updatedAt: new Date().toISOString()
        });
      });

      // 5. Save the inventory session record
      await addDoc(collection(db, 'inventory_sessions'), {
        items: [
          ...scannedItems.map(item => ({
            bookId: item.bookId,
            title: item.title,
            barcode: item.barcode,
            status: item.status,
            scanTime: item.scanTime.toISOString()
          })),
          ...autoLostItems
        ],
        totalScanned: scannedItems.length,
        totalAutoLost: missingBooks.length,
        timestamp: serverTimestamp(),
        type: 'shelf-audit'
      });
      
      // Commit book status updates
      if (missingBooks.length > 0) {
        await batch.commit();
      }
      
      setScannedItems([]);
      setLastScanned(null);
      setLastAuditSummary({ scanned: scannedItems.length, lost: missingBooks.length });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setLastAuditSummary(null);
      }, 8000);
    } catch (err) {
      console.error("Save audit error:", err);
      setError("Failed to verify catalog and save session. Check permissions.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-zera-yellow/20 rounded-2xl">
            <PackageCheck className="w-6 h-6 text-zera-emerald" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-black text-zera-emerald tracking-tight">Inventory Audit Tool</h1>
            <p className="text-xs font-bold text-natural-muted uppercase tracking-widest mt-1">Stock verification & shelf scanning</p>
          </div>
        </div>
        
        {scannedItems.length > 0 && (
          <button
            onClick={handleFinishAudit}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-zera-emerald text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zera-emerald-dark transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Session ({scannedItems.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanner Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-natural-text mb-4 uppercase tracking-tighter">1. Scan or Input Identifier</h2>
            <form onSubmit={handleScan} className="space-y-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan barcode or type book ID..."
                  className="w-full bg-natural-bg border-2 border-natural-border focus:border-zera-yellow rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-zera-emerald outline-none transition-all placeholder:text-natural-muted/50"
                />
                <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-muted" />
              </div>
              <button
                type="submit"
                disabled={isSearching || !barcode.trim()}
                className="w-full py-4 bg-zera-yellow text-zera-emerald font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all active:translate-y-0 disabled:opacity-50 disabled:grayscale"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Manual Validate'}
              </button>
            </form>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2 text-red-600"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] font-bold leading-tight">{error}</p>
                </motion.div>
              )}

              {saveSuccess && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2"
                >
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    <p className="text-xs font-black uppercase tracking-tight">Audit Session Finalized</p>
                  </div>
                  {lastAuditSummary && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                       <div className="bg-white p-2 rounded-xl border border-emerald-100">
                          <p className="text-[10px] text-natural-muted font-bold uppercase">Scanned</p>
                          <p className="text-lg font-black text-emerald-600">{lastAuditSummary.scanned}</p>
                       </div>
                       <div className="bg-white p-2 rounded-xl border border-emerald-100">
                          <p className="text-[10px] text-natural-muted font-bold uppercase">Lost Flagged</p>
                          <p className="text-lg font-black text-red-500">{lastAuditSummary.lost}</p>
                       </div>
                    </div>
                  )}
                  <p className="text-[9px] text-emerald-600/70 font-bold italic">Session logged in system archives.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-zera-emerald text-white rounded-3xl p-6 relative overflow-hidden">
            <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2">Instructions</h3>
            <ul className="text-[10px] font-bold space-y-2 relative z-10">
              <li className="flex gap-2">
                <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">1</span>
                Scan the barcode on the back of the book or inside cover.
              </li>
              <li className="flex gap-2">
                <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">2</span>
                The item will appear in the "Recently Audited" list.
              </li>
              <li className="flex gap-2">
                <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">3</span>
                Update status if the book is damaged or in the wrong place.
              </li>
              <li className="flex gap-2">
                <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">4</span>
                Click "Save Session" when the shelf audit is complete.
              </li>
              <li className="flex gap-2 pt-2 border-t border-white/10 mt-2">
                <Info className="w-4 h-4 text-zera-yellow shrink-0" />
                <span className="text-zera-yellow italic">Tip: Books not scanned and not borrowed will be auto-flagged as LOST.</span>
              </li>
            </ul>
            <Barcode className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 rotate-12 pointer-events-none" />
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Last Scanned Quick View */}
          <AnimatePresence>
            {lastScanned && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-6 flex items-center gap-6"
              >
                <img 
                  src={lastScanned.coverUrl} 
                  alt={lastScanned.title} 
                  className="w-16 h-24 object-cover rounded-md shadow-md border-2 border-white"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Scan Successful</span>
                  </div>
                  <h3 className="text-lg font-bold text-zera-emerald leading-tight">{lastScanned.title}</h3>
                  <p className="text-xs text-natural-muted font-bold italic">{lastScanned.author}</p>
                  <div className="flex gap-4 mt-3">
                    <div className="text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-emerald-100">
                      ID: <span className="text-zera-emerald">{lastScanned.id}</span>
                    </div>
                    <div className="text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-emerald-100">
                      Barcode: <span className="text-zera-emerald">{lastScanned.barcode || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scanned List */}
          <div className="bg-white border border-natural-border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-natural-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-natural-muted" />
                <h2 className="font-bold text-sm">Session Scans</h2>
              </div>
              <span className="text-[10px] font-black bg-natural-bg px-3 py-1 rounded-full text-zera-emerald uppercase tracking-tighter">
                {scannedItems.length} Items Audited
              </span>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              {scannedItems.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-natural-bg sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-[10px] font-black text-natural-muted uppercase tracking-widest">Book Details</th>
                      <th className="px-6 py-3 text-[10px] font-black text-natural-muted uppercase tracking-widest">Time</th>
                      <th className="px-6 py-3 text-[10px] font-black text-natural-muted uppercase tracking-widest">Status</th>
                      <th className="px-6 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-natural-border">
                    {scannedItems.map((item) => (
                      <motion.tr 
                        layout
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-natural-bg/30 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-xs font-bold text-zera-emerald">{item.title}</p>
                            <p className="text-[9px] text-natural-muted font-bold tracking-tight mt-0.5">{item.barcode}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[10px] font-bold text-natural-muted">
                          {item.scanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={item.status}
                            onChange={(e) => updateItemStatus(item.id, e.target.value as any)}
                            className={cn(
                              "text-[9px] font-black uppercase tracking-tighter px-2 py-1 rounded-lg border outline-none cursor-pointer transition-all",
                              item.status === 'verified' && "bg-emerald-50 text-emerald-600 border-emerald-100",
                              item.status === 'missing' && "bg-red-50 text-red-600 border-red-100",
                              item.status === 'damaged' && "bg-orange-50 text-orange-600 border-orange-100",
                              item.status === 'wrong-location' && "bg-indigo-50 text-indigo-600 border-indigo-100",
                              item.status === 'lost-auto' && "bg-zinc-800 text-white border-zinc-900"
                            )}
                          >
                            <option value="verified">Verified</option>
                            <option value="missing">Missing</option>
                            <option value="damaged">Damaged</option>
                            <option value="wrong-location">Wrong Location</option>
                            <option value="lost-auto" disabled>Lost (Auto-flagged)</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => removeScannedItem(item.id)}
                            className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                  <div className="p-4 bg-natural-bg rounded-2xl mb-4">
                    <Barcode className="w-8 h-8 text-natural-muted/30" />
                  </div>
                  <h4 className="font-bold text-natural-text text-sm">No items scanned yet</h4>
                  <p className="text-[10px] text-natural-muted font-bold max-w-xs mt-2 uppercase tracking-wide">
                    Start by scanning a book barcode or entering an ID in the input panel to begin your inventory session.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
