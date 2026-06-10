import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit,
  increment,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { Book, BookCopy, Hold, Loan, UserProfile } from '@/src/types';
import { OperationType, handleFirestoreError } from '@/src/hooks/useAuth';

export const CatalogService = {
  async getBooks(searchTerm?: string) {
    const path = 'books';
    try {
      const q = query(collection(db, path), orderBy('title'));
      // Firestore doesn't support full-text search easily, we'll do simple filtering
      // Real apps use Algolia or similar. We'll fetch all or limited for the demo.
      const snapshot = await getDocs(q);
      let books = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Book));
      
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        books = books.filter(b => 
          b.title.toLowerCase().includes(lowerSearch) || 
          b.author.toLowerCase().includes(lowerSearch) ||
          b.isbn.includes(searchTerm)
        );
      }
      return books;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  async addBook(bookData: Omit<Book, 'id' | 'updatedAt'>) {
    const path = 'books';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...bookData,
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
};

export const CirculationService = {
  async checkout(userId: string, userName: string, barcode: string) {
    // 1. Find copy by barcode
    // 2. Create loan
    // 3. Update copy status
    // 4. Update book availability
    // We use a transaction for atomicity
    try {
      const q = query(collection(db, 'copies'), where('barcode', '==', barcode));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Copy not found with that barcode.");
      
      const copyDoc = snap.docs[0];
      const copyData = copyDoc.data() as BookCopy;
      
      if (copyData.status !== 'available') throw new Error("Item is already borrowed or unavailable.");

      await runTransaction(db, async (transaction) => {
        const bookRef = doc(db, 'books', copyData.bookId);
        const bookSnap = await transaction.get(bookRef);
        if (!bookSnap.exists()) throw new Error("Book metadata not found");

        const now = new Date();
        const dueDate = new Date();
        dueDate.setDate(now.getDate() + 14);

        const loanRef = doc(collection(db, 'loans'));
        transaction.set(loanRef, {
          userId,
          userName,
          copyId: copyDoc.id,
          bookId: copyData.bookId,
          bookTitle: bookSnap.data().title,
          checkoutDate: serverTimestamp(),
          dueDate: dueDate, // Firestore SDK automatically converts Date to Timestamp
          status: 'active'
        });

        transaction.update(copyDoc.ref, { status: 'borrowed' });
        transaction.update(bookRef, { availableCopies: increment(-1) });
        transaction.update(doc(db, 'users', userId), { activeLoansCount: increment(1) });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'checkout-transaction');
    }
  },

  async getUserLoans(userId: string) {
    const path = 'loans';
    try {
      const q = query(collection(db, path), where('userId', '==', userId), where('status', '==', 'active'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
};

/**
 * Hold/reservation requests. A member (student or teacher) requests to hold a
 * book; the librarian is notified via the pending-holds inbox and decides the
 * outcome. Privilege checks live in firestore.rules (a member may only create
 * their own pending hold and may only cancel it).
 */
export const HoldService = {
  /** Create a pending hold for the current member. Returns 'duplicate' if one already exists. */
  async requestHold(book: Book, user: UserProfile): Promise<'created' | 'duplicate'> {
    const path = 'holds';
    try {
      // Block duplicate live requests for the same book by the same member.
      const dupeQ = query(
        collection(db, path),
        where('userId', '==', user.uid),
        where('bookId', '==', book.id),
        where('status', 'in', ['pending', 'ready']),
      );
      const dupes = await getDocs(dupeQ);
      if (!dupes.empty) return 'duplicate';

      await addDoc(collection(db, path), {
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author ?? '',
        bookCoverUrl: book.coverUrl ?? '',
        userId: user.uid,
        userName: user.name,
        userRole: user.role ?? '',
        userEmail: user.email ?? '',
        status: 'pending',
        requestedAt: new Date().toISOString(),
      });
      return 'created';
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  },

  /** Librarian: move a hold through its lifecycle (ready / fulfilled / rejected). */
  async updateHoldStatus(holdId: string, status: Hold['status']) {
    const path = `holds/${holdId}`;
    try {
      await updateDoc(doc(db, 'holds', holdId), {
        status,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      throw error;
    }
  },

  /** Member: withdraw their own pending hold. */
  async cancelHold(holdId: string) {
    return this.updateHoldStatus(holdId, 'cancelled');
  },
};
