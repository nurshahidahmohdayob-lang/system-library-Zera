import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Barcode as BarcodeIcon, 
  Printer, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Book,
  User,
  GraduationCap,
  Save,
  RefreshCw,
  Copy,
  RotateCcw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, getDocs, updateDoc, doc, where, limit, writeBatch, setDoc, addDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { BarcodeService, BarcodeType } from '@/src/services/BarcodeService';
import Barcode from 'react-barcode';
import { cn } from '@/src/lib/utils';

type EntityType = 'book' | 'student' | 'teacher';

const mapEntityTypeToBarcodeType = (type: EntityType): BarcodeType => {
  if (type === 'teacher') return 'staff';
  return type as BarcodeType;
};

interface SelectableEntity {
  id: string;
  title?: string; // for books
  name?: string;  // for users
  role?: string;
  barcode?: string;
  type: EntityType;
}

export const BarcodeStudio = () => {
  const [activeType, setActiveType] = useState<EntityType>('book');
  const [searchTerm, setSearchTerm] = useState('');
  const [entities, setEntities] = useState<SelectableEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [nextPreview, setNextPreview] = useState('');
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<{ done: number; total: number } | null>(null);
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  // Quick "new book → assign barcode" form (book tab only).
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookIsbn, setNewBookIsbn] = useState('');
  const [creatingBook, setCreatingBook] = useState(false);
  const [lastCreated, setLastCreated] = useState<SelectableEntity | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchEntities();
    loadNextPreview();
  }, [activeType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeType, searchTerm]);

  const searchQuery = searchTerm.trim().toLowerCase();
  // A full accession number (e.g. "zera40") matches a barcode EXACTLY so it never
  // also lists "zera400".."zera409"; anything else is a partial name/barcode search.
  const isAccessionSearch = /^zera(student|staff)?\d+$/i.test(searchQuery);
  const filteredEntities = entities.filter(e =>
    isAccessionSearch
      ? (e.barcode || '').toLowerCase() === searchQuery
      : (e.title || e.name || '').toLowerCase().includes(searchQuery) ||
        (e.barcode || '').toLowerCase().includes(searchQuery)
  );

  const totalPages = Math.ceil(filteredEntities.length / itemsPerPage);
  const paginatedEntities = filteredEntities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    const currentPageIds = paginatedEntities.map(e => e.id);
    const allSelectedOnPage = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
    
    const next = new Set(selectedIds);
    if (allSelectedOnPage) {
      currentPageIds.forEach(id => next.delete(id));
    } else {
      currentPageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const handlePrintBulk = () => {
    const itemsToPrint = entities.filter(e => selectedIds.has(e.id) && e.barcode);
    if (itemsToPrint.length === 0) {
      setStatus({ type: 'error', message: 'No items with barcodes selected.' });
      return;
    }
    
    printBarcodes(itemsToPrint);
  };

  const printBarcodes = (items: SelectableEntity[], preOpened?: Window | null) => {
    // Reuse a window opened synchronously in the click handler (avoids popup
    // blocking when the caller had to await data first); otherwise open now.
    const printWindow = preOpened ?? window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      setStatus({
        type: 'error',
        message: 'Popup blocked! Please allow popups to print barcodes.'
      });
      return;
    }

    const itemsHtml = items.map(item => `
      <div class="label">
        <div class="name">${item.title || item.name}</div>
        <div class="barcode-container" data-code="${item.barcode}"></div>
        <div class="code">${item.barcode}</div>
      </div>
    `).join('');

    const barcodeHtml = `
      <html>
        <head>
          <title>Print Barcodes Bundle</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            @page {
              size: A4;
              margin: 8mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: 'Inter', sans-serif;
              background: white;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, 30mm);
              gap: 2mm;
              justify-content: center;
            }
            /* Each label is a fixed 30mm x 15mm sticker */
            .label {
              width: 30mm;
              height: 15mm;
              box-sizing: border-box;
              text-align: center;
              padding: 0.8mm;
              border: 0.2mm solid #e4e4e7;
              border-radius: 1mm;
              break-inside: avoid;
              background: white;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .name {
              font-size: 4.5pt;
              line-height: 1.05;
              font-weight: 700;
              color: #18181b;
              max-width: 100%;
              /* Show the full title — wrap onto as many lines as needed */
              white-space: normal;
              word-break: break-word;
              overflow-wrap: anywhere;
            }
            .barcode-container {
              margin: 0.3mm 0;
            }
            .barcode-container canvas {
              width: 27mm !important;
              height: 6mm !important;
              display: block;
            }
            .code {
              font-size: 4.5pt;
              line-height: 1;
              font-weight: 700;
              letter-spacing: 0.05em;
              color: #52525b;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${itemsHtml}
          </div>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            window.onload = function() {
              const containers = document.querySelectorAll('.barcode-container');
              containers.forEach(container => {
                const code = container.getAttribute('data-code');
                const canvas = document.createElement('canvas');
                JsBarcode(canvas, code, {
                  format: "CODE128",
                  width: 2,
                  height: 60,
                  displayValue: false,
                  margin: 0
                });
                container.appendChild(canvas);
              });
              
              setTimeout(() => {
                window.print();
                window.onafterprint = () => window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(barcodeHtml);
    printWindow.document.close();
  };

  const loadNextPreview = async () => {
    try {
      const barcodeType = mapEntityTypeToBarcodeType(activeType);
      const next = await BarcodeService.peekNextBarcode(barcodeType);
      setNextPreview(next);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEntities = async () => {
    setIsLoading(true);
    try {
      if (activeType === 'book') {
        const q = query(collection(db, 'books'), limit(100));
        const snap = await getDocs(q);
        setEntities(snap.docs.map(d => ({ 
          id: d.id, 
          title: d.data().title, 
          barcode: d.data().barcode,
          type: 'book' 
        })));
      } else {
        const q = query(
          collection(db, 'users'), 
          where('role', '==', activeType),
          limit(100)
        );
        const snap = await getDocs(q);
        setEntities(snap.docs.map(d => ({ 
          id: d.id, 
          name: d.data().name, 
          barcode: d.data().barcode,
          role: d.data().role,
          type: activeType 
        })));
      }
      setSelectedIds(new Set()); // Reset on tab change
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async (entity: SelectableEntity) => {
    setIsGenerating(entity.id);
    try {
      const collectionName = entity.type === 'book' ? 'books' : 'users';
      await updateDoc(doc(db, collectionName, entity.id), {
        barcode: null
      });
      
      setEntities(prev => prev.map(e => e.id === entity.id ? { ...e, barcode: undefined } : e));
      setStatus({ type: 'success', message: `Barcode cleared for ${entity.title || entity.name}` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to clear barcode.' });
    } finally {
      setIsGenerating(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  // Bulk reset: clear every active accession number for the current tab's type
  // and reset that sequence's counter back to zero (next issued = Zera01).
  const handleResetAll = async () => {
    setShowResetConfirm(false);
    setIsResetting(true);
    try {
      // Fetch the full set for this type (not just the paginated/limited view).
      const snap = activeType === 'book'
        ? await getDocs(collection(db, 'books'))
        : await getDocs(query(collection(db, 'users'), where('role', '==', activeType)));

      const docsToClear = snap.docs.filter(d => {
        const v = d.data().barcode;
        return v !== null && v !== undefined && v !== '';
      });

      // Clear barcodes in batches (Firestore caps a batch at 500 writes).
      for (let i = 0; i < docsToClear.length; i += 400) {
        const batch = writeBatch(db);
        docsToClear.slice(i, i + 400).forEach(d => batch.update(d.ref, { barcode: null }));
        await batch.commit();
      }

      // Reset the sequence counter so the next issued number restarts at 01.
      const barcodeType = mapEntityTypeToBarcodeType(activeType);
      await setDoc(doc(db, `counters/barcodes_${barcodeType}`), { value: 0 });

      await fetchEntities();
      await loadNextPreview();

      const n = docsToClear.length;
      setStatus({
        type: 'success',
        message: `Reset complete — cleared ${n} ${activeType} ${codeNoun.toLowerCase()}${n === 1 ? '' : 's'} and restarted the sequence at 01.`
      });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to reset accession numbers.' });
    } finally {
      setIsResetting(false);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  // Bulk generate: assign an accession number to every entity of the current
  // tab's type that does not have one yet. Existing barcodes are left untouched,
  // so re-clicking only fills in the gaps.
  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      const snap = activeType === 'book'
        ? await getDocs(collection(db, 'books'))
        : await getDocs(query(collection(db, 'users'), where('role', '==', activeType)));

      const missing = snap.docs.filter(d => {
        const v = d.data().barcode;
        return v === null || v === undefined || v === '';
      });

      if (missing.length === 0) {
        setStatus({ type: 'success', message: `Every ${activeType} already has ${codeNoun === 'Accession No.' ? 'an accession number' : 'a barcode'}.` });
        return;
      }

      const barcodeType = mapEntityTypeToBarcodeType(activeType);
      const collectionName = activeType === 'book' ? 'books' : 'users';

      // Sequential: each number depends on the previous one being committed
      // (the counter increments / lowest-unused scan must see the prior write).
      let done = 0;
      setGenerateProgress({ done: 0, total: missing.length });
      for (const d of missing) {
        const newBarcode = await BarcodeService.generateNextBarcode(barcodeType);
        await updateDoc(doc(db, collectionName, d.id), { barcode: newBarcode });
        done++;
        setGenerateProgress({ done, total: missing.length });
      }

      await fetchEntities();
      await loadNextPreview();
      setStatus({ type: 'success', message: `Generated ${done} ${activeType} ${codeNoun.toLowerCase()}${done === 1 ? '' : 's'}.` });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to generate barcodes for all.' });
    } finally {
      setIsGeneratingAll(false);
      setGenerateProgress(null);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleGenerate = async (entity: SelectableEntity) => {
    setIsGenerating(entity.id);
    try {
      const barcodeType = mapEntityTypeToBarcodeType(entity.type);
      const newBarcode = await BarcodeService.generateNextBarcode(barcodeType);
      const collectionName = entity.type === 'book' ? 'books' : 'users';
      await updateDoc(doc(db, collectionName, entity.id), {
        barcode: newBarcode
      });
      
      // Update local state
      setEntities(prev => prev.map(e => e.id === entity.id ? { ...e, barcode: newBarcode } : e));
      setStatus({ type: 'success', message: `Barcode ${newBarcode} assigned to ${entity.title || entity.name}` });
      loadNextPreview();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to generate barcode.' });
    } finally {
      setIsGenerating(null);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  // Create a brand-new book record and assign it the next accession number in
  // one step, so a physical new book can be catalogued and barcoded right here.
  const handleCreateBookWithBarcode = async () => {
    const title = newBookTitle.trim();
    if (!title) {
      setStatus({ type: 'error', message: 'Enter a book title first.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setCreatingBook(true);
    setLastCreated(null);
    try {
      const newBarcode = await BarcodeService.generateNextBarcode('book');
      const now = new Date().toISOString();
      const ref = await addDoc(collection(db, 'books'), {
        title,
        author: '',
        isbn: newBookIsbn.trim(),
        barcode: newBarcode,
        category: 'Uncategorised',
        description: '',
        coverUrl: '',
        totalCopies: 1,
        availableCopies: 1,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      const created: SelectableEntity = { id: ref.id, title, barcode: newBarcode, type: 'book' };
      // Show it at the top of the list right away.
      setEntities(prev => [created, ...prev.filter(e => e.id !== ref.id)]);
      setLastCreated(created);
      setNewBookTitle('');
      setNewBookIsbn('');
      setStatus({ type: 'success', message: `Created “${title}” and assigned accession no. ${newBarcode}.` });
      loadNextPreview();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to create the book. Are you signed in as an admin?' });
    } finally {
      setCreatingBook(false);
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handlePrint = (item: SelectableEntity) => {
    if (!item.barcode) return;
    printBarcodes([item]);
  };

  // Print every barcode for the current tab's type (full set, not just the
  // visible page). The window is opened up-front so the async fetch below
  // doesn't get caught by the popup blocker.
  const handlePrintAll = async () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      setStatus({ type: 'error', message: 'Popup blocked! Please allow popups to print barcodes.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    printWindow.document.write('<p style="font-family:sans-serif;padding:40px;color:#52525b">Preparing barcodes…</p>');

    setIsPrintingAll(true);
    try {
      const snap = activeType === 'book'
        ? await getDocs(collection(db, 'books'))
        : await getDocs(query(collection(db, 'users'), where('role', '==', activeType)));

      const items: SelectableEntity[] = snap.docs
        .filter(d => !!d.data().barcode)
        .map(d => {
          const data = d.data();
          return activeType === 'book'
            ? { id: d.id, title: data.title, barcode: data.barcode, type: 'book' as EntityType }
            : { id: d.id, name: data.name, barcode: data.barcode, role: data.role, type: activeType };
        });

      if (items.length === 0) {
        printWindow.close();
        setStatus({ type: 'error', message: `No ${activeType}s have ${codeNoun === 'Accession No.' ? 'an accession number' : 'a barcode'} to print yet.` });
        setTimeout(() => setStatus(null), 3000);
        return;
      }

      printBarcodes(items, printWindow);
      setStatus({ type: 'success', message: `Sent ${items.length} ${activeType} barcode${items.length === 1 ? '' : 's'} to print.` });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      printWindow.close();
      setStatus({ type: 'error', message: 'Failed to prepare barcodes for printing.' });
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setIsPrintingAll(false);
    }
  };

  // Books use library "accession number" terminology; people keep "barcode".
  const codeNoun = activeType === 'book' ? 'Accession No.' : 'Barcode';

  return (
    <div className="space-y-6">
      {/* Reset confirmation modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showResetConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
              onClick={() => setShowResetConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-natural-border relative"
              >
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-natural-muted hover:bg-natural-bg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="p-3 bg-red-50 rounded-2xl w-fit mb-4">
                  <RotateCcw className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-lg font-serif font-black text-zera-emerald mb-2">Reset {activeType} accession numbers?</h3>
                <p className="text-xs font-medium text-natural-muted leading-relaxed mb-6">
                  This clears the <span className="font-bold">Active {codeNoun}</span> from every {activeType} in the library and restarts the sequence — the next one issued will be <span className="font-bold text-zera-emerald">{codeNoun === 'Accession No.' ? 'Zera01' : nextPreview.replace(/\d+$/, '01')}</span>. Existing {activeType === 'book' ? 'books' : `${activeType}s`} are not deleted. This cannot be undone.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-natural-border text-natural-muted hover:bg-natural-bg transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetAll}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset All
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 rounded-2xl">
            <BarcodeIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-black text-zera-emerald tracking-tight">Barcode Studio</h1>
            <p className="text-xs font-bold text-natural-muted uppercase tracking-widest mt-1">Generate & manage library identifiers</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handlePrintBulk}
              className="flex items-center gap-2 px-6 py-2.5 bg-zera-yellow text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-zera-yellow/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Printer className="w-4 h-4" />
              Print Selected ({selectedIds.size})
            </motion.button>
          )}

          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-natural-border shadow-sm">
            <button 
              onClick={() => setActiveType('book')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeType === 'book' ? "bg-zera-emerald text-white shadow-md" : "text-natural-muted hover:bg-natural-bg"
              )}
            >
              Books
            </button>
            <button 
               onClick={() => setActiveType('student')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeType === 'student' ? "bg-zera-emerald text-white shadow-md" : "text-natural-muted hover:bg-natural-bg"
              )}
            >
              Students
            </button>
            <button 
               onClick={() => setActiveType('teacher')}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeType === 'teacher' ? "bg-zera-emerald text-white shadow-md" : "text-natural-muted hover:bg-natural-bg"
              )}
            >
              Teachers
            </button>
          </div>

          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAll || isResetting}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
            title={`Assign ${codeNoun.toLowerCase()} to every ${activeType} that doesn't have one`}
          >
            {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isGeneratingAll && generateProgress
              ? `Generating ${generateProgress.done}/${generateProgress.total}`
              : 'Generate All'}
          </button>

          <button
            onClick={handlePrintAll}
            disabled={isPrintingAll || isGeneratingAll || isResetting}
            className="flex items-center gap-2 px-4 py-2.5 bg-zera-emerald text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-zera-emerald-dark transition-all active:scale-95 disabled:opacity-50"
            title={`Print every ${activeType} ${codeNoun.toLowerCase()}`}
          >
            {isPrintingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Print All
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            disabled={isResetting || isGeneratingAll}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-red-500 border border-red-100 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-red-50 hover:border-red-200 transition-all active:scale-95 disabled:opacity-50"
            title={`Clear all ${activeType} accession numbers and restart the sequence`}
          >
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset All
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick View / Stats */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zera-emerald text-white rounded-3xl p-6 relative overflow-hidden shadow-lg border-b-4 border-zera-emerald-dark">
            <div className="relative z-10">
              <h3 className="text-xs font-black uppercase tracking-widest opacity-70 mb-4">Next {codeNoun}</h3>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-4xl font-serif font-black leading-none">{nextPreview}</span>
                <span className="text-[10px] font-bold opacity-60 mb-1">Ready for assignment</span>
              </div>
              <p className="text-[10px] leading-relaxed opacity-80 font-medium">
                System automatically tracks the next serial number in the <span className="font-bold">Zera01 → Infinity</span> sequence.
              </p>
            </div>
            <RefreshCw className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12 pointer-events-none" />
          </div>

          {activeType === 'book' && (
            <div className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm">
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                <Plus className="w-4 h-4 text-zera-emerald" /> New Book → Assign Barcode
              </h3>
              <p className="text-[11px] text-natural-muted font-medium mb-4">
                Add a new book and give it the next accession number in one step.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBookWithBarcode(); } }}
                  placeholder="Book title (required)"
                  className="w-full bg-natural-bg border-2 border-natural-border focus:border-zera-emerald rounded-2xl py-3 px-4 text-xs font-bold outline-none transition-all placeholder:text-natural-muted/50"
                />
                <input
                  type="text"
                  value={newBookIsbn}
                  onChange={(e) => setNewBookIsbn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateBookWithBarcode(); } }}
                  placeholder="ISBN (optional)"
                  className="w-full bg-natural-bg border-2 border-natural-border focus:border-zera-emerald rounded-2xl py-3 px-4 text-xs font-mono outline-none transition-all placeholder:text-natural-muted/50"
                />
                <button
                  type="button"
                  onClick={handleCreateBookWithBarcode}
                  disabled={creatingBook || !newBookTitle.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-zera-emerald text-white rounded-2xl py-3 text-xs font-black uppercase tracking-widest hover:bg-zera-emerald-dark shadow-md disabled:opacity-40 transition-all"
                >
                  {creatingBook ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarcodeIcon className="w-4 h-4" />} Create &amp; Assign Barcode
                </button>
              </div>
              {lastCreated && (
                <div className="mt-4 p-4 rounded-2xl bg-zera-emerald/5 border border-zera-emerald/20 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-natural-text truncate">{lastCreated.title}</p>
                    <p className="text-[11px] font-mono font-black text-zera-emerald">{lastCreated.barcode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrint(lastCreated)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-zera-emerald/30 text-zera-emerald rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zera-emerald/5 shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-natural-border rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold mb-4">Search & Filter</h3>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${activeType}s...`}
                className="w-full bg-natural-bg border-2 border-natural-border focus:border-indigo-500 rounded-2xl py-3 pl-10 pr-4 text-xs font-bold outline-none transition-all placeholder:text-natural-muted/50"
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between p-3 bg-natural-bg rounded-2xl border border-natural-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[10px] font-black uppercase tracking-tighter text-natural-muted">Format Verified</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
          </div>

          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={cn(
                  "p-4 rounded-2xl flex items-start gap-3 shadow-md border",
                  status.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-700"
                )}
              >
                {status.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                <p className="text-[11px] font-bold leading-tight">{status.message}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Entities and Barcode Generation List */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-natural-border rounded-3xl overflow-hidden shadow-sm">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-natural-bg sticky top-0 z-10 text-left">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-natural-muted uppercase tracking-widest w-10">
                      <input 
                        type="checkbox"
                        className="rounded border-natural-border text-indigo-600 focus:ring-indigo-600"
                        checked={paginatedEntities.length > 0 && paginatedEntities.every(item => selectedIds.has(item.id))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-natural-muted uppercase tracking-widest">Identify</th>
                    <th className="px-6 py-4 text-[10px] font-black text-natural-muted uppercase tracking-widest">Active {codeNoun}</th>
                    <th className="px-6 py-4 text-right pr-10">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-natural-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 opacity-20" />
                      </td>
                    </tr>
                  ) : paginatedEntities.length > 0 ? (
                    paginatedEntities.map((item) => (
                      <tr key={item.id} className="hover:bg-natural-bg/30 transition-colors group">
                        <td className="px-6 py-6">
                          <input 
                            type="checkbox"
                            className="rounded border-natural-border text-indigo-600 focus:ring-indigo-600"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                              item.type === 'book' ? "bg-emerald-50 text-emerald-600" : 
                              item.type === 'student' ? "bg-orange-50 text-orange-600" : "bg-purple-50 text-purple-600"
                            )}>
                              {item.type === 'book' ? <Book className="w-5 h-5" /> : 
                               item.type === 'teacher' ? <GraduationCap className="w-5 h-5" /> : <User className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="text-xs font-black text-zera-emerald truncate max-w-[200px]">
                                {item.title || item.name}
                              </p>
                              <p className="text-[9px] font-bold text-natural-muted uppercase tracking-tighter mt-0.5">
                                {item.id.slice(0, 8)}...
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          {item.barcode ? (
                            <div className="flex flex-col items-center bg-white p-2 rounded-xl border border-natural-border shadow-inner w-fit group/barcode">
                              <div className="scale-[0.8] origin-center -my-4">
                                <Barcode 
                                  value={item.barcode} 
                                  width={1.2} 
                                  height={40} 
                                  fontSize={12}
                                  background="transparent"
                                />
                              </div>
                              <div className="flex items-center gap-2 mt-2 opacity-0 group-hover/barcode:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.barcode!);
                                    setStatus({ type: 'success', message: 'Barcode copied to clipboard' });
                                    setTimeout(() => setStatus(null), 2000);
                                  }}
                                  className="p-1 px-2 bg-natural-bg hover:bg-natural-border rounded-lg text-[8px] font-black uppercase flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                <button 
                                  className="p-1 px-2 bg-natural-bg hover:bg-natural-border rounded-lg text-[8px] font-black uppercase flex items-center gap-1"
                                  onClick={() => handlePrint(item)}
                                >
                                  <Printer className="w-3 h-3" /> Print
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-natural-muted italic">Not Assigned</span>
                          )}
                        </td>
                        <td className="px-6 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            {item.barcode ? (
                              <>
                                <button
                                  onClick={() => handleClear(item)}
                                  disabled={isGenerating === item.id}
                                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-natural-border text-red-500 hover:bg-red-50 hover:border-red-100 transition-all active:scale-95 disabled:opacity-50"
                                  title="Clear Barcode"
                                >
                                  {isGenerating === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Clear'}
                                </button>
                                <button
                                  onClick={() => handleGenerate(item)}
                                  disabled={isGenerating === item.id}
                                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zera-yellow/20 text-zera-emerald border border-zera-yellow/30 hover:bg-zera-yellow/40 transition-all active:scale-95 disabled:opacity-50"
                                  title="Assign New Serial"
                                >
                                  {isGenerating === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Regen'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleGenerate(item)}
                                disabled={isGenerating === item.id}
                                className="px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                              >
                                {isGenerating === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Generate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center">
                         <div className="p-4 bg-natural-bg rounded-full w-fit mx-auto mb-4">
                           <Search className="w-8 h-8 text-natural-muted/20" />
                         </div>
                         <h4 className="font-bold text-natural-text text-sm">No {activeType}s found</h4>
                         <p className="text-[10px] text-natural-muted font-bold mt-2 uppercase tracking-wide">Try adjusting your search criteria</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-natural-bg/40 border-t border-natural-border flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-natural-muted">
                  Showing <span className="font-bold text-zera-emerald">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="font-bold text-zera-emerald">{Math.min(currentPage * itemsPerPage, filteredEntities.length)}</span> of <span className="font-bold text-zera-emerald">{filteredEntities.length}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-natural-border text-[9px] font-black uppercase tracking-widest hover:bg-natural-bg disabled:opacity-40 disabled:pointer-events-none transition-all"
                  >
                    Prev
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-7 h-7 rounded-lg text-[9px] font-black transition-all",
                            currentPage === pageNum 
                              ? "bg-zera-emerald text-white shadow-sm" 
                              : "text-natural-muted hover:bg-natural-bg"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-natural-border text-[9px] font-black uppercase tracking-widest hover:bg-natural-bg disabled:opacity-40 disabled:pointer-events-none transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
