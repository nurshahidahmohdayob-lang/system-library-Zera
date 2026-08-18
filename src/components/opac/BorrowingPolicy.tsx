import React from 'react';
import { GraduationCap, Users, CalendarCheck, BookOpen, Clock, Info } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { BORROWING_POLICY, LIBRARY_BOOKING_NOTICE } from '@/src/lib/borrowingPolicy';

/**
 * The borrowing rules, shown to members in the portal.
 *
 * The figures come from src/lib/borrowingPolicy.ts — the same module the
 * circulation desk enforces — so what a member reads here is exactly what the
 * librarian's terminal will do when they hand a book over.
 */
export const BorrowingPolicy: React.FC = () => (
  <section className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="p-3 bg-zera-yellow/20 rounded-2xl">
        <BookOpen className="w-6 h-6 text-zera-emerald" />
      </div>
      <div>
        <h3 className="text-xl font-black text-zera-emerald uppercase tracking-tight">Borrowing Policy</h3>
        <p className="text-[10px] font-bold text-natural-muted uppercase tracking-widest">
          How many books you may take, and for how long
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {BORROWING_POLICY.map(rule => {
        const isStudent = rule.audience === 'student';
        const Icon = isStudent ? GraduationCap : Users;
        return (
          <article
            key={rule.audience}
            className={cn(
              'rounded-[40px] p-8 border shadow-sm flex flex-col gap-6',
              isStudent
                ? 'bg-white border-natural-border'
                : 'bg-zera-emerald text-white border-zera-emerald-dark'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2.5 rounded-2xl', isStudent ? 'bg-zera-emerald/10' : 'bg-white/15')}>
                <Icon className={cn('w-5 h-5', isStudent ? 'text-zera-emerald' : 'text-white')} />
              </div>
              <h4 className={cn('text-lg font-serif font-black', isStudent ? 'text-zera-emerald' : 'text-white')}>
                {rule.title}
              </h4>
            </div>

            {/* The two figures a member actually needs at a glance. */}
            <div className="grid grid-cols-2 gap-4">
              <div className={cn('rounded-3xl p-4', isStudent ? 'bg-natural-bg' : 'bg-white/10')}>
                <p className={cn(
                  'text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1',
                  isStudent ? 'text-natural-muted' : 'text-white/60'
                )}>
                  <BookOpen className="w-3 h-3" /> At a time
                </p>
                <p className={cn('text-xl font-black leading-tight', isStudent ? 'text-natural-text' : 'text-white')}>
                  {rule.limit}
                </p>
              </div>
              <div className={cn('rounded-3xl p-4', isStudent ? 'bg-natural-bg' : 'bg-white/10')}>
                <p className={cn(
                  'text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1',
                  isStudent ? 'text-natural-muted' : 'text-white/60'
                )}>
                  <Clock className="w-3 h-3" /> Loan period
                </p>
                <p className={cn('text-xl font-black leading-tight', isStudent ? 'text-natural-text' : 'text-white')}>
                  {rule.duration}
                </p>
              </div>
            </div>

            <ul className="space-y-2.5">
              {rule.notes.map(note => (
                <li key={note} className="flex gap-2.5 items-start">
                  <span className={cn(
                    'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                    isStudent ? 'bg-zera-yellow-dark' : 'bg-zera-yellow'
                  )} />
                  <span className={cn(
                    'text-xs font-medium leading-relaxed',
                    isStudent ? 'text-natural-text' : 'text-white/85'
                  )}>
                    {note}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>

    {/* Booking the space is a separate matter from borrowing books, but it is
        the same conversation with the librarian — and a clash costs a lesson. */}
    <div className="bg-zera-yellow/15 border border-zera-yellow/40 rounded-[32px] p-7 flex gap-5">
      <div className="p-3 bg-zera-yellow/30 rounded-2xl h-fit shrink-0">
        <CalendarCheck className="w-6 h-6 text-zera-emerald-dark" />
      </div>
      <div className="space-y-1.5">
        <h4 className="text-base font-black text-zera-emerald uppercase tracking-tight">
          {LIBRARY_BOOKING_NOTICE.title}
        </h4>
        <p className="text-xs font-medium text-natural-text leading-relaxed">
          {LIBRARY_BOOKING_NOTICE.body}
        </p>
      </div>
    </div>

    <p className="flex items-center gap-2 text-[10px] font-bold text-natural-muted uppercase tracking-widest">
      <Info className="w-3.5 h-3.5 shrink-0" />
      Please speak to the librarian if you need a book for longer
    </p>
  </section>
);
