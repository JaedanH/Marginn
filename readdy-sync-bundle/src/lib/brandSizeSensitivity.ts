/**
 * Heuristic: some brands’ resale is highly size-dependent; for others size matters less.
 * Extend allow/deny lists over time; optional DB column could override in future.
 */

const SIZE_CRITICAL_BRANDS = new Set(
  [
    'supreme',
    'stone island',
    'cp company',
    'acne studios',
    'rick owens',
    'chrome hearts',
    'fear of god',
    'off-white',
    'off white',
    'balenciaga',
    'dior',
    'louis vuitton',
    'prada',
    'gucci',
    'moncler',
    'canada goose',
  ].map((s) => s.toLowerCase())
);

const SIZE_LESS_CRITICAL_BRANDS = new Set(
  [
    'ralph lauren',
    'polo ralph lauren',
    'nike',
    'adidas',
    'uniqlo',
    'h&m',
    'hm',
    'zara',
    'gap',
    'levi',
    "levi's",
    'carhartt',
    'champion',
    'tommy hilfiger',
    'lacoste',
    'calvin klein',
  ].map((s) => s.toLowerCase())
);

function normBrand(s: string): string {
  return s.trim().toLowerCase();
}

/** Short UI label for scan result card; null = omit row. */
export function sizeSensitivityLabel(brand: string): string | null {
  const b = normBrand(brand);
  if (!b) return null;
  for (const k of SIZE_CRITICAL_BRANDS) {
    if (b.includes(k) || k.includes(b)) {
      return 'Resale very size-sensitive';
    }
  }
  for (const k of SIZE_LESS_CRITICAL_BRANDS) {
    if (b.includes(k) || k.includes(b)) {
      return 'Size usually less critical';
    }
  }
  return null;
}
