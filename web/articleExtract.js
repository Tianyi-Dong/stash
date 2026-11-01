// In-app "Save Article" extraction: takes raw HTML fetched server-side (via
// the fetch_html Tauri command, which sidesteps CORS) and runs it through the
// same Readability + Turndown pipeline the importer uses, so all three
// collection pathways (extension, importer, in-app paste) produce
// consistent-looking saves.
function extractArticleFromHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Give relative URLs (images, links) a base to resolve against.
  const base = doc.createElement('base');
  base.href = url;
  doc.head?.prepend(base);

  const meta = (name) =>
    doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
    null;

  const reader = new Readability(doc, { charThreshold: 100 });
  const article = reader.parse();
  if (!article || !article.content) {
    throw new Error('Could not extract article content from that page.');
  }

  const turndownService = new TurndownService({ headingStyle: 'atx' });

  let siteName = article.siteName || meta('og:site_name');
  if (!siteName) {
    try {
      siteName = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      siteName = null;
    }
  }

  return {
    title: article.title || null,
    excerpt: article.excerpt || null,
    content: turndownService.turndown(article.content),
    siteName,
    author: article.byline || meta('author') || null,
    publishedAt: article.publishedTime || meta('article:published_time') || null,
    imageUrl: meta('og:image') || meta('twitter:image') || null,
  };
}
