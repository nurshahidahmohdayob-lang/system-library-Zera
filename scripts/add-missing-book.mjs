// One-off: add the single book from "Teacher resource zi xin.xlsx" that the
// 2026-07-09 batch import silently dropped (ISBN 9781108749879).
//
// The record is built to match BatchBookImporter.tsx exactly: same bookPayload
// field set, same "matched metadata wins over spreadsheet" precedence, same
// barcode allocation via the counters/barcodes_book transaction, and the same
// Unsplash cover placeholder when no cover art exists.
//
// Creating books requires admin auth (Firestore rules: allow write if isAdmin),
// so this signs you in with your own admin credentials. Your password is read
// with hidden input and is never printed or saved.
//
// Run from the repo root:
//   node scripts/add-missing-book.mjs --dry-run   # print the payload, write nothing
//   node scripts/add-missing-book.mjs             # sign in and create the record
//
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, addDoc, doc, runTransaction } from 'firebase/firestore';
import { createRequire } from 'module';
import readline from 'readline';

const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

const DRY_RUN = process.argv.includes('--dry-run');

// The dropped row, verbatim from the spreadsheet.
const SHEET_ROW = {
  isbn: '9781108749879',
  title: "Cambridge Primary English Learner's Book 1 with Digital Access (1 Year) (2E)",
  copies: 1,
};
// Every book on that sheet is a teacher resource; land it in its final category
// directly. previousCategory is set so recategorize-import-batch.mjs skips it.
const CATEGORY = 'Teacher Resources';
const PLACEHOLDER_COVER = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600';

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = str => rl.output.write(rl.stdoutMuted && str !== question ? '*' : str);
    }
    rl.question(question, ans => { rl.close(); if (hidden) rl.output.write('\n'); resolve(ans); });
    if (hidden) rl.stdoutMuted = true;
  });
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)')
  ? firebaseConfig.firestoreDatabaseId : undefined;
const db = initializeFirestore(app, {}, dbId);

const cleanIsbn = SHEET_ROW.isbn.replace(/[^0-9Xx]/g, '');

// --- Guard: never create a duplicate. Books are publicly readable. ---
const existing = (await getDocs(collection(db, 'books'))).docs.map(d => ({ id: d.id, ...d.data() }));
const dupe = existing.find(b => String(b.isbn || '').replace(/[^0-9Xx]/g, '') === cleanIsbn);
if (dupe) {
  console.error(`Aborting: ISBN ${cleanIsbn} already exists as ${dupe.barcode} — "${dupe.title}"`);
  process.exit(1);
}
console.log(`Catalog has ${existing.length} books; ISBN ${cleanIsbn} is not among them.`);

// --- Step 1-3: bibliographic lookup (Open Library holds this ISBN; Google Books does not) ---
let matched = {};
try {
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
  const data = await res.json();
  const rec = data[`ISBN:${cleanIsbn}`];
  if (rec) {
    matched = {
      title: rec.title,
      author: rec.authors?.[0]?.name,
      publisher: rec.publishers?.[0]?.name,
      publishedYear: parseInt(String(rec.publish_date || '').match(/\d{4}/)?.[0] ?? '', 10) || undefined,
      pageCount: parseInt(rec.pagination ?? '', 10) || undefined,
      subjects: rec.subjects?.map(s => s.name).filter(Boolean),
    };
  }
} catch (e) {
  console.warn('Open Library lookup failed, falling back to spreadsheet values:', e.message);
}

// Cover art: only use Open Library's image if it actually has one (?default=false 404s otherwise).
let coverUrl = PLACEHOLDER_COVER;
try {
  const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
  if ((await fetch(url, { method: 'HEAD' })).ok) coverUrl = url;
} catch { /* keep placeholder */ }

// Unlike BatchBookImporter, the spreadsheet title wins: Open Library only carries
// the Italian-market edition of this ISBN ("Per la Scuola Media…"). The rest of the
// matched metadata (author, publisher, year, pages) is good and takes precedence.
const now = new Date().toISOString();
const bookPayload = {
  title: SHEET_ROW.title,
  author: matched.author || 'Unknown Author',
  isbn: cleanIsbn,
  barcode: '(allocated at write time)',
  category: CATEGORY,
  previousCategory: '',
  description: 'No synopsis/abstract available in public bibliographic databases.',
  coverUrl,
  publisher: matched.publisher || 'Zera Archives',
  publishedYear: matched.publishedYear || new Date().getFullYear(),
  subjects: matched.subjects || [CATEGORY],
  pageCount: matched.pageCount || 0,
  lexileLevel: '',
  language: 'English',
  totalCopies: SHEET_ROW.copies,
  availableCopies: SHEET_ROW.copies,
  status: 'available',
  createdAt: now,
  updatedAt: now,
};

console.log('\nRecord to create:');
console.log(JSON.stringify(bookPayload, null, 2));
if (coverUrl === PLACEHOLDER_COVER) console.log('\nNote: no cover art published for this ISBN — using the standard placeholder.');

if (DRY_RUN) { console.log('\n--dry-run: nothing written.'); process.exit(0); }

const email = (await ask('\nAdmin email: ')).trim();
const password = await ask('Admin password: ', { hidden: true });
console.log('\nSigning in…');
try {
  await signInWithEmailAndPassword(auth, email, password);
} catch (e) {
  console.error('Sign-in failed:', e.code || e.message);
  process.exit(1);
}
console.log('Signed in as', auth.currentUser?.email);

const confirm = await ask(`\nType ADD to create this book: `);
if (confirm.trim() !== 'ADD') { console.log('Cancelled — nothing created.'); process.exit(0); }

// --- Step 4: allocate the barcode through the same counter the app uses ---
const counterRef = doc(db, 'counters/barcodes_book');
const barcode = await runTransaction(db, async transaction => {
  const counterDoc = await transaction.get(counterRef);
  const nextValue = counterDoc.exists() ? counterDoc.data().value + 1 : 1;
  transaction.set(counterRef, { value: nextValue });
  return `Zera${String(nextValue).padStart(2, '0')}`;
});
console.log('Allocated barcode:', barcode);

// --- Step 5: write the record ---
const ref = await addDoc(collection(db, 'books'), { ...bookPayload, barcode });
console.log(`\n✅ Created ${barcode} (doc ${ref.id}) — "${bookPayload.title}"`);
process.exit(0);
