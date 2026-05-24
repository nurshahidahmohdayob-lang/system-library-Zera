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
import { Book, BookCopy, Loan, UserProfile } from '@/src/types';
import { OperationType, handleFirestoreError } from '@/src/hooks/useAuth';

export const CatalogService = {
  async getBooks(searchTerm?: string) {
    const path = 'books';
    try {
      let q = query(collection(db, path), orderBy('title'));
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
