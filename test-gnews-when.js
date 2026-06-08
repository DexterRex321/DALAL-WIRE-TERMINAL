async function testUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const text = await res.text();
  const match = text.match(/<pubDate>(.*?)<\/pubDate>/g);
  console.log('Results:', match ? match.length : 0);
  console.log('pubDate format:', match ? match[1] : 'not found');
}
async function test() {
  console.log('sectors:');
  await testUrl('https://news.google.com/rss/search?q=nifty+IT+auto+pharma+sector+when:1d&hl=en-IN&gl=IN&ceid=IN:en');
  console.log('banks:');
  await testUrl('https://news.google.com/rss/search?q=RBI+bank+nifty+HDFC+ICICI+SBI+when:1d&hl=en-IN&gl=IN&ceid=IN:en');
}
test();
