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
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, getDocs, updateDoc, doc, where, limit } from 'firebase/firestore';
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

  useEffect(() => {
    fetchEntities();
    loadNextPreview();
  }, [activeType]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEntities.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntities.map(e => e.id)));
    }
  };

  const handlePrintBulk = () => {
    const itemsToPrint = entities.filter(e => selectedIds.has(e.id) && e.barcode);
    if (itemsToPrint.length === 0) {
      setStatus({ type: 'error', message: 'No items with barcodes selected.' });
      return;
    }
    
    printBarcodes(itemsToPrint);
  };

  const printBarcodes = (items: SelectableEntity[]) => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
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
        <div class="footer">Zera Library</div>
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
              margin: 10mm;
            }
            body { 
              margin: 0; 
              padding: 0;
              font-family: 'Inter', sans-serif;
              background: white;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 8px;
              width: 100%;
            }
            .label {
              text-align: center;
              padding: 12px;
              border: 1px solid #e4e4e7;
              border-radius: 8px;
              break-inside: avoid;
              background: white;
              height: 140px;
              display: flex;
              flex-direction: column;
              justify-content: center;
              margin-bottom: 5px;
            }
            .name {
              font-size: 10px;
              font-weight: 900;
              margin-bottom: 6px;
              color: #18181b;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .barcode-container canvas {
              max-width: 100%;
              height: auto !important;
            }
            .code {
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.1em;
              color: #52525b;
              margin-top: 4px;
              text-transform: uppercase;
            }
            .footer {
              margin-top: 4px;
              font-size: 6px;
              font-weight: 900;
              color: #a1a1aa;
              letter-spacing: 0.05em;
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
                  width: 1.2,
                  height: 40,
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

  const handlePrint = (item: SelectableEntity) => {
    if (!item.barcode) return;
    printBarcodes([item]);
  };

  const filteredEntities = entities.filter(e => 
    (e.title || e.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.barcode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick View / Stats */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-zera-emerald text-white rounded-3xl p-6 relative overflow-hidden shadow-lg border-b-4 border-zera-emerald-dark">
            <div className="relative z-10">
              <h3 className="text-xs font-black uppercase tracking-widest opacity-70 mb-4">Next Serial</h3>
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
                        checked={filteredEntities.length > 0 && selectedIds.size === filteredEntities.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-natural-muted uppercase tracking-widest">Identify</th>
                    <th className="px-6 py-4 text-[10px] font-black text-natural-muted uppercase tracking-widest">Active Barcode</th>
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
                  ) : filteredEntities.length > 0 ? (
                    filteredEntities.map((item) => (
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
          </div>
        </div>
      </div>
    </div>
  );
};
