/**
 * Synthetic responses in the exact formats the real sources return (checked
 * against live Nature/Science/PNAS feeds and the OpenAlex/Crossref APIs in
 * Nov 2026). Content is invented; structure is real.
 */

/** RSS 1.0 (RDF) with dc/prism fields, as Nature publishes it. */
export const NATURE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="http://feeds.nature.com/nature/rss/current"><title>Nature</title></channel>
  <item rdf:about="https://www.nature.com/articles/s41586-026-00001-x">
    <title><![CDATA[A Denisovan molar from a cave in northern Laos]]></title>
    <link>https://www.nature.com/articles/s41586-026-00001-x</link>
    <content:encoded><![CDATA[<p>Nature, Published online: 12 November 2026; <a href="https://www.nature.com/articles/s41586-026-00001-x">doi:10.1038/s41586-026-00001-x</a></p>Proteins show the tooth belonged to a Denisovan.]]></content:encoded>
    <dc:title><![CDATA[A Denisovan molar from a cave in northern Laos]]></dc:title>
    <dc:creator>A. Researcher</dc:creator>
    <dc:creator>B. Scientist</dc:creator>
    <dc:identifier>doi:10.1038/s41586-026-00001-x</dc:identifier>
    <dc:date>2026-11-12</dc:date>
    <prism:publicationName>Nature</prism:publicationName>
    <prism:doi>10.1038/s41586-026-00001-x</prism:doi>
    <prism:url>https://www.nature.com/articles/s41586-026-00001-x</prism:url>
  </item>
  <item rdf:about="https://www.nature.com/articles/d41586-026-00002-y">
    <title><![CDATA[At-home microbiome tests are taking off. Can they be trusted?]]></title>
    <link>https://www.nature.com/articles/d41586-026-00002-y</link>
    <dc:identifier>doi:10.1038/d41586-026-00002-y</dc:identifier>
    <dc:date>2026-11-18</dc:date>
    <prism:doi>10.1038/d41586-026-00002-y</prism:doi>
  </item>
</rdf:RDF>`;

/** Science / PNAS style: escaped HTML in description, DOI in the link with ?af=R. */
export const SCIENCE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/">
  <item rdf:about="https://www.science.org/doi/abs/10.1126/science.abc1234?af=R">
    <title>Early farmers &amp; herders crossed the Caucasus 8,000 years ago</title>
    <link>https://www.science.org/doi/abs/10.1126/science.abc1234?af=R</link>
    <description>Science, Volume 394, Issue 6825, November 2026. &lt;br/&gt;Ancient genomes from Georgia trace Neolithic migration.</description>
    <dc:identifier>doi:10.1126/science.abc1234</dc:identifier>
    <dc:date>2026-11-12T07:00:02Z</dc:date>
    <dc:type>Research Article</dc:type>
    <prism:publicationName>Science</prism:publicationName>
  </item>
  <item rdf:about="https://www.science.org/doi/abs/10.1126/science.zzz9999?af=R">
    <title>Mysticism meets empiricism</title>
    <link>https://www.science.org/doi/abs/10.1126/science.zzz9999?af=R</link>
    <dc:date>2026-11-12T07:00:02Z</dc:date>
    <dc:type>Books et al.</dc:type>
  </item>
</rdf:RDF>`;

/** Atom, for completeness. */
export const ATOM_FEED = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>tag:example.org,2026:1</id><title>Neanderthal hunters at a Pleistocene lake</title>
  <link href="https://example.org/articles/1?utm_source=feed"/><updated>2026-11-01T00:00:00Z</updated>
  <author><name>C. Author</name></author><summary>Stone tools and butchered bones.</summary></entry>
</feed>`;

export const OPENALEX = {
  meta: { count: 3, next_cursor: null },
  results: [
    {
      id: "https://openalex.org/W1",
      // Same publication as the Nature RSS item: must be stored once.
      doi: "https://doi.org/10.1038/S41586-026-00001-X",
      title: "A Denisovan molar from a cave in northern Laos",
      publication_date: "2026-11-12",
      type: "article",
      is_retracted: false,
      primary_location: { landing_page_url: "https://www.nature.com/articles/s41586-026-00001-x", source: { display_name: "Nature", type: "journal" } },
      authorships: [{ author: { display_name: "A. Researcher" } }],
      abstract_inverted_index: { Proteins: [0], show: [1], a: [2], Denisovan: [3] },
    },
    {
      id: "https://openalex.org/W2",
      doi: "https://doi.org/10.5281/zenodo.1",
      title: "Language as an evolutionary advantage in Neanderthals",
      publication_date: "2026-11-10",
      type: "article",
      is_retracted: false,
      primary_location: { landing_page_url: "https://zenodo.org/records/1", source: { display_name: "Zenodo", type: "repository" } },
      authorships: [],
      abstract_inverted_index: null,
    },
    {
      id: "https://openalex.org/W3",
      doi: "https://doi.org/10.1000/retracted",
      title: "A retracted hominin claim",
      publication_date: "2026-11-01",
      type: "article",
      is_retracted: true,
      primary_location: null,
      authorships: [],
    },
  ],
};

export const CROSSREF = {
  message: {
    items: [
      {
        DOI: "10.1016/j.jhevol.2026.100001",
        title: ["Palaeolithic occupation of the Armenian Highlands"],
        URL: "https://doi.org/10.1016/j.jhevol.2026.100001",
        author: [{ given: "D.", family: "Author" }],
        "container-title": ["Journal of Human Evolution"],
        abstract: "<jats:p>Stone tools dated to <jats:italic>c.</jats:italic> 300 ka.</jats:p>",
        published: { "date-parts": [[2026, 11, 3]] },
        type: "journal-article",
      },
      {
        DOI: "10.1000/unrelated",
        title: ["Battery chemistry at scale"],
        URL: "https://doi.org/10.1000/unrelated",
        published: { "date-parts": [[2026, 11]] },
        type: "journal-article",
      },
    ],
  },
};
