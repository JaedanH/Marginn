/** Minimum live eBay sold comps before showing a resale £ figure in the app. */
export const MIN_EBAY_SOLD_COMPS_FOR_DISPLAY = 10;

export function ebayLiveCompCount(pricesLen: number, listingCardsLen: number): number {
  return Math.max(pricesLen, listingCardsLen);
}

/** API `total` counts comps even when only a page of listings is parsed. */
export function resolveEbayCompCount(args: {
  method: string;
  soldCount: number;
  pricesLen: number;
  listingCardsLen: number;
}): number {
  const parsed = ebayLiveCompCount(args.pricesLen, args.listingCardsLen);
  if ((args.method === "finding_api" || args.method === "browse_api") && args.soldCount > 0) {
    return Math.max(args.soldCount, parsed);
  }
  return parsed;
}

export function shouldSuppressResaleDisplay(ebayLiveCompCount: number): boolean {
  return ebayLiveCompCount < MIN_EBAY_SOLD_COMPS_FOR_DISPLAY;
}
