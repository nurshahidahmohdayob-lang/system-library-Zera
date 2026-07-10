// One-off cleanup: remove the book batch imported on a given day (default:
// 2026-07-07 — the 204 wrapped-fragment records from the buggy PDF import).
//
// Deleting books requires admin auth (Firestore rules: allow write if isAdmin),
// so this signs you in with your own admin credentials. Your password is read
// with hidden input and is never printed or saved.
//
// Run from the repo root:  node scripts/delete-import-batch.mjs [YYYY-MM-DD]
//
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { createRequire } from 'module';
import readline from 'readline';

const require = createRequire(import.meta.url);
const firebaseConfig = require('../firebase-applet-config.json');

const DAY = process.argv[2] || '2026-07-07';   // keep only books NOT created on this day
const SANITY_MAX = 210;                          // abort if we'd delete more than this

function ask(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Mute echoed keystrokes: print the prompt, then '*' for each char typed.
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
const targets = all.filter(b => String(b.createdAt || '').startsWith(DAY));

console.log(`\nCatalog total: ${all.length} | created on ${DAY}: ${targets.length}`);
targets
  .sort((a, b) => String(a.barcode).localeCompare(String(b.barcode)))
  .forEach(b => console.log(`  ${b.barcode || '(no barcode)'}  ${(b.title || '').slice(0, 60)}`));

if (targets.length === 0) { console.log('\nNothing to delete.'); process.exit(0); }
if (targets.length > SANITY_MAX) {
  console.error(`\nAborting: ${targets.length} exceeds safety cap of ${SANITY_MAX}. Check the date filter.`);
  process.exit(1);
}

const confirm = await ask(`\nType DELETE to permanently remove these ${targets.length} books: `);
if (confirm.trim() !== 'DELETE') { console.log('Cancelled — nothing deleted.'); process.exit(0); }

// Firestore batches cap at 500 writes; 204 fits comfortably, but chunk anyway.
for (let i = 0; i < targets.length; i += 400) {
  const batch = writeBatch(db);
  for (const b of targets.slice(i, i + 400)) batch.delete(doc(db, 'books', b.id));
  await batch.commit();
  console.log(`Deleted ${Math.min(i + 400, targets.length)}/${targets.length}…`);
}
console.log('\n✅ Done. Removed', targets.length, 'books.');
process.exit(0);
