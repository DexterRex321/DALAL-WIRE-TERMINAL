function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanRssText(value) {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRssItems(xml, sourceName) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  return itemBlocks.map(block => {
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    let link = (block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/) || block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || block.match(/<description>(.*?)<\/description>/) || [])[1] || '';
    let via = '';
    const cleanTitle = cleanRssText(title);

    if (sourceName === 'Google News' || String(link).includes('news.google.com')) {
      const originMatch = block.match(/<source[^>]*>(.*?)<\/source>/);
      if (originMatch && originMatch[1]) {
        via = cleanRssText(originMatch[1]);
      }
    }

    return {
      title: cleanTitle,
      description: cleanRssText(desc).substring(0, 500),
      pubDate: pubDate.trim(),
      link: link.trim(),
      source: sourceName,
      via,
    };
  });
}

async function test() {
  const res = await fetch('https://news.google.com/rss/search?q=fed+rate+nasdaq+crude+oil+india&hl=en-IN&gl=IN&ceid=IN:en', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const text = await res.text();
  console.log('Text length:', text.length);
  const items = extractRssItems(text, 'Google News');
  console.log('Items parsed:', items.length);
  if(items.length > 0) {
    console.log(items[0]);
  }
}

test();
