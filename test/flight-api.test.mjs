import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlightAutocompleteHandler } from '../api/flight-autocomplete.js';
import { createFlightPriceCalendarHandler } from '../api/flight-price-calendar.js';
import { createFlightRoundTripHandler } from '../api/flight-roundtrip.js';

function createResponse(statusCode, body = null) {
  return {
    statusCode,
    headers: {},
    body,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

async function invoke(handler, { method = 'GET', url, query }, options = {}) {
  const req = {
    method,
    url,
    query,
    headers: { origin: 'https://avam.nexorastudio-eg.com' }
  };
  const res = createResponse(200);
  res.end = () => {
    res.ended = true;
  };
  await handler(req, res);
  return { ...res, ...options };
}

const testEnvironment = {
  RAPIDAPI_KEY: 'test-secret',
  FLIGHT_ALLOWED_ORIGINS: 'https://avam.nexorastudio-eg.com'
};

function nextDate(date, days = 1) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test('autocomplete proxies encoded queries without exposing its secret', async () => {
  let requestedUrl;
  let requestedHeaders;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          data: [{
            info: { shortName: 'Cairo, Egypt', cityName: 'Cairo' },
            nearbyAirports: [{ airport: { name: 'Cairo International Airport', code: 'CAI' } }]
          }]
        })
      };
    }
  });

  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=Cairo' });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.pathname, '/auto-complete');
  assert.equal(requestedUrl.searchParams.get('query'), 'Cairo');
  assert.equal(requestedHeaders['x-rapidapi-key'], 'test-secret');
  assert.equal(JSON.stringify(response.body).includes('test-secret'), false);
  assert.equal(response.body.data.length, 1);
});

test('autocomplete rejects short queries and missing credentials', async () => {
  let requestCount = 0;
  const configured = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });
  const invalid = await invoke(configured, { url: '/api/flight-autocomplete?query=A' });
  assert.equal(invalid.statusCode, 400);

  const unconfigured = createFlightAutocompleteHandler({
    env: { FLIGHT_ALLOWED_ORIGINS: testEnvironment.FLIGHT_ALLOWED_ORIGINS },
    fetchImpl: configured.fetchImpl
  });
  const missingKey = await invoke(unconfigured, { url: '/api/flight-autocomplete?query=Cairo' });
  assert.equal(missingKey.statusCode, 503);
  assert.equal(requestCount, 0);
});

test('autocomplete translates supported Arabic city names for the provider', async () => {
  let requestedUrl;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-autocomplete?query=${encodeURIComponent('القاهرة')}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.searchParams.get('query'), 'Cairo');
});

test('autocomplete distinguishes Oman from Amman in Arabic', async () => {
  const queries = [];
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      queries.push(new URL(url).searchParams.get('query'));
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });

  for (const query of ['عُمان', 'عمّان']) {
    const response = await invoke(handler, {
      url: `/api/flight-autocomplete?query=${encodeURIComponent(query)}`
    });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(queries, ['Muscat', 'Amman']);
});

test('autocomplete reports unsupported Arabic names without calling provider', async () => {
  let requestCount = 0;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-autocomplete?query=${encodeURIComponent('مدينة غير مدعومة')}`
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /بالإنجليزية/);
  assert.equal(requestCount, 0);
});

test('autocomplete keeps only Arab-country places', async () => {
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [
          { info: { shortName: 'Cairo, Egypt' }, nearbyAirports: [] },
          { info: { shortName: 'Dubai - United Arab Emirates' }, nearbyAirports: [] },
          { info: { shortName: 'Manama, Bahrain' }, nearbyAirports: [] },
          { info: { shortName: 'Riyadh', description: 'Capital of Saudi Arabia' }, nearbyAirports: [] },
          { info: { shortName: 'London, United Kingdom' }, nearbyAirports: [] }
        ],
        status: true
      })
    })
  });

  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=airports' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.body.data.map((place) => place.info.shortName),
    ['Cairo, Egypt', 'Dubai - United Arab Emirates', 'Manama, Bahrain', 'Riyadh']
  );
});

test('round-trip calendar forwards validated inputs and Saudi Riyal currency', async () => {
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 7);
  let requestedUrl;
  let requestedHeaders;
  const handler = createFlightPriceCalendarHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({ data: [{ departureDate, arrivalDate, price: 640 }], status: true })
      };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-price-calendar?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.pathname, '/price-calendar/for-roundtrip');
  assert.equal(requestedUrl.searchParams.get('departureId'), 'CAI');
  assert.equal(requestedUrl.searchParams.get('arrivalId'), 'DXB');
  assert.equal(requestedUrl.searchParams.get('daysBetween'), '7');
  assert.equal(requestedUrl.searchParams.get('currency'), 'SAR');
  assert.equal(requestedUrl.searchParams.get('startDate'), departureDate);
  assert.equal(requestedUrl.searchParams.get('endDate'), nextDate(departureDate, 30));
  assert.equal(requestedHeaders['x-rapidapi-key'], 'test-secret');
  assert.deepEqual(response.body.data, [{ departureDate, arrivalDate, price: 640 }]);
});

test('round-trip calendar rejects one-way, invalid dates, and identical airports', async () => {
  let requestCount = 0;
  const handler = createFlightPriceCalendarHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 1);

  const oneWay = await invoke(handler, {
    url: `/api/flight-price-calendar?tripType=oneway&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  assert.equal(oneWay.statusCode, 400);

  const invalidDates = await invoke(handler, {
    url: '/api/flight-price-calendar?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=2026-02-30&arrivalDate=2026-03-05'
  });
  assert.equal(invalidDates.statusCode, 400);

  const sameAirport = await invoke(handler, {
    url: `/api/flight-price-calendar?tripType=roundtrip&departureId=CAI&arrivalId=CAI&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  assert.equal(sameAirport.statusCode, 400);
  assert.equal(requestCount, 0);
});

test('round-trip flight search forwards route, dates, and search preferences', async () => {
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 7);
  let requestedUrl;
  let requestedHeaders;
  const providerPayload = {
    data: {
      best_flights: [{
        price: 720,
        flights: [{ airline: 'Sample Air', departure_time: `${departureDate} 10:00` }]
      }]
    }
  };
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return { ok: true, json: async () => providerPayload };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-roundtrip?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.pathname, '/flights/roundtrip-returning');
  assert.equal(requestedUrl.searchParams.get('departureId'), 'CAI');
  assert.equal(requestedUrl.searchParams.get('arrivalId'), 'DXB');
  assert.equal(requestedUrl.searchParams.get('departureDate'), departureDate);
  assert.equal(requestedUrl.searchParams.get('arrivalDate'), arrivalDate);
  assert.equal(requestedUrl.searchParams.get('currency'), 'SAR');
  assert.equal(requestedUrl.searchParams.get('adults'), '1');
  assert.equal(requestedUrl.searchParams.get('cabinClass'), '1');
  assert.equal(requestedUrl.searchParams.get('language'), 'en-US');
  assert.equal(requestedHeaders['x-rapidapi-key'], 'test-secret');
  assert.deepEqual(response.body, providerPayload);
});

test('round-trip flight search rejects invalid route and dates before calling provider', async () => {
  let requestCount = 0;
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 1);

  const sameAirport = await invoke(handler, {
    url: `/api/flight-roundtrip?tripType=roundtrip&departureId=CAI&arrivalId=CAI&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  const oneWay = await invoke(handler, {
    url: `/api/flight-roundtrip?tripType=oneway&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  const returnBeforeDeparture = await invoke(handler, {
    url: `/api/flight-roundtrip?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=${arrivalDate}&arrivalDate=${departureDate}`
  });

  assert.equal(sameAirport.statusCode, 400);
  assert.equal(oneWay.statusCode, 400);
  assert.equal(returnBeforeDeparture.statusCode, 400);
  assert.equal(requestCount, 0);
});

test('provider failures return sanitized errors', async () => {
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'test-secret' }) })
  });
  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=Cairo' });

  assert.equal(response.statusCode, 502);
  assert.equal(JSON.stringify(response.body).includes('test-secret'), false);
});
