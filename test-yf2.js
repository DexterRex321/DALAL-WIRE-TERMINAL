import yahooFinance from 'yahoo-finance2';
async function run() {
  try {
    const q = await yahooFinance.quote('RELIANCE.NS');
    console.log(q.regularMarketPrice);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
run();
