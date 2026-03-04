/**
 * OPML (Outline Processor Markup Language) parser
 * Extracts RSS feed URLs from OPML export files
 */

export interface OpmlFeed {
  url: string;
  title: string;
}

/**
 * Parse OPML XML string into a flat list of feeds
 * Handles nested outline structures (categories/folders)
 * Skips outline elements without xmlUrl attribute
 * @throws Error if XML is malformed
 */
export function parseOpml(xmlString: string): OpmlFeed[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors (DOMParser doesn't throw, but creates a parsererror element)
  if (doc.documentElement.nodeName === 'parsererror') {
    throw new Error('Invalid XML: unable to parse OPML file');
  }

  const feeds: OpmlFeed[] = [];

  // Query all outline elements that have an xmlUrl attribute (RSS feed URLs)
  const outlines = doc.querySelectorAll('outline[xmlUrl]');

  outlines.forEach((outline) => {
    const url = outline.getAttribute('xmlUrl');
    const title = outline.getAttribute('text') || outline.getAttribute('title') || url;

    if (url) {
      feeds.push({
        url: url.trim(),
        title: (title as string).trim(),
      });
    }
  });

  return feeds;
}
