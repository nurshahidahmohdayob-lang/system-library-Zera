import React, { useMemo, useState } from 'react';
import { Loader2, X, CalendarCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, writeBatch, doc, deleteField, FieldValue } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { isInventedPublisher, samePublisher } from '@/src/lib/editionFacts';

/**
 * Replace invented publication years and publishers with each edition's real
 * ones, looked up by ISBN.
 *
 * The two fields need different rules, and the rules come from measurement,
 * not assumption:
 *
 * Years. A year no source confirms is blanked by default. They looked
 * trustworthy, but the ones checkable against the ISBN era included Macbeth
 * 1508 and A Tale of Two Cities 1800 — AI output — and the rest were the year
 * the work was first written, not this edition.
 *
 * Publishers. Real-looking publishers are kept. Checked against a source,
 * 147 of 148 agreed, and the one difference favoured the stored value. So only
 * the invented imprints ("Zera Academic Press" and family) are replaced, or
 * blanked when no source knows the real one.
 *
 * Runs in the librarian's session, since writing /books needs an admin. Scan
 * and Apply are separate clicks so every change is visible before it is made.
 */

interface Row {
  id: string;
  title: string;
  isbn: string;
  year: { current: number | null; found: number | null; source: string | null; invented: boolean };
  publisher: { current: string; found: string | null; source: string | null };
}

type Change = { row: Row; field: 'year' | 'publisher'; from: string; to: string | null };

const yearOf = (v: unknown): number | undefined => {
  if (!v) return undefined;
  const d = typeof v === 'string' ? new Date(v)
    : typeof (v as { seconds?: number })?.seconds === 'number' ? new Date((v as { seconds: number }).seconds * 1000)
    : null;
  return d && !isNaN(d.getTime()) ? d.getFullYear() : undefined;
};

export const EditionFixer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'done'>('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [keepUnconfirmedYears, setKeepUnconfirmedYears] = useState(false);
  const [result, setResult] = useState<{ written: number; failed: number } | null>(null);

  const scan = async () => {
    setPhase('scanning');
    const snap = await getDocs(collection(db, 'books'));
    const books: Array<Record<string, any> & { id: string }> = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setProgress({ done: 0, total: books.length });
    const out: Row[] = [];
    let next = 0;
    const worker = async () => {
      while (next < books.length) {
        const b = books[next++];
        const isbn = String(b.isbn || '').replace(/[^0-9X]/gi, '');
        let f: any = {};
        if (isbn.length === 10 || isbn.length === 13) {
          try {
            const r = await fetch(`/api/v1/edition-facts?isbn=${isbn}`);
            if (r.ok) f = await r.json();
          } catch {
            // counted as not found
          }
        }
        const created = yearOf(b.createdAt);
        const cy = typeof b.publishedYear === 'number' && b.publishedYear > 0 ? b.publishedYear : null;
        out.push({
          id: b.id,
          title: String(b.title || ''),
          isbn,
          year: {
            current: cy, found: f.year ?? null, source: f.yearSource ?? null,
            invented: !!created && cy !== null && (cy === created || cy === created - 2),
          },
          publisher: { current: String(b.publisher || '').trim(), found: f.publisher ?? null, source: f.publisherSource ?? null },
        });
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setRows(out);
    setPhase('ready');
  };

  const changes: Change[] = useMemo(() => {
    const list: Change[] = [];
    rows.forEach(row => {
      const y = row.year;
      if (y.found && y.found !== y.current) {
        list.push({ row, field: 'year', from: String(y.current ?? '—'), to: String(y.found) });
      } else if (!y.found && y.current !== null && (y.invented || !keepUnconfirmedYears)) {
        list.push({ row, field: 'year', from: String(y.current), to: null });
      }

      const p = row.publisher;
      const placeholder = !p.current || isInventedPublisher(p.current);
      if (placeholder && p.found && !samePublisher(p.current, p.found)) {
        list.push({ row, field: 'publisher', from: p.current || '—', to: p.found });
      } else if (placeholder && p.current && !p.found) {
        list.push({ row, field: 'publisher', from: p.current, to: null });
      }
      // A real-looking publisher is never touched — see the header comment.
    });
    return list.sort((a, b) => a.row.title.localeCompare(b.row.title) || a.field.localeCompare(b.field));
  }, [rows, keepUnconfirmedYears]);

  const count = (field: Change['field'], blank: boolean) =>
    changes.filter(c => c.field === field && (c.to === null) === blank).length;
  const unconfirmedYears = rows.filter(r => !r.year.found && !r.year.invented && r.year.current !== null).length;

  const apply = async () => {
    setPhase('applying');
    // One write per book, carrying whichever of its two fields change.
    const byBook = new Map<string, Record<string, number | string | FieldValue>>();
    changes.forEach(c => {
      const patch = byBook.get(c.row.id) || {};
      const key = c.field === 'year' ? 'publishedYear' : 'publisher';
      patch[key] = c.to === null ? deleteField() : (c.field === 'year' ? Number(c.to) : c.to);
      byBook.set(c.row.id, patch);
    });
    const entries = [...byBook.entries()];
    setProgress({ done: 0, total: entries.length });
    let written = 0, failed = 0;
    for (let i = 0; i < entries.length; i += 400) {
      const slice = entries.slice(i, i + 400);
      const batch = writeBatch(db);
      slice.forEach(([id, patch]) =>
        batch.update(doc(db, 'books', id), { ...patch, updatedAt: new Date().toISOString() }));
      try {
        await batch.commit();
        written += slice.length;
      } catch (err) {
        console.error('Edition batch failed:', err);
        failed += slice.length;
      }
      setProgress({ done: Math.min(i + 400, entries.length), total: entries.length });
    }
    setResult({ written, failed });
    setPhase('done');
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md" onClick={phase === 'applying' ? undefined : onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-[32px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-natural-border flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-zera-emerald uppercase tracking-tight flex items-center gap-2">
              <CalendarCheck className="w-5 h-5" /> Correct Years &amp; Publishers
            </h3>
            <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest mt-0.5">
              Looks up each book's real edition details by ISBN
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={phase === 'applying'} title="Close"
            className="shrink-0 p-2 rounded-xl border border-natural-border text-natural-muted hover:text-rose-500 transition-colors disabled:opacity-30">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {phase === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-natural-text leading-relaxed">
                Many books carry a year or publisher the system <em>made up</em> — the year they were catalogued, or an
                imprint like “Zera Academic Press”. This checks every book against Open Library and the Library of
                Congress and shows you every correction before anything is saved.
              </p>
              <p className="text-xs text-natural-muted">Takes a few minutes. Nothing is written until you press Apply.</p>
              <button type="button" onClick={scan}
                className="px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark shadow-md">
                Scan the catalogue
              </button>
            </div>
          )}

          {(phase === 'scanning' || phase === 'applying') && (
            <div className="py-10 space-y-3 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-zera-emerald mx-auto" />
              <p className="text-sm font-bold text-natural-text">
                {phase === 'scanning' ? 'Looking up' : 'Saving'} {progress.done} of {progress.total}…
              </p>
              <div className="h-2 bg-natural-bg rounded-full overflow-hidden max-w-sm mx-auto">
                <div className="h-full bg-zera-emerald transition-all" style={{ width: `${pct}%` }} />
              </div>
              {phase === 'applying' && <p className="text-[10px] font-bold uppercase tracking-widest text-natural-muted">Keep this window open</p>}
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  ['Years corrected', count('year', false), 'text-zera-emerald'],
                  ['Years blanked', count('year', true), 'text-amber-600'],
                  ['Publishers corrected', count('publisher', false), 'text-zera-emerald'],
                  ['Publishers blanked', count('publisher', true), 'text-amber-600'],
                ] as const).map(([label, n, tone]) => (
                  <div key={label} className="rounded-2xl border border-natural-border p-4">
                    <p className={cn('text-2xl font-black', tone)}>{n}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-natural-muted">{label}</p>
                  </div>
                ))}
              </div>

              {unconfirmedYears > 0 && (
                <label className="flex items-start gap-3 p-4 rounded-2xl bg-natural-bg border border-natural-border cursor-pointer">
                  <input type="checkbox" checked={keepUnconfirmedYears} onChange={e => setKeepUnconfirmedYears(e.target.checked)}
                    className="mt-0.5 accent-zera-emerald w-4 h-4 shrink-0" />
                  <span className="text-xs text-natural-text leading-relaxed">
                    <strong>Keep {unconfirmedYears} unconfirmed years instead of blanking them.</strong> No source can
                    confirm these. Many came from AI enrichment or are the year the <em>work</em> was first written rather
                    than this edition (e.g. Macbeth recorded as 1508). Leave unticked to blank them.
                  </span>
                </label>
              )}

              {changes.length > 0 ? (
                <div className="rounded-2xl border border-natural-border overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-natural-bg text-[9px] font-black uppercase tracking-widest text-natural-muted">
                      <tr>
                        <th className="px-4 py-2">Book</th><th className="px-3 py-2">Field</th>
                        <th className="px-3 py-2">Now</th><th className="px-3 py-2">Becomes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-natural-bg">
                      {changes.slice(0, 400).map((c, i) => (
                        <tr key={`${c.row.id}-${c.field}-${i}`}>
                          <td className="px-4 py-2 font-bold text-natural-text max-w-[220px] truncate" title={c.row.title}>{c.row.title}</td>
                          <td className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-natural-muted">{c.field}</td>
                          <td className="px-3 py-2 text-natural-muted line-through max-w-[160px] truncate" title={c.from}>{c.from}</td>
                          <td className={cn('px-3 py-2 font-black max-w-[200px] truncate', c.to ? 'text-zera-emerald' : 'text-amber-600')} title={c.to ?? 'blank'}>
                            {c.to ?? 'blank'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {changes.length > 400 && <p className="px-4 py-2 text-[10px] font-bold text-natural-muted">…and {changes.length - 400} more</p>}
                </div>
              ) : (
                <p className="text-sm text-natural-muted italic">Everything is already correct — nothing to change.</p>
              )}
            </>
          )}

          {phase === 'done' && result && (
            <div className="py-10 text-center space-y-2">
              {result.failed === 0 ? <CheckCircle2 className="w-10 h-10 mx-auto text-zera-emerald" /> : <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />}
              <p className="text-lg font-black text-natural-text">{result.written} books corrected</p>
              {result.failed > 0 && <p className="text-sm text-rose-600 font-bold">{result.failed} could not be saved — run it again to retry.</p>}
            </div>
          )}
        </div>

        {phase === 'ready' && changes.length > 0 && (
          <div className="p-4 border-t border-natural-border bg-natural-bg/50 flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold text-natural-muted">Only the year and publisher change · real-looking publishers are never touched</p>
            <button type="button" onClick={apply}
              className="shrink-0 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark shadow-md">
              Apply {changes.length} changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
