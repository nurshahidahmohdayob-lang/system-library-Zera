import { doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
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

  /**
   * Generates the next available barcode for a specific type.
   * Increments the counter in Firestore atomically.
   */
  static async generateNextBarcode(type: BarcodeType = 'book'): Promise<string> {
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
