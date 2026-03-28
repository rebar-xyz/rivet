import { defineMessage } from '../define-message.js';

/** cosmos.base.v1beta1.Coin */
export const Coin = defineMessage('/cosmos.base.v1beta1.Coin', {
  denom: { type: 'string', field: 1 },
  amount: { type: 'string', field: 2 },
});

/** cosmos.base.query.v1beta1.PageRequest */
export const PageRequest = defineMessage('/cosmos.base.query.v1beta1.PageRequest', {
  key: { type: 'bytes', field: 1 },
  offset: { type: 'uint64', field: 2 },
  limit: { type: 'uint64', field: 3 },
  countTotal: { type: 'bool', field: 4 },
  reverse: { type: 'bool', field: 5 },
});

/** cosmos.base.query.v1beta1.PageResponse */
export const PageResponse = defineMessage('/cosmos.base.query.v1beta1.PageResponse', {
  nextKey: { type: 'bytes', field: 1 },
  total: { type: 'uint64', field: 2 },
});
