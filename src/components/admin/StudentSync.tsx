import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { handleFirestoreError, OperationType } from '@/src/hooks/useAuth';
import { UserProfile } from '@/src/types';
import { 
  RefreshCw, 
  Settings, 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Play, 
  Info, 
  Sparkles,
  Search,
  Server,
  ToggleLeft,
  X,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';

// 1. Setup Sandbox / Emulated Student list according to requested GET /api/v1/students schema
const EMULATED_STUDENTS = [
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

// Helper dictionaries for generating remaining 193 student profiles dynamically & deterministically for the emulator
const MALE_NAMES_EMU = [
  "Aiman", "Hafiz", "Adam", "Khairul", "Farhan", "Luqman", "Amir", "Syakir", "Raziq", "Zul",
  "Lucas", "Wei", "Jun", "Zhi", "Ming", "Han", "Kai", "Daniel", "Ethan", "Zack",
  "Arun", "Karthik", "Sanjay", "Shankar", "Vikram", "Rajesh", "Vijay", "Anand", "Rohan", "Dev",
  "Bryan", "Darren", "Isaac", "Jayden", "Ryan", "Justin", "Kaelen", "Nicholas", "Rayyan", "Faris",
  "Ashwin", "Fadhil", "Govind", "Harris", "Ivan", "Joshua", "Kevin", "Leo", "Mikhail", "Naufal"
];

const FEMALE_NAMES_EMU = [
  "Farah", "Siti", "Nuraliah", "Amira", "Aqilah", "Zahra", "Aisya", "Yasmin", "Huda", "Syifa",
  "Emily", "Yi", "Xin", "Jia", "Mei", "Ling", "Ying", "Yee", "Rachel", "Chloe",
  "Priya", "Anjali", "Meira", "Kavitha", "Rani", "Deepa", "Gayatri", "Neha", "Pooja", "Shanti",
  "Audrey", "Clarissa", "Fiona", "Grace", "Hannah", "Natalie", "Olivia", "Sophia", "Zoe", "Zara",
  "Alia", "Balkis", "Dahlia", "Elisa", "Fatima", "Irdina", "Kamini", "Leela", "Nisha", "Shalini"
];

const SURNAMES_EMU = [
  "Kamal", "Zulkifli", "Hassan", "Yusof", "Razak", "Rahman", "Musa", "Idris", "Ismail", "Ibrahim",
  "Chen", "Lee", "Wong", "Chan", "Lim", "Ong", "Ng", "Tan", "Chiew", "Yip",
  "Subramaniam", "Krishnan", "Raman", "Nair", "Pillay", "Kumar", "Iyer", "Rao", "Patel", "Sharma",
  "Alatas", "Zakaryya", "Imran", "Abdul", "Othman", "Goh", "Teoh", "Cheah", "Murugan", "Naidu",
  "Pinto", "Rozario", "Santiago", "Siddique", "Talib", "Vengadasalam", "Wee", "Xu", "Yeoh", "Zainal"
];

const CLASSES_EMU = ["9-A", "9-B", "10-A", "10-B", "11-A", "11-B", "12-A", "12-B", "12-C"];

// Generate exactly 193 more unique students to sum up to exactly 200
for (let i = 1; i <= 193; i++) {
  const gender = (i % 2 === 0) ? "female" : "male";
  const firstName = gender === "male"
    ? MALE_NAMES_EMU[(i - 1) % MALE_NAMES_EMU.length]
    : FEMALE_NAMES_EMU[(i - 1) % FEMALE_NAMES_EMU.length];
  const lastName = SURNAMES_EMU[(i - 1) % SURNAMES_EMU.length];
  
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
  const classIndex = i % CLASSES_EMU.length;
  const studentClass = CLASSES_EMU[classIndex];
  
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

  EMULATED_STUDENTS.push({
    id,
    first_name: firstName,
    last_name: lastName,
    nric_name: nricName,
    preferred_name: preferredName,
    email,
    phone,
    gender,
    class: studentClass,
    grade,
    status: "active",
    cohort,
    date_of_birth: dateOfBirth
  });
}

export const StudentSync: React.FC = () => {
  // Sync States
  const [useEmulator, setUseEmulator] = useState<boolean>(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('22|TApEAT8FlLmQw60Oy4Q4Ki9q1S0aRR3fimVs4tT34044fa2e');
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [showConfig, setShowConfig] = useState<boolean>(false);
  
  // Realtime Status Details
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    processed: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load configuration and previous sync stats on mount
  useEffect(() => {
    const savedEmulator = localStorage.getItem('zera_students_api_use_emulator');
    const savedBaseUrl = localStorage.getItem('zera_students_api_base_url');
    const savedApiKey = localStorage.getItem('zera_students_api_key');
    const savedAutoSync = localStorage.getItem('zera_students_api_auto_sync');
    const savedLastSync = localStorage.getItem('zera_students_api_last_sync_time');

    if (savedEmulator !== null) {
      setUseEmulator(savedEmulator === 'true');
    } else {
      setUseEmulator(false);
    }
    
    if (savedBaseUrl !== null) {
      setApiBaseUrl(savedBaseUrl);
    }
    
    if (savedApiKey !== null) {
      setApiKey(savedApiKey);
    } else {
      setApiKey('22|TApEAT8FlLmQw60Oy4Q4Ki9q1S0aRR3fimVs4tT34044fa2e');
      localStorage.setItem('zera_students_api_key', '22|TApEAT8FlLmQw60Oy4Q4Ki9q1S0aRR3fimVs4tT34044fa2e');
    }

    if (savedAutoSync !== null) setAutoSync(savedAutoSync === 'true');
    if (savedLastSync !== null) setLastSyncDate(new Date(parseInt(savedLastSync, 10)));

    // Lazy Trigger: Weekly Auto-Sync (if > 7 days have passed)
    if (savedAutoSync === 'true' || savedAutoSync === null) {
      const lastTime = savedLastSync ? parseInt(savedLastSync, 10) : 0;
      const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastTime > oneWeekInMs) {
        console.log("Weekly Auto-Sync triggered (Lazy Background check).");
        // Defer start slightly so UI handles it comfortably
        const timer = setTimeout(() => {
          performSync(savedEmulator !== 'false', savedBaseUrl || '', savedApiKey || '');
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('zera_students_api_use_emulator', String(useEmulator));
    localStorage.setItem('zera_students_api_base_url', apiBaseUrl);
    localStorage.setItem('zera_students_api_key', apiKey);
    localStorage.setItem('zera_students_api_auto_sync', String(autoSync));
    setShowConfig(false);
  };

  const addLog = (msg: string) => {
    setSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // The actual Sync Engine
  const performSync = async (
    emulatorMode: boolean = useEmulator,
    customBase: string = apiBaseUrl,
    customKey: string = apiKey
  ) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncSummary(null);
    setErrorMessage(null);
    setSyncLogs([]);
    
    addLog(`Initiating Student Directory Sync...`);
    addLog(`Mode: ${emulatorMode ? 'Zera School API Sandbox Emulator' : 'External School API Client'}`);
    
    // Log Active Auth Profile
    const currentUser = auth?.currentUser;
    if (currentUser) {
      addLog(`Database Session: Authorized client connected as ${currentUser.email || 'Anonymous'}`);
    } else {
      const localCreds = localStorage.getItem('zera_active_local_credentials');
      if (localCreds) {
        try {
          const parsed = JSON.parse(localCreds);
          addLog(`⚠️ Database Session: Offline simulated login as ${parsed.email || 'Admin'} (Not connected to active Cloud instance).`);
        } catch (_) {
          addLog(`⚠️ Database Session: Unauthenticated.`);
        }
      } else {
        addLog(`⚠️ Database Session: Unauthenticated.`);
      }
    }
    
    let studentsToProcess: any[] = [];
    
    try {
      if (emulatorMode) {
        // Handle paginated simulation for emulator mode
        let emuPage = 1;
        const perPage = 50;
        const totalEmu = EMULATED_STUDENTS.length;
        const totalPages = Math.ceil(totalEmu / perPage);
        
        addLog(`Initiating emulated paginated crawl across ${totalPages} pages...`);
        
        while (emuPage <= totalPages) {
          addLog(`Contacting GET /api/v1/students?page=${emuPage}...`);
          await new Promise(resolve => setTimeout(resolve, 150));
          
          const startIdx = (emuPage - 1) * perPage;
          const endIdx = startIdx + perPage;
          const pageItems = EMULATED_STUDENTS.slice(startIdx, endIdx);
          
          addLog(`Successfully retrieved Student Page ${emuPage} list (${pageItems.length} records found).`);
          studentsToProcess = [...studentsToProcess, ...pageItems];
          emuPage++;
        }
      } else {
        // Real REST API integration with robust pagination traversal & CORS proxy handling
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          // Pass proxy query parameters to avoid browser CORS problems seamlessly
          const queryParams = new URLSearchParams();
          if (customBase) {
            queryParams.append('api_url', customBase);
          }
          if (customKey) {
            queryParams.append('key', customKey);
          }
          queryParams.append('page', String(currentPage));
          
          const fetchUrl = `${window.location.origin}/api/v1/students?${queryParams.toString()}`;
          addLog(`Calling School Endpoint (Page ${currentPage}): ${customBase || window.location.origin}/api/v1/students?page=${currentPage}...`);
          
          const headers: HeadersInit = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          };
          
          const response = await fetch(fetchUrl, { headers });
          if (!response.ok) {
            throw new Error(`Endpoint returned HTTP ${response.status} ${response.statusText} at page ${currentPage}`);
          }
          
          const payload = await response.json();
          if (!payload || !Array.isArray(payload.data)) {
            throw new Error(`Invalid API Response at page ${currentPage}. Payload must return an object with a 'data' array.`);
          }
          
          // Filter ONLY active student status (status === 1) from the raw result
          const activePageStudents = payload.data.filter((s: any) => s.status === 1);
          addLog(`Successfully retrieved Student Page ${currentPage} list (${activePageStudents.length} active/current profiles out of ${payload.data.length} records).`);
          
          if (payload.data.length === 0) {
            hasMorePages = false;
          } else {
            studentsToProcess = [...studentsToProcess, ...activePageStudents];
            
            // Check pagination cues robustly
            const lastPage = payload.last_page || (payload.meta && payload.meta.last_page);
            const nextPageUrl = payload.next_page_url || (payload.links && payload.links.next);
            
            if (lastPage && currentPage >= lastPage) {
              hasMorePages = false;
            } else if (nextPageUrl === null || nextPageUrl === false) {
              hasMorePages = false;
            } else if (!lastPage && !nextPageUrl && payload.data.length < (payload.per_page || 15)) {
              // Guessing single page if few items and no next links
              hasMorePages = false;
            } else {
              currentPage++;
              // Safety precaution against endless loop
              if (currentPage > 20) {
                addLog(`Pagination safety ceiling of 20 pages reached.`);
                break;
              }
            }
          }
        }
        addLog(`Successfully completed retrieving all student records (${studentsToProcess.length} total found).`);
      }
      
      let createdCount = 0;
      let updatedCount = 0;
      const skippedCount = 0;
      
      addLog(`Reconciling Firestore library accounts & fetching detailed API records...`);
      
      for (const student of studentsToProcess) {
        // Fetch detailed profile GET /api/v1/students/{student} to get cohort & date_of_birth fields
        let detailedStudent = { ...student };
        try {
          const detailQueryParams = new URLSearchParams();
          if (customBase) {
            detailQueryParams.append('api_url', customBase);
          }
          if (customKey) {
            detailQueryParams.append('key', customKey);
          }
          const detailUrl = `${window.location.origin}/api/v1/students/${student.id}?${detailQueryParams.toString()}`;
          const detailRes = await fetch(detailUrl);
          if (detailRes.ok) {
            const richData = await detailRes.json();
            if (richData && richData.id === student.id) {
              detailedStudent = richData;
            } else if (richData && richData.data && richData.data.id === student.id) {
              detailedStudent = richData.data;
            }
          }
        } catch (detailErr) {
          console.warn(`Enrichment failed for ${student.id}:`, detailErr);
        }

        const personName = detailedStudent.nric_name || `${detailedStudent.first_name} ${detailedStudent.last_name}`;
        const studentIdStr = detailedStudent.id !== undefined && detailedStudent.id !== null ? String(detailedStudent.id).trim() : '';
        addLog(`Processing: [ID: ${studentIdStr}] ${personName}...`);
        
        // Match existing user by studentId (or fallback to email if studentId is not in the database)
        const usersCollection = collection(db, 'users');
        let matchedDocId: string | null = null;
        let existingData: any = null;
        
        // 1. Query by studentId
        const qId = query(usersCollection, where('studentId', '==', studentIdStr));
        let idSnap;
        try {
          idSnap = await getDocs(qId);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `users?studentId=${studentIdStr}`);
          throw error;
        }
        
        if (!idSnap.empty) {
          matchedDocId = idSnap.docs[0].id;
          existingData = idSnap.docs[0].data();
        } else if (detailedStudent.email) {
          // 2. Fallback to query by email
          const qEmail = query(usersCollection, where('email', '==', detailedStudent.email));
          let emailSnap;
          try {
            emailSnap = await getDocs(qEmail);
          } catch (error) {
            handleFirestoreError(error, OperationType.LIST, `users?email=${detailedStudent.email}`);
            throw error;
          }
          if (!emailSnap.empty) {
            matchedDocId = emailSnap.docs[0].id;
            existingData = emailSnap.docs[0].data();
          }
        }
        
        // Map fields based on the API payload specifications
        const mappedName = personName;
        const mappedGrade = detailedStudent.class || detailedStudent.grade || '';
        
        // Prepare doc payload
        const updatedProfilePayload: any = {
          name: mappedName,
          email: detailedStudent.email || '',
          role: 'student',
          studentId: studentIdStr,
          grade: mappedGrade,
          phoneNumber: detailedStudent.phone || '',
          status: detailedStudent.status || 'active',
          gender: detailedStudent.gender || 'unspecified',
          cohort: detailedStudent.cohort || '2025/2026',
          dateOfBirth: detailedStudent.date_of_birth || '',
          syncSource: emulatorMode ? 'Sandbox Emulator' : 'School API Endpoint',
          lastSyncedAt: new Date().toISOString()
        };
        
        if (matchedDocId) {
          // Update matching record
          const docRef = doc(db, 'users', matchedDocId);
          try {
            await updateDoc(docRef, updatedProfilePayload);
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${matchedDocId}`);
            throw error;
          }
          updatedCount++;
          addLog(`✓ Updated account database profile for STID ${studentIdStr}.`);
        } else {
          // Add new student record
          const finalProfileToSave = {
            ...updatedProfilePayload,
            activeLoansCount: 0,
            createdAt: new Date().toISOString(),
            barcode: `ST-${studentIdStr.replace(/[^0-9a-zA-Z]/g, '')}` // unique serial
          };
          try {
            await addDoc(usersCollection, finalProfileToSave);
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `users/new`);
            throw error;
          }
          createdCount++;
          addLog(`+ Created brand new library profile for STID ${studentIdStr}.`);
        }
        
        // Brief timeout to let logs update nicely in real-time
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      const finishTime = Date.now();
      setLastSyncDate(new Date(finishTime));
      localStorage.setItem('zera_students_api_last_sync_time', String(finishTime));
      
      setSyncSummary({
        processed: studentsToProcess.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount
      });
      
      addLog(`Student Directory Synchronization Completed Wisely!`);
    } catch (err: any) {
      console.error(err);
      
      const rawMsg = err.message || "An unexpected error occurred during student API synchronization.";
      let parsedErrorStr = rawMsg;
      let checkPermDenied = err.code === 'permission-denied' || rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('insufficient');
      
      if (rawMsg.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMsg);
          if (parsed.error) {
            parsedErrorStr = parsed.error;
            if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('insufficient')) {
              checkPermDenied = true;
            }
          }
        } catch (_) {
          // Silent fallback if JSON parsing fails
          console.debug("Failed to parse error message as JSON");
        }
      }

      const isNetworkOrCors = parsedErrorStr.includes('Failed to fetch') || parsedErrorStr.includes('NetworkError');
      const isPermissionDenied = checkPermDenied;
      
      let friendlyError = parsedErrorStr;
      if (isNetworkOrCors && !emulatorMode) {
        friendlyError = "Network / CORS block detected on external Endpoint. We advise toggling back to 'Sandbox Emulator Mode' to experience the sync workflow live in the preview environment.";
      } else if (isPermissionDenied) {
        friendlyError = "Missing or insufficient permissions. Please verify that your Admin session is active (e.g. login with standard admin 'nurshahidahmohdayob@gmail.com') and that security rules and database are successfully deployed.";
      }
      
      setErrorMessage(friendlyError);
      addLog(`❌ Sync Aborted: ${friendlyError}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="w-full bg-white border-2 border-natural-border p-6 rounded-[36px] shadow-sm mb-8 relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute right-0 top-0 w-32 h-32 bg-zera-emerald/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zera-emerald/10 border border-zera-emerald/20 flex items-center justify-center text-zera-emerald">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zera-emerald">Official School Integration</p>
              <h4 className="font-serif text-lg font-black text-natural-text">Student Directory Sync Engine</h4>
            </div>
          </div>
          
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-bold text-natural-muted">
            <span className="flex items-center gap-1.5 bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border">
              <Server className="w-3.5 h-3.5 text-natural-muted" />
              Source: <span className="font-black text-natural-text">{useEmulator ? "API Sandbox Emulator" : "School REST API"}</span>
            </span>
            
            <span className="flex items-center gap-1.5 bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border">
              <Calendar className="w-3.5 h-3.5 text-natural-muted" />
              Weekly Auto-Sync: 
              <span className={cn(
                "font-black uppercase text-[10px] tracking-wide",
                autoSync ? "text-zera-emerald" : "text-amber-600"
              )}>
                {autoSync ? "Enabled" : "Disabled"}
              </span>
            </span>

            {lastSyncDate && (
              <span className="flex items-center gap-1 bg-natural-bg px-2.5 py-1 rounded-lg border border-natural-border leading-none">
                Last Synced: <span className="font-extrabold text-natural-text">{format(lastSyncDate, 'MMM d, h:mm a')}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-3 bg-natural-bg hover:bg-natural-border rounded-2xl cursor-pointer transition-colors border border-natural-border hover:shadow-inner"
            title="Configure API Settings"
          >
            <Settings className="w-4 h-4 text-natural-text" />
          </button>
          
          <button
            onClick={() => performSync()}
            disabled={isSyncing}
            className={cn(
              "px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 disabled:opacity-50",
              isSyncing ? "bg-natural-bg text-natural-muted border border-natural-border" : "bg-zera-emerald text-white hover:bg-zera-emerald-dark"
            )}
          >
            <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync Directory"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {/* Setup and Configuration Menu */}
        {showConfig && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-natural-border mt-6 pt-6 overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-natural-bg/50 p-6 rounded-3xl border border-natural-border mb-4">
              <div className="space-y-4">
                <h5 className="font-serif font-black text-sm text-natural-text">Integration Mode Selection:</h5>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => setUseEmulator(true)}
                    className={cn(
                      "flex-1 p-4 rounded-2xl border-2 text-left cursor-pointer transition-all",
                      useEmulator 
                        ? "bg-white border-zera-emerald text-zera-emerald shadow-sm"
                        : "bg-white border-natural-border text-natural-muted"
                    )}
                  >
                    <p className="font-black text-xs uppercase tracking-wider mb-0.5">Sandbox Emulator</p>
                    <p className="text-[10px] font-bold leading-normal">Simulate the official school student REST API with secure authentic presets.</p>
                  </button>
                  <button 
                    onClick={() => setUseEmulator(false)}
                    className={cn(
                      "flex-1 p-4 rounded-2xl border-2 text-left cursor-pointer transition-all",
                      !useEmulator 
                        ? "bg-white border-zera-emerald text-zera-emerald shadow-sm"
                        : "bg-white border-natural-border text-natural-muted"
                    )}
                  >
                    <p className="font-black text-xs uppercase tracking-wider mb-0.5">Live Connection</p>
                    <p className="text-[10px] font-bold leading-normal">Connect via HTTPS to your pre-authorized server endpoints directly.</p>
                  </button>
                </div>

                <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-natural-border">
                  <span className="text-xs font-black text-natural-text">Enable Weekly background Auto-Sync</span>
                  <input 
                    type="checkbox" 
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="w-4 h-4 outline-none accent-zera-emerald"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="font-serif font-black text-sm text-natural-text">Live Server Endpoint Settings:</h5>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block pl-1">API Base URL</label>
                  <input
                    type="text"
                    disabled={useEmulator}
                    placeholder="https://your-school.org"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    className="w-full p-3.5 bg-white border border-natural-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-zera-emerald outline-none disabled:opacity-50"
                  />
                  <p className="text-[9px] text-natural-muted italic leading-normal px-1">Defaults to current domain routing of /api/v1/students.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block pl-1">Authorization Bearer Token / API Key</label>
                  <input
                    type="password"
                    disabled={useEmulator}
                    placeholder="eyJhbGciOiJIUzI1Ni..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full p-3.5 bg-white border border-natural-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-zera-emerald outline-none disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3.5">
              <button 
                onClick={() => setShowConfig(false)}
                className="px-5 py-2.5 bg-white hover:bg-natural-bg rounded-xl text-xs font-bold text-natural-muted border border-natural-border cursor-pointer"
              >
                Dismiss
              </button>
              <button 
                onClick={saveSettings}
                className="px-5 py-2.5 bg-zera-emerald hover:bg-zera-emerald-dark rounded-xl text-xs font-black text-white hover:shadow-md cursor-pointer uppercase tracking-wider"
              >
                Apply Configurations
              </button>
            </div>
          </motion.div>
        )}

        {/* Sync Progress Logs / Summaries */}
        {(isSyncing || syncSummary || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-natural-border mt-5 pt-5 space-y-4"
          >
            {/* Sync Summary Banner */}
            {syncSummary && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-start gap-3 text-xs text-emerald-800 font-medium">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-extrabold text-emerald-950 mb-1">Student Sync Database Update Complete!</p>
                  <p className="leading-relaxed text-emerald-900">
                    Processed <span className="font-bold text-emerald-950">{syncSummary.processed}</span> profiles from the student registry list: 
                    added <span className="font-black text-emerald-950">+{syncSummary.created} new members</span> to library custody and 
                    updated details for <span className="font-black text-emerald-950">{syncSummary.updated} matched records</span>.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-3xl flex items-start gap-3 text-xs text-amber-800 font-medium">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-extrabold text-amber-950 mb-1">Synchronization Interrupted</p>
                  <p className="leading-relaxed text-amber-900">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Simulated scroll logs console */}
            <div className="bg-neutral-text text-white/90 p-4 rounded-3xl font-mono text-[10px] space-y-1.5 max-h-[160px] overflow-y-auto shadow-inner leading-relaxed">
              {syncLogs.map((log, index) => (
                <div key={index} className={cn(
                  "truncate",
                  log.includes('✓') && "text-emerald-400",
                  log.includes('+') && "text-blue-300",
                  log.includes('❌') && "text-red-400"
                )}>
                  {log}
                </div>
              ))}
              {isSyncing && (
                <div className="flex items-center gap-1.5 text-zera-yellow mt-2 font-black">
                  <div className="w-1.5 h-1.5 bg-zera-yellow rounded-full animate-ping" />
                  Writing transaction logs sequence...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
