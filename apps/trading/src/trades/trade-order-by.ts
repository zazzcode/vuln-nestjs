/** The orders a trade list may take. An identifier is never among them: a column is chosen from this list. */
export enum TradeOrderBy {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  PRICE_HIGH = 'PRICE_HIGH',
  PRICE_LOW = 'PRICE_LOW',
}
