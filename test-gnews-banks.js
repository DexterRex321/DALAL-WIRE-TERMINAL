async function test() {
  const res = await fetch('https://news.google.com/rss/search?q=RBI+bank+nifty+HDFC+ICICI+SBI&hl=en-IN&gl=IN&ceid=IN:en', { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const text = await res.text();
  const match = text.match(/<pubDate>(.*?)<\/pubDate>/g);
  console.log('pubDate format:', match ? match[1] : 'not found');
}
test();
