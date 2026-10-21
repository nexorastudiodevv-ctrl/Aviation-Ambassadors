const RAPIDAPI_HOST = 'google-flights4.p.rapidapi.com';
const RAPIDAPI_BASE_URL = `https://${RAPIDAPI_HOST}`;

export class RequestValidationError extends Error {}

export function getQuery(req) {
  if (req.query && typeof req.query === 'object') {
    return new URLSearchParams(
      Object.entries(req.query).flatMap(([key, value]) => (
        Array.isArray(value) ? value.map((item) => [key, String(item)]) : [[key, String(value)]]
      ))
    );
  }

  return new URL(req.url || '/', 'http://localhost').searchParams;
}

export function requireText(params, name, { min = 1, max = 120 } = {}) {
  const value = (params.get(name) || '').trim();
  if (value.length < min || value.length > max) {
    throw new RequestValidationError(`${name} must be between ${min} and ${max} characters.`);
  }
  return value;
}

export function requireDate(params, name) {
  const value = requireText(params, name, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestValidationError(`${name} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RequestValidationError(`${name} must be a valid date.`);
  }
  return value;
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createRapidApiHandler({
  endpoint,
  buildParams,
  transformResponse = (data) => data,
  env = process.env,
  fetchImpl = fetch
}) {
  return async function handler(req, res) {
    const allowedOrigins = String(env.FLIGHT_ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const origin = String(req.headers?.origin || '').replace(/\/$/, '');

    if (allowedOrigins.length === 0) {
      res.status(503).json({
        ok: false,
        message: 'Flight search is not configured. Set FLIGHT_ALLOWED_ORIGINS in the deployment environment.'
      });
      return;
    }

    if (!origin || !allowedOrigins.includes(origin)) {
      res.status(403).json({ ok: false, message: 'This website origin is not allowed.' });
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
      res.status(405).json({ ok: false, message: 'Only GET requests are allowed.' });
      return;
    }

    const apiKey = env.RAPIDAPI_KEY;
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        message: 'Flight search is not configured. Set RAPIDAPI_KEY in the deployment environment.'
      });
      return;
    }

    let upstreamParams;
    try {
      upstreamParams = buildParams(getQuery(req));
    } catch (error) {
      if (error instanceof RequestValidationError) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      throw error;
    }

    const url = new URL(endpoint, RAPIDAPI_BASE_URL);
    for (const [name, value] of upstreamParams) {
      url.searchParams.set(name, value);
    }

    try {
      const response = await fetchImpl(url, {
        headers: {
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': apiKey
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        res.status(502).json({ ok: false, message: 'The flight provider could not complete the request.' });
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        res.status(502).json({ ok: false, message: 'The flight provider returned an invalid response.' });
        return;
      }

      if (data?.status === false) {
        const providerMessage = typeof data.message === 'string'
          ? data.message.replaceAll(apiKey, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, 180)
          : '';
        res.status(422).json({
          ok: false,
          message: providerMessage || 'The flight provider rejected the search parameters.'
        });
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      res.status(200).json(transformResponse(data));
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        res.status(504).json({ ok: false, message: 'The flight provider took too long to respond.' });
        return;
      }
      res.status(502).json({ ok: false, message: 'Unable to reach the flight provider.' });
    }
  };
}
