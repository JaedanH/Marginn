/**
 * Simple keyword matcher: derive item_type from listing title for whitelist rows.
 */

const ITEM_TYPE_RULES: { type: string; patterns: RegExp[] }[] = [
  { type: "trainers", patterns: [/\b(trainers?|sneakers?|runners?|air max|jordan|dunk)\b/i] },
  { type: "boots", patterns: [/\b(boots?|chelsea boot|timberland)\b/i] },
  { type: "jeans", patterns: [/\b(jeans?|denim pants|501|502|511)\b/i] },
  { type: "trousers", patterns: [/\b(trousers?|chinos?|cargo pants|joggers?)\b/i] },
  { type: "shorts", patterns: [/\b(shorts)\b/i] },
  { type: "jacket", patterns: [/\b(jacket|coat|parka|windbreaker|blazer|bomber|gilet|vest)\b/i] },
  { type: "hoodie", patterns: [/\b(hoodie|hoody|sweatshirt|pullover)\b/i] },
  { type: "t-shirt", patterns: [/\b(t-?shirt|tee|polo)\b/i] },
  { type: "shirt", patterns: [/\b(shirt|oxford|flannel)\b/i] },
  { type: "jumper", patterns: [/\b(jumper|sweater|knitwear|cardigan)\b/i] },
  { type: "dress", patterns: [/\b(dress|gown)\b/i] },
  { type: "skirt", patterns: [/\b(skirt)\b/i] },
  { type: "bag", patterns: [/\b(bag|backpack|rucksack|tote|holdall)\b/i] },
  { type: "hat", patterns: [/\b(hat|cap|beanie|bucket hat)\b/i] },
  { type: "accessory", patterns: [/\b(belt|wallet|scarf|gloves?|sunglasses)\b/i] },
];

/** First matching category, else `unknown`. */
export function itemTypeFromTitle(title: string): string {
  const t = title.trim();
  if (!t) return "unknown";
  for (const rule of ITEM_TYPE_RULES) {
    for (const p of rule.patterns) {
      if (p.test(t)) return rule.type;
    }
  }
  return "unknown";
}
