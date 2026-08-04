import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  User as FirebaseUser,
  sendPasswordResetEmail
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
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Commun SSO handoff: if we arrived from /sso/callback, redeem the one-time
    // cookie for a Firebase custom token and sign in. signInWithCustomToken then
    // drives onAuthStateChanged below, which reads the server-provisioned profile.
    const handleSsoHandoff = async () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('sso') === '1') {
        window.history.replaceState({}, document.title, window.location.pathname);
        // An SSO session supersedes any prior offline-simulation session.
        localStorage.removeItem('zera_active_local_credentials');
        try {
          const r = await fetch('/api/v1/sso/exchange', { method: 'POST' });
          if (r.ok) {
            const { token } = await r.json();
            if (token) await signInWithCustomToken(auth, token);
          }
        } catch (err) {
          console.error('SSO exchange failed:', err);
        }
      } else if (params.get('sso_error')) {
        const code = params.get('sso_error');
        console.warn('Commun SSO error:', code);
        window.history.replaceState({}, document.title, window.location.pathname);
        const messages: Record<string, string> = {
          teachers_only: 'Commun sign-in is for teachers and staff only. Students can look up their borrowing by name in the Member Portal.',
          disabled: 'Your Commun account is inactive. Please contact the library.',
          replay: 'This sign-in link has already been used. Please launch the library again from Commun.',
          invalid_ticket: 'Sign-in could not be verified. Please try launching the library again from Commun.',
        };
        if (code && messages[code]) {
          // Defer so it doesn't block the initial paint.
          setTimeout(() => alert(messages[code]), 0);
        }
      }
    };
    handleSsoHandoff();

    // Proactively restore cached session to prevent UI flickering on login under network issues
    const cachedSession = localStorage.getItem('zera_active_session');
    if (cachedSession) {
      try {
        const { cachedUser, cachedProfile } = JSON.parse(cachedSession);
        if (cachedUser && cachedProfile) {
          setUser(cachedUser);
          setProfile(cachedProfile);
          setLoading(false);
        }
      } catch (err) {
        console.error("Local session recovery error:", err);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // If we are currently running under a local/offline simulation session, do override standard triggers
      const isSimulatedSession = localStorage.getItem('zera_active_local_credentials');
      if (isSimulatedSession) {
        setLoading(false);
        return;
      }

      if (firebaseUser) {
        setUser(firebaseUser);

        // Trusted role from custom claims (set server-side for SSO users).
        // Falls back to undefined for librarian (email/password) accounts, which
        // keep their existing doc-based admin behaviour below.
        let claimRole: UserProfile['role'] | undefined;
        try {
          const tokenResult = await firebaseUser.getIdTokenResult();
          const r = tokenResult.claims.role;
          if (r === 'admin' || r === 'teacher' || r === 'student') claimRole = r;
        } catch { /* offline / token unavailable — ignore */ }

        // Fetch or create profile
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          let finalProfile: UserProfile;

          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
            
            let updated = false;
            const updatedData = { ...data };

            // Self-healing: if name is empty or 'Anonymous User', derive it from email
            if ((!updatedData.name || updatedData.name === 'Anonymous User') && firebaseUser.email) {
              updatedData.name = firebaseUser.email.split('@')[0];
              updated = true;
            }

            // Auto-promote if in bootstrapped list but not yet admin
            if (firebaseUser.email && bootstrappedAdmins.includes(firebaseUser.email) && data.role !== 'admin') {
              updatedData.role = 'admin';
              updated = true;
            }

            // Trusted custom claim wins over a (client-writable) doc role.
            if (claimRole && updatedData.role !== claimRole) {
              updatedData.role = claimRole;
              updated = true;
            }

            if (updated) {
              await setDoc(doc(db, 'users', firebaseUser.uid), updatedData, { merge: true });
            }
            finalProfile = updatedData;
          } else {
            // Create default profile for first-time login.
            const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
            const email = (firebaseUser.email || '').toLowerCase();

            // A member who just self-registered is flagged in localStorage → role
            // 'teacher'. Bootstrapped emails are admins. SSO users carry a trusted
            // claim. Otherwise it's a librarian pre-added in the Firebase console
            // (the historical default), who gets admin.
            const pendingMemberEmail = localStorage.getItem('zera_pending_member_registration');
            const pendingMemberName = localStorage.getItem('zera_pending_member_name');
            const isSelfRegisteredMember = !!email && pendingMemberEmail === email;

            let role: UserProfile['role'];
            if (bootstrappedAdmins.includes(email)) role = 'admin';
            else if (claimRole) role = claimRole;
            else if (isSelfRegisteredMember) role = 'teacher';
            else role = 'admin';

            const derivedName = (isSelfRegisteredMember && pendingMemberName)
              ? pendingMemberName
              : (firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Anonymous User'));

            if (isSelfRegisteredMember) {
              localStorage.removeItem('zera_pending_member_registration');
              localStorage.removeItem('zera_pending_member_name');
            }

            const newProfileData: any = {
              uid: firebaseUser.uid,
              name: derivedName,
              email: firebaseUser.email || '',
              role,
              status: 'active',
              createdAt: serverTimestamp(),
              activeLoansCount: 0
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfileData);
            finalProfile = {
              ...newProfileData,
              createdAt: new Date().toISOString()
            } as UserProfile;
          }

          setProfile(finalProfile);

          // Write active session metadata to support silent local recovery on subsequent starts
          localStorage.setItem('zera_active_session', JSON.stringify({
            cachedUser: {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || finalProfile.name,
              emailVerified: firebaseUser.emailVerified
            },
            cachedProfile: finalProfile
          }));

        } catch (error) {
          console.error("Error fetching/creating profile, implementing client-safe fallback:", error);
          if (firebaseUser.email) {
            const fallbackProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
              email: firebaseUser.email,
              role: claimRole ?? 'admin',
              status: 'active',
              createdAt: new Date().toISOString(),
              activeLoansCount: 0
            };
            setProfile(fallbackProfile);
          }
        }
      } else {
        setUser(null);
        setProfile(null);
        localStorage.removeItem('zera_active_session');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const normEmail = email.trim().toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Clean up fallback simulation flags if login standardly succeeds in the cloud
      localStorage.removeItem('zera_active_local_credentials');
    } catch (error: any) {
      console.warn("Authentication request failed in the cloud:", error.code, error.message);

      const isNetworkError = 
        error.code === 'auth/network-request-failed' ||
        error.message?.toLowerCase().includes('network-request-failed') ||
        error.message?.toLowerCase().includes('failed-to-fetch') ||
        error.message?.toLowerCase().includes('networkerror') ||
        error.message?.toLowerCase().includes('firebase error');

      if (isNetworkError) {
        console.info("Entering Local High-Availability Node Mode silently.");

        const bootstrappedAdmins = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
        const matchedAdmin = bootstrappedAdmins.includes(normEmail);

        let targetProfile: UserProfile | null = null;

        if (matchedAdmin) {
          targetProfile = {
            uid: normEmail === 'nurshahidahmohdayob@gmail.com' ? 'ha-admin-1' : 'ha-admin-2',
            name: normEmail === 'nurshahidahmohdayob@gmail.com' ? 'Nurshahidah Mohd Ayob' : 'Shahidah Alatas',
            email: normEmail,
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString(),
            activeLoansCount: 0
          };
        } else {
          // Fall back to locally stored offline registration registry
          const localRegistryRaw = localStorage.getItem('zera_local_registered_users');
          const localRegistry = localRegistryRaw ? JSON.parse(localRegistryRaw) : [];
          const matchedUser = localRegistry.find((u: any) => u.email.toLowerCase() === normEmail);
          if (matchedUser) {
            targetProfile = matchedUser;
          }
        }

        if (targetProfile) {
          if (password.length < 6) {
            const errorWeak = new Error("Firebase: Password must be at least 6 characters (auth/weak-password).");
            (errorWeak as any).code = 'auth/weak-password';
            throw errorWeak;
          }

          const simulatedUser: any = {
            uid: targetProfile.uid,
            email: targetProfile.email,
            displayName: targetProfile.name,
            emailVerified: true
          };

          setUser(simulatedUser);
          setProfile(targetProfile);

          // Save simulation state so it persists reliably during network blockages
          localStorage.setItem('zera_active_local_credentials', JSON.stringify({ email: normEmail, uid: targetProfile.uid }));
          localStorage.setItem('zera_active_session', JSON.stringify({
            cachedUser: simulatedUser,
            cachedProfile: targetProfile
          }));
          return;
        } else {
          const errorUserNotFound = new Error("Firebase: User not found (auth/user-not-found).");
          (errorUserNotFound as any).code = 'auth/user-not-found';
          throw errorUserNotFound;
        }
      }

      throw error;
    }
  };

  // Self-registration is for MEMBERS (teaching staff) only — never librarians/
  // admins. Admin accounts are provisioned separately (bootstrapped emails or an
  // admin setting a role). New members must use a Zera email; they are created
  // with role 'teacher' and can sign in immediately.
  const register = async (email: string, password: string, name: string) => {
    const normEmail = email.trim().toLowerCase();

    // Guard: members only, Zera email only.
    if (!normEmail.endsWith('@zera.edu.my')) {
      throw new Error('Only Zera email addresses (@zera.edu.my) can register as a member.');
    }

    // Flag this brand-new account so onAuthStateChanged provisions it as a member
    // (role 'teacher'), not the librarian/admin default used for pre-added emails.
    localStorage.setItem('zera_pending_member_registration', normEmail);
    localStorage.setItem('zera_pending_member_name', name || '');

    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged now creates the member profile and sets the session.
      return;
    } catch (error: any) {
      // If Auth creation failed, undo the pending flag.
      if (error.code !== 'auth/network-request-failed') {
        localStorage.removeItem('zera_pending_member_registration');
        localStorage.removeItem('zera_pending_member_name');
      }

      if (error.code === 'auth/email-already-in-use') {
        const err = new Error("This email already has an account. Please use 'Sign In', or 'Forgot password?' to set a new password.");
        (err as any).code = 'auth/email-already-in-use';
        throw err;
      }

      console.warn("Registration request failed in cloud:", error.code, error.message);

      const isNetworkError =
        error.code === 'auth/network-request-failed' ||
        error.message?.toLowerCase().includes('network-request-failed') ||
        error.message?.toLowerCase().includes('failed-to-fetch') ||
        error.message?.toLowerCase().includes('networkerror') ||
        error.message?.toLowerCase().includes('firebase error');

      if (isNetworkError) {
        console.info("Registering member in Local High-Availability Node registry (offline simulation).");
        localStorage.removeItem('zera_pending_member_registration');
        localStorage.removeItem('zera_pending_member_name');

        const offlineUid = `ha-user-${Date.now()}`;
        const newProfileData: UserProfile = {
          uid: offlineUid,
          name: name,
          email: normEmail,
          role: 'teacher', // Members self-register as teaching staff, never admin.
          status: 'active',
          createdAt: new Date().toISOString(),
          activeLoansCount: 0
        };

        const localRegistryRaw = localStorage.getItem('zera_local_registered_users');
        const localRegistry = localRegistryRaw ? JSON.parse(localRegistryRaw) : [];

        if (localRegistry.some((u: any) => u.email.toLowerCase() === normEmail)) {
          const errorDuplicate = new Error("This email is already registered locally (auth/email-already-in-use).");
          (errorDuplicate as any).code = 'auth/email-already-in-use';
          throw errorDuplicate;
        }

        localRegistry.push(newProfileData);
        localStorage.setItem('zera_local_registered_users', JSON.stringify(localRegistry));

        const simulatedUser: any = {
          uid: offlineUid,
          email: normEmail,
          displayName: name,
          emailVerified: true
        };

        setUser(simulatedUser);
        setProfile(newProfileData);

        localStorage.setItem('zera_active_local_credentials', JSON.stringify({ email: normEmail, uid: offlineUid }));
        localStorage.setItem('zera_active_session', JSON.stringify({
          cachedUser: simulatedUser,
          cachedProfile: newProfileData
        }));
        return;
      }

      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    // Firebase sends the reset email for any account that exists; to avoid
    // leaking which emails are registered it does not error on unknown ones.
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setUser(null);
      setProfile(null);
      localStorage.removeItem('zera_active_local_credentials');
      localStorage.removeItem('zera_active_session');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      login,
      register,
      resetPassword,
      logout
    }}>
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
