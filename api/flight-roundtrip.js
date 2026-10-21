import {
  createRapidApiHandler,
  RequestValidationError,
  requireDate,
  requireText
} from '../lib/rapidapi.js';

export const createFlightRoundTripHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/flights/roundtrip-returning',
  buildParams(params) {
    if (params.get('tripType') !== 'roundtrip') {
      throw new RequestValidationError('Full flight results are currently available for round trips only.');
    }

    const departureId = requireText(params, 'departureId');
    const arrivalId = requireText(params, 'arrivalId');
    if (departureId === arrivalId) {
      throw new RequestValidationError('Departure and arrival airports must be different.');
    }

    const departureDate = requireDate(params, 'departureDate');
    const arrivalDate = requireDate(params, 'arrivalDate');
    if (departureDate < new Date().toISOString().slice(0, 10)) {
      throw new RequestValidationError('Departure date must be today or later.');
    }
    if (arrivalDate <= departureDate) {
      throw new RequestValidationError('Return date must be after departure date.');
    }

    return [
      ['departureId', departureId],
      ['arrivalId', arrivalId],
      ['departureDate', departureDate],
      ['arrivalDate', arrivalDate],
      ['currency', 'SAR'],
      ['adults', '1'],
      ['cabinClass', '1'],
      ['language', 'en-US']
    ];
  }
});

export default createFlightRoundTripHandler();
