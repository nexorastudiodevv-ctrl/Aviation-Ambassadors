import {
  createRapidApiHandler,
  RequestValidationError,
  requireDate,
  requireText
} from '../lib/rapidapi.js';

export const createFlightRoundTripOutboundHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/flights/roundtrip',
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
    const today = new Date().toISOString().slice(0, 10);
    if (departureDate < today) {
      throw new RequestValidationError('Departure date must be today or later.');
    }
    if (arrivalDate <= departureDate) {
      throw new RequestValidationError('Return date must be after departure date.');
    }

    return [
      ['departureId', departureId],
      ['arrivalId', arrivalId],
      ['departureDate', departureDate],
      ['currency', 'SAR'],
      ['adults', '1'],
      ['cabinClass', '1'],
      ['language', 'en-US']
    ];
  }
});

export default createFlightRoundTripOutboundHandler();
