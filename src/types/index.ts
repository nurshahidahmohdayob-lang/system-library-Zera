export type UserRole = 'admin' | 'student' | 'teacher';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  barcode?: string;
  grade?: string;
  activeLoansCount?: number;
  photoURL?: string;
  department?: string;
  studentId?: string;
  phoneNumber?: string;
  status?: string;
  createdAt?: string;
  cohort?: string;
  dateOfBirth?: string;
  gender?: string;
  syncSource?: string;
  lastSyncedAt?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  series?: string;
  isbn: string;
  barcode?: string;
  category: string;
  description: string;
  coverUrl: string;
  publisher?: string;
  publishedYear?: number;
  language?: string;
  pageCount?: number;
  dimensions?: string;
  lexileLevel?: string;
  totalCopies: number;
  availableCopies: number;
  subjects?: string[];
  updatedAt: string;
  status?: string;
}

export interface BookCopy {
  id: string;
  bookId: string;
  barcode: string;
  status: 'available' | 'borrowed' | 'lost' | 'damaged';
  location: string;
}

export interface Loan {
  id: string;
  userId: string;
  userName: string;
  copyId: string;
  bookId: string;
  bookTitle: string;
  checkoutDate: string;
  dueDate: string;
  returnDate?: string | null;
  status: 'active' | 'returned' | 'overdue';
}

export interface Hold {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor?: string;
  bookCoverUrl?: string;
  userId: string;
  userName: string;
  userRole?: string;
  userEmail?: string;
  // pending: awaiting librarian · ready: set aside for pickup · fulfilled: borrowed
  // cancelled: withdrawn by member · rejected: declined by librarian
  status: 'pending' | 'ready' | 'fulfilled' | 'cancelled' | 'rejected';
  requestedAt: string;
  updatedAt?: string;
  note?: string;
}

export interface OnlineResource {
  id: string;
  title: string;
  description: string;
  url: string;
  category: 'story' | 'ebook' | 'database' | 'education';
  level: 'primary' | 'secondary' | 'teacher' | 'all';
  subject?: string;
  trending?: boolean;
}
