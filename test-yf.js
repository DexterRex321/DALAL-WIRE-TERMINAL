import YahooFinance from 'yahoo-finance2';
async function run() {
  const yf = new YahooFinance();
  try {
    const q = await yf.quote('RELIANCE.NS');
    console.log(q.regularMarketPrice);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
