import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { UserProfile } from '@/src/types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch or create profile
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
            
            // Auto-promote if in bootstrapped list but not yet admin
            if (firebaseUser.email && bootstrappedAdmins.includes(firebaseUser.email) && data.role !== 'admin') {
              await setDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' }, { merge: true });
              setProfile({ ...data, role: 'admin' });
            } else {
              setProfile(data);
            }
          } else {
            const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
            const isAdminEmail = firebaseUser.email ? bootstrappedAdmins.includes(firebaseUser.email) : false;
            
            // Create default profile for first-time login
            const newProfileData: any = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'Anonymous User',
              email: firebaseUser.email || '',
              role: isAdminEmail ? 'admin' : 'student', // Default role or admin for bootstrapped email
              status: 'active',
              createdAt: serverTimestamp(),
              activeLoansCount: 0
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfileData);
            // Since serverTimestamp() isn't available immediately in local state, 
            // we'll use a local date for the initial profile state
            setProfile({
              ...newProfileData,
              createdAt: new Date().toISOString()
            } as UserProfile);
          }
        } catch (error) {
          console.error("Error fetching/creating profile:", error);
          // If profile fetch fails due to rules (e.g. not created yet),
          // handleFirestoreError would be too noisy here during typical auth flow,
          // but we should at least log it.
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      
      const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
      const isAdminEmail = bootstrappedAdmins.includes(email);
      
      const newProfileData: any = {
        uid: firebaseUser.uid,
        name: name,
        email: email,
        role: isAdminEmail ? 'admin' : 'student',
        status: 'active',
        createdAt: serverTimestamp(),
        activeLoansCount: 0
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newProfileData);
      
      setProfile({
        ...newProfileData,
        createdAt: new Date().toISOString()
      } as UserProfile);
    } catch (error: any) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Firestore Error Handler Template
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
