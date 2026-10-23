import {
  createRapidApiHandler,
  requireText
} from '../lib/rapidapi.js';

const ARABIC_PLACE_ALIASES = new Map([
  ['القاهرة', 'Cairo'],
  ['القاهره', 'Cairo'],
  ['دبي', 'Dubai'],
  ['الرياض', 'Riyadh'],
  ['جدة', 'Jeddah'],
  ['جده', 'Jeddah'],
  ['الدمام', 'Dammam'],
  ['أبوظبي', 'Abu Dhabi'],
  ['ابوظبي', 'Abu Dhabi'],
  ['أبو ظبي', 'Abu Dhabi'],
  ['ابو ظبي', 'Abu Dhabi'],
  ['الشارقة', 'Sharjah'],
  ['الشارقه', 'Sharjah'],
  ['البحرين', 'Manama'],
  ['المنامه', 'Manama'],
  ['الخبر', 'Khobar'],
  ['الجبيل', 'Jubail'],
  ['الطائف', 'Taif'],
  ['تبوك', 'Tabuk'],
  ['أبها', 'Abha'],
  ['ابها', 'Abha'],
  ['ينبع', 'Yanbu'],
  ['القصيم', 'Buraidah'],
  ['بغداد', 'Baghdad'],
  ['البصرة', 'Basra'],
  ['أربيل', 'Erbil'],
  ['اربيل', 'Erbil'],
  ['طرابلس لبنان', 'Tripoli, Lebanon'],
  ['طرابلس ليبيا', 'Tripoli, Libya'],
  ['بنغازي', 'Benghazi'],
  ['الخرطوم', 'Khartoum'],
  ['بورتسودان', 'Port Sudan'],
  ['دمشق', 'Damascus'],
  ['حلب', 'Aleppo'],
  ['صنعاء', "Sana'a"],
  ['عدن', 'Aden'],
  ['مقديشو', 'Mogadishu'],
  ['جيبوتي', 'Djibouti'],
  ['نواكشوط', 'Nouakchott'],
  ['الرباط', 'Rabat'],
  ['فاس', 'Fes'],
  ['وهران', 'Oran'],
  ['قسنطينة', 'Constantine'],
  ['صفاقس', 'Sfax'],
  ['سوسة', 'Sousse'],
  ['تلمسان', 'Tlemcen'],
  ['موروني', 'Moroni'],
  ['غزة', 'Gaza'],
  ['رام الله', 'Ramallah'],
  ['بيت لحم', 'Bethlehem'],
  ['إسطنبول', 'Istanbul'],
  ['اسطنبول', 'Istanbul'],
  ['القسطنطينية', 'Istanbul'],
  ['باريس', 'Paris'],
  ['لندن', 'London'],
  ['نيويورك', 'New York'],
  ['الدوحة', 'Doha'],
  ['الدوحه', 'Doha'],
  ['الكويت', 'Kuwait City'],
  ['مسقط', 'Muscat'],
  ['عمّان', 'Amman'],
  ['عمان', 'Amman'],
  ['بيروت', 'Beirut'],
  ['المدينة المنورة', 'Medina'],
  ['المدينة', 'Medina'],
  ['المنامة', 'Manama'],
  ['تونس', 'Tunis'],
  ['الدار البيضاء', 'Casablanca'],
  ['مراكش', 'Marrakech'],
  ['الجزائر', 'Algiers'],
  ['طرابلس', 'Tripoli'],
  ['عمان الأردن', 'Amman'],
  ['مكة', 'Jeddah'],
  ['مكة المكرمة', 'Jeddah'],
  ['عُمان', 'Muscat'],
  ['سلطنة عمان', 'Muscat'],
  ['أنقرة', 'Ankara'],
  ['انقرة', 'Ankara'],
  ['روما', 'Rome'],
  ['مدريد', 'Madrid'],
  ['برشلونة', 'Barcelona'],
  ['أثينا', 'Athens'],
  ['اثينا', 'Athens'],
  ['برلين', 'Berlin'],
  ['فيينا', 'Vienna'],
  ['أمستردام', 'Amsterdam'],
  ['امستردام', 'Amsterdam'],
  ['طوكيو', 'Tokyo'],
  ['بانكوك', 'Bangkok'],
  ['سنغافورة', 'Singapore'],
  ['كوالالمبور', 'Kuala Lumpur'],
  ['جاكرتا', 'Jakarta'],
  ['مانيلا', 'Manila'],
  ['سيول', 'Seoul'],
  ['بكين', 'Beijing'],
  ['هونغ كونغ', 'Hong Kong'],
  ['سيدني', 'Sydney'],
  ['ملبورن', 'Melbourne'],
  ['تورونتو', 'Toronto'],
  ['لوس أنجلوس', 'Los Angeles'],
  ['لوس انجليس', 'Los Angeles'],
  ['سان فرانسيسكو', 'San Francisco'],
  ['واشنطن', 'Washington'],
  ['شيكاغو', 'Chicago'],
  ['ميامي', 'Miami']
]);

const ARAB_COUNTRY_CODES = new Set([
  'AE', 'BH', 'DZ', 'DJ', 'EG', 'IQ', 'JO', 'KM', 'KW', 'LB', 'LY',
  'MA', 'MR', 'OM', 'PS', 'QA', 'SA', 'SD', 'SO', 'SY', 'TN', 'YE'
]);
const ARAB_COUNTRY_NAMES = [
  'Algeria',
  'Bahrain',
  'Comoros',
  'Djibouti',
  'Egypt',
  'Iraq',
  'Jordan',
  'Kuwait',
  'Lebanon',
  'Libya',
  'Mauritania',
  'Morocco',
  'Oman',
  'Palestine',
  'Qatar',
  'Saudi Arabia',
  'Somalia',
  'Sudan',
  'Syria',
  'Tunisia',
  'United Arab Emirates',
  'Yemen'
];

function isInArabCountry(place) {
  const countryCode = String(
    place?.info?.countryCode
      || place?.countryCode
      || place?.country?.code
      || ''
  ).toUpperCase();
  if (ARAB_COUNTRY_CODES.has(countryCode)) return true;

  const location = [
    place?.info?.shortName,
    place?.info?.description,
    place?.info?.countryName,
    place?.countryName,
    place?.country?.name
  ].filter(Boolean).join(' ');
  return ARAB_COUNTRY_NAMES.some((country) => {
    const expression = new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return expression.test(location);
  });
}

function normalizeQuery(query) {
  const original = query
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = original.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  const alias = ARABIC_PLACE_ALIASES.get(original) || ARABIC_PLACE_ALIASES.get(normalized);

  return alias || normalized;
}

export const createFlightAutocompleteHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/auto-complete',
  transformResponse(data) {
    if (!Array.isArray(data?.data)) return data;
    return {
      ...data,
      data: data.data.filter(isInArabCountry)
    };
  },
  buildParams(params) {
    const query = requireText(params, 'query', { min: 2, max: 100 });
    return [['query', normalizeQuery(query)]];
  }
});

export default createFlightAutocompleteHandler();
