/**
 * Recognising values the catalogue invented rather than found.
 *
 * For years the system filled gaps with "this year" or "two years ago"; for
 * publishers it used a family of made-up imprints, and once stamped the name of
 * a lookup source in as if it were the publisher. By October 2026 723 of 972
 * books carried one of these names.
 */
const INVENTED_PUBLISHERS = new RegExp(
  '^(' + [
    'zera archives',
    'zera academic press',
    'zera digital & computing press',
    'zera historical publications',
    'zera science archives',
    'zera mercantile review',
    'zera classic press',
    'open library publisher',
    'loc indexed',
    // Not a publisher at all — the name of the lookup source.
    'library of congress z39\\.50',
  ].join('|') + ')$',
  'i'
);

export const isInventedPublisher = (p?: string | null): boolean =>
  INVENTED_PUBLISHERS.test(String(p ?? '').trim());

const STOP = new Set([
  'books', 'book', 'publishing', 'publishers', 'publisher', 'press', 'ltd', 'limited',
  'inc', 'co', 'company', 'group', 'the', 'uk', 'us', 'usa', 'plc', 'and', 'sdn', 'bhd',
  'pte', 'llc', 'corp', 'corporation', 'imprint', 'of',
]);

const squash = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).join('');

/**
 * Whether two publisher names refer to the same publisher. A librarian's
 * "Harper collins" and a catalogue's "HarperCollins Publishers Limited" are one
 * publisher; rewriting the librarian's entry would be churn, not a correction.
 */
export const samePublisher = (a?: string | null, b?: string | null): boolean => {
  const x = squash(String(a ?? '')), y = squash(String(b ?? ''));
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};
