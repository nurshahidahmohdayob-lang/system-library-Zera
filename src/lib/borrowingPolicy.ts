/**
 * The library's borrowing policy, in one place.
 *
 * Circulation enforces these numbers and the Member Portal displays them, so
 * they live here rather than being duplicated: a policy shown to members that
 * differs from the one the desk applies is worse than no policy page at all.
 * (Before this existed the code allowed students 3 books while the stated
 * policy was 2.)
 */

/** Books a student may have out at any one time. */
export const STUDENT_LOAN_LIMIT = 2;

/** Loan length for students, in days. */
export const STUDENT_LOAN_DAYS = 14;

/**
 * Loan length for teaching staff, in months — one school term. Staff have no
 * cap on how many titles they may hold at once.
 */
export const STAFF_LOAN_MONTHS = 4;

export type PolicyAudience = 'student' | 'teacher';

export interface PolicyRule {
  audience: PolicyAudience;
  title: string;
  /** Short headline figures, rendered as the two big numbers on the card. */
  limit: string;
  duration: string;
  notes: string[];
}

export const BORROWING_POLICY: PolicyRule[] = [
  {
    audience: 'student',
    title: 'Students',
    limit: `${STUDENT_LOAN_LIMIT} books`,
    duration: `${STUDENT_LOAN_DAYS} days`,
    notes: [
      `You may have up to ${STUDENT_LOAN_LIMIT} books on loan at a time.`,
      `Each book is due back ${STUDENT_LOAN_DAYS} days (2 weeks) after you borrow it.`,
      'Finished early? Return them at any time and borrow your next books straight away — you do not have to wait for the two weeks to run out.',
    ],
  },
  {
    audience: 'teacher',
    title: 'Teachers & Staff',
    limit: 'No limit',
    duration: 'One term',
    notes: [
      'There is no cap on the number of books teaching staff may borrow.',
      'Books are on loan for the full school term.',
      'Please return or renew your books at the end of term so the collection is ready for the next one.',
    ],
  },
];

/**
 * Booking note for class use. Kept alongside the loan rules because it is the
 * same conversation with the librarian, and a clash blocks a whole lesson.
 */
export const LIBRARY_BOOKING_NOTICE = {
  title: 'Bringing a class to the library?',
  body: 'Teachers must check with the librarian before using the library space for a lesson or activity. Sessions are booked so two classes are never scheduled at the same time.',
};
