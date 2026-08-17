import { Book } from '@/src/types';

// Simple in-memory cache to make repeated lookups instant
const lookupCache = new Map<string, Partial<Book>>();

/**
 * Every outbound bibliographic lookup goes through this. Without it a single
 * slow source (the LOC Z39.50 endpoint routinely stalls for 30s+, and Google
 * Books hangs rather than 429s when quota-limited) holds the whole cataloguing
 * form hostage — `Promise.any` only rejects once the *slowest* member settles,
 * so one dead source set the floor for how long a failed scan took.
 */
const LOOKUP_TIMEOUT_MS = 3000;
// The enrichment endpoint fans out over several sources plus an AI synopsis
// fallback, so it legitimately needs longer — but still needs a ceiling.
const ENRICH_TIMEOUT_MS = 15000;

/**
 * Per-source circuit breaker — the single biggest thing standing between a
 * librarian and a fast scan.
 *
 * These sources go down, and when they do they don't refuse connections, they
 * *hang*: openlibrary.org currently accepts nothing at all, and Google Books
 * answers 429 once the daily quota is spent. Without a breaker every single
 * scan re-pays the full timeout for every dead source, several times over
 * (Open Library alone is consulted by the ISBN lookup, the cover cascade and
 * the title fallback). One dead host turned a sub-second lookup into a
 * twenty-second one, on every book.
 *
 * So: after two consecutive failures a source is considered down and skipped
 * outright for five minutes. The first scan pays the timeout; the rest of the
 * cataloguing session doesn't. A single success closes the breaker again, so a
 * source coming back up is picked up within the cooldown.
 */
const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 5 * 60_000;
const BREAKER_STORAGE_KEY = 'zera_catalog_source_health';

type BreakerEntry = { failures: number; openUntil: number };

/**
 * Held in sessionStorage as well as memory: a librarian cataloguing a trolley of
 * books reloads the page now and then, and an in-memory-only breaker makes the
 * first scan after every reload re-pay the full timeout for each dead source.
 * `openUntil` is an absolute timestamp, so a stored entry still expires on
 * schedule and a recovered source is never locked out.
 */
const loadBreaker = (): Map<string, BreakerEntry> => {
  try {
    const raw = sessionStorage.getItem(BREAKER_STORAGE_KEY);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, BreakerEntry>));
  } catch {
    // private mode / corrupt entry — start clean
  }
  return new Map();
};

const breaker = loadBreaker();

const persistBreaker = () => {
  try {
    sessionStorage.setItem(BREAKER_STORAGE_KEY, JSON.stringify(Object.fromEntries(breaker)));
  } catch {
    // storage unavailable — the in-memory breaker still works for this page
  }
};

/**
 * Same-origin endpoints are keyed by path, not host: `/api/v1/lexile` answers
 * in under a second while `/api/v1/cover` sits on a dead upstream, and lumping
 * them under one key would take the healthy one down with it.
 */
const breakerKey = (url: string): string => {
  if (url.startsWith('/')) return url.split('?')[0];
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

class SourceDownError extends Error {
  constructor(key: string) {
    super(`Source ${key} is marked down; skipping`);
  }
}

const isSourceDown = (key: string): boolean => {
  const entry = breaker.get(key);
  return !!entry && entry.failures >= BREAKER_THRESHOLD && entry.openUntil > Date.now();
};

const noteFailure = (key: string) => {
  const entry = breaker.get(key) || { failures: 0, openUntil: 0 };
  entry.failures += 1;
  entry.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  breaker.set(key, entry);
  persistBreaker();
  if (entry.failures === BREAKER_THRESHOLD) {
    console.warn(`[catalog] "${key}" is not responding — skipping it for ${BREAKER_COOLDOWN_MS / 60000} min.`);
  }
};

const noteSuccess = (key: string) => {
  if (breaker.delete(key)) persistBreaker();
};

async function fetchWithTimeout(url: string, timeoutMs = LOOKUP_TIMEOUT_MS, init?: RequestInit): Promise<Response> {
  const key = breakerKey(url);
  if (isSourceDown(key)) throw new SourceDownError(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    // A quota rejection or a server error means this source is no use to us for
    // the next while either — a 429 from Google Books is good for the whole day.
    if (res.status === 429 || res.status >= 500) noteFailure(key);
    else noteSuccess(key);
    return res;
  } catch (err) {
    noteFailure(key);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Books is queried without a key by default, which drops every caller
 * into one shared anonymous quota pool — and that pool runs dry ("Quota
 * exceeded for quota metric 'Queries' and limit 'Queries per day'"). A
 * quota-exhausted Google Books is what pushes cataloguing onto the slower
 * fallback sources in the first place, so set VITE_GOOGLE_BOOKS_API_KEY to give
 * this install its own quota. Entirely optional — unset, behaviour is unchanged.
 */
const GOOGLE_BOOKS_KEY: string = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';
const googleBooksUrl = (query: string, extra = ''): string =>
  `https://www.googleapis.com/books/v1/volumes?q=${query}${extra}${GOOGLE_BOOKS_KEY ? `&key=${GOOGLE_BOOKS_KEY}` : ''}`;

/**
 * True when the text is an actual synopsis rather than one of the
 * system-generated placeholder strings stamped on records with no abstract.
 */
export function isRealSynopsis(text?: string | null): text is string {
  if (!text) return false;
  const t = text.trim();
  return t.length >= 15 &&
    t !== 'Institutional asset for Zera Education.' &&
    t !== 'No explicit abstract provided for this asset.' &&
    t !== 'Catalogued via automatic batch sync module.' &&
    t !== 'No synopsis/abstract available in public bibliographic databases.' &&
    !t.startsWith('Institutional archive record for');
}

/**
 * Fetches a synopsis/plot summary from the web (Google Books, Open Library,
 * LOC — with the server's AI fallback) for a book identified by title and/or ISBN.
 * Returns '' when nothing genuine could be found.
 */
export async function fetchSynopsisFromWeb(book: Partial<Book>): Promise<string> {
  if (!book.title && !book.isbn) return '';
  try {
    const res = await fetchWithTimeout('/api/v1/enrich-book-ai', ENRICH_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: book.title || '',
        author: book.author || '',
        isbn: book.isbn || '',
        description: isRealSynopsis(book.description) ? book.description : ''
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (isRealSynopsis(data?.description)) return data.description.trim();
    }
  } catch (err) {
    console.warn('Web synopsis lookup failed:', err);
  }
  return '';
}

/**
 * Enrich a book from the open web (via the server's DuckDuckGo scrape) — returns
 * a genuine synopsis PLUS the web-sourced publisher, publication year, and author.
 * Publisher/year/author are read from the server's `webSourced` block, which only
 * ever carries real scraped values (never a fabricated heuristic fallback), so
 * these are safe to fill into a catalogue record. Missing fields come back empty.
 */
export async function fetchWebEnrichment(
  book: Partial<Book>
): Promise<{ description: string; publisher: string; publishedYear?: number; author: string }> {
  const empty = { description: '', publisher: '', author: '' };
  if (!book.title && !book.isbn) return empty;
  try {
    const res = await fetchWithTimeout('/api/v1/enrich-book-ai', ENRICH_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: book.title || '',
        author: book.author || '',
        isbn: book.isbn || '',
        description: isRealSynopsis(book.description) ? book.description : ''
      })
    });
    if (res.ok) {
      const data = await res.json();
      const ws = data?.webSourced || {};
      const yr = Number(ws.publishedYear);
      return {
        description: isRealSynopsis(data?.description) ? String(data.description).trim() : '',
        publisher: typeof ws.publisher === 'string' ? ws.publisher.trim() : '',
        publishedYear: Number.isFinite(yr) && yr > 1000 ? yr : undefined,
        author: typeof ws.author === 'string' ? ws.author.trim() : ''
      };
    }
  } catch (err) {
    console.warn('Web enrichment lookup failed:', err);
  }
  return empty;
}

/**
 * True when the cover URL points at a real book jacket rather than the generic
 * Unsplash "no cover" placeholder (or being empty).
 */
export function isRealCover(url?: string | null): url is string {
  if (!url) return false;
  const u = url.trim();
  return u.length > 0 && !/unsplash\.com/i.test(u);
}

/**
 * Finds a real cover image for a book from the open web (Open Library cover
 * service by ISBN, then Google Books / Open Library data lookups by ISBN, then
 * by title). Returns '' when no genuine cover can be located.
 */
export async function fetchCoverFromWeb(book: Partial<Book>): Promise<string> {
  const cleanIsbn = (book.isbn || '').replace(/[^0-9X]/gi, '');

  // Pull the largest available Google Books cover out of a volumeInfo block.
  // Google Books only includes imageLinks when a genuine jacket exists, so this
  // is the most trustworthy "real cover" signal.
  const pickGoogleCover = (info: any): string => {
    const links = info?.imageLinks;
    if (!links) return '';
    const best = links.extraLarge || links.large || links.medium || links.small || links.thumbnail || links.smallThumbnail;
    return best ? best.replace('http:', 'https:').replace('&edge=curl', '') : '';
  };

  const googleQuery = async (q: string): Promise<string> => {
    try {
      const res = await fetchWithTimeout(googleBooksUrl(`${q}`, '&maxResults=5'));
      if (!res.ok) return '';
      const data = await res.json();
      if (!data.items) return '';
      for (const item of data.items) {
        const cover = pickGoogleCover(item.volumeInfo);
        if (cover) return cover;
      }
    } catch {
      // network / quota — caller falls through
    }
    return '';
  };

  const serverCover = async (): Promise<string> => {
    if (!cleanIsbn && !book.title?.trim()) return '';
    try {
      const params = new URLSearchParams();
      if (book.title?.trim()) params.set('title', book.title.trim());
      if (book.author?.trim()) params.set('author', book.author.trim());
      if (cleanIsbn) params.set('isbn', cleanIsbn);
      const res = await fetchWithTimeout(`/api/v1/cover?${params.toString()}`, 6000);
      if (res.ok) {
        const data = await res.json();
        if (isRealCover(data?.coverUrl)) return String(data.coverUrl).trim();
      }
    } catch {
      // source down or timed out — the other probes may still land
    }
    return '';
  };

  // All three probes are independent, so they run together: this used to be a
  // strictly serial chain where each dead source's timeout was *added* to the
  // next, which is how a missing jacket came to cost 12-20 seconds. Now the wait
  // is the slowest single probe, not the sum of all of them.
  //
  // They are still ranked, not first-past-the-post — a Google Books jacket is
  // higher resolution and edition-accurate, so it wins whenever it exists, and
  // an ISBN match beats a title match.
  const [byIsbn, byTitle, fromServer] = await Promise.all([
    cleanIsbn.length === 10 || cleanIsbn.length === 13
      ? googleQuery(`isbn:${cleanIsbn}`)
      : Promise.resolve(''),
    book.title?.trim()
      ? googleQuery(encodeURIComponent(
          [`intitle:${book.title.trim()}`, ...(book.author?.trim() ? [`inauthor:${book.author.trim().split(',')[0]}`] : [])].join('+')
        ))
      : Promise.resolve(''),
    serverCover()
  ]);

  // The old final fallback (re-running lookupBookByIsbn / lookupBookByTitle just
  // to read a cover off the result) is gone: it re-queried the exact same two
  // sources these probes already cover, and lookupBookByTitle deep-enriches
  // every match one at a time — a very long tail for a jacket we'd already
  // failed to find.
  return byIsbn || fromServer || byTitle || '';
}

/**
 * Enriches any partial book record with complete details (cover, summary, publisher, subjects)
 * by looking up additional databases if fields are missing.
 */
export async function enrichBookDetails(book: Partial<Book>): Promise<Partial<Book>> {
  if (!book) return {};
  
  // Create copies of fields to mutate safely
  const enriched: Partial<Book> = { ...book };
  
  // If we have an ISBN but are missing core structural details like summary or cover, do a deep Google Books / Open Library call.
  // Records that already came from Google Books skip it: re-requesting the exact
  // same volumes?q=isbn URL only added a round-trip (and burnt quota) to learn
  // that the fields really are absent upstream.
  const alreadyFromGoogle = (book as { source?: string }).source === 'Google';
  if (!alreadyFromGoogle && enriched.isbn && (!enriched.description || !enriched.coverUrl || !enriched.publisher || !enriched.category)) {
    try {
      const gRes = await fetchWithTimeout(googleBooksUrl(`isbn:${enriched.isbn}`));
      if (gRes.ok) {
        const gData = await gRes.json();
        if (gData.items && gData.items.length > 0) {
          const info = gData.items[0].volumeInfo;
          if (!enriched.title) enriched.title = info.title;
          if (!enriched.author || enriched.author === 'Unknown Author') {
            enriched.author = info.authors ? info.authors.join(', ') : 'Unknown Author';
          }
          if (!enriched.description) enriched.description = info.description || '';
          if (!enriched.category || enriched.category === 'General') {
            enriched.category = info.categories ? info.categories[0] : 'General';
          }
          if (!enriched.publisher) enriched.publisher = info.publisher || 'Zera Archives';
          if (!enriched.publishedYear) {
            enriched.publishedYear = info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined;
          }
          if (!enriched.coverUrl || enriched.coverUrl.includes('unsplash.com')) {
            if (info.imageLinks?.thumbnail) {
              enriched.coverUrl = info.imageLinks.thumbnail.replace('http:', 'https:');
            }
          }
          if (info.categories) {
            enriched.subjects = info.categories;
          }
          if (info.pageCount) {
            enriched.pageCount = info.pageCount;
          }
          if (info.language) {
            enriched.language = info.language;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to query secondary metadata enricher for ISBN:", enriched.isbn, e);
    }
  }

  // Fallback high-quality cover generator from Open Library if we have ISBN
  if (enriched.isbn && (!enriched.coverUrl || enriched.coverUrl.includes('unsplash.com'))) {
    const cleanIsbn = enriched.isbn.replace(/[^0-9X]/gi, '');
    enriched.coverUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
    
    // Quick head check to verify Open Library actually has this cover, otherwise fallback to Unsplash aesthetic placeholder
    try {
      const testRes = await fetchWithTimeout(enriched.coverUrl, 2500, { method: 'HEAD' });
      if (!testRes.ok) {
        throw new Error();
      }
    } catch {
      // Revert to gorgeous aesthetic placeholder
      enriched.coverUrl = `https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600`;
    }
  }

  // Clean values so they never show up as empty.
  // Note: description deliberately stays empty when no real synopsis was found —
  // callers then fetch one from the web (fetchSynopsisFromWeb) instead of
  // storing a placeholder string.
  if (!enriched.description) {
    enriched.description = '';
  }
  if (!enriched.category) {
    enriched.category = 'General';
  }
  if (!enriched.coverUrl) {
    enriched.coverUrl = 'https://images.unsplash.com/photo-1543004626-aa121041c291?q=80&w=600';
  }
  if (!enriched.publisher) {
    enriched.publisher = 'Zera Archives';
  }
  if (!enriched.publishedYear) {
    enriched.publishedYear = new Date().getFullYear();
  }
  if (!enriched.subjects || enriched.subjects.length === 0) {
    enriched.subjects = [enriched.category];
  }

  return enriched;
}

/**
 * Fetches the official Lexile reading measure (e.g. "740L", "AD580L") for a
 * book from the MetaMetrics Find-a-Book database via the server proxy.
 * Returns '' when the book has no published measure.
 */
export async function fetchLexileFromWeb(book: Partial<Book>): Promise<string> {
  if (!book.title && !book.isbn) return '';
  try {
    const params = new URLSearchParams();
    if (book.title) params.set('title', book.title);
    if (book.author) params.set('author', book.author);
    if (book.isbn) params.set('isbn', book.isbn);
    const res = await fetchWithTimeout(`/api/v1/lexile?${params.toString()}`, 8000);
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.lexileLevel === 'string' && data.lexileLevel) return data.lexileLevel;
    }
  } catch (err) {
    console.warn('Lexile lookup failed:', err);
  }
  return '';
}

/**
 * Simulates a Z39.50/Library server lookup using multi-source aggregation (Google Books & Open Library).
 * This provides the depth of metadata typically found in library catalog systems.
 */
export async function lookupBookByIsbn(isbn: string): Promise<Partial<Book> | null> {
  const sanitizedIsbn = isbn.replace(/[^0-9X]/gi, '');
  if (!sanitizedIsbn) return null;

  // Instant response if cached
  if (lookupCache.has(sanitizedIsbn)) {
    return lookupCache.get(sanitizedIsbn)!;
  }

  try {
    // Faster parallel lookup strategy
    const searchLOC = async () => {
      const res = await fetchWithTimeout(`https://lx2.loc.gov/master/sru/resources?version=1.1&operation=searchRetrieve&query=bf.isbn=${sanitizedIsbn}&maximumRecords=1&recordSchema=bibframe`);
      if (!res.ok) throw new Error();
      const xml = await res.text();
      const t = xml.match(/<title[^>]*>([^<]+)<\/title>/);
      const a = xml.match(/<label[^>]*>([^<]+)<\/label>/);
      if (!t) throw new Error();
      const result = { 
        isbn: sanitizedIsbn, 
        title: t[1].trim(), 
        author: a ? a[1].trim() : 'Unknown Author',
        publisher: 'LOC Indexed',
        category: 'Library Record',
        source: 'Z39.50 (LOC)'
      } as any;
      return result;
    };

    const searchGoogle = async () => {
      const res = await fetchWithTimeout(googleBooksUrl(`isbn:${sanitizedIsbn}`));
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.items) throw new Error();
      const info = data.items[0].volumeInfo;
      
      const parsedIsbn = info.industryIdentifiers
        ? (info.industryIdentifiers.find((id: any) => id.type === 'ISBN_13')?.identifier || 
           info.industryIdentifiers.find((id: any) => id.type === 'ISBN_10')?.identifier || 
           info.industryIdentifiers[0].identifier)
        : sanitizedIsbn;

      const result = {
        isbn: parsedIsbn,
        title: info.title,
        author: info.authors ? info.authors.join(', ') : 'Unknown Author',
        description: info.description || '',
        category: info.categories ? info.categories[0] : 'General',
        coverUrl: info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '',
        publisher: info.publisher,
        publishedYear: info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined,
        subjects: info.categories || [],
        pageCount: info.pageCount,
        language: info.language,
        source: 'Google'
      } as any;
      return result;
    };

    const searchOL = async () => {
      const res = await fetchWithTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${sanitizedIsbn}&format=json&jscmd=data`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const key = `ISBN:${sanitizedIsbn}`;
      if (!data[key]) throw new Error();
      const info = data[key];
      const result = {
        isbn: sanitizedIsbn,
        title: info.title,
        author: info.authors ? info.authors.map((a: any) => a.name).join(', ') : 'Unknown Author',
        coverUrl: info.cover ? info.cover.medium : '',
        publisher: info.publishers ? info.publishers.map((p: any) => p.name).join(', ') : 'Open Library Publisher',
        publishedYear: info.publishDate ? parseInt(info.publishDate.slice(-4)) : undefined,
        pageCount: info.number_of_pages,
        subjects: info.subjects ? info.subjects.map((s: any) => s.name) : [],
        source: 'OpenLibrary'
      } as any;
      return result;
    };

    // Return the first one that responds successfully
    const fastResult = await Promise.any([searchLOC(), searchGoogle(), searchOL()]);
    
    if (fastResult) {
      // Enrich before caching
      const fullyEnrichedBook = await enrichBookDetails(fastResult);
      lookupCache.set(sanitizedIsbn, fullyEnrichedBook);
      return fullyEnrichedBook;
    }
    
    return null;
  } catch (error) {
    console.warn("Lookup Failed or Timed Out, trying direct fallback enrichment:", error);
    // If the fast parallel query fails completely, try direct backup google lookup
    try {
      const directGoogleBook = await searchGoogleFallback(sanitizedIsbn);
      if (directGoogleBook) {
        const enriched = await enrichBookDetails(directGoogleBook);
        lookupCache.set(sanitizedIsbn, enriched);
        return enriched;
      }
    } catch (err) {
      console.warn("Fallback query failed:", err);
    }
    return null;
  }
}

async function searchGoogleFallback(isbn: string): Promise<Partial<Book> | null> {
  try {
    const res = await fetchWithTimeout(googleBooksUrl(`isbn:${isbn}`));
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;
    const info = data.items[0].volumeInfo;
    return {
      isbn: isbn,
      title: info.title,
      author: info.authors ? info.authors.join(', ') : 'Unknown Author',
      description: info.description || '',
      category: info.categories ? info.categories[0] : 'General',
      coverUrl: info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '',
      publisher: info.publisher,
      publishedYear: info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined,
      subjects: info.categories || [],
      pageCount: info.pageCount,
      language: info.language,
      source: 'Google Fallback'
    } as any;
  } catch {
    return null;
  }
}

export async function lookupBookByTitle(title: string): Promise<Partial<Book>[] | null> {
  try {
    if (!title) return null;
    
    // Clean-up title string to improve accuracy (remove file extensions and brackets)
    let searchTitle = title.trim();
    searchTitle = searchTitle.replace(/\.[a-zA-Z0-9]+$/, ''); // remove extensions like .txt, .csv
    searchTitle = searchTitle.replace(/\(.*?\)|\[.*?\]/g, '').trim(); // remove (Vol 1) etc

    // Strategy 1: Google Books flexible query (performs approximate and index lookups)
    const googleUrl = googleBooksUrl(encodeURIComponent(searchTitle), '&maxResults=5');
    const response = await fetchWithTimeout(googleUrl);
    
    let items: any[] = [];
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        items = data.items;
      }
    }

    const books: Partial<Book>[] = [];

    if (items.length > 0) {
      for (const item of items) {
        const info = item.volumeInfo;
        const parsedIsbn = info.industryIdentifiers
          ? (info.industryIdentifiers.find((id: any) => id.type === 'ISBN_13')?.identifier || 
             info.industryIdentifiers.find((id: any) => id.type === 'ISBN_10')?.identifier || 
             info.industryIdentifiers[0].identifier)
          : '';

        // Clean description from HTML tags
        let cleanedDesc = info.description || '';
        cleanedDesc = cleanedDesc.replace(/<[^>]*>/g, '').trim();

        const draft: Partial<Book> = {
          isbn: parsedIsbn,
          title: info.title,
          author: info.authors ? info.authors.join(', ') : 'Unknown Author',
          description: cleanedDesc,
          category: info.categories ? info.categories[0] : 'General',
          coverUrl: info.imageLinks?.thumbnail ? info.imageLinks.thumbnail.replace('http:', 'https:') : '',
          publisher: info.publisher || 'Zera Archives',
          publishedYear: info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined,
          subjects: info.categories || [],
          pageCount: info.pageCount || 0,
          language: info.language || 'English'
        };

        // Perform deep enrichment for each match
        const enriched = await enrichBookDetails(draft);
        books.push(enriched);
      }
    }

    // Strategy 2: If Google Books yielded nothing, try Open Library Search API
    if (books.length === 0) {
      const olSearchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(searchTitle)}&limit=3`;
      try {
        const olRes = await fetchWithTimeout(olSearchUrl);
        if (olRes.ok) {
          const olData = await olRes.json();
          if (olData.docs && olData.docs.length > 0) {
            for (const doc of olData.docs) {
              const firstIsbn = doc.isbn ? doc.isbn[0] : '';
              const docAuthor = doc.author_name ? doc.author_name.join(', ') : 'Unknown Author';
              
              const draft: Partial<Book> = {
                isbn: firstIsbn,
                title: doc.title,
                author: docAuthor,
                description: '',
                category: doc.subject ? doc.subject[0] : 'General',
                coverUrl: firstIsbn ? `https://covers.openlibrary.org/b/isbn/${firstIsbn}-L.jpg` : '',
                publisher: doc.publisher ? doc.publisher[0] : 'Zera Archives',
                publishedYear: doc.first_publish_year || (doc.publish_year ? doc.publish_year[0] : undefined),
                subjects: doc.subject ? doc.subject.slice(0, 5) : [],
                pageCount: doc.number_of_pages_median || 0,
                language: doc.language ? doc.language[0] : 'English'
              };

              const enriched = await enrichBookDetails(draft);
              books.push(enriched);
            }
          }
        }
      } catch (olError) {
        console.warn("Open Library fallback search failed:", olError);
      }
    }

    return books.length > 0 ? books : null;
  } catch (error) {
    console.error("Catalog Search Failed:", error);
    return null;
  }
}

