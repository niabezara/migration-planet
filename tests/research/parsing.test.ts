/* Phase 4: identifiers, relevance pre-filter and source parsers. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { contentHash, doiFromUrl, isoDate, normalizeDoi, normalizeUrl } from "../../supabase/functions/_shared/research/normalize.ts";
import { assessRelevance } from "../../supabase/functions/_shared/research/relevance.ts";
import { abstractFromInvertedIndex, parseCrossref, parseFeed, parseOpenAlex, textContent } from "../../supabase/functions/_shared/research/parsers.ts";
import { ATOM_FEED, CROSSREF, NATURE_RSS, OPENALEX, SCIENCE_RSS } from "./fixtures.ts";

describe("identifiers", () => {
  test("DOIs are normalised from every common form", () => {
    for (const s of ["10.1038/ABC.1", "doi:10.1038/abc.1", "https://doi.org/10.1038/abc.1", "http://dx.doi.org/10.1038%2Fabc.1", " DOI: 10.1038/abc.1. "]) {
      assert.equal(normalizeDoi(s), "10.1038/abc.1", s);
    }
    assert.equal(normalizeDoi("not a doi"), null);
    assert.equal(normalizeDoi(""), null);
  });

  test("DOIs are found in publisher URLs", () => {
    assert.equal(doiFromUrl("https://www.science.org/doi/abs/10.1126/science.abc1234?af=R"), "10.1126/science.abc1234");
    assert.equal(doiFromUrl("https://www.pnas.org/doi/10.1073/pnas.123"), "10.1073/pnas.123");
    assert.equal(doiFromUrl("https://www.nature.com/articles/s41586-026-00001-x"), null);
  });

  test("URLs are normalised for deduplication", () => {
    assert.equal(normalizeUrl("http://WWW.Science.org/doi/abs/10.1126/x/?af=R#top"), "https://science.org/doi/abs/10.1126/x");
    assert.equal(normalizeUrl("https://example.org/a?utm_source=feed"), normalizeUrl("https://example.org/a"));
    assert.equal(normalizeUrl("javascript:alert(1)"), null);
    assert.equal(normalizeUrl("not a url"), null);
  });

  test("content hash ignores case and spacing of the title", async () => {
    assert.equal(await contentHash("A  Denisovan Molar", "10.1/x"), await contentHash("a denisovan molar", "10.1/x"));
    assert.notEqual(await contentHash("A Denisovan molar", "10.1/x"), await contentHash("A Denisovan molar", "10.1/y"));
  });

  test("dates", () => {
    assert.equal(isoDate("2026-11-12T07:00:02Z"), "2026-11-12");
    assert.equal(isoDate("Wed, 12 Nov 2026 07:00:00 GMT"), "2026-11-12");
    assert.equal(isoDate("garbage"), null);
  });
});

describe("relevance pre-filter", () => {
  const relevant = (t: string, a: string | null = null) => assessRelevance(t, a).relevant;

  test("keeps human-evolution and archaeology research", () => {
    assert.ok(relevant("A Denisovan molar from northern Laos"));
    assert.ok(relevant("Ancient genomes trace the spread of farming"));
    assert.ok(relevant("Acheulean handaxes in the Armenian Highlands"));
    assert.ok(relevant("Neandertal diet at Vindija"));
    assert.ok(relevant("New dates for Dmanisi"));
    assert.ok(relevant("Lake sediments", "Pleistocene dispersal of human populations into the Caucasus"));
  });

  test("drops unrelated work, including context words without a human anchor", () => {
    assert.ok(!relevant("Battery chemistry at scale"));
    assert.ok(!relevant("At-home microbiome tests are taking off"));
    assert.ok(!relevant("Pleistocene megafauna migration", "Mammoth dispersal across Beringia")); // no human anchor
    assert.ok(!relevant("Bird migration and settlement patterns")); // only one context term
  });

  test("reports the matched terms", () => {
    assert.deepEqual(assessRelevance("Neolithic migration into Anatolia", null).matchedTerms, ["stone age", "migration", "caucasus"]);
  });
});

describe("parsers", () => {
  test("Nature RSS (RDF with dc/prism)", () => {
    const [a, b] = parseFeed(NATURE_RSS, "Nature");
    assert.equal(a.title, "A Denisovan molar from a cave in northern Laos");
    assert.equal(a.doi, "10.1038/s41586-026-00001-x");
    assert.equal(a.authors, "A. Researcher, B. Scientist");
    assert.equal(a.publicationDate, "2026-11-12");
    assert.equal(a.journal, "Nature");
    assert.match(a.abstract ?? "", /belonged to a Denisovan/);
    assert.equal(b.doi, "10.1038/d41586-026-00002-y");
  });

  test("Science RSS: entities decoded, DOI from identifier, article type kept", () => {
    const [a, b] = parseFeed(SCIENCE_RSS, "Science");
    assert.equal(a.title, "Early farmers & herders crossed the Caucasus 8,000 years ago");
    assert.equal(a.doi, "10.1126/science.abc1234");
    assert.match(a.abstract ?? "", /Ancient genomes from Georgia/);
    assert.ok(!(a.abstract ?? "").includes("<br"));
    assert.deepEqual(a.metadata, { articleType: "Research Article" });
    assert.equal(b.doi, "10.1126/science.zzz9999", "DOI recovered from the link");
    assert.equal(b.journal, "Science", "falls back to the source name");
  });

  test("Atom", () => {
    const [e] = parseFeed(ATOM_FEED, "Example");
    assert.equal(e.title, "Neanderthal hunters at a Pleistocene lake");
    assert.equal(e.url, "https://example.org/articles/1?utm_source=feed");
    assert.equal(e.authors, "C. Author");
    assert.equal(e.publicationDate, "2026-11-01");
  });

  test("OpenAlex: abstract rebuilt, repositories flagged, retractions dropped", () => {
    const works = parseOpenAlex(OPENALEX);
    assert.equal(works.length, 2);
    assert.equal(works[0].doi, "10.1038/s41586-026-00001-x");
    assert.equal(works[0].abstract, "Proteins show a Denisovan");
    assert.equal(works[0].isPeerReviewed, true);
    assert.equal(works[1].isPeerReviewed, false);
    assert.equal(abstractFromInvertedIndex(null), null);
  });

  test("Crossref: JATS stripped, partial dates completed", () => {
    const [a, b] = parseCrossref(CROSSREF);
    assert.equal(a.abstract, "Stone tools dated to c. 300 ka.");
    assert.equal(a.authors, "D. Author");
    assert.equal(a.publicationDate, "2026-11-03");
    assert.equal(b.publicationDate, "2026-11-01");
  });

  test("textContent handles CDATA, nested escaping and numeric entities", () => {
    assert.equal(textContent("<![CDATA[<p>a &amp; b</p>]]>"), "a & b");
    assert.equal(textContent("&lt;i&gt;Homo&lt;/i&gt; &#x2013; &#8212;"), "Homo – —");
  });
});
