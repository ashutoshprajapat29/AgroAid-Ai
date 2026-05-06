import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firebaseUtils";
import { useAuth } from "../lib/AuthContext";
import { 
  MapPin, 
  Layers, 
  Plus, 
  Trash2, 
  Maximize2, 
  Edit2, 
  X, 
  FlaskConical, 
  Calendar, 
  Thermometer,
  Info,
  Globe,
  Sprout,
  Loader2,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import PlotMap from "./PlotMap";
import SoilHealthChart from "./SoilHealthChart";

export interface Field {
  id: string;
  name: string;
  area: number;
  unit: string;
  soilType?: string;
  location?: string;
  description?: string;
  currentCrop?: string;
  variety?: string;
  plantingDate?: string;
  previousSprays?: string;
  irrigationTimings?: string;
  otherDetails?: string;
}

export interface SoilReport {
  id: string;
  testDate: string;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  organicCarbon: number | null;
  otherNotes?: string;
  fieldId?: string;
}

function SoilMetric({ label, value, max, color, unit = '' }: { label: string, value: number | null, max: number, color: string, unit?: string }) {
  const percentage = value ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
        <span className="text-xs font-black text-zinc-900">{value || '-'}{unit}</span>
      </div>
      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color} rounded-full`}
        />
      </div>
    </div>
  );
}

export default function FieldManager() {
  const { user, profile } = useAuth();
  
  const [fields, setFields] = useState<Field[]>([]);
  const [reports, setReports] = useState<SoilReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Field Form State
  const [isAddingField, setIsAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldFormData, setFieldFormData] = useState({
    name: '',
    area: '',
    unit: 'Acres',
    soilType: '',
    location: '',
    description: '',
    currentCrop: '',
    variety: '',
    plantingDate: '',
    previousSprays: '',
    irrigationTimings: '',
    otherDetails: ''
  });

  // Soil Form State
  const [isAddingSoil, setIsAddingSoil] = useState(false);
  const [editingSoilId, setEditingSoilId] = useState<string | null>(null);
  const [activeFieldForSoil, setActiveFieldForSoil] = useState<string | null>(null);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [deletingSoilId, setDeletingSoilId] = useState<string | null>(null);
  const [assigningReportId, setAssigningReportId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [soilFormData, setSoilFormData] = useState({
    testDate: new Date().toISOString().split('T')[0],
    ph: '',
    nitrogen: '',
    phosphorus: '',
    potassium: '',
    organicCarbon: '',
    otherNotes: ''
  });

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);

    const fieldsPath = `users/${user.uid}/fields`;
    const qFields = query(collection(db, "users", user.uid, "fields"), orderBy("name", "asc"));
    const unsubscribeFields = onSnapshot(qFields, (snapshot) => {
      setFields(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Field)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, fieldsPath);
      setLoading(false);
    });

    const reportsPath = `users/${user.uid}/soil_reports`;
    const qReports = query(collection(db, "users", user.uid, "soil_reports"), orderBy("testDate", "desc"));
    const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
      setReports(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SoilReport)));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, reportsPath);
    });

    return () => {
      unsubscribeFields();
      unsubscribeReports();
    };
  }, [user]);

  // --- Field Handlers ---
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFieldFormData(prev => ({
          ...prev,
          location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        }));
        setIsLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Unable to retrieve your location. Please check permissions.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const fieldData = {
        name: fieldFormData.name,
        area: parseFloat(fieldFormData.area),
        unit: fieldFormData.unit,
        soilType: fieldFormData.soilType || null,
        location: fieldFormData.location || null,
        description: fieldFormData.description || null,
        currentCrop: fieldFormData.currentCrop || null,
        variety: fieldFormData.variety || null,
        plantingDate: fieldFormData.plantingDate || null,
        previousSprays: fieldFormData.previousSprays || null,
        irrigationTimings: fieldFormData.irrigationTimings || null,
        otherDetails: fieldFormData.otherDetails || null
      };
      if (editingFieldId) {
        const fieldPath = `users/${user.uid}/fields/${editingFieldId}`;
        try {
          await updateDoc(doc(db, "users", user.uid, "fields", editingFieldId), {
            ...fieldData,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, fieldPath);
        }
      } else {
        const fieldCollectionPath = `users/${user.uid}/fields`;
        try {
          await addDoc(collection(db, fieldCollectionPath), {
            ...fieldData,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, fieldCollectionPath);
        }
      }
      setIsAddingField(false);
      setEditingFieldId(null);
      setFieldFormData({ name: '', area: '', unit: 'Acres', soilType: '', location: '', description: '', currentCrop: '', variety: '', plantingDate: '', previousSprays: '', irrigationTimings: '', otherDetails: '' });
    } catch (err) {
      console.error(err);
      alert("Failed to save plot.");
    }
  };

  const handleFieldDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    const prevFields = [...fields];
    setFields(fields.filter(f => f.id !== id));
    setDeletingFieldId(null);
    const fieldPath = `users/${user.uid}/fields/${id}`;
    try {
      await deleteDoc(doc(db, "users", user.uid, "fields", id));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, fieldPath);
      setFields(prevFields);
    }
  };

  // --- Soil Handlers ---
  const openSoilModal = (fieldId: string | null, report?: SoilReport) => {
    setActiveFieldForSoil(fieldId);
    if (report) {
      setEditingSoilId(report.id);
      setSoilFormData({
        testDate: report.testDate,
        ph: report.ph?.toString() || '',
        nitrogen: report.nitrogen?.toString() || '',
        phosphorus: report.phosphorus?.toString() || '',
        potassium: report.potassium?.toString() || '',
        organicCarbon: report.organicCarbon?.toString() || '',
        otherNotes: report.otherNotes || ''
      });
    } else {
      setEditingSoilId(null);
      setSoilFormData({
        testDate: new Date().toISOString().split('T')[0],
        ph: '', nitrogen: '', phosphorus: '', potassium: '', organicCarbon: '', otherNotes: ''
      });
    }
    setIsAddingSoil(true);
  };

  const handleAssignReport = async (reportId: string, fieldId: string) => {
    if (!user) return;
    const reportPath = `users/${user.uid}/soil_reports/${reportId}`;
    try {
      const docRef = doc(db, "users", user.uid, "soil_reports", reportId);
      await updateDoc(docRef, { fieldId });
      setAssigningReportId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, reportPath);
      alert("Failed to assign report.");
    }
  };

  const handleSoilSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const reportData = {
        testDate: soilFormData.testDate || new Date().toISOString().split('T')[0],
        fieldId: activeFieldForSoil,
        ph: soilFormData.ph ? parseFloat(soilFormData.ph) : null,
        nitrogen: soilFormData.nitrogen ? parseFloat(soilFormData.nitrogen) : null,
        phosphorus: soilFormData.phosphorus ? parseFloat(soilFormData.phosphorus) : null,
        potassium: soilFormData.potassium ? parseFloat(soilFormData.potassium) : null,
        organicCarbon: soilFormData.organicCarbon ? parseFloat(soilFormData.organicCarbon) : null,
        otherNotes: soilFormData.otherNotes
      };

      if (editingSoilId) {
        const soilReportPath = `users/${user.uid}/soil_reports/${editingSoilId}`;
        try {
          await updateDoc(doc(db, "users", user.uid, "soil_reports", editingSoilId), {
            ...reportData,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, soilReportPath);
        }
      } else {
        const soilCollectionPath = `users/${user.uid}/soil_reports`;
        try {
          await addDoc(collection(db, soilCollectionPath), {
            ...reportData,
            userId: user.uid,
            createdAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, soilCollectionPath);
        }
      }
      setIsAddingSoil(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save soil record.");
    }
  };

  const handleSoilDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    const prevReports = [...reports];
    setReports(reports.filter(r => r.id !== id));
    setDeletingSoilId(null);
    const soilReportPath = `users/${user.uid}/soil_reports/${id}`;
    try {
      await deleteDoc(doc(db, "users", user.uid, "soil_reports", id));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, soilReportPath);
      setReports(prevReports);
    }
  };

  const unassignedReports = useMemo(() => reports.filter(r => !r.fieldId), [reports]);

  return (
    <div className="max-w-7xl mx-auto pb-20 px-4 md:px-0">
      <header className="mb-10 p-10 bento-card border-none bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 text-white shadow-[0_20px_50px_rgba(13,148,136,0.3)] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl group-hover:scale-125 transition-transform duration-1000" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-400/10 rounded-full -ml-32 -mb-32 blur-2xl" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="p-5 bg-white/10 rounded-[32px] backdrop-blur-xl border border-white/20 shadow-inner">
              <Layers size={40} className="text-teal-50" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 leading-tight">Farm Plots & Soil</h1>
              <p className="text-teal-50/80 font-bold tracking-wide flex items-center gap-2">
                <Globe size={16} /> Manage your land segments and track soil health perfectly.
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              setEditingFieldId(null);
              setFieldFormData({ name: '', area: '', unit: 'Acres', soilType: '', location: '', description: '', currentCrop: '', variety: '', plantingDate: '', previousSprays: '', irrigationTimings: '', otherDetails: '' });
              setIsAddingField(true);
            }}
            className="flex items-center justify-center gap-3 bg-white text-teal-800 px-10 py-5 rounded-[28px] font-black hover:bg-teal-50 active:scale-95 transition-all shadow-2xl hover:shadow-white/20"
          >
            <Plus size={24} />
            <span>Map New Plot</span>
          </button>
        </div>
      </header>

      {/* Field Registration Modal */}
      <AnimatePresence>
        {isAddingField && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[100] flex items-start justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl my-8 relative"
            >
              <button onClick={() => setIsAddingField(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-800 bg-zinc-100 rounded-full transition-colors">
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center">
                  <MapPin size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-800">{editingFieldId ? 'Update Plot Details' : 'Map New Plot'}</h2>
                  <p className="text-zinc-500 font-medium text-sm">Define boundaries for targeted soil tracking.</p>
                </div>
              </div>

              <form onSubmit={handleFieldSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Plot Name / Identifier*</label>
                    <input type="text" required value={fieldFormData.name} onChange={e => setFieldFormData({...fieldFormData, name: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. North Field" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Area Size*</label>
                    <input type="number" step="0.01" required value={fieldFormData.area} onChange={e => setFieldFormData({...fieldFormData, area: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. 5.5" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Unit*</label>
                    <select required value={fieldFormData.unit} onChange={e => setFieldFormData({...fieldFormData, unit: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium">
                      <option value="Acres">Acres</option><option value="Hectares">Hectares</option><option value="Guntas">Guntas</option><option value="Bighas">Bighas</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Soil Type Baseline</label>
                    <input type="text" value={fieldFormData.soilType} onChange={e => setFieldFormData({...fieldFormData, soilType: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. Black Cotton, Red Loamy" />
                  </div>
                  <div className="md:col-span-2 pt-2 pb-4">
                    <label className="block text-sm font-bold text-zinc-700 mb-4 flex flex-col gap-1">
                      <span className="flex items-center justify-between">
                        Interactive Plot Map
                      </span>
                      <span className="text-xs text-zinc-500 font-medium"><b>Easy Mode:</b> Just tap anywhere on the map to drop a pin at your farm's location.<br/><b>Advanced:</b> Use the polygon tool (right side) to draw the exact boundaries and auto-calculate acreage.</span>
                    </label>
                    <div className="relative z-10 isolate">
                      <PlotMap 
                        initialLocation={fieldFormData.location}
                        onPolygonDrawn={(geoJson, areaAcres, centerLat, centerLng) => {
                          setFieldFormData(prev => ({
                            ...prev,
                            area: areaAcres.toFixed(2),
                            unit: 'Acres',
                            location: geoJson
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 pt-4 border-t border-zinc-100">
                    <h3 className="font-black text-zinc-800 flex items-center gap-2 mb-4"><Sprout className="text-teal-600" size={20}/> Crop & Activity Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-zinc-700 mb-2">Current Crop</label>
                        <input type="text" value={fieldFormData.currentCrop} onChange={e => setFieldFormData({...fieldFormData, currentCrop: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. Tomato" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-zinc-700 mb-2">Variety / Seed Type</label>
                        <input type="text" value={fieldFormData.variety} onChange={e => setFieldFormData({...fieldFormData, variety: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. Roma" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-zinc-700 mb-2">Planting Date</label>
                        <input type="date" value={fieldFormData.plantingDate} onChange={e => setFieldFormData({...fieldFormData, plantingDate: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium text-zinc-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-zinc-700 mb-2">Irrigation Schedule</label>
                        <input type="text" value={fieldFormData.irrigationTimings} onChange={e => setFieldFormData({...fieldFormData, irrigationTimings: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. Every 3 days" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-zinc-700 mb-2">Sprays / Chemicals Applied</label>
                        <textarea value={fieldFormData.previousSprays} onChange={e => setFieldFormData({...fieldFormData, previousSprays: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" rows={2} placeholder="Logs recorded by AI or manually"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-zinc-900 text-white font-black py-4 rounded-xl hover:bg-teal-600 transition-colors shadow-lg active:scale-[0.98]">
                  {editingFieldId ? 'Update Plot Data' : 'Save Plot Profile'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soil Health Modal */}
      <AnimatePresence>
        {isAddingSoil && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-[100] flex items-start justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-3xl shadow-2xl my-8 relative"
            >
              <button onClick={() => setIsAddingSoil(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-800 bg-zinc-100 rounded-full transition-colors">
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <FlaskConical size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-800">{editingSoilId ? 'Update Soil Report' : 'Log Soil Test Results'}</h2>
                  {activeFieldForSoil && <p className="text-indigo-600 font-bold text-sm bg-indigo-50 inline-block px-2 py-1 rounded mt-1">Plot Link: {fields.find(f => f.id === activeFieldForSoil)?.name}</p>}
                </div>
              </div>

              <form onSubmit={handleSoilSubmit} className="space-y-6">
                <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 mb-6">
                  <div className="flex items-start gap-3">
                    <FlaskConical className="text-amber-500 mt-1 shrink-0" size={20} />
                    <p className="text-sm text-amber-800 font-medium">Record the exact metrics from your laboratory soil test. You can also upload photos of your report via the AI Advisor to log this automatically.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">pH Level</label>
                    <input type="number" step="0.1" value={soilFormData.ph} onChange={e => setSoilFormData({...soilFormData, ph: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="e.g. 6.5" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Nitrogen (N)</label>
                    <input type="number" value={soilFormData.nitrogen} onChange={e => setSoilFormData({...soilFormData, nitrogen: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Phosphorus (P)</label>
                    <input type="number" value={soilFormData.phosphorus} onChange={e => setSoilFormData({...soilFormData, phosphorus: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Potassium (K)</label>
                    <input type="number" value={soilFormData.potassium} onChange={e => setSoilFormData({...soilFormData, potassium: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Organic Carbon (%)</label>
                    <input type="number" step="0.01" value={soilFormData.organicCarbon} onChange={e => setSoilFormData({...soilFormData, organicCarbon: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="e.g. 1.2" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Test Date*</label>
                    <input type="date" required value={soilFormData.testDate} onChange={e => setSoilFormData({...soilFormData, testDate: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium text-zinc-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Additional Notes / Deficiencies</label>
                  <textarea value={soilFormData.otherNotes} onChange={e => setSoilFormData({...soilFormData, otherNotes: e.target.value})} className="w-full bg-zinc-50 border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" rows={3} placeholder="Any specific issues (e.g. Zinc deficiency) or recommendations?"></textarea>
                </div>

                <button type="submit" className="w-full bg-zinc-900 text-white font-black py-4 rounded-xl hover:bg-indigo-600 transition-colors shadow-lg active:scale-[0.98]">
                  {editingSoilId ? 'Update Report' : 'Save Report'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && fields.length === 0 && (
        <div className="bento-card bg-white p-20 flex flex-col items-center justify-center text-center shadow-xl border-2 border-dashed border-zinc-100">
          <div className="p-6 bg-teal-50 text-teal-400 rounded-full mb-6">
             <Layers size={64} />
          </div>
          <h3 className="text-2xl font-black text-zinc-800">No Farm Plots Mapped</h3>
          <p className="text-zinc-400 mt-2 max-w-md font-medium">Divide your farm into plots to easily manage soil health history per land segment.</p>
          <button onClick={() => setIsAddingField(true)} className="mt-8 bg-teal-600 text-white px-8 py-4 rounded-[28px] font-black hover:scale-105 transition-all shadow-lg shadow-teal-600/20">
            Start Mapping Now
          </button>
        </div>
      )}

      {/* Main Grid: Farm Plots */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <AnimatePresence>
          {fields.map((field) => {
            const fieldReports = reports.filter(r => r.fieldId === field.id);
            const latestReport = fieldReports.length > 0 ? fieldReports[0] : null;

            return (
              <motion.div 
                key={field.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bento-card bg-white shadow-2xl relative border-l-8 border-teal-600 overflow-hidden flex flex-col"
              >
                {/* Field Details */}
                <div className="p-6 md:p-8 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-black text-zinc-800 tracking-tight">{field.name}</h3>
                      <div className="flex items-center gap-2 text-zinc-500 mt-1">
                        <Maximize2 size={16} className="text-teal-600" />
                        <span className="font-bold tracking-tight capitalize">{field.area} {field.unit}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 relative z-30">
                      <button onClick={(e) => { 
                        e.stopPropagation(); 
                        setEditingFieldId(field.id); 
                        setFieldFormData({
                          name: field.name, 
                          area: String(field.area), 
                          unit: field.unit, 
                          soilType: field.soilType||'', 
                          location: field.location||'', 
                          description: field.description||'',
                          currentCrop: field.currentCrop||'',
                          variety: field.variety||'',
                          plantingDate: field.plantingDate||'',
                          previousSprays: field.previousSprays||'',
                          irrigationTimings: field.irrigationTimings||'',
                          otherDetails: field.otherDetails||''
                        }); 
                        setIsAddingField(true); 
                      }} className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors" title="Edit Plot">
                        <Edit2 size={18} />
                      </button>
                      {deletingFieldId === field.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200 ml-1">
                          <button onClick={(e) => handleFieldDelete(e, field.id)} className="px-2 py-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded">Delete</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletingFieldId(null); }} className="px-2 py-1 text-xs font-bold text-zinc-600 hover:text-zinc-800 bg-white border border-zinc-200 rounded">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletingFieldId(field.id); }} className="p-2 text-zinc-400 hover:text-red-500 transition-colors" title="Delete Plot">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {field.soilType && (
                      <div className="flex items-start gap-3 text-zinc-600">
                        <Layers className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Soil Baseline</p>
                        <p className="font-bold text-sm">{field.soilType}</p></div>
                      </div>
                    )}
                    {field.description && (
                      <div className="flex items-start gap-3 text-zinc-600">
                        <MapPin className="text-blue-500 shrink-0 mt-0.5" size={18} />
                        <div><p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Notes / Location</p>
                        <p className="font-medium text-sm leading-relaxed">{field.description}</p></div>
                      </div>
                    )}
                    
                    {/* Embedded Crop Activity UI */}
                    {(field.currentCrop || field.variety || field.plantingDate || field.previousSprays || field.irrigationTimings) && (
                      <div className="bg-teal-50/50 border border-teal-100 p-4 rounded-2xl mt-4">
                        <div className="flex justify-between items-center mb-3 border-b border-teal-100/50 pb-2">
                           <h4 className="font-black text-teal-800 flex items-center gap-2"><Sprout className="text-teal-600" size={16} /> Crop Activity</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm text-teal-900">
                          {field.currentCrop && <div><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">Crop</span> <span className="font-bold">{field.currentCrop}</span></div>}
                          {field.variety && <div><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">Variety</span> <span className="font-bold">{field.variety}</span></div>}
                          {field.plantingDate && <div><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">Planted</span> <span className="font-bold">{field.plantingDate}</span></div>}
                          {field.irrigationTimings && <div><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">Irrigation</span> <span className="font-bold">{field.irrigationTimings}</span></div>}
                          {field.previousSprays && <div className="col-span-2 mt-1"><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">Sprays & Chemicals</span> <span className="font-medium">{field.previousSprays}</span></div>}
                          {field.otherDetails && <div className="col-span-2 mt-1"><span className="font-black text-[10px] uppercase tracking-widest text-teal-600/70 block mb-0.5">AI Notes</span> <span className="font-medium">{field.otherDetails}</span></div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Integrated Soil Health Panel */}
                <div className="bg-zinc-50 p-6 md:p-8 border-t border-zinc-100">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-black text-zinc-800 flex items-center gap-2 text-lg">
                      <FlaskConical className="text-indigo-600" size={20} /> Soil Health
                    </h4>
                    <button 
                      onClick={() => openSoilModal(field.id, latestReport || undefined)} 
                      className={`text-sm font-bold ${latestReport ? 'text-teal-600 bg-teal-50 hover:bg-teal-100' : 'text-indigo-600 bg-indigo-100 hover:bg-indigo-200'} px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1`}
                    >
                      {latestReport ? <Database size={16}/> : <Plus size={16}/>}
                      {latestReport ? 'Update Health' : 'Add Audit'}
                    </button>
                  </div>
                  
                  {latestReport ? (
                     <div className="space-y-4">
                        {/* Display Latest Data Card */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-zinc-200/50 relative group/soil">
                           <div className="absolute top-6 right-6 flex gap-2 z-30 opacity-0 group-hover/soil:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); openSoilModal(field.id, latestReport); }} className="p-2.5 bg-zinc-50 text-zinc-400 hover:text-indigo-600 rounded-xl transition-colors"><Edit2 size={16} /></button>
                              {deletingSoilId === latestReport.id ? (
                                <div className="flex items-center gap-1 bg-red-50 p-1.5 rounded-xl border border-red-100">
                                  <button onClick={(e) => handleSoilDelete(e, latestReport.id)} className="px-3 py-1.5 text-[10px] font-black text-white bg-red-500 rounded-lg uppercase tracking-tight">Delete</button>
                                  <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(null); }} className="px-3 py-1.5 text-[10px] font-black text-zinc-500 bg-white border border-zinc-200 rounded-lg uppercase tracking-tight">Cancel</button>
                                </div>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(latestReport.id); }} className="p-2.5 bg-zinc-50 text-zinc-400 hover:text-red-500 rounded-xl transition-colors"><Trash2 size={16} /></button>
                              )}
                           </div>
                           <div className="flex items-center gap-3 mb-8">
                             <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                               <Calendar size={18} />
                             </div>
                             <div>
                               <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Analysis Date</p>
                               <p className="text-sm font-black text-zinc-800">{new Date(latestReport.testDate).toLocaleDateString()}</p>
                             </div>
                           </div>
                           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6 pt-4">
                             <SoilMetric label="pH Level" value={latestReport.ph} max={14} color="bg-rose-500" />
                             <SoilMetric label="Nitrogen (N)" value={latestReport.nitrogen} max={100} color="bg-emerald-500" unit="mg" />
                             <SoilMetric label="Phosphorus (P)" value={latestReport.phosphorus} max={100} color="bg-blue-500" unit="mg" />
                             <SoilMetric label="Potassium (K)" value={latestReport.potassium} max={100} color="bg-amber-500" unit="mg" />
                           </div>
                           {latestReport.otherNotes && (
                             <div className="mt-8 pt-6 border-t border-zinc-50">
                               <div className="flex items-start gap-3">
                                 <Info size={16} className="text-zinc-300 mt-0.5" />
                                 <p className="text-sm font-medium text-zinc-500 leading-relaxed italic">“{latestReport.otherNotes}”</p>
                               </div>
                             </div>
                           )}
                        </div>
                        
                        {/* History Chart if > 1 */}
                        {fieldReports.length > 1 && (
                          <SoilHealthChart data={fieldReports} />
                        )}
                     </div>
                  ) : (
                    <div className="bg-white/60 border border-dashed border-zinc-300 rounded-2xl p-6 text-center">
                      <p className="text-sm font-medium text-zinc-500 mb-3">No soil lab tests recorded for this plot.</p>
                      <button onClick={() => openSoilModal(field.id)} className="text-xs font-black uppercase tracking-widest text-zinc-800 bg-zinc-200 hover:bg-zinc-300 px-4 py-2 rounded-full transition-colors">
                        Add First Record
                      </button>
                    </div>
                  )}
                </div>

              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {unassignedReports.length > 0 && (
         <div className="mt-20 border-t border-zinc-200 pt-10">
            <div className="flex items-center justify-between mb-8">
               <div>
                  <h3 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3">
                    <FlaskConical className="text-orange-500" size={32} /> Soil Analytics Intake
                  </h3>
                  <p className="text-zinc-500 font-medium">Reports captured via AI conversation. Please link these to their respective plots.</p>
               </div>
               <div className="bg-orange-100 text-orange-700 px-4 py-2 rounded-2xl font-black text-sm border border-orange-200">
                 {unassignedReports.length} Pending
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {unassignedReports.map(report => (
                <div key={report.id} className="bg-white rounded-2xl p-6 shadow-xl border border-zinc-100 relative group">
                   <div className="absolute top-4 right-4 flex gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openSoilModal(null, report); }} className="p-2 text-zinc-400 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                      {deletingSoilId === report.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg">
                          <button onClick={(e) => handleSoilDelete(e, report.id)} className="px-2 py-1 text-xs font-bold text-white bg-red-500 rounded">Delete</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(null); }} className="px-2 py-1 text-xs font-bold text-zinc-600 bg-white rounded">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(report.id); }} className="p-2 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                      )}
                   </div>
                   <div className="flex items-center gap-2 mb-4">
                     <Calendar size={16} className="text-indigo-500"/>
                     <span className="text-sm font-black text-zinc-800">{new Date(report.testDate).toLocaleDateString()}</span>
                   </div>
                   <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">pH</span><span className="font-black text-rose-500">{report.ph || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">N</span><span className="font-black text-emerald-600">{report.nitrogen || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">P</span><span className="font-black text-blue-600">{report.phosphorus || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">K</span><span className="font-black text-amber-600">{report.potassium || '-'}</span></div>
                   </div>
                   {report.otherNotes && <p className="text-xs text-zinc-500 mb-4">{report.otherNotes}</p>}

                   <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
                     {assigningReportId === report.id ? (
                        <div className="flex-1 animate-in slide-in-from-bottom-2 duration-300">
                          <select 
                            onChange={(e) => handleAssignReport(report.id, e.target.value)}
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-teal-500"
                            defaultValue=""
                          >
                            <option value="" disabled>Link to Plot...</option>
                            {fields.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <button 
                            onClick={() => setAssigningReportId(null)}
                            className="w-full mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-400"
                          >
                            Cancel
                          </button>
                        </div>
                     ) : (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Action Required</span>
                          <button 
                            onClick={() => setAssigningReportId(report.id)}
                            className="bg-zinc-900 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-teal-600 transition-colors flex items-center gap-1 shadow-lg shadow-zinc-900/10"
                          >
                            Assign to Plot
                          </button>
                        </>
                     )}
                   </div>
                </div>
              ))}
            </div>
         </div>
      )}

    </div>
  );
}
