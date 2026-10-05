import React, { useMemo, useState } from 'react';
import { Loader2, X, CalendarCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, writeBatch, doc, deleteField } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';

/**
 * Replace invented publication years with each edition's real one.
 *
 * Until the October 2026 fix the catalogue invented years in several places —
 * "this year" when a book was added, "two years ago" from the server's
 * enrichment — so hundreds of records claim publication in the year they were
 * catalogued. This looks each book up by ISBN and writes the edition's actual
 * year.
 *
 * Runs in the librarian's session because writing /books requires an admin; a
 * maintenance script is denied.
 *
 * Two phases on purpose: scan shows every change before anything is written,
 * and Apply is a separate click.
 */

type Action = 'update' | 'blank' | 'keep';

interface Plan {
  id: string;
  title: string;
  isbn: string;
  current: number | null;
  found: number | null;
  source: string | null;
  /** The stored year matches the fingerprint of an invented value. */
  invented: boolean;
}

const yearOf = (v: unknown): number | undefined => {
  if (!v) return undefined;
  const d = typeof v === 'string' ? new Date(v)
    : typeof (v as { seconds?: number })?.seconds === 'number' ? new Date((v as { seconds: number }).seconds * 1000)
    : null;
  return d && !isNaN(d.getTime()) ? d.getFullYear() : undefined;
};

export const PublicationYearFixer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'done'>('idle');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Unconfirmed years are blanked unless the librarian opts to keep them.
  const [keepUnconfirmed, setKeepUnconfirmed] = useState(false);
  const [result, setResult] = useState<{ written: number; failed: number } | null>(null);

  const scan = async () => {
    setPhase('scanning');
    const snap = await getDocs(collection(db, 'books'));
    const books: Array<Record<string, any> & { id: string }> = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setProgress({ done: 0, total: books.length });

    const out: Plan[] = [];
    let next = 0;
    // A few lookups at a time: fast enough for ~1,000 books, gentle enough that
    // Open Library does not start refusing us partway through.
    const worker = async () => {
      while (next < books.length) {
        const b = books[next++];
        const isbn = String(b.isbn || '').replace(/[^0-9X]/gi, '');
        let found: { year: number | null; source: string | null } = { year: null, source: null };
        if (isbn.length === 10 || isbn.length === 13) {
          try {
            const r = await fetch(`/api/v1/publication-year?isbn=${isbn}`);
            if (r.ok) found = await r.json();
          } catch {
            // counted as not found
          }
        }
        const created = yearOf(b.createdAt);
        const current = typeof b.publishedYear === 'number' && b.publishedYear > 0 ? b.publishedYear : null;
        out.push({
          id: b.id,
          title: String(b.title || ''),
          isbn,
          current,
          found: found.year,
          source: found.source,
          // "This year" or "two years ago", measured from when the record was made.
          invented: !!created && current !== null && (current === created || current === created - 2),
        });
        setProgress(p => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    setPlans(out);
    setPhase('ready');
  };

  const actionFor = (p: Plan): Action => {
    if (p.found) return p.found === p.current ? 'keep' : 'update';
    if (p.current === null) return 'keep';
    if (p.invented) return 'blank';
    // A year no source can confirm. These looked trustworthy — not "this year"
    // — but checking them showed otherwise: some came from the AI enrichment
    // (Macbeth 1508, A Tale of Two Cities 1800) and the rest are first-edition
    // years of the *work* (Alice 1865 on a modern reprint's ISBN). Neither is
    // this book's publication year, so they are blanked by default.
    return keepUnconfirmed ? 'keep' : 'blank';
  };

  const counts = useMemo(() => {
    const c = { update: 0, blank: 0, keep: 0, unconfirmed: 0 };
    plans.forEach(p => {
      c[actionFor(p)]++;
      if (!p.found && !p.invented && p.current !== null) c.unconfirmed++;
    });
    return c;
  }, [plans, keepUnconfirmed]);

  const changes = plans.filter(p => actionFor(p) !== 'keep')
    .sort((a, b) => a.title.localeCompare(b.title));

  const apply = async () => {
    setPhase('applying');
    setProgress({ done: 0, total: changes.length });
    let written = 0, failed = 0;
    // Firestore batches cap at 500 writes; stay well under.
    for (let i = 0; i < changes.length; i += 400) {
      const slice = changes.slice(i, i + 400);
      const batch = writeBatch(db);
      slice.forEach(p => batch.update(doc(db, 'books', p.id), {
        publishedYear: actionFor(p) === 'update' ? p.found : deleteField(),
        updatedAt: new Date().toISOString(),
      }));
      try {
        await batch.commit();
        written += slice.length;
      } catch (err) {
        console.error('Year batch failed:', err);
        failed += slice.length;
      }
      setProgress({ done: Math.min(i + 400, changes.length), total: changes.length });
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
              <CalendarCheck className="w-5 h-5" /> Correct Publication Years
            </h3>
            <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest mt-0.5">
              Looks up each book's real edition year by ISBN
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
                Many books carry the year they were <em>catalogued</em> rather than published, because the system
                used to fill unknown years with the current one. This checks every book against Open Library and the
                Library of Congress and shows you the corrections before anything is saved.
              </p>
              <p className="text-xs text-natural-muted">Takes a few minutes for the whole catalogue. Nothing is written until you press Apply.</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['Correct year found', counts.update, 'text-zera-emerald'],
                  ['Blanked — no source confirms', counts.blank, 'text-amber-600'],
                  ['Already correct / kept', counts.keep, 'text-natural-muted'],
                ] as const).map(([label, n, tone]) => (
                  <div key={label} className="rounded-2xl border border-natural-border p-4">
                    <p className={cn('text-2xl font-black', tone)}>{n}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-natural-muted">{label}</p>
                  </div>
                ))}
              </div>

              {counts.unconfirmed > 0 && (
                <label className="flex items-start gap-3 p-4 rounded-2xl bg-natural-bg border border-natural-border cursor-pointer">
                  <input type="checkbox" checked={keepUnconfirmed} onChange={e => setKeepUnconfirmed(e.target.checked)}
                    className="mt-0.5 accent-zera-emerald w-4 h-4 shrink-0" />
                  <span className="text-xs text-natural-text leading-relaxed">
                    <strong>Keep {counts.unconfirmed} unconfirmed years instead of blanking them.</strong> No source can
                    confirm these. Many came from AI enrichment or are the year the <em>work</em> was first written rather
                    than this edition (e.g. Macbeth recorded as 1508). Leave unticked to blank them.
                  </span>
                </label>
              )}

              {changes.length > 0 ? (
                <div className="rounded-2xl border border-natural-border overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-natural-bg text-[9px] font-black uppercase tracking-widest text-natural-muted">
                      <tr><th className="px-4 py-2">Book</th><th className="px-3 py-2">Now</th><th className="px-3 py-2">Becomes</th><th className="px-4 py-2">Source</th></tr>
                    </thead>
                    <tbody className="divide-y divide-natural-bg">
                      {changes.slice(0, 300).map(p => {
                        const a = actionFor(p);
                        return (
                          <tr key={p.id}>
                            <td className="px-4 py-2 font-bold text-natural-text max-w-[260px] truncate" title={p.title}>{p.title}</td>
                            <td className="px-3 py-2 text-natural-muted line-through">{p.current ?? '—'}</td>
                            <td className={cn('px-3 py-2 font-black', a === 'update' ? 'text-zera-emerald' : 'text-amber-600')}>
                              {a === 'update' ? p.found : 'blank'}
                            </td>
                            <td className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-natural-muted">
                              {p.source || (p.isbn ? 'not found' : 'no ISBN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {changes.length > 300 && (
                    <p className="px-4 py-2 text-[10px] font-bold text-natural-muted">…and {changes.length - 300} more</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-natural-muted italic">Every year is already correct — nothing to change.</p>
              )}
            </>
          )}

          {phase === 'done' && result && (
            <div className="py-10 text-center space-y-2">
              {result.failed === 0
                ? <CheckCircle2 className="w-10 h-10 mx-auto text-zera-emerald" />
                : <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />}
              <p className="text-lg font-black text-natural-text">{result.written} books corrected</p>
              {result.failed > 0 && <p className="text-sm text-rose-600 font-bold">{result.failed} could not be saved — run it again to retry.</p>}
            </div>
          )}
        </div>

        {phase === 'ready' && changes.length > 0 && (
          <div className="p-4 border-t border-natural-border bg-natural-bg/50 flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold text-natural-muted">
              {counts.update} corrected · {counts.blank} blanked · only the year changes
            </p>
            <button type="button" onClick={apply}
              className="px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark shadow-md">
              Apply {changes.length} changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
