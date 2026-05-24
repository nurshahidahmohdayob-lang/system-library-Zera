import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { handleFirestoreError, OperationType } from '@/src/hooks/useAuth';
import { UserProfile } from '@/src/types';
import { 
  RefreshCw, 
  Settings, 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Check,
  Server,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';
import { BarcodeService, BarcodeType } from '@/src/services/BarcodeService';

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

const BASE_EMULATED_STAFF = [
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
    leave_date: "2025-05-01"
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
    leave_date: "2025-12-31"
  }
];

const EMULATED_STAFF = [...BASE_EMULATED_STAFF];

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
  
  EMULATED_STAFF.push({
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

export const StaffSync: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [useEmulator, setUseEmulator] = useState(false); // Default to live server as specified
  const [showConfig, setShowConfig] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('23|IUgdvUdK3yUfa7IFGy3FC5ZkWAYc4E5uYYDTyTqV544970de');
  const [autoSync, setAutoSync] = useState(true);
  
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<{
    processed: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);

  useEffect(() => {
    // Load local settings if any
    const storedBase = localStorage.getItem('zera_staff_api_base');
    const storedKey = localStorage.getItem('zera_staff_api_key');
    const storedEmu = localStorage.getItem('zera_staff_api_use_emulator');
    const storedAuto = localStorage.getItem('zera_staff_api_auto_sync');
    const storedLastTime = localStorage.getItem('zera_staff_api_last_sync_time');
    
    if (storedBase) setApiBaseUrl(storedBase);
    if (storedKey) setApiKey(storedKey);
    if (storedEmu) setUseEmulator(storedEmu === 'true');
    if (storedAuto) setAutoSync(storedAuto === 'true');
    if (storedLastTime) setLastSyncDate(new Date(parseInt(storedLastTime, 10)));

    // Passive clean up of mock teacher accounts having 'SF-' prefix
    const cleanupMockTeachers = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
        const snap = await getDocs(q);
        const toDeleteDocs = snap.docs.filter(doc => {
          const val = doc.data();
          return val.studentId && typeof val.studentId === 'string' && val.studentId.startsWith('SF-');
        });
        
        for (const docSnapshot of toDeleteDocs) {
          console.log(`[Mock Cleanup] Removing mock teacher record ${docSnapshot.id} (${docSnapshot.data().name})`);
          await deleteDoc(docSnapshot.ref);
        }
      } catch (err) {
        console.warn("[Mock Cleanup] Non-critical background cleanup task skipped/failed:", err);
      }
    };
    cleanupMockTeachers();
  }, []);

  const addLog = (message: string) => {
    const time = format(new Date(), 'HH:mm:ss');
    setSyncLogs(prev => [...prev, `[${time}] ${message}`]);
  };

  const saveSettings = () => {
    localStorage.setItem('zera_staff_api_base', apiBaseUrl);
    localStorage.setItem('zera_staff_api_key', apiKey);
    localStorage.setItem('zera_staff_api_use_emulator', String(useEmulator));
    localStorage.setItem('zera_staff_api_auto_sync', String(autoSync));
    setShowConfig(false);
    addLog("✓ Synchronization channel configuration successfully saved locally.");
  };

  const performSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setErrorMessage(null);
    setSyncSummary(null);
    setSyncLogs([]);
    
    const customBase = apiBaseUrl.trim();
    const customKey = apiKey.trim();
    const emulatorMode = useEmulator;
    
    addLog(`🔄 Staff Sync Engine Booting (API Version: v1)...`);
    addLog(`System Role: Faculty / Teacher directories synchronization.`);
    
    if (emulatorMode) {
      addLog(`Connecting with local Sandbox Emulator database...`);
    } else {
      addLog(`Locating authentication key headers...`);
      if (!customKey) {
        setErrorMessage("Setup Block: Requires authorization token keys to contact GET /api/v1/staff.");
        setIsSyncing(false);
        return;
      }
    }
    
    let staffToProcess: any[] = [];
    
    try {
      if (emulatorMode) {
        // Handle paginated simulation for emulator mode
        let emuPage = 1;
        const perPage = 5;
        const totalEmu = EMULATED_STAFF.length;
        const totalPages = Math.ceil(totalEmu / perPage);
        
        addLog(`Initiating emulated paginated crawl across ${totalPages} pages...`);
        
        while (emuPage <= totalPages) {
          addLog(`Contacting GET /api/v1/staff?page=${emuPage}...`);
          await new Promise(resolve => setTimeout(resolve, 150));
          
          const startIdx = (emuPage - 1) * perPage;
          const endIdx = startIdx + perPage;
          const pageItems = EMULATED_STAFF.slice(startIdx, endIdx);
          
          addLog(`Successfully retrieved Staff Page ${emuPage} list (${pageItems.length} records found).`);
          staffToProcess = [...staffToProcess, ...pageItems];
          emuPage++;
        }
      } else {
        // Real REST API integration with robust pagination traversal & CORS proxy handling
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
          const queryParams = new URLSearchParams();
          if (customBase) {
            queryParams.append('api_url', customBase);
          }
          if (customKey) {
            queryParams.append('key', customKey);
          }
          queryParams.append('page', String(currentPage));
          
          const fetchUrl = `${window.location.origin}/api/v1/staff?${queryParams.toString()}`;
          addLog(`Calling School Endpoint (Page ${currentPage}): ${customBase || window.location.origin}/api/v1/staff?page=${currentPage}...`);
          
          const headers: HeadersInit = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          };
          
          if (customKey) {
            headers['Authorization'] = `Bearer ${customKey}`;
          }
          
          const response = await fetch(fetchUrl, { headers });
          if (!response.ok) {
            throw new Error(`Endpoint returned HTTP ${response.status} ${response.statusText} at page ${currentPage}`);
          }
          
          const payload = await response.json();
          if (!payload || !Array.isArray(payload.data)) {
            throw new Error(`Invalid API Response at page ${currentPage}. Payload must return an object with a 'data' array.`);
          }
          
          // Filter active staff status from the raw result
          const activePageStaff = payload.data.filter((s: any) => s.status === 'active');
          addLog(`Successfully retrieved Staff Page ${currentPage} list (${activePageStaff.length} active/current profiles out of ${payload.data.length} records).`);
          
          if (payload.data.length === 0) {
            hasMorePages = false;
          } else {
            staffToProcess = [...staffToProcess, ...activePageStaff];
            
            // Check pagination cues
            const lastPage = payload.last_page || (payload.meta && payload.meta.last_page);
            const nextPageUrl = payload.next_page_url || (payload.links && payload.links.next);
            
            if (lastPage && currentPage >= lastPage) {
              hasMorePages = false;
            } else if (nextPageUrl === null || nextPageUrl === false) {
              hasMorePages = false;
            } else if (!lastPage && !nextPageUrl && payload.data.length < (payload.per_page || 15)) {
              hasMorePages = false;
            } else {
              currentPage++;
              if (currentPage > 20) {
                addLog(`Pagination safety ceiling of 20 pages reached.`);
                break;
              }
            }
          }
        }
        addLog(`Successfully completed retrieving all staff records (${staffToProcess.length} total found).`);
      }
      
      let createdCount = 0;
      let updatedCount = 0;
      const skippedCount = 0;
      
      addLog(`Reconciling Firestore library accounts & fetching detailed API records...`);
      
      for (const staff of staffToProcess) {
        let detailedStaff = { ...staff };
        try {
          const detailQueryParams = new URLSearchParams();
          if (customBase) {
            detailQueryParams.append('api_url', customBase);
          }
          if (customKey) {
            detailQueryParams.append('key', customKey);
          }
          const detailUrl = `${window.location.origin}/api/v1/staff/${staff.id}?${detailQueryParams.toString()}`;
          
          const headers: HeadersInit = {};
          if (customKey) {
            headers['Authorization'] = `Bearer ${customKey}`;
          }
          
          const detailRes = await fetch(detailUrl, { headers });
          if (detailRes.ok) {
            const richData = await detailRes.json();
            if (richData && richData.id === staff.id) {
              detailedStaff = richData;
            } else if (richData && richData.data && richData.data.id === staff.id) {
              detailedStaff = richData.data;
            }
          }
        } catch (detailErr) {
          console.warn(`Enrichment failed for ${staff.id}:`, detailErr);
        }

        const personName = detailedStaff.nric_name || `${detailedStaff.first_name} ${detailedStaff.last_name}`;
        const staffIdStr = detailedStaff.id !== undefined && detailedStaff.id !== null ? String(detailedStaff.id).trim() : '';
        addLog(`Processing: [ID: ${staffIdStr}] ${personName}...`);
        
        // Match existing user by studentId (as unique school ID field) and role == teacher
        const usersCollection = collection(db, 'users');
        let matchedDocId: string | null = null;
        let existingData: any = null;
        
        const qId = query(usersCollection, where('studentId', '==', staffIdStr), where('role', '==', 'teacher'));
        let idSnap;
        try {
          idSnap = await getDocs(qId);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `users?studentId=${staffIdStr}`);
          throw error;
        }
        
        if (!idSnap.empty) {
          matchedDocId = idSnap.docs[0].id;
          existingData = idSnap.docs[0].data();
        } else if (detailedStaff.email) {
          const qEmail = query(usersCollection, where('email', '==', detailedStaff.email), where('role', '==', 'teacher'));
          let emailSnap;
          try {
            emailSnap = await getDocs(qEmail);
          } catch (error) {
            handleFirestoreError(error, OperationType.LIST, `users?email=${detailedStaff.email}`);
            throw error;
          }
          if (!emailSnap.empty) {
            matchedDocId = emailSnap.docs[0].id;
            existingData = emailSnap.docs[0].data();
          }
        }
        
        const mappedName = personName;
        
        const updatedProfilePayload: any = {
          name: mappedName,
          email: detailedStaff.email || '',
          role: 'teacher',
          studentId: staffIdStr,
          department: detailedStaff.job_title || 'Faculty',
          phoneNumber: detailedStaff.phone || '',
          status: detailedStaff.status || 'active',
          syncSource: emulatorMode ? 'Sandbox Emulator' : 'School API Endpoint',
          lastSyncedAt: new Date().toISOString()
        };
        
        if (matchedDocId) {
          const docRef = doc(db, 'users', matchedDocId);
          try {
            await updateDoc(docRef, updatedProfilePayload);
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${matchedDocId}`);
            throw error;
          }
          updatedCount++;
          addLog(`✓ Updated teacher database profile for SFID ${staffIdStr}.`);
        } else {
          // Generate sequence barcode if possible
          let assignedBarcode = `SF-${staffIdStr.replace(/[^0-9a-zA-Z]/g, '')}`;
          try {
            const nextBarcode = await BarcodeService.generateNextBarcode('staff');
            if (nextBarcode) {
              assignedBarcode = nextBarcode;
            }
          } catch (barErr) {
            console.warn("Could not generate sequence barcode during sync, using safe defaults:", barErr);
          }

          const finalProfileToSave = {
            ...updatedProfilePayload,
            activeLoansCount: 0,
            createdAt: new Date().toISOString(),
            barcode: assignedBarcode
          };
          try {
            await addDoc(usersCollection, finalProfileToSave);
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `users/new`);
            throw error;
          }
          createdCount++;
          addLog(`+ Created brand new library profile for SFID ${staffIdStr}.`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      const finishTime = Date.now();
      setLastSyncDate(new Date(finishTime));
      localStorage.setItem('zera_staff_api_last_sync_time', String(finishTime));
      
      setSyncSummary({
        processed: staffToProcess.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount
      });
      
      addLog(`Staff Directory Synchronization Completed Successfully!`);
    } catch (err: any) {
      console.error(err);
      const rawMsg = err.message || "An unexpected error occurred during staff API synchronization.";
      let parsedErrorStr = rawMsg;
      let isPermissionDenied = err.code === 'permission-denied' || rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('insufficient');
      
      if (rawMsg.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMsg);
          parsedErrorStr = parsed.error || parsedErrorStr;
          if (parsed.error && (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient'))) {
            isPermissionDenied = true;
          }
        } catch (parseErr) {
          console.warn("Error parsing rawMsg JSON", parseErr);
        }
      }
      
      let friendlyError = parsedErrorStr;
      if (parsedErrorStr.includes('Failed to fetch') || parsedErrorStr.includes('NetworkError')) {
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
      <div className="absolute right-0 top-0 w-32 h-32 bg-zera-emerald/5 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zera-emerald/10 border border-zera-emerald/20 flex items-center justify-center text-zera-emerald">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zera-emerald">Official School Integration</p>
              <h4 className="font-serif text-lg font-black text-natural-text">Staff Directory Sync Engine</h4>
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
                    <p className="text-[10px] font-bold leading-normal">Simulate the official school staff REST API with secure authentic presets.</p>
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
                  <p className="text-[9px] text-natural-muted italic leading-normal px-1">Defaults to current domain routing of /api/v1/staff.</p>
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

        {(isSyncing || syncSummary || errorMessage) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="border-t border-natural-border mt-5 pt-5 space-y-4"
          >
            {syncSummary && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-start gap-3 text-xs text-emerald-800 font-medium">
                <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-extrabold text-emerald-950 mb-1">Staff Sync Database Update Complete!</p>
                  <p className="leading-relaxed text-emerald-900">
                    Processed <span className="font-bold text-emerald-950">{syncSummary.processed}</span> profiles from the staff registry list: 
                    added <span className="font-black text-emerald-950">+{syncSummary.created} new teachers</span> to library custody and 
                    updated details for <span className="font-black text-emerald-950">{syncSummary.updated} matched records</span>.
                  </p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-3xl flex items-start gap-3 text-xs text-amber-800 font-medium">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-extrabold text-amber-950 mb-1">Synchronization Interrupted</p>
                  <p className="leading-relaxed text-amber-900">{errorMessage}</p>
                </div>
              </div>
            )}

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
