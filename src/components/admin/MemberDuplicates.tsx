import React, { useEffect, useState } from 'react';
import { Loader2, Trash2, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { UserProfile, Loan } from '@/src/types';
import { cn } from '@/src/lib/utils';

/**
 * Finds members that exist more than once and lets an admin remove the spare.
 *
 * This has to live in the app rather than in a maintenance script: Firestore
 * rules only allow `delete` on /users for a signed-in admin, so the librarian's
 * own session is the only thing that can carry the write.
 *
 * Nothing is ever deleted automatically. The panel's job is to surface the facts
 * that decide which record is the keeper — who holds the loan history, which one
 * came from the school registry, and which is only a by-product of signing in.
 */

type Dupe = UserProfile & {
  loansTotal: number;
  loansActive: number;
  /** Came from the School API sync — the authoritative record, with the real name. */
  fromRegistry: boolean;
  /** Created purely by signing in (doc id == auth uid, never synced). */
  isLoginStub: boolean;
};

const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Which record should survive. A registry record wins outright: it carries the
 * proper name and accession barcode, and the sync would recreate it anyway.
 * Failing that, the record holding the borrowing history wins, because deleting
 * it would orphan those loans.
 */
const rankKeeper = (a: Dupe, b: Dupe): number =>
  Number(b.fromRegistry) - Number(a.fromRegistry) ||
  b.loansTotal - a.loansTotal ||
  String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

export const MemberDuplicates: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [groups, setGroups] = useState<{ key: string; label: string; records: Dupe[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userSnap, loanSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'loans')),
      ]);
      const loans = loanSnap.docs.map(d => d.data() as Loan);
      const users: Dupe[] = userSnap.docs.map(d => {
        const data = d.data() as UserProfile;
        const mine = loans.filter(l => l.userId === d.id);
        return {
          ...data,
          uid: d.id,
          loansTotal: mine.length,
          loansActive: mine.filter(l => l.status === 'active').length,
          fromRegistry: Boolean(data.syncSource || data.studentId || data.barcode),
          isLoginStub: !data.syncSource && !data.barcode && !data.studentId,
        };
      });

      // Same email is the strongest signal — it is one human with several
      // records. Same name with no email on either side is the weaker fallback,
      // and may legitimately be two different people who share a name.
      const buckets = new Map<string, Dupe[]>();
      users.forEach(u => {
        const key = norm(u.email) ? `email:${norm(u.email)}` : (norm(u.name) ? `name:${norm(u.name)}` : '');
        if (key) buckets.set(key, [...(buckets.get(key) || []), u]);
      });

      const found = [...buckets.entries()]
        .filter(([, v]) => v.length > 1)
        .map(([key, v]) => ({
          key,
          label: key.startsWith('email:') ? key.slice(6) : `${key.slice(5)} (matched on name only)`,
          records: [...v].sort(rankKeeper),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      setGroups(found);
    } catch (err) {
      console.error('Duplicate scan failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remove = async (rec: Dupe) => {
    if (confirmId !== rec.uid) {
      setConfirmId(rec.uid);
      setTimeout(() => setConfirmId(c => (c === rec.uid ? null : c)), 4000);
      return;
    }
    setBusyId(rec.uid);
    try {
      await deleteDoc(doc(db, 'users', rec.uid));
      setGroups(prev => prev
        .map(g => ({ ...g, records: g.records.filter(r => r.uid !== rec.uid) }))
        .filter(g => g.records.length > 1));
    } catch (err) {
      console.error('Delete failed:', err);
      alert(`Could not delete this record: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const totalSpare = groups.reduce((n, g) => n + g.records.length - 1, 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-zera-emerald/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white rounded-[32px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-natural-border flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-zera-emerald uppercase tracking-tight">Duplicate Members</h3>
            <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest mt-0.5">
              {loading ? 'Scanning…' : `${groups.length} people with more than one record · ${totalSpare} spare`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} disabled={loading} title="Rescan"
              className="p-2 rounded-xl border border-natural-border text-natural-muted hover:text-zera-emerald transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button type="button" onClick={onClose} title="Close"
              className="p-2 rounded-xl border border-natural-border text-natural-muted hover:text-rose-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zera-emerald" /></div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold flex gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" /> {error}
            </div>
          )}

          {!loading && !error && groups.length === 0 && (
            <div className="py-16 text-center text-natural-muted font-serif italic text-lg opacity-50">
              No duplicate members found.
            </div>
          )}

          {groups.map(group => (
            <div key={group.key} className="rounded-3xl border border-natural-border overflow-hidden">
              <div className="px-5 py-3 bg-natural-bg border-b border-natural-border">
                <p className="text-[11px] font-black uppercase tracking-widest text-natural-text truncate">{group.label}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-natural-muted">{group.records.length} records</p>
              </div>
              <div className="divide-y divide-natural-bg">
                {group.records.map((rec, idx) => {
                  const keeper = idx === 0;
                  const blocked = rec.loansActive > 0;
                  return (
                    <div key={rec.uid} className={cn('p-4 flex items-start gap-4', keeper && 'bg-emerald-50/40')}>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black text-natural-text truncate">{rec.name || '(no name)'}</p>
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-natural-bg border border-natural-border text-natural-muted">
                            {rec.role}
                          </span>
                          {keeper && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-zera-emerald text-white flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Suggested keep
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-natural-muted tracking-wide truncate">
                          id {rec.uid.slice(0, 10)}
                          {rec.studentId ? ` · ID ${rec.studentId}` : ''}
                          {rec.barcode ? ` · ${rec.barcode}` : ''}
                          {` · ${rec.loansTotal} loans (${rec.loansActive} active)`}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest">
                          {rec.fromRegistry
                            ? <span className="text-zera-emerald">From school registry</span>
                            : <span className="text-amber-600">Created by signing in — returns on next login</span>}
                        </p>
                        {blocked && (
                          <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> Has books out — return them before deleting
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={blocked || busyId === rec.uid}
                        onClick={() => remove(rec)}
                        className={cn(
                          'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all',
                          blocked
                            ? 'opacity-40 cursor-not-allowed border-natural-border text-natural-muted'
                            : confirmId === rec.uid
                              ? 'bg-rose-500 text-white border-rose-600'
                              : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                        )}
                      >
                        {busyId === rec.uid
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        {confirmId === rec.uid ? 'Confirm?' : 'Delete'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-natural-border bg-natural-bg/50">
          <p className="text-[10px] font-bold text-natural-muted leading-relaxed">
            Records marked <span className="text-amber-600 font-black uppercase">created by signing in</span> come back
            the next time that person logs in — delete the registry record's twin only, and rename the keeper if needed.
            Registry records deleted here are recreated by the next student/staff sync.
          </p>
        </div>
      </div>
    </div>
  );
};
