function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractRssTag(block, tagName) {
  const patterns = [
    new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'),
  ];
  for (const re of patterns) {
    const match = block.match(re);
    if (match) return match[1].trim();
  }
  return '';
}

function cleanExcerpt(text) {
  return String(text || '')
    .replace(/\s*\[…\]\s*$/u, '.')
    .replace(/\s*\[\.\.\.\]\s*$/, '.')
    .replace(/\s*\[&#8230;\]\s*$/, '.')
    .trim();
}

function firstSentences(text, count = 2) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return cleanExcerpt(cleaned);
  return cleanExcerpt(sentences.slice(0, count).join(' ').trim());
}

function parseRssItems(xml, limit = 5) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) && items.length < limit) {
    const block = match[1];
    const title = stripHtml(extractRssTag(block, 'title'));
    const link = stripHtml(extractRssTag(block, 'link'));
    const description =
      extractRssTag(block, 'description') ||
      extractRssTag(block, 'content:encoded') ||
      extractRssTag(block, 'summary');
    const excerpt = firstSentences(stripHtml(description), 2);
    if (!title || !link) continue;
    items.push({ title, link, excerpt });
  }
  return items;
}

module.exports = {
  decodeHtmlEntities,
  stripHtml,
  extractRssTag,
  firstSentences,
  parseRssItems,
};
