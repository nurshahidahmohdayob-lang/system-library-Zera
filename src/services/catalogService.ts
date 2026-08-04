import { Book } from '@/src/types';

// Simple in-memory cache to make repeated lookups instant
const lookupCache = new Map<string, Partial<Book>>();

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
    const res = await fetch('/api/v1/enrich-book-ai', {
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
    const res = await fetch('/api/v1/enrich-book-ai', {
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
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`);
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

  // 1. Google Books by ISBN (highest-resolution jacket when available).
  if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
    const byIsbn = await googleQuery(`isbn:${cleanIsbn}`);
    if (byIsbn) return byIsbn;
  }

  // 2. Google Books by title (+ author when known).
  if (book.title?.trim()) {
    const parts = [`intitle:${book.title.trim()}`];
    if (book.author?.trim()) parts.push(`inauthor:${book.author.trim().split(',')[0]}`);
    const byTitle = await googleQuery(encodeURIComponent(parts.join('+')));
    if (byTitle) return byTitle;
  }

  // 3. Server-side Open Library cover lookup (no quota, matches by ISBN then
  //    title+author, and only returns a genuinely-existing cover). This is the
  //    reliable fallback when Google Books is rate-limited in the browser.
  if (cleanIsbn || book.title?.trim()) {
    try {
      const params = new URLSearchParams();
      if (book.title?.trim()) params.set('title', book.title.trim());
      if (book.author?.trim()) params.set('author', book.author.trim());
      if (cleanIsbn) params.set('isbn', cleanIsbn);
      const res = await fetch(`/api/v1/cover?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (isRealCover(data?.coverUrl)) return data.coverUrl.trim();
      }
    } catch {
      // ignore and try the data lookups below
    }
  }

  // 4. Final fallback: the standard metadata lookups.
  if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
    try {
      const match = await lookupBookByIsbn(cleanIsbn);
      if (isRealCover(match?.coverUrl)) return match!.coverUrl!.trim();
    } catch {
      // ignore
    }
  }
  if (book.title?.trim()) {
    try {
      const matches = await lookupBookByTitle(book.title.trim());
      const withCover = matches?.find(m => isRealCover(m.coverUrl));
      if (withCover) return withCover.coverUrl!.trim();
    } catch {
      // nothing found
    }
  }

  return '';
}

/**
 * Enriches any partial book record with complete details (cover, summary, publisher, subjects)
 * by looking up additional databases if fields are missing.
 */
export async function enrichBookDetails(book: Partial<Book>): Promise<Partial<Book>> {
  if (!book) return {};
  
  // Create copies of fields to mutate safely
  const enriched: Partial<Book> = { ...book };
  
  // If we have an ISBN but are missing core structural details like summary or cover, do a deep Google Books / Open Library call
  if (enriched.isbn && (!enriched.description || !enriched.coverUrl || !enriched.publisher || !enriched.category)) {
    try {
      const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${enriched.isbn}`);
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
      const testRes = await fetch(enriched.coverUrl, { method: 'HEAD' });
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
    const res = await fetch(`/api/v1/lexile?${params.toString()}`);
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
      const res = await fetch(`https://lx2.loc.gov/master/sru/resources?version=1.1&operation=searchRetrieve&query=bf.isbn=${sanitizedIsbn}&maximumRecords=1&recordSchema=bibframe`);
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
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${sanitizedIsbn}`);
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
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${sanitizedIsbn}&format=json&jscmd=data`);
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
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
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
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchTitle)}&maxResults=5`;
    const response = await fetch(googleUrl);
    
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
        const olRes = await fetch(olSearchUrl);
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

