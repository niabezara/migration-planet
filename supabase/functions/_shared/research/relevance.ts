/**
 * Keyword pre-filter for discovered publications. It only decides what is
 * worth storing for analysis; it never creates a proposal. Relevance proper
 * is judged later by the AI analysis (phase 5), which can mark a stored
 * publication irrelevant.
 *
 * A publication is a candidate when its title or abstract contains one
 * "strong" term, or at least two "context" terms together with a human or
 * archaeological anchor (e.g. "Pleistocene" + "dispersal" + "humans").
 */

const STRONG: [string, RegExp][] = [
  ["hominin", /\bhominins?\b|\bhominids?\b/],
  ["neanderthal", /\bneand[e]?rt(?:h)?als?\b/],
  ["denisovan", /\bdenisovans?\b/],
  ["homo species", /\bhomo (?:sapiens|erectus|floresiensis|luzonensis|naledi|heidelbergensis|antecessor|longi|habilis|ergaster|georgicus)\b/],
  ["australopith", /\baustralopith\w*|\bparanthropus\b/],
  ["ancient dna", /\bancient (?:dna|genomes?|genomic\w*|human genomes?)\b|\bpalaeogenom\w*|\bpaleogenom\w*/],
  ["archaic humans", /\b(?:archaic|anatomically modern|early modern) humans?\b/],
  ["stone age", /\bpal(?:a)?eolithic\b|\bmesolithic\b|\bneolithic\b|\bstone age\b|\bbronze age\b|\bchalcolithic\b/],
  ["stone tools", /\bstone tools?\b|\blithic\w*\b|\bacheulean\b|\boldowan\b|\bmousterian\b|\baurignacian\b|\bgravettian\b/],
  ["prehistoric art", /\b(?:rock|cave|parietal|figurative) art\b|\bpetroglyphs?\b/],
  ["hunter-gatherers", /\bhunter-?gatherers?\b|\bforagers?\b/],
  ["human evolution", /\bhuman (?:evolution|origins?|dispersals?|ancestors?)\b|\bout of africa\b|\bpeopling of\b/],
  ["dmanisi", /\bdmanisi\b/],
];

const CONTEXT: [string, RegExp][] = [
  ["pleistocene", /\bpleistocene\b/],
  ["holocene", /\bholocene\b/],
  ["prehistoric", /\bprehistor\w*/],
  ["archaeology", /\barch(?:a)?eolog\w*/],
  ["migration", /\bmigrations?\b|\bdispersals?\b/],
  ["domestication", /\bdomesticat\w*/],
  ["early farming", /\b(?:early|first) (?:farm\w*|agricultur\w*)|\borigins? of agriculture\b/],
  ["settlement", /\bsettlements?\b|\bproto-?cit(?:y|ies)\b/],
  ["pottery", /\bpottery\b|\bceramics?\b/],
  ["metallurgy", /\bmetallurg\w*|\bsmelting\b/],
  ["symbolic", /\bsymbolic\b|\bochre\b|\bornaments?\b|\bburials?\b/],
  ["caucasus", /\bcaucasus\b|\bgeorgia(?:n)?\b|\barmenia\w*|\banatolia\w*/],
  ["fossils", /\bfossils?\b/],
  ["ice age", /\bice age\b|\blast glacial\b/],
];

const ANCHOR = /\bhumans?\b|\bpeople\b|\bpopulations?\b|\barch(?:a)?eolog\w*|\bancestr\w*/;

export interface Relevance {
  relevant: boolean;
  matchedTerms: string[];
}

export function assessRelevance(title: string, abstract: string | null): Relevance {
  const text = `${title} ${abstract ?? ""}`.toLowerCase();
  const strong = STRONG.filter(([, re]) => re.test(text)).map(([name]) => name);
  const context = CONTEXT.filter(([, re]) => re.test(text)).map(([name]) => name);
  const relevant = strong.length > 0 || (context.length >= 2 && ANCHOR.test(text));
  return { relevant, matchedTerms: [...strong, ...context] };
}
