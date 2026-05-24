import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

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

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Vite middleware for assets compile and page serving matching correct sandbox env
  if (process.env.NODE_ENV !== 'production') {
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

startServer();
