async function test() {
  const res = await fetch('https://www.business-standard.com/rss/banking-104.rss');
  const text = await res.text();
  const match = text.match(/<pubDate>(.*?)<\/pubDate>/);
  console.log('pubDate format:', match ? match[1] : 'not found');
}
test();
