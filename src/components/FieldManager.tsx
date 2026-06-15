import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
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
  Database,
  MessageSquare,
  Bot,
  ChevronLeft,
  Leaf,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import PlotMap from "./PlotMap";
import SoilHealthChart from "./SoilHealthChart";
import { useLanguage } from "../lib/LanguageContext";
import FarmingAdvisor from "./FarmingAdvisor";
import { useBackButton } from "../hooks/useBackButton";

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
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">{label}</span>
        <span className="text-xs font-black text-[var(--text-main)]">{value || '-'}{unit}</span>
      </div>
      <div className="h-1.5 w-full bg-[var(--bg-hover)] rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color} rounded-full`}
        />
      </div>
    </div>
  );
}

const parseNumberSafe = (val: string): number | null => {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
};

export default function FieldManager() {
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  
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

  // Detail Modal & General AI
  const [selectedPlotForDetail, setSelectedPlotForDetail] = useState<Field | null>(null);
  const [detailTab, setDetailTab] = useState<'details' | 'advisor'>('details');
  const [showGeneralAI, setShowGeneralAI] = useState(false);
  const [prefilledAdvisorQuery, setPrefilledAdvisorQuery] = useState("");
  const [isTrendsOpen, setIsTrendsOpen] = useState(false);

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

  // Handle hardware/browser back button for modals
  useBackButton(!!selectedPlotForDetail, () => setSelectedPlotForDetail(null), 'plotDetail');
  useBackButton(showGeneralAI, () => setShowGeneralAI(false), 'generalAI');
  useBackButton(isAddingField, () => setIsAddingField(false), 'addingField');
  useBackButton(isAddingSoil, () => setIsAddingSoil(false), 'addingSoil');

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
      alert(t("plots.error_geolocation_unsupported"));
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
        alert(t("plots.error_location_retrieve"));
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const area = parseFloat(fieldFormData.area);
      if (isNaN(area) || area <= 0) {
        alert(t("plots.error_invalid_area"));
        return;
      }

      const fieldData = {
        name: fieldFormData.name,
        area: area,
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
          throw err;
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
          throw err;
        }
      }
      setIsAddingField(false);
      setEditingFieldId(null);
      setFieldFormData({ name: '', area: '', unit: 'Acres', soilType: '', location: '', description: '', currentCrop: '', variety: '', plantingDate: '', previousSprays: '', irrigationTimings: '', otherDetails: '' });
    } catch (err) {
      console.error(err);
      alert(t("plots.error_save_failed"));
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
      alert(t("plots.error_assign_failed"));
    }
  };

  const handleSoilSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const ph = parseNumberSafe(soilFormData.ph);
      if (ph !== null && (ph < 0 || ph > 14)) {
        alert(t("plots.error_invalid_ph"));
        return;
      }
      const nitrogen = parseNumberSafe(soilFormData.nitrogen);
      if (nitrogen !== null && nitrogen < 0) {
        alert(t("plots.error_negative_nitrogen"));
        return;
      }
      const phosphorus = parseNumberSafe(soilFormData.phosphorus);
      if (phosphorus !== null && phosphorus < 0) {
        alert(t("plots.error_negative_phosphorus"));
        return;
      }
      const potassium = parseNumberSafe(soilFormData.potassium);
      if (potassium !== null && potassium < 0) {
        alert(t("plots.error_negative_potassium"));
        return;
      }
      const organicCarbon = parseNumberSafe(soilFormData.organicCarbon);
      if (organicCarbon !== null && organicCarbon < 0) {
        alert(t("plots.error_negative_carbon"));
        return;
      }

      const reportData = {
        testDate: soilFormData.testDate || new Date().toISOString().split('T')[0],
        fieldId: activeFieldForSoil,
        ph,
        nitrogen,
        phosphorus,
        potassium,
        organicCarbon,
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
          throw err;
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
          throw err;
        }
      }
      setIsAddingSoil(false);
    } catch (err) {
      console.error(err);
      alert(t("plots.error_save_soil_failed"));
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

  const totalAreaSummary = useMemo(() => {
    if (fields.length === 0) return "0 Plots";
    const totals: Record<string, number> = {};
    fields.forEach(f => {
      const areaVal = Number(f.area) || 0;
      totals[f.unit] = (totals[f.unit] || 0) + areaVal;
    });
    return Object.entries(totals)
      .map(([unit, val]) => `${val.toFixed(1)} ${unit}`)
      .join(", ");
  }, [fields]);

  return (
    <div className="max-w-7xl mx-auto pb-20 px-4 md:px-0">
      
      {/* Bento Grid Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 animate-fade-in">
        {/* Bento Card 2: Interactive 'Map New Plot' CTA */}
        <div 
          onClick={() => {
            setEditingFieldId(null);
            setFieldFormData({ name: '', area: '', unit: 'Acres', soilType: '', location: '', description: '', currentCrop: '', variety: '', plantingDate: '', previousSprays: '', irrigationTimings: '', otherDetails: '' });
            setIsAddingField(true);
          }}
          className="col-span-1 bg-gradient-to-br from-teal-500 to-emerald-700 hover:from-teal-400 hover:to-emerald-600 text-white p-6 rounded-2xl cursor-pointer shadow-lg shadow-teal-500/10 flex flex-col justify-between hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative group overflow-hidden border border-teal-400/20"
        >
          <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
          <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center shadow-inner">
            <Plus size={20} className="text-white" />
          </div>
          <div className="mt-8">
            <h3 className="text-lg font-black leading-tight flex items-center gap-1.5">
              {t("plots.map_new")} <span className="group-hover:translate-x-1 transition-transform">→</span>
            </h3>
            <p className="text-[10px] text-teal-50/80 font-medium mt-1">
              {t("Hindi") === "Hindi" ? "नक्शे पर कस्टम सीमाएं खींचकर एकर का स्वचालित अनुमान लगाएं।" : "Draw custom polygon boundaries on map to auto-calculate acreage."}
            </p>
          </div>
        </div>

        {/* Bento Card 1: Interactive Land Summary */}
        <div className="col-span-1 md:col-span-2 bg-[var(--bg-card)] border border-[var(--border-input)] p-6 rounded-2xl flex flex-col justify-between shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
          <div>
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest mb-2">
              <Globe size={12} className="text-teal-400" />
              {t("profile.verified_farmer")}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-[var(--text-main)] leading-none mb-1">
              {t("plots.title")}
            </h1>
            <p className="text-xs text-[var(--text-muted)] font-medium">
              {t("plots.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-[var(--border-input)]">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-subtle)] block mb-0.5">{t("profile.total_area")}</span>
              <span className="text-lg font-black text-teal-400 leading-none">
                {totalAreaSummary}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-subtle)] block mb-0.5">{t("profile.health_audits")}</span>
              <span className="text-lg font-black text-indigo-400 leading-none">
                {reports.length} {t("Hindi") === "Hindi" ? "रिपोर्ट" : reports.length === 1 ? 'Report' : 'Reports'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Field Registration Modal */}
      {createPortal(
        <AnimatePresence>
        {isAddingField && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--bg-nav)] backdrop-blur-sm z-[250] flex items-start justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[var(--bg-card)] rounded-3xl p-6 md:p-8 w-full max-w-2xl shadow-2xl my-8 relative"
            >
              <button onClick={() => setIsAddingField(false)} className="absolute top-6 right-6 p-2 text-[var(--text-subtle)] hover:text-[var(--text-main)] bg-[var(--bg-hover)] rounded-full transition-colors" title="Close" aria-label="Close">
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-teal-500/15 text-teal-400 rounded-2xl flex items-center justify-center">
                  <MapPin size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[var(--text-main)]">{editingFieldId ? t('plots.update_details') : t('plots.map_title')}</h2>
                  <p className="text-[var(--text-muted)] font-medium text-sm">{t('plots.map_subtitle')}</p>
                </div>
              </div>

              <form onSubmit={handleFieldSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.plot_name')}*</label>
                    <input type="text" required value={fieldFormData.name} onChange={e => setFieldFormData({...fieldFormData, name: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder={t("Hindi") === "Hindi" ? "जैसे: उत्तर का खेत" : "e.g. North Field"} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.area_size')}*</label>
                    <input type="number" step="0.01" required value={fieldFormData.area} onChange={e => setFieldFormData({...fieldFormData, area: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder="e.g. 5.5" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.unit')}*</label>
                    <select required value={fieldFormData.unit} onChange={e => setFieldFormData({...fieldFormData, unit: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" title="Area unit">
                      <option value="Acres">{t("Hindi") === "Hindi" ? "एकड़ (Acres)" : "Acres"}</option>
                      <option value="Hectares">{t("Hindi") === "Hindi" ? "हेक्टेयर (Hectares)" : "Hectares"}</option>
                      <option value="Guntas">{t("Hindi") === "Hindi" ? "गुंटा (Guntas)" : "Guntas"}</option>
                      <option value="Bighas">{t("Hindi") === "Hindi" ? "बीघा (Bighas)" : "Bighas"}</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.soil_type')}</label>
                    <input type="text" value={fieldFormData.soilType} onChange={e => setFieldFormData({...fieldFormData, soilType: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder={t("Hindi") === "Hindi" ? "जैसे: काली कपास मिट्टी, लाल दोमट" : "e.g. Black Cotton, Red Loamy"} />
                  </div>
                  <div className="md:col-span-2 pt-2 pb-4">
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-4 flex flex-col gap-1">
                      <span className="flex items-center justify-between">
                        {t('plots.interactive_map')}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-medium">
                        <b>{t("Hindi") === "Hindi" ? "आसान तरीका: " : "Easy Mode: "}</b>{t('plots.map_easy')}<br/>
                        <b>{t("Hindi") === "Hindi" ? "उन्नत तरीका: " : "Advanced Mode: "}</b>{t('plots.map_advanced')}
                      </span>
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
                  <div className="md:col-span-2 pt-4 border-t border-[var(--border-input)]">
                    <h3 className="font-black text-[var(--text-main)] flex items-center gap-2 mb-4"><Sprout className="text-teal-600" size={20}/> {t('plots.crop_activity')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.current_crop')}</label>
                        <input type="text" value={fieldFormData.currentCrop} onChange={e => setFieldFormData({...fieldFormData, currentCrop: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder={t("Hindi") === "Hindi" ? "जैसे: टमाटर" : "e.g. Tomato"} />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.variety')}</label>
                        <input type="text" value={fieldFormData.variety} onChange={e => setFieldFormData({...fieldFormData, variety: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder={t("Hindi") === "Hindi" ? "जैसे: रोमा" : "e.g. Roma"} />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.planting_date')}</label>
                        <input type="date" value={fieldFormData.plantingDate} onChange={e => setFieldFormData({...fieldFormData, plantingDate: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium text-[var(--text-muted)]" title="Planting Date" placeholder="Select planting date" />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.irrigation')}</label>
                        <input type="text" value={fieldFormData.irrigationTimings} onChange={e => setFieldFormData({...fieldFormData, irrigationTimings: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" placeholder={t("Hindi") === "Hindi" ? "जैसे: हर 3 दिन में" : "e.g. Every 3 days"} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.sprays')}</label>
                        <textarea value={fieldFormData.previousSprays} onChange={e => setFieldFormData({...fieldFormData, previousSprays: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 font-medium" rows={2} placeholder={t("Hindi") === "Hindi" ? "AI या मैन्युअल रूप से दर्ज किए गए स्प्रे विवरण" : "Logs recorded by AI or manually"}></textarea>
                      </div>
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-teal-600 text-white font-black py-4 rounded-xl hover:bg-teal-700 transition-colors shadow-lg active:scale-[0.98]">
                  {editingFieldId ? t('plots.update_plot') : t('plots.save_plot')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* Soil Health Modal */}
      {createPortal(
        <AnimatePresence>
        {isAddingSoil && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--bg-nav)] backdrop-blur-sm z-[250] flex items-start justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-[var(--bg-card)] rounded-3xl p-6 md:p-8 w-full max-w-3xl shadow-2xl my-8 relative"
            >
              <button onClick={() => setIsAddingSoil(false)} className="absolute top-6 right-6 p-2 text-[var(--text-subtle)] hover:text-[var(--text-main)] bg-[var(--bg-hover)] rounded-full transition-colors" title="Close" aria-label="Close">
                <X size={20} />
              </button>
              
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-500/15 text-indigo-400 rounded-2xl flex items-center justify-center">
                  <FlaskConical size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[var(--text-main)]">{editingSoilId ? t("plots.update_soil") : t("plots.log_soil")}</h2>
                  {activeFieldForSoil && <p className="text-indigo-400 font-bold text-sm bg-indigo-500/10 inline-block px-2 py-1 rounded mt-1">{t("plots.plot_link")}: {fields.find(f => f.id === activeFieldForSoil)?.name}</p>}
                </div>
              </div>

              <form onSubmit={handleSoilSubmit} className="space-y-6">
                <div className="bg-amber-500/10 rounded-2xl p-5 border border-amber-500/20 mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Info size={16} className="text-amber-400 shrink-0" />
                    <p className="text-sm text-[var(--text-main)] font-medium opacity-80">{t("plots.soil_info")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.ph_level')}</label>
                    <input type="number" step="0.01" min="0" max="14" value={soilFormData.ph} onChange={e => setSoilFormData({...soilFormData, ph: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="e.g. 6.5" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.nitrogen')}</label>
                    <input type="number" min="0" value={soilFormData.nitrogen} onChange={e => setSoilFormData({...soilFormData, nitrogen: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.phosphorus')}</label>
                    <input type="number" min="0" value={soilFormData.phosphorus} onChange={e => setSoilFormData({...soilFormData, phosphorus: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.potassium')}</label>
                    <input type="number" min="0" value={soilFormData.potassium} onChange={e => setSoilFormData({...soilFormData, potassium: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="mg/kg" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.organic_carbon')}</label>
                    <input type="number" step="0.01" min="0" value={soilFormData.organicCarbon} onChange={e => setSoilFormData({...soilFormData, organicCarbon: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" placeholder="e.g. 1.2" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.test_date')}*</label>
                    <input type="date" required value={soilFormData.testDate} onChange={e => setSoilFormData({...soilFormData, testDate: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium text-[var(--text-muted)]" title="Test Date" placeholder="Select test date" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[var(--text-muted)] mb-2">{t('plots.additional_notes')}</label>
                  <textarea value={soilFormData.otherNotes} onChange={e => setSoilFormData({...soilFormData, otherNotes: e.target.value})} className="w-full bg-[var(--bg-input)] border-2 border-[var(--border-strong)] rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium" rows={3} placeholder={t("Hindi") === "Hindi" ? "कोई विशिष्ट कमी (जैसे: जिंक की कमी) या सिफारिशें?" : "Any specific issues (e.g. Zinc deficiency) or recommendations?"}></textarea>
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg active:scale-[0.98]">
                  {editingSoilId ? t('plots.update_soil') : t('plots.save_soil')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {!loading && fields.length === 0 && (
        <div className="bento-card bg-[var(--bg-card)] p-20 flex flex-col items-center justify-center text-center shadow-xl border-2 border-dashed border-[var(--border-input)]">
          <div className="p-6 bg-teal-500/10 text-teal-400 rounded-full mb-6">
             <Layers size={64} />
          </div>
          <h3 className="text-2xl font-black text-[var(--text-main)]">{t('plots.no_plots')}</h3>
          <p className="text-[var(--text-subtle)] mt-2 max-w-md font-medium">{t('plots.no_plots_desc')}</p>
          <button onClick={() => setIsAddingField(true)} className="mt-8 bg-teal-600 text-white px-8 py-4 rounded-[28px] font-black hover:scale-105 transition-all shadow-lg shadow-teal-600/20">
            {t('plots.start_mapping')}
          </button>
        </div>
      )}

      {/* Main Grid: Farm Plots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
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
                onClick={() => { setSelectedPlotForDetail(field); setDetailTab('details'); setIsTrendsOpen(false); }}
                className="bg-[var(--bg-card)] rounded-2xl shadow-lg border border-[var(--border-input)] overflow-hidden cursor-pointer hover:shadow-xl hover:shadow-teal-500/5 hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 group relative"
              >
                {/* Color accent bar */}
                <div className="h-1.5 bg-gradient-to-r from-teal-500 to-emerald-500" />
                
                {/* Card Body */}
                <div className="p-4 md:p-5">
                  {/* Header row: name + actions */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-[var(--text-main)] tracking-tight truncate">{field.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Maximize2 size={12} className="text-teal-500 shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-muted)] capitalize">{field.area} {field.unit}</span>
                        {field.soilType && (
                          <>
                            <span className="text-[var(--text-muted)] text-xs">·</span>
                            <span className="text-xs font-semibold text-[var(--text-muted)]">{field.soilType}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 relative z-30 shrink-0 ml-2">
                      <button onClick={(e) => { 
                        e.stopPropagation(); 
                        setEditingFieldId(field.id); 
                        setFieldFormData({
                          name: field.name, area: String(field.area), unit: field.unit, 
                          soilType: field.soilType||'', location: field.location||'', 
                          description: field.description||'',
                          currentCrop: field.currentCrop||'', variety: field.variety||'',
                          plantingDate: field.plantingDate||'', previousSprays: field.previousSprays||'',
                          irrigationTimings: field.irrigationTimings||'', otherDetails: field.otherDetails||''
                        }); 
                        setIsAddingField(true); 
                      }} className="p-1.5 text-[var(--text-subtle)] hover:text-emerald-500 transition-colors rounded-lg hover:bg-[var(--bg-hover)]" title="Edit Plot">
                        <Edit2 size={14} />
                      </button>
                      {deletingFieldId === field.id ? (
                        <div className="flex items-center gap-1 bg-rose-500/10 p-0.5 rounded-lg border border-rose-500/20">
                          <button onClick={(e) => handleFieldDelete(e, field.id)} className="px-2 py-1 text-[10px] font-bold text-white bg-red-500 rounded">{t('common.delete')}</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletingFieldId(null); }} className="px-2 py-1 text-[10px] font-bold text-[var(--text-muted)] rounded">X</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletingFieldId(field.id); }} className="p-1.5 text-[var(--text-subtle)] hover:text-red-500 transition-colors rounded-lg hover:bg-[var(--bg-hover)]" title="Delete Plot">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Crop badge */}
                  {field.currentCrop && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg">
                        <Sprout size={12} className="text-teal-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">{field.currentCrop}</span>
                        {field.variety && <span className="text-[10px] text-teal-400/60">· {field.variety}</span>}
                      </div>
                    </div>
                  )}

                  {/* Compact soil summary */}
                  {latestReport ? (
                    <div className="bg-[var(--bg-input)] rounded-xl p-3 border border-[var(--border-input)]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">{t('plots.soil_health')}</span>
                        <span className="text-[9px] font-semibold text-[var(--text-muted)]">{new Date(latestReport.testDate).toLocaleDateString()}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <span className="text-[9px] font-bold text-[var(--text-subtle)] block">pH</span>
                          <span className="text-sm font-black text-rose-500">{latestReport.ph || '-'}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] font-bold text-[var(--text-subtle)] block">N</span>
                          <span className="text-sm font-black text-emerald-500">{latestReport.nitrogen || '-'}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] font-bold text-[var(--text-subtle)] block">P</span>
                          <span className="text-sm font-black text-blue-500">{latestReport.phosphorus || '-'}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] font-bold text-[var(--text-subtle)] block">K</span>
                          <span className="text-sm font-black text-amber-500">{latestReport.potassium || '-'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-input)] rounded-xl p-3 border border-dashed border-[var(--border-input)] text-center">
                      <span className="text-[10px] font-semibold text-[var(--text-muted)]">{t('plots.no_soil')}</span>
                    </div>
                  )}

                  {/* Quick Actions Footer */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[var(--border-input)] relative z-30">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlotForDetail(field);
                        setDetailTab('advisor');
                      }}
                      className="flex items-center justify-center gap-1 py-2 px-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border border-emerald-500/20"
                    >
                      <MessageSquare size={12} className="text-emerald-400" />
                      {t('plots.tab_advisor')}
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSoilModal(field.id, latestReport || undefined);
                      }}
                      className="flex items-center justify-center gap-1 py-2 px-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors border border-indigo-500/20"
                    >
                      <FlaskConical size={12} className="text-indigo-400" />
                      {latestReport ? t('plots.update_health') : t('plots.add_audit')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {unassignedReports.length > 0 && (
         <div className="mt-20 border-t border-[var(--border-strong)] pt-10">
            <div className="flex items-center justify-between mb-8">
               <div>
                  <h3 className="text-3xl font-black text-[var(--text-main)] tracking-tight flex items-center gap-3">
                    <FlaskConical className="text-orange-500" size={32} /> {t('plots.soil_analytics')}
                  </h3>
                  <p className="text-[var(--text-muted)] font-medium">{t('plots.link_pending')}</p>
               </div>
               <div className="bg-orange-100 text-orange-700 px-4 py-2 rounded-2xl font-black text-sm border border-orange-200">
                 {unassignedReports.length} {t("Hindi") === "Hindi" ? "लंबित" : "Pending"}
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {unassignedReports.map(report => (
                <div key={report.id} className="bg-[var(--bg-card)] rounded-2xl p-6 shadow-xl border border-[var(--border-input)] relative group">
                   <div className="absolute top-4 right-4 flex gap-1 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); openSoilModal(null, report); }} className="p-2 text-[var(--text-subtle)] hover:text-indigo-600 transition-colors" title="Edit soil report" aria-label="Edit soil report"><Edit2 size={16} /></button>
                      {deletingSoilId === report.id ? (
                        <div className="flex items-center gap-1 bg-rose-500/10 p-1 rounded-lg">
                          <button onClick={(e) => handleSoilDelete(e, report.id)} className="px-2 py-1 text-xs font-bold text-white bg-red-500 rounded">{t('common.delete')}</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(null); }} className="px-2 py-1 text-xs font-bold text-[var(--text-muted)] bg-[var(--bg-card)] rounded">{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletingSoilId(report.id); }} className="p-2 text-[var(--text-subtle)] hover:text-red-500 transition-colors" title="Delete soil report" aria-label="Delete soil report"><Trash2 size={16} /></button>
                      )}
                   </div>
                   <div className="flex items-center gap-2 mb-4">
                     <Calendar size={16} className="text-indigo-500"/>
                     <span className="text-sm font-black text-[var(--text-main)]">{new Date(report.testDate).toLocaleDateString()}</span>
                   </div>
                   <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">pH</span><span className="font-black text-rose-500">{report.ph || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">N</span><span className="font-black text-emerald-600">{report.nitrogen || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">P</span><span className="font-black text-blue-600">{report.phosphorus || '-'}</span></div>
                      <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">K</span><span className="font-black text-amber-600">{report.potassium || '-'}</span></div>
                   </div>
                   {report.otherNotes && <p className="text-xs text-[var(--text-muted)] mb-4">{report.otherNotes}</p>}

                   <div className="pt-4 border-t border-[var(--border-input)] flex items-center justify-between">
                     {assigningReportId === report.id ? (
                        <div className="flex-1 animate-in slide-in-from-bottom-2 duration-300">
                          <select 
                            onChange={(e) => handleAssignReport(report.id, e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-teal-500"
                            defaultValue=""
                            title="Assign report to plot"
                            aria-label="Assign report to plot"
                          >
                            <option value="" disabled>{t('plots.assign_plot')}</option>
                            {fields.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                          <button 
                            onClick={() => setAssigningReportId(null)}
                            className="w-full mt-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                     ) : (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-subtle)]">{t('plots.action_required')}</span>
                          <button 
                            onClick={() => setAssigningReportId(report.id)}
                            className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-teal-700 transition-colors flex items-center gap-1 shadow-lg shadow-zinc-900/10"
                          >
                            {t('plots.link_to_plot')}
                          </button>
                        </>
                     )}
                   </div>
                </div>
              ))}
            </div>
         </div>
      )}

      {/* ── Plot Detail Modal ──────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
        {selectedPlotForDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col bg-theme-base"
          >
            {/* Modal Header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b glass-nav border-theme-input">
              <button
                onClick={() => setSelectedPlotForDetail(null)}
                className="p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
                title="Back"
                aria-label="Back"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-black text-[var(--text-main)] truncate">{selectedPlotForDetail.name}</h2>
                <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-widest">
                  {selectedPlotForDetail.area} {selectedPlotForDetail.unit}
                  {selectedPlotForDetail.currentCrop ? ` · ${selectedPlotForDetail.currentCrop}` : ''}
                </p>
              </div>
              {/* Tab Pills */}
              <div className="flex p-0.5 rounded-xl gap-0.5 border shrink-0 bg-theme-input border-theme-input">
                <button
                  onClick={() => setDetailTab('details')}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-1 ${
                    detailTab === 'details'
                      ? 'bg-teal-500/20 border border-teal-500/30 text-teal-400'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  <Layers size={11} className="-mt-0.5" />
                  {t('plots.tab_details')}
                </button>
                <button
                  onClick={() => setDetailTab('advisor')}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-1 relative overflow-hidden ${
                    detailTab === 'advisor'
                      ? 'bg-emerald-500/25 border border-emerald-500/35 text-emerald-400 font-extrabold shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'text-emerald-400 hover:text-[var(--text-main)] border border-transparent hover:border-emerald-500/10'
                  }`}
                >
                  <MessageSquare size={11} className="-mt-0.5 text-emerald-400" />
                  {t('plots.tab_advisor')}
                  <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {detailTab === 'details' && (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 overflow-y-auto p-4 md:p-6"
                  >
                    {/* Unified Interactive Plot and Soil Details */}
                    {(() => {
                      const field = selectedPlotForDetail;
                      const fieldReports = reports.filter(r => r.fieldId === field.id);
                      const latestReport = fieldReports.length > 0 ? fieldReports[0] : null;
                      return (
                        <div className="max-w-2xl mx-auto space-y-5 pb-20">
                          
                          {/* 1. Interactive Plot & Crop Details Card */}
                          <div 
                            onClick={() => {
                              setEditingFieldId(field.id);
                              setFieldFormData({
                                name: field.name, area: String(field.area), unit: field.unit,
                                soilType: field.soilType||'', location: field.location||'',
                                description: field.description||'', currentCrop: field.currentCrop||'',
                                variety: field.variety||'', plantingDate: field.plantingDate||'',
                                previousSprays: field.previousSprays||'', irrigationTimings: field.irrigationTimings||'',
                                otherDetails: field.otherDetails||''
                              });
                              setIsAddingField(true);
                            }}
                            className="bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-input)] hover:border-teal-500/30 p-5 rounded-2xl cursor-pointer transition-all duration-200 group relative shadow-md"
                          >
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="font-black text-[var(--text-main)] flex items-center gap-2">
                                <Layers className="text-teal-400 group-hover:scale-110 transition-transform" size={18} /> {t("Hindi") === "Hindi" ? "प्लॉट और फसल विवरण" : "Plot & Crop Details"}
                              </h4>
                              <div className="flex items-center gap-1 text-[11px] font-black text-teal-400 uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity">
                                <Edit2 size={12} /> {t('common.edit')}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm text-[var(--text-main)]">
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.plot_name')}</span>
                                <span className="font-bold">{field.name}</span>
                              </div>
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.area_size')}</span>
                                <span className="font-bold">{field.area} {field.unit}</span>
                              </div>
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.soil_baseline')}</span>
                                <span className="font-bold">{field.soilType || (t('Hindi') === 'Hindi' ? 'निर्धारित नहीं' : 'Not set')}</span>
                              </div>
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.current_crop')}</span>
                                <span className="font-bold text-emerald-400">{field.currentCrop || (t('Hindi') === 'Hindi' ? 'कोई फसल सक्रिय नहीं' : 'No crop active')}</span>
                              </div>
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.variety')}</span>
                                <span className="font-bold">{field.variety || (t('Hindi') === 'Hindi' ? 'निर्दिष्ट नहीं' : 'Not specified')}</span>
                              </div>
                              <div>
                                <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.planting_date')}</span>
                                <span className="font-bold">{field.plantingDate || (t('Hindi') === 'Hindi' ? 'निर्धारित नहीं' : 'Not set')}</span>
                              </div>
                              <div className="col-span-2 md:col-span-3 border-t border-[var(--border-input)] pt-3 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.irrigation')}</span>
                                  <span className="font-medium text-[var(--text-muted)]">{field.irrigationTimings || (t('Hindi') === 'Hindi' ? 'कोई शेड्यूल निर्धारित नहीं' : 'No schedule set')}</span>
                                </div>
                                <div>
                                  <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('plots.sprays')}</span>
                                  <span className="font-medium text-[var(--text-muted)]">{field.previousSprays || (t('Hindi') === 'Hindi' ? 'कोई छिड़काव लॉग नहीं' : 'No applications logged')}</span>
                                </div>
                              </div>
                              {field.description && (
                                <div className="col-span-2 md:col-span-3 border-t border-[var(--border-input)] pt-3 mt-1">
                                  <span className="font-black text-[9px] uppercase tracking-widest text-teal-600/70 block mb-0.5">{t('Hindi') === 'Hindi' ? 'प्लॉट विवरण / AI नोट्स' : 'Plot Description / AI Notes'}</span>
                                  <p className="text-xs font-medium text-[var(--text-muted)] leading-relaxed italic">"{field.description}"</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 2. Interactive AI Advisor Widget */}
                          <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-transparent border border-emerald-500/25 p-5 rounded-2xl shadow-md relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/10 animate-bounce-slow">
                                <Bot size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-black text-[var(--text-main)] mb-1 flex items-center gap-2">
                                  {t("Hindi") === "Hindi" ? "प्लॉट AI सलाहकार" : "Plot AI Advisor"}
                                  <span className="bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md leading-none animate-pulse">
                                    {t("Hindi") === "Hindi" ? "सक्रिय" : "Online"}
                                  </span>
                                </h4>
                                <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed mb-4">
                                  {t("Hindi") === "Hindi" ? "अपनी विशिष्ट फसल के अनुसार अनुकूलित सलाह प्राप्त करें या समस्याओं का निदान करें: " : "Ask recommendations or diagnose problems tailored specifically to your "}<span className="text-emerald-400 font-bold">{field.currentCrop || field.name}</span>.
                                </p>

                                {/* Prompt suggestions */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                  <button
                                    onClick={() => {
                                      setPrefilledAdvisorQuery(t("Hindi") === "Hindi" ? `मेरी फसल ${field.currentCrop || 'Soyabean'} की उपज कैसे बढ़ाएं?` : `How to increase my ${field.currentCrop || 'Soyabean'} yield?`);
                                      setDetailTab('advisor');
                                    }}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] px-3 py-1.5 rounded-xl transition-all active:scale-95"
                                  >
                                    🌾 {t("Hindi") === "Hindi" ? "उपज बढ़ाएं" : "Increase Yield"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPrefilledAdvisorQuery(t("Hindi") === "Hindi" ? `मेरी फसल ${field.currentCrop || 'Soyabean'} का रोग नियंत्रण कैसे करें?` : `How to prevent diseases/pests on my ${field.currentCrop || 'Soyabean'}?`);
                                      setDetailTab('advisor');
                                    }}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] px-3 py-1.5 rounded-xl transition-all active:scale-95"
                                  >
                                    🐛 {t("Hindi") === "Hindi" ? "कीट नियंत्रण" : "Pest Control"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPrefilledAdvisorQuery(t("Hindi") === "Hindi" ? `क्या मेरी मिट्टी की रिपोर्ट ठीक है?` : `Is my soil health optimal for this crop?`);
                                      setDetailTab('advisor');
                                    }}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-bold text-[10px] px-3 py-1.5 rounded-xl transition-all active:scale-95"
                                  >
                                    🧪 {t("Hindi") === "Hindi" ? "मिट्टी जांचें" : "Check Soil Health"}
                                  </button>
                                </div>

                                {/* Quick mini input */}
                                <form 
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.currentTarget;
                                    const inputVal = (form.elements.namedItem('quickQuery') as HTMLInputElement).value;
                                    if (inputVal.trim()) {
                                      setPrefilledAdvisorQuery(inputVal);
                                      setDetailTab('advisor');
                                      form.reset();
                                    }
                                  }}
                                  className="flex gap-2"
                                >
                                  <input 
                                    name="quickQuery"
                                    type="text" 
                                    placeholder={t("Hindi") === "Hindi" ? "अपना सवाल दर्ज करें..." : "Type a query and press send..."}
                                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-emerald-500 font-medium placeholder-[var(--text-subtle)] text-[var(--text-main)]"
                                  />
                                  <button 
                                    type="submit" 
                                    className="bg-emerald-500 text-white p-2.5 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/10"
                                    title="Send quick query"
                                    aria-label="Send quick query"
                                  >
                                    <Send size={14} />
                                  </button>
                                </form>
                              </div>
                            </div>
                          </div>

                          {/* 3. Interactive & Simplified Soil Health Card */}
                          <div 
                            onClick={() => openSoilModal(field.id, latestReport || undefined)}
                            className="bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-input)] hover:border-indigo-500/30 p-5 rounded-2xl cursor-pointer transition-all duration-200 group relative shadow-md"
                          >
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="font-black text-[var(--text-main)] flex items-center gap-2">
                                <FlaskConical className="text-indigo-400 group-hover:scale-110 transition-transform" size={18} /> {t('plots.soil_health')}
                              </h4>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSoilModal(field.id, latestReport || undefined);
                                }}
                                className="text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                              >
                                {latestReport ? <Database size={12}/> : <Plus size={12}/>}
                                {latestReport ? t('plots.update_health') : t('plots.add_audit')}
                              </button>
                            </div>

                            {latestReport ? (
                              <div className="space-y-4">
                                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-semibold mb-2">
                                  <Calendar size={14} className="text-indigo-400" />
                                  <span>{t("Hindi") === "Hindi" ? "अंतिम परीक्षण तिथि: " : "Last Test Date: "}{new Date(latestReport.testDate).toLocaleDateString()}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <SoilMetric label={t('plots.ph_level')} value={latestReport.ph} max={14} color="bg-rose-500" />
                                  <SoilMetric label={t('plots.nitrogen')} value={latestReport.nitrogen} max={100} color="bg-emerald-500" unit="mg" />
                                  <SoilMetric label={t('plots.phosphorus')} value={latestReport.phosphorus} max={100} color="bg-blue-500" unit="mg" />
                                  <SoilMetric label={t('plots.potassium')} value={latestReport.potassium} max={100} color="bg-amber-500" unit="mg" />
                                </div>
                                {latestReport.otherNotes && (
                                  <p className="text-xs font-medium text-[var(--text-muted)] italic border-t border-[var(--border-input)] pt-3 mt-2">
                                    "{latestReport.otherNotes}"
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="border border-dashed border-[var(--border-strong)] rounded-xl p-6 text-center">
                                <p className="text-sm font-medium text-[var(--text-muted)] mb-1">{t("Hindi") === "Hindi" ? "कोई मिट्टी परीक्षण रिकॉर्ड नहीं मिला।" : "No soil test records found."}</p>
                                <p className="text-xs text-[var(--text-subtle)]">{t("Hindi") === "Hindi" ? "अपनी पहली मिट्टी स्वास्थ्य रिपोर्ट दर्ज करने के लिए यहाँ टैप करें।" : "Tap anywhere on this card to record your first soil health report."}</p>
                              </div>
                            )}
                          </div>

                          {/* 3. Soil Trends Toggle Section */}
                          {fieldReports.length > 1 && (
                            <div className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-input)]">
                              <details className="group" onToggle={(e) => setIsTrendsOpen((e.target as HTMLDetailsElement).open)}>
                                <summary className="font-black text-sm text-[var(--text-main)] flex items-center justify-between cursor-pointer list-none select-none">
                                  <span className="flex items-center gap-2">
                                    <Database className="text-emerald-400" size={16} /> {t("Hindi") === "Hindi" ? "ऐतिहासिक रुझान और लॉग" : "Historical Trends & Logs"}
                                  </span>
                                  <span className="transition group-open:-rotate-180 text-[var(--text-muted)] text-xs font-black">
                                    ▼
                                  </span>
                                </summary>
                                <div className="mt-4 pt-4 border-t border-[var(--border-input)]">
                                  {isTrendsOpen && <SoilHealthChart data={fieldReports} />}
                                </div>
                              </details>
                            </div>
                          )}

                        </div>
                      );
                    })()}
                  </motion.div>
                )}

                {detailTab === 'advisor' && (
                  <motion.div
                    key="advisor"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col"
                  >
                    <FarmingAdvisor 
                      isActive={true} 
                      fieldId={selectedPlotForDetail.id} 
                      hideHeader={true} 
                      initialQuery={prefilledAdvisorQuery}
                      onQueryClear={() => setPrefilledAdvisorQuery("")}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── General AI FAB ────────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
        {!selectedPlotForDetail && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            onClick={() => setShowGeneralAI(true)}
            id="general-ai-fab"
            className="fixed bottom-28 right-4 md:bottom-8 md:right-6 z-[100] w-14 h-14 bg-gradient-to-br from-emerald-500 to-green-700 text-white rounded-2xl shadow-2xl shadow-emerald-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all border border-emerald-400/30"
            title={t('plots.ask_ai')}
          >
            <MessageSquare size={22} />
          </motion.button>
        )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── General AI Modal ──────────────────────────────── */}
      {createPortal(
        <AnimatePresence>
        {showGeneralAI && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="fixed inset-0 z-[200] flex flex-col bg-theme-base"
          >
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b glass-nav border-theme-input">
              <button
                onClick={() => setShowGeneralAI(false)}
                className="p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
                title="Back"
                aria-label="Back"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-green-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Leaf size={16} className="text-white" />
              </div>
              <div className="flex-1">
                <span className="font-serif font-bold text-base text-[var(--text-main)] block leading-tight">
                  Agro<span className="text-gradient-green">Aid</span> AI
                </span>
                <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest leading-none mt-0.5">
                  General Mode
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <FarmingAdvisor isActive={true} hideHeader={true} />
            </div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
}


