/**
 * English / Hindi for the screens an institution and an officer meet first.
 * Keyed by the English text, so untranslated strings simply stay English.
 * Codes (case numbers, IFSC, lane values) are never translated.
 */
export type Lang = "en" | "hi";
export const LANG_COOKIE = "nk_lang";

const HI: Record<string, string> = {
  // navigation
  overview: "अवलोकन",
  cases: "मामले",
  "submit an fdr": "एफडीआर जमा करें",
  "legacy import": "पुराना रजिस्टर आयात",
  verification: "सत्यापन",
  "maturity watch": "परिपक्वता निगरानी",
  renewals: "नवीनीकरण",
  releases: "रिलीज़ / वापसी",
  "ask the handbook": "हैंडबुक से पूछें",
  reports: "रिपोर्ट",
  metrics: "मापदंड",
  inbox: "इनबॉक्स",
  "email outbox": "ईमेल आउटबॉक्स",
  "audit ledger": "ऑडिट लेजर",
  integrations: "एकीकरण",
  security: "सुरक्षा",
  admin: "प्रशासन",
  scope: "दायरा",
  // page titles
  "deposit & fdr": "जमा एवं एफडीआर",
  "submit an": "जमा करें:",
  fdr: "एफडीआर",
  deposit: "जमा",
  // case page
  "three-source check": "तीन-स्रोत जाँच",
  scan: "स्कैन",
  discrepancies: "विसंगतियाँ",
  "bank verification": "बैंक सत्यापन",
  "case brief": "मामले का सार",
  "ask this case": "इस मामले से पूछें",
  "why this case needs attention": "इस मामले पर ध्यान क्यों",
  "next action": "अगला कदम",
  actions: "कार्रवाई",
  "draft a letter": "पत्र का मसौदा",
  instrument: "जमा का विवरण",
  documents: "दस्तावेज़",
  "renewal history": "नवीनीकरण इतिहास",
  "audit trail": "ऑडिट ट्रेल",
  "release / refund": "रिलीज़ / वापसी",
  record: "अभिलेख",
  validity: "वैधता",
  renewal: "नवीनीकरण",
  release: "रिलीज़",
  amount: "राशि",
  "Nothing pending on this instrument.": "इस जमा पर कुछ भी लंबित नहीं है।",
  // submit form
  "instrument details": "जमा का विवरण",
  programme: "कार्यक्रम",
  "instrument type": "जमा का प्रकार",
  "fdr / receipt number": "एफडीआर / रसीद संख्या",
  "amount (₹)": "राशि (₹)",
  "date of deposit": "जमा की तिथि",
  "maturity date": "परिपक्वता तिथि",
  "ifsc of issuing branch": "जारीकर्ता शाखा का IFSC",
  "depositor (as on the receipt)": "जमाकर्ता (रसीद के अनुसार)",
  "lien marked in favour of": "लियन किसके पक्ष में अंकित है",
  "Must be AICTE for a security deposit": "सुरक्षा जमा के लिए यह एआईसीटीई होना चाहिए",
  "fdr scan": "एफडीआर स्कैन",
  "renewal or replacement?": "नवीनीकरण या प्रतिस्थापन?",
  "No, this is a new deposit": "नहीं, यह नई जमा है",
  "Linking a renewal keeps one history for the deposit and stops its reminders.": "नवीनीकरण जोड़ने से जमा का एक ही इतिहास रहता है और उसके अनुस्मारक रुक जाते हैं।",
  "[sent straight to the encrypted document store]": "[सीधे एन्क्रिप्टेड दस्तावेज़ भंडार में भेजा जाता है]",
  "[uploading scan…]": "[स्कैन अपलोड हो रहा है…]",
  "[submitting…]": "[जमा हो रहा है…]",
  "[submit for verification]": "[सत्यापन हेतु जमा करें]",
  "[after you submit, the dealing officer is notified and the scan is read by doc-ai]": "[जमा करने के बाद डीलिंग अधिकारी को सूचना जाती है और Doc-AI स्कैन पढ़ता है]",
  "No branch found for this IFSC.": "इस IFSC की कोई शाखा नहीं मिली।",
  // login
  "every deposit, released": "हर जमा, सही समय पर",
  right: "वापस",
  "Security deposit & FDR portal for the AICTE Regulation Bureau. Sign in with your portal account.": "एआईसीटीई विनियमन ब्यूरो के लिए सुरक्षा जमा एवं एफडीआर पोर्टल। अपने पोर्टल खाते से साइन इन करें।",
  "demo accounts": "डेमो खाते",
  "One click signs you in as each role. Password for all six:": "एक क्लिक में किसी भी भूमिका से साइन इन करें। सभी छह का पासवर्ड:",
  // top bar
  "ask: “fdrs maturing in 60 days, not renewed”": "पूछें: “60 दिनों में परिपक्व, नवीनीकरण नहीं”",
};

export function tr(lang: Lang, en: string) {
  return lang === "hi" ? (HI[en] ?? en) : en;
}

/** For client components: the subset of the dictionary they need, already resolved. */
export function pick<K extends string>(lang: Lang, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(keys.map((k) => [k, tr(lang, k)])) as Record<K, string>;
}
