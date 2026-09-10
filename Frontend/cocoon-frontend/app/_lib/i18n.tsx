"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "hi";

const STORAGE_KEY = "cocoon-lang";

/**
 * Every user-facing string in the app, keyed by a short id.
 * `en` is the source of truth; `hi` is the Hindi translation.
 * Numbers, unit symbols (°C, W/m²·K, mm), coordinates, IDs and standards
 * names (ISO 13790, ANSYS, NASA) are intentionally left as-is in both.
 */
const DICT: Record<string, { en: string; hi: string }> = {
  // ---- header / nav ----------------------------------------------------------
  "hdr.tagline": { en: "Predict. Compare. Validate.", hi: "पूर्वानुमान। तुलना। सत्यापन।" },
  "hdr.suite": { en: "PGML Suite", hi: "PGML सुइट" },
  "nav.home": { en: "Home", hi: "होम" },
  "nav.configure": { en: "Configure", hi: "कॉन्फ़िगर" },
  "nav.results": { en: "Results", hi: "परिणाम" },
  "hdr.mode.Individual": { en: "Individual Mode", hi: "व्यक्तिगत मोड" },
  "hdr.mode.Organization": { en: "Organization Mode", hi: "संगठन मोड" },
  "hdr.switchMode": { en: "Switch Mode", hi: "मोड बदलें" },
  "lang.aria": { en: "Change language", hi: "भाषा बदलें" },

  // ---- shared --------------------------------------------------------------
  "common.switch": { en: "Switch", hi: "बदलें" },
  "common.cancel": { en: "Cancel", hi: "रद्द करें" },
  "common.runSim": { en: "Run Simulation", hi: "सिमुलेशन चलाएँ" },

  // ---- home / mode picker --------------------------------------------------
  "home.badge": { en: "SUB-ZERO THERMAL ARCHITECTURE", hi: "सब-ज़ीरो थर्मल आर्किटेक्चर" },
  "home.q": { en: "Who's designing today?", hi: "आज कौन डिज़ाइन कर रहा है?" },
  "home.sub": {
    en: "Choose the mode that fits your need — no technical background required for either.",
    hi: "अपनी ज़रूरत के अनुरूप मोड चुनें — किसी के लिए भी तकनीकी पृष्ठभूमि आवश्यक नहीं।",
  },
  "home.ind.tag": { en: "Simplified Presets", hi: "सरल प्रीसेट" },
  "home.ind.title": { en: "Individual / Household", hi: "व्यक्ति / घर" },
  "home.ind.desc": {
    en: "Quick shelter comfort estimate using proven construction presets. No engineering input needed.",
    hi: "सिद्ध निर्माण प्रीसेट से आश्रय के आराम का त्वरित अनुमान। किसी इंजीनियरिंग इनपुट की आवश्यकता नहीं।",
  },
  "home.ind.f1": {
    en: "One-click traditional wall & roof presets (Adobe, Stone, Rammed Earth)",
    hi: "एक-क्लिक पारंपरिक दीवार व छत प्रीसेट (एडोब, पत्थर, रैम्ड अर्थ)",
  },
  "home.ind.f2": {
    en: "Plain-language glazing & heater levels (Off, Low, Med, High)",
    hi: "सरल भाषा में ग्लेज़िंग व हीटर स्तर (बंद, कम, मध्यम, अधिक)",
  },
  "home.ind.f3": {
    en: "Instant 48-hr room temperature forecast with habitability zone",
    hi: "रहने-योग्य क्षेत्र सहित तत्काल 48-घंटे कमरा-तापमान पूर्वानुमान",
  },
  "home.ind.metric": { en: "ESTIMATION TIME", hi: "अनुमान समय" },
  "home.ind.metricVal": { en: "< 60 SECONDS", hi: "< 60 सेकंड" },
  "home.ind.cta": { en: "Continue as Individual", hi: "व्यक्ति के रूप में जारी रखें" },
  "home.org.tag": { en: "Defense & CAE Grade", hi: "रक्षा एवं CAE ग्रेड" },
  "home.org.title": { en: "Organization / Engineer", hi: "संगठन / इंजीनियर" },
  "home.org.desc": {
    en: "Full control over material layers, thermal coefficients, and ANSYS-validated analysis for professional deployment planning.",
    hi: "सामग्री परतों, थर्मल गुणांकों और ANSYS-सत्यापित विश्लेषण पर पूर्ण नियंत्रण — पेशेवर परिनियोजन योजना के लिए।",
  },
  "home.org.f1": {
    en: "Custom multi-layer composite envelope builder with live U-values",
    hi: "लाइव U-मान के साथ कस्टम मल्टी-लेयर कम्पोज़िट एन्वेलप बिल्डर",
  },
  "home.org.f2": {
    en: "Advanced NASA earth-skin & heat transfer coefficients (hi/ho)",
    hi: "उन्नत NASA अर्थ-स्किन व ऊष्मा-स्थानांतरण गुणांक (hi/ho)",
  },
  "home.org.f3": {
    en: "Multi-physics ANSYS Fluent 3D FEM benchmarking & audit export",
    hi: "मल्टी-फ़िज़िक्स ANSYS Fluent 3D FEM बेंचमार्किंग व ऑडिट निर्यात",
  },
  "home.org.metric": { en: "SOLVER ACCURACY", hi: "सॉल्वर सटीकता" },
  "home.org.metricVal": { en: "FEM CONVERGENCE 10⁻⁴", hi: "FEM अभिसरण 10⁻⁴" },
  "home.org.cta": { en: "Continue as Organization", hi: "संगठन के रूप में जारी रखें" },
  "home.switchNote": {
    en: "You can switch modes anytime from the navigation bar.",
    hi: "आप नेविगेशन बार से कभी भी मोड बदल सकते हैं।",
  },
  "home.std1": { en: "ISO 13790 DYNAMIC THERMAL", hi: "ISO 13790 डायनामिक थर्मल" },
  "home.std2": { en: "ASHRAE 55 COMFORT LIMITS", hi: "ASHRAE 55 कम्फ़र्ट सीमाएँ" },
  "home.std3": { en: "EN 12831 PEAK HEATING", hi: "EN 12831 पीक हीटिंग" },
  "home.valActive": { en: "HIGH-ALTITUDE VALIDATION ACTIVE", hi: "उच्च-ऊँचाई सत्यापन सक्रिय" },

  // ---- individual / configure -------------------------------------------------
  "icfg.crumb1": { en: "Parametric Quick-Setup", hi: "पैरामीट्रिक त्वरित-सेटअप" },
  "icfg.crumb2": { en: "Defense Habitability Standard", hi: "रक्षा रहने-योग्यता मानक" },
  "icfg.title": { en: "Design My Shelter", hi: "मेरा आश्रय डिज़ाइन करें" },
  "icfg.sub": {
    en: "Give the size, the windows and doors, and how you'll live in it. The model designs the walls, roof, floor and insulation for Leh's winter and predicts the inside temperature.",
    hi: "आकार, खिड़कियाँ व दरवाज़े, और आप इसमें कैसे रहेंगे यह बताएँ। मॉडल लेह की सर्दी के लिए दीवारें, छत, फ़र्श व इन्सुलेशन डिज़ाइन करता है और अंदर का तापमान बताता है।",
  },
  "icfg.numDoor": { en: "Number of Doors", hi: "दरवाज़ों की संख्या" },
  "icfg.pipelineDesigns": {
    en: "You don't choose the materials — the model tries many wall / roof / floor material and thickness combinations for this box and returns the best one on the results page.",
    hi: "आप सामग्री नहीं चुनते — मॉडल इस बॉक्स हेतु अनेक दीवार / छत / फ़र्श सामग्री व मोटाई संयोजन आज़माता है और परिणाम पृष्ठ पर सर्वोत्तम देता है।",
  },
  "icfg.designCta": { en: "Design My Shelter", hi: "मेरा आश्रय डिज़ाइन करें" },
  "icfg.s1": { en: "Geometry & Spatial Volume", hi: "ज्यामिति व स्थानिक आयतन" },
  "icfg.s1tag": { en: "Cartesian Bounds (Meters)", hi: "कार्टेशियन सीमाएँ (मीटर)" },
  "icfg.len": { en: "Length (L)", hi: "लंबाई (L)" },
  "icfg.wid": { en: "Width (W)", hi: "चौड़ाई (W)" },
  "icfg.hgt": { en: "Height (H)", hi: "ऊँचाई (H)" },
  "icfg.ew": { en: "East-West", hi: "पूर्व-पश्चिम" },
  "icfg.ns": { en: "North-South", hi: "उत्तर-दक्षिण" },
  "icfg.apex": { en: "Clear Apex", hi: "स्पष्ट शीर्ष" },
  "icfg.floorArea": { en: "Floor Area", hi: "फ़र्श क्षेत्र" },
  "icfg.encVol": { en: "Enclosed Volume", hi: "घिरा हुआ आयतन" },
  "icfg.s2": { en: "Construction Presets (Simplified)", hi: "निर्माण प्रीसेट (सरल)" },
  "icfg.s2tag": { en: "Himalayan Tested", hi: "हिमालय में परीक्षित" },
  "icfg.wall.title": { en: "Wall Assembly", hi: "दीवार असेंबली" },
  "icfg.wall.desc": { en: "Primary thermal envelope perimeter", hi: "प्राथमिक थर्मल एन्वेलप परिधि" },
  "icfg.wall.tag": { en: "Passive solar retention", hi: "निष्क्रिय सौर संधारण" },
  "icfg.roof.title": { en: "Roof Assembly", hi: "छत असेंबली" },
  "icfg.roof.desc": { en: "Overhead heat loss prevention", hi: "ऊपरी ऊष्मा-हानि रोकथाम" },
  "icfg.roof.tag": { en: "Vernacular ceiling deck", hi: "पारंपरिक छत डेक" },
  "icfg.floor.title": { en: "Floor Assembly", hi: "फ़र्श असेंबली" },
  "icfg.floor.desc": { en: "Subgrade cold sink barrier", hi: "सबग्रेड शीत-सिंक अवरोध" },
  "icfg.floor.tag": { en: "Timber gap buffer", hi: "लकड़ी अंतराल बफ़र" },
  "icfg.opt.adobe": {
    en: "Adobe Wall (600mm) — Traditional High Thermal Mass",
    hi: "एडोब दीवार (600mm) — पारंपरिक उच्च थर्मल मास",
  },
  "icfg.opt.stone": {
    en: "Stone Masonry Wall (600mm) — High-Altitude Vernacular",
    hi: "पत्थर चिनाई दीवार (600mm) — उच्च-ऊँचाई पारंपरिक",
  },
  "icfg.opt.rammed": {
    en: "Rammed Earth Wall (500mm) — Natural Passive",
    hi: "रैम्ड अर्थ दीवार (500mm) — प्राकृतिक निष्क्रिय",
  },
  "icfg.s3": { en: "Windows & Daylight Glazing", hi: "खिड़कियाँ व दिन-प्रकाश ग्लेज़िंग" },
  "icfg.s3tag": { en: "Solar Gain Apertures", hi: "सौर-लाभ द्वार" },
  "icfg.numWin": { en: "Number of Windows", hi: "खिड़कियों की संख्या" },
  "icfg.units": { en: "units", hi: "इकाई" },
  "icfg.winPriority": { en: "South/East facing priority", hi: "दक्षिण/पूर्व-मुखी प्राथमिकता" },
  "icfg.dims": { en: "Dimensions (W x H)", hi: "आयाम (चौ. × ऊँ.)" },
  "icfg.apArea": { en: "Per-aperture glazed area", hi: "प्रति-द्वार शीशा क्षेत्र" },
  "icfg.glzQ": { en: "Glazing Quality", hi: "ग्लेज़िंग गुणवत्ता" },
  "icfg.opt.single": { en: "Single Glazing — Basic (Drafty)", hi: "सिंगल ग्लेज़िंग — बेसिक (हवादार)" },
  "icfg.opt.double": { en: "Double Glazing — Better (Recommended)", hi: "डबल ग्लेज़िंग — बेहतर (अनुशंसित)" },
  "icfg.opt.triple": {
    en: "Triple Glazing — Best Insulation (Arctic Grade)",
    hi: "ट्रिपल ग्लेज़िंग — सर्वोत्तम इंसुलेशन (आर्कटिक ग्रेड)",
  },
  "icfg.glzGrade": { en: "Acoustic & airtightness grade", hi: "ध्वनिक व वायुरोधन ग्रेड" },
  "icfg.s4": { en: "Comfort & Internal Heating", hi: "आराम व आंतरिक हीटिंग" },
  "icfg.s4tag": { en: "Occupancy & Auxiliary Thermal", hi: "अधिवास व सहायक थर्मल" },
  "icfg.initTemp": { en: "Initial Indoor Temperature", hi: "प्रारंभिक इनडोर तापमान" },
  "icfg.initTempDesc": {
    en: "Pre-simulation base interior shelter temperature",
    hi: "सिमुलेशन-पूर्व आधार आंतरिक आश्रय तापमान",
  },
  "icfg.frozen": { en: "-10°C (Frozen)", hi: "-10°C (जमा हुआ)" },
  "icfg.warm": { en: "+22°C (Warm)", hi: "+22°C (गर्म)" },
  "icfg.occLoad": { en: "Hourly Occupancy Load", hi: "प्रति-घंटा अधिवास भार" },
  "icfg.people": { en: "people", hi: "लोग" },
  "icfg.occDesc": {
    en: "Cumulative metabolic heat output and breathing load",
    hi: "संचयी चयापचय ऊष्मा-उत्पादन व श्वसन भार",
  },
  "icfg.heater": { en: "Heater Setting", hi: "हीटर सेटिंग" },
  "icfg.opt.off": { en: "Off", hi: "बंद" },
  "icfg.opt.low": { en: "Low", hi: "कम" },
  "icfg.opt.medium": { en: "Medium", hi: "मध्यम" },
  "icfg.opt.high": { en: "High", hi: "अधिक" },
  "icfg.heaterDesc": {
    en: "Auxiliary heat and comfort reserve for overnight survival",
    hi: "रात-भर के लिए सहायक ऊष्मा व आराम आरक्षित",
  },

  // ---- individual / results -------------------------------------------------
  "ires.eyebrow": { en: "Thermal Telemetry Evaluation", hi: "थर्मल टेलीमेट्री मूल्यांकन" },
  "ires.simId": { en: "Simulation ID: LEH-IND-2026-08A", hi: "सिमुलेशन ID: LEH-IND-2026-08A" },
  "ires.title": { en: "48-Hour Household Thermal Assessment", hi: "48-घंटे घरेलू थर्मल आकलन" },
  "ires.sub": {
    en: "Estimated room temperature for 6.0 × 4.0m Adobe Wall shelter in Leh winter conditions.",
    hi: "लेह सर्दी की स्थिति में 6.0 × 4.0मी एडोब-दीवार आश्रय के लिए अनुमानित कमरा-तापमान।",
  },
  "ires.exportSummary": { en: "Export Summary", hi: "सारांश निर्यात करें" },
  "ires.physicsModel": { en: "Physics Model", hi: "भौतिकी मॉडल" },
  "ires.mlRapid": { en: "ML Rapid Estimate", hi: "ML त्वरित अनुमान" },
  "ires.legPredicted": { en: "Predicted Room Temp", hi: "अनुमानित कमरा-तापमान" },
  "ires.legOutdoor": { en: "Outdoor Sub-Zero Temp", hi: "बाहरी सब-ज़ीरो तापमान" },
  "ires.legComfort": { en: "Comfort Zone (+16°C to +22°C)", hi: "आराम क्षेत्र (+16°C से +22°C)" },
  "ires.chartTitle": { en: "Transient Thermal Response (0h - 48h)", hi: "क्षणिक थर्मल प्रतिक्रिया (0घं - 48घं)" },
  "ires.timestep": { en: "Timestep: 1.0 hr", hi: "टाइमस्टेप: 1.0 घं" },
  "ires.elapsed": { en: "Elapsed:", hi: "बीता समय:" },
  "ires.indoor": { en: "Indoor:", hi: "इनडोर:" },
  "ires.outdoor": { en: "Outdoor:", hi: "आउटडोर:" },
  "ires.hoverHint": { en: "Hover along graph to sample hours", hi: "घंटे देखने के लिए ग्राफ़ पर होवर करें" },
  "ires.minTemp": { en: "Minimum Room Temp", hi: "न्यूनतम कमरा-तापमान" },
  "ires.minDetail": { en: "Occurs: 05:30 AM (Coldest Exterior)", hi: "समय: 05:30 AM (सबसे ठंडा बाहर)" },
  "ires.maxTemp": { en: "Maximum Room Temp", hi: "अधिकतम कमरा-तापमान" },
  "ires.maxDetail": { en: "Occurs: 15:15 PM (South Glazing)", hi: "समय: 15:15 PM (दक्षिण ग्लेज़िंग)" },
  "ires.avgTemp": { en: "Average Room Temp", hi: "औसत कमरा-तापमान" },
  "ires.avgDetail": { en: "ΔT vs Outdoor: +36.2°C Delta", hi: "बाहर की तुलना में ΔT: +36.2°C" },
  "ires.fuel": { en: "Daily Fuel Equivalent", hi: "दैनिक ईंधन समतुल्य" },
  "ires.fuelDetail": { en: "Passive envelope insulation benefit", hi: "निष्क्रिय एन्वेलप इंसुलेशन लाभ" },
  "ires.meansTitle": { en: "What This Means For Your Shelter", hi: "आपके आश्रय के लिए इसका क्या अर्थ है" },
  "ires.certified": { en: "Safe Habitat Certified", hi: "सुरक्षित आवास प्रमाणित" },
  "ires.meansBody": {
    en: "Your selected 600mm Adobe walls and double-glazed windows store warmth gathered during sunny daylight hours and release it gently through the sub-zero night. Even when the outside temperature drops to -24.8°C, the shelter stays comfortably above freezing without requiring dangerously heavy fuel stoves.",
    hi: "आपकी चुनी हुई 600mm एडोब दीवारें और डबल-ग्लेज़्ड खिड़कियाँ धूप वाले दिन में जमा हुई गर्मी को संग्रहित करती हैं और सब-ज़ीरो रात में धीरे-धीरे छोड़ती हैं। बाहर का तापमान -24.8°C तक गिरने पर भी, आश्रय खतरनाक रूप से भारी ईंधन-स्टोव के बिना आराम से हिमांक से ऊपर रहता है।",
  },
  "ires.frost.title": { en: "Frost Protected", hi: "पाला-रोधी" },
  "ires.frost.val": { en: "100% Freezing Avoidance", hi: "100% हिमीकरण से बचाव" },
  "ires.solar.title": { en: "Solar Retention", hi: "सौर संधारण" },
  "ires.solar.val": { en: "4.8 hrs passive heat storage", hi: "4.8 घंटे निष्क्रिय ऊष्मा-भंडारण" },
  "ires.air.title": { en: "Air Quality", hi: "वायु गुणवत्ता" },
  "ires.air.val": { en: "Low indoor smoke dependency", hi: "कम इनडोर धुआँ-निर्भरता" },
  "ires.shelterParams": { en: "Shelter Parameters", hi: "आश्रय पैरामीटर" },
  "ires.footprint": { en: "Footprint", hi: "क्षेत्रफल" },
  "ires.wallMat": { en: "Wall Material", hi: "दीवार सामग्री" },
  "ires.wallMatVal": { en: "Adobe Earth (600 mm)", hi: "एडोब मिट्टी (600 mm)" },
  "ires.glazing": { en: "Glazing", hi: "ग्लेज़िंग" },
  "ires.glazingVal": { en: "Double Pane", hi: "डबल पेन" },

  // ---- organization / configure -------------------------------------------
  "ocfg.tier": { en: "TIER-IV CALIBRATION", hi: "टियर-IV कैलिब्रेशन" },
  "ocfg.taskforce": {
    en: "Defense Infrastructure & Sub-Zero Habitat Taskforce",
    hi: "रक्षा अवसंरचना व सब-ज़ीरो आवास टास्कफ़ोर्स",
  },
  "ocfg.solverSync": { en: "PGML Solver Matrix: Synchronized", hi: "PGML सॉल्वर मैट्रिक्स: समन्वयित" },
  "ocfg.module": { en: "Module 04 // Parameter Formulation", hi: "मॉड्यूल 04 // पैरामीटर सूत्रीकरण" },
  "ocfg.title": {
    en: "Shelter Thermal Envelope & Multi-Physics Boundary Setup",
    hi: "आश्रय थर्मल एन्वेलप व मल्टी-फ़िज़िक्स बाउंड्री सेटअप",
  },
  "ocfg.sub": {
    en: "Define spatial boundary conditions, multi-layer composite thermophysics, and micro-climate baselines.",
    hi: "स्थानिक सीमा-स्थितियाँ, मल्टी-लेयर कम्पोज़िट थर्मोफ़िज़िक्स और सूक्ष्म-जलवायु आधाररेखाएँ परिभाषित करें।",
  },
  "ocfg.usePresets": { en: "Use Construction Presets", hi: "निर्माण प्रीसेट उपयोग करें" },
  "ocfg.customBuilder": { en: "Custom Layer Builder", hi: "कस्टम लेयर बिल्डर" },
  "ocfg.s1": { en: "1. Geometry & Spatial Volume", hi: "1. ज्यामिति व स्थानिक आयतन" },
  "ocfg.s1tag": { en: "Euler Boundary Grid: Hexahedral", hi: "यूलर बाउंड्री ग्रिड: हेक्साहेड्रल" },
  "ocfg.boxOpenings": { en: "Shelter Size & Openings", hi: "आश्रय आकार व द्वार-खिड़कियाँ" },
  "ocfg.youProvide": { en: "YOU PROVIDE", hi: "आप देते हैं" },
  "ocfg.winCount": { en: "Number of windows", hi: "खिड़कियों की संख्या" },
  "ocfg.winW": { en: "Window width", hi: "खिड़की चौड़ाई" },
  "ocfg.winH": { en: "Window height", hi: "खिड़की ऊँचाई" },
  "ocfg.doorCount": { en: "Number of doors", hi: "दरवाज़ों की संख्या" },
  "ocfg.pipelinePicks": {
    en: "The pipeline chooses the wall, roof and floor materials, their thicknesses, the insulation and the glazing type — and returns the best combination for this box.",
    hi: "पाइपलाइन दीवार, छत व फ़र्श की सामग्री, उनकी मोटाई, इन्सुलेशन व ग्लेज़िंग प्रकार चुनती है — और इस बॉक्स हेतु सर्वोत्तम संयोजन देती है।",
  },
  "ocfg.len": { en: "Length (L)", hi: "लंबाई (L)" },
  "ocfg.wid": { en: "Width (W)", hi: "चौड़ाई (W)" },
  "ocfg.hgt": { en: "Height (H)", hi: "ऊँचाई (H)" },
  "ocfg.encVol": { en: "ENCLOSED VOL.", hi: "घिरा आयतन" },
  "ocfg.extSurf": { en: "EXT. SURFACE", hi: "बाह्य सतह" },
  "ocfg.formFactor": { en: "FORM FACTOR (A/V)", hi: "फ़ॉर्म फ़ैक्टर (A/V)" },
  "ocfg.aspectNote": {
    en: "Aspect ratio optimization automatically feeds convection face orientation vectors to the computational aerodynamic boundary kernel.",
    hi: "आस्पेक्ट-रेशियो अनुकूलन स्वचालित रूप से संवहन-फलक अभिविन्यास सदिशों को कम्प्यूटेशनल वायुगतिकीय बाउंड्री कर्नेल में भेजता है।",
  },
  "ocfg.isoProj": { en: "ISO PROJECTION: AXONOMETRIC 30°", hi: "ISO प्रोजेक्शन: एक्सोनोमेट्रिक 30°" },
  "ocfg.solarAz": { en: "SOLAR AZIMUTH: 184.2° SSE", hi: "सौर दिगंश: 184.2° SSE" },
  "ocfg.s2": {
    en: "2. Multi-Layer Envelope (Custom Layer Builder)",
    hi: "2. मल्टी-लेयर एन्वेलप (कस्टम लेयर बिल्डर)",
  },
  "ocfg.s2tag": { en: "1D Fourier Conduction Coupled", hi: "1D फ़ूरियर चालन युग्मित" },
  "ocfg.wall.title": { en: "Exterior Wall Assembly", hi: "बाहरी दीवार असेंबली" },
  "ocfg.wall.sub": { en: "Sub-zero Windward Exposure", hi: "सब-ज़ीरो पवनाभिमुख अनावरण" },
  "ocfg.wall.mat": { en: "PUF Insulation Sandwich", hi: "PUF इंसुलेशन सैंडविच" },
  "ocfg.roof.title": { en: "Roof / Overhead Plenum", hi: "छत / ऊपरी प्लेनम" },
  "ocfg.roof.sub": { en: "Solar Irradiance & Snow Load Interface", hi: "सौर विकिरण व हिम-भार अंतरापृष्ठ" },
  "ocfg.roof.mat": { en: "Multi-Tier Aerogel + Metal Decking", hi: "मल्टी-टियर एयरजेल + मेटल डेकिंग" },
  "ocfg.floor.title": { en: "Floor / Sub-grade Foundation", hi: "फ़र्श / सबग्रेड नींव" },
  "ocfg.floor.sub": { en: "Permafrost & Glacial Till Coupling", hi: "पर्माफ़्रॉस्ट व हिमनद-टिल युग्मन" },
  "ocfg.floor.mat": { en: "Extruded Polystyrene (XPS) + Vapor Screed", hi: "एक्सट्रूडेड पॉलीस्टाइरीन (XPS) + वेपर स्क्रीड" },
  "ocfg.coreMat": { en: "Core Material", hi: "कोर सामग्री" },
  "ocfg.totalThick": { en: "Total Thickness", hi: "कुल मोटाई" },
  "ocfg.thermTrans": { en: "Thermal Transmittance", hi: "थर्मल पारगम्यता" },
  "ocfg.s3": { en: "3. Advanced Thermal Parameters", hi: "3. उन्नत थर्मल पैरामीटर" },
  "ocfg.orgAccess": { en: "ORGANIZATION ACCESS", hi: "संगठन पहुँच" },
  "ocfg.s3tag": { en: "Convective & Capacitive Matrices", hi: "संवहनी व धारिता मैट्रिक्स" },
  "ocfg.intCap": { en: "Internal Capacitance (Contents)", hi: "आंतरिक धारिता (सामग्री)" },
  "ocfg.contentsMass": { en: "Contents Mass", hi: "सामग्री द्रव्यमान" },
  "ocfg.specHeat": { en: "Specific Heat (Cp)", hi: "विशिष्ट ऊष्मा (Cp)" },
  "ocfg.timeConstPre": { en: "Computed Thermal Time Constant (τ): ", hi: "परिकलित थर्मल समय-स्थिरांक (τ): " },
  "ocfg.timeConstVal": { en: "64.8 hrs", hi: "64.8 घंटे" },
  "ocfg.timeConstPost": { en: " damping effect on freeze surges.", hi: " — हिमीकरण-वृद्धि पर अवमंदन प्रभाव।" },
  "ocfg.boundaryCoef": { en: "Boundary Heat Transfer Coefficients", hi: "सीमा ऊष्मा-स्थानांतरण गुणांक" },
  "ocfg.insideConv": { en: "Inside Conv. (h_i)", hi: "आंतरिक संवहन (h_i)" },
  "ocfg.outsideConv": { en: "Outside Conv. (h_o)", hi: "बाह्य संवहन (h_o)" },
  "ocfg.windNote": {
    en: "Wind-exposed boundary convection modeled using high-altitude force coefficient correction and snow-ice roughness adjusters.",
    hi: "पवन-अनावृत सीमा संवहन को उच्च-ऊँचाई बल-गुणांक सुधार और हिम-बर्फ़ खुरदरापन समायोजकों से मॉडल किया गया है।",
  },

  // ---- organization / results --------------------------------------------
  "ores.eyebrow": { en: "Transient Validation", hi: "क्षणिक सत्यापन" },
  "ores.title": { en: "48-Hour Transient Thermal Analysis", hi: "48-घंटे क्षणिक थर्मल विश्लेषण" },
  "ores.sub": {
    en: "Simulated response for 6.0 × 4.0 × 2.8m PUF Shelter • Location: Leh (-22°C Peak Solstice) • Internal Load: 850W",
    hi: "6.0 × 4.0 × 2.8मी PUF आश्रय के लिए सिमुलेटेड प्रतिक्रिया • स्थान: लेह (-22°C पीक संक्रांति) • आंतरिक भार: 850W",
  },
  "ores.physRC": { en: "Physics (RC Network)", hi: "भौतिकी (RC नेटवर्क)" },
  "ores.mlSurrogate": { en: "ML Surrogate", hi: "ML सरोगेट" },
  "ores.ansysVal": { en: "ANSYS Validated (Overlay FEM)", hi: "ANSYS सत्यापित (ओवरले FEM)" },
  "ores.exportCsv": { en: "Export CSV Data", hi: "CSV डेटा निर्यात करें" },
  "ores.genPdf": { en: "Generate Defence Audit PDF", hi: "रक्षा ऑडिट PDF बनाएँ" },
  "ores.legIndoor": { en: "Predicted Indoor (°C)", hi: "अनुमानित इनडोर (°C)" },
  "ores.legOutdoor": { en: "Ambient Outdoor (°C)", hi: "परिवेश आउटडोर (°C)" },
  "ores.legFem": { en: "ANSYS Fluent 3D FEM (°C)", hi: "ANSYS Fluent 3D FEM (°C)" },
  "ores.legComfort": { en: "Comfort Zone (+16°C to +22°C)", hi: "आराम क्षेत्र (+16°C से +22°C)" },
  "ores.cursor": { en: "CURSOR:", hi: "कर्सर:" },
  "ores.amb": { en: "Amb:", hi: "परिवेश:" },
  "ores.indoor": { en: "Indoor:", hi: "इनडोर:" },
  "ores.minHab": { en: "Min Indoor Habitat", hi: "न्यूनतम इनडोर आवास" },
  "ores.minHabSub": { en: "Safe Threshold • T+22h", hi: "सुरक्षित सीमा • T+22घं" },
  "ores.maxHab": { en: "Max Indoor Habitat", hi: "अधिकतम इनडोर आवास" },
  "ores.maxHabSub": { en: "Controlled Solar Peak • T+38h", hi: "नियंत्रित सौर शिखर • T+38घं" },
  "ores.avgReg": { en: "Average Regime", hi: "औसत व्यवस्था" },
  "ores.avgRegSub": { en: "Target: 18.0°C ± 1.5°C", hi: "लक्ष्य: 18.0°C ± 1.5°C" },
  "ores.envLoss": { en: "Total Envelope Loss", hi: "कुल एन्वेलप हानि" },
  "ores.envLossSub": { en: "Thermal Efficiency: 91.4%", hi: "थर्मल दक्षता: 91.4%" },
  "ores.benchRigor": { en: "Benchmark Rigor", hi: "बेंचमार्क कठोरता" },
  "ores.converged": { en: "CONVERGED", hi: "अभिसरित" },
  "ores.precisionTitle": { en: "±0.8°C Precision vs 3D FEM", hi: "3D FEM की तुलना में ±0.8°C परिशुद्धता" },
  "ores.precisionDesc": {
    en: "Physics-guided graph neural network evaluated against finite element computational fluid dynamics.",
    hi: "फ़िनाइट-एलिमेंट कम्प्यूटेशनल फ़्लूइड डायनामिक्स के विरुद्ध मूल्यांकित भौतिकी-निर्देशित ग्राफ़ न्यूरल नेटवर्क।",
  },
  "ores.correlation": { en: "Correlation", hi: "सहसंबंध" },
  "ores.whyTitle": {
    en: "Why This Result: Physical Rationale & Defense Logistics",
    hi: "यह परिणाम क्यों: भौतिक तर्क व रक्षा लॉजिस्टिक्स",
  },
  "ores.highAltSpecs": { en: "HIGH-ALTITUDE SPECS", hi: "उच्च-ऊँचाई विनिर्देश" },
  "ores.whyBody": {
    en: "The high-insulation 150mm PUF sandwich envelope combined with 2,400 kJ/K internal thermal capacitance acts as a thermal flywheel. Despite outdoor ambient plunging to -26.0°C at 04:00 hrs, the 850W internal equipment load and residual solar heat storage maintain the core habitat well above the critical freezing threshold without supplemental diesel space heating.",
    hi: "उच्च-इंसुलेशन 150mm PUF सैंडविच एन्वेलप, 2,400 kJ/K आंतरिक थर्मल धारिता के साथ मिलकर एक थर्मल फ़्लाईव्हील की तरह काम करता है। 04:00 बजे बाहरी परिवेश के -26.0°C तक गिरने के बावजूद, 850W आंतरिक उपकरण-भार और अवशिष्ट सौर ऊष्मा-भंडारण कोर आवास को अतिरिक्त डीज़ल हीटिंग के बिना क्रांतिक हिमांक सीमा से काफ़ी ऊपर बनाए रखते हैं।",
  },
  "ores.opImpact": {
    en: "Operational Impact: Eliminates kerosene soot contamination risks in enclosed shelters and minimizes vulnerable high-mountain fuel convoys along the Zojila pass.",
    hi: "परिचालन प्रभाव: बंद आश्रयों में मिट्टी-तेल की कालिख संदूषण के जोखिम समाप्त करता है और ज़ोजिला दर्रे पर असुरक्षित उच्च-पर्वत ईंधन-काफ़िलों को न्यूनतम करता है।",
  },

  // ==== ADDED FOR PIPELINE ALIGNMENT (static / not yet wired) ================

  "common.mockNote": {
    en: "Preview values — not yet connected to the solver.",
    hi: "पूर्वावलोकन मान — अभी सॉल्वर से नहीं जुड़ा।",
  },
  "ires.mlDisabled": { en: "ML surrogate not yet available", hi: "ML सरोगेट अभी उपलब्ध नहीं" },
  "ires.download": { en: "Download report", hi: "रिपोर्ट डाउनलोड करें" },
  "res.heat.hourNote": { en: "Hourly loss by path (W)", hi: "पथ अनुसार प्रति-घंटा हानि (W)" },

  // ---- shared config: site, period, comfort, infiltration, ground ----------
  "cfg.site.title": { en: "Site & Analysis Period", hi: "स्थल व विश्लेषण अवधि" },
  "cfg.site.tag": { en: "10-YEAR NASA POWER ARCHIVE", hi: "10-वर्ष NASA POWER संग्रह" },
  "cfg.site.location": { en: "Location", hi: "स्थान" },
  "cfg.site.locationVal": { en: "Leh, Ladakh — 34.15° N, 77.58° E", hi: "लेह, लद्दाख — 34.15° N, 77.58° E" },
  "cfg.site.season": { en: "Season", hi: "मौसम" },
  "cfg.site.seasonWinter": { en: "Winter (Dec–Feb)", hi: "शीत (दिस.–फ़र.)" },
  "cfg.site.seasonSpring": { en: "Spring (Mar–May)", hi: "बसंत (मार्च–मई)" },
  "cfg.site.seasonSummer": { en: "Summer (Jun–Aug)", hi: "ग्रीष्म (जून–अग.)" },
  "cfg.site.seasonAutumn": { en: "Autumn (Sep–Nov)", hi: "शरद (सित.–नव.)" },
  "cfg.site.typicalWindow": { en: "Typical window (hours)", hi: "सामान्य विंडो (घंटे)" },
  "cfg.site.typicalHint": { en: "Representative stretch used for the temperature forecast.", hi: "तापमान पूर्वानुमान हेतु प्रतिनिधि अवधि।" },
  "cfg.site.worstWindow": { en: "Worst-case window (hours)", hi: "न्यूनतम-स्थिति विंडो (घंटे)" },
  "cfg.site.worstHint": { en: "Coldest historical stretch — used for ANSYS validation.", hi: "सबसे ठंडी ऐतिहासिक अवधि — ANSYS सत्यापन हेतु।" },

  "cfg.comfort.title": { en: "Comfort Target", hi: "आराम लक्ष्य" },
  "cfg.comfort.tag": { en: "DRIVES THE SCORE", hi: "स्कोर निर्धारक" },
  "cfg.comfort.target": { en: "Target indoor temperature", hi: "लक्ष्य इनडोर तापमान" },
  "cfg.comfort.bandLo": { en: "Comfort band — lower", hi: "आराम पट्टी — निचला" },
  "cfg.comfort.bandHi": { en: "Comfort band — upper", hi: "आराम पट्टी — ऊपरी" },
  "cfg.comfort.hint": { en: "Hours inside this band and distance from target set the comfort score.", hi: "इस पट्टी के भीतर घंटे और लक्ष्य से दूरी आराम स्कोर तय करते हैं।" },

  "cfg.env.title": { en: "Air Infiltration & Ground", hi: "वायु अंतःस्राव व भूमि" },
  "cfg.env.ach": { en: "Air changes per hour (ACH)", hi: "प्रति घंटा वायु-परिवर्तन (ACH)" },
  "cfg.env.achHint": { en: "Tent/hut 1.5–3 · panel shelter 0.3–0.7 · sealed 0.2", hi: "तंबू/झोपड़ी 1.5–3 · पैनल आश्रय 0.3–0.7 · सीलबंद 0.2" },
  "cfg.env.ground": { en: "Ground temperature", hi: "भूमि तापमान" },
  "cfg.env.groundAuto": { en: "10-year annual-mean air (recommended)", hi: "10-वर्ष वार्षिक-औसत वायु (अनुशंसित)" },
  "cfg.env.groundManual": { en: "Manual value", hi: "मैनुअल मान" },
  "cfg.env.groundManualVal": { en: "Ground temperature (°C)", hi: "भूमि तापमान (°C)" },

  // ---- layer builder -----------------------------------------------------
  "cfg.layers.title": { en: "Multi-Layer Envelope Builder", hi: "बहु-परत एन्वेलप बिल्डर" },
  "cfg.layers.tag": { en: "OUTER → INNER", hi: "बाहरी → भीतरी" },
  "cfg.layers.wall": { en: "Wall assembly", hi: "दीवार संयोजन" },
  "cfg.layers.roof": { en: "Roof assembly", hi: "छत संयोजन" },
  "cfg.layers.floor": { en: "Floor assembly", hi: "फ़र्श संयोजन" },
  "cfg.layers.structural": { en: "Structural / mass layer", hi: "संरचनात्मक / द्रव्यमान परत" },
  "cfg.layers.insulation": { en: "Insulation layer (exterior)", hi: "इंसुलेशन परत (बाहरी)" },
  "cfg.layers.addInsul": { en: "+ Add exterior insulation", hi: "+ बाहरी इंसुलेशन जोड़ें" },
  "cfg.layers.addLayer": { en: "+ Add layer", hi: "+ परत जोड़ें" },
  "cfg.layers.remove": { en: "Remove", hi: "हटाएँ" },
  "cfg.layers.material": { en: "Material", hi: "सामग्री" },
  "cfg.layers.thickness": { en: "Thickness", hi: "मोटाई" },
  "cfg.layers.assemblyU": { en: "Assembly U-value", hi: "संयोजन U-मान" },
  "cfg.layers.note": { en: "Cold-climate best practice: mass inside, insulation outside.", hi: "शीत-जलवायु सर्वोत्तम अभ्यास: द्रव्यमान भीतर, इंसुलेशन बाहर।" },

  // ---- internal heat gain (watts) --------------------------------------
  "cfg.gain.title": { en: "Internal Heat Gain", hi: "आंतरिक ऊष्मा लाभ" },
  "cfg.gain.derived": { en: "Total internal gain", hi: "कुल आंतरिक लाभ" },
  "cfg.gain.derivedHint": { en: "occupants × ~90 W + equipment/heater", hi: "रहवासी × ~90 W + उपकरण/हीटर" },
  "cfg.gain.equipment": { en: "Equipment load (W)", hi: "उपकरण भार (W)" },

  // ---- optional advanced (individual) ---------------------------------
  "cfg.adv.title": { en: "Advanced thermal parameters (optional)", hi: "उन्नत तापीय पैरामीटर (वैकल्पिक)" },
  "cfg.adv.contentsMass": { en: "Contents mass", hi: "सामग्री द्रव्यमान" },
  "cfg.adv.contentsCp": { en: "Contents specific heat", hi: "सामग्री विशिष्ट ऊष्मा" },
  "cfg.adv.hIn": { en: "Inside convection h_i", hi: "भीतरी संवहन h_i" },
  "cfg.adv.hOut": { en: "Outside convection h_o", hi: "बाहरी संवहन h_o" },
  "cfg.adv.hint": { en: "Leave at defaults unless you have measured values. Contents mass adds a thermal flywheel; convection coefficients are wind-refinable.", hi: "मापे गए मान न हों तो डिफ़ॉल्ट रहने दें। सामग्री द्रव्यमान तापीय फ़्लाईव्हील जोड़ता है; संवहन गुणांक पवन-आधारित परिष्करण योग्य हैं।" },

  // ---- optimizer inputs -----------------------------------------------
  "opt.mode.title": { en: "Analysis Mode", hi: "विश्लेषण मोड" },
  "opt.mode.evaluate": { en: "Evaluate this design", hi: "इस डिज़ाइन का मूल्यांकन" },
  "opt.mode.evaluateDesc": { en: "One shelter → temperature / solar / heat-flow reports.", hi: "एक आश्रय → तापमान / सौर / ऊष्मा-प्रवाह रिपोर्ट।" },
  "opt.mode.optimize": { en: "Find the best design", hi: "सर्वोत्तम डिज़ाइन खोजें" },
  "opt.mode.optimizeDesc": { en: "Search a design space → ranked shortlist → recommendation.", hi: "डिज़ाइन स्पेस खोजें → क्रमबद्ध शॉर्टलिस्ट → सिफ़ारिश।" },
  "opt.title": { en: "Optimizer — Search Settings", hi: "ऑप्टिमाइज़र — खोज सेटिंग्स" },
  "opt.tag": { en: "INVERSE DESIGN", hi: "प्रतिलोम डिज़ाइन" },
  "opt.pipelineNote": {
    en: "You've set the shelter size and openings above. The pipeline now generates this many envelope designs for that box — trying different wall / roof / floor materials, thicknesses, insulation and glazing — simulates each, and returns the best combination.",
    hi: "आपने ऊपर आश्रय का आकार व द्वार-खिड़कियाँ तय कीं। अब पाइपलाइन उस बॉक्स के लिए इतने एन्वेलप डिज़ाइन बनाती है — अलग-अलग दीवार / छत / फ़र्श सामग्री, मोटाई, इन्सुलेशन व ग्लेज़िंग आज़माकर — प्रत्येक का अनुकरण करती है, और सर्वोत्तम संयोजन देती है।",
  },
  "opt.designs": { en: "Number of candidate designs", hi: "उम्मीदवार डिज़ाइनों की संख्या" },
  "opt.designsHint": { en: "Envelope combinations tried for your box", hi: "आपके बॉक्स हेतु आज़माए गए एन्वेलप संयोजन" },
  "opt.seed": { en: "Random seed", hi: "रैंडम सीड" },
  "opt.seedHint": { en: "Same seed ⇒ same candidate pool", hi: "समान सीड ⇒ समान उम्मीदवार पूल" },
  "opt.trials": { en: "Sensitivity trials", hi: "संवेदनशीलता परीक्षण" },
  "opt.trialsHint": { en: "Robustness checks on the ranking", hi: "रैंकिंग पर मज़बूती जाँच" },
  "opt.constraints": { en: "Design-space constraints", hi: "डिज़ाइन-स्पेस बाधाएँ" },
  "opt.constraintsHint": { en: "Pre-filled from shelter_ratios_recommended.csv", hi: "shelter_ratios_recommended.csv से पूर्व-भरित" },
  "opt.materials": { en: "Allowed materials", hi: "अनुमत सामग्री" },
  "opt.runAnsys": { en: "Run ANSYS FEM cross-check", hi: "ANSYS FEM क्रॉस-जाँच चलाएँ" },
  "opt.runAnsysHint": { en: "Adds ~15–20 min. Off ⇒ result in ~1–2 min.", hi: "~15–20 मिनट जोड़ता है। बंद ⇒ ~1–2 मिनट में परिणाम।" },
  "opt.factor": { en: "Factor", hi: "कारक" },
  "opt.min": { en: "Min", hi: "न्यून." },
  "opt.max": { en: "Max", hi: "अधि." },
  "opt.f.aspect": { en: "Length-to-Width aspect ratio", hi: "लंबाई-चौड़ाई अनुपात" },
  "opt.f.av": { en: "Surface-Area-to-Volume (A/V)", hi: "पृष्ठ-क्षेत्र/आयतन (A/V)" },
  "opt.f.wwr": { en: "Window-to-Wall ratio (%)", hi: "खिड़की-दीवार अनुपात (%)" },
  "opt.f.height": { en: "Ceiling height (m)", hi: "छत ऊँचाई (m)" },
  "opt.f.floor": { en: "Floor area (m²)", hi: "फ़र्श क्षेत्र (m²)" },
  "opt.cta": { en: "Run Optimization", hi: "ऑप्टिमाइज़ेशन चलाएँ" },
  "opt.envHidden": {
    en: "In optimize mode you give the shelter size and the window / door counts. The pipeline designs the envelope — it picks the wall, roof and floor materials, their thicknesses, the insulation and the glazing, then returns the best combination.",
    hi: "ऑप्टिमाइज़ मोड में आप आश्रय का आकार व खिड़की / दरवाज़े की संख्या देते हैं। पाइपलाइन एन्वेलप डिज़ाइन करती है — दीवार, छत व फ़र्श की सामग्री, उनकी मोटाई, इन्सुलेशन व ग्लेज़िंग चुनती है, फिर सर्वोत्तम संयोजन देती है।",
  },
  "ocfg.timeConst": { en: "Thermal time constant τ", hi: "तापीय समय-स्थिरांक τ" },
  "res.mode.singleTitle": { en: "Single-Design Thermal Assessment", hi: "एकल-डिज़ाइन तापीय मूल्यांकन" },
  "res.mode.optimizeTitle": { en: "Design Optimization Results", hi: "डिज़ाइन ऑप्टिमाइज़ेशन परिणाम" },
  "res.exportCsv": { en: "Export data (CSV)", hi: "डेटा निर्यात (CSV)" },
  "res.exportReport": { en: "Full report (REPORT.md)", hi: "पूर्ण रिपोर्ट (REPORT.md)" },

  // ---- resolved configuration strip (results) -------------------------
  "res.cfg.title": { en: "Resolved Configuration", hi: "हल किया गया कॉन्फ़िगरेशन" },
  "res.cfg.uWall": { en: "Wall U-value", hi: "दीवार U-मान" },
  "res.cfg.uRoof": { en: "Roof U-value", hi: "छत U-मान" },
  "res.cfg.uFloor": { en: "Floor U-value", hi: "फ़र्श U-मान" },
  "res.cfg.capacitance": { en: "Thermal capacitance", hi: "थर्मल धारिता" },
  "res.cfg.infilUA": { en: "Infiltration UA", hi: "अंतःस्राव UA" },
  "res.cfg.mass": { en: "Envelope mass", hi: "एन्वेलप द्रव्यमान" },

  // ---- Feature 2 : solar thermal energy ------------------------------
  "res.solar.title": { en: "Solar Thermal Energy", hi: "सौर तापीय ऊर्जा" },
  "res.solar.tag": { en: "DRDO OUTPUT 2", hi: "DRDO आउटपुट 2" },
  "res.solar.total": { en: "Total solar energy", hi: "कुल सौर ऊर्जा" },
  "res.solar.peakGain": { en: "Peak solar gain", hi: "शिखर सौर लाभ" },
  "res.solar.peakIrr": { en: "Peak irradiance", hi: "शिखर विकिरण" },
  "res.solar.capFactor": { en: "Aperture capacity factor", hi: "द्वार क्षमता कारक" },
  "res.solar.corr": { en: "Solar ↔ ΔT correlation", hi: "सौर ↔ ΔT सहसंबंध" },
  "res.solar.dailyTitle": { en: "Daily captured energy", hi: "दैनिक संग्रहीत ऊर्जा" },
  "res.solar.hourlyTitle": { en: "Hourly solar gain", hi: "प्रति घंटा सौर लाभ" },
  "res.solar.cumTitle": { en: "Cumulative solar energy", hi: "संचयी सौर ऊर्जा" },

  // ---- Feature 3 : heat flow by path --------------------------------
  "res.heat.title": { en: "Heat Flow vs Ambient ΔT", hi: "ऊष्मा प्रवाह बनाम परिवेश ΔT" },
  "res.heat.tag": { en: "DRDO OUTPUT 3", hi: "DRDO आउटपुट 3" },
  "res.heat.totalLoss": { en: "Total heat loss (period)", hi: "कुल ऊष्मा-हानि (अवधि)" },
  "res.heat.peakLoss": { en: "Peak hourly loss", hi: "शिखर प्रति-घंटा हानि" },
  "res.heat.avgLoss": { en: "Average hourly loss", hi: "औसत प्रति-घंटा हानि" },
  "res.heat.peakDt": { en: "Peak ΔT (indoor − outdoor)", hi: "शिखर ΔT (इनडोर − आउटडोर)" },
  "res.heat.avgDt": { en: "Average ΔT", hi: "औसत ΔT" },
  "res.heat.split": { en: "Loss by path", hi: "पथ अनुसार हानि" },
  "res.heat.walls": { en: "Walls", hi: "दीवारें" },
  "res.heat.roof": { en: "Roof", hi: "छत" },
  "res.heat.floor": { en: "Floor", hi: "फ़र्श" },
  "res.heat.windows": { en: "Windows", hi: "खिड़कियाँ" },
  "res.heat.infil": { en: "Infiltration", hi: "अंतःस्राव" },
  "res.heat.stackTitle": { en: "Hourly loss by surface", hi: "सतह अनुसार प्रति-घंटा हानि" },

  // ---- ANSYS validation panel -------------------------------------
  "res.ansys.title": { en: "ANSYS FEM Cross-Validation", hi: "ANSYS FEM क्रॉस-सत्यापन" },
  "res.ansys.tag": { en: "TRANSIENT THERMAL MAPDL", hi: "क्षणिक तापीय MAPDL" },
  "res.ansys.contour": { en: "Temperature contour (worst-case hour)", hi: "तापमान कंटूर (न्यूनतम-स्थिति घंटा)" },
  "res.ansys.tableTitle": { en: "RC engine vs ANSYS — indoor temperature (°C)", hi: "RC इंजन बनाम ANSYS — इनडोर तापमान (°C)" },
  "res.ansys.design": { en: "Design", hi: "डिज़ाइन" },
  "res.ansys.agree": { en: "Ranking agrees between RC and FEM.", hi: "RC व FEM के बीच रैंकिंग सहमत।" },
  "res.ansys.tie": { en: "Ranking differs but design spread < model error → thermal tie; decide on logistics.", hi: "रैंकिंग भिन्न पर डिज़ाइन-अंतर < मॉडल-त्रुटि → तापीय बराबरी; लॉजिस्टिक्स पर निर्णय।" },
  "res.ansys.overlayTitle": { en: "RC engine vs ANSYS FEM — indoor temperature, hour by hour", hi: "RC इंजन बनाम ANSYS FEM — इनडोर तापमान, घंटे-दर-घंटे" },
  "res.ansys.fem": { en: "ANSYS FEM (3D)", hi: "ANSYS FEM (3D)" },
  "res.ansys.rc": { en: "RC model", hi: "RC मॉडल" },
  "res.ansys.gap": { en: "mean gap", hi: "औसत अंतर" },
  "res.ansys.overlayNote": {
    en: "Both models are run independently on the same worst-case weather (infiltration off on both sides). Lines that track each other = the fast RC model reproduces the 3D FEM; a sustained gap flags a design whose layer ordering the single-node model handles less well.",
    hi: "दोनों मॉडल एक ही न्यूनतम-स्थिति मौसम पर स्वतंत्र रूप से चलते हैं (दोनों में घुसपैठ बंद)। एक-दूसरे का अनुसरण करती रेखाएँ = तेज़ RC मॉडल 3D FEM को दोहराता है; लगातार अंतर उस डिज़ाइन को दर्शाता है जिसकी परत-क्रम को एकल-नोड मॉडल कम अच्छे से संभालता है।",
  },

  // ---- design comparison ----------------------------------------
  "res.compare.title": { en: "Design Comparison", hi: "डिज़ाइन तुलना" },
  "res.compare.tag": { en: "RANKED CANDIDATE POOL", hi: "क्रमबद्ध उम्मीदवार पूल" },
  "res.compare.note": {
    en: "Every candidate is the same box with a different envelope — wall / roof / floor material and thickness, insulation and glazing chosen by the pipeline. Ranked by comfort score.",
    hi: "हर उम्मीदवार वही बॉक्स है, अलग एन्वेलप के साथ — दीवार / छत / फ़र्श सामग्री व मोटाई, इन्सुलेशन व ग्लेज़िंग पाइपलाइन द्वारा चुने गए। आराम स्कोर से क्रमबद्ध।",
  },
  "res.compare.rank": { en: "Rank", hi: "रैंक" },
  "res.compare.id": { en: "ID", hi: "ID" },
  "res.compare.geom": { en: "L × W × H (m)", hi: "L × W × H (m)" },
  "res.compare.score": { en: "Comfort", hi: "आराम" },
  "res.compare.shortlisted": { en: "shortlist", hi: "शॉर्टलिस्ट" },
  "res.compare.pareto": { en: "Pareto-optimal", hi: "पैरेटो-इष्टतम" },

  // ---- reliability ---------------------------------------------
  "res.rel.title": { en: "Reliability of the Recommendation", hi: "सिफ़ारिश की विश्वसनीयता" },
  "res.rel.tag": { en: "SENSITIVITY · PARETO · WEATHER", hi: "संवेदनशीलता · पैरेटो · मौसम" },
  "res.rel.verdict": { en: "Verdict", hi: "निर्णय" },
  "res.rel.shortlist": { en: "Robust shortlist", hi: "सुदृढ़ शॉर्टलिस्ट" },
  "res.rel.weatherStable": { en: "Top-3 stable across typical & worst-case weather", hi: "सामान्य व न्यूनतम-स्थिति मौसम में शीर्ष-3 स्थिर" },
  "res.rel.sensTitle": { en: "Weight-sensitivity (top-3 residency)", hi: "भार-संवेदनशीलता (शीर्ष-3 उपस्थिति)" },
  "res.rel.paretoTitle": { en: "Trade-off: worst-hour warmth vs stability", hi: "समझौता: न्यूनतम-घंटा गर्माहट बनाम स्थिरता" },

  // ---- recommendation ----------------------------------------
  "res.rec.title": { en: "Recommended Design", hi: "अनुशंसित डिज़ाइन" },
  "res.rec.tag": { en: "DECISION", hi: "निर्णय" },
  "res.rec.chosen": { en: "Chosen", hi: "चयनित" },
  "res.rec.runnerUp": { en: "Runner-up", hi: "उपविजेता" },
  "res.rec.thermalTie": { en: "Thermal tie — decided on logistics", hi: "तापीय बराबरी — लॉजिस्टिक्स पर तय" },
  "res.rec.clearLeader": { en: "Clear leader on comfort", hi: "आराम में स्पष्ट अग्रणी" },
  "res.rec.justification": { en: "Why this design", hi: "यह डिज़ाइन क्यों" },
  "res.rec.download": { en: "Download full report (REPORT.md)", hi: "पूर्ण रिपोर्ट डाउनलोड करें (REPORT.md)" },

  // ---- logistics -------------------------------------------
  "res.log.title": { en: "Logistics & Deployability", hi: "लॉजिस्टिक्स व तैनाती-योग्यता" },
  "res.log.tag": { en: "COST · WEIGHT · TRANSPORT", hi: "लागत · भार · परिवहन" },
  "res.log.mass": { en: "Envelope mass", hi: "एन्वेलप द्रव्यमान" },
  "res.log.cost": { en: "Material cost", hi: "सामग्री लागत" },
  "res.log.transport": { en: "Transportability", hi: "परिवहन-योग्यता" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LanguageContext = createContext<Ctx>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "hi") setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

/** Returns `t(key)` bound to the active language, with English + key fallbacks. */
export function useT() {
  const { lang } = useContext(LanguageContext);
  return useCallback(
    (key: string) => {
      const entry = DICT[key];
      if (!entry) return key;
      return entry[lang] || entry.en || key;
    },
    [lang],
  );
}
