/**
 * Hindi UI strings, keyed by the English source text. Terminology follows the
 * web frontend's dictionary (frontend/src/lib/i18n/hi.ts): प्रोजेक्ट,
 * कैंडिडेट, सिमुलेशन, सत्यापन. Acronyms (ANSYS, RC, CAPEX, NPV), IDs, units
 * and numbers are deliberately left untranslated.
 */
export const hi: Record<string, string> = {
  // Navigation
  Home: "होम",
  Projects: "प्रोजेक्ट",
  History: "इतिहास",
  Settings: "सेटिंग्स",
  Reports: "रिपोर्ट",
  Candidates: "कैंडिडेट",
  Results: "परिणाम",
  "New project": "नया प्रोजेक्ट",
  "New shelter": "नया शेल्टर",
  "Sign in": "साइन इन",

  // Header / status
  "MIL-SPEC Thermal Platform": "MIL-SPEC थर्मल प्लेटफ़ॉर्म",
  "SOLVER ENGINE READY": "सॉल्वर इंजन तैयार",
  "DEMO MODE": "डेमो मोड",
  "SOLVER OFFLINE": "सॉल्वर ऑफ़लाइन",
  "CHECKING…": "जाँच जारी…",
  OFFLINE: "ऑफ़लाइन",
  "DEMO DATA": "डेमो डेटा",
  "COCOON system status": "COCOON सिस्टम स्थिति",
  "Recent projects": "हाल के प्रोजेक्ट",
  "Recent runs": "हाल के रन",
  "Shelter design": "शेल्टर डिज़ाइन",
  "Enter mission requirements; the COCOON backend generates, simulates, prices and ranks shelter designs.":
    "मिशन आवश्यकताएँ दर्ज करें; COCOON बैकएंड शेल्टर डिज़ाइन बनाता है, उनका सिमुलेशन, मूल्यांकन और रैंकिंग करता है।",

  // Common actions
  Next: "आगे",
  Back: "पीछे",
  Review: "समीक्षा",
  Retry: "फिर से प्रयास करें",
  Continue: "जारी रखें",
  "Save draft": "ड्राफ़्ट सहेजें",
  "Generate designs": "डिज़ाइन बनाएँ",
  "View results": "परिणाम देखें",
  "View candidates": "कैंडिडेट देखें",
  "Download JSON": "JSON डाउनलोड करें",
  "Create and continue": "बनाएँ और जारी रखें",
  "Browse candidates": "कैंडिडेट देखें",
  Compare: "तुलना करें",
  Select: "चुनें",
  View: "देखें",

  // Wizard
  Location: "स्थान",
  Weather: "मौसम",
  Mission: "मिशन",
  Occupancy: "अधिभोग",
  Rooms: "कमरे",
  Footprint: "फ़ुटप्रिंट",
  Materials: "सामग्री",
  Comfort: "आराम",
  Budget: "बजट",
  "Where the shelter will stand.": "शेल्टर कहाँ स्थापित होगा।",
  "The period the design is evaluated over.": "वह अवधि जिस पर डिज़ाइन का मूल्यांकन होता है।",
  "What the shelter is for.": "शेल्टर का उद्देश्य।",
  "Who uses the shelter.": "शेल्टर का उपयोग कौन करेगा।",
  "Spaces the layout must include.": "लेआउट में शामिल किए जाने वाले स्थान।",
  "Limits on size and orientation.": "आकार और दिशा की सीमाएँ।",
  "What the envelope may be built from.": "आवरण किन सामग्रियों से बन सकता है।",
  "The indoor conditions to maintain.": "बनाए रखने योग्य आंतरिक स्थितियाँ।",
  "Cost, logistics and heating limits.": "लागत, लॉजिस्टिक्स और हीटिंग सीमाएँ।",
  "Check everything before generating designs.": "डिज़ाइन बनाने से पहले सब कुछ जाँचें।",
  Step: "चरण",
  of: "में से",
  "Draft saved": "ड्राफ़्ट सहेजा गया",
  "Saving…": "सहेजा जा रहा है…",
  "Save failed": "सहेजना विफल",
  Valid: "मान्य",

  // Results tabs
  Overview: "सारांश",
  Energy: "ऊर्जा",
  Economics: "अर्थशास्त्र",
  "3D": "3D",
  Validation: "सत्यापन",
  Evidence: "साक्ष्य",

  // Project status
  Draft: "ड्राफ़्ट",
  "Requirements complete": "आवश्यकताएँ पूर्ण",
  Generating: "बनाया जा रहा है",
  "Candidates ready": "कैंडिडेट तैयार",
  "Generation failed": "निर्माण विफल",
  LOCAL: "स्थानीय",
  REMOTE: "रिमोट",
  DEMO: "डेमो",

  // Job states
  QUEUED: "कतार में",
  "Running COCOON thermal pipeline": "COCOON थर्मल पाइपलाइन चल रही है",
  COMPLETED: "पूर्ण",
  FAILED: "विफल",

  // Settings
  Language: "भाषा",
  Units: "इकाइयाँ",
  Temperature: "तापमान",
  Backend: "बैकएंड",
  "Offline cache": "ऑफ़लाइन कैश",
  "Sync queue": "सिंक कतार",
  Notifications: "सूचनाएँ",
  Authentication: "प्रमाणीकरण",
  About: "परिचय",
  "Clear cached data": "कैश डेटा साफ़ करें",

  // Auth
  "Authentication service unavailable": "प्रमाणीकरण सेवा उपलब्ध नहीं है",
  Register: "पंजीकरण",
  "Forgot password": "पासवर्ड भूल गए",
  "Reset password": "पासवर्ड रीसेट करें",
};
