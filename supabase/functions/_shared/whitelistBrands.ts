/** Brands processed by build-whitelist (weekly scrape). Order is stable for cursor offsets. */
export const WHITELIST_BRANDS = [
  "Nike",
  "Adidas",
  "Reebok",
  "Ralph Lauren",
  "Tommy Hilfiger",
  "Levi's",
  "Wrangler",
  "Lee",
  "Fred Perry",
  "Lacoste",
  "Fila",
  "Ellesse",
  "Kappa",
  "Umbro",
  "Sergio Tacchini",
  "Stone Island",
  "CP Company",
  "Burberry",
  "Paul Smith",
  "Ted Baker",
  "Hugo Boss",
  "Barbour",
  "Supreme",
  "Palace",
  "Stussy",
  "Carhartt",
  "Gucci",
  "Prada",
  "Louis Vuitton",
  "Balenciaga",
] as const;

export type WhitelistBrand = (typeof WHITELIST_BRANDS)[number];

export function vintedSearchUrl(brand: string): string {
  const q = encodeURIComponent(brand.trim());
  return `https://www.vinted.co.uk/catalog?search_text=${q}&order=relevance`;
}

export function depopSearchUrl(brand: string): string {
  const q = encodeURIComponent(brand.trim());
  return `https://www.depop.com/search/?country=gb&q=${q}&condition=used`;
}

export function ebayBrandKeywords(brand: string): string {
  return brand.trim();
}
