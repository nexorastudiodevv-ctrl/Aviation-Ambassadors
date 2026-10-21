import { createRapidApiHandler, requireText } from '../lib/rapidapi.js';

export const createFlightAutocompleteHandler = (options = {}) => createRapidApiHandler({
  ...options,
  endpoint: '/auto-complete',
  buildParams(params) {
    return [['query', requireText(params, 'query', { min: 2, max: 100 })]];
  }
});

export default createFlightAutocompleteHandler();
