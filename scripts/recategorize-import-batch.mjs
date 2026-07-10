// One-off: re-categorize the book batch imported on a given day (default:
// 2026-07-09 — the 292 records, barcodes Zera2384–Zera2675) to a single
// category, preserving each book's existing category in `previousCategory`
// so the change can be reverted.
//
// Writing books requires admin auth (Firestore rules: allow write if isAdmin),
// so this signs you in with your own admin credentials. Your password is read
// with hidden input and is never printed or saved.
//
// Run from the repo root:  node scripts/recategorize-import-batch.mjs [YYYY-MM-DD] [category]
//
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { createRequire } from 'module';
import readline from 'readline';

const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

const DAY = process.argv[2] || '2026-07-09';        // only books created on this day are touched
const CATEGORY = process.argv[3] || 'Teacher Resources';
const SANITY_MAX = 300;                              // abort if we'd update more than this

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

const email = (await ask('Admin email: ')).trim();
const password = await ask('Admin password: ', { hidden: true });

console.log('\nSigning in…');
try {
  await signInWithEmailAndPassword(auth, email, password);
} catch (e) {
  console.error('Sign-in failed:', e.code || e.message);
  process.exit(1);
}
console.log('Signed in as', auth.currentUser?.email);

const snap = await getDocs(collection(db, 'books'));
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
const inBatch = all.filter(b => String(b.createdAt || '').startsWith(DAY));

// Re-running must not clobber a previousCategory captured by an earlier run.
const targets = inBatch.filter(b => b.previousCategory === undefined);
const alreadyDone = inBatch.length - targets.length;

console.log(`\nCatalog total: ${all.length} | created on ${DAY}: ${inBatch.length}`);
if (alreadyDone) console.log(`Skipping ${alreadyDone} already re-categorized (they have previousCategory).`);

if (targets.length === 0) { console.log('\nNothing to update.'); process.exit(0); }
if (targets.length > SANITY_MAX) {
  console.error(`\nAborting: ${targets.length} exceeds safety cap of ${SANITY_MAX}. Check the date filter.`);
  process.exit(1);
}

const fromCounts = {};
for (const b of targets) fromCounts[b.category || '(none)'] = (fromCounts[b.category || '(none)'] || 0) + 1;
console.log(`\nWill set category = "${CATEGORY}" on ${targets.length} books, moving from:`);
for (const [cat, n] of Object.entries(fromCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${cat}`);
}

const confirm = await ask(`\nType UPDATE to apply this to ${targets.length} books: `);
if (confirm.trim() !== 'UPDATE') { console.log('Cancelled — nothing changed.'); process.exit(0); }

const updatedAt = new Date().toISOString();
for (let i = 0; i < targets.length; i += 400) {
  const batch = writeBatch(db);
  for (const b of targets.slice(i, i + 400)) {
    batch.update(doc(db, 'books', b.id), {
      category: CATEGORY,
      previousCategory: b.category ?? '',
      updatedAt,
    });
  }
  await batch.commit();
  console.log(`Updated ${Math.min(i + 400, targets.length)}/${targets.length}…`);
}
console.log(`\n✅ Done. ${targets.length} books are now "${CATEGORY}". Old values kept in previousCategory.`);
process.exit(0);
