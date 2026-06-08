function extractRssItems(xml, sourceName) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  return itemBlocks.map(block => {
    let title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    let link = (block.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/) || block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    let pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || new Date().toUTCString();
    let desc = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || block.match(/<description>(.*?)<\/description>/) || [])[1] || '';
    
    title = title.replace(/<[^>]+>/g, '').trim();
    desc = desc.replace(/<[^>]+>/g, '').trim();

    return {
      title, link, pubDate, description: desc, source: sourceName
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
