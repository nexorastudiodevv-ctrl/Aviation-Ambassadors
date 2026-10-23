import { getQuery, requireText } from '../lib/rapidapi.js';

const AUTOCOMPLETE_URL = 'https://autocomplete.travelpayouts.com/places2';
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
    place?.country_code
      || place?.countryCode
      || place?.info?.countryCode
      || ''
  ).toUpperCase();
  if (ARAB_COUNTRY_CODES.has(countryCode)) return true;

  const countryName = [
    place?.country_name,
    place?.countryName,
    place?.info?.countryName,
    place?.info?.shortName,
    place?.info?.description
  ].filter(Boolean).join(' ');
  return ARAB_COUNTRY_NAMES.some((country) => {
    const expression = new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return expression.test(countryName);
  });
}

function normalizePlace(place) {
  if (typeof place?.code !== 'string' || typeof place?.name !== 'string') return null;
  return {
    code: place.code,
    name: place.name,
    cityName: typeof place.city_name === 'string' ? place.city_name : '',
    countryName: typeof place.country_name === 'string' ? place.country_name : '',
    countryCode: typeof place.country_code === 'string' ? place.country_code : '',
    type: typeof place.type === 'string' ? place.type : ''
  };
}

export function createFlightAutocompleteHandler({
  env = process.env,
  fetchImpl = fetch
} = {}) {
  return async function handler(req, res) {
    const allowedOrigins = String(env.FLIGHT_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const origin = String(req.headers?.origin || '').replace(/\/$/, '');

    if (allowedOrigins.length === 0) {
      res.status(503).json({
        ok: false,
        message: 'اقتراح المطارات غير مهيأ. أضف FLIGHT_ALLOWED_ORIGINS إلى إعدادات النشر.'
      });
      return;
    }
    if (!origin || !allowedOrigins.includes(origin)) {
      res.status(403).json({ ok: false, message: 'مصدر الموقع غير مسموح.' });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ ok: false, message: 'يسمح بطلبات GET فقط.' });
      return;
    }

    let query;
    try {
      query = requireText(getQuery(req), 'query', { min: 2, max: 100 });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : 'أدخل اسم مدينة أو مطار صالحًا.'
      });
      return;
    }

    const url = new URL(AUTOCOMPLETE_URL);
    url.searchParams.set('term', query);
    url.searchParams.set('locale', /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en');
    url.searchParams.append('types[]', 'city');
    url.searchParams.append('types[]', 'airport');

    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        const message = response.status === 429
          ? 'تجاوزت طلبات اقتراح المطارات الحد المسموح؛ أعد المحاولة لاحقًا.'
          : `تعذر جلب اقتراحات المطارات من Travelpayouts (HTTP ${response.status}).`;
        res.status(502).json({ ok: false, message });
        return;
      }

      let places;
      try {
        places = await response.json();
      } catch {
        res.status(502).json({ ok: false, message: 'أعاد مزوّد المطارات استجابة غير صالحة.' });
        return;
      }

      if (!Array.isArray(places)) {
        res.status(502).json({ ok: false, message: 'أعاد مزوّد المطارات بيانات غير متوقعة.' });
        return;
      }

      const data = places
        .filter(isInArabCountry)
        .map(normalizePlace)
        .filter(Boolean);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json({ data });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        res.status(504).json({ ok: false, message: 'استغرق مزوّد المطارات وقتًا طويلًا للرد.' });
        return;
      }
      res.status(502).json({ ok: false, message: 'تعذر الاتصال بمزوّد المطارات.' });
    }
  };
}

export default createFlightAutocompleteHandler();
