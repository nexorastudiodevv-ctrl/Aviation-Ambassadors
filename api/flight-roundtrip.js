import {
  createRapidApiHandler,
  requireDate,
  requireText
} from '../lib/rapidapi.js';

export const createFlightRoundTripHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/flights/roundtrip-returning',
  buildParams(params) {
    const arrivalDate = requireDate(params, 'arrivalDate');
    const returningToken = requireText(params, 'returningToken', { max: 8192 });

    return [
      ['returningToken', returningToken],
      ['arrivalDate', arrivalDate],
      ['currency', 'SAR'],
      ['language', 'en-US']
    ];
  }
});

export default createFlightRoundTripHandler();
