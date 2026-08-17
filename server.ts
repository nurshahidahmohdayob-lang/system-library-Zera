import express from 'express';
import path from 'path';
import 'dotenv/config';

const AP_STUDENTS = [
  {
    id: "ST-1035",
    first_name: "Ahmad",
    last_name: "Zainuddin",
    nric_name: "Ahmad Zainuddin bin Abdul",
    preferred_name: "Ahmad",
    email: "ahmad.z@zera.edu.my",
    phone: "+6013-445-6622",
    gender: "male",
    class: "11-A",
    grade: "Grade 11",
    status: "active",
    cohort: "2025/2026",
    date_of_birth: "2009-08-14"
  },
  {
    id: "ST-1142",
    first_name: "Chloe",
    last_name: "Lim",
    nric_name: "Chloe Lim Jia Ying",
    preferred_name: "Chloe",
    email: "chloe.lim@zera.edu.my",
    phone: "+6017-233-1188",
    gender: "female",
    class: "10-B",
    grade: "Grade 10",
    status: "active",
    cohort: "2026/2027",
    date_of_birth: "2010-11-22"
  },
  {
    id: "ST-1250",
    first_name: "Muhammad",
    last_name: "Harith",
    nric_name: "Muhammad Harith bin Imran",
    preferred_name: "Harith",
    email: "harith.i@zera.edu.my",
    phone: "+6019-994-5511",
    gender: "male",
    class: "12-C",
    grade: "Grade 12",
    status: "active",
    cohort: "2025/2026",
    date_of_birth: "2008-05-30"
  },
  {
    id: "ST-1390",
    first_name: "Sarah",
    last_name: "Alatas",
    nric_name: "Sarah binte Syed Alatas",
    preferred_name: "Sarah",
    email: "sarah.alatas@zera.edu.my",
    phone: "+6012-778-9900",
    gender: "female",
    class: "9-A",
    grade: "Grade 9",
    status: "active",
    cohort: "2026/2027",
    date_of_birth: "2011-02-14"
  },
  {
    id: "ST-1411",
    first_name: "Marcus",
    last_name: "Tan",
    nric_name: "Marcus Tan Wei Jie",
    preferred_name: "Marcus",
    email: "marcus.tan@zera.edu.my",
    phone: "+6011-2188-7755",
    gender: "male",
    class: "11-B",
    grade: "Grade 11",
    status: "active",
    cohort: "2025/2026",
    date_of_birth: "2009-06-18"
  },
  {
    id: "ST-1520",
    first_name: "Divya",
    last_name: "Rao",
    nric_name: "Divya s/o Rajesh Rao",
    preferred_name: "Divya",
    email: "divya.rao@zera.edu.my",
    phone: "+6014-556-7788",
    gender: "female",
    class: "12-A",
    grade: "Grade 12",
    status: "active",
    cohort: "2025/2026",
    date_of_birth: "2008-09-02"
  },
  {
    id: "ST-1602",
    first_name: "Nur",
    last_name: "Aishah",
    nric_name: "Nur Aishah binti Zakaryya",
    preferred_name: "Aishah",
    email: "aishah.z@zera.edu.my",
    phone: "+6018-299-1002",
    gender: "female",
    class: "10-A",
    grade: "Grade 10",
    status: "active",
    cohort: "2026/2027",
    date_of_birth: "2010-01-25"
  }
];

// Helper dictionaries for generating remaining 193 student profiles dynamically & deterministically
const MALE_FIRST_NAMES = [
  "Aiman", "Hafiz", "Adam", "Khairul", "Farhan", "Luqman", "Amir", "Syakir", "Raziq", "Zul",
  "Lucas", "Wei", "Jun", "Zhi", "Ming", "Han", "Kai", "Daniel", "Ethan", "Zack",
  "Arun", "Karthik", "Sanjay", "Shankar", "Vikram", "Rajesh", "Vijay", "Anand", "Rohan", "Dev",
  "Bryan", "Darren", "Isaac", "Jayden", "Ryan", "Justin", "Kaelen", "Nicholas", "Rayyan", "Faris",
  "Ashwin", "Fadhil", "Govind", "Harris", "Ivan", "Joshua", "Kevin", "Leo", "Mikhail", "Naufal"
];

const FEMALE_FIRST_NAMES = [
  "Farah", "Siti", "Nuraliah", "Amira", "Aqilah", "Zahra", "Aisya", "Yasmin", "Huda", "Syifa",
  "Emily", "Yi", "Xin", "Jia", "Mei", "Ling", "Ying", "Yee", "Rachel", "Chloe",
  "Priya", "Anjali", "Meira", "Kavitha", "Rani", "Deepa", "Gayatri", "Neha", "Pooja", "Shanti",
  "Audrey", "Clarissa", "Fiona", "Grace", "Hannah", "Natalie", "Olivia", "Sophia", "Zoe", "Zara",
  "Alia", "Balkis", "Dahlia", "Elisa", "Fatima", "Irdina", "Kamini", "Leela", "Nisha", "Shalini"
];

const LAST_NAMES = [
  "Kamal", "Zulkifli", "Hassan", "Yusof", "Razak", "Rahman", "Musa", "Idris", "Ismail", "Ibrahim",
  "Chen", "Lee", "Wong", "Chan", "Lim", "Ong", "Ng", "Tan", "Chiew", "Yip",
  "Subramaniam", "Krishnan", "Raman", "Nair", "Pillay", "Kumar", "Iyer", "Rao", "Patel", "Sharma",
  "Alatas", "Zakaryya", "Imran", "Abdul", "Othman", "Goh", "Teoh", "Cheah", "Murugan", "Naidu",
  "Pinto", "Rozario", "Santiago", "Siddique", "Talib", "Vengadasalam", "Wee", "Xu", "Yeoh", "Zainal"
];

const CLASSES = ["9-A", "9-B", "10-A", "10-B", "11-A", "11-B", "12-A", "12-B", "12-C"];

// Generate exactly 193 more unique students to sum up to exactly 200
for (let i = 1; i <= 193; i++) {
  const gender = (i % 2 === 0) ? "female" : "male";
  const firstName = gender === "male"
    ? MALE_FIRST_NAMES[(i - 1) % MALE_FIRST_NAMES.length]
    : FEMALE_FIRST_NAMES[(i - 1) % FEMALE_FIRST_NAMES.length];
  const lastName = LAST_NAMES[(i - 1) % LAST_NAMES.length];
  
  // Construct a realistic full NRIC naming pattern
  let nricName: string;
  if (i % 3 === 0) {
    nricName = gender === "male" 
      ? `${firstName} ${lastName} bin Othman` 
      : `${firstName} ${lastName} binti Othman`;
  } else if (i % 3 === 1) {
    nricName = gender === "male" 
      ? `${firstName} ${lastName} s/o Sivan` 
      : `${firstName} ${lastName} d/o Sivan`;
  } else {
    nricName = `${firstName} ${lastName}`;
  }

  const id = `ST-${2000 + i}`;
  const preferredName = firstName;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@zera.edu.my`;
  const phone = `+601${(i % 9) + 1}-${700 + (i % 250)}-${1000 + (i % 8999)}`;
  const classIndex = i % CLASSES.length;
  const studentClass = CLASSES[classIndex];
  
  let grade = "Grade 9";
  let dobYear = 2011;
  
  if (studentClass.startsWith("10")) {
    grade = "Grade 10";
    dobYear = 2010;
  } else if (studentClass.startsWith("11")) {
    grade = "Grade 11";
    dobYear = 2009;
  } else if (studentClass.startsWith("12")) {
    grade = "Grade 12";
    dobYear = 2008;
  }
  
  const cohort = (grade === "Grade 9" || grade === "Grade 10") ? "2026/2027" : "2025/2026";
  
  // Stable dynamic birthdate definition
  const dobMonth = String((i % 12) + 1).padStart(2, '0');
  const dobDay = String((i % 28) + 1).padStart(2, '0');
  const dateOfBirth = `${dobYear}-${dobMonth}-${dobDay}`;

  AP_STUDENTS.push({
    id,
    first_name: firstName,
    last_name: lastName,
    nric_name: nricName,
    preferred_name: preferredName,
    email,
    phone,
    gender,
    class: studentClass,
    grade: grade,
    status: "active",
    cohort,
    date_of_birth: dateOfBirth
  });
}

const AP_STAFF = [
  {
    id: "SF-201",
    first_name: "Shahidah",
    last_name: "Ayob",
    nric_name: "Nur Shahidah binti Mohd Ayob",
    preferred_name: "Shahidah",
    email: "shahidah.a@zera.edu.my",
    phone: "+6012-334-5566",
    job_title: "Senior Lecturer",
    job_type: "Full-time",
    commencement_date: "2021-01-10",
    leave_date: null
  },
  {
    id: "SF-202",
    first_name: "Richard",
    last_name: "Hendricks",
    nric_name: "Richard Hendricks",
    preferred_name: "Richard",
    email: "r.hendricks@zera.edu.my",
    phone: "+6019-223-4455",
    job_title: "Head of Computer Science",
    job_type: "Full-time",
    commencement_date: "2018-06-01",
    leave_date: null
  },
  {
    id: "SF-203",
    first_name: "Aisha",
    last_name: "Farooq",
    nric_name: "Aisha binte Farooq",
    preferred_name: "Aisha",
    email: "aisha.f@zera.edu.my",
    phone: "+6017-778-8899",
    job_title: "Mathematics Teacher",
    job_type: "Full-time",
    commencement_date: "2020-09-01",
    leave_date: "2028-12-31"
  },
  {
    id: "SF-204",
    first_name: "Devi",
    last_name: "Subramanian",
    nric_name: "Devi Subramanian",
    preferred_name: "Devi",
    email: "devi.s@zera.edu.my",
    phone: "+6011-334-9988",
    job_title: "Science Educator",
    job_type: "Full-time",
    commencement_date: "2022-02-15",
    leave_date: null
  },
  {
    id: "SF-205",
    first_name: "Marcus",
    last_name: "Aurelius",
    nric_name: "Marcus Aurelius",
    preferred_name: "Marcus",
    email: "marcus.a@zera.edu.my",
    phone: "+6015-889-1122",
    job_title: "History Teacher",
    job_type: "Part-time",
    commencement_date: "2019-01-01",
    leave_date: "2025-05-01" // Inactive staff (leave date passed)
  },
  {
    id: "SF-206",
    first_name: "Jane",
    last_name: "Doe",
    nric_name: "Jane Doe",
    preferred_name: "Jane",
    email: "j.doe@zera.edu.my",
    phone: "+6016-554-3321",
    job_title: "Literature Teacher",
    job_type: "Full-time",
    commencement_date: "2023-01-01",
    leave_date: null
  },
  {
    id: "SF-207",
    first_name: "Kevin",
    last_name: "Mitnick",
    nric_name: "Kevin Mitnick",
    preferred_name: "Kevin",
    email: "k.mitnick@zera.edu.my",
    phone: "+6014-998-7766",
    job_title: "Security Administrator",
    job_type: "Contract",
    commencement_date: "2024-03-01",
    leave_date: null
  },
  {
    id: "SF-208",
    first_name: "Siti",
    last_name: "Aminah",
    nric_name: "Siti Aminah binti Kassim",
    preferred_name: "Siti",
    email: "siti.aminah@zera.edu.my",
    phone: "+6013-221-8899",
    job_title: "Bahasa Melayu Teacher",
    job_type: "Full-time",
    commencement_date: "2015-05-20",
    leave_date: null
  },
  {
    id: "SF-209",
    first_name: "Tan",
    last_name: "Ah Teck",
    nric_name: "Tan Ah Teck",
    preferred_name: "Ah Teck",
    email: "tan.at@zera.edu.my",
    phone: "+6018-443-1254",
    job_title: "Physics Teacher",
    job_type: "Full-time",
    commencement_date: "2021-08-01",
    leave_date: null
  },
  {
    id: "SF-210",
    first_name: "David",
    last_name: "Malcolms",
    nric_name: "David Malcolms",
    preferred_name: "David",
    email: "d.malcolms@zera.edu.my",
    phone: "+6017-312-5566",
    job_title: "Art Teacher",
    job_type: "Part-time",
    commencement_date: "2026-01-01",
    leave_date: null
  },
  {
    id: "SF-211",
    first_name: "Nur",
    last_name: "Suhaila",
    nric_name: "Nur Suhaila binti Mansor",
    preferred_name: "Suhaila",
    email: "suhaila.m@zera.edu.my",
    phone: "+6019-388-4122",
    job_title: "Chemistry Head",
    job_type: "Full-time",
    commencement_date: "2017-11-01",
    leave_date: null
  },
  {
    id: "SF-212",
    first_name: "Winston",
    last_name: "Churchill",
    nric_name: "Winston Churchill",
    preferred_name: "Winston",
    email: "w.churchill@zera.edu.my",
    phone: "+6012-321-4567",
    job_title: "Public Speaking Coach",
    job_type: "Part-time",
    commencement_date: "2025-01-01",
    leave_date: "2025-12-31" // Inactive
  }
];

// Generate exactly 41 more staff members to make the total exactly 53 profiles
const STAFF_JOB_TITLES = [
  "Senior Lecturer",
  "Mathematics Teacher",
  "Science Educator",
  "History Teacher",
  "Literature Teacher",
  "Language Department",
  "Physics Teacher",
  "Art Teacher",
  "Chemistry Head",
  "Georgetown Campus Deputy",
  "Physical Education Coach",
  "Biology Teacher",
  "Social Studies Teacher",
  "Economics Instructor",
  "Music Director"
];

const STAFF_JOB_TYPES = ["Full-time", "Part-time", "Contract"];

for (let i = 1; i <= 41; i++) {
  const gender = (i % 2 === 0) ? "female" : "male";
  const firstName = gender === "male"
    ? MALE_FIRST_NAMES[(i + 5) % MALE_FIRST_NAMES.length]
    : FEMALE_FIRST_NAMES[(i + 5) % FEMALE_FIRST_NAMES.length];
  const lastName = LAST_NAMES[(i + 5) % LAST_NAMES.length];
  
  const id = `SF-${212 + i}`;
  const preferredName = firstName;
  const nricName = gender === "male"
    ? `${firstName} ${lastName} s/o Sivan`
    : `${firstName} ${lastName} d/o Sivan`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@zera.edu.my`;
  const phone = `+601${(i % 9) + 1}-${500 + (i % 300)}-${2000 + (i % 6999)}`;
  const jobTitle = STAFF_JOB_TITLES[i % STAFF_JOB_TITLES.length];
  const jobType = STAFF_JOB_TYPES[i % STAFF_JOB_TYPES.length];
  
  AP_STAFF.push({
    id,
    first_name: firstName,
    last_name: lastName,
    nric_name: nricName,
    preferred_name: preferredName,
    email,
    phone,
    job_title: jobTitle,
    job_type: jobType,
    commencement_date: "2022-03-01",
    leave_date: null
  });
}

function getStaffStatus(commencement: string, leave: string | null): 'active' | 'inactive' {
  const currentDate = new Date();
  const commDate = new Date(commencement);
  if (currentDate < commDate) {
    return 'inactive';
  }
  if (leave) {
    const leaveDate = new Date(leave);
    if (currentDate > leaveDate) {
      return 'inactive';
    }
  }
  return 'active';
}

/**
 * Per-host circuit breaker for the outbound bibliographic sources, mirroring the
 * one in src/services/catalogService.ts.
 *
 * These hosts fail by hanging rather than refusing: when openlibrary.org is
 * down it accepts no connection at all, so every request rides its timeout to
 * the end. The enrichment endpoints consult the same handful of hosts several
 * times per book, so one dead host cost a multiple of its timeout on *every*
 * catalogued title. After two consecutive failures a host is skipped outright
 * for five minutes; one success reopens it.
 */
const HOST_BREAKER_THRESHOLD = 2;
const HOST_BREAKER_COOLDOWN_MS = 5 * 60_000;
const hostBreaker = new Map<string, { failures: number; openUntil: number }>();

const breakerHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const isHostDown = (url: string): boolean => {
  const entry = hostBreaker.get(breakerHost(url));
  return !!entry && entry.failures >= HOST_BREAKER_THRESHOLD && entry.openUntil > Date.now();
};

export const noteHostFailure = (url: string): void => {
  const host = breakerHost(url);
  const entry = hostBreaker.get(host) || { failures: 0, openUntil: 0 };
  entry.failures += 1;
  entry.openUntil = Date.now() + HOST_BREAKER_COOLDOWN_MS;
  hostBreaker.set(host, entry);
  if (entry.failures === HOST_BREAKER_THRESHOLD) {
    console.warn(`[catalog] "${host}" is not responding — skipping it for ${HOST_BREAKER_COOLDOWN_MS / 60000} min.`);
  }
};

export const noteHostSuccess = (url: string): void => {
  hostBreaker.delete(breakerHost(url));
};

/**
 * Keyless Google Books requests all share one anonymous daily quota, which runs
 * dry and starts answering 429 — the point at which enrichment falls through to
 * the slower sources. Set GOOGLE_BOOKS_API_KEY for this install's own quota;
 * without it the URL is exactly what it was before. Mirrors
 * VITE_GOOGLE_BOOKS_API_KEY on the client.
 */
const googleBooksUrl = (query: string, extra = ''): string => {
  const key = process.env.GOOGLE_BOOKS_API_KEY || '';
  return `https://www.googleapis.com/books/v1/volumes?q=${query}${extra}${key ? `&key=${key}` : ''}`;
};

/**
 * Keyless web-synopsis scraper. When the bibliographic databases (Google Books,
 * Open Library, LOC, Wikipedia) hold no abstract for a title, this discovers the
 * book's page on a consumer book site via DuckDuckGo's HTML endpoint (no API key)
 * and extracts the marketing synopsis from it. Returns '' when nothing genuine is
 * found. Best-effort and resilient: any network/parse failure just yields ''.
 */
async function scrapeWebBookData(title: string, author?: string, isbn?: string): Promise<{ description: string; publisher: string; publishedYear?: number; author: string }> {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

  const fetchText = async (url: string, timeoutMs = 5000): Promise<string> => {
    if (isHostDown(url)) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) noteHostFailure(url);
      else noteHostSuccess(url);
      if (!res.ok) return '';
      return await res.text();
    } catch {
      noteHostFailure(url);
      return '';
    } finally {
      clearTimeout(timer);
    }
  };

  // Normalise an extracted blurb: unescape JSON/unicode, strip HTML, decode entities.
  const cleanBlurb = (raw: string): string => {
    let s = raw;
    s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    s = s.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\\\\/g, '\\');
    s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ');
    s = s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
         .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
         .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…');
    return s.replace(/\s+/g, ' ').trim();
  };

  // Reject boilerplate / chrome that isn't an actual book synopsis.
  const isGenuine = (s: string): boolean => {
    const t = s.trim();
    if (t.length < 40) return false;
    if (/online bookstore|free shipping|enable javascript|sign in to|cookies? (policy|settings)|404|page not found/i.test(t)) return false;
    return true;
  };

  // Read the authoritative book blurb from og:description (always the book itself,
  // never a contributor bio), though it is sometimes truncated with an ellipsis.
  const ogDescription = (html: string): string => {
    const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)
           || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
    return m ? cleanBlurb(m[1]) : '';
  };

  // Goodreads embeds the *full* blurb in a JSON "description" field, but the page
  // also embeds author/contributor bios in identical fields. We anchor on the
  // og:description (the real book) and pick the embedded copy that begins the same
  // way — so a bio can never be returned in place of the synopsis.
  const extractGoodreads = (html: string): string => {
    const og = ogDescription(html);
    const candidates: string[] = [];
    for (const m of html.matchAll(/"description"\s*:\s*"((?:[^"\\]|\\.){40,})"/g)) {
      const c = cleanBlurb(m[1]);
      if (isGenuine(c)) candidates.push(c);
    }
    if (og) {
      const key = og.replace(/[…\s]+$/, '').slice(0, 30).toLowerCase();
      const full = candidates.find(c => c.toLowerCase().startsWith(key));
      if (full) return full;                  // full blurb, verified to match the book
      if (isGenuine(og)) return og;           // og is correct even if truncated
    }
    // No og to anchor on: only trust an embedded blurb when it's unambiguous.
    return candidates.length === 1 ? candidates[0] : '';
  };

  // Generic extraction for trusted retail/publisher pages: og:description is the
  // book blurb on these sites; fall back to the meta description. We avoid the
  // unanchored embedded-JSON grab here as it can surface the wrong entity's text.
  const extractGeneric = (html: string): string => {
    const og = ogDescription(html);
    if (isGenuine(og)) return og;
    const md = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (md) { const c = cleanBlurb(md[1]); if (isGenuine(c)) return c; }
    return '';
  };

  // Pull structured bibliographic fields (publisher, year, author) from the same
  // book page — primarily via JSON-LD (schema.org/Book), then og:book:* meta tags.
  const extractBookMeta = (html: string): { publisher: string; publishedYear?: number; author: string } => {
    const out: { publisher: string; publishedYear?: number; author: string } = { publisher: '', author: '' };
    const nameOf = (v: any): string => {
      if (!v) return '';
      if (typeof v === 'string') return cleanBlurb(v);
      if (Array.isArray(v)) return nameOf(v[0]);
      return cleanBlurb(v.name || '');
    };
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let json: any;
      try { json = JSON.parse(m[1].trim()); } catch { continue; }
      const nodes: any[] = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const type = node['@type'];
        const isBook = type === 'Book' || (Array.isArray(type) && type.includes('Book'));
        if (!isBook) continue;
        if (!out.publisher && node.publisher) out.publisher = nameOf(node.publisher);
        if (!out.author && node.author) out.author = nameOf(node.author);
        if (out.publishedYear === undefined && (node.datePublished || node.copyrightYear)) {
          const y = String(node.datePublished || node.copyrightYear).match(/\d{4}/);
          if (y) out.publishedYear = parseInt(y[0], 10);
        }
      }
    }
    if (!out.author) {
      const m = html.match(/<meta[^>]+property=["'](?:og:book:author|books:author|book:author)["'][^>]+content=["']([^"']+)["']/i);
      if (m) out.author = cleanBlurb(m[1]);
    }
    if (out.publishedYear === undefined) {
      const m = html.match(/<meta[^>]+property=["'](?:og:book:release_date|book:release_date|books:release_date)["'][^>]+content=["']([^"']+)["']/i);
      if (m) { const y = m[1].match(/\d{4}/); if (y) out.publishedYear = parseInt(y[0], 10); }
    }
    return out;
  };

  try {
    const query = `${title} ${author || ''} book synopsis`.replace(/\s+/g, ' ').trim();
    const ddg = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 5000);
    if (!ddg) return { description: '', publisher: '', author: '' };

    // Real organic results are encoded as uddg=<url>; skip DDG/Bing ad-tracker links.
    const urls: string[] = [];
    for (const m of ddg.matchAll(/uddg=([^"&]+)/g)) {
      try {
        const u = decodeURIComponent(m[1]);
        if (/[?&]ad_domain=|y\.js|bing\.com\/aclick|duckduckgo\.com/i.test(u)) continue;
        if (!urls.includes(u)) urls.push(u);
      } catch { /* skip malformed */ }
    }

    // Whitelist of book sites whose pages expose a clean, *correct* book synopsis,
    // ordered by reliability (Goodreads keeps the full blurb in embedded JSON).
    // We deliberately scrape ONLY these: arbitrary pages (e.g. publisher landing
    // pages) risk surfacing the wrong text such as an unrelated author bio, which
    // is worse than no synopsis for a catalogue record. One URL per domain.
    const preferred = ['goodreads.com', 'bookshop.org', 'harpercollins.com',
                       'simonandschuster.com', 'us.macmillan.com', 'hachettebookgroup.com'];
    const ordered = preferred
      .map(d => urls.find(u => u.includes(d)))
      .filter((u): u is string => Boolean(u));

    const best: { description: string; publisher: string; publishedYear?: number; author: string } =
      { description: '', publisher: '', author: '' };
    for (const url of ordered.slice(0, 3)) {
      const html = await fetchText(url, 5000);
      if (!html) continue;
      const host = url.replace(/^https?:\/\//, '').split('/')[0];

      // Structured metadata (publisher/year/author) — keep the first found of each.
      const meta = extractBookMeta(html);
      if (!best.publisher && meta.publisher) best.publisher = meta.publisher;
      if (!best.author && meta.author) best.author = meta.author;
      if (best.publishedYear === undefined && meta.publishedYear !== undefined) best.publishedYear = meta.publishedYear;

      // Synopsis (unchanged extraction logic).
      const blurb = url.includes('goodreads.com')
        ? (extractGoodreads(html) || extractGeneric(html))
        : extractGeneric(html);
      if (!best.description && isGenuine(blurb)) {
        best.description = blurb;
        console.log(`[Web Book Scraper] Found synopsis for "${title}" via ${host}`);
      }

      // Stop early once we have everything we look for.
      if (best.description && best.publisher && best.author && best.publishedYear !== undefined) break;
    }
    if (best.publisher || best.author || best.publishedYear !== undefined) {
      console.log(`[Web Book Scraper] Metadata for "${title}": publisher="${best.publisher}" year=${best.publishedYear ?? '-'} author="${best.author}"`);
    }
    return best;
  } catch (err) {
    console.warn('[Web Book Scraper] lookup failed:', err instanceof Error ? err.message : err);
  }
  return { description: '', publisher: '', author: '' };
}

// Builds the Express app with every API/SSO route wired up, but WITHOUT the Vite
// middleware, static file serving, or listen() — so it can be reused both by the
// local standalone server (startServer) and by the Vercel serverless entrypoint
// (api/index.ts), where hosting serves the static client and calls this handler.
export async function createApiApp() {
  const app = express();

  // Middleware to enable CORS and parse JSON
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Commun Connected-Systems SSO (browser handoff + one-time custom-token exchange).
  // Registered before the API routes and the Vite/static SPA catch-all — but only
  // when SSO is actually configured. The SSO module graph pulls in firebase-admin
  // (and its jwks-rsa/jose chain), so importing it lazily & conditionally keeps it
  // off the cold-start path of environments that don't use SSO (e.g. Vercel), where
  // it can't function anyway without COMMUN_* credentials.
  const ssoConfigured = !!(process.env.COMMUN_ISSUER || process.env.COMMUN_SUBDOMAIN);
  const devSsoEnabled = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_SSO === 'true';
  if (ssoConfigured || devSsoEnabled) {
    const { registerSsoRoutes } = await import('./src/server/sso/routes.js');
    registerSsoRoutes(app);
  }

  // AI-Powered Book Synopsis & Details Enrichment endpoint using Google GenAI SDK (gemini-3.5-flash)
  // Lexile reading-level lookup via the free MetaMetrics "Find a Book" search
  // (the same backend hub.lexile.com uses). Returns a display measure like
  // "740L" or "AD580L", or null when the book has no published measure.
  const lookupLexileMeasure = async (title?: string, author?: string, isbn?: string): Promise<string | null> => {
    const searchLexile = async (term: string): Promise<any[]> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch('https://atlas-fab.lexile.com/free/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json; version=1.0' },
          body: JSON.stringify({ term }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) return [];
        const data = await res.json();
        return data?.data?.results || [];
      } catch {
        clearTimeout(timeoutId);
        return [];
      }
    };

    const formatMeasure = (r: any): string | null => {
      const m = r?.measurements?.english;
      if (!m || !m.measurable || m.lexile === null || m.lexile === undefined) return null;
      return `${m.lexile_code || ''}${m.lexile}L`;
    };

    try {
      // ISBN is an exact identifier — trust its result directly
      const cleanIsbn = (isbn || '').replace(/[^0-9X]/gi, '');
      if (cleanIsbn.length >= 10) {
        for (const r of await searchLexile(cleanIsbn)) {
          const measure = formatMeasure(r);
          if (measure) return measure;
        }
      }

      // Title search: only accept results whose title actually matches, so a
      // similarly-named book never contributes a wrong reading level.
      // (Author is NOT used as a hard filter — the Lexile DB has misspelled
      // author names, e.g. "David Williams" for Walliams.)
      if (title) {
        const cleanTitle = title.replace(/\.[a-zA-Z0-9]+$/, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        const target = normalize(cleanTitle);
        if (target.length >= 3) {
          // Accept only an exact title match (or exact up to a ":" subtitle) —
          // looser prefix matching can grab study guides and compilations,
          // e.g. "Charlotte's Web, Stuart Little" by a different author.
          const isExactMatch = (r: any) => {
            const dbTitle = String(r.title || '');
            return normalize(dbTitle) === target || normalize(dbTitle.split(':')[0]) === target;
          };
          const termVariants = author ? [`${cleanTitle} ${author}`, cleanTitle] : [cleanTitle];
          for (const term of termVariants) {
            const results = await searchLexile(term);
            for (const r of results.filter(isExactMatch)) {
              const measure = formatMeasure(r);
              if (measure) return measure;
            }
          }
        }
      }
    } catch (err) {
      console.log('[Lexile] Measure lookup bypassed or unavailable.');
    }
    return null;
  };

  // Build an ordered list of candidate CSV URLs to try for a pasted link.
  // Runs server-side so the browser's CORS policy can't block public Google
  // Sheets / Dropbox / Drive / raw CSV URLs. For Google Sheets we try several
  // export forms because a Workspace org can answer one endpoint with 403 while
  // another succeeds.
  const buildCsvCandidates = (raw: string): string[] => {
    let url = raw.trim();

    // Already a "Publish to web" link (/spreadsheets/d/e/<token>/pub...). These
    // are truly public; just make sure CSV output is requested.
    if (/\/spreadsheets\/d\/e\//.test(url)) {
      let pub = url.replace('/pubhtml', '/pub');
      if (!/output=csv/.test(pub)) {
        pub += (pub.includes('?') ? '&' : '?') + 'output=csv';
      }
      return [pub];
    }

    // Normal Google Sheet: https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
    const gsheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (gsheet) {
      const id = gsheet[1];
      const gidMatch = url.match(/[#&?]gid=(\d+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      return [
        `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
        `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
      ];
    }

    // Dropbox share links -> direct download
    if (/dropbox\.com\//.test(url)) {
      url = url.replace('?dl=0', '?dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
    }
    // Google Drive file links -> direct download
    const gdrive = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (gdrive) {
      return [`https://drive.google.com/uc?export=download&id=${gdrive[1]}`];
    }
    return [url];
  };

  app.get('/api/v1/fetch-sheet', async (req, res) => {
    const { url: rawUrl } = req.query;
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return res.status(400).json({ error: 'A spreadsheet/CSV url is required' });
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return res.status(400).json({ error: 'That does not look like a valid link. Paste a full https:// URL.' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http/https links are supported.' });
    }

    const isGoogleSheet = /docs\.google\.com\/spreadsheets/.test(rawUrl);
    const candidates = buildCsvCandidates(rawUrl);

    const tryFetch = async (fetchUrl: string): Promise<{ ok: true; csv: string; source: string } | { ok: false; status: number; html: boolean }> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const upstream = await fetch(fetchUrl, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (ZeraLibrary)', 'Accept': 'text/csv, text/plain, */*' },
        });
        if (!upstream.ok) {
          return { ok: false, status: upstream.status, html: false };
        }
        const contentType = upstream.headers.get('content-type') || '';
        const body = await upstream.text();
        const looksLikeHtml = /^\s*<(!doctype|html)/i.test(body) || contentType.includes('text/html');
        if (looksLikeHtml) {
          return { ok: false, status: upstream.status, html: true };
        }
        return { ok: true, csv: body, source: fetchUrl };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    let lastStatus = 0;
    let sawHtml = false;
    try {
      for (const candidate of candidates) {
        const result = await tryFetch(candidate);
        if (result.ok === true) {
          return res.json({ csv: result.csv, source: result.source });
        }
        lastStatus = result.status;
        sawHtml = sawHtml || result.html;
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return res.status(aborted ? 504 : 502).json({
        error: aborted ? 'The link took too long to respond.' : 'Could not fetch that link. Check the URL and sharing settings.',
      });
    }

    // All candidates failed — explain the most likely fix.
    if (isGoogleSheet && (lastStatus === 403 || lastStatus === 401 || sawHtml)) {
      return res.status(502).json({
        error: 'Google blocked access to this sheet (403). On a school/Workspace account, "Anyone with the link" is often limited to people inside your organisation, so an outside server can\'t read it. Fix: in the Sheet, go File ▸ Share ▸ Publish to web ▸ choose CSV ▸ Publish, then paste that published link here. (Or download the sheet as .csv and use the file upload above.)',
      });
    }
    return res.status(502).json({
      error: sawHtml
        ? 'The link returned a web page, not a spreadsheet. Set sharing to "Anyone with the link can view", or paste a direct .csv link.'
        : `The link returned ${lastStatus || 'an error'}. Make sure it is publicly viewable, or use File ▸ Share ▸ Publish to web ▸ CSV and paste that link.`,
    });
  });

  // Finds a real book-cover image URL from the open web using the ISBN first,
  // then the title (+author). Uses Open Library's search index, which only
  // returns a `cover_i` (cover id) when a genuine cover actually exists — so we
  // never attach a blank placeholder. No API key and no per-user quota.
  const lookupCoverImage = async (title: string, author: string, isbn: string): Promise<string> => {
    const olFetch = async (url: string): Promise<any | null> => {
      if (isHostDown(url)) return null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'ZeraLibrary/1.0 (library@zera.edu.my)' },
        });
        if (r.status === 429 || r.status >= 500) noteHostFailure(url);
        else noteHostSuccess(url);
        if (!r.ok) return null;
        return await r.json();
      } catch {
        noteHostFailure(url);
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const coverFromId = (id: number | undefined): string =>
      typeof id === 'number' && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : '';

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    // The ISBN and title searches are independent, so they go out together and
    // the endpoint costs one round-trip rather than two. Serially they were the
    // whole 12-second budget of this route whenever Open Library was unwell.
    const cleanIsbn = (isbn || '').replace(/[^0-9X]/gi, '');
    const titleParams = new URLSearchParams({ title: (title || '').trim(), limit: '8' });
    if (author && author.trim()) titleParams.set('author', author.trim().split(',')[0]);
    titleParams.set('fields', 'title,author_name,cover_i');

    const [isbnData, titleData] = await Promise.all([
      cleanIsbn.length === 10 || cleanIsbn.length === 13
        ? olFetch(`https://openlibrary.org/search.json?isbn=${cleanIsbn}&limit=1&fields=cover_i,title`)
        : Promise.resolve(null),
      title && title.trim()
        ? olFetch(`https://openlibrary.org/search.json?${titleParams.toString()}`)
        : Promise.resolve(null)
    ]);

    // 1. Exact ISBN match — most reliable, so it still wins.
    const byIsbn = coverFromId(isbnData?.docs?.[0]?.cover_i);
    if (byIsbn) return byIsbn;

    // 2. Title (+author) search. Prefer a doc whose title matches exactly so we
    //    don't grab an omnibus/study-guide cover for the wrong edition.
    if (title && title.trim()) {
      const docs: any[] = Array.isArray(titleData?.docs) ? titleData.docs : [];
      const target = normalize(title);
      const withCover = docs.filter(d => typeof d.cover_i === 'number' && d.cover_i > 0);

      const exact = withCover.find(d =>
        normalize(d.title || '') === target ||
        normalize((d.title || '').split(':')[0]) === target
      );
      if (exact) return coverFromId(exact.cover_i);
      // Author was provided (so the search is already constrained) — accept the
      // top covered result.
      if (author && author.trim() && withCover[0]) return coverFromId(withCover[0].cover_i);
    }

    return '';
  };

  app.get('/api/v1/cover', async (req, res) => {
    const { title, author, isbn } = req.query;
    if (!title && !isbn) {
      return res.status(400).json({ error: 'title or isbn is required' });
    }
    const coverUrl = await lookupCoverImage(
      typeof title === 'string' ? title : '',
      typeof author === 'string' ? author : '',
      typeof isbn === 'string' ? isbn : ''
    );
    res.json({ coverUrl });
  });

  app.get('/api/v1/lexile', async (req, res) => {
    const { title, author, isbn } = req.query;
    if (!title && !isbn) {
      return res.status(400).json({ error: 'title or isbn is required' });
    }
    const lexileLevel = await lookupLexileMeasure(
      typeof title === 'string' ? title : '',
      typeof author === 'string' ? author : '',
      typeof isbn === 'string' ? isbn : ''
    );
    res.json({ lexileLevel });
  });

  app.post('/api/v1/enrich-book-ai', async (req, res) => {
    const { title: rawTitle, author, isbn, description: rawDescription } = req.body;
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';

    if (!title && !isbn) {
      return res.status(400).json({ error: 'Title or ISBN is required' });
    }

    // Treat system-generated placeholder strings as "no description" so they
    // never suppress the real synopsis lookup below.
    const placeholderDescRx = /^(Catalogued via automatic batch sync module\.|Institutional asset for Zera Education\.|No explicit abstract provided for this asset\.|No synopsis\/abstract available in public bibliographic databases\.|Institutional archive record for)/;
    const description = typeof rawDescription === 'string' && rawDescription.trim().length >= 15 && !placeholderDescRx.test(rawDescription.trim())
      ? rawDescription.trim()
      : '';

    // Advanced dynamic WorldCat & Z39.50 multi-source catalog metadata retriever
    const fetchWorldCataloguingData = async (
      t: string, 
      a?: string, 
      i?: string, 
      existingDesc?: string
    ) => {
      console.log(`[WorldCatalog & Z39.50] Fetching bibliography for Title: "${t}", ISBN: "${i || 'N/A'}"`);
      
      const fetchWithTimeout = async (url: string, timeoutMs = 1500): Promise<Response> => {
        if (isHostDown(url)) throw new Error(`Source ${breakerHost(url)} is marked down; skipping`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.status === 429 || response.status >= 500) noteHostFailure(url);
          else noteHostSuccess(url);
          return response;
        } catch (err) {
          clearTimeout(timeoutId);
          noteHostFailure(url);
          throw err;
        }
      };

      // Open Library keeps real synopses on the *work* record, not the edition —
      // this is the most reliable free source when Google Books is quota-limited.
      const fetchOpenLibraryWorkDesc = async (workKey: string): Promise<string> => {
        try {
          const res = await fetchWithTimeout(`https://openlibrary.org${workKey}.json`, 2500);
          if (res.ok) {
            const work = await res.json();
            const d = work.description;
            const text = typeof d === 'string' ? d : (d && typeof d.value === 'string' ? d.value : '');
            // Open Library descriptions often end with a "----------\nAlso contained in:" trailer
            return text.split(/\r?\n-{4,}/)[0].trim();
          }
        } catch {
          console.log('[WorldCatalog] Open Library work description lookup bypassed or unavailable.');
        }
        return '';
      };

      let fetchedDesc = existingDesc || '';
      let fetchedPublisher = '';
      let fetchedYear: number | undefined;
      let fetchedAuthors = a || '';
      let fetchedCategory = '';
      let fetchedSubjects: string[] = [];
      let fetchedPageCount: number | undefined;
      let sourceUsed = 'None';

      // 1. Try parsing/searching by ISBN first if available
      if (i) {
        const cleanIsbn = i.replace(/[^0-9X]/gi, '');
        if (cleanIsbn) {
          // A. Try Google Books API by ISBN for genuine synopses
          try {
            const res = await fetchWithTimeout(googleBooksUrl(`isbn:${cleanIsbn}`));
            if (res.ok) {
              const data = await res.json();
              if (data.items && data.items.length > 0) {
                const info = data.items[0].volumeInfo;
                if (info.description) fetchedDesc = info.description;
                if (info.publisher) fetchedPublisher = info.publisher;
                if (info.publishedDate) {
                  const year = parseInt(info.publishedDate.split('-')[0]);
                  if (!isNaN(year)) fetchedYear = year;
                }
                if (info.authors) fetchedAuthors = info.authors.join(', ');
                if (info.categories) {
                  fetchedCategory = info.categories[0];
                  fetchedSubjects = info.categories;
                }
                if (info.pageCount) fetchedPageCount = info.pageCount;
                sourceUsed = 'Google Books (ISBN)';
              }
            }
          } catch (err) {
            console.log("[WorldCatalog] ISBN query via Google Books bypassed or unavailable.");
          }

          // B. Try OpenLibrary by ISBN if no description was obtained yet
          if (!fetchedDesc || fetchedDesc.trim().length === 0) {
            try {
              const res = await fetchWithTimeout(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
              if (res.ok) {
                const data = await res.json();
                const key = `ISBN:${cleanIsbn}`;
                if (data[key]) {
                  const info = data[key];
                  if (info.description) {
                    fetchedDesc = typeof info.description === 'string' ? info.description : (info.description.value || '');
                  } else if (info.notes) {
                    fetchedDesc = info.notes;
                  }
                  if (info.publishers && info.publishers.length > 0) {
                    fetchedPublisher = info.publishers[0].name;
                  }
                  if (info.publishDate) {
                    const year = parseInt(info.publishDate.slice(-4));
                    if (!isNaN(year)) fetchedYear = year;
                  }
                  if (info.authors) {
                    fetchedAuthors = info.authors.map((au: any) => au.name).join(', ');
                  }
                  if (info.subjects) {
                    fetchedSubjects = info.subjects.map((s: any) => s.name);
                    if (fetchedSubjects.length > 0) {
                      fetchedCategory = fetchedSubjects[0];
                    }
                  }
                  if (info.number_of_pages) fetchedPageCount = info.number_of_pages;
                  sourceUsed = 'OpenLibrary (ISBN)';
                }
              }
            } catch (err) {
              console.log("[WorldCatalog] ISBN query via OpenLibrary bypassed or unavailable.");
            }
          }

          // B2. Resolve the ISBN to its Open Library *work* record for a true synopsis
          if (!fetchedDesc || fetchedDesc.trim().length === 0) {
            try {
              const res = await fetchWithTimeout(`https://openlibrary.org/isbn/${cleanIsbn}.json`, 2500);
              if (res.ok) {
                const edition = await res.json();
                const workKey = edition.works?.[0]?.key;
                if (workKey) {
                  const workDesc = await fetchOpenLibraryWorkDesc(workKey);
                  if (workDesc) {
                    fetchedDesc = workDesc;
                    sourceUsed = 'OpenLibrary Work (ISBN)';
                  }
                }
              }
            } catch (err) {
              console.log("[WorldCatalog] ISBN-to-work resolution via OpenLibrary bypassed or unavailable.");
            }
          }

          // C. Try LOC (Library of Congress) SRU Z39.50 Gateway
          if (!fetchedDesc || fetchedDesc.trim().length === 0) {
            try {
              const res = await fetchWithTimeout(`https://lx2.loc.gov/master/sru/resources?version=1.1&operation=searchRetrieve&query=bf.isbn=${cleanIsbn}&maximumRecords=1&recordSchema=bibframe`);
              if (res.ok) {
                const xml = await res.text();
                const tMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
                const aMatch = xml.match(/<label[^>]*>([^<]+)<\/label>/);
                if (tMatch) {
                  fetchedPublisher = 'Library of Congress Z39.50';
                  if (aMatch && !fetchedAuthors) {
                    fetchedAuthors = aMatch[1].trim();
                  }
                  sourceUsed = 'Library of Congress SRU (Z39.50)';
                }
              }
            } catch (err) {
              console.log("[WorldCatalog] Z39.50 Library of Congress query bypassed or unavailable.");
            }
          }
        }
      }

      // 2. Fall back to search by Title / Author if still missing description/synopsis
      if ((!fetchedDesc || fetchedDesc.trim().length < 15) && t) {
        const cleanTitle = t.replace(/\.[a-zA-Z0-9]+$/, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
        const queryStr = a ? `${cleanTitle} ${a}` : cleanTitle;

        // A. Google Books Search
        try {
          const res = await fetchWithTimeout(googleBooksUrl(encodeURIComponent(queryStr), '&maxResults=2'));
          if (res.ok) {
            const data = await res.json();
            if (data.items && data.items.length > 0) {
              const info = data.items[0].volumeInfo;
              if (info.description) fetchedDesc = info.description;
              if (!fetchedPublisher && info.publisher) fetchedPublisher = info.publisher;
              if (!fetchedYear && info.publishedDate) {
                const year = parseInt(info.publishedDate.split('-')[0]);
                if (!isNaN(year)) fetchedYear = year;
              }
              if (!fetchedAuthors && info.authors) fetchedAuthors = info.authors.join(', ');
              if (!fetchedCategory && info.categories) {
                fetchedCategory = info.categories[0];
                fetchedSubjects = info.categories;
              }
              if (!fetchedPageCount && info.pageCount) fetchedPageCount = info.pageCount;
              sourceUsed = 'Google Books (Title Search)';
            }
          }
        } catch (err) {
          console.log("[WorldCatalog] Title query via Google Books bypassed or unavailable.");
        }

        // B. OpenLibrary Title Search
        if (!fetchedDesc || fetchedDesc.trim().length < 15) {
          try {
            const res = await fetchWithTimeout(`https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}&limit=1`);
            if (res.ok) {
              const data = await res.json();
              if (data.docs && data.docs.length > 0) {
                const doc = data.docs[0];
                if (doc.key) {
                  const workDesc = await fetchOpenLibraryWorkDesc(doc.key);
                  if (workDesc) fetchedDesc = workDesc;
                }
                if ((!fetchedDesc || fetchedDesc.trim().length < 15) && doc.first_sentence) {
                  const firstSentence = Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence.value;
                  if (firstSentence) fetchedDesc = firstSentence;
                }
                if (!fetchedPublisher && doc.publisher && doc.publisher.length > 0) {
                  fetchedPublisher = doc.publisher[0];
                }
                if (!fetchedYear && doc.first_publish_year) {
                  fetchedYear = doc.first_publish_year;
                }
                if (!fetchedAuthors && doc.author_name) {
                  fetchedAuthors = doc.author_name.join(', ');
                }
                if (!fetchedCategory && doc.subject && doc.subject.length > 0) {
                  fetchedCategory = doc.subject[0];
                  fetchedSubjects = doc.subject.slice(0, 5);
                }
                if (!fetchedPageCount && doc.number_of_pages_median) {
                  fetchedPageCount = doc.number_of_pages_median;
                }
                sourceUsed = 'OpenLibrary (Title Search)';
              }
            }
          } catch (err) {
            console.log("[WorldCatalog] Title query via OpenLibrary bypassed or unavailable.");
          }
        }
      }

      // 3. Wikipedia page-summary fallback — popular titles often have a real
      // encyclopedic blurb even when book APIs return nothing, junk reader
      // comments, or a description in another language.
      const looksEnglish = (text: string): boolean => {
        const hits = text.slice(0, 300).toLowerCase().match(/\b(the|and|of|to|in|is|was|with|for|that)\b/g);
        return (hits?.length || 0) >= 2;
      };
      if ((!fetchedDesc || fetchedDesc.trim().length < 50 || !looksEnglish(fetchedDesc)) && t) {
        const cleanTitle = t.replace(/\.[a-zA-Z0-9]+$/, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
        const authorSurname = (a || '').trim().split(/\s+/).pop()?.toLowerCase() || '';
        // Book articles for ambiguous titles usually live at "Title (novel)";
        // the bare title may be a disambiguation page or an unrelated topic.
        for (const candidate of [`${cleanTitle} (novel)`, cleanTitle]) {
          try {
            const res = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate)}`, 2500);
            if (!res.ok) continue;
            const data = await res.json();
            const extract = (data.extract || '').trim();
            // Guard against grabbing an unrelated article: the page must read like
            // it is about a book, or at least mention the author.
            const looksLikeBook = /\b(book|novel|novella|memoir|biography|autobiography|story|stories|anthology|picture book|poem|poetry)\b/i.test(extract)
              || (authorSurname.length > 2 && extract.toLowerCase().includes(authorSurname));
            if (data.type === 'standard' && extract.length >= 60 && looksLikeBook) {
              fetchedDesc = extract;
              sourceUsed = 'Wikipedia (Page Summary)';
              break;
            }
          } catch (err) {
            console.log("[WorldCatalog] Wikipedia summary lookup bypassed or unavailable.");
          }
        }
      }

      // Clean simple HTML tags from any description obtained
      if (fetchedDesc) {
        fetchedDesc = fetchedDesc.replace(/<[^>]*>/g, '').trim();
      }

      console.log(`[WorldCatalog] Completed lookup using: ${sourceUsed}. Success? ${!!fetchedDesc}`);

      return {
        description: fetchedDesc,
        publisher: fetchedPublisher || 'Zera Academic Press',
        publishedYear: fetchedYear,
        author: fetchedAuthors,
        category: fetchedCategory,
        subjects: fetchedSubjects && fetchedSubjects.length > 0 ? fetchedSubjects : undefined,
        pageCount: fetchedPageCount
      };
    };

    // Helper functions for advanced offline scholastic heuristic modeling
    const generateHeuristicScholasticMetadata = (
      t: string, 
      a: string | undefined, 
      i: string | undefined, 
      existingDesc: string | undefined,
      retrieved: any
    ) => {
      const cleanedTitle = t.replace(/\.[a-zA-Z0-9]+$/, '').replace(/\(.*?\)|\[.*?\]/g, '').trim();
      const lowerTitle = cleanedTitle.toLowerCase();
      
      let category = retrieved.category || 'Scholarly Resource';
      let subjects = retrieved.subjects && retrieved.subjects.length > 0 ? retrieved.subjects : ['Research', 'Reference Material', 'Scholarly Corpus'];
      let publisher = retrieved.publisher || 'Zera Academic Press';
      let pageCount = retrieved.pageCount || 320;
      let dimensions = '23cm';
      
      if (category === 'Scholarly Resource' || category === 'General' || category === '' || category === 'Library Record') {
        if (
          lowerTitle.includes('python') || 
          lowerTitle.includes('code') || 
          lowerTitle.includes('javascript') || 
          lowerTitle.includes('programming') || 
          lowerTitle.includes('software') || 
          lowerTitle.includes('computer') || 
          lowerTitle.includes('data') || 
          lowerTitle.includes('algorithm') || 
          lowerTitle.includes('web dev') || 
          lowerTitle.includes('machine learning') || 
          lowerTitle.includes('network')
        ) {
          category = 'Computer Science';
          subjects = ['Software Engineering', 'Information Technology', 'Algorithm Theory', 'Hardware Architectures', 'Digital Systems'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Digital & Computing Press';
          pageCount = retrieved.pageCount || 412;
          dimensions = '24cm';
        } else if (
          lowerTitle.includes('history') || 
          lowerTitle.includes('war') || 
          lowerTitle.includes('medieval') || 
          lowerTitle.includes('empire') || 
          lowerTitle.includes('century') || 
          lowerTitle.includes('classic') || 
          lowerTitle.includes('rebellion') || 
          lowerTitle.includes('archaeology') || 
          lowerTitle.includes('ancient')
        ) {
          category = 'History';
          subjects = ['Historiography', 'Civilization Analysis', 'Humanities Archive', 'Geopolitics', 'Legacy Records'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Historical Publications';
          pageCount = retrieved.pageCount || 380;
          dimensions = '23cm';
        } else if (
          lowerTitle.includes('biology') || 
          lowerTitle.includes('chemistry') || 
          lowerTitle.includes('physics') || 
          lowerTitle.includes('quantum') || 
          lowerTitle.includes('science') || 
          lowerTitle.includes('anatomy') || 
          lowerTitle.includes('laboratory') || 
          lowerTitle.includes('elements') || 
          lowerTitle.includes('astronomy') ||
          lowerTitle.includes('nature')
        ) {
          category = 'Science';
          subjects = ['Empirical Science', 'Experimental Analysis', 'Natural Philosophy', 'Quantitative Inquiry', 'Theoretical Research'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Science Archives';
          pageCount = retrieved.pageCount || 350;
          dimensions = '24cm';
        } else if (
          lowerTitle.includes('math') || 
          lowerTitle.includes('calculus') || 
          lowerTitle.includes('geometry') || 
          lowerTitle.includes('algebra') || 
          lowerTitle.includes('equations') || 
          lowerTitle.includes('statistic') || 
          lowerTitle.includes('mathematics')
        ) {
          category = 'Mathematics';
          subjects = ['Applied Mathematics', 'Quantitative Reasoning', 'Numerical Analysis', 'Mathematical Logic', 'Statistical Modeling'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Science Archives';
          pageCount = retrieved.pageCount || 295;
          dimensions = '24cm';
        } else if (
          lowerTitle.includes('economics') || 
          lowerTitle.includes('finance') || 
          lowerTitle.includes('accounting') || 
          lowerTitle.includes('business') || 
          lowerTitle.includes('management') || 
          lowerTitle.includes('marketing') || 
          lowerTitle.includes('corporate') || 
          lowerTitle.includes('commerce') || 
          lowerTitle.includes('market') ||
          lowerTitle.includes('startup')
        ) {
          category = 'Business & Economics';
          subjects = ['Corporate Finance', 'Strategic Resource Operations', 'Macroeconomic Models', 'Operational Logistics', 'Commerce Systems'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Mercantile Review';
          pageCount = retrieved.pageCount || 310;
          dimensions = '23cm';
        } else if (
          lowerTitle.includes('poetry') || 
          lowerTitle.includes('novel') || 
          lowerTitle.includes('tale') || 
          lowerTitle.includes('fiction') || 
          lowerTitle.includes('story') || 
          lowerTitle.includes('drama') || 
          lowerTitle.includes('shakespeare') || 
          lowerTitle.includes('literary') || 
          lowerTitle.includes('literature') ||
          lowerTitle.includes('essay')
        ) {
          category = 'Literature';
          subjects = ['Literary Theory', 'Exemplary Prose', 'Narrative Aesthetics', 'Creative Criticism', 'Comparative Literature'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Classic Press';
          pageCount = retrieved.pageCount || 250;
          dimensions = '20cm';
        } else if (
          lowerTitle.includes('method') || 
          lowerTitle.includes('research') || 
          lowerTitle.includes('thesis') || 
          lowerTitle.includes('academic') || 
          lowerTitle.includes('journal') ||
          lowerTitle.includes('guide')
        ) {
          category = 'Academic Guide';
          subjects = ['Scholarly Research', 'Experimental Methodology', 'Academic Composition', 'Institutional Repositories', 'Citation Standards'];
          publisher = retrieved.publisher && retrieved.publisher !== 'Zera Academic Press' ? retrieved.publisher : 'Zera Academic Press';
          pageCount = retrieved.pageCount || 210;
          dimensions = '21cm';
        }
      }

      const resolvedAuthor = retrieved.author || (a && a !== 'Unknown' ? a : 'Zera Academic Council');
      let desc = retrieved.description || existingDesc || '';
      
      const cleanDescValue = desc.trim();
      const isPlaceholder = 
        !cleanDescValue || 
        cleanDescValue === 'Institutional asset for Zera Education.' || 
        cleanDescValue === 'No explicit abstract provided for this asset.' || 
        cleanDescValue === 'Catalogued via automatic batch sync module.' ||
        cleanDescValue.startsWith('Institutional archive record for') ||
        cleanDescValue.length < 15;

      if (isPlaceholder) {
        if (retrieved.description && retrieved.description.trim().length >= 15) {
          desc = retrieved.description.trim();
        } else if (existingDesc && existingDesc.trim().length >= 15 && !isPlaceholder) {
          desc = existingDesc.trim();
        } else {
          desc = "No synopsis/abstract available in public bibliographic databases.";
        }
      } else {
        desc = cleanDescValue;
      }

      return {
        description: desc,
        author: resolvedAuthor,
        category,
        publisher,
        publishedYear: retrieved.publishedYear || new Date().getFullYear() - 2,
        subjects,
        pageCount,
        dimensions
      };
    };

    // First fetch real record details from WorldCat / Z39.50 / Google Books,
    // plus the Lexile reading measure in parallel
    const [retrievedData, lexileLevel] = await Promise.all([
      fetchWorldCataloguingData(title, author, isbn, description),
      lookupLexileMeasure(title, author, isbn)
    ]);

    // If the bibliographic databases held no real abstract, scrape the marketing
    // synopsis from a consumer book site (keyless — works without the Gemini key).
    // A found synopsis is treated exactly like a WorldCat/Google Books one, so both
    // the AI and the offline-heuristic paths below return it verbatim.
    const rd = retrievedData as { description?: string; publisher?: string; publishedYear?: number; author?: string; [k: string]: any };
    const rdDesc = (rd.description || '').trim();
    const rdIsPlaceholder =
      rdDesc.length < 15 ||
      rdDesc === 'No synopsis/abstract available in public bibliographic databases.';
    // Web-search fallback: run it when the structured databases (Z39.50/LOC,
    // Google Books, Open Library) left the synopsis OR any core bibliographic
    // field empty, and merge whatever the web yields without overwriting good data.
    const rdMissingMeta = !rd.publisher || !rd.publishedYear || !rd.author;
    // `webSourced` carries ONLY genuine web-scraped fields, kept separate so the
    // client can fill missing catalogue fields without ever picking up a
    // fabricated heuristic value (e.g. a default "Zera Academic Press" publisher).
    let webSourced: { publisher: string; publishedYear?: number; author: string } = { publisher: '', author: '' };
    if (rdIsPlaceholder || rdMissingMeta) {
      const web = await scrapeWebBookData(title, retrievedData.author || author, isbn);
      webSourced = { publisher: web.publisher, publishedYear: web.publishedYear, author: web.author };
      if (rdIsPlaceholder && web.description) rd.description = web.description;
      if (!rd.publisher && web.publisher) rd.publisher = web.publisher;
      if (!rd.author && web.author) rd.author = web.author;
      if (!rd.publishedYear && web.publishedYear !== undefined) rd.publishedYear = web.publishedYear;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const isMockKey = !apiKey || 
                      typeof apiKey !== 'string' ||
                      apiKey.trim() === '' ||
                      !(apiKey.trim().startsWith('AIzaSy') || apiKey.trim().startsWith('AQ.')) ||
                      apiKey.includes('MY_GEMINI_API_KEY') || 
                      apiKey.includes('YOUR_GEMINI_API_KEY') || 
                      apiKey.includes('your_api_key') ||
                      apiKey === 'undefined' ||
                      apiKey === 'null';

    if (isMockKey) {
      console.log(`[Scholastic API Core] Active API key is unconfigured or a mock/placeholder. Running advanced offline scholastic heuristic modeling engine for book: "${title}"`);
      const heuristicResult = generateHeuristicScholasticMetadata(title, author, isbn, description, retrievedData);
      return res.json({ ...heuristicResult, lexileLevel, webSourced });
    }

    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `You are a professional librarian cataloger for Zera Education.
We retrieved real world cataloguing/Z39.50 bibliographic metadata for this book:
Title: "${title}"
Author (retrieved): "${retrievedData.author || author || 'Unknown'}"
ISBN: "${isbn || 'N/A'}"
Publisher (retrieved): "${retrievedData.publisher || 'Zera Archives'}"
Published Year (retrieved): "${retrievedData.publishedYear || 'N/A'}"
Official WorldCat Synopsis/Description: "${retrievedData.description || description || 'None'}"

Please do not output any markdown text wrapping. Generate a JSON response that enriches the summary and bibliographic properties to match an academic research or library standard.
If a real synopsis or description is available in "Official WorldCat Synopsis/Description" (and is not None/empty), you MUST output that EXACT synopsis/description verbatim in the JSON "description" field. Do NOT rewrite or summarize it. If no real synopsis is available there, AND you genuinely recognise this exact title and author, write a concise, factual 2–4 sentence synopsis grounded ONLY in what you actually know about this specific book — never invent plot points, characters, or events. If you do not genuinely know this specific title, set "description" to "No synopsis/abstract available in public bibliographic databases." rather than fabricating an abstract.`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { 
                type: Type.STRING, 
                description: 'The verbatim real synopsis of the book if retrieved, otherwise a clean fallback message.' 
              },
              author: { 
                type: Type.STRING, 
                description: 'The standard corrected name of the author(s).' 
              },
              category: { 
                type: Type.STRING, 
                description: 'A clean single-word or short-phrase classification category (e.g., Science, History, Fiction, Computer Science).' 
              },
              publisher: { 
                type: Type.STRING, 
                description: 'The standard publisher.' 
              },
              publishedYear: { 
                type: Type.INTEGER, 
                description: 'Correct four-digit birth/publication year.' 
              },
              subjects: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: 'An array of 3 to 5 academic index subjects.' 
              },
              pageCount: { 
                type: Type.INTEGER, 
                description: 'High estimation page count.' 
              },
              dimensions: { 
                type: Type.STRING, 
                description: 'Physical spine height, e.g., "22cm".' 
              }
            },
            required: ['description', 'author', 'category', 'publisher', 'publishedYear', 'subjects', 'pageCount', 'dimensions']
          }
        }
      });

      const responseText = geminiResponse.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed = JSON.parse(responseText.trim());
      
      // Strict Safeguard: If we retrieved a real description from WorldCat, Google, or OpenLibrary,
      // overwrite any generated version so the user receives the EXACT real-world synopsis.
      const realDesc = retrievedData.description || description || '';
      const cleanRealDesc = realDesc.trim();
      const isPlaceholder = 
        !cleanRealDesc || 
        cleanRealDesc === 'Institutional asset for Zera Education.' || 
        cleanRealDesc === 'No explicit abstract provided for this asset.' || 
        cleanRealDesc === 'Catalogued via automatic batch sync module.' ||
        cleanRealDesc.startsWith('Institutional archive record for') ||
        cleanRealDesc.length < 15;

      if (!isPlaceholder) {
        parsed.description = cleanRealDesc;
      } else if (retrievedData.description && retrievedData.description.trim().length >= 15) {
        parsed.description = retrievedData.description.trim();
      } else if (typeof parsed.description === 'string' &&
                 parsed.description.trim().length >= 15 &&
                 parsed.description.trim() !== 'No synopsis/abstract available in public bibliographic databases.') {
        // No real synopsis in the public databases, but Gemini supplied a grounded
        // synopsis from its own knowledge of the title — keep it (AI fallback).
        parsed.description = parsed.description.trim();
      } else {
        parsed.description = "No synopsis/abstract available in public bibliographic databases.";
      }

      res.json({ ...parsed, lexileLevel, webSourced });
    } catch (err: any) {
      console.log("[Scholastic API Core] Gemini API execution bypassed. Utilizing advanced offline scholastic heuristic modeling engine.");
      const heuristicResult = generateHeuristicScholasticMetadata(title, author, isbn, description, retrievedData);
      res.json({ ...heuristicResult, lexileLevel, webSourced });
    }
  });

  // REST API Endpoint for student synchronization (supports mock pagination & server CORS proxying)
  app.get('/api/v1/students', async (req, res) => {
    const { api_url, key, page, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string || '1', 10));
    
    if (api_url) {
      // Proxy student directories to the external active school system (completely bypasses browser CORS locks)
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', String(pageNum));
        if (search) {
          queryParams.append('search', String(search));
        }
        
        const base = api_url.toString().replace(/\/$/, '');
        let targetUrl = '';
        if (base.endsWith('/api/v1/students')) {
          targetUrl = `${base}?${queryParams.toString()}`;
        } else if (base.endsWith('/api/v1')) {
          targetUrl = `${base}/students?${queryParams.toString()}`;
        } else {
          targetUrl = `${base}/api/v1/students?${queryParams.toString()}`;
        }
            
        console.log(`[Proxy Link] Forwarding sync channel request to: ${targetUrl}`);
        
        const headers: HeadersInit = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
        
        const response = await fetch(targetUrl, { headers });
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: `External school directory system returned HTTP ${response.status} ${response.statusText}`
          });
        }
        
        const payload = await response.json();
        return res.status(200).json(payload);
      } catch (proxyErr: any) {
        console.error("Proxy failure:", proxyErr);
        return res.status(500).json({
          success: false,
          error: `Unable to open server synchronization channel to school system: ${proxyErr.message}`
        });
      }
    }
    
    // Default mode: Return paginated mock student records (50 students per page)
    const limitNum = 50;
    const offset = (pageNum - 1) * limitNum;
    
    // Support robust case-insensitive query searching on first_name, last_name, nric_name, preferred_name
    let filteredStudents = AP_STUDENTS;
    const searchStr = search ? String(search).toLowerCase().trim() : '';
    if (searchStr) {
      filteredStudents = AP_STUDENTS.filter(s => 
        (s.first_name || '').toLowerCase().includes(searchStr) ||
        (s.last_name || '').toLowerCase().includes(searchStr) ||
        (s.nric_name || '').toLowerCase().includes(searchStr) ||
        (s.preferred_name || '').toLowerCase().includes(searchStr)
      );
    }
    
    // Map list payload elements to EXCLUDE date_of_birth and cohort per specs
    const paginatedData = filteredStudents.slice(offset, offset + limitNum).map(s => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      nric_name: s.nric_name,
      preferred_name: s.preferred_name,
      email: s.email,
      phone: s.phone,
      gender: s.gender,
      class: s.class,
      grade: s.grade,
      status: s.status
    }));
    
    const lastPage = Math.ceil(filteredStudents.length / limitNum);
    
    res.status(200).json({
      data: paginatedData,
      meta: {
        current_page: pageNum,
        from: filteredStudents.length ? offset + 1 : null,
        last_page: lastPage,
        path: '/api/v1/students',
        per_page: limitNum,
        to: filteredStudents.length ? Math.min(offset + limitNum, filteredStudents.length) : null,
        total: filteredStudents.length
      },
      links: {
        first: `/api/v1/students?page=1${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}`,
        last: `/api/v1/students?page=${lastPage}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}`,
        prev: pageNum > 1 ? `/api/v1/students?page=${pageNum - 1}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}` : null,
        next: pageNum < lastPage ? `/api/v1/students?page=${pageNum + 1}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}` : null
      }
    });
  });

  // Single-Student query by ID schema (scoped to calling student parameter)
  app.get('/api/v1/students/:student', async (req, res) => {
    const studentId = req.params.student;
    const { api_url, key } = req.query;
    
    if (api_url) {
      try {
        const base = api_url.toString().replace(/\/$/, '');
        let targetUrl = '';
        if (base.endsWith('/api/v1/students')) {
          targetUrl = `${base}/${studentId}`;
        } else if (base.endsWith('/api/v1')) {
          targetUrl = `${base}/students/${studentId}`;
        } else {
          targetUrl = `${base}/api/v1/students/${studentId}`;
        }
            
        console.log(`[Proxy Link Single] Forwarding sync channel request to: ${targetUrl}`);
        
        const headers: HeadersInit = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
        
        const response = await fetch(targetUrl, { headers });
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: `External school directory system returned HTTP ${response.status} ${response.statusText}`
          });
        }
        
        const payload = await response.json();
        return res.status(200).json(payload);
      } catch (proxyErr: any) {
        console.error("Single student proxy failure:", proxyErr);
        return res.status(500).json({
          success: false,
          error: `Unable to open server synchronization channel to school system: ${proxyErr.message}`
        });
      }
    }
    
    const s = AP_STUDENTS.find(item => item.id === studentId);
    if (s) {
      res.status(200).json({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        nric_name: s.nric_name,
        preferred_name: s.preferred_name,
        email: s.email,
        phone: s.phone,
        gender: s.gender,
        class: s.class,
        cohort: s.cohort,
        grade: s.grade,
        status: s.status,
        date_of_birth: s.date_of_birth
      });
    } else {
      res.status(404).json({ error: "Student not found in this school" });
    }
  });

  // REST API Endpoint for staff directory (supports key checking, pagination & search)
  app.get('/api/v1/staff', async (req, res) => {
    const authHeader = req.headers.authorization;
    const authKey = authHeader?.replace('Bearer ', '') || req.query.key as string;
    
    // Check key
    if (!authKey || authKey !== '23|IUgdvUdK3yUfa7IFGy3FC5ZkWAYc4E5uYYDTyTqV544970de') {
      return res.status(401).json({ error: 'Unauthorized. Requires ability: staff.read' });
    }

    const { api_url, page, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string || '1', 10));
    
    if (api_url) {
      // Proxy staff directories if api_url is provided
      try {
        const queryParams = new URLSearchParams();
        queryParams.append('page', String(pageNum));
        if (search) {
          queryParams.append('search', String(search));
        }
        
        const base = api_url.toString().replace(/\/$/, '');
        let targetUrl = '';
        if (base.endsWith('/api/v1/staff')) {
          targetUrl = `${base}?${queryParams.toString()}`;
        } else if (base.endsWith('/api/v1')) {
          targetUrl = `${base}/staff?${queryParams.toString()}`;
        } else {
          targetUrl = `${base}/api/v1/staff?${queryParams.toString()}`;
        }
            
        console.log(`[Proxy Staff] Forwarding sync channel request to: ${targetUrl}`);
        
        const headers: HeadersInit = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer 23|IUgdvUdK3yUfa7IFGy3FC5ZkWAYc4E5uYYDTyTqV544970de`
        };
        
        const response = await fetch(targetUrl, { headers });
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: `External school directory system returned HTTP ${response.status} ${response.statusText}`
          });
        }
        
        const payload = await response.json();
        return res.status(200).json(payload);
      } catch (proxyErr: any) {
        console.error("Staff Proxy failure:", proxyErr);
        return res.status(500).json({
          success: false,
          error: `Unable to open server synchronization channel to school system: ${proxyErr.message}`
        });
      }
    }
    
    // Default mode: Return paginated mock staff records (15 per page)
    const limitNum = 15;
    const offset = (pageNum - 1) * limitNum;
    
    let filteredStaff = AP_STAFF;
    const searchStr = search ? String(search).toLowerCase().trim() : '';
    if (searchStr) {
      filteredStaff = AP_STAFF.filter(s => 
        (s.first_name || '').toLowerCase().includes(searchStr) ||
        (s.last_name || '').toLowerCase().includes(searchStr) ||
        (s.nric_name || '').toLowerCase().includes(searchStr) ||
        (s.preferred_name || '').toLowerCase().includes(searchStr) ||
        (s.job_title || '').toLowerCase().includes(searchStr)
      );
    }
    
    const paginatedData = filteredStaff.slice(offset, offset + limitNum).map(s => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      nric_name: s.nric_name,
      preferred_name: s.preferred_name,
      email: s.email,
      phone: s.phone,
      job_title: s.job_title,
      job_type: s.job_type,
      status: getStaffStatus(s.commencement_date, s.leave_date)
    }));
    
    const lastPage = Math.max(1, Math.ceil(filteredStaff.length / limitNum));
    
    res.status(200).json({
      data: paginatedData,
      meta: {
        current_page: pageNum,
        from: filteredStaff.length ? offset + 1 : null,
        last_page: lastPage,
        path: '/api/v1/staff',
        per_page: limitNum,
        to: filteredStaff.length ? Math.min(offset + limitNum, filteredStaff.length) : null,
        total: filteredStaff.length
      },
      links: {
        first: `/api/v1/staff?page=1${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}`,
        last: `/api/v1/staff?page=${lastPage}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}`,
        prev: pageNum > 1 ? `/api/v1/staff?page=${pageNum - 1}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}` : null,
        next: pageNum < lastPage ? `/api/v1/staff?page=${pageNum + 1}${searchStr ? `&search=${encodeURIComponent(searchStr)}` : ''}` : null
      }
    });
  });

  // Single Staff member query by ID
  app.get('/api/v1/staff/:staff', async (req, res) => {
    const authHeader = req.headers.authorization;
    const authKey = authHeader?.replace('Bearer ', '') || req.query.key as string;
    
    if (!authKey || authKey !== '23|IUgdvUdK3yUfa7IFGy3FC5ZkWAYc4E5uYYDTyTqV544970de') {
      return res.status(401).json({ error: 'Unauthorized. Requires ability: staff.read' });
    }

    const staffId = req.params.staff;
    const { api_url } = req.query;
    
    if (api_url) {
      try {
        const base = api_url.toString().replace(/\/$/, '');
        let targetUrl = '';
        if (base.endsWith('/api/v1/staff')) {
          targetUrl = `${base}/${staffId}`;
        } else if (base.endsWith('/api/v1')) {
          targetUrl = `${base}/staff/${staffId}`;
        } else {
          targetUrl = `${base}/api/v1/staff/${staffId}`;
        }
            
        console.log(`[Proxy Staff Single] Forwarding sync channel request to: ${targetUrl}`);
        
        const headers: HeadersInit = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer 23|IUgdvUdK3yUfa7IFGy3FC5ZkWAYc4E5uYYDTyTqV544970de`
        };
        
        const response = await fetch(targetUrl, { headers });
        if (!response.ok) {
          return res.status(response.status).json({
            success: false,
            error: `External school directory system returned HTTP ${response.status} ${response.statusText}`
          });
        }
        
        const payload = await response.json();
        return res.status(200).json(payload);
      } catch (proxyErr: any) {
        console.error("Single staff proxy failure:", proxyErr);
        return res.status(500).json({
          success: false,
          error: `Unable to open server synchronization channel to school system: ${proxyErr.message}`
        });
      }
    }
    
    const s = AP_STAFF.find(item => item.id === staffId);
    if (s) {
      res.status(200).json({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        nric_name: s.nric_name,
        preferred_name: s.preferred_name,
        email: s.email,
        phone: s.phone,
        job_title: s.job_title,
        job_type: s.job_type,
        status: getStaffStatus(s.commencement_date, s.leave_date),
        commencement_date: s.commencement_date,
        leave_date: s.leave_date
      });
    } else {
      res.status(404).json({ error: "Staff not found in this school" });
    }
  });

  return app;
}

async function startServer() {
  const app = await createApiApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

  // Vite middleware for assets compile and page serving matching correct sandbox env
  if (process.env.NODE_ENV !== 'production') {
    // Loaded lazily so the Vercel serverless bundle (which imports server.ts for
    // its API routes only) never has to include Vite.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zera High-Availability server listening at http://localhost:${PORT}`);
  });
}

// Only start a listening server for local/standalone runs. On Vercel the app is
// consumed as a serverless function (api/index.ts) and must NOT call listen().
if (!process.env.VERCEL) {
  startServer();
}
