async function testUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const text = await res.text();
  const match = text.match(/<pubDate>(.*?)<\/pubDate>/g);
  console.log(url.split('q=')[1].split('&')[0], 'pubDate format:', match ? match[1] : 'not found');
}
async function test() {
  await testUrl('https://news.google.com/rss/search?q=nifty+IT+auto+pharma+sector&hl=en-IN&gl=IN&ceid=IN:en');
  await testUrl('https://news.google.com/rss/search?q=india+inflation+rupee+dollar+FII+DII&hl=en-IN&gl=IN&ceid=IN:en');
  await testUrl('https://news.google.com/rss/search?q=india+quarterly+results+earnings+dividend&hl=en-IN&gl=IN&ceid=IN:en');
  await testUrl('https://news.google.com/rss/search?q=fed+rate+nasdaq+crude+oil+india&hl=en-IN&gl=IN&ceid=IN:en');
}
test();
