import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/src/hooks/useAuth';
import { 
  Book as BookIcon, 
  Search, 
  Library, 
  User, 
  LayoutDashboard, 
  BookOpen, 
  BarChart, 
  Settings,
  LogOut,
  ChevronRight,
  Plus,
  Users,
  GraduationCap,
  Globe,
  ShoppingCart,
  FileText,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  BookMarked,
  X,
  Mail,
  Lock,
  UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

import { BookGrid } from '@/src/components/opac/BookGrid';
import { MemberPortal } from '@/src/components/opac/MemberPortal';
import { CatalogManager } from '@/src/components/admin/CatalogManager';
import { UserManagement } from '@/src/components/admin/UserManagement';
import { CirculationDashboard } from '@/src/components/admin/CirculationDashboard';
import { AdminDashboard } from '@/src/components/admin/AdminDashboard';
import { OnlineResources } from '@/src/components/admin/OnlineResources';
import { Acquisition } from '@/src/components/admin/Acquisition';
import { Reports } from '@/src/components/admin/Reports';
import { InventoryAudit } from '@/src/components/admin/InventoryAudit';
import { BarcodeStudio } from '@/src/components/admin/BarcodeStudio';
import { Barcode as BarcodeIcon } from 'lucide-react';

// --- Shared Components ---
const AuthModal = ({ isOpen, onClose, initialMode = 'login' }: { isOpen: boolean, onClose: () => void, initialMode?: 'login' | 'register' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [suggestLogin, setSuggestLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSuggestLogin(false);
      setEmail('');
      setPassword('');
      setName('');
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuggestLogin(false);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      onClose();
    } catch (err: any) {
      console.error('Auth Error:', err.code, err.message);
      
      let friendlyMessage = 'Authentication failed. Please try again.';
      
      switch (err.code) {
        case 'auth/email-already-in-use':
          friendlyMessage = 'This email is already registered.';
          setSuggestLogin(true);
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'Invalid Email: Please check the email format.';
          break;
        case 'auth/weak-password':
          friendlyMessage = 'Weak Password: Password must be at least 6 characters.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          friendlyMessage = 'Invalid Credentials: Dual check your email and password.';
          break;
        case 'auth/too-many-requests':
          friendlyMessage = 'Security Access Locked: Too many failed attempts. Try again later.';
          break;
        default:
          friendlyMessage = err.message || friendlyMessage;
      }
      
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="relative p-8 pt-10">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-natural-bg rounded-full transition-colors text-natural-muted"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-8">
            <ZeraLogo className="mx-auto mb-4 scale-125 origin-center" />
            <h2 className="text-2xl font-serif font-black text-zera-emerald mt-6">
              {mode === 'login' ? 'Member Access' : 'Register Member'}
            </h2>
            <p className="text-sm text-natural-muted mt-2 font-medium">
              {mode === 'login' ? 'Access your library account' : 'Join the Zera School archive'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="relative">
                <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                <input 
                  type="text"
                  required
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-natural-bg border-2 border-natural-border p-4 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
              <input 
                type="email"
                required
                placeholder="School Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-natural-bg border-2 border-natural-border p-4 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
              <input 
                type="password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-natural-bg border-2 border-natural-border p-4 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 animate-in zoom-in-95">
                <p className="text-xs text-red-600 font-bold flex items-center gap-2">
                  <span className="w-1 h-1 bg-red-500 rounded-full" />
                  {error}
                </p>
                {suggestLogin && (
                  <button 
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setSuggestLogin(false);
                    }}
                    className="mt-2 text-xs font-black text-zera-emerald hover:underline underline-offset-2 flex items-center gap-1"
                  >
                    Sign In instead <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-zera-emerald text-white rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-zera-emerald-dark transition-all transform active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-zera-emerald/10 mt-2"
            >
              {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Register')}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-natural-border pt-6">
            <p className="text-sm text-natural-muted font-medium">
              {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
              <button 
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="ml-2 text-zera-emerald-light font-black hover:underline underline-offset-4"
              >
                {mode === 'login' ? 'Register Now' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ZeraLogo = ({ className }: { className?: string }) => {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="font-serif text-2xl font-black text-zera-emerald leading-none tracking-tighter uppercase">zera</span>
      <span className="text-[9px] font-bold text-zera-emerald-light uppercase tracking-[0.2em] -mt-1 whitespace-nowrap">International School</span>
    </div>
  );
};

const Navbar = ({ onSettleAdmin, isAdminView, onOpenAuth }: { onSettleAdmin: (val: boolean) => void, isAdminView: boolean, onOpenAuth: () => void }) => {
  const { profile, logout } = useAuth();
  
  return (
    <nav className="h-16 border-b border-natural-border flex items-center justify-between px-8 bg-natural-nav sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4 cursor-pointer" onClick={() => onSettleAdmin(false)}>
        <ZeraLogo className="h-9" />
        <div className="h-6 w-px bg-natural-border mx-2" />
        <span className="font-serif text-xl font-bold text-zera-emerald tracking-tight opacity-70">Library System</span>
      </div>
      
      <div className="flex items-center gap-8 text-natural-text">
        <div className="flex items-center bg-natural-border/50 p-1 rounded-full text-[10px] font-black uppercase tracking-wider">
           <button 
              onClick={() => onSettleAdmin(false)}
              className={cn(
                "px-4 py-1.5 rounded-full transition-all", 
                !isAdminView ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
              )}
            >
              Public Catalog
            </button>
            <button 
              onClick={() => onSettleAdmin(true)}
              className={cn(
                "px-4 py-1.5 rounded-full transition-all", 
                isAdminView ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-natural-muted hover:text-zera-emerald"
              )}
            >
              Librarian Dashboard
            </button>
        </div>

        <div className="flex items-center gap-3 ml-4">
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-natural-text leading-none">{profile.name}</p>
                <p className="text-[9px] font-bold text-zera-emerald mt-1 uppercase tracking-widest">{profile.role}</p>
              </div>
              <button 
                onClick={logout}
                className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

// --- View Components ---
const OPAC = () => {
  const [activeTab, setActiveTab] = useState<'books' | 'resources' | 'portal'>('books');

  const tabs = [
    { id: 'books', label: 'Physical Library', icon: BookIcon },
    { id: 'resources', label: 'Digital Resources', icon: Globe },
    { id: 'portal', label: 'Member Portal', icon: User },
  ];

  return (
    <main className="max-w-7xl mx-auto px-6 py-12 min-h-[calc(100vh-104px)]">
      <div className="text-center mb-16 space-y-2">
         <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zera-yellow-dark">Zera International School</h2>
         <h1 className="text-4xl font-serif font-black text-zera-emerald tracking-tight">Institutional Knowledge Archive</h1>
         <div className="w-12 h-1 bg-zera-yellow mx-auto mt-4 rounded-full"></div>
      </div>

      <div className="flex justify-center mb-16">
        <div className="flex bg-white p-1.5 rounded-3xl border-2 border-natural-border shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2.5 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === tab.id 
                  ? "bg-zera-yellow text-zera-emerald shadow-md translate-y-[-2px]" 
                  : "text-natural-muted hover:text-zera-emerald hover:bg-natural-bg"
              )}
            >
              <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-zera-emerald" : "text-natural-muted")} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'books' && <BookGrid />}
          {activeTab === 'resources' && <OnlineResources />}
          {activeTab === 'portal' && <MemberPortal />}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'catalog' | 'circulation' | 'inventory' | 'students' | 'teachers' | 'resources' | 'acquisition' | 'reports' | 'barcodes'>('dashboard');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'catalog', label: 'Catalogue', icon: BookOpen },
    { id: 'circulation', label: 'Circulation', icon: BarChart },
    { id: 'inventory', label: 'Inventory Audit', icon: BookMarked },
    { id: 'barcodes', label: 'Barcode Studio', icon: BarcodeIcon },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'teachers', label: 'Teachers', icon: GraduationCap },
    { id: 'resources', label: 'Online Resources', icon: Globe },
    { id: 'acquisition', label: 'Acquisition', icon: ShoppingCart },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-natural-nav border-r border-natural-border p-4 flex flex-col gap-4">
        <div className="mb-6 px-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-natural-muted italic">Library Management</p>
        </div>
        
        <div className="mb-2">
          <div className="flex flex-col gap-1">
            {menuItems.map((item) => (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group",
                  activeTab === item.id 
                    ? "bg-zera-yellow text-zera-emerald-dark shadow-md" 
                    : "text-natural-muted hover:bg-zera-emerald/10 hover:text-zera-emerald"
                )}
              >
                <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-zera-emerald-dark" : "text-natural-muted group-hover:text-zera-emerald")} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto">
          <div className="bg-zera-yellow/10 rounded-2xl p-4 border border-zera-yellow/30 shadow-sm">
            <p className="text-xs font-bold text-zera-yellow-dark mb-2">System Health</p>
            <div className="w-full bg-white/50 h-2 rounded-full overflow-hidden">
              <div className="bg-zera-emerald h-full w-[98%]"></div>
            </div>
            <p className="text-[10px] text-zera-emerald-dark mt-2 font-bold">Z39.50 Active • DB Online</p>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-natural-bg/50">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <AdminDashboard onNavigate={setActiveTab} />}
            {activeTab === 'catalog' && <CatalogManager />}
            {activeTab === 'circulation' && <CirculationDashboard />}
            {activeTab === 'students' && <UserManagement key="students" roleFilter="student" />}
            {activeTab === 'teachers' && <UserManagement key="teachers" roleFilter="teacher" />}
            {activeTab === 'resources' && <OnlineResources />}
            {activeTab === 'acquisition' && <Acquisition />}
            {activeTab === 'reports' && <Reports />}
            {activeTab === 'inventory' && <InventoryAudit />}
            {activeTab === 'barcodes' && <BarcodeStudio />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

const App = () => {
  const [isAdminView, setIsAdminView] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const { profile, loading } = useAuth();

  const handleToggleAdminView = async (val: boolean) => {
    if (val) {
      if (!profile) {
        setAuthMode('login');
        setIsAuthModalOpen(true);
      } else if (profile.role !== 'admin') {
        alert("Restricted Access: Librarian credentials required.");
      } else {
        setIsAdminView(true);
      }
    } else {
      setIsAdminView(false);
    }
  };

  // Ensure admin view is only active if user is authenticated and is an admin
  useEffect(() => {
    if (isAdminView && !loading) {
      if (!profile || profile.role !== 'admin') {
        setIsAdminView(false);
      }
    }
  }, [profile, isAdminView, loading]);

  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans selection:bg-zera-yellow selection:text-zera-emerald-dark antialiased">
      <Navbar 
        onSettleAdmin={handleToggleAdminView} 
        isAdminView={isAdminView} 
        onOpenAuth={() => {
          setAuthMode('login');
          setIsAuthModalOpen(true);
        }}
      />
      
      <AnimatePresence mode="wait">
        <motion.div
          key={isAdminView ? 'admin' : 'opac'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {isAdminView && profile?.role === 'admin' ? <AdminPanel /> : <OPAC />}
        </motion.div>
      </AnimatePresence>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        initialMode={authMode}
      />

      <footer className="h-10 bg-zera-emerald px-8 flex items-center justify-between text-white text-[11px] font-bold sticky bottom-0 z-50">
        <div className="flex gap-6">
          <span>Version 4.2.1-stable</span>
          <span>© Zera International School</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-zera-yellow rounded-full animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]"></div>
          <span>Central Database Connected: 4.1ms latency</span>
        </div>
      </footer>
    </div>
  );
};

export default function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
