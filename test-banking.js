async function fetchSource(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) console.error('Failed', url, res.status);
    const text = await res.text();
    console.log(url, 'Length:', text.length, 'Contains item?', text.includes('<item>'));
  } catch(e) { console.error('Error', url, e.message); }
}

async function run() {
  await fetchSource('https://www.moneycontrol.com/rss/banking.xml');
  await fetchSource('https://www.business-standard.com/rss/banking-104.rss');
}
run();
