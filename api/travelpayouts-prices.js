const API_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const IATA_CODE = /^[A-Z]{3}$/;
const SUPPORTED_CURRENCIES = new Set(['SAR', 'USD', 'EUR']);

export function createTravelpayoutsPricesHandler({
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
        message: 'بحث الأسعار غير مهيأ. أضف FLIGHT_ALLOWED_ORIGINS إلى إعدادات النشر.'
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

    const token = env.TRAVELPAYOUTS_TOKEN;
    if (!token) {
      res.status(503).json({
        ok: false,
        message: 'بحث الأسعار غير مهيأ. أضف TRAVELPAYOUTS_TOKEN إلى إعدادات النشر.'
      });
      return;
    }

    const query = req.query && typeof req.query === 'object'
      ? new URLSearchParams(Object.entries(req.query).map(([key, value]) => [key, String(value)]))
      : new URL(req.url || '/', 'http://localhost').searchParams;
    const originCode = (query.get('origin') || '').trim().toUpperCase();
    const destinationCode = (query.get('destination') || '').trim().toUpperCase();
    const departureDate = (query.get('departure_at') || '').trim();
    const returnDate = (query.get('return_at') || '').trim();
    const currency = (query.get('currency') || 'SAR').trim().toUpperCase();
    const isDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };

    if (!IATA_CODE.test(originCode) || !IATA_CODE.test(destinationCode) || originCode === destinationCode) {
      res.status(400).json({ ok: false, message: 'اختر مطاري مغادرة ووصول صالحين.' });
      return;
    }
    if (!isDate(departureDate) || !isDate(returnDate) || returnDate <= departureDate) {
      res.status(400).json({ ok: false, message: 'أدخل تاريخي ذهاب وعودة صالحين.' });
      return;
    }
    if (departureDate < new Date().toISOString().slice(0, 10)) {
      res.status(400).json({ ok: false, message: 'يجب أن يكون تاريخ الذهاب اليوم أو بعده.' });
      return;
    }
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      res.status(400).json({ ok: false, message: 'اختر الريال السعودي أو الدولار الأمريكي أو اليورو.' });
      return;
    }

    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      origin: originCode,
      destination: destinationCode,
      departure_at: departureDate,
      return_at: returnDate,
      currency: currency.toLowerCase(),
      one_way: 'false',
      sorting: 'price',
      limit: '30'
    }).toString();

    try {
      const response = await fetchImpl(url, {
        headers: { 'x-access-token': token },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? 'رفض Travelpayouts الطلب. تحقق من صلاحية رمز API والوصول إلى Flight Data API.'
          : response.status === 429
            ? 'تم تجاوز حد طلبات Travelpayouts؛ حاول مرة أخرى لاحقًا.'
            : `تعذر جلب الأسعار من Travelpayouts (HTTP ${response.status}).`;
        res.status(502).json({ ok: false, message });
        return;
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        res.status(502).json({ ok: false, message: 'أعاد مزوّد الأسعار استجابة غير صالحة.' });
        return;
      }

      if (payload?.success !== true || !Array.isArray(payload.data)) {
        res.status(502).json({
          ok: false,
          message: typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error.slice(0, 200)
            : 'لم يتمكن مزوّد الأسعار من إرجاع نتائج.'
        });
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json({
        currency: payload.currency || currency.toLowerCase(),
        data: payload.data
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        res.status(504).json({ ok: false, message: 'استغرق مزوّد الأسعار وقتًا طويلًا للرد.' });
        return;
      }
      res.status(502).json({ ok: false, message: 'تعذر الاتصال بمزوّد الأسعار.' });
    }
  };
}

export default createTravelpayoutsPricesHandler();
