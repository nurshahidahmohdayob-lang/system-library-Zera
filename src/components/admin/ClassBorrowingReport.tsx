import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, Download, X, Users, BookOpen } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { UserProfile, Loan } from '@/src/types';
import { cn } from '@/src/lib/utils';

/**
 * "Who in this class has borrowed what" — the register a librarian needs when
 * chasing a year group before the holidays, or handing a class list to a form
 * teacher.
 *
 * Students are grouped by whichever field the school actually fills in, because
 * the two are used inconsistently: `cohort` carries the year group on nearly
 * every record, while `grade` holds the class name on about half. Neither alone
 * covers the school, so the grouping field is the librarian's choice rather than
 * something hardcoded here.
 */

type GroupField = 'cohort' | 'grade';

interface Row {
  student: UserProfile;
  loans: Loan[];
}

/**
 * Group names are used exactly as recorded.
 *
 * "Year 1" and "Year 1 2026" look like one group spelled two ways, and folding
 * them together seemed obviously right — but they are different children. The
 * two sets share no name and no student id, and their id ranges barely overlap
 * (3719-6120 against 6095-6488): the bare form is an earlier intake, the
 * suffixed one is the current year. Merging them put 33 students in a Year 1
 * report that has 13, silently mixing a cohort that has since moved up.
 *
 * So the suffix is meaningful and stays. Only the sort is adjusted, to keep
 * the two forms of a year adjacent and put Year 2 before Year 10.
 */
/** Shown for students whose grouping field is empty, so they stay reachable. */
const UNSET = '(No class recorded)';

const val = (u: UserProfile, f: GroupField) =>
  String((u as unknown as Record<string, unknown>)[f] ?? '').trim();

/**
 * Grouping key, with blanks folded into one visible bucket.
 *
 * 136 of 276 students have no class recorded — every student in Years 8, 9, 10
 * and 11, and all but three of Year 7. Dropping blanks would make those
 * children unreachable from this report entirely, and silently: the year simply
 * would not appear in the list, which reads as "no such class" rather than "no
 * class recorded".
 */
const groupKey = (u: UserProfile, f: GroupField) => val(u, f) || UNSET;

const fmt = (v: unknown): string => {
  if (!v) return '';
  const d = typeof v === 'string' || typeof v === 'number'
    ? new Date(v)
    : (v as { toDate?: () => Date; seconds?: number })?.toDate?.()
      ?? (typeof (v as { seconds?: number })?.seconds === 'number' ? new Date((v as { seconds: number }).seconds * 1000) : null);
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const ClassBorrowingReport: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupField>('cohort');
  const [selected, setSelected] = useState<string>('');
  const [onlyBorrowers, setOnlyBorrowers] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [u, l] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'loans'))]);
        setMembers(u.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)).filter(m => m.role === 'student'));
        setLoans(l.docs.map(d => ({ ...d.data(), id: d.id } as Loan)));
      } catch (err) {
        console.error('Report load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Every group value that has at least one student, with its size. */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach(m => {
      const v = groupKey(m, groupBy);
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    // Year 2 before Year 10, and the two spellings of a year side by side;
    // anything without a year number sorts after them.
    const yearNum = (g: string) => {
      const m = g.match(/^year\s*(\d+)\b/i);
      return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
    };
    return [...counts.entries()].sort((a, b) =>
      // The unset bucket sits last — it is a gap to fix, not a class.
      Number(a[0] === UNSET) - Number(b[0] === UNSET) ||
      yearNum(a[0]) - yearNum(b[0]) ||
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [members, groupBy]);

  // Reset the selection when the grouping changes — a class name is not a valid
  // year group, so carrying it across would silently produce an empty report.
  useEffect(() => { setSelected(''); }, [groupBy]);

  const rows: Row[] = useMemo(() => {
    if (!selected) return [];
    return members
      .filter(m => groupKey(m, groupBy) === selected)
      .map(student => ({
        student,
        loans: loans
          .filter(l => l.userId === student.uid)
          .sort((a, b) => String(b.checkoutDate || '').localeCompare(String(a.checkoutDate || ''))),
      }))
      .filter(r => (onlyBorrowers ? r.loans.length > 0 : true))
      .sort((a, b) => String(a.student.name || '').localeCompare(String(b.student.name || '')));
  }, [members, loans, groupBy, selected, onlyBorrowers]);

  const totalLoans = rows.reduce((n, r) => n + r.loans.length, 0);
  const totalOut = rows.reduce((n, r) => n + r.loans.filter(l => l.status === 'active').length, 0);
  const label = groupBy === 'cohort' ? 'Year group' : 'Class';

  const buildHtml = () => `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(selected)} — Borrowing Report</title><style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1f2a24;margin:36px}
  h1{color:#1e6b52;font-size:22px;margin:0 0 4px}
  .meta{font-size:12px;color:#5b6b63;margin-bottom:18px}
  h2{font-size:14px;color:#1e6b52;margin:22px 0 4px;border-left:4px solid #f2c14e;padding-left:8px}
  table{width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:4px}
  th{background:#1e6b52;color:#fff;text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:7px 10px;border-bottom:1px solid #e2e8e4}
  .none{font-style:italic;color:#8a978f;font-size:12px;margin:4px 0 0}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>Zera International Library — ${esc(label)}: ${esc(selected)}</h1>
<div class="meta"><strong>${rows.length}</strong> students · <strong>${totalLoans}</strong> books borrowed · <strong>${totalOut}</strong> still out · printed ${esc(fmt(new Date().toISOString()))}</div>
${rows.map(r => `<h2>${esc(r.student.name)}${r.student.studentId ? ` &middot; ${esc(r.student.studentId)}` : ''}</h2>
${r.loans.length === 0 ? '<p class="none">No books borrowed.</p>' : `<table><thead><tr><th>Book</th><th>Borrowed</th><th>Due / Returned</th><th>Status</th></tr></thead><tbody>
${r.loans.map(l => `<tr><td>${esc(l.bookTitle)}</td><td>${esc(fmt(l.checkoutDate))}</td><td>${esc(l.status === 'returned' ? fmt(l.returnDate) : fmt(l.dueDate))}</td><td>${l.status === 'returned' ? 'Returned' : 'Out'}</td></tr>`).join('')}
</tbody></table>`}`).join('')}
</body></html>`;

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print this report.'); return; }
    w.document.write(buildHtml());
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const csv = () => {
    // One row per loan, with the student repeated — the shape a spreadsheet can
    // pivot, rather than the visually grouped layout used on screen.
    const lines = [['Student', 'Student ID', label, 'Book', 'Borrowed', 'Due / Returned', 'Status'].join(',')];
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    rows.forEach(r => {
      if (r.loans.length === 0) {
        lines.push([q(r.student.name), q(r.student.studentId), q(selected), q('(none)'), '', '', ''].join(','));
      }
      r.loans.forEach(l => lines.push([
        q(r.student.name), q(r.student.studentId), q(selected), q(l.bookTitle),
        q(fmt(l.checkoutDate)), q(l.status === 'returned' ? fmt(l.returnDate) : fmt(l.dueDate)),
        q(l.status === 'returned' ? 'Returned' : 'Out'),
      ].join(',')));
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}-borrowing.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-[32px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-natural-border space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-zera-emerald uppercase tracking-tight">Borrowing by Class</h3>
              <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest mt-0.5">
                Every student in a group and the books they borrowed
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

            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="px-4 py-2 bg-natural-bg border border-natural-border rounded-full text-xs font-bold text-natural-text focus:outline-none focus:ring-2 focus:ring-zera-emerald"
            >
              <option value="">Choose a {label.toLowerCase()}…</option>
              {groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
            </select>

            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-natural-muted cursor-pointer">
              <input type="checkbox" checked={onlyBorrowers} onChange={e => setOnlyBorrowers(e.target.checked)}
                className="accent-zera-emerald w-3.5 h-3.5" />
              Borrowers only
            </label>

            <div className="ml-auto flex gap-2">
              <button type="button" onClick={print} disabled={!selected || rows.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-emerald text-white hover:bg-zera-emerald-dark shadow-sm transition-all disabled:opacity-40">
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button type="button" onClick={csv} disabled={!selected || rows.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-yellow text-zera-emerald-dark hover:brightness-95 shadow-sm transition-all disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {selected && (
            <div className="flex flex-wrap gap-2">
              {[[`${rows.length} students`, Users], [`${totalLoans} borrowed`, BookOpen], [`${totalOut} still out`, BookOpen]]
                .map(([text, Icon]: any, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-zera-emerald/10 text-zera-emerald border border-zera-emerald/20">
                    <Icon className="w-3 h-3" /> {text}
                  </span>
                ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zera-emerald" /></div>
          ) : !selected ? (
            <p className="py-20 text-center text-natural-muted font-serif italic text-lg">
              Choose a {label.toLowerCase()} above to build the report.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-20 text-center text-natural-muted font-serif italic text-lg">
              No students {onlyBorrowers ? 'in this group have borrowed anything' : 'found in this group'}.
            </p>
          ) : (
            <div className="space-y-5">
              {rows.map(r => (
                <div key={r.student.uid} className="rounded-2xl border border-natural-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-natural-bg flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-natural-text truncate">
                      {r.student.name}
                      {r.student.studentId && <span className="ml-2 text-[10px] font-bold text-natural-muted">{r.student.studentId}</span>}
                    </p>
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-natural-muted">
                      {r.loans.length} book{r.loans.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {r.loans.length === 0 ? (
                    <p className="px-4 py-3 text-xs font-medium italic text-natural-muted">No books borrowed.</p>
                  ) : (
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-natural-bg">
                        {r.loans.map(l => (
                          <tr key={l.id} className="text-sm">
                            <td className="px-4 py-2.5 font-bold text-natural-text">{l.bookTitle}</td>
                            <td className="px-3 py-2.5 text-xs text-natural-muted whitespace-nowrap">{fmt(l.checkoutDate) || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-natural-muted whitespace-nowrap">
                              {l.status === 'returned' ? (fmt(l.returnDate) || '—') : (fmt(l.dueDate) || '—')}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border whitespace-nowrap',
                                l.status === 'returned'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-400 text-amber-900 border-amber-300')}>
                                {l.status === 'returned' ? 'Returned' : 'Out'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
