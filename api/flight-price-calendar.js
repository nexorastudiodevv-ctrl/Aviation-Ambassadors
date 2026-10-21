import {
  addDays,
  createRapidApiHandler,
  RequestValidationError,
  requireDate,
  requireText
} from '../lib/rapidapi.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const createFlightPriceCalendarHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/price-calendar/for-roundtrip',
  buildParams(params) {
    if (params.get('tripType') !== 'roundtrip') {
      throw new RequestValidationError('Price calendars are currently available for round trips only.');
    }

    const departureId = requireText(params, 'departureId');
    const arrivalId = requireText(params, 'arrivalId');
    if (departureId === arrivalId) {
      throw new RequestValidationError('Departure and arrival airports must be different.');
    }

    const departureDate = requireDate(params, 'departureDate');
    const arrivalDate = requireDate(params, 'arrivalDate');
    const departureTime = Date.parse(`${departureDate}T00:00:00.000Z`);
    const arrivalTime = Date.parse(`${arrivalDate}T00:00:00.000Z`);
    const daysBetween = (arrivalTime - departureTime) / DAY_IN_MS;
    const today = new Date().toISOString().slice(0, 10);

    if (departureDate < today) {
      throw new RequestValidationError('Departure date must be today or later.');
    }
    if (daysBetween < 1 || daysBetween > 30) {
      throw new RequestValidationError('Return date must be 1 to 30 days after departure.');
    }

    const calendarStartDate = departureDate;
    const calendarEndDate = addDays(calendarStartDate, 30);

    return [
      ['departureId', departureId],
      ['arrivalId', arrivalId],
      ['departureDate', departureDate],
      ['arrivalDate', arrivalDate],
      ['startDate', calendarStartDate],
      ['endDate', calendarEndDate],
      ['daysBetween', String(daysBetween)],
      ['language', 'en-US'],
      ['location', 'US'],
      ['currency', 'SAR'],
      ['adults', '1'],
      ['children', '0'],
      ['infantsInSeat', '0'],
      ['cabinClass', '1']
    ];
  }
});

export default createFlightPriceCalendarHandler();
