// Public-facing strings, in the reporter's own language.
//
// This covers the pages anyone can reach without signing in, the landing page, the report form and
// the receipt. Reviewer-facing screens stay in English (the brief asks for English docs and UI), so
// the dictionary is a plain object rather than a framework: two locales, one file, no runtime
// negotiation to get wrong on a phone with a weak connection.
//
// Nepali strings are written as a native speaker would phrase them, not transliterated from English.
// Where a term has a common English loanword in Nepali disaster reporting (फोटो, रिपोर्ट), that is
// used instead of a formal coinage, because that is what people actually write.

export type Locale = "en" | "ne";

/** Cookie that remembers the reporter's language choice. Read on the server, written in the browser. */
export const LOCALE_COOKIE = "av_lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALES: Array<{ code: Locale; label: string; native: string }> = [
  { code: "ne", label: "Nepali", native: "नेपाली" },
  { code: "en", label: "English", native: "English" },
];

const en = {
  "app.tagline": "Report what you see. Help your community get help.",
  "app.intro":
    "AapatVani turns community reports into clear, traceable information for responders. Reports can be in Nepali or English, by text, photo or voice.",
  "app.noPersonalData": "You do not need to give your name or phone number.",

  "landing.cta": "Report an incident",
  "landing.responder": "I am a responder",
  "landing.responderHint": "Sign in to review reports and see possible impacts.",
  "hazard.landslide.blurb": "A hillside has given way and the road is covered.",
  "hazard.flood.blurb": "A river or stream has come over its banks.",
  "hazard.debris_flow.blurb": "A rushing mix of mud, water and stone is coming down.",
  "hazard.glof.blurb": "A glacial lake has burst, or is close to bursting.",
  "landing.hazardsTitle": "What you can report",
  "landing.howTitle": "How it works",  "landing.step1.title": "You send what you know",
  "landing.step1.body": "Words, a photo or a voice note, in Nepali or English. A rough location is enough.",
  "landing.step2.title": "We organise it",
  "landing.step2.body": "Reports about the same event are grouped, and anything unclear is flagged rather than guessed.",
  "landing.step3.title": "A person checks it",
  "landing.step3.body": "A reviewer confirms every fact. Nothing is published or sent without a person approving it.",
  "landing.trustTitle": "What we do and do not do",
  "landing.trustDo": "We show where every detail came from, and label what is reported, what is read by AI, and what is computed from map data.",
  "landing.trustDont": "We do not predict casualties, damage or where a hazard will spread, and we never send alerts on our own.",
  "landing.emergency": "If lives are in danger right now, contact emergency services directly.",

  "form.title": "Report an incident",
  "form.optional": "optional",
  "form.language": "Language",
  "form.whatHappened": "What happened?",
  "form.whatHappenedPlaceholder": "For example: a landslide has covered the road near Larcha this morning. Vehicles are stuck.",
  "form.whatHappenedHint": "Write in your own words. Spelling does not matter.",
  "form.hazard": "What kind of incident is it?",
  "form.hazardHint": "Choose the closest one, or skip it if you are not sure.",
  "form.where": "Where is it?",
  "form.whereHint": "A rough location is enough. Use your phone's location, drop a pin, or type a place name.",
  "form.where.gps": "Use my location",
  "form.where.gpsFound": "Location found",
  "form.where.gpsFailed": "We could not get your location. You can drop a pin or type a place name instead.",
  "form.where.pin": "Drop a pin on the map",
  "form.where.place": "Type a place name",
  "form.where.placePlaceholder": "For example: Larcha, or अरनिको राजमार्ग",
  "form.where.none": "I do not know where it is",
  "form.where.confirm": "Use this location",
  "form.where.clear": "Remove location",
  "form.where.accuracy": "accurate to about {m} m",
  "form.when": "When did it happen?",
  "form.when.now": "Happening now",
  "form.when.earlier_today": "Earlier today",
  "form.when.yesterday": "Yesterday",
  "form.when.unsure": "I am not sure",
  "form.when.detail": "Anything more specific?",
  "form.when.detailPlaceholder": "For example: around 6 this morning",
  "form.photo": "Add a photo",
  "form.photoHint": "Only if it is safe to take one. Do not enter a dangerous area to take a photo.",
  "form.photoAdd": "Take or choose a photo",
  "form.photoResized": "This photo was made smaller on your phone so it fits the upload limit.",
  "form.photoRemove": "Remove photo",
  "form.voice": "Add a voice note",
  "form.voiceHint": "Speak naturally. Your recording is kept as you made it.",
  "form.voiceStart": "Start recording",
  "form.voiceStop": "Stop recording",
  "form.voiceRecording": "Recording…",
  "form.voiceDenied": "We could not use the microphone. Please check your browser's permission, or type your report instead.",
  "form.voiceUnsupported": "This browser cannot record audio. You can still type or send a photo.",
  "form.voiceRemove": "Remove voice note",
  "form.attachments": "Attach up to {n} files, {mb} MB each.",
  "form.submit": "Send report",
  "form.submitting": "Sending…",
  "form.errorTitle": "The report was not sent",
  "form.errorGeneric": "Something went wrong while sending. Please try again.",
  "form.errorOffline": "You appear to be offline. Your report was not sent, please try again when you have a connection.",
  "form.required": "Please write something, add a photo, or record a voice note.",
  "form.tooManyFiles": "You can attach up to {n} files.",

  "receipt.title": "Thank you, your report was received",
  "receipt.reference": "Your reference code",
  "receipt.referenceHint": "Keep this code. It is how we refer to your report.",
  "receipt.status.received": "Received. The system is reading it now.",
  "receipt.status.extracting": "The system is reading your report.",
  "receipt.status.extracted": "Your report has been read and is waiting for a person to review it.",
  "receipt.status.extraction_failed": "Your report was received, and a person will read it directly.",
  "receipt.status.ai_unavailable": "Your report was received. Automatic reading is switched off here, so a person will read it directly.",
  "receipt.understoodTitle": "What we understood",
  "receipt.understoodEmpty": "We could not read any details automatically. A person will read your report.",
  "receipt.missingTitle": "What we could not tell",
  "receipt.nextTitle": "What happens next",
  "receipt.nextBody": "A reviewer reads your report and checks it against others. Nothing is published or sent without a person deciding.",
  "receipt.originalTitle": "Your report, as you sent it",
  "receipt.another": "Send another report",
  "receipt.notFound": "We could not find that report on this device. If you have your reference code, keep it, a reviewer can find your report with it.",
  "receipt.loading": "Loading your report…",
  "receipt.origin.reporter": "Your words",
  // Said in the voice note. The reporter's own account, but the words shown are what a machine
  // heard, so this says that rather than claiming they are the reporter's own text.
  "receipt.origin.transcript": "Heard in your voice note",
  "receipt.origin.ai": "Read by AI",
  "receipt.origin.computed": "From map data",
  "receipt.origin.reviewer": "Checked by a reviewer",

  "common.back": "Back",
  "common.continue": "Continue",
  "common.close": "Close",
  "common.required": "Required",
} as const;

export type PublicStringKey = keyof typeof en;

const ne: Record<PublicStringKey, string> = {
  "app.tagline": "तपाईंले देखेको कुरा रिपोर्ट गर्नुहोस्। समुदायलाई सहयोग पुग्न मद्दत गर्नुहोस्।",
  "app.intro":
    "आपतवाणीले समुदायका रिपोर्टहरूलाई स्पष्ट र खोज्न मिल्ने जानकारीमा बदल्छ। रिपोर्ट नेपाली वा अंग्रेजीमा, लेखेर, फोटो वा आवाजमा पठाउन सकिन्छ।",
  "app.noPersonalData": "तपाईंले नाम वा फोन नम्बर दिनु पर्दैन।",

  "landing.cta": "घटना रिपोर्ट गर्नुहोस्",
  "landing.responder": "म उद्धारकर्ता हुँ",
  "landing.responderHint": "रिपोर्ट हेर्न र सम्भावित असर देख्न साइन इन गर्नुहोस्।",
  "hazard.landslide.blurb": "पहाड खसेर बाटो छोपिएको छ।",
  "hazard.flood.blurb": "खोला वा नदी किनारा छाडेर बगेको छ।",
  "hazard.debris_flow.blurb": "माटो, पानी र ढुंगा मिसिएर आएको छ।",
  "hazard.glof.blurb": "हिमताल फुटेको छ, वा फुट्न लागेको छ।",
  "landing.hazardsTitle": "तपाईं के रिपोर्ट गर्न सक्नुहुन्छ",
  "landing.howTitle": "यो कसरी काम गर्छ",
  "landing.step1.title": "तपाईंले जानेको कुरा पठाउनुहुन्छ",
  "landing.step1.body": "शब्द, फोटो वा आवाज, नेपाली वा अंग्रेजीमा। ठाउँको अनुमानित जानकारी भए पुग्छ।",
  "landing.step2.title": "हामी व्यवस्थित गर्छौं",
  "landing.step2.body": "एउटै घटनाका रिपोर्टहरू एकै ठाउँमा राखिन्छन्, र अस्पष्ट कुरा अनुमान नगरी छुट्टै देखाइन्छ।",
  "landing.step3.title": "एक जनाले जाँच्छ",
  "landing.step3.body": "समीक्षकले हरेक तथ्य पुष्टि गर्छन्। कुनै व्यक्तिले स्वीकृति नदिई कुनै कुरा प्रकाशित वा पठाइँदैन।",
  "landing.trustTitle": "हामी के गर्छौं र के गर्दैनौं",
  "landing.trustDo":
    "हरेक विवरण कहाँबाट आयो भनी देखाउँछौं, र कुन कुरा समुदायले भनेको, कुन कुरा एआईले पढेको र कुन कुरा नक्साबाट गणना गरेको हो भनी लेख्छौं।",
  "landing.trustDont":
    "हामी मृत्यु, क्षति वा प्रकोप कहाँ फैलिन्छ भन्ने अनुमान गर्दैनौं, र आफैँ कुनै चेतावनी पठाउँदैनौं।",
  "landing.emergency": "अहिले ज्यान जोखिममा छ भने सिधै आपतकालीन सेवामा सम्पर्क गर्नुहोस्।",

  "form.title": "घटना रिपोर्ट गर्नुहोस्",
  "form.optional": "चाहिएमा",
  "form.language": "भाषा",
  "form.whatHappened": "के भयो?",
  "form.whatHappenedPlaceholder": "जस्तै: आज बिहान लार्चा नजिक अरनिको राजमार्गमा पहिरो खसेर बाटो बन्द भयो। सवारी अड्किएका छन्।",
  "form.whatHappenedHint": "आफ्नै शब्दमा लेख्नुहोस्। हिज्जे मिल्नु पर्दैन।",
  "form.hazard": "यो कस्तो प्रकारको घटना हो?",
  "form.hazardHint": "नजिकको विकल्प छान्नुहोस्, वा थाहा भएन भने नछान्नुहोस्।",
  "form.where": "यो कहाँ छ?",
  "form.whereHint": "अनुमानित ठाउँ भए पुग्छ। फोनको स्थान प्रयोग गर्नुहोस्, नक्सामा चिन्ह राख्नुहोस्, वा ठाउँको नाम लेख्नुहोस्।",
  "form.where.gps": "मेरो स्थान प्रयोग गर्नुहोस्",
  "form.where.gpsFound": "स्थान भेटियो",
  "form.where.gpsFailed": "तपाईंको स्थान पाइएन। नक्सामा चिन्ह राख्नुहोस् वा ठाउँको नाम लेख्नुहोस्।",
  "form.where.pin": "नक्सामा चिन्ह राख्नुहोस्",
  "form.where.place": "ठाउँको नाम लेख्नुहोस्",
  "form.where.placePlaceholder": "जस्तै: लार्चा, वा अरनिको राजमार्ग",
  "form.where.none": "कहाँ भएको हो थाहा छैन",
  "form.where.confirm": "यही स्थान प्रयोग गर्नुहोस्",
  "form.where.clear": "स्थान हटाउनुहोस्",
  "form.where.accuracy": "करिब {m} मिटर सम्म सही",
  "form.when": "कहिले भयो?",
  "form.when.now": "अहिले भइरहेको छ",
  "form.when.earlier_today": "आज पहिले",
  "form.when.yesterday": "हिजो",
  "form.when.unsure": "थाहा छैन",
  "form.when.detail": "अझै खास समय थाहा छ?",
  "form.when.detailPlaceholder": "जस्तै: बिहान करिब ६ बजे",
  "form.photo": "फोटो थप्नुहोस्",
  "form.photoHint": "सुरक्षित भए मात्र फोटो खिच्नुहोस्। फोटो खिच्न जोखिमपूर्ण ठाउँमा नजानुहोस्।",
  "form.photoAdd": "फोटो खिच्नुहोस् वा छान्नुहोस्",
  "form.photoResized": "अपलोड सीमाभित्र राख्न यो फोटो तपाईंको फोनमै सानो बनाइयो।",
  "form.photoRemove": "फोटो हटाउनुहोस्",
  "form.voice": "आवाज सन्देश थप्नुहोस्",
  "form.voiceHint": "स्वाभाविक रूपमा बोल्नुहोस्। तपाईंको रेकर्डिङ जस्ताको तस्तै राखिन्छ।",
  "form.voiceStart": "रेकर्डिङ सुरु गर्नुहोस्",
  "form.voiceStop": "रेकर्डिङ रोक्नुहोस्",
  "form.voiceRecording": "रेकर्ड हुँदैछ…",
  "form.voiceDenied": "माइक्रोफोन प्रयोग गर्न सकिएन। ब्राउजरको अनुमति जाँच्नुहोस्, वा लेखेर रिपोर्ट पठाउनुहोस्।",
  "form.voiceUnsupported": "यो ब्राउजरले आवाज रेकर्ड गर्न सक्दैन। तपाईं लेख्न वा फोटो पठाउन सक्नुहुन्छ।",
  "form.voiceRemove": "आवाज सन्देश हटाउनुहोस्",
  "form.attachments": "बढीमा {n} फाइल, प्रत्येक {mb} एमबी सम्म।",
  "form.submit": "रिपोर्ट पठाउनुहोस्",
  "form.submitting": "पठाइँदै…",
  "form.errorTitle": "रिपोर्ट पठाइएन",
  "form.errorGeneric": "पठाउँदा केही समस्या भयो। कृपया फेरि प्रयास गर्नुहोस्।",
  "form.errorOffline": "तपाईं अनलाइनमा हुनुहुन्न जस्तो छ। रिपोर्ट पठाइएन, इन्टरनेट जोडेर फेरि प्रयास गर्नुहोस्।",
  "form.required": "कृपया केही लेख्नुहोस्, फोटो थप्नुहोस्, वा आवाज सन्देश रेकर्ड गर्नुहोस्।",
  "form.tooManyFiles": "तपाईं बढीमा {n} फाइल थप्न सक्नुहुन्छ।",

  "receipt.title": "धन्यवाद, तपाईंको रिपोर्ट प्राप्त भयो",
  "receipt.reference": "तपाईंको सन्दर्भ कोड",
  "receipt.referenceHint": "यो कोड सुरक्षित राख्नुहोस्। यही कोडले तपाईंको रिपोर्ट चिनिन्छ।",
  "receipt.status.received": "प्राप्त भयो। अहिले प्रणालीले पढ्दैछ।",
  "receipt.status.extracting": "प्रणालीले तपाईंको रिपोर्ट पढ्दैछ।",
  "receipt.status.extracted": "तपाईंको रिपोर्ट पढियो र अब कुनै व्यक्तिको समीक्षाको प्रतीक्षामा छ।",
  "receipt.status.extraction_failed": "तपाईंको रिपोर्ट प्राप्त भयो, र कुनै व्यक्तिले सिधै पढ्नेछ।",
  "receipt.status.ai_unavailable": "तपाईंको रिपोर्ट प्राप्त भयो। यहाँ स्वचालित पठन बन्द छ, त्यसैले कुनै व्यक्तिले सिधै पढ्नेछ।",
  "receipt.understoodTitle": "हामीले बुझेको कुरा",
  "receipt.understoodEmpty": "स्वचालित रूपमा कुनै विवरण पढ्न सकिएन। कुनै व्यक्तिले तपाईंको रिपोर्ट पढ्नेछ।",
  "receipt.missingTitle": "हामीले थाहा पाउन नसकेका कुरा",
  "receipt.nextTitle": "अब के हुन्छ",
  "receipt.nextBody": "एक समीक्षकले तपाईंको रिपोर्ट पढी अरूसँग भिडाउँछन्। कुनै व्यक्तिले निर्णय नगरी कुनै कुरा प्रकाशित वा पठाइँदैन।",
  "receipt.originalTitle": "तपाईंले पठाउनुभएको रिपोर्ट",
  "receipt.another": "अर्को रिपोर्ट पठाउनुहोस्",
  "receipt.notFound": "यो यन्त्रमा त्यो रिपोर्ट भेटिएन। तपाईंसँग सन्दर्भ कोड छ भने राख्नुहोस्, समीक्षकले त्यसैबाट रिपोर्ट भेट्टाउन सक्छन्।",
  "receipt.loading": "तपाईंको रिपोर्ट लोड हुँदैछ…",
  "receipt.origin.reporter": "तपाईंका शब्द",
  "receipt.origin.transcript": "तपाईंको आवाजमा सुनियो",
  "receipt.origin.ai": "एआईले पढेको",
  "receipt.origin.computed": "नक्साको डाटाबाट",
  "receipt.origin.reviewer": "समीक्षकले जाँचेको",

  "common.back": "पछाडि",
  "common.continue": "अगाडि",
  "common.close": "बन्द गर्नुहोस्",
  "common.required": "आवश्यक",
};

/** Both dictionaries, in full. `en` defines the key set; the test suite checks nothing is missing. */
export const DICTIONARIES: Record<Locale, Record<PublicStringKey, string>> = { en, ne };

/** Looks up a string, substituting {placeholders}. Falls back to English rather than showing a key. */
export function t(locale: Locale, key: PublicStringKey, values?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale]?.[key] ?? en[key];
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "ne";
}

/** A translator bound to one locale, for components that render a lot of strings. */
export function translator(locale: Locale) {
  return (key: PublicStringKey, values?: Record<string, string | number>) => t(locale, key, values);
}
