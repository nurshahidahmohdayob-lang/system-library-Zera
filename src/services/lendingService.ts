import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { addDays, addMonths } from 'date-fns';
import { db } from '@/src/lib/firebase';
import { Book, UserProfile, Loan } from '@/src/types';
import { STUDENT_LOAN_DAYS, STAFF_LOAN_MONTHS } from '@/src/lib/borrowingPolicy';

/**
 * Issuing a book, as one call.
 *
 * Written for the class lending sheet, where a librarian works down a register
 * issuing to one child after another and cannot stop to disambiguate. The rules
 * that decide the loan — how long it runs, how many a member may hold — come
 * from borrowingPolicy, the same module the desk and the Member Portal read, so
 * a batch issue can never apply a different policy from a single one.
 */

export class LendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LendingError';
  }
}

const sanitiseIsbn = (s: string) => s.replace(/[^0-9Xx]/gi, '').toUpperCase();

/** Accession numbers are stored capitalised ("Zera40"); a librarian may type "zera40". */
const canonicalAccession = (raw: string) =>
  /^zera(student|staff)?\d+$/i.test(raw) ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : raw;

/**
 * Find the physical copy to issue for a scanned code.
 *
 * An accession number names one book and is taken as given. An ISBN names a
 * title, which may be several separate records — so among those, the one with a
 * copy actually on the shelf is chosen rather than whichever Firestore returned
 * first. The caller is told which accession went out, so the librarian can check
 * it against the book in their hand.
 */
export const resolveBookForLending = async (code: string): Promise<{ id: string; book: Book }> => {
  const raw = code.trim();
  if (!raw) throw new LendingError('No book code given.');

  const byBarcode = await getDocs(query(collection(db, 'books'), where('barcode', '==', canonicalAccession(raw))));
  if (!byBarcode.empty) {
    const d = byBarcode.docs[0];
    return { id: d.id, book: d.data() as Book };
  }

  const digits = sanitiseIsbn(raw);
  if (digits.length === 10 || digits.length === 13) {
    const byIsbn = await getDocs(query(collection(db, 'books'), where('isbn', '==', digits)));
    const candidates = byIsbn.docs;
    const available = candidates.find(d => ((d.data() as Book).availableCopies || 0) > 0);
    const chosen = available || candidates[0];
    if (chosen) return { id: chosen.id, book: chosen.data() as Book };
  }

  const byTitle = await getDocs(query(collection(db, 'books'), where('title', '==', raw)));
  if (!byTitle.empty) {
    const d = byTitle.docs[0];
    return { id: d.id, book: d.data() as Book };
  }

  throw new LendingError(`No book found for "${raw}" (checked accession number, ISBN and title).`);
};

/** Active loans a member currently holds. */
export const activeLoanCount = async (memberId: string): Promise<number> => {
  const snap = await getDocs(query(collection(db, 'loans'), where('userId', '==', memberId), where('status', '==', 'active')));
  return snap.size;
};

/**
 * Issue one book to one member. Throws LendingError with a message fit to show
 * the librarian; anything else is a genuine fault and should surface as such.
 */
export const issueBook = async (
  member: UserProfile,
  code: string,
  opts?: { limit?: number }
): Promise<{ loan: Loan; bookId: string; book: Book }> => {
  const { id: bookId, book } = await resolveBookForLending(code);

  if ((book.availableCopies || 0) <= 0) {
    throw new LendingError(`Every copy of “${book.title}” is out.`);
  }

  if (member.role === 'student' && typeof opts?.limit === 'number') {
    const held = await activeLoanCount(member.uid);
    if (held >= opts.limit) {
      throw new LendingError(
        `${String(member.name || 'This student').split(' ')[0]} already has ${held} book${held !== 1 ? 's' : ''} out — the limit is ${opts.limit}.`
      );
    }
  }

  const checkoutDate = new Date().toISOString();
  const dueDate = (member.role === 'student'
    ? addDays(new Date(), STUDENT_LOAN_DAYS)
    : addMonths(new Date(), STAFF_LOAN_MONTHS)
  ).toISOString();

  const ref = await addDoc(collection(db, 'loans'), {
    userId: member.uid,
    userName: member.name,
    bookId,
    bookTitle: book.title,
    checkoutDate,
    dueDate,
    status: 'active',
  });

  await updateDoc(doc(db, 'books', bookId), {
    availableCopies: (book.availableCopies || 0) - 1,
  });

  const loan: Loan = {
    id: ref.id,
    userId: member.uid,
    userName: member.name,
    copyId: '',
    bookId,
    bookTitle: book.title,
    checkoutDate,
    dueDate,
    returnDate: null,
    status: 'active',
  };
  return { loan, bookId, book };
};
