import {
  createRapidApiHandler,
  RequestValidationError,
  requireText
} from '../lib/rapidapi.js';

const ARABIC_PLACE_ALIASES = new Map([
  ['مصر', 'Cairo'],
  ['السعودية', 'Riyadh'],
  ['الإمارات', 'Dubai'],
  ['الامارات', 'Dubai'],
  ['قطر', 'Doha'],
  ['الكويت', 'Kuwait City'],
  ['الأردن', 'Amman'],
  ['الاردن', 'Amman'],
  ['سلطنة عمان', 'Muscat'],
  ['عُمان', 'Muscat'],
  ['البحرين', 'Manama'],
  ['المغرب', 'Casablanca'],
  ['تونس', 'Tunis'],
  ['الجزائر', 'Algiers'],
  ['السودان', 'Khartoum'],
  ['العراق', 'Baghdad'],
  ['لبنان', 'Beirut'],
  ['ليبيا', 'Tripoli'],
  ['سوريا', 'Damascus'],
  ['اليمن', "Sana'a"],
  ['موريتانيا', 'Nouakchott'],
  ['الصومال', 'Mogadishu'],
  ['جيبوتي', 'Djibouti'],
  ['جزر القمر', 'Moroni'],
  ['فلسطين', 'Ramallah'],
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

const ARABIC_CHARACTERS = /[\u0600-\u06FF]/;
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
  const location = `${place?.info?.shortName || ''} ${place?.info?.description || ''}`;
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

  if (ARABIC_CHARACTERS.test(normalized) && !alias) {
    throw new RequestValidationError('اكتب اسم مدينة مدعومة بالعربية أو أدخل اسمها بالإنجليزية.');
  }

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
