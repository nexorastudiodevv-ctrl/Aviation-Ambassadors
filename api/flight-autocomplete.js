import {
  createRapidApiHandler,
  RequestValidationError,
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

function normalizeQuery(query) {
  const normalized = query
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const alias = ARABIC_PLACE_ALIASES.get(normalized);

  if (ARABIC_CHARACTERS.test(normalized) && !alias) {
    throw new RequestValidationError('اكتب اسم مدينة مدعومة بالعربية أو أدخل اسمها بالإنجليزية.');
  }

  return alias || normalized;
}

export const createFlightAutocompleteHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/auto-complete',
  buildParams(params) {
    const query = requireText(params, 'query', { min: 2, max: 100 });
    return [['query', normalizeQuery(query)]];
  }
});

export default createFlightAutocompleteHandler();
