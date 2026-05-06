import { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import { User, Mail, ShieldCheck, Map, Sprout, Save, Loader2, LogOut, Globe, Info, Layout, Layers, Wind } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import { motion } from "motion/react";

export default function Profile() {
  const { user, profile, updateProfile, logout } = useAuth();
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || "",
    farmDetails: profile?.farmDetails || "",
    preferredLanguage: profile?.preferredLanguage || "English"
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [stats, setStats] = useState({ plots: 0, reports: 0 });

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;
      const fieldsPath = `users/${user.uid}/fields`;
      try {
        const fieldsSnap = await getDocs(collection(db, "users", user.uid, "fields"));
        const reportsSnap = await getDocs(collection(db, "users", user.uid, "soil_reports"));
        setStats({
          plots: fieldsSnap.size,
          reports: reportsSnap.size
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, fieldsPath);
      }
    }
    fetchStats();
  }, [user]);

  const languages = [
    "English", "Hindi", "Punjabi", "Marathi", "Tamil", "Telugu", "Kannada", "Bengali", "Gujarati"
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    try {
      await updateProfile(formData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 pb-24 md:pb-12 pt-4">
      {/* Bento Header Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Profile Identity Card */}
        <div className="lg:col-span-2 bento-card bg-zinc-900 text-white p-8 md:p-10 relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-8">
           <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
           
           <div className="relative z-10">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} referrerPolicy="no-referrer" className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white/10 shadow-2xl object-cover" />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-teal-600 flex items-center justify-center border-4 border-white/10 shadow-2xl">
                  <User size={48} />
                </div>
              )}
           </div>

           <div className="relative z-10 flex-1 text-center md:text-left">
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-teal-500/20 text-teal-400 px-3 py-1 rounded-full">Validated User</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/5 text-white/50 px-3 py-1 rounded-full flex items-center gap-1">
                  <Globe size={10} /> {formData.preferredLanguage}
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2 leading-tight">
                {profile?.displayName || "Guardian of Land"}
              </h1>
              <p className="text-zinc-400 font-bold flex items-center justify-center md:justify-start gap-2">
                <Mail size={16} /> {profile?.email}
              </p>
           </div>
        </div>

        {/* Stats Bento */}
        <div className="bento-card bg-white p-8 flex flex-col justify-between overflow-hidden relative">
           <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-zinc-50 rounded-full -z-0"></div>
           
           <div className="relative z-10">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-6">Agriculture Impact</h3>
              <div className="space-y-6">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center">
                       <Layers size={24} />
                    </div>
                    <div>
                       <p className="text-2xl font-black text-zinc-900">{stats.plots}</p>
                       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Mapped Plots</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                       <ShieldCheck size={24} />
                    </div>
                    <div>
                       <p className="text-2xl font-black text-zinc-900">{stats.reports}</p>
                       <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Health Audits</p>
                    </div>
                 </div>
              </div>
           </div>
           
           <div className="mt-8 relative z-10 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 italic text-[11px] font-medium text-zinc-500">
             "The best fertilizer is the farmer's shadow."
           </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
         {/* Identity Section */}
         <div className="bento-card bg-white p-8 md:p-10 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-8">
               <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center">
                  <User className="text-zinc-500" size={20} />
               </div>
               <h2 className="text-xl font-black text-zinc-900">Vault Configuration</h2>
            </div>

            <div className="space-y-6 flex-1">
               <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-2">Public Alias</label>
                 <input 
                   type="text" 
                   value={formData.displayName}
                   onChange={e => setFormData({...formData, displayName: e.target.value})}
                   className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 focus:border-teal-500 outline-none font-black text-zinc-800 transition-all"
                   placeholder="Your public name..."
                 />
               </div>

               <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 ml-2">Native Communication</label>
                 <div className="relative">
                   <select 
                     value={formData.preferredLanguage}
                     onChange={e => setFormData({...formData, preferredLanguage: e.target.value})}
                     className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl px-6 py-4 focus:border-teal-500 outline-none font-black text-zinc-800 appearance-none transition-all cursor-pointer"
                   >
                     {languages.map(lang => (
                       <option key={lang} value={lang}>{lang}</option>
                     ))}
                   </select>
                   <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                     <Globe size={18} />
                   </div>
                 </div>
               </div>
            </div>

            <div className="mt-10 pt-8 border-t border-zinc-50 flex flex-wrap gap-4">
               <button 
                 type="submit"
                 disabled={loading}
                 className="flex-1 min-w-[200px] px-8 py-5 bg-teal-600 text-white rounded-[24px] font-black uppercase tracking-widest hover:bg-zinc-900 transition-all flex items-center justify-center gap-3 shadow-xl shadow-teal-600/20 active:scale-95 disabled:opacity-50"
               >
                 {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                 {loading ? "Syncing..." : "Update Vault"}
               </button>
               
               {success && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 text-teal-600 font-black text-[10px] uppercase tracking-widest bg-teal-50 px-6 py-4 rounded-[24px]">
                  <ShieldCheck size={16} />
                  Done
                </motion.div>
              )}
            </div>
         </div>

         {/* Agricultural Context Bento */}
         <div className="bento-card bg-white p-8 md:p-10 flex flex-col h-full group">
            <div className="flex items-center gap-3 mb-8">
               <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-12">
                  <Sprout size={20} />
               </div>
               <h2 className="text-xl font-black text-zinc-900">Environmental Context</h2>
            </div>
            
            <p className="text-zinc-400 font-bold mb-6 text-sm leading-relaxed">
              Define your local environment parameters. This enables the AI to provide surgically accurate localized suggestions.
            </p>

            <div className="space-y-6 flex-1">
               <div className="relative">
                  <div className="absolute top-4 left-6 text-teal-500/20 pointer-events-none -z-0">
                    <Wind size={64} />
                  </div>
                  <textarea 
                    rows={8}
                    value={formData.farmDetails}
                    onChange={e => setFormData({...formData, farmDetails: e.target.value})}
                    placeholder="Describe your soil (Sandy, Clay, Loamy), typical climate (Arid, Tropical), and general terrain layout..."
                    className="relative z-10 w-full bg-zinc-50/50 border-2 border-zinc-100 rounded-3xl px-8 py-8 focus:border-teal-500 outline-none resize-none font-bold text-zinc-700 leading-safe transition-all h-[300px]"
                  />
               </div>
            </div>

            <button 
              type="button"
              onClick={() => logout()}
              className="mt-8 w-full px-8 py-5 text-zinc-400 font-bold uppercase tracking-widest hover:text-red-500 hover:bg-red-50 rounded-[24px] transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={20} />
              Terminate Session
            </button>
         </div>
      </form>
    </div>
  );
}
