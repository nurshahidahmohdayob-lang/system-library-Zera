import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  X, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  FileText, 
  FileSpreadsheet, 
  Sparkles, 
  Clipboard, 
  ChevronRight, 
  BookOpen, 
  Check, 
  RefreshCcw,
  Search,
  Book as BookIcon,
  Layers,
  ArrowRight
} from 'lucide-react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Book } from '@/src/types';
import { BarcodeService } from '@/src/services/BarcodeService';
import { lookupBookByIsbn, lookupBookByTitle, isRealSynopsis } from '@/src/services/catalogService';

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
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error in Importer: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface BatchBookImporterProps {
  onClose: () => void;
}

interface UploadedRow {
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  description?: string;
}

interface ImportErrorItem {
  rowNum: number;
  rawText: string;
  reason: string;
}

interface ActiveJob {
  index: number;
  row: UploadedRow;
  status: 'pending' | 'lookup' | 'saving' | 'completed' | 'failed';
  matchedLogo?: string;
  matchedTitle?: string;
  matchedAuthor?: string;
  matchedCategory?: string;
  matchedYear?: number;
  matchedPublisher?: string;
  coverUrl?: string;
  barcode?: string;
  method?: string;
  error?: string;
}

export const BatchBookImporter: React.FC<BatchBookImporterProps> = ({ onClose }) => {
  const [step, setStep] = useState<number>(1); // 1: Choose/Paste, 2: Column Mapping, 3: Sync & Store, 4: Result
  const [inputText, setInputText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<UploadedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [errorLogs, setErrorLogs] = useState<ImportErrorItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Field Mapping states state
  const [titleIdx, setTitleIdx] = useState<number>(-1);
  const [authorIdx, setAuthorIdx] = useState<number>(-1);
  const [isbnIdx, setIsbnIdx] = useState<number>(-1);
  const [categoryIdx, setCategoryIdx] = useState<number>(-1);
  const [copiesIdx, setCopiesIdx] = useState<number>(-1);
  const [descriptionIdx, setDescriptionIdx] = useState<number>(-1);

  // Live import state
  const [importJobs, setImportJobs] = useState<ActiveJob[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [successfulImports, setSuccessfulImports] = useState<number>(0);
  const [failedImports, setFailedImports] = useState<number>(0);

  // Robust Native CSV Parser
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [''];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push('');
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines.filter(r => r.some(cell => cell.trim() !== ''));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFileContent = (content: string, fileName?: string) => {
    const isCsv = fileName?.endsWith('.csv') || content.includes(',');
    
    if (isCsv) {
      const matrix = parseCSV(content);
      if (matrix.length > 0) {
        const fileHeaders = matrix[0].map(h => h.trim());
        setHeaders(fileHeaders);
        setRawMatrix(matrix.slice(1));
        
        // Automated match of headers
        fileHeaders.forEach((h, idx) => {
          const lower = h.toLowerCase();
          if (lower.includes('title') || lower === 'title' || lower.includes('bookname') || lower.includes('name')) {
            setTitleIdx(idx);
          } else if (lower.includes('author') || lower === 'author' || lower.includes('writer')) {
            setAuthorIdx(idx);
          } else if (lower.includes('isbn') || lower === 'isbn' || lower.includes('identifier')) {
            setIsbnIdx(idx);
          } else if (lower.includes('cat') || lower === 'category' || lower.includes('subject') || lower === 'subject') {
            setCategoryIdx(idx);
          } else if (lower.includes('cop') || lower === 'copies' || lower.includes('quantity') || lower === 'qty') {
            setCopiesIdx(idx);
          } else if (lower.includes('summar') || lower.includes('synops') || lower.includes('descrip') || lower.includes('abstract') || lower.includes('notes')) {
            setDescriptionIdx(idx);
          }
        });

        setStep(2);
      } else {
        alert('File content is empty or unreadable.');
      }
    } else {
      // Plain text parsing (Assuming one ISBN or book title per line)
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows: UploadedRow[] = lines.map(line => {
        // Is it an ISBN? Look for numbers
        const cleanLine = line.replace(/[^0-9X]/gi, '');
        const looksLikeIsbn = cleanLine.length >= 10 && cleanLine.length <= 13 && /^\d+x?$/i.test(cleanLine);
        
        if (looksLikeIsbn) {
          return { title: '', author: '', isbn: cleanLine, category: 'General', copies: 1 };
        } else {
          // Check if there is Author split by comma or semi-colon
          const parts = line.split(/[,;|]/);
          if (parts.length > 1) {
            return { title: parts[0].trim(), author: parts[1].trim(), isbn: '', category: 'General', copies: 1 };
          }
          return { title: line, author: '', isbn: '', category: 'General', copies: 1 };
        }
      });
      setParsedRows(rows);
      setStep(3);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          processFileContent(event.target.result, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          processFileContent(event.target.result, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePasteSubmit = () => {
    if (!inputText.trim()) {
      alert('Please paste some text/CSV book list to proceed.');
      return;
    }
    processFileContent(inputText);
  };

  const finalizeMapping = () => {
    if (titleIdx === -1 && isbnIdx === -1) {
      alert('Mapping Error: You must map at least the Book Title or the ISBN column to process metadata lookup.');
      return;
    }

    const rows: UploadedRow[] = [];
    const errors: ImportErrorItem[] = [];

    rawMatrix.forEach((columns, index) => {
      const rowNum = index + 2; // header index + 1-based
      const title = titleIdx !== -1 ? (columns[titleIdx] || '').trim() : '';
      const author = authorIdx !== -1 ? (columns[authorIdx] || '').trim() : '';
      const isbn = isbnIdx !== -1 ? (columns[isbnIdx] || '').replace(/[^0-9X]/gi, '').trim() : '';
      const category = categoryIdx !== -1 ? (columns[categoryIdx] || '').trim() : 'Fiction';
      const rawCopies = copiesIdx !== -1 ? parseInt(columns[copiesIdx] || '1', 10) : 1;
      const copies = isNaN(rawCopies) || rawCopies < 1 ? 1 : rawCopies;
      const description = descriptionIdx !== -1 ? (columns[descriptionIdx] || '').trim() : '';

      if (!title && !isbn) {
        errors.push({
          rowNum,
          rawText: columns.join(','),
          reason: 'Both Title and ISBN are empty. At least one identifier is required.'
        });
      } else {
        rows.push({ title, author, isbn, category, copies, description });
      }
    });

    setParsedRows(rows);
    setErrorLogs(errors);
    setStep(3);
  };

  const triggerSearchAndSync = async () => {
    if (parsedRows.length === 0) {
      alert('No books detected to import.');
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: parsedRows.length });
    setSuccessfulImports(0);
    setFailedImports(0);

    const jobs: ActiveJob[] = parsedRows.map((row, idx) => ({
      index: idx,
      row,
      status: 'pending'
    }));
    setImportJobs(jobs);

    // Sequence Queue execution
    for (let i = 0; i < parsedRows.length; i++) {
      const currentJob = jobs[i];
      
      setImportJobs(prev => prev.map((j, k) => k === i ? { ...j, status: 'lookup' } : j));
      setSyncProgress(prev => ({ ...prev, current: i + 1 }));

      let matchedBook: Partial<Book> | null = null;
      let syncMethod = 'Fallback Manual';
      const syncedCover = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600'; // Default beautiful aesthetic placeholder

      try {
        // Step 1: Perform Deep Z39.50/ISBN Query Integration
        if (currentJob.row.isbn) {
          matchedBook = await lookupBookByIsbn(currentJob.row.isbn);
          syncMethod = 'Z39.50 / ISBN Auto-Sync';
        }

        // Step 2: Use title lookup as lookup bypass if no direct ISBN record exists
        if (!matchedBook && currentJob.row.title) {
          const matchResult = await lookupBookByTitle(currentJob.row.title);
          if (matchResult && matchResult.length > 0) {
            matchedBook = matchResult[0];
            syncMethod = 'Title-Matched Sync';
          }
        }

        // Step 3: Set status or save fallbacks
        const titleToUse = matchedBook?.title || currentJob.row.title || 'Untitled Book';
        const authorToUse = matchedBook?.author || currentJob.row.author || 'Unknown Author';
        const isbnToUse = matchedBook?.isbn || currentJob.row.isbn || '';
        const coverToUse = matchedBook?.coverUrl || syncedCover;
        const categoryToUse = matchedBook?.category || currentJob.row.category || 'Fiction';
        // Only treat a genuine synopsis as "already known" — placeholder strings
        // stamped by enrichBookDetails would otherwise suppress the server-side
        // title/ISBN synopsis search below.
        const descToUse = currentJob.row.description?.trim()
          || (isRealSynopsis(matchedBook?.description) ? matchedBook!.description! : '');
        const publisherToUse = matchedBook?.publisher || 'Zera Archives';
        const yearToUse = matchedBook?.publishedYear || new Date().getFullYear();
        const subjectsToUse = matchedBook?.subjects || [categoryToUse];
        const pageCountToUse = typeof matchedBook?.pageCount === 'number' ? matchedBook.pageCount : 0;
        const languageToUse = matchedBook?.language || 'English';

        // Step 3.5: Query AI Coprocessor for high-fidelity synopsis & metadata enrichment
        let enrichedDetails = null;
        try {
          const enrichRes = await fetch('/api/v1/enrich-book-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // Don't send the 'Untitled Book' fallback — a title search on it could
              // match a wrong book; the server can look up by ISBN alone.
              title: titleToUse !== 'Untitled Book' ? titleToUse : '',
              author: authorToUse !== 'Unknown Author' ? authorToUse : '',
              isbn: isbnToUse,
              description: descToUse
            })
          });
          if (enrichRes.ok) {
            enrichedDetails = await enrichRes.json();
          }
        } catch (err) {
          console.warn("AI enrichment during batch import timed out/failed:", err);
        }

        const finalDesc = currentJob.row.description?.trim()
          || [enrichedDetails?.description, matchedBook?.description].find(isRealSynopsis)
          || 'No synopsis/abstract available in public bibliographic databases.';
        const finalAuthor = enrichedDetails?.author || authorToUse;
        const finalCategory = enrichedDetails?.category || categoryToUse;
        const finalPublisher = enrichedDetails?.publisher || publisherToUse;
        const finalYear = enrichedDetails?.publishedYear || yearToUse;
        const finalSubjects = enrichedDetails?.subjects || subjectsToUse;
        const finalPageCount = enrichedDetails?.pageCount || pageCountToUse;

        // Step 4: Generate unique Sequence Barcode
        setImportJobs(prev => prev.map((j, k) => k === i ? { ...j, status: 'saving' } : j));
        const matchedBarcode = await BarcodeService.generateNextBarcode('book');

        // Step 5: Save record to Firestore DB
        const now = new Date().toISOString();
        const bookPayload = {
          title: titleToUse,
          author: finalAuthor,
          isbn: isbnToUse,
          barcode: matchedBarcode,
          category: finalCategory,
          description: finalDesc,
          coverUrl: coverToUse,
          publisher: finalPublisher,
          publishedYear: finalYear,
          subjects: finalSubjects,
          pageCount: finalPageCount,
          lexileLevel: enrichedDetails?.lexileLevel || '',
          language: languageToUse,
          totalCopies: currentJob.row.copies,
          availableCopies: currentJob.row.copies,
          status: 'available',
          createdAt: now,
          updatedAt: now
        };

        try {
          await addDoc(collection(db, 'books'), bookPayload);
          
          setImportJobs(prev => prev.map((j, k) => k === i ? {
            ...j,
            status: 'completed',
            matchedTitle: titleToUse,
            matchedAuthor: finalAuthor,
            matchedCategory: finalCategory,
            matchedYear: finalYear,
            matchedPublisher: finalPublisher,
            coverUrl: coverToUse,
            barcode: matchedBarcode,
            method: syncMethod
          } : j));
          setSuccessfulImports(prev => prev + 1);
        } catch (dbError) {
          handleFirestoreError(dbError, OperationType.WRITE, 'books');
        }

      } catch (err) {
        console.error('Failed to sync book row:', i, err);
        
        // Add minimal error info to state but proceed so user is not blocked
        setImportJobs(prev => prev.map((j, k) => k === i ? { 
          ...j, 
          status: 'failed', 
          error: err instanceof Error ? err.message : String(err) 
        } : j));
        setFailedImports(prev => prev + 1);
      }

      // Small throttling delay to look elegant, avoid API locks, and give a movie-like registry compilation feel!
      await new Promise(resolve => setTimeout(resolve, 520));
    }

    setIsSyncing(false);
    setStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zera-emerald-dark/60 backdrop-blur-md" onClick={() => !isSyncing && onClose()} />
      
      <div className="relative w-full max-w-4xl bg-white rounded-[2rem] border border-natural-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none animate-in scale-in float-up duration-500">
        
        {/* Upper Brand Header Bar */}
        <div className="flex justify-between items-center px-8 py-5 border-b border-natural-border bg-natural-bg shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-zera-emerald/10 text-zera-emerald rounded-xl flex items-center justify-center font-bold">
               <Layers className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-serif text-lg font-black text-zera-emerald leading-tight">Batch Catalog Registry Sync</h3>
                <p className="text-[10px] font-bold text-natural-muted uppercase mt-0.5 tracking-wider">Z39.50 Academic Autoconnect Protocol</p>
             </div>
          </div>
          <button 
            disabled={isSyncing}
            onClick={onClose}
            className="p-2 text-natural-muted hover:text-red-500 rounded-full hover:bg-natural-border/30 transition-all disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body Space */}
        <div className="p-8 flex-1 overflow-y-auto min-h-[400px]">
          
          {/* STEP 1: UPLOAD / PASTING CONTAINER */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                 <h4 className="text-xl font-serif font-black text-zera-emerald">Upload or Paste Book Index</h4>
                 <p className="text-xs text-natural-muted leading-relaxed font-medium">
                   Quickly import multiple titles into Zera library database. We support dragging comma-separated files (<span className="font-bold text-zera-emerald">.csv</span>), plain lists (<span className="font-bold text-zera-emerald">.txt</span>), or copying directly from Excel tables.
                 </p>
              </div>

              {/* Drag n Drop Sandbox */}
              <div 
                className={`border-3 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all ${
                  dragActive 
                    ? 'border-zera-yellow bg-zera-yellow/5 scale-[0.99] shadow-inner' 
                    : 'border-natural-border hover:border-zera-emerald/30 bg-natural-bg/40 hover:bg-natural-bg/80'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className="w-16 h-16 bg-white border border-natural-border rounded-2xl flex items-center justify-center text-zera-emerald shadow-sm mb-4 transition-transform group-hover:scale-110">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-black text-natural-text">Drag & drop your files here</p>
                  <p className="text-xs text-natural-muted">or click to choose files from disk</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-6 px-6 py-2.5 bg-white border border-natural-border hover:border-zera-emerald/30 text-natural-text text-xs font-black uppercase tracking-wider rounded-xl shadow-sm hover:shadow transition-all"
                >
                  Choose File
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Paste Segment Fallback */}
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Alternative: Direct Copy-Paste from Sheets</label>
                 <textarea 
                   rows={5}
                   placeholder="Example CSV structure:&#10;ISBN, Title, Author, Category, Copies&#10;9780141439518, Pride and Prejudice, Jane Austen, Fiction, 3&#10;&#10;Or a raw list of ISBNs (one per line):&#10;9780061120084&#10;9780451524935"
                   value={inputText}
                   onChange={e => setInputText(e.target.value)}
                   className="w-full bg-natural-bg/40 border border-natural-border focus:bg-white rounded-2xl p-4 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald antialiased leading-relaxed"
                 />
                 <div className="flex justify-between items-center pt-2">
                    <span className="text-[9px] font-bold text-zera-yellow-dark bg-zera-yellow/15 border border-zera-yellow/10 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> No list on-hand? Paste a line of ISBN to test!
                    </span>
                    <button 
                      onClick={handlePasteSubmit}
                      className="px-6 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow transition-all"
                    >
                      Process Copy-Pasted Data <ChevronRight className="w-4 h-4" />
                    </button>
                 </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING DIALOG */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-1.5">
                 <h4 className="text-xl font-serif font-black text-zera-emerald">Map File Columns</h4>
                 <p className="text-xs text-natural-muted font-medium">
                   We detected <span className="font-bold text-zera-emerald">{headers.length} columns</span> in your uploaded sheet. Align the selector mappings below to help the database identify where details lie.
                 </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-natural-bg p-6 rounded-3xl border border-natural-border">
                
                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Book Title</span>
                   <select 
                     value={titleIdx}
                     onChange={e => setTitleIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Primary Author</span>
                   <select 
                     value={authorIdx}
                     onChange={e => setAuthorIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">ISBN Number (Recommended)</span>
                   <select 
                     value={isbnIdx}
                     onChange={e => setIsbnIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Subject / Category</span>
                   <select 
                     value={categoryIdx}
                     onChange={e => setCategoryIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore (Default 'Fiction') --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Copies / Volume Inventory</span>
                   <select 
                     value={copiesIdx}
                     onChange={e => setCopiesIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore (Default 1 Copy) --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

                <div className="space-y-1.5">
                   <span className="text-[9px] font-black text-natural-muted uppercase tracking-wider block">Summary / Synopsis</span>
                   <select 
                     value={descriptionIdx}
                     onChange={e => setDescriptionIdx(parseInt(e.target.value))}
                     className="w-full p-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-text focus:ring-2 focus:ring-zera-emerald"
                   >
                     <option value={-1}>-- Ignore / Choose Column --</option>
                     {headers.map((h, i) => (
                       <option key={i} value={i}>Column {i + 1}: {h}</option>
                     ))}
                   </select>
                </div>

              </div>

              {/* Sample Data Matrix */}
              <div className="space-y-3">
                 <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Data rows sampler preview</span>
                 <div className="border border-natural-border rounded-2xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                       <thead className="bg-natural-bg text-natural-muted select-none font-bold">
                          <tr>
                             {headers.map((h, idx) => (
                                <th key={idx} className="px-4 py-2 border-b border-natural-border font-mono text-[10px] uppercase">
                                  {h}
                                </th>
                             ))}
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-natural-bg/60 text-natural-text font-mono">
                          {rawMatrix.slice(0, 3).map((row, idx) => (
                             <tr key={idx}>
                                {row.map((cell, cIdx) => (
                                   <td key={cIdx} className="px-4 py-2 border-b border-natural-border">
                                     {cell}
                                   </td>
                                ))}
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-natural-border">
                 <button 
                   onClick={() => setStep(1)}
                   className="px-6 py-3 bg-natural-bg border border-natural-border text-natural-text text-xs font-black uppercase tracking-widest rounded-xl hover:bg-natural-border/30 transition-all"
                 >
                   Go Back
                 </button>
                 <button 
                   onClick={finalizeMapping}
                   className="px-8 py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition-all"
                 >
                   Apply Column Mappings
                 </button>
              </div>
            </div>
          )}

          {/* STEP 3: QUEUE SYNC WITH METADATA PLATFORM */}
          {step === 3 && (
            <div className="space-y-6">
              
              {!isSyncing && (
                <div className="text-center max-w-xl mx-auto space-y-4">
                  <BookOpen className="w-12 h-12 text-zera-emerald mx-auto animate-bounce" />
                  <div className="space-y-1">
                     <h4 className="text-xl font-serif font-black text-zera-emerald">Ready to Catalog {parsedRows.length} Book{parsedRows.length !== 1 ? 's' : ''}</h4>
                     <p className="text-xs text-natural-muted font-medium">
                       Each book in the register will be matched with the Z39.50 (Library of Congress) and Google Books directories, download and assign their covers, allocate barcodes, and update the catalog database.
                     </p>
                  </div>
                  
                  {errorLogs.length > 0 && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs border border-red-100 flex items-start gap-2 max-w-md mx-auto text-left">
                       <AlertTriangle className="w-5 h-5 shrink-0" />
                       <div>
                         <p className="font-bold">Row Errors Skipped ({errorLogs.length})</p>
                         <p className="opacity-90">{errorLogs.length} rows could not be parsed: missing both Book titles & ISBN codes.</p>
                       </div>
                    </div>
                  )}

                  <div className="flex justify-center gap-3 pt-4">
                    <button 
                      onClick={() => setStep(headers.length > 0 ? 2 : 1)}
                      className="px-6 py-3 bg-natural-bg border border-natural-border text-natural-text text-xs font-black uppercase tracking-widest rounded-xl hover:bg-natural-border/30 transition-all"
                    >
                      Back & Adjust
                    </button>
                    <button 
                      onClick={triggerSearchAndSync}
                      className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-xl flex items-center gap-2 transition-all"
                    >
                      <Play className="w-4 h-4 fill-white" /> Start Autocatalog & Cover Sync
                    </button>
                  </div>
                </div>
              )}

              {isSyncing && (
                <div className="space-y-6">
                   
                   {/* Sync Status Banner */}
                   <div className="bg-gradient-to-r from-zera-emerald to-zera-emerald-dark text-white p-6 rounded-3xl border border-zera-emerald-dark shrink-0 flex items-center justify-between shadow-lg">
                      <div className="space-y-1">
                         <span className="text-[9px] font-black uppercase tracking-widest text-zera-yellow">Status: Synthesizing Bibliographic Stack</span>
                         <h4 className="text-lg font-serif font-bold">Cataloging record {syncProgress.current} / {syncProgress.total}</h4>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="flex flex-col text-right">
                           <span className="text-xs font-mono font-black">{Math.round((syncProgress.current/syncProgress.total)*100)}%</span>
                           <span className="text-[8px] font-black uppercase tracking-widest text-white/75">Registry Completion</span>
                         </div>
                         <Loader2 className="w-6 h-6 animate-spin text-zera-yellow" />
                      </div>
                   </div>

                   {/* Micro Progress Bar */}
                   <div className="w-full bg-natural-bg h-3 rounded-full overflow-hidden border border-natural-border p-0.5">
                     <div 
                       className="bg-zera-yellow h-full rounded-full transition-all duration-300"
                       style={{ width: `${(syncProgress.current/syncProgress.total)*100}%` }}
                     />
                   </div>

                   {/* Active Sync Visual Cards Grid */}
                   <div className="space-y-3">
                      <div className="flex justify-between items-center select-none">
                         <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest">Active Metadata Lookups</span>
                         <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
                            <span className="text-zera-emerald">Success: {successfulImports}</span>
                            <span className="text-red-500">Failed: {failedImports}</span>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 border border-transparent rounded-2xl">
                          {importJobs.map((job) => {
                             const isCurrent = job.status === 'lookup' || job.status === 'saving';
                             return (
                               <div 
                                 key={job.index}
                                 className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-4 ${
                                   job.status === 'completed' 
                                     ? 'bg-white border-zera-emerald/20 shadow-sm opacity-60' 
                                     : job.status === 'failed'
                                     ? 'bg-red-50/50 border-red-200'
                                     : isCurrent
                                     ? 'bg-zera-yellow/5 border-zera-yellow shadow-md scale-[1.01]'
                                     : 'bg-white border-natural-border opacity-40'
                                 }`}
                               >
                                  {/* Cover sync preview */}
                                  <div className="w-10 h-14 bg-natural-bg rounded-lg border border-natural-border overflow-hidden shrink-0 shadow-sm relative flex items-center justify-center">
                                     {job.coverUrl ? (
                                        <img src={job.coverUrl} className="w-full h-full object-cover" alt="Matched" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                                     ) : (
                                        <BookIcon className={`w-5 h-5 text-natural-muted ${isCurrent && 'animate-pulse'}`} />
                                     )}
                                  </div>

                                  <div className="flex-1 min-w-0 space-y-1">
                                     <div className="flex justify-between items-start gap-2">
                                        <h5 className="text-xs font-black text-natural-text truncate leading-tight">
                                          {job.matchedTitle || job.row.title || `ISBN: ${job.row.isbn}`}
                                        </h5>
                                        <span className="text-[8px] font-mono font-bold text-natural-muted bg-natural-bg border border-natural-border px-1.5 py-0.5 rounded uppercase font-bold shrink-0">
                                          Row {job.index + 1}
                                        </span>
                                     </div>
                                     <p className="text-[10px] text-natural-muted truncate">
                                       By {job.matchedAuthor || job.row.author || 'Searching Online...'}
                                     </p>

                                     {/* State badge */}
                                     <div className="flex justify-between items-center pt-1.5 border-t border-natural-border/40 text-[9px] font-bold">
                                        {job.status === 'pending' && <span className="text-natural-muted uppercase">In Queue</span>}
                                        {job.status === 'lookup' && (
                                          <span className="text-zera-yellow-dark flex items-center gap-1 uppercase animate-pulse">
                                            <Search className="w-3 h-3 animate-spin" /> Querying Z39.50...
                                          </span>
                                        )}
                                        {job.status === 'saving' && (
                                          <span className="text-zera-emerald flex items-center gap-1 uppercase font-black">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                                          </span>
                                        )}
                                        {job.status === 'completed' && (
                                          <span className="text-zera-emerald flex items-center gap-1 uppercase font-black">
                                            <Check className="w-3 h-3 text-zera-emerald" /> Catalogued ({job.barcode})
                                          </span>
                                        )}
                                        {job.status === 'failed' && (
                                          <span className="text-red-500 flex items-center gap-1 uppercase">
                                            <AlertTriangle className="w-3 h-3 text-red-500" /> Lookup Failed
                                          </span>
                                        )}
                                        <span className="text-[8px] font-mono text-natural-muted opacity-80">{job.method || ''}</span>
                                     </div>
                                  </div>
                               </div>
                             );
                          })}
                      </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: COMPILATION SUCCESS REPORT */}
          {step === 4 && (
            <div className="space-y-6 animate-in zoom-in-95 duration-500">
               <div className="bg-gradient-to-br from-zera-emerald to-zera-emerald-dark text-white p-8 rounded-[2rem] text-center space-y-4 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
                  
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-zera-emerald mx-auto shadow-md">
                     <CheckCircle2 className="w-10 h-10 text-zera-emerald" />
                  </div>
                  <div className="space-y-1 text-center">
                     <h4 className="text-3xl font-serif font-black text-zera-yellow leading-tight">Sync Job Accomplished</h4>
                     <p className="text-sm text-white/90">Catalog processing task has successfully terminated.</p>
                  </div>

                  {/* Highlights statistics */}
                  <div className="grid grid-cols-2 max-w-md mx-auto gap-4 pt-6 mt-4 border-t border-white/15 text-center">
                     <div>
                        <p className="text-[10px] font-black uppercase text-zera-yellow font-black tracking-widest">Added to Stacks</p>
                        <p className="text-4xl font-serif font-black">{successfulImports} Titles</p>
                     </div>
                     <div className="border-l border-white/10 pl-4">
                        <p className="text-[10px] font-black uppercase text-zera-yellow font-black tracking-widest">Unresolved Exception</p>
                        <p className="text-4xl font-serif font-black text-white/60">{failedImports} Skip{failedImports !== 1 && 's'}</p>
                     </div>
                  </div>
               </div>

               {/* Summarized success roster */}
               <div className="space-y-3">
                  <span className="text-[10px] font-black text-natural-muted uppercase tracking-widest block">Bibliographic ledger database updates</span>
                  <div className="border border-natural-border rounded-2xl overflow-hidden bg-white max-h-48 overflow-y-auto">
                     <table className="w-full text-xs text-left">
                        <thead className="bg-natural-bg text-natural-muted select-none font-bold">
                           <tr>
                              <th className="px-5 py-3">Catalog Block</th>
                              <th className="px-5 py-3">Allocated Barcode</th>
                              <th className="px-5 py-3">Sync Stream / Result</th>
                              <th className="px-5 py-3">Stacks Inventory</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-natural-bg/60 text-natural-text font-bold">
                           {importJobs.filter(j => j.status === 'completed').map((job) => (
                              <tr key={job.index} className="hover:bg-natural-bg/20">
                                 <td className="px-5 py-3.5">
                                    <div className="flex gap-3 items-center">
                                       <img src={job.coverUrl} className="w-6 h-9 object-cover rounded shadow-sm shrink-0" alt="c" onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }} />
                                       <div className="min-w-0">
                                          <p className="truncate text-natural-text leading-tight">{job.matchedTitle}</p>
                                          <p className="text-[10px] text-natural-muted truncate font-normal">By {job.matchedAuthor}</p>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="px-5 py-3.5 font-mono text-[10px] text-zera-emerald">
                                    {job.barcode}
                                 </td>
                                 <td className="px-5 py-3.5">
                                    <span className="text-[9px] font-black uppercase bg-zera-yellow/15 text-zera-yellow-dark px-2.5 py-1 rounded-lg">
                                       {job.method}
                                    </span>
                                 </td>
                                 <td className="px-5 py-3.5 text-natural-muted">
                                    {job.row.copies} Standard Cop{job.row.copies !== 1 ? 'ies' : 'y'}
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>

               <div className="flex justify-end pt-4 border-t border-natural-border shrink-0">
                  <button 
                     onClick={onClose}
                     className="px-10 py-4 bg-zera-emerald text-white hover:bg-zera-emerald-dark font-black uppercase text-xs tracking-widest rounded-full shadow-lg transition-all flex items-center gap-2"
                  >
                     Finalize & Close Portal <ArrowRight className="w-4 h-4" />
                  </button>
               </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
