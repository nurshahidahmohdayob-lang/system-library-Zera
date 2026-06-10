import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Hold } from '@/src/types';

const byRequestedAtDesc = (a: Hold, b: Hold) => (b.requestedAt || '').localeCompare(a.requestedAt || '');

/** Live count of pending holds — powers the librarian notification badge. */
export function usePendingHoldsCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    const q = query(collection(db, 'holds'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => setCount(snap.size), () => setCount(0));
    return () => unsub();
  }, [enabled]);
  return count;
}

/** Live holds for one member (their "My Holds" section). */
export function useUserHolds(userId?: string): Hold[] {
  const [holds, setHolds] = useState<Hold[]>([]);
  useEffect(() => {
    if (!userId) { setHolds([]); return; }
    const q = query(collection(db, 'holds'), where('userId', '==', userId));
    const unsub = onSnapshot(q, (snap) => {
      setHolds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Hold)).sort(byRequestedAtDesc));
    }, () => setHolds([]));
    return () => unsub();
  }, [userId]);
  return holds;
}

/** Live full holds list — the librarian inbox (admin only). */
export function useAllHolds(enabled: boolean): Hold[] {
  const [holds, setHolds] = useState<Hold[]>([]);
  useEffect(() => {
    if (!enabled) { setHolds([]); return; }
    const unsub = onSnapshot(collection(db, 'holds'), (snap) => {
      setHolds(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Hold)).sort(byRequestedAtDesc));
    }, () => setHolds([]));
    return () => unsub();
  }, [enabled]);
  return holds;
}
