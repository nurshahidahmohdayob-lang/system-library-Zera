import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";

async function run() {
  const app = initializeApp(firebaseConfig);
  const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") 
    ? firebaseConfig.firestoreDatabaseId 
    : undefined;
  const db = initializeFirestore(app, {}, dbId);
  
  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  
  const studentsWithBarcodes = users.filter(u => u.role === "student" && u.barcode);
  console.log(`Total students with barcodes: ${studentsWithBarcodes.length}`);
  studentsWithBarcodes.forEach(s => {
    console.log(`ID: ${s.studentId} | Name: ${s.name} | Barcode: ${s.barcode}`);
  });
}

run().catch(console.error);
