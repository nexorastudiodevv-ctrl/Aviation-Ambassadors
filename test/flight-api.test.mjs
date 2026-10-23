import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlightAutocompleteHandler } from '../api/flight-autocomplete.js';
import { createFlightPriceCalendarHandler } from '../api/flight-price-calendar.js';
import { createFlightRoundTripHandler } from '../api/flight-roundtrip.js';
import { createFlightRoundTripOutboundHandler } from '../api/flight-roundtrip-outbound.js';
import { createTravelpayoutsPricesHandler } from '../api/travelpayouts-prices.js';

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
  TRAVELPAYOUTS_TOKEN: 'travelpayouts-test-secret',
  FLIGHT_ALLOWED_ORIGINS: 'https://avam.nexorastudio-eg.com'
};

function nextDate(date, days = 1) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test('autocomplete queries Travelpayouts places and normalizes Arab airport data', async () => {
  let requestedUrl;
  let requestedHeaders;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        json: async () => [{
          type: 'airport',
          code: 'CAI',
          name: 'مطار القاهرة الدولى',
          city_name: 'القاهرة',
          country_code: 'EG',
          country_name: 'مصر'
        }]
      };
    }
  });

  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=Cairo' });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.origin, 'https://autocomplete.travelpayouts.com');
  assert.equal(requestedUrl.pathname, '/places2');
  assert.equal(requestedUrl.searchParams.get('term'), 'Cairo');
  assert.equal(requestedUrl.searchParams.get('locale'), 'en');
  assert.deepEqual(requestedUrl.searchParams.getAll('types[]'), ['city', 'airport']);
  assert.equal(requestedHeaders, undefined);
  assert.equal(response.body.data.length, 1);
  assert.deepEqual(response.body.data[0], {
    code: 'CAI',
    name: 'مطار القاهرة الدولى',
    cityName: 'القاهرة',
    countryName: 'مصر',
    countryCode: 'EG',
    type: 'airport'
  });
});

test('autocomplete rejects short queries and missing origin configuration', async () => {
  let requestCount = 0;
  const configured = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => [] };
    }
  });
  const invalid = await invoke(configured, { url: '/api/flight-autocomplete?query=A' });
  assert.equal(invalid.statusCode, 400);

  const unconfigured = createFlightAutocompleteHandler({
    env: {},
    fetchImpl: configured.fetchImpl
  });
  const missingKey = await invoke(unconfigured, { url: '/api/flight-autocomplete?query=Cairo' });
  assert.equal(missingKey.statusCode, 503);
  assert.equal(requestCount, 0);
});

test('autocomplete searches Arabic input using the Arabic Travelpayouts locale', async () => {
  let requestedUrl;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => [] };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-autocomplete?query=${encodeURIComponent('القاهرة')}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.searchParams.get('term'), 'القاهرة');
  assert.equal(requestedUrl.searchParams.get('locale'), 'ar');
});

test('autocomplete distinguishes Oman from Amman in Arabic', async () => {
  const queries = [];
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      queries.push({
        term: new URL(url).searchParams.get('term'),
        locale: new URL(url).searchParams.get('locale')
      });
      return { ok: true, json: async () => [] };
    }
  });

  for (const query of ['عُمان', 'عمّان']) {
    const response = await invoke(handler, {
      url: `/api/flight-autocomplete?query=${encodeURIComponent(query)}`
    });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(queries, [
    { term: 'عُمان', locale: 'ar' },
    { term: 'عمّان', locale: 'ar' }
  ]);
});

test('autocomplete passes Arabic place names outside the alias list to the provider', async () => {
  let requestedUrl;
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => [] };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-autocomplete?query=${encodeURIComponent('مدينة عربية أخرى')}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.searchParams.get('term'), 'مدينة عربية أخرى');
  assert.equal(requestedUrl.searchParams.get('locale'), 'ar');
});

test('autocomplete keeps only Arab-country places', async () => {
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        { type: 'city', code: 'CAI', name: 'القاهرة', country_code: 'EG', country_name: 'مصر' },
        { type: 'airport', code: 'DXB', name: 'Dubai Airport', city_name: 'Dubai', country_code: 'AE', country_name: 'United Arab Emirates' },
        { type: 'airport', code: 'BAH', name: 'Bahrain Airport', country_name: 'Bahrain', country_code: 'BH' },
        { type: 'city', code: 'RUH', name: 'Riyadh', country_code: 'SA', country_name: 'Saudi Arabia' },
        { type: 'airport', code: 'MCT', name: 'Muscat Airport', country_code: 'OM' },
        { type: 'airport', code: 'LHR', name: 'London Heathrow', country_code: 'GB', country_name: 'United Kingdom' }
      ]
    })
  });

  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=airports' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.body.data.map((place) => place.code),
    ['CAI', 'DXB', 'BAH', 'RUH', 'MCT']
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

test('round-trip outbound search gets returning tokens from the provider', async () => {
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
  const handler = createFlightRoundTripOutboundHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return { ok: true, json: async () => providerPayload };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-roundtrip-outbound?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.pathname, '/flights/roundtrip');
  assert.equal(requestedUrl.searchParams.get('departureId'), 'CAI');
  assert.equal(requestedUrl.searchParams.get('arrivalId'), 'DXB');
  assert.equal(requestedUrl.searchParams.get('departureDate'), departureDate);
  assert.equal(requestedUrl.searchParams.has('arrivalDate'), false);
  assert.equal(requestedUrl.searchParams.get('currency'), 'SAR');
  assert.equal(requestedUrl.searchParams.get('adults'), '1');
  assert.equal(requestedUrl.searchParams.get('cabinClass'), '1');
  assert.equal(requestedUrl.searchParams.get('language'), 'en-US');
  assert.equal(requestedHeaders['x-rapidapi-key'], 'test-secret');
  assert.deepEqual(response.body, providerPayload);
});

test('round-trip returning search passes the token and return date to provider', async () => {
  const arrivalDate = nextDate(new Date().toISOString().slice(0, 10), 17);
  const returningToken = 'valid-returning-token';
  let requestedUrl;
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return { ok: true, json: async () => ({ data: { otherFlights: [] } }) };
    }
  });

  const response = await invoke(handler, {
    url: `/api/flight-roundtrip?returningToken=${returningToken}&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.pathname, '/flights/roundtrip-returning');
  assert.equal(requestedUrl.searchParams.get('returningToken'), returningToken);
  assert.equal(requestedUrl.searchParams.get('arrivalDate'), arrivalDate);
  assert.equal(requestedUrl.searchParams.get('currency'), 'SAR');
  assert.equal(requestedUrl.searchParams.get('language'), 'en-US');
});

test('Travelpayouts prices validate input and keep the API token server-side', async () => {
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const returnDate = nextDate(departureDate, 7);
  let requestedUrl;
  let requestedHeaders;
  const providerPayload = {
    success: true,
    currency: 'sar',
    data: [{
      origin: 'CAI',
      destination: 'DXB',
      price: 830,
      airline: 'MS',
      flight_number: 123,
      departure_at: `${departureDate}T10:00:00Z`,
      return_at: `${returnDate}T16:00:00Z`,
      transfers: 0,
      link: 'https://www.aviasales.com/example'
    }]
  };
  const handler = createTravelpayoutsPricesHandler({
    env: testEnvironment,
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return { ok: true, json: async () => providerPayload };
    }
  });

  const response = await invoke(handler, {
    url: `/api/travelpayouts-prices?origin=cai&destination=dxb&departure_at=${departureDate}&return_at=${returnDate}&currency=SAR`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedUrl.origin, 'https://api.travelpayouts.com');
  assert.equal(requestedUrl.pathname, '/aviasales/v3/prices_for_dates');
  assert.equal(requestedUrl.searchParams.get('origin'), 'CAI');
  assert.equal(requestedUrl.searchParams.get('destination'), 'DXB');
  assert.equal(requestedUrl.searchParams.get('departure_at'), departureDate);
  assert.equal(requestedUrl.searchParams.get('return_at'), returnDate);
  assert.equal(requestedUrl.searchParams.get('currency'), 'sar');
  assert.equal(requestedHeaders['x-access-token'], 'travelpayouts-test-secret');
  assert.equal(JSON.stringify(response.body).includes('travelpayouts-test-secret'), false);
  assert.deepEqual(response.body.data, providerPayload.data);
});

test('Travelpayouts prices reject invalid routes and missing credentials without provider calls', async () => {
  let requestCount = 0;
  const configured = createTravelpayoutsPricesHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const returnDate = nextDate(departureDate, 1);

  const invalid = await invoke(configured, {
    url: `/api/travelpayouts-prices?origin=CAIRO&destination=DXB&departure_at=${departureDate}&return_at=${returnDate}`
  });
  assert.equal(invalid.statusCode, 400);

  const unsupportedCurrency = await invoke(configured, {
    url: `/api/travelpayouts-prices?origin=CAI&destination=DXB&departure_at=${departureDate}&return_at=${returnDate}&currency=XYZ`
  });
  assert.equal(unsupportedCurrency.statusCode, 400);

  const missingToken = createTravelpayoutsPricesHandler({
    env: { FLIGHT_ALLOWED_ORIGINS: testEnvironment.FLIGHT_ALLOWED_ORIGINS },
    fetchImpl: configured.fetchImpl
  });
  const unconfigured = await invoke(missingToken, {
    url: `/api/travelpayouts-prices?origin=CAI&destination=DXB&departure_at=${departureDate}&return_at=${returnDate}`
  });
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(requestCount, 0);
});

test('Travelpayouts prices reject unapproved website origins', async () => {
  let requestCount = 0;
  const handler = createTravelpayoutsPricesHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }
  });
  const req = {
    method: 'GET',
    url: '/api/travelpayouts-prices',
    headers: { origin: 'https://unapproved.example' }
  };
  const res = createResponse(200);
  res.end = () => {
    res.ended = true;
  };

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(requestCount, 0);
});

test('round-trip outbound and returning searches reject invalid parameters before calling provider', async () => {
  let requestCount = 0;
  const handler = createFlightRoundTripOutboundHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 1);

  const sameAirport = await invoke(handler, {
    url: `/api/flight-roundtrip-outbound?tripType=roundtrip&departureId=CAI&arrivalId=CAI&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  const oneWay = await invoke(handler, {
    url: `/api/flight-roundtrip-outbound?tripType=oneway&departureId=CAI&arrivalId=DXB&departureDate=${departureDate}&arrivalDate=${arrivalDate}`
  });
  const returnBeforeDeparture = await invoke(handler, {
    url: `/api/flight-roundtrip-outbound?tripType=roundtrip&departureId=CAI&arrivalId=DXB&departureDate=${arrivalDate}&arrivalDate=${departureDate}`
  });
  const missingToken = await invoke(createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async () => {
      requestCount += 1;
      return { ok: true, json: async () => ({ data: [] }) };
    }
  }), {
    url: `/api/flight-roundtrip?arrivalDate=${arrivalDate}`
  });

  assert.equal(sameAirport.statusCode, 400);
  assert.equal(oneWay.statusCode, 400);
  assert.equal(returnBeforeDeparture.statusCode, 400);
  assert.equal(missingToken.statusCode, 400);
  assert.equal(requestCount, 0);
});

test('Travelpayouts autocomplete failures do not disclose credentials', async () => {
  const handler = createFlightAutocompleteHandler({
    env: testEnvironment,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'test-secret' }) })
  });
  const response = await invoke(handler, { url: '/api/flight-autocomplete?query=Cairo' });

  assert.equal(response.statusCode, 502);
  assert.match(response.body.message, /Travelpayouts/);
  assert.equal(JSON.stringify(response.body).includes('test-secret'), false);
});

test('Travelpayouts autocomplete rate limits and errors are explained to users', async () => {
  for (const [status, expected] of [
    [429, /طلبات اقتراح المطارات/],
    [502, /Travelpayouts \(HTTP 502\)/]
  ]) {
    const handler = createFlightAutocompleteHandler({
      env: testEnvironment,
      fetchImpl: async () => ({ ok: false, status, json: async () => ({}) })
    });
    const response = await invoke(handler, { url: '/api/flight-autocomplete?query=Cairo' });

    assert.equal(response.statusCode, 502);
    assert.match(response.body.message, expected);
  }
});

test('provider rejection messages are shown without exposing credentials', async () => {
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: false,
        message: 'Errors',
        errors: [{ code: 'invalid_parameter', field: 'arrivalDate', message: 'Invalid value for test-secret' }]
      })
    })
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 7);
  const response = await invoke(handler, {
    url: `/api/flight-roundtrip?returningToken=token&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.message, 'Errors: invalid_parameter: arrivalDate: Invalid value for [redacted]');
  assert.equal(JSON.stringify(response.body).includes('test-secret'), false);
});

test('provider field errors are shown when returned as an object', async () => {
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: false,
        message: 'Errors',
        errors: { returningToken: 'The returningToken is invalid' }
      })
    })
  });
  const arrivalDate = nextDate(new Date().toISOString().slice(0, 10), 17);
  const response = await invoke(handler, {
    url: `/api/flight-roundtrip?returningToken=token&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.message, 'Errors: returningToken: The returningToken is invalid');
});

test('generic provider errors explain that full flight details are unavailable', async () => {
  const handler = createFlightRoundTripHandler({
    env: testEnvironment,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ status: false, message: 'Errors' })
    })
  });
  const departureDate = nextDate(new Date().toISOString().slice(0, 10), 10);
  const arrivalDate = nextDate(departureDate, 7);
  const response = await invoke(handler, {
    url: `/api/flight-roundtrip?returningToken=token&arrivalDate=${arrivalDate}`
  });

  assert.equal(response.statusCode, 422);
  assert.match(response.body.message, /could not return full flight details/i);
});
