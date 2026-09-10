import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X, CheckCircle2, AlertCircle, BookOpen, Users } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { UserProfile, Loan } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { issueBook, LendingError } from '@/src/services/lendingService';
import { STUDENT_LOAN_LIMIT } from '@/src/lib/borrowingPolicy';

/**
 * Issue books to a whole class in one pass.
 *
 * The lending terminal is built for one borrower at a time: choose a member,
 * scan, then clear and choose the next. With a class queueing at the desk that
 * is thirty round trips through the member picker. Here the register is already
 * on screen and each child has their own box, so the librarian scans down the
 * list and never selects anybody.
 */

type GroupField = 'cohort' | 'grade';
const UNSET = '(No class recorded)';

interface RowState {
  issuing: boolean;
  error: string | null;
  issued: { title: string; barcode: string }[];
}

const val = (u: UserProfile, f: GroupField) =>
  String((u as unknown as Record<string, unknown>)[f] ?? '').trim();
const groupKey = (u: UserProfile, f: GroupField) => val(u, f) || UNSET;

export const ClassLending: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [existingLoans, setExistingLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupField>('cohort');
  const [selected, setSelected] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      try {
        const [u, l] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'loans'))]);
        setMembers(u.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)).filter(m => m.role === 'student'));
        setExistingLoans(l.docs.map(d => ({ ...d.data(), id: d.id } as Loan)));
      } catch (err) {
        console.error('Class lending load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach(m => {
      const v = groupKey(m, groupBy);
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    const yearNum = (g: string) => {
      const m = g.match(/^year\s*(\d+)\b/i);
      return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
    };
    return [...counts.entries()].sort((a, b) =>
      Number(a[0] === UNSET) - Number(b[0] === UNSET) ||
      yearNum(a[0]) - yearNum(b[0]) ||
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [members, groupBy]);

  useEffect(() => { setSelected(''); }, [groupBy]);

  const classList = useMemo(() =>
    selected
      ? members.filter(m => groupKey(m, groupBy) === selected)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      : [],
    [members, groupBy, selected]);

  /** Books this student already had out before this session began. */
  const heldBefore = (uid: string) =>
    existingLoans.filter(l => l.userId === uid && l.status === 'active').length;

  const issue = async (member: UserProfile) => {
    const code = (codes[member.uid] || '').trim();
    if (!code) return;

    setRows(prev => ({ ...prev, [member.uid]: { ...(prev[member.uid] || { issued: [] }), issuing: true, error: null } as RowState }));
    try {
      // The limit counts what they already held plus anything issued here, so a
      // class session cannot quietly push a child past it one scan at a time.
      const alreadyIssuedHere = rows[member.uid]?.issued.length || 0;
      const { book } = await issueBook(member, code, {
        limit: Math.max(0, STUDENT_LOAN_LIMIT - alreadyIssuedHere),
      });
      setRows(prev => ({
        ...prev,
        [member.uid]: {
          issuing: false,
          error: null,
          issued: [...(prev[member.uid]?.issued || []), { title: book.title, barcode: book.barcode || '' }],
        },
      }));
      setCodes(prev => ({ ...prev, [member.uid]: '' }));
      inputs.current[member.uid]?.focus();
    } catch (err) {
      setRows(prev => ({
        ...prev,
        [member.uid]: {
          issuing: false,
          error: err instanceof LendingError ? err.message : 'Could not issue this book.',
          issued: prev[member.uid]?.issued || [],
        },
      }));
      if (!(err instanceof LendingError)) console.error('Issue failed:', err);
    }
  };

  const issuedTotal = Object.keys(rows).reduce((n, k) => n + (rows[k]?.issued.length || 0), 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-[32px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-natural-border space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-zera-emerald uppercase tracking-tight">Class Lending</h3>
              <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest mt-0.5">
                Scan a book beside each name — no need to pick a member
              </p>
            </div>
            <button type="button" onClick={onClose} title="Close"
              className="shrink-0 p-2 rounded-xl border border-natural-border text-natural-muted hover:text-rose-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-natural-border overflow-hidden">
              {(['cohort', 'grade'] as GroupField[]).map(f => (
                <button key={f} type="button" onClick={() => setGroupBy(f)}
                  className={cn('px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors',
                    groupBy === f ? 'bg-zera-emerald text-white' : 'bg-white text-natural-muted hover:bg-natural-bg')}>
                  {f === 'cohort' ? 'Year group' : 'Class'}
                </button>
              ))}
            </div>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="px-4 py-2 bg-natural-bg border border-natural-border rounded-full text-xs font-bold focus:outline-none focus:ring-2 focus:ring-zera-emerald">
              <option value="">Choose a {groupBy === 'cohort' ? 'year group' : 'class'}…</option>
              {groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
            </select>
            {selected && (
              <div className="ml-auto flex gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-emerald/10 text-zera-emerald border border-zera-emerald/20">
                  <Users className="w-3 h-3" /> {classList.length} students
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-yellow/25 text-zera-emerald-dark border border-zera-yellow/40">
                  <BookOpen className="w-3 h-3" /> {issuedTotal} issued now
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zera-emerald" /></div>
          ) : !selected ? (
            <p className="py-20 text-center text-natural-muted font-serif italic text-lg">
              Choose a {groupBy === 'cohort' ? 'year group' : 'class'} to bring up the register.
            </p>
          ) : classList.length === 0 ? (
            <p className="py-20 text-center text-natural-muted font-serif italic text-lg">No students in this group.</p>
          ) : (
            <div className="space-y-2">
              {classList.map(m => {
                const row = rows[m.uid];
                const before = heldBefore(m.uid);
                const now = row?.issued.length || 0;
                const atLimit = before + now >= STUDENT_LOAN_LIMIT;
                return (
                  <div key={m.uid} className="rounded-2xl border border-natural-border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:w-1/3 min-w-0">
                      <p className="text-sm font-black text-natural-text truncate">{m.name}</p>
                      <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest truncate">
                        {m.studentId || '—'}
                        {before > 0 && ` · ${before} already out`}
                      </p>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          ref={el => { inputs.current[m.uid] = el; }}
                          value={codes[m.uid] || ''}
                          onChange={e => setCodes(prev => ({ ...prev, [m.uid]: e.target.value }))}
                          onKeyDown={e => {
                            // Scanners finish with Enter; this form has no submit,
                            // so Enter is the natural "issue this one" key.
                            if (e.key === 'Enter') { e.preventDefault(); issue(m); }
                          }}
                          disabled={row?.issuing || atLimit}
                          placeholder={atLimit ? `Limit of ${STUDENT_LOAN_LIMIT} reached` : 'Scan or type accession no. / ISBN'}
                          className="flex-1 min-w-0 px-3 py-2 bg-natural-bg border border-natural-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zera-emerald disabled:opacity-50"
                        />
                        <button type="button" onClick={() => issue(m)}
                          disabled={row?.issuing || atLimit || !(codes[m.uid] || '').trim()}
                          className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark transition-all disabled:opacity-40">
                          {row?.issuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Issue'}
                        </button>
                      </div>

                      {row?.error && (
                        <p className="text-[10px] font-bold text-rose-600 flex items-start gap-1.5 leading-snug">
                          <AlertCircle className="w-3 h-3 shrink-0 mt-px" /> {row.error}
                        </p>
                      )}
                      {row?.issued.map((b, i) => (
                        <p key={i} className="text-[10px] font-bold text-emerald-700 flex items-start gap-1.5 leading-snug">
                          <CheckCircle2 className="w-3 h-3 shrink-0 mt-px" />
                          {b.title}{b.barcode && ` · ${b.barcode}`}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-natural-border bg-natural-bg/50">
          <p className="text-[10px] font-bold text-natural-muted leading-relaxed">
            Each book is issued the moment you press Enter — there is no save step. Due dates and the
            {` ${STUDENT_LOAN_LIMIT}-book `} limit follow the library policy, counting what a student already had out.
          </p>
        </div>
      </div>
    </div>
  );
};
