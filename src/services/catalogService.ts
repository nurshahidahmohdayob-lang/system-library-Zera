import { Book } from '@/src/types';

// Simple in-memory cache to make repeated lookups instant
const lookupCache = new Map<string, Partial<Book>>();

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
      } as Partial<Book>;
      return result;
    };

    const searchGoogle = async () => {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${sanitizedIsbn}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.items) throw new Error();
      const info = data.items[0].volumeInfo;
      const result = {
        isbn: sanitizedIsbn,
        title: info.title,
        author: info.authors ? info.authors.join(', ') : 'Unknown Author',
        description: info.description || '',
        category: info.categories ? info.categories[0] : 'General',
        coverUrl: info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '',
        publisher: info.publisher,
        publishedYear: info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined,
        source: 'Google'
      } as Partial<Book>;
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
        source: 'OpenLibrary'
      } as Partial<Book>;
      return result;
    };

    // Return the first one that responds successfully
    const fastResult = await Promise.any([searchLOC(), searchGoogle(), searchOL()]);
    
    if (fastResult) {
      lookupCache.set(sanitizedIsbn, fastResult);
    }
    
    return fastResult;
  } catch (error) {
    console.warn("Lookup Failed or Timed Out:", error);
    return null;
  }
}

export async function lookupBookByTitle(title: string): Promise<Partial<Book>[] | null> {
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=5`);
      const data = await response.json();
      
      if (!data.items) return null;
      
      return data.items.map((item: any) => {
        const info = item.volumeInfo;
        return {
          isbn: info.industryIdentifiers ? info.industryIdentifiers[0].identifier : '',
          title: info.title,
          author: info.authors ? info.authors.join(', ') : 'Unknown Author',
          description: info.description || '',
          category: info.categories ? info.categories[0] : 'General',
          coverUrl: info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '',
          publisher: info.publisher,
          publishedYear: info.publishedDate ? parseInt(info.publishedDate.split('-')[0]) : undefined
        } as any;
      });
    } catch (error) {
      console.error("Catalog Search Failed:", error);
      return null;
    }
  }
