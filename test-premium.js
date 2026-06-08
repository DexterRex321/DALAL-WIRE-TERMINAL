async function testUrl(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
    const text = await res.text();
    const match = text.match(/<pubDate>(.*?)<\/pubDate>/g);
    console.log('URL:', url.substring(0, 80));
    console.log('Results:', match ? match.length : 0);
    if(match) console.log('First date:', match[0]);
  } catch(e) {
    console.error('Error', e.message);
  }
}

async function test() {
  const PREMIUM_SITES = encodeURIComponent('(site:economictimes.indiatimes.com OR site:moneycontrol.com OR site:livemint.com OR site:business-standard.com OR site:bloomberg.com OR site:reuters.com OR site:cnbctv18.com)');
  
  await testUrl(`https://news.google.com/rss/search?q=${encodeURIComponent('(Nifty OR Sensex OR Dalal Street OR BSE OR NSE) AND ')}` + PREMIUM_SITES + encodeURIComponent(' when:1d') + `&hl=en-IN&gl=IN&ceid=IN:en`);
  await testUrl(`https://news.google.com/rss/search?q=${encodeURIComponent('(bank OR RBI OR HDFC OR ICICI OR SBI OR Kotak OR Axis) AND ')}` + PREMIUM_SITES + encodeURIComponent(' when:1d') + `&hl=en-IN&gl=IN&ceid=IN:en`);
}
test();
