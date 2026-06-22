import { createContext, useContext, useState, useEffect } from "react";

export type Language = "English" | "Hindi";

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isHindi: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "English",
  setLanguage: () => {},
  t: (k) => k,
  isHindi: false,
});

// ─── Full translation map ──────────────────────────────────────
export const translations: Record<string, { English: string; Hindi: string }> = {
  // Navigation
  "nav.dashboard": { English: "Dashboard", Hindi: "डैशबोर्ड" },
  "nav.advisor":  { English: "Advisor",  Hindi: "सलाहकार" },
  "nav.health":   { English: "Health",   Hindi: "स्वास्थ्य" },
  "nav.plots":    { English: "Plots",    Hindi: "खेत" },
  "nav.tasks":    { English: "Tasks",    Hindi: "कार्य" },
  "nav.market":   { English: "Market",   Hindi: "बाज़ार" },
  "nav.voice":    { English: "Voice",    Hindi: "आवाज़" },
  "nav.profile":  { English: "Profile",  Hindi: "प्रोफ़ाइल" },

  // Common
  "common.loading":   { English: "Loading…",   Hindi: "लोड हो रहा है…" },
  "common.save":      { English: "Save",        Hindi: "सहेजें" },
  "common.cancel":    { English: "Cancel",      Hindi: "रद्द करें" },
  "common.delete":    { English: "Delete",      Hindi: "हटाएं" },
  "common.edit":      { English: "Edit",        Hindi: "संपादित करें" },
  "common.add":       { English: "Add",         Hindi: "जोड़ें" },
  "common.update":    { English: "Update",      Hindi: "अपडेट करें" },
  "common.back":      { English: "Back",        Hindi: "वापस" },
  "common.submit":    { English: "Submit",      Hindi: "जमा करें" },
  "common.search":    { English: "Search",      Hindi: "खोजें" },
  "common.filter":    { English: "Filter",      Hindi: "फ़िल्टर" },
  "common.yes":       { English: "Yes",         Hindi: "हाँ" },
  "common.no":        { English: "No",          Hindi: "नहीं" },
  "common.or":        { English: "or",          Hindi: "या" },
  "common.details":   { English: "Details",     Hindi: "विवरण" },
  "common.notes":     { English: "Notes",       Hindi: "नोट्स" },
  "common.date":      { English: "Date",        Hindi: "तारीख" },
  "common.name":      { English: "Name",        Hindi: "नाम" },
  "common.type":      { English: "Type",        Hindi: "प्रकार" },
  "common.status":    { English: "Status",      Hindi: "स्थिति" },
  "common.all":       { English: "All",         Hindi: "सभी" },
  "common.none":      { English: "None",        Hindi: "कोई नहीं" },
  "common.pending":   { English: "Pending",     Hindi: "लंबित" },
  "common.completed": { English: "Completed",   Hindi: "पूर्ण" },
  "common.high":      { English: "High",        Hindi: "उच्च" },
  "common.medium":    { English: "Medium",      Hindi: "मध्यम" },
  "common.low":       { English: "Low",         Hindi: "कम" },
  "common.up":        { English: "Rising",      Hindi: "बढ़ रहा है" },
  "common.down":      { English: "Falling",     Hindi: "घट रहा है" },
  "common.stable":    { English: "Stable",      Hindi: "स्थिर" },
  "common.powered_by":{ English: "Powered by Gemini AI · Live Data", Hindi: "Gemini AI द्वारा · लाइव डेटा" },

  // App header
  "app.loading": { English: "Loading AgroAid AI…", Hindi: "AgroAid AI लोड हो रहा है…" },

  // Landing page
  "landing.subtitle":     { English: "Empowering farmers with AI-driven insights and precision agriculture tools.", Hindi: "किसानों को AI-संचालित जानकारी और सटीक कृषि उपकरणों से सशक्त बनाना।" },
  "landing.tagline":      { English: "Empowering farmers with AI-driven insights and precision agriculture tools.", Hindi: "किसानों को AI-संचालित जानकारी और सटीक कृषि उपकरणों से सशक्त बनाना।" },
  "landing.signin":       { English: "Sign in to your farm", Hindi: "अपने खेत में साइन इन करें" },
  "landing.await":        { English: "Your AI agriculture assistant awaits", Hindi: "आपका AI कृषि सहायक तैयार है" },
  "landing.google":       { English: "Continue with Google", Hindi: "Google से जारी रखें" },
  "landing.phone":        { English: "Continue with Phone", Hindi: "फ़ोन से जारी रखें" },
  "landing.enter_mobile": { English: "Enter Mobile Number", Hindi: "मोबाइल नंबर दर्ज करें" },
  "landing.verify_code":  { English: "We'll send you a verification code", Hindi: "हम आपको एक सत्यापन कोड भेजेंगे" },
  "landing.send_otp":     { English: "Send OTP", Hindi: "OTP भेजें" },
  "landing.verify_otp":   { English: "Verify OTP", Hindi: "OTP सत्यापित करें" },
  "landing.enter_otp":    { English: "Enter the 6-digit code sent to your phone", Hindi: "अपने फ़ोन पर भेजा गया 6-अंकीय कोड दर्ज करें" },
  "landing.verify_signin":{ English: "Verify & Sign In", Hindi: "सत्यापित करें और साइन इन करें" },
  "landing.resend":       { English: "Resend or Edit Number", Hindi: "दोबारा भेजें या नंबर बदलें" },
  // Auth aliases (used in App.tsx via t())
  "auth.title":           { English: "Sign in to your farm", Hindi: "अपने खेत में साइन इन करें" },
  "auth.subtitle":        { English: "Your AI agriculture assistant awaits", Hindi: "आपका AI कृषि सहायक तैयार है" },
  "auth.google":          { English: "Continue with Google", Hindi: "Google से जारी रखें" },
  "auth.phone":           { English: "Continue with Phone", Hindi: "फ़ोन से जारी रखें" },
  "auth.enterPhone":      { English: "Enter Mobile Number", Hindi: "मोबाइल नंबर दर्ज करें" },
  "auth.otpHint":         { English: "We'll send you a verification code", Hindi: "हम आपको सत्यापन कोड भेजेंगे" },
  "auth.sendOTP":         { English: "Send OTP", Hindi: "OTP भेजें" },
  "auth.back":            { English: "Back", Hindi: "वापस" },
  "auth.verifyOtp":       { English: "Verify OTP", Hindi: "OTP सत्यापित करें" },
  "auth.otpCodeHint":     { English: "Enter the 6-digit code sent to your phone", Hindi: "फ़ोन पर भेजा गया 6-अंकीय कोड दर्ज करें" },
  "auth.verify":          { English: "Verify & Sign In", Hindi: "सत्यापित करें और साइन इन करें" },
  "auth.resendOrEdit":    { English: "Resend or Edit Number", Hindi: "दोबारा भेजें या नंबर बदलें" },

  // Feature cards
  "feature.advisor.title": { English: "Smart Advisor",   Hindi: "स्मार्ट सलाहकार" },
  "feature.advisor.desc":  { English: "Get crop suggestions tailored to your soil, climate, and location.", Hindi: "अपनी मिट्टी, जलवायु और स्थान के अनुसार फसल के सुझाव प्राप्त करें।" },
  "feature.disease.title": { English: "Disease Scanner", Hindi: "रोग स्कैनर" },
  "feature.disease.desc":  { English: "Identify plant diseases instantly with AI-powered vision analysis.", Hindi: "AI-संचालित दृष्टि विश्लेषण से पौधों की बीमारियाँ तुरंत पहचानें।" },
  "feature.plots.title":   { English: "Plot Manager",    Hindi: "प्लॉट प्रबंधक" },
  "feature.plots.desc":    { English: "Map your fields, log soil reports and track plot-specific activities.", Hindi: "अपने खेतों का नक्शा बनाएं, मिट्टी रिपोर्ट लॉग करें और प्लॉट गतिविधियाँ ट्रैक करें।" },

  // FarmingAdvisor
  "advisor.title":           { English: "AI Farm Advisor",          Hindi: "AI कृषि सलाहकार" },
  "advisor.subtitle":        { English: "Precision insights · Powered by Gemini", Hindi: "सटीक जानकारी · Gemini द्वारा संचालित" },
  "advisor.placeholder":     { English: "Ask about crops, soil, pests…", Hindi: "फसल, मिट्टी, कीट के बारे में पूछें…" },
  "advisor.send":            { English: "Send",             Hindi: "भेजें" },
  "advisor.thinking":        { English: "Analyzing your query…", Hindi: "आपके सवाल का विश्लेषण हो रहा है…" },
  "advisor.plots_tab":       { English: "Plots",            Hindi: "खेत" },
  "advisor.chat_tab":        { English: "Chat",             Hindi: "चैट" },
  "advisor.select_plot":     { English: "Select a plot for contextual advice", Hindi: "संदर्भ सलाह के लिए एक प्लॉट चुनें" },
  "advisor.no_plots":        { English: "No plots mapped yet", Hindi: "अभी कोई प्लॉट मैप नहीं हुआ" },
  "advisor.voice_placeholder":{ English: "Speaking… ask your farming question", Hindi: "बोलें… अपना खेती का सवाल पूछें" },
  "advisor.updates_saved":   { English: "Farm data updated from conversation", Hindi: "बातचीत से खेत डेटा अपडेट हुआ" },
  "advisor.task_added":      { English: "Task added from AI advice",    Hindi: "AI सलाह से कार्य जोड़ा गया" },

  // Market
  "market.title":         { English: "Live Market Prices", Hindi: "लाइव बाज़ार भाव" },
  "market.subtitle":      { English: "Real-time Mandi rates · AI powered", Hindi: "रियल-टाइम मंडी दर · AI संचालित" },
  "market.search_loc":    { English: "District / State…",  Hindi: "जिला / राज्य…" },
  "market.check":         { English: "Check",              Hindi: "देखें" },
  "market.trend":         { English: "Trend",              Hindi: "रुझान" },
  "market.demand":        { English: "Demand",             Hindi: "मांग" },
  "market.last_updated":  { English: "Updated",            Hindi: "अपडेट" },
  "market.no_data":       { English: "Could not retrieve market data.", Hindi: "बाज़ार डेटा प्राप्त नहीं हो सका।" },
  "market.try_another":   { English: "Please try another location.", Hindi: "कृपया दूसरी जगह आज़माएं।" },
  "market.per_quintal":   { English: "per quintal",        Hindi: "प्रति क्विंटल" },
  "market.category.all":  { English: "All",                Hindi: "सभी" },
  "market.category.grains":{ English: "Grains",            Hindi: "अनाज" },
  "market.category.vegetables":{ English: "Vegetables",   Hindi: "सब्जियाँ" },
  "market.category.fruits":{ English: "Fruits",            Hindi: "फल" },
  "market.category.cash": { English: "Cash Crops",         Hindi: "नकदी फसलें" },
  "market.spread":        { English: "Spread",             Hindi: "अंतर" },
  "market.data_as_of":    { English: "Data as of",         Hindi: "डेटा की तारीख" },
  "market.min":           { English: "Min",                Hindi: "न्यूनतम" },
  "market.modal":         { English: "Modal",              Hindi: "मोडल" },
  "market.max":           { English: "Max",                Hindi: "अधिकतम" },
  "market.state":         { English: "State",              Hindi: "राज्य" },
  "market.district":      { English: "District",           Hindi: "ज़िला" },
  "market.mandi":         { English: "Market",             Hindi: "मंडी" },

  // FieldManager / Plots
  "plots.title":          { English: "Farm Plots & Soil",  Hindi: "खेत और मिट्टी" },
  "plots.subtitle":       { English: "Manage your land segments and track soil health perfectly.", Hindi: "अपनी भूमि का प्रबंधन करें और मिट्टी का स्वास्थ्य ट्रैक करें।" },
  "plots.map_new":        { English: "Map New Plot",       Hindi: "नया प्लॉट जोड़ें" },
  "plots.no_plots":       { English: "No Farm Plots Mapped", Hindi: "कोई खेत मैप नहीं हुआ" },
  "plots.no_plots_desc":  { English: "Divide your farm into plots to easily manage soil health history per land segment.", Hindi: "मिट्टी स्वास्थ्य इतिहास प्रबंधित करने के लिए अपने खेत को प्लॉट में विभाजित करें।" },
  "plots.start_mapping":  { English: "Start Mapping Now",  Hindi: "अभी मैपिंग शुरू करें" },
  "plots.plot_name":      { English: "Plot Name / Identifier", Hindi: "प्लॉट का नाम / पहचान" },
  "plots.area_size":      { English: "Area Size",          Hindi: "क्षेत्रफल" },
  "plots.unit":           { English: "Unit",               Hindi: "इकाई" },
  "plots.soil_type":      { English: "Soil Type Baseline", Hindi: "मिट्टी का प्रकार" },
  "plots.current_crop":   { English: "Current Crop",       Hindi: "वर्तमान फसल" },
  "plots.variety":        { English: "Variety / Seed Type",Hindi: "किस्म / बीज का प्रकार" },
  "plots.planting_date":  { English: "Planting Date",      Hindi: "बुआई की तारीख" },
  "plots.irrigation":     { English: "Irrigation Schedule",Hindi: "सिंचाई कार्यक्रम" },
  "plots.sprays":         { English: "Sprays / Chemicals Applied", Hindi: "छिड़काव / रसायन" },
  "plots.save_plot":      { English: "Save Plot Profile",  Hindi: "प्लॉट प्रोफ़ाइल सहेजें" },
  "plots.update_plot":    { English: "Update Plot Data",   Hindi: "प्लॉट डेटा अपडेट करें" },
  "plots.soil_health":    { English: "Soil Health",        Hindi: "मिट्टी का स्वास्थ्य" },
  "plots.add_audit":      { English: "Add Audit",          Hindi: "ऑडिट जोड़ें" },
  "plots.update_health":  { English: "Update Health",      Hindi: "स्वास्थ्य अपडेट करें" },
  "plots.crop_activity":  { English: "Crop Activity",      Hindi: "फसल गतिविधि" },
  "plots.add_record":     { English: "Add First Record",   Hindi: "पहला रिकॉर्ड जोड़ें" },
  "plots.no_soil":        { English: "No soil lab tests recorded for this plot.", Hindi: "इस प्लॉट के लिए कोई मिट्टी परीक्षण रिकॉर्ड नहीं है।" },
  "plots.soil_title":     { English: "Log Soil Test Results", Hindi: "मिट्टी परीक्षण परिणाम दर्ज करें" },
  "plots.soil_update":    { English: "Update Soil Report", Hindi: "मिट्टी रिपोर्ट अपडेट करें" },
  "plots.map_title":      { English: "Map New Plot",       Hindi: "नया प्लॉट मैप करें" },
  "plots.map_subtitle":   { English: "Define boundaries for targeted soil tracking.", Hindi: "लक्षित मिट्टी ट्रैकिंग के लिए सीमाएं निर्धारित करें।" },
  "plots.save_soil":      { English: "Save Report",        Hindi: "रिपोर्ट सहेजें" },
  "plots.update_soil":    { English: "Update Report",      Hindi: "रिपोर्ट अपडेट करें" },
  "plots.soil_analytics": { English: "Soil Analytics Intake", Hindi: "मिट्टी विश्लेषण इनपुट" },
  "plots.link_pending":   { English: "Reports captured via AI conversation. Please link these to their respective plots.", Hindi: "AI बातचीत से कैप्चर की गई रिपोर्ट। इन्हें उनके प्लॉट से जोड़ें।" },
  "plots.assign_plot":    { English: "Link to a Plot…",    Hindi: "प्लॉट से जोड़ें…" },
  "plots.satellite_mapper": { English: "Satellite Plot Mapper", Hindi: "सैटेलाइट प्लॉट मैपर" },
  "plots.error_intersecting": { English: "You cannot draw intersecting lines!", Hindi: "आप आपस में काटने वाली रेखाएं नहीं खींच सकते!" },
  "plots.error_geolocation_unsupported": { English: "Geolocation is not supported by your browser.", Hindi: "आपके ब्राउज़र द्वारा जियोलोकेशन समर्थित नहीं है।" },
  "plots.error_location_retrieve": { English: "Unable to retrieve your location. Please check permissions.", Hindi: "आपका स्थान प्राप्त करने में असमर्थ। कृपया अनुमतियों की जांच करें।" },
  "plots.error_invalid_area": { English: "Please enter a valid area size greater than 0.", Hindi: "कृपया 0 से बड़ा वैध क्षेत्रफल दर्ज करें।" },
  "plots.error_save_failed": { English: "Failed to save plot.", Hindi: "प्लॉट सहेजने में विफल।" },
  "plots.error_assign_failed": { English: "Failed to assign report.", Hindi: "रिपोर्ट सौंपने में विफल।" },
  "plots.error_invalid_ph": { English: "pH must be between 0 and 14.", Hindi: "pH 0 और 14 के बीच होना चाहिए।" },
  "plots.error_negative_nitrogen": { English: "Nitrogen level cannot be negative.", Hindi: "नाइट्रोजन का स्तर नकारात्मक नहीं हो सकता।" },
  "plots.error_negative_phosphorus": { English: "Phosphorus level cannot be negative.", Hindi: "फास्फोरस का स्तर नकारात्मक नहीं हो सकता।" },
  "plots.error_negative_potassium": { English: "Potassium level cannot be negative.", Hindi: "पोटेशियम का स्तर नकारात्मक नहीं हो सकता।" },
  "plots.error_negative_carbon": { English: "Organic Carbon level cannot be negative.", Hindi: "जैविक कार्बन का स्तर नकारात्मक नहीं हो सकता।" },
  "plots.error_save_soil_failed": { English: "Failed to save soil record.", Hindi: "मिट्टी का रिकॉर्ड सहेजने में विफल।" },

  // TaskManager
  "tasks.title":          { English: "Task Manager",       Hindi: "कार्य प्रबंधक" },
  "tasks.subtitle":       { English: "Schedule and track your farm activities", Hindi: "अपनी खेत गतिविधियाँ शेड्यूल और ट्रैक करें" },
  "tasks.add":            { English: "Add Task",           Hindi: "कार्य जोड़ें" },
  "tasks.no_tasks":       { English: "No tasks yet",       Hindi: "अभी कोई कार्य नहीं" },
  "tasks.no_tasks_desc":  { English: "Tasks suggested by the AI advisor will appear here automatically.", Hindi: "AI सलाहकार द्वारा सुझाए गए कार्य यहाँ स्वचालित रूप से दिखेंगे।" },
  "tasks.task_title":     { English: "Task Title",         Hindi: "कार्य शीर्षक" },
  "tasks.task_type":      { English: "Task Type",          Hindi: "कार्य का प्रकार" },
  "tasks.due_date":       { English: "Due Date",           Hindi: "नियत तारीख" },
  "tasks.priority":       { English: "Priority",           Hindi: "प्राथमिकता" },
  "tasks.description":    { English: "Description",        Hindi: "विवरण" },
  "tasks.save":           { English: "Save Task",          Hindi: "कार्य सहेजें" },
  "tasks.irrigation":     { English: "Irrigation",         Hindi: "सिंचाई" },
  "tasks.fertilizer":     { English: "Fertilizer",         Hindi: "खाद" },
  "tasks.monitoring":     { English: "Monitoring",         Hindi: "निगरानी" },
  "tasks.harvest":        { English: "Harvest",            Hindi: "कटाई" },
  "tasks.follow_up":      { English: "Follow-up",          Hindi: "अनुवर्ती" },
  "tasks.other":          { English: "Other",              Hindi: "अन्य" },
  "tasks.overdue":        { English: "Overdue",            Hindi: "अतिदेय" },
  "tasks.due_today":      { English: "Due Today",          Hindi: "आज देय" },
  "tasks.upcoming":       { English: "Upcoming",           Hindi: "आगामी" },

  // Disease Scanner
  "disease.title":        { English: "Plant Disease AI",   Hindi: "पौध रोग AI" },
  "disease.subtitle":     { English: "Scan · Detect · Treat", Hindi: "स्कैन · पहचान · उपचार" },
  "disease.upload":       { English: "Upload / Capture Plant Photo", Hindi: "पौधे की फ़ोटो अपलोड/खींचें" },
  "disease.drag":         { English: "Drag & drop or click to select", Hindi: "खींचें और छोड़ें या चुनें" },
  "disease.analyze":      { English: "Analyse Plant",      Hindi: "पौधे का विश्लेषण करें" },
  "disease.analyzing":    { English: "Analyzing…",         Hindi: "विश्लेषण हो रहा है…" },
  "disease.result":       { English: "Analysis Result",    Hindi: "विश्लेषण परिणाम" },
  "disease.new_scan":     { English: "New Scan",           Hindi: "नया स्कैन" },
  "disease.standby":      { English: "Standby",            Hindi: "प्रतीक्षा" },
  "disease.processing":   { English: "Processing",         Hindi: "प्रसंस्करण" },
  "disease.ready":        { English: "Analysis Ready",     Hindi: "विश्लेषण तैयार" },
  "disease.select_plot":  { English: "Select a plot (optional)", Hindi: "प्लॉट चुनें (वैकल्पिक)" },
  "disease.all_plots":    { English: "All Plots (General scan)", Hindi: "सभी प्लॉट (सामान्य स्कैन)" },
  "disease.diagnostics":  { English: "Diagnostics Lab",    Hindi: "निदान प्रयोगशाला" },

  // Profile
  "profile.title":        { English: "Farm Profile",       Hindi: "खेत प्रोफ़ाइल" },
  "profile.subtitle":     { English: "Manage your farming information", Hindi: "अपनी खेती की जानकारी प्रबंधित करें" },
  "profile.farm_name":    { English: "Farm Name",          Hindi: "खेत का नाम" },
  "profile.location":     { English: "Farm Location",      Hindi: "खेत का स्थान" },
  "profile.total_area":   { English: "Total Farm Area",    Hindi: "कुल खेत क्षेत्र" },
  "profile.soil_type":    { English: "Primary Soil Type",  Hindi: "प्राथमिक मिट्टी का प्रकार" },
  "profile.main_crops":   { English: "Main Crops",         Hindi: "मुख्य फसलें" },
  "profile.language":     { English: "Preferred Language", Hindi: "पसंदीदा भाषा" },
  "profile.appearance":   { English: "Appearance",         Hindi: "दिखावट" },
  "profile.dark_mode":    { English: "Dark Mode",          Hindi: "डार्क मोड" },
  "profile.light_mode":   { English: "Light Mode",         Hindi: "लाइट मोड" },
  "profile.save":         { English: "Save Changes",       Hindi: "बदलाव सहेजें" },
  "profile.saving":       { English: "Saving…",            Hindi: "सहेजा जा रहा है…" },
  "profile.saved":        { English: "Profile saved successfully!", Hindi: "प्रोफ़ाइल सफलतापूर्वक सहेजी गई!" },
  "profile.sign_out":     { English: "Sign Out",           Hindi: "साइन आउट" },
  "profile.verified":     { English: "Verified Farmer",    Hindi: "सत्यापित किसान" },

  // Weather
  "weather.feels_like":   { English: "Feels like",         Hindi: "महसूस होता है" },
  "weather.humidity":     { English: "Humidity",           Hindi: "नमी" },
  "weather.wind":         { English: "Wind",               Hindi: "हवा" },
  "weather.advisory":     { English: "Weather Advisory",   Hindi: "मौसम सलाह" },

  // Voice
  "voice.title":          { English: "Live Voice Advisor",  Hindi: "लाइव वॉइस सलाहकार" },
  "voice.subtitle":       { English: "Talk to your AI farm advisor", Hindi: "अपने AI खेत सलाहकार से बात करें" },
  "voice.tap_speak":      { English: "Tap to speak",        Hindi: "बोलने के लिए टैप करें" },
  "voice.listening":      { English: "Listening…",          Hindi: "सुन रहा है…" },
  "voice.processing":     { English: "Processing…",         Hindi: "प्रसंस्करण हो रहा है…" },

  // Theme toggle
  "theme.dark":   { English: "Dark",  Hindi: "डार्क" },
  "theme.light":  { English: "Light", Hindi: "लाइट" },

  // FarmingAdvisor extras
  "advisor.default_greeting": { English: "Hi! 👋 I'm your AI Farming Advisor. How can I help your farm today?", Hindi: "नमस्ते! 👋 मैं आपका AI कृषि सलाहकार हूँ। आज आपके खेत में कैसे मदद कर सकता हूँ?" },
  "advisor.general_tab":      { English: "General",        Hindi: "सामान्य" },
  "advisor.advisor_ai":       { English: "Advisor AI",     Hindi: "सलाहकार AI" },
  "advisor.snap_photo":       { English: "Snap Photo",     Hindi: "फ़ोटो खींचें" },
  "advisor.check_diseases":   { English: "Check Diseases", Hindi: "रोग जाँचें" },
  "advisor.daily_plan":       { English: "Daily Plan",     Hindi: "दैनिक योजना" },
  "advisor.get_todo":         { English: "Get To-Do List", Hindi: "कार्य सूची पाएं" },
  "advisor.soil_check":       { English: "Soil Check",     Hindi: "मिट्टी जाँच" },
  "advisor.health_report":    { English: "Health Report",  Hindi: "स्वास्थ्य रिपोर्ट" },
  "advisor.yield_tips":       { English: "Yield Tips",     Hindi: "उपज सुझाव" },
  "advisor.improve_growth":   { English: "Improve Growth", Hindi: "विकास सुधारें" },
  "advisor.type_below":       { English: "Or just type below", Hindi: "या नीचे टाइप करें" },
  "advisor.photo":            { English: "Photo",          Hindi: "फ़ोटो" },
  "advisor.photos":           { English: "Photos",         Hindi: "फ़ोटो" },
  "advisor.multi_image":      { English: "Multi-Image",    Hindi: "मल्टी-इमेज" },
  "advisor.voice_typing":     { English: "Voice Typing",   Hindi: "वॉइस टाइपिंग" },
  "advisor.stop_listening":   { English: "Stop Listening", Hindi: "सुनना बंद करें" },
  "advisor.stop_speech":      { English: "Stop Speech",    Hindi: "बोलना बंद करें" },
  "advisor.speak_message":    { English: "Speak Message",  Hindi: "संदेश सुनें" },
  "advisor.quick_map":        { English: "Quick Map Field",Hindi: "त्वरित खेत मैप" },
  "advisor.records_synced":   { English: "Records Synced", Hindi: "रिकॉर्ड सिंक हुए" },
  "advisor.tasks_scheduled":  { English: "Tasks Scheduled Automatically", Hindi: "कार्य स्वचालित शेड्यूल हुए" },
  "advisor.plot_synced":      { English: "Plot Data Synced", Hindi: "प्लॉट डेटा सिंक हुआ" },
  "advisor.soil_updated":     { English: "Soil Records Updated", Hindi: "मिट्टी रिकॉर्ड अपडेट हुए" },
  "advisor.error_generic":    { English: "Something went wrong. Please try again.", Hindi: "कुछ गलत हो गया। कृपया पुनः प्रयास करें।" },
  "advisor.error_process":    { English: "I'm sorry, I couldn't process that request.", Hindi: "क्षमा करें, मैं इस अनुरोध को प्रोसेस नहीं कर सका।" },
  "advisor.analyze_images":   { English: "Analyze these images for me.", Hindi: "इन छवियों का विश्लेषण करें।" },
  "advisor.ask_placeholder":  { English: "Ask anything about your farm…", Hindi: "अपने खेत के बारे में कुछ भी पूछें…" },
  "advisor.daily_query":      { English: "What should I do on my farm today?", Hindi: "आज मुझे अपने खेत में क्या करना चाहिए?" },
  "advisor.soil_query":       { English: "How is the soil health for my current crops?", Hindi: "मेरी वर्तमान फसलों के लिए मिट्टी का स्वास्थ्य कैसा है?" },
  "advisor.yield_query":      { English: "How to improve my crop yield using local resources?", Hindi: "स्थानीय संसाधनों का उपयोग करके फसल उपज कैसे बढ़ाएं?" },

  // DiseaseScanner extras
  "disease.error_analyze":      { English: "Failed to analyze image. Please try again.", Hindi: "छवि विश्लेषण विफल। कृपया पुनः प्रयास करें।" },
  "disease.synced":             { English: "Diagnostic Synced", Hindi: "निदान सिंक हुआ" },
  "disease.ai_vision":          { English: "AI Vision", Hindi: "AI दृष्टि" },
  "disease.scanner_title":      { English: "Plant Health Scanner", Hindi: "पौध स्वास्थ्य स्कैनर" },
  "disease.scanner_desc":       { English: "Identify crop diseases instantly with Gemini AI vision.", Hindi: "Gemini AI दृष्टि से फसल रोगों की तुरंत पहचान करें।" },
  "disease.general_scan":       { English: "General Scan", Hindi: "सामान्य स्कैन" },
  "disease.detection_badge":    { English: "Disease Detection · AI", Hindi: "रोग पहचान · AI" },
  "disease.image_loaded":       { English: "Image loaded", Hindi: "छवि लोड हुई" },
  "disease.tap_upload":         { English: "Tap to Upload or Drop", Hindi: "अपलोड करें या ड्रॉप करें" },
  "disease.crops_hint":         { English: "Maize · Wheat · Tomato · Rice", Hindi: "मक्का · गेहूँ · टमाटर · चावल" },
  "disease.start_analysis":     { English: "Start AI Analysis", Hindi: "AI विश्लेषण शुरू करें" },
  "disease.analyzing_specimen": { English: "Analyzing Specimen…", Hindi: "नमूना विश्लेषण हो रहा है…" },
  "disease.examining":          { English: "Gemini AI is examining your image", Hindi: "Gemini AI आपकी छवि की जाँच कर रहा है" },
  "disease.ready_title":        { English: "Ready for Inspection", Hindi: "निरीक्षण के लिए तैयार" },
  "disease.ready_desc":         { English: "Upload or take a photo of the affected plant part to begin the AI diagnostic process.", Hindi: "AI निदान प्रक्रिया शुरू करने के लिए प्रभावित पौधे के भाग की फ़ोटो अपलोड या खींचें।" },
  "disease.confidence":         { English: "Confidence", Hindi: "विश्वसनीयता" },
  "disease.model_label":        { English: "Model", Hindi: "मॉडल" },
  "disease.model_name":         { English: "Gemini Vision", Hindi: "Gemini दृष्टि" },
  "disease.analyzing_msg":      { English: "Analyzing specimen…", Hindi: "नमूने का विश्लेषण हो रहा है…" },

  // Voice extras
  "voice.advisor_title":  { English: "Voice Advisor", Hindi: "वॉइस सलाहकार" },
  "voice.talk_realtime":  { English: "Talk real-time with AgroAid AI", Hindi: "AgroAid AI से रियल-टाइम बात करें" },
  "voice.establishing":   { English: "Establishing Link...", Hindi: "कनेक्शन स्थापित हो रहा है..." },
  "voice.listening_msg":  { English: "AgroAid is listening... Just speak your question!", Hindi: "AgroAid सुन रहा है... बस अपना सवाल बोलें!" },
  "voice.tap_mic":        { English: "Tap the mic below and ask anything about your crops, soil, or weather.", Hindi: "नीचे माइक पर टैप करें और फसल, मिट्टी या मौसम के बारे में कुछ भी पूछें।" },
  "voice.tip":            { English: "Works best in a quiet place. Say \"Help me with my wheat crops\" to start.", Hindi: "शांत जगह में सबसे अच्छा काम करता है। शुरू करने के लिए \"मेरी गेहूँ की फसल में मदद करें\" बोलें।" },

  // TaskManager extras
  "tasks.scheduler":          { English: "Farm Scheduler", Hindi: "खेत शेड्यूलर" },
  "tasks.reminders":          { English: "Task Reminders", Hindi: "कार्य रिमाइंडर" },
  "tasks.schedule_new":       { English: "Schedule New Reminder", Hindi: "नया रिमाइंडर शेड्यूल करें" },
  "tasks.category":           { English: "Category", Hindi: "श्रेणी" },
  "tasks.plot":               { English: "Plot", Hindi: "प्लॉट" },
  "tasks.none_general":       { English: "None / General", Hindi: "कोई नहीं / सामान्य" },
  "tasks.fert_app":           { English: "Fertilizer Application", Hindi: "खाद डालना" },
  "tasks.monitoring_scouting":{ English: "Monitoring / Scouting", Hindi: "निगरानी / स्काउटिंग" },
  "tasks.other_activity":     { English: "Other Activity", Hindi: "अन्य गतिविधि" },
  "tasks.no_pending":         { English: "No pending tasks", Hindi: "कोई लंबित कार्य नहीं" },
  "tasks.create_reminder":    { English: "Create a reminder", Hindi: "रिमाइंडर बनाएं" },
  "tasks.no_completed":       { English: "No completed tasks yet", Hindi: "अभी तक कोई पूर्ण कार्य नहीं" },
  "tasks.today":              { English: "Today", Hindi: "आज" },
  "tasks.task_title_label":   { English: "Task Title", Hindi: "कार्य शीर्षक" },

  // FieldManager extras
  "plots.update_details":  { English: "Update Plot Details", Hindi: "प्लॉट विवरण अपडेट करें" },
  "plots.crop_details":    { English: "Crop & Activity Details", Hindi: "फसल और गतिविधि विवरण" },
  "plots.interactive_map": { English: "Interactive Plot Map", Hindi: "इंटरैक्टिव प्लॉट मैप" },
  "plots.map_easy":        { English: "Easy Mode: Just tap anywhere on the map to drop a pin at your farm's location.", Hindi: "आसान तरीका: मैप पर कहीं भी टैप करके अपने खेत का पिन लगाएं।" },
  "plots.map_advanced":    { English: "Advanced: Use the polygon tool (right side) to draw the exact boundaries and auto-calculate acreage.", Hindi: "उन्नत: सटीक सीमाएं बनाने और क्षेत्रफल गणना के लिए पॉलीगॉन टूल (दाईं ओर) का उपयोग करें।" },
  "plots.soil_baseline":   { English: "Soil Baseline", Hindi: "मिट्टी बेसलाइन" },
  "plots.notes_location":  { English: "Notes / Location", Hindi: "नोट्स / स्थान" },
  "plots.analysis_date":   { English: "Analysis Date", Hindi: "विश्लेषण तारीख" },
  "plots.ph_level":        { English: "pH Level", Hindi: "pH स्तर" },
  "plots.nitrogen":        { English: "Nitrogen (N)", Hindi: "नाइट्रोजन (N)" },
  "plots.phosphorus":      { English: "Phosphorus (P)", Hindi: "फास्फोरस (P)" },
  "plots.potassium":       { English: "Potassium (K)", Hindi: "पोटेशियम (K)" },
  "plots.organic_carbon":  { English: "Organic Carbon (%)", Hindi: "जैविक कार्बन (%)" },
  "plots.test_date":       { English: "Test Date", Hindi: "परीक्षण तारीख" },
  "plots.additional_notes":{ English: "Additional Notes / Deficiencies", Hindi: "अतिरिक्त नोट्स / कमियाँ" },
  "plots.soil_info":       { English: "Record the exact metrics from your laboratory soil test. You can also upload photos of your report via the AI Advisor to log this automatically.", Hindi: "अपने प्रयोगशाला मिट्टी परीक्षण के सटीक मेट्रिक्स दर्ज करें। आप AI सलाहकार के माध्यम से रिपोर्ट की फ़ोटो भी अपलोड कर सकते हैं।" },
  "plots.action_required": { English: "Action Required", Hindi: "कार्रवाई आवश्यक" },
  "plots.link_to_plot":    { English: "Assign to Plot", Hindi: "प्लॉट से जोड़ें" },
  "plots.plot_link":       { English: "Plot Link", Hindi: "प्लॉट लिंक" },
  "plots.log_soil":        { English: "Log Soil Test Results", Hindi: "मिट्टी परीक्षण परिणाम दर्ज करें" },

  // Merged Plots + Advisor UI
  "plots.ask_ai":          { English: "Ask Farm AI",     Hindi: "Farm AI से पूछें" },
  "plots.plot_details":    { English: "Plot Details",    Hindi: "प्लॉट विवरण" },
  "plots.tab_details":     { English: "Details & Soil",  Hindi: "विवरण और मिट्टी" },
  "plots.tab_advisor":     { English: "AI Advisor",      Hindi: "AI सलाहकार" },
  "plots.back_to_plots":   { English: "Back to Plots",   Hindi: "प्लॉट पर वापस" },
  "plots.general_ai":      { English: "General Farm AI", Hindi: "सामान्य Farm AI" },

  // Weather extras
  "weather.clear":         { English: "Clear sky", Hindi: "साफ़ आसमान" },
  "weather.partly_cloudy": { English: "Partly cloudy", Hindi: "आंशिक बादल" },
  "weather.cloudy":        { English: "Cloudy", Hindi: "बादल" },
  "weather.fog":           { English: "Foggy", Hindi: "कोहरा" },
  "weather.drizzle":       { English: "Light rain", Hindi: "हल्की बारिश" },
  "weather.rain":          { English: "Rain", Hindi: "बारिश" },
  "weather.heavy_rain":    { English: "Heavy rain", Hindi: "भारी बारिश" },
  "weather.snow":          { English: "Snowfall", Hindi: "बर्फबारी" },
  "weather.thunder":       { English: "Thunderstorm", Hindi: "आंधी-तूफान" },
  "weather.fetching":      { English: "Fetching climate…", Hindi: "मौसम लोड हो रहा है…" },
  "weather.unavailable":   { English: "Weather unavailable", Hindi: "मौसम उपलब्ध नहीं" },
  "weather.forecast_3day": { English: "3-Day Forecast", Hindi: "3-दिन का पूर्वानुमान" },

  // SoilHealthChart
  "soilchart.title":    { English: "Soil Health Trends", Hindi: "मिट्टी स्वास्थ्य रुझान" },
  "soilchart.subtitle": { English: "Historical NPK & pH Levels", Hindi: "ऐतिहासिक NPK और pH स्तर" },

  // Profile extras
  "profile.verified_farmer": { English: "Verified Farmer", Hindi: "सत्यापित किसान" },
  "profile.guardian":        { English: "Guardian of Land", Hindi: "भूमि के संरक्षक" },
  "profile.impact":          { English: "Agriculture Impact", Hindi: "कृषि प्रभाव" },
  "profile.mapped_plots":    { English: "Mapped Plots", Hindi: "मैप किए गए प्लॉट" },
  "profile.health_audits":   { English: "Health Audits", Hindi: "स्वास्थ्य ऑडिट" },
  "profile.quote":           { English: "The best fertilizer is the farmer's shadow.", Hindi: "सबसे अच्छा खाद किसान की छाया है।" },
  "profile.settings":        { English: "Profile Settings", Hindi: "प्रोफ़ाइल सेटिंग्स" },
  "profile.display_name":    { English: "Display Name", Hindi: "प्रदर्शन नाम" },
  "profile.color_theme":     { English: "Color Theme", Hindi: "रंग थीम" },
  "profile.farm_context":    { English: "Farm Context", Hindi: "खेत संदर्भ" },
  "profile.farm_context_desc":{ English: "Describe your environment. This enables the AI to provide surgically accurate, localized suggestions.", Hindi: "अपने परिवेश का वर्णन करें। इससे AI को सटीक, स्थानीय सुझाव देने में मदद मिलती है।" },

  // Dashboard
  "dashboard.welcome":       { English: "Welcome to AgroAid AI", Hindi: "AgroAid AI में आपका स्वागत है" },
  "dashboard.greeting_morning": { English: "Good Morning, Farmer!", Hindi: "सुप्रभात, किसान भाई!" },
  "dashboard.greeting_afternoon": { English: "Good Afternoon, Farmer!", Hindi: "नमस्कार, किसान भाई!" },
  "dashboard.greeting_evening": { English: "Good Evening, Farmer!", Hindi: "शुभ संध्या, किसान भाई!" },
  "dashboard.greeting_generic": { English: "Hello, Farmer!", Hindi: "नमस्ते, किसान भाई!" },
  "dashboard.active_tasks":  { English: "Active Tasks", Hindi: "सक्रिय कार्य" },
  "dashboard.mapped_acres":  { English: "Mapped Area", Hindi: "मैप किया गया क्षेत्र" },
  "dashboard.diagnosed_diseases": { English: "Health Audits", Hindi: "स्वास्थ्य ऑडिट" },
  
  "dashboard.quick_scan":     { English: "Crop Health Scanner", Hindi: "पौध स्वास्थ्य स्कैनर" },
  "dashboard.quick_scan_desc": { English: "Identify plant diseases instantly with AI-powered vision diagnostics.", Hindi: "AI-संचालित विज़न डायग्नोस्टिक्स के साथ तुरंत पौधों की बीमारियों की पहचान करें।" },
  "dashboard.scan_btn":       { English: "Scan Specimen", Hindi: "नमूना जांचें" },
  
  "dashboard.my_plots":      { English: "My Fields & Soil", Hindi: "मेरे खेत और मिट्टी" },
  "dashboard.my_plots_desc":  { English: "Map your farm segments, check soil reports, and analyze NPK trends.", Hindi: "अपने खेत के हिस्सों को मैप करें, मिट्टी रिपोर्ट देखें और NPK रुझानों का विश्लेषण करें।" },
  "dashboard.plots_btn":      { English: "Manage Land", Hindi: "भूमि प्रबंधित करें" },
  
  "dashboard.tasks_schedule": { English: "Farm Task Manager", Hindi: "कार्य प्रबंधक" },
  "dashboard.tasks_schedule_desc": { English: "Organize daily operations, fertilizer, and irrigation schedule.", Hindi: "दैनिक गतिविधियों, खाद और सिंचाई समय सारिणी को व्यवस्थित करें।" },
  "dashboard.tasks_btn":      { English: "View To-Dos", Hindi: "कार्य सूची देखें" },
  
  "dashboard.mandi_rates":    { English: "Live Mandi Rates", Hindi: "लाइव बाज़ार भाव" },
  "dashboard.mandi_rates_desc": { English: "Compare prices of agricultural commodities in nearby districts.", Hindi: "आसपास के जिलों में कृषि उपज के भावों की तुलना करें।" },
  "dashboard.mandi_btn":      { English: "Check Prices", Hindi: "बाज़ार भाव देखें" },
  
  "dashboard.profile_settings": { English: "Profile & Settings", Hindi: "प्रोफ़ाइल और सेटिंग्स" },
  "dashboard.profile_settings_desc": { English: "Configure language preference, theme, and farm profile context.", Hindi: "भाषा प्राथमिकता, थीम और खेत प्रोफ़ाइल संदर्भ को कॉन्फ़िगर करें।" },
  "dashboard.profile_btn":    { English: "Open Profile", Hindi: "प्रोफ़ाइल खोलें" },
  
  "dashboard.ask_ai_placeholder": { English: "Ask AI advisor about crops, soil, pests...", Hindi: "फसल, मिट्टी, कीटों के बारे में AI सलाहकार से पूछें..." },
  "dashboard.ask_ai_btn":     { English: "Ask Advisor", Hindi: "सलाहकार से पूछें" },
  "dashboard.ask_ai_suggestions": { English: "Try asking:", Hindi: "पूछ कर देखें:" },
  "dashboard.suggestion1":    { English: "What is the best irrigation schedule for wheat?", Hindi: "गेहूं के लिए सबसे अच्छा सिंचाई कार्यक्रम क्या है?" },
  "dashboard.suggestion2":    { English: "How do I cure leaf curl disease in tomato?", Hindi: "टमाटर में लीफ कर्ल बीमारी का इलाज कैसे करें?" },
  "dashboard.suggestion3":    { English: "What organic fertilizer increases crop yield?", Hindi: "फसल की उपज बढ़ाने के लिए कौन सा जैविक उर्वरक अच्छा है?" },
  "dashboard.quick_complete": { English: "Completed!", Hindi: "पूर्ण हुआ!" },
  "dashboard.no_tasks":       { English: "All caught up! No pending tasks.", Hindi: "सभी कार्य पूरे! कोई लंबित कार्य नहीं है।" },
};

// ─── Provider ──────────────────────────────────────────────────
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("agroaid-language") as Language | null;
    if (stored === "Hindi" || stored === "English") return stored;
    // Check profile preference stored by Profile component
    const profilePref = localStorage.getItem("preferredLanguage");
    if (profilePref === "Hindi" || profilePref === "English") return profilePref as Language;
    return "English";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("agroaid-language", lang);
    localStorage.setItem("preferredLanguage", lang);
  };

  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] ?? entry["English"] ?? key;
  };

  const isHindi = language === "Hindi";

  useEffect(() => {
    // Sync with profile preferredLanguage changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "preferredLanguage" && (e.newValue === "Hindi" || e.newValue === "English")) {
        setLanguageState(e.newValue as Language);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isHindi }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
