import { XMLParser } from 'fast-xml-parser';
import he from 'he';

const RSS_SOURCES = [
  { name: 'Economic Times',    url: 'https://economictimes.indiatimes.com/markets/rss.cms',                 cat: ['market', 'stocks', 'macro'] },
  { name: 'Moneycontrol',      url: 'https://www.moneycontrol.com/rss/banking.xml',                         cat: ['banks'] },
  { name: 'Google News', url: 'https://news.google.com/rss/search?q=RBI+bank+nifty+HDFC+ICICI+SBI&hl=en-IN&gl=IN&ceid=IN:en', cat: ['banks'] },
  { name: 'Yahoo Finance',     url: 'https://finance.yahoo.com/news/rssindex',                             cat: ['global', 'stocks'] },
  { name: 'Reuters Markets',   url: 'https://feeds.reuters.com/reuters/financialNews',                     cat: ['global', 'market'] },
  { name: 'Google News', url: 'https://news.google.com/rss/search?q=fed+rate+nasdaq+crude+oil+india&hl=en-IN&gl=IN&ceid=IN:en', cat: ['global'] },
];

function extractRssItems(xmlStr, sourceName) {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const jsonObj = parser.parse(xmlStr);
    const channel = jsonObj?.rss?.channel || jsonObj?.feed;
    let rawItems = channel?.item || channel?.entry || [];
    if (!Array.isArray(rawItems)) rawItems = [rawItems];

    return rawItems.map(item => {
      let title = item.title ? he.decode(String(item.title).replace(/<[^>]+>/g, '')) : '';
      let text = item.description || item.content || item.summary || '';
      if (typeof text === 'object') text = text['#text'] || '';
      text = he.decode(String(text).replace(/<[^>]+>/g, ''));
      const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
      const link = item.link?.['@_href'] || item.link || '';
      return { title, description: text, pubDate, link: String(link), source: sourceName };
    });
  } catch(e) { return []; }
}

async function fetchRssFeed(source) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(source.url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalalWire/2.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*', 'Cache-Control': 'no-cache' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = extractRssItems(await r.text(), source.name);
    return items;
  } catch(e) { 
    console.error('Failed to fetch', source.name, e.message);
    return []; 
  }
  finally { clearTimeout(timeout); }
}

async function testCat(cat) {
  const sources = RSS_SOURCES.filter(s => s.cat.includes(cat));
  const results = await Promise.allSettled(sources.map(s => fetchRssFeed(s)));
  let allItems  = [];
  results.forEach(r => { if (r.status === 'fulfilled') allItems = allItems.concat(r.value); });
  console.log(`[${cat}] Found ${allItems.length} raw items from ${sources.length} sources.`);
  if (allItems.length > 0) {
    console.log(`[${cat}] Sample:`, allItems[0].title);
  }
}

async function run() {
  await testCat('banks');
  await testCat('global');
}

run();
