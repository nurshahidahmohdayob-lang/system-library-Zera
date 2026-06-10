import React, { useState } from 'react';
import { Bookmark, Check, X, Clock, Inbox, Loader2, GraduationCap, User as UserIcon, Mail } from 'lucide-react';
import { useAllHolds } from '@/src/hooks/useHolds';
import { HoldService } from '@/src/services/libraryService';
import { Hold } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { format, parseISO } from 'date-fns';

const fmt = (iso?: string) => {
  if (!iso) return '';
  try { return format(parseISO(iso), "MMM d, yyyy • h:mm a"); } catch { return iso; }
};

const resolvedChip: Record<string, string> = {
  fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-natural-bg text-natural-muted border-natural-border',
  rejected: 'bg-red-50 text-red-600 border-red-200',
};

export const HoldRequests: React.FC = () => {
  const holds = useAllHolds(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = holds.filter(h => h.status === 'pending');
  const ready = holds.filter(h => h.status === 'ready');
  const resolved = holds.filter(h => ['fulfilled', 'cancelled', 'rejected'].includes(h.status));

  const act = async (id: string, status: Hold['status']) => {
    setBusyId(id);
    try { await HoldService.updateHoldStatus(id, status); }
    catch (e) { console.error('Hold update failed:', e); }
    finally { setBusyId(null); }
  };

  const HoldCard: React.FC<{ hold: Hold; actions?: React.ReactNode }> = ({ hold, actions }) => (
    <div className="flex gap-4 p-5 bg-white border border-natural-border rounded-3xl shadow-sm">
      <div className="w-14 h-20 bg-natural-bg rounded-xl overflow-hidden flex-shrink-0 border border-natural-border">
        <img
          src={hold.bookCoverUrl || 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'}
          onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=200'; }}
          className="w-full h-full object-cover" alt={hold.bookTitle} referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-serif font-black text-zera-emerald leading-tight truncate">{hold.bookTitle}</h4>
        {hold.bookAuthor && <p className="text-[11px] font-bold text-natural-muted truncate">By {hold.bookAuthor}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] font-bold text-natural-text">
          <span className="inline-flex items-center gap-1.5">
            {hold.userRole === 'teacher' ? <GraduationCap className="w-3.5 h-3.5 text-zera-emerald" /> : <UserIcon className="w-3.5 h-3.5 text-zera-emerald" />}
            {hold.userName}
            <span className="px-1.5 py-0.5 rounded bg-natural-bg text-[9px] uppercase tracking-wider text-natural-muted">{hold.userRole || 'member'}</span>
          </span>
          {hold.userEmail && (
            <span className="inline-flex items-center gap-1 text-natural-muted"><Mail className="w-3 h-3" />{hold.userEmail}</span>
          )}
          <span className="inline-flex items-center gap-1 text-natural-muted"><Clock className="w-3 h-3" />{fmt(hold.requestedAt)}</span>
        </div>
      </div>
      {actions && <div className="flex flex-col gap-2 shrink-0 self-center">{actions}</div>}
    </div>
  );

  const Btn = ({ id, status, label, tone, icon }: { id: string; status: Hold['status']; label: string; tone: 'green' | 'yellow' | 'red'; icon: React.ReactNode }) => (
    <button
      onClick={() => act(id, status)}
      disabled={busyId === id}
      className={cn(
        "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 whitespace-nowrap",
        tone === 'green' && "bg-zera-emerald text-white hover:bg-zera-emerald-dark",
        tone === 'yellow' && "bg-zera-yellow text-zera-emerald-dark hover:brightness-95",
        tone === 'red' && "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
      )}
    >
      {busyId === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}{label}
    </button>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-zera-yellow/20 rounded-2xl"><Bookmark className="w-6 h-6 text-zera-emerald" /></div>
        <div>
          <h2 className="text-2xl font-serif font-black text-zera-emerald">Hold Requests</h2>
          <p className="text-xs font-bold text-natural-muted uppercase tracking-wide">
            {pending.length} pending · {ready.length} ready for pickup
          </p>
        </div>
      </div>

      {/* Pending — the actionable notifications */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-natural-muted">New Requests</h3>
        {pending.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-natural-border rounded-3xl">
            <Inbox className="w-10 h-10 text-natural-muted/50 mx-auto mb-3" />
            <p className="text-natural-muted font-serif italic">No pending hold requests right now.</p>
          </div>
        ) : pending.map(hold => (
          <HoldCard key={hold.id} hold={hold} actions={
            <>
              <Btn id={hold.id} status="ready" label="Set Ready" tone="yellow" icon={<Bookmark className="w-3.5 h-3.5" />} />
              <Btn id={hold.id} status="fulfilled" label="Borrowed" tone="green" icon={<Check className="w-3.5 h-3.5" />} />
              <Btn id={hold.id} status="rejected" label="Decline" tone="red" icon={<X className="w-3.5 h-3.5" />} />
            </>
          } />
        ))}
      </section>

      {/* Ready for pickup */}
      {ready.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-natural-muted">Ready for Pickup</h3>
          {ready.map(hold => (
            <HoldCard key={hold.id} hold={hold} actions={
              <>
                <Btn id={hold.id} status="fulfilled" label="Borrowed" tone="green" icon={<Check className="w-3.5 h-3.5" />} />
                <Btn id={hold.id} status="rejected" label="Decline" tone="red" icon={<X className="w-3.5 h-3.5" />} />
              </>
            } />
          ))}
        </section>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-natural-muted">History</h3>
          <div className="divide-y divide-natural-border bg-white border border-natural-border rounded-3xl px-5">
            {resolved.slice(0, 40).map(hold => (
              <div key={hold.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-zera-emerald text-sm truncate">{hold.bookTitle}</p>
                  <p className="text-[10px] font-bold text-natural-muted uppercase">{hold.userName} · {fmt(hold.updatedAt || hold.requestedAt)}</p>
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0", resolvedChip[hold.status])}>
                  {hold.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
