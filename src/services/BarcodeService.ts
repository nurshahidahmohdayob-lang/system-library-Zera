import { doc, runTransaction, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

    const counterRef = doc(db, this.getCounterPath(type));
    const prefix = this.getPrefix(type);

    try {
      return await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        
        let nextValue = 1;
        if (counterDoc.exists()) {
          nextValue = counterDoc.data().value + 1;
        }

        // Update the counter
        transaction.set(counterRef, { value: nextValue });

        // Format: Zera01, Zerastudent01, etc.
        const paddedNumber = nextValue.toString().padStart(2, '0');
        return `${prefix}${paddedNumber}`;
      });
    } catch (error) {
      console.error(`Error generating ${type} barcode:`, error);
      throw error;
    }
  }

  /**
   * Peeks at the next barcode without incrementing.
   */
  static async peekNextBarcode(type: BarcodeType = 'book'): Promise<string> {
    if (type === 'student' || type === 'staff') {
      return await this.findLowestUnusedBarcode(type);
    }

    const counterRef = doc(db, this.getCounterPath(type));
    const prefix = this.getPrefix(type);
    const counterDoc = await getDoc(counterRef);
    
    let nextValue = 1;
    if (counterDoc.exists()) {
      nextValue = counterDoc.data().value + 1;
    }
    
    const paddedNumber = nextValue.toString().padStart(2, '0');
    return `${prefix}${paddedNumber}`;
  }
}
