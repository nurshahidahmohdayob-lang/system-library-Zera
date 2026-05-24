import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  DollarSign, 
  Package, 
  Clock,
  ExternalLink,
  ChevronRight,
  Edit2,
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface AcquisitionItem {
  id: string;
  title: string;
  author: string;
  isbn: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'ordered' | 'received';
  price: number;
  priority: 'high' | 'medium' | 'low';
  createdAt?: any;
  updatedAt?: any;
}

export const Acquisition: React.FC = () => {
  const [items, setItems] = useState<AcquisitionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<AcquisitionItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    author: '',
    isbn: '',
    requestedBy: '',
    status: 'pending' as const,
    price: 0,
    priority: 'medium' as const
  });

  useEffect(() => {
    const q = query(collection(db, 'acquisitions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AcquisitionItem[];
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore loading error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (item?: AcquisitionItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        title: item.title,
        author: item.author,
        isbn: item.isbn,
        requestedBy: item.requestedBy,
        status: item.status,
        price: item.price,
        priority: item.priority
      });
    } else {
      setEditingItem(null);
      setFormData({
        title: '',
        author: '',
        isbn: '',
        requestedBy: '',
        status: 'pending',
        price: 0,
        priority: 'medium'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'acquisitions', editingItem.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'acquisitions'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      setSaving(false);
      setEditingItem(null);
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save record.");
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'acquisitions', id));
      setConfirmDeleteId(null);
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete record.");
    }
  };

  const stats = [
    { label: 'Pending Requests', value: items.filter(i => i.status === 'pending').length.toString(), icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Total Budget Used', value: `$${items.reduce((acc, curr) => acc + curr.price, 0).toLocaleString()}`, icon: DollarSign, color: 'text-zera-emerald', bg: 'bg-zera-emerald/10' },
    { label: 'Received Items', value: `${items.filter(i => i.status === 'received').length} Items`, icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end pb-6 border-b border-natural-border gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-natural-text">Acquisition Desk</h2>
          <p className="text-natural-muted font-medium">Manage book requests, purchase orders and new stock inventory.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-zera-emerald text-white rounded-full text-sm font-bold hover:bg-zera-emerald/90 shadow-md transition-all uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" /> New Acquisition Request
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-natural-border shadow-sm">
            <div className={cn("p-3 rounded-2xl inline-flex mb-4", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <p className="text-2xl font-bold text-natural-text">{stat.value}</p>
            <p className="text-xs font-bold text-natural-muted uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-natural-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-natural-border bg-natural-bg/30">
          <h3 className="font-bold text-natural-text">Acquisition Pipeline</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4 text-natural-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="font-medium">Loading acquisition data...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-4 text-natural-muted grayscale opacity-50">
              <ShoppingCart className="w-12 h-12" />
              <p className="font-medium italic">No acquisition requests found.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left min-w-[800px]">
              <thead className="bg-natural-bg/50 text-[10px] uppercase font-bold text-natural-muted tracking-widest border-b border-natural-border">
                <tr>
                  <th className="px-6 py-4">Title & ISBN</th>
                  <th className="px-6 py-4">Requested By</th>
                  <th className="px-6 py-4">Priority</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-natural-bg">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-natural-bg/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-natural-text">{item.title}</div>
                      <div className="text-[10px] font-mono text-natural-muted leading-tight mt-1">{item.isbn || 'NO ISBN'}</div>
                    </td>
                    <td className="px-6 py-4 text-natural-muted font-medium">{item.requestedBy}</td>
                    <td className="px-6 py-4">
                      <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest",
                        item.priority === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                        item.priority === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-green-50 text-green-600 border border-green-100'
                      )}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-natural-text text-lg">${item.price}</td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                         <div className={cn("w-2 h-2 rounded-full", 
                            item.status === 'pending' ? 'bg-amber-500' :
                            item.status === 'approved' ? 'bg-blue-500' :
                            item.status === 'ordered' ? 'bg-purple-500 animate-pulse' : 'bg-zera-emerald'
                         )}></div>
                         <span className="text-[10px] font-bold uppercase tracking-wider text-natural-muted">{item.status}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenModal(item)}
                          className="p-2 hover:bg-zera-yellow/20 hover:text-zera-emerald rounded-xl text-natural-muted transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className={cn(
                            "p-2 rounded-xl transition-all flex items-center gap-2",
                            confirmDeleteId === item.id 
                               ? "bg-red-500 text-white animate-pulse" 
                               : "text-natural-muted hover:bg-red-50 hover:text-red-500"
                          )}
                          title={confirmDeleteId === item.id ? "Click again to confirm" : "Remove"}
                        >
                          <Trash2 className="w-4 h-4" />
                          {confirmDeleteId === item.id && <span className="text-[10px] font-black uppercase tracking-tighter">Confirm?</span>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal for Add/Edit */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-natural-text/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-natural-border"
            >
              <div className="p-8 border-b border-natural-border flex justify-between items-center bg-natural-bg/20">
                <div>
                  <h3 className="text-xl font-serif font-bold text-natural-text">
                    {editingItem ? 'Edit Acquisition Request' : 'New Acquisition Request'}
                  </h3>
                  <p className="text-xs font-medium text-natural-muted">Fill in the details for the new book acquisition.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white rounded-full transition-colors text-natural-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Book Title</label>
                    <input 
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      placeholder="e.g. Clean Code"
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald focus:border-transparent outline-none transition-all font-medium text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Author</label>
                    <input 
                      type="text"
                      value={formData.author}
                      onChange={(e) => setFormData({...formData, author: e.target.value})}
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">ISBN</label>
                    <input 
                      type="text"
                      value={formData.isbn}
                      onChange={(e) => setFormData({...formData, isbn: e.target.value})}
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Price (USD)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-natural-muted" />
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                        className="w-full pl-10 pr-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Requested By</label>
                    <input 
                      required
                      type="text"
                      value={formData.requestedBy}
                      onChange={(e) => setFormData({...formData, requestedBy: e.target.value})}
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Priority</label>
                    <select 
                      value={formData.priority}
                      onChange={(e) => setFormData({...formData, priority: e.target.value as any})}
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm appearance-none"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>
                   <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-natural-muted block ml-1">Status</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-5 py-3 bg-natural-bg/50 border border-natural-border rounded-xl focus:ring-2 focus:ring-zera-emerald outline-none transition-all font-medium text-sm appearance-none"
                    >
                      <option value="pending">Pending Review</option>
                      <option value="approved">Approved</option>
                      <option value="ordered">Ordered</option>
                      <option value="received">Received</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 font-bold text-xs uppercase tracking-widest text-natural-muted hover:bg-natural-bg rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={saving}
                    type="submit"
                    className="px-10 py-3 bg-zera-emerald text-white rounded-xl text-xs font-black shadow-lg hover:bg-zera-emerald-dark transition-all uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    {saving ? 'Processing...' : (editingItem ? 'Update Request' : 'Submit Request')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
