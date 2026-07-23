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
  ClipboardCheck,
  X,
  Mail,
  Lock,
  UserCircle,
  Shield,
  ShieldAlert,
  Bookmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

import { BookGrid } from '@/src/components/opac/BookGrid';
import { MemberPortal } from '@/src/components/opac/MemberPortal';
import { BrandCharter } from '@/src/components/opac/BrandCharter';
import { CatalogManager } from '@/src/components/admin/CatalogManager';
import { UserManagement } from '@/src/components/admin/UserManagement';
import { CirculationDashboard } from '@/src/components/admin/CirculationDashboard';
import { AdminDashboard } from '@/src/components/admin/AdminDashboard';
import { OnlineResources } from '@/src/components/admin/OnlineResources';
import { Acquisition } from '@/src/components/admin/Acquisition';
import { Reports } from '@/src/components/admin/Reports';
import { InventoryAudit } from '@/src/components/admin/InventoryAudit';
import { TeacherStocktake } from '@/src/components/admin/TeacherStocktake';
import { BarcodeStudio } from '@/src/components/admin/BarcodeStudio';
import { HoldRequests } from '@/src/components/admin/HoldRequests';
import { usePendingHoldsCount } from '@/src/hooks/useHolds';
import { Barcode as BarcodeIcon } from 'lucide-react';

// --- Shared Components ---
const AuthModal = ({ isOpen, onClose, initialMode = 'login' }: { isOpen: boolean, onClose: () => void, initialMode?: 'login' | 'register' }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('admin');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [suggestLogin, setSuggestLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register, resetPassword } = useAuth();

  // Access is restricted to Zera school email addresses. The two long-standing
  // bootstrapped admin accounts are allowed as an explicit exception.
  const ZERA_EMAIL_DOMAIN = '@zera.edu.my';
  const BOOTSTRAP_ADMINS = ['nurshahidahmohdayob@gmail.com', 'shahidah.a@zera.edu.my'];
  const isZeraEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    return e.endsWith(ZERA_EMAIL_DOMAIN) || BOOTSTRAP_ADMINS.includes(e);
  };

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setNotice('');
      setSuggestLogin(false);
      setEmail('');
      setPassword('');
      setName('');
      setRole('admin');
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  const handleForgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your school email above first, then tap “Forgot password?”');
      return;
    }
    if (!isZeraEmail(email)) {
      setError('Only Zera email addresses (@zera.edu.my) are allowed to sign in.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email);
      setNotice(`If an account exists for ${email.trim()}, a password reset link is on its way. Check your inbox (and spam).`);
    } catch (err: any) {
      console.error('Password reset error:', err.code, err.message);
      setError(err.code === 'auth/invalid-email'
        ? 'Invalid Email: Please check the email format.'
        : (err.message || 'Could not send the reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSuggestLogin(false);

    if (!isZeraEmail(email)) {
      setError('Only Zera email addresses (@zera.edu.my) are allowed to sign in.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name, 'admin');
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
          friendlyMessage = 'Invalid Credentials. (Tip: If you recently synced a brand-new Firebase project, no accounts exist yet! Please make sure to select "Register Now" below to create a new profile first.)';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "bg-white w-full rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 md:my-auto my-4",
          mode === 'register' ? "max-w-3xl" : "max-w-md"
        )}
      >
        <div className={cn("grid grid-cols-1", mode === 'register' && "md:grid-cols-12")}>
          {/* Left Side branding column for Registration - visible only on md+ */}
          {mode === 'register' && (
            <div className="hidden md:flex md:col-span-5 bg-gradient-to-br from-zera-emerald to-zera-emerald-dark text-white p-8 flex-col justify-between relative overflow-hidden">
              {/* Decorative background elements */}
              <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-zera-emerald-light/15 rounded-full blur-2xl" />
              <div className="absolute -left-12 -top-12 w-48 h-48 bg-zera-yellow/10 rounded-full blur-2xl" />
              
              <div className="relative z-10">
                <div className="mb-10">
                  <ZeraLogo variant="white" className="h-9" />
                </div>
                
                <h3 className="text-xl font-serif font-bold text-white leading-tight">School Archive & Library Registration</h3>
                <p className="text-xs text-white/70 mt-2 font-sans font-medium">Create your user profile to access our online catalogue, manage circulation, and borrow publications.</p>
                
                {/* Librarian privileges only */}
                <div className="mt-8 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zera-yellow italic">Librarian Access privileges:</p>
                  
                  <div className="space-y-3 text-xs leading-relaxed font-sans text-white/90">
                    <div className="flex items-start gap-2">
                      <span className="text-zera-yellow shrink-0">🛡️</span>
                      <span>Full system custody & Library administrator dashboard.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-zera-yellow shrink-0">📊</span>
                      <span>Issue barcodes, manage inventory, browse detailed reports and circulation.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-zera-yellow shrink-0">🔒</span>
                      <span>Restricted strictly to authorized administrative staff.</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="relative z-10 border-t border-white/20 pt-4 text-[10px] text-white/50 font-bold uppercase tracking-widest font-sans flex justify-between items-center">
                <span>Zera Archive</span>
                <span>EST. 2024</span>
              </div>
            </div>
          )}

          {/* Right Side / Form Container */}
          <div className={cn("relative p-8 pt-10 flex flex-col justify-between", mode === 'register' ? "md:col-span-7" : "w-full")}>
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 hover:bg-natural-bg rounded-full transition-colors text-natural-muted cursor-pointer z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              {/* Header */}
              <div className="text-center mb-6">
                <ZeraLogo className="mx-auto mb-2 h-16" />
                <h2 className="text-xl font-serif font-black text-zera-emerald mt-4">
                  {mode === 'login' ? 'Member Access' : 'Register Member'}
                </h2>
                <p className="text-xs text-natural-muted mt-1 font-medium">
                  {mode === 'login' ? 'Access your library account' : 'Join the Zera School archive'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {mode === 'register' && (
                  <div className="space-y-3">
                    {/* Account Type - Locked specifically to Librarian */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-natural-muted italic block px-1">
                        Account Type (Role)
                      </label>
                      <div className="bg-red-50/60 p-3 rounded-2xl border border-red-100 flex items-center gap-2.5 text-[11px] text-red-800 font-extrabold select-none">
                        <Shield className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Librarian (Administrative Custody)</span>
                      </div>
                    </div>

                    {/* Compact admin warning banner */}
                    <motion.div 
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex gap-2.5 text-[11px] text-amber-800 font-medium leading-normal animate-in fade-in"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5 animate-pulse" />
                      <div>
                        <p className="font-extrabold text-amber-950 mb-0.5">Authorization Required</p>
                        Librarian registration is restricted strictly to accounts pre-added in Firebase Authentication by the system administrator.
                      </div>
                    </motion.div>

                    {/* Full Name field with icon */}
                    <div className="relative">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                      <input 
                        type="text"
                        required
                        placeholder="Full Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-natural-bg border-2 border-natural-border p-3 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Email address field */}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                  <input 
                    type="email"
                    required
                    placeholder="Zera Email (name@zera.edu.my)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-natural-bg border-2 border-natural-border p-3 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
                  />
                </div>

                {/* Password field */}
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                  <input 
                    type="password"
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-natural-bg border-2 border-natural-border p-3 pl-12 rounded-2xl text-sm focus:outline-none focus:border-zera-yellow transition-all"
                  />
                </div>

                {/* Forgot password — login mode only */}
                {mode === 'login' && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className="text-[11px] font-black text-zera-emerald-light hover:underline underline-offset-2 disabled:opacity-50 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {notice && (
                  <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 animate-in zoom-in-95">
                    <p className="text-xs text-emerald-700 font-bold flex items-start gap-1.5 leading-normal">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0 mt-1.5" />
                      <span>{notice}</span>
                    </p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 p-3 rounded-2xl border border-red-100 animate-in zoom-in-95">
                    <p className="text-xs text-red-600 font-bold flex items-center gap-1.5 leading-normal">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                      <span>{error}</span>
                    </p>
                    {suggestLogin && (
                      <button 
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setError('');
                          setSuggestLogin(false);
                        }}
                        className="mt-1.5 text-xs font-black text-zera-emerald hover:underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                      >
                        Sign In instead <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-zera-emerald text-white hover:bg-zera-emerald-dark rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all transform active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-zera-emerald/10 cursor-pointer mt-1"
                >
                  {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Register')}
                </button>
              </form>
            </div>

            {/* Bottom Swapper Link */}
            <div className="mt-5 text-center border-t border-natural-border pt-4">
              <p className="text-xs text-natural-muted font-medium">
                {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
                <button 
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="ml-1.5 text-zera-emerald-light font-black hover:underline underline-offset-4 cursor-pointer"
                >
                  {mode === 'login' ? 'Register Now' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ZeraLogo = ({ className, variant = 'color' }: { className?: string, variant?: 'color' | 'white' }) => {
  // Official Zera Education horizontal lockup (2024 Brand Kit). Aspect ratio matches Hrz_*.png artwork.
  return (
    <img
      src={variant === 'white' ? '/brand/Hrz_White.png' : '/brand/Hrz_Color.png'}
      alt="Zera Education"
      className={cn("w-auto object-contain select-none", className)}
      draggable={false}
    />
  );
};

const Navbar = ({ onSettleAdmin, isAdminView, onOpenAuth }: { onSettleAdmin: (val: boolean) => void, isAdminView: boolean, onOpenAuth: () => void }) => {
  const { profile, logout } = useAuth();
  
  return (
    <nav className="h-16 border-b border-zera-emerald-dark flex items-center justify-between px-8 bg-zera-emerald sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => onSettleAdmin(false)}>
          <span className="font-serif text-xl font-bold text-white tracking-tight">Library System</span>
        </div>
      </div>
      
      <div className="flex items-center gap-8 text-natural-text">
        <div className="flex items-center bg-white/15 p-1 rounded-full text-[10px] font-black uppercase tracking-wider">
           <button 
              onClick={() => onSettleAdmin(false)}
              className={cn(
                "px-4 py-1.5 rounded-full transition-all", 
                !isAdminView ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-white/80 hover:text-white"
              )}
            >
              Public Catalog
            </button>
            <button 
              onClick={() => onSettleAdmin(true)}
              className={cn(
                "px-4 py-1.5 rounded-full transition-all", 
                isAdminView ? "bg-zera-yellow text-zera-emerald shadow-sm" : "text-white/80 hover:text-white"
              )}
            >
              Librarian Dashboard
            </button>
        </div>

        <div className="flex items-center gap-3 ml-4">
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-white leading-none">{profile.name}</p>
                <p className="text-[9px] font-bold text-zera-yellow mt-1 uppercase tracking-widest">{profile.role}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 hover:bg-white/15 text-white rounded-full transition-colors"
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
const OPAC = ({ onOpenAuth }: { onOpenAuth: () => void }) => {
  const [activeTab, setActiveTab] = useState<'books' | 'resources' | 'charter' | 'portal'>('books');

  const tabs = [
    { id: 'books', label: 'Physical Library', desc: 'Browse the catalogue', icon: BookIcon },
    { id: 'resources', label: 'Digital Resources', desc: 'eBooks & databases', icon: Globe },
    { id: 'charter', label: 'School Charter', desc: 'About our school', icon: GraduationCap },
    { id: 'portal', label: 'Member Portal', desc: 'Your borrowing account', icon: User },
  ];

  return (
    <main className="relative max-w-7xl mx-auto px-6 py-8 md:py-0 md:h-[calc(100vh-104px)] md:overflow-hidden">
      {/* Soft ambient Zera-green background */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-zera-emerald/[0.06] via-transparent to-zera-emerald/[0.06]" />
        <div className="absolute -top-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-zera-emerald/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] rounded-full bg-zera-emerald-light/10 blur-3xl" />
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-8 md:h-full md:py-8">
        {/* Vertical navigation — Zera green sidebar on the left. It lives outside
            the scrolling column below, so it stays frozen while content scrolls. */}
        <nav className="w-full md:w-64 shrink-0 md:h-full flex flex-col bg-zera-emerald text-white rounded-3xl shadow-xl border-b-4 border-zera-emerald-dark overflow-hidden">
          {/* Sidebar header */}
          <div className="px-5 pt-6 pb-4 border-b border-white/10">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zera-yellow">Zera International</p>
            <h2 className="text-lg font-serif font-black text-white mt-1 leading-tight">Library Catalog</h2>
          </div>

          {/* Nav items */}
          <div className="flex flex-col gap-1.5 p-3">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left cursor-pointer",
                    active
                      ? "bg-zera-yellow text-zera-emerald shadow-md"
                      : "text-white/85 hover:bg-white/10"
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors",
                    active ? "bg-zera-emerald/10 text-zera-emerald" : "bg-white/10 text-white group-hover:bg-white/15"
                  )}>
                    <tab.icon className="w-4 h-4" />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-widest leading-tight">{tab.label}</span>
                    <span className={cn(
                      "text-[10px] font-medium leading-tight mt-0.5 truncate",
                      active ? "text-zera-emerald/70" : "text-white/50"
                    )}>{tab.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sidebar footer */}
          <div className="mt-auto px-5 pt-3 pb-4 border-t border-white/10 flex flex-col items-center gap-2">
            <img
              src="/brand/acorn-mascot.png"
              alt="Zera acorn mascot reading a book"
              className="w-24 h-auto object-contain drop-shadow"
            />
            <p className="text-[10px] font-bold text-white/60 leading-relaxed text-center">
              <span className="text-zera-yellow">"</span>From a seed to a mighty tree.<span className="text-zera-yellow">"</span>
            </p>
          </div>
        </nav>

        {/* Active tab content — the only scrolling region on desktop */}
        <div className="flex-1 min-w-0 w-full md:h-full md:overflow-y-auto md:pr-2 custom-scrollbar">
          {/* Hero banner */}
          <header className="relative overflow-hidden rounded-3xl border border-natural-border/40 bg-white/70 backdrop-blur-sm shadow-sm px-6 pt-2 pb-3 md:px-9 md:pt-3 md:pb-4 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="absolute top-0 left-0 h-full w-1.5 bg-gradient-to-b from-zera-emerald to-zera-yellow" />
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-black tracking-tight leading-none bg-gradient-to-r from-zera-emerald via-zera-emerald-light to-zera-yellow bg-clip-text text-transparent">
                LibraryHub
              </h1>
              <ZeraLogo className="h-24 md:h-32 -ml-2" />
            </div>
            <div className="flex items-center justify-center gap-3 -mt-6 flex-wrap">
              <img
                src="/brand/acorn-reading.png"
                alt="Zera acorn reading a book"
                className="w-12 h-12 md:w-14 md:h-14 object-contain shrink-0"
              />
              <p className="text-sm text-natural-muted font-medium tracking-wide italic leading-relaxed text-center">
                "From a seed to a mighty tree." &mdash; Finest education for all.
              </p>
            </div>
          </header>

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
              {activeTab === 'charter' && <BrandCharter />}
              {activeTab === 'portal' && <MemberPortal onOpenAuth={onOpenAuth} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

const AdminPanel = () => {
  const { profile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'catalog' | 'circulation' | 'holds' | 'inventory' | 'stocktake' | 'students' | 'teachers' | 'resources' | 'acquisition' | 'reports' | 'barcodes'>('dashboard');
  const pendingHolds = usePendingHoldsCount(true);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'catalog', label: 'Catalogue', icon: BookOpen },
    { id: 'circulation', label: 'Circulation', icon: BarChart },
    { id: 'holds', label: 'Hold Requests', icon: Bookmark, badge: pendingHolds },
    { id: 'inventory', label: 'Inventory Audit', icon: BookMarked },
    { id: 'stocktake', label: 'Teacher Stocktake', icon: ClipboardCheck },
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
      <aside className="w-64 bg-natural-nav border-r border-natural-border p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="mb-2 px-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-natural-muted italic">Library Management</p>
        </div>
        
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            {menuItems.map((item) => (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all group cursor-pointer",
                  activeTab === item.id 
                    ? "bg-zera-yellow text-zera-emerald-dark shadow-md" 
                    : "text-natural-muted hover:bg-zera-emerald/10 hover:text-zera-emerald"
                )}
              >
                <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-zera-emerald-dark" : "text-natural-muted group-hover:text-zera-emerald")} />
                <span className="flex-1 text-left">{item.label}</span>
                {'badge' in item && item.badge > 0 && (
                  <span className="ml-auto min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black shadow-sm">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 shrink-0 pt-4 border-t border-natural-border/30">
          {profile && (
            <div className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-natural-border shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-zera-yellow flex items-center justify-center text-zera-emerald-dark font-black text-sm select-none shrink-0 uppercase shadow-inner">
                  {profile.name ? profile.name.charAt(0) : 'A'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-natural-text truncate leading-tight" title={profile.name}>{profile.name}</p>
                  <p className="text-[9px] font-bold text-zera-emerald uppercase tracking-widest mt-0.5">{profile.role || 'Librarian'}</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="p-1.5 hover:bg-red-50 text-red-500 rounded-xl transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

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
            {activeTab === 'holds' && <HoldRequests />}
            {activeTab === 'students' && <UserManagement key="students" roleFilter="student" />}
            {activeTab === 'teachers' && <UserManagement key="teachers" roleFilter="teacher" />}
            {activeTab === 'resources' && <OnlineResources />}
            {activeTab === 'acquisition' && <Acquisition />}
            {activeTab === 'reports' && <Reports />}
            {activeTab === 'inventory' && <InventoryAudit />}
            {activeTab === 'stocktake' && <TeacherStocktake />}
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
          {isAdminView && profile?.role === 'admin' ? (
            <AdminPanel />
          ) : (
            <OPAC onOpenAuth={() => {
              setAuthMode('login');
              setIsAuthModalOpen(true);
            }} />
          )}
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
          <span>© Zera Education System</span>
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
