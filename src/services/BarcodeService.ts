import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';

export type BarcodeType = 'book' | 'student' | 'staff';

export class BarcodeService {
  private static getCounterPath(type: BarcodeType): string {
    return `counters/barcodes_${type}`;
  }

  private static getPrefix(type: BarcodeType): string {
    switch (type) {
      case 'student': return 'Zerastudent';
      case 'staff': return 'Zerastaff';
      default: return 'Zera';
    }
  }

  // The highest accession number currently in the catalogue (0 if none). Only
  // pure book accessions "Zera<number>" count — never Zerastudent/Zerastaff.
  private static async maxBookAccessionNumber(): Promise<number> {
    let max = 0;
    const snap = await getDocs(collection(db, 'books'));
    snap.docs.forEach(docSnap => {
      const bc = docSnap.data().barcode;
      if (typeof bc === 'string' && /^Zera\d+$/i.test(bc)) {
        const n = parseInt(bc.slice('Zera'.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    return max;
  }

  // Next book accession = highest in the catalogue + 1, so it always continues
  // from the last catalogued book. Computing it does NOT consume a number —
  // only saving a book with that accession does — so clicking "generate"
  // repeatedly (without saving) keeps returning the same next number.
  private static async nextBookBarcode(): Promise<string> {
    const next = (await this.maxBookAccessionNumber()) + 1;
    return `Zera${next.toString().padStart(2, '0')}`;
  }

  private static async findLowestUnusedBarcode(type: BarcodeType): Promise<string> {
    const prefix = this.getPrefix(type);
    const usedNumbers = new Set<number>();

    try {
      if (type === 'student' || type === 'staff') {
        const role = type === 'student' ? 'student' : 'teacher';
        const q = query(
          collection(db, 'users'),
          where('role', '==', role)
        );
        const snap = await getDocs(q);
        snap.docs.forEach(docSnap => {
          const barcode = docSnap.data().barcode;
          if (barcode && typeof barcode === 'string' && barcode.startsWith(prefix)) {
            const numPart = barcode.substring(prefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
              usedNumbers.add(num);
            }
          }
        });
      } else {
        const snap = await getDocs(collection(db, 'books'));
        snap.docs.forEach(docSnap => {
          const barcode = docSnap.data().barcode;
          if (barcode && typeof barcode === 'string' && barcode.startsWith(prefix)) {
            const numPart = barcode.substring(prefix.length);
            const num = parseInt(numPart, 10);
            if (!isNaN(num)) {
              usedNumbers.add(num);
            }
          }
        });
      }
    } catch (err) {
      console.error("Error checking existing barcodes from DB:", err);
    }

    let nextValue = 1;
    while (usedNumbers.has(nextValue)) {
      nextValue++;
    }

    const paddedNumber = nextValue.toString().padStart(2, '0');
    return `${prefix}${paddedNumber}`;
  }

  /**
   * Generates the next available barcode for a specific type.
   * For student/staff, scans live to find lowest unused.
   * For book, increments the counter in Firestore atomically.
   */
  static async generateNextBarcode(type: BarcodeType = 'book'): Promise<string> {
    if (type === 'student' || type === 'staff') {
      const nextBarcode = await this.findLowestUnusedBarcode(type);
      
      // Update counter document as fallback/legacy tracking
      try {
        const counterRef = doc(db, this.getCounterPath(type));
        const numPart = nextBarcode.substring(this.getPrefix(type).length);
        const nextValue = parseInt(numPart, 10);
        if (!isNaN(nextValue)) {
          await setDoc(counterRef, { value: nextValue }, { merge: true });
        }
      } catch (e) {
        console.warn("Could not update legacy counter:", e);
      }
      
      return nextBarcode;
    }

    // Books: continue from the last catalogued accession (highest + 1). Derived
    // live from the catalogue, so it never drifts out of sync with the books.
    return await this.nextBookBarcode();
  }

  /**
   * Peeks at the next barcode without incrementing.
   */
  static async peekNextBarcode(type: BarcodeType = 'book'): Promise<string> {
    if (type === 'student' || type === 'staff') {
      return await this.findLowestUnusedBarcode(type);
    }
    // Books: the next accession is simply the highest catalogued + 1.
    return await this.nextBookBarcode();
  }
}
